// Vérification des mises à jour, côté processus principal, isolée de main.js
// pour être testable sans Electron ni réseau (le `fetch` est injecté). Une seule
// requête, en lecture : la dernière release publiée sur GitHub. Rien n'est
// téléchargé ni installé ici : le résultat propose une adresse, que l'utilisateur
// ouvre lui-même d'un clic (main.js : shell.openExternal, adresse revalidée).
const DEPOT = 'vantaflow/md-reader';
const URL_API = `https://api.github.com/repos/${DEPOT}/releases/latest`;
const URL_RELEASES = `https://github.com/${DEPOT}/releases`;
const DELAI_MS = 8000;
const NOTES_MAX = 6000;
const UNE_JOURNEE_MS = 24 * 60 * 60 * 1000;

// « v1.9.0 », « 1.9.0 », « 1.9.0-beta.1 » ; tout le reste est refusé.
function parserVersion(texte) {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(texte == null ? '' : texte).trim());
  if (!m) return null;
  return { majeure: +m[1], mineure: +m[2], correctif: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

function comparerPre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1; // une version finale est plus récente que sa préversion
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) { if (+a[i] !== +b[i]) return +a[i] < +b[i] ? -1 : 1; }
    else if (na !== nb) return na ? -1 : 1;
    else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// -1, 0 ou 1 ; null si l'une des versions est invalide.
function comparerVersions(a, b) {
  const x = parserVersion(a);
  const y = parserVersion(b);
  if (!x || !y) return null;
  for (const k of ['majeure', 'mineure', 'correctif']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  return comparerPre(x.pre, y.pre);
}

// Seules les adresses https://github.com/vantaflow/md-reader/… sont ouvertes :
// pas d'identifiants, pas de port, nom d'hôte exact, chemin du dépôt.
function urlTelechargementValide(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password) return false;
  return u.pathname === `/${DEPOT}` || u.pathname.startsWith(`/${DEPOT}/`);
}

// Installeur de la plateforme : .dmg arm64 / x64 sur macOS, « Setup … .exe » sur
// Windows. Sans correspondance (ou adresse non valide) : null, l'appelant se
// replie sur la page de la release.
function choisirAsset(assets, plateforme, arch) {
  if (!Array.isArray(assets)) return null;
  const valides = assets.filter((a) => a && typeof a.name === 'string' && urlTelechargementValide(a.browser_download_url));
  let trouve = null;
  if (plateforme === 'darwin') {
    const dmg = valides.filter((a) => /\.dmg$/i.test(a.name));
    trouve = arch === 'arm64' ? dmg.find((a) => /arm64/i.test(a.name))
      : arch === 'x64' ? (dmg.find((a) => /x64|x86_64|intel/i.test(a.name)) || dmg.find((a) => !/arm64/i.test(a.name)))
        : null;
  } else if (plateforme === 'win32') {
    trouve = valides.find((a) => /setup/i.test(a.name) && /\.exe$/i.test(a.name));
  }
  return trouve ? { nom: trouve.name, url: trouve.browser_download_url, taille: Number.isFinite(trouve.size) ? trouve.size : null } : null;
}

// Au démarrage : réglage activé et dernière tentative il y a au moins un jour
// (ou horloge reculée).
function verificationDue({ actif, derniere, maintenant = Date.now() }) {
  if (!actif) return false;
  if (!Number.isFinite(derniere) || derniere <= 0) return true;
  if (derniere > maintenant) return true;
  return maintenant - derniere >= UNE_JOURNEE_MS;
}

function interpreter(donnees, { versionActuelle, plateforme, arch }) {
  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees) || typeof donnees.tag_name !== 'string') {
    return { statut: 'erreur', message: 'Réponse de GitHub inattendue.' };
  }
  const version = parserVersion(donnees.tag_name);
  if (!version) return { statut: 'erreur', message: `Numéro de version de la release illisible : « ${donnees.tag_name.slice(0, 40)} ».` };
  const cmp = comparerVersions(versionActuelle, donnees.tag_name);
  if (cmp === null) return { statut: 'erreur', message: 'Numéro de version de l’application illisible.' };
  const nomVersion = donnees.tag_name.trim().replace(/^v/, '');
  if (cmp >= 0) return { statut: 'a-jour', versionActuelle, derniere: nomVersion };
  const page = urlTelechargementValide(donnees.html_url) ? donnees.html_url : URL_RELEASES;
  const asset = choisirAsset(donnees.assets, plateforme, arch);
  return {
    statut: 'disponible',
    versionActuelle,
    version: nomVersion,
    titre: typeof donnees.name === 'string' ? donnees.name.slice(0, 200) : '',
    notes: typeof donnees.body === 'string' ? donnees.body.slice(0, NOTES_MAX) : '',
    publieLe: typeof donnees.published_at === 'string' ? donnees.published_at : null,
    asset,
    urlPage: page,
    url: asset ? asset.url : page,
  };
}

async function verifier({ fetch: fetchImpl = (typeof fetch === 'function' ? fetch : null), versionActuelle, plateforme, arch, delaiMs = DELAI_MS } = {}) {
  if (typeof fetchImpl !== 'function') return { statut: 'erreur', message: 'Accès réseau indisponible.' };
  const controleur = typeof AbortController === 'function' ? new AbortController() : null;
  const minuteur = controleur ? setTimeout(() => controleur.abort(), delaiMs) : null;
  try {
    let res;
    try {
      res = await fetchImpl(URL_API, {
        headers: { 'User-Agent': `MD-Reader/${versionActuelle}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: controleur ? controleur.signal : undefined,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { statut: 'erreur', message: 'Délai dépassé : GitHub ne répond pas.' };
      return { statut: 'erreur', message: 'Impossible de joindre GitHub : ' + ((e && (e.cause && e.cause.code ? e.cause.code : e.message)) || 'erreur réseau') };
    }
    const entete = (n) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(n) : null);
    if (res.status === 404) return { statut: 'aucune-release' };
    if (res.status === 429 || (res.status === 403 && entete('x-ratelimit-remaining') === '0')) {
      const reset = Number(entete('x-ratelimit-reset'));
      return { statut: 'limite', message: 'Limite de requêtes de GitHub atteinte, réessayez plus tard.', reessayerApres: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null };
    }
    if (!res.ok) return { statut: 'erreur', message: `GitHub a répondu avec le code ${res.status}.` };
    let donnees;
    try { donnees = JSON.parse(await res.text()); } catch { return { statut: 'erreur', message: 'Réponse de GitHub illisible (JSON invalide).' }; }
    return interpreter(donnees, { versionActuelle, plateforme, arch });
  } catch (e) {
    return { statut: 'erreur', message: 'Vérification impossible : ' + (e && e.message ? e.message : e) };
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

// Cœur des deux canaux IPC de main.js, ici pour être testé tel quel.
// `charge` (renderer, non fiable) : { demarrage?: bool, actif?: bool, derniere?: nombre }.
// Au démarrage, la vérification n'a lieu que si le réglage est actif et que la
// dernière tentative date d'au moins un jour ; sinon aucune requête n'est faite.
let enCours = null;
async function traiter(charge, options) {
  const c = charge && typeof charge === 'object' ? charge : {};
  if (c.demarrage === true && !verificationDue({ actif: c.actif === true, derniere: typeof c.derniere === 'number' ? c.derniere : 0, maintenant: (options && options.maintenant) || Date.now() })) {
    return { statut: 'pas-necessaire' };
  }
  // Une seule requête à la fois : les appels simultanés partagent le résultat.
  if (!enCours) enCours = verifier(options).finally(() => { enCours = null; });
  return enCours;
}

// Ouvre l'adresse dans le navigateur par défaut, seulement si elle est valide.
async function ouvrirTelechargement(url, ouvrirExterne) {
  if (!urlTelechargementValide(url)) return { ok: false, erreur: 'Adresse refusée : seules les pages du dépôt vantaflow/md-reader sont ouvertes.' };
  try { await ouvrirExterne(url); return { ok: true }; }
  catch (e) { return { ok: false, erreur: 'Impossible d’ouvrir le navigateur : ' + (e && e.message ? e.message : e) }; }
}

module.exports = { traiter, ouvrirTelechargement, URL_API, URL_RELEASES, DEPOT, parserVersion, comparerVersions, choisirAsset, urlTelechargementValide, verificationDue, interpreter, verifier, UNE_JOURNEE_MS };

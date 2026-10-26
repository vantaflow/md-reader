// Rechercher/remplacer dans le texte d'un document : logique pure, sans accès
// disque (donnees.js lit et écrit les fichiers, main.js expose l'IPC). Testable
// sans Electron. Les expressions invalides ne lèvent jamais d'exception vers
// l'appelant : elles produisent un objet { erreur }.
const crypto = require('crypto');
const vm = require('vm');

const LIMITES = {
  rechercheMax: 500,
  remplacementMax: 2000,
  occurrencesParFichier: 500,
  occurrencesTotal: 5000,
  tailleFichierMax: 2 * 1024 * 1024,
  fichiersMax: 500,
  contexteMax: 300,
  delaiMs: 1500, // temps maximal d'une recherche dans un document (expressions catastrophiques)
};

const MOT_U = '[\\p{L}\\p{N}_]';
const MOT_ASCII = '[A-Za-z0-9_\\u00C0-\\u024F]';

// Assainit les paramètres reçus du renderer.
function normaliserParametres(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    recherche: typeof o.recherche === 'string' ? o.recherche : '',
    remplacement: typeof o.remplacement === 'string' ? o.remplacement : '',
    casse: o.casse === true,
    motEntier: o.motEntier === true,
    regex: o.regex === true,
  };
}

// Construit l'expression de recherche : { re } ou { erreur }. Insensible à la
// casse par défaut ; `^` et `$` valent par ligne ; refuse un motif vide ou qui
// reconnaît la chaîne vide (il « trouverait » une infinité de positions).
function construireRegex(parametres) {
  const p = normaliserParametres(parametres);
  if (!p.recherche) return { erreur: 'Saisissez le texte à rechercher.' };
  if (p.recherche.length > LIMITES.rechercheMax) return { erreur: `La recherche dépasse ${LIMITES.rechercheMax} caractères.` };
  if (p.remplacement.length > LIMITES.remplacementMax) return { erreur: `Le remplacement dépasse ${LIMITES.remplacementMax} caractères.` };
  const source = p.regex ? p.recherche : p.recherche.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = p.casse ? 'gm' : 'gim';
  const compiler = (unicode) => {
    const mot = unicode ? MOT_U : MOT_ASCII;
    const corps = p.motEntier ? `(?<!${mot})(?:${source})(?!${mot})` : source;
    return new RegExp(corps, base + (unicode ? 'u' : ''));
  };
  let re;
  try { re = compiler(true); }
  catch {
    // Certaines expressions courantes (`\-`, `\_`…) ne sont valides que sans le drapeau « u ».
    try { re = compiler(false); }
    catch (e) { return { erreur: 'Expression régulière invalide : ' + String(e && e.message ? e.message : e).replace(/^Invalid regular expression: /, '') }; }
  }
  let vide = false;
  try { vide = new RegExp(re.source, re.flags.replace('g', '')).test(''); } catch { vide = false; }
  if (vide) return { erreur: 'L’expression correspond à une chaîne vide : précisez-la.' };
  return { re };
}

// Remplacement d'une correspondance : `$$`, `$&`, `$1`…`$99`, `$<nom>` en mode
// expression régulière ; en mode texte, le remplacement est pris tel quel.
function expandre(remplacement, m, regex) {
  if (!regex) return remplacement;
  return remplacement.replace(/\$(\$|&|\d{1,2}|<[^>]*>)/g, (tout, k) => {
    if (k === '$') return '$';
    if (k === '&') return m[0];
    if (k[0] === '<') return (m.groups && m.groups[k.slice(1, -1)]) || '';
    const n = Number(k);
    if (n >= 1 && n < m.length) return m[n] === undefined ? '' : m[n];
    if (k.length === 2 && Number(k[0]) >= 1 && Number(k[0]) < m.length) return (m[Number(k[0])] || '') + k[1];
    return tout;
  });
}

function tronquer(texte) {
  return texte.length > LIMITES.contexteMax ? texte.slice(0, LIMITES.contexteMax) + '…' : texte;
}

// Occurrences dans `contenu` : [{ indice, debut, fin, ligne (1-based), avant,
// apres }] ; `avant` / `apres` sont les lignes complètes concernées, avant et
// après remplacement. { occurrences, tronque } ; `tronque` vaut vrai si la
// borne `max` a été atteinte.
function trouverOccurrences(contenu, re, parametres, max = LIMITES.occurrencesParFichier, delaiMs = LIMITES.delaiMs) {
  const p = normaliserParametres(parametres);
  const texte = String(contenu);
  const occurrences = [];
  let tronque = false;
  // La recherche s'exécute dans un contexte `vm` avec un délai : une expression
  // à retour arrière catastrophique (`(a+)+$`) est interrompue au lieu de geler
  // le processus principal.
  let trouvees;
  try {
    const contexte = vm.createContext({ re, texte, max, sortie: [] });
    re.lastIndex = 0;
    vm.runInContext(
      `let m; while ((m = re.exec(texte))) {
        if (m[0] === '') { re.lastIndex += 1; continue; }
        if (sortie.length > max) break;
        sortie.push({ index: m.index, groupes: Array.from(m), nommes: m.groups ? Object.assign({}, m.groups) : undefined });
      }`,
      contexte,
      { timeout: Math.max(1, delaiMs) },
    );
    trouvees = Array.from(contexte.sortie);
    if (trouvees.length > max) { tronque = true; trouvees = trouvees.slice(0, max); }
  } catch (e) {
    re.lastIndex = 0;
    if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return { occurrences: [], tronque: false, delaiDepasse: true };
    throw e;
  }
  re.lastIndex = 0;
  for (const t of trouvees) {
    const m = Object.assign(Array.from(t.groupes), { index: t.index, groups: t.nommes });
    const debut = m.index;
    const fin = debut + m[0].length;
    const remplace = expandre(p.remplacement, m, p.regex);
    const debutLigne = texte.lastIndexOf('\n', debut - 1) + 1;
    let finLigne = texte.indexOf('\n', fin);
    if (finLigne === -1) finLigne = texte.length;
    const ligne = texte.slice(0, debut).split('\n').length;
    const nettoyer = (s) => s.replace(/\r$/, '');
    occurrences.push({
      indice: occurrences.length,
      debut,
      fin,
      remplace,
      ligne,
      avant: tronquer(nettoyer(texte.slice(debutLigne, finLigne))),
      apres: tronquer(nettoyer(texte.slice(debutLigne, debut) + remplace + texte.slice(fin, finLigne))),
    });
  }
  return { occurrences, tronque };
}

// Applique les occurrences dont l'indice figure dans `indices` (les autres
// restent inchangées). Renvoie { contenu, remplacees }.
function appliquer(contenu, occurrences, indices) {
  const choisis = new Set(indices);
  let sortie = '';
  let curseur = 0;
  let remplacees = 0;
  for (const o of occurrences) {
    if (!choisis.has(o.indice)) continue;
    sortie += contenu.slice(curseur, o.debut) + o.remplace;
    curseur = o.fin;
    remplacees += 1;
  }
  return { contenu: sortie + contenu.slice(curseur), remplacees };
}

const empreinte = (contenu) => crypto.createHash('sha1').update(String(contenu)).digest('hex');

module.exports = { LIMITES, normaliserParametres, construireRegex, expandre, trouverOccurrences, appliquer, empreinte };

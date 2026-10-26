// Vérification des mises à jour (miseajour.js) : toutes les branches avec un
// `fetch` simulé. AUCUN appel réel à GitHub n'est fait par ces tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../miseajour.js');

const base = 'https://github.com/vantaflow/md-reader/releases';
const release = (extra = {}) => ({
  tag_name: 'v1.9.0', name: 'MD Reader 1.9.0', body: '- nouveautés', published_at: '2026-11-01T10:00:00Z',
  html_url: `${base}/tag/v1.9.0`,
  assets: [
    { name: 'MD Reader-1.9.0-arm64.dmg', browser_download_url: `${base}/download/v1.9.0/MD%20Reader-1.9.0-arm64.dmg`, size: 100 },
    { name: 'MD Reader-1.9.0-x64.dmg', browser_download_url: `${base}/download/v1.9.0/MD%20Reader-1.9.0-x64.dmg`, size: 101 },
    { name: 'MD Reader Setup 1.9.0.exe', browser_download_url: `${base}/download/v1.9.0/MD%20Reader%20Setup%201.9.0.exe`, size: 102 },
    { name: 'MD Reader Setup 1.9.0.exe.blockmap', browser_download_url: `${base}/download/v1.9.0/x.blockmap` },
  ],
  ...extra,
});
const reponse = (statut, corps, entetes = {}) => ({
  status: statut, ok: statut >= 200 && statut < 300,
  headers: { get: (n) => entetes[n.toLowerCase()] ?? null },
  text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
});
const verif = (fetchSimule, extra = {}) => m.verifier({ fetch: fetchSimule, versionActuelle: '1.8.0', plateforme: 'darwin', arch: 'arm64', ...extra });

test('semver : analyse, ordre, préversions, invalides', () => {
  assert.deepEqual(m.parserVersion('v1.9.0'), { majeure: 1, mineure: 9, correctif: 0, pre: [] });
  assert.equal(m.parserVersion('1.9'), null);
  assert.equal(m.parserVersion('abc'), null);
  assert.equal(m.parserVersion(undefined), null);
  assert.equal(m.comparerVersions('1.8.0', '1.9.0'), -1);
  assert.equal(m.comparerVersions('1.10.0', '1.9.0'), 1);
  assert.equal(m.comparerVersions('2.0.0', '1.99.99'), 1);
  assert.equal(m.comparerVersions('v1.9.0', '1.9.0'), 0);
  assert.equal(m.comparerVersions('1.9.0-beta.1', '1.9.0'), -1);
  assert.equal(m.comparerVersions('1.9.0', '1.9.0-rc.1'), 1);
  assert.equal(m.comparerVersions('1.9.0-beta.2', '1.9.0-beta.10'), -1);
  assert.equal(m.comparerVersions('1.9.0-alpha', '1.9.0-beta'), -1);
  assert.equal(m.comparerVersions('1.9.0-1', '1.9.0-alpha'), -1);
  assert.equal(m.comparerVersions('1.9.0', 'x'), null);
});

test('assets : dmg arm64 / x64 sur macOS, Setup .exe sur Windows, sinon null', () => {
  const a = release().assets;
  assert.match(m.choisirAsset(a, 'darwin', 'arm64').nom, /arm64\.dmg$/);
  assert.match(m.choisirAsset(a, 'darwin', 'x64').nom, /x64\.dmg$/);
  assert.equal(m.choisirAsset(a, 'win32', 'x64').nom, 'MD Reader Setup 1.9.0.exe');
  assert.equal(m.choisirAsset(a, 'linux', 'x64'), null);
  assert.equal(m.choisirAsset(a, 'darwin', 'ia32'), null);
  assert.equal(m.choisirAsset([], 'darwin', 'arm64'), null);
  assert.equal(m.choisirAsset(null, 'darwin', 'arm64'), null);
  assert.equal(m.choisirAsset([a[0]], 'darwin', 'x64'), null); // pas de repli arm64 -> x64
  // Un asset dont l'adresse sort du dépôt est ignoré.
  assert.equal(m.choisirAsset([{ name: 'a-arm64.dmg', browser_download_url: 'https://evil.example/a-arm64.dmg' }], 'darwin', 'arm64'), null);
});

test('adresses : seulement https://github.com/vantaflow/md-reader/…', () => {
  const ok = m.urlTelechargementValide;
  assert.equal(ok(`${base}/tag/v1.9.0`), true);
  assert.equal(ok('https://github.com/vantaflow/md-reader'), true);
  for (const mauvaise of [
    'http://github.com/vantaflow/md-reader/releases', 'https://github.com/vantaflow/md-reader-evil/releases',
    'https://github.com/autre/md-reader/releases', 'https://github.com.evil.com/vantaflow/md-reader/',
    'https://evil.com/github.com/vantaflow/md-reader/', 'https://user:pw@github.com/vantaflow/md-reader/',
    'https://github.com:444/vantaflow/md-reader/', 'https://api.github.com/vantaflow/md-reader/', 'javascript:alert(1)',
    'file:///etc/passwd', '', null, 42, 'pas une url', 'https://github.com/vantaflow/md-reader/../autre',
  ]) {
    // `..` est résolu par URL : le chemin final sort alors du dépôt.
    assert.equal(ok(mauvaise), false, String(mauvaise));
  }
});

test('requête : adresse de l’API, User-Agent, Accept, signal de délai', async () => {
  let appel;
  await verif(async (url, opts) => { appel = { url, opts }; return reponse(200, release()); });
  assert.equal(appel.url, 'https://api.github.com/repos/vantaflow/md-reader/releases/latest');
  assert.equal(appel.opts.headers['User-Agent'], 'MD-Reader/1.8.0');
  assert.match(appel.opts.headers.Accept, /github/);
  assert.ok(appel.opts.signal && typeof appel.opts.signal.aborted === 'boolean');
});

test('nouvelle version : asset de la plateforme, notes, page de la release', async () => {
  const r = await verif(async () => reponse(200, release()));
  assert.equal(r.statut, 'disponible');
  assert.equal(r.version, '1.9.0');
  assert.equal(r.notes, '- nouveautés');
  assert.match(r.url, /arm64\.dmg$/);
  assert.equal(r.urlPage, `${base}/tag/v1.9.0`);
  const w = await verif(async () => reponse(200, release()), { plateforme: 'win32', arch: 'x64' });
  assert.match(w.url, /Setup%201\.9\.0\.exe$/);
});

test('nouvelle version sans installeur pour la plateforme : repli sur la page de la release', async () => {
  const r = await verif(async () => reponse(200, release({ assets: [] })));
  assert.equal(r.statut, 'disponible');
  assert.equal(r.asset, null);
  assert.equal(r.url, `${base}/tag/v1.9.0`);
  const l = await verif(async () => reponse(200, release()), { plateforme: 'linux', arch: 'x64' });
  assert.equal(l.url, `${base}/tag/v1.9.0`);
});

test('html_url suspecte : repli sur la liste des releases du dépôt', async () => {
  const r = await verif(async () => reponse(200, release({ assets: undefined, html_url: 'https://evil.example/x' })));
  assert.equal(r.url, m.URL_RELEASES);
});

test('à jour : même version ou version locale plus récente', async () => {
  assert.equal((await verif(async () => reponse(200, release()), { versionActuelle: '1.9.0' })).statut, 'a-jour');
  assert.equal((await verif(async () => reponse(200, release()), { versionActuelle: '2.0.0' })).statut, 'a-jour');
});

test('404 : aucune release publiée', async () => {
  assert.deepEqual(await verif(async () => reponse(404, { message: 'Not Found' })), { statut: 'aucune-release' });
});

test('limitation de débit : 403 épuisé et 429', async () => {
  const a = await verif(async () => reponse(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }));
  assert.equal(a.statut, 'limite');
  assert.equal(a.reessayerApres, 1800000000000);
  assert.equal((await verif(async () => reponse(429, {}))).statut, 'limite');
  // Un 403 sans quota épuisé est une erreur ordinaire.
  assert.equal((await verif(async () => reponse(403, {}, { 'x-ratelimit-remaining': '10' }))).statut, 'erreur');
});

test('erreurs : HTTP 500, réseau, JSON invalide, forme inattendue, version illisible', async () => {
  const e500 = await verif(async () => reponse(500, 'oups'));
  assert.equal(e500.statut, 'erreur'); assert.match(e500.message, /500/);
  const res = await verif(async () => { const e = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; });
  assert.equal(res.statut, 'erreur'); assert.match(res.message, /ENOTFOUND/);
  const json = await verif(async () => reponse(200, '<html>pas du json'));
  assert.equal(json.statut, 'erreur'); assert.match(json.message, /JSON/);
  assert.equal((await verif(async () => reponse(200, []))).statut, 'erreur');
  assert.equal((await verif(async () => reponse(200, { nom: 'x' }))).statut, 'erreur');
  assert.equal((await verif(async () => reponse(200, 'null'))).statut, 'erreur');
  const vers = await verif(async () => reponse(200, release({ tag_name: 'nightly' })));
  assert.equal(vers.statut, 'erreur'); assert.match(vers.message, /nightly/);
  assert.equal((await verif(async () => reponse(200, release()), { versionActuelle: 'inconnue' })).statut, 'erreur');
  assert.equal((await m.verifier({ fetch: null, versionActuelle: '1.8.0' })).statut, 'erreur');
});

test('délai : une requête qui ne répond pas est interrompue', async () => {
  const r = await verif((url, opts) => new Promise((_ok, ko) => {
    opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; ko(e); });
  }), { delaiMs: 30 });
  assert.equal(r.statut, 'erreur');
  assert.match(r.message, /Délai/);
});

test('notes de version bornées', async () => {
  const r = await verif(async () => reponse(200, release({ body: 'x'.repeat(50000) })));
  assert.equal(r.notes.length, 6000);
});

test('au plus une vérification par jour au démarrage', () => {
  const j = m.UNE_JOURNEE_MS;
  const t = 1800000000000;
  assert.equal(m.verificationDue({ actif: false, derniere: 0, maintenant: t }), false);
  assert.equal(m.verificationDue({ actif: true, derniere: 0, maintenant: t }), true);
  assert.equal(m.verificationDue({ actif: true, derniere: t - 1000, maintenant: t }), false);
  assert.equal(m.verificationDue({ actif: true, derniere: t - j + 1, maintenant: t }), false);
  assert.equal(m.verificationDue({ actif: true, derniere: t - j, maintenant: t }), true);
  assert.equal(m.verificationDue({ actif: true, derniere: t + 5000, maintenant: t }), true); // horloge reculée
  assert.equal(m.verificationDue({ actif: true, derniere: NaN, maintenant: t }), true);
});

test('traiter : au démarrage, aucune requête si le réglage est désactivé ou si la dernière vérification est récente', async () => {
  let appels = 0;
  const f = async () => { appels++; return reponse(200, release()); };
  const opts = { fetch: f, versionActuelle: '1.8.0', plateforme: 'darwin', arch: 'arm64', maintenant: 1800000000000 };
  assert.deepEqual(await m.traiter({ demarrage: true, actif: false, derniere: 0 }, opts), { statut: 'pas-necessaire' });
  assert.deepEqual(await m.traiter({ demarrage: true, actif: true, derniere: 1800000000000 - 1000 }, opts), { statut: 'pas-necessaire' });
  assert.deepEqual(await m.traiter({ demarrage: true }, opts), { statut: 'pas-necessaire' });
  assert.equal(appels, 0);
  assert.equal((await m.traiter({ demarrage: true, actif: true, derniere: 0 }, opts)).statut, 'disponible');
  assert.equal(appels, 1);
  // Vérification manuelle : toujours effectuée, charge invalide tolérée.
  assert.equal((await m.traiter({}, opts)).statut, 'disponible');
  assert.equal((await m.traiter(null, opts)).statut, 'disponible');
  assert.equal((await m.traiter('x', opts)).statut, 'disponible');
  assert.equal(appels, 4);
});

test('traiter : des appels simultanés partagent une seule requête', async () => {
  let appels = 0;
  const f = async () => { appels++; await new Promise((r) => setTimeout(r, 20)); return reponse(200, release()); };
  const opts = { fetch: f, versionActuelle: '1.8.0', plateforme: 'darwin', arch: 'arm64' };
  const [a, b] = await Promise.all([m.traiter({}, opts), m.traiter({}, opts)]);
  assert.equal(appels, 1);
  assert.equal(a.statut, 'disponible');
  assert.equal(b.statut, 'disponible');
  assert.equal((await m.traiter({}, opts)).statut, 'disponible');
  assert.equal(appels, 2);
});

test('ouvrirTelechargement : adresse valide ouverte, invalide refusée sans ouvrir, échec d’ouverture signalé', async () => {
  const ouvertes = [];
  const ouvrir = async (u) => { ouvertes.push(u); };
  assert.deepEqual(await m.ouvrirTelechargement(`${base}/tag/v1.9.0`, ouvrir), { ok: true });
  const refus = await m.ouvrirTelechargement('https://evil.example/x', ouvrir);
  assert.equal(refus.ok, false);
  assert.equal((await m.ouvrirTelechargement(undefined, ouvrir)).ok, false);
  assert.deepEqual(ouvertes, [`${base}/tag/v1.9.0`]);
  const echec = await m.ouvrirTelechargement(`${base}/tag/v1.9.0`, async () => { throw new Error('pas de navigateur'); });
  assert.equal(echec.ok, false);
  assert.match(echec.erreur, /pas de navigateur/);
});

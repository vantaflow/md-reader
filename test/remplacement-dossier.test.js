// IPC bornées du dossier ouvert (donnees.js) : aperçu et application du
// rechercher/remplacer. Aucun Electron : vrais fichiers temporaires.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const donnees = require('../donnees.js');

let tmp;
let racine;
let dehors;
const ecrire = (rel, contenu, base = racine) => { const p = path.join(base, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, contenu); return p; };
const lire = (rel) => fs.readFileSync(path.join(racine, rel), 'utf8');

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-dossier-'));
  racine = path.join(tmp, 'notes');
  dehors = path.join(tmp, 'dehors');
  fs.mkdirSync(racine);
  fs.mkdirSync(dehors);
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('apercuRemplacement : occurrences par fichier avec avant/après, empreinte', async () => {
  ecrire('r1.md', 'Le chat dort.\nUn Chat joue.\n');
  ecrire('r2.md', 'Rien.\n');
  const r = await donnees.apercuRemplacement(racine, { recherche: 'chat', remplacement: 'chien' });
  const f = r.fichiers.find((x) => x.rel === 'r1.md');
  assert.ok(f);
  assert.equal(r.fichiers.some((x) => x.rel === 'r2.md'), false);
  assert.deepEqual(f.occurrences.map((o) => [o.indice, o.ligne, o.avant, o.apres]), [[0, 1, 'Le chat dort.', 'Le chien dort.'], [1, 2, 'Un Chat joue.', 'Un chien joue.']]);
  assert.match(f.empreinte, /^[0-9a-f]{40}$/);
  assert.equal(lire('r1.md'), 'Le chat dort.\nUn Chat joue.\n'); // lecture seule
  assert.equal(f.occurrences[0].debut, undefined);
});

test('apercuRemplacement : regex invalide = erreur, jamais d’exception', async () => {
  const r = await donnees.apercuRemplacement(racine, { recherche: '(', regex: true });
  assert.equal(typeof r.erreur, 'string');
  assert.deepEqual(await donnees.apercuRemplacement(racine, { recherche: '' }), { erreur: 'Saisissez le texte à rechercher.' });
});

test('apercuRemplacement : bornes (fichier trop gros ignoré, total d’occurrences)', async () => {
  ecrire('gros.md', 'chat '.repeat(500000)); // 2,5 Mo
  const r = await donnees.apercuRemplacement(racine, { recherche: 'chat', remplacement: 'x' });
  assert.ok(r.ignores.includes('gros.md'));
  fs.unlinkSync(path.join(racine, 'gros.md'));
  ecrire('beaucoup.md', 'chat\n'.repeat(1000));
  const b = await donnees.apercuRemplacement(racine, { recherche: 'chat', remplacement: 'x' });
  const f = b.fichiers.find((x) => x.rel === 'beaucoup.md');
  assert.equal(f.occurrences.length, 500);
  assert.equal(f.tronque, true);
  assert.equal(b.tronque, true);
  fs.unlinkSync(path.join(racine, 'beaucoup.md'));
});

test('appliquerRemplacement : n’applique que les occurrences choisies, atomiquement', async () => {
  const params = { recherche: 'chat', remplacement: 'chien' };
  const ap = await donnees.apercuRemplacement(racine, params);
  const f = ap.fichiers.find((x) => x.rel === 'r1.md');
  const res = await donnees.appliquerRemplacement(racine, params, [{ rel: 'r1.md', empreinte: f.empreinte, indices: [1] }]);
  assert.deepEqual(res.sautes, []);
  assert.deepEqual(res.modifies.map((m) => [m.rel, m.remplacements]), [['r1.md', 1]]);
  assert.equal(lire('r1.md'), 'Le chat dort.\nUn chien joue.\n');
  assert.deepEqual(fs.readdirSync(racine).filter((n) => n.endsWith('.tmp')), []);
});

test('appliquerRemplacement : un fichier modifié depuis l’aperçu est sauté', async () => {
  ecrire('m.md', 'chat 1\n');
  const params = { recherche: 'chat', remplacement: 'chien' };
  const ap = await donnees.apercuRemplacement(racine, params);
  const f = ap.fichiers.find((x) => x.rel === 'm.md');
  fs.writeFileSync(path.join(racine, 'm.md'), 'chat 1 modifié ailleurs\n');
  const res = await donnees.appliquerRemplacement(racine, params, [{ rel: 'm.md', empreinte: f.empreinte, indices: [0] }]);
  assert.deepEqual(res.modifies, []);
  assert.deepEqual(res.sautes, [{ rel: 'm.md', raison: 'modifié depuis l’aperçu' }]);
  assert.equal(lire('m.md'), 'chat 1 modifié ailleurs\n');
});

test('appliquerRemplacement : refuse tout chemin hors du dossier ouvert', async () => {
  const victime = ecrire('victime.md', 'chat\n', dehors);
  const params = { recherche: 'chat', remplacement: 'chien' };
  const empreinte = require('../remplacement.js').empreinte('chat\n');
  const tentatives = ['../dehors/victime.md', victime, '..', '', 'sous/../../dehors/victime.md', 'r1.txt', 'inexistant.md', 42, null];
  const res = await donnees.appliquerRemplacement(racine, params, tentatives.map((rel) => ({ rel, empreinte, indices: [0] })));
  assert.deepEqual(res.modifies, []);
  assert.equal(res.sautes.length, tentatives.length);
  assert.equal(fs.readFileSync(victime, 'utf8'), 'chat\n');
});

test('appliquerRemplacement : un lien symbolique vers l’extérieur est refusé', { skip: process.platform === 'win32' }, async () => {
  const victime = ecrire('lien.md', 'chat\n', dehors);
  fs.symlinkSync(victime, path.join(racine, 'lien.md'));
  const params = { recherche: 'chat', remplacement: 'chien' };
  const res = await donnees.appliquerRemplacement(racine, params, [{ rel: 'lien.md', empreinte: require('../remplacement.js').empreinte('chat\n'), indices: [0] }]);
  assert.deepEqual(res.modifies, []);
  assert.equal(fs.readFileSync(victime, 'utf8'), 'chat\n');
  fs.unlinkSync(path.join(racine, 'lien.md'));
});

test('appliquerRemplacement : paramètres invalides', async () => {
  assert.equal(typeof (await donnees.appliquerRemplacement(racine, { recherche: '(', regex: true }, [])).erreur, 'string');
  assert.equal(typeof (await donnees.appliquerRemplacement(racine, { recherche: 'a' }, 'pas un tableau')).erreur, 'string');
  const vide = await donnees.appliquerRemplacement(racine, { recherche: 'a' }, [{ rel: 'r1.md', empreinte: 'x', indices: [] }]);
  assert.deepEqual(vide, { modifies: [], sautes: [] });
  await assert.rejects(donnees.appliquerRemplacement('relatif', { recherche: 'a' }, []));
});

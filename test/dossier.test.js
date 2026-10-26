// IPC bornées du dossier ouvert (donnees.js) : tags et rétroliens.
// Aucun Electron : vrais fichiers temporaires.
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

test('scannerTags : tags du front-matter, fichiers sans tags absents, dossiers cachés ignorés', async () => {
  ecrire('a.md', '---\ntags: [projet, idée]\n---\n# A\n');
  ecrire('sous/b.md', '---\ntags:\n  - Projet\n  - rh\n---\ntexte\n');
  ecrire('c.md', '# sans tags\n');
  ecrire('.cache/d.md', '---\ntags: [secret]\n---\n');
  ecrire('e.txt', '---\ntags: [x]\n---\n');
  const r = await donnees.scannerTags(racine);
  assert.deepEqual(r.fichiers.map((f) => [f.rel, f.tags]), [['a.md', ['projet', 'idée']], ['sous/b.md', ['Projet', 'rh']]]);
  assert.equal(r.fichiers[0].chemin, path.join(racine, 'a.md'));
  await assert.rejects(donnees.scannerTags('relatif/dossier'));
  await assert.rejects(donnees.scannerTags(path.join(tmp, 'inexistant')));
});

test('trouverRetroliens : [[nom]], lien relatif, extrait ; pas de faux positifs', async () => {
  ecrire('cible.md', '# Cible\n');
  ecrire('x.md', 'Intro\nVoir [[cible]] pour la suite.\n');
  ecrire('sous/y.md', 'Un [lien](../cible.md) et [[Cible|alias]].\n');
  ecrire('z.md', 'Rien ici, ou `[[cible]]` en code.\n');
  ecrire('w.md', '[[cible autre]] [lien](autre.md)\n');
  const r = await donnees.trouverRetroliens(racine, path.join(racine, 'cible.md'));
  assert.equal(r.cible, 'cible.md');
  assert.deepEqual(r.retroliens.map((x) => [x.rel, x.nombre, x.ligne]), [['sous/y.md', 2, 1], ['x.md', 1, 2]]);
  assert.match(r.retroliens[1].extrait, /Voir \[\[cible\]\]/);
});

test('trouverRetroliens : cible hors dossier ou chemin invalide refusés', async () => {
  const hors = ecrire('cible.md', '# x', dehors);
  await assert.rejects(donnees.trouverRetroliens(racine, hors), /hors du dossier/);
  await assert.rejects(donnees.trouverRetroliens(racine, 'cible.md'), /invalide/);
  await assert.rejects(donnees.trouverRetroliens(racine, path.join(racine, '..', 'dehors', 'cible.md')), /hors du dossier/);
});

test('listerMdRelatifs : comportement conservé', async () => {
  const r = await donnees.listerMdRelatifs(racine);
  assert.ok(r.fichiers.includes('a.md') && r.fichiers.includes('sous/b.md'));
  assert.equal(r.fichiers.includes('.cache/d.md'), false);
  assert.equal(r.fichiers.includes('e.txt'), false);
});

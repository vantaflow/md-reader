// Historique des versions : stockage disque (historique.js) et diff ligne à
// ligne (renderer/lib/diff.js). Aucun Electron : vrais fichiers temporaires.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const historique = require('../historique.js');
const diff = require('../renderer/lib/diff.js');

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-histo-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const doc = '/Users/x/notes/a.md';
const t = (n) => () => new Date(Date.UTC(2026, 9, 26, 10, 0, 0, n));

test('ajouter : écrit userData/historique/<hash>/<horodatage>.md', async () => {
  const r = await historique.ajouter(tmp, doc, '# V1\n', { maintenant: t(1) });
  assert.equal(r.ajoute, true);
  const dossier = historique.dossierDe(tmp, doc);
  assert.ok(dossier.startsWith(path.join(tmp, 'historique') + path.sep));
  assert.match(path.basename(dossier), /^[0-9a-f]{16,}$/);
  const fichiers = fs.readdirSync(dossier);
  assert.equal(fichiers.length, 1);
  assert.match(fichiers[0], /^\d{8}T\d{9}Z\.md$/);
  assert.equal(fs.readFileSync(path.join(dossier, fichiers[0]), 'utf8'), '# V1\n');
});

test('ajouter : contenu identique au dernier = dédoublonné', async () => {
  const r = await historique.ajouter(tmp, doc, '# V1\n', { maintenant: t(2) });
  assert.equal(r.ajoute, false);
  assert.equal((await historique.lister(tmp, doc)).length, 1);
  const r2 = await historique.ajouter(tmp, doc, '# V2\n', { maintenant: t(3) });
  assert.equal(r2.ajoute, true);
  // Revenir à V1 n'est pas un doublon du dernier (V2).
  assert.equal((await historique.ajouter(tmp, doc, '# V1\n', { maintenant: t(4) })).ajoute, true);
});

test('lister : du plus récent au plus ancien, avec date ISO et taille ; lire renvoie le contenu', async () => {
  const l = await historique.lister(tmp, doc);
  assert.equal(l.length, 3);
  assert.ok(l[0].id > l[1].id && l[1].id > l[2].id);
  assert.equal(l[0].date, '2026-10-26T10:00:00.004Z');
  assert.equal(l[0].taille, 5);
  assert.equal(await historique.lire(tmp, doc, l[1].id), '# V2\n');
});

test('lire : identifiant invalide ou hors dossier refusé', async () => {
  await assert.rejects(historique.lire(tmp, doc, '../../etc/passwd'));
  await assert.rejects(historique.lire(tmp, doc, 'nimporte'));
  await assert.rejects(historique.lire(tmp, doc, '20000101T000000000Z.md'.replace('.md', '')));
});

test('plafond : les plus anciens sont purgés', async () => {
  const autre = '/Users/x/notes/b.md';
  for (let i = 0; i < 7; i++) await historique.ajouter(tmp, autre, 'v' + i, { max: 5, maintenant: t(100 + i) });
  const l = await historique.lister(tmp, autre);
  assert.equal(l.length, 5);
  assert.equal(await historique.lire(tmp, autre, l[0].id), 'v6');
  assert.equal(await historique.lire(tmp, autre, l[4].id), 'v2');
});

test('lister : document sans historique = liste vide ; entrées parasites ignorées', async () => {
  assert.deepEqual(await historique.lister(tmp, '/Users/x/rien.md'), []);
  const d = historique.dossierDe(tmp, doc);
  fs.writeFileSync(path.join(d, 'notes.txt'), 'x');
  assert.equal((await historique.lister(tmp, doc)).length, 3);
});

test('entrées invalides : chemin non markdown, contenu non texte, trop gros', async () => {
  await assert.rejects(historique.ajouter(tmp, '/x/a.exe', 'x'));
  await assert.rejects(historique.ajouter(tmp, 'relatif.md', 'x'));
  await assert.rejects(historique.ajouter(tmp, doc, 42));
  await assert.rejects(historique.ajouter(tmp, doc, 'x'.repeat(historique.TAILLE_MAX + 1)));
});

test('deux chemins distincts n’ont pas le même dossier', () => {
  assert.notEqual(historique.dossierDe(tmp, '/a/x.md'), historique.dossierDe(tmp, '/b/x.md'));
});

// ── diff ────────────────────────────────────────────────────────────────────
test('diff : textes identiques = uniquement des lignes communes', () => {
  const d = diff.diffLignes('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(d.map((x) => x.type), ['=', '=', '=']);
  assert.deepEqual(diff.resume(d), { ajouts: 0, suppressions: 0 });
});

test('diff : ajout, suppression et modification', () => {
  const d = diff.diffLignes('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.deepEqual(d.map((x) => x.type + x.texte), ['=a', '-b', '+B', '=c', '=d', '+e']);
  assert.deepEqual(diff.resume(d), { ajouts: 2, suppressions: 1 });
});

test('diff : vide contre texte, fins de ligne CRLF normalisées', () => {
  assert.deepEqual(diff.diffLignes('', 'x').map((l) => l.type + l.texte), ['+x']);
  assert.deepEqual(diff.diffLignes('x', '').map((l) => l.type + l.texte), ['-x']);
  assert.deepEqual(diff.diffLignes('', '').length, 0);
  assert.deepEqual(diff.diffLignes('a\r\nb', 'a\nb').map((l) => l.type), ['=', '=']);
});

test('diff : numéros de ligne de chaque côté', () => {
  const d = diff.diffLignes('a\nb', 'a\nx\nb');
  assert.deepEqual(d.map((l) => [l.type, l.ancien || null, l.nouveau || null]), [['=', 1, 1], ['+', null, 2], ['=', 2, 3]]);
});

test('diff : gros textes différents = repli borné sans exploser', () => {
  const a = Array.from({ length: 5000 }, (_, i) => 'a' + i).join('\n');
  const b = Array.from({ length: 5000 }, (_, i) => 'b' + i).join('\n');
  const d = diff.diffLignes(a, b);
  assert.deepEqual(diff.resume(d), { ajouts: 5000, suppressions: 5000 });
});

test('diff : début et fin communs conservés autour d’un bloc modifié', () => {
  const d = diff.diffLignes('1\n2\n3\n4\n5', '1\n2\nX\n4\n5');
  assert.deepEqual(d.map((l) => l.type), ['=', '=', '-', '+', '=', '=']);
});

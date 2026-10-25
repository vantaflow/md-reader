// Nommage, bornage et écriture des images collées ou glissées : tests node
// purs sur un dossier temporaire.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const img = require('../images.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'binary');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');

const dossierTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-img-'));
const doc = (d) => path.join(d, 'note.md');

test('nomCapture : image-AAAAMMJJ-HHMMSS.ext en heure locale', () => {
  assert.strictEqual(img.nomCapture(new Date(2026, 9, 5, 7, 4, 9), 'png'), 'image-20261005-070409.png');
});

test('extensionDe : png, jpg, jpeg, gif, webp, svg acceptés ; le reste refusé', () => {
  for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']) assert.strictEqual(img.extensionDe(`a.${e.toUpperCase()}`), e);
  assert.strictEqual(img.extensionDe('a.exe'), null);
  assert.strictEqual(img.extensionDe('a.pdf', 'image/png'), null);
  assert.strictEqual(img.extensionDe('', 'image/jpeg'), 'jpg');
  assert.strictEqual(img.extensionDe('', 'text/html'), null);
});

test('nettoyerNom : espaces, accents conservés, caractères spéciaux remplacés', () => {
  assert.deepStrictEqual(img.nettoyerNom('Ma Photo (1).PNG'), { base: 'Ma-Photo-1', ext: 'png' });
  assert.deepStrictEqual(img.nettoyerNom('été à la mer.jpg'), { base: 'été-à-la-mer', ext: 'jpg' });
  assert.strictEqual(img.nettoyerNom('***.png').base, '');
});

test('nettoyerNom : refuse .., séparateurs et octet nul', () => {
  for (const mauvais of ['../x.png', '..\\x.png', 'a/b.png', 'a\\b.png', 'x..png', '..', 'a\0.png', null, 42]) {
    assert.throws(() => img.nettoyerNom(mauvais), /refusé/, String(mauvais));
  }
});

test('nomSansCollision : -2, -3… jusqu’au premier nom libre', () => {
  const pris = new Set(['a.png', 'a-2.png']);
  assert.strictEqual(img.nomSansCollision('a.png', (n) => pris.has(n)), 'a-3.png');
  assert.strictEqual(img.nomSansCollision('b.png', (n) => pris.has(n)), 'b.png');
});

test('dansDossier : borne les chemins', () => {
  assert.ok(img.dansDossier('/a/b', '/a/b/c.png'));
  assert.ok(!img.dansDossier('/a/b', '/a/b/../c.png'));
  assert.ok(!img.dansDossier('/a/b', '/a/bc/c.png'));
  assert.ok(!img.dansDossier('/a/b', '/etc/passwd'));
});

test('contenuCorrespond : reconnaît chaque format et refuse un faux', () => {
  assert.ok(img.contenuCorrespond(PNG, 'png') && img.contenuCorrespond(JPG, 'jpg') && img.contenuCorrespond(JPG, 'jpeg')
    && img.contenuCorrespond(GIF, 'gif') && img.contenuCorrespond(WEBP, 'webp') && img.contenuCorrespond(SVG, 'svg'));
  assert.ok(!img.contenuCorrespond(Buffer.from('MZ exécutable'), 'png'));
  assert.ok(!img.contenuCorrespond(PNG, 'jpg'));
});

test('enregistrerImage : crée images/ et renvoie le chemin relatif', async () => {
  const d = dossierTemp();
  const r = await img.enregistrerImage({ cheminDocument: doc(d), nom: 'Schéma 1.png', octets: PNG, mime: 'image/png' });
  assert.strictEqual(r.relatif, 'images/Schéma-1.png');
  assert.ok(fs.readFileSync(path.join(d, 'images', 'Schéma-1.png')).equals(PNG));
  fs.rmSync(d, { recursive: true });
});

test('enregistrerImage : capture collée sans nom = nom horodaté', async () => {
  const d = dossierTemp();
  const r = await img.enregistrerImage({ cheminDocument: doc(d), nom: null, octets: PNG, mime: 'image/png', maintenant: new Date(2026, 0, 2, 3, 4, 5) });
  assert.strictEqual(r.relatif, 'images/image-20260102-030405.png');
  const r2 = await img.enregistrerImage({ cheminDocument: doc(d), nom: '', octets: JPG, mime: 'image/jpeg', maintenant: new Date(2026, 0, 2, 3, 4, 5) });
  assert.strictEqual(r2.relatif, 'images/image-20260102-030405.jpg');
  fs.rmSync(d, { recursive: true });
});

test('enregistrerImage : sans collision (-2, -3), l’existant n’est jamais écrasé', async () => {
  const d = dossierTemp();
  fs.mkdirSync(path.join(d, 'images'));
  fs.writeFileSync(path.join(d, 'images', 'photo.png'), 'ORIGINAL');
  const a = await img.enregistrerImage({ cheminDocument: doc(d), nom: 'photo.png', octets: PNG });
  const b = await img.enregistrerImage({ cheminDocument: doc(d), nom: 'photo.png', octets: PNG });
  assert.strictEqual(a.relatif, 'images/photo-2.png');
  assert.strictEqual(b.relatif, 'images/photo-3.png');
  assert.strictEqual(fs.readFileSync(path.join(d, 'images', 'photo.png'), 'utf8'), 'ORIGINAL');
  fs.rmSync(d, { recursive: true });
});

test('enregistrerImage : écritures simultanées du même nom sans perte', async () => {
  const d = dossierTemp();
  const res = await Promise.all([1, 2, 3, 4].map(() => img.enregistrerImage({ cheminDocument: doc(d), nom: 'x.png', octets: PNG })));
  assert.strictEqual(new Set(res.map((r) => r.relatif)).size, 4);
  fs.rmSync(d, { recursive: true });
});

test('enregistrerImage : tous les formats acceptés', async () => {
  const d = dossierTemp();
  for (const [nom, octets] of [['a.png', PNG], ['b.jpg', JPG], ['c.jpeg', JPG], ['d.gif', GIF], ['e.webp', WEBP], ['f.svg', SVG]]) {
    const r = await img.enregistrerImage({ cheminDocument: doc(d), nom, octets });
    assert.strictEqual(r.relatif, 'images/' + nom);
  }
  fs.rmSync(d, { recursive: true });
});

test('enregistrerImage : refus (.., hors dossier, type, contenu, vide, gros, document absent)', async () => {
  const d = dossierTemp();
  const essai = (o) => img.enregistrerImage({ cheminDocument: doc(d), octets: PNG, ...o });
  await assert.rejects(essai({ nom: '../evasion.png' }), /refusé/);
  await assert.rejects(essai({ nom: '..\\evasion.png' }), /refusé/);
  await assert.rejects(essai({ nom: 'sous/dossier.png' }), /refusé/);
  await assert.rejects(essai({ nom: 'script.exe' }), /pris en charge/);
  await assert.rejects(essai({ nom: 'faux.png', octets: Buffer.from('MZ pas une image') }), /ne correspond pas/);
  await assert.rejects(essai({ nom: 'vide.png', octets: Buffer.alloc(0) }), /vide/);
  await assert.rejects(essai({ nom: 'gros.png', octets: Buffer.alloc(img.MAX_OCTETS + 1, 0x89) }), /volumineuse/);
  await assert.rejects(img.enregistrerImage({ cheminDocument: null, nom: 'a.png', octets: PNG }), /non enregistré/);
  await assert.rejects(img.enregistrerImage({ cheminDocument: 'relatif/note.md', nom: 'a.png', octets: PNG }), /non enregistré/);
  assert.ok(!fs.existsSync(path.join(d, '..', 'evasion.png')) && !fs.existsSync(path.join(d, 'images', 'evasion.png')));
  fs.rmSync(d, { recursive: true });
});

test('enregistrerImage : un dossier images qui est un lien vers l’extérieur est refusé', async () => {
  const d = dossierTemp();
  const dehors = dossierTemp();
  fs.symlinkSync(dehors, path.join(d, 'images'));
  await assert.rejects(img.enregistrerImage({ cheminDocument: doc(d), nom: 'a.png', octets: PNG }), /hors du dossier/);
  assert.deepStrictEqual(fs.readdirSync(dehors), []);
  fs.rmSync(d, { recursive: true }); fs.rmSync(dehors, { recursive: true });
});

// Styles du document (front-matter) : lecture, validation, CSS, écriture, Word.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const SD = require('../renderer/lib/style-document.js');

// Même lecture que stripFrontMatter de renderer.js.
function frontMatterDe(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/); if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, ''); }
  return meta;
}

test('extraction : valeurs valides seulement', () => {
  assert.deepEqual(SD.extraire({ police: '"Times New Roman", serif', taille: '12', 'couleur-titres': '#1a5276', 'couleur-texte': 'navy' }),
    { police: 'Times New Roman, serif', taille: 12, couleurTitres: '#1a5276', couleurTexte: 'navy' });
  assert.deepEqual(SD.extraire({ police: 'x; background:url(javascript:1)', taille: '2', 'couleur-titres': 'red;}', 'couleur-texte': 'url(x)' }), {});
  assert.deepEqual(SD.extraire({ taille: '16px' }), { taille: 12 });
  assert.deepEqual(SD.extraire({ taille: '11,5pt' }), { taille: 11.5 });
  assert.deepEqual(SD.extraire(null), {});
});

test('css : police, taille, couleurs du texte et des titres', () => {
  const css = SD.css({ police: 'Times New Roman, serif', taille: 12, couleurTitres: '#1a5276', couleurTexte: '#222' });
  assert.match(css, /font-family: "Times New Roman", serif;/);
  assert.match(css, /font-size: 12pt;/);
  assert.match(css, /color: #222;/);
  assert.match(css, /h1, \.markdown-body h2.*\{ color: #1a5276; \}/);
  assert.equal(SD.css({}), '');
});

test('écriture : ajoute les clés au front-matter existant sans toucher au reste', () => {
  const src = '---\ntitle: Doc\nauthor: Moi\n---\n\n# Titre\n';
  const out = SD.ecrire(src, { police: 'Georgia', taille: 13, couleurTitres: '#336699' });
  assert.equal(out, '---\ntitle: Doc\nauthor: Moi\npolice: Georgia\ntaille: 13\ncouleur-titres: "#336699"\n---\n\n# Titre\n');
  assert.deepEqual(SD.extraire(frontMatterDe(out)), { police: 'Georgia', taille: 13, couleurTitres: '#336699' });
});

test('écriture : remplace, retire, crée le front-matter, retire un front-matter vidé', () => {
  let s = SD.ecrire('# Titre\n', { police: 'Arial' });
  assert.equal(s, '---\npolice: Arial\n---\n\n# Titre\n');
  s = SD.ecrire(s, { police: 'Verdana', taille: 10 });
  assert.equal(s, '---\npolice: Verdana\ntaille: 10\n---\n\n# Titre\n');
  s = SD.ecrire(s, { police: null, taille: '' });
  assert.equal(s, '# Titre\n');
  assert.equal(SD.ecrire('# Titre\n', {}), '# Titre\n');
});

test('écriture : fins de ligne Windows conservées', () => {
  assert.equal(SD.ecrire('---\r\ntitle: x\r\n---\r\ntexte\r\n', { taille: 11 }), '---\r\ntitle: x\r\ntaille: 11\r\n---\r\ntexte\r\n');
});

test('Word : première police, points, couleurs hexadécimales', () => {
  assert.deepEqual(SD.pourWord({ police: 'Georgia, serif', taille: 12, couleurTitres: '#1a5276', couleurTexte: '#333' }),
    { police: 'Georgia', taillePt: 12, couleurTitres: '1A5276', couleurTexte: '333333' });
  assert.deepEqual(SD.pourWord({ couleurTexte: 'navy' }), { police: null, taillePt: null, couleurTitres: null, couleurTexte: null });
});

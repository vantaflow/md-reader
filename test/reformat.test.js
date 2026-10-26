// Reformatage Markdown : listes, tableaux, espaces, lignes vides ; code et front-matter intacts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reformater, reformaterSelection } = require('../renderer/lib/reformat.js');

test('les listes numérotées sont renumérotées', () => {
  assert.equal(reformater('1. a\n1. b\n7. c\n'), '1. a\n2. b\n3. c\n');
  assert.equal(reformater('3) x\n9) y'), '3) x\n4) y');
});

test('la renumérotation respecte les niveaux et redémarre après un paragraphe', () => {
  const r = reformater('1. a\n   1. x\n   1. y\n1. b\n\nTexte\n\n5. c\n5. d\n');
  assert.equal(r, '1. a\n   1. x\n   2. y\n2. b\n\nTexte\n\n5. c\n6. d\n');
});

test('les puces sont homogènes', () => {
  assert.equal(reformater('* a\n+ b\n-   c\n  * d\n'), '- a\n- b\n- c\n  - d\n');
});

test('les filets, le gras et les astérisques collés ne sont pas pris pour des puces', () => {
  const txt = '***\n\n**gras** et *italique*\n\n* * *\n\n---\n';
  assert.equal(reformater(txt), txt);
});

test('les tableaux sont alignés', () => {
  const r = reformater('|a|bb|\n|-|:-:|\n|1|2|\n');
  assert.equal(r, '| a   | bb  |\n| --- | :-: |\n| 1   |  2  |\n');
});

test('les espaces de fin sont retirés, le saut de ligne forcé est gardé', () => {
  assert.equal(reformater('a   \nb\t\nc    \nd\n'), 'a  \nb\nc  \nd\n');
  assert.equal(reformater('fin   \n\nsuite   '), 'fin\n\nsuite');
});

test('un saut de ligne forcé avant une puce, un titre ou une ligne vide n’a pas de sens : retiré', () => {
  assert.equal(reformater('a   \n- b\n# T   \n'), 'a\n- b\n# T\n');
  assert.equal(reformater('a   \n\nb'), 'a\n\nb');
});

test('les lignes vides multiples sont réduites, en tête et en fin comprises', () => {
  assert.equal(reformater('\n\na\n\n\n\nb\n\n\n'), 'a\n\nb\n');
});

test('les blocs de code ne sont pas touchés', () => {
  const code = '```js\n*  a  \n\n\n\n1. x\n1. y\n|a|b|\n|-|-|\n```';
  assert.equal(reformater('* x\n\n' + code + '\n\n* y\n'), '- x\n\n' + code + '\n\n- y\n');
  const tilde = '~~~\n* a   \n\n\n* b\n~~~';
  assert.equal(reformater(tilde), tilde);
});

test('le front-matter n’est pas touché', () => {
  const fm = '---\ntitre: "A  "\nliste:\n  * x   \n\n\n---';
  assert.equal(reformater(fm + '\n\n\n* a\n'), fm + '\n\n- a\n');
});

test('le reformatage est idempotent', () => {
  const brut = '---\nt: 1\n---\n\n\n* a\n+ b   \n\n\n3. x\n3. y\n\n|a|b|\n|-|-|\n|1|22|\n```\ncode   \n```\n';
  const une = reformater(brut);
  assert.equal(reformater(une), une);
});

test('un document sans fin de ligne n’en gagne pas, vide reste vide', () => {
  assert.equal(reformater('a\n\n\nb'), 'a\n\nb');
  assert.equal(reformater(''), '');
  assert.equal(reformater('\n\n'), '');
});

test('reformaterSelection : seules les lignes touchées changent', () => {
  const texte = '* a\n* b\n\n\n\n* c\n* d\n';
  const from = texte.indexOf('* c');
  const to = texte.indexOf('d') + 1;
  const r = reformaterSelection(texte, from, to);
  assert.equal(r.texte, '* a\n* b\n\n\n\n- c\n- d\n');
  assert.equal(r.texte.slice(r.from, r.to), '- c\n- d');
});

test('reformaterSelection : sélection partielle étendue à la ligne, numéros repris', () => {
  const texte = 'Titre\n\n1. a\n1. b\n1. c\n';
  const r = reformaterSelection(texte, texte.indexOf('b'), texte.indexOf('b'));
  assert.equal(r.texte, 'Titre\n\n1. a\n1. b\n1. c\n');
  const r2 = reformaterSelection(texte, texte.indexOf('1. a'), texte.length);
  assert.equal(r2.texte, 'Titre\n\n1. a\n2. b\n3. c\n');
});

test('reformaterSelection : sans effet dans un bloc de code ou le front-matter', () => {
  const code = '```\n* a  \n* b  \n```\n';
  assert.equal(reformaterSelection(code, 5, 10).texte, code);
  const fm = '---\nx:   1  \n---\n* a\n';
  assert.equal(reformaterSelection(fm, 4, 8).texte, fm);
});

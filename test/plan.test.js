const { test } = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../renderer/lib/plan.js');

const DOC = ['intro', '# A', 'a1', '## A1', 'a11', '## A2', 'a21', '# B', 'b1', '# C', 'c1', ''].join('\n');

test('plan : extrait niveaux, titres et plages des sections', () => {
  const s = plan.extraireSections(DOC);
  assert.deepEqual(s.map((x) => [x.niveau, x.titre, x.ligne]), [[1, 'A', 1], [2, 'A1', 3], [2, 'A2', 5], [1, 'B', 7], [1, 'C', 9]]);
  // A englobe ses sous-sections, s'arrête avant B.
  assert.equal(DOC.slice(s[0].debut, s[0].fin), '# A\na1\n## A1\na11\n## A2\na21\n');
  assert.equal(DOC.slice(s[3].debut, s[3].fin), '# B\nb1\n');
  assert.equal(s[4].fin, DOC.length);
});

test('plan : ignore les blocs de code et le front-matter', () => {
  const t = '---\ntitle: x\n# pas un titre\n---\n# Vrai\n```sh\n# commentaire\n```\n~~~~\n# autre\n~~~\n# encore code\n~~~~\n## Sous\n#pasuntitre\n####### sept\n';
  const s = plan.extraireSections(t);
  assert.deepEqual(s.map((x) => x.titre), ['Vrai', 'Sous']);
});

test('plan : titre avec dièses de fermeture et titre vide', () => {
  const s = plan.extraireSections('# Titre ##\n#\n## C#\n');
  assert.deepEqual(s.map((x) => x.titre), ['Titre', '', 'C#']);
});

test('plan : texte vide ou sans titre', () => {
  assert.deepEqual(plan.extraireSections(''), []);
  assert.deepEqual(plan.extraireSections('juste du texte\n'), []);
});

test('plan : section courante selon la ligne', () => {
  const s = plan.extraireSections(DOC);
  assert.equal(plan.sectionCourante(s, 0), -1);
  assert.equal(plan.sectionCourante(s, 1), 0);
  assert.equal(plan.sectionCourante(s, 4), 1);
  assert.equal(plan.sectionCourante(s, 8), 3);
  assert.equal(plan.sectionCourante(s, 99), 4);
});

test('plan : déplace une section avec ses sous-sections avant une autre', () => {
  const r = plan.deplacer(DOC, 3, 0, 'avant');
  assert.equal(r.change, true);
  assert.equal(r.texte, ['intro', '# B', 'b1', '# A', 'a1', '## A1', 'a11', '## A2', 'a21', '# C', 'c1', ''].join('\n'));
});

test('plan : déplace après une section (sous-sections de la cible comprises)', () => {
  const r = plan.deplacer(DOC, 0, 3, 'apres');
  assert.equal(r.texte, ['intro', '# B', 'b1', '# A', 'a1', '## A1', 'a11', '## A2', 'a21', '# C', 'c1', ''].join('\n'));
  const r2 = plan.deplacer(DOC, 4, 0, 'apres');
  assert.equal(r2.texte, ['intro', '# A', 'a1', '## A1', 'a11', '## A2', 'a21', '# C', 'c1', '# B', 'b1', ''].join('\n'));
});

test('plan : le niveau de la section déplacée s’aligne sur la cible, ses sous-sections suivent', () => {
  // A (niveau 1, avec ## A1 et ## A2) placée avant « A2 » (niveau 2) : devient niveau 2, sous-sections niveau 3.
  const t = '# R\n## X\nx\n## Y\ny\n### Y1\nz\n';
  const s = plan.extraireSections(t);
  const r = plan.deplacer(t, 0, 3, 'avant'); // R dans sa propre descendance
  assert.equal(r.change, false);
  const r2 = plan.deplacer(t, 2, 0, 'avant'); // « Y » (niveau 2) avant « R » (niveau 1) devient niveau 1, Y1 niveau 2
  assert.equal(r2.texte, '# Y\ny\n## Y1\nz\n# R\n## X\nx\n');
  assert.equal(s.length, 4);
});

test('plan : les niveaux restent bornés entre 1 et 6', () => {
  const t = '## B\nb\n# A\n###### Profond\nx\n';
  const r = plan.deplacer(t, 1, 0, 'apres'); // A (1) après B (2) : niveau 2, Profond reste 6
  assert.equal(r.texte, '## B\nb\n## A\n###### Profond\nx\n');
  const r2 = plan.deplacer('## A\n# B\nb\n###### Z\nz\n', 2, 0, 'avant'); // Z (6) -> niveau 2
  assert.ok(r2.texte.startsWith('## Z\nz\n## A'));
});

test('plan : sans ajustement de niveaux le texte déplacé est inchangé', () => {
  const t = '# A\n## B\nb\n';
  const r = plan.deplacer(t, 1, 0, 'avant', { ajusterNiveaux: false });
  assert.equal(r.texte, '## B\nb\n# A\n');
});

test('plan : déplacements impossibles ou sans effet', () => {
  assert.equal(plan.deplacer(DOC, 0, 1, 'avant').change, false); // cible dans la section
  assert.equal(plan.deplacer(DOC, 0, 0, 'apres').change, false);
  assert.equal(plan.deplacer(DOC, 3, 4, 'avant').change, false); // déjà juste avant
  assert.equal(plan.deplacer(DOC, 4, 3, 'apres').change, false);
  assert.equal(plan.deplacer(DOC, 9, 0, 'avant').change, false);
  assert.equal(plan.deplacer(DOC, 0, 3, 'milieu').change, false);
});

test('plan : sortir une dernière sous-section vers le niveau du parent', () => {
  const t = '# P\n## Enfant\ne\n# Q\nq\n';
  const r = plan.deplacer(t, 1, 0, 'apres');
  assert.equal(r.texte, '# P\n# Enfant\ne\n# Q\nq\n');
});

test('plan : texte sans saut de ligne final et fins de ligne CRLF', () => {
  const r = plan.deplacer('# A\na\n# B\nb', 1, 0, 'avant');
  assert.equal(r.texte, '# B\nb\n# A\na');
  const c = plan.deplacer('# A\r\na\r\n# B\r\nb\r\n', 1, 0, 'avant');
  assert.equal(c.texte, '# B\r\nb\r\n# A\r\na\r\n');
  const d = plan.deplacer('# A\r\na\r\n# B\r\nb', 0, 1, 'apres');
  assert.equal(d.texte, '# B\r\nb\r\n# A\r\na');
});

test('plan : le contenu avant le premier titre reste en place', () => {
  const r = plan.deplacer('Préambule\n\n# A\na\n# B\nb\n', 1, 0, 'avant');
  assert.equal(r.texte, 'Préambule\n\n# B\nb\n# A\na\n');
});

test('plan : un titre dans un bloc de code déplacé n’est pas ré-indenté', () => {
  const t = '# A\n```\n# dans le code\n```\n## B\nb\n';
  const r = plan.deplacer(t, 1, 0, 'avant');
  assert.equal(r.texte, '# B\nb\n# A\n```\n# dans le code\n```\n');
});

test('plan : plage modifiée minimale', () => {
  const avant = 'abc\ndef\nghi\n';
  const apres = 'abc\nghi\ndef\n';
  const p = plan.plageModifiee(avant, apres);
  assert.equal(avant.slice(0, p.from) + p.insert + avant.slice(p.to), apres);
  assert.deepEqual(plan.plageModifiee('x', 'x'), { from: 1, to: 1, insert: '' });
});

test('plan : déplacer puis plageModifiee redonne le texte déplacé', () => {
  const r = plan.deplacer(DOC, 3, 0, 'avant');
  const p = plan.plageModifiee(DOC, r.texte);
  assert.equal(DOC.slice(0, p.from) + p.insert + DOC.slice(p.to), r.texte);
});

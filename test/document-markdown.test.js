// Mode Document : passerelle Markdown <-> ProseMirror. Tests node purs (sans
// Electron) : aller-retour des constructions courantes et des extensions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserMarkdown, serialiserMarkdown } from '../renderer/document/markdown.js';
import { schema } from '../renderer/document/schema.js';

// Le document canonique est stable : analyser puis écrire redonne le même texte.
function aller(source) {
  const { doc, frontMatter, eol } = analyserMarkdown(source);
  doc.check();
  return serialiserMarkdown(doc, { frontMatter, eol });
}
const stable = (nom, source) => test(`aller-retour stable : ${nom}`, () => {
  const une = aller(source);
  assert.equal(une, source);
  // Et une seconde passe ne change plus rien.
  assert.equal(aller(une), une);
});
const noms = (source) => {
  const { doc } = analyserMarkdown(source);
  const sortie = [];
  doc.descendants((n) => { sortie.push(n.type.name); });
  return sortie;
};

stable('titres', '# Titre 1\n\n## Titre 2\n\n### Titre 3\n\n###### Titre 6\n');
stable('paragraphes et saut de ligne dur', 'Premier paragraphe.\n\nSecond avec\\\nretour forcé.\n');
stable('emphases', 'Du **gras**, de l’*italique*, du ~~barré~~ et du `code`.\n');
stable('emphases imbriquées', 'Un ***gras italique*** et un **gras avec *italique* dedans**.\n');
stable('liste à puces', '- un\n- deux\n  - sous-élément\n  - autre\n- trois\n');
stable('liste numérotée', '1. un\n2. deux\n3. trois\n');
stable('liste numérotée qui ne commence pas à 1', '4. quatre\n5. cinq\n');
stable('liste de tâches', '- [ ] à faire\n- [x] fait\n  - [ ] sous-tâche\n');
stable('liste lâche', '- un\n\n- deux\n\n- trois\n');
stable('deux listes de même type successives', '- a\n- b\n\n* c\n* d\n');
stable('tableau', '| Nom | Qté |\n| --- | --- |\n| Pomme | 3 |\n| Poire | 12 |\n');
stable('tableau aligné', '| A | B | C |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n');
stable('tableau avec barre et saut de ligne dans une cellule', '| A | B |\n| --- | --- |\n| x \\| y | l1<br>l2 |\n');
stable('bloc de code avec langage', '```js\nconst a = 1;\n\nconsole.log(a);\n```\n');
stable('bloc de code contenant des triples apostrophes', '````md\n```js\nx\n```\n````\n');
stable('citation', '> Une citation\n>\n> sur deux paragraphes\n');
stable('citation imbriquée avec liste', '> - a\n> - b\n');
stable('liens', 'Voir [le site](https://exemple.org) et [avec titre](https://exemple.org "Titre") puis https://auto.example.org/x.\n');
stable('lien dont l’adresse contient des espaces', '[fichier](<mon fichier.md>)\n');
stable('image', '![Un logo](images/logo.png)\n\n![Avec titre](a.png "Légende")\n');
stable('ligne horizontale', 'avant\n\n---\n\naprès\n');
stable('saut de page', 'page 1\n\n<!-- pagebreak -->\n\npage 2\n');
stable('sommaire', '[[toc]]\n\n# Un titre\n');
stable('encadré GitHub', '> [!NOTE]\n> Une remarque\n>\n> sur deux paragraphes\n\n> [!WARNING]\n> Attention\n');
stable('encadré directive', ':::tip\nUn conseil\n:::\n');
stable('note de bas de page', 'Un fait[^1] et un autre[^note].\n\n[^1]: La source.\n[^note]: Une autre source.\n'.replace('\n[^note]', '\n\n[^note]'));
stable('formule en bloc', '$$\n\\int_0^1 x\\,dx = \\frac12\n$$\n');
stable('formule en ligne', 'Avec $E = mc^2$ dans la phrase.\n');
stable('mermaid', '```mermaid\ngraph TD\n  A --> B\n```\n');
stable('lien wiki', 'Voir [[autre note]] et [[note|avec texte]].\n');
stable('HTML en ligne : souligné, surligné, couleur', 'Du <u>souligné</u>, du <mark>surligné</mark>, <mark style="background-color:#ffff00">jaune</mark> et <span style="color:#ff0000;font-family:Georgia, serif;font-size:14pt">rouge</span>.\n');
stable('HTML en ligne imbriqué avec gras', '<span style="color:#00f">**bleu gras** et *italique*</span>\n');
stable('HTML en bloc conservé', '<details>\n<summary>Plus</summary>\n\nContenu\n\n</details>\n'.replace('\n\nContenu\n\n</details>', '\n\nContenu\n\n</details>'));
stable('alignement et retrait', '<div align="center">\n\nCentré\n\n</div>\n\n<div align="right" style="margin-left:4em">\n\n## Titre à droite\n\n</div>\n');
stable('front-matter', '---\ntitle: Mon doc\nauthor: Moi\n---\n\n# Titre\n\nTexte.\n');
stable('document vide de front-matter seul', '---\ntitle: Seul\n---\n');

test('front-matter : conservé hors du document', () => {
  const { doc, frontMatter } = analyserMarkdown('---\ntitle: A\npolice: Georgia\n---\n\n# T\n');
  assert.equal(frontMatter, '---\ntitle: A\npolice: Georgia\n---\n');
  assert.equal(doc.firstChild.type.name, 'heading');
});

test('fins de ligne Windows conservées', () => {
  const src = '# T\r\n\r\ntexte\r\n';
  assert.equal(aller(src), src);
});

test('structure : titres, tâches, tableau, encadré, notes, maths, mermaid', () => {
  const src = [
    '# Titre', '', '- [ ] a', '- [x] b', '', '| A | B |', '| --- | --- |', '| 1 | 2 |', '',
    '> [!TIP]', '> astuce', '', 'Note[^1] et $x$.', '', '[^1]: source', '', '$$', 'y', '$$', '', '```mermaid', 'graph TD', '```',
  ].join('\n');
  const n = noms(src);
  for (const attendu of ['heading', 'bullet_list', 'list_item', 'table', 'table_header', 'table_cell', 'alert', 'footnote_ref', 'math_inline', 'footnote_def', 'math_block', 'mermaid_block']) {
    assert.ok(n.includes(attendu), 'manque ' + attendu + ' dans ' + n.join(','));
  }
  const { doc } = analyserMarkdown(src);
  const items = [];
  doc.descendants((nd) => { if (nd.type.name === 'list_item') items.push(nd.attrs.checked); });
  assert.deepEqual(items, [false, true]);
});

test('marques : les balises en ligne deviennent de vraies marques', () => {
  const { doc } = analyserMarkdown('<u>a</u> <mark>b</mark> <span style="color:red;font-size:12pt">c</span> **d**');
  const marques = new Set();
  doc.descendants((n) => { n.marks.forEach((m) => marques.add(m.type.name)); });
  assert.deepEqual([...marques].sort(), ['highlight', 'strong', 'style', 'underline']);
  let style = null;
  doc.descendants((n) => { n.marks.forEach((m) => { if (m.type.name === 'style') style = m.attrs; }); });
  assert.equal(style.color, 'red');
  assert.equal(style.fontSize, '12pt');
});

test('balise ouvrante sans fermeture ou style inconnu : conservés bruts, rien n’est perdu', () => {
  for (const src of ['un <u>souligné jamais fermé\n', 'un <span style="position:absolute">x</span>\n', 'un <kbd>Ctrl</kbd> test\n']) {
    assert.equal(aller(src), src);
  }
  assert.ok(noms('un <kbd>Ctrl</kbd>').includes('html_inline'));
});

test('construction inconnue : bloc brut conservé', () => {
  const src = '<table><tr><td>x</td></tr></table>\n\n:::danger-perso\nZone\n:::\n\n[ref]: https://exemple.org\n';
  assert.equal(aller(src), src);
  const n = noms(src);
  assert.ok(n.filter((x) => x === 'raw_block').length >= 2);
});

test('texte spécial échappé puis relu à l’identique', () => {
  const textes = ['2 * 3 * 4', 'a_b_c et _x_', '# pas un titre', '- pas une liste', '1. pas numéroté', '> pas une citation', '[pas un lien](x)', 'a < b et <div> pas du html', '5 $ puis 6 $', '[^1] pas une note', '[[pas wiki]]', 'une barre | dans le texte', '`pas du code`', '&amp; et &copy;'];
  for (const t of textes) {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text(t))]);
    const md = serialiserMarkdown(doc);
    const relu = analyserMarkdown(md).doc;
    // La lecture du texte doit redonner exactement le même paragraphe.
    assert.equal(relu.textContent, t, `texte « ${t} » -> ${JSON.stringify(md)}`);
    assert.equal(relu.childCount, 1);
    assert.equal(relu.firstChild.type.name, 'paragraph', `${t} -> ${JSON.stringify(md)}`);
  }
});

test('espaces en bordure d’une marque : sortis de la marque', () => {
  const gras = schema.marks.strong.create();
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('a'), schema.text(' b ', [gras]), schema.text('c')])]);
  const md = serialiserMarkdown(doc);
  assert.equal(md, 'a **b** c\n');
});

test('liste de tâches créée dans l’éditeur : sérialisée en Markdown valide', () => {
  const li = (c, t) => schema.node('list_item', { checked: c }, [schema.node('paragraph', null, schema.text(t))]);
  const doc = schema.node('doc', null, [schema.node('bullet_list', null, [li(false, 'x'), li(true, 'y')])]);
  assert.equal(serialiserMarkdown(doc), '- [ ] x\n- [x] y\n');
});

test('tableau sans ligne d’en-tête : ligne d’en-tête vide, relu sans en-tête', () => {
  const cell = (t) => schema.node('table_cell', { colspan: 1, rowspan: 1, colwidth: null, align: null }, schema.node('paragraph', null, t ? schema.text(t) : null));
  const doc = schema.node('doc', null, [schema.node('table', null, [schema.node('table_row', null, [cell('a'), cell('b')]), schema.node('table_row', null, [cell('c'), cell('d')])])]);
  const md = serialiserMarkdown(doc);
  assert.equal(md, '| | |\n| --- | --- |\n| a | b |\n| c | d |\n');
  const relu = analyserMarkdown(md).doc;
  assert.equal(relu.firstChild.firstChild.firstChild.type.name, 'table_cell');
  assert.equal(relu.firstChild.childCount, 2);
});

test('paragraphes vides ignorés, document vide accepté', () => {
  const doc = schema.node('doc', null, [schema.node('paragraph'), schema.node('paragraph', null, schema.text('x')), schema.node('paragraph')]);
  assert.equal(serialiserMarkdown(doc), 'x\n');
  assert.equal(serialiserMarkdown(analyserMarkdown('').doc), '');
});

test('document complet : une seconde passe ne change rien', () => {
  const src = [
    '---', 'title: Rapport', '---', '', '# Rapport', '', '[[toc]]', '', 'Intro avec **gras**, [lien](https://x.org)[^1] et $a+b$.', '',
    '| A | B |', '| :--- | ---: |', '| 1 | 2 |', '', '> [!IMPORTANT]', '> Lire', '', '- [ ] t1', '- [x] t2', '', '```mermaid', 'graph LR', '  A --> B', '```', '',
    '<!-- pagebreak -->', '', '[^1]: Une note.', '',
  ].join('\n');
  assert.equal(aller(src), src);
});

test('emphases qui se chevauchent : balises HTML plutôt que délimiteurs ambigus', () => {
  const S = schema.marks;
  const t = (x, m = []) => schema.text(x, m);
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [t('a'), t('b', [S.strong.create()]), t('c', [S.strong.create(), S.em.create()]), t('d', [S.em.create()])])]);
  const md = serialiserMarkdown(doc);
  assert.equal(md, 'a**b*c***<em>d</em>\n');
  assert.ok(analyserMarkdown(md).doc.eq(doc));
});

test('code contenant une barre dans une cellule de tableau', () => {
  const src = '| a |\n| --- |\n| `x\\|y` |\n';
  assert.equal(aller(src), src);
});

test('définition de lien : conservée en fin de document, liens de référence résolus', () => {
  const { doc } = analyserMarkdown('Voir [site][s].\n\n[s]: https://exemple.org "Site"\n');
  let lien = null;
  doc.descendants((n) => n.marks.forEach((m) => { if (m.type.name === 'link') lien = m.attrs; }));
  assert.equal(lien.href, 'https://exemple.org');
  assert.equal(doc.lastChild.type.name, 'raw_block');
  assert.equal(doc.lastChild.attrs.raw, '[s]: https://exemple.org "Site"');
});

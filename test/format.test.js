const test = require('node:test');
const assert = require('node:assert');
const f = require('../renderer/lib/format.js');

// Raccourci : état à partir d'un texte avec `|` pour le curseur ou `«…»` pour la sélection.
function e(s) {
  const a = s.indexOf('«');
  if (a >= 0) { const b = s.indexOf('»'); return { texte: s.slice(0, a) + s.slice(a + 1, b) + s.slice(b + 1), from: a, to: b - 1 }; }
  const i = s.indexOf('|');
  return { texte: s.slice(0, i) + s.slice(i + 1), from: i, to: i };
}
const sel = (r) => r.texte.slice(r.from, r.to);

test('gras : entoure la sélection puis la retire', () => {
  const r = f.gras(e('un «mot» ici'));
  assert.strictEqual(r.texte, 'un **mot** ici');
  assert.strictEqual(sel(r), 'mot');
  const r2 = f.gras(r);
  assert.strictEqual(r2.texte, 'un mot ici');
  assert.strictEqual(sel(r2), 'mot');
});
test('gras : sélection englobant déjà les marques', () => {
  const r = f.gras(e('«**mot**»'));
  assert.strictEqual(r.texte, 'mot');
  assert.strictEqual(sel(r), 'mot');
});
test('gras : sans sélection, insère un texte d’exemple sélectionné', () => {
  const r = f.gras(e('a | b'));
  assert.strictEqual(r.texte, 'a ****texte en gras**** b'.replace('****texte en gras****', '**texte en gras**'));
  assert.strictEqual(sel(r), 'texte en gras');
});
test('italique : bascule et ne confond pas avec le gras', () => {
  assert.strictEqual(f.italique(e('«mot»')).texte, '*mot*');
  assert.strictEqual(f.italique(e('*«mot»*')).texte, 'mot');
  const surGras = f.italique(e('**«mot»**'));
  assert.strictEqual(surGras.texte, '***mot***');
  assert.strictEqual(f.gras(e('***«mot»***')).texte, '*mot*');
});
test('barré : bascule', () => {
  const r = f.barre(e('«mot»'));
  assert.strictEqual(r.texte, '~~mot~~');
  assert.strictEqual(f.barre(r).texte, 'mot');
});
test('souligné : balises <u>, bascule', () => {
  const r = f.souligne(e('un «mot» ici'));
  assert.strictEqual(r.texte, 'un <u>mot</u> ici');
  assert.strictEqual(sel(r), 'mot');
  assert.strictEqual(f.souligne(r).texte, 'un mot ici');
  assert.strictEqual(f.souligne(e('«<u>mot</u>»')).texte, 'mot');
});
test('titres : ajout, changement de niveau, bascule', () => {
  assert.strictEqual(f.titre1(e('Titre|')).texte, '# Titre');
  assert.strictEqual(f.titre2(e('# Titre|')).texte, '## Titre');
  assert.strictEqual(f.titre2(e('## Titre|')).texte, 'Titre');
  assert.strictEqual(f.titre3(e('a\n«b\nc»')).texte, 'a\n### b\n### c');
  const r = f.titre1(e('Ti|tre'));
  assert.strictEqual(r.from, 4);
});
test('liste à puces : ajout, bascule, remplacement d’une numérotée', () => {
  assert.strictEqual(f.puces(e('«a\nb»')).texte, '- a\n- b');
  assert.strictEqual(f.puces(e('«- a\n- b»')).texte, 'a\nb');
  assert.strictEqual(f.puces(e('1. a|')).texte, '- a');
});
test('liste numérotée : numéros croissants, bascule', () => {
  assert.strictEqual(f.numerotee(e('«a\nb\nc»')).texte, '1. a\n2. b\n3. c');
  assert.strictEqual(f.numerotee(e('«1. a\n2. b»')).texte, 'a\nb');
});
test('liste de tâches : ajout, bascule, distincte des puces', () => {
  assert.strictEqual(f.taches(e('«a\nb»')).texte, '- [ ] a\n- [ ] b');
  assert.strictEqual(f.taches(e('«- [ ] a\n- [x] b»')).texte, 'a\nb');
  assert.strictEqual(f.taches(e('- a|')).texte, '- [ ] a');
  assert.strictEqual(f.puces(e('- [ ] a|')).texte, '- a');
});
test('lien : sélection, URL, vide, bascule', () => {
  const r = f.lien(e('voir «ceci» ici'));
  assert.strictEqual(r.texte, 'voir [ceci](https://) ici');
  assert.strictEqual(sel(r), 'https://');
  const u = f.lien(e('«https://x.fr»'));
  assert.strictEqual(u.texte, '[texte du lien](https://x.fr)');
  assert.strictEqual(sel(u), 'texte du lien');
  assert.strictEqual(f.lien(e('|')).texte, '[texte du lien](https://)');
  assert.strictEqual(f.lien(e('«[ceci](https://x.fr)»')).texte, 'ceci');
});
test('image : insère la syntaxe avec texte alternatif', () => {
  const r = f.image(e('|'));
  assert.strictEqual(r.texte, '![texte alternatif](images/image.png)');
  assert.strictEqual(sel(r), 'texte alternatif');
  assert.strictEqual(f.image(e('«logo»')).texte, '![logo](images/image.png)');
});
test('tableau : gabarit 3 colonnes isolé par des lignes vides', () => {
  const r = f.tableau(e('avant\n|\naprès'));
  assert.ok(r.texte.includes('\n\n| Colonne 1 | Colonne 2 | Colonne 3 |\n| --- | --- | --- |\n|  |  |  |'));
  assert.ok(r.texte.startsWith('avant\n\n') && r.texte.endsWith('\n\naprès'));
  assert.strictEqual(sel(r), 'Colonne 1');
  assert.strictEqual(f.tableau(e('«Nom»')).texte.split('\n')[0], '| Nom | Colonne 2 | Colonne 3 |');
});
test('bloc de code : entoure, curseur au milieu, bascule', () => {
  const r = f.blocCode(e('«let a = 1;»'));
  assert.strictEqual(r.texte, '```\nlet a = 1;\n```');
  assert.strictEqual(sel(r), 'let a = 1;');
  const retire = f.blocCode(e('«```\nlet a = 1;\n```»'));
  assert.strictEqual(retire.texte, 'let a = 1;');
  const vide = f.blocCode(e('|'));
  assert.strictEqual(vide.texte, '```\n\n```');
  assert.strictEqual(vide.from, 4);
  const ligneDedans = f.blocCode(e('```\nco|de\n```'));
  assert.strictEqual(ligneDedans.texte, 'code');
});
test('citation : ajout, bascule, plusieurs lignes', () => {
  assert.strictEqual(f.citation(e('«a\nb»')).texte, '> a\n> b');
  assert.strictEqual(f.citation(e('«> a\n> b»')).texte, 'a\nb');
  assert.strictEqual(f.citation(e('a|')).texte, '> a');
});
test('saut de page : insère sur sa ligne puis le retire', () => {
  const r = f.sautDePage(e('a|\nb'));
  assert.strictEqual(r.texte, 'a\n\n<!-- pagebreak -->\n\nb'.replace('a\n\n', 'a\n\n'));
  const retire = f.sautDePage({ texte: r.texte, from: 3, to: 3 });
  assert.strictEqual(retire.texte, 'a\n\nb');
});
test('ACTIONS : identifiants format:* uniques et fonctions valides', () => {
  const ids = f.ACTIONS.map((a) => a.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(ids.every((i) => i.startsWith('format:')));
  assert.strictEqual(ids.length, 16);
  for (const a of f.ACTIONS) {
    const r = a.executer({ texte: 'texte', from: 0, to: 5 });
    assert.ok(typeof r.texte === 'string' && r.from <= r.to, a.id);
  }
});

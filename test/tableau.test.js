// Tableaux Markdown : analyse, sérialisation alignée, repérage sous le curseur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../renderer/lib/tableau.js');

test('analyse d’un tableau GFM avec alignements', () => {
  const m = T.analyser('| Nom | Qté | Prix |\n| :-- | :-: | --: |\n| Pomme | 3 | 1,20 |\n| Poire | 12 | 0,9 |');
  assert.deepStrictEqual(m.entete, ['Nom', 'Qté', 'Prix']);
  assert.deepStrictEqual(m.alignements, ['gauche', 'centre', 'droite']);
  assert.deepStrictEqual(m.lignes, [['Pomme', '3', '1,20'], ['Poire', '12', '0,9']]);
});

test('analyse : barres de bord facultatives, lignes courtes complétées', () => {
  const m = T.analyser('a | b\n--- | ---\n1');
  assert.deepStrictEqual(m.entete, ['a', 'b']);
  assert.deepStrictEqual(m.lignes, [['1', '']]);
});

test('analyse : ce qui n’est pas un tableau donne null', () => {
  assert.equal(T.analyser('juste du texte'), null);
  assert.equal(T.analyser('| a | b |\n| --- |'), null);
});

test('sérialisation : colonnes alignées sur la même largeur, alignement marqué', () => {
  const txt = T.serialiser({ entete: ['Nom', 'Qté'], alignements: ['gauche', 'droite'], lignes: [['Pomme', '3'], ['Poire', '12']] });
  assert.equal(txt, [
    '| Nom   | Qté |',
    '| :---- | --: |',
    '| Pomme |   3 |',
    '| Poire |  12 |',
  ].join('\n'));
});

test('sérialisation : centre, largeur minimale de 3 et barre échappée', () => {
  const txt = T.serialiser({ entete: ['a'], alignements: ['centre'], lignes: [['x|y']] });
  assert.equal(txt, ['|  a   |', '| :--: |', '| x\\|y |'].join('\n'));
  assert.deepStrictEqual(T.analyser(txt).lignes, [['x|y']]);
});

test('aller-retour : analyser puis serialiser est stable', () => {
  const txt = T.serialiser(T.analyser('|a|b|\n|-|:-:|\n|1|2|'));
  assert.equal(T.serialiser(T.analyser(txt)), txt);
});

test('trouverTableau : le tableau sous le curseur, avec sa plage', () => {
  const texte = 'Intro\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite';
  const debut = texte.indexOf('| a');
  const fin = texte.indexOf('| 1 | 2 |') + '| 1 | 2 |'.length;
  for (const pos of [debut, debut + 4, texte.indexOf('| 1'), fin]) {
    const r = T.trouverTableau(texte, pos);
    assert.ok(r, 'pos ' + pos);
    assert.equal(r.from, debut);
    assert.equal(r.to, fin);
    assert.deepStrictEqual(r.modele.entete, ['a', 'b']);
  }
  assert.equal(T.trouverTableau(texte, 2), null, 'hors tableau');
  assert.equal(T.trouverTableau(texte, texte.length), null, 'hors tableau (fin)');
});

test('trouverTableau : ignore un tableau dans un bloc de code', () => {
  const texte = '```\n| a | b |\n| - | - |\n| 1 | 2 |\n```';
  assert.equal(T.trouverTableau(texte, texte.indexOf('| 1')), null);
});

test('manipulations : lignes, colonnes, alignement', () => {
  let m = T.nouveau(2, 1);
  assert.deepStrictEqual(m.entete, ['Colonne 1', 'Colonne 2']);
  m = T.ajouterLigne(m);
  m = T.ajouterColonne(m);
  assert.equal(m.entete.length, 3);
  assert.deepStrictEqual(m.lignes, [['', '', ''], ['', '', '']]);
  m = T.definirAlignement(m, 1, 'centre');
  assert.deepStrictEqual(m.alignements, ['aucun', 'centre', 'aucun']);
  m = T.supprimerColonne(m, 0);
  assert.deepStrictEqual(m.alignements, ['centre', 'aucun']);
  m = T.supprimerLigne(m, 0);
  assert.equal(m.lignes.length, 1);
  assert.equal(T.supprimerColonne(T.nouveau(1, 1), 0).entete.length, 1, 'une colonne reste');
});

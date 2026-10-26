const { test } = require('node:test');
const assert = require('node:assert/strict');
const wiki = require('../renderer/lib/wiki.js');
const tags = require('../renderer/lib/tags.js');

test('wiki : analyse d’un lien, texte par défaut et lien réservé', () => {
  assert.deepEqual(wiki.analyserLien(' Ma note ', undefined), { cible: 'Ma note', ancre: '', texte: 'Ma note' });
  assert.deepEqual(wiki.analyserLien('a#Titre', 'texte'), { cible: 'a', ancre: 'Titre', texte: 'texte' });
  assert.equal(wiki.analyserLien('toc'), null);
  assert.equal(wiki.analyserLien('  '), null);
});

const FICHIERS = ['Accueil.md', 'notes/Projet.md', 'notes/sous/Idée.md', 'archives/projet.md', 'autre/Idée.markdown'];

test('wiki : résolution sans extension ni casse, dossier du document d’abord', () => {
  const base = { racine: '/r', fichiers: FICHIERS };
  assert.equal(wiki.resoudre({ ...base, cible: 'accueil', dossierDocument: '/r' }), 'Accueil.md');
  assert.equal(wiki.resoudre({ ...base, cible: 'PROJET', dossierDocument: '/r/archives' }), 'archives/projet.md');
  assert.equal(wiki.resoudre({ ...base, cible: 'Projet', dossierDocument: '/r/notes' }), 'notes/Projet.md');
  // Hors du dossier du document : la plus proche de la racine, puis l'ordre alphabétique.
  assert.equal(wiki.resoudre({ ...base, cible: 'projet', dossierDocument: '/r/autre' }), 'archives/projet.md');
  assert.equal(wiki.resoudre({ ...base, cible: 'idée.md', dossierDocument: '/r' }), 'autre/Idée.markdown');
  assert.equal(wiki.resoudre({ ...base, cible: 'sous/Idée', dossierDocument: '/r' }), 'notes/sous/Idée.md');
  assert.equal(wiki.resoudre({ ...base, cible: 'inconnue', dossierDocument: '/r' }), null);
  assert.equal(wiki.resoudre({ ...base, cible: '', dossierDocument: '/r' }), null);
});

test('wiki : résolution avec chemins Windows', () => {
  const r = wiki.resoudre({ racine: 'C:\\Docs', dossierDocument: 'c:\\docs\\notes', fichiers: ['a/Note.md', 'notes/Note.md'], cible: 'note' });
  assert.equal(r, 'notes/Note.md');
});

test('wiki : nom de fichier d’une nouvelle note', () => {
  assert.equal(wiki.nomFichierNote('Ma note'), 'Ma note.md');
  assert.equal(wiki.nomFichierNote('../../etc/passwd'), 'passwd.md');
  assert.equal(wiki.nomFichierNote('a:b*c?'), 'a b c.md');
  assert.equal(wiki.nomFichierNote('...'), null);
  assert.equal(wiki.nomFichierNote('x'.repeat(300)).length, 103);
});

test('rétroliens : [[nom]], [[nom|texte]] et lien relatif', () => {
  const cible = 'notes/Projet.md';
  const wk = wiki.analyserRetroliens({ contenu: 'Début\nVoir [[projet|le projet]] et [[Projet]].\n', relFichier: 'Accueil.md', relCible: cible });
  assert.equal(wk.nombre, 2);
  assert.equal(wk.ligne, 2);
  assert.match(wk.extrait, /Voir \[\[projet\|le projet\]\]/);
  const rel = wiki.analyserRetroliens({ contenu: 'Un [lien](notes/Projet.md#x) ici', relFichier: 'a.md', relCible: cible });
  assert.equal(rel.nombre, 1);
  const rel2 = wiki.analyserRetroliens({ contenu: '[p](../notes/Projet.md "titre") et [q](<../notes/Projet.md>)', relFichier: 'archives/b.md', relCible: cible });
  assert.equal(rel2.nombre, 2);
  const enc = wiki.analyserRetroliens({ contenu: '[p](Mon%20Doc.md)', relFichier: 'a.md', relCible: 'Mon Doc.md' });
  assert.equal(enc.nombre, 1);
});

test('rétroliens : ni dans le code, ni vers un autre fichier, ni lien externe, ni auto-citation', () => {
  const cible = 'notes/Projet.md';
  const nul = (contenu, relFichier = 'a.md') => wiki.analyserRetroliens({ contenu, relFichier, relCible: cible });
  assert.equal(nul('`[[Projet]]` et\n```\n[[Projet]]\n[x](notes/Projet.md)\n```\n'), null);
  assert.equal(nul('[[Projet 2]] [x](notes/Autre.md) [y](https://x.org/notes/Projet.md)'), null);
  assert.equal(nul('[x](Projet.md)', 'a.md'), null);
  assert.equal(nul('[[Projet]]', 'notes/Projet.md'), null);
  assert.equal(nul('[x](/notes/Projet.md)'), null);
  assert.equal(nul('[x](../../notes/Projet.md)'), null);
});

test('tags : liste YAML, liste en ligne et valeurs séparées par des virgules', () => {
  const fm = (corps) => `---\ntitle: x\n${corps}\nauteur: moi\n---\n# Doc\n`;
  assert.deepEqual(tags.extraireTags(fm('tags:\n  - alpha\n  - "Beta"\n  - #gamma')), ['alpha', 'Beta', 'gamma']);
  assert.deepEqual(tags.extraireTags(fm('tags: [un, deux, \'trois\']')), ['un', 'deux', 'trois']);
  assert.deepEqual(tags.extraireTags(fm('tags: a, b , c')), ['a', 'b', 'c']);
  assert.deepEqual(tags.extraireTags(fm('tags:\n- x\n- y')), ['x', 'y']);
  assert.deepEqual(tags.extraireTags(fm('Tags: [A, a, B]')), ['A', 'B']);
});

test('tags : absents, vides, hors front-matter, bornés', () => {
  assert.deepEqual(tags.extraireTags('# Doc\ntags: [a]\n'), []);
  assert.deepEqual(tags.extraireTags('---\ntitle: x\n---\ntags: [a]\n'), []);
  assert.deepEqual(tags.extraireTags('---\ntags:\n---\n'), []);
  assert.deepEqual(tags.extraireTags('---\ntags: []\n---\n'), []);
  assert.deepEqual(tags.extraireTags(''), []);
  assert.deepEqual(tags.extraireTags('---\r\ntags: [a, b]\r\n---\r\n'), ['a', 'b']);
  const beaucoup = tags.extraireTags('---\ntags: [' + Array.from({ length: 80 }, (_, i) => 't' + i).join(',') + ']\n---\n');
  assert.equal(beaucoup.length, tags.TAGS_MAX);
  assert.equal(tags.extraireTags('---\ntags: [' + 'x'.repeat(200) + ']\n---\n')[0].length, 50);
});

test('tags : comptage insensible à la casse et filtrage d’arborescence', () => {
  const c = tags.compterTags([{ tags: ['Alpha', 'b'] }, { tags: ['alpha'] }, { tags: [] }, {}]);
  assert.deepEqual(c, [{ tag: 'Alpha', nombre: 2 }, { tag: 'b', nombre: 1 }]);
  const arbre = [
    { type: 'dir', name: 'd', path: '/r/d', children: [{ type: 'file', name: 'x.md', path: '/r/d/x.md' }, { type: 'file', name: 'y.md', path: '/r/d/y.md' }] },
    { type: 'dir', name: 'e', path: '/r/e', children: [{ type: 'file', name: 'z.md', path: '/r/e/z.md' }] },
    { type: 'file', name: 'a.md', path: '/r/a.md' },
  ];
  const f = tags.filtrerArbre(arbre, (n) => n.name === 'x.md' || n.name === 'a.md');
  assert.deepEqual(f.map((n) => n.name), ['d', 'a.md']);
  assert.deepEqual(f[0].children.map((n) => n.name), ['x.md']);
  assert.deepEqual(tags.filtrerArbre(arbre, () => false), []);
  assert.equal(tags.clePath('C:\\A\\b.md'), 'c:/a/b.md');
});

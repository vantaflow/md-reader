// Éditeur de diagramme Mermaid visuel : génération, relecture, disposition,
// insertion et remplacement de blocs ```mermaid. Tests node purs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const MV = require('../renderer/lib/mermaid-visuel.js');

const lire = (code) => { const r = MV.analyser(code); assert.ok(r.ok, r.raison); return r.modele; };

test('organigramme : génération du code pour les quatre formes et les quatre styles de lien', () => {
  const m = MV.modeleVide('flowchart');
  m.direction = 'LR';
  m.noeuds = [
    { id: 'A', texte: 'Début', forme: 'arrondi', x: 10, y: 20 },
    { id: 'B', texte: 'Choix ?', forme: 'losange', x: 200, y: 20 },
    { id: 'C', texte: 'Étape (a)', forme: 'rectangle', x: 400, y: 0 },
    { id: 'D', texte: 'Fin', forme: 'cercle', x: 400, y: 100 },
  ];
  m.liens = [
    { de: 'A', vers: 'B', texte: '', style: 'fleche' },
    { de: 'B', vers: 'C', texte: 'oui', style: 'epais' },
    { de: 'B', vers: 'D', texte: 'non', style: 'pointille' },
    { de: 'C', vers: 'D', texte: '', style: 'trait' },
  ];
  const code = MV.generer(m);
  assert.equal(code, [
    'flowchart LR',
    '  A(Début)',
    '  B{Choix ?}',
    '  C["Étape (a)"]',
    '  D((Fin))',
    '  A --> B',
    '  B ==>|oui| C',
    '  B -.->|non| D',
    '  C --- D',
    '  %% mdr:pos A=10,20;B=200,20;C=400,0;D=400,100',
  ].join('\n'));
});

test('organigramme : génération puis relecture redonnent le même modèle', () => {
  const m = MV.modeleVide('flowchart');
  MV.ajouterNoeud(m, { texte: 'Texte avec "guillemets" et | barre', forme: 'losange', x: 300, y: 50 });
  MV.relier(m, 'B', 'C', { texte: 'a | b', style: 'pointille' });
  const relu = lire(MV.generer(m));
  assert.deepEqual(relu.noeuds, m.noeuds);
  assert.deepEqual(relu.liens, m.liens);
  assert.equal(relu.direction, m.direction);
});

test('organigramme : relecture de syntaxes Mermaid courantes', () => {
  const m = lire('graph TD\n  A[Début] --> B(Rond) --> C{Choix}\n  C -->|oui| D((Fin))\n  C -- non --> E[Retour]\n  E -.-> A\n  F\n');
  assert.equal(m.mot, 'graph');
  assert.deepEqual(m.noeuds.map((n) => [n.id, n.texte, n.forme]), [
    ['A', 'Début', 'rectangle'], ['B', 'Rond', 'arrondi'], ['C', 'Choix', 'losange'], ['D', 'Fin', 'cercle'], ['E', 'Retour', 'rectangle'], ['F', 'F', 'rectangle'],
  ]);
  assert.deepEqual(m.liens.map((l) => [l.de, l.vers, l.texte, l.style]), [
    ['A', 'B', '', 'fleche'], ['B', 'C', '', 'fleche'], ['C', 'D', 'oui', 'fleche'], ['C', 'E', 'non', 'fleche'], ['E', 'A', '', 'pointille'],
  ]);
  // Sans positions mémorisées, la disposition automatique place tous les nœuds.
  assert.ok(m.noeuds.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('organigramme : texte sur plusieurs lignes', () => {
  const m = MV.modeleVide('flowchart');
  m.noeuds[0].texte = 'ligne 1\nligne 2';
  assert.match(MV.generer(m), /A\("ligne 1<br\/>ligne 2"\)/);
  assert.equal(lire(MV.generer(m)).noeuds[0].texte, 'ligne 1\nligne 2');
});

test('organigramme : direction mémorisée, disposition adaptée', () => {
  const tb = lire('flowchart TB\n  A --> B');
  const lr = lire('flowchart LR\n  A --> B');
  assert.ok(tb.noeuds[1].y > tb.noeuds[0].y);
  assert.ok(lr.noeuds[1].x > lr.noeuds[0].x);
  assert.equal(lr.direction, 'LR');
});

test('organigramme : ajouter, relier, supprimer un nœud', () => {
  const m = MV.modeleVide('flowchart');
  const c = MV.ajouterNoeud(m, { texte: 'Nouveau', forme: 'cercle' });
  assert.equal(c.id, 'C');
  assert.ok(MV.relier(m, 'B', 'C'));
  assert.equal(MV.relier(m, 'B', 'Z'), null);
  assert.equal(m.liens.length, 2);
  MV.supprimerNoeud(m, 'B');
  assert.deepEqual(m.noeuds.map((n) => n.id), ['A', 'C']);
  assert.equal(m.liens.length, 0);
});

test('organigramme : un cycle ne fait pas boucler la disposition', () => {
  const m = lire('flowchart TD\n  A --> B\n  B --> C\n  C --> A');
  assert.equal(m.noeuds.length, 3);
});

test('organigramme non reconnu : sous-graphe, style, forme exotique, liens multiples', () => {
  for (const code of [
    'flowchart TD\n  subgraph un\n    A --> B\n  end',
    'flowchart TD\n  A --> B\n  style A fill:#f9f',
    'flowchart TD\n  A[[Sous-routine]] --> B',
    'flowchart TD\n  A --> B & C',
    'flowchart TD\n  A --o B',
    'pie title Pets\n  "Dogs" : 386',
    'gantt\n  title x',
    '',
  ]) {
    const r = MV.analyser(code);
    assert.equal(r.ok, false, code);
    assert.ok(r.raison && r.raison.length > 3);
  }
});

test('séquence : génération et relecture', () => {
  const m = MV.modeleVide('sequence');
  MV.ajouterParticipant(m, 'Serveur');
  m.messages.push({ de: 'A', vers: 'C', texte: 'Requête ; urgente', type: '->' });
  const code = MV.generer(m);
  assert.equal(code, [
    'sequenceDiagram',
    '  participant A as Alice',
    '  participant B as Bob',
    '  participant C as Serveur',
    '  A->>B: Bonjour',
    '  B-->>A: Salut',
    '  A->C: Requête #59; urgente',
  ].join('\n'));
  const relu = lire(code);
  assert.deepEqual(relu.participants, m.participants);
  assert.deepEqual(relu.messages, m.messages);
});

test('séquence : participants implicites et supprimés avec leurs messages', () => {
  const m = lire('sequenceDiagram\n  User->>Editor: tape markdown\n  Editor->>Preview: rend HTML\n  Preview->>PDF: exporte');
  assert.deepEqual(m.participants.map((p) => p.id), ['User', 'Editor', 'Preview', 'PDF']);
  assert.equal(m.messages.length, 3);
  MV.supprimerParticipant(m, 'Preview');
  assert.equal(m.messages.length, 1);
});

test('séquence non reconnue : note, boucle, activation', () => {
  for (const extra of ['Note over A,B: x', 'loop Chaque minute\n  A->>B: x\nend', 'activate A', 'autonumber', 'A-)B: async']) {
    const r = MV.analyser('sequenceDiagram\n  A->>B: x\n  ' + extra);
    assert.equal(r.ok, false, extra);
  }
});

const DOC = [
  '# Titre',
  '',
  '```mermaid',
  'graph TD',
  '  A --> B',
  '```',
  '',
  '```js',
  'const x = "```mermaid";',
  '```',
  '',
  '> ```mermaid',
  '> sequenceDiagram',
  '>   A->>B: x',
  '> ```',
  '',
  '~~~mermaid',
  'flowchart LR',
  '  X --> Y',
  '~~~',
  '',
  'fin',
].join('\n');

test('blocs : repérage dans le document, y compris en citation et hors blocs de code', () => {
  const blocs = MV.trouverBlocs(DOC);
  assert.equal(blocs.length, 3);
  assert.equal(blocs[0].code, 'graph TD\n  A --> B');
  assert.equal(blocs[1].prefixe, '> ');
  assert.equal(blocs[1].code, 'sequenceDiagram\n  A->>B: x');
  assert.equal(blocs[2].code, 'flowchart LR\n  X --> Y');
});

test('blocs : le bloc sous la position, ou aucun', () => {
  const pos = DOC.indexOf('A --> B');
  assert.equal(MV.blocA(DOC, pos).code, 'graph TD\n  A --> B');
  assert.equal(MV.blocA(DOC, DOC.indexOf('fin')), null);
  assert.equal(MV.blocA(DOC, DOC.indexOf('const x')), null);
});

test('remplacement : le bloc est remplacé, le reste du document est intact', () => {
  const blocs = MV.trouverBlocs(DOC);
  const apres = MV.remplacerBloc(DOC, blocs[0], 'flowchart TD\n  A --> B --> C');
  assert.ok(apres.includes('```mermaid\nflowchart TD\n  A --> B --> C\n```\n'));
  assert.equal(apres.replace('flowchart TD\n  A --> B --> C', 'graph TD\n  A --> B'), DOC);
  // Le bloc en citation garde son préfixe.
  const b2 = MV.trouverBlocs(DOC)[1];
  const apres2 = MV.remplacerBloc(DOC, b2, 'sequenceDiagram\n  A->>B: y');
  assert.ok(apres2.includes('> ```mermaid\n> sequenceDiagram\n>   A->>B: y\n> ```'));
  assert.equal(MV.trouverBlocs(apres2).length, 3);
});

test('insertion : bloc formaté avec des barrières assez longues', () => {
  assert.equal(MV.formaterBloc('graph TD\n  A --> B'), '```mermaid\ngraph TD\n  A --> B\n```');
  assert.equal(MV.formaterBloc('graph TD\n```\n  A --> B').startsWith('````mermaid'), true);
  const texte = 'avant\n\n' + MV.formaterBloc(MV.generer(MV.modeleVide('flowchart'))) + '\n\naprès';
  assert.equal(MV.trouverBlocs(texte).length, 1);
  assert.ok(MV.analyser(MV.trouverBlocs(texte)[0].code).ok);
});

test('un diagramme lu puis régénéré garde sa structure (aller-retour)', () => {
  const source = 'flowchart TD\n  A(Début)\n  B[Étape 1]\n  C{Choix ?}\n  A --> B\n  B --> C\n  C -->|oui| A\n  %% mdr:pos A=30,30;B=30,140;C=30,250';
  assert.equal(MV.generer(lire(source)), source);
});

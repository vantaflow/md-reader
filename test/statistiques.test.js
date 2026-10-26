// Statistiques avancées (renderer/lib/statistiques.js) et mode présentation
// lecture (renderer/lib/lecture.js) : fonctions pures, textes de référence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const st = require('../renderer/lib/statistiques.js');
const lecture = require('../renderer/lib/lecture.js');

const FR = 'Le chat dort sur le canapé. Il fait beau aujourd’hui. Nous allons marcher dans le jardin avec les enfants.';
const EN = 'The cat sat on the mat. It was a sunny day. We went to the park with our friends and played.';

test('langue : le front-matter lang l’emporte, sinon heuristique', () => {
  assert.deepEqual(st.detecterLangue(EN, 'lang: fr'), { langue: 'fr', source: 'front-matter' });
  assert.equal(st.detecterLangue(FR, '').langue, 'fr');
  assert.equal(st.detecterLangue(EN, '').langue, 'en');
  assert.equal(st.detecterLangue('xyz', '').langue, 'inconnue');
  assert.equal(st.analyser('---\nlang: en-US\n---\n' + FR).langue, 'en');
  assert.equal(st.analyser('---\nlanguage: "fr_FR"\n---\n' + EN).langue, 'fr');
});

test('syllabes : français et anglais, e muet final', () => {
  assert.equal(st.syllabes('chat', 'fr'), 1);
  assert.equal(st.syllabes('canapé', 'fr'), 3);
  assert.equal(st.syllabes('jardin', 'fr'), 2);
  assert.equal(st.syllabes('table', 'fr'), 1); // e muet final non compté (prose parlée)
  assert.equal(st.syllabes('cat', 'en'), 1);
  assert.equal(st.syllabes('sunny', 'en'), 2);
  assert.equal(st.syllabes('make', 'en'), 1);
  assert.equal(st.syllabes('beautiful', 'en'), 3);
  assert.equal(st.syllabes('12', 'en'), 0);
});

test('lisibilité : Flesch (en) et Kandel-Moles (fr) selon les formules', () => {
  // 100 mots, 10 phrases, 150 syllabes.
  const fr = st.lisibilite(100, 10, 150, 'fr');
  assert.equal(fr.formule, 'Kandel-Moles');
  assert.equal(fr.indice, Math.round((207 - 1.015 * 10 - 73.6 * 1.5) * 10) / 10);
  const en = st.lisibilite(100, 10, 150, 'en');
  assert.equal(en.formule, 'Flesch');
  assert.equal(en.indice, Math.round((206.835 - 1.015 * 10 - 84.6 * 1.5) * 10) / 10);
  assert.equal(st.lisibilite(0, 0, 0, 'fr'), null);
  assert.equal(st.lisibilite(10, 1, 10, 'de'), null);
});

test('niveaux de lisibilité : bornes', () => {
  const n = st.niveauLisibilite;
  assert.deepEqual([95, 85, 75, 65, 55, 40, 10].map(n), ['très facile', 'facile', 'assez facile', 'standard', 'assez difficile', 'difficile', 'très difficile']);
});

test('texte simple anglais : phrases, mots, lisibilité facile', () => {
  const a = st.analyser(EN);
  assert.equal(a.langue, 'en');
  assert.equal(a.phrases, 3);
  assert.equal(a.mots, 21);
  assert.equal(a.paragraphes, 1);
  assert.equal(a.lisibilite.formule, 'Flesch');
  assert.ok(a.lisibilite.indice > 80, 'indice ' + a.lisibilite.indice);
});

test('texte simple français : Kandel-Moles, phrases', () => {
  const a = st.analyser(FR);
  assert.equal(a.langue, 'fr');
  assert.equal(a.phrases, 3);
  assert.equal(a.lisibilite.formule, 'Kandel-Moles');
  assert.ok(a.lisibilite.indice > 50, 'indice ' + a.lisibilite.indice);
});

test('texte dense : indice plus bas que le texte simple', () => {
  const dense = 'L’institutionnalisation progressive des mécanismes interministériels de coordination réglementaire engendre inévitablement des complications administratives considérables, notamment lorsqu’interviennent simultanément plusieurs juridictions compétentes.';
  assert.ok(st.analyser(dense).lisibilite.indice < st.analyser(FR).lisibilite.indice);
  assert.ok(['difficile', 'très difficile', 'assez difficile'].includes(st.analyser(dense).lisibilite.niveau));
});

test('front-matter, code, commentaires, images et liens : exclus ou réduits au texte', () => {
  const src = '---\ntitle: Mot mot mot mot\n---\n# Titre\n\n```js\nconst a = 1; const b = 2;\n```\n\nBonjour `inline code` [le monde](http://x.y/z) ![img](a.png) <!-- caché -->\n';
  const a = st.analyser(src);
  // Titre (1) + Bonjour le monde (3)
  assert.equal(a.mots, 4);
  assert.deepEqual(a.sections.map((s) => [s.titre, s.mots]), [['Titre', 4]]);
});

test('temps de lecture par section : 230 mots/minute, par titre, hors code', () => {
  const mots = (n) => Array.from({ length: n }, () => 'mot').join(' ');
  const src = `Intro ${mots(10)}.\n\n# Un\n\n${mots(230)}.\n\n## Deux\n\n${mots(115)}.\n\n\`\`\`\n${mots(500)}\n\`\`\`\n`;
  const a = st.analyser(src);
  assert.deepEqual(a.sections.map((s) => s.titre), ['(début)', 'Un', 'Deux']);
  assert.equal(a.sections[1].minutes, 1);
  assert.equal(a.sections[2].minutes, 0.5);
  assert.equal(a.sections[1].niveau, 1);
  assert.equal(a.sections[2].niveau, 2);
  assert.equal(st.MOTS_PAR_MINUTE, 230);
  assert.equal(a.tempsLecture, Math.round(((11 + 231 + 116) / 230) * 10) / 10);
});

test('un # dans un bloc de code n’est pas un titre ; titre vide de contenu conservé', () => {
  const a = st.analyser('# Réel\n\n```\n# faux titre\n```\n\n## Vide\n');
  assert.deepEqual(a.sections.map((s) => s.titre), ['Réel', 'Vide']);
});

test('phrases : nombres décimaux, URL, points de suspension, listes', () => {
  assert.equal(st.analyser('Pi vaut 3.14 environ. Voir https://exemple.com/a.b pour plus. Vraiment ? Oui ! Bien…').phrases, 5);
  assert.equal(st.analyser('- un\n- deux\n\nUne phrase.').paragraphes, 2);
});

test('paragraphes : séparés par une ligne vide, lignes consécutives réunies', () => {
  assert.equal(st.analyser('a b\nc d\n\ne f\n\n\ng h').paragraphes, 3);
});

test('mots les plus fréquents : mots vides FR et EN exclus, tri stable', () => {
  const a = st.analyser('Le projet avance. Le projet est beau et le projet plaît. The project is good, and the plan works. Plan plan.', { nombreFrequents: 3 });
  assert.deepEqual(a.frequents, [{ mot: 'plan', nb: 3 }, { mot: 'projet', nb: 3 }, { mot: 'avance', nb: 1 }]);
  assert.ok(!a.frequents.some((f) => ['le', 'the', 'and', 'est', 'is'].includes(f.mot)));
});

test('mots fréquents : élision, chiffres et mots courts ignorés', () => {
  const a = st.analyser('l’arbre arbre d’arbre 2024 2024 2024 un on ça arbre', { nombreFrequents: 5 });
  assert.deepEqual(a.frequents[0], { mot: 'arbre', nb: 4 });
  assert.ok(!a.frequents.some((f) => f.mot === '2024' || f.mot.length < 3));
});

test('objectif de mots : progression, plafond à 100 %, désactivé à 0', () => {
  assert.deepEqual(st.progression(250, 1000), { objectif: 1000, mots: 250, pourcentage: 25, atteint: false });
  assert.equal(st.progression(1500, 1000).pourcentage, 100);
  assert.equal(st.progression(1500, 1000).atteint, true);
  assert.equal(st.progression(10, 0), null);
  assert.equal(st.analyser('un deux trois quatre', { objectif: 8 }).objectif.pourcentage, 50);
  assert.equal(st.analyser('un deux').objectif, null);
});

test('document vide ou vide de prose : aucune division par zéro', () => {
  for (const src of ['', '   \n', '```\ncode\n```', '---\nlang: fr\n---\n']) {
    const a = st.analyser(src);
    assert.equal(a.mots, 0);
    assert.equal(a.phrases, 0);
    assert.equal(a.lisibilite, null);
    assert.deepEqual(a.frequents, []);
  }
  assert.doesNotThrow(() => st.analyser(null));
});

test('CRLF et texte mixte accepté', () => {
  assert.equal(st.analyser('# A\r\n\r\nUne phrase.\r\n\r\nUne autre.').phrases, 2);
});

// ── mode présentation lecture ───────────────────────────────────────────────
test('lecture : taille bornée, par pas de 2', () => {
  const L = lecture;
  assert.equal(L.ajusterTaille(20, 1), 22);
  assert.equal(L.ajusterTaille(20, -1), 18);
  assert.equal(L.ajusterTaille(L.TAILLE.max, 1), L.TAILLE.max);
  assert.equal(L.ajusterTaille(L.TAILLE.min, -1), L.TAILLE.min);
  assert.equal(L.ajusterTaille(NaN, 1), L.TAILLE.defaut + 2);
});

test('lecture : vitesse bornée, croissante en pixels par seconde', () => {
  const L = lecture;
  assert.equal(L.ajusterVitesse(1, -1), 1);
  assert.equal(L.ajusterVitesse(10, 1), 10);
  assert.equal(L.ajusterVitesse(3, 2), 5);
  for (let i = 1; i < 10; i++) assert.ok(L.pixelsParSeconde(i + 1) > L.pixelsParSeconde(i));
});

test('lecture : avancer = vitesse × durée, plafonné à la fin, dt aberrant plafonné', () => {
  const L = lecture;
  const v = L.pixelsParSeconde(5);
  const r = L.avancer(0, 5, 100, 1000);
  assert.ok(Math.abs(r.position - v * 0.1) < 1e-9);
  assert.equal(r.fini, false);
  assert.ok(Math.abs(L.avancer(0, 5, 60000, 1000).position - v * 0.25) < 1e-9);
  const fin = L.avancer(995, 10, 200, 1000);
  assert.deepEqual(fin, { position: 1000, fini: true });
  assert.deepEqual(L.avancer(0, 5, 100, 0), { position: 0, fini: true });
  assert.equal(L.avancer(-5, 5, 0, 100).position, 0);
});

test('lecture : barre visible 2,5 s après la dernière activité ; temps restant', () => {
  const L = lecture;
  assert.equal(L.barreVisible(1000, 3000), true);
  assert.equal(L.barreVisible(1000, 3500), false);
  assert.equal(L.tempsRestant(0, 5, 520), Math.ceil(520 / L.pixelsParSeconde(5)));
  assert.equal(L.tempsRestant(600, 5, 520), 0);
});

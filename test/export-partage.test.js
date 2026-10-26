// Thèmes d'export, CSS personnalisé, HTML riche et presse-papiers : modules
// purs, exercés sans Electron.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const themes = require('../renderer/lib/themes-export.js');
const riche = require('../renderer/lib/html-riche.js');
const presse = require('../presse-papiers.js');
const settings = require('../renderer/lib/settings.js');

test('trois thèmes d’export aux feuilles de style réellement distinctes', () => {
  assert.deepEqual(themes.THEMES.map((t) => t.id), ['sobre', 'rapport', 'academique']);
  const [a, b, c] = themes.THEMES.map((t) => themes.cssTheme(t.id));
  assert.equal(new Set([a, b, c]).size, 3);
  // Typographie : sans empattement / serif.
  assert.match(a, /font-family: -apple-system/);
  assert.match(c, /font-family: "Times New Roman"/);
  // Tableaux : légers / en-tête plein et bandes / trois filets.
  assert.match(b, /nth-child\(even\)/);
  assert.match(c, /border-top: 2px solid #000/);
  // Marges latérales propres au rapport et à l'académique.
  assert.match(b, /padding-left: 12mm/);
  assert.match(c, /padding-left: 20mm/);
});

test('le thème académique justifie le texte et numérote les titres', () => {
  const c = themes.cssTheme('academique');
  assert.match(c, /text-align: justify/);
  assert.match(c, /hyphens: auto/);
  assert.match(c, /counter-increment: ac1/);
  assert.match(c, /h2::before \{ content: counter\(ac1\) '\.' counter\(ac2\)/);
  assert.match(c, /text-indent: 1\.2em/);
  // Les deux autres thèmes ne justifient ni ne numérotent.
  for (const id of ['sobre', 'rapport']) {
    assert.doesNotMatch(themes.cssTheme(id), /text-align: justify|counter-increment/);
  }
});

test('un thème inconnu retombe sur le thème par défaut', () => {
  assert.equal(themes.themeOuDefaut('nimporte'), 'sobre');
  assert.equal(themes.themeOuDefaut(undefined), 'sobre');
  assert.equal(themes.cssTheme('inconnu'), themes.cssTheme('sobre'));
});

test('le CSS personnalisé vient après le thème et est nettoyé de </style>', () => {
  const css = themes.cssExport({ theme: 'rapport', cssPerso: 'h1 { color: red; }</style><script>alert(1)</script>' });
  assert.ok(css.indexOf(themes.cssTheme('rapport')) < css.indexOf('h1 { color: red; }'));
  assert.doesNotMatch(css, /<\/style|<script|<\//i);
  assert.match(css, /alert\(1\)/); // du texte inerte dans le CSS, sans balise
});

test('le nettoyage du CSS personnalisé résiste aux balises imbriquées', () => {
  assert.doesNotMatch(themes.nettoyerCssPerso('a{}</sty</style>le>b{}'), /<\/?style/i);
  assert.doesNotMatch(themes.nettoyerCssPerso('<!-- x --> a{}'), /<!--|-->/);
  assert.equal(themes.nettoyerCssPerso(42), '');
});

test('le CSS personnalisé est borné en taille', () => {
  const grand = 'a{}'.repeat(30000);
  assert.ok(themes.nettoyerCssPerso(grand).length <= themes.MAX_CSS_PERSO);
  const s = settings.creer(null);
  assert.throws(() => s.set('exportCssPerso', 'x'.repeat(themes.MAX_CSS_PERSO + 1)), TypeError);
  s.set('exportCssPerso', 'p { margin: 0 }');
  assert.equal(s.get('exportCssPerso'), 'p { margin: 0 }');
});

test('réglages : thème d’export par défaut sobre, valeurs fermées', () => {
  const s = settings.creer(null);
  assert.equal(s.get('exportTheme'), 'sobre');
  assert.equal(s.get('exportCssPerso'), '');
  s.set('exportTheme', 'academique');
  assert.throws(() => s.set('exportTheme', 'fantaisie'), TypeError);
});

test('HTML riche : styles en ligne sur titres, paragraphes, liens', () => {
  const sortie = riche.inliner('<h1 id="t">Titre</h1><p class="x">Un <a href="https://a.fr">lien</a></p>');
  assert.match(sortie, /<h1 style="[^"]*font-size:24px/);
  assert.match(sortie, /<p style="[^"]*margin:0 0 10px/);
  assert.match(sortie, /<a href="https:\/\/a\.fr" style="[^"]*color:#0b5cad/);
  assert.doesNotMatch(sortie, /class=|id=/);
});

test('HTML riche : tableaux avec bordures en ligne', () => {
  const sortie = riche.inliner('<table><thead><tr><th align="center">A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>');
  assert.match(sortie, /<table border="1" cellpadding="6" cellspacing="0" style="[^"]*border:1px solid #bbbbbb/);
  assert.match(sortie, /<th align="center" style="[^"]*border:1px solid #bbbbbb[^"]*text-align:center/);
  assert.match(sortie, /<td style="[^"]*border:1px solid #bbbbbb/);
});

test('HTML riche : code en ligne et bloc de code ne se confondent pas', () => {
  const sortie = riche.inliner('<p><code>x</code></p><pre><code class="language-js">let a;</code></pre><p><code>y</code></p>');
  const codes = [...sortie.matchAll(/<code style="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(codes.length, 3);
  assert.match(codes[0], /background-color:#f2f2f2/);
  assert.match(codes[1], /background-color:transparent/);
  assert.match(codes[2], /background-color:#f2f2f2/); // le compteur de <pre> est bien retombé
  assert.match(sortie, /<pre style="[^"]*background-color:#f6f8fa/);
});

test('HTML riche : images en data URI conservées, contenu hostile retiré', () => {
  const sortie = riche.inliner('<img src="data:image/png;base64,AAAA" alt="a" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><iframe src="x"></iframe>');
  assert.match(sortie, /<img src="data:image\/png;base64,AAAA" alt="a" style="/);
  assert.doesNotMatch(sortie, /onerror|<script|alert|javascript:|iframe/i);
});

test('HTML riche : un style existant garde le dernier mot ; enveloppe stylée', () => {
  assert.match(riche.inliner('<p style="margin:5px">x</p>'), /style="[^"]*margin:0 0 10px;[^"]*margin:5px"/);
  assert.match(riche.versHtmlRiche('<p>x</p>'), /^<div style="font-family:/);
});

test('presse-papiers : écrit le HTML et le texte, refuse le reste', () => {
  const appels = [];
  const faux = { write: (c) => appels.push(c) };
  assert.equal(presse.ecrireHtml(faux, { html: '<p>a</p>', text: 'a' }), true);
  assert.deepEqual(appels, [{ html: '<p>a</p>', text: 'a' }]);
  assert.throws(() => presse.ecrireHtml(faux, null), /invalide/);
  assert.throws(() => presse.ecrireHtml(faux, { html: 3, text: 'a' }), /chaînes/);
  assert.throws(() => presse.ecrireHtml(faux, { html: ' ', text: '' }), /Rien à copier/);
  assert.throws(() => presse.ecrireHtml(faux, { html: 'x'.repeat(presse.MAX_HTML + 1), text: 'a' }), /volumineux/);
  assert.equal(appels.length, 1);
});

test('CSS perso : @import retiré (aucun chargement réseau depuis un export)', () => {
  const s = themes.nettoyerCssPerso('@import url(https://exemple.test/x.css);\n@IMPORT "y.css";\nbody{color:red}');
  assert.doesNotMatch(s, /@import/i);
  assert.match(s, /body\{color:red\}/);
});

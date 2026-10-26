// Import vers Markdown : nettoyage du HTML, conversion (turndown + GFM) et lecture
// bornée du fichier. Sans Electron. Le round-trip Word (export puis import) est
// dans test/smoke-lot2c.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const imp = require('../renderer/lib/import.js');
const { lireFichierImport, MAX_OCTETS } = require('../importation.js');

const { htmlVersMarkdown } = imp.creer({ TurndownService, gfm });

test('titres, paragraphes, gras, italique, lien, code en ligne', () => {
  const md = htmlVersMarkdown('<h1>Titre</h1><h2>Sous</h2><p>Un <strong>gras</strong>, <em>ital</em>, <code>x()</code> et <a href="https://a.fr">lien</a>.</p>');
  assert.match(md, /^# Titre\n\n## Sous\n\n/);
  assert.match(md, /Un \*\*gras\*\*, \*ital\*, `x\(\)` et \[lien\]\(https:\/\/a\.fr\)\./);
});

test('listes à puces, numérotées et imbriquées', () => {
  const md = htmlVersMarkdown('<ul><li>un<ul><li>sous</li></ul></li><li>deux</li></ul><ol><li>a</li><li>b</li></ol>');
  assert.match(md, /^-\s+un\n\s+-\s+sous\n-\s+deux/m);
  assert.match(md, /1\.\s+a\n2\.\s+b/);
});

test('tableau GFM, même sans ligne d’en-têtes (<td> et <p> de mammoth)', () => {
  const md = htmlVersMarkdown('<table><tr><td><p>Nom</p></td><td><p>Valeur</p></td></tr><tr><td><p>a</p></td><td><p>1</p><p>suite</p></td></tr></table>');
  const lignes = md.trim().split('\n');
  assert.equal(lignes[0], '| Nom | Valeur |');
  assert.match(lignes[1], /^\| ?-+ ?\| ?-+ ?\|$/);
  assert.match(lignes[2], /^\| a \| 1<br>suite \|$/);
});

test('barré, liste de tâches, bloc de code', () => {
  const md = htmlVersMarkdown('<p><del>vieux</del> <s>aussi</s></p><ul><li><input type="checkbox" checked> fait</li><li><input type="checkbox"> à faire</li></ul><pre><code class="language-js">let a = 1;\nb();</code></pre>');
  assert.match(md, /~~vieux~~ ~~aussi~~/);
  assert.match(md, /\[x\] fait/);
  assert.match(md, /\[ \] à faire/);
  assert.match(md, /```js?\nlet a = 1;\nb\(\);\n```/);
});

test('images : data URI conservée, source absente ignorée', () => {
  const md = htmlVersMarkdown('<p><img src="data:image/png;base64,AAAA" alt="logo"><img alt="rien"></p>');
  assert.match(md, /!\[logo\]\(data:image\/png;base64,AAAA\)/);
  assert.doesNotMatch(md, /rien/);
});

test('HTML hostile : scripts, styles, cadres, gestionnaires et liens javascript retirés', () => {
  const hostile = '<html><head><title>Titre caché</title><style>body{x:1}</style><script>alert("tete")</script></head><body onload="alert(1)">'
    + '<h1 onclick="alert(2)">Bonjour</h1><script>alert("corps")</script>'
    + '<p>Texte <a href="javascript:alert(3)">piège</a> <a href=" JaVaScRiPt:alert(4)">piège2</a> <a href="&#106;avascript:alert(5)">piège3</a> <a href="https://ok.fr">sûr</a></p>'
    + '<img src="x" onerror="alert(6)" alt="i"><iframe src="https://evil.example"></iframe><object data="x"></object><embed src="y">'
    + '<scr<script>ipt>alert(7)</scr</script>ipt><!-- alert(8) --><noscript>alert(9)</noscript></body></html>';
  const md = htmlVersMarkdown(hostile);
  assert.doesNotMatch(md, /alert|<script|onerror|onclick|onload|javascript|iframe|evil\.example|Titre caché|body\{/i);
  assert.match(md, /# Bonjour/);
  assert.match(md, /\[sûr\]\(https:\/\/ok\.fr\)/);
  assert.match(md, /piège/);
});

test('un script jamais refermé est retiré jusqu’à la fin', () => {
  const md = htmlVersMarkdown('<p>avant</p><script>alert(1)');
  assert.match(md, /avant/);
  assert.doesNotMatch(md, /alert|script/);
});

test('entrées vides ou invalides : pas d’exception', () => {
  for (const v of ['', '   ', null, undefined, '<', '<<<>>>', '<p', '&&&;', '\u0000']) assert.doesNotThrow(() => htmlVersMarkdown(v));
  assert.equal(htmlVersMarkdown(''), '');
});

test('décodage des octets HTML : UTF-8 par défaut, charset déclaré respecté', () => {
  assert.equal(imp.decoderOctets(new TextEncoder().encode('<p>é€</p>')), '<p>é€</p>');
  const latin = Uint8Array.from([...Buffer.from('<meta charset="iso-8859-1"><p>', 'latin1'), 0xe9, ...Buffer.from('</p>')]);
  assert.match(imp.decoderOctets(latin), /<p>é<\/p>/);
  assert.doesNotThrow(() => imp.decoderOctets(new Uint8Array([0xff, 0xfe, 0x00])));
});

test('importation.js : lit un .html et un .docx, refuse le reste', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-imp-'));
  try {
    const html = path.join(dossier, 'page.HTML');
    fs.writeFileSync(html, '<p>x</p>');
    const r = await lireFichierImport(html);
    assert.equal(r.type, 'html');
    assert.equal(r.nom, 'page.HTML');
    assert.equal(Buffer.from(r.octets).toString(), '<p>x</p>');
    const docx = path.join(dossier, 'a.docx');
    fs.writeFileSync(docx, 'PK');
    assert.equal((await lireFichierImport(docx)).type, 'docx');
    const exe = path.join(dossier, 'a.exe');
    fs.writeFileSync(exe, 'x');
    assert.match((await lireFichierImport(exe)).erreur, /non pris en charge/);
    assert.match((await lireFichierImport(path.join(dossier, 'absent.docx'))).erreur, /Lecture impossible/);
    assert.match((await lireFichierImport(dossier + '.html')).erreur, /Lecture impossible/);
    assert.match((await lireFichierImport(null)).erreur, /invalide/);
    fs.mkdirSync(path.join(dossier, 'dir.html'));
    assert.match((await lireFichierImport(path.join(dossier, 'dir.html'))).erreur, /pas un fichier/);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('importation.js : un fichier au-delà de la borne est refusé sans être lu', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-imp-'));
  try {
    const f = path.join(dossier, 'gros.html');
    fs.writeFileSync(f, 'x'.repeat(2048));
    assert.match((await lireFichierImport(f, 1024)).erreur, /trop volumineux/);
    assert.equal(MAX_OCTETS, 50 * 1024 * 1024);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

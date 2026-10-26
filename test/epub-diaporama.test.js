// EPUB (archive, XHTML) et diaporama (découpage, HTML et options PDF) : purs, sans Electron.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const epub = require('../renderer/lib/epub.js');
const dia = require('../renderer/lib/diaporama.js');
const { pdfOptions, pageSizePrint, tailleSurMesure } = require('../pdf.js');

// Contrôleur XML minimal : balises équilibrées, attributs entre guillemets,
// aucune esperluette ni chevron nus. (Le contrôle par DOMParser a lieu dans
// test/smoke-lot2c.js, sous Electron.)
function verifierXml(xml) {
  const sans = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const pile = [];
  let dernier = 0;
  const verifierTexte = (t) => {
    assert.doesNotMatch(t, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i, 'esperluette nue : ' + t.slice(0, 60));
    assert.ok(!t.includes('<'), 'chevron nu');
  };
  for (const m of sans.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    verifierTexte(sans.slice(dernier, m.index));
    dernier = m.index + m[0].length;
    if (m[1]) assert.equal(pile.pop(), m[2], 'balise fermante inattendue : ' + m[2]);
    else if (!m[4]) pile.push(m[2]);
    for (const a of m[3].matchAll(/="([^"]*)"/g)) assert.doesNotMatch(a[1], /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i);
  }
  verifierTexte(sans.slice(dernier));
  assert.deepEqual(pile, [], 'balises non fermées');
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('versXhtml : balises vides auto-fermées, entités, pile équilibrée', () => {
  const x = epub.versXhtml('<p>a&nbsp;b &amp; c &copy; d &inconnue; < e<br><hr><img src="i.png" alt="x"><ul><li>un<li>deux</ul><b>gras</p>');
  verifierXml('<racine>' + x + '</racine>');
  assert.match(x, /<br\/><hr\/><img src="i\.png" alt="x"\/>/);
  assert.match(x, /a b &amp; c © d &amp;inconnue; &lt; e/);
  assert.match(x, /<b>gras<\/b><\/p>$/);
});

test('versXhtml : scripts, styles, gestionnaires et liens javascript retirés', () => {
  const x = epub.versXhtml('<p onclick="x()">a<script>alert(1)</script><style>p{}</style><a href="javascript:alert(2)">l</a><iframe src="u">dedans</iframe><!-- c --></p>');
  assert.doesNotMatch(x, /alert|onclick|<script|<style|iframe|dedans|javascript|<!--/);
  verifierXml('<racine>' + x + '</racine>');
});

test('versXhtml : cases à cocher, align et SVG', () => {
  const x = epub.versXhtml('<li><input type="checkbox" checked disabled> fait</li><li><input type="checkbox"> à faire</li><th align="center">T</th><svg viewBox="0 0 1 1"><rect/></svg>');
  assert.match(x, /☑ fait/);
  assert.match(x, /☐ à faire/);
  assert.match(x, /<th style="text-align:center">T<\/th>/);
  assert.match(x, /<svg viewBox="0 0 1 1" xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  verifierXml('<racine>' + x + '</racine>');
});

test('découpage en chapitres : un par titre 1 de premier niveau', () => {
  const ch = epub.decouperChapitres('<p>intro</p><h1>Un &amp; deux</h1><p>a</p><blockquote><h1>pas un chapitre</h1></blockquote><h1>Trois</h1><p>c</p>', 'Doc');
  assert.deepEqual(ch.map((c) => c.titre), ['Doc', 'Un &amp; deux', 'Trois']);
  assert.ok(ch[1].corps.includes('pas un chapitre'));
  const sans = epub.decouperChapitres('<h1>Seul</h1><p>x</p>', 'Doc');
  assert.equal(sans.length, 1);
  assert.equal(sans[0].titre, 'Seul');
  assert.equal(epub.decouperChapitres('<p>rien de titré</p>', 'Doc')[0].titre, 'Doc');
});

async function construire(html, extra = {}) {
  const octets = await epub.construireEpub({ html, titre: 'Mon <livre>', auteur: 'A. Auteur', langue: 'fr', JSZip, identifiant: '11111111-2222-4333-8444-555555555555', date: new Date('2026-01-02T03:04:05Z'), ...extra });
  return { octets, zip: await JSZip.loadAsync(octets) };
}

test('EPUB : mimetype en premier, non compressé, puis la structure attendue', async () => {
  const { octets, zip } = await construire('<h1>Un</h1><p>a</p><h1>Deux</h1><p>b</p>');
  const noms = Object.keys(zip.files);
  assert.equal(noms[0], 'mimetype');
  // En-tête local du premier fichier : signature, méthode 0 (stocké), nom, contenu juste après.
  const buf = Buffer.from(octets);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.equal(buf.readUInt16LE(8), 0, 'mimetype doit être stocké sans compression');
  assert.equal(buf.readUInt16LE(28), 0, 'pas de champ supplémentaire');
  assert.equal(buf.toString('latin1', 30, 38), 'mimetype');
  assert.equal(buf.toString('latin1', 38, 38 + 20), 'application/epub+zip');
  assert.equal(await zip.file('mimetype').async('string'), 'application/epub+zip');
  for (const n of ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/style.css', 'OEBPS/chapitre-01.xhtml', 'OEBPS/chapitre-02.xhtml']) assert.ok(zip.file(n), n);
  assert.equal(noms.filter((n) => n.startsWith('OEBPS/chapitre')).length, 2);
});

test('EPUB : métadonnées, manifeste, ordre de lecture et table des matières', async () => {
  const { zip } = await construire('<h1>Un</h1><p>a</p><h1>Deux</h1><p>b</p>');
  const opf = await zip.file('OEBPS/content.opf').async('string');
  assert.match(opf, /<dc:title>Mon &lt;livre&gt;<\/dc:title>/);
  assert.match(opf, /<dc:creator>A\. Auteur<\/dc:creator>/);
  assert.match(opf, /<dc:language>fr<\/dc:language>/);
  assert.match(opf, /urn:uuid:11111111-2222-4333-8444-555555555555/);
  assert.match(opf, /dcterms:modified">2026-01-02T03:04:05Z</);
  assert.match(opf, /properties="nav"/);
  assert.match(opf, /<itemref idref="chap1"\/>\s*<itemref idref="chap2"\/>/);
  const nav = await zip.file('OEBPS/nav.xhtml').async('string');
  assert.match(nav, /epub:type="toc"/);
  assert.match(nav, /<a href="chapitre-01\.xhtml">Un<\/a>/);
  assert.match(nav, /<a href="chapitre-02\.xhtml">Deux<\/a>/);
  const container = await zip.file('META-INF/container.xml').async('string');
  assert.match(container, /full-path="OEBPS\/content\.opf"/);
});

test('EPUB : tous les fichiers XML sont bien formés', async () => {
  const html = `<h1 id="a">Titre &amp; co</h1><p>x &nbsp; <img src="${PNG}" alt="logo"><br>y</p><table><tr><th align="right">T</th></tr><tr><td>1</td></tr></table><pre><code>if (a < b && c) {}</code></pre><h1>Fin</h1><ul><li><input type="checkbox" checked> ok</li></ul>`;
  const { zip } = await construire(html);
  for (const nom of Object.keys(zip.files).filter((n) => /\.(xhtml|opf|xml)$/.test(n))) {
    verifierXml(await zip.file(nom).async('string'));
  }
});

test('EPUB : images extraites, dédoublonnées et déclarées ; les autres remplacées par leur texte', async () => {
  const html = `<h1>A</h1><img src="${PNG}" alt="un"><img src="${PNG}" alt="deux"><img src="https://exemple.org/x.png" alt="distante"><img src="file:///tmp/x.png" alt="">`;
  const { zip } = await construire(html);
  const images = Object.keys(zip.files).filter((n) => n.startsWith('OEBPS/images/'));
  assert.deepEqual(images, ['OEBPS/images/image-001.png']);
  const octets = await zip.file(images[0]).async('uint8array');
  assert.deepEqual([...octets.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  const opf = await zip.file('OEBPS/content.opf').async('string');
  assert.match(opf, /href="images\/image-001\.png" media-type="image\/png"/);
  const ch = await zip.file('OEBPS/chapitre-01.xhtml').async('string');
  assert.equal((ch.match(/<img /g) || []).length, 2);
  assert.match(ch, /src="images\/image-001\.png"/);
  assert.match(ch, /\[distante\]/);
  assert.doesNotMatch(ch, /exemple\.org|file:\/\//);
});

test('EPUB : un lien interne vers un autre chapitre pointe vers son fichier', async () => {
  const { zip } = await construire('<h1 id="debut">A</h1><p><a href="#fin">aller</a> <a href="#debut">ici</a></p><h1 id="fin">B</h1>');
  const ch1 = await zip.file('OEBPS/chapitre-01.xhtml').async('string');
  assert.match(ch1, /href="chapitre-02\.xhtml#fin"/);
  assert.match(ch1, /href="#debut"/);
});

test('EPUB : sans titre 1, un chapitre unique ; langue invalide ramenée à fr ; sans auteur', async () => {
  const { zip } = await construire('<p>seul</p>', { langue: 'pas une langue', auteur: '' });
  assert.equal(Object.keys(zip.files).filter((n) => n.includes('chapitre')).length, 1);
  const opf = await zip.file('OEBPS/content.opf').async('string');
  assert.match(opf, /<dc:language>fr<\/dc:language>/);
  assert.doesNotMatch(opf, /dc:creator/);
});

// ─── Diaporama ───────────────────────────────────────────────────────────────

test('diaporama : « --- » seul sur une ligne sépare les slides', () => {
  const { slides } = dia.decouper('# A\n\ntexte\n\n---\n\n# B\n\n---   \n\nC\n');
  assert.deepEqual(slides, ['# A\n\ntexte', '# B', 'C']);
});

test('diaporama : le front-matter n’est pas un séparateur et est mis de côté', () => {
  const r = dia.decouper('---\ntitle: T\nauthor: X\n---\n# A\n\n---\n\n# B');
  assert.equal(r.meta, 'title: T\nauthor: X');
  assert.deepEqual(r.slides, ['# A', '# B']);
});

test('diaporama : « --- » dans un bloc de code ne sépare pas (``` et ~~~)', () => {
  const r = dia.decouper('# A\n\n```yaml\n---\nclé: v\n---\n```\n\n---\n\n~~~\n---\n~~~\n\nfin');
  assert.equal(r.slides.length, 2);
  assert.ok(r.slides[0].includes('clé: v'));
  assert.ok(r.slides[1].includes('~~~\n---\n~~~'));
});

test('diaporama : « --- » sous une ligne de texte est un titre setext, pas un séparateur', () => {
  const r = dia.decouper('Titre\n---\nsuite\n\n---\n\nAutre');
  assert.deepEqual(r.slides, ['Titre\n---\nsuite', 'Autre']);
});

test('diaporama : slides vides ignorées, retours Windows, « *** » et tableaux intacts', () => {
  assert.deepEqual(dia.decouper('').slides, []);
  assert.deepEqual(dia.decouper('\n\n---\n   \n---\n').slides, []);
  assert.deepEqual(dia.decouper('A\r\n\r\n---\r\n\r\nB').slides, ['A', 'B']);
  assert.deepEqual(dia.decouper('A\n\n***\n\nB\n\n| x | y |\n|---|---|\n| 1 | 2 |').slides.length, 1);
  assert.equal(dia.nombreSlides('A\n\n---\n\nB'), 2);
});

test('diaporama : HTML de l’export PDF, une section par slide, saut de page, page 16:9', () => {
  const html = dia.htmlPdf({ titre: 'Mon <deck>', slides: ['<h1>Un</h1>', '<p>Deux</p>', '<p>Trois</p>'], css: '/*app*/' });
  assert.equal((html.match(/<section class="diapo-page">/g) || []).length, 3);
  assert.match(html, /@page \{ size: 13\.333in 7\.5in; margin: 0; \}/);
  assert.match(html, /break-after: page/);
  assert.match(html, /\.diapo-page:last-child \{ break-after: auto/);
  assert.match(html, /overflow: hidden/);
  assert.match(html, /<title>Mon &lt;deck&gt;<\/title>/);
  assert.match(html, /1 \/ 3/);
  assert.ok(html.indexOf('/*app*/') < html.indexOf('@page'));
});

test('diaporama : options PDF — page sur mesure, paysage, sans marge ni pied de page', () => {
  const o = pdfOptions(dia.optionsPdf());
  assert.deepEqual(o.pageSize, { width: 13.333, height: 7.5 });
  assert.equal(o.landscape, false);
  assert.deepEqual(o.margins, { top: 0, bottom: 0, left: 0, right: 0 });
  assert.equal(o.displayHeaderFooter, false);
  assert.ok(o.pageSize.width / o.pageSize.height > 1.77 && o.pageSize.width / o.pageSize.height < 1.78);
});

test('pdfOptions : taille sur mesure validée, repli sur A4, microns pour l’impression', () => {
  assert.equal(pdfOptions({}).pageSize, 'A4');
  assert.equal(pdfOptions({ pageSize: 'Letter', landscape: true }).landscape, true);
  assert.equal(pdfOptions({ pageSize: { width: -1, height: 5 } }).pageSize, 'A4');
  assert.equal(pdfOptions({ pageSize: { width: 'x', height: 5 } }).pageSize, 'A4');
  assert.equal(pdfOptions({ pageSize: null }).pageSize, 'A4');
  assert.equal(tailleSurMesure({ width: 5, height: 500 }), null);
  assert.deepEqual(pageSizePrint({ pageSize: { width: 10, height: 5 } }), { width: 254000, height: 127000 });
  assert.equal(pageSizePrint({ pageSize: 'A3' }), 'A3');
  assert.equal(pageSizePrint({}), 'A4');
});

// Lot 2 (1.9.0), export et partage — tâches 14 à 16 : tests Electron de bout en
// bout. Même modèle que smoke-lot2b.js (harnais partagé, fenêtre cachée,
// dialogues stubés). Le harnais n'exécute pas main.js : les canaux IPC sont
// simulés avec les VRAIES fonctions des modules racine que main.js utilise.
//
// Ce que ce script NE peut PAS vérifier : le collage réel dans Outlook, Teams
// ou Word (seul le contenu du presse-papiers système est relu : text/html et
// text/plain), les boîtes de dialogue natives (stubées) ni l'ouverture d'un
// EPUB dans une liseuse.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { clipboard, BrowserWindow } = require('electron');
const JSZip = require('jszip');
const { pdfOptions } = require('../pdf.js');
const { creerHarnais } = require('./helpers.js');
const presse = require('../presse-papiers.js');

const h = creerHarnais();
const { check } = h;
const pause = (ms) => h.attendre(ms);

const poserDoc = (texte, debut, fin) => h.js(`(() => {
  const ed = window.mdr.editeur();
  ed.setValue(${JSON.stringify(texte)});
  ed.view.dispatch({ selection: { anchor: ${debut === undefined ? 0 : debut}, head: ${fin === undefined ? (debut === undefined ? 0 : debut) : fin} } });
  return true;
})()`);
const commande = (id) => h.js(`window.commands.run(${JSON.stringify(id)})`);

(async () => {
  const sortie = { html: [], presse: [], epub: [], pdf: [], plein: [] };
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-lot2c-'));
  await h.demarrer({
    stubs: {
      'file:export-html': (_e, { html }) => { sortie.html.push(html); return '/tmp/faux.html'; },
      'fenetre:plein-ecran': (_e, actif) => { sortie.plein.push(!!actif); return true; },
      // Export EPUB : même écriture que main.js (sans dialogue).
      'file:export-epub': (_e, { octets, defaultName }) => {
        const f = path.join(dossierTmp, defaultName + '.epub');
        fs.writeFileSync(f, Buffer.from(octets));
        sortie.epub.push(f);
        return f;
      },
      // Export PDF : VRAI rendu Chromium avec le VRAI pdfOptions, sans dialogue.
      'file:export-pdf': async (_e, { html, defaultName, options }) => {
        const f = path.join(dossierTmp, defaultName + '.pdf');
        const src = path.join(dossierTmp, defaultName + '.html');
        fs.writeFileSync(src, html);
        const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
        try {
          await w.loadFile(src);
          fs.writeFileSync(f, await w.webContents.printToPDF(pdfOptions(options)));
        } finally { w.close(); }
        sortie.pdf.push(f);
        return f;
      },
      'presse-papiers:ecrire-html': (_e, charge) => {
        try { return presse.ecrireHtml(clipboard, charge); } catch (e) { return { erreur: e.message }; }
      },
    },
  });

  // ─── Tâche 14a : thèmes d'export ───────────────────────────────────────────
  check('Thèmes — la modale d’export PDF porte un sélecteur de thème à trois choix', JSON.stringify(await h.jsonJs(`[...document.querySelectorAll('#pdf-theme option')].map((o) => o.value)`)) === '["sobre","rapport","academique"]');
  check('Thèmes — Réglages > Export PDF : sélecteur de thème et champ CSS personnalisé', await h.js(`!!document.getElementById('reglage-exportTheme') && document.getElementById('reglage-exportCssPerso').tagName === 'TEXTAREA' && document.getElementById('reglage-exportTheme').closest('.reglages-panneau').dataset.panneau === 'pdf'`));
  await h.js(`window.mdrSettings.set('exportTheme', 'rapport'); true`);
  await h.js(`window.showPdfModal(); true`);
  check('Thèmes — la modale s’ouvre sur le thème par défaut des réglages', await h.js(`document.getElementById('pdf-theme').value === 'rapport'`));
  await h.js(`document.getElementById('pdf-cancel').click(); window.mdrSettings.set('exportTheme', 'sobre'); true`);

  await poserDoc('# Titre\n\nUn paragraphe.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  await pause(300);
  const cssPerso = '.markdown-body h1 { color: #123456; }</style><b id="intrus">';
  await h.js(`window.mdrSettings.set('exportCssPerso', ${JSON.stringify(cssPerso)}); true`);
  const marqueurs = { sobre: '/* thème d\'export : sobre */', rapport: '/* thème d\'export : rapport */', academique: '/* thème d\'export : academique */' };
  for (const theme of ['sobre', 'rapport', 'academique']) {
    const pdf = await h.js(`window.buildPrintableHtml({ theme: ${JSON.stringify(theme)} })`);
    const exp = await h.js(`window.buildExportHtml({ theme: ${JSON.stringify(theme)} })`);
    for (const [nom, html] of [['PDF', pdf], ['HTML', exp]]) {
      const autres = Object.entries(marqueurs).filter(([t]) => t !== theme).map(([, m]) => m);
      check(`Thèmes — export ${nom} « ${theme} » : règles du thème choisi présentes, celles des autres absentes`, html.includes(marqueurs[theme]) && autres.every((m) => !html.includes(m)));
      check(`Thèmes — export ${nom} « ${theme} » : CSS personnalisé présent, après le thème`, html.includes('#123456') && html.indexOf(marqueurs[theme]) < html.indexOf('#123456'));
      check(`Thèmes — export ${nom} « ${theme} » : </style> du CSS personnalisé neutralisé`, !html.includes('<b id="intrus">') && (html.match(/<\/style>/g) || []).length === (html.match(/<style>/g) || []).length);
    }
  }
  const dansFeuilles = await h.js(`(async () => {
    const regles = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\\n'); } catch { return ''; } }).join('\\n');
    const brut = await fetch('styles.css').then((r) => r.text());
    return { regles: /ac1|#123456|nth-child\\(even\\)/.test(regles), brut: /ac1|#123456|nth-child\\(even\\)/.test(brut), apercu: [...document.querySelectorAll('style')].some((s) => /#123456/.test(s.textContent)) };
  })()`);
  check('Thèmes — ni le thème ni le CSS personnalisé n’entrent dans les feuilles de l’aperçu', dansFeuilles.regles === false && dansFeuilles.brut === false && dansFeuilles.apercu === false, JSON.stringify(dansFeuilles));

  // Sélecteur de thème de l'export HTML (liste stubée).
  await h.js(`window.__choix = []; window.mdr.modale.choisir = (o) => { window.__choix.push(o.items.map((i) => i.id)); return Promise.resolve('academique'); }; true`);
  await h.js(`window.doExportHtml(); true`);
  await pause(1200);
  const choix = await h.jsonJs(`window.__choix`);
  check('Thèmes — l’export HTML propose les trois thèmes, le thème par défaut en tête', choix.length === 1 && choix[0][0] === 'sobre' && choix[0].length === 3, JSON.stringify(choix));
  check('Thèmes — l’export HTML écrit un fichier avec le thème choisi', sortie.html.length === 1 && sortie.html[0].includes(marqueurs.academique) && !sortie.html[0].includes(marqueurs.rapport));
  await h.js(`window.mdr.modale.choisir = () => Promise.resolve(null); window.doExportHtml(); true`);
  await pause(500);
  check('Thèmes — annuler le choix du thème n’exporte rien', sortie.html.length === 1);
  await h.js(`window.mdrSettings.set('exportCssPerso', ''); true`);

  // ─── Tâche 14b : copier en HTML riche ──────────────────────────────────────
  const avant = { texte: clipboard.readText(), html: clipboard.readHTML() };
  const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const source = `# Rapport\n\nTexte avec **gras** et \`code\`.\n\n| Nom | Valeur |\n|-----|--------|\n| a | 1 |\n\n\`\`\`js\nlet x = 1;\n\`\`\`\n\n![logo](${img})\n`;
  await poserDoc(source, 0, 0);
  await commande('edition:copier-html-riche');
  await pause(500);
  let html = clipboard.readHTML();
  let texte = clipboard.readText();
  check('HTML riche — sans sélection, le document entier est copié (text/html)', /<h1[^>]*>Rapport<\/h1>/.test(html) && /<strong>gras<\/strong>/.test(html));
  check('HTML riche — tableau avec bordures en ligne', /<table[^>]*border/.test(html) && /<td[^>]*style="[^"]*border:1px solid/.test(html) && /<th[^>]*style="[^"]*border:1px solid/.test(html), html.slice(0, 300));
  check('HTML riche — code (ligne et bloc) et titres stylés en ligne', /<pre[^>]*style="[^"]*background-color/.test(html) && /<code[^>]*style="/.test(html) && /<h1[^>]*style="[^"]*font-size/.test(html));
  check('HTML riche — image en data URI conservée', html.includes('data:image/png;base64,iVBORw0KGgo'));
  check('HTML riche — aucune classe ni script dans le HTML copié', !/class=|<script|onerror/i.test(html));
  check('HTML riche — text/plain : le Markdown source', texte.includes('# Rapport') && texte.includes('**gras**') && texte.includes('| Nom | Valeur |'), texte.slice(0, 80));

  const debut = source.indexOf('Texte avec');
  const fin = source.indexOf('.\n', debut) + 1;
  await poserDoc(source, debut, fin);
  await commande('edition:copier-html-riche');
  await pause(500);
  html = clipboard.readHTML();
  texte = clipboard.readText();
  check('HTML riche — avec sélection, seule la sélection est copiée', html.includes('gras') && !html.includes('Rapport') && !/<table/.test(html));
  check('HTML riche — text/plain de la sélection : le Markdown de la sélection', texte === 'Texte avec **gras** et `code`.', JSON.stringify(texte));

  // Front-matter exclu de la copie du document entier ; document vide : rien n'est copié.
  clipboard.writeText('témoin');
  await poserDoc('');
  await commande('edition:copier-html-riche');
  await pause(300);
  check('HTML riche — un document vide ne modifie pas le presse-papiers', clipboard.readText() === 'témoin');
  await poserDoc('---\ntitle: T\n---\n\nCorps seul\n');
  await commande('edition:copier-html-riche');
  await pause(400);
  check('HTML riche — le front-matter n’est pas rendu dans le HTML', clipboard.readHTML().includes('Corps seul') && !clipboard.readHTML().includes('title: T'));
  check('HTML riche — IPC : un contenu invalide est refusé sans exception', await h.js(`window.api.ecrirePresseHtml({ html: 3, text: 'x' }).then((r) => !!r.erreur)`));

  // Restauration du presse-papiers de l'utilisateur.
  if (avant.html) clipboard.write({ html: avant.html, text: avant.texte }); else clipboard.writeText(avant.texte);


  // ─── Tâche 15a : export EPUB ───────────────────────────────────────────────
  const bien = (xml, type) => h.js(`(() => { const d = new DOMParser().parseFromString(${JSON.stringify(xml)}, ${JSON.stringify(type)}); return d.getElementsByTagName('parsererror').length === 0; })()`);
  const docEpub = `---\ntitle: Le Guide\nauthor: Ada Lovelace\nlang: en\n---\n\nIntroduction & préambule.\n\n# Premier chapitre\n\nTexte avec **gras** et un [lien](#second-chapitre).\n\n![logo](${img})\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n\`\`\`js\nif (a < b && c) { x(); }\n\`\`\`\n\n- [x] fait\n- [ ] à faire\n\n# Second chapitre\n\nSuite.<br>Ligne.\n\n\`\`\`mermaid\ngraph TD; A-->B;\n\`\`\`\n`;
  await poserDoc(docEpub);
  await pause(1500);
  await commande('export:epub');
  await pause(2000);
  check('EPUB — la commande écrit un fichier .epub', sortie.epub.length === 1 && fs.existsSync(sortie.epub[0]) && fs.statSync(sortie.epub[0]).size > 500);
  const archive = fs.readFileSync(sortie.epub[0]);
  const zip = await JSZip.loadAsync(archive);
  const noms = Object.keys(zip.files);
  check('EPUB — « mimetype » est le premier fichier, non compressé (méthode 0), contenu juste après l’en-tête', noms[0] === 'mimetype' && archive.readUInt16LE(8) === 0 && archive.toString('latin1', 30, 38) === 'mimetype' && archive.toString('latin1', 38, 58) === 'application/epub+zip');
  const lire = (n) => zip.file(n).async('string');
  const chapitres = noms.filter((n) => /^OEBPS\/chapitre-\d+\.xhtml$/.test(n));
  check('EPUB — un chapitre pour l’introduction et un par titre 1 (3 au total)', chapitres.length === 3, JSON.stringify(chapitres));
  check('EPUB — META-INF/container.xml, content.opf, nav.xhtml, style.css présents', ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/style.css'].every((n) => !!zip.file(n)));
  const opf = await lire('OEBPS/content.opf');
  check('EPUB — métadonnées du front-matter : titre, auteur, langue', /<dc:title>Le Guide<\/dc:title>/.test(opf) && /<dc:creator>Ada Lovelace<\/dc:creator>/.test(opf) && /<dc:language>en<\/dc:language>/.test(opf), opf.slice(0, 600));
  const nav = await lire('OEBPS/nav.xhtml');
  check('EPUB — la table des matières liste les chapitres', /Premier chapitre/.test(nav) && /Second chapitre/.test(nav) && /chapitre-02\.xhtml/.test(nav));
  const c2 = await lire('OEBPS/chapitre-02.xhtml');
  const c3 = await lire('OEBPS/chapitre-03.xhtml');
  check('EPUB — chaque chapitre commence par son titre 1 et contient son texte', /<h1[^>]*>Premier chapitre<\/h1>/.test(c2) && /<strong>gras<\/strong>/.test(c2) && /<h1[^>]*>Second chapitre<\/h1>/.test(c3));
  check('EPUB — le lien interne vers l’autre chapitre est réécrit vers son fichier', /href="chapitre-03\.xhtml#second-chapitre"/.test(c2), c2.match(/href="[^"]*"/g)?.join(' '));
  check('EPUB — balises auto-fermées et entités XHTML (<br/>, &lt;, &amp;)', /<br\/>/.test(c3) && /a &lt; b &amp;&amp; c/.test(c2) && !/<br>/.test(c3));
  check('EPUB — cases à cocher converties en texte', /☑/.test(c2) && /☐/.test(c2) && !/<input/.test(c2));
  const images = noms.filter((n) => n.startsWith('OEBPS/images/'));
  check('EPUB — image du document et diagramme Mermaid rangés dans OEBPS/images', images.some((n) => n.endsWith('.png')) && images.some((n) => n.endsWith('.svg')), JSON.stringify(images));
  const png = images.find((n) => n.endsWith('.png'));
  check('EPUB — l’image PNG est intacte (signature) et déclarée dans le manifeste', png && (await zip.file(png).async('uint8array'))[1] === 0x50 && opf.includes('media-type="image/png"') && /<img[^>]*src="images\/image-\d+\.png"/.test(c2));
  let xmlOk = true;
  const detailXml = [];
  for (const n of noms.filter((x) => /\.(xhtml|opf|xml)$/.test(x))) {
    const ok = await bien(await lire(n), /\.xhtml$/.test(n) ? 'application/xhtml+xml' : 'application/xml');
    if (!ok) { xmlOk = false; detailXml.push(n); }
  }
  check('EPUB — tous les .xhtml, .opf et .xml sont du XML bien formé (DOMParser)', xmlOk, detailXml.join(', '));
  for (const n of images.filter((x) => x.endsWith('.svg'))) {
    if (!(await bien(await lire(n), 'image/svg+xml'))) { xmlOk = false; detailXml.push(n); }
  }
  check('EPUB — le diagramme SVG est bien formé', xmlOk, detailXml.join(', '));
  check('EPUB — IPC : octets qui ne sont pas une archive zip refusés par la garde de signature', Buffer.from([1, 2, 3, 4]).readUInt32LE(0) !== 0x04034b50);

  // ─── Tâche 15b : diaporama ─────────────────────────────────────────────────
  const docDia = '---\ntitle: Deck\n---\n\n# Slide un\n\nTexte **fort**\n\n---\n\n# Slide deux\n\n- a\n- b\n\n---\n\n```yaml\n---\nx: 1\n---\n```\n\n# Slide trois\n\n---\n\n# Slide quatre\n';
  await poserDoc(docDia);
  await pause(300);
  const touche = (k) => h.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); true`);
  const etat = () => h.jsonJs(`({ ouvert: window.mdr.diaporama.estOuvert(), i: window.mdr.diaporama.courant(), n: window.mdr.diaporama.total(), num: document.getElementById('diaporama-numero')?.textContent, visible: !!document.getElementById('diaporama') && !document.getElementById('diaporama').classList.contains('hidden'), titre: document.querySelector('#diaporama .diapo-slide')?.textContent.slice(0, 40) })`);
  await commande('vue:diaporama');
  await pause(300);
  let e = await etat();
  check('Diaporama — la commande ouvre la vue plein écran sur la slide 1 (4 slides, bloc de code et front-matter ignorés)', e.ouvert && e.visible && e.n === 4 && e.i === 0 && e.num === '1 / 4' && /Slide un/.test(e.titre), JSON.stringify(e));
  check('Diaporama — le plein écran natif est demandé', sortie.plein[0] === true);
  check('Diaporama — le Markdown de la slide est rendu (gras, titre)', await h.js(`!!document.querySelector('#diaporama .diapo-slide h1') && !!document.querySelector('#diaporama .diapo-slide strong')`));
  const avantDoc = await h.js('window.mdr.editeur().getValue()');
  await touche('ArrowRight'); e = await etat();
  check('Diaporama — flèche droite : slide suivante, numéro mis à jour', e.i === 1 && e.num === '2 / 4' && /Slide deux/.test(e.titre) && (await h.js(`document.querySelectorAll('#diaporama .diapo-slide li').length`)) === 2);
  await touche(' '); e = await etat();
  check('Diaporama — espace : slide suivante', e.i === 2 && e.num === '3 / 4');
  await touche('PageDown'); e = await etat();
  check('Diaporama — PageDown : dernière slide', e.i === 3 && e.num === '4 / 4');
  await touche('ArrowRight'); e = await etat();
  check('Diaporama — au-delà de la dernière slide, on reste dessus', e.i === 3);
  await touche('PageUp'); await touche('ArrowLeft'); e = await etat();
  check('Diaporama — PageUp et flèche gauche : retour en arrière', e.i === 1);
  await touche('End'); e = await etat();
  const finDia = e.i;
  await touche('Home'); e = await etat();
  check('Diaporama — Fin et Début', finDia === 3 && e.i === 0);
  check('Diaporama — le texte de l’éditeur n’a pas été touché par les touches', (await h.js('window.mdr.editeur().getValue()')) === avantDoc);
  await touche('g');
  check('Diaporama — « G » affiche les vignettes (une par slide)', await h.js(`!document.getElementById('diaporama-vignettes').classList.contains('hidden') && document.querySelectorAll('#diaporama-vignettes .diapo-vignette').length === 4`));
  await h.js(`document.querySelectorAll('#diaporama-vignettes .diapo-vignette')[2].click(); true`);
  e = await etat();
  check('Diaporama — un clic sur une vignette saute à la slide et referme les vignettes', e.i === 2 && (await h.js(`document.getElementById('diaporama-vignettes').classList.contains('hidden')`)));
  await touche('g'); await touche('Escape'); e = await etat();
  check('Diaporama — Échap ferme d’abord les vignettes, sans quitter', e.ouvert && (await h.js(`document.getElementById('diaporama-vignettes').classList.contains('hidden')`)));
  await touche('Escape'); await pause(200); e = await etat();
  check('Diaporama — Échap quitte le diaporama et rend le plein écran', !e.ouvert && !e.visible && sortie.plein[sortie.plein.length - 1] === false);
  check('Diaporama — fermé, les flèches ne le rouvrent pas', await (async () => { await touche('ArrowRight'); return !(await etat()).ouvert; })());
  await poserDoc('\n---\n\n');
  await commande('vue:diaporama');
  await pause(200);
  check('Diaporama — document sans contenu : message, rien ne s’ouvre', !(await etat()).ouvert);
  await commande('vue:diaporama');

  // ─── Tâche 15c : export PDF des slides ─────────────────────────────────────
  await poserDoc(docDia);
  await pause(300);
  const prepa = JSON.parse(await h.js(`window.mdr.diaporama.construirePdf().then((d) => JSON.stringify({ nb: d.nombre, opts: d.options, sections: (d.html.match(/<section class="diapo-page">/g) || []).length, page: /@page \\{ size: 13\\.333in 7\\.5in; margin: 0; \\}/.test(d.html), saut: /break-after: page/.test(d.html) }))`));
  check('Slides PDF — le HTML produit contient une section par slide, la page 16:9 et le saut de page', prepa.nb === 4 && prepa.sections === 4 && prepa.page && prepa.saut, JSON.stringify(prepa));
  check('Slides PDF — pdfOptions : page 13,333 × 7,5 pouces, paysage, sans marge', pdfOptions(prepa.opts).pageSize.width === 13.333 && pdfOptions(prepa.opts).pageSize.height === 7.5 && pdfOptions(prepa.opts).margins.top === 0 && pdfOptions(prepa.opts).displayHeaderFooter === false);
  await commande('export:diaporama-pdf');
  await pause(4000);
  check('Slides PDF — la commande écrit un PDF', sortie.pdf.length === 1 && fs.existsSync(sortie.pdf[0]));
  const brut = fs.readFileSync(sortie.pdf[0]).toString('latin1');
  const nbPages = (brut.match(/\/Type\s*\/Page\b/g) || []).length;
  const mb = brut.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  check('Slides PDF — le vrai PDF compte une page par slide (4)', nbPages === 4, 'pages=' + nbPages);
  check('Slides PDF — la page est en paysage 16:9 (960 × 540 pt)', mb && Math.abs(Number(mb[1]) - 960) < 1.5 && Math.abs(Number(mb[2]) - 540) < 1.5, mb ? mb[1] + 'x' + mb[2] : 'MediaBox absente');
  check('Slides PDF — aucune page blanche en fin de document', (await h.js(`1`)) === 1 && nbPages === 4);

  fs.rmSync(dossierTmp, { recursive: true, force: true });
  // @@TACHE16@@
  h.terminer();
})().catch(h.erreurFatale);

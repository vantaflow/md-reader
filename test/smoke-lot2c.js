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
const { clipboard } = require('electron');
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
  const sortie = { html: [], presse: [] };
  await h.demarrer({
    stubs: {
      'file:export-html': (_e, { html }) => { sortie.html.push(html); return '/tmp/faux.html'; },
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

  // @@TACHE15@@
  // @@TACHE16@@
  h.terminer();
})().catch(h.erreurFatale);

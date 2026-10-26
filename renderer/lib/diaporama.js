// Mode diaporama : découpage d'un document en slides et gabarit HTML de l'export
// PDF « une slide par page ». Format UMD : CommonJS pour `node --test`, global
// `window.mdrDiaporama` dans le renderer. Aucun accès au DOM ni à Electron.
//
// Règle de découpage : une ligne qui ne contient que `---` (espaces autour
// permis) sépare deux slides, SAUF :
//  - dans le front-matter (bloc `---` … `---` au tout début du document) ;
//  - dans un bloc de code (clôtures ``` ou ~~~) ;
//  - juste sous une ligne de texte non vide : c'est alors le soulignement d'un
//    titre « setext » (`Titre` puis `---` = titre de niveau 2), pas un séparateur.
//    Pour séparer, laisser une ligne vide avant `---`.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrDiaporama = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  // Page 16:9 en pouces (13,333 × 7,5 = 1280 × 720 px CSS), la taille que
  // `printToPDF` reçoit en objet { width, height } (en pouces).
  const PAGE = { width: 13.333, height: 7.5 };

  const SEPARATEUR = /^[ \t]*---[ \t]*$/;
  const CLOTURE = /^[ \t]{0,3}(`{3,}|~{3,})/;

  // Renvoie { meta: texte du front-matter ou '', slides: [markdown, …] }.
  // Une slide vide (que des espaces) est ignorée.
  function decouper(source) {
    const texte = String(source || '').replace(/\r\n?/g, '\n');
    const lignes = texte.split('\n');
    let debut = 0;
    let meta = '';
    // Front-matter : même forme que stripFrontMatter() du renderer.
    if (lignes[0] === '---') {
      const fin = lignes.findIndex((l, i) => i > 0 && l === '---');
      if (fin > 0) { meta = lignes.slice(1, fin).join('\n'); debut = fin + 1; }
    }
    const slides = [];
    let courante = [];
    let cloture = null; // clôture ouvrante du bloc de code en cours
    const vider = () => {
      const md = courante.join('\n').replace(/^\n+|\s+$/g, '');
      if (md.trim()) slides.push(md);
      courante = [];
    };
    for (let i = debut; i < lignes.length; i += 1) {
      const l = lignes[i];
      const c = l.match(CLOTURE);
      if (c) {
        if (!cloture) cloture = c[1];
        else if (c[1][0] === cloture[0] && c[1].length >= cloture.length && l.trim() === c[1]) cloture = null;
      }
      if (!cloture && SEPARATEUR.test(l)) {
        const precedente = courante.length ? courante[courante.length - 1] : '';
        if (precedente.trim() === '') { vider(); continue; }
      }
      courante.push(l);
    }
    vider();
    return { meta, slides };
  }

  // Y a-t-il de quoi faire un diaporama (au moins deux slides) ?
  const nombreSlides = (source) => decouper(source).slides.length;

  const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Options d'export PDF pour des slides : page 16:9 sur mesure, aucune marge,
  // ni en-tête ni pied de page. Consommées par pdf.js (pdfOptions).
  function optionsPdf() {
    return { pageSize: { width: PAGE.width, height: PAGE.height }, landscape: false, margin: 0, headerFooter: false };
  }

  // Feuille de style des slides imprimées : une section par page, de la taille
  // exacte de la page, contenu coupé (jamais de débordement sur une 2e page).
  function cssPdf() {
    return `
    @page { size: ${PAGE.width}in ${PAGE.height}in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body.diapo-pdf { display: block; background: #fff; color: #1b1f24; font-size: 26px; line-height: 1.4; }
    .diapo-pdf .diapo-page {
      box-sizing: border-box; width: ${PAGE.width}in; height: ${PAGE.height}in; overflow: hidden;
      padding: 0.55in 0.9in; display: flex; flex-direction: column; justify-content: center;
      break-after: page; page-break-after: always; break-inside: avoid;
    }
    .diapo-pdf .diapo-page:last-child { break-after: auto; page-break-after: auto; }
    .diapo-pdf .diapo-page h1 { font-size: 2.1em; margin: 0 0 0.4em; border: 0; }
    .diapo-pdf .diapo-page h2 { font-size: 1.6em; margin: 0 0 0.4em; border: 0; }
    .diapo-pdf .diapo-page pre { font-size: 0.75em; }
    .diapo-pdf .diapo-page img { max-height: 4.8in; max-width: 100%; }
    .diapo-pdf .diapo-numero { position: absolute; right: 0.4in; bottom: 0.25in; font-size: 14px; color: #888; }
    .diapo-pdf .diapo-page { position: relative; }`;
  }

  // HTML complet de l'export : `slides` est la liste des slides déjà rendues en
  // HTML ; `css` la feuille de l'application (styles.css, KaTeX, coloration).
  function htmlPdf({ titre, slides, css = '', base = '', numeros = true } = {}) {
    const pages = (slides || []).map((h, i) => `<section class="diapo-page">${h}${numeros ? `<span class="diapo-numero">${i + 1} / ${slides.length}</span>` : ''}</section>`);
    return `<!DOCTYPE html><html data-theme="light"><head><meta charset="utf-8"><title>${echapper(titre || 'Diaporama')}</title>${base}<style>${css}
    header, #tabs, #sidebar, #editor, #statusbar, .modal { display: none !important; }
    ${cssPdf()}
  </style></head><body class="diapo-pdf"><div class="markdown-body" style="padding:0">${pages.join('')}</div></body></html>`;
  }

  return { PAGE, decouper, nombreSlides, optionsPdf, cssPdf, htmlPdf };
});

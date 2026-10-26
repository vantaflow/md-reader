// Thèmes d'export PDF / HTML : trois feuilles de style distinctes (sobre,
// rapport, académique) et le CSS personnalisé de l'utilisateur. Format UMD :
// CommonJS pour `node --test`, global `window.mdrThemesExport` dans le renderer.
//
// Ces règles ne vivent QUE dans les documents exportés (PDF, impression, HTML) :
// elles sont ajoutées après styles.css par renderer.js et n'entrent jamais dans
// les feuilles de l'application ni dans l'aperçu à l'écran.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrThemesExport = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const THEMES = [
    { id: 'sobre', libelle: 'Sobre' },
    { id: 'rapport', libelle: 'Rapport' },
    { id: 'academique', libelle: 'Académique' },
  ];
  const DEFAUT = 'sobre';
  // Taille maximale du CSS personnalisé (caractères) : un export n'a pas besoin
  // de plus, et le réglage reste un texte raisonnable à stocker.
  const MAX_CSS_PERSO = 20000;

  const ids = () => THEMES.map((t) => t.id);
  const themeValide = (id) => ids().includes(id);
  const themeOuDefaut = (id) => (themeValide(id) ? id : DEFAUT);

  // `html body .markdown-body` : trois niveaux de sélecteur, de quoi passer
  // devant `.markdown-body h1` de styles.css quel que soit l'ordre de chargement.
  const P = 'html body .markdown-body';

  const CSS = {
    // Sobre : sans empattement, peu de décor, filets fins gris, tableaux légers.
    sobre: `
    /* thème d'export : sobre */
    ${P} { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2328; }
    ${P} h1, ${P} h2, ${P} h3, ${P} h4 { font-weight: 600; line-height: 1.25; }
    ${P} h1 { font-size: 1.9em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
    ${P} h2 { font-size: 1.45em; border-bottom: 1px solid #e5e8eb; padding-bottom: 0.25em; }
    ${P} h3 { font-size: 1.2em; }
    ${P} table { border-collapse: collapse; width: auto; }
    ${P} th, ${P} td { border: 1px solid #d0d7de; padding: 5px 11px; }
    ${P} th { background: #f6f8fa; font-weight: 600; }
    ${P} pre { background: #f6f8fa; border: 1px solid #e5e8eb; }
    ${P} blockquote { border-left: 4px solid #d0d7de; color: #57606a; }`,

    // Rapport : titres colorés et espacés, chapitres sur filet épais, tableaux
    // à bandes, marges latérales généreuses, interligne aéré.
    rapport: `
    /* thème d'export : rapport */
    ${P} { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.7; color: #1b2733; padding-left: 12mm; padding-right: 12mm; box-sizing: border-box; }
    ${P} h1 { font-size: 2.1em; color: #0b3d6b; border-bottom: 3px solid #0b3d6b; padding-bottom: 0.3em; margin-top: 1.6em; letter-spacing: 0.01em; }
    ${P} h2 { font-size: 1.5em; color: #0b3d6b; border-bottom: 1px solid #9db8d2; padding-bottom: 0.2em; margin-top: 1.4em; }
    ${P} h3 { font-size: 1.2em; color: #25587f; margin-top: 1.2em; }
    ${P} h4, ${P} h5, ${P} h6 { color: #25587f; }
    ${P} p { margin: 0.6em 0 0.9em; }
    ${P} table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    ${P} th { background: #0b3d6b; color: #fff; border: 1px solid #0b3d6b; padding: 7px 12px; text-align: left; }
    ${P} td { border: 1px solid #c5d3e0; padding: 6px 12px; }
    ${P} tbody tr:nth-child(even) td { background: #eef3f8; }
    ${P} pre { background: #eef3f8; border: 1px solid #c5d3e0; border-left: 4px solid #0b3d6b; }
    ${P} blockquote { border-left: 4px solid #0b3d6b; background: #f3f7fb; color: #25405a; padding: 0.4em 1em; }
    ${P} a { color: #0b5cad; }`,

    // Académique : serif, texte justifié avec césure, titres numérotés (1, 1.1,
    // 1.1.1), retrait de première ligne, tableaux « trois filets », marges larges.
    academique: `
    /* thème d'export : academique */
    ${P} { font-family: "Times New Roman", Times, "Liberation Serif", Georgia, serif; font-size: 12pt; line-height: 1.5; color: #000; text-align: justify; hyphens: auto; -webkit-hyphens: auto; padding-left: 20mm; padding-right: 20mm; box-sizing: border-box; counter-reset: ac1 ac2 ac3; }
    ${P} h1, ${P} h2, ${P} h3, ${P} h4 { font-family: inherit; color: #000; text-align: left; border: 0; font-weight: bold; }
    ${P} h1 { font-size: 1.6em; counter-increment: ac1; counter-reset: ac2 ac3; margin-top: 1.8em; }
    ${P} h2 { font-size: 1.3em; counter-increment: ac2; counter-reset: ac3; margin-top: 1.5em; }
    ${P} h3 { font-size: 1.1em; counter-increment: ac3; font-style: italic; margin-top: 1.3em; }
    ${P} h1::before { content: counter(ac1) '. '; }
    ${P} h2::before { content: counter(ac1) '.' counter(ac2) ' '; }
    ${P} h3::before { content: counter(ac1) '.' counter(ac2) '.' counter(ac3) ' '; }
    ${P} .pdf-cover h1::before, ${P} .md-toc-title::before { content: none; }
    ${P} p { margin: 0; text-indent: 1.2em; }
    ${P} h1 + p, ${P} h2 + p, ${P} h3 + p, ${P} h4 + p, ${P} blockquote p, ${P} li p, ${P} td p, ${P} th p { text-indent: 0; }
    ${P} ul, ${P} ol { text-align: justify; }
    ${P} table { border-collapse: collapse; margin: 1.2em auto; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 0.95em; }
    ${P} th, ${P} td { border: 0; padding: 4px 12px; }
    ${P} th { border-bottom: 1px solid #000; font-weight: bold; }
    ${P} pre { background: #f5f5f5; border: 1px solid #ccc; text-align: left; font-size: 0.85em; }
    ${P} blockquote { border-left: 0; margin: 1em 2em; color: #000; font-style: italic; padding: 0; }
    ${P} a { color: #000; text-decoration: underline; }
    ${P} figure, ${P} img { text-align: center; }`,
  };

  // Retire ce qui permettrait de sortir de l'élément <style> ou d'injecter du
  // balisage : toute séquence `</style…`, `<!--`, `-->` et chaque `<` en général
  // (le CSS n'en a pas besoin). Borné à MAX_CSS_PERSO caractères. Le résultat est
  // inséré tel quel dans un <style> : le point de sortie unique.
  function nettoyerCssPerso(texte) {
    if (typeof texte !== 'string') return '';
    let s = texte.slice(0, MAX_CSS_PERSO);
    let precedent;
    do {
      precedent = s;
      s = s.replace(/<\s*\/?\s*style[^>]*>?/gi, '').replace(/<!--|-->/g, '').replace(/<\s*\/?\s*script[^>]*>?/gi, '');
    } while (s !== precedent);
    return s.replace(/</g, '').trim();
  }

  function cssTheme(id) { return CSS[themeOuDefaut(id)]; }

  // Bloc complet à insérer dans le <style> d'un export : le thème, puis le CSS
  // personnalisé (qui garde donc le dernier mot).
  function cssExport({ theme, cssPerso } = {}) {
    const perso = nettoyerCssPerso(cssPerso);
    return `${cssTheme(theme)}\n${perso ? `/* CSS personnalisé */\n${perso}` : ''}`;
  }

  return { THEMES, DEFAUT, MAX_CSS_PERSO, themeValide, themeOuDefaut, cssTheme, cssExport, nettoyerCssPerso };
});

// Styles du document : police, taille et couleurs (titres, texte) écrites dans le
// front-matter du fichier Markdown, puis appliquées à l'aperçu, au mode
// Document et aux exports PDF / HTML / Word. Fonctions pures, sans DOM. Format
// UMD : CommonJS pour les tests node, global `window.mdrStyleDoc` dans le renderer.
//
// Clés du front-matter : `police`, `taille` (en points), `couleur-titres`,
// `couleur-texte`. Exemple :
//   ---
//   title: Rapport
//   police: Georgia, serif
//   taille: 12
//   couleur-titres: "#1a5276"
//   ---
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrStyleDoc = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const CLES = { police: 'police', taille: 'taille', couleurTitres: 'couleur-titres', couleurTexte: 'couleur-texte' };
  const GENERIQUES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

  const RE_COULEUR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]{3,20})$/i;
  const RE_POLICE = /^[\p{L}\p{N}\s,.-]{1,100}$/u;

  // « "Times New Roman", serif » -> « Times New Roman, serif » (guillemets ôtés).
  function normaliserPolice(v) {
    if (typeof v !== 'string') return null;
    const s = v.replace(/["']/g, '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    return RE_POLICE.test(s) ? s : null;
  }

  // Taille en points : « 12 », « 12pt » ; « 16px » est converti (1 pt = 4/3 px).
  function normaliserTaille(v) {
    const m = /^(\d+(?:[.,]\d+)?)\s*(pt|px)?$/i.exec(String(v == null ? '' : v).trim());
    if (!m) return null;
    let n = Number(m[1].replace(',', '.'));
    if ((m[2] || '').toLowerCase() === 'px') n = Math.round(n * 0.75 * 10) / 10;
    return n >= 6 && n <= 96 ? n : null;
  }

  function normaliserCouleur(v) {
    const s = String(v == null ? '' : v).trim();
    return RE_COULEUR.test(s) ? s : null;
  }

  // Style valide tiré des métadonnées du front-matter (objet clé -> texte).
  function extraire(meta) {
    const style = {};
    if (!meta || typeof meta !== 'object') return style;
    const police = normaliserPolice(meta[CLES.police]);
    if (police) style.police = police;
    const taille = normaliserTaille(meta[CLES.taille]);
    if (taille) style.taille = taille;
    const titres = normaliserCouleur(meta[CLES.couleurTitres]);
    if (titres) style.couleurTitres = titres;
    const texte = normaliserCouleur(meta[CLES.couleurTexte]);
    if (texte) style.couleurTexte = texte;
    return style;
  }

  const pileCss = (police) => police.split(',').map((p) => p.trim()).filter(Boolean)
    .map((p) => (GENERIQUES.has(p.toLowerCase()) || !/\s/.test(p) ? p : `"${p}"`)).join(', ');

  // Feuille de style : s'applique à tout élément `.markdown-body` (aperçu,
  // page du mode Document, documents exportés).
  function css(style) {
    if (!style) return '';
    const regles = [];
    const corps = [];
    if (style.police) corps.push(`font-family: ${pileCss(style.police)};`);
    if (style.taille) corps.push(`font-size: ${style.taille}pt;`);
    if (style.couleurTexte) corps.push(`color: ${style.couleurTexte};`);
    if (corps.length) regles.push(`.markdown-body, #preview.markdown-body { ${corps.join(' ')} }`);
    if (style.couleurTitres) regles.push(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { color: ${style.couleurTitres}; }`);
    if (style.couleurTexte) regles.push(`.markdown-body p, .markdown-body li, .markdown-body td, .markdown-body th { color: ${style.couleurTexte}; }`);
    return regles.join('\n');
  }

  // Valeur à écrire dans le front-matter (une couleur `#…` est mise entre
  // guillemets : en YAML, `#` ouvre un commentaire).
  const valeurFm = (v) => (String(v).startsWith('#') ? `"${v}"` : String(v));

  // Ajoute, remplace ou retire (valeur vide ou null) des clés du front-matter
  // d'un document, sans toucher aux autres lignes. `patch` : { police, taille,
  // couleurTitres, couleurTexte }. Renvoie le nouveau texte du document.
  function ecrire(source, patch) {
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const texte = source.replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(texte);
    const lignes = m ? m[1].split('\n') : [];
    for (const [champ, cle] of Object.entries(CLES)) {
      if (!(champ in patch)) continue;
      const v = patch[champ];
      const idx = lignes.findIndex((l) => new RegExp('^' + cle + '\\s*:').test(l));
      if (v === null || v === undefined || v === '') {
        if (idx >= 0) lignes.splice(idx, 1);
      } else if (idx >= 0) lignes[idx] = `${cle}: ${valeurFm(v)}`;
      else lignes.push(`${cle}: ${valeurFm(v)}`);
    }
    let resultat;
    if (m) {
      const reste = texte.slice(m[0].length);
      resultat = lignes.length ? `---\n${lignes.join('\n')}\n---\n${reste}` : reste.replace(/^\n/, '');
    } else if (lignes.length) resultat = `---\n${lignes.join('\n')}\n---\n\n${texte}`;
    else resultat = texte;
    return eol === '\r\n' ? resultat.replace(/\n/g, '\r\n') : resultat;
  }

  // Pour l'export Word : première police, taille en points, couleurs sans `#`
  // (seules les couleurs hexadécimales sont reprises).
  function pourWord(style) {
    const hex = (c) => {
      const m = /^#([0-9a-f]{6})$/i.exec(c || '');
      if (m) return m[1].toUpperCase();
      const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c || '');
      return court ? (court[1] + court[1] + court[2] + court[2] + court[3] + court[3]).toUpperCase() : null;
    };
    return {
      police: style && style.police ? style.police.split(',')[0].trim() : null,
      taillePt: style && style.taille ? style.taille : null,
      couleurTitres: hex(style && style.couleurTitres),
      couleurTexte: hex(style && style.couleurTexte),
    };
  }

  return { CLES, extraire, css, ecrire, pourWord, normaliserPolice, normaliserTaille, normaliserCouleur };
});

// « Copier en HTML riche » : transforme le HTML rendu d'un extrait Markdown en
// HTML aux styles EN LIGNE, ce que lisent Outlook, Teams et Word au collage
// (ils ignorent les feuilles de style et les classes). Format UMD, sans DOM :
// le travail se fait sur la chaîne, ce qui le rend testable par `node --test`.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrHtmlRiche = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const POLICE = '-apple-system, "Segoe UI", Calibri, Arial, sans-serif';
  const MONO = 'Consolas, "Courier New", Menlo, monospace';

  // Style en ligne par balise. `code` et `pre` ont une variante selon le contexte.
  const STYLES = {
    h1: `font-family:${POLICE};font-size:24px;font-weight:bold;margin:18px 0 10px;line-height:1.25;`,
    h2: `font-family:${POLICE};font-size:20px;font-weight:bold;margin:16px 0 8px;line-height:1.25;`,
    h3: `font-family:${POLICE};font-size:17px;font-weight:bold;margin:14px 0 6px;line-height:1.25;`,
    h4: `font-family:${POLICE};font-size:15px;font-weight:bold;margin:12px 0 6px;`,
    h5: `font-family:${POLICE};font-size:14px;font-weight:bold;margin:10px 0 4px;`,
    h6: `font-family:${POLICE};font-size:13px;font-weight:bold;margin:10px 0 4px;color:#555555;`,
    p: `font-family:${POLICE};font-size:14px;line-height:1.5;margin:0 0 10px;`,
    ul: 'margin:0 0 10px;padding-left:24px;',
    ol: 'margin:0 0 10px;padding-left:24px;',
    li: `font-family:${POLICE};font-size:14px;line-height:1.5;margin:2px 0;`,
    blockquote: 'border-left:4px solid #cccccc;margin:0 0 10px;padding:2px 12px;color:#555555;',
    table: 'border-collapse:collapse;border:1px solid #bbbbbb;margin:0 0 12px;',
    th: `border:1px solid #bbbbbb;padding:6px 10px;background-color:#f0f0f0;font-family:${POLICE};font-size:14px;font-weight:bold;text-align:left;`,
    td: `border:1px solid #bbbbbb;padding:6px 10px;font-family:${POLICE};font-size:14px;vertical-align:top;`,
    a: 'color:#0b5cad;text-decoration:underline;',
    img: 'max-width:100%;height:auto;',
    hr: 'border:0;border-top:1px solid #cccccc;margin:14px 0;',
    pre: `background-color:#f6f8fa;border:1px solid #dddddd;padding:10px;margin:0 0 12px;font-family:${MONO};font-size:13px;line-height:1.4;white-space:pre-wrap;`,
    codeEnLigne: `background-color:#f2f2f2;font-family:${MONO};font-size:13px;padding:1px 4px;`,
    codeBloc: `font-family:${MONO};font-size:13px;background-color:transparent;`,
  };

  // Attributs d'alignement posés par le moteur Markdown sur th/td.
  const ALIGN = { left: 'left', center: 'center', right: 'right' };

  const BALISES_RETIREES = /<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1\s*>/gi;
  const ATTRIBUT = /([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  const BALISE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;

  const echapperAttr = (v) => String(v).replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function lireAttributs(brut) {
    const attrs = [];
    for (const m of brut.matchAll(ATTRIBUT)) {
      let v = m[2];
      if (v === undefined) v = '';
      else if (/^["']/.test(v)) v = v.slice(1, -1);
      attrs.push([m[1].toLowerCase(), v]);
    }
    return attrs;
  }

  function reecrire(nom, attrsBruts, profondeurPre) {
    let style = STYLES[nom];
    if (nom === 'code') style = profondeurPre > 0 ? STYLES.codeBloc : STYLES.codeEnLigne;
    const attrs = lireAttributs(attrsBruts).filter(([k, v]) => {
      if (k === 'class' || k === 'id' || k.startsWith('data-') || k.startsWith('on') || k === 'aria-hidden') return false;
      if ((k === 'href' || k === 'src') && /^\s*(javascript|vbscript):/i.test(v)) return false;
      return true;
    });
    const existant = attrs.find(([k]) => k === 'style');
    const reste = attrs.filter(([k]) => k !== 'style');
    if (nom === 'th' || nom === 'td') {
      const al = reste.find(([k]) => k === 'align');
      if (al && ALIGN[al[1].toLowerCase()]) style = (style || '') + `text-align:${ALIGN[al[1].toLowerCase()]};`;
    }
    if (nom === 'table') {
      // Outlook et Word s'appuient sur ces attributs historiques plus que sur le CSS.
      if (!reste.some(([k]) => k === 'border')) reste.push(['border', '1']);
      if (!reste.some(([k]) => k === 'cellpadding')) reste.push(['cellpadding', '6']);
      if (!reste.some(([k]) => k === 'cellspacing')) reste.push(['cellspacing', '0']);
    }
    // Le style existant vient en dernier : il garde le dernier mot.
    const complet = (style || '') + (existant ? existant[1] : '');
    const sortie = reste.map(([k, v]) => (v === '' && !['alt', 'title', 'href', 'src'].includes(k) ? k : `${k}="${echapperAttr(v)}"`));
    if (complet) sortie.push(`style="${echapperAttr(complet)}"`);
    return sortie.length ? ' ' + sortie.join(' ') : '';
  }

  // Inline les styles de chaque balise connue ; retire scripts, styles, classes,
  // identifiants, gestionnaires `on…` et liens `javascript:`.
  function inliner(html) {
    let s = String(html || '');
    let avant;
    do { avant = s; s = s.replace(BALISES_RETIREES, ''); } while (s !== avant);
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    let pre = 0;
    return s.replace(BALISE, (tout, fermante, nomBrut, attrs, autoFermante) => {
      const nom = nomBrut.toLowerCase();
      if (fermante) {
        if (nom === 'pre') pre = Math.max(0, pre - 1);
        return `</${nom}>`;
      }
      const sortie = `<${nom}${reecrire(nom, attrs, pre)}${autoFermante ? ' /' : ''}>`;
      if (nom === 'pre' && !autoFermante) pre += 1;
      return sortie;
    });
  }

  // Enveloppe le fragment dans un conteneur qui porte la police de base : les
  // clients de courrier héritent mieux d'un <div> stylé que d'un fragment nu.
  function enveloppe(fragment) {
    return `<div style="font-family:${POLICE};font-size:14px;line-height:1.5;color:#222222;">${fragment}</div>`;
  }

  function versHtmlRiche(htmlRendu) { return enveloppe(inliner(htmlRendu)); }

  return { STYLES, inliner, enveloppe, versHtmlRiche };
});

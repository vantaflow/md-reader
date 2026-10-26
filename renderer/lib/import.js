// Import vers Markdown : nettoyage du HTML importé puis conversion par turndown
// (+ plugin GFM : tableaux, barré, listes de tâches). Format UMD : CommonJS pour
// `node --test` (turndown y tourne sur domino), global `window.mdrImport` dans le
// renderer (TurndownService et gfm viennent du bundle import-bundle.js).
//
// Choix pour les images d'un .docx : elles restent en data URI dans le Markdown.
// Le résultat s'ouvre dans un onglet NON enregistré : il n'y a pas encore de
// dossier « à côté du .md » où les écrire, et demander d'enregistrer avant
// l'import casserait le geste. L'utilisateur peut ensuite enregistrer ; les
// images collées à la main se rangent, elles, dans images/ (lot 1).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrImport = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const BLOCS_RETIRES = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'svg', 'math', 'select', 'textarea', 'button'];
  const DANGEREUX = /^\s*(javascript|vbscript|data\s*:\s*text\/html)/i;

  // Retire du HTML ce qui n'a pas sa place dans un document : scripts, styles,
  // cadres, objets, commentaires, attributs `on…`, URL `javascript:`. Boucle
  // jusqu'à stabilité : `<scr<script>ipt>` ne doit pas se reformer en balise.
  function nettoyerHtml(html) {
    let s = String(html || '');
    let avant;
    do {
      avant = s;
      for (const b of BLOCS_RETIRES) {
        s = s.replace(new RegExp(`<${b}\\b[^>]*>[\\s\\S]*?<\\/${b}\\s*>`, 'gi'), '');
        s = s.replace(new RegExp(`<${b}\\b[^>]*>[\\s\\S]*$`, 'gi'), ''); // jamais refermé : jusqu'à la fin
        s = s.replace(new RegExp(`<\\/?${b}\\b[^>]*>`, 'gi'), '');
      }
      s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<!--[\s\S]*$/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
      s = s.replace(/<(meta|link|base)\b[^>]*>/gi, '');
      s = s.replace(/(<[a-zA-Z][^>]*?)\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g, '$1');
      s = s.replace(/(\s(?:href|src|xlink:href|action|formaction)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre, val, a, b) => (DANGEREUX.test(decoderBasique(a !== undefined ? a : b)) ? `${pre}""` : m));
    } while (s !== avant);
    return s;
  }

  function decoderBasique(v) {
    return String(v).replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);?/g, (_m, d) => String.fromCharCode(Number(d))).replace(/&colon;/gi, ':').replace(/&tab;|&newline;/gi, '').replace(/[\u0000- ]+/g, ' ');
  }

  // Le plugin GFM ne produit un tableau Markdown que si la première ligne est
  // une ligne d'en-têtes (<th>), et une cellule ne peut tenir sur plusieurs
  // lignes. mammoth produit des <td> partout et des <p> dans les cellules : on
  // promeut la première ligne en <th> et on remplace les paragraphes par des <br>.
  function preparerTableaux(html) {
    return html.replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi, (table) => {
      let t = table.replace(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (m, nom, attrs, contenu) => {
        const c = contenu.replace(/<\/p>\s*<p\b[^>]*>/gi, '<br>').replace(/<\/?p\b[^>]*>/gi, '').replace(/\n+/g, ' ');
        return `<${nom}${attrs}>${c}</${nom}>`;
      });
      // Markdown n'a qu'une ligne d'en-têtes : la première ligne (avec ou sans
      // <thead>) porte des <th> sans mise en gras superflue, les suivantes des <td>.
      t = t.replace(/<\/?(thead|tbody|tfoot)\b[^>]*>/gi, '');
      let premiere = true;
      t = t.replace(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi, (ligne) => {
        if (premiere) {
          premiere = false;
          return ligne.replace(/<td\b/gi, '<th').replace(/<\/td\s*>/gi, '</th>').replace(/<\/?(strong|b)\b[^>]*>/gi, '');
        }
        return ligne.replace(/<th\b/gi, '<td').replace(/<\/th\s*>/gi, '</td>');
      });
      return t;
    });
  }

  // Marqueurs de liste sur une espace (turndown en met trois), lignes sans espaces
  // de fin, jamais plus d'une ligne vide ; le contenu des blocs de code est intact.
  function normaliser(md) {
    let dansCode = false;
    const lignes = md.split('\n').map((l) => {
      if (/^\s*(```|~~~)/.test(l)) { dansCode = !dansCode; return l.replace(/[ \t]+$/, ''); }
      if (dansCode) return l;
      return l.replace(/^(\s*)(-|\d+\.)\s+(?=\S)/, '$1$2 ').replace(/^(\s*(?:-|\d+\.) \[[ xX]\])\s+/, '$1 ').replace(/[ \t]+$/, '');
    });
    return lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // Convertisseur : `outils` = { TurndownService, gfm } (le bundle en renderer,
  // les paquets npm en test).
  function creer({ TurndownService, gfm }) {
    const td = new TurndownService({
      headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-',
      emDelimiter: '*', strongDelimiter: '**', hr: '---', linkStyle: 'inlined',
    });
    if (gfm) td.use(gfm);
    td.remove(BLOCS_RETIRES);
    // Un lien dangereux ne garde que son texte.
    td.addRule('lien-sur', {
      filter: (n) => n.nodeName === 'A' && DANGEREUX.test(decoderBasique(n.getAttribute('href') || '')),
      replacement: (contenu) => contenu,
    });
    // Un lien sans cible, une ancre sans texte : le contenu seul (mammoth pose des <a id="_Toc…"></a>).
    td.addRule('ancre-vide', {
      filter: (n) => n.nodeName === 'A' && !n.getAttribute('href'),
      replacement: (contenu) => contenu,
    });
    // Dans une cellule de tableau un saut de ligne ne peut pas être une vraie
    // ligne : il reste une balise <br>.
    td.addRule('br-cellule', {
      filter: (n) => n.nodeName === 'BR' && n.parentNode && /^(TD|TH)$/.test(n.parentNode.nodeName),
      replacement: () => '<br>',
    });
    // Barré : la forme à deux tildes, celle que l'aperçu de l'application reconnaît.
    td.addRule('barre', {
      filter: ['del', 's', 'strike'],
      replacement: (contenu) => `~~${contenu}~~`,
    });
    // Image sans source : rien.
    td.addRule('image-vide', {
      filter: (n) => n.nodeName === 'IMG' && !n.getAttribute('src'),
      replacement: () => '',
    });

    function htmlVersMarkdown(html) {
      const propre = preparerTableaux(nettoyerHtml(html));
      if (!propre.trim()) return '';
      const md = td.turndown(propre);
      return normaliser(md);
    }
    return { htmlVersMarkdown };
  }

  // Décode des octets HTML : UTF-8, sauf déclaration explicite d'un autre jeu
  // (windows-1252, iso-8859-1) dans les 2 000 premiers octets.
  function decoderOctets(octets) {
    const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    const tete = new TextDecoder('latin1').decode(u8.subarray(0, 2000));
    const m = tete.match(/charset\s*=\s*["']?\s*([\w-]+)/i);
    const jeu = m ? m[1].toLowerCase() : 'utf-8';
    try { return new TextDecoder(jeu).decode(u8); } catch { return new TextDecoder('utf-8').decode(u8); }
  }

  return { nettoyerHtml, preparerTableaux, creer, decoderOctets };
});

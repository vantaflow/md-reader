// Export Word (.docx) : convertit le DOM de l'aperçu rendu en document `docx`.
// Source bundlée par esbuild (renderer/docx-bundle.js, ignoré par git) qui
// expose `window.mdrDocx.creerDocx(racine, options)`.
//
// `racine` est un élément DOM contenant le HTML rendu (le rendu de l'aperçu,
// pas l'aperçu paginé lui-même). Les images locales ne sont pas lisibles par
// le renderer : l'appelant fournit `lireOctets(url)` (IPC vers le processus
// principal) qui renvoie `{ octets, mime }` ou null.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun,
  ExternalHyperlink, PageBreak, AlignmentType, ShadingType, BorderStyle, LevelFormat, UnderlineType,
  Header, Footer, PageNumber, PageOrientation,
} from 'docx';

// Tailles de papier en twips (largeur, hauteur en portrait).
const PAPIERS = { A4: [11906, 16838], Letter: [12240, 15840], Legal: [12240, 20160], A3: [16838, 23811], A5: [8391, 11906] };

// « #rrggbb » ou « rgb(r, g, b) » -> « RRGGBB » (null si non reconnu).
function couleurHex(c) {
  if (!c) return null;
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) return h[1].toUpperCase();
  const c3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c.trim());
  if (c3) return (c3[1] + c3[1] + c3[2] + c3[2] + c3[3] + c3[3]).toUpperCase();
  const r = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c.trim());
  return r ? [r[1], r[2], r[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
}

// Taille CSS (pt, px, em) -> demi-points Word (null si non reconnue).
function demiPoints(t) {
  const m = /^(\d+(?:\.\d+)?)(pt|px|em)$/i.exec((t || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  const pt = m[2] === 'pt' ? n : m[2] === 'px' ? n * 0.75 : n * 11;
  return Math.round(pt * 2);
}

// Page A4, marges de 2 cm : largeur utile en twips (1/20 de point) puis en pixels (96 dpi).
const LARGEUR_PAGE_TWIPS = 11906;
const MARGE_TWIPS = 1134;
const LARGEUR_UTILE_TWIPS = LARGEUR_PAGE_TWIPS - 2 * MARGE_TWIPS;
const LARGEUR_UTILE_PX = Math.round(LARGEUR_UTILE_TWIPS / 15);
const POLICE_CODE = 'Courier New';
const FOND_CODE = 'EEEEEE';
const TITRES = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const PUCES = ['•', '◦', '▪'];
const FORMATS_NUM = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];

// ── Images ────────────────────────────────────────────────────────────────
function octetsDepuisDataUri(uri) {
  const virgule = uri.indexOf(',');
  if (virgule < 0) return null;
  const entete = uri.slice(5, virgule);
  const corps = uri.slice(virgule + 1);
  const mime = (entete.split(';')[0] || 'text/plain').toLowerCase();
  if (/;base64/i.test(entete)) {
    const bin = atob(corps);
    const o = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) o[i] = bin.charCodeAt(i);
    return { octets: o, mime };
  }
  return { octets: new TextEncoder().encode(decodeURIComponent(corps)), mime };
}

function detecterMime(o, indice) {
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'image/png';
  if (o[0] === 0xff && o[1] === 0xd8) return 'image/jpeg';
  if (o[0] === 0x47 && o[1] === 0x49 && o[2] === 0x46) return 'image/gif';
  if (o[0] === 0x52 && o[1] === 0x49 && o[2] === 0x46 && o[3] === 0x46 && o[8] === 0x57 && o[9] === 0x45) return 'image/webp';
  const debut = new TextDecoder().decode(o.slice(0, 300)).toLowerCase();
  if (debut.includes('<svg')) return 'image/svg+xml';
  return indice || '';
}

function chargerImageDom(octets, mime) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([octets], { type: mime }));
    const img = new Image();
    img.onload = () => { resolve({ img, url }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

// Prépare une image pour Word : png/jpg/gif conservés tels quels, tout le
// reste (svg, webp…) rasterisé en png par un canvas. Dimensions en pixels,
// plafonnées à la largeur utile (moins `retraitPx`).
async function preparerImage({ octets, mime }, { retraitPx = 0, taille = null } = {}) {
  const type = detecterMime(octets, mime);
  const { img, url } = await chargerImageDom(octets, type);
  try {
    let w = img.naturalWidth || (taille && taille.w) || 600;
    let h = img.naturalHeight || (taille && taille.h) || 300;
    if (type === 'image/svg+xml' && taille && taille.w) { w = taille.w; h = taille.h || h; }
    let data = octets;
    let sortie;
    if (type === 'image/png') sortie = 'png';
    else if (type === 'image/jpeg') sortie = 'jpg';
    else if (type === 'image/gif') sortie = 'gif';
    else {
      const echelle = 2;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * echelle));
      c.height = Math.max(1, Math.round(h * echelle));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('rastérisation impossible');
      data = new Uint8Array(await blob.arrayBuffer());
      sortie = 'png';
    }
    const max = Math.max(50, LARGEUR_UTILE_PX - retraitPx);
    if (w > max) { h = Math.round(h * max / w); w = max; }
    return { data, type: sortie, width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  } finally { URL.revokeObjectURL(url); }
}

// ── Conversion ────────────────────────────────────────────────────────────
const BLOCS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'FIGURE',
  'SECTION', 'NAV', 'DETAILS', 'SUMMARY', 'ASIDE', 'ARTICLE', 'HEADER', 'FOOTER', 'DL', 'DT', 'DD', 'FIGCAPTION', 'MAIN']);

function estBloc(n) {
  if (n.nodeType !== 1) return false;
  if (BLOCS.has(n.tagName)) return true;
  return false;
}

export async function creerDocx(racine, { lireOctets, titre = 'Document', style = null, page = null } = {}) {
  const reglagesNumerotation = new Map(); // référence -> config
  let compteurListes = 0;

  const refNumerotee = (start) => {
    compteurListes += 1;
    const reference = `num-${compteurListes}`;
    reglagesNumerotation.set(reference, {
      reference,
      levels: Array.from({ length: 9 }, (_, niveau) => ({
        level: niveau, format: FORMATS_NUM[niveau % 3], text: `%${niveau + 1}.`, alignment: AlignmentType.START,
        start: niveau === 0 ? start : 1,
        style: { paragraph: { indent: { left: 720 * (niveau + 1), hanging: 360 } } },
      })),
    });
    return reference;
  };

  async function imageDepuisSrc(src, options) {
    let brut = null;
    if (/^data:/i.test(src)) brut = octetsDepuisDataUri(src);
    else if (lireOctets) brut = await lireOctets(src);
    if (!brut || !brut.octets || !brut.octets.length) return null;
    const octets = brut.octets instanceof Uint8Array ? brut.octets : new Uint8Array(brut.octets);
    return preparerImage({ octets, mime: brut.mime }, options);
  }

  async function runImage(img, ctx) {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    try {
      const p = await imageDepuisSrc(src, { retraitPx: Math.round((ctx.retrait || 0) / 15) });
      if (p) {
        return new ImageRun({ type: p.type, data: p.data, transformation: { width: p.width, height: p.height }, altText: { name: alt || 'image', title: alt, description: alt } });
      }
    } catch { /* repli ci-dessous */ }
    return new TextRun({ text: alt ? `[image : ${alt}]` : '[image]', italics: true, color: '888888' });
  }

  async function runSvg(svg, ctx) {
    try {
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox && svg.viewBox.baseVal;
      const w = r.width || Number(svg.dataset.w) || (vb && vb.width) || 600;
      const h = r.height || Number(svg.dataset.h) || (vb && vb.height) || 300;
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(Math.round(w)));
      clone.setAttribute('height', String(Math.round(h)));
      clone.removeAttribute('style');
      const octets = new TextEncoder().encode(new XMLSerializer().serializeToString(clone));
      const p = await preparerImage({ octets, mime: 'image/svg+xml' }, { retraitPx: Math.round((ctx.retrait || 0) / 15), taille: { w, h } });
      return new ImageRun({ type: p.type, data: p.data, transformation: { width: p.width, height: p.height }, altText: { name: 'schéma', title: 'schéma', description: 'schéma' } });
    } catch {
      return new TextRun({ text: '[schéma]', italics: true, color: '888888' });
    }
  }

  // Contenu en ligne : renvoie un tableau de runs (TextRun, ImageRun, ExternalHyperlink).
  async function enLigne(noeud, fmt, ctx) {
    const sortie = [];
    for (const n of noeud.childNodes) sortie.push(...await runsDe(n, fmt, ctx));
    return sortie;
  }

  function optionsTexte(fmt) {
    const o = {};
    if (fmt.gras) o.bold = true;
    if (fmt.italique) o.italics = true;
    if (fmt.barre) o.strike = true;
    if (fmt.souligne || fmt.lien) o.underline = { type: UnderlineType.SINGLE };
    if (fmt.lien) o.color = '0563C1';
    if (fmt.exposant) o.superScript = true;
    if (fmt.indice) o.subScript = true;
    if (fmt.surligne === true) o.highlight = 'yellow';
    else if (fmt.surligne) o.shading = { type: ShadingType.CLEAR, fill: fmt.surligne, color: 'auto' };
    if (fmt.couleur && !fmt.lien) o.color = fmt.couleur;
    if (fmt.police) o.font = fmt.police;
    if (fmt.taille) o.size = fmt.taille;
    if (fmt.code) { o.font = POLICE_CODE; o.size = 20; o.shading = { type: ShadingType.CLEAR, fill: FOND_CODE, color: 'auto' }; }
    return o;
  }

  async function runsDe(n, fmt, ctx) {
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ');
      return t ? [new TextRun({ text: t, ...optionsTexte(fmt) })] : [];
    }
    if (n.nodeType !== 1) return [];
    const tag = n.tagName;
    if (tag === 'BR') return [new TextRun({ break: 1 })];
    if (tag === 'IMG') return [await runImage(n, ctx)];
    if (tag.toLowerCase() === 'svg') return [await runSvg(n, ctx)];
    if (tag === 'INPUT') return n.type === 'checkbox' ? [new TextRun({ text: n.checked ? '☑ ' : '☐ ' })] : [];
    if (tag === 'SCRIPT' || tag === 'STYLE') return [];
    if (tag === 'A' && n.hasAttribute('data-footnote-backref')) return [];
    if (n.classList && n.classList.contains('katex')) {
      const tex = n.querySelector('annotation[encoding="application/x-tex"]');
      const texte = tex ? tex.textContent : n.textContent;
      return [new TextRun({ text: texte, italics: true, font: POLICE_CODE, size: 20 })];
    }
    if (n.classList && n.classList.contains('katex-display')) return enLigne(n, fmt, ctx);
    const f = { ...fmt };
    if (tag === 'STRONG' || tag === 'B') f.gras = true;
    else if (tag === 'EM' || tag === 'I') f.italique = true;
    else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') f.barre = true;
    else if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') f.code = true;
    else if (tag === 'U' || tag === 'INS') f.souligne = true;
    else if (tag === 'SUP') f.exposant = true;
    else if (tag === 'SUB') f.indice = true;
    else if (tag === 'MARK') f.surligne = couleurHex(n.style && (n.style.backgroundColor || n.style.background)) || true;
    else if (tag === 'SPAN' && n.style) {
      const c = couleurHex(n.style.color);
      if (c) f.couleur = c;
      const fond = couleurHex(n.style.backgroundColor || n.style.background);
      if (fond) f.surligne = fond;
      const police = (n.style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      if (police) f.police = police;
      const taille = demiPoints(n.style.fontSize);
      if (taille) f.taille = taille;
    }
    if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      const externe = /^(https?:|mailto:|tel:|file:)/i.test(href);
      f.lien = true;
      const enfants = await enLigne(n, f, ctx);
      if (externe && enfants.length) return [new ExternalHyperlink({ link: href, children: enfants })];
      return enfants;
    }
    return enLigne(n, f, ctx);
  }

  function retraitCtx(ctx) { return ctx.retrait || 0; }

  // Construit un paragraphe depuis des runs selon le contexte (liste, citation…).
  function paragraphe(runs, ctx, extra = {}) {
    const opts = { children: runs, spacing: { after: 120 }, ...extra };
    let gauche = retraitCtx(ctx) + (ctx.citation ? ctx.citation * 360 : 0);
    if (ctx.item) {
      if (!ctx.item.pris && ctx.item.reference) {
        opts.numbering = { reference: ctx.item.reference, level: Math.min(ctx.item.niveau, 8) };
      } else {
        // Continuation d'un élément de liste, ou tâche sans puce : alignée sur le texte.
        gauche = Math.max(gauche, 720 * (ctx.item.niveau + 1));
      }
      ctx.item.pris = true;
    }
    if (ctx.citation) opts.border = { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } };
    if (!opts.numbering) opts.indent = { left: gauche };
    return new Paragraph(opts);
  }

  // Blocs d'un conteneur : les nœuds en ligne consécutifs forment un paragraphe.
  async function blocs(parent, ctx) {
    const sortie = [];
    let enAttente = [];
    const vider = async () => {
      const utile = enAttente.some((n) => n.nodeType === 1 || n.textContent.trim());
      if (utile) {
        const runs = [];
        for (const n of enAttente) runs.push(...await runsDe(n, {}, ctx));
        if (runs.length) sortie.push(paragraphe(runs, ctx));
      }
      enAttente = [];
    };
    for (const n of parent.childNodes) {
      if (n.nodeType === 1 && (estBloc(n) || (n.classList && n.classList.contains('katex-display')))) {
        await vider();
        sortie.push(...await bloc(n, ctx));
      } else enAttente.push(n);
    }
    await vider();
    return sortie;
  }

  async function paragrapheDepuis(n, ctx, extra) {
    const runs = await enLigne(n, extra && extra.fmt ? extra.fmt : {}, ctx);
    const { fmt, ...reste } = extra || {};
    return paragraphe(runs.length ? runs : [new TextRun({ text: '' })], ctx, reste);
  }

  async function liste(n, ctx) {
    const ordonnee = n.tagName === 'OL';
    const niveau = ctx.item ? ctx.item.niveau + 1 : (ctx.niveauListe !== undefined ? ctx.niveauListe + 1 : 0);
    const start = ordonnee ? parseInt(n.getAttribute('start'), 10) || 1 : 1;
    const reference = ordonnee ? refNumerotee(start) : 'puces';
    const sortie = [];
    for (const li of n.children) {
      if (li.tagName !== 'LI') continue;
      const tache = !!li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
      const item = { reference: tache ? null : reference, niveau, pris: false };
      const sousCtx = { ...ctx, item, niveauListe: niveau, citation: ctx.citation };
      sortie.push(...await blocs(li, sousCtx));
    }
    return sortie;
  }

  async function code(pre, ctx) {
    const texte = pre.textContent.replace(/\n$/, '');
    const lignes = texte.split('\n');
    return lignes.map((l, i) => new Paragraph({
      style: 'BlocCode',
      children: [new TextRun({ text: l, font: POLICE_CODE, size: 20 })],
      shading: { type: ShadingType.CLEAR, fill: FOND_CODE, color: 'auto' },
      spacing: { before: 0, after: i === lignes.length - 1 ? 160 : 0, line: 260 },
      indent: { left: retraitCtx(ctx) + 120, right: 120 },
    }));
  }

  async function tableau(t, ctx) {
    const lignes = [...t.querySelectorAll('tr')].filter((tr) => tr.closest('table') === t);
    const nbCols = Math.max(1, ...lignes.map((tr) => tr.children.length));
    const largeur = LARGEUR_UTILE_TWIPS - retraitCtx(ctx);
    const colonnes = Array.from({ length: nbCols }, () => Math.floor(largeur / nbCols));
    const rows = [];
    for (const tr of lignes) {
      const entete = tr.closest('thead') !== null || [...tr.children].every((c) => c.tagName === 'TH');
      const cells = [];
      for (const c of tr.children) {
        const alignAttr = (c.getAttribute('align') || c.style.textAlign || '').toLowerCase();
        const alignement = alignAttr === 'center' ? AlignmentType.CENTER : alignAttr === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
        const sous = { retrait: 0 };
        const fmt = c.tagName === 'TH' ? { gras: true } : {};
        let enfants;
        if ([...c.children].some(estBloc)) enfants = await blocs(c, sous);
        else {
          const runs = await enLigne(c, fmt, sous);
          enfants = [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: '' })], alignment: alignement, spacing: { after: 0 } })];
        }
        cells.push(new TableCell({
          children: enfants.length ? enfants : [new Paragraph({ children: [] })],
          shading: entete ? { type: ShadingType.CLEAR, fill: 'E7E6E6', color: 'auto' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
        }));
      }
      while (cells.length < nbCols) cells.push(new TableCell({ children: [new Paragraph({ children: [] })] }));
      rows.push(new TableRow({ children: cells, tableHeader: entete }));
    }
    const bord = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
    return [
      new Table({
        rows, columnWidths: colonnes, width: { size: largeur, type: WidthType.DXA },
        indent: retraitCtx(ctx) ? { size: retraitCtx(ctx), type: WidthType.DXA } : undefined,
        borders: { top: bord, bottom: bord, left: bord, right: bord, insideHorizontal: bord, insideVertical: bord },
      }),
      new Paragraph({ children: [], spacing: { after: 120 } }),
    ];
  }

  async function bloc(n, ctx) {
    const tag = n.tagName;
    if (/^H[1-6]$/.test(tag)) return [await paragrapheDepuis(n, { ...ctx, item: null }, { heading: TITRES[Number(tag[1]) - 1], spacing: { before: 240, after: 120 } })];
    if (tag === 'P') return [await paragrapheDepuis(n, ctx)];
    if (tag === 'UL' || tag === 'OL') return liste(n, ctx);
    if (tag === 'PRE') return code(n, ctx);
    if (tag === 'TABLE') return tableau(n, ctx);
    if (tag === 'HR') {
      return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '999999', space: 1 } }, spacing: { before: 160, after: 160 } })];
    }
    if (tag === 'BLOCKQUOTE') return blocs(n, { ...ctx, citation: (ctx.citation || 0) + 1, item: ctx.item });
    if (n.classList.contains('page-break')) return [new Paragraph({ children: [new PageBreak()] })];
    if (n.classList.contains('katex-display')) {
      const runs = await enLigne(n, {}, ctx);
      return [new Paragraph({ children: runs, alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 } })];
    }
    if (n.classList.contains('markdown-alert')) {
      const sortie = [];
      for (const e of n.children) {
        if (e.classList.contains('markdown-alert-title')) {
          const titreTexte = e.textContent.trim();
          sortie.push(paragraphe([new TextRun({ text: titreTexte, bold: true })], { ...ctx, citation: (ctx.citation || 0) + 1 }));
        } else sortie.push(...await bloc(e, { ...ctx, citation: (ctx.citation || 0) + 1 }));
      }
      return sortie;
    }
    if (tag === 'FIGURE') {
      const sortie = [];
      for (const e of n.children) {
        if (e.tagName === 'FIGCAPTION') {
          sortie.push(new Paragraph({ children: [new TextRun({ text: e.textContent.trim(), italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
        } else if (e.tagName === 'IMG') {
          sortie.push(new Paragraph({ children: [await runImage(e, ctx)], alignment: AlignmentType.CENTER, spacing: { after: 60 }, keepNext: true }));
        } else sortie.push(...await blocs({ childNodes: [e] }, ctx));
      }
      return sortie;
    }
    if (tag === 'SUMMARY' || tag === 'DT') return [await paragrapheDepuis(n, ctx, { fmt: { gras: true } })];
    if (tag === 'FIGCAPTION') return [await paragrapheDepuis(n, ctx, { alignment: AlignmentType.CENTER })];
    // div, section, nav, details… : conteneurs transparents.
    return blocs(n, ctx);
  }

  const enfants = await blocs(racine, { retrait: 0 });
  if (!enfants.length) enfants.push(new Paragraph({ children: [] }));

  // Styles du document (front-matter) : police, taille, couleurs du texte et des titres.
  const runDefaut = { font: (style && style.police) || 'Calibri', size: style && style.taillePt ? Math.round(style.taillePt * 2) : 22 };
  if (style && style.couleurTexte) runDefaut.color = style.couleurTexte;
  const stylesTitres = {};
  if (style && (style.couleurTitres || style.police)) {
    for (const k of ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6']) {
      stylesTitres[k] = { run: { ...(style.couleurTitres ? { color: style.couleurTitres } : {}), ...(style.police ? { font: style.police } : {}) } };
    }
  }
  // Mise en page : mêmes réglages que l'export PDF (format, orientation, marges, en-tête, pied).
  const dim = PAPIERS[page && page.format] || PAPIERS.A4;
  const paysage = !!(page && page.paysage);
  const mm = (v, defaut) => (Number.isFinite(v) ? Math.round(v * 56.69) : defaut);
  const marges = {
    top: mm(page && page.margeHautMm, MARGE_TWIPS), bottom: mm(page && page.margeBasMm, MARGE_TWIPS),
    left: mm(page && page.margeCotesMm, MARGE_TWIPS), right: mm(page && page.margeCotesMm, MARGE_TWIPS),
  };
  const petit = { size: 16, color: '666666' };
  const enTetes = {};
  if (page && page.enTete) enTetes.headers = { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: page.enTete, ...petit })] })] }) };
  if (page && (page.pied || page.numeros)) {
    const runs = [];
    if (page.pied) runs.push(new TextRun({ text: page.pied + (page.numeros ? ' — ' : ''), ...petit }));
    if (page.numeros) runs.push(new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], ...petit }));
    enTetes.footers = { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: runs })] }) };
  }

  const doc = new Document({
    title: titre,
    creator: 'MD Reader',
    styles: {
      default: { document: { run: runDefaut }, ...stylesTitres },
      paragraphStyles: [{ id: 'BlocCode', name: 'Bloc de code', basedOn: 'Normal', run: { font: POLICE_CODE, size: 20 }, paragraph: { spacing: { after: 0 } } }],
    },
    numbering: {
      config: [
        {
          reference: 'puces',
          levels: Array.from({ length: 9 }, (_, niveau) => ({
            level: niveau, format: LevelFormat.BULLET, text: PUCES[niveau % 3], alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (niveau + 1), hanging: 360 } } },
          })),
        },
        ...reglagesNumerotation.values(),
      ],
    },
    sections: [{
      properties: { page: { size: { width: dim[0], height: dim[1], orientation: paysage ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: marges } },
      ...enTetes,
      children: enfants,
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

window.mdrDocx = { creerDocx };

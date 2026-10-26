// Schéma ProseMirror du mode « Document ».
//
// Le fichier reste du Markdown : chaque nœud ou marque ci-dessous correspond à
// une construction que `markdown.js` sait lire ET réécrire. Ce qui n'a pas
// d'équivalent natif (HTML brut, directives inconnues, définitions de liens…)
// est conservé tel quel dans un bloc « brut » (`raw_block`) ou une balise « brute »
// (`html_inline`) : rien n'est perdu, c'est seulement affiché en lecture.
//
// Module ES sans DOM : testable par `node --test`.
import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

export const TYPES_ENCADRES = ['note', 'tip', 'important', 'warning', 'caution'];
export const LIBELLES_ENCADRES = { note: 'Note', tip: 'Astuce', important: 'Important', warning: 'Attention', caution: 'Danger' };

// Valeurs CSS admises dans les balises en ligne (<span style>, <mark style>) :
// ce qui sort de ces motifs n'est pas interprété, la balise reste du HTML brut.
const RE_COULEUR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]{3,20})$/i;
const RE_POLICE = /^[\w\s,'"-]{1,120}$/;
const RE_TAILLE = /^\d+(\.\d+)?(pt|px|em|rem|%)$/i;
export const valideCouleur = (v) => typeof v === 'string' && RE_COULEUR.test(v.trim());
export const validePolice = (v) => typeof v === 'string' && RE_POLICE.test(v.trim());
export const valideTaille = (v) => typeof v === 'string' && RE_TAILLE.test(v.trim());

// « color:#f00; font-size:14pt » -> { color, 'font-size' } ; null si une
// déclaration est inconnue ou invalide.
export function analyserStyle(texte, autorises) {
  const sortie = {};
  for (const decl of String(texte || '').split(';')) {
    if (!decl.trim()) continue;
    const i = decl.indexOf(':');
    if (i < 0) return null;
    const cle = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim().replace(/\s*!important$/i, '');
    if (!autorises.includes(cle)) return null;
    sortie[cle] = val;
  }
  return sortie;
}

export function attrsStyleDepuisCss(texte) {
  const d = analyserStyle(texte, ['color', 'font-family', 'font-size', 'background-color', 'background']);
  if (!d || !Object.keys(d).length) return null;
  const attrs = { color: null, fontFamily: null, fontSize: null, background: null };
  if (d.color !== undefined) { if (!valideCouleur(d.color)) return null; attrs.color = d.color; }
  if (d['font-family'] !== undefined) { if (!validePolice(d['font-family'])) return null; attrs.fontFamily = d['font-family']; }
  if (d['font-size'] !== undefined) { if (!valideTaille(d['font-size'])) return null; attrs.fontSize = d['font-size']; }
  const fond = d['background-color'] !== undefined ? d['background-color'] : d.background;
  if (fond !== undefined) { if (!valideCouleur(fond)) return null; attrs.background = fond; }
  return attrs;
}

export function cssDepuisAttrsStyle(a) {
  const parts = [];
  if (a.color) parts.push(`color:${a.color}`);
  if (a.background) parts.push(`background-color:${a.background}`);
  if (a.fontFamily) parts.push(`font-family:${String(a.fontFamily).replace(/"/g, "'")}`);
  if (a.fontSize) parts.push(`font-size:${a.fontSize}`);
  return parts.join(';');
}

const ALIGNEMENTS = ['left', 'center', 'right', 'justify'];
export const alignementValide = (a) => (ALIGNEMENTS.includes(a) ? a : null);

// Attributs de mise en page d'un paragraphe ou d'un titre : alignement et retrait
// (en « niveaux » de 2 em), écrits en Markdown dans une enveloppe <div align>.
function attrsMiseEnPage() {
  return { align: { default: null }, indent: { default: 0 } };
}
function styleMiseEnPage(attrs) {
  const s = [];
  if (attrs.align) s.push(`text-align:${attrs.align}`);
  if (attrs.indent) s.push(`margin-left:${attrs.indent * 2}em`);
  return s.length ? { style: s.join(';') } : {};
}
function lireMiseEnPage(dom) {
  const align = alignementValide(dom.style && dom.style.textAlign) || alignementValide(dom.getAttribute && dom.getAttribute('align'));
  const m = /^(\d+(?:\.\d+)?)em$/.exec((dom.style && dom.style.marginLeft) || '');
  return { align, indent: m ? Math.min(8, Math.round(Number(m[1]) / 2)) : 0 };
}

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'paragraph',
  cellAttributes: {
    // Alignement de colonne : porté par chaque cellule de la colonne.
    align: {
      default: null,
      getFromDOM: (dom) => alignementValide(dom.style.textAlign) || alignementValide(dom.getAttribute('align')),
      setDOMAttr: (valeur, attrs) => { if (valeur) attrs.style = (attrs.style ? attrs.style + ';' : '') + `text-align:${valeur}`; },
    },
  },
});

const nodes = {
  doc: { content: 'block+' },

  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: attrsMiseEnPage(),
    parseDOM: [{ tag: 'p', getAttrs: (dom) => lireMiseEnPage(dom) }],
    toDOM(n) { return ['p', styleMiseEnPage(n.attrs), 0]; },
  },

  heading: {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: { level: { default: 1 }, ...attrsMiseEnPage() },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: 'h' + level, getAttrs: (dom) => ({ level, ...lireMiseEnPage(dom) }) })),
    toDOM(n) { return ['h' + n.attrs.level, styleMiseEnPage(n.attrs), 0]; },
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() { return ['blockquote', 0]; },
  },

  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    attrs: { lang: { default: '' } },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (dom) => ({ lang: (dom.getAttribute('data-lang') || '') }) }],
    toDOM(n) { return ['pre', { 'data-lang': n.attrs.lang || null }, ['code', 0]]; },
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM() { return ['hr']; },
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { tight: { default: true } },
    parseDOM: [{ tag: 'ul' }],
    toDOM() { return ['ul', 0]; },
  },

  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { start: { default: 1 }, tight: { default: true } },
    parseDOM: [{ tag: 'ol', getAttrs: (dom) => ({ start: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) || 1 : 1 }) }],
    toDOM(n) { return n.attrs.start === 1 ? ['ol', 0] : ['ol', { start: n.attrs.start }, 0]; },
  },

  // `checked` : null = élément ordinaire ; false / true = case de liste de tâches.
  list_item: {
    content: 'block+',
    defining: true,
    attrs: { checked: { default: null } },
    parseDOM: [{
      tag: 'li',
      getAttrs: (dom) => {
        const c = dom.querySelector && dom.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]');
        return { checked: c ? !!c.checked : (dom.hasAttribute('data-checked') ? dom.getAttribute('data-checked') === 'true' : null) };
      },
    }],
    toDOM(n) { return ['li', n.attrs.checked === null ? {} : { 'data-checked': String(n.attrs.checked), class: 'tache' }, 0]; },
  },

  // Encadré : > [!NOTE] ou :::note (la syntaxe d'origine est conservée).
  alert: {
    content: 'block+',
    group: 'block',
    defining: true,
    attrs: { type: { default: 'note' }, syntax: { default: 'gfm' } },
    parseDOM: [{ tag: 'div.markdown-alert', getAttrs: (dom) => ({ type: TYPES_ENCADRES.find((t) => dom.classList.contains('markdown-alert-' + t)) || 'note' }), contentElement: (dom) => dom }],
    toDOM(n) { return ['div', { class: `markdown-alert markdown-alert-${n.attrs.type}`, 'data-alert': n.attrs.type, 'data-titre': LIBELLES_ENCADRES[n.attrs.type] || '' }, 0]; },
  },

  // Formule en bloc : `$$ … $$`.
  math_block: {
    group: 'block',
    atom: true,
    attrs: { tex: { default: '' } },
    parseDOM: [{ tag: 'div[data-math-block]', getAttrs: (dom) => ({ tex: dom.getAttribute('data-math-block') }) }],
    toDOM(n) { return ['div', { 'data-math-block': n.attrs.tex, class: 'math-bloc' }, n.attrs.tex]; },
  },

  // Diagramme : bloc ```mermaid.
  mermaid_block: {
    group: 'block',
    atom: true,
    attrs: { source: { default: '' } },
    parseDOM: [{ tag: 'div[data-mermaid]', getAttrs: (dom) => ({ source: dom.getAttribute('data-mermaid') }) }],
    toDOM(n) { return ['div', { 'data-mermaid': n.attrs.source, class: 'mermaid-bloc' }, n.attrs.source]; },
  },

  // Markdown ou HTML que le mode Document ne sait pas représenter : conservé tel quel.
  raw_block: {
    group: 'block',
    atom: true,
    attrs: { raw: { default: '' } },
    parseDOM: [{ tag: 'pre[data-raw]', getAttrs: (dom) => ({ raw: dom.getAttribute('data-raw') }) }],
    toDOM(n) { return ['pre', { 'data-raw': n.attrs.raw, class: 'bloc-brut' }, n.attrs.raw]; },
  },

  page_break: {
    group: 'block',
    atom: true,
    parseDOM: [{ tag: 'div.page-break' }],
    toDOM() { return ['div', { class: 'page-break' }]; },
  },

  toc: {
    group: 'block',
    atom: true,
    parseDOM: [{ tag: 'div[data-toc]' }],
    toDOM() { return ['div', { 'data-toc': '1', class: 'sommaire-bloc' }, 'Sommaire']; },
  },

  // Définition de note de bas de page : `[^1]: texte`.
  footnote_def: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { label: { default: '1' } },
    parseDOM: [{ tag: 'div[data-footnote-def]', getAttrs: (dom) => ({ label: dom.getAttribute('data-footnote-def') }) }],
    toDOM(n) { return ['div', { 'data-footnote-def': n.attrs.label, class: 'note-def' }, 0]; },
  },

  ...tables,

  text: { group: 'inline' },

  image: {
    inline: true,
    group: 'inline',
    atom: true,
    draggable: true,
    attrs: { src: {}, alt: { default: '' }, title: { default: null } },
    parseDOM: [{ tag: 'img[src]', getAttrs: (dom) => ({ src: dom.getAttribute('src'), alt: dom.getAttribute('alt') || '', title: dom.getAttribute('title') }) }],
    toDOM(n) { return ['img', { src: n.attrs.src, alt: n.attrs.alt, title: n.attrs.title }]; },
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() { return ['br']; },
  },

  // Formule en ligne : `$x^2$` (display : `$$x$$` au milieu d'un paragraphe).
  math_inline: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { tex: { default: '' }, display: { default: false } },
    parseDOM: [{ tag: 'span[data-math]', getAttrs: (dom) => ({ tex: dom.getAttribute('data-math') }) }],
    toDOM(n) { return ['span', { 'data-math': n.attrs.tex, class: 'math-ligne' }, n.attrs.tex]; },
  },

  footnote_ref: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { label: { default: '1' } },
    parseDOM: [{ tag: 'sup[data-footnote-ref]', getAttrs: (dom) => ({ label: dom.getAttribute('data-footnote-ref') }) }],
    toDOM(n) { return ['sup', { 'data-footnote-ref': n.attrs.label, class: 'note-ref' }, n.attrs.label]; },
  },

  // `[[note]]` ou `[[note|texte]]` : lien interne, conservé tel quel.
  wikilink: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { raw: { default: '' } },
    parseDOM: [{ tag: 'a.wikilink', getAttrs: (dom) => ({ raw: `[[${dom.getAttribute('data-note') || dom.textContent}]]` }) }],
    toDOM(n) { return ['a', { class: 'wikilink', href: '#' }, n.attrs.raw.replace(/^\[\[|\]\]$/g, '')]; },
  },

  // Balise HTML en ligne sans équivalent (<sup>, <kbd>, balise orpheline…).
  html_inline: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { raw: { default: '' } },
    parseDOM: [{ tag: 'span[data-html-inline]', getAttrs: (dom) => ({ raw: dom.getAttribute('data-html-inline') }) }],
    toDOM(n) { return ['span', { 'data-html-inline': n.attrs.raw, class: 'html-brut' }, n.attrs.raw]; },
  },
};

// L'ordre des marques est l'ordre d'imbrication à l'écriture (la première est la
// plus externe) : style, souligné, surlignage, lien, gras, italique, barré, code.
const marks = {
  style: {
    attrs: { color: { default: null }, fontFamily: { default: null }, fontSize: { default: null }, background: { default: null } },
    parseDOM: [{ tag: 'span[style]', getAttrs: (dom) => attrsStyleDepuisCss(dom.getAttribute('style')) || false }],
    toDOM(m) { return ['span', { style: cssDepuisAttrsStyle(m.attrs) }, 0]; },
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { tag: 'ins' }, { style: 'text-decoration', getAttrs: (v) => /underline/.test(v) && null }],
    toDOM() { return ['u', 0]; },
  },
  highlight: {
    attrs: { color: { default: null } },
    parseDOM: [{ tag: 'mark', getAttrs: (dom) => ({ color: dom.style.backgroundColor || null }) }],
    toDOM(m) { return ['mark', m.attrs.color ? { style: `background-color:${m.attrs.color}` } : {}, 0]; },
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title') }) }],
    toDOM(m) { return ['a', { href: m.attrs.href, title: m.attrs.title }, 0]; },
  },
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: (dom) => dom.style.fontWeight !== 'normal' && null }, { style: 'font-weight=400', clearMark: (m) => m.type.name === 'strong' }, { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[5-9]\d{2,})$/.test(v) && null }],
    toDOM() { return ['strong', 0]; },
  },
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }, { style: 'font-style=normal', clearMark: (m) => m.type.name === 'em' }],
    toDOM() { return ['em', 0]; },
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration', getAttrs: (v) => /line-through/.test(v) && null }],
    toDOM() { return ['s', 0]; },
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() { return ['code', 0]; },
  },
};

export const schema = new Schema({ nodes, marks });

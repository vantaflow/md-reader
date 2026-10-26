// Passerelle Markdown <-> document ProseMirror du mode « Document ».
//
//  - analyserMarkdown(source) : texte -> { doc, frontMatter, eol } ;
//  - serialiserMarkdown(doc, { frontMatter, eol }) : l'inverse ;
//  - docVersMarkdown(doc) : le corps seul.
//
// L'analyse s'appuie sur le lexeur de `marked` (le même moteur que l'aperçu),
// complété des mêmes extensions que l'aperçu : formules, encadrés `> [!NOTE]` et
// `:::note`, notes de bas de page, liens wiki. Ce que le mode Document ne sait
// pas représenter est conservé dans un bloc brut : l'aller-retour ne perd rien.
// La sérialisation est « canonique » (puces `-`, titres `#`, tableaux compacts…) :
// analyser puis sérialiser un document déjà canonique redonne le même texte.
//
// Module ES sans DOM : testable par `node --test`, bundlé par esbuild pour le renderer.
import { Marked } from 'marked';
import { Mark } from 'prosemirror-model';
import { schema, TYPES_ENCADRES, attrsStyleDepuisCss, analyserStyle, cssDepuisAttrsStyle, valideCouleur, alignementValide } from './schema.js';
import wiki from '../lib/wiki.js';

const N = schema.nodes;
const M = schema.marks;

// ───────────────────────────── Analyse ─────────────────────────────

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', euro: '€', deg: '°', times: '×', middot: '·', bull: '•', rarr: '→', larr: '←', eacute: 'é', egrave: 'è', agrave: 'à' };
// Marked échappe &, <, > et les guillemets dans ses jetons de texte : on les
// défait, ainsi que les entités courantes écrites dans la source.
function decoder(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return Object.prototype.hasOwnProperty.call(ENTITES, e.toLowerCase()) ? ENTITES[e.toLowerCase()] : m;
  }).replace(/&#39;/g, "'");
}

const RE_MATH_LIGNE = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:？！。，：]|$)/;

function creerMarked() {
  const m = new Marked({ gfm: true, breaks: false });
  m.use({
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        start(src) { const i = src.search(/\n\$\$[ \t]*\n/); return i < 0 ? undefined : i + 1; },
        tokenizer(src) {
          const r = /^\$\$[ \t]*\n((?:\\[^]|[^\\])+?)\n[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src);
          return r ? { type: 'mathBlock', raw: r[0], tex: r[1] } : undefined;
        },
      },
      {
        // Citation d'encadré GitHub : `> [!NOTE]` suivi de lignes `> …`.
        name: 'alertGfm',
        level: 'block',
        start(src) { const i = src.search(/\n>[ \t]?\[!/i); return i < 0 ? undefined : i + 1; },
        tokenizer(src) {
          const premiere = /^ {0,3}>[ \t]?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i.exec(src);
          if (!premiere) return undefined;
          const lignes = src.slice(premiere[0].length).split('\n');
          const corps = [];
          let brut = premiere[0];
          for (const l of lignes) {
            if (!/^ {0,3}>/.test(l)) break;
            corps.push(l.replace(/^ {0,3}>[ \t]?/, ''));
            brut += l + '\n';
          }
          if (brut.endsWith('\n') && !src.startsWith(brut)) brut = brut.slice(0, -1);
          const texte = corps.join('\n');
          return { type: 'alert', raw: brut, name: premiere[1].toLowerCase(), syntax: 'gfm', tokens: this.lexer.blockTokens(texte, []) };
        },
      },
      {
        // Conteneur `:::nom … :::` (Docusaurus). Un nom d'encadré connu devient un
        // encadré, tout autre nom reste en bloc brut.
        name: 'directive',
        level: 'block',
        start(src) { const i = src.search(/\n:::[A-Za-z]/); return i < 0 ? undefined : i + 1; },
        tokenizer(src) {
          const r = /^:::([A-Za-z][\w-]*)[^\n]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/.exec(src);
          if (!r) return undefined;
          const nom = r[1].toLowerCase();
          if (!TYPES_ENCADRES.includes(nom)) return { type: 'rawBlock', raw: r[0] };
          return { type: 'alert', raw: r[0], name: nom, syntax: 'directive', tokens: this.lexer.blockTokens(r[2], []) };
        },
      },
      {
        name: 'footnoteDef',
        level: 'block',
        start(src) { const i = src.search(/\n\[\^[^\]\s]+\]:/); return i < 0 ? undefined : i + 1; },
        tokenizer(src) {
          const premiere = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*)(?:\n|$)/.exec(src);
          if (!premiere) return undefined;
          let brut = premiere[0];
          const corps = [premiere[2]];
          const reste = src.slice(premiere[0].length).split('\n');
          let vides = [];
          for (let i = 0; i < reste.length; i += 1) {
            const l = reste[i];
            if (l.trim() === '') { vides.push(l); continue; }
            if (!/^( {4}|\t)/.test(l)) break;
            corps.push(...vides, l.replace(/^( {4}|\t)/, ''));
            brut += vides.map(() => '\n').join('') + l + '\n';
            vides = [];
          }
          return { type: 'footnoteDef', raw: brut, label: premiere[1], tokens: this.lexer.blockTokens(corps.join('\n'), []) };
        },
      },
      {
        name: 'mathInline',
        level: 'inline',
        start(src) { return src.indexOf('$'); },
        tokenizer(src) {
          const r = RE_MATH_LIGNE.exec(src);
          return r ? { type: 'mathInline', raw: r[0], tex: r[2].trim(), display: r[1].length === 2 } : undefined;
        },
      },
      {
        name: 'footnoteRef',
        level: 'inline',
        start(src) { return src.indexOf('[^'); },
        tokenizer(src) {
          const r = /^\[\^([^\]\s]+)\]/.exec(src);
          return r ? { type: 'footnoteRef', raw: r[0], label: r[1] } : undefined;
        },
      },
      {
        name: 'wikilink',
        level: 'inline',
        start(src) { return src.indexOf('[['); },
        tokenizer(src) {
          const r = /^\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/.exec(src);
          if (!r || !wiki.analyserLien(r[1], r[2])) return undefined;
          return { type: 'wikilink', raw: r[0] };
        },
      },
    ],
  });
  return m;
}

const marked = creerMarked();

function marque(type, attrs) { return M[type].create(attrs); }

// Balise HTML en ligne : { ferme, nom, attrs: texte des attributs, auto }.
function lireBalise(raw) {
  const r = /^<(\/)?([a-zA-Z][\w-]*)([^>]*?)(\/)?>$/.exec(raw.trim());
  return r ? { ferme: !!r[1], nom: r[2].toLowerCase(), attrs: r[3] || '', auto: !!r[4] } : null;
}

function attributHtml(attrs, nom) {
  const r = new RegExp(`(?:^|\\s)${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return r ? (r[1] !== undefined ? r[1] : r[2]) : null;
}

// Marque ProseMirror d'une balise ouvrante, ou null si elle n'est pas gérée.
function marqueDeBalise(b) {
  if (b.nom === 'u' || b.nom === 'ins') return b.attrs.trim() === '' ? marque('underline') : null;
  // Variante HTML des emphases, écrite quand les délimiteurs `*` se toucheraient.
  const equivalent = { strong: 'strong', b: 'strong', em: 'em', i: 'em', s: 'strike', del: 'strike', strike: 'strike' }[b.nom];
  if (equivalent) return b.attrs.trim() === '' ? marque(equivalent) : null;
  if (b.nom === 'mark') {
    if (b.attrs.trim() === '') return marque('highlight', { color: null });
    const style = attributHtml(b.attrs, 'style');
    if (style === null || b.attrs.replace(/style\s*=\s*(?:"[^"]*"|'[^']*')/i, '').trim() !== '') return null;
    const d = analyserStyle(style, ['background-color', 'background']);
    const fond = d && (d['background-color'] || d.background);
    return fond && valideCouleur(fond) ? marque('highlight', { color: fond }) : null;
  }
  if (b.nom === 'span') {
    const style = attributHtml(b.attrs, 'style');
    if (style === null || b.attrs.replace(/style\s*=\s*(?:"[^"]*"|'[^']*')/i, '').trim() !== '') return null;
    const a = attrsStyleDepuisCss(style);
    return a ? marque('style', a) : null;
  }
  return null;
}

function texteNoeud(texte, marques) {
  const t = texte.replace(/[ \t]*\n[ \t]*/g, ' ');
  return t ? [schema.text(t, marques)] : [];
}

function enLigne(jetons, marques = []) {
  const sortie = [];
  for (let i = 0; i < jetons.length; i += 1) {
    const t = jetons[i];
    switch (t.type) {
      case 'text':
        if (t.tokens) sortie.push(...enLigne(t.tokens, marques));
        else sortie.push(...texteNoeud(decoder(t.text), marques));
        break;
      case 'escape': sortie.push(...texteNoeud(decoder(t.text), marques)); break;
      case 'strong': sortie.push(...enLigne(t.tokens, [...marques, marque('strong')])); break;
      case 'em': sortie.push(...enLigne(t.tokens, [...marques, marque('em')])); break;
      case 'del': sortie.push(...enLigne(t.tokens, [...marques, marque('strike')])); break;
      case 'codespan': sortie.push(...texteNoeud(decoder(t.text), [...marques, marque('code')])); break;
      case 'br': sortie.push(N.hard_break.create(null, null, marques)); break;
      case 'link': sortie.push(...enLigne(t.tokens || [{ type: 'text', text: t.text }], [...marques, marque('link', { href: decoder(t.href), title: t.title ? decoder(t.title) : null })])); break;
      case 'image': sortie.push(N.image.create({ src: decoder(t.href), alt: decoder(t.text || ''), title: t.title ? decoder(t.title) : null }, null, marques)); break;
      case 'mathInline': sortie.push(N.math_inline.create({ tex: t.tex, display: t.display }, null, marques)); break;
      case 'footnoteRef': sortie.push(N.footnote_ref.create({ label: t.label }, null, marques)); break;
      case 'wikilink': sortie.push(N.wikilink.create({ raw: t.raw }, null, marques)); break;
      case 'html': {
        const b = lireBalise(t.raw);
        if (b && b.nom === 'br') { sortie.push(N.hard_break.create(null, null, marques)); break; }
        const m = b && !b.ferme && !b.auto ? marqueDeBalise(b) : null;
        if (m) {
          // Recherche de la balise fermante du même niveau.
          let profondeur = 1;
          let j = i + 1;
          for (; j < jetons.length; j += 1) {
            if (jetons[j].type !== 'html') continue;
            const c = lireBalise(jetons[j].raw);
            if (!c || c.nom !== b.nom || c.auto) continue;
            profondeur += c.ferme ? -1 : 1;
            if (profondeur === 0) break;
          }
          if (j < jetons.length) {
            sortie.push(...enLigne(jetons.slice(i + 1, j), [...marques, m]));
            i = j;
            break;
          }
        }
        sortie.push(N.html_inline.create({ raw: t.raw }, null, marques));
        break;
      }
      default:
        // Jeton inconnu : sa source est gardée telle quelle.
        if (t.raw) sortie.push(N.html_inline.create({ raw: t.raw }, null, marques));
    }
  }
  return sortie;
}

const ATTRS_CELLULE = (align) => ({ colspan: 1, rowspan: 1, colwidth: null, align });
const ALIGN_MD = { left: 'left', center: 'center', right: 'right' };

function paragrapheVide() { return N.paragraph.create(); }

function enBlocs(jetons) {
  const sortie = [];
  for (let i = 0; i < jetons.length; i += 1) {
    const t = jetons[i];
    // <div align="center"> … </div> : enveloppe de mise en page (alignement, retrait).
    if (t.type === 'html') {
      const ouv = /^<div\b([^>]*)>$/i.exec(t.raw.trim());
      if (ouv) {
        const align = attributHtml(ouv[1], 'align');
        const style = attributHtml(ouv[1], 'style');
        const reste = ouv[1].replace(/\b(align|style)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '').trim();
        const d = style !== null ? analyserStyle(style, ['margin-left', 'text-align']) : {};
        const retrait = d && d['margin-left'] ? /^(\d+(?:\.\d+)?)em$/.exec(d['margin-left']) : null;
        const alignFinal = alignementValide(align) || alignementValide(d && d['text-align']);
        let j = i + 1;
        while (j < jetons.length && !(jetons[j].type === 'html' && /^<\/div>$/i.test(jetons[j].raw.trim()))) j += 1;
        if (!reste && d && (alignFinal || retrait) && j < jetons.length) {
          const interieur = enBlocs(jetons.slice(i + 1, j)).map((n) => (
            n.type === N.paragraph || n.type === N.heading
              ? n.type.create({ ...n.attrs, align: alignFinal, indent: retrait ? Math.min(8, Math.round(Number(retrait[1]) / 2)) : 0 }, n.content, n.marks)
              : n));
          sortie.push(...interieur);
          i = j;
          continue;
        }
      }
    }
    sortie.push(...enBloc(t));
  }
  return sortie;
}

function enfantsBlocs(jetons) {
  const b = enBlocs(jetons);
  return b.length ? b : [paragrapheVide()];
}

function cellule(type, jetons, align) {
  return type.create(ATTRS_CELLULE(align), N.paragraph.create(null, enLigne(jetons || [])));
}

function enBloc(t) {
  switch (t.type) {
    case 'space': return [];
    case 'heading': return [N.heading.create({ level: Math.min(6, Math.max(1, t.depth)) }, enLigne(t.tokens || []))];
    case 'paragraph': {
      if (/^\[\[toc\]\]$/i.test(t.raw.trim())) return [N.toc.create()];
      return [N.paragraph.create(null, enLigne(t.tokens || []))];
    }
    case 'text': return [N.paragraph.create(null, enLigne(t.tokens || [t]))];
    case 'code': {
      const info = (t.lang || '').trim();
      if (info.toLowerCase() === 'mermaid') return [N.mermaid_block.create({ source: t.text })];
      return [N.code_block.create({ lang: info }, t.text ? schema.text(t.text) : null)];
    }
    case 'hr': return [N.horizontal_rule.create()];
    case 'blockquote': return [N.blockquote.create(null, enfantsBlocs(t.tokens || []))];
    case 'alert': return [N.alert.create({ type: t.name, syntax: t.syntax }, enfantsBlocs(t.tokens || []))];
    case 'list': {
      const items = t.items.map((it) => {
        const contenu = (it.tokens || []).flatMap((c) => (c.type === 'text' ? [N.paragraph.create(null, enLigne(c.tokens || [c]))] : enBloc(c)));
        return N.list_item.create({ checked: it.task ? !!it.checked : null }, contenu.length ? contenu : [paragrapheVide()]);
      });
      const serre = !t.loose;
      if (t.ordered) return [N.ordered_list.create({ start: Number(t.start) || 1, tight: serre }, items)];
      return [N.bullet_list.create({ tight: serre }, items)];
    }
    case 'table': {
      const aligns = (t.align || []).map((a) => ALIGN_MD[a] || null);
      const vide = t.header.every((c) => !(c.text || '').trim());
      const lignes = [];
      if (!vide) lignes.push(N.table_row.create(null, t.header.map((c, k) => cellule(N.table_header, c.tokens, aligns[k] || null))));
      for (const r of t.rows) lignes.push(N.table_row.create(null, r.map((c, k) => cellule(N.table_cell, c.tokens, aligns[k] || null))));
      if (!lignes.length) lignes.push(N.table_row.create(null, t.header.map((c, k) => cellule(N.table_cell, [], aligns[k] || null))));
      return [N.table.create(null, lignes)];
    }
    case 'mathBlock': return [N.math_block.create({ tex: t.tex })];
    case 'footnoteDef': return [N.footnote_def.create({ label: t.label }, enfantsBlocs(t.tokens || []))];
    case 'html': {
      const brut = t.raw.replace(/\s+$/, '');
      if (/^<!--\s*pagebreak\s*-->$/i.test(brut) || /^<div class="page-break"><\/div>$/i.test(brut)) return [N.page_break.create()];
      return [N.raw_block.create({ raw: brut })];
    }
    default:
      return t.raw && t.raw.trim() ? [N.raw_block.create({ raw: t.raw.replace(/\s+$/, '') })] : [];
  }
}

// Lignes `[id]: adresse "titre"` hors blocs de code.
function definitionsDeLiens(corps) {
  const defs = [];
  let cloture = null;
  for (const ligne of corps.split('\n')) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(ligne);
    if (f) {
      if (!cloture) cloture = f[1][0].repeat(f[1].length);
      else if (f[1][0] === cloture[0] && f[1].length >= cloture.length) cloture = null;
      continue;
    }
    if (!cloture && /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*\S/.test(ligne)) defs.push(ligne.trim());
  }
  return defs;
}

const RE_FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/;

export function analyserMarkdown(source) {
  const src = String(source == null ? '' : source);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const texte = src.replace(/\r\n/g, '\n');
  const fm = RE_FRONT_MATTER.exec(texte);
  const frontMatter = fm ? (fm[0].endsWith('\n') ? fm[0] : fm[0] + '\n') : '';
  const corps = fm ? texte.slice(fm[0].length) : texte;
  const jetons = marked.lexer(corps);
  const blocs = enBlocs(jetons);
  // Le lexeur résout les liens de référence et écarte leurs définitions : on les
  // garde en blocs bruts, en fin de document, pour ne rien perdre.
  for (const d of definitionsDeLiens(corps)) blocs.push(N.raw_block.create({ raw: d }));
  const doc = N.doc.create(null, blocs.length ? blocs : [paragrapheVide()]);
  return { doc, frontMatter, eol };
}

// ─────────────────────────── Sérialisation ───────────────────────────

const RE_AMORCE_BLOC = /^(\s*)(#{1,6}(?=\s|$)|[-+](?=\s|$)|\d{1,9}[.)](?=\s|$)|>|=+\s*$|-{2,}\s*$|_{3,}\s*$|`{3,}|~{3,}|\||:::|\[[ xX]\](?=\s))/;

// Un paragraphe dont une ligne commencerait comme un bloc Markdown (titre,
// liste, citation…) serait relu autrement : on neutralise le premier caractère.
function echapperAmorces(texte) {
  return texte.split('\n').map((ligne) => ligne.replace(RE_AMORCE_BLOC, (m, esp, amorce) => {
    if (/^\d/.test(amorce)) return esp + amorce.slice(0, -1) + '\\' + amorce.slice(-1);
    return esp + '\\' + amorce;
  })).join('\n');
}

function echapperTexte(t, { cellule = false } = {}) {
  let s = t.replace(/ /g, '&nbsp;');
  s = s.replace(/[\\`*$~]/g, (c) => (c === '~' ? (s.includes('~~') ? '\\~' : c) : '\\' + c));
  // `_` : seulement hors d'un mot (l'emphase intra-mot n'existe pas avec `_`).
  s = s.replace(/_/g, (c, i) => (/\w/.test(s[i - 1] || ' ') && /\w/.test(s[i + 1] || ' ') ? c : '\\_'));
  s = s.replace(/&(?=#?\w+;)/g, '&amp;');
  s = s.replace(/<(?=[A-Za-z/!?])/g, '\\<');
  // Crochets : seulement quand ils pourraient former un lien, une note ou un lien wiki.
  s = s.replace(/\[/g, (c, i) => (/^\[|^\^/.test(s.slice(i + 1)) || /\](\(|\[|:)/.test(s.slice(i + 1)) ? '\\[' : c));
  s = s.replace(/\]/g, (c, i) => (/^(\(|\[|:)/.test(s.slice(i + 1)) ? '\\]' : c));
  if (cellule) s = s.replace(/\|/g, '\\|');
  return s;
}

function codeEnLigne(t, cellule = false) {
  if (cellule) t = t.replace(/\|/g, '\\|');
  let n = 1;
  for (const m of t.match(/`+/g) || []) n = Math.max(n, m.length + 1);
  const bord = '`'.repeat(n);
  const pad = /^`|`$|^ | $/.test(t) && t.trim() !== '' ? ' ' : '';
  return bord + pad + t + pad + bord;
}

function hrefMd(href) {
  return /[\s()<>]/.test(href) || href === '' ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href;
}

const BALISES_EMPHASE = { strong: 'strong', em: 'em', strike: 's' };
function ouverture(m, html = false) {
  if (html && BALISES_EMPHASE[m.type.name]) return `<${BALISES_EMPHASE[m.type.name]}>`;
  switch (m.type.name) {
    case 'strong': return '**';
    case 'em': return '*';
    case 'strike': return '~~';
    case 'underline': return '<u>';
    case 'highlight': return m.attrs.color ? `<mark style="background-color:${m.attrs.color}">` : '<mark>';
    case 'style': return `<span style="${cssDepuisAttrsStyle(m.attrs)}">`;
    case 'link': return '[';
    default: return '';
  }
}
function fermeture(m, html = false) {
  if (html && BALISES_EMPHASE[m.type.name]) return `</${BALISES_EMPHASE[m.type.name]}>`;
  switch (m.type.name) {
    case 'strong': return '**';
    case 'em': return '*';
    case 'strike': return '~~';
    case 'underline': return '</u>';
    case 'highlight': return '</mark>';
    case 'style': return '</span>';
    case 'link': return `](${hrefMd(m.attrs.href)}${m.attrs.title ? ` "${m.attrs.title.replace(/"/g, '\\"')}"` : ''})`;
    default: return '';
  }
}

const MARQUES_BORD = ['strong', 'em', 'strike'];

// Feuilles du contenu en ligne. Un texte fait seulement d'espaces perd ses
// marques gras / italique / barré (`** **` n'est pas une emphase valide) ; les
// espaces en bordure d'une marque sont, eux, déplacés à l'écriture.
function feuilles(parent) {
  const liste = [];
  parent.forEach((n) => {
    if (n.isText && !n.marks.some((m) => m.type.name === 'code') && n.text.trim() === '' && n.marks.some((m) => MARQUES_BORD.includes(m.type.name))) {
      liste.push({ noeud: n, marks: n.marks.filter((m) => !MARQUES_BORD.includes(m.type.name)) });
    } else if (n.isText && n.marks.some((m) => m.type.name === 'link' && m.attrs.href === n.text && /^https?:\/\/\S+$/.test(n.text)) && !n.marks.some((m) => m.type.name === 'code')) {
      // Lien automatique : l'adresse reste telle quelle, sans crochets.
      liste.push({ noeud: n, marks: n.marks.filter((m) => m.type.name !== 'link'), auto: true });
    } else liste.push({ noeud: n, marks: n.marks });
  });
  return liste;
}

function rendreInline(parent, { cellule = false } = {}) {
  let sortie = '';
  const ouvertes = []; // { m, html }
  let finFermeture = -1; // longueur de `sortie` juste après le dernier délimiteur fermant
  const fermerJusque = (k) => {
    while (ouvertes.length > k) {
      const { m, html } = ouvertes.pop();
      if (MARQUES_BORD.includes(m.type.name) && !html) {
        // Un délimiteur fermant ne peut pas suivre une espace : elle passe après.
        const ws = /\s+$/.exec(sortie);
        if (ws) { sortie = sortie.slice(0, sortie.length - ws[0].length) + fermeture(m) + ws[0]; continue; }
      }
      sortie += fermeture(m, html);
      if (!html) finFermeture = sortie.length;
    }
  };
  for (const { noeud, marks, auto } of feuilles(parent)) {
    let k = 0;
    while (k < ouvertes.length && marks.some((m) => m.eq(ouvertes[k].m))) k += 1;
    fermerJusque(k);
    const aOuvrir = marks.filter((m) => m.type.name !== 'code' && !ouvertes.some((o) => o.m.eq(m)));
    let texte = noeud.isText ? noeud.text : null;
    if (texte !== null && aOuvrir.some((m) => MARQUES_BORD.includes(m.type.name)) && !marks.some((m) => m.type.name === 'code')) {
      // Une espace en tête ne peut pas suivre un délimiteur ouvrant : elle passe avant.
      const debut = /^\s+/.exec(texte);
      if (debut) { sortie += echapperTexte(debut[0], { cellule }); texte = texte.slice(debut[0].length); }
    }
    for (const m of aOuvrir) {
      // Deux séries de délimiteurs qui se touchent (`***` puis `*`) seraient
      // ambiguës : la marque s'écrit alors avec sa balise HTML.
      const html = MARQUES_BORD.includes(m.type.name) && finFermeture === sortie.length && /[*~_]$/.test(sortie);
      sortie += ouverture(m, html);
      ouvertes.push({ m, html });
    }
    switch (noeud.type.name) {
      case 'text': {
        const code = noeud.marks.some((m) => m.type.name === 'code');
        if (code) sortie += codeEnLigne(noeud.text, cellule);
        else if (auto) sortie += texte;
        else sortie += echapperTexte(texte, { cellule });
        break;
      }
      case 'hard_break': sortie += cellule ? '<br>' : '\\\n'; break;
      case 'image': sortie += `![${noeud.attrs.alt.replace(/[[\]]/g, (c) => '\\' + c)}](${hrefMd(noeud.attrs.src)}${noeud.attrs.title ? ` "${noeud.attrs.title.replace(/"/g, '\\"')}"` : ''})`; break;
      case 'math_inline': sortie += noeud.attrs.display ? `$$${noeud.attrs.tex}$$` : `$${noeud.attrs.tex}$`; break;
      case 'footnote_ref': sortie += `[^${noeud.attrs.label}]`; break;
      case 'wikilink': sortie += noeud.attrs.raw; break;
      case 'html_inline': sortie += noeud.attrs.raw; break;
      default: break;
    }
  }
  fermerJusque(0);
  return sortie;
}

function indenter(texte, prefixe, prefixeVide = prefixe.replace(/\s+$/, '')) {
  return texte.split('\n').map((l) => (l === '' ? prefixeVide : prefixe + l)).join('\n');
}

function clotureCode(texte) {
  let n = 3;
  for (const m of texte.match(/^ {0,3}(`{3,})/gm) || []) n = Math.max(n, m.trim().length + 1);
  return '`'.repeat(n);
}

function listeSerree(liste) {
  if (!liste.attrs.tight) return false;
  let ok = true;
  liste.forEach((item) => {
    item.forEach((c, _o, i) => {
      if (i > 0 && !(c.type === N.bullet_list || c.type === N.ordered_list || c.type === N.code_block || c.type === N.mermaid_block)) ok = false;
    });
  });
  return ok;
}

function rendreListe(liste, variante) {
  const ordonnee = liste.type === N.ordered_list;
  const serree = listeSerree(liste);
  const items = [];
  liste.forEach((item, _o, idx) => {
    const marqueur = ordonnee ? `${liste.attrs.start + idx}${variante ? ')' : '.'} ` : `${variante ? '*' : '-'} `;
    const tache = item.attrs.checked === null ? '' : (item.attrs.checked ? '[x] ' : '[ ] ');
    const enfants = rendreEnfants(item, { serre: serree, garderVides: true });
    const lignes = (tache + enfants).split('\n');
    const pad = ' '.repeat(marqueur.length);
    items.push(lignes.map((l, i) => (i === 0 ? marqueur + l : (l === '' ? '' : pad + l))).join('\n').replace(/[ \t]+$/, ''));
  });
  return items.join(serree ? '\n' : '\n\n');
}

function rendreTableau(table) {
  const lignes = [];
  let alignements = [];
  let enteteReelle = false;
  table.forEach((row, _o, idx) => {
    const cellules = [];
    row.forEach((c) => {
      cellules.push(rendreInline(c.firstChild || { forEach() {} }, { cellule: true }).replace(/\n/g, ' ').trim());
      if (idx === 0) alignements.push(c.attrs.align);
    });
    if (idx === 0) enteteReelle = row.firstChild && row.firstChild.type === N.table_header;
    lignes.push(cellules);
  });
  const n = Math.max(1, ...lignes.map((l) => l.length));
  const ligne = (cs) => ('| ' + Array.from({ length: n }, (_, i) => cs[i] || '').join(' | ') + ' |').replace(/ {2,}\|/g, ' |');
  const sep = '| ' + Array.from({ length: n }, (_, i) => {
    const a = alignements[i];
    return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---';
  }).join(' | ') + ' |';
  const entete = enteteReelle ? lignes[0] : [];
  const corps = enteteReelle ? lignes.slice(1) : lignes;
  return [ligne(entete), sep, ...corps.map(ligne)].join('\n');
}

function rendreBloc(n, variante = false) {
  switch (n.type.name) {
    case 'paragraph': return echapperAmorces(rendreInline(n));
    case 'heading': return '#'.repeat(n.attrs.level) + ' ' + rendreInline(n).replace(/\\\n/g, ' ');
    case 'blockquote': return indenter(rendreEnfants(n, { garderVides: true }), '> ', '>');
    case 'alert': {
      const corps = rendreEnfants(n, { garderVides: true });
      if (n.attrs.syntax === 'directive') return `:::${n.attrs.type}\n${corps}\n:::`;
      return indenter(`[!${n.attrs.type.toUpperCase()}]\n${corps}`, '> ', '>');
    }
    case 'code_block': {
      const t = n.textContent;
      const f = clotureCode(t);
      return `${f}${n.attrs.lang}\n${t}\n${f}`;
    }
    case 'mermaid_block': {
      const f = clotureCode(n.attrs.source);
      return `${f}mermaid\n${n.attrs.source}\n${f}`;
    }
    case 'math_block': return `$$\n${n.attrs.tex}\n$$`;
    case 'raw_block': return n.attrs.raw;
    case 'horizontal_rule': return '---';
    case 'page_break': return '<!-- pagebreak -->';
    case 'toc': return '[[toc]]';
    case 'bullet_list': case 'ordered_list': return rendreListe(n, variante);
    case 'table': return rendreTableau(n);
    case 'footnote_def': {
      const enfants = [];
      n.forEach((c) => enfants.push(rendreBloc(c)));
      const [premier, ...suite] = enfants;
      return `[^${n.attrs.label}]: ${premier}` + suite.map((s) => '\n\n' + indenter(s, '    ')).join('');
    }
    default: return '';
  }
}

const vide = (n) => n.type === N.paragraph && n.content.size === 0;

// Enveloppe de mise en page : <div align="…" style="margin-left:…em">, séparée
// par des lignes vides pour que le Markdown interne reste interprété.
function enveloppe(a) {
  const attrs = [];
  if (a.align) attrs.push(`align="${a.align}"`);
  if (a.indent) attrs.push(`style="margin-left:${a.indent * 2}em"`);
  return `<div ${attrs.join(' ')}>`;
}
const miseEnPage = (n) => ((n.type === N.paragraph || n.type === N.heading) && (n.attrs.align || n.attrs.indent) ? `${n.attrs.align || ''}|${n.attrs.indent || 0}` : null);

function rendreEnfants(parent, { serre = false, garderVides = false } = {}) {
  const parties = [];
  let precedent = null;
  let variante = false;
  const total = parent.childCount;
  for (let i = 0; i < total; i += 1) {
    const n = parent.child(i);
    if (vide(n) && !(garderVides && total === 1) && !(garderVides && i === 0)) continue;
    const cle = miseEnPage(n);
    if (cle) {
      const groupe = [rendreBloc(n)];
      while (i + 1 < total && miseEnPage(parent.child(i + 1)) === cle) { i += 1; groupe.push(rendreBloc(parent.child(i))); }
      parties.push(`${enveloppe(n.attrs)}\n\n${groupe.join('\n\n')}\n\n</div>`);
      precedent = null;
      continue;
    }
    const estListe = n.type === N.bullet_list || n.type === N.ordered_list;
    if (estListe && precedent && precedent.type === n.type) variante = !variante;
    else variante = false;
    parties.push(rendreBloc(n, variante));
    precedent = n;
  }
  return parties.join(serre ? '\n' : '\n\n');
}

export function docVersMarkdown(doc) {
  return rendreEnfants(doc);
}

export function serialiserMarkdown(doc, { frontMatter = '', eol = '\n' } = {}) {
  const corps = docVersMarkdown(doc);
  let sortie = '';
  if (frontMatter) {
    sortie += frontMatter.endsWith('\n') ? frontMatter : frontMatter + '\n';
    if (corps) sortie += '\n';
  }
  if (corps) sortie += corps + '\n';
  return eol === '\r\n' ? sortie.replace(/\n/g, '\r\n') : sortie;
}

export { Mark };

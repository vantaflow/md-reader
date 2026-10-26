// Éditeur du mode « Document » : ProseMirror (état, vue, commandes, vues de
// nœuds, raccourcis, règles de saisie Markdown). Aucune dépendance à l'interface
// de l'application : tout ce qui touche l'extérieur (images, diagrammes, formules,
// menu contextuel) passe par les options de `creerEditeurDocument`.
//
// Le fichier reste du Markdown : `charger(source)` lit le texte, `versMarkdown()`
// le réécrit. Tant que le document n'a pas été modifié, `versMarkdown()` renvoie
// le texte d'origine à l'octet près (aller-retour sans aucune perte).
import { EditorState, Plugin, TextSelection, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Slice } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift, exitCode, chainCommands, joinBackward, selectNodeBackward, deleteSelection } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { inputRules, InputRule, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import {
  tableEditing, goToNextCell, addRowBefore, addRowAfter, deleteRow, addColumnBefore, addColumnAfter, deleteColumn,
  deleteTable, toggleHeaderRow, isInTable, selectedRect,
} from 'prosemirror-tables';
import katex from 'katex';
import { schema } from './schema.js';
import { analyserMarkdown, serialiserMarkdown } from './markdown.js';

const N = schema.nodes;
const M = schema.marks;

// ───────────────────────── Aides ─────────────────────────

const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };

function marqueActive(state, type) {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!(type.isInSet(state.storedMarks || $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

function marqueDeLaSelection(state, type) {
  const { from, to, empty, $from } = state.selection;
  if (empty) return type.isInSet(state.storedMarks || $from.marks()) || null;
  let trouvee = null;
  state.doc.nodesBetween(from, to, (n) => { if (!trouvee && n.isInline) trouvee = type.isInSet(n.marks) || null; });
  return trouvee;
}

// Bloc de texte parent de la sélection et ses ancêtres.
function ancetre(state, nom) {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d -= 1) if ($from.node(d).type.name === nom) return { noeud: $from.node(d), profondeur: d };
  return null;
}

const ressembleAMarkdown = (t) => /\n/.test(t.trim()) || /^(\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\|.*\|)|.*(\*\*|__|`|\[.+\]\(.+\)|!\[))/.test(t.trim());

// ───────────────────────── Vues de nœuds ─────────────────────────

function vueCodeBloc(node, view, getPos) {
  const dom = el('pre', 'bloc-code');
  const entete = el('div', 'bloc-code-entete');
  entete.contentEditable = 'false';
  const lang = el('input', 'bloc-code-langue');
  lang.type = 'text';
  lang.placeholder = 'langage';
  lang.value = node.attrs.lang;
  lang.setAttribute('aria-label', 'Langage du bloc de code');
  lang.addEventListener('change', () => {
    view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, lang: lang.value.trim() }));
    view.focus();
  });
  lang.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); lang.blur(); view.focus(); } });
  entete.appendChild(lang);
  const code = el('code');
  dom.append(entete, code);
  return {
    dom,
    contentDOM: code,
    update(n) { if (n.type !== node.type) return false; node = n; if (document.activeElement !== lang) lang.value = n.attrs.lang; return true; },
    stopEvent(e) { return e.target === lang; },
    ignoreMutation(m) { return !code.contains(m.target) && m.type !== 'selection'; },
  };
}

function vueElementListe(node, view, getPos) {
  if (node.attrs.checked === null) return undefined;
  const dom = el('li', 'tache');
  const case_ = el('input');
  case_.type = 'checkbox';
  case_.checked = !!node.attrs.checked;
  case_.contentEditable = 'false';
  case_.setAttribute('aria-label', 'Tâche terminée');
  case_.addEventListener('change', () => {
    view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, checked: case_.checked }));
  });
  const contenu = el('div', 'tache-contenu');
  dom.append(case_, contenu);
  return {
    dom,
    contentDOM: contenu,
    update(n) {
      if (n.type !== node.type || n.attrs.checked === null) return false;
      node = n;
      case_.checked = !!n.attrs.checked;
      dom.classList.toggle('faite', !!n.attrs.checked);
      return true;
    },
    stopEvent(e) { return e.target === case_; },
    ignoreMutation(m) { return !contenu.contains(m.target) && m.type !== 'selection'; },
  };
}

function creerVuesNoeuds(opts) {
  const rendreKatex = (cible, tex, display) => {
    try { cible.innerHTML = katex.renderToString(tex || '\\ ', { throwOnError: false, displayMode: display }); } catch { cible.textContent = tex; }
  };
  let compteurMermaid = 0;

  return {
    code_block: vueCodeBloc,
    list_item: vueElementListe,

    image(node) {
      const img = el('img', 'doc-image');
      const dessiner = (n) => {
        img.alt = n.attrs.alt || '';
        img.title = n.attrs.title || '';
        img.src = opts.resoudreImage ? opts.resoudreImage(n.attrs.src) : n.attrs.src;
        img.draggable = true;
      };
      dessiner(node);
      return { dom: img, update(n) { if (n.type !== node.type) return false; node = n; dessiner(n); return true; } };
    },

    math_inline(node, view, getPos) {
      const dom = el('span', 'math-ligne');
      const dessiner = (n) => rendreKatex(dom, n.attrs.tex, !!n.attrs.display);
      dessiner(node);
      dom.title = 'Double-clic : modifier la formule';
      dom.addEventListener('dblclick', () => opts.onEditerMath && opts.onEditerMath({ pos: getPos(), node }));
      return { dom, update(n) { if (n.type !== node.type) return false; node = n; dessiner(n); return true; } };
    },

    math_block(node, view, getPos) {
      const dom = el('div', 'math-bloc');
      const dessiner = (n) => rendreKatex(dom, n.attrs.tex, true);
      dessiner(node);
      dom.title = 'Double-clic : modifier la formule';
      dom.addEventListener('dblclick', () => opts.onEditerMath && opts.onEditerMath({ pos: getPos(), node }));
      return { dom, update(n) { if (n.type !== node.type) return false; node = n; dessiner(n); return true; } };
    },

    mermaid_block(node, view, getPos) {
      const dom = el('div', 'mermaid-bloc');
      const rendu = el('div', 'mermaid-rendu');
      const etiquette = el('div', 'bloc-etiquette', 'Diagramme · double-clic pour modifier');
      dom.append(rendu, etiquette);
      let dernier = null;
      const dessiner = async (n) => {
        if (dernier === n.attrs.source) return;
        dernier = n.attrs.source;
        const id = 'mmd-doc-' + (compteurMermaid += 1);
        try {
          if (!window.mermaid) throw new Error('Mermaid indisponible');
          const { svg } = await window.mermaid.render(id, n.attrs.source);
          if (dernier === n.attrs.source) rendu.innerHTML = svg;
        } catch (e) {
          rendu.textContent = '';
          const msg = el('div', 'mermaid-erreur', 'Diagramme invalide ou non affichable');
          const code = el('pre', undefined, n.attrs.source);
          rendu.append(msg, code);
          const parasite = document.getElementById('d' + id);
          if (parasite) parasite.remove();
        }
      };
      dessiner(node);
      dom.addEventListener('dblclick', () => opts.onEditerMermaid && opts.onEditerMermaid({ pos: getPos(), source: node.attrs.source }));
      return { dom, update(n) { if (n.type !== node.type) return false; node = n; dessiner(n); return true; }, stopEvent: () => false };
    },

    raw_block(node, view, getPos) {
      const dom = el('div', 'bloc-brut');
      const pre = el('pre', undefined, node.attrs.raw);
      const etiquette = el('div', 'bloc-etiquette', 'HTML ou Markdown conservé tel quel · double-clic pour modifier');
      dom.append(pre, etiquette);
      dom.addEventListener('dblclick', () => opts.onEditerBrut && opts.onEditerBrut({ pos: getPos(), raw: node.attrs.raw }));
      return { dom, update(n) { if (n.type !== node.type) return false; node = n; pre.textContent = n.attrs.raw; return true; } };
    },

    page_break() {
      const dom = el('div', 'page-break saut-page');
      dom.setAttribute('data-etiquette', 'Saut de page');
      return { dom };
    },

    toc() {
      const dom = el('div', 'sommaire-bloc');
      dom.append(el('strong', undefined, 'Sommaire'), el('span', undefined, ' — généré à partir des titres (aperçu et exports)'));
      return { dom };
    },
  };
}

// ───────────────────────── Règles de saisie ─────────────────────────

// Règle de saisie d'une marque : `(^|espace)DELIM texte DELIM`. Le dernier
// délimiteur tapé n'est jamais inséré dans le document (la règle le remplace).
function regleMarque(regexp, type, longueurDelimiteur) {
  return new InputRule(regexp, (state, match, start, end) => {
    const prefixe = match[1].length;
    const texte = match[2];
    const debutDelimiteur = start + prefixe;
    const debutTexte = debutDelimiteur + longueurDelimiteur;
    const finTexte = debutTexte + texte.length;
    const tr = state.tr;
    if (finTexte < end) tr.delete(finTexte, end);
    tr.delete(debutDelimiteur, debutTexte);
    tr.addMark(debutDelimiteur, debutDelimiteur + texte.length, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

function creerReglesSaisie() {
  const regles = [];
  regles.push(new InputRule(/^(#{1,6})\s$/, (state, match, start, end) => state.tr.delete(start, end).setBlockType(start, start, N.heading, { level: match[1].length })));
  regles.push(wrappingInputRule(/^\s*>\s$/, N.blockquote));
  regles.push(wrappingInputRule(/^\s*([-+*])\s$/, N.bullet_list));
  regles.push(wrappingInputRule(/^(\d+)[.)]\s$/, N.ordered_list, (m) => ({ start: Number(m[1]) }), (m, node) => node.childCount + node.attrs.start === Number(m[1])));
  // `[ ] ` ou `[x] ` en tête d'un élément de liste : l'élément devient une tâche.
  regles.push(new InputRule(/^\[( |x|X)\]\s$/, (state, match, start, end) => {
    const $s = state.doc.resolve(start);
    const d = $s.depth - 1;
    if (d < 1 || $s.node(d).type !== N.list_item || $s.index(d) !== 0) return null;
    return state.tr.delete(start, end).setNodeMarkup($s.before(d), null, { ...$s.node(d).attrs, checked: match[1].toLowerCase() === 'x' });
  }));
  regles.push(textblockTypeInputRule(/^```([\w-]*)\s$/, N.code_block, (m) => ({ lang: m[1] || '' })));
  regles.push(new InputRule(/^(?:---|\*\*\*|___)\s$/, (state, match, start) => {
    const $s = state.doc.resolve(start);
    if ($s.parent.type !== N.paragraph || $s.depth !== 1) return null;
    const tr = state.tr.replaceWith($s.before(), $s.after(), [N.horizontal_rule.create(), N.paragraph.create()]);
    return tr.setSelection(TextSelection.near(tr.doc.resolve($s.before() + 2)));
  }));
  regles.push(regleMarque(/(^|[\s(])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, M.strong, 2));
  regles.push(regleMarque(/(^|[\s(])~~([^~\s](?:[^~]*[^~\s])?)~~$/, M.strike, 2));
  regles.push(regleMarque(/(^|[\s(])`([^`\s](?:[^`]*[^`\s])?)`$/, M.code, 1));
  regles.push(regleMarque(/(^|[\s(])\*([^*\s](?:[^*]*[^*\s])?)\*$/, M.em, 1));
  regles.push(regleMarque(/(^|[\s(])_([^_\s](?:[^_]*[^_\s])?)_$/, M.em, 1));
  return inputRules({ rules: regles });
}

// ───────────────────────── Commandes ─────────────────────────

const toggleListe = (type) => (state, dispatch) => {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, (n) => n.childCount > 0 && n.firstChild.type === N.list_item);
  if (range && range.depth >= 0 && range.parent.type === type) return liftListItem(N.list_item)(state, dispatch);
  if (range && (range.parent.type === N.bullet_list || range.parent.type === N.ordered_list)) {
    if (dispatch) dispatch(state.tr.setNodeMarkup(range.$from.before(range.depth), type, type === N.ordered_list ? { start: 1, tight: range.parent.attrs.tight } : { tight: range.parent.attrs.tight }));
    return true;
  }
  return wrapInList(type)(state, dispatch);
};

// Éléments de liste touchés par la sélection : [{ pos, node }].
function elementsDeListe(state) {
  const { from, to } = state.selection;
  const items = [];
  state.doc.nodesBetween(from, to, (n, pos) => { if (n.type === N.list_item) items.push({ pos, node: n }); });
  return items;
}

// Liste de tâches : crée une liste à puces si besoin, puis coche/décoche le statut
// « tâche » de tous les éléments touchés par la sélection.
function basculerTaches(vue) {
  if (!elementsDeListe(vue.state).length) toggleListe(N.bullet_list)(vue.state, vue.dispatch);
  const items = elementsDeListe(vue.state);
  if (!items.length) return false;
  const toutesTaches = items.every((i) => i.node.attrs.checked !== null);
  const tr = vue.state.tr;
  for (const i of items) tr.setNodeMarkup(i.pos, null, { ...i.node.attrs, checked: toutesTaches ? null : (i.node.attrs.checked === null ? false : i.node.attrs.checked) });
  vue.dispatch(tr);
  return true;
}

function definirTypeBloc(type, attrs) {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const parent = $from.parent;
    if (parent.type === type && Object.keys(attrs || {}).every((k) => parent.attrs[k] === attrs[k])) return setBlockType(N.paragraph)(state, dispatch);
    return setBlockType(type, attrs)(state, dispatch);
  };
}

const basculerCitation = (state, dispatch) => {
  const q = ancetre(state, 'blockquote');
  if (q) return lift(state, dispatch);
  return wrapIn(N.blockquote)(state, dispatch);
};

// Position d'insertion d'un bloc : à la place d'un paragraphe vide, sinon après le
// bloc de premier niveau qui contient la sélection.
function insererBloc(state, noeud) {
  const { $from } = state.selection;
  const tr = state.tr;
  let pos;
  if ($from.parent.type === N.paragraph && $from.parent.content.size === 0 && $from.depth === 1) {
    pos = $from.before(1);
    tr.replaceWith(pos, $from.after(1), noeud);
  } else {
    pos = $from.depth >= 1 ? $from.after(1) : $from.pos;
    tr.insert(pos, noeud);
  }
  const fin = pos + noeud.nodeSize;
  if (fin >= tr.doc.content.size) tr.insert(fin, N.paragraph.create());
  return { tr, pos, fin };
}

function creerTableau(lignes, colonnes) {
  const cellule = (type) => type.createAndFill({ colspan: 1, rowspan: 1, colwidth: null, align: null });
  const rows = [];
  for (let r = 0; r < lignes; r += 1) {
    const cells = [];
    for (let c = 0; c < colonnes; c += 1) cells.push(cellule(r === 0 ? N.table_header : N.table_cell));
    rows.push(N.table_row.create(null, cells));
  }
  return N.table.create(null, rows);
}

// Aligne toute la colonne de la cellule courante (l'alignement est une propriété
// de colonne en Markdown).
function alignerColonne(align) {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (dispatch) {
      const rect = selectedRect(state);
      const map = rect.map;
      const tr = state.tr;
      const colonnes = new Set();
      for (let c = rect.left; c < rect.right; c += 1) colonnes.add(c);
      const vus = new Set();
      for (const c of colonnes) {
        for (let r = 0; r < map.height; r += 1) {
          const pos = map.map[r * map.width + c];
          if (vus.has(pos)) continue;
          vus.add(pos);
          const abs = rect.tableStart + pos;
          const noeud = tr.doc.nodeAt(abs);
          if (noeud) tr.setNodeMarkup(abs, null, { ...noeud.attrs, align });
        }
      }
      dispatch(tr);
    }
    return true;
  };
}

function alignementColonne(state) {
  if (!isInTable(state)) return null;
  try {
    const rect = selectedRect(state);
    const pos = rect.map.map[rect.top * rect.map.width + rect.left];
    const noeud = state.doc.nodeAt(rect.tableStart + pos);
    return noeud ? noeud.attrs.align : null;
  } catch { return null; }
}

// Applique des attributs de style (couleur, police, taille, fond) à la sélection.
function appliquerStyle(patch) {
  return (state, dispatch) => {
    const type = M.style;
    const { from, to, empty, $from } = state.selection;
    const fusionner = (ancien) => {
      const attrs = { color: null, fontFamily: null, fontSize: null, background: null, ...(ancien ? ancien.attrs : {}), ...patch };
      return Object.values(attrs).every((v) => v === null || v === undefined || v === '') ? null : type.create(attrs);
    };
    if (empty) {
      const courant = type.isInSet(state.storedMarks || $from.marks());
      const nouveau = fusionner(courant);
      if (dispatch) {
        let marques = (state.storedMarks || $from.marks()).filter((m) => m.type !== type);
        if (nouveau) marques = nouveau.addToSet(marques);
        dispatch(state.tr.setStoredMarks(marques));
      }
      return true;
    }
    if (dispatch) {
      const tr = state.tr;
      state.doc.nodesBetween(from, to, (n, pos) => {
        if (!n.isInline) return;
        const a = Math.max(pos, from);
        const b = Math.min(pos + n.nodeSize, to);
        const ancien = type.isInSet(n.marks);
        const nouveau = fusionner(ancien);
        tr.removeMark(a, b, type);
        if (nouveau) tr.addMark(a, b, nouveau);
      });
      dispatch(tr);
    }
    return true;
  };
}

function surligner(couleur) {
  return (state, dispatch) => {
    const type = M.highlight;
    const { from, to, empty, $from } = state.selection;
    if (empty) {
      if (dispatch) {
        const sans = (state.storedMarks || $from.marks()).filter((m) => m.type !== type);
        dispatch(state.tr.setStoredMarks(couleur === false ? sans : type.create({ color: couleur }).addToSet(sans)));
      }
      return true;
    }
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, type);
      if (couleur !== false) tr.addMark(from, to, type.create({ color: couleur }));
      dispatch(tr);
    }
    return true;
  };
}

function definirLien(href, titre) {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, M.link);
      if (href) tr.addMark(from, to, M.link.create({ href, title: titre || null }));
      dispatch(tr);
    }
    return true;
  };
}

// Plage de la marque lien autour de la position (pour modifier un lien existant).
function plageLien(state) {
  const { $from } = state.selection;
  const lien = M.link.isInSet($from.marks());
  if (!lien) return null;
  const debutParent = $from.start();
  const bornes = [];
  $from.parent.forEach((n, off) => { bornes.push({ n, de: debutParent + off, a: debutParent + off + n.nodeSize }); });
  const idx = bornes.findIndex((x) => $from.pos >= x.de && $from.pos <= x.a && lien.isInSet(x.n.marks));
  if (idx < 0) return null;
  let g = idx;
  let d = idx;
  while (g > 0 && lien.isInSet(bornes[g - 1].n.marks)) g -= 1;
  while (d < bornes.length - 1 && lien.isInSet(bornes[d + 1].n.marks)) d += 1;
  return { from: bornes[g].de, to: bornes[d].a, lien };
}

function effacerFormatage(state, dispatch) {
  const { from, to, empty } = state.selection;
  if (dispatch) {
    const tr = state.tr;
    if (empty) tr.setStoredMarks([]);
    else {
      for (const nom of ['style', 'underline', 'highlight', 'strong', 'em', 'strike', 'code']) tr.removeMark(from, to, M[nom]);
    }
    // Le bloc redevient un paragraphe ordinaire, sans alignement ni retrait.
    state.doc.nodesBetween(from, to, (n, pos) => {
      if (n.type === N.heading) tr.setNodeMarkup(pos, N.paragraph, { align: null, indent: 0 });
      else if (n.type === N.paragraph && (n.attrs.align || n.attrs.indent)) tr.setNodeMarkup(pos, null, { align: null, indent: 0 });
    });
    dispatch(tr);
  }
  return true;
}

function definirMiseEnPage(patch) {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    let ok = false;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (n, pos, parent) => {
      if ((n.type === N.paragraph || n.type === N.heading) && parent && parent.type !== N.list_item && parent.type !== N.table_cell && parent.type !== N.table_header) {
        tr.setNodeMarkup(pos, null, { ...n.attrs, ...patch(n.attrs) });
        ok = true;
      }
    });
    if (ok && dispatch) dispatch(tr);
    return ok;
  };
}

const retrait = (delta) => (state, dispatch) => {
  if (ancetre(state, 'list_item')) return (delta > 0 ? sinkListItem(N.list_item) : liftListItem(N.list_item))(state, dispatch);
  return definirMiseEnPage((a) => ({ indent: Math.max(0, Math.min(6, (a.indent || 0) + delta)) }))(state, dispatch);
};

function insererNoteBasDePage(state, dispatch) {
  const labels = [];
  state.doc.descendants((n) => { if (n.type === N.footnote_def || n.type === N.footnote_ref) labels.push(n.attrs.label); });
  const nums = labels.map((l) => Number(l)).filter(Number.isFinite);
  const label = String((nums.length ? Math.max(...nums) : 0) + 1);
  if (dispatch) {
    const tr = state.tr;
    tr.replaceSelectionWith(N.footnote_ref.create({ label }), false);
    const fin = tr.doc.content.size;
    const def = N.footnote_def.create({ label }, N.paragraph.create());
    tr.insert(fin, def);
    // Curseur dans la définition de la note.
    tr.setSelection(TextSelection.create(tr.doc, fin + 2));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

// ───────────────────────── Éditeur ─────────────────────────

export function creerEditeurDocument(parent, opts = {}) {
  let ref = { source: '', doc: null, frontMatter: '', eol: '\n' };
  let frontMatterModifie = false;
  const ecouteursChange = new Set();
  const ecouteursEtat = new Set();

  const raccourcis = {
    'Mod-b': toggleMark(M.strong),
    'Mod-i': toggleMark(M.em),
    'Mod-u': toggleMark(M.underline),
    'Mod-Shift-x': toggleMark(M.strike),
    'Mod-`': toggleMark(M.code),
    'Mod-k': () => { if (opts.onLien) { opts.onLien(); return true; } return false; },
    'Mod-Alt-1': definirTypeBloc(N.heading, { level: 1 }),
    'Mod-Alt-2': definirTypeBloc(N.heading, { level: 2 }),
    'Mod-Alt-3': definirTypeBloc(N.heading, { level: 3 }),
    'Mod-Alt-0': setBlockType(N.paragraph),
    'Mod-Alt-c': definirTypeBloc(N.code_block),
    'Mod-Shift-8': toggleListe(N.bullet_list),
    'Mod-Shift-7': toggleListe(N.ordered_list),
    'Mod-Shift-9': () => basculerTaches(vue),
    'Mod-Shift-.': basculerCitation,
    'Mod-Enter': (state, dispatch) => { if (dispatch) { const r = insererBloc(state, N.page_break.create()); dispatch(r.tr.scrollIntoView()); } return true; },
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(N.hard_break.create()).scrollIntoView()); return true; }),
    Enter: splitListItem(N.list_item),
    Tab: chainCommands(goToNextCell(1), sinkListItem(N.list_item), (state, dispatch) => {
      if (state.selection.$from.parent.type !== N.code_block) return false;
      if (dispatch) dispatch(state.tr.insertText('  ').scrollIntoView());
      return true;
    }),
    'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(N.list_item)),
    Backspace: chainCommands(deleteSelection, (state, dispatch) => {
      // Début d'un élément de liste vide ou d'un titre : retour au paragraphe.
      const { $from, empty } = state.selection;
      if (!empty || $from.parentOffset !== 0) return false;
      if ($from.parent.type === N.heading) return setBlockType(N.paragraph)(state, dispatch);
      return false;
    }, joinBackward, selectNodeBackward),
  };

  const etatInitial = EditorState.create({ doc: analyserMarkdown('').doc, plugins: creerPlugins() });

  function creerPlugins() {
    return [
      creerReglesSaisie(),
      history(),
      keymap(raccourcis),
      keymap(baseKeymap),
      tableEditing(),
      dropCursor(),
      gapCursor(),
      new Plugin({
        props: {
          // Annuler / Rétablir du menu natif (Édition) : même historique que Cmd+Z.
          handleDOMEvents: {
            beforeinput(view, event) {
              if (event.inputType === 'historyUndo') { event.preventDefault(); undo(view.state, view.dispatch); return true; }
              if (event.inputType === 'historyRedo') { event.preventDefault(); redo(view.state, view.dispatch); return true; }
              return false;
            },
            contextmenu(view, event) { return opts.onMenuContextuel ? !!opts.onMenuContextuel(event, view) : false; },
          },
          handlePaste(view, event) {
            const cd = event.clipboardData;
            if (!cd) return false;
            const fichiers = [...(cd.files || [])].filter((f) => /^image\//.test(f.type));
            if (fichiers.length && !cd.getData('text/plain') && opts.onImages) { event.preventDefault(); opts.onImages(fichiers, null); return true; }
            const html = cd.getData('text/html');
            const texte = cd.getData('text/plain');
            if (!html && texte && ressembleAMarkdown(texte) && !view.state.selection.$from.parent.type.spec.code) {
              const { doc } = analyserMarkdown(texte);
              view.dispatch(view.state.tr.replaceSelection(new Slice(doc.content, 0, 0)).scrollIntoView());
              return true;
            }
            return false;
          },
          handleDrop(view, event) {
            const fichiers = [...((event.dataTransfer && event.dataTransfer.files) || [])].filter((f) => /^image\//.test(f.type));
            if (!fichiers.length || !opts.onImages) return false;
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            opts.onImages(fichiers, coords ? coords.pos : null);
            return true;
          },
          handleClick(view, pos, event) {
            const t = event.target;
            if (t && t.closest) {
              const lien = t.closest('a.wikilink');
              if (lien && (event.metaKey || event.ctrlKey) && opts.onWikiLien) { opts.onWikiLien(lien.textContent); return true; }
            }
            return false;
          },
          clipboardTextSerializer: (slice) => serialiserFragment(slice.content),
        },
      }),
    ];
  }

  // Texte brut copié : le Markdown de la sélection.
  function serialiserFragment(fragment) {
    try { return serialiserMarkdown(N.doc.create(null, fragment.childCount ? fragment : N.paragraph.create())).replace(/\n$/, ''); } catch { return fragment.textBetween(0, fragment.size, '\n\n'); }
  }

  const vue = new EditorView(parent, {
    state: etatInitial,
    nodeViews: creerVuesNoeuds(opts),
    attributes: { class: 'pm-doc markdown-body', spellcheck: opts.correcteur === false ? 'false' : 'true', lang: 'fr', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document' },
    dispatchTransaction(tr) {
      const avant = vue.state;
      const apres = avant.apply(tr);
      vue.updateState(apres);
      if (tr.docChanged) for (const f of ecouteursChange) f();
      for (const f of ecouteursEtat) f();
    },
  });

  const lancer = (c) => { const r = c(vue.state, vue.dispatch, vue); vue.focus(); return r; };

  const api = {
    vue,
    schema,

    charger(source) {
      const { doc, frontMatter, eol } = analyserMarkdown(source);
      ref = { source, doc, frontMatter, eol };
      frontMatterModifie = false;
      vue.updateState(EditorState.create({ doc, plugins: creerPlugins() }));
      for (const f of ecouteursEtat) f();
    },

    // Texte Markdown du document : l'original à l'octet près s'il n'a pas été modifié.
    versMarkdown() {
      if (!api.modifie()) return ref.source;
      return serialiserMarkdown(vue.state.doc, { frontMatter: ref.frontMatter, eol: ref.eol });
    },
    modifie() { return frontMatterModifie || !vue.state.doc.eq(ref.doc); },
    frontMatter: () => ref.frontMatter,
    definirFrontMatter(texte) { if (texte !== ref.frontMatter) { ref.frontMatter = texte; frontMatterModifie = true; for (const f of ecouteursChange) f(); } },
    onChange(f) { ecouteursChange.add(f); return () => ecouteursChange.delete(f); },
    onEtat(f) { ecouteursEtat.add(f); return () => ecouteursEtat.delete(f); },
    focus: () => vue.focus(),
    detruire: () => vue.destroy(),

    annuler: () => lancer(undo),
    refaire: () => lancer(redo),
    couper: () => document.execCommand('cut'),
    copier: () => document.execCommand('copy'),
    coller: () => document.execCommand('paste'),

    // ── Mise en forme ──
    basculerMarque: (nom) => lancer(toggleMark(M[nom])),
    style: (patch) => lancer(appliquerStyle(patch)),
    surligner: (couleur) => lancer(surligner(couleur === undefined ? null : couleur)),
    retirerSurlignage: () => lancer(surligner(false)),
    effacerFormatage: () => lancer(effacerFormatage),
    alignement: (a) => lancer(definirMiseEnPage(() => ({ align: a === 'left' ? null : a }))),
    retrait: (d) => lancer(retrait(d)),
    bloc(nom) {
      if (nom === 'normal') {
        // « Normal » : sort aussi d'une citation.
        if (ancetre(vue.state, 'blockquote')) lift(vue.state, vue.dispatch);
        return lancer(setBlockType(N.paragraph));
      }
      if (/^titre[1-6]$/.test(nom)) return lancer(definirTypeBloc(N.heading, { level: Number(nom.slice(5)) }));
      if (nom === 'code') return lancer(definirTypeBloc(N.code_block));
      if (nom === 'citation') return lancer(basculerCitation);
      return false;
    },
    liste(nom) {
      if (nom === 'puces') return lancer(toggleListe(N.bullet_list));
      if (nom === 'numerotee') return lancer(toggleListe(N.ordered_list));
      if (nom === 'taches') { const r = basculerTaches(vue); vue.focus(); return r; }
      return false;
    },

    // ── Insertions ──
    insererTableau(lignes = 3, colonnes = 3) {
      const l = Math.max(1, Math.min(30, lignes));
      const c = Math.max(1, Math.min(12, colonnes));
      const { tr, pos } = insererBloc(vue.state, creerTableau(l, c));
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 3)));
      vue.dispatch(tr.scrollIntoView());
      vue.focus();
      return true;
    },
    insererImage({ src, alt = '', title = null }) {
      if (!src) return false;
      const noeud = N.image.create({ src, alt, title });
      vue.dispatch(vue.state.tr.replaceSelectionWith(noeud, false).scrollIntoView());
      vue.focus();
      return true;
    },
    insererImageA(pos, attrs) {
      const noeud = N.image.create({ src: attrs.src, alt: attrs.alt || '', title: attrs.title || null });
      const p = pos === null || pos === undefined ? vue.state.selection.from : Math.min(pos, vue.state.doc.content.size);
      vue.dispatch(vue.state.tr.insert(p, noeud).scrollIntoView());
    },
    insererLien({ href, texte, titre }) {
      const { empty, from, to } = vue.state.selection;
      const tr = vue.state.tr;
      if (empty) {
        const plage = plageLien(vue.state);
        if (plage) {
          // Curseur dans un lien : on le modifie.
          tr.removeMark(plage.from, plage.to, M.link);
          if (href) tr.addMark(plage.from, plage.to, M.link.create({ href, title: titre || null }));
        } else {
          const t = texte || href;
          tr.insertText(t, from).addMark(from, from + t.length, M.link.create({ href, title: titre || null }));
        }
      } else {
        tr.removeMark(from, to, M.link);
        if (href) tr.addMark(from, to, M.link.create({ href, title: titre || null }));
      }
      vue.dispatch(tr.scrollIntoView());
      vue.focus();
      return true;
    },
    lienCourant() {
      const { empty, from, to } = vue.state.selection;
      const marque = marqueDeLaSelection(vue.state, M.link);
      const plage = empty ? plageLien(vue.state) : null;
      return { href: marque ? marque.attrs.href : '', titre: marque ? marque.attrs.title || '' : '', texte: empty ? (plage ? vue.state.doc.textBetween(plage.from, plage.to) : '') : vue.state.doc.textBetween(from, to), vide: empty && !plage };
    },
    insererSautDePage() { const r = insererBloc(vue.state, N.page_break.create()); vue.dispatch(r.tr.scrollIntoView()); vue.focus(); return true; },
    insererLigne() { const r = insererBloc(vue.state, N.horizontal_rule.create()); vue.dispatch(r.tr.scrollIntoView()); vue.focus(); return true; },
    insererSommaire() { const r = insererBloc(vue.state, N.toc.create()); vue.dispatch(r.tr.scrollIntoView()); vue.focus(); return true; },
    insererNote() { return lancer(insererNoteBasDePage); },
    insererTexte(t) { vue.dispatch(vue.state.tr.insertText(t).scrollIntoView()); vue.focus(); return true; },
    insererMermaid(source) { const r = insererBloc(vue.state, N.mermaid_block.create({ source })); vue.dispatch(r.tr.scrollIntoView()); vue.focus(); return true; },
    insererFormule(tex, bloc = true) {
      if (bloc) { const r = insererBloc(vue.state, N.math_block.create({ tex })); vue.dispatch(r.tr.scrollIntoView()); }
      else vue.dispatch(vue.state.tr.replaceSelectionWith(N.math_inline.create({ tex }), false).scrollIntoView());
      vue.focus();
      return true;
    },
    insererEncadre(type = 'note') {
      const noeud = N.alert.create({ type, syntax: 'gfm' }, N.paragraph.create());
      const r = insererBloc(vue.state, noeud);
      r.tr.setSelection(TextSelection.near(r.tr.doc.resolve(r.pos + 2)));
      vue.dispatch(r.tr.scrollIntoView());
      vue.focus();
      return true;
    },

    // ── Remplacements par position (diagrammes, formules, bloc brut) ──
    remplacerAttrs(pos, attrs) {
      const noeud = vue.state.doc.nodeAt(pos);
      if (!noeud) return false;
      vue.dispatch(vue.state.tr.setNodeMarkup(pos, null, { ...noeud.attrs, ...attrs }));
      return true;
    },
    noeudA: (pos) => vue.state.doc.nodeAt(pos),
    // Bloc mermaid sélectionné (sélection de nœud), ou null.
    mermaidSelectionne() {
      const s = vue.state.selection;
      return s instanceof NodeSelection && s.node.type === N.mermaid_block ? { pos: s.from, source: s.node.attrs.source } : null;
    },
    supprimerA(pos) { const n = vue.state.doc.nodeAt(pos); if (n) vue.dispatch(vue.state.tr.delete(pos, pos + n.nodeSize)); },

    // ── Tableaux ──
    dansTableau: () => isInTable(vue.state),
    tableau: {
      ligneAvant: () => lancer(addRowBefore),
      ligneApres: () => lancer(addRowAfter),
      supprimerLigne: () => lancer(deleteRow),
      colonneAvant: () => lancer(addColumnBefore),
      colonneApres: () => lancer(addColumnAfter),
      supprimerColonne: () => lancer(deleteColumn),
      supprimerTableau: () => lancer(deleteTable),
      entete: () => lancer(toggleHeaderRow),
      aligner: (a) => lancer(alignerColonne(a === 'none' ? null : a)),
      aEntete() {
        if (!isInTable(vue.state)) return false;
        const rect = selectedRect(vue.state);
        const premier = rect.table.firstChild;
        return !!premier && premier.firstChild && premier.firstChild.type === N.table_header;
      },
    },

    // ── État pour le ruban ──
    etat() {
      const state = vue.state;
      const { $from } = state.selection;
      const parent = $from.parent;
      let bloc = 'normal';
      if (parent.type === N.heading) bloc = 'titre' + parent.attrs.level;
      else if (parent.type === N.code_block) bloc = 'code';
      else if (ancetre(state, 'blockquote')) bloc = 'citation';
      let liste = null;
      const item = ancetre(state, 'list_item');
      if (item) {
        const l = $from.node(item.profondeur - 1);
        liste = item.noeud.attrs.checked !== null ? 'taches' : (l.type === N.ordered_list ? 'numerotee' : 'puces');
      }
      const style = marqueDeLaSelection(state, M.style);
      const fond = marqueDeLaSelection(state, M.highlight);
      const lien = marqueDeLaSelection(state, M.link);
      return {
        marques: Object.fromEntries(['strong', 'em', 'underline', 'strike', 'code', 'highlight', 'link'].map((n) => [n, marqueActive(state, M[n])])),
        style: style ? { ...style.attrs } : { color: null, fontFamily: null, fontSize: null, background: null },
        surlignage: fond ? fond.attrs.color || '#ffff00' : null,
        lien: lien ? lien.attrs.href : null,
        bloc,
        liste,
        alignement: parent.attrs && parent.attrs.align ? parent.attrs.align : 'left',
        dansTableau: isInTable(state),
        alignementColonne: alignementColonne(state),
        enteteTableau: isInTable(state) ? api.tableau.aEntete() : false,
        peutAnnuler: undo(state),
        peutRefaire: redo(state),
        vide: state.doc.childCount === 1 && state.doc.firstChild.content.size === 0,
      };
    },
  };
  return api;
}

import { EditorState, Compartment, EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

const themeComp = new Compartment();
// Compartiments reconfigurables à chaud par setOptions() (réglages Éditeur).
const apparenceComp = new Compartment();
const wrapComp = new Compartment();
const numerosComp = new Compartment();
const tabComp = new Compartment();
const correcteurComp = new Compartment();

// Police et taille : priorité haute pour l'emporter sur le thème de base.
function apparence(police, taille) {
  const regles = { '&': { fontSize: `${taille}px` } };
  if (police) regles['.cm-scroller'] = { fontFamily: police };
  return Prec.high(EditorView.theme(regles));
}
const numeros = (actif) => (actif ? [lineNumbers(), highlightActiveLineGutter()] : []);
const tabulation = (n) => [EditorState.tabSize.of(n), indentUnit.of(' '.repeat(n))];

// Correcteur orthographique : attributs du contenu éditable. Les suggestions et
// le menu contextuel viennent du processus principal (événement context-menu).
function attributsCorrecteur(choix) {
  const actif = choix !== 'aucun';
  return EditorView.contentAttributes.of({ spellcheck: actif ? 'true' : 'false', lang: choix === 'en' ? 'en' : 'fr', autocorrect: 'off', autocapitalize: 'off' });
}

// Sources d'autocomplétion : emoji après « :xx » et liens vers les autres .md
// après « ]( » ou « [[ » (propositions fournies par l'application).
function sourceEmoji(context) {
  const m = context.matchBefore(/(?:^|[\s(])(:[a-z0-9_+\-]{2,})$/i);
  if (!m || !window.mdrEmoji) return null;
  const saisie = m.text.slice(m.text.indexOf(':'));
  const from = m.to - saisie.length;
  // Jamais dans un bloc de code clôturé : un nombre impair de ``` avant la position.
  const avant = context.state.doc.sliceString(0, from);
  if (((avant.match(/^\s*(```|~~~)/gm) || []).length) % 2 === 1) return null;
  const options = window.mdrEmoji.suggerer(saisie).map((e) => ({ label: `:${e.nom}:`, detail: e.emoji, type: 'text', apply: `:${e.nom}:` }));
  return options.length ? { from, options, filter: false } : null;
}

function creerSourceLiens(propositions) {
  return async (context) => {
    if (!propositions) return null;
    const lien = context.matchBefore(/\]\(([^)\s]*)$/);
    const note = lien ? null : context.matchBefore(/\[\[([^\]\n]*)$/);
    const m = lien || note;
    if (!m) return null;
    const saisie = m.text.slice(2);
    const from = m.from + 2;
    const liste = await propositions(lien ? 'lien' : 'note', saisie);
    if (context.aborted || !liste || !liste.length) return null;
    return {
      from,
      filter: false,
      options: liste.slice(0, 100).map((p) => ({
        label: p.label,
        detail: p.detail,
        type: 'text',
        apply: (view, _c, de, a) => {
          const suite = view.state.doc.sliceString(a, Math.min(view.state.doc.length, a + 2));
          let insere = p.apply;
          let curseur = de + p.apply.length;
          if (note) {
            // `[[` : la fermeture `]]` est ajoutée si l'éditeur ne l'a pas déjà posée.
            if (!suite.startsWith(']]')) insere += ']]';
            curseur += 2;
          } else if (suite.startsWith(')')) curseur += 1;
          view.dispatch({ changes: { from: de, to: a, insert: insere }, selection: { anchor: curseur } });
        },
      })),
    };
  };
}

const lightTheme = EditorView.theme({
  '&': { fontSize: '14px', height: '100%', backgroundColor: 'var(--bg-alt)' },
  '.cm-scroller': { fontFamily: '"SF Mono", Menlo, Consolas, monospace', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'var(--bg-alt)', color: 'var(--fg-muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,0.05)' },
}, { dark: false });

export function createEditor(parent, opts = {}) {
  // `raccourcis` : [{ cle: 'Mod-b', executer }] — touches de mise en forme, priorité haute.
  // `onImages(fichiers, { source: 'paste'|'drop', pos })` : fichiers image collés
  // ou déposés dans l'éditeur ; elle les prend en charge (le comportement par
  // défaut est alors supprimé). Le texte collé n'est jamais détourné.
  const { initial = '', onChange, onScroll, onCursor, dark = false, raccourcis = [], onImages, correcteur = 'fr-en', propositionsLiens } = opts;
  const sourceLiens = creerSourceLiens(propositionsLiens);
  const imagesDe = (liste) => [...(liste || [])].filter((f) => /^image\/(png|jpe?g|gif|webp|svg\+xml)$/i.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name || ''));

  const listener = EditorView.updateListener.of(u => {
    if (u.docChanged && onChange) onChange(u.state.doc.toString());
    if ((u.selectionSet || u.docChanged) && onCursor) {
      const sel = u.state.selection.main;
      const line = u.state.doc.lineAt(sel.head);
      onCursor({ line: line.number, col: sel.head - line.from + 1 });
    }
  });

  const scrollHandler = EditorView.domEventHandlers({
    scroll(e, view) { if (onScroll) onScroll(view.scrollDOM); }
  });

  const imagesHandler = EditorView.domEventHandlers({
    paste(e) {
      const cd = e.clipboardData;
      if (!onImages || !cd) return false;
      // Une copie de cellules (tableur) ou de page web porte aussi du texte : on le laisse coller.
      if (cd.getData('text/plain')) return false;
      const fichiers = imagesDe(cd.files);
      if (!fichiers.length) return false;
      e.preventDefault();
      onImages(fichiers, { source: 'paste', pos: null });
      return true;
    },
    drop(e, view) {
      const dt = e.dataTransfer;
      if (!onImages || !dt) return false;
      const fichiers = imagesDe(dt.files);
      if (!fichiers.length) return false;
      e.preventDefault();
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      onImages(fichiers, { source: 'drop', pos: pos === null ? view.state.selection.main.head : pos });
      return true;
    },
  });

  const state = EditorState.create({
    doc: initial,
    extensions: [
      numerosComp.of(numeros(true)),
      foldGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ override: [sourceEmoji, sourceLiens] }),
      correcteurComp.of(attributsCorrecteur(correcteur)),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      search({ top: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      wrapComp.of(EditorView.lineWrapping),
      tabComp.of(tabulation(2)),
      apparenceComp.of(apparence(null, 14)),
      Prec.highest(keymap.of(raccourcis.map((r) => ({ key: r.cle, preventDefault: true, run: () => { r.executer(); return true; } })))),
      keymap.of([
        ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap,
        ...historyKeymap, ...foldKeymap, ...completionKeymap,
        indentWithTab,
      ]),
      listener,
      scrollHandler,
      imagesHandler,
      themeComp.of(dark ? oneDark : lightTheme),
    ],
  });

  const view = new EditorView({ state, parent });
  const optionsCourantes = { police: null, taille: 14 };

  return {
    view,
    sources: { emoji: sourceEmoji, liens: sourceLiens },
    getValue: () => view.state.doc.toString(),
    setValue: (s) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } }),
    setDark: (d) => view.dispatch({ effects: themeComp.reconfigure(d ? oneDark : lightTheme) }),
    // Réglages de l'éditeur, appliqués à chaud : { police, taille, retourLigne,
    // numeros, tabulation }. Les clés absentes ne changent rien.
    setOptions: (o = {}) => {
      Object.assign(optionsCourantes, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
      const effets = [];
      if ('police' in o || 'taille' in o) effets.push(apparenceComp.reconfigure(apparence(optionsCourantes.police, optionsCourantes.taille)));
      if ('retourLigne' in o) effets.push(wrapComp.reconfigure(o.retourLigne ? EditorView.lineWrapping : []));
      if ('numeros' in o) effets.push(numerosComp.reconfigure(numeros(!!o.numeros)));
      if ('tabulation' in o) effets.push(tabComp.reconfigure(tabulation(o.tabulation)));
      if ('correcteur' in o) effets.push(correcteurComp.reconfigure(attributsCorrecteur(o.correcteur)));
      if (effets.length) view.dispatch({ effects: effets });
    },
    // Remplace une plage en une seule transaction annulable d'un coup (historique
    // isolé : elle ne se fond pas dans la frappe qui la précède ou la suit).
    remplacerPlage: (from, to, insert) => view.dispatch({
      changes: { from, to, insert },
      annotations: isolateHistory.of('full'),
      userEvent: 'input.move',
    }),
    annuler: () => undo(view),
    refaire: () => redo(view),
    // Place le curseur au début de la ligne `ligne` (1-based) et la fait défiler dans la vue.
    aLaLigne: (ligne) => {
      const n = Math.min(Math.max(1, ligne), view.state.doc.lines);
      const pos = view.state.doc.line(n).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 8 }) });
    },
    focus: () => view.focus(),
    getScrollDOM: () => view.scrollDOM,
    insertText: (text) => {
      const s = view.state.selection.main;
      view.dispatch({
        changes: { from: s.from, to: s.to, insert: text },
        selection: { anchor: s.from + text.length },
      });
    },
    wrapSelection: (pre, post) => {
      const s = view.state.selection.main;
      const sel = view.state.sliceDoc(s.from, s.to) || 'texte';
      const inserted = pre + sel + post;
      view.dispatch({
        changes: { from: s.from, to: s.to, insert: inserted },
        selection: EditorSelection.range(s.from + pre.length, s.from + pre.length + sel.length),
      });
    },
    prefixLine: (prefix) => {
      const s = view.state.selection.main;
      const line = view.state.doc.lineAt(s.head);
      view.dispatch({
        changes: { from: line.from, insert: prefix },
        selection: { anchor: s.head + prefix.length },
      });
    },
    onDocChange: (cb) => EditorView.updateListener.of(u => { if (u.docChanged) cb(); }),
  };
}

window.createEditor = createEditor;

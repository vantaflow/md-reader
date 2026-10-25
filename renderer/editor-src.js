import { EditorState, Compartment, EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
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

// Police et taille : priorité haute pour l'emporter sur le thème de base.
function apparence(police, taille) {
  const regles = { '&': { fontSize: `${taille}px` } };
  if (police) regles['.cm-scroller'] = { fontFamily: police };
  return Prec.high(EditorView.theme(regles));
}
const numeros = (actif) => (actif ? [lineNumbers(), highlightActiveLineGutter()] : []);
const tabulation = (n) => [EditorState.tabSize.of(n), indentUnit.of(' '.repeat(n))];

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
  const { initial = '', onChange, onScroll, onCursor, dark = false, raccourcis = [] } = opts;

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
      autocompletion(),
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
      themeComp.of(dark ? oneDark : lightTheme),
    ],
  });

  const view = new EditorView({ state, parent });
  const optionsCourantes = { police: null, taille: 14 };

  return {
    view,
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
      if (effets.length) view.dispatch({ effects: effets });
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

// Commandes « Reformater le document » et « Reformater la sélection » : la
// logique est pure (lib/reformat.js) ; ici, un seul changement minimal dans
// l'éditeur pour que l'annulation (Cmd/Ctrl+Z) restitue l'état d'avant.
(() => {
  const lib = window.mdrReformat;

  function remplacer(ancien, nouveau, selection) {
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (!ed) return false;
    if (ancien === nouveau) return true;
    let debut = 0;
    const max = Math.min(ancien.length, nouveau.length);
    while (debut < max && ancien[debut] === nouveau[debut]) debut += 1;
    let finA = ancien.length;
    let finN = nouveau.length;
    while (finA > debut && finN > debut && ancien[finA - 1] === nouveau[finN - 1]) { finA -= 1; finN -= 1; }
    ed.view.dispatch({
      changes: { from: debut, to: finA, insert: nouveau.slice(debut, finN) },
      ...(selection ? { selection } : {}),
    });
    return true;
  }

  function reformaterDocument() {
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (!ed) return false;
    const ancien = ed.view.state.doc.toString();
    const nouveau = lib.reformater(ancien);
    const pos = Math.min(ed.view.state.selection.main.head, nouveau.length);
    remplacer(ancien, nouveau, { anchor: pos });
    ed.view.focus();
    return true;
  }

  function reformaterSelection() {
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (!ed) return false;
    const ancien = ed.view.state.doc.toString();
    const s = ed.view.state.selection.main;
    const r = lib.reformaterSelection(ancien, s.from, s.to);
    remplacer(ancien, r.texte, { anchor: r.from, head: r.to });
    ed.view.focus();
    return true;
  }

  const tab = window.mdrRaccourcis;
  const accel = (id) => tab.afficher(tab.parId(id)?.accel, window.api && window.api.platform) || undefined;
  window.commands.register({ id: 'ecriture:reformater-document', titre: 'Format : Reformater le document', raccourci: accel('ecriture:reformater-document'), executer: reformaterDocument });
  window.commands.register({ id: 'ecriture:reformater-selection', titre: 'Format : Reformater la sélection', raccourci: accel('ecriture:reformater-selection'), executer: reformaterSelection });

  window.mdr = window.mdr || {};
  window.mdr.reformat = { document: reformaterDocument, selection: reformaterSelection };
})();

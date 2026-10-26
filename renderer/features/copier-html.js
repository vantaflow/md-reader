// « Copier en HTML riche » : la sélection (ou le document entier sans sélection)
// est rendue en HTML aux styles en ligne (renderer/lib/html-riche.js) et posée
// dans le presse-papiers avec text/html ET text/plain (le Markdown source), via
// l'IPC `presse-papiers:ecrire-html`. Commande `edition:copier-html-riche`.
(() => {
  // Texte à copier : la sélection de l'éditeur, sinon tout le document sans son
  // front-matter.
  function extrait() {
    const ed = window.mdr.editeur();
    if (!ed) return { texte: '', selection: false };
    const { from, to } = ed.view.state.selection.main;
    if (from !== to) return { texte: ed.view.state.sliceDoc(from, to), selection: true };
    return { texte: window.mdr.rendu.sansFrontMatter(ed.getValue()), selection: false };
  }

  // Construit { html, text } sans toucher au presse-papiers (testable).
  async function construire() {
    const { texte, selection } = extrait();
    if (!texte.trim()) return null;
    const racine = window.mdr.rendu.rendreMarkdown(texte);
    await window.mdr.rendu.imagesEnDataUri(racine);
    return { html: window.mdrHtmlRiche.versHtmlRiche(racine.innerHTML), text: texte, selection };
  }

  async function copier() {
    try {
      const contenu = await construire();
      if (!contenu) { window.mdr.rendu.annoncer('Rien à copier.'); return false; }
      const r = await window.api.ecrirePresseHtml({ html: contenu.html, text: contenu.text });
      if (r && r.erreur) { window.mdr.rendu.annoncer('Copie impossible : ' + r.erreur); return false; }
      window.mdr.rendu.annoncer(contenu.selection ? 'Sélection copiée en HTML riche' : 'Document copié en HTML riche');
      return true;
    } catch (e) {
      window.mdr.rendu.annoncer('Copie impossible : ' + (e && e.message ? e.message : e));
      return false;
    }
  }

  const tab = window.mdrRaccourcis;
  const accel = tab.afficher(tab.parId('edition:copier-html-riche')?.accel, window.api && window.api.platform) || undefined;
  window.commands.register({ id: 'edition:copier-html-riche', titre: 'Copier en HTML riche', raccourci: accel, executer: copier });
  window.mdr.copierHtml = { construire, copier };
})();

// Snippets réutilisables : stockés dans un fichier JSON du dossier de données
// de l'application (IPC bornées snippets:lire / snippets:ecrire). Trois
// commandes de palette : insérer, enregistrer la sélection, supprimer.
(() => {
  const lib = window.mdrSnippets;
  const modale = () => window.mdr.modale;

  function annoncer(message) {
    if (typeof annoncerLot === 'function') annoncerLot(message);
  }

  async function lire() {
    try { return lib.assainir(await window.api.lireSnippets()); }
    catch (e) { annoncer('Snippets illisibles : ' + (e && e.message ? e.message : e)); return []; }
  }

  async function ecrire(liste) {
    try { return lib.assainir(await window.api.ecrireSnippets(liste)); }
    catch (e) { annoncer('Snippets non enregistrés : ' + (e && e.message ? e.message : e)); return null; }
  }

  const vignette = (s) => { const l = s.contenu.replace(/\s+/g, ' ').trim(); return l.length > 60 ? l.slice(0, 60) + '…' : l; };

  async function choisirSnippet(titre, liste) {
    return modale().choisir({
      titre,
      items: liste.map((s) => ({ id: s.nom, libelle: s.nom, detail: vignette(s) })),
      vide: 'Aucun snippet enregistré. Utilisez « Enregistrer la sélection comme snippet… ».',
    });
  }

  async function inserer(nomDirect) {
    const liste = await lire();
    const nom = nomDirect || await choisirSnippet('Insérer un snippet', liste);
    const s = nom && lib.trouver(liste, nom);
    if (!s) return false;
    const ed = window.mdr.editeur();
    if (!ed) return false;
    const texte = lib.texteInsere(s);
    const sel = ed.view.state.selection.main;
    ed.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: texte }, selection: { anchor: sel.from + texte.length }, scrollIntoView: true });
    ed.view.focus();
    return true;
  }

  async function enregistrerSelection(nomDirect) {
    const ed = window.mdr.editeur();
    if (!ed) return false;
    const sel = ed.view.state.selection.main;
    const contenu = ed.view.state.sliceDoc(sel.from, sel.to);
    if (!contenu.trim()) { annoncer('Sélectionnez d’abord le texte à enregistrer comme snippet'); return false; }
    const nom = nomDirect || await modale().demander({ titre: 'Enregistrer comme snippet', libelle: 'Nom du snippet', ok: 'Enregistrer' });
    if (!nom) return false;
    const liste = await lire();
    const ecrase = !!lib.trouver(liste, nom);
    const sauve = await ecrire(lib.ajouter(liste, nom, contenu));
    if (!sauve) return false;
    annoncer(`Snippet « ${nom} » ${ecrase ? 'remplacé' : 'enregistré'}`);
    return true;
  }

  async function supprimer(nomDirect) {
    const liste = await lire();
    const nom = nomDirect || await choisirSnippet('Supprimer un snippet', liste);
    if (!nom || !lib.trouver(liste, nom)) return false;
    const sauve = await ecrire(lib.supprimer(liste, nom));
    if (!sauve) return false;
    annoncer(`Snippet « ${nom} » supprimé`);
    return true;
  }

  window.mdr = window.mdr || {};
  window.mdr.snippets = { lire, inserer, enregistrerSelection, supprimer };
  window.commands.register({ id: 'ecriture:snippet-inserer', titre: 'Insérer un snippet…', executer: () => inserer() });
  window.commands.register({ id: 'ecriture:snippet-enregistrer', titre: 'Enregistrer la sélection comme snippet…', executer: () => enregistrerSelection() });
  window.commands.register({ id: 'ecriture:snippet-supprimer', titre: 'Supprimer un snippet…', executer: () => supprimer() });
})();

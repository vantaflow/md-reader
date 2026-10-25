// Mise en forme dans l'éditeur : branche les fonctions pures de lib/format.js
// sur CodeMirror, les enregistre dans le registre de commandes (palette,
// identifiants `format:*`) et construit la barre d'outils au-dessus de
// l'éditeur. Le menu Format envoie le même identifiant via `menu:commande`.
(() => {
  const lib = window.mdrFormat;
  const tab = window.mdrRaccourcis;
  const plateforme = window.api && window.api.platform;

  // Applique une action sur la sélection courante de l'éditeur : un seul
  // changement minimal (préfixe et suffixe communs conservés) pour que
  // l'annulation et le défilement restent naturels.
  function appliquer(id) {
    const action = lib.ACTIONS.find((a) => a.id === id);
    const ed = window.mdr && window.mdr.editeur && window.mdr.editeur();
    if (!action || !ed) return false;
    const view = ed.view;
    const ancien = view.state.doc.toString();
    const sel = view.state.selection.main;
    const r = action.executer({ texte: ancien, from: sel.from, to: sel.to });
    let debut = 0;
    const max = Math.min(ancien.length, r.texte.length);
    while (debut < max && ancien[debut] === r.texte[debut]) debut += 1;
    let finAncien = ancien.length;
    let finNouveau = r.texte.length;
    while (finAncien > debut && finNouveau > debut && ancien[finAncien - 1] === r.texte[finNouveau - 1]) { finAncien -= 1; finNouveau -= 1; }
    view.dispatch({
      changes: { from: debut, to: finAncien, insert: r.texte.slice(debut, finNouveau) },
      selection: { anchor: r.from, head: r.to },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }

  const afficherAccel = (id) => tab.afficher(tab.parId(id)?.accel, plateforme);

  // Touches CodeMirror (priorité haute, posées par renderer.js à la création
  // de l'éditeur) : elles passent avant les touches par défaut (Mod-i, Mod-Enter…).
  const raccourcisEditeur = lib.ACTIONS
    .filter((a) => tab.parId(a.id))
    .map((a) => ({ cle: tab.toucheEditeur(a.id), executer: () => appliquer(a.id) }));

  for (const a of lib.ACTIONS) {
    const accel = afficherAccel(a.id);
    window.commands.register({ id: a.id, titre: `Format : ${a.libelle}`, raccourci: accel || undefined, executer: () => appliquer(a.id) });
  }

  // Barre d'outils : insérée avant la vue de l'éditeur, dans le volet code
  // (donc masquée avec lui). Masquée par body.sans-barre-outils.
  function construireBarre() {
    const parent = document.getElementById('editor');
    if (!parent || document.getElementById('barre-format')) return;
    const barre = document.createElement('div');
    barre.id = 'barre-format';
    barre.setAttribute('role', 'toolbar');
    barre.setAttribute('aria-label', 'Mise en forme');
    const groupes = [['format:gras', 'format:italique', 'format:barre'], ['format:titre1', 'format:titre2', 'format:titre3'],
      ['format:puces', 'format:numerotee', 'format:taches'], ['format:lien', 'format:image', 'format:tableau'],
      ['format:code', 'format:citation', 'format:saut-page']];
    for (const g of groupes) {
      const groupe = document.createElement('span');
      groupe.className = 'groupe';
      for (const id of g) {
        const a = lib.ACTIONS.find((x) => x.id === id);
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.format = id;
        b.textContent = a.court;
        const accel = afficherAccel(id);
        b.title = accel ? `${a.libelle} (${accel})` : a.libelle;
        b.setAttribute('aria-label', a.libelle);
        if (id === 'format:gras') b.classList.add('b-gras');
        if (id === 'format:italique') b.classList.add('b-italique');
        if (id === 'format:barre') b.classList.add('b-barre');
        // Garde la sélection et le focus de l'éditeur.
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => appliquer(id));
        groupe.appendChild(b);
      }
      barre.appendChild(groupe);
    }
    parent.insertBefore(barre, parent.firstChild);
  }
  construireBarre();

  window.mdr = window.mdr || {};
  window.mdr.format = { appliquer, raccourcisEditeur };
})();

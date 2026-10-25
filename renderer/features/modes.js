// Modes de présentation, distincts du « mode focus » historique (body.focus,
// géré par renderer.js) :
//  - « Aperçu seul plein écran » (body.focus-apercu) : habillage, éditeur et
//    barre masqués, l'aperçu occupe toute la fenêtre, et la fenêtre passe en
//    plein écran natif quand l'API est disponible ;
//  - « Éditeur seul sans distraction » (body.focus-editeur) : éditeur seul,
//    centré, sans en-tête, onglets, panneau, barre de mise en forme ni pied.
// Échap en sort (renderer.js appelle `window.mdr.modes.sortir()` une fois les
// couches internes — palette, modales — refermées). Non mémorisés.
(() => {
  const CLASSES = { apercu: 'focus-apercu', editeur: 'focus-editeur' };
  const corps = document.body;

  const actif = () => (corps.classList.contains(CLASSES.apercu) ? 'apercu'
    : corps.classList.contains(CLASSES.editeur) ? 'editeur'
      : corps.classList.contains('focus') ? 'focus' : null);

  // Plein écran natif de la fenêtre : demandé seulement pour l'aperçu, et
  // jamais bloquant (absent en test, refusé par le système…).
  function pleinEcran(veut) {
    try {
      const p = window.api && window.api.pleinEcran && window.api.pleinEcran(veut);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* sans importance */ }
  }

  function sortir() {
    const avant = actif();
    if (!avant) return false;
    corps.classList.remove(CLASSES.apercu, CLASSES.editeur, 'focus');
    if (avant === 'apercu') pleinEcran(false);
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (ed && avant === 'editeur') ed.focus();
    return true;
  }

  function entrer(nom) {
    if (!CLASSES[nom]) return false;
    const avant = actif();
    if (avant === nom) return true;
    corps.classList.remove(CLASSES.apercu, CLASSES.editeur, 'focus');
    corps.classList.add(CLASSES[nom]);
    if (nom === 'apercu') pleinEcran(true);
    else if (avant === 'apercu') pleinEcran(false);
    if (nom === 'editeur') { const ed = window.mdr.editeur && window.mdr.editeur(); if (ed) ed.focus(); }
    return true;
  }

  const basculer = (nom) => (actif() === nom ? sortir() : entrer(nom));

  const tab = window.mdrRaccourcis;
  const accel = (id) => tab.afficher(tab.parId(id)?.accel, window.api && window.api.platform) || undefined;
  window.commands.register({ id: 'vue:focus-apercu', titre: 'Aperçu seul en plein écran', raccourci: accel('vue:focus-apercu'), executer: () => basculer('apercu') });
  window.commands.register({ id: 'vue:focus-editeur', titre: 'Éditeur seul sans distraction', raccourci: accel('vue:focus-editeur'), executer: () => basculer('editeur') });

  window.mdr = window.mdr || {};
  window.mdr.modes = { entrer, sortir, basculer, actif };
})();

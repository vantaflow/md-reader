// Correcteur orthographique FR/EN : le réglage « Correcteur orthographique »
// (aucun, français, anglais, les deux) est transmis au processus principal
// (setSpellCheckerLanguages) et à l'éditeur (attribut spellcheck du contenu
// CodeMirror). Appliqué à chaud ; le menu contextuel est construit côté
// processus principal (contexte.js).
(() => {
  const reglages = window.mdrSettings;

  function appliquer() {
    const choix = reglages.get('correcteur');
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (ed) ed.setOptions({ correcteur: choix });
    try {
      const p = window.api.langueCorrecteur && window.api.langueCorrecteur(choix);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* sans importance : le correcteur garde ses langues */ }
  }

  reglages.onChange((cle) => { if (cle === 'correcteur') appliquer(); });
  // Au chargement : le réglage mémorisé est transmis au processus principal
  // (l'éditeur le reçoit à sa création).
  try {
    const p = window.api.langueCorrecteur && window.api.langueCorrecteur(reglages.get('correcteur'));
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* sans importance */ }

  window.mdr = window.mdr || {};
  window.mdr.correcteur = { appliquer };
})();

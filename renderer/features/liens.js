// Autocomplétion des liens vers les autres .md : fournit à l'éditeur la liste
// des documents du dossier ouvert (à défaut, du dossier du document) via l'IPC
// bornée `folder:list-md-relatifs`, et les propositions de chemins relatifs
// (`](`) ou de noms de notes (`[[`). Le calcul des chemins est dans lib/liens.js.
(() => {
  const lib = window.mdrLiens;
  const dossierDe = (chemin) => chemin.replace(/[\\/][^\\/]*$/, '');
  let cache = { racine: null, au: 0, fichiers: [] };
  const DUREE_CACHE_MS = 5000;

  // Contexte courant : racine à parcourir, dossier du document, chemin du document.
  function contexte() {
    const actif = window.mdr.onglets.actif();
    const chemin = actif && actif.path ? actif.path : null;
    const dossierDocument = chemin ? dossierDe(chemin) : null;
    const racine = (window.mdr.dossier && window.mdr.dossier()) || dossierDocument;
    return { racine, dossierDocument, chemin };
  }

  async function fichiers(racine) {
    if (!racine) return [];
    if (cache.racine === racine && Date.now() - cache.au < DUREE_CACHE_MS) return cache.fichiers;
    let r;
    try { r = await window.api.listerMdRelatifs(racine); } catch { return []; }
    if (!r || r.erreur || !Array.isArray(r.fichiers)) return [];
    cache = { racine, au: Date.now(), fichiers: r.fichiers };
    return r.fichiers;
  }

  // type : 'lien' (après `](`) ou 'note' (après `[[`) ; saisie : texte déjà tapé.
  async function propositions(type, saisie) {
    const ctx = contexte();
    const liste = await fichiers(ctx.racine);
    if (!liste.length) return [];
    if (type === 'note') return lib.propositionsNotes({ fichiers: liste, saisie });
    return lib.propositionsLiens({ racine: ctx.racine, fichiers: liste, dossierDocument: ctx.dossierDocument, saisie, chemin: ctx.chemin });
  }

  window.mdr = window.mdr || {};
  window.mdr.liens = { propositions, invalider: () => { cache = { racine: null, au: 0, fichiers: [] }; } };
})();

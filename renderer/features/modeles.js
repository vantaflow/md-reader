// « Nouveau depuis un modèle… » : choix dans une liste (compte rendu,
// spécification, README, lettre) puis ouverture d'un onglet non enregistré
// rempli du modèle, daté du jour.
(() => {
  const lib = window.mdrModeles;

  async function nouveauDepuisModele(idDirect) {
    let id = idDirect;
    if (!id) {
      id = await window.mdr.modale.choisir({
        titre: 'Nouveau depuis un modèle',
        items: lib.MODELES.map((m) => ({ id: m.id, libelle: m.nom, detail: m.description })),
        filtre: false,
      });
    }
    const contenu = id && lib.contenu(id);
    if (!contenu) return null;
    const m = lib.parId(id);
    const t = window.mdr.onglets.nouveau({ content: contenu, titre: m.titre });
    // Le contenu du modèle n'est pas enregistré : l'onglet est marqué modifié.
    window.mdr.onglets.marquerModifie();
    return t;
  }

  window.mdr = window.mdr || {};
  window.mdr.modeles = { nouveau: nouveauDepuisModele, liste: () => lib.MODELES.slice() };
  window.commands.register({ id: 'ecriture:modele', titre: 'Nouveau depuis un modèle…', executer: () => nouveauDepuisModele() });
})();

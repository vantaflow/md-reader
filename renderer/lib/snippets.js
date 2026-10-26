// Snippets réutilisables : assainissement de la liste lue ou écrite sur disque,
// ajout, suppression, snippets d'exemple du premier lancement, insertion.
// Fonctions pures. Format UMD : CommonJS pour main.js et node, global
// `window.mdrSnippets` dans le renderer.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrSnippets = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_SNIPPETS = 200;
  const MAX_NOM = 80;
  const MAX_CONTENU = 20000;

  const EXEMPLES = [
    { nom: 'Signature', contenu: 'Cordialement,\n\nPrénom Nom  \nFonction · Société' },
    { nom: 'Date du jour', contenu: '{{date}}' },
    { nom: 'Bloc d’avertissement', contenu: '> [!WARNING]\n> Texte de l’avertissement.\n' },
    { nom: 'Tableau de suivi', contenu: '| Tâche | Responsable | Échéance | État |\n| --- | --- | --- | :-: |\n|  |  |  | ⏳ |\n' },
    { nom: 'Liste de contrôle', contenu: '- [ ] Étape 1\n- [ ] Étape 2\n- [ ] Étape 3\n' },
  ];

  // Liste nettoyée : objets { nom, contenu } valides, sans doublon de nom
  // (casse ignorée, la dernière version l'emporte), bornée.
  function assainir(brut) {
    if (!Array.isArray(brut)) return [];
    const par = new Map();
    for (const s of brut) {
      if (!s || typeof s.nom !== 'string' || typeof s.contenu !== 'string') continue;
      const nom = s.nom.trim().slice(0, MAX_NOM);
      if (!nom || s.contenu.length > MAX_CONTENU) continue;
      par.delete(nom.toLowerCase());
      par.set(nom.toLowerCase(), { nom, contenu: s.contenu });
    }
    return Array.from(par.values()).slice(0, MAX_SNIPPETS);
  }

  const ajouter = (liste, nom, contenu) => assainir([...liste, { nom, contenu }]);
  const supprimer = (liste, nom) => assainir(liste).filter((s) => s.nom.toLowerCase() !== String(nom).toLowerCase());
  const trouver = (liste, nom) => assainir(liste).find((s) => s.nom.toLowerCase() === String(nom).toLowerCase()) || null;

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  // Texte à insérer : `{{date}}` remplacé par la date du jour.
  function texteInsere(snippet, date = new Date()) {
    const j = date.getDate() === 1 ? '1er' : date.getDate();
    return snippet.contenu.replace(/\{\{date\}\}/g, `${j} ${MOIS[date.getMonth()]} ${date.getFullYear()}`);
  }

  return { MAX_SNIPPETS, MAX_NOM, MAX_CONTENU, EXEMPLES, assainir, ajouter, supprimer, trouver, texteInsere };
});

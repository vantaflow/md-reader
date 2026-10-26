// Table unique des raccourcis clavier. Format UMD : lue par main.js / menu.js
// (CommonJS) pour poser les accélérateurs des menus, et par le renderer
// (global `window.mdrRaccourcis`) pour la modale « Raccourcis clavier », le
// libellé des infobulles et les touches de l'éditeur.
//
// `accel` suit la syntaxe des accélérateurs Electron (« CmdOrCtrl+Shift+S »).
// `accelMac` remplace `accel` sous macOS quand il diffère. `menu: false`
// signale un raccourci qui n'a pas d'entrée de menu (éditeur, palette).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrRaccourcis = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const TABLE = [
    // Fichier
    { id: 'fichier:nouveau', groupe: 'Fichier', libelle: 'Nouvel onglet', accel: 'CmdOrCtrl+N' },
    { id: 'fichier:ouvrir', groupe: 'Fichier', libelle: 'Ouvrir…', accel: 'CmdOrCtrl+O' },
    { id: 'fichier:dossier', groupe: 'Fichier', libelle: 'Ouvrir un dossier…', accel: 'CmdOrCtrl+Shift+O' },
    { id: 'fichier:enregistrer', groupe: 'Fichier', libelle: 'Enregistrer', accel: 'CmdOrCtrl+S' },
    { id: 'fichier:enregistrer-sous', groupe: 'Fichier', libelle: 'Enregistrer sous…', accel: 'CmdOrCtrl+Shift+S' },
    { id: 'fichier:fermer', groupe: 'Fichier', libelle: 'Fermer l’onglet', accel: 'CmdOrCtrl+W' },
    { id: 'export:pdf', groupe: 'Fichier', libelle: 'Exporter en PDF…', accel: 'CmdOrCtrl+E' },
    { id: 'export:html', groupe: 'Fichier', libelle: 'Exporter en HTML…', accel: 'CmdOrCtrl+Shift+E' },
    { id: 'export:imprimer', groupe: 'Fichier', libelle: 'Imprimer…', accel: 'CmdOrCtrl+P' },
    { id: 'reglages:ouvrir', groupe: 'Fichier', libelle: 'Réglages…', accel: 'CmdOrCtrl+,' },
    { id: 'edition:copier-html-riche', groupe: 'Fichier', libelle: 'Copier en HTML riche', accel: 'CmdOrCtrl+Alt+Shift+C' },
    // Format
    { id: 'format:gras', groupe: 'Format', libelle: 'Gras', accel: 'CmdOrCtrl+B' },
    { id: 'format:italique', groupe: 'Format', libelle: 'Italique', accel: 'CmdOrCtrl+I' },
    { id: 'format:barre', groupe: 'Format', libelle: 'Barré', accel: 'CmdOrCtrl+Shift+X' },
    { id: 'format:titre1', groupe: 'Format', libelle: 'Titre 1', accel: 'CmdOrCtrl+Alt+1' },
    { id: 'format:titre2', groupe: 'Format', libelle: 'Titre 2', accel: 'CmdOrCtrl+Alt+2' },
    { id: 'format:titre3', groupe: 'Format', libelle: 'Titre 3', accel: 'CmdOrCtrl+Alt+3' },
    { id: 'format:puces', groupe: 'Format', libelle: 'Liste à puces', accel: 'CmdOrCtrl+Shift+8' },
    { id: 'format:numerotee', groupe: 'Format', libelle: 'Liste numérotée', accel: 'CmdOrCtrl+Shift+7' },
    { id: 'format:taches', groupe: 'Format', libelle: 'Liste de tâches', accel: 'CmdOrCtrl+Shift+9' },
    { id: 'format:lien', groupe: 'Format', libelle: 'Lien', accel: 'CmdOrCtrl+K' },
    { id: 'format:image', groupe: 'Format', libelle: 'Image', accel: 'CmdOrCtrl+Shift+I' },
    { id: 'format:tableau', groupe: 'Format', libelle: 'Tableau', accel: 'CmdOrCtrl+Alt+T' },
    { id: 'format:code', groupe: 'Format', libelle: 'Bloc de code', accel: 'CmdOrCtrl+Alt+C' },
    { id: 'format:citation', groupe: 'Format', libelle: 'Citation', accel: 'CmdOrCtrl+Shift+.' },
    { id: 'format:saut-page', groupe: 'Format', libelle: 'Saut de page', accel: 'CmdOrCtrl+Enter' },
    { id: 'ecriture:tableau-editeur', groupe: 'Format', libelle: 'Éditeur de tableau…', accel: 'CmdOrCtrl+Alt+Shift+T' },
    { id: 'ecriture:reformater-document', groupe: 'Format', libelle: 'Reformater le document', accel: 'CmdOrCtrl+Alt+Shift+F' },
    { id: 'ecriture:reformater-selection', groupe: 'Format', libelle: 'Reformater la sélection', accel: 'CmdOrCtrl+Alt+Shift+R' },
    // Affichage
    { id: 'vue:code', groupe: 'Affichage', libelle: 'Afficher/masquer le volet code', accel: 'CmdOrCtrl+/' },
    { id: 'vue:theme', groupe: 'Affichage', libelle: 'Basculer le thème', accel: 'CmdOrCtrl+T' },
    { id: 'vue:zoom-avant', groupe: 'Affichage', libelle: 'Zoom avant', accel: 'CmdOrCtrl+Plus' },
    { id: 'vue:zoom-arriere', groupe: 'Affichage', libelle: 'Zoom arrière', accel: 'CmdOrCtrl+-' },
    { id: 'vue:zoom-zero', groupe: 'Affichage', libelle: 'Taille réelle', accel: 'CmdOrCtrl+0' },
    { id: 'vue:recharger', groupe: 'Affichage', libelle: 'Recharger', accel: 'CmdOrCtrl+R' },
    { id: 'vue:outils-dev', groupe: 'Affichage', libelle: 'Outils de développement', accel: 'F12', accelMac: 'Alt+Command+I' },
    { id: 'vue:plein-ecran', groupe: 'Affichage', libelle: 'Plein écran', accel: 'F11', accelMac: 'Ctrl+Command+F' },
    { id: 'vue:focus-apercu', groupe: 'Affichage', libelle: 'Aperçu seul en plein écran', accel: 'CmdOrCtrl+Shift+F' },
    { id: 'vue:focus-editeur', groupe: 'Affichage', libelle: 'Éditeur seul sans distraction', accel: 'CmdOrCtrl+Shift+D' },
    { id: 'vue:mode-edition', groupe: 'Affichage', libelle: 'Basculer mode code / mode Document', accel: 'CmdOrCtrl+Shift+M' },
    { id: 'vue:lecture', groupe: 'Affichage', libelle: 'Mode présentation lecture', accel: 'CmdOrCtrl+Alt+L' },
    { id: 'vue:diaporama', groupe: 'Affichage', libelle: 'Diaporama', accel: 'F5' },
    // Éditeur et général (sans entrée de menu)
    { id: 'format:souligne', groupe: 'Éditeur', libelle: 'Souligné', accel: 'CmdOrCtrl+U', menu: false },
    { id: 'editeur:rechercher', groupe: 'Éditeur', libelle: 'Rechercher dans le document', accel: 'CmdOrCtrl+F', menu: false },
    { id: 'palette:ouvrir', groupe: 'Général', libelle: 'Palette de commandes', accel: 'CmdOrCtrl+Shift+P', menu: false },
  ];

  const parId = (id) => TABLE.find((r) => r.id === id) || null;

  // Accélérateur Electron d'une entrée pour une plateforme (process.platform).
  function accelerateur(id, plateforme) {
    const r = parId(id);
    if (!r) return undefined;
    return plateforme === 'darwin' && r.accelMac ? r.accelMac : r.accel;
  }

  // Affichage lisible : « CmdOrCtrl+Shift+S » devient « Cmd+Shift+S » (macOS)
  // ou « Ctrl+Shift+S » ailleurs.
  function afficher(accel, plateforme) {
    if (!accel) return '';
    const mod = plateforme === 'darwin' ? 'Cmd' : 'Ctrl';
    return accel.replace(/CmdOrCtrl/g, mod).replace(/\bCommand\b/g, 'Cmd').replace(/Plus$/, '+');
  }

  // Touche CodeMirror (« Mod-Shift-x ») pour une entrée de la table.
  function toucheEditeur(id) {
    const r = parId(id);
    if (!r) return null;
    return r.accel.split('+').map((p, i, a) => {
      if (i === a.length - 1) return p.length === 1 ? p.toLowerCase() : p;
      return p === 'CmdOrCtrl' ? 'Mod' : p;
    }).join('-').replace(/-$/, '-+');
  }

  return { TABLE, parId, accelerateur, afficher, toucheEditeur };
});

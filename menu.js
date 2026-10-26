// Construction du menu natif, isolée de main.js pour être testable : cette
// fonction ne touche ni à Electron ni au disque, elle renvoie un gabarit (un
// tableau d'objets) que main.js passe à Menu.buildFromTemplate.
//
// Toutes les actions qui viennent du renderer passent par `envoyer(canal, ...)`
// vers la fenêtre ; les anciens canaux (menu:new, menu:open…) sont conservés,
// les nouvelles actions passent par le canal générique `menu:commande`
// accompagné de l'identifiant de la commande du registre (palette).
const path = require('path');
const raccourcis = require('./renderer/lib/raccourcis.js');

const MAX_RECENTS = 10;

// Ajoute un chemin en tête de la liste (sans doublon), borné à MAX_RECENTS.
function ajouterRecent(liste, chemin, max = MAX_RECENTS) {
  if (!chemin || typeof chemin !== 'string') return Array.isArray(liste) ? liste.slice(0, max) : [];
  const sans = (Array.isArray(liste) ? liste : []).filter((p) => p !== chemin);
  return [chemin, ...sans].slice(0, max);
}

// Nettoie une liste lue sur disque : chaînes uniquement, sans doublon, bornée.
function assainirRecents(brut, max = MAX_RECENTS) {
  if (!Array.isArray(brut)) return [];
  const vus = new Set();
  const sortie = [];
  for (const p of brut) {
    if (typeof p !== 'string' || !p || vus.has(p)) continue;
    vus.add(p);
    sortie.push(p);
    if (sortie.length >= max) break;
  }
  return sortie;
}

function creerTemplate({ plateforme, nomApp = 'MD Reader', recents = [], envoyer, ouvrirRecent, effacerRecents }) {
  const isMac = plateforme === 'darwin';
  const acc = (id) => raccourcis.accelerateur(id, plateforme);
  const canal = (c) => () => envoyer(c);
  const commande = (id) => () => envoyer('menu:commande', id);
  // Entrée de menu dont libellé et raccourci viennent de la table unique.
  const depuisTable = (id, clic) => ({ label: raccourcis.parId(id).libelle, accelerator: acc(id), click: clic || commande(id) });

  const sousMenuRecents = [
    ...(recents.length
      ? recents.map((p) => ({ label: `${path.basename(p)}  —  ${path.dirname(p)}`, click: () => ouvrirRecent(p) }))
      : [{ label: 'Aucun document récent', enabled: false }]),
    { type: 'separator' },
    { label: 'Effacer la liste', enabled: recents.length > 0, click: () => effacerRecents() },
  ];

  // Entrées Format issues de la table, avec des séparateurs entre familles
  // (marques, titres, listes, insertions).
  const apresFamille = new Set(['format:barre', 'format:titre3', 'format:taches', 'format:citation', 'format:saut-page']);
  const entreesFormat = raccourcis.TABLE.filter((r) => r.groupe === 'Format' && r.menu !== false);
  const formatFinal = [];
  entreesFormat.forEach((r, i) => {
    formatFinal.push({ label: r.libelle, accelerator: acc(r.id), click: commande(r.id) });
    if (apresFamille.has(r.id) && i < entreesFormat.length - 1) formatFinal.push({ type: 'separator' });
  });

  return [
    ...(isMac ? [{
      label: nomApp,
      submenu: [
        { label: `À propos de ${nomApp}`, click: commande('aide:apropos') },
        { type: 'separator' },
        { label: 'Réglages…', accelerator: acc('reglages:ouvrir'), click: canal('menu:settings') },
        { type: 'separator' },
        { label: 'Services', role: 'services' },
        { type: 'separator' },
        { label: `Masquer ${nomApp}`, role: 'hide' },
        { label: 'Masquer les autres', role: 'hideOthers' },
        { label: 'Tout afficher', role: 'unhide' },
        { type: 'separator' },
        { label: `Quitter ${nomApp}`, role: 'quit' },
      ],
    }] : []),
    {
      label: 'Fichier',
      submenu: [
        depuisTable('fichier:nouveau', canal('menu:new')),
        depuisTable('fichier:ouvrir', canal('menu:open')),
        { label: 'Ouvrir récent', submenu: sousMenuRecents },
        depuisTable('fichier:dossier', canal('menu:open-folder')),
        { label: 'Importer…', click: commande('fichier:importer') },
        { type: 'separator' },
        depuisTable('fichier:enregistrer', canal('menu:save')),
        depuisTable('fichier:enregistrer-sous'),
        { label: 'Dupliquer', click: commande('fichier:dupliquer') },
        { label: 'Historique des versions…', click: commande('fichier:historique') },
        depuisTable('fichier:fermer', canal('menu:close-tab')),
        { type: 'separator' },
        depuisTable('export:pdf', canal('menu:export')),
        depuisTable('export:html', canal('menu:export-html')),
        { label: 'Exporter en Word…', click: commande('export:docx') },
        { label: 'Exporter en EPUB…', click: commande('export:epub') },
        { label: 'Exporter les slides en PDF…', click: commande('export:diaporama-pdf') },
        depuisTable('export:imprimer', canal('menu:print')),
        { type: 'separator' },
        { label: 'Définir comme lecteur Markdown par défaut', click: canal('menu:set-default') },
        { type: 'separator' },
        // Sous macOS le raccourci Cmd+, vit dans le menu de l'application.
        ...(isMac ? [] : [{ label: 'Réglages…', accelerator: acc('reglages:ouvrir'), click: canal('menu:settings') }, { type: 'separator' }]),
        isMac ? { label: 'Fermer la fenêtre', role: 'close' } : { label: 'Quitter', role: 'quit' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { label: 'Annuler', role: 'undo' },
        { label: 'Rétablir', role: 'redo' },
        { type: 'separator' },
        { label: 'Couper', role: 'cut' },
        { label: 'Copier', role: 'copy' },
        { label: 'Coller', role: 'paste' },
        ...(isMac ? [{ label: 'Coller et adapter le style', role: 'pasteAndMatchStyle' }] : []),
        { label: 'Supprimer', role: 'delete' },
        { label: 'Tout sélectionner', role: 'selectAll' },
        { type: 'separator' },
        depuisTable('edition:copier-html-riche'),
      ],
    },
    { label: 'Format', submenu: formatFinal },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Continu', click: commande('vue:continu') },
        { label: 'A4 · 1 page', click: commande('vue:a4') },
        { label: 'A4 · 2 pages', click: commande('vue:a4-double') },
        { type: 'separator' },
        {
          label: 'Thème',
          submenu: [
            { label: 'Clair', click: commande('vue:theme-clair') },
            { label: 'Sombre', click: commande('vue:theme-sombre') },
            { label: 'Système', click: commande('vue:theme-systeme') },
            { type: 'separator' },
            { label: 'Basculer clair/sombre', accelerator: acc('vue:theme'), click: canal('menu:toggle-theme') },
          ],
        },
        { type: 'separator' },
        // Zoom de l'interface entière (rôles Electron : facteur de zoom de la page).
        { label: 'Zoom avant', accelerator: acc('vue:zoom-avant'), role: 'zoomIn' },
        { label: 'Zoom arrière', accelerator: acc('vue:zoom-arriere'), role: 'zoomOut' },
        { label: 'Taille réelle', accelerator: acc('vue:zoom-zero'), role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Afficher/masquer le panneau latéral', click: commande('vue:panneau') },
        { label: 'Éditeur seul', click: commande('vue:editeur-seul') },
        { label: 'Aperçu seul', click: commande('vue:apercu-seul') },
        { label: 'Éditeur et aperçu', click: commande('vue:deux') },
        { label: 'Afficher/masquer le volet code', accelerator: acc('vue:code'), click: canal('menu:toggle-editor') },
        { label: 'Barre d’outils de mise en forme', click: commande('vue:barre-outils') },
        { label: 'Mode focus', click: commande('vue:focus') },
        depuisTable('vue:focus-apercu'),
        depuisTable('vue:focus-editeur'),
        depuisTable('vue:diaporama'),
        depuisTable('vue:lecture'),
        { label: 'Statistiques…', click: commande('stats:ouvrir') },
        { type: 'separator' },
        { label: 'Plein écran', accelerator: acc('vue:plein-ecran'), role: 'togglefullscreen' },
        { label: 'Recharger', accelerator: acc('vue:recharger'), role: 'reload' },
        { label: 'Outils de développement', accelerator: acc('vue:outils-dev'), role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { label: 'Réduire', role: 'minimize' },
        ...(isMac ? [{ label: 'Placer en zoom', role: 'zoom' }, { type: 'separator' }, { label: 'Tout ramener au premier plan', role: 'front' }] : []),
      ],
    },
    {
      label: 'Aide',
      role: 'help',
      submenu: [
        { label: 'Aide-mémoire Markdown', click: commande('aide:memo') },
        { label: 'Raccourcis clavier', click: commande('aide:raccourcis') },
        { label: 'Rechercher les mises à jour…', click: commande('aide:maj') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: `À propos de ${nomApp}`, click: commande('aide:apropos') }]),
      ],
    },
  ];
}

module.exports = { creerTemplate, ajouterRecent, assainirRecents, MAX_RECENTS };

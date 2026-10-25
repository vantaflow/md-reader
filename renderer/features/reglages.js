// Fenêtre Réglages : modale intégrée à la fenêtre principale (Cmd/Ctrl+,),
// quatre onglets. Chaque champ écrit dans le magasin `window.mdrSettings` ; ce
// sont les écouteurs de renderer.js qui appliquent les changements à chaud.
// Ce module ne connaît donc ni l'éditeur ni l'aperçu.
(() => {
  const reglages = window.mdrSettings;

  const PLATEFORME_MAC = window.api && window.api.platform === 'darwin';
  const MOD = PLATEFORME_MAC ? 'Cmd' : 'Ctrl';

  // Description des champs : exactement les réglages de la spec.
  const ONGLETS = [
    {
      id: 'editeur', titre: 'Éditeur', champs: [
        { cle: 'policeEditeur', libelle: 'Police', type: 'texte' },
        { cle: 'tailleEditeur', libelle: 'Taille (px)', type: 'nombre', min: 8, max: 40, pas: 1 },
        { cle: 'retourLigne', libelle: 'Retour à la ligne automatique', type: 'case' },
        { cle: 'numerosLigne', libelle: 'Numéros de ligne', type: 'case' },
        { cle: 'tabulation', libelle: 'Taille de tabulation (espaces)', type: 'nombre', min: 1, max: 16, pas: 1 },
        { cle: 'barreOutils', libelle: 'Barre d’outils visible', type: 'case' },
      ],
    },
    {
      id: 'apercu', titre: 'Aperçu', champs: [
        { cle: 'modeDefaut', libelle: 'Mode d’affichage par défaut', type: 'liste', options: [['continu', 'Continu'], ['a4', 'A4 · 1 page'], ['a4-double', 'A4 · 2 pages']] },
        { cle: 'policeApercu', libelle: 'Police de l’aperçu (vide : par défaut)', type: 'texte' },
        { cle: 'tailleApercu', libelle: 'Taille de l’aperçu (px)', type: 'nombre', min: 10, max: 32, pas: 1 },
        { cle: 'margeA4Haut', libelle: 'Marge haute des feuilles A4 (mm)', type: 'nombre', min: 0, max: 60, pas: 1 },
        { cle: 'margeA4Cotes', libelle: 'Marges latérales des feuilles A4 (mm)', type: 'nombre', min: 0, max: 60, pas: 1 },
        { cle: 'margeA4Bas', libelle: 'Marge basse des feuilles A4 (mm)', type: 'nombre', min: 0, max: 60, pas: 1 },
        { cle: 'theme', libelle: 'Thème', type: 'liste', options: [['clair', 'Clair'], ['sombre', 'Sombre'], ['systeme', 'Système']] },
      ],
    },
    {
      id: 'pdf', titre: 'Export PDF', champs: [
        { cle: 'pdfFormat', libelle: 'Format', type: 'liste', options: [['A4', 'A4'], ['Letter', 'Letter'], ['Legal', 'Legal'], ['A3', 'A3'], ['A5', 'A5']] },
        { cle: 'pdfPaysage', libelle: 'Orientation', type: 'liste', booleen: true, options: [['false', 'Portrait'], ['true', 'Paysage']] },
        { cle: 'pdfMarge', libelle: 'Marges (pouces)', type: 'nombre', min: 0, max: 2, pas: 0.1 },
        { cle: 'pdfNumerosPage', libelle: 'Numéros de page', type: 'case' },
        { cle: 'pdfPageGarde', libelle: 'Page de garde (depuis le front-matter)', type: 'case' },
        { cle: 'pdfFiligrane', libelle: 'Filigrane', type: 'texte' },
      ],
    },
    {
      id: 'general', titre: 'Général', champs: [
        { cle: 'autosave', libelle: 'Enregistrement automatique', type: 'case' },
        { cle: 'delaiAutosave', libelle: 'Délai avant enregistrement (secondes)', type: 'nombre', min: 1, max: 60, pas: 1 },
        { cle: 'synchroDefilement', libelle: 'Synchroniser le défilement éditeur et aperçu', type: 'case' },
        { cle: 'rouvrirOnglets', libelle: 'Rouvrir les onglets au démarrage', type: 'case' },
      ],
    },
  ];

  let modal = null;
  const champsParCle = new Map();

  function valeurVersChamp(def, el, valeur) {
    if (def.type === 'case') el.checked = !!valeur;
    else el.value = def.booleen ? String(!!valeur) : String(valeur);
  }

  function construireChamp(def) {
    const etiquette = document.createElement('label');
    if (def.type === 'case') etiquette.className = 'row';
    let el;
    if (def.type === 'liste') {
      el = document.createElement('select');
      for (const [v, l] of def.options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        el.appendChild(o);
      }
    } else {
      el = document.createElement('input');
      el.type = def.type === 'case' ? 'checkbox' : def.type === 'nombre' ? 'number' : 'text';
      if (def.type === 'nombre') { el.min = def.min; el.max = def.max; el.step = def.pas; }
    }
    el.id = 'reglage-' + def.cle;
    if (def.type === 'case') {
      etiquette.appendChild(el);
      etiquette.append(' ' + def.libelle);
    } else {
      etiquette.append(def.libelle);
      etiquette.appendChild(el);
    }

    const ecrire = () => {
      let v;
      if (def.type === 'case') v = el.checked;
      else if (def.type === 'nombre') {
        v = parseFloat(el.value);
        if (!Number.isFinite(v) || v < def.min || v > def.max) return false; // saisie en cours : on attend
      } else if (def.booleen) v = el.value === 'true';
      else v = el.value;
      reglages.set(def.cle, v);
      return true;
    };
    if (def.type === 'case' || def.type === 'liste') el.addEventListener('change', ecrire);
    else {
      el.addEventListener('input', ecrire);
      // En quittant un champ numérique : valeur hors bornes ramenée dans les bornes.
      if (def.type === 'nombre') {
        el.addEventListener('change', () => {
          let v = parseFloat(el.value);
          if (!Number.isFinite(v)) v = reglages.DEFAUTS[def.cle];
          v = Math.min(def.max, Math.max(def.min, v));
          reglages.set(def.cle, v);
          valeurVersChamp(def, el, reglages.get(def.cle));
        });
      }
    }
    champsParCle.set(def.cle, { def, el });
    return etiquette;
  }

  function afficherOnglet(id) {
    modal.querySelectorAll('[data-onglet]').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === id));
    modal.querySelectorAll('.reglages-panneau').forEach((p) => p.classList.toggle('actif', p.dataset.panneau === id));
  }

  function construire() {
    modal = document.createElement('div');
    modal.id = 'reglages-modal';
    modal.className = 'modal hidden';
    const contenu = document.createElement('div');
    contenu.className = 'modal-content reglages';
    contenu.setAttribute('role', 'dialog');
    contenu.setAttribute('aria-label', 'Réglages');
    const titre = document.createElement('h3');
    titre.textContent = 'Réglages';
    contenu.appendChild(titre);

    const barre = document.createElement('div');
    barre.className = 'reglages-onglets';
    barre.setAttribute('role', 'tablist');
    contenu.appendChild(barre);
    for (const onglet of ONGLETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.onglet = onglet.id;
      b.setAttribute('role', 'tab');
      b.textContent = onglet.titre;
      b.addEventListener('click', () => afficherOnglet(onglet.id));
      barre.appendChild(b);
      const panneau = document.createElement('div');
      panneau.className = 'reglages-panneau';
      panneau.dataset.panneau = onglet.id;
      for (const def of onglet.champs) panneau.appendChild(construireChamp(def));
      contenu.appendChild(panneau);
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const fermerBtn = document.createElement('button');
    fermerBtn.type = 'button';
    fermerBtn.id = 'reglages-fermer';
    fermerBtn.className = 'primary';
    fermerBtn.textContent = 'Fermer';
    fermerBtn.addEventListener('click', fermer);
    actions.appendChild(fermerBtn);
    contenu.appendChild(actions);
    modal.appendChild(contenu);
    modal.addEventListener('click', (e) => { if (e.target === modal) fermer(); });
    document.body.appendChild(modal);
    afficherOnglet(ONGLETS[0].id);

    // Un réglage modifié ailleurs (en-tête, menu) met à jour son champ.
    reglages.onChange((cle, valeur) => {
      const c = champsParCle.get(cle);
      if (c && document.activeElement !== c.el) valeurVersChamp(c.def, c.el, valeur);
    });
    rafraichir();
  }

  function rafraichir() {
    for (const { def, el } of champsParCle.values()) valeurVersChamp(def, el, reglages.get(def.cle));
  }

  let focusPrecedent = null;
  function ouvrir(onglet) {
    rafraichir();
    if (typeof onglet === 'string') afficherOnglet(onglet);
    if (modal.classList.contains('hidden')) focusPrecedent = document.activeElement;
    modal.classList.remove('hidden');
    const premier = modal.querySelector('.reglages-panneau.actif input, .reglages-panneau.actif select');
    if (premier) premier.focus();
  }

  function fermer() {
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    const precedent = focusPrecedent;
    focusPrecedent = null;
    if (precedent && document.contains(precedent) && precedent.offsetParent !== null) precedent.focus();
  }

  // Construite dès le chargement : la modale existe toujours dans le DOM, fermée.
  construire();

  const estOuvert = () => !!modal && !modal.classList.contains('hidden');

  window.mdr = window.mdr || {};
  window.mdr.reglagesUI = { ouvrir, fermer, estOuvert };

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ',') {
      e.preventDefault();
      ouvrir();
    }
  });

  if (window.commands) {
    window.commands.register({ id: 'reglages:ouvrir', titre: 'Réglages…', raccourci: `${MOD}+,`, executer: () => ouvrir() });
  }
  // Menu Fichier/application → « Réglages… » (canal IPC menu:settings).
  if (window.api && typeof window.api.onSettings === 'function') window.api.onSettings(() => ouvrir());
})();

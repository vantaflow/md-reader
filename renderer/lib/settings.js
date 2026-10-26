// Magasin des réglages de l'application. Format UMD : CommonJS pour les tests
// node (`node --test`), global `window.mdrSettings` dans le renderer (balise
// <script>, autorisée par la CSP `script-src 'self'`).
//
// Tous les réglages vivent sous une seule clé `localStorage` (`reglages`, un
// objet JSON). Au tout premier chargement, les anciennes clés éparses (theme,
// modeAffichage, pdfOptions, codePaneVisible, sidebarVisible, largeurPanneau)
// sont migrées dans cet objet, puis plus jamais relues.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrSettings = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const CLE = 'reglages';

  const DEFAUTS = {
    // Éditeur
    policeEditeur: '"SF Mono", Menlo, Consolas, monospace',
    tailleEditeur: 14,
    retourLigne: true,
    numerosLigne: true,
    tabulation: 2,
    barreOutils: true,
    // Aperçu (marges des feuilles A4 en millimètres)
    modeDefaut: 'a4',
    policeApercu: '',
    tailleApercu: 16,
    margeA4Haut: 18,
    margeA4Cotes: 20,
    margeA4Bas: 20,
    theme: 'clair',
    // Export PDF par défaut (marge en pouces, comme la modale d'export)
    pdfFormat: 'A4',
    pdfPaysage: false,
    pdfMarge: 0.5,
    pdfNumerosPage: true,
    pdfPageGarde: false,
    pdfFiligrane: '',
    // Général (délai d'autosave en secondes)
    autosave: false,
    delaiAutosave: 2,
    synchroDefilement: true,
    rouvrirOnglets: false,
    correcteur: 'fr-en',
    // État d'interface mémorisé (en-tête, panneau latéral)
    voletCode: false,
    panneauLateral: true,
    largeurPanneau: 240,
    // Onglets ouverts à rouvrir au démarrage (chemins des fichiers)
    ongletsOuverts: [],
    ongletActif: null,
    // Fichiers épinglés dans l'onglet Fichiers (chemins absolus)
    favoris: [],
  };

  // Valeurs permises pour les réglages à choix fermé.
  const CHOIX = {
    modeDefaut: ['continu', 'a4', 'a4-double'],
    theme: ['clair', 'sombre', 'systeme'],
    pdfFormat: ['A4', 'Letter', 'Legal', 'A3', 'A5'],
    correcteur: ['aucun', 'fr', 'en', 'fr-en'],
  };

  function valide(cle, valeur) {
    if (!(cle in DEFAUTS)) return false;
    const defaut = DEFAUTS[cle];
    if (cle === 'ongletActif') return valeur === null || typeof valeur === 'string';
    if (Array.isArray(defaut)) return Array.isArray(valeur) && valeur.every((x) => typeof x === 'string');
    if (typeof valeur !== typeof defaut) return false;
    if (typeof valeur === 'number' && !Number.isFinite(valeur)) return false;
    if (CHOIX[cle] && !CHOIX[cle].includes(valeur)) return false;
    return true;
  }

  // Lit les anciennes clés éparses. Ne retient que ce qui est valide.
  function migrer(stockage) {
    const lu = {};
    const ancienne = (k) => { try { return stockage.getItem(k); } catch { return null; } };
    const poser = (cle, valeur) => { if (valide(cle, valeur)) lu[cle] = valeur; };

    const theme = ancienne('theme');
    if (theme === 'dark') poser('theme', 'sombre');
    else if (theme === 'light') poser('theme', 'clair');
    const mode = ancienne('modeAffichage');
    if (mode) poser('modeDefaut', mode);
    const code = ancienne('codePaneVisible');
    if (code !== null) poser('voletCode', code === 'true');
    const panneau = ancienne('sidebarVisible');
    if (panneau !== null) poser('panneauLateral', panneau !== 'false');
    const largeur = parseInt(ancienne('largeurPanneau'), 10);
    if (largeur > 0) poser('largeurPanneau', largeur);

    let pdf = null;
    try { pdf = JSON.parse(ancienne('pdfOptions') || 'null'); } catch { pdf = null; }
    if (pdf && typeof pdf === 'object') {
      if ('pdf-page-size' in pdf) poser('pdfFormat', pdf['pdf-page-size']);
      if ('pdf-landscape' in pdf) poser('pdfPaysage', String(pdf['pdf-landscape']) === 'true');
      if ('pdf-margin' in pdf) {
        const m = parseFloat(pdf['pdf-margin']);
        if (Number.isFinite(m)) poser('pdfMarge', m);
      }
      if ('pdf-header-footer' in pdf) poser('pdfNumerosPage', !!pdf['pdf-header-footer']);
      if ('pdf-cover' in pdf) poser('pdfPageGarde', !!pdf['pdf-cover']);
      if (typeof pdf['pdf-watermark'] === 'string') poser('pdfFiligrane', pdf['pdf-watermark']);
    }
    return lu;
  }

  // Un stockage en mémoire, pour node et pour un localStorage indisponible.
  function stockageMemoire() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
    };
  }

  function creer(stockage) {
    const depot = stockage || stockageMemoire();
    const ecouteurs = new Set();
    let valeurs = {};

    function ecrire() {
      try { depot.setItem(CLE, JSON.stringify(valeurs)); } catch { /* quota ou accès refusé */ }
    }

    function charger() {
      let brut = null;
      try { brut = depot.getItem(CLE); } catch { brut = null; }
      let objet = null;
      if (brut !== null) {
        try { objet = JSON.parse(brut); } catch { objet = null; }
        if (!objet || typeof objet !== 'object' || Array.isArray(objet)) objet = {};
        valeurs = {};
        for (const [k, v] of Object.entries(objet)) if (valide(k, v)) valeurs[k] = v;
      } else {
        valeurs = migrer(depot);
        ecrire();
      }
    }
    charger();

    return {
      get(cle) {
        if (!(cle in DEFAUTS)) return undefined;
        const v = cle in valeurs ? valeurs[cle] : DEFAUTS[cle];
        return Array.isArray(v) ? v.slice() : v;
      },
      set(cle, valeur) {
        if (!valide(cle, valeur)) throw new TypeError(`Réglage invalide : ${cle} = ${JSON.stringify(valeur)}`);
        const avant = this.get(cle);
        if (JSON.stringify(avant) === JSON.stringify(valeur)) return;
        valeurs[cle] = Array.isArray(valeur) ? valeur.slice() : valeur;
        ecrire();
        for (const f of Array.from(ecouteurs)) {
          try { f(cle, this.get(cle), avant); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
        }
      },
      onChange(f) {
        ecouteurs.add(f);
        return () => ecouteurs.delete(f);
      },
      tout() {
        const sortie = {};
        for (const k of Object.keys(DEFAUTS)) sortie[k] = this.get(k);
        return sortie;
      },
      reinitialiser() {
        const anciennes = this.tout();
        valeurs = {};
        ecrire();
        for (const k of Object.keys(DEFAUTS)) {
          if (JSON.stringify(anciennes[k]) !== JSON.stringify(DEFAUTS[k])) {
            for (const f of Array.from(ecouteurs)) f(k, this.get(k), anciennes[k]);
          }
        }
      },
    };
  }

  let stockageNavigateur;
  try { stockageNavigateur = typeof localStorage !== 'undefined' ? localStorage : null; } catch { stockageNavigateur = null; }
  const api = creer(stockageNavigateur);
  api.creer = creer;
  api.DEFAUTS = DEFAUTS;
  api.CHOIX = CHOIX;
  api.CLE = CLE;
  return api;
});

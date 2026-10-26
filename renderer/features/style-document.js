// Styles du document : police, taille et couleurs (titres, texte) lues dans le
// front-matter (`police`, `taille`, `couleur-titres`, `couleur-texte`) et
// appliquées à l'aperçu, au mode Document et aux exports PDF / HTML / Word.
// Le dialogue « Styles du document… » écrit ces clés dans le front-matter.
// Distinct de la mise en forme d'une sélection (balises HTML en ligne, mode
// Document) : ici c'est le document entier.
(() => {
  const SD = window.mdrStyleDoc;
  const FM = /^---\n([\s\S]*?)\n---\n?/;

  // Métadonnées du front-matter du document actif (même lecture que l'aperçu).
  function metaActive() {
    const ed = window.mdr.editeur && window.mdr.editeur();
    const source = ed ? ed.getValue() : '';
    return typeof stripFrontMatter === 'function' ? stripFrontMatter(source).meta : {};
  }

  const styleActif = () => SD.extraire(metaActive());

  let feuille = null;
  // Feuille de style vivante : aperçu et page du mode Document.
  function appliquer() {
    if (!feuille) {
      feuille = document.createElement('style');
      feuille.id = 'mdr-style-document';
      document.head.appendChild(feuille);
    }
    const css = SD.css(styleActif());
    if (feuille.textContent !== css) {
      feuille.textContent = css;
      if (typeof planifierPagination === 'function') planifierPagination();
    }
    return css;
  }

  // CSS ajouté aux exports PDF / HTML (après le thème d'export).
  const cssExport = () => SD.css(styleActif());

  const POLICES = [
    ['', 'Par défaut'], ['Arial, sans-serif', 'Arial'], ['Calibri, sans-serif', 'Calibri'], ['Cambria, serif', 'Cambria'],
    ['Courier New, monospace', 'Courier New'], ['Garamond, serif', 'Garamond'], ['Georgia, serif', 'Georgia'], ['Helvetica, sans-serif', 'Helvetica'],
    ['Segoe UI, sans-serif', 'Segoe UI'], ['Times New Roman, serif', 'Times New Roman'], ['Trebuchet MS, sans-serif', 'Trebuchet MS'], ['Verdana, sans-serif', 'Verdana'],
  ];

  // Écrit les clés dans le front-matter : par CodeMirror en mode code, par la
  // page en mode Document (qui réécrit ensuite le Markdown).
  function ecrire(patch) {
    const doc = window.mdr.document;
    const ed = window.mdr.editeur();
    if (doc && doc.actif() && doc.controleur()) {
      const c = doc.controleur();
      const nouveau = SD.ecrire(c.frontMatter() + '\n', patch);
      const m = FM.exec(nouveau.replace(/\r\n/g, '\n'));
      c.definirFrontMatter(m ? (m[0].endsWith('\n') ? m[0] : m[0] + '\n') : '');
      doc.synchroniser();
    } else if (ed) {
      const avant = ed.getValue();
      const apres = SD.ecrire(avant, patch);
      if (apres !== avant) ed.view.dispatch({ changes: { from: 0, to: avant.length, insert: apres } });
    }
    appliquer();
  }

  async function dialogue() {
    const actuel = styleActif();
    const police = POLICES.find(([v]) => v === (actuel.police || '')) ? (actuel.police || '') : '';
    const r = await window.mdr.formulaire({
      titre: 'Styles du document',
      id: 'modale-style-document',
      ok: 'Appliquer',
      champs: [
        { id: 'police', libelle: 'Police', type: 'liste', options: POLICES, valeur: police },
        { id: 'taille', libelle: 'Taille du texte (points, 6 à 96 ; vide : par défaut)', type: 'nombre', min: 6, max: 96, pas: 0.5, valeur: actuel.taille || '' },
        { id: 'titres', libelle: 'Couleur des titres', type: 'couleur', valeur: /^#[0-9a-f]{6}$/i.test(actuel.couleurTitres || '') ? actuel.couleurTitres : '#000000' },
        { id: 'texte', libelle: 'Couleur du texte', type: 'couleur', valeur: /^#[0-9a-f]{6}$/i.test(actuel.couleurTexte || '') ? actuel.couleurTexte : '#000000' },
        { id: 'garderTitres', libelle: 'Appliquer une couleur aux titres', type: 'case', valeur: !!actuel.couleurTitres },
        { id: 'garderTexte', libelle: 'Appliquer une couleur au texte', type: 'case', valeur: !!actuel.couleurTexte },
      ],
      extra: [{ libelle: 'Réinitialiser', id: 'reinitialiser', valeur: 'reinitialiser' }],
    });
    if (!r) return null;
    if (r._bouton === 'reinitialiser') { ecrire({ police: null, taille: null, couleurTitres: null, couleurTexte: null }); return {}; }
    const taille = SD.normaliserTaille(r.taille);
    ecrire({
      police: r.police || null,
      taille: taille || null,
      couleurTitres: r.garderTitres ? r.titres : null,
      couleurTexte: r.garderTexte ? r.texte : null,
    });
    return styleActif();
  }

  window.commands.register({ id: 'style:document', titre: 'Format : styles du document (police, taille, couleurs)…', executer: dialogue });

  window.mdr = window.mdr || {};
  window.mdr.styleDoc = { appliquer, cssExport, dialogue, ecrire, styleActif, pourWord: () => SD.pourWord(styleActif()) };
})();

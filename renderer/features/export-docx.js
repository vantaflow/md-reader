// Export Word (.docx) : construit un rendu HTML détaché du document actif (pas
// l'aperçu paginé), le convertit avec renderer/docx-src.js (window.mdrDocx) et
// l'enregistre via l'IPC `file:export-docx` (dialogue d'enregistrement côté
// processus principal). Commande de palette `export:docx`, menu Fichier.
(() => {
  // URL file:// d'un chemin local (séparateurs Windows compris).
  function urlFichier(chemin) {
    const c = chemin.replace(/\\/g, '/');
    return new URL(/^[A-Za-z]:/.test(c) ? 'file:///' + c : 'file://' + c).href;
  }

  function dossierDe(chemin) { return chemin.replace(/[\\/][^\\/]*$/, ''); }

  function nomDocument() {
    const t = window.mdr.onglets.actif();
    return t && t.path ? t.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : 'document';
  }

  // Rendu détaché : même analyseur que l'aperçu, images relatives résolues
  // depuis le dossier du document, schémas Mermaid repris de l'aperçu.
  function rendreDetache() {
    const ed = window.mdr.editeur();
    const source = ed ? ed.getValue() : '';
    const corps = typeof stripFrontMatter === 'function' ? stripFrontMatter(source).body : source;
    const racine = document.createElement('div');
    racine.innerHTML = window.md.parse(corps);
    window.md.enhance(racine);
    const t = window.mdr.onglets.actif();
    if (t && t.path) {
      const base = urlFichier(dossierDe(t.path) + '/');
      racine.querySelectorAll('img[src]').forEach((img) => {
        const brut = img.getAttribute('src');
        if (/^[a-z][a-z0-9+.-]*:/i.test(brut) || brut.startsWith('//')) return;
        try { img.setAttribute('src', new URL(brut, base).href); } catch { /* laissé tel quel */ }
      });
    }
    const vivants = [...window.mdr.apercu().querySelectorAll('.mermaid svg')];
    racine.querySelectorAll('pre code.language-mermaid').forEach((code, i) => {
      const svg = vivants[i];
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const clone = svg.cloneNode(true);
      clone.dataset.w = String(r.width);
      clone.dataset.h = String(r.height);
      code.closest('pre').replaceWith(clone);
    });
    return racine;
  }

  async function lireOctets(url) {
    if (!/^file:/i.test(url)) return null;
    const r = await window.api.lireImage(url);
    return r && r.octets ? r : null;
  }

  async function construire() {
    const r = window.mdr.reglages;
    const champEnTete = document.getElementById('pdf-header-text');
    // Styles du document (front-matter) et mise en page : mêmes réglages que le PDF.
    const page = {
      format: r.get('pdfFormat'), paysage: r.get('pdfPaysage'),
      margeHautMm: r.get('margeA4Haut'), margeBasMm: r.get('margeA4Bas'), margeCotesMm: r.get('margeA4Cotes'),
      enTete: champEnTete ? champEnTete.value : '', pied: r.get('pdfPied'), numeros: r.get('pdfNumerosPage'),
    };
    const style = window.mdr.styleDoc ? window.mdr.styleDoc.pourWord() : null;
    return window.mdrDocx.creerDocx(rendreDetache(), { lireOctets, titre: nomDocument(), style, page });
  }

  function annoncer(message) {
    if (typeof annoncerLot === 'function') annoncerLot(message);
  }

  async function exporter() {
    try {
      const octets = await construire();
      const sortie = await window.api.exportDocx({ octets, defaultName: nomDocument() });
      if (sortie) annoncer('Word : ' + sortie.split(/[\\/]/).pop());
      return sortie;
    } catch (e) {
      annoncer('Export Word impossible : ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  window.commands.register({ id: 'export:docx', titre: 'Exporter en Word (.docx)', executer: exporter });
  window.mdr = window.mdr || {};
  window.mdr.exportDocx = { construire, exporter };
})();

// Rendu détaché partagé par les fonctions d'export et de partage de la 1.9.0
// (copie en HTML riche, EPUB, diaporama) : le Markdown d'un extrait est rendu
// avec le même analyseur que l'aperçu, hors de l'aperçu paginé, avec les images
// relatives résolues depuis le dossier du document.
(() => {
  function urlFichier(chemin) {
    const c = chemin.replace(/\\/g, '/');
    return new URL(/^[A-Za-z]:/.test(c) ? 'file:///' + c : 'file://' + c).href;
  }
  const dossierDe = (chemin) => chemin.replace(/[\\/][^\\/]*$/, '');

  function nomDocument() {
    const t = window.mdr.onglets.actif();
    return t && t.path ? t.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : 'document';
  }

  // Texte source du document actif (front-matter compris).
  function sourceActive() {
    const ed = window.mdr.editeur();
    return ed ? ed.getValue() : '';
  }

  function sansFrontMatter(source) {
    return typeof stripFrontMatter === 'function' ? stripFrontMatter(source).body : source;
  }

  function rendreMarkdown(markdown) {
    const racine = document.createElement('div');
    racine.innerHTML = window.md.parse(markdown);
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
    return racine;
  }

  function enBase64(octets) {
    const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // Les images locales (file://) deviennent des data URI : le contenu part avec
  // son image. Une image illisible est laissée telle quelle.
  async function imagesEnDataUri(racine) {
    for (const img of racine.querySelectorAll('img[src^="file:"]')) {
      try {
        const r = await window.api.lireImage(img.getAttribute('src'));
        if (r && r.octets && r.mime) img.setAttribute('src', `data:${r.mime};base64,${enBase64(r.octets)}`);
      } catch { /* image laissée telle quelle */ }
    }
    return racine;
  }

  function annoncer(message) {
    if (typeof annoncerLot === 'function') annoncerLot(message);
  }

  window.mdr = window.mdr || {};
  window.mdr.rendu = { urlFichier, dossierDe, nomDocument, sourceActive, sansFrontMatter, rendreMarkdown, imagesEnDataUri, enBase64, annoncer };
})();

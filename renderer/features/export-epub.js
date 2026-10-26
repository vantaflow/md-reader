// Export EPUB 3 : rend le document actif (même analyseur que l'aperçu, images
// locales et diagrammes Mermaid inclus), le confie à renderer/lib/epub.js
// (window.mdrEpub, JSZip fourni par jszip-bundle.js) et l'enregistre par l'IPC
// `file:export-epub` (dialogue .epub côté processus principal).
(() => {
  const r = () => window.mdr.rendu;

  // Un diagramme Mermaid (SVG vivant de l'aperçu) devient une image SVG en data URI,
  // que l'EPUB range ensuite dans OEBPS/images.
  function diagrammesEnImages(racine) {
    const vivants = [...window.mdr.apercu().querySelectorAll('.mermaid svg')];
    racine.querySelectorAll('pre code.language-mermaid').forEach((code, i) => {
      const svg = vivants[i];
      if (!svg) return;
      const clone = svg.cloneNode(true);
      const box = svg.getBoundingClientRect();
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (box.width) { clone.setAttribute('width', String(Math.round(box.width))); clone.setAttribute('height', String(Math.round(box.height))); }
      const img = document.createElement('img');
      img.alt = 'Diagramme';
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
      code.closest('pre').replaceWith(img);
    });
  }

  async function construire() {
    const source = r().sourceActive();
    const { meta, body } = typeof stripFrontMatter === 'function' ? stripFrontMatter(source) : { meta: {}, body: source };
    const racine = r().rendreMarkdown(body);
    diagrammesEnImages(racine);
    await r().imagesEnDataUri(racine);
    return window.mdrEpub.construireEpub({
      html: racine.innerHTML,
      titre: meta.title || r().nomDocument(),
      auteur: meta.author,
      langue: meta.lang || meta.language || meta.langue,
    });
  }

  async function exporter() {
    try {
      const octets = await construire();
      const sortie = await window.api.exportEpub({ octets, defaultName: r().nomDocument() });
      if (sortie) r().annoncer('EPUB : ' + sortie.split(/[\\/]/).pop());
      return sortie;
    } catch (e) {
      r().annoncer('Export EPUB impossible : ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  window.commands.register({ id: 'export:epub', titre: 'Exporter en EPUB', executer: exporter });
  window.mdr.exportEpub = { construire, exporter };
})();

// Import d'un .docx ou d'un .html vers Markdown : l'IPC `file:import` (dialogue
// d'ouverture, lecture bornée à 50 Mo) renvoie les octets ; mammoth (docx vers
// HTML) puis turndown (HTML vers Markdown, renderer/lib/import.js) font le reste.
// Le résultat s'ouvre dans un nouvel onglet NON enregistré. Images d'un .docx :
// en data URI dans le Markdown (voir l'en-tête de lib/import.js).
(() => {
  const libs = window.mdrImportLibs;
  const conv = window.mdrImport.creer({ TurndownService: libs.TurndownService, gfm: libs.gfm });

  // Styles Word courants pour le code, que mammoth ne reconnaît pas par défaut.
  const STYLES = [
    "p[style-name='Code'] => pre:fresh",
    "p[style-name='Source Code'] => pre:fresh",
    "p[style-name='Code Block'] => pre:fresh",
    "p[style-name='Preformatted Text'] => pre:fresh",
    "p[style-name='HTML Preformatted'] => pre:fresh",
    "r[style-name='Code Char'] => code",
    "r[style-name='Source Code Char'] => code",
    "r[style-name='Verbatim Char'] => code",
    "p[style-name='Title'] => h1:fresh",
    "p[style-name='Subtitle'] => h2:fresh",
    "p[style-name='Quote'] => blockquote > p:fresh",
    "p[style-name='Citation'] => blockquote > p:fresh",
  ];

  async function docxVersHtml(octets) {
    const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    const arrayBuffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const r = await libs.mammoth.convertToHtml({ arrayBuffer }, { styleMap: STYLES });
    return r.value;
  }

  // Octets → Markdown. `type` : 'docx' ou 'html'. Lève une Error lisible si le
  // fichier est invalide (archive docx illisible, par exemple).
  async function versMarkdown(type, octets) {
    let html;
    if (type === 'docx') html = await docxVersHtml(octets);
    else if (type === 'html') html = window.mdrImport.decoderOctets(octets);
    else throw new Error('Type de fichier non pris en charge.');
    return conv.htmlVersMarkdown(html);
  }

  function annoncer(message) { if (typeof annoncerLot === 'function') annoncerLot(message); }

  async function importer() {
    try {
      const f = await window.api.importer();
      if (!f) return null;
      if (f.erreur) { annoncer('Import impossible : ' + f.erreur); return null; }
      const md = await versMarkdown(f.type, f.octets);
      if (!md.trim()) { annoncer('Import : le document ne contient aucun texte.'); return null; }
      const t = window.mdr.onglets.nouveau({ content: md, titre: f.nom.replace(/\.[^.]+$/, '') });
      window.mdr.onglets.marquerModifie();
      annoncer('Importé : ' + f.nom);
      return t;
    } catch (e) {
      annoncer('Import impossible : ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  window.commands.register({ id: 'fichier:importer', titre: 'Importer un document Word ou HTML…', executer: importer });
  window.mdr.importer = { importer, versMarkdown };
})();

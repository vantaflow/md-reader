// Écriture du presse-papiers demandée par le renderer (« Copier en HTML riche »).
// Isolé de main.js pour être testable sans Electron : la validation est ici,
// main.js n'appelle `clipboard.write` qu'avec ce qu'elle renvoie.
const MAX_HTML = 25 * 1024 * 1024; // images en data URI comprises
const MAX_TEXTE = 8 * 1024 * 1024;

function assainirContenu(charge) {
  if (!charge || typeof charge !== 'object') throw new Error('Contenu invalide.');
  const { html, text } = charge;
  if (typeof html !== 'string' || typeof text !== 'string') throw new Error('Le HTML et le texte doivent être des chaînes.');
  if (!html.trim() && !text.trim()) throw new Error('Rien à copier.');
  if (html.length > MAX_HTML || text.length > MAX_TEXTE) throw new Error('Contenu trop volumineux pour le presse-papiers.');
  return { html, text };
}

// `clipboard` est injecté (celui d'Electron en production, un faux en test).
function ecrireHtml(clipboard, charge) {
  const contenu = assainirContenu(charge);
  clipboard.write({ html: contenu.html, text: contenu.text });
  return true;
}

module.exports = { assainirContenu, ecrireHtml, MAX_HTML, MAX_TEXTE };

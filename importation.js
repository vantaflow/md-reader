// Lecture d'un fichier à importer (.docx, .html, .htm) demandée par le renderer.
// Isolé de main.js pour être testable sans Electron : extension vérifiée, taille
// bornée AVANT et APRÈS la lecture (un fichier peut grossir entre-temps), jamais
// d'exception non gérée — toute erreur devient { erreur }.
const fs = require('fs/promises');
const path = require('path');

const MAX_OCTETS = 50 * 1024 * 1024; // 50 Mo
const TYPES = { '.docx': 'docx', '.html': 'html', '.htm': 'html' };

async function lireFichierImport(chemin, max = MAX_OCTETS) {
  try {
    if (typeof chemin !== 'string' || !chemin) return { erreur: 'Chemin invalide.' };
    const type = TYPES[path.extname(chemin).toLowerCase()];
    if (!type) return { erreur: 'Type de fichier non pris en charge (attendu : .docx, .html ou .htm).' };
    const st = await fs.stat(chemin);
    if (!st.isFile()) return { erreur: 'Ce n’est pas un fichier.' };
    if (st.size > max) return { erreur: `Fichier trop volumineux (${Math.ceil(st.size / 1048576)} Mo ; limite ${Math.floor(max / 1048576)} Mo).` };
    const octets = await fs.readFile(chemin);
    if (octets.length > max) return { erreur: 'Fichier trop volumineux.' };
    return { nom: path.basename(chemin), type, octets: new Uint8Array(octets.buffer, octets.byteOffset, octets.length) };
  } catch (e) {
    return { erreur: 'Lecture impossible : ' + (e && e.message ? e.message : e) };
  }
}

module.exports = { lireFichierImport, MAX_OCTETS, TYPES };

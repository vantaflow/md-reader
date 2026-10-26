// Historique des versions d'un document, côté processus principal, isolé de
// main.js pour être testable sans Electron. Un instantané du contenu est écrit
// à chaque enregistrement dans <données>/historique/<hash du chemin>/
// <horodatage>.md. Le plafond purge les plus anciens ; un contenu identique au
// dernier instantané n'est pas dupliqué.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PLAFOND = 50;
const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo par instantané
const EXT_MD = /\.(md|markdown|mdown|mkd|txt)$/i;
const ID = /^\d{8}T\d{9}Z(-\d+)?$/;

function verifierChemin(chemin) {
  if (typeof chemin !== 'string' || !path.isAbsolute(chemin) || !EXT_MD.test(chemin)) {
    throw new Error('Chemin de document invalide');
  }
}

function dossierDe(dossierDonnees, chemin) {
  const hash = crypto.createHash('sha256').update(String(chemin)).digest('hex').slice(0, 24);
  return path.join(dossierDonnees, 'historique', hash);
}

// 2026-10-26T10:00:00.004Z -> 20261026T100000004Z (triable, valide en nom de fichier).
function horodatage(date) {
  return date.toISOString().replace(/[-:]/g, '').replace('.', '');
}

function dateDepuisId(id) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z` : null;
}

async function identifiants(dossier) {
  let noms;
  try { noms = await fs.readdir(dossier); } catch (e) { if (e && e.code === 'ENOENT') return []; throw e; }
  return noms.filter((n) => n.endsWith('.md') && ID.test(n.slice(0, -3))).map((n) => n.slice(0, -3)).sort().reverse();
}

async function lister(dossierDonnees, chemin) {
  verifierChemin(chemin);
  const dossier = dossierDe(dossierDonnees, chemin);
  const sortie = [];
  for (const id of await identifiants(dossier)) {
    try {
      const st = await fs.stat(path.join(dossier, id + '.md'));
      sortie.push({ id, date: dateDepuisId(id), taille: st.size });
    } catch { /* fichier disparu entre-temps */ }
  }
  return sortie;
}

async function lire(dossierDonnees, chemin, id) {
  verifierChemin(chemin);
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('Identifiant de version invalide');
  return fs.readFile(path.join(dossierDe(dossierDonnees, chemin), id + '.md'), 'utf8');
}

async function ajouter(dossierDonnees, chemin, contenu, { max = PLAFOND, maintenant = () => new Date() } = {}) {
  verifierChemin(chemin);
  if (typeof contenu !== 'string') throw new Error('Contenu invalide');
  if (Buffer.byteLength(contenu, 'utf8') > TAILLE_MAX) throw new Error('Document trop volumineux pour l\'historique');
  const dossier = dossierDe(dossierDonnees, chemin);
  const existants = await identifiants(dossier);
  if (existants.length) {
    try {
      if (await fs.readFile(path.join(dossier, existants[0] + '.md'), 'utf8') === contenu) return { ajoute: false, id: existants[0] };
    } catch { /* dernier instantané illisible : on en écrit un nouveau */ }
  }
  await fs.mkdir(dossier, { recursive: true });
  let id = horodatage(maintenant());
  // Deux instantanés dans la même milliseconde : suffixe croissant, toujours plus récent.
  if (existants.length && id <= existants[0]) id = existants[0] + '-1';
  for (let n = 2; existants.includes(id); n++) id = id.replace(/-\d+$/, '') + '-' + n;
  await fs.writeFile(path.join(dossier, id + '.md'), contenu, 'utf8');
  const tous = [id, ...existants].sort().reverse();
  for (const vieux of tous.slice(Math.max(1, max))) {
    await fs.unlink(path.join(dossier, vieux + '.md')).catch(() => {});
  }
  return { ajoute: true, id };
}

module.exports = { ajouter, lister, lire, dossierDe, PLAFOND, TAILLE_MAX };

// Accès disque du lot « écriture » côté processus principal, isolé de main.js
// pour être testable sans Electron : snippets (fichier JSON du dossier de
// données) et liste des documents .md d'un dossier (propositions de liens).
const fs = require('fs/promises');
const path = require('path');
const snippets = require('./renderer/lib/snippets.js');

const FICHIER_SNIPPETS = 'snippets.json';
const EXT_MD = /\.(md|markdown|mdown|mkd)$/i;
const PROFONDEUR_MAX = 4;
const FICHIERS_MAX = 500;
const IGNORES = new Set(['node_modules', 'dist']);

// Premier lancement (fichier absent) : snippets d'exemple, écrits aussitôt.
// Fichier illisible ou corrompu : liste vide, sans l'écraser.
async function lireSnippets(dossierDonnees) {
  const chemin = path.join(dossierDonnees, FICHIER_SNIPPETS);
  let brut;
  try { brut = await fs.readFile(chemin, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') {
      const exemples = snippets.assainir(snippets.EXEMPLES);
      await fs.mkdir(dossierDonnees, { recursive: true });
      await fs.writeFile(chemin, JSON.stringify(exemples, null, 2), 'utf8');
      return exemples;
    }
    return [];
  }
  try { return snippets.assainir(JSON.parse(brut)); } catch { return []; }
}

// Écrit la liste assainie (bornée) et la renvoie.
async function ecrireSnippets(dossierDonnees, liste) {
  const propre = snippets.assainir(liste);
  await fs.mkdir(dossierDonnees, { recursive: true });
  await fs.writeFile(path.join(dossierDonnees, FICHIER_SNIPPETS), JSON.stringify(propre, null, 2), 'utf8');
  return propre;
}

// Documents .md sous `dossier` (chemin absolu d'un dossier existant), en chemins
// relatifs avec `/`, triés. Bornes : profondeur 4, 500 fichiers, ni dossiers
// cachés, ni node_modules, ni dist ; aucun contenu n'est lu.
async function listerMdRelatifs(dossier) {
  if (typeof dossier !== 'string' || !path.isAbsolute(dossier)) throw new Error('Dossier invalide.');
  const racine = path.resolve(dossier);
  let st;
  try { st = await fs.stat(racine); } catch { throw new Error('Dossier introuvable.'); }
  if (!st.isDirectory()) throw new Error('Ce chemin n’est pas un dossier.');
  const fichiers = [];
  async function parcourir(dir, profondeur) {
    if (fichiers.length >= FICHIERS_MAX) return;
    let entrees;
    try { entrees = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    entrees.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entrees) {
      if (fichiers.length >= FICHIERS_MAX) return;
      if (e.name.startsWith('.') || IGNORES.has(e.name)) continue;
      const complet = path.join(dir, e.name);
      if (e.isDirectory()) { if (profondeur < PROFONDEUR_MAX) await parcourir(complet, profondeur + 1); }
      else if (e.isFile() && EXT_MD.test(e.name)) fichiers.push(path.relative(racine, complet).split(path.sep).join('/'));
    }
  }
  await parcourir(racine, 0);
  return { dossier: racine, fichiers };
}

module.exports = { lireSnippets, ecrireSnippets, listerMdRelatifs, FICHIER_SNIPPETS, PROFONDEUR_MAX, FICHIERS_MAX };

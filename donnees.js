// Accès disque du lot « écriture » côté processus principal, isolé de main.js
// pour être testable sans Electron : snippets (fichier JSON du dossier de
// données) et liste des documents .md d'un dossier (propositions de liens).
const fs = require('fs/promises');
const path = require('path');
const snippets = require('./renderer/lib/snippets.js');
const wiki = require('./renderer/lib/wiki.js');
const tagsLib = require('./renderer/lib/tags.js');

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

// Dossier racine validé : chemin absolu d'un dossier existant (résolu).
async function validerRacine(dossier) {
  if (typeof dossier !== 'string' || !path.isAbsolute(dossier)) throw new Error('Dossier invalide.');
  const racine = path.resolve(dossier);
  let st;
  try { st = await fs.stat(racine); } catch { throw new Error('Dossier introuvable.'); }
  if (!st.isDirectory()) throw new Error('Ce chemin n’est pas un dossier.');
  return racine;
}

// Documents .md sous `racine` (déjà validée) : [{ abs, rel }] triés par dossier,
// `rel` avec `/`. Bornes : profondeur 4, 500 fichiers, ni dossiers cachés, ni
// node_modules, ni dist, ni liens symboliques ; aucun contenu n'est lu.
async function parcourirMd(racine) {
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
      else if (e.isFile() && EXT_MD.test(e.name)) fichiers.push({ abs: complet, rel: path.relative(racine, complet).split(path.sep).join('/') });
    }
  }
  await parcourir(racine, 0);
  return fichiers;
}

// Documents .md sous `dossier` (chemin absolu d'un dossier existant), en chemins
// relatifs avec `/`, triés ; aucun contenu n'est lu (voir parcourirMd).
async function listerMdRelatifs(dossier) {
  const racine = await validerRacine(dossier);
  const fichiers = (await parcourirMd(racine)).map((f) => f.rel);
  return { dossier: racine, fichiers };
}

const TAILLE_FICHIER_MAX = 2 * 1024 * 1024;
const LECTURE_TAGS_MAX = 16 * 1024;

// Lit au plus `max` octets au début d'un fichier (texte UTF-8) ; null si illisible.
async function lireDebut(chemin, max) {
  let fh;
  try {
    fh = await fs.open(chemin, 'r');
    const tampon = Buffer.alloc(max);
    const { bytesRead } = await fh.read(tampon, 0, max, 0);
    return tampon.subarray(0, bytesRead).toString('utf8');
  } catch { return null; } finally { if (fh) await fh.close().catch(() => {}); }
}

// Lit un document entier s'il ne dépasse pas la borne de taille ; null sinon.
async function lireBorne(chemin) {
  try {
    const st = await fs.stat(chemin);
    if (!st.isFile() || st.size > TAILLE_FICHIER_MAX) return null;
    return await fs.readFile(chemin, 'utf8');
  } catch { return null; }
}

// Tags du front-matter de chaque .md du dossier : { dossier, fichiers: [{ rel,
// chemin, tags }] } (seuls les documents qui portent des tags). Lecture seule,
// 16 Ko par fichier au plus.
async function scannerTags(dossier) {
  const racine = await validerRacine(dossier);
  const sortie = [];
  for (const f of await parcourirMd(racine)) {
    const debut = await lireDebut(f.abs, LECTURE_TAGS_MAX);
    if (debut === null) continue;
    const tags = tagsLib.extraireTags(debut);
    if (tags.length) sortie.push({ rel: f.rel, chemin: f.abs, tags });
  }
  return { dossier: racine, fichiers: sortie };
}

const RETROLIENS_MAX = 100;

// Documents du dossier qui citent `cible` (chemin absolu d'un .md du dossier)
// par `[[nom]]` ou lien relatif : { dossier, cible, retroliens: [{ rel, chemin,
// nombre, ligne, extrait }] }. Lecture seule, fichiers de plus de 2 Mo ignorés.
async function trouverRetroliens(dossier, cible) {
  const racine = await validerRacine(dossier);
  if (typeof cible !== 'string' || !path.isAbsolute(cible)) throw new Error('Document invalide.');
  const relCible = wiki.relatifA(racine, path.resolve(cible));
  if (!relCible) throw new Error('Le document est hors du dossier ouvert.');
  const retroliens = [];
  for (const f of await parcourirMd(racine)) {
    if (retroliens.length >= RETROLIENS_MAX) break;
    if (f.rel.toLowerCase() === relCible.toLowerCase()) continue;
    const contenu = await lireBorne(f.abs);
    if (contenu === null) continue;
    const r = wiki.analyserRetroliens({ contenu, relFichier: f.rel, relCible });
    if (r) retroliens.push({ rel: f.rel, chemin: f.abs, ...r });
  }
  return { dossier: racine, cible: relCible, retroliens };
}

module.exports = { lireSnippets, ecrireSnippets, listerMdRelatifs, scannerTags, trouverRetroliens, FICHIER_SNIPPETS, PROFONDEUR_MAX, FICHIERS_MAX };

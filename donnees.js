// Accès disque du lot « écriture » côté processus principal, isolé de main.js
// pour être testable sans Electron : snippets (fichier JSON du dossier de
// données) et liste des documents .md d'un dossier (propositions de liens).
const fs = require('fs/promises');
const path = require('path');
const snippets = require('./renderer/lib/snippets.js');
const wiki = require('./renderer/lib/wiki.js');
const tagsLib = require('./renderer/lib/tags.js');
const remplacement = require('./remplacement.js');

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
    if (!st.isFile() || st.size > remplacement.LIMITES.tailleFichierMax) return null;
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

// ── Rechercher/remplacer dans le dossier ────────────────────────────────

// Aperçu (lecture seule) : pour chaque .md du dossier, les occurrences avec la
// ligne avant/après. { dossier, fichiers: [{ rel, chemin, empreinte, tronque,
// occurrences: [{ indice, ligne, avant, apres }] }], total, tronque, ignores }
// ou { erreur } pour des paramètres invalides.
async function apercuRemplacement(dossier, parametres) {
  const racine = await validerRacine(dossier);
  const { re, erreur } = remplacement.construireRegex(parametres);
  if (erreur) return { erreur };
  const L = remplacement.LIMITES;
  const fichiers = [];
  const ignores = [];
  let total = 0;
  let tronque = false;
  for (const f of await parcourirMd(racine)) {
    if (total >= L.occurrencesTotal) { tronque = true; break; }
    const contenu = await lireBorne(f.abs);
    if (contenu === null) { ignores.push(f.rel); continue; }
    const max = Math.min(L.occurrencesParFichier, L.occurrencesTotal - total);
    const r = remplacement.trouverOccurrences(contenu, re, parametres, max);
    if (!r.occurrences.length) continue;
    total += r.occurrences.length;
    if (r.tronque) tronque = true;
    fichiers.push({
      rel: f.rel,
      chemin: f.abs,
      empreinte: remplacement.empreinte(contenu),
      tronque: r.tronque,
      occurrences: r.occurrences.map(({ indice, ligne, avant, apres }) => ({ indice, ligne, avant, apres })),
    });
  }
  return { dossier: racine, fichiers, total, tronque, ignores };
}

const sortDuDossier = (relatif) => relatif === '..' || relatif.startsWith('..' + path.sep) || path.isAbsolute(relatif);

// Chemin absolu d'un .md du dossier désigné par `rel`, ou null s'il sort du
// dossier (chemin absolu, `..`, lien symbolique vers l'extérieur) ou n'est pas
// un document Markdown.
async function cheminConfine(racine, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.includes('\0')) return null;
  const abs = path.resolve(racine, rel);
  const depuisRacine = path.relative(racine, abs);
  if (!depuisRacine || sortDuDossier(depuisRacine)) return null;
  if (!EXT_MD.test(abs)) return null;
  try {
    const lst = await fs.lstat(abs);
    if (!lst.isFile() || lst.isSymbolicLink()) return null;
    const reel = await fs.realpath(abs);
    const racineReelle = await fs.realpath(racine);
    const dep = path.relative(racineReelle, reel);
    if (!dep || sortDuDossier(dep)) return null;
  } catch { return null; }
  return abs;
}

// Écriture atomique : fichier temporaire voisin puis renommage.
async function ecrireAtomique(chemin, contenu) {
  const tmp = path.join(path.dirname(chemin), `.${path.basename(chemin)}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  try {
    await fs.writeFile(tmp, contenu, 'utf8');
    await fs.rename(tmp, chemin);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

// Applique le remplacement aux seules occurrences choisies. `selection` :
// [{ rel, empreinte, indices }] (celles de l'aperçu). Un fichier modifié depuis
// l'aperçu (empreinte différente), illisible ou hors dossier est sauté. Renvoie
// { modifies: [{ rel, chemin, remplacements }], sautes: [{ rel, raison }] } ou { erreur }.
async function appliquerRemplacement(dossier, parametres, selection) {
  const racine = await validerRacine(dossier);
  const { re, erreur } = remplacement.construireRegex(parametres);
  if (erreur) return { erreur };
  if (!Array.isArray(selection)) return { erreur: 'Sélection invalide.' };
  const L = remplacement.LIMITES;
  const modifies = [];
  const sautes = [];
  for (const choix of selection.slice(0, L.fichiersMax)) {
    const rel = choix && typeof choix.rel === 'string' ? choix.rel : '';
    const abs = await cheminConfine(racine, rel);
    if (!abs) { sautes.push({ rel, raison: 'fichier hors du dossier ouvert ou non Markdown' }); continue; }
    const indices = Array.isArray(choix.indices) ? choix.indices.filter((n) => Number.isInteger(n) && n >= 0).slice(0, L.occurrencesParFichier) : [];
    if (!indices.length) continue;
    const contenu = await lireBorne(abs);
    if (contenu === null) { sautes.push({ rel, raison: 'fichier illisible ou trop gros' }); continue; }
    if (remplacement.empreinte(contenu) !== choix.empreinte) { sautes.push({ rel, raison: 'modifié depuis l’aperçu' }); continue; }
    const { occurrences } = remplacement.trouverOccurrences(contenu, re, parametres, L.occurrencesParFichier);
    const res = remplacement.appliquer(contenu, occurrences, indices);
    if (!res.remplacees) continue;
    try { await ecrireAtomique(abs, res.contenu); }
    catch (e) { sautes.push({ rel, raison: 'écriture impossible : ' + (e && e.message ? e.message : e) }); continue; }
    modifies.push({ rel, chemin: abs, remplacements: res.remplacees });
  }
  return { modifies, sautes };
}

module.exports = { lireSnippets, ecrireSnippets, listerMdRelatifs, scannerTags, trouverRetroliens, apercuRemplacement, appliquerRemplacement, FICHIER_SNIPPETS, PROFONDEUR_MAX, FICHIERS_MAX };

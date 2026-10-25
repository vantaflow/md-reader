// Enregistrement des images collées ou glissées dans l'éditeur. Module pur
// côté Node (aucune dépendance à Electron), importé par main.js et testé par
// test/images.test.js. Toute écriture est bornée au dossier `images/` placé à
// côté du document : un nom contenant `..` ou un séparateur est refusé, un
// dossier `images` qui est un lien vers l'extérieur aussi.
const fs = require('fs/promises');
const path = require('path');

const EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const MIME_VERS_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_OCTETS = 25 * 1024 * 1024;
const DOSSIER_IMAGES = 'images';

const deux = (n) => String(n).padStart(2, '0');

// `image-AAAAMMJJ-HHMMSS.ext`, en heure locale.
function nomCapture(date, ext) {
  const d = date instanceof Date ? date : new Date(date);
  const j = `${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}`;
  const h = `${deux(d.getHours())}${deux(d.getMinutes())}${deux(d.getSeconds())}`;
  return `image-${j}-${h}.${ext}`;
}

// Extension (sans point, en minuscules) déduite du nom, sinon du type MIME ;
// null si ce n'est pas une image acceptée.
function extensionDe(nom, mime) {
  const m = typeof nom === 'string' ? /\.([A-Za-z0-9]+)$/.exec(nom) : null;
  const brute = m ? m[1].toLowerCase() : MIME_VERS_EXT[String(mime || '').toLowerCase()];
  return brute && EXTENSIONS.has(brute) ? brute : null;
}

// Nom d'origine nettoyé : lettres, chiffres, point, tiret, souligné. Refuse
// tout nom qui tente de sortir du dossier (`..`, séparateurs, octet nul).
function nettoyerNom(brut) {
  if (typeof brut !== 'string' || /[\\/\0]/.test(brut) || brut.includes('..')) throw new Error('Nom d’image refusé');
  const point = brut.lastIndexOf('.');
  const base = point > 0 ? brut.slice(0, point) : brut;
  const ext = point > 0 ? brut.slice(point + 1).toLowerCase() : '';
  const propre = base.normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60);
  return { base: propre, ext };
}

// `nom.ext` -> `nom-2.ext` (i = 2), `nom-3.ext`…
function variante(nom, i) {
  const point = nom.lastIndexOf('.');
  return point > 0 ? `${nom.slice(0, point)}-${i}${nom.slice(point)}` : `${nom}-${i}`;
}

// Premier nom libre : `nom.ext`, puis `nom-2.ext`, `nom-3.ext`…
function nomSansCollision(nom, existe) {
  if (!existe(nom)) return nom;
  for (let i = 2; i < 10000; i += 1) {
    const candidat = variante(nom, i);
    if (!existe(candidat)) return candidat;
  }
  throw new Error('Trop de fichiers du même nom');
}

// `cible` est-elle `base` ou à l'intérieur de `base` ?
function dansDossier(base, cible) {
  const rel = path.relative(path.resolve(base), path.resolve(cible));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Le contenu doit être celui d'une image du type annoncé par l'extension.
function contenuCorrespond(octets, ext) {
  const o = octets;
  if (ext === 'png') return o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47;
  if (ext === 'jpg' || ext === 'jpeg') return o[0] === 0xff && o[1] === 0xd8;
  if (ext === 'gif') return o[0] === 0x47 && o[1] === 0x49 && o[2] === 0x46;
  if (ext === 'webp') return o[0] === 0x52 && o[1] === 0x49 && o[2] === 0x46 && o[3] === 0x46 && o[8] === 0x57 && o[9] === 0x45 && o[10] === 0x42 && o[11] === 0x50;
  if (ext === 'svg') return Buffer.from(o.slice(0, 1024)).toString('utf8').toLowerCase().includes('<svg');
  return false;
}

// Écrit l'image dans `images/` à côté du document. `nom` : nom d'origine, ou
// null/vide pour une capture collée (nom horodaté). Renvoie le chemin relatif
// à insérer dans le Markdown (`images/nom.png`, séparateurs `/`).
async function enregistrerImage({ cheminDocument, nom, octets, mime, maintenant = new Date() }) {
  if (typeof cheminDocument !== 'string' || !path.isAbsolute(cheminDocument)) throw new Error('Document non enregistré');
  // Seul un document Markdown peut servir d'ancre : jamais un chemin quelconque.
  if (!/\.(md|markdown|mdown|mkd|txt)$/i.test(cheminDocument)) throw new Error('Le document n’est pas un fichier Markdown');
  const tampon = Buffer.from(octets || []);
  if (!tampon.length) throw new Error('Image vide');
  if (tampon.length > MAX_OCTETS) throw new Error('Image trop volumineuse (25 Mo maximum)');

  let finalNom;
  let ext;
  if (nom) {
    const { base, ext: extNom } = nettoyerNom(nom);
    ext = extensionDe(`x.${extNom}`) || (extNom ? null : extensionDe('', mime));
    if (!ext) throw new Error('Type d’image non pris en charge');
    finalNom = base ? `${base}.${ext}` : nomCapture(maintenant, ext);
  } else {
    ext = extensionDe('', mime) || null;
    if (!ext) throw new Error('Type d’image non pris en charge');
    finalNom = nomCapture(maintenant, ext);
  }
  if (!contenuCorrespond(tampon, ext)) throw new Error('Le contenu ne correspond pas à une image ' + ext);

  const dossierDoc = path.dirname(cheminDocument);
  const dossier = path.join(dossierDoc, DOSSIER_IMAGES);
  await fs.mkdir(dossier, { recursive: true });
  // Un dossier `images` qui est un lien vers l'extérieur ferait sortir l'écriture.
  const reelDoc = await fs.realpath(dossierDoc);
  const reelImages = await fs.realpath(dossier);
  if (!dansDossier(reelDoc, reelImages) || reelImages === reelDoc) throw new Error('Dossier images hors du dossier du document');

  // Écriture exclusive (`wx`) : jamais d'écrasement, même si deux images
  // arrivent en même temps ; en cas de collision on essaie le nom suivant.
  for (let essai = 1; essai < 10000; essai += 1) {
    const candidat = essai === 1 ? finalNom : variante(finalNom, essai);
    const cible = path.join(reelImages, candidat);
    if (!dansDossier(reelImages, cible)) throw new Error('Chemin refusé');
    try {
      await fs.writeFile(cible, tampon, { flag: 'wx' });
      return { relatif: `${DOSSIER_IMAGES}/${candidat}`, chemin: cible, nom: candidat };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Trop de fichiers du même nom');
}

module.exports = { enregistrerImage, nomCapture, extensionDe, nettoyerNom, nomSansCollision, dansDossier, contenuCorrespond, MAX_OCTETS, EXTENSIONS };

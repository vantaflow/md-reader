// Liens wiki `[[note]]` / `[[note|texte]]` : analyse, résolution d'une note par
// son nom de fichier et détection des rétroliens. Fonctions pures, sans accès
// disque. Format UMD : global `window.mdrWiki` dans le renderer, CommonJS pour
// node (donnees.js, tests).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrWiki = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const EXT_MD = /\.(md|markdown|mdown|mkd)$/i;
  const slash = (p) => String(p).replace(/\\/g, '/');
  const nomSansExt = (p) => slash(p).split('/').pop().replace(EXT_MD, '');
  // `[[toc]]` est le marqueur de sommaire du document, pas un lien.
  const RESERVES = new Set(['toc']);

  // « note#section | texte » : cible (nom éventuellement précédé d'un chemin),
  // ancre et texte affiché. Renvoie null pour un lien vide ou réservé.
  function analyserLien(cibleBrute, texteBrut) {
    const complet = String(cibleBrute || '').trim();
    const [sansAncre, ...ancre] = complet.split('#');
    const cible = sansAncre.trim();
    if (!cible || RESERVES.has(cible.toLowerCase())) return null;
    const texte = texteBrut !== undefined && String(texteBrut).trim() ? String(texteBrut).trim() : complet;
    return { cible, ancre: ancre.join('#').trim(), texte };
  }

  // Clé de comparaison d'un nom de note : sans extension, minuscules, `/`.
  const cle = (cible) => slash(cible).replace(EXT_MD, '').replace(/^\/+|\/+$/g, '').toLowerCase();

  // Retire `racine` du début d'un chemin absolu ; null si le chemin n'est pas dessous.
  function relatifA(racineDossier, chemin) {
    const r = slash(racineDossier).replace(/\/+$/, '');
    const c = slash(chemin);
    const ci = /^[a-z]:/i.test(r);
    const pref = r + '/';
    if ((ci ? c.toLowerCase() : c).startsWith(ci ? pref.toLowerCase() : pref)) return c.slice(pref.length);
    return ci && c.toLowerCase() === r.toLowerCase() ? '' : null;
  }

  // Résout une cible dans `fichiers` (chemins relatifs à `racine`, avec `/`).
  // Le nom est comparé sans extension et sans tenir compte de la casse ; on
  // cherche d'abord dans le dossier du document (`dossierDocument`, absolu),
  // puis dans tout le dossier. Renvoie le chemin relatif trouvé, sinon null.
  function resoudre({ cible, dossierDocument, racine, fichiers }) {
    const k = cle(cible);
    if (!k) return null;
    const candidats = (fichiers || []).filter((f) => {
      const fk = cle(f);
      return k.includes('/') ? fk === k || fk.endsWith('/' + k) : fk.split('/').pop() === k;
    });
    if (!candidats.length) return null;
    const dossierRel = dossierDocument && racine ? relatifA(racine, dossierDocument) : null;
    const dossierDe = (f) => slash(f).split('/').slice(0, -1).join('/');
    const profondeur = (f) => slash(f).split('/').length;
    const ordre = candidats.slice().sort((a, b) => {
      const da = dossierRel !== null && dossierDe(a).toLowerCase() === dossierRel.toLowerCase() ? 0 : 1;
      const db = dossierRel !== null && dossierDe(b).toLowerCase() === dossierRel.toLowerCase() ? 0 : 1;
      return da - db || profondeur(a) - profondeur(b) || a.localeCompare(b);
    });
    return ordre[0];
  }

  // Nom de fichier sûr pour créer une note : sans séparateur ni caractère réservé.
  function nomFichierNote(cible) {
    const base = nomSansExt(String(cible)).replace(/[<>:"|?*\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    return base ? base.slice(0, 100) + '.md' : null;
  }

  // Remplace le code (blocs clôturés et code en ligne) par des espaces, en
  // gardant les sauts de ligne : un lien cité dans du code n'en est pas un.
  function masquerCode(texte) {
    let cloture = null;
    return String(texte).split('\n').map((ligne) => {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(ligne.replace(/\r$/, ''));
      if (cloture) {
        if (m && m[1][0] === cloture.car && m[1].length >= cloture.long && m[2].trim() === '') cloture = null;
        return ligne.replace(/[^\r]/g, ' ');
      }
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) { cloture = { car: m[1][0], long: m[1].length }; return ligne.replace(/[^\r]/g, ' '); }
      return ligne.replace(/(`+)[^`\n]*?\1/g, (x) => ' '.repeat(x.length));
    }).join('\n');
  }

  // Chemin résolu `lien` (relatif) depuis le dossier `dossier` (relatif à la racine).
  function joindre(dossier, lien) {
    const sortie = dossier ? slash(dossier).split('/').filter(Boolean) : [];
    for (const part of slash(lien).split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') { if (!sortie.length) return null; sortie.pop(); } else sortie.push(part);
    }
    return sortie.join('/');
  }

  // Le fichier `relFichier` cite-t-il `relCible` ? Par `[[nom]]` / `[[nom|texte]]`
  // (nom du fichier, sans extension, insensible à la casse) ou par un lien
  // relatif `](chemin.md)`. Renvoie { nombre, ligne (1-based), extrait } du
  // premier lien, ou null. Un fichier ne se cite pas lui-même.
  function analyserRetroliens({ contenu, relFichier, relCible }) {
    if (slash(relFichier).toLowerCase() === slash(relCible).toLowerCase()) return null;
    const nom = cle(nomSansExt(relCible));
    const cibleCle = cle(relCible);
    const masque = masquerCode(contenu);
    const lignes = String(contenu).split('\n');
    const dossier = slash(relFichier).split('/').slice(0, -1).join('/');
    const trouves = [];
    const reWiki = /\[\[([^\[\]\n|]+?)(?:\|[^\[\]\n]+?)?\]\]/g;
    const reLien = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
    let m;
    const posLigne = (index) => masque.slice(0, index).split('\n').length;
    while ((m = reWiki.exec(masque))) {
      const a = analyserLien(m[1]);
      if (!a) continue;
      const k = cle(a.cible);
      if (k === nom || (k.includes('/') && (cibleCle === k || cibleCle.endsWith('/' + k)))) trouves.push(posLigne(m.index));
    }
    while ((m = reLien.exec(masque))) {
      let adresse = m[1].split('#')[0].split('?')[0];
      if (!adresse || /^[a-z][a-z0-9+.-]*:/i.test(adresse) || adresse.startsWith('//') || !EXT_MD.test(adresse)) continue;
      try { adresse = decodeURIComponent(adresse); } catch { /* adresse laissée telle quelle */ }
      const resolu = adresse.startsWith('/') ? null : joindre(dossier, adresse);
      if (resolu && resolu.toLowerCase() === slash(relCible).toLowerCase()) trouves.push(posLigne(m.index));
    }
    if (!trouves.length) return null;
    trouves.sort((x, y) => x - y);
    const brut = (lignes[trouves[0] - 1] || '').replace(/\r$/, '').trim();
    return { nombre: trouves.length, ligne: trouves[0], extrait: brut.length > 160 ? brut.slice(0, 160) + '…' : brut };
  }

  return { analyserLien, cle, resoudre, relatifA, nomFichierNote, masquerCode, analyserRetroliens, nomSansExt };
});

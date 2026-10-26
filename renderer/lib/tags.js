// Tags du front-matter YAML (`tags:`) : extraction, comptage et filtrage d'une
// arborescence de fichiers. Fonctions pures. Format UMD : global `window.mdrTags`
// dans le renderer, CommonJS pour node (donnees.js, tests).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrTags = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAGS_MAX = 50;
  const LONGUEUR_MAX = 50;
  const RE_FRONT = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

  function nettoyer(brut) {
    let t = String(brut).trim();
    t = t.replace(/^(["'])(.*)\1$/, '$2').trim();
    t = t.replace(/^#+/, '').trim();
    return t.length > LONGUEUR_MAX ? t.slice(0, LONGUEUR_MAX) : t;
  }

  function dedoublonner(liste) {
    const vus = new Set();
    const sortie = [];
    for (const brut of liste) {
      const t = nettoyer(brut);
      if (!t || vus.has(t.toLowerCase())) continue;
      vus.add(t.toLowerCase());
      sortie.push(t);
      if (sortie.length >= TAGS_MAX) break;
    }
    return sortie;
  }

  // Tags du front-matter d'un document : liste YAML (`- a`), liste en ligne
  // (`[a, b]`) ou valeurs séparées par des virgules (`a, b`).
  function extraireTags(contenu) {
    const m = RE_FRONT.exec(String(contenu));
    if (!m) return [];
    const lignes = m[1].split(/\r?\n/);
    const i = lignes.findIndex((l) => /^tags[ \t]*:/i.test(l));
    if (i < 0) return [];
    const reste = lignes[i].replace(/^tags[ \t]*:/i, '').replace(/[ \t]+#.*$/, '').trim();
    if (reste) {
      const interieur = reste.replace(/^\[/, '').replace(/\]$/, '');
      return dedoublonner(interieur.split(','));
    }
    const liste = [];
    for (let j = i + 1; j < lignes.length; j += 1) {
      const l = lignes[j];
      const item = /^\s*-\s+(.*)$/.exec(l);
      if (item) { liste.push(item[1].replace(/[ \t]+#.*$/, '')); continue; }
      if (l.trim() === '') continue;
      break;
    }
    return dedoublonner(liste);
  }

  // [{ tag, nombre }] trié par fréquence puis par nom ; regroupe sans tenir compte de la casse.
  function compterTags(fichiers) {
    const table = new Map();
    for (const f of fichiers || []) {
      for (const t of f.tags || []) {
        const k = t.toLowerCase();
        const e = table.get(k);
        if (e) e.nombre += 1; else table.set(k, { tag: t, nombre: 1 });
      }
    }
    return [...table.values()].sort((a, b) => b.nombre - a.nombre || a.tag.localeCompare(b.tag));
  }

  // Ne garde de l'arbre ({ type, name, path, children }) que les fichiers
  // acceptés par `garde(fichier)` et les dossiers qui en contiennent encore.
  function filtrerArbre(arbre, garde) {
    const sortie = [];
    for (const n of arbre || []) {
      if (n.type === 'dir') {
        const enfants = filtrerArbre(n.children, garde);
        if (enfants.length) sortie.push({ ...n, children: enfants });
      } else if (garde(n)) sortie.push(n);
    }
    return sortie;
  }

  // Clé de comparaison d'un chemin de fichier (séparateurs et casse neutralisés).
  const clePath = (p) => String(p).replace(/\\/g, '/').toLowerCase();

  return { extraireTags, compterTags, filtrerArbre, clePath, TAGS_MAX };
});

// Plan du document : extraction des sections d'un texte Markdown source et
// déplacement d'une section (avec ses sous-sections). Fonctions pures, sans
// DOM ni disque. Format UMD : global `window.mdrPlan` dans le renderer.
//
// Les titres reconnus sont les titres ATX (`# …` à `###### …`) ; les blocs de
// code clôturés (``` ou ~~~) et le front-matter YAML en tête de document sont
// ignorés. Les titres soulignés (setext) ne forment pas de section.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrPlan = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const RE_TITRE = /^( {0,3})(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
  const RE_CLOTURE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

  // Lignes avec leur position : { texte, debut } (le saut de ligne n'est pas
  // dans `texte`, `\r` final retiré).
  function decouperLignes(source) {
    const lignes = [];
    let debut = 0;
    while (debut <= source.length) {
      let fin = source.indexOf('\n', debut);
      const dernier = fin === -1;
      if (dernier) fin = source.length;
      let texte = source.slice(debut, fin);
      if (texte.endsWith('\r')) texte = texte.slice(0, -1);
      lignes.push({ texte, debut });
      if (dernier) break;
      debut = fin + 1;
    }
    // Un texte qui se termine par un saut de ligne ne porte pas de ligne finale vide.
    if (lignes.length && lignes[lignes.length - 1].texte === '' && lignes[lignes.length - 1].debut === source.length && source.length > 0) lignes.pop();
    return lignes;
  }

  // Indice de la première ligne qui suit le front-matter (0 s'il n'y en a pas).
  function finFrontMatter(lignes) {
    if (!lignes.length || lignes[0].texte.replace(/^﻿/, '').trimEnd() !== '---') return 0;
    for (let i = 1; i < lignes.length; i += 1) {
      const t = lignes[i].texte.trimEnd();
      if (t === '---' || t === '...') return i + 1;
    }
    return 0;
  }

  function titreNettoye(brut) {
    let t = (brut || '').trim();
    t = t.replace(/(^|[ \t])#+[ \t]*$/, '').trim();
    return t;
  }

  // Titres ATX du texte hors code et hors front-matter :
  // { niveau, titre, ligne (0-based), debut (début de ligne), finLigne, marques: [de, a] }.
  function extraireTitres(source) {
    const lignes = decouperLignes(String(source));
    const titres = [];
    let i = finFrontMatter(lignes);
    let cloture = null;
    for (; i < lignes.length; i += 1) {
      const { texte, debut } = lignes[i];
      if (cloture) {
        const c = RE_CLOTURE.exec(texte);
        if (c && c[1][0] === cloture.car && c[1].length >= cloture.long && c[2].trim() === '') cloture = null;
        continue;
      }
      const ouverture = RE_CLOTURE.exec(texte);
      if (ouverture && !(ouverture[1][0] === '`' && ouverture[2].includes('`'))) {
        cloture = { car: ouverture[1][0], long: ouverture[1].length };
        continue;
      }
      const m = RE_TITRE.exec(texte);
      if (!m) continue;
      const de = debut + m[1].length;
      titres.push({
        niveau: m[2].length,
        titre: titreNettoye(m[3]),
        ligne: i,
        debut,
        finLigne: debut + lignes[i].texte.length,
        marques: [de, de + m[2].length],
      });
    }
    return titres;
  }

  // Sections : chaque titre ouvre une section qui court jusqu'au prochain titre
  // de niveau inférieur ou égal (sous-sections comprises) ou la fin du texte.
  function extraireSections(source) {
    const texte = String(source);
    const titres = extraireTitres(texte);
    return titres.map((t, i) => {
      let fin = texte.length;
      for (let j = i + 1; j < titres.length; j += 1) {
        if (titres[j].niveau <= t.niveau) { fin = titres[j].debut; break; }
      }
      return { niveau: t.niveau, titre: t.titre, ligne: t.ligne, debut: t.debut, fin, indice: i };
    });
  }

  // Indice de la section qui contient la ligne (0-based) : la dernière dont le
  // titre est au plus à cette ligne ; -1 avant le premier titre.
  function sectionCourante(sections, ligne) {
    let courante = -1;
    for (let i = 0; i < sections.length; i += 1) {
      if (sections[i].ligne <= ligne) courante = i;
      else break;
    }
    return courante;
  }

  // Déplace la section `source` (avec ses sous-sections) avant ou après la
  // section `cible` (après = après toutes ses sous-sections). Par défaut, le
  // niveau de la section déplacée s'aligne sur celui de la cible (ses
  // sous-sections suivent, bornées à 1..6). Renvoie { texte, change } ; `change`
  // est faux pour un déplacement sans effet ou impossible (cible dans la section
  // déplacée, indices invalides).
  function deplacer(source, indiceSource, indiceCible, position, options = {}) {
    const texte = String(source);
    const sections = extraireSections(texte);
    const src = sections[indiceSource];
    const cib = sections[indiceCible];
    const rien = { texte, change: false };
    if (!src || !cib || (position !== 'avant' && position !== 'apres')) return rien;
    if (cib.debut >= src.debut && cib.debut < src.fin) return rien;
    const point = position === 'avant' ? cib.debut : cib.fin;
    
    const eol = texte.includes('\r\n') ? '\r\n' : '\n';
    let bloc = texte.slice(src.debut, src.fin);
    const delta = options.ajusterNiveaux === false ? 0 : cib.niveau - src.niveau;
    // Sans changement de niveau, une section déplacée contre elle-même ne bouge pas.
    if (!delta && (point === src.debut || point === src.fin)) return rien;
    if (delta) {
      const titres = extraireTitres(bloc);
      for (let k = titres.length - 1; k >= 0; k -= 1) {
        const [de, a] = titres[k].marques;
        const niveau = Math.min(6, Math.max(1, titres[k].niveau + delta));
        bloc = bloc.slice(0, de) + '#'.repeat(niveau) + bloc.slice(a);
      }
    }
    if (!bloc.endsWith('\n')) bloc += eol;
    let nouveau;
    if (src.debut < point) {
      nouveau = texte.slice(0, src.debut) + texte.slice(src.fin, point);
      if (nouveau.length && !nouveau.endsWith('\n')) nouveau += eol;
      nouveau += bloc + texte.slice(point);
    } else {
      let avant = texte.slice(0, point);
      if (avant.length && !avant.endsWith('\n')) avant += eol;
      nouveau = avant + bloc + texte.slice(point, src.debut) + texte.slice(src.fin);
    }
    // Un texte sans saut de ligne final le reste.
    if (!texte.endsWith('\n') && nouveau.endsWith('\n')) nouveau = nouveau.slice(0, nouveau.endsWith('\r\n') ? -2 : -1);
    return { texte: nouveau, change: nouveau !== texte };
  }

  // Plus petite plage { from, to, insert } qui transforme `avant` en `apres` :
  // permet d'appliquer un déplacement en un seul changement de l'éditeur.
  function plageModifiee(avant, apres) {
    const a = String(avant);
    const b = String(apres);
    let debut = 0;
    const max = Math.min(a.length, b.length);
    while (debut < max && a[debut] === b[debut]) debut += 1;
    let finA = a.length;
    let finB = b.length;
    while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) { finA -= 1; finB -= 1; }
    return { from: debut, to: finA, insert: b.slice(debut, finB) };
  }

  return { extraireTitres, extraireSections, sectionCourante, deplacer, plageModifiee };
});

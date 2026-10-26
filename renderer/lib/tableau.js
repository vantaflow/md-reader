// Tableaux Markdown (GFM) : analyse, sérialisation alignée et repérage du
// tableau sous le curseur. Fonctions pures, sans DOM. Format UMD : CommonJS
// pour les tests node, global `window.mdrTableau` dans le renderer.
//
// Modèle : { entete: [texte…], alignements: ['aucun'|'gauche'|'centre'|'droite'…],
//            lignes: [[texte…]…] }. Les barres verticales d'une cellule sont
// stockées sans échappement et ré-échappées (`\|`) à la sérialisation.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrTableau = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const LARGEUR_MIN = 3;
  const taille = (s) => Array.from(s).length;

  // Découpe une ligne en cellules : barres initiale et finale facultatives,
  // `\|` conservé dans la cellule.
  function decouper(ligne) {
    let s = ligne.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cellules = [];
    let courante = '';
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (c === '\\' && s[i + 1] === '|') { courante += '|'; i += 1; continue; }
      if (c === '|') { cellules.push(courante.trim()); courante = ''; continue; }
      courante += c;
    }
    cellules.push(courante.trim());
    return cellules;
  }

  const RE_SEPARATEUR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  const estSeparateur = (ligne) => ligne.includes('|') && RE_SEPARATEUR.test(ligne);

  function alignementDe(cellule) {
    const g = cellule.startsWith(':');
    const d = cellule.endsWith(':');
    if (g && d) return 'centre';
    if (d) return 'droite';
    if (g) return 'gauche';
    return 'aucun';
  }

  // Analyse le texte d'un tableau (entête, séparateur, lignes). Renvoie null
  // si ce n'en est pas un.
  function analyser(texte) {
    const lignes = String(texte).split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lignes.length < 2 || !lignes[0].includes('|') || !estSeparateur(lignes[1])) return null;
    const entete = decouper(lignes[0]);
    const seps = decouper(lignes[1]);
    if (entete.length !== seps.length) return null;
    const n = entete.length;
    const corps = lignes.slice(2).map((l) => {
      const c = decouper(l);
      while (c.length < n) c.push('');
      return c.slice(0, n);
    });
    return { entete, alignements: seps.map(alignementDe), lignes: corps };
  }

  const echapper = (s) => s.replace(/\|/g, '\\|');

  function remplir(s, largeur, alignement) {
    const manque = Math.max(0, largeur - taille(s));
    if (alignement === 'droite') return ' '.repeat(manque) + s;
    if (alignement === 'centre') { const g = Math.floor(manque / 2); return ' '.repeat(g) + s + ' '.repeat(manque - g); }
    return s + ' '.repeat(manque);
  }

  function separateur(largeur, alignement) {
    if (alignement === 'centre') return ':' + '-'.repeat(largeur - 2) + ':';
    if (alignement === 'droite') return '-'.repeat(largeur - 1) + ':';
    if (alignement === 'gauche') return ':' + '-'.repeat(largeur - 1);
    return '-'.repeat(largeur);
  }

  // Texte du tableau, colonnes alignées sur des largeurs égales.
  function serialiser(modele) {
    const n = Math.max(modele.entete.length, modele.alignements.length, ...modele.lignes.map((l) => l.length), 1);
    const cellule = (l, i) => echapper(l[i] === undefined ? '' : String(l[i]));
    const entete = Array.from({ length: n }, (_, i) => cellule(modele.entete, i));
    const corps = modele.lignes.map((l) => Array.from({ length: n }, (_, i) => cellule(l, i)));
    const al = Array.from({ length: n }, (_, i) => modele.alignements[i] || 'aucun');
    const largeurs = al.map((_, i) => Math.max(LARGEUR_MIN, taille(entete[i]), ...corps.map((l) => taille(l[i]))));
    const ligne = (cells) => '| ' + cells.map((c, i) => remplir(c, largeurs[i], al[i])).join(' | ') + ' |';
    return [
      ligne(entete),
      '| ' + al.map((a, i) => separateur(largeurs[i], a)).join(' | ') + ' |',
      ...corps.map(ligne),
    ].join('\n');
  }

  // Tableau neuf : colonnes « Colonne n », cellules vides.
  function nouveau(colonnes = 3, lignes = 2) {
    return {
      entete: Array.from({ length: colonnes }, (_, i) => `Colonne ${i + 1}`),
      alignements: Array.from({ length: colonnes }, () => 'aucun'),
      lignes: Array.from({ length: lignes }, () => Array.from({ length: colonnes }, () => '')),
    };
  }

  // Un nombre pair de ``` avant la position : on est hors d'un bloc de code.
  function dansBlocDeCode(texte, pos) {
    let ouvert = null;
    for (const l of texte.slice(0, pos).split('\n').slice(0, -1)) {
      const m = /^\s*(`{3,}|~{3,})/.exec(l);
      if (!m) continue;
      if (!ouvert) ouvert = m[1];
      else if (m[1][0] === ouvert[0] && m[1].length >= ouvert.length) ouvert = null;
    }
    return !!ouvert;
  }

  // Repère le tableau Markdown qui contient la position `pos`.
  // Renvoie { from, to, modele } (to : fin de la dernière ligne, sans saut) ou null.
  function trouverTableau(texte, pos) {
    if (dansBlocDeCode(texte, pos)) return null;
    const lignes = texte.split('\n');
    const debuts = [];
    let o = 0;
    for (const l of lignes) { debuts.push(o); o += l.length + 1; }
    let courante = 0;
    for (let i = 0; i < lignes.length; i += 1) if (debuts[i] <= pos) courante = i;
    const estLigne = (l) => l.trim() !== '' && l.includes('|') && !l.trim().startsWith('>');
    if (!estLigne(lignes[courante])) return null;
    let a = courante;
    while (a > 0 && estLigne(lignes[a - 1])) a -= 1;
    let b = courante;
    while (b < lignes.length - 1 && estLigne(lignes[b + 1])) b += 1;
    for (let d = a + 1; d <= b; d += 1) {
      if (!estSeparateur(lignes[d]) || decouper(lignes[d - 1]).length !== decouper(lignes[d]).length) continue;
      if (courante < d - 1) return null;
      const bloc = lignes.slice(d - 1, b + 1).join('\n').replace(/\r/g, '');
      const modele = analyser(bloc);
      if (!modele) return null;
      return { from: debuts[d - 1], to: debuts[b] + lignes[b].length, modele };
    }
    return null;
  }

  // ── Manipulations (immutables) ─────────────────────────────────────────
  const copie = (m) => ({ entete: m.entete.slice(), alignements: m.alignements.slice(), lignes: m.lignes.map((l) => l.slice()) });
  const colonnes = (m) => m.entete.length;

  function ajouterLigne(m, index = m.lignes.length) {
    const c = copie(m);
    c.lignes.splice(Math.max(0, Math.min(index, c.lignes.length)), 0, Array.from({ length: colonnes(m) }, () => ''));
    return c;
  }
  function supprimerLigne(m, index) {
    if (index < 0 || index >= m.lignes.length) return copie(m);
    const c = copie(m);
    c.lignes.splice(index, 1);
    return c;
  }
  function ajouterColonne(m, index = colonnes(m)) {
    const c = copie(m);
    const i = Math.max(0, Math.min(index, colonnes(m)));
    c.entete.splice(i, 0, `Colonne ${colonnes(m) + 1}`);
    c.alignements.splice(i, 0, 'aucun');
    c.lignes.forEach((l) => l.splice(i, 0, ''));
    return c;
  }
  function supprimerColonne(m, index) {
    if (colonnes(m) <= 1 || index < 0 || index >= colonnes(m)) return copie(m);
    const c = copie(m);
    c.entete.splice(index, 1);
    c.alignements.splice(index, 1);
    c.lignes.forEach((l) => l.splice(index, 1));
    return c;
  }
  function definirAlignement(m, index, alignement) {
    const c = copie(m);
    if (index >= 0 && index < colonnes(m)) c.alignements[index] = alignement;
    return c;
  }

  return {
    decouper, estSeparateur, analyser, serialiser, nouveau, trouverTableau,
    ajouterLigne, supprimerLigne, ajouterColonne, supprimerColonne, definirAlignement,
  };
});

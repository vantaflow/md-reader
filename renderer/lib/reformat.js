// Reformatage du Markdown : fonctions pures sur du texte. Format UMD :
// CommonJS pour les tests node, global `window.mdrReformat` dans le renderer.
//
// Ce qui est fait : listes à puces homogènes (`-`), listes numérotées
// renumérotées, tableaux alignés, espaces de fin retirés, lignes vides
// multiples réduites à une. Jamais touchés : les blocs de code (clôturés) et le
// front-matter YAML.
// Un saut de ligne forcé (deux espaces ou plus en fin de ligne, suivis d'une
// ligne de texte) est conservé, ramené à exactement deux espaces.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./tableau.js'));
  else racine.mdrReformat = fabrique(racine.mdrTableau);
})(typeof self !== 'undefined' ? self : this, function (tableau) {
  const RE_CLOTURE = /^\s*(`{3,}|~{3,})/;
  const RE_FILET = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const RE_PUCE = /^(\s*)([-*+])(\s+)(.*)$/;
  const RE_NUM = /^(\s*)(\d+)([.)])(\s+)(.*)$/;
  const indentDe = (l) => /^\s*/.exec(l)[0].length;

  // Fin du front-matter : index de la ligne de fermeture, ou -1.
  function finFrontMatter(lignes) {
    if (lignes[0] === undefined || lignes[0].trimEnd() !== '---') return -1;
    for (let i = 1; i < lignes.length; i += 1) {
      const t = lignes[i].trimEnd();
      if (t === '---' || t === '...') return i;
    }
    return -1;
  }

  // Le saut de ligne forcé n'a de sens que si la ligne suivante prolonge le
  // paragraphe : ni ligne vide, ni puce, ni numéro, ni titre, ni clôture, ni
  // tableau, ni citation.
  function suiteDeParagraphe(l) {
    return l !== undefined && l.trim() !== '' && !RE_PUCE.test(l) && !RE_NUM.test(l) && !/^\s*#{1,6}(\s|$)/.test(l)
      && !RE_CLOTURE.test(l) && !RE_FILET.test(l) && !l.includes('|') && !/^\s*>/.test(l);
  }

  // Transforme des lignes ; `cloture` : clôture ouverte au début du segment.
  function traiter(lignes, { cloture = null, supprimerBlancsDebut = false } = {}) {
    const sortie = [];
    const pile = []; // listes numérotées actives : { indent, n, delim }
    let ouverte = cloture;

    const enBlanc = (l) => l.trim() === '';

    for (let i = 0; i < lignes.length; i += 1) {
      const brute = lignes[i];

      // Blocs de code : recopiés tels quels.
      const m = RE_CLOTURE.exec(brute);
      if (ouverte) {
        sortie.push(brute);
        if (m && m[1][0] === ouverte[0] && m[1].length >= ouverte.length && brute.trim() === m[1]) ouverte = null;
        continue;
      }
      if (m) {
        ouverte = m[1];
        pile.length = 0;
        sortie.push(brute.replace(/\s+$/, ''));
        continue;
      }

      // Tableau : entête + séparateur, puis les lignes qui suivent.
      const suivante = lignes[i + 1];
      if (brute.includes('|') && !brute.trim().startsWith('>') && suivante !== undefined
        && tableau.estSeparateur(suivante) && tableau.decouper(brute).length === tableau.decouper(suivante).length) {
        let j = i + 2;
        while (j < lignes.length && lignes[j].trim() !== '' && lignes[j].includes('|') && !lignes[j].trim().startsWith('>')) j += 1;
        const modele = tableau.analyser(lignes.slice(i, j).join('\n'));
        if (modele) {
          const prefixe = /^\s*/.exec(brute)[0];
          for (const l of tableau.serialiser(modele).split('\n')) sortie.push(prefixe + l);
          i = j - 1;
          pile.length = 0;
          continue;
        }
      }

      // Ligne vide : au plus une d'affilée.
      if (enBlanc(brute)) {
        if (sortie.length === 0 && supprimerBlancsDebut) continue;
        if (sortie.length > 0 && sortie[sortie.length - 1] === '') continue;
        sortie.push('');
        continue;
      }

      // Espaces de fin ; saut de ligne forcé conservé (deux espaces).
      let ligne = brute.replace(/\s+$/, '');
      const finsEspaces = /( {2,})$/.test(brute.replace(/[\t\r]+$/, ''));
      if (finsEspaces && suiteDeParagraphe(lignes[i + 1]) && !RE_FILET.test(ligne)) ligne += '  ';

      if (RE_FILET.test(brute)) {
        pile.length = 0;
        sortie.push(ligne.trimEnd());
        continue;
      }

      const num = RE_NUM.exec(ligne);
      const puce = num ? null : RE_PUCE.exec(ligne);
      if (num) {
        const indent = num[1].length;
        while (pile.length && pile[pile.length - 1].indent > indent) pile.pop();
        let liste = pile[pile.length - 1];
        if (liste && liste.indent === indent && liste.delim === num[3]) liste.n += 1;
        else {
          if (liste && liste.indent === indent) pile.pop();
          liste = { indent, n: parseInt(num[2], 10), delim: num[3] };
          pile.push(liste);
        }
        ligne = `${num[1]}${liste.n}${num[3]} ${num[5]}`;
      } else if (puce) {
        const indent = puce[1].length;
        while (pile.length && pile[pile.length - 1].indent >= indent) pile.pop();
        ligne = `${puce[1]}- ${puce[4]}`;
      } else {
        const indent = indentDe(ligne);
        while (pile.length && pile[pile.length - 1].indent >= indent) pile.pop();
      }
      sortie.push(ligne);
    }
    return sortie;
  }

  // Document entier : front-matter intact, blancs de tête retirés, fin de
  // fichier : une seule fin de ligne si le texte en avait une.
  function reformater(texte) {
    const source = String(texte);
    const avecFinDeLigne = /\n$/.test(source);
    const lignes = source.replace(/\r\n/g, '\n').split('\n');
    if (avecFinDeLigne) lignes.pop();
    const fin = finFrontMatter(lignes);
    const tete = fin >= 0 ? lignes.slice(0, fin + 1) : [];
    const corps = traiter(lignes.slice(fin + 1), { supprimerBlancsDebut: fin < 0 });
    while (corps.length && corps[corps.length - 1] === '') corps.pop();
    const tout = [...tete, ...corps];
    return tout.join('\n') + (avecFinDeLigne && tout.length ? '\n' : '');
  }

  // Sélection : étendue aux lignes entières ; renvoie { texte, from, to } avec
  // la sélection posée sur la zone reformatée. Sans effet dans le front-matter
  // ni si la sélection débute dans un bloc de code.
  function reformaterSelection(texte, from, to) {
    const a = Math.max(0, Math.min(from, to));
    const b = Math.min(texte.length, Math.max(from, to));
    const debut = texte.lastIndexOf('\n', a - 1) + 1;
    let fin = texte.indexOf('\n', b > a && texte[b - 1] === '\n' ? b - 1 : b);
    if (fin === -1) fin = texte.length;
    const avant = texte.slice(0, debut).split('\n');
    if (debut > 0) avant.pop();
    const fm = finFrontMatter(texte.split('\n'));
    if (fm >= 0 && avant.length <= fm) return { texte, from: a, to: b };
    let cloture = null;
    for (const l of avant) {
      const m = RE_CLOTURE.exec(l);
      if (!m) continue;
      if (!cloture) cloture = m[1];
      else if (m[1][0] === cloture[0] && m[1].length >= cloture.length && l.trim() === m[1]) cloture = null;
    }
    const segment = texte.slice(debut, fin).replace(/\r\n/g, '\n');
    const neuf = traiter(segment.split('\n'), { cloture }).join('\n');
    return { texte: texte.slice(0, debut) + neuf + texte.slice(fin), from: debut, to: debut + neuf.length };
  }

  return { reformater, reformaterSelection };
});

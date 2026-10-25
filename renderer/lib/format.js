// Mise en forme Markdown : fonctions pures qui agissent sur un état
// { texte, from, to } (texte complet et sélection) et renvoient le nouvel état
// au même format. Format UMD : CommonJS pour les tests node, global
// `window.mdrFormat` dans le renderer. Aucune dépendance à l'éditeur.
//
// Quand c'est naturel, une seconde application retire la mise en forme
// (gras sur du gras, titre 2 sur un titre 2, liste sur une liste…).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrFormat = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const SAUT_DE_PAGE = '<!-- pagebreak -->';

  const etat = (texte, from, to) => ({ texte, from, to });

  // Nombre de caractères identiques à `c` en fin de `s` (compterAvant) ou en
  // début de `s` (compterApres).
  function compterAvant(s, c) { let n = 0; while (n < s.length && s[s.length - 1 - n] === c) n += 1; return n; }
  function compterApres(s, c) { let n = 0; while (n < s.length && s[n] === c) n += 1; return n; }

  // ── Marques en ligne (gras, italique, barré) ────────────────────────────
  function enLigne(e, marque, vide) {
    const { texte, from, to } = e;
    const c = marque[0];
    const n = marque.length;
    const avant = texte.slice(0, from);
    const apres = texte.slice(to);
    const sel = texte.slice(from, to);
    // Retrait : marques collées autour de la sélection. Pour `*`, le nombre de
    // `*` accolés compte (gras = 2, italique = 1, les deux = 3).
    const a = compterAvant(avant, c);
    const b = compterApres(apres, c);
    const autour = c === '*' ? (n === 1 ? a % 2 === 1 && b % 2 === 1 : a >= 2 && b >= 2) : a >= n && b >= n;
    if (sel && autour) {
      return etat(texte.slice(0, from - n) + sel + texte.slice(to + n), from - n, to - n);
    }
    // Retrait : marques comprises dans la sélection.
    const ia = compterApres(sel, c);
    const ib = compterAvant(sel, c);
    const dedans = sel.length > 2 * n && (c === '*' ? (n === 1 ? ia % 2 === 1 && ib % 2 === 1 : ia >= 2 && ib >= 2) : ia >= n && ib >= n);
    if (dedans) {
      const interieur = sel.slice(n, sel.length - n);
      return etat(avant + interieur + apres, from, from + interieur.length);
    }
    const corps = sel || vide;
    return etat(avant + marque + corps + marque + apres, from + n, from + n + corps.length);
  }

  const gras = (e) => enLigne(e, '**', 'texte en gras');
  const italique = (e) => enLigne(e, '*', 'texte en italique');
  const barre = (e) => enLigne(e, '~~', 'texte barré');

  // Souligné : balises HTML <u>…</u> (Markdown n'a pas de syntaxe propre).
  function souligne(e) {
    const { texte, from, to } = e;
    const sel = texte.slice(from, to);
    const avant = texte.slice(0, from);
    const apres = texte.slice(to);
    if (sel && avant.endsWith('<u>') && apres.startsWith('</u>')) {
      return etat(avant.slice(0, -3) + sel + apres.slice(4), from - 3, to - 3);
    }
    if (sel.startsWith('<u>') && sel.endsWith('</u>') && sel.length > 7) {
      const interieur = sel.slice(3, -4);
      return etat(avant + interieur + apres, from, from + interieur.length);
    }
    const corps = sel || 'texte souligné';
    return etat(avant + '<u>' + corps + '</u>' + apres, from + 3, from + 3 + corps.length);
  }

  // ── Mise en forme par lignes (titres, listes, citation) ────────────────
  // Applique `fn(ligne, rang)` à chaque ligne touchée par la sélection ; le
  // delta de longueur de chaque ligne sert à recaler la sélection.
  function parLignes(e, fn) {
    const { texte, from, to } = e;
    const debut = texte.lastIndexOf('\n', from - 1) + 1;
    let fin = texte.indexOf('\n', to);
    if (fin < 0) fin = texte.length;
    // Une sélection qui finit exactement en début de ligne n'inclut pas cette ligne.
    if (to > from && to === texte.lastIndexOf('\n', to - 1) + 1 && fin >= to) {
      fin = to - 1;
      if (fin < debut) fin = debut;
    }
    const lignes = texte.slice(debut, fin).split('\n');
    const nouvelles = fn(lignes);
    const bloc = nouvelles.join('\n');
    const nouveauTexte = texte.slice(0, debut) + bloc + texte.slice(fin);
    const delta1 = nouvelles[0].length - lignes[0].length;
    const decalageDebut = Math.max(0, from - debut + delta1);
    const nFrom = debut + decalageDebut;
    const deltaTotal = bloc.length - (fin - debut);
    const nTo = Math.max(nFrom, Math.min(to + deltaTotal, nouveauTexte.length));
    return etat(nouveauTexte, nFrom, nTo);
  }

  function titre(niveau) {
    return (e) => parLignes(e, (lignes) => {
      const dejaTous = lignes.every((l) => { const m = /^(#{1,6})\s+/.exec(l); return m && m[1].length === niveau; });
      return lignes.map((l) => {
        const sansTitre = l.replace(/^#{1,6}\s+/, '');
        return dejaTous ? sansTitre : '#'.repeat(niveau) + ' ' + sansTitre;
      });
    });
  }
  const titre1 = titre(1);
  const titre2 = titre(2);
  const titre3 = titre(3);

  const RE_TACHE = /^(\s*)[-*+] \[[ xX]\] /;
  const RE_PUCE = /^(\s*)[-*+] (?!\[[ xX]\] )/;
  const RE_NUM = /^(\s*)\d+[.)] /;
  const RE_CITATION = /^(\s*)> ?/;

  function liste(reconnait, fabriquer) {
    return (e) => parLignes(e, (lignes) => {
      const contenu = lignes.filter((l) => l.trim() !== '');
      const cibles = contenu.length ? contenu : lignes;
      const dejaTous = cibles.every((l) => reconnait.test(l));
      let rang = 0;
      return lignes.map((l) => {
        if (l.trim() === '' && lignes.length > 1) return l;
        const nu = l.replace(RE_TACHE, '$1').replace(RE_PUCE, '$1').replace(RE_NUM, '$1');
        if (dejaTous) return nu;
        rang += 1;
        const indent = /^\s*/.exec(nu)[0];
        return indent + fabriquer(rang) + nu.slice(indent.length);
      });
    });
  }
  const puces = liste(RE_PUCE, () => '- ');
  const numerotee = liste(RE_NUM, (n) => n + '. ');
  const taches = liste(RE_TACHE, () => '- [ ] ');

  const citation = (e) => parLignes(e, (lignes) => {
    const dejaTous = lignes.every((l) => l.trim() === '' || RE_CITATION.test(l));
    return lignes.map((l) => (dejaTous ? l.replace(RE_CITATION, '$1') : (l.trim() === '' && lignes.length > 1 ? l : '> ' + l)));
  });

  // ── Insertions (lien, image, tableau, code, saut de page) ──────────────
  function lien(e) {
    const { texte, from, to } = e;
    const sel = texte.slice(from, to);
    const dejaLien = /^\[([^\]]*)\]\([^)]*\)$/.exec(sel);
    if (dejaLien) return etat(texte.slice(0, from) + dejaLien[1] + texte.slice(to), from, from + dejaLien[1].length);
    if (/^https?:\/\/\S+$/.test(sel)) {
      const ins = `[texte du lien](${sel})`;
      return etat(texte.slice(0, from) + ins + texte.slice(to), from + 1, from + 1 + 'texte du lien'.length);
    }
    if (sel) {
      const ins = `[${sel}](https://)`;
      const debutUrl = from + sel.length + 3;
      return etat(texte.slice(0, from) + ins + texte.slice(to), debutUrl, debutUrl + 'https://'.length);
    }
    const ins = '[texte du lien](https://)';
    return etat(texte.slice(0, from) + ins + texte.slice(to), from + 1, from + 1 + 'texte du lien'.length);
  }

  function image(e) {
    const { texte, from, to } = e;
    const sel = texte.slice(from, to);
    if (sel) {
      const ins = `![${sel}](images/image.png)`;
      const debutUrl = from + sel.length + 4;
      return etat(texte.slice(0, from) + ins + texte.slice(to), debutUrl, debutUrl + 'images/image.png'.length);
    }
    const ins = '![texte alternatif](images/image.png)';
    return etat(texte.slice(0, from) + ins + texte.slice(to), from + 2, from + 2 + 'texte alternatif'.length);
  }

  // Insère un bloc sur ses propres lignes, séparé du reste par une ligne vide.
  function insererBloc(e, bloc, offsetSel, longueurSel) {
    const { texte, from, to } = e;
    const avant = texte.slice(0, from);
    const apres = texte.slice(to);
    let pre = '';
    if (avant.length) pre = avant.endsWith('\n\n') ? '' : avant.endsWith('\n') ? '\n' : '\n\n';
    let suf = '';
    if (apres.length) suf = apres.startsWith('\n\n') ? '' : apres.startsWith('\n') ? '\n' : '\n\n';
    const debut = from + pre.length;
    return etat(avant + pre + bloc + suf + apres, debut + offsetSel, debut + offsetSel + longueurSel);
  }

  function tableau(e) {
    const sel = e.texte.slice(e.from, e.to);
    const premiere = sel && !sel.includes('\n') ? sel : 'Colonne 1';
    const bloc = [
      `| ${premiere} | Colonne 2 | Colonne 3 |`,
      '| --- | --- | --- |',
      '|  |  |  |',
      '|  |  |  |',
      '|  |  |  |',
    ].join('\n');
    return insererBloc(e, bloc, 2, premiere.length);
  }

  function blocCode(e) {
    const { texte, from, to } = e;
    // Déjà entre deux barrières (la sélection les contient, ou les lignes
    // voisines) : on les retire.
    const sel = texte.slice(from, to);
    const m = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(sel.trim());
    if (m) {
      const interieur = m[1];
      return etat(texte.slice(0, from) + interieur + texte.slice(to), from, from + interieur.length);
    }
    const debutLigne = texte.lastIndexOf('\n', from - 1) + 1;
    const finLigne = (() => { const i = texte.indexOf('\n', to); return i < 0 ? texte.length : i; })();
    const ligneAvantDebut = texte.lastIndexOf('\n', debutLigne - 2) + 1;
    const ligneAvant = debutLigne > 0 ? texte.slice(ligneAvantDebut, debutLigne - 1) : null;
    const ligneApres = finLigne < texte.length ? texte.slice(finLigne + 1, (() => { const i = texte.indexOf('\n', finLigne + 1); return i < 0 ? texte.length : i; })()) : null;
    if (ligneAvant !== null && ligneApres !== null && /^```/.test(ligneAvant) && ligneApres.trim() === '```') {
      const finBarriere = finLigne + 1 + ligneApres.length;
      const corps = texte.slice(debutLigne, finLigne);
      const nouveau = texte.slice(0, ligneAvantDebut) + corps + texte.slice(finBarriere);
      return etat(nouveau, ligneAvantDebut + (from - debutLigne), ligneAvantDebut + (to - debutLigne));
    }
    if (sel) {
      const bloc = '```\n' + sel + '\n```';
      return insererBloc(e, bloc, 4, sel.length);
    }
    return insererBloc(e, '```\n\n```', 4, 0);
  }

  function sautDePage(e) {
    const { texte, from, to } = e;
    // Curseur sur une ligne qui est déjà un saut de page : on l'enlève.
    const debut = texte.lastIndexOf('\n', from - 1) + 1;
    let fin = texte.indexOf('\n', to);
    if (fin < 0) fin = texte.length;
    if (texte.slice(debut, fin).trim() === SAUT_DE_PAGE) {
      let finCoupe = fin < texte.length ? fin + 1 : fin;
      // Ne laisse pas deux lignes vides : la ligne vide qui suivait est retirée aussi.
      if (texte.slice(0, debut).endsWith('\n\n') && texte[finCoupe] === '\n') finCoupe += 1;
      const nouveau = texte.slice(0, debut) + texte.slice(finCoupe);
      return etat(nouveau, debut, debut);
    }
    const r = insererBloc(e, SAUT_DE_PAGE, SAUT_DE_PAGE.length, 0);
    return r;
  }

  // Table des actions : identifiant de commande, libellé, fonction.
  const ACTIONS = [
    { id: 'format:gras', libelle: 'Gras', court: 'G', executer: gras },
    { id: 'format:italique', libelle: 'Italique', court: 'I', executer: italique },
    { id: 'format:barre', libelle: 'Barré', court: 'S', executer: barre },
    { id: 'format:souligne', libelle: 'Souligné', court: 'U', executer: souligne },
    { id: 'format:titre1', libelle: 'Titre 1', court: 'T1', executer: titre1 },
    { id: 'format:titre2', libelle: 'Titre 2', court: 'T2', executer: titre2 },
    { id: 'format:titre3', libelle: 'Titre 3', court: 'T3', executer: titre3 },
    { id: 'format:puces', libelle: 'Liste à puces', court: 'Puces', executer: puces },
    { id: 'format:numerotee', libelle: 'Liste numérotée', court: '1.', executer: numerotee },
    { id: 'format:taches', libelle: 'Liste de tâches', court: 'Tâches', executer: taches },
    { id: 'format:lien', libelle: 'Lien', court: 'Lien', executer: lien },
    { id: 'format:image', libelle: 'Image', court: 'Image', executer: image },
    { id: 'format:tableau', libelle: 'Tableau', court: 'Tableau', executer: tableau },
    { id: 'format:code', libelle: 'Bloc de code', court: 'Code', executer: blocCode },
    { id: 'format:citation', libelle: 'Citation', court: 'Citation', executer: citation },
    { id: 'format:saut-page', libelle: 'Saut de page', court: 'Saut', executer: sautDePage },
  ];

  return {
    SAUT_DE_PAGE, ACTIONS,
    gras, italique, barre, souligne, titre1, titre2, titre3, titre,
    puces, numerotee, taches, lien, image, tableau, blocCode, citation, sautDePage,
  };
});

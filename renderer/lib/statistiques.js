// Statistiques avancées d'un document Markdown, pures. Format UMD : CommonJS
// pour `node --test`, global `window.mdrStatistiques` dans le renderer.
// Le texte analysé est la prose : front-matter, blocs de code, code en ligne,
// commentaires HTML et balises sont écartés.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrStatistiques = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const MOTS_PAR_MINUTE = 230;

  const MOTS_VIDES_FR = new Set(('a au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je la le les leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y été étée étées étés étant suis es est sommes êtes sont serai sera ai as avons avez ont avait avaient aura eu être avoir fait faire plus très aussi comme si sans sous donc car ni ainsi alors cela ça ceci celui celle ceux celles dont où quand entre vers chez tout tous toute toutes autre autres peut peuvent être sera ces').split(/\s+/));
  const MOTS_VIDES_EN = new Set(('a about after all also am an and any are as at be been but by can could did do does for from had has have he her him his how i if in into is it its just me my no not of on or our out she so some than that the their them then there these they this to up us was we were what when which who will with would you your yours not very more most other over such only own same too s t').split(/\s+/));

  // Mots discriminants pour la détection de langue (avec leurs accents).
  const INDICES_FR = new Set('le la les des du une un et est que qui dans pour pas sur avec ce cette ces sont nous vous elle il ils au aux par plus mais où être avoir comme ne se en'.split(' '));
  const INDICES_EN = new Set('the and of to is in that it was for on are as with his they at be this from have or by not but what all were when we there can an your which their if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know'.split(' '));

  const RE_MOT = /[\p{L}\p{N}]+(?:['’‑-][\p{L}\p{N}]+)*/gu;

  function separerFrontMatter(source) {
    const texte = String(source || '').replace(/\r\n?/g, '\n');
    const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(texte);
    if (!m) return { meta: '', corps: texte };
    return { meta: m[1], corps: texte.slice(m[0].length) };
  }

  function langueDuFrontMatter(meta) {
    const m = /^lang(?:uage)?[ \t]*:[ \t]*["']?([A-Za-z]{2,3})/im.exec(meta || '');
    if (!m) return null;
    const code = m[1].toLowerCase();
    return code === 'fr' || code === 'fra' ? 'fr' : code === 'en' || code === 'eng' ? 'en' : code;
  }

  // Lignes de prose avec leur niveau de titre : { titre: texte|null, niveau, texte }.
  // Les blocs de code sont écartés, les titres reconnus (hors code).
  function lignesDeProse(corps) {
    const sortie = [];
    let cloture = null;
    for (const brute of corps.split('\n')) {
      const c = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(brute);
      if (cloture) { if (c && c[1][0] === cloture[0] && c[1].length >= cloture.length) cloture = null; continue; }
      if (c) { cloture = c[1]; continue; }
      if (/^(?: {4}|\t)\S/.test(brute) && sortie.length && sortie[sortie.length - 1].texte === '') continue; // code indenté
      const t = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(brute);
      if (t) { sortie.push({ titre: nettoyer(t[2]), niveau: t[1].length, texte: '' }); continue; }
      sortie.push({ titre: null, niveau: 0, texte: brute });
    }
    return sortie;
  }

  // Retire le balisage inline : code, images, liens (garde le texte), HTML, emphase.
  function nettoyer(ligne) {
    return String(ligne)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a, b) => b || a)
      .replace(/<[^>]+>/g, ' ')
      .replace(/^[ \t]*(?:>[ \t]*)+/, '')
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/, '')
      .replace(/^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/, ' ')
      .replace(/[*_~]{1,3}/g, '')
      .replace(/\|/g, ' ');
  }

  const listerMots = (texte) => (String(texte).match(RE_MOT) || []);

  function compterMotsSimple(texte) {
    return (String(texte || '').trim().match(/\S+/g) || []).length;
  }

  // Syllabes : groupes de voyelles ; « e » muet final retiré (fr : -e, -es, -ent
  // des verbes ; en : -e, -es, -ed).
  function syllabes(mot, langue) {
    let m = mot.toLowerCase().replace(/[^a-zàâäçéèêëîïôöùûüÿœæ]/g, '');
    if (!m) return 0;
    if (langue === 'fr') {
      m = m.replace(/(?<=[^aeiouyàâäéèêëîïôöùûüÿœæ])(?:es|e|ent)$/, '');
    } else {
      m = m.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^aeiouy]e)$/, (s) => s.slice(0, -(s.endsWith('es') || s.endsWith('ed') ? 2 : 1)));
      m = m.replace(/^y/, '');
    }
    const g = m.match(/[aeiouyàâäéèêëîïôöùûüÿœæ]+/g);
    return Math.max(1, g ? g.length : 1);
  }

  function nombrePhrases(textes) {
    let n = 0;
    for (const p of textes) {
      // Fin de phrase : . ! ? … (groupes), suivie d'un espace ou de la fin ; les
      // points d'un nombre (3.14), d'une abréviation collée ou d'une URL sont ignorés.
      const morceaux = String(p).replace(/(\d)[.,](\d)/g, '$1$2').replace(/\b(?:https?:\/\/|www\.)\S+/g, ' ').split(/[.!?…]+(?:["'»”)\]]*)(?=\s|$)/);
      for (const m of morceaux) if (/[\p{L}\p{N}]/u.test(m)) n++;
    }
    return n;
  }

  function detecterLangue(texte, meta) {
    const declaree = langueDuFrontMatter(meta);
    if (declaree) return { langue: declaree, source: 'front-matter' };
    const mots = listerMots(texte).map((w) => w.toLowerCase());
    if (mots.length < 5) return { langue: 'inconnue', source: 'heuristique' };
    let fr = 0; let en = 0;
    for (const w of mots) { if (INDICES_FR.has(w)) fr++; if (INDICES_EN.has(w)) en++; }
    const accents = (texte.match(/[àâçéèêëîïôùûœ]/gi) || []).length;
    fr += accents / 8;
    if (fr === en) return { langue: 'inconnue', source: 'heuristique' };
    return { langue: fr > en ? 'fr' : 'en', source: 'heuristique' };
  }

  function niveauLisibilite(indice) {
    if (indice >= 90) return 'très facile';
    if (indice >= 80) return 'facile';
    if (indice >= 70) return 'assez facile';
    if (indice >= 60) return 'standard';
    if (indice >= 50) return 'assez difficile';
    if (indice >= 30) return 'difficile';
    return 'très difficile';
  }

  // Flesch (en) : 206,835 − 1,015·mots/phrases − 84,6·syllabes/mots.
  // Kandel-Moles (fr) : 207 − 1,015·mots/phrases − 73,6·syllabes/mots.
  function lisibilite(mots, phrases, nbSyllabes, langue) {
    if (!mots || !phrases || (langue !== 'fr' && langue !== 'en')) return null;
    const mp = mots / phrases;
    const sm = nbSyllabes / mots;
    const brut = langue === 'fr' ? 207 - 1.015 * mp - 73.6 * sm : 206.835 - 1.015 * mp - 84.6 * sm;
    const indice = Math.round(brut * 10) / 10;
    return { formule: langue === 'fr' ? 'Kandel-Moles' : 'Flesch', indice, niveau: niveauLisibilite(indice) };
  }

  function frequents(mots, n) {
    // Mots vides français ET anglais, quelle que soit la langue : un texte mêle souvent les deux.
    const vides = new Set([...MOTS_VIDES_FR, ...MOTS_VIDES_EN]);
    const compte = new Map();
    for (const brut of mots) {
      const w = brut.toLowerCase().replace(/^['’-]+|['’-]+$/g, '');
      const apostrophe = w.split(/['’]/).pop(); // l'arbre -> arbre
      const mot = apostrophe || w;
      if (mot.length < 3 || /^\d+$/.test(mot) || vides.has(mot)) continue;
      compte.set(mot, (compte.get(mot) || 0) + 1);
    }
    return [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, n).map(([mot, nb]) => ({ mot, nb }));
  }

  function progression(mots, objectif) {
    if (!(objectif > 0)) return null;
    return { objectif, mots, pourcentage: Math.min(100, Math.floor((mots / objectif) * 100)), atteint: mots >= objectif };
  }

  function minutes(mots) { return Math.round((mots / MOTS_PAR_MINUTE) * 10) / 10; }

  function analyser(source, { objectif = 0, nombreFrequents = 10 } = {}) {
    const brut = String(source || '');
    const { meta, corps } = separerFrontMatter(brut);
    const lignes = lignesDeProse(corps);

    // Sections : le texte avant le premier titre forme « (début) ».
    const sections = [];
    let courante = { titre: '(début)', niveau: 0, mots: 0 };
    const paragraphes = [];
    let bloc = [];
    const fermerBloc = () => { if (bloc.length) { paragraphes.push(bloc.join(' ')); bloc = []; } };
    const tousMots = [];
    for (const l of lignes) {
      if (l.titre !== null) {
        fermerBloc();
        sections.push(courante);
        courante = { titre: l.titre, niveau: l.niveau, mots: 0 };
        const mt = listerMots(l.titre);
        courante.mots += mt.length;
        tousMots.push(...mt);
        paragraphes.push(l.titre);
        continue;
      }
      const t = nettoyer(l.texte);
      if (!l.texte.trim()) { fermerBloc(); continue; }
      const mt = listerMots(t);
      courante.mots += mt.length;
      tousMots.push(...mt);
      if (mt.length) bloc.push(t.trim());
    }
    fermerBloc();
    sections.push(courante);
    const sectionsFinal = sections
      .filter((s) => s.niveau > 0 || s.mots > 0)
      .map((s) => ({ ...s, minutes: minutes(s.mots) }));

    const prose = paragraphes.join('\n');
    const { langue, source: sourceLangue } = detecterLangue(prose, meta);
    // Les titres ne comptent pas comme phrases : on calcule sur les seuls paragraphes de texte.
    const titres = new Set(lignes.filter((l) => l.titre !== null).map((l) => l.titre));
    const textesPhrases = paragraphes.filter((p) => !titres.has(p));
    const nbPhrases = nombrePhrases(textesPhrases);
    const motsTexte = textesPhrases.reduce((s, p) => s + listerMots(p).length, 0);
    const nbSyll = textesPhrases.reduce((s, p) => s + listerMots(p).reduce((x, w) => x + syllabes(w, langue === 'fr' ? 'fr' : 'en'), 0), 0);

    const motsTotal = tousMots.length;
    return {
      mots: motsTotal,
      motsSimples: compterMotsSimple(brut),
      caracteres: brut.length,
      phrases: nbPhrases,
      paragraphes: textesPhrases.length,
      langue,
      sourceLangue,
      lisibilite: lisibilite(motsTexte, nbPhrases, nbSyll, langue),
      tempsLecture: minutes(motsTotal),
      sections: sectionsFinal,
      frequents: frequents(tousMots, nombreFrequents),
      objectif: progression(compterMotsSimple(brut), objectif),
    };
  }

  return { MOTS_PAR_MINUTE, analyser, compterMotsSimple, progression, syllabes, detecterLangue, separerFrontMatter, lisibilite, niveauLisibilite };
});

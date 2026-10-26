// Diff ligne à ligne (plus longue sous-suite commune), pur. Format UMD :
// CommonJS pour `node --test`, global `window.mdrDiff` dans le renderer.
// Résultat : [{ type: '=' | '+' | '-', texte, ancien?, nouveau? }] où `ancien`
// et `nouveau` sont les numéros de ligne (à partir de 1) dans chaque texte.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrDiff = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  // Au-delà, la table de la LCS coûterait trop : repli « tout remplacé ».
  const CELLULES_MAX = 4000000;

  const lignes = (s) => (s === '' || s == null ? [] : String(s).replace(/\r\n?/g, '\n').split('\n'));

  function diffLignes(avant, apres) {
    const a = lignes(avant);
    const b = lignes(apres);
    let debut = 0;
    while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++;
    let fa = a.length;
    let fb = b.length;
    while (fa > debut && fb > debut && a[fa - 1] === b[fb - 1]) { fa--; fb--; }

    const milieuA = a.slice(debut, fa);
    const milieuB = b.slice(debut, fb);
    const n = milieuA.length;
    const m = milieuB.length;
    const ops = [];
    for (let i = 0; i < debut; i++) ops.push(['=', a[i], i + 1, i + 1]);

    const milieu = [];
    if (n * m > CELLULES_MAX) {
      milieuA.forEach((t, i) => milieu.push(['-', t, debut + i + 1, 0]));
      milieuB.forEach((t, j) => milieu.push(['+', t, 0, debut + j + 1]));
    } else {
      const w = m + 1;
      const t = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          t[i * w + j] = milieuA[i] === milieuB[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && milieuA[i] === milieuB[j]) { milieu.push(['=', milieuA[i], debut + i + 1, debut + j + 1]); i++; j++; }
        else if (i < n && (j >= m || t[(i + 1) * w + j] >= t[i * w + j + 1])) { milieu.push(['-', milieuA[i], debut + i + 1, 0]); i++; }
        else { milieu.push(['+', milieuB[j], 0, debut + j + 1]); j++; }
      }
    }
    ops.push(...milieu);
    for (let k = 0; k < a.length - fa; k++) ops.push(['=', a[fa + k], fa + k + 1, fb + k + 1]);

    return ops.map(([type, texte, ancien, nouveau]) => {
      const o = { type, texte };
      if (ancien) o.ancien = ancien;
      if (nouveau) o.nouveau = nouveau;
      return o;
    });
  }

  function resume(d) {
    return { ajouts: d.filter((x) => x.type === '+').length, suppressions: d.filter((x) => x.type === '-').length };
  }

  return { diffLignes, resume };
});

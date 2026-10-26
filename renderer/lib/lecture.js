// Mode présentation lecture : calculs purs du défilement automatique et des
// réglages (taille du texte, vitesse). Format UMD : CommonJS pour `node --test`,
// global `window.mdrLecture` dans le renderer.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrLecture = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAILLE = { min: 12, max: 56, defaut: 20, pas: 2 };
  // Vitesses de 1 à 10, en pixels par seconde.
  const VITESSES = [8, 16, 26, 38, 52, 70, 92, 120, 160, 210];
  const VITESSE = { min: 1, max: VITESSES.length, defaut: 3 };
  const DELAI_MASQUAGE_MS = 2500;

  const borner = (v, a, b) => Math.min(b, Math.max(a, v));

  function ajusterTaille(taille, delta) {
    const t = Number.isFinite(taille) ? taille : TAILLE.defaut;
    return borner(Math.round(t + delta * TAILLE.pas), TAILLE.min, TAILLE.max);
  }

  function ajusterVitesse(niveau, delta) {
    const n = Number.isFinite(niveau) ? niveau : VITESSE.defaut;
    return borner(Math.round(n + delta), VITESSE.min, VITESSE.max);
  }

  const pixelsParSeconde = (niveau) => VITESSES[borner(Math.round(niveau), VITESSE.min, VITESSE.max) - 1];

  // Position flottante (le navigateur arrondit scrollTop, d'où l'accumulation
  // côté appelant) après `dtMs` à la vitesse `niveau`. `fini` : fin atteinte.
  // Un `dtMs` aberrant (onglet en veille) est plafonné à 250 ms.
  function avancer(position, niveau, dtMs, maximum) {
    const max = Math.max(0, Number.isFinite(maximum) ? maximum : 0);
    const dt = borner(Number.isFinite(dtMs) ? dtMs : 0, 0, 250);
    const pos = borner(Number.isFinite(position) ? position : 0, 0, max);
    const suivante = Math.min(max, pos + (pixelsParSeconde(niveau) * dt) / 1000);
    return { position: suivante, fini: suivante >= max };
  }

  const barreVisible = (derniereActiviteMs, maintenantMs, delai = DELAI_MASQUAGE_MS) => maintenantMs - derniereActiviteMs < delai;

  // Temps restant estimé (secondes) pour atteindre la fin.
  function tempsRestant(position, niveau, maximum) {
    const reste = Math.max(0, maximum - position);
    return Math.ceil(reste / pixelsParSeconde(niveau));
  }

  return { TAILLE, VITESSE, VITESSES, DELAI_MASQUAGE_MS, ajusterTaille, ajusterVitesse, pixelsParSeconde, avancer, barreVisible, tempsRestant };
});

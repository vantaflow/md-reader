// Mode présentation lecture : l'aperçu en plein écran pour lire ou présenter,
// distinct du diaporama (pas de découpage en slides). Texte ajustable (A− / A+,
// touches − et +), défilement automatique à vitesse réglable (lecture/pause :
// Espace ; vitesse : flèches), Échap pour sortir. La barre de contrôle se masque
// après 2,5 s sans activité et réapparaît au moindre mouvement. Les calculs
// vivent dans renderer/lib/lecture.js. Rien n'est mémorisé.
(() => {
  const lib = window.mdrLecture;
  const corps = document.body;
  const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };
  const apercu = () => window.mdr.apercu();

  let actif = false;
  let enLecture = false;
  let taille = lib.TAILLE.defaut;
  let vitesse = lib.VITESSE.defaut;
  let position = 0;
  let dernierPosee = 0;
  let boucle = null;
  let dernierTemps = 0;
  let derniereActivite = 0;
  let minuteur = null;
  let barre = null;
  let libelleTaille; let libelleVitesse; let boutonLecture;

  function appliquerTaille() {
    apercu().style.setProperty('--apercu-taille', taille + 'px');
    if (libelleTaille) libelleTaille.textContent = taille + ' px';
  }

  function majBarre() {
    if (!barre) return;
    libelleVitesse.textContent = 'Vitesse ' + vitesse + '/' + lib.VITESSE.max;
    boutonLecture.textContent = enLecture ? '⏸ Pause' : '▶ Lecture';
    boutonLecture.setAttribute('aria-pressed', String(enLecture));
  }

  function montrerBarre() {
    if (!barre) return;
    derniereActivite = Date.now();
    barre.classList.remove('masquee');
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { if (actif && !lib.barreVisible(derniereActivite, Date.now())) barre.classList.add('masquee'); }, lib.DELAI_MASQUAGE_MS);
  }

  function construire() {
    barre = el('div', 'lecture-barre');
    barre.id = 'lecture-barre';
    barre.setAttribute('role', 'toolbar');
    barre.setAttribute('aria-label', 'Mode présentation lecture');
    const bouton = (id, texte, titre, action) => {
      const b = el('button', undefined, texte);
      b.type = 'button'; b.id = id; b.title = titre;
      b.addEventListener('click', (e) => { e.stopPropagation(); action(); montrerBarre(); });
      return b;
    };
    libelleTaille = el('span', 'lecture-etiquette');
    libelleTaille.id = 'lecture-taille';
    libelleVitesse = el('span', 'lecture-etiquette');
    libelleVitesse.id = 'lecture-vitesse';
    boutonLecture = bouton('lecture-play', '▶ Lecture', 'Lecture / pause (Espace)', () => basculerLecture());
    barre.append(
      bouton('lecture-a-moins', 'A−', 'Texte plus petit (−)', () => changerTaille(-1)),
      libelleTaille,
      bouton('lecture-a-plus', 'A+', 'Texte plus grand (+)', () => changerTaille(1)),
      el('span', 'lecture-sep'),
      bouton('lecture-moins', '«', 'Plus lent (←)', () => changerVitesse(-1)),
      libelleVitesse,
      bouton('lecture-plus', '»', 'Plus rapide (→)', () => changerVitesse(1)),
      boutonLecture,
      el('span', 'lecture-sep'),
      bouton('lecture-quitter', 'Quitter', 'Quitter (Échap)', () => fermer()),
    );
    document.body.appendChild(barre);
  }

  const maximum = () => Math.max(0, apercu().scrollHeight - apercu().clientHeight);

  function changerTaille(delta) {
    if (!actif) return taille;
    // Le texte change de hauteur : on garde la même proportion du document.
    const ratio = maximum() ? apercu().scrollTop / maximum() : 0;
    taille = lib.ajusterTaille(taille, delta);
    appliquerTaille();
    apercu().scrollTop = ratio * maximum();
    position = apercu().scrollTop;
    dernierPosee = apercu().scrollTop;
    return taille;
  }

  function changerVitesse(delta) {
    if (!actif) return vitesse;
    vitesse = lib.ajusterVitesse(vitesse, delta);
    majBarre();
    return vitesse;
  }

  // Un pas de défilement de `dtMs` : séparé de la boucle pour être contrôlable
  // (une fenêtre cachée ne reçoit pas requestAnimationFrame).
  function etape(dtMs) {
    if (!actif || !enLecture) return false;
    const p = apercu();
    // Défilement manuel (molette, barre) entre deux pas : on repart de là.
    if (Math.abs(p.scrollTop - dernierPosee) > 2) position = p.scrollTop;
    const r = lib.avancer(position, vitesse, dtMs, maximum());
    position = r.position;
    p.scrollTop = position;
    dernierPosee = p.scrollTop;
    if (r.fini) { pause(); return false; }
    return true;
  }

  function tic(t) {
    if (!enLecture) return;
    etape(dernierTemps ? t - dernierTemps : 0);
    dernierTemps = t;
    boucle = requestAnimationFrame(tic);
  }

  function lecture() {
    if (!actif || enLecture) return false;
    if (maximum() - apercu().scrollTop < 1) { apercu().scrollTop = 0; } // relancer depuis le début
    position = apercu().scrollTop;
    dernierPosee = position;
    enLecture = true;
    dernierTemps = 0;
    majBarre();
    boucle = requestAnimationFrame(tic);
    return true;
  }

  function pause() {
    if (!enLecture) return false;
    enLecture = false;
    if (boucle) cancelAnimationFrame(boucle);
    boucle = null;
    majBarre();
    return true;
  }

  const basculerLecture = () => (enLecture ? pause() : lecture());

  function ouvrir() {
    if (actif) return true;
    if (window.mdr.diaporama && window.mdr.diaporama.estOuvert()) return false;
    if (!barre) construire();
    window.mdr.modes.entrer('apercu');
    actif = true;
    corps.classList.add('lecture-actif');
    taille = lib.TAILLE.defaut;
    appliquerTaille();
    apercu().scrollTop = 0;
    position = 0;
    dernierPosee = 0;
    majBarre();
    montrerBarre();
    return true;
  }

  function fermer() {
    if (!actif) return false;
    pause();
    actif = false;
    clearTimeout(minuteur);
    corps.classList.remove('lecture-actif');
    // La taille de l'aperçu revient à celle des réglages.
    apercu().style.setProperty('--apercu-taille', window.mdr.reglages.get('tailleApercu') + 'px');
    window.mdr.modes.sortir();
    return true;
  }

  // Touches : captées avant l'éditeur, la palette et les autres couches.
  document.addEventListener('keydown', (e) => {
    if (!actif || e.metaKey || e.ctrlKey || e.altKey) return;
    if (window.mdr.modale && window.mdr.modale.nombreOuvertes() > 0) return;
    montrerBarre();
    const k = e.key;
    let gere = true;
    if (k === 'Escape') fermer();
    else if (k === '+' || k === '=') changerTaille(1);
    else if (k === '-' || k === '_') changerTaille(-1);
    else if (k === ' ') basculerLecture();
    else if (k === 'ArrowRight' || k === 'ArrowUp') changerVitesse(1);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') changerVitesse(-1);
    else gere = false;
    if (gere) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  document.addEventListener('mousemove', () => { if (actif) montrerBarre(); });
  document.addEventListener('click', () => { if (actif) montrerBarre(); });

  const tab = window.mdrRaccourcis;
  const accel = tab.afficher(tab.parId('vue:lecture')?.accel, window.api && window.api.platform) || undefined;
  window.commands.register({ id: 'vue:lecture', titre: 'Mode présentation lecture', raccourci: accel, executer: () => (actif ? fermer() : ouvrir()) });
  window.mdr = window.mdr || {};
  window.mdr.lecture = {
    ouvrir, fermer, lecture, pause, basculerLecture, changerTaille, changerVitesse, etape,
    estOuvert: () => actif,
    enLecture: () => enLecture,
    taille: () => taille,
    vitesse: () => vitesse,
    barreVisible: () => !!barre && !barre.classList.contains('masquee'),
  };
})();

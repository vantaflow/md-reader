// Mode diaporama : `---` seul sur une ligne sépare les slides (renderer/lib/
// diaporama.js). Vue plein écran avec le rendu Markdown d'une slide à la fois ;
// flèches, espace, PageUp/PageDown, Début/Fin pour naviguer, `G` pour les
// vignettes, Échap pour sortir. L'export PDF des slides (une par page, 16:9)
// passe par le chemin d'export PDF existant avec une page sur mesure.
(() => {
  const lib = window.mdrDiaporama;
  const r = () => window.mdr.rendu;
  const corps = document.body;
  const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };

  let racine = null;
  let scene = null;
  let slideEl = null;
  let numeroEl = null;
  let vignettesEl = null;
  let slides = [];
  let index = 0;
  let ouvert = false;

  function construire() {
    racine = el('div', 'hidden');
    racine.id = 'diaporama';
    racine.setAttribute('role', 'dialog');
    racine.setAttribute('aria-label', 'Diaporama');
    scene = el('div', 'diapo-scene');
    slideEl = el('div', 'diapo-slide markdown-body');
    scene.appendChild(slideEl);
    numeroEl = el('div', 'diapo-compteur');
    numeroEl.id = 'diaporama-numero';
    vignettesEl = el('div', 'diapo-vignettes hidden');
    vignettesEl.id = 'diaporama-vignettes';
    racine.append(scene, numeroEl, vignettesEl);
    // Un clic dans le tiers gauche recule, ailleurs avance.
    scene.addEventListener('click', (e) => {
      const b = scene.getBoundingClientRect();
      if (e.clientX - b.left < b.width / 3) aller(index - 1); else aller(index + 1);
    });
    document.body.appendChild(racine);
  }

  const rendreSlide = (markdown) => r().rendreMarkdown(markdown).innerHTML;

  function afficher() {
    slideEl.innerHTML = rendreSlide(slides[index]);
    numeroEl.textContent = `${index + 1} / ${slides.length}`;
    if (!vignettesEl.classList.contains('hidden')) marquerVignette();
  }

  function aller(i) {
    if (!ouvert || !slides.length) return false;
    const cible = Math.max(0, Math.min(slides.length - 1, i));
    if (cible === index && slideEl.innerHTML) return false;
    index = cible;
    afficher();
    return true;
  }

  function marquerVignette() {
    vignettesEl.querySelectorAll('.diapo-vignette').forEach((v, i) => v.classList.toggle('actif', i === index));
  }

  // Aperçu en vignettes : toutes les slides en petit, un clic y saute.
  function vignettes(actif) {
    if (!ouvert) return false;
    const veut = actif === undefined ? vignettesEl.classList.contains('hidden') : !!actif;
    vignettesEl.classList.toggle('hidden', !veut);
    if (veut) {
      vignettesEl.textContent = '';
      slides.forEach((md, i) => {
        const v = el('button', 'diapo-vignette');
        v.type = 'button';
        v.dataset.index = String(i);
        const contenu = el('div', 'diapo-vignette-contenu markdown-body');
        contenu.innerHTML = rendreSlide(md);
        v.append(contenu, el('span', 'diapo-vignette-numero', String(i + 1)));
        v.addEventListener('click', (e) => { e.stopPropagation(); vignettes(false); aller(i); });
        vignettesEl.appendChild(v);
      });
      marquerVignette();
    }
    return veut;
  }

  function pleinEcran(veut) {
    try {
      const p = window.api && window.api.pleinEcran && window.api.pleinEcran(veut);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* sans importance */ }
  }

  function ouvrir() {
    if (ouvert) return true;
    const { slides: liste } = lib.decouper(r().sourceActive());
    if (!liste.length) { r().annoncer('Aucune slide à présenter : le document est vide.'); return false; }
    slides = liste;
    index = 0;
    if (!racine) construire();
    ouvert = true;
    vignettesEl.classList.add('hidden');
    corps.classList.add('diaporama-actif');
    racine.classList.remove('hidden');
    afficher();
    pleinEcran(true);
    return true;
  }

  function fermer() {
    if (!ouvert) return false;
    ouvert = false;
    racine.classList.add('hidden');
    corps.classList.remove('diaporama-actif');
    slideEl.textContent = '';
    pleinEcran(false);
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (ed) ed.focus();
    return true;
  }

  // Touches : captées avant l'éditeur, la palette et les autres couches tant que
  // le diaporama est ouvert.
  document.addEventListener('keydown', (e) => {
    if (!ouvert || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const suivant = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
    const precedent = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
    let gere = true;
    if (suivant.includes(k)) aller(index + 1);
    else if (precedent.includes(k)) aller(index - 1);
    else if (k === 'Home') aller(0);
    else if (k === 'End') aller(slides.length - 1);
    else if (k === 'g' || k === 'G') vignettes();
    else if (k === 'Escape') { if (!vignettesEl.classList.contains('hidden')) vignettes(false); else fermer(); }
    else gere = false;
    if (gere) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ── Export PDF des slides ──────────────────────────────────────────────────
  // HTML et options séparés de l'envoi pour pouvoir être contrôlés sans dialogue.
  async function construirePdf() {
    const { slides: liste } = lib.decouper(r().sourceActive());
    if (!liste.length) return null;
    const [css, katexCss, hljsCss] = await Promise.all([
      fetch('styles.css').then((x) => x.text()),
      typeof loadKatexCss === 'function' ? loadKatexCss() : '',
      fetch(document.getElementById('hljs-theme').href).then((x) => x.text()).catch(() => ''),
    ]);
    const t = window.mdr.onglets.actif();
    const base = t && t.path ? `<base href="${r().urlFichier(r().dossierDe(t.path) + '/')}">` : '';
    const html = lib.htmlPdf({ titre: r().nomDocument(), slides: liste.map(rendreSlide), css: css + katexCss + hljsCss, base });
    return { html, options: lib.optionsPdf(), nombre: liste.length };
  }

  async function exporterPdf() {
    try {
      const doc = await construirePdf();
      if (!doc) { r().annoncer('Aucune slide à exporter.'); return null; }
      const sortie = await window.api.exportPdf({ html: doc.html, defaultName: r().nomDocument() + '-slides', options: doc.options });
      if (sortie) r().annoncer('Slides PDF : ' + sortie.split(/[\\/]/).pop());
      return sortie;
    } catch (e) {
      r().annoncer('Export des slides impossible : ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  const tab = window.mdrRaccourcis;
  const accel = tab.afficher(tab.parId('vue:diaporama')?.accel, window.api && window.api.platform) || undefined;
  window.commands.register({ id: 'vue:diaporama', titre: 'Démarrer le diaporama', raccourci: accel, executer: () => (ouvert ? fermer() : ouvrir()) });
  window.commands.register({ id: 'export:diaporama-pdf', titre: 'Exporter les slides en PDF', executer: exporterPdf });
  window.mdr.diaporama = {
    ouvrir, fermer, aller, vignettes, construirePdf, exporterPdf,
    estOuvert: () => ouvert,
    courant: () => index,
    total: () => slides.length,
  };
})();

// Panneau Plan du document (onglet « Plan » de la barre latérale) : liste des
// sections du texte source (lib/plan.js), indentée par niveau. Un clic place le
// curseur de l'éditeur et fait défiler l'aperçu jusqu'à la section ; la section
// qui contient le curseur est surlignée ; glisser une entrée sur une autre
// déplace la section (sous-sections comprises) dans le texte, en une seule
// transaction annulable.
(() => {
  const lib = window.mdrPlan;
  let sections = [];
  let elements = [];       // éléments de l'aperçu associés à chaque section (ou null)
  let boutons = [];
  let indiceCourant = -1;
  let source = null;       // indice de la section en cours de glissement
  let cibleDepot = null;   // { indice, position }

  const conteneur = () => document.getElementById('toc');
  // Le premier rendu a lieu avant que renderer.js n'expose `window.mdr.editeur`.
  const editeur = () => (window.mdr.editeur ? window.mdr.editeur() : null);

  // Texte comparable d'un titre source et d'un titre rendu (marques Markdown retirées).
  const comparable = (t) => String(t).toLowerCase().replace(/[*_`~\[\]()<>#\\]/g, '').replace(/\s+/g, ' ').trim();

  // Associe chaque section aux titres de l'aperçu : par rang quand les deux
  // listes ont la même taille, sinon par texte en suivant l'ordre du document.
  function associer(secs, titres) {
    if (secs.length === titres.length) return titres.map((h) => h.el);
    let j = 0;
    return secs.map((s) => {
      for (let k = j; k < titres.length; k += 1) {
        if (comparable(titres[k].text) === comparable(s.titre)) { j = k + 1; return titres[k].el; }
      }
      return null;
    });
  }

  function surligner(ligneZero) {
    const i = lib.sectionCourante(sections, ligneZero);
    if (i === indiceCourant) return;
    if (boutons[indiceCourant]) boutons[indiceCourant].classList.remove('courante');
    indiceCourant = i;
    if (boutons[i]) boutons[i].classList.add('courante');
  }

  function aller(i) {
    const s = sections[i];
    if (!s) return;
    const ed = editeur();
    const apercu = window.mdr.apercu();
    // Éditeur et aperçu défilent chacun jusqu'à la section : la synchronisation
    // proportionnelle est suspendue le temps du saut, sinon elle défait l'un des deux.
    if (window.mdr.synchro) window.mdr.synchro.suspendre(400);
    if (ed) ed.aLaLigne(s.ligne + 1);
    const el = elements[i];
    if (el && el.isConnected) {
      const haut = el.getBoundingClientRect().top - apercu.getBoundingClientRect().top + apercu.scrollTop - 8;
      apercu.scrollTo({ top: Math.max(0, haut), behavior: 'auto' });
    }
    surligner(s.ligne);
  }

  function effacerIndicateurs() {
    for (const b of boutons) b.classList.remove('depot-avant', 'depot-apres', 'glisse');
    cibleDepot = null;
  }

  // Dépose : recalcule les sections sur le texte courant (il a pu changer depuis
  // la construction du panneau) et déplace en une seule transaction.
  function deposer(indiceCible, position) {
    const ed = editeur();
    if (!ed || source === null) return false;
    const origine = sections[source];
    const avant = ed.getValue();
    const frais = lib.extraireSections(avant);
    if (!origine || !frais[source] || frais[source].titre !== origine.titre || !frais[indiceCible]) return false;
    const r = lib.deplacer(avant, source, indiceCible, position);
    if (!r.change) return false;
    const p = lib.plageModifiee(avant, r.texte);
    ed.remplacerPlage(p.from, p.to, p.insert);
    return true;
  }

  function brancherGlisser(bouton, i) {
    bouton.draggable = true;
    bouton.addEventListener('dragstart', (e) => {
      source = i;
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* sans importance */ } }
      bouton.classList.add('glisse');
    });
    bouton.addEventListener('dragover', (e) => {
      if (source === null) return;
      // Les dépôts de fichiers de l'application (aperçu « Déposer… ») ne doivent pas voir ce glissement.
      e.stopPropagation();
      const s = sections[source];
      const c = sections[i];
      const dansSource = c.debut >= s.debut && c.debut < s.fin;
      for (const b of boutons) b.classList.remove('depot-avant', 'depot-apres');
      if (dansSource) { cibleDepot = null; return; }
      e.preventDefault();
      const r = bouton.getBoundingClientRect();
      const position = e.clientY < r.top + r.height / 2 ? 'avant' : 'apres';
      cibleDepot = { indice: i, position };
      bouton.classList.add(position === 'avant' ? 'depot-avant' : 'depot-apres');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    bouton.addEventListener('drop', (e) => {
      if (source === null) return;
      e.preventDefault();
      e.stopPropagation();
      const r = bouton.getBoundingClientRect();
      const position = cibleDepot && cibleDepot.indice === i ? cibleDepot.position : (e.clientY < r.top + r.height / 2 ? 'avant' : 'apres');
      const dansSource = sections[i].debut >= sections[source].debut && sections[i].debut < sections[source].fin;
      if (!dansSource) deposer(i, position);
      effacerIndicateurs();
      source = null;
    });
    bouton.addEventListener('dragend', () => { effacerIndicateurs(); source = null; });
  }

  // Appelé par le rendu de l'aperçu avec la liste de ses titres.
  function construire(titres) {
    const ed = editeur();
    const texte = ed ? ed.getValue() : '';
    sections = lib.extraireSections(texte);
    const zone = conteneur();
    zone.textContent = '';
    boutons = [];
    indiceCourant = -1;
    if (!sections.length) {
      // Aucun titre ATX (titres soulignés, HTML) : plan de l'aperçu seul, sans glisser-déposer.
      elements = titres.map((h) => h.el);
      sections = titres.map((h, i) => ({ niveau: h.level, titre: h.text, ligne: -1, debut: 0, fin: 0, indice: i }));
      titres.forEach((h, i) => {
        const a = document.createElement('a');
        a.href = '#' + h.id;
        a.className = 'plan-item h' + h.level;
        a.textContent = h.text;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const apercu = window.mdr.apercu();
          apercu.scrollTo({ top: Math.max(0, h.el.getBoundingClientRect().top - apercu.getBoundingClientRect().top + apercu.scrollTop - 8), behavior: 'auto' });
        });
        zone.appendChild(a);
        boutons.push(a);
      });
      sections = [];
      return;
    }
    elements = associer(sections, titres);
    sections.forEach((s, i) => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'plan-item h' + s.niveau;
      a.dataset.indice = String(i);
      a.dataset.ligne = String(s.ligne + 1);
      a.title = s.titre;
      a.textContent = s.titre || '(sans titre)';
      a.addEventListener('click', (e) => { e.preventDefault(); aller(i); });
      brancherGlisser(a, i);
      zone.appendChild(a);
      boutons.push(a);
    });
    if (ed) surligner(ed.view.state.doc.lineAt(ed.view.state.selection.main.head).number - 1);
  }

  window.mdr = window.mdr || {};
  window.mdr.plan = {
    construire,
    // Appelé à chaque déplacement du curseur (ligne 1-based).
    curseur: (ligne) => surligner(ligne - 1),
    sections: () => sections.slice(),
  };
})();

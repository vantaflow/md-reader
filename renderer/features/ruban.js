// Ruban de type Word au-dessus du mode Document : trois onglets.
//   Accueil      : annuler / rétablir, police, taille, gras / italique / souligné /
//                  barré, couleur, surlignage, listes, retraits, alignement, styles,
//                  effacer la mise en forme ;
//   Insertion    : tableau (choix de taille), image, diagramme, lien, saut de page,
//                  ligne horizontale, symbole / emoji, sommaire, note de bas de
//                  page, formule, encadré ;
//   Mise en page : format, marges, orientation, en-tête, pied de page, numéros de
//                  page (mêmes réglages que l'export PDF et l'aperçu A4), styles du
//                  document (front-matter).
// Chaque bouton agit sur le contrôleur de la page (renderer/document/editeur.js).
(() => {
  const reglages = window.mdrSettings;
  const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };

  const POLICES = [
    ['', 'Police du document'], ['Arial, sans-serif', 'Arial'], ['Calibri, sans-serif', 'Calibri'], ['Cambria, serif', 'Cambria'],
    ['Courier New, monospace', 'Courier New'], ['Garamond, serif', 'Garamond'], ['Georgia, serif', 'Georgia'], ['Helvetica, sans-serif', 'Helvetica'],
    ['Segoe UI, sans-serif', 'Segoe UI'], ['Times New Roman, serif', 'Times New Roman'], ['Trebuchet MS, sans-serif', 'Trebuchet MS'], ['Verdana, sans-serif', 'Verdana'],
  ];
  const TAILLES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];
  const COULEURS = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
    '#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47',
  ];
  const SYMBOLES = '© ® ™ § ¶ † ‡ • … – — « » “ ” ‘ ’ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∆ Ω π µ € £ ¥ ¢ ← → ↑ ↓ ↔ ⇒ ⇔ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ ☎ ✉ ⚠ ☑ ☐ ½ ¼ ¾ ² ³ ¹ α β γ δ λ θ σ φ ψ'.split(' ');
  const EMOJIS = '😀 😄 😂 🙂 😉 😊 😍 😎 🤔 😢 😭 😡 👍 👎 👏 🙏 💪 👀 🎉 ✨ 🔥 ⭐ 💡 ✅ ❌ ❗ ❓ ⚠️ 📌 📎 📅 📝 📊 📈 📉 📁 📄 🔒 🔑 ⚙️ 🔧 🚀 🏁 🎯 ⏰ 💬 📧 🌍 ❤️ 💯'.split(' ');

  let ruban = null;
  let ctrl = null;
  let popup = null;
  let planifie = 0;
  const refs = {};

  // ───────────────────────── Fabriques ─────────────────────────

  function fermerPopup() { if (popup) { popup.remove(); popup = null; } }
  document.addEventListener('mousedown', (e) => { if (popup && !popup.contains(e.target) && !(popup._ancre && popup._ancre.contains(e.target))) fermerPopup(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popup) { fermerPopup(); e.stopPropagation(); } }, true);

  function ouvrirPopup(ancre, contenu, id) {
    const dejaLa = popup && popup._ancre === ancre;
    fermerPopup();
    if (dejaLa) return null;
    popup = el('div', 'ruban-popup');
    if (id) popup.id = id;
    popup._ancre = ancre;
    popup.appendChild(contenu);
    document.body.appendChild(popup);
    const r = ancre.getBoundingClientRect();
    const p = popup.getBoundingClientRect();
    popup.style.left = Math.max(4, Math.min(r.left, window.innerWidth - p.width - 4)) + 'px';
    popup.style.top = (r.bottom + 2) + 'px';
    return popup;
  }

  function bouton({ cmd, libelle, titre, classe = '', action, marque }) {
    const b = el('button', 'ruban-btn ' + classe);
    b.type = 'button';
    b.dataset.cmd = cmd;
    if (marque) b.dataset.marque = marque;
    b.title = titre || libelle;
    b.setAttribute('aria-label', titre || libelle);
    if (libelle instanceof Node) b.appendChild(libelle); else b.textContent = libelle;
    // Garde la sélection et le focus de la page.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.preventDefault(); fermerPopup(); action(b); });
    refs[cmd] = b;
    return b;
  }

  function selecteur({ cmd, titre, options, change, classe = '' }) {
    const s = el('select', 'ruban-select ' + classe);
    s.dataset.cmd = cmd;
    s.title = titre;
    s.setAttribute('aria-label', titre);
    for (const [v, l] of options) { const o = el('option', undefined, l); o.value = v; s.appendChild(o); }
    s.addEventListener('change', () => { change(s.value, s); ctrl.focus(); });
    refs[cmd] = s;
    return s;
  }

  function groupe(titre, ...enfants) {
    const g = el('div', 'ruban-groupe');
    const corps = el('div', 'ruban-groupe-corps');
    corps.append(...enfants);
    g.append(corps, el('div', 'ruban-groupe-titre', titre));
    return g;
  }

  const sep = () => el('span', 'ruban-sep');

  // ───────────────────────── Palettes ─────────────────────────

  function paletteCouleurs(ancre, { auCouleur, auAucune, libelleAucune }) {
    const c = el('div', 'palette-couleurs');
    const grille = el('div', 'palette-grille');
    for (const col of COULEURS) {
      const s = el('button', 'palette-case');
      s.type = 'button';
      s.style.background = col;
      s.title = col;
      s.dataset.couleur = col;
      s.addEventListener('mousedown', (e) => e.preventDefault());
      s.addEventListener('click', () => { fermerPopup(); auCouleur(col); });
      grille.appendChild(s);
    }
    c.appendChild(grille);
    const aucune = el('button', 'palette-lien', libelleAucune);
    aucune.type = 'button';
    aucune.dataset.couleur = 'aucune';
    aucune.addEventListener('mousedown', (e) => e.preventDefault());
    aucune.addEventListener('click', () => { fermerPopup(); auAucune(); });
    const autre = el('label', 'palette-lien', 'Autre couleur… ');
    const champ = el('input');
    champ.type = 'color';
    champ.addEventListener('change', () => { fermerPopup(); auCouleur(champ.value); });
    autre.appendChild(champ);
    c.append(aucune, autre);
    return ouvrirPopup(ancre, c, 'ruban-palette');
  }

  function grilleSymboles(ancre) {
    const c = el('div', 'palette-symboles');
    for (const [titre, liste] of [['Symboles', SYMBOLES], ['Emoji', EMOJIS]]) {
      c.appendChild(el('div', 'palette-titre', titre));
      const g = el('div', 'palette-grille symboles');
      for (const s of liste) {
        const b = el('button', 'palette-symbole', s);
        b.type = 'button';
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => { fermerPopup(); ctrl.insererTexte(s); });
        g.appendChild(b);
      }
      c.appendChild(g);
    }
    return ouvrirPopup(ancre, c, 'ruban-symboles');
  }

  function grilleTableau(ancre) {
    const LIGNES = 8;
    const COLS = 8;
    const c = el('div', 'palette-tableau');
    const etiquette = el('div', 'palette-titre', 'Insérer un tableau');
    const g = el('div', 'tableau-grille');
    const cases = [];
    const survol = (l, k) => { cases.forEach((x) => x.classList.toggle('sel', x._l <= l && x._c <= k)); etiquette.textContent = `${l} × ${k} (lignes × colonnes)`; };
    for (let l = 1; l <= LIGNES; l += 1) {
      for (let k = 1; k <= COLS; k += 1) {
        const x = el('button', 'tableau-case');
        x.type = 'button';
        x._l = l; x._c = k;
        x.dataset.lignes = String(l); x.dataset.colonnes = String(k);
        x.setAttribute('aria-label', `${l} lignes, ${k} colonnes`);
        x.addEventListener('mouseenter', () => survol(l, k));
        x.addEventListener('mousedown', (e) => e.preventDefault());
        x.addEventListener('click', () => { fermerPopup(); ctrl.insererTableau(l, k); });
        g.appendChild(x);
        cases.push(x);
      }
    }
    g.style.gridTemplateColumns = `repeat(${COLS}, 18px)`;
    c.append(etiquette, g);
    return ouvrirPopup(ancre, c, 'ruban-tableau');
  }

  // ───────────────────────── Onglets ─────────────────────────

  function ongletAccueil() {
    const p = el('div', 'ruban-panneau');
    p.append(
      groupe('Édition',
        bouton({ cmd: 'annuler', libelle: '↶', titre: 'Annuler (Cmd/Ctrl+Z)', action: () => ctrl.annuler() }),
        bouton({ cmd: 'refaire', libelle: '↷', titre: 'Rétablir (Cmd/Ctrl+Maj+Z)', action: () => ctrl.refaire() })),
      groupe('Police',
        selecteur({ cmd: 'police', titre: 'Police', options: POLICES, classe: 'large', change: (v) => ctrl.style({ fontFamily: v || null }) }),
        selecteur({ cmd: 'taille', titre: 'Taille (points)', options: [['', 'Taille'], ...TAILLES.map((t) => [t + 'pt', t])], classe: 'etroit', change: (v) => ctrl.style({ fontSize: v || null }) }),
        el('br'),
        bouton({ cmd: 'gras', libelle: 'G', titre: 'Gras (Cmd/Ctrl+B)', classe: 'b-gras', marque: 'strong', action: () => ctrl.basculerMarque('strong') }),
        bouton({ cmd: 'italique', libelle: 'I', titre: 'Italique (Cmd/Ctrl+I)', classe: 'b-italique', marque: 'em', action: () => ctrl.basculerMarque('em') }),
        bouton({ cmd: 'souligne', libelle: 'S', titre: 'Souligné (Cmd/Ctrl+U)', classe: 'b-souligne', marque: 'underline', action: () => ctrl.basculerMarque('underline') }),
        bouton({ cmd: 'barre', libelle: 'B', titre: 'Barré', classe: 'b-barre', marque: 'strike', action: () => ctrl.basculerMarque('strike') }),
        bouton({ cmd: 'code', libelle: '</>', titre: 'Code en ligne', marque: 'code', action: () => ctrl.basculerMarque('code') }),
        sep(),
        bouton({
          cmd: 'couleur-texte', libelle: 'A', titre: 'Couleur du texte', classe: 'b-couleur',
          action: (b) => paletteCouleurs(b, { libelleAucune: 'Couleur automatique', auCouleur: (c) => { ctrl.style({ color: c }); b.style.setProperty('--barre', c); ctrl.focus(); }, auAucune: () => { ctrl.style({ color: null }); b.style.removeProperty('--barre'); ctrl.focus(); } }),
        }),
        bouton({
          cmd: 'surlignage', libelle: '🖍', titre: 'Surlignage', classe: 'b-surlignage', marque: 'highlight',
          action: (b) => paletteCouleurs(b, { libelleAucune: 'Aucun surlignage', auCouleur: (c) => { ctrl.surligner(c); ctrl.focus(); }, auAucune: () => { ctrl.retirerSurlignage(); ctrl.focus(); } }),
        })),
      groupe('Paragraphe',
        bouton({ cmd: 'puces', libelle: '• ≡', titre: 'Liste à puces', action: () => ctrl.liste('puces') }),
        bouton({ cmd: 'numerotee', libelle: '1. ≡', titre: 'Liste numérotée', action: () => ctrl.liste('numerotee') }),
        bouton({ cmd: 'taches', libelle: '☑ ≡', titre: 'Liste de tâches', action: () => ctrl.liste('taches') }),
        sep(),
        bouton({ cmd: 'retrait-moins', libelle: '⇤', titre: 'Diminuer le retrait', action: () => ctrl.retrait(-1) }),
        bouton({ cmd: 'retrait-plus', libelle: '⇥', titre: 'Augmenter le retrait', action: () => ctrl.retrait(1) }),
        el('br'),
        bouton({ cmd: 'align-left', libelle: '⯇≡', titre: 'Aligner à gauche', action: () => ctrl.alignement('left') }),
        bouton({ cmd: 'align-center', libelle: '≡', titre: 'Centrer', action: () => ctrl.alignement('center') }),
        bouton({ cmd: 'align-right', libelle: '≡⯈', titre: 'Aligner à droite', action: () => ctrl.alignement('right') }),
        bouton({ cmd: 'align-justify', libelle: '☰', titre: 'Justifier', action: () => ctrl.alignement('justify') })),
      groupe('Styles',
        selecteur({
          cmd: 'style-bloc', titre: 'Style de paragraphe', classe: 'large',
          options: [['normal', 'Normal'], ['titre1', 'Titre 1'], ['titre2', 'Titre 2'], ['titre3', 'Titre 3'], ['citation', 'Citation'], ['code', 'Code']],
          change: (v) => ctrl.bloc(v),
        }),
        el('br'),
        bouton({ cmd: 'effacer', libelle: 'Aₓ', titre: 'Effacer la mise en forme', action: () => ctrl.effacerFormatage() })),
    );
    return p;
  }

  function ongletInsertion() {
    const p = el('div', 'ruban-panneau');
    p.append(
      groupe('Tableau', bouton({ cmd: 'tableau', libelle: '▦ Tableau', titre: 'Insérer un tableau (choisir la taille)', classe: 'large', action: (b) => grilleTableau(b) })),
      groupe('Illustrations',
        bouton({ cmd: 'image', libelle: '🖼 Image', titre: 'Insérer une image', classe: 'large', action: () => window.mdr.document.dialogues.image() }),
        bouton({ cmd: 'diagramme', libelle: '⛓ Diagramme', titre: 'Insérer ou modifier un diagramme (éditeur visuel Mermaid)', classe: 'large', action: () => window.commands.run('diagramme:nouveau') })),
      groupe('Liens',
        bouton({ cmd: 'lien', libelle: '🔗 Lien', titre: 'Lien (Cmd/Ctrl+K)', classe: 'large', action: () => window.mdr.document.dialogues.lien() })),
      groupe('Éléments',
        bouton({ cmd: 'saut-page', libelle: '⤓ Saut de page', titre: 'Saut de page (Cmd/Ctrl+Entrée)', classe: 'large', action: () => ctrl.insererSautDePage() }),
        bouton({ cmd: 'ligne', libelle: '― Ligne', titre: 'Ligne horizontale', classe: 'large', action: () => ctrl.insererLigne() }),
        el('br'),
        bouton({ cmd: 'symbole', libelle: 'Ω Symbole', titre: 'Symbole ou emoji', classe: 'large', action: (b) => grilleSymboles(b) }),
        bouton({ cmd: 'formule', libelle: '∑ Formule', titre: 'Formule (LaTeX)', classe: 'large', action: () => window.mdr.document.dialogues.formule() })),
      groupe('Références',
        bouton({ cmd: 'sommaire', libelle: '☰ Sommaire', titre: 'Sommaire ([[toc]])', classe: 'large', action: () => ctrl.insererSommaire() }),
        bouton({ cmd: 'note', libelle: '¹ Note de bas de page', titre: 'Note de bas de page', classe: 'large', action: () => ctrl.insererNote() }),
        el('br'),
        selecteur({
          cmd: 'encadre', titre: 'Insérer un encadré', classe: 'large',
          options: [['', 'Encadré…'], ['note', 'Note'], ['tip', 'Astuce'], ['important', 'Important'], ['warning', 'Attention'], ['caution', 'Danger']],
          change: (v, s) => { if (v) ctrl.insererEncadre(v); s.value = ''; },
        })),
    );
    return p;
  }

  const MARGES = [['20', 'Normales (20 mm)'], ['12.7', 'Étroites (12,7 mm)'], ['30', 'Larges (30 mm)'], ['perso', 'Personnalisées…']];

  function ongletMiseEnPage() {
    const p = el('div', 'ruban-panneau');
    const marge = selecteur({
      cmd: 'marges', titre: 'Marges', options: MARGES, classe: 'large',
      change: (v) => { if (v === 'perso') { refs['marge-perso'].focus(); return; } appliquerMarge(Number(v)); },
    });
    const margePerso = el('input', 'ruban-nombre');
    margePerso.type = 'number'; margePerso.min = '0'; margePerso.max = '50'; margePerso.step = '0.5';
    margePerso.title = 'Marge personnalisée (mm), identique sur les quatre côtés';
    margePerso.setAttribute('aria-label', 'Marge personnalisée en millimètres');
    margePerso.dataset.cmd = 'marge-perso';
    margePerso.addEventListener('change', () => { const v = parseFloat(margePerso.value); if (Number.isFinite(v)) appliquerMarge(Math.min(50, Math.max(0, v))); });
    refs['marge-perso'] = margePerso;
    const enTete = el('input', 'ruban-texte');
    enTete.type = 'text'; enTete.placeholder = 'En-tête'; enTete.title = 'Texte d’en-tête des exports PDF et Word'; enTete.dataset.cmd = 'en-tete';
    enTete.setAttribute('aria-label', 'En-tête');
    enTete.addEventListener('change', () => ecrireEnTete(enTete.value));
    refs['en-tete'] = enTete;
    const pied = el('input', 'ruban-texte');
    pied.type = 'text'; pied.placeholder = 'Pied de page'; pied.title = 'Texte de pied de page des exports PDF et Word'; pied.dataset.cmd = 'pied';
    pied.setAttribute('aria-label', 'Pied de page');
    pied.addEventListener('change', () => reglages.set('pdfPied', pied.value));
    refs.pied = pied;
    const numeros = el('label', 'ruban-case');
    const caseNum = el('input');
    caseNum.type = 'checkbox'; caseNum.dataset.cmd = 'numeros-page';
    caseNum.addEventListener('change', () => { reglages.set('pdfNumerosPage', caseNum.checked); majBoutonDocument(); });
    numeros.append(caseNum, ' Numéros de page');
    refs['numeros-page'] = caseNum;

    p.append(
      groupe('Page',
        selecteur({ cmd: 'format-page', titre: 'Format du papier', options: [['A4', 'A4'], ['Letter', 'Letter'], ['Legal', 'Legal'], ['A3', 'A3'], ['A5', 'A5']], classe: 'large', change: (v) => reglages.set('pdfFormat', v) }),
        selecteur({ cmd: 'orientation', titre: 'Orientation', options: [['portrait', 'Portrait'], ['paysage', 'Paysage']], classe: 'large', change: (v) => reglages.set('pdfPaysage', v === 'paysage') })),
      groupe('Marges', marge, margePerso, el('span', 'ruban-unite', ' mm')),
      groupe('En-tête et pied de page', enTete, pied, numeros),
      groupe('Document',
        bouton({ cmd: 'styles-document', libelle: 'Aa Styles du document…', titre: 'Police, taille et couleurs du document (enregistrées dans le front-matter)', classe: 'large', action: () => window.mdr.styleDoc && window.mdr.styleDoc.dialogue() })),
    );
    return p;
  }

  function majBoutonDocument() { /* le pied de page réagit aux réglages à l'export */ }

  function appliquerMarge(mm) {
    reglages.set('margeA4Haut', mm);
    reglages.set('margeA4Cotes', mm);
    reglages.set('margeA4Bas', mm);
    reglages.set('pdfMarge', Math.round((mm / 25.4) * 100) / 100);
    rafraichir();
  }

  // L'en-tête vit dans la modale d'export PDF (champ « En-tête », mémorisé avec
  // ses autres options) : le ruban écrit dans ce même champ.
  function ecrireEnTete(texte) {
    const champ = document.getElementById('pdf-header-text');
    if (champ) champ.value = texte;
    if (typeof savePdfPrefs === 'function') savePdfPrefs();
  }

  // ───────────────────────── Construction ─────────────────────────

  const ONGLETS = [['accueil', 'Accueil', ongletAccueil], ['insertion', 'Insertion', ongletInsertion], ['mise-en-page', 'Mise en page', ongletMiseEnPage]];

  function activerOnglet(id) {
    for (const [i, , ] of ONGLETS) {
      const actif = i === id;
      refs['onglet-' + i].classList.toggle('actif', actif);
      refs['onglet-' + i].setAttribute('aria-selected', String(actif));
      refs['panneau-' + i].hidden = !actif;
    }
    fermerPopup();
  }

  function construire(parent, controleur) {
    if (ruban) return ruban;
    ctrl = controleur;
    ruban = el('div');
    ruban.id = 'ruban';
    const entete = el('div', 'ruban-onglets');
    entete.setAttribute('role', 'tablist');
    const panneaux = el('div', 'ruban-panneaux');
    for (const [id, titre, fabrique] of ONGLETS) {
      const b = el('button', 'ruban-onglet', titre);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.onglet = id;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => activerOnglet(id));
      refs['onglet-' + id] = b;
      entete.appendChild(b);
      const panneau = fabrique();
      panneau.setAttribute('role', 'tabpanel');
      panneau.dataset.panneau = id;
      refs['panneau-' + id] = panneau;
      panneaux.appendChild(panneau);
    }
    const droite = el('div', 'ruban-droite');
    const pages = el('span', 'ruban-pages');
    pages.id = 'document-pages';
    const zoom = el('select', 'ruban-select etroit');
    zoom.id = 'document-zoom';
    zoom.title = 'Zoom';
    zoom.setAttribute('aria-label', 'Zoom');
    for (const z of [50, 75, 100, 125, 150]) { const o = el('option', undefined, z + ' %'); o.value = String(z / 100); zoom.appendChild(o); }
    zoom.value = '1';
    zoom.addEventListener('change', () => window.mdr.document.definirZoom(Number(zoom.value)));
    droite.append(pages, zoom);
    entete.appendChild(droite);
    ruban.append(entete, panneaux);
    parent.appendChild(ruban);
    activerOnglet('accueil');
    ctrl.onEtat(() => { if (!planifie) planifie = requestAnimationFrame(() => { planifie = 0; rafraichir(); }); });
    rafraichir();
    return ruban;
  }

  // ───────────────────────── État ─────────────────────────

  function basculerActif(cmd, actif) { if (refs[cmd]) refs[cmd].classList.toggle('actif', !!actif); }

  function rafraichir() {
    if (!ruban || !ctrl) return;
    const e = ctrl.etat();
    for (const [cmd, marque] of [['gras', 'strong'], ['italique', 'em'], ['souligne', 'underline'], ['barre', 'strike'], ['code', 'code'], ['surlignage', 'highlight']]) basculerActif(cmd, e.marques[marque]);
    basculerActif('puces', e.liste === 'puces');
    basculerActif('numerotee', e.liste === 'numerotee');
    basculerActif('taches', e.liste === 'taches');
    for (const a of ['left', 'center', 'right', 'justify']) basculerActif('align-' + a, e.alignement === a);
    refs['style-bloc'].value = e.bloc;
    const police = e.style.fontFamily || '';
    refs.police.value = POLICES.some(([v]) => v === police) ? police : '';
    const taille = e.style.fontSize || '';
    refs.taille.value = [...refs.taille.options].some((o) => o.value === taille) ? taille : '';
    if (e.style.color) refs['couleur-texte'].style.setProperty('--barre', e.style.color); else refs['couleur-texte'].style.removeProperty('--barre');
    refs.annuler.disabled = !e.peutAnnuler;
    refs.refaire.disabled = !e.peutRefaire;
    // Mise en page : reflète les réglages courants.
    refs['format-page'].value = reglages.get('pdfFormat');
    refs.orientation.value = reglages.get('pdfPaysage') ? 'paysage' : 'portrait';
    const mm = reglages.get('margeA4Cotes');
    refs.marges.value = MARGES.some(([v]) => v !== 'perso' && Number(v) === mm) ? String(mm) : 'perso';
    if (document.activeElement !== refs['marge-perso']) refs['marge-perso'].value = String(mm);
    refs['numeros-page'].checked = reglages.get('pdfNumerosPage');
    if (document.activeElement !== refs.pied) refs.pied.value = reglages.get('pdfPied');
    const champEnTete = document.getElementById('pdf-header-text');
    if (champEnTete && document.activeElement !== refs['en-tete']) refs['en-tete'].value = champEnTete.value;
  }

  window.mdr = window.mdr || {};
  window.mdr.ruban = { construire, rafraichir, activerOnglet, fermerPopup, element: () => ruban };
})();

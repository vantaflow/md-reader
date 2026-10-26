// Mode « Document » : édition directe dans une page mise en forme (façon Word /
// Typora), en plus du mode code (CodeMirror). Le fichier reste du Markdown :
//   - le texte de l'onglet reste porté par l'éditeur CodeMirror (masqué en mode
//     Document), qui sert de « source de vérité » à l'enregistrement, aux exports,
//     aux statistiques et à l'aperçu (hors écran) ;
//   - en mode Document, chaque modification de la page est réécrite en Markdown
//     dans CodeMirror (coalescée à la trame d'affichage) ; à l'inverse, toute
//     modification extérieure de CodeMirror (changement d'onglet, fichier modifié
//     sur disque, insertion par une autre fonction) recharge la page.
// Les branchements sur CodeMirror se font par enveloppe de `getValue`, `setValue`
// et `view.dispatch` : aucun autre fichier n'a besoin de connaître ce mode.
(() => {
  const reglages = window.mdrSettings;
  const SD = window.mdrStyleDoc;
  const MV = window.mdrMermaid;
  const corps = document.body;
  const main = document.querySelector('main');

  let racine = null;
  let zone = null;
  let page = null;
  let hote = null;
  let ctrl = null;
  let actif = false;
  let sale = false; // la page a changé et CodeMirror n'a pas encore reçu le Markdown
  let enPoussee = false;
  let dernierTexte = null; // dernier texte synchronisé entre la page et CodeMirror
  let trame = 0;
  let installe = false;
  let origine = null; // méthodes d'origine de l'éditeur CodeMirror

  const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };
  const annoncer = (m) => { if (typeof annoncerLot === 'function') annoncerLot(m); };
  const editeur = () => window.mdr.editeur();

  // ───────────────────────── Formulaire générique ─────────────────────────
  // champs : [{ id, libelle, type: 'texte'|'zone'|'liste'|'nombre'|'case', valeur, options, placeholder }]
  // Promesse des valeurs saisies, ou null si annulé. `extra` : boutons supplémentaires
  // [{ libelle, id, valeur }] qui valident avec { _bouton: valeur }.
  function formulaire({ titre, champs, ok = 'Valider', extra = [], classe = 'formulaire', id = 'modale-formulaire', apercu }) {
    return new Promise((resolve) => {
      let fini = false;
      const terminer = (v) => { if (!fini) { fini = true; resolve(v); } };
      const saisies = {};
      const lire = () => Object.fromEntries(Object.entries(saisies).map(([k, e]) => [k, e.type === 'checkbox' ? e.checked : e.value]));
      const m = window.mdr.modale.ouvrir({
        id,
        titre,
        classe,
        corps(z) {
          for (const c of champs) {
            const label = el('label', c.type === 'case' ? 'row' : undefined);
            let e;
            if (c.type === 'liste') {
              e = el('select');
              for (const [v, l] of c.options) { const o = el('option', undefined, l); o.value = v; e.appendChild(o); }
              e.value = c.valeur;
            } else if (c.type === 'zone') {
              e = el('textarea');
              e.rows = c.lignes || 5;
              e.value = c.valeur || '';
              e.spellcheck = false;
            } else {
              e = el('input');
              e.type = c.type === 'case' ? 'checkbox' : c.type === 'nombre' ? 'number' : (c.type === 'couleur' ? 'color' : 'text');
              if (c.type === 'case') e.checked = !!c.valeur; else e.value = c.valeur === undefined || c.valeur === null ? '' : c.valeur;
              if (c.type === 'nombre') { e.min = c.min; e.max = c.max; e.step = c.pas || 1; }
              if (c.placeholder) e.placeholder = c.placeholder;
              if (c.type !== 'case') e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); const b = z.parentElement.querySelector('.modal-actions .primary'); if (b) b.click(); } });
            }
            e.id = `${id}-${c.id}`;
            saisies[c.id] = e;
            if (c.type === 'case') { label.append(e, ' ' + c.libelle); } else { label.append(c.libelle, e); }
            z.appendChild(label);
          }
          if (apercu) {
            const zoneApercu = el('div', 'formulaire-apercu');
            z.appendChild(zoneApercu);
            const maj = () => { try { apercu(zoneApercu, lire()); } catch { zoneApercu.textContent = ''; } };
            for (const e of Object.values(saisies)) e.addEventListener('input', maj);
            maj();
          }
        },
        boutons: [
          { libelle: 'Annuler', id: id + '-annuler' },
          ...extra.map((x) => ({ libelle: x.libelle, id: `${id}-${x.id}`, action: () => { terminer({ ...lire(), _bouton: x.valeur }); return true; } })),
          { libelle: ok, id: id + '-ok', primaire: true, action: () => { terminer(lire()); return true; } },
        ],
        auFermer: () => terminer(null),
      });
      const premier = Object.values(saisies)[0];
      if (premier) { premier.focus(); if (premier.select && premier.type === 'text') premier.select(); }
      void m;
    });
  }

  // ───────────────────────── Images ─────────────────────────

  function dossierDocument() {
    const t = window.mdr.onglets.actif();
    return t && t.path ? t.path.replace(/[\\/][^\\/]*$/, '') : null;
  }

  // Adresse affichable d'une image dont la source est relative au document.
  function resoudreImage(src) {
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src;
    const dossier = dossierDocument();
    if (!dossier) return src;
    try { return new URL(src, window.mdr.rendu.urlFichier(dossier + '/')).href; } catch { return src; }
  }

  async function assurerEnregistre() {
    const onglets = window.mdr.onglets;
    const t = onglets.actif();
    if (!t) return null;
    if (t.path) return t.path;
    if (!window.confirm('Ce document n’est pas encore enregistré.\n\nL’image sera copiée dans un dossier « images » à côté du document : enregistrez-le d’abord ?')) return null;
    await onglets.enregistrer();
    return onglets.actif() && onglets.actif().path ? onglets.actif().path : null;
  }

  // Copie des fichiers image dans `images/` (IPC bornée) puis insertion dans la page.
  async function importerImages(fichiers, pos) {
    const chemin = await assurerEnregistre();
    if (!chemin) return false;
    let ok = false;
    for (const f of fichiers) {
      try {
        const octets = new Uint8Array(await f.arrayBuffer());
        const nom = !f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? null : f.name;
        const r = await window.api.enregistrerImage({ cheminDocument: chemin, nom, octets, mime: f.type });
        if (!r || r.erreur) { annoncer('Image non ajoutée : ' + ((r && r.erreur) || 'erreur inconnue')); continue; }
        ctrl.insererImageA(pos === undefined ? null : pos, { src: r.relatif, alt: r.nom.replace(/\.[^.]+$/, '') });
        ok = true;
      } catch (e) { annoncer('Image non ajoutée : ' + (e && e.message ? e.message : e)); }
    }
    return ok;
  }

  // ───────────────────────── Dialogues ─────────────────────────

  async function dialogueLien() {
    if (!ctrl) return null;
    const courant = ctrl.lienCourant();
    const champs = [{ id: 'href', libelle: 'Adresse du lien', type: 'texte', valeur: courant.href, placeholder: 'https://…' }];
    if (courant.vide) champs.unshift({ id: 'texte', libelle: 'Texte affiché', type: 'texte', valeur: courant.texte });
    champs.push({ id: 'titre', libelle: 'Info-bulle (facultatif)', type: 'texte', valeur: courant.titre });
    const r = await formulaire({ titre: 'Lien', champs, ok: 'Appliquer', id: 'modale-lien', extra: courant.href ? [{ libelle: 'Retirer le lien', id: 'retirer', valeur: 'retirer' }] : [] });
    if (!r) return null;
    if (r._bouton === 'retirer') { ctrl.insererLien({ href: '', texte: '', titre: '' }); return 'retire'; }
    const href = (r.href || '').trim();
    if (!href) return null;
    ctrl.insererLien({ href, texte: (r.texte || '').trim() || href, titre: (r.titre || '').trim() });
    return 'ok';
  }

  async function dialogueImage() {
    if (!ctrl) return null;
    const r = await formulaire({
      titre: 'Image',
      id: 'modale-image',
      ok: 'Insérer',
      champs: [
        { id: 'src', libelle: 'Adresse ou chemin de l’image', type: 'texte', placeholder: 'images/schema.png ou https://…' },
        { id: 'alt', libelle: 'Texte alternatif', type: 'texte' },
      ],
      extra: [{ libelle: 'Choisir un fichier…', id: 'fichier', valeur: 'fichier' }],
    });
    if (!r) return null;
    if (r._bouton === 'fichier') { await choisirImage(); return r; }
    if ((r.src || '').trim()) ctrl.insererImage({ src: r.src.trim(), alt: (r.alt || '').trim() });
    return r;
  }

  // Sélection d'un fichier image depuis le disque (champ fichier du navigateur).
  function choisirImage() {
    return new Promise((resolve) => {
      const input = el('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
      input.multiple = true;
      input.addEventListener('change', async () => { await importerImages([...input.files]); resolve(true); });
      input.click();
    });
  }

  async function dialogueFormule(pos, tex = '') {
    const r = await formulaire({
      titre: 'Formule (LaTeX)',
      id: 'modale-formule',
      ok: pos === undefined ? 'Insérer' : 'Appliquer',
      champs: [{ id: 'tex', libelle: 'Formule', type: 'zone', valeur: tex, lignes: 4 }],
      apercu: (z, v) => { z.innerHTML = window.md ? window.md.parse('$$\n' + (v.tex || '\\ ') + '\n$$') : ''; },
    });
    if (!r || !r.tex.trim()) return null;
    if (pos === undefined) ctrl.insererFormule(r.tex.trim(), true); else ctrl.remplacerAttrs(pos, { tex: r.tex.trim() });
    return r.tex;
  }

  async function dialogueBrut(pos, raw) {
    const r = await formulaire({
      titre: 'Markdown ou HTML conservé tel quel',
      id: 'modale-brut',
      champs: [{ id: 'raw', libelle: 'Contenu (écrit tel quel dans le fichier)', type: 'zone', valeur: raw, lignes: 8 }],
      extra: [{ libelle: 'Supprimer le bloc', id: 'supprimer', valeur: 'supprimer' }],
      ok: 'Appliquer',
    });
    if (!r) return null;
    if (r._bouton === 'supprimer' || !r.raw.trim()) ctrl.supprimerA(pos); else ctrl.remplacerAttrs(pos, { raw: r.raw.replace(/\s+$/, '') });
    return r;
  }

  async function dialogueDiagramme(pos) {
    const d = window.mdr.diagramme;
    if (!d) return null;
    if (pos !== undefined) {
      const n = ctrl.noeudA(pos);
      const code = await d.editer(n ? n.attrs.source : '');
      if (code) ctrl.remplacerAttrs(pos, { source: code });
      return code;
    }
    const sel = ctrl.mermaidSelectionne();
    if (sel) return dialogueDiagramme(sel.pos);
    const code = await d.editer(null);
    if (code) ctrl.insererMermaid(code);
    return code;
  }

  // ───────────────────────── Menu contextuel (tableaux) ─────────────────────────

  let menuCtx = null;
  function fermerMenu() { if (menuCtx) { menuCtx.remove(); menuCtx = null; } }
  document.addEventListener('mousedown', (e) => { if (menuCtx && !menuCtx.contains(e.target)) fermerMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuCtx) { fermerMenu(); e.stopPropagation(); } }, true);

  function ouvrirMenu(x, y, entrees) {
    fermerMenu();
    menuCtx = el('div', 'menu-contextuel');
    menuCtx.setAttribute('role', 'menu');
    menuCtx.id = 'document-menu-contextuel';
    for (const e of entrees) {
      if (e === '-') { menuCtx.appendChild(el('div', 'menu-sep')); continue; }
      const b = el('button', undefined, e.libelle);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (e.id) b.dataset.action = e.id;
      if (e.desactive) { b.disabled = true; if (e.titre) b.title = e.titre; }
      if (e.actif) b.classList.add('actif');
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', () => { fermerMenu(); e.action(); });
      menuCtx.appendChild(b);
    }
    document.body.appendChild(menuCtx);
    const r = menuCtx.getBoundingClientRect();
    menuCtx.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    menuCtx.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
  }

  function entreesTableau() {
    const t = ctrl.tableau;
    const etat = ctrl.etat();
    return [
      { id: 'ligne-avant', libelle: 'Insérer une ligne au-dessus', action: t.ligneAvant },
      { id: 'ligne-apres', libelle: 'Insérer une ligne en dessous', action: t.ligneApres },
      { id: 'colonne-avant', libelle: 'Insérer une colonne à gauche', action: t.colonneAvant },
      { id: 'colonne-apres', libelle: 'Insérer une colonne à droite', action: t.colonneApres },
      '-',
      { id: 'supprimer-ligne', libelle: 'Supprimer la ligne', action: t.supprimerLigne },
      { id: 'supprimer-colonne', libelle: 'Supprimer la colonne', action: t.supprimerColonne },
      { id: 'supprimer-tableau', libelle: 'Supprimer le tableau', action: t.supprimerTableau },
      '-',
      { id: 'aligner-gauche', libelle: 'Aligner la colonne à gauche', action: () => t.aligner('left'), actif: etat.alignementColonne === 'left' },
      { id: 'aligner-centre', libelle: 'Centrer la colonne', action: () => t.aligner('center'), actif: etat.alignementColonne === 'center' },
      { id: 'aligner-droite', libelle: 'Aligner la colonne à droite', action: () => t.aligner('right'), actif: etat.alignementColonne === 'right' },
      { id: 'aligner-aucun', libelle: 'Alignement par défaut', action: () => t.aligner('none'), actif: !etat.alignementColonne },
      '-',
      { id: 'entete', libelle: 'Ligne d’en-tête', action: t.entete, actif: etat.enteteTableau },
      { id: 'fusion', libelle: 'Fusionner les cellules (indisponible)', desactive: true, titre: 'Le Markdown ne sait pas représenter une cellule fusionnée : la fusion est volontairement absente.', action: () => {} },
    ];
  }

  function menuContextuel(event) {
    if (!ctrl || !ctrl.dansTableau()) return false;
    event.preventDefault();
    ouvrirMenu(event.clientX, event.clientY, entreesTableau());
    return true;
  }

  // ───────────────────────── Page ─────────────────────────

  const FORMATS = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A3: [297, 420], A5: [148, 210] };

  function dimensionsPage() {
    const f = FORMATS[reglages.get('pdfFormat')] || FORMATS.A4;
    return reglages.get('pdfPaysage') ? [f[1], f[0]] : [f[0], f[1]];
  }

  // Format, orientation, marges et police : variables CSS de la page (et des
  // feuilles de l'aperçu A4, qui les lisent aussi).
  function appliquerPage() {
    const [l, h] = dimensionsPage();
    const cible = [document.documentElement];
    for (const c of cible) {
      c.style.setProperty('--page-largeur', l + 'mm');
      c.style.setProperty('--page-hauteur', h + 'mm');
    }
    if (page) {
      const police = reglages.get('policeApercu');
      if (police) page.style.setProperty('--apercu-police', police); else page.style.removeProperty('--apercu-police');
      page.style.setProperty('--apercu-taille', reglages.get('tailleApercu') + 'px');
      page.style.setProperty('--a4-marge-haut', reglages.get('margeA4Haut') + 'mm');
      page.style.setProperty('--a4-marge-cotes', reglages.get('margeA4Cotes') + 'mm');
      page.style.setProperty('--a4-marge-bas', reglages.get('margeA4Bas') + 'mm');
    }
    ajusterZoom();
    if (typeof planifierPagination === 'function') planifierPagination();
    if (window.mdr.ruban) window.mdr.ruban.rafraichir();
  }

  let zoomUtilisateur = 1;
  function ajusterZoom() {
    if (!page || !zone) return;
    page.style.zoom = '';
    const largeur = page.offsetWidth || 1;
    const dispo = zone.clientWidth - 40;
    const auto = Math.min(1, dispo / largeur);
    page.style.zoom = String(Math.max(0.3, Math.min(auto, 3) * zoomUtilisateur).toFixed(3));
    majNombrePages();
  }

  function majNombrePages() {
    const info = document.getElementById('document-pages');
    if (!info || !page) return;
    const [, h] = dimensionsPage();
    const hautMm = page.scrollHeight / 3.7795;
    const n = Math.max(1, Math.ceil(hautMm / h - 0.02));
    info.textContent = `≈ ${n} page${n > 1 ? 's' : ''}`;
  }

  function definirZoom(z) { zoomUtilisateur = z; ajusterZoom(); }

  // ───────────────────────── Construction ─────────────────────────

  function construire() {
    if (racine) return;
    racine = el('div');
    racine.id = 'document';
    zone = el('div');
    zone.id = 'document-zone';
    page = el('div', 'doc-page');
    page.id = 'document-page';
    hote = el('div');
    hote.id = 'document-editeur';
    page.appendChild(hote);
    zone.appendChild(page);
    racine.appendChild(zone);
    main.appendChild(racine);
    let planifieZoom = 0;
    new ResizeObserver(() => { if (!planifieZoom) planifieZoom = requestAnimationFrame(() => { planifieZoom = 0; ajusterZoom(); }); }).observe(zone);
  }

  function creerControleur() {
    if (ctrl) return ctrl;
    construire();
    ctrl = window.mdrDocument.creerEditeurDocument(hote, {
      resoudreImage,
      correcteur: reglages.get('correcteur') !== 'aucun',
      onLien: dialogueLien,
      onImages: (fichiers, pos) => importerImages(fichiers, pos === null ? undefined : pos),
      onEditerMermaid: ({ pos }) => dialogueDiagramme(pos),
      onEditerMath: ({ pos, node }) => dialogueFormule(pos, node.attrs.tex),
      onEditerBrut: ({ pos, raw }) => dialogueBrut(pos, raw),
      onMenuContextuel: menuContextuel,
      onWikiLien: (nom) => { const w = window.mdr.wiki; if (w && w.ouvrirNote) w.ouvrirNote(nom); },
    });
    ctrl.onChange(() => {
      sale = true;
      if (!trame) trame = requestAnimationFrame(() => { trame = 0; pousser(); });
      majNombrePages();
    });
    if (window.mdr.ruban) window.mdr.ruban.construire(racine, ctrl);
    // Le ruban se place au-dessus de la zone de page.
    const ruban = document.getElementById('ruban');
    if (ruban) racine.insertBefore(ruban, zone);
    return ctrl;
  }

  // ───────────────────────── Synchronisation avec CodeMirror ─────────────────────────

  // Réécrit le Markdown de la page dans CodeMirror (déclenche le rendu, le
  // marquage « modifié » et les statistiques habituels).
  function pousser() {
    if (trame) { cancelAnimationFrame(trame); trame = 0; }
    if (!actif || !ctrl || !sale) return;
    sale = false;
    const md = ctrl.versMarkdown();
    if (md === dernierTexte) return;
    dernierTexte = md;
    if (origine.get() === md) return;
    enPoussee = true;
    try { origine.set(md); } finally { enPoussee = false; }
  }

  function installerEnveloppes() {
    if (installe) return;
    const ed = editeur();
    if (!ed) return;
    installe = true;
    origine = { get: ed.getValue.bind(ed), set: ed.setValue.bind(ed), dispatch: ed.view.dispatch.bind(ed.view) };
    ed.getValue = () => { if (actif && sale) pousser(); return origine.get(); };
    ed.setValue = (s) => {
      origine.set(s);
      if (actif && !enPoussee) { dernierTexte = s; sale = false; ctrl.charger(s); }
    };
    ed.view.dispatch = (...args) => {
      origine.dispatch(...args);
      if (actif && !enPoussee) {
        const t = origine.get();
        if (t !== dernierTexte) { dernierTexte = t; sale = false; ctrl.charger(t); }
      }
    };
  }

  // ───────────────────────── Bascule ─────────────────────────

  function majBouton() {
    const b = document.getElementById('btn-mode-edition');
    if (!b) return;
    b.textContent = actif ? '</> Mode code' : '📝 Mode Document';
    b.title = actif ? 'Revenir au mode code (Markdown)' : 'Éditer directement dans une page mise en forme';
    b.setAttribute('aria-pressed', String(actif));
  }

  function entrer() {
    if (actif) return true;
    const ed = editeur();
    if (!ed) return false;
    installerEnveloppes();
    creerControleur();
    dernierTexte = origine.get();
    sale = false;
    ctrl.charger(dernierTexte);
    actif = true;
    main.classList.add('mode-document');
    corps.classList.add('mode-document');
    appliquerPage();
    if (window.mdr.styleDoc) window.mdr.styleDoc.appliquer();
    majBouton();
    if (window.mdr.ruban) window.mdr.ruban.rafraichir();
    ajusterZoom();
    ctrl.focus();
    if (reglages.get('modeEdition') !== 'document') reglages.set('modeEdition', 'document');
    return true;
  }

  function sortir() {
    if (!actif) return true;
    pousser();
    actif = false;
    main.classList.remove('mode-document');
    corps.classList.remove('mode-document');
    fermerMenu();
    majBouton();
    const ed = editeur();
    if (typeof planifierPagination === 'function') planifierPagination();
    if (ed) ed.focus();
    if (reglages.get('modeEdition') !== 'code') reglages.set('modeEdition', 'code');
    return true;
  }

  const basculer = () => (actif ? sortir() : entrer());

  // ───────────────────────── Commandes ─────────────────────────

  const tab = window.mdrRaccourcis;
  const accel = (id) => (tab && tab.parId(id) ? tab.afficher(tab.parId(id).accel, window.api && window.api.platform) : '') || undefined;

  // En mode Document, les commandes `format:*` (menus, palette, raccourcis du menu
  // natif) agissent sur la page ; sinon elles gardent leur comportement d'origine.
  const EN_DOCUMENT = {
    'format:gras': () => ctrl.basculerMarque('strong'),
    'format:italique': () => ctrl.basculerMarque('em'),
    'format:souligne': () => ctrl.basculerMarque('underline'),
    'format:barre': () => ctrl.basculerMarque('strike'),
    'format:titre1': () => ctrl.bloc('titre1'),
    'format:titre2': () => ctrl.bloc('titre2'),
    'format:titre3': () => ctrl.bloc('titre3'),
    'format:puces': () => ctrl.liste('puces'),
    'format:numerotee': () => ctrl.liste('numerotee'),
    'format:taches': () => ctrl.liste('taches'),
    'format:lien': () => dialogueLien(),
    'format:image': () => dialogueImage(),
    'format:tableau': () => ctrl.insererTableau(3, 3),
    'format:code': () => ctrl.bloc('code'),
    'format:citation': () => ctrl.bloc('citation'),
    'format:saut-page': () => ctrl.insererSautDePage(),
  };

  function enveloperCommandes() {
    const existantes = window.commands.all();
    for (const [id, fn] of Object.entries(EN_DOCUMENT)) {
      const c = existantes.find((x) => x.id === id);
      const original = c ? c.executer : null;
      window.commands.register({
        id,
        titre: c ? c.titre : `Format : ${id}`,
        raccourci: c ? c.raccourci : accel(id),
        executer: () => {
          if (actif && ctrl) return fn();
          if (original) return original();
          // Souligné en mode code : balise HTML autour de la sélection.
          if (id === 'format:souligne') { const ed = editeur(); if (ed) { ed.wrapSelection('<u>', '</u>'); ed.focus(); } }
          return undefined;
        },
      });
    }
  }

  function enregistrer() {
    const reg = window.commands.register;
    reg({ id: 'vue:mode-document', titre: 'Mode Document : éditer dans une page mise en forme', raccourci: accel('vue:mode-edition'), executer: () => entrer() });
    reg({ id: 'vue:mode-code', titre: 'Mode code : éditer le Markdown', executer: () => sortir() });
    reg({ id: 'vue:mode-edition', titre: 'Basculer entre le mode code et le mode Document', raccourci: accel('vue:mode-edition'), executer: () => basculer() });
    reg({ id: 'insertion:formule', titre: 'Insertion : formule (mode Document)', executer: () => { if (actif) return dialogueFormule(); return undefined; } });
    reg({ id: 'insertion:image-fichier', titre: 'Insertion : image depuis un fichier (mode Document)', executer: () => { if (actif) return choisirImage(); return undefined; } });
  }

  function creerBouton() {
    const b = el('button');
    b.id = 'btn-mode-edition';
    b.type = 'button';
    b.addEventListener('click', basculer);
    const ref = document.getElementById('mode-affichage');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref);
    majBouton();
  }

  // Cmd/Ctrl+U (souligné) en mode code : CodeMirror n'a pas de touche par défaut.
  function ajouterToucheSouligne() {
    const f = window.mdr.format;
    if (f && Array.isArray(f.raccourcisEditeur) && window.mdrRaccourcis.toucheEditeur) {
      const cle = window.mdrRaccourcis.toucheEditeur('format:souligne');
      if (cle) f.raccourcisEditeur.push({ cle, executer: () => window.commands.run('format:souligne') });
    }
  }

  function initialiser() {
    installerEnveloppes();
    reglages.onChange((cle, valeur) => {
      if (cle === 'modeEdition') { if (valeur === 'document') entrer(); else sortir(); }
      if (['pdfFormat', 'pdfPaysage', 'margeA4Haut', 'margeA4Cotes', 'margeA4Bas', 'policeApercu', 'tailleApercu'].includes(cle)) appliquerPage();
    });
    appliquerPage();
    if (reglages.get('modeEdition') === 'document') entrer();
    majBouton();
  }

  creerBouton();
  enveloperCommandes();
  enregistrer();
  ajouterToucheSouligne();

  window.mdr = window.mdr || {};
  window.mdr.formulaire = formulaire;
  window.mdr.document = {
    initialiser, entrer, sortir, basculer,
    actif: () => actif,
    controleur: () => ctrl,
    synchroniser: pousser,
    appliquerPage, definirZoom, dimensionsPage,
    dialogues: { lien: dialogueLien, image: dialogueImage, formule: dialogueFormule, diagramme: dialogueDiagramme, choisirImage },
    menuTableau: (x, y) => ouvrirMenu(x, y, entreesTableau()),
    fermerMenu,
    page: () => page,
  };
  void MV;
  void SD;
})();

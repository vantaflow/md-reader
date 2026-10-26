// Liens wiki `[[note]]` et rétroliens. Un clic sur un lien wiki de l'aperçu
// ouvre la note dans un onglet : le nom est résolu parmi les .md du dossier du
// document puis du dossier ouvert (lib/wiki.js) ; une note introuvable se crée
// après confirmation. Le panneau Rétroliens (onglet Plan) liste les documents
// du dossier ouvert qui citent le document courant (IPC bornée `folder:backlinks`).
(() => {
  const lib = window.mdrWiki;
  const dossierDe = (chemin) => chemin.replace(/[\\/][^\\/]*$/, '');
  const annoncer = (m) => { if (typeof annoncerLot === 'function') annoncerLot(m); };
  const separateur = (chemin) => (chemin.includes('\\') ? '\\' : '/');
  const absolu = (racine, rel) => racine.replace(/[\\/]+$/, '') + separateur(racine) + rel.split('/').join(separateur(racine));

  function contexte() {
    const actif = window.mdr.onglets.actif();
    const chemin = actif && actif.path ? actif.path : null;
    const dossierDocument = chemin ? dossierDe(chemin) : null;
    const racine = window.mdr.dossier() || dossierDocument;
    return { racine, dossierDocument, chemin };
  }

  async function lireFichiers(racine) {
    try {
      const r = await window.api.listerMdRelatifs(racine);
      return r && !r.erreur && Array.isArray(r.fichiers) ? r.fichiers : [];
    } catch { return []; }
  }

  async function ouvrirChemin(chemin, ancre) {
    const data = await window.api.readFile(chemin);
    if (!data || typeof data.content !== 'string') throw new Error('Fichier illisible.');
    window.mdr.onglets.ouvrir({ path: data.path || chemin, content: data.content });
    if (ancre) allerALAncre(data.content, ancre);
  }

  // Après l'ouverture d'une note `[[note#Section]]` : curseur sur le titre de la section.
  function allerALAncre(contenu, ancre) {
    const k = ancre.trim().toLowerCase();
    const s = window.mdrPlan.extraireSections(contenu).find((x) => x.titre.toLowerCase() === k);
    const ed = window.mdr.editeur();
    if (s && ed) ed.aLaLigne(s.ligne + 1);
  }

  // Ouvre la note désignée par `cible`. Renvoie 'ouverte', 'creee', 'annulee' ou 'impossible'.
  async function ouvrirNote(cible, ancre) {
    const ctx = contexte();
    if (!ctx.racine) {
      annoncer('Ouvrez un dossier ou enregistrez le document pour suivre les liens wiki');
      return 'impossible';
    }
    const fichiers = await lireFichiers(ctx.racine);
    const rel = lib.resoudre({ cible, dossierDocument: ctx.dossierDocument, racine: ctx.racine, fichiers });
    try {
      if (rel) { await ouvrirChemin(absolu(ctx.racine, rel), ancre); return 'ouverte'; }
      const nom = lib.nomFichierNote(cible);
      if (!nom) { annoncer('Nom de note invalide'); return 'impossible'; }
      if (!confirm(`La note « ${cible} » n’existe pas. La créer dans ${(ctx.dossierDocument || ctx.racine).split(/[\\/]/).pop()} ?`)) return 'annulee';
      const dossier = ctx.dossierDocument || ctx.racine;
      const chemin = dossier.replace(/[\\/]+$/, '') + separateur(dossier) + nom;
      // Un fichier du même nom hors des bornes du parcours : on l'ouvre, on ne l'écrase jamais.
      let existe = true;
      try { await window.api.readFile(chemin); } catch { existe = false; }
      if (existe) { await ouvrirChemin(chemin, ancre); return 'ouverte'; }
      const titre = lib.nomSansExt(nom);
      const enregistre = await window.api.saveFile({ filePath: chemin, content: `# ${titre}\n\n` });
      if (!enregistre) return 'impossible';
      window.mdr.liens.invalider();
      await ouvrirChemin(chemin);
      window.mdr.retroliens.rafraichir();
      if (window.mdr.arbreRafraichir) window.mdr.arbreRafraichir();
      return 'creee';
    } catch (e) {
      annoncer('Note inaccessible : ' + (e && e.message ? e.message : e));
      return 'impossible';
    }
  }

  // Clic sur un lien wiki de l'aperçu (délégation : l'aperçu est reconstruit à chaque rendu).
  document.getElementById('preview').addEventListener('click', (e) => {
    const lien = e.target.closest && e.target.closest('a.wikilink');
    if (!lien) return;
    e.preventDefault();
    ouvrirNote(lien.dataset.note, lien.dataset.ancre || '');
  });

  // ── Rétroliens ─────────────────────────────────────────────────────────
  let minuteur = null;
  let numero = 0;

  function afficher(message, liste) {
    const zone = document.getElementById('retroliens-liste');
    zone.textContent = '';
    if (message) {
      const d = document.createElement('div');
      d.className = 'vide';
      d.textContent = message;
      zone.appendChild(d);
      return;
    }
    for (const r of liste) {
      const d = document.createElement('div');
      d.className = 'retrolien';
      d.dataset.chemin = r.chemin;
      const p = document.createElement('div');
      p.className = 'path';
      p.textContent = r.rel + (r.nombre > 1 ? ` (${r.nombre})` : '');
      const x = document.createElement('div');
      x.className = 'extrait';
      x.textContent = r.extrait;
      d.append(p, x);
      d.title = r.chemin;
      d.addEventListener('click', () => ouvrirChemin(r.chemin).catch((e) => annoncer('Impossible d’ouvrir ' + r.rel + ' : ' + e.message)));
      zone.appendChild(d);
    }
  }

  async function calculer() {
    const mien = ++numero;
    const racine = window.mdr.dossier();
    const actif = window.mdr.onglets.actif();
    if (!racine) return afficher('Ouvrez un dossier pour voir les rétroliens.');
    if (!actif || !actif.path) return afficher('Enregistrez le document pour voir ses rétroliens.');
    let r;
    try { r = await window.api.retroliens(racine, actif.path); } catch { r = { erreur: 'indisponible' }; }
    if (mien !== numero) return; // une demande plus récente est partie
    if (!r || r.erreur) return afficher('Rétroliens indisponibles pour ce document.');
    if (!r.retroliens.length) return afficher('Aucun document ne cite celui-ci.');
    afficher(null, r.retroliens);
  }

  function rafraichir() {
    clearTimeout(minuteur);
    minuteur = setTimeout(calculer, 150);
  }

  afficher('Ouvrez un dossier pour voir les rétroliens.');
  window.mdr = window.mdr || {};
  window.mdr.wiki = { ouvrirNote, contexte };
  window.mdr.retroliens = { rafraichir, calculer };
})();

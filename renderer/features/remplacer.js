// Rechercher/remplacer dans tous les .md du dossier ouvert (onglet Recherche).
// « Aperçu des changements » (IPC `folder:replace-preview`, lecture seule)
// affiche, par fichier, chaque occurrence avant/après avec une case à cocher
// par fichier et par occurrence ; « Appliquer » (après confirmation) envoie la
// sélection à `folder:replace-apply`, qui n'écrit que dans les .md du dossier
// ouvert et saute un fichier modifié depuis l'aperçu. Les onglets concernés
// sont ensuite rechargés.
(() => {
  const $ = (id) => document.getElementById(id);
  const annoncer = (m) => { if (typeof annoncerLot === 'function') annoncerLot(m); };
  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };
  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
  const cleChemin = (p) => String(p).replace(/\\/g, '/').toLowerCase();

  let dernier = null; // { parametres, fichiers } de l'aperçu affiché

  const parametres = () => ({
    recherche: $('search-input').value,
    remplacement: $('replace-input').value,
    casse: $('opt-casse').checked,
    motEntier: $('opt-mot').checked,
    regex: $('opt-regex').checked,
  });

  function vider() {
    dernier = null;
    const z = $('replace-preview');
    z.textContent = '';
    z.classList.add('hidden');
  }

  function message(texte, classe) {
    const z = $('replace-preview');
    z.textContent = '';
    z.classList.remove('hidden');
    z.appendChild(el('div', texte, classe));
  }

  // Occurrences cochées de chaque fichier : [{ rel, empreinte, indices }].
  function selection() {
    const sortie = [];
    document.querySelectorAll('#replace-preview .rp-fichier').forEach((bloc) => {
      const indices = Array.from(bloc.querySelectorAll('.rp-occ input:checked')).map((c) => Number(c.dataset.indice));
      if (indices.length) sortie.push({ rel: bloc.dataset.rel, empreinte: bloc.dataset.empreinte, indices });
    });
    return sortie;
  }

  function majCompteur() {
    const total = selection().reduce((n, f) => n + f.indices.length, 0);
    const b = $('replace-apply');
    if (b) { b.disabled = total === 0; b.textContent = total ? `Appliquer (${pluriel(total, 'remplacement', 'remplacements')})` : 'Appliquer'; }
    document.querySelectorAll('#replace-preview .rp-fichier').forEach((bloc) => {
      const cases = Array.from(bloc.querySelectorAll('.rp-occ input'));
      const cochees = cases.filter((c) => c.checked).length;
      const maitre = bloc.querySelector('summary input');
      maitre.checked = cochees === cases.length;
      maitre.indeterminate = cochees > 0 && cochees < cases.length;
    });
  }

  function afficherApercu(r) {
    const z = $('replace-preview');
    z.textContent = '';
    z.classList.remove('hidden');
    if (!r.fichiers.length) { z.appendChild(el('div', 'Aucune occurrence dans le dossier.', 'resume')); return; }
    z.appendChild(el('div', `${pluriel(r.total, 'occurrence', 'occurrences')} dans ${pluriel(r.fichiers.length, 'fichier', 'fichiers')}${r.tronque ? ' (liste tronquée : affinez la recherche)' : ''}`, 'resume'));
    const appliquer = el('button', 'Appliquer', undefined);
    appliquer.type = 'button';
    appliquer.id = 'replace-apply';
    appliquer.addEventListener('click', appliquerSelection);
    z.appendChild(appliquer);
    for (const f of r.fichiers) {
      const bloc = el('details', undefined, 'rp-fichier');
      bloc.open = true;
      bloc.dataset.rel = f.rel;
      bloc.dataset.empreinte = f.empreinte;
      const titre = el('summary');
      const maitre = el('input');
      maitre.type = 'checkbox';
      maitre.checked = true;
      maitre.addEventListener('click', (e) => e.stopPropagation());
      maitre.addEventListener('change', () => { bloc.querySelectorAll('.rp-occ input').forEach((c) => { c.checked = maitre.checked; }); majCompteur(); });
      titre.append(maitre, el('span', f.rel, 'rel'), el('span', String(f.occurrences.length)));
      bloc.appendChild(titre);
      for (const o of f.occurrences) {
        const ligne = el('div', undefined, 'rp-occ');
        const label = el('label');
        const c = el('input');
        c.type = 'checkbox';
        c.checked = true;
        c.dataset.indice = String(o.indice);
        c.addEventListener('change', majCompteur);
        label.append(c, el('span', `Ligne ${o.ligne}`));
        ligne.append(label, el('div', '− ' + o.avant, 'rp-avant'), el('div', '+ ' + o.apres, 'rp-apres'));
        bloc.appendChild(ligne);
      }
      z.appendChild(bloc);
    }
    if (r.ignores && r.ignores.length) z.appendChild(el('div', `Ignorés (trop gros ou illisibles) : ${r.ignores.join(', ')}`, 'sautes'));
    majCompteur();
  }

  async function apercu() {
    const racine = window.mdr.dossier();
    if (!racine) { message('Ouvrez un dossier pour rechercher et remplacer.', 'resume'); return null; }
    const p = parametres();
    if (!p.recherche) { message('Saisissez le texte à rechercher.', 'erreur'); return null; }
    message('Recherche en cours…', 'resume');
    let r;
    try { r = await window.api.apercuRemplacement(racine, p); }
    catch (e) { r = { erreur: e && e.message ? e.message : String(e) }; }
    if (!r || r.erreur) { message((r && r.erreur) || 'Aperçu indisponible.', 'erreur'); dernier = null; return null; }
    dernier = { parametres: p, fichiers: r.fichiers };
    afficherApercu(r);
    return r;
  }

  async function appliquerSelection() {
    const racine = window.mdr.dossier();
    if (!racine || !dernier) return null;
    const choix = selection();
    if (!choix.length) { annoncer('Aucune occurrence cochée'); return null; }
    // Un onglet aux modifications non enregistrées n'est pas écrasé : son fichier est ignoré.
    const onglets = window.mdr.onglets.liste();
    const sales = new Set(onglets.filter((t) => t.dirty && t.path).map((t) => cleChemin(t.path)));
    const cheminsParRel = new Map(dernier.fichiers.map((f) => [f.rel, f.chemin]));
    const envoyes = choix.filter((f) => !sales.has(cleChemin(cheminsParRel.get(f.rel) || '')));
    const ignoresSales = choix.length - envoyes.length;
    const total = envoyes.reduce((n, f) => n + f.indices.length, 0);
    if (!envoyes.length) { annoncer('Les fichiers choisis ont des modifications non enregistrées dans leurs onglets : enregistrez-les d’abord'); return null; }
    if (!confirm(`Remplacer ${pluriel(total, 'occurrence', 'occurrences')} dans ${pluriel(envoyes.length, 'fichier', 'fichiers')} ? Les fichiers seront modifiés sur le disque.`)) return null;
    let r;
    try { r = await window.api.appliquerRemplacement(racine, dernier.parametres, envoyes); }
    catch (e) { r = { erreur: e && e.message ? e.message : String(e) }; }
    if (!r || r.erreur) { message((r && r.erreur) || 'Remplacement impossible.', 'erreur'); return null; }

    // Onglets ouverts sur un fichier modifié : rechargés depuis le disque.
    let recharges = 0;
    for (const m of r.modifies) {
      const t = window.mdr.onglets.liste().find((x) => x.path && cleChemin(x.path) === cleChemin(m.chemin));
      if (!t || t.dirty) continue;
      try {
        const data = await window.api.readFile(m.chemin);
        if (data && typeof data.content === 'string') { window.mdr.onglets.recharger(t, data.content); recharges += 1; }
      } catch { /* l'onglet garde son contenu précédent */ }
    }
    const faits = r.modifies.reduce((n, m) => n + m.remplacements, 0);
    const resume = [`${pluriel(faits, 'remplacement', 'remplacements')} dans ${pluriel(r.modifies.length, 'fichier', 'fichiers')}`];
    if (r.sautes.length) resume.push(`${pluriel(r.sautes.length, 'fichier sauté', 'fichiers sautés')} (${r.sautes.map((s) => `${s.rel} : ${s.raison}`).join(' ; ')})`);
    if (ignoresSales) resume.push(`${pluriel(ignoresSales, 'fichier ignoré', 'fichiers ignorés')} (modifications non enregistrées dans l’onglet)`);
    if (recharges) resume.push(`${pluriel(recharges, 'onglet rechargé', 'onglets rechargés')}`);
    annoncer(resume.join(', '));
    message(resume.join(', '), 'resume');
    dernier = null;
    if (window.mdr.tags) window.mdr.tags.rafraichir();
    if (window.mdr.retroliens) window.mdr.retroliens.rafraichir();
    return r;
  }

  $('replace-preview-btn').addEventListener('click', apercu);
  // Changer un paramètre invalide l'aperçu affiché : il ne correspondrait plus à la demande.
  for (const id of ['search-input', 'replace-input', 'opt-casse', 'opt-mot', 'opt-regex']) {
    $(id).addEventListener(id.startsWith('opt-') ? 'change' : 'input', vider);
  }

  function ouvrirRechercheRemplacement() {
    const bouton = document.querySelector('.sidebar-tabs [data-tab="search"]');
    if (bouton) bouton.click();
    $('search-input').focus();
  }

  window.mdr = window.mdr || {};
  window.mdr.remplacer = { apercu, appliquer: appliquerSelection, parametres, ouvrir: ouvrirRechercheRemplacement };
  window.commands.register({ id: 'recherche:remplacer-dossier', titre: 'Rechercher/remplacer dans le dossier…', executer: ouvrirRechercheRemplacement });
})();

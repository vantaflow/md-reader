// Petites modales réutilisables des fonctions d'écriture : fenêtre générique
// (`ouvrir`), saisie d'un texte (`demander`, `window.prompt` n'existe pas dans
// Electron) et choix dans une liste filtrable (`choisir`). Elles réutilisent
// les styles `.modal` existants. Échap ferme la modale la plus récente avant
// toute autre couche (écouteur en phase de capture).
(() => {
  const pile = [];

  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };

  // options : { id, titre, classe, corps(conteneur), boutons: [{ libelle, id, primaire,
  // action() }], auFermer() }. Une action qui renvoie false laisse la modale ouverte.
  function ouvrir({ id, titre, classe = '', corps, boutons = [], auFermer }) {
    const focusPrecedent = document.activeElement;
    const racine = el('div', undefined, 'modal');
    if (id) racine.id = id;
    const contenu = el('div', undefined, ('modal-content ' + classe).trim());
    contenu.setAttribute('role', 'dialog');
    contenu.setAttribute('aria-label', titre);
    contenu.appendChild(el('h3', titre));
    const zone = el('div', undefined, 'modale-corps');
    contenu.appendChild(zone);
    if (typeof corps === 'function') corps(zone); else if (corps) zone.appendChild(corps);
    const actions = el('div', undefined, 'modal-actions');
    const poignee = { racine, zone, ferme: false };
    function fermer(valeur) {
      if (poignee.ferme) return;
      poignee.ferme = true;
      const i = pile.indexOf(poignee);
      if (i >= 0) pile.splice(i, 1);
      racine.remove();
      if (auFermer) auFermer(valeur);
      if (focusPrecedent && document.contains(focusPrecedent) && focusPrecedent.offsetParent !== null) focusPrecedent.focus();
    }
    poignee.fermer = fermer;
    for (const b of boutons) {
      const btn = el('button', b.libelle, b.primaire ? 'primary' : '');
      btn.type = 'button';
      if (b.id) btn.id = b.id;
      btn.addEventListener('click', () => { if (!b.action || b.action(poignee) !== false) fermer(b.primaire ? 'ok' : 'annule'); });
      actions.appendChild(btn);
    }
    contenu.appendChild(actions);
    racine.appendChild(contenu);
    racine.addEventListener('click', (e) => { if (e.target === racine) fermer('annule'); });
    document.body.appendChild(racine);
    pile.push(poignee);
    return poignee;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !pile.length) return;
    e.stopPropagation();
    e.preventDefault();
    pile[pile.length - 1].fermer('annule');
  }, true);

  // Saisie d'une ligne de texte : promesse du texte validé, ou null si annulé.
  function demander({ titre, libelle, valeur = '', ok = 'Valider', placeholder = '' }) {
    return new Promise((resolve) => {
      let champ;
      let fini = false;
      const terminer = (v) => { if (!fini) { fini = true; resolve(v); } };
      const m = ouvrir({
        id: 'modale-saisie',
        titre,
        classe: 'saisie',
        corps(zone) {
          const label = el('label', libelle);
          champ = el('input');
          champ.type = 'text';
          champ.id = 'modale-saisie-champ';
          champ.value = valeur;
          champ.placeholder = placeholder;
          label.appendChild(champ);
          zone.appendChild(label);
          champ.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const v = champ.value.trim(); if (v) { terminer(v); m.fermer('ok'); } }
          });
        },
        boutons: [
          { libelle: 'Annuler', id: 'modale-saisie-annuler' },
          { libelle: ok, id: 'modale-saisie-ok', primaire: true, action: () => { const v = champ.value.trim(); if (!v) return false; terminer(v); return true; } },
        ],
        auFermer: () => terminer(null),
      });
      champ.focus();
      champ.select();
    });
  }

  // Choix dans une liste : items [{ id, libelle, detail }]. Promesse de l'id
  // choisi, ou null. Saisie = filtre ; flèches, Entrée, clic.
  function choisir({ titre, items, vide = 'Aucun élément.', filtre = true }) {
    return new Promise((resolve) => {
      let fini = false;
      const terminer = (v) => { if (!fini) { fini = true; resolve(v); } };
      let visibles = items.slice();
      let actif = 0;
      let liste;
      let champ;
      const rendre = () => {
        liste.textContent = '';
        if (!visibles.length) { liste.appendChild(el('li', items.length ? 'Aucun résultat.' : vide, 'modale-vide')); return; }
        visibles.forEach((it, i) => {
          const li = el('li', undefined, 'modale-item' + (i === actif ? ' actif' : ''));
          li.dataset.id = it.id;
          li.appendChild(el('span', it.libelle, 'modale-libelle'));
          if (it.detail) li.appendChild(el('span', it.detail, 'modale-detail'));
          li.addEventListener('click', () => { terminer(it.id); m.fermer('ok'); });
          liste.appendChild(li);
        });
      };
      const m = ouvrir({
        id: 'modale-choix',
        titre,
        classe: 'choix',
        corps(zone) {
          champ = el('input');
          champ.type = 'text';
          champ.id = 'modale-choix-filtre';
          champ.placeholder = 'Filtrer…';
          champ.autocomplete = 'off';
          if (!filtre) champ.style.display = 'none';
          liste = el('ul', undefined, 'modale-liste');
          zone.appendChild(champ);
          zone.appendChild(liste);
          champ.addEventListener('input', () => {
            const q = champ.value.toLowerCase();
            visibles = items.filter((it) => (it.libelle + ' ' + (it.detail || '')).toLowerCase().includes(q));
            actif = 0;
            rendre();
          });
          champ.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); actif = Math.min(actif + 1, visibles.length - 1); rendre(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); actif = Math.max(actif - 1, 0); rendre(); }
            else if (e.key === 'Enter') { e.preventDefault(); const it = visibles[actif]; if (it) { terminer(it.id); m.fermer('ok'); } }
          });
          rendre();
        },
        boutons: [{ libelle: 'Annuler', id: 'modale-choix-annuler' }],
        auFermer: () => terminer(null),
      });
      champ.focus();
    });
  }

  window.mdr = window.mdr || {};
  window.mdr.modale = { ouvrir, demander, choisir, nombreOuvertes: () => pile.length };
})();

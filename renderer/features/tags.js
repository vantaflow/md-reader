// Filtre par tags dans l'onglet Fichiers : les tags du front-matter (`tags:`)
// de chaque .md du dossier ouvert sont lus par l'IPC bornée `folder:scan-tags`
// (lecture seule). Cliquer sur un tag, ou saisir du texte, filtre l'arborescence.
(() => {
  const lib = window.mdrTags;
  let fichiers = [];          // [{ rel, chemin, tags }]
  const selection = new Set(); // tags choisis (minuscules) : le fichier doit tous les porter
  let texte = '';
  let minuteur = null;
  let numero = 0;

  const actif = () => selection.size > 0 || texte !== '';

  // Un fichier de l'arbre passe le filtre s'il porte tous les tags choisis et,
  // si du texte est saisi, un tag qui le contient.
  function garde(item) {
    const f = fichiers.find((x) => lib.clePath(x.chemin) === lib.clePath(item.path));
    if (!f) return false;
    const tags = f.tags.map((t) => t.toLowerCase());
    if (![...selection].every((t) => tags.includes(t))) return false;
    return !texte || tags.some((t) => t.includes(texte));
  }

  function rendreListe() {
    const zone = document.getElementById('tags-liste');
    const bloc = document.getElementById('tags-filtre');
    zone.textContent = '';
    const comptes = lib.compterTags(fichiers);
    bloc.classList.toggle('hidden', !comptes.length);
    for (const { tag, nombre } of comptes) {
      if (texte && !tag.toLowerCase().includes(texte) && !selection.has(tag.toLowerCase())) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag' + (selection.has(tag.toLowerCase()) ? ' actif' : '');
      b.dataset.tag = tag;
      b.textContent = `#${tag} (${nombre})`;
      b.addEventListener('click', () => basculerTag(tag));
      zone.appendChild(b);
    }
    if (actif()) {
      const e = document.createElement('button');
      e.type = 'button';
      e.className = 'tag effacer';
      e.textContent = 'Effacer le filtre';
      e.addEventListener('click', effacer);
      zone.appendChild(e);
    }
  }

  function appliquer() {
    rendreListe();
    window.mdr.arbre.rendre();
  }

  function basculerTag(tag) {
    const k = tag.toLowerCase();
    if (selection.has(k)) selection.delete(k); else selection.add(k);
    appliquer();
  }

  function effacer() {
    selection.clear();
    texte = '';
    document.getElementById('tags-champ').value = '';
    appliquer();
  }

  async function calculer() {
    const mien = ++numero;
    const racine = window.mdr.dossier();
    if (!racine) { fichiers = []; return rendreListe(); }
    let r;
    try { r = await window.api.scannerTags(racine); } catch { r = { erreur: 'indisponible' }; }
    if (mien !== numero) return;
    fichiers = r && !r.erreur && Array.isArray(r.fichiers) ? r.fichiers : [];
    // Un tag qui n'existe plus ne doit pas laisser un filtre invisible.
    const connus = new Set(lib.compterTags(fichiers).map((c) => c.tag.toLowerCase()));
    for (const k of [...selection]) if (!connus.has(k)) selection.delete(k);
    appliquer();
  }

  function rafraichir() {
    clearTimeout(minuteur);
    minuteur = setTimeout(calculer, 200);
  }

  document.getElementById('tags-champ').addEventListener('input', (e) => {
    texte = e.target.value.trim().replace(/^#/, '').toLowerCase();
    appliquer();
  });

  window.mdr = window.mdr || {};
  window.mdr.tags = { actif, garde, rafraichir, calculer, basculerTag, effacer, liste: () => fichiers.slice() };
})();

// Favoris : fichiers épinglés, affichés en haut de l'onglet Fichiers. La liste
// (chemins absolus) est mémorisée dans les réglages (réglage `favoris`). On
// épingle par l'étoile de l'arbre ou par la commande de palette « Épingler /
// Désépingler le document ».
(() => {
  const FAVORIS_MAX = 100;
  const reglages = () => window.mdrSettings;
  const liste = () => reglages().get('favoris');
  const nom = (chemin) => chemin.split(/[\\/]/).pop();
  const annoncer = (m) => { if (typeof annoncerLot === 'function') annoncerLot(m); };
  const memeChemin = (a, b) => a === b;

  const estFavori = (chemin) => liste().some((p) => memeChemin(p, chemin));

  function basculer(chemin) {
    if (typeof chemin !== 'string' || !chemin) return false;
    const actuelle = liste();
    if (estFavori(chemin)) { reglages().set('favoris', actuelle.filter((p) => !memeChemin(p, chemin))); rendre(); return false; }
    if (actuelle.length >= FAVORIS_MAX) { annoncer(`Limite de ${FAVORIS_MAX} favoris atteinte`); return false; }
    reglages().set('favoris', [...actuelle, chemin]);
    rendre();
    return true;
  }

  async function ouvrir(chemin) {
    const deja = window.mdr.onglets.liste().find((t) => t.path === chemin);
    if (deja) { window.mdr.onglets.activer(deja); return; }
    try {
      const data = await window.api.readFile(chemin);
      window.mdr.onglets.ouvrir({ path: data.path || chemin, content: data.content });
    } catch { annoncer(`Favori introuvable : ${nom(chemin)}`); }
  }

  // Étoile d'une ligne de l'arbre des fichiers.
  function etoile(chemin) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'etoile' + (estFavori(chemin) ? ' epingle' : '');
    b.textContent = estFavori(chemin) ? '★' : '☆';
    b.title = estFavori(chemin) ? 'Retirer des favoris' : 'Épingler dans les favoris';
    b.addEventListener('click', (e) => { e.stopPropagation(); basculer(chemin); });
    return b;
  }

  function rendre() {
    const zone = document.getElementById('favoris');
    if (!zone) return;
    const favoris = liste();
    zone.textContent = '';
    zone.classList.toggle('hidden', !favoris.length);
    if (favoris.length) {
      const t = document.createElement('div');
      t.className = 'section-titre';
      t.textContent = 'Favoris';
      zone.appendChild(t);
      const actif = window.mdr.onglets ? window.mdr.onglets.actif() : null;
      for (const chemin of favoris) {
        const d = document.createElement('div');
        d.className = 'favori' + (actif && actif.path === chemin ? ' active' : '');
        d.dataset.chemin = chemin;
        d.title = chemin;
        const n = document.createElement('span');
        n.className = 'nom';
        n.textContent = '★ ' + nom(chemin);
        const r = document.createElement('button');
        r.type = 'button';
        r.className = 'retirer';
        r.textContent = '✕';
        r.title = 'Retirer des favoris';
        r.addEventListener('click', (e) => { e.stopPropagation(); basculer(chemin); });
        d.append(n, r);
        d.addEventListener('click', () => ouvrir(chemin));
        zone.appendChild(d);
      }
    }
    // Les étoiles de l'arbre reflètent l'état courant.
    document.querySelectorAll('#file-tree .file').forEach((f) => {
      const e = f.querySelector('.etoile');
      if (!e) return;
      const ok = estFavori(f.dataset.path);
      e.classList.toggle('epingle', ok);
      e.textContent = ok ? '★' : '☆';
      e.title = ok ? 'Retirer des favoris' : 'Épingler dans les favoris';
    });
  }

  function basculerDocument() {
    const actif = window.mdr.onglets.actif();
    if (!actif || !actif.path) { annoncer('Enregistrez le document pour l’épingler'); return false; }
    const epingle = basculer(actif.path);
    annoncer(epingle ? `« ${nom(actif.path)} » épinglé dans les favoris` : `« ${nom(actif.path)} » retiré des favoris`);
    return epingle;
  }

  window.mdr = window.mdr || {};
  window.mdr.favoris = { liste, estFavori, basculer, basculerDocument, etoile, rendre, ouvrir };
  window.commands.register({ id: 'nav:favori-basculer', titre: 'Épingler/Désépingler le document', executer: basculerDocument });
  rendre();
})();

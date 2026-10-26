// Calcul des liens vers les autres documents .md : chemin relatif entre deux
// emplacements, nom de note pour `[[…]]`, filtrage des propositions.
// Fonctions pures, sans accès disque (l'IPC `folder:list-md-relatifs` fournit
// la liste). Format UMD : global `window.mdrLiens` dans le renderer.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrLiens = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const normaliser = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  const decouper = (p) => normaliser(p).split('/').filter((s, i) => s !== '' || i === 0);
  // Windows : les lettres de lecteur et les chemins ne distinguent pas la casse.
  const insensible = (p) => /^[a-z]:/i.test(normaliser(p));

  // Chemin relatif (séparateur `/`) du dossier `depuisDossier` vers le fichier
  // `versFichier`, tous deux absolus.
  function cheminRelatif(depuisDossier, versFichier) {
    const de = decouper(depuisDossier);
    const vers = decouper(versFichier);
    const ci = insensible(depuisDossier) || insensible(versFichier);
    const egal = (a, b) => (ci ? a.toLowerCase() === b.toLowerCase() : a === b);
    let i = 0;
    while (i < de.length && i < vers.length - 1 && egal(de[i], vers[i])) i += 1;
    const remontees = de.length - i;
    return [...Array(Math.max(0, remontees)).fill('..'), ...vers.slice(i)].join('/') || '.';
  }

  // Adresse à placer dans `](…)` : espaces et parenthèses encodés.
  const versAdresse = (rel) => rel.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

  // Nom de note pour `[[…]]` : nom du fichier sans extension.
  function nomNote(rel) {
    const nom = normaliser(rel).split('/').pop();
    return nom.replace(/\.(md|markdown|mdown|mkd)$/i, '');
  }

  // Propositions pour `](` : fichiers `fichiers` (relatifs à `racine`) exprimés
  // relativement à `dossierDocument` ; filtrées par la saisie.
  function propositionsLiens({ racine, fichiers, dossierDocument, saisie = '', chemin = null }) {
    const base = dossierDocument || racine;
    const q = String(saisie).toLowerCase();
    return fichiers
      .map((f) => ({ rel: cheminRelatif(base, normaliser(racine) + '/' + f), fichier: f }))
      .filter((p) => !chemin || normaliser(chemin) !== normaliser(racine) + '/' + p.fichier)
      .filter((p) => !q || p.rel.toLowerCase().includes(q))
      .map((p) => ({ label: p.rel, apply: versAdresse(p.rel), detail: nomNote(p.fichier) }));
  }

  // Propositions pour `[[` : noms de notes.
  function propositionsNotes({ fichiers, saisie = '' }) {
    const q = String(saisie).toLowerCase();
    const vus = new Set();
    const sortie = [];
    for (const f of fichiers) {
      const nom = nomNote(f);
      const cle = nom.toLowerCase();
      if (vus.has(cle) || (q && !cle.includes(q))) continue;
      vus.add(cle);
      sortie.push({ label: nom, apply: nom, detail: normaliser(f) });
    }
    return sortie;
  }

  return { cheminRelatif, versAdresse, nomNote, propositionsLiens, propositionsNotes };
});

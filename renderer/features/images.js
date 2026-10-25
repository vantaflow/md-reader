// Image collée ou glissée dans l'éditeur : les octets partent vers l'IPC
// `image:save` (processus principal : écriture bornée dans `images/` à côté du
// document), puis `![nom](images/nom.png)` est inséré au curseur (collage) ou à
// la position du dépôt (glisser). Document non enregistré : confirmation
// d'abord, enregistrement par le flux habituel, puis poursuite ; si l'utilisateur
// annule, rien n'est inséré.
(() => {
  // Capture collée : le navigateur la nomme « image.png » (nom générique).
  const nomGenerique = (f) => !f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name);

  function annoncer(message) {
    if (typeof annoncerLot === 'function') annoncerLot(message);
  }

  // Garantit que le document actif a un chemin ; renvoie ce chemin, ou null si
  // l'utilisateur refuse ou annule.
  async function assurerEnregistre() {
    const onglets = window.mdr.onglets;
    const t = onglets.actif();
    if (!t) return null;
    if (t.path) return t.path;
    const ok = window.confirm('Ce document n’est pas encore enregistré.\n\nL’image sera copiée dans un dossier « images » à côté du document : enregistrez-le d’abord ?');
    if (!ok) return null;
    await onglets.enregistrer();
    return onglets.actif() && onglets.actif().path ? onglets.actif().path : null;
  }

  async function inserer(fichiers, { source = 'paste', pos = null } = {}) {
    const ed = window.mdr.editeur();
    if (!ed || !fichiers || !fichiers.length) return false;
    const chemin = await assurerEnregistre();
    if (!chemin) return false;
    const liens = [];
    for (const f of fichiers) {
      try {
        const octets = new Uint8Array(await f.arrayBuffer());
        const nom = source === 'paste' && nomGenerique(f) ? null : f.name;
        const r = await window.api.enregistrerImage({ cheminDocument: chemin, nom, octets, mime: f.type });
        if (!r || r.erreur) { annoncer('Image non ajoutée : ' + ((r && r.erreur) || 'erreur inconnue')); continue; }
        const alt = r.nom.replace(/\.[^.]+$/, '');
        liens.push(`![${alt}](${r.relatif})`);
      } catch (e) {
        annoncer('Image non ajoutée : ' + (e && e.message ? e.message : e));
      }
    }
    if (!liens.length) return false;
    const view = ed.view;
    const texte = liens.join('\n');
    const sel = view.state.selection.main;
    const taille = view.state.doc.length;
    const de = pos === null ? sel.from : Math.min(pos, taille);
    const a = pos === null ? sel.to : de;
    view.dispatch({ changes: { from: de, to: a, insert: texte }, selection: { anchor: de + texte.length }, scrollIntoView: true });
    view.focus();
    return true;
  }

  window.mdr = window.mdr || {};
  window.mdr.images = { inserer };
})();

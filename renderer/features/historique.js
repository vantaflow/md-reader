// Historique des versions : un instantané du document est pris à chaque
// enregistrement (processus principal, historique.js). La modale liste les
// versions, montre le contenu ou la comparaison ligne à ligne avec le texte
// actuel, et restaure une version dans l'éditeur en une seule transaction
// (annulable avec Cmd/Ctrl+Z) après avoir pris un instantané de l'état courant.
(() => {
  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };
  const annoncer = (m) => { if (window.mdr.rendu) window.mdr.rendu.annoncer(m); };

  async function instantane(chemin, contenu) {
    try { return await window.api.historiqueAjouter({ chemin, contenu }); } catch { return null; }
  }

  const formatDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' });
  };

  function rendreApercu(zone, contenu) {
    zone.textContent = '';
    zone.appendChild(el('pre', contenu || '(version vide)', 'histo-texte'));
  }

  function rendreDiff(zone, ancien, actuel) {
    zone.textContent = '';
    const d = window.mdrDiff.diffLignes(ancien, actuel);
    const r = window.mdrDiff.resume(d);
    const entete = el('div', r.ajouts || r.suppressions
      ? `Par rapport au texte actuel : ${r.suppressions} ligne(s) de cette version absente(s) du texte actuel, ${r.ajouts} ligne(s) du texte actuel absente(s) de cette version.`
      : 'Cette version est identique au texte actuel.', 'histo-resume');
    zone.appendChild(entete);
    const bloc = el('div', undefined, 'histo-diff');
    for (const l of d) {
      const ligne = el('div', undefined, 'diff-ligne ' + (l.type === '+' ? 'diff-ajout' : l.type === '-' ? 'diff-suppr' : 'diff-egal'));
      ligne.dataset.type = l.type;
      ligne.appendChild(el('span', l.type === '=' ? ' ' : l.type, 'diff-signe'));
      ligne.appendChild(el('span', l.texte === '' ? ' ' : l.texte, 'diff-texte'));
      bloc.appendChild(ligne);
    }
    zone.appendChild(bloc);
  }

  async function ouvrir() {
    const t = window.mdr.onglets.actif();
    if (!t || !t.path) { annoncer('Enregistrez d’abord le document : l’historique des versions n’existe que pour un fichier enregistré.'); return false; }
    const chemin = t.path;
    let res;
    try { res = await window.api.historiqueLister(chemin); } catch (e) { res = { versions: [], erreur: e.message }; }
    const versions = (res && res.versions) || [];
    if (!versions.length) { annoncer('Aucune version enregistrée pour ce document : elles sont créées à chaque enregistrement.'); return false; }

    let choisie = null;
    let mode = 'comparer';
    let contenuChoisi = '';
    let liste; let zone; let btnRestaurer; let btnApercu; let btnComparer;

    const afficher = () => {
      if (!choisie) return;
      btnApercu.classList.toggle('actif', mode === 'apercu');
      btnComparer.classList.toggle('actif', mode === 'comparer');
      if (mode === 'apercu') rendreApercu(zone, contenuChoisi);
      else rendreDiff(zone, contenuChoisi, window.mdr.editeur().getValue());
    };

    const choisir = async (id) => {
      const r = await window.api.historiqueLire({ chemin, id });
      if (!r || typeof r.contenu !== 'string') { zone.textContent = 'Version illisible : ' + ((r && r.erreur) || 'erreur inconnue'); btnRestaurer.disabled = true; return; }
      choisie = id;
      contenuChoisi = r.contenu;
      btnRestaurer.disabled = false;
      liste.querySelectorAll('.histo-item').forEach((b) => b.classList.toggle('actif', b.dataset.id === id));
      afficher();
    };

    const modale = window.mdr.modale.ouvrir({
      id: 'historique-modale',
      titre: 'Historique des versions',
      classe: 'historique',
      corps(c) {
        const colonnes = el('div', undefined, 'histo-colonnes');
        liste = el('ul', undefined, 'histo-liste');
        for (const v of versions) {
          const li = el('li');
          const b = el('button', undefined, 'histo-item');
          b.type = 'button';
          b.dataset.id = v.id;
          b.appendChild(el('span', formatDate(v.date), 'histo-date'));
          b.appendChild(el('span', `${v.taille} o`, 'histo-taille'));
          b.addEventListener('click', () => choisir(v.id));
          li.appendChild(b);
          liste.appendChild(li);
        }
        const droite = el('div', undefined, 'histo-droite');
        const barre = el('div', undefined, 'histo-modes');
        btnApercu = el('button', 'Aperçu'); btnApercu.type = 'button'; btnApercu.id = 'histo-mode-apercu';
        btnComparer = el('button', 'Comparer avec le texte actuel'); btnComparer.type = 'button'; btnComparer.id = 'histo-mode-comparer';
        btnApercu.addEventListener('click', () => { mode = 'apercu'; afficher(); });
        btnComparer.addEventListener('click', () => { mode = 'comparer'; afficher(); });
        barre.append(btnApercu, btnComparer);
        zone = el('div', 'Choisissez une version dans la liste.', 'histo-zone');
        zone.id = 'histo-zone';
        droite.append(barre, zone);
        colonnes.append(liste, droite);
        c.appendChild(colonnes);
      },
      boutons: [
        { libelle: 'Fermer', id: 'histo-fermer' },
        {
          libelle: 'Restaurer cette version', id: 'histo-restaurer', primaire: true,
          action: () => { if (!choisie) return false; restaurer(chemin, contenuChoisi); return true; },
        },
      ],
    });
    btnRestaurer = modale.racine.querySelector('#histo-restaurer');
    btnRestaurer.disabled = true;
    await choisir(versions[0].id);
    return true;
  }

  // Instantané de l'état courant d'abord (rien n'est perdu), puis remplacement
  // du contenu en une transaction : Cmd/Ctrl+Z revient au texte d'avant.
  function restaurer(chemin, contenu) {
    const ed = window.mdr.editeur();
    const actuel = ed.getValue();
    if (actuel !== contenu) {
      instantane(chemin, actuel);
      ed.setValue(contenu);
    }
    annoncer('Version restaurée. Annulez avec ' + (window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+Z pour revenir en arrière.');
  }

  window.commands.register({ id: 'fichier:historique', titre: 'Historique des versions…', executer: ouvrir });
  window.mdr = window.mdr || {};
  window.mdr.historique = { ouvrir, instantane, restaurer };
})();

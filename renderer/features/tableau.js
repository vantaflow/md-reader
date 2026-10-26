// Éditeur de tableau visuel : modale avec une grille de cellules modifiables,
// ajout et suppression de lignes et de colonnes, alignement par colonne.
// S'ouvre sur le tableau Markdown sous le curseur (analysé puis remplacé à
// « Appliquer ») ou en crée un à la position du curseur. La logique (analyse,
// sérialisation alignée, repérage) vit dans lib/tableau.js.
(() => {
  const lib = window.mdrTableau;
  const ALIGNEMENTS = [['gauche', 'G', 'Aligner à gauche'], ['centre', 'C', 'Centrer'], ['droite', 'D', 'Aligner à droite']];

  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };

  function ouvrir() {
    const ed = window.mdr.editeur && window.mdr.editeur();
    if (!ed) return false;
    const view = ed.view;
    const texte = view.state.doc.toString();
    const sel = view.state.selection.main;
    const trouve = lib.trouverTableau(texte, sel.head);
    let modele = trouve ? trouve.modele : lib.nouveau(3, 2);
    const cible = trouve ? { from: trouve.from, to: trouve.to } : null;
    const position = { from: sel.from, to: sel.to };

    let grille;
    // Les saisies en cours sont recopiées dans le modèle avant chaque
    // modification de structure, puis la grille est reconstruite.
    function lireGrille() {
      modele = {
        entete: Array.from(grille.querySelectorAll('thead input')).map((i) => i.value),
        alignements: modele.alignements.slice(),
        lignes: Array.from(grille.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('input')).map((i) => i.value)),
      };
    }
    function modifier(fn, focus) {
      lireGrille();
      modele = fn(modele);
      dessiner();
      if (focus) { const c = grille.querySelector(focus); if (c) c.focus(); }
    }

    function dessiner() {
      grille.textContent = '';
      const thead = el('thead');
      const outils = el('tr', undefined, 'tableau-outils');
      outils.appendChild(el('th'));
      modele.entete.forEach((_, c) => {
        const th = el('th');
        const groupe = el('div', undefined, 'tableau-col-outils');
        for (const [al, court, titre] of ALIGNEMENTS) {
          const b = el('button', court, modele.alignements[c] === al ? 'actif' : '');
          b.type = 'button';
          b.title = titre;
          b.dataset.alignement = al;
          b.dataset.colonne = c;
          b.setAttribute('aria-pressed', String(modele.alignements[c] === al));
          // Un second clic sur l'alignement actif le retire.
          b.addEventListener('click', () => modifier((m) => lib.definirAlignement(m, c, m.alignements[c] === al ? 'aucun' : al)));
          groupe.appendChild(b);
        }
        const sup = el('button', '×', 'danger');
        sup.type = 'button';
        sup.title = 'Supprimer la colonne';
        sup.dataset.supprimerColonne = c;
        sup.disabled = modele.entete.length <= 1;
        sup.addEventListener('click', () => modifier((m) => lib.supprimerColonne(m, c)));
        groupe.appendChild(sup);
        th.appendChild(groupe);
        outils.appendChild(th);
      });
      thead.appendChild(outils);
      const entete = el('tr');
      entete.appendChild(el('th', 'En-tête', 'tableau-etiquette'));
      modele.entete.forEach((v, c) => {
        const th = el('th');
        const i = el('input');
        i.type = 'text';
        i.value = v;
        i.dataset.cellule = `e-${c}`;
        i.style.textAlign = alignCss(modele.alignements[c]);
        i.setAttribute('aria-label', `En-tête, colonne ${c + 1}`);
        th.appendChild(i);
        entete.appendChild(th);
      });
      thead.appendChild(entete);
      grille.appendChild(thead);
      const tbody = el('tbody');
      modele.lignes.forEach((ligne, r) => {
        const tr = el('tr');
        const sup = el('button', '×', 'danger');
        sup.type = 'button';
        sup.title = 'Supprimer la ligne';
        sup.dataset.supprimerLigne = r;
        sup.addEventListener('click', () => modifier((m) => lib.supprimerLigne(m, r)));
        const tdSup = el('td', undefined, 'tableau-etiquette');
        tdSup.appendChild(sup);
        tr.appendChild(tdSup);
        ligne.forEach((v, c) => {
          const td = el('td');
          const i = el('input');
          i.type = 'text';
          i.value = v;
          i.dataset.cellule = `${r}-${c}`;
          i.style.textAlign = alignCss(modele.alignements[c]);
          i.setAttribute('aria-label', `Ligne ${r + 1}, colonne ${c + 1}`);
          td.appendChild(i);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      grille.appendChild(tbody);
    }
    const alignCss = (a) => (a === 'centre' ? 'center' : a === 'droite' ? 'right' : 'left');

    function appliquer() {
      lireGrille();
      const md = lib.serialiser(modele);
      if (cible) {
        view.dispatch({ changes: { from: cible.from, to: cible.to, insert: md }, selection: { anchor: cible.from + md.length }, scrollIntoView: true });
      } else {
        // Nouveau tableau : sur la ligne vide du curseur, sinon sous la ligne
        // courante ; toujours séparé du texte voisin par une ligne vide.
        const doc = view.state.doc;
        const ligne = doc.lineAt(position.from);
        let de;
        let a;
        let insert;
        if (ligne.text.trim() === '') {
          de = ligne.from;
          a = ligne.to;
          const precedenteVide = ligne.number === 1 || doc.line(ligne.number - 1).text.trim() === '';
          insert = (precedenteVide ? '' : '\n') + md;
        } else {
          de = ligne.to;
          a = ligne.to;
          insert = '\n\n' + md + '\n';
        }
        view.dispatch({ changes: { from: de, to: a, insert }, selection: { anchor: de + insert.length - (insert.endsWith('\n') ? 1 : 0) }, scrollIntoView: true });
      }
      view.focus();
    }

    const m = window.mdr.modale.ouvrir({
      id: 'tableau-modal',
      titre: cible ? 'Modifier le tableau' : 'Insérer un tableau',
      classe: 'tableau-editeur',
      corps(zone) {
        const barre = el('div', undefined, 'tableau-barre');
        const bouton = (texte, id, fn) => {
          const b = el('button', texte);
          b.type = 'button';
          b.id = id;
          b.addEventListener('click', fn);
          barre.appendChild(b);
        };
        bouton('+ Ligne', 'tableau-ajouter-ligne', () => modifier((mo) => lib.ajouterLigne(mo), `[data-cellule="${modele.lignes.length}-0"]`));
        bouton('+ Colonne', 'tableau-ajouter-colonne', () => modifier((mo) => lib.ajouterColonne(mo), `[data-cellule="e-${modele.entete.length}"]`));
        zone.appendChild(barre);
        const defile = el('div', undefined, 'tableau-defilement');
        grille = el('table', undefined, 'tableau-grille');
        defile.appendChild(grille);
        zone.appendChild(defile);
        dessiner();
      },
      boutons: [
        { libelle: 'Annuler', id: 'tableau-annuler' },
        { libelle: 'Appliquer', id: 'tableau-appliquer', primaire: true, action: () => { appliquer(); } },
      ],
    });
    const premier = grille.querySelector('input');
    if (premier) premier.focus();
    return m;
  }

  window.mdr = window.mdr || {};
  window.mdr.tableauUI = { ouvrir, estOuvert: () => !!document.getElementById('tableau-modal') };

  const tab = window.mdrRaccourcis;
  const accel = tab.afficher(tab.parId('ecriture:tableau-editeur')?.accel, window.api && window.api.platform) || undefined;
  window.commands.register({ id: 'ecriture:tableau-editeur', titre: 'Format : Éditeur de tableau…', raccourci: accel, executer: () => { ouvrir(); } });

  // Entrée de la barre de mise en forme (après le groupe « Tableau »).
  const barre = document.getElementById('barre-format');
  if (barre) {
    const groupe = el('span', undefined, 'groupe');
    const b = el('button', 'Éditeur de tableau');
    b.type = 'button';
    b.dataset.ecriture = "ecriture:tableau-editeur";
    b.title = `Éditeur de tableau (${accel || ''})`.replace(' ()', '');
    b.setAttribute('aria-label', 'Éditeur de tableau');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => ouvrir());
    groupe.appendChild(b);
    barre.appendChild(groupe);
  }
})();

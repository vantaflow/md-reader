// Modales d'aide : aide-mémoire Markdown, raccourcis clavier (générés depuis
// la table unique renderer/lib/raccourcis.js) et « À propos » (la version est
// lue côté processus principal, via app.getVersion()). Une seule modale
// `#aide-modal`, reconstruite à chaque ouverture.
(() => {
  const tab = window.mdrRaccourcis;
  const plateforme = window.api && window.api.platform;

  const MEMO = [
    ['Titres', ['# Titre 1', '## Titre 2', '### Titre 3']],
    ['Emphase', ['**gras**', '*italique*', '~~barré~~', '`code en ligne`']],
    ['Listes', ['- puce', '1. numérotée', '- [ ] tâche', '- [x] tâche faite']],
    ['Liens et images', ['[texte](https://adresse)', '![texte alternatif](images/image.png)']],
    ['Citation', ['> texte cité']],
    ['Bloc de code', ['```js\nconsole.log(1);\n```']],
    ['Tableau', ['| A | B |\n| --- | --- |\n| 1 | 2 |']],
    ['Filet horizontal', ['---']],
    ['Saut de page', ['<!-- pagebreak -->']],
    ['Note de bas de page', ['Texte[^1]\n\n[^1]: La note.']],
    ['Formule (KaTeX)', ['$E = mc^2$']],
    ['Schéma (Mermaid)', ['```mermaid\ngraph TD; A-->B;\n```']],
  ];

  let modal = null;
  let nom = null;
  let focusPrecedent = null;

  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };

  function tableau(lignes) {
    const t = el('table');
    for (const cellules of lignes) {
      const tr = el('tr');
      for (const c of cellules) {
        const td = el('td');
        if (c instanceof Node) td.appendChild(c); else td.textContent = c;
        tr.appendChild(td);
      }
      t.appendChild(tr);
    }
    return t;
  }

  function contenuMemo() {
    const frag = document.createDocumentFragment();
    frag.appendChild(tableau(MEMO.map(([titre, exemples]) => [titre, el('code', exemples.join('\n'))])));
    return frag;
  }

  function contenuRaccourcis() {
    const frag = document.createDocumentFragment();
    const groupes = [];
    for (const r of tab.TABLE) if (!groupes.includes(r.groupe)) groupes.push(r.groupe);
    for (const g of groupes) {
      frag.appendChild(el('h4', g));
      frag.appendChild(tableau(tab.TABLE.filter((r) => r.groupe === g).map((r) => {
        const accel = plateforme === 'darwin' && r.accelMac ? r.accelMac : r.accel;
        return [r.libelle, el('kbd', tab.afficher(accel, plateforme))];
      })));
    }
    return frag;
  }

  function contenuApropos() {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('p', 'Éditeur Markdown avec export PDF pour macOS et Windows.'));
    const version = el('span', '…');
    version.id = 'apropos-version';
    window.api.version().then((v) => { version.textContent = v; }).catch(() => { version.textContent = 'inconnue'; });
    const lien = el('a', 'github.com/vantaflow/md-to-pdf-app');
    lien.id = 'apropos-depot';
    lien.setAttribute('role', 'link');
    lien.addEventListener('click', (e) => { e.preventDefault(); window.api.ouvrirDepot(); });
    frag.appendChild(tableau([['Nom', 'MD Reader'], ['Version', version], ['Licence', 'MIT'], ['Dépôt', lien]]));
    return frag;
  }

  const TITRES = { memo: 'Aide-mémoire Markdown', raccourcis: 'Raccourcis clavier', apropos: 'À propos de MD Reader' };
  const CONTENUS = { memo: contenuMemo, raccourcis: contenuRaccourcis, apropos: contenuApropos };

  function fermer() {
    if (!modal) return;
    modal.remove();
    modal = null;
    nom = null;
    const p = focusPrecedent;
    focusPrecedent = null;
    if (p && document.contains(p) && p.offsetParent !== null) p.focus();
  }

  function ouvrir(quelle) {
    if (!CONTENUS[quelle]) return false;
    if (modal) fermer();
    focusPrecedent = document.activeElement;
    nom = quelle;
    modal = el('div', undefined, 'modal');
    modal.id = 'aide-modal';
    modal.dataset.aide = quelle;
    const contenu = el('div', undefined, 'modal-content aide');
    contenu.setAttribute('role', 'dialog');
    contenu.setAttribute('aria-label', TITRES[quelle]);
    contenu.appendChild(el('h3', TITRES[quelle]));
    contenu.appendChild(CONTENUS[quelle]());
    const actions = el('div', undefined, 'modal-actions');
    const b = el('button', 'Fermer', 'primary');
    b.type = 'button';
    b.id = 'aide-fermer';
    b.addEventListener('click', fermer);
    actions.appendChild(b);
    contenu.appendChild(actions);
    modal.appendChild(contenu);
    modal.addEventListener('click', (e) => { if (e.target === modal) fermer(); });
    document.body.appendChild(modal);
    b.focus();
    return true;
  }

  window.mdr = window.mdr || {};
  window.mdr.aideUI = { ouvrir, fermer, estOuvert: () => !!modal, ouverte: () => nom };

  window.commands.register({ id: 'aide:memo', titre: 'Aide : aide-mémoire Markdown', executer: () => ouvrir('memo') });
  window.commands.register({ id: 'aide:raccourcis', titre: 'Aide : raccourcis clavier', executer: () => ouvrir('raccourcis') });
  window.commands.register({ id: 'aide:apropos', titre: 'Aide : à propos de MD Reader', executer: () => ouvrir('apropos') });
})();

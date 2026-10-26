// 1.10.0 — mode Document, ruban, tableaux, éditeur de diagramme visuel, styles du
// document et raccourcis Word : tests Electron de bout en bout. Même modèle que
// les autres scripts (harnais partagé, fenêtre cachée, aucun dialogue réel).
const { creerHarnais } = require('./helpers.js');

const zlib = require('zlib');
const h = creerHarnais();

// Lit un fichier d'une archive zip (répertoire central, entrées « deflate »).
function lireZip(buf, nom) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i += 1) {
    const methode = buf.readUInt16LE(p + 10);
    const tailleC = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const fichier = buf.toString('utf8', p + 46, p + 46 + lNom);
    if (fichier === nom) {
      const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const brut = buf.subarray(debut, debut + tailleC);
      return (methode === 8 ? zlib.inflateRawSync(brut) : brut).toString('utf8');
    }
    p += 46 + lNom + lExtra + lCom;
  }
  return null;
}
const { check } = h;
const pause = (ms) => h.attendre(ms);
const mac = process.platform === 'darwin';

const poser = (texte) => h.js(`(() => { const ed = window.mdr.editeur(); ed.setValue(${JSON.stringify(texte)}); return true; })()`);
const cm = () => h.js('window.mdr.editeur().getValue()');
const ctrl = (code) => h.js(`(() => { const c = window.mdr.document.controleur(); return (${code}); })()`);
const clic = (sel) => h.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const touche = (cle, extra = {}) => h.js(`(() => {
  const dom = window.mdr.document.controleur().vue.dom;
  dom.focus();
  const e = new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(cle)}, bubbles: true, cancelable: true, ${mac ? 'metaKey' : 'ctrlKey'}: true }, ${JSON.stringify(extra)}));
  dom.dispatchEvent(e);
  return e.defaultPrevented;
})()`);
const selectionnerTout = () => h.js(`(() => {
  const c = window.mdr.document.controleur(); const v = c.vue;
  const Sel = v.state.selection.constructor;
  let debut = null; let fin = 0;
  v.state.doc.descendants((n, pos) => { if (n.isText) { if (debut === null) debut = pos; fin = pos + n.nodeSize; } });
  v.dispatch(v.state.tr.setSelection(Sel.create(v.state.doc, debut, fin)));
  return true;
})()`);
const sync = async () => { await h.js('window.mdr.document.synchroniser()'); return cm(); };

(async () => {
  await h.demarrer({ stubs: { 'file:export-docx': () => '/tmp/faux.docx' } });

  // ─── 1. Mode Document : bascule, aller-retour sans perte ───────────────────
  const SOURCE = [
    '---', 'title: Rapport', '---', '', '# Titre', '', 'Un **gras**, une *italique*, du `code` et un [lien](https://exemple.org).', '',
    '- [ ] à faire', '- [x] fait', '', '| A | B |', '| :--- | ---: |', '| 1 | 2 |', '', '> [!NOTE]', '> Remarque', '',
    '```js', 'let a = 1;', '```', '', 'Note[^1] et $x^2$.', '', '[^1]: La source.', '', '```mermaid', 'graph TD', '  A --> B', '```', '',
    '<details>', '<summary>Plus</summary>', '', 'Contenu', '', '</details>', '',
  ].join('\n');
  await poser(SOURCE);
  check('Mode — par défaut, le mode code est actif', (await h.js('!window.mdr.document.actif() && !document.querySelector("main").classList.contains("mode-document")')));
  check('Mode — le bouton de l’en-tête existe', await h.js('!!document.getElementById("btn-mode-edition")'));
  const cmds = await h.jsonJs('window.commands.all().map((c) => c.id)');
  for (const id of ['vue:mode-document', 'vue:mode-code', 'vue:mode-edition', 'diagramme:nouveau', 'style:document', 'format:souligne']) check(`Palette — commande ${id}`, cmds.includes(id));
  await clic('#btn-mode-edition');
  await pause(500);
  check('Mode — le bouton bascule en mode Document', await h.js('window.mdr.document.actif() && document.querySelector("main").classList.contains("mode-document")'));
  check('Mode — le réglage « mode d’édition » suit', (await h.js('window.mdr.reglages.get("modeEdition")')) === 'document');
  check('Mode — l’éditeur de code et l’aperçu ne sont plus visibles', await h.js('getComputedStyle(document.getElementById("editor")).display === "none" && document.getElementById("preview").getBoundingClientRect().right < 0'));
  check('Mode — la page contient les éléments du document', await h.js(`(() => { const d = document.querySelector('.pm-doc'); return !!d.querySelector('h1') && !!d.querySelector('strong') && !!d.querySelector('table') && !!d.querySelector('.markdown-alert') && !!d.querySelector('li.tache') && !!d.querySelector('pre.bloc-code') && !!d.querySelector('.mermaid-bloc') && !!d.querySelector('.bloc-brut') && !!d.querySelector('.note-def') && !!d.querySelector('.katex'); })()`));
  check('Mode — la page est une feuille aux dimensions du format', await h.js(`(() => { const r = document.getElementById('document-page'); return r.offsetWidth > 700 && getComputedStyle(r).boxShadow !== 'none'; })()`));
  await h.js('window.mdr.document.sortir()');
  await pause(200);
  check('Aller-retour sans modification : le texte est identique à l’octet près', (await cm()) === SOURCE);
  await h.js('window.commands.run("vue:mode-document")');
  await pause(300);
  check('Mode — la commande de palette ouvre le mode Document', await h.js('window.mdr.document.actif()'));
  await h.js('window.commands.run("vue:mode-edition")');
  await pause(200);
  check('Mode — la commande de bascule revient au mode code', await h.js('!window.mdr.document.actif()'));

  // ─── 2. Édition dans la page → Markdown ────────────────────────────────────
  await poser('# Titre\n\nBonjour le monde\n');
  await h.js('window.mdr.document.entrer()');
  await pause(300);
  await ctrl(`c.insererTexte('Texte ajouté. ')`);
  const apres = await sync();
  check('Édition — la frappe dans la page est réécrite en Markdown', /Texte ajouté\./.test(apres) && apres.startsWith('# ') && /Bonjour le monde/.test(apres), JSON.stringify(apres));
  check('Édition — le document est marqué modifié', await h.js('window.mdr.onglets.actif().dirty'));
  await h.js('window.mdr.document.sortir()');
  check('Édition — retour au mode code : le texte modifié est dans CodeMirror', /Texte ajouté\./.test(await cm()));
  await h.js('window.mdr.document.entrer()');
  await pause(200);
  check('Édition — retour au mode Document : le texte est rechargé', await h.js('document.querySelector(".pm-doc").textContent.includes("Texte ajouté.")'));

  // Un changement extérieur de CodeMirror (autre onglet, disque) recharge la page.
  await poser('# Autre\n\nChangé de l’extérieur\n');
  await pause(100);
  check('Édition — une modification extérieure recharge la page', await h.js('document.querySelector(".pm-doc h1").textContent === "Autre"'));

  // ─── 3. Raccourcis Word ────────────────────────────────────────────────────
  await poser('mot simple\n');
  await pause(100);
  await selectionnerTout();
  await touche('b');
  check('Raccourci — Cmd/Ctrl+B met en gras', (await sync()).trim() === '**mot simple**', await cm());
  await touche('b');
  await touche('i');
  check('Raccourci — Cmd/Ctrl+I met en italique (et B retire le gras)', (await sync()).trim() === '*mot simple*', await cm());
  await touche('i');
  await touche('u');
  check('Raccourci — Cmd/Ctrl+U souligne (balise <u>)', (await sync()).trim() === '<u>mot simple</u>', await cm());
  await touche('u');
  await touche('1', { altKey: true });
  check('Raccourci — Cmd/Ctrl+Alt+1 : titre 1', (await sync()).trim() === '# mot simple', await cm());
  await touche('2', { altKey: true });
  check('Raccourci — Cmd/Ctrl+Alt+2 : titre 2', (await sync()).trim() === '## mot simple');
  await touche('3', { altKey: true });
  check('Raccourci — Cmd/Ctrl+Alt+3 : titre 3', (await sync()).trim() === '### mot simple');
  await touche('3', { altKey: true });
  check('Raccourci — Cmd/Ctrl+Alt+3 de nouveau : retour au paragraphe', (await sync()).trim() === 'mot simple');
  await h.js('window.commands.run("format:gras")');
  check('Raccourci — la commande de menu format:gras agit sur la page', (await sync()).trim() === '**mot simple**');
  await h.js('window.commands.run("format:gras")');
  await touche('k');
  await pause(300);
  check('Raccourci — Cmd/Ctrl+K ouvre la boîte « Lien »', await h.js('!!document.getElementById("modale-lien")'));
  await h.js(`(() => { document.getElementById('modale-lien-href').value = 'https://exemple.org'; document.getElementById('modale-lien-ok').click(); })()`);
  await pause(200);
  check('Raccourci — le lien est appliqué à la sélection', /\[mot simple\]\(https:\/\/exemple\.org\)/.test(await sync()), await cm());
  // Annuler / rétablir
  await ctrl('c.annuler()');
  check('Annuler — retire le lien', !/exemple\.org/.test(await sync()), await cm());
  await ctrl('c.refaire()');
  check('Rétablir — remet le lien', /exemple\.org/.test(await sync()));
  await h.js(`(() => {
    const dom = window.mdr.document.controleur().vue.dom;
    dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true }));
  })()`);
  check('Annuler — le menu natif (événement historyUndo) utilise le même historique', !/exemple\.org/.test(await sync()));
  await h.js(`window.mdr.document.controleur().vue.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyRedo', bubbles: true, cancelable: true }))`);
  check('Rétablir — historyRedo du menu natif', /exemple\.org/.test(await sync()));

  // Mode code : Cmd/Ctrl+U et souligné
  await h.js('window.mdr.document.sortir()');
  await poser('abc');
  await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: 0, head: 3 } })`);
  await h.js('window.commands.run("format:souligne")');
  check('Mode code — le souligné entoure la sélection de <u>', (await cm()) === '<u>abc</u>', await cm());
  await h.js('window.mdr.document.entrer()');
  await pause(200);

  // ─── 4. Ruban ─────────────────────────────────────────────────────────────
  const onglets = await h.jsonJs('[...document.querySelectorAll(".ruban-onglet")].map((b) => b.textContent)');
  check('Ruban — trois onglets : Accueil, Insertion, Mise en page', JSON.stringify(onglets) === JSON.stringify(['Accueil', 'Insertion', 'Mise en page']), JSON.stringify(onglets));
  const accueil = await h.jsonJs('["annuler","refaire","police","taille","gras","italique","souligne","barre","couleur-texte","surlignage","puces","numerotee","taches","retrait-moins","retrait-plus","align-left","align-center","align-right","align-justify","style-bloc","effacer"].filter((c) => !document.querySelector(`#ruban [data-cmd="${c}"]`))');
  check('Ruban — Accueil : tous les contrôles demandés', accueil.length === 0, JSON.stringify(accueil));
  const insertion = await h.jsonJs('["tableau","image","diagramme","lien","saut-page","ligne","symbole","sommaire","note","formule","encadre"].filter((c) => !document.querySelector(`#ruban [data-cmd="${c}"]`))');
  check('Ruban — Insertion : tous les contrôles demandés', insertion.length === 0, JSON.stringify(insertion));
  const miseEnPage = await h.jsonJs('["format-page","marges","orientation","en-tete","pied","numeros-page","styles-document"].filter((c) => !document.querySelector(`#ruban [data-cmd="${c}"]`))');
  check('Ruban — Mise en page : tous les contrôles demandés', miseEnPage.length === 0, JSON.stringify(miseEnPage));

  await poser('Du texte pour la mise en forme\n');
  await pause(100);
  await selectionnerTout();
  await clic('#ruban [data-cmd="gras"]');
  check('Ruban — le bouton Gras met en gras', (await sync()).trim() === '**Du texte pour la mise en forme**');
  await pause(80);
  check('Ruban — le bouton Gras est enfoncé sur la sélection', await h.js('document.querySelector("#ruban [data-cmd=gras]").classList.contains("actif")'));
  await clic('#ruban [data-cmd="gras"]');
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="police"]'); s.value = 'Georgia, serif'; s.dispatchEvent(new Event('change')); })()`);
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="taille"]'); s.value = '14pt'; s.dispatchEvent(new Event('change')); })()`);
  const stylee = await sync();
  check('Ruban — police et taille : <span style> en HTML en ligne', /<span style="font-family:Georgia, serif;font-size:14pt">Du texte pour la mise en forme<\/span>/.test(stylee), stylee);
  await clic('#ruban [data-cmd="couleur-texte"]');
  await clic('#ruban-palette [data-couleur="#ff0000"]');
  check('Ruban — couleur du texte', /color:#ff0000/.test(await sync()));
  await clic('#ruban [data-cmd="surlignage"]');
  await clic('#ruban-palette [data-couleur="#ffff00"]');
  check('Ruban — surlignage : <mark>', /<mark style="background-color:#ffff00">/.test(await sync()));
  await clic('#ruban [data-cmd="souligne"]');
  check('Ruban — souligné : <u>', /<u>/.test(await sync()));
  const mixte = await cm();
  await h.js('window.mdr.document.sortir()');
  check('Ruban — la mise en forme ponctuelle survit au retour en mode code', (await cm()) === mixte);
  await h.js('window.mdr.document.entrer()');
  await pause(200);
  check('Ruban — et au rechargement dans la page (marques relues)', await h.js(`(() => { const s = document.querySelector('.pm-doc span[style]'); return !!s && s.style.color === 'rgb(255, 0, 0)' && !!document.querySelector('.pm-doc u') && !!document.querySelector('.pm-doc mark'); })()`));
  await selectionnerTout();
  await clic('#ruban [data-cmd="effacer"]');
  check('Ruban — effacer la mise en forme', (await sync()).trim() === 'Du texte pour la mise en forme', await cm());

  await clic('#ruban [data-cmd="align-center"]');
  check('Ruban — alignement centré : enveloppe <div align>', /<div align="center">\n\nDu texte pour la mise en forme\n\n<\/div>/.test(await sync()), await cm());
  await clic('#ruban [data-cmd="align-left"]');
  await clic('#ruban [data-cmd="retrait-plus"]');
  check('Ruban — retrait', /margin-left:2em/.test(await sync()));
  await clic('#ruban [data-cmd="retrait-moins"]');
  await clic('#ruban [data-cmd="puces"]');
  check('Ruban — liste à puces', (await sync()).trim() === '- Du texte pour la mise en forme');
  await clic('#ruban [data-cmd="puces"]');
  await clic('#ruban [data-cmd="numerotee"]');
  check('Ruban — liste numérotée', (await sync()).trim() === '1. Du texte pour la mise en forme');
  await clic('#ruban [data-cmd="numerotee"]');
  await clic('#ruban [data-cmd="taches"]');
  check('Ruban — liste de tâches', (await sync()).trim() === '- [ ] Du texte pour la mise en forme', await cm());
  await clic('#ruban [data-cmd="taches"]');
  await clic('#ruban [data-cmd="puces"]');
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="style-bloc"]'); s.value = 'titre2'; s.dispatchEvent(new Event('change')); })()`);
  check('Ruban — style Titre 2', (await sync()).trim() === '## Du texte pour la mise en forme');
  for (const [v, attendu] of [['citation', '> Du texte pour la mise en forme'], ['code', '```\nDu texte pour la mise en forme\n```'], ['normal', 'Du texte pour la mise en forme']]) {
    await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="style-bloc"]'); s.value = 'normal'; s.dispatchEvent(new Event('change')); })()`);
    await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="style-bloc"]'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
    check(`Ruban — style ${v}`, (await sync()).trim() === attendu, await cm());
  }

  // Insertion
  await h.js('window.mdr.ruban.activerOnglet("insertion")');
  await poser('Début\n');
  await pause(100);
  await clic('#ruban [data-cmd="tableau"]');
  const casesTableau = await h.js('document.querySelectorAll("#ruban-tableau .tableau-case").length');
  check('Insertion — le sélecteur de tableau propose une grille', casesTableau === 64, String(casesTableau));
  await clic('#ruban-tableau .tableau-case[data-lignes="3"][data-colonnes="4"]');
  const avecTableau = await sync();
  check('Insertion — tableau 3 × 4 avec ligne d’en-tête', /\| {1,2}\| {1,2}\| {1,2}\| {1,2}\|\n\| --- \| --- \| --- \| --- \|\n/.test(avecTableau.replace(/\|  \|/g, '| |')) || /^\|/m.test(avecTableau), avecTableau);
  check('Insertion — la page contient 3 lignes et 4 colonnes', await h.js('(() => { const t = document.querySelector(".pm-doc table"); return t.rows.length === 3 && t.rows[0].cells.length === 4; })()'));

  // Tableaux : édition
  const T = (cmd) => ctrl(`c.tableau.${cmd}`);
  await T('ligneApres()');
  check('Tableau — ajouter une ligne', await h.js('document.querySelector(".pm-doc table").rows.length === 4'));
  await T('colonneApres()');
  check('Tableau — ajouter une colonne', await h.js('document.querySelector(".pm-doc table").rows[0].cells.length === 5'));
  await T('supprimerColonne()');
  await T('supprimerLigne()');
  check('Tableau — supprimer ligne et colonne', await h.js('(() => { const t = document.querySelector(".pm-doc table"); return t.rows.length === 3 && t.rows[0].cells.length === 4; })()'));
  await T("aligner('center')");
  check('Tableau — alignement de colonne au centre dans le Markdown', /:---:/.test(await sync()), await cm());
  await T("aligner('right')");
  check('Tableau — alignement à droite', /---:/.test(await sync()));
  // Le curseur était dans la première ligne : sa suppression a emporté l'en-tête.
  check('Tableau — supprimer la ligne d’en-tête laisse un tableau sans en-tête', await h.js('document.querySelector(".pm-doc table").rows[0].cells[0].tagName === "TD"'));
  await T('entete()');
  check('Tableau — ajouter la ligne d’en-tête', await h.js('document.querySelector(".pm-doc table").rows[0].cells[0].tagName === "TH"'));
  await T('entete()');
  check('Tableau — retirer la ligne d’en-tête (Markdown : en-tête vide)', await h.js('document.querySelector(".pm-doc table").rows[0].cells[0].tagName === "TD"') && /^\| \| \|/m.test(await sync()), await cm());
  await T('entete()');
  await ctrl('c.tableau.colonneAvant()');
  // Menu contextuel (clic droit)
  const cellule = await h.jsonJs('(() => { const r = document.querySelector(".pm-doc table td").getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; })()');
  await h.js(`(() => {
    const td = document.querySelector('.pm-doc table td');
    window.mdr.document.controleur().vue.focus();
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${cellule.x}, clientY: ${cellule.y} }));
  })()`);
  await pause(100);
  const actions = await h.jsonJs('[...document.querySelectorAll("#document-menu-contextuel button")].map((b) => b.dataset.action)');
  check('Tableau — menu contextuel : lignes, colonnes, alignement, en-tête', ['ligne-avant', 'ligne-apres', 'colonne-avant', 'colonne-apres', 'supprimer-ligne', 'supprimer-colonne', 'supprimer-tableau', 'aligner-gauche', 'aligner-centre', 'aligner-droite', 'entete'].every((a) => actions.includes(a)), JSON.stringify(actions));
  check('Tableau — la fusion est signalée comme indisponible (limite du Markdown)', await h.js('(() => { const b = document.querySelector("#document-menu-contextuel [data-action=fusion]"); return !!b && b.disabled && /Markdown/.test(b.title); })()'));
  await clic('#document-menu-contextuel [data-action="ligne-avant"]');
  check('Tableau — action du menu contextuel (ligne au-dessus)', await h.js('document.querySelector(".pm-doc table").rows.length === 4'));
  check('Tableau — le menu se ferme après l’action', await h.js('!document.getElementById("document-menu-contextuel")'));
  await T('supprimerTableau()');
  check('Tableau — supprimer le tableau', await h.js('!document.querySelector(".pm-doc table")'));

  // Autres insertions
  await poser('Texte\n');
  await pause(100);
  await clic('#ruban [data-cmd="saut-page"]');
  await clic('#ruban [data-cmd="ligne"]');
  await clic('#ruban [data-cmd="sommaire"]');
  await clic('#ruban [data-cmd="note"]');
  await ctrl(`c.insererTexte('Ma note.')`);
  const insertions = await sync();
  check('Insertion — saut de page, ligne, sommaire et note de bas de page', /<!-- pagebreak -->/.test(insertions) && /\n---\n/.test(insertions) && /\[\[toc\]\]/.test(insertions) && /\[\^1\]: Ma note\./.test(insertions), insertions);
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="encadre"]'); s.value = 'warning'; s.dispatchEvent(new Event('change')); })()`);
  check('Insertion — encadré', /> \[!WARNING\]/.test(await sync()));
  await clic('#ruban [data-cmd="symbole"]');
  const nbSymboles = await h.js('document.querySelectorAll("#ruban-symboles .palette-symbole").length');
  check('Insertion — symboles et emoji proposés', nbSymboles > 50, String(nbSymboles));
  await clic('#ruban-symboles .palette-symbole');
  await h.js('window.mdr.ruban.fermerPopup()');
  await clic('#ruban [data-cmd="image"]');
  await pause(200);
  await h.js(`(() => { document.getElementById('modale-image-src').value = 'images/logo.png'; document.getElementById('modale-image-alt').value = 'Logo'; document.getElementById('modale-image-ok').click(); })()`);
  await pause(200);
  check('Insertion — image par adresse', /!\[Logo\]\(images\/logo\.png\)/.test(await sync()));
  await clic('#ruban [data-cmd="lien"]');
  await pause(200);
  check('Insertion — la boîte « Lien » s’ouvre depuis le ruban', await h.js('!!document.getElementById("modale-lien")'));
  await h.js('document.getElementById("modale-lien-annuler").click()');

  // Mise en page
  await h.js('window.mdr.ruban.activerOnglet("mise-en-page")');
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="format-page"]'); s.value = 'A5'; s.dispatchEvent(new Event('change')); })()`);
  check('Mise en page — le format alimente l’export PDF (réglage pdfFormat)', (await h.js('window.mdr.reglages.get("pdfFormat")')) === 'A5');
  check('Mise en page — la page est redimensionnée (A5 = 148 mm)', await h.js('Math.abs(document.getElementById("document-page").offsetWidth - 148 * 96 / 25.4) < 3'));
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="orientation"]'); s.value = 'paysage'; s.dispatchEvent(new Event('change')); })()`);
  check('Mise en page — orientation paysage (pdfPaysage) et page plus large', (await h.js('window.mdr.reglages.get("pdfPaysage")')) === true && await h.js('document.getElementById("document-page").offsetWidth > 148 * 96 / 25.4 + 100'));
  await h.js(`(() => { const s = document.querySelector('#ruban [data-cmd="marges"]'); s.value = '30'; s.dispatchEvent(new Event('change')); })()`);
  check('Mise en page — marges : aperçu A4 (mm) et PDF (pouces)', (await h.js('window.mdr.reglages.get("margeA4Cotes")')) === 30 && Math.abs((await h.js('window.mdr.reglages.get("pdfMarge")')) - 1.18) < 0.01);
  await h.js(`(() => { const e = document.querySelector('#ruban [data-cmd="en-tete"]'); e.value = 'Mon en-tête'; e.dispatchEvent(new Event('change')); const p = document.querySelector('#ruban [data-cmd="pied"]'); p.value = 'Mon pied'; p.dispatchEvent(new Event('change')); })()`);
  await h.js('appliquerDefautsPdf()');
  const opts = await h.jsonJs('readPdfOptions()');
  check('Mise en page — en-tête, pied de page et numéros dans les options du PDF', opts.headerText === 'Mon en-tête' && opts.footerText === 'Mon pied' && opts.pageSize === 'A5' && opts.landscape === true && opts.headerFooter === true, JSON.stringify(opts));
  await h.js(`(() => { const c = document.querySelector('#ruban [data-cmd="numeros-page"]'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
  await h.js('appliquerDefautsPdf()');
  check('Mise en page — les numéros de page se désactivent', (await h.jsonJs('readPdfOptions()')).pageNumbers === false);
  // Remise à l'état d'origine pour la suite.
  await h.js(`(() => { const r = window.mdr.reglages; r.set('pdfFormat', 'A4'); r.set('pdfPaysage', false); r.set('margeA4Haut', 18); r.set('margeA4Cotes', 20); r.set('margeA4Bas', 20); r.set('pdfMarge', 0.5); r.set('pdfNumerosPage', true); r.set('pdfPied', ''); document.getElementById('pdf-header-text').value = ''; })()`);

  // Réglage du mode d'édition par défaut
  await h.js('window.mdr.document.sortir()');
  await h.js('window.mdr.reglages.set("modeEdition", "document")');
  await pause(200);
  check('Réglages — « mode d’édition par défaut » : Document, appliqué à chaud', await h.js('window.mdr.document.actif()'));
  await h.js('window.mdr.reglages.set("modeEdition", "code")');
  await pause(100);
  check('Réglages — retour au mode code', await h.js('!window.mdr.document.actif()'));
  await h.js('window.commands.run("reglages:ouvrir")');
  check('Réglages — le champ existe dans la fenêtre Réglages', await h.js('!!document.getElementById("reglage-modeEdition") && !!document.getElementById("reglage-pdfPied")'));

  // Mode Document au redémarrage
  await h.js('window.mdr.reglages.set("modeEdition", "document")');
  await h.recharger();
  check('Réglages — le mode Document est rouvert au démarrage', await h.js('window.mdr.document.actif()'));
  await h.js('window.mdr.reglages.set("modeEdition", "code")');
  await pause(100);

  // ─── 5. Éditeur de diagramme visuel ────────────────────────────────────────
  await poser('# Doc\n\nAvant\n');
  await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: window.mdr.editeur().getValue().length } })`);
  const promesse = h.js('window.commands.run("diagramme:nouveau")');
  await pause(800);
  check('Diagramme — la modale s’ouvre depuis la commande', await h.js('!!document.getElementById("diagramme-modal")'));
  check('Diagramme — le canevas affiche deux nœuds et un lien', await h.js('document.querySelectorAll("#dg-canevas .dg-noeud").length === 2 && document.querySelectorAll("#dg-canevas .dg-lien").length === 1'));
  check('Diagramme — l’aperçu Mermaid en direct est rendu', await h.js('!!document.querySelector("#dg-apercu svg")'));
  await clic('#dg-ajouter');
  await pause(100);
  check('Diagramme — ajouter un nœud (sélectionné, texte modifiable)', await h.js('document.querySelectorAll("#dg-canevas .dg-noeud").length === 3 && !!document.getElementById("dg-texte")'));
  await h.js(`(() => { const t = document.getElementById('dg-texte'); t.value = 'Décision'; t.dispatchEvent(new Event('input')); const f = document.getElementById('dg-forme'); f.value = 'losange'; f.dispatchEvent(new Event('change')); })()`);
  await pause(250);
  check('Diagramme — texte et forme (losange) du nœud, code généré', /C\{Décision\}/.test(await h.js('document.getElementById("dg-code").textContent')), await h.js('document.getElementById("dg-code").textContent'));
  // Relier par glisser depuis la poignée : B -> C
  const pts = await h.jsonJs(`(() => {
    const r = (id) => { const e = document.querySelector('#dg-canevas .dg-noeud[data-id="' + id + '"]'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    const p = document.querySelector('#dg-canevas .dg-noeud[data-id="B"] .dg-poignee').getBoundingClientRect();
    return { depart: { x: p.left + 5, y: p.top + 5 }, arrivee: r('C') };
  })()`);
  await h.js(`(() => {
    const p = document.querySelector('#dg-canevas .dg-noeud[data-id="B"] .dg-poignee');
    const ev = (type, x, y, cible) => cible.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 }));
    ev('pointerdown', ${pts.depart.x}, ${pts.depart.y}, p);
    ev('pointermove', ${pts.arrivee.x}, ${pts.arrivee.y}, p);
    ev('pointerup', ${pts.arrivee.x}, ${pts.arrivee.y}, p);
  })()`);
  await pause(250);
  check('Diagramme — relier par glisser depuis la poignée', /B --> C/.test(await h.js('document.getElementById("dg-code").textContent')), await h.js('document.getElementById("dg-code").textContent'));
  // Texte sur le lien sélectionné
  await h.js(`(() => { const t = document.getElementById('dg-texte-lien'); t.value = 'oui'; t.dispatchEvent(new Event('input')); })()`);
  await pause(250);
  check('Diagramme — texte sur le lien', /B -->\|oui\| C/.test(await h.js('document.getElementById("dg-code").textContent')));
  // Relier par sélection : A puis Maj+clic sur C
  await h.js(`(() => {
    const ev = (e, x, y, extra) => e.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2 }, extra || {})));
    const c = (id) => { const e = document.querySelector('#dg-canevas .dg-noeud[data-id="' + id + '"]'); const b = e.getBoundingClientRect(); return [e, b.left + 10, b.top + 10]; };
    const a = c('A'); ev(a[0], a[1], a[2]); a[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
    const k = c('C'); ev(k[0], k[1], k[2], { shiftKey: true });
  })()`);
  await pause(250);
  check('Diagramme — relier par sélection (clic puis Maj+clic)', /A --> C/.test(await h.js('document.getElementById("dg-code").textContent')), await h.js('document.getElementById("dg-code").textContent'));
  // Mode « Relier » : D -> A
  await clic('#dg-ajouter');
  await pause(100);
  await clic('#dg-relier');
  await h.js(`(() => {
    const clicNoeud = (id) => { const e = document.querySelector('#dg-canevas .dg-noeud[data-id="' + id + '"]'); const b = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: b.left + 10, clientY: b.top + 10, pointerId: 3 })); };
    clicNoeud('D'); clicNoeud('A');
  })()`);
  await pause(250);
  check('Diagramme — bouton Relier : départ puis arrivée', /D --> A/.test(await h.js('document.getElementById("dg-code").textContent')));
  // Déplacement d'un nœud
  const avantPos = await h.jsonJs(`(() => { const e = document.querySelector('#dg-canevas .dg-noeud[data-id="D"]'); return { x: e.offsetLeft, y: e.offsetTop }; })()`);
  await h.js(`(() => {
    const e = document.querySelector('#dg-canevas .dg-noeud[data-id="D"]'); const b = e.getBoundingClientRect();
    const ev = (t, x, y) => e.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 4 }));
    ev('pointerdown', b.left + 10, b.top + 10); ev('pointermove', b.left + 110, b.top + 70); ev('pointerup', b.left + 110, b.top + 70);
  })()`);
  await pause(250);
  const apresPos = await h.jsonJs(`(() => { const e = document.querySelector('#dg-canevas .dg-noeud[data-id="D"]'); return { x: e.offsetLeft, y: e.offsetTop }; })()`);
  check('Diagramme — déplacer un nœud sur le canevas', apresPos.x === avantPos.x + 100 && apresPos.y === avantPos.y + 60, JSON.stringify([avantPos, apresPos]));
  check('Diagramme — la position est mémorisée dans le code (commentaire %% mdr:pos)', new RegExp(`D=${apresPos.x},${apresPos.y}`).test(await h.js('document.getElementById("dg-code").textContent')));
  // Suppression du nœud D
  await h.js(`(() => { const e = document.querySelector('#dg-canevas .dg-noeud[data-id="D"]'); const b = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: b.left + 10, clientY: b.top + 10, pointerId: 5 })); e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5 })); })()`);
  await clic('#dg-supprimer-noeud');
  await pause(200);
  check('Diagramme — supprimer un nœud supprime ses liens', await h.js('document.querySelectorAll("#dg-canevas .dg-noeud").length === 3') && !/D --> A/.test(await h.js('document.getElementById("dg-code").textContent')));
  await h.js(`(() => { const s = document.getElementById('dg-direction'); s.value = 'LR'; s.dispatchEvent(new Event('change')); })()`);
  await pause(250);
  check('Diagramme — direction LR', /^flowchart LR/.test(await h.js('document.getElementById("dg-code").textContent')));
  await clic('#dg-valider');
  await promesse;
  await pause(200);
  const apresInsertion = await cm();
  check('Diagramme — le bloc ```mermaid est inséré dans le document', /```mermaid\nflowchart LR\n/.test(apresInsertion) && apresInsertion.startsWith('# Doc\n\nAvant\n'), apresInsertion);
  check('Diagramme — le bloc inséré est relisible par l’éditeur visuel', await h.js(`(() => { const MV = window.mdrMermaid; const b = MV.trouverBlocs(window.mdr.editeur().getValue())[0]; return MV.analyser(b.code).ok; })()`));
  await pause(1500);

  // Double-clic sur le diagramme de l'aperçu : modifier puis remplacer.
  const nbBlocsAvant = await h.js('window.mdrMermaid.trouverBlocs(window.mdr.editeur().getValue()).length');
  await h.js(`document.querySelector('#preview .mermaid').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))`);
  await pause(800);
  check('Diagramme — le double-clic sur l’aperçu ouvre l’éditeur sur ce diagramme', await h.js('!!document.getElementById("diagramme-modal") && document.querySelectorAll("#dg-canevas .dg-noeud").length === 3'));
  check('Diagramme — le bouton indique « Remplacer »', (await h.js('document.getElementById("dg-valider").textContent')) === 'Remplacer');
  await clic('#dg-ajouter');
  await pause(100);
  await clic('#dg-valider');
  await pause(300);
  const apresRemplacement = await cm();
  check('Diagramme — le bloc est remplacé (pas dupliqué) avec le nouveau nœud', await h.js('window.mdrMermaid.trouverBlocs(window.mdr.editeur().getValue()).length') === nbBlocsAvant && /E\[Nouveau nœud\]/.test(apresRemplacement) || /D\[Nouveau nœud\]/.test(apresRemplacement), apresRemplacement);
  check('Diagramme — le texte hors du bloc est intact', apresRemplacement.startsWith('# Doc\n\nAvant\n'));

  // Annulation : rien ne change.
  const avantAnnul = await cm();
  await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: window.mdr.editeur().getValue().indexOf('flowchart') + 2 } })`);
  const p2 = h.js('window.commands.run("diagramme:nouveau")');
  await pause(600);
  check('Diagramme — la commande sous le curseur ouvre le diagramme existant', await h.js('document.getElementById("dg-valider").textContent === "Remplacer"'));
  await clic('#dg-annuler');
  await p2;
  check('Diagramme — Annuler ne modifie pas le document', (await cm()) === avantAnnul);

  // Diagramme non reconnu : lecture seule, jamais modifié
  const NON = '# T\n\n```mermaid\nflowchart TD\n  subgraph un\n    A --> B\n  end\n  style A fill:#f9f\n```\n';
  await poser(NON);
  await pause(1200);
  await h.js(`document.querySelector('#preview .mermaid').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))`);
  await pause(800);
  check('Diagramme non reconnu — ouvert en lecture seule avec un message', await h.js('!!document.getElementById("dg-lecture") && /lecture seule/.test(document.getElementById("dg-lecture").textContent) && !document.getElementById("dg-valider") && !!document.getElementById("dg-fermer")'));
  check('Diagramme non reconnu — l’aperçu reste affiché', await h.js('!!document.querySelector("#dg-apercu svg") || /Aperçu impossible/.test(document.getElementById("dg-apercu").textContent)'));
  await clic('#dg-fermer');
  await pause(100);
  check('Diagramme non reconnu — le document n’est pas modifié', (await cm()) === NON);

  // Séquence
  await poser('Texte\n');
  const p3 = h.js('window.commands.run("diagramme:nouveau")');
  await pause(600);
  await h.js(`(() => { const s = document.getElementById('dg-type'); s.value = 'sequence'; s.dispatchEvent(new Event('change')); })()`);
  await pause(300);
  check('Diagramme — séquence : participants et messages en liste', await h.js('document.querySelectorAll("#dg-participants input").length === 2 && document.querySelectorAll("#dg-messages .dg-ligne").length === 2'));
  await clic('#dg-ajouter-participant');
  await clic('#dg-ajouter-message');
  await pause(300);
  check('Diagramme — séquence : le code reflète la liste', /participant C as Participant 3/.test(await h.js('document.getElementById("dg-code").textContent')) && (await h.js('document.getElementById("dg-code").textContent')).split('\n').length === 7);
  await clic('#dg-valider');
  await p3;
  await pause(200);
  check('Diagramme — séquence insérée', /```mermaid\nsequenceDiagram\n/.test(await cm()));

  // Mode Document : diagramme
  await poser('# D\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
  await h.js('window.mdr.document.entrer()');
  await pause(1200);
  check('Diagramme (mode Document) — rendu dans la page', await h.js('!!document.querySelector(".pm-doc .mermaid-bloc svg")'));
  await h.js(`document.querySelector('.pm-doc .mermaid-bloc').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await pause(800);
  check('Diagramme (mode Document) — le double-clic ouvre l’éditeur visuel', await h.js('!!document.getElementById("diagramme-modal") && document.querySelectorAll("#dg-canevas .dg-noeud").length === 2'));
  await clic('#dg-ajouter');
  await clic('#dg-valider');
  await pause(300);
  check('Diagramme (mode Document) — le bloc est remplacé', /N?[A-Z]\[Nouveau nœud\]/.test(await sync()) && (await cm()).split('```mermaid').length === 2, await cm());
  // Insertion depuis le ruban
  await poser('Début\n');
  await pause(100);
  const p4 = h.js('window.commands.run("diagramme:nouveau")');
  await pause(600);
  await clic('#dg-valider');
  await p4;
  await pause(200);
  check('Diagramme (mode Document) — insertion depuis la commande', /```mermaid\nflowchart TD/.test(await sync()));

  // ─── 6. Styles du document ────────────────────────────────────────────────
  await h.js('window.mdr.document.sortir()');
  await poser('---\ntitle: Style\n---\n\n# Titre\n\nTexte avec <span style="color:#ff0000">rouge</span>, <u>souligné</u> et <mark>surligné</mark>.\n');
  await pause(300);
  await h.js(`window.mdr.styleDoc.ecrire({ police: 'Georgia, serif', taille: 13, couleurTitres: '#1a5276', couleurTexte: '#222222' })`);
  await pause(400);
  const fm = await cm();
  check('Styles — écrits dans le front-matter', /police: Georgia, serif\ntaille: 13\ncouleur-titres: "#1a5276"\ncouleur-texte: "#222222"\n---/.test(fm) && /title: Style/.test(fm), fm);
  check('Styles — appliqués à l’aperçu (feuille de style vivante)', await h.js(`(() => { const css = document.getElementById('mdr-style-document').textContent; return /Georgia/.test(css) && /13pt/.test(css) && getComputedStyle(document.querySelector('#preview h1')).color === 'rgb(26, 82, 118)'; })()`));
  check('Styles — l’aperçu garde les balises en ligne', await h.js(`!!document.querySelector('#preview span[style*="color"]') && !!document.querySelector('#preview u') && !!document.querySelector('#preview mark')`));
  const html = await h.js(`(async () => { const o = readPdfOptions(); return await buildPrintableHtml(o); })()`);
  check('Styles — appliqués à l’export PDF (document imprimable)', /font-family: Georgia, serif;/.test(html) && /font-size: 13pt;/.test(html) && /color: #1a5276/.test(html));
  check('Styles — balises en ligne conservées dans l’export PDF', /<span style="color:#ff0000">rouge<\/span>/.test(html) && /<u>souligné<\/u>/.test(html) && /<mark>surligné<\/mark>/.test(html));
  const htmlExport = await h.js(`(async () => { const o = readPdfOptions(); return await buildExportHtml(o); })()`);
  check('Styles — appliqués à l’export HTML', /font-family: Georgia, serif;/.test(htmlExport) && /<span style="color:#ff0000">/.test(htmlExport));
  const docx = JSON.parse(await h.js(`(async () => { const o = await window.mdr.exportDocx.construire(); return JSON.stringify({ taille: o.length, debut: [o[0], o[1]] }); })()`));
  check('Styles — export Word construit avec styles et balises en ligne', docx.taille > 1000 && docx.debut[0] === 0x50 && docx.debut[1] === 0x4b, JSON.stringify(docx));
  const b64 = await h.js(`(async () => { const o = await window.mdr.exportDocx.construire(); let b = ''; for (let i = 0; i < o.length; i += 0x8000) b += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000)); return btoa(b); })()`);
  const xmlDoc = lireZip(Buffer.from(b64, 'base64'), 'word/document.xml') || '';
  const xmlStyles = lireZip(Buffer.from(b64, 'base64'), 'word/styles.xml') || '';
  check('Word — la couleur d’un <span style> est reprise (rouge)', /w:color w:val="FF0000"/.test(xmlDoc));
  check('Word — le souligné <u> et le surlignage <mark> sont repris', /<w:u w:val="single"/.test(xmlDoc) && /w:highlight w:val="yellow"/.test(xmlDoc));
  check('Word — police, taille et couleurs du document (front-matter)', /w:ascii="Georgia"/.test(xmlStyles) && /w:sz w:val="26"/.test(xmlStyles) && /1A5276/.test(xmlStyles) && /222222/.test(xmlStyles), xmlStyles.slice(0, 400));
  // Style dans le mode Document
  await h.js('window.mdr.document.entrer()');
  await pause(300);
  check('Styles — appliqués à la page du mode Document', await h.js(`getComputedStyle(document.querySelector('.pm-doc h1')).color === 'rgb(26, 82, 118)' && getComputedStyle(document.querySelector('.pm-doc')).fontFamily.includes('Georgia')`));
  check('Styles — le front-matter n’apparaît pas dans la page', await h.js('!document.querySelector(".pm-doc").textContent.includes("couleur-titres")'));
  const pStyle = h.js('window.commands.run("style:document")');
  await pause(300);
  check('Styles — la boîte « Styles du document » s’ouvre (palette / ruban)', await h.js('!!document.getElementById("modale-style-document")'));
  await h.js(`(() => { document.getElementById('modale-style-document-police').value = 'Verdana, sans-serif'; document.getElementById('modale-style-document-taille').value = '10'; document.getElementById('modale-style-document-ok').click(); })()`);
  await pStyle;
  await pause(400);
  check('Styles — modifiés depuis la boîte en mode Document : front-matter réécrit', /police: Verdana, sans-serif\ntaille: 10/.test(await sync()), await cm());
  await h.js('window.mdr.document.sortir()');
  check('Styles — texte du document intact après les changements de style', /Texte avec <span style="color:#ff0000">rouge<\/span>, <u>souligné<\/u> et <mark>surligné<\/mark>\./.test(await cm()));

  // Mise en forme ponctuelle dans le mode Document : conservée à l'export
  await h.js('window.mdr.document.entrer()');
  await pause(200);
  const htmlDoc = await h.js(`(async () => buildPrintableHtml(readPdfOptions()))()`);
  check('Styles — la mise en forme ponctuelle faite en mode Document part à l’export', /<span style="color:#ff0000">rouge<\/span>/.test(htmlDoc));
  await h.js('window.mdr.document.sortir()');

  // Raccourcis du tableau, de la table des raccourcis
  const tableau = await h.jsonJs('window.mdrRaccourcis.TABLE.filter((r) => ["format:gras","format:italique","format:souligne","format:lien","format:titre1","format:titre2","format:titre3"].includes(r.id)).map((r) => [r.id, r.accel])');
  check('Raccourcis — table : B, I, U, K, Alt+1..3', tableau.length === 7);

  h.terminer();
})().catch(h.erreurFatale);

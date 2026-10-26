// Lot 2 (1.9.0), écriture — tâches 9 et 10 : tests Electron de bout en bout.
// Même modèle que smoke-lot1.js (harnais partagé, fenêtre cachée, dialogues
// stubés). Le harnais n'exécute pas main.js : les canaux IPC sont simulés avec
// les VRAIES fonctions de donnees.js et contexte.js que main.js utilise.
//
// Ce que ce script NE peut PAS vérifier : le clic droit natif (le menu
// contextuel réel est dessiné par le système), le correcteur orthographique
// réel (dictionnaires, soulignement rouge, suggestions) et les touches de
// menu natives (les accélérateurs sont testés dans test/menu.test.js).
const { Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { creerHarnais } = require('./helpers.js');
const donnees = require('../donnees.js');
const contexte = require('../contexte.js');
const { creerTemplate } = require('../menu.js');

const h = creerHarnais();
const { check } = h;
const pause = (ms) => h.attendre(ms);

const doc = () => h.js('window.mdr.editeur().getValue()');
const poserDoc = (texte, curseur) => h.js(`(() => {
  const ed = window.mdr.editeur();
  ed.setValue(${JSON.stringify(texte)});
  const pos = ${curseur === undefined ? 'ed.getValue().length' : curseur};
  ed.view.dispatch({ selection: { anchor: pos } });
  return true;
})()`);
const clic = (sel) => h.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const echap = () => h.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
const saisir = (sel, valeur) => h.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(valeur)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const commande = (id) => h.js(`window.commands.run(${JSON.stringify(id)})`);

(async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-lot2a-'));
  const ecrireFichier = (rel, c = '# x') => { fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true }); fs.writeFileSync(path.join(racine, rel), c); };
  ecrireFichier('a.md'); ecrireFichier('sous/b.md'); ecrireFichier('sous/Mon Doc.md'); ecrireFichier('.cache/z.md');

  const appelsLangues = [];
  await h.demarrer({
    stubs: {
      'snippets:lire': () => donnees.lireSnippets(h.dossierDonnees),
      'snippets:ecrire': (_e, liste) => donnees.ecrireSnippets(h.dossierDonnees, liste),
      'folder:list-md-relatifs': async (_e, d) => { try { return await donnees.listerMdRelatifs(d); } catch (e) { return { erreur: e.message }; } },
      'correcteur:langues': (_e, choix) => { appelsLangues.push(choix); return contexte.languesCorrecteur(choix); },
      'folder:open': () => ({ root: racine, tree: [] }),
    },
  });
  // La page est déjà chargée : l'appel de démarrage du correcteur est rejoué à chaud.
  await h.recharger();

  // ── Tâche 9a : éditeur de tableau visuel ──────────────────────────────
  const ids = await h.jsonJs(`window.commands.all().map((c) => c.id)`);
  for (const id of ['ecriture:tableau-editeur', 'ecriture:reformater-document', 'ecriture:reformater-selection', 'ecriture:modele', 'ecriture:snippet-inserer', 'ecriture:snippet-enregistrer', 'ecriture:snippet-supprimer']) {
    check(`Commande de palette — ${id} est enregistrée`, ids.includes(id));
  }
  check('Barre de mise en forme — un bouton ouvre l’éditeur de tableau', await h.js(`!!document.querySelector('#barre-format [data-ecriture="ecriture:tableau-editeur"]')`));
  const formatMenu = creerTemplate({ plateforme: 'darwin', recents: [], envoyer: () => {} }).find((m) => m.label === 'Format').submenu;
  check('Menu Format — Éditeur de tableau et Reformater y figurent', ['Éditeur de tableau…', 'Reformater le document', 'Reformater la sélection'].every((l) => formatMenu.some((i) => i.label === l)));

  const texteTableau = 'Avant\n\n| Nom | Qté |\n| --- | --- |\n| Pomme | 3 |\n| Poire | 12 |\n\nAprès\n';
  await poserDoc(texteTableau, texteTableau.indexOf('Pomme'));
  await commande('ecriture:tableau-editeur');
  await pause(150);
  const ouvert = await h.jsonJs(`({
    modale: !!document.getElementById('tableau-modal'),
    entete: Array.from(document.querySelectorAll('#tableau-modal thead input')).map((i) => i.value),
    cellules: Array.from(document.querySelectorAll('#tableau-modal tbody input')).map((i) => i.value),
    titre: document.querySelector('#tableau-modal h3').textContent,
  })`);
  check('Éditeur de tableau — s’ouvre sur le tableau sous le curseur', ouvert.modale && ouvert.titre === 'Modifier le tableau' && JSON.stringify(ouvert.entete) === '["Nom","Qté"]' && JSON.stringify(ouvert.cellules) === '["Pomme","3","Poire","12"]', JSON.stringify(ouvert));
  await saisir('[data-cellule="0-1"]', '5');
  await clic('#tableau-ajouter-ligne');
  await clic('#tableau-ajouter-colonne');
  const apresAjout = await h.jsonJs(`({
    lignes: document.querySelectorAll('#tableau-modal tbody tr').length,
    colonnes: document.querySelectorAll('#tableau-modal thead tr:nth-child(2) input').length,
    saisieConservee: document.querySelector('[data-cellule="0-1"]').value,
  })`);
  check('Éditeur de tableau — ajouter une ligne et une colonne (saisie conservée)', apresAjout.lignes === 3 && apresAjout.colonnes === 3 && apresAjout.saisieConservee === '5', JSON.stringify(apresAjout));
  await saisir('[data-cellule="e-2"]', 'Total');
  await saisir('[data-cellule="2-0"]', 'Prune');
  await clic('[data-colonne="1"][data-alignement="droite"]');
  await clic('[data-colonne="2"][data-alignement="centre"]');
  const alignes = await h.jsonJs(`({
    droite: document.querySelector('[data-colonne="1"][data-alignement="droite"]').getAttribute('aria-pressed'),
    texte: document.querySelector('[data-cellule="1-1"]').style.textAlign,
  })`);
  check('Éditeur de tableau — alignement par colonne (bouton actif, cellules alignées)', alignes.droite === 'true' && alignes.texte === 'right', JSON.stringify(alignes));
  await clic('[data-supprimer-ligne="1"]');
  check('Éditeur de tableau — supprimer une ligne', (await h.js(`document.querySelectorAll('#tableau-modal tbody tr').length`)) === 2);
  await clic('#tableau-ajouter-colonne');
  await clic('[data-supprimer-colonne="3"]');
  check('Éditeur de tableau — supprimer une colonne', (await h.js(`document.querySelectorAll('#tableau-modal thead tr:nth-child(2) input').length`)) === 3);
  await clic('#tableau-appliquer');
  await pause(300);
  const attenduTableau = 'Avant\n\n| Nom   | Qté | Total |\n| ----- | --: | :---: |\n| Pomme |   5 |       |\n| Prune |     |       |\n\nAprès\n';
  check('Éditeur de tableau — Appliquer remplace le tableau d’origine, aligné', (await doc()) === attenduTableau, JSON.stringify(await doc()));
  check('Éditeur de tableau — la modale est fermée', !(await h.js(`!!document.getElementById('tableau-modal')`)));
  check('Éditeur de tableau — l’aperçu montre le nouveau tableau', await h.js(`document.getElementById('preview').innerHTML.includes('Prune') && document.querySelectorAll('#preview th').length === 3`));

  // Annuler / Échap ne changent rien.
  await poserDoc(texteTableau, texteTableau.indexOf('Pomme'));
  await commande('ecriture:tableau-editeur');
  await pause(100);
  await saisir('[data-cellule="0-0"]', 'MODIFIÉ');
  await echap();
  check('Éditeur de tableau — Échap ferme sans rien modifier', !(await h.js(`!!document.getElementById('tableau-modal')`)) && (await doc()) === texteTableau);
  await commande('ecriture:tableau-editeur');
  await pause(100);
  await clic('#tableau-annuler');
  check('Éditeur de tableau — Annuler ferme sans rien modifier', !(await h.js(`!!document.getElementById('tableau-modal')`)) && (await doc()) === texteTableau);

  // Aucun tableau sous le curseur : un nouveau est créé.
  await poserDoc('Un paragraphe.', 5);
  await commande('ecriture:tableau-editeur');
  await pause(100);
  const neuf = await h.jsonJs(`({ titre: document.querySelector('#tableau-modal h3').textContent, c: document.querySelectorAll('#tableau-modal thead tr:nth-child(2) input').length, l: document.querySelectorAll('#tableau-modal tbody tr').length })`);
  check('Éditeur de tableau — sans tableau sous le curseur, propose un nouveau tableau 3 × 2', neuf.titre === 'Insérer un tableau' && neuf.c === 3 && neuf.l === 2, JSON.stringify(neuf));
  await saisir('[data-cellule="e-0"]', 'Prénom');
  await clic('#tableau-appliquer');
  await pause(200);
  const apresNeuf = await doc();
  check('Éditeur de tableau — le nouveau tableau est inséré sous le paragraphe, séparé par une ligne vide', /^Un paragraphe\.\n\n\| Prénom \| Colonne 2 \| Colonne 3 \|\n\| ------ \| --------- \| --------- \|\n\|        \|           \|           \|\n\|        \|           \|           \|\n$/.test(apresNeuf), JSON.stringify(apresNeuf));

  // ── Tâche 9b : reformatage ────────────────────────────────────────────
  const brut = '---\ntitre: "T"  \n---\n\n\n* a   \n+ b\n\n\n\n3. x\n3. y\n\n|a|bb|\n|-|:-:|\n|1|2|\n\n```\n* code   \n\n\n1. 1.\n```\n';
  await poserDoc(brut, 0);
  await commande('ecriture:reformater-document');
  await pause(150);
  const attenduReformat = '---\ntitre: "T"  \n---\n\n- a\n- b\n\n3. x\n4. y\n\n| a   | bb  |\n| --- | :-: |\n| 1   |  2  |\n\n```\n* code   \n\n\n1. 1.\n```\n';
  check('Reformater le document — listes, tableau, espaces, lignes vides ; code et front-matter intacts', (await doc()) === attenduReformat, JSON.stringify(await doc()));
  check('Reformater le document — l’onglet est marqué modifié', await h.js(`window.mdr.onglets.actif().dirty === true`));
  await poserDoc('* un   \n* deux\n\n\n\n* trois\n* quatre\n', 0);
  await h.js(`(() => { const v = window.mdr.editeur().view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.indexOf('* trois'), head: t.length - 1 } }); return true; })()`);
  await commande('ecriture:reformater-selection');
  await pause(100);
  check('Reformater la sélection — seules les lignes sélectionnées changent', (await doc()) === '* un   \n* deux\n\n\n\n- trois\n- quatre\n', JSON.stringify(await doc()));

  // ── Tâche 9c : emoji ──────────────────────────────────────────────────
  await poserDoc('Bravo :tada: et `:fire:` :inconnu:\n\n```\n:rocket:\n```\n', 0);
  await pause(400);
  const apercu = await h.js(`document.getElementById('preview').innerHTML`);
  check('Emoji — :nom: est converti dans l’aperçu', apercu.includes('Bravo 🎉 et'), apercu.slice(0, 200));
  check('Emoji — pas de conversion dans le code en ligne, ni dans un bloc de code', apercu.includes(':fire:') && !apercu.includes('🔥') && !apercu.includes('🚀'));
  check('Emoji — un nom inconnu reste du texte', apercu.includes(':inconnu:'));
  check('Emoji — le texte source de l’éditeur garde :nom:', (await doc()).includes(':tada:'));

  // Autocomplétion de l'éditeur : frappe simulée (userEvent input.type), attente asynchrone.
  const taperEtAttendre = async (avant, saisie) => {
    await poserDoc(avant, avant.length);
    await h.js(`(() => { const v = window.mdr.editeur().view; v.focus(); const p = v.state.doc.length; v.dispatch({ changes: { from: p, insert: ${JSON.stringify(saisie)} }, selection: { anchor: p + ${saisie.length} }, userEvent: 'input.type' }); return true; })()`);
    await pause(700);
    return h.jsonJs(`Array.from(document.querySelectorAll('.cm-tooltip-autocomplete li')).map((li) => li.textContent)`);
  };
  const propEmoji = await taperEtAttendre('Super ', ':sm');
  check('Emoji — l’autocomplétion propose des emoji après « :sm »', propEmoji.length >= 2 && propEmoji.some((t) => t.includes(':smile:') && t.includes('😄')), JSON.stringify(propEmoji));
  await h.js(`document.querySelector('#editor .cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); true`);
  await pause(200);
  check('Emoji — valider insère :nom: à la place de la saisie', /^Super :smile:$/.test(await doc()), JSON.stringify(await doc()));
  const horsCode = await taperEtAttendre('```\n', ':sm');
  check('Emoji — pas de proposition dans un bloc de code', horsCode.length === 0, JSON.stringify(horsCode));
  const heure = await taperEtAttendre('Rendez-vous à 12', ':30');
  check('Emoji — « 12:30 » ne déclenche aucune proposition', heure.length === 0, JSON.stringify(heure));

  // ── Tâche 9d : autocomplétion des liens ───────────────────────────────
  await commande('fichier:dossier');
  await pause(300);
  check('Liens — le dossier ouvert est connu de l’éditeur', (await h.js(`window.mdr.dossier()`)) === racine);
  await h.js(`window.mdr.onglets.ouvrir({ path: ${JSON.stringify(path.join(racine, 'sous', 'b.md'))}, content: 'voir [x]' }); true`);
  await pause(300);
  const propLiens = await taperEtAttendre('voir [x]', '(');
  check('Liens — « ]( » propose les .md du dossier ouvert, en chemins relatifs au document', propLiens.length === 2 && propLiens.some((t) => t.startsWith('../a.md')) && propLiens.some((t) => t.startsWith('Mon Doc.md')), JSON.stringify(propLiens));
  check('Liens — le document lui-même et les dossiers cachés sont exclus', !propLiens.some((t) => t.startsWith('b.md') || t.includes('z.md')));
  await h.js(`document.querySelector('#editor .cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); true`);
  await pause(200);
  check('Liens — valider insère le chemin relatif', (await doc()) === 'voir [x](../a.md', JSON.stringify(await doc()));
  const propNotes = await taperEtAttendre('voir ', '[[');
  const noms = propNotes.map((t) => t.replace(/(sous|a)\/?.*$/, ''));
  check('Liens — « [[ » propose les noms de notes sans extension', propNotes.length === 3 && ['a', 'b', 'Mon Doc'].every((n) => propNotes.some((t) => t.startsWith(n))), JSON.stringify(propNotes) + noms.length);
  await h.js(`document.querySelector('#editor .cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); true`);
  await pause(200);
  check('Liens — valider insère le nom de note et ferme les crochets', (await doc()) === 'voir [[a]]', JSON.stringify(await doc()));
  const refus = await h.js(`window.api.listerMdRelatifs('dossier/relatif')`);
  check('IPC folder:list-md-relatifs — chemin relatif refusé', refus && /invalide/.test(refus.erreur || ''), JSON.stringify(refus));

  // ── Tâche 10a : modèles ───────────────────────────────────────────────
  const nbOnglets = () => h.js(`window.mdr.onglets.liste().length`);
  const avantModele = await nbOnglets();
  await commande('ecriture:modele');
  await pause(150);
  const choix = await h.jsonJs(`({ items: Array.from(document.querySelectorAll('#modale-choix .modale-item')).map((li) => li.dataset.id + '|' + li.textContent) })`);
  check('Modèles — la palette « Nouveau depuis un modèle… » liste les quatre modèles', choix.items.length === 4 && ['compte-rendu', 'specification', 'readme', 'lettre'].every((id) => choix.items.some((t) => t.startsWith(id + '|'))), JSON.stringify(choix));
  await echap();
  check('Modèles — Échap ferme la liste sans créer d’onglet', (await nbOnglets()) === avantModele && !(await h.js(`!!document.getElementById('modale-choix')`)));
  await commande('ecriture:modele');
  await pause(150);
  await clic('#modale-choix [data-id="compte-rendu"]');
  await pause(300);
  const apresModele = await h.jsonJs(`({ n: window.mdr.onglets.liste().length, path: window.mdr.onglets.actif().path, dirty: window.mdr.onglets.actif().dirty, texte: window.mdr.editeur().getValue(), nom: document.getElementById('file-name').textContent })`);
  const dateAttendue = require('../renderer/lib/modeles.js').dateFrancaise(new Date());
  check('Modèles — ouvre un nouvel onglet non enregistré rempli du modèle', apresModele.n === avantModele + 1 && apresModele.path === null && apresModele.dirty === true && /^# Compte rendu de réunion/.test(apresModele.texte), JSON.stringify(apresModele).slice(0, 200));
  check('Modèles — la date du jour est écrite en français', apresModele.texte.includes('**Date** : ' + dateAttendue), dateAttendue);
  check('Modèles — l’aperçu est rendu (tableaux, listes de tâches)', await h.js(`document.querySelectorAll('#preview table').length >= 2 && document.querySelectorAll('#preview input[type=checkbox]').length >= 2`));
  await commande('ecriture:modele');
  await pause(150);
  await clic('#modale-choix [data-id="lettre"]');
  await pause(200);
  check('Modèles — chaque modèle ouvre son propre onglet', (await nbOnglets()) === avantModele + 2 && /Madame, Monsieur/.test(await doc()));

  // ── Tâche 10b : snippets ──────────────────────────────────────────────
  const fichierSnippets = path.join(h.dossierDonnees, 'snippets.json');
  await poserDoc('Début ', 6);
  await commande('ecriture:snippet-inserer');
  await pause(300);
  const exemples = await h.jsonJs(`Array.from(document.querySelectorAll('#modale-choix .modale-item')).map((li) => li.dataset.id)`);
  check('Snippets — des exemples sont proposés au premier lancement', exemples.length >= 3 && exemples.includes('Signature') && exemples.includes('Date du jour'), JSON.stringify(exemples));
  check('Snippets — le fichier JSON est créé dans le dossier de données', fs.existsSync(fichierSnippets) && JSON.parse(fs.readFileSync(fichierSnippets, 'utf8')).length === exemples.length);
  await saisir('#modale-choix-filtre', 'date');
  check('Snippets — le filtre réduit la liste', (await h.js(`document.querySelectorAll('#modale-choix .modale-item').length`)) === 1);
  await h.js(`document.getElementById('modale-choix-filtre').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`);
  await pause(300);
  check('Snippets — Entrée insère le snippet au curseur ({{date}} en français)', (await doc()) === 'Début ' + require('../renderer/lib/modeles.js').dateFrancaise(new Date()), JSON.stringify(await doc()));

  await poserDoc('Phrase à réutiliser.', 0);
  await h.js(`(() => { window.mdr.editeur().view.dispatch({ selection: { anchor: 0, head: 20 } }); return true; })()`);
  await commande('ecriture:snippet-enregistrer');
  await pause(200);
  check('Snippets — « Enregistrer la sélection » demande un nom', await h.js(`!!document.getElementById('modale-saisie-champ')`));
  await clic('#modale-saisie-ok');
  check('Snippets — un nom vide est refusé', await h.js(`!!document.getElementById('modale-saisie-champ')`));
  await saisir('#modale-saisie-champ', 'Ma phrase');
  await clic('#modale-saisie-ok');
  await pause(300);
  const stockes = JSON.parse(fs.readFileSync(fichierSnippets, 'utf8'));
  check('Snippets — la sélection est enregistrée dans le fichier JSON', stockes.some((s) => s.nom === 'Ma phrase' && s.contenu === 'Phrase à réutiliser.'), JSON.stringify(stockes.slice(-1)));
  await poserDoc('', 0);
  await commande('ecriture:snippet-inserer');
  await pause(300);
  await clic('#modale-choix [data-id="Ma phrase"]');
  await pause(300);
  check('Snippets — le snippet enregistré s’insère', (await doc()) === 'Phrase à réutiliser.', JSON.stringify(await doc()));
  await h.js(`(() => { window.mdr.editeur().view.dispatch({ selection: { anchor: 0, head: 0 } }); return true; })()`);
  await commande('ecriture:snippet-enregistrer');
  await pause(150);
  check('Snippets — sans sélection, rien n’est demandé', !(await h.js(`!!document.getElementById('modale-saisie-champ')`)));
  await commande('ecriture:snippet-supprimer');
  await pause(300);
  await clic('#modale-choix [data-id="Ma phrase"]');
  await pause(300);
  const apresSuppr = JSON.parse(fs.readFileSync(fichierSnippets, 'utf8'));
  check('Snippets — « Supprimer un snippet » le retire du fichier', !apresSuppr.some((s) => s.nom === 'Ma phrase') && apresSuppr.length === stockes.length - 1);
  await h.recharger();
  const survie = JSON.parse(await h.js(`window.mdr.snippets.lire().then((l) => JSON.stringify(l.map((s) => s.nom)))`));
  check('Snippets — la liste survit au redémarrage', survie.includes('Signature') && !survie.includes('Ma phrase'), JSON.stringify(survie));

  // ── Tâche 10c : correcteur orthographique ─────────────────────────────
  check('Correcteur — le réglage mémorisé est transmis au processus principal au démarrage', appelsLangues.includes('fr-en'), JSON.stringify(appelsLangues));
  const attrs = () => h.jsonJs(`({ spellcheck: document.querySelector('#editor .cm-content').getAttribute('spellcheck'), lang: document.querySelector('#editor .cm-content').getAttribute('lang') })`);
  const a0 = await attrs();
  check('Correcteur — spellcheck activé sur le contenu CodeMirror par défaut', a0.spellcheck === 'true' && a0.lang === 'fr', JSON.stringify(a0));
  await h.js(`window.mdr.reglagesUI.ouvrir('general'); true`);
  const options = await h.jsonJs(`Array.from(document.querySelectorAll('#reglage-correcteur option')).map((o) => o.value + '=' + o.textContent)`);
  check('Réglages Général — « Correcteur orthographique » : français, anglais, les deux, désactivé', options.length === 4 && options.some((o) => o.startsWith('fr=Français')) && options.some((o) => o.startsWith('en=Anglais')) && options.some((o) => o.startsWith('fr-en=')), JSON.stringify(options));
  const regler = (v) => h.js(`(() => { const e = document.getElementById('reglage-correcteur'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await regler('en');
  await pause(200);
  const a1 = await attrs();
  check('Correcteur — « Anglais » : appliqué à chaud (lang=en) et envoyé à main (IPC)', a1.spellcheck === 'true' && a1.lang === 'en' && appelsLangues[appelsLangues.length - 1] === 'en', JSON.stringify([a1, appelsLangues]));
  await regler('aucun');
  await pause(200);
  const a2 = await attrs();
  check('Correcteur — « Désactivé » : spellcheck=false et IPC', a2.spellcheck === 'false' && appelsLangues[appelsLangues.length - 1] === 'aucun', JSON.stringify([a2, appelsLangues]));
  await regler('fr');
  await pause(200);
  check('Correcteur — « Français » : lang=fr, spellcheck=true, IPC', (await attrs()).spellcheck === 'true' && appelsLangues[appelsLangues.length - 1] === 'fr');
  await h.js(`window.mdr.reglagesUI.fermer(); true`);
  await h.recharger();
  const a3 = await attrs();
  check('Correcteur — le choix survit au redémarrage (éditeur et IPC)', a3.spellcheck === 'true' && appelsLangues[appelsLangues.length - 1] === 'fr', JSON.stringify([a3, appelsLangues]));

  // Session réelle d'Electron : l'appel ne plante pas et rend les langues demandées.
  const retenues = contexte.appliquerLanguesCorrecteur(session.defaultSession, 'fr-en');
  const actives = session.defaultSession.getSpellCheckerLanguages();
  check('Correcteur — setSpellCheckerLanguages accepte la demande sur la session réelle', Array.isArray(retenues) && Array.isArray(actives), JSON.stringify({ retenues, actives, plateforme: process.platform }));

  // Menu contextuel : événement context-menu réel de webContents, avec de faux
  // paramètres ; Menu simulé pour capter le gabarit (aucun menu natif ne s'ouvre).
  let gabarit = null;
  const faux = { buildFromTemplate: (g) => { gabarit = g; return { popup: () => {} }; } };
  contexte.brancherMenuContextuel(h.win.webContents, { Menu: faux, fenetre: () => h.win });
  h.win.webContents.emit('context-menu', {}, { isEditable: true, misspelledWord: 'bonjoure', dictionarySuggestions: ['bonjour', 'bonjours'], editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } });
  check('Menu contextuel — l’événement context-menu produit suggestions, ajout au dictionnaire, puis édition', gabarit && gabarit.filter((i) => i.label).map((i) => i.label).join('|') === 'bonjour|bonjours|Ajouter au dictionnaire|Couper|Copier|Coller|Tout sélectionner', JSON.stringify(gabarit));
  gabarit = null;
  h.win.webContents.emit('context-menu', {}, { isEditable: true, misspelledWord: '', dictionarySuggestions: [], editFlags: {} });
  check('Menu contextuel — mot correct : ni suggestion ni « Ajouter au dictionnaire »', gabarit && !gabarit.some((i) => i.label === 'Ajouter au dictionnaire' || i.label === 'Aucune suggestion'));
  check('Menu contextuel — Menu.buildFromTemplate réel accepte le gabarit', (() => { try { Menu.buildFromTemplate(contexte.creerTemplateContexte({ isEditable: true, misspelledWord: 'x', dictionarySuggestions: ['y'], editFlags: {} }, {})); return true; } catch { return false; } })());

  fs.rmSync(racine, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

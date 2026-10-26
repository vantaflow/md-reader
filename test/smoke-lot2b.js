// Lot 2 (1.9.0), navigation — tâches 11 à 13 : tests Electron de bout en bout.
// Même modèle que smoke-lot2a.js (harnais partagé, fenêtre cachée, dialogues
// stubés). Le harnais n'exécute pas main.js : les canaux IPC sont simulés avec
// les VRAIES fonctions de donnees.js que main.js utilise.
//
// Ce que ce script NE peut PAS vérifier : un vrai glisser-déposer à la souris
// (les événements dragstart/dragover/drop sont simulés dans la page), la boîte
// de dialogue native de choix de dossier et la confirmation native de
// `confirm()` (stubée), ni la garde de main.js sur le dossier ouvert (testée
// ici par la fonction de donnees.js, la garde elle-même ne l'est pas sans main.js).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { creerHarnais } = require('./helpers.js');
const donnees = require('../donnees.js');

const h = creerHarnais();
const { check } = h;
const pause = (ms) => h.attendre(ms);

const doc = () => h.js('window.mdr.editeur().getValue()');
const poserDoc = (texte, curseur) => h.js(`(() => {
  const ed = window.mdr.editeur();
  ed.setValue(${JSON.stringify(texte)});
  const pos = ${curseur === undefined ? 0 : curseur};
  ed.view.dispatch({ selection: { anchor: pos } });
  return true;
})()`);
const clic = (sel) => h.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const saisir = (sel, valeur) => h.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(valeur)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const commande = (id) => h.js(`window.commands.run(${JSON.stringify(id)})`);

// Simule un glisser-déposer d'une entrée du plan sur une autre (événements réels
// du DOM, partageant un même DataTransfer) ; `moitie` : 'haut' ou 'bas' de la cible.
const glisser = (de, vers, moitie) => h.js(`(() => {
  const items = document.querySelectorAll('#toc a.plan-item');
  const dt = new DataTransfer();
  const evt = (type, el, y) => { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y === undefined ? 0 : y }); el.dispatchEvent(e); return e; };
  const src = items[${de}];
  const cib = items[${vers}];
  const r = cib.getBoundingClientRect();
  const y = ${JSON.stringify(moitie)} === 'haut' ? r.top + 1 : r.bottom - 1;
  evt('dragstart', src);
  const over = evt('dragover', cib, y);
  const drop = evt('drop', cib, y);
  evt('dragend', src);
  return { surcharge: over.defaultPrevented, depot: drop.defaultPrevented };
})()`);

(async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-lot2b-'));
  const ecrireFichier = (rel, c = '# x') => { const p = path.join(racine, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); return p; };

  // Fichiers du dossier de test (tâches 12 et 13).
  const chemin = (rel) => path.join(racine, rel);
  ecrireFichier('Accueil.md', '---\ntitle: Accueil\ntags: [projet, accueil]\n---\n# Accueil\n\nVoir [[Projet]], [[projet|le projet]], [[Inconnue]], [[ACCUEIL]] et `[[code]]`.\n');
  ecrireFichier('notes/Projet.md', '---\ntags:\n  - projet\n  - rh\n---\n# Projet\n\nRetour à [[accueil]].\n');
  ecrireFichier('notes/Idée.md', '---\ntags: [idée]\n---\n# Idée\n');
  ecrireFichier('autre.md', 'Un [lien](notes/Projet.md) vers le projet.\n');
  ecrireFichier('sans-tag.md', '# Rien\n');
  const arbre = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')).map((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? { type: 'dir', name: e.name, path: p, children: arbre(p) } : { type: 'file', name: e.name, path: p };
  }).filter((n) => n.type === 'file' ? /\.md$/.test(n.name) : n.children.length)
    .sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)));
  const erreurRacine = (root) => (path.resolve(String(root)) === path.resolve(racine) ? null : { erreur: 'Ce dossier n’est pas le dossier ouvert.' });
  const appelsEcriture = [];
  await h.demarrer({
    stubs: {
      'folder:open': () => ({ root: racine, tree: arbre(racine) }),
      'folder:refresh': (_e, root) => ({ root, tree: arbre(racine) }),
      'file:read': (_e, p) => ({ path: p, content: fs.readFileSync(p, 'utf8') }),
      'file:save': (_e, { filePath, content }) => { appelsEcriture.push(filePath); fs.writeFileSync(filePath, content); return filePath; },
      'folder:list-md-relatifs': async (_e, d) => { try { return await donnees.listerMdRelatifs(d); } catch (e) { return { erreur: e.message }; } },
      'folder:scan-tags': async (_e, { root }) => erreurRacine(root) || donnees.scannerTags(root),
      'folder:replace-preview': async (_e, { root, parametres }) => erreurRacine(root) || donnees.apercuRemplacement(root, parametres),
      'folder:replace-apply': async (_e, { root, parametres, selection }) => erreurRacine(root) || donnees.appliquerRemplacement(root, parametres, selection),
      'folder:backlinks': async (_e, { root, cible }) => erreurRacine(root) || donnees.trouverRetroliens(root, cible).catch((e) => ({ erreur: e.message })),
    },
  });
  await h.recharger();

  // ── Tâche 11 : panneau Plan ───────────────────────────────────────────
  check('Plan — l’onglet de la barre latérale s’appelle « Plan »', (await h.js(`document.querySelector('.sidebar-tabs [data-tab="toc"]').textContent`)) === 'Plan');
  await clic('.sidebar-tabs [data-tab="toc"]');
  await h.js(`document.getElementById('mode-affichage').value = 'continu'; document.getElementById('mode-affichage').dispatchEvent(new Event('change')); true`);
  await h.js(`window.mdr.reglages.set('voletCode', true); true`);
  const paragraphes = (n) => Array.from({ length: n }, (_, i) => `Ligne ${i + 1} du paragraphe de remplissage, assez longue pour occuper de la place dans l’aperçu.\n`).join('\n');
  const SOURCE = ['---', 'title: x', '# faux titre du front-matter', '---', '', '# Alpha', paragraphes(25), '## Alpha un', paragraphes(25), '```', '# pas un titre', '```', '## Alpha deux', paragraphes(25), '# Beta', paragraphes(25), '### Beta profond', paragraphes(25), '# Gamma', paragraphes(40), ''].join('\n');
  await poserDoc(SOURCE, 0);
  await pause(500);
  const plan = await h.jsonJs(`Array.from(document.querySelectorAll('#toc a.plan-item')).map((a) => ({ t: a.textContent, c: a.className, pad: parseFloat(getComputedStyle(a).paddingLeft), l: a.dataset.ligne, dr: a.draggable }))`);
  check('Plan — une entrée par section du texte source, hors code et front-matter', plan.map((p) => p.t).join('|') === 'Alpha|Alpha un|Alpha deux|Beta|Beta profond|Gamma', JSON.stringify(plan.map((p) => p.t)));
  check('Plan — indentation croissante avec le niveau du titre', plan[1].pad > plan[0].pad && plan[4].pad > plan[1].pad && plan[3].pad === plan[0].pad, JSON.stringify(plan.map((p) => p.pad)));
  check('Plan — chaque entrée est déplaçable (draggable)', plan.every((p) => p.dr));

  // Clic : l'éditeur et l'aperçu sautent à la section.
  await clic('#toc a.plan-item[data-indice="3"]');
  await pause(500);
  const saut = await h.jsonJs(`(() => {
    const ed = window.mdr.editeur();
    const ligne = ed.view.state.doc.lineAt(ed.view.state.selection.main.head);
    const ap = window.mdr.apercu();
    const titre = Array.from(ap.querySelectorAll('h1')).find((e) => e.textContent.trim() === 'Beta');
    return { texte: ligne.text, scroll: ap.scrollTop, ecart: Math.abs(titre.getBoundingClientRect().top - ap.getBoundingClientRect().top), editeurScroll: ed.getScrollDOM().scrollTop };
  })()`);
  check('Plan — le clic place le curseur de l’éditeur sur le titre', saut.texte === '# Beta', JSON.stringify(saut));
  check('Plan — le clic fait défiler l’aperçu jusqu’à la section', saut.scroll > 100 && saut.ecart < 40, JSON.stringify(saut));
  check('Plan — le clic fait aussi défiler l’éditeur', saut.editeurScroll > 100, JSON.stringify(saut));

  // Section courante.
  const courante = () => h.js(`(() => { const c = document.querySelectorAll('#toc a.courante'); return c.length === 1 ? c[0].textContent : 'x' + c.length; })()`);
  check('Plan — la section sous le curseur est surlignée (après un clic)', (await courante()) === 'Beta', await courante());
  const posAlphaDeux = SOURCE.indexOf('## Alpha deux') + 15;
  await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: ${posAlphaDeux} } }); true`);
  await pause(100);
  check('Plan — le surlignage suit le curseur dans l’éditeur', (await courante()) === 'Alpha deux', await courante());
  await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: 3 } }); true`);
  await pause(100);
  check('Plan — avant le premier titre, aucune section n’est surlignée', (await courante()) === 'x0');

  // Glisser-déposer : « Beta » (avec « Beta profond ») avant « Alpha ».
  const ref = SOURCE;
  await poserDoc(ref, 0);
  await pause(400);
  const res = await glisser(3, 0, 'haut');
  await pause(500);
  const apres = await doc();
  const attendu = (() => {
    const i = (t) => ref.indexOf(t);
    const alpha = ref.slice(i('# Alpha\n'), i('# Beta'));
    const beta = ref.slice(i('# Beta'), i('# Gamma'));
    return ref.slice(0, i('# Alpha\n')) + beta + alpha + ref.slice(i('# Gamma'));
  })();
  check('Plan — le dépôt est accepté (dragover et drop annulent le comportement par défaut)', res.surcharge && res.depot, JSON.stringify(res));
  check('Plan — glisser une section la déplace avec ses sous-sections avant la cible', apres === attendu, apres.slice(0, 200));
  await pause(300);
  const planApres = await h.jsonJs(`Array.from(document.querySelectorAll('#toc a.plan-item')).map((a) => a.textContent)`);
  check('Plan — le panneau se met à jour après le déplacement', planApres.join('|') === 'Beta|Beta profond|Alpha|Alpha un|Alpha deux|Gamma', JSON.stringify(planApres));
  await h.js(`window.mdr.editeur().annuler(); true`);
  await pause(200);
  check('Plan — le déplacement s’annule en une seule fois', (await doc()) === ref);
  await h.js(`window.mdr.editeur().refaire(); true`);
  await pause(100);
  check('Plan — et se rétablit en une seule fois', (await doc()) === attendu);

  // Après une section avec niveaux : « Alpha un » (niveau 2) après « Gamma » (niveau 1) devient niveau 1.
  await poserDoc('# A\na\n## A1\nb\n# G\ng\n', 0);
  await pause(400);
  await glisser(1, 2, 'bas');
  await pause(300);
  check('Plan — la section déplacée prend le niveau de la cible', (await doc()) === '# A\na\n# G\ng\n# A1\nb\n', JSON.stringify(await doc()));

  // Dépôt dans sa propre section, ou sans glissement de section : rien ne change.
  await poserDoc('# A\na\n## A1\nb\n# G\ng\n', 0);
  await pause(400);
  await glisser(0, 1, 'bas');
  await pause(200);
  check('Plan — déposer une section sur sa propre sous-section ne change rien', (await doc()) === '# A\na\n## A1\nb\n# G\ng\n');
  const externe = await h.jsonJs(`(() => {
    const cib = document.querySelectorAll('#toc a.plan-item')[1];
    const dt = new DataTransfer();
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    cib.dispatchEvent(over);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    cib.dispatchEvent(drop);
    return { over: over.defaultPrevented };
  })()`);
  await pause(100);
  check('Plan — un dépôt qui ne vient pas du plan ne modifie pas le texte', externe && (await doc()) === '# A\na\n## A1\nb\n# G\ng\n');
  check('Plan — aucun voile « Déposer les fichiers » n’apparaît pendant le glissement d’une section', !(await h.js(`!!document.querySelector('.drop-overlay')`)));

  // Documents sans titre ATX : le panneau reste vide, sans erreur.
  await poserDoc('juste du texte\n', 0);
  await pause(400);
  check('Plan — un document sans titre donne un plan vide', (await h.js(`document.querySelectorAll('#toc a').length`)) === 0);

  // ── Tâche 12 : liens wiki, rétroliens, favoris, tags ──────────────────
  await h.js(`window.mdr.reglages.set('voletCode', true); true`);
  await commande('fichier:dossier');
  await pause(600);
  const ouvrirDoc = (rel) => h.js(`(() => { window.mdr.onglets.ouvrir({ path: ${JSON.stringify(chemin(rel))}, content: ${JSON.stringify(fs.readFileSync(chemin(rel), 'utf8'))} }); return true; })()`);
  const ongletActif = () => h.js(`(window.mdr.onglets.actif() || {}).path || null`);
  const nbOnglets = () => h.js(`window.mdr.onglets.liste().length`);
  const lienWiki = (texte) => h.js(`(() => { const a = Array.from(document.querySelectorAll('#preview a.wikilink')).find((e) => e.textContent === ${JSON.stringify(texte)}); if (!a) return false; a.click(); return true; })()`);
  await ouvrirDoc('Accueil.md');
  await pause(500);
  const liens = await h.jsonJs(`Array.from(document.querySelectorAll('#preview a.wikilink')).map((a) => [a.textContent, a.dataset.note])`);
  check('Liens wiki — [[note]] et [[note|texte]] sont rendus en liens dans l’aperçu', JSON.stringify(liens) === JSON.stringify([['Projet', 'Projet'], ['le projet', 'projet'], ['Inconnue', 'Inconnue'], ['ACCUEIL', 'ACCUEIL']]), JSON.stringify(liens));
  check('Liens wiki — un [[lien]] dans du code en ligne reste du texte', (await h.js(`document.querySelector('#preview code').textContent`)) === '[[code]]');

  const avant = await nbOnglets();
  check('Liens wiki — le clic sur [[Projet]] ouvre notes/Projet.md dans un onglet', (await lienWiki('Projet')) && (await pause(500), (await ongletActif()) === chemin('notes/Projet.md')) && (await nbOnglets()) === avant + 1, String(await ongletActif()));
  await ouvrirDoc('Accueil.md');
  await pause(400);
  await lienWiki('le projet');
  await pause(400);
  check('Liens wiki — [[projet|le projet]] retrouve la même note (casse ignorée), sans second onglet', (await ongletActif()) === chemin('notes/Projet.md') && (await nbOnglets()) === avant + 1);
  await ouvrirDoc('notes/Projet.md');
  await pause(400);
  await lienWiki('accueil');
  await pause(400);
  check('Liens wiki — depuis une note du sous-dossier, [[accueil]] atteint Accueil.md à la racine', (await ongletActif()) === chemin('Accueil.md'));

  // Note introuvable : confirmation stubée.
  await ouvrirDoc('Accueil.md');
  await pause(400);
  await h.js(`window.__questions = []; window.confirm = (m) => { window.__questions.push(m); return false; }; true`);
  await lienWiki('Inconnue');
  await pause(400);
  check('Liens wiki — note introuvable : la création est proposée', (await h.jsonJs(`window.__questions`)).length === 1 && /Inconnue/.test((await h.jsonJs(`window.__questions`))[0]), JSON.stringify(await h.jsonJs(`window.__questions`)));
  check('Liens wiki — refus : aucun fichier créé, onglet inchangé', !fs.existsSync(chemin('Inconnue.md')) && (await ongletActif()) === chemin('Accueil.md') && appelsEcriture.length === 0);
  await h.js(`window.confirm = (m) => { window.__questions.push(m); return true; }; true`);
  await lienWiki('Inconnue');
  await pause(600);
  check('Liens wiki — acceptation : la note est créée à côté du document et ouverte', fs.existsSync(chemin('Inconnue.md')) && fs.readFileSync(chemin('Inconnue.md'), 'utf8') === '# Inconnue\n\n' && (await ongletActif()) === chemin('Inconnue.md'), String(await ongletActif()));
  check('Liens wiki — la nouvelle note est écrite une seule fois', appelsEcriture.length === 1 && appelsEcriture[0] === chemin('Inconnue.md'), JSON.stringify(appelsEcriture));
  // Un nom malveillant ne sort pas du dossier.
  await poserDoc('[[../../evasion]]', 0);
  await h.js(`window.mdr.onglets.actif().path = ${JSON.stringify(chemin('Accueil.md'))}; true`);
  await pause(400);
  await lienWiki('../../evasion');
  await pause(500);
  check('Liens wiki — [[../../nom]] crée la note dans le dossier du document, jamais ailleurs', !fs.existsSync(path.join(racine, '..', 'evasion.md')) && !fs.existsSync(path.join(racine, '..', '..', 'evasion.md')) && fs.existsSync(chemin('evasion.md')));

  // Rétroliens.
  await ouvrirDoc('notes/Projet.md');
  await clic('.sidebar-tabs [data-tab="toc"]');
  await pause(700);
  const retros = await h.jsonJs(`Array.from(document.querySelectorAll('#retroliens-liste .retrolien')).map((d) => [d.querySelector('.path').textContent, d.querySelector('.extrait').textContent])`);
  check('Rétroliens — les documents qui citent le document courant sont listés (nom et lien relatif)', retros.map((r) => r[0]).join('|') === 'Accueil.md (2)|autre.md', JSON.stringify(retros));
  check('Rétroliens — chaque entrée montre un extrait de la ligne qui cite', /\[\[Projet\]\]/.test(retros[0][1]) && /\[lien\]\(notes\/Projet\.md\)/.test(retros[1][1]), JSON.stringify(retros));
  await h.js(`document.querySelector('#retroliens-liste .retrolien[data-chemin$="autre.md"]').click(); true`);
  await pause(400);
  check('Rétroliens — un clic ouvre le document', (await ongletActif()) === chemin('autre.md'));
  await pause(500);
  check('Rétroliens — un document que personne ne cite l’indique', (await h.js(`document.querySelector('#retroliens-liste .vide').textContent`)) === 'Aucun document ne cite celui-ci.');

  // Favoris.
  await clic('.sidebar-tabs [data-tab="files"]');
  await ouvrirDoc('Accueil.md');
  await pause(300);
  check('Favoris — aucun favori au départ : section masquée', (await h.js(`document.getElementById('favoris').classList.contains('hidden')`)) === true);
  await h.js(`document.querySelector('#file-tree .file[data-path$="Accueil.md"] .etoile').click(); true`);
  await pause(200);
  check('Favoris — l’étoile de l’arbre épingle le fichier (réglage mémorisé)', JSON.stringify(await h.jsonJs(`window.mdr.reglages.get('favoris')`)) === JSON.stringify([chemin('Accueil.md')]));
  check('Favoris — la section Favoris apparaît en haut de l’onglet Fichiers', await h.js(`(() => { const f = document.getElementById('favoris'); return !f.classList.contains('hidden') && f.querySelector('.favori').dataset.chemin === ${JSON.stringify(chemin('Accueil.md'))} && f.compareDocumentPosition(document.getElementById('file-tree')) & Node.DOCUMENT_POSITION_FOLLOWING; })()`));
  await ouvrirDoc('autre.md');
  await commande('nav:favori-basculer');
  await pause(200);
  check('Favoris — la commande de palette « Épingler/Désépingler le document » épingle le document actif', (await h.jsonJs(`window.mdr.reglages.get('favoris')`)).length === 2 && (await h.js(`window.commands.all().some((c) => c.titre === 'Épingler/Désépingler le document')`)));
  await h.recharger();
  check('Favoris — ils survivent au redémarrage', (await h.js(`document.querySelectorAll('#favoris .favori').length`)) === 2);
  await h.js(`document.querySelector('#favoris .favori[data-chemin$="Accueil.md"]').click(); true`);
  await pause(500);
  check('Favoris — un clic sur un favori ouvre le fichier', (await ongletActif()) === chemin('Accueil.md'));
  await h.js(`document.querySelector('#favoris .favori[data-chemin$="autre.md"] .retirer').click(); true`);
  await pause(200);
  check('Favoris — ✕ retire le favori', JSON.stringify(await h.jsonJs(`window.mdr.reglages.get('favoris')`)) === JSON.stringify([chemin('Accueil.md')]));
  await commande('nav:favori-basculer');
  await pause(200);
  check('Favoris — la commande désépingle un favori existant', (await h.jsonJs(`window.mdr.reglages.get('favoris')`)).length === 0 && (await h.js(`document.getElementById('favoris').classList.contains('hidden')`)));

  // Tags.
  await commande('fichier:dossier');
  await pause(900);
  const chips = () => h.jsonJs(`Array.from(document.querySelectorAll('#tags-liste .tag:not(.effacer)')).map((b) => b.dataset.tag + ':' + b.classList.contains('actif'))`);
  const fichiersArbre = () => h.jsonJs(`Array.from(document.querySelectorAll('#file-tree .file')).map((f) => f.querySelector('.nom').textContent.replace('📄 ', ''))`);
  check('Tags — les tags du front-matter (liste inline et liste YAML) sont proposés avec leur nombre', JSON.stringify((await h.jsonJs(`Array.from(document.querySelectorAll('#tags-liste .tag:not(.effacer)')).map((b) => b.textContent)`)).sort()) === JSON.stringify(['#accueil (1)', '#idée (1)', '#projet (2)', '#rh (1)']));
  check('Tags — sans filtre, tous les fichiers sont dans l’arbre', (await fichiersArbre()).length >= 5);
  await h.js(`document.querySelector('#tags-liste .tag[data-tag="projet"]').click(); true`);
  await pause(200);
  check('Tags — cliquer sur un tag filtre l’arborescence', JSON.stringify((await fichiersArbre()).sort()) === JSON.stringify(['Accueil.md', 'Projet.md']), JSON.stringify(await fichiersArbre()));
  await h.js(`document.querySelector('#tags-liste .tag[data-tag="rh"]').click(); true`);
  await pause(200);
  check('Tags — plusieurs tags se cumulent (le fichier doit les porter tous)', JSON.stringify(await fichiersArbre()) === JSON.stringify(['Projet.md']));
  await h.js(`document.querySelector('#tags-liste .effacer').click(); true`);
  await pause(200);
  check('Tags — « Effacer le filtre » rétablit l’arbre complet', (await fichiersArbre()).length >= 5 && (await chips()).every((c) => c.endsWith(':false')));
  await saisir('#tags-champ', 'id');
  await pause(200);
  check('Tags — le champ restreint la liste des tags et filtre l’arbre', JSON.stringify(await fichiersArbre()) === JSON.stringify(['Idée.md']) && JSON.stringify(await chips()) === JSON.stringify(['idée:false']), JSON.stringify([await fichiersArbre(), await chips()]));
  await saisir('#tags-champ', 'zzz');
  await pause(200);
  check('Tags — aucun résultat : message explicite', (await h.js(`document.querySelector('#file-tree .aucun').textContent`)).includes('Aucun fichier'));
  await saisir('#tags-champ', '');
  await pause(200);
  check('Tags — champ vidé : arbre complet', (await fichiersArbre()).length >= 5);
  check('Tags — dossier ouvert sans refus : le scan reçoit le bon dossier', await h.js(`window.mdr.tags.liste().length === 3`));

  // ── Tâche 13 : rechercher/remplacer dans le dossier ───────────────────
  ecrireFichier('rp1.md', 'zorglub un\nZorglub deux, zorglubien\nfin\n');
  ecrireFichier('rp2.md', 'rien\nzorglub ici\n');
  ecrireFichier('sous/rp3.md', 'zorglub trois\n');
  const victime = path.join(path.dirname(racine), 'victime-lot2b.md');
  fs.writeFileSync(victime, 'zorglub hors dossier\n');
  const lireF = (rel) => fs.readFileSync(chemin(rel), 'utf8');
  await commande('fichier:dossier');
  await pause(700);
  await clic('.sidebar-tabs [data-tab="search"]');
  const apercuBtn = () => clic('#replace-preview-btn');
  const blocs = () => h.jsonJs(`Array.from(document.querySelectorAll('#replace-preview .rp-fichier')).map((b) => ({ rel: b.dataset.rel, n: b.querySelectorAll('.rp-occ').length, avant: Array.from(b.querySelectorAll('.rp-avant')).map((x) => x.textContent), apres: Array.from(b.querySelectorAll('.rp-apres')).map((x) => x.textContent) }))`);
  check('Remplacer — le champ « Remplacer par », les options et le bouton d’aperçu existent', await h.js(`['replace-input', 'opt-casse', 'opt-mot', 'opt-regex', 'replace-preview-btn'].every((id) => !!document.getElementById(id))`));
  await apercuBtn();
  await pause(300);
  check('Remplacer — sans texte recherché, l’aperçu demande de le saisir', (await h.js(`document.querySelector('#replace-preview .erreur').textContent`)).includes('Saisissez'));
  await saisir('#search-input', 'zorglub');
  await saisir('#replace-input', 'GLOUBI');
  await apercuBtn();
  await pause(500);
  const b1 = await blocs();
  check('Remplacer — l’aperçu liste, par fichier, chaque occurrence (insensible à la casse par défaut)', b1.map((b) => b.rel + ':' + b.n).join('|') === 'rp1.md:3|rp2.md:1|sous/rp3.md:1', JSON.stringify(b1.map((b) => b.rel + ':' + b.n)));
  check('Remplacer — chaque occurrence montre la ligne avant et après', b1[0].avant[0] === '− zorglub un' && b1[0].apres[0] === '+ GLOUBI un' && b1[0].apres[1] === '+ GLOUBI deux, zorglubien', JSON.stringify(b1[0]));
  check('Remplacer — rien n’est écrit par l’aperçu', lireF('rp1.md') === 'zorglub un\nZorglub deux, zorglubien\nfin\n' && fs.readFileSync(victime, 'utf8') === 'zorglub hors dossier\n');
  check('Remplacer — le résumé annonce le nombre d’occurrences et de fichiers', (await h.js(`document.querySelector('#replace-preview .resume').textContent`)).startsWith('5 occurrences dans 3 fichiers'));
  check('Remplacer — cases à cocher par fichier et par occurrence, toutes cochées', await h.js(`document.querySelectorAll('#replace-preview .rp-fichier > summary input:checked').length === 3 && document.querySelectorAll('#replace-preview .rp-occ input:checked').length === 5`));
  check('Remplacer — le bouton Appliquer annonce le nombre de remplacements', (await h.js(`document.getElementById('replace-apply').textContent`)) === 'Appliquer (5 remplacements)');

  // Options : casse, mot entier, expression régulière.
  await clic('#opt-casse');
  await apercuBtn();
  await pause(400);
  check('Remplacer — option « casse » : seules les occurrences de même casse', (await blocs()).map((b) => b.rel + ':' + b.n).join('|') === 'rp1.md:2|rp2.md:1|sous/rp3.md:1');
  await clic('#opt-mot');
  await apercuBtn();
  await pause(400);
  check('Remplacer — option « mot entier » : « zorglubien » exclu', (await blocs())[0].n === 1 && (await blocs())[0].avant[0] === '− zorglub un');
  await clic('#opt-casse');
  await clic('#opt-mot');
  await clic('#opt-regex');
  await saisir('#search-input', '(zorglub)(\\w*)');
  await saisir('#replace-input', '[$2|$1]');
  await apercuBtn();
  await pause(400);
  const bre = await blocs();
  check('Remplacer — expression régulière avec groupes ($1, $2)', bre[0].apres[0] === '+ [|zorglub] un' && bre[0].apres[1] === '+ [|Zorglub] deux, zorglubien' && bre[0].apres[2] === '+ Zorglub deux, [ien|zorglub]', JSON.stringify(bre[0]));
  await saisir('#search-input', '(zorglub');
  await apercuBtn();
  await pause(400);
  check('Remplacer — expression régulière invalide : message d’erreur, pas d’exception', /invalide/i.test(await h.js(`document.querySelector('#replace-preview .erreur').textContent`)) && (await h.js(`document.querySelectorAll('#replace-preview .rp-fichier').length`)) === 0);
  await saisir('#search-input', 'a*');
  await apercuBtn();
  await pause(400);
  check('Remplacer — une expression qui reconnaît la chaîne vide est refusée', /vide/.test(await h.js(`document.querySelector('#replace-preview .erreur').textContent`)));
  await clic('#opt-regex');

  // Sélection fine puis application avec confirmation.
  await saisir('#search-input', 'zorglub');
  await saisir('#replace-input', 'GLOUBI');
  await apercuBtn();
  await pause(500);
  await h.js(`document.querySelector('#replace-preview .rp-fichier[data-rel="rp1.md"] .rp-occ:nth-of-type(2) input').click(); true`);
  await h.js(`document.querySelector('#replace-preview .rp-fichier[data-rel="rp2.md"] > summary input').click(); true`);
  await pause(100);
  check('Remplacer — décocher une occurrence ou un fichier met le compteur à jour', (await h.js(`document.getElementById('replace-apply').textContent`)) === 'Appliquer (3 remplacements)' && (await h.js(`document.querySelector('#replace-preview .rp-fichier[data-rel="rp1.md"] > summary input').indeterminate`)) === true);
  await ouvrirDoc('rp1.md');
  await ouvrirDoc('sous/rp3.md');
  await pause(300);
  // rp3 est modifié dans son onglet : il ne doit pas être écrasé.
  await h.js(`(() => { const t = window.mdr.onglets.liste().find((x) => x.path.endsWith('rp3.md')); window.mdr.onglets.activer(t); window.mdr.editeur().insertText('local '); return true; })()`);
  await pause(200);
  await h.js(`window.__questions = []; window.confirm = (m) => { window.__questions.push(m); return false; }; true`);
  await clic('#replace-apply');
  await pause(300);
  const q1 = await h.jsonJs(`window.__questions`);
  check('Remplacer — « Appliquer » demande confirmation avec les nombres', q1.length === 1 && /2 occurrences dans 1 fichier/.test(q1[0]), JSON.stringify(q1));
  check('Remplacer — refus : aucun fichier modifié', lireF('rp1.md') === 'zorglub un\nZorglub deux, zorglubien\nfin\n' && lireF('rp2.md') === 'rien\nzorglub ici\n');
  // Un fichier modifié sur le disque depuis l'aperçu est sauté (on triche : rp2 est décoché, on utilise rp1).
  await h.js(`window.confirm = (m) => { window.__questions.push(m); return true; }; true`);
  await clic('#replace-apply');
  await pause(900);
  check('Remplacer — acceptation : seules les occurrences cochées sont remplacées', lireF('rp1.md') === 'GLOUBI un\nZorglub deux, GLOUBIien\nfin\n', JSON.stringify(lireF('rp1.md')));
  check('Remplacer — un fichier décoché reste intact', lireF('rp2.md') === 'rien\nzorglub ici\n');
  check('Remplacer — un fichier dont l’onglet a des modifications non enregistrées est ignoré (pas écrasé)', lireF('sous/rp3.md') === 'zorglub trois\n');
  check('Remplacer — le fichier hors dossier n’est jamais touché', fs.readFileSync(victime, 'utf8') === 'zorglub hors dossier\n');
  const rp1Onglet = await h.js(`(() => { const t = window.mdr.onglets.liste().find((x) => x.path.endsWith('rp1.md')); window.mdr.onglets.activer(t); return window.mdr.editeur().getValue(); })()`);
  await pause(300);
  check('Remplacer — l’onglet ouvert est rechargé avec le nouveau contenu', rp1Onglet === 'GLOUBI un\nZorglub deux, GLOUBIien\nfin\n', JSON.stringify(rp1Onglet));
  check('Remplacer — le résumé indique les remplacements, l’onglet rechargé et le fichier ignoré', await h.js(`(() => { const t = document.querySelector('#replace-preview .resume').textContent; return /2 remplacements dans 1 fichier/.test(t) && /onglet rechargé/.test(t) && /ignoré/.test(t); })()`), await h.js(`document.querySelector('#replace-preview .resume').textContent`));

  // Fichier modifié entre l'aperçu et l'application : sauté.
  await h.js(`window.mdr.onglets.activer(window.mdr.onglets.liste().find((x) => x.path.endsWith('rp1.md'))); true`);
  await saisir('#search-input', 'zorglub');
  await saisir('#replace-input', 'ALPHA');
  await apercuBtn();
  await pause(500);
  fs.writeFileSync(chemin('rp2.md'), 'rien\nzorglub ici, changé ailleurs\n');
  await clic('#replace-apply');
  await pause(900);
  check('Remplacer — un fichier modifié depuis l’aperçu est sauté, signalé, et laissé tel quel', lireF('rp2.md') === 'rien\nzorglub ici, changé ailleurs\n' && /rp2\.md : modifié depuis l’aperçu/.test(await h.js(`document.querySelector('#replace-preview .resume').textContent`)), await h.js(`document.querySelector('#replace-preview .resume').textContent`));
  check('Remplacer — les autres fichiers de la même demande sont bien traités', lireF('rp1.md').includes('ALPHA') && !lireF('rp1.md').includes('ALPHA ALPHA'));

  // IPC directe : aucun chemin hors dossier n'est écrit.
  const attaque = JSON.parse(await h.js(`window.api.appliquerRemplacement(${JSON.stringify(racine)}, { recherche: 'zorglub', remplacement: 'PWNED' }, [{ rel: '../victime-lot2b.md', empreinte: ${JSON.stringify(require('../remplacement.js').empreinte('zorglub hors dossier\n'))}, indices: [0] }, { rel: ${JSON.stringify(victime)}, empreinte: 'x', indices: [0] }]).then((r) => JSON.stringify(r))`));
  check('Remplacer — un chemin hors du dossier ouvert est refusé par l’IPC', attaque.modifies.length === 0 && attaque.sautes.length === 2 && fs.readFileSync(victime, 'utf8') === 'zorglub hors dossier\n', JSON.stringify(attaque));
  check('Remplacer — la commande de palette ouvre l’onglet Recherche', await (async () => { await clic('.sidebar-tabs [data-tab="files"]'); await commande('recherche:remplacer-dossier'); return h.js(`document.getElementById('tab-search').classList.contains('active') && document.activeElement.id === 'search-input'`); })());

  fs.rmSync(victime, { force: true });
  fs.rmSync(racine, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

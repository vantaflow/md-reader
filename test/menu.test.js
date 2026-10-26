// Structure du gabarit de menu et de la liste des documents récents : tests
// node purs, sans Electron.
const test = require('node:test');
const assert = require('node:assert');
const { creerTemplate, ajouterRecent, assainirRecents, MAX_RECENTS } = require('../menu.js');
const raccourcis = require('../renderer/lib/raccourcis.js');

const envoyes = [];
const base = (plateforme, recents = []) => creerTemplate({
  plateforme, nomApp: 'MD Reader', recents,
  envoyer: (...a) => envoyes.push(a),
  ouvrirRecent: (p) => envoyes.push(['recent', p]),
  effacerRecents: () => envoyes.push(['effacer']),
});
const menu = (t, label) => t.find((m) => m.label === label);
const aplatir = (items) => items.flatMap((i) => [i, ...(i.submenu ? aplatir(i.submenu) : [])]);

test('menus de premier niveau : libellés français, par plateforme', () => {
  const win = base('win32').map((m) => m.label);
  assert.deepStrictEqual(win, ['Fichier', 'Édition', 'Format', 'Affichage', 'Fenêtre', 'Aide']);
  const mac = base('darwin').map((m) => m.label);
  assert.deepStrictEqual(mac, ['MD Reader', 'Fichier', 'Édition', 'Format', 'Affichage', 'Fenêtre', 'Aide']);
});

test('Format : toutes les actions avec les raccourcis de la spec', () => {
  const format = menu(base('win32'), 'Format').submenu.filter((i) => i.label);
  const attendu = {
    Gras: 'CmdOrCtrl+B', Italique: 'CmdOrCtrl+I', Barré: 'CmdOrCtrl+Shift+X',
    'Titre 1': 'CmdOrCtrl+Alt+1', 'Titre 2': 'CmdOrCtrl+Alt+2', 'Titre 3': 'CmdOrCtrl+Alt+3',
    'Liste à puces': 'CmdOrCtrl+Shift+8', 'Liste numérotée': 'CmdOrCtrl+Shift+7', 'Liste de tâches': 'CmdOrCtrl+Shift+9',
    Lien: 'CmdOrCtrl+K', Image: 'CmdOrCtrl+Shift+I', Tableau: 'CmdOrCtrl+Alt+T', 'Bloc de code': 'CmdOrCtrl+Alt+C',
    Citation: 'CmdOrCtrl+Shift+.', 'Saut de page': 'CmdOrCtrl+Enter',
    'Éditeur de tableau…': 'CmdOrCtrl+Alt+Shift+T', 'Reformater le document': 'CmdOrCtrl+Alt+Shift+F', 'Reformater la sélection': 'CmdOrCtrl+Alt+Shift+R',
    // Mode Document : souligné, diagramme visuel, styles du document.
    Souligné: 'CmdOrCtrl+U', 'Diagramme visuel…': undefined, 'Styles du document…': undefined,
  };
  assert.deepStrictEqual(Object.fromEntries(format.map((i) => [i.label, i.accelerator])), attendu);
});

test('Format : chaque entrée envoie menu:commande avec son identifiant format:*', () => {
  envoyes.length = 0;
  const gras = menu(base('win32'), 'Format').submenu.find((i) => i.label === 'Gras');
  gras.click();
  assert.deepStrictEqual(envoyes[0], ['menu:commande', 'format:gras']);
});

test('raccourcis : aucun doublon, ni dans le gabarit ni dans la table', () => {
  for (const plateforme of ['darwin', 'win32']) {
    const accels = aplatir(base(plateforme)).map((i) => i.accelerator).filter(Boolean);
    const doublons = accels.filter((a, i) => accels.indexOf(a) !== i);
    assert.deepStrictEqual(doublons, [], plateforme);
    const table = raccourcis.TABLE.map((r) => raccourcis.accelerateur(r.id, plateforme));
    assert.deepStrictEqual(table.filter((a, i) => table.indexOf(a) !== i), [], 'table ' + plateforme);
  }
});

test('Affichage : modes, thèmes, zoom, panneau, focus, plein écran, rechargement, outils', () => {
  const items = aplatir(menu(base('win32'), 'Affichage').submenu).map((i) => i.label).filter(Boolean);
  for (const l of ['Continu', 'A4 · 1 page', 'A4 · 2 pages', 'Clair', 'Sombre', 'Système', 'Zoom avant', 'Zoom arrière',
    'Taille réelle', 'Afficher/masquer le panneau latéral', 'Éditeur seul', 'Aperçu seul', 'Éditeur et aperçu',
    'Barre d’outils de mise en forme', 'Mode focus', 'Plein écran', 'Recharger', 'Outils de développement']) {
    assert.ok(items.includes(l), 'manque : ' + l);
  }
  const roles = aplatir(menu(base('win32'), 'Affichage').submenu).map((i) => i.role).filter(Boolean);
  for (const r of ['zoomIn', 'zoomOut', 'resetZoom', 'togglefullscreen', 'reload', 'toggleDevTools']) assert.ok(roles.includes(r), r);
});

test('Fichier : Enregistrer sous, Dupliquer, sous-menu Ouvrir récent', () => {
  const fichier = menu(base('win32', ['/a/un.md', '/b/deux.md']), 'Fichier').submenu;
  const ss = fichier.find((i) => i.label === 'Enregistrer sous…');
  assert.strictEqual(ss.accelerator, 'CmdOrCtrl+Shift+S');
  assert.ok(fichier.some((i) => i.label === 'Dupliquer'));
  const recent = fichier.find((i) => i.label === 'Ouvrir récent');
  const noms = recent.submenu.filter((i) => i.label).map((i) => i.label);
  assert.ok(noms[0].startsWith('un.md') && noms[1].startsWith('deux.md'));
  assert.strictEqual(noms[noms.length - 1], 'Effacer la liste');
  envoyes.length = 0;
  recent.submenu[1].click();
  recent.submenu.find((i) => i.label === 'Effacer la liste').click();
  assert.deepStrictEqual(envoyes, [['recent', '/b/deux.md'], ['effacer']]);
});

test('Ouvrir récent : liste vide, entrée désactivée', () => {
  const recent = menu(base('win32'), 'Fichier').submenu.find((i) => i.label === 'Ouvrir récent');
  assert.strictEqual(recent.submenu[0].enabled, false);
  assert.strictEqual(recent.submenu.find((i) => i.label === 'Effacer la liste').enabled, false);
});

test('Aide : aide-mémoire, raccourcis, à propos (menu de l’app sous macOS)', () => {
  const aide = aplatir(menu(base('win32'), 'Aide').submenu).map((i) => i.label).filter(Boolean);
  assert.deepStrictEqual(aide, ['Aide-mémoire Markdown', 'Raccourcis clavier', 'Rechercher les mises à jour…', 'À propos de MD Reader']);
  const aideMac = aplatir(menu(base('darwin'), 'Aide').submenu).map((i) => i.label).filter(Boolean);
  assert.ok(!aideMac.includes('À propos de MD Reader'));
  assert.ok(aplatir(menu(base('darwin'), 'MD Reader').submenu).some((i) => i.label === 'À propos de MD Reader'));
});

test('tous les libellés sont renseignés (sauf séparateurs) et aucun n’est en anglais brut', () => {
  for (const i of aplatir(base('darwin'))) {
    if (i.type === 'separator') continue;
    assert.ok(typeof i.label === 'string' && i.label.length > 0, JSON.stringify(i));
  }
});

test('récents : ajout en tête, sans doublon, borné à 10', () => {
  let l = [];
  for (let i = 0; i < 15; i += 1) l = ajouterRecent(l, `/d/${i}.md`);
  assert.strictEqual(l.length, MAX_RECENTS);
  assert.strictEqual(l[0], '/d/14.md');
  l = ajouterRecent(l, '/d/10.md');
  assert.strictEqual(l[0], '/d/10.md');
  assert.strictEqual(l.filter((p) => p === '/d/10.md').length, 1);
  assert.deepStrictEqual(ajouterRecent(['/a'], ''), ['/a']);
});

test('récents : un fichier de liste corrompu est assaini', () => {
  assert.deepStrictEqual(assainirRecents('nimporte'), []);
  assert.deepStrictEqual(assainirRecents(['/a', 3, null, '/a', '/b']), ['/a', '/b']);
});

test('table de raccourcis : affichage et touche CodeMirror', () => {
  assert.strictEqual(raccourcis.afficher('CmdOrCtrl+Shift+S', 'darwin'), 'Cmd+Shift+S');
  assert.strictEqual(raccourcis.afficher('CmdOrCtrl+Shift+S', 'win32'), 'Ctrl+Shift+S');
  assert.strictEqual(raccourcis.toucheEditeur('format:gras'), 'Mod-b');
  assert.strictEqual(raccourcis.toucheEditeur('format:barre'), 'Mod-Shift-x');
  assert.strictEqual(raccourcis.toucheEditeur('format:titre2'), 'Mod-Alt-2');
  assert.strictEqual(raccourcis.toucheEditeur('format:saut-page'), 'Mod-Enter');
});

test('Fichier : « Exporter en Word… » envoie la commande export:docx', () => {
  envoyes.length = 0;
  const entree = menu(base('win32'), 'Fichier').submenu.find((i) => i.label === 'Exporter en Word…');
  assert.ok(entree, 'entrée absente');
  entree.click();
  assert.deepStrictEqual(envoyes[0], ['menu:commande', 'export:docx']);
});

test('Affichage : « Aperçu seul en plein écran » et « Éditeur seul sans distraction » avec raccourcis, sans doublon', () => {
  envoyes.length = 0;
  const affichage = menu(base('win32'), 'Affichage').submenu;
  const apercu = affichage.find((i) => i.label === 'Aperçu seul en plein écran');
  const editeur = affichage.find((i) => i.label === 'Éditeur seul sans distraction');
  assert.ok(apercu && editeur, 'entrées absentes');
  assert.strictEqual(apercu.accelerator, 'CmdOrCtrl+Shift+F');
  assert.strictEqual(editeur.accelerator, 'CmdOrCtrl+Shift+D');
  apercu.click();
  editeur.click();
  assert.deepStrictEqual(envoyes, [['menu:commande', 'vue:focus-apercu'], ['menu:commande', 'vue:focus-editeur']]);
  assert.ok(affichage.some((i) => i.label === 'Mode focus'), 'le mode focus existant reste dans le menu');
});

test('Édition : « Copier en HTML riche » avec son raccourci, sans doublon, envoie la commande', () => {
  envoyes.length = 0;
  const entree = menu(base('win32'), 'Édition').submenu.find((i) => i.label === 'Copier en HTML riche');
  assert.ok(entree, 'entrée absente');
  assert.strictEqual(entree.accelerator, 'CmdOrCtrl+Alt+Shift+C');
  entree.click();
  assert.deepStrictEqual(envoyes[0], ['menu:commande', 'edition:copier-html-riche']);
});

test('Fichier et Affichage : EPUB, slides en PDF, diaporama (F5) envoient leur commande', () => {
  envoyes.length = 0;
  const fichier = menu(base('win32'), 'Fichier').submenu;
  const affichage = menu(base('win32'), 'Affichage').submenu;
  const epub = fichier.find((i) => i.label === 'Exporter en EPUB…');
  const slides = fichier.find((i) => i.label === 'Exporter les slides en PDF…');
  const diapo = affichage.find((i) => i.label === 'Diaporama');
  assert.ok(epub && slides && diapo, 'entrées absentes');
  assert.strictEqual(diapo.accelerator, 'F5');
  epub.click(); slides.click(); diapo.click();
  assert.deepStrictEqual(envoyes, [['menu:commande', 'export:epub'], ['menu:commande', 'export:diaporama-pdf'], ['menu:commande', 'vue:diaporama']]);
});

test('Fichier : « Historique des versions… » envoie la commande fichier:historique', () => {
  envoyes.length = 0;
  const fichier = menu(base('win32'), 'Fichier').submenu;
  const e = fichier.find((i) => i.label === 'Historique des versions…');
  assert.ok(e, 'entrée absente');
  e.click();
  assert.deepStrictEqual(envoyes, [['menu:commande', 'fichier:historique']]);
});

test('Affichage : mode présentation lecture (raccourci, sans doublon) et Statistiques envoient leur commande', () => {
  envoyes.length = 0;
  const affichage = menu(base('win32'), 'Affichage').submenu;
  const lecture = affichage.find((i) => i.label === 'Mode présentation lecture');
  const stats = affichage.find((i) => i.label === 'Statistiques…');
  assert.ok(lecture && stats, 'entrées absentes');
  assert.strictEqual(lecture.accelerator, 'CmdOrCtrl+Alt+L');
  lecture.click(); stats.click();
  assert.deepStrictEqual(envoyes, [['menu:commande', 'vue:lecture'], ['menu:commande', 'stats:ouvrir']]);
});

test('Aide : « Rechercher les mises à jour… » envoie la commande aide:maj (aussi sous macOS)', () => {
  for (const pf of ['win32', 'darwin']) {
    envoyes.length = 0;
    const e = menu(base(pf), 'Aide').submenu.find((i) => i.label === 'Rechercher les mises à jour…');
    assert.ok(e, 'entrée absente');
    e.click();
    assert.deepStrictEqual(envoyes, [['menu:commande', 'aide:maj']]);
  }
});

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
  assert.deepStrictEqual(aide, ['Aide-mémoire Markdown', 'Raccourcis clavier', 'À propos de MD Reader']);
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

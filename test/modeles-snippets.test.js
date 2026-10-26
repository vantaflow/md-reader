// Modèles de documents, snippets (lib + fichier JSON), menu contextuel du
// correcteur et liste des .md d'un dossier : tout ce qui se teste sans Electron.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const modeles = require('../renderer/lib/modeles.js');
const snippets = require('../renderer/lib/snippets.js');
const contexte = require('../contexte.js');
const donnees = require('../donnees.js');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-ecr-'));

test('modèles : les quatre modèles attendus, en français, avec contenu réel', () => {
  assert.deepStrictEqual(modeles.MODELES.map((m) => m.id), ['compte-rendu', 'specification', 'readme', 'lettre']);
  for (const m of modeles.MODELES) {
    assert.ok(m.nom && m.description && m.contenu.length > 300, m.id);
    assert.match(m.contenu, /[éèàêç]/, m.id);
  }
  assert.match(modeles.parId('compte-rendu').contenu, /Participants[\s\S]*Décisions[\s\S]*Actions/);
  assert.match(modeles.parId('lettre').contenu, /Madame, Monsieur/);
  assert.match(modeles.parId('readme').contenu, /## Installation/);
  assert.match(modeles.parId('specification').contenu, /Critères d'acceptation/);
});

test('modèles : la date du jour est écrite en français', () => {
  assert.equal(modeles.dateFrancaise(new Date(2026, 9, 25)), '25 octobre 2026');
  assert.equal(modeles.dateFrancaise(new Date(2026, 0, 1)), '1er janvier 2026');
  const c = modeles.contenu('compte-rendu', new Date(2026, 1, 3));
  assert.match(c, /\*\*Date\*\* : 3 février 2026/);
  assert.doesNotMatch(c, /\{\{date\}\}/);
  assert.equal(modeles.contenu('inconnu'), null);
});

test('snippets : assainissement, doublons, bornes', () => {
  const l = snippets.assainir([
    { nom: ' A ', contenu: 'x' }, { nom: 'a', contenu: 'y' }, { nom: '', contenu: 'z' },
    { nom: 'B', contenu: 3 }, null, { nom: 'C', contenu: 'x'.repeat(snippets.MAX_CONTENU + 1) }, { nom: 'D', contenu: '' },
  ]);
  assert.deepStrictEqual(l, [{ nom: 'a', contenu: 'y' }, { nom: 'D', contenu: '' }]);
  assert.deepStrictEqual(snippets.assainir('non'), []);
  const beaucoup = Array.from({ length: 300 }, (_, i) => ({ nom: 'n' + i, contenu: 'c' }));
  assert.equal(snippets.assainir(beaucoup).length, snippets.MAX_SNIPPETS);
});

test('snippets : ajouter remplace le même nom, supprimer, trouver, date', () => {
  let l = snippets.ajouter([], 'Sig', 'v1');
  l = snippets.ajouter(l, 'sig', 'v2');
  assert.deepStrictEqual(l, [{ nom: 'sig', contenu: 'v2' }]);
  assert.deepStrictEqual(snippets.trouver(l, 'SIG'), { nom: 'sig', contenu: 'v2' });
  assert.deepStrictEqual(snippets.supprimer(l, 'SIG'), []);
  assert.equal(snippets.texteInsere({ nom: 'd', contenu: 'Le {{date}}.' }, new Date(2026, 9, 25)), 'Le 25 octobre 2026.');
  assert.ok(snippets.EXEMPLES.length >= 3);
});

test('snippets (disque) : exemples au premier lancement, puis persistance', async () => {
  const d = temp();
  const premiere = await donnees.lireSnippets(d);
  assert.deepStrictEqual(premiere, snippets.assainir(snippets.EXEMPLES));
  assert.ok(fs.existsSync(path.join(d, 'snippets.json')));
  const apres = await donnees.ecrireSnippets(d, [{ nom: 'Un', contenu: 'texte' }, { nom: '', contenu: 'refusé' }]);
  assert.deepStrictEqual(apres, [{ nom: 'Un', contenu: 'texte' }]);
  assert.deepStrictEqual(await donnees.lireSnippets(d), [{ nom: 'Un', contenu: 'texte' }]);
  await donnees.ecrireSnippets(d, []);
  assert.deepStrictEqual(await donnees.lireSnippets(d), [], 'une liste vidée volontairement reste vide');
});

test('snippets (disque) : fichier corrompu = liste vide, fichier conservé', async () => {
  const d = temp();
  fs.writeFileSync(path.join(d, 'snippets.json'), '{pas du json', 'utf8');
  assert.deepStrictEqual(await donnees.lireSnippets(d), []);
  assert.equal(fs.readFileSync(path.join(d, 'snippets.json'), 'utf8'), '{pas du json');
});

test('listerMdRelatifs : .md relatifs, sans cachés ni node_modules, bornés', async () => {
  const d = temp();
  const poser = (rel, c = '# x') => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), c); };
  poser('a.md'); poser('sous/b.markdown'); poser('sous/c.txt'); poser('.cache/z.md'); poser('node_modules/m/r.md'); poser('sous/profond/x/y/z/w/trop.md');
  const r = await donnees.listerMdRelatifs(d);
  assert.deepStrictEqual(r.fichiers, ['a.md', 'sous/b.markdown']);
  assert.equal(r.dossier, path.resolve(d));
  await assert.rejects(() => donnees.listerMdRelatifs('relatif/dossier'), /invalide/);
  await assert.rejects(() => donnees.listerMdRelatifs(path.join(d, 'a.md')), /pas un dossier/);
  await assert.rejects(() => donnees.listerMdRelatifs(path.join(d, 'absent')), /introuvable/);
  await assert.rejects(() => donnees.listerMdRelatifs(null), /invalide/);
});

test('correcteur : réglage vers langues Electron', () => {
  assert.deepStrictEqual(contexte.languesCorrecteur('fr'), ['fr']);
  assert.deepStrictEqual(contexte.languesCorrecteur('en'), ['en-US']);
  assert.deepStrictEqual(contexte.languesCorrecteur('fr-en'), ['fr', 'en-US']);
  assert.deepStrictEqual(contexte.languesCorrecteur('aucun'), []);
  assert.deepStrictEqual(contexte.languesCorrecteur('klingon'), ['fr', 'en-US']);
  assert.deepStrictEqual(contexte.languesCorrecteur('__proto__'), ['fr', 'en-US']);
});

test('menu contextuel : mot mal orthographié = suggestions, ajout au dictionnaire, puis édition', () => {
  const appels = [];
  const t = contexte.creerTemplateContexte({
    isEditable: true, misspelledWord: 'bonjoure',
    dictionarySuggestions: ['bonjour', 'bonjours', 'a', 'b', 'c', 'd', 'e'],
    editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
  }, { remplacer: (s) => appels.push(['r', s]), ajouterAuDictionnaire: (w) => appels.push(['a', w]) });
  const labels = t.filter((i) => i.label).map((i) => i.label);
  assert.deepStrictEqual(labels, ['bonjour', 'bonjours', 'a', 'b', 'c', 'Ajouter au dictionnaire', 'Couper', 'Copier', 'Coller', 'Tout sélectionner']);
  t[0].click();
  t.find((i) => i.label === 'Ajouter au dictionnaire').click();
  assert.deepStrictEqual(appels, [['r', 'bonjour'], ['a', 'bonjoure']]);
  assert.equal(t.find((i) => i.label === 'Couper').enabled, false);
  assert.equal(t.find((i) => i.label === 'Coller').enabled, true);
  assert.deepStrictEqual(t.filter((i) => i.role).map((i) => i.role), ['cut', 'copy', 'paste', 'selectAll']);
});

test('menu contextuel : mot mal orthographié sans suggestion', () => {
  const t = contexte.creerTemplateContexte({ isEditable: true, misspelledWord: 'xqzv', dictionarySuggestions: [] });
  assert.equal(t[0].label, 'Aucune suggestion');
  assert.equal(t[0].enabled, false);
  assert.ok(t.some((i) => i.label === 'Ajouter au dictionnaire'));
});

test('menu contextuel : mot bien orthographié, pas de suggestions ni d’ajout', () => {
  const t = contexte.creerTemplateContexte({ isEditable: true, misspelledWord: '', dictionarySuggestions: [], editFlags: {} });
  assert.deepStrictEqual(t.filter((i) => i.label).map((i) => i.label), ['Couper', 'Copier', 'Coller', 'Tout sélectionner']);
  assert.equal(t[0].type, undefined);
});

test('menu contextuel : zone non modifiable = Copier si sélection, sinon rien', () => {
  assert.deepStrictEqual(contexte.creerTemplateContexte({ isEditable: false, selectionText: 'du texte' }).map((i) => i.role), ['copy']);
  assert.deepStrictEqual(contexte.creerTemplateContexte({ isEditable: false, selectionText: '  ' }), []);
  assert.deepStrictEqual(contexte.creerTemplateContexte(undefined), []);
});

test('correcteur : application à une session (langues connues filtrées, macOS transmis tel quel)', () => {
  const vu = [];
  const session = (dispo) => ({ availableSpellCheckerLanguages: dispo, setSpellCheckerLanguages: (l) => vu.push(l) });
  assert.deepStrictEqual(contexte.appliquerLanguesCorrecteur(session(['fr', 'en-US', 'de']), 'fr-en'), ['fr', 'en-US']);
  assert.deepStrictEqual(contexte.appliquerLanguesCorrecteur(session(['en-US']), 'fr-en'), ['en-US']);
  assert.deepStrictEqual(contexte.appliquerLanguesCorrecteur(session([]), 'fr'), ['fr']);
  assert.deepStrictEqual(vu, [['fr', 'en-US'], ['en-US'], ['fr']]);
  const casse = { availableSpellCheckerLanguages: [], setSpellCheckerLanguages: () => { throw new Error('indisponible'); } };
  assert.deepStrictEqual(contexte.appliquerLanguesCorrecteur(casse, 'en'), ['en-US']);
});

test('menu contextuel : branchement sur l’événement context-menu', () => {
  const { EventEmitter } = require('events');
  const contenu = new EventEmitter();
  const faits = [];
  contenu.replaceMisspelling = (m) => faits.push(['remplace', m]);
  contenu.session = { addWordToSpellCheckerDictionary: (m) => faits.push(['ajoute', m]) };
  let gabarit = null;
  let option = null;
  const Menu = { buildFromTemplate: (g) => { gabarit = g; return { popup: (o) => { option = o; } }; } };
  contexte.brancherMenuContextuel(contenu, { Menu, fenetre: () => 'fenetre' });
  contenu.emit('context-menu', {}, { isEditable: true, misspelledWord: 'tset', dictionarySuggestions: ['test'], editFlags: {} });
  assert.equal(option.window, 'fenetre');
  gabarit[0].click();
  gabarit.find((i) => i.label === 'Ajouter au dictionnaire').click();
  assert.deepStrictEqual(faits, [['remplace', 'test'], ['ajoute', 'tset']]);
  gabarit = null;
  contenu.emit('context-menu', {}, { isEditable: false, selectionText: '' });
  assert.equal(gabarit, null, 'rien à proposer : pas de menu');
});

test('réglage correcteur : défaut fr-en, valeurs fermées', () => {
  const settings = require('../renderer/lib/settings.js');
  const s = settings.creer();
  assert.equal(s.get('correcteur'), 'fr-en');
  s.set('correcteur', 'en');
  assert.equal(s.get('correcteur'), 'en');
  assert.throws(() => s.set('correcteur', 'klingon'), TypeError);
});

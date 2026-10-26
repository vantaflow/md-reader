// Lot 1 (1.8.0) — fondations et réglages : tests Electron de bout en bout.
// Même modèle que smoke.js, via le harnais partagé test/helpers.js.
const { nativeTheme, Menu } = require('electron');
const { creerTemplate } = require('../menu.js');
const raccourcisTable = require('../renderer/lib/raccourcis.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { creerHarnais } = require('./helpers.js');

const h = creerHarnais();
const { check } = h;

// Une valeur posée « comme l'utilisateur » dans la modale Réglages.
const REGLER = `window.__regler = (cle, valeur) => {
  const el = document.getElementById('reglage-' + cle);
  if (!el) return false;
  if (el.type === 'checkbox') el.checked = !!valeur; else el.value = String(valeur);
  el.dispatchEvent(new Event(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
}; true`;

const reglagesMemorises = () => h.jsonJs(`JSON.parse(localStorage.getItem('reglages') || '{}')`);
const pause = (ms) => h.attendre(ms);

(async () => {
  const fichierOuvert = path.join(os.tmpdir(), `mdr-onglet-${Date.now()}.md`);
  fs.writeFileSync(fichierOuvert, '# Rouvert\n\nContenu mémorisé.\n', 'utf8');
  await h.demarrer({
    stubs: {
      'file:read': (_e, p) => (fs.existsSync(p) ? { path: p, content: fs.readFileSync(p, 'utf8') } : null),
    },
  });

  // ── Tâche 1 : fondations ──────────────────────────────────────────────
  const base = await h.jsonJs(`({
    settings: typeof window.mdrSettings?.get + typeof window.mdrSettings?.set + typeof window.mdrSettings?.onChange,
    mdr: Object.keys(window.mdr || {}).sort(),
    editeurOptions: typeof window.mdr?.editeur?.()?.setOptions,
    palette: typeof window.mdr?.palette?.ouvrir,
    onglets: typeof window.mdr?.onglets?.liste,
  })`);
  check('Fondations — le magasin de réglages est chargé dans le renderer', base.settings === 'functionfunctionfunction', JSON.stringify(base));
  check('Fondations — window.mdr expose éditeur, réglages, palette, onglets',
    ['editeur', 'reglages', 'palette', 'onglets'].every((k) => base.mdr.includes(k)), JSON.stringify(base));
  check('Fondations — l’éditeur expose setOptions()', base.editeurOptions === 'function');
  check('Fondations — mdr.palette et mdr.onglets sont utilisables', base.palette === 'function' && base.onglets === 'function');

  // Migration des anciennes clés, vue du renderer : on fabrique l'état d'une
  // installation 1.7.x, puis on recharge.
  await h.js(`localStorage.clear();
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('modeAffichage', 'continu');
    localStorage.setItem('codePaneVisible', 'true');
    localStorage.setItem('pdfOptions', JSON.stringify({ 'pdf-page-size': 'Letter', 'pdf-watermark': 'ANCIEN' })); true`);
  await h.recharger();
  const mig = await h.jsonJs(`({
    theme: window.mdrSettings.get('theme'),
    dom: document.documentElement.getAttribute('data-theme'),
    mode: document.getElementById('mode-affichage').value,
    code: document.getElementById('toggle-editor').checked,
    pdf: window.mdrSettings.get('pdfFormat') + '/' + window.mdrSettings.get('pdfFiligrane'),
    stocke: !!localStorage.getItem('reglages'),
  })`);
  check('Migration — l’ancien thème sombre est repris', mig.theme === 'sombre' && mig.dom === 'dark', JSON.stringify(mig));
  check('Migration — l’ancien mode d’affichage est repris', mig.mode === 'continu', JSON.stringify(mig));
  check('Migration — le volet Code mémorisé est repris', mig.code === true, JSON.stringify(mig));
  check('Migration — les anciennes options PDF sont reprises', mig.pdf === 'Letter/ANCIEN', JSON.stringify(mig));
  check('Migration — tout est écrit sous la clé reglages', mig.stocke === true, JSON.stringify(mig));
  await h.js(`localStorage.clear(); true`);
  await h.recharger();

  // Compartiments CodeMirror de l'éditeur.
  const cm = await h.jsonJs(`(() => {
    const ed = window.mdr.editeur();
    ed.setOptions({ police: 'Courier New', taille: 22, retourLigne: false, numeros: false, tabulation: 8 });
    const c = document.querySelector('#editor .cm-content');
    return {
      police: getComputedStyle(document.querySelector('#editor .cm-scroller')).fontFamily,
      taille: getComputedStyle(c).fontSize,
      wrap: c.classList.contains('cm-lineWrapping'),
      numeros: !!document.querySelector('#editor .cm-lineNumbers'),
      tab: ed.view.state.tabSize,
    };
  })()`);
  check('Éditeur — setOptions change la police', /Courier/.test(cm.police), JSON.stringify(cm));
  check('Éditeur — setOptions change la taille', cm.taille === '22px', JSON.stringify(cm));
  check('Éditeur — setOptions désactive le retour à la ligne', cm.wrap === false, JSON.stringify(cm));
  check('Éditeur — setOptions masque les numéros de ligne', cm.numeros === false, JSON.stringify(cm));
  check('Éditeur — setOptions change la tabulation', cm.tab === 8, JSON.stringify(cm));
  const cm2 = await h.jsonJs(`(() => {
    window.mdr.editeur().setOptions({ retourLigne: true, numeros: true });
    const c = document.querySelector('#editor .cm-content');
    return { wrap: c.classList.contains('cm-lineWrapping'), numeros: !!document.querySelector('#editor .cm-lineNumbers') };
  })()`);
  check('Éditeur — setOptions réactive retour à la ligne et numéros', cm2.wrap && cm2.numeros, JSON.stringify(cm2));
  await h.js(`localStorage.clear(); true`);
  await h.recharger();

  // ── Tâche 2 : modale Réglages ─────────────────────────────────────────
  await h.js(REGLER);
  const ouverture = await h.jsonJs(`(() => {
    const modal = document.getElementById('reglages-modal');
    const etat = () => modal && !modal.classList.contains('hidden');
    const avant = etat();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, ctrlKey: true, bubbles: true }));
    const parRaccourci = etat();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const fermeParEchap = !etat();
    window.commands.run('reglages:ouvrir');
    const parPalette = etat();
    const onglets = Array.from(modal.querySelectorAll('[data-onglet]')).map((b) => b.textContent.trim());
    window.mdr.reglagesUI.fermer();
    return { avant, parRaccourci, fermeParEchap, parPalette, onglets, existe: !!modal };
  })()`);
  check('Réglages — la modale existe et est fermée au départ', ouverture.existe && ouverture.avant === false, JSON.stringify(ouverture));
  check('Réglages — Cmd/Ctrl+, ouvre la modale', ouverture.parRaccourci, JSON.stringify(ouverture));
  check('Réglages — Échap la ferme', ouverture.fermeParEchap, JSON.stringify(ouverture));
  check('Réglages — la commande de palette l’ouvre', ouverture.parPalette, JSON.stringify(ouverture));
  check('Réglages — quatre onglets Éditeur / Aperçu / Export PDF / Général',
    JSON.stringify(ouverture.onglets) === JSON.stringify(['Éditeur', 'Aperçu', 'Export PDF', 'Général']), JSON.stringify(ouverture));

  // Le menu envoie menu:settings (canal déclaré dans le préchargement).
  h.win.webContents.send('menu:settings');
  await pause(200);
  const parMenu = await h.js(`!document.getElementById('reglages-modal').classList.contains('hidden')`);
  check('Réglages — le canal IPC menu:settings ouvre la modale', parMenu === true);
  await h.js(`window.mdr.reglagesUI.fermer(); true`);
  const sources = {
    main: fs.readFileSync(path.join(h.racine, 'menu.js'), 'utf8'),
    preload: fs.readFileSync(path.join(h.racine, 'preload.js'), 'utf8'),
  };
  check('Réglages — le menu (menu.js) déclare le menu « Réglages… » vers menu:settings',
    /Réglages…/.test(sources.main) && sources.main.includes("'menu:settings'") && raccourcisTable.accelerateur('reglages:ouvrir', 'win32') === 'CmdOrCtrl+,');
  check('Réglages — le préchargement déclare menu:settings', sources.preload.includes('menu:settings'));

  const champs = await h.jsonJs(`(() => {
    const ids = ['policeEditeur','tailleEditeur','retourLigne','numerosLigne','tabulation','barreOutils',
      'modeDefaut','policeApercu','tailleApercu','margeA4Haut','margeA4Cotes','margeA4Bas','theme',
      'pdfFormat','pdfPaysage','pdfMarge','pdfNumerosPage','pdfPageGarde','pdfFiligrane',
      'autosave','delaiAutosave','synchroDefilement','rouvrirOnglets'];
    return ids.filter((i) => !document.getElementById('reglage-' + i));
  })()`);
  check('Réglages — tous les réglages de la spec ont leur champ', champs.length === 0, JSON.stringify(champs));

  // Pour chaque réglage : applique à chaud, mémorise, s'applique après rechargement.
  const cas = [
    { cle: 'policeEditeur', val: 'Courier New', lire: `/Courier/.test(getComputedStyle(document.querySelector('#editor .cm-scroller')).fontFamily)` },
    { cle: 'tailleEditeur', val: 19, lire: `getComputedStyle(document.querySelector('#editor .cm-content')).fontSize === '19px'` },
    { cle: 'retourLigne', val: false, lire: `!document.querySelector('#editor .cm-content').classList.contains('cm-lineWrapping')` },
    { cle: 'numerosLigne', val: false, lire: `!document.querySelector('#editor .cm-lineNumbers')` },
    { cle: 'tabulation', val: 6, lire: `window.mdr.editeur().view.state.tabSize === 6` },
    { cle: 'barreOutils', val: false, lire: `document.body.classList.contains('sans-barre-outils')` },
    { cle: 'modeDefaut', val: 'a4-double', lire: `document.getElementById('mode-affichage').value === 'a4-double' && !!document.querySelector('#preview .a4-feuilles.double')`, attente: 600 },
    { cle: 'policeApercu', val: 'Georgia', lire: `/Georgia/.test(getComputedStyle(document.getElementById('preview')).fontFamily)` },
    { cle: 'tailleApercu', val: 21, lire: `getComputedStyle(document.getElementById('preview')).fontSize === '21px'` },
    { cle: 'margeA4Haut', val: 25, lire: `getComputedStyle(document.querySelector('#preview .a4-page')).paddingTop === (25 * 96 / 25.4) + 'px' || Math.abs(parseFloat(getComputedStyle(document.querySelector('#preview .a4-page')).paddingTop) - 25 * 96 / 25.4) < 0.5`, avant: `window.mdrSettings.set('modeDefaut', 'a4'); true`, attente: 600 },
    { cle: 'margeA4Cotes', val: 30, lire: `Math.abs(parseFloat(getComputedStyle(document.querySelector('#preview .a4-page')).paddingLeft) - 30 * 96 / 25.4) < 0.5`, avant: `window.mdrSettings.set('modeDefaut', 'a4'); true`, attente: 600 },
    { cle: 'margeA4Bas', val: 15, lire: `Math.abs(parseFloat(getComputedStyle(document.querySelector('#preview .a4-page')).paddingBottom) - 15 * 96 / 25.4) < 0.5`, avant: `window.mdrSettings.set('modeDefaut', 'a4'); true`, attente: 600 },
    { cle: 'theme', val: 'sombre', lire: `document.documentElement.getAttribute('data-theme') === 'dark'` },
    { cle: 'pdfFormat', val: 'Letter', lire: `(window.showPdfModal(), document.getElementById('pdf-page-size').value === 'Letter')`, apres: `window.hidePdfModal(); true` },
    { cle: 'pdfPaysage', val: 'true', stocke: true, lire: `(window.showPdfModal(), window.readPdfOptions().landscape === true)`, apres: `window.hidePdfModal(); true` },
    { cle: 'pdfMarge', val: 1.2, lire: `(window.showPdfModal(), window.readPdfOptions().margin === 1.2)`, apres: `window.hidePdfModal(); true` },
    { cle: 'pdfNumerosPage', val: false, lire: `(window.showPdfModal(), window.readPdfOptions().headerFooter === false)`, apres: `window.hidePdfModal(); true` },
    { cle: 'pdfPageGarde', val: true, lire: `(window.showPdfModal(), window.readPdfOptions().cover === true)`, apres: `window.hidePdfModal(); true` },
    { cle: 'pdfFiligrane', val: 'CONFIDENTIEL', lire: `(window.showPdfModal(), window.readPdfOptions().watermark === 'CONFIDENTIEL')`, apres: `window.hidePdfModal(); true` },
    { cle: 'autosave', val: true, lire: `document.getElementById('toggle-autosave').checked === true` },
    { cle: 'delaiAutosave', val: 5, lire: `window.delaiAutosaveMs() === 5000` },
    { cle: 'synchroDefilement', val: false, lire: `document.getElementById('toggle-sync').checked === false` },
  ];
  for (const c of cas) {
    await h.js(`localStorage.clear(); true`);
    await h.recharger();
    await h.js(REGLER);
    await h.js(`window.mdr.reglagesUI.ouvrir(); true`);
    if (c.avant) await h.js(c.avant);
    const valeurBrute = c.cle === 'pdfPaysage' ? 'true' : c.val;
    await h.js(`window.__regler(${JSON.stringify(c.cle)}, ${JSON.stringify(valeurBrute)})`);
    await pause(c.attente || 150);
    const chaud = await h.js(`(() => { try { return !!(${c.lire}); } catch (e) { return 'ERR ' + e.message; } })()`);
    if (c.apres) await h.js(c.apres);
    check(`Réglage ${c.cle} — s’applique à chaud`, chaud === true, String(chaud));
    const stocke = (await reglagesMemorises())[c.cle];
    const attendu = c.cle === 'pdfPaysage' ? true : c.val;
    check(`Réglage ${c.cle} — est mémorisé`, stocke === attendu, JSON.stringify(stocke));
    await h.recharger();
    if (c.avant) await h.js(c.avant);
    await pause(c.attente || 150);
    const rech = await h.js(`(() => { try { return !!(${c.lire}); } catch (e) { return 'ERR ' + e.message; } })()`);
    if (c.apres) await h.js(c.apres);
    check(`Réglage ${c.cle} — s’applique après rechargement`, rech === true, String(rech));
  }

  // Thème « système » : suit prefers-color-scheme, à chaud.
  await h.js(`localStorage.clear(); true`);
  await h.recharger();
  await h.js(REGLER);
  await h.js(`window.mdr.reglagesUI.ouvrir(); true`);
  nativeTheme.themeSource = 'dark';
  await h.js(`window.__regler('theme', 'systeme')`);
  await pause(300);
  const sysSombre = await h.js(`document.documentElement.getAttribute('data-theme')`);
  nativeTheme.themeSource = 'light';
  await pause(400);
  const sysClair = await h.js(`document.documentElement.getAttribute('data-theme')`);
  check('Thème système — suit le système sombre', sysSombre === 'dark', sysSombre);
  check('Thème système — suit le système clair à chaud', sysClair === 'light', sysClair);
  nativeTheme.themeSource = 'dark';
  await h.recharger();
  const sysApresRecharge = await h.js(`document.documentElement.getAttribute('data-theme')`);
  check('Thème système — s’applique après rechargement', sysApresRecharge === 'dark', sysApresRecharge);
  nativeTheme.themeSource = 'system';

  // Thème clair explicite.
  await h.js(`window.__regler = undefined; true`);
  await h.js(REGLER);
  await h.js(`window.mdr.reglagesUI.ouvrir(); window.__regler('theme', 'clair'); true`);
  await pause(150);
  check('Thème clair — s’applique à chaud', (await h.js(`document.documentElement.getAttribute('data-theme')`)) === 'light');

  // En-tête synchronisé avec les réglages, dans les deux sens.
  await h.js(`localStorage.clear(); true`);
  await h.recharger();
  const sync = await h.jsonJs(`(() => {
    const s = window.mdrSettings;
    const dec = (id, v) => { const el = document.getElementById(id); el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const sortie = {};
    dec('toggle-autosave', true); sortie.autosaveEntete = s.get('autosave');
    dec('toggle-sync', false); sortie.syncEntete = s.get('synchroDefilement');
    dec('toggle-editor', true); sortie.codeEntete = s.get('voletCode');
    s.set('autosave', false); sortie.autosaveReglage = document.getElementById('toggle-autosave').checked;
    s.set('synchroDefilement', true); sortie.syncReglage = document.getElementById('toggle-sync').checked;
    s.set('voletCode', false); sortie.codeReglage = document.getElementById('toggle-editor').checked;
    const m = document.getElementById('mode-affichage');
    m.value = 'continu'; m.dispatchEvent(new Event('change', { bubbles: true }));
    sortie.modeEntete = s.get('modeDefaut');
    s.set('modeDefaut', 'a4-double'); sortie.modeReglage = m.value;
    document.getElementById('btn-theme').click(); sortie.themeBtn1 = s.get('theme') + '/' + document.documentElement.getAttribute('data-theme');
    document.getElementById('btn-theme').click(); sortie.themeBtn2 = s.get('theme') + '/' + document.documentElement.getAttribute('data-theme');
    return sortie;
  })()`);
  check('En-tête — les cases Autosave/Sync/Code écrivent les réglages',
    sync.autosaveEntete === true && sync.syncEntete === false && sync.codeEntete === true, JSON.stringify(sync));
  check('En-tête — les réglages mettent à jour les cases',
    sync.autosaveReglage === false && sync.syncReglage === true && sync.codeReglage === false, JSON.stringify(sync));
  check('En-tête — le sélecteur de mode et le réglage restent synchronisés',
    sync.modeEntete === 'continu' && sync.modeReglage === 'a4-double', JSON.stringify(sync));
  check('En-tête — le bouton thème bascule le réglage',
    sync.themeBtn1 === 'sombre/dark' && sync.themeBtn2 === 'clair/light', JSON.stringify(sync));
  const champSync = await h.jsonJs(`(() => {
    window.mdr.reglagesUI.ouvrir();
    const s = window.mdrSettings;
    s.set('autosave', true);
    return { champ: document.getElementById('reglage-autosave').checked };
  })()`);
  check('En-tête — la modale ouverte suit un changement fait ailleurs', champSync.champ === true, JSON.stringify(champSync));
  await h.js(`window.mdr.reglagesUI.fermer(); true`);

  // Rouvrir les onglets au démarrage.
  await h.js(`localStorage.clear(); true`);
  await h.recharger();
  await h.js(`window.mdr.onglets.ouvrir({ path: ${JSON.stringify(fichierOuvert)}, content: '# Rouvert\\n\\nContenu mémorisé.\\n' }); true`);
  const memo = (await reglagesMemorises()).ongletsOuverts;
  check('Onglets — les chemins ouverts sont mémorisés', Array.isArray(memo) && memo.includes(fichierOuvert), JSON.stringify(memo));
  await h.recharger();
  const sans = await h.jsonJs(`window.mdr.onglets.liste().map((t) => t.path)`);
  check('Onglets — option désactivée : rien n’est rouvert', !sans.includes(fichierOuvert), JSON.stringify(sans));
  await h.js(`window.mdrSettings.set('rouvrirOnglets', true); window.mdr.onglets.ouvrir({ path: ${JSON.stringify(fichierOuvert)}, content: 'x' }); true`);
  await h.recharger();
  await pause(400);
  const avec = await h.jsonJs(`({ chemins: window.mdr.onglets.liste().map((t) => t.path), actif: window.mdr.onglets.actif()?.path, texte: window.mdr.editeur().getValue() })`);
  check('Onglets — option activée : le fichier est rouvert au lancement', avec.chemins.includes(fichierOuvert) && avec.actif === fichierOuvert, JSON.stringify(avec));
  check('Onglets — le contenu rouvert est celui du disque', avec.texte.includes('Contenu mémorisé'), JSON.stringify(avec));
  // Un fichier disparu est ignoré sans erreur ni onglet fantôme.
  fs.unlinkSync(fichierOuvert);
  await h.recharger();
  await pause(400);
  const disparu = await h.jsonJs(`window.mdr.onglets.liste().map((t) => t.path)`);
  check('Onglets — un fichier disparu n’est pas rouvert', !disparu.includes(fichierOuvert), JSON.stringify(disparu));

  // ── Tâche 3 : mise en forme et barre d'outils ─────────────────────────
  await h.js(`localStorage.clear(); true`);
  await h.recharger();
  await h.js(`(() => { const t = document.getElementById('toggle-editor'); if (!t.checked) { t.checked = true; t.dispatchEvent(new Event('change')); } return true; })()`);
  await h.js(`window.__fmt = (id, texte, a, b, via) => {
    const ed = window.mdr.editeur();
    ed.setValue(texte);
    ed.view.dispatch({ selection: { anchor: a, head: b } });
    if (via === 'commande') window.commands.run(id);
    else document.querySelector('#barre-format button[data-format="' + id + '"]').click();
    const s = ed.view.state.selection.main;
    return { texte: ed.getValue(), from: s.from, to: s.to };
  }; true`);
  const barre = await h.jsonJs(`(() => {
    const b = document.getElementById('barre-format');
    const boutons = Array.from(b.querySelectorAll('button[data-format]'));
    const cm = document.querySelector('#editor .cm-editor');
    return {
      ids: boutons.map((x) => x.dataset.format),
      titres: boutons.map((x) => x.title),
      libelles: boutons.map((x) => x.textContent.trim()),
      aria: boutons.every((x) => x.getAttribute('aria-label')),
      auDessus: b.getBoundingClientRect().bottom <= cm.getBoundingClientRect().top + 1,
      visible: getComputedStyle(b).display !== 'none',
      commandes: window.commands.all().map((c) => c.id).filter((i) => i.startsWith('format:')),
    };
  })()`);
  check('Barre — 15 boutons, un par action Format', barre.ids.length === 15 && new Set(barre.ids).size === 15, JSON.stringify(barre.ids));
  check('Barre — placée au-dessus de l’éditeur et visible', barre.auDessus && barre.visible, JSON.stringify(barre));
  check('Barre — infobulles françaises avec raccourci', barre.titres.every((t) => /\(.+\)$/.test(t)) && barre.titres[0].startsWith('Gras (') && barre.aria, JSON.stringify(barre.titres));
  check('Barre — l’infobulle du gras annonce le raccourci de la plateforme',
    barre.titres[0] === 'Gras (' + raccourcisTable.afficher('CmdOrCtrl+B', process.platform) + ')', barre.titres[0]);
  check('Palette — les 16 commandes format:* sont enregistrées', barre.commandes.length === 16 && barre.ids.every((i) => barre.commandes.includes(i)), JSON.stringify(barre.commandes));

  // Chaque bouton agit sur l'éditeur, puis bascule au second clic.
  const casFormat = [
    { id: 'format:gras', t: 'un mot ici', a: 3, b: 6, un: 'un **mot** ici', deux: 'un mot ici' },
    { id: 'format:italique', t: 'un mot ici', a: 3, b: 6, un: 'un *mot* ici', deux: 'un mot ici' },
    { id: 'format:barre', t: 'un mot ici', a: 3, b: 6, un: 'un ~~mot~~ ici', deux: 'un mot ici' },
    { id: 'format:titre1', t: 'Titre', a: 5, b: 5, un: '# Titre', deux: 'Titre' },
    { id: 'format:titre2', t: 'Titre', a: 5, b: 5, un: '## Titre', deux: 'Titre' },
    { id: 'format:titre3', t: 'Titre', a: 5, b: 5, un: '### Titre', deux: 'Titre' },
    { id: 'format:puces', t: 'a\nb', a: 0, b: 3, un: '- a\n- b', deux: 'a\nb' },
    { id: 'format:numerotee', t: 'a\nb', a: 0, b: 3, un: '1. a\n2. b', deux: 'a\nb' },
    { id: 'format:taches', t: 'a\nb', a: 0, b: 3, un: '- [ ] a\n- [ ] b', deux: 'a\nb' },
    { id: 'format:citation', t: 'a\nb', a: 0, b: 3, un: '> a\n> b', deux: 'a\nb' },
    { id: 'format:lien', t: 'voir ceci', a: 5, b: 9, un: 'voir [ceci](https://)', sel2: [5, 21], deux: 'voir ceci' },
    { id: 'format:image', t: 'logo', a: 0, b: 4, un: '![logo](images/image.png)' },
    { id: 'format:code', t: 'let a = 1;', a: 0, b: 10, un: '```\nlet a = 1;\n```', sel2: [0, 18], deux: 'let a = 1;' },
    { id: 'format:saut-page', t: 'a\nb', a: 1, b: 1, un: 'a\n\n<!-- pagebreak -->\n\nb', deux: 'a\n\nb' },
  ];
  for (const c of casFormat) {
    const r1 = await h.jsonJs(`window.__fmt(${JSON.stringify(c.id)}, ${JSON.stringify(c.t)}, ${c.a}, ${c.b})`);
    check(`Barre ${c.id} — le bouton agit sur l’éditeur`, r1.texte === c.un, JSON.stringify(r1));
    if (c.deux !== undefined) {
      if (c.sel2) await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: ${c.sel2[0]}, head: ${c.sel2[1]} } }); true`);
      await h.js(`document.querySelector('#barre-format button[data-format=${JSON.stringify(c.id)}]').click(); true`);
      const t2 = await h.js(`window.mdr.editeur().getValue()`);
      check(`Barre ${c.id} — un second clic retire la mise en forme`, t2 === c.deux, JSON.stringify(t2));
    }
  }
  const tab = await h.jsonJs(`window.__fmt('format:tableau', 'avant', 5, 5)`);
  check('Barre format:tableau — insère un gabarit 3 colonnes', /\| Colonne 1 \| Colonne 2 \| Colonne 3 \|\n\| --- \| --- \| --- \|/.test(tab.texte) && tab.texte.startsWith('avant\n\n'), JSON.stringify(tab));
  const viaCmd = await h.jsonJs(`window.__fmt('format:gras', 'un mot', 3, 6, 'commande')`);
  check('Palette — la commande format:gras agit comme le bouton', viaCmd.texte === 'un **mot**', JSON.stringify(viaCmd));
  const sel = await h.jsonJs(`window.__fmt('format:gras', 'un mot', 3, 6)`);
  check('Barre — la sélection suit le texte mis en forme', sel.from === 5 && sel.to === 8, JSON.stringify(sel));
  const focus = await h.js(`document.getElementById('editor').contains(document.activeElement)`);
  check('Barre — le focus reste dans l’éditeur après un clic', focus === true);

  // Touches CodeMirror : Mod-b, Mod-i (prioritaire sur « sélectionner le parent »), Mod-Enter, Mod-Alt-2.
  const touche = (key, extra = '') => `(() => {
    const ed = window.mdr.editeur();
    ed.view.focus();
    const cible = document.querySelector('#editor .cm-content');
    const mac = window.api.platform === 'darwin';
    cible.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(key)}, bubbles: true, cancelable: true, metaKey: mac, ctrlKey: !mac }, ${extra || '{}'})));
    return ed.getValue();
  })()`;
  await h.js(`window.mdr.editeur().setValue('un mot'); window.mdr.editeur().view.dispatch({ selection: { anchor: 3, head: 6 } }); true`);
  check('Clavier — Mod+B met en gras', (await h.js(touche('b'))) === 'un **mot**');
  await h.js(`window.mdr.editeur().setValue('un mot'); window.mdr.editeur().view.dispatch({ selection: { anchor: 3, head: 6 } }); true`);
  check('Clavier — Mod+I met en italique (sans doublon avec l’ancien raccourci)', (await h.js(touche('i'))) === 'un *mot*');
  await h.js(`window.mdr.editeur().setValue('Titre'); window.mdr.editeur().view.dispatch({ selection: { anchor: 5 } }); true`);
  check('Clavier — Mod+Alt+2 donne un titre 2', (await h.js(touche('2', '{ altKey: true }'))) === '## Titre');
  await h.js(`window.mdr.editeur().setValue('a'); window.mdr.editeur().view.dispatch({ selection: { anchor: 1 } }); true`);
  check('Clavier — Mod+Entrée insère un saut de page', /<!-- pagebreak -->/.test(await h.js(touche('Enter'))));
  await h.js(`window.mdr.editeur().setValue('un mot'); window.mdr.editeur().view.dispatch({ selection: { anchor: 3, head: 6 } }); true`);
  check('Clavier — Mod+U (souligné) reste fonctionnel', (await h.js(touche('u'))) === 'un <u>mot</u>');

  // Visibilité de la barre : réglage, menu Affichage, classe du corps.
  await h.js(`window.__regler = undefined; true`);
  await h.js(REGLER);
  await h.js(`window.mdr.reglagesUI.ouvrir(); window.__regler('barreOutils', false); window.mdr.reglagesUI.fermer(); true`);
  await pause(100);
  const masquee = await h.jsonJs(`({ classe: document.body.classList.contains('sans-barre-outils'), display: getComputedStyle(document.getElementById('barre-format')).display })`);
  check('Barre — le réglage barreOutils la masque', masquee.classe && masquee.display === 'none', JSON.stringify(masquee));
  h.win.webContents.send('menu:commande', 'vue:barre-outils');
  await pause(150);
  const reaffichee = await h.jsonJs(`({ classe: document.body.classList.contains('sans-barre-outils'), display: getComputedStyle(document.getElementById('barre-format')).display, reglage: window.mdrSettings.get('barreOutils') })`);
  check('Barre — Affichage > Barre d’outils la réaffiche (et mémorise)', !reaffichee.classe && reaffichee.display !== 'none' && reaffichee.reglage === true, JSON.stringify(reaffichee));
  h.win.webContents.send('menu:commande', 'vue:barre-outils');
  await pause(150);
  check('Barre — le même menu la masque à nouveau', await h.js(`getComputedStyle(document.getElementById('barre-format')).display === 'none'`));
  h.win.webContents.send('menu:commande', 'vue:barre-outils');
  await pause(100);
  await h.js(`document.getElementById('toggle-editor').checked = false; document.getElementById('toggle-editor').dispatchEvent(new Event('change')); true`);
  check('Barre — masquée avec le volet code', await h.js(`getComputedStyle(document.getElementById('barre-format')).offsetParent === null || document.getElementById('barre-format').offsetParent === null`));
  await h.js(`document.getElementById('toggle-editor').checked = true; document.getElementById('toggle-editor').dispatchEvent(new Event('change')); true`);

  // ── Tâche 4 : menus ───────────────────────────────────────────────────
  // Le vrai gabarit, branché sur la fenêtre de test : le gabarit est valide
  // pour Electron, et chaque entrée envoie le canal attendu au renderer.
  const envoyes = [];
  const template = creerTemplate({
    plateforme: process.platform, nomApp: 'MD Reader', recents: ['/tmp/un.md', '/tmp/deux.md'],
    envoyer: (c, ...a) => { envoyes.push([c, ...a]); h.win.webContents.send(c, ...a); },
    ouvrirRecent: () => {}, effacerRecents: () => {},
  });
  let menuValide = true;
  try { Menu.buildFromTemplate(template); } catch (e) { menuValide = e.message; }
  check('Menu — le gabarit complet est accepté par Menu.buildFromTemplate', menuValide === true, String(menuValide));
  const aplatir = (items) => items.flatMap((i) => [i, ...(i.submenu ? aplatir(i.submenu) : [])]);
  const trouver = (libelle) => aplatir(template).find((i) => i.label === libelle);

  // Canaux de menu côté renderer : on envoie menu:* et on vérifie l'effet.
  const effet = async (libelle, lire, attendu, nomCheck) => {
    const item = trouver(libelle);
    if (!item || typeof item.click !== 'function') { check(nomCheck, false, 'entrée introuvable : ' + libelle); return; }
    item.click();
    await pause(250);
    const v = await h.js(lire);
    check(nomCheck, JSON.stringify(v) === JSON.stringify(attendu), JSON.stringify(v));
  };
  await h.js(`window.mdrSettings.set('modeDefaut', 'a4'); true`);
  await effet('Continu', `document.getElementById('mode-affichage').value`, 'continu', 'Menu Affichage > Continu change le mode');
  await effet('A4 · 2 pages', `document.getElementById('mode-affichage').value`, 'a4-double', 'Menu Affichage > A4 · 2 pages change le mode');
  await effet('A4 · 1 page', `document.getElementById('mode-affichage').value`, 'a4', 'Menu Affichage > A4 · 1 page change le mode');
  await effet('Sombre', `document.documentElement.getAttribute('data-theme')`, 'dark', 'Menu Affichage > Thème sombre');
  await effet('Clair', `document.documentElement.getAttribute('data-theme')`, 'light', 'Menu Affichage > Thème clair');
  nativeTheme.themeSource = 'dark';
  await effet('Système', `window.mdrSettings.get('theme') + '/' + document.documentElement.getAttribute('data-theme')`, 'systeme/dark', 'Menu Affichage > Thème système suit le système');
  nativeTheme.themeSource = 'system';
  await h.js(`window.mdrSettings.set('theme', 'clair'); true`);
  const panneauAvant = await h.js(`document.querySelector('main').classList.contains('no-sidebar')`);
  await effet('Afficher/masquer le panneau latéral', `document.querySelector('main').classList.contains('no-sidebar')`, !panneauAvant, 'Menu Affichage > panneau latéral bascule');
  await h.js(`window.mdrSettings.set('panneauLateral', true); true`);
  await effet('Éditeur seul', `(() => { const m = document.querySelector('main'); return [m.classList.contains('no-editor'), m.classList.contains('no-preview'), getComputedStyle(document.getElementById('preview')).display === 'none']; })()`, [false, true, true], 'Menu Affichage > Éditeur seul masque l’aperçu');
  await effet('Aperçu seul', `(() => { const m = document.querySelector('main'); return [m.classList.contains('no-editor'), m.classList.contains('no-preview'), getComputedStyle(document.getElementById('editor')).display === 'none']; })()`, [true, false, true], 'Menu Affichage > Aperçu seul masque l’éditeur');
  await effet('Éditeur et aperçu', `(() => { const m = document.querySelector('main'); return [m.classList.contains('no-editor'), m.classList.contains('no-preview')]; })()`, [false, false], 'Menu Affichage > Éditeur et aperçu montre les deux');
  await effet('Mode focus', `document.body.classList.contains('focus')`, true, 'Menu Affichage > Mode focus');
  await h.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await effet('Barre d’outils de mise en forme', `document.body.classList.contains('sans-barre-outils')`, true, 'Menu Affichage > Barre d’outils (entrée du menu)');
  await h.js(`window.mdrSettings.set('barreOutils', true); true`);
  await effet('Gras', `(() => { const ed = window.mdr.editeur(); ed.setValue('un mot'); ed.view.dispatch({ selection: { anchor: 3, head: 6 } }); return null; })()`, null, 'Préparation du menu Format');
  const gras = trouver('Gras');
  gras.click();
  await pause(150);
  check('Menu Format > Gras (canal menu:commande) agit sur l’éditeur', (await h.js(`window.mdr.editeur().getValue()`)) === 'un **mot**');
  check('Menu — Format > Gras a envoyé menu:commande format:gras', envoyes.some((e) => e[0] === 'menu:commande' && e[1] === 'format:gras'));
  for (const c of casFormat.filter((x) => x.deux !== undefined || x.id === 'format:image')) {
    const id = c.id;
    const libelle = raccourcisTable.parId(id).libelle;
    const item = trouver(libelle);
    await h.js(`(() => { const ed = window.mdr.editeur(); ed.setValue(${JSON.stringify(c.t)}); ed.view.dispatch({ selection: { anchor: ${c.a}, head: ${c.b} } }); return true; })()`);
    item.click();
    await pause(120);
    const t = await h.js(`window.mdr.editeur().getValue()`);
    check(`Menu Format > ${libelle} agit sur l’éditeur`, t === c.un, JSON.stringify(t));
  }

  // Fichier > Dupliquer : copie dans un nouvel onglet non enregistré.
  await h.js(`window.mdr.onglets.ouvrir({ path: '/tmp/original.md', content: '# Original\\n\\ntexte' }); true`);
  const avantDup = await h.js(`window.mdr.onglets.liste().length`);
  trouver('Dupliquer').click();
  await pause(250);
  const dup = await h.jsonJs(`({
    n: window.mdr.onglets.liste().length,
    actif: window.mdr.onglets.actif().path,
    dirty: window.mdr.onglets.actif().dirty,
    nom: document.querySelector('#tabs .tab.active span:not(.dot):not(.close)').textContent,
    texte: window.mdr.editeur().getValue(),
    fichier: document.getElementById('file-name').textContent,
  })`);
  check('Fichier > Dupliquer — ouvre un nouvel onglet', dup.n === avantDup + 1, JSON.stringify(dup));
  check('Fichier > Dupliquer — onglet non enregistré « Copie de … »', dup.actif === null && dup.dirty === true && dup.nom === 'Copie de original.md' && dup.fichier === 'Copie de original.md', JSON.stringify(dup));
  check('Fichier > Dupliquer — le contenu est copié', dup.texte === '# Original\n\ntexte', JSON.stringify(dup));

  // Fichier > Enregistrer sous… : boîte de dialogue même pour un fichier existant.
  const enregistrements = [];
  h.stub('file:save', (_e, payload) => { enregistrements.push(payload); return payload.filePath || '/tmp/choisi.md'; });
  await h.js(`window.mdr.onglets.ouvrir({ path: '/tmp/original.md', content: '# Original' }); true`);
  trouver('Enregistrer sous…').click();
  await pause(250);
  check('Fichier > Enregistrer sous — demande le dialogue (aucun chemin imposé)', enregistrements.length === 1 && enregistrements[0].filePath === null && enregistrements[0].defaultPath === 'original.md', JSON.stringify(enregistrements));
  check('Fichier > Enregistrer sous — l’onglet prend le chemin choisi', (await h.js(`window.mdr.onglets.actif().path`)) === '/tmp/choisi.md');
  h.win.webContents.send('menu:save');
  await pause(200);
  check('Fichier > Enregistrer — réutilise le chemin choisi', enregistrements[1] && enregistrements[1].filePath === '/tmp/choisi.md', JSON.stringify(enregistrements));

  // Ouvrir récent : le renderer signale chaque ouverture au processus principal.
  const notes = [];
  h.stub('recent:add', (_e, p) => { notes.push(p); return null; });
  await h.js(`window.mdr.onglets.ouvrir({ path: '/tmp/recent-a.md', content: 'a' }); true`);
  check('Ouvrir récent — l’ouverture d’un document est signalée au menu', notes.includes('/tmp/recent-a.md'), JSON.stringify(notes));
  const recent = trouver('Ouvrir récent');
  check('Ouvrir récent — le sous-menu liste les documents et « Effacer la liste »',
    recent.submenu.filter((i) => i.label).length === 3 && recent.submenu.some((i) => i.label === 'Effacer la liste'));

  // Aide : chaque modale s'ouvre par son entrée de menu, se ferme, et a son contenu.
  const modale = () => h.jsonJs(`(() => { const m = document.getElementById('aide-modal'); return m ? { aide: m.dataset.aide, titre: m.querySelector('h3').textContent, texte: m.textContent, visible: getComputedStyle(m).display !== 'none' } : null; })()`);
  trouver('Aide-mémoire Markdown').click();
  await pause(200);
  const memoAide = await modale();
  check('Aide > Aide-mémoire Markdown — la modale s’ouvre avec la syntaxe', memoAide && memoAide.aide === 'memo' && memoAide.visible && /\*\*gras\*\*/.test(memoAide.texte) && /pagebreak/.test(memoAide.texte) && /\| A \| B \|/.test(memoAide.texte), JSON.stringify(memoAide));
  await h.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  check('Aide — Échap ferme la modale', (await modale()) === null);
  trouver('Raccourcis clavier').click();
  await pause(200);
  const rac = await modale();
  const attendus = raccourcisTable.TABLE.map((r) => raccourcisTable.afficher(process.platform === 'darwin' && r.accelMac ? r.accelMac : r.accel, process.platform));
  check('Aide > Raccourcis clavier — la modale liste toute la table partagée', rac && rac.aide === 'raccourcis' && attendus.every((a) => rac.texte.includes(a)) && raccourcisTable.TABLE.every((r) => rac.texte.includes(r.libelle)), JSON.stringify(rac && rac.texte.slice(0, 200)));
  await h.js(`document.getElementById('aide-fermer').click(); true`);
  check('Aide — le bouton Fermer ferme la modale', (await modale()) === null);
  // Le harnais n'exécute pas main.js : le canal de version est simulé avec la version du paquet.
  const version = require('../package.json').version;
  h.stub('app:version', () => version);
  trouver('À propos de MD Reader').click();
  await pause(300);
  const apropos = await modale();
  check('Aide > À propos — nom, version (via IPC), licence MIT et dépôt', apropos && apropos.aide === 'apropos' && /MD Reader/.test(apropos.texte) && apropos.texte.includes(version) && /MIT/.test(apropos.texte) && /github\.com\/vantaflow/.test(apropos.texte), JSON.stringify(apropos));
  const lienDepot = await h.js(`!!document.getElementById('apropos-depot')`);
  check('Aide > À propos — le lien du dépôt est cliquable', lienDepot === true);
  await h.js(`window.mdr.aideUI.fermer(); true`);
  await h.js(`window.commands.run('aide:memo'); true`);
  check('Aide — les commandes aide:* sont dans la palette', (await h.js(`window.mdr.aideUI.ouverte()`)) === 'memo');
  await h.js(`window.mdr.aideUI.fermer(); true`);

  h.terminer();
})().catch(h.erreurFatale);

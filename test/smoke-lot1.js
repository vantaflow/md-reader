// Lot 1 (1.8.0) — fondations et réglages : tests Electron de bout en bout.
// Même modèle que smoke.js, via le harnais partagé test/helpers.js.
const { nativeTheme } = require('electron');
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
    main: fs.readFileSync(path.join(h.racine, 'main.js'), 'utf8'),
    preload: fs.readFileSync(path.join(h.racine, 'preload.js'), 'utf8'),
  };
  check('Réglages — main.js déclare le menu « Réglages… » vers menu:settings',
    /Réglages…[^\n]*CmdOrCtrl\+,|CmdOrCtrl\+,[^\n]*menu:settings/.test(sources.main) && sources.main.includes("'menu:settings'"));
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

  h.terminer();
})().catch(h.erreurFatale);

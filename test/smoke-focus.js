// Tâche 6 — modes « Aperçu seul plein écran » et « Éditeur seul sans
// distraction » : classes, éléments masqués, mise en page, Échap et priorité
// des couches (palette, modales), plein écran natif (canal IPC stubé).
const { creerHarnais } = require('./helpers.js');

const h = creerHarnais();
const { check } = h;
const echap = `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`;
const affiche = (sel) => `getComputedStyle(document.querySelector('${sel}')).display !== 'none'`;

(async () => {
  const pleinEcran = [];
  await h.demarrer({ stubs: { 'fenetre:plein-ecran': (_e, actif) => { pleinEcran.push(actif); return true; } } });
  h.win.setSize(1400, 900);
  await h.attendre(300);
  await h.js(`window.mdr.editeur().setValue('# Titre\\n\\nUn paragraphe.\\n'); true`);
  await h.attendre(400);

  const etat = () => h.jsonJs(`({ apercu: document.body.classList.contains('focus-apercu'), editeur: document.body.classList.contains('focus-editeur'), focus: document.body.classList.contains('focus'), actif: window.mdr.modes.actif() })`);

  // ── Enregistrement ──
  const ids = await h.jsonJs(`window.commands.all().map((c) => c.id)`);
  check('Modes — commandes vue:focus-apercu, vue:focus-editeur et vue:focus dans la palette', ['vue:focus-apercu', 'vue:focus-editeur', 'vue:focus'].every((i) => ids.includes(i)));
  const titres = await h.jsonJs(`window.commands.filtrer('plein écran').concat(window.commands.filtrer('sans distraction')).map((c) => c.titre)`);
  check('Modes — retrouvables dans la palette par leur titre', titres.some((t) => /Aperçu seul/.test(t)) && titres.some((t) => /sans distraction/.test(t)), JSON.stringify(titres));

  // ── Aperçu seul plein écran ──
  await h.js(`window.commands.run('vue:focus-apercu'); true`);
  await h.attendre(250);
  check('Aperçu plein écran — la classe body.focus-apercu est posée (et pas les autres)', JSON.stringify(await etat()) === JSON.stringify({ apercu: true, editeur: false, focus: false, actif: 'apercu' }), JSON.stringify(await etat()));
  const vis = await h.jsonJs(`Object.fromEntries(['header', '#tabs', '#sidebar', '#editor', '#statusbar', '#preview'].map((s) => [s, getComputedStyle(document.querySelector(s)).display !== 'none']))`);
  check('Aperçu plein écran — en-tête, onglets, panneau, éditeur et barre d’état masqués', !vis.header && !vis['#tabs'] && !vis['#sidebar'] && !vis['#editor'] && !vis['#statusbar'], JSON.stringify(vis));
  check('Aperçu plein écran — l’aperçu est affiché', vis['#preview'] === true);
  const geo = await h.jsonJs(`(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { l: r.left, w: r.width, h: r.height, iw: window.innerWidth, ih: window.innerHeight }; })()`);
  check('Aperçu plein écran — l’aperçu occupe toute la fenêtre', Math.abs(geo.l) < 1 && Math.abs(geo.w - geo.iw) < 2 && Math.abs(geo.h - geo.ih) < 2, JSON.stringify(geo));
  check('Aperçu plein écran — le plein écran natif est demandé (canal fenetre:plein-ecran)', JSON.stringify(pleinEcran) === '[true]', JSON.stringify(pleinEcran));
  await h.js(echap);
  check('Aperçu plein écran — Échap en sort et rend l’habillage', (await etat()).actif === null && (await h.js(affiche('header'))) && (await h.js(affiche('#statusbar'))));
  check('Aperçu plein écran — la sortie quitte le plein écran natif', JSON.stringify(pleinEcran) === '[true,false]', JSON.stringify(pleinEcran));

  // Aperçu plein écran même si la disposition masquait l'aperçu (éditeur seul).
  await h.js(`window.commands.run('vue:editeur-seul'); true`);
  await h.attendre(150);
  await h.js(`window.commands.run('vue:focus-apercu'); true`);
  await h.attendre(150);
  check('Aperçu plein écran — s’affiche même depuis la disposition « éditeur seul »', await h.js(affiche('#preview')));
  await h.js(echap);
  await h.js(`window.commands.run('vue:deux'); true`);
  await h.attendre(100);

  // Basculer deux fois la même commande = sortir.
  await h.js(`window.commands.run('vue:focus-apercu'); window.commands.run('vue:focus-apercu'); true`);
  check('Aperçu plein écran — relancer la commande en sort', (await etat()).actif === null);

  // ── Éditeur seul sans distraction ──
  const appelsAvant = pleinEcran.length;
  await h.js(`window.commands.run('vue:focus-editeur'); true`);
  await h.attendre(250);
  check('Éditeur sans distraction — la classe body.focus-editeur est posée', JSON.stringify(await etat()) === JSON.stringify({ apercu: false, editeur: true, focus: false, actif: 'editeur' }), JSON.stringify(await etat()));
  const vis2 = await h.jsonJs(`Object.fromEntries(['header', '#tabs', '#sidebar', '#preview', '#statusbar', '#barre-format', '#editor'].map((s) => [s, getComputedStyle(document.querySelector(s)).display !== 'none']))`);
  check('Éditeur sans distraction — en-tête, onglets, panneau, aperçu, barre d’outils et pied masqués', !vis2.header && !vis2['#tabs'] && !vis2['#sidebar'] && !vis2['#preview'] && !vis2['#statusbar'] && !vis2['#barre-format'], JSON.stringify(vis2));
  check('Éditeur sans distraction — l’éditeur est affiché', vis2['#editor'] === true);
  const geo2 = await h.jsonJs(`(() => { const r = document.getElementById('editor').getBoundingClientRect(); return { l: r.left, r: window.innerWidth - r.right, w: r.width, iw: window.innerWidth, h: r.height, ih: window.innerHeight }; })()`);
  check('Éditeur sans distraction — éditeur centré (marges égales) et largeur de lecture bornée', Math.abs(geo2.l - geo2.r) < 2 && geo2.l > 20 && geo2.w <= 52 * 16 + 1, JSON.stringify(geo2));
  check('Éditeur sans distraction — l’éditeur occupe toute la hauteur', Math.abs(geo2.h - geo2.ih) < 2, JSON.stringify(geo2));
  check('Éditeur sans distraction — le plein écran natif n’est pas demandé', pleinEcran.length === appelsAvant, JSON.stringify(pleinEcran));
  check('Éditeur sans distraction — le focus clavier est dans l’éditeur', await h.js(`document.activeElement.closest('#editor') !== null`));
  await h.js(echap);
  check('Éditeur sans distraction — Échap en sort', (await etat()).actif === null && await h.js(affiche('#preview')));

  // Même quand le volet code est masqué.
  await h.js(`window.commands.run('vue:apercu-seul'); true`);
  await h.attendre(150);
  await h.js(`window.commands.run('vue:focus-editeur'); true`);
  await h.attendre(150);
  check('Éditeur sans distraction — s’affiche même depuis la disposition « aperçu seul »', await h.js(affiche('#editor')));
  await h.js(echap);
  await h.js(`window.commands.run('vue:deux'); true`);
  await h.attendre(100);

  // ── Passer d'un mode à l'autre ──
  await h.js(`window.commands.run('vue:focus-apercu'); window.commands.run('vue:focus-editeur'); true`);
  const passage = await etat();
  check('Modes — passer d’un mode à l’autre : un seul actif', passage.editeur && !passage.apercu, JSON.stringify(passage));
  check('Modes — quitter l’aperçu en passant à l’éditeur libère le plein écran', JSON.stringify(pleinEcran) === '[true,false,true,false]' || pleinEcran[pleinEcran.length - 1] === false, JSON.stringify(pleinEcran));
  await h.js(echap);

  // ── Priorité des couches : palette ──
  await h.js(`window.commands.run('vue:focus-editeur'); window.palette.ouvrir(); true`);
  await h.attendre(150);
  await h.js(`document.getElementById('palette-requete').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  const apresPalette = await h.jsonJs(`({ palette: !document.getElementById('palette').classList.contains('hidden'), mode: window.mdr.modes.actif() })`);
  check('Couches — Échap dans la palette ferme la palette sans quitter le mode', !apresPalette.palette && apresPalette.mode === 'editeur', JSON.stringify(apresPalette));
  await h.js(echap);
  check('Couches — l’Échap suivant quitte le mode', (await etat()).actif === null);

  // Palette ouverte sans le focus sur son champ : le mode ne doit pas être quitté.
  await h.js(`window.commands.run('vue:focus-editeur'); window.palette.ouvrir(); document.getElementById('palette-requete').blur(); true`);
  await h.js(echap);
  check('Couches — palette ouverte : Échap ne quitte pas le mode', (await etat()).actif === 'editeur');
  await h.js(`window.palette.fermer(); true`);
  await h.js(echap);

  // ── Priorité des couches : modale PDF ──
  await h.js(`window.commands.run('vue:focus-apercu'); window.commands.run('export:pdf'); true`);
  await h.attendre(150);
  await h.js(echap);
  const apresPdf = await h.jsonJs(`({ modale: !document.getElementById('pdf-modal').classList.contains('hidden'), mode: window.mdr.modes.actif() })`);
  check('Couches — Échap ferme la modale PDF avant de quitter le mode', !apresPdf.modale && apresPdf.mode === 'apercu', JSON.stringify(apresPdf));
  await h.js(echap);
  check('Couches — l’Échap suivant quitte le mode (et le plein écran)', (await etat()).actif === null && pleinEcran[pleinEcran.length - 1] === false);

  // ── Priorité des couches : réglages ──
  await h.js(`window.commands.run('vue:focus-editeur'); window.mdr.reglagesUI.ouvrir(); true`);
  await h.attendre(150);
  await h.js(echap);
  const apresReg = await h.jsonJs(`({ ouvert: window.mdr.reglagesUI.estOuvert(), mode: window.mdr.modes.actif() })`);
  check('Couches — Échap ferme les réglages avant de quitter le mode', !apresReg.ouvert && apresReg.mode === 'editeur', JSON.stringify(apresReg));
  await h.js(echap);

  // ── Le mode focus existant reste intact ──
  await h.js(`window.commands.run('vue:focus'); true`);
  const f = await etat();
  check('Mode focus historique — toujours là (body.focus), distinct des deux nouveaux', f.focus && !f.apercu && !f.editeur && f.actif === 'focus', JSON.stringify(f));
  await h.js(echap);
  check('Mode focus historique — Échap en sort toujours', (await etat()).actif === null);

  // ── Non mémorisés ──
  await h.js(`window.commands.run('vue:focus-editeur'); true`);
  await h.recharger();
  check('Modes — non mémorisés : après rechargement, aucun mode actif', (await etat()).actif === null);

  h.terminer();
})().catch(h.erreurFatale);

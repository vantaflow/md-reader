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

  await h.demarrer({
    stubs: {
      'folder:open': () => ({ root: racine, tree: [] }),
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

  fs.rmSync(racine, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

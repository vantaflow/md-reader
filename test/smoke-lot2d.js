// Lot 2 (1.9.0), confort — tâches 17 à 19 : tests Electron de bout en bout.
// Même modèle que smoke-lot2c.js : harnais partagé, fenêtre cachée, dialogues
// et réseau simulés. Les canaux IPC sont simulés avec les VRAIES fonctions des
// modules racine (historique.js, miseajour.js) que main.js utilise.
//
// Ce que ce script NE peut PAS vérifier : l'appel réel à l'API GitHub (le
// `fetch` est simulé), l'ouverture réelle du navigateur (shell.openExternal est
// simulé) et l'installation d'une mise à jour.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { creerHarnais } = require('./helpers.js');
const historique = require('../historique.js');

const h = creerHarnais();
const { check } = h;
const pause = (ms) => h.attendre(ms);
const commande = (id) => h.js(`window.commands.run(${JSON.stringify(id)})`);
const poserDoc = (texte) => h.js(`(() => { window.mdr.editeur().setValue(${JSON.stringify(texte)}); return true; })()`);

(async () => {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-lot2d-'));
  const racineDonnees = () => h.dossierDonnees;
  const plein = [];
  await h.demarrer({
    stubs: {
      'fenetre:plein-ecran': (_e, actif) => { plein.push(!!actif); return true; },
      'file:save': async (_e, { filePath, content }) => { fs.writeFileSync(filePath, content); return filePath; },
      'historique:ajouter': async (_e, c) => { try { return await historique.ajouter(racineDonnees(), c.chemin, c.contenu); } catch (e) { return { ajoute: false, erreur: e.message }; } },
      'historique:lister': async (_e, chemin) => { try { return { versions: await historique.lister(racineDonnees(), chemin) }; } catch (e) { return { versions: [], erreur: e.message }; } },
      'historique:lire': async (_e, c) => { try { return { contenu: await historique.lire(racineDonnees(), c.chemin, c.id) }; } catch (e) { return { erreur: e.message }; } },
    },
  });

  // ─── Tâche 17 : historique des versions ────────────────────────────────────
  const doc = path.join(dossierTmp, 'histoire.md');
  fs.writeFileSync(doc, 'Version un\n');
  await h.js(`window.mdr.onglets.ouvrir({ path: ${JSON.stringify(doc)}, content: 'Version un\\n' }); true`);
  await pause(300);

  // Document sans chemin : message, pas de modale.
  await h.js(`window.mdr.onglets.nouveau(); true`);
  await commande('fichier:historique');
  await pause(200);
  check('Historique — document non enregistré : message, aucune modale', !(await h.js(`!!document.getElementById('historique-modale')`)) && /Enregistrez/.test(await h.js(`document.getElementById('lot-notification').textContent`)));
  await h.js(`window.mdr.onglets.activer(window.mdr.onglets.liste().find((t) => t.path === ${JSON.stringify(doc)})); true`);
  await pause(200);

  // Fichier enregistré mais jamais versionné : message.
  await commande('fichier:historique');
  await pause(200);
  check('Historique — aucune version : message, aucune modale', !(await h.js(`!!document.getElementById('historique-modale')`)) && /Aucune version/.test(await h.js(`document.getElementById('lot-notification').textContent`)));

  for (const v of ['Version deux\nligne commune\n', 'Version trois\nligne commune\nfin\n']) {
    await poserDoc(v);
    await h.js(`window.mdr.onglets.enregistrer()`);
    await pause(150);
  }
  await h.js(`window.mdr.onglets.enregistrer()`); // identique : pas de doublon
  await pause(150);
  const versions = await historique.lister(racineDonnees(), doc);
  check('Historique — un instantané par enregistrement, sans doublon', versions.length === 2, JSON.stringify(versions));
  check('Historique — instantanés dans userData/historique/<hash>/', versions.length && fs.existsSync(path.join(historique.dossierDe(racineDonnees(), doc), versions[0].id + '.md')));

  await poserDoc('Version quatre non enregistrée\n');
  await commande('fichier:historique');
  await pause(500);
  check('Historique — la modale s’ouvre avec la liste des versions', (await h.js(`document.querySelectorAll('#historique-modale .histo-item').length`)) === 2);
  check('Historique — comparaison par défaut avec lignes ajoutées et supprimées colorées', await h.js(`!!document.querySelector('#histo-zone .diff-ajout') && !!document.querySelector('#histo-zone .diff-suppr')`));
  await h.js(`document.getElementById('histo-mode-apercu').click(); true`);
  check('Historique — aperçu : contenu de la version choisie', (await h.js(`document.querySelector('#histo-zone .histo-texte').textContent`)).startsWith('Version trois'));
  await h.js(`document.querySelectorAll('#historique-modale .histo-item')[1].click(); true`);
  await pause(300);
  check('Historique — choisir une autre version affiche son contenu', (await h.js(`document.querySelector('#histo-zone .histo-texte').textContent`)).startsWith('Version deux'));

  await h.js(`document.getElementById('histo-restaurer').click(); true`);
  await pause(300);
  check('Historique — Restaurer remplace le contenu de l’éditeur', (await h.js(`window.mdr.editeur().getValue()`)) === 'Version deux\nligne commune\n');
  check('Historique — la modale est fermée après la restauration', !(await h.js(`!!document.getElementById('historique-modale')`)));
  const apres = await historique.lister(racineDonnees(), doc);
  const contenus = await Promise.all(apres.map((v) => historique.lire(racineDonnees(), doc, v.id)));
  check('Historique — l’état courant (non enregistré) a été sauvegardé avant la restauration', contenus.includes('Version quatre non enregistrée\n'), JSON.stringify(contenus));
  await h.js(`window.mdr.editeur().annuler(); true`);
  await pause(150);
  check('Historique — la restauration s’annule en une seule fois', (await h.js(`window.mdr.editeur().getValue()`)) === 'Version quatre non enregistrée\n');

  // IPC bornée : valeurs invalides refusées.
  const refus = JSON.parse(await h.js(`Promise.all([
    window.api.historiqueAjouter({ chemin: '/etc/passwd', contenu: 'x' }),
    window.api.historiqueAjouter({ chemin: ${JSON.stringify(doc)}, contenu: 42 }),
    window.api.historiqueLire({ chemin: ${JSON.stringify(doc)}, id: '../../x' }),
  ]).then(JSON.stringify)`));
  check('Historique — IPC : chemin non markdown, contenu non texte, identifiant piégé refusés', refus[0].erreur && refus[1].erreur && refus[2].erreur, JSON.stringify(refus));

  // ─── Tâche 18a : mode présentation lecture ─────────────────────────────────
  const longDoc = Array.from({ length: 60 }, (_, i) => `## Section ${i + 1}\n\n` + 'Un paragraphe de texte assez long pour remplir la page de lecture. '.repeat(6)).join('\n\n');
  await poserDoc(longDoc);
  await pause(800);
  const cle = (k) => h.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })); true`);
  await commande('vue:lecture');
  await pause(300);
  check('Lecture — la commande ouvre le mode : plein écran de l’aperçu et barre de contrôle', await h.js(`document.body.classList.contains('lecture-actif') && document.body.classList.contains('focus-apercu') && getComputedStyle(document.getElementById('lecture-barre')).display !== 'none'`));
  check('Lecture — la fenêtre passe en plein écran', plein[plein.length - 1] === true);
  check('Lecture — ce n’est pas le diaporama', !(await h.js(`window.mdr.diaporama.estOuvert()`)));
  const t0 = await h.js(`window.mdr.lecture.taille()`);
  await h.js(`document.getElementById('lecture-a-plus').click(); true`);
  check('Lecture — A+ agrandit le texte de l’aperçu', (await h.js(`window.mdr.lecture.taille()`)) === t0 + 2 && (await h.js(`document.getElementById('preview').style.getPropertyValue('--apercu-taille')`)) === `${t0 + 2}px`);
  await cle('+'); await cle('=');
  check('Lecture — les touches + et = agrandissent', (await h.js(`window.mdr.lecture.taille()`)) === t0 + 6);
  await cle('-'); await h.js(`document.getElementById('lecture-a-moins').click(); true`);
  check('Lecture — la touche − et A− réduisent', (await h.js(`window.mdr.lecture.taille()`)) === t0 + 2);
  for (let i = 0; i < 40; i++) await cle('-');
  check('Lecture — taille minimale bornée', (await h.js(`window.mdr.lecture.taille()`)) === 12);
  for (let i = 0; i < 40; i++) await cle('+');
  check('Lecture — taille maximale bornée', (await h.js(`window.mdr.lecture.taille()`)) === 56);
  for (let i = 0; i < 12; i++) await cle('-');
  check('Lecture — le texte rendu suit la taille choisie', (await h.js(`parseFloat(getComputedStyle(document.getElementById('preview')).fontSize)`)) === 32);
  check('Lecture — la hauteur de l’aperçu permet de défiler', await h.js(`document.getElementById('preview').scrollHeight > document.getElementById('preview').clientHeight + 500`));

  const v0 = await h.js(`window.mdr.lecture.vitesse()`);
  await cle('ArrowRight'); await cle('ArrowUp');
  check('Lecture — flèches droite/haut accélèrent', (await h.js(`window.mdr.lecture.vitesse()`)) === v0 + 2);
  await cle('ArrowLeft'); await cle('ArrowDown'); await cle('ArrowDown');
  check('Lecture — flèches gauche/bas ralentissent', (await h.js(`window.mdr.lecture.vitesse()`)) === v0 - 1);
  await h.js(`document.getElementById('lecture-plus').click(); document.getElementById('lecture-plus').click(); true`);
  check('Lecture — boutons « et » de vitesse', (await h.js(`window.mdr.lecture.vitesse()`)) === v0 + 1 && /Vitesse/.test(await h.js(`document.getElementById('lecture-vitesse').textContent`)));

  check('Lecture — l’étape ne fait rien tant que la lecture n’est pas lancée', (await h.js(`window.mdr.lecture.etape(100)`)) === false && (await h.js(`document.getElementById('preview').scrollTop`)) === 0);
  await cle(' ');
  check('Lecture — Espace lance le défilement automatique', await h.js(`window.mdr.lecture.enLecture()`) && /Pause/.test(await h.js(`document.getElementById('lecture-play').textContent`)));
  await h.js(`for (let i = 0; i < 20; i++) window.mdr.lecture.etape(100); true`);
  const apresLecture = await h.js(`document.getElementById('preview').scrollTop`);
  check('Lecture — le défilement avance', apresLecture > 20, String(apresLecture));
  await h.js(`window.mdrLecture.ajusterVitesse; window.mdr.lecture.pause(); true`);
  await h.js(`window.mdr.lecture.etape(200); true`);
  check('Lecture — en pause, le défilement s’arrête', (await h.js(`document.getElementById('preview').scrollTop`)) === apresLecture);
  await h.js(`document.getElementById('lecture-play').click(); true`);
  check('Lecture — le bouton lecture/pause relance', await h.js(`window.mdr.lecture.enLecture()`));
  // Plus rapide = plus loin sur la même durée.
  await h.js(`window.mdr.lecture.pause(); document.getElementById('preview').scrollTop = 0; true`);
  const mesure = async (niveau) => {
    await h.js(`(() => { const l = window.mdr.lecture; while (l.vitesse() < ${niveau}) l.changerVitesse(1); while (l.vitesse() > ${niveau}) l.changerVitesse(-1); document.getElementById('preview').scrollTop = 0; l.lecture(); for (let i = 0; i < 10; i++) l.etape(100); l.pause(); return true; })()`);
    return h.js(`document.getElementById('preview').scrollTop`);
  };
  const lent = await mesure(2);
  const rapide = await mesure(9);
  check('Lecture — une vitesse plus élevée défile plus vite', rapide > lent * 2, `${lent} / ${rapide}`);
  await h.js(`(() => { const l = window.mdr.lecture; l.lecture(); for (let i = 0; i < 20000 && l.enLecture(); i++) l.etape(250); return true; })()`);
  check('Lecture — arrivé en bas, le défilement s’arrête seul', !(await h.js(`window.mdr.lecture.enLecture()`)) && await h.js(`(() => { const p = document.getElementById('preview'); return p.scrollHeight - p.clientHeight - p.scrollTop < 2; })()`));

  await pause(2900);
  check('Lecture — la barre se masque après un moment d’inactivité', !(await h.js(`window.mdr.lecture.barreVisible()`)));
  await h.js(`document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); true`);
  check('Lecture — un mouvement de souris la fait réapparaître', await h.js(`window.mdr.lecture.barreVisible()`));
  await cle('Escape');
  await pause(200);
  check('Lecture — Échap sort du mode (habillage, taille et plein écran rétablis)', await h.js(`!document.body.classList.contains('lecture-actif') && !document.body.classList.contains('focus-apercu') && document.getElementById('preview').style.getPropertyValue('--apercu-taille') === window.mdrSettings.get('tailleApercu') + 'px'`) && plein[plein.length - 1] === false);
  check('Lecture — la barre n’est plus affichée hors mode', await h.js(`getComputedStyle(document.getElementById('lecture-barre')).display === 'none'`));
  await commande('vue:lecture'); await pause(150);
  await commande('vue:lecture'); await pause(150);
  check('Lecture — la commande bascule (second appel = sortie)', !(await h.js(`window.mdr.lecture.estOuvert()`)));

  // ─── Tâche 18b : statistiques avancées ─────────────────────────────────────
  await poserDoc('---\nlang: fr\n---\n# Introduction\n\nLe chat dort sur le canapé. Il fait beau aujourd’hui. Le chat rêve.\n\n## Suite\n\n```js\nconst codeIgnore = 1;\n```\n\nNous allons marcher dans le jardin avec les enfants.\n');
  await pause(300);
  const motsBarre = await h.js(`document.getElementById('stats').textContent`);
  check('Stats — sans objectif, la barre d’état n’affiche pas de pourcentage', !/objectif/.test(motsBarre), motsBarre);
  await h.js(`window.mdrSettings.set('objectifMots', 40); window.mdr.editeur().setValue(window.mdr.editeur().getValue() + ' '); true`);
  await pause(300);
  check('Stats — avec un objectif, la barre d’état affiche la progression', /objectif \d+ %/.test(await h.js(`document.getElementById('stats').textContent`)), await h.js(`document.getElementById('stats').textContent`));
  await h.js(`document.getElementById('stats').click(); true`);
  await pause(200);
  check('Stats — un clic sur les statistiques de la barre ouvre la modale', await h.js(`!!document.getElementById('stats-modale')`));
  const modaleTexte = await h.js(`document.getElementById('stats-modale').textContent`);
  check('Stats — langue lue du front-matter', /français/.test(await h.js(`document.getElementById('stats-langue').textContent`)));
  check('Stats — indice Kandel-Moles avec libellé de niveau', /Kandel-Moles : -?[\d,]+ — [a-zéè ]+/.test(await h.js(`document.getElementById('stats-lisibilite').textContent`)), await h.js(`document.getElementById('stats-lisibilite').textContent`));
  check('Stats — barre de progression de l’objectif et pourcentage', await h.js(`(() => { const b = document.querySelector('#stats-modale [role=progressbar]'); return !!b && +b.getAttribute('aria-valuenow') > 0 && /\\d+ %/.test(document.getElementById('stats-objectif').textContent); })()`));
  check('Stats — temps de lecture par section (titres), code exclu', (await h.jsonJs(`[...document.querySelectorAll('#stats-sections tr')].map((r) => r.firstChild.textContent)`)).join('|') === 'Introduction|Suite' && !/codeIgnore/.test(modaleTexte));
  check('Stats — mots les plus fréquents (mots vides exclus)', await h.js(`(() => { const t = [...document.querySelectorAll('#stats-frequents .stats-mot')].map((e) => e.firstChild.textContent); return t[0] === 'chat' && !t.includes('le') && !t.includes('sur'); })()`));
  check('Stats — phrases et paragraphes affichés', /Phrases\s*4/.test(modaleTexte.replace(/[\u202f\u00a0]/g, ' ')) && /Paragraphes\s*2/.test(modaleTexte), modaleTexte.slice(0, 200));
  await h.js(`document.getElementById('stats-fermer').click(); true`);
  await h.js(`window.mdrSettings.set('objectifMots', 0); true`);
  await poserDoc('The cat sat on the mat. It was a sunny day. We went to the park with our friends.');
  await commande('stats:ouvrir');
  await pause(200);
  check('Stats — commande palette : texte anglais, indice Flesch', /anglais/.test(await h.js(`document.getElementById('stats-langue').textContent`)) && /Flesch/.test(await h.js(`document.getElementById('stats-lisibilite').textContent`)) && /Aucun objectif/.test(await h.js(`document.getElementById('stats-objectif').textContent`)));
  await h.js(`document.getElementById('stats-reglages').click(); true`);
  await pause(200);
  check('Stats — le bouton « Régler l’objectif… » ouvre Réglages → Général', await h.js(`window.mdr.reglagesUI.estOuvert() && !!document.querySelector('.reglages-panneau.actif #reglage-objectifMots')`));
  await h.js(`window.mdr.reglagesUI.fermer(); true`);
  await poserDoc('');
  await commande('stats:ouvrir');
  await pause(200);
  check('Stats — document vide : modale sans erreur', /Rien à analyser/.test(await h.js(`document.getElementById('stats-lisibilite').textContent`)));
  await h.js(`document.getElementById('stats-fermer').click(); true`);

  fs.rmSync(dossierTmp, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

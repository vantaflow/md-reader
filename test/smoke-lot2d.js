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
  await h.demarrer({
    stubs: {
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

  fs.rmSync(dossierTmp, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

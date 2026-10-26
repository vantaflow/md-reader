// Harnais partagé par les scripts Electron de test (smoke-lot1.js, etc.).
// Même modèle que test/smoke.js : fenêtre cachée (show:false), garde-fou de
// temps, check() qui journalise, résumé « N/N checks passed ». Aucune
// fenêtre visible et aucun dialogue réel : les canaux IPC sont stubés.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const racine = path.join(__dirname, '..');
const DELAI_MAX_MS = 3 * 60 * 1000;

function creerHarnais({ delaiMs = DELAI_MAX_MS } = {}) {
  const resultats = [];
  let win = null;
  let dossierDonnees = null;

  // Une exécution interrompue ne doit jamais laisser un Electron vivant.
  const chienDeGarde = setTimeout(() => {
    console.error(`\nFAIL le test a dépassé ${delaiMs / 1000} s, arrêt forcé`);
    app.exit(1);
  }, delaiMs);

  // Données utilisateur isolées : le localStorage du test ne touche pas à
  // celui de l'application installée ni à celui d'une autre exécution.
  dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-test-'));
  app.setPath('userData', dossierDonnees);

  // Canaux IPC par défaut : le renderer parle au processus principal dès son
  // démarrage ; sans stub la sortie est noyée sous « no handler registered ».
  const parDefaut = { 'file:watch': () => null, 'file:read': () => null, 'folder:refresh': () => null, 'folder:search': () => null, 'recent:add': () => null, 'app:version': () => app.getVersion(), 'app:open-repo': () => true, 'correcteur:langues': () => [], 'snippets:lire': () => [], 'folder:list-md-relatifs': () => ({ erreur: 'non simulé' }), 'folder:scan-tags': () => ({ erreur: 'non simulé' }), 'folder:backlinks': () => ({ erreur: 'non simulé' }), 'folder:replace-preview': () => ({ erreur: 'non simulé' }), 'folder:replace-apply': () => ({ erreur: 'non simulé' }) };

  function stub(canal, fn) {
    ipcMain.removeHandler(canal);
    ipcMain.handle(canal, fn);
  }

  function check(nom, ok, detail = '') {
    resultats.push({ nom, ok: !!ok, detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${nom}${ok || !detail ? '' : ' — ' + detail}`);
  }

  async function demarrer({ stubs = {} } = {}) {
    await app.whenReady();
    for (const [canal, fn] of Object.entries({ ...parDefaut, ...stubs })) stub(canal, fn);
    win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(racine, 'preload.js') } });
    // Les erreurs du renderer sont rapportées : un script cassé ne doit pas passer inaperçu.
    win.webContents.on('console-message', (_e, niveau, message) => {
      if (niveau >= 3) console.log('  [renderer] ' + message.slice(0, 300));
    });
    await charger();
    return win;
  }

  async function charger() {
    await win.loadFile(path.join(racine, 'renderer', 'index.html'));
    await attendre(800);
  }

  // Recharge la page : le localStorage est conservé, comme un redémarrage.
  async function recharger() {
    win.webContents.reload();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await attendre(800);
  }

  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);

  // Exécute le code dans la page et renvoie l'objet JSON qu'il retourne.
  async function jsonJs(code) {
    return JSON.parse(await js(`JSON.stringify((${code}))`));
  }

  function terminer() {
    const echecs = resultats.filter((r) => !r.ok);
    console.log(`\n${resultats.length - echecs.length}/${resultats.length} checks passed`);
    clearTimeout(chienDeGarde);
    try { fs.rmSync(dossierDonnees, { recursive: true, force: true }); } catch { /* sans importance */ }
    app.exit(echecs.length ? 1 : 0);
  }

  function erreurFatale(err) {
    console.error('harness error:', err);
    clearTimeout(chienDeGarde);
    app.exit(1);
  }

  return {
    racine, check, demarrer, recharger, attendre, js, jsonJs, stub, terminer, erreurFatale,
    get win() { return win; },
    get dossierDonnees() { return dossierDonnees; },
  };
}

module.exports = { creerHarnais, racine };

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, clipboard } = require('electron');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const { pdfOptions, pageSizePrint, tailleSurMesure, hasTocSlots, tocSecondPass } = require('./pdf.js');
const { creerTemplate, ajouterRecent, assainirRecents } = require('./menu.js');
const { enregistrerImage } = require('./images.js');
const contexte = require('./contexte.js');
const presse = require('./presse-papiers.js');
const { lireSnippets, ecrireSnippets, listerMdRelatifs, scannerTags, trouverRetroliens, apercuRemplacement, appliquerRemplacement } = require('./donnees.js');

// Dépôt ouvert par « À propos » : adresse fixe, jamais fournie par le renderer.
const URL_DEPOT = 'https://github.com/vantaflow/md-to-pdf-app';

let mainWindow;
let watcher = null;
// Confine `file:export-pdf-to` au dernier dossier choisi via
// `folder:list-markdown` : avant ce lot, toute écriture passait par une boîte
// d'enregistrement système ; ce handler écrit directement à un chemin fourni
// par le renderer, sans dialogue et sans autre vérification.
let dernierDossierLot = null;
// Dossier ouvert par l'utilisateur via la boîte de dialogue `folder:open` : les
// canaux de navigation (tags, rétroliens, rechercher/remplacer) n'agissent que
// dessus, jamais sur un chemin choisi par le renderer.
let dossierOuvert = null;

// Extensions markdown reconnues par l'application (doivent rester alignées avec
// "fileAssociations" dans package.json).
const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'];
const MD_EXT_RE = new RegExp('\\.(' + MD_EXTENSIONS.join('|') + '|txt)$', 'i');

// File d'attente des fichiers à ouvrir tant que la fenêtre n'est pas prête
// (macOS envoie l'évènement open-file avant que le renderer ne soit chargé).
let pendingFiles = [];
let rendererReady = false;

// ─── Documents récents ──────────────────────────────────────────────────────
// Liste des 10 derniers documents, mémorisée dans le dossier userData et
// mise à jour à chaque ouverture ou enregistrement ; le menu est reconstruit
// à chaque changement.
let recents = [];

function fichierRecents() { return path.join(app.getPath('userData'), 'recents.json'); }

function chargerRecents() {
  try { recents = assainirRecents(JSON.parse(require('fs').readFileSync(fichierRecents(), 'utf8'))); }
  catch { recents = []; }
}

function memoriserRecents() {
  fs.writeFile(fichierRecents(), JSON.stringify(recents), 'utf8').catch(() => {});
}

function noterRecent(chemin) {
  if (!chemin) return;
  const avant = recents.join('\n');
  recents = ajouterRecent(recents, chemin);
  if (recents.join('\n') === avant) return;
  memoriserRecents();
  construireMenu();
}

function effacerRecents() {
  recents = [];
  memoriserRecents();
  construireMenu();
}

function construireMenu() {
  const envoyer = (canal, ...args) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(canal, ...args); };
  const template = creerTemplate({
    plateforme: process.platform,
    nomApp: app.name,
    recents,
    envoyer,
    ouvrirRecent: (p) => openPathInRenderer(p),
    effacerRecents,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openPathInRenderer(filePath) {
  if (!filePath) return;
  if (!rendererReady || !mainWindow) { pendingFiles.push(filePath); return; }
  try {
    const content = await fs.readFile(filePath, 'utf8');
    mainWindow.webContents.send('file:open-external', { path: filePath, content });
    noterRecent(filePath);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } catch (e) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      message: 'Impossible d\'ouvrir le fichier',
      detail: filePath + '\n\n' + e.message,
    });
  }
}

function filesFromArgv(argv) {
  // Sur Windows/Linux, le chemin du fichier est passé en argument de ligne de commande.
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && MD_EXT_RE.test(a) && existsSync(a));
}

function flushPendingFiles() {
  const queued = pendingFiles;
  pendingFiles = [];
  for (const f of queued) openPathInRenderer(f);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.maximize();
  contexte.brancherMenuContextuel(mainWindow.webContents, { Menu, fenetre: () => mainWindow });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    rendererReady = true;
    // Fichiers passés au premier lancement (double-clic sous Windows/Linux).
    for (const f of filesFromArgv(process.argv)) pendingFiles.push(f);
    flushPendingFiles();
  });

  construireMenu();
}

// macOS : fichier ouvert via Finder / "Ouvrir avec". Peut arriver avant `ready`.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openPathInRenderer(filePath);
});

// Une seule instance : les fichiers d'un second lancement sont routés vers la fenêtre existante.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    for (const f of filesFromArgv(argv)) openPathInRenderer(f);
  });

  app.whenReady().then(() => { chargerRecents(); appliquerLanguesCorrecteur('fr-en'); createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

// ─── Définir l'application comme lecteur Markdown par défaut ────────────────────

function macAppBundlePath() {
  const exe = app.getPath('exe');
  const marker = '.app/';
  const idx = exe.indexOf(marker);
  return idx !== -1 ? exe.slice(0, idx + marker.length - 1) : null;
}

// macOS : utilise NSWorkspace.setDefaultApplication (Launch Services) via le
// compilateur Swift système. Aucune dépendance tierce.
function setDefaultMac() {
  return new Promise((resolve) => {
    if (!app.isPackaged) {
      resolve({
        ok: false,
        message: 'Disponible uniquement dans l\'application installée.\n\n'
          + 'Lancez « MD Reader » depuis le dossier Applications, puis réessayez.',
      });
      return;
    }
    const bundle = macAppBundlePath();
    if (!bundle) {
      resolve({ ok: false, message: 'Chemin de l\'application introuvable.' });
      return;
    }

    const swiftSrc = `
import AppKit
import UniformTypeIdentifiers

let env = ProcessInfo.processInfo.environment
guard let appPath = env["MDP_APP_PATH"] else {
  FileHandle.standardError.write("chemin app manquant".data(using: .utf8)!); exit(2)
}
let exts = (env["MDP_EXTS"] ?? "").split(separator: ",").map(String.init)
let appURL = URL(fileURLWithPath: appPath)
let ws = NSWorkspace.shared
var errors: [String] = []
for ext in exts {
  guard let type = UTType(filenameExtension: ext) else {
    errors.append("\\(ext): type inconnu"); continue
  }
  let sem = DispatchSemaphore(value: 0)
  ws.setDefaultApplication(at: appURL, toOpen: type) { error in
    if let error = error { errors.append("\\(ext): \\(error.localizedDescription)") }
    sem.signal()
  }
  sem.wait()
}
if errors.isEmpty { print("OK") }
else { FileHandle.standardError.write(errors.joined(separator: "; ").data(using: .utf8)!); exit(1) }
`;

    const child = spawn('swift', ['-'], {
      env: {
        ...process.env,
        MDP_APP_PATH: bundle,
        MDP_EXTS: MD_EXTENSIONS.join(','),
      },
    });
    let stderr = '';
    child.on('error', (err) => {
      resolve({
        ok: false,
        message: 'Le compilateur Swift est introuvable.\n\n'
          + 'Vous pouvez définir MD Reader comme lecteur par défaut manuellement :\n'
          + 'clic droit sur un fichier .md → Lire les informations → Ouvrir avec → '
          + 'MD Reader → Tout modifier.\n\n(' + err.message + ')',
      });
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          ok: true,
          message: 'MD Reader est maintenant le lecteur par défaut pour les fichiers '
            + MD_EXTENSIONS.map((e) => '.' + e).join(', ') + '.',
        });
      } else {
        resolve({
          ok: false,
          message: 'Impossible de définir l\'application par défaut.\n\n' + (stderr.trim() || 'Erreur inconnue.'),
        });
      }
    });
    child.stdin.write(swiftSrc);
    child.stdin.end();
  });
}

async function setAsDefaultMarkdownHandler() {
  if (process.platform === 'darwin') return setDefaultMac();
  if (process.platform === 'win32') {
    // Windows 10+ interdit de forcer l'association par défaut sans l'utilisateur.
    await shell.openExternal('ms-settings:defaultapps');
    return {
      ok: false,
      message: 'Windows exige de choisir l\'application par défaut manuellement.\n\n'
        + 'Dans Paramètres → Applications par défaut, choisissez « MD Reader » pour les fichiers .md.',
    };
  }
  return { ok: false, message: 'Fonction non prise en charge sur cette plateforme.' };
}

ipcMain.handle('app:set-default-md', () => setAsDefaultMarkdownHandler());
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:open-repo', () => shell.openExternal(URL_DEPOT));
// Le renderer signale un document ouvert depuis l'arborescence ou par glisser-déposer.
ipcMain.handle('recent:add', (_e, chemin) => { if (typeof chemin === 'string' && MD_EXT_RE.test(chemin)) noterRecent(chemin); });

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return null;
  const files = [];
  for (const p of filePaths) { files.push({ path: p, content: await fs.readFile(p, 'utf8') }); noterRecent(p); }
  return files;
});

ipcMain.handle('file:read', async (_e, filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return { path: filePath, content };
});

// `defaultPath` : nom proposé par « Enregistrer sous… » (aucun chemin imposé).
ipcMain.handle('file:save', async (_e, { filePath, content, defaultPath }) => {
  let target = filePath;
  if (!target) {
    const { canceled, filePath: chosen } = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: defaultPath || 'document.md',
    });
    if (canceled || !chosen) return null;
    target = chosen;
  }
  await fs.writeFile(target, content, 'utf8');
  noterRecent(target);
  return target;
});

ipcMain.handle('folder:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return null;
  dossierOuvert = path.resolve(filePaths[0]);
  return buildTree(filePaths[0]);
});

ipcMain.handle('folder:refresh', async (_e, root) => buildTree(root));

async function buildTree(root) {
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return []; }
    const items = [];
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const children = await walk(full);
        if (children.length) items.push({ type: 'dir', name: e.name, path: full, children });
      } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
        items.push({ type: 'file', name: e.name, path: full });
      }
    }
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  }
  return { root, tree: await walk(root) };
}

ipcMain.handle('folder:search', async (_e, { root, query }) => {
  if (!query || !root) return [];
  const q = query.toLowerCase();
  const matches = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
        try {
          const content = await fs.readFile(full, 'utf8');
          const lower = content.toLowerCase();
          const idx = lower.indexOf(q);
          if (idx >= 0) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(content.length, idx + q.length + 40);
            matches.push({
              path: full,
              rel: path.relative(root, full),
              snippet: (start > 0 ? '…' : '') + content.slice(start, end).replace(/\n/g, ' ') + (end < content.length ? '…' : ''),
            });
            if (matches.length >= 100) return;
          }
        } catch {}
      }
    }
  }
  await walk(root);
  return matches;
});

ipcMain.handle('file:watch', async (_e, filePath) => {
  if (watcher) { await watcher.close(); watcher = null; }
  if (!filePath) return;
  watcher = chokidar.watch(filePath, { ignoreInitial: true });
  watcher.on('change', async () => {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      mainWindow.webContents.send('file:changed', { path: filePath, content });
    } catch {}
  });
});

// Chromium resolves nothing from a data: URL, so every export renders from a
// real file on disk instead. Callers get the path and must clean it up.
async function stageHtml(html) {
  const file = path.join(app.getPath('temp'), `mdtopdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  await fs.writeFile(file, html, 'utf8');
  return file;
}

ipcMain.handle('file:print', async (_e, { html, options }) => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let staged;
  let restaged;
  try {
    staged = await stageHtml(html);
    await win.loadFile(staged);
    // « Enregistrer au format PDF » depuis la boîte système est un geste courant
    // sous macOS : l'impression fait donc la même mesure que l'export, sinon le
    // même document donne un sommaire aux emplacements vides d'un côté et
    // rempli de l'autre, sans que rien ne le signale. Le PDF de la mesure n'est
    // pas conservé — c'est la fenêtre rechargée qui part à l'impression. Sans
    // emplacement à remplir, il n'y a rien à mesurer et la passe est sautée.
    if (hasTocSlots(html)) {
      const mesure = await win.webContents.printToPDF(pdfOptions(options));
      const { needed, html: numbered } = tocSecondPass(html, mesure);
      if (needed) {
        restaged = await stageHtml(numbered);
        await win.loadFile(restaged);
      }
    }
    const m = options?.margin ?? 0.5;
    await new Promise((resolve) => {
      win.webContents.print({
        printBackground: true,
        landscape: !!options?.landscape && !tailleSurMesure(options?.pageSize),
        pageSize: pageSizePrint(options || {}),
        margins: { marginType: 'custom', top: m, bottom: m, left: m, right: m },
      }, () => resolve());
    });
  } finally {
    // Sans ce `finally`, un `loadFile` en échec — deux ERR_FAILED relevés en
    // revue — laissait la fenêtre cachée vivante jusqu'à la fermeture de
    // l'application et le fichier temporaire sur le disque, à chaque tentative.
    // Ce fichier porte le document entier, images en data URI comprises.
    // Les suppressions d'abord, `close()` isolé ensuite : sur une fenêtre déjà
    // détruite, `close()` lève et emporterait le ménage avec lui.
    if (staged) await fs.unlink(staged).catch(() => {});
    if (restaged) await fs.unlink(restaged).catch(() => {});
    try { win.close(); } catch {}
  }
  return true;
});

ipcMain.handle('file:export-pdf', async (_e, { html, defaultName, options }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: (defaultName || 'document') + '.pdf',
  });
  if (canceled || !filePath) return null;

  // Minor 2 : stageHtml() écrit sur le disque. L'appeler avant le `try` (et
  // avant la création de la fenêtre) laissait le fichier temporaire orphelin
  // si la création de la fenêtre levait ensuite — `file:print` a le bon
  // motif (la variable est déclarée dehors, assignée dedans) : repris ici.
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let stagedHtml;
  let restaged;
  try {
    stagedHtml = await stageHtml(html);
    await pdfWin.loadFile(stagedHtml);
    // Les numéros de page ne s'obtiennent que du PDF lui-même : `offsetTop` se
    // trompe dès qu'une règle de pagination déplace un élément. On rend donc une
    // première fois pour savoir, puis une seconde pour montrer. Sans sommaire,
    // rien à remplir et la seconde passe est sautée.
    let buffer = await pdfWin.webContents.printToPDF(pdfOptions(options));
    const { needed, html: numbered } = tocSecondPass(html, buffer);
    if (needed) {
      restaged = await stageHtml(numbered);
      await pdfWin.loadFile(restaged);
      buffer = await pdfWin.webContents.printToPDF(pdfOptions(options));
    }
    await fs.writeFile(filePath, buffer);
  } finally {
    // Les suppressions avant la fermeture : sur une fenêtre déjà détruite,
    // `close()` lève, et les fichiers temporaires restaient alors sur le disque.
    if (stagedHtml) await fs.unlink(stagedHtml).catch(() => {});
    if (restaged) await fs.unlink(restaged).catch(() => {});
    try { pdfWin.close(); } catch {}
  }
  shell.showItemInFolder(filePath);
  return filePath;
});

// L'export par lot boucle côté renderer — chaque document doit passer par
// l'aperçu pour produire son HTML — et revient ici pour chaque écriture. D'où
// un handler qui écrit à un chemin donné, sans boîte de dialogue.
ipcMain.handle('file:export-pdf-to', async (_e, { html, chemin, options }) => {
  // I2 : sans boîte de dialogue, rien n'empêchait ce handler d'écrire
  // n'importe où sur le disque à la demande du renderer. On le confine donc
  // au dossier du dernier lot choisi par l'utilisateur, et on exige un nom se
  // terminant par .pdf.
  if (!dernierDossierLot) {
    throw new Error('Aucun dossier de lot n\'a été sélectionné.');
  }
  const racine = path.resolve(dernierDossierLot);
  const cible = path.resolve(chemin);
  const estDansLeDossier = cible === racine || cible.startsWith(racine + path.sep);
  if (!estDansLeDossier || path.extname(cible).toLowerCase() !== '.pdf') {
    throw new Error('Chemin refusé : hors du dossier du lot ou ne se terminant pas par .pdf.');
  }
  // Pas de boîte d'enregistrement ici pour demander confirmation : on note
  // donc nous-mêmes si le fichier existait déjà, pour que l'appelant (le lot,
  // côté renderer) puisse le signaler plutôt que d'écraser en silence.
  const remplace = existsSync(chemin);
  // Minor 2 : même motif que file:print — stageHtml() (une écriture disque)
  // s'exécute dans le try, pas avant, sinon un échec de création de fenêtre
  // laisserait le fichier temporaire orphelin.
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let stagedHtml;
  let restaged = null;
  try {
    stagedHtml = await stageHtml(html);
    await pdfWin.loadFile(stagedHtml);
    let buffer = await pdfWin.webContents.printToPDF(pdfOptions(options));
    if (hasTocSlots(html)) {
      const pass = tocSecondPass(html, buffer);
      if (pass.needed) {
        restaged = await stageHtml(pass.html);
        await pdfWin.loadFile(restaged);
        buffer = await pdfWin.webContents.printToPDF(pdfOptions(options));
      }
    }
    await fs.writeFile(chemin, buffer);
    return { chemin, remplace };
  } finally {
    if (stagedHtml) await fs.unlink(stagedHtml).catch(() => {});
    if (restaged) await fs.unlink(restaged).catch(() => {});
    try { pdfWin.close(); } catch {}
  }
});

ipcMain.handle('folder:list-markdown', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Dossier à exporter en PDF',
  });
  if (canceled || !filePaths.length) return null;
  const dossier = filePaths[0];
  dernierDossierLot = dossier;
  const entrees = await fs.readdir(dossier, { withFileTypes: true });
  // `MD_EXT_RE` accepte aussi `.txt`, pour l'ouverture manuelle. Un export par
  // lot ne doit prendre que du markdown : on filtre sur `MD_EXTENSIONS`.
  const estMarkdown = new RegExp('\\.(' + MD_EXTENSIONS.join('|') + ')$', 'i');
  const fichiers = entrees
    .filter((e) => e.isFile() && estMarkdown.test(e.name))
    .map((e) => e.name)
    .sort();
  return { dossier, fichiers };
});

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
};

// An exported .html carrying file:// image paths breaks the moment it is sent to
// someone else, so the images travel with it.
async function inlineLocalImages(html) {
  const seen = new Map();
  const matches = [...html.matchAll(/src="(file:\/\/[^"]+)"/g)];
  for (const [, url] of matches) {
    if (seen.has(url)) continue;
    try {
      const file = decodeURIComponent(new URL(url).pathname);
      const mime = MIME_BY_EXT[path.extname(file).toLowerCase()];
      if (!mime) continue;
      const data = await fs.readFile(file);
      seen.set(url, `data:${mime};base64,${data.toString('base64')}`);
    } catch {}
  }
  for (const [url, dataUri] of seen) html = html.split(`src="${url}"`).join(`src="${dataUri}"`);
  return html;
}

// Image collée ou glissée dans l'éditeur : copiée dans `images/` à côté du
// document (voir images.js : nom nettoyé ou horodaté, sans collision, chemin
// borné au dossier du document). Renvoie { relatif } ou { erreur }.
ipcMain.handle('image:save', async (_e, { cheminDocument, nom, octets, mime } = {}) => {
  try {
    const r = await enregistrerImage({ cheminDocument, nom, octets, mime });
    return { relatif: r.relatif, nom: r.nom };
  } catch (e) {
    return { erreur: e.message };
  }
});

// Plein écran natif demandé par « Aperçu seul plein écran » : on ne quitte
// le plein écran à la sortie du mode que s'il n'y était pas déjà avant.
let pleinEcranAvantMode = false;
ipcMain.handle('fenetre:plein-ecran', (_e, actif) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (actif) {
    pleinEcranAvantMode = mainWindow.isFullScreen();
    mainWindow.setFullScreen(true);
  } else if (!pleinEcranAvantMode) {
    mainWindow.setFullScreen(false);
  }
  return true;
});

// Export Word : le renderer fournit les octets du .docx, le chemin est choisi
// par l'utilisateur dans la boîte d'enregistrement.
ipcMain.handle('file:export-docx', async (_e, { octets, defaultName }) => {
  if (!octets || !octets.length) return null;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Document Word', extensions: ['docx'] }],
    defaultPath: (defaultName || 'document') + '.docx',
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, Buffer.from(octets));
  return filePath;
});

// Lecture d'une image locale (file://) pour l'export Word : extensions d'image
// uniquement, jamais un autre type de fichier.
const MIME_IMAGES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
ipcMain.handle('image:lire', async (_e, url) => {
  try {
    if (typeof url !== 'string' || !/^file:/i.test(url)) return null;
    const chemin = require('url').fileURLToPath(url);
    const mime = MIME_IMAGES[path.extname(chemin).slice(1).toLowerCase()];
    if (!mime) return null;
    return { octets: await fs.readFile(chemin), mime };
  } catch { return null; }
});

ipcMain.handle('file:export-html', async (_e, { html, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'HTML', extensions: ['html'] }],
    defaultPath: (defaultName || 'document') + '.html',
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, await inlineLocalImages(html), 'utf8');
  return filePath;
});

// ─── Lot « écriture » (1.9.0) ───────────────────────────────────────────────

// Correcteur orthographique : le correcteur natif de Chromium. Au démarrage
// français et anglais ; le renderer renvoie ensuite le réglage de l'utilisateur
// (canal `correcteur:langues`), appliqué à chaud. Sous macOS le correcteur du
// système est utilisé et ses langues se règlent dans les Préférences Système :
// setSpellCheckerLanguages n'y a pas d'effet.
function appliquerLanguesCorrecteur(choix) { return contexte.appliquerLanguesCorrecteur(session.defaultSession, choix); }
ipcMain.handle('correcteur:langues', (_e, choix) => appliquerLanguesCorrecteur(typeof choix === 'string' ? choix : 'fr-en'));

// Menu contextuel : branché à la création de la fenêtre (contexte.js construit le
// gabarit : suggestions du dictionnaire, « Ajouter au dictionnaire », couper,
// copier, coller).

// Snippets : un fichier JSON dans le dossier de données de l'application, jamais
// ailleurs ; la liste est assainie et bornée à chaque lecture et écriture.
ipcMain.handle('snippets:lire', () => lireSnippets(app.getPath('userData')));
ipcMain.handle('snippets:ecrire', (_e, liste) => ecrireSnippets(app.getPath('userData'), liste));

// Propositions de liens : noms des .md sous un dossier (profondeur et nombre
// bornés, aucun contenu lu). Renvoie { dossier, fichiers } ou { erreur }.
ipcMain.handle('folder:list-md-relatifs', async (_e, dossier) => {
  try { return await listerMdRelatifs(dossier); }
  catch (e) { return { erreur: e.message }; }
});

// ─── Navigation et remplacement dans le dossier ouvert ──────────────────────
// Chaque canal exige que `root` soit le dossier choisi par l'utilisateur dans
// la boîte de dialogue ; sinon { erreur }. Les écritures (`replace-apply`) ne
// touchent que des .md sous ce dossier (voir donnees.js).
function racineOuverte(root) {
  if (!dossierOuvert || typeof root !== 'string' || path.resolve(root) !== dossierOuvert) {
    throw new Error('Ce dossier n’est pas le dossier ouvert.');
  }
  return dossierOuvert;
}
const canalDossier = (traitement) => async (_e, charge) => {
  try {
    const c = charge && typeof charge === 'object' ? charge : {};
    return await traitement(racineOuverte(c.root), c);
  } catch (e) { return { erreur: e.message }; }
};
ipcMain.handle('folder:scan-tags', canalDossier((racine) => scannerTags(racine)));
ipcMain.handle('folder:backlinks', canalDossier((racine, c) => trouverRetroliens(racine, c.cible)));
ipcMain.handle('folder:replace-preview', canalDossier((racine, c) => apercuRemplacement(racine, c.parametres)));
ipcMain.handle('folder:replace-apply', canalDossier((racine, c) => appliquerRemplacement(racine, c.parametres, c.selection)));

// ─── Export et partage (1.9.0) ──────────────────────────────────────────────
// « Copier en HTML riche » : le renderer fournit le HTML aux styles en ligne et
// le Markdown source ; seul le presse-papiers est touché, jamais le disque.
ipcMain.handle('presse-papiers:ecrire-html', (_e, charge) => {
  try { return presse.ecrireHtml(clipboard, charge); }
  catch (e) { return { erreur: e.message }; }
});

// Export EPUB : le renderer construit l'archive (jszip) et fournit les octets ;
// seul le chemin choisi dans la boîte d'enregistrement reçoit l'écriture. Octets
// bornés (200 Mo) et signature de l'archive vérifiée.
const MAX_EPUB = 200 * 1024 * 1024;
ipcMain.handle('file:export-epub', async (_e, { octets, defaultName } = {}) => {
  if (!octets || typeof octets.length !== 'number' || octets.length < 4 || octets.length > MAX_EPUB) return null;
  const donnees = Buffer.from(octets);
  if (donnees.readUInt32LE(0) !== 0x04034b50) return null; // pas une archive zip
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
    defaultPath: (typeof defaultName === 'string' && defaultName ? defaultName : 'document') + '.epub',
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, donnees);
  return filePath;
});

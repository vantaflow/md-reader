// ---------- Réglages ----------
// Magasin unique (renderer/lib/settings.js, clé localStorage `reglages`). Les
// changements sont appliqués à chaud par `appliquerReglage()` plus bas.
const reglages = window.mdrSettings;

// ---------- Mermaid ----------
if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

// ---------- Front-matter ----------
function stripFrontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: md.slice(m[0].length) };
}

// ---------- DOM ----------
const tabsEl = document.getElementById('tabs');
const editorParent = document.getElementById('editor');
const preview = document.getElementById('preview');
const fileNameEl = document.getElementById('file-name');
const statsEl = document.getElementById('stats');
const cursorEl = document.getElementById('cursor-pos');
const dirtyEl = document.getElementById('dirty-indicator');
const lotNotification = document.getElementById('lot-notification');

// I6 : l'en-tête (où vit fileNameEl) est masqué par le mode focus. Un lot
// lancé en mode focus n'affichait donc rien — ni sélecteur, ni refus. Les
// messages du lot passent par ce conteneur en plus de l'en-tête, jamais
// masqué par le mode focus.
// Régression signalée en relecture : la notification ne se refermait jamais
// (rien ne remettait `hidden`), restant affichée en permanence après le
// premier export par lot. Chaque appel réarme un délai d'effacement ; tant
// que le lot envoie des messages de progression, il se réarme et reste
// visible, puis s'efface tout seul un délai raisonnable après le dernier
// message (le refus ou le résumé), assez long pour être lu.
const DELAI_EFFACEMENT_NOTIFICATION_LOT_MS = 4000;
let minuteurEffacementLot = null;
function annoncerLot(message) {
  fileNameEl.textContent = message;
  lotNotification.textContent = message;
  lotNotification.classList.remove('hidden');
  clearTimeout(minuteurEffacementLot);
  minuteurEffacementLot = setTimeout(() => {
    lotNotification.classList.add('hidden');
  }, DELAI_EFFACEMENT_NOTIFICATION_LOT_MS);
}

// ---------- State ----------
let tabs = [];
let activeTab = null;
let folderRoot = null;
let editor = null;
let suppressChange = false;
// Les onglets ouverts sont mémorisés pour « rouvrir au démarrage ». Tant que
// la restauration du démarrage n'est pas finie, on ne mémorise rien : on
// écraserait la liste qu'on s'apprête à relire.
var restaurationOnglets = false;

// ---------- Editor (CodeMirror 6) ----------
function initEditor() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  editor = window.createEditor(editorParent, {
    initial: '',
    dark,
    onChange: (doc) => {
      if (suppressChange) return;
      if (activeTab) activeTab.content = doc;
      scheduleRender();
      markDirty();
    },
    onScroll: (dom) => syncScroll(dom, preview),
    onCursor: ({ line, col }) => {
      cursorEl.textContent = `Ln ${line} · Col ${col}`;
      if (window.mdr && window.mdr.plan) window.mdr.plan.curseur(line);
    },
    // Touches de mise en forme (features/format.js), prioritaires sur celles de CodeMirror.
    raccourcis: window.mdr && window.mdr.format ? window.mdr.format.raccourcisEditeur : [],
    // Images collées ou glissées (features/images.js).
    onImages: (fichiers, o) => window.mdr.images.inserer(fichiers, o),
    // Correcteur orthographique (réglage) et propositions de liens/emoji (features/liens.js).
    correcteur: reglages.get('correcteur'),
    propositionsLiens: (type, saisie) => (window.mdr.liens ? window.mdr.liens.propositions(type, saisie) : Promise.resolve([])),
  });
}

let renderTimer;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 120); }

// ---------- Tabs ----------
// Chemins des onglets ouverts (les onglets sans fichier ne se rouvrent pas).
function memoriserOnglets() {
  if (!restaurationOnglets) return;
  reglages.set('ongletsOuverts', tabs.filter(t => t.path).map(t => t.path));
  reglages.set('ongletActif', activeTab && activeTab.path ? activeTab.path : null);
}

// Au démarrage : rouvre les fichiers mémorisés si le réglage est activé. Un
// fichier disparu ou illisible est ignoré sans bruit.
async function restaurerOnglets() {
  if (reglages.get('rouvrirOnglets')) {
    const actif = reglages.get('ongletActif');
    let aActiver = null;
    for (const chemin of reglages.get('ongletsOuverts')) {
      try {
        const data = await window.api.readFile(chemin);
        if (!data || typeof data.content !== 'string') continue;
        const t = openInTab({ path: data.path || chemin, content: data.content });
        if (chemin === actif) aActiver = t;
      } catch { /* fichier disparu : ignoré */ }
    }
    if (aActiver && tabs.includes(aActiver)) setActiveTab(aActiver);
  }
  restaurationOnglets = true;
  memoriserOnglets();
}

// Nom affiché d'un onglet : fichier, sinon titre donné (« Copie de … »), sinon « Sans titre ».
function nomOnglet(t) { return t.path ? t.path.split(/[\\/]/).pop() : (t.titre || 'Sans titre'); }

function newTab({ path = null, content = '', titre = null } = {}) {
  const t = { id: Date.now() + Math.random(), path, content, dirty: false, titre };
  tabs.push(t);
  setActiveTab(t);
  return t;
}

// Ouvre un fichier : réutilise un onglet "Sans titre" vierge (ex. l'accueil) au lieu d'en empiler un nouveau
function openInTab({ path, content }) {
  // Le processus principal tient la liste des documents récents.
  if (path && restaurationOnglets && window.api.noterRecent) window.api.noterRecent(path).catch(() => {});
  const existing = tabs.find(t => t.path === path);
  if (existing) { setActiveTab(existing); return existing; }
  const pristine = tabs.find(t => !t.path && !t.dirty);
  if (pristine) {
    pristine.path = path;
    pristine.content = content;
    setActiveTab(pristine);
    markClean();
    return pristine;
  }
  const t = newTab({ path, content });
  markClean();
  return t;
}

function setActiveTab(t) {
  activeTab = t;
  suppressChange = true;
  editor.setValue(t.content);
  suppressChange = false;
  fileNameEl.textContent = nomOnglet(t);
  render();
  renderTabs();
  window.api.watchFile(t.path || null);
  highlightTreeActive();
  if (window.mdr.favoris) window.mdr.favoris.rendre();
  if (window.mdr.retroliens) window.mdr.retroliens.rafraichir();
  memoriserOnglets();
}

function closeTab(t) {
  // L'onglet de travail d'un lot en cours ne se ferme pas : la prochaine
  // itération le réactiverait alors qu'il n'existe plus dans `tabs`. Le
  // refus a lieu avant la confirmation de perte de modifications, pas après.
  if (t === tabDuLot) return;
  if (t.dirty && !confirm('Fermer l\'onglet sans enregistrer ?')) return;
  const i = tabs.indexOf(t);
  tabs.splice(i, 1);
  memoriserOnglets();
  if (activeTab === t) {
    if (tabs.length) setActiveTab(tabs[Math.max(0, i - 1)]);
    else { activeTab = null; suppressChange = true; editor.setValue(''); suppressChange = false; preview.innerHTML = ''; fileNameEl.textContent = 'Sans titre'; renderTabs(); }
  } else renderTabs();
}

// Recharge un onglet depuis le disque après une modification externe (ici un
// remplacement dans le dossier) ; l'appelant n'y passe que des onglets sans
// modifications en cours.
function rechargerOnglet(t, content) {
  t.content = content;
  if (t === activeTab) {
    suppressChange = true;
    editor.setValue(content);
    suppressChange = false;
    render();
    markClean();
  } else {
    t.dirty = false;
    renderTabs();
  }
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const t of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (t === activeTab ? ' active' : '');
    const name = nomOnglet(t);
    el.innerHTML = `${t.dirty ? '<span class="dot">●</span>' : ''}<span>${escapeHtml(name)}</span><span class="close">✕</span>`;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('close')) closeTab(t);
      else setActiveTab(t);
    });
    tabsEl.appendChild(el);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Render ----------
// Relative image paths belong to the markdown file, not to index.html, so the
// preview has to rebase them itself — it cannot use <base> without breaking the
// relative paths of its own scripts and stylesheets.
function resolveLocalImages() {
  if (!activeTab?.path) return;
  const dir = new URL('file://' + activeTab.path.replace(/[\\/][^\\/]*$/, '') + '/').href;
  preview.querySelectorAll('img[src]').forEach(img => {
    const raw = img.getAttribute('src');
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return;
    try { img.src = new URL(raw, dir).href; } catch {}
  });
}

// mermaid.run() paints its SVGs asynchronously; the exporters await this so they
// never snapshot the preview mid-render.
let mermaidPending = Promise.resolve();

// Le front-matter n'est retiré de l'aperçu que pour l'écran : la page de garde
// de l'export en a besoin.
let frontMatter = {};

function render() {
  const src = editor ? editor.getValue() : '';
  const { meta, body } = stripFrontMatter(src);
  frontMatter = meta;
  if (window.mdr.styleDoc) window.mdr.styleDoc.appliquer();
  preview.classList.remove('pagine');
  preview.innerHTML = md.parse(body);
  const { headings } = md.enhance(preview);
  resolveLocalImages();

  if (window.mermaid) {
    const blocks = preview.querySelectorAll('pre code.language-mermaid, pre code.hljs.language-mermaid');
    blocks.forEach((el, i) => {
      const pre = el.closest('pre');
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.id = 'mmd-' + Date.now() + '-' + i;
      div.textContent = el.textContent;
      pre.replaceWith(div);
    });
    try { mermaidPending = Promise.resolve(mermaid.run({ querySelector: '.mermaid' })); } catch {}
  }

  buildToc(headings);
  updateStats();
  planifierPagination();
}

function markDirty() {
  if (!activeTab) return;
  const was = activeTab.dirty;
  activeTab.dirty = true;
  dirtyEl.textContent = '● modifié';
  if (!was) renderTabs();
  scheduleAutosave();
}
function markClean() {
  if (!activeTab) return;
  activeTab.dirty = false;
  dirtyEl.textContent = '';
  renderTabs();
}

// ---------- Stats ----------
function updateStats() {
  const text = editor ? editor.getValue() : '';
  const words = (text.trim().match(/\S+/g) || []).length;
  const chars = text.length;
  const minutes = Math.max(1, Math.round(words / 200));
  const objectif = reglages.get('objectifMots');
  const suite = objectif > 0 ? ` · objectif ${Math.min(100, Math.floor((words / objectif) * 100))} %` : '';
  statsEl.textContent = `${words} mots · ${chars} car · ~${minutes} min lecture${suite}`;
}

// ---------- TOC ----------
// Le panneau latéral consomme la liste produite par `enhance()` : les
// identifiants sont attribués une seule fois, sinon les deux sommaires
// divergeraient.
function buildToc(headings) {
  // Panneau Plan : sections du texte source, clic = saut, glisser-déposer
  // (renderer/features/plan.js).
  window.mdr.plan.construire(headings);
}

// ---------- File ops ----------
async function openFile() {
  const res = await window.api.openFile();
  if (!res) return;
  for (const f of res) openInTab({ path: f.path, content: f.content });
}

// `sous` : « Enregistrer sous… » — toujours la boîte de dialogue, même pour un fichier existant.
async function saveFile({ sous = false } = {}) {
  if (!activeTab) return;
  // L'onglet de travail d'un lot vise le fichier source en cours de
  // traitement : l'enregistrer écrirait dedans par-dessus le lot lui-même.
  if (activeTab === tabDuLot) return;
  const saved = await window.api.saveFile({
    filePath: sous ? null : activeTab.path,
    content: editor.getValue(),
    defaultPath: sous ? nomOnglet(activeTab).replace(/^Sans titre$/, 'document.md') : undefined,
  });
  if (saved) {
    activeTab.path = saved;
    activeTab.content = editor.getValue();
    memoriserOnglets();
    markClean();
    fileNameEl.textContent = saved.split(/[\\/]/).pop();
    window.api.watchFile(saved);
    if (window.mdr.historique) window.mdr.historique.instantane(saved, activeTab.content);
    if (folderRoot) refreshTree();
  }
}

let autosaveTimer;
// Délai réglable (en secondes dans les réglages) avant l'enregistrement auto.
function delaiAutosaveMs() { return Math.round(reglages.get('delaiAutosave') * 1000); }
function scheduleAutosave() {
  if (!document.getElementById('toggle-autosave').checked) return;
  // Suspendu pendant un lot : l'onglet actif est alors l'onglet de travail,
  // dont le `path` désigne un fichier source du lot — une frappe pendant le
  // lot ne doit jamais programmer une écriture dessus.
  if (lotEnCours) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { if (!lotEnCours && activeTab?.path && activeTab.dirty) saveFile(); }, delaiAutosaveMs());
}

// ---------- Folder tree ----------
async function openFolder() {
  const res = await window.api.openFolder();
  if (!res) return;
  folderRoot = res.root;
  document.getElementById('folder-name').textContent = res.root.split(/[\\/]/).pop() || res.root;
  renderTree(res.tree);
}

async function refreshTree() {
  if (!folderRoot) return;
  const res = await window.api.refreshFolder(folderRoot);
  if (res) renderTree(res.tree);
}

// Arbre complet du dossier ouvert ; l'affichage peut en être filtré (tags).
let arbreCourant = [];
function renderTree(tree) {
  arbreCourant = tree;
  rendreArbre();
  if (window.mdr.tags) window.mdr.tags.rafraichir();
  if (window.mdr.favoris) window.mdr.favoris.rendre();
  if (window.mdr.retroliens) window.mdr.retroliens.rafraichir();
}

function rendreArbre() {
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  const filtre = window.mdr.tags && window.mdr.tags.actif();
  const visibles = filtre ? window.mdrTags.filtrerArbre(arbreCourant, window.mdr.tags.garde) : arbreCourant;
  if (filtre && !visibles.length) {
    const vide = document.createElement('div');
    vide.className = 'aucun';
    vide.textContent = 'Aucun fichier ne correspond à ce filtre.';
    container.appendChild(vide);
  } else container.appendChild(renderNode(visibles, true));
  highlightTreeActive();
}

function renderNode(items, root) {
  const frag = document.createDocumentFragment();
  for (const item of items) {
    if (item.type === 'dir') {
      const d = document.createElement('details');
      if (root || window.mdr.tags.actif()) d.open = true;
      const s = document.createElement('summary');
      s.textContent = '📁 ' + item.name;
      d.appendChild(s);
      d.appendChild(renderNode(item.children, false));
      frag.appendChild(d);
    } else {
      const f = document.createElement('div');
      f.className = 'file';
      const nom = document.createElement('span');
      nom.className = 'nom';
      nom.textContent = '📄 ' + item.name;
      f.appendChild(nom);
      f.appendChild(window.mdr.favoris.etoile(item.path));
      f.dataset.path = item.path;
      f.title = item.path;
      f.addEventListener('click', async () => {
        if (tabs.find(t => t.path === item.path)) { setActiveTab(tabs.find(t => t.path === item.path)); return; }
        const data = await window.api.readFile(item.path);
        openInTab({ path: data.path, content: data.content });
      });
      frag.appendChild(f);
    }
  }
  return frag;
}

function highlightTreeActive() {
  document.querySelectorAll('#file-tree .file').forEach(el => {
    el.classList.toggle('active', activeTab && el.dataset.path === activeTab.path);
  });
}

// ---------- Search ----------
const searchInput = document.getElementById('search-input');
let searchTimer;
searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 250); });
async function doSearch() {
  const q = searchInput.value.trim();
  const out = document.getElementById('search-results');
  out.innerHTML = '';
  if (!folderRoot || !q) return;
  const results = (await window.api.searchFolder({ root: folderRoot, query: q })) || [];
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'result';
    const snippet = escapeHtml(r.snippet).replace(new RegExp(escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
    div.innerHTML = `<div class="path">${escapeHtml(r.rel)}</div><div class="snippet">${snippet}</div>`;
    div.addEventListener('click', async () => {
      if (tabs.find(t => t.path === r.path)) { setActiveTab(tabs.find(t => t.path === r.path)); return; }
      const data = await window.api.readFile(r.path);
      openInTab({ path: data.path, content: data.content });
    });
    out.appendChild(div);
  }
  if (!results.length) out.innerHTML = '<div style="padding:8px;color:var(--fg-muted);font-size:12px;">Aucun résultat.</div>';
}

// ---------- Sidebar tabs ----------
document.querySelectorAll('.sidebar-tabs button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tabs button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('tab-' + b.dataset.tab).classList.add('active');
  });
});

// ---------- Theme ----------
// Le réglage vaut `clair`, `sombre` ou `systeme` (suit prefers-color-scheme) ;
// l'attribut data-theme du document reste `light` ou `dark`.
const mediaSombre = window.matchMedia('(prefers-color-scheme: dark)');
function themeEffectif() {
  const t = reglages.get('theme');
  if (t === 'systeme') return mediaSombre.matches ? 'dark' : 'light';
  return t === 'sombre' ? 'dark' : 'light';
}
function appliquerTheme() {
  const t = themeEffectif();
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('hljs-theme').href = t === 'dark'
    ? '../node_modules/highlight.js/styles/github-dark.min.css'
    : '../node_modules/highlight.js/styles/github.min.css';
  if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: t === 'dark' ? 'dark' : 'default', securityLevel: 'strict' });
  if (editor) editor.setDark(t === 'dark');
  render();
}
appliquerTheme();
mediaSombre.addEventListener('change', () => { if (reglages.get('theme') === 'systeme') appliquerTheme(); });
// Le bouton de l'en-tête bascule entre clair et sombre : il remplace le choix
// courant (y compris « système ») par l'opposé de ce qui est affiché.
document.getElementById('btn-theme').addEventListener('click', () => {
  reglages.set('theme', themeEffectif() === 'dark' ? 'clair' : 'sombre');
});

// ---------- View toggles & scroll sync ----------
const mainEl = document.querySelector('main');
const toggleEditor = document.getElementById('toggle-editor');
const toggleSync = document.getElementById('toggle-sync');
// Volet Code : décoché par défaut au démarrage, état mémorisé entre les sessions
toggleEditor.checked = reglages.get('voletCode');
mainEl.classList.toggle('no-editor', !toggleEditor.checked);
toggleEditor.addEventListener('change', () => {
  mainEl.classList.toggle('no-editor', !toggleEditor.checked);
  reglages.set('voletCode', toggleEditor.checked);
});
// Les cases Sync et Autosave de l'en-tête et les réglages restent synchronisés.
toggleSync.checked = reglages.get('synchroDefilement');
toggleSync.addEventListener('change', () => reglages.set('synchroDefilement', toggleSync.checked));
const toggleAutosave = document.getElementById('toggle-autosave');
toggleAutosave.checked = reglages.get('autosave');
toggleAutosave.addEventListener('change', () => reglages.set('autosave', toggleAutosave.checked));

// Panneau latéral : réductible via le bouton ☰, état mémorisé entre les sessions
mainEl.classList.toggle('no-sidebar', !reglages.get('panneauLateral'));
document.getElementById('btn-sidebar').addEventListener('click', () => {
  reglages.set('panneauLateral', mainEl.classList.contains('no-sidebar'));
});

// Panneau latéral : largeur réglable à la souris, mémorisée entre les sessions.
// Double-clic sur la poignée : retour à la largeur par défaut.
const LARGEUR_PANNEAU_DEFAUT = 240;
const LARGEUR_PANNEAU_MIN = 140;
// L'ancienne clé `largeurPanneau` reste écrite en plus du réglage : elle est
// relue telle quelle par les contrôles de test existants.
function memoriserLargeurPanneau(px) {
  localStorage.setItem('largeurPanneau', px);
  reglages.set('largeurPanneau', px);
}
function appliquerLargeurPanneau(px) {
  mainEl.style.setProperty('--largeur-panneau', px + 'px');
}
{
  const memorisee = reglages.get('largeurPanneau');
  if (memorisee >= LARGEUR_PANNEAU_MIN) appliquerLargeurPanneau(memorisee);
  const poignee = document.getElementById('sidebar-resizer');
  const panneau = document.getElementById('sidebar');
  poignee.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    poignee.setPointerCapture(e.pointerId);
    document.body.classList.add('redimensionnement');
    const gauche = panneau.getBoundingClientRect().left;
    const deplacer = (ev) => {
      const max = Math.max(LARGEUR_PANNEAU_MIN, Math.round(window.innerWidth * 0.6));
      appliquerLargeurPanneau(Math.min(max, Math.max(LARGEUR_PANNEAU_MIN, Math.round(ev.clientX - gauche))));
    };
    const relacher = () => {
      poignee.removeEventListener('pointermove', deplacer);
      poignee.removeEventListener('pointerup', relacher);
      poignee.removeEventListener('pointercancel', relacher);
      document.body.classList.remove('redimensionnement');
      memoriserLargeurPanneau(Math.round(panneau.getBoundingClientRect().width));
    };
    poignee.addEventListener('pointermove', deplacer);
    poignee.addEventListener('pointerup', relacher);
    poignee.addEventListener('pointercancel', relacher);
  });
  poignee.addEventListener('dblclick', () => {
    appliquerLargeurPanneau(LARGEUR_PANNEAU_DEFAUT);
    memoriserLargeurPanneau(LARGEUR_PANNEAU_DEFAUT);
  });
}

// ---------- Affichage en pages A4 ----------
// L'aperçu peut se lire en continu, ou découpé en feuilles A4 (une colonne,
// ou deux feuilles côte à côte). Le découpage ne fait que déplacer les nœuds
// rendus dans des feuilles : rien n'est recopié, la table des matières et la
// synchronisation du défilement continuent de pointer sur les mêmes éléments.
// Les fonctions ci-dessous peuvent être appelées par render() avant que ce
// bloc ne soit exécuté : elles ne lisent donc que le DOM, et la minuterie est
// en `var` pour ne pas tomber dans la zone morte d'un `let`.
var MODES_AFFICHAGE = ['continu', 'a4', 'a4-double'];
var minuterieA4 = null;

function modeAffichage() {
  const s = document.getElementById('mode-affichage');
  return s && ['a4', 'a4-double'].includes(s.value) ? s.value : 'continu';
}

// Le contenu tel que le Markdown l'a produit, sans les feuilles d'affichage :
// c'est ce que les exports doivent recevoir, quel que soit le mode.
function contenuApercuHtml() {
  const feuilles = preview.querySelector(':scope > .a4-feuilles');
  if (!feuilles) return preview.innerHTML;
  // Sur une copie : les listes et tableaux coupés sortent d'un seul tenant.
  const copie = document.createElement('div');
  copie.append(...noeudsRecolles(feuilles.cloneNode(true)));
  return copie.innerHTML;
}

// Les nœuds des feuilles, dans l'ordre, la suite d'une liste ou d'un tableau
// coupé rejoignant son début.
function noeudsRecolles(feuilles) {
  const noeuds = [];
  feuilles.querySelectorAll('.a4-contenu').forEach(c => {
    for (const n of Array.from(c.childNodes)) {
      const debut = noeuds[noeuds.length - 1];
      if (n.nodeType === Node.ELEMENT_NODE && n.hasAttribute('data-a4-suite') && debut) {
        const dest = elementsDecoupables(debut).parent;
        elementsDecoupables(n).items.forEach(item => dest.appendChild(item));
      } else noeuds.push(n);
    }
  });
  return noeuds;
}

function depaginer() {
  const feuilles = preview.querySelector(':scope > .a4-feuilles');
  if (feuilles) preview.replaceChildren(...noeudsRecolles(feuilles));
  preview.classList.remove('pagine');
}

// Les blocs qu'on peut couper entre deux feuilles : une liste (par élément)
// et un tableau (par ligne, l'en-tête étant repris sur la feuille suivante).
function elementsDecoupables(noeud) {
  if (noeud.nodeType !== Node.ELEMENT_NODE) return { parent: null, items: [] };
  if (noeud.nodeName === 'UL' || noeud.nodeName === 'OL') {
    return { parent: noeud, items: Array.from(noeud.children).filter(e => e.nodeName === 'LI') };
  }
  if (noeud.nodeName === 'TABLE' && noeud.tBodies.length === 1) {
    return { parent: noeud.tBodies[0], items: Array.from(noeud.tBodies[0].rows) };
  }
  return { parent: null, items: [] };
}

// Une coquille vide du bloc, prête à recevoir la suite de ses éléments.
function suiteDe(noeud) {
  const suite = noeud.cloneNode(false);
  suite.setAttribute('data-a4-suite', '');
  if (noeud.nodeName === 'TABLE') {
    if (noeud.tHead) suite.appendChild(noeud.tHead.cloneNode(true));
    suite.appendChild(noeud.tBodies[0].cloneNode(false));
  }
  return suite;
}

// Le bloc déborde de la feuille : on renvoie ses derniers éléments dans une
// suite, jusqu'à ce qu'il tienne. Renvoie la suite, ou null si rien n'a pu
// être coupé (un seul élément, déjà trop haut à lui seul).
function couper(noeud, contenu) {
  const { parent, items } = elementsDecoupables(noeud);
  if (items.length < 2) return null;
  const suite = suiteDe(noeud);
  const destSuite = elementsDecoupables(suite).parent || suite;
  let restants = items.length;
  while (deborde(contenu) && restants > 1) {
    destSuite.insertBefore(items[restants - 1], destSuite.firstChild);
    restants--;
  }
  if (deborde(contenu)) {
    // Même un seul élément ne tient pas avec ce qui précède : on recolle.
    Array.from(destSuite.children).forEach(item => parent.appendChild(item));
    return null;
  }
  if (noeud.nodeName === 'OL') suite.setAttribute('start', String((noeud.start || 1) + restants));
  return suite;
}

function nouvelleFeuille(conteneur) {
  const page = document.createElement('div');
  page.className = 'a4-page';
  const contenu = document.createElement('div');
  contenu.className = 'a4-contenu';
  page.appendChild(contenu);
  conteneur.appendChild(page);
  return contenu;
}

function deborde(contenu) {
  return contenu.scrollHeight > contenu.clientHeight + 1;
}

function paginer() {
  const mode = modeAffichage();
  const position = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
  depaginer();
  if (mode === 'continu') return;

  const noeuds = Array.from(preview.childNodes)
    .filter(n => n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
  preview.classList.add('pagine');
  const feuilles = document.createElement('div');
  feuilles.className = 'a4-feuilles' + (mode === 'a4-double' ? ' double' : '');
  preview.replaceChildren(feuilles);

  let contenu = nouvelleFeuille(feuilles);
  let feuillePleine = false;
  const file = noeuds.slice();
  while (file.length) {
    const noeud = file.shift();
    const saut = noeud.nodeType === Node.ELEMENT_NODE && noeud.classList.contains('page-break');
    if ((feuillePleine || saut) && contenu.childNodes.length) contenu = nouvelleFeuille(feuilles);
    feuillePleine = false;
    contenu.appendChild(noeud);
    if (!deborde(contenu)) continue;
    // Une liste ou un tableau trop long se coupe : ce qui tient reste sur la
    // feuille, la suite part sur la suivante (et peut se couper à nouveau).
    const suite = couper(noeud, contenu);
    if (suite) {
      file.unshift(suite);
      feuillePleine = true;
      continue;
    }
    // Le bloc ne tient plus : il part sur une nouvelle feuille, sauf s'il est
    // seul (plus haut qu'une page). Il occupe alors une feuille allongée,
    // fermée aussitôt pour que la suite reprenne sur une page normale.
    if (contenu.childNodes.length > 1) {
      // Un titre ne reste pas seul en bas de page : il suit son bloc.
      const precedent = noeud.previousSibling;
      const titreOrphelin = precedent && contenu.childNodes.length > 2 && /^H[1-6]$/.test(precedent.nodeName);
      contenu = nouvelleFeuille(feuilles);
      if (titreOrphelin) contenu.appendChild(precedent);
      contenu.appendChild(noeud);
    }
    if (deborde(contenu)) {
      // Seul sur sa feuille et encore trop haut : une liste ou un tableau se coupe.
      const reste = couper(noeud, contenu);
      if (reste) {
        file.unshift(reste);
        feuillePleine = true;
        continue;
      }
      contenu.parentElement.classList.add('longue');
      feuillePleine = true;
    }
  }

  const pages = feuilles.querySelectorAll('.a4-page');
  pages.forEach((page, i) => {
    const numero = document.createElement('div');
    numero.className = 'a4-numero';
    numero.textContent = `${i + 1} / ${pages.length}`;
    page.appendChild(numero);
  });
  // Une image chargée après coup change la hauteur des blocs : on recoupe.
  preview.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', planifierPagination, { once: true });
  });
  ajusterZoomA4();
  preview.scrollTop = position * Math.max(1, preview.scrollHeight - preview.clientHeight);
}

// Les feuilles gardent leur taille réelle ; le zoom les fait tenir dans la
// largeur de l'aperçu, sans jamais les agrandir.
function ajusterZoomA4() {
  const feuilles = preview.querySelector(':scope > .a4-feuilles');
  const page = feuilles && feuilles.querySelector('.a4-page');
  if (!page) return;
  feuilles.style.zoom = '';
  const colonnes = feuilles.classList.contains('double') ? 2 : 1;
  const largeur = colonnes * page.offsetWidth + (colonnes - 1) * 20;
  const disponible = preview.clientWidth - 32;
  feuilles.style.zoom = Math.min(1, disponible / Math.max(1, largeur)).toFixed(3);
}

function planifierPagination() {
  if (modeAffichage() === 'continu' && !preview.classList.contains('pagine')) return;
  clearTimeout(minuterieA4);
  // Mermaid peint ses schémas de façon asynchrone : on attend qu'il ait fini
  // pour mesurer les hauteurs réelles.
  minuterieA4 = setTimeout(() => { mermaidPending.catch(() => {}).then(paginer); }, 150);
}

function choisirModeAffichage(mode) {
  const s = document.getElementById('mode-affichage');
  s.value = MODES_AFFICHAGE.includes(mode) ? mode : 'continu';
  reglages.set('modeDefaut', s.value);
  paginer();
}

{
  const s = document.getElementById('mode-affichage');
  s.value = reglages.get('modeDefaut');
  s.addEventListener('change', () => choisirModeAffichage(s.value));
  new ResizeObserver(() => ajusterZoomA4()).observe(preview);
  planifierPagination();
}

let syncing = false;
// Suspend la synchronisation proportionnelle des défilements un instant (saut
  // vers une section du plan : éditeur et aperçu défilent chacun à leur cible).
let synchroSuspendueJusqua = 0;
function syncScroll(from, to) {
  if (!toggleSync.checked || syncing || Date.now() < synchroSuspendueJusqua) return;
  const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
  syncing = true;
  to.scrollTop = ratio * Math.max(1, to.scrollHeight - to.clientHeight);
  requestAnimationFrame(() => { syncing = false; });
}
preview.addEventListener('scroll', () => { if (editor) syncScroll(preview, editor.getScrollDOM()); });

// ---------- Formatting shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (!editor || !editorParent.contains(document.activeElement)) return;
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  // Gras, italique, souligné, lien et titres 1-3 sont gérés par features/format.js
  // (touches CodeMirror prioritaires + menu Format) : ne reste ici que les titres 4-6.
  if (['4','5','6'].includes(e.key) && e.altKey) { e.preventDefault(); editor.prefixLine('#'.repeat(+e.key) + ' '); }
});

// ---------- Drag & drop ----------
let dropOverlay;
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!dropOverlay) {
    dropOverlay = document.createElement('div');
    dropOverlay.className = 'drop-overlay';
    dropOverlay.textContent = 'Déposer le(s) fichier(s) markdown';
    document.body.appendChild(dropOverlay);
  }
});
document.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) removeOverlay(); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  removeOverlay();
  for (const file of e.dataTransfer.files) {
    if (!/\.(md|markdown|txt)$/i.test(file.name)) continue;
    const content = await file.text();
    openInTab({ path: file.path, content });
  }
});
function removeOverlay() { if (dropOverlay) { dropOverlay.remove(); dropOverlay = null; } }

// ---------- Fichiers ouverts depuis le système (double-clic, "Ouvrir avec") ----------
window.api.onOpenExternal(({ path, content }) => {
  openInTab({ path, content });
});

// ---------- Lecteur Markdown par défaut ----------
async function setDefaultReader() {
  const res = await window.api.setDefaultMarkdown();
  alert(res.message);
}

// ---------- File watcher ----------
window.api.onFileChanged(({ path, content }) => {
  const t = tabs.find(x => x.path === path);
  if (!t) return;
  if (t === activeTab && t.dirty) {
    if (!confirm(`${path.split(/[\\/]/).pop()} a changé sur disque. Recharger ?`)) return;
  }
  t.content = content;
  if (t === activeTab) {
    suppressChange = true;
    editor.setValue(content);
    suppressChange = false;
    render();
    markClean();
  }
});

// ---------- PDF / HTML export ----------
const pdfModal = document.getElementById('pdf-modal');
const PDF_FIELDS = ['pdf-page-size', 'pdf-landscape', 'pdf-margin', 'pdf-header-footer', 'pdf-break-h1', 'pdf-number-headings', 'pdf-header-text', 'pdf-cover', 'pdf-watermark'];

// The export options are the same on almost every run; remembering them saves
// re-checking the same three boxes every time.
function loadPdfPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('pdfOptions') || '{}'); } catch {}
  for (const id of PDF_FIELDS) {
    const el = document.getElementById(id);
    if (!el || !(id in saved)) continue;
    if (el.type === 'checkbox') el.checked = !!saved[id];
    else el.value = saved[id];
  }
}
function savePdfPrefs() {
  const saved = {};
  for (const id of PDF_FIELDS) {
    const el = document.getElementById(id);
    if (el) saved[id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  localStorage.setItem('pdfOptions', JSON.stringify(saved));
}
loadPdfPrefs();

function readPdfOptions() {
  return {
    pageSize: document.getElementById('pdf-page-size').value,
    landscape: document.getElementById('pdf-landscape').value === 'true',
    margin: parseFloat(document.getElementById('pdf-margin').value) || 0.5,
    headerFooter: document.getElementById('pdf-header-footer').checked || !!document.getElementById('pdf-header-text').value || !!reglages.get('pdfPied'),
    pageNumbers: document.getElementById('pdf-header-footer').checked,
    footerText: reglages.get('pdfPied'),
    headerText: document.getElementById('pdf-header-text').value,
    breakBeforeH1: document.getElementById('pdf-break-h1').checked,
    numberHeadings: document.getElementById('pdf-number-headings').checked,
    cover: document.getElementById('pdf-cover').checked,
    watermark: document.getElementById('pdf-watermark').value,
    theme: window.mdrThemesExport.themeOuDefaut(document.getElementById('pdf-theme').value),
  };
}

// La modale s'ouvre pré-remplie avec les défauts des réglages (format,
// orientation, marges, numéros de page, page de garde, filigrane). Les autres
// champs gardent leur dernière valeur utilisée.
function appliquerDefautsPdf() {
  document.getElementById('pdf-page-size').value = reglages.get('pdfFormat');
  document.getElementById('pdf-landscape').value = String(reglages.get('pdfPaysage'));
  document.getElementById('pdf-margin').value = reglages.get('pdfMarge');
  document.getElementById('pdf-header-footer').checked = reglages.get('pdfNumerosPage');
  document.getElementById('pdf-cover').checked = reglages.get('pdfPageGarde');
  document.getElementById('pdf-watermark').value = reglages.get('pdfFiligrane');
  document.getElementById('pdf-theme').value = reglages.get('exportTheme');
}
// Le thème du sélecteur suit le réglage tant que la modale n'a pas été ouverte
// (l'impression et l'export HTML lisent ce champ).
document.getElementById('pdf-theme').value = reglages.get('exportTheme');

// Feuille de style des exports : thème choisi puis CSS personnalisé du réglage.
// Jamais ajoutée à l'aperçu ni à styles.css.
function cssThemeExport(options = {}) {
  // Styles du document (front-matter : police, taille, couleurs) ajoutés après le thème.
  const styleDoc = window.mdr.styleDoc ? window.mdr.styleDoc.cssExport() : '';
  return window.mdrThemesExport.cssExport({ theme: options.theme || reglages.get('exportTheme'), cssPerso: reglages.get('exportCssPerso') }) + '\n' + styleDoc;
}
function showPdfModal() { appliquerDefautsPdf(); pdfModal.classList.remove('hidden'); }
function hidePdfModal() { pdfModal.classList.add('hidden'); }
document.getElementById('pdf-cancel').addEventListener('click', hidePdfModal);
document.getElementById('pdf-confirm').addEventListener('click', async () => {
  const options = readPdfOptions();
  savePdfPrefs();
  hidePdfModal();
  await doExportPdf(options);
});

// KaTeX ships its fonts as `url(fonts/...)` relative to katex.min.css. Once the
// stylesheet is inlined into a standalone export those paths point nowhere, so
// rewrite them to absolute file:// URLs before handing the CSS over.
async function loadKatexCss() {
  const href = new URL('../node_modules/katex/dist/katex.min.css', location.href);
  const css = await fetch(href).then(r => r.text()).catch(() => '');
  return css.replace(/url\(([\'"]?)fonts\//g, (_m, q) => `url(${q}${new URL('fonts/', href).href}`);
}

// Chromium will happily strand a heading at the foot of a page or split a table
// across two; these are the rules that stop it, plus the two opt-in behaviours
// offered in the export dialog.
function paginationCss(options = {}) {
  return `
    h1, h2, h3, h4, h5, h6 { break-after: avoid; break-inside: avoid; }
    table, pre, blockquote, figure, img, .mermaid, .katex-display { break-inside: avoid; }
    .markdown-alert, .md-toc { break-inside: avoid; }
    .footnotes h2 { break-after: avoid; }
    tr, li { break-inside: avoid; }
    p { orphans: 3; widows: 3; }
    .page-break { break-after: page; height: 0; }
    /* Le repère « saut de page » est une aide à l'écran : styles.css lui donne un
       trait pointillé et une étiquette, scopés sur l'identifiant preview, que le
       document imprimable porte aussi. Sur papier, le saut se voit de lui-même. */
    #preview .page-break { border-top: 0; margin: 0; }
    #preview .page-break::after { content: none; }
    /* Le sommaire du document exporté se présente à l'identique, rempli ou non.
       styles.css bascule le \`li\` de \`list-item\` à \`flex\` avec \`:has()\` au moment
       même où le numéro arrive : le lien devient alors un élément flexible qui
       partage la largeur avec la ligne de conduite et le numéro, et une entrée
       qui tenait sur une ligne en première passe peut passer à deux en seconde.
       La première passe mesurait donc une pagination que la seconde ne respecte
       plus — mesuré, 3 destinations sur 5 décalées d'une page sur un document de
       92 pages. Ces règles-ci sont inconditionnelles : la mise en page finale est
       déjà celle que la première passe mesure. Le \`:has()\` reste dans styles.css
       pour l'aperçu à l'écran, où il ne dit rien d'autre que ces règles.
       L'emplacement du numéro garde sa largeur même vide (min-width), sinon
       l'inscrire la reprendrait au lien. Pas d'itération des passes : c'est
       déterministe et borné ainsi, là où itérer peut ne pas converger. */
    .markdown-body .md-toc li { display: flex; align-items: baseline; gap: 0.4rem; }
    .markdown-body .md-toc li::after {
      content: ''; order: 1; flex: 1;
      border-bottom: 1px dotted var(--border); margin: 0 0.2rem 0.25rem;
    }
    .markdown-body .md-toc-page {
      order: 2; margin-left: auto; min-width: 2.2em; text-align: right;
      font-variant-numeric: tabular-nums; color: var(--fg-muted);
    }
    ${options.breakBeforeH1 ? '#preview > h1, .markdown-body > h1 { break-before: page; } #preview > h1:first-child, .markdown-body > h1:first-child { break-before: auto; }' : ''}
    ${options.numberHeadings ? `
    .markdown-body { counter-reset: h1 h2 h3 h4; }
    .markdown-body h1 { counter-increment: h1; counter-reset: h2 h3 h4; }
    .markdown-body h2 { counter-increment: h2; counter-reset: h3 h4; }
    .markdown-body h3 { counter-increment: h3; counter-reset: h4; }
    .markdown-body h4 { counter-increment: h4; }
    .markdown-body h1::before { content: counter(h1) '. '; }
    .markdown-body h2::before { content: counter(h1) '.' counter(h2) '. '; }
    .markdown-body h3::before { content: counter(h1) '.' counter(h2) '.' counter(h3) '. '; }
    .markdown-body h4::before { content: counter(h1) '.' counter(h2) '.' counter(h3) '.' counter(h4) '. '; }
    /* Le titre de la page de garde n'est pas un chapitre : le numéroter le
       compterait, et décalerait tous les chapitres suivants d'un rang. */
    .markdown-body .pdf-cover h1 { counter-increment: none; }
    .markdown-body .pdf-cover h1::before { content: none; }` : ''}
  `;
}

// Relative image paths in the markdown are resolved against the document it came
// from, not against the temp file the exporter renders.
function baseTag() {
  if (!activeTab?.path) return '';
  const dir = activeTab.path.replace(/[\\/][^\\/]*$/, '');
  return `<base href="${escapeHtml(new URL('file://' + dir + '/').href)}">`;
}

function documentName() {
  return activeTab?.path ? activeTab.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : 'document';
}

// Position fixe : Chromium repeint un élément fixe sur chaque page imprimée —
// mesuré, le flux de chacune des trois pages d'un document témoin grossit.
function watermarkHtml(text) {
  const clean = (text || '').trim();
  return clean ? `<div class="pdf-watermark">${escapeHtml(clean)}</div>` : '';
}

// Une page de garde sans titre n'est qu'une page blanche : sans `title` en
// front-matter, on n'en met pas.
function coverHtml() {
  const title = frontMatter.title;
  if (!title) return '';
  const lines = [`<h1>${escapeHtml(title)}</h1>`];
  if (frontMatter.subtitle) lines.push(`<p class="pdf-cover-subtitle">${escapeHtml(frontMatter.subtitle)}</p>`);
  const meta = [frontMatter.author, frontMatter.date].filter(Boolean).map(escapeHtml);
  if (meta.length) lines.push(`<p class="pdf-cover-meta">${meta.join(' · ')}</p>`);
  return `<section class="pdf-cover">${lines.join('')}</section>`;
}

// Everything that leaves the app — PDF, print, standalone HTML — is built from
// the preview itself rather than re-parsed, so what ships is what was on screen:
// KaTeX already typeset, mermaid already painted as SVG.
async function buildPrintableHtml(options) {
  render();
  await mermaidPending.catch(() => {});
  const [css, katexCss, hljsCss] = await Promise.all([
    fetch('styles.css').then(r => r.text()),
    loadKatexCss(),
    fetch(document.getElementById('hljs-theme').href).then(r => r.text()).catch(() => ''),
  ]);
  return `<!DOCTYPE html><html data-theme="light"><head><meta charset="utf-8"><title>${escapeHtml(documentName())}</title>${baseTag()}<style>${css}${katexCss}${hljsCss}
    body { display:block; margin: 0; } header, #tabs, #sidebar, #editor, #statusbar, .modal { display:none !important; }
    main { display: block; } #preview { padding: 0; overflow: visible; }
    ${cssThemeExport(options)}
    ${paginationCss(options)}
  </style></head><body>${watermarkHtml(options.watermark)}<div id="preview" class="markdown-body">${options.cover ? coverHtml() : ''}${contenuApercuHtml()}</div></body></html>`;
}

async function doExportPdf(options) {
  const out = await window.api.exportPdf({ html: await buildPrintableHtml(options), defaultName: documentName(), options });
  if (out) fileNameEl.textContent = 'PDF : ' + out.split(/[\\/]/).pop();
}

async function doPrint() {
  const options = readPdfOptions();
  await window.api.print({ html: await buildPrintableHtml(options), options });
}

// Même gabarit que buildPrintableHtml() : un utilisateur qui coche la page de
// garde ou remplit le filigrane doit les retrouver dans l'export HTML aussi.
// Extraite pour être testable : doExportHtml() ouvre une boîte de dialogue
// d'enregistrement, ce qu'un test ne peut pas déclencher.
async function buildExportHtml(options) {
  render();
  await mermaidPending.catch(() => {});
  const bodyHtml = contenuApercuHtml();
  const css = await fetch('styles.css').then(r => r.text());
  const katexCss = await loadKatexCss();
  const hljsCss = await fetch(document.getElementById('hljs-theme').href).then(r => r.text()).catch(() => '');
  return `<!DOCTYPE html><html data-theme="light"><head><meta charset="utf-8"><title>${escapeHtml(activeTab?.path?.split(/[\\/]/).pop() || 'Document')}</title>${baseTag()}<style>${css}${katexCss}${hljsCss}
    body { max-width: 900px; margin: 2rem auto; padding: 0 1rem; font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
    ${cssThemeExport(options)}
    @media print { ${paginationCss(options)} }
  </style></head><body>${watermarkHtml(options.watermark)}<div class="markdown-body">${options.cover ? coverHtml() : ''}${bodyHtml}</div></body></html>`;
}

// Thème de l'export HTML : choix dans une liste (le thème par défaut des
// réglages en tête), annulable.
async function choisirThemeExportHtml() {
  const defaut = window.mdrThemesExport.themeOuDefaut(reglages.get('exportTheme'));
  const themes = window.mdrThemesExport.THEMES;
  const items = [...themes.filter((t) => t.id === defaut), ...themes.filter((t) => t.id !== defaut)]
    .map((t) => ({ id: t.id, libelle: t.libelle, detail: t.id === defaut ? 'par défaut' : '' }));
  return window.mdr.modale.choisir({ titre: 'Thème de l’export HTML', items, filtre: false });
}

async function doExportHtml() {
  const theme = await choisirThemeExportHtml();
  if (!theme) return;
  const options = { ...readPdfOptions(), theme };
  const full = await buildExportHtml(options);
  const out = await window.api.exportHtml({ html: full, defaultName: documentName() });
  if (out) fileNameEl.textContent = 'HTML : ' + out.split(/[\\/]/).pop();
}

// ---------- Buttons & menus ----------
document.getElementById('btn-open').addEventListener('click', openFile);
document.getElementById('btn-open-folder').addEventListener('click', openFolder);
document.getElementById('btn-save').addEventListener('click', saveFile);
document.getElementById('btn-export').addEventListener('click', showPdfModal);
document.getElementById('btn-export-html').addEventListener('click', doExportHtml);
document.getElementById('btn-default-reader').addEventListener('click', setDefaultReader);

window.api.onMenu('menu:new', () => { newTab(); markClean(); });
window.api.onMenu('menu:open', openFile);
window.api.onMenu('menu:open-folder', openFolder);
window.api.onMenu('menu:save', saveFile);
window.api.onMenu('menu:close-tab', () => activeTab && closeTab(activeTab));
window.api.onMenu('menu:export', showPdfModal);
window.api.onMenu('menu:export-html', doExportHtml);
window.api.onMenu('menu:print', doPrint);
window.api.onMenu('menu:toggle-editor', () => { toggleEditor.checked = !toggleEditor.checked; toggleEditor.dispatchEvent(new Event('change')); });
window.api.onMenu('menu:toggle-theme', () => document.getElementById('btn-theme').click());
window.api.onMenu('menu:set-default', setDefaultReader);
// Canal générique des nouveaux menus (Format, Affichage, Aide, Fichier) : l'identifiant
// est celui d'une commande du registre.
window.api.onMenu('menu:commande', (_e, id) => { if (typeof id === 'string') window.commands.run(id); });

// ---------- Application des réglages à chaud ----------
function appliquerEditeur() {
  if (!editor) return;
  editor.setOptions({
    police: reglages.get('policeEditeur'),
    taille: reglages.get('tailleEditeur'),
    retourLigne: reglages.get('retourLigne'),
    numeros: reglages.get('numerosLigne'),
    tabulation: reglages.get('tabulation'),
  });
}

// Police, taille et marges des feuilles A4 passent par des variables CSS ;
// tout changement de mesure oblige à recouper les feuilles.
function appliquerApercu() {
  const police = reglages.get('policeApercu');
  if (police) preview.style.setProperty('--apercu-police', police);
  else preview.style.removeProperty('--apercu-police');
  preview.style.setProperty('--apercu-taille', reglages.get('tailleApercu') + 'px');
  preview.style.setProperty('--a4-marge-haut', reglages.get('margeA4Haut') + 'mm');
  preview.style.setProperty('--a4-marge-cotes', reglages.get('margeA4Cotes') + 'mm');
  preview.style.setProperty('--a4-marge-bas', reglages.get('margeA4Bas') + 'mm');
  planifierPagination();
}

function appliquerReglage(cle, valeur) {
  switch (cle) {
    case 'theme': appliquerTheme(); break;
    case 'policeEditeur': case 'tailleEditeur': case 'retourLigne': case 'numerosLigne': case 'tabulation':
      appliquerEditeur(); break;
    case 'barreOutils': document.body.classList.toggle('sans-barre-outils', !valeur); break;
    case 'modeDefaut': {
      const s = document.getElementById('mode-affichage');
      if (s.value !== valeur) { s.value = valeur; paginer(); }
      break;
    }
    case 'policeApercu': case 'tailleApercu': case 'margeA4Haut': case 'margeA4Cotes': case 'margeA4Bas':
      appliquerApercu(); break;
    case 'autosave': if (toggleAutosave.checked !== valeur) toggleAutosave.checked = valeur; break;
    case 'synchroDefilement': if (toggleSync.checked !== valeur) toggleSync.checked = valeur; break;
    case 'voletCode':
      if (toggleEditor.checked !== valeur) toggleEditor.checked = valeur;
      // Volet code masqué : « éditeur seul » n'a plus de sens, l'aperçu revient.
      if (!valeur) mainEl.classList.remove('no-preview');
      mainEl.classList.toggle('no-editor', !valeur);
      break;
    case 'objectifMots': updateStats(); break;
    case 'exportTheme': document.getElementById('pdf-theme').value = valeur; break;
    case 'panneauLateral': mainEl.classList.toggle('no-sidebar', !valeur); break;
    case 'largeurPanneau': if (valeur >= LARGEUR_PANNEAU_MIN) appliquerLargeurPanneau(valeur); break;
    default: break;
  }
}
reglages.onChange(appliquerReglage);

// ---------- Init ----------
initEditor();
appliquerEditeur();
appliquerApercu();
document.body.classList.toggle('sans-barre-outils', !reglages.get('barreOutils'));
newTab({ content: `---
title: Bienvenue
---

# 🎉 MD Reader — v3 avec CodeMirror 6

Éditeur avec coloration syntaxique, numéros de ligne, pliage, multi-curseurs, et plein d'autres bonbons.

## Essaie

- **Cmd+F** : recherche intégrée
- **Cmd+Alt+clic** : multi-curseurs
- \`Cmd+B / I / K\` : gras / italique / lien
- Plie les titres via la gouttière à gauche

## Code avec coloration

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
\`\`\`

## Maths

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

## Notes et encadrés

Une affirmation qui mérite une source[^1].

[^1]: La source en question.

> [!TIP]
> \`> [!NOTE]\`, \`[!TIP]\`, \`[!IMPORTANT]\`, \`[!WARNING]\` et \`[!CAUTION]\`
> produisent un encadré. La syntaxe \`:::note\` marche aussi.

> [!WARNING]
> Insère \`[[toc]]\` où tu veux un sommaire, et une image seule sur sa
> ligne devient une figure numérotée.

## Diagramme

\`\`\`mermaid
sequenceDiagram
  User->>Editor: tape markdown
  Editor->>Preview: rend HTML
  Preview->>PDF: exporte
\`\`\`
` });
markClean();
restaurerOnglets();

// ---------- Palette de commandes ----------
// `Cmd/Ctrl+K` est déjà pris par l'insertion de lien : la palette prend
// `Cmd/Ctrl+Shift+P`.
const paletteEl = document.getElementById('palette');
const paletteRequete = document.getElementById('palette-requete');
const paletteListe = document.getElementById('palette-liste');
let paletteIndex = 0;
let paletteFocusPrecedent = null;

function paletteRendu() {
  const resultats = window.commands.filtrer(paletteRequete.value);
  paletteIndex = Math.min(paletteIndex, Math.max(0, resultats.length - 1));
  paletteListe.innerHTML = '';
  resultats.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = i === paletteIndex ? 'actif' : '';
    const titre = document.createElement('span');
    titre.textContent = c.titre;
    li.appendChild(titre);
    if (c.raccourci) {
      const kbd = document.createElement('kbd');
      kbd.textContent = c.raccourci;
      li.appendChild(kbd);
    }
    li.addEventListener('click', () => { fermerPalette(); window.commands.run(c.id); });
    paletteListe.appendChild(li);
  });
  return resultats;
}

function ouvrirPalette() {
  // Minor 4 : un second appel pendant que la palette est déjà ouverte
  // écrasait la mémoire du focus précédent avec `paletteRequete`
  // elle-même (activeElement à ce moment), puisqu'elle a le focus. La
  // fermeture rendait alors le focus au champ de la palette, pas à ce qui
  // l'avait avant sa toute première ouverture. Idempotent : un second appel
  // ne fait rien de plus.
  if (!paletteEl.classList.contains('hidden')) return;
  // Mémorisé pour le rendre à la fermeture, comme une boîte de dialogue :
  // ça marche quelle que soit la configuration de l'interface, sans
  // supposer que l'éditeur est visible.
  paletteFocusPrecedent = document.activeElement;
  paletteIndex = 0;
  paletteRequete.value = '';
  paletteEl.classList.remove('hidden');
  paletteRendu();
  paletteRequete.focus();
}

function estFocusable(el) {
  return !!el && el !== document.body && document.contains(el) && el.offsetParent !== null;
}

function fermerPalette() {
  paletteEl.classList.add('hidden');
  // `display: none` fait perdre le focus : sans ça, il faut recliquer dans
  // le document après chaque commande. On rend le focus à ce qui l'avait
  // avant l'ouverture ; s'il n'est plus focusable (masqué, retiré du DOM),
  // repli sur l'éditeur s'il existe.
  const precedent = paletteFocusPrecedent;
  paletteFocusPrecedent = null;
  if (estFocusable(precedent)) precedent.focus();
  else if (editor) editor.focus();
}

paletteRequete.addEventListener('input', () => { paletteIndex = 0; paletteRendu(); });
paletteRequete.addEventListener('keydown', (e) => {
  const resultats = window.commands.filtrer(paletteRequete.value);
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerPalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, resultats.length - 1); paletteRendu(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); paletteRendu(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const choisi = resultats[paletteIndex];
    fermerPalette();
    if (choisi) window.commands.run(choisi.id);
  }
});
paletteEl.addEventListener('click', (e) => { if (e.target === paletteEl) fermerPalette(); });

window.palette = { ouvrir: ouvrirPalette, fermer: fermerPalette };

// Point d'accès unique pour les fonctions à venir (renderer/features/*.js) :
// éditeur, réglages, palette, onglets. Les accès sont tardifs (fonctions) car
// l'éditeur et les onglets changent au fil de la session.
Object.assign(window.mdr = window.mdr || {}, {
  editeur: () => editor,
  reglages,
  palette: window.palette,
  commandes: window.commands,
  apercu: () => preview,
  synchro: { suspendre: (ms) => { synchroSuspendueJusqua = Date.now() + ms; } },
  dossier: () => folderRoot,
  arbre: { rendre: rendreArbre, courant: () => arbreCourant },
  arbreRafraichir: () => refreshTree(),
  onglets: {
    liste: () => tabs.slice(),
    actif: () => activeTab,
    ouvrir: openInTab,
    nouveau: newTab,
    activer: setActiveTab,
    enregistrer: saveFile,
    marquerModifie: markDirty,
    recharger: rechargerOnglet,
  },
});

// Mode Document (features/document.js) : enveloppes de l'éditeur et mode d'édition par défaut.
if (window.mdr.document) window.mdr.document.initialiser();

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
    e.preventDefault();
    ouvrirPalette();
  }
});

// Les actions déjà existantes deviennent des commandes : la palette n'invente
// rien, elle rend joignable ce que les boutons et les menus font déjà.
// I5 : les raccourcis affichés étaient des littéraux `Cmd+…`, faux hors
// macOS — l'application livre aussi un installeur Windows. Le modificateur
// se déduit de la plateforme (exposée par le préchargement).
const MOD = window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl';
for (const c of [
  { id: 'fichier:nouveau', titre: 'Nouvel onglet', raccourci: `${MOD}+N`, executer: () => { newTab(); markClean(); } },
  { id: 'fichier:ouvrir', titre: 'Ouvrir un fichier', raccourci: `${MOD}+O`, executer: openFile },
  { id: 'fichier:dossier', titre: 'Ouvrir un dossier', raccourci: `${MOD}+Shift+O`, executer: openFolder },
  { id: 'fichier:enregistrer', titre: 'Enregistrer', raccourci: `${MOD}+S`, executer: saveFile },
  { id: 'export:pdf', titre: 'Exporter en PDF', raccourci: `${MOD}+E`, executer: showPdfModal },
  { id: 'export:html', titre: 'Exporter en HTML', raccourci: `${MOD}+Shift+E`, executer: doExportHtml },
  { id: 'export:imprimer', titre: 'Imprimer', raccourci: `${MOD}+P`, executer: doPrint },
  { id: 'vue:code', titre: 'Afficher ou masquer le volet code', raccourci: `${MOD}+/`, executer: () => { toggleEditor.checked = !toggleEditor.checked; toggleEditor.dispatchEvent(new Event('change')); } },
  { id: 'vue:theme', titre: 'Basculer le thème clair ou sombre', raccourci: `${MOD}+T`, executer: () => document.getElementById('btn-theme').click() },
  { id: 'vue:panneau', titre: 'Afficher ou masquer le panneau latéral', executer: () => document.getElementById('btn-sidebar').click() },
  { id: 'vue:continu', titre: 'Affichage continu', executer: () => choisirModeAffichage('continu') },
  { id: 'vue:a4', titre: 'Affichage A4, une page', executer: () => choisirModeAffichage('a4') },
  { id: 'vue:a4-double', titre: 'Affichage A4, deux pages côte à côte', executer: () => choisirModeAffichage('a4-double') },
  { id: 'fichier:enregistrer-sous', titre: 'Enregistrer sous…', raccourci: `${MOD}+Shift+S`, executer: () => saveFile({ sous: true }) },
  { id: 'fichier:dupliquer', titre: 'Dupliquer le document dans un nouvel onglet', executer: dupliquerDocument },
  { id: 'vue:theme-clair', titre: 'Thème clair', executer: () => reglages.set('theme', 'clair') },
  { id: 'vue:theme-sombre', titre: 'Thème sombre', executer: () => reglages.set('theme', 'sombre') },
  { id: 'vue:theme-systeme', titre: 'Thème du système', executer: () => reglages.set('theme', 'systeme') },
  { id: 'vue:editeur-seul', titre: 'Éditeur seul', executer: () => definirDisposition('editeur') },
  { id: 'vue:apercu-seul', titre: 'Aperçu seul', executer: () => definirDisposition('apercu') },
  { id: 'vue:deux', titre: 'Éditeur et aperçu côte à côte', executer: () => definirDisposition('deux') },
  { id: 'vue:barre-outils', titre: 'Afficher ou masquer la barre d’outils de mise en forme', executer: () => reglages.set('barreOutils', !reglages.get('barreOutils')) },
]) window.commands.register(c);

// Copie du document actif dans un nouvel onglet non enregistré « Copie de … ».
function dupliquerDocument() {
  if (!activeTab || !editor) return;
  const contenu = editor.getValue();
  const t = newTab({ content: contenu, titre: 'Copie de ' + nomOnglet(activeTab) });
  markDirty();
  return t;
}

// Disposition des volets : éditeur seul, aperçu seul, ou les deux.
function definirDisposition(mode) {
  reglages.set('voletCode', mode !== 'apercu');
  mainEl.classList.toggle('no-preview', mode === 'editeur');
  if (mode !== 'apercu') paginer();
}

// ---------- Mode focus ----------
// Volontairement non mémorisé : on entre en mode focus pour une session de
// travail, pas pour toujours.
function basculerFocus(actif) {
  const veut = actif === undefined ? !document.body.classList.contains('focus') : actif;
  document.body.classList.toggle('focus', veut);
}

window.commands.register({
  id: 'vue:focus',
  titre: 'Mode focus (masquer l’habillage)',
  executer: () => basculerFocus(),
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Un Échap par couche, la plus interne d'abord. La palette gère son propre
  // Échap sur son champ (avec stopPropagation) : si l'événement arrive
  // jusqu'ici, c'est qu'elle n'avait pas le focus. La modale PDF est la
  // couche suivante — sans ce cas, Échap en mode focus quittait le mode focus
  // et faisait réapparaître l'habillage derrière une modale restée ouverte.
  if (window.mdr.reglagesUI.estOuvert()) {
    e.stopPropagation();
    window.mdr.reglagesUI.fermer();
    return;
  }
  if (window.mdr.aideUI && window.mdr.aideUI.estOuvert()) {
    e.stopPropagation();
    window.mdr.aideUI.fermer();
    return;
  }
  if (!pdfModal.classList.contains('hidden')) {
    e.stopPropagation();
    hidePdfModal();
    return;
  }
  // Ici on ne fait rien de plus pour éviter qu'un seul Échap ferme deux
  // couches à la fois.
  // Le mode focus et les deux modes de présentation (aperçu plein écran,
  // éditeur sans distraction) se quittent de la même façon.
  if (paletteEl.classList.contains('hidden') && window.mdr.modes.actif()) {
    window.mdr.modes.sortir();
  }
});

// ---------- Export par lot ----------
// Deux extensions markdown différentes peuvent viser le même PDF (nom.md et
// nom.markdown) : la seconde écraserait la première en silence, et le message
// final mentirait sur le nombre de PDF réellement écrits. On détecte la
// collision avant de commencer — le premier nom rencontré gagne, les
// suivants visant le même PDF sont ignorés et comptés comme conflits.
function detecterConflitsLot(fichiers) {
  const cibles = new Set();
  const aTraiter = [];
  let conflits = 0;
  for (const nom of fichiers) {
    const pdf = nom.replace(/\.[^.]+$/, '.pdf');
    if (cibles.has(pdf)) { conflits += 1; continue; }
    cibles.add(pdf);
    aTraiter.push(nom);
  }
  return { aTraiter, conflits };
}

// Un seul onglet de travail pour tout le lot, réutilisé pour chaque fichier
// (son `path` et son contenu sont tenus à jour, dont `resolveLocalImages()`
// et `baseTag()` ont besoin pour résoudre les images relatives au bon
// dossier) — sinon un dossier de trente fichiers laisserait trente onglets
// derrière lui, l'onglet actif final noyant le document de l'utilisateur.
// Il est fermé à la fin, y compris en cas d'erreur, et la main revient à
// l'onglet d'origine. Un fichier en échec n'interrompt pas le lot, il est
// compté.
//
// Réentrance : rien dans l'interface n'empêchait un second appel pendant
// qu'un lot tournait déjà. L'onglet de travail et `activeTab` sont partagés
// par tout ce que la boucle appelle (buildPrintableHtml() lit
// `preview.innerHTML` après plusieurs `await`) : deux lots entrelacés se
// marchent dessus et un PDF peut recevoir le contenu d'un autre fichier,
// sans qu'aucun compteur ne le voie. Un second appel doit donc refuser de
// démarrer, et le dire.
let lotEnCours = false;
// L'onglet de travail vise successivement chaque fichier source du lot :
// l'enregistrement automatique (markDirty()/scheduleAutosave()) et la
// fermeture d'onglet (closeTab(), y compris via Cmd+W) le vérifient pour se
// suspendre pendant sa durée de vie.
let tabDuLot = null;

async function exporterLot() {
  if (lotEnCours) {
    annoncerLot('Un export par lot est déjà en cours');
    return;
  }
  lotEnCours = true;
  try {
    // Le lot relit chaque fichier depuis le disque : des modifications non
    // enregistrées dans un onglet quelconque seraient ignorées en silence par
    // le PDF produit. On refuse donc de démarrer plutôt que de diverger
    // silencieusement entre ce que l'utilisateur voit et ce qui est écrit.
    if (tabs.some((t) => t.dirty)) {
      annoncerLot('Enregistrez les modifications en cours avant un export par lot');
      return;
    }
    const choix = await window.api.listMarkdown();
    if (!choix) return;
    const { dossier, fichiers } = choix;
    if (!fichiers.length) {
      annoncerLot('Aucun fichier markdown dans ce dossier');
      return;
    }
    // Un chemin Windows est reconnaissable à son antislash ; sinon, `/`.
    const separateur = dossier.includes('\\') ? '\\' : '/';
    const { aTraiter, conflits } = detecterConflitsLot(fichiers);
    const options = readPdfOptions();
    const tabOrigine = activeTab;
    const tabTravail = newTab({});
    tabDuLot = tabTravail;
    let faits = 0;
    let echecs = 0;
    let remplaces = 0;
    // La spec promet des échecs « comptés et signalés » : un `catch` muet ne
    // signale rien. On journalise le fichier et l'erreur, et on nomme le
    // premier fichier fautif dans le message final — le seul qu'un
    // utilisateur pressé lira vraiment.
    let premierEchec = null;
    try {
      for (const [i, nom] of aTraiter.entries()) {
        annoncerLot(`Export ${i + 1}/${aTraiter.length} : ${nom}`);
        try {
          const chemin = dossier + separateur + nom;
          const { content } = await window.api.readFile(chemin);
          tabTravail.path = chemin;
          tabTravail.content = content;
          setActiveTab(tabTravail);
          const html = await buildPrintableHtml(options);
          const resultat = await window.api.exportPdfTo({
            html, chemin: chemin.replace(/\.[^.]+$/, '.pdf'), options,
          });
          if (resultat && resultat.remplace) remplaces += 1;
          faits += 1;
        } catch (erreur) {
          console.error(`Export par lot : échec sur ${nom}`, erreur);
          if (!premierEchec) premierEchec = nom;
          echecs += 1;
        }
      }
    } finally {
      tabDuLot = null;
      const i = tabs.indexOf(tabTravail);
      if (i !== -1) tabs.splice(i, 1);
      if (tabOrigine && tabs.includes(tabOrigine)) {
        setActiveTab(tabOrigine);
      } else if (tabs.length) {
        setActiveTab(tabs[tabs.length - 1]);
      } else {
        activeTab = null;
        suppressChange = true; editor.setValue(''); suppressChange = false;
        preview.innerHTML = '';
        fileNameEl.textContent = 'Sans titre';
        renderTabs();
        // Minor 5 : cette branche court-circuite setActiveTab(), qui est le
        // seul endroit qui rappelle sinon watchFile() — sans cet appel, le
        // processus principal continuait de surveiller le dernier fichier
        // du lot alors qu'aucun onglet ne le représente plus.
        window.api.watchFile(null);
      }
    }

    const dossierNom = dossier.split(separateur).pop();
    if (!remplaces && !echecs && !conflits) {
      annoncerLot(`${faits} PDF écrits dans ${dossierNom}`);
    } else {
      const morceaux = [`${faits} PDF écrits`];
      if (remplaces) morceaux.push(`${remplaces} remplacés`);
      if (echecs) morceaux.push(`${echecs} en échec (dont ${premierEchec})`);
      if (conflits) morceaux.push(`${conflits} ignorés (conflit de nom)`);
      annoncerLot(morceaux.join(', '));
    }
  } finally {
    lotEnCours = false;
  }
}

window.commands.register({
  id: 'export:lot',
  titre: 'Exporter tout un dossier en PDF',
  executer: exporterLot,
});

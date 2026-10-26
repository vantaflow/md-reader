# 📕 MD Reader

> Éditeur Markdown de bureau, multi-plateforme (macOS & Windows), avec aperçu en temps réel, export **PDF**, **HTML** & **Word**, coloration syntaxique, **KaTeX**, **Mermaid** et thème clair/sombre.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)
![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron&logoColor=white)
![CodeMirror](https://img.shields.io/badge/CodeMirror-6-d30707)
![License](https://img.shields.io/badge/license-MIT-green)
![Telemetry](https://img.shields.io/badge/télémétrie-aucune-brightgreen)

Construit avec [Electron](https://www.electronjs.org/) + [CodeMirror 6](https://codemirror.net/) + [marked](https://marked.js.org/) + [highlight.js](https://highlightjs.org/) + [KaTeX](https://katex.org/) + [Mermaid](https://mermaid.js.org/).

---

## 📑 Sommaire

- [Fonctionnalités](#-fonctionnalités)
- [Aperçu de l'interface](#-aperçu-de-linterface)
- [Lecteur Markdown par défaut](#-lecteur-markdown-par-défaut)
- [Préférences mémorisées](#-préférences-mémorisées)
- [Raccourcis clavier](#️-raccourcis-clavier)
- [Installation](#-installation)
- [Depuis les sources — macOS](#-installation-sur-macos-depuis-les-sources)
- [Depuis les sources — Windows](#-installation-sur-windows-depuis-les-sources)
- [Releases automatiques (CI)](#-releases-automatiques-ci)
- [Architecture](#️-architecture)
- [Scripts npm](#️-scripts-npm)
- [Dépannage](#-dépannage)
- [Licence](#-licence) · [Contribuer](#-contribuer)

---

## ✨ Fonctionnalités

### Édition
- **Éditeur CodeMirror 6** : coloration Markdown, numéros de ligne, pliage de titres, multi-curseurs, recherche intégrée (`Cmd/Ctrl+F`)
- **Barre de mise en forme** au-dessus de l'éditeur : gras, italique, barré, titres 1 à 3, listes à puces, numérotées et de tâches, lien, image, tableau, bloc de code, citation, saut de page. Les mêmes actions existent dans le menu **Format**, dans la palette et au clavier ; la barre se masque dans les réglages ou le menu Affichage
- **Raccourcis de formatage** : gras (`Cmd/Ctrl+B`), italique (`I`), souligné (`U`), lien (`K`), barré (`Shift+X`), titres (`Alt+1` à `Alt+3`), listes (`Shift+8` / `7` / `9`), image (`Shift+I`), tableau (`Alt+T`), bloc de code (`Alt+C`), citation (`Shift+.`), saut de page (`Entrée`)
- **Images collées ou glissées** : une capture collée ou une image déposée dans l'éditeur est copiée dans un dossier `images/` à côté du document (nom horodaté, ou nom d'origine sans jamais écraser un fichier existant) et le lien `![](images/nom.png)` est inséré. Si le document n'est pas encore enregistré, l'application propose de l'enregistrer d'abord. Formats : PNG, JPEG, GIF, WebP, SVG, 25 Mo au plus ; l'écriture reste bornée au dossier du document
- **Fenêtre Réglages** (`Cmd/Ctrl+,`, menu, palette) : police, taille, retour à la ligne, numéros de ligne, tabulation et barre d'outils de l'éditeur ; mode d'affichage par défaut, police et taille de l'aperçu, marges des feuilles A4, thème clair / sombre / système ; valeurs par défaut de l'export PDF ; enregistrement automatique et son délai, synchronisation du défilement, réouverture des onglets au démarrage. Tout s'applique immédiatement
- **Palette de commandes** (`Cmd/Ctrl+Shift+P`) : toutes les actions de l'application, joignables au clavier, avec recherche floue
- **Mode focus** : masque l'habillage et centre le texte sur une largeur de lecture ; `Échap` en sort, ou ferme d'abord la palette de commandes si elle est ouverte
- **Aperçu seul plein écran** (`Cmd/Ctrl+Shift+F`) : éditeur, panneau et en-tête masqués, l'aperçu occupe toute la fenêtre
- **Éditeur seul sans distraction** (`Cmd/Ctrl+Shift+D`) : l'éditeur seul, centré, sans autre élément ; `Échap` quitte ces deux modes
- **Front-matter YAML** reconnu et masqué de l'aperçu (`--- title: … ---`)
- **Statistiques live** : nombre de mots, de caractères et temps de lecture estimé

### Écriture — arrive en 1.9.0
Ces fonctions sont développées pour la version 1.9.0 (pas encore publiée).
- **Éditeur de tableau visuel** (menu Format, barre de mise en forme, palette, `Cmd/Ctrl+Alt+Shift+T`) : une grille de cellules modifiables, ajout et suppression de lignes et de colonnes, alignement par colonne (gauche, centre, droite). Il s'ouvre sur le tableau Markdown sous le curseur (qu'il remplace, colonnes alignées, à « Appliquer ») ou en crée un nouveau
- **Reformater le Markdown** (menu Format, palette, `Cmd/Ctrl+Alt+Shift+F` pour le document, `Cmd/Ctrl+Alt+Shift+R` pour la sélection) : listes numérotées renumérotées, puces homogènes (`-`), tableaux alignés, espaces de fin retirés, lignes vides multiples réduites. Les blocs de code et le front-matter ne sont jamais touchés ; un saut de ligne forcé (deux espaces en fin de ligne, suivis d'une ligne de texte) est conservé. L'annulation (`Cmd/Ctrl+Z`) rétablit l'état d'avant
- **Emoji** : `:nom:` (environ 350 noms courants, à la GitHub) est proposé après `:xx` dans l'éditeur et converti dans l'aperçu et les exports, jamais dans le code ni dans un bloc de code ; le texte source reste `:nom:`
- **Liens vers les autres documents** : en tapant `](` ou `[[`, l'éditeur propose les `.md` du dossier ouvert (à défaut, du dossier du document) et insère le chemin relatif au document, ou le nom de la note. Le parcours est borné (4 niveaux, 500 fichiers, dossiers cachés et `node_modules` ignorés) et ne lit aucun contenu
- **Modèles de documents** (palette → « Nouveau depuis un modèle… ») : compte rendu de réunion, spécification fonctionnelle, README de projet, lettre ; un onglet non enregistré s'ouvre, daté du jour en français
- **Snippets** (palette → « Insérer un snippet… », « Enregistrer la sélection comme snippet… », « Supprimer un snippet… ») : textes réutilisables conservés dans un fichier `snippets.json` du dossier de données de l'application ; quelques exemples au premier lancement ; `{{date}}` est remplacé par la date du jour
- **Correcteur orthographique français et anglais** : le correcteur natif d'Electron souligne les fautes dans l'éditeur ; clic droit sur un mot souligné : suggestions du dictionnaire, « Ajouter au dictionnaire », puis couper, copier, coller. Le choix des langues (français, anglais, les deux, désactivé) est dans **Réglages → Général**, appliqué immédiatement. Sous macOS, le correcteur du système est utilisé : ses langues se gèrent dans les Réglages Système ; sous Windows et Linux, les dictionnaires se téléchargent au premier usage

### Aperçu
- **Aperçu live** rendu à chaque frappe, avec **défilement synchronisé** (activable/désactivable)
- **Coloration syntaxique** du code (highlight.js — ~45 langages courants)
- **Formules mathématiques** via KaTeX (`$inline$` et `$$block$$`)
- **Diagrammes Mermaid** (flowchart, séquence, Gantt, classe, état…)
- **Notes de bas de page** (`Texte[^1]` + `[^1]: la note`), rejetées en fin de document
- **Encadrés** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` — syntaxe GitHub et Obsidian, `:::note` également accepté
- **Sommaire** inséré dans le corps du document avec `[[toc]]` (titres 1 à 3)
- **Figures numérotées** : une image seule sur sa ligne devient une figure légendée par son texte alternatif, mais une image sans texte alternatif devient une simple figure sans légende ni numéro, une image décorative ne consommant pas de numéro de figure
- **Ancres stables** : les titres reçoivent un identifiant dérivé de leur texte, pas de leur position
- **Thème clair / sombre** (`Cmd/Ctrl+T`), appliqué à l'éditeur, l'aperçu et les diagrammes
- **Images locales** : les chemins relatifs sont résolus par rapport au fichier `.md`, pas à l'application
- **Saut de page manuel** : insérez `<!-- pagebreak -->` — affiché comme un repère dans l'aperçu, appliqué à l'impression
- **Affichage en pages A4** : l'aperçu s'affiche par défaut en feuilles A4 une par une ; il se lit aussi en continu ou deux feuilles côte à côte. Une liste ou un tableau plus long qu'une page se coupe d'une feuille à l'autre (en-tête du tableau repris, numérotation suivie). Les feuilles sont numérotées, respectent les sauts de page, gardent un titre avec le bloc qui le suit, et se mettent à l'échelle de la fenêtre. L'export n'en est pas affecté

### Gestion des fichiers
- **Onglets multiples** — plusieurs documents ouverts en parallèle, avec déduplication (un fichier déjà ouvert n'est pas rouvert en double, et un onglet vierge est réutilisé)
- **Explorateur de dossiers** avec arborescence repliable
- **Recherche plein-texte** dans tous les `.md` d'un dossier
- **Surveillance de fichier** : rechargement si le fichier est modifié hors de l'application
- **Enregistrement automatique** optionnel (délai réglable, 2 s par défaut)
- **Menus natifs complets** : Fichier (Ouvrir récent, Enregistrer sous…, Dupliquer, exports), Édition, Format, Affichage (modes d'affichage, thème, zoom de l'interface, panneau latéral, éditeur seul / aperçu seul, plein écran, focus), Fenêtre et Aide (aide-mémoire Markdown, raccourcis clavier, À propos avec la version)
- **Documents récents** : les 10 derniers, sous Fichier → Ouvrir récent, avec « Effacer la liste »
- **Onglets rouverts au démarrage** (réglage activable)
- **Ouverture depuis le système** : double-clic sur un `.md` dans le Finder / l'Explorateur, ou « Ouvrir avec »
- **Lecteur Markdown par défaut** en un clic (macOS) — voir plus bas

### Export & impression
- **Export PDF** : formats A4/Letter/Legal/A3/A5, portrait/paysage, marges réglables, en-tête personnalisé et numéros de page optionnels
- **Signets PDF** : la structure des titres devient un volet de navigation dans le lecteur, et le PDF est balisé, donc accessible
- **Sommaire paginé** : un `[[toc]]` exporté porte le numéro de page réel de chaque titre, lu dans le PDF lui-même plutôt que deviné
- **Liens internes cliquables** : les entrées du sommaire et les ancres du document restent navigables dans le PDF
- **Page de garde** optionnelle, composée depuis le front-matter (`title`, `subtitle`, `author`, `date`)
- **Filigrane** optionnel, répété sur chaque page
- **Saut de page avant chaque titre 1** et **numérotation automatique des titres** (`1.`, `1.2`, `1.2.3`…), en option
- **Pagination soignée** : jamais de titre orphelin en bas de page, ni de tableau, bloc de code, formule ou diagramme coupé en deux
- **Options mémorisées** d'un export à l'autre
- **Impression directe** (`Cmd/Ctrl+P`) vers l'imprimante système
- **Export Word (.docx)** : titres, paragraphes, gras / italique / code / liens, listes imbriquées, tableaux, images (locales ou intégrées), blocs de code, citations et filets ; menu Fichier ou palette « Exporter en Word (.docx) »
- **Export HTML** autonome : styles **et images** embarqués (data URI), le fichier reste lisible une fois envoyé à quelqu'un d'autre
- **Export par lot** : un dossier entier converti en PDF, un fichier à la fois, chaque PDF écrit à côté de son source. L'export refuse de démarrer si un onglet porte des modifications non enregistrées, pour ne jamais produire un PDF divergent de ce qui est affiché. Le message final compte les PDF écrits, ceux qui remplaçaient un PDF existant, et signale en conflit tout fichier dont le PDF cible était déjà pris par un autre (par exemple `note.md` et `note.markdown` visant le même `note.pdf` : le fichier gardé est celui qui vient en premier dans l'ordre alphabétique — ici `note.markdown` avant `note.md` — l'autre est ignoré et compté en conflit). Sa progression s'affiche dans la barre d'outils et dans une notification dédiée qui reste visible même en mode focus
- Les exports reprennent l'aperçu tel quel — KaTeX déjà composé, diagrammes déjà rendus en SVG

### Sécurité & confidentialité
- **Zéro télémétrie**, 100 % local — aucun appel réseau, aucune donnée ne quitte votre machine
- **Content Security Policy** stricte : un `.md` ouvert depuis l'extérieur ne peut ni exécuter de `<script>`, ni déclencher un `onerror=`, ni charger une ressource distante
- **Mermaid en `securityLevel: 'strict'`** : pas de HTML arbitraire dans les libellés de diagramme

---

## 🖥️ Aperçu de l'interface

**Barre d'outils (en-tête)**

| Bouton | Rôle |
|---|---|
| ☰ | Afficher / masquer le panneau latéral |
| 📄 Ouvrir | Ouvrir un fichier Markdown |
| 📁 Dossier | Ouvrir un dossier (explorateur + recherche) |
| 💾 Enregistrer | Enregistrer l'onglet courant |
| 📕 PDF | Exporter en PDF (ouvre les options) |
| 🌐 HTML | Exporter en HTML autonome |
| ⭐ Défaut | Définir MD Reader comme lecteur Markdown par défaut (macOS) |
| ☑ Code | Afficher / masquer le volet éditeur |
| ☑ Sync | Synchroniser le défilement éditeur ↔ aperçu |
| ☑ Autosave | Enregistrement automatique |
| Continu / A4 · 1 page / A4 · 2 pages | Mode d'affichage de l'aperçu |
| 🌓 | Basculer le thème clair / sombre |

Les réglages complets s'ouvrent avec `Cmd/Ctrl+,`.

**Panneau latéral** — sa largeur se règle en glissant son bord droit (double-clic pour revenir à la largeur par défaut). Trois onglets :

- **Menu** — table des matières navigable, générée depuis les titres du document
- **Fichiers** — arborescence du dossier ouvert
- **Recherche** — recherche plein-texte dans le dossier

---

## ⭐ Lecteur Markdown par défaut

MD Reader peut s'enregistrer comme application par défaut pour les fichiers Markdown (`.md`, `.markdown`, `.mdown`, `.mkd`).

- **macOS** : cliquez sur **⭐ Défaut** dans la barre d'outils (ou menu **Fichier → Définir comme lecteur Markdown par défaut**). L'app utilise `NSWorkspace.setDefaultApplication` via le compilateur Swift système — **aucune dépendance tierce**. Fonctionne uniquement sur **l'application installée** (pas en mode `npm start`).
- Une fois défini, un double-clic sur un `.md` dans le Finder ouvre le fichier dans un nouvel onglet.

> Les associations de fichiers sont déclarées dans `package.json` (`build.fileAssociations`) et, pour macOS, dans `build.mac.extendInfo.CFBundleDocumentTypes`.

---

## 💾 Préférences mémorisées

Ces réglages sont conservés d'une session à l'autre, dans un magasin unique (`localStorage`, clé `reglages`, migré depuis les anciennes clés) et modifiables dans la fenêtre Réglages. Les documents récents sont mémorisés à part, dans le dossier de données de l'application :

| Préférence | Défaut | Détail |
|---|---|---|
| Thème | Clair | Clair, sombre ou système |
| Volet **Code** | **Masqué** | L'app démarre en mode aperçu ; réafficher le volet le mémorise |
| **Panneau latéral** | Visible | Réductible via ☰, état retenu |
| Largeur du panneau | 240 px | Réglée en glissant son bord droit (140 px au minimum) |
| Mode d'affichage | A4 une page | Continu, A4 une page ou A4 deux pages |
| Éditeur | Police et taille, retour à la ligne, numéros de ligne, tabulation, barre d'outils | Voir Réglages → Éditeur |
| Aperçu | Police, taille, marges des feuilles A4 | Voir Réglages → Aperçu |
| Export PDF | Format, orientation, marges, numéros de page, page de garde, filigrane | La modale d'export s'ouvre pré-remplie |
| Général | Enregistrement automatique et délai, synchro du défilement, onglets rouverts | Voir Réglages → Général |

La fenêtre s'ouvre **maximisée** au démarrage.

---

## ⌨️ Raccourcis clavier

| Action | Raccourci |
|---|---|
| Réglages | `Cmd/Ctrl+,` |
| Nouvel onglet | `Cmd/Ctrl+N` |
| Ouvrir fichier | `Cmd/Ctrl+O` |
| Ouvrir dossier | `Cmd/Ctrl+Shift+O` |
| Enregistrer | `Cmd/Ctrl+S` |
| Enregistrer sous… | `Cmd/Ctrl+Shift+S` |
| Fermer onglet | `Cmd/Ctrl+W` |
| Export PDF | `Cmd/Ctrl+E` |
| Export HTML | `Cmd/Ctrl+Shift+E` |
| Imprimer | `Cmd/Ctrl+P` |
| Palette de commandes | `Cmd/Ctrl+Shift+P` |
| Basculer volet code | `Cmd/Ctrl+/` |
| Basculer thème | `Cmd/Ctrl+T` |
| Rechercher (dans l'éditeur) | `Cmd/Ctrl+F` |
| **Gras** | `Cmd/Ctrl+B` |
| *Italique* | `Cmd/Ctrl+I` |
| Lien | `Cmd/Ctrl+K` |
| Souligné | `Cmd/Ctrl+U` |
| Barré | `Cmd/Ctrl+Shift+X` |
| Titre 1 / 2 / 3 | `Cmd/Ctrl+Alt+1` / `2` / `3` |
| Liste à puces / numérotée / de tâches | `Cmd/Ctrl+Shift+8` / `7` / `9` |
| Image | `Cmd/Ctrl+Shift+I` |
| Tableau | `Cmd/Ctrl+Alt+T` |
| Bloc de code | `Cmd/Ctrl+Alt+C` |
| Citation | `Cmd/Ctrl+Shift+.` |
| Saut de page | `Cmd/Ctrl+Enter` |
| Éditeur de tableau (1.9.0) | `Cmd/Ctrl+Alt+Shift+T` |
| Reformater le document / la sélection (1.9.0) | `Cmd/Ctrl+Alt+Shift+F` / `R` |
| Aperçu seul plein écran | `Cmd/Ctrl+Shift+F` |
| Éditeur seul sans distraction | `Cmd/Ctrl+Shift+D` |
| Zoom de l'interface | `Cmd/Ctrl+Plus` / `-` / `0` |
| Outils de développement | `F12` (macOS : `Alt+Cmd+I`) |
| Quitter un mode plein écran, focus ou une modale | `Échap` |

La liste complète est aussi dans **Aide → Raccourcis clavier**, générée depuis la table unique `renderer/lib/raccourcis.js`.

---

## 📦 Installation

### Télécharger les binaires pré-construits

Les installateurs sont disponibles dans l'onglet [Releases](../../releases) du dépôt :

- **macOS** : `MD-to-PDF-<version>-arm64.dmg` (Apple Silicon) ou `MD-to-PDF-<version>-x64.dmg` (Intel)
- **Windows** : `MD-to-PDF-Setup-<version>.exe` (installateur NSIS)

### Pré-requis (build depuis les sources)

- [Node.js](https://nodejs.org/) **≥ 18** (recommandé 20 LTS)
- [Git](https://git-scm.com/)
- npm (inclus avec Node.js)

---

## 🍏 Installation sur macOS (depuis les sources)

```bash
# 1. Cloner le dépôt
git clone https://github.com/vantaflow/md-to-pdf-app.git
cd md-to-pdf-app

# 2. Installer les dépendances
npm install

# 3. Lancer en mode développement
npm start
```

### Construire un `.dmg` pour macOS

```bash
npm run build:mac
```

Le `.dmg` est produit dans `dist/` (versions `arm64` et `x64`).

> ℹ️ **Apple Silicon vs Intel** : le build génère les deux architectures. Installez celle correspondant à votre Mac (`arm64` pour M1/M2/M3/M4, `x64` pour Intel).

> ⚠️ **Gatekeeper** : l'application n'est pas signée avec un certificat Apple Developer. Au premier lancement, faites **clic droit → Ouvrir**, puis confirmez. Pour signer et notariser, définissez `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` avant `npm run build:mac`.

---

## 🪟 Installation sur Windows (depuis les sources)

```powershell
# 1. Cloner le dépôt
git clone https://github.com/vantaflow/md-to-pdf-app.git
cd md-to-pdf-app

# 2. Installer les dépendances
npm install

# 3. Lancer en mode développement
npm start
```

### Construire un installateur `.exe` pour Windows

```powershell
npm run build:win
```

L'installateur NSIS est produit dans `dist\MD-to-PDF-Setup-<version>.exe`.

> 💡 **Windows Defender SmartScreen** : l'installateur n'étant pas signé, SmartScreen peut afficher un avertissement. Cliquez sur **Informations complémentaires → Exécuter quand même**. Pour signer, définissez `CSC_LINK` et `CSC_KEY_PASSWORD` avant le build.

> ℹ️ **Build cross-platform** : le build Windows est à exécuter sur Windows, le build macOS sur un Mac.

---

## 🚀 Releases automatiques (CI)

Un workflow **GitHub Actions** ([`.github/workflows/release.yml`](.github/workflows/release.yml)) construit et publie automatiquement les installateurs (DMG macOS + NSIS Windows) à chaque tag de version.

```bash
# Bump de version dans package.json, puis :
git tag v<version>      # la même que celle de package.json, sans quoi la release ment
git push origin v<version>
```

Le push d'un tag `v*` déclenche le build multi-OS et attache les artefacts à la Release GitHub correspondante.

---

## 🏗️ Architecture

```
md-to-pdf-app/
├── main.js                     # Process principal Electron (IPC, fenêtres, export PDF/HTML/Word,
│                               #   ouverture système, documents récents, lecteur par défaut)
├── menu.js                     # Gabarit des menus natifs et liste des documents récents (sans Electron)
├── images.js                   # Enregistrement borné des images collées dans images/ (sans Electron)
├── contexte.js                 # Menu contextuel et langues du correcteur orthographique (sans Electron)
├── donnees.js                  # Snippets (snippets.json) et liste bornée des .md d'un dossier (sans Electron)
├── preload.js                  # Bridge contextIsolation entre main et renderer
├── pdf.js                      # Options de rendu, lecture des destinations d'un PDF,
│                               #   remplissage des numéros de page (sans Electron)
├── renderer/
│   ├── index.html              # Shell de l'UI
│   ├── styles.css              # Thèmes clair/sombre, layout en grille
│   ├── commands.js             # Registre des commandes lu par la palette (boutons/menus/accélérateurs restent câblés séparément)
│   ├── lib/                    # Logique pure, testable sans Electron :
│   │   ├── settings.js         #   magasin des réglages (valeurs par défaut, migration, onChange)
│   │   ├── raccourcis.js       #   table unique des raccourcis (menus, aide, éditeur)
│   │   ├── format.js           #   mise en forme Markdown (gras, titres, listes, tableau…)
│   │   ├── tableau.js          #   tableaux GFM : analyse, sérialisation alignée, repérage (1.9.0)
│   │   ├── reformat.js         #   reformatage du Markdown (1.9.0)
│   │   ├── emoji.js            #   table des emoji :nom:, suggestions, remplacement (1.9.0)
│   │   ├── liens.js            #   chemins relatifs et noms de notes pour les liens (1.9.0)
│   │   ├── modeles.js          #   modèles de documents (1.9.0)
│   │   └── snippets.js         #   snippets : assainissement, ajout, suppression (1.9.0)
│   ├── features/               # Fonctions de l'interface, chargées avant renderer.js :
│   │   ├── reglages.js         #   fenêtre Réglages
│   │   ├── format.js           #   commandes Format et barre d'outils
│   │   ├── aide.js             #   aide-mémoire, raccourcis, À propos
│   │   ├── export-docx.js      #   export Word
│   │   ├── modes.js            #   aperçu seul plein écran, éditeur sans distraction
│   │   ├── images.js           #   images collées ou glissées
│   │   ├── modale.js           #   modales génériques : fenêtre, saisie, choix dans une liste (1.9.0)
│   │   ├── tableau.js          #   éditeur de tableau visuel (1.9.0)
│   │   ├── reformat.js         #   commandes de reformatage (1.9.0)
│   │   ├── liens.js            #   propositions de liens vers les .md (1.9.0)
│   │   ├── modeles.js          #   Nouveau depuis un modèle (1.9.0)
│   │   ├── snippets.js         #   Insérer, enregistrer, supprimer un snippet (1.9.0)
│   │   └── correcteur.js       #   réglage du correcteur orthographique (1.9.0)
│   ├── docx-src.js             # Conversion HTML vers .docx (bibliothèque docx, bundlée par esbuild)
│   ├── docx-bundle.js          # Bundle généré (ignoré par git)
│   ├── editor-src.js           # Source CodeMirror 6 (bundlée par esbuild)
│   ├── editor-bundle.js        # Bundle généré (ignoré par git)
│   ├── markdown/               # Moteur de rendu : parse.js, enhance.js, labels.js, icons.js
│   ├── markdown-src.js         # Entrée navigateur du moteur (bundlée par esbuild)
│   ├── markdown-bundle.js      # Bundle généré (ignoré par git)
│   └── renderer.js             # Logique UI : onglets, aperçu, marked, mermaid, katex,
│                               #   TOC, recherche, préférences
├── build/
│   ├── icon.html               # Source de l'icône (SVG)
│   ├── make-icon.js            # Rend l'icône en PNG 1024 via Electron
│   ├── icon.png / icon.icns    # Icônes consommées par electron-builder
├── test/markdown.test.js       # Tests unitaires du moteur Markdown, sans Electron
├── test/pdf.test.js            # Tests unitaires de la chaîne PDF, sans Electron
├── test/packaging.test.js      # Cohérence du manifeste et du verrou de dépendances
├── test/settings.test.js       # Réglages : défauts, migration, validation
├── test/format.test.js         # Mise en forme Markdown
├── test/menu.test.js           # Menus, raccourcis, documents récents
├── test/images.test.js         # Images collées : noms, collisions, écriture bornée
├── test/tableau.test.js        # Tableaux GFM (1.9.0)
├── test/reformat.test.js       # Reformatage Markdown (1.9.0)
├── test/ecriture.test.js       # Emoji (table, rendu) et liens relatifs (1.9.0)
├── test/modeles-snippets.test.js # Modèles, snippets, menu contextuel, liste des .md (1.9.0)
├── test/helpers.js             # Aide commune aux tests Electron (fenêtre invisible, check)
├── test/smoke.js               # Test de fumée end-to-end, sous Electron
├── test/smoke-lot1.js          # Réglages, menus, barre de mise en forme, préférences
├── test/smoke-docx.js          # Export Word
├── test/smoke-focus.js         # Modes aperçu seul et éditeur sans distraction
├── test/smoke-images.js        # Images collées et glissées
├── test/smoke-lot2a.js         # Écriture 1.9.0 : tableau, reformatage, emoji, liens, modèles, snippets, correcteur
├── .github/workflows/ci.yml        # CI : test de fumée macOS / Linux / Windows
├── .github/workflows/release.yml   # CI : build & publication des installateurs
├── installer.iss               # Script Inno Setup (installateur Windows alternatif)
├── package.json                # Dépendances, scripts, config electron-builder
└── dist/                       # Sorties de build (ignorées par git)
```

**Flux d'export PDF**
1. Le renderer produit le HTML final (marked + highlight.js + KaTeX + Mermaid rendu en SVG).
2. Le main process écrit ce HTML dans un fichier temporaire et le charge dans une
   `BrowserWindow` cachée — un document `file://` peut atteindre les polices KaTeX
   et les images référencées par le markdown, ce qu'une URL `data:` ne peut pas.
3. `webContents.printToPDF()` génère le PDF via le moteur d'impression intégré de Chromium,
   avec les signets et le balisage d'accessibilité.
4. **Si le document porte un `[[toc]]`, une seconde passe a lieu.** Un numéro de page ne se
   déduit pas du DOM : `offsetTop` se trompe dès qu'une règle de pagination déplace un
   élément. Le PDF, lui, porte la réponse dans sa table de destinations. `pdf.js` la lit,
   remplit les emplacements du sommaire, et le document est rendu une seconde fois. Sans
   sommaire, la passe est sautée et l'export garde son coût d'origine.
5. Le fichier est écrit puis révélé dans le Finder / l'Explorateur.

L'impression (`Cmd/Ctrl+P`) suit le même chemin de mesure avant d'envoyer le document à la
boîte d'impression système, pour que son sommaire porte lui aussi ses numéros de page.

**Ouverture depuis le système**
- macOS envoie l'évènement `open-file` (double-clic / « Ouvrir avec »), parfois avant que le renderer soit prêt : les chemins sont mis en **file d'attente** puis rejoués une fois la fenêtre chargée.
- Une **instance unique** est garantie ; les fichiers d'un second lancement sont routés vers la fenêtre existante.

---

## 🛠️ Scripts npm

| Script | Description |
|---|---|
| `npm start` | Bundle le renderer + lance l'app en dev |
| `npm run bundle` | Bundle `renderer/editor-src.js`, `renderer/markdown-src.js` et `renderer/docx-src.js` vers `editor-bundle.js`, `markdown-bundle.js` et `docx-bundle.js` (esbuild, minifié) |
| `npm test` | Tests unitaires (moteur Markdown, chaîne PDF, empaquetage, réglages, mise en forme, menus, images ; `node --test`, sans Electron) puis tests de fumée end-to-end sous Electron (`smoke`, `smoke-lot1`, `smoke-docx`, `smoke-focus`, `smoke-images`), tous sans fenêtre visible |
| `npm run build` | Build des installateurs pour la plateforme courante |
| `npm run build:mac` | Build `.dmg` (arm64 + x64) |
| `npm run build:win` | Build installateur NSIS |

> 💡 Pour un build local rapide sans générer de `.dmg`/`.exe` : `npm run bundle && npx electron-builder --mac --dir` (produit l'app dans `dist/mac-arm64/`).

---

## 🐛 Dépannage

**`npm install` échoue sur `node-gyp` / binaires natifs**
→ macOS : `xcode-select --install`. Windows : installer les [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

**L'app s'ouvre en blanc au démarrage**
→ Vérifiez que `npm run bundle` a bien généré `renderer/editor-bundle.js`, puis relancez `npm start`.

**Export PDF vide ou mal rendu**
→ Ouvrez les DevTools (`F12`, ou `Alt+Cmd+I` sous macOS) et vérifiez la console de l'aperçu. Les ressources KaTeX/Mermaid doivent être chargées.

**Le bouton ⭐ Défaut ne fait rien / renvoie une erreur**
→ La fonction n'est disponible que sur **l'application installée** (pas en `npm start`). Sur macOS, autorisez l'app dans **Réglages Système → Confidentialité et sécurité** si Gatekeeper l'a bloquée.

**Erreur `electron-builder` lors d'un build cross-platform**
→ Construisez chaque cible sur sa plateforme native (DMG sur macOS, NSIS sur Windows).

---

## 📄 Licence

[MIT](./LICENSE) © 2026 vantaflow

---

## 🤝 Contribuer

Les PR sont bienvenues. Pour les changements importants, ouvrez d'abord une issue pour discuter de la proposition.

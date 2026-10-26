// Menu contextuel et langues du correcteur orthographique, isolés de main.js
// pour être testables : ce module ne touche ni à Electron ni au disque. Il
// reçoit les paramètres de l'événement `context-menu` de webContents et renvoie
// un gabarit pour Menu.buildFromTemplate.

const MAX_SUGGESTIONS = 5;

// Réglage « Correcteur orthographique » -> codes de langue d'Electron.
const LANGUES = {
  aucun: [],
  fr: ['fr'],
  en: ['en-US'],
  'fr-en': ['fr', 'en-US'],
};

function languesCorrecteur(choix) {
  return Object.prototype.hasOwnProperty.call(LANGUES, choix) ? LANGUES[choix].slice() : LANGUES['fr-en'].slice();
}

// `params` : paramètres de `context-menu` (isEditable, selectionText,
// misspelledWord, dictionarySuggestions, editFlags). `actions` : { remplacer(mot),
// ajouterAuDictionnaire(mot) }. Renvoie [] quand il n'y a rien à proposer.
function creerTemplateContexte(params, actions = {}) {
  const p = params || {};
  const flags = p.editFlags || {};
  const modifiable = !!p.isEditable;
  const aSelection = !!(p.selectionText && String(p.selectionText).trim());
  const items = [];

  if (modifiable && typeof p.misspelledWord === 'string' && p.misspelledWord) {
    const suggestions = (Array.isArray(p.dictionarySuggestions) ? p.dictionarySuggestions : [])
      .filter((s) => typeof s === 'string' && s).slice(0, MAX_SUGGESTIONS);
    if (suggestions.length) {
      for (const s of suggestions) items.push({ label: s, click: () => actions.remplacer && actions.remplacer(s) });
    } else {
      items.push({ label: 'Aucune suggestion', enabled: false });
    }
    items.push({ type: 'separator' });
    items.push({
      label: 'Ajouter au dictionnaire',
      click: () => actions.ajouterAuDictionnaire && actions.ajouterAuDictionnaire(p.misspelledWord),
    });
    items.push({ type: 'separator' });
  }

  if (modifiable) {
    items.push(
      { label: 'Couper', role: 'cut', enabled: flags.canCut !== false },
      { label: 'Copier', role: 'copy', enabled: flags.canCopy !== false },
      { label: 'Coller', role: 'paste', enabled: flags.canPaste !== false },
      { type: 'separator' },
      { label: 'Tout sélectionner', role: 'selectAll', enabled: flags.canSelectAll !== false },
    );
  } else if (aSelection) {
    items.push({ label: 'Copier', role: 'copy' });
  }
  return items;
}

// Applique le réglage du correcteur à une session Electron (injectée, ce module
// n'importe pas Electron). Seules les langues proposées par la session sont
// retenues ; sans liste connue (macOS : correcteur du système, dont les langues
// se règlent dans les Préférences Système), la demande est transmise telle
// quelle. Renvoie les langues demandées à la session.
function appliquerLanguesCorrecteur(session, choix) {
  const demandees = languesCorrecteur(choix);
  const dispo = session.availableSpellCheckerLanguages || [];
  const retenues = dispo.length ? demandees.filter((l) => dispo.includes(l)) : demandees;
  try { session.setSpellCheckerLanguages(retenues); } catch { /* langue indisponible : ignorée */ }
  return retenues;
}

// Branche le menu contextuel sur un webContents : gabarit construit par
// creerTemplateContexte, affiché par `Menu` (injecté, comme `fenetre()`).
function brancherMenuContextuel(contenu, { Menu, fenetre }) {
  contenu.on('context-menu', (_e, params) => {
    const gabarit = creerTemplateContexte(params, {
      remplacer: (mot) => contenu.replaceMisspelling(mot),
      ajouterAuDictionnaire: (mot) => contenu.session.addWordToSpellCheckerDictionary(mot),
    });
    if (gabarit.length) Menu.buildFromTemplate(gabarit).popup({ window: fenetre ? fenetre() || undefined : undefined });
  });
}

module.exports = { creerTemplateContexte, languesCorrecteur, appliquerLanguesCorrecteur, brancherMenuContextuel, LANGUES, MAX_SUGGESTIONS };

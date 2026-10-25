// Tests du magasin de réglages (renderer/lib/settings.js), sans Electron.
const test = require('node:test');
const assert = require('node:assert/strict');
const { creer, DEFAUTS, CLE } = require('../renderer/lib/settings.js');

// Un localStorage minimal en mémoire.
function stockage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

test('valeurs par défaut pour tous les réglages de la spec', () => {
  const s = creer(stockage());
  for (const cle of [
    'policeEditeur', 'tailleEditeur', 'retourLigne', 'numerosLigne', 'tabulation', 'barreOutils',
    'modeDefaut', 'policeApercu', 'tailleApercu', 'margeA4Haut', 'margeA4Cotes', 'margeA4Bas', 'theme',
    'pdfFormat', 'pdfPaysage', 'pdfMarge', 'pdfNumerosPage', 'pdfPageGarde', 'pdfFiligrane',
    'autosave', 'delaiAutosave', 'synchroDefilement', 'rouvrirOnglets',
  ]) {
    assert.ok(cle in DEFAUTS, `défaut manquant : ${cle}`);
    assert.deepEqual(s.get(cle), DEFAUTS[cle]);
  }
  assert.equal(s.get('modeDefaut'), 'a4');
  assert.equal(s.get('theme'), 'clair');
});

test('set mémorise sous la clé reglages et get relit', () => {
  const st = stockage();
  const s = creer(st);
  s.set('tailleEditeur', 18);
  assert.equal(s.get('tailleEditeur'), 18);
  assert.equal(JSON.parse(st.getItem(CLE)).tailleEditeur, 18);
  assert.equal(creer(st).get('tailleEditeur'), 18);
});

test('onChange notifie, et se désabonne', () => {
  const s = creer(stockage());
  const vus = [];
  const stop = s.onChange((cle, val, ancienne) => vus.push([cle, val, ancienne]));
  s.set('autosave', true);
  s.set('autosave', true); // inchangé : pas de notification
  stop();
  s.set('autosave', false);
  assert.deepEqual(vus, [['autosave', true, false]]);
});

test('une valeur de mauvais type est refusée', () => {
  const s = creer(stockage());
  assert.throws(() => s.set('tailleEditeur', 'grand'));
  assert.throws(() => s.set('inconnu', 1));
  assert.equal(s.get('tailleEditeur'), 14);
});

test('un JSON corrompu retombe sur les valeurs par défaut', () => {
  const s = creer(stockage({ reglages: '{pas du json' }));
  assert.equal(s.get('tailleEditeur'), 14);
});

test('migration depuis les anciennes clés', () => {
  const st = stockage({
    theme: 'dark',
    modeAffichage: 'a4-double',
    codePaneVisible: 'true',
    sidebarVisible: 'false',
    largeurPanneau: '300',
    pdfOptions: JSON.stringify({
      'pdf-page-size': 'Letter', 'pdf-landscape': 'true', 'pdf-margin': '1',
      'pdf-header-footer': false, 'pdf-cover': true, 'pdf-watermark': 'BROUILLON',
    }),
  });
  const s = creer(st);
  assert.equal(s.get('theme'), 'sombre');
  assert.equal(s.get('modeDefaut'), 'a4-double');
  assert.equal(s.get('voletCode'), true);
  assert.equal(s.get('panneauLateral'), false);
  assert.equal(s.get('largeurPanneau'), 300);
  assert.equal(s.get('pdfFormat'), 'Letter');
  assert.equal(s.get('pdfPaysage'), true);
  assert.equal(s.get('pdfMarge'), 1);
  assert.equal(s.get('pdfNumerosPage'), false);
  assert.equal(s.get('pdfPageGarde'), true);
  assert.equal(s.get('pdfFiligrane'), 'BROUILLON');
  // La migration est écrite : un second chargement relit `reglages`.
  assert.ok(st.getItem(CLE));
});

test('la migration ne repasse pas une fois reglages écrit', () => {
  const st = stockage({ theme: 'dark' });
  creer(st).set('tailleEditeur', 20);
  st.setItem('theme', 'light'); // ancienne clé modifiée après coup : ignorée
  assert.equal(creer(st).get('theme'), 'sombre');
});

test('reinitialiser remet les défauts', () => {
  const s = creer(stockage());
  s.set('tailleEditeur', 20);
  s.reinitialiser();
  assert.equal(s.get('tailleEditeur'), 14);
});

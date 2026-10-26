const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../remplacement.js');

const occ = (contenu, params) => {
  const c = r.construireRegex(params);
  assert.ok(c.re, JSON.stringify(c));
  return r.trouverOccurrences(contenu, c.re, params);
};

test('remplacement : recherche littérale, insensible à la casse par défaut', () => {
  const { occurrences } = occ('Chat chat CHAT\nchaton', { recherche: 'chat', remplacement: 'chien' });
  assert.equal(occurrences.length, 4);
  assert.deepEqual(occurrences.map((o) => o.ligne), [1, 1, 1, 2]);
  assert.equal(occurrences[0].avant, 'Chat chat CHAT');
  assert.equal(occurrences[0].apres, 'chien chat CHAT');
  assert.equal(occurrences[3].apres, 'chienon');
});

test('remplacement : option casse', () => {
  assert.equal(occ('Chat chat CHAT', { recherche: 'chat', casse: true }).occurrences.length, 1);
});

test('remplacement : les caractères spéciaux sont littéraux hors mode regex', () => {
  const { occurrences } = occ('a.b a+b (x) a-b', { recherche: 'a.b', remplacement: '$&!' });
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].remplace, '$&!');
  assert.equal(occ('1+1 (x) a-b [y]', { recherche: '(x)' }).occurrences.length, 1);
  assert.equal(occ('a-b', { recherche: 'a-b' }).occurrences.length, 1);
});

test('remplacement : mot entier, y compris avec des lettres accentuées', () => {
  const { occurrences } = occ('chat chaton achat chat_x été-chat éteint', { recherche: 'chat', motEntier: true });
  assert.deepEqual(occurrences.map((o) => o.debut), [0, 29]);
  assert.equal(occ('été éteint', { recherche: 'été', motEntier: true }).occurrences.length, 1);
  assert.equal(occ('é-é aé-é', { recherche: 'é-é', motEntier: true }).occurrences.length, 1);
  assert.equal(occ('étés', { recherche: 'été', motEntier: true }).occurrences.length, 0);
});

test('remplacement : expression régulière avec groupes', () => {
  const { occurrences } = occ('2024-05-06 et 2023-01-02', { recherche: '(\\d{4})-(\\d{2})-(\\d{2})', remplacement: '$3/$2/$1', regex: true });
  assert.deepEqual(occurrences.map((o) => o.remplace), ['06/05/2024', '02/01/2023']);
  const nomme = occ('ab', { recherche: '(?<x>a)', remplacement: '[$<x>$$]', regex: true });
  assert.equal(nomme.occurrences[0].remplace, '[a$]');
});

test('remplacement : ^ et $ valent par ligne', () => {
  const { occurrences } = occ('a\nb\nc', { recherche: '^\\w$', remplacement: '- $&', regex: true });
  assert.equal(occurrences.length, 3);
  assert.equal(occurrences[1].apres, '- b');
});

test('remplacement : expressions invalides ou dangereuses renvoient une erreur sans lever', () => {
  for (const p of [
    { recherche: '(', regex: true },
    { recherche: '[a-', regex: true },
    { recherche: '*', regex: true },
    { recherche: '', regex: true },
    { recherche: 'a*', regex: true },
    { recherche: '^', regex: true },
    { recherche: 'x'.repeat(r.LIMITES.rechercheMax + 1) },
    { recherche: 'a', remplacement: 'x'.repeat(r.LIMITES.remplacementMax + 1) },
    null,
    undefined,
    { recherche: 42 },
  ]) {
    const c = r.construireRegex(p);
    assert.equal(typeof c.erreur, 'string', JSON.stringify(p));
    assert.equal(c.re, undefined);
  }
});

test('remplacement : une expression valide seulement sans le drapeau u est acceptée', () => {
  assert.equal(occ('a-b', { recherche: 'a\\-b', regex: true }).occurrences.length, 1);
});

test('remplacement : borne du nombre d’occurrences', () => {
  const c = r.construireRegex({ recherche: 'a' });
  const res = r.trouverOccurrences('a'.repeat(1000), c.re, {}, 10);
  assert.equal(res.occurrences.length, 10);
  assert.equal(res.tronque, true);
  assert.equal(r.trouverOccurrences('aaa', c.re, {}, 10).tronque, false);
});

test('remplacement : lignes très longues tronquées dans l’aperçu', () => {
  const { occurrences } = occ('x'.repeat(1000) + ' cible ' + 'y'.repeat(1000), { recherche: 'cible', remplacement: 'Z' });
  assert.ok(occurrences[0].avant.length <= r.LIMITES.contexteMax + 1);
});

test('remplacement : application sélective par indice', () => {
  const contenu = 'un chat, deux chats, trois chats\n';
  const params = { recherche: 'chat', remplacement: 'chien' };
  const { occurrences } = occ(contenu, params);
  assert.equal(r.appliquer(contenu, occurrences, [0, 2]).contenu, 'un chien, deux chats, trois chiens\n');
  assert.equal(r.appliquer(contenu, occurrences, []).contenu, contenu);
  assert.equal(r.appliquer(contenu, occurrences, [0, 1, 2]).remplacees, 3);
  assert.equal(r.appliquer(contenu, occurrences, [0, 1, 2]).contenu, 'un chien, deux chiens, trois chiens\n');
});

test('remplacement : les fins de ligne CRLF sont conservées', () => {
  const contenu = 'a chat\r\nb chat\r\n';
  const { occurrences } = occ(contenu, { recherche: 'chat', remplacement: 'x' });
  assert.equal(occurrences[0].avant, 'a chat');
  assert.equal(r.appliquer(contenu, occurrences, [0, 1]).contenu, 'a x\r\nb x\r\n');
});

test('remplacement : empreinte stable et sensible au contenu', () => {
  assert.equal(r.empreinte('abc'), r.empreinte('abc'));
  assert.notEqual(r.empreinte('abc'), r.empreinte('abd'));
});

test('remplacement : une expression catastrophique est interrompue (délai), sans geler', () => {
  const params = { recherche: '(a+)+$', remplacement: 'x', regex: true };
  const c = r.construireRegex(params);
  assert.ok(c.re);
  const t0 = Date.now();
  const res = r.trouverOccurrences('a'.repeat(40) + 'b', c.re, params, 500, 300);
  assert.ok(Date.now() - t0 < 3000, 'doit être interrompue rapidement');
  assert.equal(res.delaiDepasse, true);
  assert.deepEqual(res.occurrences, []);
});

test('remplacement : une expression ordinaire ne dépasse pas le délai', () => {
  const params = { recherche: 'chat', remplacement: 'chien' };
  const res = occ('chat chat', params);
  assert.equal(res.delaiDepasse, undefined);
  assert.equal(res.occurrences.length, 2);
});

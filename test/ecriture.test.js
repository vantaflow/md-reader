// Emoji :nom: (table, suggestions, rendu de l'aperçu hors code) et liens vers
// les autres documents (chemins relatifs, noms de notes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createParser } from '../renderer/markdown/parse.js';

const require = createRequire(import.meta.url);
const emoji = require('../renderer/lib/emoji.js');
const liens = require('../renderer/lib/liens.js');
const parse = createParser();

test('emoji : la table intégrée compte au moins 200 emoji courants', () => {
  assert.ok(emoji.NOMS.length >= 200, String(emoji.NOMS.length));
  for (const n of ['smile', 'tada', 'rocket', 'fire', '+1', 'warning', 'white_check_mark', 'heart', 'bulb']) assert.ok(emoji.existe(n), n);
  assert.equal(emoji.existe('constructor'), false);
  assert.equal(emoji.existe('__proto__'), false);
});

test('emoji : suggestions par préfixe puis par contenu, bornées', () => {
  const s = emoji.suggerer('sm');
  assert.ok(s.length >= 2 && s.every((x) => x.nom.includes('sm')));
  assert.equal(s[0].nom.startsWith('sm'), true);
  assert.deepStrictEqual(emoji.suggerer(':tad')[0], { nom: 'tada', emoji: '🎉' });
  assert.deepStrictEqual(emoji.suggerer(''), []);
  assert.ok(emoji.suggerer('e', 5).length <= 5);
});

test('emoji : remplacement hors blocs de code et code en ligne', () => {
  assert.equal(emoji.remplacer('Bravo :tada: et :inconnu: à 12:30:45'), 'Bravo 🎉 et :inconnu: à 12:30:45');
  assert.equal(emoji.remplacer('`:fire:` :fire:'), '`:fire:` 🔥');
  assert.equal(emoji.remplacer('```\n:fire:\n```\n:fire:'), '```\n:fire:\n```\n🔥');
});

test('aperçu : :nom: devient un emoji, pas dans le code', () => {
  assert.match(parse('Super :tada: !'), /<p>Super 🎉 !<\/p>/);
  assert.match(parse('`:fire:`'), /<code>:fire:<\/code>/);
  assert.match(parse('```\n:fire:\n```'), /:fire:/);
  assert.doesNotMatch(parse('```\n:fire:\n```'), /🔥/);
  assert.match(parse('**:rocket:** et :nope:'), /<strong>🚀<\/strong> et :nope:/);
  assert.match(parse('à 12:30:45 pile'), /12:30:45/);
});

test('liens : chemin relatif entre deux emplacements', () => {
  assert.equal(liens.cheminRelatif('/d/notes', '/d/notes/a.md'), 'a.md');
  assert.equal(liens.cheminRelatif('/d/notes', '/d/notes/sous/b.md'), 'sous/b.md');
  assert.equal(liens.cheminRelatif('/d/notes/sous', '/d/notes/a.md'), '../a.md');
  assert.equal(liens.cheminRelatif('/d/notes/x/y', '/d/autre/c.md'), '../../../autre/c.md');
  assert.equal(liens.cheminRelatif('C:\\Docs\\notes', 'c:\\docs\\Notes\\sous\\b.md'), 'sous/b.md');
  assert.equal(liens.cheminRelatif('C:\\Docs\\notes\\x', 'C:\\Docs\\a.md'), '../../a.md');
});

test('liens : adresse encodée et nom de note', () => {
  assert.equal(liens.versAdresse('mes notes/a (1).md'), 'mes%20notes/a%20%281%29.md');
  assert.equal(liens.nomNote('sous/Ma note.md'), 'Ma note');
  assert.equal(liens.nomNote('x\\y.markdown'), 'y');
});

test('liens : propositions relatives au document, filtrées, sans le document lui-même', () => {
  const fichiers = ['a.md', 'sous/b.md', 'sous/c d.md'];
  const p = liens.propositionsLiens({ racine: '/d', fichiers, dossierDocument: '/d/sous', chemin: '/d/sous/b.md' });
  assert.deepStrictEqual(p.map((x) => x.label), ['../a.md', 'c d.md']);
  assert.equal(p[1].apply, 'c%20d.md');
  const f = liens.propositionsLiens({ racine: '/d', fichiers, dossierDocument: '/d', saisie: 'sous/' });
  assert.deepStrictEqual(f.map((x) => x.label), ['sous/b.md', 'sous/c d.md']);
  const n = liens.propositionsNotes({ fichiers, saisie: 'c' });
  assert.deepStrictEqual(n.map((x) => x.apply), ['c d']);
});

// Tâche 5 — export Word (.docx) : génère un .docx d'un document riche via le
// vrai convertisseur du renderer, le dézippe (unzip système) et vérifie le XML
// élément par élément. Le dialogue d'enregistrement est stubé (canal IPC).
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { creerHarnais } = require('./helpers.js');

const h = creerHarnais();
const { check } = h;

// PNG uni de taille donnée, fabriqué à la main (aucune dépendance).
function crc32(buf) {
  let c; let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(l, hh, [r, g, b]) {
  const morceau = (type, data) => {
    const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(hh, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ligne = Buffer.alloc(1 + l * 3); for (let x = 0; x < l; x += 1) { ligne[1 + x * 3] = r; ligne[2 + x * 3] = g; ligne[3 + x * 3] = b; }
  const brut = Buffer.concat(Array.from({ length: hh }, () => ligne));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), morceau('IHDR', ihdr), morceau('IDAT', zlib.deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]);
}

const decompresser = (fichier, interne) => execFileSync('unzip', ['-p', fichier, interne.replace(/[\[\]]/g, '\\$&')], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const liste = (fichier) => execFileSync('unzip', ['-Z1', fichier]).toString('utf8').split('\n').filter(Boolean);

const SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>');
const PNG_DATA = 'data:image/png;base64,' + png(40, 20, [0, 128, 0]).toString('base64');

const DOC = `---
titre: Test
---
# Titre un

## Titre deux

### Titre trois

#### Titre quatre

##### Titre cinq

###### Titre six

Un paragraphe avec **gras**, *italique*, ~~barré~~, \`code en ligne\` et un [lien](https://exemple.org/page).

- Puce un
  - Puce imbriquée
    - Puce profonde
- Puce deux

1. Premier
   1. Sous-premier
2. Deuxième

- [ ] Tâche à faire
- [x] Tâche faite

| Nom | Quantité | Prix |
|:----|:--------:|-----:|
| Pomme | 3 | 1,50 |
| Poire | 12 | 22,00 |

![Petite locale](locale.png)

![Large locale](large.png)

![Donnée](${PNG_DATA})

![Vectoriel](${SVG})

\`\`\`js
const valeur = 42;
console.log(valeur);
\`\`\`

> Une citation importante

---

Avant le saut

<!-- pagebreak -->

Après le saut
`;

(async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-docx-'));
  fs.writeFileSync(path.join(dossier, 'locale.png'), png(100, 50, [200, 0, 0]));
  fs.writeFileSync(path.join(dossier, 'large.png'), png(1800, 100, [0, 0, 200]));
  const md = path.join(dossier, 'riche.md');
  fs.writeFileSync(md, DOC, 'utf8');
  const sortie = path.join(dossier, 'sortie.docx');
  let proposition = null;
  let annule = false;
  await h.demarrer({
    stubs: {
      'file:read': (_e, p) => (fs.existsSync(p) ? { path: p, content: fs.readFileSync(p, 'utf8') } : null),
      'file:export-docx': (_e, { octets, defaultName }) => {
        proposition = defaultName;
        if (annule) return null;
        fs.writeFileSync(sortie, Buffer.from(octets));
        return sortie;
      },
      'image:lire': (_e, url) => {
        try { const p = require('url').fileURLToPath(url); return { octets: fs.readFileSync(p), mime: 'image/png' }; } catch { return null; }
      },
    },
  });
  await h.js(`window.mdr.onglets.ouvrir({ path: ${JSON.stringify(md)}, content: ${JSON.stringify(DOC)} }); true`);
  await h.attendre(500);

  check('Word — la commande export:docx est dans la palette', await h.js(`window.commands.all().some((c) => c.id === 'export:docx')`) === true);
  const res = await h.js(`window.commands.run('export:docx')`);
  await h.attendre(2500);
  check('Word — la commande s’exécute et enregistre un fichier', res === true && fs.existsSync(sortie) && fs.statSync(sortie).size > 1000);
  check('Word — le nom proposé est celui du document', proposition === 'riche', String(proposition));

  // ── Le fichier s'ouvre : zip valide, parties obligatoires ──
  let parties = [];
  try { parties = liste(sortie); execFileSync('unzip', ['-tq', sortie]); check('Word — l’archive zip est valide (unzip -t)', true); }
  catch (e) { check('Word — l’archive zip est valide (unzip -t)', false, String(e)); }
  check('Word — [Content_Types].xml, _rels/.rels et word/document.xml présents',
    ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml'].every((p) => parties.includes(p)), parties.join(','));
  const types = parties.includes('[Content_Types].xml') ? decompresser(sortie, '[Content_Types].xml') : '';
  check('Word — [Content_Types].xml déclare document, png et numérotation',
    /wordprocessingml\.document\.main\+xml/.test(types) && /Extension="png"/.test(types) && /numbering\+xml/.test(types));

  const xml = decompresser(sortie, 'word/document.xml');
  if (process.env.MDR_DUMP) fs.writeFileSync(process.env.MDR_DUMP, xml);
  const styles = decompresser(sortie, 'word/styles.xml');
  const nombre = (re) => (xml.match(re) || []).length;
  const bien = (xml.match(/<w:p[ >]/g) || []).length;
  check('Word — document.xml est un XML bien formé (balises équilibrées)', nombre(/<w:body>/g) === 1 && nombre(/<\/w:body>/g) === 1 && bien === nombre(/<\/w:p>/g) + nombre(/<w:p\/>/g), `p=${bien}`);

  // Titres 1 à 6
  for (let i = 1; i <= 6; i += 1) {
    const nom = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'][i - 1];
    const re = new RegExp(`<w:pStyle w:val="Heading${i}"/>(?:(?!</w:p>)[\\s\\S])*Titre ${nom}`);
    check(`Word — titre ${i} : style Heading${i} et texte`, re.test(xml));
    check(`Word — styles.xml définit Heading${i}`, new RegExp(`w:styleId="Heading${i}"`).test(styles));
  }
  check('Word — le front-matter n’apparaît pas dans le document', !/titre: Test/.test(xml));

  // Paragraphe et marques en ligne
  const para = xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*Un paragraphe avec(?:(?!<\/w:p>)[\s\S])*<\/w:p>/);
  const p1 = para ? para[0] : '';
  check('Word — paragraphe : texte présent', /Un paragraphe avec/.test(p1));
  check('Word — gras (w:b)', /<w:r>(?:(?!<\/w:r>)[\s\S])*<w:b\/>(?:(?!<\/w:r>)[\s\S])*gras/.test(p1));
  check('Word — italique (w:i)', /<w:i\/>(?:(?!<\/w:r>)[\s\S])*italique/.test(p1));
  check('Word — barré (w:strike)', /<w:strike\/>(?:(?!<\/w:r>)[\s\S])*barré/.test(p1));
  check('Word — code en ligne : police monospace et fond gris', /<w:rFonts w:ascii="Courier New"[^>]*\/>(?:(?!<\/w:r>)[\s\S])*<w:shd [^>]*w:fill="EEEEEE"[^>]*\/>(?:(?!<\/w:r>)[\s\S])*code en ligne/.test(p1));
  check('Word — lien : w:hyperlink avec relation externe', /<w:hyperlink [^>]*r:id="[^"]+"[^>]*>(?:(?!<\/w:hyperlink>)[\s\S])*lien/.test(p1));
  const rels = decompresser(sortie, 'word/_rels/document.xml.rels');
  check('Word — la relation du lien pointe vers l’adresse, en mode externe', /Target="https:\/\/exemple\.org\/page"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="https:\/\/exemple\.org\/page"/.test(rels));

  // Listes
  const num = decompresser(sortie, 'word/numbering.xml');
  const numPr = xml.match(/<w:numPr>[\s\S]*?<\/w:numPr>/g) || [];
  check('Word — listes : éléments numérotés (w:numPr)', numPr.length >= 6, String(numPr.length));
  const niveaux = (texte) => {
    const m = xml.match(new RegExp(`<w:numPr><w:ilvl w:val="(\\d)"/>(?:(?!</w:p>)[\\s\\S])*${texte}`));
    return m ? Number(m[1]) : -1;
  };
  check('Word — puces imbriquées : niveaux 0, 1, 2', niveaux('Puce un') === 0 && niveaux('Puce imbriquée') === 1 && niveaux('Puce profonde') === 2, [niveaux('Puce un'), niveaux('Puce imbriquée'), niveaux('Puce profonde')].join(','));
  check('Word — puces deux : retour au niveau 0', niveaux('Puce deux') === 0);
  check('Word — liste numérotée : format decimal et sous-liste niveau 1', /<w:numFmt w:val="decimal"\/>/.test(num) && niveaux('Premier') === 0 && niveaux('Sous-premier') === 1 && niveaux('Deuxième') === 0);
  check('Word — puces : format bullet dans numbering.xml', /<w:numFmt w:val="bullet"\/>/.test(num));
  check('Word — listes de tâches : cases ☐ et ☑ avec le texte', /☐ (?:(?!<\/w:p>)[\s\S])*Tâche à faire|☐ <\/w:t>(?:(?!<\/w:p>)[\s\S])*Tâche à faire/.test(xml) && /☑/.test(xml) && /Tâche faite/.test(xml));

  // Tableau
  const tbl = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/) || [''])[0];
  check('Word — tableau : w:tbl avec 3 lignes et 3 colonnes', tbl && (tbl.match(/<w:tr[ >]/g) || []).length === 3 && (tbl.match(/<w:gridCol /g) || []).length === 3, String((tbl.match(/<w:tr[ >]/g) || []).length));
  check('Word — tableau : ligne d’en-tête répétée (w:tblHeader) et fond', /<w:tblHeader/.test(tbl) && /<w:shd [^>]*w:fill="E7E6E6"/.test(tbl));
  check('Word — tableau : en-têtes en gras', /<w:b\/>(?:(?!<\/w:r>)[\s\S])*Nom/.test(tbl) && /<w:b\/>(?:(?!<\/w:r>)[\s\S])*Quantité/.test(tbl));
  check('Word — tableau : contenu des cellules', ['Pomme', 'Poire', '1,50', '22,00', '12'].every((t) => tbl.includes(t)));
  check('Word — tableau : alignements gauche, centré, droite', /<w:jc w:val="left"\/>(?:(?!<\/w:p>)[\s\S])*Nom</.test(tbl) && /<w:jc w:val="center"\/>(?:(?!<\/w:p>)[\s\S])*Quantité/.test(tbl) && /<w:jc w:val="right"\/>(?:(?!<\/w:p>)[\s\S])*Prix/.test(tbl) && /<w:jc w:val="right"\/>(?:(?!<\/w:p>)[\s\S])*22,00/.test(tbl));
  check('Word — tableau : bordures', /<w:tblBorders>/.test(tbl));

  // Images
  const media = parties.filter((p) => p.startsWith('word/media/') && !p.endsWith('/'));
  check('Word — images dans word/media (4 : locale, large, data URI, svg rastérisé)', media.length === 4, media.join(','));
  check('Word — toutes les images embarquées sont des png', media.every((m) => /\.png$/.test(m)));
  const dessins = xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) || [];
  check('Word — 4 dessins (w:drawing) dans le document', dessins.length === 4, String(dessins.length));
  const EMU_PX = 9525;
  const tailles = dessins.map((d) => { const m = d.match(/<wp:extent cx="(\d+)" cy="(\d+)"/); return m ? [Number(m[1]) / EMU_PX, Number(m[2]) / EMU_PX] : [0, 0]; });
  check('Word — image locale 100×50 : dimensions d’origine', Math.round(tailles[0][0]) === 100 && Math.round(tailles[0][1]) === 50, JSON.stringify(tailles[0]));
  const maxPx = Math.round((11906 - 2 * 1134) / 15);
  check('Word — image large 1800×100 : plafonnée à la largeur de page, ratio conservé', Math.round(tailles[1][0]) === maxPx && Math.abs(tailles[1][1] - 100 * maxPx / 1800) < 1.5 && tailles[1][0] <= maxPx, JSON.stringify(tailles[1]));
  check('Word — image data URI 40×20', Math.round(tailles[2][0]) === 40 && Math.round(tailles[2][1]) === 20, JSON.stringify(tailles[2]));
  check('Word — image SVG 120×60 (rastérisée)', Math.round(tailles[3][0]) === 120 && Math.round(tailles[3][1]) === 60, JSON.stringify(tailles[3]));
  check('Word — légendes de figures présentes', /Figure 1 — Petite locale/.test(xml));
  const bad = media.map((m) => execFileSync('unzip', ['-p', sortie, m], { maxBuffer: 64 * 1024 * 1024 })).every((b) => b[0] === 0x89 && b[1] === 0x50);
  check('Word — les octets embarqués sont de vrais png', bad);

  // Bloc de code
  const lignesCode = ['const valeur = 42;', 'console.log(valeur);'];
  check('Word — bloc de code : lignes de code présentes', lignesCode.every((l) => xml.includes(l)));
  const pCode = (xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*const valeur = 42;(?:(?!<\/w:p>)[\s\S])*<\/w:p>/) || [''])[0];
  check('Word — bloc de code : police monospace, fond gris, style BlocCode', /Courier New/.test(pCode) && /w:fill="EEEEEE"/.test(pCode) && /<w:pStyle w:val="BlocCode"/.test(pCode));
  check('Word — bloc de code : styles.xml définit BlocCode en monospace', /w:styleId="BlocCode"[\s\S]*?Courier New/.test(styles));

  // Citation, filet, saut de page
  const pCit = (xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*Une citation importante(?:(?!<\/w:p>)[\s\S])*<\/w:p>/) || [''])[0];
  check('Word — citation : bordure gauche et retrait', /<w:pBdr>\s*<w:left /.test(pCit) && /<w:ind w:left="[1-9]\d*"/.test(pCit));
  check('Word — filet : paragraphe avec bordure basse', /<w:pBdr><w:bottom [^>]*\/><\/w:pBdr>/.test(xml));
  check('Word — saut de page : w:br w:type="page" entre « Avant » et « Après »', /Avant le saut(?:[\s\S]*?)<w:br w:type="page"\/>(?:[\s\S]*?)Après le saut/.test(xml));
  check('Word — mise en page A4 (11906 × 16838)', /<w:pgSz w:w="11906" w:h="16838"/.test(xml));

  // Annulation du dialogue : rien n'est écrit, aucune erreur
  fs.rmSync(sortie);
  annule = true;
  const sortieAnnulee = await h.js(`window.mdr.exportDocx.exporter()`);
  check('Word — dialogue annulé : aucun fichier écrit, renvoie null', sortieAnnulee === null && !fs.existsSync(sortie));

  // Document vide : un .docx valide quand même
  annule = false;
  await h.js(`window.mdr.editeur().setValue(''); true`);
  await h.attendre(300);
  await h.js(`window.mdr.exportDocx.exporter()`);
  let videOk = false;
  try { execFileSync('unzip', ['-tq', sortie]); videOk = /<w:body>/.test(decompresser(sortie, 'word/document.xml')); } catch { videOk = false; }
  check('Word — document vide : fichier valide', videOk);

  fs.rmSync(dossier, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

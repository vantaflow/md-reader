// Tâche 7 — image collée ou glissée dans l'éditeur : vrais File/DataTransfer
// et vrais événements paste/drop dans CodeMirror, IPC `image:save` branché sur
// la vraie fonction d'écriture (images.js) vers un dossier temporaire.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { enregistrerImage } = require('../images.js');
const { creerHarnais } = require('./helpers.js');

const h = creerHarnais();
const { check } = h;

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]).toString('base64');
const GIF_B64 = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary').toString('base64');
const WEBP_B64 = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]).toString('base64');
const SVG_B64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>').toString('base64');

(async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mdr-colle-'));
  const nouveauDoc = path.join(dossier, 'neuf', 'enregistre.md');
  fs.mkdirSync(path.dirname(nouveauDoc));
  const appels = { imageSave: [], fileSave: 0 };
  let annulerEnregistrement = false;
  await h.demarrer({
    stubs: {
      'image:save': async (_e, p) => {
        appels.imageSave.push({ nom: p.nom, mime: p.mime, taille: p.octets.length });
        try { const r = await enregistrerImage(p); return { relatif: r.relatif, nom: r.nom }; } catch (e) { return { erreur: e.message }; }
      },
      'file:save': (_e, { filePath, content }) => {
        appels.fileSave += 1;
        if (!filePath && annulerEnregistrement) return null;
        const cible = filePath || nouveauDoc;
        fs.writeFileSync(cible, content, 'utf8');
        return cible;
      },
    },
  });
  await h.js(`window.__fichier = (b64, nom, type) => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], nom, { type });
    window.__coller = (fichiers, texte) => {
      const dt = new DataTransfer();
      for (const f of fichiers) dt.items.add(f);
      if (texte) dt.setData('text/plain', texte);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.querySelector('#editor .cm-content').dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    window.__deposer = (fichiers, pos) => {
      const dt = new DataTransfer();
      for (const f of fichiers) dt.items.add(f);
      const view = window.mdr.editeur().view;
      const c = view.coordsAtPos(pos);
      const ev = new DragEvent('drop', { dataTransfer: dt, clientX: c.left + 1, clientY: (c.top + c.bottom) / 2, bubbles: true, cancelable: true });
      document.querySelector('#editor .cm-content').dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    window.__texte = () => window.mdr.editeur().getValue(); true`);

  const md = path.join(dossier, 'note.md');
  const base = 'Début\n\nMilieu\n\nFin\n';
  fs.writeFileSync(md, base, 'utf8');
  await h.js(`window.mdr.onglets.ouvrir({ path: ${JSON.stringify(md)}, content: ${JSON.stringify(base)} }); true`);
  await h.js(`window.commands.run('vue:deux'); true`);
  await h.attendre(400);
  const images = () => (fs.existsSync(path.join(dossier, 'images')) ? fs.readdirSync(path.join(dossier, 'images')).sort() : []);
  const texte = () => h.js('window.__texte()');
  const curseur = (pos) => h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: ${pos} } }); true`);

  // ── Collage d'une capture (nom générique « image.png ») ──
  await curseur(base.indexOf('Milieu') + 'Milieu'.length);
  const prevenu = await h.js(`window.__coller([window.__fichier('${PNG_B64}', 'image.png', 'image/png')])`);
  await h.attendre(600);
  const apres1 = await texte();
  const f1 = images();
  check('Collage — le comportement par défaut est supprimé (preventDefault)', prevenu === true);
  check('Collage — le dossier images/ est créé à côté du .md avec 1 fichier horodaté', f1.length === 1 && /^image-\d{8}-\d{6}\.png$/.test(f1[0]), JSON.stringify(f1));
  check('Collage — les octets écrits sont ceux du presse-papiers', f1.length === 1 && fs.readFileSync(path.join(dossier, 'images', f1[0])).equals(Buffer.from(PNG_B64, 'base64')));
  const lien1 = f1.length ? `![${f1[0].replace(/\.png$/, '')}](images/${f1[0]})` : '?';
  check('Collage — le lien Markdown est inséré au curseur', apres1 === base.replace('Milieu', 'Milieu' + lien1), JSON.stringify(apres1));
  check('Collage — le curseur est placé après le lien', await h.js(`window.mdr.editeur().view.state.selection.main.head === ${base.indexOf('Milieu') + 'Milieu'.length + lien1.length}`));
  check('Collage — le document est marqué modifié', await h.js(`window.mdr.onglets.actif().dirty === true`));
  check('Collage — l’aperçu affiche l’image résolue depuis le dossier du document', await h.js(`(() => { const i = document.querySelector('#preview img'); return !!i && i.src.startsWith('file://') && i.src.includes('/images/image-'); })()`));

  // ── Collage d'une image copiée avec son nom d'origine, remplace la sélection ──
  await h.js(`window.mdr.editeur().setValue(${JSON.stringify(base)}); true`);
  await h.js(`window.mdr.editeur().view.dispatch({ selection: { anchor: ${base.indexOf('Fin')}, head: ${base.indexOf('Fin') + 3} } }); true`);
  await h.js(`window.__coller([window.__fichier('${PNG_B64}', 'Mon schéma (v2).PNG', 'image/png')])`);
  await h.attendre(600);
  const apres2 = await texte();
  check('Collage — nom d’origine nettoyé (espaces, parenthèses, extension en minuscules)', images().includes('Mon-schéma-v2.png'), JSON.stringify(images()));
  check('Collage — la sélection est remplacée par le lien', apres2 === base.replace('Fin', '![Mon-schéma-v2](images/Mon-schéma-v2.png)'), JSON.stringify(apres2));

  // ── Collision : même nom une seconde fois ──
  await h.js(`window.__coller([window.__fichier('${PNG_B64}', 'Mon schéma (v2).png', 'image/png')])`);
  await h.attendre(600);
  check('Collage — collision : le second fichier devient -2, le premier est intact', images().includes('Mon-schéma-v2-2.png') && images().includes('Mon-schéma-v2.png') && (await texte()).includes('(images/Mon-schéma-v2-2.png)'), JSON.stringify(images()));

  // ── Glisser-déposer à une position précise ──
  await h.js(`window.mdr.editeur().setValue(${JSON.stringify(base)}); true`);
  await h.attendre(200);
  const posDepot = base.indexOf('Fin');
  const prevenuDrop = await h.js(`window.__deposer([window.__fichier('${JPG_B64}', 'photo.jpg', 'image/jpeg')], ${posDepot})`);
  await h.attendre(600);
  const apresDrop = await texte();
  check('Glisser — le comportement par défaut est supprimé', prevenuDrop === true);
  check('Glisser — le lien est inséré à la position du dépôt, pas au curseur', apresDrop === base.slice(0, posDepot) + '![photo](images/photo.jpg)' + base.slice(posDepot), JSON.stringify(apresDrop));
  check('Glisser — fichier photo.jpg copié', images().includes('photo.jpg') && fs.readFileSync(path.join(dossier, 'images', 'photo.jpg'))[0] === 0xff);

  // ── Plusieurs images et tous les formats ──
  await h.js(`window.mdr.editeur().setValue(''); true`);
  await h.js(`window.__deposer([
    window.__fichier('${GIF_B64}', 'anim.gif', 'image/gif'),
    window.__fichier('${WEBP_B64}', 'web.webp', 'image/webp'),
    window.__fichier('${SVG_B64}', 'vecteur.svg', 'image/svg+xml'),
  ], 0)`);
  await h.attendre(900);
  const multi = await texte();
  check('Glisser — plusieurs images : gif, webp et svg copiés', ['anim.gif', 'web.webp', 'vecteur.svg'].every((n) => images().includes(n)), JSON.stringify(images()));
  check('Glisser — plusieurs images : un lien par image, dans l’ordre', multi === '![anim](images/anim.gif)\n![web](images/web.webp)\n![vecteur](images/vecteur.svg)', JSON.stringify(multi));

  // ── Ce qui n'est pas une image n'est pas détourné ──
  await h.js(`window.mdr.editeur().setValue('X'); true`);
  const avantAppels = appels.imageSave.length;
  const rienTxt = await h.js(`window.__deposer([window.__fichier('aGVsbG8=', 'notes.csv', 'text/csv')], 0)`);
  const rienBmp = await h.js(`window.__deposer([window.__fichier('Qk0=', 'ancien.bmp', 'image/bmp')], 0)`);
  const texteApresDrops = await texte();
  const texteEtImage = await h.js(`window.__coller([window.__fichier('${PNG_B64}', 'image.png', 'image/png')], 'cellule A1\\tcellule B1')`);
  await h.attendre(400);
  check('Non-images — .csv et .bmp déposés ne sont pas pris en charge (aucun appel image:save)', appels.imageSave.length === avantAppels, String(rienTxt) + String(rienBmp) + texteApresDrops);
  check('Non-images — un collage qui porte aussi du texte (tableur, page web) reste un collage de texte : aucune image copiée, texte collé', appels.imageSave.length === avantAppels && (await texte()).includes('cellule A1'), String(texteEtImage) + JSON.stringify(await texte()));

  // ── Refus du chemin : nom tentant de sortir du dossier ──
  const avantFichiers = images().length;
  await h.js(`window.mdr.editeur().setValue('Z'); true`);
  await h.js(`window.__deposer([window.__fichier('${PNG_B64}', '../evasion.png', 'image/png')], 0)`);
  await h.attendre(600);
  check('Refus — un nom « ../evasion.png » n’écrit rien, ni dans images/ ni au-dessus', images().length === avantFichiers && !fs.existsSync(path.join(dossier, 'evasion.png')) && !fs.existsSync(path.join(path.dirname(dossier), 'evasion.png')));
  check('Refus — rien n’est inséré dans le document', (await texte()) === 'Z');
  check('Refus — l’erreur est affichée à l’utilisateur', (await h.js(`document.getElementById('lot-notification').textContent`)).includes('Image non ajoutée'));
  // Faux contenu : un exécutable renommé en .png est refusé.
  await h.js(`window.__deposer([window.__fichier('TVqQAAMAAAAEAAAA', 'virus.png', 'image/png')], 0)`);
  await h.attendre(600);
  check('Refus — contenu qui n’est pas une image (renommé en .png) : refusé', !images().includes('virus.png') && (await texte()) === 'Z');

  // ── Document non enregistré ──
  await h.js(`window.mdr.onglets.nouveau(); true`);
  await h.attendre(300);
  await h.js(`window.mdr.editeur().setValue('Sans titre'); true`);
  const confirmations = [];
  await h.js(`window.__confirmations = []; window.__reponse = false; window.confirm = (m) => { window.__confirmations.push(m); return window.__reponse; }; true`);
  const avantSave = appels.fileSave;
  const avantImg = appels.imageSave.length;
  await h.js(`window.__coller([window.__fichier('${PNG_B64}', 'image.png', 'image/png')])`);
  await h.attendre(600);
  const msg = await h.jsonJs(`window.__confirmations`);
  check('Non enregistré — une confirmation demande d’enregistrer d’abord', msg.length === 1 && /enregistr/i.test(msg[0]), JSON.stringify(msg));
  check('Non enregistré, refusé — rien n’est enregistré, copié ni inséré', appels.fileSave === avantSave && appels.imageSave.length === avantImg && (await texte()) === 'Sans titre' && !fs.existsSync(path.join(dossier, 'neuf', 'images')));

  await h.js(`window.__reponse = true; true`);
  annulerEnregistrement = true;
  await h.js(`window.__deposer([window.__fichier('${PNG_B64}', 'image.png', 'image/png')], 0)`);
  await h.attendre(700);
  check('Non enregistré, confirmé mais dialogue d’enregistrement annulé — rien n’est inséré ni copié', appels.fileSave === avantSave + 1 && appels.imageSave.length === avantImg && (await texte()) === 'Sans titre' && !fs.existsSync(path.join(dossier, 'neuf', 'images')));

  annulerEnregistrement = false;
  await h.js(`window.__coller([window.__fichier('${PNG_B64}', 'image.png', 'image/png')])`);
  await h.attendre(900);
  const dossierNeuf = path.join(dossier, 'neuf', 'images');
  const fn = fs.existsSync(dossierNeuf) ? fs.readdirSync(dossierNeuf) : [];
  const txt = await texte();
  check('Non enregistré, confirmé — le document est enregistré par le flux existant', fs.existsSync(nouveauDoc) && fs.readFileSync(nouveauDoc, 'utf8') === 'Sans titre' && (await h.js(`window.mdr.onglets.actif().path`)) === nouveauDoc);
  check('Non enregistré, confirmé — l’image est copiée à côté du nouveau .md', fn.length === 1 && /^image-\d{8}-\d{6}\.png$/.test(fn[0]), JSON.stringify(fn));
  check('Non enregistré, confirmé — le lien est inséré', fn.length === 1 && txt.includes(`](images/${fn[0]})`), JSON.stringify(txt));

  fs.rmSync(dossier, { recursive: true, force: true });
  h.terminer();
})().catch(h.erreurFatale);

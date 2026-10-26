// Export EPUB 3 : construit l'archive à partir du HTML rendu d'un document.
// Format UMD : CommonJS pour `node --test` (jszip est alors `require`), global
// `window.mdrEpub` dans le renderer (où JSZip est fourni par jszip-bundle.js).
//
// Structure produite (norme EPUB 3) :
//   mimetype                  premier de l'archive, NON compressé
//   META-INF/container.xml
//   OEBPS/content.opf         métadonnées (titre, auteur, langue), manifeste, ordre de lecture
//   OEBPS/nav.xhtml           table des matières
//   OEBPS/chapitre-NN.xhtml   un chapitre par titre 1
//   OEBPS/style.css
//   OEBPS/images/*            images extraites des data URI
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(() => require('jszip'));
  else racine.mdrEpub = fabrique(() => racine.JSZip);
})(typeof self !== 'undefined' ? self : this, function (obtenirJSZip) {
  const VOIDS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  // Éléments retirés AVEC leur contenu : scripts, objets embarqués, formulaires.
  const RETIRES = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'button', 'select', 'textarea', 'template', 'head', 'title']);
  const EXT_IMAGE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  const MIME_IMAGE = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

  // Entités nommées courantes → caractère (XML ne connaît que cinq noms ; les
  // autres sont écrites en clair, l'archive est en UTF-8).
  const ENTITES = {
    nbsp: 160, copy: 169, reg: 174, trade: 8482, hellip: 8230, mdash: 8212, ndash: 8211, laquo: 171, raquo: 187,
    lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, bull: 8226, middot: 183, times: 215, divide: 247,
    euro: 8364, pound: 163, yen: 165, cent: 162, sect: 167, deg: 176, plusmn: 177, micro: 181, para: 182,
    larr: 8592, rarr: 8594, uarr: 8593, darr: 8595, harr: 8596, le: 8804, ge: 8805, ne: 8800, infin: 8734,
    eacute: 233, egrave: 232, ecirc: 234, agrave: 224, acirc: 226, ccedil: 231, ocirc: 244, ugrave: 249, ucirc: 251,
    iuml: 239, icirc: 238, euml: 235, Eacute: 201, Agrave: 192, Ccedil: 199, thinsp: 8201, ensp: 8194, emsp: 8195,
    hearts: 9829,
  };

  const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const echapperAttr = (t) => echapper(t).replace(/"/g, '&quot;');

  // Texte brut : entités HTML décodées (celles qui sont inconnues restent telles quelles
  // et seront donc échappées : `&inconnue;` devient `&amp;inconnue;`).
  function decoderEntites(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, nom) => {
      if (nom[0] === '#') {
        const n = nom[1].toLowerCase() === 'x' ? parseInt(nom.slice(2), 16) : parseInt(nom.slice(1), 10);
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
      }
      const bas = nom.toLowerCase();
      if (bas === 'amp') return '&';
      if (bas === 'lt') return '<';
      if (bas === 'gt') return '>';
      if (bas === 'quot') return '"';
      if (bas === 'apos') return "'";
      if (ENTITES[nom] !== undefined) return String.fromCodePoint(ENTITES[nom]);
      return m;
    });
  }

  // Caractères interdits en XML 1.0 (contrôles hors tabulation, saut de ligne, retour).
  const sansControles = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
  const texteXml = (brut) => echapper(sansControles(decoderEntites(brut)));
  const attrXml = (brut) => echapperAttr(sansControles(decoderEntites(brut)));

  const BALISE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  const ATTRIBUT = /([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

  function lireAttributs(brut) {
    const attrs = [];
    for (const m of brut.matchAll(ATTRIBUT)) {
      let v = m[2];
      if (v === undefined) v = '';
      else if (/^["']/.test(v)) v = v.slice(1, -1);
      attrs.push([m[1], v]);
    }
    return attrs;
  }

  // Convertit du HTML (sérialisation d'un navigateur ou HTML saisi) en XHTML bien
  // formé : balises vides auto-fermées, entités converties ou échappées, pile de
  // balises équilibrée, éléments dangereux retirés, `<` et `&` isolés échappés.
  // `options.img(attrs)` : reçoit les attributs d'une image ; renvoie la liste
  // d'attributs à écrire, ou une chaîne (l'image est alors remplacée par ce texte).
  function versXhtml(html, options = {}) {
    const entree = String(html || '');
    const pile = []; // { bas, brut } des éléments ouverts
    let sortie = '';
    let ignore = 0; // profondeur dans un élément retiré avec son contenu
    let nomIgnore = null;
    let dernier = 0;
    const ecrireTexte = (t) => { if (t && !ignore) sortie += texteXml(t); };

    for (const m of entree.matchAll(BALISE)) {
      ecrireTexte(entree.slice(dernier, m.index));
      dernier = m.index + m[0].length;
      if (m[2] === undefined) continue; // commentaire, CDATA, doctype, instruction : écartés
      const fermante = m[1] === '/';
      const nomBrut = m[2];
      const nom = nomBrut.toLowerCase();
      if (ignore) {
        if (nom === nomIgnore && !VOIDS.has(nom)) {
          if (fermante) ignore -= 1;
          else if (!m[4]) ignore += 1;
          if (!ignore) nomIgnore = null;
        }
        continue;
      }
      if (fermante) {
        let i = pile.length - 1;
        while (i >= 0 && pile[i].bas !== nom) i -= 1;
        if (i === -1) continue; // fermeture sans ouverture : ignorée
        while (pile.length > i) sortie += `</${pile.pop().brut}>`;
        continue;
      }
      if (RETIRES.has(nom)) {
        if (!m[4] && !VOIDS.has(nom)) { ignore = 1; nomIgnore = nom; }
        continue;
      }
      let attrs = lireAttributs(m[3]);
      if (nom === 'input') {
        const type = (attrs.find(([k]) => k.toLowerCase() === 'type') || [])[1];
        if (type && type.toLowerCase() === 'checkbox') sortie += attrs.some(([k]) => k.toLowerCase() === 'checked') ? '☑' : '☐';
        continue;
      }
      if (nom === 'img' && options.img) {
        const r = options.img(attrs);
        if (typeof r === 'string') { sortie += texteXml(r); continue; }
        attrs = r;
      }
      const ecrits = [];
      let align = null;
      for (const [k, v] of attrs) {
        const bas = k.toLowerCase();
        if (!/^[a-zA-Z_][\w:.-]*$/.test(k)) continue;
        if (bas.startsWith('on') || bas === 'xmlns' || bas.startsWith('xmlns:') || bas.startsWith('xml:')) continue;
        if ((bas === 'href' || bas === 'src' || bas === 'xlink:href') && /^\s*(javascript|vbscript):/i.test(decoderEntites(v))) continue;
        if (bas === 'align') { align = v; continue; } // attribut obsolète : devient un style
        ecrits.push(`${k}="${attrXml(v)}"`);
      }
      if (align && /^(left|right|center|justify)$/i.test(align)) {
        const i = ecrits.findIndex((e) => /^style=/i.test(e));
        const regle = `text-align:${align.toLowerCase()}`;
        if (i >= 0) ecrits[i] = ecrits[i].replace(/"$/, `;${regle}"`);
        else ecrits.push(`style="${regle}"`);
      }
      if (nom === 'svg') ecrits.push('xmlns="http://www.w3.org/2000/svg"', 'xmlns:xlink="http://www.w3.org/1999/xlink"');
      if (nom === 'math') ecrits.push('xmlns="http://www.w3.org/1998/Math/MathML"');
      const ouverture = `<${nomBrut}${ecrits.length ? ' ' + ecrits.join(' ') : ''}`;
      if (VOIDS.has(nom) || m[4]) sortie += ouverture + '/>';
      else { sortie += ouverture + '>'; pile.push({ bas: nom, brut: nomBrut }); }
    }
    ecrireTexte(entree.slice(dernier));
    while (pile.length) sortie += `</${pile.pop().brut}>`;
    return sortie;
  }

  // Découpe un XHTML en chapitres, un par titre 1 situé au premier niveau (pas
  // dans une citation ou un encadré). Ce qui précède le premier titre 1 forme un
  // chapitre d'introduction s'il n'est pas vide. Renvoie [{ titre, corps }].
  function decouperChapitres(xhtml, titreParDefaut) {
    const coupes = [];
    const pile = [];
    for (const m of xhtml.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g)) {
      const nom = m[2].toLowerCase();
      if (VOIDS.has(nom) || m[4]) continue;
      if (m[1]) {
        const i = pile.lastIndexOf(nom);
        if (i >= 0) pile.length = i;
      } else {
        if (nom === 'h1' && pile.length === 0) coupes.push(m.index);
        pile.push(nom);
      }
    }
    const texteDe = (frag) => frag.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const morceaux = [];
    if (!coupes.length) morceaux.push(xhtml);
    else {
      const intro = xhtml.slice(0, coupes[0]);
      if (texteDe(intro) || /<img\b/.test(intro)) morceaux.push(intro);
      coupes.forEach((c, i) => morceaux.push(xhtml.slice(c, i + 1 < coupes.length ? coupes[i + 1] : undefined)));
    }
    return morceaux.map((corps, i) => {
      const h1 = corps.match(/^<h1\b[^>]*>([\s\S]*?)<\/h1>/);
      const titre = (h1 && texteDe(h1[1])) || (i === 0 && !/^<h1\b/.test(corps) ? titreParDefaut : '') || titreParDefaut;
      return { titre, corps };
    });
  }

  const CSS = `html { font-family: serif; line-height: 1.5; }
body { margin: 5%; text-align: left; }
h1, h2, h3, h4, h5, h6 { font-family: sans-serif; line-height: 1.25; page-break-after: avoid; }
h1 { font-size: 1.8em; border-bottom: 1px solid #999; padding-bottom: 0.2em; }
h2 { font-size: 1.4em; } h3 { font-size: 1.2em; }
p { margin: 0 0 0.8em; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #999; padding: 0.3em 0.6em; }
th { background: #eee; }
pre { background: #f4f4f4; border: 1px solid #ddd; padding: 0.6em; white-space: pre-wrap; font-size: 0.85em; page-break-inside: avoid; }
code { font-family: monospace; background: #f4f4f4; }
pre code { background: none; }
blockquote { border-left: 4px solid #bbb; margin: 1em 0; padding: 0 1em; color: #444; }
hr { border: 0; border-top: 1px solid #999; }
.katex-html { display: none; }
`;

  const LANGUE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/;
  const entete = '<?xml version="1.0" encoding="UTF-8"?>\n';

  function chapitreXhtml({ titre, corps, langue }) {
    return `${entete}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${langue}" xml:lang="${langue}">\n<head>\n<meta charset="utf-8"/>\n<title>${echapper(titre)}</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n${corps}\n</body>\n</html>\n`;
  }

  const nomChapitre = (i) => `chapitre-${String(i + 1).padStart(2, '0')}.xhtml`;

  function uuid() {
    const c = typeof crypto !== 'undefined' ? crypto : (typeof require === 'function' ? require('crypto') : null);
    if (c && c.randomUUID) return c.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.floor(Math.random() * 16); return (ch === 'x' ? r : (r & 3) | 8).toString(16); });
  }

  // Construit l'EPUB. `html` : HTML rendu du document (fragment de corps, images
  // en data URI). Renvoie une promesse d'Uint8Array.
  async function construireEpub({ html, titre, auteur, langue, identifiant, date, JSZip } = {}) {
    const Zip = JSZip || obtenirJSZip();
    if (!Zip) throw new Error('JSZip indisponible.');
    const titreDoc = String(titre || '').trim() || 'Document';
    const lang = langue && LANGUE.test(String(langue)) ? String(langue) : 'fr';
    const maintenant = (date instanceof Date ? date : new Date()).toISOString().replace(/\.\d+Z$/, 'Z');

    // Images : chaque data URI devient un fichier ; les autres sources (réseau,
    // chemin local non résolu) ne peuvent pas entrer dans l'archive et sont
    // remplacées par leur texte alternatif.
    const images = []; // { nom, mime, base64 }
    const dejaVues = new Map();
    const traiterImg = (attrs) => {
      const src = (attrs.find(([k]) => k.toLowerCase() === 'src') || [])[1] || '';
      const alt = (attrs.find(([k]) => k.toLowerCase() === 'alt') || [])[1] || '';
      const m = decoderEntites(src).match(/^data:([a-z]+\/[a-z0-9.+-]+)?;base64,([A-Za-z0-9+/=\s]+)$/i);
      const ext = m && EXT_IMAGE[(m[1] || '').toLowerCase()];
      if (!m || !ext) return alt ? `[${alt}]` : '';
      const base64 = m[2].replace(/\s+/g, '');
      const cle = ext + ':' + base64;
      if (!dejaVues.has(cle)) {
        const nom = `image-${String(images.length + 1).padStart(3, '0')}.${ext}`;
        images.push({ nom, mime: MIME_IMAGE[ext], base64 });
        dejaVues.set(cle, nom);
      }
      const autres = attrs.filter(([k]) => !['src', 'alt'].includes(k.toLowerCase()));
      return [['src', 'images/' + dejaVues.get(cle)], ['alt', alt], ...autres];
    };

    const xhtml = versXhtml(html, { img: traiterImg });
    const chapitres = decouperChapitres(xhtml, titreDoc);

    // Liens internes : `#ancre` pointe vers le chapitre qui porte l'identifiant.
    const ancres = new Map();
    chapitres.forEach((c, i) => { for (const m of c.corps.matchAll(/\sid="([^"]+)"/g)) if (!ancres.has(m[1])) ancres.set(m[1], i); });
    chapitres.forEach((c, i) => {
      c.corps = c.corps.replace(/(\shref=")#([^"]+)(")/g, (tout, a, id, b) => {
        const cible = ancres.get(id.replace(/&amp;/g, '&'));
        return cible === undefined || cible === i ? tout : `${a}${nomChapitre(cible)}#${id}${b}`;
      });
    });

    const zip = new Zip();
    const ajout = { createFolders: false };
    // `mimetype` : premier, sans compression, sans champ supplémentaire.
    zip.file('mimetype', 'application/epub+zip', { ...ajout, compression: 'STORE' });
    zip.file('META-INF/container.xml', `${entete}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles>\n<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n</rootfiles>\n</container>\n`, ajout);

    const manifeste = [
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="css" href="style.css" media-type="text/css"/>',
      ...chapitres.map((c, i) => `<item id="chap${i + 1}" href="${nomChapitre(i)}" media-type="application/xhtml+xml"/>`),
      ...images.map((im, i) => `<item id="img${i + 1}" href="images/${im.nom}" media-type="${im.mime}"/>`),
    ];
    const meta = [
      `<dc:identifier id="id-livre">urn:uuid:${echapper(identifiant || uuid())}</dc:identifier>`,
      `<dc:title>${echapper(titreDoc)}</dc:title>`,
      `<dc:language>${lang}</dc:language>`,
      ...(auteur && String(auteur).trim() ? [`<dc:creator>${echapper(String(auteur).trim())}</dc:creator>`] : []),
      `<meta property="dcterms:modified">${maintenant}</meta>`,
    ];
    zip.file('OEBPS/content.opf', `${entete}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id-livre" xml:lang="${lang}">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n${meta.join('\n')}\n</metadata>\n<manifest>\n${manifeste.join('\n')}\n</manifest>\n<spine>\n${chapitres.map((_c, i) => `<itemref idref="chap${i + 1}"/>`).join('\n')}\n</spine>\n</package>\n`, ajout);

    const toc = chapitres.map((c, i) => `<li><a href="${nomChapitre(i)}">${echapper(c.titre)}</a></li>`).join('\n');
    zip.file('OEBPS/nav.xhtml', `${entete}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">\n<head>\n<meta charset="utf-8"/>\n<title>${echapper(titreDoc)}</title>\n<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n<nav epub:type="toc" id="toc">\n<h1>${echapper(titreDoc)}</h1>\n<ol>\n${toc}\n</ol>\n</nav>\n</body>\n</html>\n`, ajout);
    zip.file('OEBPS/style.css', CSS, ajout);
    chapitres.forEach((c, i) => zip.file('OEBPS/' + nomChapitre(i), chapitreXhtml({ titre: c.titre, corps: c.corps, langue: lang }), ajout));
    for (const im of images) zip.file('OEBPS/images/' + im.nom, im.base64, { ...ajout, base64: true });

    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
  }

  return { construireEpub, versXhtml, decouperChapitres, decoderEntites, CSS };
});

// Éditeur de diagramme Mermaid « sans code » : modèle, génération du code,
// relecture du code existant, disposition automatique et repérage des blocs
// ```mermaid dans un document Markdown. Fonctions pures, sans DOM. Format UMD :
// CommonJS pour les tests node, global `window.mdrMermaid` dans le renderer.
//
// Deux types de diagramme sont éditables :
//   - organigramme (`flowchart` / `graph`) : nœuds (rectangle, arrondi, losange,
//     cercle), liens (flèche, trait, pointillé, épais) avec texte, direction ;
//   - séquence (`sequenceDiagram`) : participants et messages en liste.
// Tout autre contenu (sous-graphes, styles, notes, boucles…) est « non reconnu » :
// `analyser` répond `{ ok: false, raison }` et l'éditeur s'ouvre en lecture seule,
// le code n'est jamais réécrit.
//
// Les positions des nœuds sur le canevas sont mémorisées dans un commentaire
// Mermaid (`%% mdr:pos A=10,20;B=…`) que Mermaid ignore.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrMermaid = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const FORMES = ['rectangle', 'arrondi', 'losange', 'cercle'];
  const DIRECTIONS = ['TB', 'TD', 'BT', 'LR', 'RL'];
  const STYLES_LIEN = ['fleche', 'trait', 'pointille', 'epais'];
  const TYPES_MESSAGE = ['->>', '-->>', '->', '-->'];

  const ouvrant = { rectangle: '[', arrondi: '(', losange: '{', cercle: '((' };
  const fermant = { rectangle: ']', arrondi: ')', losange: '}', cercle: '))' };
  const operateur = { fleche: '-->', trait: '---', pointille: '-.->', epais: '==>' };

  const RE_ID = /^[A-Za-z_][A-Za-z0-9_]*/;

  // ───────────────────────── Textes ─────────────────────────

  function encoderTexte(t) {
    return String(t).replace(/\r?\n/g, '<br/>').replace(/"/g, '#quot;');
  }
  function decoderTexte(t) {
    return String(t).replace(/<br\s*\/?>/gi, '\n').replace(/#quot;/g, '"').replace(/#59;/g, ';').trim();
  }
  const texteSimple = (t) => /^[\p{L}\p{N} _.,:!?'’\-/+=%*&@]+$/u.test(t) && !/^\s|\s$/.test(t) && !/^(end|subgraph|style|class)$/i.test(t);

  // ───────────────────────── Modèles ─────────────────────────

  function modeleVide(type) {
    if (type === 'sequence') {
      return {
        type: 'sequence',
        participants: [{ id: 'A', texte: 'Alice' }, { id: 'B', texte: 'Bob' }],
        messages: [{ de: 'A', vers: 'B', texte: 'Bonjour', type: '->>' }, { de: 'B', vers: 'A', texte: 'Salut', type: '-->>' }],
      };
    }
    return {
      type: 'flowchart',
      mot: 'flowchart',
      direction: 'TD',
      noeuds: [{ id: 'A', texte: 'Début', forme: 'arrondi', x: 40, y: 30 }, { id: 'B', texte: 'Étape', forme: 'rectangle', x: 40, y: 140 }],
      liens: [{ de: 'A', vers: 'B', texte: '', style: 'fleche' }],
    };
  }

  function idLibre(modele, prefixe) {
    const pris = new Set((modele.type === 'sequence' ? modele.participants : modele.noeuds).map((n) => n.id));
    const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 26; i += 1) if (!pris.has(prefixe + lettres[i])) return prefixe + lettres[i];
    let n = 1;
    while (pris.has(`${prefixe}N${n}`)) n += 1;
    return `${prefixe}N${n}`;
  }

  function ajouterNoeud(modele, { texte = 'Nouveau', forme = 'rectangle', x = 40, y = 40 } = {}) {
    const noeud = { id: idLibre(modele, ''), texte, forme: FORMES.includes(forme) ? forme : 'rectangle', x, y };
    modele.noeuds.push(noeud);
    return noeud;
  }

  function supprimerNoeud(modele, id) {
    modele.noeuds = modele.noeuds.filter((n) => n.id !== id);
    modele.liens = modele.liens.filter((l) => l.de !== id && l.vers !== id);
  }

  // Relie deux nœuds existants ; renvoie le lien, ou null si l'un n'existe pas.
  function relier(modele, de, vers, { texte = '', style = 'fleche' } = {}) {
    if (!modele.noeuds.some((n) => n.id === de) || !modele.noeuds.some((n) => n.id === vers)) return null;
    const lien = { de, vers, texte, style: STYLES_LIEN.includes(style) ? style : 'fleche' };
    modele.liens.push(lien);
    return lien;
  }

  function ajouterParticipant(modele, texte = 'Participant') {
    const p = { id: idLibre(modele, ''), texte };
    modele.participants.push(p);
    return p;
  }

  function supprimerParticipant(modele, id) {
    modele.participants = modele.participants.filter((p) => p.id !== id);
    modele.messages = modele.messages.filter((m) => m.de !== id && m.vers !== id);
  }

  // ───────────────────────── Génération ─────────────────────────

  function genererFlowchart(m) {
    const lignes = [`${m.mot === 'graph' ? 'graph' : 'flowchart'} ${DIRECTIONS.includes(m.direction) ? m.direction : 'TD'}`];
    for (const n of m.noeuds) {
      const forme = FORMES.includes(n.forme) ? n.forme : 'rectangle';
      const texte = n.texte && n.texte.trim() ? n.texte : n.id;
      const corps = texteSimple(texte) ? texte : `"${encoderTexte(texte)}"`;
      lignes.push(`  ${n.id}${ouvrant[forme]}${corps}${fermant[forme]}`);
    }
    for (const l of m.liens) {
      const op = operateur[STYLES_LIEN.includes(l.style) ? l.style : 'fleche'];
      const t = l.texte && l.texte.trim() ? `|${encoderTexte(l.texte).replace(/\|/g, '#124;')}|` : '';
      lignes.push(`  ${l.de} ${op}${t} ${l.vers}`);
    }
    const pos = m.noeuds.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y)).map((n) => `${n.id}=${Math.round(n.x)},${Math.round(n.y)}`);
    if (pos.length) lignes.push(`  %% mdr:pos ${pos.join(';')}`);
    return lignes.join('\n');
  }

  function genererSequence(m) {
    const lignes = ['sequenceDiagram'];
    for (const p of m.participants) lignes.push(p.texte && p.texte !== p.id ? `  participant ${p.id} as ${encoderTexte(p.texte).replace(/;/g, '#59;')}` : `  participant ${p.id}`);
    for (const x of m.messages) {
      const t = encoderTexte(x.texte || '').replace(/;/g, '#59;').replace(/#quot;/g, '"');
      lignes.push(`  ${x.de}${TYPES_MESSAGE.includes(x.type) ? x.type : '->>'}${x.vers}: ${t}`.replace(/: $/, ':'));
    }
    return lignes.join('\n');
  }

  function generer(modele) {
    return modele.type === 'sequence' ? genererSequence(modele) : genererFlowchart(modele);
  }

  // ───────────────────────── Relecture ─────────────────────────

  const NON = (raison) => ({ ok: false, raison });

  // Lit une référence de nœud à `i` : { id, texte|null, forme|null, fin } ou { erreur }.
  function lireNoeud(s, i) {
    const m = RE_ID.exec(s.slice(i));
    if (!m) return { erreur: 'identifiant de nœud attendu' };
    const id = m[0];
    let p = i + id.length;
    const c = s[p];
    if (c !== '[' && c !== '(' && c !== '{') return { id, texte: null, forme: null, fin: p };
    let forme;
    let ferme;
    if (c === '[') {
      if (/[[(/\\>]/.test(s[p + 1] || '')) return { erreur: 'forme de nœud non gérée' };
      forme = 'rectangle'; ferme = ']'; p += 1;
    } else if (c === '(') {
      if (s[p + 1] === '(') { forme = 'cercle'; ferme = '))'; p += 2; if (s[p] === '(') return { erreur: 'forme de nœud non gérée' }; }
      else if (s[p + 1] === '[') return { erreur: 'forme de nœud non gérée' };
      else { forme = 'arrondi'; ferme = ')'; p += 1; }
    } else {
      if (s[p + 1] === '{') return { erreur: 'forme de nœud non gérée' };
      forme = 'losange'; ferme = '}'; p += 1;
    }
    let texte;
    if (s[p] === '"') {
      const q = s.indexOf('"', p + 1);
      if (q < 0) return { erreur: 'guillemet non fermé' };
      texte = s.slice(p + 1, q);
      p = q + 1;
      if (s.slice(p, p + ferme.length) !== ferme) return { erreur: 'fermeture de nœud attendue' };
    } else {
      const q = s.indexOf(ferme, p);
      if (q < 0) return { erreur: 'fermeture de nœud attendue' };
      texte = s.slice(p, q);
      p = q;
      if (/["[\](){}]/.test(texte) && forme !== 'cercle') return { erreur: 'texte de nœud complexe' };
    }
    return { id, texte: decoderTexte(texte), forme, fin: p + ferme.length };
  }

  const OPERATEURS = [
    { re: /^-->(?:\|([^|]*)\|)?/, style: 'fleche' },
    { re: /^---(?!-)(?:\|([^|]*)\|)?/, style: 'trait' },
    { re: /^-\.->(?:\|([^|]*)\|)?/, style: 'pointille' },
    { re: /^==>(?:\|([^|]*)\|)?/, style: 'epais' },
    { re: /^--\s+([^\-=.<>|]+?)\s+-->/, style: 'fleche' },
    { re: /^--\s+([^\-=.<>|]+?)\s+---/, style: 'trait' },
    { re: /^-\.\s+(.+?)\s+\.->/, style: 'pointille' },
    { re: /^==\s+(.+?)\s+==>/, style: 'epais' },
  ];

  function lireOperateur(s, i) {
    const reste = s.slice(i);
    for (const o of OPERATEURS) {
      const m = o.re.exec(reste);
      if (m) return { style: o.style, texte: m[1] !== undefined ? decoderTexte(m[1].replace(/#124;/g, '|')) : '', fin: i + m[0].length };
    }
    return null;
  }

  function analyserFlowchart(lignes, mot, direction) {
    const noeuds = new Map();
    const liens = [];
    let positions = null;
    const noter = (n) => {
      const existant = noeuds.get(n.id);
      if (!existant) noeuds.set(n.id, { id: n.id, texte: n.texte !== null ? n.texte : n.id, forme: n.forme || 'rectangle' });
      else if (n.texte !== null) { existant.texte = n.texte; existant.forme = n.forme; }
    };
    for (const brute of lignes) {
      const ligne = brute.trim();
      if (!ligne) continue;
      const pos = /^%%\s*mdr:pos\s+(.+)$/.exec(ligne);
      if (pos) {
        positions = {};
        for (const part of pos[1].split(';')) {
          const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(-?\d+),(-?\d+)\s*$/.exec(part);
          if (m) positions[m[1]] = { x: Number(m[2]), y: Number(m[3]) };
        }
        continue;
      }
      if (ligne.startsWith('%%')) continue;
      if (/^(subgraph|end|classDef|class|style|linkStyle|click|direction|accTitle|accDescr|title)\b/.test(ligne)) return NON('élément non géré : ' + ligne.split(/\s/)[0]);
      let s = ligne.replace(/;\s*$/, '');
      if (/&/.test(s.replace(/"[^"]*"/g, ''))) return NON('liens multiples (&) non gérés');
      let i = 0;
      let precedent = null;
      for (;;) {
        while (s[i] === ' ') i += 1;
        const n = lireNoeud(s, i);
        if (n.erreur) return NON(n.erreur + ' : « ' + ligne + ' »');
        noter(n);
        if (precedent && precedent.op) liens.push({ de: precedent.id, vers: n.id, texte: precedent.op.texte, style: precedent.op.style });
        i = n.fin;
        while (s[i] === ' ') i += 1;
        if (i >= s.length) break;
        const op = lireOperateur(s, i);
        if (!op) return NON('syntaxe non gérée : « ' + ligne + ' »');
        precedent = { id: n.id, op };
        i = op.fin;
        if (i >= s.length) return NON('lien sans destination : « ' + ligne + ' »');
      }
    }
    const liste = [...noeuds.values()];
    if (positions) for (const n of liste) if (positions[n.id]) { n.x = positions[n.id].x; n.y = positions[n.id].y; }
    const modele = { type: 'flowchart', mot, direction, noeuds: liste, liens };
    if (!liste.every((n) => Number.isFinite(n.x))) disposer(modele);
    return { ok: true, modele };
  }

  function analyserSequence(lignes) {
    const participants = new Map();
    const messages = [];
    const declarer = (id, texte) => {
      const p = participants.get(id);
      if (!p) participants.set(id, { id, texte: texte !== undefined ? texte : id });
      else if (texte !== undefined) p.texte = texte;
    };
    for (const brute of lignes) {
      const ligne = brute.trim();
      if (!ligne || ligne.startsWith('%%')) continue;
      const decl = /^participant\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+(.+))?$/.exec(ligne);
      if (decl) { declarer(decl[1], decl[2] !== undefined ? decoderTexte(decl[2]) : undefined); continue; }
      const msg = /^([A-Za-z_][A-Za-z0-9_]*)\s*(-->>|->>|-->|->)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(ligne)
        || /^([A-Za-z_][A-Za-z0-9_]*)\s*(-->>|->>|-->|->)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:?$/.exec(ligne);
      if (msg) {
        declarer(msg[1]); declarer(msg[3]);
        messages.push({ de: msg[1], vers: msg[3], texte: decoderTexte(msg[4] || ''), type: msg[2] });
        continue;
      }
      return NON('élément non géré : « ' + ligne + ' »');
    }
    return { ok: true, modele: { type: 'sequence', participants: [...participants.values()], messages } };
  }

  // Lit un code Mermaid : { ok: true, modele } ou { ok: false, raison }.
  function analyser(code) {
    const lignes = String(code).replace(/\r/g, '').split('\n');
    let k = 0;
    while (k < lignes.length && (!lignes[k].trim() || lignes[k].trim().startsWith('%%'))) k += 1;
    if (k >= lignes.length) return NON('diagramme vide');
    const entete = lignes[k].trim().replace(/;$/, '');
    const reste = lignes.slice(k + 1);
    let m = /^(flowchart|graph)(?:\s+(TB|TD|BT|RL|LR))?$/.exec(entete);
    if (m) return analyserFlowchart(reste, m[1], m[2] || 'TD');
    if (/^sequenceDiagram$/.test(entete)) return analyserSequence(reste);
    const type = entete.split(/\s/)[0];
    return NON(`type de diagramme non géré : ${type}`);
  }

  // ───────────────────────── Disposition ─────────────────────────

  // Place les nœuds en couches (rang = plus long chemin depuis une source ; les
  // retours arrière d'un cycle sont ignorés).
  function disposer(modele) {
    if (modele.type !== 'flowchart') return modele;
    const n = modele.noeuds.length;
    const rang = new Map(modele.noeuds.map((x) => [x.id, 0]));
    for (let tour = 0; tour < n; tour += 1) {
      let change = false;
      for (const l of modele.liens) {
        if (l.de === l.vers || !rang.has(l.de) || !rang.has(l.vers)) continue;
        if (rang.get(l.de) + 1 > rang.get(l.vers) && rang.get(l.de) + 1 < n) { rang.set(l.vers, rang.get(l.de) + 1); change = true; }
      }
      if (!change) break;
    }
    const maxRang = Math.max(0, ...rang.values());
    const colonnes = new Map();
    const horizontal = modele.direction === 'LR' || modele.direction === 'RL';
    const inverse = modele.direction === 'BT' || modele.direction === 'RL';
    for (const noeud of modele.noeuds) {
      const r = rang.get(noeud.id);
      const c = colonnes.get(r) || 0;
      colonnes.set(r, c + 1);
      const rr = inverse ? maxRang - r : r;
      if (horizontal) { noeud.x = 30 + rr * 210; noeud.y = 30 + c * 90; } else { noeud.x = 30 + c * 190; noeud.y = 30 + rr * 110; }
    }
    return modele;
  }

  // ───────────────────────── Blocs ```mermaid d'un document ─────────────────────────

  // Blocs `mermaid` du texte Markdown, dans l'ordre : { debut, fin, code, prefixe }.
  // `debut` / `fin` bornent le bloc entier (barrières comprises), `prefixe` est ce
  // qui précède chaque ligne (citation `> `, retrait de liste).
  function trouverBlocs(source) {
    const blocs = [];
    const lignes = String(source).split('\n');
    let offset = 0;
    let ouvert = null;
    for (const ligne of lignes) {
      const debutLigne = offset;
      offset += ligne.length + 1;
      if (!ouvert) {
        const m = /^((?:[ \t]*>)*[ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/.exec(ligne.replace(/\r$/, ''));
        if (m) ouvert = { debut: debutLigne, prefixe: m[1], barriere: m[2], mermaid: m[3].toLowerCase() === 'mermaid', contenu: [] };
        continue;
      }
      const sansCr = ligne.replace(/\r$/, '');
      const reste = sansCr.startsWith(ouvert.prefixe) ? sansCr.slice(ouvert.prefixe.length) : sansCr.replace(/^(?:[ \t]*>)*[ \t]?/, '');
      const ferme = new RegExp('^ {0,3}' + (ouvert.barriere[0] === '`' ? '`' : '~') + '{' + ouvert.barriere.length + ',}[ \\t]*$').test(reste);
      if (ferme) {
        if (ouvert.mermaid) blocs.push({ debut: ouvert.debut, fin: debutLigne + ligne.length, code: ouvert.contenu.join('\n'), prefixe: ouvert.prefixe });
        ouvert = null;
      } else ouvert.contenu.push(reste);
    }
    return blocs;
  }

  function blocBarriere(code) {
    let n = 3;
    for (const m of String(code).match(/^ *(`{3,})/gm) || []) n = Math.max(n, m.trim().length + 1);
    return '`'.repeat(n);
  }

  // Texte d'un bloc Markdown pour un code donné, avec le préfixe de ligne.
  function formaterBloc(code, prefixe = '') {
    const b = blocBarriere(code);
    return [`${b}mermaid`, ...String(code).split('\n'), b].map((l) => (l === '' ? prefixe.replace(/\s+$/, '') : prefixe + l)).join('\n');
  }

  // Remplace un bloc repéré par `trouverBlocs` ; renvoie le nouveau texte.
  function remplacerBloc(source, bloc, code) {
    return source.slice(0, bloc.debut) + formaterBloc(code, bloc.prefixe) + source.slice(bloc.fin);
  }

  // Bloc dont la plage contient la position (ou null).
  function blocA(source, position) {
    return trouverBlocs(source).find((b) => position >= b.debut && position <= b.fin) || null;
  }

  return {
    FORMES, DIRECTIONS, STYLES_LIEN, TYPES_MESSAGE,
    modeleVide, ajouterNoeud, supprimerNoeud, relier, ajouterParticipant, supprimerParticipant,
    generer, analyser, disposer, trouverBlocs, formaterBloc, remplacerBloc, blocA,
  };
});

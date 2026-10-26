// Éditeur de diagramme Mermaid visuel (sans code). Une modale à deux volets :
// à gauche le canevas (organigramme : nœuds déplaçables, liens, formes ; séquence :
// listes de participants et de messages), à droite les propriétés de la sélection
// et l'aperçu Mermaid en direct. Le code est généré et relu par
// renderer/lib/mermaid-visuel.js ; ici il n'y a que l'interface.
//
// Points d'entrée : commande `diagramme:nouveau` (menu Format, palette, barre
// d'outils, onglet Insertion du ruban), double-clic sur un diagramme de l'aperçu,
// double-clic sur un diagramme du mode Document. Un bloc non reconnu s'ouvre en
// lecture seule avec un message, sans jamais être réécrit.
(() => {
  const MV = window.mdrMermaid;
  const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

  const LIBELLES_FORMES = { rectangle: 'Rectangle', arrondi: 'Arrondi', losange: 'Losange', cercle: 'Cercle' };
  const LIBELLES_STYLES = { fleche: 'Flèche', trait: 'Trait', pointille: 'Pointillé', epais: 'Épais' };
  const LIBELLES_DIRECTIONS = [['TB', 'Haut → bas (TB)'], ['LR', 'Gauche → droite (LR)'], ['BT', 'Bas → haut (BT)'], ['RL', 'Droite → gauche (RL)']];
  const LIBELLES_MESSAGES = [['->>', 'Message (flèche)'], ['-->>', 'Réponse (pointillé, flèche)'], ['->', 'Trait plein'], ['-->', 'Trait pointillé']];

  let compteur = 0;

  // Rendu Mermaid d'un code dans `cible` ; renvoie true si le rendu a réussi.
  async function rendreMermaid(cible, code) {
    const id = 'dg-mmd-' + (compteur += 1);
    try {
      if (!window.mermaid) throw new Error('Mermaid indisponible');
      const { svg } = await window.mermaid.render(id, code);
      cible.innerHTML = svg;
      return true;
    } catch (e) {
      cible.textContent = '';
      cible.appendChild(el('div', 'dg-erreur', 'Aperçu impossible : ' + String((e && e.message) || e).split('\n')[0]));
      const parasite = document.getElementById('d' + id);
      if (parasite) parasite.remove();
      return false;
    }
  }

  // ───────────────────────── Éditeur d'organigramme ─────────────────────────

  function editeurFlowchart(modele, { aChange }) {
    const racine = el('div', 'dg-editeur');
    let selection = null; // { type: 'noeud', id } | { type: 'lien', index }
    let modeRelier = false;
    let sourceRelier = null;
    let formeParDefaut = 'rectangle';

    // Barre d'outils
    const barre = el('div', 'dg-barre');
    const btn = (id, libelle, titre, action) => {
      const b = el('button', 'dg-btn', libelle);
      b.type = 'button'; b.id = 'dg-' + id; b.title = titre;
      b.addEventListener('click', action);
      return b;
    };
    const selectForme = el('select'); selectForme.id = 'dg-forme-defaut'; selectForme.title = 'Forme du prochain nœud';
    for (const f of MV.FORMES) { const o = el('option', undefined, LIBELLES_FORMES[f]); o.value = f; selectForme.appendChild(o); }
    selectForme.addEventListener('change', () => { formeParDefaut = selectForme.value; });
    const selectDirection = el('select'); selectDirection.id = 'dg-direction'; selectDirection.title = 'Direction du diagramme';
    for (const [v, l] of LIBELLES_DIRECTIONS) { const o = el('option', undefined, l); o.value = v; selectDirection.appendChild(o); }
    selectDirection.value = modele.direction === 'TD' ? 'TB' : modele.direction;
    selectDirection.addEventListener('change', () => { modele.direction = selectDirection.value; MV.disposer(modele); dessiner(); aChange(); });
    const boutonRelier = btn('relier', 'Relier', 'Relier deux nœuds : cliquez le nœud de départ puis celui d’arrivée', () => { modeRelier = !modeRelier; sourceRelier = null; majBarre(); });
    barre.append(
      btn('ajouter', '＋ Nœud', 'Ajouter un nœud', () => ajouter()),
      selectForme, boutonRelier,
      btn('supprimer', 'Supprimer', 'Supprimer la sélection (Suppr)', () => supprimerSelection()),
      selectDirection,
      btn('disposer', 'Disposer', 'Replacer automatiquement les nœuds', () => { MV.disposer(modele); dessiner(); aChange(); }),
    );

    // Canevas
    const zoneCanevas = el('div', 'dg-canevas-zone');
    const canevas = el('div', 'dg-canevas');
    canevas.id = 'dg-canevas';
    canevas.tabIndex = 0;
    canevas.setAttribute('aria-label', 'Canevas du diagramme');
    zoneCanevas.appendChild(canevas);

    // Propriétés
    const props = el('div', 'dg-props');
    props.id = 'dg-props';

    racine.append(barre, zoneCanevas);

    function majBarre() {
      boutonRelier.classList.toggle('actif', modeRelier);
      canevas.classList.toggle('mode-relier', modeRelier);
      boutonRelier.textContent = modeRelier ? (sourceRelier ? 'Relier : choisir l’arrivée' : 'Relier : choisir le départ') : 'Relier';
    }

    function noeud(id) { return modele.noeuds.find((n) => n.id === id); }

    function ajouter() {
      const bas = Math.max(0, ...modele.noeuds.map((n) => (n.y || 0)));
      const n = MV.ajouterNoeud(modele, { texte: 'Nouveau nœud', forme: formeParDefaut, x: 40 + (modele.noeuds.length % 3) * 30, y: bas + 100 });
      selection = { type: 'noeud', id: n.id };
      dessiner();
      aChange();
      const t = props.querySelector('#dg-texte');
      if (t) { t.focus(); t.select(); }
    }

    function supprimerSelection() {
      if (!selection) return;
      if (selection.type === 'noeud') MV.supprimerNoeud(modele, selection.id);
      else modele.liens.splice(selection.index, 1);
      selection = null;
      dessiner();
      aChange();
    }

    function relier(de, vers) {
      const l = MV.relier(modele, de, vers);
      if (l) { selection = { type: 'lien', index: modele.liens.length - 1 }; dessiner(); aChange(); }
    }

    // ── Dessin ──
    let svg = null;
    function dessiner() {
      canevas.textContent = '';
      let maxX = 600;
      let maxY = 380;
      for (const n of modele.noeuds) {
        const d = el('div', `dg-noeud forme-${n.forme}${selection && selection.type === 'noeud' && selection.id === n.id ? ' selection' : ''}${sourceRelier === n.id ? ' source' : ''}`);
        d.dataset.id = n.id;
        d.style.left = n.x + 'px';
        d.style.top = n.y + 'px';
        const t = el('span', 'dg-texte', n.texte || n.id);
        d.appendChild(t);
        const poignee = el('span', 'dg-poignee');
        poignee.title = 'Glisser vers un autre nœud pour les relier';
        d.appendChild(poignee);
        canevas.appendChild(d);
        brancherNoeud(d, n, poignee);
      }
      svg = svgEl('svg', { class: 'dg-liens' });
      const defs = svgEl('defs');
      const marqueur = svgEl('marker', { id: 'dg-fleche', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse' });
      marqueur.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' }));
      defs.appendChild(marqueur);
      svg.appendChild(defs);
      canevas.insertBefore(svg, canevas.firstChild);
      dessinerLiens();
      for (const d of canevas.querySelectorAll('.dg-noeud')) { maxX = Math.max(maxX, d.offsetLeft + d.offsetWidth + 60); maxY = Math.max(maxY, d.offsetTop + d.offsetHeight + 60); }
      canevas.style.minWidth = maxX + 'px';
      canevas.style.minHeight = maxY + 'px';
      svg.setAttribute('width', String(maxX));
      svg.setAttribute('height', String(maxY));
      majProps();
      majBarre();
    }

    function rectDe(id) {
      const d = canevas.querySelector(`.dg-noeud[data-id="${id}"]`);
      return d ? { x: d.offsetLeft, y: d.offsetTop, w: d.offsetWidth, h: d.offsetHeight } : null;
    }

    // Point où le segment centre → (tx, ty) sort du rectangle.
    function bord(r, tx, ty) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const dx = tx - cx;
      const dy = ty - cy;
      if (dx === 0 && dy === 0) return { x: cx, y: cy };
      const sx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
      const sy = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
      const s = Math.min(sx, sy);
      return { x: cx + dx * s, y: cy + dy * s };
    }

    function dessinerLiens() {
      for (const e of [...svg.querySelectorAll('.dg-lien')]) e.remove();
      modele.liens.forEach((l, index) => {
        const a = rectDe(l.de);
        const b = rectDe(l.vers);
        if (!a || !b) return;
        const g = svgEl('g', { class: `dg-lien${selection && selection.type === 'lien' && selection.index === index ? ' selection' : ''}` });
        g.dataset.index = String(index);
        let d;
        let mx;
        let my;
        if (l.de === l.vers) {
          const x = a.x + a.w;
          const y = a.y + a.h / 2;
          d = `M${x},${y - 8} C${x + 50},${y - 40} ${x + 50},${y + 40} ${x},${y + 8}`;
          mx = x + 38; my = y;
        } else {
          const p1 = bord(a, b.x + b.w / 2, b.y + b.h / 2);
          const p2 = bord(b, a.x + a.w / 2, a.y + a.h / 2);
          d = `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
          mx = (p1.x + p2.x) / 2; my = (p1.y + p2.y) / 2;
        }
        const trait = svgEl('path', { d, class: `dg-trait style-${l.style}`, fill: 'none' });
        if (l.style !== 'trait') trait.setAttribute('marker-end', 'url(#dg-fleche)');
        const zoneClic = svgEl('path', { d, class: 'dg-clic', fill: 'none' });
        g.append(trait, zoneClic);
        if (l.texte && l.texte.trim()) {
          const t = svgEl('text', { x: String(mx), y: String(my), class: 'dg-lien-texte', 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
          t.textContent = l.texte;
          g.appendChild(t);
        }
        svg.appendChild(g);
        g.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); selection = { type: 'lien', index }; dessiner(); canevas.focus(); });
      });
    }

    // ── Interactions d'un nœud ──
    function brancherNoeud(d, n, poignee) {
      d.addEventListener('pointerdown', (ev) => {
        if (ev.target === poignee) return;
        ev.stopPropagation();
        if (modeRelier) {
          if (!sourceRelier) { sourceRelier = n.id; selection = { type: 'noeud', id: n.id }; dessiner(); } else { const de = sourceRelier; sourceRelier = null; modeRelier = false; relier(de, n.id); }
          return;
        }
        // Relier par sélection : Maj / Ctrl / Cmd + clic sur un autre nœud.
        if ((ev.shiftKey || ev.ctrlKey || ev.metaKey) && selection && selection.type === 'noeud' && selection.id !== n.id) {
          relier(selection.id, n.id);
          return;
        }
        const departX = ev.clientX;
        const departY = ev.clientY;
        const x0 = n.x;
        const y0 = n.y;
        let bouge = false;
        try { d.setPointerCapture(ev.pointerId); } catch { /* pointeur synthétique */ }
        const deplacer = (e) => {
          const dx = e.clientX - departX;
          const dy = e.clientY - departY;
          if (!bouge && Math.abs(dx) + Math.abs(dy) < 4) return;
          bouge = true;
          n.x = Math.max(0, Math.round(x0 + dx));
          n.y = Math.max(0, Math.round(y0 + dy));
          d.style.left = n.x + 'px';
          d.style.top = n.y + 'px';
          dessinerLiens();
        };
        const fin = () => {
          d.removeEventListener('pointermove', deplacer);
          d.removeEventListener('pointerup', fin);
          d.removeEventListener('pointercancel', fin);
          if (bouge) { dessiner(); aChange(); } else if (!selection || selection.type !== 'noeud' || selection.id !== n.id) { selection = { type: 'noeud', id: n.id }; dessiner(); }
          canevas.focus();
        };
        d.addEventListener('pointermove', deplacer);
        d.addEventListener('pointerup', fin);
        d.addEventListener('pointercancel', fin);
        if (!selection || selection.type !== 'noeud' || selection.id !== n.id) { selection = { type: 'noeud', id: n.id }; majSelectionVisuelle(); majProps(); }
      });
      d.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        selection = { type: 'noeud', id: n.id };
        majSelectionVisuelle();
        majProps();
        const t = props.querySelector('#dg-texte');
        if (t) { t.focus(); t.select(); }
      });
      // Poignée : glisser pour relier à un autre nœud.
      poignee.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        try { poignee.setPointerCapture(ev.pointerId); } catch { /* pointeur synthétique */ }
        const r = rectDe(n.id);
        const ligne = svgEl('line', { class: 'dg-elastique', x1: String(r.x + r.w / 2), y1: String(r.y + r.h / 2), x2: String(r.x + r.w / 2), y2: String(r.y + r.h / 2) });
        svg.appendChild(ligne);
        const cr = canevas.getBoundingClientRect();
        const deplacer = (e) => { ligne.setAttribute('x2', String(e.clientX - cr.left + zoneCanevas.scrollLeft)); ligne.setAttribute('y2', String(e.clientY - cr.top + zoneCanevas.scrollTop)); };
        const fin = (e) => {
          poignee.removeEventListener('pointermove', deplacer);
          poignee.removeEventListener('pointerup', fin);
          poignee.removeEventListener('pointercancel', fin);
          ligne.remove();
          // Le nœud sous le pointeur, par ses rectangles : elementFromPoint ne
          // voit rien hors de la zone affichée (canevas défilé, petite fenêtre).
          const noeudCible = Array.from(canevas.querySelectorAll('.dg-noeud')).find(d => {
            const b = d.getBoundingClientRect();
            return d !== poignee.parentElement && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
          }) || null;
          if (noeudCible && canevas.contains(noeudCible)) relier(n.id, noeudCible.dataset.id);
        };
        poignee.addEventListener('pointermove', deplacer);
        poignee.addEventListener('pointerup', fin);
        poignee.addEventListener('pointercancel', fin);
      });
    }

    function majSelectionVisuelle() {
      for (const d of canevas.querySelectorAll('.dg-noeud')) d.classList.toggle('selection', !!selection && selection.type === 'noeud' && selection.id === d.dataset.id);
    }

    canevas.addEventListener('pointerdown', (ev) => {
      if (ev.target !== canevas) return;
      selection = null; sourceRelier = null; dessiner(); canevas.focus();
    });
    canevas.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && selection) { ev.preventDefault(); supprimerSelection(); }
    });

    // ── Propriétés ──
    function majProps() {
      props.textContent = '';
      if (!selection) {
        props.appendChild(el('p', 'dg-aide', 'Cliquez un nœud ou un lien pour le modifier. Glissez la poignée ● d’un nœud sur un autre pour les relier, ou sélectionnez un nœud puis Maj+clic sur un autre.'));
        return;
      }
      if (selection.type === 'noeud') {
        const n = noeud(selection.id);
        if (!n) return;
        const lt = el('label', undefined, 'Texte du nœud');
        const t = el('textarea'); t.id = 'dg-texte'; t.rows = 2; t.value = n.texte;
        t.addEventListener('input', () => {
          n.texte = t.value;
          const d = canevas.querySelector(`.dg-noeud[data-id="${n.id}"] .dg-texte`);
          if (d) d.textContent = n.texte || n.id;
          dessinerLiens();
          aChange();
        });
        lt.appendChild(t);
        const lf = el('label', undefined, 'Forme');
        const f = el('select'); f.id = 'dg-forme';
        for (const x of MV.FORMES) { const o = el('option', undefined, LIBELLES_FORMES[x]); o.value = x; f.appendChild(o); }
        f.value = n.forme;
        f.addEventListener('change', () => { n.forme = f.value; dessiner(); aChange(); });
        lf.appendChild(f);
        const sup = el('button', 'dg-btn', 'Supprimer le nœud'); sup.type = 'button'; sup.id = 'dg-supprimer-noeud';
        sup.addEventListener('click', supprimerSelection);
        props.append(lt, lf, sup);
      } else {
        const l = modele.liens[selection.index];
        if (!l) return;
        const lt = el('label', undefined, 'Texte sur le lien');
        const t = el('input'); t.type = 'text'; t.id = 'dg-texte-lien'; t.value = l.texte || '';
        t.addEventListener('input', () => { l.texte = t.value; dessinerLiens(); aChange(); });
        lt.appendChild(t);
        const ls = el('label', undefined, 'Style du lien');
        const s = el('select'); s.id = 'dg-style-lien';
        for (const x of MV.STYLES_LIEN) { const o = el('option', undefined, LIBELLES_STYLES[x]); o.value = x; s.appendChild(o); }
        s.value = l.style;
        s.addEventListener('change', () => { l.style = s.value; dessinerLiens(); aChange(); });
        ls.appendChild(s);
        const inv = el('button', 'dg-btn', 'Inverser le sens'); inv.type = 'button'; inv.id = 'dg-inverser-lien';
        inv.addEventListener('click', () => { [l.de, l.vers] = [l.vers, l.de]; dessiner(); aChange(); });
        const sup = el('button', 'dg-btn', 'Supprimer le lien'); sup.type = 'button'; sup.id = 'dg-supprimer-lien';
        sup.addEventListener('click', supprimerSelection);
        props.append(lt, ls, inv, sup);
      }
    }

    dessiner();
    return {
      racine, props,
      api: {
        selectionner: (s) => { selection = s; dessiner(); },
        ajouter, relier, supprimerSelection, dessiner,
        etat: () => ({ selection, modeRelier }),
      },
    };
  }

  // ───────────────────────── Éditeur de séquence ─────────────────────────

  function editeurSequence(modele, { aChange }) {
    const racine = el('div', 'dg-editeur sequence');
    const props = el('div', 'dg-props');
    const listeP = el('div', 'dg-liste');
    listeP.id = 'dg-participants';
    const listeM = el('div', 'dg-liste');
    listeM.id = 'dg-messages';

    function options(select, valeur) {
      select.textContent = '';
      for (const p of modele.participants) { const o = el('option', undefined, p.texte || p.id); o.value = p.id; select.appendChild(o); }
      select.value = valeur;
    }

    function dessiner() {
      listeP.textContent = '';
      listeP.appendChild(el('h4', undefined, 'Participants'));
      modele.participants.forEach((p) => {
        const ligne = el('div', 'dg-ligne');
        const t = el('input'); t.type = 'text'; t.value = p.texte; t.setAttribute('aria-label', 'Nom du participant'); t.dataset.id = p.id;
        t.addEventListener('input', () => { p.texte = t.value; majMessagesSansFocus(); aChange(); });
        const sup = el('button', 'dg-btn', '✕'); sup.type = 'button'; sup.title = 'Supprimer le participant (et ses messages)'; sup.dataset.action = 'supprimer-participant';
        sup.addEventListener('click', () => { MV.supprimerParticipant(modele, p.id); dessiner(); aChange(); });
        ligne.append(t, sup);
        listeP.appendChild(ligne);
      });
      const ajoutP = el('button', 'dg-btn', '＋ Participant'); ajoutP.type = 'button'; ajoutP.id = 'dg-ajouter-participant';
      ajoutP.addEventListener('click', () => { MV.ajouterParticipant(modele, 'Participant ' + (modele.participants.length + 1)); dessiner(); aChange(); });
      listeP.appendChild(ajoutP);
      dessinerMessages();
    }

    function majMessagesSansFocus() {
      // Les listes de destinataires reprennent les noms à jour.
      listeM.querySelectorAll('select[data-champ="de"], select[data-champ="vers"]').forEach((s) => {
        const v = s.value;
        options(s, v);
      });
    }

    function dessinerMessages() {
      listeM.textContent = '';
      listeM.appendChild(el('h4', undefined, 'Messages'));
      modele.messages.forEach((m, i) => {
        const ligne = el('div', 'dg-ligne message');
        const de = el('select'); de.dataset.champ = 'de'; de.setAttribute('aria-label', 'Expéditeur'); options(de, m.de);
        de.addEventListener('change', () => { m.de = de.value; aChange(); });
        const type = el('select'); type.dataset.champ = 'type'; type.setAttribute('aria-label', 'Type de message');
        for (const [v, l] of LIBELLES_MESSAGES) { const o = el('option', undefined, l); o.value = v; type.appendChild(o); }
        type.value = m.type;
        type.addEventListener('change', () => { m.type = type.value; aChange(); });
        const vers = el('select'); vers.dataset.champ = 'vers'; vers.setAttribute('aria-label', 'Destinataire'); options(vers, m.vers);
        vers.addEventListener('change', () => { m.vers = vers.value; aChange(); });
        const t = el('input'); t.type = 'text'; t.value = m.texte; t.placeholder = 'Texte du message'; t.dataset.champ = 'texte'; t.setAttribute('aria-label', 'Texte du message');
        t.addEventListener('input', () => { m.texte = t.value; aChange(); });
        const haut = el('button', 'dg-btn', '↑'); haut.type = 'button'; haut.title = 'Monter'; haut.disabled = i === 0;
        haut.addEventListener('click', () => { [modele.messages[i - 1], modele.messages[i]] = [modele.messages[i], modele.messages[i - 1]]; dessinerMessages(); aChange(); });
        const bas = el('button', 'dg-btn', '↓'); bas.type = 'button'; bas.title = 'Descendre'; bas.disabled = i === modele.messages.length - 1;
        bas.addEventListener('click', () => { [modele.messages[i + 1], modele.messages[i]] = [modele.messages[i], modele.messages[i + 1]]; dessinerMessages(); aChange(); });
        const sup = el('button', 'dg-btn', '✕'); sup.type = 'button'; sup.title = 'Supprimer le message'; sup.dataset.action = 'supprimer-message';
        sup.addEventListener('click', () => { modele.messages.splice(i, 1); dessinerMessages(); aChange(); });
        ligne.append(de, type, vers, t, haut, bas, sup);
        listeM.appendChild(ligne);
      });
      const ajoutM = el('button', 'dg-btn', '＋ Message'); ajoutM.type = 'button'; ajoutM.id = 'dg-ajouter-message';
      ajoutM.addEventListener('click', () => {
        if (modele.participants.length < 1) return;
        const a = modele.participants[0].id;
        const b = (modele.participants[1] || modele.participants[0]).id;
        modele.messages.push({ de: a, vers: b, texte: 'Message', type: '->>' });
        dessinerMessages();
        aChange();
      });
      listeM.appendChild(ajoutM);
    }

    racine.append(listeP, listeM);
    dessiner();
    return { racine, props, api: { dessiner } };
  }

  // ───────────────────────── Modale ─────────────────────────

  // Ouvre l'éditeur. `code` : code Mermaid d'un diagramme existant, ou null pour
  // un nouveau. Promesse du nouveau code, ou null (annulation, lecture seule).
  function editer(code) {
    const nouveau = !code || !String(code).trim();
    const lecture = nouveau ? { ok: true, modele: MV.modeleVide('flowchart') } : MV.analyser(code);
    return new Promise((resolve) => {
      let fini = false;
      const terminer = (v) => { if (!fini) { fini = true; resolve(v); } };
      let modele = lecture.ok ? lecture.modele : null;
      let editeur = null;
      let apercu;
      let codeBrut;
      let minuterie = null;
      let corpsGauche;
      let colonneDroite;
      let message;

      const generer = () => (modele ? MV.generer(modele) : code);

      function majApercu() {
        clearTimeout(minuterie);
        minuterie = setTimeout(() => {
          const c = generer();
          if (codeBrut) codeBrut.textContent = c;
          rendreMermaid(apercu, c);
        }, 120);
      }

      function monter() {
        corpsGauche.textContent = '';
        if (editeur && editeur.props.parentNode) editeur.props.remove();
        editeur = modele.type === 'sequence' ? editeurSequence(modele, { aChange: majApercu }) : editeurFlowchart(modele, { aChange: majApercu });
        corpsGauche.appendChild(editeur.racine);
        colonneDroite.insertBefore(editeur.props, colonneDroite.firstChild);
        // Les mesures des nœuds n'existent qu'une fois le canevas dans la page.
        if (editeur.api.dessiner) editeur.api.dessiner();
        majApercu();
      }

      const poignee = window.mdr.modale.ouvrir({
        id: 'diagramme-modal',
        titre: lecture.ok ? (nouveau ? 'Nouveau diagramme' : 'Modifier le diagramme') : 'Diagramme (lecture seule)',
        classe: 'diagramme',
        corps(zone) {
          const colonnes = el('div', 'dg-colonnes');
          corpsGauche = el('div', 'dg-gauche');
          colonneDroite = el('div', 'dg-droite');
          apercu = el('div', 'dg-apercu');
          apercu.id = 'dg-apercu';
          codeBrut = el('pre', 'dg-code');
          codeBrut.id = 'dg-code';
          codeBrut.setAttribute('aria-label', 'Code Mermaid généré');
          colonneDroite.append(el('div', 'dg-titre', 'Aperçu en direct'), apercu, el('div', 'dg-titre', 'Code Mermaid'), codeBrut);
          if (!lecture.ok) {
            message = el('div', 'dg-lecture');
            message.id = 'dg-lecture';
            message.append(el('strong', undefined, 'Ce diagramme ne peut pas être modifié visuellement. '), document.createTextNode(`${lecture.raison}. Il est affiché en lecture seule et reste inchangé dans le document ; modifiez son code en mode code.`));
            corpsGauche.appendChild(message);
            const lectureCode = el('pre', 'dg-code lecture'); lectureCode.textContent = code;
            corpsGauche.appendChild(lectureCode);
            codeBrut.textContent = code;
            rendreMermaid(apercu, code);
          } else {
            if (nouveau) {
              const choix = el('label', 'dg-type', 'Type de diagramme ');
              const s = el('select'); s.id = 'dg-type';
              for (const [v, l] of [['flowchart', 'Organigramme'], ['sequence', 'Séquence (participants et messages)']]) { const o = el('option', undefined, l); o.value = v; s.appendChild(o); }
              s.addEventListener('change', () => { modele = MV.modeleVide(s.value); monter(); });
              choix.appendChild(s);
              zone.appendChild(choix);
            }
            monter();
          }
          colonnes.append(corpsGauche, colonneDroite);
          zone.appendChild(colonnes);
        },
        boutons: lecture.ok
          ? [
            { libelle: 'Annuler', id: 'dg-annuler' },
            {
              libelle: nouveau ? 'Insérer' : 'Remplacer', id: 'dg-valider', primaire: true,
              action: () => {
                const vide = modele.type === 'sequence' ? !modele.participants.length : !modele.noeuds.length;
                if (vide) { window.alert('Ajoutez au moins un élément au diagramme.'); return false; }
                terminer(MV.generer(modele));
                return true;
              },
            },
          ]
          : [{ libelle: 'Fermer', id: 'dg-fermer', primaire: true }],
        auFermer: () => { clearTimeout(minuterie); terminer(null); },
      });
      void poignee;
    });
  }

  // ───────────────────────── Points d'entrée ─────────────────────────

  const editeurCm = () => window.mdr.editeur();

  // Mode code : diagramme sous le curseur (remplacé) ou nouveau bloc inséré.
  async function depuisCode() {
    const ed = editeurCm();
    if (!ed) return null;
    const source = ed.getValue();
    const tete = ed.view.state.selection.main.head;
    const bloc = MV.blocA(source, tete);
    if (bloc) {
      const code = await editer(bloc.code);
      if (code) { ed.view.dispatch({ changes: { from: bloc.debut, to: bloc.fin, insert: MV.formaterBloc(code, bloc.prefixe) } }); ed.focus(); }
      return code;
    }
    const code = await editer(null);
    if (!code) return null;
    const etat = ed.view.state;
    const ligne = etat.doc.lineAt(Math.min(tete, etat.doc.length));
    const texte = MV.formaterBloc(code);
    if (ligne.text.trim() === '') ed.view.dispatch({ changes: { from: ligne.from, to: ligne.to, insert: texte }, selection: { anchor: ligne.from + texte.length } });
    else ed.view.dispatch({ changes: { from: ligne.to, insert: '\n\n' + texte + '\n' }, selection: { anchor: ligne.to + 2 + texte.length } });
    ed.focus();
    return code;
  }

  async function commande() {
    const doc = window.mdr.document;
    if (doc && doc.actif()) return doc.dialogues.diagramme();
    return depuisCode();
  }

  // Double-clic sur un diagramme de l'aperçu : le n-ième `.mermaid` correspond au
  // n-ième bloc ```mermaid du texte.
  async function depuisApercu(cible) {
    const ed = editeurCm();
    if (!ed) return null;
    const tous = [...window.mdr.apercu().querySelectorAll('.mermaid')];
    const idx = tous.indexOf(cible);
    const blocs = MV.trouverBlocs(ed.getValue());
    const bloc = idx >= 0 ? blocs[idx] : null;
    if (!bloc) return null;
    const code = await editer(bloc.code);
    if (code) {
      // Le texte a pu changer pendant la modale : on relocalise le même bloc.
      const actuel = MV.trouverBlocs(ed.getValue())[idx];
      if (actuel && actuel.code === bloc.code) ed.view.dispatch({ changes: { from: actuel.debut, to: actuel.fin, insert: MV.formaterBloc(code, actuel.prefixe) } });
    }
    return code;
  }

  document.addEventListener('dblclick', (e) => {
    const apercu = document.getElementById('preview');
    if (!apercu || !e.target.closest) return;
    const m = e.target.closest('.mermaid');
    if (m && apercu.contains(m) && !(window.mdr.document && window.mdr.document.actif())) { e.preventDefault(); depuisApercu(m); }
  });

  window.commands.register({ id: 'diagramme:nouveau', titre: 'Diagramme : insérer ou modifier (éditeur visuel)…', executer: commande });
  window.commands.register({ id: 'diagramme:modifier', titre: 'Diagramme : modifier celui sous le curseur (éditeur visuel)…', executer: commande });

  // Barre d'outils de mise en forme (mode code) : un bouton « Diagramme ».
  function ajouterBouton() {
    const barre = document.getElementById('barre-format');
    if (!barre || document.getElementById('btn-diagramme')) return;
    const groupe = el('span', 'groupe');
    const b = el('button', undefined, '⛓');
    b.type = 'button'; b.id = 'btn-diagramme'; b.dataset.format = 'diagramme:nouveau';
    b.title = 'Diagramme visuel (Mermaid)'; b.setAttribute('aria-label', 'Diagramme visuel');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => window.commands.run('diagramme:nouveau'));
    groupe.appendChild(b);
    barre.appendChild(groupe);
  }
  ajouterBouton();

  window.mdr = window.mdr || {};
  window.mdr.diagramme = { editer, commande, depuisCode, depuisApercu, rendreMermaid };
})();

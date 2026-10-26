// Statistiques avancées : modale ouverte par un clic sur les statistiques de la
// barre d'état ou par la commande « Statistiques… ». Le calcul est pur
// (renderer/lib/statistiques.js) ; l'objectif de mots se règle dans
// Réglages → Général et s'affiche aussi dans la barre d'état (renderer.js).
(() => {
  const lib = window.mdrStatistiques;
  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };
  const nombre = (n) => new Intl.NumberFormat('fr-FR').format(n);
  const decimal = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
  const LANGUES = { fr: 'français', en: 'anglais', inconnue: 'indéterminée' };
  const dureeMin = (m) => (m < 1 ? '< 1 min' : decimal(m) + ' min');

  const ligne = (zone, libelle, valeur) => {
    const l = el('div', undefined, 'stats-ligne');
    l.append(el('span', libelle, 'stats-libelle'), el('span', valeur, 'stats-valeur'));
    zone.appendChild(l);
    return l;
  };

  function construireCorps(zone, a) {
    zone.appendChild(el('h4', 'Vue d’ensemble'));
    const g = el('div', undefined, 'stats-grille');
    ligne(g, 'Mots', nombre(a.mots));
    ligne(g, 'Caractères', nombre(a.caracteres));
    ligne(g, 'Phrases', nombre(a.phrases));
    ligne(g, 'Paragraphes', nombre(a.paragraphes));
    ligne(g, 'Temps de lecture', dureeMin(a.tempsLecture) + ' (' + lib.MOTS_PAR_MINUTE + ' mots/min)');
    ligne(g, 'Langue', LANGUES[a.langue] || a.langue.toUpperCase()).id = 'stats-langue';
    zone.appendChild(g);

    zone.appendChild(el('h4', 'Objectif de mots'));
    if (a.objectif) {
      const barre = el('div', undefined, 'stats-barre');
      barre.setAttribute('role', 'progressbar');
      barre.setAttribute('aria-valuenow', String(a.objectif.pourcentage));
      barre.setAttribute('aria-valuemin', '0');
      barre.setAttribute('aria-valuemax', '100');
      const rempli = el('div', undefined, 'stats-barre-remplie');
      rempli.style.width = a.objectif.pourcentage + '%';
      barre.appendChild(rempli);
      zone.appendChild(barre);
      const t = el('div', `${nombre(a.objectif.mots)} / ${nombre(a.objectif.objectif)} mots · ${a.objectif.pourcentage} %${a.objectif.atteint ? ' · objectif atteint' : ''}`, 'stats-objectif');
      t.id = 'stats-objectif';
      zone.appendChild(t);
    } else {
      const t = el('div', 'Aucun objectif défini. Réglages → Général → « Objectif de mots du document ».', 'stats-vide');
      t.id = 'stats-objectif';
      zone.appendChild(t);
    }

    zone.appendChild(el('h4', 'Lisibilité'));
    const lis = el('div', undefined, 'stats-lisibilite');
    lis.id = 'stats-lisibilite';
    lis.textContent = a.lisibilite
      ? `${a.lisibilite.formule} : ${decimal(a.lisibilite.indice)} — ${a.lisibilite.niveau}`
      : a.mots === 0 ? 'Rien à analyser.' : 'Indice indisponible : langue non reconnue (ajoutez « lang: fr » ou « lang: en » au front-matter) ou texte trop court.';
    zone.appendChild(lis);

    zone.appendChild(el('h4', 'Temps de lecture par section'));
    const tab = el('table', undefined, 'stats-sections');
    tab.id = 'stats-sections';
    for (const s of a.sections) {
      const tr = el('tr');
      const td = el('td', s.titre || '(sans titre)');
      td.style.paddingLeft = (Math.max(0, s.niveau - 1) * 14) + 'px';
      tr.append(td, el('td', nombre(s.mots) + ' mots'), el('td', dureeMin(s.minutes)));
      tab.appendChild(tr);
    }
    if (!a.sections.length) tab.appendChild(el('tr')).appendChild(el('td', 'Aucune section.'));
    zone.appendChild(tab);

    zone.appendChild(el('h4', 'Mots les plus fréquents'));
    const f = el('div', undefined, 'stats-frequents');
    f.id = 'stats-frequents';
    if (!a.frequents.length) f.textContent = 'Aucun mot significatif.';
    for (const { mot, nb } of a.frequents) {
      const p = el('span', undefined, 'stats-mot');
      p.append(el('b', mot), ' ' + nb);
      f.appendChild(p);
    }
    zone.appendChild(f);
  }

  function ouvrir() {
    const source = window.mdr.rendu.sourceActive();
    const a = lib.analyser(source, { objectif: window.mdr.reglages.get('objectifMots') });
    return window.mdr.modale.ouvrir({
      id: 'stats-modale',
      titre: 'Statistiques',
      classe: 'statistiques',
      corps: (zone) => construireCorps(zone, a),
      boutons: [
        { libelle: 'Régler l’objectif…', id: 'stats-reglages', action: () => { setTimeout(() => window.mdr.reglagesUI.ouvrir('general'), 0); return true; } },
        { libelle: 'Fermer', id: 'stats-fermer', primaire: true },
      ],
    });
  }

  const zoneStats = document.getElementById('stats');
  if (zoneStats) {
    zoneStats.setAttribute('role', 'button');
    zoneStats.tabIndex = 0;
    zoneStats.title = 'Statistiques détaillées';
    zoneStats.classList.add('cliquable');
    zoneStats.addEventListener('click', ouvrir);
    zoneStats.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } });
  }

  window.commands.register({ id: 'stats:ouvrir', titre: 'Statistiques…', executer: ouvrir });
  window.mdr = window.mdr || {};
  window.mdr.statistiques = { ouvrir };
})();

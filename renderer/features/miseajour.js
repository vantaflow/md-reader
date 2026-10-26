// Vérification des mises à jour. Commande « Rechercher les mises à jour… »
// (menu Aide, palette) : la requête à GitHub est faite par le processus
// principal (miseajour.js) — la CSP de la page interdit tout accès réseau.
// La modale annonce « dernière version » ou « version X disponible » avec les
// notes ; « Télécharger » ouvre la page dans le navigateur (l'adresse est
// revalidée côté principal). Rien n'est jamais installé sans action de
// l'utilisateur. Réglage « Vérifier au démarrage » : désactivé par défaut,
// au plus une vérification par jour, silencieuse sauf si une version existe.
(() => {
  const el = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };

  function afficher(zone, bouton, r) {
    zone.textContent = '';
    bouton.hidden = true;
    const msg = (texte, id, classe) => { const p = el('p', texte, classe || 'maj-message'); p.id = id; zone.appendChild(p); return p; };
    switch (r && r.statut) {
      case 'a-jour':
        msg(`Vous avez la dernière version (${r.versionActuelle}).`, 'maj-etat');
        break;
      case 'disponible': {
        msg(`La version ${r.version} est disponible (vous avez la ${r.versionActuelle}).`, 'maj-etat');
        if (r.asset) zone.appendChild(el('p', `Installeur proposé : ${r.asset.nom}`, 'maj-asset')).id = 'maj-asset';
        else zone.appendChild(el('p', 'Aucun installeur pour votre système : la page de la version s’ouvrira.', 'maj-asset')).id = 'maj-asset';
        if (r.notes) {
          zone.appendChild(el('h4', 'Notes de version'));
          const n = el('div', r.notes, 'maj-notes');
          n.id = 'maj-notes';
          zone.appendChild(n);
        }
        zone.appendChild(el('p', 'L’installation n’est jamais lancée automatiquement : « Télécharger » ouvre simplement la page dans votre navigateur.', 'maj-note'));
        bouton.hidden = false;
        bouton.dataset.url = r.url;
        break;
      }
      case 'aucune-release':
        msg('Aucune version n’a encore été publiée : il n’y a rien à télécharger pour l’instant.', 'maj-etat');
        break;
      case 'limite':
        msg(r.message || 'Limite de requêtes de GitHub atteinte, réessayez plus tard.', 'maj-etat', 'maj-message maj-erreur');
        break;
      case 'erreur':
        msg(r.message || 'La vérification a échoué.', 'maj-etat', 'maj-message maj-erreur');
        break;
      default:
        msg('Réponse inattendue.', 'maj-etat', 'maj-message maj-erreur');
    }
  }

  // Vérification manuelle : la modale s'ouvre aussitôt, puis se met à jour.
  async function rechercher() {
    let zoneRef; let boutonRef;
    const m = window.mdr.modale.ouvrir({
      id: 'maj-modale',
      titre: 'Mises à jour',
      classe: 'maj',
      corps(zone) { zoneRef = zone; zone.appendChild(el('p', 'Vérification en cours…', 'maj-message')).id = 'maj-etat'; },
      boutons: [
        { libelle: 'Fermer', id: 'maj-fermer' },
        {
          libelle: 'Télécharger', id: 'maj-telecharger', primaire: true,
          action: () => { telecharger(boutonRef.dataset.url); return false; },
        },
      ],
    });
    boutonRef = m.racine.querySelector('#maj-telecharger');
    boutonRef.hidden = true;
    let r;
    try { r = await window.api.verifierMiseAJour({}); } catch (e) { r = { statut: 'erreur', message: 'Vérification impossible : ' + (e && e.message ? e.message : e) }; }
    reglagesNote();
    if (!m.ferme) afficher(zoneRef, boutonRef, r);
    return r;
  }

  const reglagesNote = () => { try { window.mdr.reglages.set('derniereVerifMaj', Date.now()); } catch { /* sans importance */ } };

  async function telecharger(url) {
    let r;
    try { r = await window.api.ouvrirTelechargement(url); } catch (e) { r = { ok: false, erreur: e && e.message ? e.message : String(e) }; }
    const zone = document.querySelector('#maj-modale .modale-corps');
    if (zone) {
      const ancien = zone.querySelector('#maj-retour');
      if (ancien) ancien.remove();
      const p = el('p', r && r.ok ? 'Page ouverte dans votre navigateur.' : 'Échec : ' + ((r && r.erreur) || 'inconnu'), r && r.ok ? 'maj-note' : 'maj-erreur');
      p.id = 'maj-retour';
      zone.appendChild(p);
    }
    return r;
  }

  // Au démarrage : le processus principal décide (réglage actif, une fois par jour).
  async function verifierAuDemarrage() {
    const s = window.mdr.reglages;
    if (!s.get('verifierMaj')) return null;
    let r;
    try { r = await window.api.verifierMiseAJour({ demarrage: true, actif: true, derniere: s.get('derniereVerifMaj') }); } catch { return null; }
    if (!r || r.statut === 'pas-necessaire') return r;
    s.set('derniereVerifMaj', Date.now());
    if (r.statut === 'disponible') {
      const m = window.mdr.modale.ouvrir({
        id: 'maj-modale', titre: 'Mises à jour', classe: 'maj',
        corps: () => {},
        boutons: [{ libelle: 'Plus tard', id: 'maj-fermer' }, { libelle: 'Télécharger', id: 'maj-telecharger', primaire: true, action: () => { telecharger(m.racine.querySelector('#maj-telecharger').dataset.url); return false; } }],
      });
      afficher(m.zone, m.racine.querySelector('#maj-telecharger'), r);
    }
    return r;
  }

  window.commands.register({ id: 'aide:maj', titre: 'Rechercher les mises à jour…', executer: rechercher });
  window.mdr = window.mdr || {};
  window.mdr.miseajour = { rechercher, verifierAuDemarrage, telecharger };
  // Laisse l'application finir de démarrer (onglets, réglages) avant de contacter GitHub.
  setTimeout(() => { verifierAuDemarrage(); }, 4000);
})();

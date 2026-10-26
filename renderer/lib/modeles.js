// Modèles de documents (compte rendu, spécification, README, lettre) : contenus
// français prêts à remplir. `{{date}}` est remplacé par la date du jour, écrite
// en français. Format UMD : global `window.mdrModeles` dans le renderer.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrModeles = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  const MODELES = [
    {
      id: 'compte-rendu',
      nom: 'Compte rendu de réunion',
      description: 'Participants, ordre du jour, décisions et actions',
      titre: 'Compte rendu',
      contenu: `# Compte rendu de réunion

- **Date** : {{date}}
- **Lieu / lien** :
- **Rédacteur** :

## Participants

| Nom | Fonction | Présent |
| --- | --- | :-: |
|  |  | oui |
|  |  | oui |

## Ordre du jour

1. Point d'avancement
2. Sujets à décider
3. Questions diverses

## Discussion

### Point d'avancement

-

### Sujets à décider

-

## Décisions

- [ ] Décision 1
- [ ] Décision 2

## Actions

| Action | Responsable | Échéance |
| --- | --- | --- |
|  |  |  |

## Prochaine réunion

Date et lieu à confirmer.
`,
    },
    {
      id: 'specification',
      nom: 'Spécification fonctionnelle',
      description: 'Contexte, objectifs, exigences, critères d’acceptation',
      titre: 'Spécification',
      contenu: `# Spécification : titre de la fonctionnalité

> **Statut** : brouillon · **Auteur** : · **Date** : {{date}}

## 1. Contexte

Décrivez le problème rencontré et les personnes concernées.

## 2. Objectifs

- Objectif principal :
- Objectifs secondaires :

## 3. Hors périmètre

- Ce que cette spécification ne couvre pas.

## 4. Exigences fonctionnelles

| Réf. | Exigence | Priorité |
| --- | --- | :-: |
| EF-1 |  | Haute |
| EF-2 |  | Moyenne |

## 5. Exigences non fonctionnelles

- Performance :
- Sécurité :
- Accessibilité :

## 6. Parcours utilisateur

1. L'utilisateur…
2. Le système…
3. Résultat attendu :

## 7. Critères d'acceptation

- [ ] Étant donné…, quand…, alors…
- [ ] Étant donné…, quand…, alors…

## 8. Risques et questions ouvertes

- Risque :
- Question :
`,
    },
    {
      id: 'readme',
      nom: 'README de projet',
      description: 'Présentation, installation, utilisation, contribution',
      titre: 'README',
      contenu: `# Nom du projet

Une phrase qui explique à quoi sert le projet.

## Fonctionnalités

- Première fonctionnalité
- Deuxième fonctionnalité

## Installation

\`\`\`bash
git clone https://exemple.org/projet.git
cd projet
npm install
\`\`\`

## Utilisation

\`\`\`bash
npm start
\`\`\`

Décrivez ici les cas d'usage courants.

## Configuration

| Variable | Rôle | Valeur par défaut |
| --- | --- | --- |
| \`PORT\` | Port d'écoute | \`3000\` |

## Tests

\`\`\`bash
npm test
\`\`\`

## Contribuer

Les contributions sont les bienvenues : ouvrez une issue pour en discuter, puis proposez une pull request.

## Licence

Distribué sous licence MIT. Voir le fichier \`LICENSE\`.
`,
    },
    {
      id: 'lettre',
      nom: 'Lettre',
      description: 'Lettre formelle avec coordonnées, objet et formule de politesse',
      titre: 'Lettre',
      contenu: `Prénom Nom  
Adresse  
Code postal Ville  
Téléphone · Courriel

Prénom Nom du destinataire  
Fonction ou société  
Adresse  
Code postal Ville

Fait à Ville, le {{date}}

**Objet : objet de la lettre**

Madame, Monsieur,

Premier paragraphe : exposez la raison de votre courrier.

Deuxième paragraphe : donnez les précisions utiles, les dates et les références.

Dernier paragraphe : indiquez ce que vous attendez du destinataire.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Prénom Nom

**Pièces jointes** : liste des documents joints
`,
    },
  ];

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // « 25 octobre 2026 »
  function dateFrancaise(d = new Date()) {
    return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
  }

  const parId = (id) => MODELES.find((m) => m.id === id) || null;

  // Contenu prêt à l'emploi : `{{date}}` remplacé par la date du jour.
  function contenu(id, date = new Date()) {
    const m = parId(id);
    return m ? m.contenu.replace(/\{\{date\}\}/g, dateFrancaise(date)) : null;
  }

  return { MODELES, parId, contenu, dateFrancaise };
});

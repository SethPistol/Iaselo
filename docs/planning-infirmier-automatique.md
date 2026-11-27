# Planning infirmier proposé automatiquement (4e veille, lot E)

Dans **Plannings infirmiers**, le cadre (bloc ou étage) dispose du panneau **Proposer le planning automatiquement**.

## Ce que fait la proposition

- Elle remplit **seulement les cases vides**. Congés, RTT, arrêts, absences, formations et postes déjà saisis (échanges, horaires particuliers, remarques) sont conservés.
- Besoin par jour :
  - **bloc** : il est repris du programme opératoire (salles ouvertes × effectif par salle, SSPI). Quand le programme finit tard, un des postes est un poste du soir. Les jours sans salle ouverte, rien n'est placé.
  - **étage** : nombre de matins, de soirs et de nuits par jour, réglable (2 / 2 / 1 par défaut).
- Règles respectées pour chaque agent :
  - repos de 11 h entre deux postes ;
  - 48 h au plus par semaine ;
  - 5 jours de travail d'affilée au plus (le maximum légal est 6) ;
  - 3 nuits d'affilée au plus ;
  - pas plus que l'objectif mensuel (151 h) + 8 h.
- Répartition équitable : l'agent qui a le moins d'heures passe en premier, les nuits et les week-ends sont répartis, et les nuits sont regroupées.
- Les jours non travaillés deviennent des repos (R).
- Les postes impossibles à pourvoir sans enfreindre une règle sont **listés** (à pourvoir par renfort, intérim ou heures supplémentaires) : ils ne sont pas masqués par une entorse aux règles.

## Ce qui ne change pas

- Rien n'est enregistré tant que le cadre ne clique pas sur **Enregistrer**. « Annuler la proposition » revient à la grille d'avant.
- Le cadre relit, corrige à la main, enregistre puis **valide** comme d'habitude (versions, empreinte et motif tracés). Les infirmier(ère)s ne voient que la version validée.

## Technique

- Règles : `dist/planning-auto-regles.js` (tests : `tests/planning-auto.test.cjs`).
- Écran : panneau dans `dist/plannings-infirmiers.js`.

**À valider** par les cadres : l'objectif mensuel d'heures (temps partiels à venir), le nombre de postes par jour à l'étage et les préférences des agents (pas encore saisies).

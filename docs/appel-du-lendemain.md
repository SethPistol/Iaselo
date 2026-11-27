# Appel du lendemain par agent vocal (4e veille, lot D)

**Statut : SIMULATION** jusqu'au choix d'un opérateur vocal hébergé en France (HDS). L'opérateur sera le même que pour l'accueil téléphonique.

## Principe

**Par défaut, le lendemain de l'intervention, le patient reçoit seulement le SMS J+1** avec le questionnaire (8 questions). L'appel est une **option** : un soignant l'ajoute patient par patient (bouton « Ajouter l'appel », retirable tant qu'aucun appel n'est passé). Sans ce choix, aucun appel n'est proposé à l'opérateur. (Demande de Romain du 27/11/2026.)

1. Le lendemain de l'intervention, le patient reçoit le SMS J+1 avec le questionnaire.
2. Si l'appel a été ajouté et que le questionnaire n'est pas rempli, l'agent vocal appelle le patient, au plus 2 tentatives.
3. L'agent vérifie d'abord l'identité avec la date de naissance. En cas d'erreur, il ne pose aucune question et le patient est à rappeler par une infirmière.
4. Il pose ensuite les 8 questions du questionnaire J+1 et comprend les réponses parlées : « sept », « trente-huit cinq », « trente-sept et demi », « non pas du tout », « oui un peu ». Une réponse non comprise déclenche un rappel infirmier.
5. En cas d'essoufflement, de douleur thoracique ou de saignement, l'agent dit immédiatement : « Raccrochez et appelez le 15 maintenant », puis prévient l'équipe.
6. Les réponses comprises sont versées dans le **questionnaire J+1** du séjour (source « appel »). Les alertes arrivent au médecin exactement comme celles du questionnaire (même écran, même traitement).

## Écran

Le bloc **Appels du lendemain (agent vocal)** est en tête du **Télésuivi des patients**. Il liste les patients opérés à la date choisie (hier par défaut ; choisir la date de l'intervention pour ajouter l'appel à l'avance) avec leur état : SMS seul, ou SMS + appel et alors :
- questionnaire rempli ;
- joint par l'appel, avec ses alertes ;
- à appeler ;
- à rappeler par une infirmière (pas de portable vérifié, identité non confirmée, réponses non comprises ou 2 tentatives sans réponse).

En simulation, le soignant joue le patient. Des scénarios sont prêts : « Tout va bien », « Douleur et fièvre », « Essoufflement (urgence) ». La transcription de chaque appel est consultable.

## Opérateur (à brancher)

Routes signées HMAC-SHA256, comme l'accueil téléphonique (`TELEPHONIE_SECRET`, 32 caractères au moins ; sans secret, 404) :
- `POST /api/telephonie/j1/a-appeler` `{date?}` renvoie les appels à passer (numéro, script de l'agent), uniquement pour les patients dont l'appel a été ajouté (table `appels_j1_choix`, migration 031).
- `POST /api/telephonie/j1/resultat` `{stay, date, naissance, reponses:{douleur:"sept",…}, joint}` renvoie `{statut, urgence}`.

## Technique

- Règles : `dist/appel-j1-regles.js` (tests : `tests/appel-j1.test.cjs`).
- Serveur : `worker/appel-j1.mjs`, migration `029_appels_lendemain.sql` (test : `tests/clever/appel-j1.test.mjs`).
- Écran : `dist/appel-j1.js`.

**À valider** : le script de l'agent (médecins), l'opérateur vocal (HDS), la durée de conservation des transcriptions et la mention dans l'information patient.

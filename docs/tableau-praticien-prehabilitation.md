# Tableau de bord du praticien et préhabilitation

5e veille du marché, lot 6 (28/11/2026), manques 7 et 9.

## Mon tableau de bord (médecins)

Accès : « Ma journée », puis le bouton « Mon tableau de bord : activité et qualité ».

- **Activité** sur 30 jours, 90 jours ou 12 mois : mes séjours, interventions, consultations validées.
- **À terminer** : comptes rendus opératoires à rédiger (chirurgien), consultations à valider (anesthésiste).
- **Indicateurs qualité**, comparés à la moyenne de l’établissement :
  - antibioprophylaxie dans les délais : antibiotique tracé 0 à 60 min avant l’incision. Le taux est calculé parmi les interventions où elle est tracée, et les « non tracées » sont comptées à part ;
  - nausées ou vomissements postopératoires : au moins une cotation NVPO ≥ 1 ;
  - douleur postopératoire : au moins une douleur au repos ≥ 4/10 ;
  - retards : entrée en salle plus de 15 min après l’heure prévue.
- **Séjours à revoir** : antibioprophylaxie hors délai ou douleur ≥ 4.

« Mes séjours » regroupe les séjours où j’ai écrit la consultation ou la feuille d’anesthésie (anesthésiste), et l’annonce ou le compte rendu (chirurgien). Pour un chirurgien, s’y ajoutent les interventions programmées à mon nom.

Le calcul est fait par le serveur (`GET /api/workspace/mon-tableau`). La moyenne de l’établissement ne contient ni nom ni numéro de séjour. Elle est masquée sous 5 séjours. Chaque lecture est tracée.

**À valider par les médecins** : les définitions et les seuils, avant tout usage qualité officiel.

## Préhabilitation (médecins et infirmier(ère)s)

Accès : « Télésuivi des patients », onglet « Préhabilitation ».

- **Patients à proposer** : intervention entre J+7 et J+45. La date vient de la consultation ou de l’annonce.
- **Inscription** : activités suivies (marche avec un objectif en minutes, exercices, alimentation riche en protéines, arrêt du tabac pour un fumeur).
  - Un lien personnel part par SMS ou par e-mail. Le message ne contient aucune donnée de santé.
  - Sinon, l’équipe imprime le QR code pour le patient. Le lien n’est montré qu’une fois.
- **Le patient**, sur `prehabilitation.html` :
  - il donne sa date de naissance, puis coche chaque jour ses activités, de J-30 (ou de l’inscription) à J-1 ;
  - il peut rattraper les 2 jours précédents ;
  - la page est traduite dans les 7 langues des pages patient.
- **Suivi de l’équipe** : jours remplis, objectifs atteints par activité, calendrier, adhésion moyenne. Le patient est signalé en « décrochage » après 3 jours sans saisie.
- **Nouveau lien** : l’ancien est révoqué. **Arrêt** : motif obligatoire, et le lien est révoqué.
- **Sécurité** :
  - le lien est stocké haché et bloqué après 5 erreurs de date de naissance ;
  - il expire après l’intervention ;
  - chaque ouverture, saisie et action est tracée.

**À valider** : contenus des conseils, objectifs par défaut (30 min de marche) et seuil de décrochage, par les médecins et l’équipe RAAC.

## Fichiers

- Règles : `dist/tableau-praticien-regles.js`, `dist/prehabilitation-regles.js`
- Écrans : `dist/tableau-praticien.js`, `dist/prehabilitation-equipe.js` (onglet de `dist/parcours-suivi.js`), `dist/prehabilitation.html` + `prehabilitation-page.js`
- Serveur : `worker/tableau-praticien.mjs`, `worker/prehabilitation.mjs`, migration 035 (`prehab_links`)
- Tests : `tests/tableau-prehab.test.cjs`, `tests/clever/tableau-prehab.test.mjs`

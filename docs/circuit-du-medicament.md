# Circuit du médicament au lit (5e veille, lot 1)

## Ce qui change
- **Prescription structurée** (médecin, onglet Prescriptions du séjour) : médicament choisi dans la BDPM, dose, unité, voie, fréquence (1 à 4 fois par jour, toutes les 8 h, le soir, horaires libres, dose unique, si besoin avec délai minimal et maximum par 24 h), date de début et durée. Le texte libre existant reste possible.
- **Plan d'administration** : chaque prescription structurée et validée génère ses doses sur 24 h (états : à venir, à donner, en retard, donnée, non donnée, reportée, refusée). Les doses en retard remontent dans la Surveillance des lits.
- **Administration au lit avec contrôle des 5 B** : bon patient (scan du bracelet = identifiant du séjour), bon médicament (DataMatrix de la boîte : GTIN, lot, péremption ; rapprochement CIP → CIS), bonne dose, bonne voie, bon moment (tolérance de 60 min).
  - Bloquant : bracelet d'un autre patient, boîte illisible, périmée ou d'un autre médicament.
  - À justifier par un commentaire : boîte non scannée ou non rapprochée, dose ou voie différente, hors créneau.
- Chaque administration est enregistrée dans les exécutions de la prescription (ajout seulement, horodatage serveur), avec le résultat du contrôle.

## Table CIP
`npm run referentiels` (au build Clever) télécharge `CIS_CIP_bdpm.txt` et écrit `dist/assets/medicaments-cip.json` (CIP13 → CIS). Sans cette table, la boîte est lue mais signalée « à vérifier ».

## À faire valider
Horaires par défaut des fréquences (8 h, 0/6/12/18 h…) et tolérance de 60 min : à valider par la pharmacie et les médecins. Modifiables dans `dist/administration-regles.js`.

Fichiers : `dist/administration-regles.js`, `dist/administration.js`, `tests/administration.test.cjs`.

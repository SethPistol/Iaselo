# Contrôle de sécurité du traitement en cours

Demande de Romain (26/11/2026) : reproduire l'écran E-med « Alertes du contrôle de sécurité du traitement en cours », sans la marque ni l'apparence d'un éditeur tiers.

## Où

Dossier › Prescription et suivi postopératoire › Prescriptions postopératoires (et, depuis le 26/11, prescriptions préopératoires : prémédication contrôlée à la signature ; ordonnance de sortie : contrôlée à l’enregistrement, mêmes règles et même justificatif) :

- bandeau de synthèse (compteurs par niveau) et bouton « Ouvrir le contrôle » ;
- pastille « Contrôle : niveau N » sur chaque ligne ;
- écran complet : une ligne par prescription (et par médicament du traitement personnel déclaré en consultation), 9 colonnes (interactions, physico-chimie, posologies, mises en garde, surveillances, produits dopants, conduite, informations manquantes, autres), niveaux 4 / 3 / 2 / 1 / i avec compteurs, niveau minimum, Toutes / Avec alertes, Détail, détail par cellule, « prescriptions non envoyées à la sécurisation », justificatif de la validation.

## Règles

- Valider une ligne qui porte une alerte de niveau 3 ou 4 exige un justificatif (10 caractères au moins), tracé dans les événements du séjour et sur la ligne (`rx[].securite`).
- Terrain : âge, poids, DFG (dossier ou Cockcroft-Gault), insuffisance hépatique, antécédents, allergies (contrôle des améliorations 1.1), ambulatoire.
- Doses journalières cumulées entre lignes de la même molécule (y compris « si besoin » avec maximum).
- Molécules reconnues par DCI, spécialité ou substances BDPM.

Code : `dist/securite-traitement-regles.js` (règles pures), `dist/securite-traitement.js` / `.css`. Tests : `tests/securite-traitement.test.cjs`.

## Limite

Base de règles IASELO (molécules courantes en périopératoire, thésaurus ANSM, RCP, liste AMA) à faire relire par la pharmacie. Ce n'est pas une base médicamenteuse agréée HAS (Vidal, BCB, Thériaque) : à contractualiser pour la certification LAP.

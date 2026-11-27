# Coût par séjour (4e veille, lot F)

Écran **Coût par séjour** (Gestion de la clinique) pour la direction (administration), la facturation, le DIM et l'administrateur.

## Calcul

Coût complet estimé par **coûts unitaires** (méthode proche de l'ENC) :

| Poste | Donnée | Coût unitaire par défaut |
|---|---|---|
| Bloc | minutes en salle réelles (déroulement : entrée → sortie de salle), sinon heures programmées (signalé « estimé ») | 12 € / min |
| SSPI | sortie de salle → sortie de bloc, sinon horaires prévus, sinon 60 min par défaut | 2,5 € / min |
| Hébergement | nuits du planning des lits ; ambulatoire = une place | 380 € / nuit · 220 € / place |
| Consommables | par intervention | 150 € |

Les coûts unitaires par défaut sont **indicatifs**. La direction ou l'administrateur les remplace par ceux de la comptabilité analytique dans « Coûts unitaires de l'établissement ». Chaque modification est tracée.

**Recette de l'établissement** : elle est estimée à partir du dossier de facturation (GHS, journées au-delà de la borne haute, implants en sus, forfait journalier, chambre particulière), avec le même calcul que la pré-facture. Les honoraires des praticiens libéraux n'en font pas partie. Un séjour sans GHS affiche « GHS à saisir ».

**Résultat** = recette − coût. Les séjours sont classés du plus déficitaire au plus rentable, avec une synthèse par spécialité et par mode (ambulatoire, hospitalisation) et un export CSV.

## Confidentialité

Les séjours sont **pseudonymisés** : identifiant, spécialité, mode et date, sans nom ni donnée médicale. Chaque consultation est tracée dans le journal d'accès.

## Technique

- Règles : `dist/cout-sejour-regles.js` (tests : `tests/cout-sejour.test.cjs`).
- Serveur : `worker/cout-sejour.mjs` (test : `tests/clever/cout-sejour.test.mjs`), réglages dans `app_settings` (clé `couts`).
- Écran : `dist/cout-sejour.js`.

**À compléter** : médicaments et dispositifs consommés par séjour (prix des articles de la pharmacie), temps infirmier réel par séjour, et coûts unitaires réels de la clinique.

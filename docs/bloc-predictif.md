# Bloc prédictif et analyse du bloc (27 novembre 2026)

Manques n° 3 et n° 9 de la veille marché n° 3 (Epic OR Capacity, Opmed.ai, Calmedica MemoSwap, Dedalus Command Center).
Deux onglets ajoutés dans **Bloc & lits** : « Prévisions & créneaux » et « Analyse du bloc ».

## Prévisions & créneaux

| Fonction | Règle | Qui agit |
|---|---|---|
| Durée estimée de chaque intervention | Médiane des passages réels (entrée → sortie de salle) du même chirurgien pour le même acte (code CCAM, sinon libellé sans latéralité), au moins 3 passages ; sinon même acte tous chirurgiens ; sinon ratio réel/prévu habituel du chirurgien ; sinon durée prévue. Fourchette 25e–75e centile, confiance élevée / moyenne / faible. Écart signalé à partir de 15 min. | Lecture |
| Fin estimée et dépassement de vacation | Enchaînement par salle (heure prévue ou fin du cas précédent + rotation), heures réelles quand elles existent | Lecture |
| SSPI et lits heure par heure | Fins de salle estimées + durée médiane de SSPI de la clinique (60 min sans historique) ; rouge au-delà de la capacité | Lecture |
| Vacations à libérer | Remplissage < 50 % entre J+7 et J+21 (10 moins remplies affichées) | Cadre de bloc / administrateur proposent ; le titulaire libère ou garde |
| Bourse aux créneaux | Vacation libérée (vide d'interventions, motif obligatoire) ; un chirurgien la demande, le cadre l'attribue ; ses annonces s'y placent ensuite | Chirurgien, cadre, administrateur |
| Liste d'attente de patients | Correspondance sur 60 jours : même chirurgien (ou vacation libérée), durée + rotation qui tient, fenêtre du patient, plus tôt que sa date actuelle, délai de prévenance (48 h par défaut) | Inscription : chirurgien (ses patients), secrétariat, cadre, administrateur ; proposition : secrétariat, cadre, administrateur |

Le SMS de proposition est générique (aucun nom, date ni motif) : le patient rappelle le secrétariat, qui reprogramme dans « Programmer un séjour ». Rien n'est déplacé automatiquement.

## Analyse du bloc

Mois en cours, mois précédent ou 3 derniers mois ; global, par chirurgien et par salle : utilisation des vacations (temps en salle / temps de vacation), premières entrées en retard (> 15 min), rotation médiane, dépassements, vacations libérées, annulations, précision des durées programmées (écart médian réel − prévu). Imprimable.

## Seuils à valider par le conseil de bloc

`REGLAGES` dans `dist/bloc-previsions-regles.js` : rotation 15 min, 3 passages minimum, écart signalé 15 min, retard 15 min, SSPI 60 min par défaut, libération J+7 à J+21 sous 50 %, créneau 30 min minimum, prévenance 48 h.

## Fichiers

- Règles : `dist/bloc-previsions-regles.js` (tests `tests/bloc-previsions.test.cjs`).
- Écrans : `dist/bloc-previsions.js`, `dist/bloc-previsions.css`, onglets branchés dans `dist/bloc-planner.js`.
- Serveur : `worker/bloc-optimisation.mjs` (route `/api/workspace/bloc-optimisation`), migration `022_bloc_optimisation.sql` (historique non modifiable), test `tests/clever/bloc-optimisation.test.mjs`.
- Recette : le programme fictif ajoute 30 jours ouvrés d'historique (patients FICTIF-HISTORIQUE) pour que les estimations aient une référence.

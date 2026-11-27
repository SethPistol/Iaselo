# Profil de risque global et effectifs liés au programme

## Profil de risque global (dossier › Consultation d'anesthésie › Scores, tri & consignes)
- Deux scores s'ajoutent à STOP-Bang, Lee, Apfel, voies aériennes et HEMSTOP :
  - **ARISCAT** (complications pulmonaires) : âge, SpO₂ et Hb de la consultation, type d'incision déduit de l'intervention, durée de l'annonce, urgence ; infection respiratoire récente à demander. Canet 2010.
  - **Caprini** (thrombose veineuse) : âge, IMC, type et durée de chirurgie, arthroplastie, antécédents, cancer, traitement hormonal, BPCO, insuffisance cardiaque ; antécédent familial à demander. Caprini 2005, ACCP 2012.
- La carte « Profil de risque global » réunit 7 domaines (cœur, poumon, SAOS, voies aériennes, thrombose, NVPO, hémorragie), donne le niveau le plus élevé et propose des mesures à discuter, chacune avec sa source (ESC 2022, Gan 2020, SFAR…).
- Une donnée manquante n'est jamais comptée comme négative : elle est signalée « à compléter ».
- **Aide à la décision, à faire relire par les anesthésistes.** Un usage clinique réel relève du marquage CE comme dispositif médical (règlement 2017/745, règle 11).
- Code : `dist/veille-regles.js` (`ariscat`, `caprini`, `profilRisque`), affichage `dist/veille.js`.

## Effectifs liés au programme (Plannings infirmiers › Bloc opératoire, vue cadre)
- Ligne « Besoin du programme » sous le planning : pour chaque jour, salles ouvertes (vacations non libérées et interventions) × 2 infirmier(ère)s, plus la SSPI (1 infirmier(ère), 2 agents à partir de 6 patients présents en même temps, art. D.6124-101 CSP).
- Jours en déficit en rouge, liste « prévus / nécessaires », alerte si le programme finit après 18 h sans poste du soir ou de garde.
- Les réglages (2 par salle, 60 min de SSPI par patient) sont à confirmer par l'établissement : `dist/effectifs-regles.js` (REGLAGES).
- Le calcul est fait par le serveur (`worker/plannings-infirmiers.mjs`) et n'est montré qu'au cadre et à l'administrateur.
- Non couvert : besoin de l'étage (pas de ratio réglementaire, et la durée de séjour prévue n'est pas saisie).

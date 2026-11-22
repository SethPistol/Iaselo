# Questionnaire patient → consultation d'anesthésie

1. Le secrétariat prépare le lien (« Questionnaire · photo Doctolib ») et l'envoie par SMS/e-mail (Brevo).
2. Le patient remplit le questionnaire sur `patient.html` ; les réponses sont enregistrées **sur le serveur IASELO**
   dans `stay/<séjour>/questionnaire` (lien à usage unique, identité vérifiée, aucun envoi externe).
   Les traitements sont transmis aussi ligne par ligne (`medRows`, 10 lignes × 5 colonnes au maximum).
3. Dans le dossier, la consultation affiche « Questionnaire patient reçu · À relire ». L'onglet « Questionnaire patient »
   montre les points de vigilance (hyperthermie maligne, allergie antibiotique, anticoagulants…) puis la liste des
   éléments proposés, rubrique par rubrique (≈ 30 champs : antécédents par appareil, allergies, HEMSTOP, tabac,
   capacité fonctionnelle, dentition, traitements structurés, scores STOP-Bang / Lee / Apfel pré-calculés…).
4. L'anesthésiste décoche ce qu'il ne veut pas reprendre et valide. Règles :
   - chaque texte repris commence par « Déclaré par le patient (questionnaire du JJ/MM/AAAA) » ;
   - une saisie existante n'est jamais écrasée (ajout en fin de texte ; listes et nombres déjà remplis conservés) ;
   - les traitements deviennent des lignes « Déclaré par le patient », conduite « À déterminer » :
     la consultation ne peut pas être validée tant que chaque conduite n'est pas décidée ;
   - le statut allergologique, l'ASA et toutes les décisions restent au médecin ;
   - la relecture est tracée (date, auteur, rubriques reprises) dans l'historique du séjour.

Code : `dist/questionnaire-reprise.js` (règles pures, tests `tests/questionnaire-reprise.test.cjs`),
`questionnaireReview()` dans `dist/parcours-v8.js`, `dist/questionnaire-reprise.css`.

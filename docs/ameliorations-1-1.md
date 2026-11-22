# IASELO 1.1 — dix améliorations pour l'usage quotidien

22 novembre 2026. Code : `dist/ameliorations.js` (écrans), `dist/ameliorations-regles.js` (règles pures, testées dans `tests/ameliorations.test.cjs`), `dist/ameliorations.css`, `server/auth.mjs` (verrouillage), migration `004_verrouillage_poste.sql`. Captures : `/mnt/project-files/ameliorations-1.1/`.

Tout est calculé dans le navigateur ou sur le serveur de l'établissement : aucune donnée n'est envoyée à un service extérieur.

| # | Amélioration | Où | Points clés |
|---|---|---|---|
| 1 | Recherche rapide | Ctrl K partout, bouton « Rechercher » du menu | Patients (nom, date de naissance jj/mm/aaaa, séjour, IPP), écrans, actions. Un lecteur de code-barres qui « tape » le numéro de séjour retrouve le patient. Périmètre de soins uniquement. |
| 2 | Verrouillage du poste | Automatique après 10 min (5/10/15/30 réglable par poste via Ctrl K), bouton « Verrouiller le poste », Ctrl Maj L | La session est suspendue **côté serveur** (`auth_sessions.locked_at`) : aucune donnée servie pendant le verrouillage. Déverrouillage par mot de passe (`POST /auth/unlock`), saisies conservées à l'écran, 5 échecs ferment la session, verrouillage propagé aux autres onglets, actions tracées dans `auth_audit`. |
| 3 | Allergies ↔ médicaments | Prescriptions et saisie « Médicament » de la feuille d'anesthésie | ~30 classes (pénicillines, céphalosporines, curares, AINS, iode, chlorhexidine, héparines/TIH…), réactivité croisée signalée. Alerte en direct pendant la saisie, blocage à l'enregistrement : poursuivre exige un motif, tracé dans l'historique. |
| 4 | Réinjection d'antibioprophylaxie | Feuille d'anesthésie + rappel flottant sur tous les écrans | Délais RFE SFAR 2024 (céfazoline 4 h, céfuroxime 2 h, clindamycine 4 h…), à partir de la dernière injection tracée. Statuts : à venir, < 15 min, à faire, en retard. |
| 5 | Étiquettes et bracelet | Boutons du bandeau patient | Planche A4 3 × 8 et bracelet, code-barres Code 128 du numéro de séjour (vérifié par lecture automatique). Impression bloquée si l'identité est incomplète ; chaque impression tracée. |
| 6 | Import du programme opératoire (E-med) | Bloc & lits › « Importer un programme » | CSV (point-virgule, virgule, tabulation ; UTF-8 ou Windows-1252). Colonnes reconnues par leur titre ; relecture ligne à ligne (erreurs, doublons, créneaux occupés, patient déjà connu). Propose d'ouvrir les vacations manquantes avec leur personnel, contrôlées par les mêmes règles que le planning. Modèle téléchargeable. **Le format exact de l'export E-med reste à vérifier sur un fichier réel anonymisé.** |
| 7 | Bionettoyage partagé | Pilotage & qualité › Lits et sorties | Rubrique de séjour `bionettoyage` (soignants de l'équipe), visible depuis tous les postes, tracée. Remplace le stockage local au poste. |
| 8 | Export du dossier (droit d'accès) | Bandeau patient (médecins, administrateurs) | Document lisible à imprimer / PDF et fichier JSON (portabilité). Motif obligatoire, export tracé. |
| 9 | Feuille de relève | Menu « Relève de service » | Par secteur ; tri par NEWS2 puis alertes ; allergies, constantes, tâches, dispositifs, dernière transmission (DAR), réinjections dues. Version imprimable avec zone de notes. |
| 10 | NEWS2 | Dossier infirmier › Constantes SSPI / hospitalisation | Barème RCP 2017 ; deux champs ajoutés au relevé (oxygène, conscience AVPU) ; score, niveau de risque, conduite, courbe, paramètres manquants. |

## À relire par l'équipe médicale

Tables d'allergies et de réactivité croisée, délais de réinjection, seuils NEWS2 : valeurs par défaut issues des référentiels cités, à valider avant usage réel. Ce sont des aides : la décision reste au professionnel.

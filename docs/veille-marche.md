# Fonctionnalités issues de la veille marché (novembre 2026)

Source : document « Veille marché IASELO : ce que font les autres, ce qu'on reprend ». Ce fichier liste ce qui est
réellement intégré dans l'application, où se trouve le code, et ce qui reste soumis à une homologation externe.

## Intégré

| Idée du marché (inspiré de) | Dans IASELO | Code |
|---|---|---|
| Questionnaire qui trie (MyPreOp, Hopi) | Carte « tri » : drapeaux, ASA probable, type de consultation proposé | `veille-regles.js` → `orientation` |
| Scores calculés (Diane, Mediboard) | STOP-Bang, Lee (RCRI), Apfel, voies aériennes, HEMSTOP ; chaque critère avec sa source, critères manquants signalés | `scores` |
| CPA préremplie | Bouton « Reporter les scores dans la consultation » (champs STOP-Bang, Lee, Apfel, HEMSTOP, consignes) | `veille.js` → `panelAide` |
| Consignes d'arrêt datées (Diane, ElsanCare) | Règles par molécule (AOD selon risque hémorragique et DFG, AVK, antiagrégants, gliflozines, metformine, GLP-1, IEC/sartans…), dates calculées depuis la date opératoire, validation par l'anesthésiste, fiche patient imprimable | `consignes`, `REGLES` |
| Blocage si dossier incomplet (Centricity Opera, Torin) | Complétude en 9 points, pastille dans le bandeau patient, blocage du passage à « Intervention » sauf motif tracé | `completude` |
| Tour de contrôle du bloc | Nouvel écran : statut de chaque patient (attendu → sorti) en un clic, dossiers incomplets, alertes J+1 | `renderControle` |
| Check-list HAS 2018 (tous les PDMS) | 3 temps, réponses Oui/Non/N.A., signature horodatée, NO GO si « Non » | `CHECKLIST_HAS` |
| Suivi SMS J-1 / J+1 (Calmedica) | SMS génériques via Brevo, appel J+1 tracé, seuils d'alerte, traçabilité du rappel médecin | `worker/veille.mjs`, `alertesJ1` |
| Lettre de liaison DMP + MSSanté (Ségur) | Panneau d'envoi sous la lettre de liaison, préconditions (lettre relue, INS qualifiée) | `/api/workspace/interop/liaison` |

Rubriques du séjour créées : `aideCpa` (anesthésiste), `checklistBloc`, `blocStatut`, `suiviAmbu` (anesthésiste,
chirurgien, infirmier), `envoisInterop` (médecins, ajout seulement). Droits dans `worker/professional-access.mjs`
et `dist/acces-professionnels.js`.

## Simulé, en attente d'homologation

| Connecteur | Statut | Pour passer en réel |
|---|---|---|
| INSi | Simulation (écran Identité & INS existant) | Raccordement CNAM, certificat logiciel, référencement Ségur |
| Pro Santé Connect | Non branché | Déclaration du service à l'ANS (OIDC), variables `PSC_CLIENT_ID`, `PSC_CLIENT_SECRET`, `PSC_ISSUER` |
| DMP | Simulation : références `SIM-DMP-…`, rien ne sort du serveur | Homologation LPS DMP (CNDA), `DMP_LPS_ID`, `DMP_CERT_PATH` |
| MSSanté | Simulation : références `SIM-MSSANTE-…` | Boîte organisationnelle chez un opérateur, `MSSANTE_OPERATEUR`, `MSSANTE_BAL` |

`GET /api/workspace/interop/status` donne l'état de chaque connecteur. Tant qu'une variable manque, le mode reste
« simulation » ; si toutes sont présentes, l'envoi est refusé (501) tant que l'adaptateur réel n'est pas écrit et validé.

## Règles RGPD et sécurité retenues

- SMS : aucun nom, motif, date ni donnée de santé ; numéro lu côté serveur dans les coordonnées vérifiées ; destinataire masqué dans le journal.
- Scores et consignes : proposition affichée avec source et critères ; rien n'est reporté dans la consultation sans action du médecin.
- Passage outre du blocage de programmation : motif obligatoire, tracé dans l'historique du séjour.

## Non repris à ce stade

Mode dégradé hors ligne de la feuille d'anesthésie, base médicamenteuse agréée (Vidal/BCB), codage CCAM à la source,
bris de glace, journal d'accès consultable par le patient : prochaines étapes.

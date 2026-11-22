# IASELO 1.0.0 — notes de version

Version consolidée du 22 novembre 2026. Elle réunit dans une seule branche tout le travail mené en parallèle, vérifié de bout en bout sur des données fictives.

## Ce que contient la version

**Parcours patient complet**, de la préadmission au suivi après la sortie :

- Préadmission et pièces, relances J-7 et J-3, questionnaire patient sur téléphone (lien personnel de 48 h, à usage unique), lu depuis une photo du profil Doctolib.
- Envoi du lien par SMS et e-mail via Brevo, au seul destinataire vérifié, sans aucune information médicale dans le message, chaque envoi tracé.
- Consultation d'anesthésie : scores (STOP-Bang, Lee, Apfel, voies aériennes, HEMSTOP), tri du questionnaire, consignes d'arrêt des traitements datées par molécule, bilans guidés, visite préanesthésique, synthèse assistée (toujours relue et validée par le médecin).
- Complétude du dossier et blocage du passage au bloc tant que les éléments obligatoires manquent (motif tracé en cas de passage outre).
- Bloc : tour de contrôle (statuts du patient en un clic), check-list HAS « Sécurité du patient au bloc » en trois temps, feuille d'anesthésie et saisie rapide, SSPI avec score d'Aldrete, planning Bloc & lits.
- Hospitalisation et sortie : dossier infirmier, prescriptions, conciliation, échelles, score de Chung, lettre de liaison, ordonnance de sortie, consignes au patient, codage PMSI proposé.
- Suivi : appel J-1 et J+1 avec alertes, PROMs.
- Pilotage & qualité (indicateurs IQSS), Droits & traçabilité (journal des accès, bris de glace motivé de 4 h, demandes d'exercice des droits, durée de conservation).

**Identité visuelle « Scialytique »** : modes clair et sombre (mode bloc), tablette, page patient mobile ; logo IASELO dans le menu et logo de l'établissement en co-signature sur chaque page.

**Sécurité** : connexion par formulaire corrigée (« Origine refusée »), droits par profil et par équipe (Endoscopie, Chirurgie, Séjour médical), journal des accès, serveur de recette séparé (`IASELO_RECETTE=true`).

**Connecteurs d'homologation prêts** pour les environnements de test officiels : INSi, Pro Santé Connect, DMP, MSSanté (mode `simulation` par défaut, `test` ou `production` par variable d'environnement, production interdite sur la recette).

## Corrections de la passe de qualité finale

- Tour de contrôle : un patient déjà passé au bloc n'est plus affiché « Bloqué » ; il apparaît « Incomplet » si son dossier n'est pas complet.
- Écran « Questionnaire · photo Doctolib » : le bandeau disait encore qu'aucun service d'envoi n'était connecté ; il décrit maintenant l'envoi Brevo.
- Visite préanesthésique : les champs date et heure débordaient de leur carte.
- Réponses du questionnaire et dossier infirmier : dates affichées au format français, plus en format informatique (« 2026-11-22T14:36… »).
- Impressions des consignes et du relevé du journal d'accès : la fenêtre d'impression ne s'ouvrait jamais (message « Autorisez les fenêtres »).
- Chaque document imprimé porte désormais le logo de l'établissement, le nom, la date de naissance et le séjour du patient, et la date d'impression (identitovigilance).
- Feuille d'anesthésie imprimée : toute la plage horaire tient sur la page paysage (elle était coupée à 15 h 30) et le tableau de bord en direct n'est plus imprimé.
- Tablette : les étapes du parcours ne se chevauchent plus ; téléphone : plus de défilement horizontal sur Ma journée et la tour de contrôle.

## Ce qui reste en simulation

Ces fonctions sont codées mais restent simulées tant que l'établissement n'a pas obtenu les accès officiels : INSi, Pro Santé Connect, DMP, MSSanté, Doctolib, passerelle des moniteurs, ViaTrajectoire, export RUM, base médicamenteuse (Vidal ou BCB). Aucune homologation n'est obtenue à ce jour. Le plan des démarches est dans `docs/homologations.md`.

## Avant toute vraie donnée patient

L'application reste limitée aux patients fictifs. Avant la première donnée réelle :

- statut de dispositif médical (marquage CE) des scores et aides à la décision, à instruire auprès de l'ANSM ;
- certification HDS de l'éditeur (en plus de l'hébergement Clever Cloud HDS) ;
- analyse d'impact (AIPD) et registre des traitements avec le DPO ;
- contrat de sous-traitance Brevo, domaine d'envoi authentifié, suivi des ouvertures et clics désactivé ;
- relecture médicale des règles (doses, scores, consignes, codes CIM-10 et CCAM) proposées par défaut.

## Limites connues

- Le planning Bloc & lits démarre vide ; le bouton « Charger un programme de démonstration » le remplit. Les indicateurs de Pilotage se remplissent à partir des horodatages saisis dans la tour de contrôle.
- Le statut de bionettoyage des chambres est propre à chaque poste dans cette version.

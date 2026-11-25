# IASELO · dix modules issus de la comparaison au marché (25 novembre 2026)

- **Outils** et **Messagerie** en bas du menu, selon le métier : biologie et courriers reçus (HL7, HPRIM, MSSanté), interfaces avec le logiciel administratif (ADT, actes DFT), transfusion (groupe, RAI, commande EFS, contrôle ultime, EIR), qualité (EI, EIGS, RMM, mode dégradé et classeur de secours), agenda des consultations, honoraires (devis signé, FSE, paiement en ligne), logistique (brancardage, stérilisation, planning), messagerie interne.
- **Dans le dossier** : constantes du moniteur relues puis validées sur la feuille d'anesthésie ; assistant de consultation (dictée transcrite sur le poste, propositions à valider) ; bandeau « résultat non vu ».
- **Pages patient** : prise de rendez-vous, devis à signer, paiement ; toutes les pages patient en anglais (bouton FR / EN).
- Connecteurs extérieurs en simulation tant que la clinique n'a pas fourni ses accès. Migration 016. Détail et liste de ce qu'il faut fournir : docs/modules-marche.md.

# IASELO · documents validés figés et heure serveur des soins (24 novembre 2026, audit points 5 et 6)

- **Documents validés figés par le serveur** (`worker/verrous.mjs`) : consultation validée, CRO validé, VPA et prescriptions signées ne peuvent plus être modifiés en restant validés ou signés. Il faut ouvrir une révision (tracée « revision-ouverte » dans le journal), puis valider ou signer la nouvelle version.
- **Feuille d'anesthésie, saisie rapide** : registre des stupéfiants et traçabilité des implants sans effacement ni modification ; un événement horodaté s'annule (mention « annulé », auteur, heure) au lieu d'être effacé. Saisie réservée à l'anesthésiste et à l'infirmier, le chirurgien la lit.
- **Heure serveur des soins** (`worker/horodatage.mjs`) : chaque nouvelle administration, surveillance, transmission, entrée de circuit du médicament ou de feuille d'anesthésie reçoit l'heure et l'auteur constatés par le serveur (`serverAt`, `serverBy`), que le poste ne peut ni fixer ni modifier. L'heure clinique choisie par le soignant est conservée ; un écart de plus de 15 minutes est affiché (« Saisie enregistrée le… »).

# IASELO · refonte du stockage (24 novembre 2026, audit point 4)

- **Listes partagées fusionnées patient par patient** : identités, réservations du bloc, actes, mouvements, PMSI, factures et brouillons de séjour. Deux postes qui modifient deux patients différents ne se bloquent plus ; seul un même patient modifié des deux côtés est un conflit (`worker/items.mjs`).
- **Historique par élément** : l'historique de ces listes ne recopie plus la liste entière à chaque ajout (croissance quadratique), seul l'élément modifié est gardé (`workspace_item_versions`, migration 014). L'écran « Comparer les versions » reconstitue la liste à n'importe quelle révision.
- **Chargement à la demande** : un séjour sorti, sans activité depuis 60 jours et sans réservation de bloc récente ou à venir n'est plus chargé à l'ouverture. Options › « Séjours archivés » le retrouve (nom, prénom, naissance, numéro) et le rouvre ; recherche et réouverture sont tracées (`worker/archives.mjs`).

# IASELO · lot sécurité de l'audit (24 novembre 2026)

Suite de l'audit du 24/11 (points critiques 1 à 3) :

- **Recette** : la page de connexion n'affiche plus aucun identifiant de test (comptes inchangés, communiqués par l'équipe).
- **Signatures posées par le serveur** : pour toute signature nouvelle ou modifiée (prescriptions, VPA, CRO, check-list HAS, bilans…), le signataire enregistré est la personne connectée (identifiant, nom, RPPS), jamais l'identité envoyée par le navigateur. Une signature inchangée garde son auteur ; les historiques ne sont pas réécrits (`worker/signatures.mjs`).
- **Double authentification** pour toute connexion par mot de passe : code à 6 chiffres d'une application d'authentification (TOTP, RFC 6238), inscription par QR code à la première connexion, 5 codes faux ferment la session, rejeu refusé. Pro Santé Connect en est dispensé. Toujours active hors recette ; en recette, activable par `MFA_OBLIGATOIRE=true` (les deux comptes de test restent dispensés). Réinitialisation : Accès professionnels › « Double authentification » (motif tracé) ou `RESET_USER_EMAIL=… npm run user:mfa-reset`. Migration 013.

# IASELO · visite pré-anesthésique (23 novembre 2026)

Nouvelle étape du dossier « Visite pré-anesthésique » : rappel de la consultation, évolution, jeûne calculé à l’heure prévue, consignes sur les traitements, constantes du jour, résultats et RAI, préparation, consentement, conclusion (apte / plan modifié / report) signée par l’anesthésiste, pastille dans le bandeau et élément de complétude bloquant le jour J. Détail : docs/visite-pre-anesthesique.md.

# IASELO 1.1.0 — dix améliorations (22 novembre 2026)

Recherche rapide Ctrl K, verrouillage automatique du poste (côté serveur), contrôle allergies ↔ médicaments, réinjection d’antibioprophylaxie au bloc, étiquettes et bracelet avec code-barres, import du programme opératoire depuis E-med (CSV), bionettoyage partagé entre postes, export du dossier pour le droit d’accès, feuille de relève de service, score NEWS2 en surveillance postopératoire. Détail : docs/ameliorations-1-1.md. La limite « bionettoyage propre à chaque poste » est levée.

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

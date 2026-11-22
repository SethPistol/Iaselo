> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

Mise à jour des accès professionnels : profils individuels, droits par métier/équipe et journal serveur livrés pour le prototype. Voir [acces-professionnels.md](acces-professionnels.md). Authentification professionnelle, surveillance et validation de l’exploitation clinique restent à réaliser.

Mise à jour du 19 novembre 2026 : le dossier professionnel du prototype utilise désormais une base serveur, des versions par rubrique et un stockage des pièces jointes. Voir [dossier-partage-durable.md](dossier-partage-durable.md). Les constats historiques ci-dessous sur le site statique décrivent la version antérieure ; le périmètre HDS et la conformité clinique restent non établis.

# Parcours Anesthésie — préparation à l’usage clinique en France

État du 18 novembre 2026. Revue du code et des documents disponibles, sans audit d’infrastructure ni certification. Le responsable du traitement, le DPO, l’hébergeur et les contrats du futur service clinique restent à confirmer.

## Déploiements constatés

| Élément | Situation constatée |
| --- | --- |
| Site publié | Démonstration statique, dossiers fictifs, état clinique en mémoire de la page. Accès Sites configuré en mode personnalisé. Certification HDS et localisation de tous les traitements non établies. |
| Serveur Node local | API de démonstration, comptes par métier, SQLite persistant, accès HTTP Basic, écoute sur boucle locale par défaut. Ce serveur ne constitue pas le service clinique déployé. |
| Rôles | Le secrétariat reçoit les données administratives. Les modifications de consultation sont contrôlées côté serveur pour le rôle anesthésiste. Les constantes sont saisissables par les rôles soignants autorisés. |
| Lecture des dossiers | La liste API transmet tous les dossiers au rôle soignant. Habilitation individuelle par équipe de soins à développer. |
| Journalisation | Écritures et lectures API enregistrées dans SQLite. Les lectures de listes sont tracées comme telles, pour chaque dossier envoyé. Le compte enregistré identifie un métier de test. |
| Questionnaire | Invitation aléatoire, jeton haché, expiration 48 heures, usage unique. Confirmation nominative de scénario. |
| Dictée | Le code impose la reconnaissance locale quand le navigateur la propose. Contrats, permissions et comportement effectif du navigateur à qualifier pour le service clinique. |
| Sources externes | Widget VIDAL chargé sur action explicite, liens documentaires externes. L’hébergeur, les fournisseurs et le navigateur peuvent traiter des métadonnées techniques. |
| Documents | Import du CRO et images de signature en mémoire dans la démonstration. Impression possible. Archivage probant, contrôle des pièces jointes et signature clinique à développer. |

## Exigences et preuves de recette attendues

| Domaine | Travaux et preuves avant utilisation avec de vrais patients | Situation |
| --- | --- | --- |
| Gouvernance RGPD | Identifier les responsables de traitement selon les usages de la clinique et des praticiens, les sous-traitants et le DPO. Registre des activités et bases juridiques documentées au titre des articles 6 et 9. | À définir avec la clinique |
| AIPD | Réaliser l’analyse d’impact pour le DPI envisagé, décrire menaces, mesures et risques résiduels, documenter la décision du responsable de traitement. | À réaliser |
| Information patient | Finalités, identité et coordonnées du responsable, DPO, catégories de données, destinataires, bases juridiques, durées, droits applicables, réclamation CNIL, transferts et sous-traitants. Notice à valider et à afficher avant la collecte. | Notice clinique à compléter |
| Droits des personnes | Procédure de vérification d’identité et de traitement des demandes, accès/copie, rectification tracée, limitation et autres droits selon la base juridique. Les obligations de conservation doivent être prises en compte dans une demande d’effacement. | À développer et organiser |
| Hébergement | En cas d’externalisation des données de santé issues des soins, vérifier la certification HDS, son périmètre réel et sa validité pour chaque prestation, y compris exploitation et sauvegarde. Vérifier localisation et accès distants. | Contrats et infrastructure non établis |
| Sous-traitance et transferts | Accords de l’article 28, liste des sous-traitants ultérieurs, instructions, confidentialité, réversibilité et suppression. Encadrer les éventuels transferts hors EEE. | À contractualiser |
| Identification des professionnels | Comptes nominatifs, authentification forte et gestion des sessions, révocation, départs, droits d’administration. Raccordement PSC et exigences d’identification électronique selon le périmètre du service. | Comptes de test seulement |
| Secret médical et habilitations | Accès limités au métier et à l’équipe de soins, contrôles serveur pour recherches, lecture, écriture, export et impression. Recette de l’isolement entre patients, équipes et établissements. Bris de glace motivé et surveillé si retenu. | Rôles partiels, équipe de soins absente |
| Traçabilité | Comptes individuels, action, dossier, horodatage, résultat et motif pertinent. Protection des journaux contre altération, contrôle des accès et détection d’anomalies. Politique de durée pour les journaux distincte du dossier médical. | Traces locales à renforcer |
| Conservation | Pour le dossier d’établissement, principe de 20 ans à compter du dernier séjour ou de la dernière consultation externe, avec exceptions de l’article R.1112-7. Définir règles distinctes pour questionnaires, brouillons, journaux, sauvegardes et pièces jointes. Purge/archivage et suspensions documentés. | Aucune purge clinique paramétrée |
| Continuité et chiffrement | TLS, chiffrement au repos, gestion et rotation des clés, sauvegardes, restauration testée, RPO/RTO, mode dégradé, supervision et reprise. | À construire sur l’infrastructure clinique |
| Incidents | Procédure d’alerte, registre des violations, analyse de risque et notification CNIL sous 72 heures lorsqu’elle est requise. Information des personnes selon le risque. | À organiser |
| Identitovigilance | Traits d’identité, statut de qualification INS, intégration INSi/RNIV selon le périmètre, doublons, fusion tracée et rectification. | Numéros fictifs seulement |
| Échanges | Définir interfaces et formats adaptés aux partenaires, CI-SIS selon les flux retenus, authentification des systèmes et MSSanté pour les échanges concernés. Tester les rejets et l’intégrité. | À intégrer |
| Prescriptions et signatures | Identité et habilitation du prescripteur, RPPS vérifié, version du référentiel médicamenteux, validation, intégrité des prescriptions et des documents signés. Examiner certification LAP/LAD selon les fonctions retenues. | Simulation de prescription |
| Aide à la décision | Définir la destination médicale des modules. Qualifier le statut de dispositif médical, la classe éventuelle et les obligations applicables avant mise à disposition clinique. Validation clinique des règles, gestion des versions et surveillance. | Qualification et validation à réaliser |
| Recette | Audit de sécurité, correction des vulnérabilités, tests des habilitations et de restauration, recette métier, validation des risques résiduels et décision de mise en service documentée. | À réaliser |

Le consentement à l’acte anesthésique et la confirmation du questionnaire doivent être distingués de la base juridique du traitement des données. La détermination des articles 6 et 9 applicables relève du responsable du traitement. Une case de consentement générique ne remplace pas cette analyse.

## Mesures réalisées dans cette modification

- Les messages de l’outil scientifique vers le dossier ciblent l’origine de l’application. Le dossier contrôle la fenêtre isolée, son origine opaque et son jeton de session. La livraison vers cette fenêtre exige une origine cible générique du fait de son isolation, qui est conservée.
- Les lectures API de séjours et de questionnaires sont tracées avec le compte, l’horodatage, l’identifiant du dossier et la nature de l’accès. Les valeurs cliniques et les jetons ne sont pas copiés dans ces journaux.
- Le serveur local applique une politique de permissions navigateur limitée et une protection des ressources entre origines. Il conserve les en-têtes interdisant la mise en cache des réponses et les références de navigation.
- Les espaces clinique et patient renvoient vers une information expliquant les traitements effectifs de la démonstration.

Ces mesures couvrent le code examiné. Les journaux du serveur local sont conservés jusqu’à action de l’exploitant, sans purge automatique. Leur protection, leur durée et leur exploitation opérationnelle restent à définir pour le service clinique.

## Séquence de mise en service

1. Responsable du traitement et DPO définissent les usages, bases juridiques, destinataires et durées.
2. Choisir l’offre d’hébergement et contractualiser son périmètre, ses sauvegardes et ses sous-traitants.
3. Réaliser l’AIPD et l’architecture de sécurité, puis implémenter identité, habilitations individuelles, audit et continuité.
4. Qualifier les modules cliniques, finaliser les interfaces françaises, puis effectuer la recette et décider de la mise en service.

## Sources officielles consultées le 18 novembre 2026

- CNIL, accès au DPI et habilitations — https://www.cnil.fr/fr/donnees-de-sante-la-cnil-rappelle-les-mesures-de-securite-et-de-confidentialite-pour-lacces-au
- CNIL, traçabilité — https://www.cnil.fr/fr/securite-tracer-les-operations
- CNIL, formalités et bases juridiques santé — https://www.cnil.fr/fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante
- CNIL, information des personnes — https://www.cnil.fr/fr/traitement-de-donnees-de-sante-comment-informer-les-personnes-concernees
- CNIL, exigences générales santé — https://www.cnil.fr/fr/sante-exigences-generales
- CNIL, incidents — https://www.cnil.fr/fr/securite-gerer-les-incidents-et-les-violations
- ANS, champ HDS — https://esante.gouv.fr/faq/quel-est-le-champ-dapplication-de-la-legislation-relative-lhebergement-de-donnees-de-sante-caractere-personnel
- ANS, procédure HDS — https://esante.gouv.fr/produits-services/hds/procedure-de-certification-hebergeur-de-donnees-de-sante
- ANS, INS — https://esante.gouv.fr/ens/offre/referentiel-ins
- ANS, PSC — https://esante.gouv.fr/produits-services/referentiel-pro-sante-connect
- G-NIUS, qualification du dispositif médical — https://gnius.esante.gouv.fr/fr/le-dispositif-medical-numerique/le-marquage-ce-par-ou-commencer
- Code de la santé publique, R.1112-7 — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000036658351/

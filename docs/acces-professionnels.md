> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

# Accès professionnels — 19 novembre 2026

## Fonctionnement livré dans le prototype

Chaque connexion individuelle du site est liée à un identifiant stable fourni au serveur. Un profil applicatif enregistre nom d’affichage, métier, état actif/désactivé et RPPS facultatif déclaratif. Les attributs de sécurité ne viennent pas d’un sélecteur de rôle du navigateur. Le sélecteur de profils simulés a été retiré de l’interface professionnelle connectée.

Le propriétaire du site administre les habilitations. Les nouveaux comptes ayant effectivement accédé au site démarrent sans métier attribué et sans équipe. L’écran ne crée pas d’identifiants, n’envoie pas d’invitation et ne modifie pas l’audience du site.

Le premier profil du propriétaire conserve le parcours fictif existant : métier applicatif anesthésiste, équipe de démonstration et rattachement des séjours déjà présents. Ce paramétrage de reprise ne constitue pas une vérification des qualifications professionnelles. Les autres comptes ne reçoivent aucun accès clinique automatique.

## Métier et équipe de soins

L’accès exige une appartenance active à une équipe et une affectation active de cette équipe au séjour. Les deux relations disposent d’une date de début et d’une fin facultative. Les périodes et l’état du compte sont relus à chaque requête. Un compteur de politique bloque un lot d’écritures si les droits ont changé entre le contrôle et la transaction.

| Métier | Droits applicatifs principaux dans son périmètre |
| --- | --- |
| Anesthésiste | Lecture clinique ; consultation, préparation, feuille peropératoire, prescriptions, suivi et sortie |
| Chirurgien | Lecture clinique ; annonce, CRO, prescriptions, suivi et sortie ; aucune modification de consultation d’anesthésie |
| Infirmier | Lecture clinique ; ajouts de constantes et d’exécutions de prescriptions médicalement validées ; aucune modification de prescription ou de contexte anesthésique |
| Secrétariat | Données administratives et organisation autorisée ; aucune transmission du dossier clinique |
| Pharmacien | Lecture clinique dans son équipe ; stock et dispensations |
| DIM | Lecture clinique dans son équipe ; préparation du PMSI |
| Facturation | Données administratives et activité nécessaires ; facturation |
| Administration / non attribué | Aucun dossier clinique du seul fait du métier ; administration des habilitations seulement pour le propriétaire |

Le propriétaire a également les fonctions techniques privilégiées d’administration et de sauvegarde. Ces privilèges sont distincts de l’autorisation de lecture des dossiers dans l’interface. L’export de sauvegarde est une opération privilégiée explicitement journalisée.

Les rubriques globales — régulation, activité, PMSI, facturation, identitovigilance — sont filtrées avant transmission. Une écriture par une équipe préserve les lignes hors de son périmètre. Les réponses de conflit, anciennes versions et rapprochements respectent le même filtrage. Les pièces jointes exigent un rattachement autorisé à une rubrique et ne sont pas téléchargeables par la seule connaissance de leur empreinte.

## Traçabilité

Le journal serveur conserve l’identifiant du compte, l’horodatage UTC, l’action, la cible, le résultat autorisé/refusé et les motifs pertinents. Il trace :

- Les connexions initiales et les consultations de profil.
- Les rubriques réellement transférées au navigateur lors du chargement du dossier.
- Les affichages de rubriques signalés par le client ; ils complètent les traces de transfert serveur.
- Les écritures, révisions, lectures d’historique, pièces jointes et exports.
- Les refus d’accès, y compris les tentatives directes sur des dossiers ou fichiers non autorisés.
- Les modifications de métier, état du compte, équipes et périodes d’habilitation, avec auteur et motif.

Des déclencheurs SQL empêchent la mise à jour et la suppression du journal par les opérations applicatives normales. L’administrateur peut le consulter et le filtrer par compte et dossier. La protection contre un administrateur d’infrastructure, l’archivage externe et la surveillance des anomalies restent des sujets d’exploitation clinique.

La désactivation et l’expiration produisent leur effet sur les requêtes suivantes sans attendre une nouvelle connexion. Dans le navigateur, le contrôle périodique ferme et vide la vue du dossier si les droits ou le périmètre ont changé ; les données déjà reçues ne peuvent pas être rendues rétroactivement inconnues à l’utilisateur.

## Reprise et sauvegarde

La migration `0002_professional_access.sql` ajoute les profils, équipes, périodes, rattachements des fichiers et journal. Les sauvegardes au format 2 comprennent ces informations ; le restaurateur recrée le schéma et les habilitations dans une destination neuve. Les anciens exports au format 1 restent lisibles mais ne contiennent pas la nouvelle politique professionnelle. Un changement de fournisseur d’identité ou de site impose un rapprochement contrôlé des identifiants avant réouverture.

## Vérifications

Sept scénarios spécialisés couvrent le cloisonnement par métier et équipe, l’absence de données d’une autre équipe dans les réponses, le refus des anciennes versions non autorisées, les seules écritures infirmières permises, le périmètre chirurgical, les rubriques globales, les comptes non attribués, la désactivation, l’expiration, la traçabilité des vues et les fichiers à empreinte connue. Les tests de sauvegarde/restauration et de concurrence restent exécutés avec cette politique.

L’interface a été vérifiée avec le compte local de prévisualisation : affichage du métier réel de l’application, équipes et périodes, formulaires d’habilitation, liste des affectations et consultation du journal après ouverture d’un dossier. Aucun professionnel réel n’a été invité ou nouvellement habilité.

## Limites avant utilisation clinique

Cette livraison est destinée aux données fictives. L’identité de connexion du site n’est pas une vérification médicale du RPPS et ne remplace pas Pro Santé Connect ou un mécanisme professionnel approprié. Il reste à raccorder et valider l’authentification professionnelle, les exigences d’authentification forte et de sessions, la politique d’habilitation institutionnelle, la supervision des accès anormaux, les durées de conservation, le circuit d’urgence avec bris de glace surveillé et le périmètre d’exploitation HDS/RGPD. Aucun accès d’urgence contournant les équipes n’est ouvert dans cette livraison.

Référence consultée : CNIL, mesures de sécurité et de confidentialité pour l’accès au dossier patient informatisé, 9 février 2024.
https://www.cnil.fr/fr/donnees-de-sante-la-cnil-rappelle-les-mesures-de-securite-et-de-confidentialite-pour-lacces-au

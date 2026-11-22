> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

# Identitovigilance — prototype du 19 novembre 2026

## Périmètre livré

L’onglet Identité & INS complète la recherche patient et affiche un bandeau dans le dossier. Il gère les traits de naissance (nom, premier prénom, liste des prénoms, date, sexe, code INSEE du lieu) et distingue les noms/prénoms utilisés.

- Détection de paires d’identités approchantes : doublon potentiel sur nom/prénom/date identiques, homonymie si date différente ou inconnue, rapprochement simple sur une différence d’un caractère et même date. Les résultats sont des signaux de contrôle, sans score probabiliste ni décision automatique.
- Alerte avant création avec accès au dossier existant ou création explicite d’un séjour distinct après vérification. Plusieurs séjours peuvent légitimement concerner la même personne : cette alerte ne constitue pas une preuve de doublon.
- Décision de rapprochement avec auteur et motif, consignée dans les deux dossiers. Une modification des traits rend la décision de rapprochement périmée. Les dossiers cliniques restent séparés ; fusion/défusion et propagation au SI tiers ne sont pas livrées.
- Corrections locales en deux étapes : aperçu avant/après, confirmation, auteur, motif, version, date et historique conservés pendant la session. Les anciens noms restent recherchables. Le numéro de dossier ne change pas.
- Traits stricts modifiés : invalidation de la récupération fictive et de sa référence technique. Récupérée devient Provisoire ; Qualifiée devient Validée. Les traits complémentaires conservent le statut. Les états sont toujours explicitement marqués « simulation ».
- Ordonnance et lettre de liaison déjà préparées : alerte après correction ; impression bloquée jusqu’au réenregistrement/relecture avec cohérence des traits actuels. Les anciens documents et réponses patient ne sont pas silencieusement réécrits.
- Profil infirmier en lecture seule. Les autres profils sont des rôles de démonstration et non des habilitations d’identitovigilance réelles.

## Qualification INS réelle non disponible

Le prototype distingue contrôle du justificatif et récupération fictive. Une réponse concordante seule produit Récupérée ; un justificatif seul produit Validée ; les deux produisent Qualifiée **en simulation**. Les références de test contiennent « TEST-LOCAL » et ne sont pas des matricules INS. Aucun NIR/NIA, clé, OID, scan d’identité ou justificatif réel ne doit être saisi. Les réponses de référence de test sont fixes pour les six identités initiales ; les nouveaux séjours n’ont pas de réponse de référence.

La qualification réelle nécessite l’intégration autorisée au téléservice INSi, la mise en œuvre de ses spécifications, l’identification/authentification du service et des utilisateurs, les habilitations de l’établissement, la gestion complète des résultats et des preuves, un référentiel unique et une propagation des corrections. Aucune connexion INSi, qualification INS réelle ou conformité certifiée n’est revendiquée. Les données de ce module sont en mémoire et disparaissent au rechargement ; le serveur local partagé n’est pas étendu.

## Références consultées

- ANS, Référentiel INS v2.1 et guide d’implémentation v3.0 (décembre 2024), règles de modification des traits stricts/complémentaires et de déclassement.
  https://esante.gouv.fr/espace_documentation/identite-nationale-de-sante/2-guide-dimplementation/actual
- ANS, RNIV établissement de santé, gestion des identités approchantes et doublons.
  https://esante.gouv.fr/sites/default/files/media_entity/documents/rniv-2-identitovigilance-etablissement-de-sante.pdf
- ANS, impossibilité pour le professionnel de modifier directement l’identité nationale.
  https://esante.gouv.fr/faq/je-constate-une-erreur-sur-une-identite-nationale-de-sante-que-dois-je-faire

## Validation

Tests unitaires : homonymes/doublons/identités proches, absence de rapprochement d’identités vides, transitions de confiance, récupération non concordante, invalidation après correction stricte, conservation sur traits complémentaires, dates et prénoms.

Parcours navigateur vérifiés : refus de récupération avec traits manquants, aperçu de correction, enchaînement Récupérée puis Qualifiée en simulation, maintien du statut pour un nom utilisé, déclassement après changement du nom de naissance, bandeau dans le dossier, recherche par ancien nom et alerte avant création d’un doublon potentiel.

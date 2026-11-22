> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

Mise à jour : les droits professionnels sont désormais contrôlés selon métier et équipe de soins. Voir [acces-professionnels.md](acces-professionnels.md). Les paragraphes historiques ci-dessous décrivant uniquement propriétaire/éditeur/lecteur sont remplacés par cette politique.

# Dossier partagé durable — 19 novembre 2026

## Livré pour le prototype à patients fictifs

Le site utilise désormais une API serveur, une base structurée DB et un stockage de fichiers BUCKET. Les formulaires enregistrés sont persistants entre les sessions et les postes. Les modifications non confirmées par le serveur restent signalées dans l’onglet. Aucun stockage de données réelles n’est autorisé dans cet environnement.

Les instantanés par rubrique couvrent les identités et séjours, consultations et traitements, annonces, préparation, questionnaire intégré au dossier, décisions scientifiques relues, feuille peropératoire, prescriptions et exécutions, constantes et transmissions, CRO et pièce jointe, sortie/ordonnance/liaison/signature de démonstration, événements métier, identitovigilance, régulation des lits et blocs, pharmacie/dispensations, activité, PMSI et facturation. Les sélections d’écran et champs non soumis ne constituent pas des enregistrements ; le brouillon de consultation est capturé automatiquement. Le portail patient autonome et ses invitations restent un système distinct à raccorder au service clinique ; aucun patient réel ne peut être invité.

Les identifiants créés sont indépendants des compteurs locaux pour éviter les collisions entre postes. Le démarrage hydrate les données existantes avant d’autoriser les interactions et ne réinitialise jamais un dossier existant avec les exemples embarqués.

## Concurrence et versions

Chaque rubrique est versionnée. Les sauvegardes automatiques groupent les rubriques modifiées dans une transaction : toutes les révisions attendues sont vérifiées et les écritures sont atomiques. Un conflit sur le stock ne peut donc pas laisser passer seul un mouvement de dispensation. Une reprise réseau répète l’opération de façon idempotente.

Les postes interrogent le serveur toutes les cinq secondes. Les nouvelles versions sont signalées, puis chargées à l’actualisation explicite pour préserver les formulaires en cours. Les modifications concurrentes d’une même rubrique demandent une comparaison départ/local/serveur. Le choix local demande un motif et une attestation de comparaison. Les rubriques différentes peuvent être modifiées simultanément.

Le registre des versions conserve la date UTC serveur, l’identifiant individuel du compte et l’instantané. Des déclencheurs SQL empêchent la modification et la suppression d’anciennes versions via les écritures normales. Une restauration crée une nouvelle révision ; elle ne réécrit pas l’historique. Les administrateurs d’infrastructure gardent des capacités distinctes : ce mécanisme ne constitue pas un archivage probant certifié.

## Accès

Le site conserve son audience privée existante. L’API exige l’identité fournie par la plateforme et contrôle l’origine des écritures. Le premier visiteur authentifié initialise le propriétaire seulement dans ce site initialement réservé à son propriétaire. Les visiteurs autorisés ultérieurs sont lecteurs par défaut. Les profils métier sélectionnables ne changent pas les droits serveur. Une évolution de l’audience exige de cadrer les appartenances et droits avant ouverture ; aucun collaborateur n’a été ajouté par cette livraison.

Les accès et exports sont journalisés. Les droits cliniques détaillés par profession, équipe de soins et patient, le bris de glace surveillé et les exigences d’authentification clinique restent à mettre en place avant usage réel.

## Sauvegarde et reprise

Le bouton « Exporter une sauvegarde » crée une archive TAR contenant les instantanés courants, versions, membres, journal d’accès et pièces jointes référencées par les versions. Les fichiers sont identifiés par SHA-256 et récupérés sous contrôle d’accès. Limites explicites : export navigateur de 50 Mo et 10 000 lignes par table ; en cas de dépassement l’export échoue et exige un export d’exploitation, sans prétendre être complet.

La commande suivante restaure dans un répertoire neuf, sans écraser une base existante :

```
node scripts/restore-backup.mjs sauvegarde.tar nouveau-repertoire
```

Elle vérifie les empreintes des pièces jointes, recrée le schéma et restaure les versions et références. Le résultat est une base SQLite isolée et un répertoire de fichiers pour vérification/reprise. La réinjection dans l’hébergement doit être conduite comme une opération d’exploitation distincte avec validation de cohérence ; ce script ne remplace pas automatiquement une base hébergée.

Le prévisualiseur utilise `.durable-local/` (ignoré par Git). Les sauvegardes et données réelles ne doivent jamais entrer dans le dépôt. Les bases locales et hébergées sont séparées ; les données fictives initiales de l’hébergement sont créées à la première connexion du propriétaire.

## Contrôles réalisés

- Persistance de tous les types de rubriques après fermeture et réouverture de la base.
- Deux connexions concurrentes, changements de rubriques distinctes, conflit d’une révision ancienne.
- Atomicité multi-modules, absence de mouvement isolé si le stock est en conflit.
- Répétition idempotente, historique protégé et restauration comme nouvelle révision.
- Refus des anonymes, écritures des lecteurs et origines étrangères.
- Export complet et restauration isolée avec pièce jointe et historique.
- Navigateur : réception d’un lot, confirmation serveur, rechargement conservant ce lot, deux onglets avec conflit local/serveur visible et chargement de la version serveur.

## À exécuter lors du déploiement clinique sur la base serveur retenue

Cette livraison prépare le mécanisme applicatif ; elle ne valide pas une infrastructure médicale. La mise en service nécessite encore :

1. Identifier l’exploitant, le responsable de traitement et les administrateurs ; contractualiser les prestations et le périmètre HDS applicable.
2. Déployer le même modèle de données et l’API sur l’environnement clinique retenu ; vérifier les migrations, index, contraintes et connexions fichiers. Tester d’abord avec des données fictives.
3. Configurer les comptes nominatifs, leur cycle de vie, l’authentification et les droits par métier/équipe/patient ; tester les refus et la révocation sur chaque API.
4. Préparer une reprise encadrée des dossiers existants, identités et pièces jointes ; comparer volumes, empreintes, liens de séjour et habilitations. Aucune importation de données patient n’est faite dans cette livraison.
5. Planifier les sauvegardes automatiques chiffrées, leur copie séparée, la rétention et la surveillance ; définir RPO/RTO et les responsabilités. Tester une restauration complète sur infrastructure de secours.
6. Mettre en place supervision, alertes techniques, capacité, rotation des secrets, suivi des accès anormaux, correctifs, astreinte et procédure d’incident.
7. Tester panne réseau, fermeture inattendue, conflits multi-utilisateurs, perte de pièce jointe, reprise après incident, export et réversibilité avec les équipes.
8. Formaliser conservation, purge, droits des personnes, information et AIPD selon le périmètre. Faire valider les circuits cliniques et les documents avant ouverture.

Ces étapes requièrent l’environnement clinique, ses comptes et ses contrats. Elles ne sont pas déclarées exécutées sur un serveur HDS qui n’a pas encore été fourni.

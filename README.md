# IASELO — parcours patient périopératoire (Clever Cloud)

Version 1.0.0 : voir [`docs/notes-de-version.md`](docs/notes-de-version.md) pour le contenu, ce qui reste en simulation et les prérequis avant toute donnée réelle.

## Origine : Parcours Anesthésie — déploiement autonome Clever Cloud

Export du 20 novembre 2026. Source initiale et adaptations : `SOURCE_VERSION.txt`.

Cette distribution contient l’interface complète existante, les modules métier, un serveur Node.js autonome, les migrations PostgreSQL, les dépendances verrouillées et les ressources OCR françaises. Elle ne nécessite pas la connexion ChatGPT et ne rétablit pas la connexion Emed.

**Commande de démarrage : `npm start`.** Le serveur écoute sur `0.0.0.0`, port `8080` par défaut (variable `PORT`). Il applique les migrations avant de démarrer, crée le premier administrateur si nécessaire et vérifie l’accès au bucket. Une configuration incomplète fait échouer le démarrage explicitement.

L’export ne contient aucune base existante et n’importe pas les données du site actuellement hébergé. Par défaut, l’installation commence sans séjour. Les exemples fictifs embarqués sont activables séparément, avec `ENABLE_DEMO_SEED=true`, uniquement sur une base de test vierge.

## 1. Services à créer

Dans Clever Cloud, créer une application **Node.js 24**, un add-on **PostgreSQL** et un add-on **Cellar**. Lier les deux add-ons à l’application. Dans Cellar, créer un bucket **privé**, sans autorisation publique, et conserver son nom pour `S3_BUCKET`. Aucune écriture durable ne dépend du disque de l’instance Node.js.

Ne pas choisir une application statique : les comptes, les questionnaires, les versions et les pièces jointes exigent le serveur. Les identifiants des add-ons liés sont injectés par Clever Cloud ; ne pas les recopier dans Git.

Documentation officielle :

- [Node.js](https://www.clever.cloud/developers/doc/deploy/applications/nodejs/)
- [Variables d’environnement](https://www.clever.cloud/developers/doc/manage/environment-variables/reference/)
- [PostgreSQL](https://www.clever.cloud/developers/doc/deploy/databases/postgresql/)
- [Cellar](https://www.clever.cloud/developers/doc/deploy/storage/cellar/)

## 2. Préparer les paramètres

Décompresser le ZIP, ouvrir un terminal à la racine contenant `package.json`, installer Node.js **24**, puis :

```sh
npm ci
npm run build
npm test
```

Créer un secret de session aléatoire :

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Conserver le résultat dans le gestionnaire de secrets, puis dans la variable Clever Cloud `SESSION_SECRET`. Générer l’empreinte du mot de passe personnel du premier administrateur :

```sh
npm run password:hash
```

La saisie du mot de passe est masquée dans un terminal. Il doit contenir au moins 14 caractères. Copier uniquement la ligne commençant par `scrypt$` dans `BOOTSTRAP_ADMIN_PASSWORD_HASH`. Cette empreinte reste sensible ; ne pas la versionner. Elle s’utilise telle quelle dans la console Clever Cloud, sans supprimer les `$`.

Configurer l’environnement de l’application dans Clever Cloud :

| Variable | Valeur attendue |
| --- | --- |
| `NODE_ENV` | `production` |
| `BASE_URL` | Origine HTTPS publique exacte, par exemple `https://votre-domaine`, sans chemin |
| `SESSION_SECRET` | Secret aléatoire généré ci-dessus |
| `SESSION_HOURS` | `8` par défaut, de 1 à 24 |
| `SESSION_IDLE_MINUTES` | `60` par défaut, de 5 à 480 : session close par le serveur après cette inactivité |
| `MESSAGING_MAX_PAR_HEURE` | `400` par défaut (`100` en recette) : plafond d’e-mails et SMS par heure pour tout le serveur |
| `MESSAGING_MAX_PAR_DESTINATAIRE` | `10` par défaut : plafond de messages par heure vers un même patient |
| `BOOTSTRAP_ADMIN_EMAIL` | E-mail du premier administrateur |
| `BOOTSTRAP_ADMIN_NAME` | Nom affiché du premier administrateur |
| `BOOTSTRAP_ADMIN_PASSWORD_HASH` | Empreinte scrypt générée ci-dessus |
| `S3_BUCKET` | Nom du bucket Cellar privé existant |
| `S3_REGION` | `default` pour Cellar |
| `PGSSL` | `verify-full` par défaut : TLS avec certificat vérifié |
| `CC_NODE_VERSION` | `24` |
| `CC_NODE_BUILD_TOOL` | `npm-ci` |
| `CC_RUN_COMMAND` | `npm start` |
| `CC_HEALTH_CHECK_PATH` | `/healthz` |
| `ENABLE_DEMO_SEED` | `false` |

Variables apportées par les add-ons :

- PostgreSQL : `POSTGRESQL_ADDON_URI`, ou `POSTGRESQL_ADDON_HOST`, `POSTGRESQL_ADDON_PORT`, `POSTGRESQL_ADDON_DB`, `POSTGRESQL_ADDON_USER`, `POSTGRESQL_ADDON_PASSWORD`.
- Cellar : `CELLAR_ADDON_HOST`, `CELLAR_ADDON_KEY_ID`, `CELLAR_ADDON_KEY_SECRET`.

`DATABASE_URL` peut remplacer les paramètres PostgreSQL. `S3_ENDPOINT`, `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY` peuvent remplacer ceux de Cellar pour un service S3 compatible. L’endpoint objet doit utiliser HTTPS en production.

Vérifier auprès de Clever Cloud les paramètres TLS de l’endpoint PostgreSQL retenu. Si une autorité spécifique est nécessaire, renseigner `PGSSL_CA` avec son certificat PEM. Une URL contenant `sslmode` ne désactive pas la vérification choisie par l’application. `PGSSL=disable` est prévu pour un PostgreSQL local de test ou un réseau privé dont le transport a été validé explicitement ; ne pas contourner une erreur de certificat d’un endpoint public en désactivant TLS.

Le fichier `.env.example` recense les paramètres sans secrets. Sur Clever Cloud, utiliser les variables de la console, sans envoyer de `.env`. Pour un essai local, copier `.env.example` en `.env`, choisir `NODE_ENV=development`, une origine `http://localhost:8080`, un PostgreSQL et un stockage S3 accessibles. Le serveur charge ce fichier au démarrage. Ne pas importer les valeurs vides du modèle par-dessus les identifiants des add-ons liés.

## 3. Envoyer le code et démarrer

Clever Cloud déploie un dépôt Git ; le ZIP est le paquet source à décompresser, pas un fichier à envoyer à une application statique.

1. Placer le contenu décompressé dans un nouveau dépôt **privé** GitHub ou un dépôt Git de déploiement Clever Cloud. `package.json` doit être à la racine du dépôt.
2. Si le dossier n’est pas encore un dépôt, exécuter :

   ```sh
   git init
   git add .
   git commit -m "Export autonome Parcours Anesthesie pour Clever Cloud"
   ```

3. Depuis la console Clever Cloud, connecter ce dépôt à l’application Node.js, ou suivre les commandes `git remote`/`git push` affichées par Clever Cloud pour cette application. Elles contiennent une URL propre à votre application ; aucune URL n’est préremplie dans cette archive.
4. Vérifier les add-ons liés, les variables et le domaine HTTPS, puis lancer le déploiement.
5. Les journaux doivent afficher `Parcours Anesthésie écoute sur 0.0.0.0:8080`. Vérifier `https://votre-domaine/healthz` : réponse attendue `{"status":"ok"}`.
6. Ouvrir l’URL principale : la page de connexion professionnelle apparaît. Utiliser l’e-mail du premier administrateur et le mot de passe dont l’empreinte a été générée.
7. Sur l’écran initial vide, cliquer sur **Nouveau séjour fictif**, sélectionner l’équipe de soins et créer un dossier de test. Vérifier la consultation, le dossier infirmier avec plan de soins et transmissions, le circuit médicament, le planning bloc/SSPI/lits et la réouverture du dossier après déconnexion.

Après le premier démarrage réussi, retirer les trois variables `BOOTSTRAP_ADMIN_*` de l’environnement de l’application : le compte est conservé dans PostgreSQL. Elles ne remplacent jamais un compte déjà créé. Si la base est vide et qu’elles sont absentes, le démarrage échoue ; personne ne peut s’attribuer le rôle de propriétaire en étant le premier visiteur.


## Serveur de recette (test, données fictives)

Pour un serveur de test séparé de la production, sans aucune manipulation technique : créer une **autre** application Node.js 24 avec ses propres add-ons PostgreSQL et Cellar, puis ajouter la seule variable `IASELO_RECETTE=true`. Le serveur déduit alors son adresse `https://app-….cleverapps.io` de `APP_ID`, tire un secret de session à chaque démarrage (les sessions sont perdues au redémarrage), active les patients fictifs, crée son bucket privé `iaselo-recette-…` et un compte de test affiché sur la page de connexion. Ne jamais activer ce mode sur l’application de production ni y saisir de données réelles. `BASE_URL`, `SESSION_SECRET`, `S3_BUCKET` restent prioritaires s’ils sont renseignés. Si l’add-on PostgreSQL présente un certificat auto-signé (`DEPTH_ZERO_SELF_SIGNED_CERT`), ajouter `PGSSL=require` : la connexion reste chiffrée mais le certificat n’est pas vérifié. Cette valeur est refusée hors mode recette ; en production, fournir le certificat via `PGSSL_CA`.

## 4. Comptes et habilitations

Les sessions professionnelles sont gérées par le serveur, avec mot de passe scrypt, cookie HttpOnly/SameSite/Secure en HTTPS, expiration et limitation des tentatives. Les en-têtes d’identité entrants de l’ancien hébergeur sont supprimés. Les droits métier et les équipes de soins restent contrôlés côté serveur.

**Depuis l’application (recommandé)** : l’administrateur ouvre **Accès professionnels → Créer un compte**, saisit le nom, l’e-mail, le métier, l’équipe de soins et un motif. Le serveur vérifie qu’il s’agit bien de l’administrateur, tire un mot de passe provisoire affiché une seule fois et trace la création dans le journal des accès. Le professionnel se connecte avec ce mot de passe provisoire et doit en choisir un nouveau (`/mot-de-passe`) avant d’accéder à un dossier.

**Depuis un terminal** (sans interface), disposant des variables de la base cible, de préférence sur le poste d’administration sécurisé :

```sh
NEW_USER_EMAIL='professionnel@example.org' NEW_USER_NAME='Nom du professionnel' npm run user:create
```

Cette commande demande un nouveau mot de passe masqué. Le compte est créé **sans habilitation clinique**. Dans l’application, le propriétaire ouvre **Accès professionnels**, choisit son métier, l’active et lui attribue une équipe de soins ainsi que les séjours nécessaires. Le sélecteur visuel de profil ne donne aucun droit supplémentaire.

Pour réinitialiser un mot de passe et révoquer les sessions de ce compte :

```sh
RESET_USER_EMAIL='professionnel@example.org' npm run user:password
```

Aucun mot de passe générique ni compte préconfiguré n’est fourni. Aucune inscription publique n’est ouverte. Cette authentification n’implémente pas encore MFA, Pro Santé Connect ou procédure de récupération autonome ; ces choix restent à traiter avant un usage clinique réel.

## 5. Questionnaire et photo Doctolib

L’OCR de la capture est réalisé dans le navigateur, avec les ressources Tesseract locales. L’image n’est pas transmise au serveur par cette fonctionnalité. Les champs doivent être relus et les coordonnées confirmées avant la création de l’invitation.

Le serveur prépare un lien `https://votre-domaine/patient.html#invitation=…`, valable 48 heures, révocable par remplacement et utilisable une fois pour l’envoi. Le patient n’a pas besoin d’un compte professionnel. La page patient (`dist/patient.html`) ne charge que `patient-portal.js` : aucun code du dossier professionnel n’est transmis au patient. Elle vérifie le lien à l’ouverture, retire le jeton de la barre d’adresse et affiche un message clair si le lien est absent, expiré ou déjà utilisé. Les questions sont reprises de `parcours-v8.js` : toute modification du questionnaire doit être faite aux deux endroits. Le jeton brut n’est pas conservé en base ; seule son empreinte l’est. Les réponses validées sont rattachées au séjour invité et soumises à la relecture clinique.

**Aucun fournisseur SMS/e-mail n’est intégré.** L’application prépare le message et propose de le copier ou de l’ouvrir dans le logiciel de messagerie de l’utilisateur. Un déploiement du serveur ne réalise pas à lui seul l’envoi automatique. Ne pas activer de journalisation des corps de requêtes, cookies ou liens patient.

## 6. Stockage, migrations et sauvegardes

- `migrations/postgres/*.sql` : schéma PostgreSQL, comptes, sessions, droits, questionnaires, versions et journaux. Application automatique transactionnelle au démarrage avec verrou et contrôle des empreintes ; commande séparée : `npm run db:migrate`.
- `Cellar/S3` : pièces jointes, nommées par empreinte SHA-256. Elles restent privées et sont téléchargées par l’API sous contrôle d’accès au dossier.
- Les écritures groupées utilisent une transaction PostgreSQL de niveau SERIALIZABLE et des révisions attendues. Un conflit n’enregistre pas une partie du lot.
- Le navigateur interroge les mises à jour ; un conflit nécessite une comparaison. Ne pas écraser les données d’un autre poste sans relecture.

Planifier les sauvegardes **de PostgreSQL et du bucket** et tester leur restauration sur des services isolés. Exemple d’export PostgreSQL, depuis un terminal sécurisé disposant des outils PostgreSQL et des paramètres de connexion/TLS dans son environnement :

```sh
pg_dump --format=custom --file=parcours-postgresql.dump
```

Configurer `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSFILE` (fichier privé) et `PGSSLMODE=verify-full`/`PGSSLROOTCERT` suivant votre endpoint. Ces noms appartiennent aux outils PostgreSQL et diffèrent de `PGSSL`, utilisé par l’application. Ne pas mettre de mot de passe dans les arguments de commande. Pour une restauration isolée :

```sh
pg_restore --no-owner --no-acl --dbname=base_isolee parcours-postgresql.dump
```

Copier parallèlement les objets Cellar et vérifier leur SHA-256. Pour une sauvegarde cohérente, suspendre les écritures pendant les deux exports, puis reprendre le service. Un redéploiement du code ne restaure aucune donnée. Le bouton d’export navigateur est un complément limité en taille ; il n’inclut pas tous les comptes/sessions et ne remplace pas la sauvegarde d’exploitation PostgreSQL/S3. L’ancien script `restore-backup.mjs` restaure une archive historique vers SQLite ; il n’importe pas cette archive dans PostgreSQL.

Si des données doivent être reprises du site antérieur, réaliser un export autorisé puis un import adapté et validé à part. Aucun accès à sa base ni migration de données n’a été inclus dans ce ZIP.

## 7. Diagnostic

| Symptôme | Vérification |
| --- | --- |
| Démarrage refusé | Journaux : `BASE_URL`, `SESSION_SECRET`, compte initial, identifiants PostgreSQL et bucket |
| Erreur de certificat PostgreSQL | Endpoint/autorité TLS fournis par l’hébergeur, `PGSSL_CA` |
| `AccessDenied` / `NoSuchBucket` | Bucket privé existant, `S3_BUCKET`, clés Cellar et permissions |
| Connexion ou écriture : origine refusée | `BASE_URL` doit correspondre au domaine réellement utilisé ; choisir un domaine canonique |
| Aucun dossier visible | Affectation à une équipe et au séjour, métier actif ; base initialement vide par défaut |
| Déploiement traité comme site statique | Recréer/choisir une application Node.js et démarrer `npm start` |
| Redéploiement sans données de l’ancien site | Normal : les bases ne sont pas partagées automatiquement |

## 8. Contenu et statut de cette version

| Dossier/fichier | Fonction |
| --- | --- |
| `dist/` | Interface existante complète, styles, illustrations, ressources OCR et modules front-end |
| `worker/` | Sources métier et contrôles d’accès réutilisés par le serveur autonome |
| `server/` | Serveur HTTP Node.js, authentification, PostgreSQL et S3/Cellar |
| `migrations/postgres/` | Migrations utilisées sur Clever Cloud |
| `package.json`, `package-lock.json` | Dépendances et commandes reproductibles |
| `.env.example` | Paramètres à compléter, sans secrets |
| `clevercloud/environment.example` | Paramètres runtime à saisir dans la console ; fichier informatif |
| `tests/` | Tests métier, droits et intégration PostgreSQL/S3 |
| `docs/` | Documentation de conception du prototype, conservée pour référence |
| `drizzle/`, `worker/sqlite-adapter.mjs`, `scripts/restore-backup.mjs` | Schéma SQLite historique, utilisé uniquement par les tests métier ; pas le runtime Clever Cloud |
| `.github/workflows/ci.yml` | Intégration continue : build et tests à chaque modification |
| `VALIDATION.md` | Résultats et limites des vérifications réalisées pour l’archive |

L’interface est maintenue directement dans `dist`, sans compilateur. Le dossier clinique principal est `dist/parcours-v8.js` (et `parcours-v8.css`) : c’est le fichier source à modifier. Les anciennes couches `parcours-v5` à `v7`, leurs sources `app.js`, `patient.js`, `consultation.js`, `workflow.js` et le script `build-static.mjs`, qui aurait écrasé `parcours-v8.js` avec ces sources périmées, ont été retirés. `npm run build` vérifie les sources, les ressources et l’absence de ces fichiers retirés. Les anciens scripts Cloudflare (`build-durable.mjs`, `dev-durable.mjs`) et le serveur de démonstration `demo-server/` ont également été retirés ; ils restent consultables dans l’historique Git.

Cette version conserve le statut de **prototype à données fictives** et ses limites fonctionnelles. Elle n’est pas présentée comme un DPI certifié ou un dispositif médical validé. Avant des données réelles : vérifier le périmètre HDS des services et du contrat souscrit, la conformité et les procédures de la clinique, la sécurité des accès et la validation clinique du logiciel. Le choix de Clever Cloud seul ne réalise pas ces validations.

Le déploiement sur un véritable compte Clever Cloud, les certificats de votre endpoint, le bucket et les flux réseau doivent encore être vérifiés dans votre environnement. Aucun service n’a été provisionné ou facturé par la préparation de cette archive.

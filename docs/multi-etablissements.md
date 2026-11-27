# Plusieurs établissements : une installation par établissement

Décision de Romain du 27/11/2026. Chaque établissement a **sa propre application** Clever Cloud, avec sa base PostgreSQL, son stockage Cellar et son adresse. Aucune donnée n'est partagée entre établissements : le cloisonnement est total et simple à démontrer en audit HDS.

## 1. Régler l'établissement d'une installation (administrateur)
Menu **Établissement**, réservé à l'administrateur :
- nom, adresse, code postal, ville, téléphone, n° FINESS ;
- logo pour fond clair et logo pour fond sombre (PNG, WebP ou JPEG, 2 Mo au plus).

Ces valeurs remplacent celles d'origine (Clinique du Trocadéro) dans les pages, la connexion, les documents (consultation, ordonnances, bons de commande…) et les SMS ou e-mails. Les documents déjà signés ne changent pas. Chaque modification est tracée dans le journal des accès.

Pour une nouvelle installation, les variables `ETABLISSEMENT_NOM`, `ETABLISSEMENT_ADRESSE`, `ETABLISSEMENT_CP`, `ETABLISSEMENT_VILLE`, `ETABLISSEMENT_TEL` et `ETABLISSEMENT_FINESS` donnent les valeurs de départ. Le réglage fait à l'écran les remplace ensuite.

À faire par chaque établissement : relire les textes propres au Trocadéro, comme le formulaire de consentement (`dist/espace-patient-regles.js`) et les listes d'UF de la pharmacie. Seul le nom y est remplacé automatiquement.

## 2. Console des installations (exploitant)
`scripts/console-installations.mjs`, à lancer sur le poste de l'exploitant :

| Commande | Effet |
| --- | --- |
| `node scripts/console-installations.mjs nouvelle --code lilas --nom "Clinique des Lilas" --url https://lilas.exemple.fr --admin-email admin@… [--finess …] [--ville …] [--org …] [--plan-pg …]` | Écrit `installation-lilas.sh`, qui contient les commandes Clever Cloud (application Node 24, PostgreSQL, Cellar, variables, domaine, déploiement) et les secrets générés. Ajoute aussi l'installation à `installations.json`. |
| `node scripts/console-installations.mjs etat` | Affiche, pour chaque installation, la version, le commit, les migrations, l'état de la base et du stockage, et signale les écarts de version. |
| `node scripts/console-installations.mjs mettre-a-jour` | Liste les commandes de déploiement de la version courante, installation par installation, chacune suivie d'une vérification d'état. |

- `installations.json` et les scripts `installation-*.sh` ne sont jamais versionnés (`.gitignore`). Les scripts contiennent des secrets : supprimez-les après usage.
- Le jeton de console de chaque installation (`INSTANCE_CONSOLE_TOKEN` côté application, 32 caractères au moins) reste dans une variable d'environnement du poste de l'exploitant, jamais dans un fichier.
- `GET /api/instance/etat` ne renvoie que des informations techniques, sans aucune donnée de santé. Sans jeton configuré, la route n'existe pas (404).
- L'offre PostgreSQL HDS (`--plan-pg`) et la syntaxe de la CLI `clever` sont à vérifier au moment de la création, car la CLI évolue.

## Limites
- Les comptes sont propres à chaque installation : un médecin qui exerce dans deux établissements a deux comptes. Pro Santé Connect, une fois raccordé, évitera de gérer deux mots de passe.
- Il n'y a pas de tableau de bord consolidé entre établissements : ce serait un partage de données, à décider à part.

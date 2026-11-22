# Vérifications de l’export — 20 novembre 2026

- Node.js utilisé : 24.22.3.
- Installation reproductible des dépendances de production : `npm ci --omit=dev` réussie.
- Vérification des ressources et syntaxe des sources autonomes : `npm run build` réussie.
- Suite complète : `npm test` — **47 tests réussis, 0 échec**.
- Les 44 tests métier existants vérifient notamment médicaments/stocks, bloc/SSPI/lits, identités, plan de soins, transmissions, droits par profession/équipe, versions, concurrence et invitations.
- Les 3 tests ajoutés couvrent la traduction SQL/configuration, le parcours serveur sur PostgreSQL embarqué PGlite et l’adaptateur S3 avec un serveur HTTP de test.

## Vérifications d’intégration réalisées

Les migrations PostgreSQL sont exécutées puis rejouées sans duplication. Le parcours utilise le moteur PostgreSQL embarqué de PGlite et les requêtes de l’application : création du premier compte, connexion, refus des faux en-têtes d’identité, refus des origines étrangères, interdiction du préchargement non activé, création de séjour, enregistrement des rubriques, rejeu idempotent, rejet atomique d’un lot périmé, immutabilité des versions, invitation et dépôt de questionnaire à usage unique, accès refusé à un compte non habilité, fermeture/réouverture de la base et maintien de la session, déconnexion et révocation.

Un véritable serveur HTTP Node.js est démarré dans ce test, son endpoint de santé et ses en-têtes de sécurité sont interrogés. L’adaptateur S3 est testé avec l’AWS SDK, des requêtes signées et un endpoint local : écriture/lecture binaire, nom de fichier accentué, objet absent et absence d’ACL publique.

## Limites de la vérification

Aucun compte Clever Cloud n’a été utilisé et aucun service distant n’a été provisionné. Les paramètres propres à votre compte, l’endpoint PostgreSQL/son certificat TLS, les permissions effectives Cellar, le domaine HTTPS et le déploiement final restent à tester chez l’hébergeur. Le test S3 utilise un endpoint local, pas le service Cellar réel. Le test PostgreSQL utilise PGlite et non un serveur add-on distant via le pilote réseau `pg`.

La navigation graphique complète dans Chromium n’a pas pu être exécutée dans cet environnement. Les fichiers front-end existants ont été conservés ; leurs modules et contrôles sont couverts en partie par les tests métier, sans validation exhaustive de chaque écran.

Aucune donnée de la base du site antérieur n’a été exportée. Les données des tests sont fictives et créées dans des répertoires temporaires supprimés par les tests. Les fichiers temporaires d’essai, dépendances installées, configurations de publication antérieures et secrets opérationnels sont exclus du ZIP.

Le déploiement du prototype ne vaut pas validation clinique, homologation du logiciel ni validation du périmètre contractuel HDS. Voir README.md.

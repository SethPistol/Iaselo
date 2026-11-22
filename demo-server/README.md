# Questionnaire FADM-109 — démonstration

Données fictives uniquement. Ne pas exposer ce serveur sur Internet ni l'utiliser pour des soins.

Avec Node 24 :
```sh
DEMO_PASSWORD='choisir-un-secret-de-16-caracteres' node demo-server/server.cjs
```
Ouvrir http://localhost:8080 et s'authentifier avec l'utilisateur demo. Ouvrir un des six séjours préchargés, puis Consultation d'anesthésie → Questionnaire patient → Créer ou remplacer le QR. Pour tester depuis un téléphone sur un réseau de test, définir DEMO_HOST=0.0.0.0 et DEMO_BASE_URL sur l'origine joignable depuis le téléphone, port compris. Employer uniquement des données fictives.

Le lien expire après 48 h, un remplacement révoque le lien précédent et une soumission réussie le consomme. Le token est stocké haché. Cliquer « Rechercher un envoi » côté équipe, vérifier les réponses et les reprendre dans le brouillon. Les réponses transmises restent dans SQLite ; le brouillon clinique reste limité à la session du navigateur.

Test HTTP : `node demo-server/test.cjs`.

Pour un déploiement clinique : remplacer les séjours fictifs et l'authentification de test par les identifiants et habilitations de la clinique ; définir identité, traçabilité, durée de conservation et hébergement approuvés par la DSI/DPO. Le site statique existant ne fournit pas ces API.

## Dossier partagé autonome de démonstration

Avec Node.js 24, définir `DEMO_PASSWORD`, `DEMO_SECRETARIAT_PASSWORD`, `DEMO_ANESTHESIE_PASSWORD` et `DEMO_IDE_PASSWORD` avec quatre valeurs distinctes d’au moins 16 caractères. Le serveur écoute sur la boucle locale par défaut. `DEMO_DB` permet de choisir le fichier SQLite (par défaut `demo-server/questionnaires.sqlite`).

Lancer `node demo-server/server.cjs` puis ouvrir `http://localhost:8080/shared` dans trois profils de navigateur distincts. Utiliser respectivement les comptes `secretariat`, `anesthesie` et `ide` avec le mot de passe correspondant. Le secrétariat crée le séjour fictif. L’anesthésiste actualise la liste, enregistre ou valide la consultation de démonstration, puis change l’étape en SSPI. L’IDE retrouve ce séjour, consulte le dossier et enregistre un relevé de constantes. L’historique associe une date et le compte de démonstration à chaque écriture.

Le site statique conserve sa démonstration existante. Le dossier partagé fonctionne via le serveur Node local. Ce serveur et ses trois comptes de rôle sont destinés aux scénarios fictifs. Les autres écrans du prototype ne font pas partie du flux partagé. Test HTTP avec redémarrage du serveur : `node demo-server/shared-stays.test.cjs`.

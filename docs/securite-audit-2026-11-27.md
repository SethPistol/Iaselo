# Audit de sécurité du 27/11/2026

Revue complète du code de la recette (216557d) : authentification, droits par profil, liens patients, flux des
partenaires (FHIR, téléphonie, objets connectés, biologie, paiement), pièces jointes, injection de code dans les
écrans, en-têtes, secrets et dépendances. Aucune faille critique. Dix points corrigés, vérifiés par
`tests/clever/securite-27-11.test.mjs`.

| # | Constat | Correction |
|---|---|---|
| 1 | Accueil téléphonique (transcriptions, numéros complets) lisible par tous les profils (pharmacie, DIM, facturation…) | Réservé au secrétariat, à l’administration et à l’administrateur, refus tracés (`worker/telephonie.mjs`) |
| 2 | Un lien piégé ouvert par un soignant connecté pouvait déclencher une lecture qui modifie (messages patients marqués « lus ») | Toute requête vers `/api/workspace` venant d’un autre site est refusée (`Sec-Fetch-Site`, `server/index.mjs`) |
| 3 | Scripts en ligne autorisés par la politique de sécurité : une injection de code aurait pu s’exécuter | `script-src` sans `'unsafe-inline'` ; page hors connexion sans script en ligne (`dist/hors-ligne-page.js`) ; + `Cross-Origin-Opener-Policy`, `Permissions-Policy` |
| 4 | Pas de fin de session sur inactivité côté serveur ; cookie conservé après fermeture du navigateur (poste partagé) | Session close après `SESSION_IDLE_MINUTES` (60) sans requête, tracée ; cookie de session du navigateur (migration 032) |
| 5 | Pulvérisation de mots de passe possible (limite par compte seulement) | Au-delà de 20 comptes en échec en 15 min depuis une même adresse, adresse bloquée 15 min |
| 6 | Nom de l’établissement inséré tel quel dans les scripts : une apostrophe cassait l’application, un guillemet permettait d’injecter du code | Caractères spéciaux remplacés par leur équivalent typographique (`sur()` dans `server/etablissement.mjs`) |
| 7 | Pièces jointes servies avec le type déclaré par le poste qui les dépose | Types exécutables (HTML, SVG, XML, JS) servis en fichier brut, bac à sable sans script (`worker/fichiers-surs.mjs`) |
| 8 | Aucun plafond d’envoi de SMS/e-mails (compte volé : harcèlement, crédits épuisés) | Plafonds par heure et par destinataire (`server/brevo.mjs`) |
| 9 | Webhook FHIR pouvant viser le réseau interne de l’hébergeur | Adresses locales, privées et de métadonnées refusées (`worker/fhir.mjs`) |
| 10 | Jeton d’identité Pro Santé Connect accepté sans date d’expiration | Expiration exigée (`server/interop/psc.mjs`) |

Vérifié sans constat : requêtes SQL toutes paramétrées ; liens patients (256 bits, empreinte seule en base, date de
naissance, 5 essais) ; signatures HMAC des flux partenaires en temps constant avec fenêtre de 5 min ; dépôt de
pièces par les patients (type réel, PDF actifs refusés) ; aucun secret dans le dépôt ; `npm audit` sans
vulnérabilité ; 34 écrans et dossiers parcourus avec des données piégées (`"'><img onerror>`) : aucun code exécuté.

Restent ouverts (organisationnel, audit du 24/11) : mots de passe des comptes de test de la recette connus
(changer celui de demo@iaselo.test ou activer `MFA_OBLIGATOIRE=true` en recette), journaux dans la même base,
AIPD, purge, contrat Brevo, plan de reprise.

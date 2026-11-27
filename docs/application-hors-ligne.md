# Application installable et continuité hors connexion

## Installer IASELO
- Le navigateur (Chrome, Edge) propose l'installation : menu **Options › Installer IASELO sur ce poste**, ou l'icône d'installation de la barre d'adresse. Sur iPad : Partager › Sur l'écran d'accueil.
- IASELO s'ouvre alors dans sa propre fenêtre, avec son icône. Fichiers : `dist/manifest.webmanifest`, `dist/assets/app/`.

## Ce qui est gardé sur le poste
- Le service worker (`dist/sw.js`) garde **seulement les fichiers de l'application** (scripts, styles, images). Il ne garde jamais une réponse d'API ni un dossier patient.
- Réseau d'abord : en ligne, la dernière version est toujours chargée. Hors ligne, une page demandée affiche `hors-ligne.html` (procédure dégradée).
- Exception déjà existante : les saisies rapides du bloc en cours restent sur la tablette jusqu'à leur enregistrement (`veille-plus.js`).

## Coupure réseau pendant le travail
- Bandeau rouge « Hors connexion depuis … » : les saisies restent dans l'onglet et partent automatiquement au retour du réseau.
- Le navigateur demande confirmation si l'on ferme l'onglet pendant la coupure.

## Fiche de continuité (procédure dégradée)
- Menu **Options › Fiche de continuité** : patients du périmètre du professionnel, présents (bloc, SSPI, service) ou opérés depuis 3 jours, prévus aujourd'hui et demain.
- Pour chacun : identité, intervention et latéralité, bloc, ASA et technique, **allergies**, traitements et décisions, antibioprophylaxie. « Consultation non validée » est signalé.
- À imprimer chaque matin (ou avant une maintenance) et à détruire après usage. Chaque édition est tracée dans le journal des accès.
- Serveur : `worker/continuite.mjs`, `GET /api/workspace/continuite`.

## Limites (dites honnêtement)
- On ne peut pas ouvrir un dossier ni en saisir un nouveau sans réseau : c'est voulu, pour ne pas laisser de données de santé sur des postes partagés (HDS).

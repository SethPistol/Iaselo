# Alertes du bloc en temps réel et arrivée du patient par QR code (5e veille, lot 3)

## Alertes du bloc
Bouton « Bloc » en bas à droite de l'application (pastille = alertes non vues). Le fil est calculé par le serveur à partir du programme opératoire (étapes horodatées dans « Déroulement du programme ») et des arrivées : aucune saisie en plus.
- Patient arrivé au bloc, installé en salle, sortie de salle : chirurgien de l'intervention, anesthésistes, infirmiers de bloc.
- Patient sorti du bloc : anesthésistes, étage, bloc.
- Dès qu'un patient entre en salle : « Préparer le patient suivant » (chambre, salle, heure de passage) pour l'étage et le bloc.
- Passage prévu dépassé de 15 min sans arrivée au bloc : alerte au bloc, au chirurgien et à l'étage.
- Patient arrivé à la clinique : accueil, étage, bloc.
- Mise à jour toutes les 20 s ; un bandeau annonce chaque nouvelle alerte. Notification du téléphone ou de l'ordinateur si l'utilisateur l'active (application installée) : jamais de nom de patient dans la notification.
- Le nom du patient n'est affiché qu'aux professionnels habilités sur son séjour.
- Les vraies notifications « push » application fermée demanderont un service de notification (clés VAPID) : à décider.

## Arrivée le jour J
- Affiche à imprimer depuis « Arrivées du jour » (QR code de l'adresse `/arrivee.html`, généré par IASELO, `dist/qr-code.js`).
- Le patient flashe le QR code, indique son nom de famille et sa date de naissance : si le patient est attendu au bloc aujourd'hui, l'arrivée est notée. La réponse est la même dans tous les cas (rien n'est révélé), 8 essais par 10 minutes et par adresse.
- L'arrivée prévient l'accueil, l'étage et le bloc, et les proches par SMS sans donnée médicale si le patient l'a accepté (nouvelle étape « Arrivée à la clinique » de l'information des proches).
- Écran « Arrivées du jour » (secrétariat, administrateurs ; lien aussi depuis le panneau des alertes) : patients attendus, arrivée (QR ou accueil), « Identité vérifiée » (identitovigilance), « Annuler » en cas d'erreur. Page patient traduite dans les 7 langues.

Serveur : `worker/accueil-bloc.mjs`, migration `033_arrivees.sql`. Tests : `tests/accueil-bloc.test.cjs`, `tests/clever/accueil-bloc.test.mjs`.

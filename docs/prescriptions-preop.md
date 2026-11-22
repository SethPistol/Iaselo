# Prescriptions préopératoires envoyées au patient

Pendant la consultation d’anesthésie, onglet **Consultation d’anesthésie › Prescriptions préopératoires**.

## Ce que le médecin rédige
- **Examens biologiques** : 15 examens à cocher (aucun bilan systématique, SFAR 2012). Des propositions apparaissent d’après le dossier (âge, sexe, anticoagulant, AVK, diabète, risque hémorragique, HEMSTOP) mais rien n’est coché automatiquement. Date limite, précisions pour le laboratoire, autres examens.
- **Prémédication** : médicament, posologie, moment de prise. Chaque ligne est contrôlée avec les allergies du dossier (même moteur que l’amélioration 1.1) ; une allergie connue bloque la signature tant qu’un motif n’est pas saisi (motif tracé dans l’historique).
- **Traitements habituels** : repris des consignes validées dans « Scores, tri & consignes », sinon des règles d’arrêt datées (veille). Texte modifiable, ligne à inclure ou non.
- **Douche préopératoire** (SF2H 2016), **jeûne** (solides 6 h, liquides clairs 2 h, horaires calculés si l’heure d’intervention est connue), **autres consignes** (boutons rapides : accompagnant, conduite, PPC…).

## Signature, impression, envoi
- **Signer** fige une version (empreinte SHA-256 du contenu). Toute modification passe par « Modifier (nouvelle version) ».
- **Imprimer** : ordonnance (examens + médicaments) puis consignes, chacune sur sa page A4 avec le logo de l’établissement, le prescripteur, son RPPS s’il est renseigné, l’identité du patient et un cadre de signature manuscrite.
- **Envoyer au patient** (Brevo, SMS et/ou e-mail) : le serveur vérifie que la version signée correspond au contenu enregistré, lit les coordonnées vérifiées du séjour (jamais celles de la requête) et envoie un message sans donnée de santé : nom de l’établissement + lien personnel `/ordonnance.html#acces=…`.
- **Espace patient** : date de naissance demandée avant tout affichage ; 5 erreurs ferment le lien ; lien valable jusqu’à 7 jours après l’intervention (48 h minimum, 30 jours maximum) ; un nouvel envoi ferme le lien précédent ; le médecin peut le désactiver. Le patient peut imprimer ou enregistrer en PDF.
- **Traçabilité** : envois (destinataire masqué), consultations par le patient et erreurs de date de naissance dans le journal d’accès ; l’écran affiche « Consultée le … ».

## Technique
- Règles pures partagées : `dist/prescriptions-preop-regles.js` (tests `tests/prescriptions-preop.test.cjs`).
- Écran : `dist/prescriptions-preop.js`, `dist/prescriptions-preop.css` ; rubrique de séjour `prescriptionsPreop` (écriture : anesthésiste, chirurgien).
- Serveur : `worker/prescriptions.mjs`, table `prescription_links` (migration 005, lien stocké haché, contenu signé figé), tests `tests/clever/prescriptions.test.mjs`.
- Page patient : `dist/ordonnance.html`, `dist/ordonnance-patient.js`.

## À faire relire / limites
- Listes d’examens, délais de jeûne et textes patients : valeurs par défaut à valider par l’équipe d’anesthésie.
- La validation électronique n’est pas une signature électronique qualifiée (e-prescription Ségur / Pro Santé Connect) : pour le laboratoire, l’ordonnance imprimée signée reste la référence.
- Nom de l’établissement dans les messages : variable `ETABLISSEMENT_NOM`. En recette, envoi limité à `MESSAGING_ALLOWED_RECIPIENTS`.

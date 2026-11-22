> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

# Invitation depuis une photo Doctolib

Le menu « Questionnaire · photo Doctolib » lit une image localement, propose les champs détectés et exige une relecture avant de préparer une invitation. L’image et le texte OCR restent en mémoire du navigateur ; seuls les champs confirmés sont enregistrés dans le séjour.

OCR : Tesseract.js 6.0.1, moteur tesseract.js-core 6.0.0 LSTM sans SIMD pour la compatibilité, modèle français 4.0.0_fast. Les ressources et licences sont servies par le site ; aucune photo n’est transmise à un service OCR tiers.

Les invitations contiennent 256 bits aléatoires dans un fragment d’URL. Seule leur empreinte SHA-256 est stockée. Validité 48 heures, remplacement révocatoire et consommation atomique à usage unique. Le questionnaire ne peut écrire que dans le séjour associé ; ses réponses sont filtrées et son identité confrontée aux coordonnées relues.

Le bouton de courriel ou SMS ouvre un brouillon sur l’appareil ; le site ne déclare aucun message envoyé. Aucun fournisseur de messagerie n’est configuré. L’accès owner-private existant est conservé : un patient extérieur ne peut pas accéder au prototype. L’utilisation réelle exige un environnement et un accès patient adaptés, puis la configuration de la messagerie.

Validation : lecture OCR d’une image française fictive avec les cinq champs attendus ; tests de parsing, contrôles de périmètre, coordonnées confirmées, correspondance d’identité, jeton remplacé/expiré et soumission unique avec retour au bon séjour. La vérification visuelle dans un navigateur n’a pas été réalisée.

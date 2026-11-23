> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

# Invitation depuis une photo Doctolib

Le menu « Questionnaire · photo Doctolib » lit une image localement, propose les champs détectés et exige une relecture avant de préparer une invitation. L’image et le texte OCR restent en mémoire du navigateur ; seuls les champs confirmés sont enregistrés dans le séjour.

OCR : Tesseract.js 6.0.1, moteur tesseract.js-core 6.0.0 LSTM sans SIMD pour la compatibilité, modèle français 4.0.0_fast. Les ressources et licences sont servies par le site ; aucune photo n’est transmise à un service OCR tiers.

Les invitations contiennent 256 bits aléatoires dans un fragment d’URL. Seule leur empreinte SHA-256 est stockée. Validité 48 heures, remplacement révocatoire et consommation atomique à usage unique. Le questionnaire ne peut écrire que dans le séjour associé ; ses réponses sont filtrées et son identité confrontée aux coordonnées relues.

## Envoi par SMS et e-mail (Brevo)

Quand Brevo est configuré (voir `clevercloud/environment.example`), l’écran affiche « Envoyer par SMS », « Envoyer par e-mail » et « Envoyer les deux » après la préparation du lien. Sinon, les anciens boutons de brouillon (mailto/sms) restent affichés.

- Route serveur : `POST /api/workspace/questionnaire/send` `{stay, token, channels:["sms","email"]}`. Elle exige un lien actif (non expiré, non remplacé, non utilisé) du même séjour et les mêmes habilitations que la préparation.
- Le destinataire est toujours lu dans les coordonnées vérifiées enregistrées (`stay/<id>/invitationContact`), jamais dans la requête.
- Contenu minimal : nom de l’établissement et lien à usage unique, sans nom du patient, motif, date ni information médicale. SMS de type `transactional` (`/v3/transactionalSMS/send`), e-mail via `/v3/smtp/email`.
- Traçabilité : chaque tentative (réussie ou non) est inscrite dans `professional_access_log` (action `questionnaire-envoi`) avec l’auteur, le séjour, le canal, le destinataire masqué et la référence Brevo. Ni le jeton ni les coordonnées complètes ne sont journalisés.
- Clé d’API : uniquement dans la variable d’environnement `BREVO_API_KEY`.
- Recette : les messages sont préfixés « [TEST] ». `MESSAGING_ALLOWED_RECIPIENTS` reste disponible (facultatif) pour restreindre les envois.
- Configuration : seule `BREVO_API_KEY` est requise ; l’adresse d’expédition est la première adresse validée du compte Brevo, le nom SMS est déduit de l’établissement. L’écran affiche l’état de Brevo (clé, expéditeur, crédits SMS) et les erreurs en consignes claires (`GET /api/workspace/messaging/status`).
- Un seul bouton « Envoyer le questionnaire au patient » prépare le lien et l’envoie par SMS et e-mail selon les coordonnées vérifiées.
- À faire côté Brevo avant usage réel : signer le DPA (contrat de sous-traitance RGPD), désactiver le suivi des ouvertures et des clics pour les e-mails transactionnels, authentifier le domaine d’envoi (SPF/DKIM/DMARC). Brevo conserve le contenu des messages (donc le lien, valable 48 h) dans ses journaux.

Validation : lecture OCR d’une image française fictive avec les cinq champs attendus ; tests de parsing, contrôles de périmètre, coordonnées confirmées, correspondance d’identité, jeton remplacé/expiré et soumission unique avec retour au bon séjour. La vérification visuelle dans un navigateur n’a pas été réalisée.

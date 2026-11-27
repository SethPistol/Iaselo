# Messagerie sécurisée patient ↔ équipe

Écran : **Télésuivi des patients › Messages des patients** (anesthésistes, chirurgiens, infirmières).

## Côté équipe
- Depuis le dossier de télésuivi d'un patient : bouton **Messagerie avec le patient**, puis **Ouvrir la messagerie au patient**.
- Liste des conversations : messages non lus, urgences repérées par l'assistant, conversations fermées.
- Réponses types (Bien reçu, Rappel téléphonique, Venir consulter, Continuer le traitement), modifiables avant envoi.
- Ouvrir le fil marque les messages du patient comme lus (« lu par … »). Fermer coupe l'accès du patient.

## Côté patient (`messagerie.html#acces=…`)
- Le patient reçoit un SMS, ou un e-mail à défaut, **sans aucune donnée de santé** : nom de l'établissement et lien personnel.
- La date de naissance est demandée à chaque visite. Après 5 erreurs, le lien est bloqué.
- Chaque nouvel envoi de l'équipe crée un nouveau lien valable 30 jours et révoque les précédents.
- 20 messages par jour au maximum. Page en français et en anglais.

## Assistant du patient (règles, `dist/messagerie-regles.js`)
- Repère les signes d'urgence (douleur dans la poitrine, gêne pour respirer, saignement important, malaise, signe neurologique, détresse). Le patient est invité à appeler le 15 tout de suite. Le message part quand même à l'équipe, signalé « Urgence ».
- Propose au plus 2 fiches de conseils du parcours qui correspondent à la question, en attendant la réponse.
- Ne pose aucun diagnostic et ne répond pas à la place de l'équipe. **Les mots-clés et les fiches sont à relire par l'équipe médicale.**
- Rappel affiché en permanence : la messagerie n'est pas lue la nuit ni le week-end.

## Serveur
- `worker/messagerie.mjs` : `/api/workspace/messagerie` (équipe) et `/api/messagerie/open|fil|envoyer` (patient, en-tête Origin obligatoire).
- Table `messagerie_links` (migration 025) : jeton haché (sha256), date de naissance, expiration, révocation, échecs.
- Document du séjour `messagerie`, écrit par le serveur seulement. Chaque action est tracée dans le journal des accès.

> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

# Invitation depuis une photo Doctolib

Le menu « Questionnaire · photo Doctolib » lit une image localement, propose les champs détectés et exige une relecture avant de préparer une invitation. L’image et le texte OCR restent en mémoire du navigateur ; seuls les champs confirmés sont enregistrés dans le séjour.

OCR : Tesseract.js 6.0.1, moteur tesseract.js-core 6.0.0 LSTM sans SIMD pour la compatibilité, modèle français 4.0.0_fast. Les ressources et licences sont servies par le site ; aucune photo n’est transmise à un service OCR tiers.

Les invitations contiennent 256 bits aléatoires dans un fragment d’URL. Seule leur empreinte SHA-256 est stockée. Validité 48 heures, remplacement révocatoire et consommation atomique à usage unique. Le questionnaire ne peut écrire que dans le séjour associé ; ses réponses sont filtrées et son identité confrontée aux coordonnées relues.

## Lecture du nom et du prénom (correctif du 23/11/2026)

La lecture reconnaît désormais les principales mises en page Doctolib (données fictives de test) :

- en-tête de fiche praticien : « Mme Camille MARTIN », « Née DUPONT · 14/06/1985 (41 ans) », avec ou sans civilité, avatar à initiales ignoré ;
- formulaire « Modifier le patient » en deux colonnes : libellé au-dessus de la valeur (« Nom de naissance * », « Prénom(s) de naissance * », « Nom d'usage », « Prénom utilisé ») ;
- tableau libellé/valeur sur une ligne et écran « Informations personnelles » de l'application patient.

Règles : le nom de naissance alimente l'identité (Doctolib affiche le nom d'usage en tête et le nom de naissance après « née ») ; le nom d'usage lu est seulement signalé à côté du formulaire. Le premier prénom de naissance est le premier élément de la liste des prénoms. Noms mis en capitales, accents, traits d'union et apostrophes conservés. Les noms précédés de « Dr » (médecin traitant, praticien du rendez-vous) sont ignorés. Si le nom ou le prénom n'est pas reconnu, un avertissement demande de les recopier : la relecture et la case de vérification restent obligatoires.

OCR : petites captures agrandies (×2 à ×2,5), niveaux de gris, fond sombre inversé, espaces conservés pour retrouver les colonnes (`InvitationCore.prepareCanvas`, `OCR_PARAMS`). Sur 7 captures fictives de test, le nom et le prénom étaient lus sur 1 avant le correctif et sur 7 après.

## Photos prises au téléphone (23/11/2026, après-midi)

Romain signalait des lectures encore ratées sur de vraies photos. Banc d'essai : 7 fiches fictives × 5 dégradations combinées (photo d'écran au téléphone avec moiré, reflet fort, inclinaison et perspective, basse résolution, très dégradée), plus 6 défauts isolés. Le banc complet reste hors du dépôt (images générées) ; les règles sont couvertes par `tests/invitation.test.cjs`.

Chaîne de lecture (`InvitationCore.readProfile`, tout dans le navigateur) :

1. orientation EXIF respectée, recadrage automatique sur l'écran photographié, agrandissement des petits textes ;
2. niveaux de gris, étirement du contraste, inversion des fonds sombres ;
3. redressement automatique de −15° à +15° (profil de projection des lignes) ;
4. seuil adaptatif de Sauvola dans Tesseract (`thresholding_method=2`) : résiste aux reflets et à l'éclairage inégal ;
5. jusqu'à quatre lectures (image accentuée, gris foncés par gamma, zones isolées, image redressée) ; arrêt dès que nom, prénom et naissance sont trouvés après au moins deux lectures ; fusion des valeurs par vote, le nom de naissance (« née … », libellé) l'emportant sur le nom de l'en-tête.

Analyse du texte : libellés abîmés par l'OCR reconnus (« Nom de naissar »), nom « Prénom NOM » sans civilité, date de naissance seule hors rendez-vous, valeurs d'une lettre rejetées.

Repli manuel : la liste « Texte lu » s'ouvre quand un champ manque ; chaque ligne a des boutons Nom / Prénom / Naissance qui remplissent le champ (la case de vérification est alors décochée). Si le nom ne vient que de l'en-tête de la fiche, un avertissement rappelle qu'il peut s'agir du nom d'usage.

## Fiche « Coordonnées » de Doctolib (photo réelle de Romain, 23/11/2026)

Une vraie photo (non conservée, jamais versée au dépôt) a montré la mise en page réelle : libellés à gauche, valeurs dans des champs à droite, libellés repliés sur deux lignes (« 1er prénom de / naissance »), « Nom de naissance » souvent vide avec seulement un « Nom utilisé », date de naissance chevauchée par l'âge (« 02/08/198(44 ans) »). Une fiche fictive reproduisant cette mise en page sert de banc d'essai.

- Les rangées sont reconstituées à partir de la position des lignes (Tesseract lit sinon la colonne des libellés puis celle des valeurs).
- Nom de naissance vide : le « Nom utilisé » est repris et un avertissement demande de vérifier le nom de naissance sur une pièce d'identité.
- Date : l'âge affiché contrôle l'année. Une année qui ne correspond pas à l'âge est rejetée ; une année tronquée n'est reconstituée que si une seule valeur concorde avec l'âge. Sinon le champ reste vide avec l'avertissement « Date de naissance illisible ».

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

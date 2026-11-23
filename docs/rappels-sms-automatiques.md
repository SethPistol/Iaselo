# Rappels SMS automatiques

Le serveur IASELO repasse toutes les 10 minutes et envoie entre 10 h et 20 h (heure de Paris). Rien à régler sur Clever Cloud : le planificateur démarre avec le serveur (`server/index.mjs`, `worker/rappels-auto.mjs`).

| Rappel | Quand | Condition | Contenu |
|---|---|---|---|
| Consentement J-2 | 2 jours avant l'intervention | consentement envoyé mais pas encore revenu signé | SMS (et e-mail si connu) « rappel, un document est à signer avant votre intervention » + nouveau lien personnel |
| Consentement J-1 | la veille | idem | idem |
| Suivi J+1 | le lendemain de l'intervention | chaque patient opéré (date d'intervention de la consultation ou de l'annonce chirurgicale) | « Nous espérons que tout va bien depuis votre retour. En cas de douleur importante, de fièvre, de saignement ou de gêne pour respirer, appelez la clinique. En cas d'urgence, appelez le 15. » |

- **Jamais deux fois** : table `rappels_auto` (un envoi par séjour, type de rappel et date d'intervention). Si la date change, les rappels repartent pour la nouvelle date.
- **Aucun rappel** si le consentement est signé, reçu sur papier ou déposé en attente de vérification.
- **Alerte au dossier** (pastille rouge, ligne dans l'onglet) : consentement jamais envoyé, pas de numéro de portable vérifié, SMS non configuré ou refusé par Brevo (crédits épuisés). Sans numéro, IASELO réessaie à chaque passage du jour : dès que le numéro est enregistré, le SMS part.
- **Traçabilité** : journal d'accès (acteur `iaselo-automatique`, numéro masqué) et `espacePatient.rappelsAuto` dans le dossier.
- Le J+1 remplace l'appel systématique : le formulaire d'appel reste disponible pour tracer un échange si le patient rappelle.
- Tests : `tests/clever/rappels-auto.test.mjs`.

## Questionnaire du lendemain et alerte au médecin
- Le SMS J+1 contient un lien personnel (valable 3 jours, stocké haché, date de naissance demandée, 5 erreurs ferment le lien) vers 8 questions (`dist/suivi-j1.html`). Sans date de naissance connue, le SMS part sans lien.
- **Alerte** (seuils par défaut demandés par l'équipe médicale, à relire) : « Oui » à nausées/vomissements, saignement, difficulté à uriner, essoufflement/douleur thoracique, mollet ; « Non » à « en sécurité à la maison » ; douleur > 4/10 ; température < 36 °C ou > 38 °C (`alertesJ1`, `dist/veille-regles.js`).
- **Notification dans IASELO** : encadré rouge en tête de « Ma journée » (patient, réponses en cause, anesthésiste et chirurgien du séjour), tour de contrôle, pastille « Alerte J+1 » du dossier ; actualisé chaque minute (`GET /api/workspace/suivi-j1/alertes`). Le médecin la marque « traitée » avec l'action réalisée (journal).
- Aucun envoi externe au médecin pour l'instant (pas de donnée de santé hors MSSanté).

## Convocation selon le programme de bloc
- Heure d'arrivée = heure de passage au bloc (premier passage du séjour dans le programme, réservations annulées ou terminées exclues) moins le décalage réglé (60 min par défaut).
- Envoi la veille à partir de l'heure réglée (16 h par défaut) jusqu'à 21 h ; programme fait trop tard : le jour même dès 6 h, si l'heure d'arrivée n'est pas passée.
- Si l'heure ou la date change après l'envoi : SMS « MODIFICATION de votre convocation ». Jamais deux fois le même message.
- Message : « [Établissement] : vous êtes attendu(e) le [jour] à [heure] à [lieu]. Restez à jeun selon les consignes remises en consultation. En cas d'empêchement, appelez la clinique. »
- Réglages dans l'application : Bloc & lits › Convocations SMS (décalage, heure d'envoi, lieu ; anesthésiste, secrétariat ou administrateur), avec la liste des patients du jour choisi et l'état de chaque SMS. Sans numéro vérifié : alerte au dossier. Code `worker/convocations.mjs`, test `tests/clever/convocations.test.mjs`.

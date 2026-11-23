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

# Accueil téléphonique par IA (27/11/2026)

Point de la 3e veille. **Le connecteur fonctionne en simulation.** L'opérateur téléphonique sera branché plus tard, sans modifier IASELO.

## Ce que fait l'assistant
- Au décroché, il se présente et rappelle qu'en cas d'urgence vitale il faut raccrocher et appeler le 15.
- Il reconnaît **l'urgence** (douleur dans la poitrine, gêne respiratoire, saignement important, malaise, signe neurologique, détresse). Il dit alors d'appeler le 15 et transfère au poste de garde.
- Il reconnaît aussi **sept motifs d'appel**, chacun envoyé au service qui rappelle :

| Motif | Service qui rappelle |
|---|---|
| Annulation ou report d'intervention | Secrétariat du bloc |
| Rendez-vous | Secrétariat médical |
| Question sur la préparation | Infirmière du service |
| Question après l'opération | Infirmière du service |
| Documents | Secrétariat médical |
| Facturation | Facturation |
| Visites et accès | Accueil |

- Il **ne donne aucune information personnelle** (date, heure, consigne, résultat), parce que l'identité de l'appelant n'est pas vérifiée au téléphone. Il renvoie vers le SMS de convocation, l'espace patient ou un rappel.
- En dehors des heures du secrétariat (lundi au vendredi, 8 h à 18 h, heure de Paris), il annonce un rappel le jour ouvré suivant.
- Il ne pose **aucun diagnostic**. Les règles sont dans `dist/accueil-telephonique-regles.js` et doivent être relues par l'équipe. La détection d'urgence est celle de la messagerie patient.

## Écran « Accueil téléphonique »
L'écran est accessible au secrétariat, à l'administration et à l'administrateur.
- Il liste les appels des 7 derniers jours, avec les filtres À rappeler, Urgences, Traités et Tous. Les urgences apparaissent en premier.
- Le numéro est masqué par défaut. Le bouton « Afficher le numéro » le montre pour rappeler, et cette lecture est tracée.
- Le bouton « Marquer traité » permet d'ajouter une note.
- Un simulateur permet de saisir ce que dit l'appelant, avec un numéro fictif, et des exemples sont fournis.

## Brancher l'opérateur
L'opérateur peut être un agent vocal hébergé HDS, par exemple sur la plateforme de l'opérateur téléphonique de la clinique.
1. Générez un secret d'au moins 32 caractères, puis : `clever env set TELEPHONIE_SECRET '…'`. L'écran affiche alors « Opérateur téléphonique branché ».
2. L'agent envoie chaque tour de parole transcrit à `POST /api/telephonie/appel` avec :
   - le corps JSON `{"appel":"<identifiant de l'appel chez l'opérateur>","numero":"+336…","transcription":"…"}` ;
   - l'en-tête `X-Iaselo-Horodatage`, en secondes Unix (tolérance de 5 minutes) ;
   - l'en-tête `X-Iaselo-Signature`, qui vaut `hex(HMAC-SHA256(horodatage + "." + corps, TELEPHONIE_SECRET))`.
3. La réponse est `{"dire":"…","transfert":true|false,"orientation":"garde|secretariat|…","id":"…"}`. L'agent dit `dire` et transfère l'appel au poste de garde si `transfert` vaut true.
   - Si un même `appel` est renvoyé, la réponse est la même (pas de doublon).
   - Une transcription vide renvoie le message d'accueil.

Sans `TELEPHONIE_SECRET`, la route n'existe pas (404).

## RGPD et HDS
- La transcription et le numéro sont conservés dans la base de l'installation (HDS). Ils ne sont jamais renvoyés en clair dans les listes.
- L'opérateur choisi doit être hébergeur HDS pour la voix et la transcription, avec un contrat de sous-traitance (article 28 du RGPD).
- Les appelants doivent être informés par le message d'accueil, à compléter avec la mention d'information RGPD validée par le DPO.
- Durée de conservation à décider par l'établissement. Proposition : 3 mois.

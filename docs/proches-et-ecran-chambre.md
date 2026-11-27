# Information des proches et écran en chambre (4e veille, lot C)

Accès : bouton **Proches · écran en chambre** sur chaque patient de la **Surveillance des lits** et des **Sorties du jour**.

## Informer les proches par SMS

- **Accord du patient obligatoire.** Il est recueilli par un soignant ou le secrétariat (nom et heure enregistrés) et peut être retiré à tout moment (« Le patient retire son accord » : plus aucun SMS).
- Un ou deux proches (prénom + portable 06/07). Le patient choisit comment il est nommé : son prénom, « votre proche » ou un autre mot.
- **Aucune donnée médicale** : le SMS ne contient que l'établissement, l'étape et l'heure. Exemple : « Clinique du Trocadéro · Nouvelles de votre proche : arrivée en salle de réveil à 11 h 20. Message automatique, ne pas répondre. »
- Étapes automatiques (envoyées par le serveur dans les 10 minutes, entre 7 h et 21 h, une seule fois par jour) :
  - entrée au bloc opératoire (étape du séjour « Intervention ») ;
  - arrivée en salle de réveil (« SSPI ») ;
  - retour en chambre (« Hospitalisation », seulement après le bloc ou la salle de réveil du jour) ;
  - sortie prévue, avec l'heure (date du jour, heure de départ renseignée et sortie autorisée).
- Envoi manuel possible pour chaque étape, plus « étape plus longue que prévu ».
- Chaque accord, retrait et envoi est tracé dans le journal d'accès. Les portables sont masqués à l'écran.

## Écran en chambre (tablette)

- Un soignant active l'écran : un lien personnel (stocké haché, un seul actif par séjour, 10 jours au plus) s'ouvre sur la tablette de la chambre. La date de naissance du patient est demandée, et 5 erreurs bloquent le lien. L'écran s'arrête à la sortie.
- Le patient voit :
  - sa date et son heure de sortie ;
  - ce qui reste à préparer (accord du médecin, ordonnance, courrier, consignes, retour), repris du pilotage des sorties ;
  - ses consignes de retour à domicile, une fois validées.
- Il peut envoyer des **demandes non urgentes** : besoin d'aide, douleur de 0 à 10, soif, toilettes, autre. Le bandeau rappelle d'utiliser la **sonnette** en cas d'urgence.
- Les demandes apparaissent en tête de la Surveillance des lits. Une douleur ≥ 7 est classée urgente, ≥ 4 ou « besoin d'aide » à voir. Le bouton « Traité » les retire ; le patient voit alors « vue par l'équipe ».
- L'écran ne montre aucun nom de soignant, ni diagnostic, ni nom de famille.

## Technique

- Règles : `dist/proches-chambre-regles.js` (tests : `tests/proches-chambre.test.cjs`).
- Serveur : `worker/proches-chambre.mjs`, avec la migration `028_proches_chambre.sql` (tables `proches_info`, `chambre_liens` et `chambre_demandes`). Les envois sont dans `rappels_auto` (`proches-<étape>`). Test : `tests/clever/proches-chambre.test.mjs`.
- Écrans : `dist/proches-chambre.js` (soignants), `dist/chambre.html` + `chambre-page.js` (tablette).

**À valider** : le texte des SMS, les horaires d'envoi et la mention dans le livret d'accueil et la politique de confidentialité (information des proches avec l'accord du patient).

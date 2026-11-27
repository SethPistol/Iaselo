# Objets connectés du télésuivi (4e veille, lot G)

**Statut : SIMULATION** tant qu'aucune passerelle de fournisseur (hébergée HDS) n'est branchée. Les seuils sont des valeurs par défaut **à faire valider par les médecins**.

## Principe

1. À la sortie, l'équipe prête au patient un ou plusieurs appareils : tensiomètre, oxymètre de pouls, thermomètre, balance, podomètre. Chaque appareil est rattaché au séjour par son numéro de série (un numéro ne peut être prêté qu'à un seul patient à la fois).
2. Les mesures arrivent par la passerelle du fournisseur et sont contrôlées par des seuils.
3. Les alertes remontent dans le **Télésuivi des patients** (bloc « Objets connectés à domicile », sous les appels du lendemain). Un soignant clique « Pris en charge » : la prise en charge est tracée.
4. Ce n'est **pas** une surveillance en temps réel : le patient garde la consigne d'appeler le 15 en cas d'urgence (rappelé à l'écran).

## Seuils par défaut (à valider)

| Mesure | Attention | Urgent |
|---|---|---|
| SpO₂ | < 94 % | < 90 % |
| Température | ≥ 38,5 °C | ≥ 39,5 °C |
| Pression systolique | — | < 90 ou > 180 mmHg |
| Fréquence cardiaque | — | > 120 ou < 45 /min |
| Poids | + 2 kg en 3 jours | — |
| Pas | < 500 par jour à partir de J+3 | — |

## Écran

- Liste des patients équipés, avec leurs alertes et la date de la dernière mesure.
- « Voir les mesures » : alertes ouvertes, tableau des 7 derniers jours (valeurs hors seuil en couleur), appareils prêtés (bouton « Rendu »), prêt d'un nouvel appareil.
- En simulation : « Générer des mesures » avec un scénario (récupération normale, désaturation, fièvre, prise de poids).

## Passerelle du fournisseur (à brancher)

`POST /api/objets/mesures` `{numeroSerie, mesures:[{type, valeur, at}]}`, signée HMAC-SHA256 comme la téléphonie (en-têtes `X-Iaselo-Horodatage` et `X-Iaselo-Signature`, 5 minutes de tolérance). Secret : variable `OBJETS_SECRET` (32 caractères au moins) ; sans secret, la route répond 404. Un appareil rendu ou inconnu est refusé. Chaque appel est tracé dans le journal des accès.

## Données et RGPD

- Tables `objets_appairages`, `objets_mesures`, `objets_alertes_vues` (migration 030), dans la base HDS.
- Aucun SMS ni e-mail ne contient de mesure.
- Accès : médecins et infirmier(ère)s qui voient le séjour.
- À faire avant la mise en service : choisir un fournisseur hébergé HDS, compléter le registre des traitements et l'information du patient (prêt d'appareil, durée de conservation des mesures).

## Technique

Règles pures : `dist/objets-connectes-regles.js`. Serveur : `worker/objets-connectes.mjs`. Écran : `dist/objets-connectes.js`. Tests : `tests/objets-connectes.test.cjs`, `tests/clever/objets-connectes.test.mjs`.

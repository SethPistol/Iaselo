# Pilotage des sorties (4e veille, lot B)

Écran **Sorties du jour** (vue `sorties`) : menu du chirurgien, de l'infirmier(ère) d'étage et du secrétariat (lecture seule) ; rappel « Sorties du jour : n prête(s) · n bloquée(s) » dans la Tour de contrôle pour tous les profils (dont l'anesthésiste, dont le menu est complet).

## Ce qui est affiché

Pour chaque patient qui sort **aujourd'hui**, **demain** ou dont la sortie est **en retard** :

| Étape | Prête quand |
|---|---|
| Date de sortie prévue | `sortiePlus.sortiePrevue` renseignée (ambulatoire présent : jour même) |
| Aptitude à la sortie | Chung signé (ambulatoire), médecin qui valide, ou sortie autorisée sur protocole |
| Ordonnance de sortie | `discharge.ordinance` |
| Lettre de liaison | `discharge.liaison.document` |
| Consignes de sortie | `discharge.instructions` ou consignes validées |
| Transport / accompagnant | mode + heure (sauf proche) ; accompagnant obligatoire en ambulatoire |

Une étape non prête est un bouton qui ouvre l'onglet du dossier concerné (ordonnance, lettre de liaison, consignes).

## Sortie infirmière sur protocole

1. Le médecin (anesthésiste ou chirurgien) prescrit la sortie sur protocole en choisissant les critères (constantes NEWS2 ≤ 2, douleur ≤ 3, alimentation, miction, pansement, lever, consignes comprises), avec une consigne facultative.
2. L'infirmière constate chaque critère (« Rempli » / « Non »). Le dernier relevé de constantes propose un avis (« semble rempli ») qui n'est jamais coché à sa place.
3. « Autoriser la sortie » n'aboutit que si tous les critères sont remplis ; sinon le message demande d'appeler le médecin.
4. Chaque action est horodatée, nominative et tracée dans le journal du séjour. Une nouvelle prescription remet les constats à zéro.

Règles pures : `dist/sorties-regles.js` (tests : `tests/sorties.test.cjs`). Écran : `dist/sorties.js`. Données : module `sortiePlus` (protocole, protocoleConstat, sortieAutorisee, aptitudeMedicale, transport).

**À faire valider** par les médecins de l'établissement : la liste des critères par défaut et leur seuil (inspirés des recommandations HAS sur la RAAC et la chirurgie ambulatoire).

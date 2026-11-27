# Surveillance des lits et saisie vocale des constantes (4e veille, lot A, 27/11/2026)

**Écran « Surveillance des lits »**
- **Accès** : menu des infirmier(ère)s et des chirurgiens. Les autres profils passent par un bandeau dans la Tour de contrôle.
- **Patients concernés** : tous les patients présents (bloc, SSPI, service) que l'utilisateur peut voir.
- **Affichage** : une file d'alertes, avec les critiques en premier.
- **Prise en charge** : le bouton « Pris en charge » enregistre une note facultative, le nom et l'heure.
  - Ces informations vont dans `soinsPlus.alertesVues` et dans l'historique du dossier.
  - Une nouvelle mesure crée une nouvelle alerte.
- **Mise à jour** : chaque minute.

| Alerte | Règle | Référence |
|---|---|---|
| NEWS2 | ≥ 7 critique ; 5-6 ou un paramètre à 3 : à voir | Royal College of Physicians 2017 |
| Sepsis possible | qSOFA ≥ 2 (FR ≥ 22, PAS ≤ 100, conscience altérée) : critique ; qSOFA 1 avec fièvre ≥ 38,3 °C ou < 36 °C : à voir | Sepsis-3 (Singer, JAMA 2016) |
| Douleur | EN ≥ 4 à voir, ≥ 7 critique | Protocole douleur de l'établissement |
| Retard de surveillance | SSPI : plus de 30 min sans relevé (critique) ; service : plus de 8 h (à voir) ; aucun relevé | À ajuster au protocole |
| Escarre | Braden ≤ 12 | Braden 1987 |
| Chute | Morse ≥ 45 | Morse 1989 |
| Dénutrition | IMC ≤ 18,5, ou < 22 à partir de 70 ans | HAS 2019 et 2021 |
| Échelles manquantes | Braden ou Morse non évalués en hospitalisation | — |

**Les seuils sont à faire valider par les médecins de l'établissement.** Règles : `dist/surveillance-centrale-regles.js`. Tests : `tests/surveillance-centrale.test.cjs`.

**Saisie vocale des constantes** (bouton « Dicter les constantes »)
1. L'infirmière dicte ou tape le texte (« tension 125 sur 80, pouls 88, saturation 96, température 37,8, douleur 3 »).
   - L'audio est transcrit sur le poste, avec le même module que la dictée du compte rendu opératoire. Il n'est pas conservé.
2. IASELO propose les valeurs reconnues : PA, FC, SpO₂, FR, température, douleur, glycémie, oxygène, conscience, pansement, NVPO, miction.
3. Chaque valeur est cochée et corrigeable avant l'enregistrement. Rien n'est inventé : un mot non reconnu n'est pas proposé.
4. Le relevé enregistré porte la mention « Saisie vocale » et le texte d'origine. Il alimente la surveillance postopératoire, NEWS2 et les alertes.

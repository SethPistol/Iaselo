# Surveillance postopératoire en graphe

Onglet « Dossier infirmier & surveillance » → « Surveillance postopératoire » (SSPI et hospitalisation).

## Ce qui est tracé

- **Courbes alignées sur le même axe horaire** : pression artérielle (systolique ▼ / diastolique ▲ reliées), fréquence cardiaque, SpO₂, fréquence respiratoire, température, douleur EN au repos (barres) et à la mobilisation (cercles), diurèse, drains, bladder scan, glycémie capillaire (ces quatre derniers seulement s'ils sont renseignés).
- **Grille des critères cotés** sous les courbes : conscience (AVPU), sédation (EDS 0 à 3), oxygène (air / débit), NVPO (0 à 2), pansement, miction, bloc moteur (Bromage), membre opéré (surveillance vasculo-nerveuse), NEWS2 calculé.
- Fenêtre 6 h / 12 h / 24 h / 48 h / tout, survol (ou toucher) d'un relevé pour le détail, **vue tableau** équivalente (accessibilité, impression).
- Bandes grisées = valeurs attendues ; points rouges = appel médical, orange = à surveiller ; repères ▲ au-dessus de l'axe sur les relevés en alerte.
- La saisie affiche, avant l'enregistrement, les alertes que le relevé déclenchera.

Code : `dist/surveillance-postop-regles.js` (règles pures, `tests/surveillance-postop.test.cjs`), `dist/surveillance-postop.js`, `dist/surveillance-postop.css`. Les relevés restent dans la rubrique `postopVitals` (ajout seul, droits inchangés) ; anciens relevés compatibles.

## Seuils par défaut — à relire par l'équipe d'anesthésie / le CLUD

Alerte si valeur < bas ou ≥ haut.

| Paramètre | Appel médical | À surveiller |
|---|---|---|
| PAS | < 90 ou ≥ 180 mmHg | < 100 ou ≥ 160 |
| PAD | — | ≥ 110 |
| FC | < 45 ou ≥ 130 /min | < 50 ou ≥ 110 |
| SpO₂ | < 90 % | < 94 % |
| FR | < 10 ou ≥ 30 /min | < 12 ou ≥ 25 |
| Température | < 35 ou ≥ 39,5 °C | < 36 ou ≥ 38,5 |
| EN repos | ≥ 7 | ≥ 4 |
| EN mobilisation | ≥ 8 | ≥ 5 |
| Bladder scan | ≥ 800 mL | ≥ 500 mL |
| Drains (depuis le relevé précédent) | ≥ 200 mL | ≥ 100 mL |
| Glycémie | < 0,6 ou ≥ 3 g/L | < 0,7 ou ≥ 2,5 |
| Conscience | V, P, U ou confusion nouvelle | — |
| Sédation | 3 | 2 |
| Sédation ≥ 2 et FR < 10 | suspicion de surdosage morphinique | — |
| Pansement | saturé / saignement actif | — |
| Membre opéré | anomalie | — |
| Bloc moteur | Bromage qui s'aggrave | — |
| NVPO | — | vomissements |
| Oxygène | — | débit croissant ≥ 3 L/min |
| NEWS2 | ≥ 7 | ≥ 5 |

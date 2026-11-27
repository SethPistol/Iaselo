# Accessibilité (RGAA 4.1) · audit du 27/11/2026

Point n° 15 de la 3e veille. Audit de la recette avec patients fictifs :
- axe-core 4.10.2 (règles WCAG 2.0/2.1 A et AA) sur 19 écrans : connexion, hors connexion, 6 pages patient, 11 vues de l'application (Ma journée, séjours, tour de contrôle, télésuivi, bloc & lits, plannings, établissement, FHIR, dossier, consultation, trame de consultation) ;
- contrôles scriptés en plus : lien d'évitement, titre de page, titre h1, sauts de niveaux, focus visible au clavier, défilement horizontal à 320 px, zoom du texte à 200 %.

Résultat : **14 anomalies avant correction, 0 après** (axe et contrôles scriptés). Un audit RGAA complet (106 critères, échantillon de pages, tests avec lecteur d'écran NVDA et VoiceOver) reste à faire par un auditeur avant toute déclaration de conformité. Ce document en prépare le terrain.

## Corrections faites

| Thème RGAA | Anomalie | Correction |
|---|---|---|
| 1 Images | Pastilles « temps signés » du tour de contrôle : `aria-label` sur un `span` sans rôle | `role="img"` (veille.js) |
| 3 Couleurs | Contrastes < 4,5:1 : étiquette « Repos » des plannings (3,99), identifiant du séjour (4,0), sous-navigation du dossier (4,42) | Couleurs foncées (plannings-infirmiers.css, iaselo-couleurs.css) |
| 8 Éléments obligatoires | Titre de l'onglet identique pour toutes les vues | Titre = vue affichée + IASELO + établissement (accessibilite.js) |
| 9 Structure | Pas de h1 visible sur Ma journée ; sauts h1 → h3 (séjours, tour de contrôle, télésuivi, bloc & lits) | h1 masqué visuellement quand l'en-tête est caché ; niveaux restitués sans saut par `aria-level`, sans changer l'aspect |
| 9 Structure | Liste de définitions du récapitulatif de la consultation invalide quand elle est vide | `dt` masqué + `dd` |
| 10 Présentation | Défilement horizontal à 320 px sur les pages patient (en-tête) | En-tête qui passe à la ligne |
| 10 Présentation | Pas de focus visible sur la page hors connexion | `:focus-visible` |
| 11 Formulaires | Mois e-Satis sans étiquette | `aria-label="Mois des sorties"` |
| 12 Navigation | Aucun lien d'évitement | « Aller au contenu » sur l'application et les pages patient, « Aller à la connexion » sur la connexion |

Le module commun `dist/accessibilite.js` (+ `.css`) est chargé par l'application, les 11 pages patient et la page hors connexion. Il ne fait aucun appel réseau et ne stocke rien. Test : `tests/accessibilite.test.mjs`.

## État par thème

| # | Thème | État |
|---|---|---|
| 1 | Images | Conforme sur l'échantillon (logos avec alternative, icônes décoratives `aria-hidden`). |
| 2 | Cadres | Trame de consultation en iframe avec `title`. |
| 3 | Couleurs | Contrastes corrigés ; l'information n'est pas portée par la seule couleur (niveaux d'alerte avec libellé). À revérifier en thème sombre par l'auditeur. |
| 4 | Multimédia | Pas de vidéo. Dictée et mémos vocaux : la transcription texte tient lieu d'alternative. |
| 5 | Tableaux | Tableaux de données avec en-têtes `th`. À contrôler : tableaux du bloc à double entrée (`scope`). |
| 6 | Liens | Liens explicites sur l'échantillon. |
| 7 | Scripts | Boutons natifs ; zones d'état (`role="status"`, `aria-live`) présentes. À contrôler : glisser-déposer du planning du bloc (alternative clavier à documenter). |
| 8 | Éléments obligatoires | Langue `fr` (et `en` en version anglaise), titres de page pertinents. |
| 9 | Structure | h1 unique et hiérarchie sans saut. |
| 10 | Présentation | Pas de défilement horizontal à 320 px ni au zoom 200 % ; focus visible. |
| 11 | Formulaires | Étiquettes présentes ; `autocomplete` sur la connexion. À contrôler : regroupements `fieldset` de la trame de consultation. |
| 12 | Navigation | Lien d'évitement, menu cohérent, Ctrl K pour la recherche. |
| 13 | Consultation | Verrouillage de session annoncé ; documents PDF générés : balisage à vérifier (jsPDF ne produit pas de PDF balisé). |

## Projet de déclaration d'accessibilité

> L'éditeur d'IASELO s'engage à rendre ses services numériques accessibles conformément à l'article 47 de la loi n° 2005-102 du 11 février 2005. **État de conformité :** IASELO est *partiellement conforme* au RGAA 4.1 (taux à établir par l'audit externe). **Contenus non accessibles :** PDF générés non balisés ; glisser-déposer du planning du bloc sans alternative documentée. **Retour d'information et contact :** formulaire ou adresse à préciser par l'éditeur. **Voies de recours :** Défenseur des droits (formulaire en ligne, délégué de votre région, ou courrier libre affranchi : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07).

À publier (page « Accessibilité » en pied des pages patient) une fois l'audit externe fait et le taux connu.

## Plan pluriannuel (proposition)

- **2027 T1** : audit RGAA externe (échantillon de 10 à 15 pages, dont les pages patient), tests NVDA, JAWS et VoiceOver ; publication de la déclaration.
- **2027 T2** : PDF balisés pour les documents remis au patient (consentement, ordonnance, lettre de liaison) ; alternative clavier au glisser-déposer du bloc.
- **2027 T3** : contrôle automatique axe dans l'intégration continue (échec si nouvelle anomalie).
- **Chaque version** : contre-audit axe des écrans modifiés (scripts de recette).

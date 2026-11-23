# Consultation d'anesthésie sur le modèle « pré-anesthésique simplifiée »

Demandé par Romain le 23/11/2026 : la consultation d'IASELO reprend son modèle
(13 rubriques, scores STOP-BANG / Lee / Apfel / HEMSTOP / estomac plein, points de vigilance,
PDF figé 1 page, ordonnances de sortie, devis), et les réponses du questionnaire patient
s'insèrent directement dans les champs.

## Fichiers
- `dist/consultation-modele.html` : le modèle, intégré tel quel dans un cadre de même origine
  (jsPDF servi localement depuis `dist/vendor/`, page réservée aux professionnels connectés).
  Le pont `window.CPA` (charger, état, marquer, lecture seule, thème) est ajouté en fin de script.
- `dist/consultation-modele-regles.js` : règles pures (testées) — champs du modèle, champs obligatoires,
  questionnaire → champs, fusion sans écrasement, ancienne trame ↔ modèle.
- `dist/consultation-modele.js` : page parente (enregistrement dans `stay.consult.cpa`, insertion du questionnaire, bandeau).

## Règles
- Les valeurs sont enregistrées dans `consult.cpa` ; `consult.cpaMarques` garde les champs « Patient ».
- À la première ouverture, l'ancienne trame est reprise dans le modèle et archivée telle quelle (`consult.ancienneTrame`).
- Le questionnaire est inséré une fois, à l'ouverture par un anesthésiste, consultation non validée :
  champ vide → rempli ; case → ajoutée ; texte → complété ; valeur déjà saisie → conservée.
  ASA, avis, technique, VAS, antibioprophylaxie, jeûne, information et consentement ne sont jamais remplis par le patient.
  L'insertion peut être annulée. La validation de la consultation vaut relecture du questionnaire.
- Les champs de l'ancienne trame (`consult.ext`, `asa`, `allergies`…) sont recalculés à chaque saisie pour la VPA,
  la veille, la lettre de liaison et les prescriptions ; le traitement habituel alimente les traitements structurés.

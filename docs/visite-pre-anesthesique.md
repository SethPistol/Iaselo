# Visite pré-anesthésique (VPA)

Nouvelle étape du dossier **Visite pré-anesthésique**, entre « Consultation d’anesthésie » et « Peropératoire ». Elle remplace la petite carte VPA de l’onglet « Bilans guidés & VPA » (renommé « Bilans guidés & téléconsultation », qui renvoie désormais vers l’étape). Une VPA déjà saisie dans l’ancienne carte est reprise automatiquement.

Cadre : art. D.6124-91 et D.6124-92 du CSP. La consultation a lieu plusieurs jours avant une intervention programmée ; elle ne remplace pas la VPA, faite par un médecin anesthésiste-réanimateur dans les heures précédant l’intervention.

## Ce que voit l’anesthésiste en ouvrant le dossier
- **Heure de l’intervention** et temps restant.
- **Rappel de la consultation** : intervention et côté, ASA, allergies (en rouge si connues), technique prévue, voies aériennes, plan antithrombotique, diabète, points majeurs pour le bloc, réserves, et le champ « À vérifier à la visite préanesthésique » saisi en consultation.
- **Points d’attention**, recalculés à chaque saisie (colonne de droite, ou en tête sur tablette et téléphone).

## Ce qui est vérifié
1. **Visite** : date et heure (bouton « Maintenant »), lieu, identité vérifiée avec le patient, bracelet.
2. **Évolution depuis la consultation** : fièvre ou infection récente, symptôme cardiorespiratoire, traitement nouveau ou modifié, événement intercurrent, grossesse possible (femme de 12 à 55 ans).
3. **Jeûne** : dernières prises solide et liquide clair, tabac. Calcul à l’heure prévue de l’intervention (6 h / 2 h) et, s’il n’est pas conforme, l’heure à partir de laquelle il le sera. Repères pédiatriques affichés pour un mineur.
4. **Traitements** : chaque consigne datée de la consultation (anticoagulants, antiagrégants, antidiabétiques, IEC…) est marquée Respecté / Non respecté / Non vérifié. Un arrêt non respecté est une alerte critique.
5. **Examen du jour** : PA, FC, SpO₂, température, poids, glycémie capillaire ; voies aériennes inchangées ou modifiées ; examen clinique.
6. **Résultats attendus** : examens prescrits en consultation (Prescriptions préopératoires) et examens en attente, avec valeur ; date des RAI et validité (72 h, ou 21 jours sans transfusion, grossesse ni greffe dans les 6 mois) ; βHCG si pertinent.
7. **Préparation** (recueil infirmier possible) : douche, dépilation, bijoux, prothèses, marquage du site, prémédication, accompagnant en ambulatoire.
8. **Consentement** : consentement signé reçu (espace patient) et confirmation orale de l’accord.

## Conclusion et signature (anesthésiste uniquement)
- **Apte, plan inchangé**, **Apte, plan modifié** (modification obligatoire) ou **Report / annulation** (motif obligatoire), et consignes pour le bloc et la SSPI.
- Pour poursuivre malgré une alerte critique, chaque alerte est cochée « pris en compte » et un motif est saisi ; tout est tracé dans l’historique.
- **Signer** fige la version (empreinte SHA-256, nom, RPPS, heure). « Rouvrir (nouvelle version) » demande un motif et garde les versions précédentes.
- **Imprimer** : compte rendu A4 avec le logo de l’établissement.

## Ailleurs dans le dossier
- Pastille dans le bandeau patient : « VPA à faire », « VPA en cours », « VPA signée » ou « Report décidé à la VPA » (à partir de la veille de l’intervention).
- Complétude : nouvel élément « Visite pré-anesthésique », sans objet avant la veille de l’intervention, bloquant ensuite ; un report décidé bloque l’entrée au bloc (passage outre possible avec motif, comme les autres éléments).

## Droits (contrôlés par le serveur)
Rubrique de séjour `vpa` = `{draft, signed, history}`. L’anesthésiste lit, écrit et signe. L’infirmier peut saisir le recueil mais ne peut modifier ni la conclusion, ni les alertes prises en compte, ni la signature, ni les versions. Chirurgien et autres métiers : lecture selon leurs droits habituels.

## Seuils par défaut, à relire par l’équipe d’anesthésie
Jeûne 6 h / 2 h (lait maternel 4 h) ; VPA plus de 24 h avant l’intervention : avertissement ; consultation moins de 48 h avant une intervention programmée : avertissement ; T ≥ 38 °C ; SpO₂ < 94 % ; PA ≥ 180/110 ; FC < 45 ou > 120 ; glycémie < 0,7 ou > 2,5 g/L ; RAI 72 h / 21 jours. Tous dans `dist/vpa-regles.js` (objet `SEUILS`).

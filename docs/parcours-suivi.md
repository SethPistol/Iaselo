# Télésuivi des patients : parcours de soins de J-7 à J+30

Ajouté le 27/11/2026 (manques n°4 et n°11 de la 3e veille concurrentielle).

## Ce que fait IASELO
- **Parcours** : RAAC orthopédie, RAAC chirurgie digestive, chirurgie ambulatoire, endoscopie (`dist/parcours-suivi-regles.js`, `PROGRAMMES`).
  Chaque parcours est une suite d'étapes datées par rapport au jour de l'intervention :
  - des fiches d'éducation (préparer l'intervention, la veille, la douleur, les signes d'alerte, la rééducation, l'alimentation) ;
  - des questionnaires de suivi (J+3, J+7, J+14) ;
  - les résultats rapportés par le patient (PROMs) et son expérience (PREMs) à J+30.
  Le questionnaire du lendemain (J+1) reste celui de `worker/suivi-j1.mjs`.
- **Inscription** : l'écran « Télésuivi des patients » propose un parcours pour les séjours opérés entre J-25 et J+45, selon l'intervention, le mode puis la spécialité. Le médecin ou l'infirmier(ère) confirme ou change le parcours, puis peut l'arrêter avec un motif et le reprendre.
- **Envois** : la tournée des rappels (de 10 h à 20 h, heure de Paris) envoie le lien de chaque étape le jour prévu, ou jusqu'à 2 jours après si l'envoi a été manqué.
  - Le lien part par SMS, ou par e-mail s'il n'y a pas de portable.
  - Le message ne contient aucune donnée de santé.
  - Un même lien n'est jamais envoyé deux fois automatiquement. L'équipe peut renvoyer une étape à la main.
- **Page patient** (`parcours.html`) :
  - la fiche s'ouvre sans date de naissance (contenu générique), et sa lecture est tracée ;
  - le questionnaire demande la date de naissance (5 essais) et n'accepte qu'une réponse par lien ;
  - le lien expire après 5 jours pour un questionnaire, 30 jours pour une fiche, et dès que le parcours est arrêté.
- **Alertes** : mêmes seuils que le J+1 (douleur > 4/10, fièvre > 38 °C, saignement, mollet, essoufflement…), plus la demande de rappel et la question libre du patient. L'alerte est traitée avec l'action réalisée, et c'est tracé.
- **Indicateurs** : taux de réponse, douleur, reprise des activités, état de santé et amélioration à J+30, items PREMs et score de recommandation (NPS).
- **e-Satis** : fichier CSV des patients sortis dans le mois, avec e-mail vérifié et sans opposition (case à cocher dans le dossier de télésuivi). **Avant le premier dépôt, vérifiez les colonnes avec la notice e-Satis de l'année** ; le N° FINESS vient de `INTEROP_FINESS`.

## Données et droits
- La rubrique `stay/<id>/parcoursSuivi` est écrite par le serveur seulement. Elle est lisible par les soignants du séjour.
- Les liens sont stockés hachés dans `parcours_links` (migration 023).
- L'écran et les actions sont ouverts aux médecins et infirmier(ère)s du séjour. L'export e-Satis est réservé aux médecins et à l'administrateur.
- Chaque envoi, lecture, réponse et action est inscrit au journal d'accès (`parcours-*`).

## À relire par l'équipe médicale
Le contenu des fiches, les questions et les seuils d'alerte sont des valeurs par défaut. Faites-les relire avant tout usage réel.

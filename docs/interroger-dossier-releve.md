# Interroger le dossier et relève automatique (5e veille, lot 2)

## Interroger le dossier
Bouton « Interroger le dossier » (raccourci Alt + Q) dans l'en-tête de chaque séjour, pour les soignants et les médecins (pas pour les profils administratifs).
- Question en langage courant ou question fréquente : allergies, dernier résultat de biologie reçu (hémoglobine, kaliémie, créatinine, INR…), dernières constantes, douleur ou température sur 24 h, dernière dose d'un médicament, traitements habituels, prescriptions, antécédents, antibioprophylaxie, transmissions de la nuit, sortie, poids et IMC. Sinon, recherche par mots dans tout le dossier.
- La réponse cite chaque élément avec sa rubrique et sa date, et un lien « Ouvrir » vers l'onglet concerné.
- Moteur local (`dist/dossier-question-regles.js`) : la question n'est ni envoyée ni conservée, aucune interprétation médicale. Un modèle génératif hébergé HDS pourra s'y brancher plus tard avec les mêmes sources.

## Relève infirmière automatique
- Écran **Transmission** : chaque patient a une relève rédigée automatiquement au format SBAR (Situation, Antécédents, Évaluation, Recommandations) sur les 12 dernières heures. Les points d'attention sont mis en évidence (fièvre ≥ 38,5 °C, douleur ≥ 7/10, NEWS2 ≥ 5, doses en retard ou non données, alertes ouvertes, allergies non vérifiées, aucune constante). Bouton « Relèves rédigées » pour tout déplier, « Copier », « Relire et enregistrer dans le dossier ».
- Dossier infirmier › Transmissions : « Préremplir avec la relève automatique ». L'infirmière relit, corrige, choisit le responsable et enregistre : la relève devient une transmission signée (contexte « Relève »), avec les règles habituelles du journal infirmier.
- Moteur : `dist/releve-auto-regles.js`. Seuils d'attention à faire valider par les médecins et les cadres.

Tests : `tests/dossier-question.test.cjs`.

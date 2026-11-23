# Photo des constantes (feuille d’anesthésie)

Au bloc, le bouton **Photo des constantes** (tableau de bord de la feuille d’anesthésie et rubrique Surveillance) permet de photographier l’écran du moniteur ou une impression de tendances. Les valeurs lues sont proposées, puis relues et validées une à une avant d’entrer dans la feuille.

## Ce qui se passe
1. Prise de vue (appareil photo de la tablette) ou choix d’une image. Type : détection automatique, écran du moniteur ou tendances imprimées.
2. Lecture optique **dans le navigateur** (Tesseract hébergé par IASELO, `dist/ocr/`) : la photo n’est envoyée à aucun service, ni au serveur, et n’est pas conservée.
3. Relecture : photo à côté des valeurs. Chaque valeur doit être validée (✓) ou corrigée. « Valider les valeurs sans alerte » valide d’un coup une mesure, sauf les valeurs signalées, qui se valident une par une.
4. Enregistrement : une saisie « Surveillance » par horaire, seulement avec les valeurs validées.

## Contrôles
- **Aberrante** (hors bornes plausibles, PAS ≤ PAD, PAM hors PAD–PAS) : probable erreur de lecture, correction ou confirmation explicite ; suggestion automatique pour 364 → 36,4 °C.
- **Lecture peu sûre** (confiance < 70 %) ou caractère corrigé (O→0…) : validation individuelle.
- **Hors cible** indicative : information seulement.
- **Doublon** (même minute, mêmes valeurs déjà dans la feuille) : mesure exclue par défaut.
- Gros chiffres lus sans libellé : le praticien choisit la constante ou les ignore.

## Horodatage
- Moniteur : horloge affichée à l’écran si elle est à moins de 3 h de la photo, sinon heure de la photo.
- Tendances : heure imprimée de chaque ligne, le jour de la photo (veille si l’heure est postérieure à la photo).
- L’heure reste modifiable avant enregistrement.

## Traçabilité
Chaque saisie porte `values.source` (« Photo de l’écran du moniteur · relue et validée ») et `photo` : type, empreinte SHA-256 de l’image, heure de la photo, validé par / à, et pour chaque valeur la lecture brute, la valeur retenue, son statut (validée, corrigée, saisie) et les alertes ; les valeurs lues mais non validées sont listées comme écartées. Le journal du séjour reçoit une ligne « Constantes importées depuis une photo ». La feuille affiche « Source : photo » (relevés, infobulles de la grille, cartes du tableau de bord).

## Limites
La lecture optique d’un écran photographié reste fragile (reflets, angle, polices segmentées) : c’est pourquoi aucune valeur n’est enregistrée sans validation. Les impressions de tendances se lisent nettement mieux que les écrans. Code : `dist/constantes-photo-regles.js` (règles, testées par `tests/constantes-photo.test.cjs`), `dist/constantes-photo.js`, `dist/constantes-photo.css`.

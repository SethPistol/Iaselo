# Compte rendu opératoire : dictée, mémo vocal ou document

Fichiers : `dist/cro.js` (écran), `dist/cro-regles.js` (règles pures, tests `tests/cro.test.cjs`), `dist/cro-transcription-worker.js` (transcription).

## Trois façons d'alimenter le CRO (combinables)
- **Dicter** au micro : l'audio est découpé aux pauses et transcrit au fil de la dictée.
- **Importer un enregistrement** (mémo vocal m4a, mp3, wav, webm, ogg…) : même transcription.
- **Importer un document** (.pdf, .docx, .doc, .odt, .rtf, .txt) : texte extrait sur le poste, document d'origine joint au dossier. PDF scanné → lecture optique locale (Tesseract, 12 pages au plus).

Le texte est rangé dans 10 rubriques (indication, installation et anesthésie, voie d'abord, constatations, gestes, dispositifs implantés, prélèvements, hémostase/drainage/fermeture, incidents et pertes sanguines, consignes) selon les titres dictés ou écrits ; sans titre reconnu, il va dans « Texte à classer ». Commandes vocales : « à la ligne », « point à la ligne », « nouveau paragraphe », « virgule », « deux points », « point-virgule », « ouvrez/fermez la parenthèse ».

Chaque rubrique remplie automatiquement est marquée « à relire ». La signature exige date, intervention, gestes (ou un document joint) et l'attestation de relecture. Une modification crée une nouvelle version ; les versions précédentes restent consultables (empreinte SHA-256).

## RGPD / HDS
- Transcription : Whisper « small » (ONNX quantifié q8, ≈ 250 Mo) exécuté **dans le navigateur** (transformers.js 4.3.2 + onnxruntime-web, fichiers dans `dist/vendor/transformers/`). Aucun service externe, aucun CDN.
- Le modèle vient de la source officielle Hugging Face (`Xenova/whisper-small`), téléchargé à la construction (`scripts/modele-whisper.mjs`, appelé par le build) dans `modeles/` et vérifié fichier par fichier contre des empreintes SHA-256 figées. Un fichier non conforme fait rejeter le téléchargement.
- Repli si Hugging Face est injoignable ou non conforme : copie npm `sts-whisper-small@1.0.0` (mêmes empreintes, intégrité figée dans package-lock.json). `IASELO_MODELE_SOURCE=npm` force ce repli. Le journal de construction indique la source retenue.
- Le modèle est servi par IASELO sous `/modeles/` aux seuls professionnels connectés, puis mis en cache par le navigateur.
- L'audio n'est jamais conservé ni envoyé ; seule l'empreinte d'un fichier audio importé et la durée sont tracées.

## Limites
- Premier usage sur un poste : téléchargement d'environ 250 Mo depuis IASELO.
- Vitesse : de l'ordre du temps réel sur un poste récent (la transcription suit la dictée).
- Téléphones : préférer enregistrer un mémo vocal et l'importer depuis l'ordinateur.
- Qualité : à relire systématiquement (termes rares, noms propres).

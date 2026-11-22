# Identité visuelle « Scialytique »

IASELO est le nom du logiciel ; il peut être déployé dans plusieurs établissements.

## Fichiers

| Fichier | Rôle |
|---|---|
| `dist/iaselo.css` | Couche visuelle finale : jetons (couleurs, rayons, ombres), typographie, composants, thème sombre. À modifier à la main. |
| `dist/iaselo-couleurs.css` | **Généré** par `node scripts/theme-generate.mjs` : recolore les feuilles historiques vers la palette (clair) et les inverse (sombre). Ne pas modifier à la main ; relancer le script après toute modification d'une feuille historique. |
| `dist/theme.js` | Choix clair / sombre, mémorisé par poste (`localStorage`), appliqué avant l'affichage. |
| `dist/assets/fonts/` | Geist et Geist Mono (licence SIL OFL 1.1), hébergées avec l'application : aucune requête vers Google Fonts. |
| `dist/assets/marque/` | Logos détourés, en version claire et sombre. |

## Logo de l'établissement

Le logo de l'établissement est un emplacement configurable : remplacer
`dist/assets/marque/etablissement.webp` (thème clair) et `etablissement-sombre.webp` (thème sombre),
puis le texte alternatif « Clinique du Trocadéro » dans `dist/index.html`, `dist/patient.html` et la page de connexion (`server/auth.mjs`).
Les deux logos sont teintés dans la couleur de marque (bleu pétrole en clair, quasi blanc en sombre) pour former un seul bloc.

Règle de co-marquage : dans l'espace professionnel, IASELO en tête et l'établissement dessous, dans le même bloc ;
sur la page patient et les documents, l'établissement en premier, IASELO en signature.

## Principes

- Une seule couleur d'action, le bleu pétrole du logo (`#0F4D5C`, `#7FCAD8` en sombre).
- Rouge, ambre et vert réservés aux statuts cliniques, toujours doublés d'un mot.
- Cibles tactiles de 44 px minimum ; contraste du texte ≥ 4,5:1 dans les deux thèmes.

## Aide scientifique et pages annexes

- `dist/science-couleurs.css` est généré par le même script, à partir des styles intégrés de `scientifique-v022.html` et de `science-atelier.css`. `dist/science-iaselo.css` fixe la typographie et les éléments structurants.
- Le cadre de l'aide scientifique est isolé (origine « null »). Il reçoit le thème par l'ancre de son URL (`#…&theme=dark`), et `theme.js` le met à jour quand on change de thème. Le serveur autorise les polices `/assets/fonts/` en lecture croisée pour ce cadre.
- `confidentialite.html` reprend les jetons de couleur, la police Geist et le logo IASELO.
- À l'impression, la page repasse toujours en thème clair (`beforeprint` / `afterprint`).
- Le générateur reconnaît les couleurs hexadécimales, `rgb()/rgba()`, `white` et `black`. Il ignore les ombres, qui gardent leur teinte d'origine.

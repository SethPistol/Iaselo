# Pages patient en 7 langues (4e veille, lot H)

Les 12 pages publiques destinées aux patients (questionnaire, espace patient, consentement et documents, rendez-vous, devis, paiement, préadmission, suivi J+1 et J+30, lettre de liaison, ordonnance, messagerie, écran en chambre) proposent un **choix de langue** en haut à droite :

Français · English · Español · Português · العربية (de droite à gauche) · Italiano · Deutsch

## Fonctionnement

- Le choix est mémorisé sur l'appareil du patient. À la première visite, la langue du navigateur est proposée si elle fait partie de la liste, sinon le français.
- Traduction par **dictionnaire de phrases complètes** (368 phrases par langue), y compris les dates, les rendez-vous, les montants et les phrases de l'écran en chambre (« Prévue lundi 30 novembre vers 14 h 00 », « J’ai mal (4/10) »…).
- Aucun service de traduction en ligne : rien de ce qui est affiché ne quitte l'appareil. Les paquets de langue sont des fichiers locaux (`dist/langues/<code>.js`) chargés seulement quand le patient choisit la langue.
- En arabe, la page passe en écriture de droite à gauche.
- Les données saisies par la clinique (noms, actes, consignes rédigées par l'équipe) restent en français.
- Un bandeau rappelle dans chaque langue que **les documents signés sont enregistrés en français et que la version française fait foi**.
- Le numéro d'urgence (15, ou 112) est conservé dans toutes les langues.

## Avant la mise en service

- Les traductions sont des **traductions de travail** : à faire relire par un traducteur médical (en priorité le consentement d'anesthésie et les consignes de surveillance).
- Les SMS et e-mails restent en français (ils ne contiennent aucune donnée de santé) ; une version par langue pourra suivre si la clinique enregistre la langue du patient.

## Technique

Moteur : `dist/traduction-patient.js` (anglais intégré, chargement des autres paquets, motifs pour les phrases composées, `IaseloLangue.enregistrer`). Pour ajouter une phrase : l'ajouter au dictionnaire anglais puis à chaque paquet ; le test `tests/langues-patient.test.cjs` vérifie que tous les paquets ont exactement les mêmes phrases.

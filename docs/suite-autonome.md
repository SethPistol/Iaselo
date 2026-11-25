# Suite autonome PMSI, facturation, ROC et DIM (25 novembre 2026)

Demande de Romain : faire une veille des éditeurs de logiciels PMSI et de facturation, des contrats ROC et des outils du DIM, puis proposer une suite autonome intégrée à IASELO.

## 1. Veille

### Ce que les cliniques achètent aujourd'hui

| Besoin | Ce qui existe sur le marché | Remarque |
|---|---|---|
| Codage PMSI et outils du DIM | Logiciels PMSI des grands éditeurs de dossier patient (par exemple Dedalus WebPIMS), aide au codage par intelligence artificielle (par exemple Sancare, associé à Dedalus depuis 2025) | Fonctions communes : liste de travail du DIM, contrôles de cohérence, optimisation des CMA, tableaux d'exhaustivité, production des fichiers ATIH |
| Gestion administrative et facturation (GAM) | Modules de facturation des éditeurs de dossier patient et de gestion hospitalière ; la liste à jour figure dans l'étude de marché annuelle du GIE SESAM-Vitale (catalogue 2025) | Télétransmission B2, retours NOEMIE, ADRi, ROC ; ces fonctions demandent des autorisations de l'Assurance maladie |
| Groupage et transmission à l'ATIH | Logiciels **gratuits** de l'ATIH : depuis mars 2023, les données PMSI MCO passent par **DRUIDES**, puis dépôt et validation sur e-PMSI | Aucun logiciel commercial n'est nécessaire pour cette étape |
| Tiers payant des complémentaires (ROC) | Contrat de tiers payant ROC, logiciel « ROC compatible », certificats IGC-Santé de l'ANS, opérateur de transport, lecteurs de datamatrix des attestations (70 à 200 € l'unité selon le guide ANS de mars 2025) | Le guide ANS ne fixe pas de date d'obligation pour les cliniques |

Sources : [étude de marché SESAM-Vitale 2025 (catalogue)](https://www.sesam-vitale.fr/o/porte-document-web/etude-marche-2025/common/data/catalogue.pdf), [Dedalus et Sancare, PMSI (DSIH 2025)](https://www.dedalus.com/fr/wp-content/uploads/sites/13/2025/06/DSIH-SantExpo-25-PMSI-Dedalus-et-IA-Sancare.pdf), [brochure WebPIMS 2026](https://www.dedalus.com/fr/wp-content/uploads/sites/13/2026/04/Brochure_WebPIMS_042026.pdf), [aide au codage Sancare](https://numihfrance.fr/wp-content/uploads/2025/09/Solution-daide-au-codage-SANCARE.pdf), [guide ROC en établissement (ANS, 2025)](https://esante.gouv.fr/sites/default/files/media_entity/documents/202503_Guide%20pour%20la%20mise%20en%20oeuvre%20de%20ROC%20en%20%C3%A9tablissement.pdf), [dispositif ROC](https://esante.gouv.fr/ens/offre/dispositif-roc), [transmission DRUIDES (ATIH)](https://www.atih.sante.fr/recueillir-les-donnees/guides-et-documentations/transmission-druides-mco/smr-m8-2024), [formats MCO 2018 (ATIH)](https://fhf.fr/sites/default/files/documents/Notice%20ATIH%20format%20fichiers%20MCO%2001%20mars%202018.pdf).

### Ce qui peut être autonome, et ce qui ne le peut pas

| Partie | Autonome dans IASELO ? | Pourquoi |
|---|---|---|
| Codage, contrôles du DIM, tableau de bord | **Oui** | Travail interne de la clinique |
| Fichier RSS pour le groupage | **Oui** | IASELO produit le fichier ; le groupage et le dépôt se font avec les logiciels gratuits de l'ATIH (DRUIDES, e-PMSI) |
| Facturation, numérotation, avoirs, encaissements, relances, comptabilité | **Oui** | Gestion interne |
| Télétransmission B2 à l'Assurance maladie et retours NOEMIE | **Non, sans autorisation** | L'envoi réel demande un logiciel reconnu par l'Assurance maladie (ou un organisme concentrateur technique) et une convention avec la caisse : à confirmer avec la CPAM de Paris |
| ADRi (droits en ligne) | **Non, sans autorisation** | Service de l'Assurance maladie réservé aux logiciels autorisés |
| ROC (tiers payant complémentaire) | **Non, sans autorisation** | Contrat ROC, conformité du logiciel, certificats IGC-Santé |

## 2. Proposition retenue et intégrée

Tout ce qui peut être autonome est dans **Outils › Assurance maladie**, à côté de la transmission livrée le même jour :

1. **Espace DIM** (médecin DIM) : séjours sortis du mois, résumés validés et envoyés, exhaustivité, délai moyen de validation ; contrôles de cohérence (diagnostic incompatible avec le sexe ou l'âge, points bloquants du résumé) avec accès direct au séjour ; **fichier RSS** du mois (cumul depuis janvier), au format RUM de l'ATIH, à passer dans DRUIDES puis à déposer sur e-PMSI.
2. **Tarifs des GHS** (facturation) : import de l'arrêté tarifaire ex-OQN de l'année (GHS, tarif, bornes, journée EXH) ; le tarif et les journées au-delà de la borne haute se remplissent seuls, avec alerte sous la borne basse.
3. **Qui paie quoi** : répartition de chaque séjour entre Assurance maladie, complémentaire (tiers payant ROC : participation, forfait journalier, chambre selon le plafond de la mutuelle) et patient ; les dépassements restent facturés par les praticiens.
4. **Factures et avoirs** : à la transmission, une facture par débiteur, numérotée sans trou par année (F2026-000001) ; une facture ne se modifie jamais, une erreur s'annule par un avoir (A2026-000001) ; après un rejet, les factures ouvertes sont annulées par avoir avant la nouvelle émission.
5. **Encaissements** : règlement par débiteur (virement NOEMIE, ROC, carte, paiement en ligne, chèque, espèces, virement), lettrage automatique du paiement de l'Assurance maladie au retour NOEMIE, balance âgée (0-30, 31-60, 61-90, plus de 90 jours), relances des patients à 30, 45 et 60 jours.
6. **Lots B2** : regroupement quotidien des factures de l'Assurance maladie (envoi simulé tant que l'autorisation manque).
7. **Export comptable** : journal des ventes et des encaissements en CSV (comptes 4111 Assurance maladie, 4112 complémentaires, 4113 patients, 706, 512), à adapter au plan de comptes de la clinique.

## 3. Ce que Romain doit faire pour une autonomie complète

| Étape | Démarche | Interlocuteur |
|---|---|---|
| PMSI | Désigner le médecin DIM (obligatoire), compte e-PMSI de la clinique, déclarer le FINESS dans Clever Cloud (`INTEROP_FINESS`) et l'unité médicale (`INTEROP_UM`) ; vérifier avec le DIM la disposition RUM de l'année (IASELO produit le format 018, dernière notice lue) ; produire ensuite le RSF à partir des factures (prochaine étape) | ATIH, ARS |
| Facturation B2 et NOEMIE | Demander à la CPAM de Paris les conditions de télétransmission directe pour un logiciel édité par la société de Romain (autorisation, organisme concentrateur, convention) | CPAM, GIE SESAM-Vitale, CNDA |
| ADRi | Même démarche, avec les cartes ou certificats d'établissement | CPAM, CNDA |
| ROC | Contrat de tiers payant ROC, mise en conformité ROC de IASELO, certificats IGC-Santé, opérateur de transport, lecteurs de datamatrix | ANS, organismes complémentaires, CNDA |
| Comptabilité | Faire valider le plan de comptes et les règles de relance par l'expert-comptable de la clinique | Expert-comptable |

## Fichiers

- Règles : `dist/gestion-financiere-regles.js` (tests `tests/gestion-financiere.test.cjs`).
- Serveur : `worker/assurance-maladie.mjs` (vues `?vue=dim|factures|export`, actions `tarifs`, `encaissement`, `relance`, `avoir`, `lot-b2`, `lot-pmsi`) ; test de bout en bout `tests/clever/assurance-maladie.test.mjs`.
- Écran : `dist/assurance-maladie.js` (onglets Suivi des séjours, Espace DIM, Factures & encaissements).

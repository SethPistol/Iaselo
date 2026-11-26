# Transmission à l'Assurance maladie (25 novembre 2026)

Demande de Romain : améliorer la partie administrative de la transmission à l'Assurance maladie, après une veille de ce qui est demandé aux cliniques privées.

## 1. Veille : ce qu'une clinique privée (ex-OQN) doit transmettre

| Obligation | Ce qui est demandé | Qui le fait aujourd'hui |
|---|---|---|
| Droits du patient | NIR de l'assuré ouvrant droit, qualité du bénéficiaire, régime et caisse, nature d'assurance (maladie, maternité, AT/MP), exonération du ticket modérateur et son justificatif (ALD, AT, maternité, C2S, AME…), lecture de la carte Vitale ou de l'appli carte Vitale, interrogation des droits en ligne (ADRi) | Secrétariat, logiciel administratif (GAM) |
| Identité | INS qualifiée (référentiel national d'identitovigilance) pour tout échange de données de santé | Identitovigilance |
| PMSI MCO | Résumé de chaque séjour : dates, modes d'entrée et de sortie avec provenance et destination, diagnostic principal, relié et associés en CIM-10, actes CCAM datés avec activité, phase et **extension documentaire** (classe ASA obligatoire pour l'activité 4 d'anesthésie), implants facturés en sus (codes LPP, traçabilité lot/série). Groupage GHM/GHS par le logiciel PMSI, envoi mensuel cumulatif à l'ATIH sur e-PMSI (RSS, VID-HOSP, FICHCOMP, ANO), validation par le médecin DIM | Médecins, DIM, logiciel PMSI |
| Facturation du séjour | Facture directe à la caisse (norme B2, télétransmission) : GHS, journées au-delà de la borne haute, forfait journalier (20 €), participation forfaitaire de 24 € pour un acte ≥ 120 €, implants et médicaments en sus ; retours NOEMIE (paiements, rejets) ; délai de prescription d'un an après les soins | Service facturation, logiciel agréé |
| Honoraires des praticiens libéraux | Actes CCAM avec règles d'association (100 %, 50 %), un seul acte d'anesthésie par intervention, modificateurs, dépassements saisis par acte (dans le codage ou par la facturation ; IASELO ne bloque pas la facture sur le montant, le devis ou la C2S/AME, décision du 26/11/2026), FSE par logiciel SESAM-Vitale | Praticiens, logiciel SESAM-Vitale |
| Complémentaires (AMC) | Tiers payant sur la part complémentaire : dispositif **ROC** (identification des droits IDB, accord de prise en charge, facture, retour de paiement) ; prérequis selon le guide ANS de mars 2025 : contrat de tiers payant ROC, logiciel « ROC compatible », certificats IGC-Santé, lecteurs de datamatrix des attestations | Facturation |
| Qualité et financement | IFAQ 2026 : enveloppe de 700 M€, dont 40 % sur la certification (notice ATIH du 16 juillet 2026, arrêté du 15 janvier 2026) ; l'indicateur DMP (alimentation par la lettre de liaison) est neutralisé en 2026 | Direction, qualité |

Sources consultées : [notice technique IFAQ 2026 (ATIH)](https://www.atih.sante.fr/sites/default/files/public/content/4231/notice_technique_2026.pdf), [guide ROC en établissement (ANS, mars 2025)](https://esante.gouv.fr/sites/default/files/media_entity/documents/202503_Guide%20pour%20la%20mise%20en%20oeuvre%20de%20ROC%20en%20%C3%A9tablissement.pdf), [dispositif ROC (ANS)](https://esante.gouv.fr/ens/offre/dispositif-roc), [réforme du financement MCO (FHF)](https://www.fhf.fr/expertises/finances/reforme-du-mode-de-financement-de-lhospitalisation-tarification-lactivite/reforme-du-financement-des-etablissements-de-sante-modele-de-financement-mco-et-autres-dispositions). Les autres règles (forfait journalier, PF 24 €, association CCAM, extension documentaire ASA, délai d'un an) viennent de la connaissance du métier : à faire confirmer par le DIM et le service facturation de la clinique. Le guide ROC ne fixe pas de date d'obligation pour les cliniques.

## 2. Comparaison avec IASELO avant ce lot

| Exigence | Avant | Manque |
|---|---|---|
| Droits du patient | Pièces de préadmission (carte Vitale « reçue » oui/non) | Aucun NIR, régime, nature d'assurance, exonération, ADRi, ROC |
| Résumé PMSI | Actes CCAM proposés et validés par le DIM ; DAS proposés ; « RUM de contrôle » texte ; écran PMSI de démonstration | Pas de modes d'entrée/sortie, pas de DP structuré, pas d'extension documentaire ASA, implants sans LPP, aucun envoi au logiciel PMSI |
| Facture du séjour | Facture « illustrative » à lignes libres | Pas de GHS, forfait journalier, PF 24 €, implants en sus, aucune transmission ni retour |
| Honoraires | Devis signé, FSE simulée | Pas de règle d'association CCAM ni de modificateurs |
| Retours | — | Aucun suivi des paiements et rejets |

## 3. Ce qui est livré

Nouvel outil **Outils › Assurance maladie** (secrétariat, facturation, DIM, médecins), un dossier par séjour :

- **Suivi** : tous les séjours avec leur étape (droits à vérifier, PMSI à compléter, facture à compléter, prêt à facturer, en attente de retour, rejeté, payé), les points bloquants et le délai restant pour facturer.
- **Droits du patient** : NIR contrôlé (clé, Corse, cohérence sexe et naissance), qualité, régime, caisse, nature d'assurance, date de l'accident du travail, exonération, protocole ALD, mode de vérification, complémentaire ; boutons **ADRi** et **ROC** (simulation).
- **Résumé PMSI** : dates, modes d'entrée et de sortie, provenance et destination, DP / DR / DAS (DAS préremplis depuis le codage), actes repris du codage avec leur date (entrée en salle) et l'extension documentaire ASA reprise de la consultation, implants tracés au bloc avec « en sus » oui/non, code LPP et prix. Validation par le **médecin DIM seulement** ; toute modification annule la validation. Envoi au logiciel PMSI en **HL7 BAR^P12**.
- **Facture** : GHM/GHS issus du groupage, journées EXH, chambre particulière, honoraires avec association CCAM et modificateurs, estimation (base AMO, PF 24 € ou ticket modérateur, forfait journalier imputé, dépassements, part AMO, reste avant complémentaire). Transmission au logiciel de facturation (JSON sans diagnostic), puis verrouillage du dossier.
- **Envois & retours** : messages envoyés, paiements et rejets avec le geste de correction conseillé ; rejet → « Rouvrir pour correction » → nouvelle transmission. Les retours arrivent aussi par flux : `POST /api/interop/entrant/retours` (jeton `INTEROP_FACTURATION_JETON`, JSON `{reference,statut,montant,motif,libelle}`).

Minimisation : le secrétariat et la facturation ne reçoivent ni diagnostics ni classe ASA ; le secrétariat ne voit pas l'estimation de la facture. Chaque lecture et écriture est tracée dans le journal des accès.

Les écrans de démonstration « Codage PMSI » et « Facturation » de la gestion de la clinique renvoient vers ce nouvel outil.

## 4. Ce que Romain ou la clinique doit fournir

| Pour | À fournir | Variables Clever Cloud |
|---|---|---|
| Envoi du résumé PMSI | Nom de l'éditeur du logiciel PMSI, adresse de réception HL7, un échange test pour valider le profil BAR^P12 | `INTEROP_PMSI_MODE`, `INTEROP_PMSI_URL`, `INTEROP_PMSI_JETON_SORTANT` |
| Facture B2 et retours NOEMIE | Éditeur du logiciel de facturation, adresse de réception, accord sur le format de facture et sur l'envoi des retours vers IASELO | `INTEROP_FACTURATION_MODE`, `INTEROP_FACTURATION_URL`, `INTEROP_FACTURATION_JETON_SORTANT`, `INTEROP_FACTURATION_JETON`, `INTEROP_FINESS` |
| Droits en ligne (ADRi) | Le logiciel administratif agréé de la clinique qui porte ADRi (carte CPE ou certificat d'établissement) | `INTEROP_ADRI_MODE`, `INTEROP_ADRI_URL` |
| Complémentaires (ROC) | Contrat de tiers payant ROC, version « ROC compatible » du logiciel de facturation, certificats IGC-Santé | `INTEROP_ROC_MODE`, `INTEROP_ROC_URL` |
| Contrôle métier | Relecture par le DIM et la facturation des règles (exonérations, forfait journalier, PF 24 €, association CCAM, modificateurs) et de l'arrêté tarifaire GHS ex-OQN de l'année | — |

## Fichiers

- Règles : `dist/assurance-maladie-regles.js` (tests `tests/assurance-maladie.test.cjs`), message BAR^P12 dans `dist/interop-hl7.js`.
- Serveur : `worker/assurance-maladie.mjs` (branché dans `worker/marche.mjs`), connecteurs `pmsi`, `facturation`, `adri`, `roc` dans `server/interop/etablissement.mjs` ; test de bout en bout `tests/clever/assurance-maladie.test.mjs`.
- Écran : `dist/assurance-maladie.js`, styles dans `dist/marche.css`.

# Référentiels publics : base médicamenteuse et CCAM

Mis à jour à chaque construction du serveur (Clever Cloud, `npm run build` → `scripts/referentiels.mjs`), depuis les sites officiels.
Un échec de téléchargement ne bloque jamais le démarrage ; l'état est écrit dans `dist/assets/referentiels.json`.
`IASELO_REFERENTIELS=off` désactive le téléchargement (intégration continue).

| Référentiel | Source | Fichier produit | Utilisation |
| --- | --- | --- | --- |
| Base de données publique des médicaments (ANSM, HAS, UNCAM, Licence Ouverte) | `CIS_bdpm.txt`, `CIS_COMPO_bdpm.txt` sur base-donnees-publique.medicaments.gouv.fr | `dist/assets/medicaments-bdpm.json` (remplace la copie du dépôt seulement si le fichier est complet) | Feuille d'anesthésie (recherche par DCI, spécialité ou CIS), suggestions pendant la saisie de la prémédication et des traitements habituels (`dist/medicaments-saisie.js`) |
| CCAM (Assurance Maladie) | Archives DBF « nouvelle structure » repérées sur la page ameli (repli : dernière version connue) | `dist/assets/ccam.json` (version en vigueur de chaque acte, actes clos écartés) | Onglet « Codage PMSI proposé » : propositions à partir de l'intervention et du compte rendu opératoire, recherche, contrôle du code et de l'activité (1 acte, 4 anesthésie), validation DIM |

## Limites assumées

- La BDPM identifie les spécialités (CIS, substances, dosages, statut) ; elle ne contient ni interactions ni contre-indications structurées.
  Une aide à la prescription certifiée exige une base agréée HAS (Vidal ou BCB, sous contrat). Le point de branchement est
  `window.ParcoursBdpm.rechercher` : un fournisseur Vidal/BCB devra exposer la même recherche.
- Les codes CCAM proposés sont classés par pertinence des mots ; le praticien confirme et le médecin DIM valide.
  Le RUM généré reste un fichier de contrôle : la transmission à l'ATIH se fait par le logiciel PMSI de la clinique.

Code : `server/referentiels/` (lecture ZIP, DBF en CP850, BDPM), `dist/ccam-regles.js`, tests `tests/referentiels.test.mjs`.

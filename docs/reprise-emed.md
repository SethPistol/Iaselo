# Reprise des dossiers d'E-med (27/11/2026)

Point de la 3e veille. Il complète l'import du programme opératoire (CSV, voir Ctrl K). En attendant un export réel d'E-med (fictif), IASELO lit les **formats d'échange publics** que ce type de logiciel produit.

| Format | Contenu repris |
|---|---|
| HL7 v2 (un ou plusieurs messages ADT, ORU) | PID identité (INS, IPP, nom de naissance et d'usage), PV1 venue, AL1 allergies, DG1/PRB antécédents, RXE/RXO/RXA traitements, OBX poids, taille, groupe sanguin, IMC ; ORU biologie |
| HPRIM Santé 2.x | Biologie par patient |
| FHIR R4 (Bundle JSON) | Patient, AllergyIntolerance, Condition, MedicationStatement/MedicationRequest, Observation |
| CSV (tableur) | Une ligne par patient ; modèle téléchargeable dans l'écran. Les listes d'une cellule sont séparées par « \| » |

## Écran « Reprise des dossiers » (administrateur)
1. Choisir le fichier (5 Mo au plus, UTF-8 ou Windows-1252).
2. Relire l'aperçu : identité, allergies (en rouge), antécédents, traitements, mesures et éléments non repris.
3. Choisir pour chaque patient l'une des options suivantes :
   - **dossier existant**, proposé par rapprochement : certain (INS ou IPP), probable ou possible (nom et date de naissance) ;
   - **nouveau dossier** ;
   - **ne pas reprendre**.

   Sans nom ou sans date de naissance, le patient n'est pas repris.
4. Cliquer « Reprendre ».
   - Les allergies, antécédents, traitements, poids, taille et groupe sanguin vont dans la consultation d'anesthésie, **seulement dans les champs vides**. Les allergies sont marquées « repris d'E-med, à relire ».
   - Une consultation déjà commencée (trame du modèle) **n'est jamais modifiée**.
   - Le détail complet est écrit dans l'historique du dossier (« Reprise E-med »), avec le fichier source.

Règles : `dist/reprise-emed-regles.js`. Tests : `tests/reprise-emed.test.cjs`.

## À faire avec l'export réel
- Demander à Romain un export E-med **fictif**, dans chacun des formats que propose E-med, et vérifier les champs propres à l'éditeur (Z-segments HL7, colonnes CSV).
- Reprise des documents (PDF, comptes rendus) : à prévoir selon le format d'export d'E-med (archive avec index CSV ou CDA R2).

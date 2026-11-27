# Reprise des dossiers d'E-med (27/11/2026)

Point de la 3e veille. Il complète l'import du programme opératoire (CSV, voir Ctrl K). En attendant un export réel d'E-med (fictif), IASELO lit les **formats d'échange publics** que ce type de logiciel produit.

| Format | Contenu repris |
|---|---|
| HL7 v2 (un ou plusieurs messages ADT, ORU) | PID identité (INS, IPP, nom de naissance et d'usage), PV1 venue, AL1 allergies, DG1/PRB antécédents, RXE/RXO/RXA traitements, OBX poids, taille, groupe sanguin, IMC ; ORU biologie |
| HPRIM Santé 2.x | Biologie par patient |
| FHIR R4 (Bundle JSON) | Patient, AllergyIntolerance, Condition, MedicationStatement/MedicationRequest, Observation |
| CDA R2 (XML) | Documents structurés du DMP (VSM, lettres) : identité (INS, IPP, nom de naissance et d'usage), sections allergies (48765-2), antécédents (11450-4, 11348-0, 47519-4), traitements (10160-0, 10183-2), signes vitaux (8716-3) |
| CSV (tableur) | Une ligne par patient ; modèle téléchargeable dans l'écran. Les listes d'une cellule sont séparées par « \| » |

## Écran « Reprise des dossiers » (administrateur)
1. Choisir un ou plusieurs fichiers d'un même export (jusqu'à 200, 5 Mo chacun, UTF-8 ou Windows-1252). Un même patient présent dans plusieurs fichiers est regroupé par INS, IPP ou identité.
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

## Préparer l'export depuis E-med (pour Romain)
Les menus exacts dépendent de la version d'E-med : l'éditeur ou le référent informatique de la clinique indique où ils se trouvent.
1. **Patients fictifs seulement** pour le premier essai : créez 3 à 5 patients de test dans E-med (nom « FICTIF », allergies, antécédents, traitements, poids et taille renseignés), ou demandez à l'éditeur une base de démonstration.
2. Exportez-les dans **tous les formats proposés**, par ordre de préférence :
   - FHIR R4 (JSON) ou CDA R2 (XML, comme pour le DMP) ;
   - messages HL7 v2 (ADT, avec AL1 et DG1) ;
   - CSV ou Excel (enregistré en CSV) des patients, allergies, antécédents et traitements ;
   - résultats de biologie en HPRIM Santé ou HL7 ORU.
3. Déposez les fichiers dans le projet (ou dans l'écran « Reprise des dossiers » de la recette) : j'adapte la lecture aux champs propres à E-med.
4. Pour la reprise réelle : contrat avec l'éditeur pour l'export complet (article 20 du RGPD, portabilité ; réversibilité prévue au contrat), transfert chiffré, reprise sur la production uniquement, après validation sur des données fictives.

## À faire avec l'export réel
- Demander à Romain un export E-med **fictif**, dans chacun des formats que propose E-med, et vérifier les champs propres à l'éditeur (Z-segments HL7, colonnes CSV).
- Reprise des documents (PDF, comptes rendus) : à prévoir selon le format d'export d'E-med (archive avec index CSV ou CDA R2).

# Modules issus de la comparaison au marché (25 novembre 2026)

Dix manques relevés face aux logiciels de bloc et d'anesthésie du marché, tous traités. Les écrans sont réunis dans **Outils** et **Messagerie** (bas du menu, visibles selon le métier), sans ajouter d'entrée au menu principal. Tout ce qui dépend d'un logiciel extérieur fonctionne en **simulation** tant que la clinique n'a pas fourni ses accès : rien ne sort du serveur.

| # | Manque | Ce qui est livré | Où |
|---|---|---|---|
| 1 | Biologie et courriers reçus | Flux HL7 ORU^R01 et HPRIM Santé, valeurs critiques signalées, cumul par analyse, rattachement automatique **seulement sur IPP ou INS** (sinon file « À rattacher » avec candidats), courriers MSSanté ou scannés classés par type, bandeau « résultat non vu » dans le dossier | Outils › Biologie & courriers |
| 2 | Logiciel administratif (GAM, facturation, PMSI) | Mouvements ADT reçus (IHE PAM : admission, mutation, sortie, annulations), lien IPP/NDA, actes CCAM envoyés en DFT^P03 | Outils › Interfaces & connecteurs |
| 3 | Moniteurs et respirateurs | Passerelle ORU^R01 (codes MDC), panneau « Constantes reçues du moniteur » sur la feuille d'anesthésie : choix de la salle, pas de 1 à 15 min, relecture puis validation ligne par ligne (source « moniteur ») | Dossier › Peropératoire |
| 4 | Mode dégradé | Déclaration de panne tracée, classeur de secours imprimable (programme, allergies, groupe, traitements), formulaires vierges, fichier de secours chiffré (AES-GCM, phrase de secours de 12 caractères au moins) lisible hors ligne | Outils › Qualité & sécurité › Mode dégradé |
| 5 | Traçabilité transfusionnelle | Groupe ABO-RhD (2 déterminations), RAI (72 h ou 21 jours), commande de PSL à l'EFS avec urgence vitale, réception des poches, contrôle ultime au lit (CUPT) bloquant en cas d'incompatibilité, surveillance avant / 15 min / fin, effet indésirable receveur (EIR) avec grade, traçabilité à retourner à l'EFS | Outils › Transfusion |
| 6 | Événements indésirables et RMM | Déclaration (anonymat possible), gravité, EIGS signalé à l'ARS avec échéances (volet 1 sans délai, volet 2 sous 3 mois), analyse ALARM, RMM avec présents et conclusions | Outils › Qualité & sécurité |
| 7 | Agenda et prise de rendez-vous | Plages des anesthésistes (présentiel ou téléconsultation), créneaux, rendez-vous, **lien de prise de rendez-vous envoyé au patient** (au plus tard 48 h avant l'intervention) | Outils › Agenda · page patient rendez-vous.html |
| 8 | Assistant de consultation | Dictée ou échange enregistré, transcrit **sur le poste** (Whisper local, rien n'est envoyé), propositions champ par champ (poids, taille, PA, FC, SpO₂, Mallampati, ASA, allergies, traitements, antécédents, STOP-Bang, Apfel, METs, technique…), un champ déjà rempli n'est jamais écrasé | Dossier › Consultation |
| 9 | Honoraires et paiement | Devis (obligatoire dès 70 € de dépassement) signé en ligne par le patient, participation forfaitaire de 24 € signalée, feuille de soins transmise au logiciel SESAM-Vitale, paiement en ligne (Stripe Checkout) de la chambre ou des compléments, sans donnée de santé dans le libellé | Outils › Honoraires · pages devis.html, paiement.html |
| 10 | Logistique et communication | Brancardage (demande, prise en charge, en route, arrivé, retards), stérilisation (cycles avec Bowie-Dick, libération, péremption, quarantaine ATNC, boîte liée au patient), planning des équipes (chevauchements, couverture des salles), messagerie interne (fils par patient ou par équipe, urgent, non-lus), **pages patient en anglais** (bouton FR / EN) | Outils › Logistique du bloc · Messagerie |

## Règles de sécurité

- **Flux entrants** (`/api/interop/entrant/biologie|adt|moniteur|courrier`) : fermés tant que le jeton de l'émetteur n'est pas configuré (`INTEROP_<ID>_JETON`, 32 caractères au moins, comparé en temps constant). Réponse en accusé HL7 (ACK).
- **Identitovigilance** : un résultat, un courrier ou un mouvement n'est rattaché automatiquement que sur IPP ou INS ; nom + date de naissance proposent un candidat à confirmer par une personne.
- **Liens patient** (rendez-vous, devis, paiement) : jeton dans l'ancre de l'adresse (jamais transmis au serveur web dans l'URL), date de naissance demandée, 5 essais, durée limitée, chaque ouverture tracée. Les SMS ne contiennent ni nom ni information médicale.
- **Droits** : biologie et transfusion réservées aux soignants ; devis et feuilles de soins au praticien ; analyse des EI à la cellule qualité (administration) ; chaque action est tracée (`marche_history`, journal d'accès).
- **Production interdite sur la recette** : `INTEROP_<ID>_MODE=production` est refusé quand `IASELO_RECETTE=true`.

## Ce que la clinique doit fournir pour sortir de la simulation

| Connecteur | À fournir | Variables Clever Cloud |
|---|---|---|
| Laboratoires | Pour chaque laboratoire : un fichier d'exemple (HL7 ou HPRIM), l'adresse d'envoi, accord sur le jeton | `INTEROP_LABO_MODE`, `INTEROP_LABO_JETON` |
| Logiciel administratif (GAM) | Nom de l'éditeur, adresse de réception des actes, flux ADT sortant vers IASELO | `INTEROP_GAM_MODE`, `INTEROP_GAM_URL`, `INTEROP_GAM_JETON`, `INTEROP_GAM_JETON_SORTANT` |
| Moniteurs | Marque de la passerelle (IntelliBridge, Infinity Gateway…), correspondance lit / salle | `INTEROP_MONITEURS_MODE`, `INTEROP_MONITEURS_JETON` |
| Courriers | Boîte organisationnelle MSSanté de la clinique (opérateur recommandé : SESAN) ou dossier du scanner | `INTEROP_COURRIERS_MODE`, `INTEROP_COURRIERS_JETON` |
| EFS | Convention de cession avec l'EFS ou le dépôt de sang, adresse du logiciel de distribution | `INTEROP_EFS_MODE`, `INTEROP_EFS_URL`, `INTEROP_EFS_JETON_SORTANT` |
| SESAM-Vitale | Logiciel agréé SESAM-Vitale des praticiens (IASELO lui transmet les actes, il établit la FSE) | `INTEROP_SESAM_MODE`, `INTEROP_SESAM_URL`, `INTEROP_SESAM_JETON_SORTANT` |
| Paiement | Compte Stripe de la clinique, clé secrète, secret du webhook (adresse : `/api/paiement/stripe`) | `INTEROP_PAIEMENT_MODE`, `INTEROP_PAIEMENT_STRIPE_KEY`, `INTEROP_PAIEMENT_WEBHOOK_SECRET` |

## Fichiers

- Règles (testées, sans réseau) : `dist/interop-hl7.js`, `dist/marche-regles.js` — tests `tests/marche-regles.test.cjs`.
- Serveur : `worker/marche.mjs` (API par module, flux entrants, liens patient, webhook), `server/interop/etablissement.mjs` (connecteurs), migration `016_modules_marche.sql` — test de bout en bout `tests/clever/marche.test.mjs`.
- Écrans : `dist/marche.js`, `dist/marche-gestion.js`, `dist/marche.css`.
- Pages patient : `dist/rendez-vous.html`, `dist/devis.html`, `dist/paiement.html`, `dist/liens-patient.js` ; traduction anglaise `dist/traduction-patient.js` (toutes les pages patient).

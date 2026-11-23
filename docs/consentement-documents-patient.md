# Consentement d’anesthésie et documents transmis par le patient

Deux nouveaux onglets dans l’étape **Consultation d’anesthésie** du dossier : **Documents** et **Consentement d’anesthésie**. Ils utilisent l’espace patient (lien personnel par SMS et/ou e-mail Brevo, comme les prescriptions préopératoires).

## Documents avant la consultation
- Le médecin ou le secrétariat clique **Envoyer la demande**. Le patient reçoit un lien, saisit sa date de naissance et dépose ses documents depuis son téléphone : type (bilan, ordonnance, courrier, compte rendu, carte de groupe, autre), fichier, commentaire.
- Les documents arrivent directement dans l’onglet **Documents** du séjour (pastille « n documents du patient » dans le bandeau). L’équipe les ouvre, les marque « lus » ou les écarte avec un motif ; rien n’est jamais supprimé.
- Contrôles : PDF, JPEG ou PNG reconnus par leur contenu réel (pas par l’extension) ; PDF contenant du JavaScript, des lancements d’application ou des fichiers incorporés refusés ; 10 Mo par fichier, 20 documents et 80 Mo par séjour ; doublons refusés ; dépôt possible jusqu’au lendemain de l’intervention inclus (heure de Paris), comme le lien.

## Consentement d’anesthésie
- Texte repris mot pour mot du formulaire de la Clinique du Trocadéro (2 pages : information puis consentement, CSP L. 1111-2 et L. 1111-4). Fiche préremplie depuis le dossier (nom de naissance, date de naissance, intervention, date prévue, date de consultation, médecin), vérifiée puis **Envoyer au patient** (anesthésiste).
- Le patient lit l’information, répond Oui/Non aux 8 lignes, peut écrire des réserves, indique le lieu, signe (nom + case de certification ; dessin de signature facultatif comme sur le papier). Ou il imprime, signe à la main et **dépose le formulaire signé** (photo/PDF).
- Suivi dans le dossier : envoyé, ouvert, signé (ou déposé), relances, contre-signature du médecin, impression A4 fidèle au formulaire. Réponse « Non » ou réserve : statut « à revoir », ligne en rouge. Document déposé : l’anesthésiste le juge conforme ou non conforme (le patient voit le motif et peut recommencer). **Reçu signé sur papier** : enregistrement avec une note.
- **Relance** : bouton « Relancer le patient », mis en avant après 48 h sans retour ou à 3 jours de l’intervention ; un nouveau lien remplace l’ancien.
- **Blocage avant le bloc** : « Consentement d’anesthésie signé reçu » est un élément bloquant de la complétude (tour de contrôle, passage à l’étape Intervention, pastille du bandeau), avec passage outre possible et motif tracé. Alerte rouge à J-2, et rappel en tête de la feuille d’anesthésie et de la check-list HAS.

## RGPD / HDS
- Fichiers stockés sur le stockage objet de l’hébergeur (Cellar, offre HDS) ; aucun tiers. SMS/e-mail : établissement + lien, aucune donnée de santé ni nom.
- Lien stocké haché, date de naissance redemandée à chaque action, 5 erreurs ferment le lien, expiration le lendemain de l’intervention (48 h minimum, 45 jours maximum).
- Lecture des documents réservée à l’équipe soignante du séjour ; écriture de la rubrique `espacePatient` par le serveur uniquement (versions conservées).
- Traçabilité : envois (destinataire masqué), ouvertures, dépôts acceptés et refusés, signature, vérifications, lectures de fichiers dans le journal d’accès. Preuve de signature (empreinte SHA-256 du contenu signé, lien, IP, navigateur) dans la table `consent_evidence`, non modifiable.
- Signature électronique simple (eIDAS art. 25) : valeur probante à confirmer par le DPO/juriste de la clinique ; la signature papier reste possible.

## Technique
- Règles et texte : `dist/espace-patient-regles.js` (tests `tests/espace-patient.test.cjs`).
- Dossier : `dist/documents-consentement.js`, `dist/documents-consentement.css`. Page patient : `dist/espace-patient.html`, `dist/espace-patient-page.js`.
- Serveur : `worker/espace-patient.mjs`, migration `006_espace_patient.sql` (tables `patient_space_links`, `consent_evidence`), tests `tests/clever/espace-patient.test.mjs`.

## À valider par l’équipe
- Délai de relance (48 h / J-3), fermeture du dépôt le lendemain de l’intervention, limites de taille.
- Lecture des documents par le secrétariat (aujourd’hui : non, données de santé).
- Relance automatique sans clic (nécessite une tâche planifiée Clever Cloud) : non faite.

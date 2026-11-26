# Préadmission en ligne (26/11/2026)

**Déclenchement.** Quand le patient envoie son questionnaire d'anesthésie, IASELO crée un lien personnel vers sa
préadmission : un bouton « Commencer ma préadmission » s'affiche à la fin du questionnaire et le lien part par SMS
et e-mail (coordonnées vérifiées du séjour, Brevo). Rien n'est envoyé si la préadmission est déjà faite.

**Endoscopie ou chirurgie.** Type déduit du séjour (équipe « Endoscopie », secteur d'endoscopie, ou acte annoncé :
coloscopie, gastroscopie…), modifiable par les admissions. Le parcours diffère : préparation colique pour
l'endoscopie, douches préopératoires pour la chirurgie, texte de l'autorisation adapté.

**Parcours patient** (`dist/preadmission.html`) : jauge de progression, étapes « Obligatoire » / « Importante » avec
durée et bouton « J'y vais » : ce que je dois savoir, livret d'accueil, préadmission (formulaire + pièces),
autorisation, consultation d'anesthésie, confirmation du rendez-vous, devis d'honoraires signés, directives
anticipées, préparation colique ou douches, consignes, commission des usagers, protection des données.
Pièces : identité recto/verso (ou passeport), carte Vitale, mutuelle, justificatif de domicile, personne de
confiance, autorisation parentale et livret de famille pour un mineur. Récapitulatif imprimable.

**Admissions** (menu « Préadmissions », comptes secrétariat ; lecture aussi pour anesthésistes et chirurgiens) :
liste (pas commencée, en cours, à compléter, à vérifier, vérifiée), compte rendu (coordonnées vérifiées, pièces
jointes à ouvrir, conforme / non conforme, formulaire, étapes, envois et rappels), demande de complément avec
nouveau lien, validation, renvoi du lien, impression.

**Rappels.** J-7, J-3 et J-1 (10 h – 20 h, heure de Paris) tant que la préadmission n'est pas faite (formulaire
envoyé + pièces requises reçues), par SMS et e-mail, sans double envoi ; sans coordonnées, alerte au compte rendu.

**RGPD / HDS.** Lien haché, date de naissance demandée à chaque action (5 erreurs ferment le lien), messages sans
nom ni donnée de santé, pièces sur Cellar (HDS) avec contrôle du type réel, accès tracés (`preadmission-*`),
preuve de l'autorisation dans `consent_evidence`. Les textes d'information et l'autorisation sont à faire relire
par la clinique. Variable facultative : `TELEPHONE_ADMISSIONS` (numéro affiché au patient).

Code : `dist/preadmission-regles.js`, `dist/preadmission-page.js`, `dist/preadmissions.js`, `worker/preadmission.mjs`,
`worker/rappels-auto.mjs`, migration `020_preadmission.sql`. Tests : `tests/preadmission.test.cjs`,
`tests/clever/preadmission.test.mjs`.

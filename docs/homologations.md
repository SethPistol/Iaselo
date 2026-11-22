# Homologations officielles : raccordements nationaux

Plan complet (démarches, ordre, actions) : document « IASELO · Plan des homologations officielles ».
Aucune homologation n'est obtenue à ce jour. Tous les connecteurs démarrent en **simulation**.

## Trois modes par connecteur

`INTEROP_<ID>_MODE` avec `<ID>` = `INSI`, `PSC`, `DMP`, `MSSANTE` :

| Mode | Effet |
| --- | --- |
| `simulation` (défaut) | Réponses locales préfixées `SIM-`, rien ne quitte le serveur. |
| `test` | Appels réels vers l'environnement de test officiel (CNDA, bac à sable PSC, boîtes de test de l'opérateur). Données et cartes de test uniquement. |
| `production` | Exige `INTEROP_<ID>_AUTORISATION` (numéro délivré par l'autorité) ; interdit sur le serveur de recette (`IASELO_RECETTE=true`). |

L'état est visible sur `GET /api/workspace/interop/status`. Le logiciel affiche la référence déclarée « à vérifier », jamais « homologué ».

## Variables

| Connecteur | Variables |
| --- | --- |
| Pro Santé Connect | `PSC_CLIENT_ID`, `PSC_CLIENT_SECRET`, `PSC_DISCOVERY_URL` (facultatif). Adresse de retour à déclarer : `<BASE_URL>/auth/psc/callback` ; après déconnexion : `<BASE_URL>/login`. |
| INSi | `INSI_ENDPOINT`, `INSI_LPS_NOM`, `INSI_LPS_VERSION`, `INSI_IDAM`, `INSI_FINESS`, certificat `INSI_CERT_P12_BASE64` + `INSI_CERT_PASSWORD` (ou `INSI_CERT_PEM` + `INSI_KEY_PEM`), `INSI_CA_PEM` facultatif. |
| DMP | `DMP_ENDPOINT`, `DMP_LPS_NOM`, `DMP_LPS_VERSION`, `DMP_NIL`, `ETABLISSEMENT_FINESS`, `ETABLISSEMENT_NOM`, certificat d'authentification `DMP_CERT_P12_BASE64` (ORG_AUTH_CLI), certificat de cachet `DMP_SIGN_CERT_P12_BASE64` (ORG_SIGN). |
| MSSanté | `MSSANTE_SMTP_HOST`, `MSSANTE_SMTP_PORT` (465 ou 587), `MSSANTE_BAL`, `MSSANTE_CERT_P12_BASE64` ou `MSSANTE_SMTP_USER` + `MSSANTE_SMTP_PASSWORD`, `MSSANTE_ALLOWED_RECIPIENTS` (obligatoire en test). |

Les certificats et secrets vont dans les variables Clever Cloud, jamais dans le dépôt.

## Code

- `server/interop/modes.mjs` : modes et garde-fous communs.
- `server/interop/transport.mjs` : HTTPS à authentification mutuelle (certificat IGC-Santé).
- `server/interop/psc.mjs` : OpenID Connect complet (découverte, PKCE, `acr_values=eidas1`, `scope_all`, vérification des signatures et du nonce, RPPS depuis `SubjectNameID`, déconnexion `id_token_hint`). Branché sur `/auth/psc/start` et `/auth/psc/callback` ; un professionnel se connecte si son RPPS est renseigné sur son compte.
- `server/interop/insi.mjs` : requête SOAP avec contexte LPS, lecture du résultat (codes 00/01/02, OID INS de production et de test), comparaison des traits. Route `POST /api/workspace/interop/insi`.
- `server/interop/cda.mjs`, `dmp.mjs` : lettre de liaison CDA R2 (niveau 1, PDF), métadonnées XDS, attributs VIHF, préconditions (INS qualifiée, information et non-opposition, RPPS de l'auteur).
- `server/interop/mssante.mjs` : message MIME, client SMTP (TLS, STARTTLS, AUTH PLAIN, certificat client), contrôle des domaines `mssante.fr`, adresse patient `<INS>@patient.mssante.fr`.
- `worker/veille.mjs` : la route de lettre de liaison bascule vers les vrais connecteurs dès qu'un mode n'est plus `simulation`.

## Ce qui reste à aligner avec les documents officiels (accessibles après inscription)

- **INSi** : espaces de noms et en-têtes exacts du WSDL du package INSi (constantes `INSI_SPEC`).
- **DMP** : signature XML du VIHF et enveloppe ITI-41 du package DMP (interface `signer`) ; identifiants de modèles CDA (`CDA_SPEC`) à passer au validateur CI-SIS. Sans `signer`, l'envoi réel est refusé.
- **MSSanté** : modalités de l'opérateur choisi (port, authentification, API LPS éventuelle) ; pièce jointe IHE XDM si exigée.
- **Écrans** : bouton « Rechercher dans l'INSi » et production du PDF de la lettre de liaison côté interface (la route exige `pdfBase64` pour un envoi réel).

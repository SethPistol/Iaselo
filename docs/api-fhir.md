# API FHIR R4 d'IASELO

Ajoutée le 27/11/2026 (manque n°7 de la 3e veille concurrentielle). Cette API permet aux logiciels partenaires de lire le dossier (agenda, facturation, entrepôt de données, suivi à domicile…).

## Accès
1. L'administrateur crée l'accès dans **Gestion de la clinique › API FHIR & partenaires**. Il choisit les données lisibles (portées SMART `system/<Ressource>.read` ou `system/*.read`) et, s'il le souhaite, un webhook en `https://`.
2. L'identifiant client, le secret et le secret du webhook ne s'affichent **qu'une fois**. En base, le secret client est stocké haché ; le secret du webhook est stocké tel quel, car il sert à signer.
3. Le logiciel obtient un jeton valable 1 heure :
   ```
   POST /fhir/oauth/token
   Content-Type: application/x-www-form-urlencoded
   grant_type=client_credentials&client_id=…&client_secret=…   (ou en-tête Basic)
   ```
4. Il lit les données avec `Authorization: Bearer <jeton>`.
   - `GET /fhir/r4/metadata` (public) et `GET /fhir/r4/.well-known/smart-configuration`.
   - `Patient` : `_id`, `identifier`, `family`, `given`, `birthdate`.
   - `Encounter` : `patient`, `date` (eq, ge, le, gt, lt), `status`.
   - `Procedure`, `MedicationStatement`, `AllergyIntolerance` : le paramètre `patient` est obligatoire.
5. La révocation est immédiate : les jetons en cours sont supprimés.

## Correspondance
- Le dossier IASELO est par séjour : un séjour donne un `Patient` et un `Encounter` de même identifiant.
  - Si l'identifiant du séjour contient des caractères non admis en FHIR, il est encodé en `x-<hexadécimal>`, de façon réversible.
  - L'identifiant IASELO du séjour est dans `identifier` (`urn:iaselo:sejour`).
- `Patient` : nom de naissance (official), nom d'usage (usual), prénom, sexe, date de naissance. Profil FR Core.
- `Encounter` : statut selon l'étape du parcours, classe `IMP` (hospitalisation) ou `SS` (ambulatoire), spécialité, date d'intervention. Profil FR Core.
- `Procedure` : intervention annoncée, chirurgien, latéralité, code CCAM de la réservation du bloc s'il existe.
- `MedicationStatement` : traitement habituel (lignes structurées de la consultation), code CIS, décision périopératoire.
- `AllergyIntolerance` : allergies de la consultation (« Aucune allergie connue » → `refuted`).

## Webhooks
Après chaque modification d'un séjour (identité, consultation, annonce), IASELO envoie un `POST` JSON au webhook :
```
{"type":"iaselo.fhir.notification","envoye":"…","evenements":[{"id":"…","ressource":"Encounter/<id>","action":"update","le":"…"}]}
```
- **Aucune donnée de santé** n'est transmise : le partenaire relit la ressource avec son jeton.
- Seules les ressources couvertes par ses portées sont notifiées.
- En-têtes : `X-Iaselo-Timestamp` et `X-Iaselo-Signature: sha256=HMAC_SHA256(secret_webhook, timestamp + "." + corps)`.
- En cas d'échec, IASELO réessaie avec un délai croissant (jusqu'à 8 tentatives). Les essais sont relancés par la tournée des rappels, toutes les 10 minutes.

## Traçabilité
Chaque appel est inscrit au journal d'accès : jeton, lecture, recherche, webhook. L'acteur est `fhir:<identifiant>`. Les derniers appels sont visibles sur l'écran d'administration.

## À faire avant un raccordement réel
- Faire valider les systèmes de codage (CCAM, CIS) et les profils FR Core avec le guide d'implémentation de l'ANS. Les URL utilisées sont regroupées dans `SYSTEMES` et `PROFILS` de `worker/fhir.mjs`.
- Exposer l'INS qualifiée dans `Patient.identifier` une fois le téléservice INSi raccordé.
- Signer un contrat de sous-traitance (RGPD, HDS) avec chaque partenaire avant de lui créer un accès.

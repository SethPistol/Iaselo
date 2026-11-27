# Rédaction assistée (IA interchangeable)

Ajoutée le 27/11/2026 (manque n°1 de la 3e veille concurrentielle). Elle se trouve dans l'onglet « Rédaction assistée » du dossier, sous Prescription et suivi postopératoire.

## Documents proposés
- Compte rendu de consultation d'anesthésie (anesthésiste).
- Trame de compte rendu opératoire (chirurgien).
- Lettre de sortie (médecins).
- Synthèse du séjour (médecins et infirmier(ère)s).

Le professionnel relit le brouillon et peut le modifier. Il l'accepte ou le rejette. La proposition, le moteur utilisé, la décision et le texte final sont conservés dans la rubrique `redactionIa`, écrite par le serveur seulement, et inscrits au journal d'accès (`redaction-ia-*`). Rien n'est appliqué au dossier sans validation.

## Moteurs (`worker/redaction-ia.mjs`)
- `gabarit` (par défaut) : brouillon par règles à partir du dossier, sur le serveur. Aucune donnée ne sort.
- `compatible` : modèle génératif avec une API de type `chat/completions`. Il s'active avec ces variables :
  - `IA_MOTEUR=compatible`
  - `IA_URL` (https)
  - `IA_CLE`
  - `IA_MODELE`
  - `IA_HDS=oui` : l'exploitant atteste que le modèle est hébergé chez un hébergeur certifié HDS.
- Le modèle reçoit un contexte **pseudonymisé** : âge, sexe et éléments médicaux. Il ne reçoit jamais le nom, la date de naissance ni l'identifiant du séjour.
- Si le modèle échoue, IASELO propose le brouillon par règles et signale l'échec.
- Un autre moteur (modèle local, autre API) s'ajoute en écrivant un objet `{id,label,local,rediger(type,contexte)}`.

## Avant un usage réel
- Choisir l'hébergement du modèle génératif (hébergeur HDS).
- Évaluer le statut réglementaire : AI Act, et dispositif médical si l'outil oriente la décision.

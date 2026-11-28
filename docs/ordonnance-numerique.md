# Ordonnance numérique de sortie (simulation)

5e veille du marché, lot 5 (28/11/2026).

L’ordonnance numérique de l’Assurance maladie n’est pas encore ouverte aux établissements de santé. IASELO prépare
donc le circuit complet **en simulation** : rien n’est transmis à l’Assurance maladie ni à une pharmacie.

## Ce que fait le médecin

1. Dossier du patient, onglet « Sortie » : il prépare et enregistre l’ordonnance de sortie, comme avant.
2. Sous l’aperçu, il clique sur « Déposer l’ordonnance numérique ». IASELO attribue un identifiant unique
   (`SIM-XXXXX-XXXXX-XXXXXC`, alphabet sans 0/O/1/I, dernier caractère de contrôle) et dessine le QR code correspondant.
3. « Imprimer avec le QR code » imprime l’ordonnance avec l’identifiant et le QR code en bas de page.
4. Si l’ordonnance est modifiée après le dépôt, un avertissement s’affiche : il faut déposer la nouvelle version.
   L’ancienne est annulée automatiquement, sauf si elle a déjà été délivrée.
5. Il peut annuler une ordonnance non délivrée, avec un motif.

## Suivi de la délivrance (simulé)

Le bouton « Simuler la délivrance en officine » (médecins et pharmaciens) coche les médicaments délivrés.
Le statut passe de « Déposée » à « Délivrée en partie » puis « Délivrée ». C’est ce que la pharmacie signalera
quand le service sera ouvert.

## Garanties

- Le contenu déposé est figé : une empreinte SHA-256 du contenu et du prescripteur est conservée. Déposer deux fois le
  même contenu ne crée pas de doublon.
- Lecture par identifiant (`GET /api/workspace/ordonnance-numerique?id=`) réservée aux professionnels habilités
  sur le séjour ; un identifiant mal formé ou au caractère de contrôle faux est refusé.
- Chaque dépôt, délivrance, annulation et lecture par identifiant est tracé dans le journal d’accès.
- Droits : dépôt et annulation par les médecins ; délivrance simulée par les pharmaciens et les médecins ; lecture
  par les médecins, infirmiers et pharmaciens.

## Le jour de l’ouverture du service

L’identifiant et le dépôt viendront du téléservice de l’Assurance maladie (via les cartes CPS/e-CPS et le
connecteur `server/interop/`). L’écran, le QR code imprimé, l’annulation et le suivi de la délivrance sont conservés.

## Fichiers

- Règles : `dist/ordonnance-numerique-regles.js`
- Écran : `dist/ordonnance-numerique.js` (monté dans l’ordonnance de sortie, `dischargeRx()` de `parcours-v8.js`)
- Serveur : `worker/ordonnance-numerique.mjs`, table `ordonnances_numeriques` (migration 034)
- Tests : `tests/ordonnance-numerique.test.cjs`, `tests/clever/ordonnance-numerique.test.mjs`

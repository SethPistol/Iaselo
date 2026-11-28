# Téléconsultation vidéo

5e veille du marché, lot 7 (28/11/2026), manque 10.

## Principe

Il s’agit d’un appel vidéo entre le patient et l’équipe : suivi après l’intervention, visite de sortie à distance, résultats.

- L’appel passe **de navigateur à navigateur** (WebRTC). L’image et le son vont directement d’un appareil à l’autre, chiffrés (DTLS-SRTP).
- IASELO ne relaie que la **mise en relation** (offre, réponse, candidats réseau). Ces messages sont effacés à la fin de l’appel.
- **Rien n’est enregistré** : ni image ni son, et aucun MediaRecorder.
- La consultation pré-anesthésique reste en présentiel (art. D.6124-92 du code de la santé publique). Elle n’est donc pas proposée en vidéo.

## Pour l’équipe (médecins, infirmier(ère)s)

Les téléconsultations se gèrent dans « Télésuivi des patients », onglet « Téléconsultations ».

1. **Planifier** : choisir le patient, la date et l’heure (heure de Paris, au plus 90 jours à l’avance) et le motif.
   - Le lien part par SMS ou par e-mail, sans donnée de santé.
   - Sinon, l’écran le montre une fois pour qu’on le copie.
2. **Rejoindre** : la salle ouvre 15 minutes avant l’heure et se ferme 2 heures après.
3. **Pendant l’appel** : couper ou rétablir le micro et la caméra, raccrocher. Un badge rappelle « Chiffré de bout en bout · aucun enregistrement ».
4. **Terminer** ou **annuler** : la salle se ferme et les messages de mise en relation sont effacés.
5. **Nouveau lien** : l’ancien ne fonctionne plus.

## Pour le patient

La page `visio.html` fonctionne ainsi :
1. le patient donne sa date de naissance ; le lien est bloqué après 5 erreurs ;
2. le navigateur demande l’accès à la caméra et au micro, puis le patient entre dans la salle ;
3. la page est traduite dans les 7 langues des pages patient.

## Réseau : serveur relais (à configurer)

Sans serveur relais, l’appel fonctionne quand les deux appareils se joignent directement (même réseau, la plupart des box). Il peut échouer derrière certains réseaux d’entreprise ou mobiles.

Pour une fiabilité complète, il faut configurer un serveur TURN **hébergé en France**, par exemple coturn chez l’hébergeur HDS, dans la variable :

```
VISIO_ICE_SERVERS=[{"urls":"turn:relais.exemple.fr:3478","username":"…","credential":"…"}]
```

Aucun serveur tiers (Google, etc.) n’est utilisé par défaut, pour ne pas exposer l’adresse des patients hors de l’Union européenne.

## Traçabilité

Le journal d’accès trace la planification, le nouveau lien, le début de l’appel, la fin, l’annulation et l’ouverture par le patient. Les erreurs de date de naissance y figurent aussi.

## Fichiers

- Règles : `dist/teleconsultation-regles.js`
- Appel (partagé) : `dist/visio-appel.js`
- Écran équipe : `dist/teleconsultation-equipe.js`
- Page patient : `dist/visio.html` et `visio-page.js`
- Serveur : `worker/teleconsultation.mjs`, migration 036
- Tests : `tests/teleconsultation.test.cjs`, `tests/clever/teleconsultation.test.mjs`

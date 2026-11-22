> Archive de conception du prototype. Pour cette distribution autonome, les instructions d’exploitation, d’authentification et de déploiement applicables sont dans [README.md](../README.md). Les mentions de la plateforme et de SQLite ci-dessous décrivent l’ancien environnement.

# Modules de gestion de clinique — 19 novembre 2026

Cinq onglets ajoutés au prototype publié, reliés aux séjours fictifs de la session.

- Régulation : 14 ressources illustratives réparties entre les sept secteurs ; réservation datée, filtres, détection de chevauchements patient/ressource, admission et libération, localisation synchronisée au dossier. Équipe et matériel descriptifs ; capacités et contraintes non raccordées à un planning réel.
- Pharmacie : réception de lots, péremption, seuils de stock, dispensation liée à une prescription de médicament validée, vérification humaine de correspondance, historique des mouvements. Quantités exprimées en unités de stock, aucune conversion posologique. Administration conservée dans le dossier de soins.
- Activité : recueil manuel CCAM/NGAP/autre par séjour, exécutant, date et quantité ; annulation conservée dans l’historique.
- PMSI : entrée/sortie, unité médicale, DP/DR/DAS saisis manuellement, état de revue DIM, actes du séjour et export JSON de travail clairement non réglementaire. Aucune validation de nomenclature, aucun moteur de groupage GHM/GHS, aucun fichier RSS/RSA ou flux ATIH.
- Facturation : lignes libres ou reliées aux actes, prix manuels, total calculé en centimes, destinataire, validation/réouverture simulées, impression marquée sans valeur comptable, règlement fictif et reste. Aucune télétransmission ni opération financière réelle.

Le profil infirmier consulte ces modules en lecture seule. Les autres profils demeurent des rôles simulés et ne représentent pas des habilitations de production, DIM ou pharmacie.

Toutes les nouvelles données restent en mémoire dans l’onglet et disparaissent au rechargement. Aucun nouveau stockage de données réelles, backend partagé, flux externe ou certification n’est revendiqué. Le serveur local de démonstration n’est pas étendu par cette livraison.

## Vérification

`node --test tests/gestion.test.cjs` vérifie collisions patient/ressource, créneaux adjacents, annulations, quantités de dispensation, péremption et calculs monétaires. Tests manuels navigateur : réservation/conflit/admission, activité visible dans PMSI, facture validée avec total, réception et dispensation diminuant le stock.

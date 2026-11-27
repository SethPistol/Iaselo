-- Accueil téléphonique par IA (27/11/2026) : appels reçus par l'agent vocal de l'opérateur (ou simulés en attendant),
-- intention reconnue, réponse dite, rappel à faire par le service. Numéro gardé pour le rappel (base HDS), masqué dans les listes.
CREATE TABLE IF NOT EXISTS telephonie_appels (id TEXT PRIMARY KEY, recu_at TEXT NOT NULL, canal TEXT NOT NULL, numero TEXT NOT NULL, transcription TEXT NOT NULL,
 intention TEXT NOT NULL, libelle TEXT NOT NULL, orientation TEXT NOT NULL, priorite INTEGER NOT NULL, reponse TEXT NOT NULL, transfert INTEGER NOT NULL DEFAULT 0,
 statut TEXT NOT NULL, traite_par TEXT, traite_at TEXT, note TEXT, appel_operateur TEXT);
CREATE INDEX IF NOT EXISTS telephonie_appels_recu ON telephonie_appels(recu_at);
CREATE UNIQUE INDEX IF NOT EXISTS telephonie_appels_operateur ON telephonie_appels(appel_operateur) WHERE appel_operateur IS NOT NULL;

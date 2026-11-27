-- Information des proches et écran en chambre (27/11/2026, 4e veille, lot C).
-- proches_info : accord du patient (qui l'a recueilli, quand), proches à prévenir (prénom, portable), étapes choisies.
-- Les envois sont suivis dans rappels_auto (kind « proches-<étape> », un par jour) : jamais de doublon.
CREATE TABLE IF NOT EXISTS proches_info (stay_id TEXT PRIMARY KEY, data TEXT NOT NULL, accord_par TEXT NOT NULL, accord_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, retire_at TEXT);
-- Écran en chambre : lien de la tablette (haché, un seul actif par séjour, date de naissance vérifiée) et demandes du patient.
CREATE TABLE IF NOT EXISTS chambre_liens (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, birth_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, failed_attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS chambre_liens_stay ON chambre_liens(stay_id, created_at);
CREATE TABLE IF NOT EXISTS chambre_demandes (id TEXT PRIMARY KEY, stay_id TEXT NOT NULL, type TEXT NOT NULL, valeur INTEGER, texte TEXT NOT NULL DEFAULT '', recu_at TEXT NOT NULL, traite_par TEXT, traite_at TEXT);
CREATE INDEX IF NOT EXISTS chambre_demandes_recu ON chambre_demandes(recu_at);

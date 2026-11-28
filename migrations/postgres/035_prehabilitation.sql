-- Préhabilitation de J-30 à J-1 (5e veille, lot 6) : liens personnels du patient (hachés), révocables, 5 erreurs de date de naissance au plus.
CREATE TABLE IF NOT EXISTS prehab_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, birth_date TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS prehab_links_stay ON prehab_links(stay_id);

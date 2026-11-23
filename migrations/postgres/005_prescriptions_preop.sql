-- Prescriptions préopératoires envoyées au patient : lien personnel (stocké haché), contenu figé de la
-- version signée au moment de l'envoi, date de naissance attendue, compteur d'erreurs et accusé de consultation.
CREATE TABLE IF NOT EXISTS prescription_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, snapshot TEXT NOT NULL, version INTEGER NOT NULL, birth_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, channels TEXT NOT NULL DEFAULT '', revoked INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, first_viewed_at TEXT, last_viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS prescription_links_stay ON prescription_links(stay_id,created_at);

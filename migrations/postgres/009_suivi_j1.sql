-- Questionnaire du lendemain (SMS J+1) : lien personnel du patient, stocké haché, date de naissance vérifiée.
CREATE TABLE IF NOT EXISTS suivi_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, date_ref TEXT NOT NULL, birth_date TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, answers INTEGER NOT NULL DEFAULT 0, first_viewed_at TEXT);
CREATE INDEX IF NOT EXISTS suivi_links_stay ON suivi_links(stay_id, created_at);

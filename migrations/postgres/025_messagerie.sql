-- Messagerie sécurisée patient ↔ équipe (27/11/2026) : lien personnel du patient, stocké haché, un seul lien valide
-- à la fois par séjour (le précédent est révoqué à chaque nouvel envoi), date de naissance vérifiée à chaque appel.
CREATE TABLE IF NOT EXISTS messagerie_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, birth_date TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, failed_attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS messagerie_links_stay ON messagerie_links(stay_id, created_at);

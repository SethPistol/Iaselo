-- Lettre de liaison : envoi automatique à la validation de la relecture.
-- liaison_envois : un envoi par version relue (empreinte SHA-256) et par destinataire (patient, médecin, dmp).
-- liaison_links  : lien personnel du patient (stocké haché), lettre figée au moment de l'envoi,
--                  date de naissance attendue, compteur d'erreurs et accusé d'ouverture.
CREATE TABLE IF NOT EXISTS liaison_envois (stay_id TEXT NOT NULL, empreinte TEXT NOT NULL, cible TEXT NOT NULL, statut TEXT NOT NULL, mode TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (stay_id, empreinte, cible));
CREATE INDEX IF NOT EXISTS liaison_envois_stay ON liaison_envois(stay_id, created_at);
CREATE TABLE IF NOT EXISTS liaison_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, empreinte TEXT NOT NULL, snapshot TEXT NOT NULL, birth_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '', revoked INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, first_viewed_at TEXT, last_viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS liaison_links_stay ON liaison_links(stay_id, created_at);

-- Téléconsultation vidéo (5e veille, lot 7) : salles (lien patient haché, créneau, statut, événements) et messages de
-- mise en relation WebRTC (signalisation), effacés à la fin de l'appel. Aucune image ni aucun son n'est stocké.
CREATE TABLE IF NOT EXISTS visio_salles (id TEXT PRIMARY KEY, stay_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, birth_date TEXT NOT NULL, debut TEXT NOT NULL, motif TEXT NOT NULL, statut TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, evenements TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS visio_salles_stay ON visio_salles(stay_id);
CREATE TABLE IF NOT EXISTS visio_signaux (seq BIGSERIAL PRIMARY KEY, salle_id TEXT NOT NULL, de TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS visio_signaux_salle ON visio_signaux(salle_id, seq);

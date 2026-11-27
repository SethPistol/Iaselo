-- Identité de l'établissement de cette installation (27/11/2026) : une installation par établissement.
-- Une seule ligne (id = 1) : nom, coordonnées, FINESS, logos (empreinte du fichier dans le stockage objet).
CREATE TABLE IF NOT EXISTS establishment_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);

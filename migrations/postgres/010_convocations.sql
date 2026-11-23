-- Réglages de l'établissement modifiables dans l'application (ex. convocations : décalage avant le bloc, heure d'envoi, lieu).
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);

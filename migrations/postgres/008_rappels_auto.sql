-- Rappels automatiques par SMS : consentement non revenu (J-2, J-1) et nouvelles du lendemain (J+1).
-- Une ligne par séjour, type de rappel et date d'intervention : jamais deux envois du même rappel.
CREATE TABLE IF NOT EXISTS rappels_auto (stay_id TEXT NOT NULL, kind TEXT NOT NULL, date_ref TEXT NOT NULL, statut TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (stay_id, kind, date_ref));

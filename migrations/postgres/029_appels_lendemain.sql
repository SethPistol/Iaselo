-- Appel du lendemain par agent vocal (27/11/2026, 4e veille, lot D) : un enregistrement par tentative d'appel
-- (simulation ou opérateur), réponses comprises et alertes ; les réponses vont aussi dans le questionnaire J+1 du séjour.
CREATE TABLE IF NOT EXISTS appels_j1 (id TEXT PRIMARY KEY, stay_id TEXT NOT NULL, date_ref TEXT NOT NULL, canal TEXT NOT NULL, statut TEXT NOT NULL,
 at TEXT NOT NULL, par TEXT NOT NULL, dit TEXT NOT NULL DEFAULT '[]', reponses TEXT NOT NULL DEFAULT '{}', alertes TEXT NOT NULL DEFAULT '[]', urgence INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS appels_j1_stay ON appels_j1(stay_id, date_ref);

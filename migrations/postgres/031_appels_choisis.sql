-- Appel du lendemain : option choisie séjour par séjour (demande de Romain du 27/11/2026).
-- Par défaut, le lendemain = SMS automatique avec le questionnaire J+1 ; l'appel vocal n'est passé que si un soignant l'a ajouté.
CREATE TABLE IF NOT EXISTS appels_j1_choix (stay_id TEXT PRIMARY KEY, actif INTEGER NOT NULL DEFAULT 0, par TEXT NOT NULL, at TEXT NOT NULL);

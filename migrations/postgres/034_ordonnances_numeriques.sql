-- Ordonnance numérique de sortie EN SIMULATION (5e veille, lot 5) : identifiant unique, empreinte du contenu déposé,
-- événements (dépôt, délivrances simulées, annulation). Rien n'est transmis à l'Assurance maladie.
CREATE TABLE IF NOT EXISTS ordonnances_numeriques (id TEXT PRIMARY KEY, stay_id TEXT NOT NULL, created_at TEXT NOT NULL, par TEXT NOT NULL, empreinte TEXT NOT NULL, contenu TEXT NOT NULL, evenements TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ordonnances_numeriques_stay ON ordonnances_numeriques(stay_id);

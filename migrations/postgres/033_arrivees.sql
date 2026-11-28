-- Accueil du patient le jour J (5e veille, lot 3) : arrivée signalée par QR code ou notée par l'accueil, une par séjour et par jour.
-- L'accueil confirme ensuite l'identité (identitovigilance). Aucune donnée médicale.
CREATE TABLE IF NOT EXISTS arrivees (stay_id TEXT NOT NULL, jour TEXT NOT NULL, at TEXT NOT NULL, source TEXT NOT NULL, par TEXT NOT NULL, confirme_par TEXT, confirme_at TEXT, PRIMARY KEY(stay_id,jour));

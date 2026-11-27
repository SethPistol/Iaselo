-- Objets connectés du télésuivi (27/11/2026, 4e veille, lot G) : appareils prêtés au patient (numéro de série rattaché
-- au séjour) et mesures reçues de la passerelle du fournisseur (ou simulées), alertes prises en charge par l'équipe.
CREATE TABLE IF NOT EXISTS objets_appairages (id TEXT PRIMARY KEY, stay_id TEXT NOT NULL, appareil TEXT NOT NULL, numero_serie TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, retire_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS objets_appairages_serie ON objets_appairages(numero_serie) WHERE actif=1;
CREATE TABLE IF NOT EXISTS objets_mesures (id TEXT PRIMARY KEY, stay_id TEXT NOT NULL, appareil TEXT NOT NULL, type TEXT NOT NULL, valeur DOUBLE PRECISION NOT NULL, mesure_at TEXT NOT NULL, recu_at TEXT NOT NULL, source TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS objets_mesures_unique ON objets_mesures(stay_id, type, mesure_at);
CREATE TABLE IF NOT EXISTS objets_alertes_vues (stay_id TEXT NOT NULL, cle TEXT NOT NULL, par TEXT NOT NULL, at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', PRIMARY KEY (stay_id, cle));

-- Bloc prédictif (27/11/2026) : liste d'attente de patients, libération de vacations et bourse aux créneaux
-- (worker/bloc-optimisation.mjs). La table courante garde l'état ; chaque action est copiée dans
-- bloc_optimisation_history, jamais modifiée (auteur, date, action, détail).
CREATE TABLE IF NOT EXISTS bloc_optimisation (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS bloc_optimisation_kind ON bloc_optimisation(kind,status);
CREATE TABLE IF NOT EXISTS bloc_optimisation_history (sequence BIGSERIAL PRIMARY KEY, id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE OR REPLACE TRIGGER bloc_optimisation_history_no_change BEFORE UPDATE OR DELETE ON bloc_optimisation_history FOR EACH ROW EXECUTE FUNCTION immutable_audit();

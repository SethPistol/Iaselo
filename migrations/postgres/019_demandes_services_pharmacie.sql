-- Demandes des services à la pharmacie (dotations, 26/11/2026, worker/commandes-pharmacie.mjs) : demandées par
-- l'infirmier(ère) ou l'anesthésiste, préparées et délivrées par lot par la pharmacie, réceptionnées par le service.
-- Chaque étape (demande, prise en charge, délivrance, refus, annulation, accusé de réception) est copiée dans
-- pharmacy_request_events, jamais modifiée. Aucune donnée patient.
CREATE TABLE IF NOT EXISTS pharmacy_requests (id TEXT PRIMARY KEY, numero TEXT NOT NULL UNIQUE, service TEXT NOT NULL, statut TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, created_by_job TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pharmacy_requests_statut ON pharmacy_requests(statut,updated_at);
CREATE TABLE IF NOT EXISTS pharmacy_request_events (id BIGSERIAL PRIMARY KEY, request_id TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL, statut TEXT NOT NULL, motif TEXT NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, actor_profil TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pharmacy_request_events_request ON pharmacy_request_events(request_id,version);
CREATE OR REPLACE TRIGGER pharmacy_request_events_no_change BEFORE UPDATE OR DELETE ON pharmacy_request_events FOR EACH ROW EXECUTE FUNCTION immutable_audit();

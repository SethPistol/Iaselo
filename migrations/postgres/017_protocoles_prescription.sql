-- Protocoles de prescription partagés (26/11/2026) : créés et mis à jour par l'administrateur, repris par les
-- médecins prescripteurs (worker/protocoles.mjs). La table courante garde la dernière version ; chaque version
-- (création, mise à jour, retrait, remise en service) est copiée dans prescription_protocol_versions, jamais modifiée.
CREATE TABLE IF NOT EXISTS prescription_protocols (id TEXT PRIMARY KEY, type TEXT NOT NULL, nom TEXT NOT NULL, specialite TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'actif', version INTEGER NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_by_name TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS prescription_protocols_type ON prescription_protocols(type,statut);
CREATE TABLE IF NOT EXISTS prescription_protocol_versions (protocol_id TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL, statut TEXT NOT NULL, motif TEXT NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(protocol_id,version));
CREATE OR REPLACE TRIGGER prescription_protocol_versions_no_change BEFORE UPDATE OR DELETE ON prescription_protocol_versions FOR EACH ROW EXECUTE FUNCTION immutable_audit();
-- Reprises par les médecins : quel protocole, quelle version, dans quel séjour et quelle partie du dossier.
CREATE TABLE IF NOT EXISTS prescription_protocol_uses (id BIGSERIAL PRIMARY KEY, protocol_id TEXT NOT NULL, version INTEGER NOT NULL, stay_id TEXT NOT NULL, cible TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS prescription_protocol_uses_protocol ON prescription_protocol_uses(protocol_id,version);
CREATE INDEX IF NOT EXISTS prescription_protocol_uses_stay ON prescription_protocol_uses(stay_id);
CREATE OR REPLACE TRIGGER prescription_protocol_uses_no_change BEFORE UPDATE OR DELETE ON prescription_protocol_uses FOR EACH ROW EXECUTE FUNCTION immutable_audit();

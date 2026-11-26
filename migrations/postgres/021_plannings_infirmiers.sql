-- Plannings de travail des infirmier(ère)s (26/11/2026) : un planning par service (bloc, étage) et par mois,
-- préparé et validé par le cadre, consulté en lecture seule par les infirmier(ère)s (worker/plannings-infirmiers.mjs).
-- La table courante garde l'état de travail ; chaque enregistrement et chaque validation sont copiés dans
-- nurse_schedule_versions, jamais modifiée (auteur, date, motif, empreinte SHA-256).
CREATE TABLE IF NOT EXISTS nurse_schedules (service TEXT NOT NULL, mois TEXT NOT NULL, statut TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_by_name TEXT NOT NULL, validated_version INTEGER, validated_at TEXT, validated_by_name TEXT, PRIMARY KEY(service,mois));
CREATE TABLE IF NOT EXISTS nurse_schedule_versions (service TEXT NOT NULL, mois TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL, statut TEXT NOT NULL, motif TEXT NOT NULL, alertes INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, hash TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(service,mois,version));
CREATE INDEX IF NOT EXISTS nurse_schedule_versions_validation ON nurse_schedule_versions(service,mois,action);
CREATE OR REPLACE TRIGGER nurse_schedule_versions_no_change BEFORE UPDATE OR DELETE ON nurse_schedule_versions FOR EACH ROW EXECUTE FUNCTION immutable_audit();

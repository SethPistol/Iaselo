-- Listes partagées découpées en éléments (audit du 24/11/2026, point 4) : voir worker/items.mjs.
-- Historique par élément : seul l'élément modifié est copié (data NULL = élément retiré).
CREATE TABLE IF NOT EXISTS workspace_item_versions (sequence BIGSERIAL PRIMARY KEY, key TEXT NOT NULL, item TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT, actor TEXT NOT NULL, updated_at TEXT NOT NULL, operation TEXT NOT NULL, reason TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS workspace_item_versions_item ON workspace_item_versions(key,item,revision DESC);
CREATE OR REPLACE TRIGGER workspace_item_versions_no_change BEFORE UPDATE OR DELETE ON workspace_item_versions FOR EACH ROW EXECUTE FUNCTION immutable_audit();
-- La version d'un document-liste ne recopie plus la liste entière : un repère suffit, le détail est par élément.
CREATE OR REPLACE FUNCTION workspace_version_append() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO workspace_versions(key,data,revision,actor,updated_at,operation,reason) VALUES(NEW.key,CASE WHEN NEW.key IN ('identities/records','identities/reviews','management/pmsi','management/invoices','management/reservations','management/acts','management/movements','management/patientDrafts') THEN '{"$items":1}' ELSE NEW.data END,NEW.revision,NEW.actor,NEW.updated_at,NEW.operation,NEW.reason); RETURN NEW; END $$;
-- Chargement par séjour : index sur le préfixe des clés « stay/<séjour>/ ».
CREATE INDEX IF NOT EXISTS workspace_documents_key_prefix ON workspace_documents(key text_pattern_ops);

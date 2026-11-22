CREATE TABLE workspace_members (user_id TEXT PRIMARY KEY, role TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE workspace_documents (key TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, actor TEXT NOT NULL, updated_at TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, reason TEXT NOT NULL);
CREATE TABLE workspace_versions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL, actor TEXT NOT NULL, updated_at TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, reason TEXT NOT NULL, UNIQUE(key,revision));
CREATE INDEX workspace_versions_key ON workspace_versions(key,revision DESC);
CREATE TABLE workspace_access (sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);
CREATE TRIGGER workspace_document_insert AFTER INSERT ON workspace_documents BEGIN INSERT INTO workspace_versions(key,data,revision,actor,updated_at,operation,reason) VALUES(NEW.key,NEW.data,NEW.revision,NEW.actor,NEW.updated_at,NEW.operation,NEW.reason); END;
CREATE TRIGGER workspace_document_update AFTER UPDATE ON workspace_documents BEGIN INSERT INTO workspace_versions(key,data,revision,actor,updated_at,operation,reason) VALUES(NEW.key,NEW.data,NEW.revision,NEW.actor,NEW.updated_at,NEW.operation,NEW.reason); END;
CREATE TRIGGER workspace_versions_no_update BEFORE UPDATE ON workspace_versions BEGIN SELECT RAISE(ABORT,'Historical versions are immutable'); END;
CREATE TRIGGER workspace_versions_no_delete BEFORE DELETE ON workspace_versions BEGIN SELECT RAISE(ABORT,'Historical versions are immutable'); END;

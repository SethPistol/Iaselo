CREATE TABLE questionnaire_invitations (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, used_at TEXT);
CREATE INDEX questionnaire_invitations_stay ON questionnaire_invitations(stay_id);

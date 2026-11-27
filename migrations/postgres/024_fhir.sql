-- API FHIR R4 (27/11/2026) : logiciels partenaires (secret haché, portées SMART system/*.read, webhook signé),
-- jetons d'accès hachés (1 h) et file des notifications webhook (sans donnée de santé, nouvelles tentatives).
CREATE TABLE IF NOT EXISTS fhir_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, secret_hash TEXT NOT NULL, scopes TEXT NOT NULL, webhook_url TEXT NOT NULL DEFAULT '', webhook_secret TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, created_by TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT);
CREATE TABLE IF NOT EXISTS fhir_tokens (token_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES fhir_clients(id), scopes TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS fhir_tokens_client ON fhir_tokens(client_id);
CREATE TABLE IF NOT EXISTS fhir_events (id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES fhir_clients(id), resource TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL, status TEXT NOT NULL, delivered_at TEXT, last_error TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS fhir_events_status ON fhir_events(status, next_at);

-- Espace patient : liens personnels (stockés hachés) pour déposer des documents avant la consultation
-- et signer le consentement d'anesthésie. La date de naissance protège l'accès ; 5 erreurs ferment le lien.
-- L'état (documents reçus, consentement) est écrit par le serveur dans la rubrique de séjour « espacePatient ».
CREATE TABLE IF NOT EXISTS patient_space_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK (purpose IN ('documents','consentement')), birth_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, channels TEXT NOT NULL DEFAULT '', revoked INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, first_viewed_at TEXT, last_viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS patient_space_links_stay ON patient_space_links(stay_id,purpose,created_at);
-- Preuve de la signature électronique simple : empreinte du contenu signé, lien utilisé, adresse IP et navigateur.
-- Table en ajout seul (aucune modification ni suppression possible).
CREATE TABLE IF NOT EXISTS consent_evidence (sequence BIGSERIAL PRIMARY KEY, stay_id TEXT NOT NULL, at TEXT NOT NULL, mode TEXT NOT NULL, fingerprint TEXT NOT NULL, link_hash TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS consent_evidence_stay ON consent_evidence(stay_id,at);
CREATE OR REPLACE TRIGGER consent_evidence_no_change BEFORE UPDATE OR DELETE ON consent_evidence FOR EACH ROW EXECUTE FUNCTION immutable_audit();

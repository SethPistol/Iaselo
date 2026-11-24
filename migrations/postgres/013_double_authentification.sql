-- Double authentification (TOTP, RFC 6238) des connexions par mot de passe : audit du 24/11/2026, point 3.
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT 0;
-- Sessions ouvertes avant cette migration : considérées comme validées (elles expirent d'elles-mêmes).
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS mfa_ok INTEGER NOT NULL DEFAULT 1;

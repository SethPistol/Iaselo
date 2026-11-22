-- Pro Santé Connect : jeton d'identité conservé avec la session (déconnexion PSC avec id_token_hint)
-- et niveau d'authentification ; un RPPS ne peut être rattaché qu'à un seul compte.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS id_token TEXT;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'password';
CREATE UNIQUE INDEX IF NOT EXISTS professional_profiles_rpps_unique ON professional_profiles(rpps) WHERE rpps<>'';

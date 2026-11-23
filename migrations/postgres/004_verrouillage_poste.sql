-- Verrouillage du poste après inactivité : la session reste ouverte mais refuse tout accès aux données
-- tant que le professionnel n'a pas ressaisi son mot de passe (POST /auth/unlock).
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS locked_at TEXT;

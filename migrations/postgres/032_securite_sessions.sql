-- Audit de sécurité du 27/11/2026 : fin de session après inactivité, contrôlée par le serveur (et non plus seulement
-- par l'écran), et tentatives de connexion comptées aussi par adresse réseau (anti « pulvérisation » de mots de passe).
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TEXT;

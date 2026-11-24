-- Comptes créés depuis l'application par un administrateur : mot de passe provisoire à changer à la première connexion.
ALTER TABLE auth_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

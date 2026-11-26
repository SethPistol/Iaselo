-- Préadmission en ligne (26/11/2026) : liens personnels du patient, stockés hachés, envoyés à la fin du questionnaire
-- d'anesthésie puis par les rappels J-7, J-3 et J-1 tant que la préadmission n'est pas faite.
-- La date de naissance protège l'accès ; 5 erreurs ferment le lien. L'état est écrit par le serveur dans la
-- rubrique de séjour « preadmissionPatient » (lue par les admissions, l'anesthésiste et le chirurgien).
CREATE TABLE IF NOT EXISTS preadmission_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, birth_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, motif TEXT NOT NULL DEFAULT '', channels TEXT NOT NULL DEFAULT '', revoked INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, first_viewed_at TEXT, last_viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS preadmission_links_stay ON preadmission_links(stay_id,created_at);

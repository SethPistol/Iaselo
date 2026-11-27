-- Parcours de soins à distance (27/11/2026) : liens personnels du patient pour chaque étape (fiche d'éducation,
-- questionnaire de suivi, PROMs/PREMs), stockés hachés, date de naissance vérifiée avant toute réponse.
-- Le contenu du parcours est dans la rubrique stay/<id>/parcoursSuivi, écrite par le serveur seulement.
CREATE TABLE IF NOT EXISTS parcours_links (token_hash TEXT PRIMARY KEY, stay_id TEXT NOT NULL, etape TEXT NOT NULL, programme TEXT NOT NULL, date_ref TEXT NOT NULL, birth_date TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, answers INTEGER NOT NULL DEFAULT 0, first_viewed_at TEXT);
CREATE INDEX IF NOT EXISTS parcours_links_stay ON parcours_links(stay_id, created_at);

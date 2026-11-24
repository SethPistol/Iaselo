-- Ouverture des salles d'opération : une ligne par partie signée (infirmière ou anesthésie), jamais modifiée.
CREATE TABLE IF NOT EXISTS room_openings (id TEXT PRIMARY KEY, day TEXT NOT NULL, room TEXT NOT NULL, room_label TEXT NOT NULL, part TEXT NOT NULL, items TEXT NOT NULL, conclusion TEXT NOT NULL, comment TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS room_openings_day ON room_openings(day);

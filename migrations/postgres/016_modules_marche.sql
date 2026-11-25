-- Modules ajoutés après la comparaison au marché (25/11/2026) : biologie et courriers reçus, interfaces avec le logiciel
-- administratif, moniteurs, mode dégradé, transfusion, événements indésirables et RMM, agenda de consultation, honoraires
-- et paiements, stérilisation, brancardage, planning des équipes, messagerie entre soignants (worker/marche.mjs).
-- Un enregistrement par élément ; chaque modification est conservée dans marche_history (jamais effacée).
CREATE TABLE IF NOT EXISTS marche_records (id TEXT PRIMARY KEY, module TEXT NOT NULL, kind TEXT NOT NULL, stay_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', day TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS marche_records_module ON marche_records(module,kind);
CREATE INDEX IF NOT EXISTS marche_records_stay ON marche_records(stay_id);
CREATE INDEX IF NOT EXISTS marche_records_ref ON marche_records(module,ref);
CREATE INDEX IF NOT EXISTS marche_records_day ON marche_records(module,day);
CREATE TABLE IF NOT EXISTS marche_history (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, module TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS marche_history_record ON marche_history(record_id);
-- Liens personnels envoyés au patient (prise de rendez-vous, devis, paiement) : seule l'empreinte du jeton est gardée.
CREATE TABLE IF NOT EXISTS marche_jetons (token_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL, record_id TEXT NOT NULL DEFAULT '', stay_id TEXT NOT NULL, birth_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, used_at TEXT);

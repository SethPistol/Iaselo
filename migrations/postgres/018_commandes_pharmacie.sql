-- Commandes de la pharmacie aux fournisseurs (26/11/2026, worker/commandes-pharmacie.mjs).
-- Livret des produits commandables (tenu par le pharmacien), commandes (préparées par le préparateur ou le pharmacien,
-- validées par le pharmacien, transmises, reçues). Chaque étape et chaque réception sont copiées dans des tables
-- jamais modifiées : qui, quand, sous quel profil, avec quel motif.
CREATE TABLE IF NOT EXISTS pharmacy_articles (id TEXT PRIMARY KEY, nom TEXT NOT NULL, fournisseur TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_by_name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pharmacy_article_versions (article_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, motif TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(article_id,version));
CREATE OR REPLACE TRIGGER pharmacy_article_versions_no_change BEFORE UPDATE OR DELETE ON pharmacy_article_versions FOR EACH ROW EXECUTE FUNCTION immutable_audit();
CREATE TABLE IF NOT EXISTS pharmacy_orders (id TEXT PRIMARY KEY, numero TEXT NOT NULL UNIQUE, fournisseur TEXT NOT NULL, statut TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, total_centimes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pharmacy_orders_statut ON pharmacy_orders(statut,updated_at);
CREATE TABLE IF NOT EXISTS pharmacy_order_events (id BIGSERIAL PRIMARY KEY, order_id TEXT NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL, statut TEXT NOT NULL, motif TEXT NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, actor_profil TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pharmacy_order_events_order ON pharmacy_order_events(order_id,version);
CREATE OR REPLACE TRIGGER pharmacy_order_events_no_change BEFORE UPDATE OR DELETE ON pharmacy_order_events FOR EACH ROW EXECUTE FUNCTION immutable_audit();
-- Une ligne par produit reçu : quantité livrée, conforme, lot, péremption, chaîne du froid, motif du litige.
CREATE TABLE IF NOT EXISTS pharmacy_receptions (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, ligne INTEGER NOT NULL, article_id TEXT NOT NULL, quantite INTEGER NOT NULL, conforme INTEGER NOT NULL, lot TEXT NOT NULL, peremption TEXT NOT NULL, data TEXT NOT NULL, actor TEXT NOT NULL, actor_name TEXT NOT NULL, actor_profil TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pharmacy_receptions_order ON pharmacy_receptions(order_id);
CREATE OR REPLACE TRIGGER pharmacy_receptions_no_change BEFORE UPDATE OR DELETE ON pharmacy_receptions FOR EACH ROW EXECUTE FUNCTION immutable_audit();
-- Pharmacien : poste « pharmacien » (titulaire, adjoint) ou « preparateur » (préparateur en pharmacie).
UPDATE professional_profiles SET poste='pharmacien' WHERE profession='pharmacien' AND poste='';

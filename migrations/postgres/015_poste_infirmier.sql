-- Deux profils infirmiers : bloc (check-list HAS et ouverture des salles) et étage (sans ces deux éléments).
-- Le métier reste « infirmier » ; le poste précise bloc ou étage. Les comptes infirmiers existants passent
-- en « étage » (accès le plus restreint) : l'administrateur bascule les infirmier(ère)s de bloc dans Accès professionnels.
ALTER TABLE professional_profiles ADD COLUMN IF NOT EXISTS poste TEXT NOT NULL DEFAULT '';
UPDATE professional_profiles SET poste='etage' WHERE profession='infirmier' AND poste='';

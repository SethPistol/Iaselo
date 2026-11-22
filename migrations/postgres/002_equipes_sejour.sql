-- Trois équipes de séjour standard : Endoscopie, Chirurgie, Séjour médical.
-- L'équipe historique « demo-clinique » devient Chirurgie (elle garde ses séjours) ;
-- ses membres rejoignent aussi les deux nouvelles équipes.
INSERT INTO care_teams(id,label) VALUES('demo-clinique','Chirurgie') ON CONFLICT (id) DO UPDATE SET label='Chirurgie';
INSERT INTO care_teams(id,label) VALUES('endoscopie','Endoscopie'),('sejour-medical','Séjour médical') ON CONFLICT DO NOTHING;
INSERT INTO professional_teams(user_id,team_id,valid_from) SELECT m.user_id,t.id,m.valid_from FROM professional_teams m CROSS JOIN (VALUES('endoscopie'),('sejour-medical')) AS t(id) WHERE m.team_id='demo-clinique' ON CONFLICT DO NOTHING;

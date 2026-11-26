'use strict';
// Plannings infirmiers : normalisation, horaires, alertes (repos, heures, jours d'affilée), vue des collègues, différences.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/plannings-infirmiers-regles.js');
const m='2026-12',pers=[{id:'a',nom:'Alice Fictif',userId:'u1'},{id:'b',nom:'Bruno Fictif'}];
test('normalisation : jours du mois, codes connus, horaires par défaut non stockés',()=>{
 const n=P.normaliser({personnes:[...pers,{id:'a',nom:'Doublon'},{id:'x y',nom:'Id invalide'}],affectations:{a:{'2026-12-01':{code:'J',debut:'08:00',fin:'19:00'},'2026-11-30':{code:'J'},'2026-12-02':{code:'ZZ'},'2026-12-03':{code:'R',debut:'08:00'}},inconnu:{'2026-12-01':{code:'J'}}}},m);
 assert.deepEqual(n.personnes.map(p=>p.id),['a','b']);assert.deepEqual(n.affectations,{a:{'2026-12-01':{code:'J',fin:'19:00'},'2026-12-03':{code:'R'}}});
 assert.equal(P.joursDuMois('2026-02').length,28);assert.equal(P.moisVoisin('2026-12',1),'2027-01');assert.equal(P.moisVoisin('2026-01',-1),'2025-12');
 assert.ok(!P.valider({personnes:[]},m).ok);assert.ok(!P.valider({personnes:pers},'2026-13').ok);
 assert.match(P.valider({personnes:[...pers,{id:'c',nom:'Alice bis',userId:'u1'}]},m).errors.join(),/deux fois/);
});
test('horaires : nuit et garde à cheval sur deux jours',()=>{
 assert.equal(P.horaires({code:'N'}).duree,600);assert.equal(P.horaires({code:'G'}).duree,1440);assert.equal(P.horaires({code:'R'}),null);
 assert.equal(P.dureeHeures({code:'A'}),0,'astreinte non comptée comme travail');assert.equal(P.dureeHeures({code:'J',debut:'10:00',fin:'20:00'}),10);
});
test('alertes : repos de 11 h, 48 h par semaine, 6 jours d’affilée',()=>{
 assert.equal(P.alertes({personnes:pers,affectations:{a:{'2026-12-01':{code:'S'},'2026-12-02':{code:'M'}}}},m)[0].type,'repos','soir puis matin : 10 h de repos');
 assert.equal(P.alertes({personnes:pers,affectations:{a:{'2026-12-01':{code:'G'},'2026-12-02':{code:'J'}}}},m)[0].type,'repos','poste le lendemain d’une garde');
 assert.equal(P.alertes({personnes:pers,affectations:{a:{'2026-12-01':{code:'N'},'2026-12-02':{code:'N'},'2026-12-04':{code:'M'}}}},m).length,0);
 const semaine=Object.fromEntries(['07','08','09','10','11'].map(d=>['2026-12-'+d,{code:'J',debut:'07:00',fin:'17:30'}]));
 assert.ok(P.alertes({personnes:pers,affectations:{a:semaine}},m).some(a=>a.type==='heures'),'52,5 h');
 const sept=Object.fromEntries(['01','02','03','04','05','06','07'].map(d=>['2026-12-'+d,{code:'M'}]));
 assert.ok(P.alertes({personnes:pers,affectations:{a:sept}},m).some(a=>a.type==='consecutifs'));
});
test('effectifs et heures',()=>{
 const pl={personnes:pers,affectations:{a:{'2026-12-01':{code:'J'},'2026-12-02':{code:'R'}},b:{'2026-12-01':{code:'N'}}}};
 assert.deepEqual(P.effectifs(pl,m)['2026-12-01'],{total:2,J:1,N:1});assert.equal(P.effectifs(pl,m)['2026-12-02'].total,0);
 assert.deepEqual(P.heuresParPersonne(pl,m),{a:10,b:10});
});
test('vue des collègues : motif de santé et remarques masqués, sauf pour soi',()=>{
 const pl=P.normaliser({personnes:pers,affectations:{a:{'2026-12-01':{code:'MAL',note:'Arrêt'}},b:{'2026-12-01':{code:'MAL'},'2026-12-02':{code:'J',note:'Salle 3'}}}},m);
 const v=P.vueCollegue(pl,'u1');assert.deepEqual(v.affectations.a['2026-12-01'],{code:'MAL',note:'Arrêt'});assert.deepEqual(v.affectations.b['2026-12-01'],{code:'ABS'});assert.deepEqual(v.affectations.b['2026-12-02'],{code:'J'});
 assert.deepEqual(P.vueCollegue(pl,null).affectations.a['2026-12-01'],{code:'ABS'});
});
test('différences entre versions et empreinte stable',()=>{
 const a={personnes:pers,affectations:{a:{'2026-12-01':{code:'J'}}}},b={personnes:[pers[0],{id:'c',nom:'Chloé Fictif'}],affectations:{a:{'2026-12-01':{code:'G'}}}};
 const d=P.differences(a,b,m);assert.ok(d.includes('+ Chloé Fictif ajouté(e)'));assert.ok(d.includes('− Bruno Fictif retiré(e)'));assert.ok(d.some(x=>/01\/12 : J → G/.test(x)));
 assert.equal(P.canonique(P.normaliser(a,m)),P.canonique(P.normaliser(JSON.parse(JSON.stringify(a)),m)));
});

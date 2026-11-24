const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/annonce-patient.js');
const today=new Date('2026-11-24T10:00:00');
test('identité obligatoire pour créer le patient depuis l’annonce',()=>{
 assert.deepEqual(R.identityErrors({lastName:' ',firstName:'',birthDate:''},{today}),['Nom de naissance','Prénom','Date de naissance']);
 assert.deepEqual(R.identityErrors({lastName:'Martin',firstName:'Léa',birthDate:'1980-02-30'},{today}),['Date de naissance']);
 assert.deepEqual(R.identityErrors({lastName:'Martin',firstName:'Léa',birthDate:'2027-01-01'},{today}),['Date de naissance plausible']);
 assert.deepEqual(R.identityErrors({lastName:'Martin',firstName:'Léa',birthDate:'1980-02-12'},{today,needTeam:true}),['Équipe de soins']);
 assert.deepEqual(R.identityErrors({lastName:'Martin',firstName:'Léa',birthDate:'1980-02-12',careTeamId:'demo-clinique'},{today,needTeam:true}),[]);
});
test('séjour créé par l’annonce : identité provisoire tracée, étape consultation',()=>{
 const s=R.buildStay({lastName:' martin ',firstName:' Léa  Marie ',birthDate:'1980-02-12',specialty:'ORL',mode:'Hospitalisation',careTeamId:'demo-clinique',stage:'Sortie',extra:'x'},{id:'DÉMO-1',at:'24/11/2026',role:'Chirurgien'});
 assert.deepEqual(s.identity,{lastName:'MARTIN',firstName:'Léa Marie',birthDate:'1980-02-12'});
 assert.equal(s.stage,'Consultation');assert.equal(s.origin,'annonce');assert.equal(s.task,R.TASK_ANNONCE);assert.equal(s.careTeamId,'demo-clinique');
 assert.equal(s.mode,'Hospitalisation');assert.equal(s.specialty,'ORL');assert.equal(s.extra,undefined);
 assert.match(s.events[0].text,/identité provisoire/);
 assert.equal(R.buildStay({lastName:'a',firstName:'b',birthDate:'2000-01-01',specialty:'<script>'},{id:'x',at:'',role:''}).specialty,'Orthopédie');
});
test('état de la consultation vu depuis l’annonce',()=>{
 assert.equal(R.consultState({consult:{asa:'Non renseigné',history:'',plan:''}}).key,'afaire');
 assert.equal(R.consultState({}).key,'afaire');
 assert.equal(R.consultState({consult:{cpa:{poids:70}}}).key,'afaire');
 assert.equal(R.consultState({consult:{validated:true}}).key,'validee');
});

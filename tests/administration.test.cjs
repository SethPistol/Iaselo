// Circuit du médicament au lit (5e veille, lot 1) : posologie structurée, plan d'administration, 5 B.
process.env.TZ='Europe/Paris';
const test=require('node:test');const assert=require('node:assert/strict');
const A=require('../dist/administration-regles.js');
const P={cis:'60234100',medicament:'DOLIPRANE 1000 mg, comprimé',dose:'1',unite:'g',voie:'Orale',frequence:'4x',debut:'2026-11-28T06:00',fin:'2026-11-30T23:59'};
test('validation de la prescription structurée',()=>{
 assert.equal(A.valider({}).ok,false);
 const v=A.valider(P);assert.ok(v.ok,JSON.stringify(v.erreurs));assert.equal(v.posologie.dose,1);
 assert.match(A.libelle(v.posologie),/DOLIPRANE 1000 mg, comprimé · 1 g · Orale · 4 fois par jour \(0 h, 6 h, 12 h, 18 h\)/);
 assert.equal(A.valider({...P,frequence:'sb'}).ok,false,'si besoin sans intervalle');
 assert.ok(A.valider({...P,frequence:'sb',intervalleH:6,max24h:4}).ok);
 assert.equal(A.valider({...P,frequence:'perso',horaires:[]}).ok,false);
 assert.deepEqual(A.horaires(A.valider({...P,frequence:'perso',horaires:['22:00','09:30','25:00']}).posologie),['09:30','22:00']);
 assert.equal(A.valider({...P,fin:'2026-11-27T10:00'}).ok,false);
});
test('créneaux et états du plan',()=>{
 const p=A.valider(P).posologie;
 assert.deepEqual(A.creneaux(p,'2026-11-28T00:00','2026-11-28T23:59'),['2026-11-28T06:00','2026-11-28T12:00','2026-11-28T18:00']);
 const rx={validated:true,posologie:p,executions:[{at:'2026-11-28T06:05',status:'Réalisée',author:'IDE',prevu:'2026-11-28T06:00'}]};
 assert.equal(A.etatCreneau(rx,'2026-11-28T06:00','2026-11-28T13:30').etat,'donnee');
 assert.equal(A.etatCreneau(rx,'2026-11-28T12:00','2026-11-28T13:30').etat,'retard');
 assert.equal(A.etatCreneau(rx,'2026-11-28T12:00','2026-11-28T12:40').etat,'a-donner');
 assert.equal(A.etatCreneau(rx,'2026-11-28T18:00','2026-11-28T12:40').etat,'a-venir');
 const pl=A.plan([rx,{validated:false,posologie:p},{validated:true,name:'Texte libre'}],'2026-11-28T13:30');
 assert.equal(pl.lignes.length,1);assert.equal(pl.retard,1);assert.equal(pl.aDonner,0);
 assert.deepEqual(A.compteurs([rx],'2026-11-28T12:30'),{aDonner:1,retard:0});
 const unique=A.valider({...P,frequence:'unique',debut:'2026-11-28T09:00'}).posologie;
 assert.deepEqual(A.creneaux(unique,'2026-11-28T00:00','2026-11-29T00:00'),['2026-11-28T09:00']);
});
test('si besoin : intervalle et maximum sur 24 h',()=>{
 const p=A.valider({...P,frequence:'sb',intervalleH:6,max24h:2}).posologie,rx={validated:true,posologie:p,executions:[]};
 assert.equal(A.siBesoin(rx,'2026-11-28T10:00').possible,true);
 rx.executions.push({at:'2026-11-28T10:00',status:'Réalisée'});
 const s=A.siBesoin(rx,'2026-11-28T12:00');assert.equal(s.possible,false);assert.match(s.raison,/16 h/);
 rx.executions.push({at:'2026-11-28T16:30',status:'Réalisée'});
 assert.match(A.siBesoin(rx,'2026-11-28T23:00').raison,/Maximum de 2/);
 assert.equal(A.siBesoin(rx,'2026-11-29T11:00').possible,true);
});
test('contrôle des 5 B',()=>{
 const p=A.valider(P).posologie,rx={validated:true,posologie:p,executions:[]};
 const base={rx,stayId:'DÉMO-002',bracelet:'DÉMO-002',boite:{gtin:'03400930000000',valide:true,cis:'60234100',lot:'A12',peremption:'2027-05-31'},dose:'1 g',voie:'Orale',at:'2026-11-28T12:10',creneau:'2026-11-28T12:00',aujourdhui:'2026-11-28'};
 let c=A.controle5B(base);assert.equal(c.bloquant,false);assert.equal(c.aJustifier,false);assert.equal(c.points.length,5);
 assert.equal(A.controle5B({...base,bracelet:'DÉMO-003'}).bloquant,true);
 assert.equal(A.controle5B({...base,boite:{...base.boite,cis:'61111111'}}).bloquant,true);
 assert.equal(A.controle5B({...base,boite:{...base.boite,peremption:'2026-10-31'}}).bloquant,true);
 assert.equal(A.controle5B({...base,voie:'Intraveineuse'}).bloquant,true);
 c=A.controle5B({...base,dose:'2 g'});assert.equal(c.bloquant,false);assert.equal(c.aJustifier,true);
 c=A.controle5B({...base,bracelet:'',boite:null});assert.equal(c.bloquant,false);assert.equal(c.aJustifier,true);
 assert.equal(A.controle5B({...base,at:'2026-11-28T14:30'}).aJustifier,true);
 assert.equal(A.cipDepuisGtin('03400930000000'),'3400930000000');assert.equal(A.cipDepuisGtin('05012345678900'),'');
});
test('exécution tracée avec la dose prévue et les 5 B',()=>{
 const p=A.valider(P).posologie,rx={validated:true,posologie:p,executions:[]};
 const controle=A.controle5B({rx,stayId:'S',bracelet:'S',boite:{gtin:'03400930000000',valide:true,cis:p.cis},dose:'1 g',voie:'Orale',at:'2026-11-28T12:05',creneau:'2026-11-28T12:00',aujourdhui:'2026-11-28'});
 const r=A.execution({rx,statut:'Réalisée',at:'2026-11-28T12:05',auteur:'Inès IDE',dose:'1 g',voie:'Orale',creneau:'2026-11-28T12:00',controle});
 assert.ok(r.execution);assert.equal(r.execution.prevu,'2026-11-28T12:00');assert.equal(r.execution.controle5B.length,5);
 rx.executions.push(r.execution);
 assert.match(A.execution({rx,statut:'Réalisée',at:'2026-11-28T12:20',auteur:'X',dose:'1 g',voie:'Orale',creneau:'2026-11-28T12:00',controle}).erreur,/déjà donnée/);
 assert.match(A.execution({rx,statut:'Refusée',at:'2026-11-28T18:00',auteur:'X',creneau:'2026-11-28T18:00'}).erreur,/motif/);
 const bloque=A.controle5B({rx,stayId:'S',bracelet:'AUTRE',dose:'1 g',voie:'Orale',at:'2026-11-28T18:00',creneau:'2026-11-28T18:00'});
 assert.match(A.execution({rx,statut:'Réalisée',at:'2026-11-28T18:00',auteur:'X',dose:'1 g',voie:'Orale',creneau:'2026-11-28T18:00',controle:bloque}).erreur,/bloque/);
 assert.equal(A.execution({rx:{validated:false},statut:'Réalisée'}).erreur,'La prescription doit être validée par un médecin.');
});
test('surveillance des lits : doses en retard',()=>{
 const SC=require('../dist/surveillance-centrale-regles.js');
 const p=A.valider(P).posologie,now=new Date('2026-11-28T13:30');
 const s={id:'S',stage:'Hospitalisation',identity:{},postopVitals:[{at:new Date('2026-11-28T13:00').toISOString(),values:{}}],soinsPlus:{echelles:[{type:'braden',value:20,at:'x'},{type:'morse',value:10,at:'x'}]},rx:[{validated:true,posologie:p,executions:[]}]};
 const al=SC.alertes(s,now).filter(a=>a.type==='doses');
 assert.equal(al.length,1);assert.match(al[0].titre,/2 dose\(s\) en retard/);assert.match(al[0].detail,/06 h 00.*12 h 00/);
});

// Effectifs infirmiers liés au programme du bloc : besoin par jour, SSPI, comparaison au planning.
const {test}=require('node:test');const assert=require('node:assert/strict');
const E=require('../dist/effectifs-regles.js');
test('besoin : salles ouvertes, vacation libérée ignorée, pic SSPI',()=>{
 const vac=[{resource:'salle-1',start:'2026-12-01T08:00',end:'2026-12-01T19:00'},{resource:'salle-2',start:'2026-12-01T08:00',end:'2026-12-01T13:00'},{resource:'salle-3',start:'2026-12-02T08:00',end:'2026-12-02T13:00',liberee:{at:'x'}}];
 const res=[{resource:'salle-1',start:'2026-12-01T08:00',end:'2026-12-01T09:00',state:'Réservée'},{resource:'salle-2',start:'2026-12-01T08:30',end:'2026-12-01T09:30',state:'Réservée'},{resource:'salle-2',start:'2026-12-01T10:00',end:'2026-12-01T11:00',state:'Annulée'}];
 const b=E.besoins(vac,res,['2026-12-01','2026-12-02']);
 assert.equal(b['2026-12-01'].salles,2);assert.equal(b['2026-12-01'].picSspi,2);assert.equal(b['2026-12-01'].besoin,5);assert.equal(b['2026-12-01'].soir,true);assert.equal(b['2026-12-01'].interventions,2);
 assert.equal(b['2026-12-02'].besoin,0);
 const six=Array.from({length:6},(_,i)=>({resource:'salle-1',start:'2026-12-03T08:00',end:'2026-12-03T09:0'+i,state:'Réservée'}));
 assert.equal(E.besoins([],six,['2026-12-03'])['2026-12-03'].besoinSspi,2,'6 patients présents : 2 agents');
});
test('comparaison au planning : déficit, soir non couvert, synthèse',()=>{
 const b=E.besoins([{resource:'salle-1',start:'2026-12-01T08:00',end:'2026-12-01T19:00'}],[],['2026-12-01','2026-12-02']);
 const c=E.comparer(b,{'2026-12-01':{total:2,M:2},'2026-12-02':{total:1,J:1}});
 assert.equal(c['2026-12-01'].niveau,'warn',"2 prévus pour 2 : pas de déficit, mais pas de soir");assert.match(c['2026-12-01'].alertes[0],/19:00/);
 const d=E.comparer(E.besoins([{resource:'s1',start:'2026-12-01T08:00',end:'2026-12-01T12:00'},{resource:'s2',start:'2026-12-01T08:00',end:'2026-12-01T12:00'}],[],['2026-12-01']),{'2026-12-01':{total:3}});
 assert.equal(d['2026-12-01'].niveau,'crit');assert.equal(d['2026-12-01'].ecart,-1);
 assert.deepEqual(E.synthese(d),{joursDeficit:['2026-12-01'],joursVigilance:[],manqueTotal:1});
 assert.equal(c['2026-12-02'].niveau,'warn');
});

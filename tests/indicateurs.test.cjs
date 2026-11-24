'use strict';
// Indicateurs agrégés « Activité & occupation » : calculs purs, sans donnée identifiante.
const test=require('node:test'),assert=require('node:assert/strict'),I=require('../dist/indicateurs-regles.js');
const date='2026-11-24',now='2026-11-24T10:00';
const resources=[{id:'S1',label:'Salle 1',sector:'bloc-chir'},{id:'S2',label:'Salle 2',sector:'bloc-chir',open:false},{id:'R1',label:'SSPI 1',sector:'sspi-chir'},{id:'R2',label:'SSPI 2',sector:'sspi-chir'},{id:'L1',label:'Lit 1',sector:'etage-1'},{id:'L2',label:'Lit 2',sector:'etage-1'},{id:'L3',label:'Lit 3',sector:'etage-1'},{id:'L4',label:'Lit 4',sector:'etage-1'}];
const vacations=[{id:'V1',label:'Matin',resource:'S1',start:date+'T08:00',end:date+'T13:00',staffIds:['X']},{id:'V2',label:'Veille',resource:'S1',start:'2026-11-23T08:00',end:'2026-11-23T12:00'}];
const reservations=[
 {id:'A',patient:'P1',resource:'S1',start:date+'T08:00',end:date+'T09:30',state:'Terminée',recovery:{resource:'R1',start:date+'T09:30',end:date+'T11:00'}},
 {id:'B',patient:'P2',resource:'S1',start:date+'T09:45',end:date+'T11:15',state:'Occupée',phase:'primary'},
 {id:'C',patient:'P3',resource:'S1',start:date+'T11:30',end:date+'T12:00',state:'Annulée'},
 {id:'D',patient:'P4',resource:'L1',start:'2026-11-23T14:00',end:'2026-11-25T10:00',state:'Occupée'},
 {id:'E',patient:'P5',resource:'S1',start:date+'T11:30',end:date+'T12:30',state:'Réservée',bed:{resource:'L2',start:date+'T12:30',end:'2026-11-25T10:00'}}
];
const stays=[
 {id:'P1',stage:'SSPI',mode:'Ambulatoire',specialty:'Orthopédie',sector:'sspi-chir',identity:{lastName:'SECRET'}},
 {id:'P2',stage:'Intervention',mode:'Ambulatoire',specialty:'Orthopédie',sector:'bloc-chir'},
 {id:'P3',stage:'Consultation',mode:'Hospitalisation',specialty:'Orthopédie'},
 {id:'P4',stage:'Hospitalisation',mode:'Hospitalisation',specialty:'Urologie',sector:'etage-1'},
 {id:'P5',stage:'Sortie',mode:'Ambulatoire',specialty:'ORL'}
];
test('indicateurs : séjours par étape, mode et ambulatoire',()=>{
 const r=I.calculer({stays,reservations,resources,vacations,date,now});
 assert.equal(r.sejours.total,5);assert.equal(r.sejours.enCours,4);
 assert.deepEqual(r.sejours.parEtape.map(x=>x.n),[1,0,1,1,1,1]);
 assert.equal(r.sejours.tauxAmbulatoire,60);
});
test('indicateurs : petits effectifs regroupés (spécialités, secteurs)',()=>{
 const r=I.calculer({stays,reservations,resources,vacations,date,now});
 assert.deepEqual(r.sejours.parSpecialite,[{label:'Orthopédie',n:3},{label:'Autres (effectifs < 3)',n:2}]);
 assert.deepEqual(r.sejours.parSecteur,[{label:'Autres (effectifs < 3)',n:4}]);
});
test('indicateurs : occupation du bloc du jour, SSPI et lits maintenant',()=>{
 const r=I.calculer({stays,reservations,resources,vacations,date,now});
 assert.equal(r.bloc.salles,1,'salle fermée exclue');assert.equal(r.bloc.vacations,1);assert.equal(r.bloc.minutesOuvertes,300);
 assert.equal(r.bloc.interventions,3);assert.equal(r.bloc.minutesProgrammees,90+90+60);assert.equal(r.bloc.tauxOccupation,80);
 assert.equal(r.bloc.terminees,1);assert.equal(r.bloc.enSalle,1);assert.equal(r.bloc.annulees,1);
 assert.deepEqual(r.sspi,{places:2,occupees:0,taux:0},'réservation terminée : SSPI libérée');
 assert.deepEqual(r.lits,{places:4,occupees:1,taux:25});
});
test('indicateurs : aucune donnée identifiante dans le résultat',()=>{
 const out=JSON.stringify(I.calculer({stays,reservations,resources,vacations,date,now}));
 for(const s of ['SECRET','P1','P2','P4','"A"','Salle 1','Lit 1'])assert.ok(!out.includes(s),s);
});
test('indicateurs : données absentes ou abîmées',()=>{
 const r=I.calculer({stays:[null,{}],reservations:null,resources:'x',vacations:undefined,date,now});
 assert.equal(r.sejours.total,1);assert.equal(r.bloc.tauxOccupation,null);assert.deepEqual(r.lits,{places:0,occupees:0,taux:null});
});

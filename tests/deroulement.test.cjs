// Déroulement du programme opératoire (26/11/2026) : étapes du patient au bloc et contrôle des droits de l'infirmière de bloc.
const test=require('node:test'),assert=require('node:assert/strict');const D=require('../dist/deroulement-regles.js');
const base={id:'R1',patient:'S1',resource:'salle',start:'2026-11-26T08:00',end:'2026-11-26T09:15',duration:60,turnover:15,state:'Réservée',recovery:{resource:'sspi',start:'2026-11-26T09:00',end:'2026-11-26T10:00'},bed:{resource:'lit',start:'2026-11-26T10:00',end:'2026-11-26T19:00'}};
test('les quatre étapes font avancer le programme dans l’ordre',()=>{
 let r=base;assert.equal(D.prochaine(r),'arrivee');assert.equal(D.statut(r),'programme');
 assert.match(D.appliquer(r,'entree','2026-11-26T08:00').error,/Arrivée au bloc/);
 r=D.appliquer(r,'arrivee','2026-11-26T07:30').reservation;assert.equal(r.state,'Réservée');assert.equal(D.statut(r),'arrivee');
 assert.match(D.appliquer(r,'entree','2026-11-26T07:00').error,/suivre/);
 r=D.appliquer(r,'entree','2026-11-26T08:20').reservation;assert.equal(r.state,'Occupée');assert.equal(r.phase,'primary');assert.equal(r.actualStart,'2026-11-26T08:20');
 assert.equal(D.ecartEntree(r),20);assert.equal(D.retard(r,'2026-11-26T09:30'),10,'dépasse sa durée prévue');
 r=D.appliquer(r,'sortie','2026-11-26T09:20').reservation;assert.equal(r.phase,'recovery');assert.equal(r.actualEnd,'2026-11-26T09:20');
 r=D.appliquer(r,'sortieBloc','2026-11-26T10:10').reservation;assert.equal(r.state,'Occupée');assert.equal(r.phase,'bed');assert.equal(D.prochaine(r),'');
 const sansAval=D.appliquer(D.appliquer(D.appliquer({...base,recovery:undefined,bed:undefined},'arrivee','2026-11-26T07:30').reservation,'entree','2026-11-26T08:00').reservation,'sortie','2026-11-26T09:00').reservation;assert.equal(sansAval.state,'Terminée');
});
test('annuler la dernière étape restaure l’état précédent',()=>{
 let r=D.appliquer(D.appliquer(base,'arrivee','2026-11-26T07:30').reservation,'entree','2026-11-26T08:05').reservation;
 r=D.annuler(r,'2026-11-26T08:06').reservation;assert.equal(r.state,'Réservée');assert.equal(r.phase,undefined);assert.equal(r.actualStart,undefined);assert.equal(D.etapeCourante(r),'arrivee');
 assert.ok(r.transitions.some(t=>t.action==='annulation:entree'),'trace conservée');
 r=D.annuler(r,'2026-11-26T08:07').reservation;assert.equal(D.etapeCourante(r),'');assert.ok(D.annuler(r,'x').error);
});
test('retard et compatibilité avec les passages enregistrés avant l’écran',()=>{
 assert.equal(D.retard(base,'2026-11-26T08:25'),25);assert.equal(D.retard(base,'2026-11-26T07:50'),0);
 const ancien={...base,state:'Terminée',actualStart:'2026-11-26T08:00',actualEnd:'2026-11-26T09:00'};assert.equal(D.statut(ancien),'sortieBloc');
 assert.equal(D.statut({...base,proposition:true}),'nonConfirme');
});
test('infirmière de bloc : seulement le déroulement des passages existants',()=>{
 const old=[base,{...base,id:'R2',patient:'AUTRE'}],scope=r=>r.patient==='S1';
 const step=D.appliquer(base,'arrivee','2026-11-26T07:30').reservation;
 assert.equal(D.deroulementSeulement(old,[step],scope),true);
 assert.equal(D.deroulementSeulement(old,[{...step,start:'2026-11-26T09:00'}],scope),false,'ne déplace pas');
 assert.equal(D.deroulementSeulement(old,[{...step,resource:'autre'}],scope),false,'ne change pas de salle');
 assert.equal(D.deroulementSeulement(old,[step,{...base,id:'R3'}],scope),false,'ne programme pas');
 assert.equal(D.deroulementSeulement(old,[],scope),false,'ne déprogramme pas');
 assert.equal(D.deroulementSeulement(old,[{...base,state:'Annulée'}],scope),false,'n’annule pas');
 assert.equal(D.deroulementSeulement(old,[{...step,etapes:{pirate:'x'}}],scope),false);
});

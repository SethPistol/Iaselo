'use strict';
// Ouverture des salles : partie infirmière et partie anesthésie, contrôle avant signature, état de la salle.
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../dist/ouverture-salles-regles.js');
const tout=(part,v='conforme')=>Object.fromEntries(R.PARTIES[part].items.map(([k])=>[k,v]));
test('ouverture : items demandés par la clinique',()=>{
 assert.deepEqual(R.PARTIES.infirmier.items.map(([,l])=>l),['Traitement d’air','Environnement','Fluides médicaux','Éclairage','Négatoscope','Table d’opération','Bistouri électrique','Équipement spécifique']);
 assert.equal(R.PARTIES.anesthesie.items.length,14);
 for(const l of ['Pression des manomètres à gaz','Coupure automatique du N2O','Vaporisateur','Matériel d’intubation','Étanchéité du circuit'])assert.ok(R.PARTIES.anesthesie.items.some(([,x])=>x===l),l);
 assert.equal(R.PARTIES.infirmier.metier,'infirmier');assert.equal(R.PARTIES.anesthesie.metier,'anesthesiste');
});
test('ouverture : vérification complète, conclusion et commentaire exigés',()=>{
 assert.equal(R.erreur('infirmier',{items:tout('infirmier'),conclusion:'operationnelle'}),'');
 const partiel=tout('anesthesie');delete partiel.vaporisateur;assert.match(R.erreur('anesthesie',{items:partiel,conclusion:'operationnelle'}),/incomplète : Vaporisateur/);
 assert.match(R.erreur('infirmier',{items:tout('infirmier')}),/opérationnelle/);
 const ko={...tout('anesthesie'),alarmes:'non-conforme'};
 assert.match(R.erreur('anesthesie',{items:ko,conclusion:'operationnelle'}),/Décrivez le défaut.*Alarmes/);
 assert.equal(R.erreur('anesthesie',{items:ko,conclusion:'operationnelle',comment:'Alarme SpO2 remplacée, testée'}),'');
 assert.match(R.erreur('infirmier',{items:tout('infirmier'),conclusion:'non-operationnelle'}),/pourquoi/);
 assert.match(R.erreur('infirmier',{items:{...tout('infirmier'),inconnu:'conforme'},conclusion:'operationnelle'}),/inconnu/);
 assert.match(R.erreur('autre',{}),/Partie inconnue/);
});
test('ouverture : état de la salle selon la dernière signature de chaque partie',()=>{
 const r=(room,part,conclusion,at)=>({room,part,conclusion,at});
 assert.equal(R.etatSalle([],'S1').code,'a-faire');
 assert.equal(R.etatSalle([r('S1','infirmier','operationnelle','2026-11-24T06:00')],'S1').code,'partielle');
 assert.equal(R.etatSalle([r('S1','infirmier','operationnelle','2026-11-24T06:00'),r('S1','anesthesie','operationnelle','2026-11-24T06:10')],'S1').code,'ouverte');
 const refait=[r('S1','infirmier','non-operationnelle','2026-11-24T06:00'),r('S1','infirmier','operationnelle','2026-11-24T06:30'),r('S1','anesthesie','operationnelle','2026-11-24T06:10')];
 assert.equal(R.etatSalle(refait,'S1').code,'ouverte','la vérification refaite fait foi');
 assert.equal(R.etatSalle([r('S1','anesthesie','non-operationnelle','2026-11-24T06:10')],'S1').code,'non-operationnelle');
 const s=R.resume(refait,[{id:'S1'},{id:'S2'}]);assert.equal(s.ouvertes,1);assert.equal(s.total,2);
 // Vue infirmière : l'état ne porte que sur la partie infirmière.
 assert.equal(R.etatSalle([r('S1','infirmier','operationnelle','2026-11-24T06:00')],'S1',['infirmier']).code,'ouverte');
 assert.equal(R.etatSalle([],'S1',['infirmier']).label,'Partie infirmière à faire');
});

'use strict';
// Codage CCAM de l'intervention (modèle E-med) : activités, actes complémentaires, modificateurs, association, parts des praticiens.
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../dist/codage-ccam-regles.js');
const ix={version:'TEST',actes:[1],modificateurs:{K:{libelle:'K',majoration:0.2},J:{libelle:'J',majoration:0},'7':{majoration:0.04},F:{forfait:19.06}},
 parCode:new Map([['MEMC005',{activites:'14',tarif:363.35,tarifs:{'1':363.35,'4':142.65},modificateurs:{'1':'JK','4':'7A'}}],['MEMC003',{activites:'14',tarifs:{'1':285.95,'4':127.6}}],['MEMA017',{activites:'14',tarifs:{'1':240,'4':90}}],['GELE001',{activites:'1',tarifs:{'1':50}}]])};
const codage=()=>({lignes:[
 {id:'a',code:'MEMC005',activites:{'1':{coche:true,modificateurs:'KJ'},'4':{coche:true,modificateurs:'7'}},complements:{}},
 {id:'b',code:'MEMC003',activites:{'1':{coche:true,modificateurs:'KJ'},'4':{coche:true}},complements:{GELE001:{coche:true}}},
 {id:'c',code:'MEMA017',activites:{'1':{coche:true}},complements:{}}]});
test('codage CCAM : panneau du chirurgien comme dans E-med (modificateurs K J, association 1/2/0, total)',()=>{
 const p=R.panneau(codage(),'chirurgien',ix);
 assert.deepEqual(p.lignes.map(x=>[x.code,x.associationRetenue,x.montant]),[['MEMC005','1',436.02],['MEMC003','2',171.57],['MEMA017','0',0]]);
 assert.equal(p.total,607.59);
});
test('codage CCAM : panneau de l’anesthésiste avec acte complémentaire',()=>{
 const p=R.panneau(codage(),'anesthesie',ix);
 assert.deepEqual(p.lignes.map(x=>[x.code,x.activite,x.complement]),[['MEMC005','4',false],['MEMC003','4',false],['GELE001','1',true]]);
 assert.equal(p.lignes[0].montant,148.36);assert.equal(p.lignes[0].associationRetenue,'1');
});
test('codage CCAM : code d’association saisi, forfait, modificateur sans coefficient',()=>{
 const c=codage();c.lignes[2].activites['1'].association='4';c.lignes[0].activites['1'].modificateurs='KF';
 const p=R.panneau(c,'chirurgien',ix);
 assert.equal(p.lignes.find(x=>x.code==='MEMA017').montant,240);assert.equal(p.lignes.find(x=>x.code==='MEMC005').montant,arr(363.35*1.2+19.06));
 c.lignes[1].activites['1'].modificateurs='Z';assert.equal(R.panneau(c,'chirurgien',ix).lignes.find(x=>x.code==='MEMC003').modificateursSansTarif,'Z');
 function arr(n){return Math.round(n*100)/100}
});
test('codage CCAM : contrôles avant validation',()=>{
 const c=codage();assert.equal(R.erreurValidation(c,'chirurgien',ix),'');
 c.lignes[0].activites['1'].modificateurs='KA';assert.match(R.erreurValidation(c,'chirurgien',ix),/modificateur non autorisé/);
 assert.match(R.erreurValidation({lignes:[]},'anesthesie',ix),/Aucun acte coché/);
 const d=codage();d.lignes[0].activites['1'].association='1';d.lignes[1].activites['1'].association='1';assert.match(R.erreurValidation(d,'chirurgien',ix),/code d’association 1/);
});
test('codage CCAM : reprise de l’ancien format et lignes facturables',()=>{
 const ancien={actes:{chir:{code:'NEKA020',libelle:'PTH',confirme:true,by:'Dr C',at:'2026-11-20T10:00:00Z'},anes:{code:'NEKA020',confirme:true,by:'Dr A'}},decisions:{'acte:chir':{decision:'Validé'},I10:{decision:'Retenu'}}};
 const n=R.normaliser(ancien);assert.equal(n.lignes.length,1);assert.equal(n.lignes[0].activites['4'].coche,true);
 const l=R.lignesFacturables(ancien,null);assert.deepEqual(l.map(x=>[x.code,x.activite,x.confirme,x.dim]),[['NEKA020','1',true,'Validé'],['NEKA020','4',true,'']]);
});
test('codage CCAM : chaque praticien ne modifie que sa partie',()=>{
 const avant=codage(),chir=JSON.parse(JSON.stringify(avant));chir.lignes[0].activites['1'].modificateurs='K';chir.validations={'1':{par:'Dr C',at:'x'}};
 assert.equal(R.ecritureAutorisee('chirurgien',avant,chir),true);
 const triche=JSON.parse(JSON.stringify(avant));triche.lignes[0].activites['4'].modificateurs='7A';
 assert.equal(R.ecritureAutorisee('chirurgien',avant,triche),false,'le chirurgien ne touche pas à l’anesthésie');
 const supprime=JSON.parse(JSON.stringify(avant));supprime.lignes=supprime.lignes.filter(l=>l.id!=='b');
 assert.equal(R.ecritureAutorisee('chirurgien',avant,supprime),false,'ni ne retire un acte coché par l’anesthésiste');
 const ajout=JSON.parse(JSON.stringify(avant));ajout.lignes.push({id:'d',code:'GELE001',activites:{'1':{coche:true}}});
 assert.equal(R.ecritureAutorisee('chirurgien',avant,ajout),true);
 const dim=JSON.parse(JSON.stringify(avant));dim.decisions={'a:1':{decision:'Validé'}};
 assert.equal(R.ecritureAutorisee('anesthesiste',avant,dim),false,'décision DIM réservée au DIM');assert.equal(R.ecritureAutorisee('dim',avant,dim),true);
 assert.equal(R.ecritureAutorisee('chirurgien',dim,avant),true,'le chirurgien efface la décision DIM de sa ligne en rouvrant');
 assert.equal(R.ecritureAutorisee('anesthesiste',dim,avant),false);
});

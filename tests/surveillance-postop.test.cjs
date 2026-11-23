'use strict';
// Règles de la surveillance postopératoire en graphe : seuils, alertes, vérification de saisie, chronologie.
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../dist/surveillance-postop-regles.js');

test('Seuils : niveaux crit / warn / normal',()=>{
 assert.equal(S.niveau('sbp',85),'crit');assert.equal(S.niveau('sbp',95),'warn');assert.equal(S.niveau('sbp',120),'');assert.equal(S.niveau('sbp',185),'crit');
 assert.equal(S.niveau('spo2',89),'crit');assert.equal(S.niveau('spo2',93),'warn');assert.equal(S.niveau('spo2',96),'');
 assert.equal(S.niveau('pain',3),'');assert.equal(S.niveau('pain',4),'warn');assert.equal(S.niveau('pain',7),'crit');
 assert.equal(S.niveau('temp',38.4),'');assert.equal(S.niveau('temp',38.5),'warn');assert.equal(S.niveau('temp',34.9),'crit');
 assert.equal(S.niveau('rr',9),'crit');assert.equal(S.niveau('bladder',500),'warn');assert.equal(S.niveau('drain',250),'crit');
 assert.equal(S.niveau('hr',''),'');assert.equal(S.niveau('inconnu',3),'');
});

test('Alertes : surdosage morphinique, conscience, pansement, membre',()=>{
 const a=S.alertes({rr:8,sedation:'2'});
 assert.ok(a.some(x=>x.key==='morphine'&&x.niveau==='crit'));
 assert.equal(a[0].niveau,'crit','les alertes critiques passent en premier');
 assert.equal(S.alertes({avpu:'V'})[0].niveau,'crit');
 assert.equal(S.alertes({sedation:'3'})[0].niveau,'crit');
 assert.equal(S.alertes({dressing:'Saturé'})[0].key,'dressing');
 assert.equal(S.alertes({limb:'Anomalie'})[0].niveau,'crit');
 assert.deepEqual(S.alertes({sbp:120,dbp:70,hr:80,rr:16,spo2:97,temp:37,pain:2,avpu:'A',sedation:'0',dressing:'Sec'}),[]);
 assert.match(S.alertes({spo2:91,o2:'Oxygène'})[0].message,/sous oxygène/);
});

test('Alertes d’évolution : bloc moteur qui s’aggrave, oxygène croissant',()=>{
 assert.ok(S.alertes({bromage:'2'},{bromage:'1'}).some(x=>x.key==='bromage'&&x.niveau==='crit'));
 assert.ok(!S.alertes({bromage:'1'},{bromage:'2'}).some(x=>x.key==='bromage'));
 assert.ok(S.alertes({o2Flow:4},{o2Flow:2}).some(x=>x.key==='o2Flow'));
 const c=S.chronologie([{at:'2026-11-22T10:00',values:{bromage:'1'}},{at:'2026-11-22T12:00',values:{bromage:'3'}},{at:'2026-11-22T11:00',values:{hr:80}}]);
 assert.deepEqual(c.map(p=>p.values.bromage??null),['1',null,'3'],'tri chronologique');
 assert.ok(c[2].alertes.some(x=>x.key==='bromage'),'compare au dernier bloc moteur connu, même s’il n’est pas dans le relevé précédent');
});

test('Vérification de saisie',()=>{
 assert.equal(S.verifier({sbp:120,dbp:70,pain:3}),'');
 assert.match(S.verifier({sbp:80,dbp:90}),/diastolique/);
 assert.match(S.verifier({pain:3.5}),/entier/);
 assert.match(S.verifier({spo2:120}),/hors limites/);
 assert.match(S.verifier({sedation:'9'}),/cotation inconnue/);
 assert.match(S.verifier({o2:'Air',o2Flow:2}),/air ambiant/);
 assert.equal(S.verifier({temp:'37,5'}),'','virgule décimale acceptée');
 assert.equal(S.renseigne({location:'SSPI',at:'x',sbp:''}),false);
 assert.equal(S.renseigne({nvpo:'0'}),true);
});

test('Description et fenêtre de temps',()=>{
 assert.equal(S.decrire({sbp:120,dbp:70,hr:80,o2:'Air',miction:'Oui'}),'PA 120/70 mmHg · FC 80/min · Air ambiant · Miction : spontanée');
 const pts=S.chronologie([0,2,4,6,30].map(h=>({at:new Date(Date.UTC(2026,10,22,h)).toISOString(),values:{hr:80}})));
 assert.equal(S.fenetre(pts,24).points.length,2);assert.equal(S.fenetre(pts,0).points.length,5);
 assert.ok(S.graduations(0,24*3600e3).length<=9);
});

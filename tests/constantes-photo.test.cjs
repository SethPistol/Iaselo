'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const C=require('../dist/constantes-photo-regles.js');
const val=(row,k)=>row.values[k]?.value;

test('écran de moniteur : étiquettes et valeurs sur la même ligne, horloge et halogéné', ()=>{
 const r=C.parseMonitor(`14:32 Salle 3\nHR 72  SpO2 98\nNIBP 118/64 (82)\nEtCO2 35 RR 12\nT1 36.4 FiO2 45\nPEEP 5 Ppeak 18 VTe 480\nEtSEV 1.9`);
 assert.equal(r.mode,'moniteur');assert.equal(r.clock,'14:32');assert.equal(r.agent,'Sévoflurane');
 const row=r.rows[0];
 assert.deepEqual(['hr','spo2','sbp','dbp','map','etco2','rr','temp','fio2','peep','pip','vt','halogenEnd'].map(k=>val(row,k)),['72','98','118','64','82','35','12','36.4','45','5','18','480','1.9']);
});
test('écran de moniteur en grille : ligne d’étiquettes puis ligne de valeurs', ()=>{
 const row=C.parseMonitor(`FC SpO2 PNI\n72 98 118/64 (82)`).rows[0];
 assert.equal(val(row,'hr'),'72');assert.equal(val(row,'spo2'),'98');assert.equal(val(row,'sbp'),'118');assert.equal(val(row,'map'),'82');
});
test('EtCO2 et FiO2 ne sont pas confondus avec CO2 ou SpO2, confusions O/0 tolérées', ()=>{
 const row=C.parseMonitor(`Sp02 97 FiO2 50 EtC02 38`).rows[0];
 assert.equal(val(row,'spo2'),'97');assert.equal(val(row,'fio2'),'50');assert.equal(val(row,'etco2'),'38');
});
test('tendances imprimées : une mesure par horaire, colonnes suivant l’en-tête', ()=>{
 const r=C.parseTrend(`Tendances 22/11\nHeure FC SpO2 PNI EtCO2 T°\n14:00 74 99 121/66 (84) 36 36,5\n14:05 70 98 112/60 (77) 35 36,4\n14:10 68 97 95/52 (66) 34 36,3`);
 assert.equal(r.rows.length,3);assert.deepEqual(r.rows.map(x=>x.time),['14:00','14:05','14:10']);
 assert.equal(val(r.rows[2],'sbp'),'95');assert.equal(val(r.rows[2],'temp'),'36.3');assert.equal(val(r.rows[0],'etco2'),'36');
 assert.equal(C.parse(`Heure FC SpO2\n14:00 74 99\n14:05 70 98`).mode,'tendances');
});
test('caractère corrigé à la lecture signalé comme incertain', ()=>{
 const row=C.parseMonitor(`HR 7O`).rows[0];assert.equal(val(row,'hr'),'70');assert.equal(row.values.hr.fixed,true);
 assert.ok(C.checkValue('hr','70',row.values.hr).some(i=>i.level==='incertain'));
});
test('valeurs aberrantes, hors cible et incohérences signalées ; suggestion pour la température', ()=>{
 const t=C.checkValue('temp','364');assert.equal(t[0].level,'aberrant');assert.equal(t[0].suggestion,'36.4');
 assert.equal(C.checkValue('spo2','150')[0].level,'aberrant');
 assert.equal(C.checkValue('hr','130')[0].level,'cible');
 assert.deepEqual(C.checkValue('hr','72'),[]);
 assert.ok(C.checkValue('hr','72',{conf:40}).some(i=>i.level==='incertain'));
 const iss=C.rowIssues({sbp:{value:'60'},dbp:{value:'80'},map:{value:'70'}});
 assert.ok(iss.sbp.some(i=>i.level==='aberrant'));assert.ok(C.blocking(iss.dbp));
 assert.ok(C.rowIssues({sbp:{value:'120'},dbp:{value:'60'},map:{value:'140'}}).map.some(i=>i.level==='aberrant'));
 assert.equal(C.blocking([{level:'cible'}]),false);
});
test('horodatage : horloge du moniteur si proche de la photo, veille après minuit pour les tendances', ()=>{
 const photo=new Date(2026,10,22,14,40);
 assert.equal(C.monitorTime('14:32',photo).from,'horloge du moniteur');assert.equal(C.monitorTime('14:32',photo).at.slice(11),'14:32');
 assert.equal(C.monitorTime('03:10',photo).from,'heure de la photo');
 const d=C.stamp('23:50',new Date(2026,10,22,0,20));assert.equal(d.getDate(),21);
});
test('doublon : même minute et mêmes valeurs déjà dans la feuille', ()=>{
 const records=[{kind:'Surveillance',at:'2026-11-22T14:00',values:{hr:'74',spo2:'99'}}];
 assert.equal(C.isDuplicate('2026-11-22T14:00',{hr:'74'},records),true);
 assert.equal(C.isDuplicate('2026-11-22T14:00',{hr:'75'},records),false);
});

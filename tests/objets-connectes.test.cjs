// Objets connectés du télésuivi (4e veille, lot G) : mesures contrôlées, seuils, tendances. Patients FICTIFS.
const {test}=require('node:test');const assert=require('node:assert/strict');
const O=require('../dist/objets-connectes-regles.js');
test('mesures valides seulement',()=>{
 assert.ok(O.validerMesure({type:'spo2',valeur:'96',at:'2026-11-28T08:00'}).ok);
 assert.ok(!O.validerMesure({type:'spo2',valeur:'130',at:'2026-11-28T08:00'}).ok);assert.ok(!O.validerMesure({type:'glycemie',valeur:1,at:'2026-11-28T08:00'}).ok);assert.ok(!O.validerMesure({type:'temp',valeur:37,at:'hier'}).ok);
});
test('seuils, prise de poids, activité faible',()=>{
 const a=O.alertes([{type:'spo2',valeur:89,at:'2026-11-29T08:00'},{type:'temp',valeur:38.6,at:'2026-11-29T08:00'},{type:'poids',valeur:72,at:'2026-11-27T08:00'},{type:'poids',valeur:74.5,at:'2026-11-29T08:00'},{type:'pas',valeur:200,at:'2026-11-30T20:00'},{type:'fc',valeur:80,at:'2026-11-29T08:00'}],{sortie:'2026-11-27'});
 assert.equal(a[0].niveau,'crit');assert.match(a[0].titre,/Saturation/);assert.ok(a.some(x=>/Prise de poids de 2,5 kg/.test(x.titre)));assert.ok(a.some(x=>/J\+3/.test(x.titre)));assert.ok(!a.some(x=>x.type==='fc'));
});
test('simulation : série normale sans alerte, scénarios qui alertent',()=>{
 const ap=['tension','oxymetre','thermometre','balance','podometre'];
 assert.equal(O.alertes(O.simuler(ap,{depuis:'2026-11-28',jours:5}),{sortie:'2026-11-27'}).length,0);
 assert.ok(O.alertes(O.simuler(ap,{depuis:'2026-11-28',scenario:'desaturation'})).some(x=>x.niveau==='crit'));
 assert.ok(O.alertes(O.simuler(ap,{depuis:'2026-11-28',scenario:'poids'})).some(x=>x.type==='poids'));
 for(const m of O.simuler(ap,{depuis:'2026-11-28',scenario:'fievre'}))assert.ok(O.validerMesure(m).ok,JSON.stringify(m));
});

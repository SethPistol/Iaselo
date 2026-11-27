// Surveillance centralisée (4e veille, lot A) : alertes NEWS2, qSOFA, douleur, retard, Braden, Morse, dénutrition ; dictée infirmière. Patients FICTIFS.
const {test}=require('node:test');const assert=require('node:assert/strict');
const S=require('../dist/surveillance-centrale-regles.js');
const now=new Date('2026-11-27T14:00:00Z'),il=min=>new Date(now-min*60e3).toISOString();
const sejour=(o={})=>({id:'DÉMO-T',stage:'Hospitalisation',identity:{lastName:'fictif',firstName:'Test',birthDate:'1950-01-01'},consult:{},soinsPlus:{echelles:[]},postopVitals:[],...o});
test('sepsis possible : qSOFA ≥ 2 avec fièvre, NEWS2 critique',()=>{
 const s=sejour({postopVitals:[{at:il(30),values:{rr:'24',sbp:'95',hr:'118',spo2:'93',temp:'38.9',avpu:'A',o2:'Air'}}]});
 const a=S.alertes(s,now);assert.equal(a[0].niveau,'crit');assert.ok(a.some(x=>x.type==='sepsis'&&/qSOFA 2\/3/.test(x.titre)&&/38.9/.test(x.detail)));assert.ok(a.some(x=>x.type==='news2'&&x.niveau==='crit'));
});
test('retard de surveillance : SSPI après 30 min, service après 8 h ; aucune constante',()=>{
 assert.ok(S.alertes(sejour({stage:'SSPI',postopVitals:[{at:il(45),values:{hr:'80'}}]}),now).some(a=>a.type==='retard'&&a.niveau==='crit'&&/45 min/.test(a.titre)));
 assert.ok(!S.alertes(sejour({postopVitals:[{at:il(120),values:{hr:'80'}}]}),now).some(a=>a.type==='retard'));
 assert.ok(S.alertes(sejour({postopVitals:[{at:il(9*60),values:{hr:'80'}}]}),now).some(a=>a.type==='retard'&&a.niveau==='warn'));
 assert.ok(S.alertes(sejour(),now).some(a=>a.titre==='Aucune constante relevée'));
 assert.deepEqual(S.alertes(sejour({stage:'Consultation'}),now),[]);
});
test('échelles, douleur et dénutrition (HAS : IMC < 22 à partir de 70 ans)',()=>{
 const s=sejour({postopVitals:[{at:il(10),values:{pain:'7'}}],soinsPlus:{echelles:[{type:'braden',value:11,at:il(60)},{type:'morse',value:50,at:il(60)}]},consult:{ext:{weight:'55',height:'165'}}});
 const a=S.alertes(s,now),types=a.map(x=>x.type);
 assert.ok(types.includes('braden')&&types.includes('morse')&&types.includes('denutrition'));assert.equal(a.find(x=>x.type==='douleur').niveau,'crit');
 assert.ok(!S.alertes(sejour({identity:{birthDate:'1990-01-01'},consult:{ext:{weight:'55',height:'165'}}}),now).some(x=>x.type==='denutrition'));
 assert.ok(S.alertes(sejour(),now).some(x=>x.type==='echelles'));
});
test('tableau : alertes prises en charge mises de côté, tri par gravité',()=>{
 const grave=sejour({id:'A',postopVitals:[{at:il(5),values:{rr:'26',sbp:'88',temp:'39',avpu:'V'}}]});
 const vu=sejour({id:'B',postopVitals:[{at:il(5),values:{pain:'5'}}],soinsPlus:{echelles:[{type:'braden',value:20,at:il(1)},{type:'morse',value:0,at:il(1)}]}});
 const cle=S.alertes(vu,now).find(x=>x.type==='douleur').cle;vu.soinsPlus.alertesVues={[cle]:{at:il(1),par:'IDE'}};
 const t=S.tableau([vu,grave,sejour({id:'C',stage:'Sortie'})],now);
 assert.deepEqual(t.lignes.map(l=>l.stay),['A','B']);assert.equal(t.lignes[1].pire,'vu');assert.equal(t.critiques,1);
});
test('dictée infirmière : constantes reconnues, rien d’inventé',()=>{
 const r=S.extraireConstantes('Chambre 12, tension 125 sur 80, pouls 88, saturation 96 % en air ambiant, fréquence respiratoire 18, température 37,8 degrés, douleur 3 sur 10, patiente consciente, pansement sec, pas de nausée.');
 assert.deepEqual(r.valeurs,{sbp:125,dbp:80,hr:88,spo2:96,rr:18,temp:37.8,pain:3,o2:'Air',avpu:'A',dressing:'Sec',nvpo:'0'});
 assert.deepEqual(S.extraireConstantes('Patient installé en chambre 2 à 14 h.').valeurs,{});
 assert.equal(S.extraireConstantes('glycémie 145').valeurs.glycemia,1.45);
});

// Pilotage des sorties (4e veille, lot B) : étapes, tableau du jour, sortie infirmière sur protocole. Patients FICTIFS.
const {test}=require('node:test');const assert=require('node:assert/strict');
const S=require('../dist/sorties-regles.js');
const now=new Date('2026-11-27T09:00:00Z');
const sejour=(o={})=>({id:'DÉMO-S',stage:'Hospitalisation',mode:'Hospitalisation',identity:{lastName:'fictif',firstName:'Test'},postopVitals:[],...o});
test('étapes : rien de prêt, puis tout prêt',()=>{
 const e=S.etapes(sejour(),{aujourdhui:'2026-11-27'});
 assert.deepEqual(e.map(x=>x.id),['date','clinique','ordonnance','liaison','consignes','transport']);assert.ok(e.every(x=>!x.ok));
 const pret=sejour({sortiePlus:{sortiePrevue:'2026-11-27',aptitudeMedicale:{par:'Dr Démo'},transport:{mode:'Taxi conventionné',heure:'11:00'}},discharge:{ordinance:'x',liaison:{document:'y'},instructions:'Repos'}});
 assert.ok(S.etapes(pret,{aujourdhui:'2026-11-27'}).every(x=>x.ok));
});
test('ambulatoire : date du jour implicite, Chung ou protocole, accompagnant obligatoire',()=>{
 const s=sejour({mode:'Ambulatoire',stage:'SSPI',sortiePlus:{transport:{mode:'Proche'}}});
 const e=S.etapes(s,{aujourdhui:'2026-11-27'});
 assert.equal(e.find(x=>x.id==='date').detail,'2026-11-27');assert.equal(e.find(x=>x.id==='transport').ok,false);
 s.sortiePlus.transport.accompagnant='Conjoint';s.sortiePlus.chungSigne={by:'Dr Démo'};
 const e2=S.etapes(s,{aujourdhui:'2026-11-27'});assert.ok(e2.find(x=>x.id==='transport').ok&&e2.find(x=>x.id==='clinique').ok);
});
test('sortie sur protocole : prescrire, constater, autoriser seulement si tout est constaté',()=>{
 let sp=S.prescrire({},{par:'Dr Démo',criteres:['douleur','miction','inconnu']});
 assert.deepEqual(sp.protocole.criteres,['douleur','miction']);
 assert.throws(()=>S.prescrire({},{par:'x',criteres:['inconnu']}),/au moins un critère/);
 assert.throws(()=>S.constater(sp,'lever',true,'IDE'),/hors protocole/);
 sp=S.constater(sp,'douleur',true,'IDE Démo');
 assert.throws(()=>S.autoriser(sp,'IDE Démo'),/Miction spontanée.*Appelez le médecin/);
 sp=S.constater(sp,'miction',false,'IDE Démo');assert.throws(()=>S.autoriser(sp,'IDE Démo'));
 sp=S.constater(sp,'miction',true,'IDE Démo');sp=S.autoriser(sp,'IDE Démo');
 assert.equal(sp.sortieAutorisee.par,'IDE Démo');assert.equal(sp.sortieAutorisee.protocole,sp.protocole.at);
 const e=S.etapes(sejour({sortiePlus:sp}),{aujourdhui:'2026-11-27'});assert.ok(e.find(x=>x.id==='clinique').ok);
 // Une nouvelle prescription remet les constats à zéro.
 assert.equal(S.prescrire(sp,{par:'Dr Démo'}).sortieAutorisee,null);
});
test('constats proposés à partir du dernier relevé',()=>{
 const s=sejour({postopVitals:[{at:'2026-11-27T07:00',values:{pain:'6'}},{at:'2026-11-27T08:00',values:{pain:'2',dressing:'Sec',miction:'Oui',rr:'16',spo2:'97',o2:'Air',sbp:'125',hr:'78',temp:'36.8',avpu:'A'}}]});
 const c=S.constats(s);assert.equal(c.douleur,'ok');assert.equal(c.pansement,'ok');assert.equal(c.miction,'ok');assert.equal(c.constantes,'ok');
 assert.equal(S.constats(sejour({postopVitals:[{at:'x',values:{pain:'5',dressing:'Souillé',nvpo:'2'}}]})).alimentation,'non');
});
test('tableau : retard, aujourd’hui, demain ; les autres jours et les sortis exclus',()=>{
 const t=S.tableau([
  sejour({id:'D',sortiePlus:{sortiePrevue:'2026-11-28'}}),
  sejour({id:'A',sortiePlus:{sortiePrevue:'2026-11-27'}}),
  sejour({id:'R',sortiePlus:{sortiePrevue:'2026-11-25'}}),
  sejour({id:'X',sortiePlus:{sortiePrevue:'2026-12-03'}}),
  sejour({id:'Z',stage:'Sortie',sortiePlus:{sortiePrevue:'2026-11-27'}}),
  sejour({id:'C',stage:'Consultation'})
 ],now);
 assert.deepEqual(t.lignes.map(l=>l.stay),['R','A','D']);assert.equal(t.lignes[0].jour,'retard');assert.equal(t.bloques,2);assert.equal(t.prets,0);
 assert.ok(t.lignes[1].bloquants.includes('Ordonnance de sortie'));
});

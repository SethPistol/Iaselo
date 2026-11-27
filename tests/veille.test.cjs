'use strict';
// Règles issues de la veille marché : scores, consignes datées, complétude, check-list HAS, alertes J+1.
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../dist/veille-regles.js');
const stay=(over={})=>({id:'TEST',mode:'Hospitalisation',identity:{lastName:'MARTIN',firstName:'Camille',birthDate:'1950-01-01'},
 consult:{treatments:'',validated:false,ext:{sex:'Homme',age:'70',weight:'110',height:'175',surgeryDate:'2026-11-30',...over.ext},...over.consult},
 questionnaire:over.questionnaire,surgicalAnnouncement:over.surgicalAnnouncement,discharge:over.discharge||{},espacePatient:over.espacePatient});

test('STOP-Bang : critères calculés et déclarés, manquants signalés',()=>{
 const s=stay({questionnaire:{answers:{diseases:['Hypertension artérielle','Apnée du sommeil']}}});
 const sb=R.scores(s).list.find(x=>x.id==='stopbang');
 // Apnées, HTA, IMC > 35 (35,9), âge > 50, homme = 5
 assert.equal(sb.value,5);assert.equal(sb.level,'crit');assert.equal(sb.missing,3);
 const with3=R.scores(s,{snoring:true,tired:true,neck:false}).list.find(x=>x.id==='stopbang');
 assert.equal(with3.value,7);assert.equal(with3.missing,0);
});

test('Lee et Apfel : classes et risques',()=>{
 const s=stay({ext:{sex:'Femme',creatinine:'200',operation:'Chirurgie colorectale'},questionnaire:{answers:{diseases:['Insuffisance cardiaque'],nausea:'Oui',tobacco:'Non'}}});
 const l=R.scores(s).list.find(x=>x.id==='lee');assert.equal(l.value,3);assert.match(l.text,/Classe IV/);
 const a=R.scores(s,{opioids:true}).list.find(x=>x.id==='apfel');assert.equal(a.value,4);assert.match(a.text,/80 %/);
});

test('Consignes datées : apixaban selon le risque hémorragique, metformine la veille, bêtabloquant poursuivi',()=>{
 const base={consult:{treatments:'Eliquis 5 mg x2, Glucophage 1000, bisoprolol 5'}};
 let c=R.consignes(stay({...base,ext:{surgicalBleedingRisk:'Élevé'}}));
 const api=c.items.find(i=>i.id==='apixaban');assert.equal(api.lastDay,-3);assert.equal(api.lastDate,'2026-11-27');
 assert.equal(c.items.find(i=>i.id==='metformine').lastDate,'2026-11-29');
 assert.equal(c.items.find(i=>i.id==='betabloquant').kind,'continue');
 c=R.consignes(stay({...base,ext:{surgicalBleedingRisk:'Faible'}}));assert.equal(c.items.find(i=>i.id==='apixaban').lastDay,-2);
 // Risque non renseigné : délai long par prudence et mention explicite.
 c=R.consignes(stay(base));assert.equal(c.items.find(i=>i.id==='apixaban').lastDay,-3);assert.match(c.items.find(i=>i.id==='apixaban').assumption,/prudence/);
 // Dabigatran : délai allongé si DFG < 50.
 c=R.consignes(stay({consult:{treatments:'Pradaxa'},ext:{surgicalBleedingRisk:'Élevé',egfr:'40'}}));assert.equal(c.items[0].lastDay,-5);
 // Sans date opératoire, aucune date inventée.
 c=R.consignes(stay({...base,ext:{surgeryDate:''}}));assert.equal(c.items[0].lastDate,undefined);assert.match(c.items[0].text,/date opératoire/);
});

test('Complétude : programmation bloquée puis prête',()=>{
 let c=R.completude(stay({consult:{treatments:'Xarelto'}}));assert.equal(c.ready,false);assert.ok(c.blocking.some(i=>i.id==='traitements'));
 const ready=stay({consult:{treatments:'Xarelto',validated:true},ext:{identityReviewed:'Oui',patientAgreement:'Accord recueilli',testStatus:'Évalué — pas d’action retenue',fasting:'6 h'},questionnaire:{answers:{}},surgicalAnnouncement:{published:{fields:{procedure:'PTH'}}},espacePatient:{consentement:{envoi:{at:'2026-11-22T10:00:00Z'},recu:{mode:'signature',at:'2026-11-22T11:00:00Z'}}}});
 assert.equal(R.completude(ready,{}).ready,false);
 // Consentement d'anesthésie non reçu : bloquant.
 assert.ok(R.completude({...ready,espacePatient:null},{consignes:{validatedAt:'x'}}).blocking.some(i=>i.id==='consentementSigne'));
 c=R.completude(ready,{consignes:{validatedAt:'2026-11-22T10:00:00Z'}});assert.equal(c.ready,true,JSON.stringify(c.blocking));
 const ambu={...ready,mode:'Ambulatoire'};assert.equal(R.completude(ambu,{consignes:{validatedAt:'x'}}).ready,false);
});

test('Check-list HAS : un « Non » impose NO GO',()=>{
 const e=R.etatChecklist({incision:{answers:{croisee:'Oui',partage:'Oui',atb:'Non'}}});
 assert.equal(e.find(x=>x.id==='incision').nogo,true);assert.equal(e.find(x=>x.id==='incision').complete,true);assert.equal(e.find(x=>x.id==='induction').complete,false);
 assert.equal(R.CHECKLIST_HAS.reduce((n,t)=>n+t.items.length,0),12);
});

test('Suivi J+1 : alertes selon les seuils',()=>{
 assert.deepEqual(R.alertesJ1({douleur:'3',saignement:'Non'}),[]);
 const a=R.alertesJ1({douleur:'7',temperature:'38,6',mollet:'Oui'});assert.equal(a.length,3);assert.ok(a.some(x=>x.level==='crit'));
 // Seuils par défaut de l'équipe : douleur > 4, température < 36 ou > 38, « Oui » d'alerte, « Non » à la sécurité.
 assert.equal(R.alertesJ1({douleur:'4',temperature:'38'}).length,0);assert.equal(R.alertesJ1({douleur:'5'}).length,1);
 assert.equal(R.alertesJ1({temperature:'38.1'})[0].label,'Fièvre 38,1 °C');assert.match(R.alertesJ1({temperature:'35,9'})[0].label,/basse/);
 assert.equal(R.alertesJ1({moral:'Non'}).length,1);assert.equal(R.alertesJ1({moral:'Oui',nausees:'Non'}).length,0);assert.equal(R.alertesJ1({miction:'Oui'}).length,1);
 let v=R.validerJ1({douleur:'3',nausees:'Non'});assert.equal(v.ok,false);
 v=R.validerJ1({douleur:'3',nausees:'Non',saignement:'Non',miction:'Non',respiration:'Non',mollet:'Non',moral:'Oui'});assert.equal(v.ok,true);assert.equal(v.answers.temperature,undefined);
 assert.equal(R.validerJ1({douleur:'12',nausees:'Non',saignement:'Non',miction:'Non',respiration:'Non',mollet:'Non',moral:'Oui'}).ok,false);
});

test('Orientation après questionnaire et envoi DMP conditionné à l’INS qualifiée',()=>{
 assert.equal(R.orientation(stay({ext:{weight:'70'},questionnaire:{answers:{diseases:[]}}})).proposition.label,'Téléconsultation possible');
 assert.equal(R.orientation(stay({questionnaire:{answers:{diseases:['Insuffisance cardiaque']}}})).proposition.level,'crit');
 assert.equal(R.envoiLiaisonPossible(stay({discharge:{liaison:{document:{}}}}),'Provisoire').ok,false);
 assert.equal(R.envoiLiaisonPossible(stay({discharge:{liaison:{document:{}}}}),'Qualifiée').ok,true);
});

test('SMS de suivi : aucune information médicale ni identité',async()=>{
 const {suiviMessages,interopStatus}=await import('../worker/veille.mjs');
 for(const text of Object.values(suiviMessages('Clinique du Trocadéro'))){assert.ok(text.length<=320);assert.doesNotMatch(text,/MARTIN|anesth|opér|chirurg|hanche/i)}
 assert.ok(interopStatus({}).every(c=>c.mode==='simulation'));
});

test('risque global : ARISCAT, Caprini et profil avec mesures sourcées',()=>{
 const stay={identity:{birthDate:'1948-03-01'},consult:{ext:{sex:'Homme',weight:'95',height:'175',spo2:'94',hb:'9.5',operation:'Colectomie gauche',duration:'200'}},questionnaire:{answers:{diseases:['Phlébite ou embolie pulmonaire','Infarctus ou stent'],stairs:'1 étage'}}};
 const sc=R.scores(stay).list,ar=sc.find(s=>s.id==='ariscat'),ca=sc.find(s=>s.id==='caprini');
 assert.equal(ar.value,3+8+11+15+23);assert.equal(ar.level,'crit');assert.match(ar.text,/42,1 %/);
 assert.equal(R.scores(stay,{respInfection:true}).list.find(s=>s.id==='ariscat').value,ar.value+17);
 assert.equal(ca.value,3+1+2+3);assert.equal(ca.level,'crit');
 assert.equal(R.incision('Lobectomie supérieure droite'),'thorax');assert.equal(R.incision('Prothèse totale de genou'),'peripherique');
 const ptg={identity:{birthDate:'1956-01-01'},consult:{ext:{operation:'Prothèse totale de genou droite',duration:'90'}}};
 assert.equal(R.scores(ptg).list.find(s=>s.id==='caprini').criteria.find(c=>/Arthroplastie/.test(c.label)).value,true);
 const p=R.profilRisque(stay);assert.equal(p.niveau,'crit');assert.deepEqual(p.eleves,['Poumon','Thrombose']);
 assert.ok(p.mesures.some(m=>m.domaine==='Cœur'&&/ESC 2022/.test(m.ref)));assert.ok(p.mesures.every(m=>m.ref));
 const vide=R.profilRisque({});assert.ok(vide.manquants>0);assert.match(vide.avertissement,/jugement clinique/);
});

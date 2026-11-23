'use strict';
// Reprise du questionnaire patient dans la consultation : propositions, non-écrasement, alertes.
const test=require('node:test'),assert=require('node:assert/strict'),Q=require('../dist/questionnaire-reprise.js'),R=require('../dist/veille-regles.js');
const answers={birthname:'Bernard',firstname:'Noé',dob:'1993-02-08',weight:'92',height:'178',operation:'PTG droite',date:'2026-12-10',allergy:'Oui',allergyDetails:'Amoxicilline : urticaire',anesthesia:'Oui',anesthesiaDetails:'Mon père a fait une hyperthermie maligne',nausea:'Oui',travel:'Non',diseases:['Hypertension artérielle','Apnée du sommeil','Phlébite ou embolie pulmonaire'],devices:['Ventilation nocturne','Prothèse dentaire'],teeth:'Oui',stairs:'1 étage',tobacco:'Oui',cigarettes:'10',years:'20',alcohol:'1',drugs:'Non',bleeding:['Saignement prolongé après extraction dentaire'],treatments:'Médicament : Eliquis · Dosage : 5 mg · Matin : 1 · Soir : 1',medRows:[['Eliquis','5 mg','1','','1'],['Ramipril','5 mg','1','','']],questions:'Rentrer le jour même ?'};
const stay=(consult={})=>({id:'T',questionnaire:{answers:structuredClone(answers),received:'2026-11-22T10:00:00Z',reviewed:false},consult:{allergies:'À vérifier',ext:{},...consult}});
const opts={regles:R.REGLES,scores:R.scores,now:'2026-11-22T12:00:00Z'};
const by=(l,f)=>l.find(x=>x.field===f);

test('propose chaque réponse dans la bonne rubrique, marquée « Déclaré par le patient »',()=>{
 const l=Q.propositions(stay(),opts);
 assert.equal(by(l,'weight').value,'92');assert.equal(by(l,'age').value,'33');assert.equal(by(l,'surgeryDate').value,'2026-12-10');
 assert.match(by(l,'cardio').value,/^Déclaré par le patient \(questionnaire du 22\/11\/2026\) : Hypertension artérielle$/);
 assert.match(by(l,'respiratory').value,/Apnée du sommeil, Ventilation nocturne/);
 assert.match(by(l,'vteHistory').value,/Phlébite/);assert.match(by(l,'familyAnesthesia').value,/hyperthermie/);
 assert.match(by(l,'dentition').value,/prothèse dentaire/);assert.equal(by(l,'smokingStatus').value,'Actif');assert.equal(by(l,'packYears').value,'10');
 assert.equal(by(l,'metsCategory').value,'< 4 MET');assert.equal(by(l,'hemstopDone').value,'Oui');assert.match(by(l,'hemstopReview').value,/1\/7/);
 assert.match(by(l,'stopBangReview').value,/STOP-Bang : 2\/8/);assert.match(by(l,'patientQuestions').value,/jour même/);
 const meds=by(l,'medicationRows').value;assert.deepEqual(meds.map(m=>m.name),['Eliquis','Ramipril']);assert.equal(meds[0].classe,'Anticoagulant');assert.equal(meds[0].frequency,'Matin 1 · Soir 1');
 assert.ok(l.every(x=>x.checked));
});

test('n’écrase jamais une saisie du médecin',()=>{
 const s=stay({history:'HTA depuis 2010',ext:{weight:'90',cardio:'Déclaré par le patient (questionnaire du 22/11/2026) : Hypertension artérielle'},medicationRows:[{name:'Ramipril'}]});
 const l=Q.propositions(s,opts);
 assert.equal(by(l,'weight').mode,'keep');assert.equal(by(l,'weight').checked,false);assert.equal(by(l,'weight').current,'90');
 assert.equal(by(l,'history').mode,'append');assert.equal(by(l,'cardio').mode,'same');
 assert.deepEqual(by(l,'medicationRows').value.map(m=>m.name),['Eliquis']);
 const done=Q.appliquer(s,l,{recu:'22/11/2026',uuid:()=>'u'});
 assert.equal(s.consult.ext.weight,'90');assert.match(s.consult.history,/^HTA depuis 2010\n\nDéclaré par le patient/);
 assert.ok(!done.includes('cardio'));assert.ok(!done.includes('weight'));
 const added=s.consult.medicationRows.find(m=>m.name==='Eliquis');assert.equal(added.decision,'À déterminer');assert.equal(added.verification,'Déclaré par le patient');
 assert.equal(s.consult.ext.allergyReviewed,undefined,'le statut allergologique reste une décision médicale');
});

test('lignes décochées non reprises ; « À vérifier » remplacé',()=>{
 const s=stay(),l=Q.propositions(s,opts).map(x=>({...x,checked:x.field==='allergies'}));
 assert.deepEqual(Q.appliquer(s,l),['allergies']);assert.match(s.consult.allergies,/Amoxicilline/);assert.equal(s.consult.ext.weight,undefined);
});

test('alertes prioritaires : hyperthermie maligne, allergie antibiotique, anticoagulant',()=>{
 const a=Q.alertes(answers,R.REGLES),crit=a.filter(x=>x.level==='crit').map(x=>x.text).join('\n');
 assert.match(crit,/Hyperthermie maligne/);assert.match(crit,/antibioprophylaxie à adapter/);assert.match(crit,/Apixaban/);
 assert.ok(a.some(x=>/Capacité fonctionnelle déclarée faible/.test(x.text)));
});

test('ancien questionnaire sans lignes structurées : traitements relus depuis le texte',()=>{
 assert.deepEqual(Q.traitements({treatments:'Médicament : Kardégic · Dosage : 75 mg · Midi : 1\nMédicament : Levothyrox'}),[{name:'Kardégic',dose:'75 mg',frequency:'Midi 1'},{name:'Levothyrox',dose:'',frequency:''}]);
});

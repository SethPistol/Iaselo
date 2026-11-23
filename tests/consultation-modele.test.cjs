'use strict';
// Consultation sur le modèle « pré-anesthésique simplifiée » : questionnaire → champs, non-écrasement, ancienne trame.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../dist/consultation-modele-regles.js');
const answers={birthname:'Bernard',firstname:'Noé',dob:'1993-02-08',weight:'92',height:'178',operation:'PTG droite',date:'2026-12-10',allergy:'Oui',allergyDetails:'Amoxicilline : urticaire',anesthesia:'Oui',anesthesiaDetails:'Mon père a fait une hyperthermie maligne',nausea:'Oui',travel:'Oui',diseases:['Hypertension artérielle','Apnée du sommeil','Phlébite ou embolie pulmonaire','Infarctus ou stent','Diabète'],devices:['Ventilation nocturne','Prothèse dentaire'],teeth:'Oui',stairs:'1 étage',tobacco:'Oui',cigarettes:'10',years:'20',alcohol:'1',drugs:'Non',bleeding:['Saignement prolongé après extraction dentaire','Hémorragie lors d’un accouchement'],medRows:[['Eliquis','5 mg','1','','1'],['Ramipril','5 mg','1','','']],operations:'2012 : appendicectomie',questions:'Rentrer le jour même ?'};
const q=()=>({answers:structuredClone(answers),received:'2026-11-22T10:00:00Z'});

test('chaque réponse du questionnaire va dans le champ correspondant du modèle',()=>{
 const {valeurs:v,questions}=C.depuisQuestionnaire(q());
 assert.equal(v.poids,'92');assert.equal(v.taille,'178');
 assert.deepEqual(v.allergenes,['Antibiotiques']);assert.equal(v.allergie_detail,'Amoxicilline : urticaire');
 assert.deepEqual(v.cardio,['HTA','Coronaropathie']);assert.deepEqual(v.resp,['SAOS appareillé']);
 assert.deepEqual(v.compl,['NVPO']);assert.deepEqual(v.famille,['Hyperthermie maligne']);assert.deepEqual(v.apfel,['Mal des transports']);
 assert.equal(v.tabac,'Fumeur actif');assert.equal(v.tabac_pa,'10');assert.equal(v.alcool,'Occasionnel');
 assert.equal(v.mets,'< 4 MET');assert.deepEqual(v.dentition,['Prothèse amovible']);
 assert.equal(v.hemstop.length,2);assert.match(v.hemstop[0],/^T — /);assert.match(v.hemstop[1],/^O — /);
 assert.equal(v.ttt_habituel,'Eliquis 5 mg — matin 1, soir 1\nRamipril 5 mg — matin 1');
 assert.match(v.atcd_detail,/phlébite ou embolie pulmonaire/);assert.match(v.atcd_detail,/diabète \(type et traitement à préciser\)/);
 assert.equal(v.atcd_chir,'2012 : appendicectomie');assert.equal(v.libelle,'PTG droite');assert.equal(v.date_interv,'2026-12-10');
 assert.equal(questions,'Rentrer le jour même ?');
 for(const [id,x] of Object.entries(v)){const f=C.TYPES[id];assert.ok(f,'champ inconnu '+id);if(f.ty==='checks')for(const o of x)assert.ok(f.o.includes(o),id+' : '+o);if(f.ty==='radio')assert.ok(f.o.includes(x),id+' : '+x)}
});

test('le questionnaire ne remplace jamais une saisie et ne touche pas aux décisions',()=>{
 const actuel={poids:'95',cardio:['Valvulopathie'],tabac:'Sevré',allergie_detail:'Latex : urticaire',asa:'ASA 2'};
 const prop={...C.depuisQuestionnaire(q()).valeurs,asa:'ASA 1',avis:"Pas de contre-indication à l'intervention",technique:['Anesthésie générale']};
 const {valeurs:v,marques,champs}=C.fusionner(actuel,prop);
 assert.equal(v.poids,'95');assert.equal(v.tabac,'Sevré');assert.equal(v.asa,'ASA 2');assert.equal(v.avis,undefined);assert.equal(v.technique,undefined);
 assert.deepEqual(v.cardio,['Valvulopathie','HTA','Coronaropathie']);assert.deepEqual(marques.cardio,['HTA','Coronaropathie']);
 assert.equal(v.allergie_detail,'Latex : urticaire\nAmoxicilline : urticaire');
 assert.ok(!champs.includes('poids')&&!champs.includes('tabac'));
 const encore=C.fusionner(v,prop);assert.deepEqual(encore.champs,[],'deuxième insertion sans effet');
});

test('« Pas d’antécédent médical » coché par le médecin n’est pas contredit',()=>{
 const {valeurs:v}=C.fusionner({atcd_none:["Pas d'antécédent médical"]},{cardio:['HTA']});
 assert.equal(v.cardio,undefined);
});

test('traitement habituel : seuls les médicaments absents sont ajoutés',()=>{
 const {valeurs:v}=C.fusionner({ttt_habituel:'Eliquis 5 mg — 1 matin et soir'},{ttt_habituel:'Eliquis 5 mg — matin 1, soir 1\nRamipril 5 mg — matin 1'});
 assert.equal(v.ttt_habituel,'Eliquis 5 mg — 1 matin et soir\nRamipril 5 mg — matin 1');
 assert.deepEqual(C.lignesTraitement(v).map(l=>l.name),['Eliquis 5 mg','Ramipril 5 mg']);
});

test('champs obligatoires du modèle',()=>{
 const m=C.manquants({});assert.ok(m.includes('asa')&&m.includes('mallampati')&&m.includes('identite'));
 assert.ok(!C.manquants({ttt_habituel:'Pas de traitement'}).includes('ttt_consignes'));
 assert.ok(!C.manquants({allergenes:['Latex']}).includes('allergie_statut'));
});

test('séjour : identité, intervention et parcours repris',()=>{
 const v=C.depuisSejour({identity:{lastName:'Martin',firstName:'Jeanne',birthDate:'1960-04-02',sex:'F'},mode:'Ambulatoire',surgicalAnnouncement:{published:{fields:{procedure:'Cure de hernie',date:'2026-12-01',surgeon:'Dr X'}}}},{medecin:'Dr Y'});
 assert.equal(v.identite,'MARTIN Jeanne, né(e) le 02/04/1960');assert.equal(v.sexe,'Femme');assert.equal(v.libelle,'Cure de hernie');
 assert.equal(v.hospit,'Ambulatoire');assert.equal(v.mar,'Y','le modèle ajoute lui-même « Dr »');assert.equal(C.age(v,'2026-11-23'),66);
});

test('ancienne trame reprise dans le modèle, puis champs dérivés pour les autres modules',()=>{
 const c={asa:'III',history:'Diabète de type 2',allergies:'Pénicilline',treatments:'Metformine 1 g',plan:'AG',ext:{weight:'70',height:'170',consultDate:'2026-11-20',author:'Dr A',operation:'Hernie',surgeryDate:'2026-12-01',urgency:'Programmée',careSetting:'Ambulatoire',mallampati:'II',smokingStatus:'Actif',technique:'Rachianesthésie',decision:'Prise en charge envisagée selon le plan documenté',criticalPoints:'Rien'}};
 const v=C.depuisAncienne(c);
 assert.equal(v.asa,'ASA 3');assert.equal(v.poids,'70');assert.equal(v.mar,'Dr A');assert.equal(v.urgence,'Programmée');assert.equal(v.hospit,'Ambulatoire');
 assert.equal(v.mallampati,'II');assert.equal(v.tabac,'Fumeur actif');assert.deepEqual(v.technique,['Rachianesthésie']);assert.equal(v.avis,"Pas de contre-indication à l'intervention");
 assert.match(v.atcd_detail,/Diabète de type 2/);assert.equal(v.allergie_detail,'Pénicilline');assert.equal(v.ttt_habituel,'Metformine 1 g');
 const {top,ext}=C.versAncienne({...v,allergenes:['Antibiotiques'],sexe:'Homme',identite:'DUPONT Jean, né le 01/01/1950',date_consult:'2026-11-20'});
 assert.equal(top.asa,'III');assert.equal(ext.weight,'70');assert.equal(ext.sex,'Homme');assert.equal(ext.age,'76');assert.equal(ext.operation,'Hernie');
 assert.equal(ext.smokingStatus,'Actif');assert.equal(ext.technique,'Rachianesthésie');assert.equal(ext.mallampati,'II');
 assert.match(top.allergies,/^Antibiotiques — Pénicilline/);assert.equal(ext.allergyReviewed,'Allergie(s) documentée(s)');
});

test('la trame intégrée garde le pont IASELO et charge jsPDF localement',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../dist/consultation-modele.html'),'utf8');
 assert.match(html,/window\.CPA=\{/);assert.match(html,/src="vendor\/jspdf\.umd\.min\.js"/);assert.doesNotMatch(html,/cdnjs/);
 assert.ok(fs.existsSync(path.join(__dirname,'../dist/vendor/jspdf.umd.min.js')));
 // Les champs du module de règles sont ceux de la trame.
 for(const id of Object.keys(C.TYPES))assert.ok(html.includes(`id:'${id}'`),id);
});

test('les éléments bloquants mènent au champ concerné',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../dist/consultation-modele.html'),'utf8');
 assert.match(html,/function aller\(id\)\{[\s\S]*?closest\('details'\)[\s\S]*?scrollIntoView[\s\S]*?focus[\s\S]*?cpa-flash/);
 const js=fs.readFileSync(path.join(__dirname,'../dist/parcours-v8.js'),'utf8');
 assert.match(js,/data-cpa-go=/);assert.match(js,/k==='medicationRows'\?'ttt_habituel'/);assert.match(js,/#cpa-gaps-go/);
 for(const id of C.manquants({}))assert.ok(html.includes(`id:'${id}'`),id);
});

// Information des proches et écran en chambre (4e veille, lot C) : SMS sans donnée médicale, accord du patient. Patients FICTIFS.
const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../dist/proches-chambre-regles.js');
test('SMS des proches : étape et heure seulement, aucune donnée médicale',()=>{
 const m=P.message('Clinique Test','Lina','bloc',{heure:'10:05'});
 assert.equal(m,'Clinique Test · Nouvelles de Lina : entrée au bloc opératoire à 10 h 05. Message automatique, ne pas répondre.');
 for(const e of ['bloc','reveil','chambre','sortie','attente']){const x=P.message('C','votre proche',e,{heure:'9:30'});assert.doesNotMatch(x,/intervention|opération|prothèse|douleur|diagnostic|anesthés/i);assert.ok(x.length<200)}
 assert.throws(()=>P.message('C','x','inconnue'));
 assert.equal(P.etapeDepuisStage('SSPI'),'reveil');assert.equal(P.etapeDepuisStage('Consultation'),'');
});
test('accord du patient obligatoire, portables vérifiés, deux proches au plus',()=>{
 assert.match(P.valider({proches:[{prenom:'Marc',telephone:'0612345678'}]}).errors.join(),/accord du patient/);
 const v=P.valider({accord:true,proches:[{prenom:'Marc',telephone:'+33 6 12 34 56 78'}],appellation:'prenom'},{prenomPatient:'Lina'});
 assert.ok(v.ok);assert.equal(v.data.proches[0].telephone,'0612345678');assert.equal(v.data.appellation,'Lina');assert.deepEqual(v.data.etapes,['arrivee','bloc','reveil','chambre','sortie']);
 assert.match(P.message('Clinique','Lina','arrivee',{heure:'07:40'}),/arrivée à la clinique à 7 h 40/);
 assert.equal(P.valider({accord:true,proches:[{prenom:'Marc',telephone:'0612345678'}],appellation:'neutre'}).data.appellation,'votre proche');
 assert.ok(!P.valider({accord:true,proches:[{prenom:'A',telephone:'0145000000'}]}).ok);
 assert.ok(!P.valider({accord:true,proches:[1,2,3].map(i=>({prenom:'P'+i,telephone:'061234567'+i}))}).ok);
 assert.equal(P.masquer('0612345678'),'06 ** ** ** 78');
});
test('écran en chambre : demandes non urgentes, douleur 0-10, vue sans détail médical',()=>{
 assert.ok(!P.validerDemande({type:'douleur',valeur:11}).ok);assert.ok(!P.validerDemande({type:'autre',texte:''}).ok);assert.ok(!P.validerDemande({type:'pirate'}).ok);
 const d=P.validerDemande({type:'douleur',valeur:8}).demande;assert.equal(P.priorite(d),'crit');assert.equal(P.priorite({type:'boire'}),'info');
 const v=P.vueChambre({core:{stage:'Hospitalisation',mode:'Ambulatoire',identity:{firstName:'Lina',lastName:'FICTIF'}},sortiePlus:{chambre:'214',transport:{heure:'16:30',mode:'Proche',accompagnant:'Marc'}},discharge:{instructions:'Pas de douche 48 h',validated:false}},{aujourdhui:'2026-11-27',etapesSortie:[{id:'ordonnance',ok:false}]});
 assert.equal(v.prenom,'Lina');assert.equal(v.sortie.date,'2026-11-27');assert.equal(v.consignes,'');assert.equal(v.aFaire[0].libelle,'Ordonnance de sortie');assert.ok(!JSON.stringify(v).includes('FICTIF'));
 assert.equal(P.vueChambre({discharge:{instructions:'Pas de douche',validated:true}}).consignes,'Pas de douche');
});

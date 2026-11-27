// Reprise des dossiers E-med depuis les formats publics (HL7 v2, HPRIM Santé, FHIR R4, CSV) : patients FICTIFS.
const {test}=require('node:test');const assert=require('node:assert/strict');
const R=require('../dist/reprise-emed-regles.js');
const HL7=['MSH|^~\\&|EMED|CLINIQUE|IASELO|CLINIQUE|20261120101500||ADT^A28^ADT_A05|M1|P|2.5',
 'PID|1||E-1001^^^EMED^PI||FICTIF^Alice^^^^^L~MARTIN^Alice^^^^^D||19600512|F',
 'PV1|1|I|CHIR^101||||||||||||||||N-555',
 'AL1|1|DA|^Pénicilline|SV|Urticaire','AL1|2|DA|^Latex','DG1|1||I10^Hypertension essentielle^CIM10','PRB|AD|20261120|E11^Diabète de type 2',
 'RXE|1|^Bisoprolol 5 mg|1||cp','OBX|1|NM|29463-7^Poids^LN||72|kg','OBX|2|NM|8302-2^Taille^LN||165|cm','OBX|3|ST|883-9^Groupe ABO^LN||A+|',
 'MSH|^~\\&|EMED|CLINIQUE|IASELO|CLINIQUE|20261121101500||ADT^A31|M2|P|2.5','PID|1||E-1001^^^EMED^PI||FICTIF^Alice^^^^^L||19600512|F','AL1|1|DA|^Pénicilline|SV|Urticaire',
 'MSH|^~\\&|EMED|CLINIQUE|IASELO|CLINIQUE|20261121101500||ADT^A28|M3|P|2.5','PID|1||E-1002^^^EMED^PI||TEST^Bruno^^^^^L||19751103|M','AL1|1|DA|^Aucune'].join('\r');
test('HL7 v2 : plusieurs messages regroupés par patient, allergies, antécédents, traitements, mesures',()=>{
 const r=R.lire(HL7);assert.equal(r.format,'HL7 v2');assert.equal(r.patients.length,2);
 const a=r.patients[0];assert.equal(a.identite.nom,'FICTIF');assert.equal(a.identite.nomUsage,'MARTIN');assert.equal(a.identite.ipp,'E-1001');assert.equal(a.identite.naissance,'1960-05-12');
 assert.deepEqual(a.allergies,['Pénicilline (Urticaire)','Latex']);assert.deepEqual(a.antecedents,['Hypertension essentielle [I10]','Diabète de type 2']);
 assert.equal(a.traitements[0],'Bisoprolol 5 mg 1 cp');assert.equal(a.mesures.poids,72);assert.equal(a.mesures.taille,165);assert.equal(a.mesures.groupeSanguin,'A+');assert.equal(a.mesures.imc,26.4);
 assert.equal(a.venue.classe,'Hospitalisation');assert.equal(a.venue.nda,'N-555');
 const b=r.patients[1];assert.deepEqual(b.allergies,[]);assert.equal(b.aucuneAllergie,true);
});
test('HPRIM Santé : biologie rattachée au patient',()=>{
 const t='H|^~\\&|R1|LABO FICTIF|||||||||P|H2.2|20261120\nP|1|E-1001||N-1|FICTIF^Alice||19600512|F\nOBR|1|||NFS^Numération\nOBX|1|NM|HB^Hémoglobine^L||13.2|g/dL|12-16|N||F\nL|1';
 const r=R.lire(t);assert.equal(r.format,'HPRIM Santé');assert.equal(r.patients[0].biologie[0].resultats[0].valeur,'13.2');
});
test('FHIR R4 : Bundle Patient + allergie + condition + traitement + observations',()=>{
 const b={resourceType:'Bundle',type:'collection',entry:[{resource:{resourceType:'Patient',id:'p1',identifier:[{system:'urn:oid:1.2.250.1.213.1.4.10',value:'260058815400233'},{system:'urn:emed:ipp',value:'E-2001'}],name:[{use:'official',family:'Fictif',given:['Claire']}],gender:'female',birthDate:'1982-02-03'}},
  {resource:{resourceType:'AllergyIntolerance',patient:{reference:'Patient/p1'},code:{text:'Amoxicilline'},reaction:[{manifestation:[{text:'Œdème de Quincke'}]}]}},
  {resource:{resourceType:'Condition',subject:{reference:'Patient/p1'},code:{coding:[{code:'J45',display:'Asthme'}]}}},
  {resource:{resourceType:'MedicationStatement',subject:{reference:'Patient/p1'},medicationCodeableConcept:{text:'Salbutamol'},dosage:[{text:'si besoin'}]}},
  {resource:{resourceType:'Observation',subject:{reference:'Patient/p1'},code:{coding:[{system:'http://loinc.org',code:'29463-7',display:'Poids'}]},valueQuantity:{value:58,unit:'kg'}}},
  {resource:{resourceType:'Encounter',subject:{reference:'Patient/p1'}}}]};
 const r=R.lire(JSON.stringify(b));assert.equal(r.format,'FHIR R4');const p=r.patients[0];
 assert.equal(p.identite.ins,'260058815400233');assert.equal(p.identite.ipp,'E-2001');assert.equal(p.identite.nom,'FICTIF');assert.equal(p.identite.sexe,'Féminin');
 assert.deepEqual(p.allergies,['Amoxicilline (Œdème de Quincke)']);assert.deepEqual(p.antecedents,['Asthme']);assert.deepEqual(p.traitements,['Salbutamol si besoin']);assert.equal(p.mesures.poids,58);
 assert.ok(r.avertissements.some(a=>/Encounter/.test(a)));
});
test('CSV : modèle fourni lu, colonnes obligatoires vérifiées',()=>{
 const r=R.lire(R.MODELE_CSV,'export.csv');assert.equal(r.format,'CSV');const p=r.patients[0];
 assert.equal(p.identite.naissance,'1960-05-12');assert.deepEqual(p.antecedents,['HTA','Diabète de type 2']);assert.equal(p.traitements.length,2);assert.equal(p.mesures.groupeSanguin,'A+');
 assert.throws(()=>R.lire('Prénom;Ville\nA;B','x.csv'),/obligatoires/);assert.throws(()=>R.lire('bonjour'),/Format non reconnu/);
});
test('rapprochement et versement dans une consultation non commencée seulement',()=>{
 const p=R.lire(HL7).patients[0];
 const r=R.rapprocher(p,[{id:'S1',identity:{lastName:'FICTIF',firstName:'Alice',birthDate:'1960-05-12',ipp:'E-1001'}},{id:'S2',identity:{lastName:'AUTRE',birthDate:'1960-05-12'}}]);
 assert.equal(r.auto,'S1');
 const v=R.versConsultation({asa:'Non renseigné',allergies:'À vérifier',history:'',treatments:''},p);
 assert.match(v.consult.allergies,/^Pénicilline.*à relire/);assert.equal(v.consult.ext.weight,'72');assert.deepEqual(v.faits,['allergies','antécédents','traitements','poids','taille','groupe sanguin']);
 const deja=R.versConsultation({allergies:'Iode',cpa:{}},p);assert.deepEqual(deja.faits,[]);assert.match(deja.note,/déjà commencée/);
 assert.equal(R.versConsultation({allergies:'Iode'},p).consult.allergies,'Iode');
});

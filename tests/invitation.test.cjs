const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../dist/invitation-core.js');
test('profil Doctolib : libellés explicites, destinataires et identité sont extraits sans inventer les champs manquants',()=>{
 const c=C.parseProfile('Nom de naissance : MARTIN\nPrénom : Camille\nDate de naissance : 14/06/1985\nE-mail : camille@example.test\nTéléphone : 06 12 34 56 78');assert.equal(c.firstName,'Camille');assert.equal(c.lastName,'MARTIN');assert.equal(c.birthDate,'1985-06-14');assert.equal(c.phone,'+33612345678');assert.equal(c.email,'camille@example.test');
 const missing=C.parseProfile('Photo floue\nAucun détail lisible');assert.equal(missing.firstName,'');assert.equal(missing.birthDate,'');assert.equal(missing.email,'');
});
test('OCR : champs sur deux lignes, plusieurs coordonnées et dates impossibles restent vérifiables',()=>{
 const c=C.parseProfile('Nom :\nDUPONT\nPrénom :\nAlice\nDate de naissance : 31/02/1985\npatient@example.test\nclinique@example.test\n+33 (0)6 12 34 56 78');assert.equal(c.firstName,'Alice');assert.equal(c.lastName,'DUPONT');assert.equal(c.birthDate,'');assert.equal(c.emailCandidates.length,2);assert.equal(c.phone,'+33612345678');
 assert.match(C.contactError({firstName:'A',lastName:'B',birthDate:'1985-02-31',email:'a@example.test',phone:''}),/naissance/);
});
test('une identité divergente et des coordonnées absentes empêchent la préparation',()=>{
 const a={firstName:'Camille',lastName:'MARTIN',birthDate:'1985-06-14',email:'camille@example.test',phone:''};assert.equal(C.contactError(a),'');assert.equal(C.matchesIdentity(a,{...a,lastName:'DUPONT'}),false);assert.match(C.contactError({...a,email:''}),/nécessaire/);assert.equal(C.phone('0033 6 12 34 56 78'),'+33612345678');
});

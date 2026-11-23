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
test('captures Doctolib lues par OCR : en-tête, « née », formulaires en colonnes, application patient',()=>{
 const fiche=C.parseProfile('Agenda\ncm Mme Camille MARTIN\nNée DUPONT : 14/06/1985 (41 ans)\nTéléphone                 06 12 34 56 78\nMédecin traitant           Dr Paul LEFEBVRE');
 assert.deepEqual([fiche.firstName,fiche.lastName,fiche.usedName,fiche.birthDate],['Camille','DUPONT','MARTIN','1985-06-14']);
 const form=C.parseProfile("Civilité *\nMadame\nNom de naissance *                          Prénom(s) de naissance *\nDUPONT                                          Marie-Hélène Anne\nNom d'usage                            Prénom utilisé\nLEROY-DUPONT                     Marie-Hélène\nDate de naissance *                  Lieu de naissance\n03/09/1958                             Lyon");
 assert.deepEqual([form.firstName,form.lastName,form.usedName,form.birthDate],['Marie-Hélène','DUPONT','LEROY-DUPONT','1958-09-03']);
 const app=C.parseProfile("Informations personnelles\nPrénom\nÉloïse\nNom\nN'GUYEN\nDate de nalssance\n21/12/1999");
 assert.deepEqual([app.firstName,app.lastName,app.birthDate],['Éloïse',"N'GUYEN",'1999-12-21']);
 const table=C.parseProfile('M. Jean-Pierre DE LA FONTAINE\nNom de naissance                    DE LA FONTAINE\nPremier prénom de naissance       Jean-Pierre\nDate de naissance                    02/02/1947');
 assert.deepEqual([table.firstName,table.lastName,table.usedName],['Jean-Pierre','DE LA FONTAINE','']);
 const plain=C.parseProfile('Léa BÉRANGER-ÉTIENNE\nNée le 05/11/1972 (54 ans) - 06 20 30 40 50');
 assert.deepEqual([plain.firstName,plain.lastName,plain.birthDate],['Léa','BÉRANGER-ÉTIENNE','1972-11-05']);
 const inverse=C.parseProfile("Madame MARTIN Camille\nNé(e) le 14 juin 1985");
 assert.deepEqual([inverse.firstName,inverse.lastName,inverse.birthDate],['Camille','MARTIN','1985-06-14']);
});
test('OCR : le nom du médecin et les libellés voisins ne deviennent jamais l’identité du patient',()=>{
 const c=C.parseProfile('Médecin traitant   Dr Paul LEFEBVRE\nRendez-vous avec Dr Romain B.\nNom de naissance * Prénom *\n');
 assert.equal(c.firstName,'');assert.equal(c.lastName,'');
 const d=C.parseProfile('Mme Dr Sophie MARTIN');assert.equal(d.lastName,'');
});

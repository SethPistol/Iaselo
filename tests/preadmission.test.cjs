const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/preadmission-regles.js');
test('préadmission : type endoscopie ou chirurgie',()=>{
 assert.equal(P.typeSejour({core:{careTeamId:'endoscopie',specialty:'Gastro-entérologie'}}),'endoscopie');
 assert.equal(P.typeSejour({core:{specialty:'Gastro'},surgicalAnnouncement:{published:{fields:{procedure:'Gastroscopie et coloscopie'}}}}),'endoscopie');
 assert.equal(P.typeSejour({core:{specialty:'Urologie'},consult:{ext:{operation:'Résection endoscopique de prostate'}}}),'endoscopie');
 assert.equal(P.typeSejour({core:{specialty:'Orthopédie'},consult:{ext:{operation:'Prothèse totale de hanche'}}}),'chirurgie');
 assert.equal(P.typeSejour({core:{careTeamId:'endoscopie'},preadmissionPatient:{type:'chirurgie',typeSource:'admissions'}}),'chirurgie');
 assert.equal(P.typeSejour({core:{careTeamId:'endoscopie'},preadmissionPatient:{type:'chirurgie'}}),'endoscopie','type non choisi par les admissions : recalculé');
});
test('préadmission : étapes propres à chaque parcours',()=>{
 const e=P.etapes('endoscopie').map(x=>x.id),c=P.etapes('chirurgie').map(x=>x.id);
 assert.ok(e.includes('preparationColique')&&!e.includes('douches'));assert.ok(c.includes('douches')&&!c.includes('preparationColique'));
 assert.match(P.etapes('endoscopie').find(x=>x.id==='autorisation').titre,/endoscopie/);assert.match(P.etapes('chirurgie').find(x=>x.id==='autorisation').titre,/chirurgie/);
 const info=P.informations('chirurgie',{etablissement:'Clinique test'});for(const x of P.etapes('chirurgie').filter(x=>x.genre==='info'))assert.ok(info[x.id]?.sections.length,x.id);
});
test('préadmission : formulaire, pièces requises et état',()=>{
 const base={lieuNaissance:'Lyon',adresse:'1 rue',codePostal:'75016',ville:'Paris',coordonneesExactes:true,regime:'general',sansMutuelle:true,prevenir:{nom:'A',telephone:'0600000000'},confiance:'non',chambre:'double',retourAccompagne:'non'};
 let v=P.validerFormulaire(base);assert.equal(v.ok,true,v.errors.join());assert.equal(v.alertes.length,1);
 v=P.validerFormulaire({...base,confiance:'oui'});assert.deepEqual(v.manquants,['personneConfiance']);
 v=P.validerFormulaire({...base,coordonneesExactes:false,telephoneCorrige:'abc'});assert.ok(v.manquants.includes('telephoneCorrige'));
 assert.equal(P.formulaire({adresse:'<x>'.repeat(100),inconnu:'x'}).inconnu,undefined);
 assert.deepEqual(P.piecesRequises({formulaire:{mutuelle:'M'},naissance:'1980-01-01'}),['identiteRecto','identiteVerso','vitale','domicile','mutuelle']);
 assert.deepEqual(P.piecesRequises({formulaire:{sansMutuelle:true},naissance:'2015-01-01',passeport:true},new Date('2026-11-26')),['identiteRecto','vitale','domicile','parentale','livretFamille']);
 const at='2026-11-26T10:00:00Z',piece=k=>({id:k,piece:k,recuLe:at,controle:null});
 let d={formulaire:{...P.formulaire(base),soumisLe:at},pieces:['identiteRecto','identiteVerso','vitale'].map(piece)};
 assert.equal(P.etat(d,'chirurgie').code,'en-cours');assert.deepEqual(P.etat(d,'chirurgie').piecesManquantes,['domicile']);
 d.pieces.push(piece('domicile'));assert.equal(P.etat(d,'chirurgie').code,'faite');assert.equal(P.preadmissionFaite(d),true);
 d.pieces[2].controle={conforme:false,motif:'Illisible'};assert.equal(P.etat(d,'chirurgie').code,'a-completer');
 d.pieces.push(piece('vitale'));d.verification={at,by:'Admissions'};assert.equal(P.etat(d,'chirurgie').code,'verifiee');
 d.aCompleter={at,motif:'x'};assert.equal(P.etat(d,'chirurgie').code,'a-completer');d.aCompleter.reponduLe=at;assert.equal(P.etat(d,'chirurgie').code,'verifiee');
 assert.equal(P.etat({},'endoscopie').code,'a-faire');assert.equal(P.etat({},'endoscopie').pourcent,0);
});
test('préadmission : autorisation, messages sans donnée de santé, récapitulatif',()=>{
 assert.equal(P.validerAutorisation({qualite:'patient',signataire:'A B',certifie:true},{naissance:'1980-01-01'}).ok,true);
 assert.equal(P.validerAutorisation({qualite:'patient',signataire:'A B',certifie:true},{naissance:'2015-01-01'}).ok,false);
 assert.equal(P.validerAutorisation({qualite:'parent',signataire:'A B',certifie:true},{naissance:'2015-01-01'}).ok,false,'second parent requis');
 assert.match(P.texteAutorisation('endoscopie',{intervention:'Coloscopie'}),/Coloscopie.*biopsies/);
 const m=P.messages('Clinique test','https://x.test/preadmission.html#acces=a');assert.doesNotMatch(JSON.stringify(m),/endoscop|chirurg|anesth/i);assert.match(P.messages('C','l',{rappel:true}).sms,/rappel/);
 const h=P.recapHTML({formulaire:{adresse:'<script>',soumisLe:'2026-11-26T10:00:00Z'}},{patient:{nom:'fictif',prenom:'Test',naissance:'1980-01-01'},type:'endoscopie'});
 assert.match(h,/FICTIF/);assert.doesNotMatch(h,/<script>/);assert.match(h,/&lt;script&gt;/);
});

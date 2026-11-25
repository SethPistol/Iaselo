'use strict';
// Transmission du codage : services destinataires, actes confirmés, contrôles, état global.
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../dist/codage-transmis-regles.js');
test('codage transmis : services et métiers',()=>{
 assert.deepEqual(Object.keys(C.SERVICES),['secretariat','accueil','facturation','dim','autre']);
 assert.deepEqual(C.servicesDe('secretariat'),['secretariat','accueil']);assert.deepEqual(C.servicesDe('facturation'),['facturation']);
 assert.deepEqual(C.servicesDe('administration'),['autre']);assert.deepEqual(C.servicesDe('infirmier'),[]);
 assert.equal(C.libelleService('autre','Admissions'),'Autre : Admissions');
});
test('codage transmis : seuls les actes confirmés partent, sans diagnostic',()=>{
 const codage={actes:{chir:{code:'neka020',libelle:'PTH',confirme:true,by:'Dr B'},anes:{code:'NEKA020',confirme:false}},decisions:{'acte:chir':{decision:'Validé'},I10:{decision:'Retenu'}}};
 const a=C.actesConfirmes(codage);assert.equal(a.length,1);assert.deepEqual([a[0].code,a[0].activite,a[0].dim,a[0].confirmePar],['NEKA020','1','Validé','Dr B']);
 assert.ok(!JSON.stringify(a).includes('I10'));
 assert.deepEqual(C.actesConfirmes(null),[]);
});
test('codage transmis : contrôles avant envoi',()=>{
 const actes=[{code:'NEKA020',activite:'1',dim:''}];
 assert.equal(C.erreur({destinataires:['facturation']},actes),'');
 assert.match(C.erreur({destinataires:[]},actes),/au moins un service/);
 assert.match(C.erreur({destinataires:['pharmacie']},actes),/inconnu/);
 assert.match(C.erreur({destinataires:['autre'],autre:''},actes),/autre service/);
 assert.match(C.erreur({destinataires:['facturation']},[]),/Aucun acte confirmé/);
 assert.match(C.erreur({destinataires:['facturation']},[{code:'NEKA020',dim:'Rejeté'}]),/rejeté par le DIM/);
});
test('codage transmis : état global',()=>{
 assert.equal(C.etatGlobal({a:{etat:'traite'},b:{etat:'transmis'}}),'transmis');
 assert.equal(C.etatGlobal({a:{etat:'traite'},b:{etat:'traite'}}),'traite');
 assert.equal(C.etatGlobal({a:{etat:'traite'},b:{etat:'a-corriger'}}),'a-corriger');
});

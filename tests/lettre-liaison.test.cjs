const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../dist/lettre-liaison-regles.js');
const base={gpStatus:'Déclaré',gpMssante:'dr.x@medecin.mssante.fr',patientEnvoi:L.PATIENT_ENVOI[0],dmpInfo:L.DMP_INFO[0]};
const plan=(v,ctx={})=>Object.fromEntries(L.plan({...base,...v},{messagerie:true,contact:{email:'p***@ex.test'},...ctx}).map(x=>[x.cible,x.etat]));
test('lettre de liaison : destinataires prévus selon la lettre et les autorisations',()=>{
 assert.deepEqual(plan({}),{patient:'prevu',medecin:'simule',dmp:'simule'});
 assert.deepEqual(plan({},{mssanteMode:'production',dmpMode:'test',insQualifiee:true}),{patient:'prevu',medecin:'prevu',dmp:'prevu'});
 assert.equal(plan({},{dmpMode:'test',insQualifiee:false}).dmp,'a-faire');
 assert.equal(plan({gpMssante:''}).medecin,'a-faire');
 assert.equal(plan({gpMssante:'dr.x@gmail.com'}).medecin,'a-completer');
 assert.equal(plan({gpStatus:'Aucun déclaré'}).medecin,'sans-objet');
 assert.equal(plan({patientEnvoi:'Refus du patient'}).patient,'sans-objet');
 assert.equal(plan({},{contact:{}}).patient,'a-faire');
 assert.equal(plan({},{messagerie:false}).patient,'a-faire');
 assert.equal(plan({dmpInfo:'Opposition du patient'}).dmp,'sans-objet');
 assert.equal(plan({dmpInfo:''}).dmp,'a-completer');
});
test('lettre de liaison : MSSanté contrôlée, empreinte stable, messages sans donnée de santé',()=>{
 assert.ok(L.isMssante('Dr.X@chu-test.mssante.fr'));assert.ok(!L.isMssante('dr@mssante.fr.pirate.com'));
 assert.deepEqual(L.controlerDiffusion({gpMssante:'x@gmail.com'}).length,1);assert.equal(L.controlerDiffusion({}).length,0);
 assert.equal(L.canonique({date:'2026-11-21',values:{b:'2',a:'1'}}),L.canonique({date:'2026-11-21',values:{a:'1',b:'2'}}));
 assert.notEqual(L.canonique({date:'2026-11-21',values:{a:'1'}}),L.canonique({date:'2026-11-22',values:{a:'1'}}));
 const m=L.messages('Clinique test','https://x.test/lettre-liaison.html#acces=abc');
 assert.match(m.sms,/#acces=abc/);assert.doesNotMatch(JSON.stringify(m),/liaison de sortie|intervention|opér/i);
 const b=L.blocs({values:{reason:'Motif',gpMssante:'dr.x@medecin.mssante.fr',dmpInfo:L.DMP_INFO[0],doctor:'Dr Démo'},date:'2026-11-21'});
 assert.ok(b.some(x=>x.s==='Motif'));assert.ok(!JSON.stringify(b).includes('mssante'));assert.ok(!JSON.stringify(b).includes('DMP'));
 assert.match(L.documentHTML({values:{reason:'<script>'},date:'2026-11-21'}),/&lt;script&gt;/);
});

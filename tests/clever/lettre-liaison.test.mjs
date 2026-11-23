import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {createConnectors} from '../../server/interop/index.mjs';import {attendreEnvois} from '../../worker/lettre-liaison.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test lettre de liaison'});
const lettre=(extra={})=>({birthname:'FICTIF',firstname:'Test',dob:'1980-01-01',sex:'Homme',gpStatus:'Déclaré',gpName:'Dr Généraliste Fictif',gpContact:'1 rue fictive',gpMssante:'dr.fictif@medecin.mssante.fr',patientEnvoi:'Oui, par e-mail (lien sécurisé)',dmpInfo:'Informé, ne s’oppose pas',
 admission:'2026-11-20',admissionMode:'Programmée',departure:'2026-11-21',departureMode:'Domicile',doctor:'Dr Démo',unit:'Chirurgie',facility:'Clinique test',contact:'01 00 00 00 00',reason:'Cholécystectomie',summary:'Suites simples, œdème modéré.',condition:'Bon état',procedures:'Cœlioscopie',pending:'Aucun',medications:'Paracétamol 1 g × 4/j',changes:'Aucun',followup:'Consultation J30',surveillance:'Fièvre > 38,5 °C : appeler',...extra});
const discharge=(values,date='2026-11-21')=>({liaison:{document:{values,source:'{}',date}}});

async function setup(extra={}){
 const db=new PGlite(),pool=pgPool(db);await migrate(pool);await bootstrap(pool,env);const sent=[],mss=[];
 const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push({sms:m});return 'S1'},email:async m=>{sent.push({email:m});return 'E1'}};
 const app=await makeApp({pool,bucket:{},cfg:config(env),messaging,...extra(mss)});
 const call=async(method,route,data,cookie,o=origin)=>app(new Request(origin+route,{method,headers:{Origin:o,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
 const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
 const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
 const pub=async(route,data,o)=>{const r=await call('POST','/api/lettre-liaison/'+route,data,undefined,o);return {status:r.status,data:await r.json()}};
 const me=(await api('GET','')).data.user;
 assert.equal((await api('PUT','/document',edit('stay/L1/core',{id:'L1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}))).status,200);
 await api('PUT','/document',edit('stay/L1/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344',email:'patient.fictif@example.test'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
 return {db,pool,sent,mss,api,pub};
}
const byCible=s=>Object.fromEntries(s.envois.map(e=>[e.cible,e]));

test('lettre de liaison : envoi automatique à la validation (patient par lien, MSSanté et DMP simulés), une seule fois par version',async()=>{
 const {db,pool,sent,api,pub}=await setup(()=>({}));
 try{
  // Brouillon seul : rien ne part.
  assert.equal((await api('PUT','/document',edit('stay/L1/discharge',{liaison:{draft:lettre()}}))).status,200);await attendreEnvois();
  assert.equal(sent.length,0);
  // Validation de la relecture : envoi automatique.
  assert.equal((await api('PUT','/document',edit('stay/L1/discharge',discharge(lettre()),1))).status,200);await attendreEnvois();
  let s=(await api('GET','/lettre-liaison/status?stay=L1')).data,e=byCible(s);
  assert.equal(e.patient.statut,'envoye');assert.equal(e.patient.mode,'e-mail');
  assert.equal(e.medecin.statut,'simule');assert.match(e.medecin.ref,/^SIM-MSS-/);
  assert.equal(e.dmp.statut,'simule');assert.match(e.dmp.detail,/INS qualifiée/);
  assert.equal(sent.length,1);assert.equal(sent[0].email.to,'patient.fictif@example.test');assert.equal(sent[0].email.tag,'iaselo-lettre-liaison');
  assert.doesNotMatch(JSON.stringify(sent),/FICTIF|Cholécystectomie|1980|Paracétamol/);
  const token=sent[0].email.text.match(/#acces=([a-f0-9]{64})/)[1];
  // Réenregistrement de la même version (autre champ de la sortie) : pas de nouvel envoi.
  assert.equal((await api('PUT','/document',edit('stay/L1/discharge',{...discharge(lettre()),summary:'note'},2))).status,200);await attendreEnvois();
  assert.equal(sent.length,1);
  // Patient : date de naissance, lettre et PDF.
  assert.equal((await pub('open',{token},'https://pirate.example')).status,403);
  let r=await pub('open',{token});assert.equal(r.status,200);assert.equal(r.data.lettre,undefined);
  assert.equal((await pub('view',{token,birthDate:'1981-01-01'})).status,400);
  r=await pub('view',{token,birthDate:'1980-01-01'});assert.equal(r.status,200);assert.equal(r.data.lettre.values.reason,'Cholécystectomie');assert.equal(r.data.lettre.values.gpMssante,undefined);
  const pdf=Buffer.from(r.data.pdf,'base64').toString('latin1');assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/%%EOF\n$/);assert.match(pdf,/Chol\\351cystectomie/);
  s=(await api('GET','/lettre-liaison/status?stay=L1')).data;assert.equal(s.lien.vues,1);assert.ok(s.lien.ouvertLe);
  // Nouvelle version relue : nouvel envoi, ancien lien fermé ; adresse MSSanté absente = « à transmettre », jamais d'e-mail au médecin.
  assert.equal((await api('PUT','/document',edit('stay/L1/discharge',discharge(lettre({summary:'Suites simples. Reprise du transit.',gpMssante:''})),3))).status,200);await attendreEnvois();
  assert.equal(sent.length,2);assert.equal((await pub('view',{token,birthDate:'1980-01-01'})).status,410);
  s=(await api('GET','/lettre-liaison/status?stay=L1')).data;e=byCible(s);assert.equal(e.medecin.statut,'a-faire');assert.match(e.medecin.detail,/aucun e-mail ordinaire/);assert.equal(s.historique.length,3);
  assert.ok(!JSON.stringify(sent).includes('medecin'));
  // Relance manuelle du patient (nouveau lien) ; refus et opposition respectés.
  r=await api('POST','/lettre-liaison/relancer',{stay:'L1',cible:'patient'});assert.equal(r.status,200);assert.equal(sent.length,3);
  assert.equal((await api('PUT','/document',edit('stay/L1/discharge',discharge(lettre({patientEnvoi:'Refus du patient',dmpInfo:'Opposition du patient',gpStatus:'Aucun déclaré'})),4))).status,200);await attendreEnvois();
  e=byCible((await api('GET','/lettre-liaison/status?stay=L1')).data);assert.equal(sent.length,3);
  assert.deepEqual([e.patient.statut,e.medecin.statut,e.dmp.statut],['sans-objet','sans-objet','sans-objet']);
  // Journal : envois tracés, destinataire masqué ; consultation par le patient.
  const {rows}=await pool.query("SELECT action,actor,result,detail FROM professional_access_log WHERE action LIKE 'lettre-liaison-%'");
  assert.ok(rows.some(x=>x.action==='lettre-liaison-envoi'&&x.result==='allowed'));assert.ok(rows.some(x=>x.action==='lettre-liaison-consultation'&&x.actor==='patient-lien'));
  assert.doesNotMatch(rows.map(x=>x.detail).join(' '),/33611223344|patient\.fictif|dr\.fictif/);
 }finally{await db.close()}
});

test('lettre de liaison : MSSanté en mode test envoie le PDF par le connecteur, jamais à une adresse hors mssante.fr',async()=>{
 const {db,sent,mss,api}=await setup(mss=>{const c=createConnectors({});return {interopEnv:{INTEROP_MSSANTE_MODE:'test'},connectors:{...c,mssante:{send:async m=>{mss.push(m);return {mode:'test',to:m.to}}}}}});
 try{
  assert.equal((await api('PUT','/document',edit('stay/L1/discharge',discharge(lettre({gpMssante:'Dr.Fictif@medecin.mssante.fr'}))))).status,200);await attendreEnvois();
  const e=byCible((await api('GET','/lettre-liaison/status?stay=L1')).data);
  assert.equal(e.medecin.statut,'envoye');assert.equal(e.medecin.mode,'test');assert.deepEqual(mss[0].to,['dr.fictif@medecin.mssante.fr']);
  assert.equal(mss[0].attachments[0].contentType,'application/pdf');assert.match(Buffer.from(mss[0].attachments[0].base64,'base64').toString('latin1'),/^%PDF/);
  assert.equal(sent.length,1);// e-mail patient seulement
  assert.equal((await api('POST','/lettre-liaison/relancer',{stay:'L1',cible:'medecin'})).status,409);
  await api('PUT','/document',edit('stay/L1/discharge',discharge(lettre({gpMssante:'dr.fictif@gmail.com'})),1));await attendreEnvois();
  const e2=byCible((await api('GET','/lettre-liaison/status?stay=L1')).data);assert.equal(e2.medecin.statut,'a-faire');assert.equal(mss.length,1);
 }finally{await db.close()}
});

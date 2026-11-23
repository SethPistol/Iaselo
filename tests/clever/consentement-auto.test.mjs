// Consentement d'anesthésie envoyé automatiquement dès la validation de la consultation (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {attendreConsentements} from '../../worker/espace-patient.mjs';
import R from '../../dist/espace-patient-regles.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test consentement automatique'});
const oui=Object.fromEntries(R.QUESTIONS.map(([id])=>[id,'oui']));

test('consentement : envoi automatique à la validation, sans double envoi, alerte sans coordonnées, retour signé au dossier',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push({sms:m});return 'S1'},email:async m=>{sent.push({email:m});return 'E1'}};
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  const doc=async key=>(await api('GET','')).data.documents.find(d=>d.key===key);
  const space=async stay=>(await api('GET','/espace-patient/status?stay='+stay)).data.espacePatient;
  const consult={asa:'2',validated:false,ext:{operation:'Prothèse totale de hanche',surgeryDate:'2099-12-03',consultDate:'2099-11-20',author:'Dr Exemple FICTIF'}};
  for(const stay of ['A1','A2']){
   await api('PUT','/document',edit('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}));
   await api('PUT','/document',edit('stay/'+stay+'/consult',consult));
  }
  // A1 : coordonnées vérifiées (téléphone et e-mail). A2 : aucune coordonnée.
  await api('PUT','/document',edit('stay/A1/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344',email:'patient.fictif@example.test'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));

  // Brouillon enregistré : rien ne part.
  let c=await doc('stay/A1/consult');
  await api('PUT','/document',edit('stay/A1/consult',{...c.data,plan:'Brouillon'},c.revision));await attendreConsentements();
  assert.equal(sent.length,0);

  // Validation (enregistrement groupé, comme le dossier partagé) : SMS + e-mail partent sans clic.
  c=await doc('stay/A1/consult');
  let r=await api('POST','/commit',{documents:[edit('stay/A1/consult',{...c.data,validated:true},c.revision)]});assert.equal(r.status,200,JSON.stringify(r.data));
  await attendreConsentements();
  assert.equal(sent.length,2);assert.equal(sent[0].sms.to,'+33611223344');assert.equal(sent[1].email.to,'patient.fictif@example.test');
  assert.equal(sent[0].sms.tag,'iaselo-consentement');assert.doesNotMatch(JSON.stringify(sent),/FICTIF|1980|2099|hanche/);
  let s=await space('A1');
  assert.equal(s.consentement.envoi.automatique,true);assert.deepEqual(s.consentement.envoi.channels,['sms','email']);
  assert.equal(s.consentement.envoi.fiche.intervention,'Prothèse totale de hanche');assert.equal(s.consentement.envoi.fiche.consultation.medecin,'Dr Exemple FICTIF');
  assert.equal(s.consentement.envoi.fiche.datePrevue,'2099-12-03');assert.equal(s.consentementAuto.ok,true);
  assert.equal(R.statut(s.consentement).code,'envoye');

  // Réenregistrement de la consultation validée, puis révision et nouvelle validation : aucun second envoi.
  c=await doc('stay/A1/consult');await api('PUT','/document',edit('stay/A1/consult',{...c.data,plan:'Ajout'},c.revision));
  c=await doc('stay/A1/consult');await api('PUT','/document',edit('stay/A1/consult',{...c.data,validated:false},c.revision));
  c=await doc('stay/A1/consult');await api('PUT','/document',edit('stay/A1/consult',{...c.data,validated:true},c.revision));
  await attendreConsentements();assert.equal(sent.length,2);

  // Le patient signe : le consentement revient dans le dossier, marqué reçu.
  const token=sent[0].sms.content.match(/#acces=([a-f0-9]{64})/)[1];
  const pub=async(route,data)=>{const x=await call('POST','/api/espace-patient/'+route,data);return {status:x.status,data:await x.json()}};
  assert.equal((await pub('view',{token,birthDate:'1980-01-01'})).status,200);
  r=await pub('consentement',{token,birthDate:'1980-01-01',reponses:oui,signataire:'Test FICTIF',lieu:'Paris',certifie:true});assert.equal(r.status,200,JSON.stringify(r.data));
  s=await space('A1');assert.equal(R.statut(s.consentement).recu,true);assert.equal(R.statut(s.consentement).code,'signe');

  // A2 sans coordonnées : rien ne part, alerte claire enregistrée au dossier.
  c=await doc('stay/A2/consult');
  await api('PUT','/document',edit('stay/A2/consult',{...c.data,validated:true},c.revision));await attendreConsentements();
  assert.equal(sent.length,2);
  s=await space('A2');assert.equal(s.consentementAuto.ok,false);assert.match(s.consentementAuto.raison,/Coordonnées vérifiées/);assert.equal(s.consentement,null);

  const {rows}=await pool.query("SELECT action,result,reason FROM professional_access_log WHERE action='consentement-envoi-auto'");
  assert.ok(rows.some(x=>x.result==='allowed'&&/SMS/.test(x.reason)));assert.ok(rows.some(x=>x.result==='denied'));assert.ok(rows.some(x=>/déjà envoyé/.test(x.reason)));
 }finally{await db.close()}
});

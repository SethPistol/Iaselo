// Rappels SMS automatiques : consentement non revenu à J-2 / J-1, SMS de nouvelles à J+1 (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {attendreConsentements} from '../../worker/espace-patient.mjs';
import R from '../../dist/espace-patient-regles.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test rappels automatiques'});
const oui=Object.fromEntries(R.QUESTIONS.map(([id])=>[id,'oui']));

test('rappels automatiques : J-2 / J-1 si le consentement n’est pas revenu, J+1 systématique, sans double envoi, alertes',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  // Les rappels de préadmission (J-7, J-3, J-1) ont leur propre test (preadmission.test.mjs) : écartés ici.
  const preadm=[],messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{(m.tag==='iaselo-preadmission'?preadm:sent).push({sms:m});return 'S1'},email:async m=>{(m.tag==='iaselo-preadmission'?preadm:sent).push({email:m});return 'E1'}};
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  const space=async stay=>(await api('GET','/espace-patient/status?stay='+stay)).data.espacePatient;
  // Lundi 23/11/2026, 10 h 30 à Paris.
  const now=new Date('2026-11-23T09:30:00Z');
  const stays={C2:['2026-11-25',true,'envoi'],C1:['2026-11-24',true,'signe'],C3:['2026-11-25',true,'jamais'],S1:['2026-11-22',true,'signe'],S2:['2026-11-22',false,'jamais'],X:['2026-11-30',true,'envoi']};
  for(const [stay,[date,contact,etat]] of Object.entries(stays)){
   await api('PUT','/document',edit('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}));
   if(contact)await api('PUT','/document',edit('stay/'+stay+'/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+336112233'+String(Object.keys(stays).indexOf(stay)).padStart(2,'0'),email:'patient.fictif@example.test'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
   await api('PUT','/document',edit('stay/'+stay+'/consult',{validated:etat!=='jamais',ext:{operation:'Intervention fictive',surgeryDate:date,consultDate:'2026-11-10',author:'Dr Exemple FICTIF'}}));
  }
  await attendreConsentements();
  for(const stay of ['C1','S1']){
   const token=sent.filter(m=>m.sms).map(m=>m.sms).find(m=>m.to.endsWith(String(Object.keys(stays).indexOf(stay)).padStart(2,'0'))).content.match(/#acces=([a-f0-9]{64})/)[1];
   const pub=async(route,data)=>{const x=await call('POST','/api/espace-patient/'+route,data);return x.status};
   assert.equal(await pub('view',{token,birthDate:'1980-01-01'}),200);
   assert.equal(await pub('consentement',{token,birthDate:'1980-01-01',reponses:oui,signataire:'Test FICTIF',certifie:true}),200);
  }
  sent.length=0;

  // Hors plage horaire (7 h à Paris) : rien.
  let r=await app.rappels({now:new Date('2026-11-23T06:00:00Z')});assert.equal(r.hors,true);assert.equal(sent.length,0);

  r=await app.rappels({now});
  const sms=sent.filter(m=>m.sms).map(m=>m.sms),to=i=>'+336112233'+String(i).padStart(2,'0');
  // C2 (J-2, envoyé non signé) : nouveau lien par SMS et e-mail.
  assert.ok(sms.some(m=>m.to===to(0)&&/rappel, un document est à signer/.test(m.content)&&/#acces=/.test(m.content)));
  assert.equal(sent.filter(m=>m.email).length,1);
  // S1 (opéré hier) : SMS de nouvelles, sans lien ni donnée de santé.
  const j1=sms.find(m=>m.to===to(3));assert.ok(j1);assert.match(j1.content,/^Clinique test : nous espérons que tout va bien depuis votre retour\. Merci de répondre à 8 questions rapides pour votre médecin : http/);assert.equal(j1.tag,'iaselo-suivi-j1');
  // Questionnaire J+1 : lien personnel, date de naissance, alerte au médecin selon les seuils.
  const tj1=j1.content.match(/suivi-j1\.html#acces=([a-f0-9]{64})/)[1];
  const q=async(route,data)=>{const x=await call('POST','/api/suivi-j1/'+route,{token:tj1,...data});return {status:x.status,data:await x.json()}};
  let o=await q('open',{});assert.equal(o.status,200);assert.equal(o.data.questions.length,8);assert.equal(o.data.etablissement,'Clinique test');
  const base={douleur:'3',nausees:'Non',saignement:'Non',miction:'Non',respiration:'Non',mollet:'Non',moral:'Oui'};
  assert.equal((await q('submit',{birthDate:'1981-01-01',answers:base})).status,400);
  assert.equal((await q('submit',{birthDate:'1980-01-01',answers:{douleur:'3'}})).status,400);
  o=await q('submit',{birthDate:'1980-01-01',answers:base});assert.equal(o.status,200);assert.equal(o.data.alerte,false);
  let al=(await api('GET','/suivi-j1/alertes')).data.alertes;assert.equal(al.length,0);
  o=await q('submit',{birthDate:'1980-01-01',answers:{...base,douleur:'6',temperature:'35.5',moral:'Non'}});assert.equal(o.data.alerte,true);
  al=(await api('GET','/suivi-j1/alertes')).data.alertes;assert.equal(al.length,1);assert.equal(al[0].stay,'S1');assert.equal(al[0].medecins.anesthesiste,'Dr Exemple FICTIF');
  assert.deepEqual(al[0].alertes[0].alerts.map(a=>a.label),['Douleur 6/10','Température basse 35,5 °C','Ne se sent pas en sécurité']);
  assert.equal((await api('POST','/suivi-j1/traiter',{stay:'S1',index:al[0].alertes[0].index,action:''})).status,400);
  assert.equal((await api('POST','/suivi-j1/traiter',{stay:'S1',index:al[0].alertes[0].index,action:'Patient rappelé'})).status,200);
  assert.equal((await api('GET','/suivi-j1/alertes')).data.alertes.length,0);
  assert.equal((await q('submit',{birthDate:'1980-01-01',answers:base})).status,200);assert.equal((await q('submit',{birthDate:'1980-01-01',answers:base})).status,409);
  // Rien pour C1 (signé), C3 (jamais envoyé : alerte), S2 (sans numéro : alerte), X (J-7).
  assert.equal(sms.length,2,JSON.stringify(sms.map(m=>m.to)));
  assert.doesNotMatch(JSON.stringify(sent),/FICTIF|1980|2026-11|fictive|douleur/);
  let s=await space('C2');assert.equal(s.consentement.relances.length,1);assert.equal(s.consentement.relances[0].by,'Envoi automatique IASELO');
  assert.deepEqual(s.rappelsAuto.map(e=>[e.kind,e.ok]),[['consentement-j-2',true]]);
  s=await space('S1');assert.ok(s.rappelsAuto.some(e=>e.kind==='suivi-j+1'&&e.ok));
  s=await space('C3');assert.equal(s.rappelsAuto[0].ok,false);assert.match(s.rappelsAuto[0].raison,/jamais été envoyé/);
  s=await space('S2');assert.equal(s.rappelsAuto[0].ok,false);assert.match(s.rappelsAuto[0].raison,/numéro de portable/);
  assert.equal(((await space('C1'))?.rappelsAuto||[]).length,0);

  // Passages suivants le même jour : aucun second envoi, pas d'alerte répétée.
  const logs=async()=>(await pool.query("SELECT count(*)::int AS n FROM professional_access_log WHERE actor='iaselo-automatique'")).rows[0].n,avant=await logs();
  sent.length=0;await app.rappels({now:new Date('2026-11-23T10:30:00Z')});await app.rappels({now:new Date('2026-11-23T15:00:00Z')});
  assert.equal(sent.length,0);assert.equal(await logs(),avant);

  // Le lendemain (J-1) : C2 toujours pas signé → second rappel ; numéro ajouté pour S2 trop tard (J+1 passé) → rien.
  await api('PUT','/document',edit('stay/S2/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33699999999'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  await app.rappels({now:new Date('2026-11-24T09:05:00Z')});
  assert.deepEqual(sent.filter(m=>m.sms).map(m=>m.sms.to),[to(0)]);
  s=await space('C2');assert.equal(s.consentement.relances.length,2);assert.deepEqual(s.rappelsAuto.map(e=>e.kind),['consentement-j-2','consentement-j-1']);

  // Échec Brevo (crédits SMS épuisés) : alerte au dossier, pas de nouvelle tentative automatique.
  sent.length=0;messaging.sms=async()=>{throw new Error('Crédits SMS insuffisants')};
  await api('PUT','/document',edit('stay/S3/core',{id:'S3',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}));
  await api('PUT','/document',edit('stay/S3/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33688888888'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  await api('PUT','/document',edit('stay/S3/consult',{ext:{surgeryDate:'2026-11-23'}}));
  await app.rappels({now:new Date('2026-11-24T09:10:00Z')});
  s=await space('S3');assert.equal(s.rappelsAuto[0].ok,false);assert.match(s.rappelsAuto[0].raison,/Crédits SMS/);
  const {rows}=await pool.query("SELECT action,result FROM professional_access_log WHERE actor='iaselo-automatique'");
  assert.ok(rows.some(x=>x.action==='suivi-j+1'&&x.result==='allowed'));assert.ok(rows.some(x=>x.action==='suivi-j+1'&&x.result==='denied'));assert.ok(rows.some(x=>x.action==='consentement-relance'));
  assert.ok((await pool.query("SELECT 1 FROM professional_access_log WHERE action='suivi-j1-reponse' AND result='denied'")).rows.length);
 }finally{await db.close()}
});

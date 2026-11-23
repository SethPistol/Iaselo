import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import R from '../../dist/prescriptions-preop-regles.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test prescriptions'});
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');

test('prescriptions préop : signature vérifiée, lien patient par SMS/e-mail sans donnée de santé, date de naissance, traçabilité',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push({sms:m});return 'S1'},email:async m=>{sent.push({email:m});return 'E1'}};
  const app=await makeApp({pool,bucket:{},cfg:config(env),messaging});
  const call=async(method,route,data,cookie,o=origin)=>app(new Request(origin+route,{method,headers:{Origin:o,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(email,password)=>(await call('POST','/auth/login',{email,password})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,c);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  const pub=async(route,data,o)=>{const r=await call('POST','/api/prescriptions/'+route,data,undefined,o);return {status:r.status,data:await r.json()}};
  assert.equal((await api('PUT','/document',edit('stay/P1/core',{id:'P1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}))).status,200);
  await api('PUT','/document',edit('stay/P1/consult',{asa:'2',allergies:'Aucune',ext:{surgeryDate:'2026-12-03'}}));
  await api('PUT','/document',edit('stay/P1/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344',email:'patient.fictif@example.test'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  const draft=R.normaliser({bilans:{ids:['nfs','iono'],avant:'2026-11-30'},premed:[{drug:'Hydroxyzine 25 mg',dose:'1 comprimé',moment:'La veille au soir'}],autres:'Apporter la PPC.'});
  // Non signé : refus.
  await api('PUT','/document',edit('stay/P1/prescriptionsPreop',{draft,signed:null,history:[]}));
  let r=await api('POST','/prescriptions/send',{stay:'P1',channels:['sms']});assert.equal(r.status,409);
  // Signature dont l'empreinte ne correspond plus au contenu : refus.
  const {rows:[u]}=await pool.query('SELECT user_id FROM professional_profiles LIMIT 1');
  const signed={at:new Date().toISOString(),name:'Dr Démo',userId:u.user_id,version:1,hash:await sha(R.canonique(draft))};
  await api('PUT','/document',edit('stay/P1/prescriptionsPreop',{draft:{...draft,autres:'modifié après signature'},signed,history:[]},1));
  r=await api('POST','/prescriptions/send',{stay:'P1',channels:['sms']});assert.equal(r.status,409);assert.match(r.data.error,/modifiées après la signature/);
  await api('PUT','/document',edit('stay/P1/prescriptionsPreop',{draft,signed,history:[]},2));
  assert.equal((await api('POST','/prescriptions/send',{stay:'P1',channels:['fax']})).status,400);
  r=await api('POST','/prescriptions/send',{stay:'P1',channels:['sms','email'],to:'+33600000000'});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(sent[0].sms.to,'+33611223344');assert.equal(sent[1].email.to,'patient.fictif@example.test');assert.equal(sent[0].sms.tag,'iaselo-prescriptions');
  // Aucun nom, intervention ni médicament dans les messages.
  const all=JSON.stringify(sent);assert.doesNotMatch(all,/FICTIF|Hydroxyzine|NFS|1980|2026-12-03/);
  const token=sent[0].sms.content.match(/#acces=([a-f0-9]{64})/)[1];assert.match(sent[1].email.text,new RegExp(token));
  // Patient : origine contrôlée, lien valide, date de naissance obligatoire.
  assert.equal((await pub('open',{token},'https://pirate.example')).status,403);
  r=await pub('open',{token});assert.equal(r.status,200);assert.equal(r.data.etablissement,'Clinique test');assert.equal(r.data.prescription,undefined);
  r=await pub('view',{token,birthDate:'1981-01-01'});assert.equal(r.status,400);assert.match(r.data.error,/Encore 4 essais/);
  r=await pub('view',{token,birthDate:'1980-01-01'});assert.equal(r.status,200);assert.deepEqual(r.data.prescription.contenu.bilans.ids,['nfs','iono']);assert.equal(r.data.prescription.patient.nom,'FICTIF');
  r=await api('GET','/prescriptions/status?stay=P1');assert.equal(r.data.links.length,1);assert.equal(r.data.links[0].views,1);assert.ok(r.data.links[0].firstViewedAt);assert.ok(r.data.links[0].active);
  // Nouvelle version envoyée : l'ancien lien est fermé.
  r=await api('POST','/prescriptions/send',{stay:'P1',channels:['sms']});assert.equal(r.status,200);
  assert.equal((await pub('view',{token,birthDate:'1980-01-01'})).status,410);
  const token2=sent.at(-1).sms.content.match(/#acces=([a-f0-9]{64})/)[1];
  // 5 erreurs de date de naissance : lien fermé.
  for(let i=0;i<4;i++)assert.equal((await pub('view',{token:token2,birthDate:'2000-01-01'})).status,400);
  assert.equal((await pub('view',{token:token2,birthDate:'2000-01-01'})).status,410);
  assert.equal((await pub('view',{token:token2,birthDate:'1980-01-01'})).status,410);
  // Désactivation manuelle et droits.
  r=await api('POST','/prescriptions/send',{stay:'P1',channels:['email']});const token3=sent.at(-1).email.text.match(/#acces=([a-f0-9]{64})/)[1];
  assert.equal((await api('POST','/prescriptions/revoke',{stay:'P1'})).status,200);assert.equal((await pub('open',{token:token3})).status,410);
  await createAccount(pool,{email:'autre@example.test',name:'Autre fictif',passwordHash:await hashPassword('Mot de passe test 2026')});
  const other=await login('autre@example.test','Mot de passe test 2026');
  assert.equal((await api('POST','/prescriptions/send',{stay:'P1',channels:['sms']},other)).status,403);
  assert.equal((await api('GET','/prescriptions/status?stay=P1',undefined,other)).status,403);
  // Journal : envois (destinataire masqué) et consultations par le patient.
  const {rows}=await pool.query("SELECT action,actor,result,detail FROM professional_access_log WHERE action LIKE 'prescriptions-%'");
  assert.ok(rows.some(x=>x.action==='prescriptions-envoi'&&x.result==='allowed'));assert.ok(rows.some(x=>x.action==='prescriptions-consultation'&&x.actor==='patient-lien'&&x.result==='allowed'));
  assert.doesNotMatch(rows.map(x=>x.detail).join(' '),/33611223344|patient\.fictif/);
 }finally{await db.close()}
});

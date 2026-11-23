import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test veille marché'});

test('veille : SMS J+1 via Brevo (numéro vérifié côté serveur), envoi DMP/MSSanté simulé et droits',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:false},establishment:'Clinique test',sms:async m=>{sent.push(m);return 'BREVO-1'}};
  const app=await makeApp({pool,bucket:{},cfg:config(env),messaging});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(email,password)=>(await call('POST','/auth/login',{email,password})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,c);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  assert.equal((await api('PUT','/document',edit('stay/V1/core',{id:'V1',careTeamId:'demo-clinique'}))).status,200);
  // Rubriques ajoutées : écriture autorisée pour l'anesthésiste.
  assert.equal((await api('POST','/commit',{documents:[edit('stay/V1/aideCpa',{inputs:{snoring:true}}),edit('stay/V1/checklistBloc',{induction:{answers:{identite:'Oui'}}}),edit('stay/V1/blocStatut',{state:'arrive'}),edit('stay/V1/suiviAmbu',{appels:[]})]})).status,200);
  // SMS : refusé sans numéro vérifié, puis envoyé au numéro enregistré (jamais celui de la requête).
  let r=await api('POST','/suivi/send',{stay:'V1',kind:'j+1',to:'+33600000000'});assert.equal(r.status,409);
  r=await api('PUT','/document',edit('stay/V1/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344',email:''},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));assert.equal(r.status,200,JSON.stringify(r.data));
  r=await api('POST','/suivi/send',{stay:'V1',kind:'j+1'});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(sent[0].to,'+33611223344');assert.doesNotMatch(sent[0].content,/FICTIF|Test/);assert.match(r.data.to,/\*/);
  assert.equal((await api('POST','/suivi/send',{stay:'V1',kind:'autre'})).status,400);
  // Lettre de liaison : refusée tant qu'elle n'est pas relue, puis envoi simulé (références SIM-).
  assert.equal((await api('POST','/interop/liaison',{stay:'V1',targets:['dmp']})).status,409);
  await api('PUT','/document',edit('stay/V1/discharge',{summary:'',instructions:'',validated:false,liaison:{document:{values:{}}}}));
  r=await api('POST','/interop/liaison',{stay:'V1',targets:['dmp','mssante-mt']});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.mode,'simulation');assert.ok(r.data.results.every(x=>x.ref.startsWith('SIM-')));
  assert.equal((await api('POST','/interop/liaison',{stay:'V1',targets:['fax']})).status,400);
  r=await api('GET','/interop/status');assert.deepEqual(r.data.connecteurs.map(c=>c.id),['insi','psc','dmp','mssante']);
  // Journal : envoi tracé avec destinataire masqué.
  const {rows}=await pool.query("SELECT action,detail FROM professional_access_log WHERE action IN ('suivi-j+1','interop-liaison') ORDER BY 1");assert.equal(rows.length,2);assert.doesNotMatch(rows.map(x=>x.detail).join(' '),/33611223344/);
  // Hors équipe de soins : refus.
  await createAccount(pool,{email:'autre@example.test',name:'Autre fictif',passwordHash:await hashPassword('Mot de passe test 2026')});
  const other=await login('autre@example.test','Mot de passe test 2026');
  assert.equal((await api('POST','/suivi/send',{stay:'V1',kind:'j-1'},other)).status,403);
  assert.equal((await api('POST','/interop/liaison',{stay:'V1',targets:['dmp']},other)).status,403);
  // Journal d'accès du séjour : lisible par l'équipe, refusé hors équipe.
  r=await api('GET','/journal?stay=V1');assert.equal(r.status,200);assert.ok(r.data.rows.some(x=>x.action==='suivi-j+1'));
  assert.equal((await api('GET','/journal?stay=V1',undefined,other)).status,403);
  // Bris de glace : soignant hors équipe, motif obligatoire, accès ouvert puis journalisé.
  const {rows:[o]}=await pool.query("SELECT id FROM auth_users WHERE email='autre@example.test'");await pool.query("UPDATE professional_profiles SET profession='infirmier' WHERE user_id=$1",[o.id]);
  assert.equal((await api('POST','/bris-de-glace',{stay:'V1',motif:'court'},other)).status,400);
  assert.equal((await api('POST','/bris-de-glace',{stay:'INCONNU',motif:'Urgence vitale en pleine nuit'},other)).status,404);
  r=await api('POST','/bris-de-glace',{stay:'V1',motif:'Urgence vitale en pleine nuit'},other);assert.equal(r.status,201,JSON.stringify(r.data));
  assert.equal((await api('GET','/journal?stay=V1',undefined,other)).status,200);
  assert.equal((await api('POST','/bris-de-glace',{stay:'V1',motif:'Urgence vitale en pleine nuit'},other)).status,409);
  r=await api('GET','/bris-de-glace');assert.equal(r.data.rows.length,1);assert.match(r.data.rows[0].reason,/Urgence vitale/);
  // Relances de préadmission J-7 : autorisées (rubrique preadmission), sans donnée de santé.
  r=await api('POST','/suivi/send',{stay:'V1',kind:'j-7'});assert.equal(r.status,200,JSON.stringify(r.data));assert.match(sent.at(-1).content,/dossier d’admission/);
  // Nouvelles rubriques : droits d'écriture.
  assert.equal((await api('POST','/commit',{documents:[edit('stay/V1/preadmission',{pieces:{}}),edit('stay/V1/periopPlus',{}),edit('stay/V1/peropRapide',{evenements:[]}),edit('stay/V1/soinsPlus',{}),edit('stay/V1/sortiePlus',{}),edit('stay/V1/codage',{}),edit('stay/V1/iaTrace',[]),edit('stay/V1/droitsRgpd',[])]})).status,200);
 }finally{await db.close()}
});

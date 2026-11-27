// Messagerie patient ↔ équipe : ouverture, notification sans contenu, date de naissance, assistant (urgence, conseils),
// non lus, réponse, un seul lien valide, fermeture, droits et traçabilité (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import A from '../../dist/messagerie-regles.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test messagerie'});

test('assistant : urgences repérées, conseils proposés, pas de faux positif',()=>{
 assert.equal(A.assistant('J’ai une douleur dans la poitrine depuis ce matin').urgence.signe,'douleur dans la poitrine');
 assert.equal(A.assistant('je n’arrive plus à respirer').urgence.signe,'gêne pour respirer');
 const a=A.assistant('Est-ce que je peux prendre une douche avant ?');assert.equal(a.urgence,null);assert.deepEqual(a.fiches.map(f=>f.id),['veille']);assert.ok(a.fiches[0].sections.length);
 assert.deepEqual(A.assistant('Ma cicatrice est un peu rouge, et j’ai mal').fiches.map(f=>f.id),['douleur','alerte']);
 assert.doesNotMatch(A.notification('Clinique X','https://x/m#acces=1','reponse'),/douleur|cicatrice/);
});

test('messagerie : ouverture, échanges, assistant, un seul lien valide, fermeture, droits',async()=>{
 const db=new PGlite(),pool=pgPool(db),sent=[];
 try{
  await migrate(pool);await bootstrap(pool,env);
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push(m);return 'S'},email:async m=>{sent.push(m);return 'E'}};
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:c});return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  await api('PUT','/document',edit('stay/M1/core',{id:'M1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}));
  await api('PUT','/document',edit('stay/M1/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  assert.equal((await api('POST','/messagerie',{stay:'M1',action:'repondre',texte:'Bonjour'})).status,409,'fermée');
  let o=await api('POST','/messagerie',{stay:'M1',action:'ouvrir'});assert.equal(o.status,200);assert.equal(o.data.notification.ok,true);
  assert.match(sent[0].content,/^Clinique test : votre équipe vous ouvre une messagerie sécurisée .*messagerie\.html#acces=[a-f0-9]{64} /);assert.equal(sent[0].tag,'iaselo-messagerie');
  const tok=m=>m.content.match(/#acces=([a-f0-9]{64})/)[1],t1=tok(sent[0]);
  const pub=async(route,data)=>{const x=await call('POST','/api/messagerie/'+route,data);return {status:x.status,data:await x.json()}};
  assert.equal((await pub('open',{token:t1})).status,200);
  assert.equal((await pub('fil',{token:t1,birthDate:'1981-01-01'})).status,400);
  let f=await pub('fil',{token:t1,birthDate:'1980-01-01'});assert.equal(f.status,200);assert.equal(f.data.messages.length,0);
  let e=await pub('envoyer',{token:t1,birthDate:'1980-01-01',texte:'Puis-je prendre une douche avec mon pansement ?'});assert.equal(e.status,200);
  assert.equal(e.data.assistant.urgence,null);assert.ok(e.data.assistant.fiches.length>=1);
  e=await pub('envoyer',{token:t1,birthDate:'1980-01-01',texte:'J’ai une douleur dans la poitrine'});assert.match(e.data.assistant.urgence.texte,/15/);
  // Équipe : liste avec non lus et urgence, lecture, réponse, nouvelle notification sans contenu, ancien lien révoqué.
  let l=await api('GET','/messagerie');assert.equal(l.data.conversations[0].nonLus,2);assert.equal(l.data.conversations[0].urgent,true);
  const fil=await api('GET','/messagerie?stay=M1');assert.equal(fil.data.messages.length,2);assert.equal(fil.data.messages[1].urgence.signe,'douleur dans la poitrine');
  assert.equal((await api('GET','/messagerie')).data.conversations[0].nonLus,0);
  sent.length=0;
  assert.equal((await api('POST','/messagerie',{stay:'M1',action:'repondre',texte:'Appelez le 15 sans attendre. Nous vous rappelons.'})).status,200);
  assert.equal(sent.length,1);assert.doesNotMatch(sent[0].content,/15 sans attendre|poitrine|douche/);assert.match(sent[0].content,/nouveau message de votre équipe/);
  assert.equal((await pub('fil',{token:t1,birthDate:'1980-01-01'})).status,410,'ancien lien révoqué');
  const t2=tok(sent[0]);f=await pub('fil',{token:t2,birthDate:'1980-01-01'});assert.equal(f.data.messages.at(-1).de,'equipe');assert.equal(f.data.messages.at(-1).par,'Dr Démo (recette)');
  // Fermeture : le patient ne peut plus écrire.
  assert.equal((await api('POST','/messagerie',{stay:'M1',action:'fermer'})).status,200);
  assert.equal((await pub('envoyer',{token:t2,birthDate:'1980-01-01',texte:'Encore une question'})).status,410);
  assert.equal((await api('PUT','/document',edit('stay/M1/messagerie',{ouverte:true,messages:[]}))).status,403,'rubrique écrite par le serveur');
  // Droits : secrétariat refusé ; 5 dates de naissance fausses bloquent le lien.
  const at=new Date().toISOString(),password='Mot de passe de test 2026',id=await createAccount(pool,{email:'secr@example.test',name:'Secr',passwordHash:await hashPassword(password)});
  await pool.query("UPDATE professional_profiles SET profession='secretariat',display_name='Secr',updated_at=$2 WHERE user_id=$1",[id,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
  await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);
  assert.equal((await api('GET','/messagerie',undefined,await login('secr@example.test',password))).status,403);
  sent.length=0;await api('POST','/messagerie',{stay:'M1',action:'ouvrir'});const t3=tok(sent[0]);
  for(let i=0;i<5;i++)await pub('fil',{token:t3,birthDate:'1999-01-01'});
  assert.equal((await pub('fil',{token:t3,birthDate:'1980-01-01'})).status,410);
  const actions=new Set((await pool.query("SELECT action FROM professional_access_log WHERE action LIKE 'messagerie-%'")).rows.map(r=>r.action));
  for(const a of ['messagerie-ouvrir','messagerie-repondre','messagerie-lecture','messagerie-patient','messagerie-fermer'])assert.ok(actions.has(a),a);
 }finally{await pool.end()}
});

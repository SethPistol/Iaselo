import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {migrate,postgresBinding,translateSQL} from '../../server/database.mjs';import {hashPassword,verifyPassword,bootstrap,createAccount} from '../../server/auth.mjs';import {config} from '../../server/config.mjs';import {makeApp,httpServer} from '../../server/index.mjs';
const origin='http://localhost:8080',password='Test uniquement 2026 !';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_NAME:'Compte fictif'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test export Clever Cloud'});
test('traduction SQL et configuration : paramètres et TLS applicatif',()=>{assert.equal(translateSQL("SELECT '?' AS q, x FROM t WHERE a=? AND b=?"),"SELECT '?' AS q, x FROM t WHERE a=$1 AND b=$2");assert.equal(translateSQL('INSERT OR IGNORE INTO t(a) VALUES(?)'),'INSERT INTO t(a) VALUES($1) ON CONFLICT DO NOTHING');assert.throws(()=>config({...env,NODE_ENV:'production'}),/HTTPS/);assert.throws(()=>config({...env,SESSION_SECRET:''}),/SESSION_SECRET/)});
test('PostgreSQL réel embarqué : migrations, authentification, dossiers, atomisme, questionnaire et redémarrage',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'parcours-pg-'));let db=new PGlite(directory),pool=pgPool(db);let server;
 try{
 await migrate(pool);await migrate(pool);const passwordHash=await hashPassword(password);assert.equal(await verifyPassword(password,passwordHash),true);assert.equal(await verifyPassword('incorrect',passwordHash),false);
 await bootstrap(pool,{...env,BOOTSTRAP_ADMIN_PASSWORD_HASH:passwordHash});await bootstrap(pool,{});
 let app=await makeApp({pool,bucket:{},cfg:config(env)});
 const call=async(method,route,data,cookie,extra={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
 assert.equal((await call('GET','/')).status,303);assert.equal((await call('GET','/api/workspace',undefined,undefined,{'oai-authenticated-user-id':'forged'})).status,401);
 assert.equal((await call('POST','/auth/login',{email:env.BOOTSTRAP_ADMIN_EMAIL,password},undefined,{Origin:'https://foreign.test'})).status,403);
 assert.equal((await call('POST','/auth/login',{email:env.BOOTSTRAP_ADMIN_EMAIL,password:'incorrect'})).status,401);
 const login=await call('POST','/auth/login',{email:env.BOOTSTRAP_ADMIN_EMAIL,password});assert.equal(login.status,303);const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.match(login.headers.get('Set-Cookie'),/HttpOnly; SameSite=Lax/);
 const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
 let snapshot=await api('GET','');assert.equal(snapshot.data.canInitialize,false);assert.equal(snapshot.data.documents.length,0);assert.equal((await api('POST','/seed',{documents:[]})).status,403);
 const core=edit('stay/TEST/core',{id:'TEST',careTeamId:'demo-clinique',firstName:'Camille',lastName:'MARTIN'});let r=await api('PUT','/document',core);assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal((await api('PUT','/document',core)).data.replayed,true);
 const docs=[edit('stay/TEST/notes',[{text:'Transmission fictive',responsible:'Compte fictif'}]),edit('stay/TEST/rx',[{name:'Médicament fictif'}])];r=await api('POST','/commit',{documents:docs});assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('POST','/commit',{documents:[edit('stay/TEST/notes',[],0),edit('stay/TEST/rx',[],1)]});assert.equal(r.status,409,JSON.stringify(r.data));
 assert.equal((await api('GET','')).data.documents.find(d=>d.key==='stay/TEST/rx').data.length,1);
 await assert.rejects(()=>pool.query('DELETE FROM workspace_versions'),/immutable/);
 const contact={firstName:'Camille',lastName:'MARTIN',birthDate:'1985-06-14',email:'camille@example.test',phone:''};assert.equal((await api('PUT','/document',edit('stay/TEST/invitationContact',{contact,confirmed:true,verifiedBy:snapshot.data.user,verifiedAt:new Date().toISOString(),source:'Test fictif'}))).status,200);
 r=await api('POST','/questionnaire/invite',{stay:'TEST',contact,confirmed:true});assert.equal(r.status,201,JSON.stringify(r.data));const token=r.data.link.split('#invitation=')[1];assert.equal(r.data.delivery,'not-sent');
 assert.equal((await call('POST','/api/questionnaire/resolve',{token})).status,200);
 const answers={birthname:'MARTIN',firstname:'Camille',dob:'1985-06-14',signature:'Camille MARTIN',signedDate:'2026-11-20'};r=await call('POST','/api/questionnaire/submit',{token,answers,confirmed:true});assert.equal(r.status,201,await r.text());assert.equal((await call('POST','/api/questionnaire/resolve',{token})).status,410);
 const reader=await createAccount(pool,{email:'reader@example.test',name:'Lecture fictive',passwordHash});let l=await call('POST','/auth/login',{email:'reader@example.test',password});const readerCookie=l.headers.get('Set-Cookie').split(';')[0];assert.equal((await call('PUT','/api/workspace/document',edit('stay/TEST/notes',[],1),readerCookie)).status,403);
 assert.equal((await call('GET','/server/index.js')).status,404);assert.equal((await call('GET','/.openai/manifest.json')).status,404);assert.equal((await call('GET','/patient.html')).status,200);
 server=httpServer(app,config(env));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const health=await fetch('http://127.0.0.1:'+server.address().port+'/healthz');assert.equal(health.status,200);assert.equal(health.headers.get('X-Content-Type-Options'),'nosniff');await new Promise(resolve=>server.close(resolve));server=undefined;
 await pool.end();db=new PGlite(directory);pool=pgPool(db);await migrate(pool);app=await makeApp({pool,bucket:{},cfg:config(env)});snapshot=await api('GET','');assert.equal(snapshot.status,200);assert.equal(snapshot.data.documents.find(d=>d.key==='stay/TEST/notes').data[0].text,'Transmission fictive');
 assert.equal((await call('POST','/auth/logout',{},cookie)).status,303);assert.equal((await call('GET','/api/workspace',undefined,cookie)).status,401);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await fs.rm(directory,{recursive:true,force:true})}
});

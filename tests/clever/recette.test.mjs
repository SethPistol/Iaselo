import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,verifyPassword,loginPage,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {cellarBinding} from '../../server/storage.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const appId='app_0123abcd-0000-4000-8000-00000000beef';
test('recette : configuration déduite de Clever Cloud, sans réglage manuel',()=>{
 const cfg=config({IASELO_RECETTE:'true',APP_ID:appId});
 assert.equal(cfg.baseUrl,'https://app-0123abcd-0000-4000-8000-00000000beef.cleverapps.io');assert.equal(cfg.enableDemoSeed,true);assert.equal(cfg.recette,true);assert.ok(cfg.sessionSecret.length>=32);
 assert.throws(()=>config({APP_ID:appId}),/BASE_URL/,'hors recette, rien n’est déduit');
 assert.equal(config({IASELO_RECETTE:'true',APP_ID:appId,BASE_URL:'https://recette.example.test'}).baseUrl,'https://recette.example.test');
});
test('recette : compte de test créé une seule fois, affiché uniquement en recette',async()=>{
 const db=new PGlite(),pool=pgPool(db);try{await migrate(pool);await bootstrap(pool,{IASELO_RECETTE:'true'});await bootstrap(pool,{IASELO_RECETTE:'true'});
 const {rows}=await pool.query('SELECT email,password_hash FROM auth_users WHERE email<>ALL($1)',[['chirurgien@iaselo.test','cadre@iaselo.test','infirmiere.bloc@iaselo.test','infirmiere.etage@iaselo.test','cadre.etage@iaselo.test']]);assert.equal(rows.length,1);assert.equal(rows[0].email,RECETTE_EMAIL);assert.equal(await verifyPassword(RECETTE_PASSWORD,rows[0].password_hash),true);
 const {rows:[member]}=await pool.query("SELECT role FROM workspace_members WHERE role='owner'");assert.equal(member.role,'owner');
 const {rows:teams}=await pool.query('SELECT DISTINCT t.label FROM care_teams t JOIN professional_teams m ON m.team_id=t.id ORDER BY t.label');assert.deepEqual(teams.map(t=>t.label),['Chirurgie','Endoscopie','Séjour médical']);}finally{await db.close()}
 assert.match(loginPage('',true),/Serveur de recette/);assert.doesNotMatch(loginPage('',false),/Recette IASELO|demo@iaselo/);
});
test('recette : bucket privé nommé automatiquement',()=>{
 assert.doesNotThrow(()=>cellarBinding({IASELO_RECETTE:'true',CELLAR_ADDON_HOST:'cellar-c2.services.clever-cloud.com',CELLAR_ADDON_KEY_ID:'ABC_123',CELLAR_ADDON_KEY_SECRET:'x'}));
 assert.throws(()=>cellarBinding({CELLAR_ADDON_HOST:'cellar-c2.services.clever-cloud.com',CELLAR_ADDON_KEY_ID:'ABC',CELLAR_ADDON_KEY_SECRET:'x'}),/bucket/);
});
import {createPool} from '../../server/database.mjs';
test('PGSSL=require : accepté seulement en recette, jamais en production',async()=>{
 const base={DATABASE_URL:'postgres://u:p@db.example.test:5432/x'};
 assert.throws(()=>createPool({...base,PGSSL:'require'}),/réservé au mode recette/);
 const pool=createPool({...base,PGSSL:'require',IASELO_RECETTE:'true'});assert.deepEqual(pool.options.ssl,{rejectUnauthorized:false});await pool.end();
 const strict=createPool(base);assert.equal(strict.options.ssl.rejectUnauthorized,true);await strict.end();
});
import http from 'node:http';
test('recette : création du bucket sans LocationConstraint (refusé par Cellar)',async()=>{
 const seen=[];const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{seen.push({method:req.method,url:req.url,body});if(req.method==='HEAD'){res.writeHead(404);res.end()}else{res.writeHead(200);res.end()}})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const bucket=cellarBinding({NODE_ENV:'test',IASELO_RECETTE:'true',S3_ENDPOINT:'http://127.0.0.1:'+server.address().port,CELLAR_ADDON_KEY_ID:'KEY1',CELLAR_ADDON_KEY_SECRET:'x'});await bucket.check();
  const create=seen.find(r=>r.method==='PUT');assert.ok(create,'bucket créé');assert.match(create.url,/^\/iaselo-recette-key1\/?$/);assert.doesNotMatch(create.body,/LocationConstraint/);}
 finally{server.close()}
});
import {makeApp} from '../../server/index.mjs';import {RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD} from '../../server/config.mjs';
test('recette : compte chirurgien de test, profil chirurgien, jamais hors recette ni réactivé',async()=>{
 const db=new PGlite(),pool=pgPool(db);try{await migrate(pool);
  // Hors recette : seul l'administrateur prévu est créé.
  await bootstrap(pool,{BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_PASSWORD_HASH:await hashPassword('mot de passe administrateur')});assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1',[RECETTE_CHIRURGIEN_EMAIL])).rows.length,0);
  // Recette sur une base déjà peuplée : le compte est ajouté une seule fois.
  await bootstrap(pool,{IASELO_RECETTE:'true'});await bootstrap(pool,{IASELO_RECETTE:'true'});
  const {rows}=await pool.query('SELECT u.id,u.password_hash,p.profession,m.role FROM auth_users u JOIN professional_profiles p ON p.user_id=u.id JOIN workspace_members m ON m.user_id=u.id WHERE u.email=$1',[RECETTE_CHIRURGIEN_EMAIL]);
  assert.equal(rows.length,1);assert.equal(rows[0].profession,'chirurgien');assert.equal(rows[0].role,'reader');assert.equal(await verifyPassword(RECETTE_CHIRURGIEN_PASSWORD,rows[0].password_hash),true);
  assert.deepEqual((await pool.query('SELECT team_id FROM professional_teams WHERE user_id=$1',[rows[0].id])).rows.map(r=>r.team_id),['demo-clinique']);
  // Désactivé par l'administrateur : reste désactivé au redémarrage.
  await pool.query('UPDATE professional_profiles SET active=0 WHERE user_id=$1',[rows[0].id]);await bootstrap(pool,{IASELO_RECETTE:'true'});
  assert.equal((await pool.query('SELECT active FROM professional_profiles WHERE user_id=$1',[rows[0].id])).rows[0].active,0);
 }finally{await db.close()}
 assert.doesNotMatch(loginPage('',true),/chirurgien@iaselo|Chirurgien IASELO|demo@iaselo|Recette IASELO/,'audit 24/11 : aucun identifiant affiché sur la page publique');assert.doesNotMatch(loginPage('',false),/chirurgien@iaselo|Chirurgien IASELO/);
});
test('recette : le chirurgien de test se connecte et voit les dossiers fictifs avec son profil',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD),chir=await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD);
  assert.equal((await call('POST','/api/workspace/seed',{documents:[{key:'stay/DEMO1/core',data:{id:'DEMO1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test'}}}]},admin)).status,200);
  const r=await (await call('GET','/api/workspace',undefined,chir)).json();
  assert.equal(r.access.profile.profession,'chirurgien');assert.equal(r.role,'editor');assert.ok(r.documents.some(d=>/^stay\/.+\/core$/.test(d.key)),'dossiers fictifs visibles');
 }finally{await db.close()}
});
test('audit 24/11 : une signature est toujours attribuée à la personne connectée',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD),chir=await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD);
  assert.equal((await call('POST','/api/workspace/seed',{documents:[{key:'stay/DEMO1/core',data:{id:'DEMO1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test'}}}]},admin)).status,200);
  const anesth=(await (await call('GET','/api/workspace',undefined,admin)).json()).access.profile,me=(await (await call('GET','/api/workspace',undefined,chir)).json()).access.profile;
  const usurpe={draft:{x:1},signed:{at:'2026-11-24T08:00:00.000Z',name:anesth.display_name,userId:anesth.user_id,rpps:'10000000000',hash:'abc'}};
  const r=await call('PUT','/api/workspace/document',{key:'stay/DEMO1/prescriptionsPreop',revision:0,data:usurpe,operation:crypto.randomUUID(),reason:'test audit'},chir);assert.equal(r.status,200);
  const signed=(await r.json()).document.data.signed;
  assert.equal(signed.userId,me.user_id);assert.equal(signed.name,me.display_name);assert.equal(signed.rpps,me.rpps||'');assert.equal(signed.hash,'abc');
  // CRO validé : le nom du valideur est celui du compte connecté.
  const c=await call('PUT','/api/workspace/document',{key:'stay/DEMO1/cro',revision:0,data:{text:'x',status:'validé',validatedBy:'Dr Quelqu’un d’autre',validatedAt:'2026-11-24T08:00:00.000Z'},operation:crypto.randomUUID(),reason:'test audit'},chir);
  assert.equal((await c.json()).document.data.validatedBy,me.display_name);
 }finally{await db.close()}
});
test('audit 24/11 points 5 et 6 : consultation validée figée, saisie rapide fermée au chirurgien, heure serveur',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const a=await login(RECETTE_EMAIL,RECETTE_PASSWORD),chir=await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD);
  assert.equal((await call('POST','/api/workspace/seed',{documents:[{key:'stay/DEMO1/core',data:{id:'DEMO1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test'}}}]},a)).status,200);
  const put=(key,data,revision,cookie=a)=>call('PUT','/api/workspace/document',{key,revision,data,operation:crypto.randomUUID(),reason:'test verrous'},cookie);
  let r=await put('stay/DEMO1/consult',{validated:true,asa:'2'},0);assert.equal(r.status,200);
  r=await put('stay/DEMO1/consult',{validated:true,asa:'3'},1);assert.equal(r.status,403);assert.match((await r.json()).error,/révision/);
  r=await put('stay/DEMO1/consult',{validated:false,asa:'2',versions:[{}]},1);assert.equal(r.status,200);
  assert.equal((await pool.query("SELECT COUNT(*) AS n FROM professional_access_log WHERE action='revision-ouverte' AND target='stay/DEMO1/consult'")).rows[0].n,1);
  assert.equal((await put('stay/DEMO1/peropRapide',{evenements:[]},0,chir)).status,403,'chirurgien : lecture seule');
  r=await put('stay/DEMO1/rx',[{name:'Paracétamol',validated:true,executions:[{status:'Réalisée',at:'2026-01-01T08:00:00.000Z',author:'x'}]}],0);
  const e=(await r.json()).document.data[0].executions[0];assert.ok(Date.parse(e.serverAt)>Date.parse('2026-11-01'));assert.ok(e.serverBy);
 }finally{await db.close()}
});

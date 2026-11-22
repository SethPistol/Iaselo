import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,verifyPassword,loginPage} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {cellarBinding} from '../../server/storage.mjs';
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
 const {rows}=await pool.query('SELECT email,password_hash FROM auth_users');assert.equal(rows.length,1);assert.equal(rows[0].email,RECETTE_EMAIL);assert.equal(await verifyPassword(RECETTE_PASSWORD,rows[0].password_hash),true);
 const {rows:[member]}=await pool.query('SELECT role FROM workspace_members');assert.equal(member.role,'owner');
 const {rows:teams}=await pool.query('SELECT t.label FROM care_teams t JOIN professional_teams m ON m.team_id=t.id ORDER BY t.label');assert.deepEqual(teams.map(t=>t.label),['Chirurgie','Endoscopie','Séjour médical']);}finally{await db.close()}
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

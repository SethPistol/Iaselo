import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,verifyPassword,loginPage} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {cellarBinding} from '../../server/storage.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&sql.includes('CREATE TABLE workspace_members')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
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
 const {rows:[member]}=await pool.query('SELECT role FROM workspace_members');assert.equal(member.role,'owner');}finally{await db.close()}
 assert.match(loginPage('',true),/Serveur de recette/);assert.doesNotMatch(loginPage('',false),/Recette IASELO|demo@iaselo/);
});
test('recette : bucket privé nommé automatiquement',()=>{
 assert.doesNotThrow(()=>cellarBinding({IASELO_RECETTE:'true',CELLAR_ADDON_HOST:'cellar-c2.services.clever-cloud.com',CELLAR_ADDON_KEY_ID:'ABC_123',CELLAR_ADDON_KEY_SECRET:'x'}));
 assert.throws(()=>cellarBinding({CELLAR_ADDON_HOST:'cellar-c2.services.clever-cloud.com',CELLAR_ADDON_KEY_ID:'ABC',CELLAR_ADDON_KEY_SECRET:'x'}),/bucket/);
});

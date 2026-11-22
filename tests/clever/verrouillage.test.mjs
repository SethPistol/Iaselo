import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}

test('verrouillage du poste : session suspendue côté serveur, déverrouillage par mot de passe, 5 échecs ferment la session',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{
  await migrate(pool);await bootstrap(pool,env);const cfg=config(env);
  const password='Mot de passe test 2026';await createAccount(pool,{email:'ide@example.test',name:'IDE FICTIVE',passwordHash:await hashPassword(password)});
  const app=await makeApp({pool,bucket:{},cfg,messaging:{channels:{}}});
  const login=async()=>{const r=await app(new Request(origin+'/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'ide@example.test',password})}));assert.equal(r.status,303);return r.headers.get('Set-Cookie').split(';')[0]};
  const post=(path,cookie,body={},o=origin)=>app(new Request(origin+path,{method:'POST',headers:{Cookie:cookie,Origin:o,'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const api=cookie=>app(new Request(origin+'/api/workspace',{headers:{Cookie:cookie}}));
  const cookie=await login();assert.equal((await api(cookie)).status,200);
  assert.equal((await post('/auth/lock',cookie,{},'https://autre.example')).status,403,'origine étrangère refusée');
  const lock=await post('/auth/lock',cookie);assert.equal(lock.status,200);assert.equal((await lock.json()).locked,true);
  assert.equal((await api(cookie)).status,401,'aucune donnée servie pendant le verrouillage');
  const page=await app(new Request(origin+'/',{headers:{Cookie:cookie}}));assert.equal(page.status,303);
  const bad=await post('/auth/unlock',cookie,{password:'faux'});assert.equal(bad.status,401);assert.match((await bad.json()).error,/4 essais restants/);
  assert.equal((await api(cookie)).status,401);
  const ok=await post('/auth/unlock',cookie,{password});assert.equal(ok.status,200);assert.equal((await api(cookie)).status,200);
  const {rows}=await pool.query("SELECT action FROM auth_audit WHERE action IN ('lock','unlock') ORDER BY at");assert.deepEqual(rows.map(r=>r.action),['lock','unlock']);
  // Cinq échecs : la session est fermée, il faut se reconnecter.
  const c2=await login();await post('/auth/lock',c2);let last;
  for(let i=0;i<5;i++)last=await post('/auth/unlock',c2,{password:'faux'+i});
  assert.equal(last.status,401);assert.equal((await last.json()).logout,true);
  assert.equal((await post('/auth/unlock',c2,{password})).status,401,'session fermée même avec le bon mot de passe');
  // La première session (déverrouillée) n'est pas concernée.
  assert.equal((await api(cookie)).status,200);
 }finally{await db.close()}
});

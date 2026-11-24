import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,hashPassword,createAccount} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';import {codeAt,stepNow,verify,newSecret} from '../../server/mfa.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',password='Test uniquement 2026 !';
test('TOTP : vecteur RFC 6238, fenêtre ±30 s et rejeu refusé',()=>{
 assert.equal(codeAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');
 const s=newSecret(),now=Date.now(),st=stepNow(now);assert.equal(verify(s,codeAt(s,st),0,now),st);assert.equal(verify(s,codeAt(s,st-1),0,now),st-1);
 assert.equal(verify(s,codeAt(s,st-3),0,now),0,'code trop ancien');assert.equal(verify(s,codeAt(s,st),st,now),0,'code déjà utilisé');assert.equal(verify(s,'12345',0,now),0);
});
test('connexion : mot de passe puis code obligatoire, 5 erreurs ferment la session, réinitialisation par l’administrateur',async()=>{
 const db=new PGlite(),pool=pgPool(db),env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_PASSWORD_HASH:await hashPassword(password)};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{},cfg:config(env)});
  const req=(method,route,{cookie,form,json}={})=>app(new Request(origin+route,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:json?{'Content-Type':'application/json'}:{})},...(form?{body:new URLSearchParams(form).toString()}:json?{body:JSON.stringify(json)}:{})}));
  const login=async email=>{const r=await req('POST','/auth/login',{form:{email,password}});assert.equal(r.headers.get('Location'),'/double-authentification');return r.headers.get('Set-Cookie').split(';')[0]};
  const secretOf=async email=>(await pool.query('SELECT totp_secret,totp_active FROM auth_users WHERE email=$1',[email])).rows[0];
  let admin=await login('admin@example.test');
  assert.equal((await req('GET','/api/workspace',{cookie:admin})).status,401,'pas de dossier sans code');
  const page=await (await req('GET','/double-authentification',{cookie:admin})).text();assert.match(page,/<svg/);const {totp_secret}=await secretOf('admin@example.test');assert.ok(page.includes(totp_secret.slice(0,4)));
  assert.equal((await req('POST','/auth/mfa',{cookie:admin,form:{code:'000000'}})).status,401);
  const ok=await req('POST','/auth/mfa',{cookie:admin,form:{code:codeAt(totp_secret,stepNow())}});assert.equal(ok.status,303);assert.equal((await secretOf('admin@example.test')).totp_active,1);
  assert.equal((await req('GET','/api/workspace',{cookie:admin})).status,200);
  // Seconde connexion : plus de QR code, le même secret est demandé ; le code déjà utilisé est refusé.
  const again=await login('admin@example.test');assert.doesNotMatch(await (await req('GET','/double-authentification',{cookie:again})).text(),/<svg/);
  assert.equal((await req('POST','/auth/mfa',{cookie:again,form:{code:codeAt(totp_secret,stepNow())}})).status,401,'rejeu');
  // Compte d'un soignant : 5 codes faux ferment la session.
  const uid=await createAccount(pool,{email:'ide@example.test',name:'IDE fictive',passwordHash:await hashPassword(password)});
  const ide=await login('ide@example.test');await req('GET','/double-authentification',{cookie:ide});
  for(let i=0;i<4;i++)assert.equal((await req('POST','/auth/mfa',{cookie:ide,form:{code:'111111'}})).status,401);
  const fifth=await req('POST','/auth/mfa',{cookie:ide,form:{code:'111111'}});assert.match(fifth.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal((await pool.query('SELECT COUNT(*) AS n FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE u.email=$1',['ide@example.test'])).rows[0].n,0);
  // Réinitialisation : réservée à l'administrateur, motif obligatoire.
  assert.equal((await req('POST','/api/admin/accounts/mfa-reset',{cookie:admin,json:{userId:uid,reason:''}})).status,400);
  assert.equal((await req('POST','/api/admin/accounts/mfa-reset',{cookie:admin,json:{userId:uid,reason:'Téléphone perdu'}})).status,200);
  assert.equal((await secretOf('ide@example.test')).totp_secret,'');
  const log=(await pool.query("SELECT action FROM auth_audit WHERE user_id=$1 ORDER BY id",[uid])).rows.map(r=>r.action);assert.ok(log.includes('mfa-refused-logout')&&log.includes('mfa-reset'));
 }finally{await db.close()}
});
test('recette : comptes de test dispensés, double authentification activable par MFA_OBLIGATOIRE=true',async()=>{
 const base={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 assert.equal(config(base).mfa,false);assert.equal(config({...base,MFA_OBLIGATOIRE:'true'}).mfa,true);assert.equal(config({NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:base.SESSION_SECRET,MFA_OBLIGATOIRE:'false'}).mfa,true,'impossible de la couper hors recette');
 const db=new PGlite(),pool=pgPool(db);try{await migrate(pool);const env={...base,MFA_OBLIGATOIRE:'true'};await bootstrap(pool,env);const app=await makeApp({pool,bucket:{},cfg:config(env)});
  const r=await app(new Request(origin+'/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:RECETTE_EMAIL,password:RECETTE_PASSWORD}).toString()}));assert.equal(r.headers.get('Location'),'/');
 }finally{await db.close()}
});

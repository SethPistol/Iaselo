// Audit de sécurité du 27/11/2026 : chaque correction est vérifiée ici (données fictives uniquement).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword,clientIp} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp,httpServer,crossSite} from '../../server/index.mjs';
import {substituer,sur} from '../../server/etablissement.mjs';import {brevoMessaging} from '../../server/brevo.mjs';import {typeSur,enTetesFichier} from '../../worker/fichiers-surs.mjs';import {interne} from '../../worker/fhir.mjs';import {verifyJwt} from '../../server/interop/psc.mjs';
import {generateKeyPairSync,createSign} from 'node:crypto';import fs from 'node:fs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'},password='Mot de passe fictif 2026 !';

test('serveur : autre site refusé, inactivité, cookie de session, pulvérisation, téléphonie par profil',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(email,pw=password,headers={})=>call('POST','/auth/login',{email,password:pw},headers);
  const r0=await login(RECETTE_EMAIL,RECETTE_PASSWORD);assert.equal(r0.status,303);
  const setCookie=r0.headers.get('Set-Cookie');assert.doesNotMatch(setCookie,/Max-Age/,'cookie de session du navigateur, sans durée');
  const cookie=setCookie.split(';')[0];
  assert.equal((await call('GET','/api/workspace',undefined,{Cookie:cookie})).status,200);
  // Lien piégé depuis un autre site : même une lecture est refusée.
  for(const site of ['cross-site','same-site'])assert.equal((await call('GET','/api/workspace/messagerie?stay=X',undefined,{Cookie:cookie,'Sec-Fetch-Site':site})).status,403);
  assert.equal((await call('GET','/api/workspace',undefined,{Cookie:cookie,'Sec-Fetch-Site':'same-origin'})).status,200);
  assert.equal(crossSite(new Request(origin)),false);
  // Inactivité côté serveur : plus de 60 minutes sans requête → session close, tracée.
  await pool.query("UPDATE auth_sessions SET last_seen_at=$1",[new Date(Date.now()-61*60000).toISOString()]);
  assert.equal((await call('GET','/api/workspace',undefined,{Cookie:cookie})).status,401);
  assert.equal((await pool.query("SELECT COUNT(*) AS n FROM auth_audit WHERE action='session-idle-expired'")).rows[0].n,1);
  assert.equal((await call('GET','/',undefined,{Cookie:cookie})).status,303,'reconnexion exigée');
  // Moins de 60 minutes : la session reste ouverte et l'activité est notée.
  const c2=(await login(RECETTE_EMAIL,RECETTE_PASSWORD)).headers.get('Set-Cookie').split(';')[0];
  await pool.query("UPDATE auth_sessions SET last_seen_at=$1 WHERE expires_at>$2",[new Date(Date.now()-50*60000).toISOString(),new Date().toISOString()]);
  assert.equal((await call('GET','/api/workspace',undefined,{Cookie:c2})).status,200);
  assert.ok((await pool.query("SELECT MAX(last_seen_at) AS t FROM auth_sessions")).rows[0].t>new Date(Date.now()-60000).toISOString());
  // Pulvérisation : 20 comptes différents en échec depuis une adresse → adresse bloquée ; une autre adresse passe.
  const ipA={'X-Forwarded-For':'203.0.113.9, 198.51.100.7'},ipB={'X-Forwarded-For':'198.51.100.8'};
  assert.equal(clientIp(new Request(origin,{headers:ipA})),'198.51.100.7','dernière valeur, ajoutée par le répartiteur');
  for(let i=0;i<20;i++)assert.equal((await login('inconnu'+i+'@example.test','mauvais mot de passe',ipA)).status,401);
  assert.equal((await login('inconnu99@example.test','mauvais mot de passe',ipA)).status,429);
  assert.equal((await login(RECETTE_EMAIL,RECETTE_PASSWORD,ipA)).status,429,'bloqué pour 15 minutes');
  assert.equal((await login(RECETTE_EMAIL,RECETTE_PASSWORD,ipB)).status,303);
  // Accueil téléphonique : secrétariat et administration seulement (comme le menu).
  const at=new Date().toISOString(),cookies={};
  for(const job of ['pharmacien','facturation','dim','infirmier','secretariat','administration']){const id=await createAccount(pool,{email:job+'@example.test',name:'Nom '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at]);cookies[job]=(await login(job+'@example.test',password,ipB)).headers.get('Set-Cookie').split(';')[0]}
  for(const job of ['pharmacien','facturation','dim','infirmier'])assert.equal((await call('GET','/api/workspace/telephonie',undefined,{Cookie:cookies[job]})).status,403,job);
  for(const job of ['secretariat','administration'])assert.equal((await call('GET','/api/workspace/telephonie',undefined,{Cookie:cookies[job]})).status,200,job);
  assert.ok((await pool.query("SELECT COUNT(*) AS n FROM professional_access_log WHERE target='telephonie' AND result='denied'")).rows[0].n>=4);
 }finally{await pool.end()}
});

test('en-têtes : aucun script en ligne autorisé, pièces jointes dans un bac à sable',async()=>{
 const csp=[];const server=httpServer(async request=>{const u=new URL(request.url);return u.pathname==='/piece'?new Response('x',{headers:{'Content-Type':'image/png',...enTetesFichier('image/png')}}):new Response('ok',{headers:{'Content-Type':'text/html'}})},{baseUrl:'http://localhost:8099',secure:false});
 await new Promise(r=>server.listen(8099,'127.0.0.1',r));
 try{
  const page=await fetch('http://localhost:8099/');const p=page.headers.get('content-security-policy');csp.push(p);
  assert.match(p,/script-src 'self' 'wasm-unsafe-eval';/);assert.doesNotMatch(p.split(';').find(x=>x.includes('script-src')),/unsafe-inline/);
  assert.equal(page.headers.get('cross-origin-opener-policy'),'same-origin');assert.match(page.headers.get('permissions-policy'),/geolocation=\(\)/);
  const piece=await fetch('http://localhost:8099/piece');assert.match(piece.headers.get('content-security-policy'),/^sandbox/);
 }finally{await new Promise(r=>server.close(r))}
 // Aucune page servie ne contient de script ni de gestionnaire d'événement en ligne (sauf les cadres scientifiques
 // et la trame de consultation, qui ont leur propre politique).
 for(const f of fs.readdirSync(new URL('../../dist/',import.meta.url)).filter(f=>f.endsWith('.html')&&!f.startsWith('scientifique-')&&f!=='consultation-modele.html')){
  const html=fs.readFileSync(new URL('../../dist/'+f,import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/i,f+' : script en ligne');assert.doesNotMatch(html,/\son[a-z]+\s*=\s*["']/i,f+' : gestionnaire en ligne');
 }
 assert.equal(typeSur('text/html'),'application/octet-stream');assert.equal(typeSur('image/svg+xml'),'application/octet-stream');assert.equal(typeSur('text/xml; charset=utf-8'),'application/octet-stream');
 assert.equal(typeSur('application/pdf'),'application/pdf');assert.equal(typeSur('audio/mp4'),'audio/mp4');assert.equal(typeSur('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.deepEqual(enTetesFichier('application/pdf'),{},'la visionneuse PDF du navigateur isole déjà le document');
});

test('établissement : apostrophes et guillemets ne cassent ni n’injectent de code',()=>{
 const e={nom:'Clinique de l\'Europe "x" ${alert(1)} `y` \\',adresse:'',cp:'',ville:'',tel:'',finess:''};
 const js=substituer("const a='Clinique du Trocadéro',b=\"Clinique du Trocadéro\",c=`Clinique du Trocadéro`;",e);
 assert.doesNotThrow(()=>new Function(js),'le script reste valide');assert.doesNotMatch(js,/\$\{|\\|alert\(1\)\}/);
 assert.equal(sur("Clinique de l'Europe"),'Clinique de l’Europe');assert.equal(sur('A & B <b>'),'A et B b');
 assert.match(substituer('<p title="Clinique du Trocadéro">',e),/^<p title="[^"]*">$/,'attribut HTML non cassé');
});

test('messagerie : plafond par destinataire et par heure',async()=>{
 let n=0;const fetchImpl=async()=>{n++;return new Response(JSON.stringify({messageId:'m'+n}),{status:201})};
 const m=brevoMessaging({BREVO_API_KEY:'cle-fictive',BREVO_SENDER_EMAIL:'expediteur@example.test',MESSAGING_MAX_PAR_HEURE:'14'},fetchImpl);
 for(let i=0;i<10;i++)await m.sms({to:'0612345678',content:'Test'});
 await assert.rejects(m.sms({to:'+33612345678',content:'Test'}),/Trop de messages/);
 for(let i=0;i<4;i++)await m.email({to:'p'+i+'@example.test',subject:'s',text:'t'});
 await assert.rejects(m.email({to:'autre@example.test',subject:'s',text:'t'}),/Plafond/);
 assert.equal(n,14);
});

test('webhook FHIR vers le réseau interne refusé ; jeton PSC sans expiration refusé',()=>{
 for(const h of ['localhost','127.0.0.1','10.0.0.5','172.20.1.1','192.168.1.10','169.254.169.254','[::1]','fd00::1','metadata.internal'])assert.equal(interne(h),true,h);
 for(const h of ['partenaire.example.org','8.8.8.8','172.32.0.1'])assert.equal(interne(h),false,h);
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'k1',alg:'RS256'};
 const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),signe=claims=>{const h=b64({alg:'RS256',kid:'k1'}),p=b64(claims),s=createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey).toString('base64url');return h+'.'+p+'.'+s};
 const base={iss:'https://psc.example',aud:'iaselo',nonce:'n1'};
 assert.throws(()=>verifyJwt(signe(base),{keys:[jwk]},{issuer:base.iss,audience:'iaselo',nonce:'n1'}),/expiration/);
 assert.equal(verifyJwt(signe({...base,exp:Math.floor(Date.now()/1000)+300}),{keys:[jwk]},{issuer:base.iss,audience:'iaselo',nonce:'n1'}).nonce,'n1');
});

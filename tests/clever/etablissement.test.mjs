// Une installation par établissement : identité réglée par l'administrateur (nom, coordonnées, logos),
// reprise dans les pages, la connexion, les SMS ; droits et traçabilité (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CADRE_EMAIL,RECETTE_CADRE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {substituer,valider,DEFAUT} from '../../server/etablissement.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('substitution et validation',()=>{
 const e={nom:'Clinique des Lilas',adresse:'1 rue des Fleurs',cp:'69003',ville:'Lyon',tel:'04 00 00 00 00',finess:'690000000'};
 const s=substituer(`${DEFAUT.nom} · ${DEFAUT.nom.toUpperCase()} · ${DEFAUT.adresse}, ${DEFAUT.cp} ${DEFAUT.ville} · FINESS ${DEFAUT.finess} · ${DEFAUT.tel}`,e);
 assert.equal(s,'Clinique des Lilas · CLINIQUE DES LILAS · 1 rue des Fleurs, 69003 Lyon · FINESS 690000000 · 04 00 00 00 00');
 assert.deepEqual(valider({nom:'X',finess:'12',cp:'abc'}).erreurs,['nom','finess','cp']);
 assert.equal(valider({nom:'Clinique <script>'}).valeurs.nom,'Clinique script');
});

test('établissement : réglage administrateur, pages, SMS, logo, droits, journal',async()=>{
 const db=new PGlite(),pool=pgPool(db),files=new Map();
 try{
  await migrate(pool);await bootstrap(pool,env);
  const messaging={channels:{sms:true,email:true},establishment:'Clinique du Trocadéro',sms:async()=>'S',email:async()=>'E'};
  const app=await makeApp({pool,bucket:{async put(k,v,m){files.set(k,{body:v,httpMetadata:m?.httpMetadata})},async get(k){return files.get(k)||null}},cfg:config(env),messaging});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD),cadre=await login(RECETTE_CADRE_EMAIL,RECETTE_CADRE_PASSWORD);
  let r=await call('GET','/api/admin/etablissement',undefined,{Cookie:admin});assert.equal(r.status,200);assert.equal((await r.json()).nom,DEFAUT.nom);
  assert.equal((await call('GET','/api/admin/etablissement',undefined,{Cookie:cadre})).status,403);
  assert.equal((await call('POST','/api/admin/etablissement',{valeurs:{nom:'Pirate'}},{Cookie:cadre})).status,403);
  assert.equal((await call('POST','/api/admin/etablissement',{valeurs:{finess:'123'}},{Cookie:admin})).status,400);
  assert.equal((await call('POST','/api/admin/etablissement',{logos:{clair:'data:image/svg+xml;base64,PHN2Zy8+'}},{Cookie:admin})).status,400,'SVG refusé');
  r=await call('POST','/api/admin/etablissement',{valeurs:{nom:'Clinique des Lilas',adresse:'1 rue des Fleurs',cp:'69003',ville:'Lyon',tel:'04 00 00 00 00',finess:'690000000'},logos:{clair:PNG}},{Cookie:admin});
  assert.equal(r.status,200);const e=await r.json();assert.equal(e.nom,'Clinique des Lilas');assert.equal(e.logos.clair.type,'image/png');
  assert.equal(messaging.establishment,'Clinique des Lilas','les SMS reprennent le nouveau nom');
  assert.equal((await (await call('GET','/api/etablissement')).json()).ville,'Lyon');
  assert.match(await (await call('GET','/login')).text(),/Clinique des Lilas/);
  const page=await (await call('GET','/patient.html')).text();assert.doesNotMatch(page,/Trocad/);assert.match(page,/Clinique des Lilas/);
  const js=await (await call('GET','/espace-patient-regles.js')).text();assert.doesNotMatch(js,/Clinique du Trocadéro/);
  const logo=await call('GET','/assets/marque/etablissement.webp');assert.equal(logo.headers.get('Content-Type'),'image/png');
  const sombre=await call('GET','/assets/marque/etablissement-sombre.webp');assert.equal(sombre.headers.get('Content-Type'),'image/webp','logo sombre d’origine conservé');
  r=await call('POST','/api/admin/etablissement',{logos:{clair:null}},{Cookie:admin});assert.equal((await r.json()).logos.clair,undefined);
  assert.equal((await call('GET','/assets/marque/etablissement.webp')).headers.get('Content-Type'),'image/webp');
  const log=(await pool.query("SELECT result,detail FROM professional_access_log WHERE action='etablissement' ORDER BY at")).rows;
  assert.ok(log.some(l=>l.result==='denied'));assert.ok(log.some(l=>l.result==='allowed'&&/nom/.test(l.detail)&&/logo clair/.test(l.detail)));
 }finally{await pool.end()}
});

// Application installable et continuité : fiche de continuité (périmètre, fenêtre de dates, traçabilité),
// service worker sans cache des API, manifeste servi (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import fs from 'node:fs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test continuité'});
const jourParis=(n=0)=>{const d=new Date(Date.now()+n*864e5);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(d)};

test('service worker : fichiers statiques seulement, jamais les API ni les dossiers',()=>{
 const sw=fs.readFileSync(new URL('../../dist/sw.js',import.meta.url),'utf8');
 assert.match(sw,/JAMAIS=\/\^\\\/\(\?:api\|fhir/);assert.match(sw,/r\.method!=='GET'/);assert.match(sw,/caches\.match\(HORS_LIGNE\)/);
 const m=JSON.parse(fs.readFileSync(new URL('../../dist/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(m.display,'standalone');assert.equal(m.start_url,'/');assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
 for(const i of m.icons)assert.ok(fs.existsSync(new URL('../../dist/'+i.src,import.meta.url)),i.src);
 const idx=fs.readFileSync(new URL('../../dist/index.html',import.meta.url),'utf8');assert.match(idx,/rel="manifest" href="manifest.webmanifest"/);assert.match(idx,/hors-ligne\.js/);
});

test('fiche de continuité : patients de la fenêtre, données utiles, impression tracée',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:cookie});return {status:r.status,data:await r.json()}};
  const sejour=async(id,date,stage='Consultation')=>{
   await api('PUT','/document',edit('stay/'+id+'/core',{id,careTeamId:'demo-clinique',specialty:'Orthopédie',mode:'Hospitalisation',stage,identity:{lastName:'fictif',firstName:'Test '+id,birthDate:'1960-05-12',sex:'F'}}));
   await api('PUT','/document',edit('stay/'+id+'/consult',{asa:'2',allergies:'Pénicilline (urticaire)',medicationRows:[{name:'Bisoprolol 5 mg',frequency:'1 le matin',decision:'Poursuivre'}],ext:{surgeryDate:date,operation:'Prothèse totale de genou',atbPlan:'Clindamycine 900 mg'}}));
  };
  await sejour('C1',jourParis(0));await sejour('C2',jourParis(-2));await sejour('C3',jourParis(-10));await sejour('C4',jourParis(5));await sejour('C5',jourParis(-10),'Hospitalisation');
  const r=await api('GET','/continuite');assert.equal(r.status,200);
  assert.deepEqual(r.data.patients.map(p=>p.stay),['C5','C2','C1']);
  const p=r.data.patients[2];assert.equal(p.nom,'FICTIF');assert.equal(p.allergies,'Pénicilline (urticaire)');assert.equal(p.asa,'2');
  assert.match(p.traitements[0],/Bisoprolol 5 mg 1 le matin \(poursuivre\)/);assert.equal(p.antibioprophylaxie,'Clindamycine 900 mg');assert.equal(p.intervention,'Prothèse totale de genou');
  assert.equal((await api('POST','/continuite',{})).status,405);
  const log=(await pool.query("SELECT detail FROM professional_access_log WHERE target='continuite'")).rows;assert.equal(log.length,1);assert.match(log[0].detail,/C1/);
  const sw=await app(new Request(origin+'/sw.js'));assert.equal(sw.status,200);assert.match(sw.headers.get('Content-Type'),/javascript/);
  const mf=await app(new Request(origin+'/manifest.webmanifest'));assert.match(mf.headers.get('Content-Type'),/manifest\+json/);
  assert.equal((await app(new Request(origin+'/hors-ligne.html'))).status,200,'page hors ligne accessible sans session');
 }finally{await pool.end()}
});

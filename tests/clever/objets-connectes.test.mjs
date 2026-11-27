// Objets connectés du télésuivi : prêt d'appareil, mesures simulées et alertes, passerelle signée. Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {signer} from '../../worker/telephonie.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const SECRET='secret-passerelle-objets-de-test-0123456789';
test('objets connectés : prêt, simulation, alertes, passerelle signée',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const mk=interopEnv=>makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv});
  let app=await mk({});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:cookie});return {status:r.status,data:await r.json()}};
  const stay='DÉMO-OBJ';
  assert.equal((await api('PUT','/document',{key:'stay/'+stay+'/core',data:{id:stay,careTeamId:'demo-clinique',stage:'Sortie',identity:{lastName:'FICTIF',firstName:'Test'}},revision:0,operation:crypto.randomUUID(),reason:'Test'})).status,200);
  assert.equal((await api('POST','/objets',{action:'simuler',stay})).status,400);
  assert.equal((await api('POST','/objets',{action:'appairer',stay,appareil:'oxymetre',numeroSerie:'ox-0001'})).status,200);
  assert.equal((await api('POST','/objets',{action:'appairer',stay,appareil:'thermometre',numeroSerie:'OX-0001'})).status,409);
  await api('POST','/objets',{action:'appairer',stay,appareil:'thermometre',numeroSerie:'TH-0001'});
  let r=await api('POST','/objets',{action:'simuler',stay,scenario:'desaturation',jours:4});assert.equal(r.status,200);assert.equal(r.data.mesures,8);
  r=await api('GET','/objets?stay='+encodeURIComponent(stay));assert.equal(r.data.mode,'simulation');assert.equal(r.data.appairages.length,2);
  const crit=r.data.alertes.find(a=>a.niveau==='crit');assert.ok(crit);assert.match(crit.titre,/89/);
  r=await api('GET','/objets');assert.equal(r.data.patients[0].alertes.length,1);
  await api('POST','/objets',{action:'vu',stay,cle:crit.cle,note:'Patient rappelé'});
  r=await api('GET','/objets');assert.equal(r.data.patients[0].alertes.length,0);
  assert.equal((await call('POST','/api/objets/mesures','{}')).status,404);
  app=await mk({OBJETS_SECRET:SECRET});
  const signe=async corps=>{const ts=String(Math.floor(Date.now()/1000));return {'X-Iaselo-Horodatage':ts,'X-Iaselo-Signature':await signer(SECRET,ts,corps)}};
  let corps=JSON.stringify({numeroSerie:'TH-0001',mesures:[{type:'temp',valeur:39.8,at:new Date().toISOString().slice(0,16)},{type:'spo2',valeur:80,at:new Date().toISOString().slice(0,16)}]});
  assert.equal((await call('POST','/api/objets/mesures',corps,{'X-Iaselo-Horodatage':'1','X-Iaselo-Signature':'x'})).status,401);
  let x=await call('POST','/api/objets/mesures',corps,await signe(corps));assert.equal(x.status,200);assert.equal((await x.json()).recues,1);// la SpO₂ ne vient pas d'un thermomètre
  corps=JSON.stringify({numeroSerie:'INCONNU',mesures:[]});assert.equal((await call('POST','/api/objets/mesures',corps,await signe(corps))).status,404);
  r=await api('GET','/objets?stay='+encodeURIComponent(stay));assert.ok(r.data.alertes.some(a=>a.type==='temp'&&a.niveau==='crit'&&!a.vue));
 }finally{await pool.end()}
});

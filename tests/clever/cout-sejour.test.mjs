// Coût par séjour : calcul serveur pseudonymisé, réglages tracés, accès restreint. Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
test('coût par séjour : coûts, recette du GHS, résultat, sans identité ; réglages',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const at=new Date().toISOString(),set=(key,data)=>pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES($1,$2,1,'test',$3,$4,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data",[key,JSON.stringify(data),at,crypto.randomUUID()]);
  await set('stay/DÉMO-C1/core',{id:'DÉMO-C1',specialty:'Orthopédie',mode:'Hospitalisation',stage:'Sortie',identity:{lastName:'FICTIF',firstName:'Secret'}});
  await set('stay/DÉMO-C2/core',{id:'DÉMO-C2',specialty:'ORL',mode:'Ambulatoire',stage:'Sortie',identity:{lastName:'FICTIF',firstName:'Autre'}});
  await set('management/reservations',[{patient:'DÉMO-C1',kind:'room',resource:'salle-1',start:'2026-10-05T08:00',end:'2026-10-05T10:00',etapes:{entree:'2026-10-05T08:05',sortie:'2026-10-05T09:35'}},{patient:'DÉMO-C1',kind:'bed',start:'2026-10-05T07:00',end:'2026-10-07T10:00'},{patient:'DÉMO-C2',kind:'room',start:'2026-10-06T08:00',end:'2026-10-06T08:40'},{patient:'DÉMO-C2',kind:'room',start:'2026-11-06T08:00',end:'2026-11-06T08:40',state:'Annulée'}]);
  await pool.query("INSERT INTO marche_records(id,module,kind,stay_id,status,ref,day,data,created_by,created_by_name,created_at,updated_at,version) VALUES('r1','assurance','dossier','DÉMO-C1','','','',$1,'t','t',$2,$2,1)",[JSON.stringify({facture:{ghs:'2345',ghsTarif:'2800'},pmsi:{entree:'2026-10-05',sortie:'2026-10-07'}}),at]);
  let r=await api('GET','/cout-sejour?mois=2026-10');assert.equal(r.status,200,JSON.stringify(r.data));
  assert.deepEqual(r.data.lignes.map(l=>l.stay).sort(),['DÉMO-C1','DÉMO-C2']);assert.ok(!JSON.stringify(r.data).includes('FICTIF')&&!JSON.stringify(r.data).includes('Secret'));
  const c1=r.data.lignes.find(l=>l.stay==='DÉMO-C1');assert.equal(c1.minutesBloc,90);assert.equal(c1.nuits,2);assert.equal(c1.postes.bloc,1080);assert.ok(c1.recette>=2800);assert.equal(c1.resultat,Math.round((c1.recette-c1.total)*100)/100);
  assert.equal(r.data.lignes.find(l=>l.stay==='DÉMO-C2').recette,null);assert.equal(r.data.synthese.sansRecette,1);
  assert.equal((await api('POST','/cout-sejour',{reglages:{minuteBloc:500}})).status,400);
  r=await api('POST','/cout-sejour',{reglages:{minuteBloc:10,minuteSspi:2,nuit:400,ambulatoire:250,consommables:100,sspiDefautMin:45}});assert.equal(r.status,200);assert.equal(r.data.reglages.minuteBloc,10);
  r=await api('GET','/cout-sejour?mois=2026-10');assert.equal(r.data.lignes.find(l=>l.stay==='DÉMO-C1').postes.bloc,900);
  assert.equal((await api('GET','/cout-sejour?mois=2026-11')).data.lignes.length,0);
  assert.equal((await call('GET','/api/workspace/cout-sejour')).status,401);
 }finally{await pool.end()}
});

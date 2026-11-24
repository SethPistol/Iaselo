import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080';
test('audit 24/11 point 4 : séjours sortis et inactifs chargés à la demande',async()=>{
 const db=new PGlite(),pool=pgPool(db),env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})}}));
  const login=async(e,p)=>(await app(new Request(origin+'/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p})}))).headers.get('Set-Cookie').split(';')[0];
  const old='2026-06-01T08:00:00.000Z',recent=new Date().toISOString(),future=new Date(Date.now()+20*86400000).toISOString();
  const put=async(key,data,at)=>pool.query('INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES($1,$2,1,$3,$4,$5,$6)',[key,JSON.stringify(data),'test',at,crypto.randomUUID(),'test archives']);
  const stay=async(id,stage,at,last='DUPONT')=>{await put('stay/'+id+'/core',{id,stage,careTeamId:'demo-clinique',specialty:'Orthopédie',identity:{lastName:last,firstName:'Jeanne',birthDate:'1950-03-04'}},at);await put('stay/'+id+'/consult',{validated:true},at);await pool.query('INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES($1,$2,$3)',[id,'demo-clinique',old])};
  await stay('ARCH','Sortie',old);await stay('PROG','Sortie',old,'MARTIN');await stay('BLOC','Bloc',old,'BERNARD');await stay('NEUF','Sortie',recent,'PETIT');
  await put('management/reservations',[{id:'RES-1',patient:'PROG',start:future,end:future}],recent);
  const a=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const w=await (await call('GET','/api/workspace',a)).json(),stays=[...new Set(w.documents.filter(d=>d.key.startsWith('stay/')).map(d=>d.key.split('/')[1]))].sort();
  assert.deepEqual(stays,['BLOC','NEUF','PROG'],'seul le séjour sorti, inactif et sans bloc à venir reste sur le serveur');
  assert.equal((await call('GET','/api/workspace/archives?q=d',a)).status,400);
  const found=await (await call('GET','/api/workspace/archives?q=dupont%2004/03/1950',a)).json();assert.deepEqual(found.results.map(r=>r.id),['ARCH']);
  const opened=await (await call('GET','/api/workspace/stay?id=ARCH',a)).json();assert.deepEqual(opened.documents.map(d=>d.key),['stay/ARCH/consult','stay/ARCH/core']);
  // Hors équipe : refusé et tracé.
  await pool.query("INSERT INTO care_teams(id,label) VALUES('autre','Autre') ON CONFLICT DO NOTHING");await pool.query("UPDATE stay_teams SET team_id='autre' WHERE stay_id='ARCH'");
  const c=await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD);assert.equal((await call('GET','/api/workspace/stay?id=ARCH',c)).status,403);
  assert.equal((await (await call('GET','/api/workspace/archives?q=dupont',c)).json()).results.length,0);
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE target='stay/ARCH' ORDER BY sequence")).rows.map(r=>r.action+':'+r.result);assert.deepEqual(log,['read:allowed','read:denied']);
 }finally{await db.close()}
});

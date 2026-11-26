import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import P from '../../dist/plages-operatoires-regles.js';import C from '../../dist/planning-core.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}

// Plages opératoires (26/11/2026) : l'administrateur et le cadre de bloc les gèrent ; les autres profils du bloc les lisent.
test('plages opératoires : écrites par l’administrateur et le cadre de bloc, contrôlées par le serveur',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const at=new Date(Date.now()-60000).toISOString(),password='Mot de passe de test 2026';
  const people=[['admin','administration',''],['cadre','infirmier','cadre'],['ide','infirmier','bloc'],['chir','chirurgien',''],['sec','secretariat','']];
  for(const [n,job,poste] of people){const id=await createAccount(pool,{email:n+'@example.test',name:'Nom '+n,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3,poste=$4 WHERE user_id=$1',[id,job,at,poste]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE workspace_members SET role=$2 WHERE user_id=$1',[id,n==='admin'?'owner':'editor'])}
  const doc=(key,data)=>pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES($1,$2,1,'test',$3,$4,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data,operation=EXCLUDED.operation,revision=workspace_documents.revision+1",[key,JSON.stringify(data),at,crypto.randomUUID()]);
  const resources=[{id:'S1',kind:'room',label:'Bloc · Salle 1'},{id:'I1',kind:'staff',label:'IBODE 1'},{id:'I2',kind:'staff',label:'IBODE 2'}];
  await doc('management/planningResources',resources);await doc('stay/PL1/core',{id:'PL1',careTeamId:'demo-clinique',mode:'Ambulatoire',identity:{lastName:'Martin',firstName:'Paul',birthDate:'1970-05-02'}});
  await pool.query("INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES('PL1','demo-clinique',$1) ON CONFLICT DO NOTHING",[at]);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async n=>(await call('POST','/auth/login',{email:n+'@example.test',password})).headers.get('Set-Cookie').split(';')[0];
  const ws=async n=>(await (await call('GET','/api/workspace',undefined,await login(n))).json());
  const rev=async(n,key)=>(await ws(n)).documents.find(d=>d.key===key)?.revision||0;
  const commit=async(n,docs)=>call('POST','/api/workspace/commit',{documents:await Promise.all(docs.map(async([key,data])=>({key,data,revision:await rev(n,key),operation:crypto.randomUUID(),reason:'Plages opératoires'})))},await login(n));
  const today=new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris'}).format(new Date());
  const plage={id:'PL-A',surgeon:'Dr Dubois',weekday:2,resource:'S1',start:'08:00',duration:300,staffIds:['I1'],from:today,rhythm:'hebdo',state:'Active'};
  const gen=(plages,vacations=[])=>P.generer({plages,vacations,reservations:[],resources,today,vacationError:C.vacationError}).vacations;
  // Cadre de bloc : plage + vacations générées, dans le même enregistrement.
  let r=await commit('cadre',[['management/plages',[plage]],['management/vacations',gen([plage])]]);assert.equal(r.status,200,await r.text());
  const lu=await ws('chir');assert.equal(lu.documents.find(d=>d.key==='management/plages').data[0].surgeon,'Dr Dubois');assert.equal(lu.documents.find(d=>d.key==='management/vacations').data.length,12);
  // Administrateur : durée modifiée.
  const longue={...plage,duration:360};r=await commit('admin',[['management/plages',[longue]],['management/vacations',gen([longue],lu.documents.find(d=>d.key==='management/vacations').data)]]);assert.equal(r.status,200,await r.text());
  assert.ok((await ws('sec')).documents.find(d=>d.key==='management/vacations').data.every(v=>v.end.endsWith('T14:00')));
  // Infirmière de bloc, chirurgien, secrétariat : lecture seule sur les plages.
  for(const n of ['ide','chir','sec']){r=await commit(n,[['management/plages',[{...plage,duration:120}]]]);assert.equal(r.status,403,n)}
  // Le serveur refuse une plage incohérente (durée hors bornes, chevauchement).
  r=await commit('cadre',[['management/plages',[{...plage,duration:10}]]]);assert.equal(r.status,403);assert.match((await r.json()).error,/Plage opératoire refusée/);
  r=await commit('cadre',[['management/plages',[longue,{...plage,id:'PL-B',surgeon:'Dr Martin',start:'12:00',staffIds:["I2"]}]]]);assert.equal(r.status,403);assert.match((await r.json()).error,/Chevauchement/);
 }finally{await db.close()}
});

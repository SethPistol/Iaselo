// Appel du lendemain par agent vocal (simulation puis route opérateur signée) : identité, réponses parlées comprises,
// réponses versées au questionnaire J+1 et alertes au médecin. Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {signer} from '../../worker/telephonie.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const SECRET='secret-operateur-telephonie-de-test-0123456789';
const hier=()=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date()),x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-1);return x.toISOString().slice(0,10)};

test('appel J+1 : simulation, identité, réponses au questionnaire et alerte, route opérateur signée',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const mk=interopEnv=>makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv});
  let app=await mk({});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:cookie});return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user,stay='DÉMO-J1',date=hier();
  const put=async(key,data)=>{const r=await api('PUT','/document',{key,data,revision:0,operation:crypto.randomUUID(),reason:'Test appel J+1'});assert.equal(r.status,200,key+' '+JSON.stringify(r.data))};
  await put('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',stage:'Sortie',mode:'Ambulatoire',identity:{lastName:'FICTIF',firstName:'Lina',birthDate:'1975-09-23'}});
  await put('stay/'+stay+'/consult',{ext:{surgeryDate:date}});
  await put('stay/'+stay+'/invitationContact',{contact:{firstName:'Lina',lastName:'FICTIF',birthDate:'1975-09-23',phone:'0612345678'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'});
  let r=await api('GET','/appel-j1');assert.equal(r.status,200);assert.equal(r.data.mode,'simulation');
  let p=r.data.patients.find(x=>x.stay===stay);assert.ok(p.aAppeler);assert.equal(p.telephone,'061*****78');assert.equal(p.naissance,undefined);
  r=await api('POST','/appel-j1',{action:'sans-reponse',stay,date});assert.equal(r.data.appel.statut,'sans-reponse');
  r=await api('POST','/appel-j1',{action:'simuler',stay,date,naissance:'12 mai 1980',reponses:{douleur:'sept'}});assert.equal(r.data.appel.identite,false);
  p=(await api('GET','/appel-j1')).data.patients.find(x=>x.stay===stay);assert.ok(!p.aAppeler);assert.ok(p.rappelInfirmier);assert.equal(p.appels.length,2);
  r=await api('POST','/appel-j1',{action:'simuler',stay,date,naissance:'23 septembre 1975',reponses:{douleur:'sept',nausees:'non',saignement:'non',temperature:'trente-huit cinq',miction:'non',respiration:'non',mollet:'non',moral:'oui'}});
  assert.equal(r.data.appel.statut,'joint');assert.ok(r.data.appel.alertes.some(a=>/Fièvre 38,5/.test(a.label)));
  r=await api('GET','/suivi-j1/alertes');const al=r.data.alertes.find(x=>x.stay===stay);assert.ok(al);assert.equal(al.alertes[0].source,'appel');
  p=(await api('GET','/appel-j1')).data.patients.find(x=>x.stay===stay);assert.equal(p.repondu,'appel');
  assert.equal((await call('POST','/api/telephonie/j1/a-appeler','{}')).status,404);
  // Opérateur branché : liste signée, résultat signé.
  app=await mk({TELEPHONIE_SECRET:SECRET});
  await put('stay/DÉMO-J1B/core',{id:'DÉMO-J1B',careTeamId:'demo-clinique',stage:'Sortie',identity:{lastName:'FICTIF',firstName:'Paul',birthDate:'1960-03-01'}});
  await put('stay/DÉMO-J1B/consult',{ext:{surgeryDate:date}});
  await put('stay/DÉMO-J1B/invitationContact',{contact:{firstName:'Paul',lastName:'FICTIF',birthDate:'1960-03-01',phone:'0700000000'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'});
  const signe=async corps=>{const ts=String(Math.floor(Date.now()/1000));return {'X-Iaselo-Horodatage':ts,'X-Iaselo-Signature':await signer(SECRET,ts,corps)}};
  assert.equal((await call('POST','/api/telephonie/j1/a-appeler','{}',{'X-Iaselo-Horodatage':'1','X-Iaselo-Signature':'x'})).status,401);
  let x=await call('POST','/api/telephonie/j1/a-appeler','{}',await signe('{}'));const liste=(await x.json()).appels;
  assert.deepEqual(liste.map(a=>a.stay),['DÉMO-J1B']);assert.equal(liste[0].numero,'0700000000');assert.match(liste[0].script.accueil,/de Paul/);
  const corps=JSON.stringify({stay:'DÉMO-J1B',date,naissance:'premier mars 1960',reponses:{douleur:'trois',nausees:'non',saignement:'non',temperature:'non',miction:'non',respiration:'oui',mollet:'non',moral:'oui'}});
  x=await call('POST','/api/telephonie/j1/resultat',corps,await signe(corps));const res=await x.json();assert.equal(x.status,200);assert.equal(res.urgence,true);
 }finally{await pool.end()}
});

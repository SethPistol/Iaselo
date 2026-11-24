import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}

// Annonce chirurgicale (24/11/2026) : chirurgien, anesthésiste, secrétariat et cadre de bloc créent le séjour d'un nouveau patient et rédigent l'annonce.
test('annonce chirurgicale : rédigée par chirurgien, anesthésiste, secrétariat et cadre de bloc, pas par les autres profils',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const at=new Date(Date.now()-60000).toISOString(),password='Mot de passe de test 2026';
  const people=[['chir','chirurgien',''],['mar','anesthesiste',''],['sec','secretariat',''],['cadre','infirmier','cadre'],['ide','infirmier','bloc'],['fact','facturation','']];
  for(const [n,job,poste] of people){const id=await createAccount(pool,{email:n+'@example.test',name:'Nom '+n,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3,poste=$4 WHERE user_id=$1',[id,job,at,poste]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query("INSERT INTO workspace_members(user_id,role) VALUES($1,'editor') ON CONFLICT (user_id) DO UPDATE SET role='editor'",[id]).catch(()=>{})}
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async n=>(await call('POST','/auth/login',{email:n+'@example.test',password})).headers.get('Set-Cookie').split(';')[0];
  const annonce={published:{fields:{procedure:'Arthroscopie du genou',laterality:'Droit',surgeon:'Dr Nom chir',urgency:'Programmée',mode:'Ambulatoire'},state:'Transmise',at:'24/11/2026',sentAt:new Date().toISOString(),revision:1}};
  const create=(cookie,id,extra={})=>call('POST','/api/workspace/commit',{documents:[{key:'stay/'+id+'/core',data:{id,identity:{lastName:'NOUVEAU',firstName:'Patient',birthDate:'1975-04-18'},specialty:'Orthopédie',mode:'Ambulatoire',stage:'Consultation',careTeamId:'demo-clinique',origin:'annonce',...extra},revision:0,operation:crypto.randomUUID(),reason:'Annonce chirurgicale'},{key:'stay/'+id+'/surgicalAnnouncement',data:annonce,revision:0,operation:crypto.randomUUID(),reason:'Annonce chirurgicale'}]},cookie);
  for(const n of ['chir','mar','sec','cadre']){const r=await create(await login(n),'DÉMO-'+n);assert.equal(r.status,200,n+' : '+await r.text())}
  // La cadre de bloc crée le séjour avec ses listes vides (prescriptions, événements), comme l'interface l'envoie.
  {const c=await login('cadre');for(const [k,data] of [['rx',[]],['events',[{at:'24/11/2026',role:'Infirmier',text:'Patient créé depuis une annonce chirurgicale',kind:'Identitovigilance'}]]]){const id='DÉMO-cadre-'+k,r=await call('POST','/api/workspace/commit',{documents:[{key:'stay/'+id+'/core',data:{id,identity:{lastName:'X',firstName:'Y',birthDate:'1970-01-01'},specialty:'ORL',mode:'Ambulatoire',stage:'Consultation',careTeamId:'demo-clinique'},revision:0,operation:crypto.randomUUID(),reason:'Annonce chirurgicale'},{key:'stay/'+id+'/'+k,data,revision:0,operation:crypto.randomUUID(),reason:'Annonce chirurgicale'}]},c);assert.equal(r.status,200,k+' '+await r.text())}}
  // Séjour créé par le secrétariat (sans liste de prescriptions) : l'infirmière l'initialise vide mais ne peut pas y écrire une prescription.
  {const c=await login('ide');const rx=data=>call('POST','/api/workspace/commit',{documents:[{key:'stay/DÉMO-sec/rx',data,revision:0,operation:crypto.randomUUID(),reason:'Initialisation'}]},c);
   assert.equal((await rx([{id:'x',drug:'Paracétamol'}])).status,403);assert.equal((await rx([])).status,200)}
  for(const n of ['ide','fact']){const r=await create(await login(n),'DÉMO-'+n);assert.equal(r.status,403,n+' ne crée pas de séjour par l’annonce')}
  // Une infirmière de bloc ne modifie pas l'annonce d'un séjour existant ; le secrétariat la lit et la modifie.
  const ws=async n=>(await (await call('GET','/api/workspace',undefined,await login(n))).json());
  const sec=await ws('sec'),doc=sec.documents.find(d=>d.key==='stay/DÉMO-chir/surgicalAnnouncement');
  assert.ok(doc,'le secrétariat lit l’annonce');assert.equal(sec.documents.find(d=>d.key==='stay/DÉMO-chir/core').data.origin,'annonce');
  const ide=await ws('ide'),idoc=ide.documents.find(d=>d.key==='stay/DÉMO-chir/surgicalAnnouncement');
  assert.equal((await call('POST','/api/workspace/commit',{documents:[{key:idoc.key,data:{...annonce,published:{...annonce.published,revision:2}},revision:idoc.revision,operation:crypto.randomUUID(),reason:'Annonce chirurgicale'}]},await login('ide'))).status,403);
  assert.equal((await call('POST','/api/workspace/commit',{documents:[{key:doc.key,data:{...annonce,published:{...annonce.published,revision:2}},revision:doc.revision,operation:crypto.randomUUID(),reason:'Annonce chirurgicale'}]},await login('sec'))).status,200);
  assert.ok(!sec.documents.some(d=>d.key==='stay/DÉMO-chir/consult'),'pas de données médicales pour le secrétariat');
  assert.equal((await ws('cadre')).access.profile.poste,'cadre');
 }finally{await db.close()}
});

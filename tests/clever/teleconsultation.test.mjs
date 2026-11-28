// Téléconsultation vidéo (5e veille, lot 7) : planification, salle, signalisation, fin. Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows??r.rows.length}};return {query,async connect(){return {query,release(){}}},async end(){await db.close()}}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const paris=d=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`};

test('téléconsultation : lien patient, salle, mise en relation, fin sans trace des signaux',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv:{VISIO_ICE_SERVERS:'[{"urls":"turn:relais.example.fr:3478","username":"u","credential":"c"}]'}});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:cookie});return {status:r.status,data:await r.json()}};
  const put=async(key,data)=>{const cur=(await api('GET','')).data.documents.find(d=>d.key===key);const r=await api('PUT','/document',{key,data,revision:cur?.revision||0,operation:crypto.randomUUID(),reason:'Test visio'});assert.equal(r.status,200,key+' '+JSON.stringify(r.data))};
  const s='DÉMO-TV1';
  await put('stay/'+s+'/core',{id:s,careTeamId:'demo-clinique',stage:'Sortie',mode:'Ambulatoire',identity:{lastName:'Fictif',firstName:'Léa',birthDate:'1980-02-03'}});
  let r=await api('POST','/visio',{action:'planifier',stay:s,debut:paris(new Date(Date.now()+5*60000)),motif:'cpa'});assert.equal(r.status,400);
  r=await api('POST','/visio',{action:'planifier',stay:s,debut:paris(new Date(Date.now()+5*60000)),motif:'suivi'});assert.equal(r.status,200,JSON.stringify(r.data));
  const id=r.data.salle.id,token=r.data.lien.match(/acces=([a-f0-9]{64})/)[1];assert.equal(r.data.envoi.ok,false);
  r=await api('GET','/visio/liste');assert.ok(r.data.salles.some(x=>x.id===id&&x.ouverte));assert.equal(r.data.relaisConfigure,true);assert.ok(r.data.sejours.some(x=>x.stay===s));
  const pat=async(route,data)=>{const q=await call('POST','/api/visio/'+route,{token,naissance:'1980-02-03',...data});return {status:q.status,data:await q.json()}};
  assert.equal((await pat('open',{naissance:'1980-02-04'})).status,403);
  let q=await pat('open');assert.equal(q.status,200);assert.equal(q.data.ouverte,true);assert.equal(q.data.iceServers[0].urls,'turn:relais.example.fr:3478');assert.doesNotMatch(JSON.stringify(q.data),/DÉMO|Fictif|suivi/i);
  // Mise en relation : patient prêt → le soignant le voit → offre → le patient la reçoit → réponse.
  assert.equal((await pat('signal',{type:'pret',data:null})).status,200);
  r=await api('GET','/visio/signal?id='+id+'&apres=0');assert.deepEqual(r.data.messages.map(m=>m.type),['pret']);
  assert.equal((await api('POST','/visio/signal',{id,type:'pret',data:null})).status,200);
  assert.equal((await api('POST','/visio/signal',{id,type:'offer',data:{type:'offer',sdp:'v=0\r\nfictif'}})).status,200);
  assert.equal((await api('POST','/visio/signal',{id,type:'offer',data:{type:'offer',sdp:'pas un sdp'}})).status,400);
  q=await pat('poll',{apres:0});assert.deepEqual(q.data.messages.map(m=>m.type),['pret','offer']);assert.equal(q.data.statut,'en-cours');
  const dernier=q.data.messages.at(-1).seq;
  assert.equal((await pat('signal',{type:'answer',data:{type:'answer',sdp:'v=0\r\nfictif'}})).status,200);
  r=await api('GET','/visio/signal?id='+id+'&apres=1');assert.deepEqual(r.data.messages.map(m=>m.type),['answer']);
  assert.equal((await pat('poll',{apres:dernier})).data.messages.length,0);
  // Fin : signaux effacés, salle fermée pour le patient.
  r=await api('POST','/visio',{action:'annuler',id});assert.equal(r.status,409,'appel en cours : terminer');
  r=await api('POST','/visio',{action:'terminer',id});assert.equal(r.data.salle.statut,'terminee');
  assert.equal((await pool.query('SELECT COUNT(*) AS n FROM visio_signaux WHERE salle_id=$1',[id])).rows[0].n,0);
  q=await pat('poll',{apres:0});assert.equal(q.status,409);
  // Nouveau lien : l'ancien ne marche plus ; 5 erreurs bloquent.
  r=await api('POST','/visio',{action:'planifier',stay:s,debut:paris(new Date(Date.now()+60*60000)),motif:'sortie'});const id2=r.data.salle.id,t2=r.data.lien.match(/acces=([a-f0-9]{64})/)[1];
  q=await call('POST','/api/visio/open',{token:t2,naissance:'1980-02-03'});assert.equal((await q.json()).tot,true,'ouvre 15 min avant');
  r=await api('POST','/visio',{action:'lien',id:id2});assert.equal(r.status,200);
  assert.equal((await call('POST','/api/visio/open',{token:t2,naissance:'1980-02-03'})).status,404);
  const t3=r.data.lien.match(/acces=([a-f0-9]{64})/)[1];for(let i=0;i<5;i++)await call('POST','/api/visio/open',{token:t3,naissance:'2000-01-01'});
  assert.equal((await call('POST','/api/visio/open',{token:t3,naissance:'1980-02-03'})).status,410);
  r=await api('POST','/visio',{action:'annuler',id:id2});assert.equal(r.data.salle.statut,'annulee');
 }finally{await db.close()}
});

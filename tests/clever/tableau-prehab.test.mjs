// Tableau de bord du praticien et préhabilitation (5e veille, lot 6). Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_INFIRMIERES} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows??r.rows.length}};return {query,async connect(){return {query,release(){}}},async end(){await db.close()}}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const jourParis=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(d);
const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};

test('tableau de bord du praticien et préhabilitation de bout en bout',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv:{}});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(email,password)=>(await call('POST','/auth/login',{email,password})).headers.get('Set-Cookie').split(';')[0];
  const as=c=>async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:c});return {status:r.status,data:await r.json()}};
  const api=as(await login(RECETTE_EMAIL,RECETTE_PASSWORD));
  const put=async(key,data)=>{const cur=(await api('GET','')).data.documents.find(d=>d.key===key);const r=await api('PUT','/document',{key,data,revision:cur?.revision||0,operation:crypto.randomUUID(),reason:'Test lot 6'});assert.equal(r.status,200,key+' '+JSON.stringify(r.data))};
  const jour=jourParis(),hier=decale(jour,-1);
  // Tableau de bord : un séjour opéré hier par moi (feuille d'anesthésie écrite par mon compte).
  const s1='DÉMO-TP1';
  await put('stay/'+s1+'/core',{id:s1,careTeamId:'demo-clinique',stage:'Hospitalisation',mode:'Hospitalisation',identity:{lastName:'Fictif',firstName:'Paul',birthDate:'1970-03-04'}});
  await put('stay/'+s1+'/perop',{context:{},records:[{id:'r1',kind:'Médicament',at:hier+'T08:10:00.000Z',values:{drug:'Céfazoline 2 g'},author:'Dr Démo'},{id:'r2',kind:'Événement',at:hier+'T08:45:00.000Z',values:{event:'Incision'},author:'Dr Démo'}]});
  await put('stay/'+s1+'/postopVitals',[{kind:'Surveillance',at:hier+'T12:00:00.000Z',values:{location:'SSPI',pain:'6',nvpo:'0'}}]);
  let r=await api('GET','/mon-tableau?jours=30');assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.moi.interventions,1);assert.equal(r.data.moi.antibio.taux,100);assert.equal(r.data.moi.douleur.taux,100);assert.equal(r.data.etablissement,null,'petit effectif masqué');
  assert.ok(r.data.aRevoir.some(x=>x.stay===s1&&/Douleur/.test(x.motifs.join())));
  assert.doesNotMatch(JSON.stringify(r.data.etablissement),/DÉMO/);
  const inf=RECETTE_INFIRMIERES.find(i=>i.poste==='etage'),ic=as(await login(inf.email,inf.password));
  assert.equal((await ic('GET','/mon-tableau')).status,403,'réservé aux médecins');
  // Préhabilitation : intervention dans 20 jours.
  const s2='DÉMO-PH1',dateInt=decale(jour,20);
  await put('stay/'+s2+'/core',{id:s2,careTeamId:'demo-clinique',stage:'Préopératoire',mode:'Hospitalisation',specialty:'Orthopédie',identity:{lastName:'Exemple',firstName:'Rose',birthDate:'1958-06-07'}});
  await put('stay/'+s2+'/consult',{ext:{surgeryDate:dateInt}});
  r=await api('GET','/prehab/tableau');assert.equal(r.status,200);assert.ok(r.data.aProposer.some(p=>p.stay===s2));
  r=await api('POST','/prehab/action',{action:'inscrire',stay:s2,items:['marche','exercices'],marcheMin:20,fumeur:true});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.envoi.ok,false,'pas de messagerie en test : QR code à remettre');
  const token=new URL(r.data.lien).hash.match(/acces=([a-f0-9]{64})/)[1];
  assert.equal((await api('POST','/prehab/action',{action:'inscrire',stay:s2})).status,409);
  const pat=async(route,data)=>{const q=await call('POST','/api/prehab/'+route,{token,...data});return {status:q.status,data:await q.json()}};
  let q=await pat('open',{naissance:'1958-06-08'});assert.equal(q.status,403);
  q=await pat('open',{naissance:'1958-06-07'});assert.equal(q.status,200);assert.deepEqual(q.data.items.map(i=>i.id),['marche','exercices','tabac']);assert.equal(q.data.objectifs.marcheMin,20);
  assert.doesNotMatch(JSON.stringify(q.data),/Orthopédie|DÉMO|Exemple/,'pas d’information médicale ni d’identifiant');
  q=await pat('jour',{naissance:'1958-06-07',date:jour,valeurs:{marche:25,exercices:'Oui'}});assert.equal(q.status,400,'réponse manquante');
  q=await pat('jour',{naissance:'1958-06-07',date:decale(jour,-5),valeurs:{marche:25,exercices:'Oui',tabac:'Non'}});assert.equal(q.status,400,'jour trop ancien');
  q=await pat('jour',{naissance:'1958-06-07',date:jour,valeurs:{marche:25,exercices:'Oui',tabac:'Non'}});assert.equal(q.status,200,JSON.stringify(q.data));assert.equal(q.data.adhesion.remplis,1);
  r=await api('GET','/prehab/tableau');const ins=r.data.inscrits.find(p=>p.stay===s2);assert.equal(ins.adhesion.remplis,1);assert.equal(ins.adhesion.taux,100);
  // Nouveau lien : l'ancien est révoqué. Arrêt : le lien ne marche plus.
  r=await api('POST','/prehab/action',{action:'lien',stay:s2});assert.equal(r.status,200);
  assert.equal((await pat('open',{naissance:'1958-06-07'})).status,410);
  const token2=new URL(r.data.lien).hash.match(/acces=([a-f0-9]{64})/)[1];
  r=await ic('POST','/prehab/action',{action:'arreter',stay:s2,motif:'Intervention reportée'});assert.equal(r.status,200,JSON.stringify(r.data));
  q=await call('POST','/api/prehab/open',{token:token2,naissance:'1958-06-07'});assert.equal(q.status,410);
  // Lien bloqué après 5 erreurs.
  r=await api('POST','/prehab/action',{action:'inscrire',stay:s2});const t3=new URL(r.data.lien).hash.match(/acces=([a-f0-9]{64})/)[1];
  for(let i=0;i<5;i++)await call('POST','/api/prehab/open',{token:t3,naissance:'2000-01-01'});
  assert.equal((await call('POST','/api/prehab/open',{token:t3,naissance:'1958-06-07'})).status,410);
  assert.equal((await app(new Request(origin+'/api/prehab/open',{method:'POST',headers:{Origin:'https://autre.example','Content-Type':'application/json'},body:'{}'}))).status,403);
 }finally{await db.close()}
});

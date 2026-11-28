// Alertes du bloc en temps réel et arrivée du patient par QR code (5e veille, lot 3). Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {paris} from '../../worker/accueil-bloc.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows??r.rows.length}};return {query,async connect(){return {query,release(){}}},async end(){await db.close()}}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('alertes du bloc calculées du programme, arrivée par QR code sans fuite d’information',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv:{}});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:cookie});return {status:r.status,data:await r.json()}};
  const put=async(key,data)=>{const cur=(await api('GET','')).data.documents.find(d=>d.key===key);const r=await api('PUT','/document',{key,data,revision:cur?.revision||0,operation:crypto.randomUUID(),reason:'Test accueil bloc'});assert.equal(r.status,200,key+' '+JSON.stringify(r.data))};
  const {jour}=paris(),s1='DÉMO-AB1',s2='DÉMO-AB2';
  await put('stay/'+s1+'/core',{id:s1,careTeamId:'demo-clinique',stage:'Intervention',mode:'Ambulatoire',identity:{lastName:'Fictif',firstName:'Lina',birthDate:'1975-09-23'}});
  await put('stay/'+s2+'/core',{id:s2,careTeamId:'demo-clinique',stage:'Préopératoire',mode:'Ambulatoire',identity:{lastName:'Exemple-Test',firstName:'Marc',birthDate:'1960-01-02'}});
  await put('management/planningResources',[{id:'salle-ab',label:'Salle 9',kind:'room',sector:'bloc-chir'}]);
  await put('management/reservations',[{id:'R-AB1',resource:'salle-ab',patient:s1,start:jour+'T00:05',end:jour+'T01:00',state:'Occupée',surgeon:'Dr Démo',etapes:{arrivee:jour+'T00:01',entree:jour+'T00:06'}},{id:'R-AB2',resource:'salle-ab',patient:s2,start:jour+'T23:50',end:jour+'T23:59',state:'Réservée',surgeon:'Dr Démo'}]);
  let r=await api('GET','/alertes-bloc');assert.equal(r.status,200);
  const types=r.data.alertes.map(a=>a.type);assert.ok(types.includes('arrivee')&&types.includes('entree')&&types.includes('preparer'),JSON.stringify(types));
  const prep=r.data.alertes.find(a=>a.type==='preparer');assert.equal(prep.stay,s2);assert.match(prep.texte,/Salle 9/);assert.doesNotMatch(prep.notification.corps,/Exemple|Fictif/,'pas de nom sur la notification');
  // Arrivées du jour : deux attendus.
  r=await api('GET','/arrivees');assert.equal(r.status,200);assert.equal(r.data.patients.length,2);assert.equal(r.data.patients.find(p=>p.stay===s2).arrivee,null);
  // Patient : mauvais nom → même réponse polie, rien n'est enregistré.
  let q=await call('POST','/api/arrivee',{nom:'Inconnu',naissance:'1960-01-02'});let j=await q.json();assert.equal(q.status,200);assert.equal(j.reconnu,false);assert.doesNotMatch(JSON.stringify(j),/Exemple|Salle|DÉMO/);
  q=await call('POST','/api/arrivee',{nom:'exemple test',naissance:'1960-01-02'});j=await q.json();assert.equal(j.reconnu,true);
  q=await call('POST','/api/arrivee',{nom:'Exemple-Test',naissance:'1960-01-02'});assert.equal((await q.json()).reconnu,true,'deuxième passage sans doublon');
  assert.equal((await call('POST','/api/arrivee',{nom:'x'})).status,400);
  assert.equal((await app(new Request(origin+'/api/arrivee',{method:'POST',headers:{Origin:'https://autre.example','Content-Type':'application/json'},body:'{}'}))).status,403);
  r=await api('GET','/arrivees');const a=r.data.patients.find(p=>p.stay===s2).arrivee;assert.equal(a.source,'qr');assert.equal(a.confirmePar,'');
  r=await api('GET','/alertes-bloc');assert.ok(r.data.alertes.some(x=>x.type==='arriveeClinique'&&x.stay===s2));
  r=await api('POST','/arrivees',{action:'confirmer',stay:s2});assert.equal(r.status,200);
  r=await api('GET','/arrivees');assert.ok(r.data.patients.find(p=>p.stay===s2).arrivee.confirmePar);
  r=await api('POST','/arrivees',{action:'arrive',stay:s1});assert.equal(r.status,200);
  r=await api('POST','/arrivees',{action:'annuler',stay:s1});assert.equal(r.status,200);assert.equal((await api('GET','/arrivees')).data.patients.find(p=>p.stay===s1).arrivee,null);
  // Limite : 8 essais par 10 minutes et par adresse.
  let dernier;for(let i=0;i<9;i++)dernier=await app(new Request(origin+'/api/arrivee',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-forwarded-for':'203.0.113.9'},body:JSON.stringify({nom:'Zz',naissance:'2000-01-01'})}));
  assert.equal(dernier.status,429);
 }finally{await db.close()}
});

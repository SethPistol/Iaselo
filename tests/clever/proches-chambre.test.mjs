// Information des proches (accord du patient, SMS sans donnée médicale, une fois par étape) et écran en chambre
// (lien haché, date de naissance, demandes vues par l'équipe). Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate,postgresBinding} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {tourneeProches} from '../../worker/proches-chambre.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('proches : accord requis, SMS par étape sans donnée médicale, pas de doublon, retrait ; écran en chambre',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push(m);return 'S1'},email:async()=>'E1'};
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const setDoc=async(key,data)=>{await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES($1,$2,1,'test',$3,$4,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data,operation=EXCLUDED.operation,revision=workspace_documents.revision+1",[key,JSON.stringify(data),new Date().toISOString(),crypto.randomUUID()])};
  let r0;const stay='DÉMO-PROCHES',core=stage=>setDoc('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',stage,mode:'Hospitalisation',identity:{lastName:'FICTIF',firstName:'Lina',birthDate:'1980-01-01'}});
  r0=await api('PUT','/document',{key:'stay/'+stay+'/core',data:{id:stay,careTeamId:'demo-clinique',stage:'Préopératoire',mode:'Hospitalisation',identity:{lastName:'FICTIF',firstName:'Lina',birthDate:'1980-01-01'}},revision:0,operation:crypto.randomUUID(),reason:'Test proches'});assert.equal(r0.status,200,JSON.stringify(r0.data));
  assert.equal((await api('POST','/proches',{action:'enregistrer',stay,proches:[{prenom:'Marc',telephone:'0612345678'}]})).status,400);
  let r=await api('POST','/proches',{action:'enregistrer',stay,accord:true,appellation:'prenom',proches:[{prenom:'Marc',telephone:'06 12 34 56 78'}]});assert.equal(r.status,200,JSON.stringify(r.data));
  r=await api('GET','/proches?stay='+encodeURIComponent(stay));assert.equal(r.data.info.proches[0].telephone,'06 ** ** ** 78');assert.match(r.data.info.accordPar,/./);
  // Modification sans retaper le portable masqué : le numéro enregistré est conservé.
  assert.equal((await api('POST','/proches',{action:'enregistrer',stay,accord:true,appellation:'neutre',proches:[{prenom:'Marc',telephone:'06 ** ** ** 78'}]})).status,200);
  const env2={DB:postgresBinding(pool),MESSAGING:messaging},logs=[],acl={log:async(...a)=>logs.push(a)};
  const midi=new Date('2026-11-27T11:00:00Z');
  // Préopératoire en chambre : aucun « retour en chambre » avant le bloc.
  await core('Hospitalisation');assert.equal((await tourneeProches(env2,acl,{now:midi})).length,0);
  await core('Intervention');r=await tourneeProches(env2,acl,{now:midi});assert.equal(r.length,1);assert.equal(sent.length,1);
  assert.equal(sent[0].to,'0612345678');assert.match(sent[0].content,/Nouvelles de votre proche : entrée au bloc opératoire à 12 h 00/);assert.doesNotMatch(sent[0].content,/Lina|FICTIF/);
  assert.equal((await tourneeProches(env2,acl,{now:midi})).length,0);// pas de doublon
  await core('SSPI');await tourneeProches(env2,acl,{now:new Date('2026-11-27T12:10:00Z')});await core('Hospitalisation');await tourneeProches(env2,acl,{now:new Date('2026-11-27T13:30:00Z')});
  assert.deepEqual(sent.map(s=>/bloc/.test(s.content)?'bloc':/réveil/.test(s.content)?'reveil':'chambre'),['bloc','reveil','chambre']);
  assert.equal((await tourneeProches(env2,acl,{now:new Date('2026-11-27T22:30:00Z')})).length,0);// la nuit : rien
  r=await api('POST','/proches',{action:'informer',stay,etape:'attente'});assert.equal(r.status,200);assert.equal(sent.length,4);
  r=await api('GET','/proches?stay='+encodeURIComponent(stay));assert.equal(r.data.envois.length,4);
  await api('POST','/proches',{action:'retirer',stay});assert.equal((await api('POST','/proches',{action:'informer',stay,etape:'attente'})).status,400);assert.equal(sent.length,4);
  // Écran en chambre.
  r=await api('POST','/chambre',{action:'lien',stay});assert.equal(r.status,200);const token=r.data.lien.split('acces=')[1];assert.match(token,/^[a-f0-9]{64}$/);
  const pat=async(route,d)=>{const x=await call('POST','/api/chambre/'+route,{token,...d});return {status:x.status,data:await x.json()}};
  assert.equal((await pat('open',{})).status,200);
  assert.equal((await pat('vue',{birthDate:'1999-09-09'})).status,400);
  r=await pat('vue',{birthDate:'1980-01-01'});assert.equal(r.status,200);assert.equal(r.data.prenom,'Lina');assert.ok(!JSON.stringify(r.data).includes('FICTIF'));
  assert.equal((await pat('demande',{birthDate:'1980-01-01',type:'douleur',valeur:8})).status,200);
  r=await api('GET','/chambre');assert.equal(r.data.demandes.length,1);assert.equal(r.data.demandes[0].priorite,'crit');
  await api('POST','/chambre',{action:'traiter',id:r.data.demandes[0].id});r=await api('GET','/chambre');assert.ok(r.data.demandes[0].traiteAt);
  r=await pat('vue',{birthDate:'1980-01-01'});assert.equal(r.data.demandes[0].vue,true);
  await api('POST','/chambre',{action:'revoquer',stay});assert.equal((await pat('vue',{birthDate:'1980-01-01'})).status,410);
  assert.equal((await call('GET','/api/workspace/chambre')).status,401);
 }finally{await pool.end()}
});

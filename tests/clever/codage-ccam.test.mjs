// Codage CCAM : le serveur refuse qu'un praticien modifie la part de l'autre ; l'Assurance maladie reprend
// les lignes validées avec leurs modificateurs et codes d'association (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {_testCcamIndex} from '../../worker/ccam-ref.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test codage'});

test('codage CCAM : parts du chirurgien et de l’anesthésiste contrôlées par le serveur',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  _testCcamIndex({MEMC005:{libelle:'Acromioplastie',tarifs:{'1':363.35,'4':142.65},modificateurs:{'1':'JK','4':'7A'}}},{K:{majoration:0.2},J:{majoration:0},'7':{majoration:0.04}});
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const owner=await login(RECETTE_EMAIL,RECETTE_PASSWORD),at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const job of ['chirurgien','anesthesiste','secretariat']){const id=await createAccount(pool,{email:job+'@example.test',name:'Dr '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at]);
   await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[job]=await login(job+'@example.test',password)}
  const api=async(method,route,data,ck)=>{const r=await call(method,'/api/workspace'+route,data,ck);return {status:r.status,data:await r.json()}};
  assert.equal((await api('PUT','/document',edit('stay/CC1/core',{id:'CC1',careTeamId:'demo-clinique',mode:'Ambulatoire',identity:{lastName:'TEST',firstName:'Codage',birthDate:'1980-01-01'}},0),owner)).status,200);
  const rev=async()=>(await pool.query("SELECT revision FROM workspace_documents WHERE key='stay/CC1/codage'")).rows[0]?.revision||0;
  const base={version:2,entete:{},lignes:[{id:'a',code:'MEMC005',activites:{'1':{coche:true,modificateurs:'KJ'},'4':{coche:false}},complements:{}}],validations:{},decisions:{}};
  let r=await api('POST','/commit',{documents:[edit('stay/CC1/codage',base,0)]},c.chirurgien);assert.equal(r.status,200,JSON.stringify(r.data));
  // L'anesthésiste coche et valide l'anesthésie : sa part seulement.
  const anes=structuredClone(base);anes.lignes[0].activites['4']={coche:true,modificateurs:'7'};anes.validations={'4':{par:'Dr anesthesiste',at}};
  r=await api('POST','/commit',{documents:[edit('stay/CC1/codage',anes,await rev())]},c.anesthesiste);assert.equal(r.status,200,JSON.stringify(r.data));
  // Le chirurgien ne peut pas modifier l'anesthésie…
  const triche=structuredClone(anes);triche.lignes[0].activites['4'].modificateurs='7A';
  assert.notEqual((await api('POST','/commit',{documents:[edit('stay/CC1/codage',triche,await rev())]},c.chirurgien)).status,200,'chirurgien : anesthésie refusée');
  // … ni l'anesthésiste les modificateurs du chirurgien.
  const triche2=structuredClone(anes);triche2.lignes[0].activites['1'].modificateurs='K';
  assert.notEqual((await api('POST','/commit',{documents:[edit('stay/CC1/codage',triche2,await rev())]},c.anesthesiste)).status,200,'anesthésiste : activité 1 refusée');
  assert.notEqual((await api('POST','/commit',{documents:[edit('stay/CC1/codage',anes,await rev())]},c.secretariat)).status,200,'secrétariat : pas de codage');
  const chir=structuredClone(anes);chir.validations['1']={par:'Dr chirurgien',at};
  r=await api('POST','/commit',{documents:[edit('stay/CC1/codage',chir,await rev())]},c.chirurgien);assert.equal(r.status,200,JSON.stringify(r.data));
  // L'Assurance maladie reprend les lignes validées, avec modificateurs, association et tarif de l'activité.
  const am=await api('POST','/marche/assurance',{action:'pmsi',stay:'CC1',pmsi:{entree:'2026-11-20',sortie:'2026-11-20'}},c.anesthesiste);assert.equal(am.status,200,JSON.stringify(am.data));
  const actes=am.data.dossier.contexte.actes;
  assert.deepEqual(actes.map(a=>[a.code,a.activite,a.modificateurs,a.association,a.tarif]),[['MEMC005','1','KJ','1',363.35],['MEMC005','4','7','1',142.65]]);
 }finally{_testCcamIndex(null);await db.close()}
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test poste infirmier'});

test('infirmier(ère) de bloc ou d’étage : check-list HAS et ouverture des salles réservées au bloc',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const at=new Date().toISOString(),password='Mot de passe de test 2026';
  // Compte infirmier existant avant la séparation : la migration le passe en « étage ».
  const id=await createAccount(pool,{email:'ide@example.test',name:'IDE Test',passwordHash:await hashPassword(password)});
  await pool.query("UPDATE professional_profiles SET profession='infirmier',poste='',updated_at=$2 WHERE user_id=$1",[id,at]);
  await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
  await pool.query("DELETE FROM app_migrations WHERE name='015_poste_infirmier.sql'");await migrate(pool);
  assert.equal((await pool.query('SELECT poste FROM professional_profiles WHERE user_id=$1',[id])).rows[0].poste,'etage');
  const app=await makeApp({pool,bucket:{},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(email,pw)=>(await call('POST','/auth/login',{email,password:pw})).headers.get('Set-Cookie').split(';')[0];
  const owner=await login(RECETTE_EMAIL,RECETTE_PASSWORD),ide=await login('ide@example.test',password);
  const api=async(method,route,data,c)=>{const r=await call(method,'/api/workspace'+route,data,c);return {status:r.status,data:await r.json()}};
  assert.equal((await api('PUT','/document',edit('stay/V1/core',{id:'V1',careTeamId:'demo-clinique'}),owner)).status,200);
  // Étage : profil exposé, pas de check-list HAS ni d'ouverture des salles, le reste du soin infirmier inchangé.
  assert.equal((await api('GET','/access',undefined,ide)).data.profile.poste,'etage');
  assert.equal((await api('POST','/commit',{documents:[edit('stay/V1/checklistBloc',{induction:{answers:{identite:'Oui'}}})]},ide)).status,403);
  assert.equal((await api('POST','/commit',{documents:[edit('stay/V1/blocStatut',{state:'arrive'})]},ide)).status,200);
  assert.equal((await api('GET','/ouverture-salles',undefined,ide)).status,403);
  // L'administrateur le passe infirmier(ère) de bloc : accès ouverts, changement tracé.
  assert.equal((await api('POST','/access/account',{userId:id,profession:'infirmier',poste:'reanimation',active:true,reason:'Affectation au bloc'},owner)).status,400);
  assert.equal((await api('POST','/access/account',{userId:id,profession:'infirmier',poste:'bloc',active:true,reason:'Affectation au bloc'},owner)).status,200);
  assert.equal((await api('GET','/access',undefined,ide)).data.profile.poste,'bloc');
  assert.equal((await api('POST','/commit',{documents:[edit('stay/V1/checklistBloc',{induction:{answers:{identite:'Oui'}}})]},ide)).status,200);
  const os=await api('GET','/ouverture-salles',undefined,ide);assert.equal(os.status,200);assert.equal(os.data.canSign.infirmier,true);
  const trace=(await pool.query("SELECT detail FROM professional_access_log WHERE action='account-permissions' AND target=$1",[id])).rows.at(-1);
  assert.match(trace.detail,/"poste":"etage".*"poste":"bloc"/);
  // Un autre métier n'a pas de poste.
  assert.equal((await api('POST','/access/account',{userId:id,profession:'secretariat',poste:'bloc',active:true,reason:'Changement de métier'},owner)).status,200);
  assert.equal((await pool.query('SELECT poste FROM professional_profiles WHERE user_id=$1',[id])).rows[0].poste,'');
 }finally{await db.close()}
});

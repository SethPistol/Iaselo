import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
test('indicateurs : agrégés pour l’administration, refusés aux soignants, sans identité, tracés',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const at=new Date().toISOString(),password='Mot de passe de test 2026';
  for(const [email,job] of [['direction@example.test','administration'],['ide@example.test','infirmier']]){const id=await createAccount(pool,{email,name:job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]).catch(()=>{})}
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const owner=await login(RECETTE_EMAIL,RECETTE_PASSWORD),direction=await login('direction@example.test',password),ide=await login('ide@example.test',password);
  const stay=(id,stage,mode)=>({key:'stay/'+id+'/core',data:{id,careTeamId:'demo-clinique',stage,mode,specialty:'Orthopédie',identity:{lastName:'NOMSECRET',firstName:'Test',birthDate:'1980-01-01'}}});
  assert.equal((await call('POST','/api/workspace/seed',{documents:[stay('IND1','SSPI','Ambulatoire'),stay('IND2','Hospitalisation','Hospitalisation'),stay('IND3','Sortie','Ambulatoire')]},owner)).status,200);
  const r=await call('GET','/api/workspace/indicateurs?date=2026-11-24',undefined,direction);assert.equal(r.status,200);const text=await r.text(),d=JSON.parse(text);
  assert.equal(d.sejours.total,3);assert.equal(d.sejours.enCours,2);assert.deepEqual(d.sejours.parSpecialite,[{label:'Orthopédie',n:3}]);
  for(const s of ['NOMSECRET','IND1','1980-01-01'])assert.ok(!text.includes(s),s+' ne doit pas sortir');
  assert.equal((await call('GET','/api/workspace/indicateurs',undefined,owner)).status,200,'administrateur des habilitations');
  assert.equal((await call('GET','/api/workspace/indicateurs',undefined,ide)).status,403,'infirmier refusé');
  assert.equal((await call('GET','/api/workspace/indicateurs?date=hier',undefined,direction)).status,400);
  // Le profil Administration ne lit toujours aucun dossier nominatif.
  const ws=await (await call('GET','/api/workspace',undefined,direction)).json();assert.ok(!ws.documents.some(x=>x.key.startsWith('stay/')),'aucun séjour nominatif');
  const log=(await pool.query("SELECT result FROM professional_access_log WHERE target='management/indicateurs' ORDER BY sequence")).rows.map(x=>x.result);
  assert.ok(log.includes('allowed')&&log.includes('denied'),'lectures et refus tracés');
 }finally{await db.close()}
});

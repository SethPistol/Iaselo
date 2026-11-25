import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}

test('ouverture des salles : chaque partie signée par son métier, le jour même, tracée',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const at=new Date().toISOString(),password='Mot de passe de test 2026';
  for(const [email,job,poste] of [['ide@example.test','infirmier','bloc'],['etage@example.test','infirmier','etage'],['mar@example.test','anesthesiste',''],['sec@example.test','secretariat','']]){const id=await createAccount(pool,{email,name:'Nom '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3,poste=$4 WHERE user_id=$1',[id,job,at,poste]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]).catch(()=>{})}
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const owner=await login(RECETTE_EMAIL,RECETTE_PASSWORD),ide=await login('ide@example.test',password),mar=await login('mar@example.test',password),sec=await login('sec@example.test',password),etage=await login('etage@example.test',password);
  assert.equal((await call('POST','/api/workspace/seed',{documents:[{key:'management/planningResources',data:[{id:'S1',label:'Salle 1',sector:'bloc-chir'},{id:'S9',label:'Salle fermée',sector:'bloc-chir',open:false}]}]},owner)).status,200);
  const g=await (await call('GET','/api/workspace/ouverture-salles',undefined,ide)).json();
  assert.deepEqual(g.rooms.map(r=>r.id),['S1']);assert.deepEqual(g.canSign,{infirmier:true,anesthesie:false});
  const today=g.today,R=(await import('../../dist/ouverture-salles-regles.js')).default,tout=part=>Object.fromEntries(R.PARTIES[part].items.map(([k])=>[k,'conforme']));
  const signe=(cookie,part,extra={})=>call('POST','/api/workspace/ouverture-salles',{date:today,room:'S1',part,items:tout(part),conclusion:'operationnelle',...extra},cookie);
  assert.equal((await signe(mar,'infirmier')).status,403,'partie infirmière refusée à l’anesthésiste');
  assert.equal((await signe(ide,'anesthesie')).status,403,'partie anesthésie refusée à l’infirmier');
  assert.equal((await signe(ide,'infirmier',{date:'2020-01-01'})).status,400,'pas d’antidatage');
  assert.equal((await signe(ide,'infirmier',{room:'S9'})).status,400,'salle fermée');
  assert.equal((await signe(ide,'infirmier',{items:{...tout('infirmier'),eclairage:'non-conforme'}})).status,400,'défaut sans commentaire');
  const ok=await signe(ide,'infirmier');assert.equal(ok.status,200);assert.equal((await ok.json()).record.author,'Nom infirmier');
  assert.equal((await signe(mar,'anesthesie',{comment:'RAS'})).status,200);
  const lu=await (await call('GET','/api/workspace/ouverture-salles?date='+today,undefined,mar)).json();
  assert.equal(R.etatSalle(lu.records,'S1').code,'ouverte');
  assert.deepEqual(lu.parts,['infirmier','anesthesie']);assert.deepEqual(lu.records.map(r=>r.part).sort(),['anesthesie','infirmier'],'l’anesthésiste voit la partie infirmière');assert.equal(lu.canSign.infirmier,false,'en lecture seule');
  const lendemain=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  assert.equal((await (await call('GET','/api/workspace/ouverture-salles?date='+lendemain,undefined,mar)).json()).precedente,today,'journée vide : dernière journée signée proposée');
  // L'infirmière ne reçoit jamais la partie anesthésie.
  const vuIde=await (await call('GET','/api/workspace/ouverture-salles?date='+today,undefined,ide)).json();
  assert.deepEqual(vuIde.parts,['infirmier']);assert.deepEqual(vuIde.records.map(r=>r.part),['infirmier']);assert.ok(!JSON.stringify(vuIde).includes('RAS'),'remarques anesthésie absentes');
  assert.equal(R.etatSalle(vuIde.records,'S1',vuIde.parts).code,'ouverte');assert.equal(R.etatSalle(vuIde.records,'S1',vuIde.parts).anesthesie,null);
  assert.equal((await call('GET','/api/workspace/ouverture-salles',undefined,sec)).status,403,'secrétariat hors bloc');
  assert.equal((await call('GET','/api/workspace/ouverture-salles',undefined,etage)).status,403,'infirmière d’étage hors bloc');
  assert.equal((await signe(etage,'infirmier')).status,403,'partie infirmière refusée à l’infirmière d’étage');
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE target='management/ouverture-salles'")).rows;
  assert.equal(log.filter(x=>x.action==='write'&&x.result==='allowed').length,2);assert.ok(log.some(x=>x.result==='denied'));
  // Jamais modifiable par le dossier partagé.
  assert.notEqual((await call('POST','/api/workspace/commit',{documents:[{key:'management/ouvertureSalles',data:[],revision:0}]},mar)).status,200);
 }finally{await db.close()}
});

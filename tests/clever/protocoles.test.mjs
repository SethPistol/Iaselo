// Protocoles de prescription partagés : l'administrateur crée et met à jour (versions tracées, motif exigé,
// pas d'écrasement entre postes) ; les médecins du séjour les reprennent ; les autres métiers sont refusés.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('protocoles de prescription : gestion par l’administrateur, reprise par les médecins, versions tracées',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD);await call('GET','/api/workspace',undefined,admin);
  const api=async(cookie,method,q,data)=>{const r=await call(method,'/api/workspace/protocoles'+(q||''),data,cookie);return {status:r.status,data:await r.json()}};
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const job of ['anesthesiste','chirurgien','infirmier','secretariat']){
   const id=await createAccount(pool,{email:job+'@example.test',name:'Dr '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at]);
   if(job!=='chirurgien')await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[job]=await login(job+'@example.test',password)}
  await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES('stay/PR1/core',$1,1,'test',$2,'op-pr1','test')",[JSON.stringify({id:'PR1',careTeamId:'demo-clinique'}),at]);
  await pool.query("INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES('PR1','demo-clinique',$1) ON CONFLICT DO NOTHING",[at]);
  const {anesthesiste:mar,chirurgien:chir,infirmier:ide,secretariat:sec}=c;
  const proto={nom:'Prothèse totale de hanche',type:'preop',specialite:'Orthopédie',description:'CME du 20/11/2026',contenu:{bilans:{ids:['nfs','groupe','rai'],delaiJours:3},jeune:{inclure:true,solides:6,liquides:2},autres:'Venir accompagné(e).'}};

  assert.equal((await api(ide,'GET')).status,403,'infirmier : pas d’accès');
  assert.equal((await api(sec,'GET')).status,403,'secrétariat : pas d’accès');
  assert.equal((await api(mar,'POST','',{action:'enregistrer',protocole:proto})).status,403,'un médecin ne crée pas de protocole');
  assert.equal((await api(admin,'POST','',{action:'enregistrer',protocole:{...proto,nom:''}})).status,400);
  let r=await api(admin,'POST','',{action:'enregistrer',protocole:proto});assert.equal(r.status,200,JSON.stringify(r.data));
  const p1=r.data.protocole;assert.equal(p1.version,1);assert.equal(p1.statut,'actif');assert.match(p1.hash,/^[a-f0-9]{64}$/);
  // Mise à jour : motif exigé, version lue exigée.
  const maj={...proto,contenu:{...proto.contenu,jeune:{inclure:true,solides:6,liquides:1}}};
  assert.equal((await api(admin,'POST','',{action:'enregistrer',id:p1.id,version:1,protocole:maj,motif:''})).status,400,'motif exigé');
  assert.equal((await api(admin,'POST','',{action:'enregistrer',id:p1.id,version:1,protocole:proto,motif:'Aucun changement'})).status,400,'rien à enregistrer');
  r=await api(admin,'POST','',{action:'enregistrer',id:p1.id,version:1,protocole:maj,motif:'Liquides clairs jusqu’à 1 h (ESAIC)'});assert.equal(r.status,200);assert.equal(r.data.protocole.version,2);
  assert.equal((await api(admin,'POST','',{action:'enregistrer',id:p1.id,version:1,protocole:proto,motif:'Ancienne version lue'})).status,409,'pas d’écrasement silencieux');
  assert.equal((await api(admin,'POST','',{action:'enregistrer',id:p1.id,version:2,protocole:{...maj,type:'postop',contenu:{lignes:[{name:'X',instructions:'Y'}]}},motif:'Changer de type'})).status,400,'type inchangé');
  // Reprise par le médecin du séjour.
  let l=await api(mar,'GET');assert.equal(l.status,200);assert.equal(l.data.peutGerer,false);assert.equal(l.data.protocoles.length,1);assert.equal(l.data.protocoles[0].contenu.jeune.liquides,1);
  assert.equal((await api(mar,'POST','',{action:'reprendre',id:p1.id,version:1,stay:'PR1'})).status,409,'version périmée');
  assert.equal((await api(chir,'POST','',{action:'reprendre',id:p1.id,version:2,stay:'PR1'})).status,403,'séjour hors équipe');
  r=await api(mar,'POST','',{action:'reprendre',id:p1.id,version:2,stay:'PR1'});assert.equal(r.status,200);assert.equal(r.data.protocole.version,2);
  // Historique : deux versions, motif, reprise comptée.
  const h=await api(admin,'GET','?id='+p1.id+'&historique=1');assert.deepEqual(h.data.versions.map(v=>[v.version,v.action]),[[2,'modification'],[1,'creation']]);
  assert.match(h.data.versions[0].motif,/ESAIC/);assert.equal(h.data.versions[1].contenu.jeune.liquides,2,'ancienne version conservée telle quelle');
  assert.deepEqual(h.data.reprises.map(x=>[x.version,x.cible,x.n]),[[2,'prescriptionsPreop',1]]);
  // Retrait : plus proposé aux médecins, toujours visible pour l'administrateur.
  assert.equal((await api(admin,'POST','',{action:'retirer',id:p1.id,version:2,motif:''})).status,400);
  r=await api(admin,'POST','',{action:'retirer',id:p1.id,version:2,motif:'Remplacé par un protocole commun'});assert.equal(r.data.protocole.statut,'archive');assert.equal(r.data.protocole.version,3);
  assert.equal((await api(mar,'GET')).data.protocoles.length,0);assert.equal((await api(admin,'GET')).data.protocoles.length,1);
  assert.equal((await api(mar,'POST','',{action:'reprendre',id:p1.id,version:3,stay:'PR1'})).status,404);
  // Les versions sont immuables.
  await assert.rejects(pool.query("UPDATE prescription_protocol_versions SET motif='x' WHERE protocol_id=$1",[p1.id]));
  await assert.rejects(pool.query("DELETE FROM prescription_protocol_uses"));
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE action LIKE 'protocole-%' OR target='protocoles'")).rows;
  assert.ok(log.some(x=>x.action==='protocole-creation')&&log.some(x=>x.action==='protocole-repris')&&log.some(x=>x.result==='denied'));
 }finally{await db.close()}
});

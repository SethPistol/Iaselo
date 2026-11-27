// Bloc prédictif : liste d'attente (secrétariat), proposition de créneau, libération par le titulaire, bourse aux créneaux
// (demande d'un autre chirurgien, attribution par le cadre), droits contrôlés par le serveur, historique non modifiable.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080';

test('bloc prédictif : liste d’attente, libération, bourse aux créneaux, droits et traçabilité',async()=>{
 const env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 const db=new PGlite(),pool=pgPool(db);await migrate(pool);await bootstrap(pool,env);
 const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
 const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
 const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
 const api=async(cookie,data)=>{const r=await call(data?'POST':'GET','/api/workspace/bloc-optimisation',data,cookie);return {status:r.status,data:await r.json()}};
 try{
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const [k,job,poste,name] of [['martin','chirurgien','','Dr Martin'],['durand','chirurgien','','Dr Durand'],['secr','secretariat','','Secrétaire'],['cadre','infirmier','cadre','Cadre de bloc'],['pharma','pharmacien','','Pharmacien']]){
   const email=k+'@example.test',id=await createAccount(pool,{email,name,passwordHash:await hashPassword(password)});
   await pool.query('UPDATE professional_profiles SET profession=$2,poste=$3,display_name=$4,updated_at=$5 WHERE user_id=$1',[id,job,poste,name,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
   await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[k]=await login(email,password)}
  const day=new Date(Date.now()+10*864e5).toISOString().slice(0,10);
  const vac=[{id:'V1',resource:'bloc-1',surgeon:'Dr Martin',label:'Ortho',start:day+'T08:00',end:day+'T13:00',staffIds:[],state:'Ouverte'}];
  await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES('management/vacations',$1,1,'test',$2,$3,'test')",[JSON.stringify(vac),at,'op-'+Date.now()]);

  assert.equal((await api(c.pharma)).status,403,'pharmacien refusé');
  // Le secrétariat inscrit un patient du Dr Martin.
  const add=await api(c.secr,{action:'attente-ajouter',stay:'S-1',surgeon:'Dr Martin',dureeMin:90,desDe:day,prevenanceHeures:48});
  assert.equal(add.status,200,JSON.stringify(add.data));
  assert.equal((await api(c.secr,{action:'attente-ajouter',stay:'S-1',surgeon:'Dr Martin',dureeMin:90})).status,409,'pas de doublon');
  assert.equal((await api(c.secr,{action:'attente-ajouter',stay:'S-2',surgeon:'Dr Martin',dureeMin:3})).status,400,'durée contrôlée');
  // Le Dr Durand ne voit pas les patients du Dr Martin ; le Dr Martin les voit.
  assert.equal((await api(c.durand)).data.liste.length,0);assert.equal((await api(c.martin)).data.liste.length,1);
  // Un chirurgien ne peut pas faire de proposition au patient ; le secrétariat oui (sans SMS configuré : à appeler).
  assert.equal((await api(c.martin,{action:'proposer',id:add.data.id,creneau:{start:day+'T08:00',resource:'bloc-1',vacationId:'V1'}})).status,403);
  const prop=await api(c.secr,{action:'proposer',id:add.data.id,creneau:{start:day+'T08:00',resource:'bloc-1',vacationId:'V1'}});
  assert.equal(prop.status,200);assert.equal(prop.data.sms.envoye,false);assert.match(prop.data.sms.raison,/numéro|appelez/);
  assert.equal((await api(c.secr,{action:'reponse',id:add.data.id,accepte:true})).data.aReprogrammer,true);

  // Libération : le Dr Durand n'est pas titulaire ; le cadre relance, le Dr Martin libère avec un motif.
  assert.equal((await api(c.durand,{action:'liberer',vacationId:'V1',motif:'congés'})).status,403);
  assert.equal((await api(c.secr,{action:'liberation-demander',vacationId:'V1'})).status,403,'le secrétariat ne relance pas');
  assert.equal((await api(c.cadre,{action:'liberation-demander',vacationId:'V1'})).status,200);
  assert.equal((await api(c.martin)).data.liberations.filter(l=>l.pourMoi&&l.status==='demandee').length,1,'le titulaire voit la relance');
  assert.equal((await api(c.martin,{action:'liberer',vacationId:'V1',motif:''})).status,400,'motif exigé');
  assert.equal((await api(c.martin,{action:'liberer',vacationId:'V1',motif:'Congés'})).status,200);
  let doc=JSON.parse((await pool.query("SELECT data,revision FROM workspace_documents WHERE key='management/vacations'")).rows[0].data);
  assert.equal(doc[0].surgeon,'');assert.equal(doc[0].titulaireInitial,'Dr Martin');assert.equal(doc[0].liberee.motif,'Congés');
  // Bourse : le Dr Durand demande, le cadre attribue.
  assert.equal((await api(c.secr,{action:'demander',vacationId:'V1'})).status,403);
  const dem=await api(c.durand,{action:'demander',vacationId:'V1'});assert.equal(dem.status,200);
  assert.equal((await api(c.durand,{action:'attribuer',vacationId:'V1',demandeId:dem.data.id})).status,403,'un chirurgien ne s’attribue pas la vacation');
  assert.equal((await api(c.cadre,{action:'attribuer',vacationId:'V1',demandeId:dem.data.id})).status,200);
  doc=JSON.parse((await pool.query("SELECT data FROM workspace_documents WHERE key='management/vacations'")).rows[0].data);
  assert.equal(doc[0].surgeon,'Dr Durand');assert.equal(doc[0].liberee,undefined);assert.equal(doc[0].attribuee.depuis,'Dr Martin');
  // Versions du document conservées, historique non modifiable.
  assert.ok((await pool.query("SELECT count(*)::int n FROM workspace_versions WHERE key='management/vacations'")).rows[0].n>=2);
  const h=(await pool.query('SELECT action FROM bloc_optimisation_history ORDER BY sequence')).rows.map(r=>r.action);
  assert.deepEqual(h,['ajout','proposition','accepte','demande-liberation','liberee','liberation','demande-creneau','attribution']);
  await assert.rejects(pool.query("UPDATE bloc_optimisation_history SET detail='x'"));
 }finally{await pool.end()}
});

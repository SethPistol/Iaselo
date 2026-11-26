// Plannings infirmiers : le cadre prépare et valide (versions tracées, motif exigé) ; les infirmier(ère)s lisent la
// dernière version validée de leur service, sans jamais pouvoir enregistrer ni valider ; les autres métiers sont refusés.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CADRE_EMAIL,RECETTE_CADRE_PASSWORD,RECETTE_INFIRMIERES} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080';

async function monter(recette){
 const env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',...(recette?{IASELO_RECETTE:'true'}:{BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_PASSWORD_HASH:await hashPassword('Mot de passe admin 2026')})};
 const db=new PGlite(),pool=pgPool(db);await migrate(pool);await bootstrap(pool,env);
 const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
 const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
 const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
 const api=async(cookie,method,q,data)=>{const r=await call(method,'/api/workspace/plannings-infirmiers'+(q||''),data,cookie);return {status:r.status,data:await r.json()}};
 return {db,pool,call,login,api};
}

test('plannings infirmiers : le cadre valide, les infirmières lisent sans modifier, tout est tracé',async()=>{
 const {db,pool,call,login,api}=await monter(true);
 try{
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const [job,poste] of [['infirmier','cadre'],['infirmier','cadre-etage'],['infirmier','bloc'],['infirmier','etage'],['anesthesiste',''],['secretariat','']]){
   const email=job+poste+'@example.test',id=await createAccount(pool,{email,name:'Nom '+job+' '+poste,passwordHash:await hashPassword(password)});
   await pool.query('UPDATE professional_profiles SET profession=$2,poste=$3,updated_at=$4 WHERE user_id=$1',[id,job,poste,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
   await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[poste||job]={id,cookie:await login(email,password)}}
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD);await call('GET','/api/workspace',undefined,admin);
  const cadre=c.cadre.cookie,ibloc=c.bloc.cookie,ietage=c.etage.cookie;
  assert.equal((await api(c.anesthesiste.cookie,'GET')).status,403,'anesthésiste refusé');
  assert.equal((await api(c.secretariat.cookie,'GET')).status,403,'secrétariat refusé');
  // Plannings fictifs de recette : mois en cours validé, mois suivant en brouillon, bloc et étage.
  const mois=new Date().toISOString().slice(0,7),suivant=(await import('../../dist/plannings-infirmiers-regles.js')).default.moisVoisin(mois,1);
  let r=await api(cadre,'GET','?service=bloc&mois='+mois);assert.equal(r.status,200);assert.equal(r.data.peutGerer,true);assert.equal(r.data.planning.statut,'valide');
  assert.ok(r.data.planning.personnes.some(p=>p.nom==='Cadre de bloc (recette)'),'compte cadre de test au planning');assert.ok(r.data.planning.personnes.some(p=>/Fictif/.test(p.nom)));
  assert.ok(r.data.comptes.some(x=>x.userId===c.bloc.id),'comptes infirmiers proposés au cadre');
  assert.equal((await api(cadre,'GET','?service=bloc&mois='+suivant)).data.planning.statut,'brouillon');
  // L'infirmière de bloc ne voit que le bloc, jamais le brouillon ; l'étage lui est refusé.
  r=await api(ibloc,'GET','?service=bloc&mois='+mois);assert.equal(r.status,200);assert.equal(r.data.peutGerer,false);assert.deepEqual(r.data.services,['bloc']);assert.equal(r.data.comptes,undefined);
  assert.equal((await api(ibloc,'GET','?service=bloc&mois='+suivant)).data.planning,null,'brouillon jamais montré');
  assert.equal((await api(ibloc,'GET','?service=etage&mois='+mois)).status,403);
  assert.equal((await api(ietage,'GET','?service=bloc&mois='+mois)).status,403);
  assert.deepEqual((await api(ietage,'GET','?mois='+mois)).data.services,['etage']);
  // RGPD : l'arrêt maladie d'une collègue apparaît « Absence ».
  const vu=JSON.stringify((await api(ibloc,'GET','?service=bloc&mois='+mois)).data.planning.affectations),vuCadre=JSON.stringify((await api(cadre,'GET','?service=bloc&mois='+mois)).data.planning.affectations);
  assert.ok(vuCadre.includes('"MAL"')&&!vu.includes('"MAL"'),'motif de santé masqué aux collègues');
  // L'infirmière ne peut ni enregistrer ni valider, même en appelant le serveur directement.
  const plan={personnes:[{id:'p1',nom:'Nom infirmier bloc',userId:c.bloc.id},{id:'p2',nom:'Intérimaire Fictif'}],affectations:{p1:{[mois+'-01']:{code:'J'},[mois+'-02']:{code:'J'}},p2:{[mois+'-01']:{code:'N'}}}};
  for(const cookie of [ibloc,ietage,c.anesthesiste.cookie,admin]){
   assert.equal((await api(cookie,'POST','',{action:'enregistrer',service:'bloc',mois:'2030-01',planning:plan})).status,403);
   assert.equal((await api(cookie,'POST','',{action:'valider',service:'bloc',mois:suivant,version:1})).status,403)}
  // Le cadre crée, enregistre, valide.
  const m='2030-01',p1={...plan,affectations:{p1:{'2030-01-01':{code:'J'},'2030-01-02':{code:'J'}},p2:{'2030-01-01':{code:'N'}}}};
  assert.equal((await api(cadre,'POST','',{action:'enregistrer',service:'bloc',mois:m,planning:{personnes:[]}})).status,400);
  r=await api(cadre,'POST','',{action:'enregistrer',service:'bloc',mois:m,planning:p1});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.version,1);assert.equal(r.data.statut,'brouillon');
  assert.equal((await api(cadre,'POST','',{action:'enregistrer',service:'bloc',mois:m,version:1,planning:p1})).status,400,'rien à enregistrer');
  assert.equal((await api(ibloc,'GET','?service=bloc&mois='+m)).data.planning,null,'brouillon invisible');
  // Alerte (repos < 11 h) : validation avec motif obligatoire.
  const p2={...p1,affectations:{...p1.affectations,p1:{'2030-01-01':{code:'G'},'2030-01-02':{code:'J'}}}};
  r=await api(cadre,'POST','',{action:'enregistrer',service:'bloc',mois:m,version:1,planning:p2});assert.equal(r.data.alertes,1);
  assert.equal((await api(cadre,'POST','',{action:'valider',service:'bloc',mois:m,version:1})).status,409,'version périmée');
  assert.equal((await api(cadre,'POST','',{action:'valider',service:'bloc',mois:m,version:2})).status,400,'motif exigé malgré alerte');
  r=await api(cadre,'POST','',{action:'valider',service:'bloc',mois:m,version:2,motif:'Renfort exceptionnel, accord de l’agent'});assert.equal(r.status,200);assert.equal(r.data.version,3);
  r=await api(ibloc,'GET','?service=bloc&mois='+m);assert.equal(r.data.planning.statut,'valide');assert.equal(r.data.planning.validePar,'Nom infirmier cadre');assert.equal(r.data.planning.affectations.p1['2030-01-01'].code,'G');
  // Modification d'un planning validé : motif exigé ; les infirmières gardent la version validée jusqu'à revalidation.
  const p3={...p1};assert.equal((await api(cadre,'POST','',{action:'enregistrer',service:'bloc',mois:m,version:3,planning:p3})).status,400);
  r=await api(cadre,'POST','',{action:'enregistrer',service:'bloc',mois:m,version:3,planning:p3,motif:'Garde déplacée'});assert.equal(r.data.statut,'modifie');
  r=await api(ibloc,'GET','?service=bloc&mois='+m);assert.equal(r.data.planning.affectations.p1['2030-01-01'].code,'G','version validée toujours affichée');assert.equal(r.data.planning.miseAJourEnCours,true);
  assert.equal((await api(cadre,'POST','',{action:'valider',service:'bloc',mois:m,version:4})).status,200);
  assert.equal((await api(ibloc,'GET','?service=bloc&mois='+m)).data.planning.affectations.p1['2030-01-01'].code,'J');
  // Historique : cadre et administrateur, pas les infirmières.
  assert.equal((await api(ibloc,'GET','?service=bloc&mois='+m+'&historique=1')).status,403);
  const h=await api(admin,'GET','?service=bloc&mois='+m+'&historique=1');assert.deepEqual(h.data.versions.map(v=>[v.version,v.action]),[[5,'validation'],[4,'modification'],[3,'validation'],[2,'modification'],[1,'creation']]);
  assert.match(h.data.versions[2].motif,/Renfort/);assert.ok(h.data.versions[1].changements.some(x=>/G → J/.test(x)));
  // L'administrateur lit sans gérer.
  assert.equal((await api(admin,'GET','?service=etage&mois='+mois)).data.peutGerer,false);
  // Versions immuables ; journal des accès.
  await assert.rejects(pool.query("UPDATE nurse_schedule_versions SET motif='x'"));await assert.rejects(pool.query('DELETE FROM nurse_schedule_versions'));
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE target LIKE 'plannings-infirmiers%'")).rows;
  assert.ok(log.some(x=>x.action==='planning-valide')&&log.some(x=>x.action==='planning-enregistre')&&log.filter(x=>x.result==='denied').length>=8);
  // Cadre d'étage : gère l'étage et, en remplacement, le bloc ; garde les droits d'une infirmière d'étage ailleurs.
  const ce=c['cadre-etage'].cookie;r=await api(ce,'GET','?mois='+m);assert.equal(r.data.service,'etage','service par défaut : le sien');assert.deepEqual(r.data.services,['etage','bloc']);assert.equal(r.data.peutGerer,true);
  r=await api(ce,'GET','?service=bloc&mois='+m);assert.equal(r.data.planning.version,5);
  r=await api(ce,'POST','',{action:'enregistrer',service:'bloc',mois:m,version:5,planning:p2,motif:'Remplacement du cadre de bloc'});assert.equal(r.status,200);assert.equal(r.data.statut,'modifie');
  r=await api(ce,'POST','',{action:'valider',service:'bloc',mois:m,version:6,motif:'Validé en remplacement du cadre de bloc'});assert.equal(r.status,200);
  assert.equal((await api(ibloc,'GET','?service=bloc&mois='+m)).data.planning.validePar,'Nom infirmier cadre-etage');
  r=await api(cadre,'POST','',{action:'enregistrer',service:'etage',mois:m,planning:p1});assert.equal(r.status,200,'le cadre de bloc gère aussi l’étage');
  assert.equal((await call('GET','/api/workspace/ouverture-salles',undefined,ce)).status,403,'cadre d’étage : pas de droits du bloc');
  // Comptes de test de recette : cadre et infirmières.
  for(const e of [RECETTE_CADRE_EMAIL,...RECETTE_INFIRMIERES.map(x=>x.email)])assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1',[e])).rows.length,1);
  assert.ok(RECETTE_CADRE_PASSWORD);
 }finally{await db.close()}
});

test('plannings infirmiers : aucune donnée fictive ni compte de test hors recette',async()=>{
 const {db,pool,login,api}=await monter(false);
 try{
  const id=(await pool.query("SELECT id FROM auth_users WHERE email='admin@example.test'")).rows[0].id;assert.ok(id);
  assert.equal((await pool.query("SELECT id FROM auth_users WHERE email LIKE '%@iaselo.test'")).rows.length,0);
  const admin=await login('admin@example.test','Mot de passe admin 2026');
  const r=await api(admin,'GET','?service=bloc');if(r.status===200)assert.equal(r.data.planning,null);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM nurse_schedules')).rows[0].n,0);
 }finally{await db.close()}
});

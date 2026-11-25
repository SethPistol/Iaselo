// Transmission du codage : le médecin transmet les actes confirmés, le service destinataire les traite ou demande
// une correction ; droits par métier, actes relus côté serveur, aucun diagnostic transmis (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('codage transmis : du médecin au secrétariat, à la facturation et à un autre service',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(cookie,method,route,data)=>{const r=await call(method,'/api/workspace/marche/codage'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const job of ['secretariat','facturation','dim','anesthesiste','infirmier','administration']){
   const id=await createAccount(pool,{email:job+'@example.test',name:'Nom '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at]);
   await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[job]=await login(job+'@example.test',password)}
  const doc=(key,data)=>pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES($1,$2,1,'test',$3,$4,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data,operation=EXCLUDED.operation,revision=workspace_documents.revision+1",[key,JSON.stringify(data),at,crypto.randomUUID()]);
  await doc('stay/CT1/core',{id:'CT1',careTeamId:'demo-clinique',mode:'Ambulatoire',identity:{lastName:'Martin',firstName:'Paul',birthDate:'1970-05-02',sex:'Masculin'}});
  await pool.query("INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES('CT1','demo-clinique',$1) ON CONFLICT DO NOTHING",[at]);
  await doc('stay/CT1/codage',{actes:{chir:{code:'NEKA020',libelle:'PTH',confirme:true,by:'Dr Chir'},anes:{code:'NEKA020',confirme:false}},decisions:{I10:{decision:'Retenu'}}});
  await doc('stay/CT1/peropRapide',{evenements:[{label:'Entrée en salle',at:'2026-11-20T08:00:00.000Z'}]});
  const {secretariat:sec,facturation:fac,dim,anesthesiste:mar,infirmier:ide,administration:adm}=c;

  assert.equal((await api(ide,'GET','')).status,403,'infirmier : pas de transmission du codage');
  assert.equal((await api(sec,'POST','',{action:'transmettre',stay:'CT1',destinataires:['facturation']})).status,403,'le secrétariat ne transmet pas le codage');
  assert.equal((await api(mar,'POST','',{action:'transmettre',stay:'CT1',destinataires:[]})).status,400);
  assert.equal((await api(mar,'POST','',{action:'transmettre',stay:'CT1',destinataires:['facturation'],codes:['NEKA020','ZZZZ999']})).status,409,'codage pas encore enregistré');
  let r=await api(mar,'POST','',{action:'transmettre',stay:'CT1',destinataires:['accueil','facturation','autre'],autre:'Admissions',note:'Patient en ALD',codes:['NEKA020']});
  assert.equal(r.status,200,JSON.stringify(r.data));const t1=r.data.transmission;
  assert.deepEqual(t1.data.actes.map(a=>a.code),['NEKA020'],'seuls les actes confirmés');assert.equal(t1.data.sejour.dateActe,'2026-11-20');assert.equal(t1.data.patient.nom,'MARTIN');
  assert.ok(!JSON.stringify(t1).includes('I10'),'aucun diagnostic transmis');
  // Chaque service voit ce qui lui est adressé.
  let l=(await api(sec,'GET','')).data;assert.deepEqual(l.services,['secretariat','accueil']);assert.equal(l.recues.length,1);
  assert.equal((await api(dim,'GET','')).data.recues.length,0,'DIM non destinataire');
  assert.equal((await api(adm,'GET','')).data.recues.length,1,'autre service : comptes administration');
  assert.equal((await api(sec,'POST','',{action:'traiter',id:t1.id,service:'facturation'})).status,403,'le secrétariat ne traite pas pour la facturation');
  r=await api(sec,'POST','',{action:'traiter',id:t1.id,service:'accueil',commentaire:'Dossier complété'});assert.equal(r.status,200);assert.equal(r.data.transmission.status,'transmis');
  assert.equal((await api(fac,'POST','',{action:'corriger',id:t1.id,service:'facturation',motif:''})).status,400,'motif obligatoire');
  r=await api(fac,'POST','',{action:'corriger',id:t1.id,service:'facturation',motif:'Acte d’anesthésie manquant'});assert.equal(r.data.transmission.status,'a-corriger');
  // Le médecin voit la demande, corrige et transmet à nouveau : l'ancienne est remplacée.
  let s=(await api(mar,'GET','?stay=CT1')).data.transmissions;assert.equal(s[0].status,'a-corriger');
  assert.equal((await api(sec,'GET','?stay=CT1')).status,403,'historique du séjour : médecins et DIM');
  await doc('stay/CT1/codage',{actes:{chir:{code:'NEKA020',confirme:true},anes:{code:'NEKA020',confirme:true}}});
  r=await api(mar,'POST','',{action:'transmettre',stay:'CT1',destinataires:['facturation'],codes:['NEKA020','NEKA020']});assert.equal(r.status,200);assert.equal(r.data.remplacees,1);
  assert.equal((await api(fac,'POST','',{action:'traiter',id:t1.id,service:'facturation'})).status,409,'ancienne transmission remplacée');
  r=await api(fac,'POST','',{action:'traiter',id:r.data.transmission.id,service:'facturation'});assert.equal(r.data.transmission.status,'traite');
  l=(await api(fac,'GET','')).data;assert.equal(l.recues.length,1);assert.equal(l.recues[0].data.actes.length,2);
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE target='marche/codage'")).rows;
  assert.ok(log.some(x=>x.action==='write'&&x.result==='allowed'));assert.ok(log.some(x=>x.result==='denied'));
 }finally{await db.close()}
});

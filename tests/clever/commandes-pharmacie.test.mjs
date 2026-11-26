// Commandes de la pharmacie : le préparateur prépare et réceptionne, seul le pharmacien valide ; stupéfiants,
// versions lues exigées, étapes et réceptions immuables ; le préparateur ne valide pas les prescriptions.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('commandes de la pharmacie : circuit préparateur → pharmacien → fournisseur → réception',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD);await call('GET','/api/workspace',undefined,admin);
  const api=async(cookie,data)=>{const r=await call(data?'POST':'GET','/api/workspace/pharmacie',data,cookie);return {status:r.status,data:await r.json()}};
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const [nom,job,poste] of [['pharma','pharmacien','pharmacien'],['prep','pharmacien','preparateur'],['ide','infirmier','cadre']]){
   const id=await createAccount(pool,{email:nom+'@example.test',name:'Test '+nom,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,poste=$3,updated_at=$4 WHERE user_id=$1',[id,job,poste,at]);
   await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[nom]=await login(nom+'@example.test',password)}
  const {pharma,prep,ide}=c;
  {const v=await api(ide);assert.equal(v.data.profil,'service');assert.deepEqual(v.data.commandes,[],'la cadre ne voit pas les commandes fournisseurs')}
  let r=await api(prep);assert.equal(r.status,200);assert.equal(r.data.profil,'preparateur');
  {const v=(await api(admin)).data;assert.equal(v.voitCommandes,true,'administrateur : commandes en lecture')}
  // Livret : pharmacien seulement, motif exigé en modification.
  const para={nom:'Paracétamol 10 mg/ml perfusion 100 ml',fournisseur:'Laboratoire A',prix:'1,20',stockMin:5,stockMax:20,unite:'flacon'};
  assert.equal((await api(prep,{action:'article',article:para})).status,403);
  r=await api(pharma,{action:'article',article:para});assert.equal(r.status,200,JSON.stringify(r.data));const a1=r.data.article;assert.equal(a1.prixCentimes,120);
  assert.equal((await api(pharma,{action:'article',id:a1.id,version:1,article:{...para,stockMin:6},motif:''})).status,400);
  r=await api(pharma,{action:'article',id:a1.id,version:1,article:{...para,stockMin:6},motif:'Consommation en hausse'});assert.equal(r.data.article.version,2);
  const a2=(await api(pharma,{action:'article',article:{nom:'Morphine 10 mg/ml ampoule',fournisseur:'Laboratoire B',prix:'0,80',stockMin:2,stockMax:10,unite:'ampoule',stupefiant:true}})).data.article;
  const a3=(await api(pharma,{action:'article',article:{nom:'Insuline rapide stylo',fournisseur:'Laboratoire A',prix:'9',stockMin:1,stockMax:4,unite:'stylo',froid:true}})).data.article;
  // Préparation par le préparateur, soumission, validation par le pharmacien.
  assert.equal((await api(admin,{action:'creer',fournisseur:'Laboratoire A',lignes:[{articleId:a1.id,quantite:10}]})).status,403,'administrateur en lecture');
  r=await api(prep,{action:'creer',fournisseur:'Laboratoire A',lignes:[{articleId:a1.id,quantite:10},{articleId:a3.id,quantite:2}],note:'Réassort'});assert.equal(r.status,200,JSON.stringify(r.data));
  let cmd=r.data.commande;assert.match(cmd.numero,/^CMD-\d{4}-0001$/);assert.equal(cmd.statut,'brouillon');assert.equal(cmd.total,10*120+2*900);
  r=await api(prep,{action:'soumettre',id:cmd.id,version:1});cmd=r.data.commande;assert.equal(cmd.statut,'a_valider');
  assert.equal((await api(prep,{action:'valider',id:cmd.id,version:cmd.version})).status,403,'le préparateur ne valide pas');
  assert.equal((await api(pharma,{action:'valider',id:cmd.id,version:1})).status,409,'version lue exigée');
  assert.equal((await api(prep,{action:'modifier',id:cmd.id,version:cmd.version,fournisseur:'X',lignes:[]})).status,403,'plus modifiable une fois soumise');
  r=await api(pharma,{action:'valider',id:cmd.id,version:cmd.version});cmd=r.data.commande;assert.equal(cmd.statut,'validee');assert.ok(cmd.validation.par);
  assert.equal((await api(prep,{action:'receptionner',id:cmd.id,version:cmd.version,bonLivraison:'BL1',lignes:[{ligne:0,quantite:1}]})).status,403,'pas de réception avant transmission');
  r=await api(prep,{action:'envoyer',id:cmd.id,version:cmd.version,mode:'edi',reference:'ACK-1'});cmd=r.data.commande;assert.equal(cmd.statut,'envoyee');
  // Réception partielle : froid non confirmé = litige, rien en stock pour l'insuline.
  r=await api(prep,{action:'receptionner',id:cmd.id,version:cmd.version,bonLivraison:'BL-77',lignes:[{ligne:0,quantite:6,lot:'P123',peremption:'2028-03-01'},{ligne:1,quantite:2,lot:'I9',peremption:'2028-01-01',motif:'Indicateur de température viré'}]});
  assert.equal(r.status,200,JSON.stringify(r.data));cmd=r.data.commande;assert.equal(cmd.statut,'partielle');assert.equal(r.data.receptions.length,2);
  assert.deepEqual(cmd.receptions.map(x=>[x.conforme,x.litige]),[[6,0],[0,2]]);assert.match(r.data.avertissements[0],/chaîne du froid/);
  assert.equal((await api(prep,{action:'receptionner',id:cmd.id,version:cmd.version,bonLivraison:'BL-78',lignes:[{ligne:0,quantite:5,lot:'P124',peremption:'2028-03-01'}]})).status,400,'excédent refusé');
  assert.equal((await api(prep,{action:'solder',id:cmd.id,version:cmd.version,motif:'Rupture fournisseur'})).status,403,'seul le pharmacien solde');
  r=await api(pharma,{action:'solder',id:cmd.id,version:cmd.version,motif:'Rupture fournisseur'});assert.equal(r.data.commande.statut,'soldee');
  // Stupéfiants : bon dédié, numéro exigé, réception par le pharmacien.
  assert.equal((await api(prep,{action:'creer',fournisseur:'Laboratoire B',lignes:[{articleId:a2.id,quantite:5},{articleId:a1.id,quantite:1}]})).status,200,'brouillon mixte accepté');
  let st=(await api(prep,{action:'creer',fournisseur:'Laboratoire B',lignes:[{articleId:a2.id,quantite:5}]})).data.commande;
  assert.equal(st.numero.slice(-4),'0003');
  r=await api(pharma,{action:'valider',id:st.id,version:st.version});assert.equal(r.status,400);assert.match(r.data.error,/numéro du bon/);
  st=(await api(pharma,{action:'valider',id:st.id,version:st.version,bonStupefiants:'ST-41'})).data.commande;assert.equal(st.bonStupefiants,'ST-41');
  st=(await api(prep,{action:'envoyer',id:st.id,version:st.version,mode:'telephone'})).data.commande;
  r=await api(prep,{action:'receptionner',id:st.id,version:st.version,bonLivraison:'BL-S',lignes:[{ligne:0,quantite:5,lot:'M1',peremption:'2028-01-01'}]});assert.equal(r.status,403);assert.match(r.data.error,/stupéfiants/);
  r=await api(pharma,{action:'receptionner',id:st.id,version:st.version,bonLivraison:'BL-S',lignes:[{ligne:0,quantite:5,lot:'M1',peremption:'2028-01-01'}]});assert.equal(r.data.commande.statut,'recue');
  // Annulation : motif, droits.
  const br=(await api(pharma,{action:'creer',fournisseur:'Laboratoire A',lignes:[{articleId:a1.id,quantite:1}]})).data.commande;
  assert.equal((await api(prep,{action:'annuler',id:br.id,version:1,motif:'Doublon de commande'})).status,403,'pas la commande du préparateur');
  assert.equal((await api(pharma,{action:'annuler',id:br.id,version:1,motif:''})).status,400);
  assert.equal((await api(pharma,{action:'annuler',id:br.id,version:1,motif:'Doublon de commande'})).data.commande.statut,'annulee');
  // Historique : étapes dans l'ordre, profil de l'auteur ; tables non modifiables.
  const h=(await api(pharma)).data.commandes.find(x=>x.id===cmd.id);
  assert.deepEqual(h.evenements.map(e=>[e.action,e.profil]),[['creation','preparateur'],['soumission','preparateur'],['validation','pharmacien'],['transmission','preparateur'],['reception','preparateur'],['solde','pharmacien']]);
  await assert.rejects(pool.query("UPDATE pharmacy_order_events SET motif='x'"));
  await assert.rejects(pool.query('DELETE FROM pharmacy_receptions'));
  await assert.rejects(pool.query("UPDATE pharmacy_article_versions SET motif='x'"));
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE action LIKE 'pharmacie-%' OR target LIKE 'pharmacie%'")).rows;
  assert.ok(log.some(x=>x.action==='pharmacie-validation')&&log.some(x=>x.result==='denied'));
  // Le préparateur ne fait ni l'analyse ni la validation pharmaceutique des prescriptions (conciliation seulement).
  await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES('stay/PH1/core',$1,1,'test',$2,'op-ph1','test')",[JSON.stringify({id:'PH1',careTeamId:'demo-clinique'}),at]);
  await pool.query("INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES('PH1','demo-clinique',$1) ON CONFLICT DO NOTHING",[at]);
  const commit=async(cookie,entry)=>(await call('POST','/api/workspace/commit',{documents:[{key:'stay/PH1/medicationCircuit',data:[entry],revision:0,operation:crypto.randomUUID(),reason:'test'}]},cookie)).status;
  const e=kind=>({id:crypto.randomUUID(),kind,at,author:'Test',note:'Revue',status:'Validée en simulation'});
  assert.equal(await commit(prep,e('validation')),403,'validation : pharmacien seulement');
  assert.equal(await commit(prep,e('analysis')),403,'analyse : pharmacien seulement');
  assert.equal(await commit(prep,e('reconciliation')),200,'conciliation : préparateur accepté');
 }finally{await db.close()}
});


test('demandes des services : le service demande, la pharmacie délivre par lot, le service accuse réception',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD);await call('GET','/api/workspace',undefined,admin);
  const api=async(cookie,data)=>{const r=await call(data?'POST':'GET','/api/workspace/pharmacie',data,cookie);return {status:r.status,data:await r.json()}};
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const [nom,job,poste] of [['pharma','pharmacien','pharmacien'],['prep','pharmacien','preparateur'],['ide','infirmier','bloc'],['mar','anesthesiste',''],['sec','secretariat','']]){
   const id=await createAccount(pool,{email:nom+'@example.test',name:'Test '+nom,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,poste=$3,updated_at=$4 WHERE user_id=$1',[id,job,poste,at]);
   await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[nom]=await login(nom+'@example.test',password)}
  const {pharma,prep,ide,mar,sec}=c;
  const a1=(await api(pharma,{action:'article',article:{nom:'Paracétamol 10 mg/ml perfusion',fournisseur:'Labo A',prix:'1',stockMin:2,stockMax:10,unite:'flacon'}})).data.article;
  const a2=(await api(pharma,{action:'article',article:{nom:'Sufentanil 5 µg/ml',fournisseur:'Labo B',prix:'2',stockMin:1,stockMax:5,unite:'ampoule',stupefiant:true}})).data.article;
  const lots=[{id:'L1',articleId:a1.id,drug:a1.nom,batch:'P1',expiry:'2027-06-01',quantity:4},{id:'L2',articleId:a1.id,drug:a1.nom,batch:'P2',expiry:'2028-06-01',quantity:10},{id:'L3',articleId:a2.id,drug:a2.nom,batch:'S1',expiry:'2028-01-01',quantity:3}];
  await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES('management/lots',$1,1,'test',$2,'op-lots','test')",[JSON.stringify(lots),at]);
  // Lecture : le service voit le livret et les demandes, pas les commandes aux fournisseurs.
  assert.equal((await api(sec)).status,403);
  let r=await api(ide);assert.equal(r.status,200);assert.equal(r.data.profil,'service');assert.equal(r.data.voitCommandes,false);assert.equal(r.data.serviceParDefaut,'bloc');assert.deepEqual(r.data.commandes,[]);
  assert.equal((await api(ide,{action:'creer',fournisseur:'Labo A',lignes:[{articleId:a1.id,quantite:1}]})).status,403,'le service ne commande pas au fournisseur');
  // Demande : stupéfiant réservé au médecin.
  assert.equal((await api(ide,{action:'demander',service:'bloc',lignes:[{articleId:a2.id,quantite:1}]})).status,400);
  assert.equal((await api(prep,{action:'demander',service:'bloc',lignes:[{articleId:a1.id,quantite:1}]})).status,403);
  r=await api(ide,{action:'demander',service:'bloc',lignes:[{articleId:a1.id,quantite:8}],urgent:true});assert.equal(r.status,200,JSON.stringify(r.data));
  let dm=r.data.demande;assert.match(dm.numero,/^DEM-\d{4}-0001$/);assert.equal(dm.statut,'demandee');
  r=await api(prep,{action:'demande-prendre',id:dm.id,version:1});dm=r.data.demande;assert.equal(dm.statut,'en_preparation');
  assert.equal((await api(ide,{action:'demande-annuler',id:dm.id,version:dm.version,motif:'Plus nécessaire'})).status,403,'trop tard pour annuler');
  assert.equal((await api(prep,{action:'demande-delivrer',id:dm.id,version:dm.version,lignes:[{ligne:0,sorties:[{lotId:'L1',quantite:5}]}]})).status,400,'stock du lot dépassé');
  assert.equal((await api(prep,{action:'demande-delivrer',id:dm.id,version:dm.version,lignes:[{ligne:0,sorties:[{lotId:'L1',quantite:4}]}]})).status,400,'partielle sans motif');
  r=await api(prep,{action:'demande-delivrer',id:dm.id,version:dm.version,lignes:[{ligne:0,sorties:[{lotId:'L1',quantite:4},{lotId:'L2',quantite:2}],motif:'Rupture partielle, commande en cours'}]});
  assert.equal(r.status,200,JSON.stringify(r.data));dm=r.data.demande;assert.equal(dm.statut,'delivree');assert.equal(dm.delivrance.lignes[0].delivre,6);
  assert.equal((await api(prep,{action:'demande-accuser',id:dm.id,version:dm.version})).status,403);
  assert.equal((await api(ide,{action:'demande-accuser',id:dm.id,version:dm.version,ecart:true,motif:''})).status,400);
  r=await api(ide,{action:'demande-accuser',id:dm.id,version:dm.version,ecart:true,motif:'Un flacon manquant dans le bac'});assert.equal(r.data.demande.statut,'recue');
  assert.deepEqual(r.data.demande.evenements.map(e=>[e.action,e.profil]),[['demande','service'],['prise-en-charge','preparateur'],['delivrance','preparateur'],['reception','service']]);
  // Stupéfiant demandé par l'anesthésiste : délivré par le pharmacien seulement.
  let st=(await api(mar,{action:'demander',service:'bloc',lignes:[{articleId:a2.id,quantite:2}]})).data.demande;assert.equal(st.statut,'demandee');
  assert.equal((await api(prep,{action:'demande-delivrer',id:st.id,version:1,lignes:[{ligne:0,sorties:[{lotId:'L3',quantite:2}]}]})).status,403);
  assert.equal((await api(pharma,{action:'demande-delivrer',id:st.id,version:1,lignes:[{ligne:0,sorties:[{lotId:'L3',quantite:2}]}]})).status,200);
  // Refus motivé par le pharmacien, annulation par le service avant prise en charge.
  const d3=(await api(ide,{action:'demander',service:'sspi',lignes:[{horsLivret:true,nom:'Dantrolène 20 mg',quantite:2,justification:'Chariot hyperthermie maligne'}]})).data.demande;
  assert.equal((await api(prep,{action:'demande-refuser',id:d3.id,version:1,motif:'Hors livret'})).status,403);
  assert.equal((await api(pharma,{action:'demande-refuser',id:d3.id,version:1,motif:'Disponible au bloc dans la mallette dédiée'})).data.demande.statut,'refusee');
  const d4=(await api(ide,{action:'demander',service:'bloc',lignes:[{articleId:a1.id,quantite:1}]})).data.demande;
  assert.equal((await api(ide,{action:'demande-annuler',id:d4.id,version:1,motif:'Doublon de demande'})).data.demande.statut,'annulee');
  await assert.rejects(pool.query("UPDATE pharmacy_request_events SET motif='x'"));
 }finally{await db.close()}
});

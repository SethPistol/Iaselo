// Parcours de soins à distance : inscription, envois automatiques (fiche, questionnaire), page patient, alertes,
// relance, arrêt, PROMs/PREMs, export e-Satis, droits et absence de donnée de santé dans les SMS (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test parcours de soins'});
const jourParis=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(d);
const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};

test('parcours de soins : inscription, envois automatiques, réponses du patient, alertes, e-Satis et droits',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push({sms:m});return 'S1'},email:async m=>{sent.push({email:m});return 'E1'}};
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,c);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  // Aujourd'hui 10 h 30 (Paris) ; intervention il y a 7 jours (J+7), une autre dans 10 jours.
  const today=jourParis(new Date()),now=new Date(today+'T09:30:00Z'),j0=decale(today,-7);
  for(const [stay,date,op,mode] of [['P1',j0,'Prothèse totale de genou droite','Hospitalisation'],['P2',decale(today,10),'Cholécystectomie','Ambulatoire']]){
   await api('PUT','/document',edit('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',specialty:'Orthopédie',mode,identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}));
   await api('PUT','/document',edit('stay/'+stay+'/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344',email:'patient.fictif@example.test'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
   await api('PUT','/document',edit('stay/'+stay+'/consult',{validated:true,ext:{operation:op,surgeryDate:date,author:'Dr Exemple FICTIF'}}));
  }
  // Séjours à inscrire, parcours proposé selon l'intervention.
  let t=await api('GET','/parcours/tableau');assert.equal(t.status,200,JSON.stringify(t.data));
  assert.deepEqual(t.data.aInscrire.map(s=>[s.stay,s.propose]),[['P1','raac-ortho'],['P2','ambulatoire']]);
  // La rubrique est écrite par le serveur seulement.
  assert.equal((await api('PUT','/document',edit('stay/P1/parcoursSuivi',{programme:'raac-ortho'}))).status,403);
  assert.equal((await api('POST','/parcours/action',{action:'inscrire',stay:'P1',programme:'inconnu'})).status,400);
  assert.equal((await api('POST','/parcours/action',{action:'inscrire',stay:'P1',programme:'raac-ortho'})).status,200);
  assert.equal((await api('POST','/parcours/action',{action:'inscrire',stay:'P1',programme:'raac-ortho'})).status,409);

  // Tournée : J+5 (fiche, en retard de 2 jours) et J+7 (questionnaire) partent ; J+3 (4 jours de retard) non.
  await app.rappels({now});
  const mine=()=>sent.filter(m=>m.sms?.tag==='iaselo-parcours').map(m=>m.sms);
  assert.equal(mine().length,2,JSON.stringify(mine()));
  const fiche=mine().find(m=>/conseils/.test(m.content)),quest=mine().find(m=>/quelques questions/.test(m.content));
  assert.ok(fiche&&quest);assert.match(quest.content,/^Clinique test : votre équipe prend de vos nouvelles\. .*parcours\.html#acces=[a-f0-9]{64} .*15\.$/);
  assert.doesNotMatch(JSON.stringify(mine()),/FICTIF|1980|genou|prothèse|douleur|RAAC/i);
  await app.rappels({now});await app.rappels({now:new Date(now.getTime()+3*3600e3)});assert.equal(mine().length,2,'aucun double envoi');

  // Page patient : fiche lue (sans date de naissance), questionnaire (date de naissance vérifiée, une réponse).
  const tok=m=>m.content.match(/#acces=([a-f0-9]{64})/)[1];
  const pub=async(route,data)=>{const x=await call('POST','/api/parcours/'+route,data);return {status:x.status,data:await x.json()}};
  let o=await pub('open',{token:tok(fiche)});assert.equal(o.status,200);assert.equal(o.data.type,'fiche');assert.equal(o.data.fiche.titre,'Bouger pour mieux récupérer');
  assert.equal((await pub('submit',{token:tok(fiche),answers:{}})).status,400);
  o=await pub('open',{token:tok(quest)});assert.equal(o.data.type,'questionnaire');assert.ok(o.data.questions.some(q=>q.id==='mollet'));assert.equal(o.data.etablissement,'Clinique test');
  const base={douleur:'2',cicatrice:'Non',saignement:'Non',respiration:'Non',mollet:'Non',marche:'Oui',rappel:'Non'};
  assert.equal((await pub('submit',{token:tok(quest),birthDate:'1981-01-01',answers:base})).status,400);
  assert.equal((await pub('submit',{token:tok(quest),birthDate:'1980-01-01',answers:{douleur:'2'}})).status,400);
  o=await pub('submit',{token:tok(quest),birthDate:'1980-01-01',answers:{...base,douleur:'8',mollet:'Oui',question:'Puis-je prendre une douche ?'}});
  assert.equal(o.status,200);assert.equal(o.data.alerte,true);assert.equal(o.data.crit,true);
  assert.equal((await pub('submit',{token:tok(quest),birthDate:'1980-01-01',answers:base})).status,409);
  assert.equal((await pub('open',{token:'0'.repeat(64)})).status,404);

  // Équipe : alerte, détail, traitement tracé.
  t=await api('GET','/parcours/tableau');const s1=t.data.suivis.find(s=>s.stay==='P1');
  assert.equal(s1.alertes.length,1);assert.deepEqual(s1.alertes[0].alerts.map(a=>a.label),['Douleur 8/10','Signe de phlébite possible','Question du patient']);
  assert.equal(s1.etat.code,'alerte');assert.equal(t.data.indicateurs.alertesOuvertes,1);assert.equal(t.data.indicateurs.tauxReponse,100);
  let d=await api('GET','/parcours/dossier?stay=P1');assert.equal(d.status,200);
  const et=Object.fromEntries(d.data.etat.etapes.map(e=>[e.id,e.code]));
  assert.equal(et['j+5-reeducation'],'lue');assert.equal(et['j+7-suivi'],'repondu');assert.equal(et['j+3-suivi'],'manquee');assert.equal(et['j+14-suivi'],'a-venir');
  assert.equal((await api('POST','/parcours/action',{action:'traiter',stay:'P1',index:s1.alertes[0].index,texte:''})).status,400);
  assert.equal((await api('POST','/parcours/action',{action:'traiter',stay:'P1',index:s1.alertes[0].index,texte:'Patient rappelé, écho-doppler demandé'})).status,200);
  assert.equal((await api('POST','/parcours/action',{action:'traiter',stay:'P1',index:s1.alertes[0].index,texte:'encore'})).status,409);
  t=await api('GET','/parcours/tableau');assert.equal(t.data.indicateurs.alertesOuvertes,0);

  // Relance manuelle d'une étape manquée ; arrêt (les liens ne valent plus), reprise.
  const avant=mine().length;
  assert.equal((await api('POST','/parcours/action',{action:'envoyer',stay:'P1',etape:'j+3-suivi'})).status,200);assert.equal(mine().length,avant+1);
  assert.equal((await api('POST','/parcours/action',{action:'arreter',stay:'P1',motif:''})).status,400);
  assert.equal((await api('POST','/parcours/action',{action:'arreter',stay:'P1',motif:'Réhospitalisation'})).status,200);
  assert.equal((await pub('open',{token:tok(mine().at(-1))})).status,410);
  assert.equal((await api('POST','/parcours/action',{action:'envoyer',stay:'P1',etape:'j+3-suivi'})).status,409);
  assert.equal((await api('POST','/parcours/action',{action:'reprendre',stay:'P1'})).status,200);
  assert.equal((await pub('open',{token:tok(mine().at(-1))})).status,200);

  // e-Satis : P2 (ambulatoire) sort dans 10 jours ; P1 sans date de sortie connue (hospitalisation sans lit réservé).
  const mois=decale(today,10).slice(0,7);
  let e=await api('GET','/parcours/esatis?mois='+mois);assert.equal(e.status,200);assert.equal(e.data.retenus,1);
  assert.match(e.data.csv,/^finess;numero_sejour;email;date_entree;date_sortie;mode_hospitalisation\r\n;P2;patient\.fictif@example\.test;/);
  assert.equal((await api('POST','/parcours/action',{action:'inscrire',stay:'P2',programme:'ambulatoire'})).status,200);
  assert.equal((await api('POST','/parcours/action',{action:'opposition-esatis',stay:'P2',opposition:true})).status,200);
  e=await api('GET','/parcours/esatis?mois='+mois);assert.equal(e.data.retenus,0);assert.equal(e.data.motifs.opposition,1);
  assert.equal((await api('GET','/parcours/esatis?mois=2026-13x')).status,400);

  // Droits : le secrétariat ni la pharmacie n'accèdent au télésuivi.
  const at=new Date().toISOString(),password='Mot de passe de test 2026';
  for(const [k,job] of [['secr','secretariat'],['pharma','pharmacien']]){
   const email=k+'@example.test',id=await createAccount(pool,{email,name:k,passwordHash:await hashPassword(password)});
   await pool.query('UPDATE professional_profiles SET profession=$2,display_name=$3,updated_at=$4 WHERE user_id=$1',[id,job,k,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
   await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);const c=await login(email,password);
   assert.equal((await api('GET','/parcours/tableau',undefined,c)).status,403,job);
   assert.equal((await api('POST','/parcours/action',{action:'inscrire',stay:'P1',programme:'ambulatoire'},c)).status,403,job);
  }
  // Traçabilité : envois, lecture, réponse, actions.
  const actions=(await pool.query("SELECT action FROM professional_access_log WHERE action LIKE 'parcours-%'")).rows.map(r=>r.action);
  for(const a of ['parcours-envoi','parcours-fiche-lue','parcours-reponse','parcours-inscrire','parcours-traiter','parcours-arreter','parcours-esatis'])assert.ok(actions.includes(a),a);
 }finally{await pool.end()}
});

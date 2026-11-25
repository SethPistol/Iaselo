// Modules issus de la comparaison au marché : flux entrants, droits, transfusion, EI, agenda et lien patient,
// honoraires et paiement simulé, stérilisation, brancardage, planning, messagerie (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {createHmac} from 'node:crypto';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const JETON='jeton-de-test-laboratoire-0123456789abcdef',WEBHOOK='whsec_test_secret';
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test marché'});

test('modules du marché : flux, droits, transfusion, EI, agenda, honoraires, logistique, messagerie',async()=>{
 const db=new PGlite(),pool=pgPool(db),files=new Map();
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push(m);return 'S1'},email:async m=>{sent.push(m);return 'E1'}};
  const interopEnv={INTEROP_LABO_JETON:JETON,INTEROP_GAM_JETON:JETON+'gam',INTEROP_MONITEURS_JETON:JETON+'mon',INTEROP_COURRIERS_JETON:JETON+'cou',IASELO_RECETTE:'true'};
  const app=await makeApp({pool,bucket:{async put(h,b,m){files.set(h,{b,m})},async get(h){const f=files.get(h);return f?{body:f.b,httpMetadata:f.m.httpMetadata}:null}},cfg:config(env),messaging,interopEnv});
  const call=async(method,route,data,cookie,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const owner=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(cookie,method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);const ct=r.headers.get('Content-Type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text()}};
  const me=(await api(owner,'GET','')).data.user,at=new Date().toISOString(),password='Mot de passe de test 2026',cookies={};
  for(const [email,job,poste] of [['mar@example.test','anesthesiste',''],['ide@example.test','infirmier','bloc'],['sec@example.test','secretariat',''],['qual@example.test','administration',''],['chir@example.test','chirurgien','']]){
   const id=await createAccount(pool,{email,name:'Nom '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3,poste=$4 WHERE user_id=$1',[id,job,at,poste]);
   await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);cookies[job]=await login(email,password)}
  const {anesthesiste:mar,infirmier:ide,secretariat:sec,administration:qual,chirurgien:chir}=cookies;
  const dans=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  for(const [stay,nom,prenom,naiss] of [['M1','DUPONT','Marie','1985-02-14'],['M2','LEROY','Jean','1950-05-05']]){
   await api(owner,'PUT','/document',edit('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',identity:{lastName:nom,firstName:prenom,birthDate:naiss}}));
   await api(owner,'PUT','/document',edit('stay/'+stay+'/invitationContact',{contact:{firstName:prenom,lastName:nom,birthDate:naiss,phone:'+33611223344'},confirmed:true,verifiedBy:me,verifiedAt:at,source:'Test'}));
  }
  await api(owner,'PUT','/document',edit('stay/M1/surgicalAnnouncement',{published:{fields:{date:dans(20),procedure:'PTH'},state:'Transmise'}}));
  await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES('management/planningResources',$1,1,'test',$2,$3,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data",[JSON.stringify([{id:'S1',label:'Salle 1',sector:'bloc-chir'}]),at,crypto.randomUUID()]);

  // 1. Biologie : flux entrant avec jeton, rattachement automatique seulement sur IPP/INS ; sinon file « à rattacher ».
  const oru=['MSH|^~\\&|LABO|BIO|IASELO|CLIN|20261125083000||ORU^R01|L1|P|2.5','PID|1||IPP9^^^LABO^PI||DUPONT^Marie^^^^^L||19850214|F','OBR|1||P1|BIO^Bilan|||20261124073000','OBX|1|NM|2823-3^Potassium^LN||6,9|mmol/L|3.5-5.0|HH|||F'].join('\r');
  assert.equal((await call('POST','/api/interop/entrant/biologie',oru,null,{'Content-Type':'application/hl7-v2','Authorization':'Bearer mauvais'})).status,403,'jeton refusé');
  const ackR=await call('POST','/api/interop/entrant/biologie',oru,null,{'Content-Type':'application/hl7-v2','Authorization':'Bearer '+JETON});assert.equal(ackR.status,200);assert.match(await ackR.text(),/MSA\|AA\|L1/);
  let bio=await api(mar,'GET','/marche/biologie');assert.equal(bio.data.aRattacher.length,1,'nom + naissance : à confirmer');assert.equal(bio.data.aRattacher[0].data.critiques,1);
  assert.equal((await api(sec,'GET','/marche/biologie')).status,403,'secrétariat sans accès aux résultats');
  assert.equal((await api(mar,'POST','/marche/biologie',{action:'rattacher',id:bio.data.aRattacher[0].id,stay:'M2'})).status,400,'identité discordante sans motif');
  assert.equal((await api(mar,'POST','/marche/biologie',{action:'rattacher',id:bio.data.aRattacher[0].id,stay:'M1'})).status,200);
  const r1=(await api(mar,'GET','/marche/biologie?stay=M1')).data.resultats;assert.equal(r1.length,1);assert.equal(r1[0].data.rattachement.mode,'manuel');
  assert.equal((await api(ide,'POST','/marche/biologie',{action:'vu',id:r1[0].id})).status,403,'« vu » réservé au médecin');
  assert.equal((await api(mar,'POST','/marche/biologie',{action:'vu',id:r1[0].id})).data.resultat.status,'vu');
  assert.equal((await api(mar,'POST','/marche/biologie',{action:'simuler',stay:'M2'})).status,200,'simulation du laboratoire');
  // 2. ADT : mouvement entrant lié par l'IPP ; ensuite les résultats portant l'IPP se rattachent seuls.
  const pv1=Array(46).fill('');pv1[0]='PV1';pv1[1]='1';pv1[2]='I';pv1[3]='CHIR^204^B';pv1[19]='NDA55';
  const adt=['MSH|^~\\&|GAM|CLIN|IASELO|CLIN|20261125070000||ADT^A01|A1|P|2.5','PID|1||IPP9^^^GAM^PI||DUPONT^Marie^^^^^L||19850214|F',pv1.join('|')].join('\r');
  assert.equal((await call('POST','/api/interop/entrant/adt',adt,null,{'Authorization':'Bearer '+JETON+'gam'})).status,200);
  let itf=await api(sec,'GET','/marche/interfaces');const a1=itf.data.adt[0];assert.equal(a1.status,'a-rattacher');
  assert.equal((await api(sec,'POST','/marche/interfaces',{action:'rattacher-adt',id:a1.id,stay:'M1'})).status,200);
  await call('POST','/api/interop/entrant/biologie',oru.replace('L1','L2'),null,{'Authorization':'Bearer '+JETON});
  assert.equal((await api(mar,'GET','/marche/biologie?stay=M1')).data.resultats.length,2,'IPP connu : rattachement automatique');
  await api(owner,'PUT','/document',edit('management/acts',[{id:'A1',patient:'M1',code:'NEKA020',label:'PTH',date:at,quantity:1}]));
  const env1=await api(sec,'POST','/marche/interfaces',{action:'envoyer-actes',stay:'M1'});assert.equal(env1.status,200);assert.match(env1.data.sortant.data.message,/DFT\^P03/);assert.equal(env1.data.sortant.data.simulation,true);
  assert.equal((await api(ide,'GET','/marche/interfaces')).status,403);
  // 3. Moniteurs : flux entrant puis lecture par salle.
  assert.equal((await call('POST','/api/interop/entrant/moniteur','MSH|^~\\&|GW|BLOC|IASELO|CLIN|20261125101500||ORU^R01|G1|P|2.5\rPV1|1|I|BLOC^S1\rOBX|1|NM|150456^SPO2^MDC||97|%|||||F|||'+new Date().toISOString().replace(/[-:T]/g,'').slice(0,14),null,{'Authorization':'Bearer '+JETON+'mon'})).status,200);
  assert.equal((await api(mar,'POST','/marche/moniteurs',{action:'simuler',salle:'S1',minutes:30})).status,200);
  const mon=await api(ide,'GET','/marche/moniteurs?salle=S1');assert.ok(mon.data.mesures.length>=20);assert.ok(mon.data.mesures.some(m=>m.cle==='sbp'));
  assert.equal((await api(sec,'GET','/marche/moniteurs?salle=S1')).status,403);
  // 1b. Courrier reçu par MSSanté, rattaché, fichier lisible.
  const pdf=Buffer.from('%PDF-1.4 test').toString('base64');
  assert.equal((await call('POST','/api/interop/entrant/courrier',{nom:'cr.pdf',type:'application/pdf',base64:pdf,objet:'Compte rendu opératoire',texte:'Patient : LEROY Jean, né le 05/05/1950. Compte rendu opératoire.',expediteur:'dr@mssante.fr'},null,{'Authorization':'Bearer '+JETON+'cou'})).status,200);
  const cou=await api(sec,'GET','/marche/courriers');const c1=cou.data.aRattacher[0];assert.equal(c1.data.typeDocument,'compte-rendu-operatoire');assert.equal(c1.data.candidats[0].stay,'M2');
  assert.equal((await api(sec,'POST','/marche/courriers',{action:'rattacher',id:c1.id,stay:'M2'})).status,200);
  const f=await call('GET','/api/workspace/marche/courriers/fichier?id='+c1.id,undefined,sec);assert.equal(f.status,200);assert.equal(f.headers.get('Content-Type'),'application/pdf');

  // 5. Transfusion : commande bloquée sans groupage, contrôle ultime, surveillance, EIR → EI.
  const tr=(c,d)=>api(c,'POST','/marche/transfusion',{stay:'M1',...d});
  assert.equal((await tr(ide,{action:'commande',produits:[{type:'CGR',quantite:2}],indication:'Hb 6,8 g/dL'})).status,403,'prescription médicale');
  assert.equal((await tr(mar,{action:'commande',produits:[{type:'CGR',quantite:2}],indication:'Hb 6,8 g/dL'})).status,400,'sans groupage ni RAI');
  const h=n=>new Date(Date.now()-n*3600000).toISOString().slice(0,16);
  await tr(ide,{action:'determination',groupe:'A+',prelevement:h(30),numeroPrelevement:'P1'});await tr(ide,{action:'determination',groupe:'A+',prelevement:h(20),numeroPrelevement:'P2'});await tr(ide,{action:'rai',prelevement:h(10),resultat:'negative'});
  const cmd=await tr(mar,{action:'commande',produits:[{type:'CGR',quantite:1}],indication:'Hb 6,8 g/dL',urgence:'relative'});assert.equal(cmd.status,200);assert.equal(cmd.data.element.data.envoi.simulation,true);
  const rec=await tr(ide,{action:'reception',commande:cmd.data.element.id,poches:[{numero:'FR123',type:'CGR',groupe:'O+',peremption:dans(10)}]});const poche=rec.data.poches[0].id;
  const items=Object.fromEntries([['identitePatient'],['concordancePrescription'],['concordancePoche'],['peremption'],['aspect'],['documentsGroupe']].map(([k])=>[k,'oui']));
  assert.equal((await tr(ide,{action:'pose',poche,items,carte:{patient:'B',poche:'O'},surveillanceAvant:{sbp:130,hr:80,temp:37}})).status,400,'carte discordante : arrêt');
  assert.equal((await tr(ide,{action:'pose',poche,items,carte:{patient:'A',poche:'O'},surveillanceAvant:{sbp:130,hr:80,temp:37}})).status,200);
  const surv=await tr(ide,{action:'surveillance',poche,moment:'15min',mesures:{sbp:95,hr:125,temp:38.4}});assert.equal(surv.data.element.status,'arretee');assert.ok(surv.data.alertes.length>=2);
  const eir=await tr(mar,{action:'eir',poche,grade:2,description:'Frissons, hyperthermie',signes:['Frissons']});assert.equal(eir.status,200);
  await tr(ide,{action:'devenir',poche,devenir:'partielle'});

  // 6. EI : déclaré par l'infirmière, géré par la qualité ; l'infirmière ne voit que les siens.
  const ei=await api(ide,'POST','/marche/evenements',{action:'declarer',categorie:'chute',gravite:2,date:dans(0),description:'Chute au lever, sans traumatisme',consequence:'aucune',anonyme:true,stay:'M2'});assert.equal(ei.status,200);
  assert.equal((await api(ide,'POST','/marche/evenements',{action:'statut',id:ei.data.ei.id,vers:'analyse'})).status,403);
  const vueQ=await api(qual,'GET','/marche/evenements');assert.equal(vueQ.data.ei.length,2,'qualité : tout voit (dont l’EIR)');assert.ok(vueQ.data.ei.some(e=>e.eigs===false&&e.data.categorie==='transfusion'));
  assert.equal((await api(qual,'POST','/marche/evenements',{action:'statut',id:ei.data.ei.id,vers:'analyse'})).status,200);
  assert.equal((await api(chir,'GET','/marche/evenements')).data.ei.find(e=>e.id===ei.data.ei.id).par,'Déclarant confidentiel','anonymat préservé');
  const rmm=await api(mar,'POST','/marche/evenements',{action:'rmm-creer',date:dans(7),titre:'RMM anesthésie'});assert.equal(rmm.status,200);
  assert.equal((await api(mar,'POST','/marche/evenements',{action:'rmm-conclure',id:rmm.data.rmm.id,presents:'',conclusion:'x'})).status,400,'présents obligatoires');

  // 7. Agenda : plage, rendez-vous, lien patient et réservation par le patient.
  const marId=(await pool.query("SELECT user_id FROM professional_profiles WHERE profession='anesthesiste' LIMIT 1")).rows[0].user_id;
  const pl=await api(sec,'POST','/marche/agenda',{action:'plage',date:dans(5),debut:'09:00',fin:'10:00',duree:20,medecin:marId});assert.equal(pl.status,200);
  assert.equal((await api(sec,'POST','/marche/agenda',{action:'plage',date:dans(5),debut:'09:30',fin:'11:00',duree:20,medecin:marId})).status,400,'chevauchement');
  const lien=await api(sec,'POST','/marche/agenda',{action:'lien',stay:'M1'});assert.equal(lien.status,200);assert.match(lien.data.canaux.join(),/SMS/);
  const token=sent.find(m=>/rendez-vous|consultation/.test(m.content||''))?.content.match(/#acces=([a-f0-9]{64})/)[1];assert.ok(token,'lien dans le SMS');
  assert.doesNotMatch(sent.find(m=>m.content).content,/DUPONT|PTH|anesthésie générale/,'aucune donnée de santé ni nom dans le SMS');
  assert.equal((await call('POST','/api/rdv/ouvrir',{token,naissance:'1990-01-01'})).status,403);
  const ouv=await (await call('POST','/api/rdv/ouvrir',{token,naissance:'1985-02-14'})).json();assert.equal(ouv.creneaux.length,3);
  const resa=await call('POST','/api/rdv/reserver',{token,naissance:'1985-02-14',plage:ouv.creneaux[1].plage,heure:ouv.creneaux[1].heure});assert.equal(resa.status,200);
  assert.equal((await call('POST','/api/rdv/reserver',{token,naissance:'1985-02-14',plage:ouv.creneaux[1].plage,heure:ouv.creneaux[1].heure})).status,409,'créneau pris');
  const ag=await api(sec,'GET','/marche/agenda?du='+dans(0)+'&au='+dans(10));assert.equal(ag.data.rdv.length,1);assert.equal(ag.data.rdv[0].heure,'09:20');assert.equal(ag.data.rdv[0].par,'patient');

  // 9. Honoraires : devis ≥ 70 € de dépassement, signature du patient, FSE (simulation), paiement simulé.
  const dv=await api(mar,'POST','/marche/honoraires',{action:'devis',stay:'M1',lignes:[{code:'ZZLP025',libelle:'Anesthésie PTH',base:'150',demande:'260'}],secteur:'2'});assert.equal(dv.data.element.data.devisObligatoire,true);
  assert.equal((await api(mar,'POST','/marche/honoraires',{action:'fse',stay:'M1',id:dv.data.element.id})).status,400,'devis non signé');
  await api(mar,'POST','/marche/honoraires',{action:'envoyer-devis',stay:'M1',id:dv.data.element.id});
  const tokD=sent.filter(m=>m.content).at(-1).content.match(/#acces=([a-f0-9]{64})/)[1];
  const vueD=await (await call('POST','/api/devis/ouvrir',{token:tokD,naissance:'1985-02-14'})).json();assert.equal(vueD.depassement,11000);
  assert.equal((await call('POST','/api/devis/signer',{token:tokD,naissance:'1985-02-14',accepte:true,nom:'Marie Dupont'})).status,200);
  const fse=await api(mar,'POST','/marche/honoraires',{action:'fse',stay:'M1',id:dv.data.element.id});assert.equal(fse.status,200);assert.equal(fse.data.element.data.envoi.simulation,true);
  const pay=await api(sec,'POST','/marche/honoraires',{action:'paiement',stay:'M1',objet:'chambre',montant:'95'});assert.equal(pay.status,200);
  const tokP=sent.filter(m=>m.content).at(-1).content.match(/#acces=([a-f0-9]{64})/)[1];assert.doesNotMatch(sent.filter(m=>m.content).at(-1).content,/chambre|honoraires/i);
  assert.equal((await (await call('POST','/api/paiement/payer',{token:tokP,naissance:'1985-02-14',confirmerSimulation:true})).json()).statut,'paye');
  assert.equal((await api(sec,'GET','/marche/honoraires?stay=M1')).data.elements.find(e=>e.kind==='paiement').status,'paye');
  assert.equal((await call('POST','/api/paiement/stripe','{}',null,{'Stripe-Signature':'t=1,v1=00'})).status,400,'webhook non signé refusé');

  // 10a. Stérilisation : charge non libérée, puis libérée ; boîte utilisée tracée au patient.
  const bx=await api(ide,'POST','/marche/sterilisation',{action:'boite',nom:'Boîte PTH',code:'B-PTH-01',conditionnement:'conteneur'});const bid=bx.data.boite.id;
  assert.equal((await api(ide,'POST','/marche/sterilisation',{action:'utiliser',boite:bid,stay:'M1'})).status,400,'boîte sale');
  await api(ide,'POST','/marche/sterilisation',{action:'etat',boite:bid,etat:'lavage'});await api(ide,'POST','/marche/sterilisation',{action:'etat',boite:bid,etat:'conditionnee'});
  const ko=await api(ide,'POST','/marche/sterilisation',{action:'cycle',autoclave:'AC1',numero:'C100',boites:[bid],bowieDick:'non-conforme',indicateur:'conforme',enregistrement:'conforme',siccite:'conforme'});assert.equal(ko.data.cycle.status,'non-libere');
  const ok=await api(ide,'POST','/marche/sterilisation',{action:'cycle',autoclave:'AC1',numero:'C101',boites:[bid],bowieDick:'conforme',indicateur:'conforme',enregistrement:'conforme',siccite:'conforme'});assert.equal(ok.data.cycle.status,'libere');
  assert.equal((await api(ide,'POST','/marche/sterilisation',{action:'utiliser',boite:bid,stay:'M1'})).data.boite.status,'utilisee');
  // 10b–d. Brancardage, planning, messagerie.
  const br=await api(ide,'POST','/marche/brancardage',{action:'demande',stay:'M1',depart:'Chambre 204',arrivee:'Bloc',priorite:'urgent'});assert.equal(br.status,200);
  assert.equal((await api(ide,'POST','/marche/brancardage',{action:'etat',id:br.data.demande.id,vers:'arrive'})).status,400,'étape sautée');
  assert.equal((await api(ide,'POST','/marche/brancardage',{action:'etat',id:br.data.demande.id,vers:'pris'})).status,200);
  assert.equal((await api(ide,'POST','/marche/planning',{action:'affecter',date:dans(1),personne:'Dr A',fonction:'anesthesiste',salle:'S1'})).status,403,'infirmière de bloc (non cadre)');
  assert.equal((await api(mar,'POST','/marche/planning',{action:'affecter',date:dans(1),personne:'Dr A',fonction:'anesthesiste',salle:'S1',debut:'08:00',fin:'14:00'})).status,200);
  assert.equal((await api(mar,'POST','/marche/planning',{action:'affecter',date:dans(1),personne:'Dr A',fonction:'anesthesiste',salle:'S2',debut:'12:00',fin:'18:00'})).status,409);
  assert.equal((await api(mar,'POST','/marche/messagerie',{action:'envoyer',fil:'sejour:M1',texte:'Patiente à jeun ?',urgent:true})).status,200);
  const fils=await api(ide,'GET','/marche/messagerie');assert.equal(fils.data.fils[0].nonLus,1);assert.equal(fils.data.fils[0].urgent,true);
  await api(ide,'POST','/marche/messagerie',{action:'lu',fil:'sejour:M1'});assert.equal((await api(ide,'GET','/marche/messagerie')).data.fils[0].nonLus,0);
  assert.equal((await api(sec,'POST','/marche/messagerie',{action:'envoyer',fil:'equipe:bloc',texte:'x'})).status,403,'secrétariat hors équipe du bloc');
  // Mode dégradé : épisode tracé.
  const ep=await api(ide,'POST','/marche/secours',{action:'debut',motif:'Panne réseau'});assert.equal(ep.status,200);assert.equal((await api(ide,'POST','/marche/secours',{action:'debut'})).status,409);
  await api(ide,'POST','/marche/secours',{action:'kit',patients:2,forme:'fichier-chiffre'});
  const log=(await pool.query("SELECT action,result FROM professional_access_log WHERE target LIKE 'marche/%' OR target LIKE 'interop/%'")).rows;
  assert.ok(log.some(x=>x.action==='secours-kit'));assert.ok(log.some(x=>x.action==='interop-entrant'&&x.result==='denied'));
  // Historique : chaque modification conservée.
  assert.ok((await pool.query('SELECT COUNT(*)::int AS n FROM marche_history')).rows[0].n>30);
 }finally{await db.close()}
});
test('webhook Stripe : signature vérifiée',async()=>{
 const {signatureStripe}=await import('../../server/interop/etablissement.mjs');const payload='{"a":1}',ts=Math.floor(Date.now()/1000);
 const v1=createHmac('sha256',WEBHOOK).update(ts+'.'+payload).digest('hex');
 assert.equal(signatureStripe(payload,'t='+ts+',v1='+v1,WEBHOOK),true);assert.equal(signatureStripe(payload,'t='+ts+',v1='+v1,'autre'),false);assert.equal(signatureStripe(payload,'t='+(ts-1000)+',v1='+v1,WEBHOOK),false);
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import R from '../../dist/espace-patient-regles.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test prescriptions'});

const oui=Object.fromEntries(R.QUESTIONS.map(([id])=>[id,'oui']));
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

test('espace patient : demande de documents, dépôt contrôlé, consentement envoyé, signé, relance, droits et traçabilité',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[],objects=new Map();
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push({sms:m});return 'S1'},email:async m=>{sent.push({email:m});return 'E1'}};
  const bucket={async put(h,b,m){objects.set(h,{b:new Uint8Array(b),m})},async get(h){const o=objects.get(h);return o?{body:o.b,httpMetadata:{contentType:o.m.httpMetadata.contentType},customMetadata:o.m.customMetadata}:null}};
  const app=await makeApp({pool,bucket,cfg:config(env),messaging});
  const call=async(method,route,data,cookie,o=origin,headers={})=>app(new Request(origin+route,{method,headers:{Origin:o,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(data!==undefined?{body:data instanceof Uint8Array?data:JSON.stringify(data)}:{})}));
  const login=async(email,password)=>(await call('POST','/auth/login',{email,password})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,c);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  const pub=async(route,data,o)=>{const r=await call('POST','/api/espace-patient/'+route,data,undefined,o);return {status:r.status,data:await r.json()}};
  const up=async(token,bytes,{kind='document',categorie='bilan',nom='bilan.pdf',naissance='1980-01-01',commentaire=''}={})=>{const r=await call('POST','/api/espace-patient/upload?kind='+kind+'&categorie='+categorie,bytes,undefined,origin,{'Content-Type':'application/octet-stream','X-Acces':token,'X-Naissance':naissance,'X-Nom':encodeURIComponent(nom),'X-Commentaire':encodeURIComponent(commentaire)});return {status:r.status,data:await r.json()}};
  const tok=m=>(m.sms?.content||m.email?.text).match(/#acces=([a-f0-9]{64})/)[1];
  assert.equal((await api('PUT','/document',edit('stay/P1/core',{id:'P1',careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}))).status,200);
  await api('PUT','/document',edit('stay/P1/consult',{asa:'2',ext:{surgeryDate:'2099-12-03'}}));
  await api('PUT','/document',edit('stay/P1/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone:'+33611223344',email:'patient.fictif@example.test'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  // Le dossier ne peut pas écrire lui-même la rubrique remplie par le serveur.
  assert.equal((await api('PUT','/document',edit('stay/P1/espacePatient',{documents:[]}))).status,403);

  // 1. Demande de documents : message sans donnée de santé, destinataire du dossier.
  let r=await api('POST','/espace-patient/send',{stay:'P1',purpose:'documents',channels:['sms','email'],to:'+33600000000'});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(sent[0].sms.to,'+33611223344');assert.equal(sent[0].sms.tag,'iaselo-documents');assert.doesNotMatch(JSON.stringify(sent),/FICTIF|1980|2099/);
  const t1=tok(sent[0]);assert.equal(tok(sent[1]),t1);
  assert.equal((await pub('open',{token:t1},'https://pirate.example')).status,403);
  r=await pub('open',{token:t1});assert.equal(r.data.purpose,'documents');assert.equal(r.data.etablissement,'Clinique test');
  r=await pub('view',{token:t1,birthDate:'1981-01-01'});assert.equal(r.status,400);
  r=await pub('view',{token:t1,birthDate:'1980-01-01'});assert.equal(r.status,200);assert.equal(r.data.depot.ouvert,true);assert.equal(r.data.consentement,null);
  // Dépôts : date de naissance exigée, type réel contrôlé, doublon refusé.
  assert.equal((await up(t1,pdf,{naissance:'1999-01-01'})).status,400);
  assert.match((await up(t1,new TextEncoder().encode('<html>pirate</html>'),{nom:'bilan.pdf'})).data.error,/Format non accepté/);
  assert.match((await up(t1,new TextEncoder().encode('%PDF-1.4 /JavaScript (x)'))).data.error,/éléments actifs/);
  assert.match((await up(t1,pdf,{categorie:'inconnue'})).data.error,/type de document/);
  r=await up(t1,pdf,{commentaire:'Bilan du 18 novembre'});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.depot.documents.length,1);
  assert.equal((await up(t1,pdf)).status,409);
  const space=(await api('GET','/espace-patient/status?stay=P1')).data.espacePatient,doc=space.documents[0];
  assert.equal(doc.type,'application/pdf');assert.equal(doc.categorie,'bilan');assert.equal(doc.commentaire,'Bilan du 18 novembre');assert.equal(doc.source,'patient');assert.ok(space.demandeDocuments.at);
  // Rangé dans le dossier : lisible par l'équipe via la rubrique du séjour, version conservée.
  let f=await call('GET','/api/workspace/files/'+doc.hash+'?key='+encodeURIComponent('stay/P1/espacePatient'),undefined,cookie);assert.equal(f.status,200);assert.equal(new TextDecoder().decode(await f.arrayBuffer()).slice(0,5),'%PDF-');
  assert.ok((await api('GET','')).data.documents.some(d=>d.key==='stay/P1/espacePatient'&&d.data.documents.length===1));
  r=await api('POST','/espace-patient/action',{stay:'P1',action:'document-vu',id:doc.id});assert.equal(r.status,200);assert.ok(r.data.espacePatient.documents[0].vu.at);
  assert.equal((await api('POST','/espace-patient/action',{stay:'P1',action:'document-ecarte',id:doc.id})).status,400);

  // 2. Consentement : fiche complète, identité cohérente, réservé à l'anesthésiste.
  const fiche={patient:{nom:'FICTIF',prenom:'Test',naissance:'1980-01-01'},intervention:'Prothèse totale de hanche droite',datePrevue:'2099-12-03',consultation:{date:'2026-11-22',medecin:'Dr Démo'}};
  assert.equal((await api('POST','/espace-patient/send',{stay:'P1',purpose:'consentement',channels:['sms'],fiche:{...fiche,intervention:''}})).status,400);
  assert.equal((await api('POST','/espace-patient/send',{stay:'P1',purpose:'consentement',channels:['sms'],fiche:{...fiche,patient:{...fiche.patient,naissance:'1981-01-01'}}})).status,409);
  r=await api('POST','/espace-patient/send',{stay:'P1',purpose:'consentement',channels:['sms'],fiche});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.doesNotMatch(sent.at(-1).sms.content,/anesth|hanche|FICTIF/i);
  const t2=tok(sent.at(-1));
  r=await pub('view',{token:t2,birthDate:'1980-01-01'});assert.equal(r.data.consentement.statut,'ouvert');assert.equal(r.data.consentement.fiche.intervention,'Prothèse totale de hanche droite');
  assert.ok((await api('GET','/espace-patient/status?stay=P1')).data.espacePatient.consentement.ouvertLe);
  // Le lien « documents » donne aussi accès au consentement en attente, et le dépôt reste possible.
  assert.equal((await pub('view',{token:t1,birthDate:'1980-01-01'})).data.consentement.statut,'ouvert');
  // Relance : nouveau lien, l'ancien est fermé.
  r=await api('POST','/espace-patient/send',{stay:'P1',purpose:'consentement',channels:['email'],relance:true});assert.equal(r.status,200);assert.match(sent.at(-1).email.text,/Rappel/);
  assert.equal((await pub('view',{token:t2,birthDate:'1980-01-01'})).status,410);
  const t3=tok(sent.at(-1));
  r=await pub('consentement',{token:t3,birthDate:'1980-01-01',reponses:{informe:'oui'},signataire:'Test FICTIF',certifie:true});assert.equal(r.status,400);assert.equal(r.data.manquantes.length,7);
  r=await pub('consentement',{token:t3,birthDate:'1980-01-01',reponses:{...oui,transfusion:'non'},reserves:'Témoin de Jéhovah : à rediscuter',lieu:'Paris',signataire:'Test FICTIF',certifie:true,signature:'data:image/png;base64,iVBORw0KGgo='},origin);
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.consentement.recu.mode,'signature');
  assert.equal((await pub('consentement',{token:t3,birthDate:'1980-01-01',reponses:oui,signataire:'Test FICTIF',certifie:true})).status,409);
  let st=(await api('GET','/espace-patient/status?stay=P1')).data.espacePatient.consentement;
  assert.equal(R.statut(st).code,'signe-reserves');assert.match(st.recu.empreinte,/^[a-f0-9]{64}$/);
  assert.equal(st.recu.empreinte,await sha(R.canonique(st.envoi.fiche,{...st.recu})));
  r=await api('POST','/espace-patient/action',{stay:'P1',action:'contresigner'});assert.equal(r.status,200);assert.ok(r.data.espacePatient.consentement.contreSigne.at);
  assert.equal((await api('POST','/espace-patient/send',{stay:'P1',purpose:'consentement',channels:['sms'],fiche})).status,409);
  const {rows:ev}=await pool.query('SELECT mode,fingerprint FROM consent_evidence');assert.equal(ev.length,1);assert.equal(ev[0].fingerprint,st.recu.empreinte);
  await assert.rejects(pool.query('DELETE FROM consent_evidence'));

  // 3. Dépôt d'un formulaire signé sur un autre séjour, puis vérification non conforme : le patient peut recommencer.
  await api('PUT','/document',edit('stay/P2/core',{id:'P2',careTeamId:'demo-clinique',identity:{lastName:'ESSAI',firstName:'Deux',birthDate:'1975-05-05'}}));
  await api('PUT','/document',edit('stay/P2/invitationContact',{contact:{firstName:'Deux',lastName:'ESSAI',birthDate:'1975-05-05',phone:'+33622334455'},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  await api('POST','/espace-patient/send',{stay:'P2',purpose:'consentement',channels:['sms'],fiche:{...fiche,patient:{nom:'ESSAI',prenom:'Deux',naissance:'1975-05-05'}}});
  const t4=tok(sent.at(-1));
  r=await up(t4,pdf,{kind:'consentement',naissance:'1975-05-05',nom:'consentement signé.pdf'});assert.equal(r.status,201,JSON.stringify(r.data));
  assert.equal(R.statut((await api('GET','/espace-patient/status?stay=P2')).data.espacePatient.consentement).code,'depose');
  r=await api('POST','/espace-patient/action',{stay:'P2',action:'verifier',conforme:false,note:'Page 2 non signée'});assert.equal(r.status,200);
  r=await pub('view',{token:t4,birthDate:'1975-05-05'});assert.equal(r.data.consentement.refus.note,'Page 2 non signée');assert.equal(r.data.consentement.recu,null);
  r=await api('POST','/espace-patient/action',{stay:'P2',action:'papier',note:'Signé en consultation, dossier papier'});assert.equal(r.status,200);
  assert.equal(R.statut(r.data.espacePatient.consentement).code,'papier');

  // 4. Droits : un compte sans équipe ne voit ni n'envoie rien.
  await createAccount(pool,{email:'autre@example.test',name:'Autre fictif',passwordHash:await hashPassword('Mot de passe test 2026')});
  const other=await login('autre@example.test','Mot de passe test 2026');
  assert.equal((await api('POST','/espace-patient/send',{stay:'P1',purpose:'documents',channels:['sms']},other)).status,403);
  assert.equal((await api('GET','/espace-patient/status?stay=P1',undefined,other)).status,403);
  f=await call('GET','/api/workspace/files/'+doc.hash+'?key='+encodeURIComponent('stay/P1/espacePatient'),undefined,other);assert.equal(f.status,403);
  // Désactivation : lien fermé.
  assert.equal((await api('POST','/espace-patient/revoke',{stay:'P1',purpose:'documents'})).status,200);assert.equal((await pub('open',{token:t1})).status,410);

  // Journal : envois (destinataire masqué), ouvertures, dépôts, signature, lecture de fichier.
  const {rows}=await pool.query("SELECT action,actor,result,detail,reason FROM professional_access_log");
  for(const a of ['documents-demande','consentement-envoi','consentement-relance','document-patient-depot','consentement-signature','consentement-depot','consentement-verification','consentement-contresigne','document-patient-vu','file-read'])assert.ok(rows.some(x=>x.action===a),a);
  assert.ok(rows.some(x=>x.action==='document-patient-depot'&&x.result==='denied'));
  assert.doesNotMatch(rows.map(x=>x.detail+' '+x.reason).join(' '),/33611223344|patient\.fictif/);
 }finally{await db.close()}
});
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');

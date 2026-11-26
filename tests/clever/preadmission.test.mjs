import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test préadmission'});
const jpeg=n=>new Uint8Array([0xff,0xd8,0xff,0xe0,...new TextEncoder().encode('photo fictive '+n)]);
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

// Patients FICTIFS uniquement.
test('préadmission : lien à la fin du questionnaire, parcours endoscopie/chirurgie, pièces, admissions, rappels',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[],objects=new Map(),password='Mot de passe de test 2026',at0=new Date(Date.now()-60000).toISOString();
  for(const [n,job] of [['sec','secretariat'],['ide','infirmier'],['fact','facturation']]){const id=await createAccount(pool,{email:n+'@example.test',name:'Nom '+n,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at0]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2),($1,'endoscopie',$2)",[id,at0])}
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push({sms:m});return 'S1'},email:async m=>{sent.push({email:m});return 'E1'}};
  const bucket={async put(h,b,m){objects.set(h,{b:new Uint8Array(b),m})},async get(h){const o=objects.get(h);return o?{body:o.b,httpMetadata:{contentType:o.m.httpMetadata.contentType},customMetadata:o.m.customMetadata}:null}};
  const app=await makeApp({pool,bucket,cfg:config(env),messaging});
  const call=async(method,route,data,cookie,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(data!==undefined?{body:data instanceof Uint8Array?data:JSON.stringify(data)}:{})}));
  const login=async(email,pw)=>(await call('POST','/auth/login',{email,password:pw})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD),sec=await login('sec@example.test',password),ide=await login('ide@example.test',password);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,c);return {status:r.status,data:await r.json()}};
  const pub=async(route,data)=>{const r=await call('POST','/api/preadmission/'+route,data);return {status:r.status,data:await r.json()}};
  const up=async(token,piece,bytes,{naissance='1980-01-01',nom='piece.jpg'}={})=>{const r=await call('POST','/api/preadmission/upload?piece='+piece,bytes,undefined,{'Content-Type':'application/octet-stream','X-Acces':token,'X-Naissance':naissance,'X-Nom':encodeURIComponent(nom)});return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  const futur=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
  // Séjour d'endoscopie (équipe Endoscopie) et séjour de chirurgie, patients fictifs.
  await api('PUT','/document',edit('stay/E1/core',{id:'E1',careTeamId:'endoscopie',specialty:'Gastro-entérologie',mode:'Ambulatoire',identity:{lastName:'FICTIF',firstName:'Endo',birthDate:'1980-01-01'}}));
  await api('PUT','/document',edit('stay/E1/surgicalAnnouncement',{published:{fields:{procedure:'Coloscopie totale',date:futur}}}));
  await api('PUT','/document',edit('stay/C1/core',{id:'C1',careTeamId:'demo-clinique',specialty:'Orthopédie',mode:'Hospitalisation',identity:{lastName:'ESSAI',firstName:'Chir',birthDate:'1975-05-05'}}));
  await api('PUT','/document',edit('stay/C1/consult',{ext:{surgeryDate:futur,operation:'Prothèse totale de hanche'}}));
  const contact=(first,last,birth,extra)=>({contact:{firstName:first,lastName:last,birthDate:birth,...extra},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'});
  await api('PUT','/document',edit('stay/E1/invitationContact',contact('Endo','FICTIF','1980-01-01',{phone:'+33611223344',email:'endo.fictif@example.test'})));
  await api('PUT','/document',edit('stay/C1/invitationContact',contact('Chir','ESSAI','1975-05-05',{phone:'+33622334455'})));
  // Le dossier n'écrit pas lui-même la rubrique tenue par le serveur.
  assert.equal((await api('PUT','/document',edit('stay/E1/preadmissionPatient',{pieces:[]}))).status,403);

  // 1. Fin du questionnaire : lien de préadmission affiché et envoyé (SMS + e-mail), sans donnée de santé.
  let r=await api('POST','/questionnaire/invite',{stay:'E1',contact:contact('Endo','FICTIF','1980-01-01',{phone:'+33611223344',email:'endo.fictif@example.test'}).contact,confirmed:true});assert.equal(r.status,201,JSON.stringify(r.data));
  const qtok=r.data.link.split('#invitation=')[1];
  let q=await call('POST','/api/questionnaire/submit',{token:qtok,answers:{birthname:'FICTIF',firstname:'Endo',dob:'1980-01-01',signature:'Endo FICTIF',signedDate:'2026-11-26'},confirmed:true});
  const qr=await q.json();assert.equal(q.status,201,JSON.stringify(qr));
  assert.equal(qr.preadmission.type,'endoscopie');assert.deepEqual(qr.preadmission.envoye.sort(),['email','sms']);
  const t1=qr.preadmission.lien.match(/preadmission\.html#acces=([a-f0-9]{64})$/)[1];
  assert.equal(sent.length,2);assert.ok(sent.every(m=>(m.sms?.content||m.email.text).includes(t1)));
  assert.equal(sent[0].sms.to,'+33611223344');assert.equal(sent[0].sms.tag,'iaselo-preadmission');
  assert.doesNotMatch(JSON.stringify(sent.map(m=>m.sms?m.sms.content:[m.email.subject,m.email.text,m.email.html])),/FICTIF|Endo\b|1980|colo|endosc/i);

  // 2. Patient : date de naissance exigée, parcours endoscopie (préparation colique, pas de douches).
  assert.equal((await call('POST','/api/preadmission/open',{token:t1},undefined,{Origin:'https://pirate.example'})).status,403);
  assert.equal((await pub('view',{token:t1,birthDate:'1981-01-01'})).status,400);
  r=await pub('view',{token:t1,birthDate:'1980-01-01'});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.type,'endoscopie');assert.equal(r.data.etat.code,'a-faire');assert.equal(r.data.patient.prenom,'Endo');
  assert.match(r.data.texteAutorisation,/Coloscopie totale/);
  r=await pub('etape',{token:t1,birthDate:'1980-01-01',id:'douches'});assert.equal(r.status,400,'pas de douches préopératoires en endoscopie');
  r=await pub('etape',{token:t1,birthDate:'1980-01-01',id:'preparationColique'});assert.equal(r.status,200);assert.ok(r.data.data.etapes.preparationColique.at);
  r=await pub('etape',{token:t1,birthDate:'1980-01-01',id:'devis',valeur:{choix:'depose'}});assert.equal(r.status,400,'devis à déposer d’abord');
  // Formulaire : brouillon, puis envoi complet refusé tant qu'il manque des champs.
  const form={lieuNaissance:'Lyon',adresse:'1 rue Fictive',codePostal:'75016',ville:'Paris',coordonneesExactes:true,regime:'general',mutuelle:'Mutuelle fictive',prevenir:{nom:'PROCHE',prenom:'Fictif',lien:'Conjoint(e)',telephone:'0600000000'},confiance:'prevenir',chambre:'particuliere',retourAccompagne:'oui'};
  r=await pub('formulaire',{token:t1,birthDate:'1980-01-01',formulaire:{adresse:'1 rue Fictive'}});assert.equal(r.status,200);assert.equal(r.data.etat.code,'en-cours');
  r=await pub('formulaire',{token:t1,birthDate:'1980-01-01',formulaire:{adresse:'1 rue Fictive'},soumettre:true});assert.equal(r.status,400);assert.ok(r.data.manquants.includes('regime'));
  r=await pub('formulaire',{token:t1,birthDate:'1980-01-01',formulaire:form,soumettre:true});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.ok(r.data.data.formulaire.soumisLe);assert.equal(r.data.etat.preadmission,false);assert.deepEqual(r.data.etat.piecesManquantes,['identiteRecto','identiteVerso','vitale','domicile','mutuelle']);
  // Pièces : type réel contrôlé, une pièce active par type (remplacement conservé).
  assert.match((await up(t1,'vitale',new TextEncoder().encode('<html>x</html>'))).data.error,/Format non accepté/);
  assert.equal((await up(t1,'inconnue',jpeg(0))).status,400);
  assert.equal((await up(t1,'vitale',jpeg(1),{naissance:'1999-01-01'})).status,400);
  for(const [i,p] of ['identiteRecto','identiteVerso','vitale','mutuelle'].entries()){r=await up(t1,p,jpeg(i+10));assert.equal(r.status,201,JSON.stringify(r.data))}
  r=await up(t1,'vitale',jpeg(99),{nom:'vitale-nette.jpg'});assert.equal(r.status,201);assert.equal(r.data.data.pieces.filter(p=>p.piece==='vitale').length,1);
  r=await up(t1,'domicile',pdf,{nom:'facture.pdf'});assert.equal(r.status,201);assert.equal(r.data.etat.preadmission,true);assert.equal(r.data.etat.code,'faite');
  r=await up(t1,'devis',pdf,{nom:'devis.pdf'});assert.equal(r.status,409,'même fichier déjà transmis');
  r=await up(t1,'devis',new TextEncoder().encode('%PDF-1.4 devis fictif'),{nom:'devis.pdf'});assert.equal(r.status,201);
  r=await pub('etape',{token:t1,birthDate:'1980-01-01',id:'devis',valeur:{choix:'depose'}});assert.equal(r.status,200);
  r=await pub('etape',{token:t1,birthDate:'1980-01-01',id:'rdv',valeur:{choix:'rdv'}});assert.equal(r.status,400);
  r=await pub('etape',{token:t1,birthDate:'1980-01-01',id:'rdv',valeur:{choix:'rdv',date:futur}});assert.equal(r.status,200);
  // Autorisation : signature simple, preuve conservée, une seule fois.
  assert.equal((await pub('autorisation',{token:t1,birthDate:'1980-01-01',qualite:'patient',signataire:'Endo FICTIF'})).status,400);
  r=await pub('autorisation',{token:t1,birthDate:'1980-01-01',qualite:'patient',signataire:'Endo FICTIF',certifie:true});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await pub('autorisation',{token:t1,birthDate:'1980-01-01',qualite:'patient',signataire:'Endo FICTIF',certifie:true})).status,409);
  const {rows:ev}=await pool.query("SELECT mode FROM consent_evidence WHERE stay_id='E1'");assert.equal(ev[0].mode,'autorisation-preadmission');

  // 3. Admissions (secrétariat) : liste, compte rendu, fichiers, pièce non conforme, complément, validation.
  r=await api('GET','/preadmission/liste',undefined,sec);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.peutVerifier,true);
  const lE=r.data.preadmissions.find(x=>x.stay==='E1'),lC=r.data.preadmissions.find(x=>x.stay==='C1');
  assert.equal(lE.type,'endoscopie');assert.equal(lE.etat.code,'faite');assert.equal(lE.pieces,6);assert.equal(lC.type,'chirurgie');assert.equal(lC.etat.code,'a-faire');
  r=await api('GET','/preadmission/dossier?stay=E1',undefined,sec);assert.equal(r.status,200);const dos=r.data;
  assert.equal(dos.contact.telephone,'+33611223344');assert.equal(dos.data.formulaire.ville,'Paris');assert.ok(dos.liens[0].ouvertLe);
  const vit=dos.data.pieces.find(p=>p.piece==='vitale'&&!p.remplace);
  let f=await call('GET','/api/workspace/files/'+vit.hash+'?key='+encodeURIComponent('stay/E1/preadmissionPatient'),undefined,sec);assert.equal(f.status,200);
  f=await call('GET','/api/workspace/files/'+vit.hash+'?key='+encodeURIComponent('stay/E1/preadmissionPatient'),undefined,ide);assert.equal(f.status,403,'infirmière : pas d’accès aux pièces administratives');
  assert.equal((await api('GET','/preadmission/liste',undefined,ide)).status,403);
  assert.equal((await api('POST','/preadmission/action',{stay:'E1',action:'piece',id:vit.id,conforme:false},sec)).status,400,'motif obligatoire');
  r=await api('POST','/preadmission/action',{stay:'E1',action:'piece',id:vit.id,conforme:false,motif:'Carte illisible'},sec);assert.equal(r.status,200);
  assert.equal(r.data.etat.code,'a-completer');assert.deepEqual(r.data.etat.piecesManquantes,['vitale']);
  assert.equal((await api('POST','/preadmission/action',{stay:'E1',action:'verifier'},sec)).status,409);
  sent.length=0;r=await api('POST','/preadmission/action',{stay:'E1',action:'a-completer',motif:'Renvoyez votre carte Vitale',envoyer:true},sec);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(sent.length,2);assert.doesNotMatch(JSON.stringify(sent.map(m=>m.sms?m.sms.content:m.email.text)),/Vitale|illisible/,'motif jamais dans le message');assert.match(sent[0].sms.content,/rappel/);
  const t2=sent[0].sms.content.match(/#acces=([a-f0-9]{64})/)[1];
  r=await pub('view',{token:t2,birthDate:'1980-01-01'});assert.equal(r.data.data.aCompleter.motif,'Renvoyez votre carte Vitale');assert.equal(r.data.etat.refusees[0].motif,'Carte illisible');
  r=await up(t2,'vitale',jpeg(200));assert.equal(r.status,201);assert.equal(r.data.etat.code,'faite');assert.ok(r.data.data.aCompleter.reponduLe);
  r=await api('POST','/preadmission/action',{stay:'E1',action:'verifier'},sec);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.etat.code,'verifiee');
  assert.ok(r.data.data.pieces.filter(p=>!p.remplace).every(p=>p.controle));
  // Changement de type par les admissions.
  assert.equal((await api('GET','/preadmission/liste')).status,200,'le médecin consulte aussi les préadmissions');
  r=await api('POST','/preadmission/action',{stay:'C1',action:'type',type:'endoscopie'},sec);assert.equal(r.status,200);assert.equal(r.data.type,'endoscopie');
  r=await api('POST','/preadmission/action',{stay:'C1',action:'type',type:'chirurgie'},sec);assert.equal(r.data.type,'chirurgie');
  const {rows:logs}=await pool.query("SELECT action FROM professional_access_log WHERE target LIKE 'stay/E1/preadmissionPatient' OR target='preadmission'");
  for(const a of ['preadmission-envoi','preadmission-acces','preadmission-piece','preadmission-autorisation','preadmission-liste','preadmission-verifier'])assert.ok(logs.some(l=>l.action===a),a);

  // 4. Rappels J-7, J-3, J-1 tant que la préadmission n'est pas faite (C1 : pas faite ; E1 : vérifiée).
  sent.length=0;const j=n=>new Date(new Date(futur+'T12:00:00Z').getTime()-n*86400000);
  const at=(d,h)=>new Date(d.toISOString().slice(0,10)+'T'+h+':00:00Z');
  await app.rappels({now:at(j(7),'05')});assert.equal(sent.length,0,'hors plage horaire');
  let rr=await app.rappels({now:at(j(7),'10')});
  assert.ok(rr.resultats.some(x=>x.stay==='C1'&&x.kind==='preadmission-j-7'&&x.ok),JSON.stringify(rr.resultats));
  assert.ok(rr.resultats.some(x=>x.stay==='E1'&&x.kind==='preadmission-j-7'&&x.sansObjet));
  assert.equal(sent.filter(m=>m.sms?.tag==='iaselo-preadmission').length,1);assert.match(sent.at(-1).sms.content,/rappel/);
  await app.rappels({now:at(j(7),'12')});assert.equal(sent.filter(m=>m.sms?.tag==='iaselo-preadmission').length,1,'pas de double envoi');
  r=await api('GET','/preadmission/dossier?stay=C1',undefined,sec);assert.ok(r.data.data.envois.some(e=>e.rappel&&e.motif==='preadmission-j-7'));
  // C1 (chirurgie, sans e-mail) : parcours avec douches et sans préparation colique.
  const t3=sent.at(-1).sms.content.match(/#acces=([a-f0-9]{64})/)[1];
  r=await pub('view',{token:t3,birthDate:'1975-05-05'});assert.equal(r.data.type,'chirurgie');
  assert.equal((await pub('etape',{token:t3,birthDate:'1975-05-05',id:'douches'})).status,200);
  assert.equal((await pub('etape',{token:t3,birthDate:'1975-05-05',id:'preparationColique'})).status,400);
  // Séjour sans coordonnées : alerte visible des admissions, pas d'envoi.
  await api('PUT','/document',edit('stay/N1/core',{id:'N1',careTeamId:'demo-clinique',specialty:'ORL',identity:{lastName:'SANS',firstName:'Contact',birthDate:'1990-01-01'}}));
  await api('PUT','/document',edit('stay/N1/consult',{ext:{surgeryDate:futur}}));
  rr=await app.rappels({now:at(j(3),'11')});assert.ok(rr.resultats.some(x=>x.stay==='N1'&&x.alerte));
  r=await api('GET','/preadmission/dossier?stay=N1',undefined,sec);assert.equal(r.data.data.rappels[0].ok,false);
 }finally{await db.close()}
});

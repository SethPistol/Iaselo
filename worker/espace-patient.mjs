// IASELO · espace patient : documents déposés avant la consultation et consentement d'anesthésie.
//  Professionnels (session requise) :
//   POST /api/workspace/espace-patient/send     envoie par SMS et/ou e-mail un lien personnel (documents ou consentement, relance)
//   GET  /api/workspace/espace-patient/status   liens envoyés pour un séjour (date, validité, ouverture)
//   POST /api/workspace/espace-patient/revoke   désactive les liens encore valides d'un séjour
//   POST /api/workspace/espace-patient/action   papier reçu, dépôt vérifié, contre-signature, document vu ou écarté
//  Patient (lien reçu, sans compte ; date de naissance vérifiée à chaque appel) :
//   POST /api/espace-patient/open | view | consentement | upload
//
// RGPD / HDS : les fichiers restent sur le stockage objet de l'hébergeur (Cellar, offre HDS), jamais chez un tiers ;
// le SMS et l'e-mail (Brevo) ne contiennent que l'établissement et un lien ; le lien est stocké haché ;
// type réel des fichiers contrôlé (PDF, JPEG, PNG ; PDF actifs refusés), 10 Mo par fichier, 20 fichiers par séjour ;
// chaque envoi, ouverture, dépôt, signature et lecture est tracé dans le journal d'accès.
import R from '../dist/espace-patient-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(request,max=200000){const bytes=await request.arrayBuffer();if(bytes.byteLength>max)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof data==='string'?new TextEncoder().encode(data):data)),b=>b.toString(16).padStart(2,'0')).join('');
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const mask={email:v=>{const [u,d]=String(v).split('@');return d?u.slice(0,1)+'***@'+d:'***'},sms:v=>{v=String(v);return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'}};
const MAX_ECHECS=5,MODULE='espacePatient';
const docKey=stay=>'stay/'+stay+'/'+MODULE;
const validStay=s=>typeof s==='string'&&/^[^/]{1,80}$/.test(s);
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const empty=()=>({consentement:null,documents:[]});

// Écriture serveur de la rubrique « espacePatient » : révision suivante, versions conservées (déclencheur), sans écrasement concurrent.
async function updateSpace(env,stay,actor,reason,mutate){
 const key=docKey(stay);
 for(let attempt=0;attempt<4;attempt++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();
  const data=row?JSON.parse(row.data):empty();data.documents=Array.isArray(data.documents)?data.documents:[];
  const outcome=await mutate(data);if(outcome?.error)return outcome;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,key,row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(key,payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...outcome};
 }
 return {error:'Enregistrement concurrent : réessayez.',status:409};
}

/* ---------------- Messages (aucune donnée de santé) ---------------- */
export function espaceMessages(establishment,link,purpose,relance=false){
 const etab=establishment||'Clinique du Trocadéro';
 const consent=purpose==='consentement';
 const objet=consent?'Un document est à signer avant votre intervention':'Transmettez vos documents avant votre consultation';
 const phrase=consent?(relance?'Rappel : un document est toujours à signer avant votre intervention.':'À la suite de votre consultation, un document est à lire et à signer avant votre intervention.')
  :'Vous pouvez nous transmettre dès maintenant vos documents utiles (bilans, ordonnances, courriers de vos médecins).';
 return {
  sms:etab+' : '+(consent?(relance?'rappel, un document est à signer avant votre intervention : ':'un document est à signer avant votre intervention : '):'transmettez vos documents (bilans, ordonnances, courriers) avant votre consultation : ')+link+' (votre date de naissance vous sera demandée).',
  subject:objet+' · '+etab,
  text:'Bonjour,\n\n'+phrase+'\n'+link+'\n\nVotre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas.\nNe répondez pas à ce message et n’y joignez aucun document.\nSi ce message ne vous concerne pas, ignorez-le.\n\n'+etab,
  html:'<p>Bonjour,</p><p>'+escapeHtml(phrase)+'</p><p><a href="'+escapeHtml(link)+'">'+(consent?'Lire et signer le document':'Transmettre mes documents')+'</a></p><p>Votre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas.</p><p>Ne répondez pas à ce message et n’y joignez aucun document. Si ce message ne vous concerne pas, ignorez-le.</p><p>'+escapeHtml(etab)+'</p>'
 };
}

/* ---------------- Professionnels ---------------- */
async function send(request,env,acl,url){
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const d=await body(request);
 const r=await envoyer(env,acl,url.origin,{stay:String(d.stay||''),purpose:d.purpose,channels:d.channels,fiche:d.fiche,relance:d.relance===true});
 return json(r.body,r.status);
}
// Envoi d'un lien patient (bouton du dossier ou envoi automatique à la validation de la consultation).
async function envoyer(env,acl,origin,{stay,purpose,channels:asked,fiche:ficheDemandee,relance:relanceDemandee=false,auto=false}){
 const json=(body,status=200)=>({body,status});
 if(!validStay(stay)||!['documents','consentement'].includes(purpose))return json({error:'Demande invalide.'},400);
 const contactKey='stay/'+stay+'/invitationContact';
 const allowedJobs=purpose==='consentement'?['anesthesiste']:['anesthesiste','chirurgien','secretariat'];
 if(!acl.canRead(contactKey)||!allowedJobs.includes(acl.job))return json({error:purpose==='consentement'?'Envoi du consentement réservé à l’anesthésiste du séjour.':'Envoi hors habilitation.'},403);
 const channels=Array.isArray(asked)?[...new Set(asked)]:[];
 if(!channels.length||channels.some(c=>!['sms','email'].includes(c)))return json({error:'Choisissez SMS et/ou e-mail.'},400);
 const messaging=env.MESSAGING;if(!messaging)return json({error:'Envoi Brevo non configuré sur ce serveur.'},503);
 // Destinataire : coordonnées vérifiées du séjour, jamais une adresse transmise par la requête.
 const contact=(await docData(env,contactKey))?.contact;
 if(!contact)return json({error:'Coordonnées vérifiées introuvables : enregistrez-les dans « Questionnaire patient ».'},409);
 if(!R.isDate(contact.birthDate))return json({error:'Date de naissance du patient manquante : elle sert à protéger l’accès.'},409);
 const space=(await docData(env,docKey(stay)))||empty(),consult=await docData(env,'stay/'+stay+'/consult');
 const datePrevue=R.isDate(consult?.ext?.surgeryDate)?consult.ext.surgeryDate:'';
 let fiche=null,relance=false;
 if(purpose==='consentement'){
  const st=R.statut(space.consentement);
  relance=relanceDemandee;
  if(st.recu)return json({error:'Le consentement a déjà été reçu pour ce séjour.'},409);
  if(relance){if(!space.consentement?.envoi||st.code==='annule')return json({error:'Aucun consentement en attente à relancer.'},409);fiche=space.consentement.envoi.fiche}
  else{
   fiche=R.fiche({...ficheDemandee,etablissement:messaging.establishment||ficheDemandee?.etablissement});
   const missing=R.ficheManquants(fiche);if(missing.length)return json({error:'À compléter avant l’envoi : '+missing.join(', ')+'.'},400);
   if(fiche.patient.naissance!==contact.birthDate)return json({error:'La date de naissance de la fiche ne correspond pas aux coordonnées vérifiées du patient.'},409);
  }
 }
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await sha(token),at=new Date().toISOString();
 const expiresAt=R.expiration(fiche?.datePrevue||datePrevue);
 // Un seul lien actif par séjour et par usage : un nouvel envoi (ou une relance) ferme le précédent.
 await env.DB.batch([
  env.DB.prepare('UPDATE patient_space_links SET revoked=1 WHERE stay_id=? AND purpose=? AND revoked=0').bind(stay,purpose),
  env.DB.prepare('INSERT INTO patient_space_links(token_hash,stay_id,purpose,birth_date,created_by,created_at,expires_at,channels) VALUES(?,?,?,?,?,?,?,?)').bind(hash,stay,purpose,contact.birthDate,acl.profile.user_id,at,expiresAt,channels.join(','))
 ]);
 const link=origin+'/espace-patient.html#acces='+token,text=espaceMessages(messaging.establishment,link,purpose,relance),results=[];
 const action=purpose==='consentement'?(relance?'consentement-relance':auto?'consentement-envoi-auto':'consentement-envoi'):'documents-demande';
 for(const channel of channels){
  const to=channel==='sms'?contact.phone:contact.email,label=channel==='sms'?'SMS':'E-mail';
  if(!to){results.push({channel,sent:false,error:label+' : aucune coordonnée vérifiée.'});continue}
  try{
   const ref=channel==='sms'?await messaging.sms({to,content:text.sms,tag:'iaselo-'+purpose}):await messaging.email({to,subject:text.subject,text:text.text,html:text.html,tag:'iaselo-'+purpose});
   await acl.log(action,docKey(stay),'allowed',label+' envoyé via Brevo','Destinataire '+mask[channel](to)+(ref?' · réf. Brevo '+ref:''));
   results.push({channel,sent:true,to:mask[channel](to),at:new Date().toISOString()});
  }catch(e){
   const error=String(e.message||'Envoi impossible.').slice(0,200);
   await acl.log(action,docKey(stay),'denied',label+' non envoyé','Destinataire '+mask[channel](to)+' · '+error);
   results.push({channel,sent:false,error:label+' : '+error});
  }
 }
 const sent=results.filter(r=>r.sent);
 if(!sent.length){await env.DB.prepare('UPDATE patient_space_links SET revoked=1 WHERE token_hash=?').bind(hash).run();return json({results},502)}
 const who=acl.profile.display_name||'Professionnel',ch=sent.map(r=>r.channel);
 const saved=await updateSpace(env,stay,acl.profile.user_id,purpose==='consentement'?(relance?'Relance du consentement':'Consentement envoyé au patient'):'Demande de documents envoyée',data=>{
  if(purpose==='documents'){data.demandeDocuments={at,by:who,channels:ch,expiresAt,historique:[...(data.demandeDocuments?.historique||[]),{at,by:who,channels:ch}].slice(-20)};return}
  if(relance){data.consentement.relances=[...(data.consentement.relances||[]),{at,by:who,channels:ch}];data.consentement.expiresAt=expiresAt;return}
  data.consentement={envoi:{at,by:who,channels:ch,fiche,...(auto?{automatique:true}:{})},relances:[],expiresAt,ouvertLe:null,recu:null,verification:null,contreSigne:null,annule:null};
 });
 if(saved.error)return json({error:saved.error},saved.status||409);
 return json({results,expiresAt},200);
}


/* ---------------- Envoi automatique à la validation de la consultation ---------------- */
// Dès que la consultation d'anesthésie passe à « validée », le consentement part au patient (SMS + e-mail),
// sans clic supplémentaire. Jamais de double envoi ; si l'envoi est impossible, une alerte reste visible au dossier.
const pendingAuto=new Set(),enCours=new Set();
export const attendreConsentements=()=>Promise.allSettled([...pendingAuto]);
const trackAuto=p=>{pendingAuto.add(p);p.catch(e=>console.error('consentement_auto',e?.message||e)).finally(()=>pendingAuto.delete(p));return p};
const consultRe=/^stay\/([^/]{1,80})\/consult$/;
const parisToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// Avant l'écriture : la consultation était-elle déjà validée ?
export async function consentAvant(env,docs){
 const out=new Map();
 for(const d of docs)if(consultRe.test(d.key))out.set(d.key,(await docData(env,d.key))?.validated===true);
 return out;
}
// Après l'écriture confirmée : passage à « validée » → envoi automatique en arrière-plan.
export async function consentDeclencher(env,acl,docs,avant,origin){
 try{for(const d of docs){
  if(!avant.has(d.key)||avant.get(d.key)||d.data?.validated!==true)continue;
  const stay=consultRe.exec(d.key)[1];
  if(acl.job!=='anesthesiste'){await acl.log('consentement-envoi-auto',docKey(stay),'denied','Consultation validée hors profil anesthésiste : envoi automatique non lancé');continue}
  trackAuto(autoConsent(env,acl,stay,origin,docs));
 }}catch(e){console.error('consentement_auto_declenchement',e?.message||e)}// l'enregistrement reste confirmé ; l'envoi manuel reste possible
}
export function ficheDepuisDossier(docs,{etablissement='',medecin=''}={}){
 const id=docs.core?.identity||{},e=docs.consult?.ext||{},ann=docs.surgicalAnnouncement?.published?.fields||{};
 return R.fiche({etablissement,patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||'',naissance:id.birthDate||''},
  intervention:[ann.procedure||e.operation,ann.laterality&&ann.laterality!=='Non applicable'?String(ann.laterality).toLowerCase():''].filter(Boolean).join(' · '),
  datePrevue:R.datePrevueSejour({consult:docs.consult,surgicalAnnouncement:docs.surgicalAnnouncement}),
  consultation:{date:R.isDate(e.consultDate)?e.consultDate:parisToday(),medecin:e.author||medecin}});
}
async function autoConsent(env,acl,stay,origin,batch){
 if(enCours.has(stay))return {skipped:'en-cours'};
 enCours.add(stay);
 try{
  const key=docKey(stay),get=async k=>{const d=batch.find(x=>x.key==='stay/'+stay+'/'+k);return d?d.data:await docData(env,'stay/'+stay+'/'+k)};
  const space=(await docData(env,key))||empty(),st=R.statut(space.consentement);
  if(st.recu||(space.consentement?.envoi&&st.code!=='annule')){
   await acl.log('consentement-envoi-auto',key,'allowed','Consultation validée : consentement déjà '+(st.recu?'reçu':'envoyé')+', pas de nouvel envoi');
   return {skipped:'deja'};
  }
  const at=new Date().toISOString(),who=acl.profile.display_name||'Anesthésiste';
  const echec=async raison=>{
   await acl.log('consentement-envoi-auto',key,'denied','Consentement non envoyé automatiquement',raison);
   await updateSpace(env,stay,acl.profile.user_id,'Envoi automatique du consentement impossible',data=>{data.consentementAuto={at,by:who,ok:false,raison}});
   return {ok:false,raison};
  };
  const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact;
  if(!contact)return echec('Coordonnées vérifiées du patient introuvables : enregistrez son téléphone et son e-mail dans « Questionnaire patient », puis envoyez le consentement.');
  const messaging=env.MESSAGING;
  if(!messaging)return echec('Envoi SMS et e-mail non configuré sur ce serveur.');
  const channels=['sms','email'].filter(c=>(c==='sms'?contact.phone:contact.email)&&messaging.channels?.[c]!==false);
  if(!channels.length)return echec(!contact.phone&&!contact.email?'Ni téléphone ni e-mail vérifié pour ce patient.':'Aucun canal d’envoi disponible (SMS ou e-mail) pour les coordonnées du patient.');
  const fiche=ficheDepuisDossier({core:await get('core'),consult:await get('consult'),surgicalAnnouncement:await get('surgicalAnnouncement')},{etablissement:messaging.establishment,medecin:acl.profile.display_name||''});
  const r=await envoyer(env,acl,origin,{stay,purpose:'consentement',channels,fiche,auto:true});
  if(r.status!==200)return echec(r.body.error||(r.body.results||[]).map(x=>x.error).filter(Boolean).join(' · ')||'Envoi impossible.');
  const manques=[...['sms','email'].filter(c=>!channels.includes(c)).map(c=>(c==='sms'?'SMS':'E-mail')+' : aucune coordonnée vérifiée.'),...r.body.results.filter(x=>!x.sent).map(x=>x.error)];
  await updateSpace(env,stay,acl.profile.user_id,'Consentement envoyé automatiquement',data=>{data.consentementAuto={at,by:who,ok:true,resultats:r.body.results,...(manques.length?{partiel:manques}:{})}});
  return {ok:true,results:r.body.results};
 }finally{enCours.delete(stay)}
}


async function status(request,env,acl,url){
 const stay=String(url.searchParams.get('stay')||'');
 if(!validStay(stay)||!acl.canRead(docKey(stay)))return json({error:'Accès refusé.'},403);
 const rows=(await env.DB.prepare('SELECT purpose,created_at,expires_at,revoked,channels,first_viewed_at,last_viewed_at,view_count,failed_attempts FROM patient_space_links WHERE stay_id=? ORDER BY created_at DESC').bind(stay).all()).results||[];
 const now=new Date().toISOString();
 const space=(await docData(env,docKey(stay)))||empty();
 return json({espacePatient:space,links:rows.slice(0,30).map(r=>({purpose:r.purpose,sentAt:r.created_at,expiresAt:r.expires_at,active:!Number(r.revoked)&&r.expires_at>now&&Number(r.failed_attempts||0)<MAX_ECHECS,channels:String(r.channels||'').split(',').filter(Boolean),firstViewedAt:r.first_viewed_at||null,views:Number(r.view_count||0),locked:Number(r.failed_attempts||0)>=MAX_ECHECS}))});
}

async function revoke(request,env,acl){
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const d=await body(request),stay=String(d.stay||''),purpose=d.purpose;
 if(!validStay(stay)||!['documents','consentement'].includes(purpose))return json({error:'Demande invalide.'},400);
 if(!acl.canRead(docKey(stay))||!(purpose==='consentement'?['anesthesiste']:['anesthesiste','chirurgien']).includes(acl.job))return json({error:'Action hors habilitation.'},403);
 await env.DB.prepare('UPDATE patient_space_links SET revoked=1 WHERE stay_id=? AND purpose=? AND revoked=0').bind(stay,purpose).run();
 const who=acl.profile.display_name||'Professionnel',at=new Date().toISOString();
 const r=await updateSpace(env,stay,acl.profile.user_id,'Lien patient désactivé',data=>{if(purpose==='consentement'&&data.consentement&&!R.statut(data.consentement).recu)data.consentement.annule={at,by:who};if(purpose==='documents'&&data.demandeDocuments)data.demandeDocuments.fermeLe=at});
 if(r.error)return json({error:r.error},r.status||409);
 await acl.log(purpose==='consentement'?'consentement-lien-ferme':'documents-lien-ferme',docKey(stay),'allowed','Lien patient désactivé');
 return json({revoked:true});
}

async function action(request,env,acl){
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const d=await body(request),stay=String(d.stay||''),key=docKey(stay);
 if(!validStay(stay)||!acl.canRead(key))return json({error:'Accès refusé.'},403);
 const who=acl.profile.display_name||'Professionnel',at=new Date().toISOString(),note=String(d.note||'').trim().slice(0,400);
 const anesth=acl.job==='anesthesiste',clinician=['anesthesiste','chirurgien','infirmier'].includes(acl.job);
 let reason='',log='';
 const r=await updateSpace(env,stay,acl.profile.user_id,'Espace patient : '+d.action,data=>{
  const c=data.consentement,st=R.statut(c);
  if(d.action==='papier'){
   if(!anesth)return {error:'Réservé à l’anesthésiste.',status:403};
   if(st.recu)return {error:'Consentement déjà reçu.',status:409};
   if(note.length<3)return {error:'Précisez comment le consentement papier a été recueilli (ex. signé en consultation, rangé au dossier papier).',status:400};
   data.consentement={...(c||{envoi:null,relances:[]}),recu:{mode:'papier',at,by:who,note},verification:null,annule:null};reason='Consentement papier enregistré';log='consentement-papier';return;
  }
  if(d.action==='verifier'){
   if(!anesth)return {error:'Réservé à l’anesthésiste.',status:403};
   if(c?.recu?.mode!=='depot')return {error:'Aucun document signé à vérifier.',status:409};
   if(d.conforme!==true&&note.length<3)return {error:'Indiquez ce qui ne va pas (page manquante, non signé, illisible…).',status:400};
   c.verification={at,by:who,conforme:d.conforme===true,note};reason=d.conforme===true?'Consentement déposé vérifié conforme':'Consentement déposé non conforme';log='consentement-verification';
   // Non conforme : le patient peut en déposer un autre ou signer en ligne.
   if(d.conforme!==true){c.historique=[...(c.historique||[]),{recu:c.recu,verification:c.verification}].slice(-10);c.recu=null;c.verification={...c.verification,precedent:true}}
   return;
  }
  if(d.action==='contresigner'){
   if(!anesth)return {error:'Réservé à l’anesthésiste.',status:403};
   if(!st.recu)return {error:'Le consentement du patient n’est pas encore reçu.',status:409};
   if(c.contreSigne)return {error:'Déjà contresigné.',status:409};
   c.contreSigne={at,by:who,userId:acl.profile.user_id};reason='Consentement contresigné';log='consentement-contresigne';return;
  }
  if(d.action==='document-vu'||d.action==='document-ecarte'){
   if(!clinician)return {error:'Action hors habilitation.',status:403};
   const doc=data.documents.find(x=>x.id===d.id);if(!doc)return {error:'Document introuvable.',status:404};
   if(d.action==='document-vu'){doc.vu={at,by:who};reason='Document patient lu';log='document-patient-vu'}
   else{if(note.length<3)return {error:'Indiquez le motif (doublon, document d’un autre patient, illisible…).',status:400};doc.ecarte={at,by:who,motif:note};reason='Document patient écarté (conservé)';log='document-patient-ecarte'}
   return;
  }
  return {error:'Action inconnue.',status:400};
 });
 if(r.error)return json({error:r.error},r.status||409);
 await acl.log(log,key,'allowed',reason,note?note.slice(0,200):'');
 return json({espacePatient:r.data});
}

export async function staffEspacePatientApi(request,env,acl){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/workspace/espace-patient/'))return null;
 if(url.pathname.endsWith('/send'))return send(request,env,acl,url);
 if(url.pathname.endsWith('/status'))return status(request,env,acl,url);
 if(url.pathname.endsWith('/revoke'))return revoke(request,env,acl);
 if(url.pathname.endsWith('/action'))return action(request,env,acl);
 return json({error:'Service inconnu.'},404);
}

/* ---------------- Patient ---------------- */
const patientLog=(env,stay,action,result,reason,at)=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,'patient-lien',?,?,?,?)").bind(at,action,docKey(stay),result,reason).run();
const clientIp=request=>String(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'').split(',')[0].trim().slice(0,64);

// Lien valide puis date de naissance : 5 erreurs ferment le lien.
async function authenticate(env,token,birthDate,{checkBirth=true}={}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return {response:json({error:'Lien invalide.'},410)};
 const hash=await sha(token),at=new Date().toISOString();
 const row=await env.DB.prepare('SELECT * FROM patient_space_links WHERE token_hash=? AND revoked=0 AND expires_at>? AND failed_attempts<?').bind(hash,at,MAX_ECHECS).first();
 if(!row)return {response:json({error:'Lien expiré ou remplacé par un lien plus récent. Contactez la clinique si besoin.'},410)};
 if(!checkBirth)return {row,hash,at};
 if(!R.isDate(birthDate)||birthDate!==row.birth_date){
  await env.DB.prepare('UPDATE patient_space_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
  const left=MAX_ECHECS-Number(row.failed_attempts)-1;
  await patientLog(env,row.stay_id,'espace-patient-acces','denied',left>0?'Date de naissance erronée':'Lien fermé après '+MAX_ECHECS+' erreurs',at);
  return {response:json({error:left>0?'Date de naissance incorrecte. Encore '+left+' essai'+(left>1?'s':'')+'.':'Trop d’essais : ce lien est désactivé. Contactez la clinique.'},left>0?400:410)};
 }
 return {row,hash,at};
}
// Dépôt de documents ouvert jusqu'au lendemain de l'intervention inclus, heure de Paris (ou tant que le lien est valide sans date).
async function depotOuvert(env,stay){const consult=await docData(env,'stay/'+stay+'/consult');return R.depotOuvert(consult?.ext?.surgeryDate)}

async function patientView(env,row,space,etablissement){
 const c=space.consentement,st=R.statut(c),showConsent=!!c?.envoi&&st.code!=='annule';
 return {etablissement,purpose:row.purpose,expiresAt:row.expires_at,
  depot:{ouvert:await depotOuvert(env,row.stay_id),limites:R.LIMITES,documents:space.documents.filter(x=>x.source==='patient').map(x=>({nom:x.nom,categorie:x.categorie,taille:x.taille,recuLe:x.recuLe}))},
  consentement:showConsent?{fiche:c.envoi.fiche,statut:st.code,recu:c.recu?{mode:c.recu.mode,at:c.recu.at,reponses:c.recu.reponses||null,reserves:c.recu.reserves||'',lieu:c.recu.lieu||'',signataire:c.recu.signataire||'',signature:c.recu.signature||'',signeLe:c.recu.signeLe||c.recu.at,empreinte:c.recu.empreinte||'',nom:c.recu.fichier?.nom||''}:null,
   refus:c.verification&&c.verification.conforme===false&&!c.recu?{note:c.verification.note,at:c.verification.at}:null}:null};
}

export async function patientEspacePatientApi(request,env,messagingEstablishment=''){
 try{
  const url=new URL(request.url),route=url.pathname.replace('/api/espace-patient/','');
  if(request.method!=='POST'||!['open','view','consentement','upload'].includes(route))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const etab=messagingEstablishment||'la clinique';
  if(route==='upload')return upload(request,env,url,etab);
  const d=await body(request,route==='consentement'?220000:20000);
  const auth=await authenticate(env,d.token,d.birthDate,{checkBirth:route!=='open'});if(auth.response)return auth.response;
  const {row,hash,at}=auth,stay=row.stay_id;
  if(route==='open')return json({available:true,etablissement:etab,purpose:row.purpose});
  if(route==='view'){
   await env.DB.prepare('UPDATE patient_space_links SET view_count=view_count+1,last_viewed_at=?,first_viewed_at=COALESCE(first_viewed_at,?) WHERE token_hash=?').bind(at,at,hash).run();
   await patientLog(env,stay,'espace-patient-acces','allowed','Espace patient ouvert ('+row.purpose+')',at);
   let space=(await docData(env,docKey(stay)))||empty();space.documents=Array.isArray(space.documents)?space.documents:[];
   if(space.consentement?.envoi&&!space.consentement.ouvertLe&&row.purpose==='consentement'){const r=await updateSpace(env,stay,'patient-lien','Consentement ouvert par le patient',x=>{if(x.consentement&&!x.consentement.ouvertLe)x.consentement.ouvertLe=at});if(r.data)space=r.data}
   return json(await patientView(env,row,space,etab));
  }
  // Signature électronique simple du consentement.
  const v=R.validerReponse(d);if(!v.ok)return json({error:v.errors.join(' '),manquantes:v.manquantes},400);
  let fingerprint='';
  const r=await updateSpace(env,stay,'patient-lien','Consentement signé en ligne par le patient',async data=>{
   const c=data.consentement,st=R.statut(c);
   if(!c?.envoi||st.code==='annule')return {error:'Aucun consentement à signer pour ce lien.',status:409};
   if(st.recu||c.recu)return {error:'Votre consentement a déjà été reçu. Pour le modifier ou le retirer, contactez la clinique.',status:409};
   const reponse={...v.reponse,signeLe:at};fingerprint=await sha(R.canonique(c.envoi.fiche,reponse));
   c.recu={mode:'signature',at,...reponse,empreinte:fingerprint};c.verification=null;
  });
  if(r.error)return json({error:r.error},r.status||409);
  await env.DB.prepare('INSERT INTO consent_evidence(stay_id,at,mode,fingerprint,link_hash,ip,user_agent) VALUES(?,?,?,?,?,?,?)').bind(stay,at,'signature',fingerprint,hash,clientIp(request),String(request.headers.get('user-agent')||'').slice(0,300)).run();
  const non=R.nonCoches(r.data.consentement.recu).length;
  await patientLog(env,stay,'consentement-signature','allowed','Consentement signé en ligne'+(non?' · '+non+' réponse(s) « Non »':'')+' · empreinte '+fingerprint.slice(0,16),at);
  return json(await patientView(env,row,r.data,etab));
 }catch(e){return json({error:e.message==='size'?'Envoi trop volumineux.':'Service indisponible.'},e.message==='size'?413:503)}
}

async function upload(request,env,url,etab){
 if(!env.BUCKET)return json({error:'Dépôt de fichiers indisponible pour le moment.'},503);
 const dec=v=>{try{return decodeURIComponent(v||'')}catch{return ''}};
 const auth=await authenticate(env,request.headers.get('x-acces'),request.headers.get('x-naissance'));if(auth.response)return auth.response;
 const {row,hash:linkHash,at}=auth,stay=row.stay_id,kind=url.searchParams.get('kind')==='consentement'?'consentement':'document';
 const declared=Number(request.headers.get('content-length')||0);if(declared>R.LIMITES.fichier+1024)return json({error:'Fichier trop lourd : 10 Mo au maximum.'},413);
 const bytes=new Uint8Array(await request.arrayBuffer());
 const categorie=kind==='consentement'?'autre':String(url.searchParams.get('categorie')||'');
 const space=(await docData(env,docKey(stay)))||empty();
 if(kind==='document'&&!await depotOuvert(env,stay))return json({error:'Le dépôt en ligne est fermé depuis le lendemain de votre intervention. Pour transmettre un document, contactez la clinique.'},409);
 if(kind==='consentement'){const c=space.consentement,st=R.statut(c);if(!c?.envoi||st.code==='annule')return json({error:'Aucun consentement à déposer pour ce lien.'},409);if(st.recu||c.recu)return json({error:'Votre consentement a déjà été reçu.'},409)}
 const check=R.controleFichier(bytes,{deja:(space.documents||[]).filter(x=>x.source==='patient'),categorie});
 if(check.error){await patientLog(env,stay,'document-patient-depot','denied',check.error.slice(0,120),at);return json({error:check.error},400)}
 const fileHash=await sha(bytes),nom=R.nomFichier(dec(request.headers.get('x-nom')),check.type),commentaire=dec(request.headers.get('x-commentaire')).replace(/[\u0000-\u001f]/g,' ').trim().slice(0,R.LIMITES.commentaire);
 // Stockage sur l'hébergeur (Cellar) : nom = empreinte ; portée du fichier = rubrique du séjour (lecture par l'équipe soignante).
 await env.BUCKET.put(fileHash,bytes,{httpMetadata:{contentType:check.type},customMetadata:{name:nom}});
 await env.DB.prepare('INSERT OR IGNORE INTO file_scopes(hash,document_key) VALUES(?,?)').bind(fileHash,docKey(stay)).run();
 const fichier={hash:fileHash,nom,type:check.type,taille:bytes.byteLength};
 const r=await updateSpace(env,stay,'patient-lien',kind==='consentement'?'Consentement signé déposé par le patient':'Document déposé par le patient',data=>{
  if(kind==='consentement'){const c=data.consentement;if(!c?.envoi||c.recu)return {error:'Votre consentement a déjà été reçu.',status:409};c.recu={mode:'depot',at,fichier};c.verification=null;return}
  if(data.documents.some(x=>x.hash===fileHash&&x.source==='patient'))return {error:'Ce fichier a déjà été transmis.',status:409};
  data.documents.push({id:crypto.randomUUID(),...fichier,categorie,commentaire,recuLe:at,source:'patient',vu:null,ecarte:null});
 });
 if(r.error)return json({error:r.error},r.status||409);
 if(kind==='consentement')await env.DB.prepare('INSERT INTO consent_evidence(stay_id,at,mode,fingerprint,link_hash,ip,user_agent) VALUES(?,?,?,?,?,?,?)').bind(stay,at,'depot',fileHash,linkHash,clientIp(request),String(request.headers.get('user-agent')||'').slice(0,300)).run();
 await patientLog(env,stay,kind==='consentement'?'consentement-depot':'document-patient-depot','allowed',(kind==='consentement'?'Consentement signé déposé':'Document déposé · '+R.CATEGORIE[categorie])+' · '+R.taille(bytes.byteLength),at);
 return json(await patientView(env,row,r.data,etab),201);
}

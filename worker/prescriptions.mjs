// IASELO · prescriptions préopératoires envoyées au patient (consultation d'anesthésie).
//  Professionnels (session requise) :
//   POST /api/workspace/prescriptions/send    envoie par SMS et/ou e-mail un lien vers l'espace patient
//   GET  /api/workspace/prescriptions/status  liens envoyés pour un séjour (date, validité, consultation)
//   POST /api/workspace/prescriptions/revoke  désactive les liens encore valides d'un séjour
//  Patient (lien reçu, sans compte) :
//   POST /api/prescriptions/open   indique si le lien est valide (aucune donnée)
//   POST /api/prescriptions/view   date de naissance vérifiée ⇒ prescriptions signées
//
// RGPD : le SMS et l'e-mail ne contiennent ni nom, ni motif, ni date, ni prescription : seulement
// l'établissement et un lien personnel. Le contenu figé au moment de l'envoi (version signée) est conservé
// côté serveur ; le lien est stocké haché, il expire 7 jours après l'intervention (30 jours au plus)
// et se ferme après 5 dates de naissance erronées. Chaque envoi et chaque consultation sont tracés.
import R from '../dist/prescriptions-preop-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const mask={email:v=>{const [u,d]=String(v).split('@');return d?u.slice(0,1)+'***@'+d:'***'},sms:v=>{v=String(v);return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'}};
const MAX_ECHECS=5;
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}

// Contenu volontairement minimal : pas de donnée de santé dans le canal SMS / e-mail.
export function prescriptionMessages(establishment,link){
 const etab=establishment||'Clinique du Trocadéro';
 return {
  sms:etab+' : vos documents pour préparer votre intervention sont disponibles : '+link+' (votre date de naissance vous sera demandée).',
  subject:'Vos documents pour préparer votre intervention · '+etab,
  text:'Bonjour,\n\nÀ la suite de votre consultation d’anesthésie, '+etab+' met à votre disposition vos ordonnances et consignes de préparation :\n'+link+'\n\nVotre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas.\nNe répondez pas à ce message et n’y indiquez aucune information médicale.\nSi ce message ne vous concerne pas, ignorez-le.\n\n'+etab,
  html:'<p>Bonjour,</p><p>À la suite de votre consultation d’anesthésie, '+escapeHtml(etab)+' met à votre disposition vos ordonnances et consignes de préparation.</p><p><a href="'+escapeHtml(link)+'">Voir mes documents</a></p><p>Votre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas.</p><p>Ne répondez pas à ce message et n’y indiquez aucune information médicale. Si ce message ne vous concerne pas, ignorez-le.</p><p>'+escapeHtml(etab)+'</p>'
 };
}

// Version signée lue sur le serveur : la signature doit couvrir exactement le contenu enregistré.
async function signedVersion(env,stay){
 const saved=await docData(env,'stay/'+stay+'/prescriptionsPreop');
 if(!saved?.signed||!saved.draft)return {error:'Signez les prescriptions avant de les envoyer.',status:409};
 const contenu=R.normaliser(saved.draft);
 if(await sha(R.canonique(contenu))!==saved.signed.hash)return {error:'Les prescriptions ont été modifiées après la signature : signez la nouvelle version.',status:409};
 const signer=await env.DB.prepare('SELECT display_name,rpps,profession,active FROM professional_profiles WHERE user_id=?').bind(String(saved.signed.userId||'')).first();
 if(!signer||!signer.active||!['anesthesiste','chirurgien'].includes(signer.profession))return {error:'Signature d’un médecin du séjour introuvable.',status:409};
 return {contenu,signed:saved.signed,signer};
}

async function send(request,env,acl,url){
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const d=await body(request),stay=String(d.stay||''),key='stay/'+stay+'/prescriptionsPreop';
 if(!acl.canRead(key)||!acl.canRead('stay/'+stay+'/invitationContact')||!['anesthesiste','chirurgien'].includes(acl.job))return json({error:'Envoi réservé aux médecins du séjour.'},403);
 const channels=Array.isArray(d.channels)?[...new Set(d.channels)]:[];
 if(!channels.length||channels.some(c=>!['sms','email'].includes(c)))return json({error:'Choisissez SMS et/ou e-mail.'},400);
 const messaging=env.MESSAGING;if(!messaging)return json({error:'Envoi Brevo non configuré sur ce serveur.'},503);
 const v=await signedVersion(env,stay);if(v.error)return json({error:v.error},v.status);
 // Destinataire : coordonnées vérifiées du séjour, jamais une adresse transmise par la requête.
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact;
 if(!contact)return json({error:'Coordonnées vérifiées introuvables : enregistrez-les dans « Questionnaire patient ».'},409);
 const core=await docData(env,'stay/'+stay+'/core'),consult=await docData(env,'stay/'+stay+'/consult');
 const id=core?.identity||{},surgeryDate=R.isDate(consult?.ext?.surgeryDate)?consult.ext.surgeryDate:'';
 const snapshot={contenu:v.contenu,version:v.contenu.version,signeLe:v.signed.at,etablissement:messaging.establishment,intervention:surgeryDate,
  patient:{nom:id.lastName||contact.lastName||'',prenom:id.firstName||contact.firstName||'',naissance:id.birthDate||contact.birthDate||''},
  prescripteur:{nom:v.signer.display_name,rpps:v.signer.rpps||'',specialite:v.signer.profession==='chirurgien'?'Chirurgie':'Anesthésie-réanimation'}};
 if(!R.isDate(snapshot.patient.naissance))return json({error:'Date de naissance du patient manquante : elle sert à protéger l’accès.'},409);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await sha(token),at=new Date().toISOString(),expiresAt=R.expiration(surgeryDate);
 // Un seul lien actif par séjour : l'envoi d'une nouvelle version ferme les précédents.
 await env.DB.batch([
  env.DB.prepare('UPDATE prescription_links SET revoked=1 WHERE stay_id=? AND revoked=0').bind(stay),
  env.DB.prepare('INSERT INTO prescription_links(token_hash,stay_id,snapshot,version,birth_date,created_by,created_at,expires_at,channels) VALUES(?,?,?,?,?,?,?,?,?)').bind(hash,stay,JSON.stringify(snapshot),snapshot.version,snapshot.patient.naissance,acl.profile.user_id,at,expiresAt,channels.join(','))
 ]);
 const link=url.origin+'/ordonnance.html#acces='+token,text=prescriptionMessages(messaging.establishment,link),results=[];
 for(const channel of channels){
  const to=channel==='sms'?contact.phone:contact.email,label=channel==='sms'?'SMS':'E-mail';
  if(!to){results.push({channel,sent:false,error:label+' : aucune coordonnée vérifiée.'});continue}
  try{
   const ref=channel==='sms'?await messaging.sms({to,content:text.sms,tag:'iaselo-prescriptions'}):await messaging.email({to,subject:text.subject,text:text.text,html:text.html,tag:'iaselo-prescriptions'});
   await acl.log('prescriptions-envoi',key,'allowed',label+' envoyé via Brevo · version '+snapshot.version,'Destinataire '+mask[channel](to)+(ref?' · réf. Brevo '+ref:''));
   results.push({channel,sent:true,to:mask[channel](to),at:new Date().toISOString()});
  }catch(e){
   const error=String(e.message||'Envoi impossible.').slice(0,200);
   await acl.log('prescriptions-envoi',key,'denied',label+' non envoyé','Destinataire '+mask[channel](to)+' · '+error);
   results.push({channel,sent:false,error:label+' : '+error});
  }
 }
 if(!results.some(r=>r.sent)){await env.DB.prepare('UPDATE prescription_links SET revoked=1 WHERE token_hash=?').bind(hash).run();return json({results},502)}
 return json({results,version:snapshot.version,expiresAt},200);
}

async function status(request,env,acl,url){
 const stay=String(url.searchParams.get('stay')||''),key='stay/'+stay+'/prescriptionsPreop';
 if(!acl.canRead(key))return json({error:'Accès refusé.'},403);
 const rows=(await env.DB.prepare('SELECT version,created_at,expires_at,revoked,channels,first_viewed_at,last_viewed_at,view_count,failed_attempts FROM prescription_links WHERE stay_id=? ORDER BY created_at DESC').bind(stay).all()).results||[];
 const now=new Date().toISOString();
 return json({links:rows.slice(0,20).map(r=>({version:Number(r.version),sentAt:r.created_at,expiresAt:r.expires_at,active:!Number(r.revoked)&&r.expires_at>now,channels:String(r.channels||'').split(',').filter(Boolean),firstViewedAt:r.first_viewed_at||null,lastViewedAt:r.last_viewed_at||null,views:Number(r.view_count||0),locked:Number(r.failed_attempts||0)>=MAX_ECHECS}))});
}

async function revoke(request,env,acl){
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const d=await body(request),stay=String(d.stay||''),key='stay/'+stay+'/prescriptionsPreop';
 if(!acl.canRead(key)||!['anesthesiste','chirurgien'].includes(acl.job))return json({error:'Action réservée aux médecins du séjour.'},403);
 await env.DB.prepare('UPDATE prescription_links SET revoked=1 WHERE stay_id=? AND revoked=0').bind(stay).run();
 await acl.log('prescriptions-lien-ferme',key,'allowed','Lien patient désactivé');
 return json({revoked:true});
}

export async function staffPrescriptionsApi(request,env,acl){
 const url=new URL(request.url);
 if(url.pathname==='/api/workspace/prescriptions/send')return send(request,env,acl,url);
 if(url.pathname==='/api/workspace/prescriptions/status')return status(request,env,acl,url);
 if(url.pathname==='/api/workspace/prescriptions/revoke')return revoke(request,env,acl);
 return null;
}

const patientLog=(env,stay,result,reason,at)=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,'patient-lien','prescriptions-consultation',?,?,?)").bind(at,'stay/'+stay+'/prescriptionsPreop',result,reason).run();
export async function patientPrescriptionsApi(request,env){
 try{
  const url=new URL(request.url);
  if(request.method!=='POST'||!['/api/prescriptions/open','/api/prescriptions/view'].includes(url.pathname))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const d=await body(request);if(typeof d.token!=='string'||!/^[a-f0-9]{64}$/.test(d.token))return json({error:'Lien invalide.'},410);
  const hash=await sha(d.token),at=new Date().toISOString();
  const row=await env.DB.prepare('SELECT * FROM prescription_links WHERE token_hash=? AND revoked=0 AND expires_at>? AND failed_attempts<?').bind(hash,at,MAX_ECHECS).first();
  if(!row)return json({error:'Lien expiré ou remplacé par une version plus récente. Contactez la clinique si besoin.'},410);
  const etablissement=JSON.parse(row.snapshot).etablissement||'';
  if(url.pathname.endsWith('/open'))return json({available:true,etablissement});
  if(!R.isDate(d.birthDate)||d.birthDate!==row.birth_date){
   await env.DB.prepare('UPDATE prescription_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
   const left=MAX_ECHECS-Number(row.failed_attempts)-1;
   await patientLog(env,row.stay_id,'denied',left>0?'Date de naissance erronée':'Lien fermé après '+MAX_ECHECS+' erreurs',at);
   return json({error:left>0?'Date de naissance incorrecte. Encore '+left+' essai'+(left>1?'s':'')+'.':'Trop d’essais : ce lien est désactivé. Contactez la clinique.'},left>0?400:410);
  }
  await env.DB.prepare('UPDATE prescription_links SET view_count=view_count+1,last_viewed_at=?,first_viewed_at=COALESCE(first_viewed_at,?) WHERE token_hash=?').bind(at,at,hash).run();
  await patientLog(env,row.stay_id,'allowed','Prescriptions consultées par le patient · version '+row.version,at);
  return json({prescription:JSON.parse(row.snapshot),expiresAt:row.expires_at});
 }catch{return json({error:'Service indisponible.'},503)}
}

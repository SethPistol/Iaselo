// IASELO · préadmission en ligne (26/11/2026, demande de Romain).
//  Déclenchement : à l'envoi du questionnaire d'anesthésie, un lien personnel vers la préadmission est créé,
//  affiché au patient et envoyé par SMS et e-mail (coordonnées vérifiées du séjour). Rappels J-7, J-3, J-1 :
//  worker/rappels-auto.mjs, tant que la préadmission n'est pas faite.
//  Patient (lien reçu, sans compte ; date de naissance vérifiée à chaque appel) :
//   POST /api/preadmission/open | view | etape | formulaire | autorisation | upload
//  Professionnels (admissions = secrétariat ; anesthésiste et chirurgien en lecture et relance) :
//   GET  /api/workspace/preadmission/liste            préadmissions des séjours du périmètre
//   GET  /api/workspace/preadmission/dossier?stay=…   compte rendu complet (pièces, étapes, liens)
//   POST /api/workspace/preadmission/send             envoyer ou renvoyer le lien
//   POST /api/workspace/preadmission/action           pièce conforme / non conforme, à compléter, vérifiée, type
//
// RGPD / HDS : pièces sur le stockage objet de l'hébergeur (Cellar, HDS), portée = rubrique du séjour ;
// SMS et e-mail sans nom ni donnée de santé ; lien stocké haché ; chaque accès et chaque action sont tracés.
import R from '../dist/preadmission-regles.js';
import E from '../dist/espace-patient-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(request,max=60000){const bytes=await request.arrayBuffer();if(bytes.byteLength>max)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof data==='string'?new TextEncoder().encode(data):data)),b=>b.toString(16).padStart(2,'0')).join('');
const mask={email:v=>{const [u,d]=String(v).split('@');return d?u.slice(0,1)+'***@'+d:'***'},sms:v=>{v=String(v);return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'}};
const MAX_ECHECS=5,MODULE='preadmissionPatient',ACTEUR='iaselo-automatique';
export const docKey=stay=>'stay/'+stay+'/'+MODULE;
const validStay=s=>typeof s==='string'&&/^[^/]{1,80}$/.test(s);
const JOBS=['secretariat','anesthesiste','chirurgien'];
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const vide=()=>({etapes:{},pieces:[],envois:[],rappels:[]});

// Écriture serveur de la rubrique : révision suivante, versions conservées, sans écrasement concurrent.
export async function updatePre(env,stay,actor,reason,mutate){
 const key=docKey(stay);
 for(let attempt=0;attempt<4;attempt++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();
  const data={...vide(),...(row?JSON.parse(row.data):{})};
  const outcome=await mutate(data);if(outcome?.error)return outcome;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,key,row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(key,payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...outcome};
 }
 return {error:'Enregistrement concurrent : réessayez.',status:409};
}

// Tout ce qu'il faut savoir d'un séjour pour sa préadmission.
export async function contexte(env,stay){
 const [core,consult,surgicalAnnouncement,inv,pre]=await Promise.all(['core','consult','surgicalAnnouncement','invitationContact',MODULE].map(m=>docData(env,'stay/'+stay+'/'+m)));
 const contact=inv?.contact||null,id=core?.identity||{},ann=surgicalAnnouncement?.published?.fields||{};
 const data={...vide(),...(pre||{})},type=R.typeSejour({core:core||{},consult,surgicalAnnouncement,preadmissionPatient:pre});
 const patient={nom:id.birthName||id.lastName||contact?.lastName||'',prenom:id.firstName||contact?.firstName||'',naissance:id.birthDate||contact?.birthDate||''};
 const datePrevue=E.datePrevueSejour({consult,surgicalAnnouncement});
 const intervention=[ann.procedure||consult?.ext?.operation,ann.laterality&&ann.laterality!=='Non applicable'?String(ann.laterality).toLowerCase():''].filter(Boolean).join(' · ');
 return {core,data,exists:!!pre,type,patient,contact,datePrevue,intervention,etat:R.etat(data,type,{naissance:patient.naissance})};
}

/* ---------------- Lien et envoi ---------------- */
async function creerLien(env,{stay,birthDate,by,motif,datePrevue,channels=[]}){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),at=new Date().toISOString();
 await env.DB.prepare('INSERT INTO preadmission_links(token_hash,stay_id,birth_date,created_by,created_at,expires_at,motif,channels) VALUES(?,?,?,?,?,?,?,?)').bind(await sha(token),stay,birthDate,by,at,E.expiration(datePrevue),motif,channels.join(',')).run();
 return token;
}
// Crée un lien et l'envoie (SMS et/ou e-mail) aux coordonnées vérifiées. acl : professionnel ou acteur automatique.
export async function envoyerLien(env,acl,origin,{stay,channels:asked,motif='manuel',rappel=false}){
 const out=(body,status=200)=>({body,status});
 const ctx=await contexte(env,stay),contact=ctx.contact,messaging=env.MESSAGING;
 if(!contact)return out({error:'Coordonnées vérifiées introuvables : enregistrez-les dans « Questionnaire patient ».'},409);
 if(!R.isDate(contact.birthDate))return out({error:'Date de naissance du patient manquante : elle protège l’accès au lien.'},409);
 if(!messaging)return out({error:'Envoi SMS et e-mail non configuré sur ce serveur (Brevo).'},503);
 const possibles=['sms','email'].filter(c=>(c==='sms'?contact.phone:contact.email)&&messaging.channels?.[c]!==false);
 const channels=Array.isArray(asked)&&asked.length?[...new Set(asked)].filter(c=>possibles.includes(c)):possibles;
 if(!channels.length)return out({error:'Ni téléphone portable ni e-mail vérifié utilisable pour ce patient.'},409);
 const token=await creerLien(env,{stay,birthDate:contact.birthDate,by:acl.profile.user_id,motif,datePrevue:ctx.datePrevue,channels});
 const link=origin+'/preadmission.html#acces='+token,text=R.messages(messaging.establishment,link,{rappel}),results=[];
 const action=rappel?'preadmission-rappel':'preadmission-envoi';
 for(const channel of channels){
  const to=channel==='sms'?contact.phone:contact.email,label=channel==='sms'?'SMS':'E-mail';
  try{
   const ref=channel==='sms'?await messaging.sms({to,content:text.sms,tag:'iaselo-preadmission'}):await messaging.email({to,subject:text.subject,text:text.text,html:text.html,tag:'iaselo-preadmission'});
   await acl.log(action,docKey(stay),'allowed',label+' envoyé via Brevo ('+motif+')','Destinataire '+mask[channel](to)+(ref?' · réf. Brevo '+ref:''));
   results.push({channel,sent:true,to:mask[channel](to),at:new Date().toISOString()});
  }catch(e){
   const error=String(e.message||'Envoi impossible.').slice(0,200);
   await acl.log(action,docKey(stay),'denied',label+' non envoyé ('+motif+')','Destinataire '+mask[channel](to)+' · '+error);
   results.push({channel,sent:false,error:label+' : '+error});
  }
 }
 const sent=results.filter(r=>r.sent),at=new Date().toISOString(),who=acl.profile.display_name||'Professionnel';
 if(!sent.length){await env.DB.prepare('UPDATE preadmission_links SET revoked=1 WHERE token_hash=?').bind(await sha(token)).run();return out({results},502)}
 const saved=await updatePre(env,stay,acl.profile.user_id,rappel?'Rappel de préadmission envoyé':'Lien de préadmission envoyé',d=>{
  if(!d.type)d.type=ctx.type;
  d.envois=[...(d.envois||[]),{at,by:who,motif,channels:sent.map(r=>r.channel),...(rappel?{rappel:true}:{})}].slice(-30);
 });
 if(saved.error)return out({error:saved.error},saved.status||409);
 return out({results,token,type:ctx.type},200);
}

const systeme=env=>({job:'anesthesiste',profile:{user_id:ACTEUR,display_name:'Envoi automatique IASELO'},
 log:(action,target,result='allowed',reason='',detail='')=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),ACTEUR,action,target,result,reason,detail).run()});

// Fin du questionnaire d'anesthésie : lien de préadmission (affiché au patient + SMS/e-mail).
// Rien si la préadmission est déjà faite. Sans messagerie, le lien est seulement affiché.
export async function apresQuestionnaire(env,stay,origin){
 try{
  const ctx=await contexte(env,stay);
  if(['faite','verifiee'].includes(ctx.etat.code))return {deja:true,type:ctx.type};
  const acl=systeme(env);
  if(env.MESSAGING&&ctx.contact){
   const r=await envoyerLien(env,acl,origin,{stay,motif:'questionnaire'});
   if(r.status===200)return {lien:origin+'/preadmission.html#acces='+r.body.token,type:r.body.type,envoye:r.body.results.filter(x=>x.sent).map(x=>x.channel)};
  }
  const birth=ctx.contact?.birthDate||ctx.patient.naissance;if(!R.isDate(birth))return null;
  const token=await creerLien(env,{stay,birthDate:birth,by:ACTEUR,motif:'questionnaire',datePrevue:ctx.datePrevue});
  await updatePre(env,stay,ACTEUR,'Lien de préadmission remis à la fin du questionnaire',d=>{if(!d.type)d.type=ctx.type;d.envois=[...(d.envois||[]),{at:new Date().toISOString(),by:'Fin du questionnaire',motif:'questionnaire',channels:['page']}].slice(-30)});
  await acl.log('preadmission-envoi',docKey(stay),'allowed','Lien de préadmission affiché à la fin du questionnaire','Aucun SMS ni e-mail envoyé');
  return {lien:origin+'/preadmission.html#acces='+token,type:ctx.type,envoye:[]};
 }catch(e){console.error('preadmission_questionnaire',e?.message||e);return null}
}

/* ---------------- Patient ---------------- */
const patientLog=(env,stay,action,result,reason,at)=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,'patient-lien',?,?,?,?)").bind(at,action,docKey(stay),result,reason).run();
const clientIp=request=>String(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'').split(',')[0].trim().slice(0,64);
async function authenticate(env,token,birthDate,{checkBirth=true}={}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return {response:json({error:'Lien invalide.'},410)};
 const hash=await sha(token),at=new Date().toISOString();
 const row=await env.DB.prepare('SELECT * FROM preadmission_links WHERE token_hash=? AND revoked=0 AND expires_at>? AND failed_attempts<?').bind(hash,at,MAX_ECHECS).first();
 if(!row)return {response:json({error:'Lien expiré ou désactivé. Contactez la clinique pour en recevoir un nouveau.'},410)};
 if(!checkBirth)return {row,hash,at};
 if(!R.isDate(birthDate)||birthDate!==row.birth_date){
  await env.DB.prepare('UPDATE preadmission_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
  const left=MAX_ECHECS-Number(row.failed_attempts)-1;
  await patientLog(env,row.stay_id,'preadmission-acces','denied',left>0?'Date de naissance erronée':'Lien fermé après '+MAX_ECHECS+' erreurs',at);
  return {response:json({error:left>0?'Date de naissance incorrecte. Encore '+left+' essai'+(left>1?'s':'')+'.':'Trop d’essais : ce lien est désactivé. Contactez la clinique.'},left>0?400:410)};
 }
 return {row,hash,at};
}
async function vuePatient(env,stay,etab,telephone=''){
 const ctx=await contexte(env,stay),d=ctx.data;
 return {etablissement:etab,telephone,type:ctx.type,typeLibelle:R.TYPES[ctx.type],datePrevue:ctx.datePrevue,intervention:ctx.intervention,
  patient:ctx.patient,contact:{telephone:ctx.contact?.phone||'',email:ctx.contact?.email||''},
  texteAutorisation:R.texteAutorisation(ctx.type,{etablissement:etab,intervention:ctx.intervention,patient:[ctx.patient.prenom,String(ctx.patient.nom).toUpperCase()].join(' ').trim()}),
  data:{etapes:d.etapes||{},formulaire:d.formulaire||null,rdv:d.rdv||null,devis:d.devis||null,directives:d.directives||null,
   autorisation:d.autorisation?.at?{at:d.autorisation.at,signataire:d.autorisation.signataire,qualite:d.autorisation.qualite}:null,
   pieces:(d.pieces||[]).filter(p=>!p.remplace).map(p=>({id:p.id,piece:p.piece,nom:p.nom,taille:p.taille,recuLe:p.recuLe,controle:p.controle?{conforme:p.controle.conforme,motif:p.controle.motif||''}:null})),
   aCompleter:d.aCompleter&&!d.aCompleter.leve?{motif:d.aCompleter.motif,at:d.aCompleter.at,reponduLe:d.aCompleter.reponduLe||null}:null,verifiee:!!d.verification?.at},
  etat:ctx.etat,limites:E.LIMITES};
}
// Le patient a agi après une demande de complément : l'équipe le voit.
const repondu=(d,at)=>{if(d.aCompleter&&!d.aCompleter.leve&&!d.aCompleter.reponduLe)d.aCompleter.reponduLe=at};

export async function patientPreadmissionApi(request,env){
 try{
  const url=new URL(request.url),route=url.pathname.replace('/api/preadmission/','');
  if(request.method!=='POST'||!['open','view','etape','formulaire','autorisation','upload'].includes(route))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const etab=env.ESTABLISHMENT||'la clinique',tel=env.TELEPHONE_ADMISSIONS||'';
  if(route==='upload')return upload(request,env,url,etab,tel);
  const d=await body(request);
  const auth=await authenticate(env,d.token,d.birthDate,{checkBirth:route!=='open'});if(auth.response)return auth.response;
  const {row,hash,at}=auth,stay=row.stay_id;
  if(route==='open')return json({available:true,etablissement:etab});
  if(route==='view'){
   await env.DB.prepare('UPDATE preadmission_links SET view_count=view_count+1,last_viewed_at=?,first_viewed_at=COALESCE(first_viewed_at,?) WHERE token_hash=?').bind(at,at,hash).run();
   await patientLog(env,stay,'preadmission-acces','allowed','Préadmission ouverte par le patient',at);
   const ctx=await contexte(env,stay);if(!ctx.data.ouvertLe)await updatePre(env,stay,'patient-lien','Préadmission ouverte par le patient',x=>{if(!x.ouvertLe)x.ouvertLe=at;if(!x.type)x.type=ctx.type});
   return json(await vuePatient(env,stay,etab,tel));
  }
  const ctx=await contexte(env,stay);
  if(route==='etape'){
   const e=R.ETAPE[d.id],v=d.valeur||{};
   if(!e||['formulaire','autorisation'].includes(e.genre)||!R.etapes(ctx.type).some(x=>x.id===d.id))return json({error:'Étape inconnue.'},400);
   const actives=R.piecesActives(ctx.data.pieces);let reason='';
   const r=await updatePre(env,stay,'patient-lien','Préadmission : étape « '+e.id+' »',x=>{
    x.etapes=x.etapes||{};
    if(e.genre==='info'){x.etapes[e.id]={at};reason='Information lue';return}
    if(e.genre==='rdv'){
     if(!['rdv','faite','pas-encore'].includes(v.choix))return {error:'Choisissez une réponse.',status:400};
     if(v.choix==='rdv'&&!R.isDate(v.date))return {error:'Indiquez la date de votre rendez-vous.',status:400};
     x.rdv={choix:v.choix,date:v.choix==='rdv'?v.date:'',at};if(v.choix==='pas-encore')delete x.etapes.rdv;else x.etapes.rdv={at};reason='Rendez-vous d’anesthésie : '+v.choix;return;
    }
    if(e.genre==='devis'){
     if(!['depose','aucun'].includes(v.choix))return {error:'Choisissez une réponse.',status:400};
     if(v.choix==='depose'&&!actives.some(p=>p.piece==='devis'))return {error:'Déposez d’abord votre devis signé.',status:400};
     x.devis={choix:v.choix,at};x.etapes.devis={at};reason='Devis : '+v.choix;return;
    }
    if(e.genre==='directives'){
     if(!['deposees','apporterai','aucune'].includes(v.choix))return {error:'Choisissez une réponse.',status:400};
     if(v.choix==='deposees'&&!actives.some(p=>p.piece==='directives'))return {error:'Déposez d’abord vos directives anticipées.',status:400};
     x.directives={choix:v.choix,at};x.etapes.directives={at};reason='Directives anticipées : '+v.choix;return;
    }
   });
   if(r.error)return json({error:r.error},r.status||409);
   await patientLog(env,stay,'preadmission-etape','allowed',e.id+' · '+reason,at);
   return json(await vuePatient(env,stay,etab,tel));
  }
  if(route==='formulaire'){
   const soumettre=d.soumettre===true,v=R.validerFormulaire(d.formulaire,{type:ctx.type});
   if(soumettre&&!v.ok)return json({error:v.errors.join(' '),manquants:v.manquants},400);
   const r=await updatePre(env,stay,'patient-lien',soumettre?'Formulaire de préadmission envoyé':'Formulaire de préadmission enregistré',x=>{
    const ancien=x.formulaire||{};
    x.formulaire={...v.formulaire,brouillonLe:at,soumisLe:soumettre?(ancien.soumisLe||at):(ancien.soumisLe||null),...(soumettre&&ancien.soumisLe?{modifieLe:at}:{})};
    if(soumettre){if(x.verification?.at){x.verificationPrecedente=x.verification;x.verification=null}repondu(x,at)}
   });
   if(r.error)return json({error:r.error},r.status||409);
   await patientLog(env,stay,'preadmission-formulaire','allowed',soumettre?'Formulaire envoyé'+(v.alertes.length?' · retour sans accompagnant':''):'Brouillon enregistré',at);
   return json({...await vuePatient(env,stay,etab,tel),alertes:v.alertes});
  }
  // Autorisation d'opérer : signature électronique simple, texte figé et empreinte conservée.
  const v=R.validerAutorisation(d,{naissance:ctx.patient.naissance});if(!v.ok)return json({error:v.errors.join(' ')},400);
  if(ctx.data.autorisation?.at)return json({error:'Votre autorisation a déjà été reçue. Pour la retirer, contactez la clinique.'},409);
  const texte=R.texteAutorisation(ctx.type,{etablissement:etab,intervention:ctx.intervention,patient:[ctx.patient.prenom,String(ctx.patient.nom).toUpperCase()].join(' ').trim()});
  const empreinte=await sha(JSON.stringify({stay,type:ctx.type,texte,...v.autorisation,at}));
  const r=await updatePre(env,stay,'patient-lien','Autorisation signée en ligne',x=>{if(x.autorisation?.at)return {error:'Votre autorisation a déjà été reçue.',status:409};x.autorisation={...v.autorisation,texte,type:ctx.type,at,empreinte}});
  if(r.error)return json({error:r.error},r.status||409);
  await env.DB.prepare('INSERT INTO consent_evidence(stay_id,at,mode,fingerprint,link_hash,ip,user_agent) VALUES(?,?,?,?,?,?,?)').bind(stay,at,'autorisation-preadmission',empreinte,hash,clientIp(request),String(request.headers.get('user-agent')||'').slice(0,300)).run();
  await patientLog(env,stay,'preadmission-autorisation','allowed','Autorisation signée en ligne · empreinte '+empreinte.slice(0,16),at);
  return json(await vuePatient(env,stay,etab,tel));
 }catch(e){return json({error:e.message==='size'?'Envoi trop volumineux.':'Service indisponible.'},e.message==='size'?413:503)}
}

async function upload(request,env,url,etab,tel){
 if(!env.BUCKET)return json({error:'Dépôt de fichiers indisponible pour le moment.'},503);
 const dec=v=>{try{return decodeURIComponent(v||'')}catch{return ''}};
 const auth=await authenticate(env,request.headers.get('x-acces'),request.headers.get('x-naissance'));if(auth.response)return auth.response;
 const {row,at}=auth,stay=row.stay_id,piece=url.searchParams.get('piece')||'';
 if(!R.PIECE[piece])return json({error:'Choisissez le type de pièce.'},400);
 const declared=Number(request.headers.get('content-length')||0);if(declared>E.LIMITES.fichier+1024)return json({error:'Fichier trop lourd : 10 Mo au maximum.'},413);
 const bytes=new Uint8Array(await request.arrayBuffer()),ctx=await contexte(env,stay);
 if(!E.depotOuvert(ctx.datePrevue))return json({error:'Le dépôt en ligne est fermé depuis le lendemain de votre intervention. Contactez la clinique.'},409);
 const check=E.controleFichier(bytes,{deja:(ctx.data.pieces||[]).filter(p=>!p.remplace),categorie:'autre'});
 if(check.error){await patientLog(env,stay,'preadmission-piece','denied',check.error.slice(0,120),at);return json({error:check.error},400)}
 const fileHash=await sha(bytes),nom=E.nomFichier(dec(request.headers.get('x-nom')),check.type);
 await env.BUCKET.put(fileHash,bytes,{httpMetadata:{contentType:check.type},customMetadata:{name:nom}});
 await env.DB.prepare('INSERT OR IGNORE INTO file_scopes(hash,document_key) VALUES(?,?)').bind(fileHash,docKey(stay)).run();
 const r=await updatePre(env,stay,'patient-lien','Pièce de préadmission déposée',x=>{
  if(x.pieces.some(p=>p.hash===fileHash&&!p.remplace))return {error:'Ce fichier a déjà été transmis.',status:409};
  const id=crypto.randomUUID();
  // Une seule pièce active par type (sauf devis, directives, autre) : la nouvelle remplace l'ancienne, qui reste conservée.
  if(!R.MULTIPLES.includes(piece))for(const p of x.pieces)if(p.piece===piece&&!p.remplace)p.remplace={at,par:id};
  x.pieces.push({id,piece,hash:fileHash,nom,type:check.type,taille:bytes.byteLength,recuLe:at,controle:null});
  if(!x.type)x.type=ctx.type;repondu(x,at);
 });
 if(r.error)return json({error:r.error},r.status||409);
 await patientLog(env,stay,'preadmission-piece','allowed','Pièce déposée · '+R.PIECE[piece].libelle+' · '+E.taille(bytes.byteLength),at);
 return json(await vuePatient(env,stay,etab,tel),201);
}

/* ---------------- Professionnels (admissions) ---------------- */
const peutLire=(acl,stay)=>validStay(stay)&&JOBS.includes(acl.job)&&acl.canRead(docKey(stay));
const admissions=acl=>acl.job==='secretariat'||acl.isAdmin;
async function liste(env,acl){
 const lire=async m=>new Map(((await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE ?").bind('stay/%/'+m).all()).results||[]).map(r=>{try{return [r.key.split('/')[1],JSON.parse(r.data)]}catch{return [r.key.split('/')[1],null]}}));
 const [cores,consults,annonces,contacts,pres]=await Promise.all(['core','consult','surgicalAnnouncement','invitationContact',MODULE].map(lire));
 const rows=[];
 for(const [stay,core] of cores){
  if(!peutLire(acl,stay)||!core)continue;
  const pre=pres.get(stay)||null,data={...vide(),...(pre||{})},consult=consults.get(stay),ann=annonces.get(stay);
  const type=R.typeSejour({core,consult,surgicalAnnouncement:ann,preadmissionPatient:pre}),id=core.identity||{},naissance=id.birthDate||'';
  const et=R.etat(data,type,{naissance}),contact=contacts.get(stay)?.contact;
  rows.push({stay,patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||'',naissance},specialite:core.specialty||'',mode:core.mode||'',type,typeSource:pre?.typeSource||'auto',
   datePrevue:E.datePrevueSejour({consult,surgicalAnnouncement:ann}),intervention:ann?.published?.fields?.procedure||'',etat:et,
   pieces:R.piecesActives(data.pieces).length,aVerifier:(data.pieces||[]).filter(p=>!p.remplace&&!p.controle).length,
   dernierEnvoi:(data.envois||[]).at(-1)||null,rappels:(data.rappels||[]).slice(-3),contact:!!contact,ouvertLe:data.ouvertLe||null,miseAJour:data.formulaire?.brouillonLe||null});
 }
 await acl.log('preadmission-liste','preadmission','allowed','Liste des préadmissions consultée',rows.length+' séjour(s)');
 return rows.sort((a,b)=>(a.datePrevue||'9999').localeCompare(b.datePrevue||'9999'));
}
async function dossier(env,acl,stay){
 const ctx=await contexte(env,stay);
 const links=(await env.DB.prepare('SELECT created_at,expires_at,motif,channels,revoked,failed_attempts,first_viewed_at,view_count FROM preadmission_links WHERE stay_id=? ORDER BY created_at DESC').bind(stay).all()).results||[],now=new Date().toISOString();
 await acl.log('preadmission-lecture',docKey(stay),'allowed','Compte rendu de préadmission consulté');
 return {stay,type:ctx.type,typeSource:ctx.data.typeSource||'auto',patient:ctx.patient,contact:ctx.contact?{telephone:ctx.contact.phone||'',email:ctx.contact.email||''}:null,
  datePrevue:ctx.datePrevue,intervention:ctx.intervention,specialite:ctx.core?.specialty||'',mode:ctx.core?.mode||'',data:ctx.data,etat:ctx.etat,
  liens:links.slice(0,20).map(l=>({envoyeLe:l.created_at,expire:l.expires_at,motif:l.motif,canaux:String(l.channels||'').split(',').filter(Boolean),actif:!Number(l.revoked)&&l.expires_at>now&&Number(l.failed_attempts)<MAX_ECHECS,ouvertLe:l.first_viewed_at,vues:Number(l.view_count||0)})),
  peutVerifier:admissions(acl)};
}
async function action(env,acl,d,origin){
 const stay=String(d.stay||'');if(!peutLire(acl,stay))return json({error:'Accès refusé.'},403);
 const who=acl.profile.display_name||'Admissions',at=new Date().toISOString(),motif=String(d.motif||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,300);
 const ctx=await contexte(env,stay);let reason='';
 if(d.action!=='type'&&!admissions(acl))return json({error:'Action réservée aux admissions.'},403);
 const r=await updatePre(env,stay,acl.profile.user_id,'Admissions : '+d.action,x=>{
  if(d.action==='type'){if(!R.TYPES[d.type])return {error:'Type inconnu.',status:400};x.type=d.type;x.typeSource='admissions';reason='Préadmission '+R.TYPES[d.type].toLowerCase();return}
  if(d.action==='piece'){
   const p=x.pieces.find(y=>y.id===d.id&&!y.remplace);if(!p)return {error:'Pièce introuvable.',status:404};
   if(d.conforme!==true&&motif.length<3)return {error:'Indiquez le motif (illisible, périmée, mauvais document…).',status:400};
   p.controle={conforme:d.conforme===true,motif:d.conforme===true?'':motif,at,by:who};reason=R.PIECE[p.piece].libelle+(d.conforme===true?' conforme':' non conforme : '+motif);
   if(d.conforme!==true&&x.verification?.at){x.verificationPrecedente=x.verification;x.verification=null}
   return;
  }
  if(d.action==='a-completer'){if(motif.length<3)return {error:'Précisez ce que le patient doit compléter.',status:400};x.aCompleter={at,by:who,motif};if(x.verification?.at){x.verificationPrecedente=x.verification;x.verification=null}reason='Complément demandé : '+motif;return}
  if(d.action==='lever'){if(!x.aCompleter||x.aCompleter.leve)return {error:'Aucune demande en cours.',status:409};x.aCompleter.leve={at,by:who};reason='Demande de complément levée';return}
  if(d.action==='verifier'){
   const et=R.etat(x,ctx.type,{naissance:ctx.patient.naissance});
   if(!et.preadmission)return {error:'Préadmission incomplète : '+(x.formulaire?.soumisLe?'pièces manquantes ('+et.piecesManquantes.map(k=>R.PIECE[k].libelle).join(', ')+').':'formulaire non envoyé par le patient.'),status:409};
   const nonVues=x.pieces.filter(p=>!p.remplace&&!p.controle);for(const p of nonVues)p.controle={conforme:true,motif:'',at,by:who};
   if(x.aCompleter&&!x.aCompleter.leve)x.aCompleter.leve={at,by:who};
   x.verification={at,by:who,note:motif};reason='Préadmission vérifiée'+(nonVues.length?' ('+nonVues.length+' pièce(s) validée(s))':'');return;
  }
  return {error:'Action inconnue.',status:400};
 });
 if(r.error)return json({error:r.error},r.status||409);
 await acl.log('preadmission-'+d.action,docKey(stay),'allowed',reason.slice(0,200));
 // Demande de complément : le patient est prévenu avec un nouveau lien (sans motif dans le message).
 let envoi=null;if(d.action==='a-completer'&&d.envoyer===true){const e=await envoyerLien(env,acl,origin,{stay,motif:'complement',rappel:true});envoi=e.body.results||{error:e.body.error}}
 return json({...await dossier(env,acl,stay),envoi});
}

export async function staffPreadmissionApi(request,env,acl){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/workspace/preadmission/'))return null;
 const route=url.pathname.slice('/api/workspace/preadmission/'.length);
 if(!JOBS.includes(acl.job)&&!acl.isAdmin)return json({error:'Préadmissions réservées aux admissions, aux anesthésistes et aux chirurgiens.'},403);
 if(route==='liste'&&request.method==='GET')return json({preadmissions:await liste(env,acl),peutVerifier:admissions(acl)});
 if(route==='dossier'&&request.method==='GET'){const stay=String(url.searchParams.get('stay')||'');if(!peutLire(acl,stay))return json({error:'Accès refusé.'},403);return json(await dossier(env,acl,stay))}
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const d=await body(request);
 if(route==='send'){
  const stay=String(d.stay||'');if(!peutLire(acl,stay))return json({error:'Envoi hors habilitation.'},403);
  const r=await envoyerLien(env,acl,url.origin,{stay,channels:d.channels,motif:'manuel'});const {token,...rest}=r.body;
  return json(rest,r.status);
 }
 if(route==='action')return action(env,acl,d,url.origin);
 return json({error:'Service inconnu.'},404);
}

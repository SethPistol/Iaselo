// IASELO · envoi automatique de la lettre de liaison de sortie.
//
// Déclenchement : la validation de la relecture par un médecin (rubrique stay/<id>/discharge, champ
// liaison.document) est détectée à l'enregistrement serveur ; chaque nouvelle version relue part une fois,
// sans action supplémentaire, vers :
//   - le patient          : e-mail Brevo (SMS à défaut) contenant seulement un lien personnel ; la lettre figée
//                           s'ouvre après la date de naissance (5 erreurs = lien fermé), valable 30 jours ;
//   - le médecin traitant : MSSanté uniquement (espace de confiance). Jamais d'e-mail ordinaire à un médecin ;
//   - le DMP              : dépôt du PDF dans un CDA (connecteur DMP), patient informé et non opposé, INS qualifiée.
// Les connecteurs MSSanté et DMP restent en « simulation » (références SIM-, rien ne part) tant que
// l'établissement n'a pas ses autorisations : l'écran l'affiche en toutes lettres.
//
//  Professionnels : GET  /api/workspace/lettre-liaison/status?stay=   POST /api/workspace/lettre-liaison/relancer
//  Patient        : POST /api/lettre-liaison/open | view
import L from '../dist/lettre-liaison-regles.js';
import {interopStatus} from '../server/interop/index.mjs';
import {checkDmpPreconditions} from '../server/interop/dmp.mjs';
import {textPdf} from '../server/pdf-texte.mjs';
import {identityRecord,authorOf} from './veille.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const mask={email:v=>{const [u,d]=String(v).split('@');return d?u.slice(0,1)+'***@'+d:'***'},sms:v=>{v=String(v);return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'}};
const MAX_ECHECS=5,DOCTORS=['anesthesiste','chirurgien'];
const dischargeKey=stay=>'stay/'+stay+'/discharge';
const validStay=s=>typeof s==='string'&&/^[^/]{1,80}$/.test(s);
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
export const empreinte=async doc=>doc?sha(L.canonique(doc)):'';

// Envois lancés après la réponse à l'enregistrement : suivis ici pour l'arrêt propre et les tests.
const pending=new Set();
export const attendreEnvois=()=>Promise.allSettled([...pending]);
const track=p=>{pending.add(p);p.catch(e=>console.error('lettre_liaison_envoi',e?.message||e)).finally(()=>pending.delete(p));return p};

function modes(env){const s=interopStatus(env.INTEROP_ENV||{}),m=id=>s.find(c=>c.id===id)?.mode||'simulation';return {mssante:m('mssante'),dmp:m('dmp')}}
const simulation=m=>m!=='test'&&m!=='production';

/* ---------- Détection à l'enregistrement ---------- */
// Avant l'écriture : empreinte de la version déjà relue de chaque rubrique « discharge » du lot.
export async function lettresAvant(env,docs){
 const out=new Map();
 for(const d of docs)if(/^stay\/[^/]{1,80}\/discharge$/.test(d.key))out.set(d.key,await empreinte((await docData(env,d.key))?.liaison?.document));
 return out;
}
// Après l'écriture confirmée : une nouvelle version relue par un médecin part automatiquement.
export async function declencher(env,acl,docs,avant,origin){
 try{for(const d of docs){
  if(!avant.has(d.key))continue;
  const doc=d.data?.liaison?.document;if(!doc?.values)continue;
  const fp=await empreinte(doc);if(fp===avant.get(d.key))continue;
  const stay=d.key.split('/')[1];
  if(!DOCTORS.includes(acl.job)){await acl.log('lettre-liaison-envoi',d.key,'denied','Relecture enregistrée par un non-médecin : envoi automatique non lancé');continue}
  track(diffuser(env,{stay,doc,fp,acl,origin}));
 }}catch(e){console.error('lettre_liaison_declenchement',e?.message||e)}// l'enregistrement reste confirmé ; « Relancer » reste possible
}

/* ---------- Envoi ---------- */
async function claim(env,stay,fp,cible,user){
 const at=new Date().toISOString();
 const r=await env.DB.prepare("INSERT OR IGNORE INTO liaison_envois(stay_id,empreinte,cible,statut,created_by,created_at,updated_at) VALUES(?,?,?,'en-cours',?,?,?)").bind(stay,fp,cible,user,at,at).run();
 return r.meta.changes>0;
}
const record=(env,stay,fp,cible,{statut,mode='',ref='',detail=''})=>env.DB.prepare('UPDATE liaison_envois SET statut=?,mode=?,ref=?,detail=?,updated_at=? WHERE stay_id=? AND empreinte=? AND cible=?').bind(statut,mode,String(ref).slice(0,120),String(detail).slice(0,600),new Date().toISOString(),stay,fp,cible).run();

export async function diffuser(env,{stay,doc,fp,acl,origin,cibles=['patient','medecin','dmp']}){
 const values=doc.values,user=acl.profile.user_id,messaging=env.MESSAGING,m=modes(env),key=dischargeKey(stay);
 const snapshot={values,date:doc.date,sejour:stay,empreinte:fp,etablissement:messaging?.establishment||values.facility||''};
 let pdf=null;const pdfBase64=()=>(pdf??=textPdf(L.blocs(snapshot),{title:'Lettre de liaison · '+(snapshot.etablissement||'IASELO')})).toString('base64');
 const results=[];
 for(const cible of cibles){
  if(!await claim(env,stay,fp,cible,user))continue;// déjà parti pour cette version
  let out;
  try{
   if(cible==='patient')out=await versPatient(env,{stay,fp,values,snapshot,user,messaging,origin,pdfBase64});
   else if(cible==='medecin')out=await versMedecin(env,{values,mode:m.mssante,pdfBase64,snapshot});
   else out=await versDmp(env,{stay,values,mode:m.dmp,user,pdfBase64});
  }catch(e){out={statut:'echec',detail:String(e.message||'Envoi impossible.').slice(0,300)}}
  await record(env,stay,fp,cible,out);results.push({cible,...out});
  await acl.log('lettre-liaison-envoi',key,['envoye','simule','sans-objet'].includes(out.statut)?'allowed':'denied',L.CIBLE[cible]+' : '+(L.ETATS[out.statut]?.[0]||out.statut)+(out.mode?' ('+out.mode+')':''),(out.journal||out.ref||out.detail||'').slice(0,300));
 }
 return results;
}

async function versPatient(env,{stay,fp,values,snapshot,user,messaging,origin}){
 if(values.patientEnvoi==='Refus du patient')return {statut:'sans-objet',detail:'Refus du patient : lettre remise imprimée.'};
 if(!messaging||!(messaging.channels?.email||messaging.channels?.sms))return {statut:'a-faire',detail:'Envoi d’e-mails non configuré sur ce serveur : remettez la lettre imprimée.'};
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact||{};
 const birth=L.isDate(contact.birthDate)?contact.birthDate:values.dob;
 if(!L.isDate(birth))return {statut:'a-faire',detail:'Date de naissance manquante : elle protège l’accès du patient.'};
 const channel=contact.email&&messaging.channels?.email?'email':contact.phone&&messaging.channels?.sms?'sms':'';
 if(!channel)return {statut:'a-faire',detail:'Aucune coordonnée vérifiée (écran Questionnaire) : remettez la lettre imprimée.'};
 const to=channel==='email'?contact.email:contact.phone;
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await sha(token),at=new Date().toISOString();
 // Un seul lien actif par séjour : une nouvelle version relue ferme le lien précédent.
 await env.DB.batch([
  env.DB.prepare('UPDATE liaison_links SET revoked=1 WHERE stay_id=? AND revoked=0').bind(stay),
  env.DB.prepare('INSERT INTO liaison_links(token_hash,stay_id,empreinte,snapshot,birth_date,created_by,created_at,expires_at,channel) VALUES(?,?,?,?,?,?,?,?,?)').bind(hash,stay,fp,JSON.stringify(snapshot),birth,user,at,L.expiration(at),channel)
 ]);
 const text=L.messages(messaging.establishment,origin+'/lettre-liaison.html#acces='+token);
 try{
  const ref=channel==='sms'?await messaging.sms({to,content:text.sms,tag:'iaselo-lettre-liaison'}):await messaging.email({to,subject:text.subject,text:text.text,html:text.html,tag:'iaselo-lettre-liaison'});
  return {statut:'envoye',mode:channel==='sms'?'SMS':'e-mail',ref:ref||'',detail:(channel==='sms'?'SMS':'E-mail')+' à '+mask[channel](to),journal:'Destinataire '+mask[channel](to)+(ref?' · réf. Brevo '+ref:'')};
 }catch(e){
  await env.DB.prepare('UPDATE liaison_links SET revoked=1 WHERE token_hash=?').bind(hash).run();
  return {statut:'echec',mode:channel==='sms'?'SMS':'e-mail',detail:String(e.message||'Envoi impossible.').slice(0,200)+' · destinataire '+mask[channel](to)};
 }
}

async function versMedecin(env,{values,mode,pdfBase64,snapshot}){
 if(values.gpStatus!=='Déclaré')return {statut:'sans-objet',detail:'Pas de médecin traitant déclaré.'};
 const to=String(values.gpMssante||'').trim().toLowerCase();
 if(!to)return {statut:'a-faire',detail:'Adresse MSSanté manquante : aucun e-mail ordinaire n’est envoyé à un médecin. Renseignez-la puis relancez, ou adressez la lettre imprimée.'};
 if(!L.isMssante(to))return {statut:'a-faire',detail:'Adresse MSSanté invalide : corrigez-la dans la lettre.'};
 if(simulation(mode))return {statut:'simule',mode:'simulation',ref:'SIM-MSS-'+crypto.randomUUID().slice(0,8),detail:'Simulation : rien n’est parti. Destinataire prévu '+mask.email(to)};
 const mss=env.INTEROP?.mssante;if(!mss)return {statut:'echec',mode,detail:'Connecteur MSSanté non chargé sur ce serveur.'};
 await mss.send({to:[to],subject:'Lettre de liaison de sortie · '+(snapshot.etablissement||''),text:'Bonjour,\n\nVeuillez trouver ci-joint la lettre de liaison de sortie de votre patient(e).\n\n'+(values.doctor||'')+'\n'+(snapshot.etablissement||''),attachments:[{filename:'lettre-de-liaison.pdf',contentType:'application/pdf',base64:pdfBase64()}]});
 return {statut:'envoye',mode,ref:'MSS-'+crypto.randomUUID().slice(0,8),detail:'MSSanté à '+mask.email(to)};
}

async function versDmp(env,{stay,values,mode,user,pdfBase64}){
 if(values.dmpInfo==='Opposition du patient')return {statut:'sans-objet',detail:'Opposition du patient au dépôt dans son DMP.'};
 if(values.dmpInfo!=='Informé, ne s’oppose pas')return {statut:'a-faire',detail:'Patient non informé du dépôt dans son DMP.'};
 const identity=await identityRecord(env,stay)||{status:'Non qualifiée',ins:null},author=await authorOf(env,user);
 const errors=checkDmpPreconditions({identity,consent:{informed:true,opposition:false},author});
 if(simulation(mode))return {statut:'simule',mode:'simulation',ref:'SIM-DMP-'+crypto.randomUUID().slice(0,8),detail:'Simulation : rien n’est déposé.'+(errors.length?' En réel, le dépôt serait refusé : '+errors.join(' '):'')};
 if(errors.length)return {statut:'echec',mode,detail:errors.join(' ')};
 const dmp=env.INTEROP?.dmp;if(!dmp)return {statut:'echec',mode,detail:'Connecteur DMP non chargé sur ce serveur.'};
 const core=await docData(env,'stay/'+stay+'/core');
 const r=await dmp.send({identity,consent:{informed:true,opposition:false},author,patient:core?.identity||{birthName:values.birthname,firstName:values.firstname,birthDate:values.dob},ins:identity.ins,pdfBase64:pdfBase64()});
 return {statut:'envoye',mode,ref:r.documentId,detail:'Déposé dans le DMP'};
}

/* ---------- Professionnels ---------- */
async function etat(env,stay){
 const doc=(await docData(env,dischargeKey(stay)))?.liaison?.document||null,fp=await empreinte(doc);
 const rows=(await env.DB.prepare('SELECT empreinte,cible,statut,mode,ref,detail,created_at,updated_at FROM liaison_envois WHERE stay_id=? ORDER BY created_at DESC').bind(stay).all()).results||[];
 const link=await env.DB.prepare('SELECT created_at,expires_at,revoked,first_viewed_at,last_viewed_at,view_count,failed_attempts,empreinte FROM liaison_links WHERE stay_id=? ORDER BY created_at DESC LIMIT 1').bind(stay).first();
 const now=new Date().toISOString();
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact||{},messaging=env.MESSAGING,identity=await identityRecord(env,stay);
 return {empreinte:fp,modes:modes(env),messagerie:!!(messaging&&(messaging.channels?.email||messaging.channels?.sms)),
  contact:{email:contact.email&&messaging?.channels?.email?mask.email(contact.email):'',phone:contact.phone&&messaging?.channels?.sms?mask.sms(contact.phone):''},insQualifiee:identity?.status==='Qualifiée',
  envois:rows.filter(r=>r.empreinte===fp).map(r=>({cible:r.cible,statut:r.statut,mode:r.mode,ref:r.ref,detail:r.detail,at:r.updated_at})),
  historique:rows.filter(r=>r.empreinte!==fp).slice(0,30).map(r=>({version:r.empreinte.slice(0,12),cible:r.cible,statut:r.statut,mode:r.mode,at:r.updated_at})),
  lien:link?{envoyeLe:link.created_at,expireLe:link.expires_at,actif:!Number(link.revoked)&&link.expires_at>now&&Number(link.failed_attempts)<MAX_ECHECS,ouvertLe:link.first_viewed_at||null,vues:Number(link.view_count||0),bloque:Number(link.failed_attempts||0)>=MAX_ECHECS,versionCourante:link.empreinte===fp}:null};
}

export async function staffLettreLiaisonApi(request,env,acl){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/workspace/lettre-liaison/'))return null;
 const route=url.pathname.slice('/api/workspace/lettre-liaison/'.length);
 if(route==='status'&&request.method==='GET'){
  const stay=String(url.searchParams.get('stay')||'');
  if(!validStay(stay)||!acl.canRead(dischargeKey(stay)))return json({error:'Accès refusé.'},403);
  return json(await etat(env,stay));
 }
 if(route==='relancer'&&request.method==='POST'){
  const d=await body(request),stay=String(d.stay||''),cible=String(d.cible||'');
  if(!validStay(stay)||!L.CIBLE[cible])return json({error:'Demande invalide.'},400);
  if(!acl.canRead(dischargeKey(stay))||!DOCTORS.includes(acl.job))return json({error:'Relance réservée aux médecins du séjour.'},403);
  const doc=(await docData(env,dischargeKey(stay)))?.liaison?.document;if(!doc?.values)return json({error:'Aucune lettre relue pour ce séjour.'},409);
  const fp=await empreinte(doc);
  const row=await env.DB.prepare('SELECT statut FROM liaison_envois WHERE stay_id=? AND empreinte=? AND cible=?').bind(stay,fp,cible).first();
  if(row?.statut==='en-cours')return json({error:'Envoi déjà en cours.'},409);
  if(row?.statut==='envoye'&&cible!=='patient')return json({error:'Déjà transmis pour cette version.'},409);
  await env.DB.prepare('DELETE FROM liaison_envois WHERE stay_id=? AND empreinte=? AND cible=?').bind(stay,fp,cible).run();
  const results=await diffuser(env,{stay,doc,fp,acl,origin:url.origin,cibles:[cible]});
  return json({results,...await etat(env,stay)});
 }
 return json({error:'Service inconnu.'},404);
}

/* ---------- Patient (lien reçu, sans compte) ---------- */
const patientLog=(env,stay,result,reason,at)=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,'patient-lien','lettre-liaison-consultation',?,?,?)").bind(at,dischargeKey(stay),result,reason).run();
export async function patientLettreLiaisonApi(request,env){
 try{
  const url=new URL(request.url);
  if(request.method!=='POST'||!['/api/lettre-liaison/open','/api/lettre-liaison/view'].includes(url.pathname))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const d=await body(request);if(typeof d.token!=='string'||!/^[a-f0-9]{64}$/.test(d.token))return json({error:'Lien invalide.'},410);
  const hash=await sha(d.token),at=new Date().toISOString();
  const row=await env.DB.prepare('SELECT * FROM liaison_links WHERE token_hash=? AND revoked=0 AND expires_at>? AND failed_attempts<?').bind(hash,at,MAX_ECHECS).first();
  if(!row)return json({error:'Lien expiré ou remplacé par une version plus récente. Contactez la clinique si besoin.'},410);
  const snapshot=JSON.parse(row.snapshot);
  if(url.pathname.endsWith('/open'))return json({available:true,etablissement:snapshot.etablissement||''});
  if(!L.isDate(d.birthDate)||d.birthDate!==row.birth_date){
   await env.DB.prepare('UPDATE liaison_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
   const left=MAX_ECHECS-Number(row.failed_attempts)-1;
   await patientLog(env,row.stay_id,'denied',left>0?'Date de naissance erronée':'Lien fermé après '+MAX_ECHECS+' erreurs',at);
   return json({error:left>0?'Date de naissance incorrecte. Encore '+left+' essai'+(left>1?'s':'')+'.':'Trop d’essais : ce lien est désactivé. Contactez la clinique.'},left>0?400:410);
  }
  await env.DB.prepare('UPDATE liaison_links SET view_count=view_count+1,last_viewed_at=?,first_viewed_at=COALESCE(first_viewed_at,?) WHERE token_hash=?').bind(at,at,hash).run();
  await patientLog(env,row.stay_id,'allowed','Lettre de liaison consultée par le patient · version '+row.empreinte.slice(0,12),at);
  const pdf=textPdf(L.blocs(snapshot),{title:'Lettre de liaison · '+(snapshot.etablissement||'IASELO')}).toString('base64');
  return json({lettre:{values:Object.fromEntries(Object.entries(snapshot.values).filter(([k])=>!L.DIFFUSION.has(k))),date:snapshot.date,etablissement:snapshot.etablissement,empreinte:snapshot.empreinte},pdf,expiresAt:row.expires_at});
 }catch{return json({error:'Service indisponible.'},503)}
}

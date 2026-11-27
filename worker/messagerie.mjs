// IASELO · messagerie sécurisée patient ↔ équipe et assistant du patient (27/11/2026, manques n°5 et n°6 de la 3e veille).
//  Professionnels (médecins et infirmier(ère)s du séjour) :
//   GET  /api/workspace/messagerie                  conversations visibles, non lus, messages signalés urgents
//   GET  /api/workspace/messagerie?stay=            fil d'un patient (marque les messages du patient comme lus)
//   POST /api/workspace/messagerie                  {action:'ouvrir'|'repondre'|'fermer'|'rouvrir', stay, texte}
//  Patient (lien personnel reçu par SMS ou e-mail, date de naissance vérifiée à chaque appel) :
//   POST /api/messagerie/open                       établissement, état (sans contenu)
//   POST /api/messagerie/fil                        fil des messages
//   POST /api/messagerie/envoyer                    nouveau message ; l'assistant propose des conseils et repère l'urgence
// SMS et e-mails sans donnée de santé (« nouveau message de votre équipe » + lien) ; rubrique stay/<id>/messagerie écrite
// par le serveur ; liens hachés (migration 025) ; tout est tracé dans le journal d'accès.
import A from '../dist/messagerie-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():v===undefined||v===null?'':String(v).trim();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const mask=v=>{v=String(v||'');if(v.includes('@')){const [a,b]=v.split('@');return a.slice(0,2)+'***@'+b}return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
const validStay=s=>/^[^/]{1,80}$/.test(String(s||''));
const JOBS=['anesthesiste','chirurgien','infirmier'],MAX_ECHECS=5,MAX_JOUR=20,DUREE_LIEN=30;
const cle=stay=>'stay/'+stay+'/messagerie';
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const patientLog=(env,stay,action,result,reason)=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),'patient-lien',action,cle(stay),result,reason,'').run();

async function maj(env,stay,actor,reason,mutate){
 for(let i=0;i<4;i++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(cle(stay)).first();
  const data={ouverte:false,messages:[],historique:[],...(row?JSON.parse(row.data):{})};const out=await mutate(data);if(out?.error)return out;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,cle(stay),row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(cle(stay),payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...out};
 }
 return {error:'Modification concurrente, réessayez.',status:409};
}

// Prévenir le patient : nouveau lien (le précédent cesse de valoir), SMS sinon e-mail, sans contenu du message.
async function prevenir(env,acl,stay,origin,motif){
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact,m=env.MESSAGING;
 if(!contact||(!contact.phone&&!contact.email))return {ok:false,raison:'Aucune coordonnée vérifiée : enregistrez-les dans « Questionnaire patient ».'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(t(contact.birthDate)))return {ok:false,raison:'Date de naissance absente des coordonnées vérifiées.'};
 const sms=!!(contact.phone&&m?.channels?.sms),mail=!!(contact.email&&m?.channels?.email);
 if(!sms&&!mail)return {ok:false,raison:'Envoi SMS et e-mail non configuré sur ce serveur (Brevo).'};
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),at=new Date();
 await env.DB.prepare('UPDATE messagerie_links SET revoked_at=? WHERE stay_id=? AND revoked_at IS NULL').bind(at.toISOString(),stay).run();
 await env.DB.prepare('INSERT INTO messagerie_links(token_hash,stay_id,birth_date,created_at,expires_at) VALUES(?,?,?,?,?)').bind(await sha(token),stay,contact.birthDate,at.toISOString(),new Date(at.getTime()+DUREE_LIEN*864e5).toISOString()).run();
 const lien=origin+'/messagerie.html#acces='+token,texte=A.notification(m.establishment,lien,motif);
 try{
  if(sms){await m.sms({to:contact.phone,content:texte,tag:'iaselo-messagerie'});return {ok:true,detail:'SMS envoyé à '+mask(contact.phone)}}
  await m.email({to:contact.email,name:[contact.firstName,contact.lastName].filter(Boolean).join(' '),subject:(m.establishment||'La clinique')+' · message de votre équipe',text:texte,tag:'iaselo-messagerie'});return {ok:true,detail:'E-mail envoyé à '+mask(contact.email)};
 }catch(e){return {ok:false,raison:String(e?.message||'Envoi impossible.').slice(0,200)}}
}

/* ---------------- Professionnels ---------------- */
export async function staffMessagerieApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/messagerie')return null;
 if(!JOBS.includes(acl.job))return json({error:'Messagerie patients réservée aux médecins et infirmier(ère)s du séjour.'},403);
 const peut=stay=>validStay(stay)&&acl.canRead(cle(stay))&&acl.canRead('stay/'+stay+'/core');
 const who=acl.profile.display_name||'Équipe',at=new Date().toISOString();
 if(request.method==='GET'){
  const stay=url.searchParams.get('stay');
  if(stay){
   if(!peut(stay))return json({error:'Accès refusé.'},403);
   const r=await maj(env,stay,acl.profile.user_id,'Messages du patient lus',x=>{let n=0;for(const m of x.messages)if(m.de==='patient'&&!m.lu){m.lu={at,par:who};n++}if(!n)return {error:'rien',status:200}});
   const data=r.data||(await docData(env,cle(stay)))||{ouverte:false,messages:[]},core=await docData(env,'stay/'+stay+'/core'),id=core?.identity||{};
   await acl.log('messagerie-lecture',cle(stay),'allowed','Fil de messagerie consulté','');
   return json({stay,patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||''},contact:!!(await docData(env,'stay/'+stay+'/invitationContact'))?.contact,...data,modeles:A.REPONSES});
  }
  const rows=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/messagerie'").all()).results||[],out=[];
  for(const r of rows){const s=r.key.split('/')[1];if(!peut(s))continue;let d;try{d=JSON.parse(r.data)}catch{continue}
   const core=await docData(env,'stay/'+s+'/core'),id=core?.identity||{},nonLus=d.messages.filter(m=>m.de==='patient'&&!m.lu);
   out.push({stay:s,patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||''},ouverte:!!d.ouverte,nonLus:nonLus.length,urgent:nonLus.some(m=>m.urgence),dernier:d.messages.at(-1)?{de:d.messages.at(-1).de,at:d.messages.at(-1).at,extrait:d.messages.at(-1).texte.slice(0,90)}:null})}
  out.sort((a,b)=>(b.urgent-a.urgent)||(b.nonLus-a.nonLus)||String(b.dernier?.at||'').localeCompare(String(a.dernier?.at||'')));
  return json({conversations:out});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=JSON.parse(new TextDecoder().decode(await request.arrayBuffer()))}catch{return json({error:'Demande invalide.'},400)}
 const stay=t(d.stay),action=t(d.action);if(!peut(stay))return json({error:'Accès refusé.'},403);
 const trace=(x,texte)=>{x.historique=[...(x.historique||[]),{at,par:who,texte}].slice(-50)};
 if(action==='ouvrir'||action==='repondre'){
  const texte=t(d.texte).slice(0,2000);if(action==='repondre'&&texte.length<2)return json({error:'Message vide.'},400);
  const r=await maj(env,stay,acl.profile.user_id,action==='ouvrir'?'Messagerie ouverte au patient':'Réponse de l’équipe',x=>{
   if(action==='repondre'&&!x.ouverte)return {error:'Messagerie fermée : rouvrez-la d’abord.',status:409};
   if(action==='ouvrir'){x.ouverte=true;trace(x,'Messagerie ouverte au patient')}
   if(texte)x.messages=[...x.messages,{id:crypto.randomUUID(),de:'equipe',par:who,metier:acl.job,texte,at}].slice(-300);
   for(const m of x.messages)if(m.de==='patient'&&!m.lu)m.lu={at,par:who};
  });
  if(r.error)return json({error:r.error},r.status||409);
  const p=await prevenir(env,acl,stay,url.origin,action==='ouvrir'?'ouverture':'reponse');
  await acl.log('messagerie-'+action,cle(stay),p.ok?'allowed':'denied',action==='ouvrir'?'Messagerie ouverte au patient':'Réponse envoyée au patient',p.ok?p.detail:p.raison);
  await maj(env,stay,acl.profile.user_id,'Notification au patient',x=>{x.notifications=[...(x.notifications||[]),{at,ok:p.ok,...(p.ok?{detail:p.detail}:{raison:p.raison})}].slice(-50)});
  return json({ok:true,notification:p,messagerie:(await docData(env,cle(stay)))});
 }
 if(action==='fermer'||action==='rouvrir'){
  const r=await maj(env,stay,acl.profile.user_id,action==='fermer'?'Messagerie fermée':'Messagerie rouverte',x=>{if(action==='fermer'?!x.ouverte:x.ouverte)return {error:action==='fermer'?'Déjà fermée.':'Déjà ouverte.',status:409};x.ouverte=action==='rouvrir';trace(x,action==='fermer'?'Messagerie fermée':'Messagerie rouverte')});
  if(r.error)return json({error:r.error},r.status||409);
  if(action==='fermer')await env.DB.prepare('UPDATE messagerie_links SET revoked_at=? WHERE stay_id=? AND revoked_at IS NULL').bind(at,stay).run();
  await acl.log('messagerie-'+action,cle(stay),'allowed',action==='fermer'?'Messagerie fermée':'Messagerie rouverte','');
  return json({ok:true,messagerie:r.data});
 }
 return json({error:'Action inconnue.'},400);
}

/* ---------------- Patient ---------------- */
export async function patientMessagerieApi(request,env,etab=''){
 try{
  const url=new URL(request.url),route=url.pathname.replace('/api/messagerie/','');
  if(request.method!=='POST'||!['open','fil','envoyer'].includes(route))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const bytes=await request.arrayBuffer();if(bytes.byteLength>12000)return json({error:'Message trop long.'},413);
  const d=JSON.parse(new TextDecoder().decode(bytes)),token=t(d.token);
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Lien invalide.'},404);
  const hash=await sha(token),row=await env.DB.prepare('SELECT * FROM messagerie_links WHERE token_hash=?').bind(hash).first(),at=new Date().toISOString();
  const fin='Ce lien n’est plus valable. Utilisez le dernier lien reçu, ou appelez la clinique. En cas d’urgence, appelez le 15.';
  if(!row)return json({error:'Lien invalide.'},404);
  if(row.revoked_at||row.expires_at<at||Number(row.failed_attempts)>=MAX_ECHECS)return json({error:fin},410);
  const data=await docData(env,cle(row.stay_id));if(!data?.ouverte)return json({error:'La messagerie est fermée. Pour toute question, appelez la clinique ; en cas d’urgence, le 15.'},410);
  if(route==='open')return json({etablissement:etab||'la clinique'});
  if(t(d.birthDate)!==row.birth_date){
   await env.DB.prepare('UPDATE messagerie_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
   await patientLog(env,row.stay_id,'messagerie-patient','denied','Date de naissance incorrecte');
   return json({error:'La date de naissance ne correspond pas.'},400);
  }
  const vue=x=>x.messages.map(m=>({de:m.de,par:m.de==='equipe'?m.par:'',texte:m.texte,at:m.at,assistant:m.assistant||null}));
  if(route==='fil'){await patientLog(env,row.stay_id,'messagerie-patient','allowed','Fil consulté par le patient');return json({etablissement:etab||'la clinique',messages:vue(data)})}
  const texte=t(d.texte).slice(0,1000);if(texte.length<2)return json({error:'Écrivez votre message.'},400);
  const jour=at.slice(0,10);if(data.messages.filter(m=>m.de==='patient'&&m.at.startsWith(jour)).length>=MAX_JOUR)return json({error:'Nombre de messages du jour atteint. Appelez la clinique.'},429);
  const aide=A.assistant(texte);
  const r=await maj(env,row.stay_id,'patient-lien','Message du patient',x=>{x.messages=[...x.messages,{id:crypto.randomUUID(),de:'patient',texte,at,urgence:aide.urgence||null,assistant:{fiches:aide.fiches.map(f=>f.id),urgence:aide.urgence?.texte||''}}].slice(-300)});
  if(r.error)return json({error:r.error},r.status||409);
  await patientLog(env,row.stay_id,'messagerie-patient','allowed',aide.urgence?'Message du patient · signe d’urgence repéré':'Message du patient');
  return json({ok:true,messages:vue(r.data),assistant:aide});
 }catch{return json({error:'Demande invalide.'},400)}
}

// IASELO · questionnaire du lendemain (SMS J+1) et alerte au médecin.
//  Patient (lien du SMS, sans compte, date de naissance vérifiée) :
//   POST /api/suivi-j1/open    établissement et état du lien
//   POST /api/suivi-j1/submit  réponses → alertes calculées (seuils par défaut de veille-regles.js, à relire)
//  Professionnels :
//   GET  /api/workspace/suivi-j1/alertes  alertes J+1 non traitées des séjours visibles (notification dans IASELO)
//   POST /api/workspace/suivi-j1/traiter  le médecin indique l'action réalisée (rappel, consultation…)
// Les réponses vont dans la rubrique espacePatient (écrite par le serveur) : suiviJ1.reponses.
// Aucune donnée de santé dans le SMS ; le lien est stocké haché ; tout est tracé dans le journal d'accès.
import V from '../dist/veille-regles.js';
import {updateSpace} from './espace-patient.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const MAX_ECHECS=5,MAX_REPONSES=3,DOCTORS=['anesthesiste','chirurgien'];
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const patientLog=(env,stay,action,result,reason,at=new Date().toISOString())=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(at,'patient-lien',action,'stay/'+stay+'/espacePatient',result,reason,'').run();

// Lien personnel du questionnaire, valable 3 jours (créé au moment du SMS J+1).
export async function creerLienJ1(env,{stay,date,birthDate,origin}){
 if(!isDate(birthDate))return null;
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),at=new Date().toISOString(),expires=new Date(Date.now()+3*86400000).toISOString();
 await env.DB.prepare('INSERT INTO suivi_links(token_hash,stay_id,date_ref,birth_date,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(await sha(token),stay,date,birthDate,at,expires).run();
 return origin+'/suivi-j1.html#acces='+token;
}

/* ---------------- Patient ---------------- */
export async function patientSuiviJ1Api(request,env,etab=''){
 try{
  const url=new URL(request.url),route=url.pathname.replace('/api/suivi-j1/','');
  if(request.method!=='POST'||!['open','submit'].includes(route))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const d=await body(request),token=String(d.token||'');
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Lien invalide.'},404);
  const hash=await sha(token),row=await env.DB.prepare('SELECT * FROM suivi_links WHERE token_hash=?').bind(hash).first(),at=new Date().toISOString();
  if(!row)return json({error:'Lien invalide.'},404);
  if(row.expires_at<at||Number(row.failed_attempts)>=MAX_ECHECS)return json({error:'Ce lien n’est plus valable. En cas de besoin, appelez la clinique ; en cas d’urgence, le 15.'},410);
  const questions=V.QUESTIONS_J1.map(([id,,type])=>({id,type:type==='number'?'number':'yesno',texte:V.QUESTIONS_J1_PATIENT[id],obligatoire:id!=='temperature'}));
  if(route==='open'){
   if(!row.first_viewed_at)await env.DB.prepare('UPDATE suivi_links SET first_viewed_at=? WHERE token_hash=?').bind(at,hash).run();
   return json({etablissement:etab||'la clinique',questions,reponses:Number(row.answers)});
  }
  if(String(d.birthDate||'')!==row.birth_date){
   await env.DB.prepare('UPDATE suivi_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
   await patientLog(env,row.stay_id,'suivi-j1-reponse','denied','Date de naissance incorrecte',at);
   return json({error:'La date de naissance ne correspond pas.'},400);
  }
  if(Number(row.answers)>=MAX_REPONSES)return json({error:'Vos réponses ont bien été reçues. Pour toute question, appelez la clinique.'},409);
  const v=V.validerJ1(d.answers||{});if(!v.ok)return json({error:v.errors.join(' ')},400);
  const alerts=V.alertesJ1(v.answers);
  const r=await updateSpace(env,row.stay_id,'patient-lien','Questionnaire J+1 rempli par le patient',data=>{
   const s=data.suiviJ1=data.suiviJ1&&typeof data.suiviJ1==='object'?data.suiviJ1:{};
   s.reponses=[...(Array.isArray(s.reponses)?s.reponses:[]),{at,date:row.date_ref,answers:v.answers,alerts,traite:null}].slice(-20);
  });
  if(r.error)return json({error:r.error},r.status||409);
  await env.DB.prepare('UPDATE suivi_links SET answers=answers+1 WHERE token_hash=?').bind(hash).run();
  await patientLog(env,row.stay_id,'suivi-j1-reponse','allowed',alerts.length?'Questionnaire J+1 reçu · alerte au médecin ('+alerts.length+')':'Questionnaire J+1 reçu · sans alerte',at);
  return json({ok:true,alerte:alerts.length>0});
 }catch(e){return json({error:'Demande invalide.'},400)}
}

/* ---------------- Professionnels ---------------- */
const ouvertes=s=>(Array.isArray(s?.suiviJ1?.reponses)?s.suiviJ1.reponses:[]).map((x,index)=>({...x,index})).filter(x=>x.alerts?.length&&!x.traite);
export async function staffSuiviJ1Api(request,env,acl){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/workspace/suivi-j1/alertes'&&request.method==='GET'){
  const rows=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/espacePatient'").all()).results||[],out=[];
  for(const r of rows){
   if(!acl.canRead(r.key))continue;let data;try{data=JSON.parse(r.data)}catch{continue}
   const stay=r.key.split('/')[1],open=ouvertes(data);if(!open.length)continue;
   const consult=await docData(env,'stay/'+stay+'/consult'),ann=await docData(env,'stay/'+stay+'/surgicalAnnouncement');
   out.push({stay,alertes:open,medecins:{anesthesiste:consult?.ext?.author||'',chirurgien:consult?.ext?.surgeon||ann?.published?.fields?.surgeon||''}});
  }
  return json({alertes:out});
 }
 if(path==='/api/workspace/suivi-j1/traiter'){
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  const d=await body(request),stay=String(d.stay||''),key='stay/'+stay+'/espacePatient',action=String(d.action||'').trim().slice(0,300);
  if(!/^[^/]{1,80}$/.test(stay)||!acl.canRead(key))return json({error:'Accès refusé.'},403);
  if(!DOCTORS.includes(acl.job))return json({error:'Réservé au médecin.'},403);
  if(action.length<3)return json({error:'Indiquez l’action réalisée (rappel du patient, consultation…).'},400);
  const who=acl.profile.display_name||'Médecin',at=new Date().toISOString();
  const r=await updateSpace(env,stay,acl.profile.user_id,'Alerte J+1 traitée',data=>{
   const x=data.suiviJ1?.reponses?.[Number(d.index)];if(!x||!x.alerts?.length)return {error:'Alerte introuvable.',status:404};
   if(x.traite)return {error:'Alerte déjà traitée.',status:409};x.traite={at,by:who,action};
  });
  if(r.error)return json({error:r.error},r.status||409);
  await acl.log('suivi-j1-alerte-traitee',key,'allowed','Alerte J+1 traitée',action);
  return json({espacePatient:r.data});
 }
 return null;
}

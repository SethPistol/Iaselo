// IASELO · rappels automatiques par SMS, lancés par le serveur (aucun réglage côté clinique).
//  - consentement-j-2 / consentement-j-1 : le consentement d'anesthésie n'est pas revenu signé à 2 jours puis
//    à 1 jour de l'intervention → nouveau lien envoyé au patient (SMS, et e-mail s'il est connu).
//  - suivi-j+1 : le lendemain de l'intervention, SMS de nouvelles envoyé à chaque patient opéré.
// Envoi entre 10 h et 20 h (heure de Paris) ; le serveur repasse toutes les 10 minutes.
// Jamais de double envoi (table rappels_auto) ; sans numéro vérifié ou en cas d'échec, une alerte reste au dossier
// (rubrique espacePatient.rappelsAuto) et chaque envoi est tracé dans le journal d'accès.
// SMS sans donnée de santé : établissement, rappel générique, lien personnel (consentement).
import R from '../dist/espace-patient-regles.js';
import {envoyer,updateSpace} from './espace-patient.mjs';
import {suiviMessages} from './veille.mjs';
import {creerLienJ1} from './suivi-j1.mjs';
import {tourneeConvocations} from './convocations.mjs';
import P from '../dist/preadmission-regles.js';
import {contexte,envoyerLien,updatePre} from './preadmission.mjs';
import {tourneeParcours} from './parcours-suivi.mjs';
import {livrerWebhooks} from './fhir.mjs';
export const ACTEUR='iaselo-automatique',NOM='Envoi automatique IASELO',HEURE_DEBUT=10,HEURE_FIN=20;
export const LIBELLES={'convocation':'Convocation','consentement-j-2':'Rappel du consentement à J-2','consentement-j-1':'Rappel du consentement à J-1','suivi-j+1':'SMS de suivi à J+1','preadmission-j-7':'Rappel de préadmission à J-7','preadmission-j-3':'Rappel de préadmission à J-3','preadmission-j-1':'Rappel de préadmission à J-1'};
const mask=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
export function heureParis(now=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now),g=t=>p.find(x=>x.type===t).value;
 return {jour:g('year')+'-'+g('month')+'-'+g('day'),heure:Number(g('hour'))};
}
export const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
function systeme(env){
 const log=(action,target,result='allowed',reason='',detail='')=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),ACTEUR,action,target,result,reason,detail).run();
 return {job:'anesthesiste',canRead:()=>true,profile:{user_id:ACTEUR,display_name:NOM},log};
}
async function claim(env,stay,kind,date){
 const at=new Date().toISOString();
 const r=await env.DB.prepare("INSERT OR IGNORE INTO rappels_auto(stay_id,kind,date_ref,statut,created_at,updated_at) VALUES(?,?,?,'en-cours',?,?)").bind(stay,kind,date,at,at).run();
 return r.meta.changes>0;
}
const record=(env,stay,kind,date,statut,detail='')=>env.DB.prepare('UPDATE rappels_auto SET statut=?,detail=?,updated_at=? WHERE stay_id=? AND kind=? AND date_ref=?').bind(statut,String(detail).slice(0,600),new Date().toISOString(),stay,kind,date).run();
// Trace visible dans le dossier (une ligne par rappel et par date d'intervention).
const tracer=(env,stay,entry)=>updateSpace(env,stay,ACTEUR,LIBELLES[entry.kind],data=>{data.rappelsAuto=[...(Array.isArray(data.rappelsAuto)?data.rappelsAuto:[]).filter(e=>!(e.kind===entry.kind&&e.date===entry.date)),entry].slice(-30)});
// Alerte sans envoi : écrite une seule fois tant que la raison ne change pas ; on réessaie au passage suivant.
async function alerte(env,acl,stay,kind,date,raison){
 const prev=((await docData(env,'stay/'+stay+'/espacePatient'))?.rappelsAuto||[]).find(e=>e.kind===kind&&e.date===date);
 if(prev&&!prev.ok&&prev.raison===raison)return {stay,kind,alerte:raison};
 await acl.log(kind,'stay/'+stay+'/espacePatient','denied',LIBELLES[kind]+' non envoyé',raison);
 await tracer(env,stay,{kind,date,at:new Date().toISOString(),ok:false,raison});
 return {stay,kind,alerte:raison};
}

async function rappelConsentement(env,acl,stay,date,kind,origin){
 const space=(await docData(env,'stay/'+stay+'/espacePatient'))||{},c=space.consentement,st=R.statut(c);
 if(st.recu||st.code==='depose')return {stay,kind,sansObjet:'consentement reçu'};
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact,messaging=env.MESSAGING;
 if(!c?.envoi||st.code==='annule')return alerte(env,acl,stay,kind,date,'Le consentement n’a jamais été envoyé au patient (ou son lien a été désactivé) : envoyez-le depuis l’onglet « Consentement d’anesthésie ».');
 if(!contact?.phone)return alerte(env,acl,stay,kind,date,'Aucun numéro de portable vérifié : rappel par SMS impossible. Enregistrez-le dans « Questionnaire patient ».');
 if(!messaging?.channels?.sms)return alerte(env,acl,stay,kind,date,'Envoi de SMS non configuré sur ce serveur (Brevo).');
 if(!await claim(env,stay,kind,date))return {stay,kind,deja:true};
 // Un nouveau lien remplace l'ancien : il part aussi par e-mail pour que le patient ait le bon lien partout.
 const channels=['sms',...(contact.email&&messaging.channels.email?['email']:[])];
 let r;try{r=await envoyer(env,acl,origin,{stay,purpose:'consentement',channels,relance:true})}catch(e){r={status:500,body:{error:String(e.message||e)}}}
 const sms=(r.body.results||[]).find(x=>x.channel==='sms'),ok=!!sms?.sent;
 const detail=ok?'SMS envoyé à '+sms.to:((sms?.error||r.body.error||'Envoi impossible.')+((r.body.results||[]).some(x=>x.channel==='email'&&x.sent)?' (e-mail envoyé)':''));
 await record(env,stay,kind,date,ok?'envoye':'echec',detail);
 await tracer(env,stay,{kind,date,at:new Date().toISOString(),ok,...(ok?{detail}:{raison:detail})});
 return {stay,kind,ok,detail};
}

async function suiviJ1(env,acl,stay,date,origin){
 const kind='suivi-j+1',contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact,messaging=env.MESSAGING;
 if(!contact?.phone)return alerte(env,acl,stay,kind,date,'Aucun numéro de portable vérifié : SMS du lendemain impossible. Enregistrez-le dans « Questionnaire patient ».');
 if(!messaging?.channels?.sms)return alerte(env,acl,stay,kind,date,'Envoi de SMS non configuré sur ce serveur (Brevo).');
 if(!await claim(env,stay,kind,date))return {stay,kind,deja:true};
 const key='stay/'+stay+'/suiviAmbu';let ok=false,detail;
 try{// Lien personnel vers le questionnaire (8 questions) ; sans date de naissance connue, SMS sans lien.
  const lien=await creerLienJ1(env,{stay,date,birthDate:contact.birthDate,origin});
  const ref=await messaging.sms({to:contact.phone,content:suiviMessages(messaging.establishment,lien)['j+1'],tag:'iaselo-suivi-j1'});ok=true;detail='SMS envoyé à '+mask(contact.phone)+(lien?' · questionnaire joint':' · sans questionnaire (date de naissance inconnue)');
  await acl.log('suivi-j+1',key,'allowed','SMS J+1 envoyé automatiquement via Brevo','Destinataire '+mask(contact.phone)+(ref?' · réf. Brevo '+ref:''));
 }catch(e){detail=String(e.message||'Envoi impossible.').slice(0,200);await acl.log('suivi-j+1',key,'denied','SMS J+1 non envoyé','Destinataire '+mask(contact.phone)+' · '+detail)}
 await record(env,stay,kind,date,ok?'envoye':'echec',detail);
 await tracer(env,stay,{kind,date,at:new Date().toISOString(),ok,...(ok?{detail}:{raison:detail})});
 return {stay,kind,ok,detail};
}

// Préadmission non faite à J-7, J-3 puis J-1 : nouveau lien par SMS et e-mail (coordonnées vérifiées).
// Trace dans la rubrique preadmissionPatient (rappels), visible par les admissions ; jamais deux fois le même rappel.
async function rappelPreadmission(env,acl,stay,date,kind,origin){
 const ctx=await contexte(env,stay);
 if(['faite','verifiee'].includes(ctx.etat.code))return {stay,kind,sansObjet:'préadmission faite'};
 const trace=async entry=>{await updatePre(env,stay,ACTEUR,LIBELLES[kind],d=>{d.rappels=[...(d.rappels||[]).filter(e=>!(e.kind===kind&&e.date===date)),entry].slice(-20)})};
 const sansEnvoi=async raison=>{
  const prev=(ctx.data.rappels||[]).find(e=>e.kind===kind&&e.date===date);
  if(!(prev&&!prev.ok&&prev.raison===raison)){await acl.log(kind,'stay/'+stay+'/preadmissionPatient','denied',LIBELLES[kind]+' non envoyé',raison);await trace({kind,date,at:new Date().toISOString(),ok:false,raison})}
  return {stay,kind,alerte:raison};
 };
 const contact=ctx.contact,messaging=env.MESSAGING;
 if(!contact||(!contact.phone&&!contact.email))return sansEnvoi('Aucune coordonnée vérifiée : rappel de préadmission impossible. Enregistrez-les dans « Questionnaire patient ».');
 if(!P.isDate(contact.birthDate))return sansEnvoi('Date de naissance absente des coordonnées vérifiées : lien de préadmission impossible.');
 if(!messaging)return sansEnvoi('Envoi SMS et e-mail non configuré sur ce serveur (Brevo).');
 if(!await claim(env,stay,kind,date))return {stay,kind,deja:true};
 let r;try{r=await envoyerLien(env,acl,origin,{stay,motif:kind,rappel:true})}catch(e){r={status:500,body:{error:String(e.message||e)}}}
 const ok=r.status===200,res=r.body.results||[];
 const detail=ok?res.filter(x=>x.sent).map(x=>(x.channel==='sms'?'SMS':'E-mail')+' envoyé à '+x.to).join(' · '):(r.body.error||res.map(x=>x.error).filter(Boolean).join(' · ')||'Envoi impossible.');
 await record(env,stay,kind,date,ok?'envoye':'echec',detail);
 await trace({kind,date,at:new Date().toISOString(),ok,...(ok?{detail}:{raison:detail})});
 return {stay,kind,ok,detail};
}

// Un passage : à lancer régulièrement (toutes les 10 minutes) ; sans effet hors de la plage 10 h – 20 h.
let enCours=null;
export function tourneeRappels(env,opts={}){if(!enCours)enCours=tournee(env,opts).finally(()=>{enCours=null});return enCours}
async function tournee(env,{now=new Date(),origin=''}={}){
 const {jour,heure}=heureParis(now),acl=systeme(env);
 // Convocations : plage propre (la veille dès l'heure réglée, le jour même dès 6 h).
 // Webhooks FHIR en attente (nouvelles tentatives), à toute heure.
 await livrerWebhooks(env,{now}).catch(e=>console.error('fhir webhooks',e?.message||e));
 const convocations=await tourneeConvocations(env,acl,{now,origin}).catch(e=>{console.error('convocations',e?.message||e);return []});
 if(heure<HEURE_DEBUT||heure>=HEURE_FIN)return {hors:true,jour,resultats:convocations};
 const rows=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/consult' OR key LIKE 'stay/%/surgicalAnnouncement'").all()).results||[];
 const sejours=new Map();
 for(const r of rows){const m=/^stay\/([^/]{1,80})\/(consult|surgicalAnnouncement)$/.exec(r.key);if(!m)continue;if(!sejours.has(m[1]))sejours.set(m[1],{});try{sejours.get(m[1])[m[2]]=JSON.parse(r.data)}catch{}}
 const resultats=[...convocations];
 for(const [stay,d] of sejours){
  const date=R.datePrevueSejour(d);if(!date)continue;
  try{
   if(date===decale(jour,2))resultats.push(await rappelConsentement(env,acl,stay,date,'consentement-j-2',origin));
   else if(date===decale(jour,1))resultats.push(await rappelConsentement(env,acl,stay,date,'consentement-j-1',origin));
   else if(date===decale(jour,-1))resultats.push(await suiviJ1(env,acl,stay,date,origin));
   const avant=P.RAPPELS.find(n=>date===decale(jour,n));
   if(avant)resultats.push(await rappelPreadmission(env,acl,stay,date,'preadmission-j-'+avant,origin));
  }catch(e){console.error('rappels_auto',stay,e?.message||e)}
 }
 // Parcours de soins à distance (RAAC, ambulatoire, endoscopie) : étapes du jour, de J-7 à J+30.
 resultats.push(...await tourneeParcours(env,acl,{now,origin}).catch(e=>{console.error('parcours',e?.message||e);return []}));
 return {jour,resultats};
}

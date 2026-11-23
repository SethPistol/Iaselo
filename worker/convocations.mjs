// IASELO · SMS de convocation calculé à partir du programme de bloc (management/reservations).
//  Heure de convocation = heure de passage au bloc − décalage (60 min par défaut, réglable dans l'application).
//  Envoi la veille à partir de l'heure d'envoi réglée (16 h par défaut) jusqu'à 21 h, ou le jour même dès 6 h si le
//  programme a été fait tard. Si l'heure ou la date change après l'envoi, un SMS rectificatif part. Jamais de doublon
//  (table rappels_auto, clé = heure de convocation). Sans numéro vérifié : alerte au dossier. Tout est tracé.
//  Professionnels : GET/POST /api/workspace/convocations (réglages + convocations du lendemain).
import {ACTEUR,heureParis,decale} from './rappels-auto.mjs';
import {updateSpace} from './espace-patient.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const mask=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
export const REGLAGES_DEFAUT={decalageMinutes:60,heureEnvoi:16,lieu:'l’accueil des admissions de la clinique'};
export async function reglages(env){
 const row=await env.DB.prepare("SELECT data,updated_by,updated_at FROM app_settings WHERE key='convocations'").first();
 let d={};try{d=row?JSON.parse(row.data):{}}catch{}
 return {...REGLAGES_DEFAUT,...d,...(row?{modifiePar:row.updated_by,modifieLe:row.updated_at}:{})};
}
export function validerReglages(d={}){
 const decalageMinutes=Number(d.decalageMinutes),heureEnvoi=Number(d.heureEnvoi),lieu=String(d.lieu||'').trim();
 const errors=[];
 if(!Number.isInteger(decalageMinutes)||decalageMinutes<15||decalageMinutes>240)errors.push('Décalage entre 15 et 240 minutes.');
 if(!Number.isInteger(heureEnvoi)||heureEnvoi<8||heureEnvoi>20)errors.push('Heure d’envoi entre 8 h et 20 h.');
 if(lieu.length<3||lieu.length>120)errors.push('Lieu d’accueil : 3 à 120 caractères.');
 return {ok:!errors.length,errors,reglages:{decalageMinutes,heureEnvoi,lieu}};
}
// Horaires du programme : « AAAA-MM-JJTHH:MM », heure de Paris.
const moins=(local,min)=>{const d=new Date(local+':00Z');d.setUTCMinutes(d.getUTCMinutes()-min);return d.toISOString().slice(0,16)};
const hhmm=local=>local.slice(11,13)+' h '+local.slice(14,16);
const jourTexte=date=>new Date(date+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
export function convocationMessage(etab,{date,heure,lieu,rectificatif=false}){
 return (etab||'Clinique du Trocadéro')+' : '+(rectificatif?'MODIFICATION de votre convocation. ':'')+'vous êtes attendu(e) le '+jourTexte(date)+' à '+hhmm(heure)+' à '+lieu+'. Restez à jeun selon les consignes remises en consultation. En cas d’empêchement, appelez la clinique.';
}
const kindOf=r=>r.kind||(r.sector?.startsWith('bloc')?'room':r.sector?.startsWith('sspi')?'recovery':'bed');
// Premier passage au bloc de chaque séjour (réservations non annulées, salle de bloc ou vacation).
export async function passagesBloc(env){
 const res=(await docData(env,'management/reservations'))||[],rooms=new Set(((await docData(env,'management/planningResources'))||[]).filter(r=>kindOf(r)==='room').map(r=>r.id));
 const out=new Map();
 for(const r of Array.isArray(res)?res:[]){
  if(!r||['Annulée','Terminée'].includes(r.state)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(r.start||''))||!r.patient)continue;
  if(!r.vacationId&&!rooms.has(r.resource))continue;
  const start=r.start.slice(0,16),prev=out.get(r.patient);if(!prev||start<prev.start)out.set(r.patient,{stay:r.patient,start,procedure:r.procedure||''});
 }
 return [...out.values()];
}
const minutesParis=now=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),g=t=>Number(p.find(x=>x.type===t).value);return g('hour')*60+g('minute')};
async function tracer(env,stay,entry){return updateSpace(env,stay,ACTEUR,entry.rectificatif?'Convocation modifiée':'Convocation envoyée',data=>{const all=Array.isArray(data.rappelsAuto)?data.rappelsAuto:[];data.rappelsAuto=[...all.filter(e=>e.kind!=='convocation'),entry].slice(-30)})}

export async function tourneeConvocations(env,acl,{now=new Date(),origin=''}={}){
 const {jour}=heureParis(now),min=minutesParis(now),R=await reglages(env),demain=decale(jour,1),resultats=[];
 const veilleOuverte=min>=R.heureEnvoi*60&&min<21*60,jourOuvert=min>=6*60;
 for(const p of await passagesBloc(env)){
  const date=p.start.slice(0,10);
  if(!((date===demain&&veilleOuverte)||(date===jour&&jourOuvert)))continue;
  const heure=moins(p.start,R.decalageMinutes);
  if(date===jour&&heure.slice(11,16)<=String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'))continue;// trop tard pour prévenir
  try{resultats.push(await convoquer(env,acl,p,{date,heure,lieu:R.lieu}))}catch(e){console.error('convocation',p.stay,e?.message||e)}
 }
 return resultats;
}
async function convoquer(env,acl,p,{date,heure,lieu}){
 const stay=p.stay,key='stay/'+stay+'/espacePatient',ref=date+'|'+heure;
 // Historique des convocations du séjour (clé « date|heure#rang ») : on n'envoie que si la dernière tentative diffère.
 const sent=(await env.DB.prepare("SELECT date_ref,statut FROM rappels_auto WHERE stay_id=? AND kind='convocation' ORDER BY created_at,date_ref").bind(stay).all()).results||[];
 const base=r=>r.date_ref.split('#')[0],derniere=sent.at(-1);
 if(derniere&&base(derniere)===ref)return {stay,kind:'convocation',deja:true};
 const precedente=sent.filter(r=>r.statut==='envoye').at(-1),rectificatif=!!precedente&&base(precedente)!==ref;
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact,messaging=env.MESSAGING;
 const alerte=async raison=>{
  const prev=((await docData(env,key))?.rappelsAuto||[]).find(e=>e.kind==='convocation');
  if(prev&&!prev.ok&&prev.raison===raison&&prev.heure===heure)return {stay,kind:'convocation',alerte:raison};
  await acl.log('convocation',key,'denied','Convocation non envoyée',raison);
  await tracer(env,stay,{kind:'convocation',date,heure,at:new Date().toISOString(),ok:false,raison});
  return {stay,kind:'convocation',alerte:raison};
 };
 if(!contact?.phone)return alerte('Aucun numéro de portable vérifié : convocation par SMS impossible. Enregistrez-le dans « Questionnaire patient » ou prévenez le patient par téléphone.');
 if(!messaging?.channels?.sms)return alerte('Envoi de SMS non configuré sur ce serveur (Brevo).');
 const at=new Date().toISOString();
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO rappels_auto(stay_id,kind,date_ref,statut,created_at,updated_at) VALUES(?,'convocation',?,'en-cours',?,?)").bind(stay,ref+'#'+sent.length,at,at).run();
 if(!claim.meta.changes)return {stay,kind:'convocation',deja:true};
 let ok=false,detail;
 try{const id=await messaging.sms({to:contact.phone,content:convocationMessage(messaging.establishment,{date,heure,lieu,rectificatif}),tag:'iaselo-convocation'});ok=true;
  detail='SMS envoyé à '+mask(contact.phone)+' · arrivée '+hhmm(heure)+(rectificatif?' (au lieu de '+hhmm(base(precedente).split('|')[1])+')':'');
  await acl.log('convocation',key,'allowed',rectificatif?'Convocation modifiée envoyée':'Convocation envoyée',detail+(id?' · réf. Brevo '+id:''));
 }catch(e){detail=String(e.message||'Envoi impossible.').slice(0,200);await acl.log('convocation',key,'denied','Convocation non envoyée','Destinataire '+mask(contact.phone)+' · '+detail)}
 await env.DB.prepare('UPDATE rappels_auto SET statut=?,detail=?,updated_at=? WHERE stay_id=? AND kind=? AND date_ref=?').bind(ok?'envoye':'echec',detail,new Date().toISOString(),stay,'convocation',ref+'#'+sent.length).run();
 await tracer(env,stay,{kind:'convocation',date,heure,bloc:p.start,at:new Date().toISOString(),ok,rectificatif,...(ok?{detail}:{raison:detail})});
 return {stay,kind:'convocation',ok,rectificatif,heure,detail};
}

/* ---------------- Professionnels : réglages et suivi ---------------- */
const EDITEURS=['anesthesiste','secretariat'];
export async function staffConvocationsApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/convocations')return null;
 if(request.method==='POST'){
  if(!acl.isAdmin&&!EDITEURS.includes(acl.job))return json({error:'Réglage réservé aux anesthésistes, au secrétariat et à l’administrateur.'},403);
  const v=validerReglages(await body(request));if(!v.ok)return json({error:v.errors.join(' ')},400);
  const at=new Date().toISOString(),who=acl.profile.display_name||acl.profile.user_id;
  await env.DB.prepare("INSERT INTO app_settings(key,data,updated_by,updated_at) VALUES('convocations',?,?,?) ON CONFLICT (key) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(v.reglages),who,at).run();
  await acl.log('convocation-reglages','management/convocations','allowed','Réglages des convocations modifiés','Décalage '+v.reglages.decalageMinutes+' min · envoi à '+v.reglages.heureEnvoi+' h');
  return json({reglages:await reglages(env)});
 }
 if(request.method!=='GET')return json({error:'Méthode refusée.'},405);
 const R=await reglages(env),{jour}=heureParis(),date=/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date')||'')?url.searchParams.get('date'):decale(jour,1);
 const rows=[];
 for(const p of (await passagesBloc(env)).filter(p=>p.start.slice(0,10)===date&&acl.canRead('stay/'+p.stay+'/core'))){
  const e=((await docData(env,'stay/'+p.stay+'/espacePatient'))?.rappelsAuto||[]).find(x=>x.kind==='convocation'&&x.date===date)||null;
  rows.push({stay:p.stay,bloc:p.start,convocation:moins(p.start,R.decalageMinutes),envoi:e});
 }
 return json({reglages:R,date,convocations:rows.sort((a,b)=>a.bloc.localeCompare(b.bloc))});
}

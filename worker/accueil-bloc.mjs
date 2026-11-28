// IASELO · alertes du bloc en temps réel et accueil du patient le jour J (28/11/2026, 5e veille, lot 3).
// Règles : dist/alertes-bloc-regles.js. Le fil est calculé à partir du programme partagé (étapes horodatées) et des arrivées.
//  Professionnels :
//   GET  /api/workspace/alertes-bloc            alertes du jour qui me concernent (chirurgien de l'intervention, anesthésistes,
//                                               bloc, étage, accueil) ; le nom du patient n'apparaît que si je peux lire son séjour
//   GET  /api/workspace/arrivees?jour=          patients attendus au bloc ce jour-là, arrivée (heure, QR code ou accueil)
//   POST /api/workspace/arrivees                {action:'arrive'|'confirmer'|'annuler', stay}
//  Patient (QR code affiché à l'entrée, sans compte) :
//   POST /api/arrivee                           {nom, naissance} → arrivée notée si le patient est attendu aujourd'hui
//                                               (réponse identique sinon : rien n'est révélé) ; 8 essais par 10 min et par adresse.
// L'arrivée prévient l'accueil, l'étage et le bloc (fil d'alertes) et, si le patient l'a accepté, ses proches (SMS sans
// donnée médicale). L'accueil confirme ensuite l'identité (identitovigilance). Tout est tracé.
import AB from '../dist/alertes-bloc-regles.js';
import {informer} from './proches-chambre.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():'';
const validStay=s=>typeof s==='string'&&/^[^/]{1,80}$/.test(s);
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
async function body(request){const b=await request.arrayBuffer();if(b.byteLength>4000)throw Error('size');return JSON.parse(new TextDecoder().decode(b))}
export function paris(now=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),g=k=>p.find(x=>x.type===k).value;const jour=g('year')+'-'+g('month')+'-'+g('day');return {jour,local:jour+'T'+g('hour')+':'+g('minute')}}
const ACTEUR='iaselo-accueil',NOM='Accueil par QR code';
function systeme(env){const log=(action,target,result='allowed',reason='',detail='')=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),ACTEUR,action,target,result,reason,detail).run();return {job:'secretariat',canRead:()=>true,profile:{user_id:ACTEUR,display_name:NOM},log}}
const kindOf=r=>r.kind||(String(r.sector||'').startsWith('bloc')?'room':String(r.sector||'').startsWith('sspi')?'recovery':'bed');

// Patients attendus au bloc ce jour-là (première intervention de la journée par séjour).
async function attendus(env,jour){
 const res=(await docData(env,'management/reservations'))||[],resources=(await docData(env,'management/planningResources'))||[];
 const salles=new Map(resources.filter(r=>r&&kindOf(r)==='room').map(r=>[r.id,String(r.label||r.id).replace(/\s*\(démo[^)]*\)/i,'').trim()]));
 const vus=new Map();
 for(const r of (Array.isArray(res)?res:[]).filter(r=>r&&String(r.start||'').slice(0,10)===jour&&r.state!=='Annulée'&&r.patient&&!r.proposition&&salles.has(r.resource)).sort((a,b)=>String(a.start).localeCompare(String(b.start))))if(!vus.has(r.patient))vus.set(r.patient,{stay:r.patient,passage:String(r.start).slice(0,16),salle:salles.get(r.resource),chirurgien:t(r.surgeon)});
 return {liste:[...vus.values()],reservations:Array.isArray(res)?res:[],resources};
}
async function sejour(env,stay){const [core,sp,pre]=await Promise.all([docData(env,'stay/'+stay+'/core'),docData(env,'stay/'+stay+'/sortiePlus'),docData(env,'stay/'+stay+'/preadmission')]);const i=core?.identity||{};return {nom:[t(i.lastName).toUpperCase(),t(i.firstName)].filter(Boolean).join(' '),nomFamille:t(i.lastName),naissance:t(i.birthDate),chambre:t(sp?.chambre)||t(pre?.chambre)}}
const norm=s=>AB.norm(s).replace(/ /g,'');

async function enregistrerArrivee(env,acl,stay,jour,{source,now=new Date()}){
 const at=now.toISOString(),r=await env.DB.prepare('INSERT OR IGNORE INTO arrivees(stay_id,jour,at,source,par) VALUES(?,?,?,?,?)').bind(stay,jour,at,source,acl.profile?.display_name||NOM).run();
 if(!r.meta.changes)return {deja:true};
 await acl.log('arrivee','stay/'+stay+'/arrivee','allowed',source==='qr'?'Arrivée signalée par le patient (QR code de l’accueil)':'Arrivée notée par l’accueil','');
 const proches=await informer(env,acl,stay,'arrivee',{now}).catch(e=>({ok:false,raison:String(e?.message||e)}));
 return {ok:true,proches:proches?.ok?'Proches informés':''};
}

const essais=new Map();
function limite(ip,now=Date.now()){const l=(essais.get(ip)||[]).filter(x=>now-x<600000);l.push(now);essais.set(ip,l);if(essais.size>5000)essais.clear();return l.length>8}
export async function patientArriveeApi(request,env){
 const url=new URL(request.url);if(url.pathname!=='/api/arrivee')return null;
 if(request.method!=='POST')return json({error:'Service inconnu.'},404);
 if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
 const ip=String(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'local').split(',')[0].trim().slice(0,64);
 if(limite(ip))return json({error:'Trop d’essais. Présentez-vous à l’accueil.'},429);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const nom=norm(d.nom),naissance=t(d.naissance);
 const generique={ok:true,message:'Merci. Présentez-vous à l’accueil des admissions avec votre pièce d’identité.'};
 if(nom.length<2||!isDate(naissance))return json({error:'Indiquez votre nom et votre date de naissance.'},400);
 const {jour}=paris(),{liste}=await attendus(env,jour),acl=systeme(env);
 for(const p of liste){const s=await sejour(env,p.stay);if(s.naissance===naissance&&norm(s.nomFamille)===nom){
  await enregistrerArrivee(env,acl,p.stay,jour,{source:'qr'});return json({...generique,reconnu:true,message:'Merci, votre arrivée est enregistrée. Présentez-vous à l’accueil des admissions avec votre pièce d’identité.'})}}
 await acl.log('arrivee','arrivee','denied','Arrivée par QR code : patient non reconnu','');
 return json({...generique,reconnu:false});
}

export async function staffAccueilBlocApi(request,env,acl){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/workspace/alertes-bloc'){
  if(request.method!=='GET')return json({error:'Méthode non prise en charge.'},405);
  if(!['anesthesiste','chirurgien','infirmier','secretariat'].includes(acl.job)&&!acl.isAdmin)return json({alertes:[]});
  const {jour,local}=paris(),{liste,reservations,resources}=await attendus(env,jour);
  const sejours={};for(const p of liste)if(acl.canRead('stay/'+p.stay+'/core')){const s=await sejour(env,p.stay);sejours[p.stay]={nom:s.nom,chambre:s.chambre}}
  const arrivees=((await env.DB.prepare('SELECT stay_id,jour,at,source FROM arrivees WHERE jour=?').bind(jour).all()).results||[]).map(r=>({stay:r.stay_id,jour:r.jour,at:paris(new Date(r.at)).local,source:r.source}));
  const moi={job:acl.job,poste:acl.cadreEtage?'cadre-etage':acl.poste,nom:acl.profile?.display_name||'',isAdmin:acl.isAdmin};
  const alertes=AB.fil({reservations,resources,sejours,arrivees,jour,maintenant:local}).filter(a=>AB.pourMoi(a,moi)).slice(0,60).map(a=>({...a,patient:sejours[a.stay]?a.patient:'',stay:sejours[a.stay]?a.stay:'',notification:AB.notification(a)}));
  return json({jour,maintenant:local,alertes});
 }
 if(path!=='/api/workspace/arrivees')return null;
 const PEUT=['secretariat','infirmier','anesthesiste','chirurgien'];
 if(!PEUT.includes(acl.job)&&!acl.isAdmin)return json({error:'Réservé à l’accueil et aux soignants.'},403);
 if(request.method==='GET'){
  const jour=isDate(url.searchParams.get('jour'))?url.searchParams.get('jour'):paris().jour,{liste}=await attendus(env,jour);
  const rows=new Map(((await env.DB.prepare('SELECT * FROM arrivees WHERE jour=?').bind(jour).all()).results||[]).map(r=>[r.stay_id,r]));
  const patients=[];for(const p of liste){if(!acl.canRead('stay/'+p.stay+'/core'))continue;const s=await sejour(env,p.stay),a=rows.get(p.stay);
   patients.push({...p,nom:s.nom,chambre:s.chambre,arrivee:a?{at:a.at,source:a.source,par:a.par,confirmePar:a.confirme_par||'',confirmeAt:a.confirme_at||''}:null})}
  await acl.log('read','arrivees','allowed','Arrivées du '+jour,'');
  return json({jour,patients});
 }
 if(request.method!=='POST')return json({error:'Méthode non prise en charge.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const stay=d.stay,{jour}=paris();if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour hors habilitation.'},403);
 if(d.action==='arrive'){const r=await enregistrerArrivee(env,acl,stay,jour,{source:'accueil'});return json(r.deja?{ok:true,deja:true}:r)}
 if(d.action==='confirmer'){const r=await env.DB.prepare('UPDATE arrivees SET confirme_par=?,confirme_at=? WHERE stay_id=? AND jour=?').bind(acl.profile?.display_name||'',new Date().toISOString(),stay,jour).run();if(!r.meta.changes)return json({error:'Arrivée non enregistrée.'},409);await acl.log('arrivee','stay/'+stay+'/arrivee','allowed','Identité vérifiée à l’accueil','');return json({ok:true})}
 if(d.action==='annuler'){await env.DB.prepare('DELETE FROM arrivees WHERE stay_id=? AND jour=?').bind(stay,jour).run();await acl.log('arrivee','stay/'+stay+'/arrivee','allowed','Arrivée annulée (erreur)','');return json({ok:true})}
 return json({error:'Action inconnue.'},400);
}

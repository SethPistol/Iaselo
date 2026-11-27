// IASELO · appel du lendemain par agent vocal (27/11/2026, 4e veille, lot D). Règles : dist/appel-j1-regles.js.
// PAR DÉFAUT, le lendemain = SMS automatique avec le questionnaire J+1 (rappels-auto). L'appel vocal est une OPTION, ajoutée
// séjour par séjour par un soignant (table appels_j1_choix) ; sans ce choix, aucun appel n'est proposé à l'opérateur.
//  Professionnels (soignants) :
//   GET  /api/workspace/appel-j1?date=AAAA-MM-JJ   patients opérés ce jour-là (hier par défaut) : répondu ou à appeler, appels passés
//   POST /api/workspace/appel-j1                   {action:'choisir', stay, actif} (ajouter ou retirer l'appel)
//                                                  | {action:'simuler', stay, date, naissance, reponses} | {action:'sans-reponse', stay, date}
//  Opérateur vocal (à brancher ; signature HMAC comme l'accueil téléphonique, TELEPHONIE_SECRET ; absent = 404, simulation) :
//   POST /api/telephonie/j1/a-appeler   {date?} → appels à passer (numéro, prénom, script)
//   POST /api/telephonie/j1/resultat    {stay, date, naissance, reponses, joint}
// Les réponses comprises vont dans le questionnaire J+1 du séjour (espacePatient.suiviJ1, source « appel ») : les alertes
// arrivent au médecin comme celles du questionnaire. Identité vérifiée par la date de naissance avant toute question.
import A from '../dist/appel-j1-regles.js';
import R from '../dist/espace-patient-regles.js';
import {updateSpace} from './espace-patient.mjs';
import {signer,secretActif} from './telephonie.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():'';
const CLINIQUES=['anesthesiste','chirurgien','infirmier'];
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const mask=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const hier=(now=new Date())=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now),x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-1);return x.toISOString().slice(0,10)};
async function patients(env,date,peutLire=()=>true){
 const rows=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/consult' OR key LIKE 'stay/%/surgicalAnnouncement'").all()).results||[],sej=new Map();
 for(const r of rows){const m=/^stay\/([^/]{1,80})\/(consult|surgicalAnnouncement)$/.exec(r.key);if(!m)continue;if(!sej.has(m[1]))sej.set(m[1],{});try{sej.get(m[1])[m[2]]=JSON.parse(r.data)}catch{}}
 const out=[];
 for(const [stay,d] of sej){
  if(R.datePrevueSejour(d)!==date||!peutLire('stay/'+stay+'/core'))continue;
  const [esp,contact,core]=await Promise.all([docData(env,'stay/'+stay+'/espacePatient'),docData(env,'stay/'+stay+'/invitationContact'),docData(env,'stay/'+stay+'/core')]);
  const reps=(esp?.suiviJ1?.reponses||[]).filter(x=>x.date===date),appels=((await env.DB.prepare('SELECT * FROM appels_j1 WHERE stay_id=? AND date_ref=? ORDER BY at').bind(stay,date).all()).results||[]);
  const choix=await env.DB.prepare('SELECT actif,par,at FROM appels_j1_choix WHERE stay_id=?').bind(stay).first(),appelChoisi=!!choix?.actif;
  const joint=appels.some(a=>a.statut==='joint'),tentatives=appels.length,telephone=contact?.contact?.phone||'';
  const repondu=reps.some(x=>x.source!=='appel')?'questionnaire':joint?'appel':'';
  out.push({stay,prenom:t(core?.identity?.firstName),naissance:t(contact?.contact?.birthDate)||t(core?.identity?.birthDate),telephone,repondu,tentatives,
   appelChoisi,choixPar:choix?.actif?choix.par:'',
   aAppeler:appelChoisi&&!repondu&&!!telephone&&tentatives<A.MAX_TENTATIVES&&!appels.some(a=>a.statut==='a-rappeler-ide'),
   rappelInfirmier:appelChoisi&&!repondu&&(appels.some(a=>a.statut==='a-rappeler-ide')||tentatives>=A.MAX_TENTATIVES||!telephone),
   appels:appels.map(a=>({id:a.id,at:a.at,canal:a.canal,statut:a.statut,par:a.par,dit:JSON.parse(a.dit||'[]'),reponses:JSON.parse(a.reponses||'{}'),alertes:JSON.parse(a.alertes||'[]'),urgence:!!a.urgence}))});
 }
 return out;
}
export async function enregistrerAppel(env,acl,{stay,date,canal,naissance,reponses,joint=true}){
 const p=(await patients(env,date)).find(x=>x.stay===stay);if(!p)return {error:'Patient non opéré à cette date.',status:404};
 if(!p.appelChoisi)return {error:'L’appel du lendemain n’a pas été ajouté pour ce patient (il reçoit le SMS).',status:409};
 const id=crypto.randomUUID(),at=new Date().toISOString(),par=acl.profile?.display_name||canal;
 let r={statut:'sans-reponse',dit:[],compris:{},alertes:[],urgence:false,identite:false};
 if(joint)r=A.analyser({naissance,reponses:reponses||{}},{naissanceAttendue:p.naissance,etab:env.MESSAGING?.establishment||env.ESTABLISHMENT,prenom:p.prenom});
 await env.DB.prepare('INSERT INTO appels_j1(id,stay_id,date_ref,canal,statut,at,par,dit,reponses,alertes,urgence) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,stay,date,canal,r.statut,at,par,JSON.stringify(r.dit),JSON.stringify(r.compris),JSON.stringify(r.alertes),r.urgence?1:0).run();
 if(joint&&r.identite&&Object.keys(r.compris).length){
  const u=await updateSpace(env,stay,acl.profile?.user_id||'appel-j1','Appel du lendemain : réponses du patient',data=>{const s=data.suiviJ1=data.suiviJ1&&typeof data.suiviJ1==='object'?data.suiviJ1:{};s.reponses=[...(Array.isArray(s.reponses)?s.reponses:[]),{at,date,answers:r.compris,alerts:r.alertes,traite:null,source:'appel',canal}].slice(-20)});
  if(u.error)return u;
 }
 await acl.log('appel-j1','stay/'+stay+'/espacePatient',r.statut==='joint'?'allowed':'denied',{joint:'Appel J+1 : patient joint',['sans-reponse']:'Appel J+1 : pas de réponse',['a-rappeler-ide']:'Appel J+1 : rappel infirmier nécessaire'}[r.statut]+(canal==='simulation'?' (simulation)':''),
  (r.urgence?'Signe grave : 15 conseillé · ':'')+(r.alertes.length?r.alertes.map(a=>a.label).join(', '):'sans alerte'));
 return {ok:true,appel:{id,statut:r.statut,dit:r.dit,reponses:r.compris,alertes:r.alertes,urgence:r.urgence,identite:r.identite}};
}
async function corps(request){const b=await request.arrayBuffer();if(b.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(b))}
export async function staffAppelJ1Api(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/appel-j1')return null;
 if(!CLINIQUES.includes(acl.job)&&!acl.isAdmin)return json({error:'Réservé aux soignants.'},403);
 if(request.method==='GET'){
  const date=isDate(url.searchParams.get('date'))?url.searchParams.get('date'):hier();
  const liste=(await patients(env,date,k=>acl.canRead(k))).map(({naissance,telephone,...p})=>({...p,telephone:telephone?mask(telephone):''}));
  return json({mode:secretActif(env.INTEROP_ENV)?'operateur':'simulation',date,scenarios:A.SCENARIOS,script:A.script(env.MESSAGING?.establishment||'la clinique'),patients:liste});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await corps(request)}catch{return json({error:'Demande invalide.'},400)}
 const stay=t(d.stay),date=isDate(d.date)?d.date:hier();
 if(!/^[^/]{1,80}$/.test(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
 if(d.action==='choisir'){
  const actif=d.actif===true,at=new Date().toISOString(),par=acl.profile?.display_name||'soignant';
  await env.DB.prepare('INSERT INTO appels_j1_choix(stay_id,actif,par,at) VALUES(?,?,?,?) ON CONFLICT(stay_id) DO UPDATE SET actif=excluded.actif,par=excluded.par,at=excluded.at').bind(stay,actif?1:0,par,at).run();
  await acl.log('appel-j1','stay/'+stay+'/espacePatient','allowed',actif?'Appel du lendemain ajouté (en plus du SMS)':'Appel du lendemain retiré (SMS seul)');
  return json({ok:true,appelChoisi:actif});
 }
 if(!['simuler','sans-reponse'].includes(d.action))return json({error:'Action inconnue.'},400);
 const r=await enregistrerAppel(env,acl,{stay,date,canal:'simulation',naissance:t(d.naissance),reponses:d.reponses,joint:d.action==='simuler'});
 return json(r,r.error?r.status||400:200);
}
const egal=(a,b)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
export async function operateurAppelJ1Api(request,env){
 if(!secretActif(env))return json({error:'Non trouvé.'},404);
 const url=new URL(request.url),route=url.pathname.replace('/api/telephonie/j1/','');
 if(request.method!=='POST'||!['a-appeler','resultat'].includes(route))return json({error:'Non trouvé.'},404);
 const brut=await request.text();if(brut.length>20000)return json({error:'Trop volumineux.'},413);
 const ts=request.headers.get('X-Iaselo-Horodatage')||'',sig=(request.headers.get('X-Iaselo-Signature')||'').toLowerCase();
 const acl={profile:{user_id:'operateur-telephonie',display_name:'Agent vocal'},log:(action,target,result,reason,detail='')=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),'operateur-telephonie',action,target,result,reason,detail).run()};
 if(!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300||!egal(sig,await signer(env.TELEPHONIE_SECRET,ts,brut))){await acl.log('appel-j1','telephonie','denied','Signature absente, invalide ou périmée');return json({error:'Signature refusée.'},401)}
 let d;try{d=JSON.parse(brut||'{}')}catch{return json({error:'JSON attendu.'},400)}
 const date=isDate(d.date)?d.date:hier();
 if(route==='a-appeler'){
  const liste=(await patients(env,date)).filter(p=>p.aAppeler).map(p=>({stay:p.stay,date,numero:p.telephone,script:A.script(env.ESTABLISHMENT,p.prenom)}));
  await acl.log('appel-j1','telephonie','allowed','Liste des appels du lendemain remise à l’opérateur',liste.length+' appel(s)');return json({appels:liste});
 }
 const r=await enregistrerAppel(env,{...acl},{stay:t(d.stay),date,canal:'operateur',naissance:t(d.naissance),reponses:d.reponses,joint:d.joint!==false});
 return json(r.error?{error:r.error}:{statut:r.appel.statut,urgence:r.appel.urgence},r.error?r.status||400:200);
}

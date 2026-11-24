// IASELO · Annonces chirurgicales utiles au programme du bloc.
//  GET /api/workspace/annonces-bloc?date=AAAA-MM-JJ : annonces transmises pour ce jour, réduites aux champs de
//  programmation (geste, chirurgien, date, heure, durée, urgence, latéralité, mode). Sert aux profils qui lisent le
//  programme sans accès clinique au dossier (secrétariat) : le patient annoncé apparaît dans la vacation de son
//  chirurgien. Aucune donnée médicale (indication, notes pour l'anesthésie) n'est renvoyée. Lecture tracée.
import planningCore from '../dist/planning-core.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const LECTEURS=['anesthesiste','chirurgien','infirmier','secretariat'];
export async function staffAnnoncesBlocApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/annonces-bloc')return null;
 if(request.method!=='GET')return json({error:'Méthode refusée.'},405);
 if(!acl.isAdmin&&!LECTEURS.includes(acl.job))return json({error:'Programme du bloc hors habilitation.'},403);
 const date=url.searchParams.get('date')||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:'Date invalide.'},400);
 const rows=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/surgicalAnnouncement'").all()).results||[];
 const annonces=[];
 for(const row of rows){
  const id=/^stay\/([^/]{1,80})\/surgicalAnnouncement$/.exec(row.key)?.[1];if(!id||!acl.canRead('stay/'+id+'/core'))continue;
  let data;try{data=JSON.parse(row.data)}catch{continue}
  const a=planningCore.announcementOf({id,surgicalAnnouncement:data});
  if(a&&a.state==='Transmise'&&a.date===date)annonces.push(a);
 }
 await acl.log('read','management/annonces-bloc','allowed','Annonces du programme du bloc',date+' · '+annonces.length);
 return json({date,annonces});
}

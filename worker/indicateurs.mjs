// IASELO · indicateurs agrégés pour l'administration de la clinique.
//  GET /api/workspace/indicateurs?date=AAAA-MM-JJ : activité (séjours par étape, mode, spécialité, secteur) et
//  occupation (bloc du jour, SSPI et lits maintenant), calculés sur tous les séjours de l'établissement.
//  Réservé au profil Administration et à l'administrateur des habilitations. La réponse ne contient que des
//  nombres et des catégories (petits effectifs regroupés) : aucun nom, aucun numéro de séjour, aucune donnée
//  médicale. Chaque lecture est tracée dans le journal des accès.
import indicateurs from '../dist/indicateurs-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const TZ='Europe/Paris';
function maintenantLocal(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('fr-FR',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
const lire=row=>{try{return JSON.parse(row?.data||'null')}catch{return null}};
export async function staffIndicateursApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/indicateurs')return null;
 if(request.method!=='GET')return json({error:'Méthode refusée.'},405);
 if(!acl.active||!(acl.isAdmin||acl.job==='administration')){await acl.log('read','management/indicateurs','denied','Indicateurs réservés à l’administration');return json({error:'Indicateurs réservés à l’administration de la clinique.'},403)}
 const now=maintenantLocal(),date=url.searchParams.get('date')||now.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:'Date invalide.'},400);
 const cores=(await env.DB.prepare("SELECT data FROM workspace_documents WHERE key LIKE 'stay/%/core'").all()).results||[];
 const gestion=Object.fromEntries(((await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key IN ('management/reservations','management/planningResources','management/vacations')").all()).results||[]).map(r=>[r.key,lire(r)]));
 // Seuls les champs non identifiants du séjour entrent dans le calcul.
 const stays=cores.map(lire).filter(Boolean).map(s=>({stage:s.stage,mode:s.mode,specialty:s.specialty,sector:s.sector}));
 const result=indicateurs.calculer({stays,reservations:gestion['management/reservations']||[],resources:gestion['management/planningResources']||[],vacations:gestion['management/vacations']||[],date,now:date===now.slice(0,10)?now:date+'T12:00'});
 await acl.log('read','management/indicateurs','allowed','Indicateurs agrégés',date);
 return json(result);
}

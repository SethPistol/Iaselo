// IASELO · plannings de travail des infirmier(ère)s (26/11/2026, demande de Romain).
//  GET  /api/workspace/plannings-infirmiers?service=bloc&mois=2026-12             planning du mois
//  GET  /api/workspace/plannings-infirmiers?service=bloc&mois=2026-12&historique=1 versions (cadre, administrateur)
//  POST /api/workspace/plannings-infirmiers {action:'enregistrer', service, mois, version, planning, motif?}   cadre
//  POST /api/workspace/plannings-infirmiers {action:'valider', service, mois, version, motif?}                 cadre
//
// Droits, contrôlés ici et non par l'écran :
//  - les cadres (cadre de bloc, poste « cadre », et cadre d'étage, poste « cadre-etage ») préparent, modifient et valident
//    les plannings ; chacun peut gérer le planning de l'autre service (remplacement, demande de Romain du 26/11/2026) ;
//  - les infirmier(ère)s de bloc et d'étage lisent la dernière version VALIDÉE du planning de leur service, sans
//    jamais voir un brouillon ni pouvoir enregistrer ou valider ; l'administrateur lit (direction des soins) ;
//  - les autres métiers sont refusés.
// Traçabilité : chaque enregistrement et chaque validation sont copiés dans nurse_schedule_versions (table non modifiable)
// avec l'auteur, la date, le motif et l'empreinte SHA-256 ; une mise à jour exige la version lue (pas d'écrasement entre
// deux postes) ; un planning déjà validé ne se modifie qu'avec un motif ; une validation malgré des alertes exige un motif.
// Minimisation : le motif d'une absence de santé n'est montré qu'à la personne concernée et au cadre (vueCollegue).
import P from '../dist/plannings-infirmiers-regles.js';
import E from '../dist/effectifs-regles.js';
import {createHash} from 'node:crypto';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>400000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=text=>createHash('sha256').update(text).digest('hex');
const moisCourant=()=>new Date().toISOString().slice(0,7);
const STATUTS={brouillon:'Brouillon',valide:'Validé',modifie:'Modifié depuis la validation'};

export async function staffPlanningsInfirmiersApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/plannings-infirmiers')return null;
 const DB=env.DB,cadreBloc=acl.active&&acl.job==='infirmier'&&acl.poste==='cadre',cadre=cadreBloc||acl.active&&acl.cadreEtage===true,admin=acl.active&&acl.isAdmin,infirmier=acl.active&&acl.job==='infirmier';
 if(!cadre&&!admin&&!infirmier){await acl.log('read','plannings-infirmiers','denied','Plannings réservés aux infirmier(ère)s, au cadre et à l’administrateur');return json({error:'Plannings infirmiers : réservés aux infirmier(ère)s, au cadre et à l’administrateur.'},403)}
 // Services lisibles : le cadre et l'administrateur voient les deux ; une infirmière voit celui de son poste.
 const services=cadre?(cadreBloc?['bloc','etage']:['etage','bloc']):admin?['bloc','etage']:[acl.poste==='bloc'?'bloc':'etage'];
 const uid=acl.profile.user_id,gestion=cadre;
 const nomActeur=async()=>(await DB.prepare('SELECT display_name FROM professional_profiles WHERE user_id=?').bind(uid).first())?.display_name||uid;
 if(env.RECETTE===true)await semerRecette(DB).catch(e=>console.error('plannings_recette',e?.message||e));
 if(request.method==='GET'){
  const service=url.searchParams.get('service')||services[0],mois=url.searchParams.get('mois')||moisCourant();
  if(!services.includes(service)){await acl.log('read','plannings-infirmiers/'+service,'denied','Service hors habilitation');return json({error:'Ce planning ne relève pas de votre service.'},403)}
  if(!P.moisOk(mois))return json({error:'Mois invalide.'},400);
  const cible='plannings-infirmiers/'+service+'/'+mois,row=await DB.prepare('SELECT * FROM nurse_schedules WHERE service=? AND mois=?').bind(service,mois).first();
  if(url.searchParams.get('historique')){
   if(!gestion&&!admin)return json({error:'L’historique des versions est réservé au cadre et à l’administrateur.'},403);
   const versions=(await DB.prepare('SELECT version,action,statut,motif,alertes,data,hash,actor_name,at FROM nurse_schedule_versions WHERE service=? AND mois=? ORDER BY version DESC').bind(service,mois).all()).results;
   const out=versions.map((v,i)=>{const avant=versions.slice(i+1).find(x=>x.action!=='validation');return {version:Number(v.version),action:v.action,statut:v.statut,motif:v.motif,alertes:Number(v.alertes),hash:v.hash,par:v.actor_name,at:v.at,changements:v.action==='validation'?[]:P.differences(avant?JSON.parse(avant.data):{},JSON.parse(v.data),mois).slice(0,60)}});
   await acl.log('read',cible,'allowed','Historique du planning');return json({versions:out});
  }
  const base={service,mois,services,services_libelles:P.SERVICES,peutGerer:gestion,monId:uid};
  if(gestion||admin){
   const comptes=gestion?(await DB.prepare("SELECT user_id,display_name,poste FROM professional_profiles WHERE profession='infirmier' AND active=1 ORDER BY display_name").all()).results.map(r=>({userId:r.user_id,nom:r.display_name,poste:['cadre','cadre-etage','bloc'].includes(r.poste)?r.poste:'etage'})):[];
   await acl.log('read',cible,'allowed',gestion?'Planning (cadre)':'Planning (lecture administrateur)');
   // Bloc : besoins calculés à partir du programme (vacations ouvertes, interventions), comparés au planning.
   let programme=null;
   if(service==='bloc'){const lire=async k=>{try{return JSON.parse((await DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(k).first())?.data||'[]')}catch{return []}};
    const [vac,res]=await Promise.all([lire('management/vacations'),lire('management/reservations')]);
    programme={reglages:E.REGLAGES,besoins:E.besoins(Array.isArray(vac)?vac:[],Array.isArray(res)?res:[],P.joursDuMois(mois))}}
   return json({...base,comptes,programme,planning:row?{statut:row.statut,statutLibelle:STATUTS[row.statut],version:Number(row.version),hash:row.hash,miseAJour:row.updated_at,par:row.updated_by_name,valideLe:row.validated_at,validePar:row.validated_by_name,versionValidee:row.validated_version==null?null:Number(row.validated_version),...JSON.parse(row.data)}:null});
  }
  // Infirmier(ère) : dernière version validée seulement, jamais le brouillon en cours.
  const v=await DB.prepare("SELECT version,data,actor_name,at FROM nurse_schedule_versions WHERE service=? AND mois=? AND action='validation' ORDER BY version DESC LIMIT 1").bind(service,mois).first();
  await acl.log('read',cible,'allowed','Planning validé (lecture seule)');
  return json({...base,planning:v?{statut:'valide',statutLibelle:STATUTS.valide,version:Number(v.version),valideLe:v.at,validePar:v.actor_name,miseAJourEnCours:!!row&&row.statut!=='valide',...P.vueCollegue(P.normaliser(JSON.parse(v.data),mois),uid)}:null});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Requête illisible.'},400)}
 const action=String(d.action||''),service=String(d.service||''),mois=String(d.mois||''),cible='plannings-infirmiers/'+service+'/'+mois;
 if(!gestion){await acl.log('write',cible,'denied','Seuls les cadres préparent et valident les plannings');return json({error:'Seul un cadre (de bloc ou d’étage) peut modifier ou valider un planning. Vous le consultez en lecture seule.'},403)}
 if(!Object.hasOwn(P.SERVICES,service)||!P.moisOk(mois))return json({error:'Service ou mois invalide.'},400);
 const at=new Date().toISOString(),motif=String(d.motif||'').trim().slice(0,300),nom=await nomActeur();
 const row=await DB.prepare('SELECT * FROM nurse_schedules WHERE service=? AND mois=?').bind(service,mois).first();
 const conflit=()=>json({error:'Le planning a été modifié sur un autre poste : rechargez-le avant de continuer.'},409);
 if(row&&Number(d.version)!==Number(row.version))return conflit();
 if(!row&&d.version)return conflit();
 if(action==='enregistrer'){
  const v=P.valider(d.planning,mois);if(!v.ok)return json({error:v.errors.join(' '),errors:v.errors},400);
  const comptes=new Set((await DB.prepare("SELECT user_id FROM professional_profiles WHERE profession='infirmier'").all()).results.map(r=>r.user_id));
  if(v.planning.personnes.some(p=>p.userId&&!comptes.has(p.userId)))return json({error:'Une personne du planning n’a pas de compte infirmier(ère).'},400);
  const texte=P.canonique(v.planning),hash=sha(texte);
  if(row&&row.hash===hash)return json({error:'Aucune modification à enregistrer.'},400);
  if(row&&row.statut==='valide'&&motif.length<5)return json({error:'Ce planning est déjà validé : indiquez le motif de la modification (5 caractères au moins). Les infirmier(ère)s continuent de voir la version validée jusqu’à la nouvelle validation.'},400);
  const statut=!row?'brouillon':row.statut==='brouillon'?'brouillon':'modifie',version=row?Number(row.version)+1:1,n=P.alertes(v.planning,mois).length;
  const statements=[row
   ?DB.prepare('UPDATE nurse_schedules SET statut=?,version=?,data=?,hash=?,updated_at=?,updated_by=?,updated_by_name=? WHERE service=? AND mois=? AND version=?').bind(statut,version,texte,hash,at,uid,nom,service,mois,row.version)
   :DB.prepare('INSERT INTO nurse_schedules(service,mois,statut,version,data,hash,updated_at,updated_by,updated_by_name) VALUES(?,?,?,?,?,?,?,?,?)').bind(service,mois,statut,version,texte,hash,at,uid,nom),
   DB.prepare('INSERT INTO nurse_schedule_versions(service,mois,version,action,statut,motif,alertes,data,hash,actor,actor_name,at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(service,mois,version,row?'modification':'creation',statut,motif||(row?'':'Création'),n,texte,hash,uid,nom,at)];
  let out;try{out=await DB.batch(statements)}catch{return conflit()}
  if(row&&!out[0].meta.changes)return conflit();
  await acl.log('planning-enregistre',cible,'allowed','Version '+version+(n?' · '+n+' alerte(s)':''),motif);
  return json({ok:true,version,statut,statutLibelle:STATUTS[statut],alertes:n});
 }
 if(action==='valider'){
  if(!row)return json({error:'Enregistrez le planning avant de le valider.'},400);
  if(row.statut==='valide')return json({error:'Ce planning est déjà validé.'},400);
  const planning=P.normaliser(JSON.parse(row.data),mois),n=P.alertes(planning,mois).length;
  if(n&&motif.length<5)return json({error:n+' alerte(s) sur ce planning (repos, heures, jours d’affilée) : corrigez-les ou indiquez le motif de la validation (5 caractères au moins).',alertes:n},400);
  const version=Number(row.version)+1;
  const statements=[DB.prepare("UPDATE nurse_schedules SET statut='valide',version=?,validated_version=?,validated_at=?,validated_by_name=?,updated_at=?,updated_by=?,updated_by_name=? WHERE service=? AND mois=? AND version=?").bind(version,version,at,nom,at,uid,nom,service,mois,row.version),
   DB.prepare("INSERT INTO nurse_schedule_versions(service,mois,version,action,statut,motif,alertes,data,hash,actor,actor_name,at) VALUES(?,?,?,'validation','valide',?,?,?,?,?,?,?)").bind(service,mois,version,motif,n,row.data,row.hash,uid,nom,at)];
  let out;try{out=await DB.batch(statements)}catch{return conflit()}
  if(!out[0].meta.changes)return conflit();
  await acl.log('planning-valide',cible,'allowed','Version '+version+(n?' · validé malgré '+n+' alerte(s)':''),motif);
  return json({ok:true,version,statut:'valide',statutLibelle:STATUTS.valide,valideLe:at,validePar:nom});
 }
 return json({error:'Action inconnue.'},400);
}

// Recette seulement : plannings fictifs (mois en cours validé, mois suivant en brouillon) pour le bloc et l'étage, créés une
// seule fois quand aucun planning n'existe. Personnes fictives + comptes de test (cadre, infirmières). Jamais hors recette.
const FICTIFS={bloc:['Camille Fictif-Martin','Léa Fictif-Bernard','Hugo Fictif-Petit','Inès Fictif-Robert','Nora Fictif-Garnier','Théo Fictif-Faure'],etage:['Manon Fictif-Leroy','Julie Fictif-Moreau','Sarah Fictif-Girard','Lucas Fictif-Blanc','Emma Fictif-Roux','Chloé Fictif-Henry']};
const CYCLES={bloc:['J','J','R','J','J','R','R','J','R','R','G','R','R','A'],etage:['M','M','S','S','R','R','N','N','R','R','M','S','R','R']};
export function planningFictif(service,mois,comptes=[]){
 const personnes=[...comptes.filter(c=>service==='bloc'?['bloc','cadre'].includes(c.poste):['etage','cadre-etage'].includes(c.poste)).map((c,i)=>({id:'compte-'+(i+1),nom:c.nom,fonction:c.poste.startsWith('cadre')?'Cadre':service==='bloc'?'IBODE / IDE de bloc':'IDE',userId:c.userId})),
  ...FICTIFS[service].map((nom,i)=>({id:'demo-'+service+'-'+(i+1),nom,fonction:service==='bloc'?(i%2?'IADE':'IBODE'):(i===5?'Aide-soignant(e)':'IDE'),userId:null}))];
 const affectations={},cycle=CYCLES[service];
 personnes.forEach((p,i)=>{const ligne={};P.joursDuMois(mois).forEach((d,j)=>{
  if(p.fonction==='Cadre'){ligne[d]={code:P.weekEnd(d)?'R':'J',...(P.weekEnd(d)?{}:{debut:'08:30',fin:'17:00'})};return}
  ligne[d]={code:cycle[(j+i*3)%cycle.length]}});affectations[p.id]=ligne});
 // Quelques situations à montrer : congés, formation, arrêt maladie (visible « Absence » des collègues), horaire décalé.
 const jours=P.joursDuMois(mois),f=personnes.filter(p=>!p.userId);
 if(f[0])for(const d of jours.slice(9,14))affectations[f[0].id][d]={code:'CA'};
 if(f[1])affectations[f[1].id][jours[3]]={code:'F',note:'Formation AFGSU 2'};
 if(f[2])for(const d of jours.slice(16,19))affectations[f[2].id][d]={code:'MAL'};
 if(f[3])affectations[f[3].id][jours[20]]={code:service==='bloc'?'J':'M',debut:service==='bloc'?'10:00':'06:30',fin:service==='bloc'?'20:00':'14:30',note:'Horaire décalé'};
 return P.normaliser({personnes,affectations},mois);
}
async function semerRecette(DB){
 if(await DB.prepare('SELECT 1 AS x FROM nurse_schedules LIMIT 1').first())return;
 if(await DB.prepare('SELECT 1 AS x FROM nurse_schedule_versions LIMIT 1').first())return;
 const comptes=(await DB.prepare("SELECT u.email,p.user_id,p.display_name,p.poste FROM professional_profiles p JOIN auth_users u ON u.id=p.user_id WHERE u.email LIKE '%@iaselo.test' AND p.profession='infirmier'").all()).results.map(r=>({userId:r.user_id,nom:r.display_name,poste:r.poste,email:r.email}));
 const at=new Date().toISOString();
 const m0=moisCourant(),m1=P.moisVoisin(m0,1),statements=[];
 for(const service of ['bloc','etage'])for(const [mois,valide] of [[m0,true],[m1,false]]){
  const auteur=comptes.find(c=>c.poste===(service==='bloc'?'cadre':'cadre-etage'))||comptes.find(c=>c.poste==='cadre'),uid=auteur?.userId||'recette',nom=auteur?.nom||'Cadre (recette)';
  const planning=planningFictif(service,mois,comptes),texte=P.canonique(planning),hash=sha(texte);
  statements.push(DB.prepare('INSERT INTO nurse_schedules(service,mois,statut,version,data,hash,updated_at,updated_by,updated_by_name,validated_version,validated_at,validated_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(service,mois,valide?'valide':'brouillon',valide?2:1,texte,hash,at,uid,nom,valide?2:null,valide?at:null,valide?nom:null));
  statements.push(DB.prepare("INSERT INTO nurse_schedule_versions(service,mois,version,action,statut,motif,alertes,data,hash,actor,actor_name,at) VALUES(?,?,1,'creation','brouillon','Planning fictif de recette',?,?,?,?,?,?) ON CONFLICT DO NOTHING").bind(service,mois,P.alertes(planning,mois).length,texte,hash,uid,nom,at));
  if(valide)statements.push(DB.prepare("INSERT INTO nurse_schedule_versions(service,mois,version,action,statut,motif,alertes,data,hash,actor,actor_name,at) VALUES(?,?,2,'validation','valide','Planning fictif de recette',?,?,?,?,?,?) ON CONFLICT DO NOTHING").bind(service,mois,P.alertes(planning,mois).length,texte,hash,uid,nom,at));
 }
 await DB.batch(statements);
}

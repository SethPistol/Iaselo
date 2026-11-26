// IASELO · protocoles de prescription partagés (26/11/2026).
//  GET  /api/workspace/protocoles                       protocoles (en service ; l'administrateur voit aussi les retirés)
//  GET  /api/workspace/protocoles?id=<id>&historique=1  versions successives et reprises par les médecins
//  POST /api/workspace/protocoles {action:'enregistrer', id?, version?, protocole, motif}   administrateur
//  POST /api/workspace/protocoles {action:'retirer'|'remettre', id, version, motif}         administrateur
//  POST /api/workspace/protocoles {action:'reprendre', id, version, stay, cible}             médecin du séjour
//
// Traçabilité : chaque version est copiée dans prescription_protocol_versions (table non modifiable), avec l'auteur,
// la date, le motif et l'empreinte SHA-256 du contenu. Une mise à jour exige la version lue (pas d'écrasement
// silencieux entre deux postes). Chaque reprise par un médecin est enregistrée (protocole, version, séjour).
// Minimisation : un protocole ne contient aucune donnée patient ; les reprises ne gardent que le numéro de séjour.
import P from '../dist/protocoles-prescription-regles.js';
import {randomUUID,createHash} from 'node:crypto';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>200000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=text=>createHash('sha256').update(text).digest('hex');
const PRESCRIPTEURS=['anesthesiste','chirurgien'];
const CIBLES={preop:'prescriptionsPreop',postop:'rx',sortie:'discharge'};
const sortie=r=>({id:r.id,type:r.type,nom:r.nom,specialite:r.specialite,statut:r.statut,version:Number(r.version),hash:r.hash,miseAJour:r.updated_at,par:r.updated_by_name,creeLe:r.created_at,...JSON.parse(r.data)});

export async function staffProtocolesApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/protocoles')return null;
 const DB=env.DB,admin=acl.isAdmin&&acl.active,lecteur=admin||acl.active&&[...PRESCRIPTEURS,'pharmacien'].includes(acl.job);
 if(!lecteur){await acl.log('read','protocoles','denied','Protocoles réservés aux prescripteurs et à l’administrateur');return json({error:'Protocoles de prescription : réservés aux médecins prescripteurs, à la pharmacie et à l’administrateur.'},403)}
 const nomActeur=async()=>(await DB.prepare('SELECT display_name FROM professional_profiles WHERE user_id=?').bind(acl.profile.user_id).first())?.display_name||acl.profile.user_id;
 if(request.method==='GET'){
  const id=url.searchParams.get('id');
  if(id&&url.searchParams.get('historique')){
   const row=await DB.prepare('SELECT * FROM prescription_protocols WHERE id=?').bind(id).first();
   if(!row||(!admin&&row.statut!=='actif'))return json({error:'Protocole introuvable.'},404);
   const versions=(await DB.prepare('SELECT version,action,statut,motif,data,hash,actor_name,at FROM prescription_protocol_versions WHERE protocol_id=? ORDER BY version DESC').bind(id).all()).results.map(v=>({version:Number(v.version),action:v.action,statut:v.statut,motif:v.motif,hash:v.hash,par:v.actor_name,at:v.at,...JSON.parse(v.data)}));
   const reprises=admin?(await DB.prepare('SELECT version,cible,COUNT(*) AS n,MAX(at) AS dernier FROM prescription_protocol_uses WHERE protocol_id=? GROUP BY version,cible ORDER BY version DESC').bind(id).all()).results.map(r=>({version:Number(r.version),cible:r.cible,n:Number(r.n),dernier:r.dernier})):[];
   await acl.log('read','protocoles/'+id,'allowed','Historique du protocole');
   return json({protocole:sortie(row),versions,reprises});
  }
  const rows=(await DB.prepare(admin?'SELECT * FROM prescription_protocols ORDER BY type,nom':"SELECT * FROM prescription_protocols WHERE statut='actif' ORDER BY type,nom").all()).results;
  return json({protocoles:rows.map(sortie),peutGerer:admin,types:P.TYPES});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Requête illisible.'},400)}
 const action=String(d.action||''),at=new Date().toISOString();
 const refuse=async(message,cible='protocoles',status=403)=>{await acl.log('write',cible,'denied',message);return json({error:message},status)};

 if(action==='reprendre'){
  const stay=String(d.stay||''),row=await DB.prepare('SELECT * FROM prescription_protocols WHERE id=?').bind(String(d.id||'')).first();
  if(!PRESCRIPTEURS.includes(acl.job))return refuse('La reprise d’un protocole revient au médecin prescripteur.');
  if(!row||row.statut!=='actif')return refuse('Protocole introuvable ou retiré.','protocoles',404);
  const cible=CIBLES[row.type];if(!stay||!acl.canRead('stay/'+stay+'/'+cible))return refuse('Séjour hors habilitation.','stay/'+stay);
  if(Number(d.version)!==Number(row.version))return json({error:'Le protocole vient d’être mis à jour : rechargez-le avant de le reprendre.',protocole:sortie(row)},409);
  await DB.prepare('INSERT INTO prescription_protocol_uses(protocol_id,version,stay_id,cible,actor,actor_name,at) VALUES(?,?,?,?,?,?,?)').bind(row.id,row.version,stay,cible,acl.profile.user_id,await nomActeur(),at).run();
  await acl.log('protocole-repris','stay/'+stay+'/'+cible,'allowed',row.nom+' · version '+row.version,row.id);
  return json({ok:true,protocole:sortie(row)});
 }

 if(!admin)return refuse('La gestion des protocoles de prescription est réservée à l’administrateur.');
 const motif=String(d.motif||'').trim().slice(0,300);
 const ecrire=async(row,action,statut,protocole)=>{
  const data=JSON.stringify({description:protocole.description,contenu:protocole.contenu}),hash=sha(P.canonique(protocole)),nom=await nomActeur();
  const version=row?Number(row.version)+1:1,id=row?.id||randomUUID();
  const statements=[row
   ?DB.prepare('UPDATE prescription_protocols SET type=?,nom=?,specialite=?,statut=?,version=?,data=?,hash=?,updated_at=?,updated_by=?,updated_by_name=? WHERE id=? AND version=?').bind(protocole.type,protocole.nom,protocole.specialite,statut,version,data,hash,at,acl.profile.user_id,nom,id,row.version)
   :DB.prepare('INSERT INTO prescription_protocols(id,type,nom,specialite,statut,version,data,hash,created_at,created_by,updated_at,updated_by,updated_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,protocole.type,protocole.nom,protocole.specialite,statut,version,data,hash,at,acl.profile.user_id,at,acl.profile.user_id,nom),
   DB.prepare('INSERT INTO prescription_protocol_versions(protocol_id,version,action,statut,motif,data,hash,actor,actor_name,at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,version,action,statut,motif||(action==='creation'?'Création':''),JSON.stringify({nom:protocole.nom,type:protocole.type,specialite:protocole.specialite,description:protocole.description,contenu:protocole.contenu}),hash,acl.profile.user_id,nom,at)];
  let out;try{out=await DB.batch(statements)}catch{return json({error:'Le protocole a été modifié sur un autre poste : rechargez-le.'},409)}
  if(row&&!out[0].meta.changes)return json({error:'Le protocole a été modifié sur un autre poste : rechargez-le.'},409);
  await acl.log('protocole-'+action,'protocoles/'+id,'allowed',protocole.nom+' · version '+version,motif);
  return json({ok:true,protocole:sortie(await DB.prepare('SELECT * FROM prescription_protocols WHERE id=?').bind(id).first())});
 };
 if(action==='enregistrer'){
  const row=d.id?await DB.prepare('SELECT * FROM prescription_protocols WHERE id=?').bind(String(d.id)).first():null;
  if(d.id&&!row)return refuse('Protocole introuvable.','protocoles',404);
  if(row&&Number(d.version)!==Number(row.version))return json({error:'Le protocole a été modifié sur un autre poste : rechargez-le avant de l’enregistrer.',protocole:sortie(row)},409);
  const v=P.valider(d.protocole,{modification:!!row,motif});if(!v.ok)return json({error:v.errors.join(' '),errors:v.errors},400);
  if(row&&row.type!==v.protocole.type)return json({error:'Le type d’un protocole ne change pas : créez un nouveau protocole.'},400);
  if(row&&sha(P.canonique(v.protocole))===row.hash)return json({error:'Aucune modification à enregistrer.'},400);
  return ecrire(row,row?'modification':'creation',row?.statut||'actif',v.protocole);
 }
 if(action==='retirer'||action==='remettre'){
  const row=await DB.prepare('SELECT * FROM prescription_protocols WHERE id=?').bind(String(d.id||'')).first();
  if(!row)return refuse('Protocole introuvable.','protocoles',404);
  if(Number(d.version)!==Number(row.version))return json({error:'Le protocole a été modifié sur un autre poste : rechargez-le.'},409);
  if(motif.length<5)return json({error:'Indiquez le motif (5 caractères au moins) : il est conservé dans l’historique.'},400);
  const statut=action==='retirer'?'archive':'actif';if(row.statut===statut)return json({error:action==='retirer'?'Protocole déjà retiré.':'Protocole déjà en service.'},400);
  const p=JSON.parse(row.data);
  return ecrire(row,action==='retirer'?'retrait':'remise-en-service',statut,P.normaliser({nom:row.nom,type:row.type,specialite:row.specialite,description:p.description,contenu:p.contenu}));
 }
 return json({error:'Action inconnue.'},400);
}

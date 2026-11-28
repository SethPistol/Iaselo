// IASELO · ordonnance numérique de sortie EN SIMULATION (28/11/2026, 5e veille, lot 5). Règles : dist/ordonnance-numerique-regles.js.
//  GET  /api/workspace/ordonnance-numerique?stay=   ordonnances numériques du séjour (versions, statut, événements)
//  GET  /api/workspace/ordonnance-numerique?id=     lecture par identifiant (QR code), pour la pharmacie (simulation)
//  POST /api/workspace/ordonnance-numerique         {action:'deposer', stay, items, prescripteur}  (médecins)
//                                                   {action:'delivrer', id, lignes:[index…], officine}  (simulation d'officine)
//                                                   {action:'annuler', id, motif}                       (médecins)
// Le contenu déposé est figé (empreinte SHA-256) : une ordonnance modifiée doit être déposée de nouveau (nouvel identifiant),
// l'ancienne est annulée. Aucun envoi à l'Assurance maladie tant que le service n'est pas ouvert aux établissements.
import O from '../dist/ordonnance-numerique-regles.js';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():'';
const validStay=s=>typeof s==='string'&&/^[^/]{1,80}$/.test(s);
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
async function body(request){const b=await request.arrayBuffer();if(b.byteLength>60000)throw Error('size');return JSON.parse(new TextDecoder().decode(b))}
const MEDECINS=['anesthesiste','chirurgien'],LECTURE=['anesthesiste','chirurgien','infirmier','pharmacien'];
const vue=r=>{const ev=JSON.parse(r.evenements||'[]'),c=JSON.parse(r.contenu||'{}');const s=O.statut(ev);return {id:r.id,stay:r.stay_id,creee:r.created_at,par:r.par,empreinte:r.empreinte,statut:s,libelle:O.LIBELLES[s],lignes:c.lignes||[],prescripteur:c.prescripteur||{},evenements:ev,simulation:true}};
export async function staffOrdonnanceNumeriqueApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/ordonnance-numerique')return null;
 if(!LECTURE.includes(acl.job)&&!acl.isAdmin)return json({error:'Réservé aux médecins, infirmiers et pharmaciens.'},403);
 const qui=acl.profile?.display_name||acl.job;
 if(request.method==='GET'){
  const id=t(url.searchParams.get('id')),stay=url.searchParams.get('stay');
  if(id){if(!O.valide(id))return json({error:'Identifiant d’ordonnance invalide.'},400);const r=await env.DB.prepare('SELECT * FROM ordonnances_numeriques WHERE id=?').bind(id).first();if(!r||!acl.canRead('stay/'+r.stay_id+'/core'))return json({error:'Ordonnance introuvable.'},404);await acl.log('read','ordonnance-numerique/'+id,'allowed','Lecture par identifiant (QR code)',r.stay_id);return json({ordonnance:vue(r)})}
  if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour hors habilitation.'},403);
  const rows=(await env.DB.prepare('SELECT * FROM ordonnances_numeriques WHERE stay_id=? ORDER BY created_at DESC').bind(stay).all()).results||[];
  return json({simulation:true,ordonnances:rows.map(vue)});
 }
 if(request.method!=='POST')return json({error:'Méthode non prise en charge.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const at=new Date().toISOString();
 if(d.action==='deposer'){
  if(!MEDECINS.includes(acl.job))return json({error:'Dépôt réservé aux médecins.'},403);
  if(!validStay(d.stay)||!acl.canRead('stay/'+d.stay+'/core'))return json({error:'Séjour hors habilitation.'},403);
  const v=O.verifier({items:d.items,prescripteur:d.prescripteur});if(!v.ok)return json({error:v.erreurs.join(' ')},400);
  const prescripteur={nom:t(d.prescripteur.nom).slice(0,120),rpps:t(d.prescripteur.rpps),specialite:t(d.prescripteur.specialite).slice(0,80)};
  const empreinte=await sha(O.canonique(v.lignes)+'|'+JSON.stringify(prescripteur));
  // Même contenu déjà déposé et actif : on le renvoie (pas de doublon).
  const actives=((await env.DB.prepare('SELECT * FROM ordonnances_numeriques WHERE stay_id=?').bind(d.stay).all()).results||[]).map(vue).filter(o=>o.statut!=='annulee');
  const meme=actives.find(o=>o.empreinte===empreinte);if(meme)return json({ordonnance:meme,deja:true});
  // Une version précédente encore active est annulée (remplacée), sauf si elle a déjà été délivrée.
  for(const o of actives){if(o.statut==='deposee'){const ev=[...o.evenements,{type:'annulation',at,par:qui,motif:'Remplacée par une nouvelle version'}];await env.DB.prepare('UPDATE ordonnances_numeriques SET evenements=? WHERE id=?').bind(JSON.stringify(ev),o.id).run()}}
  const id=O.identifiant(crypto.getRandomValues(new Uint8Array(15)));
  const ev=[{type:'depot',at,par:qui,lignes:v.lignes.length,simulation:true}];
  await env.DB.prepare('INSERT INTO ordonnances_numeriques(id,stay_id,created_at,par,empreinte,contenu,evenements) VALUES(?,?,?,?,?,?,?)').bind(id,d.stay,at,qui,empreinte,JSON.stringify({lignes:v.lignes,prescripteur}),JSON.stringify(ev)).run();
  await acl.log('ordonnance-numerique','stay/'+d.stay+'/ordonnance-numerique','allowed','Ordonnance numérique déposée (simulation) '+id,'');
  return json({ordonnance:vue(await env.DB.prepare('SELECT * FROM ordonnances_numeriques WHERE id=?').bind(id).first())});
 }
 const r=O.valide(d.id)?await env.DB.prepare('SELECT * FROM ordonnances_numeriques WHERE id=?').bind(d.id).first():null;
 if(!r||!acl.canRead('stay/'+r.stay_id+'/core'))return json({error:'Ordonnance introuvable.'},404);
 const o=vue(r);
 if(d.action==='delivrer'){
  if(!['pharmacien',...MEDECINS].includes(acl.job))return json({error:'Simulation de délivrance réservée à la pharmacie et aux médecins.'},403);
  if(!['deposee','delivree-partielle'].includes(o.statut))return json({error:'Ordonnance '+o.libelle.toLowerCase()+' : délivrance impossible.'},409);
  const idx=[...new Set((Array.isArray(d.lignes)?d.lignes:[]).map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<o.lignes.length))];if(!idx.length)return json({error:'Choisissez les lignes délivrées.'},400);
  const ev=[...o.evenements,{type:'delivrance',at,par:qui,officine:t(d.officine).slice(0,120)||'Officine (simulation)',lignes:idx,simulation:true}];
  await env.DB.prepare('UPDATE ordonnances_numeriques SET evenements=? WHERE id=?').bind(JSON.stringify(ev),o.id).run();
  await acl.log('ordonnance-numerique','stay/'+o.stay+'/ordonnance-numerique','allowed','Délivrance simulée '+o.id,idx.join(','));
  return json({ordonnance:vue({...r,evenements:JSON.stringify(ev)})});
 }
 if(d.action==='annuler'){
  if(!MEDECINS.includes(acl.job))return json({error:'Annulation réservée aux médecins.'},403);
  if(o.statut==='annulee')return json({error:'Déjà annulée.'},409);if(o.statut==='delivree')return json({error:'Ordonnance déjà délivrée : annulation impossible.'},409);
  const motif=t(d.motif);if(motif.length<3)return json({error:'Indiquez le motif de l’annulation.'},400);
  const ev=[...o.evenements,{type:'annulation',at,par:qui,motif:motif.slice(0,200)}];
  await env.DB.prepare('UPDATE ordonnances_numeriques SET evenements=? WHERE id=?').bind(JSON.stringify(ev),o.id).run();
  await acl.log('ordonnance-numerique','stay/'+o.stay+'/ordonnance-numerique','allowed','Ordonnance numérique annulée '+o.id,motif);
  return json({ordonnance:vue({...r,evenements:JSON.stringify(ev)})});
 }
 return json({error:'Action inconnue.'},400);
}

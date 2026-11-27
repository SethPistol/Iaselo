// IASELO · rédaction assistée (27/11/2026, manque n°1 de la 3e veille) derrière une interface de moteur interchangeable.
//  GET  /api/workspace/redaction?stay=     moteur actif, propositions du séjour (historique)
//  POST /api/workspace/redaction           {action:'generer',stay,type} | {action:'decider',stay,id,decision,texte}
// Moteurs :
//  - « gabarit » (par défaut) : brouillon par règles à partir du dossier, sur le serveur, aucune donnée ne sort ;
//  - « compatible » : modèle génératif exposant une API de type chat/completions, activé seulement si
//    IA_MOTEUR=compatible, IA_URL (https), IA_CLE, IA_MODELE et IA_HDS=oui (hébergeur certifié HDS attesté par l'exploitant).
//    Le modèle reçoit un contexte pseudonymisé (âge, sexe, éléments médicaux ; jamais nom, date de naissance ni identifiant).
//    En cas d'échec du modèle, le brouillon par règles est proposé et l'échec est signalé.
// Chaque proposition est conservée (rubrique redactionIa, écrite par le serveur) avec le moteur, l'auteur, la décision
// (acceptée après relecture ou rejetée) et le texte final : traçabilité attendue par l'AI Act. Rien n'est appliqué sans validation.
import X from '../dist/redaction-ia-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():v===undefined||v===null?'':String(v).trim();
const validStay=s=>/^[^/]{1,80}$/.test(String(s||''));
const JOBS=['anesthesiste','chirurgien','infirmier'];
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}

/* ---------------- Moteurs ---------------- */
const gabarit={id:'gabarit',label:'Rédaction par règles (sur le serveur IASELO, aucune donnée transmise)',local:true,async rediger(type,ctx){return X.gabarit(type,ctx)}};
export function moteurCompatible(ienv,{recette=false,fetcher=globalThis.fetch}={}){
 const url=t(ienv.IA_URL),cle=t(ienv.IA_CLE),modele=t(ienv.IA_MODELE);
 if(t(ienv.IA_MOTEUR)!=='compatible')return {erreur:''};
 let u;try{u=new URL(url)}catch{return {erreur:'IA_URL invalide.'}}
 if(!(u.protocol==='https:'||(recette&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))return {erreur:'IA_URL doit être en https.'};
 if(!cle||!modele)return {erreur:'IA_CLE et IA_MODELE sont requis.'};
 if(t(ienv.IA_HDS)!=='oui')return {erreur:'Hébergement HDS du modèle non attesté (IA_HDS=oui).'};
 return {moteur:{id:'compatible',label:'Modèle génératif '+modele+' ('+u.host+', hébergement HDS attesté)',local:false,
  async rediger(type,ctx){
   const r=await fetcher(u.toString(),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cle},signal:AbortSignal.timeout(60000),redirect:'error',
    body:JSON.stringify({model:modele,temperature:0.2,max_tokens:1800,messages:[{role:'system',content:X.consignes(type)},{role:'user',content:'Contexte du séjour (JSON, pseudonymisé) :\n'+JSON.stringify(ctx)}]})});
   if(!r.ok)throw Error('Modèle indisponible (HTTP '+r.status+').');
   const d=await r.json(),texte=t(d?.choices?.[0]?.message?.content);
   if(!texte)throw Error('Réponse du modèle vide.');
   return {texte:texte.startsWith(X.AVERT)?texte:X.AVERT+'\n\n'+texte,manquants:[]};
  }}};
}
export function moteurActif(env){const c=moteurCompatible(env.INTEROP_ENV||{},{recette:env.RECETTE===true,fetcher:env.FETCH});return {moteur:c.moteur||gabarit,avertissement:c.erreur||''}}

/* ---------------- Dossier ---------------- */
async function dossier(env,stay){
 const mods=['core','consult','surgicalAnnouncement','discharge','postopVitals','parcoursSuivi','espacePatient'];
 const vals=await Promise.all(mods.map(m=>docData(env,'stay/'+stay+'/'+m)));const d=Object.fromEntries(mods.map((m,i)=>[m,vals[i]]));
 const resas=(await docData(env,'management/reservations'))||[];
 d.reservation=(Array.isArray(resas)?resas:[]).filter(r=>r.patient===stay&&!r.kind&&r.state!=='Annulée').sort((a,b)=>String(a.start).localeCompare(String(b.start))).at(-1)||null;
 return d;
}
const key=stay=>'stay/'+stay+'/redactionIa';
async function update(env,stay,actor,reason,mutate){
 for(let attempt=0;attempt<4;attempt++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key(stay)).first();
  const data={propositions:[],...(row?JSON.parse(row.data):{})};const out=mutate(data);if(out?.error)return out;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,key(stay),row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(key(stay),payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...out};
 }
 return {error:'Modification concurrente, réessayez.',status:409};
}

export async function staffRedactionApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/redaction')return null;
 if(!JOBS.includes(acl.job))return json({error:'Rédaction assistée réservée aux médecins et infirmier(ère)s.'},403);
 const {moteur,avertissement}=moteurActif(env),types=Object.fromEntries(Object.entries(X.TYPES).map(([k,v])=>[k,{label:v.label,autorise:v.metiers.includes(acl.job)}]));
 if(request.method==='GET'){
  const stay=url.searchParams.get('stay')||'';if(!validStay(stay)||!acl.canRead('stay/'+stay+'/consult'))return json({error:'Accès refusé.'},403);
  return json({moteur:{id:moteur.id,label:moteur.label,local:moteur.local},avertissement,types,propositions:((await docData(env,key(stay)))?.propositions)||[]});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=JSON.parse(new TextDecoder().decode(await request.arrayBuffer()))}catch{return json({error:'Demande invalide.'},400)}
 const stay=t(d.stay),who=acl.profile.display_name||'Professionnel',at=new Date().toISOString();
 if(!validStay(stay)||!acl.canRead('stay/'+stay+'/consult'))return json({error:'Accès refusé.'},403);
 if(d.action==='generer'){
  const type=t(d.type);if(!X.TYPES[type])return json({error:'Type de document inconnu.'},400);
  if(!X.TYPES[type].metiers.includes(acl.job))return json({error:'Ce document n’est pas rédigé par votre métier.'},403);
  const ctx=X.contexte(await dossier(env,stay));let res,utilise=moteur,echec='';
  try{res=await moteur.rediger(type,ctx)}catch(e){echec=String(e?.message||e).slice(0,200);utilise=gabarit;res=await gabarit.rediger(type,ctx)}
  const p={id:crypto.randomUUID(),type,label:X.TYPES[type].label,moteur:utilise.id,moteurLabel:utilise.label,at,par:who,texte:res.texte,manquants:res.manquants,statut:'proposee',...(echec?{echecModele:echec}:{})};
  const r=await update(env,stay,acl.profile.user_id,'Proposition de rédaction assistée',x=>{x.propositions=[...x.propositions,p].slice(-50)});if(r.error)return json({error:r.error},r.status||409);
  await acl.log('redaction-ia-proposition',key(stay),'allowed',X.TYPES[type].label+' proposé',utilise.id+(echec?' (repli : '+echec+')':''));
  return json({proposition:p,avertissement:echec?'Le modèle génératif n’a pas répondu ('+echec+') : brouillon par règles proposé.':avertissement});
 }
 if(d.action==='decider'){
  const decision=t(d.decision);if(!['acceptee','rejetee'].includes(decision))return json({error:'Décision invalide.'},400);
  const texte=t(d.texte).slice(0,20000);if(decision==='acceptee'&&texte.length<10)return json({error:'Texte relu manquant.'},400);
  const r=await update(env,stay,acl.profile.user_id,'Décision sur une rédaction assistée',x=>{
   const p=x.propositions.find(y=>y.id===t(d.id));if(!p)return {error:'Proposition introuvable.',status:404};if(p.statut!=='proposee')return {error:'Décision déjà prise.',status:409};
   if(!X.TYPES[p.type].metiers.includes(acl.job))return {error:'Ce document n’est pas validé par votre métier.',status:403};
   p.statut=decision;p.decidePar=who;p.decideLe=at;if(decision==='acceptee'){p.texteFinal=texte;p.modifie=texte!==p.texte}
  });
  if(r.error)return json({error:r.error},r.status||409);
  const p=r.data.propositions.find(y=>y.id===t(d.id));
  await acl.log('redaction-ia-decision',key(stay),'allowed',p.label+' '+(decision==='acceptee'?'accepté':'rejeté'),decision==='acceptee'?(p.modifie?'texte modifié avant validation':'texte accepté sans modification'):'');
  return json({proposition:p});
 }
 return json({error:'Action inconnue.'},400);
}

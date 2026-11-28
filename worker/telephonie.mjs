// IASELO · accueil téléphonique par IA (27/11/2026). Règles : dist/accueil-telephonique-regles.js.
//  Opérateur (agent vocal, à brancher) :
//   POST /api/telephonie/appel   {appel, numero, transcription}  → {dire, transfert, orientation}
//        En-têtes X-Iaselo-Horodatage (secondes) et X-Iaselo-Signature = HMAC-SHA256(horodatage + '.' + corps, TELEPHONIE_SECRET), hex.
//        Sans TELEPHONIE_SECRET (32 caractères au moins) la route n'existe pas (404) : mode simulation.
//  Professionnels (secrétariat, accueil, soignants, administrateur) :
//   GET  /api/workspace/telephonie                 appels des 7 derniers jours (numéro masqué), mode, heures d'ouverture
//   GET  /api/workspace/telephonie?appel=<id>      un appel, numéro complet pour rappeler (lecture tracée)
//   POST /api/workspace/telephonie                 {action:'simuler', numero, texte} | {action:'traiter', id, note}
// Aucune information personnelle n'est donnée à l'appelant (identité non vérifiée au téléphone). Tout est tracé.
import T from '../dist/accueil-telephonique-regles.js';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim():'';
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const secretActif=env=>typeof env?.TELEPHONIE_SECRET==='string'&&env.TELEPHONIE_SECRET.length>=32;
export async function signer(secret,horodatage,corps){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(horodatage+'.'+corps)))}
const egal=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const journal=(env,actor,result,reason,detail='')=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,'telephonie','telephonie',?,?,?)").bind(new Date().toISOString(),actor,result,reason,detail).run();

async function enregistrer(env,{canal,numero,transcription,appelOperateur=null}){
 const a=T.analyser(transcription),id=crypto.randomUUID(),at=new Date().toISOString();
 const statut=a.transfert?'transfere':'a-rappeler';
 await env.DB.prepare('INSERT INTO telephonie_appels(id,recu_at,canal,numero,transcription,intention,libelle,orientation,priorite,reponse,transfert,statut,appel_operateur) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,at,canal,numero,a.texte,a.intention,a.libelle,a.orientation,a.priorite,a.reponse,a.transfert?1:0,statut,appelOperateur).run();
 return {id,recuAt:at,...a,statut};
}
const vue=r=>({id:r.id,recuAt:r.recu_at,canal:r.canal,numero:T.masquer(r.numero),transcription:r.transcription,intention:r.intention,libelle:r.libelle,orientation:r.orientation,
 service:T.ORIENTATIONS[r.orientation]||r.orientation,priorite:r.priorite,reponse:r.reponse,transfert:!!r.transfert,statut:r.statut,traitePar:r.traite_par||'',traiteAt:r.traite_at||'',note:r.note||''});

// Route de l'opérateur (avant l'authentification professionnelle).
export async function operateurTelephonieApi(request,env){
 if(!secretActif(env))return json({error:'Non trouvé.'},404);
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const corps=await request.text();if(corps.length>20000)return json({error:'Trop volumineux.'},413);
 const ts=request.headers.get('X-Iaselo-Horodatage')||'',sig=(request.headers.get('X-Iaselo-Signature')||'').toLowerCase();
 if(!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300||!egal(sig,await signer(env.TELEPHONIE_SECRET,ts,corps))){await journal(env,'operateur-telephonie','denied','Signature absente, invalide ou périmée');return json({error:'Signature refusée.'},401)}
 let d;try{d=JSON.parse(corps)}catch{return json({error:'JSON attendu.'},400)}
 const numero=T.normaliserNumero(d.numero)||'inconnu',texte=t(d.transcription),appel=t(d.appel).slice(0,120)||null;
 if(!texte)return json({dire:T.accueil(env.ESTABLISHMENT),transfert:false});
 if(appel){const deja=await env.DB.prepare('SELECT * FROM telephonie_appels WHERE appel_operateur=?').bind(appel).first();if(deja)return json({dire:deja.reponse,transfert:!!deja.transfert,orientation:deja.orientation,id:deja.id})}
 const r=await enregistrer(env,{canal:'operateur',numero,transcription:texte,appelOperateur:appel});
 await journal(env,'operateur-telephonie','allowed','Appel reçu',r.intention);
 return json({dire:r.reponse,transfert:r.transfert,orientation:r.orientation,id:r.id});
}

export const LECTEURS_APPELS=['secretariat','administration'];
export async function staffTelephonieApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/telephonie')return null;
 // Audit du 27/11 : les appels (transcription, numéro complet) sont lus par le secrétariat, l'administration et
 // l'administrateur seulement, comme le menu ; auparavant tout profil (pharmacie, DIM, facturation…) y avait accès.
 if(!acl.isAdmin&&!LECTEURS_APPELS.includes(acl.job)){await acl.log('read','telephonie','denied','Accueil téléphonique hors habilitation');return json({error:'Accueil téléphonique réservé au secrétariat et à l’administration.'},403)}
 if(request.method==='GET'){
  const id=url.searchParams.get('appel');
  if(id){const r=await env.DB.prepare('SELECT * FROM telephonie_appels WHERE id=?').bind(id).first();if(!r)return json({error:'Appel introuvable.'},404);
   await acl.log('read','telephonie/'+id,'allowed','Numéro affiché pour rappel');return json({...vue(r),numeroComplet:r.numero})}
  const depuis=new Date(Date.now()-7*864e5).toISOString();
  const rows=((await env.DB.prepare('SELECT * FROM telephonie_appels WHERE recu_at>=? ORDER BY recu_at DESC LIMIT 300').bind(depuis).all()).results||[]).map(vue);
  rows.sort((a,b)=>(a.statut==='traite')-(b.statut==='traite')||a.priorite-b.priorite||b.recuAt.localeCompare(a.recuAt));
  return json({mode:secretActif(env.INTEROP_ENV)||secretActif(env)?'operateur':'simulation',ouvert:T.ouvert(),accueil:T.accueil(env.ESTABLISHMENT||env.MESSAGING?.establishment),exemples:T.EXEMPLES,orientations:T.ORIENTATIONS,appels:rows,
   aRappeler:rows.filter(r=>r.statut==='a-rappeler').length,urgences:rows.filter(r=>r.transfert).length});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await request.json()}catch{return json({error:'Requête invalide.'},400)}
 const qui=acl.profile?.display_name||'Professionnel';
 if(d.action==='simuler'){
  const texte=t(d.texte);if(texte.length<3)return json({error:'Saisissez ce que dit l’appelant.'},400);
  const numero=T.normaliserNumero(d.numero);if(!numero)return json({error:'Numéro français à 10 chiffres (fictif).'},400);
  const r=await enregistrer(env,{canal:'simulation',numero,transcription:texte});
  await acl.log('write','telephonie/'+r.id,'allowed','Appel simulé',r.intention);
  return json({appel:{...r,numero:T.masquer(numero)}});
 }
 if(d.action==='traiter'){
  const id=t(d.id),note=t(d.note).slice(0,500);
  const r=await env.DB.prepare("UPDATE telephonie_appels SET statut='traite',traite_par=?,traite_at=?,note=? WHERE id=? AND statut<>'traite'").bind(qui,new Date().toISOString(),note,id).run();
  if(!r.meta?.changes)return json({error:'Appel introuvable ou déjà traité.'},409);
  await acl.log('write','telephonie/'+id,'allowed','Appel traité','');return json({ok:true});
 }
 return json({error:'Action inconnue.'},400);
}

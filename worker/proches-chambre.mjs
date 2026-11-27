// IASELO · information des proches et écran en chambre (27/11/2026, 4e veille, lot C). Règles : dist/proches-chambre-regles.js.
//  Professionnels (soignants du séjour, secrétariat pour l'accord à l'admission) :
//   GET  /api/workspace/proches?stay=   accord, proches (portable masqué), envois du séjour
//   POST /api/workspace/proches         {action:'enregistrer', stay, accord, proches, appellation, etapes} | {action:'retirer', stay} | {action:'informer', stay, etape}
//   GET  /api/workspace/chambre         demandes des patients (48 h) pour les séjours visibles ; ?stay= : lien actif
//   POST /api/workspace/chambre         {action:'lien', stay} | {action:'revoquer', stay} | {action:'traiter', id}
//  Patient (tablette de la chambre, date de naissance vérifiée à chaque appel) :
//   POST /api/chambre/open | vue | demande
//  Envoi automatique aux proches : tourneeProches, lancée par le planificateur (toutes les 10 minutes, 7 h – 21 h).
// SMS aux proches SANS donnée médicale (étape + heure) ; accord du patient obligatoire et retirable ; tout est tracé.
import P from '../dist/proches-chambre-regles.js';
import S from '../dist/sorties-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():'';
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const validStay=s=>typeof s==='string'&&/^[^/]{1,80}$/.test(s);
const CLINIQUES=['anesthesiste','chirurgien','infirmier'],ACCORD=[...CLINIQUES,'secretariat'],MAX_ECHECS=5,DUREE_MAX_JOURS=10;
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
async function body(request){const b=await request.arrayBuffer();if(b.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(b))}
const paris=now=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),g=k=>p.find(x=>x.type===k).value;return {jour:g('year')+'-'+g('month')+'-'+g('day'),heure:Number(g('hour')),hm:g('hour')+':'+g('minute')}};
const qui=acl=>acl.profile?.display_name||acl.profile?.user_id||'?';

/* ---------------- Proches ---------------- */
async function info(env,stay){const r=await env.DB.prepare('SELECT * FROM proches_info WHERE stay_id=?').bind(stay).first();if(!r)return null;let d={};try{d=JSON.parse(r.data)}catch{}return {...d,accordPar:r.accord_par,accordAt:r.accord_at,retireAt:r.retire_at||null,modifiePar:r.updated_by,modifieLe:r.updated_at}}
async function envois(env,stay){return ((await env.DB.prepare("SELECT kind,date_ref,statut,detail,updated_at FROM rappels_auto WHERE stay_id=? AND kind LIKE 'proches-%' ORDER BY updated_at DESC LIMIT 50").bind(stay).all()).results||[]).map(r=>({etape:r.kind.slice(8),jour:r.date_ref.slice(0,10),statut:r.statut,detail:r.detail,at:r.updated_at}))}
// Envoie l'étape à chaque proche ; une seule fois par jour (sauf « attente », numérotée). Retourne le résultat tracé.
export async function informer(env,acl,stay,etape,{now=new Date(),manuel=false}={}){
 const d=await info(env,stay);if(!d||d.retireAt)return {ok:false,raison:'Pas d’accord du patient pour informer ses proches.'};
 if(!P.ETAPES.some(e=>e.id===etape))return {ok:false,raison:'Étape inconnue.'};
 const {jour,hm}=paris(now),m=env.MESSAGING;
 if(!m?.channels?.sms)return {ok:false,raison:'Envoi de SMS non configuré sur ce serveur (Brevo).'};
 let ref=jour;
 if(etape==='attente'){const n=(await env.DB.prepare("SELECT COUNT(*) AS n FROM rappels_auto WHERE stay_id=? AND kind='proches-attente' AND date_ref LIKE ?").bind(stay,jour+'%').first())?.n||0;ref=jour+'#'+n}
 const at=now.toISOString(),claim=await env.DB.prepare("INSERT OR IGNORE INTO rappels_auto(stay_id,kind,date_ref,statut,created_at,updated_at) VALUES(?,?,?,'en-cours',?,?)").bind(stay,'proches-'+etape,ref,at,at).run();
 if(!claim.meta.changes)return {ok:false,deja:true,raison:'Déjà envoyé aujourd’hui.'};
 const sp=await docData(env,'stay/'+stay+'/sortiePlus')||{};
 const texte=P.message(m.establishment,d.appellation,etape,{heure:etape==='sortie'?sp.transport?.heure:etape==='attente'?'':hm});
 const res=[];
 for(const p of d.proches||[]){try{await m.sms({to:p.telephone,content:texte,tag:'iaselo-proches'});res.push(p.prenom+' ('+P.masquer(p.telephone)+')')}catch(e){res.push(p.prenom+' : échec ('+String(e?.message||'envoi impossible').slice(0,80)+')')}}
 const ok=res.some(x=>!/échec/.test(x)),detail=(ok?'SMS envoyé à ':'')+res.join(', ');
 await env.DB.prepare('UPDATE rappels_auto SET statut=?,detail=?,updated_at=? WHERE stay_id=? AND kind=? AND date_ref=?').bind(ok?'envoye':'echec',detail.slice(0,600),new Date().toISOString(),stay,'proches-'+etape,ref).run();
 await acl.log('proches','stay/'+stay+'/proches',ok?'allowed':'denied',(manuel?'Proches informés (manuel) : ':'Proches informés : ')+P.ETAPES.find(e=>e.id===etape).libelle,detail);
 return {ok,etape,detail};
}
// Passage automatique : étape du séjour → SMS (une fois par jour et par étape), 7 h – 21 h.
export async function tourneeProches(env,acl,{now=new Date()}={}){
 const {jour,heure}=paris(now);if(heure<7||heure>=21)return [];
 const rows=(await env.DB.prepare('SELECT stay_id,data FROM proches_info WHERE retire_at IS NULL').all()).results||[],out=[];
 for(const r of rows){
  try{
   const d=JSON.parse(r.data),core=await docData(env,'stay/'+r.stay_id+'/core');if(!core)continue;
   const deja=new Set(((await env.DB.prepare("SELECT kind FROM rappels_auto WHERE stay_id=? AND kind LIKE 'proches-%' AND date_ref LIKE ?").bind(r.stay_id,jour+'%').all()).results||[]).map(x=>x.kind.slice(8)));
   let etape=P.etapeDepuisStage(core.stage);
   // « Retour en chambre » seulement après le bloc ou la salle de réveil du jour (pas pour un patient pas encore opéré).
   if(etape==='chambre'&&!deja.has('bloc')&&!deja.has('reveil'))etape='';
   if(etape&&d.etapes?.includes(etape)&&!deja.has(etape))out.push({stay:r.stay_id,...await informer(env,acl,r.stay_id,etape,{now})});
   if(d.etapes?.includes('sortie')&&!deja.has('sortie')){
    const sp=await docData(env,'stay/'+r.stay_id+'/sortiePlus')||{};
    if(S.datePrevue({...core,sortiePlus:sp},jour)===jour&&sp.transport?.heure&&(sp.sortieAutorisee||sp.chungSigne||sp.aptitudeMedicale))out.push({stay:r.stay_id,...await informer(env,acl,r.stay_id,'sortie',{now})});
   }
  }catch(e){console.error('proches',r.stay_id,e?.message||e)}
 }
 return out;
}
export async function staffProchesApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/proches')return null;
 if(request.method==='GET'){
  const stay=url.searchParams.get('stay')||'';if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
  const d=await info(env,stay);
  return json({stay,etapes:P.ETAPES,sms:!!env.MESSAGING?.channels?.sms,info:d?{...d,proches:(d.proches||[]).map(p=>({prenom:p.prenom,telephone:P.masquer(p.telephone)}))}:null,envois:await envois(env,stay),
   exemple:P.message(env.MESSAGING?.establishment||'La clinique',d?.appellation||'votre proche','reveil',{heure:'11:20'})});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const stay=t(d.stay);if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
 if(!ACCORD.includes(acl.job)&&!acl.isAdmin)return json({error:'Réservé aux soignants du séjour et au secrétariat.'},403);
 const at=new Date().toISOString(),cible='stay/'+stay+'/proches';
 if(d.action==='enregistrer'){
  const ancien=await info(env,stay);
  if(Array.isArray(d.proches))d.proches=d.proches.map((p,i)=>String(p?.telephone||'').includes('*')&&ancien?.proches?.[i]?{...p,telephone:ancien.proches[i].telephone}:p);
  const core=await docData(env,'stay/'+stay+'/core')||{},v=P.valider(d,{prenomPatient:core.identity?.firstName});if(!v.ok)return json({error:v.errors.join(' ')},400);
  // Portable laissé masqué (« 06 ** ** ** 78 ») : on garde le numéro déjà enregistré pour ce proche.
  await env.DB.prepare('INSERT INTO proches_info(stay_id,data,accord_par,accord_at,updated_by,updated_at,retire_at) VALUES(?,?,?,?,?,?,NULL) ON CONFLICT (stay_id) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at,retire_at=NULL'+(ancien&&!ancien.retireAt?'':',accord_par=excluded.accord_par,accord_at=excluded.accord_at'))
   .bind(stay,JSON.stringify(v.data),qui(acl),at,qui(acl),at).run();
  await acl.log('proches',cible,'allowed','Accord du patient recueilli : proches à informer',v.data.proches.length+' proche(s) · étapes : '+v.data.etapes.join(', '));
  return json({ok:true});
 }
 if(d.action==='retirer'){
  await env.DB.prepare('UPDATE proches_info SET retire_at=?,updated_by=?,updated_at=? WHERE stay_id=?').bind(at,qui(acl),at,stay).run();
  await acl.log('proches',cible,'allowed','Accord retiré : plus aucun SMS aux proches');return json({ok:true});
 }
 if(d.action==='informer'){
  if(!CLINIQUES.includes(acl.job)&&!acl.isAdmin)return json({error:'Envoi réservé aux soignants du séjour.'},403);
  const r=await informer(env,acl,stay,t(d.etape),{manuel:true});return json(r,r.ok?200:400);
 }
 return json({error:'Action inconnue.'},400);
}

/* ---------------- Écran en chambre ---------------- */
async function vuePatient(env,stay,now=new Date()){
 const [core,sortiePlus,discharge]=await Promise.all(['core','sortiePlus','discharge'].map(m=>docData(env,'stay/'+stay+'/'+m)));
 const s={...(core||{}),sortiePlus:sortiePlus||{},discharge:discharge||{}},{jour}=paris(now);
 return P.vueChambre({core:core||{},sortiePlus:sortiePlus||{},discharge:discharge||{}},{aujourdhui:jour,etapesSortie:S.etapes(s,{aujourdhui:jour}).filter(e=>e.id!=='date')});
}
export async function staffChambreApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/chambre')return null;
 if(!CLINIQUES.includes(acl.job)&&!acl.isAdmin)return json({error:'Réservé aux soignants.'},403);
 if(request.method==='GET'){
  const stay=url.searchParams.get('stay');
  if(stay){if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
   const l=await env.DB.prepare('SELECT created_at,created_by,expires_at FROM chambre_liens WHERE stay_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC').bind(stay,new Date().toISOString()).first();
   return json({lien:l?{creeLe:l.created_at,creePar:l.created_by,expire:l.expires_at}:null})}
  const depuis=new Date(Date.now()-48*36e5).toISOString();
  const rows=((await env.DB.prepare('SELECT * FROM chambre_demandes WHERE recu_at>=? ORDER BY recu_at DESC LIMIT 300').bind(depuis).all()).results||[]).filter(r=>acl.canRead('stay/'+r.stay_id+'/core'));
  return json({demandes:rows.map(r=>({id:r.id,stay:r.stay_id,type:r.type,libelle:P.DEMANDES.find(x=>x.id===r.type)?.libelle||r.type,valeur:r.valeur,texte:r.texte,recuAt:r.recu_at,priorite:P.priorite({type:r.type,valeur:r.valeur}),traitePar:r.traite_par||'',traiteAt:r.traite_at||''}))});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const at=new Date().toISOString();
 if(d.action==='traiter'){
  const r=await env.DB.prepare('SELECT stay_id FROM chambre_demandes WHERE id=?').bind(t(d.id)).first();if(!r||!acl.canRead('stay/'+r.stay_id+'/core'))return json({error:'Demande introuvable.'},404);
  await env.DB.prepare('UPDATE chambre_demandes SET traite_par=?,traite_at=? WHERE id=? AND traite_at IS NULL').bind(qui(acl),at,t(d.id)).run();
  await acl.log('chambre','stay/'+r.stay_id+'/chambre','allowed','Demande du patient traitée');return json({ok:true});
 }
 const stay=t(d.stay);if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
 if(d.action==='revoquer'){await env.DB.prepare('UPDATE chambre_liens SET revoked_at=? WHERE stay_id=? AND revoked_at IS NULL').bind(at,stay).run();await acl.log('chambre','stay/'+stay+'/chambre','allowed','Écran en chambre désactivé');return json({ok:true})}
 if(d.action==='lien'){
  const core=await docData(env,'stay/'+stay+'/core'),naissance=t(core?.identity?.birthDate);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(naissance))return json({error:'Date de naissance absente du dossier : elle est demandée sur la tablette.'},400);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('UPDATE chambre_liens SET revoked_at=? WHERE stay_id=? AND revoked_at IS NULL').bind(at,stay).run();
  await env.DB.prepare('INSERT INTO chambre_liens(token_hash,stay_id,birth_date,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(await sha(token),stay,naissance,qui(acl),at,new Date(Date.now()+DUREE_MAX_JOURS*864e5).toISOString()).run();
  await acl.log('chambre','stay/'+stay+'/chambre','allowed','Écran en chambre activé',DUREE_MAX_JOURS+' jours au plus, désactivé à la sortie');
  return json({ok:true,lien:url.origin+'/chambre.html#acces='+token});
 }
 return json({error:'Action inconnue.'},400);
}
const patientLog=(env,stay,result,reason)=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),'patient-chambre','chambre-patient','stay/'+stay+'/chambre',result,reason,'').run();
export async function patientChambreApi(request,env,etab=''){
 try{
  const url=new URL(request.url),route=url.pathname.replace('/api/chambre/','');
  if(request.method!=='POST'||!['open','vue','demande'].includes(route))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const d=await body(request),token=t(d.token);if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Lien invalide.'},404);
  const hash=await sha(token),row=await env.DB.prepare('SELECT * FROM chambre_liens WHERE token_hash=?').bind(hash).first(),at=new Date().toISOString();
  if(!row)return json({error:'Lien invalide.'},404);
  const core=await docData(env,'stay/'+row.stay_id+'/core');
  if(row.revoked_at||row.expires_at<at||Number(row.failed_attempts)>=MAX_ECHECS||!core||core.stage==='Sortie')return json({error:'Cet écran n’est plus actif. Demandez à l’équipe de le réactiver. En cas d’urgence, utilisez la sonnette.'},410);
  if(route==='open')return json({etablissement:etab||'la clinique',demandes:P.DEMANDES});
  if(t(d.birthDate)!==row.birth_date){
   await env.DB.prepare('UPDATE chambre_liens SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();await patientLog(env,row.stay_id,'denied','Date de naissance incorrecte');
   return json({error:'La date de naissance ne correspond pas.'},400);
  }
  const recentes=async()=>((await env.DB.prepare('SELECT type,valeur,texte,recu_at,traite_at FROM chambre_demandes WHERE stay_id=? AND recu_at>=? ORDER BY recu_at DESC LIMIT 10').bind(row.stay_id,new Date(Date.now()-24*36e5).toISOString()).all()).results||[]).map(r=>({libelle:P.DEMANDES.find(x=>x.id===r.type)?.libelle||r.type,valeur:r.valeur,recuAt:r.recu_at,vue:!!r.traite_at}));
  if(route==='vue')return json({etablissement:etab||'la clinique',...await vuePatient(env,row.stay_id),demandes:await recentes()});
  const v=P.validerDemande(d);if(!v.ok)return json({error:v.error},400);
  const n=(await env.DB.prepare('SELECT COUNT(*) AS n FROM chambre_demandes WHERE stay_id=? AND recu_at>=?').bind(row.stay_id,new Date(Date.now()-36e5).toISOString()).first())?.n||0;
  if(Number(n)>=12)return json({error:'Beaucoup de demandes en une heure : utilisez la sonnette.'},429);
  await env.DB.prepare('INSERT INTO chambre_demandes(id,stay_id,type,valeur,texte,recu_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),row.stay_id,v.demande.type,v.demande.valeur,v.demande.texte,at).run();
  await patientLog(env,row.stay_id,'allowed','Demande du patient : '+v.demande.libelle);
  return json({ok:true,demandes:await recentes()});
 }catch{return json({error:'Demande invalide.'},400)}
}

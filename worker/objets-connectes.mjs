// IASELO · objets connectés du télésuivi (27/11/2026, 4e veille, lot G). Règles : dist/objets-connectes-regles.js.
//  Professionnels (médecins, infirmier(ère)s) :
//   GET  /api/workspace/objets              alertes ouvertes des séjours visibles (mesures des 14 derniers jours)
//   GET  /api/workspace/objets?stay=        appareils, mesures (14 jours), alertes du séjour
//   POST /api/workspace/objets              {action:'appairer', stay, appareil, numeroSerie} | {action:'retirer', id}
//                                           | {action:'simuler', stay, scenario, jours} | {action:'vu', stay, cle, note}
//  Passerelle du fournisseur (à choisir, HDS ; SIMULATION tant que OBJETS_SECRET n'est pas défini → 404) :
//   POST /api/objets/mesures   {numeroSerie, mesures:[{type, valeur, at}]}   signé HMAC-SHA256 (X-Iaselo-Horodatage, X-Iaselo-Signature)
// Les mesures sont rattachées au séjour par le numéro de série de l'appareil prêté ; tout est tracé.
import O from '../dist/objets-connectes-regles.js';
import {signer} from './telephonie.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():'';
const JOBS=['anesthesiste','chirurgien','infirmier'],JOURS=14;
const validStay=s=>/^[^/]{1,80}$/.test(String(s||''));
const secretActif=env=>typeof env?.OBJETS_SECRET==='string'&&env.OBJETS_SECRET.length>=32;
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
async function enregistrer(env,stay,appareil,mesures,source){
 let n=0;const recu=new Date().toISOString();
 for(const m of mesures){const v=O.validerMesure(m);if(!v.ok)continue;const r=await env.DB.prepare('INSERT OR IGNORE INTO objets_mesures(id,stay_id,appareil,type,valeur,mesure_at,recu_at,source) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),stay,appareil,v.mesure.type,v.mesure.valeur,v.mesure.at,recu,source).run();n+=r.meta.changes?1:0}
 return n;
}
async function sejour(env,stay){
 const depuis=new Date(Date.now()-JOURS*864e5).toISOString().slice(0,16);
 const mesures=((await env.DB.prepare('SELECT appareil,type,valeur,mesure_at,source FROM objets_mesures WHERE stay_id=? AND mesure_at>=? ORDER BY mesure_at').bind(stay,depuis).all()).results||[]).map(r=>({appareil:r.appareil,type:r.type,valeur:Number(r.valeur),at:r.mesure_at,source:r.source}));
 const vues=new Map(((await env.DB.prepare('SELECT cle,par,at,note FROM objets_alertes_vues WHERE stay_id=?').bind(stay).all()).results||[]).map(r=>[r.cle,{par:r.par,at:r.at,note:r.note}]));
 const sp=await docData(env,'stay/'+stay+'/sortiePlus'),sortie=t(sp?.sortiePrevue);
 return {mesures,alertes:O.alertes(mesures,{sortie}).map(a=>({...a,vue:vues.get(a.cle)||null}))};
}
export async function staffObjetsApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/objets')return null;
 if(!JOBS.includes(acl.job)&&!acl.isAdmin)return json({error:'Réservé aux médecins et aux infirmier(ère)s.'},403);
 const mode=secretActif(env.INTEROP_ENV)?'passerelle':'simulation';
 if(request.method==='GET'){
  const stay=url.searchParams.get('stay');
  if(stay){if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
   const app=((await env.DB.prepare('SELECT id,appareil,numero_serie,created_by,created_at FROM objets_appairages WHERE stay_id=? AND actif=1 ORDER BY created_at').bind(stay).all()).results||[]).map(r=>({id:r.id,appareil:r.appareil,libelle:O.APPAREILS[r.appareil]?.libelle||r.appareil,numeroSerie:r.numero_serie,par:r.created_by,le:r.created_at}));
   return json({mode,appareils:O.APPAREILS,mesuresLib:O.MESURES,scenarios:O.SCENARIOS,appairages:app,...await sejour(env,stay)})}
  const stays=((await env.DB.prepare('SELECT DISTINCT stay_id FROM objets_appairages WHERE actif=1').all()).results||[]).map(r=>r.stay_id).filter(s=>acl.canRead('stay/'+s+'/core')),out=[];
  for(const s of stays){const d=await sejour(env,s),ouvertes=d.alertes.filter(a=>!a.vue);out.push({stay:s,alertes:ouvertes,derniere:d.mesures.at(-1)?.at||'',mesures:d.mesures.length})}
  return json({mode,patients:out});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=JSON.parse(await request.text())}catch{return json({error:'Demande invalide.'},400)}
 const who=acl.profile?.display_name||acl.profile?.user_id||'?',at=new Date().toISOString();
 if(d.action==='retirer'){const r=await env.DB.prepare('SELECT stay_id FROM objets_appairages WHERE id=? AND actif=1').bind(t(d.id)).first();if(!r||!acl.canRead('stay/'+r.stay_id+'/core'))return json({error:'Appareil introuvable.'},404);
  await env.DB.prepare('UPDATE objets_appairages SET actif=0,retire_at=? WHERE id=?').bind(at,t(d.id)).run();await acl.log('objets','stay/'+r.stay_id+'/objets','allowed','Appareil rendu ou retiré');return json({ok:true})}
 const stay=t(d.stay);if(!validStay(stay)||!acl.canRead('stay/'+stay+'/core'))return json({error:'Séjour inaccessible.'},403);
 if(d.action==='appairer'){
  const appareil=Object.hasOwn(O.APPAREILS,d.appareil)?d.appareil:'',serie=t(d.numeroSerie).toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,40);
  if(!appareil)return json({error:'Appareil inconnu.'},400);if(serie.length<4)return json({error:'Numéro de série de l’appareil (4 caractères au moins).'},400);
  const deja=await env.DB.prepare('SELECT stay_id FROM objets_appairages WHERE numero_serie=? AND actif=1').bind(serie).first();if(deja)return json({error:'Cet appareil est déjà prêté à un autre patient : retirez-le d’abord.'},409);
  await env.DB.prepare('INSERT INTO objets_appairages(id,stay_id,appareil,numero_serie,actif,created_by,created_at) VALUES(?,?,?,?,1,?,?)').bind(crypto.randomUUID(),stay,appareil,serie,who,at).run();
  await acl.log('objets','stay/'+stay+'/objets','allowed','Appareil connecté prêté : '+O.APPAREILS[appareil].libelle,'N° '+serie);return json({ok:true});
 }
 if(d.action==='simuler'){
  const app=((await env.DB.prepare('SELECT appareil FROM objets_appairages WHERE stay_id=? AND actif=1').bind(stay).all()).results||[]).map(r=>r.appareil);if(!app.length)return json({error:'Prêtez d’abord un appareil au patient.'},400);
  const jours=Math.min(10,Math.max(1,Number(d.jours)||5)),depuis=new Date(Date.now()-(jours-1)*864e5).toISOString().slice(0,10);
  const serie=O.simuler(app,{depuis,jours,scenario:Object.hasOwn(O.SCENARIOS,d.scenario)?d.scenario:'normal'});let n=0;
  for(const a of app){const types=O.APPAREILS[a].mesures;n+=await enregistrer(env,stay,a,serie.filter(m=>types.includes(m.type)&&(a!=='oxymetre'||m.type!=='fc'||!app.includes('tension'))),'simulation')}
  await acl.log('objets','stay/'+stay+'/objets','allowed','Mesures simulées ('+(O.SCENARIOS[d.scenario]||'normal')+')',n+' mesure(s)');return json({ok:true,mesures:n});
 }
 if(d.action==='vu'){const cle=t(d.cle).slice(0,80);if(!cle)return json({error:'Alerte inconnue.'},400);
  await env.DB.prepare('INSERT OR IGNORE INTO objets_alertes_vues(stay_id,cle,par,at,note) VALUES(?,?,?,?,?)').bind(stay,cle,who,at,t(d.note).slice(0,200)).run();
  await acl.log('objets','stay/'+stay+'/objets','allowed','Alerte d’objet connecté prise en charge',cle);return json({ok:true})}
 return json({error:'Action inconnue.'},400);
}
const egal=(a,b)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
export async function passerelleObjetsApi(request,env){
 if(!secretActif(env))return json({error:'Non trouvé.'},404);
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 const brut=await request.text();if(brut.length>100000)return json({error:'Trop volumineux.'},413);
 const ts=request.headers.get('X-Iaselo-Horodatage')||'',sig=(request.headers.get('X-Iaselo-Signature')||'').toLowerCase();
 const log=(result,reason,detail='')=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,'passerelle-objets','objets','objets',?,?,?)").bind(new Date().toISOString(),result,reason,detail).run();
 if(!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300||!egal(sig,await signer(env.OBJETS_SECRET,ts,brut))){await log('denied','Signature absente, invalide ou périmée');return json({error:'Signature refusée.'},401)}
 let d;try{d=JSON.parse(brut)}catch{return json({error:'JSON attendu.'},400)}
 const serie=t(d.numeroSerie).toUpperCase(),a=await env.DB.prepare('SELECT stay_id,appareil FROM objets_appairages WHERE numero_serie=? AND actif=1').bind(serie).first();
 if(!a){await log('denied','Appareil non prêté',serie);return json({error:'Appareil inconnu ou rendu.'},404)}
 const mesures=(Array.isArray(d.mesures)?d.mesures:[]).slice(0,500).filter(m=>O.APPAREILS[a.appareil].mesures.includes(m?.type));
 const n=await enregistrer(env,a.stay_id,a.appareil,mesures,'passerelle');await log('allowed','Mesures reçues',n+' mesure(s)');
 return json({recues:n});
}

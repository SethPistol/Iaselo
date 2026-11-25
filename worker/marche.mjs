// IASELO · modules ajoutés après la comparaison au marché (25/11/2026). Une seule table d'enregistrements
// (marche_records, historique dans marche_history), des droits par module et par séjour, tout est tracé dans le journal des accès.
//
//  /api/workspace/marche/<module>        GET : lecture ; POST {action,…} : écriture (professionnels connectés)
//  /api/interop/entrant/<flux>           flux entrants des logiciels de la clinique (jeton par émetteur)
//  /api/rdv/*, /api/devis/*, /api/paiement/*   pages patient (lien personnel + date de naissance)
//
// Modules : biologie, courriers, interfaces, moniteurs, secours, transfusion, evenements, agenda, honoraires,
// sterilisation, brancardage, planning, messagerie. Règles : dist/marche-regles.js et dist/interop-hl7.js.
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import H from '../dist/interop-hl7.js';
import M from '../dist/marche-regles.js';
import planningCore from '../dist/planning-core.js';
import {etatConnecteurs,etatConnecteur,jetonValide,envoyer,sessionPaiement,signatureStripe} from '../server/interop/etablissement.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const t=v=>typeof v==='string'?v.trim():v===undefined||v===null?'':String(v).trim();
const court=(v,n=500)=>t(v).slice(0,n);
const maintenant=()=>new Date().toISOString();
const TZ='Europe/Paris';
export function aujourdhui(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('fr-FR',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
const sha=s=>createHash('sha256').update(s).digest('hex');
const mask=p=>t(p).replace(/.(?=.{2})/g,'•');
const MED=['anesthesiste','chirurgien'],CLIN=['anesthesiste','chirurgien','infirmier','pharmacien'];
const est=(acl,jobs)=>!!acl.active&&(acl.isAdmin||jobs.includes(acl.job));
const voitSejour=(acl,id)=>!!id&&acl.canRead('stay/'+id+'/core');
const cliniqueSejour=(acl,id)=>!!id&&acl.canRead('stay/'+id+'/consult');
const nom=acl=>court(acl.profile?.display_name||'Professionnel',160);

/* ---------- Stockage ---------- */
const ligne=r=>({id:r.id,module:r.module,kind:r.kind,stay:r.stay_id,status:r.status,ref:r.ref,day:r.day,data:JSON.parse(r.data),par:r.created_by_name,parId:r.created_by,at:r.created_at,maj:r.updated_at,version:Number(r.version)});
async function lire(env,module,{kind,stay,ref,day,depuis,status,limit=500}={}){
 const w=['module=?'],v=[module];
 if(kind){w.push('kind=?');v.push(kind)}if(stay!==undefined){w.push('stay_id=?');v.push(stay)}if(ref!==undefined){w.push('ref=?');v.push(ref)}if(day){w.push('day=?');v.push(day)}if(depuis){w.push('day>=?');v.push(depuis)}if(status){w.push('status=?');v.push(status)}
 return ((await env.DB.prepare('SELECT * FROM marche_records WHERE '+w.join(' AND ')+' ORDER BY created_at DESC LIMIT '+Math.min(2000,limit)).bind(...v).all()).results||[]).map(ligne);
}
async function un(env,module,id){const r=await env.DB.prepare('SELECT * FROM marche_records WHERE id=? AND module=?').bind(t(id),module).first();return r?ligne(r):null}
function historique(env,rec,action,acteur,acteurNom,at){return env.DB.prepare('INSERT INTO marche_history(id,record_id,module,version,action,data,actor,actor_name,at) VALUES(?,?,?,?,?,?,?,?,?)').bind(randomUUID(),rec.id,rec.module,rec.version,action,JSON.stringify({status:rec.status,data:rec.data}),acteur,acteurNom,at)}
async function creer(env,acteur,module,kind,{stay='',status='',ref='',day='',data={}},action='creation'){
 const at=maintenant(),rec={id:randomUUID(),module,kind,stay,status,ref,day,data,par:acteur.nom,parId:acteur.id,at,maj:at,version:1};
 await env.DB.batch([env.DB.prepare('INSERT INTO marche_records(id,module,kind,stay_id,status,ref,day,data,created_by,created_by_name,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)').bind(rec.id,module,kind,stay,status,ref,day,JSON.stringify(data),acteur.id,acteur.nom,at,at),historique(env,rec,action,acteur.id,acteur.nom,at)]);
 return rec;
}
// Modification optimiste : refusée si l'élément a changé entre-temps (version).
async function modifier(env,acteur,rec,{data,status,stay,ref},action){
 const at=maintenant(),next={...rec,data:data??rec.data,status:status??rec.status,stay:stay??rec.stay,ref:ref??rec.ref,maj:at,version:rec.version+1};
 const r=await env.DB.prepare('UPDATE marche_records SET data=?,status=?,stay_id=?,ref=?,updated_at=?,version=? WHERE id=? AND version=?').bind(JSON.stringify(next.data),next.status,next.stay,next.ref,at,next.version,rec.id,rec.version).run();
 if(!(r?.meta?.changes>0))throw Object.assign(Error('Élément modifié sur un autre poste : rechargez.'),{status:409});
 await historique(env,next,action,acteur.id,acteur.nom,at).run();
 return next;
}
const acteurDe=acl=>({id:String(acl.profile?.user_id||''),nom:nom(acl)});
async function docData(env,key){const r=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();try{return r?JSON.parse(r.data):null}catch{return null}}
async function sejours(env){return ((await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/core'").all()).results||[]).map(r=>{try{const d=JSON.parse(r.data);return {id:r.key.split('/')[1],identity:d.identity||{},stage:d.stage||''}}catch{return null}}).filter(Boolean)}
async function salles(env){const list=await docData(env,'management/planningResources')||[];return (Array.isArray(list)?list:[]).filter(r=>r&&r.id&&planningCore.kind(r)==='room'&&r.open!==false).map(r=>({id:String(r.id),label:String(r.label||r.id).slice(0,80)}))}
// Liens IPP / NDA (venus du logiciel administratif) → séjour IASELO.
async function liens(env){const m=new Map();for(const r of await lire(env,'interfaces',{kind:'lien',limit:2000}))m.set(r.stay,r.data);return m}
async function sejoursAvecIpp(env){const l=await liens(env);return (await sejours(env)).map(s=>({...s,ipp:l.get(s.id)?.ipp||'',nda:l.get(s.id)?.nda||''}))}

/* ---------- Biologie et courriers : import commun (manuel ou flux entrant) ---------- */
async function importerBiologie(env,acteur,contenu,source){
 const b=H.lireBiologie(contenu),tous=await sejoursAvecIpp(env),crees=[];
 for(const cr of b.comptesRendus){const r=H.rapprocher(cr.patient,tous);
  const resultats=cr.demandes.flatMap(d=>d.resultats.map(x=>({...x,demande:d.libelle,prelevement:d.prelevement})));
  const critiques=resultats.filter(x=>x.critique).length;
  crees.push(await creer(env,acteur,'biologie','resultat',{stay:r.auto||'',status:r.auto?'nouveau':'a-rattacher',ref:cr.patient.ipp||'',day:(cr.demandes[0]?.prelevement||b.date||maintenant()).slice(0,10),
   data:{format:b.format,emetteur:b.emetteur,idMessage:b.idMessage,source,patient:cr.patient,nda:cr.nda||'',demandes:cr.demandes.map(d=>({code:d.code,libelle:d.libelle,prelevement:d.prelevement,numero:d.numero,prescripteur:d.prescripteur,document:d.document?{type:d.document.type,present:true}:null})),resultats,critiques,candidats:r.candidats,rattachement:r.auto?{mode:'automatique',motif:r.candidats[0].motif,at:maintenant()}:null}}));
 }
 return crees;
}
async function deposerCourrier(env,acteur,d,source){
 const nomFichier=court(d.nom,200)||'document',type=t(d.type)||'application/pdf';
 if(!['application/pdf','text/plain','image/jpeg','image/png'].includes(type))throw Object.assign(Error('Format accepté : PDF, texte, JPEG ou PNG.'),{status:400});
 let hash='';
 if(d.base64){const bytes=Buffer.from(String(d.base64),'base64');if(bytes.length>15*1024*1024)throw Object.assign(Error('Document trop volumineux (15 Mo au plus).'),{status:413});
  if(type==='application/pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')throw Object.assign(Error('Le fichier n’est pas un PDF valide.'),{status:400});
  if(!env.BUCKET)throw Object.assign(Error('Stockage des fichiers indisponible.'),{status:503});
  hash=createHash('sha256').update(bytes).digest('hex');await env.BUCKET.put(hash,bytes,{httpMetadata:{contentType:type},customMetadata:{name:nomFichier}});
 }
 const contenu=court(d.texte,60000),classe=M.classerCourrier({objet:d.objet||'',texte:contenu,nomFichier}),idt={...M.identiteCourrier(contenu),...(d.patient||{})};
 const tous=await sejoursAvecIpp(env),r=idt.nom||idt.ins?H.rapprocher({ins:idt.ins||'',ipp:idt.ipp||'',nom:idt.nom,prenom:idt.prenom,naissance:idt.naissance},tous):{candidats:[],auto:null};
 return creer(env,acteur,'courriers','courrier',{stay:r.auto||'',status:r.auto?'nouveau':'a-rattacher',day:aujourdhui(),
  data:{nom:nomFichier,type,hash,taille:d.base64?Math.round(String(d.base64).length*0.75):contenu.length,objet:court(d.objet,300),expediteur:court(d.expediteur,300),canal:source,texte:contenu,classement:classe,typeDocument:classe.type,patient:idt,candidats:r.candidats,rattachement:r.auto?{mode:'automatique',motif:r.candidats[0].motif,at:maintenant()}:null}});
}
async function importerAdt(env,acteur,contenu,source){
 const a=H.lireAdt(contenu),tous=await sejoursAvecIpp(env);
 const deja=a.nda?tous.find(s=>s.nda&&s.nda===a.nda):null,r=deja?{auto:deja.id,candidats:[{stay:deja.id,niveau:'certain',motif:'NDA identique'}]}:H.rapprocher(a.patient||{},tous);
 const rec=await creer(env,acteur,'interfaces','adt',{stay:r.auto||'',status:r.auto?'integre':'a-rattacher',ref:a.nda||a.patient?.ipp||'',day:(a.date||maintenant()).slice(0,10),data:{...a,source,candidats:r.candidats}});
 if(r.auto)await lier(env,acteur,r.auto,{ipp:a.patient?.ipp,nda:a.nda});
 return rec;
}
async function lier(env,acteur,stay,{ipp,nda}){
 const ex=(await lire(env,'interfaces',{kind:'lien',stay}))[0];const data={ipp:t(ipp)||ex?.data.ipp||'',nda:t(nda)||ex?.data.nda||''};
 return ex?modifier(env,acteur,ex,{data},'lien'):creer(env,acteur,'interfaces','lien',{stay,ref:data.ipp,data});
}
async function importerMoniteur(env,acteur,contenu,source){
 const m=H.lireMoniteur(contenu);if(!m.mesures.length)return null;
 return creer(env,acteur,'moniteurs','lot',{ref:m.salle,day:(m.mesures[0].at||maintenant()).slice(0,10),data:{salle:m.salle,appareil:m.appareil,source,mesures:m.mesures}});
}

/* ---------- Flux entrants des logiciels de la clinique ---------- */
const FLUX={biologie:'labo',adt:'gam',moniteur:'moniteurs',courrier:'courriers'};
export async function interopEntrantApi(request,env){
 const url=new URL(request.url),flux=url.pathname.split('/').pop(),id=FLUX[flux];
 if(!id||request.method!=='POST')return json({error:'Flux inconnu.'},404);
 const ienv=env.INTEROP_ENV||{},hl7=flux!=='courrier';
 const reponse=(code,msg,contenu)=>hl7?new Response(H.ack(contenu||'',code,msg),{status:code==='AA'?200:code==='AE'?400:403,headers:{'Content-Type':'application/hl7-v2; charset=utf-8','Cache-Control':'no-store'}}):json(code==='AA'?{ok:true}:{error:msg},code==='AA'?200:403);
 const journal=(result,reason)=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,?,'interop-entrant',?,?,?)").bind(maintenant(),'flux:'+id,'interop/'+flux,result,reason).run();
 if(!jetonValide(id,request,ienv)){await journal('denied','Jeton absent ou invalide');return reponse('AR','Jeton d’accès refusé.')}
 const bytes=await request.arrayBuffer();if(bytes.byteLength>(flux==='courrier'?22:2)*1024*1024){await journal('denied','Message trop volumineux');return reponse('AE','Message trop volumineux.')}
 const contenu=new TextDecoder().decode(bytes),acteur={id:'flux:'+id,nom:etatConnecteur(id,ienv).label};
 try{
  let detail='';
  if(flux==='biologie'){const r=await importerBiologie(env,acteur,contenu,'flux');detail=r.length+' compte(s) rendu(s), '+r.filter(x=>x.status==='a-rattacher').length+' à rattacher'}
  else if(flux==='adt'){const r=await importerAdt(env,acteur,contenu,'flux');detail=r.data.evenement+' '+(r.status==='integre'?'intégré':'à rattacher')}
  else if(flux==='moniteur'){const r=await importerMoniteur(env,acteur,contenu,'flux');detail=r?r.data.mesures.length+' mesure(s)':'aucune mesure'}
  else {let d;try{d=JSON.parse(contenu)}catch{return reponse('AE','JSON attendu : {nom,type,base64,texte,objet,expediteur}.')}const r=await deposerCourrier(env,acteur,d,'mssante');detail=r.data.classement.label}
  await journal('allowed',detail);return reponse('AA','',contenu);
 }catch(e){await journal('denied',court(e.message,200));return reponse('AE',court(e.message,80),contenu)}
}

/* ---------- Simulations (données fictives, uniquement en mode simulation) ---------- */
const pad=n=>String(n).padStart(2,'0');
function hl7Date(d){return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+pad(d.getUTCHours())+pad(d.getUTCMinutes())+'00'}
function oruSimule(stay,ipp=''){const i=stay.identity||{},d=hl7Date(new Date()),naiss=t(i.birthDate).replace(/-/g,'');
 const k=(3.6+Math.random()*1.6).toFixed(1),hb=(11+Math.random()*4).toFixed(1),plq=Math.round(140+Math.random()*200),creat=Math.round(60+Math.random()*50);
 return ['MSH|^~\\&|LABO-SIM|LABORATOIRE (simulation)|IASELO|CLINIQUE|'+d+'||ORU^R01^ORU_R01|SIM'+d+'|P|2.5','PID|1||'+H.echapper(ipp)+'^^^LABO^PI||'+H.echapper(t(i.lastName).toUpperCase())+'^'+H.echapper(t(i.firstName))+'^^^^^L||'+naiss+'|'+({Féminin:'F',Masculin:'M'}[i.sex]||'U'),'OBR|1||SIM-'+d+'|BILAN^Bilan préopératoire|||'+d,
  'OBX|1|NM|718-7^Hémoglobine^LN||'+hb+'|g/dL|12-17||||F','OBX|2|NM|777-3^Plaquettes^LN||'+plq+'|G/L|150-400||||F','OBX|3|NM|2823-3^Potassium^LN||'+k+'|mmol/L|3.5-5.0||||F','OBX|4|NM|2160-0^Créatinine^LN||'+creat+'|µmol/L|50-110||||F','OBX|5|NM|6301-6^INR^LN||1.0||0.8-1.2||||F','OBX|6|ST|882-1^Groupe ABO-RhD^LN||A+||||||F'].join('\r')}
function moniteurSimule(salle,depuis,fin){const out=[];let base={hr:72,sbp:122,dbp:70,spo2:98,etco2:36,temp:36.4};
 for(let x=depuis;x<=fin;x+=5*60000){const d=hl7Date(new Date(x)),j=v=>Math.round((v+(Math.random()-0.5)*6)*10)/10;base={hr:j(base.hr),sbp:j(base.sbp),dbp:j(base.dbp),spo2:Math.min(100,Math.round(j(base.spo2))),etco2:j(base.etco2),temp:Math.round((base.temp+0.01)*10)/10};
  out.push(['MSH|^~\\&|MONITEUR-SIM|'+salle+'|IASELO|CLINIQUE|'+d+'||ORU^R01|M'+d+'|P|2.5','PV1|1|I|BLOC^'+salle,'OBR|1|||MONITORING|||'+d+'|||MON-SIM-'+salle,
   'OBX|1|NM|147842^MDC_ECG_HEART_RATE^MDC||'+Math.round(base.hr)+'|^bpm|||||F|||'+d,'OBX|2|NM|150301^MDC_PRESS_CUFF_SYS^MDC||'+Math.round(base.sbp)+'|^mmHg|||||F|||'+d,'OBX|3|NM|150302^MDC_PRESS_CUFF_DIA^MDC||'+Math.round(base.dbp)+'|^mmHg|||||F|||'+d,
   'OBX|4|NM|150456^MDC_PULS_OXIM_SAT_O2^MDC||'+base.spo2+'|^%|||||F|||'+d,'OBX|5|NM|151708^MDC_AWAY_CO2_ET^MDC||'+Math.round(base.etco2)+'|^mmHg|||||F|||'+d,'OBX|6|NM|150344^MDC_TEMP^MDC||'+base.temp+'|^°C|||||F|||'+d].join('\r'))}
 return out}

/* ---------- API des professionnels ---------- */
export async function staffMarcheApi(request,env,acl){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/workspace/marche/'))return null;
 const parts=url.pathname.slice('/api/workspace/marche/'.length).split('/'),module=parts[0],sous=parts[1]||'';
 const H_=HANDLERS[module];if(!H_)return json({error:'Module inconnu.'},404);
 if(!acl.active)return json({error:'Compte désactivé.'},403);
 const acteur=acteurDe(acl),ienv=env.INTEROP_ENV||{};
 const refuse=async(raison,cible=module)=>{await acl.log('write','marche/'+cible,'denied',raison);return json({error:raison},403)};
 const ctx={env,acl,acteur,ienv,url,sous,refuse,q:k=>t(url.searchParams.get(k))};
 try{
  if(request.method==='GET')return await H_.get(ctx);
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  let d;try{const b=await request.arrayBuffer();if(b.byteLength>22*1024*1024)return json({error:'Requête trop volumineuse.'},413);d=JSON.parse(new TextDecoder().decode(b))}catch{return json({error:'Requête illisible.'},400)}
  if(!d||typeof d!=='object')return json({error:'Requête illisible.'},400);
  return await H_.post(ctx,d,t(d.action));
 }catch(e){return json({error:court(e.message||'Erreur.',300)},e.status||400)}
}
const LEC=(acl,jobs)=>est(acl,jobs);
// Filtre les enregistrements liés à un séjour : seuls ceux des séjours visibles (clinique) sont renvoyés.
const visibles=(acl,rows,clin=true)=>rows.filter(r=>!r.stay?true:clin?cliniqueSejour(acl,r.stay):voitSejour(acl,r.stay));

const HANDLERS={
 /* 1a. Biologie */
 biologie:{
  async get({env,acl,q}){if(!LEC(acl,CLIN))return json({error:'Biologie réservée aux soignants.'},403);
   const stay=q('stay');if(stay){if(!cliniqueSejour(acl,stay))return json({error:'Séjour hors habilitation.'},403);await acl.log('read','marche/biologie','allowed','Résultats de biologie',stay);return json({resultats:await lire(env,'biologie',{stay})})}
   const tous=await lire(env,'biologie',{limit:400});const mine=visibles(acl,tous.filter(r=>r.stay)),file=est(acl,['anesthesiste','chirurgien','infirmier'])?tous.filter(r=>!r.stay&&r.status==='a-rattacher'):[];
   await acl.log('read','marche/biologie','allowed','Résultats de biologie (liste)');return json({resultats:mine,aRattacher:file})},
  async post({env,acl,acteur,ienv,refuse},d,action){
   if(action==='importer'){if(!est(acl,['anesthesiste','chirurgien','infirmier']))return refuse('Import réservé aux soignants.');const r=await importerBiologie(env,acteur,court(d.contenu,2*1024*1024),'import manuel');await acl.log('write','marche/biologie','allowed','Import de biologie',r.length+' compte(s) rendu(s)');return json({crees:r.map(x=>({id:x.id,status:x.status}))})}
   if(action==='simuler'){if(etatConnecteur('labo',ienv).mode!=='simulation')return json({error:'Simulation possible seulement en mode simulation.'},400);const s=(await sejoursAvecIpp(env)).find(x=>x.id===t(d.stay));if(!s||!cliniqueSejour(acl,s.id))return refuse('Séjour hors habilitation.');const r=await importerBiologie(env,{id:'flux:labo',nom:'Laboratoire (simulation)'},oruSimule(s,s.ipp),'simulation');return json({crees:r.map(x=>({id:x.id,status:x.status}))})}
   const rec=await un(env,'biologie',d.id);if(!rec)return json({error:'Résultat introuvable.'},404);
   if(action==='rattacher'){if(!est(acl,['anesthesiste','chirurgien','infirmier']))return refuse('Rattachement réservé aux soignants.');if(rec.stay)return json({error:'Résultat déjà rattaché.'},409);const stay=t(d.stay);if(!cliniqueSejour(acl,stay))return refuse('Séjour hors habilitation.');
    if(!rec.data.candidats.some(c=>c.stay===stay)&&!t(d.motif))return json({error:'Ce séjour ne correspond pas à l’identité du compte rendu : indiquez le motif du rattachement (identitovigilance).'},400);
    const r=await modifier(env,acteur,rec,{stay,status:'nouveau',data:{...rec.data,rattachement:{mode:'manuel',par:acteur.nom,at:maintenant(),motif:court(d.motif,300)||'Identité concordante vérifiée'}}},'rattachement');await acl.log('write','marche/biologie','allowed','Rattachement d’un résultat',stay);return json({resultat:r})}
   if(action==='vu'){if(!rec.stay||!cliniqueSejour(acl,rec.stay)||!est(acl,MED))return refuse('Prise de connaissance réservée aux médecins du séjour.');const r=await modifier(env,acteur,rec,{status:'vu',data:{...rec.data,vu:{par:acteur.nom,at:maintenant(),commentaire:court(d.commentaire,500)}}},'vu');await acl.log('write','marche/biologie','allowed','Résultat vu',rec.stay);return json({resultat:r})}
   return json({error:'Action inconnue.'},400)}},
 /* 1b. Courriers reçus */
 courriers:{
  async get({env,acl,q,sous}){if(!LEC(acl,[...CLIN,'secretariat']))return json({error:'Courriers réservés aux soignants et au secrétariat.'},403);
   if(sous==='fichier'){const rec=await un(env,'courriers',q('id'));if(!rec||!rec.data.hash)return json({error:'Document introuvable.'},404);if(rec.stay?!voitSejour(acl,rec.stay):!est(acl,['anesthesiste','chirurgien','infirmier','secretariat']))return json({error:'Document hors habilitation.'},403);
    const o=await env.BUCKET?.get(rec.data.hash);if(!o)return json({error:'Fichier introuvable.'},404);await acl.log('file-read','marche/courriers','allowed','Courrier reçu',rec.id);return new Response(o.body,{headers:{'Content-Type':rec.data.type,'Content-Disposition':'inline; filename="'+encodeURIComponent(rec.data.nom)+'"','Cache-Control':'no-store'}})}
   const stay=q('stay');if(stay){if(!voitSejour(acl,stay))return json({error:'Séjour hors habilitation.'},403);return json({courriers:await lire(env,'courriers',{stay})})}
   const tous=await lire(env,'courriers',{limit:400});await acl.log('read','marche/courriers','allowed','Courriers reçus');
   return json({courriers:visibles(acl,tous.filter(r=>r.stay),false),aRattacher:est(acl,['anesthesiste','chirurgien','infirmier','secretariat'])?tous.filter(r=>!r.stay):[]})},
  async post({env,acl,acteur,refuse},d,action){
   if(!est(acl,['anesthesiste','chirurgien','infirmier','secretariat']))return refuse('Courriers réservés aux soignants et au secrétariat.');
   if(action==='deposer'){const r=await deposerCourrier(env,acteur,d,'depot');if(d.stay&&!r.stay&&voitSejour(acl,t(d.stay))){const x=await modifier(env,acteur,r,{stay:t(d.stay),status:'nouveau',data:{...r.data,rattachement:{mode:'manuel',par:acteur.nom,at:maintenant(),motif:'Déposé depuis le dossier'}}},'rattachement');await acl.log('write','marche/courriers','allowed','Dépôt d’un courrier',x.stay);return json({courrier:x})}await acl.log('write','marche/courriers','allowed','Dépôt d’un courrier');return json({courrier:r})}
   const rec=await un(env,'courriers',d.id);if(!rec)return json({error:'Courrier introuvable.'},404);
   if(action==='rattacher'){const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');const r=await modifier(env,acteur,rec,{stay,status:'nouveau',data:{...rec.data,typeDocument:M.TYPES_COURRIER[d.typeDocument]?d.typeDocument:rec.data.typeDocument,rattachement:{mode:'manuel',par:acteur.nom,at:maintenant(),motif:court(d.motif,300)||'Identité vérifiée'}}},'rattachement');await acl.log('write','marche/courriers','allowed','Rattachement d’un courrier',stay);return json({courrier:r})}
   if(action==='classer'){if(rec.stay&&!voitSejour(acl,rec.stay))return refuse('Séjour hors habilitation.');if(!M.TYPES_COURRIER[d.typeDocument]&&d.typeDocument!=='autre')return json({error:'Type inconnu.'},400);return json({courrier:await modifier(env,acteur,rec,{data:{...rec.data,typeDocument:d.typeDocument}},'classement')})}
   if(action==='vu'){if(!rec.stay||!cliniqueSejour(acl,rec.stay))return refuse('Séjour hors habilitation.');return json({courrier:await modifier(env,acteur,rec,{status:'vu',data:{...rec.data,vu:{par:acteur.nom,at:maintenant()}}},'vu')})}
   return json({error:'Action inconnue.'},400)}},
 /* 2. Interfaces avec le logiciel administratif */
 interfaces:{
  async get({env,acl,ienv}){if(!est(acl,['secretariat','dim','facturation','anesthesiste']))return json({error:'Interfaces réservées au secrétariat, au DIM, à la facturation et aux administrateurs.'},403);
   const adt=await lire(env,'interfaces',{kind:'adt',limit:300}),sortants=await lire(env,'interfaces',{kind:'sortant',limit:300});
   await acl.log('read','marche/interfaces','allowed','Interfaces');
   return json({connecteurs:etatConnecteurs(ienv),adt:adt.map(r=>r.stay&&!voitSejour(acl,r.stay)?{...r,data:{evenement:r.data.evenement,libelle:r.data.libelle,date:r.data.date}}:r),sortants:visibles(acl,sortants,false)})},
  async post({env,acl,acteur,ienv,refuse},d,action){
   if(!est(acl,['secretariat','dim','facturation']))return refuse('Interfaces réservées au secrétariat, au DIM, à la facturation et aux administrateurs.');
   if(action==='importer-adt'){const r=await importerAdt(env,acteur,court(d.contenu,2*1024*1024),'import manuel');await acl.log('write','marche/interfaces','allowed','Mouvement ADT importé',r.data.evenement);return json({adt:r})}
   if(action==='rattacher-adt'){const rec=await un(env,'interfaces',d.id);if(!rec||rec.kind!=='adt')return json({error:'Mouvement introuvable.'},404);const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');
    const r=await modifier(env,acteur,rec,{stay,status:'integre'},'rattachement');await lier(env,acteur,stay,{ipp:rec.data.patient?.ipp,nda:rec.data.nda});await acl.log('write','marche/interfaces','allowed','Mouvement rattaché',stay);return json({adt:r})}
   if(action==='envoyer-actes'){const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');
    const core=await docData(env,'stay/'+stay+'/core')||{},acts=(await docData(env,'management/acts')||[]).filter(a=>a&&a.patient===stay&&a.status!=='Annulé'&&!a.cancelled);
    if(!acts.length)return json({error:'Aucun acte enregistré pour ce séjour (Activité).'},400);
    const lien=(await liens(env)).get(stay)||{},i=core.identity||{};
    const msg=H.dftActes({patient:{ipp:lien.ipp,ins:i.ins,nom:i.lastName,prenom:i.firstName,naissance:i.birthDate,sexe:i.sex},nda:lien.nda,actes:acts.map(a=>({code:a.code,libelle:a.label||a.libelle||'',date:a.date||a.at||'',quantite:a.quantity||1,activite:a.activity||'',executant:a.performer||a.executant||''}))});
    let envoi;try{envoi=await envoyer('gam',{corps:msg},ienv)}catch(e){envoi={ok:false,detail:court(e.message,200)}}
    const r=await creer(env,acteur,'interfaces','sortant',{stay,status:envoi.ok?'envoye':'echec',day:aujourdhui(),data:{type:'DFT^P03',destinataire:'Logiciel administratif',actes:acts.length,message:msg,...envoi}});
    await acl.log('write','marche/interfaces',envoi.ok?'allowed':'denied','Envoi des actes ('+acts.length+')',stay);return json({sortant:r},envoi.ok?200:502)}
   if(action==='simuler-adt'){if(etatConnecteur('gam',ienv).mode!=='simulation')return json({error:'Simulation possible seulement en mode simulation.'},400);const s=(await sejours(env)).find(x=>x.id===t(d.stay));if(!s||!voitSejour(acl,s.id))return refuse('Séjour hors habilitation.');
    const i=s.identity,dd=hl7Date(new Date()),pv1=Array(46).fill('');pv1[0]='PV1';pv1[1]='1';pv1[2]='I';pv1[3]='CHIR^'+(200+Math.floor(Math.random()*30))+'^A';pv1[19]='NDA'+Math.floor(Math.random()*1e6);pv1[44]=dd;
    const r=await importerAdt(env,{id:'flux:gam',nom:'Logiciel administratif (simulation)'},['MSH|^~\\&|GAM-SIM|CLINIQUE|IASELO|CLINIQUE|'+dd+'||ADT^A01^ADT_A01|SIM'+dd+'|P|2.5','PID|1||'+Math.floor(Math.random()*1e7)+'^^^GAM^PI||'+H.echapper(t(i.lastName).toUpperCase())+'^'+H.echapper(t(i.firstName))+'^^^^^L||'+t(i.birthDate).replace(/-/g,'')+'|'+({Féminin:'F',Masculin:'M'}[i.sex]||'U'),pv1.join('|')].join('\r'),'simulation');return json({adt:r})}
   return json({error:'Action inconnue.'},400)}},
 /* 3. Moniteurs */
 moniteurs:{
  async get({env,acl,q,ienv}){if(!(est(acl,['anesthesiste','infirmier'])&&acl.bloc!==false))return json({error:'Constantes des moniteurs réservées aux équipes du bloc.'},403);
   const salle=q('salle'),depuis=q('depuis')||new Date(Date.now()-6*3600000).toISOString();
   if(!salle)return json({salles:await salles(env),mode:etatConnecteur('moniteurs',ienv).mode});
   const lots=(await lire(env,'moniteurs',{ref:salle,depuis:depuis.slice(0,10),limit:2000})).flatMap(r=>r.data.mesures.map(m=>({...m,lot:r.id})));
   await acl.log('read','marche/moniteurs','allowed','Constantes reçues des moniteurs',salle);
   return json({salle,mesures:lots.filter(m=>m.at>=depuis.slice(0,19)).sort((a,b)=>a.at.localeCompare(b.at))})},
  async post({env,acl,ienv,refuse},d,action){
   if(!(est(acl,['anesthesiste','infirmier'])&&acl.bloc!==false))return refuse('Réservé aux équipes du bloc.');
   if(action==='simuler'){if(etatConnecteur('moniteurs',ienv).mode!=='simulation')return json({error:'Simulation possible seulement en mode simulation.'},400);const salle=t(d.salle);if(!(await salles(env)).some(s=>s.id===salle))return json({error:'Salle inconnue.'},400);
    const fin=Date.now(),debut=fin-Math.min(240,Math.max(15,Number(d.minutes)||60))*60000;let n=0;for(const m of moniteurSimule(salle,debut,fin)){if(await importerMoniteur(env,{id:'flux:moniteurs',nom:'Passerelle moniteurs (simulation)'},m,'simulation'))n++}
    await acl.log('write','marche/moniteurs','allowed','Simulation du moniteur',salle);return json({lots:n})}
   return json({error:'Action inconnue.'},400)}},
 /* 4. Mode dégradé */
 secours:{
  async get({env,acl}){if(!LEC(acl,[...CLIN,'secretariat']))return json({error:'Réservé aux soignants.'},403);return json({episodes:await lire(env,'secours',{kind:'episode',limit:50})})},
  async post({env,acl,acteur,refuse},d,action){
   if(!LEC(acl,[...CLIN,'secretariat']))return refuse('Réservé aux soignants.');
   if(action==='kit'){const n=Math.max(0,Math.min(500,Number(d.patients)||0)),forme=['impression','fichier-chiffre'].includes(d.forme)?d.forme:'impression';await acl.log('secours-kit','marche/secours','allowed','Classeur de secours ('+forme+')',n+' patient(s)');await creer(env,acteur,'secours','kit',{day:aujourdhui(),data:{forme,patients:n}});return json({ok:true})}
   if(action==='debut'){if((await lire(env,'secours',{kind:'episode',status:'en-cours'})).length)return json({error:'Un épisode de mode dégradé est déjà ouvert.'},409);const r=await creer(env,acteur,'secours','episode',{status:'en-cours',day:aujourdhui(),data:{debut:maintenant(),motif:court(d.motif,500)||'Panne',resaisies:[]}});await acl.log('write','marche/secours','allowed','Début du mode dégradé',r.data.motif);return json({episode:r})}
   const rec=await un(env,'secours',d.id);if(!rec)return json({error:'Épisode introuvable.'},404);
   if(action==='fin')return json({episode:await modifier(env,acteur,rec,{status:'a-ressaisir',data:{...rec.data,fin:maintenant(),bilan:court(d.bilan,2000)}},'fin')});
   if(action==='ressaisie'){const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');const res=[...rec.data.resaisies.filter(x=>x.stay!==stay),{stay,par:acteur.nom,at:maintenant(),commentaire:court(d.commentaire,300)}];return json({episode:await modifier(env,acteur,rec,{data:{...rec.data,resaisies:res}},'ressaisie')})}
   if(action==='clore'){if(!est(acl,['anesthesiste','chirurgien','infirmier']))return refuse('Clôture réservée aux soignants.');return json({episode:await modifier(env,acteur,rec,{status:'clos',data:{...rec.data,closPar:acteur.nom,closLe:maintenant()}},'cloture')})}
   return json({error:'Action inconnue.'},400)}},
 /* 5. Transfusion */
 transfusion:{
  async get({env,acl,q,ienv}){const stay=q('stay');
   if(!stay){if(!est(acl,['anesthesiste','chirurgien','infirmier']))return json({error:'Réservé aux soignants.'},403);const all=visibles(acl,await lire(env,'transfusion',{limit:500}));return json({tracabilite:M.tracabilite(all.filter(r=>r.kind==='poche').map(r=>({id:r.id,stay:r.stay,...r.data})),maintenant()),commandes:all.filter(r=>r.kind==='commande'&&r.status!=='recue'),mode:etatConnecteur('efs',ienv).mode})}
   if(!cliniqueSejour(acl,stay))return json({error:'Séjour hors habilitation.'},403);
   await acl.log('read','marche/transfusion','allowed','Dossier transfusionnel',stay);return json({elements:await lire(env,'transfusion',{stay}),mode:etatConnecteur('efs',ienv).mode})},
  async post({env,acl,acteur,ienv,refuse},d,action){
   const stay=t(d.stay);if(!cliniqueSejour(acl,stay)||!est(acl,['anesthesiste','chirurgien','infirmier']))return refuse('Séjour hors habilitation.');
   const el=await lire(env,'transfusion',{stay}),poches=el.filter(r=>r.kind==='poche');
   const groupage=()=>M.groupeValide(el.filter(r=>r.kind==='determination').map(r=>r.data)),rai=()=>{const x=el.filter(r=>r.kind==='rai')[0];return x?M.raiValide(x.data,maintenant(),{antecedentsRecents:x.data.antecedentsRecents!==false}):{valide:false,motif:'Pas de RAI.'}};
   const log=(r)=>acl.log('write','marche/transfusion','allowed',r,stay);
   if(action==='determination'){const g=M.parseGroupe(d.groupe);if(!g||!g.rhd)return json({error:'Groupe ABO et RhD attendus (ex. A+, O-).'},400);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t(d.prelevement)))return json({error:'Date et heure du prélèvement attendues.'},400);
    const r=await creer(env,acteur,'transfusion','determination',{stay,data:{groupe:g.abo+g.rhd,phenotype:court(d.phenotype,80),prelevement:t(d.prelevement),numeroPrelevement:court(d.numeroPrelevement,60),laboratoire:court(d.laboratoire,120)}});await log('Détermination de groupe');return json({element:r,groupage:groupage()})}
   if(action==='rai'){if(!['negative','positive'].includes(d.resultat))return json({error:'Résultat de RAI attendu.'},400);const r=await creer(env,acteur,'transfusion','rai',{stay,data:{prelevement:t(d.prelevement),resultat:d.resultat,specificite:court(d.specificite,120),antecedentsRecents:d.antecedentsRecents!==false}});await log('RAI');return json({element:r})}
   if(action==='commande'){if(!est(acl,MED))return refuse('La prescription de PSL est médicale.');const produits=(Array.isArray(d.produits)?d.produits:[]).filter(p=>M.PSL[p.type]&&Number(p.quantite)>=1&&Number(p.quantite)<=20).map(p=>({type:p.type,quantite:Number(p.quantite)}));
    if(!produits.length)return json({error:'Indiquez au moins un produit et sa quantité.'},400);if(t(d.indication).length<5)return json({error:'Indication obligatoire (ex. Hb 6,8 g/dL, saignement actif).'},400);
    const urgence=['vitale-immediate','vitale','relative','programmee'].includes(d.urgence)?d.urgence:'programmee',g=groupage(),r_=rai();
    const alertes=[];if(urgence!=='vitale-immediate'&&!g.valide)alertes.push(g.motif);if(urgence!=='vitale-immediate'&&produits.some(p=>p.type==='CGR')&&!r_.valide)alertes.push(r_.motif);
    if(alertes.length&&!d.forcer)return json({error:'Commande bloquée : '+alertes.join(' ')+' En urgence vitale immédiate, la délivrance se fait sans ces documents (O RhD négatif).',alertes},400);
    let envoi;try{envoi=await envoyer('efs',{corps:JSON.stringify({type:'commande-psl',produits,urgence,indication:court(d.indication,300),groupe:g.groupe||'inconnu'}),type:'application/json'},ienv)}catch(e){envoi={ok:false,detail:court(e.message,200)}}
    const r=await creer(env,acteur,'transfusion','commande',{stay,status:envoi.ok?'envoyee':'echec',data:{produits,urgence,indication:court(d.indication,300),groupe:g.groupe||'',prescripteur:acteur.nom,envoi}});await log('Commande de PSL');return json({element:r},envoi.ok?200:502)}
   if(action==='reception'){const cmd=el.find(r=>r.id===d.commande&&r.kind==='commande');if(!cmd)return json({error:'Commande introuvable.'},404);
    const liste=(Array.isArray(d.poches)?d.poches:[]).map(p=>({numero:court(p.numero,40),type:p.type,groupe:t(p.groupe).toUpperCase(),peremption:t(p.peremption)})).filter(p=>p.numero&&M.PSL[p.type]&&M.parseGroupe(p.groupe));
    if(!liste.length)return json({error:'Saisissez chaque poche reçue (numéro, type, groupe, péremption).'},400);if(liste.some(p=>poches.some(x=>x.data.numero===p.numero)))return json({error:'Poche déjà enregistrée.'},409);
    const at=maintenant(),out=[];for(const p of liste)out.push(await creer(env,acteur,'transfusion','poche',{stay,status:'recue',ref:p.numero,data:{...p,commande:cmd.id,reception:at,recuPar:acteur.nom,surveillance:[]}}));
    await modifier(env,acteur,cmd,{status:'recue'},'reception');await log('Réception de '+out.length+' poche(s)');return json({poches:out})}
   const poche=poches.find(r=>r.id===d.poche);if(!poche)return json({error:'Poche introuvable.'},404);
   if(action==='pose'){if(poche.status!=='recue')return json({error:'Poche déjà posée ou terminée.'},409);const g=groupage(),r_=rai();
    const c=M.controleUltime({poche:poche.data,receveur:g.groupe||t(d.groupeConnu),maintenant:maintenant(),carte:d.carte||{},items:d.items||{},raiPositive:!!r_.positive});
    if(!g.valide&&d.urgenceVitale!==true)c.erreurs.push(g.motif);
    if(!c.ok||c.erreurs.length){await acl.log('write','marche/transfusion','denied','Contrôle ultime non conforme',stay);return json({error:'Contrôle ultime non conforme : ne pas transfuser.',erreurs:c.erreurs},400)}
    if(!d.surveillanceAvant||!Number(d.surveillanceAvant.sbp))return json({error:'Constantes avant la pose obligatoires (PA, FC, température).'},400);
    const r=await modifier(env,acteur,poche,{status:'posee',data:{...poche.data,cupt:{items:d.items,carte:d.carte||{},alertes:c.alertes,par:acteur.nom,at:maintenant()},pose:{debut:maintenant(),par:acteur.nom},surveillance:[{moment:'avant',...d.surveillanceAvant,at:maintenant(),par:acteur.nom}]}},'pose');await log('Pose de la poche '+poche.data.numero);return json({element:r,alertes:c.alertes})}
   if(action==='surveillance'){if(poche.status!=='posee')return json({error:'Poche non en cours.'},409);const m={moment:['15min','pendant','fin'].includes(d.moment)?d.moment:'pendant',...(d.mesures||{}),signes:(d.mesures?.signes||[]).filter(s=>M.SIGNES_EIR.includes(s)),at:maintenant(),par:acteur.nom};
    const alertes=M.alertesSurveillance(poche.data.surveillance[0],m),data={...poche.data,surveillance:[...poche.data.surveillance,m]};let status='posee';if(m.moment==='fin'){data.pose={...data.pose,fin:maintenant()};status='terminee'}
    if(alertes.length){data.alerte={signes:alertes,at:maintenant()};status='arretee'}
    const r=await modifier(env,acteur,poche,{status,data},'surveillance');await log(alertes.length?'Transfusion arrêtée : '+alertes.join(', '):'Surveillance');return json({element:r,alertes})}
   if(action==='devenir'){if(!['transfusee','partielle','detruite','rendue'].includes(d.devenir))return json({error:'Devenir inconnu.'},400);const r=await modifier(env,acteur,poche,{data:{...poche.data,devenir:d.devenir,devenirLe:maintenant(),devenirPar:acteur.nom}},'devenir');await log('Devenir de la poche '+poche.data.numero);return json({element:r})}
   if(action==='eir'){const grade=Number(d.grade);if(!M.GRAVITE_EIR[grade])return json({error:'Grade de gravité attendu (1 à 4).'},400);
    const ei=await creer(env,acteur,'evenements','ei',{stay,status:'declare',day:aujourdhui(),data:{categorie:'transfusion',gravite:Math.min(5,grade+1),date:aujourdhui(),description:'Effet indésirable receveur (poche '+poche.data.numero+') : '+court(d.description,2000),consequence:grade>=3?(grade===4?'deces':'pronostic'):'temporaire',anonyme:false,lieu:'',actions:[],eir:{poche:poche.data.numero,grade,signes:(d.signes||[]).filter(s=>M.SIGNES_EIR.includes(s))}}});
    const r=await modifier(env,acteur,poche,{data:{...poche.data,eir:{grade,ei:ei.id,at:maintenant(),par:acteur.nom}}},'eir');await log('Effet indésirable receveur (grade '+grade+')');return json({element:r,ei})}
   return json({error:'Action inconnue.'},400)}},
 /* 6. Événements indésirables et RMM */
 evenements:{
  async get({env,acl}){const gestion=est(acl,['administration']),medecin=est(acl,MED);
   const ei=(await lire(env,'evenements',{kind:'ei',limit:500})).filter(r=>gestion||r.parId===String(acl.profile.user_id)||(medecin&&r.stay&&cliniqueSejour(acl,r.stay)));
   const rmm=medecin||gestion?await lire(env,'evenements',{kind:'rmm',limit:100}):[];
   await acl.log('read','marche/evenements','allowed','Événements indésirables');
   return json({ei:ei.map(r=>!gestion&&r.data.anonyme&&r.parId!==String(acl.profile.user_id)?{...r,par:'Déclarant confidentiel',parId:''}:r).map(r=>({...r,echeances:M.echeancesEi(r.data),eigs:M.eigs(r.data)})),rmm,gestion,medecin})},
  async post({env,acl,acteur,refuse},d,action){
   const gestion=est(acl,['administration']),medecin=est(acl,MED);
   if(action==='declarer'){const data={categorie:d.categorie,gravite:Number(d.gravite),date:t(d.date),description:court(d.description,6000),consequence:d.consequence,lieu:court(d.lieu,200),mesuresImmediates:court(d.mesuresImmediates,2000),anonyme:!!d.anonyme,actions:[]};
    const err=M.erreurEi(data);if(err)return json({error:err},400);const stay=t(d.stay);if(stay&&!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');
    const r=await creer(env,acteur,'evenements','ei',{stay,status:'declare',day:data.date.slice(0,10),data});await acl.log('write','marche/evenements','allowed','Déclaration d’un événement indésirable'+(M.eigs(data)?' (EIGS)':''));return json({ei:{...r,echeances:M.echeancesEi(data),eigs:M.eigs(data)}})}
   if(action.startsWith('rmm')){if(!medecin&&!gestion)return refuse('RMM réservées aux médecins et à la qualité.');
    if(action==='rmm-creer'){if(!/^\d{4}-\d{2}-\d{2}$/.test(t(d.date))||t(d.titre).length<3)return json({error:'Date et intitulé de la séance attendus.'},400);return json({rmm:await creer(env,acteur,'evenements','rmm',{status:'prevue',day:t(d.date),data:{date:t(d.date),titre:court(d.titre,200),specialite:court(d.specialite,100),cas:[],presents:[],actions:[]}})})}
    const rec=await un(env,'evenements',d.id);if(!rec||rec.kind!=='rmm')return json({error:'Séance introuvable.'},404);
    if(action==='rmm-cas'){const c={id:randomUUID(),ei:t(d.ei),resume:court(d.resume,2000),causes:(d.causes||[]).filter(x=>M.CAUSES_ALARM[x]),evitable:['oui','non','peut-etre'].includes(d.evitable)?d.evitable:'',analyse:court(d.analyse,4000)};if(c.resume.length<5)return json({error:'Résumé du cas (anonymisé) attendu.'},400);return json({rmm:await modifier(env,acteur,rec,{data:{...rec.data,cas:[...rec.data.cas,c]}},'rmm-cas')})}
    if(action==='rmm-conclure'){const presents=(Array.isArray(d.presents)?d.presents:t(d.presents).split(/[\n,;]+/)).map(x=>court(x,120)).filter(Boolean);if(!presents.length)return json({error:'Liste des présents attendue (traçabilité DPC / certification).'},400);
     const actions=(d.actions||[]).map(a=>({id:randomUUID(),libelle:court(a.libelle,300),responsable:court(a.responsable,120),echeance:t(a.echeance),fait:false})).filter(a=>a.libelle);
     return json({rmm:await modifier(env,acteur,rec,{status:'tenue',data:{...rec.data,presents,conclusion:court(d.conclusion,4000),actions}},'rmm-conclusion')})}
    return json({error:'Action inconnue.'},400)}
   const rec=await un(env,'evenements',d.id);if(!rec||rec.kind!=='ei')return json({error:'Événement introuvable.'},404);
   if(!gestion)return refuse('Suivi des événements réservé à la qualité (profil Administration) et aux administrateurs.');
   if(action==='statut'){const err=M.transitionEi(rec.status,d.vers,rec.data);if(err)return json({error:err},400);const r=await modifier(env,acteur,rec,{status:d.vers},'statut-'+d.vers);await acl.log('write','marche/evenements','allowed','Événement indésirable : '+M.STATUTS_EI[d.vers]);return json({ei:r})}
   if(action==='analyse'){return json({ei:await modifier(env,acteur,rec,{data:{...rec.data,causes:(d.causes||[]).filter(x=>M.CAUSES_ALARM[x]),analyse:court(d.analyse,6000),evitable:['oui','non','peut-etre'].includes(d.evitable)?d.evitable:''}},'analyse')})}
   if(action==='action'){if(t(d.libelle).length<3)return json({error:'Libellé de l’action attendu.'},400);return json({ei:await modifier(env,acteur,rec,{data:{...rec.data,actions:[...(rec.data.actions||[]),{id:randomUUID(),libelle:court(d.libelle,300),responsable:court(d.responsable,120),echeance:t(d.echeance),fait:false}]}},'action')})}
   if(action==='action-faite'){return json({ei:await modifier(env,acteur,rec,{data:{...rec.data,actions:(rec.data.actions||[]).map(a=>a.id===d.actionId?{...a,fait:true,faitLe:maintenant(),faitPar:acteur.nom}:a)}},'action-faite')})}
   if(action==='declaration-externe'){const k={ars1:'arsVolet1',ars2:'arsVolet2',hemo:'efit',ansm:'ansm',crpv:'crpv'}[d.cle];if(!k)return json({error:'Déclaration inconnue.'},400);return json({ei:await modifier(env,acteur,rec,{data:{...rec.data,[k]:{at:maintenant(),par:acteur.nom,reference:court(d.reference,120)}}},'declaration-'+d.cle)})}
   return json({error:'Action inconnue.'},400)}},
 /* 7. Agenda de consultation d'anesthésie */
 agenda:{
  async get({env,acl,q}){if(!est(acl,['anesthesiste','chirurgien','secretariat']))return json({error:'Agenda réservé aux médecins et au secrétariat.'},403);
   const du=q('du')||aujourdhui(),au=q('au')||new Date(Date.parse(du)+13*86400000).toISOString().slice(0,10);
   const plages=(await lire(env,'agenda',{kind:'plage',depuis:du,limit:2000})).filter(p=>p.day<=au),rdv=(await lire(env,'agenda',{kind:'rdv',depuis:du,limit:2000})).filter(p=>p.day<=au);
   const medecins=((await env.DB.prepare("SELECT user_id,display_name FROM professional_profiles WHERE profession='anesthesiste' AND active=1 ORDER BY display_name").all()).results||[]).map(r=>({id:r.user_id,nom:r.display_name}));
   await acl.log('read','marche/agenda','allowed','Agenda des consultations',du+' → '+au);
   return json({du,au,medecins,plages:plages.map(p=>({id:p.id,...p.data,statut:p.status})),rdv:rdv.map(r=>({id:r.id,...(voitSejour(acl,r.stay)?r.data:{plage:r.data.plage,heure:r.data.heure,date:r.data.date,patient:'(hors de vos équipes)'}),stay:voitSejour(acl,r.stay)?r.stay:'',statut:r.status}))})},
  async post({env,acl,acteur,refuse,url},d,action){
   if(!est(acl,['anesthesiste','chirurgien','secretariat']))return refuse('Agenda réservé aux médecins et au secrétariat.');
   const plages=async()=>(await lire(env,'agenda',{kind:'plage',limit:2000})).map(p=>({id:p.id,...p.data,statut:p.status,_r:p}));
   if(action==='plage'){if(!est(acl,['anesthesiste','secretariat']))return refuse('Plages ouvertes par l’anesthésiste ou le secrétariat.');
    const medecin=acl.job==='anesthesiste'&&!acl.isAdmin?String(acl.profile.user_id):t(d.medecin);const prof=await env.DB.prepare("SELECT display_name FROM professional_profiles WHERE user_id=? AND profession='anesthesiste'").bind(medecin).first();if(!prof)return json({error:'Choisissez l’anesthésiste.'},400);
    const p={date:t(d.date),debut:t(d.debut),fin:t(d.fin),duree:Number(d.duree)||20,medecin,medecinNom:prof.display_name,lieu:court(d.lieu,120)||'Cabinet d’anesthésie',mode:d.mode==='teleconsultation'?'teleconsultation':'presentiel'};
    const err=M.erreurPlage(p,await plages());if(err)return json({error:err},400);return json({plage:await creer(env,acteur,'agenda','plage',{status:'ouverte',day:p.date,ref:medecin,data:p})})}
   if(action==='fermer-plage'){const rec=await un(env,'agenda',d.id);if(!rec||rec.kind!=='plage')return json({error:'Plage introuvable.'},404);const pris=(await lire(env,'agenda',{kind:'rdv',day:rec.day})).filter(r=>r.data.plage===rec.id&&r.status!=='annule');if(pris.length)return json({error:pris.length+' rendez-vous dans cette plage : déplacez-les ou annulez-les d’abord.'},409);return json({plage:await modifier(env,acteur,rec,{status:'fermee'},'fermeture')})}
   if(action==='rdv'){const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');return json(await reserver(env,acteur,{stay,plage:t(d.plage),heure:t(d.heure),motif:court(d.motif,200),par:'secretariat'}))}
   if(action==='rdv-statut'){const rec=await un(env,'agenda',d.id);if(!rec||rec.kind!=='rdv')return json({error:'Rendez-vous introuvable.'},404);if(!voitSejour(acl,rec.stay))return refuse('Séjour hors habilitation.');if(!['confirme','honore','absent','annule'].includes(d.statut))return json({error:'Statut inconnu.'},400);return json({rdv:await modifier(env,acteur,rec,{status:d.statut},'statut-'+d.statut)})}
   if(action==='lien'){const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');return json(await envoyerLien(env,acl,acteur,{stay,purpose:'rdv',chemin:'/rendez-vous.html',jours:21,texte:etab=>etab+' : choisissez l’horaire de votre consultation d’anesthésie avec ce lien personnel.',origin:url.origin}))}
   return json({error:'Action inconnue.'},400)}},
 /* 9. Honoraires et paiements */
 honoraires:{
  async get({env,acl,q,ienv}){if(!est(acl,['anesthesiste','chirurgien','secretariat','facturation']))return json({error:'Réservé aux praticiens, au secrétariat et à la facturation.'},403);
   const stay=q('stay'),rows=stay?(voitSejour(acl,stay)?await lire(env,'honoraires',{stay}):null):visibles(acl,await lire(env,'honoraires',{limit:500}),false);if(!rows)return json({error:'Séjour hors habilitation.'},403);
   await acl.log('read','marche/honoraires','allowed','Honoraires et paiements',stay);
   return json({elements:rows.filter(r=>r.kind!=='devis'||est(acl,['anesthesiste','chirurgien','facturation'])||r.parId===String(acl.profile.user_id)),connecteurs:{sesam:etatConnecteur('sesam',ienv),paiement:etatConnecteur('paiement',ienv)}})},
  async post({env,acl,acteur,ienv,refuse,url},d,action){
   const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');
   if(action==='devis'){if(!est(acl,MED))return refuse('Le devis est établi par le praticien.');const h=M.calculHonoraires(d.lignes,{secteur:t(d.secteur)||'2',optam:!!d.optam});if(h.erreur)return json({error:h.erreur},400);if(!h.lignes.length)return json({error:'Ajoutez au moins un acte.'},400);
    return json({element:await creer(env,acteur,'honoraires','devis',{stay,status:'brouillon',data:{...h,secteur:t(d.secteur)||'2',optam:!!d.optam,praticien:acteur.nom,rpps:acl.profile.rpps||'',dateIntervention:t(d.dateIntervention)}})})}
   if(action==='envoyer-devis'){const rec=await un(env,'honoraires',d.id);if(!rec||rec.kind!=='devis'||rec.stay!==stay)return json({error:'Devis introuvable.'},404);if(rec.parId!==String(acl.profile.user_id)&&!acl.isAdmin)return refuse('Seul le praticien auteur envoie son devis.');
    const r=await envoyerLien(env,acl,acteur,{stay,purpose:'devis',record:rec.id,chemin:'/devis.html',jours:30,texte:etab=>etab+' : un document d’information sur vos honoraires est à lire et à signer avec ce lien personnel.',origin:url.origin});if(r.ok)await modifier(env,acteur,rec,{status:'envoye',data:{...rec.data,envoyeLe:maintenant()}},'envoi');return json(r,r.ok?200:502)}
   if(action==='fse'){if(!est(acl,MED))return refuse('La feuille de soins est établie par le praticien.');const rec=await un(env,'honoraires',d.id);if(!rec||rec.kind!=='devis'||rec.stay!==stay)return json({error:'Devis introuvable.'},404);if(rec.data.devisObligatoire&&rec.status!=='signe')return json({error:'Dépassement ≥ 70 € : le devis doit être signé par le patient avant la facturation.'},400);
    const core=await docData(env,'stay/'+stay+'/core')||{},i=core.identity||{};const corps=JSON.stringify({type:'fse',praticien:{nom:rec.data.praticien,rpps:rec.data.rpps},patient:{nom:i.lastName,prenom:i.firstName,naissance:i.birthDate,ins:i.ins||''},actes:rec.data.lignes,total:rec.data.total,depassement:rec.data.depassement,pav:rec.data.pav});
    let envoi;try{envoi=await envoyer('sesam',{corps,type:'application/json'},ienv)}catch(e){envoi={ok:false,detail:court(e.message,200)}}
    const r=await creer(env,acteur,'honoraires','fse',{stay,status:envoi.ok?'transmise':'echec',data:{devis:rec.id,total:rec.data.total,base:rec.data.base,depassement:rec.data.depassement,pav:rec.data.pav,envoi}});await acl.log('write','marche/honoraires',envoi.ok?'allowed':'denied','Feuille de soins',stay);return json({element:r},envoi.ok?200:502)}
   if(action==='paiement'){if(!est(acl,['secretariat','facturation']))return refuse('Demandes de paiement : secrétariat ou facturation.');const montant=M.centimes(d.montant);if(!Number.isFinite(montant)||montant<100||montant>1000000)return json({error:'Montant entre 1 € et 10 000 €.'},400);
    const objet={chambre:'Chambre particulière',depassement:'Complément d’honoraires',autre:'Prestation'}[d.objet]||'Prestation';const reference='IAS-'+randomBytes(4).toString('hex').toUpperCase();
    const rec=await creer(env,acteur,'honoraires','paiement',{stay,status:'a-payer',ref:reference,data:{objet,montant,reference,libelle:court(d.libelle,120)||objet,mode:etatConnecteur('paiement',ienv).mode}});
    const r=await envoyerLien(env,acl,acteur,{stay,purpose:'paiement',record:rec.id,chemin:'/paiement.html',jours:30,texte:etab=>etab+' : votre règlement ('+M.euros(montant)+', réf. '+reference+') peut se faire en ligne avec ce lien personnel.',origin:url.origin});
    const x=await modifier(env,acteur,rec,{status:r.ok?'lien':'a-payer',data:{...rec.data,lien:r.ok?{at:maintenant(),canaux:r.canaux}:null}},'lien');return json({element:x,...r})}
   if(action==='paiement-statut'){if(!est(acl,['secretariat','facturation']))return refuse('Secrétariat ou facturation.');const rec=await un(env,'honoraires',d.id);if(!rec||rec.kind!=='paiement')return json({error:'Paiement introuvable.'},404);if(!['paye','annule','rembourse'].includes(d.statut))return json({error:'Statut inconnu.'},400);
    return json({element:await modifier(env,acteur,rec,{status:d.statut,data:{...rec.data,manuel:{par:acteur.nom,at:maintenant(),moyen:court(d.moyen,60)}}},'statut-'+d.statut)})}
   return json({error:'Action inconnue.'},400)}},
 /* 10a. Stérilisation */
 sterilisation:{
  async get({env,acl}){if(!(est(acl,['infirmier','pharmacien','anesthesiste','chirurgien'])&&acl.bloc!==false))return json({error:'Stérilisation réservée au bloc et à la pharmacie.'},403);
   const boites=await lire(env,'sterilisation',{kind:'boite',limit:1000}),cycles=await lire(env,'sterilisation',{kind:'cycle',limit:200}),now=maintenant();
   return json({boites:boites.map(b=>({id:b.id,...b.data,etat:b.status,etatCalcule:M.etatBoite({...b.data,etat:b.status},now),version:b.version})),cycles:cycles.map(c=>({id:c.id,...c.data,statut:c.status,par:c.par,at:c.at}))})},
  async post({env,acl,acteur,refuse},d,action){
   if(!(est(acl,['infirmier','pharmacien'])&&acl.bloc!==false))return refuse('Stérilisation : infirmier(ère) de bloc ou pharmacien.');
   if(action==='boite'){if(t(d.nom).length<2||t(d.code).length<2)return json({error:'Nom et code de la boîte attendus.'},400);if(!M.PEREMPTION_JOURS[d.conditionnement])return json({error:'Conditionnement : conteneur, double sachet ou feuille.'},400);
    if((await lire(env,'sterilisation',{kind:'boite',ref:t(d.code)})).length)return json({error:'Code déjà utilisé.'},409);
    return json({boite:await creer(env,acteur,'sterilisation','boite',{status:'sale',ref:t(d.code),data:{nom:court(d.nom,120),code:court(d.code,40),specialite:court(d.specialite,80),composition:court(d.composition,3000),conditionnement:d.conditionnement,historique:[]}})})}
   const boite=d.boite?await un(env,'sterilisation',d.boite):null;
   if(action==='etat'){if(!boite)return json({error:'Boîte introuvable.'},404);if(!['lavage','conditionnee','reforme','sale'].includes(d.etat))return json({error:'Étape inconnue.'},400);if(boite.status==='quarantaine'&&!est(acl,['pharmacien']))return refuse('Boîte en quarantaine ATNC : décision du pharmacien.');
    return json({boite:await modifier(env,acteur,boite,{status:d.etat,data:{...boite.data,historique:[...boite.data.historique,{etat:d.etat,at:maintenant(),par:acteur.nom}].slice(-200)}},'etat-'+d.etat)})}
   if(action==='cycle'){const ids=(Array.isArray(d.boites)?d.boites:[]).map(t);if(!ids.length)return json({error:'Sélectionnez les boîtes de la charge.'},400);const bs=[];for(const id of ids){const b=await un(env,'sterilisation',id);if(!b||b.kind!=='boite')return json({error:'Boîte introuvable.'},404);if(b.status!=='conditionnee')return json({error:b.data.nom+' : seule une boîte conditionnée entre dans une charge.'},400);bs.push(b)}
    const c={autoclave:court(d.autoclave,40),numero:court(d.numero,40),programme:court(d.programme,80)||'134 °C 18 min',bowieDick:d.bowieDick,indicateur:d.indicateur,enregistrement:d.enregistrement,siccite:d.siccite,boites:bs.map(b=>({id:b.id,code:b.data.code,nom:b.data.nom}))};
    if(!c.autoclave||!c.numero)return json({error:'Autoclave et numéro de cycle attendus.'},400);
    const defauts=M.liberationCycle(c),date=maintenant(),statut=defauts.length?'non-libere':'libere';
    const cyc=await creer(env,acteur,'sterilisation','cycle',{status:statut,ref:c.numero,day:aujourdhui(),data:{...c,defauts,liberePar:defauts.length?'':acteur.nom,libereLe:defauts.length?'':date}});
    if(!defauts.length)for(const b of bs)await modifier(env,acteur,b,{status:'sterile',data:{...b.data,cycle:{id:cyc.id,numero:c.numero,autoclave:c.autoclave,date},peremption:M.peremption(b.data.conditionnement,date),historique:[...b.data.historique,{etat:'sterile',at:date,par:acteur.nom,cycle:c.numero}].slice(-200)}},'liberation');
    await acl.log('write','marche/sterilisation','allowed','Cycle '+c.numero+' '+(defauts.length?'non libéré':'libéré'));return json({cycle:cyc,defauts})}
   if(action==='utiliser'){if(!boite)return json({error:'Boîte introuvable.'},404);const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');const e=M.etatBoite({...boite.data,etat:boite.status},maintenant());if(!e.utilisable)return json({error:boite.data.nom+' : '+e.label+'. Utilisation refusée.'},400);
    const atnc=M.risqueAtnc(d.atnc||{}),r=await modifier(env,acteur,boite,{status:atnc?'quarantaine':'utilisee',data:{...boite.data,derniereUtilisation:{stay,at:maintenant(),par:acteur.nom,cycle:boite.data.cycle?.numero||''},historique:[...boite.data.historique,{etat:atnc?'quarantaine':'utilisee',stay,at:maintenant(),par:acteur.nom}].slice(-200)}},'utilisation');
    await creer(env,acteur,'sterilisation','tracabilite',{stay,ref:boite.data.code,day:aujourdhui(),data:{boite:boite.data.code,nom:boite.data.nom,cycle:boite.data.cycle?.numero||'',autoclave:boite.data.cycle?.autoclave||'',atnc}});
    await acl.log('write','marche/sterilisation','allowed','Boîte '+boite.data.code+' utilisée',stay);return json({boite:r,quarantaine:atnc})}
   return json({error:'Action inconnue.'},400)}},
 /* 10b. Brancardage */
 brancardage:{
  async get({env,acl,q}){if(!LEC(acl,[...CLIN,'secretariat']))return json({error:'Réservé aux soignants.'},403);const jourQ=q('jour')||aujourdhui(),now=maintenant();
   const rows=await lire(env,'brancardage',{day:jourQ});return json({jour:jourQ,demandes:rows.map(r=>({id:r.id,...(voitSejour(acl,r.stay)?r.data:{...r.data,patient:'Patient (hors de vos équipes)'}),stay:voitSejour(acl,r.stay)?r.stay:'',etat:r.status,par:r.par,at:r.at,retard:M.retardTransport({...r.data,etat:r.status,at:r.at},now)}))})},
  async post({env,acl,acteur,refuse},d,action){
   if(!LEC(acl,[...CLIN,'secretariat']))return refuse('Réservé aux soignants.');
   if(action==='demande'){const stay=t(d.stay);if(!voitSejour(acl,stay))return refuse('Séjour hors habilitation.');if(!t(d.depart)||!t(d.arrivee))return json({error:'Départ et arrivée attendus.'},400);
    const core=await docData(env,'stay/'+stay+'/core')||{},i=core.identity||{};
    return json({demande:await creer(env,acteur,'brancardage','demande',{stay,status:'demande',day:aujourdhui(),data:{patient:[t(i.lastName).toUpperCase(),t(i.firstName)].filter(Boolean).join(' '),depart:court(d.depart,80),arrivee:court(d.arrivee,80),priorite:M.PRIORITES[d.priorite]?d.priorite:'normal',mode:['lit','brancard','fauteuil','pied'].includes(d.mode)?d.mode:'brancard',oxygene:!!d.oxygene,isolement:court(d.isolement,60),heureSouhaitee:t(d.heureSouhaitee),commentaire:court(d.commentaire,300),etapes:[]}})})}
   const rec=await un(env,'brancardage',d.id);if(!rec)return json({error:'Demande introuvable.'},404);
   if(action==='etat'){if(!(M.SUIVANT_TRANSPORT[rec.status]||[]).includes(d.vers))return json({error:'Étape impossible.'},400);return json({demande:await modifier(env,acteur,rec,{status:d.vers,data:{...rec.data,etapes:[...rec.data.etapes,{etat:d.vers,at:maintenant(),par:acteur.nom}],...(d.vers==='pris'?{brancardier:court(d.brancardier,80)||acteur.nom}:{})}},'etat-'+d.vers)})}
   return json({error:'Action inconnue.'},400)}},
 /* 10c. Planning des équipes */
 planning:{
  async get({env,acl,q}){if(!LEC(acl,[...CLIN,'secretariat']))return json({error:'Réservé aux équipes.'},403);const du=q('du')||aujourdhui(),au=q('au')||du;
   const aff=(await lire(env,'planning',{kind:'affectation',depuis:du,limit:2000})).filter(r=>r.day<=au).map(r=>({id:r.id,...r.data,par:r.par}));
   return json({du,au,affectations:aff,salles:await salles(env),peutModifier:peutPlanifier(acl)})},
  async post({env,acl,acteur,refuse},d,action){
   if(!peutPlanifier(acl))return refuse('Planning modifié par les anesthésistes, la cadre de bloc ou un administrateur.');
   if(action==='affecter'){const a={date:t(d.date),personne:court(d.personne,120),fonction:d.fonction,salle:court(d.salle,40),debut:t(d.debut)||'08:00',fin:t(d.fin)||'18:00',commentaire:court(d.commentaire,200)};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!a.personne||!M.FONCTIONS[a.fonction])return json({error:'Date, personne et fonction attendues.'},400);
    const jourA=(await lire(env,'planning',{kind:'affectation',day:a.date})).map(r=>({id:r.id,...r.data}));const conflits=M.chevauchements([...jourA,{...a,id:'nouveau'}]).filter(c=>c.a==='nouveau'||c.b==='nouveau');
    if(conflits.length&&!d.forcer)return json({error:conflits[0].motif,conflits},409);
    return json({affectation:await creer(env,acteur,'planning','affectation',{day:a.date,ref:a.personne.toLowerCase(),data:a})})}
   if(action==='retirer'){const rec=await un(env,'planning',d.id);if(!rec)return json({error:'Affectation introuvable.'},404);await modifier(env,acteur,rec,{status:'retiree'},'retrait');await env.DB.prepare("UPDATE marche_records SET module='planning-retire' WHERE id=?").bind(rec.id).run();return json({ok:true})}
   return json({error:'Action inconnue.'},400)}},
 /* 10d. Messagerie entre soignants */
 messagerie:{
  async get({env,acl,q}){if(!acl.job||['unassigned'].includes(acl.job))return json({error:'Messagerie réservée aux professionnels.'},403);const fil=q('fil'),moi=String(acl.profile.user_id);
   if(fil){if(!accesFil(acl,fil))return json({error:'Discussion hors habilitation.'},403);const msgs=(await lire(env,'messagerie',{ref:fil,limit:300})).reverse();await acl.log('read','marche/messagerie','allowed','Discussion',fil);
    return json({fil,messages:msgs.map(m=>({id:m.id,texte:m.data.texte,urgent:m.data.urgent,auteur:m.par,auteurId:m.parId,at:m.at,lus:m.data.lus||[],moi:m.parId===moi}))})}
   const tous=(await lire(env,'messagerie',{limit:2000})).filter(m=>accesFil(acl,m.ref)),fils={};
   for(const m of tous){const f=fils[m.ref]??={fil:m.ref,dernier:m.at,apercu:m.data.texte.slice(0,90),auteur:m.par,nonLus:0,urgent:false};if(m.parId!==moi&&!(m.data.lus||[]).includes(moi)){f.nonLus++;if(m.data.urgent)f.urgent=true}}
   return json({fils:Object.values(fils).sort((a,b)=>b.dernier.localeCompare(a.dernier)),equipes:EQUIPES.filter(e=>accesFil(acl,'equipe:'+e.id))})},
  async post({env,acl,acteur,refuse},d,action){
   const fil=t(d.fil);if(!accesFil(acl,fil))return refuse('Discussion hors habilitation.');const moi=String(acl.profile.user_id);
   if(action==='envoyer'){const err=M.erreurMessage({texte:d.texte,fil});if(err)return json({error:err},400);return json({message:await creer(env,acteur,'messagerie','message',{ref:fil,stay:fil.startsWith('sejour:')?fil.slice(7):'',day:aujourdhui(),data:{texte:court(d.texte,4000),urgent:!!d.urgent,lus:[moi]}})})}
   if(action==='lu'){const msgs=await lire(env,'messagerie',{ref:fil,limit:300});let n=0;for(const m of msgs)if(!(m.data.lus||[]).includes(moi)){await env.DB.prepare('UPDATE marche_records SET data=? WHERE id=?').bind(JSON.stringify({...m.data,lus:[...(m.data.lus||[]),moi]}),m.id).run();n++}return json({lus:n})}
   return json({error:'Action inconnue.'},400)}}
};
const EQUIPES=[{id:'bloc',label:'Équipe du bloc'},{id:'anesthesie',label:'Anesthésie'},{id:'etage',label:'Services d’hospitalisation'},{id:'tous',label:'Toute la clinique'}];
function accesFil(acl,fil){if(!acl.active)return false;
 if(fil.startsWith('sejour:'))return voitSejour(acl,fil.slice(7))&&[...CLIN,'secretariat'].includes(acl.job);
 const e=fil.slice(7);if(!fil.startsWith('equipe:'))return false;
 if(e==='tous')return !['unassigned'].includes(acl.job);
 if(e==='bloc')return acl.isAdmin||(['anesthesiste','chirurgien','infirmier'].includes(acl.job)&&acl.bloc!==false);
 if(e==='anesthesie')return acl.isAdmin||acl.job==='anesthesiste'||(acl.job==='infirmier'&&acl.bloc!==false);
 if(e==='etage')return acl.isAdmin||['anesthesiste','chirurgien','infirmier','pharmacien'].includes(acl.job);
 return false}
function peutPlanifier(acl){return acl.isAdmin||acl.job==='anesthesiste'||(acl.job==='infirmier'&&acl.poste==='cadre')}

/* ---------- Réservation d'un créneau (secrétariat ou patient) ---------- */
async function reserver(env,acteur,{stay,plage,heure,motif,par}){
 const p=await un(env,'agenda',plage);if(!p||p.kind!=='plage'||p.status!=='ouverte')throw Object.assign(Error('Plage introuvable ou fermée.'),{status:404});
 if(!M.creneaux({id:p.id,...p.data}).some(c=>c.heure===heure))throw Object.assign(Error('Horaire hors de la plage.'),{status:400});
 const rdvJour=await lire(env,'agenda',{kind:'rdv',day:p.day});
 if(rdvJour.some(r=>r.data.plage===p.id&&r.data.heure===heure&&r.status!=='annule'))throw Object.assign(Error('Créneau déjà pris : choisissez-en un autre.'),{status:409});
 const deja=(await lire(env,'agenda',{kind:'rdv',stay})).find(r=>!['annule','absent','honore'].includes(r.status)&&r.day>=aujourdhui());
 const core=await docData(env,'stay/'+stay+'/core')||{},ann=await docData(env,'stay/'+stay+'/surgicalAnnouncement')||{},i=core.identity||{};
 const alerte=M.alerteDelai(p.day,ann.published?.fields?.date||'');
 const rdv=await creer(env,acteur,'agenda','rdv',{stay,status:'reserve',day:p.day,ref:p.data.medecin,data:{plage:p.id,date:p.day,heure,duree:p.data.duree,medecin:p.data.medecin,medecinNom:p.data.medecinNom,lieu:p.data.lieu,mode:p.data.mode,patient:[t(i.lastName).toUpperCase(),t(i.firstName)].filter(Boolean).join(' '),naissance:t(i.birthDate),motif,par,alerte}});
 if(deja)await modifier(env,acteur,deja,{status:'annule',data:{...deja.data,remplacePar:rdv.id}},'deplacement');
 return {rdv:{id:rdv.id,...rdv.data,statut:rdv.status,stay},alerte,remplace:!!deja};
}

/* ---------- Liens personnels du patient (rendez-vous, devis, paiement) ---------- */
async function envoyerLien(env,acl,acteur,{stay,purpose,record='',chemin,jours,texte,origin}){
 const contact=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact||{},core=await docData(env,'stay/'+stay+'/core')||{},naissance=t(core.identity?.birthDate);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(naissance))return {ok:false,error:'Date de naissance du patient absente : le lien ne peut pas être protégé.'};
 const token=randomBytes(32).toString('hex'),at=maintenant(),expire=new Date(Date.now()+jours*86400000).toISOString();
 await env.DB.prepare('INSERT INTO marche_jetons(token_hash,purpose,record_id,stay_id,birth_date,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(sha(token),purpose,record,stay,naissance,acteur.id,at,expire).run();
 const lien=origin+chemin+'#acces='+token,messaging=env.MESSAGING,etab=messaging?.establishment||'La clinique',canaux=[],erreurs=[];
 if(messaging&&contact.phone){try{await messaging.sms({to:contact.phone,content:texte(etab)+' '+lien,tag:'iaselo-'+purpose});canaux.push('SMS '+mask(contact.phone))}catch(e){erreurs.push('SMS : '+court(e.message,120))}}
 if(messaging&&contact.email){try{await messaging.email({to:contact.email,subject:etab+' : lien personnel',text:texte(etab)+'\n\n'+lien+'\n\nCe lien est personnel ; votre date de naissance vous sera demandée.',tag:'iaselo-'+purpose});canaux.push('e-mail')}catch(e){erreurs.push('E-mail : '+court(e.message,120))}}
 await acl.log('patient-link','marche/'+purpose,canaux.length?'allowed':'denied','Lien patient ('+purpose+')',canaux.join(', ')||erreurs.join(' ')||'Aucune coordonnée vérifiée');
 // Sans coordonnée vérifiée ou sans service d'envoi, le lien est affiché pour être remis au patient (recette, guichet).
 return {ok:true,canaux,erreurs,lien:canaux.length?'':lien,expire};
}
async function authentifier(env,purpose,token,naissance){
 if(!/^[a-f0-9]{64}$/.test(t(token)))return {erreur:json({error:'Lien invalide.'},410)};
 const row=await env.DB.prepare('SELECT * FROM marche_jetons WHERE token_hash=? AND purpose=? AND revoked=0 AND expires_at>? AND failed_attempts<5').bind(sha(token),purpose,maintenant()).first();
 if(!row)return {erreur:json({error:'Lien expiré ou invalide. Contactez la clinique.'},410)};
 if(t(naissance)!==row.birth_date){await env.DB.prepare('UPDATE marche_jetons SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(row.token_hash).run();return {erreur:json({error:'Date de naissance incorrecte.'},403)}}
 return {row};
}
const journalPatient=(env,row,action,detail)=>env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,'patient',?,?,'allowed',?)").bind(maintenant(),action,'stay/'+row.stay_id,detail).run();
export async function patientMarcheApi(request,env){
 const url=new URL(request.url),[,, groupe,route]=url.pathname.split('/');
 if(request.method==='POST'&&groupe==='paiement'&&route==='stripe')return webhookStripe(request,env);
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await request.json()}catch{return json({error:'Requête illisible.'},400)}
 const purpose={rdv:'rdv',devis:'devis',paiement:'paiement'}[groupe];if(!purpose)return json({error:'Introuvable.'},404);
 const auth=await authentifier(env,purpose,d.token,d.naissance);if(auth.erreur)return auth.erreur;const row=auth.row,patient={id:'patient',nom:'Patient (lien personnel)'};
 const etab=env.ESTABLISHMENT||'';
 try{
 if(purpose==='rdv'){
  const ann=await docData(env,'stay/'+row.stay_id+'/surgicalAnnouncement')||{},dateInt=t(ann.published?.fields?.date),limite=dateInt?new Date(Date.parse(dateInt)-M.DELAI_MIN_CPA_JOURS*86400000).toISOString().slice(0,10):new Date(Date.now()+60*86400000).toISOString().slice(0,10),demain=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const plages=(await lire(env,'agenda',{kind:'plage',depuis:demain,limit:2000})).filter(p=>p.status==='ouverte'&&p.day<=limite).map(p=>({id:p.id,...p.data,statut:p.status}));
  const rdvs=(await lire(env,'agenda',{kind:'rdv',depuis:demain,limit:2000})).map(r=>({plage:r.data.plage,heure:r.data.heure,statut:r.status}));
  const actuel=(await lire(env,'agenda',{kind:'rdv',stay:row.stay_id})).find(r=>['reserve','confirme'].includes(r.status)&&r.day>=aujourdhui());
  if(route==='ouvrir'){await journalPatient(env,row,'patient-rdv-ouvrir','Prise de rendez-vous ouverte');return json({etablissement:etab,actuel:actuel?{date:actuel.data.date,heure:actuel.data.heure,medecin:actuel.data.medecinNom,lieu:actuel.data.lieu,mode:actuel.data.mode}:null,creneaux:M.libres(plages,rdvs).slice(0,400).map(c=>({plage:c.plage,date:c.date,heure:c.heure,medecin:c.medecinNom,lieu:c.lieu,mode:c.mode})),limite})}
  if(route==='reserver'){const p=plages.find(x=>x.id===t(d.plage));if(!p)return json({error:'Créneau indisponible.'},409);const r=await reserver(env,patient,{stay:row.stay_id,plage:p.id,heure:t(d.heure),motif:'Réservé par le patient',par:'patient'});await journalPatient(env,row,'patient-rdv-reserver',r.rdv.date+' '+r.rdv.heure);return json({rdv:{date:r.rdv.date,heure:r.rdv.heure,medecin:r.rdv.medecinNom,lieu:r.rdv.lieu,mode:r.rdv.mode}})}
 }
 if(purpose==='devis'){const rec=await un(env,'honoraires',row.record_id);if(!rec)return json({error:'Document introuvable.'},404);
  const vue={etablissement:etab,praticien:rec.data.praticien,secteur:rec.data.secteur,optam:rec.data.optam,lignes:rec.data.lignes,base:rec.data.base,total:rec.data.total,depassement:rec.data.depassement,dateIntervention:rec.data.dateIntervention,statut:rec.status,signature:rec.data.signature||null};
  if(route==='ouvrir'){await journalPatient(env,row,'patient-devis-ouvrir','Devis consulté');return json(vue)}
  if(route==='signer'){if(!['envoye'].includes(rec.status))return json({error:'Ce document a déjà reçu votre réponse.'},409);if(t(d.nom).length<3)return json({error:'Saisissez vos nom et prénom.'},400);
   const r=await modifier(env,patient,rec,{status:d.accepte?'signe':'refuse',data:{...rec.data,signature:{nom:court(d.nom,120),accepte:!!d.accepte,at:maintenant()}}},d.accepte?'signature-patient':'refus-patient');await journalPatient(env,row,'patient-devis-'+(d.accepte?'signe':'refuse'),'');return json({statut:r.status})}
 }
 if(purpose==='paiement'){const rec=await un(env,'honoraires',row.record_id);if(!rec)return json({error:'Paiement introuvable.'},404);
  const vue={etablissement:etab,objet:rec.data.libelle,montant:rec.data.montant,reference:rec.data.reference,statut:rec.status,simulation:etatConnecteur('paiement',env.INTEROP_ENV||{}).mode==='simulation'};
  if(route==='ouvrir'){await journalPatient(env,row,'patient-paiement-ouvrir','');return json(vue)}
  if(route==='payer'){if(rec.status==='paye')return json({statut:'paye'});const retour=url.origin+'/paiement.html?ref='+encodeURIComponent(rec.data.reference)+'#acces='+t(d.token);
   const s=await sessionPaiement({montant:rec.data.montant,reference:rec.data.reference,libelle:(etab||'Clinique')+' · réf. '+rec.data.reference,retour},env.INTEROP_ENV||{});
   if(s.simulation&&d.confirmerSimulation===true){await modifier(env,patient,rec,{status:'paye',data:{...rec.data,paiement:{simulation:true,at:maintenant(),id:s.id}}},'paiement-simulation');await journalPatient(env,row,'patient-paiement','Simulation');return json({statut:'paye',simulation:true})}
   await modifier(env,patient,rec,{data:{...rec.data,session:{id:s.id,at:maintenant()}}},'session-paiement');return json({url:s.url,simulation:s.simulation})}
 }
 return json({error:'Introuvable.'},404);
 }catch(e){return json({error:court(e.message||'Erreur.',300)},e.status||400)}
}
async function webhookStripe(request,env){
 const ienv=env.INTEROP_ENV||{},payload=await request.text();
 if(!signatureStripe(payload,request.headers.get('Stripe-Signature'),t(ienv.INTEROP_PAIEMENT_WEBHOOK_SECRET)))return json({error:'Signature invalide.'},400);
 let ev;try{ev=JSON.parse(payload)}catch{return json({error:'Illisible.'},400)}
 if(ev.type==='checkout.session.completed'){const ref=t(ev.data?.object?.client_reference_id),rec=(await lire(env,'honoraires',{kind:'paiement',ref}))[0];
  if(rec&&rec.status!=='paye')await modifier(env,{id:'flux:paiement',nom:'Paiement en ligne'},rec,{status:'paye',data:{...rec.data,paiement:{id:t(ev.data.object.payment_intent||ev.data.object.id),at:maintenant(),montant:ev.data.object.amount_total}}},'paiement');}
 return json({recu:true});
}

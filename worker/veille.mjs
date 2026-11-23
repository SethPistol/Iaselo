// IASELO · routes serveur issues de la veille marché.
//  - POST /api/workspace/suivi/send       SMS J-1 / J+1 via Brevo (contenu générique, sans donnée de santé)
//  - POST /api/workspace/interop/liaison  Lettre de liaison vers DMP / MSSanté (connecteur SIMULÉ)
//  - GET  /api/workspace/interop/status   État des connecteurs nationaux (INSi, Pro Santé Connect, DMP, MSSanté)
//
// Interopérabilité : les téléservices nationaux exigent une homologation (référencement Ségur, LPS DMP,
// certificat d'établissement IGC Santé, raccordement INSi, fournisseur d'identité Pro Santé Connect,
// opérateur MSSanté). Tant qu'elle n'est pas obtenue, le mode « simulation » répond localement, avec des
// références préfixées SIM-, et rien ne quitte le serveur. Les adaptateurs « ans » sont les points de
// branchement prévus : ils refusent explicitement de fonctionner sans configuration complète.
import {interopStatus} from '../server/interop/index.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const mask=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};

// Messages volontairement génériques : ni nom, ni motif, ni date, ni information médicale.
export function suiviMessages(establishment){
 const etab=establishment||'Clinique du Trocadéro';
 return {
  'j-1':etab+' : rappel de votre venue prévue demain. Respectez les consignes de jeûne et l’heure d’arrivée qui vous ont été remises. En cas d’empêchement, appelez la clinique.',
  'j-7':etab+' : pensez à compléter votre dossier d’admission (pièces demandées). En cas de question, appelez la clinique.',
  'j-3':etab+' : rappel, votre dossier d’admission est incomplet. Merci de transmettre les pièces demandées ou d’appeler la clinique.',
  'j+1':etab+' : un membre de l’équipe va vous appeler aujourd’hui pour prendre de vos nouvelles. En cas d’urgence, appelez le 15.'
 };
}

// État des connecteurs : voir server/interop/ (modes simulation | test | production).
export {interopStatus};
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
// Identité du séjour telle que qualifiée dans l'identitovigilance (seule source d'INS acceptée pour un envoi réel).
export async function identityRecord(env,stay){
 const data=await docData(env,'identities/records'),rows=Array.isArray(data?.records)?data.records:Object.entries(data||{});
 const rec=(rows.find(([id])=>id===stay)||[])[1]||null;if(!rec)return null;
 const qualified=rec.remote?.outcome==='matched'&&!!rec.proof&&rec.remote?.mode&&rec.remote.mode!=='simulation';
 return {status:qualified?'Qualifiée':'Non qualifiée',ins:qualified?rec.ins:null};
}
export async function authorOf(env,user){const p=await env.DB.prepare('SELECT display_name,rpps FROM professional_profiles WHERE user_id=?').bind(user).first();const [firstName,...rest]=String(p?.display_name||'').replace(/^Dr\.?\s+/,'').split(' ');return {rpps:p?.rpps||'',firstName,lastName:rest.join(' ')}}

export async function veilleApi(request,env,acl){
 const url=new URL(request.url),path=url.pathname;

 // Journal d'accès d'un séjour : DPO (propriétaire) et équipe de soins habilitée. Remis au patient sur demande.
 if(path==='/api/workspace/journal'&&request.method==='GET'){
  const stay=String(url.searchParams.get('stay')||'');if(!stay||stay.length>80)return json({error:'Séjour invalide.'},400);
  if(!acl.isAdmin&&!acl.canRead('stay/'+stay+'/core')){await acl.log('journal',stay,'denied');return json({error:'Journal hors habilitation.'},403)}
  const like='%stay/'+stay.replace(/[%_]/g,'')+'/%';
  const rows=(await env.DB.prepare("SELECT l.at,l.actor,l.action,l.target,l.result,COALESCE(p.display_name,l.actor) AS name FROM professional_access_log l LEFT JOIN professional_profiles p ON p.user_id=l.actor WHERE (l.target LIKE ? OR l.target=? OR (l.action='read' AND l.detail LIKE ?)) ORDER BY l.sequence DESC LIMIT 200").bind(like,stay,like).all()).results;
  await acl.log('journal',stay,'allowed','Consultation du journal d’accès');
  return json({rows:rows.map(r=>({...r,target:r.action==='read'?'lecture du dossier':r.target}))});
 }
 // Bris de glace : accès d'urgence de 4 h à un séjour hors équipe, motif obligatoire, journalisé pour revue.
 if(path==='/api/workspace/bris-de-glace'){
  if(request.method==='GET'){const rows=(await env.DB.prepare("SELECT l.at,l.target,l.reason,COALESCE(p.display_name,l.actor) AS name FROM professional_access_log l LEFT JOIN professional_profiles p ON p.user_id=l.actor WHERE l.action='bris-de-glace' AND l.result='allowed' AND (?=1 OR l.actor=?) ORDER BY l.sequence DESC LIMIT 50").bind(acl.isAdmin?1:0,acl.profile.user_id).all()).results;return json({rows})}
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  const d=await body(request),stay=String(d.stay||'').trim(),motif=String(d.motif||'').trim();
  if(!['anesthesiste','chirurgien','infirmier'].includes(acl.job)||!acl.active)return json({error:'Accès d’urgence réservé aux soignants actifs.'},403);
  if(motif.length<10||motif.length>500)return json({error:'Motif obligatoire (10 caractères minimum).'},400);
  if(!/^[^/]{1,80}$/.test(stay)||!await env.DB.prepare('SELECT key FROM workspace_documents WHERE key=?').bind('stay/'+stay+'/core').first()){await acl.log('bris-de-glace',stay||'?','denied',motif);return json({error:'Séjour introuvable.'},404)}
  if(acl.allowed.has(stay))return json({error:'Ce séjour est déjà dans votre périmètre.'},409);
  const user=acl.profile.user_id,team='bdg-'+user.slice(0,60),from=new Date().toISOString(),until=new Date(Date.now()+4*3600000).toISOString();
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO care_teams(id,label,active) VALUES(?,?,1)').bind(team,'Accès d’urgence · '+String(acl.profile.display_name||user).slice(0,60)),
   env.DB.prepare('INSERT OR IGNORE INTO professional_teams(user_id,team_id,valid_from,valid_until) VALUES(?,?,?,?)').bind(user,team,from,until),
   env.DB.prepare('UPDATE professional_teams SET valid_until=? WHERE user_id=? AND team_id=?').bind(until,user,team),
   env.DB.prepare('INSERT OR IGNORE INTO stay_teams(stay_id,team_id,valid_from,valid_until) VALUES(?,?,?,?)').bind(stay,team,from,until),
   env.DB.prepare('UPDATE stay_teams SET valid_until=? WHERE stay_id=? AND team_id=?').bind(until,stay,team)
  ]);
  await acl.log('bris-de-glace',stay,'allowed',motif.slice(0,500),'Jusqu’à '+until);
  return json({opened:true,until},201);
 }
 if(path==='/api/workspace/interop/status'&&request.method==='GET')return json({connecteurs:interopStatus(env.INTEROP_ENV||{})});
 if(path==='/api/workspace/interop/insi'){
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  const d=await body(request),stay=String(d.stay||''),key='stay/'+stay+'/core';
  if(!acl.canRead(key))return json({error:'Séjour hors habilitation.'},403);
  const insi=env.INTEROP?.insi;if(!insi||insi.cfg.mode==='simulation')return json({mode:'simulation',error:'Téléservice INSi non raccordé : utilisez le test local de l’écran Identitovigilance.'},409);
  const core=await docData(env,key);if(!core?.identity)return json({error:'Identité du séjour absente.'},409);
  try{const r=await insi.search(core.identity);
   await acl.log('insi-recherche',key,'allowed','Appel INSi ('+r.mode+')',r.outcome+(r.ins?' · '+r.ins.type+' ****'+String(r.ins.matricule).slice(-4):''));
   return json(r);
  }catch(e){const error=String(e.message||'INSi indisponible.').slice(0,300);await acl.log('insi-recherche',key,'denied','Appel INSi en échec',error);return json({error},502)}
 }
 if(path==='/api/workspace/suivi/send'){
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  const d=await body(request),stay=String(d.stay||''),kind=String(d.kind||'');
  if(!['j-1','j+1','j-7','j-3'].includes(kind))return json({error:'Type de message inconnu.'},400);
  const key='stay/'+stay+'/'+(kind==='j-7'||kind==='j-3'?'preadmission':'suiviAmbu');
  if(!acl.canRead(key)||!acl.keyWrite(key,null,{}))return json({error:'Envoi hors habilitation.'},403);
  const messaging=env.MESSAGING;if(!messaging?.channels?.sms)return json({error:'Envoi de SMS Brevo non configuré sur ce serveur.'},503);
  // Le numéro vient des coordonnées vérifiées du séjour, jamais de la requête.
  const saved=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind('stay/'+stay+'/invitationContact').first(),phone=saved?JSON.parse(saved.data).contact?.phone:'';
  if(!phone)return json({error:'Aucun numéro de portable vérifié pour ce séjour (écran Questionnaire).'},409);
  try{const id=await messaging.sms({to:phone,content:suiviMessages(messaging.establishment)[kind]});
   await acl.log('suivi-'+kind,key,'allowed','SMS envoyé via Brevo','Destinataire '+mask(phone)+(id?' · réf. Brevo '+id:''));
   return json({sent:true,to:mask(phone),at:new Date().toISOString()});
  }catch(e){const error=String(e.message||'Envoi impossible.').slice(0,200);await acl.log('suivi-'+kind,key,'denied','SMS non envoyé','Destinataire '+mask(phone)+' · '+error);return json({sent:false,error},502)}
 }
 if(path==='/api/workspace/interop/liaison'){
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  const d=await body(request),stay=String(d.stay||''),key='stay/'+stay+'/envoisInterop',targets=Array.isArray(d.targets)?[...new Set(d.targets)]:[];
  if(!targets.length||targets.some(t=>!['dmp','mssante-mt','mssante-patient'].includes(t)))return json({error:'Destinataires invalides.'},400);
  if(!acl.canRead(key)||!acl.keyWrite(key,[],[{}]))return json({error:'Envoi hors habilitation.'},403);
  const discharge=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind('stay/'+stay+'/discharge').first();
  if(!discharge||!JSON.parse(discharge.data)?.liaison?.document)return json({error:'Lettre de liaison non relue : enregistrez-la avant l’envoi.'},409);
  const status=interopStatus(env.INTEROP_ENV||{}),modeOf=t=>status.find(c=>c.id===t.split('-')[0]).mode;
  const real=targets.filter(t=>modeOf(t)!=='simulation');
  if(real.length){
   const connectors=env.INTEROP;if(!connectors)return json({error:'Connecteurs nationaux non chargés sur ce serveur.'},503);
   const liaison=JSON.parse(discharge.data).liaison,pdfBase64=String(d.pdfBase64||'');
   if(!/^[A-Za-z0-9+/=]{100,}$/.test(pdfBase64))return json({error:'Envoi réel : le PDF de la lettre relue doit accompagner la demande.'},409);
   const identity=await identityRecord(env,stay),author=await authorOf(env,request.headers.get('oai-authenticated-user-id')),core=await docData(env,'stay/'+stay+'/core');
   const results=[];
   for(const t of targets){
    if(modeOf(t)==='simulation'){results.push({target:t,ref:'SIM-'+t.toUpperCase()+'-'+crypto.randomUUID().slice(0,8),simulated:true});continue}
    try{
     if(t==='dmp'){const r=await connectors.dmp.send({identity,consent:liaison.consentementDmp,author,patient:core?.identity||{},ins:identity?.ins,pdfBase64});results.push({target:t,ref:r.documentId,mode:r.mode})}
     else{const {patientAddress}=await import('../server/interop/mssante.mjs');
      const to=t==='mssante-patient'?[patientAddress(identity?.ins)]:[String(liaison.medecinTraitantMssante||'')];
      const r=await connectors.mssante.send({to,subject:'Lettre de liaison de sortie',text:'Lettre de liaison de sortie en pièce jointe.',attachments:[{filename:'lettre-de-liaison.pdf',contentType:'application/pdf',base64:pdfBase64}]});results.push({target:t,ref:'MSS-'+crypto.randomUUID().slice(0,8),mode:r.mode})}
    }catch(e){results.push({target:t,error:String(e.message).slice(0,300)})}
   }
   const ok=results.filter(r=>!r.error);
   await acl.log('interop-liaison',key,ok.length===results.length?'allowed':'denied','Envoi réel ('+real.join(', ')+')',results.map(r=>r.target+':'+(r.ref||'échec')).join(' '));
   return json({mode:'reel',at:new Date().toISOString(),results},ok.length?200:502);
  }
  const at=new Date().toISOString(),results=targets.map(t=>({target:t,ref:'SIM-'+t.toUpperCase()+'-'+crypto.randomUUID().slice(0,8),simulated:true}));
  await acl.log('interop-liaison',key,'allowed','Simulation : aucun envoi réel',results.map(r=>r.ref).join(' '));
  return json({mode:'simulation',at,results});
 }
 return null;
}

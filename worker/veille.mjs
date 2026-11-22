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
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const mask=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};

// Messages volontairement génériques : ni nom, ni motif, ni date, ni information médicale.
export function suiviMessages(establishment){
 const etab=establishment||'Clinique du Trocadéro';
 return {
  'j-1':etab+' : rappel de votre venue prévue demain. Respectez les consignes de jeûne et l’heure d’arrivée qui vous ont été remises. En cas d’empêchement, appelez la clinique.',
  'j+1':etab+' : un membre de l’équipe va vous appeler aujourd’hui pour prendre de vos nouvelles. En cas d’urgence, appelez le 15.'
 };
}

const CONNECTEURS=[
 {id:'insi',label:'Téléservice INSi',need:['INSI_CERT_PATH','INSI_ENDPOINT'],doc:'Raccordement CNAM + certificat logiciel ; DPI référencé Ségur.'},
 {id:'psc',label:'Pro Santé Connect',need:['PSC_CLIENT_ID','PSC_CLIENT_SECRET','PSC_ISSUER'],doc:'Déclaration du service auprès de l’ANS (OIDC, e-CPS / CPS).'},
 {id:'dmp',label:'DMP (Mon espace santé)',need:['DMP_LPS_ID','DMP_CERT_PATH'],doc:'Homologation LPS DMP par le CNDA ; identité INS qualifiée obligatoire.'},
 {id:'mssante',label:'MSSanté',need:['MSSANTE_OPERATEUR','MSSANTE_BAL'],doc:'Boîte organisationnelle de l’établissement chez un opérateur référencé.'}
];
export function interopStatus(env={}){
 return CONNECTEURS.map(c=>{const missing=c.need.filter(k=>!env[k]);return {id:c.id,label:c.label,mode:missing.length?'simulation':'configuré · homologation à vérifier',missing,doc:c.doc}});
}

export async function veilleApi(request,env,acl){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/workspace/interop/status'&&request.method==='GET')return json({connecteurs:interopStatus(env.INTEROP_ENV||{})});
 if(path==='/api/workspace/suivi/send'){
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  const d=await body(request),stay=String(d.stay||''),kind=String(d.kind||'');
  if(!['j-1','j+1'].includes(kind))return json({error:'Type de message inconnu.'},400);
  const key='stay/'+stay+'/suiviAmbu';
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
  const status=interopStatus(env.INTEROP_ENV||{});
  if(targets.some(t=>status.find(c=>c.id===t.split('-')[0]).mode!=='simulation'))return json({error:'Connecteur réel configuré mais non activé dans cette version : homologation à finaliser.'},501);
  const at=new Date().toISOString(),results=targets.map(t=>({target:t,ref:'SIM-'+t.toUpperCase()+'-'+crypto.randomUUID().slice(0,8),simulated:true}));
  await acl.log('interop-liaison',key,'allowed','Simulation : aucun envoi réel',results.map(r=>r.ref).join(' '));
  return json({mode:'simulation',at,results});
 }
 return null;
}

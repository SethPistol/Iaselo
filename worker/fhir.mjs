// IASELO · API FHIR R4 en lecture pour les logiciels partenaires (27/11/2026, manque n°7 de la 3e veille).
//  Authentification OAuth 2.0 « client credentials » (serveur à serveur) :
//   POST /fhir/oauth/token        grant_type=client_credentials, client_id, client_secret (ou Basic), scope facultatif
//  Lecture (jeton Bearer, portées SMART « system/<Ressource>.read ») :
//   GET  /fhir/r4/metadata        CapabilityStatement (public)
//   GET  /fhir/r4/.well-known/smart-configuration
//   GET  /fhir/r4/<Ressource>/<id> et /fhir/r4/<Ressource>?<recherche>
//   Ressources : Patient, Encounter, Procedure, MedicationStatement, AllergyIntolerance.
//  Webhooks : à chaque modification d'un séjour, une notification signée (HMAC-SHA256), sans donnée de santé,
//   indique la ressource à relire ; nouvelles tentatives espacées en cas d'échec.
//  Administration (administrateur seulement) : /api/workspace/fhir (clients, portées, webhook, révocation, journal).
// Profils visés : FR Core (ANS / Interop'Santé). Systèmes de codage (CCAM, CIS) à confirmer avec le guide d'implémentation
// avant tout raccordement réel. Chaque appel est inscrit au journal d'accès (acteur « fhir:<client> »).
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import R from '../dist/espace-patient-regles.js';
const FHIR='application/fhir+json; charset=utf-8';
const sha=s=>createHash('sha256').update(String(s)).digest('hex');
const t=v=>typeof v==='string'?v.trim():v===undefined||v===null?'':String(v).trim();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fhir=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':FHIR,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const issue=(status,code,texte)=>fhir({resourceType:'OperationOutcome',issue:[{severity:'error',code,diagnostics:texte}]},status);
export const RESSOURCES=['Patient','Encounter','Procedure','MedicationStatement','AllergyIntolerance'];
// Systèmes et profils : À CONFIRMER avec le guide FR Core et les terminologies de l'ANS (SMT) avant production.
export const SYSTEMES={sejour:'urn:iaselo:sejour',ccam:'urn:oid:1.2.250.1.213.2.5',cis:'urn:oid:1.2.250.1.213.2.3.1',actCode:'http://terminology.hl7.org/CodeSystem/v3-ActCode'};
export const PROFILS={Patient:'https://hl7.fr/ig/fhir/core/StructureDefinition/fr-core-patient',Encounter:'https://hl7.fr/ig/fhir/core/StructureDefinition/fr-core-encounter'};
const EVENEMENTS={core:['Patient','Encounter'],consult:['Encounter','MedicationStatement','AllergyIntolerance'],surgicalAnnouncement:['Procedure','Encounter']};
const TOKEN_TTL=3600,MAX_TENTATIVES=8;

/* ---------------- Identifiants : un séjour IASELO → identifiant FHIR valide ([A-Za-z0-9-.]{1,64}) ---------------- */
export function idFhir(stay){const s=String(stay);return /^[A-Za-z0-9.-]{1,64}$/.test(s)&&!s.startsWith('x-')?s:('x-'+Buffer.from(s,'utf8').toString('hex')).slice(0,64)}
export function sejourDe(id){const s=String(id||'');if(s.startsWith('x-')&&/^x-[0-9a-f]+$/.test(s)&&s.length%2===0)return Buffer.from(s.slice(2),'hex').toString('utf8');return s}

/* ---------------- Correspondance dossier IASELO → ressources FHIR (fonctions pures) ---------------- */
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):undefined;
const propre=o=>JSON.parse(JSON.stringify(o));
export function patient(stay,core){
 const id=core?.identity||{},fid=idFhir(stay),famille=t(id.birthName||id.lastName),usage=t(id.lastName);
 const sexe=/^f/i.test(t(id.sex))?'female':/^m/i.test(t(id.sex))?'male':'unknown';
 return propre({resourceType:'Patient',id:fid,meta:{profile:[PROFILS.Patient]},identifier:[{use:'secondary',system:SYSTEMES.sejour,value:String(stay)}],
  name:[{use:'official',family:famille||undefined,given:t(id.firstName)?[t(id.firstName)]:undefined},...(usage&&usage!==famille?[{use:'usual',family:usage,given:t(id.firstName)?[t(id.firstName)]:undefined}]:[])],
  gender:sexe,birthDate:date(id.birthDate)});
}
export function encounter(stay,{core,consult,surgicalAnnouncement}){
 const fid=idFhir(stay),jour=R.datePrevueSejour({consult,surgicalAnnouncement}),stage=t(core?.stage),ambu=/ambu/i.test(t(core?.mode));
 const status=/sortie/i.test(stage)?'finished':/consultation|pr[ée]op/i.test(stage)||!stage?'planned':'in-progress';
 return propre({resourceType:'Encounter',id:fid,meta:{profile:[PROFILS.Encounter]},identifier:[{system:SYSTEMES.sejour,value:String(stay)}],status,
  class:{system:SYSTEMES.actCode,code:ambu?'SS':'IMP',display:ambu?'short stay':'inpatient encounter'},
  serviceType:t(core?.specialty)?{text:t(core.specialty)}:undefined,subject:{reference:'Patient/'+fid},period:jour?{start:jour}:undefined,
  reasonCode:t(surgicalAnnouncement?.published?.fields?.procedure||consult?.ext?.operation)?[{text:t(surgicalAnnouncement?.published?.fields?.procedure||consult?.ext?.operation)}]:undefined});
}
export function procedure(stay,{core,consult,surgicalAnnouncement},ccam=''){
 const f=surgicalAnnouncement?.published?.fields||{},texte=t(f.procedure||consult?.ext?.operation);if(!texte)return null;
 const fid=idFhir(stay),jour=R.datePrevueSejour({consult,surgicalAnnouncement}),fait=/sspi|hospitalisation|sortie/i.test(t(core?.stage));
 const lat=t(f.laterality);
 return propre({resourceType:'Procedure',id:fid,status:fait?'completed':'preparation',code:{text:texte,coding:ccam?[{system:SYSTEMES.ccam,code:ccam}]:undefined},
  subject:{reference:'Patient/'+fid},encounter:{reference:'Encounter/'+fid},performedDateTime:jour,
  performer:t(f.surgeon)?[{actor:{display:t(f.surgeon)}}]:undefined,bodySite:lat&&lat!=='Non applicable'?[{text:lat}]:undefined});
}
export function medicationStatements(stay,consult){
 const fid=idFhir(stay);
 return (Array.isArray(consult?.medicationRows)?consult.medicationRows:[]).filter(m=>m&&t(m.name)).map((m,i)=>propre({
  resourceType:'MedicationStatement',id:(fid+'-m'+(i+1)).slice(0,64),status:m.removed?'entered-in-error':/arr[eê]t/i.test(t(m.decision))?'stopped':'active',
  medicationCodeableConcept:{text:t(m.name),coding:/^\d{8}$/.test(t(m.cis))?[{system:SYSTEMES.cis,code:t(m.cis)}]:undefined},
  subject:{reference:'Patient/'+fid},context:{reference:'Encounter/'+fid},
  dosage:[t(m.dose),t(m.frequency),t(m.route)].some(Boolean)?[{text:[t(m.dose),t(m.frequency),t(m.route)].filter(Boolean).join(' · ')}]:undefined,
  note:[t(m.decision)&&{text:'Décision périopératoire : '+t(m.decision)},t(m.verification)&&{text:t(m.verification)}].filter(Boolean)}));
}
export function allergie(stay,consult){
 const texte=t(consult?.allergies);if(!texte)return null;const fid=idFhir(stay),aucune=/aucune allergie/i.test(texte);
 return propre({resourceType:'AllergyIntolerance',id:fid,clinicalStatus:{coding:[{system:'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',code:aucune?'inactive':'active'}]},
  verificationStatus:{coding:[{system:'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',code:aucune?'refuted':'confirmed'}]},
  code:{text:texte},patient:{reference:'Patient/'+fid},encounter:{reference:'Encounter/'+fid},recordedDate:date(consult?.ext?.consultDate)});
}
export function capability(base){
 return {resourceType:'CapabilityStatement',status:'active',date:'2026-11-27',kind:'instance',fhirVersion:'4.0.1',format:['application/fhir+json'],
  software:{name:'IASELO'},implementation:{description:'API FHIR R4 en lecture d’IASELO',url:base+'/fhir/r4'},
  rest:[{mode:'server',security:{service:[{coding:[{system:'http://terminology.hl7.org/CodeSystem/restful-security-service',code:'SMART-on-FHIR'}]}],
   extension:[{url:'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',extension:[{url:'token',valueUri:base+'/fhir/oauth/token'}]}],
   description:'OAuth 2.0 client credentials ; portées system/<Ressource>.read.'},
   resource:RESSOURCES.map(type=>({type,...(PROFILS[type]?{supportedProfile:[PROFILS[type]]}:{}),interaction:[{code:'read'},{code:'search-type'}],
    searchParam:[{name:'_id',type:'token'},...(type==='Patient'?[{name:'identifier',type:'token'},{name:'family',type:'string'},{name:'given',type:'string'},{name:'birthdate',type:'date'}]:[{name:'patient',type:'reference'}]),...(type==='Encounter'?[{name:'date',type:'date'},{name:'status',type:'token'}]:[])]}))}]};
}

/* ---------------- Lecture du dossier ---------------- */
async function lireTous(env,module){return new Map(((await env.DB.prepare('SELECT key,data FROM workspace_documents WHERE key LIKE ?').bind('stay/%/'+module).all()).results||[]).map(r=>{try{return [r.key.split('/')[1],JSON.parse(r.data)]}catch{return [r.key.split('/')[1],null]}}))}
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
async function sejour(env,stay){
 const [core,consult,surgicalAnnouncement]=await Promise.all(['core','consult','surgicalAnnouncement'].map(m=>docData(env,'stay/'+stay+'/'+m)));
 if(!core)return null;
 const resa=((await docData(env,'management/reservations'))||[]).find?.(r=>r.patient===stay&&r.ccam)||null;
 return {stay,core,consult,surgicalAnnouncement,ccam:t(resa?.ccam).split(/[ ,;]/)[0]||''};
}
function ressourcesDe(type,s){
 if(type==='Patient')return [patient(s.stay,s.core)];
 if(type==='Encounter')return [encounter(s.stay,s)];
 if(type==='Procedure')return [procedure(s.stay,s,s.ccam)].filter(Boolean);
 if(type==='MedicationStatement')return medicationStatements(s.stay,s.consult);
 if(type==='AllergyIntolerance')return [allergie(s.stay,s.consult)].filter(Boolean);
 return [];
}
const plie=s=>t(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function correspond(type,res,q){
 for(const [k,v] of q){
  if(k==='_id'&&res.id!==v)return false;
  if(type==='Patient'){
   if(k==='identifier'){const [sys,val]=v.includes('|')?v.split('|'):['',v];if(!res.identifier?.some(i=>(!sys||i.system===sys)&&i.value===val))return false}
   if(k==='family'&&!res.name?.some(n=>plie(n.family).startsWith(plie(v))))return false;
   if(k==='given'&&!res.name?.some(n=>(n.given||[]).some(g=>plie(g).startsWith(plie(v)))))return false;
   if(k==='birthdate'&&res.birthDate!==v)return false;
  }else{
   if(k==='patient'||k==='subject'){const ref=v.replace(/^Patient\//,'');const sub=(res.subject||res.patient)?.reference;if(sub!=='Patient/'+ref)return false}
   if(type==='Encounter'&&k==='status'&&res.status!==v)return false;
   if(type==='Encounter'&&k==='date'){const m=/^(eq|ge|le|gt|lt)?(\d{4}-\d{2}-\d{2})$/.exec(v),d=res.period?.start;if(!m||!d)return false;const op=m[1]||'eq',x=m[2];if(!(op==='eq'?d===x:op==='ge'?d>=x:op==='le'?d<=x:op==='gt'?d>x:d<x))return false}
  }
 }
 return true;
}
const PARAMS={Patient:['_id','identifier','family','given','birthdate','_count'],Encounter:['_id','patient','subject','date','status','_count'],Procedure:['_id','patient','subject','_count'],MedicationStatement:['_id','patient','subject','_count'],AllergyIntolerance:['_id','patient','_count']};

/* ---------------- Jetons et clients ---------------- */
function egal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
const portees=s=>t(s).split(/\s+/).filter(Boolean);
export function porteesValides(liste){return liste.every(p=>/^system\/(\*|Patient|Encounter|Procedure|MedicationStatement|AllergyIntolerance)\.read$/.test(p))}
const autorise=(scopes,type)=>scopes.includes('system/*.read')||scopes.includes('system/'+type+'.read');
const log=(env,client,action,target,result,reason,detail='')=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),'fhir:'+client,action,String(target).slice(0,300),result,String(reason).slice(0,300),String(detail).slice(0,300)).run();

async function jeton(request,env){
 let form;try{form=new URLSearchParams(await request.text())}catch{return json({error:'invalid_request'},400)}
 let id=form.get('client_id')||'',secret=form.get('client_secret')||'';
 const basic=/^Basic\s+(.+)$/i.exec(request.headers.get('Authorization')||'');if(basic){const [a,...b]=Buffer.from(basic[1],'base64').toString('utf8').split(':');id=decodeURIComponent(a);secret=decodeURIComponent(b.join(':'))}
 if(form.get('grant_type')!=='client_credentials')return json({error:'unsupported_grant_type'},400);
 const c=/^fhir-[a-f0-9]{16}$/.test(id)?await env.DB.prepare('SELECT * FROM fhir_clients WHERE id=?').bind(id).first():null;
 if(!c||c.revoked_at||!egal(sha(secret),c.secret_hash)){if(c)await log(env,id,'fhir-token','token','denied','Secret invalide ou client révoqué');return json({error:'invalid_client'},401)}
 const permis=portees(c.scopes),demandees=form.get('scope')?portees(form.get('scope')):permis;
 if(!demandees.length||!demandees.every(p=>permis.includes(p)||(permis.includes('system/*.read')&&porteesValides([p]))))return json({error:'invalid_scope'},400);
 const token=randomBytes(32).toString('hex'),at=new Date(),exp=new Date(at.getTime()+TOKEN_TTL*1000).toISOString();
 await env.DB.prepare('INSERT INTO fhir_tokens(token_hash,client_id,scopes,created_at,expires_at) VALUES(?,?,?,?,?)').bind(sha(token),c.id,demandees.join(' '),at.toISOString(),exp).run();
 await env.DB.prepare('DELETE FROM fhir_tokens WHERE expires_at<?').bind(at.toISOString()).run();
 await log(env,c.id,'fhir-token','token','allowed','Jeton délivré',demandees.join(' '));
 return json({access_token:token,token_type:'Bearer',expires_in:TOKEN_TTL,scope:demandees.join(' ')});
}

/* ---------------- API FHIR ---------------- */
export async function fhirApi(request,env,base){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/fhir/oauth/token')return request.method==='POST'?jeton(request,env):json({error:'invalid_request'},405);
 if(!path.startsWith('/fhir/r4'))return issue(404,'not-found','Point d’accès inconnu.');
 if(request.method!=='GET')return issue(405,'not-supported','API en lecture seule.');
 if(path==='/fhir/r4/metadata')return fhir(capability(base));
 if(path==='/fhir/r4/.well-known/smart-configuration')return json({token_endpoint:base+'/fhir/oauth/token',grant_types_supported:['client_credentials'],token_endpoint_auth_methods_supported:['client_secret_basic','client_secret_post'],scopes_supported:['system/*.read',...RESSOURCES.map(r=>'system/'+r+'.read')],capabilities:['client-confidential-symmetric']});
 const bearer=/^Bearer\s+([a-f0-9]{64})$/i.exec(request.headers.get('Authorization')||'');
 const tok=bearer?await env.DB.prepare('SELECT k.*,c.revoked_at FROM fhir_tokens k JOIN fhir_clients c ON c.id=k.client_id WHERE k.token_hash=?').bind(sha(bearer[1].toLowerCase())).first():null;
 if(!tok||tok.revoked_at||tok.expires_at<new Date().toISOString())return issue(401,'login','Jeton absent, expiré ou révoqué.');
 const [,,,type,rid,extra]=path.split('/');
 if(!RESSOURCES.includes(type)||extra!==undefined)return issue(404,'not-supported','Ressource non prise en charge.');
 const scopes=portees(tok.scopes);
 if(!autorise(scopes,type)){await log(env,tok.client_id,'fhir-read',type,'denied','Portée absente');return issue(403,'forbidden','Portée system/'+type+'.read absente du jeton.')}
 if(rid){
  const stay=sejourDe(String(rid).replace(/-m\d+$/,'')),s=await sejour(env,stay);
  const res=s?ressourcesDe(type,s).find(r=>r.id===rid):null;
  await log(env,tok.client_id,'fhir-read',type+'/'+rid,res?'allowed':'denied',res?'Lecture':'Introuvable');
  return res?fhir(res):issue(404,'not-found',type+'/'+rid+' introuvable.');
 }
 const q=[...url.searchParams.entries()];
 const inconnu=q.find(([k])=>!PARAMS[type].includes(k));if(inconnu)return issue(400,'not-supported','Paramètre de recherche non pris en charge : '+inconnu[0]);
 const count=Math.min(Math.max(Number(url.searchParams.get('_count')||50)|0,1),200),criteres=q.filter(([k])=>k!=='_count');
 // Recherche sans critère limitée aux patients et séjours ; les autres ressources exigent un patient.
 if(!['Patient','Encounter'].includes(type)&&!criteres.some(([k])=>['patient','subject','_id'].includes(k)))return issue(400,'required','Indiquez le patient (patient=Patient/<id>).');
 const cores=await lireTous(env,'core'),entrees=[];
 const cible=criteres.find(([k])=>['patient','subject'].includes(k))?.[1];
 const stays=cible?[sejourDe(cible.replace(/^Patient\//,''))].filter(s=>cores.has(s)):[...cores.keys()];
 const [consults,annonces]=cible?[null,null]:await Promise.all(['consult','surgicalAnnouncement'].map(m=>lireTous(env,m)));
 const resas=(await docData(env,'management/reservations'))||[];
 for(const stay of stays){
  const s=cible?await sejour(env,stay):{stay,core:cores.get(stay),consult:consults.get(stay),surgicalAnnouncement:annonces.get(stay),ccam:t((Array.isArray(resas)?resas:[]).find(r=>r.patient===stay&&r.ccam)?.ccam).split(/[ ,;]/)[0]||''};
  if(!s?.core)continue;
  for(const res of ressourcesDe(type,s))if(correspond(type,res,criteres))entrees.push(res);
 }
 const page=entrees.slice(0,count);
 await log(env,tok.client_id,'fhir-search',type+'?'+url.searchParams.toString(),'allowed','Recherche',entrees.length+' résultat(s)');
 return fhir({resourceType:'Bundle',type:'searchset',total:entrees.length,link:[{relation:'self',url:base+path+url.search}],entry:page.map(r=>({fullUrl:base+'/fhir/r4/'+r.resourceType+'/'+r.id,resource:r,search:{mode:'match'}}))});
}

/* ---------------- Webhooks ---------------- */
export function signature(secret,horodatage,corps){return 'sha256='+createHmac('sha256',secret).update(horodatage+'.'+corps).digest('hex')}
// Appelée après chaque écriture du dossier : une notification par client abonné et par ressource touchée.
export async function notifierFhir(env,docs){
 const touches=new Map();
 for(const d of docs){const m=/^stay\/([^/]{1,80})\/(core|consult|surgicalAnnouncement)$/.exec(d.key);if(!m)continue;for(const type of EVENEMENTS[m[2]])touches.set(type+'/'+idFhir(m[1]),type)}
 if(!touches.size)return 0;
 const clients=((await env.DB.prepare("SELECT id,scopes FROM fhir_clients WHERE revoked_at IS NULL AND webhook_url<>''").all()).results)||[];
 let n=0;const at=new Date().toISOString();
 for(const c of clients)for(const [ref,type] of touches)if(autorise(portees(c.scopes),type)){await env.DB.prepare("INSERT INTO fhir_events(id,client_id,resource,action,created_at,attempts,next_at,status) VALUES(?,?,?,'update',?,0,?,'en-attente')").bind(randomUUID(),c.id,ref,at,at).run();n++}
 if(n)livrerWebhooks(env).catch(e=>console.error('fhir webhooks',e?.message||e));
 return n;
}
let livraison=null;
export function livrerWebhooks(env,opts={}){if(!livraison)livraison=livrer(env,opts).finally(()=>{livraison=null});return livraison}
async function livrer(env,{now=new Date(),fetcher=env.FETCH||globalThis.fetch}={}){
 const at=now.toISOString(),rows=((await env.DB.prepare("SELECT e.*,c.webhook_url,c.webhook_secret,c.revoked_at FROM fhir_events e JOIN fhir_clients c ON c.id=e.client_id WHERE e.status='en-attente' AND e.next_at<=? ORDER BY e.created_at LIMIT 200").bind(at).all()).results)||[];
 const parClient=new Map();for(const r of rows){if(!parClient.has(r.client_id))parClient.set(r.client_id,[]);parClient.get(r.client_id).push(r)}
 let ok=0;
 for(const [client,evs] of parClient){
  const c=evs[0];if(c.revoked_at||!c.webhook_url){for(const e of evs)await env.DB.prepare("UPDATE fhir_events SET status='abandonne',last_error=? WHERE id=?").bind('Client révoqué',e.id).run();continue}
  const corps=JSON.stringify({type:'iaselo.fhir.notification',envoye:at,evenements:evs.map(e=>({id:e.id,ressource:e.resource,action:e.action,le:e.created_at}))}),horodatage=String(Math.floor(now.getTime()/1000));
  let erreur='';
  try{const r=await fetcher(c.webhook_url,{method:'POST',headers:{'Content-Type':'application/json','X-Iaselo-Timestamp':horodatage,'X-Iaselo-Signature':signature(c.webhook_secret,horodatage,corps)},body:corps,redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)erreur='HTTP '+r.status}catch(e){erreur=String(e?.message||e).slice(0,200)}
  for(const e of evs){
   if(!erreur){await env.DB.prepare("UPDATE fhir_events SET status='livre',attempts=attempts+1,delivered_at=?,last_error='' WHERE id=?").bind(at,e.id).run();ok++;continue}
   const n=Number(e.attempts)+1,suivant=new Date(now.getTime()+Math.min(2**n,720)*60000).toISOString();
   await env.DB.prepare('UPDATE fhir_events SET status=?,attempts=?,next_at=?,last_error=? WHERE id=?').bind(n>=MAX_TENTATIVES?'abandonne':'en-attente',n,suivant,erreur,e.id).run();
  }
  await log(env,client,'fhir-webhook',c.webhook_url,erreur?'denied':'allowed',erreur?'Notification non remise':'Notification remise',evs.length+' événement(s)'+(erreur?' · '+erreur:''));
 }
 return ok;
}

/* ---------------- Administration ---------------- */
// Audit du 27/11 : un webhook ne peut pas viser le réseau interne de l'hébergeur (adresse locale, privée ou de
// métadonnées) : le serveur IASELO s'en servirait sinon pour atteindre des services non exposés.
export function interne(h){h=String(h||'').toLowerCase().replace(/^\[|\]$/g,'');if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.internal')||h.endsWith('.local'))return true;
 const m=/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);if(m){const a=+m[1],b=+m[2];return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224}
 return h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80')||h.startsWith('::ffff:'))}
function urlWebhook(v,recette){const s=t(v);if(!s)return '';let u;try{u=new URL(s)}catch{return null}if(u.username||u.password)return null;if(u.protocol==='https:')return interne(u.hostname)&&!recette?null:u.toString();if(recette&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))return u.toString();return null}
export async function staffFhirApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/fhir')return null;
 if(!acl.isAdmin)return json({error:'Réservé à l’administrateur.'},403);
 const base=url.origin;
 if(request.method==='GET'){
  const clients=((await env.DB.prepare('SELECT id,name,scopes,webhook_url,created_at,created_by,revoked_at,revoked_by FROM fhir_clients ORDER BY created_at DESC').all()).results)||[];
  const appels=((await env.DB.prepare("SELECT at,actor,action,target,result,reason,detail FROM professional_access_log WHERE actor LIKE 'fhir:%' ORDER BY at DESC LIMIT 40").all()).results)||[];
  const evenements=((await env.DB.prepare('SELECT client_id,status,COUNT(*) AS n FROM fhir_events GROUP BY client_id,status').all()).results)||[];
  return json({base:base+'/fhir/r4',token:base+'/fhir/oauth/token',ressources:RESSOURCES,clients,appels,evenements,systemes:SYSTEMES});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=JSON.parse(new TextDecoder().decode(await request.arrayBuffer()))}catch{return json({error:'Demande invalide.'},400)}
 const who=acl.profile.display_name||'Administrateur',at=new Date().toISOString();
 if(d.action==='creer'){
  const name=t(d.nom).slice(0,120);let scopes=Array.isArray(d.portees)?[...new Set(d.portees.map(t))]:[];if(scopes.includes('system/*.read'))scopes=['system/*.read'];const hook=urlWebhook(d.webhook,env.RECETTE===true);
  if(name.length<2)return json({error:'Indiquez le nom du logiciel partenaire.'},400);
  if(!scopes.length||!porteesValides(scopes))return json({error:'Portées invalides.'},400);
  if(hook===null)return json({error:'Adresse du webhook invalide (https:// obligatoire).'},400);
  const id='fhir-'+randomBytes(8).toString('hex'),secret=randomBytes(32).toString('base64url'),hookSecret=hook?randomBytes(32).toString('base64url'):'';
  await env.DB.prepare('INSERT INTO fhir_clients(id,name,secret_hash,scopes,webhook_url,webhook_secret,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,name,sha(secret),scopes.join(' '),hook,hookSecret,at,who).run();
  await acl.log('fhir-client-creation','fhir/'+id,'allowed','Client FHIR créé : '+name,scopes.join(' ')+(hook?' · webhook '+new URL(hook).host:''));
  return json({client:{id,name,scopes:scopes.join(' '),webhook_url:hook},client_secret:secret,webhook_secret:hookSecret||undefined},201);
 }
 const c=/^fhir-[a-f0-9]{16}$/.test(t(d.id))?await env.DB.prepare('SELECT * FROM fhir_clients WHERE id=?').bind(t(d.id)).first():null;
 if(!c)return json({error:'Client introuvable.'},404);
 if(d.action==='revoquer'){
  if(c.revoked_at)return json({error:'Client déjà révoqué.'},409);
  await env.DB.prepare('UPDATE fhir_clients SET revoked_at=?,revoked_by=? WHERE id=?').bind(at,who,c.id).run();await env.DB.prepare('DELETE FROM fhir_tokens WHERE client_id=?').bind(c.id).run();
  await acl.log('fhir-client-revocation','fhir/'+c.id,'allowed','Client FHIR révoqué : '+c.name,'');
  return json({ok:true});
 }
 if(d.action==='tester'){
  if(c.revoked_at||!c.webhook_url)return json({error:'Aucun webhook actif pour ce client.'},409);
  await env.DB.prepare("INSERT INTO fhir_events(id,client_id,resource,action,created_at,attempts,next_at,status) VALUES(?,?,'CapabilityStatement/iaselo','test',?,0,?,'en-attente')").bind(randomUUID(),c.id,at,at).run();
  const n=await livrerWebhooks(env);
  return json({ok:n>0,detail:n>0?'Notification de test remise.':'Notification non remise : voir le journal (nouvelle tentative automatique).'});
 }
 return json({error:'Action inconnue.'},400);
}

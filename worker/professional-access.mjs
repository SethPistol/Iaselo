import invitationCore from '../dist/invitation-core.js';
import nursingCore from '../dist/nursing-core.js';
import planningCore from '../dist/planning-core.js';import {stampSignatures} from './signatures.mjs';
const professions={unassigned:'Non attribué',anesthesiste:'Anesthésiste',chirurgien:'Chirurgien',infirmier:'Infirmier',secretariat:'Secrétariat',pharmacien:'Pharmacien',dim:'DIM',facturation:'Facturation',administration:'Administration'};
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>stable(a)===stable(b);
const filled=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,v])=>v!==''&&v!=null));
const appendOnly=(old=[],next=[])=>Array.isArray(old)&&Array.isArray(next)&&next.length>=old.length&&old.every((x,i)=>same(x,next[i]));
const additions=(old=[],next=[])=>Array.isArray(next)&&old.every(x=>next.some(y=>same(x,y)));
const fileReferences=v=>{const out=[];function scan(x){if(!x||typeof x!=='object')return;if(typeof x.$file==='string'&&/^[a-f0-9]{64}$/.test(x.$file))out.push(x.$file);for(const a of Object.values(x))scan(a);}scan(v);return [...new Set(out)];};
export async function professionalAccess(env,request,user,member,at){
 const DB=env.DB,isAdmin=member?.role==='owner';let planningError='',nursingError='';
 async function log(action,target,result='allowed',reason='',detail=''){await DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(at,user,action,target,result,reason,detail).run();}
 let profile=await DB.prepare('SELECT * FROM professional_profiles WHERE user_id=?').bind(user).first();
 if(!profile){
  let display=request.headers.get('oai-authenticated-user-full-name')||request.headers.get('oai-authenticated-user-email')||user;
  if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')try{display=decodeURIComponent(display)}catch{}
  await DB.prepare('INSERT OR IGNORE INTO professional_profiles(user_id,display_name,email,profession,active,updated_at,updated_by) VALUES(?,?,?,?,1,?,?)').bind(user,display.slice(0,160),(request.headers.get('oai-authenticated-user-email')||'').slice(0,200),isAdmin?'anesthesiste':'unassigned',at,user).run();
  if(isAdmin){await DB.batch([
   DB.prepare("INSERT OR IGNORE INTO care_teams(id,label) VALUES('endoscopie','Endoscopie'),('demo-clinique','Chirurgie'),('sejour-medical','Séjour médical')"),
   ...['endoscopie','demo-clinique','sejour-medical'].map(team=>DB.prepare("INSERT OR IGNORE INTO professional_teams(user_id,team_id,valid_from) VALUES(?,?,?)").bind(user,team,at)),
   DB.prepare("INSERT OR IGNORE INTO stay_teams(stay_id,team_id,valid_from) SELECT substr(key,6,length(key)-10),'demo-clinique',? FROM workspace_documents WHERE key LIKE 'stay/%/core'").bind(at)
  ]);}
  profile=await DB.prepare('SELECT * FROM professional_profiles WHERE user_id=?').bind(user).first();await log('account-first-connection',user,'allowed','Compte individuel issu de la connexion du site');
 }
 if(!await DB.prepare("SELECT id FROM access_migrations WHERE id='file-scopes-v1'").first()){
  const rows=await DB.prepare('SELECT key,data FROM workspace_versions').all(),statements=[];
  for(const row of rows.results)for(const hash of fileReferences(JSON.parse(row.data)))statements.push(DB.prepare('INSERT OR IGNORE INTO file_scopes(hash,document_key) VALUES(?,?)').bind(hash,row.key));
  statements.push(DB.prepare("INSERT OR IGNORE INTO access_migrations(id) VALUES('file-scopes-v1')"));await DB.batch(statements);
 }
 const teams=(await DB.prepare('SELECT t.id,t.label,m.valid_from,m.valid_until FROM care_teams t JOIN professional_teams m ON m.team_id=t.id WHERE m.user_id=? AND t.active=1 AND m.valid_from<=? AND (m.valid_until IS NULL OR m.valid_until>?) ORDER BY t.label').bind(user,at,at).all()).results;
 const stays=(await DB.prepare('SELECT DISTINCT s.stay_id FROM stay_teams s JOIN professional_teams m ON s.team_id=m.team_id JOIN care_teams t ON t.id=s.team_id WHERE m.user_id=? AND t.active=1 AND m.valid_from<=? AND (m.valid_until IS NULL OR m.valid_until>?) AND s.valid_from<=? AND (s.valid_until IS NULL OR s.valid_until>?)').bind(user,at,at,at,at).all()).results;
 const allowed=new Set(stays.map(x=>x.stay_id)),job=profile.profession,active=!!profile.active,clinical=['anesthesiste','chirurgien','infirmier','pharmacien','dim'].includes(job);
 // Infirmier(ère) : poste « bloc » (check-list HAS, ouverture des salles) ou « étage » (sans ces deux éléments). Sans poste renseigné : étage.
 const poste=job==='infirmier'?(profile.poste==='bloc'?'bloc':'etage'):'',bloc=job!=='infirmier'||poste==='bloc';
 if(!active||['unassigned','administration'].includes(job))allowed.clear();
 const epoch=(await DB.prepare('SELECT revision FROM professional_policy_revision WHERE id=1').first()).revision;
 const globalRead={planningResources:['anesthesiste','chirurgien','infirmier','secretariat'],vacations:['anesthesiste','chirurgien','infirmier','secretariat'],reservations:['anesthesiste','chirurgien','infirmier','secretariat'],acts:['anesthesiste','chirurgien','dim','facturation'],lots:['anesthesiste','chirurgien','infirmier','pharmacien'],movements:['anesthesiste','chirurgien','infirmier','pharmacien'],pmsi:['dim','anesthesiste','chirurgien'],invoices:['facturation'],patientDrafts:[]};
 function canRead(key){if(!active)return false;const [group,id,module]=key.split('/');if(group==='stay'){if(!allowed.has(id))return false;if(module==='invitationContact'||module==='preadmission')return ['anesthesiste','chirurgien','secretariat'].includes(job);return module==='core'?job!=='unassigned'&&job!=='administration':clinical;}if(group==='identities')return allowed.size>0&&(clinical||job==='secretariat');if(group==='management')return Object.hasOwn(globalRead,id)&&(isAdmin||allowed.size>0&&(globalRead[id]||[]).includes(job));return false;}
 function filter(key,data){if(data===null||data===undefined)return data;const [group,name,module]=key.split('/');
  if(group==='stay'&&module==='core'&&!clinical)return Object.fromEntries(Object.entries(data).filter(([k])=>['id','specialty','mode','stage','sector','identity','careTeamId'].includes(k)));
  if(group==='management'){
   if(['lots','planningResources','vacations'].includes(name))return data;
   if(['pmsi','invoices'].includes(name))return (data||[]).filter(([id])=>allowed.has(id));
   if(name==='patientDrafts')return Object.fromEntries(Object.entries(data||{}).filter(([id])=>allowed.has(id)));
   return (data||[]).filter(row=>allowed.has(row.patient));
  }
  if(group==='identities')return (data||[]).filter(([id])=>name==='records'?allowed.has(id):id.split('|').every(k=>allowed.has(k)));
  return data;
 }
 function keyWrite(key,old,data,newStays=new Set()){
  if(!active)return false;const [group,id,module]=key.split('/'),inCare=allowed.has(id)||newStays.has(id);
  if(group==='stay'){
   if(!inCare)return false;
   if(module==='core')return data?.id===id&&['anesthesiste','chirurgien','secretariat'].includes(job)&& (job!=='secretariat'||Object.keys(data).every(k=>['id','specialty','mode','stage','sector','identity','careTeamId'].includes(k)));
   if(module==='invitationContact')return ['anesthesiste','chirurgien','secretariat'].includes(job);
   if(module==='nursingRecord')return ['anesthesiste','chirurgien','infirmier'].includes(job)&&appendOnly(old||[],data);
   if(module==='medicationCircuit')return ['anesthesiste','chirurgien','pharmacien'].includes(job)&&appendOnly(old||[],data)&&data.slice((old||[]).length).every(e=>['analysis','reconciliation','validation'].includes(e.kind)&&(e.kind!=='validation'||job==='pharmacien')&&e.author?.trim()&&e.note?.trim()&&Number.isFinite(Date.parse(e.at)));
   if(module==='events')return clinical&&Array.isArray(data)&&additions(old||[],data);
   if(['periopPlus','peropRapide','soinsPlus','sortiePlus','iaTrace'].includes(module))return ['anesthesiste','chirurgien','infirmier'].includes(job)&&!!data&&typeof data==='object';
   if(module==='codage')return ['anesthesiste','chirurgien','dim'].includes(job)&&!!data&&typeof data==='object'&&!Array.isArray(data);
   if(module==='preadmission')return ['anesthesiste','chirurgien','secretariat'].includes(job)&&!!data&&typeof data==='object'&&!Array.isArray(data);
   if(module==='droitsRgpd')return (['anesthesiste','chirurgien'].includes(job)||isAdmin)&&Array.isArray(data);
   // Modules issus de la veille marché : statut bloc, check-list HAS, suivi J+1 (soignants) ; aide CPA (anesthésiste) ; envois DMP/MSSanté (médecins).
   if(['checklistBloc','blocStatut','suiviAmbu','bionettoyage'].includes(module))return ['anesthesiste','chirurgien','infirmier'].includes(job)&&(module!=='checklistBloc'||bloc)&&!!data&&typeof data==='object'&&!Array.isArray(data);
   // Prescriptions préopératoires de la consultation : rédigées et signées par un médecin du séjour.
   if(module==='prescriptionsPreop')return ['anesthesiste','chirurgien'].includes(job)&&!!data&&typeof data==='object'&&!Array.isArray(data);
   // Visite pré-anesthésique : l'anesthésiste remplit, conclut et signe ; l'infirmier saisit le recueil sans toucher à la conclusion, à la signature ni aux versions.
   if(module==='vpa'){if(!data||typeof data!=='object'||Array.isArray(data))return false;if(job==='anesthesiste')return true;
    return job==='infirmier'&&same(old?.signed??null,data.signed??null)&&same(old?.history||[],data.history||[])&&same(filled(old?.draft?.conclusion),filled(data.draft?.conclusion))&&same(old?.draft?.acquittees||[],data.draft?.acquittees||[])&&same(old?.draft?.motifAlertes||'',data.draft?.motifAlertes||'');}
   if(module==='aideCpa')return job==='anesthesiste'&&!!data&&typeof data==='object'&&!Array.isArray(data);
   if(module==='envoisInterop')return ['anesthesiste','chirurgien'].includes(job)&&appendOnly(old||[],data);
   if(job==='infirmier'){
    if(module==='postopVitals')return appendOnly(old||[],data)&&(data||[]).slice((old||[]).length).every(x=>x.kind==='Surveillance'&&['SSPI','Hospitalisation'].includes(x.values?.location));
    if(module==='perop')return data&&same(old?.context||{},data.context||{})&&appendOnly(old?.records||[],data.records||[])&&(data.records||[]).slice((old?.records||[]).length).every(x=>x.kind==='Surveillance');
    if(module==='rx')return Array.isArray(old)&&Array.isArray(data)&&old.length===data.length&&old.every((rx,i)=>{const {executions:before=[],...a}=rx,{executions:after=[],...b}=data[i];return same(a,b)&&appendOnly(before,after)&&(after.length===before.length||rx.validated===true)&&after.slice(before.length).every(e=>['Réalisée','Non réalisée','Reportée','Refusée'].includes(e.status)&&e.author?.trim()&&Number.isFinite(Date.parse(e.at)));});
    return false;
   }
   if(job==='anesthesiste')return ['consult','perop','rx','notes','discharge','prepActions','postopVitals','scientificDecisions','questionnaire'].includes(module);
   if(job==='chirurgien')return ['surgicalAnnouncement','cro','croDraft','rx','notes','discharge','prepActions','postopVitals'].includes(module);
   return false;
  }
  if(group==='identities')return allowed.size>0&&(isAdmin||job==='secretariat');
  if(group==='management'&&id==='planningResources')return isAdmin&&Array.isArray(data);
  if(group==='management')return Object.hasOwn(globalRead,id)&&(isAdmin||({reservations:['anesthesiste','chirurgien','secretariat'],vacations:['anesthesiste','chirurgien','secretariat'],acts:['anesthesiste','chirurgien'],lots:['pharmacien'],movements:['pharmacien'],pmsi:['dim'],invoices:['facturation']}[id]||[]).includes(job)&&allowed.size>0);
  return false;
 }
 function merge(key,old,data){const [group,name,module]=key.split('/');if(group==='stay'&&module==='core'&&!clinical)return {...old,...data};
  if(group==='management'&&['lots','planningResources','vacations'].includes(name))return data;
  if(group==='management'&&name==='patientDrafts')return {...Object.fromEntries(Object.entries(old||{}).filter(([id])=>!allowed.has(id))),...data};
  if(group==='management'||group==='identities'){
   if(!Array.isArray(data))return data;
   const tuples=group==='identities'||['pmsi','invoices'].includes(name);
   const scope=row=>tuples?(name==='reviews'?row[0].split('|').every(id=>allowed.has(id)):allowed.has(row[0])):allowed.has(row.patient);
   if(data.some(row=>!scope(row)))throw new Error('forbidden-scope');
   return [...(old||[]).filter(row=>!scope(row)),...data];
  }
  return data;
 }
 async function nursingPeople(stayId){
  if(!canRead('stay/'+stayId+'/nursingRecord'))return [];
  return (await DB.prepare("SELECT DISTINCT p.user_id,p.display_name,p.profession FROM professional_profiles p JOIN professional_teams m ON m.user_id=p.user_id JOIN stay_teams s ON s.team_id=m.team_id JOIN care_teams t ON t.id=s.team_id WHERE s.stay_id=? AND p.active=1 AND p.profession IN ('anesthesiste','chirurgien','infirmier') AND t.active=1 AND m.valid_from<=? AND (m.valid_until IS NULL OR m.valid_until>?) AND s.valid_from<=? AND (s.valid_until IS NULL OR s.valid_until>?) ORDER BY p.display_name").bind(stayId,at,at,at,at).all()).results;
 }
 async function authorizeDocs(docs){const newStays=new Set(),grants=[];
  for(const d of docs)if(d.key.startsWith('stay/')&&d.key.endsWith('/core')&&d.revision===0&&!allowed.has(d.key.split('/')[1])){
   const team=teams.find(t=>t.id===d.data?.careTeamId);
   if(!team||!['anesthesiste','chirurgien','secretariat'].includes(job))return null;
   const id=d.key.split('/')[1];newStays.add(id);grants.push(DB.prepare('INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES(?,?,?)').bind(id,team.id,at));
  }
  for(const id of newStays)allowed.add(id);
  const out=[];
  for(const d of docs){const oldRow=await DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(d.key).first(),old=oldRow?JSON.parse(oldRow.data):null;
   if(!keyWrite(d.key,old,d.data,newStays)){await log('write',d.key,'denied','Métier ou équipe de soins non autorisé');return null}
   if(d.key.startsWith('stay/')&&d.key.endsWith('/invitationContact')){
    const v=d.data,error=invitationCore.contactError(v?.contact);
    if(error||v.confirmed!==true||v.verifiedBy!==user||!Number.isFinite(Date.parse(v.verifiedAt))||Object.keys(v).some(k=>!['contact','confirmed','verifiedBy','verifiedAt','source'].includes(k))||Object.keys(v.contact).some(k=>!['firstName','lastName','birthDate','email','phone'].includes(k))){nursingError=error||'Coordonnées relues et confirmation requises.';return null}
   }
   if(d.key.startsWith('stay/')&&d.key.endsWith('/nursingRecord')){
    const people=await nursingPeople(d.key.split('/')[1]);const error=nursingCore.validateJournal(old||[],d.data,people,profile);
    if(error){nursingError=error;await log('nursing-write',d.key,'denied',error);return null}
   }
   if(!clinical&&d.key.endsWith('/core')&&Object.keys(d.data||{}).some(k=>!['id','specialty','mode','stage','sector','identity','careTeamId'].includes(k))){await log('write',d.key,'denied','Champ clinique réservé');return null}
   let data;try{data=merge(d.key,old,d.data)}catch{await log('write',d.key,'denied','Tentative hors équipe');return null}
   for(const hash of fileReferences(data))if(!await DB.prepare('SELECT hash FROM file_scopes WHERE hash=? AND document_key=?').bind(hash,d.key).first()){await log('file-link',d.key,'denied','Pièce jointe sans autorisation de rattachement');return null}
   if(d.key.startsWith('stay/'))data=stampSignatures(old,data,{userId:user,name:profile.display_name,rpps:profile.rpps});out.push({...d,data});
  }
  // Contrôle sur le programme complet : les réservations des autres équipes
  // participent aux conflits sans être renvoyées au professionnel.
  if(out.some(d=>['management/reservations','management/planningResources','management/vacations'].includes(d.key))){
   const load=async key=>{const changed=out.find(d=>d.key===key);if(changed)return changed.data;const row=await DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):[]};
   const resources=await load('management/planningResources'),vacations=await load('management/vacations'),bookings=await load('management/reservations');
   let error='';
   if(out.some(d=>d.key==='management/planningResources'))error=planningCore.resourceError(resources);
   if(!Array.isArray(vacations)||!Array.isArray(bookings))error='Programme invalide.';
   if(!error&&out.some(d=>d.key==='management/vacations'))for(const v of vacations){
    if(v.state==='Annulée'){if(bookings.some(r=>r.vacationId===v.id&&planningCore.active(r)))error='Vacation encore affectée.';}
    else error=planningCore.vacationError(v,vacations,resources);
    if(error)break;
   }
   if(!error)for(const r of bookings.filter(r=>r.planningVersion===1)){
    error=planningCore.bookingError(r,bookings,resources,vacations);if(error)break;
    if(r.state==='Occupée')error=planningCore.transitionError(r,r.phase||'primary',bookings,resources);if(error)break;
   }
   if(!error&&out.some(d=>d.key==='management/planningResources'))for(const r of resources.filter(r=>r.open===false))if(bookings.some(b=>planningCore.active(b)&&planningCore.allocations(b).some(a=>a.resource===r.id))||vacations.some(v=>v.state!=='Annulée'&&(v.resource===r.id||v.staffIds?.includes(r.id)))){error='Ressource encore affectée.';break}
   if(error){planningError='Conflit de planning : '+error;await log('planning-conflict','management/reservations','denied',error);return null}
  }
  return {docs:out,grants};
 }
 function planningOccupancy(rows){return canRead('management/planningResources')?(rows||[]).filter(r=>planningCore.active(r)&&!allowed.has(r.patient)).flatMap(r=>planningCore.allocations(r).filter(planningCore.interval).map(a=>({resource:a.resource,start:a.start,end:a.end,current:r.state==='Occupée'&&planningCore.currentResource(r)===a.resource}))):[];}
 function policyGuard(){return DB.prepare('INSERT INTO workspace_write_checks(operation,valid) VALUES(?,CASE WHEN (SELECT revision FROM professional_policy_revision WHERE id=1)=? THEN 1 ELSE 0 END)').bind('policy-'+crypto.randomUUID(),epoch);}
 // Périmètre d'un élément de liste partagée (même règle que merge) : voir worker/items.mjs.
 function inScope(row,key,id){const [group,name]=key.split('/');if(name==='patientDrafts')return allowed.has(id);if(group==='identities'||['pmsi','invoices'].includes(name))return Array.isArray(row)&&(name==='reviews'?String(row[0]).split('|').every(x=>allowed.has(x)):allowed.has(row[0]));return allowed.has(row?.patient)}
 return {get planningError(){return nursingError||planningError},profile:{...profile,poste,isAdmin},teams,allowed,epoch,active,job,poste,bloc,isAdmin,nursingPeople,planningOccupancy,canRead,filter,keyWrite,authorizeDocs,inScope,policyGuard,log,fileReferences};
}
export {professions};
export async function professionalRoutes(acl,request,env,json,body){
 const url=new URL(request.url),path=url.pathname,method=request.method,DB=env.DB,user=acl.profile.user_id;
 if(!path.startsWith('/api/workspace/access'))return null;
 if(path==='/api/workspace/access'&&method==='GET'){
  const base={profile:acl.profile,teams:acl.teams,stays:[...acl.allowed],epoch:acl.epoch,professions};
  if(acl.isAdmin&&acl.active){base.accounts=(await DB.prepare('SELECT * FROM professional_profiles ORDER BY display_name').all()).results;base.allTeams=(await DB.prepare('SELECT * FROM care_teams ORDER BY label').all()).results;base.memberships=(await DB.prepare('SELECT * FROM professional_teams ORDER BY team_id,user_id').all()).results;base.assignments=(await DB.prepare('SELECT * FROM stay_teams ORDER BY stay_id,team_id').all()).results;base.allStays=(await DB.prepare("SELECT key FROM workspace_documents WHERE key LIKE 'stay/%/core' ORDER BY key").all()).results.map(r=>r.key.split('/')[1]);}
  await acl.log('access-profile-read',user);return json(base);
 }
 if(!acl.active){await acl.log('access-disabled',path,'denied');return json({error:'Compte désactivé.'},403)}
 if(path==='/api/workspace/access/care-team'&&method==='GET'){
  const stayId=url.searchParams.get('stay')||'';
  if(!acl.canRead('stay/'+stayId+'/nursingRecord')){await acl.log('care-team-read',stayId,'denied');return json({error:'Séjour hors habilitation.'},403)}
  const people=await acl.nursingPeople(stayId);await acl.log('care-team-read',stayId);return json({people});
 }
 if(path==='/api/workspace/access/view'&&method==='POST'){
  const d=await body(request);if(typeof d.key!=='string'||!acl.canRead(d.key)){await acl.log('view',String(d.key||''),'denied');return json({error:'Dossier hors habilitation.'},403)}await acl.log('view',d.key,'allowed','',String(d.section||'').slice(0,100));return json({recorded:true});
 }
 if(!acl.isAdmin){await acl.log('access-administration',path,'denied');return json({error:'Administration des habilitations réservée au propriétaire.'},403)}
 if(path==='/api/workspace/access/log'&&method==='GET'){
  const actor=url.searchParams.get('actor')||'',target=url.searchParams.get('target')||'',before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
  const rows=(await DB.prepare('SELECT * FROM professional_access_log WHERE sequence<? AND (?=\'\' OR actor=?) AND (?=\'\' OR target LIKE ?) ORDER BY sequence DESC LIMIT 101').bind(before,actor,actor,target,'%'+target+'%').all()).results;
  await acl.log('audit-read','professional_access_log');return json({entries:rows.slice(0,100),hasMore:rows.length>100});
 }
 if(method!=='POST')return json({error:'Service inconnu.'},404);
 const d=await body(request),reason=String(d.reason||'').trim();if(reason.length<5||reason.length>500)return json({error:'Un motif de cinq caractères au minimum est requis.'},400);
 const now=new Date().toISOString(),range=()=>typeof d.validFrom==='string'&&Number.isFinite(Date.parse(d.validFrom))&&(!d.validUntil||Number.isFinite(Date.parse(d.validUntil))&&Date.parse(d.validUntil)>Date.parse(d.validFrom));
 if(path==='/api/workspace/access/account'){
  const existing=await DB.prepare('SELECT * FROM professional_profiles WHERE user_id=?').bind(d.userId||'').first();
  if(!existing||!Object.hasOwn(professions,d.profession)||typeof d.active!=='boolean'||d.userId===user&&!d.active)return json({error:'Compte, métier ou état invalide. Le propriétaire ne peut pas désactiver son propre compte.'},400);
  const poste=d.profession==='infirmier'?String(d.poste||existing.poste||'etage'):'';if(poste&&!['bloc','etage'].includes(poste))return json({error:'Poste infirmier invalide : bloc ou étage.'},400);
  const rpps=String(d.rpps||'').trim();if(rpps&&!/^1\d{10}$/.test(rpps))return json({error:'RPPS déclaratif invalide : onze chiffres commençant par 1 attendus.'},400);
  if(rpps&&await DB.prepare('SELECT user_id FROM professional_profiles WHERE rpps=? AND user_id<>?').bind(rpps,d.userId).first())return json({error:'Ce RPPS est déjà renseigné sur un autre compte.'},409);
  await DB.prepare('UPDATE professional_profiles SET profession=?,active=?,rpps=?,updated_at=?,updated_by=? WHERE user_id=?').bind(d.profession,d.active?1:0,rpps,now,user,d.userId).run();if(Object.hasOwn(existing,'poste'))await DB.prepare('UPDATE professional_profiles SET poste=? WHERE user_id=?').bind(poste,d.userId).run();await acl.log('account-permissions',d.userId,'allowed',reason,JSON.stringify({before:{profession:existing.profession,poste:existing.poste||'',active:!!existing.active,rppsDeclared:!!existing.rpps},after:{profession:d.profession,poste,active:d.active,rppsDeclared:!!rpps}}));return json({saved:true});
 }
 if(path==='/api/workspace/access/team'){
  const label=String(d.label||'').trim();if(label.length<3||label.length>120)return json({error:'Nom d’équipe requis.'},400);const id=crypto.randomUUID();await DB.prepare('INSERT INTO care_teams(id,label,active) VALUES(?,?,1)').bind(id,label).run();await acl.log('team-create',id,'allowed',reason,label);return json({saved:true,id});
 }
 if(path==='/api/workspace/access/membership'||path==='/api/workspace/access/assignment'){
  if(!range()||!await DB.prepare('SELECT id FROM care_teams WHERE id=? AND active=1').bind(d.teamId||'').first())return json({error:'Équipe ou période invalide.'},400);
  const from=new Date(d.validFrom).toISOString(),until=d.validUntil?new Date(d.validUntil).toISOString():null;
  if(path.endsWith('/membership')){
   if(!await DB.prepare('SELECT user_id FROM professional_profiles WHERE user_id=?').bind(d.userId||'').first())return json({error:'Compte inconnu. Le professionnel doit d’abord se connecter individuellement au site.'},400);
   await DB.prepare('INSERT INTO professional_teams(user_id,team_id,valid_from,valid_until) VALUES(?,?,?,?) ON CONFLICT(user_id,team_id) DO UPDATE SET valid_from=excluded.valid_from,valid_until=excluded.valid_until').bind(d.userId,d.teamId,from,until).run();await acl.log('team-membership',d.userId,'allowed',reason,JSON.stringify({team:d.teamId,from,until}));
  }else{
   if(!await DB.prepare('SELECT key FROM workspace_documents WHERE key=?').bind('stay/'+d.stayId+'/core').first())return json({error:'Séjour inconnu.'},400);
   await DB.prepare('INSERT INTO stay_teams(stay_id,team_id,valid_from,valid_until) VALUES(?,?,?,?) ON CONFLICT(stay_id,team_id) DO UPDATE SET valid_from=excluded.valid_from,valid_until=excluded.valid_until').bind(d.stayId,d.teamId,from,until).run();await acl.log('stay-team-assignment',d.stayId,'allowed',reason,JSON.stringify({team:d.teamId,from,until}));
  }
  return json({saved:true});
 }
 return json({error:'Service inconnu.'},404);
}

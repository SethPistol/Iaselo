import {patientQuestionnaireApi,staffQuestionnaireApi} from './questionnaire.mjs';
import {professionalAccess,professionalRoutes} from './professional-access.mjs';import {openingRows,searchArchives,stayRows} from './archives.mjs';import {ITEM_MARKER,isItemKey,mergeItems,itemVersionStatements,documentAt,entries as itemEntries} from './items.mjs';
import {veilleApi} from './veille.mjs';
import {patientPrescriptionsApi,staffPrescriptionsApi} from './prescriptions.mjs';
import {staffConvocationsApi} from './convocations.mjs';
import {staffAnnoncesBlocApi} from './annonces-bloc.mjs';
import {staffIndicateursApi} from './indicateurs.mjs';
import {staffOuvertureSallesApi} from './ouverture-salles.mjs';
import {staffMarcheApi} from './marche.mjs';
import {staffProtocolesApi} from './protocoles.mjs';
import {patientSuiviJ1Api,staffSuiviJ1Api} from './suivi-j1.mjs';
import {patientEspacePatientApi,staffEspacePatientApi,consentAvant,consentDeclencher} from './espace-patient.mjs';
import {patientLettreLiaisonApi,staffLettreLiaisonApi,lettresAvant,declencher} from './lettre-liaison.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validKey=k=>typeof k==='string'&&k.length<180&&/^(stay\/[^/]{1,80}\/[a-zA-Z][a-zA-Z0-9]*|management\/[a-zA-Z]+|identities\/(records|reviews))$/.test(k);
const rawRowValue=row=>row?{key:row.key,data:JSON.parse(row.data),revision:row.revision,actor:row.actor,updatedAt:row.updated_at}:null;
async function body(request,max=1800000){const bytes=await request.arrayBuffer();if(bytes.byteLength>max)throw new Error('too_large');return JSON.parse(new TextDecoder().decode(bytes));}
export async function workspaceApi(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path.startsWith('/api/questionnaire/'))return patientQuestionnaireApi(request,env);
 if(path.startsWith('/api/prescriptions/'))return env.DB?patientPrescriptionsApi(request,env):json({error:'Stockage serveur indisponible.'},503);
 if(path.startsWith('/api/lettre-liaison/'))return env.DB?patientLettreLiaisonApi(request,env):json({error:'Stockage serveur indisponible.'},503);
 if(path.startsWith('/api/suivi-j1/'))return env.DB?patientSuiviJ1Api(request,env,env.ESTABLISHMENT):json({error:'Stockage serveur indisponible.'},503);
 if(path.startsWith('/api/espace-patient/'))return env.DB?patientEspacePatientApi(request,env,env.ESTABLISHMENT):json({error:'Stockage serveur indisponible.'},503);
 if(!path.startsWith('/api/workspace'))return null;
 if(!env.DB)return json({error:'Stockage serveur indisponible.'},503);
 if(path==='/api/workspace/health'&&method==='GET'){try{await env.DB.prepare('SELECT COUNT(*) AS count FROM workspace_documents').first();await env.DB.prepare('SELECT COUNT(*) AS count FROM professional_profiles').first();await env.DB.prepare('SELECT COUNT(*) AS count FROM professional_access_log').first();return json({database:'ready',professionalAccess:'ready',files:!!env.BUCKET,mode:'fictional-patients-only'})}catch{return json({error:'Base non initialisée.'},503)}}
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user){await env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,'non-authentifie','request',?,'denied','Connexion requise')").bind(new Date().toISOString(),path).run();return json({error:'Connexion professionnelle requise pour le dossier partagé.'},401);}
 if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')!==url.origin){await env.DB.prepare("INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES(?,?,'request',?,'denied','Origine refusée')").bind(new Date().toISOString(),user,path).run();return json({error:'Origine de requête refusée.'},403);}
 const at=new Date().toISOString();
 // Le site est privé et réservé à son propriétaire au premier déploiement.
 await env.DB.prepare("INSERT OR IGNORE INTO workspace_members(user_id,role,created_at) SELECT ?,'owner',? WHERE NOT EXISTS(SELECT 1 FROM workspace_members)").bind(user,at).run();
 const member=await env.DB.prepare('SELECT role FROM workspace_members WHERE user_id=?').bind(user).first();
 if(!member)await env.DB.prepare("INSERT OR IGNORE INTO workspace_members(user_id,role,created_at) VALUES(?,'reader',?)").bind(user,at).run();
 const acl=await professionalAccess(env,request,user,member,at);
 const accessRoute=await professionalRoutes(acl,request,env,json,body);if(accessRoute)return accessRoute;
 if(!acl.active){await acl.log('request',path,'denied','Compte désactivé');return json({error:'Compte désactivé : accès au dossier refusé.'},403)}
 const role=acl.isAdmin?'owner':acl.job==='unassigned'||acl.job==='administration'?'reader':'editor';
 const rowValue=row=>{const value=rawRowValue(row);if(value)value.data=acl.filter(row.key,value.data);return value;};
 const reject=async(target,reason)=>{await acl.log('write',target,'denied',reason);return json({error:reason},403)};
 const authDocs=async docs=>{const newStays=new Set();for(const d of docs)if(d.key?.startsWith('stay/')&&d.key.endsWith('/core')&&d.revision===0){const id=d.key.split('/')[1],team=d.data?.careTeamId;if(!d.data||d.data.id!==id||(!acl.allowed.has(id)&&!acl.teams.some(t=>t.id===team)))return null;newStays.add(id);}
  const checked=await acl.authorizeDocs(docs,newStays);return checked;
 };
 const allowFile=async(hash,key)=>{if(!key)return acl.isAdmin&&url.searchParams.get('purpose')==='backup';return acl.canRead(key)&&!!await env.DB.prepare('SELECT hash FROM file_scopes WHERE hash=? AND document_key=?').bind(hash,key).first();};

 // Listes partagées (worker/items.mjs) : la version ne garde qu'un repère, on renvoie le document courant.
 const resolveRow=async r=>r&&r.data===ITEM_MARKER?await env.DB.prepare('SELECT * FROM workspace_documents WHERE key=?').bind(r.key).first():r;
 // Fusion élément par élément des listes partagées ; renvoie null et la réponse 409 en cas de conflit réel.
 async function planItems(list){const statements=[],conflicts=[],out=[];
  for(const d of list){if(!isItemKey(d.key)){out.push(d);continue}
   const m=await mergeItems(env.DB,d.key,d.revision,d.data,acl.inScope);
   if(m.conflict){conflicts.push({key:d.key,current:rowValue(await env.DB.prepare('SELECT * FROM workspace_documents WHERE key=?').bind(d.key).first())});continue}
   out.push({...d,data:m.data,revision:m.revision});statements.push(...itemVersionStatements(env.DB,d.key,m.changes,m.revision+1,{actor:user,at,operation:d.operation,reason:d.reason}));
  }
  return conflicts.length?{error:json({error:'Conflit : un même élément a été modifié sur un autre poste. Aucune modification du lot n’a été enregistrée.',conflicts},409)}:{docs:out,statements}}
 async function audit(action,target){await env.DB.prepare('INSERT INTO workspace_access(actor,at,action,target) VALUES(?,?,?,?)').bind(user,at,action,target).run();}
 try{
  const invitationResponse=await staffQuestionnaireApi(request,env,acl);if(invitationResponse)return invitationResponse;
  const veilleResponse=await veilleApi(request,env,acl);if(veilleResponse)return veilleResponse;
  const prescriptionsResponse=await staffPrescriptionsApi(request,env,acl);if(prescriptionsResponse)return prescriptionsResponse;
  const espaceResponse=await staffEspacePatientApi(request,env,acl);if(espaceResponse)return espaceResponse;
  const suiviJ1Response=await staffSuiviJ1Api(request,env,acl);if(suiviJ1Response)return suiviJ1Response;
  const convocationsResponse=await staffConvocationsApi(request,env,acl);if(convocationsResponse)return convocationsResponse;
  const annoncesResponse=await staffAnnoncesBlocApi(request,env,acl);if(annoncesResponse)return annoncesResponse;
  const indicateursResponse=await staffIndicateursApi(request,env,acl);if(indicateursResponse)return indicateursResponse;
  const ouvertureResponse=await staffOuvertureSallesApi(request,env,acl);if(ouvertureResponse)return ouvertureResponse;
  const marcheResponse=await staffMarcheApi(request,env,acl);if(marcheResponse)return marcheResponse;
  const protocolesResponse=await staffProtocolesApi(request,env,acl);if(protocolesResponse)return protocolesResponse;
  const liaisonResponse=await staffLettreLiaisonApi(request,env,acl);if(liaisonResponse)return liaisonResponse;
  if(path==='/api/workspace'&&method==='GET'){
   const result={results:await openingRows(env.DB)},visible=result.results.filter(row=>acl.canRead(row.key));await acl.log('read','workspace','allowed','',JSON.stringify(visible.map(r=>r.key)));return json({user,role,access:{profile:acl.profile,teams:acl.teams,epoch:acl.epoch,planningOccupancy:acl.planningOccupancy(JSON.parse(result.results.find(r=>r.key==='management/reservations')?.data||'[]'))},canInitialize:env.ENABLE_DEMO_SEED===true&&acl.isAdmin&&result.results.length===0,documents:visible.map(rowValue)});
  }
  // Séjours archivés (worker/archives.mjs) : recherche puis rechargement d'un séjour, tracés.
  if(path==='/api/workspace/archives'&&method==='GET'){const q=String(url.searchParams.get('q')||'').slice(0,120);if(q.trim().length<2)return json({error:'Saisissez au moins deux caractères.'},400);const results=await searchArchives(env.DB,acl,q);await acl.log('archive-search','workspace','allowed','',String(results.length)+' résultat(s)');return json({results})}
  if(path==='/api/workspace/stay'&&method==='GET'){const id=String(url.searchParams.get('id')||'');if(!/^[^/]{1,80}$/.test(id))return json({error:'Séjour invalide.'},400);if(!acl.canRead('stay/'+id+'/core')){await acl.log('read','stay/'+id,'denied');return json({error:'Séjour hors habilitation.'},403)}
   const visible=(await stayRows(env.DB,id)).filter(row=>acl.canRead(row.key));await acl.log('read','stay/'+id,'allowed','Réouverture d’un séjour archivé',JSON.stringify(visible.map(r=>r.key)));return json({documents:visible.map(rowValue)})}
  if(path==='/api/workspace/export'&&method==='GET'){
   if(!acl.isAdmin)return reject('backup','Export réservé au propriétaire.');
   const results=await env.DB.batch([
    env.DB.prepare('SELECT * FROM workspace_documents ORDER BY key LIMIT 10001'),
    env.DB.prepare('SELECT * FROM workspace_versions ORDER BY sequence LIMIT 10001'),env.DB.prepare('SELECT * FROM workspace_item_versions ORDER BY sequence LIMIT 10001'),
    env.DB.prepare('SELECT * FROM workspace_access ORDER BY sequence LIMIT 10001'),
    env.DB.prepare('SELECT * FROM workspace_members ORDER BY user_id'),
    ...['professional_profiles','care_teams','professional_teams','stay_teams','professional_access_log','file_scopes','access_migrations'].map(table=>env.DB.prepare('SELECT * FROM '+table+' LIMIT 10001'))
   ]);
   if(results.some(r=>r.results.length>10000))return json({error:'Export trop volumineux pour cette interface ; un export d’exploitation est nécessaire.'},413);
   await audit('backup-export','workspace');await acl.log('backup-export','workspace');return json({format:'parcours-workspace-backup',schemaVersion:2,createdAt:at,documents:results[0].results,versions:results[1].results,itemVersions:results[2].results,access:results[3].results,members:results[4].results,professional:Object.fromEntries(['professional_profiles','care_teams','professional_teams','stay_teams','professional_access_log','file_scopes','access_migrations'].map((table,i)=>[table,results[i+5].results]))});
  }
  if(path==='/api/workspace/seed'&&method==='POST'){
   if(env.ENABLE_DEMO_SEED!==true)return json({error:'Initialisation des démonstrations désactivée.'},403);
   if(!acl.isAdmin)return reject('seed','Initialisation réservée au propriétaire.');
   if((await env.DB.prepare('SELECT COUNT(*) AS n FROM workspace_documents').first()).n)return json({error:'Le dossier partagé est déjà initialisé.'},409);
   const data=await body(request),entries=data.documents;
   if(!Array.isArray(entries)||entries.length>600||entries.some(d=>!validKey(d.key)||JSON.stringify(d.data).length>1500000))return json({error:'Initialisation invalide.'},400);
   const ops=entries.map(()=>crypto.randomUUID()),itemRows=[];for(const [i,d]of entries.entries())if(isItemKey(d.key))itemRows.push(...itemVersionStatements(env.DB,d.key,await itemEntries(d.key,d.data),1,{actor:user,at,operation:ops[i],reason:'Initialisation du dossier fictif'}));await env.DB.batch([...entries.map((d,i)=>env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(d.key,JSON.stringify(d.data),user,at,ops[i],'Initialisation du dossier fictif')),...itemRows]);for(const d of entries)if(d.key.endsWith('/core'))await env.DB.prepare('INSERT OR IGNORE INTO stay_teams(stay_id,team_id,valid_from) VALUES(?,?,?)').bind(d.key.split('/')[1],'demo-clinique',at).run();await acl.log('seed','workspace');return json({initialized:true});
  }
  if(path==='/api/workspace/commit'&&method==='POST'){
   const input=await body(request);let docs=input.documents;
   if(!Array.isArray(docs)||!docs.length||docs.length>150||new Set(docs.map(d=>d.key)).size!==docs.length||docs.some(d=>!validKey(d.key)||!Number.isSafeInteger(d.revision)||d.revision<0||!Object.hasOwn(d,'data')||!/^[a-f0-9-]{36}$/.test(d.operation)||typeof d.reason!=='string'||d.reason.length<3||d.reason.length>500))return json({error:'Lot de modifications invalide.'},400);
   const authorized=await authDocs(docs);if(!authorized)return reject(docs.map(d=>d.key).join(','),acl.planningError||'Modification refusée : métier ou équipe de soins non habilité.');docs=authorized.docs;
   async function replays(){const rows=await Promise.all(docs.map(d=>env.DB.prepare('SELECT * FROM workspace_versions WHERE operation=?').bind(d.operation).first()));return rows.every((r,i)=>r&&r.key===docs[i].key&&r.actor===user&&(r.data===ITEM_MARKER||JSON.stringify(acl.filter(r.key,JSON.parse(r.data)))===JSON.stringify(acl.filter(docs[i].key,docs[i].data))))?Promise.all(rows.map(resolveRow)):null;}
   const previous=await replays();if(previous)return json({documents:previous.map(rowValue),replayed:true});const plan=await planItems(docs);if(plan.error)return plan.error;docs=plan.docs;
   // Lettre de liaison : version relue avant l'écriture, pour l'envoi automatique d'une nouvelle version.
   const liaisonAvant=await lettresAvant(env,docs),consentAvantEcriture=await consentAvant(env,docs);
   const checks=docs.map(d=>env.DB.prepare('INSERT INTO workspace_write_checks(operation,valid) VALUES(?,CASE WHEN COALESCE((SELECT revision FROM workspace_documents WHERE key=?),0)=? THEN 1 ELSE 0 END)').bind(d.operation,d.key,d.revision));
   const updates=docs.map(d=>d.revision===0?env.DB.prepare('INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(d.key,JSON.stringify(d.data),user,at,d.operation,d.reason):env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(JSON.stringify(d.data),user,at,d.operation,d.reason,d.key,d.revision));
   const cleanup=docs.map(d=>env.DB.prepare('DELETE FROM workspace_write_checks WHERE operation=?').bind(d.operation));
   try{await env.DB.batch([acl.policyGuard(),...checks,...updates,...plan.statements,...authorized.grants,...cleanup,env.DB.prepare("DELETE FROM workspace_write_checks WHERE operation LIKE 'policy-%'")]);}catch(error){const replay=await replays();if(replay)return json({documents:replay.map(rowValue),replayed:true});const conflicts=[];for(const d of docs){const current=await env.DB.prepare('SELECT * FROM workspace_documents WHERE key=?').bind(d.key).first();if((current?.revision||0)!==d.revision)conflicts.push({key:d.key,current:rowValue(current)});}if(conflicts.length)return json({error:'Conflit : aucune modification du lot n’a été enregistrée.',conflicts},409);throw error;}
   const versions=await Promise.all(docs.map(async d=>resolveRow(await env.DB.prepare('SELECT * FROM workspace_versions WHERE operation=?').bind(d.operation).first())));for(const d of docs)await acl.log('write',d.key,'allowed',d.reason,'Révision '+(d.revision+1));await declencher(env,acl,docs,liaisonAvant,url.origin);await consentDeclencher(env,acl,docs,consentAvantEcriture,url.origin);return json({documents:versions.map(rowValue)});
  }
  if(path==='/api/workspace/document'&&method==='PUT'){
   let d=await body(request);
   if(!validKey(d.key)||!Number.isSafeInteger(d.revision)||d.revision<0||!Object.hasOwn(d,'data')||typeof d.operation!=='string'||!/^[a-f0-9-]{36}$/.test(d.operation)||typeof d.reason!=='string'||d.reason.length<3||d.reason.length>500)return json({error:'Document ou version invalide.'},400);
   const authorized=await authDocs([d]);if(!authorized)return reject(d.key,acl.planningError||'Modification refusée : métier ou équipe de soins non habilité.');d=authorized.docs[0];
   let payload=JSON.stringify(d.data);const liaisonAvant=await lettresAvant(env,[d]),consentAvantEcriture=await consentAvant(env,[d]);
   const replay=await env.DB.prepare('SELECT key,data,revision,actor,updated_at FROM workspace_versions WHERE operation=?').bind(d.operation).first();
   if(replay)return replay.key===d.key&&replay.actor===user&&(replay.data===ITEM_MARKER||JSON.stringify(acl.filter(replay.key,JSON.parse(replay.data)))===JSON.stringify(acl.filter(d.key,d.data)))?json({document:rowValue(await resolveRow(replay)),replayed:true}):json({error:'Identifiant d’opération déjà utilisé.'},409);const plan=await planItems([d]);if(plan.error)return plan.error;d=plan.docs[0];payload=JSON.stringify(d.data);
   const statement=d.revision===0?env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(d.key,payload,user,at,d.operation,d.reason):env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,user,at,d.operation,d.reason,d.key,d.revision);
   const results=await env.DB.batch([acl.policyGuard(),statement,...plan.statements,...authorized.grants,env.DB.prepare("DELETE FROM workspace_write_checks WHERE operation LIKE 'policy-%'")]);const result=results[1];
   if(!result.meta.changes){const current=await env.DB.prepare('SELECT * FROM workspace_documents WHERE key=?').bind(d.key).first();return json({error:'Cette rubrique a changé sur un autre poste. Comparez les versions.',current:rowValue(current)},409)}
   const ownVersion=await resolveRow(await env.DB.prepare('SELECT * FROM workspace_versions WHERE operation=?').bind(d.operation).first());await acl.log('write',d.key,'allowed',d.reason,'Révision '+ownVersion.revision);await declencher(env,acl,[d],liaisonAvant,url.origin);await consentDeclencher(env,acl,[d],consentAvantEcriture,url.origin);return json({document:rowValue(ownVersion)});
  }
  if(path==='/api/workspace/history'&&method==='GET'){
   const key=url.searchParams.get('key');if(!validKey(key))return json({error:'Rubrique invalide.'},400);
   if(!acl.canRead(key)){await acl.log('history',key,'denied');return json({error:'Rubrique hors habilitation.'},403)}
   const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
   const result=await env.DB.prepare('SELECT key,revision,actor,updated_at,reason FROM workspace_versions WHERE key=? AND revision<? ORDER BY revision DESC LIMIT 51').bind(key,before).all();await audit('history',key);await acl.log('history',key);return json({versions:result.results.slice(0,50),hasMore:result.results.length>50});
  }
  if(path==='/api/workspace/version'&&method==='GET'){
   const key=url.searchParams.get('key'),revision=Number(url.searchParams.get('revision'));if(!validKey(key)||!Number.isSafeInteger(revision)||revision<1)return json({error:'Version invalide.'},400);
   if(!acl.canRead(key)){await acl.log('version',key,'denied');return json({error:'Version hors habilitation.'},403)}
   let row=await env.DB.prepare('SELECT * FROM workspace_versions WHERE key=? AND revision=?').bind(key,revision).first();if(row&&row.data===ITEM_MARKER)row={...row,data:JSON.stringify(await documentAt(env.DB,key,revision))};await audit('version',key+'@'+revision);await acl.log('version',key,'allowed','','Révision '+revision);return row?json({document:rowValue(row)}):json({error:'Version introuvable.'},404);
  }
  const file=/^\/api\/workspace\/files\/([a-f0-9]{64})$/.exec(path);
  if(file){
   if(!env.BUCKET)return json({error:'Stockage des fichiers indisponible.'},503);const hash=file[1];
   if(method==='PUT'){
    const key=url.searchParams.get('key');if(!key||!['cro','croDraft'].includes(key.split('/')[2])||!acl.keyWrite(key,null,{}))return reject(key||hash,'Pièce jointe : rubrique hors habilitation.');
    const bytes=await request.arrayBuffer();if(bytes.byteLength>15*1024*1024)return json({error:'Fichier limité à 15 Mo.'},413);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==digest)return json({error:'Empreinte du fichier invalide.'},400);
    const name=decodeURIComponent(request.headers.get('x-file-name')||'document'),type=request.headers.get('content-type')||'application/octet-stream';
    if(name.length>200)return json({error:'Nom de fichier trop long.'},400);
    await env.DB.prepare('INSERT OR IGNORE INTO file_scopes(hash,document_key) VALUES(?,?)').bind(hash,key).run();await env.BUCKET.put(hash,bytes,{httpMetadata:{contentType:type},customMetadata:{name}});await audit('file-write',hash);return json({hash});
   }
   if(method==='GET'){
    const key=url.searchParams.get('key');if(!await allowFile(hash,key)){await acl.log('file-read',key||hash,'denied');return json({error:'Pièce jointe hors habilitation.'},403)}
    const object=await env.BUCKET.get(hash);if(!object)return json({error:'Pièce jointe introuvable.'},404);await audit('file-read',hash);await acl.log('file-read',key||'backup','allowed','',hash);return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(object.customMetadata?.name||'document'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
  }
  return json({error:'Service inconnu.'},404);
 }catch(error){return json({error:error.message==='too_large'?'Document trop volumineux.':'Enregistrement indisponible. Réessayez sans fermer vos modifications.'},error.message==='too_large'?413:503)}
}

// IASELO · bloc prédictif : liste d'attente de patients, libération de vacations, bourse aux créneaux (27/11/2026).
//  GET  /api/workspace/bloc-optimisation                       liste d'attente, libérations demandées, demandes de créneaux
//  POST /api/workspace/bloc-optimisation {action, ...}
//    attente-ajouter   {stay, surgeon, dureeMin, desDe?, jusquA?, dateActuelle?, prevenanceHeures?, note?}  chirurgien, secrétariat, cadre, admin
//    attente-retirer   {id, motif}                                                                          idem
//    proposer          {id, creneau:{start,resource,vacationId}}   SMS générique au patient (secrétariat, cadre, admin)
//    reponse           {id, accepte, note?}                        réponse du patient (au téléphone), à reprogrammer
//    liberation-demander {vacationId, motif?}                      le cadre ou l'administrateur relance le titulaire
//    liberer           {vacationId, motif}                         le chirurgien titulaire (ou le cadre, l'administrateur)
//    garder            {vacationId, motif?}                        le titulaire garde sa vacation
//    demander          {vacationId}                                un chirurgien demande une vacation libérée
//    attribuer         {vacationId, demandeId}                     le cadre ou l'administrateur attribue
// Règles : aucune déprogrammation automatique ; le SMS ne contient ni nom, ni date, ni motif (RGPD) ; une vacation n'est
// libérée que si elle ne contient plus d'intervention active ; chaque action est copiée dans bloc_optimisation_history.
import B from '../dist/bloc-previsions-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>20000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const mask=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
const parisNow=(d=new Date())=>{const p=Object.fromEntries(new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute};

// Écriture serveur d'un document partagé (révision suivante, versions conservées par le déclencheur).
export async function majDocument(env,key,actor,reason,mutate,vide=()=>[]){
 for(let attempt=0;attempt<4;attempt++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();
  const data=row?JSON.parse(row.data):vide();const outcome=await mutate(data);if(outcome?.error)return outcome;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,key,row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(key,payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...outcome};
 }
 return {error:'Enregistrement concurrent : réessayez.',status:409};
}

export function messageCreneau(etablissement){
 return (etablissement?etablissement+' : ':'')+'un créneau opératoire plus proche peut vous être proposé. Merci d’appeler le secrétariat de la clinique. Sans réponse, votre rendez-vous actuel est maintenu.';
}

export async function staffBlocOptimisationApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/bloc-optimisation')return null;
 const DB=env.DB,job=acl.job,cadre=job==='infirmier'&&acl.poste==='cadre',admin=!!acl.isAdmin,chir=job==='chirurgien',secr=job==='secretariat',anesth=job==='anesthesiste';
 const lecture=acl.active&&(admin||cadre||chir||secr||anesth),gestion=acl.active&&(admin||cadre),attente=acl.active&&(admin||cadre||chir||secr),appel=acl.active&&(admin||cadre||secr);
 if(!lecture){await acl.log('read','bloc-optimisation','denied','Réservé au bloc, au secrétariat et à l’administration');return json({error:'Optimisation du bloc : réservée aux chirurgiens, anesthésistes, secrétariat, cadre de bloc et administration.'},403)}
 const uid=acl.profile.user_id,nom=acl.profile.display_name||uid;
 const hist=(id,action,detail='')=>DB.prepare('INSERT INTO bloc_optimisation_history(id,action,actor,actor_name,at,detail) VALUES(?,?,?,?,?,?)').bind(id,action,uid,nom,new Date().toISOString(),String(detail).slice(0,600)).run();
 const lire=async id=>{const r=await DB.prepare('SELECT * FROM bloc_optimisation WHERE id=?').bind(id).first();return r?{...r,data:JSON.parse(r.data)}:null};
 const ecrire=(id,status,data)=>DB.prepare('UPDATE bloc_optimisation SET status=?,data=?,updated_at=?,updated_by=? WHERE id=?').bind(status,JSON.stringify(data),new Date().toISOString(),uid,id).run();
 const creer=async(kind,status,ref,data)=>{const id=kind.toUpperCase().slice(0,3)+'-'+crypto.randomUUID(),at=new Date().toISOString();await DB.prepare('INSERT INTO bloc_optimisation(id,kind,status,ref,data,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,kind,status,ref,JSON.stringify(data),at,uid,at,uid).run();return id};
 const identite=async stay=>{if(!acl.canRead('stay/'+stay+'/core'))return '';const i=(await docData(env,'stay/'+stay+'/core'))?.identity||{};return i.lastName?String(i.lastName).toUpperCase()+' '+(i.firstName||''):''};
 const vacations=async()=>(await docData(env,'management/vacations'))||[];
 const titulaire=v=>chir&&B.sameSurgeon(v.surgeon,nom);

 if(request.method==='GET'){
  const rows=(await DB.prepare("SELECT * FROM bloc_optimisation WHERE status NOT IN ('retire','clos') OR updated_at>=? ORDER BY created_at DESC LIMIT 500").bind(new Date(Date.now()-30*864e5).toISOString()).all()).results.map(r=>({...r,data:JSON.parse(r.data)}));
  const liste=[];for(const r of rows.filter(r=>r.kind==='attente')){
   // Un chirurgien ne voit que ses propres patients en attente.
   if(chir&&!B.sameSurgeon(r.data.surgeon,nom))continue;
   liste.push({id:r.id,status:r.status,data:r.data,patient:await identite(r.data.stay),creePar:r.created_by===uid?'vous':'',creeLe:r.created_at,majLe:r.updated_at});
  }
  const liberations=rows.filter(r=>r.kind==='liberation').map(r=>({id:r.id,status:r.status,vacationId:r.ref,data:r.data,pourMoi:chir&&B.sameSurgeon(r.data.surgeon,nom)}));
  const demandes=rows.filter(r=>r.kind==='demande').map(r=>({id:r.id,status:r.status,vacationId:r.ref,data:r.data,deMoi:r.created_by===uid}));
  await acl.log('read','bloc-optimisation','allowed','Liste d’attente et bourse aux créneaux');
  return json({liste,liberations,demandes,droits:{gestion,attente,appel,chirurgien:chir,nom},maintenant:parisNow(),sms:!!env.MESSAGING?.channels?.sms});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Requête illisible.'},400)}
 const action=String(d.action||'');

 if(action==='attente-ajouter'){
  if(!attente)return json({error:'Ajout réservé au chirurgien, au secrétariat, au cadre de bloc et à l’administration.'},403);
  const data={stay:String(d.stay||''),surgeon:String(d.surgeon||'').trim().slice(0,120),dureeMin:Number(d.dureeMin),desDe:d.desDe||'',jusquA:d.jusquA||'',dateActuelle:d.dateActuelle||'',prevenanceHeures:Number(d.prevenanceHeures??48),note:String(d.note||'').trim()};
  const err=B.attenteError(data);if(err)return json({error:err},400);
  if(!acl.canRead('stay/'+data.stay+'/core')&&!secr&&!admin){await acl.log('write','bloc-optimisation/attente','denied','Séjour hors habilitation');return json({error:'Ce séjour ne relève pas de votre équipe.'},403)}
  if(chir&&!B.sameSurgeon(data.surgeon,nom))return json({error:'Un chirurgien n’inscrit que ses propres patients.'},403);
  const deja=(await DB.prepare("SELECT id FROM bloc_optimisation WHERE kind='attente' AND status IN ('attente','propose') AND ref=?").bind(data.stay).first());
  if(deja)return json({error:'Ce patient est déjà sur la liste d’attente.'},409);
  const id=await creer('attente','attente',data.stay,{...data,propositions:[]});await hist(id,'ajout',data.surgeon+' · '+data.dureeMin+' min');
  await acl.log('write','stay/'+data.stay+'/bloc-attente','allowed','Inscription sur la liste d’attente du bloc');
  return json({ok:true,id});
 }
 if(['attente-retirer','proposer','reponse'].includes(action)){
  const r=await lire(String(d.id||''));if(!r||r.kind!=='attente')return json({error:'Entrée introuvable.'},404);
  if(chir&&!B.sameSurgeon(r.data.surgeon,nom))return json({error:'Ce patient n’est pas le vôtre.'},403);
  if(action==='attente-retirer'){
   if(!attente)return json({error:'Droit insuffisant.'},403);const motif=String(d.motif||'').trim();if(motif.length<3)return json({error:'Indiquez le motif du retrait.'},400);
   await ecrire(r.id,'retire',{...r.data,retrait:{motif,par:nom,at:new Date().toISOString()}});await hist(r.id,'retrait',motif);return json({ok:true});
  }
  if(!appel)return json({error:'Les propositions au patient sont faites par le secrétariat, le cadre de bloc ou l’administration.'},403);
  if(action==='proposer'){
   const c=d.creneau||{};if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(String(c.start||''))||!c.resource)return json({error:'Créneau invalide.'},400);
   const contact=(await docData(env,'stay/'+r.data.stay+'/invitationContact'))?.contact,messaging=env.MESSAGING;
   let sms={envoye:false,raison:''};
   if(!contact?.phone)sms.raison='Aucun numéro de portable vérifié : appelez le patient.';
   else if(!messaging?.channels?.sms)sms.raison='Envoi de SMS non configuré sur ce serveur : appelez le patient.';
   else{try{await messaging.sms({to:contact.phone,content:messageCreneau(messaging.establishment),tag:'iaselo-creneau'});sms={envoye:true,to:mask(contact.phone)}}catch(e){sms.raison=String(e.message||'Envoi impossible.').slice(0,200)}}
   const prop={creneau:{start:c.start,resource:String(c.resource),vacationId:String(c.vacationId||'')},at:new Date().toISOString(),par:nom,sms};
   await ecrire(r.id,'propose',{...r.data,propositions:[...(r.data.propositions||[]),prop].slice(-10)});
   await hist(r.id,'proposition',c.start+' · '+(sms.envoye?'SMS '+sms.to:sms.raison));
   await acl.log('write','stay/'+r.data.stay+'/bloc-attente',sms.envoye?'allowed':'denied','Créneau plus proche proposé',sms.envoye?'SMS générique '+sms.to:sms.raison);
   return json({ok:true,sms});
  }
  const accepte=d.accepte===true;
  await ecrire(r.id,accepte?'accepte':'attente',{...r.data,reponses:[...(r.data.reponses||[]),{accepte,note:String(d.note||'').slice(0,300),at:new Date().toISOString(),par:nom}]});
  await hist(r.id,accepte?'accepte':'refuse',String(d.note||''));
  return json({ok:true,aReprogrammer:accepte});
 }

 // Vacations : libération, bourse aux créneaux.
 const vacationId=String(d.vacationId||'');const v=(await vacations()).find(x=>x.id===vacationId);
 if(!v)return json({error:'Vacation introuvable.'},404);
 if(action==='liberation-demander'){
  if(!gestion)return json({error:'Relance réservée au cadre de bloc et à l’administration.'},403);
  if(v.liberee||!v.surgeon)return json({error:'Vacation déjà libre.'},409);
  const deja=await DB.prepare("SELECT id FROM bloc_optimisation WHERE kind='liberation' AND status='demandee' AND ref=?").bind(v.id).first();if(deja)return json({error:'Libération déjà demandée.'},409);
  const id=await creer('liberation','demandee',v.id,{surgeon:v.surgeon,start:v.start,end:v.end,resource:v.resource,motif:String(d.motif||'').slice(0,200),par:nom});
  await hist(id,'demande-liberation',v.surgeon+' · '+v.start);return json({ok:true,id});
 }
 if(action==='liberer'||action==='garder'){
  if(!(titulaire(v)||gestion))return json({error:'Seul le chirurgien titulaire (ou le cadre de bloc) peut décider de cette vacation.'},403);
  const demande=await DB.prepare("SELECT id,data FROM bloc_optimisation WHERE kind='liberation' AND status='demandee' AND ref=?").bind(v.id).first();
  if(action==='garder'){if(demande){await ecrire(demande.id,'gardee',{...JSON.parse(demande.data),reponse:{par:nom,at:new Date().toISOString(),motif:String(d.motif||'')}});await hist(demande.id,'gardee',String(d.motif||''))}return json({ok:true})}
  const motif=String(d.motif||'').trim();if(motif.length<3)return json({error:'Indiquez le motif de la libération.'},400);
  const res=(await docData(env,'management/reservations'))||[];
  if(res.some(r=>!['Annulée','Terminée'].includes(r.state)&&(r.vacationId===v.id)))return json({error:'Libération impossible : des interventions sont encore programmées dans cette vacation. Déprogrammez-les d’abord.'},409);
  const out=await majDocument(env,'management/vacations',uid,'Vacation libérée',list=>{const x=list.find(y=>y.id===v.id);if(!x)return {error:'Vacation introuvable.'};if(x.liberee)return {error:'Vacation déjà libérée.'};x.liberee={at:new Date().toISOString(),par:nom,motif};x.titulaireInitial=x.surgeon;x.surgeon=''});
  if(out.error)return json({error:out.error},out.status||409);
  if(demande){await ecrire(demande.id,'liberee',{...JSON.parse(demande.data),reponse:{par:nom,at:new Date().toISOString(),motif}});await hist(demande.id,'liberee',motif)}
  const id=demande?.id||v.id;await hist(id,'liberation',motif);await acl.log('write','management/vacations/'+v.id,'allowed','Vacation libérée pour la bourse aux créneaux',motif);
  return json({ok:true});
 }
 if(action==='demander'){
  if(!chir)return json({error:'La demande de créneau est faite par un chirurgien.'},403);
  if(!v.liberee)return json({error:'Cette vacation n’est pas libérée.'},409);
  const deja=await DB.prepare("SELECT id FROM bloc_optimisation WHERE kind='demande' AND status='demandee' AND ref=? AND created_by=?").bind(v.id,uid).first();if(deja)return json({error:'Vous avez déjà demandé cette vacation.'},409);
  const id=await creer('demande','demandee',v.id,{surgeon:nom,start:v.start,end:v.end,resource:v.resource,note:String(d.note||'').slice(0,200)});
  await hist(id,'demande-creneau',v.start);return json({ok:true,id});
 }
 if(action==='attribuer'){
  if(!gestion)return json({error:'L’attribution est faite par le cadre de bloc ou l’administration.'},403);
  const dem=await lire(String(d.demandeId||''));if(!dem||dem.kind!=='demande'||dem.ref!==v.id||dem.status!=='demandee')return json({error:'Demande introuvable.'},404);
  const out=await majDocument(env,'management/vacations',uid,'Vacation attribuée (bourse aux créneaux)',list=>{const x=list.find(y=>y.id===v.id);if(!x)return {error:'Vacation introuvable.'};if(!x.liberee)return {error:'Vacation non libérée.'};x.surgeon=dem.data.surgeon;x.attribuee={at:new Date().toISOString(),par:nom,depuis:x.titulaireInitial||''};delete x.liberee});
  if(out.error)return json({error:out.error},out.status||409);
  await ecrire(dem.id,'attribuee',{...dem.data,attribuePar:nom});await hist(dem.id,'attribution',dem.data.surgeon);
  for(const o of (await DB.prepare("SELECT id,data FROM bloc_optimisation WHERE kind='demande' AND status='demandee' AND ref=?").bind(v.id).all()).results){await ecrire(o.id,'non-retenue',JSON.parse(o.data));await hist(o.id,'non-retenue','')}
  return json({ok:true});
 }
 return json({error:'Action inconnue.'},400);
}

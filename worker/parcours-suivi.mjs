// IASELO · parcours de soins à distance (RAAC, ambulatoire, endoscopie), de J-7 à J+30 (27/11/2026).
//  Patient (lien personnel reçu par SMS ou e-mail, sans compte) :
//   POST /api/parcours/open    contenu de l'étape : fiche d'éducation, ou questions (sans réponse antérieure)
//   POST /api/parcours/submit  réponses (date de naissance vérifiée) → alertes à l'équipe
//  Professionnels (médecins et infirmier(ère)s du séjour) :
//   GET  /api/workspace/parcours/tableau          patients suivis, alertes, séjours à inscrire, indicateurs PROMs/PREMs
//   GET  /api/workspace/parcours/dossier?stay=    calendrier détaillé d'un patient
//   POST /api/workspace/parcours/action           inscrire, changer, arreter, reprendre, envoyer, traiter, opposition-esatis
//   GET  /api/workspace/parcours/esatis?mois=     fichier e-Satis des patients sortis (administrateur ou médecin)
//  Envois automatiques : tourneeParcours(), appelée par la tournée des rappels (10 h – 20 h, heure de Paris).
// Rubrique stay/<id>/parcoursSuivi écrite par le serveur seulement ; SMS sans donnée de santé ; lien stocké haché ;
// chaque envoi, lecture, réponse et action est tracé dans le journal d'accès.
import P from '../dist/parcours-suivi-regles.js';
import R from '../dist/espace-patient-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>30000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');
const mask=v=>{v=String(v||'');if(v.includes('@')){const [a,b]=v.split('@');return a.slice(0,2)+'***@'+b}return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
const validStay=s=>/^[^/]{1,80}$/.test(String(s||''));
const docKey=stay=>'stay/'+stay+'/parcoursSuivi';
const JOBS=['anesthesiste','chirurgien','infirmier'],MAX_ECHECS=5;
const vide=()=>({programme:'',inscrit:null,arret:null,esatisOpposition:false,envois:[],reponses:[],historique:[]});
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
const jourParis=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now);
const patientLog=(env,stay,action,result,reason)=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),'patient-lien',action,docKey(stay),result,reason,'').run();

export async function updateParcours(env,stay,actor,reason,mutate){
 const key=docKey(stay);
 for(let attempt=0;attempt<4;attempt++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();
  const data={...vide(),...(row?JSON.parse(row.data):{})};
  const outcome=await mutate(data);if(outcome?.error)return outcome;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,key,row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(key,payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...outcome};
 }
 return {error:'Modification concurrente, réessayez.',status:409};
}

async function contexte(env,stay){
 const [core,consult,surgicalAnnouncement,inv,parcours]=await Promise.all(['core','consult','surgicalAnnouncement','invitationContact','parcoursSuivi'].map(m=>docData(env,'stay/'+stay+'/'+m)));
 const id=core?.identity||{},ann=surgicalAnnouncement?.published?.fields||{};
 return {core,contact:inv?.contact||null,parcours:{...vide(),...(parcours||{})},inscrit:!!parcours?.programme,
  date:R.datePrevueSejour({consult,surgicalAnnouncement}),intervention:ann.procedure||consult?.ext?.operation||'',
  patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||'',naissance:id.birthDate||''},specialite:core?.specialty||'',mode:core?.mode||''};
}

/* ---------------- Envoi d'une étape ---------------- */
async function claim(env,stay,kind,date){
 const at=new Date().toISOString();
 const r=await env.DB.prepare("INSERT OR IGNORE INTO rappels_auto(stay_id,kind,date_ref,statut,created_at,updated_at) VALUES(?,?,?,'en-cours',?,?)").bind(stay,kind,date,at,at).run();
 return r.meta.changes>0;
}
const record=(env,stay,kind,date,statut,detail='')=>env.DB.prepare('UPDATE rappels_auto SET statut=?,detail=?,updated_at=? WHERE stay_id=? AND kind=? AND date_ref=?').bind(statut,String(detail).slice(0,600),new Date().toISOString(),stay,kind,date).run();
async function creerLien(env,{stay,etape,programme,date,birthDate,jours}){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),at=new Date().toISOString(),expires=new Date(Date.now()+jours*864e5).toISOString();
 await env.DB.prepare('INSERT INTO parcours_links(token_hash,stay_id,etape,programme,date_ref,birth_date,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(await sha(token),stay,etape,programme,date,birthDate||'',at,expires).run();
 return token;
}
// Envoie le lien d'une étape (SMS, sinon e-mail). manuel : relance demandée par un soignant (pas de garde « déjà envoyé »).
export async function envoyerEtape(env,acl,{stay,etapeId,origin,manuel=false}){
 const ctx=await contexte(env,stay),p=ctx.parcours,e=P.etape(p.programme,etapeId);
 if(!e)return {ok:false,raison:'Étape inconnue pour ce parcours.'};
 if(!P.isDate(ctx.date))return {ok:false,raison:'Date d’intervention inconnue.'};
 const date=P.decale(ctx.date,e.j),kind='parcours:'+e.id,messaging=env.MESSAGING,contact=ctx.contact;
 const echec=async raison=>{
  const prev=[...p.envois].reverse().find(x=>x.etape===e.id);
  if(manuel||!(prev&&!prev.ok&&prev.raison===raison)){
   await acl.log('parcours-envoi',docKey(stay),'denied','Étape du parcours non envoyée · '+P.libelleEtape(e),raison);
   await updateParcours(env,stay,acl.profile.user_id,'Étape du parcours non envoyée',d=>{d.envois=[...d.envois,{etape:e.id,date,at:new Date().toISOString(),ok:false,raison,par:acl.profile.display_name}].slice(-60)});
  }
  return {ok:false,raison};
 };
 if(!contact||(!contact.phone&&!contact.email))return echec('Aucune coordonnée vérifiée (portable ou e-mail) : enregistrez-les dans « Questionnaire patient ».');
 if(e.type==='questionnaire'&&!P.isDate(contact.birthDate))return echec('Date de naissance absente des coordonnées vérifiées : questionnaire impossible.');
 const sms=!!(contact.phone&&messaging?.channels?.sms),mail=!!(contact.email&&messaging?.channels?.email);
 if(!sms&&!mail)return echec('Envoi SMS et e-mail non configuré sur ce serveur (Brevo).');
 if(!manuel&&!await claim(env,stay,kind,date))return {ok:false,deja:true};
 const token=await creerLien(env,{stay,etape:e.id,programme:p.programme,date,birthDate:contact.birthDate,jours:e.type==='fiche'?30:5});
 const lien=origin+'/parcours.html#acces='+token,texte=P.sms(messaging.establishment,e,lien);
 let ok=false,detail='',canal='';
 try{
  if(sms){const ref=await messaging.sms({to:contact.phone,content:texte,tag:'iaselo-parcours'});canal='sms';detail='SMS envoyé à '+mask(contact.phone)+(ref?' · réf. Brevo '+ref:'')}
  else{await messaging.email({to:contact.email,name:[contact.firstName,contact.lastName].filter(Boolean).join(' '),subject:(messaging.establishment||'La clinique')+' · votre suivi',text:texte,tag:'iaselo-parcours'});canal='email';detail='E-mail envoyé à '+mask(contact.email)}
  ok=true;
 }catch(err){detail=String(err.message||'Envoi impossible.').slice(0,200)}
 if(!manuel)await record(env,stay,kind,date,ok?'envoye':'echec',detail);
 await acl.log('parcours-envoi',docKey(stay),ok?'allowed':'denied',(manuel?'Relance':'Envoi automatique')+' · '+P.libelleEtape(e),detail);
 await updateParcours(env,stay,acl.profile.user_id,'Envoi d’une étape du parcours',d=>{d.envois=[...d.envois,{etape:e.id,date,at:new Date().toISOString(),ok,canal,...(ok?{detail}:{raison:detail}),par:manuel?acl.profile.display_name:'Envoi automatique IASELO'}].slice(-60)});
 return {ok,detail,...(ok?{}:{raison:detail})};
}

// Passage automatique : étapes du jour (ou des 2 jours précédents, si le patient a été inscrit tard ou l'envoi a échoué).
export async function tourneeParcours(env,acl,{now=new Date(),origin=''}={}){
 const jour=jourParis(now),rows=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/parcoursSuivi'").all()).results||[],out=[];
 for(const r of rows){
  const stay=r.key.split('/')[1];let p;try{p=JSON.parse(r.data)}catch{continue}
  if(!p?.programme||p.arret)continue;
  try{
   const ctx=await contexte(env,stay);if(!P.isDate(ctx.date))continue;
   for(const e of P.PROGRAMMES[p.programme]?.etapes||[]){
    const date=P.decale(ctx.date,e.j),retard=Math.round((Date.parse(jour+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/864e5);
    if(retard<0||retard>2)continue;
    if((p.envois||[]).some(x=>x.etape===e.id&&x.ok))continue;
    const res=await envoyerEtape(env,acl,{stay,etapeId:e.id,origin});if(!res.deja)out.push({stay,etape:e.id,...res});
   }
  }catch(err){console.error('parcours',stay,err?.message||err)}
 }
 return out;
}

/* ---------------- Patient ---------------- */
export async function patientParcoursApi(request,env,etab=''){
 try{
  const url=new URL(request.url),route=url.pathname.replace('/api/parcours/','');
  if(request.method!=='POST'||!['open','submit'].includes(route))return json({error:'Service inconnu.'},404);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
  const d=await body(request),token=String(d.token||'');
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Lien invalide.'},404);
  const hash=await sha(token),row=await env.DB.prepare('SELECT * FROM parcours_links WHERE token_hash=?').bind(hash).first(),at=new Date().toISOString();
  if(!row)return json({error:'Lien invalide.'},404);
  const fin='Ce lien n’est plus valable. En cas de besoin, appelez la clinique ; en cas d’urgence, le 15.';
  if(row.expires_at<at||Number(row.failed_attempts)>=MAX_ECHECS)return json({error:fin},410);
  const p=await docData(env,docKey(row.stay_id));if(!p||p.arret||p.programme!==row.programme)return json({error:fin},410);
  const e=P.etape(row.programme,row.etape);if(!e)return json({error:fin},410);
  const base={etablissement:etab||'la clinique',type:e.type};
  if(e.type==='fiche'){
   if(route!=='open')return json({error:'Aucune réponse attendue.'},400);
   if(!row.first_viewed_at){
    await env.DB.prepare('UPDATE parcours_links SET first_viewed_at=? WHERE token_hash=?').bind(at,hash).run();
    await updateParcours(env,row.stay_id,'patient-lien','Fiche d’éducation lue par le patient',x=>{const env_=[...x.envois].reverse().find(v=>v.etape===e.id&&v.ok);if(env_&&!env_.lue){env_.lue=at}});
    await patientLog(env,row.stay_id,'parcours-fiche-lue','allowed','Fiche lue · '+P.FICHES[e.fiche].titre);
   }
   return json({...base,fiche:P.FICHES[e.fiche]});
  }
  const qid=e.questionnaire,q=P.QUESTIONNAIRES[qid];
  const questions=q.questions.map(([id,type,texte])=>({id,type,texte,obligatoire:!['texte','temperature'].includes(type)}));
  if(route==='open'){
   if(!row.first_viewed_at)await env.DB.prepare('UPDATE parcours_links SET first_viewed_at=? WHERE token_hash=?').bind(at,hash).run();
   return json({...base,titre:q.titre,questions,reponses:Number(row.answers)});
  }
  if(!P.isDate(row.birth_date)||String(d.birthDate||'')!==row.birth_date){
   await env.DB.prepare('UPDATE parcours_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
   await patientLog(env,row.stay_id,'parcours-reponse','denied','Date de naissance incorrecte');
   return json({error:'La date de naissance ne correspond pas.'},400);
  }
  if(Number(row.answers)>=1)return json({error:'Vos réponses ont bien été reçues. Pour toute question, appelez la clinique.'},409);
  const v=P.valider(qid,d.answers||{});if(!v.ok)return json({error:v.errors.join(' ')},400);
  const alerts=P.alertes(qid,v.answers);
  const r=await updateParcours(env,row.stay_id,'patient-lien','Questionnaire du parcours rempli par le patient',x=>{
   x.reponses=[...x.reponses,{etape:e.id,questionnaire:qid,date:row.date_ref,at,answers:v.answers,alerts,traite:null}].slice(-40);
  });
  if(r.error)return json({error:r.error},r.status||409);
  await env.DB.prepare('UPDATE parcours_links SET answers=answers+1 WHERE token_hash=?').bind(hash).run();
  const graves=alerts.filter(a=>a.level!=='info');
  await patientLog(env,row.stay_id,'parcours-reponse','allowed',P.libelleEtape(e)+(graves.length?' · alerte à l’équipe ('+graves.length+')':' · sans alerte'));
  return json({ok:true,alerte:graves.length>0,crit:alerts.some(a=>a.level==='crit')});
 }catch(e){return json({error:'Demande invalide.'},400)}
}

/* ---------------- Professionnels ---------------- */
const peutLire=(acl,stay)=>validStay(stay)&&JOBS.includes(acl.job)&&acl.canRead(docKey(stay));
async function lireTous(env,module){return new Map(((await env.DB.prepare('SELECT key,data FROM workspace_documents WHERE key LIKE ?').bind('stay/%/'+module).all()).results||[]).map(r=>{try{return [r.key.split('/')[1],JSON.parse(r.data)]}catch{return [r.key.split('/')[1],null]}}))}
async function tableau(env,acl){
 const [cores,consults,annonces,contacts,parcours]=await Promise.all(['core','consult','surgicalAnnouncement','invitationContact','parcoursSuivi'].map(m=>lireTous(env,m)));
 const jour=jourParis(),suivis=[],aInscrire=[],tous=[];
 for(const [stay,core] of cores){
  if(!core||!peutLire(acl,stay))continue;
  const consult=consults.get(stay),ann=annonces.get(stay),date=R.datePrevueSejour({consult,surgicalAnnouncement:ann}),id=core.identity||{};
  const intervention=ann?.published?.fields?.procedure||consult?.ext?.operation||'',p=parcours.get(stay);
  const base={stay,patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||''},intervention,specialite:core.specialty||'',mode:core.mode||'',date,contact:!!contacts.get(stay)?.contact};
  if(p?.programme){
   const etat=P.etatParcours(p,date,jour);tous.push({...p,stay});
   suivis.push({...base,programme:p.programme,etat:{...etat,etapes:undefined},etapes:(etat.etapes||[]).map(e=>({id:e.id,j:e.j,date:e.date,code:e.code,type:e.type})),derniereReponse:(p.reponses||[]).at(-1)||null,alertes:(p.reponses||[]).map((r,index)=>({...r,index})).filter(r=>r.alerts?.length&&!r.traite)});
  }else if(P.isDate(date)&&date>=P.decale(jour,-25)&&date<=P.decale(jour,45))aInscrire.push({...base,propose:P.proposer({intervention,specialite:base.specialite,mode:base.mode})});
 }
 suivis.sort((a,b)=>(b.alertes.length-a.alertes.length)||String(a.date).localeCompare(String(b.date)));aInscrire.sort((a,b)=>a.date.localeCompare(b.date));
 await acl.log('parcours-tableau','parcours','allowed','Tableau du télésuivi consulté',suivis.length+' patient(s) suivi(s)');
 return {jour,suivis,aInscrire,indicateurs:P.indicateurs(tous),programmes:Object.fromEntries(Object.entries(P.PROGRAMMES).map(([k,v])=>[k,{label:v.label,etapes:v.etapes.map(e=>({...e,libelle:P.libelleEtape(e)}))}]))};
}
async function esatis(env,acl,mois){
 const [cores,consults,annonces,contacts,parcours]=await Promise.all(['core','consult','surgicalAnnouncement','invitationContact','parcoursSuivi'].map(m=>lireTous(env,m)));
 const reservations=(await docData(env,'management/reservations'))||[],lignes=[];
 for(const [stay,core] of cores){
  if(!core||!(acl.isAdmin||acl.canRead('stay/'+stay+'/core')))continue;
  const date=R.datePrevueSejour({consult:consults.get(stay),surgicalAnnouncement:annonces.get(stay)});if(!P.isDate(date))continue;
  const lit=(Array.isArray(reservations)?reservations:[]).filter(r=>r.patient===stay&&r.bed?.end).map(r=>String(r.bed.end).slice(0,10)).sort().at(-1);
  const ambu=/ambu/i.test(core.mode||''),sortie=lit||(ambu?date:'');
  if(!String(sortie||date).startsWith(mois))continue;
  lignes.push({stay,email:contacts.get(stay)?.contact?.email||'',dateEntree:date,dateSortie:sortie,mode:core.mode||'',opposition:!!parcours.get(stay)?.esatisOpposition});
 }
 const finess=String(env.INTEROP_ENV?.INTEROP_FINESS||'').trim(),out=P.esatisCsv(lignes,{finess});
 await acl.log('parcours-esatis','parcours','allowed','Fichier e-Satis exporté · '+mois,out.retenus+' patient(s) retenu(s), '+out.exclus+' exclu(s)');
 return {...out,mois,finess,sansDateSortie:lignes.filter(l=>!l.dateSortie).length};
}

export async function staffParcoursApi(request,env,acl){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/workspace/parcours/'))return null;
 const route=path.slice('/api/workspace/parcours/'.length),origin=url.origin;
 if(route==='esatis'&&request.method==='GET'){
  if(!acl.isAdmin&&!['anesthesiste','chirurgien'].includes(acl.job))return json({error:'Export réservé à l’administrateur et aux médecins.'},403);
  const mois=String(url.searchParams.get('mois')||'');if(!/^\d{4}-\d{2}$/.test(mois))return json({error:'Mois invalide (AAAA-MM).'},400);
  return json(await esatis(env,acl,mois));
 }
 if(!JOBS.includes(acl.job))return json({error:'Télésuivi réservé aux médecins et infirmier(ère)s du séjour.'},403);
 if(route==='tableau'&&request.method==='GET')return json(await tableau(env,acl));
 if(route==='dossier'&&request.method==='GET'){
  const stay=url.searchParams.get('stay')||'';if(!peutLire(acl,stay))return json({error:'Accès refusé.'},403);
  const ctx=await contexte(env,stay),jour=jourParis();
  return json({stay,parcours:ctx.parcours,date:ctx.date,intervention:ctx.intervention,contact:ctx.contact?{telephone:!!ctx.contact.phone,email:!!ctx.contact.email,naissance:P.isDate(ctx.contact.birthDate)}:null,
   propose:P.proposer({intervention:ctx.intervention,specialite:ctx.specialite,mode:ctx.mode}),etat:P.etatParcours(ctx.parcours,ctx.date,jour)});
 }
 if(route!=='action'||request.method!=='POST')return json({error:'Service inconnu.'},404);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const stay=String(d.stay||''),action=String(d.action||''),who=acl.profile.display_name||'Professionnel',at=new Date().toISOString();
 if(!peutLire(acl,stay))return json({error:'Accès refusé.'},403);
 const trace=(x,texte)=>{x.historique=[...(x.historique||[]),{at,par:who,texte}].slice(-60)};
 let r;
 if(action==='inscrire'){
  const programme=String(d.programme||'');if(!P.PROGRAMMES[programme])return json({error:'Parcours inconnu.'},400);
  r=await updateParcours(env,stay,acl.profile.user_id,'Inscription au parcours',x=>{if(x.programme===programme&&!x.arret)return {error:'Patient déjà inscrit à ce parcours.',status:409};const avant=x.programme;x.programme=programme;x.arret=null;x.inscrit={at,par:who};trace(x,avant?'Parcours changé : '+P.PROGRAMMES[avant]?.label+' → '+P.PROGRAMMES[programme].label:'Inscrit au parcours '+P.PROGRAMMES[programme].label)});
 }else if(action==='arreter'){
  const motif=String(d.motif||'').trim().slice(0,300);if(motif.length<3)return json({error:'Indiquez le motif de l’arrêt.'},400);
  r=await updateParcours(env,stay,acl.profile.user_id,'Arrêt du parcours',x=>{if(!x.programme||x.arret)return {error:'Aucun parcours en cours.',status:409};x.arret={at,par:who,motif};trace(x,'Parcours arrêté : '+motif)});
 }else if(action==='reprendre'){
  r=await updateParcours(env,stay,acl.profile.user_id,'Reprise du parcours',x=>{if(!x.arret)return {error:'Le parcours n’est pas arrêté.',status:409};x.arret=null;trace(x,'Parcours repris')});
 }else if(action==='opposition-esatis'){
  r=await updateParcours(env,stay,acl.profile.user_id,'Opposition e-Satis',x=>{x.esatisOpposition=d.opposition===true;trace(x,x.esatisOpposition?'Le patient s’oppose à l’enquête e-Satis':'Opposition e-Satis retirée')});
 }else if(action==='traiter'){
  const texte=String(d.texte||'').trim().slice(0,300);if(texte.length<3)return json({error:'Indiquez l’action réalisée (rappel du patient, consultation…).'},400);
  r=await updateParcours(env,stay,acl.profile.user_id,'Alerte du parcours traitée',x=>{const rep=x.reponses?.[Number(d.index)];if(!rep||!rep.alerts?.length)return {error:'Alerte introuvable.',status:404};if(rep.traite)return {error:'Alerte déjà traitée.',status:409};rep.traite={at,par:who,action:texte};trace(x,'Alerte traitée ('+P.etape(x.programme,rep.etape)?.id+') : '+texte)});
 }else if(action==='envoyer'){
  const ctx=await contexte(env,stay);if(!ctx.parcours.programme||ctx.parcours.arret)return json({error:'Aucun parcours en cours.'},409);
  const res=await envoyerEtape(env,acl,{stay,etapeId:String(d.etape||''),origin,manuel:true});
  if(!res.ok)return json({error:res.raison||'Envoi impossible.'},res.raison==='Étape inconnue pour ce parcours.'?400:502);
  await acl.log('parcours-relance',docKey(stay),'allowed','Étape renvoyée par '+who,res.detail);
  return json({ok:true,detail:res.detail,parcours:(await contexte(env,stay)).parcours});
 }else return json({error:'Action inconnue.'},400);
 if(r.error)return json({error:r.error},r.status||409);
 await acl.log('parcours-'+action,docKey(stay),'allowed','Parcours de soins · '+action,(r.data.historique||[]).at(-1)?.texte||'');
 return json({ok:true,parcours:r.data});
}

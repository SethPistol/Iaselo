// IASELO · préhabilitation de J-30 à J-1 (28/11/2026, 5e veille, lot 6). Règles : dist/prehabilitation-regles.js.
//  Patient (lien personnel reçu par SMS ou e-mail, ou QR code remis en consultation ; sans compte) :
//   POST /api/prehab/open   {token, naissance}                 programme, objectifs, ses saisies
//   POST /api/prehab/jour   {token, naissance, date, valeurs}  saisie du jour (aujourd'hui ou les 2 jours précédents)
//  Professionnels (médecins et infirmier(ère)s du séjour) :
//   GET  /api/workspace/prehab/tableau                          patients inscrits (adhésion) et patients à proposer
//   POST /api/workspace/prehab/action  {action:'inscrire', stay, items, marcheMin, fumeur}  → lien (montré une fois) + envoi
//                                      {action:'lien', stay}    nouveau lien (l'ancien est révoqué) + envoi
//                                      {action:'arreter', stay, motif}
// Rubrique stay/<id>/prehabilitation écrite par le serveur seulement. Lien stocké haché, 5 erreurs de date de naissance
// au plus. SMS sans donnée de santé. Chaque lecture, saisie et action est tracée.
import H from '../dist/prehabilitation-regles.js';
import R from '../dist/espace-patient-regles.js';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function body(request){const b=await request.arrayBuffer();if(b.byteLength>8000)throw Error('size');return JSON.parse(new TextDecoder().decode(b))}
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');
const mask=v=>{v=String(v||'');if(v.includes('@')){const [a,b]=v.split('@');return a.slice(0,2)+'***@'+b}return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
const validStay=s=>/^[^/]{1,80}$/.test(String(s||''));
const docKey=stay=>'stay/'+stay+'/prehabilitation';
const JOBS=['anesthesiste','chirurgien','infirmier'],MAX_ECHECS=5;
const jourParis=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now);
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();try{return row?JSON.parse(row.data):null}catch{return null}}
const patientLog=(env,stay,action,result,reason)=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),'patient-lien',action,docKey(stay),result,reason,'').run();

async function mettreAJour(env,stay,actor,reason,mutate){
 const key=docKey(stay);
 for(let i=0;i<4;i++){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();
  const data={journal:{},historique:[],envois:[],...(row?JSON.parse(row.data):{})};
  const out=await mutate(data);if(out?.error)return out;
  const at=new Date().toISOString(),op=crypto.randomUUID(),payload=JSON.stringify(data);
  const r=row?await env.DB.prepare('UPDATE workspace_documents SET data=?,revision=revision+1,actor=?,updated_at=?,operation=?,reason=? WHERE key=? AND revision=?').bind(payload,actor,at,op,reason,key,row.revision).run()
   :await env.DB.prepare('INSERT OR IGNORE INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').bind(key,payload,actor,at,op,reason).run();
  if(r.meta.changes)return {data,...out};
 }
 return {error:'Modification concurrente, réessayez.',status:409};
}
async function contexte(env,stay){
 const [core,consult,surgicalAnnouncement,inv,prehab]=await Promise.all(['core','consult','surgicalAnnouncement','invitationContact','prehabilitation'].map(m=>docData(env,'stay/'+stay+'/'+m)));
 const id=core?.identity||{};
 return {core,contact:inv?.contact||null,prehab,date:R.datePrevueSejour({consult,surgicalAnnouncement}),patient:{nom:id.lastName||'',prenom:id.firstName||'',naissance:id.birthDate||''}};
}
// Nouveau lien personnel : les liens précédents du séjour sont révoqués.
async function nouveauLien(env,stay,{naissance,date}){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),at=new Date().toISOString();
 const fin=H.isDate(date)?new Date(Date.parse(date+'T23:59:59Z')).toISOString():new Date(Date.now()+45*864e5).toISOString();
 await env.DB.prepare('UPDATE prehab_links SET revoked_at=? WHERE stay_id=? AND revoked_at IS NULL').bind(at,stay).run();
 await env.DB.prepare('INSERT INTO prehab_links(token_hash,stay_id,birth_date,created_at,expires_at,failed_attempts) VALUES(?,?,?,?,?,0)').bind(await sha(token),stay,naissance||'',at,fin).run();
 return token;
}
async function envoyer(env,acl,stay,ctx,lien){
 const m=env.MESSAGING,c=ctx.contact;
 if(!c||(!c.phone&&!c.email))return {ok:false,raison:'Aucune coordonnée vérifiée (portable ou e-mail) : remettez le QR code au patient.'};
 const sms=!!(c.phone&&m?.channels?.sms),mail=!!(c.email&&m?.channels?.email);
 if(!sms&&!mail)return {ok:false,raison:'Envoi SMS et e-mail non configuré sur ce serveur : remettez le QR code au patient.'};
 const texte=H.sms(m.establishment,lien);
 try{
  if(sms){await m.sms({to:c.phone,content:texte,tag:'iaselo-prehab'});return {ok:true,canal:'sms',detail:'SMS envoyé à '+mask(c.phone)}}
  await m.email({to:c.email,name:[c.firstName,c.lastName].filter(Boolean).join(' '),subject:(m.establishment||'La clinique')+' · votre préparation',text:texte,tag:'iaselo-prehab'});return {ok:true,canal:'email',detail:'E-mail envoyé à '+mask(c.email)};
 }catch(e){return {ok:false,raison:String(e?.message||'Envoi impossible.').slice(0,200)}}
}

/* ---------------- Patient ---------------- */
export async function patientPrehabApi(request,env,etab=''){
 const url=new URL(request.url),route=url.pathname.replace('/api/prehab/','');
 if(request.method!=='POST'||!['open','jour'].includes(route))return json({error:'Service inconnu.'},404);
 if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const token=String(d.token||'');if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Lien invalide.'},404);
 const hash=await sha(token),row=await env.DB.prepare('SELECT * FROM prehab_links WHERE token_hash=?').bind(hash).first(),at=new Date().toISOString();
 const fin='Ce lien n’est plus valable. En cas de besoin, appelez la clinique.';
 if(!row)return json({error:'Lien invalide.'},404);
 if(row.revoked_at||row.expires_at<at||Number(row.failed_attempts)>=MAX_ECHECS)return json({error:fin},410);
 if(!H.isDate(d.naissance)||d.naissance!==row.birth_date){
  await env.DB.prepare('UPDATE prehab_links SET failed_attempts=failed_attempts+1 WHERE token_hash=?').bind(hash).run();
  await patientLog(env,row.stay_id,'prehab-acces','denied','Date de naissance incorrecte');
  return json({error:'Date de naissance incorrecte.',naissance:true},403);
 }
 const ctx=await contexte(env,row.stay_id),p=ctx.prehab;
 if(!p?.inscrit||p.arret)return json({error:fin},410);
 const jour=jourParis(),f=H.fenetre(ctx.date,String(p.inscrit.at).slice(0,10));
 if(route==='jour'){
  if(!H.saisissable(d.date,f,jour))return json({error:'Ce jour ne peut plus être rempli.'},400);
  const v=H.valider(H.objectifs(p.objectifs),d.valeurs||{});if(!v.ok)return json({error:v.erreurs.join(' ')},400);
  const r=await mettreAJour(env,row.stay_id,'patient-lien','Préhabilitation : saisie du patient',x=>{x.journal={...x.journal,[d.date]:{...v.valeurs,at}}});
  if(r.error)return json({error:r.error},r.status||409);
  await patientLog(env,row.stay_id,'prehab-saisie','allowed','Préhabilitation : saisie du '+d.date);
  return json({ok:true,adhesion:H.adhesion(r.data,ctx.date,jour),journal:r.data.journal});
 }
 await patientLog(env,row.stay_id,'prehab-ouverture','allowed','Préhabilitation : programme ouvert par le patient');
 const obj=H.objectifs(p.objectifs);
 return json({etablissement:etab||'la clinique',prenom:ctx.patient.prenom,aujourdhui:jour,fenetre:f,objectifs:obj,
  items:obj.items.map(i=>({id:i,type:H.ITEMS[i].type,question:H.ITEMS[i].question,conseil:H.ITEMS[i].conseil,libelle:H.ITEMS[i].libelle})),
  journal:p.journal||{},adhesion:H.adhesion(p,ctx.date,jour)});
}

/* ---------------- Professionnels ---------------- */
const peutLire=(acl,stay)=>validStay(stay)&&JOBS.includes(acl.job)&&acl.canRead('stay/'+stay+'/core');
async function lireTous(env,module){return new Map(((await env.DB.prepare('SELECT key,data FROM workspace_documents WHERE key LIKE ?').bind('stay/%/'+module).all()).results||[]).map(r=>{try{return [r.key.split('/')[1],JSON.parse(r.data)]}catch{return [r.key.split('/')[1],null]}}))}
export async function staffPrehabApi(request,env,acl){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/workspace/prehab/'))return null;
 const route=url.pathname.slice('/api/workspace/prehab/'.length);
 if(!JOBS.includes(acl.job))return json({error:'Préhabilitation réservée aux médecins et infirmier(ère)s.'},403);
 const jour=jourParis();
 if(route==='tableau'&&request.method==='GET'){
  const [cores,consults,annonces,prehabs,contacts]=await Promise.all(['core','consult','surgicalAnnouncement','prehabilitation','invitationContact'].map(m=>lireTous(env,m)));
  const inscrits=[],aProposer=[];
  for(const [stay,core] of cores){
   if(!core||!acl.canRead('stay/'+stay+'/core'))continue;
   const date=R.datePrevueSejour({consult:consults.get(stay),surgicalAnnouncement:annonces.get(stay)}),p=prehabs.get(stay),id=core.identity||{};
   const base={stay,nom:id.lastName||'',prenom:id.firstName||'',date,specialite:core.specialty||'',contact:!!(contacts.get(stay)?.contact?.phone||contacts.get(stay)?.contact?.email)};
   if(p?.inscrit)inscrits.push({...base,inscrit:p.inscrit,arret:p.arret||null,adhesion:H.adhesion(p,date,jour),journal:p.journal||{},historique:(p.historique||[]).slice(-5)});
   else if(H.aProposer(date,jour))aProposer.push(base);
  }
  inscrits.sort((a,b)=>({decrochage:0,'en-cours':1,'a-venir':2,termine:3,arrete:4}[a.adhesion.code]??5)-({decrochage:0,'en-cours':1,'a-venir':2,termine:3,arrete:4}[b.adhesion.code]??5)||String(a.date).localeCompare(String(b.date)));
  aProposer.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  await acl.log('read','prehabilitation','allowed','Tableau de la préhabilitation','');
  return json({jour,inscrits,aProposer:aProposer.slice(0,40),items:H.ORDRE.map(i=>({id:i,libelle:H.ITEMS[i].libelle})),marcheDefaut:H.MARCHE_DEFAUT});
 }
 if(route!=='action'||request.method!=='POST')return json({error:'Service inconnu.'},404);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const stay=String(d.stay||''),action=String(d.action||''),who=acl.profile?.display_name||'Professionnel',at=new Date().toISOString();
 if(!peutLire(acl,stay))return json({error:'Accès refusé.'},403);
 const ctx=await contexte(env,stay),trace=(x,texte)=>{x.historique=[...(x.historique||[]),{at,par:who,texte}].slice(-40)};
 if(action==='inscrire'||action==='lien'){
  if(action==='lien'&&(!ctx.prehab?.inscrit||ctx.prehab.arret))return json({error:'Patient non inscrit.'},409);
  if(!H.isDate(ctx.date)||H.ecart(jour,ctx.date)<2)return json({error:'Date d’intervention inconnue ou trop proche : renseignez-la dans l’annonce ou la consultation.'},400);
  const naissance=H.isDate(ctx.contact?.birthDate)?ctx.contact.birthDate:ctx.patient.naissance;
  if(!H.isDate(naissance))return json({error:'Date de naissance du patient inconnue : le lien ne peut pas être protégé.'},400);
  let r;
  if(action==='inscrire'){
   const obj=H.objectifs({items:d.items,marcheMin:d.marcheMin,fumeur:d.fumeur===true});
   r=await mettreAJour(env,stay,acl.profile.user_id,'Inscription à la préhabilitation',x=>{if(x.inscrit&&!x.arret)return {error:'Patient déjà inscrit.',status:409};x.inscrit={at,par:who};x.arret=null;x.objectifs=obj;trace(x,'Inscrit : '+obj.items.map(i=>H.ITEMS[i].libelle+(i==='marche'?' '+obj.marcheMin+' min':'')).join(', '))});
   if(r.error)return json({error:r.error},r.status||409);
  }
  const token=await nouveauLien(env,stay,{naissance,date:ctx.date}),lien=url.origin+'/prehabilitation.html#acces='+token;
  const envoi=await envoyer(env,acl,stay,ctx,lien);
  r=await mettreAJour(env,stay,acl.profile.user_id,'Lien de préhabilitation',x=>{x.envois=[...(x.envois||[]),{at,par:who,ok:envoi.ok,...(envoi.ok?{canal:envoi.canal,detail:envoi.detail}:{raison:envoi.raison})}].slice(-20);trace(x,action==='lien'?'Nouveau lien (l’ancien est révoqué)':'Lien créé')});
  await acl.log('prehab-'+action,docKey(stay),'allowed','Préhabilitation · '+(action==='lien'?'nouveau lien':'inscription'),envoi.ok?envoi.detail:envoi.raison);
  return json({ok:true,lien,envoi,prehab:r.data});
 }
 if(action==='arreter'){
  const motif=String(d.motif||'').trim().slice(0,300);if(motif.length<3)return json({error:'Indiquez le motif de l’arrêt.'},400);
  const r=await mettreAJour(env,stay,acl.profile.user_id,'Arrêt de la préhabilitation',x=>{if(!x.inscrit||x.arret)return {error:'Aucun programme en cours.',status:409};x.arret={at,par:who,motif};trace(x,'Arrêté : '+motif)});
  if(r.error)return json({error:r.error},r.status||409);
  await env.DB.prepare('UPDATE prehab_links SET revoked_at=? WHERE stay_id=? AND revoked_at IS NULL').bind(at,stay).run();
  await acl.log('prehab-arreter',docKey(stay),'allowed','Préhabilitation arrêtée',motif);
  return json({ok:true,prehab:r.data});
 }
 return json({error:'Action inconnue.'},400);
}

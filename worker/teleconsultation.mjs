// IASELO · téléconsultation vidéo (28/11/2026, 5e veille, lot 7). Règles : dist/teleconsultation-regles.js.
// De navigateur à navigateur (WebRTC) : le serveur ne relaie que la mise en relation (signalisation, effacée à la fin) ;
// l'image et le son ne passent pas par IASELO et ne sont jamais enregistrés.
//  Professionnels (médecins et infirmier(ère)s du séjour) :
//   GET  /api/workspace/visio/liste                  rendez-vous vidéo d'hier à J+30 (séjours lisibles)
//   POST /api/workspace/visio                        {action:'planifier', stay, debut:'AAAA-MM-JJTHH:MM' (Paris), motif}
//                                                    {action:'lien'|'annuler'|'terminer', id}
//   POST /api/workspace/visio/signal                 {id, type, data}       GET /api/workspace/visio/signal?id=&apres=
//  Patient (lien personnel, sans compte, date de naissance vérifiée à chaque appel, 5 erreurs au plus) :
//   POST /api/visio/open | /api/visio/signal | /api/visio/poll   {token, naissance, …}
import V from '../dist/teleconsultation-regles.js';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function body(request){const b=await request.arrayBuffer();if(b.byteLength>30000)throw Error('size');return JSON.parse(new TextDecoder().decode(b))}
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');
const mask=v=>{v=String(v||'');if(v.includes('@')){const [a,b]=v.split('@');return a.slice(0,2)+'***@'+b}return v.length>4?v.slice(0,3)+'*'.repeat(v.length-5)+v.slice(-2):'***'};
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const validStay=s=>/^[^/]{1,80}$/.test(String(s||''));
const JOBS=['anesthesiste','chirurgien','infirmier'];
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();try{return row?JSON.parse(row.data):null}catch{return null}}
const vue=r=>{const ev=JSON.parse(r.evenements||'[]');return {id:r.id,stay:r.stay_id,debut:r.debut,motif:r.motif,motifLibelle:V.MOTIFS[r.motif]||r.motif,statut:r.statut,libelle:V.STATUTS[r.statut]||r.statut,par:r.created_by,evenements:ev}};
const log=(env,actor,action,stay,result,reason,detail='')=>env.DB.prepare('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES(?,?,?,?,?,?,?)').bind(new Date().toISOString(),actor,action,'stay/'+stay+'/teleconsultation',result,reason,detail).run();
async function evenement(env,salle,e,statut){const ev=[...JSON.parse(salle.evenements||'[]'),{...e,at:new Date().toISOString()}].slice(-40);await env.DB.prepare('UPDATE visio_salles SET evenements=?,statut=? WHERE id=?').bind(JSON.stringify(ev),statut||salle.statut,salle.id).run();return {...salle,evenements:JSON.stringify(ev),statut:statut||salle.statut}}
const purger=(env,id)=>env.DB.prepare('DELETE FROM visio_signaux WHERE salle_id=?').bind(id).run();
async function signaler(env,salle,de,type,data){
 if(!V.signalValide(type,data))return {error:'Message invalide.',status:400};
 await env.DB.prepare('INSERT INTO visio_signaux(salle_id,de,type,data,at) VALUES(?,?,?,?,?)').bind(salle.id,de,type,JSON.stringify(data??null),new Date().toISOString()).run();
 return {ok:true};
}
async function relever(env,salle,pour,apres){
 const rows=(await env.DB.prepare('SELECT seq,type,data FROM visio_signaux WHERE salle_id=? AND de<>? AND seq>? ORDER BY seq LIMIT 100').bind(salle.id,pour,Number(apres)||0).all()).results||[];
 return rows.map(r=>({seq:Number(r.seq),type:r.type,data:JSON.parse(r.data)}));
}
async function nouveauLien(env,id){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');await env.DB.prepare('UPDATE visio_salles SET token_hash=?,failed_attempts=0 WHERE id=?').bind(await sha(token),id).run();return token}
async function envoyer(env,stay,debut,lien){
 const m=env.MESSAGING,c=(await docData(env,'stay/'+stay+'/invitationContact'))?.contact;
 if(!c||(!c.phone&&!c.email))return {ok:false,raison:'Aucune coordonnée vérifiée (portable ou e-mail) : transmettez le lien au patient.'};
 const sms=!!(c.phone&&m?.channels?.sms),mail=!!(c.email&&m?.channels?.email);
 if(!sms&&!mail)return {ok:false,raison:'Envoi SMS et e-mail non configuré sur ce serveur : transmettez le lien au patient.'};
 const texte=V.sms(m.establishment,debut,lien);
 try{if(sms){await m.sms({to:c.phone,content:texte,tag:'iaselo-visio'});return {ok:true,detail:'SMS envoyé à '+mask(c.phone)}}
  await m.email({to:c.email,name:[c.firstName,c.lastName].filter(Boolean).join(' '),subject:(m.establishment||'La clinique')+' · rendez-vous vidéo',text:texte,tag:'iaselo-visio'});return {ok:true,detail:'E-mail envoyé à '+mask(c.email)}}
 catch(e){return {ok:false,raison:String(e?.message||'Envoi impossible.').slice(0,200)}}
}

/* ---------------- Patient ---------------- */
export async function patientVisioApi(request,env,etab=''){
 const url=new URL(request.url),route=url.pathname.replace('/api/visio/','');
 if(request.method!=='POST'||!['open','signal','poll'].includes(route))return json({error:'Service inconnu.'},404);
 if(request.headers.get('Origin')!==url.origin)return json({error:'Origine refusée.'},403);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 const token=String(d.token||'');if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Lien invalide.'},404);
 const salle=await env.DB.prepare('SELECT * FROM visio_salles WHERE token_hash=?').bind(await sha(token)).first();
 if(!salle)return json({error:'Lien invalide.'},404);
 if(Number(salle.failed_attempts)>=V.MAX_ECHECS)return json({error:'Ce lien est bloqué. Appelez la clinique.'},410);
 if(!isDate(d.naissance)||d.naissance!==salle.birth_date){
  await env.DB.prepare('UPDATE visio_salles SET failed_attempts=failed_attempts+1 WHERE id=?').bind(salle.id).run();
  await log(env,'patient-lien','visio-acces',salle.stay_id,'denied','Date de naissance incorrecte');
  return json({error:'Date de naissance incorrecte.',naissance:true},403);
 }
 const o=V.ouverte(salle);
 if(route==='open'){
  await log(env,'patient-lien','visio-ouverture',salle.stay_id,'allowed','Téléconsultation : salle ouverte par le patient');
  return json({etablissement:etab||'la clinique',debut:salle.debut,statut:salle.statut,ouverte:o.ok,raison:o.raison||'',tot:!!o.tot,iceServers:V.iceServers(env.INTEROP_ENV?.VISIO_ICE_SERVERS)});
 }
 if(!o.ok)return json({error:o.raison,ferme:!o.tot},409);
 if(route==='signal'){const r=await signaler(env,salle,'patient',d.type,d.data);if(r.error)return json({error:r.error},r.status);if(d.type==='pret'&&!JSON.parse(salle.evenements||'[]').some(e=>e.type==='patient'))await evenement(env,salle,{type:'patient',texte:'Le patient a rejoint la salle'});return json({ok:true})}
 return json({messages:await relever(env,salle,'patient',d.apres),statut:salle.statut});
}

/* ---------------- Professionnels ---------------- */
export async function staffVisioApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/visio'&&!url.pathname.startsWith('/api/workspace/visio/'))return null;
 const route=url.pathname.slice('/api/workspace/visio'.length);
 if(!JOBS.includes(acl.job))return json({error:'Téléconsultation réservée aux médecins et infirmier(ère)s.'},403);
 const qui=acl.profile?.display_name||'Professionnel',lisible=stay=>validStay(stay)&&acl.canRead('stay/'+stay+'/core');
 const salleDe=async id=>{const s=typeof id==='string'&&/^V-[a-f0-9]{16}$/.test(id)?await env.DB.prepare('SELECT * FROM visio_salles WHERE id=?').bind(id).first():null;return s&&lisible(s.stay_id)?s:null};
 if(route==='/liste'&&request.method==='GET'){
  const depuis=new Date(Date.now()-864e5).toISOString(),jusqu=new Date(Date.now()+31*864e5).toISOString();
  const rows=((await env.DB.prepare('SELECT * FROM visio_salles WHERE debut>=? AND debut<=? ORDER BY debut').bind(depuis,jusqu).all()).results||[]).filter(r=>lisible(r.stay_id));
  const salles=[];for(const r of rows){const i=(await docData(env,'stay/'+r.stay_id+'/core'))?.identity||{};salles.push({...vue(r),patient:[String(i.lastName||'').toUpperCase(),i.firstName||''].filter(Boolean).join(' '),ouverte:V.ouverte(r).ok})}
  const sejours=((await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/core'").all()).results||[]).map(r=>{try{return [r.key.split('/')[1],JSON.parse(r.data)]}catch{return null}}).filter(x=>x&&lisible(x[0])&&x[1]).map(([stay,c])=>({stay,patient:[String(c.identity?.lastName||'').toUpperCase(),c.identity?.firstName||''].filter(Boolean).join(' '),etape:c.stage||''})).sort((a,b)=>a.patient.localeCompare(b.patient)).slice(0,300);
  return json({salles,sejours,motifs:V.MOTIFS,iceServers:V.iceServers(env.INTEROP_ENV?.VISIO_ICE_SERVERS),relaisConfigure:V.iceServers(env.INTEROP_ENV?.VISIO_ICE_SERVERS).length>0});
 }
 if(route==='/signal'){
  if(request.method==='GET'){const s=await salleDe(url.searchParams.get('id'));if(!s)return json({error:'Rendez-vous introuvable.'},404);return json({messages:await relever(env,s,'pro',url.searchParams.get('apres')),statut:s.statut})}
  if(request.method!=='POST')return json({error:'Méthode non prise en charge.'},405);
  let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
  let s=await salleDe(d.id);if(!s)return json({error:'Rendez-vous introuvable.'},404);
  const o=V.ouverte(s);if(!o.ok)return json({error:o.raison},409);
  const r=await signaler(env,s,'pro',d.type,d.data);if(r.error)return json({error:r.error},r.status);
  if(d.type==='pret'&&s.statut==='planifiee'){s=await evenement(env,s,{type:'debut',par:qui,texte:'Appel commencé par '+qui},'en-cours');await acl.log('visio-debut','stay/'+s.stay_id+'/teleconsultation','allowed','Téléconsultation commencée',s.id)}
  return json({ok:true});
 }
 if(route!==''||request.method!=='POST')return json({error:'Service inconnu.'},404);
 let d;try{d=await body(request)}catch{return json({error:'Demande invalide.'},400)}
 if(d.action==='planifier'){
  if(!lisible(d.stay))return json({error:'Séjour hors habilitation.'},403);
  const v=V.verifierPlanif({debut:d.debut,motif:d.motif});if(!v.ok)return json({error:v.erreurs.join(' ')},400);
  const core=await docData(env,'stay/'+d.stay+'/core'),contact=(await docData(env,'stay/'+d.stay+'/invitationContact'))?.contact;
  const naissance=isDate(contact?.birthDate)?contact.birthDate:core?.identity?.birthDate;
  if(!isDate(naissance))return json({error:'Date de naissance du patient inconnue : le lien ne peut pas être protégé.'},400);
  const id='V-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join(''),at=new Date().toISOString();
  await env.DB.prepare('INSERT INTO visio_salles(id,stay_id,token_hash,birth_date,debut,motif,statut,created_at,created_by,failed_attempts,evenements) VALUES(?,?,?,?,?,?,?,?,?,0,?)').bind(id,d.stay,'attente-'+id,naissance,v.debutIso,d.motif,'planifiee',at,qui,JSON.stringify([{type:'planif',at,par:qui,texte:'Planifiée par '+qui}])).run();
  const token=await nouveauLien(env,id),lien=url.origin+'/visio.html#acces='+token,envoi=await envoyer(env,d.stay,v.debutIso,lien);
  await acl.log('visio-planifier','stay/'+d.stay+'/teleconsultation','allowed','Téléconsultation planifiée · '+V.MOTIFS[d.motif],envoi.ok?envoi.detail:envoi.raison);
  return json({ok:true,salle:vue(await env.DB.prepare('SELECT * FROM visio_salles WHERE id=?').bind(id).first()),lien,envoi});
 }
 let s=await salleDe(d.id);if(!s)return json({error:'Rendez-vous introuvable.'},404);
 if(d.action==='lien'){
  if(['annulee','terminee'].includes(s.statut))return json({error:'Rendez-vous '+V.STATUTS[s.statut].toLowerCase()+'.'},409);
  const token=await nouveauLien(env,s.id),lien=url.origin+'/visio.html#acces='+token,envoi=await envoyer(env,s.stay_id,s.debut,lien);
  s=await evenement(env,s,{type:'lien',par:qui,texte:'Nouveau lien (l’ancien ne fonctionne plus)'});
  await acl.log('visio-lien','stay/'+s.stay_id+'/teleconsultation','allowed','Nouveau lien de téléconsultation',envoi.ok?envoi.detail:envoi.raison);
  return json({ok:true,salle:vue(s),lien,envoi});
 }
 if(d.action==='annuler'||d.action==='terminer'){
  if(['annulee','terminee'].includes(s.statut))return json({error:'Rendez-vous déjà '+V.STATUTS[s.statut].toLowerCase()+'.'},409);
  if(d.action==='annuler'&&s.statut==='en-cours')return json({error:'Appel en cours : terminez-le.'},409);
  s=await evenement(env,s,{type:d.action,par:qui,texte:(d.action==='annuler'?'Annulée':'Terminée')+' par '+qui},d.action==='annuler'?'annulee':'terminee');
  await purger(env,s.id);
  await acl.log('visio-'+d.action,'stay/'+s.stay_id+'/teleconsultation','allowed','Téléconsultation '+(d.action==='annuler'?'annulée':'terminée'),s.id);
  return json({ok:true,salle:vue(s)});
 }
 return json({error:'Action inconnue.'},400);
}

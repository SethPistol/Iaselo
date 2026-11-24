/* Règles communes au planning fictif et aux contrôles serveur. */
(function(root){
'use strict';
const active=r=>!['Annulée','Terminée'].includes(r.state);
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
const validTime=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s)&&Number.isFinite(Date.parse(s));
const interval=x=>x&&validTime(x.start)&&validTime(x.end)&&x.start<x.end;
const minutes=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/60000);
function addMinutes(s,n){const d=new Date(s+'Z');d.setUTCMinutes(d.getUTCMinutes()+Number(n));return d.toISOString().slice(0,16)}
const kind=(r={})=>r.kind||(r.sector?.startsWith('bloc')?'room':r.sector?.startsWith('sspi')?'recovery':'bed');
function allocations(r){
 const out=[{resource:r.resource,start:r.start,end:r.end,phase:'primary'}];
 for(const phase of ['recovery','bed'])if(r[phase]?.resource)out.push({...r[phase],phase});
 for(const resource of [...(r.staffIds||[]),...(r.equipmentIds||[])])out.push({resource,start:r.start,end:r.end,phase:'support'});
 return out;
}
const currentResource=r=>r.phase==='recovery'?r.recovery?.resource:r.phase==='bed'?r.bed?.resource:r.resource;
function busyAt(r,resource,at){if(!active(r))return false;if(r.state==='Occupée'&&currentResource(r)===resource)return true;return allocations(r).some(a=>a.resource===resource&&a.start<=at&&at<a.end)}
function resourceError(list){
 if(!Array.isArray(list)||new Set(list.map(r=>r.id)).size!==list.length)return 'Identifiants de ressources en double.';
 for(const r of list)if(!r.id||!r.label?.trim()||!['room','recovery','bed','staff','equipment'].includes(kind(r)))return 'Ressource incomplète.';
 return '';
}
function vacationError(v,rows,resources){
 if(!v.id||!interval(v)||v.start.slice(0,10)!==v.end.slice(0,10)||!v.label?.trim())return 'Renseignez une vacation datée avec une fin postérieure au début, le même jour.';
 const room=resources.find(r=>r.id===v.resource);if(!room||kind(room)!=='room'||room.open===false)return 'Salle indisponible pour cette vacation.';
 const staff=v.staffIds||[];if(!staff.length||staff.some(id=>!resources.some(r=>r.id===id&&kind(r)==='staff'&&r.open!==false)))return 'Affectez au moins un personnel disponible à la vacation.';
 if(rows.some(x=>x.id!==v.id&&x.state!=='Annulée'&&overlap(x,v)&&(x.resource===v.resource||(x.staffIds||[]).some(id=>staff.includes(id)))))return 'Chevauchement de vacation : salle ou personnel déjà affecté.';
 return '';
}
function bookingError(item,rows,resources,vacations){
 if(!item.id||!item.patient||!interval(item))return 'Séjour, ressource et horaires valides requis.';
 if(!active(item))return '';
 const res=resources.find(r=>r.id===item.resource);if(!res||!['room','bed','recovery'].includes(kind(res))||res.open===false)return 'La ressource principale est fermée ou inconnue.';
 if(!Array.isArray(item.staffIds||[])||!Array.isArray(item.equipmentIds||[]))return 'Affectations invalides.';
 if(kind(res)==='room'){
  const v=vacations.find(v=>v.id===item.vacationId&&v.state!=='Annulée');
  if(!v||v.resource!==item.resource||item.start<v.start||item.end>v.end)return 'Le créneau, remise en état comprise, doit tenir dans une vacation ouverte de cette salle.';
  if(!Number.isInteger(item.duration)||item.duration<=0||!Number.isInteger(item.turnover)||item.turnover<0||minutes(item.start,item.end)!==item.duration+item.turnover)return 'Vérifiez la durée d’intervention et le temps de remise en état.';
  if(!item.staffIds?.length||item.staffIds.some(id=>!(v.staffIds||[]).includes(id)))return 'Sélectionnez les personnels affectés à cette vacation.';
 }
 for(const a of allocations(item)){
  const r=resources.find(r=>r.id===a.resource);if(!r||r.open===false||!interval(a))return 'Une ressource du parcours est fermée ou ses horaires sont incomplets.';
  if(a.phase==='recovery'&&(kind(r)!=='recovery'||a.start!==addMinutes(item.start,item.duration)))return 'La SSPI doit commencer à la fin prévue de l’intervention.';
  if(a.phase==='bed'&&(kind(r)!=='bed'||a.start!==(item.recovery?.end||addMinutes(item.start,item.duration))))return 'Le lit doit être réservé à partir de la sortie prévue de SSPI ou de salle.';
  if(a.phase==='support'&&!['staff','equipment'].includes(kind(r)))return 'Personnel ou matériel invalide.';
  for(const other of rows.filter(x=>x.id!==item.id&&active(x))){
   if(allocations(other).some(b=>b.resource===a.resource&&overlap(a,b)))return 'Conflit : une salle, un poste de SSPI, un lit, un personnel ou un matériel est déjà réservé sur ce créneau.';
  }
 }
 const patientEnd=item.recovery?.end||addMinutes(item.start,item.duration||minutes(item.start,item.end));
 if(rows.some(x=>x.id!==item.id&&active(x)&&x.patient===item.patient&&overlap({start:item.start,end:patientEnd},{start:x.start,end:x.recovery?.end||x.end})))return 'Ce séjour possède déjà un parcours sur ces horaires.';
 return '';
}
function transitionError(item,phase,rows,resources){
 const id=phase==='primary'?item.resource:item[phase]?.resource;
 const target=resources.find(r=>r.id===id);if(!target||target.open===false)return 'Aucune ressource ouverte prévue pour cette étape.';
 if(rows.some(r=>r.id!==item.id&&r.state==='Occupée'&&currentResource(r)===id))return 'Transfert bloqué : la ressource est encore occupée. Vérifiez sa libération réelle.';
 return '';
}
// Annonces chirurgicales → programme du bloc : chaque patient annoncé est placé (proposition, à confirmer) dans la
// vacation (potentiel opératoire) du chirurgien le jour de l'intervention. Rien n'est écrit dans le programme :
// une proposition ne déclenche ni convocation SMS ni réservation de ressource tant que la régulation ne l'a pas confirmée.
const normName=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(dr|docteur|pr|professeur)\b\.?/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const sameSurgeon=(a,b)=>{const x=normName(a),y=normName(b);if(!x||!y)return false;if(x===y)return true;const xs=x.split(' '),ys=y.split(' ');return xs.length===1&&ys.includes(xs[0])||ys.length===1&&xs.includes(ys[0])};
const ANNONCE_DUREE=60,ANNONCE_REMISE=15;
function announcementOf(stay){
 const p=stay?.surgicalAnnouncement?.published;if(!p||!p.fields)return null;
 const f=p.fields;return {stay:stay.id,state:p.state,revision:p.revision||1,sentAt:typeof p.sentAt==='string'?p.sentAt:'',procedure:f.procedure||'',surgeon:f.surgeon||'',date:/^\d{4}-\d\d-\d\d$/.test(f.date||'')?f.date:'',time:/^\d\d:\d\d$/.test(f.time||'')?f.time:'',duration:Number(f.duration)>0?Math.round(Number(f.duration)):0,urgency:f.urgency||'',laterality:f.laterality||'',mode:f.mode||''};
}
function programmed(stayId,reservations){return reservations.some(r=>r.patient===stayId&&active(r)&&(r.vacationId||r.source==='annonce'))}
function placeAnnouncements(day,announcements,vacations,reservations){
 const placed=[],unplaced=[],load=new Map();
 const list=announcements.filter(a=>a&&a.state==='Transmise'&&a.date===day&&!programmed(a.stay,reservations));
 // Ordre d'arrivée des annonces (urgences d'abord) ; l'heure souhaitée est respectée quand le créneau est libre.
 list.sort((a,b)=>(a.urgency==='Urgente'?0:1)-(b.urgency==='Urgente'?0:1)||(a.sentAt||'~').localeCompare(b.sentAt||'~')||String(a.stay).localeCompare(String(b.stay)));
 const busy=v=>[...reservations.filter(r=>active(r)&&r.resource===v.resource&&overlap(r,v)).map(r=>({start:r.start,end:r.end})),...placed.filter(p=>p.resource===v.resource).map(p=>({start:p.start,end:p.end}))].sort((a,b)=>a.start.localeCompare(b.start));
 for(const a of list){
  const vs=vacations.filter(v=>v.state!=='Annulée'&&v.start.slice(0,10)===day&&sameSurgeon(v.surgeon,a.surgeon)).sort((x,y)=>x.start.localeCompare(y.start));
  if(!a.surgeon){unplaced.push({...a,reason:'Chirurgien non renseigné dans l’annonce.'});continue}
  if(!vs.length){unplaced.push({...a,reason:'Aucune vacation de '+a.surgeon+' ce jour : à programmer manuellement.'});continue}
  const duration=a.duration||ANNONCE_DUREE,need=duration+ANNONCE_REMISE,wish=a.time?day+'T'+a.time:'';
  const fit=(v,from)=>{let c=from<v.start?v.start:from;for(const b of busy(v)){if(b.end<=c)continue;if(addMinutes(c,need)<=b.start)break;c=b.end>c?b.end:c}return addMinutes(c,need)<=v.end?c:null};
  let spot=null;
  if(wish)for(const v of vs){if(wish<v.end){const c=fit(v,wish);if(c){spot={v,start:c};break}}}
  if(!spot)for(const v of vs){const c=fit(v,v.start);if(c){spot={v,start:c};break}}
  let overflow=0;
  if(!spot){const v=vs.at(-1),last=busy(v).reduce((m,b)=>b.end>m?b.end:m,v.start);spot={v,start:last};overflow=minutes(v.end,addMinutes(last,need))}
  const p={...a,id:'ANN-'+a.stay,vacationId:spot.v.id,resource:spot.v.resource,start:spot.start,end:addMinutes(spot.start,need),duration,turnover:ANNONCE_REMISE,defaultDuration:!a.duration,overflow,staffIds:spot.v.staffIds||[]};
  placed.push(p);
 }
 for(const v of vacations.filter(v=>v.state!=='Annulée'&&v.start.slice(0,10)===day)){
  const cap=minutes(v.start,v.end),used=reservations.filter(r=>active(r)&&r.vacationId===v.id).reduce((n,r)=>n+minutes(r.start,r.end),0),announced=placed.filter(p=>p.vacationId===v.id).reduce((n,p)=>n+minutes(p.start,p.end),0);
  load.set(v.id,{capacity:cap,used,announced,free:cap-used-announced});
 }
 return {placed,unplaced,load};
}
// Réservation à écrire quand la régulation confirme une proposition.
function bookingFromAnnouncement(p){return {id:'RES-'+(globalThis.crypto?.randomUUID?.()||Date.now()),planningVersion:1,patient:p.stay,resource:p.resource,vacationId:p.vacationId,procedure:p.procedure+(p.laterality&&p.laterality!=='Non applicable'?' · '+p.laterality:''),start:p.start,end:p.end,duration:p.duration,turnover:p.turnover,staffIds:[...(p.staffIds||[])],equipmentIds:[],note:'Annonce chirurgicale v'+p.revision+' · '+p.surgeon,state:'Réservée',source:'annonce',annonceRevision:p.revision}}
// Programme confirmé puis annonce annulée ou modifiée par le chirurgien : à revoir.
function announcementDrift(r,announcement){
 if(!r||r.source!=='annonce'||!active(r))return '';
 if(!announcement)return '';
 if(announcement.state!=='Transmise')return 'Annonce annulée par le chirurgien : déprogrammez ou faites confirmer.';
 if(announcement.revision!==r.annonceRevision){if(announcement.date&&announcement.date!==r.start.slice(0,10))return 'Annonce modifiée (v'+announcement.revision+') : nouvelle date souhaitée le '+announcement.date.split('-').reverse().join('/')+'.';return 'Annonce modifiée par le chirurgien (v'+announcement.revision+') : vérifiez le programme.'}
 return '';
}
root.PlanningCore={normName,sameSurgeon,announcementOf,placeAnnouncements,bookingFromAnnouncement,announcementDrift,active,overlap,validTime,interval,minutes,addMinutes,kind,allocations,currentResource,busyAt,resourceError,vacationError,bookingError,transitionError};
if(typeof module!=='undefined')module.exports=root.PlanningCore;
})(typeof window!=='undefined'?window:globalThis);

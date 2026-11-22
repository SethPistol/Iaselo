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
root.PlanningCore={active,overlap,validTime,interval,minutes,addMinutes,kind,allocations,currentResource,busyAt,resourceError,vacationError,bookingError,transitionError};
if(typeof module!=='undefined')module.exports=root.PlanningCore;
})(typeof window!=='undefined'?window:globalThis);

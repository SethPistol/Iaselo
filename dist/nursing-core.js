/* Journal infirmier : événements immuables, tâches et alertes attribuées. */
(function(root){
'use strict';
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const time=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(s)&&Number.isFinite(Date.parse(s));
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=4000;
const terminal=s=>['Réalisée','Non réalisée'].includes(s);
function addMinutes(s,n){const d=new Date(s+'Z');d.setUTCMinutes(d.getUTCMinutes()+Number(n));return d.toISOString().slice(0,16)}
function empty(){return {plans:new Map(),tasks:new Map(),devices:new Map(),alerts:new Map(),transmissions:[]}}
function apply(state,e){
 const stamp={lastEventId:e.id,lastAuthor:e.authorLabel,lastAt:e.occurredAt};
 if(e.kind==='plan')state.plans.set(e.id,{...e,status:'Actif',...stamp});
 if(e.kind==='plan-update')Object.assign(state.plans.get(e.planId)||{},{status:e.status,note:e.note,ownerId:e.ownerId,ownerLabel:e.ownerLabel,...stamp});
 if(e.kind==='task')state.tasks.set(e.id,{...e,status:'À faire',...stamp});
 if(e.kind==='task-update')Object.assign(state.tasks.get(e.taskId)||{},{status:e.status,ownerId:e.ownerId,ownerLabel:e.ownerLabel,due:e.status==='Reportée'?e.rescheduledAt:state.tasks.get(e.taskId)?.due,note:e.note,...stamp});
 if(e.kind==='device')state.devices.set(e.id,{...e,status:'En place',...stamp});
 if(e.kind==='device-check')Object.assign(state.devices.get(e.deviceId)||{},{status:e.status==='Retiré'?'Retiré':'En place',lastCheck:e.occurredAt,findings:e.findings,assessment:e.status,nextDue:e.status==='Retiré'?'':e.nextDue,ownerId:e.ownerId,ownerLabel:e.ownerLabel,...stamp});
 if(e.kind==='transmission')state.transmissions.push({...e,...stamp});
 if(e.kind==='alert')state.alerts.set(e.id,{...e,status:'Ouverte',...stamp});
 if(e.kind==='alert-update')Object.assign(state.alerts.get(e.alertId)||{},{status:e.status==='Réattribuée'?'Ouverte':e.status,ownerId:e.ownerId,ownerLabel:e.ownerLabel,note:e.note,...stamp});
 return state;
}
function project(journal=[]){return journal.reduce(apply,empty())}
function validateJournal(old,next,people,actor){
 if(!Array.isArray(old)||!Array.isArray(next)||next.length<old.length||next.length>3000||old.some((e,i)=>stable(e)!==stable(next[i])))return 'Le journal infirmier est immuable : ajoutez une nouvelle trace pour corriger.';
 if(next.some(e=>!e||typeof e!=='object'||Array.isArray(e)))return 'Trace infirmière invalide.';
 if(new Set(next.map(e=>e.id)).size!==next.length)return 'Identifiant de trace déjà utilisé.';
 const state=project(old),checks=[];
 for(const e of next.slice(old.length)){
  if(!e||!text(e.id)||!time(e.occurredAt)||!Number.isFinite(Date.parse(e.recordedAt))||e.authorId!==actor.user_id||e.authorLabel!==actor.display_name)return 'Auteur connecté, date de réalisation et heure de saisie requis.';
  if(!people.some(p=>p.user_id===e.ownerId&&p.display_name===e.ownerLabel))return 'Choisissez un responsable actif et habilité pour ce séjour.';
  if(e.kind==='plan'){
   if(!text(e.title)||!text(e.objective))return 'Intitulé et objectif du plan de soins requis.';
  }else if(e.kind==='plan-update'){
   if(!state.plans.has(e.planId)||!['Actif','Clos'].includes(e.status)||!text(e.note))return 'Plan, statut et motif requis.';
  }else if(e.kind==='task'){
   if(!text(e.title)||!time(e.due)||(e.planId&&(!state.plans.has(e.planId)||state.plans.get(e.planId).status!=='Actif')))return 'Tâche, échéance et plan actif requis.';
  }else if(e.kind==='task-update'){
   if(!state.tasks.has(e.taskId)||!['À faire','En cours','Réalisée','Non réalisée','Reportée'].includes(e.status))return 'Tâche ou statut invalide.';
   if((e.status!=='Réalisée'||terminal(state.tasks.get(e.taskId).status))&&!text(e.note))return 'Documentez le motif, la correction ou la non-réalisation.';
   if(e.status==='Reportée'&&(!time(e.rescheduledAt)||e.rescheduledAt<=e.occurredAt))return 'Indiquez une nouvelle échéance postérieure au constat.';
  }else if(e.kind==='transmission'){
   if(!text(e.target)||!text(e.observations)||!['SSPI','Hospitalisation','Relève','Autre'].includes(e.context))return 'Contexte, cible et observations de la transmission requis.';
  }else if(e.kind==='device'){
   if(!text(e.deviceType)||!text(e.site)||(!time(e.placedAt)&&e.placementUnknown!==true)||!time(e.nextDue)||e.nextDue<=e.occurredAt||(e.placedAt&&e.placedAt>e.occurredAt)||(e.placementUnknown===true&&e.placedAt))return 'Dispositif, site, date de pose et prochain contrôle cohérents requis.';
  }else if(e.kind==='device-check'){
   if(!state.devices.has(e.deviceId)||state.devices.get(e.deviceId).status==='Retiré'||!['Contrôle sans anomalie signalée','Anomalie constatée','Retiré'].includes(e.status)||!text(e.findings))return 'Dispositif en place, constat et observation requis.';
   if(e.status!=='Retiré'&&(!time(e.nextDue)||e.nextDue<=e.occurredAt))return 'Renseignez le prochain contrôle après ce constat.';
   if(e.status==='Anomalie constatée')checks.push(e.id);
  }else if(e.kind==='alert'){
   if(!text(e.title)||!text(e.note)||!['Information','À traiter','Urgente'].includes(e.level)||(e.resolveBy&&!time(e.resolveBy)))return 'Alerte : intitulé, détail et priorité requis.';
   if(e.sourceId&&!next.some(x=>x.id===e.sourceId&&x.kind==='device-check'&&x.status==='Anomalie constatée'))return 'Le contrôle du dispositif lié à l’alerte est introuvable.';
  }else if(e.kind==='alert-update'){
   if(!state.alerts.has(e.alertId)||!['Ouverte','Prise en charge','Résolue','Réattribuée'].includes(e.status)||!text(e.note))return 'Alerte, statut et action ou motif requis.';
   if(e.status==='Prise en charge'&&e.ownerId!==e.authorId)return 'La prise en charge doit être confirmée par le responsable connecté.';
   if(state.alerts.get(e.alertId).status==='Résolue'&&e.status!=='Ouverte')return 'Rouvrez explicitement l’alerte avant une nouvelle action.';
  }else return 'Type de trace infirmière inconnu.';
  apply(state,e);
 }
 if(checks.some(id=>!next.some(e=>e.kind==='alert'&&e.sourceId===id)))return 'Toute anomalie de dispositif doit être accompagnée d’une alerte attribuée.';
 return '';
}
function attention(state,now){
 const manual=[...state.alerts.values()].filter(a=>a.status!=='Résolue').map(a=>({...a,attentionType:'alert',due:a.resolveBy}));
 const tasks=[...state.tasks.values()].filter(t=>!terminal(t.status)&&t.due<now).map(t=>({...t,attentionType:'task',level:'À traiter',title:'Tâche en retard : '+t.title}));
 const devices=[...state.devices.values()].filter(d=>d.status!=='Retiré'&&d.nextDue<now).map(d=>({...d,attentionType:'device',level:'À traiter',due:d.nextDue,title:'Contrôle échu : '+d.deviceType+' · '+d.site}));
 return [...manual,...tasks,...devices];
}
root.NursingCore={stable,time,terminal,addMinutes,project,validateJournal,attention};if(typeof module!=='undefined')module.exports=root.NursingCore;
})(typeof window!=='undefined'?window:globalThis);

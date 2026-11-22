const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../dist/nursing-core.js');
const actor={user_id:'N',display_name:'IDE N'},people=[actor,{user_id:'M',display_name:'Médecin M'}];
let seq=0;const entry=(kind,fields={})=>({id:'E'+(++seq),kind,occurredAt:'2026-11-19T10:00',recordedAt:'2026-11-19T09:00:00Z',authorId:'N',authorLabel:'IDE N',ownerId:'N',ownerLabel:'IDE N',...fields});
const valid=(old,next)=>C.validateJournal(old,next,people,actor);
test('plan et tâches horaires conservent leur responsable et leurs horaires',()=>{
 const plan=entry('plan',{title:'Soin fictif',objective:'Objectif fictif'}),tasks=Array.from({length:3},(_,i)=>entry('task',{planId:plan.id,title:'Soin fictif',due:C.addMinutes('2026-11-19T10:00',i*60)}));
 assert.equal(valid([],[plan,...tasks]),'');const s=C.project([plan,...tasks]);assert.equal(s.tasks.size,3);assert.equal([...s.tasks.values()][2].due,'2026-11-19T12:00');assert.ok([...s.tasks.values()].every(t=>t.ownerId==='N'));
});
test('un report exige un motif et une échéance, puis conserve la tâche initiale dans le journal',()=>{
 const task=entry('task',{title:'Tâche fictive',due:'2026-11-19T09:00'}),bad=entry('task-update',{taskId:task.id,status:'Reportée',note:'',rescheduledAt:''});
 assert.match(valid([task],[task,bad]),/motif/);
 const update={...bad,note:'Indisponibilité documentée',rescheduledAt:'2026-11-19T12:00'};assert.equal(valid([task],[task,update]),'');
 assert.equal(C.attention(C.project([task]),'2026-11-19T10:30').length,1);assert.equal(C.attention(C.project([task,update]),'2026-11-19T10:30').length,0);assert.equal(task.due,'2026-11-19T09:00');
});
test('auteur connecté, responsable habilité et immutabilité sont vérifiés',()=>{
 const task=entry('task',{title:'Tâche',due:'2026-11-19T11:00'});
 assert.match(valid([],[{...task,authorId:'M'}]),/Auteur/);assert.match(valid([],[{...task,ownerId:'inconnu'}]),/responsable/);
 assert.match(valid([task],[{...task,title:'Texte modifié'}]),/immuable/);assert.match(valid([],[task,task]),/déjà utilisé/);assert.match(valid([],[null]),/invalide/);
});
test('un contrôle anormal exige une alerte attribuée et un contrôle normal ne résout pas cette alerte',()=>{
 const device=entry('device',{deviceType:'Dispositif fictif',site:'Site fictif',placedAt:'2026-11-19T08:00',nextDue:'2026-11-19T11:00'});
 const check=entry('device-check',{deviceId:device.id,status:'Anomalie constatée',findings:'Observation fictive',nextDue:'2026-11-19T12:00'});
 assert.match(valid([device],[device,check]),/alerte attribuée/);
 const alert=entry('alert',{sourceId:check.id,title:'Anomalie fictive',note:'Action attendue',level:'À traiter'});assert.equal(valid([device],[device,check,alert]),'');
 const normal=entry('device-check',{deviceId:device.id,status:'Contrôle sans anomalie signalée',findings:'Nouveau constat',nextDue:'2026-11-19T13:00'});
 assert.equal(valid([device,check,alert],[device,check,alert,normal]),'');assert.equal(C.project([device,check,alert,normal]).alerts.get(alert.id).status,'Ouverte');
});
test('le retrait supprime l’échéance de surveillance et la date de pose inconnue est explicite',()=>{
 const device=entry('device',{deviceType:'Dispositif fictif',site:'Site',placedAt:'',placementUnknown:true,nextDue:'2026-11-19T11:00'});assert.equal(valid([],[device]),'');
 assert.equal(C.attention(C.project([device]),'2026-11-19T12:00').length,1);
 const removed=entry('device-check',{deviceId:device.id,status:'Retiré',findings:'Retrait tracé',nextDue:''});assert.equal(valid([device],[device,removed]),'');assert.equal(C.attention(C.project([device,removed]),'2026-11-19T12:00').length,0);
});
test('une prise en charge est personnelle et une alerte résolue doit être rouverte explicitement',()=>{
 const alert=entry('alert',{title:'Alerte',note:'Constat',level:'Urgente'}),claim=entry('alert-update',{alertId:alert.id,status:'Prise en charge',note:'Je prends en charge',ownerId:'M',ownerLabel:'Médecin M'});
 assert.match(valid([alert],[alert,claim]),/responsable connecté/);
 const resolved=entry('alert-update',{alertId:alert.id,status:'Résolue',note:'Résultat documenté'});assert.equal(valid([alert],[alert,resolved]),'');assert.equal(C.attention(C.project([alert,resolved]),'2026-11-19T12:00').length,0);
 assert.match(valid([alert,resolved],[alert,resolved,{...claim,ownerId:'N',ownerLabel:'IDE N'}]),/Rouvrez/);
 assert.equal(valid([alert,resolved],[alert,resolved,entry('alert-update',{alertId:alert.id,status:'Ouverte',note:'Nouvel élément'})]),'');
});
test('les transmissions ciblées restent attribuées et leur cible est obligatoire',()=>{
 const note=entry('transmission',{target:'Cible fictive',context:'SSPI',observations:'Observation',actions:'Action',results:'Résultat'});assert.equal(valid([],[note]),'');assert.equal(C.project([note]).transmissions[0].authorId,'N');assert.match(valid([],[{...note,target:''}]),/transmission requis/);
});

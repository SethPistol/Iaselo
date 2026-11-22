(function(root){
'use strict';
root.createBlocPlanner=function(ctx){
 const {$,esc,patients,sectors,resources,reservations,vacations,toast}=ctx,C=root.PlanningCore;
 let pane='planning',editing=null,focus=null;
 const types={room:'Salle de bloc',recovery:'Poste de SSPI',bed:'Lit / place',staff:'Personnel',equipment:'Matériel'};
 const opts=(rows,value)=>rows.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
 const select=(name,label,rows,value)=>`<label>${label}<select name="${name}">${opts(rows,value)}</select></label>`;
 const input=(name,label,type='text',value='',attrs='required')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
 const multi=(name,label,rows,selected=[])=>`<fieldset class="planning-choice"><legend>${label}</legend>${rows.length?rows.map(r=>`<label><input type="checkbox" name="${name}" value="${esc(r.id)}" ${selected.includes(r.id)?'checked':''}> ${esc(r.label)}</label>`).join(''):'<p>À renseigner dans Ressources.</p>'}</fieldset>`;
 const table=(heads,rows)=>rows.length?`<div class="management-scroll"><table class="management-table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="empty">Aucun enregistrement pour cette sélection.</p>';
 const name=id=>resources.find(r=>r.id===id)?.label||id||'Non prévu';
 const short=s=>s?.slice(11,16)||'';
 const openResources=type=>resources.filter(r=>C.kind(r)===type&&r.open!==false);
 const otherBookings=()=> (ctx.access?.()?.planningOccupancy||[]).map((a,i)=>({id:'OTHER-'+i,patient:'',resource:a.resource,start:a.start,end:a.end,state:a.current?'Occupée':'Réservée'}));
 const allBookings=()=>[...reservations,...otherBookings()];
 const write=()=>ctx.canWrite();
 const configWrite=()=>ctx.access?.()?.profile.isAdmin===true;
 const form=(id,body,label,can=write())=>can?`<form id="${id}" class="management-form"><div class="formgrid">${body}</div><p role="alert" class="management-error"></p><button class="primary">${label}</button></form>`:'<p class="notice">Consultation en lecture seule pour ce compte.</p>';
 function attach(id,fn){const f=$('#'+id);if(f)f.onsubmit=e=>{e.preventDefault();const data=new FormData(f),v=Object.fromEntries(data);v.staffIds=data.getAll('staffIds');v.equipmentIds=data.getAll('equipmentIds');const err=fn(v);if(err){f.querySelector('[role=alert]').textContent=err;return}render();toast('Modification préparée · vérifiez la confirmation serveur')};}
 function changed(r,message){ctx.trace(r?.patient,message);}
 function itinerary(r){return [name(r.resource)+' '+short(r.start)+'–'+short(r.end),r.recovery&&name(r.recovery.resource)+' '+short(r.recovery.start)+'–'+short(r.recovery.end),r.bed&&name(r.bed.resource)+' jusqu’au '+r.bed.end.replace('T',' ')].filter(Boolean).map(esc).join('<br>')}
 function controls(r){if(!write())return '';const button=(action,label)=>`<button class="secondary" data-plan-action="${action}" data-booking="${esc(r.id)}">${label}</button>`;if(r.state==='Réservée')return button('edit','Modifier')+button('admit','Admettre')+button('cancel','Annuler');if(r.state==='Occupée')return ((r.phase||'primary')==='primary'&&r.recovery?button('recovery','Transférer en SSPI'):((r.phase||'primary')!=='bed'&&r.bed?button('bed','Transférer au lit'):''))+button('finish','Terminer / libérer');return '';}
 function bindActions(){document.querySelectorAll('[data-plan-action]').forEach(b=>b.onclick=()=>{
  if(!write())return;const r=reservations.find(r=>r.id===b.dataset.booking);if(!r)return;
  const action=b.dataset.planAction;
  if(action==='edit'){editing=r.id;pane='booking';render();return}
  if(action==='cancel'&&r.state==='Réservée')r.state='Annulée';
  else if(action==='finish'&&r.state==='Occupée'){r.state='Terminée';r.actualEnd=ctx.now();}
  else if(['admit','recovery','bed'].includes(action)){
   if(action==='admit'&&r.state!=='Réservée'||action!=='admit'&&r.state!=='Occupée')return;
   const phase=action==='admit'?'primary':action;const err=C.transitionError(r,phase,allBookings(),resources);if(err){toast(err);return}
   r.state='Occupée';r.phase=phase;r.actualStart??=ctx.now();
  }else return;
  (r.transitions??=[]).push({action,at:ctx.now(),account:ctx.access?.()?.profile.user_id||''});
  const stay=patients.find(p=>p.id===r.patient);if(stay&&['anesthesiste','chirurgien'].includes(ctx.access?.()?.profile.profession)){
   if(r.state==='Occupée'){const target=resources.find(x=>x.id===C.currentResource(r));stay.sector=target?.sector||stay.sector;stay.stage=C.kind(target||{})==='room'?'Intervention':C.kind(target||{})==='recovery'?'SSPI':'Hospitalisation';}
   if(r.state==='Terminée'&&stay.sector===resources.find(x=>x.id===C.currentResource(r))?.sector)stay.sector='';
  }
  changed(r,'Régulation · '+action+' · '+r.id);render();toast('Mouvement préparé · vérifiez la confirmation serveur');
 });}
 function render(){
 const day=ctx.filters.date||ctx.today(),at=ctx.filters.at?.slice(0,10)===day?ctx.filters.at:day+'T10:00';
 const tabs=[['planning','Planning par salle'],['booking','Programmer un séjour'],['vacations','Vacations'],['capacity','SSPI & lits'],['resources','Ressources']];
 document.querySelector('.management')?.classList.toggle('is-plan',pane==='planning');$('#management-body').innerHTML=`<p class="bl-intro">Programme partagé · capacités et durées de démonstration, à paramétrer selon la clinique. Disponibilité prévisionnelle et occupation déclarée sont affichées séparément. Cliquez sur Actualiser pour charger les dernières données serveur.</p><div class="tabs planning-tabs" aria-label="Régulation du bloc et des lits">${tabs.map(([k,l])=>`<button data-plan-pane="${k}" aria-pressed="${pane===k}" class="${pane===k?'active':''}">${l}</button>`).join('')}</div><div class="management-toolbar bl-dates">${input('planning-day','Date du programme','date',day)}${input('planning-at','Disponibilité à cet horaire','datetime-local',at)}</div><div id="planning-content"></div>`;
 document.querySelectorAll('[data-plan-pane]').forEach(b=>b.onclick=()=>{pane=b.dataset.planPane;render()});
 $('input[name="planning-day"]').onchange=e=>{ctx.filters.date=e.target.value;render()};$('input[name="planning-at"]').onchange=e=>{ctx.filters.at=e.target.value;ctx.filters.date=e.target.value.slice(0,10);render()};
 ({planning:()=>planning(day,at),booking:()=>booking(day),vacations:()=>sessions(day),capacity:()=>capacity(at),resources:configuration})[pane]();bindActions();document.querySelectorAll('[data-management-dossier]').forEach(b=>b.onclick=()=>ctx.open(b.dataset.managementDossier,b.dataset.tab||'consult'));
 }
 function roomName(r){const unit=String(r.label||'').split(' · ').pop();return ({'bloc-chir':'Chirurgie','bloc-endo':'Endoscopie'}[r.sector]||'')+(r.sector in {'bloc-chir':1,'bloc-endo':1}?' · ':'')+unit}
 function who(id){const s=patients.find(p=>p.id===id),n=s?.identity;return n?.lastName?[n.firstName,String(n.lastName).toUpperCase()].filter(Boolean).join(' '):id||'Autre équipe'}
 function caseState(r,now){
  const s=patients.find(p=>p.id===r.patient),c=s?.consult||{},allergy=String(c.allergies||'').trim();
  const known=allergy&&!/^(aucune?|néant|non|ras|pas d.allergie)/i.test(allergy)&&!/à vérifier|non renseign/i.test(allergy);
  const reasons=[];
  if(r.state==='Réservée'&&!c.validated)reasons.push('Consultation d’anesthésie à valider.');
  if(r.state==='Réservée'&&known)reasons.push('Allergie : '+allergy.slice(0,80)+'.');
  const late=r.state==='Réservée'&&now&&r.start<now;
  const cls=r.state==='Terminée'||(r.state==='Occupée'&&(r.phase||'primary')!=='primary')?'is-done':r.state==='Occupée'?'is-now':reasons.length?'is-block':late?'is-late':'is-planned';
  const label=r.state==='Terminée'?'Terminé':r.state==='Occupée'?((r.phase||'primary')==='primary'?'En salle':(r.phase==='recovery'?'En SSPI':'Au lit')):reasons.length?'Point bloquant':late?'Retard':'Programmé';
  return {cls,label,reasons};
 }
 function demoProgramme(day){
  const nowH=Number(ctx.now().slice(11,13)),H=day===ctx.today()?Math.min(Math.max(nowH,9),14):10;
  const t=(h,m=0)=>day+'T'+String(h+Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const staff=[['IADE fictif 1','bloc-chir'],['Infirmière de bloc fictive 1','bloc-chir'],['IADE fictif 2','bloc-chir'],['Infirmière de bloc fictive 2','bloc-chir'],['IADE fictif 3','bloc-endo'],['Infirmière d’endoscopie fictive','bloc-endo']];
  staff.forEach(([label,sector],i)=>{if(!resources.some(r=>r.id==='staff-demo-'+(i+1)))resources.push({id:'staff-demo-'+(i+1),kind:'staff',label,sector,open:true})});
  const sid=i=>'staff-demo-'+i,vac=(room,label,from,to,ids)=>{const v={id:'VAC-'+crypto.randomUUID(),resource:room,label,start:t(from),end:t(to),staffIds:ids,state:'Ouverte'};vacations.push(v);return v};
  const v1=vac('bloc-chir-1','Orthopédie · ORL',H-3,H+4,[sid(1),sid(2)]),v2=vac('bloc-chir-2','Urologie · digestif',H-3,H+4,[sid(3),sid(4)]),v3=vac('bloc-endo-1','Gynécologie · endoscopie',H-3,H+2,[sid(5),sid(6)]);
  const add=(patient,v,procedure,h,m,duration,state,extra={})=>{if(!patients.some(p=>p.id===patient))return;const start=t(h,m),r={id:'RES-'+crypto.randomUUID(),planningVersion:1,patient,resource:v.resource,vacationId:v.id,procedure,start,end:C.addMinutes(start,duration+15),duration,turnover:15,staffIds:v.staffIds,equipmentIds:[],note:'Programme de démonstration',state,...extra};
   if(extra.recoveryMinutes){r.recovery={resource:extra.recoveryResource,start:C.addMinutes(start,duration),end:C.addMinutes(start,duration+extra.recoveryMinutes)};delete r.recoveryMinutes;delete r.recoveryResource}
   if(extra.bedResource){r.bed={resource:extra.bedResource,start:r.recovery?.end||C.addMinutes(start,duration),end:day+'T23:00'};delete r.bedResource}
   reservations.push(r)};
  add('DÉMO-006',v1,'Prothèse totale de genou gauche',H-3,15,90,'Terminée',{actualEnd:t(H-1,0)});
  add('DÉMO-001',v1,'Prothèse totale de hanche droite',H,30,120,'Réservée',{recoveryResource:'sspi-chir-1',recoveryMinutes:60,bedResource:'etage-1-1'});
  add('DÉMO-003',v1,'Amygdalectomie',H+2,45,45,'Réservée',{recoveryResource:'sspi-chir-1',recoveryMinutes:45,bedResource:'ambulatoire-2'});
  add('DÉMO-005',v2,'Résection endoscopique de prostate',H-1,-30+60,120,'Occupée',{phase:'primary',actualStart:t(H-1,30),recoveryResource:'sspi-chir-2',recoveryMinutes:60,bedResource:'etage-2-1'});
  add('DÉMO-004',v3,'Hystéroscopie opératoire',H-2,0,45,'Occupée',{phase:'recovery',actualStart:t(H-2,0),recoveryResource:'sspi-endo-1',recoveryMinutes:120,bedResource:'ambulatoire-1'});
  if(patients.some(p=>p.id==='DÉMO-002'))reservations.push({id:'RES-'+crypto.randomUUID(),planningVersion:1,patient:'DÉMO-002',resource:'etage-1-2',procedure:'Hospitalisation après cholécystectomie',start:day+'T07:00',end:day+'T23:00',duration:960,staffIds:[],equipmentIds:[],note:'Programme de démonstration',state:'Occupée',phase:'primary',actualStart:day+'T07:00'});
 }
 function planning(day,at){
 const daily=reservations.filter(r=>r.start.slice(0,10)===day&&r.state!=='Annulée');
 const rooms=resources.filter(r=>C.kind(r)==='room');
 const daySessions=vacations.filter(v=>v.start.slice(0,10)===day&&v.state!=='Annulée');
 const minute=s=>Number(s.slice(11,13))*60+Number(s.slice(14,16));
 const roomCases=daily.filter(r=>C.kind(resources.find(x=>x.id===r.resource)||{})==='room');
 const spans=[...roomCases,...daySessions],from=Math.floor(Math.min(8*60,...spans.map(r=>minute(r.start)))/60)*60,to=Math.ceil(Math.max(17*60,...spans.map(r=>minute(r.end)))/60)*60;
 const pct=m=>100*(Math.min(Math.max(m,from),to)-from)/(to-from);
 const position=r=>`left:${pct(minute(r.start))}%;width:${pct(minute(r.end))-pct(minute(r.start))}%`;
 const now=day===ctx.today()?ctx.now():'',nowMin=now?minute(now):null;
 if(!roomCases.some(r=>r.id===focus))focus=(roomCases.find(r=>caseState(r,now).cls==='is-block')||roomCases.find(r=>r.state==='Occupée')||roomCases[0])?.id||null;
 const hours=Array.from({length:(to-from)/60+1},(_,i)=>from+i*60);
 const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':00';
 const dayLabel=new Date(day+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
 const shift=n=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const legend=[['is-done','Terminé'],['is-now','En cours'],['is-planned','Programmé'],['is-late','Retard'],['is-block','Point bloquant']];
 const block=r=>{const st=caseState(r,now),end=r.duration?C.addMinutes(r.start,r.duration):r.end;return `<button type="button" class="bl-case ${st.cls}${r.id===focus?' is-focus':''}" style="${position(r)}" data-bl-focus="${esc(r.id)}" title="${esc(who(r.patient)+' · '+(r.procedure||'')+' · '+short(r.start)+'–'+short(end)+' · '+st.label)}"><strong>${esc(who(r.patient))}</strong><span>${esc(r.procedure||r.team||'Séjour')}</span><small>${short(r.start)}–${short(end)}</small></button>`};
 const lanes=rooms.map(room=>{const vs=daySessions.filter(v=>v.resource===room.id);return `<div class="bl-room"><strong>${esc(roomName(room))}</strong><small>${room.open===false?'Fermée':vs.length?esc(vs.map(v=>v.label).join(' · ')):'Pas de vacation'}</small></div><div class="bl-track">${vs.map(v=>`<div class="bl-session" style="${position(v)}" aria-hidden="true"></div>`).join('')}${otherBookings().filter(r=>r.resource===room.id&&r.start.slice(0,10)===day).map(r=>`<div class="bl-case is-other" style="${position(r)}"><strong>Autre équipe</strong><small>${short(r.start)}–${short(r.end)}</small></div>`).join('')}${roomCases.filter(r=>r.resource===room.id).map(block).join('')}</div>`}).join('');
 const f=reservations.find(r=>r.id===focus),fs=f&&caseState(f,now),fstay=f&&patients.find(p=>p.id===f.patient);
 const detail=f?`<article class="bl-card bl-detail"><div class="bl-card-head"><h3>${esc(who(f.patient))}</h3><span class="bl-mono">${short(f.start)}–${short(f.duration?C.addMinutes(f.start,f.duration):f.end)}</span></div><p class="bl-sub">${esc(f.procedure||'Séjour')} · ${esc(roomName(resources.find(x=>x.id===f.resource)||{label:f.resource}))} · <span class="bl-tag ${fs.cls}">${esc(fs.label)}</span></p>${fs.reasons.length?`<div class="bl-alert" role="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg><p><strong>Point bloquant.</strong> ${esc(fs.reasons.join(' '))}</p></div>`:''}<p class="bl-path">${itinerary(f)}</p><p class="bl-sub">Séjour ${esc(f.patient)}${fstay?' · '+esc(fstay.specialty)+' · '+esc(fstay.mode):''} · Équipe : ${esc((f.staffIds||[]).map(name).join(', ')||'à préciser')}</p><div class="bl-actions"><button class="secondary" data-management-dossier="${esc(f.patient)}" data-tab="consult">Ouvrir le dossier</button>${controls(f)}</div></article>`:`<article class="bl-card bl-detail"><h3>Aucune intervention ce jour</h3><p class="bl-sub">Programmez un séjour dans l’onglet « Programmer un séjour » après avoir créé une vacation.</p>${write()&&configWrite()&&!daySessions.length?`<button class="primary" data-bl-demo>Charger un programme de démonstration</button><p class="bl-note">Ajoute des vacations, du personnel et des interventions fictives pour cette date.</p>`:''}</article>`;
 const groups=[['Hospitalisation',r=>/^etage/.test(r.sector)],['Ambulatoire (places)',r=>r.sector==='ambulatoire'],['SSPI',r=>/^sspi/.test(r.sector)]];
 const occupiedAt=r=>allBookings().some(b=>b.state==='Occupée'&&C.currentResource(b)===r.id);
 const beds=`<article class="bl-card bl-beds"><div class="bl-card-head"><h3>Lits et places</h3><span class="bl-hint">occupés / ouverts</span></div>${groups.map(([label,test])=>{const list=resources.filter(r=>['bed','recovery'].includes(C.kind(r))&&test(r)&&r.open!==false),n=list.filter(occupiedAt).length,ratio=list.length?n/list.length:0;return `<div class="bl-bar"><div><span>${label}</span><strong>${n} / ${list.length}</strong></div><i class="${ratio>=.85?'is-high':''}"><b style="width:${100*ratio}%"></b></i></div>`}).join('')}<p class="bl-note">Occupation déclarée en temps réel. Le prévisionnel est dans « SSPI &amp; lits ».</p></article>`;
 $('#planning-content').innerHTML=`<div class="bl-top"><div><p class="bl-day">${esc(dayLabel)}${now?' · '+short(now):''}</p><ul class="bl-legend">${legend.map(([c,l])=>`<li><i class="${c}"></i>${l}</li>`).join('')}</ul></div><div class="bl-nav"><button class="secondary" data-bl-day="${shift(-1)}" aria-label="Jour précédent">‹</button><button class="secondary" data-bl-day="${ctx.today()}">Aujourd’hui</button><button class="secondary" data-bl-day="${shift(1)}" aria-label="Jour suivant">›</button>${write()?'<button class="primary" data-bl-book>Programmer</button>':''}</div></div><div class="bl-board"><div class="bl-grid" style="--bl-cols:${hours.length-1}"><div class="bl-axis-pad"></div><div class="bl-axis">${hours.slice(0,-1).map(m=>`<span style="left:${pct(m)}%">${fmt(m)}</span>`).join('')}</div>${lanes}${nowMin!=null&&nowMin>=from&&nowMin<=to?`<div class="bl-now" style="--bl-now:${pct(nowMin)}" aria-label="Maintenant ${short(now)}"></div>`:''}</div></div><div class="bl-below">${detail}${beds}</div><details class="bl-more"><summary>Programme détaillé et parcours (${daily.length})</summary><p class="muted">Les créneaux incluent la remise en état de la salle. Personnel et matériel sont réservés pendant tout le créneau. Les transferts effectifs restent à déclarer.</p>${table(['Séjour / geste','Parcours prévu','Durées','Personnel / matériel','État','Actions'],daily.sort((a,b)=>a.start.localeCompare(b.start)).map(r=>[esc(who(r.patient))+'<br><small>'+esc(r.patient)+'</small><br>'+esc(r.procedure||r.team||''),itinerary(r),r.duration?esc(r.duration)+' min de geste<br>'+esc(r.turnover??0)+' min de remise en état':esc(C.minutes(r.start,r.end))+' min',esc((r.staffIds||[]).map(name).join(', ')||r.team||'À préciser')+'<br>'+esc((r.equipmentIds||[]).map(name).join(', ')||r.material||'Aucun matériel affecté'),esc(r.state)+(r.state==='Occupée'?'<br>'+esc(name(C.currentResource(r))):''),controls(r)]))}</details>`;
 document.querySelectorAll('[data-bl-focus]').forEach(b=>b.onclick=()=>{focus=b.dataset.blFocus;render()});
 document.querySelectorAll('[data-bl-day]').forEach(b=>b.onclick=()=>{ctx.filters.date=b.dataset.blDay;ctx.filters.at=b.dataset.blDay+'T10:00';render()});
 const book=$('[data-bl-book]');if(book)book.onclick=()=>{pane='booking';render()};
 const demo=$('[data-bl-demo]');if(demo)demo.onclick=()=>{if(!write()||!configWrite())return;demoProgramme(day);ctx.trace(null,'Programme de démonstration chargé');render();toast('Programme de démonstration préparé · vérifiez la confirmation serveur')};
 }
 function booking(day){
 const stay=ctx.getStay(),r=reservations.find(x=>x.id===editing&&x.patient===stay?.id&&x.state==='Réservée');if(!r)editing=null;
 const announced=stay?.surgicalAnnouncement?.published?.fields||{};
 const rooms=openResources('room'),vacs=vacations.filter(v=>v.state!=='Annulée'&&v.start.slice(0,10)===day),staff=openResources('staff');
 const start=r?.start||day+'T08:00';
 $('#planning-content').innerHTML=`<h3>${r?'Modifier le programme':'Programmer'} · ${esc(stay?.id||'Aucun séjour')}</h3><p>Pour un bloc, créez d’abord une vacation et affectez ses personnels. Une salle, une personne et un équipement identifiés ne peuvent être réservés deux fois sur des créneaux qui se chevauchent.</p>${form('plan-booking',select('resource','Salle, lit ou place principale',resources.filter(x=>x.open!==false&&['room','bed','recovery'].includes(C.kind(x))).map(x=>[x.id,x.label]),r?.resource)+select('vacationId','Vacation du bloc (sans objet pour un lit seul)',[['','Choisir une vacation'],...vacs.map(v=>[v.id,name(v.resource)+' · '+short(v.start)+'–'+short(v.end)+' · '+v.label])],r?.vacationId)+input('procedure','Geste / motif fictif','text',r?.procedure||announced.procedure||'','required maxlength="200"')+input('start','Entrée prévue en salle / début','datetime-local',start)+input('duration','Durée du geste ou séjour simple (minutes)','number',r?.duration||60,'required min="1" max="10080" step="1"')+input('turnover','Remise en état de la salle (minutes)','number',r?.turnover??15,'required min="0" max="240" step="1"')+multi('staffIds','Personnel affecté (parmi ceux de la vacation)',staff,r?.staffIds)+multi('equipmentIds','Matériel identifié',openResources('equipment'),r?.equipmentIds)+select('recoveryResource','Poste de SSPI prévu',[['','Sans réservation de SSPI'],...openResources('recovery').map(x=>[x.id,x.label])],r?.recovery?.resource)+input('recoveryMinutes','Durée prévisionnelle de SSPI (minutes)','number',r?.recovery?C.minutes(r.recovery.start,r.recovery.end):60,'required min="1" max="1440" step="1"')+select('bedResource','Lit / place en aval',[['','Sans lit réservé en aval'],...openResources('bed').map(x=>[x.id,x.label])],r?.bed?.resource)+input('bedEnd','Libération prévisionnelle du lit','datetime-local',r?.bed?.end||day+'T18:00','')+input('note','Contraintes / besoins complémentaires','text',r?.note||'','maxlength="500"'),r?'Enregistrer la modification':'Vérifier et programmer')}<p id="planning-preview" class="notice" aria-live="polite"></p>`;
 const f=$('#plan-booking');if(f){const preview=()=>{try{const v=Object.fromEntries(new FormData(f)),end=C.addMinutes(v.start,Number(v.duration)+Number(v.turnover));$('#planning-preview').textContent='Fin du geste : '+short(C.addMinutes(v.start,v.duration))+' · salle réservée jusqu’à '+short(end)+(v.recoveryResource?' · sortie prévisionnelle de SSPI : '+short(C.addMinutes(C.addMinutes(v.start,v.duration),v.recoveryMinutes)):'')}catch{$('#planning-preview').textContent='Renseignez les horaires.'}};f.oninput=preview;preview();}
 attach('plan-booking',v=>{
  if(!write()||!stay)return 'Séjour ou droit de programmation indisponible.';
  const duration=Number(v.duration),turnover=C.kind(resources.find(x=>x.id===v.resource))==='room'?Number(v.turnover):0;
  if(!C.validTime(v.start)||!Number.isInteger(duration)||duration<1||duration>10080||!Number.isInteger(turnover)||turnover<0||turnover>240)return 'Vérifiez les durées et la date.';
  const item={id:r?.id||'RES-'+crypto.randomUUID(),planningVersion:1,patient:stay.id,resource:v.resource,vacationId:v.vacationId,procedure:v.procedure.trim(),start:v.start,end:C.addMinutes(v.start,duration+turnover),duration,turnover,staffIds:v.staffIds,equipmentIds:v.equipmentIds,note:v.note,state:'Réservée'};
  if(v.recoveryResource){const recoveryMinutes=Number(v.recoveryMinutes);if(!Number.isInteger(recoveryMinutes)||recoveryMinutes<1)return 'Durée de SSPI invalide.';item.recovery={resource:v.recoveryResource,start:C.addMinutes(v.start,duration),end:C.addMinutes(C.addMinutes(v.start,duration),recoveryMinutes)}}
  if(v.bedResource)item.bed={resource:v.bedResource,start:item.recovery?.end||C.addMinutes(v.start,duration),end:v.bedEnd};
  const error=C.bookingError(item,allBookings(),resources,vacations);if(error)return error;
  if(r)Object.assign(r,item);else reservations.push(item);changed(item,'Programme '+(r?'modifié':'créé')+' · '+item.id);editing=null;pane='planning';
 });
 }
 function sessions(day){
 const rows=vacations.filter(v=>v.start.slice(0,10)===day);
 $('#planning-content').innerHTML=`<h3>Vacations datées</h3><p>Les personnels affectés à une vacation ne peuvent être affectés à une autre vacation simultanée. Les interventions doivent tenir dans la vacation, remise en état comprise.</p>${form('plan-vacation',select('resource','Salle',openResources('room').map(x=>[x.id,x.label]))+input('label','Équipe / spécialité fictive','text','','required maxlength="160"')+input('start','Début de vacation','datetime-local',day+'T08:00')+input('end','Fin de vacation','datetime-local',day+'T13:00')+multi('staffIds','Personnel présent sur la vacation',openResources('staff')),'Créer la vacation')}${table(['Vacation','Salle','Horaires','Personnel','État'],rows.map(v=>[esc(v.label),esc(name(v.resource)),short(v.start)+'–'+short(v.end),esc((v.staffIds||[]).map(name).join(', ')),esc(v.state||'Ouverte')+(write()&&v.state!=='Annulée'?` <button class="secondary" data-cancel-vacation="${esc(v.id)}">Annuler</button>`:'')]))}`;
 attach('plan-vacation',v=>{if(!write())return 'Droit insuffisant.';const item={id:'VAC-'+crypto.randomUUID(),resource:v.resource,label:v.label.trim(),start:v.start,end:v.end,staffIds:v.staffIds,state:'Ouverte'};const error=C.vacationError(item,vacations,resources);if(error)return error;vacations.push(item)});
 document.querySelectorAll('[data-cancel-vacation]').forEach(b=>b.onclick=()=>{if(!write())return;if(reservations.some(r=>r.vacationId===b.dataset.cancelVacation&&C.active(r))){toast('Annulation bloquée : déprogrammez les séjours de cette vacation.');return}vacations.find(v=>v.id===b.dataset.cancelVacation).state='Annulée';render()});
 }
 function capacity(at){
 const list=resources.filter(r=>['recovery','bed'].includes(C.kind(r)));
 const occupied=id=>allBookings().find(r=>r.state==='Occupée'&&C.currentResource(r)===id);
 const reservationsAt=id=>allBookings().filter(r=>C.active(r)&&C.allocations(r).some(a=>a.resource===id&&a.start<=at&&at<a.end));
 $('#planning-content').innerHTML=`<h3>Places de SSPI et lits</h3><p>Disponibilité prévisionnelle à ${esc(at.replace('T',' '))}. Une occupation déclarée reste visible jusqu’au transfert ou à la libération, même si l’horaire prévu est dépassé.</p><div class="management-resources">${list.map(r=>{const occ=occupied(r.id),booked=reservationsAt(r.id);return `<article><strong>${esc(r.label)}</strong><span class="pill ${r.open===false||occ||booked.length?'warn':'good'}">${r.open===false?'Fermée':occ?'Occupée actuellement':booked.length?'Réservée à l’horaire choisi':'Disponible à l’horaire choisi'}</span><p>${esc(sectors[r.sector]||'')}</p>${occ?'<p>Occupation déclarée : '+esc(occ.patient||'Autre équipe · identité masquée')+'</p>':''}${booked.map(b=>'<p>Prévu : '+esc(b.patient||'Autre équipe · identité masquée')+'</p>').join('')}${r.reason?'<p>'+esc(r.reason)+'</p>':''}</article>`}).join('')}</div><h3>Mouvements et libérations</h3>${table(['Séjour','Parcours prévisionnel','Occupation déclarée','Actions'],reservations.filter(C.active).filter(r=>C.kind(resources.find(x=>x.id===r.resource)||{})!=='room'||r.recovery||r.bed).map(r=>[esc(r.patient),itinerary(r),r.state==='Occupée'?esc(name(C.currentResource(r))):'Non admis',controls(r)]))}`;
 }
 function configuration(){
 $('#planning-content').innerHTML=`<h3>Salles, postes de SSPI, lits, personnels et matériel</h3><p>Une ligne correspond à une ressource identifiable et indivisible. Créez une ligne par poste, lit, professionnel fictif ou équipement. Les capacités initiales sont illustratives.</p>${form('plan-resource',select('kind','Type de ressource',Object.entries(types))+input('label','Nom / identifiant fictif','text','','required maxlength="160"')+select('sector','Secteur',Object.entries(sectors))+input('reason','Qualification, équipement ou contrainte','text','','maxlength="300"'),'Ajouter la ressource',configWrite())}${table(['Ressource','Type','Secteur','État','Action'],resources.map(r=>[esc(r.label),esc(types[C.kind(r)]),esc(sectors[r.sector]||''),r.open===false?'Fermée · '+esc(r.reason||'Indisponible'):'Ouverte',configWrite()?`<button class="secondary" data-toggle-resource="${esc(r.id)}">${r.open===false?'Rouvrir':'Fermer'}</button>`:'Lecture seule']))}<p class="muted">Le paramétrage des ressources est réservé au propriétaire. Les personnels saisis ici sont des ressources de planning fictives ; ils ne donnent aucun accès au dossier.</p>`;
 attach('plan-resource',v=>{if(!configWrite())return 'Paramétrage réservé au propriétaire.';if(!v.label.trim())return 'Nom requis.';resources.push({id:'RESOURCE-'+crypto.randomUUID(),kind:v.kind,label:v.label.trim(),sector:v.sector,reason:v.reason,open:true})});
 document.querySelectorAll('[data-toggle-resource]').forEach(b=>b.onclick=()=>{if(!configWrite())return;const r=resources.find(x=>x.id===b.dataset.toggleResource);if(r.open!==false&&(reservations.some(x=>C.active(x)&&C.allocations(x).some(a=>a.resource===r.id))||vacations.some(v=>v.state!=='Annulée'&&(v.resource===r.id||v.staffIds?.includes(r.id))))){toast('Fermeture bloquée : libérez ou annulez les affectations actives de cette ressource.');return}r.open=r.open===false;render()});
 }
 return {render};
};
})(typeof window!=='undefined'?window:globalThis);

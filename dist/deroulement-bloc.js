/* Écran « Déroulement du programme opératoire » (26/11/2026, demande de Romain, sur le modèle de l'écran du bloc) :
   frise par salle (prévu / réel, heure actuelle), onglets bloc chirurgical / endoscopie / SSPI, mise à jour automatique,
   filtres Motif / Salles vides / Retard, légende par étape, puis liste des interventions.
   Règles : dist/deroulement-regles.js. Données : le programme partagé (management/reservations). */
(function(root){
'use strict';
const D=root.IaseloDeroulement;
let onglet='bloc-chir',motif=true,sallesVides=false,seulRetard=false,minuteur=null;
const lire=(k,v)=>{try{const x=localStorage.getItem('iaselo.deroulement.'+k);return x===null?v:JSON.parse(x)}catch{return v}};
const ecrire=(k,v)=>{try{localStorage.setItem('iaselo.deroulement.'+k,JSON.stringify(v))}catch{}};
let periode=lire('periode',2);motif=lire('motif',true);sallesVides=lire('sallesVides',false);
root.createDeroulement=function(ctx){
 const {esc,patients,resources,reservations,vacations,C}=ctx;
 const hm=s=>s?s.slice(11,16):'';
 const stay=id=>patients.find(p=>p.id===id);
 const nom=id=>{const i=stay(id)?.identity||{};return i.lastName?String(i.lastName).toUpperCase()+' '+(i.firstName||''):id};
 const age=(id,day)=>{const b=stay(id)?.identity?.birthDate;if(!/^\d{4}-\d\d-\d\d$/.test(b||''))return '';let a=Number(day.slice(0,4))-Number(b.slice(0,4));if(day.slice(5)<b.slice(5))a--;return a+' ans'};
 const asa=id=>{const a=String(stay(id)?.consult?.asa||'');return /non renseign/i.test(a)?'':a.replace(/^ASA\s*/i,'')};
 const label=id=>resources.find(r=>r.id===id)?.label||id||'';
 const sans=l=>String(l||'').replace(/\s*\(démo[^)]*\)/,'').trim();
 const court=l=>{const m=sans(l).match(/\b(Salle|Poste|Place|fauteuil|lit)\s*\d+/i);return m?m[0]:sans(l)};
 const detail=l=>{const x=sans(l),c=court(l);return x===c?'':x.replace(c,'').replace(/^[\s·]+|[\s·]+$/g,'')};
 const vacOf=r=>vacations.find(v=>v.id===r.vacationId);
 const chir=r=>r.surgeon||vacOf(r)?.surgeon||(String(r.note||'').match(/·\s*(Dr [^·]+)$/)||[])[1]||'';
 const secteur=r=>resources.find(x=>x.id===r.resource)?.sector||'';
 const etapesWrite=()=>ctx.etapesWrite();

 function lignes(day,now){
  const reels=reservations.filter(r=>r.start.slice(0,10)===day&&r.state!=='Annulée'&&C.kind(resources.find(x=>x.id===r.resource)||{})==='room');
  const props=ctx.propositions(day).map(p=>({...p,id:p.id,patient:p.stay,proposition:true,state:'Réservée',surgeon:p.surgeon}));
  return [...reels,...props].sort((a,b)=>a.start.localeCompare(b.start)||String(a.resource).localeCompare(String(b.resource)));
 }
 function couleurHeure(r,k){const e=D.etapes(r)[k];if(!e)return '';if(k!=='entree')return 'is-ok';const d=D.ecartEntree(r);return d<=10?'is-ok':d<=30?'is-warn':'is-late'}
 function render(host,day){
  const now=day===ctx.today()?ctx.now():'',all=lignes(day,now);
  const parSecteur=s=>all.filter(r=>secteur(r)===s);
  const sspiRows=reservations.filter(r=>r.recovery?.resource&&r.recovery.start.slice(0,10)===day&&r.state!=='Annulée');
  const tabs=[['bloc-chir','Bloc chirurgical',parSecteur('bloc-chir').length],['bloc-endo','Endoscopie',parSecteur('bloc-endo').length],['sspi','SSPI',sspiRows.length]];
  const rows=onglet==='sspi'?[]:parSecteur(onglet).filter(r=>!seulRetard||D.retard(r,now)>0);
  const salles=onglet==='sspi'?resources.filter(r=>C.kind(r)==='recovery'&&(sallesVides||sspiRows.some(x=>x.recovery.resource===r.id))):resources.filter(r=>C.kind(r)==='room'&&r.sector===onglet&&(sallesVides||rows.some(x=>x.resource===r.id)||(!seulRetard&&r.open!==false&&vacations.some(v=>v.resource===r.id&&v.state!=='Annulée'&&v.start.slice(0,10)===day))));
  const intervalles=onglet==='sspi'?sspiRows.map(r=>r.recovery):[...rows,...vacations.filter(v=>v.start.slice(0,10)===day&&v.state!=='Annulée'&&salles.some(s=>s.id===v.resource))];
  const min=s=>Number(s.slice(11,13))*60+Number(s.slice(14,16));
  const from=Math.floor(Math.min(8*60,...intervalles.map(x=>min(x.start)))/60)*60,to=Math.ceil(Math.max(18*60,...intervalles.map(x=>min(x.end>x.start&&x.end.slice(0,10)===day?x.end:day+'T23:59')),...(now?[min(now)+30]:[]))/60)*60;
  const pct=m=>100*(Math.min(Math.max(m,from),to)-from)/(to-from);
  const pos=(a,b)=>`left:${pct(min(a))}%;width:${Math.max(pct(min(b))-pct(min(a)),.6)}%`;
  const hours=Array.from({length:(to-from)/60+1},(_,i)=>from+i*60);
  const titre=(r,st)=>[nom(r.patient),r.procedure,'prévu '+hm(r.start)+'–'+hm(D.finPrevue(r)),...D.ETAPES.filter(([k])=>D.etapes(r)[k]).map(([k,l])=>l+' '+hm(D.etapes(r)[k])),D.STATUTS[st]].filter(Boolean).join(' · ');
  const bloc=r=>{const st=D.statut(r),re=D.reel(r,now),ret=D.retard(r,now),a=re?re.start:r.start,b=re?re.end:D.finPrevue(r),texte=motif?(r.procedure||'Intervention'):nom(r.patient);
   return `<button type="button" class="dr-case st-${st}${ret?' is-retard':''}" style="${pos(a,b)}" data-dr-open="${esc(r.patient)}" title="${esc(titre(r,st))}">${st==='nonConfirme'?'<b aria-hidden="true">!</b>':''}<span>${esc(texte)}</span></button><span class="dr-plan" style="${pos(r.start,D.finPrevue(r))}" aria-hidden="true"></span>`};
  const blocSspi=r=>{const st=r.state==='Occupée'&&r.phase==='recovery'?'entree':r.state==='Terminée'||(r.state==='Occupée'&&r.phase==='bed')?'sortieBloc':'programme';return `<button type="button" class="dr-case st-${st}" style="${pos(r.recovery.start,r.recovery.end)}" data-dr-open="${esc(r.patient)}" title="${esc(nom(r.patient)+' · '+r.procedure+' · SSPI '+hm(r.recovery.start)+'–'+hm(r.recovery.end))}"><span>${esc(motif?r.procedure:nom(r.patient))}</span></button>`};
  const lanes=salles.map(s=>{const vs=vacations.filter(v=>v.resource===s.id&&v.start.slice(0,10)===day&&v.state!=='Annulée');const cases=onglet==='sspi'?sspiRows.filter(r=>r.recovery.resource===s.id).map(blocSspi):rows.filter(r=>r.resource===s.id).map(bloc);
   return `<div class="dr-room"><strong>${esc(court(s.label))}</strong>${detail(s.label)?`<small>${esc(detail(s.label))}</small>`:''}${s.open===false?'<small>Fermée</small>':vs.length?`<small>${esc(vs.map(v=>v.surgeon||v.label).join(' · '))}</small>`:''}</div><div class="dr-track">${vs.map(v=>`<span class="dr-vac" style="${pos(v.start,v.end)}" aria-hidden="true"></span>`).join('')}${cases.join('')}</div>`}).join('');
  const legende=[['arrivee','arrivée au bloc'],['entree','entrée en salle'],['sortie','sortie de salle'],['sortieBloc','sortie de bloc'],['nonConfirme','patient non confirmé'],['programme','programmé']].map(([k,l])=>`<span class="dr-leg st-${k}"><i aria-hidden="true">${k==='nonConfirme'?'!':''}</i>${l}</span>`).join('');
  const liste=onglet==='sspi'?[]:rows;
  const action=r=>{if(r.proposition)return `<button type="button" class="dr-btn" data-dr-regulation>À confirmer</button>`;if(!etapesWrite())return '';const n=D.prochaine(r);return (n?`<button type="button" class="dr-btn primary" data-dr-etape="${esc(n)}" data-dr-id="${esc(r.id)}">${esc(D.libelle(n))}</button>`:'')+(D.etapeCourante(r)&&(r.transitions||[]).some(t=>String(t.action).startsWith('etape:')&&!t.annulee)?`<button type="button" class="dr-btn ghost" data-dr-annuler="${esc(r.id)}" title="Annuler la dernière étape">↶</button>`:'')};
  const table=liste.length?`<div class="dr-scroll"><table class="dr-table"><thead><tr><th>État</th><th title="Point bloquant">P.B.</th><th>Prévu</th><th>Arrivée</th><th>Entrée</th><th>Sortie salle</th><th>Sortie bloc</th><th>Lit</th><th>Chirurgien</th><th>Anesthésiste</th><th>Patient</th><th>Âge</th><th>Motif</th><th>ASA</th><th>Acte</th><th>Salle</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${liste.map(r=>{const st=D.statut(r),e=D.etapes(r),pb=r.proposition?[]:ctx.caseState(r,now).reasons,ret=D.retard(r,now);
   return `<tr class="st-row-${st}${ret?' is-retard':''}"><td><span class="dr-chip st-${st}">${esc(D.STATUTS[st])}</span>${ret?`<small class="dr-ret">+${ret} min</small>`:''}</td><td>${pb.length?`<span class="dr-pb" title="${esc(pb.join(' '))}">⚠</span>`:''}</td><td class="dr-mono">${hm(r.start)}</td>${['arrivee','entree','sortie','sortieBloc'].map(k=>`<td class="dr-mono ${couleurHeure(r,k)}">${hm(e[k])}</td>`).join('')}<td>${esc(court(label(r.bed?.resource)))}</td><td>${esc(chir(r))}</td><td>${esc(r.anesthesiste||'')}</td><td class="dr-pat"><button type="button" class="dr-link" data-dr-open="${esc(r.patient)}">${esc(nom(r.patient))}</button></td><td>${esc(age(r.patient,day))}</td><td class="dr-motif">${esc(r.procedure||'')}</td><td>${esc(asa(r.patient))}</td><td class="dr-mono">${esc(r.ccam||'')}</td><td>${esc(court(label(r.resource)))}</td><td class="dr-act">${action(r)}</td></tr>`}).join('')}</tbody></table></div>`:`<p class="empty">${onglet==='sspi'?'Voir la frise SSPI ci-dessus.':seulRetard?'Aucune intervention en retard.':'Aucune intervention pour ce jour.'}</p>`;
  const date=new Date(day+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  host.innerHTML=`<section class="dr-root"><div class="dr-head"><h3>Déroulement du programme opératoire · ${esc(date)}${now?' à '+hm(now):''}</h3>
   <div class="dr-tools"><label>Mise à jour toutes les <select data-dr-periode>${[[0,'jamais'],[1,'1 min'],[2,'2 min'],[5,'5 min']].map(([v,l])=>`<option value="${v}" ${v===periode?'selected':''}>${l}</option>`).join('')}</select></label>
   <label><input type="checkbox" data-dr-opt="motif" ${motif?'checked':''}> Motif</label><label><input type="checkbox" data-dr-opt="sallesVides" ${sallesVides?'checked':''}> Salles vides</label><label><input type="checkbox" data-dr-opt="seulRetard" ${seulRetard?'checked':''}> Retard</label>
   <span class="dr-nav"><button type="button" class="dr-btn" data-dr-jour="-1" aria-label="Jour précédent">‹</button><button type="button" class="dr-btn" data-dr-jour="0">Aujourd’hui</button><button type="button" class="dr-btn" data-dr-jour="1" aria-label="Jour suivant">›</button></span></div>
   <div class="dr-legend">${legende}</div></div>
   <div class="dr-tabs" role="tablist">${tabs.map(([k,l,n])=>`<button type="button" role="tab" aria-selected="${onglet===k}" class="${onglet===k?'active':''}" data-dr-onglet="${k}">${l} (${n})</button>`).join('')}</div>
   <div class="dr-board" style="--dr-now:${now?pct(min(now)).toFixed(2):-10}"><div class="dr-hours"><span></span><div>${hours.map(h=>`<span style="left:${pct(h)}%">${String(h/60).padStart(2,'0')}h</span>`).join('')}</div></div>${lanes||'<p class="empty">Aucune salle avec intervention. Cochez « Salles vides » pour toutes les afficher.</p>'}${now?'<i class="dr-now" aria-hidden="true"></i>':''}</div>
   <div class="dr-list-head"><h4>Interventions · ${esc(tabs.find(t=>t[0]===onglet)[1])}</h4><span>${liste.filter(r=>D.statut(r)==='sortieBloc').length} / ${liste.length} sortis du bloc</span></div>${table}</section>`;
  bind(host,day);planifier();
 }
 function bind(host,day){
  host.querySelectorAll('[data-dr-onglet]').forEach(b=>b.onclick=()=>{onglet=b.dataset.drOnglet;ctx.rerender()});
  host.querySelectorAll('[data-dr-opt]').forEach(b=>b.onchange=()=>{const k=b.dataset.drOpt;if(k==='motif'){motif=b.checked;ecrire('motif',motif)}if(k==='sallesVides'){sallesVides=b.checked;ecrire('sallesVides',sallesVides)}if(k==='seulRetard')seulRetard=b.checked;ctx.rerender()});
  const p=host.querySelector('[data-dr-periode]');if(p)p.onchange=()=>{periode=Number(p.value);ecrire('periode',periode);planifier()};
  host.querySelectorAll('[data-dr-jour]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.drJour);if(!n)ctx.setDay(ctx.today());else{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);ctx.setDay(d.toISOString().slice(0,10))}});
  host.querySelectorAll('[data-dr-open]').forEach(b=>b.onclick=()=>{if(stay(b.dataset.drOpen))ctx.open(b.dataset.drOpen,'consult')});
  host.querySelectorAll('[data-dr-regulation]').forEach(b=>b.onclick=()=>ctx.regulation());
  host.querySelectorAll('[data-dr-etape]').forEach(b=>b.onclick=()=>maj(b.dataset.drId,r=>D.appliquer(r,b.dataset.drEtape,ctx.now(),ctx.compte()),D.libelle(b.dataset.drEtape)));
  host.querySelectorAll('[data-dr-annuler]').forEach(b=>b.onclick=()=>maj(b.dataset.drAnnuler,r=>D.annuler(r,ctx.now(),ctx.compte()),'Étape annulée'));
 }
 function maj(id,fn,message){
  if(!etapesWrite())return;const i=reservations.findIndex(r=>r.id===id);if(i<0)return;const r=reservations[i],out=fn(r);if(out.error){ctx.toast(out.error);return}
  const n=out.reservation;
  if(n.state==='Occupée'&&(r.state!=='Occupée'||n.phase!==r.phase)){const err=C.transitionError(n,n.phase||'primary',ctx.allBookings().filter(x=>x.id!==n.id),resources);if(err){ctx.toast(err);return}}
  reservations[i]=n;ctx.trace(n.patient,'Déroulement du bloc · '+message+' · '+nom(n.patient));ctx.rerender();ctx.toast(message+' · '+nom(n.patient)+' · enregistrement en cours');
 }
 // Mise à jour automatique : recharge le dossier partagé puis redessine (la ligne de l'heure avance).
 function planifier(){if(minuteur)clearInterval(minuteur);minuteur=null;if(!periode)return;minuteur=setInterval(async()=>{if(!document.querySelector('.dr-root')){clearInterval(minuteur);minuteur=null;return}if(document.activeElement?.closest?.('.dr-tools'))return;try{await root.iaseloSharedRefresh?.()}catch{}if(document.querySelector('.dr-root'))ctx.rerender()},periode*60000)}
 return {render};
};
})(typeof window!=='undefined'?window:globalThis);

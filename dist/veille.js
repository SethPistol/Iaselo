/* IASELO · fonctionnalités issues de la veille marché (novembre 2026).
   - Aide à la consultation : orientation après questionnaire, scores calculés, consignes d'arrêt datées, CPA préremplie
   - Complétude du dossier et blocage de programmation
   - Tour de contrôle du bloc (statut patient en un clic) et check-list HAS signée
   - Suivi ambulatoire J-1 / J+1 (SMS Brevo, appel tracé, alertes)
   - Lettre de liaison vers DMP et MSSanté : SIMULATION tant que l'homologation ANS n'est pas obtenue
   Le module est branché par parcours-v8.js (window.createVeille) ; ses données vivent dans des rubriques
   dédiées du séjour : aideCpa, checklistBloc, blocStatut, suiviAmbu, envoisInterop. */
(function(){
'use strict';
const R=window.IaseloRegles;
const ICON={
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
 alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>',
 dot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>',
 lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
 tower:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
 arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
 phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
 send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>'
};
const LV={ok:{cls:'v-ok',word:'Stable'},warn:{cls:'v-warn',word:'À surveiller'},crit:{cls:'v-crit',word:'Élevé'},na:{cls:'v-na',word:'Non calculé'}};
const fmtDT=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
const fmtD=iso=>{const d=new Date(iso+'T12:00:00');return isNaN(d)?'':d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})};

window.createVeille=function(ctx){
 const {$,esc,toast,patients,current,stages,dossierStages}=ctx;
 const job=()=>ctx.job()||'';
 const who=()=>{const a=ctx.access?.();return a?.profile?.display_name||ctx.role()};
 const can=key=>ctx.canWrite?ctx.canWrite('stay/'+(current()?.id||'x')+'/'+key):true;
 const isDoctor=()=>['anesthesiste','chirurgien'].includes(job())||(!job()&&ctx.role()!=='Infirmier');
 const identity=stay=>{try{return ctx.identityStatus?.(stay)||''}catch{return ''}};
 const trace=(stay,text,kind)=>{stay.events=stay.events||[];stay.events.unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text,kind})};

 // Onglets ajoutés au dossier, dans les étapes existantes.
 const TABS={aideCpa:['consultation','Scores, tri & consignes',1],checklistHas:['peroperatoire','Check-list HAS bloc',1],suiviJ1:['postoperatoire','Suivi ambulatoire J-1 / J+1',2]};
 for(const [key,[group,label,pos]] of Object.entries(TABS)){const g=dossierStages.find(x=>x.id===group);if(g&&!g.items.some(([k])=>k===key))g.items.splice(Math.min(pos,g.items.length),0,[key,label]);}

 /* ================= Aide à la consultation ================= */
 function aide(stay){stay.aideCpa=stay.aideCpa&&typeof stay.aideCpa==='object'?stay.aideCpa:{};stay.aideCpa.inputs??={};return stay.aideCpa}
 function scoreCard(s,editable){
  const lv=LV[s.level]||LV.na;
  const toggles={stopbang:{'Ronflement fort':'snoring','Fatigue / somnolence diurne':'tired','Apnées observées':'observed','Tour de cou > 40 cm':'neck'},apfel:{'Opioïdes postopératoires prévus':'opioids'},lee:{'Chirurgie à haut risque (intrapéritonéale, intrathoracique, vasculaire sus-inguinale)':'highRiskSurgery','Diabète traité par insuline':'insulin'}}[s.id]||{};
  return `<article class="v-score ${lv.cls}"><header><span class="v-score-name">${esc(s.label)}</span><span class="v-level ${lv.cls}">${s.level==='ok'?ICON.check:s.level==='na'?ICON.dot:ICON.alert}${lv.word}</span></header>
  <div class="v-score-value"><strong>${s.value??'—'}</strong><small>/ ${s.max}</small></div><p class="v-score-text">${esc(s.text)}</p>
  <ul class="v-criteria">${s.criteria.map(c=>{const k=toggles[c.label];return `<li class="${c.value===true?'is-yes':c.value===false?'is-no':'is-null'}"><span class="v-crit-mark" aria-hidden="true">${c.value===true?'●':c.value===false?'○':'?'}</span><span>${esc(c.label)}<small>${esc(c.source)}</small></span>${k&&editable?`<span class="v-yn" role="group" aria-label="${esc(c.label)}"><button type="button" data-input="${k}" data-val="true" aria-pressed="${c.value===true}">Oui</button><button type="button" data-input="${k}" data-val="false" aria-pressed="${c.value===false}">Non</button></span>`:''}</li>`}).join('')}</ul>
  <footer>${s.missing?`<span class="v-missing">${s.missing} critère${s.missing>1?'s':''} à compléter</span>`:'<span class="v-complete">Critères complets</span>'}<cite>${esc(s.ref)}</cite></footer></article>`;
 }
 function completudeHTML(stay,compact){
  const c=R.completude(stay,stay.aideCpa,identity(stay));
  return `<section class="v-card v-completude"><header class="v-card-head"><div><h4>Complétude avant programmation</h4><p>${c.ready?'Dossier prêt pour le bloc':`<b class="v-crit-t">${ICON.lock}Programmation bloquée</b> · ${c.blocking.length} élément${c.blocking.length>1?'s':''} bloquant${c.blocking.length>1?'s':''}`}</p></div><div class="v-meter" role="img" aria-label="${c.done} sur ${c.total}"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="v-meter-bg"/><circle cx="18" cy="18" r="15.5" class="v-meter-fg ${c.ready?'ok':'crit'}" stroke-dasharray="${c.percent*0.974} 100"/></svg><span>${c.done}/${c.total}</span></div></header>
  <ul class="v-checklist">${c.items.map(i=>`<li class="${i.na?'is-na':i.ok?'is-ok':i.blocking?'is-block':'is-todo'}"><span class="v-ic">${i.na?ICON.dot:i.ok?ICON.check:ICON.alert}</span><span><b>${esc(i.label)}</b><small>${esc(i.na?'Sans objet · '+i.detail:i.detail)}</small></span><em>${i.na?'Sans objet':i.ok?'Fait':i.blocking?'Bloquant':'À faire'}</em></li>`).join('')}</ul>
  ${compact?'':'<p class="v-foot">Inspiré des outils de bloc du marché (blocage de programmation si dossier incomplet). Un passage outre reste possible avec un motif tracé.</p>'}</section>`;
 }
 function panelAide(){
  const stay=current(),a=aide(stay),editable=job()==='anesthesiste'&&can('aideCpa');
  const sc=R.scores(stay,a.inputs),ori=R.orientation(stay,a.inputs),cons=R.consignes(stay);
  const valid=a.consignes?.validatedAt,items=valid?a.consignes.items:cons.items;
  const content=$('#content');
  content.innerHTML=`<div class="v-wrap">
  <header class="v-head"><div><p class="v-kicker">Aide à la consultation d’anesthésie</p><h3>Scores, tri du questionnaire et consignes de traitement</h3><p class="v-sub">Calculs proposés à partir du questionnaire patient et de la consultation. Chaque critère indique sa source ; l’anesthésiste confirme avant tout report dans le dossier.</p></div>${editable?`<button type="button" class="primary" id="v-report">Reporter les scores dans la consultation</button>`:''}</header>
  <section class="v-card v-tri ${'v-'+ori.proposition.level}"><div class="v-tri-main"><span class="v-level v-${ori.proposition.level}">${ori.proposition.level==='ok'?ICON.check:ICON.alert}${ori.received?'Questionnaire reçu':'Questionnaire non reçu'}</span><h4>${esc(ori.proposition.label)}</h4><p>${esc(ori.proposition.detail)} ASA ${esc(ori.asa)} d’après les déclarations.</p></div>
   <div class="v-flags">${ori.flags.length?ori.flags.map(f=>`<span class="v-flag v-${f.level}">${f.level==='crit'?ICON.alert:ICON.dot}${esc(f.label)}</span>`).join(''):'<span class="v-flag v-ok">'+ICON.check+'Aucun drapeau</span>'}</div></section>
  <div class="v-scores">${sc.list.map(s=>scoreCard(s,editable)).join('')}</div>
  <section class="v-card v-meds"><header class="v-card-head"><div><h4>Traitements au long cours : consignes datées</h4><p>${cons.surgeryDate?'Intervention le '+esc(fmtD(cons.surgeryDate)):'<b class="v-warn-t">Date opératoire à renseigner</b> dans la consultation pour calculer les dates'} · risque hémorragique ${esc(cons.bleedingRisk||'non renseigné')}</p></div>
   <span class="v-level ${valid?'v-ok':'v-warn'}">${valid?ICON.check+'Validées par '+esc(a.consignes.validatedBy)+' · '+esc(fmtDT(valid)):ICON.alert+'Proposition à valider'}</span></header>
   ${items.length?`<table class="v-table"><thead><tr><th>Traitement</th><th>Consigne au patient</th><th>Référence</th></tr></thead><tbody>${items.map((it,i)=>`<tr class="v-kind-${it.kind}"><td><b>${esc(it.label)}</b><small>${esc(it.classe)} · ${({stop:'Arrêt',morning:'Pas le matin',continue:'Poursuite',discuss:'À décider'})[it.kind]}</small></td><td>${editable&&!valid?`<textarea data-med="${i}" rows="2">${esc(it.text)}</textarea>`:`<p>${esc(it.text)}</p>`}${it.assumption?`<small class="v-warn-t">${esc(it.assumption)}</small>`:''}<small>${esc(it.note)}</small></td><td><cite>${esc(it.ref)}</cite></td></tr>`).join('')}</tbody></table>`:'<p class="v-empty">Aucun anticoagulant, antiagrégant, antidiabétique ou antihypertenseur repéré dans les traitements déclarés.</p>'}
   <div class="v-actions">${editable&&items.length?(valid?'<button type="button" class="secondary" id="v-unvalidate">Modifier les consignes</button>':'<button type="button" class="primary" id="v-validate">Valider les consignes</button>'):''}${items.length?'<button type="button" class="secondary" id="v-print">Imprimer la fiche patient</button>':''}</div></section>
  ${completudeHTML(stay)}
  </div>`;
  if(!editable)return;
  content.querySelectorAll('[data-input]').forEach(b=>b.onclick=()=>{const k=b.dataset.input,v=b.dataset.val==='true';a.inputs[k]=a.inputs[k]===v?null:v;if(a.inputs[k]==null)delete a.inputs[k];panelAide()});
  $('#v-report')&&($('#v-report').onclick=()=>{
   const c=stay.consult;c.ext??={};const get=id=>sc.list.find(s=>s.id===id);
   c.ext.stopBangReview=R.resumeScore(get('stopbang'));c.ext.leeReview=R.resumeScore(get('lee'));c.ext.apfelReview=R.resumeScore(get('apfel'));
   const hs=get('hemstop');if(hs.value!=null){c.ext.hemstopDone='Oui';c.ext.hemstopReview=R.resumeScore(hs)}
   if(c.ext.mallampati&&!c.ext.intubationRisk)c.ext.intubationRisk=R.resumeScore(get('airway'));
   if(valid&&items.length){const t=items.map(i=>`${i.label} : ${i.text}`).join('\n');const anti=items.filter(i=>/Anticoag|Antiagr/.test(i.classe)),dia=items.filter(i=>i.classe==='Antidiabétique');
    if(anti.length&&!String(c.ext.antithromboticPlan||'').trim())c.ext.antithromboticPlan=anti.map(i=>`${i.label} : ${i.text}`).join('\n');
    if(dia.length&&!String(c.ext.diabetesPlan||'').trim())c.ext.diabetesPlan=dia.map(i=>`${i.label} : ${i.text}`).join('\n');
    if(!String(c.ext.medicationInstructions||'').trim())c.ext.medicationInstructions=t;}
   trace(stay,'Scores reportés dans la consultation (STOP-Bang, Lee, Apfel'+(hs.value!=null?', HEMSTOP':'')+')','Aide à la consultation');
   toast('Scores reportés dans la consultation · à relire avant validation');panelAide();
  });
  $('#v-validate')&&($('#v-validate').onclick=()=>{
   const edited=items.map((it,i)=>({...it,text:content.querySelector(`[data-med="${i}"]`)?.value.trim()||it.text}));
   a.consignes={items:edited,validatedAt:new Date().toISOString(),validatedBy:who(),surgeryDate:cons.surgeryDate};
   trace(stay,'Consignes sur les traitements validées ('+edited.length+')','Aide à la consultation');toast('Consignes validées');panelAide();
  });
  $('#v-unvalidate')&&($('#v-unvalidate').onclick=()=>{a.consignes={...a.consignes,validatedAt:null,previous:a.consignes.validatedAt};trace(stay,'Consignes sur les traitements rouvertes pour modification','Aide à la consultation');panelAide()});
  bindPrint(stay,items);
 }
 function bindPrint(stay,items){const b=$('#v-print');if(!b)return;b.onclick=()=>{
  const id=stay.identity||{},w=window.open('','_blank','noopener');const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Consignes avant votre intervention</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:32px;color:#0C1A25}h1{font-size:22px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #C3CDD6;padding:8px;text-align:left;vertical-align:top}th{background:#EDF1F5}.m{color:#4C5D6C}</style><h1>Consignes sur vos médicaments avant l’intervention</h1><p class="m">${esc([String(id.lastName||'').toUpperCase(),id.firstName].filter(Boolean).join(' '))} · ${esc(stay.id)}${stay.aideCpa?.consignes?.surgeryDate?' · intervention le '+esc(fmtD(stay.aideCpa.consignes.surgeryDate)):''}</p><table><tr><th>Médicament</th><th>Ce que vous devez faire</th></tr>${items.map(i=>`<tr><td>${esc(i.label)}</td><td>${esc(i.text)}</td></tr>`).join('')}</table><p class="m">${stay.aideCpa?.consignes?.validatedAt?'Consignes validées par '+esc(stay.aideCpa.consignes.validatedBy)+'.':'Document de travail non validé.'} En cas de doute, appelez la clinique. N’arrêtez jamais un traitement sans consigne écrite.</p>`;
  if(w){w.document.write(html);w.document.close();w.focus();w.print()}else toast('Autorisez les fenêtres pour imprimer.');
 }}

 /* ================= Check-list HAS ================= */
 function panelChecklist(){
  const stay=current();stay.checklistBloc=stay.checklistBloc&&typeof stay.checklistBloc==='object'?stay.checklistBloc:{};const data=stay.checklistBloc,editable=can('checklistBloc');
  const etats=R.etatChecklist(data),nogo=etats.some(e=>e.nogo),done=etats.filter(e=>e.signed).length;
  $('#content').innerHTML=`<div class="v-wrap"><header class="v-head"><div><p class="v-kicker">Check-list « Sécurité du patient au bloc opératoire » · HAS 2018</p><h3>Trois temps de pause, horodatés et signés</h3><p class="v-sub">Une réponse « Non » déclenche une décision <b>NO GO</b> tant qu’elle n’est pas résolue. Exigée pour la certification de l’établissement.</p></div><span class="v-go ${nogo?'v-crit':done===3?'v-ok':'v-warn'}">${nogo?ICON.alert+'NO GO':done===3?ICON.check+'Check-list complète':ICON.dot+done+' / 3 temps signés'}</span></header>
  <div class="v-has">${R.CHECKLIST_HAS.map((t,ti)=>{const d=data[t.id]||{},e=etats[ti],locked=e.signed;return `<section class="v-card v-temps ${e.nogo?'is-nogo':e.signed?'is-signed':''}"><header class="v-card-head"><div><span class="v-num">${ti+1}</span><h4>${esc(t.label)}</h4><p>${esc(t.sub)}</p></div>${e.signed?`<span class="v-level v-ok">${ICON.check}Signé · ${esc(d.signedBy)} · ${esc(fmtDT(d.signedAt))}</span>`:''}</header>
   <ol class="v-has-items">${t.items.map(([k,label])=>{const v=d.answers?.[k]||'';return `<li><span>${esc(label)}</span><span class="v-seg" role="radiogroup" aria-label="${esc(label)}">${['Oui','Non','N/A'].map(o=>`<button type="button" role="radio" aria-checked="${v===o}" class="${v===o?'on '+(o==='Non'?'no':o==='Oui'?'yes':'na'):''}" data-t="${t.id}" data-k="${k}" data-v="${o}" ${locked||!editable?'disabled':''}>${o}</button>`).join('')}</span></li>`}).join('')}</ol>
   ${editable?`<div class="v-actions">${e.signed?`<button type="button" class="secondary" data-unsign="${t.id}">Rouvrir ce temps</button>`:`<button type="button" class="primary" data-sign="${t.id}" ${!e.complete?'disabled':''}>Signer « ${esc(t.label.toLowerCase())} »</button>${!e.complete?'<small>Répondez à tous les items pour signer.</small>':''}`}</div>`:''}</section>`}).join('')}</div></div>`;
  if(!editable)return;
  document.querySelectorAll('.v-seg button').forEach(b=>b.onclick=()=>{const t=b.dataset.t;data[t]??={answers:{}};data[t].answers??={};data[t].answers[b.dataset.k]=data[t].answers[b.dataset.k]===b.dataset.v?'':b.dataset.v;panelChecklist()});
  document.querySelectorAll('[data-sign]').forEach(b=>b.onclick=()=>{const t=b.dataset.sign,e=R.etatChecklist(data).find(x=>x.id===t);Object.assign(data[t],{signedBy:who(),signedAt:new Date().toISOString(),decision:e.nogo?'NO GO':'GO'});trace(stay,'Check-list HAS · '+R.CHECKLIST_HAS.find(x=>x.id===t).label+' signée'+(e.nogo?' · NO GO':''),'Bloc');toast(e.nogo?'Temps signé avec décision NO GO':'Temps de pause signé');panelChecklist()});
  document.querySelectorAll('[data-unsign]').forEach(b=>b.onclick=()=>{const t=b.dataset.unsign;data[t].history=[...(data[t].history||[]),{signedBy:data[t].signedBy,signedAt:data[t].signedAt,reopenedBy:who(),reopenedAt:new Date().toISOString()}];delete data[t].signedBy;delete data[t].signedAt;trace(stay,'Check-list HAS · temps rouvert','Bloc');panelChecklist()});
 }

 /* ================= Suivi ambulatoire J-1 / J+1 ================= */
 function suivi(stay){stay.suiviAmbu=stay.suiviAmbu&&typeof stay.suiviAmbu==='object'?stay.suiviAmbu:{};stay.suiviAmbu.appels??=[];stay.suiviAmbu.envois??=[];return stay.suiviAmbu}
 function openAlerts(stay){const s=stay.suiviAmbu;if(!s?.appels?.length)return [];const last=s.appels[s.appels.length-1];return last.alerts?.length&&!last.handled?last.alerts:[]}
 async function sendSms(stay,kind,button){
  button.disabled=true;
  try{const r=await fetch('/api/workspace/suivi/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stay:stay.id,kind})});const d=await r.json().catch(()=>({}));
   const s=suivi(stay);s.envois.push({kind,at:new Date().toISOString(),by:who(),sent:!!d.sent,detail:d.sent?('SMS envoyé à '+d.to):(d.error||'Envoi impossible')});
   trace(stay,'Suivi '+kind.toUpperCase()+' : '+(d.sent?'SMS envoyé':'SMS non envoyé ('+(d.error||'erreur')+')'),'Suivi ambulatoire');toast(d.sent?'SMS envoyé':'SMS non envoyé : '+(d.error||'erreur'));
  }catch{toast('Envoi impossible : serveur injoignable.')}
  panelSuivi();
 }
 function panelSuivi(){
  const stay=current(),s=suivi(stay),editable=can('suiviAmbu'),q=R.QUESTIONS_J1;
  const last=s.appels[s.appels.length-1],alerts=openAlerts(stay);
  $('#content').innerHTML=`<div class="v-wrap"><header class="v-head"><div><p class="v-kicker">Suivi ambulatoire · inspiré du suivi SMS conversationnel</p><h3>Appel de la veille et du lendemain</h3><p class="v-sub">SMS sans information médicale envoyés via Brevo, appel du lendemain tracé, alertes selon des seuils réglés par l’équipe (douleur ≥ ${R.SEUILS_J1.douleur}/10, fièvre ≥ ${String(R.SEUILS_J1.temperature).replace('.',',')} °C, saignement, dyspnée, mollet, rétention).</p></div>${alerts.length?`<span class="v-go v-crit">${ICON.alert}${alerts.length} alerte${alerts.length>1?'s':''} à traiter</span>`:''}</header>
  <div class="v-two">
   <section class="v-card"><header class="v-card-head"><div><h4>SMS automatiques</h4><p>Contenu : nom de l’établissement et rappel générique. Aucune donnée de santé.</p></div></header>
    <div class="v-sms"><div><b>J-1 · Rappel de venue</b><small>« Rappel de votre venue prévue demain. Respectez les consignes de jeûne et l’heure d’arrivée qui vous ont été remises. »</small></div>${editable?`<button type="button" class="secondary" data-sms="j-1">${ICON.send}Envoyer</button>`:''}</div>
    <div class="v-sms"><div><b>J+1 · Annonce de l’appel</b><small>« Un membre de l’équipe va vous appeler aujourd’hui pour prendre de vos nouvelles. En cas d’urgence, appelez le 15. »</small></div>${editable?`<button type="button" class="secondary" data-sms="j+1">${ICON.send}Envoyer</button>`:''}</div>
    <ul class="v-log">${s.envois.slice(-4).reverse().map(e=>`<li class="${e.sent?'is-ok':'is-ko'}">${e.sent?ICON.check:ICON.alert}<span>${esc(e.kind.toUpperCase())} · ${esc(fmtDT(e.at))} · ${esc(e.detail)}</span></li>`).join('')||'<li class="is-na">Aucun SMS envoyé pour ce séjour.</li>'}</ul></section>
   <section class="v-card"><header class="v-card-head"><div><h4>${ICON.phone} Appel J+1</h4><p>${last?'Dernier appel '+esc(fmtDT(last.at))+' par '+esc(last.by):'Aucun appel tracé'}</p></div></header>
    ${editable?`<form id="v-j1" class="v-form">${q.map(([k,label,type])=>type==='number'?`<label><span>${esc(label)}</span><input name="${k}" type="number" step="${k==='temperature'?'0.1':'1'}" min="0" max="${k==='temperature'?'43':'10'}" inputmode="decimal"></label>`:`<fieldset><legend>${esc(label)}</legend><span class="v-seg">${['Oui','Non'].map(o=>`<label><input type="radio" name="${k}" value="${o}"><span>${o}</span></label>`).join('')}</span></fieldset>`).join('')}
     <label class="v-wide"><span>Commentaire</span><textarea name="note" rows="2"></textarea></label>
     <label class="v-wide v-inline"><input type="checkbox" name="noanswer"> Patient injoignable (nouvelle tentative à prévoir)</label>
     <div class="v-actions v-wide"><button class="primary">Enregistrer l’appel</button></div></form>`:''}
   </section></div>
  <section class="v-card"><header class="v-card-head"><div><h4>Historique des appels</h4></div></header>
   ${s.appels.length?`<table class="v-table"><thead><tr><th>Date</th><th>Soignant</th><th>Réponses</th><th>Alertes</th><th></th></tr></thead><tbody>${s.appels.slice().reverse().map((c,ri)=>{const i=s.appels.length-1-ri;return `<tr><td class="v-mono">${esc(fmtDT(c.at))}</td><td>${esc(c.by)}</td><td>${c.noanswer?'Injoignable':esc(q.filter(([k])=>c.answers?.[k]).map(([k,l])=>l.split(' (')[0]+' : '+c.answers[k]).join(' · '))}${c.note?`<small>${esc(c.note)}</small>`:''}</td><td>${c.alerts?.length?c.alerts.map(a=>`<span class="v-flag v-${a.level}">${ICON.alert}${esc(a.label)}</span>`).join(''):'<span class="v-flag v-ok">'+ICON.check+'Aucune</span>'}</td><td>${c.alerts?.length?(c.handled?`<small>Traitée par ${esc(c.handled.by)} · ${esc(c.handled.action)}</small>`:editable?`<button type="button" class="secondary" data-handle="${i}">Tracer le rappel médecin</button>`:''):''}</td></tr>`}).join('')}</tbody></table>`:'<p class="v-empty">Aucun appel.</p>'}</section></div>`;
  if(!editable)return;
  document.querySelectorAll('[data-sms]').forEach(b=>b.onclick=()=>sendSms(stay,b.dataset.sms,b));
  $('#v-j1').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),answers={};for(const [k] of q){const v=f.get(k);if(v!==null&&v!=='')answers[k]=String(v)}
   const noanswer=f.get('noanswer')==='on';if(!noanswer&&!Object.keys(answers).length){toast('Renseignez au moins une réponse ou cochez « injoignable ».');return}
   const alerts=noanswer?[{level:'warn',label:'Patient injoignable'}]:R.alertesJ1(answers);
   s.appels.push({at:new Date().toISOString(),by:who(),answers,note:String(f.get('note')||'').trim(),noanswer,alerts});
   trace(stay,'Appel J+1 tracé'+(alerts.length?' · '+alerts.length+' alerte(s)':''),'Suivi ambulatoire');toast(alerts.length?'Appel enregistré · alerte transmise à la tour de contrôle':'Appel enregistré · aucune alerte');panelSuivi()};
  document.querySelectorAll('[data-handle]').forEach(b=>b.onclick=()=>{const c=s.appels[Number(b.dataset.handle)];const action=prompt('Action réalisée (rappel par le médecin, consultation, retour aux urgences…)','Patient rappelé par l’anesthésiste');if(!action)return;c.handled={by:who(),at:new Date().toISOString(),action:action.slice(0,300)};trace(stay,'Alerte J+1 traitée : '+c.handled.action,'Suivi ambulatoire');panelSuivi()});
 }

 /* ================= Lettre de liaison : DMP + MSSanté (simulation) ================= */
 function liaisonEnvoi(){
  const stay=current(),content=$('#content');if(!content||content.querySelector('.v-interop'))return;
  const st=identity(stay),pre=R.envoiLiaisonPossible(stay,st),sent=Array.isArray(stay.envoisInterop)?stay.envoisInterop:[],editable=can('envoisInterop')&&isDoctor();
  content.insertAdjacentHTML('beforeend',`<section class="v-card v-interop"><header class="v-card-head"><div><p class="v-kicker">Ségur · obligation à la sortie</p><h4>Envoyer la lettre de liaison</h4><p>Dépôt dans le DMP (Mon espace santé) et envoi par MSSanté au médecin traitant et au patient.</p></div><span class="v-sim">Simulation · homologation ANS requise</span></header>
   <ul class="v-checklist">${[['Lettre relue et enregistrée',!!stay.discharge?.liaison?.document],['Identité INS qualifiée',/qualifi/i.test(st)],['Connecteur DMP (LPS homologué)',false],['Boîte MSSanté de l’établissement',false]].map(([l,ok],i)=>`<li class="${ok?'is-ok':i>1?'is-na':'is-block'}"><span class="v-ic">${ok?ICON.check:i>1?ICON.dot:ICON.alert}</span><span><b>${l}</b>${i>1?'<small>En attente de référencement Ségur : réponse simulée</small>':''}</span></li>`).join('')}</ul>
   ${pre.ok?'':`<p class="v-warn-t">${pre.reasons.map(esc).join(' ')}</p>`}
   ${editable?`<div class="v-actions"><label class="v-inline"><input type="checkbox" id="v-dmp" checked> DMP</label><label class="v-inline"><input type="checkbox" id="v-mss-mt" checked> MSSanté médecin traitant</label><label class="v-inline"><input type="checkbox" id="v-mss-pat" checked> Messagerie de Mon espace santé</label><button type="button" class="primary" id="v-send-liaison" ${stay.discharge?.liaison?.document?'':'disabled'}>${ICON.send}Simuler l’envoi</button></div>`:''}
   <ul class="v-log">${sent.slice().reverse().map(e=>`<li class="is-ok">${ICON.check}<span>${esc(fmtDT(e.at))} · ${esc(e.targets.join(', '))} · réf. ${esc(e.refs.join(' / '))} · ${esc(e.by)}${e.identity!=='Qualifiée'?' · identité '+esc(e.identity):''}</span></li>`).join('')||'<li class="is-na">Aucun envoi.</li>'}</ul></section>`);
  const b=$('#v-send-liaison');if(!b)return;
  b.onclick=async()=>{const targets=[['dmp','v-dmp','DMP'],['mssante-mt','v-mss-mt','MSSanté médecin traitant'],['mssante-patient','v-mss-pat','Messagerie Mon espace santé']].filter(([,id])=>$('#'+id).checked);if(!targets.length)return;b.disabled=true;
   try{const r=await fetch('/api/workspace/interop/liaison',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stay:stay.id,targets:targets.map(t=>t[0]),identity:st})});const d=await r.json();if(!r.ok)throw Error(d.error||'Envoi refusé');
    stay.envoisInterop=[...sent,{at:d.at,by:who(),targets:targets.map(t=>t[2]),refs:d.results.map(x=>x.ref),mode:d.mode,identity:st||'inconnue'}];trace(stay,'Lettre de liaison envoyée (simulation) : '+targets.map(t=>t[2]).join(', '),'Interopérabilité');toast('Envoi simulé enregistré');content.querySelector('.v-interop').remove();liaisonEnvoi();
   }catch(e){toast(e.message);b.disabled=false}};
 }

 /* ================= Tour de contrôle ================= */
 function statut(stay){const s=stay.blocStatut;if(s?.state)return s.state;return {Consultation:'attendu',Préopératoire:'attendu',Intervention:'salle',SSPI:'sspi',Hospitalisation:'chambre',Sortie:'sorti'}[stay.stage]||'attendu'}
 function advance(stay,target){
  const prev=statut(stay);stay.blocStatut={...(stay.blocStatut||{}),state:target,history:[...(stay.blocStatut?.history||[]),{from:prev,to:target,at:new Date().toISOString(),by:who()}]};
  const stage={salle:'Intervention',sspi:'SSPI',chambre:'Hospitalisation',sorti:'Sortie'}[target];if(stage&&stages.includes(stage)&&stay.stage!==stage&&isDoctor())stay.stage=stage;
  trace(stay,'Tour de contrôle : '+R.STATUTS.find(s=>s.id===target).label,'Bloc');
 }
 function renderControle(){
  $('#title').textContent='Tour de contrôle';const nw=$('#new');if(nw)nw.hidden=true;const stats=$('#stats');if(stats)stats.hidden=true;
  document.body.classList.remove('j-home');document.body.classList.add('v-controle-on');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='controle'));
  const rows=patients.map(stay=>({stay,st:statut(stay),comp:R.completude(stay,stay.aideCpa,identity(stay)),chk:R.etatChecklist(stay.checklistBloc||{}),alerts:openAlerts(stay)}));
  const count=id=>rows.filter(r=>r.st===id).length,blocked=rows.filter(r=>!r.comp.ready&&['attendu','arrive','prepare'].includes(r.st)),alertRows=rows.filter(r=>r.alerts.length);
  const canMove=['anesthesiste','chirurgien','infirmier'].includes(job())||!job();
  $('#workspace').innerHTML=`<div class="v-wrap v-tower">
   <header class="v-head"><div><p class="v-kicker">${ICON.tower} Temps réel · mise à jour en un clic</p><h3>Où en est chaque patient du jour</h3><p class="v-sub">Bloc, service et accueil voient le même tableau. Les dossiers incomplets sont signalés avant l’entrée au bloc ; les alertes du suivi J+1 remontent ici.</p></div></header>
   <div class="v-flow">${R.STATUTS.map(s=>`<div class="v-flow-step${count(s.id)?' has':''}"><strong>${count(s.id)}</strong><span>${s.label}</span></div>`).join('')}</div>
   ${blocked.length||alertRows.length?`<div class="v-two">${blocked.length?`<section class="v-card v-alertbox"><header class="v-card-head"><div><h4>${ICON.lock} Dossiers incomplets avant bloc</h4><p>${blocked.length} patient${blocked.length>1?'s':''}</p></div></header><ul>${blocked.map(r=>`<li><button type="button" class="v-link" data-open="${esc(r.stay.id)}" data-tab="aideCpa">${esc(name(r.stay))}</button><small>${r.comp.blocking.map(i=>esc(i.label)).join(' · ')}</small></li>`).join('')}</ul></section>`:''}${alertRows.length?`<section class="v-card v-alertbox is-crit"><header class="v-card-head"><div><h4>${ICON.phone} Alertes du suivi J+1</h4><p>${alertRows.length} patient${alertRows.length>1?'s':''} à rappeler</p></div></header><ul>${alertRows.map(r=>`<li><button type="button" class="v-link" data-open="${esc(r.stay.id)}" data-tab="suiviJ1">${esc(name(r.stay))}</button><small>${r.alerts.map(a=>esc(a.label)).join(' · ')}</small></li>`).join('')}</ul></section>`:''}</div>`:''}
   <section class="v-card v-board"><table class="v-table v-tower-table"><thead><tr><th>Patient</th><th>Intervention</th><th>Dossier</th><th>Check-list HAS</th><th>Statut</th><th><span class="v-sr">Action</span></th></tr></thead><tbody>
   ${rows.map(r=>{const next=R.statutSuivant(r.st),i=R.STATUTS.findIndex(s=>s.id===r.st);const surg=r.stay.surgicalAnnouncement?.published?.fields||{},op=surg.procedure||r.stay.consult?.ext?.operation||r.stay.specialty;
    return `<tr class="${r.alerts.length?'is-alert':''}"><td><button type="button" class="v-link" data-open="${esc(r.stay.id)}">${esc(name(r.stay))}</button><small class="v-mono">${esc(r.stay.id)} · ${esc(r.stay.mode)}</small></td><td>${esc(op)}<small>${esc(r.stay.specialty)}</small></td>
    <td><span class="v-level ${r.comp.ready?'v-ok':'v-crit'}">${r.comp.ready?ICON.check+'Complet':ICON.lock+'Bloqué'}</span><small>${r.comp.done}/${r.comp.total} éléments</small></td>
    <td>${r.chk.some(c=>c.nogo)?`<span class="v-level v-crit">${ICON.alert}NO GO</span>`:`<span class="v-dots" aria-label="${r.chk.filter(c=>c.signed).length} temps signés sur 3">${r.chk.map(c=>`<i class="${c.signed?'on':''}"></i>`).join('')}</span>`}</td>
    <td><ol class="v-track" aria-label="Statut : ${esc(R.STATUTS[i].label)}">${R.STATUTS.map((s,k)=>`<li class="${k<i?'done':k===i?'now':''}" title="${esc(s.label)}"></li>`).join('')}</ol><b class="v-state">${esc(R.STATUTS[i].label)}</b>${r.stay.blocStatut?.history?.length?`<small class="v-mono">${esc(fmtDT(r.stay.blocStatut.history.at(-1).at))}</small>`:''}</td>
    <td>${canMove&&r.st!=='sorti'?`<button type="button" class="v-next" data-next="${esc(r.stay.id)}" data-to="${next.id}" ${!r.comp.ready&&r.st==='prepare'?'data-blocked="1"':''}>${esc(next.label)} ${ICON.arrow}</button>`:''}</td></tr>`}).join('')}
   </tbody></table></section></div>`;
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{document.body.classList.remove('v-controle-on');ctx.open(b.dataset.open,b.dataset.tab||'consult')});
  document.querySelectorAll('[data-next]').forEach(b=>b.onclick=()=>{const stay=patients.find(x=>x.id===b.dataset.next);if(!stay)return;
   if(b.dataset.blocked){const comp=R.completude(stay,stay.aideCpa,identity(stay));const motif=prompt('Dossier incomplet : '+comp.blocking.map(i=>i.label).join(', ')+'.\nMotif pour passer outre (obligatoire) :','');if(!motif||motif.trim().length<5){toast('Entrée au bloc non enregistrée : motif requis.');return}aide(stay).overrides=[...(aide(stay).overrides||[]),{at:new Date().toISOString(),by:who(),motif:motif.trim().slice(0,300),missing:comp.blocking.map(i=>i.id)}];trace(stay,'Entrée au bloc malgré dossier incomplet · motif : '+motif.trim(),'Bloc')}
   advance(stay,b.dataset.to);renderControle();});
 }
 function name(stay){const id=stay.identity||{};return id.lastName?`${String(id.lastName).toUpperCase()} ${id.firstName||''}`.trim():stay.id}

 /* ================= Branchements dans le dossier ================= */
 function detailHook(tab){
  const stay=current();if(!stay)return;
  // Pastille de complétude dans le bandeau patient.
  const chips=document.querySelector('#detail .pb-chips');
  if(chips&&!chips.querySelector('.v-chip')){const c=R.completude(stay,stay.aideCpa,identity(stay));const al=openAlerts(stay);
   chips.insertAdjacentHTML('beforeend',`<button type="button" class="pb-chip v-chip ${c.ready?'pb-ok':'pb-crit'}" data-v-goto="aideCpa">${c.ready?ICON.check:ICON.lock}${c.ready?'Dossier complet':'Programmation bloquée · '+c.blocking.length}</button>${al.length?`<button type="button" class="pb-chip v-chip pb-crit" data-v-goto="suiviJ1">${ICON.phone}Alerte J+1</button>`:''}`);
   chips.querySelectorAll('[data-v-goto]').forEach(b=>b.onclick=()=>ctx.goTab(b.dataset.vGoto));}
  if(tab==='dischargeLiaison')liaisonEnvoi();
  // Blocage de programmation : passage à l'étape « Intervention » avec dossier incomplet.
  const sel=$('#stage-status');
  if(sel&&!sel.dataset.vHooked){sel.dataset.vHooked='1';sel.addEventListener('change',e=>{if(sel.value!=='Intervention')return;const c=R.completude(stay,stay.aideCpa,identity(stay));if(c.ready)return;
   const motif=prompt('Programmation bloquée : '+c.blocking.map(i=>i.label).join(', ')+'.\nMotif pour passer outre (obligatoire) :','');
   if(!motif||motif.trim().length<5){e.stopImmediatePropagation();sel.value=stay.stage;toast('Étape non modifiée : dossier incomplet.');return}
   aide(stay).overrides=[...(aide(stay).overrides||[]),{at:new Date().toISOString(),by:who(),motif:motif.trim().slice(0,300),missing:c.blocking.map(i=>i.id)}];trace(stay,'Passage au bloc malgré dossier incomplet · motif : '+motif.trim(),'Bloc');},true);}
 }
 function panel(tab){({aideCpa:panelAide,checklistHas:panelChecklist,suiviJ1:panelSuivi})[tab]?.()}

 // Bouton de navigation « Tour de contrôle », juste après « Ma journée ».
 const home=document.querySelector('.nav[data-view="priorities"]');
 if(home&&!document.querySelector('.nav[data-view="controle"]')){const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='controle';b.innerHTML=ICON.tower+'Tour de contrôle';home.after(b);b.addEventListener('click',()=>ctx.setView('controle'));}

 return {panel,tabs:Object.keys(TABS),detail:detailHook,render:view=>{if(view!=='controle'){document.body.classList.remove('v-controle-on');return false}renderControle();return true}};
};
})();

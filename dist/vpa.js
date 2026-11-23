/* IASELO · visite pré-anesthésique (VPA).
   Nouvelle étape du dossier « Visite pré-anesthésique », entre la consultation et le peropératoire.
   L'anesthésiste qui ouvre le dossier avant l'intervention retrouve le rappel de la consultation, puis vérifie
   l'évolution, le jeûne, les consignes sur les traitements, les constantes du jour, les résultats, la préparation
   et le consentement ; il conclut (apte / plan modifié / report) et signe. L'infirmier peut saisir le recueil
   (jeûne, constantes, préparation) mais ni la conclusion ni la signature.
   Données : rubrique de séjour `vpa` = {draft, signed, history}. Règles : vpa-regles.js. */
(function(){
'use strict';
window.createVpa=function(ctx){
 const R=window.IaseloVpa,V=window.IaseloRegles,PP=window.IaseloPrescriptionsPreop,A=window.IaseloAmeliorations;if(!R)return null;
 const {$,esc,toast,dossierStages}=ctx,TAB='vpa',STAGE='vpa';
 const cur=()=>ctx.current(),job=()=>ctx.job()||'';
 const profile=()=>ctx.access?.()?.profile||null;
 const writable=()=>ctx.canWrite?ctx.canWrite('stay/'+(cur()?.id||'x')+'/vpa'):true;
 const isAnesth=()=>job()==='anesthesiste'||(!job()&&!['Infirmier','Chirurgien'].includes(ctx.role()));
 const isNurse=()=>job()==='infirmier'||(!job()&&ctx.role()==='Infirmier');
 const canEdit=()=>(isAnesth()||isNurse())&&writable();
 const canSign=()=>isAnesth()&&writable();
 const who=()=>profile()?.display_name||'Médecin anesthésiste';
 const ext=s=>s?.consult?.ext||{};
 const surgeryDate=s=>{const d=ext(s).surgeryDate||s?.surgicalAnnouncement?.published?.fields?.date||'';return R.isDate(d)?d:''};
 const surgeryTime=s=>R.isTime(ext(s).surgeryTime)?ext(s).surgeryTime:'';
 const intervention=s=>R.heureIntervention(surgeryDate(s),surgeryTime(s));
 const age=s=>{const e=Number(ext(s).age);if(Number.isFinite(e)&&e>0)return e;const b=s?.identity?.birthDate;return b?Math.floor((Date.now()-new Date(b+'T12:00:00'))/31557600000):null};
 const consentementSigne=s=>{const cs=s?.espacePatient?.consentement,r=cs?.recu;return !!r&&(r.mode!=='depot'||cs.verification?.conforme===true)};
 const trace=(s,text)=>{s.events=s.events||[];s.events.unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text,kind:'Visite pré-anesthésique'})};
 const fmt=iso=>iso?new Date(iso).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'';
 const fmtD=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}):'';
 const localNow=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
 const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 const I={
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  print:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  stetho:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/></svg>'
 };

 // Nouvelle étape du dossier, entre la consultation et le peropératoire.
 if(!dossierStages.some(g=>g.id===STAGE)){const i=dossierStages.findIndex(g=>g.id==='peroperatoire');dossierStages.splice(i<0?dossierStages.length:i,0,{id:STAGE,label:'Visite pré-anesthésique',hint:'Dans les heures précédant l’intervention',defaultTab:TAB,items:[[TAB,'Visite pré-anesthésique']]})}

 /* ---------- Données ---------- */
 function proposerTraitements(s){
  let items=[];try{items=(V?.consignes?V.consignes(s).items:[]).filter(i=>i.kind!=='continue')}catch{}
  const relu=s.aideCpa?.consignes?.validatedAt&&Array.isArray(s.aideCpa.consignes.items)?s.aideCpa.consignes.items:null;
  return items.map(i=>({id:i.id,label:i.label,consigne:(relu?.find(r=>r.id===i.id)?.text)||i.text||'',kind:i.kind==='stop'?'stop':i.kind,statut:''}));
 }
 function proposerResultats(s){
  const pp=s.prescriptionsPreop?.draft,ids=Array.isArray(pp?.bilans?.ids)?pp.bilans.ids:[],out=ids.map(id=>({id,label:PP?.BILAN?.[id]?.label||id,statut:''}));
  if(pp?.bilans?.autres)out.push({id:'autres',label:String(pp.bilans.autres).split('\n')[0].slice(0,120),statut:''});
  const pend=String(ext(s).pendingTests||'').trim();if(pend)out.push({id:'attente',label:'En attente à la consultation : '+pend.slice(0,120),statut:''});
  return out;
 }
 function data(s){
  if(!s.vpa||typeof s.vpa!=='object'||Array.isArray(s.vpa)){
   // Reprise d'une VPA saisie dans l'ancien onglet « Bilans guidés & VPA » (periopPlus.vpa).
   const old=s.periopPlus?.vpa||{};
   const d=R.normaliser({jeune:{solides:old.solides,liquides:old.liquides},consentement:old.consentement,traitementsMatin:old.traitements,evolution:old.note||''});
   if(old.changement==='Non')for(const [k] of R.QUESTIONS)if(k!=='grossesse')d.questions[k]='Non';
   d.traitements=proposerTraitements(s);d.resultats=proposerResultats(s);
   s.vpa={draft:d,signed:null,history:[]};
  }
  const x=s.vpa;x.draft=R.normaliser(x.draft);x.history=Array.isArray(x.history)?x.history:[];return x;
 }
 const contexte=s=>({intervention:intervention(s),age:age(s),ambulatoire:s.mode==='Ambulatoire'||ext(s).careSetting==='Ambulatoire',consentementSigne:consentementSigne(s),consultDate:ext(s).consultDate||'',urgence:ext(s).urgency==='Urgente'});

 /* ---------- Rappel de la consultation ---------- */
 function rappel(s){
  const e=ext(s),c=s.consult||{},al=String(c.allergies??e.allergies??'').trim(),la=A?.lireAllergies?A.lireAllergies(al):null;
  const item=(label,value,cls='')=>value?`<div class="vpa-fact ${cls}"><dt>${label}</dt><dd>${esc(value)}</dd></div>`:'';
  const airway=[e.mallampati?'Mallampati '+e.mallampati:'',e.mouthOpening?'ouverture '+e.mouthOpening+' cm':'',e.airwayConclusion].filter(Boolean).join(' · ');
  const intv=[e.operation||s.surgicalAnnouncement?.published?.fields?.procedure||s.specialty,e.laterality&&e.laterality!=='Non applicable'?e.laterality:''].filter(Boolean).join(' · ');
  return `<section class="v-card vpa-rappel"><header class="v-card-head"><div><h4>Rappel de la consultation</h4><p>${c.validated?'Consultation validée':'Consultation non validée'}${e.consultDate?' le '+esc(new Date(e.consultDate+'T12:00:00').toLocaleDateString('fr-FR')):''}${e.author?' par '+esc(e.author):''}</p></div>${e.asa?`<span class="v-level ${['I','II'].includes(e.asa)?'v-ok':'v-warn'}">ASA ${esc(e.asa)}${e.emergencyASA==='Oui'?' E':''}</span>`:''}</header>
   <dl class="vpa-facts">
    ${item('Intervention',intv)}
    ${item('Allergies',al||'Non renseignées',la?.statut==='connue'?'is-crit':la?.statut==='aucune'?'':'is-warn')}
    ${item('Technique prévue',e.technique)}
    ${item('Voies aériennes',airway)}
    ${item('Antithrombotiques',e.antithromboticPlan)}
    ${item('Diabète',e.diabetesPlan)}
    ${item('Points majeurs pour le bloc',e.criticalPoints,'is-wide')}
    ${item('À vérifier à la VPA',e.preanestheticVisit,'is-wide is-acc')}
    ${item('Réserves de la consultation',e.decisionReason,'is-wide')}
   </dl></section>`;
 }

 /* ---------- Formulaire ---------- */
 const radio=(name,options,value)=>`<span class="v-seg" role="radiogroup">${options.map(([v,l])=>`<label><input type="radio" name="${esc(name)}" value="${esc(v)}" ${value===v?'checked':''}><span>${esc(l)}</span></label>`).join('')}</span>`;
 const yn=(name,value)=>radio(name,[['Non','Non'],['Oui','Oui']],value);
 const num=(label,name,value,unit,attrs='')=>`<label><span>${label}${unit?` <small>(${unit})</small>`:''}</span><input type="number" inputmode="decimal" name="${name}" value="${value??''}" ${attrs}></label>`;
 const dt=(label,name,value,now=true)=>`<label><span>${label}</span><span class="vpa-dt"><input type="datetime-local" name="${name}" value="${esc(value||'')}">${now?`<button type="button" class="secondary vpa-now" data-now="${name}">Maintenant</button>`:''}</span></label>`;
 const card=(id,title,sub,body,right='')=>`<section class="v-card vpa-sec" id="vpa-${id}"><header class="v-card-head"><div><h4>${title}</h4>${sub?`<p>${sub}</p>`:''}</div>${right}</header>${body}</section>`;

 function formHTML(s,x){
  const d=x.draft,cx=contexte(s),femme=ext(s).sex==='Femme'||s.identity?.sex==='F',a=cx.age;
  const questions=R.QUESTIONS.filter(([k])=>k!=='grossesse'||(femme&&(a==null||(a>=12&&a<=55))));
  const visite=card('visite','Visite','Heure, lieu et identité du patient.',`<div class="v-form">
   ${dt('Date et heure de la visite','at',d.at)}
   <label><span>Lieu</span><select name="lieu"><option value=""></option>${R.LIEUX.map(l=>`<option ${d.lieu===l?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
   <div class="vpa-ticks v-wide"><label class="vpa-tick"><input type="checkbox" name="identite.verifiee" ${d.identite.verifiee?'checked':''}><span>Identité vérifiée avec le patient (nom, prénom, date de naissance)</span></label><label class="vpa-tick"><input type="checkbox" name="identite.bracelet" ${d.identite.bracelet?'checked':''}><span>Bracelet d’identification en place et conforme</span></label></div>
   ${ctx.identityStatus?`<p class="v-foot v-wide">Identitovigilance : ${esc(ctx.identityStatus(s)||'statut inconnu')}</p>`:''}</div>`);
  const evol=card('evolution','Évolution depuis la consultation','Interrogatoire du patient ce jour.',`<ul class="vpa-q">${questions.map(([k,l])=>`<li><span>${esc(l)}</span>${yn('q.'+k,d.questions[k])}</li>`).join('')}</ul>
   <div class="v-form v-form-1"><label><span>Précisions</span><textarea name="evolution" rows="2" placeholder="Ex. rhinopharyngite il y a 10 jours, apyrétique depuis 5 jours">${esc(d.evolution)}</textarea></label></div>`);
  const jeune=card('jeune','Jeûne','Repères SFAR adulte : solides et lait 6 h, liquides clairs 2 h avant l’induction.',`<div class="v-form">
   ${dt('Dernière prise solide (ou lait, boisson non claire)','jeune.solides',d.jeune.solides,false)}
   ${dt('Dernière prise de liquide clair','jeune.liquides',d.jeune.liquides,false)}
   ${dt('Dernière cigarette ou vapotage (facultatif)','jeune.tabac',d.jeune.tabac,false)}</div><div id="vpa-jeune-etat"></div>`);
  const trt=card('traitements','Traitements et consignes','Consignes datées données en consultation (anticoagulants, antiagrégants, antidiabétiques…).',`${d.traitements.length?`<ul class="vpa-trt">${d.traitements.map((t,i)=>`<li data-trt="${i}"><div><b>${esc(t.label)}</b><small>${esc(t.consigne)}</small></div>${radio('trt.'+i,R.STATUTS_TRT.map(v=>[v,v==='Non vérifié'?'Non vérifié':v]),t.statut)}</li>`).join('')}</ul>`:'<p class="v-empty">Aucune consigne d’arrêt ou de suspension repérée dans le dossier.</p>'}
   <div class="vpa-line"><span>Traitements du matin pris conformément aux consignes</span>${radio('traitementsMatin',[['Oui','Oui'],['Non','Non']],d.traitementsMatin)}</div>
   ${canEdit()&&!x.signed?'<button type="button" class="secondary vpa-reload" id="vpa-reload-trt">Reprendre les consignes du dossier</button>':''}`);
  const ex=d.examen;
  const examen=card('examen','Examen du jour','Constantes à l’arrivée et réévaluation des voies aériennes.',`<div class="v-form vpa-vitals">
   ${num('PA systolique','examen.pas',ex.pas,'mmHg','min="40" max="300"')}${num('PA diastolique','examen.pad',ex.pad,'mmHg','min="20" max="200"')}${num('Fréquence cardiaque','examen.fc',ex.fc,'/min','min="20" max="250"')}${num('SpO₂','examen.spo2',ex.spo2,'%','min="50" max="100"')}
   ${num('Température','examen.temp',ex.temp,'°C','min="30" max="43" step="0.1"')}${num('Poids','examen.poids',ex.poids,'kg','min="1" max="350" step="0.1"')}${num('Glycémie capillaire','examen.glycemie',ex.glycemie,'g/L','min="0.1" max="8" step="0.01"')}</div>
   <div class="vpa-line"><span>Voies aériennes par rapport à la consultation</span>${radio('examen.voies',[['Inchangées','Inchangées'],['Modifiées','Modifiées']],ex.voies)}</div>
   <div class="v-form v-form-1"><label><span>Précisions voies aériennes</span><input name="examen.voiesNote" value="${esc(ex.voiesNote)}" placeholder="Ex. dent mobile 11, barbe, ouverture de bouche"></label><label><span>Examen clinique</span><textarea name="examen.clinique" rows="2" placeholder="Auscultation, état général, site d’ALR…">${esc(ex.clinique)}</textarea></label></div>`);
  const res=card('resultats','Résultats attendus','Examens prescrits en consultation et documents en attente.',`${d.resultats.length?`<ul class="vpa-trt">${d.resultats.map((r,i)=>`<li data-res="${i}"><div><b>${esc(r.label)}</b><input class="vpa-res-note" name="res.note.${i}" value="${esc(r.note)}" placeholder="Valeur ou commentaire"></div>${radio('res.'+i,R.STATUTS_RES.map(v=>[v,v]),r.statut)}</li>`).join('')}</ul>`:'<p class="v-empty">Aucun examen prescrit en consultation.</p>'}
   <div class="v-form"><label><span>Date de prélèvement des RAI</span><input type="date" name="rai.date" value="${esc(d.rai.date)}"></label><label class="vpa-tick vpa-tick-in"><input type="checkbox" name="rai.etendue" ${d.rai.etendue?'checked':''}><span>Ni transfusion, ni grossesse, ni greffe dans les 6 mois (validité 21 jours)</span></label>
   ${femme&&(a==null||(a>=12&&a<=55))?`<label><span>βHCG</span><select name="bhcg"><option value=""></option>${['Négatif','Positif','Non fait','Sans objet'].map(v=>`<option ${d.bhcg===v?'selected':''}>${v}</option>`).join('')}</select></label>`:''}</div>
   <div id="vpa-rai-etat"></div>`);
  const prepItems=R.PREPARATION.filter(([k])=>k!=='accompagnant'||cx.ambulatoire);
  const prep=card('preparation','Préparation','Recueil infirmier ou vérification par l’anesthésiste.',`<ul class="vpa-q">${prepItems.map(([k,l])=>`<li><span>${esc(l)}</span>${radio('prep.'+k,[['Fait','Fait'],['Non fait','Non fait'],['Sans objet','S.O.']],d.preparation[k])}</li>`).join('')}</ul>`);
  const cs=cx.consentementSigne;
  const cons=card('consentement','Information et consentement','',`<p class="${cs?'v-ok-t':'v-warn-t'}">${cs?I.check+' Consentement d’anesthésie signé reçu.':I.alert+' Consentement d’anesthésie signé non reçu (voir l’onglet Consentement d’anesthésie).'}</p>
   <div class="vpa-line"><span>Le patient confirme avoir compris l’information et maintient son accord</span>${radio('consentement',[['Oui','Oui'],['Non','Non']],d.consentement)}</div>`);
  const nurseLock=!canSign();
  const concl=card('conclusion','Conclusion de l’anesthésiste',nurseLock?'Réservée au médecin anesthésiste.':'Décision et consignes pour le bloc et la SSPI.',`<fieldset class="vpa-concl" ${nurseLock?'disabled':''}>
   <div class="vpa-decisions" role="radiogroup">${R.CONCLUSIONS.map(([v,l])=>`<label class="vpa-decision is-${v}"><input type="radio" name="decision" value="${v}" ${d.conclusion.decision===v?'checked':''}><span>${esc(l)}</span></label>`).join('')}</div>
   <div class="v-form v-form-1">
    <label class="vpa-if" data-if="modifie"><span>Modification du plan d’anesthésie</span><textarea name="modifications" rows="2" placeholder="Ex. ALR abandonnée (AOD pris hier soir) : AG avec IOT">${esc(d.conclusion.modifications)}</textarea></label>
    <label class="vpa-if" data-if="report"><span>Motif du report (obligatoire)</span><textarea name="motif" rows="2">${esc(d.conclusion.motif)}</textarea></label>
    <label><span>Consignes pour le bloc et la SSPI</span><textarea name="bloc" rows="2" placeholder="Ex. prémédication non donnée, glycémie à recontrôler à l’arrivée en salle">${esc(d.conclusion.bloc)}</textarea></label>
   </div><div id="vpa-acq"></div></fieldset>`);
  return visite+evol+jeune+trt+examen+res+prep+cons+concl;
 }
 function lire(form,prev){
  const f=new FormData(form),v=n=>f.get(n)??'',on=n=>!!form.querySelector(`[name="${n}"]`)?.checked;
  const d=prev,keep=(n,old)=>form.querySelector(`[name="${n}"]`)?v(n):old;
  const q={};for(const [k] of R.QUESTIONS)q[k]=keep('q.'+k,d.questions[k]);
  const prep={};for(const [k] of R.PREPARATION)prep[k]=form.querySelector(`[name="prep.${k}"]`)?v('prep.'+k):d.preparation[k];
  // Conclusion et alertes prises en compte : lues seulement si l'utilisateur peut conclure (sinon conservées telles quelles).
  const concEditable=!!form.querySelector('.vpa-concl:not([disabled])');
  const concl=concEditable?{decision:v('decision'),modifications:v('modifications'),motif:v('motif'),bloc:v('bloc')}:d.conclusion;
  const acq=concEditable&&form.querySelector('#vpa-acq textarea')?{acquittees:f.getAll('acq').map(String),motifAlertes:v('motifAlertes')}:{acquittees:d.acquittees,motifAlertes:d.motifAlertes};
  return R.normaliser({...d,at:v('at'),lieu:v('lieu'),identite:{verifiee:on('identite.verifiee'),bracelet:on('identite.bracelet')},questions:q,evolution:v('evolution'),
   jeune:{solides:v('jeune.solides'),liquides:v('jeune.liquides'),tabac:v('jeune.tabac'),note:d.jeune.note},
   traitements:d.traitements.map((t,i)=>({...t,statut:v('trt.'+i)||''})),traitementsMatin:v('traitementsMatin'),
   examen:Object.fromEntries(['pas','pad','fc','spo2','temp','poids','glycemie','voies','voiesNote','clinique'].map(k=>[k,v('examen.'+k)])),
   resultats:d.resultats.map((r,i)=>({...r,statut:v('res.'+i)||'',note:v('res.note.'+i)})),
   rai:{date:v('rai.date'),etendue:on('rai.etendue')},bhcg:form.querySelector('[name="bhcg"]')?v('bhcg'):d.bhcg,
   preparation:prep,consentement:v('consentement'),conclusion:concl,...acq});
 }

 /* ---------- Panneau latéral : alertes, contrôle, signature ---------- */
 function sideHTML(s,x){
  const d=x.draft,cx=contexte(s),chk=R.controler(d,cx),crit=chk.alertes.filter(a=>a.niveau==='crit'),warn=chk.alertes.filter(a=>a.niveau==='warn');
  const list=(arr,cls,icon)=>arr.map(a=>`<li class="${cls}">${icon}<span>${esc(a.texte)}</span></li>`).join('');
  return `<section class="v-card vpa-alerts"><header class="v-card-head"><div><h4>Points d’attention</h4><p>${crit.length?crit.length+' critique'+(crit.length>1?'s':''):'Aucun point critique'}${warn.length?' · '+warn.length+' à vérifier':''}</p></div></header>
   ${crit.length||warn.length?`<ul class="vpa-alist">${list(crit,'is-crit',I.alert)}${list(warn,'is-warn',I.alert)}</ul>`:`<p class="v-ok-t">${I.check} Rien à signaler à ce stade.</p>`}</section>
   <section class="v-card vpa-actions">
    ${x.signed?`<p class="vpa-signed ${x.signed.decision==='report'?'is-report':''}">${x.signed.decision==='report'?I.alert:I.check}<span>${x.signed.decision==='report'?'Report décidé':'Visite signée'} par <b>${esc(x.signed.name)}</b> le ${esc(fmt(x.signed.at))}<small>Version ${x.signed.version} · empreinte ${esc(String(x.signed.hash).slice(0,12))}…</small></span></p>`:
     chk.errors.length?`<div class="vpa-missing"><b>Avant de signer</b><ul>${chk.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>`:`<p class="v-ok-t">${I.check} Prête à être signée.</p>`}
    <div class="v-actions">${!x.signed&&canSign()?`<button type="button" class="primary" id="vpa-sign" ${chk.ok?'':'aria-disabled="true"'}>${I.check}Signer la visite</button>`:''}
     <button type="button" class="secondary" id="vpa-print-btn">${I.print}Imprimer</button>
     ${x.signed&&canSign()?'<button type="button" class="secondary" id="vpa-reopen">Rouvrir (nouvelle version)</button>':''}</div>
    ${!canSign()&&!x.signed?`<p class="v-foot">${isNurse()?'Recueil infirmier enregistré : l’anesthésiste conclut et signe.':'Lecture seule.'}</p>`:''}
    ${x.history.length?`<details class="vpa-hist"><summary>Versions précédentes (${x.history.length})</summary><ul>${x.history.map(h=>`<li>Version ${h.version} · ${esc(R.CONCLUSIONS.find(c=>c[0]===h.decision)?.[1]||'')} · ${esc(h.name)} · ${esc(fmt(h.at))}${h.reopenReason?' · rouverte : '+esc(h.reopenReason):''}</li>`).join('')}</ul></details>`:''}
   </section>`;
 }
 function acqHTML(d,cx,disabled){
  const crit=R.alertes(d,cx).filter(a=>a.niveau==='crit');
  if(!crit.length||d.conclusion.decision==='report'||!d.conclusion.decision)return '';
  return `<div class="vpa-acq"><b>${I.alert} Poursuite malgré ${crit.length>1?'des alertes critiques':'une alerte critique'}</b>
   ${crit.map(a=>`<label class="vpa-tick"><input type="checkbox" name="acq" value="${esc(a.id)}" ${d.acquittees.includes(a.id)?'checked':''} ${disabled?'disabled':''}><span>Pris en compte : ${esc(a.texte)}</span></label>`).join('')}
   <label><span>Motif de poursuite (tracé)</span><textarea name="motifAlertes" rows="2" ${disabled?'disabled':''} placeholder="Ex. RAI reprélevées à 7 h, résultat avant incision ; jeûne conforme à 10 h 30, passage décalé">${esc(d.motifAlertes)}</textarea></label></div>`;
 }
 function jeuneHTML(d,cx){
  const j=R.jeune(d.jeune,cx);if(!d.jeune.solides&&!d.jeune.liquides)return '';
  return `<ul class="vpa-jeune">${j.lignes.map(l=>`<li class="is-${l.niveau}">${l.niveau==='ok'?I.check:l.niveau==='info'?I.clock:I.alert}<span><b>${esc(l.label)}</b> ${esc(l.texte)}</span></li>`).join('')}</ul>${j.conformeA?`<p class="v-crit-t">${I.clock} Jeûne conforme à partir de ${esc(j.conformeA.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))}${cx.intervention?' (intervention prévue à '+esc(cx.intervention.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))+')':''}.</p>`:''}${j.pediatrie?`<p class="v-foot">${esc(j.pediatrie)}</p>`:''}`;
 }

 /* ---------- Impression ---------- */
 function docHTML(s,x){
  const d=x.draft,cx=contexte(s),e=esc,id=s.identity||{},al=R.alertes(d,cx),sg=x.signed;
  const line=(l,v)=>v?`<li><b>${e(l)}</b> ${e(v)}</li>`:'';
  const ex=d.examen,vit=[ex.pas!=null||ex.pad!=null?`PA ${ex.pas??'?'}/${ex.pad??'?'} mmHg`:'',ex.fc!=null?`FC ${ex.fc}/min`:'',ex.spo2!=null?`SpO₂ ${ex.spo2} %`:'',ex.temp!=null?`T ${ex.temp} °C`:'',ex.poids!=null?`${ex.poids} kg`:'',ex.glycemie!=null?`glycémie ${ex.glycemie} g/L`:''].filter(Boolean).join(' · ');
  return `<article class="pp-doc"><header class="pp-doc-head"><img src="assets/marque/etablissement.webp" alt="Établissement" width="185" height="100"><div class="pp-doc-who"><strong>${e(sg?.name||who())}</strong><span>Anesthésie-réanimation</span>${sg?.rpps?`<span>RPPS ${e(sg.rpps)}</span>`:''}</div><div class="pp-doc-date">${e(d.at?new Date(d.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'')}</div></header>
   <h2 class="pp-doc-title">Visite pré-anesthésique</h2>
   <p class="pp-doc-patient"><strong>${e([String(id.lastName||'').toUpperCase(),id.firstName].filter(Boolean).join(' ')||s.id)}</strong>${id.birthDate?' · né(e) le '+e(new Date(id.birthDate+'T12:00:00').toLocaleDateString('fr-FR')):''}${surgeryDate(s)?' · intervention prévue le '+e(new Date(surgeryDate(s)+'T12:00:00').toLocaleDateString('fr-FR'))+(surgeryTime(s)?' à '+e(surgeryTime(s)):''):''}</p>
   <section class="pp-doc-sec"><h3>Conclusion</h3><p><b>${e(R.CONCLUSIONS.find(c=>c[0]===d.conclusion.decision)?.[1]||'Non conclue')}</b></p>${d.conclusion.modifications?`<p>${e(d.conclusion.modifications)}</p>`:''}${d.conclusion.motif?`<p>Motif : ${e(d.conclusion.motif)}</p>`:''}${d.conclusion.bloc?`<p>Consignes bloc / SSPI : ${e(d.conclusion.bloc)}</p>`:''}</section>
   <section class="pp-doc-sec"><h3>Vérifications</h3><ul>
    ${line('Lieu',d.lieu)}${line('Identité',d.identite.verifiee?'vérifiée avec le patient'+(d.identite.bracelet?', bracelet conforme':''):'non vérifiée')}
    ${line('Évolution',R.QUESTIONS.filter(([k])=>d.questions[k]==='Oui').map(q=>q[1]).join(' ; ')||(Object.values(d.questions).some(Boolean)?'aucun changement signalé':''))}${line('Précisions',d.evolution)}
    ${line('Jeûne',R.jeune(d.jeune,cx).lignes.map(l=>l.label+' : '+l.texte).join(' ; '))}
    ${d.traitements.map(t=>line(t.label,(t.statut||'non vérifié')+' · '+t.consigne)).join('')}${line('Traitements du matin',d.traitementsMatin==='Oui'?'conformes':d.traitementsMatin==='Non'?'non conformes':'')}
    ${line('Constantes',vit)}${line('Voies aériennes',d.examen.voies+(d.examen.voiesNote?' · '+d.examen.voiesNote:''))}${line('Examen',d.examen.clinique)}
    ${d.resultats.map(r=>line(r.label,(r.statut||'non vérifié')+(r.note?' · '+r.note:''))).join('')}${line('RAI',R.rai(d.rai,cx.intervention)?.texte||'')}${line('βHCG',d.bhcg)}
    ${line('Préparation',R.PREPARATION.filter(([k])=>d.preparation[k]).map(([k,l])=>l+' : '+d.preparation[k]).join(' ; '))}
    ${line('Consentement',(cx.consentementSigne?'signé reçu':'signé non reçu')+(d.consentement?' · accord confirmé : '+d.consentement.toLowerCase():''))}
   </ul></section>
   ${al.length?`<section class="pp-doc-sec"><h3>Points d’attention</h3><ul>${al.map(a=>`<li>${e(a.texte)}${d.acquittees.includes(a.id)?' (pris en compte)':''}</li>`).join('')}</ul>${d.motifAlertes?`<p>Motif de poursuite : ${e(d.motifAlertes)}</p>`:''}</section>`:''}
   <footer class="pp-doc-sign">${sg?`<p>Signée électroniquement par ${e(sg.name)} le ${e(fmt(sg.at))} · version ${e(sg.version)} · SHA-256 ${e(String(sg.hash).slice(0,16))}…</p>`:'<p class="pp-doc-draft">Brouillon non signé</p>'}<div class="pp-doc-sign-box"><span>Signature</span></div></footer></article>`;
 }
 function print(s,x){
  const host=document.createElement('div');host.id='vpa-print';host.innerHTML=docHTML(s,x);document.body.append(host);document.body.classList.add('vpa-printing');
  const done=()=>{document.body.classList.remove('vpa-printing');host.remove();window.removeEventListener('afterprint',done)};window.addEventListener('afterprint',done);
  const imgs=[...host.querySelectorAll('img')].filter(i=>!i.complete);
  Promise.all(imgs.map(i=>new Promise(r=>{i.onload=i.onerror=r}))).then(()=>{try{window.print()}finally{setTimeout(done,500)}});
 }

 /* ---------- Écran ---------- */
 function panel(){
  const s=cur(),content=$('#content');if(!s||!content)return;
  const x=data(s),editable=canEdit()&&!x.signed,cx=contexte(s),itv=cx.intervention;
  const h=itv?(itv-Date.now())/3600000:null;
  const quand=itv?`${fmtD(surgeryDate(s))}${surgeryTime(s)?' à '+surgeryTime(s):''}${h!=null&&h>0&&h<48?' · dans '+R.fmtH(h):h!=null&&h<=0&&h>-12?' · heure prévue dépassée':''}`:'Date d’intervention non renseignée';
  const state=x.signed?`<span class="pp-state is-signed ${x.signed.decision==='report'?'is-report':''}">${x.signed.decision==='report'?I.alert+'Report décidé':I.check+'Signée'} · version ${x.signed.version}</span>`:`<span class="pp-state">${x.draft.at?'En cours':'À faire'} · version ${x.draft.version}</span>`;
  content.innerHTML=`<div class="v-wrap vpa-wrap">
   <div class="v-head"><div><p class="v-kicker">${I.stetho} Avant l’intervention</p><h3>Visite pré-anesthésique</h3><p class="v-sub">Obligatoire dans les heures précédant l’intervention (CSP, art. D.6124-92). Vérifiez ce qui a changé depuis la consultation, puis concluez et signez.</p></div>${state}</div>
   <p class="vpa-when">${I.clock}<span><b>Intervention</b> ${esc(quand)}</span></p>
   ${rappel(s)}
   <div class="vpa-layout">
    <form id="vpa-form" novalidate autocomplete="off"><fieldset ${editable?'':'disabled'}>${formHTML(s,x)}</fieldset></form>
    <aside class="vpa-side" id="vpa-side">${sideHTML(s,x)}</aside>
   </div></div>`;
  const form=$('#vpa-form');
  const refresh=()=>{$('#vpa-jeune-etat').innerHTML=jeuneHTML(x.draft,cx);const ra=R.rai(x.draft.rai,cx.intervention);$('#vpa-rai-etat').innerHTML=ra?`<p class="${ra.valide?'v-ok-t':'v-crit-t'}">${ra.valide?I.check:I.alert} RAI ${esc(ra.texte)}</p>`:'';const acq=$('#vpa-acq');if(acq)acq.innerHTML=acqHTML(x.draft,cx,!editable||!canSign());
   form.querySelectorAll('.vpa-if').forEach(el=>el.hidden=x.draft.conclusion.decision!==el.dataset.if);$('#vpa-side').innerHTML=sideHTML(s,x);bindSide(s,x)};
  const sync=()=>{if(!editable)return;x.draft=lire(form,x.draft);refresh()};
  if(editable){
   form.addEventListener('change',sync);
   form.addEventListener('input',e=>{if(e.target.matches('textarea,input[type=text],input:not([type])'))return;sync()});
   form.addEventListener('focusout',e=>{if(e.target.matches('textarea,input:not([type]),input[type=text]'))sync()});
   form.querySelectorAll('[data-now]').forEach(b=>b.onclick=()=>{const i=form.querySelector(`[name="${b.dataset.now}"]`);i.value=localNow();sync()});
   const rl=$('#vpa-reload-trt');if(rl)rl.onclick=()=>{sync();const old=x.draft.traitements;x.draft.traitements=proposerTraitements(s).map(t=>({...t,statut:old.find(o=>o.id===t.id)?.statut||''}));const oldR=x.draft.resultats;x.draft.resultats=proposerResultats(s).map(r=>({...r,statut:oldR.find(o=>o.id===r.id)?.statut||'',note:oldR.find(o=>o.id===r.id)?.note||''}));panel();toast('Consignes et examens repris depuis le dossier')};
  }
  refresh();
 }
 function bindSide(s,x){
  const p=$('#vpa-print-btn');if(p)p.onclick=()=>print(s,x);
  const sg=$('#vpa-sign');if(sg)sg.onclick=async()=>{
   const f=$('#vpa-form');if(f)x.draft=lire(f,x.draft);
   const chk=R.controler(x.draft,contexte(s));if(!chk.ok){toast(chk.errors[0]);panel();return}
   const at=new Date().toISOString(),name=who(),rpps=profile()?.rpps||'';
   const hash=await sha(R.canonique({sejour:s.id,contenu:x.draft,at,name}));
   x.signed={at,name,rpps,hash,version:x.draft.version,decision:x.draft.conclusion.decision,motif:x.draft.conclusion.motif};
   trace(s,`Visite pré-anesthésique signée · ${R.CONCLUSIONS.find(c=>c[0]===x.signed.decision)[1]}${x.signed.decision==='report'?' · motif : '+x.signed.motif:''} (${name})`);
   const crit=chk.alertes.filter(a=>a.niveau==='crit');if(crit.length&&x.signed.decision!=='report')trace(s,'VPA : poursuite malgré '+crit.length+' alerte(s) critique(s) · motif : '+x.draft.motifAlertes);
   try{await ctx.flush?.()}catch{}
   toast(x.signed.decision==='report'?'Report enregistré et tracé':'Visite pré-anesthésique signée');ctx.refreshHeader?ctx.refreshHeader():panel();
  };
  const ro=$('#vpa-reopen');if(ro)ro.onclick=()=>{
   const reason=prompt('Motif de réouverture de la visite (tracé) :','');if(!reason||reason.trim().length<3){toast('Visite non rouverte : motif requis.');return}
   x.history.push({...x.signed,reopenedAt:new Date().toISOString(),reopenReason:reason.trim().slice(0,300),contenu:JSON.parse(JSON.stringify(x.draft))});
   x.draft={...x.draft,version:x.draft.version+1};x.signed=null;trace(s,'Visite pré-anesthésique rouverte · version '+x.draft.version+' · motif : '+reason.trim()+' ('+who()+')');ctx.refreshHeader?ctx.refreshHeader():panel();
  };
 }

 /* ---------- Bandeau du dossier ---------- */
 function detail(){
  const s=cur(),chips=document.querySelector('#detail .pb-chips');if(!s||!chips||chips.querySelector('.vpa-chip'))return;
  const st=R.etat(s.vpa,surgeryDate(s));if(st.na)return;
  const cls=st.code==='signee'?'pb-ok':st.code==='report'?'pb-crit':'pb-warn';
  chips.insertAdjacentHTML('beforeend',`<button type="button" class="pb-chip vpa-chip ${cls}" title="${esc(st.detail)}">${st.code==='signee'?I.check:st.code==='report'?I.alert:I.stetho}${esc(st.label)}</button>`);
  chips.querySelector('.vpa-chip').onclick=()=>ctx.goTab(TAB);
 }

 return {panel:t=>t===TAB?(panel(),true):false,detail,etat:s=>R.etat(s.vpa,surgeryDate(s))};
};
})();

/* IASELO · prescriptions préopératoires pendant la consultation d'anesthésie.
   Onglet « Prescriptions préopératoires » de l'étape Consultation : examens biologiques, prémédication
   (contrôle allergies ↔ médicaments), consignes sur les traitements habituels (reprises des consignes datées),
   douche préopératoire, jeûne et autres consignes. Le médecin signe, imprime l'ordonnance avec le logo de
   l'établissement et l'envoie au patient : SMS et/ou e-mail Brevo ne contenant qu'un lien vers l'espace patient.
   Données : rubrique de séjour `prescriptionsPreop` = {draft, signed, history}. Règles : prescriptions-preop-regles.js. */
(function(){
'use strict';
window.createPrescriptionsPreop=function(ctx){
 const R=window.IaseloPrescriptionsPreop,V=window.IaseloRegles,A=window.IaseloAmeliorations;if(!R)return null;
 const {$,esc,toast,dossierStages}=ctx,TAB='prescriptionsPreop';
 const cur=()=>ctx.current(),job=()=>ctx.job()||'';
 const profile=()=>ctx.access?.()?.profile||null;
 const isDoctor=()=>['anesthesiste','chirurgien'].includes(job())||(!job()&&ctx.role()!=='Infirmier');
 const can=()=>isDoctor()&&(ctx.canWrite?ctx.canWrite('stay/'+(cur()?.id||'x')+'/'+TAB):true);
 const who=()=>profile()?.display_name||(ctx.role()==='Chirurgien'?'Chirurgien':'Médecin anesthésiste');
 const allergies=s=>String(s?.consult?.allergies??'');
 const ext=s=>s?.consult?.ext||{};
 const surgeryDate=s=>{const d=ext(s).surgeryDate||s?.surgicalAnnouncement?.published?.fields?.date||'';return R.isDate(d)?d:''};
 const trace=(s,text)=>{s.events=s.events||[];s.events.unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text,kind:'Prescriptions préopératoires'})};
 const fmt=iso=>iso?new Date(iso).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'';
 const ICON={
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  print:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/></svg>',
  sign:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
 };
 const QUICK=['Venir accompagné(e) et ne pas rester seul(e) la nuit suivant l’intervention.','Ne pas conduire pendant 24 heures après l’anesthésie.','Apporter votre appareil de PPC (apnées du sommeil).','Apporter vos ordonnances et vos médicaments habituels dans leur boîte.','Arrêter le tabac dès maintenant : chaque semaine sans tabac réduit les complications. Aide possible : Tabac Info Service, 39 89.'];

 // Onglet ajouté à l'étape Consultation, juste après le dossier de consultation.
 const g=dossierStages.find(x=>x.id==='consultation');if(g&&!g.items.some(([k])=>k===TAB)){const i=g.items.findIndex(([k])=>k==='consult');g.items.splice(i<0?g.items.length:i+1,0,[TAB,'Prescriptions préopératoires'])}

 function data(s){
  if(!s.prescriptionsPreop||typeof s.prescriptionsPreop!=='object'){
   const d=R.vide();d.traitements.items=R.traitementsProposes(s,V);d.jeune.date=surgeryDate(s);d.jeune.heure=R.isTime(ext(s).surgeryTime)?ext(s).surgeryTime:'';
   if(s.mode==='Ambulatoire')d.autres=QUICK[0]+'\n'+QUICK[1];
   s.prescriptionsPreop={draft:d,signed:null,history:[]};
  }
  const x=s.prescriptionsPreop;x.draft=R.normaliser(x.draft);x.history=Array.isArray(x.history)?x.history:[];return x;
 }
 const snapshot=(s,x,draft)=>({contenu:draft||x.draft,version:(draft||x.draft).version,signeLe:x.signed?.at||null,etablissement:'Clinique du Trocadéro',intervention:surgeryDate(s),
  patient:{nom:s.identity?.lastName||'',prenom:s.identity?.firstName||'',naissance:s.identity?.birthDate||''},
  prescripteur:{nom:x.signed?.name||who(),rpps:x.signed?.rpps||profile()?.rpps||'',specialite:x.signed?.specialty||(job()==='chirurgien'||ctx.role()==='Chirurgien'?'Chirurgie':'Anesthésie-réanimation')}});
 const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');

 /* ---------- Formulaire ---------- */
 const field=(label,name,value,type='text',extra='')=>`<label>${label}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
 const area=(label,name,value,rows=2,ph='')=>`<label>${label}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea></label>`;
 const tick=(name,checked,label)=>`<label class="pp-tick"><input type="checkbox" name="${name}" ${checked?'checked':''}><span>${label}</span></label>`;
 function card(id,title,sub,body,toggle){return `<section class="v-card pp-sec" id="pp-${id}"><header class="v-card-head"><div><h4>${title}</h4>${sub?`<p>${sub}</p>`:''}</div>${toggle||''}</header>${body}</section>`}
 function alertHTML(r,s){
  const alerts=r.drug&&A?.controleAllergies?A.controleAllergies(allergies(s),r.drug):[],stop=alerts.some(a=>a.niveau==='allergie');
  return alerts.length?`<div class="pp-allergy ${stop?'is-stop':'is-warn'}" role="alert"><b>${ICON.alert}${stop?'Allergie connue':'Réactivité croisée possible'}</b>${alerts.map(a=>`<p>${esc(a.message)}</p>`).join('')}${stop?`<label>Motif pour maintenir (tracé)<input name="premed.motif" value="${esc(r.motif)}" placeholder="Ex. test allergologique négatif du…"></label>`:`<input type="hidden" name="premed.motif" value="${esc(r.motif)}">`}</div>`:`<input type="hidden" name="premed.motif" value="${esc(r.motif)}">`;
 }
 function premedRow(r,i,s){
  return `<div class="pp-row"><div class="pp-row-grid">
   <label>Médicament<input name="premed.drug" list="pp-drugs" value="${esc(r.drug)}" placeholder="Ex. Hydroxyzine 25 mg"></label>
   <label>Posologie<input name="premed.dose" value="${esc(r.dose)}" placeholder="Ex. 1 comprimé"></label>
   <label>Moment de prise<input name="premed.moment" list="pp-moments" value="${esc(r.moment)}" placeholder="Ex. la veille au soir"></label>
   <button type="button" class="pp-x" data-remove aria-label="Retirer cette ligne">×</button></div>
   <div class="pp-row-alert">${alertHTML(r,s)}</div>
  </div>`;
 }
 function formHTML(s,x){
  const d=x.draft,sug=R.suggestions(s,V),cons=s.aideCpa?.consignes;
  const bilans=card('bilans','Examens biologiques','Aucun bilan systématique : cochez selon l’indication. Les propositions <span class="pp-sug-dot"></span> viennent du dossier.',
   `<div class="pp-bilans">${R.BILANS.map(b=>`<label class="pp-check${sug[b.id]?' is-sug':''}"><input type="checkbox" name="bilan" value="${b.id}" ${d.bilans.ids.includes(b.id)?'checked':''}><span><b>${esc(b.label)}</b><small>${sug[b.id]?'Proposé : '+esc(sug[b.id].join(' · ')):esc(b.hint)}</small></span></label>`).join('')}</div>
   <div class="pp-grid2">${field('À réaliser avant le','bilans.avant',d.bilans.avant,'date',surgeryDate(s)?`max="${surgeryDate(s)}"`:'')}${area('Précisions pour le laboratoire','bilans.notes',d.bilans.notes,1,'Ex. à jeun, prélèvement à domicile possible')}</div>
   ${area('Autres examens (ECG, imagerie, avis spécialisé…)','bilans.autres',d.bilans.autres,2)}`);
  const premed=card('premed','Prémédication et médicaments à prendre','Chaque médicament est contrôlé avec les allergies du dossier.',
   `<div id="pp-premed-list">${d.premed.map((r,i)=>premedRow(r,i,s)).join('')||'<p class="pp-empty">Aucun médicament prescrit.</p>'}</div><button type="button" class="secondary" id="pp-add-premed">Ajouter un médicament</button>`);
  const src=cons?.validatedAt?`Reprises des consignes validées le ${esc(fmt(cons.validatedAt))} par ${esc(cons.validatedBy||'')}.`:'Calculées d’après les traitements du dossier et la date d’intervention : à relire.';
  const traitements=card('traitements','Vos traitements habituels',src,
   `<div class="pp-trt">${d.traitements.items.map((t,i)=>`<div class="pp-trt-row" data-trt="${i}"><label class="pp-tick"><input type="checkbox" name="trt.include" ${t.include?'checked':''}><span><b>${esc(t.label)}</b></span></label><input type="hidden" name="trt.id" value="${esc(t.id)}"><input type="hidden" name="trt.label" value="${esc(t.label)}"><textarea name="trt.text" rows="2" aria-label="Consigne pour ${esc(t.label)}">${esc(t.text)}</textarea></div>`).join('')||'<p class="pp-empty">Aucun traitement à adapter repéré dans le dossier.</p>'}</div>
   <button type="button" class="secondary" id="pp-reload-trt">Reprendre depuis le dossier</button>
   ${area('Autres consignes sur les traitements','traitements.libre',d.traitements.libre,2,'Ex. continuer le bêtabloquant le matin avec une gorgée d’eau')}`);
  const douche=card('douche','Douche préopératoire','Recommandations SF2H 2016 : savon doux ou antiseptique, pas de rasage.',
   `<div class="pp-opts" role="group" aria-label="Nombre de douches"><label><input type="radio" name="douche.nombre" value="2" ${d.douche.nombre===2?'checked':''}> Veille au soir et matin</label><label><input type="radio" name="douche.nombre" value="1" ${d.douche.nombre===1?'checked':''}> Matin seulement</label></div>
   <div class="pp-opts" role="group" aria-label="Produit"><label><input type="radio" name="douche.produit" value="doux" ${d.douche.produit==='doux'?'checked':''}> Savon doux</label><label><input type="radio" name="douche.produit" value="antiseptique" ${d.douche.produit==='antiseptique'?'checked':''}> Savon antiseptique</label></div>
   <div class="pp-ticks">${tick('douche.cheveux',d.douche.cheveux,'Cheveux compris')}${tick('douche.rasage',d.douche.rasage,'Ne pas raser')}${tick('douche.retirer',d.douche.retirer,'Retirer vernis, bijoux, maquillage')}</div>
   ${area('Précisions','douche.libre',d.douche.libre,1)}`,`<label class="pp-switch"><input type="checkbox" name="douche.actif" ${d.douche.actif?'checked':''}><span>Inclure</span></label>`);
  const jeune=card('jeune','Jeûne','Solides et lait 6 h, liquides clairs jusqu’à 2 h avant (SFAR / ESAIC 2022) : adaptez si besoin.',
   `<div class="pp-grid4">${field('Solides (heures)','jeune.solides',d.jeune.solides,'number','min="2" max="12"')}${field('Liquides clairs (heures)','jeune.liquides',d.jeune.liquides,'number','min="1" max="6"')}${field('Date d’intervention','jeune.date',d.jeune.date,'date')}${field('Heure d’intervention','jeune.heure',d.jeune.heure,'time')}</div>
   <div class="pp-ticks">${tick('jeune.tabac',d.jeune.tabac,'Pas de tabac, vapotage ni chewing-gum le jour J')}</div>
   ${area('Précisions','jeune.libre',d.jeune.libre,1,'Ex. diabétique : boisson sucrée autorisée si malaise')}`,`<label class="pp-switch"><input type="checkbox" name="jeune.actif" ${d.jeune.actif?'checked':''}><span>Inclure</span></label>`);
  const autres=card('autres','Autres consignes','',`<div class="pp-chips">${QUICK.map((q,i)=>`<button type="button" class="pp-chip" data-quick="${i}">+ ${esc(q.split(/[.:(]/)[0])}</button>`).join('')}</div>${area('Consignes','autres',d.autres,4)}`);
  return `<datalist id="pp-drugs">${R.PREMED_SUGGESTIONS.map(x=>`<option value="${esc(x)}">`).join('')}</datalist><datalist id="pp-moments">${R.MOMENTS.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>${bilans}${premed}${traitements}${douche}${jeune}${autres}`;
 }
 function lire(form,prev){
  const f=new FormData(form),all=n=>f.getAll(n).map(String),rows=[],dr=all('premed.drug'),ds=all('premed.dose'),mo=all('premed.moment'),mt=all('premed.motif');
  dr.forEach((v,i)=>rows.push({drug:v,dose:ds[i]||'',moment:mo[i]||'',motif:mt[i]||''}));
  const trt=[...form.querySelectorAll('[data-trt]')].map(el=>({id:el.querySelector('[name="trt.id"]').value,label:el.querySelector('[name="trt.label"]').value,text:el.querySelector('[name="trt.text"]').value,include:el.querySelector('[name="trt.include"]').checked}));
  const on=n=>!!form.querySelector(`[name="${n}"]`)?.checked,val=n=>f.get(n)??'';
  return R.normaliser({version:prev.version,bilans:{ids:all('bilan'),avant:val('bilans.avant'),autres:val('bilans.autres'),notes:val('bilans.notes')},premed:rows,
   traitements:{items:trt,libre:val('traitements.libre')},
   douche:{actif:on('douche.actif'),nombre:Number(val('douche.nombre')),produit:val('douche.produit'),cheveux:on('douche.cheveux'),rasage:on('douche.rasage'),retirer:on('douche.retirer'),libre:val('douche.libre')},
   jeune:{actif:on('jeune.actif'),solides:val('jeune.solides'),liquides:val('jeune.liquides'),date:val('jeune.date'),heure:val('jeune.heure'),tabac:on('jeune.tabac'),libre:val('jeune.libre')},
   autres:val('autres')});
 }

 /* ---------- Envoi et suivi ---------- */
 const maskTel=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+' •• •• •• '+v.slice(-2):''},maskMail=v=>{const [u,d]=String(v||'').split('@');return d?u.slice(0,1)+'•••@'+d:''};
 async function api(path,options={}){const r=await fetch('/api/workspace/prescriptions/'+path,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok&&!j.results)throw new Error(j.error||'Serveur indisponible');return j}
 function sendHTML(s,x){
  const c=s.invitationContact?.contact||null,shared=!!ctx.shared?.();
  if(!x.signed)return `<p class="pp-muted">${ICON.lock} Signez les prescriptions pour pouvoir les envoyer au patient.</p>`;
  if(!shared)return `<p class="pp-muted">L’envoi par SMS ou e-mail est disponible sur le serveur de la clinique (dossier partagé connecté).</p>`;
  if(!c)return `<p class="pp-muted">Aucune coordonnée vérifiée : enregistrez le téléphone ou l’e-mail du patient dans « Questionnaire patient ».</p>`;
  return `<div class="pp-send"><div class="pp-opts" role="group" aria-label="Canal d’envoi">
   <label class="${c.phone?'':'is-off'}"><input type="checkbox" name="pp-ch" value="sms" ${c.phone?'checked':'disabled'}> SMS ${c.phone?`<small>${esc(maskTel(c.phone))}</small>`:'<small>aucun numéro</small>'}</label>
   <label class="${c.email?'':'is-off'}"><input type="checkbox" name="pp-ch" value="email" ${c.email?'checked':'disabled'}> E-mail ${c.email?`<small>${esc(maskMail(c.email))}</small>`:'<small>aucune adresse</small>'}</label></div>
   <button type="button" class="primary" id="pp-send">${ICON.send}Envoyer au patient</button></div>
   <p class="pp-rgpd">Le message ne contient que le nom de l’établissement et un lien personnel. Le patient saisit sa date de naissance pour ouvrir ses documents ; le lien expire 7 jours après l’intervention.</p>`;
 }
 async function refreshStatus(s){
  const host=$('#pp-status');if(!host||!ctx.shared?.())return;
  try{const {links}=await api('status?stay='+encodeURIComponent(s.id));if(cur()?.id!==s.id)return;
   host.innerHTML=links.length?`<h5>Envois au patient</h5><ul class="pp-links">${links.map(l=>`<li class="${l.active?'is-active':''}"><span><b>Version ${l.version}</b> · ${esc(l.channels.map(c=>c==='sms'?'SMS':'E-mail').join(' + '))} · envoyée le ${esc(fmt(l.sentAt))}</span><span class="${l.firstViewedAt?'pp-seen':'pp-unseen'}">${l.firstViewedAt?ICON.eye+'Consultée le '+esc(fmt(l.firstViewedAt))+(l.views>1?' ('+l.views+' fois)':''):l.locked?'Lien fermé (erreurs de date de naissance)':l.active?'Pas encore consultée':'Lien fermé'}</span><small>${l.active?'Valide jusqu’au '+esc(fmt(l.expiresAt)):''}</small></li>`).join('')}</ul>${links.some(l=>l.active)&&can()?'<button type="button" class="secondary pp-small" id="pp-revoke">Désactiver le lien patient</button>':''}`:'';
   const rv=$('#pp-revoke');if(rv)rv.onclick=async()=>{try{await api('revoke',{method:'POST',body:JSON.stringify({stay:s.id})});trace(s,'Lien patient des prescriptions désactivé ('+who()+')');toast('Lien désactivé');refreshStatus(s)}catch(e){toast(e.message)}};
  }catch(e){host.innerHTML=`<p class="pp-muted">${esc(e.message)}</p>`}
 }

 /* ---------- Impression ---------- */
 function print(s,x){
  const host=document.createElement('div');host.id='pp-print';host.innerHTML=R.documentHTML(snapshot(s,x),{brouillon:!x.signed});
  document.body.append(host);document.body.classList.add('pp-printing');
  const done=()=>{document.body.classList.remove('pp-printing');host.remove();window.removeEventListener('afterprint',done)};
  window.addEventListener('afterprint',done);
  const imgs=[...host.querySelectorAll('img')].filter(i=>!i.complete);
  Promise.all(imgs.map(i=>new Promise(r=>{i.onload=i.onerror=r}))).then(()=>{try{window.print()}finally{setTimeout(done,500)}});
 }

 /* ---------- Écran ---------- */
 function panel(){
  const s=cur(),content=$('#content');if(!s||!content)return;
  const x=data(s),editable=can()&&!x.signed,al=allergies(s),la=A?.lireAllergies?A.lireAllergies(al):null;
  const state=x.signed?`<span class="pp-state is-signed">${ICON.sign}Signée · version ${x.draft.version}</span>`:`<span class="pp-state">Brouillon · version ${x.draft.version}</span>`;
  const alBanner=la?.statut==='connue'?`<div class="pp-banner is-crit">${ICON.alert}<span><b>Allergies du dossier</b> ${esc(al)}</span></div>`:la?.statut==='aucune'?`<div class="pp-banner is-ok">${ICON.sign}<span><b>Allergies</b> aucune déclarée</span></div>`:`<div class="pp-banner is-warn">${ICON.alert}<span><b>Allergies non vérifiées</b> complétez le dossier de consultation avant de signer.</span></div>`;
  content.innerHTML=`<div class="v-wrap pp-wrap">
   <div class="v-head"><div><p class="v-kicker">Consultation d’anesthésie</p><h3>Prescriptions préopératoires</h3><p class="v-sub">Examens, prémédication, traitements, douche et jeûne. Signez, puis imprimez l’ordonnance ou envoyez-la au patient.</p></div>${state}</div>
   ${alBanner}
   <div class="pp-layout">
    <form id="pp-form" novalidate><fieldset ${editable?'':'disabled'}>${formHTML(s,x)}</fieldset></form>
    <div class="pp-side">
     <section class="v-card pp-actions">
      ${x.signed?`<p class="pp-signed">${ICON.sign}<span>Signée par <b>${esc(x.signed.name)}</b> le ${esc(fmt(x.signed.at))}</span></p>`:''}
      <div id="pp-check"></div>
      <div class="v-actions">${!x.signed&&can()?`<button type="button" class="primary" id="pp-sign">${ICON.sign}Signer les prescriptions</button>`:''}<button type="button" class="secondary" id="pp-print-btn">${ICON.print}${x.signed?'Imprimer l’ordonnance':'Imprimer le brouillon'}</button>${x.signed&&can()?'<button type="button" class="secondary" id="pp-edit">Modifier (nouvelle version)</button>':''}</div>
      ${can()?sendHTML(s,x):''}
      <div id="pp-status"></div>
     </section>
     <section class="pp-preview" aria-label="Aperçu de l’ordonnance"><p class="pp-preview-label">Aperçu · ce que reçoit le patient</p><div id="pp-doc">${R.documentHTML(snapshot(s,x),{brouillon:!x.signed})}</div></section>
    </div>
   </div></div>`;
  bind(s,x);refreshStatus(s);
 }
 function showCheck(res){
  const h=$('#pp-check');if(!h)return;
  h.innerHTML=res.errors.length||res.warnings.length?`${res.errors.map(e=>`<p class="pp-err">${ICON.alert}${esc(e)}</p>`).join('')}${res.warnings.map(e=>`<p class="pp-warn">${esc(e)}</p>`).join('')}`:'';
 }
 function bind(s,x){
  const form=$('#pp-form');
  const sync=(rerender)=>{if(!form||x.signed||!can())return;x.draft=lire(form,x.draft);$('#pp-doc').innerHTML=R.documentHTML(snapshot(s,x),{brouillon:true});if(rerender)panel()};
  // Contrôle allergies en direct sur la ligne modifiée, sans redessiner l'écran (le focus reste en place).
  const checkRow=input=>{const row=input.closest('.pp-row'),box=row?.querySelector('.pp-row-alert');if(!box)return;const motif=row.querySelector('[name="premed.motif"]')?.value||'';box.innerHTML=alertHTML({drug:input.value.trim(),motif},s)};
  let t;form?.addEventListener('input',e=>{clearTimeout(t);const el=e.target;t=setTimeout(()=>{if(el.name==='premed.drug')checkRow(el);sync()},el.name==='premed.drug'?400:150)});
  form?.addEventListener('change',e=>{if(e.target.name==='premed.drug')checkRow(e.target);sync()});
  const add=$('#pp-add-premed');if(add)add.onclick=()=>{
   const host=$('#pp-premed-list');if(host.querySelectorAll('.pp-row').length>=12){toast('12 médicaments au plus');return}
   host.querySelector('.pp-empty')?.remove();host.insertAdjacentHTML('beforeend',premedRow({drug:'',dose:'',moment:'',motif:''},0,s));host.lastElementChild.querySelector('input').focus();bindRemove()};
  function bindRemove(){form.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{b.closest('.pp-row').remove();sync()})}
  if(form)bindRemove();
  const rl=$('#pp-reload-trt');if(rl)rl.onclick=()=>{sync();x.draft.traitements.items=R.traitementsProposes(s,V);panel();toast('Consignes reprises depuis le dossier')};
  form?.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{const ta=form.querySelector('[name=autres]'),q=QUICK[b.dataset.quick];if(!ta.value.includes(q))ta.value=(ta.value.trim()?ta.value.trim()+'\n':'')+q;sync()});
  const sg=$('#pp-sign');if(sg)sg.onclick=async()=>{
   sync();const res=R.controler(x.draft,{allergies:allergies(s),A,surgeryDate:surgeryDate(s)});showCheck(res);if(!res.ok){toast('Corrigez les points signalés avant de signer');return}
   const p=profile();
   x.signed={at:new Date().toISOString(),name:who(),userId:p?.user_id||'',rpps:p?.rpps||'',specialty:job()==='chirurgien'||ctx.role()==='Chirurgien'?'Chirurgie':'Anesthésie-réanimation',version:x.draft.version,hash:await sha(R.canonique(x.draft))};
   x.history.unshift({version:x.draft.version,at:x.signed.at,by:x.signed.name});x.history=x.history.slice(0,20);
   for(const a of R.alertesAllergies(x.draft,allergies(s),A))trace(s,'Alerte allergie maintenue en prescription préopératoire : '+a.drug+(a.motif?' · motif : '+a.motif:'')+' ('+who()+')');
   trace(s,'Prescriptions préopératoires signées · version '+x.draft.version+' ('+who()+')');
   if(ctx.shared?.())await ctx.flush?.();
   toast('Prescriptions signées');panel();
  };
  const ed=$('#pp-edit');if(ed)ed.onclick=()=>{x.draft={...x.draft,version:x.draft.version+1};x.signed=null;trace(s,'Prescriptions préopératoires rouvertes · version '+x.draft.version+' ('+who()+')');panel()};
  const pb=$('#pp-print-btn');if(pb)pb.onclick=()=>{sync();print(s,x)};
  const sd=$('#pp-send');if(sd)sd.onclick=async()=>{
   const channels=[...document.querySelectorAll('[name=pp-ch]:checked')].map(i=>i.value);if(!channels.length){toast('Choisissez SMS et/ou e-mail');return}
   sd.disabled=true;sd.textContent='Envoi en cours…';
   try{await ctx.flush?.();const r=await api('send',{method:'POST',body:JSON.stringify({stay:s.id,channels})});
    const ok=r.results.filter(z=>z.sent),ko=r.results.filter(z=>!z.sent);
    if(ok.length)trace(s,'Prescriptions préopératoires envoyées au patient · version '+x.draft.version+' · '+ok.map(z=>(z.channel==='sms'?'SMS ':'E-mail ')+z.to).join(', ')+' ('+who()+')');
    toast(ok.length?(ko.length?'Envoyé en partie : '+ko.map(z=>z.error).join(' · '):'Envoyé au patient'):ko.map(z=>z.error).join(' · '));
   }catch(e){toast(e.message)}
   panel();
  };
  if(!x.signed&&can())showCheck({errors:[],warnings:R.controler(x.draft,{allergies:allergies(s),A,surgeryDate:surgeryDate(s)}).warnings});
 }
 return {TAB,panel:tab=>{if(tab!==TAB)return false;panel();return true}};
};
})();

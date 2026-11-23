/* IASELO · documents transmis par le patient et consentement d'anesthésie (dossier professionnel).
   Deux onglets dans l'étape « Consultation d'anesthésie » :
   - « Documents » : demande envoyée au patient (SMS / e-mail Brevo, lien personnel) et documents qu'il a déposés
     (bilans, ordonnances, courriers…), rangés dans le dossier ; ouverture, « lu », « écarté » (jamais supprimé).
   - « Consentement d'anesthésie » : fiche préremplie, envoi au patient en fin de consultation, suivi (envoyé,
     ouvert, signé, déposé), relance, vérification d'un document déposé, papier reçu, contre-signature, impression.
   La rubrique de séjour `espacePatient` est écrite par le serveur uniquement (worker/espace-patient.mjs).
   Règles et texte du formulaire : espace-patient-regles.js. */
(function(){
'use strict';
window.createDocumentsConsentement=function(ctx){
 const R=window.IaseloEspacePatient;if(!R)return null;
 const {$,esc,toast,dossierStages}=ctx,TAB_DOCS='documentsPatient',TAB_CONS='consentementAnesth',MODULE='espacePatient';
 const cur=()=>ctx.current(),job=()=>ctx.job()||'';
 const profile=()=>ctx.access?.()?.profile||null;
 const shared=()=>!!ctx.shared?.();
 const isAnesth=()=>job()==='anesthesiste'||(!job()&&ctx.role()==='Anesthésiste');
 const isClinician=()=>['anesthesiste','chirurgien','infirmier'].includes(job())||!job();
 const canAskDocs=()=>['anesthesiste','chirurgien','secretariat'].includes(job())||(!job()&&ctx.role()!=='Infirmier');
 const who=()=>profile()?.display_name||(ctx.role()==='Chirurgien'?'Chirurgien':'Médecin anesthésiste');
 const fmt=iso=>iso?new Date(iso).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'';
 const trace=(s,text)=>{s.events=s.events||[];s.events.unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text,kind:'Espace patient'})};
 const I={
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  print:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>',
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
 };

 // Onglets ajoutés à l'étape Consultation : « Documents » après le questionnaire, consentement après les prescriptions.
 const g=dossierStages.find(x=>x.id==='consultation');
 if(g){
  if(!g.items.some(([k])=>k===TAB_DOCS)){const i=g.items.findIndex(([k])=>k==='questionnaire');g.items.splice(i<0?g.items.length:i+1,0,[TAB_DOCS,'Documents'])}
  if(!g.items.some(([k])=>k===TAB_CONS)){const i=g.items.findIndex(([k])=>k==='prescriptionsPreop');g.items.splice(i<0?g.items.length:i+1,0,[TAB_CONS,'Consentement d’anesthésie'])}
 }

 /* ---------- État serveur (le plus récent) ---------- */
 const fresh=new Map(),links=new Map();
 const space=s=>fresh.get(s.id)||s.espacePatient||{consentement:null,documents:[]};
 async function api(path,options={}){const r=await fetch('/api/workspace/espace-patient/'+path,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok&&!j.results)throw new Error(j.error||'Serveur indisponible');return j}
 async function load(s,rerender){
  if(!shared())return;
  try{const r=await api('status?stay='+encodeURIComponent(s.id));const before=JSON.stringify(fresh.get(s.id)||s.espacePatient||null);fresh.set(s.id,r.espacePatient);links.set(s.id,r.links||[]);
   if(cur()?.id===s.id&&(before!==JSON.stringify(r.espacePatient)||rerender))rerender?.();
   // Dossier partagé à jour (alertes, tour de contrôle) sans écraser de saisie en cours.
   if(before!==JSON.stringify(r.espacePatient))ctx.refresh?.().catch?.(()=>{});
  }catch(e){if(cur()?.id===s.id){const h=$('#dc-server');if(h)h.innerHTML=`<p class="pp-err">${I.alert}${esc(e.message)}</p>`}}
 }
 async function act(s,payload,done){
  try{const r=await api('action',{method:'POST',body:JSON.stringify({stay:s.id,...payload})});fresh.set(s.id,r.espacePatient);done?.();ctx.refresh?.().catch?.(()=>{})}catch(e){toast(e.message)}
 }

 /* ---------- Coordonnées et canaux (repris de « Questionnaire patient ») ---------- */
 const maskTel=v=>{v=String(v||'');return v.length>4?v.slice(0,3)+' •• •• •• '+v.slice(-2):''},maskMail=v=>{const [u,d]=String(v||'').split('@');return d?u.slice(0,1)+'•••@'+d:''};
 function channelsHTML(s,name){
  const c=s.invitationContact?.contact||null;
  if(!shared())return `<p class="pp-muted">L’envoi par SMS ou e-mail est disponible sur le serveur de la clinique (dossier partagé connecté).</p>`;
  if(!c)return `<p class="pp-muted">${I.alert}Aucune coordonnée vérifiée : enregistrez le téléphone ou l’e-mail du patient dans « Questionnaire patient ».</p>`;
  return `<div class="pp-opts" role="group" aria-label="Canal d’envoi"><label class="${c.phone?'':'is-off'}"><input type="checkbox" name="${name}" value="sms" ${c.phone?'checked':'disabled'}> SMS ${c.phone?`<small>${esc(maskTel(c.phone))}</small>`:'<small>aucun numéro</small>'}</label><label class="${c.email?'':'is-off'}"><input type="checkbox" name="${name}" value="email" ${c.email?'checked':'disabled'}> E-mail ${c.email?`<small>${esc(maskMail(c.email))}</small>`:'<small>aucune adresse</small>'}</label></div>`;
 }
 const channels=name=>[...document.querySelectorAll(`[name=${name}]:checked`)].map(i=>i.value);
 const sentText=r=>r.results.filter(z=>z.sent).map(z=>(z.channel==='sms'?'SMS ':'E-mail ')+z.to).join(', ');
 const sentToast=r=>{const ok=r.results.filter(z=>z.sent),ko=r.results.filter(z=>!z.sent);toast(ok.length?(ko.length?'Envoyé en partie : '+ko.map(z=>z.error).join(' · '):'Envoyé au patient'):ko.map(z=>z.error).join(' · '))};

 /* ---------- Ouverture d'un fichier (lecture tracée côté serveur) ---------- */
 async function openFile(s,f){
  const win=window.open('','_blank');
  try{const r=await fetch('/api/workspace/files/'+f.hash+'?key='+encodeURIComponent('stay/'+s.id+'/'+MODULE),{cache:'no-store'});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Fichier non disponible');
   const blob=new Blob([await r.arrayBuffer()],{type:f.type}),url=URL.createObjectURL(blob);
   if(win){win.location.href=url}else{const a=document.createElement('a');a.href=url;a.download=f.nom;a.click()}
   setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(e){win?.close();toast(e.message)}
 }

 /* ================= Onglet Documents ================= */
 function panelDocs(){
  const s=cur(),content=$('#content');if(!s||!content)return;
  const sp=space(s),docs=(sp.documents||[]).filter(d=>d.source==='patient').slice().sort((a,b)=>b.recuLe.localeCompare(a.recuLe));
  const nouveaux=docs.filter(d=>!d.vu&&!d.ecarte).length,dem=sp.demandeDocuments,lk=(links.get(s.id)||[]).find(l=>l.purpose==='documents');
  const row=d=>`<li class="dc-doc${d.ecarte?' is-ecarte':!d.vu?' is-new':''}">
   <span class="dc-doc-ic">${d.type==='application/pdf'?I.file:I.image}</span>
   <div class="dc-doc-main"><b>${esc(d.nom)}</b><span class="dc-doc-cat">${esc(R.CATEGORIE[d.categorie]||'Document')}</span>
    <small>Déposé par le patient le ${esc(fmt(d.recuLe))} · ${esc(R.TYPES[d.type]||'')} · ${esc(R.taille(d.taille))}</small>
    ${d.commentaire?`<p class="dc-doc-note">« ${esc(d.commentaire)} »</p>`:''}
    ${d.ecarte?`<p class="dc-doc-state is-off">Écarté par ${esc(d.ecarte.by)} le ${esc(fmt(d.ecarte.at))} · ${esc(d.ecarte.motif)}</p>`:d.vu?`<p class="dc-doc-state is-ok">${I.check}Lu par ${esc(d.vu.by)} le ${esc(fmt(d.vu.at))}</p>`:'<p class="dc-doc-state is-new">Nouveau · non lu</p>'}</div>
   <div class="dc-doc-act"><button type="button" class="secondary" data-open="${esc(d.id)}">${I.eye}Ouvrir</button>${isClinician()&&!d.vu&&!d.ecarte?`<button type="button" class="secondary" data-vu="${esc(d.id)}">${I.check}Marquer lu</button>`:''}${isClinician()&&!d.ecarte?`<button type="button" class="dc-link" data-ecarte="${esc(d.id)}">Écarter</button>`:''}</div></li>`;
  content.innerHTML=`<div class="v-wrap pp-wrap dc-wrap">
   <div class="v-head"><div><p class="v-kicker">Consultation d’anesthésie</p><h3>Documents</h3><p class="v-sub">Bilans, ordonnances et courriers transmis par le patient avant sa consultation, rangés directement dans le dossier.</p></div>${nouveaux?`<span class="pp-state dc-new">${nouveaux} nouveau${nouveaux>1?'x':''}</span>`:`<span class="pp-state">${docs.length?docs.length+' document'+(docs.length>1?'s':''):'Aucun document'}</span>`}</div>
   <div class="dc-layout">
    <section class="v-card"><header class="v-card-head"><div><h4>Documents reçus du patient</h4><p>Ouverture tracée dans le journal d’accès. Un document n’est jamais supprimé : il peut être écarté avec un motif.</p></div></header>
     <div id="dc-server"></div>
     ${docs.length?`<ul class="dc-docs">${docs.map(row).join('')}</ul>`:`<p class="pp-muted">${shared()?'Aucun document reçu pour l’instant.':'Les documents du patient s’affichent quand le dossier partagé est connecté au serveur.'}</p>`}
    </section>
    <section class="v-card dc-side"><header class="v-card-head"><div><h4>Demander des documents au patient</h4><p>Avant la consultation : le patient dépose ses documents depuis son téléphone ou son ordinateur.</p></div></header>
     ${dem?`<p class="dc-line">${I.send}<span>Demande envoyée le <b>${esc(fmt(dem.at))}</b> par ${esc(dem.by)} (${esc(dem.channels.map(c=>c==='sms'?'SMS':'e-mail').join(' + '))})${lk?lk.firstViewedAt?` · <span class="pp-seen">${I.eye}ouverte le ${esc(fmt(lk.firstViewedAt))}</span>`:lk.active?' · pas encore ouverte':' · lien fermé':''}</span></p>`:''}
     ${canAskDocs()?`${channelsHTML(s,'dc-doc-ch')}${shared()&&s.invitationContact?.contact?`<div class="v-actions"><button type="button" class="${dem?'secondary':'primary'}" id="dc-ask">${I.send}${dem?'Renvoyer la demande':'Envoyer la demande'}</button>${lk?.active&&isClinician()&&job()!=='infirmier'?'<button type="button" class="dc-link" id="dc-ask-close">Désactiver le lien</button>':''}</div>`:''}`:'<p class="pp-muted">Demande réservée aux médecins et au secrétariat.</p>'}
     <p class="pp-rgpd">${I.lock} Le message ne contient que le nom de l’établissement et un lien personnel ; la date de naissance est demandée à l’ouverture. Formats acceptés : PDF, photo JPEG ou PNG, 10 Mo par fichier, ${R.LIMITES.nombre} documents au plus. Le dépôt reste ouvert jusqu’au lendemain de l’intervention. Les fichiers sont stockés sur le serveur de la clinique (hébergeur HDS), jamais chez un tiers.</p>
    </section>
   </div></div>`;
  const byId=id=>docs.find(d=>d.id===id);
  content.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openFile(s,byId(b.dataset.open)));
  content.querySelectorAll('[data-vu]').forEach(b=>b.onclick=()=>act(s,{action:'document-vu',id:b.dataset.vu},panelDocs));
  content.querySelectorAll('[data-ecarte]').forEach(b=>b.onclick=()=>{const d=byId(b.dataset.ecarte),motif=prompt('Écarter « '+d.nom+' » (le document reste conservé et tracé).\nMotif : doublon, document d’un autre patient, illisible…','');if(!motif||motif.trim().length<3){toast('Motif requis');return}act(s,{action:'document-ecarte',id:d.id,note:motif.trim()},panelDocs)});
  const ask=$('#dc-ask');if(ask)ask.onclick=async()=>{const ch=channels('dc-doc-ch');if(!ch.length){toast('Choisissez SMS et/ou e-mail');return}ask.disabled=true;
   try{await ctx.flush?.();const r=await api('send',{method:'POST',body:JSON.stringify({stay:s.id,purpose:'documents',channels:ch})});sentToast(r);if(r.results.some(z=>z.sent))trace(s,'Demande de documents envoyée au patient · '+sentText(r)+' ('+who()+')')}catch(e){toast(e.message)}
   await load(s);panelDocs()};
  const close=$('#dc-ask-close');if(close)close.onclick=async()=>{try{await api('revoke',{method:'POST',body:JSON.stringify({stay:s.id,purpose:'documents'})});toast('Lien désactivé');await load(s);panelDocs()}catch(e){toast(e.message)}};
  if(!content.dataset.dcLoaded||content.dataset.dcLoaded!==s.id+TAB_DOCS){content.dataset.dcLoaded=s.id+TAB_DOCS;load(s,()=>{if(ctx.tab?.()===TAB_DOCS)panelDocs()})}
 }

 /* ================= Onglet Consentement ================= */
 function ficheProposee(s){
  const id=s.identity||{},e=s.consult?.ext||{},ann=s.surgicalAnnouncement?.published?.fields||{};
  return R.fiche({patient:{nom:id.birthName||id.lastName||'',prenom:id.firstName||'',naissance:id.birthDate||''},
   intervention:[ann.procedure||e.operation,ann.laterality&&ann.laterality!=='Non applicable'?ann.laterality.toLowerCase():''].filter(Boolean).join(' · ')||'',
   datePrevue:R.datePrevueSejour(s),consultation:{date:e.consultDate||new Date().toISOString().slice(0,10),medecin:e.author||profile()?.display_name||''}});
 }
 const draft=new Map();
 function print(f,r,opts){
  const host=document.createElement('div');host.id='dc-print';host.innerHTML=R.documentHTML(f,r,opts);
  document.body.append(host);document.body.classList.add('dc-printing');
  const done=()=>{document.body.classList.remove('dc-printing');host.remove();window.removeEventListener('afterprint',done)};
  window.addEventListener('afterprint',done);setTimeout(()=>{try{window.print()}finally{setTimeout(done,500)}},50);
 }
 function timeline(c,lk,auto,rappels){
  const st=R.statut(c),items=[];
  if(c?.envoi)items.push(['ok',I.send,(c.envoi.automatique?'Envoyé automatiquement le ':'Envoyé le ')+fmt(c.envoi.at),(c.envoi.automatique?'à la validation de la consultation par ':'par ')+c.envoi.by+' · '+c.envoi.channels.map(x=>x==='sms'?'SMS':'e-mail').join(' + ')]);
  for(const r of c?.relances||[])items.push(['ok',I.clock,'Relancé le '+fmt(r.at),'par '+r.by+' · '+r.channels.map(x=>x==='sms'?'SMS':'e-mail').join(' + ')]);
  if(c?.ouvertLe)items.push(['ok',I.eye,'Ouvert par le patient le '+fmt(c.ouvertLe),'']);
  for(const h of c?.historique||[])items.push(['crit',I.alert,'Document déposé le '+fmt(h.recu?.at)+' jugé non conforme',h.verification?.by+' · '+(h.verification?.note||'')]);
  if(c?.recu)items.push([st.niveau==='ok'?'ok':'warn',c.recu.mode==='depot'?I.file:I.pen,c.recu.mode==='signature'?'Signé en ligne le '+fmt(c.recu.at):c.recu.mode==='depot'?'Document signé déposé le '+fmt(c.recu.at):'Reçu sur papier · enregistré le '+fmt(c.recu.at),c.recu.mode==='signature'?'par '+c.recu.signataire+' (signature électronique simple)':c.recu.mode==='papier'?c.recu.by+' · '+c.recu.note:c.recu.fichier?.nom||'']);
  if(c?.verification&&c.recu)items.push([c.verification.conforme?'ok':'crit',I.check,(c.verification.conforme?'Vérifié conforme':'Non conforme')+' le '+fmt(c.verification.at),c.verification.by+(c.verification.note?' · '+c.verification.note:'')]);
  if(c?.contreSigne)items.push(['ok',I.check,'Contresigné le '+fmt(c.contreSigne.at),c.contreSigne.by]);
  if(c?.annule&&!c.recu)items.push(['crit',I.lock,'Lien désactivé le '+fmt(c.annule.at),c.annule.by]);
  for(const e of rappels||[])if(/^consentement-/.test(e.kind)&&!e.ok&&!st.recu)items.push(['crit',I.alert,'Rappel automatique '+(e.kind==='consentement-j-2'?'J-2':'J-1')+' non envoyé',e.raison||'']);
  if(auto?.ok&&auto.partiel?.length&&c?.envoi?.automatique&&!st.recu)items.push(['warn',I.alert,'Envoi automatique partiel',auto.partiel.join(' · ')]);
  if(!st.recu&&c?.envoi&&!c.annule&&lk&&!lk.active)items.push(['crit',I.lock,lk.locked?'Lien fermé après 5 erreurs de date de naissance':'Lien expiré','Relancez pour envoyer un nouveau lien']);
  return items.length?`<ol class="dc-time">${items.map(([k,ic,t,sub])=>`<li class="is-${k}">${ic}<span><b>${esc(t)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span></li>`).join('')}</ol>`:'';
 }
 function panelCons(){
  const s=cur(),content=$('#content');if(!s||!content)return;
  const sp=space(s),c=sp.consentement,st=R.statut(c),al=R.alerteBloc({...s,espacePatient:sp}),lk=(links.get(s.id)||[]).find(l=>l.purpose==='consentement');
  const sent=!!c?.envoi&&st.code!=='annule',f=sent?c.envoi.fiche:(draft.get(s.id)||ficheProposee(s)),rel=R.relance(c,f.datePrevue),edit=isAnesth()&&!sent&&!st.recu;
  const r=c?.recu?.mode==='signature'?c.recu:null,non=R.nonCoches(r);
  const field=(k,label,value,type='text',ro=false)=>`<label>${label}<input name="${k}" type="${type}" value="${esc(value)}" ${ro||!edit?'disabled':''}></label>`;
  const pill=`<span class="pp-state dc-st is-${st.niveau}">${st.niveau==='ok'?I.check:st.niveau==='todo'?I.pen:I.alert}${esc(st.label)}</span>`;
  const autoKo=autoEchec(sp);
  const banner=(autoKo?`<div class="pp-banner is-crit dc-auto-ko">${I.alert}<span><b>Consentement non envoyé à la validation de la consultation.</b> ${esc(autoKo.raison)}${isAnesth()?' Complétez puis cliquez sur « Envoyer au patient ».':''}</span></div>`:'')+(st.recu&&!st.aRevoir?'':`<div class="pp-banner is-${al.niveau==='crit'?'crit':'warn'}">${I.alert}<span><b>${esc(al.message)}</b>${al.bloquant?' L’entrée au bloc reste bloquée tant que le consentement n’est pas reçu (passage outre possible avec motif tracé).':''}</span></div>`);
  const answers=r?`<section class="v-card"><header class="v-card-head"><div><h4>Réponses du patient</h4><p>Signé en ligne par ${esc(r.signataire)} le ${esc(fmt(r.at))}${r.lieu?' à '+esc(r.lieu):''}</p></div></header>
   <ul class="dc-answers">${R.QUESTIONS.map(([id,t])=>`<li class="${r.reponses[id]==='non'?'is-non':''}"><span>${esc(t)}</span><b>${r.reponses[id]==='non'?'Non':'Oui'}</b></li>`).join('')}</ul>
   ${r.reserves?`<div class="pp-banner is-warn"><span><b>Réserves ou précisions</b> ${esc(r.reserves)}</span></div>`:''}
   ${non.length?`<p class="pp-err">${I.alert}${non.length} réponse${non.length>1?'s':''} « Non » : reprenez contact avec le patient avant l’intervention et tracez l’échange.</p>`:''}</section>`:'';
  const depot=c?.recu?.mode==='depot'?`<section class="v-card"><header class="v-card-head"><div><h4>Document signé déposé par le patient</h4><p>${esc(c.recu.fichier.nom)} · ${esc(R.taille(c.recu.fichier.taille))} · le ${esc(fmt(c.recu.at))}</p></div></header>
   <div class="v-actions"><button type="button" class="secondary" id="dc-open-depot">${I.eye}Ouvrir le document</button>${isAnesth()&&!c.verification?`<button type="button" class="primary" id="dc-conforme">${I.check}Conforme</button><button type="button" class="secondary" id="dc-non-conforme">Non conforme</button>`:''}</div>
   ${!c.verification?'<p class="pp-rgpd">Vérifiez les deux pages : identité, une réponse par ligne, accord à la procédure, date. « Non conforme » rouvre le lien : le patient peut déposer un autre document ou signer en ligne.</p>':''}</section>`:'';
  content.innerHTML=`<div class="v-wrap pp-wrap dc-wrap">
   <div class="v-head"><div><p class="v-kicker">Consultation d’anesthésie</p><h3>Consentement d’anesthésie</h3><p class="v-sub">Formulaire de la clinique envoyé automatiquement au patient (SMS et e-mail) dès la validation de la consultation. Il le lit, coche ses réponses et le signe en ligne, ou dépose le formulaire signé à la main.</p></div>${pill}</div>
   ${banner}
   <div class="pp-layout">
    <div class="dc-main">
     <section class="v-card"><header class="v-card-head"><div><h4>Fiche du patient</h4><p>${sent?'Figée à l’envoi : c’est ce que le patient a reçu.':'Préremplie depuis le dossier ; vérifiez avant l’envoi.'}</p></div></header>
      <form id="dc-fiche" class="dc-fiche" novalidate>
       ${field('nom','Nom de naissance',f.patient.nom,'text',true)}${field('prenom','Prénom',f.patient.prenom,'text',true)}${field('naissance','Né(e) le',f.patient.naissance,'date',true)}
       ${field('intervention','Intervention prévue',f.intervention)}${field('datePrevue','Date prévue',f.datePrevue,'date')}
       ${field('consultDate','Consultation du',f.consultation.date,'date')}${field('medecin','Avec le Docteur',f.consultation.medecin)}
      </form>
      ${edit&&R.ficheManquants(f).length?`<p class="pp-warn">À compléter : ${esc(R.ficheManquants(f).join(', '))}.</p>`:''}
     </section>
     ${answers}${depot}
    </div>
    <div class="pp-side">
     <section class="v-card pp-actions">
      <div id="dc-server"></div>
      ${timeline(c,lk,sp.consentementAuto,sp.rappelsAuto)}${!st.recu&&sent?'<p class="pp-rgpd">'+I.clock+' Sans signature, rappel automatique par SMS à J-2 puis à J-1 (10 h), avec un nouveau lien.</p>':''}
      ${rel.conseillee?`<p class="dc-relance">${I.clock}<span><b>Relance conseillée</b> ${esc(rel.raison)}</span></p>`:''}
      <div class="v-actions">
       ${isAnesth()&&!sent&&!st.recu?'':''}
       ${isAnesth()&&sent&&!st.recu&&shared()?`<button type="button" class="${rel.conseillee?'primary':'secondary'}" id="dc-relancer">${I.send}Relancer le patient</button>`:''}
       ${isAnesth()&&st.recu&&!c.contreSigne?`<button type="button" class="primary" id="dc-contresigner">${I.pen}Contresigner</button>`:''}
       <button type="button" class="secondary" id="dc-print-btn">${I.print}${st.recu&&c.recu.mode==='signature'?'Imprimer le consentement signé':'Imprimer le formulaire prérempli'}</button>
       ${isAnesth()&&!st.recu?'<button type="button" class="dc-link" id="dc-papier">Reçu signé sur papier</button>':''}
       ${isAnesth()&&sent&&!st.recu&&lk?.active?'<button type="button" class="dc-link" id="dc-annuler">Désactiver le lien</button>':''}
      </div>
      ${isAnesth()&&!sent&&!st.recu?`<div class="pp-send">${channelsHTML(s,'dc-cons-ch')}${shared()&&s.invitationContact?.contact?`<button type="button" class="primary" id="dc-send">${I.send}Envoyer au patient</button>`:''}<p class="pp-rgpd">${I.lock} Le message contient seulement « un document est à signer avant votre intervention » et un lien personnel ; la date de naissance est demandée. Le lien reste valable jusqu’au lendemain de l’intervention.</p></div>`:''}
      ${!isAnesth()&&!st.recu?'<p class="pp-muted">Envoi, relance et vérification réservés à l’anesthésiste.</p>':''}
     </section>
     <section class="pp-preview" aria-label="Aperçu du consentement"><p class="pp-preview-label">Aperçu · ce que voit le patient</p><div id="dc-doc">${R.documentHTML(f,r||null,{medecin:c?.contreSigne?{nom:c.contreSigne.by,at:c.contreSigne.at}:null,mode:r?'signature':'',empreinte:r?.empreinte||'',verification:c?.recu?.mode==='depot'?c.verification:null})}</div></section>
    </div>
   </div></div>`;
  bindCons(s,sp,c,st,f,r,edit);
  if(content.dataset.dcLoaded!==s.id+TAB_CONS){content.dataset.dcLoaded=s.id+TAB_CONS;load(s,()=>{if(ctx.tab?.()===TAB_CONS)panelCons()})}
 }
 function bindCons(s,sp,c,st,f,r,edit){
  const form=$('#dc-fiche');
  const read=()=>{const v=n=>form.querySelector(`[name=${n}]`).value;return R.fiche({patient:f.patient,intervention:v('intervention'),datePrevue:v('datePrevue'),consultation:{date:v('consultDate'),medecin:v('medecin')}})};
  if(edit&&form)form.addEventListener('input',()=>{const nf=read();draft.set(s.id,nf);$('#dc-doc').innerHTML=R.documentHTML(nf,null)});
  const send=$('#dc-send');if(send)send.onclick=async()=>{
   const nf=read(),miss=R.ficheManquants(nf);if(miss.length){toast('À compléter : '+miss.join(', '));panelCons();return}
   const ch=channels('dc-cons-ch');if(!ch.length){toast('Choisissez SMS et/ou e-mail');return}
   send.disabled=true;send.textContent='Envoi en cours…';
   try{await ctx.flush?.();const res=await api('send',{method:'POST',body:JSON.stringify({stay:s.id,purpose:'consentement',channels:ch,fiche:nf})});sentToast(res);if(res.results.some(z=>z.sent)){draft.delete(s.id);trace(s,'Consentement d’anesthésie envoyé au patient · '+sentText(res)+' ('+who()+')')}}catch(e){toast(e.message)}
   await load(s);panelCons()};
  const rl=$('#dc-relancer');if(rl)rl.onclick=async()=>{
   const ch=s.invitationContact?.contact?[s.invitationContact.contact.phone&&'sms',s.invitationContact.contact.email&&'email'].filter(Boolean):[];if(!ch.length){toast('Aucune coordonnée vérifiée');return}
   if(!confirm('Envoyer une relance par '+ch.map(x=>x==='sms'?'SMS':'e-mail').join(' et ')+' ? Un nouveau lien remplace le précédent.'))return;
   rl.disabled=true;try{const res=await api('send',{method:'POST',body:JSON.stringify({stay:s.id,purpose:'consentement',channels:ch,relance:true})});sentToast(res);if(res.results.some(z=>z.sent))trace(s,'Relance du consentement d’anesthésie · '+sentText(res)+' ('+who()+')')}catch(e){toast(e.message)}
   await load(s);panelCons()};
  const cs=$('#dc-contresigner');if(cs)cs.onclick=()=>act(s,{action:'contresigner'},()=>{trace(s,'Consentement d’anesthésie contresigné ('+who()+')');panelCons()});
  const pp=$('#dc-papier');if(pp)pp.onclick=()=>{const note=prompt('Consentement signé sur papier : précisez comment il a été recueilli et où il est rangé.\nEx. « signé en consultation, scanné dans le dossier papier »','Signé en consultation');if(!note||note.trim().length<3)return;act(s,{action:'papier',note:note.trim()},()=>{trace(s,'Consentement d’anesthésie reçu sur papier · '+note.trim()+' ('+who()+')');panelCons()})};
  const an=$('#dc-annuler');if(an)an.onclick=async()=>{if(!confirm('Désactiver le lien du consentement ? Le patient ne pourra plus signer en ligne.'))return;try{await api('revoke',{method:'POST',body:JSON.stringify({stay:s.id,purpose:'consentement'})});await load(s);panelCons()}catch(e){toast(e.message)}};
  const od=$('#dc-open-depot');if(od)od.onclick=()=>openFile(s,c.recu.fichier);
  const ok=$('#dc-conforme');if(ok)ok.onclick=()=>act(s,{action:'verifier',conforme:true},()=>{trace(s,'Consentement déposé vérifié conforme ('+who()+')');panelCons()});
  const ko=$('#dc-non-conforme');if(ko)ko.onclick=()=>{const note=prompt('Qu’est-ce qui ne va pas ? (page manquante, non signé, illisible…) Le patient verra ce motif et pourra recommencer.','');if(!note||note.trim().length<3){toast('Motif requis');return}act(s,{action:'verifier',conforme:false,note:note.trim()},()=>{trace(s,'Consentement déposé non conforme · '+note.trim()+' ('+who()+')');panelCons()})};
  const pb=$('#dc-print-btn');if(pb)pb.onclick=()=>print(edit?read():f,r||null,{medecin:c?.contreSigne?{nom:c.contreSigne.by,at:c.contreSigne.at}:null,mode:r?'signature':'',empreinte:r?.empreinte||''});
 }

 /* ================= Envoi automatique à la validation de la consultation ================= */
 // Le serveur envoie le consentement dès que la consultation validée est enregistrée ; ici on suit le résultat.
 const valide=new Map(),suivis=new Set();
 function autoEchec(sp){const c=sp.consentement,st=R.statut(c),a=sp.consentementAuto;return a&&a.ok===false&&!st.recu&&(!c?.envoi||st.code==='annule')?a:null}
 // Passage de la consultation affichée à « validée » (quel que soit l'écran qui l'a validée).
 function surveiller(s){const v=s.consult?.validated===true,prev=valide.get(s.id);valide.set(s.id,v);if(prev===false&&v&&isAnesth()&&shared())suivreEnvoiAuto(s)}
 setInterval(()=>{const s=cur();if(s)surveiller(s)},1000);
 async function suivreEnvoiAuto(s){
  if(suivis.has(s.id))return;suivis.add(s.id);
  try{
   // État connu juste avant la validation (le serveur peut répondre avant notre première lecture).
   const sp0=space(s),st0=R.statut(sp0.consentement);
   if(st0.recu||(sp0.consentement?.envoi&&st0.code!=='annule'))return;// déjà envoyé : pas de second envoi
   const avant=JSON.stringify(sp0.consentementAuto||null);
   toast('Consultation validée : envoi du consentement au patient…');
   await ctx.flush?.();
   for(let i=0;i<12;i++){
    await new Promise(r=>setTimeout(r,i?1500:300));await load(s);
    const a=space(s).consentementAuto;if(JSON.stringify(a||null)===avant)continue;
    const ch=(a.resultats||[]).filter(z=>z.sent).map(z=>z.channel==='sms'?'SMS':'e-mail').join(' et ');
    if(a.ok){toast('Consentement d’anesthésie envoyé au patient par '+ch+(a.partiel?.length?' · '+a.partiel.join(' · '):''));trace(s,'Consentement d’anesthésie envoyé automatiquement au patient ('+ch+')')}
    else{toast('Consentement NON envoyé : '+a.raison);trace(s,'Consentement d’anesthésie non envoyé automatiquement · '+a.raison)}
    if(cur()?.id===s.id){if(ctx.tab?.()===TAB_CONS)panelCons();else{document.querySelectorAll('#detail .dc-chip').forEach(x=>x.remove());detail(ctx.tab?.())}}
    return;
   }
  }finally{suivis.delete(s.id)}
 }

 /* ================= Alertes dans le dossier ================= */
 function detail(tab){
  const s=cur();if(!s)return;
  surveiller(s);
  const sp=space(s),al=R.alerteBloc({...s,espacePatient:sp}),chips=document.querySelector('#detail .pb-chips');
  const nouveaux=(sp.documents||[]).filter(d=>d.source==='patient'&&!d.vu&&!d.ecarte).length;
  if(chips&&!chips.querySelector('.dc-chip')){
   const autoKo=autoEchec(sp),showCons=autoKo||al.bloquant&&(al.niveau==='crit'||al.statut.code!=='aucun')||al.statut.aRevoir;
   const dp=R.datePrevueSejour(s),ko=(sp.rappelsAuto||[]).filter(e=>!e.ok&&e.date===dp&&(e.kind==='suivi-j+1'||!al.statut.recu));
   chips.insertAdjacentHTML('beforeend',`${ko.map(e=>`<button type="button" class="pb-chip dc-chip pb-crit" data-dc-goto="${e.kind==='suivi-j+1'?'suiviJ1':TAB_CONS}" title="${esc(e.raison||'')}">${I.alert}${esc(e.kind==='suivi-j+1'?'SMS J+1 non envoyé':'Rappel SMS du consentement non envoyé')}</button>`).join('')}${showCons?`<button type="button" class="pb-chip dc-chip ${autoKo||al.niveau==='crit'?'pb-crit':'pb-warn'}" data-dc-goto="${TAB_CONS}">${I.pen}${esc(autoKo?'Consentement non envoyé : à compléter':al.statut.aRevoir?'Consentement à revoir':al.statut.code==='aucun'?'Consentement non envoyé':al.statut.code==='depose'?'Consentement à vérifier':'Consentement non reçu')}</button>`:''}${nouveaux?`<button type="button" class="pb-chip dc-chip pb-info" data-dc-goto="${TAB_DOCS}">${I.file}${nouveaux} document${nouveaux>1?'s':''} du patient</button>`:''}`);
   chips.querySelectorAll('[data-dc-goto]').forEach(b=>b.onclick=()=>ctx.goTab?.(b.dataset.dcGoto));
  }
  // Feuille d'anesthésie : rappel visible avant l'induction.
  if(['perop','checklistHas'].includes(tab)&&al.bloquant){const c=$('#content');if(c&&!c.querySelector('.dc-perop-alert'))c.insertAdjacentHTML('afterbegin',`<div class="pp-banner is-crit dc-perop-alert no-print">${I.alert}<span><b>${esc(al.message)}</b> Vérifiez le consentement du patient avant l’induction.</span></div>`)}
  if(shared()&&!fresh.has(s.id))load(s,()=>{if(ctx.tab?.()===TAB_DOCS)panelDocs();else if(ctx.tab?.()===TAB_CONS)panelCons()});
 }

 return {TABS:[TAB_DOCS,TAB_CONS],panel:tab=>{if(tab===TAB_DOCS){panelDocs();return true}if(tab===TAB_CONS){panelCons();return true}return false},detail,space};
};
})();

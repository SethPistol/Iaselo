/* IASELO 1.1 · dix améliorations pour l'usage quotidien à la clinique.
   1 recherche rapide (Ctrl K) · 2 verrouillage du poste · 3 contrôle allergies ↔ médicaments · 4 réinjection d'antibioprophylaxie
   5 étiquettes et bracelet · 6 import du programme opératoire (E-med, CSV) · 7 bionettoyage partagé (dist/veille-plus.js)
   8 export du dossier (droit d'accès) · 9 feuille de relève de service · 10 NEWS2 en surveillance postopératoire.
   Règles pures : dist/ameliorations-regles.js. Aucune donnée ne quitte l'établissement : tout est calculé dans le navigateur. */
(function(root){
'use strict';
root.createAmeliorations=function(ctx){
 const A=root.IaseloAmeliorations,{$,esc,toast}=ctx;if(!A)return null;
 const patients=ctx.patients,cur=()=>ctx.current();
 const ICON={
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  relay:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8l1 3H7l1-3Z"/><rect x="5" y="7" width="14" height="14" rx="2"/><path d="M9 12h6M9 16h4"/></svg>',
  label:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6v12M8 6v12M11 6v12M15 6v12M19 6v12M13 6v12"/></svg>',
  export:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
  import:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m0 12-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4m0 3h.01"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>'
 };
 // serviceSectors est une constante globale de dist/service-sectors.js (portée globale partagée entre scripts).
 const sectorsMap=()=>{try{return serviceSectors}catch{return {}}};
 const job=()=>ctx.job()||'',physician=()=>['anesthesiste','chirurgien'].includes(job()),isAdmin=()=>ctx.access?.()?.profile?.isAdmin===true;
 const etab=()=>'assets/marque/etablissement.webp';
 const ident=s=>{const d=s?.identity||{};return {nom:String(d.usedName||d.birthName||d.lastName||'').toUpperCase(),prenom:d.usedFirstName||d.firstName||'',naissance:d.birthDate||'',sexe:d.sex||'',ipp:d.ipp||''}};
 const nom=s=>{const i=ident(s);return (i.nom||'Identité non renseignée')+(i.prenom?' '+i.prenom:'')};
 const fdate=iso=>iso?String(iso).slice(0,10).split('-').reverse().join('/'):'—';
 const age=iso=>{if(!iso)return '';const b=new Date(iso),n=new Date();let a=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))a--;return Number.isFinite(a)?a+' ans':''};
 const hm=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''};
 const dt=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',' ·'):String(iso||'')};
 const trace=(stay,text,kind='Modification')=>{if(!stay)return;(stay.events??=[]).unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text,kind})};
 const who=()=>{const a=ctx.access?.();return a?.profile?.display_name||a?.profile?.name||ctx.role()};
 function viewHeader(title,id){$('#title').textContent=title;const nw=$('#new');if(nw)nw.hidden=true;const st=$('#stats');if(st)st.hidden=true;document.body.classList.remove('j-home');document.body.classList.add('v-controle-on');document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id))}
 // Impression : un conteneur dédié, le reste de la page masqué le temps de l'impression.
 function printHtml(html,cls=''){let host=$('#am-print');if(!host){host=document.createElement('div');host.id='am-print';document.body.append(host)}host.className=cls;host.innerHTML=html;document.body.classList.add('am-printing');const done=()=>{document.body.classList.remove('am-printing');host.innerHTML='';removeEventListener('afterprint',done)};addEventListener('afterprint',done);setTimeout(()=>{window.print();setTimeout(()=>{if(document.body.classList.contains('am-printing')&&!matchMedia('print').matches)done()},1500)},60)}
 function dialog(id,cls=''){let d=document.getElementById(id);if(!d){d=document.createElement('dialog');d.id=id;d.className='am-dialog '+cls;document.body.append(d)}return d}

 /* ================= 1. Recherche rapide (Ctrl K) ================= */
 const palette=dialog('am-palette','am-pal');let palItems=[],palIndex=0;
 function palEntries(q){
  const n=A.norm(q).trim();
  const views=[...document.querySelectorAll('aside .nav[data-view]')].filter(b=>!b.hidden).map(b=>({type:'Écran',label:b.textContent.trim().replace(/\s*\d+$/,''),sub:'',run:()=>b.click()}));
  const actions=[
   {type:'Action',label:'Verrouiller le poste',sub:'Ctrl L · ressaisie du mot de passe',run:()=>lockNow('manuel')},
   {type:'Action',label:'Feuille de relève de service',sub:'Changement d’équipe',run:()=>ctx.setView('releve')},
   ...(canImport()?[{type:'Action',label:'Importer un programme opératoire (E-med, CSV)',sub:'Crée les séjours et remplit Bloc & lits',run:()=>openImport()}]:[]),
   ...(cur()?[{type:'Action',label:'Étiquettes et bracelet · '+nom(cur()),sub:'Code-barres du séjour '+cur().id,run:()=>openLabels(cur())}]:[]),
   ...[5,10,15,30].map(m=>({type:'Réglage',label:'Verrouillage automatique après '+m+' min',sub:m===lockMinutes()?'Réglage actuel de ce poste':'Ce poste',run:()=>{try{localStorage.setItem('iaselo-verrou-min',String(m))}catch{}armLock();toast('Verrouillage après '+m+' min d’inactivité sur ce poste')}}))
  ];
  const stays=patients.map(s=>{const i=ident(s);return {type:'Patient',label:nom(s),sub:[s.id,i.naissance?'né(e) le '+fdate(i.naissance):'',s.specialty,s.stage].filter(Boolean).join(' · '),hay:A.norm([i.nom,i.prenom,s.id,s.id.replace('É','E'),i.naissance,fdate(i.naissance),i.ipp,s.specialty,s.stage,s.task].join(' ')),run:()=>ctx.open(s.id)}});
  if(!n)return [...stays.slice(0,6),...actions.slice(0,3),...views.slice(0,4)];
  const terms=n.split(/\s+/),match=x=>terms.every(t=>(x.hay||A.norm(x.label+' '+x.sub)).includes(t));
  return [...stays.filter(match),...actions.filter(match),...views.filter(match)].slice(0,14);
 }
 function palRender(){const q=palette.querySelector('input').value;palItems=palEntries(q);palIndex=Math.min(palIndex,Math.max(0,palItems.length-1));
  palette.querySelector('ul').innerHTML=palItems.map((x,i)=>`<li role="option" aria-selected="${i===palIndex}" data-i="${i}"><span class="am-pal-type">${esc(x.type)}</span><span class="am-pal-main"><b>${esc(x.label)}</b>${x.sub?`<small>${esc(x.sub)}</small>`:''}</span></li>`).join('')||'<li class="am-pal-empty">Aucun résultat. Essayez un nom, une date de naissance (jj/mm/aaaa) ou un numéro de séjour.</li>';
  palette.querySelectorAll('li[data-i]').forEach(li=>{li.onclick=()=>palRun(Number(li.dataset.i));li.onmousemove=()=>{if(palIndex!==Number(li.dataset.i)){palIndex=Number(li.dataset.i);palette.querySelectorAll('li[data-i]').forEach(x=>x.setAttribute('aria-selected',x===li))}}});
  palette.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});}
 function palRun(i){const x=palItems[i];if(!x)return;palette.close();x.run()}
 function openPalette(){if(locked)return;palette.innerHTML=`<div class="am-pal-box"><label class="am-pal-field">${ICON.search}<input type="text" placeholder="Patient, date de naissance, séjour, écran ou action…" aria-label="Recherche rapide" autocomplete="off"><kbd>Échap</kbd></label><ul role="listbox" aria-label="Résultats"></ul><p class="am-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> choisir</span><span><kbd>Entrée</kbd> ouvrir</span><span>Recherche dans votre périmètre de soins uniquement</span></p></div>`;
  const input=palette.querySelector('input');palIndex=0;input.oninput=()=>{palIndex=0;palRender()};
  input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();palIndex=Math.min(palIndex+1,palItems.length-1);palRender()}else if(e.key==='ArrowUp'){e.preventDefault();palIndex=Math.max(palIndex-1,0);palRender()}else if(e.key==='Enter'){e.preventDefault();palRun(palIndex)}};
  palette.onclick=e=>{if(e.target===palette)palette.close()};palRender();palette.showModal();input.focus()}
 document.addEventListener('keydown',e=>{if(locked)return;const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==='k'){e.preventDefault();palette.open?palette.close():openPalette()}else if((e.ctrlKey||e.metaKey)&&e.shiftKey&&k==='l'){e.preventDefault();lockNow('manuel')}});
 // Bouton dans le menu, sous le logo.
 const brand=document.querySelector('aside .brand');
 if(brand&&!$('#am-search-btn')){const b=document.createElement('button');b.type='button';b.id='am-search-btn';b.className='am-search-btn';b.innerHTML=ICON.search+'<span>Rechercher</span><kbd>Ctrl K</kbd>';b.onclick=openPalette;brand.after(b)}

 /* ================= 2. Verrouillage du poste ================= */
 let locked=false,lockTimer=null,lastActivity=Date.now();
 const lockMinutes=()=>{try{const m=Number(localStorage.getItem('iaselo-verrou-min'));return [5,10,15,30].includes(m)?m:10}catch{return 10}};
 const lockDlg=dialog('am-lock','am-lockscreen');
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('iaselo-verrou'):null;
 function armLock(){clearTimeout(lockTimer);if(locked)return;lockTimer=setTimeout(()=>{if(Date.now()-lastActivity>=lockMinutes()*60000-500)lockNow('inactivité');else armLock()},Math.max(1000,lockMinutes()*60000-(Date.now()-lastActivity)))}
 const activity=()=>{if(locked)return;const now=Date.now();if(now-lastActivity>5000){lastActivity=now;armLock()}else lastActivity=now};
 ['pointerdown','keydown','wheel','touchstart','mousemove'].forEach(t=>document.addEventListener(t,activity,{passive:true,capture:true}));
 async function lockNow(reason,fromOther=false){
  if(locked)return;locked=true;clearTimeout(lockTimer);if(palette.open)palette.close();
  document.querySelectorAll('dialog[open]').forEach(d=>{if(d!==lockDlg)d.dataset.amWasOpen='1'});
  let method='password';
  try{const r=await fetch('/auth/lock',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const j=await r.json().catch(()=>({}));method=j.method||method}catch{}
  if(!fromOther)channel?.postMessage({type:'lock'});
  lockDlg.innerHTML=`<div class="am-lock-box"><div class="am-lock-logos"><span><img class="i-clair" src="assets/marque/iaselo.webp" alt="iaselo"><img class="i-sombre" src="assets/marque/iaselo-sombre.webp" alt="iaselo"></span><span><img class="i-clair" src="assets/marque/etablissement.webp" alt="Établissement"><img class="i-sombre" src="assets/marque/etablissement-sombre.webp" alt="Établissement"></span></div><span class="am-lock-icon">${ICON.lock}</span><h2>Poste verrouillé</h2><p class="am-lock-who">Session de <b>${esc(who())}</b></p><p class="am-lock-why">${reason==='inactivité'?'Verrouillé automatiquement après '+lockMinutes()+' minutes sans activité.':'Verrouillé à la demande.'} Les dossiers sont masqués ; vos saisies en cours sont conservées sur cet écran.</p>
   ${method==='psc'?`<p class="am-lock-why">Connexion par Pro Santé Connect : déverrouillez avec le mot de passe de votre compte IASELO, ou reconnectez-vous.</p>`:''}
   <form class="am-lock-form"><label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label><p class="am-lock-err" role="alert"></p><button class="primary">Déverrouiller</button></form>
   <form method="post" action="/auth/logout" class="am-lock-out"><button class="secondary">Changer d’utilisateur (se déconnecter)</button></form>
   <p class="am-lock-note">Cinq erreurs ferment la session. Chaque verrouillage est tracé.</p></div>`;
  lockDlg.addEventListener('cancel',e=>e.preventDefault());
  const f=lockDlg.querySelector('.am-lock-form');
  f.onsubmit=async e=>{e.preventDefault();const btn=f.querySelector('button'),err=f.querySelector('.am-lock-err');btn.disabled=true;err.textContent='';
   try{const r=await fetch('/auth/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:f.password.value})});const j=await r.json().catch(()=>({}));
    if(r.ok){unlockLocal();channel?.postMessage({type:'unlock'});return}
    if(j.logout){location.href='/login';return}err.textContent=j.error||'Déverrouillage impossible.';f.password.value='';f.password.focus();
   }catch{err.textContent='Serveur injoignable : vérifiez la connexion.'}finally{btn.disabled=false}};
  lockDlg.showModal();document.body.classList.add('am-locked');setTimeout(()=>f.password.focus(),50);
 }
 function unlockLocal(){locked=false;lockDlg.close();lockDlg.innerHTML='';document.body.classList.remove('am-locked');lastActivity=Date.now();armLock();
  // Relance l'enregistrement automatique des saisies restées en attente pendant le verrouillage.
  document.dispatchEvent(new Event('change',{bubbles:true}));toast('Poste déverrouillé')}
 if(channel)channel.onmessage=e=>{if(e.data?.type==='lock')lockNow('manuel',true);if(e.data?.type==='unlock'&&locked)unlockLocal()};
 const bottom=document.querySelector('aside .asidebottom');
 if(bottom&&!$('#am-lock-btn')){const b=document.createElement('button');b.type='button';b.id='am-lock-btn';b.className='secondary am-lock-btn';b.innerHTML=ICON.lock+'Verrouiller le poste';b.title='Ctrl Maj L · automatique après '+lockMinutes()+' min sans activité';b.onclick=()=>lockNow('manuel');bottom.prepend(b)}
 armLock();

 /* ================= 3. Contrôle allergies ↔ médicaments ================= */
 const allergiesOf=s=>String(s?.consult?.allergies??'');
 function drugOf(form){if(form.id==='rxform'){return form.querySelector('[name=category]')?.value==='Médicament'?form.querySelector('[name=name]')?.value||'':''}const d=form.querySelector('[name=drug]');return d?d.value:''}
 function allergyBox(form,alerts,blocking){
  form.querySelector('.am-allergy')?.remove();if(!alerts.length)return null;
  const box=document.createElement('div');box.className='am-allergy '+(alerts.some(a=>a.niveau==='allergie')?'am-allergy-stop':'am-allergy-warn');box.setAttribute('role','alert');
  box.innerHTML=`<div class="am-allergy-head">${ICON.alert}<b>${alerts.some(a=>a.niveau==='allergie')?'Allergie connue':'Réactivité croisée possible'}</b></div>${alerts.map(a=>`<p>${esc(a.message)}</p>`).join('')}<p class="am-allergy-src">Allergies du dossier : « ${esc(allergiesOf(cur()))} »</p>${blocking?`<label>Motif pour poursuivre (tracé dans le dossier)<input name="am-allergy-motif" maxlength="200" placeholder="Ex. : réaction ancienne non allergique, avis allergologue du…"></label><div class="am-allergy-actions"><button type="button" class="secondary" data-am-allergy-cancel>Corriger la saisie</button><button type="button" class="primary am-danger" data-am-allergy-force>Poursuivre malgré l’alerte</button></div>`:''}`;
  const anchor=form.querySelector('button.primary,button[type=submit],button:not([type])');(anchor?.parentElement===form?anchor:form.lastElementChild).before(box);return box;
 }
 document.addEventListener('submit',e=>{
  const form=e.target;if(!(form instanceof HTMLFormElement)||!(form.id==='rxform'||form.querySelector('[name=drug]')))return;
  const drug=drugOf(form).trim(),stay=cur();if(!drug||!stay)return;
  const alerts=A.controleAllergies(allergiesOf(stay),drug);if(!alerts.length){form.querySelector('.am-allergy')?.remove();return}
  if(form.dataset.amAllergyOk===drug){delete form.dataset.amAllergyOk;return}
  e.preventDefault();e.stopImmediatePropagation();clearTimeout(form._amT);form.dataset.amBlock=drug;
  const box=allergyBox(form,alerts,true);box.scrollIntoView({block:'center',behavior:'smooth'});
  box.querySelector('[data-am-allergy-cancel]').onclick=()=>{box.remove();(form.querySelector('[name=drug]')||form.querySelector('[name=name]'))?.focus()};
  box.querySelector('[data-am-allergy-force]').onclick=()=>{const motif=box.querySelector('[name=am-allergy-motif]').value.trim();if(motif.length<5){box.querySelector('[name=am-allergy-motif]').focus();toast('Indiquez le motif pour poursuivre');return}
   trace(stay,'Alerte allergie passée outre : '+drug+' · '+alerts.map(a=>a.classe).join(', ')+' · motif : '+motif+' ('+who()+')','Sécurité médicamenteuse');form.dataset.amAllergyOk=drug;box.remove();form.requestSubmit()};
 },true);
 // Alerte en direct pendant la saisie du médicament (sans bloquer).
 document.addEventListener('input',e=>{const t=e.target;if(!(t instanceof HTMLInputElement)||!['drug','name','category'].includes(t.name))return;const form=t.form;if(!form||!(form.id==='rxform'||form.querySelector('[name=drug]')))return;clearTimeout(form._amT);form._amT=setTimeout(()=>{const drug=drugOf(form).trim();if(drug&&drug===form.dataset.amBlock&&form.querySelector('[data-am-allergy-force]'))return;allergyBox(form,drug?A.controleAllergies(allergiesOf(cur()),drug):[],false)},250)},true);

 /* ================= 4. Réinjection d'antibioprophylaxie ================= */
 const abxLabel={'a-venir':'À venir',bientot:'Dans moins de 15 min',due:'À faire maintenant',depassee:'En retard',sans:'Sans réinjection'};
 function abxCard(stay){const list=A.reinjections(stay?.perop?.records||[]);if(!list.length)return '';
  return `<section class="am-abx no-print" data-am-abx>${list.map(x=>`<div class="am-abx-row am-abx-${x.statut}"><span class="am-abx-ico">${ICON.clock}</span><div><b>Antibioprophylaxie · ${esc(x.label)}</b><small>Dernière injection ${esc(hm(x.derniere))}${x.injections>1?' · '+x.injections+' injections':''}${x.intervalle?' · réinjection toutes les '+x.intervalle+' h : '+esc(x.dose):' · '+esc(x.message)}</small></div>${x.intervalle?`<div class="am-abx-when"><strong>${esc(hm(x.prochaine))}</strong><span>${x.resteMinutes>=0?'dans '+A.duree(x.resteMinutes):'depuis '+A.duree(x.resteMinutes)}</span><em>${abxLabel[x.statut]}</em></div>`:''}</div>`).join('')}<p class="am-abx-foot">Délais SFAR 2024 (deux demi-vies) proposés par défaut, à relire par l’équipe. Tracez la réinjection dans « Médicament ».</p></section>`}
 const inBloc=s=>s&&(['salle','prepare'].includes(s.blocStatut?.state)||s.stage==='Intervention');
 function abxAlerts(){
  if(!['anesthesiste','infirmier',''].includes(job()))return;
  const due=patients.filter(inBloc).flatMap(s=>A.reinjections(s.perop?.records||[]).filter(x=>['bientot','due','depassee'].includes(x.statut)).map(x=>({s,x})));
  let bar=$('#am-abx-alert');if(!due.length){bar?.remove();return}
  if(!bar){bar=document.createElement('div');bar.id='am-abx-alert';bar.className='am-abx-alert no-print';bar.setAttribute('role','status');document.body.append(bar)}
  const html=due.map(({s,x})=>`<div class="am-abx-${x.statut}">${ICON.clock}<span><b>${esc(x.label)} · ${esc(nom(s))}</b><small>Réinjection ${esc(x.dose)} ${x.resteMinutes>=0?'dans '+A.duree(x.resteMinutes):'en retard de '+A.duree(x.resteMinutes)} (${esc(hm(x.prochaine))})</small></span><button type="button" class="secondary" data-am-open="${esc(s.id)}">Ouvrir</button></div>`).join('');if(bar.dataset.h===html)return;bar.dataset.h=html;bar.innerHTML=html;
  bar.querySelectorAll('[data-am-open]').forEach(b=>b.onclick=()=>ctx.open(b.dataset.amOpen,'perop'));
 }
 setInterval(()=>{if(!locked){abxAlerts();const c=document.querySelector('[data-am-abx]');if(c&&ctx.tab()==='perop'){c.outerHTML=abxCard(cur())}}},30000);

 /* ================= 5. Étiquettes et bracelet ================= */
 function labelHtml(s,i){return `<div class="am-label"><div class="am-label-id"><b>${esc(i.nom)}</b> ${esc(i.prenom)}<br><span>Né(e) le ${esc(fdate(i.naissance))}${i.sexe?' · '+esc(i.sexe):''}</span><br><span>Séjour ${esc(s.id)}${i.ipp?' · IPP '+esc(i.ipp):''}</span></div>${A.code128Svg(s.id,{hauteur:30,module:1.15})}</div>`}
 function openLabels(s){
  const i=ident(s),d=dialog('am-labels');const missing=[!i.nom&&'nom',!i.prenom&&'prénom',!i.naissance&&'date de naissance'].filter(Boolean);
  d.innerHTML=`<form method="dialog" class="am-dlg"><header><h2>Étiquettes et bracelet</h2><button class="icon" value="close" aria-label="Fermer">×</button></header>
  <p>Identité imprimée telle qu’elle figure dans le dossier : vérifiez-la avec le patient (nom de naissance, prénom, date de naissance, sexe). Le code-barres porte le numéro de séjour.</p>
  ${missing.length?`<p class="am-warn">${ICON.alert} Identité incomplète (${esc(missing.join(', '))}) : complétez-la dans « Identité & INS » avant d’imprimer.</p>`:''}
  <div class="am-label-preview">${labelHtml(s,i)}</div>
  <div class="am-dlg-grid"><label>Planche d’étiquettes (A4, 3 × 8)<select name="sheets"><option value="0">Aucune</option><option value="1" selected>1 planche (24 étiquettes)</option><option value="2">2 planches</option></select></label><label>Bracelet d’identification<select name="bracelet"><option value="1" selected>1 bracelet</option><option value="0">Aucun</option></select></label></div>
  <footer><button class="secondary" value="close">Annuler</button><button type="button" class="primary" data-am-print ${missing.length?'disabled':''}>Imprimer</button></footer></form>`;
  d.querySelector('[data-am-print]').onclick=()=>{const sheets=Number(d.querySelector('[name=sheets]').value),bracelet=d.querySelector('[name=bracelet]').value==='1';d.close();
   const pages=[];if(bracelet)pages.push(`<section class="am-bracelet-page"><div class="am-bracelet"><img src="${esc(etab())}" alt=""><div class="am-bracelet-id"><b>${esc(i.nom)}</b> ${esc(i.prenom)}<span>Né(e) le ${esc(fdate(i.naissance))}${i.sexe?' · '+esc(i.sexe):''} · ${esc(s.id)}</span></div>${A.code128Svg(s.id,{hauteur:34,module:1.3})}</div><p class="am-cut">Découper le long du cadre · bracelet à poser et vérifier avec le patient</p></section>`);
   for(let k=0;k<sheets;k++)pages.push(`<section class="am-sheet">${Array.from({length:24},()=>labelHtml(s,i)).join('')}</section>`);
   if(!pages.length)return;trace(s,'Impression d’étiquettes d’identification ('+sheets+' planche(s)'+(bracelet?', 1 bracelet':'')+')','Identitovigilance');printHtml(pages.join(''),'am-print-labels')};
  d.showModal();
 }

 /* ================= 6. Import du programme opératoire (E-med, CSV) ================= */
 const canImport=()=>['anesthesiste','chirurgien','secretariat'].includes(job())||isAdmin();
 const PC=()=>root.PlanningCore;
 function rooms(){const m=ctx.management?.();return (m?.planningResources||[]).filter(r=>PC().kind(r)==='room'&&r.open!==false)}
 function staffList(){const m=ctx.management?.();return (m?.planningResources||[]).filter(r=>PC().kind(r)==='staff'&&r.open!==false)}
 function matchRoom(text,list){const t=A.norm(text);if(!t)return '';const n=(t.match(/\d+/)||[])[0],endo=/endo/.test(t);
  const exact=list.find(r=>A.norm(r.label)===t||A.norm(r.id)===t);if(exact)return exact.id;
  const cand=list.filter(r=>(!n||new RegExp('(salle|poste|place)\\s*'+n+'\\b').test(A.norm(r.label)))&&(endo?/endo/.test(A.norm(r.label+r.sector)):!/endo/.test(A.norm(r.sector||''))));return cand[0]?.id||''}
 const sameId=(s,v)=>{const i=ident(s);return A.norm(i.nom)===A.norm(v.nom)&&A.norm(i.prenom)===A.norm(v.prenom)&&i.naissance===v.naissance};
 const hourDown=s=>s.slice(0,14)+'00',hourUp=s=>s.slice(14,16)==='00'?s:PC().addMinutes(s.slice(0,14)+'00',60);
 function openImport(){
  if(!canImport()){toast('Import réservé aux médecins, au secrétariat et aux administrateurs');return}
  const d=dialog('am-import','am-wide'),teams=ctx.teams?.()||[];let parsed=null,source='',groups=[];const staffPick={};
  d.innerHTML=`<form method="dialog" class="am-dlg"><header><h2>Importer un programme opératoire</h2><button class="icon" value="close" aria-label="Fermer">×</button></header>
   <p>Fichier CSV exporté d’E-med (ou d’un tableur) : une ligne par intervention. Les colonnes sont reconnues par leur titre (nom, prénom, date de naissance, date, heure, durée, salle, intervention, chirurgien…). Rien n’est enregistré avant votre validation.</p>
   <p class="am-warn">${ICON.alert} Version de démonstration : n’importez que des fichiers <b>fictifs</b>, aucune donnée réelle de patient.</p>
   <div class="am-dlg-grid"><label>Fichier CSV<input type="file" name="file" accept=".csv,.txt,text/csv"></label><label>Équipe de soins des nouveaux séjours<select name="team" required>${teams.map(t=>`<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')||'<option value="">Aucune équipe</option>'}</select></label><label>Salle si non reconnue<select name="room">${rooms().map(r=>`<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('')}</select></label></div>
   <p class="am-muted"><button type="button" class="am-link" data-am-model>Télécharger un modèle de fichier</button> · séparateur point-virgule, virgule ou tabulation ; dates jj/mm/aaaa.</p>
   <div class="am-import-preview" aria-live="polite"></div>
   <footer><button class="secondary" value="close">Annuler</button><button type="button" class="primary" data-am-do disabled>Importer</button></footer></form>`;
  d.querySelector('[data-am-model]').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+A.MODELE_CSV],{type:'text/csv'}));a.download='modele-programme-operatoire.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  const roomLabel=id=>rooms().find(r=>r.id===id)?.label||id;
  const preview=()=>{const host=d.querySelector('.am-import-preview'),btn=d.querySelector('[data-am-do]');if(!parsed){host.innerHTML='';btn.disabled=true;return}
   const m=ctx.management?.()||{},list=rooms(),def=d.querySelector('[name=room]').value,bookings=m.reservations||[],vacs=(m.vacations||[]).filter(v=>v.state!=='Annulée'),staff=staffList();
   const placed=[];
   parsed.lignes.forEach(l=>{l.room=matchRoom(l.salle,list)||def;l.roomGuess=!matchRoom(l.salle,list);l.existing=patients.find(s=>sameId(s,l)&&s.stage!=='Sortie')||null;l.start=l.date&&l.heure?l.date+'T'+l.heure:'';l.end=l.start?PC().addMinutes(l.start,l.duree+15):'';
    l.doublon=!!(l.existing&&bookings.some(b=>b.patient===l.existing.id&&b.start===l.start&&b.state!=='Annulée'));
    l.conflit=!l.erreurs.length&&!l.doublon&&l.start?bookings.concat(placed).some(b=>b.resource===l.room&&!['Annulée','Terminée'].includes(b.state)&&b.start<l.end&&l.start<b.end):false;
    l.ok=!l.erreurs.length&&!l.doublon&&!l.conflit;if(l.ok)placed.push({resource:l.room,start:l.start,end:l.end,state:'Réservée'});
    l.vac=l.ok?vacs.find(v=>v.resource===l.room&&l.start>=v.start&&l.end<=v.end)||null:null});
   // Créneaux hors vacation : une vacation par salle et par jour est proposée, avec le personnel à choisir.
   const g=new Map();for(const l of parsed.lignes.filter(l=>l.ok&&!l.vac)){const k=l.room+'|'+l.date;const x=g.get(k)||{key:k,room:l.room,date:l.date,start:hourDown(l.start),end:hourUp(l.end)};if(hourDown(l.start)<x.start)x.start=hourDown(l.start);if(hourUp(l.end)>x.end)x.end=hourUp(l.end);g.set(k,x)}
   groups=[...g.values()];
   const ok=parsed.lignes.filter(l=>l.ok);
   host.innerHTML=`${parsed.manquantes.length?`<p class="am-warn">${ICON.alert} Colonnes introuvables : ${esc(parsed.manquantes.join(', '))}. Vérifiez la première ligne du fichier.</p>`:''}<p class="am-import-sum"><b>${ok.length}</b> intervention(s) prête(s) · ${ok.filter(l=>!l.existing).length} nouveau(x) séjour(s) · ${ok.filter(l=>l.existing).length} patient(s) déjà connu(s) · ${parsed.lignes.length-ok.length} ligne(s) écartée(s)</p>
   <div class="am-scroll"><table class="am-table"><thead><tr><th>Ligne</th><th>Patient</th><th>Intervention</th><th>Créneau</th><th>Salle</th><th>État</th></tr></thead><tbody>${parsed.lignes.map(l=>`<tr class="${l.ok?'':'am-row-off'}"><td>${l.n}</td><td><b>${esc(l.nom)} ${esc(l.prenom)}</b><small>${esc(fdate(l.naissance))}${l.sexe?' · '+l.sexe:''}${l.ipp?' · IPP '+esc(l.ipp):''}</small></td><td>${esc(l.intervention||'—')}<small>${esc(l.specialite)} · ${esc(l.mode)}${l.chirurgien?' · '+esc(l.chirurgien):''}</small></td><td>${esc(fdate(l.date))} ${esc(l.heure)}<small>${l.duree} min + 15 min de remise en état</small></td><td>${esc(roomLabel(l.room))}${l.roomGuess&&l.salle?`<small>« ${esc(l.salle)} » non reconnue</small>`:''}</td><td>${l.erreurs.length?`<span class="am-tag am-tag-stop">${esc(l.erreurs.join(', '))}</span>`:l.doublon?'<span class="am-tag">Déjà importée</span>':l.conflit?'<span class="am-tag am-tag-stop">Créneau déjà occupé dans cette salle</span>':l.existing?`<span class="am-tag am-tag-ok">Patient connu · ${esc(l.existing.id)}</span>`:'<span class="am-tag am-tag-ok">Nouveau séjour</span>'}</td></tr>`).join('')}</tbody></table></div>
   ${groups.length?`<section class="am-vac"><h3>Vacations à ouvrir</h3><p class="am-muted">${staff.length?'Ces créneaux ne tiennent dans aucune vacation ouverte. Choisissez le personnel de chaque vacation proposée.':'Aucun personnel n’est déclaré dans Bloc & lits › Ressources : les séjours seront créés, les créneaux restent à placer dans le planning.'}</p>${staff.length?groups.map(x=>`<fieldset data-group="${esc(x.key)}"><legend>${esc(roomLabel(x.room))} · ${esc(fdate(x.date))} · ${esc(x.start.slice(11))}–${esc(x.end.slice(11))}</legend>${staff.map(s=>`<label><input type="checkbox" value="${esc(s.id)}" ${(staffPick[x.key]||[]).includes(s.id)?'checked':''}> ${esc(s.label)}</label>`).join('')}</fieldset>`).join(''):''}<p class="am-vac-err" role="alert"></p></section>`:''}`;
   host.querySelectorAll('fieldset[data-group]').forEach(f=>f.onchange=()=>{staffPick[f.dataset.group]=[...f.querySelectorAll('input:checked')].map(i=>i.value);check()});
   btn.disabled=!ok.length||!d.querySelector('[name=team]').value;btn.textContent=ok.length?'Importer '+ok.length+' intervention(s)':'Importer';check()};
  function newVacations(){const m=ctx.management?.()||{};return staffList().length?groups.map(x=>({id:'VAC-'+crypto.randomUUID(),resource:x.room,label:'Programme importé · '+roomLabel(x.room),start:x.start,end:x.end,staffIds:staffPick[x.key]||[],state:'Ouverte',key:x.key})):[]}
  function check(){const err=d.querySelector('.am-vac-err');if(!err)return true;const m=ctx.management?.()||{},vs=newVacations(),all=[...(m.vacations||[])];let msg='';
   for(const v of vs){const e=PC().vacationError(v,all,m.planningResources||[]);if(e){msg=roomLabel(v.resource)+' : '+e;break}all.push(v)}
   err.textContent=msg;const btn=d.querySelector('[data-am-do]');if(parsed&&parsed.lignes.some(l=>l.ok))btn.disabled=!!msg||!d.querySelector('[name=team]').value;return !msg}
  d.querySelector('[name=file]').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>2e6){toast('Fichier trop volumineux (2 Mo au plus)');return}const buf=await f.arrayBuffer();let text=new TextDecoder('utf-8').decode(buf);if(text.includes('\uFFFD'))text=new TextDecoder('windows-1252').decode(buf);source=f.name;parsed=A.lireProgramme(text);preview()};
  d.querySelector('[name=room]').onchange=preview;d.querySelector('[name=team]').onchange=preview;
  d.querySelector('[data-am-do]').onclick=()=>{
   const m=ctx.management?.();if(!m){toast('Planning indisponible');return}if(!check())return;
   const team=d.querySelector('[name=team]').value,rows=parsed.lignes.filter(l=>l.ok),vs=newVacations();let created=0,booked=0;
   for(const v of vs){const {key,...vac}=v;m.vacations.push(vac)}
   for(const l of rows){
    let s=l.existing;
    if(!s){s={id:'DÉMO-'+crypto.randomUUID().slice(0,12),identity:{lastName:l.nom,firstName:l.prenom,birthDate:l.naissance,...(l.sexe?{sex:l.sexe==='F'?'Féminin':'Masculin'}:{}),...(l.ipp?{ipp:l.ipp}:{})},careTeamId:team,specialty:l.specialite,mode:l.mode,stage:'Consultation',task:'Programmé le '+fdate(l.date)+' à '+l.heure+(l.intervention?' · '+l.intervention:''),done:false,consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},events:[]};patients.push(s);created++;}
    const vac=l.vac||vs.find(v=>v.key===l.room+'|'+l.date);
    trace(s,'Intervention programmée par import ('+source+') : '+(l.intervention||'intervention')+' le '+fdate(l.date)+' à '+l.heure+(l.chirurgien?' · '+l.chirurgien:'')+(vac?'':' · créneau à placer dans le planning'),'Programmation');
    if(vac&&vac.staffIds?.length){m.reservations.push({id:'RES-'+crypto.randomUUID(),planningVersion:1,patient:s.id,resource:l.room,vacationId:vac.id,procedure:l.intervention||'Intervention programmée',start:l.start,end:l.end,duration:l.duree,turnover:15,staffIds:vac.staffIds,equipmentIds:[],note:['Import '+source,l.chirurgien&&'Chirurgien : '+l.chirurgien,l.anesthesiste&&'Anesthésiste : '+l.anesthesiste].filter(Boolean).join(' · '),state:'Réservée',phase:'primary'});booked++}
   }
   d.close();toast(rows.length+' intervention(s) importée(s) · '+created+' séjour(s) créé(s) · '+booked+' créneau(x) placé(s)');ctx.setView('regulation');document.dispatchEvent(new Event('change',{bubbles:true}));
  };
  d.showModal();
 }

 /* ================= 8. Export du dossier (droit d'accès du patient) ================= */
 const LIB={identity:'Identité',consult:'Consultation d’anesthésie',questionnaire:'Questionnaire du patient',surgicalAnnouncement:'Annonce chirurgicale',prepActions:'Préparation',perop:'Feuille d’anesthésie',rx:'Prescriptions',notes:'Notes',postopVitals:'Surveillance postopératoire',nursingRecord:'Dossier infirmier',cro:'Compte rendu opératoire',discharge:'Sortie',events:'Historique du dossier',preadmission:'Préadmission',checklistBloc:'Check-list HAS',blocStatut:'Statut bloc',suiviAmbu:'Suivi après sortie',periopPlus:'Bilans et visite préanesthésique',peropRapide:'Saisie rapide au bloc',soinsPlus:'Soins',sortiePlus:'Sortie (compléments)',codage:'Codage',aideCpa:'Aide à la consultation',envoisInterop:'Envois DMP / MSSanté',bionettoyage:'Bionettoyage',medicationCircuit:'Circuit du médicament',droitsRgpd:'Demandes d’exercice des droits',scientificDecisions:'Décisions argumentées'};
 const KEY={lastName:'Nom',firstName:'Prénom',birthDate:'Date de naissance',sex:'Sexe',birthName:'Nom de naissance',birthPlace:'Lieu de naissance',ipp:'IPP',asa:'ASA',history:'Antécédents',allergies:'Allergies',treatments:'Traitements',plan:'Plan',validated:'Validé',summary:'Synthèse',instructions:'Consignes',at:'Date',author:'Auteur',role:'Fonction',text:'Texte',kind:'Type',name:'Libellé',category:'Catégorie',values:'Valeurs',records:'Enregistrements',context:'Contexte',drug:'Médicament',amount:'Dose',unit:'Unité',sbp:'PAS',dbp:'PAD',hr:'FC',spo2:'SpO₂',temp:'Température',rr:'FR',pain:'Douleur',location:'Lieu',o2:'Oxygène',avpu:'Conscience',label:'Libellé',owner:'Responsable',due:'Échéance',state:'État',note:'Note',priority:'Priorité',title:'Intitulé',status:'Statut',occurredAt:'Date de réalisation',recordedAt:'Date de saisie',authorLabel:'Auteur',ownerLabel:'Responsable',observations:'Données',actions:'Actions',results:'Résultats',target:'Cible',format:'Format',created:'Saisi le',mode:'Mode',executions:'Administrations',validatedAt:'Validé le',etat:'État',by:'Par'};
 const SKIP=new Set(['sharedDirty','sharedSavedConsult','lastDraftAt','medRows','careTeamId','done','id','doctorId','authorId','ownerId','planId','requestId','sourceId','lastEventId','ext','planningVersion']);
 function readable(v,depth=0){
  if(v===null||v===undefined||v==='')return '<span class="am-x-empty">—</span>';
  if(typeof v==='boolean')return v?'Oui':'Non';
  if(typeof v!=='object'){const t=String(v);return esc(/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(t)?new Date(t).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):/^\d{4}-\d\d-\d\d$/.test(t)?fdate(t):t).replace(/\n/g,'<br>')}
  if(v.$file)return 'Pièce jointe : '+esc(v.name||'document')+' ('+esc(v.type||'fichier')+')';
  if(v instanceof Blob)return 'Pièce jointe : '+esc(v.name||'document');
  if(Array.isArray(v)){if(!v.length)return '<span class="am-x-empty">Aucun élément</span>';if(v.every(x=>typeof x!=='object'))return v.map(x=>esc(String(x))).join(', ');return `<ol class="am-x-list">${v.map(x=>`<li>${readable(x,depth+1)}</li>`).join('')}</ol>`}
  const e=Object.entries(v).filter(([k,x])=>!SKIP.has(k)&&x!==''&&x!==null&&x!==undefined&&!(Array.isArray(x)&&!x.length));if(!e.length)return '<span class="am-x-empty">—</span>';
  return `<dl class="am-x-dl">${e.map(([k,x])=>`<div><dt>${esc(KEY[k]||LIB[k]||k)}</dt><dd>${readable(x,depth+1)}</dd></div>`).join('')}</dl>`;
 }
 const canExport=()=>physician()||isAdmin();
 function exportDossier(s){
  if(!canExport()){toast('Export réservé aux médecins et aux administrateurs');return}
  const d=dialog('am-export'),i=ident(s);
  d.innerHTML=`<form method="dialog" class="am-dlg"><header><h2>Exporter le dossier · droit d’accès</h2><button class="icon" value="close" aria-label="Fermer">×</button></header>
   <p>Pour répondre à une demande du patient (RGPD art. 15 et 20, Code de la santé publique L. 1111-7) : document lisible à imprimer ou enregistrer en PDF, et fichier structuré (JSON) pour la portabilité.</p>
   <p class="am-warn">${ICON.alert} Vérifiez l’identité du demandeur avant toute remise. L’export est tracé dans le dossier avec votre nom.</p>
   <label>Motif / référence de la demande<input name="motif" maxlength="160" placeholder="Ex. : demande écrite du patient reçue le …" required></label>
   <footer><button class="secondary" value="close">Annuler</button><button type="button" class="secondary" data-am-json>Fichier structuré (JSON)</button><button type="button" class="primary" data-am-pdf>Document à imprimer / PDF</button></footer></form>`;
  const go=kind=>{const motif=d.querySelector('[name=motif]').value.trim();if(motif.length<5){d.querySelector('[name=motif]').focus();toast('Indiquez le motif de la demande');return}d.close();
   trace(s,'Export du dossier ('+(kind==='json'?'fichier structuré':'document imprimable')+') pour droit d’accès · motif : '+motif+' · '+who(),'Droits du patient');
   const data=Object.fromEntries(Object.entries(s).filter(([k])=>!SKIP.has(k)));
   if(kind==='json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({exporteLe:new Date().toISOString(),exportePar:who(),motif,etablissement:document.title.split('·').pop().trim(),sejour:data},null,1)],{type:'application/json'}));a.download='dossier-'+s.id.replace(/[^A-Za-z0-9-]/g,'')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return}
   const order=['identity','consult','questionnaire','surgicalAnnouncement','preadmission','periopPlus','prepActions','checklistBloc','perop','peropRapide','cro','postopVitals','nursingRecord','rx','medicationCircuit','soinsPlus','discharge','sortiePlus','suiviAmbu','notes','events'];
   const keys=[...order.filter(k=>k in data),...Object.keys(data).filter(k=>!order.includes(k)&&!['id','specialty','mode','stage','task','sector'].includes(k))];
   printHtml(`<article class="am-x"><header class="am-x-head"><img src="${esc(etab())}" alt=""><div><h1>Dossier patient · copie remise au titre du droit d’accès</h1><p><b>${esc(i.nom)} ${esc(i.prenom)}</b> · né(e) le ${esc(fdate(i.naissance))} · séjour ${esc(s.id)} · ${esc(s.specialty)} · ${esc(s.mode)}</p><p>Édité le ${esc(new Date().toLocaleString('fr-FR'))} par ${esc(who())} · motif : ${esc(motif)}</p></div></header>${keys.map(k=>`<section class="am-x-sec"><h2>${esc(LIB[k]||k)}</h2>${readable(data[k])}</section>`).join('')}<footer class="am-x-foot">Document généré par IASELO. Les pièces jointes sont listées ; elles sont remises séparément.</footer></article>`,'am-print-export')};
  d.querySelector('[data-am-pdf]').onclick=()=>go('pdf');d.querySelector('[data-am-json]').onclick=()=>go('json');d.showModal();
 }

 /* ================= 10. NEWS2 en surveillance postopératoire ================= */
 const NIV={eleve:['Élevé','am-n-high'],moyen:['Moyen','am-n-mid'],'moyen-unique':['Paramètre critique','am-n-mid'],faible:['Faible','am-n-low'],nul:['Nul','am-n-ok']};
 const lastVitals=s=>[...(s?.postopVitals||[])].filter(r=>!r.voided).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
 function newsSpark(points){if(points.length<2)return '';const w=260,h=60,max=Math.max(8,...points),x=i=>Math.round(6+i*(w-12)/(points.length-1)),y=v=>Math.round(h-6-(v/max)*(h-12)),band=v=>h-6-(v/max)*(h-12);
  return `<svg class="am-n-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Évolution du score NEWS2"><rect x="0" y="${band(max)}" width="${w}" height="${band(7)-band(max)}" class="am-n-zone-high"/><rect x="0" y="${band(7)}" width="${w}" height="${band(5)-band(7)}" class="am-n-zone-mid"/><polyline points="${points.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>${points.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3"/>`).join('')}</svg>`}
 function newsPanel(s){const recs=lastVitals(s);if(!recs.length)return `<section class="am-news" data-am-news><header><b>Score NEWS2</b><span class="am-muted">Aucun relevé : renseignez FR, SpO₂, oxygène, PAS, FC, conscience et température.</span></header></section>`;
  const scored=recs.map(r=>({r,n:A.news2(r.values||{})})),last=scored.at(-1),[lab,cls]=NIV[last.n.niveau];
  return `<section class="am-news ${cls}" data-am-news><header><div class="am-n-score"><strong>${last.n.total}</strong><span>NEWS2</span></div><div><b>Risque ${esc(lab.toLowerCase())}</b><p>${esc(last.n.conduite)}</p><small>Relevé de ${esc(dt(last.r.at))} · ${esc(last.r.values?.location||'')}${last.n.complet?'':' · score partiel, manque : '+esc(last.n.manquants.join(', '))}</small></div>${newsSpark(scored.slice(-12).map(x=>x.n.total))}</header>
  <div class="am-n-items">${last.n.items.map(it=>`<span class="${it.points===null?'am-n-na':it.points>=3?'am-n-3':it.points>0?'am-n-1':''}"><small>${esc(it.label)}</small><b>${it.value===null?'—':esc(String(it.value))}</b><em>${it.points===null?'?':'+'+it.points}</em></span>`).join('')}</div>
  <p class="am-n-foot">NEWS2 (Royal College of Physicians, 2017) : aide au repérage de la dégradation, ne remplace pas le jugement clinique. Les relevés sans oxygène ni conscience donnent un score partiel.</p></section>`}
 function enhanceVitalsForm(){const f=$('#postop-vitals-form');if(!f||f.querySelector('[name=o2]'))return;const pain=f.querySelector('[name=pain]')?.closest('label');
  const html=`<label>Oxygène (NEWS2)<select name="o2"><option value="">Non renseigné</option><option>Air</option><option>Oxygène</option></select></label><label>Conscience (NEWS2)<select name="avpu"><option value="">Non renseignée</option><option value="A">A · alerte</option><option value="C">C · confusion nouvelle</option><option value="V">V · réagit à la voix</option><option value="P">P · réagit à la douleur</option><option value="U">U · aucune réaction</option></select></label>`;
  if(pain)pain.insertAdjacentHTML('beforebegin',html);else f.querySelector('.formgrid')?.insertAdjacentHTML('beforeend',html)}

 /* ================= 9. Feuille de relève de service ================= */
 let relSector='',relScope='presents';
 function relRows(){const sectors=sectorsMap();return patients.filter(s=>relScope==='tous'?true:!['Sortie','Consultation'].includes(s.stage)).filter(s=>!relSector||s.sector===relSector).map(s=>{
  const i=ident(s),nr=root.NursingCore?.project(s.nursingRecord||[])||{plans:new Map(),tasks:new Map(),devices:new Map(),alerts:new Map(),transmissions:[]},now=Date.now();
  const recs=lastVitals(s),lastV=recs.at(-1),news=lastV?A.news2(lastV.values||{}):null;
  const tasks=[...nr.tasks.values()].filter(t=>!['Réalisée','Non réalisée'].includes(t.status)).sort((a,b)=>String(a.due).localeCompare(String(b.due)));
  const alerts=[...nr.alerts.values()].filter(a=>a.status==='Ouverte');const devices=[...nr.devices.values()].filter(x=>x.status==='En place');
  const tr=nr.transmissions.at(-1);const al=A.lireAllergies(s.consult?.allergies);
  const firstBloc=(s.perop?.records||[]).map(r=>r.at).filter(Boolean).sort()[0];const j=firstBloc?Math.floor((new Date().setHours(0,0,0,0)-new Date(String(firstBloc).slice(0,10)+'T00:00').getTime())/864e5):null;
  const rxOpen=(s.rx||[]).filter(r=>r.validated&&!(r.executions||[]).length).length;const abx=A.reinjections(s.perop?.records||[]).filter(x=>['bientot','due','depassee'].includes(x.statut)&&inBloc(s));
  return {s,i,sector:sectors[s.sector]||'Sans secteur',chambre:s.sortiePlus?.chambre||s.preadmission?.chambre||'',lastV,news,tasks,alerts,devices,tr,al,j,rxOpen,abx,overdue:tasks.filter(t=>t.due&&Date.parse(t.due)<now).length};
 }).sort((a,b)=>(b.news?.total||0)-(a.news?.total||0)||(b.alerts.length-a.alerts.length)||a.sector.localeCompare(b.sector))}
 function relCard(x){const v=x.lastV?.values||{},vit=[['PA',v.sbp&&v.dbp?v.sbp+'/'+v.dbp:v.sbp],['FC',v.hr],['FR',v.rr],['SpO₂',v.spo2&&v.spo2+' %'],['T°',v.temp],['EVA',v.pain!==''&&v.pain!=null?v.pain+'/10':'']].filter(([,val])=>val!==''&&val!=null&&val!==undefined);
  const al=x.al.statut==='connue'?`<span class="am-r-allergy">${ICON.alert}Allergies : ${esc(x.s.consult.allergies)}${x.al.latex?' · LATEX':''}</span>`:x.al.statut==='a-verifier'?'<span class="am-r-allergy am-r-allergy-q">Allergies à vérifier</span>':'<span class="am-r-noallergy">Pas d’allergie connue</span>';
  return `<article class="am-r-card ${x.news&&x.news.total>=5?'am-r-hot':''}"><header><div><h4>${esc(x.i.nom)} ${esc(x.i.prenom)}</h4><p>${esc([age(x.i.naissance),x.i.sexe,x.s.id].filter(Boolean).join(' · '))}</p></div><div class="am-r-where"><b>${esc(x.chambre||x.sector)}</b><small>${esc(x.s.stage)}${x.j!=null&&x.j>=0?' · J'+x.j:''}</small></div></header>
  ${al}<p class="am-r-proc">${esc(x.s.specialty)} · ${esc(x.s.task||'')}</p>
  <div class="am-r-grid"><div><h5>Constantes${x.lastV?' · '+esc(hm(x.lastV.at)):''}</h5>${vit.length?`<p class="am-r-vit">${vit.map(([k,val])=>`<span><small>${k}</small>${esc(String(val))}</span>`).join('')}</p>`:'<p class="am-muted">Aucun relevé</p>'}${x.news?`<p class="am-r-news ${NIV[x.news.niveau][1]}">NEWS2 <b>${x.news.total}</b>${x.news.complet?'':' (partiel)'}</p>`:''}</div>
  <div><h5>À surveiller</h5><ul>${[...x.abx.map(a=>`<li class="am-r-red">Réinjection ${esc(a.label)} ${esc(hm(a.prochaine))}</li>`),...x.alerts.map(a=>`<li class="am-r-red">${esc(a.title||a.label||a.text||'Alerte ouverte')}</li>`),...x.tasks.slice(0,4).map(t=>`<li${t.due&&Date.parse(t.due)<Date.now()?' class="am-r-red"':''}>${esc(t.due?String(t.due).slice(11,16)+' · ':'')}${esc(t.title||t.label||'Tâche')}</li>`),...(x.rxOpen?[`<li>${x.rxOpen} prescription(s) validée(s) sans administration tracée</li>`]:[]),...x.devices.map(dv=>`<li>${esc(dv.deviceType||'Dispositif')}${dv.site?' · '+esc(dv.site):''}</li>`)].join('')||'<li class="am-muted">Rien en attente</li>'}</ul></div></div>
  ${x.tr?`<div class="am-r-tr"><h5>Dernière transmission · ${esc(dt(x.tr.occurredAt))} · ${esc(x.tr.authorLabel||'')}</h5><p>${x.tr.format==='DAR'?`<b>${esc(x.tr.target)}</b> · D : ${esc(x.tr.observations)} · A : ${esc(x.tr.actions)} · R : ${esc(x.tr.results)}`:esc(x.tr.observations)}</p></div>`:''}
  <div class="am-r-notes"><span>Notes de relève :</span></div><button type="button" class="am-link no-print" data-am-open="${esc(x.s.id)}">Ouvrir le dossier</button></article>`}
 function bioCard(rows){return `<section class="v-card am-bio no-print"><header class="v-card-head"><div><h4>Chambres · bionettoyage</h4><p>Statut partagé entre tous les postes, chaque changement est tracé dans le dossier.</p></div></header><div class="am-scroll"><table class="am-table"><thead><tr><th>Patient</th><th>Chambre</th><th>Sortie prévue</th><th>Bionettoyage</th></tr></thead><tbody>${rows.map(x=>{const n=x.s.bionettoyage?.etat==='fait'?x.s.bionettoyage:null;return `<tr><td><b>${esc(x.i.nom)} ${esc(x.i.prenom)}</b><small>${esc(x.s.stage)}</small></td><td>${esc(x.chambre||'À attribuer')}</td><td>${x.s.sortiePlus?.sortiePrevue?esc(fdate(x.s.sortiePlus.sortiePrevue)):'—'}</td><td><button type="button" class="secondary" data-am-nett="${esc(x.s.id)}">${n?'Fait '+esc(hm(n.at))+(n.by?' · '+esc(n.by):''):'À faire'}</button></td></tr>`}).join('')||'<tr><td colspan="4">Aucun patient.</td></tr>'}</tbody></table></div></section>`}
 function renderReleve(){viewHeader('Relève de service','releve');const rows=relRows(),sectors=sectorsMap();
  $('#workspace').innerHTML=`<div class="v-wrap am-releve"><header class="v-head"><div><p class="v-kicker">${ICON.relay} Changement d’équipe</p><h3>Feuille de relève</h3><p class="v-sub">Patients présents, triés par score NEWS2 puis alertes : allergies, constantes, tâches en attente, dispositifs et dernière transmission.</p></div><div class="am-r-tools no-print"><label>Secteur<select id="am-r-sector"><option value="">Tous les secteurs</option>${Object.entries(sectors).map(([id,l])=>`<option value="${esc(id)}" ${id===relSector?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label>Patients<select id="am-r-scope"><option value="presents" ${relScope==='presents'?'selected':''}>Présents (hors consultation et sortie)</option><option value="tous" ${relScope==='tous'?'selected':''}>Tous les séjours</option></select></label><button type="button" class="primary" id="am-r-print">Imprimer la relève</button></div></header>
  <div class="v-kpis am-r-kpis">${[['Patients',rows.length],['NEWS2 ≥ 5',rows.filter(x=>x.news&&x.news.total>=5).length],['Alertes ouvertes',rows.reduce((n,x)=>n+x.alerts.length,0)],['Tâches en retard',rows.reduce((n,x)=>n+x.overdue,0)],['Allergies connues',rows.filter(x=>x.al.statut==='connue').length]].map(([l,v])=>`<div class="v-kpi"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div>
  <div class="am-r-list">${rows.map(relCard).join('')||'<p class="am-muted">Aucun patient dans ce périmètre.</p>'}</div>${bioCard(rows)}</div>`;
  document.querySelectorAll('[data-am-nett]').forEach(b=>b.onclick=()=>{const s=patients.find(x=>x.id===b.dataset.amNett);if(!s)return;if(ctx.canWrite&&!ctx.canWrite('stay/'+s.id+'/bionettoyage')){toast('Bionettoyage : modification réservée aux soignants de l’équipe');return}const fait=s.bionettoyage?.etat!=='fait';s.bionettoyage={etat:fait?'fait':'a-faire',at:new Date().toISOString(),by:who()};trace(s,'Bionettoyage de la chambre '+(fait?'réalisé':'remis à faire'),'Hôtellerie');renderReleve();document.dispatchEvent(new Event('change',{bubbles:true}))});
  $('#am-r-sector').onchange=e=>{relSector=e.target.value;renderReleve()};$('#am-r-scope').onchange=e=>{relScope=e.target.value;renderReleve()};
  document.querySelectorAll('.am-releve [data-am-open]').forEach(b=>b.onclick=()=>ctx.open(b.dataset.amOpen));
  $('#am-r-print').onclick=()=>printHtml(`<article class="am-r-printdoc"><header class="am-x-head"><img src="${esc(etab())}" alt=""><div><h1>Feuille de relève · ${esc(relSector?sectors[relSector]:'tous secteurs')}</h1><p>Éditée le ${esc(new Date().toLocaleString('fr-FR'))} par ${esc(who())} · document confidentiel, à détruire après la relève</p></div></header><div class="am-r-list">${rows.map(relCard).join('')}</div></article>`,'am-print-releve');
 }
 const nav=document.querySelector('.nav[data-view="service"]');
 if(nav&&!document.querySelector('.nav[data-view="releve"]')){const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='releve';b.innerHTML=ICON.relay+'Relève de service';nav.after(b);b.addEventListener('click',()=>ctx.setView('releve'))}

 /* ================= Branchements sur les écrans existants ================= */
 function bannerButtons(){const s=cur(),banner=document.querySelector('.pb-banner');if(!s||!banner||banner.querySelector('.am-banner-tools'))return;
  const t=document.createElement('div');t.className='am-banner-tools no-print';t.innerHTML=`<button type="button" class="secondary" data-am-labels>${ICON.label}Étiquettes</button>${canExport()?`<button type="button" class="secondary" data-am-export>${ICON.export}Exporter le dossier</button>`:''}`;
  (banner.querySelector('.pb-chips')||banner).append(t);t.querySelector('[data-am-labels]').onclick=()=>openLabels(s);t.querySelector('[data-am-export]')?.addEventListener('click',()=>exportDossier(s))}
 function blocButton(){if(ctx.view()!=='regulation'||!canImport())return;const host=document.querySelector('#workspace');if(!host||host.querySelector('.am-import-cta'))return;const first=host.firstElementChild;if(!first)return;
  const bar=document.createElement('div');bar.className='am-import-cta no-print';bar.innerHTML=`<div><b>Programme opératoire</b><span>Importez l’export CSV d’E-med : séjours créés et créneaux placés dans les salles, après relecture.</span></div><button type="button" class="primary">${ICON.import}Importer un programme</button>`;bar.querySelector('button').onclick=openImport;first.before(bar)}
 function enhance(){
  bannerButtons();blocButton();abxAlerts();
  const pil=document.querySelector('.nav[data-view="pilotage"]');if(pil&&pil.hidden!==!isAdmin())pil.hidden=!isAdmin();
  if(ctx.view()==='patients'&&ctx.tab()==='perop'&&cur()){const c=$('#content');if(c&&!c.querySelector('[data-am-abx]')){const html=abxCard(cur());if(html){const strip=c.querySelector('.ck-strip')||c.querySelector('.consult-heading');if(strip)strip.insertAdjacentHTML('afterend',html);else c.insertAdjacentHTML('afterbegin',html)}}}
  const vit=document.querySelector('.nurse-vitals');if(vit&&cur()){enhanceVitalsForm();if(!vit.querySelector('[data-am-news]')){const h=vit.querySelector('h4');(h||vit.firstChild)&&(h?h.insertAdjacentHTML('afterend',newsPanel(cur())):vit.insertAdjacentHTML('afterbegin',newsPanel(cur())))}}
 }
 let raf=0;new MutationObserver(()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;enhance()})}).observe(document.body,{childList:true,subtree:true});
 setTimeout(abxAlerts,1500);

 function renderRefus(){viewHeader('Pilotage & qualité','pilotage');$('#workspace').innerHTML=`<section class="v-card am-refus"><span class="am-lock-icon">${ICON.lock}</span><h3>Écran réservé aux administrateurs</h3><p>Le pilotage et les indicateurs qualité de l’établissement sont accessibles aux seuls profils administrateurs. Le suivi du bionettoyage des chambres se trouve dans « Relève de service ».</p><button type="button" class="primary" data-am-go="releve">Ouvrir la relève de service</button></section>`;$('[data-am-go]').onclick=()=>ctx.setView('releve')}
 return {render:view=>{if(view==='releve'){renderReleve();return true}if(view==='pilotage'&&!isAdmin()){renderRefus();return true}return false},openPalette,lockNow,openLabels,openImport,exportDossier,newsPanel};
};
})(typeof window!=='undefined'?window:globalThis);

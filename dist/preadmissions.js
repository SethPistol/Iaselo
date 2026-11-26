/* IASELO · écran « Préadmissions » des admissions (secrétariat), aussi ouvert aux anesthésistes et chirurgiens.
   Liste des préadmissions des séjours du périmètre (faite / pas faite, endoscopie ou chirurgie, pièces, rappels),
   puis compte rendu d'un patient : coordonnées vérifiées, pièces jointes (ouvrir, conforme, non conforme),
   formulaire, étapes, envois et rappels ; actions : valider, demander un complément, renvoyer le lien, imprimer.
   Serveur : worker/preadmission.mjs (droits relus côté serveur). Règles : dist/preadmission-regles.js. */
(function(root){
'use strict';
root.createPreadmissions=function(ctx){
 const {$,esc,toast}=ctx,P=root.IaseloPreadmission;if(!P)return null;
 let liste=null,erreur='',filtre='a-traiter',type='',periode='avenir',q='',ouvert=null,dossier=null,chargement=0,peutVerifier=false;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="m9 13 2 2 4-4"/></svg>';
 const TON={'a-faire':'crit','en-cours':'warn','a-completer':'crit','faite':'info','verifiee':'ok'};
 const fmtDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date());
 const style=document.createElement('style');
 style.textContent=`.pr-head{display:flex;flex-wrap:wrap;gap:10px;align-items:end;justify-content:space-between;margin:0 0 14px}.pr-head p{margin:0;color:var(--i-mut,#5b6b73);max-width:640px}
.pr-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pr-tools input,.pr-tools select{min-height:40px;width:auto!important;max-width:100%}.pr-tools input[type=search]{min-width:220px}
.pr-kpis{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.pr-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 14px;min-width:120px;border-radius:12px;border:1px solid var(--border,#e0e4e9);background:var(--i-s1,#fff);cursor:pointer;text-align:left}.pr-kpi b{font-size:1.4rem;font-family:'Geist Mono',ui-monospace,monospace}.pr-kpi.on{outline:2px solid var(--i-act,#0F4D5C);outline-offset:1px}
.pr-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:#eef2f3;color:#2f4650;white-space:nowrap}.pr-chip.ok{background:#dff3e6;color:#0F6E55}.pr-chip.warn{background:#fdf0d5;color:#8F4500}.pr-chip.crit{background:#fbe3e1;color:#B21F2A}.pr-chip.info{background:#dcedf2;color:#0F4D5C}.pr-chip.endo{background:#ece6f7;color:#4b2f86}.pr-chip.chir{background:#e3eef6;color:#174d78}
.pr-table{width:100%;border-collapse:collapse}.pr-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--i-mut,#5b6b73);text-align:left;padding:8px;border-bottom:1px solid var(--border,#e0e4e9)}.pr-table td{padding:10px 8px;border-bottom:1px solid var(--border,#e0e4e9);vertical-align:middle}.pr-table tr[data-stay]{cursor:pointer}.pr-table tr[data-stay]:hover td{background:var(--i-s2,#f4f7f9)}
.pr-bar{width:110px;height:8px;border-radius:99px;background:#e6ecef;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}.pr-bar i{display:block;height:100%;background:linear-gradient(90deg,#0F4D5C,#41AD95)}
.pr-band{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;padding:16px 20px;border-radius:14px;background:#14256b;background:linear-gradient(120deg,#0F4D5C,#163a72);color:#fff;margin:0 0 16px}.pr-band h2{color:#fff!important;margin:0;font-size:1.4rem}.pr-band p{margin:2px 0 0;color:#d8e8ee!important}.pr-band label{color:#d8e8ee;display:flex;gap:6px;align-items:center}.pr-band select{width:auto!important}.pr-band select{min-height:36px}
.pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin:0 0 14px}.pr-card{border:1px solid var(--border,#e0e4e9);border-radius:14px;padding:14px 16px;background:var(--i-s1,#fff)}.pr-card h3{margin:0 0 10px;font-size:.95rem;text-transform:uppercase;letter-spacing:.05em;color:var(--i-act,#0F4D5C);border-bottom:2px solid var(--i-act,#0F4D5C);padding-bottom:6px}
.pr-checks{list-style:none;margin:0;padding:0}.pr-checks li{display:flex;gap:8px;align-items:flex-start;padding:4px 0}.pr-checks .ok{color:#0F6E55}.pr-checks .no{color:#9aa7ae}
.pr-box{display:inline-flex;width:18px;height:18px;border-radius:4px;align-items:center;justify-content:center;flex:0 0 auto;font-size:12px;font-weight:800}.pr-box.on{background:#163a72;color:#fff}.pr-box.off{border:1.5px solid #b9c6cd}.pr-box.ko{background:#B21F2A;color:#fff}
.pr-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pr-actions form{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pr-actions input[type=text]{min-width:240px;min-height:38px}
.pr-recap .pa-recap h1{display:none}.pr-recap .pa-recap{max-width:none;font-size:14px}
.pr-back{background:none;border:0;color:var(--i-act,#0F4D5C);font-weight:700;padding:4px 0;margin:0 0 8px;cursor:pointer}
@media (max-width:760px){.pr-table thead{display:none}.pr-table tr{display:grid;grid-template-columns:1fr auto;gap:4px;padding:8px 0;border-bottom:1px solid var(--border,#e0e4e9)}.pr-table td{border:0;padding:2px 4px}}`;
 document.head.append(style);
 function bouton(){
  if(document.querySelector('aside .nav[data-view="preadmissions"]'))return;
  const apres=document.querySelector('aside .nav[data-view="questionnaireSend"]')||document.querySelector('aside .nav[data-view="patients"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='preadmissions';b.innerHTML=ICON+'Préadmissions';b.onclick=()=>{ouvert=null;ctx.go('preadmissions')};apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 async function api(path,body){const r=await fetch('/api/workspace/preadmission/'+path,{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(){const n=++chargement;erreur='';try{const j=await api('liste');if(n!==chargement)return;liste=j.preadmissions;peutVerifier=j.peutVerifier}catch(e){if(n!==chargement)return;liste=null;erreur=e.message}draw()}
 async function ouvrir(stay){ouvert=stay;dossier=null;draw();try{dossier=await api('dossier?stay='+encodeURIComponent(stay))}catch(e){erreur=e.message;ouvert=null}draw()}
 const nom=p=>[String(p.nom||'').toUpperCase(),p.prenom].filter(Boolean).join(' ')||'Identité non renseignée';
 const chipType=t=>`<span class="pr-chip ${t==='endoscopie'?'endo':'chir'}">${esc(P.TYPES[t])}</span>`;
 const chipEtat=e=>`<span class="pr-chip ${TON[e.code]}">${esc(e.libelle)}</span>`;
 const FILTRES=[['a-traiter','À traiter'],['a-faire','Pas commencées'],['en-cours','En cours'],['a-completer','À compléter'],['faite','À vérifier'],['verifiee','Vérifiées'],['toutes','Toutes']];
 function visibles(){
  const t=today(),n=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  return (liste||[]).filter(x=>(periode!=='avenir'||!x.datePrevue||x.datePrevue>=t)&&(!type||x.type===type)&&(!q||n([x.patient.nom,x.patient.prenom,x.stay,x.intervention].join(' ')).includes(n(q))));
 }
 const garde=(x,f)=>f==='toutes'||(f==='a-traiter'?x.etat.code!=='verifiee':x.etat.code===f);
 function listeHTML(){
  const base=visibles(),rows=base.filter(x=>garde(x,filtre)),count=f=>base.filter(x=>garde(x,f)).length;
  return `<div class="pr-kpis">${FILTRES.map(([k,l])=>`<button type="button" class="pr-kpi ${filtre===k?'on':''}" data-filtre="${k}"><b>${count(k)}</b><span>${esc(l)}</span></button>`).join('')}</div>
  ${rows.length?`<table class="pr-table"><thead><tr><th>Venue</th><th>Patient</th><th>Type</th><th>État</th><th>Parcours</th><th>Pièces</th><th>Dernier envoi</th></tr></thead><tbody>${rows.map(x=>{const r=x.rappels.at(-1),e=x.dernierEnvoi;
   return `<tr data-stay="${esc(x.stay)}" tabindex="0"><td><b>${x.datePrevue?esc(P.fmtD(x.datePrevue)):'—'}</b></td><td><b>${esc(nom(x.patient))}</b><br><small>${x.patient.naissance?'né(e) le '+esc(P.fmtD(x.patient.naissance))+' · ':''}${esc(x.intervention||x.specialite||x.stay)}</small></td><td>${chipType(x.type)}</td><td>${chipEtat(x.etat)}</td>
   <td><span class="pr-bar"><i style="width:${x.etat.pourcent}%"></i></span><small>${x.etat.faites}/${x.etat.total}</small></td>
   <td>${x.pieces} reçue${x.pieces>1?'s':''}${x.aVerifier?`<br><span class="pr-chip warn">${x.aVerifier} à vérifier</span>`:''}${x.etat.piecesManquantes.length&&x.etat.code!=='a-faire'?`<br><small>${x.etat.piecesManquantes.length} manquante${x.etat.piecesManquantes.length>1?'s':''}</small>`:''}</td>
   <td><small>${e?esc(fmtDT(e.at))+' · '+esc(e.motif==='questionnaire'?'fin du questionnaire':e.rappel?'rappel':'envoi')+(x.ouvertLe?' · ouvert':''):x.contact?'Aucun':'Pas de coordonnées vérifiées'}${r&&!r.ok?`<br><span class="pr-chip crit">Rappel non envoyé</span>`:''}</small></td></tr>`}).join('')}</tbody></table>`:'<p class="notice">Aucune préadmission pour ces critères.</p>'}`;
 }
 function dossierHTML(){
  const d=dossier,x=d.data,et=d.etat,pieces=(x.pieces||[]).filter(p=>!p.remplace),f=x.formulaire||{};
  const etapes=P.etapes(d.type),faite=id=>P.etapeFaite(id,x,{naissance:d.patient.naissance});
  const check=(on,l,ko)=>`<li><span class="pr-box ${ko?'ko':on?'on':'off'}">${ko?'!':on?'✓':''}</span><span>${l}</span></li>`;
  const envois=[...(x.envois||[]).map(e=>({at:e.at,t:(e.rappel?'Rappel':'Lien')+' · '+(e.motif==='questionnaire'?'fin du questionnaire':e.motif)+' · '+(e.channels||[]).join(', ').replace('sms','SMS').replace('email','e-mail').replace('page','affiché au patient')+' · '+e.by,ok:true})),...(x.rappels||[]).filter(r=>!r.ok).map(r=>({at:r.at,t:'Rappel '+r.kind.replace('preadmission-','').toUpperCase()+' non envoyé : '+r.raison,ok:false}))].sort((a,b)=>b.at.localeCompare(a.at));
  return `<button type="button" class="pr-back" data-retour>← Toutes les préadmissions</button>
  <div class="pr-band"><div><h2>${esc(nom(d.patient))}</h2><p>Né(e) le ${esc(P.fmtD(d.patient.naissance))}${d.datePrevue?' · venue le '+esc(P.fmtD(d.datePrevue)):''}${d.intervention?' · '+esc(d.intervention):''}</p></div>
   <div class="pr-actions"><label>Préadmission <select id="pr-type">${Object.entries(P.TYPES).map(([k,l])=>`<option value="${k}" ${d.type===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>${chipEtat(et)}<span class="pr-chip">${et.pourcent} % du parcours</span></div></div>
  ${x.aCompleter&&!x.aCompleter.leve?`<p class="notice warn">Complément demandé le ${esc(fmtDT(x.aCompleter.at))} par ${esc(x.aCompleter.by)} : ${esc(x.aCompleter.motif)}${x.aCompleter.reponduLe?' · <b>le patient a répondu le '+esc(fmtDT(x.aCompleter.reponduLe))+'</b>':''}</p>`:''}
  <div class="pr-grid">
   <section class="pr-card"><h3>Coordonnées vérifiées</h3><ul class="pr-checks">${d.contact?check(!!d.contact.telephone,esc(d.contact.telephone||'Pas de téléphone'))+check(!!d.contact.email,esc(d.contact.email||'Pas d’e-mail')):'<li>Aucune coordonnée vérifiée (écran Questionnaire patient).</li>'}
    ${f.soumisLe?(f.coordonneesExactes?check(true,'Confirmées exactes par le patient'):check(false,'<b>Correction déclarée :</b> '+esc([f.telephoneCorrige,f.emailCorrige].filter(Boolean).join(' · ')),true)):''}</ul></section>
   <section class="pr-card"><h3>Préadmission</h3><ul class="pr-checks">${check(!!f.soumisLe,f.soumisLe?'Formulaire envoyé le '+esc(fmtDT(f.soumisLe))+(f.modifieLe?' (modifié le '+esc(fmtDT(f.modifieLe))+')':''):f.brouillonLe?'Formulaire commencé, non envoyé':'Formulaire non commencé')}
    ${check(!et.piecesManquantes.length,et.piecesManquantes.length?'Pièces manquantes : '+esc(et.piecesManquantes.map(k=>P.PIECE[k].libelle).join(', ')):'Pièces requises reçues')}
    ${check(!!x.verification?.at,x.verification?.at?'Vérifiée par '+esc(x.verification.by)+' le '+esc(fmtDT(x.verification.at)):'Non vérifiée par les admissions')}
    ${f.retourAccompagne==='non'?check(false,'<b>Retour à domicile sans accompagnant déclaré</b> : rappeler le patient',true):''}</ul></section>
   <section class="pr-card"><h3>Étapes du parcours (${et.faites}/${et.total})</h3><ul class="pr-checks">${etapes.map(e=>check(faite(e.id),esc(e.titre)+(e.niveau==='obligatoire'?' <small>· obligatoire</small>':''))).join('')}</ul></section>
  </div>
  <section class="pr-card"><h3>Pièces jointes</h3>${pieces.length?`<table class="pr-table"><thead><tr><th></th><th>Date</th><th>Libellé du document</th><th>Type de document</th><th>Contrôle</th><th></th></tr></thead><tbody>${pieces.map(p=>`<tr><td><span class="pr-box ${p.controle?.conforme===false?'ko':p.controle?'on':'off'}">${p.controle?.conforme===false?'!':p.controle?'✓':''}</span></td><td>${esc(fmtDT(p.recuLe))}</td><td><b>${esc(p.nom)}</b><br><small>${esc(P.PIECE[p.piece]?.libelle||'')}</small></td><td>${esc(P.PIECE[p.piece]?.type||'')}</td>
    <td>${p.controle?(p.controle.conforme?'<span class="pr-chip ok">Conforme</span>':'<span class="pr-chip crit">Non conforme</span><br><small>'+esc(p.controle.motif)+'</small>')+'<br><small>'+esc(p.controle.by)+'</small>':'<span class="pr-chip warn">À vérifier</span>'}</td>
    <td class="pr-actions"><button type="button" class="secondary" data-voir="${esc(p.hash)}" data-nom="${esc(p.nom)}">Ouvrir</button>${peutVerifier&&!p.controle?`<button type="button" class="secondary" data-conforme="${esc(p.id)}">Conforme</button><button type="button" class="secondary" data-nonconforme="${esc(p.id)}">Non conforme</button>`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="v-empty">Aucune pièce reçue.</p>'}</section>
  <section class="pr-card pr-recap"><h3>Formulaire du patient</h3>${f.soumisLe||f.brouillonLe?P.recapHTML(x,{patient:d.patient,type:d.type,datePrevue:d.datePrevue,intervention:d.intervention,contact:{phone:d.contact?.telephone,email:d.contact?.email},ecran:true}):'<p class="v-empty">Le patient n’a pas encore rempli le formulaire.</p>'}</section>
  <div class="pr-grid">
   <section class="pr-card"><h3>Actions</h3><div class="pr-actions">
    ${peutVerifier&&et.code!=='verifiee'?`<button type="button" class="primary" id="pr-verifier" ${et.preadmission?'':'disabled title="Formulaire et pièces requises attendus"'}>Valider la préadmission</button>`:''}
    <button type="button" class="secondary" id="pr-envoyer">Renvoyer le lien au patient</button><button type="button" class="secondary" id="pr-print">Imprimer le récapitulatif</button></div>
    ${peutVerifier?`<form id="pr-complement" style="margin-top:10px"><input type="text" name="motif" maxlength="300" placeholder="Complément à demander (ex. carte Vitale illisible)"><label><input type="checkbox" name="envoyer" checked> Prévenir le patient (SMS / e-mail)</label><button class="secondary">Demander un complément</button></form>${x.aCompleter&&!x.aCompleter.leve?'<button type="button" class="secondary" id="pr-lever" style="margin-top:8px">Lever la demande de complément</button>':''}`:''}
    <p class="os-error notice warn" id="pr-err" role="alert" hidden></p></section>
   <section class="pr-card"><h3>Envois et rappels</h3><ul class="pr-checks">${envois.length?envois.map(e=>check(e.ok,esc(fmtDT(e.at))+' · '+esc(e.t),!e.ok)).join(''):'<li>Aucun envoi.</li>'}</ul>
    ${d.liens.length?`<p class="v-sub"><small>Dernier lien : envoyé le ${esc(fmtDT(d.liens[0].envoyeLe))}, ${d.liens[0].ouvertLe?'ouvert le '+esc(fmtDT(d.liens[0].ouvertLe))+' ('+d.liens[0].vues+' ouverture'+(d.liens[0].vues>1?'s':'')+')':'jamais ouvert'}, ${d.liens[0].actif?'valable jusqu’au '+esc(P.fmtD(d.liens[0].expire.slice(0,10))):'expiré ou désactivé'}.</small></p>`:''}
    <p class="v-sub"><small>Rappels automatiques J-7, J-3 et J-1 (10 h – 20 h) tant que la préadmission n’est pas faite.</small></p></section>
  </div>`;
 }
 function draw(){
  const host=$('#pr-body');if(!host)return;
  if(erreur&&!ouvert){host.innerHTML=`<p class="notice warn">${esc(erreur)}</p>`;return}
  if(ouvert){if(!dossier){host.innerHTML='<p class="j-empty">Chargement du compte rendu…</p>';return}host.innerHTML=dossierHTML();brancherDossier(host);return}
  if(!liste){host.innerHTML='<p class="j-empty">Chargement…</p>';return}
  host.innerHTML=listeHTML();
  host.querySelectorAll('[data-filtre]').forEach(b=>b.onclick=()=>{filtre=b.dataset.filtre;draw()});
  host.querySelectorAll('tr[data-stay]').forEach(tr=>{tr.onclick=()=>ouvrir(tr.dataset.stay);tr.onkeydown=e=>{if(e.key==='Enter')ouvrir(tr.dataset.stay)}});
 }
 function brancherDossier(host){
  const d=dossier,err=$('#pr-err'),montrer=m=>{if(err){err.textContent=m;err.hidden=false}else toast(m)};
  const agir=async(body,ok)=>{try{const r=await api('action',{stay:d.stay,...body});dossier=r;liste=null;charger();draw();toast(ok+(r.envoi&&Array.isArray(r.envoi)?' · patient prévenu':r.envoi?.error?' · patient non prévenu : '+r.envoi.error:''))}catch(e){montrer(e.message)}};
  host.querySelector('[data-retour]').onclick=()=>{ouvert=null;dossier=null;draw()};
  $('#pr-type').onchange=e=>agir({action:'type',type:e.target.value},'Type de préadmission modifié');
  host.querySelectorAll('[data-voir]').forEach(b=>b.onclick=async()=>{
   const w=window.open('','_blank');try{const r=await fetch('/api/workspace/files/'+b.dataset.voir+'?key='+encodeURIComponent('stay/'+d.stay+'/preadmissionPatient'),{cache:'no-store'});if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||'Fichier non disponible');
    const url=URL.createObjectURL(await r.blob());if(w)w.location=url;else{const a=document.createElement('a');a.href=url;a.download=b.dataset.nom;a.click()}setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){w?.close();montrer(e.message)}});
  host.querySelectorAll('[data-conforme]').forEach(b=>b.onclick=()=>agir({action:'piece',id:b.dataset.conforme,conforme:true},'Pièce conforme'));
  host.querySelectorAll('[data-nonconforme]').forEach(b=>b.onclick=()=>{const motif=prompt('Motif (illisible, périmée, mauvais document…) :');if(motif)agir({action:'piece',id:b.dataset.nonconforme,conforme:false,motif},'Pièce non conforme')});
  const v=$('#pr-verifier');if(v)v.onclick=()=>agir({action:'verifier'},'Préadmission validée');
  const l=$('#pr-lever');if(l)l.onclick=()=>agir({action:'lever'},'Demande levée');
  const c=$('#pr-complement');if(c)c.onsubmit=e=>{e.preventDefault();agir({action:'a-completer',motif:c.motif.value,envoyer:c.envoyer.checked},'Complément demandé')};
  $('#pr-envoyer').onclick=async e=>{e.target.disabled=true;try{const r=await api('send',{stay:d.stay});const ok=r.results.filter(x=>x.sent);toast('Lien envoyé : '+ok.map(x=>(x.channel==='sms'?'SMS ':'e-mail ')+x.to).join(' · '));dossier=await api('dossier?stay='+encodeURIComponent(d.stay));draw()}catch(x){montrer(x.message);e.target.disabled=false}};
  $('#pr-print').onclick=()=>{const box=document.createElement('div');box.id='pa-print';box.innerHTML=P.recapHTML(d.data,{etablissement:document.querySelector('.i-sign img,.i-etab')?.alt||'',patient:d.patient,type:d.type,datePrevue:d.datePrevue,intervention:d.intervention,contact:{phone:d.contact?.telephone,email:d.contact?.email}});
   document.body.append(box);document.body.classList.add('pa-printing');const done=()=>{document.body.classList.remove('pa-printing');box.remove();window.removeEventListener('afterprint',done)};window.addEventListener('afterprint',done);setTimeout(()=>{try{window.print()}finally{setTimeout(done,500)}},50)};
 }
 function render(){
  $('#title').textContent='Préadmissions';const st=$('#stats');if(st)st.hidden=true;const nw=$('#new');if(nw)nw.hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='preadmissions'));
  $('#workspace').innerHTML=`<section class="panel"><div class="content"><div class="pr-head"><p>Préadmissions réalisées en ligne par les patients après leur questionnaire d’anesthésie : endoscopie ou chirurgie, pièces justificatives, étapes du parcours. Les patients reçoivent des rappels à J-7, J-3 et J-1 tant qu’elle n’est pas faite.</p>
   <div class="pr-tools"><input type="search" id="pr-q" placeholder="Nom, prénom, séjour…" value="${esc(q)}" aria-label="Rechercher"><select id="pr-typef" aria-label="Type"><option value="">Endoscopie et chirurgie</option>${Object.entries(P.TYPES).map(([k,l])=>`<option value="${k}" ${type===k?'selected':''}>${esc(l)}</option>`).join('')}</select><select id="pr-periode" aria-label="Période"><option value="avenir" ${periode==='avenir'?'selected':''}>Venues à venir</option><option value="toutes" ${periode==='toutes'?'selected':''}>Toutes les dates</option></select></div></div><div id="pr-body"></div></div></section>`;
  $('#pr-q').oninput=e=>{q=e.target.value;if(!ouvert)draw()};$('#pr-typef').onchange=e=>{type=e.target.value;ouvert=null;draw()};$('#pr-periode').onchange=e=>{periode=e.target.value;ouvert=null;draw()};
  draw();if(ouvert)ouvrir(ouvert);else charger();
 }
 // Ouverture directe du compte rendu d'un séjour (depuis l'onglet « Préadmission & pièces » du dossier).
 root.IaseloPreadmissionsOuvrir=stay=>{ouvert=stay;dossier=null;ctx.go('preadmissions')};
 return {render};
};
})(window);

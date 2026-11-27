/* IASELO · écran « Télésuivi des patients » : parcours de soins à distance de J-7 à J+30 (RAAC, ambulatoire, endoscopie).
   - Alertes à traiter (réponses inquiétantes, demandes de rappel, questions du patient), action réalisée tracée ;
   - Patients suivis : frise des étapes (fiches d'éducation, questionnaires, PROMs/PREMs), relance d'une étape ;
   - Séjours à inscrire (intervention entre J-25 et J+45 : un patient déjà opéré peut encore recevoir la suite), parcours proposé selon l'intervention ;
   - Résultats rapportés par les patients (PROMs), expérience (PREMs, recommandation) et export e-Satis.
   Serveur : worker/parcours-suivi.mjs (droits relus côté serveur). Règles : dist/parcours-suivi-regles.js. */
(function(root){
'use strict';
root.createParcoursSuivi=function(ctx){
 const {esc,toast}=ctx,P=root.IaseloParcoursSuivi;if(!P)return null;
 let data=null,erreur='',ouvert=null,dossier=null,filtre='tous',chargement=0,esatisRes=null,mode='parcours',msgStay=null;
 // Onglet « Messages des patients » (dist/messagerie.js).
 const msg=root.createMessagerieEquipe?.({esc,toast})||null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>';
 const fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}):'—';
 const fmtDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 const nom=p=>[String(p.nom||'').toUpperCase(),p.prenom].filter(Boolean).join(' ')||'Identité non renseignée';
 const jRel=(date,jour)=>{if(!date||!jour)return '';const n=Math.round((Date.parse(jour+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/864e5);return n===0?'J0':n>0?'J+'+n:'J'+n};
 function bouton(){
  if(document.querySelector('aside .nav[data-view="telesuivi"]'))return;
  const apres=document.querySelector('aside .nav[data-view="patients"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='telesuivi';b.innerHTML=ICON+'Télésuivi des patients';b.onclick=()=>{ouvert=null;ctx.go('telesuivi')};apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 async function api(path,body){const r=await fetch('/api/workspace/parcours/'+path,{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(){const n=++chargement;erreur='';try{const j=await api('tableau');if(n!==chargement)return;data=j}catch(e){if(n!==chargement)return;data=null;erreur=e.message}draw()}
 async function ouvrir(stay){ouvert=stay;dossier=null;draw();try{dossier=await api('dossier?stay='+encodeURIComponent(stay))}catch(e){toast(e.message);ouvert=null}draw()}
 async function action(body,ok){try{const r=await api('action',body);toast(ok||'Enregistré.');if(ouvert)await ouvrir(ouvert);await charger();return r}catch(e){toast(e.message);return null}}
 const host=()=>document.querySelector('#workspace');
 const chip=(code,label)=>`<span class="ps-chip ${esc(code)}">${esc(label)}</span>`;
 const alertChips=a=>(a||[]).map(x=>`<span class="ps-chip ${x.level==='crit'?'crit':x.level==='info'?'info':'warn'}">${esc(x.label)}</span>`).join(' ');
 function frise(etapes,jour){
  return `<ol class="ps-frise">${etapes.map(e=>{const st=P.ETATS[e.code]||['',''];return `<li class="ps-step ${e.code}" title="${esc((e.libelle||e.id)+' · '+fmt(e.date)+' · '+st[0])}"><i>${e.type==='fiche'?'i':'?'}</i><small>${e.j<0?'J'+e.j:'J+'+e.j}</small></li>`}).join('')}</ol>`;
 }
 function libReponse(qid,k){return (P.QUESTIONNAIRES[qid]?.questions.find(q=>q[0]===k)||[])[3]||k}
 function reponseHTML(r,stay,canTreat=true){
  const qs=P.QUESTIONNAIRES[r.questionnaire]?.questions||[];
  return `<article class="ps-rep ${r.alerts?.some(a=>a.level==='crit')?'is-crit':r.alerts?.some(a=>a.level==='warn')?'is-warn':''}">
   <header><b>${esc(P.libelleEtape(P.etape(dossier?.parcours?.programme||'',r.etape)||{j:0,type:'questionnaire',questionnaire:r.questionnaire}))}</b><span>${esc(fmtDT(r.at))}</span></header>
   ${r.alerts?.length?`<p>${alertChips(r.alerts)}</p>`:'<p class="ps-mut">Sans alerte</p>'}
   <dl class="ps-ans">${qs.filter(([k])=>r.answers?.[k]!==undefined).map(([k])=>`<div><dt>${esc(libReponse(r.questionnaire,k))}</dt><dd>${esc(typeof r.answers[k]==='number'?String(r.answers[k]).replace('.',','):r.answers[k])}</dd></div>`).join('')}</dl>
   ${r.traite?`<p class="ps-ok">Traité par ${esc(r.traite.par)} le ${esc(fmtDT(r.traite.at))} : ${esc(r.traite.action)}</p>`:r.alerts?.length&&canTreat?`<form class="ps-treat" data-treat="${esc(stay)}" data-index="${r.index}"><input type="text" name="texte" required minlength="3" maxlength="300" placeholder="Action réalisée (patient rappelé, consultation programmée…)"><button class="primary">Alerte traitée</button></form>`:''}
  </article>`;
 }
 function vueDossier(){
  const d=dossier,row=data?.suivis.find(s=>s.stay===ouvert)||data?.aInscrire.find(s=>s.stay===ouvert);
  if(!d)return `<button class="ps-back" data-back>← Télésuivi</button><p>Chargement du dossier…</p>`;
  const p=d.parcours,et=d.etat||{},jour=data?.jour,prog=P.PROGRAMMES[p.programme];
  const reps=(p.reponses||[]).map((r,index)=>({...r,index})).reverse();
  const contact=!d.contact?'<span class="ps-chip crit">Coordonnées non vérifiées</span>':[d.contact.telephone?'<span class="ps-chip ok">Portable vérifié</span>':'<span class="ps-chip warn">Pas de portable</span>',d.contact.email?'<span class="ps-chip ok">E-mail vérifié</span>':'',d.contact.naissance?'':'<span class="ps-chip warn">Date de naissance absente</span>'].join(' ');
  return `<button class="ps-back" data-back>← Télésuivi</button>
  <div class="ps-band"><div><h2>${esc(row?nom(row.patient):d.stay)}</h2><p>${esc(d.intervention||'Intervention')} · J0 le ${esc(fmt(d.date))}${jour&&d.date?' · aujourd’hui '+jRel(d.date,jour):''}</p></div><div>${p.programme?chip(p.arret?'':'info',prog?.label||p.programme):chip('','Pas de parcours')} ${contact}</div></div>
  <div class="ps-grid">
   <section class="ps-card"><h3>Parcours</h3>
    <form class="ps-inline" data-inscrire="${esc(d.stay)}"><select name="programme">${Object.entries(P.PROGRAMMES).map(([k,v])=>`<option value="${k}" ${(p.programme||d.propose)===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select><button class="primary">${p.programme?'Changer de parcours':'Inscrire au parcours'}</button></form>
    ${p.programme?(p.arret?`<p class="ps-mut">Arrêté par ${esc(p.arret.par)} le ${esc(fmtDT(p.arret.at))} : ${esc(p.arret.motif)}</p><button class="secondary" data-reprendre="${esc(d.stay)}">Reprendre le parcours</button>`:`<form class="ps-inline" data-arreter="${esc(d.stay)}"><input name="motif" required minlength="3" maxlength="300" placeholder="Motif de l’arrêt (réhospitalisation, refus…)"><button class="secondary">Arrêter</button></form>`):`<p class="ps-mut">Parcours proposé : ${esc(P.PROGRAMMES[d.propose]?.label||'')}. Les messages partent automatiquement entre 10 h et 20 h.</p>`}
    ${msg?`<p><button type="button" class="secondary" data-messagerie="${esc(d.stay)}">Messagerie avec le patient</button></p>`:''}
    <label class="ps-check"><input type="checkbox" data-opposition="${esc(d.stay)}" ${p.esatisOpposition?'checked':''} ${p.programme?'':'disabled'}> Le patient s’oppose à l’enquête nationale e-Satis</label>
   </section>
   <section class="ps-card ps-wide"><h3>Étapes</h3>${et.etapes?.length?`<table class="ps-table"><thead><tr><th>Date</th><th>Étape</th><th>État</th><th></th></tr></thead><tbody>${et.etapes.map(e=>{const st=P.ETATS[e.code];return `<tr><td>${esc(fmt(e.date))}</td><td>${esc(e.libelle)}${e.echec&&e.code==='echec'?`<br><small class="ps-err">${esc(e.echec.raison)}</small>`:''}${e.envoi?`<br><small class="ps-mut">${esc(e.envoi.detail||'')} · ${esc(fmtDT(e.envoi.at))}</small>`:''}</td><td>${chip(st[1],st[0])}</td><td>${!p.arret&&e.date<=jour&&e.code!=='repondu'?`<button class="secondary ps-small" data-envoyer="${esc(d.stay)}" data-etape="${esc(e.id)}">${e.envoi?'Renvoyer':'Envoyer'}</button>`:''}</td></tr>`}).join('')}</tbody></table>`:`<p class="ps-mut">${p.programme?'Date d’intervention inconnue : les étapes seront datées dès qu’elle sera renseignée.':'Inscrivez le patient pour voir le calendrier.'}</p>`}</section>
  </div>
  <section class="ps-card"><h3>Réponses du patient</h3>${reps.length?reps.map(r=>reponseHTML(r,d.stay)).join(''):'<p class="ps-mut">Aucune réponse pour l’instant.</p>'}</section>
  ${(p.historique||[]).length?`<section class="ps-card"><h3>Historique</h3><ul class="ps-hist">${[...p.historique].reverse().map(h=>`<li><span>${esc(fmtDT(h.at))}</span> ${esc(h.par)} · ${esc(h.texte)}</li>`).join('')}</ul></section>`:''}`;
 }
 function kpi(v,l,cls=''){return `<div class="ps-kpi ${cls}"><b>${v??'—'}</b><span>${esc(l)}</span></div>`}
 function vueTableau(){
  if(erreur)return `<p class="ps-err">${esc(erreur)}</p>`;
  if(!data)return '<p>Chargement du télésuivi…</p>';
  const I=data.indicateurs,alertes=data.suivis.flatMap(s=>s.alertes.map(a=>({...a,s}))),jour=data.jour;
  const lignes=data.suivis.filter(s=>filtre==='tous'||(filtre==='alertes'?s.alertes.length:s.etat.code===filtre));
  const mois=jour.slice(0,7),moisPrec=(()=>{const d=new Date(jour+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)})();
  return `<div class="ps-head"><p>Fiches d’éducation, questionnaires de suivi et résultats à J+30 envoyés automatiquement au patient (SMS ou e-mail, sans donnée de santé). Une réponse inquiétante remonte ici.</p></div>
  <div class="ps-kpis">${kpi(I.inscrits,'patients suivis')}${kpi(I.alertesOuvertes,'alertes à traiter',I.alertesOuvertes?'crit':'')}${kpi(I.tauxReponse==null?'—':I.tauxReponse+' %','taux de réponse')}${kpi(I.proms.douleur,'douleur moyenne à J+30')}${kpi(I.proms.activites,'reprise des activités /10')}${kpi(I.prems.nps,'score de recommandation (NPS)')}</div>
  ${alertes.length?`<section class="ps-card ps-alertes"><h3>Alertes à traiter (${alertes.length})</h3>${alertes.map(a=>`<div class="ps-alerte"><div><button class="ps-link" data-open="${esc(a.s.stay)}">${esc(nom(a.s.patient))}</button> <small>${esc(a.s.intervention)} · ${esc(jRel(a.s.date,jour))} · reçu ${esc(fmtDT(a.at))}</small><p>${alertChips(a.alerts)}</p>${a.answers?.question?`<p class="ps-q">« ${esc(a.answers.question)} »</p>`:''}</div><form class="ps-treat" data-treat="${esc(a.s.stay)}" data-index="${a.index}"><input type="text" name="texte" required minlength="3" maxlength="300" placeholder="Action réalisée"><button class="primary">Traitée</button></form></div>`).join('')}</section>`:''}
  <section class="ps-card"><div class="ps-cardhead"><h3>Patients suivis</h3><div class="ps-filtres">${[['tous','Tous'],['alertes','Avec alerte'],['en-cours','En cours'],['termine','Terminés'],['arrete','Arrêtés']].map(([k,l])=>`<button type="button" class="${filtre===k?'on':''}" data-filtre="${k}">${l}</button>`).join('')}</div></div>
   ${lignes.length?`<table class="ps-table"><thead><tr><th>Patient</th><th>Intervention</th><th>J0</th><th>Parcours</th><th>Étapes</th><th>État</th></tr></thead><tbody>${lignes.map(s=>`<tr><td><button class="ps-link" data-open="${esc(s.stay)}">${esc(nom(s.patient))}</button>${s.contact?'':'<br><small class="ps-err">Coordonnées non vérifiées</small>'}</td><td>${esc(s.intervention||s.specialite)}</td><td>${esc(fmt(s.date))}<br><small class="ps-mut">${esc(jRel(s.date,jour))}</small></td><td>${esc(P.PROGRAMMES[s.programme]?.label||s.programme)}</td><td>${frise(s.etapes.map(e=>({...e,libelle:P.libelleEtape(P.etape(s.programme,e.id))})),jour)}</td><td>${chip(s.etat.code==='alerte'?'crit':s.etat.code==='question'?'warn':s.etat.code==='termine'?'ok':s.etat.code==='arrete'?'':'info',s.etat.libelle)}</td></tr>`).join('')}</tbody></table>`:'<p class="ps-mut">Aucun patient dans ce filtre.</p>'}
  </section>
  <section class="ps-card"><h3>Séjours à inscrire (${data.aInscrire.length})</h3>${data.aInscrire.length?`<table class="ps-table"><thead><tr><th>Patient</th><th>Intervention</th><th>J0</th><th>Parcours proposé</th></tr></thead><tbody>${data.aInscrire.map(s=>`<tr><td><button class="ps-link" data-open="${esc(s.stay)}">${esc(nom(s.patient))}</button>${s.contact?'':'<br><small class="ps-err">Coordonnées non vérifiées</small>'}</td><td>${esc(s.intervention||s.specialite)}</td><td>${esc(fmt(s.date))}</td><td><form class="ps-inline" data-inscrire="${esc(s.stay)}"><select name="programme">${Object.entries(P.PROGRAMMES).map(([k,v])=>`<option value="${k}" ${s.propose===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select><button class="primary ps-small">Inscrire</button></form></td></tr>`).join('')}</tbody></table>`:'<p class="ps-mut">Tous les séjours à venir sont inscrits.</p>'}</section>
  <div class="ps-grid">
   <section class="ps-card"><h3>Résultats rapportés par les patients (J+30)</h3><dl class="ps-ans">${[['Réponses',I.proms.reponses],['Douleur moyenne /10',I.proms.douleur],['Reprise des activités /10',I.proms.activites],['État de santé /100',I.proms.sante],['Amélioration ressentie',I.proms.ameliore==null?null:I.proms.ameliore+' %'],['Recours aux soins non prévu',I.proms.recours]].map(([l,v])=>`<div><dt>${l}</dt><dd>${v??'—'}</dd></div>`).join('')}</dl></section>
   <section class="ps-card"><h3>Expérience des patients</h3><dl class="ps-ans">${[['Réponses',I.prems.reponses],['Information avant l’intervention',I.prems.information],['Prise en charge de la douleur',I.prems.douleurPec],['Accueil et écoute',I.prems.accueil],['Préparation de la sortie',I.prems.sortie],['Recommandation (NPS, −100 à +100)',I.prems.nps]].map(([l,v])=>`<div><dt>${l}</dt><dd>${v??'—'}</dd></div>`).join('')}</dl></section>
   <section class="ps-card"><h3>Enquête nationale e-Satis</h3><p class="ps-mut">Fichier des patients sortis dans le mois, avec e-mail vérifié et sans opposition, à déposer sur la plateforme e-Satis. Colonnes à vérifier avec la notice e-Satis de l’année avant le premier dépôt.</p>
    <form class="ps-inline" data-esatis><input type="month" name="mois" value="${moisPrec}" max="${mois}"><button class="secondary">Préparer le fichier</button></form>
    ${esatisRes?`<p>${esatisRes.retenus} patient(s) retenu(s), ${esatisRes.exclus} exclu(s) (${esatisRes.motifs.sansEmail} sans e-mail, ${esatisRes.motifs.opposition} opposition${esatisRes.sansDateSortie?', '+esatisRes.sansDateSortie+' sans date de sortie':''}).${esatisRes.finess?'':' <b>N° FINESS non déclaré</b> (variable INTEROP_FINESS).'}</p>`:''}
   </section>
  </div>`;
 }
 function draw(){
  const c=host();if(!c)return;
  const n=msg?.nonLus()||0,onglets=msg?`<div class="ps-onglets" role="tablist"><button type="button" role="tab" aria-selected="${mode==='parcours'}" class="${mode==='parcours'?'on':''}" data-mode="parcours">Parcours de soins</button><button type="button" role="tab" aria-selected="${mode==='messages'}" class="${mode==='messages'?'on':''}" data-mode="messages">Messages des patients${n?`<span class="n">${n}</span>`:''}</button></div>`:'';
  c.innerHTML=`<section class="panel"><div class="content"><div class="ps-wrap">${onglets}${mode==='messages'?'<div id="mg-hote"></div>':ouvert?vueDossier():vueTableau()}</div></div></section>`;
  c.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;msgStay=null;draw()});
  if(mode==='messages'){const st=msgStay;msgStay=null;msg.monter(c.querySelector('#mg-hote'),{stay:st,change:()=>{const b=c.querySelector('[data-mode="messages"]');if(b)b.innerHTML='Messages des patients'+(msg.nonLus()?`<span class="n">${msg.nonLus()}</span>`:'')}});return}
  c.querySelectorAll('[data-messagerie]').forEach(b=>b.onclick=()=>{mode='messages';msgStay=b.dataset.messagerie;draw()});
  c.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>ouvrir(b.dataset.open));
  c.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{ouvert=null;dossier=null;draw()});
  c.querySelectorAll('[data-filtre]').forEach(b=>b.onclick=()=>{filtre=b.dataset.filtre;draw()});
  c.querySelectorAll('[data-inscrire]').forEach(f=>f.onsubmit=e=>{e.preventDefault();action({action:'inscrire',stay:f.dataset.inscrire,programme:f.programme.value},'Patient inscrit au parcours.')});
  c.querySelectorAll('[data-arreter]').forEach(f=>f.onsubmit=e=>{e.preventDefault();action({action:'arreter',stay:f.dataset.arreter,motif:f.motif.value},'Parcours arrêté.')});
  c.querySelectorAll('[data-reprendre]').forEach(b=>b.onclick=()=>action({action:'reprendre',stay:b.dataset.reprendre},'Parcours repris.'));
  c.querySelectorAll('[data-opposition]').forEach(i=>i.onchange=()=>action({action:'opposition-esatis',stay:i.dataset.opposition,opposition:i.checked},i.checked?'Opposition à e-Satis enregistrée.':'Opposition retirée.'));
  c.querySelectorAll('[data-treat]').forEach(f=>f.onsubmit=e=>{e.preventDefault();action({action:'traiter',stay:f.dataset.treat,index:Number(f.dataset.index),texte:f.texte.value},'Alerte traitée.')});
  c.querySelectorAll('[data-envoyer]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await action({action:'envoyer',stay:b.dataset.envoyer,etape:b.dataset.etape},'Étape envoyée au patient.');if(!r)b.disabled=false});
  c.querySelectorAll('[data-esatis]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();try{const r=await api('esatis?mois='+encodeURIComponent(f.mois.value));esatisRes=r;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([r.csv],{type:'text/csv;charset=utf-8'}));a.download='e-satis-'+r.mois+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);draw()}catch(err){toast(err.message)}});
 }
 function render(){
  msg?.rafraichir();
  const t=document.querySelector('#title');if(t)t.textContent='Télésuivi des patients';
  document.body.classList.remove('j-home');const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='telesuivi'));
  draw();charger();
 }
 return {render};
};
})(typeof self!=='undefined'?self:this);

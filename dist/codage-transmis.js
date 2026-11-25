/* IASELO · transmission du codage aux services (25/11/2026).
   1. Onglet « Codage PMSI » du dossier : carte « Transmettre le codage » (médecin ou DIM) et historique du séjour.
   2. Outils › « Codage transmis » : ce que reçoit le secrétariat, l'accueil, la facturation, le DIM ou un autre
      service ; le service marque la transmission comme traitée ou demande une correction.
   Règles : dist/codage-transmis-regles.js · serveur : worker/codage-transmis.mjs (droits et actes relus côté serveur). */
(function(root){
'use strict';
const C=()=>root.IaseloCodageTransmis;
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frD=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'';
const frDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const TON={transmis:'warn','a-corriger':'crit',traite:'ok',remplace:''};
const style=document.createElement('style');
style.textContent='.ct-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--i-s2,#eef2f3);border:1px solid transparent}.ct-chip.ok{background:#dff3e6;color:#1e7a45}.ct-chip.warn{background:#fdf0d5;color:#8a5300}.ct-chip.crit{background:#fbe3e1;color:#a3192b}:root[data-theme=dark] .ct-chip.ok{background:#163527;color:#8fdcb1}:root[data-theme=dark] .ct-chip.warn{background:#3a2c12;color:#f3c27a}:root[data-theme=dark] .ct-chip.crit{background:#3d1a1f;color:#f3a3ad}.ct-dest{display:flex;flex-wrap:wrap;gap:8px 16px;margin:4px 0 10px}.ct-dest label{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:6px;font-weight:500}.ct-form textarea{width:100%;min-height:60px}.ct-form .ct-autre{max-width:320px}.ct-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px}.ct-list{display:grid;gap:12px}.ct-item{border:1px solid var(--border,#d8e0e2);border-radius:12px;padding:12px 14px;display:grid;gap:8px}.ct-item header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.ct-item table{width:100%;border-collapse:collapse;font-size:14px}.ct-item td,.ct-item th{text-align:left;padding:4px 8px 4px 0;border-top:1px solid var(--border,#e5eaeb);vertical-align:top}.ct-item small{display:block;color:var(--muted,#5b6b73)}.ct-svc{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ct-traiter{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ct-traiter input{flex:1;min-width:200px}';
document.head.append(style);
async function api(q,body){const r=await fetch('/api/workspace/marche/codage'+(q?'?'+q:''),{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
const chip=(txt,ton='')=>`<span class="ct-chip ${ton}">${ESC(txt)}</span>`;
function etatsServices(x){const R=C();return `<div class="ct-svc">${x.data.destinataires.map(s=>{const e=x.data.services?.[s]||{etat:'transmis'};return chip(R.libelleService(s,x.data.autre)+' · '+(R.ETATS[e.etat]||e.etat),TON[e.etat])+(e.commentaire?`<small>${ESC(e.par||'')} : ${ESC(e.commentaire)}</small>`:'')}).join('')}</div>`}
function tableActes(actes){const R=C();return `<table><thead><tr><th>Code CCAM</th><th>Libellé</th><th>Activité</th><th>Confirmé par</th></tr></thead><tbody>${actes.map(a=>`<tr><td><b>${ESC(a.code)}</b></td><td>${ESC(a.libelle||'')}</td><td>${ESC(R.ACTIVITES[a.activite]||a.activite)}</td><td>${ESC(a.confirmePar||'')}${a.dim?`<small>DIM : ${ESC(a.dim)}</small>`:''}</td></tr>`).join('')}</tbody></table>`}
function carte(x,{actionsPour=[],patient=true}={}){const p=x.data.patient||{},s=x.data.sejour||{},R=C();
 return `<article class="ct-item"><header><div>${patient?`<b>${ESC([p.nom,p.prenom].filter(Boolean).join(' ')||x.stay)}</b>${p.naissance?' · né(e) le '+ESC(frD(p.naissance)):''}`:''}<small>${s.dateActe?'Acte du '+ESC(frD(s.dateActe))+' · ':''}${ESC(s.mode||'')}${s.specialite?' · '+ESC(s.specialite):''}</small><small>Transmis par ${ESC(x.par)} le ${ESC(frDT(x.at))}</small></div><div>${chip(R.ETATS[x.status]||x.status,TON[x.status])}</div></header>
 ${tableActes(x.data.actes||[])}${x.data.note?`<p><b>Note :</b> ${ESC(x.data.note)}</p>`:''}${etatsServices(x)}
 ${x.status==='remplace'?'':actionsPour.filter(s=>x.data.destinataires.includes(s)&&(x.data.services?.[s]?.etat||'transmis')!=='traite').map(s=>`<form class="ct-traiter" data-ct-id="${ESC(x.id)}" data-ct-service="${ESC(s)}"><span>${ESC(R.libelleService(s,x.data.autre))} :</span><input name="commentaire" maxlength="1000" placeholder="Commentaire (facultatif pour « traité », obligatoire pour une correction)"><button type="submit" class="primary" data-ct-action="traiter">Marquer comme traité</button><button type="submit" class="secondary" data-ct-action="corriger">Demander une correction</button><p class="notice warn ct-err" role="alert" hidden></p></form>`).join('')}</article>`}
function brancherTraitement(host,apres,toast){
 host.querySelectorAll('form.ct-traiter').forEach(f=>{let action='traiter';f.querySelectorAll('[data-ct-action]').forEach(b=>b.onclick=()=>{action=b.dataset.ctAction});
  f.onsubmit=async e=>{e.preventDefault();const c=f.elements.commentaire.value.trim(),err=f.querySelector('.ct-err');
   try{await api('',{action,id:f.dataset.ctId,service:f.dataset.ctService,...(action==='corriger'?{motif:c}:{commentaire:c})});toast?.(action==='traiter'?'Transmission traitée':'Correction demandée au médecin');apres()}catch(x){err.textContent=x.message;err.hidden=false}}});
}

/* ---------- 1. Dans l'onglet Codage PMSI du dossier ---------- */
const brouillons={};
async function monter(host,stay,{edit,toast,enregistrer}={}){
 if(!host||!stay||!C())return;const R=C();
 let liste=[];try{liste=(await api('stay='+encodeURIComponent(stay.id))).transmissions}catch{host.innerHTML='';return}
 if(!host.isConnected)return;
 const actes=R.actesConfirmes(stay.codage||{}),b=brouillons[stay.id]??={destinataires:[],autre:'',note:''};
 const aCorriger=liste.filter(x=>x.status==='a-corriger');
 const formulaire=edit?`<form class="ct-form">${aCorriger.length?`<p class="notice warn">Correction demandée : ${aCorriger.map(x=>Object.entries(x.data.services).filter(([,e])=>e.etat==='a-corriger').map(([s,e])=>ESC(R.libelleService(s,x.data.autre))+' ('+ESC(e.par)+') : '+ESC(e.commentaire)).join(' · ')).join(' · ')}. Corrigez le codage puis transmettez-le à nouveau.</p>`:''}
  ${actes.length?`<p class="v-sub">Actes à transmettre : ${actes.map(a=>'<b>'+ESC(a.code)+'</b> ('+ESC(R.ACTIVITES[a.activite])+')').join(', ')}. Ni les diagnostics ni la classe ASA ne sont transmis.</p>`:'<p class="notice">Confirmez d’abord au moins un acte ci-dessus.</p>'}
  <div class="ct-dest" role="group" aria-label="Services destinataires">${Object.entries(R.SERVICES).map(([k,s])=>`<label><input type="checkbox" name="dest" value="${k}" ${b.destinataires.includes(k)?'checked':''}>${ESC(s.label)}</label>`).join('')}</div>
  <label class="ct-autre-l" ${b.destinataires.includes('autre')?'':'hidden'}>Nom de l’autre service<input class="ct-autre" name="autre" maxlength="120" value="${ESC(b.autre)}" placeholder="ex. Bureau des admissions"></label>
  <label>Note pour le service (facultatif)<textarea name="note" maxlength="1000" placeholder="ex. Dépassement d’honoraires prévu, patient en ALD…">${ESC(b.note)}</textarea></label>
  <div class="ct-actions"><button type="submit" class="primary" ${actes.length?'':'disabled'}>Transmettre le codage</button></div><p class="notice warn ct-err" role="alert" hidden></p></form>`:'';
 const hist=liste.length?`<div class="ct-list">${liste.map(x=>carte(x,{patient:false})).join('')}</div>`:'<p class="v-empty">Aucune transmission pour ce séjour.</p>';
 host.innerHTML=`<section class="v-card"><header class="v-card-head"><div><h4>Transmettre le codage</h4><p>Au secrétariat, à l’accueil, à la facturation, au DIM ou à un autre service, qui le retrouve dans Outils › Codage transmis.</p></div></header>${formulaire}<h4>Transmissions de ce séjour</h4>${hist}</section>`;
 const f=host.querySelector('.ct-form');if(!f)return;
 const lire=()=>{b.destinataires=[...f.querySelectorAll('[name=dest]:checked')].map(i=>i.value);b.autre=f.elements.autre.value;b.note=f.elements.note.value;f.querySelector('.ct-autre-l').hidden=!b.destinataires.includes('autre')};
 f.oninput=f.onchange=lire;
 f.onsubmit=async e=>{e.preventDefault();lire();const err=f.querySelector('.ct-err'),m=R.erreur(b,actes);if(m){err.textContent=m;err.hidden=false;return}
  const btn=f.querySelector('[type=submit]');btn.disabled=true;
  try{await enregistrer?.();let j,essai=0;
   for(;;){try{j=await api('',{action:'transmettre',stay:stay.id,destinataires:b.destinataires,autre:b.autre,note:b.note,codes:actes.map(a=>a.code)});break}catch(x){if(++essai>3||!/pas encore enregistré/.test(x.message))throw x;await new Promise(r=>setTimeout(r,1200));await enregistrer?.()}}
   delete brouillons[stay.id];toast?.('Codage transmis à '+b.destinataires.map(s=>R.libelleService(s,b.autre)).join(', '));monter(host,stay,{edit,toast,enregistrer});
  }catch(x){err.textContent=x.message;err.hidden=false;btn.disabled=false}};
}
root.IaseloCodageTransmisUI={monter};

/* ---------- 2. Outils › Codage transmis ---------- */
const OUTILS=root.IaseloOutils=root.IaseloOutils||{};
OUTILS.codage={
 async html(K){
  const e=K.etat.codage??={},j=await api('');e.services=j.services;e.data=j;
  const aTraiter=j.recues.filter(x=>j.services.some(s=>x.data.destinataires.includes(s)&&(x.data.services?.[s]?.etat||'transmis')==='transmis'));
  const vues=[];if(j.services.length)vues.push(['recues','Reçus par mon service',aTraiter.length]);if(j.peutTransmettre&&j.envoyees.length)vues.push(['envoyees','Transmis pour mes patients',j.envoyees.filter(x=>x.status==='a-corriger').length]);
  if(!vues.length)return `<p class="mk-intro">Le codage des actes se fait dans le dossier du patient, onglet « Codage PMSI proposé ». Une fois les actes confirmés, « Transmettre le codage » l’envoie au service choisi.</p><p class="j-empty">Aucune transmission pour l’instant.</p>`;
  const tabs=K.onglets('codage',vues),filtre=e.filtre||'a-traiter';
  let l=e.onglet==='envoyees'?j.envoyees:j.recues;
  if(e.onglet!=='envoyees'&&filtre==='a-traiter')l=aTraiter;
  return `<p class="mk-intro">Codage des actes (CCAM) transmis par les médecins ou le DIM depuis le dossier du patient. Le service destinataire le marque comme traité, ou demande une correction au médecin. Seuls l’identité, les dates et les actes sont transmis.</p>${tabs}
   ${e.onglet!=='envoyees'?`<div class="mk-row"><label>Afficher<select id="ct-filtre"><option value="a-traiter" ${filtre==='a-traiter'?'selected':''}>À traiter</option><option value="tout" ${filtre==='tout'?'selected':''}>Toutes les transmissions</option></select></label></div>`:''}
   ${l.length?`<div class="ct-list">${l.map(x=>carte(x,{actionsPour:e.onglet==='envoyees'?[]:j.services})).join('')}</div>`:'<p class="j-empty">Rien à traiter.</p>'}`;
 },
 brancher(host,K){const s=host.querySelector('#ct-filtre');if(s)s.onchange=()=>{K.etat.codage.filtre=s.value;K.dessiner()};brancherTraitement(host,()=>K.dessiner(),K.toast)}
};
})(window);

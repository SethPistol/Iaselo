/* IASELO · écran « API FHIR & partenaires » (administrateur) : logiciels partenaires autorisés à lire le dossier
   en FHIR R4 (OAuth 2.0 client credentials, portées system/<Ressource>.read), webhook signé, révocation, journal des appels.
   Le secret du client et celui du webhook ne sont affichés qu'une fois, à la création.
   Serveur : worker/fhir.mjs (droits relus côté serveur ; data-view="fhir"). */
(function(root){
'use strict';
root.createFhirAdmin=function(ctx){
 const {esc,toast}=ctx;let data=null,erreur='',cree=null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>';
 const PORTEES=[['system/*.read','Toutes les ressources'],['system/Patient.read','Patients'],['system/Encounter.read','Séjours'],['system/Procedure.read','Interventions'],['system/MedicationStatement.read','Traitements'],['system/AllergyIntolerance.read','Allergies']];
 const fmtDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="fhir"]'))return;
  const apres=document.querySelector('aside .nav[data-view="droits"]')||document.querySelector('aside .nav[data-view="professionalAccess"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='fhir';b.innerHTML=ICON+'API FHIR & partenaires';b.onclick=()=>ctx.go('fhir');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 async function api(body){const r=await fetch('/api/workspace/fhir',{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(){erreur='';try{data=await api()}catch(e){data=null;erreur=e.message}draw()}
 const style=document.createElement('style');
 style.textContent=`.fh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}.fh-card{border:1px solid var(--border,#e0e4e9);border-radius:14px;padding:14px 16px;background:var(--i-s1,#fff);min-width:0}
.fh-card h3{margin:0 0 10px;font-size:.95rem;text-transform:uppercase;letter-spacing:.04em}.fh-code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#f2f5f6;border-radius:6px;padding:2px 6px;word-break:break-all}
.fh-form{display:flex;flex-direction:column;gap:8px}.fh-form label{display:flex;flex-direction:column;gap:4px;font-weight:600}.fh-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 12px}.fh-checks label{flex-direction:row;align-items:center;gap:8px;font-weight:500}
.fh-table{width:100%;border-collapse:collapse}.fh-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--i-mut,#5b6b73);text-align:left;padding:6px 8px;border-bottom:1px solid var(--border,#e0e4e9)}.fh-table td{padding:8px;border-bottom:1px solid var(--border,#e0e4e9);vertical-align:top;font-size:14px}
.fh-secret{border:2px solid #C77700;background:#fff8ec;border-radius:12px;padding:12px 14px;margin:0 0 14px}.fh-chip{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef2f3}.fh-chip.ok{background:#dff3e6;color:#0F6E55}.fh-chip.ko{background:#fbe3e1;color:#B21F2A}
.fh-mut{color:var(--i-mut,#5b6b73)}`;
 document.head.append(style);
 function draw(){
  const c=document.querySelector('#workspace');if(!c)return;
  if(erreur){c.innerHTML=`<section class="panel"><div class="content"><p class="fh-mut">${esc(erreur)}</p></div></section>`;return}
  if(!data){c.innerHTML='<section class="panel"><div class="content"><p>Chargement…</p></div></section>';return}
  const ev=id=>{const m={};for(const e of data.evenements.filter(e=>e.client_id===id))m[e.status]=e.n;return m};
  c.innerHTML=`<section class="panel"><div class="content">
  <p class="fh-mut">Les logiciels partenaires (agenda, facturation, entrepôt de données, suivi à domicile…) lisent le dossier au format FHIR R4 avec un jeton OAuth 2.0. Chaque appel est tracé. Un webhook signé les prévient d’une modification, sans transmettre de donnée de santé.</p>
  ${cree?`<div class="fh-secret" role="alert"><b>Notez ces secrets maintenant : ils ne seront plus affichés.</b><p>Identifiant client : <span class="fh-code">${esc(cree.client.id)}</span><br>Secret client : <span class="fh-code">${esc(cree.client_secret)}</span>${cree.webhook_secret?`<br>Secret du webhook (signature HMAC-SHA256) : <span class="fh-code">${esc(cree.webhook_secret)}</span>`:''}</p><button class="secondary" data-cache>J’ai noté les secrets</button></div>`:''}
  <div class="fh-grid">
   <section class="fh-card"><h3>Points d’accès</h3><p>Base FHIR R4 : <span class="fh-code">${esc(data.base)}</span></p><p>Jeton OAuth 2.0 : <span class="fh-code">${esc(data.token)}</span></p><p>Description du serveur : <span class="fh-code">${esc(data.base)}/metadata</span></p><p class="fh-mut">Ressources : ${esc(data.ressources.join(', '))}. Profils FR Core visés. Codes CCAM et CIS à confirmer avec le guide d’implémentation de l’ANS avant tout raccordement réel.</p></section>
   <section class="fh-card"><h3>Autoriser un logiciel</h3><form class="fh-form" id="fh-creer"><label>Nom du logiciel partenaire<input name="nom" required minlength="2" maxlength="120" placeholder="ex. Agenda du cabinet"></label>
    <fieldset class="fh-checks"><legend>Données lisibles</legend>${PORTEES.map(([v,l],i)=>`<label><input type="checkbox" name="portee" value="${v}" ${i===1?'checked':''}> ${esc(l)}</label>`).join('')}</fieldset>
    <label>Adresse du webhook (facultatif, https://)<input name="webhook" type="url" placeholder="https://partenaire.example/iaselo"></label><button class="primary">Créer l’accès</button></form></section>
  </div>
  <section class="fh-card" style="margin-top:14px"><h3>Logiciels autorisés (${data.clients.length})</h3>${data.clients.length?`<table class="fh-table"><thead><tr><th>Logiciel</th><th>Identifiant</th><th>Portées</th><th>Webhook</th><th>État</th><th></th></tr></thead><tbody>${data.clients.map(k=>{const e=ev(k.id);return `<tr><td><b>${esc(k.name)}</b><br><small class="fh-mut">créé le ${esc(fmtDT(k.created_at))} par ${esc(k.created_by)}</small></td><td><span class="fh-code">${esc(k.id)}</span></td><td>${esc(k.scopes)}</td><td>${k.webhook_url?esc(new URL(k.webhook_url).host)+`<br><small class="fh-mut">${e.livre||0} remise(s), ${e['en-attente']||0} en attente, ${e.abandonne||0} abandonnée(s)</small>`:'—'}</td><td>${k.revoked_at?`<span class="fh-chip ko">Révoqué</span><br><small class="fh-mut">${esc(fmtDT(k.revoked_at))}</small>`:'<span class="fh-chip ok">Actif</span>'}</td><td>${k.revoked_at?'':`${k.webhook_url?`<button class="secondary" data-tester="${esc(k.id)}">Tester le webhook</button> `:''}<button class="secondary" data-revoquer="${esc(k.id)}">Révoquer</button>`}</td></tr>`}).join('')}</tbody></table>`:'<p class="fh-mut">Aucun logiciel autorisé.</p>'}</section>
  <section class="fh-card" style="margin-top:14px"><h3>Derniers appels</h3>${data.appels.length?`<table class="fh-table"><thead><tr><th>Date</th><th>Logiciel</th><th>Action</th><th>Cible</th><th>Résultat</th></tr></thead><tbody>${data.appels.map(a=>`<tr><td>${esc(fmtDT(a.at))}</td><td><span class="fh-code">${esc(a.actor.replace(/^fhir:/,''))}</span></td><td>${esc(a.action)}</td><td>${esc(a.target)}</td><td><span class="fh-chip ${a.result==='allowed'?'ok':'ko'}">${a.result==='allowed'?'Autorisé':'Refusé'}</span> ${esc(a.reason)}${a.detail?' · '+esc(a.detail):''}</td></tr>`).join('')}</tbody></table>`:'<p class="fh-mut">Aucun appel pour l’instant.</p>'}</section>
  </div></section>`;
  c.querySelector('[data-cache]')?.addEventListener('click',()=>{cree=null;draw()});
  c.querySelector('#fh-creer').onsubmit=async e=>{e.preventDefault();const f=e.target;try{cree=await api({action:'creer',nom:f.nom.value,portees:[...f.querySelectorAll('[name=portee]:checked')].map(x=>x.value),webhook:f.webhook.value});toast('Accès créé.');await charger()}catch(err){toast(err.message)}};
  c.querySelectorAll('[data-revoquer]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api({action:'revoquer',id:b.dataset.revoquer});toast('Accès révoqué : les jetons en cours ne valent plus.');await charger()}catch(err){toast(err.message);b.disabled=false}});
  c.querySelectorAll('[data-tester]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api({action:'tester',id:b.dataset.tester});toast(r.detail);await charger()}catch(err){toast(err.message);b.disabled=false}});
 }
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='API FHIR & partenaires';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='fhir'));
  draw();charger();
 }
 return {render};
};
})(typeof self!=='undefined'?self:this);

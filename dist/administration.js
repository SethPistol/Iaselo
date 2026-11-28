/* IASELO · circuit du médicament au lit (5e veille, lot 1), dans l'onglet Prescriptions du séjour.
   - Médecin : « Prescription structurée » (médicament de la base publique, dose, voie, horaires ou si besoin) ;
     la ligne entre dans le brouillon et suit la validation existante (contrôle de sécurité compris).
   - Plan d'administration : doses de -12 h à +12 h (à venir, à donner, en retard, données, non données), doses si besoin.
   - Infirmier(ère) : « Administrer » avec contrôle des 5 B (bracelet, boîte, dose, voie, moment), scan au lecteur
     (qui tape comme un clavier) ou à la caméra si le navigateur sait lire les codes. Tout est tracé dans le séjour.
   Règles : administration-regles.js. */
(function(root){
'use strict';
const A=()=>root.IaseloAdministration;
const style=document.createElement('style');
style.textContent=`.adm{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:14px 16px;margin:0 0 16px}
.adm-tete{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between}.adm-tete h4{margin:0;font-size:1.05rem}
.adm-l{display:grid;grid-template-columns:minmax(200px,1.2fr) 2fr;gap:8px 14px;padding:10px 0;border-top:1px solid var(--border,#e9eef1);align-items:center}
.adm-l p{margin:2px 0 0;font-size:14px;color:#46555c}.adm-doses{display:flex;flex-wrap:wrap;gap:6px}
.adm-d{border:1px solid #c9d4d9;border-radius:10px;padding:5px 9px;font:inherit;font-size:14px;background:#f6f9fa;color:#1d2a30;cursor:pointer;min-height:36px}
.adm-d b{font-weight:700}.adm-d[disabled]{cursor:default}
.adm-d.e-a-donner{background:#e6f1fb;border-color:#2c6aa0;color:#123a5c}.adm-d.e-retard{background:#fdeaea;border-color:#a33;color:#7a1515}
.adm-d.e-donnee{background:#e8f5ec;border-color:#3b8a55;color:#1d5a32}.adm-d.e-non-donnee,.adm-d.e-refusee,.adm-d.e-reportee{background:#fff4dc;border-color:#9a6b00;color:#5e4100}
.adm-dlg{max-width:680px;width:calc(100% - 32px)}.adm-g{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}.adm-g label{display:grid;gap:4px;font-size:14px}.adm-g .large{grid-column:1/-1}
.adm-5b{list-style:none;padding:0;margin:10px 0;display:grid;gap:6px}.adm-5b li{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;padding:7px 10px;border-radius:10px;background:#f2f5f7;font-size:14px}
.adm-5b .ok{background:#e8f5ec}.adm-5b .attention{background:#fff4dc}.adm-5b .bloquant{background:#fdeaea}.adm-5b i{font-style:normal;font-weight:700}
.adm-scan{display:flex;gap:6px}.adm-scan input{flex:1}.adm-video{width:100%;max-height:260px;border-radius:10px;background:#000;margin-top:8px}
@media (max-width:640px){.adm-l,.adm-g{grid-template-columns:1fr}}
:where(:root[data-theme=dark]) .adm-l p{color:#c9d5da}:where(:root[data-theme=dark]) .adm-d{background:#22313a;color:#e6eef2;border-color:#4a5d68}:where(:root[data-theme=dark]) .adm-5b li{background:#22313a}`;
document.head.append(style);
const hh=s=>String(s||'').slice(11,16).replace(':',' h ');
const jour=s=>String(s||'').slice(8,10)+'/'+String(s||'').slice(5,7);
const ICONE={ok:'✓',attention:'!',bloquant:'✕'};
let cip=null;
async function tableCip(){if(cip)return cip;try{const r=await fetch('assets/medicaments-cip.json',{cache:'force-cache'});cip=r.ok?(await r.json()).cip||{}:{}}catch{cip={}}return cip}
function maintenant(){return A().versLocal(new Date())}
function dialogue(id){let d=document.getElementById(id);if(!d){d=document.createElement('dialog');d.id=id;d.className='adm-dlg';d.setAttribute('aria-labelledby',id+'-t');document.body.append(d)}return d}

// Lecture d'un code à la caméra (BarcodeDetector), si le navigateur la propose.
async function camera(cible,formats){
 if(!('BarcodeDetector' in root))return;
 const d=dialogue('adm-cam');d.innerHTML=`<div class="dialoghead"><h2 id="adm-cam-t">Scanner avec la caméra</h2><button type="button" class="icon" data-f aria-label="Fermer">×</button></div><video class="adm-video" playsinline muted></video><p class="sc-mut">Présentez le code devant la caméra.</p>`;
 let flux=null,fin=false;const stop=()=>{fin=true;flux?.getTracks().forEach(t=>t.stop());if(d.open)d.close()};
 d.querySelector('[data-f]').onclick=stop;d.onclose=()=>{fin=true;flux?.getTracks().forEach(t=>t.stop())};d.showModal();
 try{flux=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const v=d.querySelector('video');v.srcObject=flux;await v.play();
  const det=new root.BarcodeDetector({formats});
  const boucle=async()=>{if(fin)return;try{const r=await det.detect(v);if(r[0]?.rawValue){cible.value=r[0].rawValue;cible.dispatchEvent(new Event('input',{bubbles:true}));stop();return}}catch{}requestAnimationFrame(boucle)};boucle();
 }catch{d.querySelector('p').textContent='Caméra indisponible : utilisez le lecteur de codes ou saisissez le code.'}
}

function monter(conteneur,stay,ctx){
 if(!A()||!conteneur||!stay)return;
 const {esc,toast}=ctx;
 const titre=conteneur.querySelector('h3');
 const box=document.createElement('section');box.className='adm';box.setAttribute('aria-labelledby','adm-t');
 titre?titre.after(box):conteneur.prepend(box);
 const p=A().plan(stay.rx||[],maintenant());
 const btnPresc=ctx.physician?'<button type="button" class="primary ps-small" data-adm-presc>Prescription structurée</button>':'';
 box.innerHTML=`<div class="adm-tete"><h4 id="adm-t">Plan d’administration</h4><span class="sc-actions" style="margin:0">${p.retard?`<span class="sc-badge sc-crit">${p.retard} en retard</span>`:''}${p.aDonner?`<span class="sc-badge sc-warn">${p.aDonner} à donner</span>`:''}${btnPresc}</span></div>
  <p class="sc-mut">Doses de ${esc(hh(p.de))} (${esc(jour(p.de))}) à ${esc(hh(p.a))} (${esc(jour(p.a))}). ${ctx.nurse?'Touchez une dose pour l’administrer : bracelet, boîte, dose, voie et heure sont contrôlés (les 5 B).':'Les infirmier(ère)s administrent depuis ce plan avec le contrôle des 5 B.'} Seules les prescriptions structurées et validées y figurent.</p>
  ${p.lignes.length?p.lignes.map(l=>ligneHtml(l)).join(''):'<p class="sc-mut">Aucune prescription structurée validée pour ce séjour.'+(ctx.physician?' Utilisez « Prescription structurée » pour indiquer dose, voie et horaires.':'')+'</p>'}`;
 function ligneHtml(l){
  const rx=l.rx,dernieres=(rx.executions||[]).filter(e=>e.status==='Réalisée').slice(-1)[0];
  if(l.siBesoin){const s=l.siBesoin;return `<div class="adm-l"><div><strong>${esc(rx.posologie.medicament)}</strong><p>${esc(l.libelle)}</p></div><div><p>${s.sur24} dose(s) sur 24 h${s.max?' sur '+esc(String(s.max)):''}${s.derniere?' · dernière à '+esc(hh(s.derniere)):''}${s.possible?'':' · '+esc(s.raison)}</p>${ctx.nurse?`<button type="button" class="secondary ps-small" data-adm-sb="${l.index}" ${s.possible?'':'aria-disabled="true"'}>Donner une dose si besoin</button>`:''}</div></div>`}
  return `<div class="adm-l"><div><strong>${esc(rx.posologie.medicament)}</strong><p>${esc(l.libelle)}</p>${dernieres?`<p>Dernière dose : ${esc(hh(dernieres.at))} par ${esc(dernieres.author)}</p>`:''}</div>
   <div class="adm-doses">${l.creneaux.length?l.creneaux.map(c=>{const lib=A().LIB_ETAT[c.etat],fait=['donnee','non-donnee','refusee'].includes(c.etat);
    const info=c.execution?lib+' à '+hh(c.execution.at)+' par '+c.execution.author+(c.execution.note?' · '+c.execution.note:''):lib;
    return `<button type="button" class="adm-d e-${c.etat}" data-adm-dose="${l.index}" data-at="${esc(c.at)}" ${!ctx.nurse||fait?'disabled':''} aria-label="${esc(rx.posologie.medicament+' '+jour(c.at)+' '+hh(c.at)+' : '+info)}" title="${esc(info)}"><b>${esc(hh(c.at))}</b> · ${esc(lib)}</button>`}).join(''):'<p class="sc-mut">Aucune dose dans cette période.</p>'}</div></div>`;
 }
 box.querySelector('[data-adm-presc]')?.addEventListener('click',()=>prescrire(stay,ctx));
 box.querySelectorAll('[data-adm-dose]').forEach(b=>b.onclick=()=>administrer(stay,Number(b.dataset.admDose),b.dataset.at,ctx));
 box.querySelectorAll('[data-adm-sb]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-disabled')==='true'){toast(A().siBesoin(stay.rx[Number(b.dataset.admSb)],maintenant()).raison);return}administrer(stay,Number(b.dataset.admSb),'',ctx)});
}

function prescrire(stay,ctx){
 const {esc,toast}=ctx,R=A(),d=dialogue('adm-presc'),n=maintenant(),debut=n.slice(0,14)+'00';
 d.innerHTML=`<form><div class="dialoghead"><h2 id="adm-presc-t">Prescription structurée</h2><button type="button" class="icon" data-f aria-label="Fermer">×</button></div>
  <p class="sc-mut">La ligne entre dans le brouillon. Elle suit ensuite la validation habituelle, avec le contrôle de sécurité du traitement.</p>
  <div class="adm-g">
   <label class="large">Médicament (base publique des médicaments)<input name="medicament" required autocomplete="off" list="adm-bdpm" placeholder="Tapez au moins 3 lettres"><datalist id="adm-bdpm"></datalist></label>
   <label>Dose<input name="dose" required inputmode="decimal" placeholder="ex. 1"></label>
   <label>Unité<select name="unite">${R.UNITES.map(u=>`<option>${esc(u)}</option>`).join('')}</select></label>
   <label>Voie<select name="voie">${R.VOIES.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>
   <label>Fréquence<select name="frequence">${Object.entries(R.FREQUENCES).map(([k,f])=>`<option value="${k}">${esc(f.libelle)}${f.horaires.length?' ('+f.horaires.map(h=>h.slice(0,2).replace(/^0/,'')+' h').join(', ')+')':''}</option>`).join('')}</select></label>
   <label class="large" data-si="perso" hidden>Horaires (séparés par des virgules)<input name="horaires" placeholder="ex. 09:00, 21:00"></label>
   <label data-si="sb" hidden>Intervalle minimal (heures)<input name="intervalleH" inputmode="decimal" placeholder="ex. 6"></label>
   <label data-si="sb" hidden>Doses au plus par 24 h<input name="max24h" inputmode="numeric" placeholder="ex. 4"></label>
   <label>Début<input type="datetime-local" name="debut" value="${esc(debut)}" required></label>
   <label>Fin (facultatif)<input type="datetime-local" name="fin"></label>
   <label class="large">Consignes (facultatif)<textarea name="consignes" maxlength="500" rows="2"></textarea></label>
  </div><p class="warn" role="alert"></p><p class="sc-actions"><button class="primary">Ajouter au brouillon</button></p></form>`;
 const f=d.querySelector('form');let choix={};
 const sync=()=>d.querySelectorAll('[data-si]').forEach(x=>x.hidden=x.dataset.si!==f.frequence.value);f.frequence.onchange=sync;sync();
 let minuteur;f.medicament.oninput=()=>{choix={};clearTimeout(minuteur);const q=f.medicament.value.trim();if(q.length<3||!root.ParcoursBdpm?.rechercher)return;
  minuteur=setTimeout(async()=>{try{const res=await root.ParcoursBdpm.rechercher(q,12);d.querySelector('#adm-bdpm').replaceChildren(...res.map(m=>{const o=document.createElement('option');o.value=m.name;o.label=(m.substances||[]).join(' + ')+' · CIS '+m.cis;return o}));
   const exact=res.find(m=>m.name===f.medicament.value);if(exact){choix=exact;if(exact.routes){const v=R.VOIES.find(x=>exact.routes.toLowerCase().includes(x.toLowerCase()));if(v)f.voie.value=v}}}catch{}},180)};
 f.medicament.onchange=()=>f.medicament.oninput();
 d.querySelector('[data-f]').onclick=()=>d.close();
 f.onsubmit=e=>{e.preventDefault();
  const v=R.valider({cis:choix.cis||'',medicament:f.medicament.value,dose:f.dose.value,unite:f.unite.value,voie:f.voie.value,frequence:f.frequence.value,horaires:f.horaires.value.split(/[,;\s]+/).map(x=>x.replace('h',':').replace(/^(\d):/,'0$1:')).filter(Boolean),debut:f.debut.value,fin:f.fin.value,intervalleH:f.intervalleH.value,max24h:f.max24h.value,consignes:f.consignes.value});
  if(!v.ok){f.querySelector('[role=alert]').textContent=v.erreurs.join(' ');return}
  const po=v.posologie;
  stay.rx.push({name:po.medicament+' '+String(po.dose).replace('.',',')+' '+po.unite,category:'Médicament',instructions:R.libelle(po)+(po.consignes?'\n'+po.consignes:''),author:ctx.role,validated:false,posologie:po});
  ctx.event('Prescription structurée ajoutée au brouillon · '+R.libelle(po),'Prescription');d.close();ctx.detail();toast('Ligne ajoutée au brouillon : validez-la pour qu’elle entre dans le plan d’administration.');
 };
 d.showModal();f.medicament.focus();
}

function administrer(stay,index,creneau,ctx){
 const {esc,toast}=ctx,R=A(),rx=stay.rx[index];if(!rx?.posologie)return;
 const p=rx.posologie,d=dialogue('adm-admin'),n=maintenant(),cam='BarcodeDetector' in root;
 d.innerHTML=`<form><div class="dialoghead"><h2 id="adm-admin-t">Administrer · ${esc(p.medicament)}</h2><button type="button" class="icon" data-f aria-label="Fermer">×</button></div>
  <p>${esc(R.libelle(p))}${creneau?' · <b>dose de '+esc(hh(creneau))+' ('+esc(jour(creneau))+')</b>':' · <b>dose si besoin</b>'}</p>${p.consignes?`<p class="sc-mut">${esc(p.consignes)}</p>`:''}
  <div class="adm-g">
   <label class="large">Bracelet du patient<span class="adm-scan"><input name="bracelet" autocomplete="off" placeholder="Scannez le bracelet">${cam?'<button type="button" class="secondary ps-small" data-cam="bracelet">Caméra</button>':''}</span></label>
   <label class="large">Boîte du médicament (DataMatrix)<span class="adm-scan"><input name="boite" autocomplete="off" placeholder="Scannez la boîte">${cam?'<button type="button" class="secondary ps-small" data-cam="boite">Caméra</button>':''}</span></label>
   <label>Dose administrée<input name="dose" value="${esc(String(p.dose).replace('.',',')+' '+p.unite)}"></label>
   <label>Voie<select name="voie">${R.VOIES.map(v=>`<option ${v===p.voie?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
   <label>Heure<input type="datetime-local" name="at" value="${esc(n)}"></label>
   <label>Statut<select name="statut">${R.STATUTS.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
   <label class="large">Commentaire (obligatoire si un point est à vérifier ou si la dose n’est pas donnée)<textarea name="note" rows="2" maxlength="500"></textarea></label>
  </div>
  <h3 style="font-size:1rem;margin:12px 0 0">Contrôle des 5 B</h3><ul class="adm-5b" aria-live="polite"></ul>
  <p class="warn" role="alert"></p><p class="sc-actions"><button class="primary" data-ok>Enregistrer</button></p></form>`;
 const f=d.querySelector('form'),liste=d.querySelector('.adm-5b');let ctrl=null;
 const GS1=root.IaseloReglesPlus?.lireGS1;
 const calculer=async()=>{
  let boite=null;const brut=f.boite.value.trim();
  if(brut&&GS1){boite=GS1(brut);const c13=R.cipDepuisGtin(boite.gtin);if(c13){const t=await tableCip();boite.cis=t[c13]||''}}
  else if(brut)boite={gtin:brut,valide:false};
  ctrl=R.controle5B({rx,stayId:stay.id,bracelet:f.bracelet.value,boite,dose:f.dose.value,voie:f.voie.value,at:f.at.value,creneau,aujourdhui:n.slice(0,10)});
  const donne=f.statut.value==='Réalisée';
  liste.innerHTML=ctrl.points.map(x=>`<li class="${x.niveau}"><i aria-hidden="true">${ICONE[x.niveau]}</i><span><b>${esc(x.libelle)}</b> : ${esc(x.message)}</span></li>`).join('');
  d.querySelector('[data-ok]').textContent=donne?(ctrl.bloquant?'Administration bloquée':'Enregistrer l’administration'):'Enregistrer : '+f.statut.value.toLowerCase();
 };
 f.addEventListener('input',calculer);f.addEventListener('change',calculer);calculer();
 // Un lecteur de codes termine par « Entrée » : on passe au champ suivant au lieu d'envoyer le formulaire.
 [f.bracelet,f.boite].forEach((c,i)=>c.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();(i?f.dose:f.boite).focus()}}));
 d.querySelectorAll('[data-cam]').forEach(b=>b.onclick=()=>camera(f[b.dataset.cam],b.dataset.cam==='boite'?['data_matrix']:['code_128','qr_code','data_matrix']));
 d.querySelector('[data-f]').onclick=()=>d.close();
 f.onsubmit=async e=>{e.preventDefault();await calculer();
  const r=R.execution({rx,statut:f.statut.value,at:f.at.value,auteur:ctx.auteur(),role:ctx.role,dose:f.dose.value,voie:f.voie.value,note:f.note.value,creneau,controle:ctrl});
  if(r.erreur){f.querySelector('[role=alert]').textContent=r.erreur;return}
  (rx.executions??=[]).push(r.execution);
  const att=ctrl.points.filter(x=>x.niveau!=='ok').map(x=>x.libelle).join(', ');
  ctx.event('Administration · '+f.statut.value+' · '+p.medicament+(r.execution.dose?' · '+r.execution.dose+' · '+r.execution.route:'')+(creneau?' · dose de '+hh(creneau):' · si besoin')+(f.statut.value==='Réalisée'?' · 5 B : '+(att?'à vérifier ('+att+')':'conformes'):'')+(r.execution.note?' · '+r.execution.note:''),'Soins');
  d.close();ctx.detail();toast(f.statut.value==='Réalisée'?'Administration enregistrée.':'Enregistré : '+f.statut.value.toLowerCase()+'.');
 };
 d.showModal();f.bracelet.focus();
}
root.IaseloAdministrationUI={monter};
})(typeof self!=='undefined'?self:this);

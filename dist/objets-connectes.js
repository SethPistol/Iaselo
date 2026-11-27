/* IASELO · objets connectés du télésuivi (4e veille, lot G), dans le Télésuivi des patients : appareils prêtés
   (tensiomètre, oxymètre, thermomètre, balance, podomètre), mesures reçues, alertes à prendre en charge.
   SIMULATION tant que la passerelle du fournisseur n'est pas branchée. Serveur : worker/objets-connectes.mjs. */
(function(root){
'use strict';
root.createObjetsConnectes=function(ctx){
 const {esc,toast}=ctx;let etat=null,charge=false,dlg=null,detail=null;
 const style=document.createElement('style');
 style.textContent=`.oc-bloc{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:14px 16px;margin:0 0 16px}.oc-bloc h2{font-size:1.05rem;margin:0}
.oc-l{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center;padding:8px 0;border-top:1px solid var(--border,#e9eef1)}.oc-l p{margin:2px 0 0;font-size:14px;color:#46555c}
.oc-form{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:8px 0}.oc-form label{display:grid;gap:4px;font-size:14px}
.oc-dlg{max-width:760px;width:calc(100% - 32px)}.oc-t{width:100%;border-collapse:collapse;font-size:14px}.oc-t th,.oc-t td{padding:5px 8px;border-bottom:1px solid var(--border,#e3e9ec);text-align:right}.oc-t th:first-child,.oc-t td:first-child{text-align:left}.oc-t .crit{color:#8a1c1c;font-weight:700}.oc-t .warn{color:#6d4a00;font-weight:700}
:where(:root[data-theme=dark]) .oc-l p{color:#c9d5da}:where(:root[data-theme=dark]) .oc-t .crit{color:#ff9b9b}:where(:root[data-theme=dark]) .oc-t .warn{color:#f1c46b}`;
 document.head.append(style);
 const api=async(q,d)=>{const r=await fetch('/api/workspace/objets'+(q||''),d?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}:{cache:'no-store'});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Error(j.error||'Erreur.');return j};
 const nom=id=>{const s=ctx.patients.find(x=>x.id===id);return [String(s?.identity?.lastName||'').toUpperCase(),s?.identity?.firstName].filter(Boolean).join(' ')||id};
 const fdt=iso=>{const x=new Date(iso+(iso.length===16?':00':''));return isNaN(x)?iso:x.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
 const NIV={crit:['Urgent','sc-crit'],warn:['À voir','sc-warn'],info:['À noter','sc-info']};
 async function charger(){charge=true;try{etat=await api('')}catch(x){etat={erreur:x.message}}charge=false;dessiner()}
 function dessiner(){
  if(ctx.view()!=='telesuivi')return;const c=document.querySelector('#workspace');if(!c)return;
  let el=c.querySelector('.oc-bloc');if(!el){el=document.createElement('section');el.className='oc-bloc';el.setAttribute('aria-labelledby','oc-t');const aj=c.querySelector('.aj-bloc');aj?aj.after(el):c.prepend(el)}
  if(!etat){el.innerHTML='<p>Chargement des objets connectés…</p>';if(!charge)charger();return}
  if(etat.erreur){el.innerHTML=`<p class="sc-mut">${esc(etat.erreur)}</p>`;return}
  const options=ctx.patients.filter(s=>!['Consultation'].includes(s.stage)).map(s=>`<option value="${esc(s.id)}">${esc(nom(s.id))}</option>`).join('');
  el.innerHTML=`<h2 id="oc-t">Objets connectés à domicile</h2><p class="sc-mut">${etat.mode==='simulation'?'<b>Simulation</b> : aucune passerelle de fournisseur branchée, les mesures sont générées pour la démonstration. ':''}Appareils prêtés au patient à sa sortie ; chaque mesure est contrôlée par des seuils (à valider par les médecins). Ce n’est pas une surveillance en temps réel : le patient garde la consigne d’appeler le 15 en cas d’urgence.</p>
   ${etat.patients.length?etat.patients.map(p=>`<div class="oc-l"><div><strong>${esc(nom(p.stay))}</strong> ${p.alertes.length?p.alertes.slice(0,2).map(a=>`<span class="sc-badge ${NIV[a.niveau][1]}">${esc(a.titre)}</span>`).join(' '):'<span class="sc-badge sc-ok">Aucune alerte</span>'}<p>${p.mesures} mesure(s) sur 14 jours${p.derniere?' · dernière '+esc(fdt(p.derniere)):''}</p></div><button type="button" class="secondary ps-small" data-oc="${esc(p.stay)}">Voir les mesures</button></div>`).join(''):'<p class="sc-mut">Aucun appareil prêté pour l’instant.</p>'}
   <form class="oc-form" id="oc-pret"><label>Patient<select name="stay">${options}</select></label><button class="secondary ps-small">Prêter un appareil</button></form>`;
  el.querySelectorAll('[data-oc]').forEach(b=>b.onclick=()=>ouvrir(b.dataset.oc));
  el.querySelector('#oc-pret').onsubmit=e=>{e.preventDefault();ouvrir(e.target.stay.value)};
 }
 async function ouvrir(stay){
  if(!dlg){dlg=document.createElement('dialog');dlg.className='oc-dlg';dlg.setAttribute('aria-labelledby','oc-dt');document.body.append(dlg)}
  dlg.innerHTML='<p>Chargement…</p>';if(!dlg.open)dlg.showModal();
  try{detail={stay,...await api('?stay='+encodeURIComponent(stay))};dessinerDlg()}catch(x){dlg.innerHTML=`<p>${esc(x.message)}</p><button type="button" class="secondary" data-f>Fermer</button>`;dlg.querySelector('[data-f]').onclick=()=>dlg.close()}
 }
 function tableau(d){
  const jours=[...new Set(d.mesures.map(m=>m.at.slice(0,10)))].sort().reverse().slice(0,7),types=[...new Set(d.mesures.map(m=>m.type))];
  if(!jours.length)return '<p class="sc-mut">Aucune mesure reçue.</p>';
  const cell=(j,t)=>{const m=d.mesures.filter(x=>x.type===t&&x.at.startsWith(j)).at(-1);if(!m)return '<td>—</td>';const a=d.alertes.find(x=>x.cle===t+'|'+m.at);return `<td class="${a?a.niveau:''}">${esc(String(m.valeur).replace('.',','))}</td>`};
  return `<div class="cs-scroll" tabindex="0" role="region" aria-label="Mesures des 7 derniers jours"><table class="oc-t"><thead><tr><th scope="col">Mesure</th>${jours.map(j=>`<th scope="col">${esc(j.slice(8,10)+'/'+j.slice(5,7))}</th>`).join('')}</tr></thead><tbody>${types.map(t=>`<tr><th scope="row">${esc(d.mesuresLib[t].libelle)} <small>(${esc(d.mesuresLib[t].unite)})</small></th>${jours.map(j=>cell(j,t)).join('')}</tr>`).join('')}</tbody></table></div>`;
 }
 function dessinerDlg(){
  const d=detail,ouvertes=d.alertes.filter(a=>!a.vue);
  dlg.innerHTML=`<div class="dialoghead"><h2 id="oc-dt">Objets connectés · ${esc(nom(d.stay))}</h2><button type="button" class="icon" data-f aria-label="Fermer">×</button></div>
   ${ouvertes.length?`<h3>Alertes</h3>${ouvertes.map(a=>`<div class="sc-al"><span class="sc-badge ${NIV[a.niveau][1]}">${NIV[a.niveau][0]}</span><div><strong>${esc(a.titre)}</strong><p>${esc(fdt(a.at))}</p></div><button type="button" class="secondary ps-small" data-vu="${esc(a.cle)}">Pris en charge</button></div>`).join('')}`:''}
   <h3>Mesures des 7 derniers jours</h3>${tableau(d)}
   <h3>Appareils prêtés</h3>${d.appairages.length?`<ul>${d.appairages.map(a=>`<li>${esc(a.libelle)} · n° ${esc(a.numeroSerie)} <button type="button" class="secondary ps-small" data-ret="${esc(a.id)}">Rendu</button></li>`).join('')}</ul>`:'<p class="sc-mut">Aucun.</p>'}
   <form class="oc-form" id="oc-app"><label>Appareil<select name="appareil">${Object.entries(d.appareils).map(([k,a])=>`<option value="${k}">${esc(a.libelle)}</option>`).join('')}</select></label><label>Numéro de série<input name="serie" maxlength="40" required></label><button class="primary ps-small">Prêter</button></form>
   ${d.mode==='simulation'&&d.appairages.length?`<form class="oc-form" id="oc-sim"><label>Simulation<select name="scenario">${Object.entries(d.scenarios).map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label>Jours<input name="jours" type="number" min="1" max="10" value="5"></label><button class="secondary ps-small">Générer des mesures</button></form>`:''}`;
  const q=s=>dlg.querySelector(s),recharger=async()=>{await ouvrir(d.stay);etat=null;dessiner()};
  q('[data-f]').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-vu]').forEach(b=>b.onclick=async()=>{try{await api('',{action:'vu',stay:d.stay,cle:b.dataset.vu});toast('Prise en charge tracée.');recharger()}catch(x){toast(x.message)}});
  dlg.querySelectorAll('[data-ret]').forEach(b=>b.onclick=async()=>{try{await api('',{action:'retirer',id:b.dataset.ret});toast('Appareil retiré.');recharger()}catch(x){toast(x.message)}});
  q('#oc-app').onsubmit=async e=>{e.preventDefault();try{await api('',{action:'appairer',stay:d.stay,appareil:e.target.appareil.value,numeroSerie:e.target.serie.value});toast('Appareil prêté.');recharger()}catch(x){toast(x.message)}};
  const fs=q('#oc-sim');if(fs)fs.onsubmit=async e=>{e.preventDefault();try{const r=await api('',{action:'simuler',stay:d.stay,scenario:fs.scenario.value,jours:fs.jours.value});toast(r.mesures+' mesure(s) générée(s).');recharger()}catch(x){toast(x.message)}};
 }
 new MutationObserver(()=>{if(ctx.view()==='telesuivi'&&!document.querySelector('#workspace .oc-bloc'))dessiner()}).observe(document.documentElement,{childList:true,subtree:true});
 return {dessiner};
};
})(typeof self!=='undefined'?self:this);

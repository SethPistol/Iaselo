/* IASELO · écran « Accueil téléphonique » : appels reçus par l'agent vocal (ou simulés en attendant l'opérateur),
   rappels à faire par service, simulateur d'appel. Règles : accueil-telephonique-regles.js ; serveur : worker/telephonie.mjs. */
(function(root){
'use strict';
root.createAccueilTelephonique=function(ctx){
 const {esc,toast}=ctx;let data=null,erreur='',filtre='a-rappeler',dernier=null,numeros={};
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="telephonie"]'))return;
  const apres=document.querySelector('aside .nav[data-view="patients"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='telephonie';b.innerHTML=ICON+'Accueil téléphonique';b.onclick=()=>ctx.go('telephonie');apres.after(b);
  root.IaseloMenu?.appliquer?.();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,300));else setTimeout(bouton,300);
 async function api(body,qs=''){const r=await fetch('/api/workspace/telephonie'+qs,{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Erreur '+r.status);return j}
 async function charger(){erreur='';try{data=await api()}catch(e){data=null;erreur=e.message}draw()}
 const style=document.createElement('style');
 style.textContent=`.tel-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:16px;align-items:start}.tel-card{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:16px}
.tel-card h2{font-size:1.05rem;margin:0 0 10px}.tel-mode{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}.tel-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:600;background:#eef2f3;color:#33434a}
.tel-badge.sim{background:#fff1d6;color:#6d4a00}.tel-badge.ok{background:#e3f1e7;color:#1f5a32}.tel-badge.crit{background:#fbe4e4;color:#8a1c1c}
.tel-filtres{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}.tel-filtres button{border:1px solid var(--border,#d6dde2);background:transparent;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}.tel-filtres button[aria-pressed=true]{background:#134f5c;color:#fff;border-color:#134f5c}
.tel-appel{border-top:1px solid var(--border,#e3e8ec);padding:12px 0;display:grid;gap:6px}.tel-appel:first-of-type{border-top:0}.tel-tete{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tel-tete time{color:#55636a;font-size:13px}
.tel-p1{border-left:4px solid #b21f2a;padding-left:10px}.tel-dit{background:#f2f6f7;border-radius:10px;padding:8px 10px;font-size:14px}.tel-dit b{display:block;font-size:12px;color:#55636a;text-transform:uppercase;letter-spacing:.04em}
.tel-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tel-actions input{flex:1;min-width:160px;padding:6px 8px}.tel-mut{color:#55636a;font-size:14px}
.tel-sim label{display:block;font-weight:600;font-size:14px;margin:0 0 10px}.tel-sim textarea{min-height:90px}.tel-ex{display:flex;flex-direction:column;gap:6px;margin:10px 0 0}.tel-ex button{text-align:left;border:1px dashed var(--border,#c9d3d9);background:transparent;border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;cursor:pointer}
.tel-res{margin-top:12px}
@media (max-width:900px){.tel-grid{grid-template-columns:1fr}}
:where(:root[data-theme=dark]) .tel-dit{background:#1a2329}:where(:root[data-theme=dark]) .tel-badge{background:#22303a;color:#dfe8ec}`;
 document.head.append(style);
 const heure=iso=>new Date(iso).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const STATUTS={'a-rappeler':'À rappeler',transfere:'Transféré (urgence)',traite:'Traité'};
 function appelHtml(a){
  return `<article class="tel-appel ${a.priorite===1?'tel-p1':''}" aria-label="Appel du ${esc(heure(a.recuAt))}">
   <div class="tel-tete"><strong>${esc(a.libelle)}</strong><span class="tel-badge ${a.transfert?'crit':a.statut==='traite'?'ok':''}">${esc(STATUTS[a.statut]||a.statut)}</span><span class="tel-badge">${esc(a.service)}</span>${a.canal==='simulation'?'<span class="tel-badge sim">Simulé</span>':''}<time datetime="${esc(a.recuAt)}">${esc(heure(a.recuAt))}</time></div>
   <p class="tel-mut" style="margin:0">Appelant : <span>${esc(numeros[a.id]||a.numero)}</span>${numeros[a.id]?'':` <button type="button" class="secondary ps-small" data-numero="${esc(a.id)}">Afficher le numéro</button>`}</p>
   <p style="margin:0">« ${esc(a.transcription)} »</p>
   <div class="tel-dit"><b>Réponse de l’assistant</b>${esc(a.reponse)}</div>
   ${a.statut==='traite'?`<p class="tel-mut" style="margin:0">Traité par ${esc(a.traitePar)} le ${esc(heure(a.traiteAt))}${a.note?' : '+esc(a.note):''}</p>`
    :`<form class="tel-actions" data-traiter="${esc(a.id)}"><input name="note" maxlength="500" aria-label="Note de rappel" placeholder="Note (ex. rappelé, RDV décalé au 3/12)"><button class="secondary ps-small">Marquer traité</button></form>`}
  </article>`;
 }
 function draw(){
  const c=document.querySelector('#workspace');if(!c)return;
  if(erreur){c.innerHTML=`<section class="panel"><div class="content"><p class="tel-mut">${esc(erreur)}</p></div></section>`;return}
  if(!data){c.innerHTML='<section class="panel"><div class="content"><p>Chargement…</p></div></section>';return}
  const liste=data.appels.filter(a=>filtre==='tous'||(filtre==='urgences'?a.transfert:a.statut===filtre));
  c.innerHTML=`<div class="tel-mode">${data.mode==='simulation'?'<span class="tel-badge sim">Mode simulation : aucun opérateur branché</span>':'<span class="tel-badge ok">Opérateur téléphonique branché</span>'}
   <span class="tel-badge ${data.ouvert?'ok':''}">Secrétariat ${data.ouvert?'ouvert':'fermé'} (lun.-ven. 8 h-18 h)</span><span class="tel-badge">${data.aRappeler} à rappeler</span>${data.urgences?`<span class="tel-badge crit">${data.urgences} urgence(s) transférée(s)</span>`:''}</div>
  <div class="tel-grid">
   <section class="tel-card" aria-labelledby="tel-h-appels"><h2 id="tel-h-appels">Appels des 7 derniers jours</h2>
    <div class="tel-filtres" role="group" aria-label="Filtrer les appels">${[['a-rappeler','À rappeler'],['urgences','Urgences'],['traite','Traités'],['tous','Tous']].map(([k,l])=>`<button type="button" data-filtre="${k}" aria-pressed="${filtre===k}">${l}</button>`).join('')}</div>
    ${liste.length?liste.map(appelHtml).join(''):'<p class="tel-mut">Aucun appel dans cette liste.</p>'}
   </section>
   <section class="tel-card tel-sim" aria-labelledby="tel-h-sim"><h2 id="tel-h-sim">Simuler un appel</h2>
    <p class="tel-mut">L’assistant dit au décroché : « ${esc(data.accueil)} »</p>
    <form id="tel-form"><label>Numéro de l’appelant (fictif)<input name="numero" inputmode="tel" required value="06 00 00 00 00"></label>
     <label>Ce que dit l’appelant<textarea name="texte" required maxlength="4000"></textarea></label><button class="primary">Envoyer à l’assistant</button></form>
    <div class="tel-ex"><span class="tel-mut">Exemples :</span>${data.exemples.map((e,i)=>`<button type="button" data-ex="${i}">${esc(e)}</button>`).join('')}</div>
    <div class="tel-res" aria-live="polite">${dernier?`<div class="tel-dit"><b>${esc(dernier.libelle)} · ${esc(data.orientations[dernier.orientation]||dernier.orientation)}</b>${esc(dernier.reponse)}</div>`:''}</div>
    <p class="tel-mut">L’assistant ne donne aucune information personnelle (identité non vérifiée au téléphone) et ne pose aucun diagnostic. Opérateur à brancher : voir docs/accueil-telephonique.md.</p>
   </section></div>`;
  c.querySelectorAll('[data-filtre]').forEach(b=>b.onclick=()=>{filtre=b.dataset.filtre;draw()});
  c.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>{const ta=c.querySelector('#tel-form textarea');ta.value=data.exemples[+b.dataset.ex];ta.focus()});
  c.querySelectorAll('[data-numero]').forEach(b=>b.onclick=async()=>{try{const r=await api(null,'?appel='+encodeURIComponent(b.dataset.numero));numeros[b.dataset.numero]=r.numeroComplet.replace(/(\d{2})(?=\d)/g,'$1 ');draw()}catch(e){toast(e.message)}});
  c.querySelectorAll('[data-traiter]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();try{await api({action:'traiter',id:f.dataset.traiter,note:new FormData(f).get('note')});toast('Appel marqué traité.');charger()}catch(err){toast(err.message)}});
  const f=c.querySelector('#tel-form');f.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));try{const r=await api({action:'simuler',numero:v.numero,texte:v.texte});dernier=r.appel;filtre=r.appel.transfert?'urgences':'a-rappeler';await charger()}catch(err){toast(err.message)}};
 }
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Accueil téléphonique';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='telephonie'));
  draw();charger();
 }
 return {render};
};
})(typeof self!=='undefined'?self:this);

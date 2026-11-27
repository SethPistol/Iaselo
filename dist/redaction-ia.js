/* IASELO · onglet « Rédaction assistée » du dossier : le professionnel choisit un document (consultation, CRO, lettre de sortie,
   synthèse), IASELO propose un brouillon (moteur par règles ou modèle génératif hébergé HDS, selon le serveur),
   le professionnel le relit, le modifie, puis l'accepte ou le rejette. Chaque décision est tracée.
   Serveur : worker/redaction-ia.mjs. Règles : dist/redaction-ia-regles.js. */
(function(root){
'use strict';
root.createRedactionIa=function(ctx,{job}){
 const {esc,toast,current}=ctx;const $=s=>document.querySelector(s);
 const TABS={redactionIa:['postoperatoire','Rédaction assistée',99]};
 let etat=null,ouverte=null,chargement=0;
 const fmtDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 const style=document.createElement('style');
 style.textContent=`.ri-types{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.ri-types button[disabled]{opacity:.45}
.ri-moteur{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-radius:12px;background:#eef4f6;margin:0 0 12px;font-size:14px}.ri-moteur.ext{background:#fff6e6}
.ri-text{width:100%;min-height:440px!important;height:440px;resize:vertical;font-family:inherit;font-size:14px;line-height:1.5;padding:12px;border-radius:10px;border:1px solid var(--border,#d6dde2)}
.ri-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.ri-manq{color:#8F4500;font-size:14px}.ri-hist{list-style:none;margin:0;padding:0}.ri-hist li{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border,#e0e4e9)}
.ri-chip{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef2f3}.ri-chip.acceptee{background:#dff3e6;color:#0F6E55}.ri-chip.rejetee{background:#fbe3e1;color:#B21F2A}.ri-chip.proposee{background:#e3ecfb;color:#163a72}
.ri-warn{color:#8F4500}`;
 document.head.append(style);
 async function api(stay,body){const r=await fetch('/api/workspace/redaction'+(body?'':'?stay='+encodeURIComponent(stay)),{cache:'no-store',...(body?{method:'POST',body:JSON.stringify({stay,...body})}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(stay){const n=++chargement;try{const j=await api(stay);if(n!==chargement)return;etat={stay,...j};ouverte=ouverte&&etat.propositions.find(p=>p.id===ouverte.id)||etat.propositions.filter(p=>p.statut==='proposee').at(-1)||null}catch(e){etat={stay,erreur:e.message}}draw()}
 // Après un chargement, on ne redessine que si l'onglet est toujours affiché (marqueur .ri-wrap).
 function draw(force=false){
  const host=$('#content'),stay=current();if(!host||!stay||(!force&&!host.querySelector('.ri-wrap')))return;
  if(!etat||etat.stay!==stay.id){host.innerHTML='<div class="v-wrap ri-wrap"><p>Chargement…</p></div>';return}
  if(etat.erreur){host.innerHTML=`<div class="v-wrap ri-wrap"><p class="ri-warn">${esc(etat.erreur)}</p></div>`;return}
  const m=etat.moteur,p=ouverte;
  host.innerHTML=`<div class="v-wrap ri-wrap"><div class="ri-moteur ${m.local?'':'ext'}"><b>Moteur :</b> ${esc(m.label)}${etat.avertissement?` <span class="ri-warn">· ${esc(etat.avertissement)}</span>`:''}</div>
   <p class="ps-mut">IASELO propose un brouillon à partir du dossier. Rien n’est enregistré dans le dossier médical sans votre relecture. Votre décision (acceptée, modifiée ou rejetée) est tracée.</p>
   <div class="ri-types">${Object.entries(etat.types).map(([k,v])=>`<button type="button" class="secondary" data-gen="${k}" ${v.autorise?'':'disabled title="Document rédigé par un autre métier"'}>${esc(v.label)}</button>`).join('')}</div>
   ${p?`<section class="v-card"><header class="v-card-head"><div><h4>${esc(p.label)}</h4><p>Proposé le ${esc(fmtDT(p.at))} par ${esc(p.par)} · ${esc(p.moteur==='gabarit'?'par règles':'modèle génératif')}</p></div><span class="ri-chip ${p.statut}">${p.statut==='proposee'?'À relire':p.statut==='acceptee'?'Acceptée':'Rejetée'}</span></header>
    ${p.echecModele?`<p class="ri-warn">Le modèle génératif n’a pas répondu (${esc(p.echecModele)}) : brouillon par règles.</p>`:''}
    ${p.manquants?.length?`<p class="ri-manq">À compléter : ${esc(p.manquants.join(', '))}.</p>`:''}
    <textarea class="ri-text" id="ri-text" rows="22" ${p.statut==='proposee'?'':'readonly'}>${esc(p.statut==='acceptee'?p.texteFinal:p.texte)}</textarea>
    <div class="ri-actions">${p.statut==='proposee'&&etat.types[p.type]?.autorise?'<button class="primary" data-dec="acceptee">Accepter le texte relu</button><button class="secondary" data-dec="rejetee">Rejeter</button>':''}<button class="secondary" data-copier>Copier le texte</button></div>
    ${p.statut!=='proposee'?`<p class="ps-mut">${p.statut==='acceptee'?'Acceptée':'Rejetée'} par ${esc(p.decidePar)} le ${esc(fmtDT(p.decideLe))}${p.modifie?' · texte modifié avant validation':''}.</p>`:''}</section>`:''}
   ${etat.propositions.length?`<section class="v-card"><header class="v-card-head"><div><h4>Historique des propositions</h4></div></header><ul class="ri-hist">${[...etat.propositions].reverse().map(x=>`<li><span class="ri-chip ${x.statut}">${x.statut==='proposee'?'À relire':x.statut==='acceptee'?'Acceptée':'Rejetée'}</span><button type="button" class="ps-link" data-voir="${esc(x.id)}">${esc(x.label)}</button><small>${esc(fmtDT(x.at))} · ${esc(x.par)} · ${esc(x.moteur==='gabarit'?'règles':'modèle génératif')}</small></li>`).join('')}</ul></section>`:''}</div>`;
  host.querySelectorAll('[data-gen]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api(stay.id,{action:'generer',type:b.dataset.gen});ouverte=r.proposition;if(r.avertissement)toast(r.avertissement);await charger(stay.id)}catch(e){toast(e.message);b.disabled=false}});
  host.querySelectorAll('[data-dec]').forEach(b=>b.onclick=async()=>{try{await api(stay.id,{action:'decider',id:p.id,decision:b.dataset.dec,texte:$('#ri-text').value});toast(b.dataset.dec==='acceptee'?'Texte accepté : copiez-le dans le document concerné.':'Proposition rejetée.');await charger(stay.id)}catch(e){toast(e.message)}});
  host.querySelector('[data-copier]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#ri-text').value);toast('Texte copié.')}catch{$('#ri-text').select();toast('Sélectionnez puis copiez le texte.')}});
  host.querySelectorAll('[data-voir]').forEach(b=>b.onclick=()=>{ouverte=etat.propositions.find(x=>x.id===b.dataset.voir);draw(true)});
 }
 function panel(){const stay=current();if(!stay)return;if(etat?.stay!==stay.id){etat=null;ouverte=null}draw(true);charger(stay.id)}
 return {TABS,panels:{redactionIa:panel}};
};
})(typeof self!=='undefined'?self:this);

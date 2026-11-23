/* IASELO · lettre de liaison : ce qui partira automatiquement à la validation, puis suivi des envois.
   Appelé par dischargeLiaison() (parcours-v8.js). Règles : lettre-liaison-regles.js ; serveur : worker/lettre-liaison.mjs. */
(function(root){
'use strict';
const L=root.IaseloLettreLiaison,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICON={patient:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',medecin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v6a6 6 0 0 0 12 0V3"/><path d="M12 15v3a3 3 0 0 0 6 0v-1"/><circle cx="18" cy="15" r="2"/></svg>',dmp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/></svg>'};
const cache=new Map();
async function status(stay,force){
 if(!force&&cache.has(stay))return cache.get(stay);
 const r=await fetch('/api/workspace/lettre-liaison/status?stay='+encodeURIComponent(stay),{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Suivi indisponible');
 cache.set(stay,d);return d;
}
const badge=etat=>{const [label,tone]=L.ETATS[etat]||[etat,'muted'];return `<span class="ll-badge ll-${tone}">${esc(label)}</span>`};
const row=(cible,etat,texte,extra='')=>`<li class="ll-row"><span class="ll-ic">${ICON[cible]}</span><span><b>${esc(L.CIBLE[cible])}</b><small>${esc(texte)}</small>${extra}</span>${badge(etat)}</li>`;
const bandeau=modes=>{const sims=[modes?.mssante,modes?.dmp].filter(m=>m!=='test'&&m!=='production').length;return sims?'<span class="v-sim">MSSanté et DMP en simulation · homologations en cours</span>':''};

// Avant la validation : destinataires prévus, recalculés à chaque saisie.
function apercu(host,stay,form){
 if(!host||!L)return;
 const draw=d=>{const values=Object.fromEntries(new FormData(form));const errs=L.controlerDiffusion(values);
  host.innerHTML=`<section class="v-card ll-card"><header class="v-card-head"><div><p class="v-kicker">Envoi automatique</p><h4>À la validation, la lettre part seule</h4><p>Aucune autre action : chaque nouvelle version relue est transmise une fois.</p></div>${bandeau(d.modes)}</header>
   <ul class="ll-list">${L.plan(values,{contact:d.contact,messagerie:d.messagerie,mssanteMode:d.modes?.mssante,dmpMode:d.modes?.dmp,insQualifiee:d.insQualifiee}).map(x=>row(x.cible,x.etat,x.cible==='patient'&&x.etat==='prevu'?x.texte.replace('l’adresse vérifiée du séjour',d.contact.email||d.contact.phone||'l’adresse vérifiée'):x.texte)).join('')}</ul>
   ${errs.length?`<p class="warn">${esc(errs.join(' · '))}</p>`:''}</section>`};
 status(stay.id).then(d=>{draw(d);form.addEventListener('input',()=>draw(d));form.addEventListener('change',()=>draw(d))}).catch(e=>{host.innerHTML=`<p class="muted">${esc(e.message)}</p>`});
}

// Après la validation : état de chaque destinataire pour la version relue, relance si besoin.
function suivi(host,stay,{canRelaunch=false,toast=()=>{}}={}){
 if(!host||!L)return;let tries=0,timer;
 const expected=async()=>{const doc=stay.discharge?.liaison?.document;if(!doc)return '';const b=new TextEncoder().encode(L.canonique(doc));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('')};
 const draw=async()=>{
  if(!host.isConnected)return;
  let d;try{d=await status(stay.id,true)}catch(e){host.innerHTML=`<p class="muted">${esc(e.message)}</p>`;return}
  const want=await expected(),ready=d.empreinte===want&&d.envois.length===3&&!d.envois.some(e=>e.statut==='en-cours');
  const by=Object.fromEntries(d.envois.map(e=>[e.cible,e]));
  host.innerHTML=`<section class="v-card ll-card"><header class="v-card-head"><div><p class="v-kicker">Envoi automatique</p><h4>Transmission de la lettre</h4><p>${ready?'Version relue transmise le '+esc(new Date(d.envois[0].at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})):'Enregistrement de la version relue puis envoi…'}</p></div>${bandeau(d.modes)}</header>
   <ul class="ll-list">${L.CIBLES.map(([c])=>{const e=by[c];if(!e||d.empreinte!==want)return row(c,'en-cours','En attente de l’enregistrement serveur.');
    const lien=c==='patient'&&d.lien&&d.lien.versionCourante?`<small>${d.lien.ouvertLe?'Ouverte par le patient le '+esc(new Date(d.lien.ouvertLe).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})):'Pas encore ouverte'}${d.lien.bloque?' · lien bloqué (5 erreurs)':''} · lien valable jusqu’au ${esc(new Date(d.lien.expireLe).toLocaleDateString('fr-FR'))}</small>`:'';
    const relance=canRelaunch&&ready&&(['echec','a-faire'].includes(e.statut)||c==='patient'&&e.statut==='envoye')?`<button type="button" class="secondary ll-relance" data-cible="${c}">${c==='patient'&&e.statut==='envoye'?'Renvoyer le lien':'Relancer'}</button>`:'';
    return row(c,e.statut,[e.detail,c!=='patient'&&e.ref?'réf. '+e.ref:''].filter(Boolean).join(' · '),lien+relance)}).join('')}</ul>
   ${d.historique.length?`<details><summary>Versions précédentes (${new Set(d.historique.map(h=>h.version)).size})</summary><ul class="v-log">${d.historique.map(h=>`<li>${esc(new Date(h.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))} · version ${esc(h.version)} · ${esc(L.CIBLE[h.cible])} · ${esc((L.ETATS[h.statut]||[h.statut])[0])}</li>`).join('')}</ul></details>`:''}
  </section>`;
  host.querySelectorAll('.ll-relance').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/api/workspace/lettre-liaison/relancer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stay:stay.id,cible:b.dataset.cible})});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||'Relance refusée');toast('Envoi relancé : '+L.CIBLE[b.dataset.cible]);draw()}catch(e){toast(e.message);b.disabled=false}});
  if(!ready&&tries++<20){clearTimeout(timer);timer=setTimeout(draw,2000)}
 };
 draw();
}
root.IaseloLettreLiaisonEcran={apercu,suivi};
})(typeof self!=='undefined'?self:this);

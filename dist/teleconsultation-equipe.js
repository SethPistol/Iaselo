/* IASELO · téléconsultations, écran de l'équipe (5e veille, lot 7) : onglet « Téléconsultations » du Télésuivi.
   Planifier un rendez-vous vidéo (lien patient par SMS ou e-mail, ou copié), rejoindre l'appel, terminer, annuler.
   Serveur : worker/teleconsultation.mjs ; appel : visio-appel.js ; règles : teleconsultation-regles.js. */
(function(root){
'use strict';
root.createVisioEquipe=function(ctx){
 const {esc,toast}=ctx,V=root.IaseloVisio;if(!V||!root.IaseloAppel)return null;
 let data=null,erreur='',hote=null,appel=null;
 const st=document.createElement('style');
 st.textContent=`.tv-table{width:100%;border-collapse:collapse}.tv-table th,.tv-table td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--i-line,#d5dee3);vertical-align:top}.tv-table small{display:block;color:var(--i-mut,#4d5f68)}
.tv-etat{display:inline-block;font-size:12px;font-weight:650;padding:2px 8px;border-radius:99px;background:#eef2f4;color:#33474f}.tv-etat.en-cours{background:#e8f5ec;color:#14532d}.tv-etat.annulee{background:#f2f5f7;color:#4d5f68}
.tv-actions{display:flex;gap:6px;flex-wrap:wrap}.tv-dlg{width:min(560px,calc(100vw - 24px));border:0;border-radius:16px;padding:18px 20px}.tv-dlg::backdrop{background:rgba(10,30,40,.45)}.tv-dlg form{display:grid;gap:10px}
.tv-lien{display:flex;gap:8px}.tv-lien input{flex:1;font-family:ui-monospace,monospace;font-size:12px}`;
 document.head.appendChild(st);
 async function api(path,body){const r=await fetch('/api/workspace/visio'+path,{cache:'no-store',credentials:'same-origin',...(body?{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});const j=await r.json().catch(()=>({error:'Service indisponible.'}));if(!r.ok)throw new Error(j.error||'Service indisponible.');return j}
 async function charger(){try{data=await api('/liste');erreur=''}catch(e){erreur=e.message}dessiner()}
 const quand=iso=>new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 function dessiner(){
  if(!hote||!hote.isConnected)return;
  const L=data?.salles||[];
  hote.innerHTML=`<div class="v-head"><div><h3>Téléconsultations</h3><p class="v-sub">Rendez-vous vidéo avec le patient (suivi, visite de sortie à distance), de navigateur à navigateur, sur lien personnel protégé par sa date de naissance. Rien n’est enregistré. La consultation pré-anesthésique reste en présentiel.</p></div><button type="button" class="primary" data-tv-planif>Planifier une téléconsultation</button></div>
  ${erreur?`<p class="nursing-error" role="alert">${esc(erreur)}</p>`:''}
  ${data&&!data.relaisConfigure?'<p class="tp-note">Aucun serveur relais (TURN) n’est configuré : l’appel fonctionne sur le même réseau, mais peut échouer derrière certains réseaux d’entreprise ou mobiles. À configurer (VISIO_ICE_SERVERS) avec un relais hébergé en France.</p>':''}
  ${!data?'<p>Chargement…</p>':L.length?`<section class="v-card"><div class="am-scroll"><table class="tv-table"><caption class="dq-sr">Téléconsultations d’hier à J+30</caption><thead><tr><th scope="col">Rendez-vous</th><th scope="col">Patient</th><th scope="col">Statut</th><th scope="col">Actions</th></tr></thead><tbody>
  ${L.map(s=>`<tr><td><b>${esc(quand(s.debut))}</b><small>${esc(s.motifLibelle)}</small></td><td><b>${esc(s.patient||s.stay)}</b><small>${esc(s.stay)} · planifiée par ${esc(s.par)}</small></td>
   <td><span class="tv-etat ${esc(s.statut)}">${esc(s.libelle)}</span>${s.evenements.filter(e=>e.type==='patient').length?'<small>Le patient a rejoint la salle</small>':''}</td>
   <td><div class="tv-actions">${['planifiee','en-cours'].includes(s.statut)?`${s.ouverte?`<button type="button" class="primary" data-tv-rejoindre="${esc(s.id)}">Rejoindre</button>`:'<small>Ouvre 15 min avant</small>'}<button type="button" class="secondary" data-tv-lien="${esc(s.id)}">Nouveau lien</button>${s.statut==='en-cours'?`<button type="button" class="secondary" data-tv-terminer="${esc(s.id)}">Terminer</button>`:`<button type="button" class="secondary" data-tv-annuler="${esc(s.id)}">Annuler</button>`}`:''}</div></td></tr>`).join('')}
  </tbody></table></div></section>`:'<p class="tp-note">Aucune téléconsultation prévue.</p>'}`;
  hote.querySelector('[data-tv-planif]').onclick=planifier;
  hote.querySelectorAll('[data-tv-rejoindre]').forEach(b=>b.onclick=()=>rejoindre(b.dataset.tvRejoindre));
  hote.querySelectorAll('[data-tv-lien]').forEach(b=>b.onclick=async()=>{try{montrerLien(await api('',{action:'lien',id:b.dataset.tvLien}));charger()}catch(e){toast(e.message)}});
  hote.querySelectorAll('[data-tv-annuler]').forEach(b=>b.onclick=async()=>{try{await api('',{action:'annuler',id:b.dataset.tvAnnuler});toast('Téléconsultation annulée');charger()}catch(e){toast(e.message)}});
  hote.querySelectorAll('[data-tv-terminer]').forEach(b=>b.onclick=async()=>{try{await api('',{action:'terminer',id:b.dataset.tvTerminer});toast('Téléconsultation terminée');charger()}catch(e){toast(e.message)}});
 }
 function dialogue(html,ok){const d=document.createElement('dialog');d.className='tv-dlg';d.innerHTML=html;document.body.appendChild(d);d.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{d.close();d.remove()});const f=d.querySelector('form');if(f&&ok)f.onsubmit=async e=>{e.preventDefault();const err=await ok(new FormData(f),d);if(err)d.querySelector('[role=alert]').textContent=err};d.showModal();return d}
 function planifier(){
  const now=new Date(Date.now()+30*60000),p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const defaut=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  dialogue(`<form><h3 style="margin:0">Planifier une téléconsultation</h3>
  <label style="display:grid">Patient<select name="stay" required><option value="">Choisir…</option>${(data?.sejours||[]).map(s=>`<option value="${esc(s.stay)}">${esc(s.patient||s.stay)} · ${esc(s.stay)} · ${esc(s.etape)}</option>`).join('')}</select></label>
  <label style="display:grid">Date et heure (heure de Paris)<input type="datetime-local" name="debut" required value="${defaut}"></label>
  <label style="display:grid">Motif<select name="motif">${Object.entries(V.MOTIFS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
  <p class="muted" style="margin:0">Le patient reçoit le lien par SMS ou e-mail, sans donnée de santé. La salle ouvre 15 minutes avant l’heure.</p>
  <p role="alert" class="nursing-error"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="secondary" data-f>Fermer</button><button class="primary">Planifier et envoyer le lien</button></div></form>`,
  async(f,d)=>{try{const r=await api('',{action:'planifier',stay:f.get('stay'),debut:f.get('debut'),motif:f.get('motif')});d.close();d.remove();montrerLien(r);charger()}catch(e){return e.message}});
 }
 function montrerLien(r){
  const d=dialogue(`<div><h3 style="margin:0 0 8px">Lien du patient</h3><p role="status">${esc(r.envoi?.ok?r.envoi.detail:r.envoi?.raison||'')}</p>
  <div class="tv-lien"><input readonly value="${esc(r.lien)}" aria-label="Lien du patient"><button type="button" class="secondary" data-tv-copier>Copier</button></div>
  <p class="muted">Ce lien n’est montré qu’une fois. Il ne fonctionne qu’avec la date de naissance du patient.</p><div style="display:flex;justify-content:flex-end"><button type="button" class="primary" data-f>Fermer</button></div></div>`);
  d.querySelector('[data-tv-copier]').onclick=async()=>{try{await navigator.clipboard.writeText(r.lien);toast('Lien copié')}catch{d.querySelector('input').select()}};
 }
 async function rejoindre(id){
  if(appel)return;const s=data.salles.find(x=>x.id===id);
  appel=await root.IaseloAppel.ouvrir({role:'pro',titre:'Téléconsultation · '+(s?.patient||''),iceServers:data.iceServers,
   envoyer:(type,dt)=>api('/signal',{id,type,data:dt}),relever:apres=>api('/signal?id='+encodeURIComponent(id)+'&apres='+apres),fin:()=>{appel=null;charger()}});
 }
 return {monter(h){hote=h;dessiner();charger()},appel:()=>appel};
};
})(window);

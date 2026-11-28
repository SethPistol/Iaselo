/* IASELO · préhabilitation, écran de l'équipe (5e veille, lot 6, manque 9) : onglet « Préhabilitation » du Télésuivi.
   Patients inscrits (adhésion par activité, décrochage), patients à proposer (intervention entre J+7 et J+45),
   inscription avec objectifs, lien personnel envoyé par SMS ou remis en QR code, arrêt motivé.
   Serveur : worker/prehabilitation.mjs ; règles : prehabilitation-regles.js. */
(function(root){
'use strict';
root.createPrehabEquipe=function(ctx){
 const {esc,toast}=ctx,H=root.IaseloPrehab;if(!H)return null;
 let data=null,erreur='',hote=null,ouvert=null;
 const style=document.createElement('style');
 style.textContent=`.ph-table{width:100%;border-collapse:collapse}.ph-table th,.ph-table td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--i-line,#d5dee3);vertical-align:top}.ph-table small{display:block;color:var(--i-mut,#4d5f68)}
.ph-jauge{display:inline-block;width:90px;height:8px;border-radius:99px;background:#e8eef1;vertical-align:middle;margin-right:6px;overflow:hidden}.ph-jauge i{display:block;height:100%;background:var(--i-acc,#134f5c)}
.ph-etat{display:inline-block;font-size:12px;font-weight:650;padding:2px 8px;border-radius:99px;background:#eef2f4;color:#33474f}.ph-etat.decrochage{background:#fff4dc;color:#7a4a00}.ph-etat.en-cours{background:#e8f5ec;color:#14532d}
.ph-cal{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}.ph-cal span{width:14px;height:14px;border-radius:3px;background:#e8eef1}.ph-cal span.ok{background:#2f7d4f}.ph-cal span.part{background:#e0a422}.ph-cal span.vide{background:#f3d6d6}
.ph-dlg{width:min(560px,calc(100vw - 24px));border:0;border-radius:16px;padding:18px 20px}.ph-dlg::backdrop{background:rgba(10,30,40,.45)}.ph-dlg form{display:grid;gap:10px}.ph-dlg label.c{display:flex;gap:8px;align-items:center}
.ph-qr{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.ph-qr svg{border:1px solid var(--i-line,#d5dee3);border-radius:8px}
@media print{body.ph-printing>*:not(#ph-print){display:none!important}#ph-print{display:block!important;font:15px/1.5 system-ui;padding:24px}}`;
 document.head.appendChild(style);
 async function api(path,body){const r=await fetch('/api/workspace/prehab/'+path,{cache:'no-store',credentials:'same-origin',...(body?{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});const j=await r.json().catch(()=>({error:'Service indisponible.'}));if(!r.ok)throw new Error(j.error||'Service indisponible.');return j}
 async function charger(){try{data=await api('tableau');erreur=''}catch(e){erreur=e.message}dessiner()}
 const fmt=d=>d?d.split('-').reverse().join('/'):'—';
 const nom=p=>[String(p.nom||'').toUpperCase(),p.prenom].filter(Boolean).join(' ')||p.stay;
 function calendrier(p){
  const a=p.adhesion;if(!a.fenetre)return '';
  return `<div class="ph-cal" aria-hidden="true">${H.jours(a.fenetre).filter(d=>d<=data.jour).map(d=>{const e=p.journal[d];if(!e)return `<span class="${d<data.jour?'vide':''}" title="${fmt(d)}"></span>`;const n=a.objectifs.items.filter(i=>H.atteint(i,e[i],a.objectifs)).length;return `<span class="${n===a.objectifs.items.length?'ok':'part'}" title="${fmt(d)} : ${n}/${a.objectifs.items.length}"></span>`}).join('')}</div>`;
 }
 function ligne(p){
  const a=p.adhesion;
  return `<tr><td><b>${esc(nom(p))}</b><small>${esc(p.stay)} · intervention ${esc(fmt(p.date))}</small></td>
  <td><span class="ph-etat ${esc(a.code)}">${esc(a.libelle)}</span>${a.fenetre?`<small>${a.remplis} jour${a.remplis>1?'s':''} rempli${a.remplis>1?'s':''} sur ${a.joursEcoules} · J-${a.jRestants}</small>`:''}${calendrier(p)}</td>
  <td>${Object.values(a.parItem||{}).map(x=>`<div><span class="ph-jauge"><i style="width:${x.taux||0}%"></i></span>${esc(x.libelle)} ${x.taux==null?'—':x.taux+' %'}</div>`).join('')}</td>
  <td>${p.arret?`<small>Arrêté : ${esc(p.arret.motif)}</small>`:`<button type="button" class="secondary" data-ph-lien="${esc(p.stay)}">Nouveau lien</button> <button type="button" class="secondary" data-ph-arret="${esc(p.stay)}">Arrêter</button>`}</td></tr>`;
 }
 function dessiner(){
  if(!hote||!hote.isConnected)return;
  const I=data?.inscrits||[],P=data?.aProposer||[],actifs=I.filter(p=>['en-cours','decrochage'].includes(p.adhesion.code));
  const moy=actifs.length?Math.round(actifs.reduce((s,p)=>s+(p.adhesion.taux||0),0)/actifs.length):null;
  hote.innerHTML=`<div class="v-head"><div><h3>Préhabilitation</h3><p class="v-sub">Programme de J-30 à J-1 : marche, exercices, alimentation, arrêt du tabac. Le patient coche chaque jour sur son lien personnel ; vous suivez son adhésion. Contenus et objectifs par défaut à faire valider par les médecins.</p></div></div>
  ${erreur?`<p class="nursing-error" role="alert">${esc(erreur)}</p>`:''}
  ${!data?'<p>Chargement…</p>':`<div class="v-kpis"><div class="v-kpi"><span>En cours</span><strong>${actifs.length}</strong></div><div class="v-kpi"><span>Adhésion moyenne</span><strong>${moy==null?'—':moy+' %'}</strong></div><div class="v-kpi"><span>Décrochages</span><strong>${I.filter(p=>p.adhesion.code==='decrochage').length}</strong></div><div class="v-kpi"><span>À proposer</span><strong>${P.length}</strong></div></div>
  <section class="v-card"><h4 style="margin-top:0">Patients inscrits</h4>${I.length?`<div class="am-scroll"><table class="ph-table"><caption class="dq-sr">Patients inscrits à la préhabilitation</caption><thead><tr><th scope="col">Patient</th><th scope="col">Suivi</th><th scope="col">Objectifs atteints</th><th scope="col">Actions</th></tr></thead><tbody>${I.map(ligne).join('')}</tbody></table></div>`:'<p class="tp-note">Aucun patient inscrit.</p>'}</section>
  <section class="v-card"><h4 style="margin-top:0">Patients à proposer · intervention entre J+7 et J+45</h4>${P.length?`<ul class="tp-list">${P.map(p=>`<li><div><b>${esc(nom(p))}</b><small>${esc(p.stay)} · ${esc(p.specialite)} · intervention ${esc(fmt(p.date))}${p.contact?'':' · pas de portable ni d’e-mail vérifié : QR code à remettre'}</small></div><button type="button" class="primary" data-ph-inscrire="${esc(p.stay)}">Inscrire</button></li>`).join('')}</ul>`:'<p class="tp-note">Aucun patient à proposer.</p>'}</section>`}`;
  hote.querySelectorAll('[data-ph-inscrire]').forEach(b=>b.onclick=()=>inscrire(b.dataset.phInscrire));
  hote.querySelectorAll('[data-ph-lien]').forEach(b=>b.onclick=async()=>{try{const r=await api('action',{action:'lien',stay:b.dataset.phLien});montrerLien(b.dataset.phLien,r)}catch(e){toast(e.message)}});
  hote.querySelectorAll('[data-ph-arret]').forEach(b=>b.onclick=()=>arreter(b.dataset.phArret));
 }
 function dialogue(html,ok){const d=document.createElement('dialog');d.className='ph-dlg';d.innerHTML=html;document.body.appendChild(d);const fermer=()=>{d.close();d.remove()};d.querySelectorAll('[data-f]').forEach(b=>b.onclick=fermer);const f=d.querySelector('form');if(f&&ok)f.onsubmit=async e=>{e.preventDefault();const err=await ok(new FormData(f),d);if(err){d.querySelector('[role=alert]').textContent=err;return}};d.showModal();d.querySelector('input,textarea,button')?.focus();return {d,fermer}}
 function inscrire(stay){
  const p=data.aProposer.find(x=>x.stay===stay)||{stay};
  const h=dialogue(`<form><h3 style="margin:0">Inscrire ${esc(nom(p))} à la préhabilitation</h3><p class="muted" style="margin:0">Intervention le ${esc(fmt(p.date))}. Le programme va jusqu’à la veille.</p>
  <fieldset><legend>Activités suivies</legend>${['marche','exercices','nutrition'].map(i=>`<label class="c"><input type="checkbox" name="items" value="${i}" checked> ${esc(H.ITEMS[i].libelle)}</label>`).join('')}<label class="c"><input type="checkbox" name="fumeur"> Fumeur : suivre l’arrêt du tabac</label></fieldset>
  <label style="display:grid">Objectif de marche (minutes par jour)<input type="number" name="marcheMin" min="5" max="180" value="${data.marcheDefaut}"></label>
  <p role="alert" class="nursing-error"></p><div class="on-actions" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="secondary" data-f>Fermer</button><button class="primary">Inscrire et envoyer le lien</button></div></form>`,
  async(f,d)=>{try{const r=await api('action',{action:'inscrire',stay,items:f.getAll('items'),marcheMin:Number(f.get('marcheMin')),fumeur:f.get('fumeur')==='on'});d.close();d.remove();montrerLien(stay,r);charger()}catch(e){return e.message}});
 }
 function montrerLien(stay,r){
  const qr=root.IaseloQR?root.IaseloQR.svg(r.lien,{taille:180,titre:'QR code du programme de préparation'}):'';
  const p=[...(data?.aProposer||[]),...(data?.inscrits||[])].find(x=>x.stay===stay)||{stay};
  const h=dialogue(`<div><h3 style="margin:0 0 8px">Lien du programme créé</h3><p role="status">${r.envoi?.ok?esc(r.envoi.detail):esc(r.envoi?.raison||'Lien non envoyé.')}</p>
  <div class="ph-qr">${qr}<p class="muted" style="max-width:260px">Le patient peut aussi flasher ce QR code. Il lui sera demandé sa date de naissance. Ce lien n’est montré qu’une fois : imprimez-le maintenant si besoin.</p></div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="secondary" data-ph-imprimer>Imprimer pour le patient</button><button type="button" class="primary" data-f>Fermer</button></div></div>`);
  h.d.querySelector('[data-ph-imprimer]').onclick=()=>{const s=document.createElement('div');s.id='ph-print';s.style.display='none';s.innerHTML=`<h2>Ma préparation à l’intervention</h2><p>${esc(nom(p))} · intervention le ${esc(fmt(p.date))}</p><p>Chaque jour jusqu’à la veille de l’intervention, flashez ce QR code avec votre téléphone et cochez vos activités (marche, exercices, alimentation${r.prehab?.objectifs?.items?.includes('tabac')?', tabac':''}). Votre date de naissance vous sera demandée.</p>${qr}<p>En cas de question, appelez la clinique. En cas d’urgence, le 15.</p>`;document.body.append(s);document.body.classList.add('ph-printing');try{window.print()}finally{document.body.classList.remove('ph-printing');s.remove()}};
 }
 function arreter(stay){
  dialogue(`<form><h3 style="margin:0">Arrêter la préhabilitation</h3><label style="display:grid">Motif<textarea name="motif" required minlength="3" maxlength="300"></textarea></label><p role="alert" class="nursing-error"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="secondary" data-f>Fermer</button><button class="primary">Arrêter</button></div></form>`,
  async(f,d)=>{try{await api('action',{action:'arreter',stay,motif:f.get('motif')});d.close();d.remove();toast('Préhabilitation arrêtée');charger()}catch(e){return e.message}});
 }
 return {monter(h){hote=h;dessiner();charger()}};
};
})(window);

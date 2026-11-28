/* IASELO · « Mon tableau de bord » du praticien (5e veille, lot 6, manque 7) : mon activité, mes documents en attente,
   mes indicateurs qualité comparés à la moyenne anonyme de l'établissement. Ouvert depuis « Ma journée » (médecins).
   Serveur : worker/tableau-praticien.mjs ; règles : tableau-praticien-regles.js. */
(function(root){
'use strict';
root.createTableauPraticien=function(ctx){
 const {esc}=ctx;let donnees=null,erreur='',jours=30,chargement=0;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>';
 const style=document.createElement('style');
 style.textContent=`.tp-per{display:flex;gap:6px;flex-wrap:wrap}.tp-per button[aria-pressed=true]{background:var(--i-acc,#134f5c);color:#fff;border-color:var(--i-acc,#134f5c)}
.tp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.tp-ind{border:1px solid var(--i-line,#d5dee3);border-radius:14px;padding:14px 16px;background:var(--i-s1,#fff)}
.tp-ind h4{margin:0 0 4px;font-size:15px}.tp-ind p{margin:0;color:var(--i-mut,#4d5f68);font-size:13px}.tp-val{display:flex;align-items:baseline;gap:10px;margin:10px 0 6px}.tp-val strong{font-size:30px;line-height:1}
.tp-bar{position:relative;height:8px;border-radius:99px;background:#e8eef1;margin:8px 0 4px}.tp-bar i{position:absolute;inset:0 auto 0 0;border-radius:99px;background:var(--i-acc,#134f5c)}.tp-bar b{position:absolute;top:-4px;width:2px;height:16px;background:#1b2b33}
.tp-cmp{display:inline-block;font-size:12px;font-weight:650;padding:2px 8px;border-radius:99px;background:#eef2f4;color:#33474f}.tp-cmp.mieux{background:#e8f5ec;color:#14532d}.tp-cmp.moins{background:#fff4dc;color:#7a4a00}
.tp-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.tp-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--i-line,#d5dee3);border-radius:10px;padding:8px 12px}.tp-list small{display:block;color:var(--i-mut,#4d5f68)}
.tp-lien{display:inline-flex;align-items:center;gap:6px;margin-top:10px}.tp-note{font-size:13px;color:var(--i-mut,#4d5f68)}`;
 document.head.appendChild(style);
 async function charger(){const n=++chargement;try{const r=await fetch('/api/workspace/mon-tableau?jours='+jours,{cache:'no-store',credentials:'same-origin'});const j=await r.json().catch(()=>({error:'Service indisponible.'}));if(!r.ok)throw new Error(j.error||'Service indisponible.');if(n!==chargement)return;donnees=j;erreur=''}catch(e){if(n!==chargement)return;erreur=e.message}dessiner()}
 const pct=v=>v===null||v===undefined?'—':v+' %';
 function carte(def,moi,etab){
  const m=moi?.[def.id],e=etab?.[def.id],c=root.IaseloTableauPraticien?.comparer(m?.taux,e?.taux,def.sens)||{code:'na',texte:''};
  const det=def.id==='antibio'?`${m?.conformes||0} sur ${m?.total||0}${m?.nonTracees?` · ${m.nonTracees} non tracée${m.nonTracees>1?'s':''}`:''}`:def.id==='retards'?`${m?.n||0} sur ${m?.total||0}${m?.moyenneMin!=null?` · écart moyen ${m.moyenneMin} min`:''}`:`${m?.n||0} sur ${m?.total||0} patients`;
  return `<article class="tp-ind"><h4>${esc(def.titre)}</h4><p>${esc(def.aide)}</p>
   <div class="tp-val"><strong>${pct(m?.taux)}</strong>${c.code!=='na'?`<span class="tp-cmp ${c.code}">${esc(c.texte)}</span>`:''}</div>
   <div class="tp-bar" role="img" aria-label="Moi ${pct(m?.taux)}, établissement ${pct(e?.taux)}"><i style="width:${Math.max(0,Math.min(100,m?.taux||0))}%"></i>${e?.taux!=null?`<b style="left:${e.taux}%"></b>`:''}</div>
   <p>${esc(det)} · établissement ${pct(e?.taux)}</p></article>`;
 }
 function dessiner(){
  const host=document.querySelector('#workspace');if(!host||ctx.view()!=='monTableau')return;
  const d=donnees,moi=d?.moi,etab=d?.etablissement;
  host.innerHTML=`<div class="v-wrap"><header class="v-head"><div><p class="v-kicker">${ICON} Praticien</p><h3>Mon tableau de bord</h3><p class="v-sub">Mon activité, mes documents en attente et mes indicateurs qualité, comparés à la moyenne anonyme de l’établissement (barre noire).</p></div>
  <div class="tp-per" role="group" aria-label="Période">${[30,90,365].map(n=>`<button type="button" class="${n===jours?'primary':'secondary'}" data-tp-j="${n}" aria-pressed="${n===jours}">${n===365?'12 mois':n+' jours'}</button>`).join('')}</div></header>
  ${erreur?`<p class="nursing-error" role="alert">${esc(erreur)}</p>`:''}
  ${!d?'<p>Chargement…</p>':`<div class="v-kpis"><div class="v-kpi"><span>Mes séjours</span><strong>${moi.sejours}</strong></div><div class="v-kpi"><span>Interventions</span><strong>${moi.interventions}</strong></div><div class="v-kpi"><span>Consultations validées</span><strong>${moi.consultations}</strong></div><div class="v-kpi"><span>Documents en attente</span><strong>${d.enAttente.length}</strong></div></div>
  <section class="v-card"><h4 style="margin-top:0">À terminer</h4>${d.enAttente.length?`<ul class="tp-list">${d.enAttente.map(x=>`<li><div><b>${esc(x.patient||x.stay)}</b><small>${esc(x.stay)} · ${esc(x.quoi)}</small></div><button type="button" class="secondary" data-tp-open="${esc(x.stay)}" data-tp-onglet="${esc(x.onglet)}">Ouvrir</button></li>`).join('')}</ul>`:'<p class="tp-note">Rien en attente.</p>'}</section>
  <section><h4>Mes indicateurs qualité · ${esc(d.periode.debut.split('-').reverse().join('/'))} au ${esc(d.periode.fin.split('-').reverse().join('/'))}</h4>
  <div class="tp-grid">${d.indicateurs.map(def=>carte(def,moi,etab)).join('')}</div>
  <p class="tp-note">${etab?`Moyenne de l’établissement calculée sur ${etab.sejours} séjours, sans nom ni numéro de séjour.`:`Moyenne de l’établissement masquée : moins de ${d.seuilPetitEffectif} séjours sur la période.`} Définitions IASELO à faire valider par les médecins avant tout usage qualité officiel.</p></section>
  ${d.aRevoir.length?`<section class="v-card"><h4 style="margin-top:0">Séjours à revoir</h4><ul class="tp-list">${d.aRevoir.map(x=>`<li><div><b>${esc(x.stay)}</b><small>${esc(x.motifs.join(' · '))}</small></div><button type="button" class="secondary" data-tp-open="${esc(x.stay)}">Ouvrir</button></li>`).join('')}</ul></section>`:''}`}
  </div>`;
  host.querySelectorAll('[data-tp-j]').forEach(b=>b.onclick=()=>{jours=Number(b.dataset.tpJ);donnees=null;dessiner();charger()});
  host.querySelectorAll('[data-tp-open]').forEach(b=>b.onclick=()=>ctx.ouvrir(b.dataset.tpOpen,b.dataset.tpOnglet||''));
 }
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Mon tableau de bord';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='priorities'));
  dessiner();charger();
 }
 // Accès depuis « Ma journée » (médecins).
 function lien(){
  if(!['anesthesiste','chirurgien'].includes(ctx.job?.()))return;
  const hero=document.querySelector('.j-hero');if(!hero||hero.querySelector('.tp-lien'))return;
  const b=document.createElement('button');b.type='button';b.className='secondary tp-lien';b.dataset.tpLien='1';b.innerHTML=ICON+'Mon tableau de bord : activité et qualité';b.onclick=()=>ctx.go('monTableau');hero.append(b);
 }
 return {render,lien};
};
})(window);

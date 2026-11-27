/* IASELO · écran « Coût par séjour » (4e veille, lot F) : coûts estimés (bloc, SSPI, hébergement, consommables),
   recette de l'établissement (GHS du dossier de facturation) et résultat, par séjour, par spécialité et par mode.
   Séjours pseudonymisés (identifiant, spécialité, mode). Calcul serveur : worker/cout-sejour.mjs. */
(function(root){
'use strict';
root.createCoutSejour=function(ctx){
 const {$,esc,toast}=ctx;let mois='',data=null,erreur='',chargement=0;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/></svg>';
 const style=document.createElement('style');
 style.textContent=`.cs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;margin:0 0 16px}.cs-table{width:100%;border-collapse:collapse;font-size:14px}.cs-table th,.cs-table td{padding:6px 8px;border-bottom:1px solid var(--border,#e3e9ec);text-align:right;white-space:nowrap}.cs-table th:first-child,.cs-table td:first-child,.cs-table .g{text-align:left}
.cs-neg{color:#8a1c1c;font-weight:700}.cs-pos{color:#1f5a32;font-weight:600}.cs-scroll{overflow-x:auto;margin:0 0 18px}.cs-est{font-size:12px;color:#6d4a00}.cs-reg{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.cs-reg label{display:grid;gap:4px;font-size:14px}.cs-reg input{width:8em}
:where(:root[data-theme=dark]) .cs-neg{color:#ff9b9b}:where(:root[data-theme=dark]) .cs-pos{color:#8fd6a5}:where(:root[data-theme=dark]) .cs-est{color:#f1c46b}`;
 document.head.append(style);
 function bouton(){
  if(document.querySelector('aside .nav[data-view="coutsSejour"]'))return;
  const apres=document.querySelector('aside .nav[data-view="indicateurs"]')||document.querySelector('aside .nav[data-view="activity"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='coutsSejour';b.innerHTML=ICON+'Coût par séjour';b.onclick=()=>ctx.go('coutsSejour');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,450));else setTimeout(bouton,450);
 const eur=n=>n==null?'—':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
 const res=n=>n==null?'<span title="GHS à saisir">—</span>':`<span class="${n<0?'cs-neg':'cs-pos'}">${eur(n)}</span>`;
 const nomMois=m=>{const [a,n]=m.split('-').map(Number);const s=new Date(Date.UTC(a,n-1,15)).toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});return s.charAt(0).toUpperCase()+s.slice(1)};
 const voisin=(m,d)=>{const [a,n]=m.split('-').map(Number),x=new Date(Date.UTC(a,n-1+d,1));return x.getUTCFullYear()+'-'+String(x.getUTCMonth()+1).padStart(2,'0')};
 async function charger(){const n=++chargement;erreur='';try{const r=await fetch('/api/workspace/cout-sejour?mois='+mois,{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Erreur.');if(n===chargement)data=j}catch(x){if(n===chargement){erreur=x.message;data=null}}draw()}
 const kpi=(l,v,d,crit)=>`<div class="j-kpi ind-static ${crit?'is-crit':''}"><span>${esc(l)}</span><strong>${v}</strong><small>${esc(d)}</small></div>`;
 function groupe(titre,g){return `<h3>${esc(titre)}</h3><div class="cs-scroll" tabindex="0" role="region" aria-label="${esc(titre)}"><table class="cs-table"><thead><tr><th scope="col">${esc(titre.replace('Par ','').replace(/^./,c=>c.toUpperCase()))}</th><th scope="col">Séjours</th><th scope="col">Coût moyen</th><th scope="col">Coût total</th><th scope="col">Recette</th><th scope="col">Résultat</th></tr></thead><tbody>${g.map(x=>`<tr><td>${esc(x.groupe)}</td><td>${x.sejours}</td><td>${eur(x.coutMoyen)}</td><td>${eur(x.cout)}</td><td>${x.sansRecette===x.sejours?'—':eur(x.recette)}</td><td>${res(x.sansRecette===x.sejours?null:x.resultat)}</td></tr>`).join('')}</tbody></table></div>`}
 function draw(){
  const host=$('#cs-body');if(!host)return;
  if(erreur){host.innerHTML=`<p class="notice warn">${esc(erreur)}</p>`;return}
  if(!data){host.innerHTML='<p class="j-empty">Calcul en cours…</p>';return}
  const s=data.synthese,R=data.reglages;
  host.innerHTML=`<div class="cs-kpis">${kpi('Séjours',s.sejours,nomMois(data.mois))}${kpi('Coût estimé',eur(s.cout),'moyenne '+eur(s.coutMoyen))}${kpi('Recette (GHS)',s.sansRecette===s.sejours?'—':eur(s.recette),s.sansRecette?s.sansRecette+' séjour(s) sans GHS (facturation)':'tous les séjours')}${kpi('Résultat',s.sansRecette===s.sejours?'—':eur(s.resultat),s.sansRecette===s.sejours?'GHS à saisir pour calculer':s.deficitaires+' séjour(s) déficitaire(s)',s.resultat<0)}</div>
   ${s.sejours?groupe('Par spécialité',data.parSpecialite)+groupe('Par mode',data.parMode):''}
   <h3>Par séjour (du plus déficitaire au plus rentable)</h3><div class="cs-scroll" tabindex="0" role="region" aria-label="Coût par séjour"><table class="cs-table"><thead><tr><th scope="col">Séjour</th><th scope="col" class="g">Spécialité · mode</th><th scope="col">Bloc</th><th scope="col">SSPI</th><th scope="col">Nuits</th><th scope="col">Coût</th><th scope="col">Recette</th><th scope="col">Résultat</th></tr></thead>
   <tbody>${data.lignes.map(l=>`<tr><td>${esc(l.stay)}<br><small>${esc(l.date)}</small></td><td class="g">${esc(l.specialite)} · ${esc(l.mode)}${l.estimes.length?`<br><span class="cs-est">Estimé : ${esc(l.estimes.join(' ; '))}</span>`:''}</td><td>${l.minutesBloc} min</td><td>${l.minutesSspi} min</td><td>${l.nuits}</td><td title="${esc(Object.entries(l.postes).map(([k,v])=>k+' '+eur(v)).join(' · '))}">${eur(l.total)}</td><td title="${esc(l.recetteSource)}">${eur(l.recette)}</td><td>${res(l.resultat)}</td></tr>`).join('')||'<tr><td colspan="8" class="g">Aucun séjour ce mois-ci.</td></tr>'}</tbody></table></div>
   <details class="cs-details" ${data.peutRegler?'':'hidden'}><summary>Coûts unitaires de l’établissement</summary><p class="pi-sub">Valeurs par défaut indicatives : remplacez-les par celles de votre comptabilité analytique. Le coût d’une minute de bloc inclut le personnel, le matériel et l’amortissement de la salle.</p>
    <form class="cs-reg" id="cs-reg">${[['minuteBloc','Minute de bloc (€)'],['minuteSspi','Minute de SSPI (€)'],['nuit','Nuit en hospitalisation (€)'],['ambulatoire','Place d’ambulatoire (€)'],['consommables','Consommables par intervention (€)'],['sspiDefautMin','SSPI par défaut (min)']].map(([k,l])=>`<label>${l}<input name="${k}" inputmode="decimal" value="${esc(String(R[k]).replace('.',','))}"></label>`).join('')}<button class="primary">Enregistrer</button></form>${R.modifiePar?`<p class="pi-sub">Modifiés par ${esc(R.modifiePar)} le ${esc(new Date(R.modifieLe).toLocaleDateString('fr-FR'))}.</p>`:''}</details>
   <p class="ind-note">Coûts estimés par coûts unitaires (méthode proche de l’ENC) à partir du déroulement du bloc, de la SSPI et du planning des lits. Recette de l’établissement estimée à partir du GHS du dossier de facturation (GHS, journées EXH, implants en sus, forfait journalier, chambre particulière), hors honoraires des praticiens. Séjours pseudonymisés ; chaque consultation est tracée.</p>
   <p><button type="button" class="secondary" id="cs-csv">Exporter (CSV)</button></p>`;
  const f=$('#cs-reg');if(f)f.onsubmit=async e=>{e.preventDefault();const reglages=Object.fromEntries([...new FormData(f)].map(([k,v])=>[k,String(v).replace(',','.')]));try{const r=await fetch('/api/workspace/cout-sejour',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reglages})});const j=await r.json();if(!r.ok)throw Error(j.error);toast('Coûts unitaires enregistrés.');charger()}catch(x){toast(x.message)}};
  $('#cs-csv').onclick=()=>{const l=[['sejour','date','specialite','mode','minutes_bloc','minutes_sspi','nuits','cout_bloc','cout_sspi','cout_hebergement','cout_consommables','cout_total','recette','resultat','estimations'].join(';'),...data.lignes.map(x=>[x.stay,x.date,x.specialite,x.mode,x.minutesBloc,x.minutesSspi,x.nuits,x.postes.bloc,x.postes.sspi,x.postes.hebergement,x.postes.consommables,x.total,x.recette??'',x.resultat??'',x.estimes.join(' / ')].map(v=>'"'+String(v).replace(/"/g,'""').replace('.',',')+'"').join(';'))].join('\n');
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+l],{type:'text/csv;charset=utf-8'}));a.download='cout-par-sejour-'+data.mois+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 }
 function render(){
  if(!mois)mois=new Date().toISOString().slice(0,7);
  $('#title').textContent='Coût par séjour';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='coutsSejour'));
  $('#workspace').innerHTML=`<section class="panel"><div class="content"><div class="ind-head"><p>Coût complet estimé de chaque séjour comparé à la recette de l’établissement : repérer les séjours et les spécialités déficitaires.</p><div class="pi-mois"><button type="button" class="secondary" data-cs-mois="-1" aria-label="Mois précédent">‹</button><strong>${esc(nomMois(mois))}</strong><button type="button" class="secondary" data-cs-mois="1" aria-label="Mois suivant">›</button></div></div><div id="cs-body"></div></div></section>`;
  document.querySelectorAll('[data-cs-mois]').forEach(b=>b.onclick=()=>{mois=voisin(mois,Number(b.dataset.csMois));data=null;render()});
  draw();charger();
 }
 return {render};
};
})(window);

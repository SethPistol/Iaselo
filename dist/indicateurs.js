/* IASELO · écran « Activité & occupation » (profil Administration et administrateur).
   Affiche les chiffres agrégés renvoyés par GET /api/workspace/indicateurs : aucun nom ni numéro de séjour. */
(function(root){
'use strict';
root.createIndicateurs=function(ctx){
 const {$,esc}=ctx;let date='',data=null,erreur='',chargement=0;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
 const aujourdhui=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const fmtPct=v=>v===null||v===undefined?'—':String(v).replace('.',',')+' %';
 const heures=m=>{const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+String(r).padStart(2,'0'):''):r+' min'};
 const style=document.createElement('style');
 style.textContent='.ind-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px;margin:0 0 18px}.ind-head p{margin:0;color:var(--i-mut,#5b6b73);max-width:640px}.ind-head label{display:flex;flex-direction:column;gap:4px;font-size:13px}.ind-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:18px}.ind-bars{list-style:none;margin:0;padding:0;display:grid;gap:10px}.ind-bars li{display:grid;grid-template-columns:minmax(120px,1fr) 2fr 42px;align-items:center;gap:10px;font-size:14px}.ind-bar{height:10px;border-radius:999px;background:var(--i-s2,#eef2f3);overflow:hidden}.ind-bar i{display:block;height:100%;background:var(--i-acc,#1f6b78);border-radius:999px}.ind-bars b{text-align:right;font-variant-numeric:tabular-nums}.ind-note{font-size:13px;color:var(--i-mut,#5b6b73);margin:14px 0 0}.j-kpi.ind-static{cursor:default}';
 document.head.append(style);
 function bouton(){
  if(document.querySelector('aside .nav[data-view="indicateurs"]'))return;
  const titres=[...document.querySelectorAll('aside .navtitle')],gestion=titres.find(t=>/GESTION/i.test(t.textContent))||titres[0];if(!gestion)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='indicateurs';b.innerHTML=ICON+'Activité & occupation';b.onclick=()=>ctx.go('indicateurs');gestion.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 async function charger(){const n=++chargement;erreur='';try{const r=await fetch('/api/workspace/indicateurs?date='+encodeURIComponent(date),{cache:'no-store'});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(n!==chargement)return;if(!r.ok)throw Error(j.error||'Indicateurs indisponibles.');data=j}catch(e){if(n!==chargement)return;data=null;erreur=e.message}draw()}
 function barres(list,libelle=x=>x){const max=Math.max(1,...list.map(x=>x.n));return list.length?`<ul class="ind-bars">${list.map(x=>`<li><span>${esc(libelle(x.label))}</span><span class="ind-bar" aria-hidden="true"><i style="width:${Math.round(x.n*100/max)}%"></i></span><b>${x.n}</b></li>`).join('')}</ul>`:'<p class="j-empty">Aucune donnée.</p>'}
 const kpi=(label,valeur,detail,crit)=>`<div class="j-kpi ind-static ${crit?'is-crit':''}"><span>${esc(label)}</span><strong>${valeur}</strong><small>${esc(detail)}</small></div>`;
 function draw(){
  const host=$('#ind-body');if(!host)return;
  if(erreur){host.innerHTML=`<p class="notice warn">${esc(erreur)}</p>`;return}
  if(!data){host.innerHTML='<p class="j-empty">Calcul des indicateurs…</p>';return}
  const d=data,b=d.bloc,secteur=k=>k==='non-renseigne'?'Secteur non renseigné':(ctx.sectors?.[k]||k);
  host.innerHTML=`<section class="j-kpis" aria-label="Indicateurs principaux">
   ${kpi('Séjours en cours',d.sejours.enCours,d.sejours.total+' séjour'+(d.sejours.total>1?'s':'')+' au total')}
   ${kpi('Taux d’ambulatoire',fmtPct(d.sejours.tauxAmbulatoire),'séjours au mode renseigné')}
   ${kpi('Occupation du bloc',fmtPct(b.tauxOccupation),b.minutesOuvertes?heures(b.minutesProgrammees)+' / '+heures(b.minutesOuvertes)+' de vacation':'aucune vacation ce jour',b.tauxOccupation>100)}
   ${kpi('Lits occupés',d.lits.places?d.lits.occupees+' / '+d.lits.places:'—',d.lits.places?fmtPct(d.lits.taux)+' maintenant':'aucun lit déclaré')}
  </section>
  <div class="ind-grid">
   <section class="j-card"><div class="j-card-head"><h3>Séjours par étape</h3></div>${barres(d.sejours.parEtape)}</section>
   <section class="j-card"><div class="j-card-head"><h3>Séjours par spécialité</h3></div>${barres(d.sejours.parSpecialite)}</section>
   <section class="j-card"><div class="j-card-head"><h3>Patients présents par secteur</h3></div>${barres(d.sejours.parSecteur,secteur)}</section>
   <section class="j-card"><div class="j-card-head"><h3>Bloc et SSPI · ${esc(d.date.split('-').reverse().join('/'))}</h3></div>${barres([{label:'Salles ouvertes',n:b.salles},{label:'Vacations',n:b.vacations},{label:'Interventions programmées',n:b.interventions},{label:'En salle',n:b.enSalle},{label:'Terminées',n:b.terminees},{label:'Annulées',n:b.annulees},{label:'Places de SSPI occupées',n:d.sspi.occupees}])}</section>
  </div>
  <p class="ind-note">Chiffres agrégés calculés par le serveur à ${esc(d.genereA.slice(11,16))}, sans nom ni numéro de séjour. Les catégories de moins de ${d.seuil} séjours sont regroupées dans « Autres ». Chaque consultation de cet écran est tracée.</p>`;
 }
 function render(){
  if(!date)date=aujourdhui();
  $('#title').textContent='Activité & occupation';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='indicateurs'));
  $('#workspace').innerHTML=`<section class="panel"><div class="content"><div class="ind-head"><p>Vue d’ensemble de l’établissement pour la direction et l’administration : activité des séjours et occupation du bloc, de la SSPI et des lits.</p><label>Journée du bloc<input type="date" id="ind-date" value="${esc(date)}"></label></div><div id="ind-body"></div></div></section>`;
  $('#ind-date').onchange=e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){date=e.target.value;data=null;draw();charger()}};
  draw();charger();
 }
 return {render};
};
})(window);

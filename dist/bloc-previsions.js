/* IASELO · onglets « Prévisions & créneaux » et « Analyse du bloc » de Bloc & lits (27/11/2026).
   Règles : dist/bloc-previsions-regles.js. Serveur (liste d'attente, libérations, bourse) : worker/bloc-optimisation.mjs.
   Tout est proposé : aucune intervention n'est déplacée sans action d'un professionnel. */
(function(root){
'use strict';
const B=()=>root.IaseloBlocPrevisions;
root.createBlocPrevisions=function(ctx){
 const {esc,patients,resources,reservations,vacations,toast}=ctx;
 let serveur=null,chargeAt=0,periode='mois',erreur='';
 const hm=s=>s?String(s).slice(11,16):'';
 const jourFr=s=>{if(!s)return '';const d=new Date(String(s).slice(0,10)+'T12:00:00Z');return d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})};
 const salle=id=>String(resources.find(r=>r.id===id)?.label||id||'').replace(/\s*\(démo[^)]*\)/,'');
 const nom=id=>{const i=patients.find(p=>p.id===id)?.identity||{};return i.lastName?String(i.lastName).toUpperCase()+' '+(i.firstName||''):''};
 const profil=()=>ctx.access?.()?.profile||{};
 const table=(heads,rows,vide='Aucune donnée pour cette sélection.')=>rows.length?`<div class="management-scroll"><table class="management-table bp-table"><thead><tr>${heads.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<p class="empty">${vide}</p>`;
 const badge=(t,ton='')=>`<span class="bp-badge ${ton}">${esc(t)}</span>`;
 const minFr=m=>m===null||m===undefined?'—':(m<0?'−':'')+(Math.abs(m)>=60?Math.floor(Math.abs(m)/60)+' h '+String(Math.abs(m)%60).padStart(2,'0'):Math.abs(m)+' min');
 async function api(body){const r=await fetch('/api/workspace/bloc-optimisation',{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json().catch(()=>({error:'Réponse illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(force){if(!force&&serveur&&Date.now()-chargeAt<20000)return;try{serveur=await api();chargeAt=Date.now();erreur=''}catch(e){erreur=e.message;serveur=serveur||{liste:[],liberations:[],demandes:[],droits:{}}}}

 /* ---------- Prévisions & créneaux ---------- */
 function sectionJour(day){
  const P=B().previsionJour({reservations,vacations,day});
  const lignes=P.lignes.map(l=>{const e=l.estimation,ton=e.confiance==='elevee'?'ok':e.confiance==='moyenne'?'':'warn';
   return [hm(l.start),esc(salle(l.resource)),esc(nom(l.patient)||l.patient),esc(l.surgeon||'—'),esc(l.procedure||'—'),minFr(l.prevue),
    `<b>${minFr(e.minutes)}</b>${e.p25!==null?`<small class="bp-muted"> (${e.p25}–${e.p75})</small>`:''}`,`<span title="${esc(e.libelle)}">${badge(B().CONFIANCE[e.confiance]||'—',ton)}<small class="bp-muted"> ${e.n?e.n+' passages':'prévu'}</small></span>`,
    l.reelle!==null?badge('Réel '+minFr(l.reelle),'ok'):l.alerte?badge((e.ecart>0?'+':'')+minFr(e.ecart),e.ecart>0?'crit':'ok'):'—',hm(l.finEstimee)]});
  const vacs=P.vacations.map(v=>`<article class="bp-vac ${v.debordement>0?'crit':''}"><strong>${esc(salle(v.resource))} · ${esc(v.surgeon||'vacation libre')}</strong><span>${hm(v.start)}–${hm(v.end)} · ${v.cas} intervention${v.cas>1?'s':''}</span><span>Fin estimée <b>${hm(v.finEstimee)||'—'}</b>${v.debordement>0?` · dépassement prévu <b>${minFr(v.debordement)}</b>`:''}</span></article>`).join('');
  return `<h3>Programme du ${esc(jourFr(day))} : durées estimées</h3><p class="bp-muted">Estimation = médiane des passages réels de la clinique (même chirurgien et même acte d’abord ; survolez la confiance pour la base de calcul), fourchette 25e–75e centile entre parenthèses. ${P.historique} passages terminés servent de référence. L’estimation ne modifie pas le programme : elle aide à le corriger.</p>
  ${vacs?`<div class="bp-vacs">${vacs}</div>`:''}${table(['Heure','Salle','Patient','Chirurgien','Acte','Prévu','Estimé','Confiance','Écart','Fin estimée'],lignes,'Aucune intervention programmée ce jour.')}`;
 }
 function sectionCapacite(day){
  const C=B().previsionCapacite({reservations,vacations,resources,day});
  const cell=(n,cap,sat)=>`<td class="${sat?'crit':n&&cap&&n>=cap?'warn':''}">${n}${cap?'<small>/'+cap+'</small>':''}</td>`;
  return `<h3>SSPI et lits : occupation prévue</h3><p class="bp-muted">Calculée depuis les fins de salle estimées et la durée médiane de SSPI de la clinique (${C.sspiMediane} min). Rouge : capacité dépassée.</p>
  <div class="management-scroll"><table class="management-table bp-heatmap"><thead><tr><th scope="row">Heure</th>${C.heures.map(h=>`<th>${h.heure} h</th>`).join('')}</tr></thead><tbody><tr><th scope="row">SSPI</th>${C.heures.map(h=>cell(h.sspi,h.sspiCap,h.sspiSature)).join('')}</tr><tr><th scope="row">Lits</th>${C.heures.map(h=>cell(h.lits,h.litsCap,h.litsSature)).join('')}</tr></tbody></table></div>`;
 }
 function sectionLiberer(today){
  const d=serveur?.droits||{},lib=B().aLiberer({vacations,reservations,today});
  const demandee=id=>(serveur?.liberations||[]).find(x=>x.vacationId===id&&x.status==='demandee');
  const rows=lib.slice(0,10).map(x=>{const v=x.vacation,dem=demandee(v.id),moi=d.chirurgien&&B().sameSurgeon(v.surgeon,d.nom);
   const actions=[d.gestion&&!dem?`<button class="secondary" data-bp="liberation-demander" data-vac="${esc(v.id)}">Proposer la libération au chirurgien</button>`:'',
    (moi||d.gestion)?`<button class="secondary" data-bp="liberer" data-vac="${esc(v.id)}">Libérer</button>`:'',moi&&dem?`<button class="secondary" data-bp="garder" data-vac="${esc(v.id)}">Garder</button>`:''].join(' ');
   return [esc(jourFr(v.start))+' '+hm(v.start)+'–'+hm(v.end),esc(salle(v.resource)),esc(v.surgeon),`<b>${B().pct(x.taux)}</b> <small class="bp-muted">${x.cas} interv. · ${minFr(x.libre)} libres</small>`,'J−'+x.jours,dem?badge('Libération proposée','warn'):'—',actions]});
  const pourMoi=(serveur?.liberations||[]).filter(x=>x.pourMoi&&x.status==='demandee');
  return `<h3>Vacations à libérer (J+7 à J+21)</h3>${pourMoi.length?`<p class="notice warn">Le cadre de bloc vous propose de libérer ${pourMoi.length} vacation${pourMoi.length>1?'s':''} peu remplie${pourMoi.length>1?'s':''} : choisissez « Libérer » ou « Garder » ci-dessous.</p>`:''}
  <p class="bp-muted">Vacations remplies à moins de 50 % entre 7 et 21 jours avant la date. Une vacation libérée passe dans la bourse aux créneaux ; elle ne peut l’être que vide d’interventions.</p>${table(['Date','Salle','Titulaire','Remplissage','Délai','État',''],rows,'Aucune vacation sous le seuil de remplissage.')}${lib.length>10?`<p class="bp-muted">Les 10 vacations les moins remplies sont affichées sur ${lib.length}.</p>`:''}`;
 }
 function sectionBourse(today){
  const d=serveur?.droits||{},fin=B().addDays(today,30);
  const libres=vacations.filter(v=>v.liberee&&v.state!=='Annulée'&&String(v.start).slice(0,10)>=today&&String(v.start).slice(0,10)<=fin);
  const dems=id=>(serveur?.demandes||[]).filter(x=>x.vacationId===id&&x.status==='demandee');
  const rows=libres.map(v=>{const ds=dems(v.id),mienne=ds.some(x=>x.deMoi);
   return [esc(jourFr(v.start))+' '+hm(v.start)+'–'+hm(v.end),esc(salle(v.resource)),esc(v.titulaireInitial||'—'),esc(v.liberee?.motif||''),
    ds.length?ds.map(x=>esc(x.data.surgeon)+(d.gestion?` <button class="secondary" data-bp="attribuer" data-vac="${esc(v.id)}" data-dem="${esc(x.id)}">Attribuer</button>`:'')).join('<br>'):'—',
    d.chirurgien&&!mienne?`<button class="primary" data-bp="demander" data-vac="${esc(v.id)}">Demander ce créneau</button>`:mienne?badge('Demande envoyée','ok'):''];
  });
  const trous=B().creneauxLibres({vacations:vacations.filter(v=>!v.liberee),reservations,from:today,to:B().addDays(today,14)}).filter(c=>c.minutes>=60).slice(0,12);
  return `<h3>Bourse aux créneaux</h3><p class="bp-muted">Vacations libérées des 30 prochains jours : un chirurgien les demande, le cadre de bloc les attribue. Le nouveau titulaire voit ses annonces placées automatiquement dans la vacation.</p>${table(['Date','Salle','Libérée par','Motif','Demandes',''],rows,'Aucune vacation libérée pour l’instant.')}
  <h4>Temps libre dans les vacations (14 jours, 1 h et plus)</h4>${table(['Date','Salle','Titulaire','Libre'],trous.map(c=>[esc(jourFr(c.start))+' '+hm(c.start)+'–'+hm(c.end),esc(salle(c.resource)),esc(c.surgeon||'—'),minFr(c.minutes)]),'Aucun temps libre d’une heure ou plus.')}`;
 }
 function sectionAttente(today){
  const d=serveur?.droits||{},liste=(serveur?.liste||[]).filter(x=>['attente','propose','accepte'].includes(x.status));
  const creneaux=B().creneauxLibres({vacations,reservations,from:today,to:B().addDays(today,60)});
  const matches=B().correspondances(liste.map(x=>({...x,status:x.status==='propose'?'attente':x.status})),creneaux,{maintenant:serveur?.maintenant||ctx.now()});
  const pour=id=>matches.find(m=>m.attente.id===id)?.creneaux||[];
  const etat={attente:badge('En attente'),propose:badge('Créneau proposé','warn'),accepte:badge('Accepté : à reprogrammer','ok')};
  const rows=liste.map(x=>{const c=pour(x.id),last=(x.data.propositions||[]).at(-1);
   return [esc(x.patient||nom(x.data.stay)||x.data.stay),esc(x.data.surgeon),minFr(x.data.dureeMin),esc((x.data.desDe?'dès le '+jourFr(x.data.desDe):'')+(x.data.jusquA?' · jusqu’au '+jourFr(x.data.jusquA):'')),x.data.dateActuelle?esc(jourFr(x.data.dateActuelle)):'—',
    etat[x.status]+(last?`<br><small class="bp-muted">${esc(jourFr(last.creneau.start))} ${hm(last.creneau.start)} · ${last.sms?.envoye?'SMS '+esc(last.sms.to):esc(last.sms?.raison||'')}</small>`:''),
    (c.length&&d.appel&&x.status!=='accepte'?c.slice(0,3).map(s=>`<button class="secondary" data-bp="proposer" data-id="${esc(x.id)}" data-start="${esc(s.start)}" data-res="${esc(s.resource)}" data-vac="${esc(s.vacationId)}">Proposer ${esc(jourFr(s.start))} ${hm(s.start)}</button>`).join(' '):c.length?esc(c.length+' créneau(x) possible(s)'):'<span class="bp-muted">aucun créneau</span>')+
    (d.appel&&x.status==='propose'?` <button class="secondary" data-bp="reponse" data-id="${esc(x.id)}" data-ok="1">Patient d’accord</button> <button class="secondary" data-bp="reponse" data-id="${esc(x.id)}" data-ok="0">Refus</button>`:'')+
    (d.attente?` <button class="secondary" data-bp="attente-retirer" data-id="${esc(x.id)}">Retirer</button>`:'')]});
  const sejours=patients.filter(p=>p.identity).slice(0,400);
  const form=d.attente?`<form id="bp-attente" class="management-form"><div class="formgrid"><label>Patient<select name="stay" required><option value="">Choisir…</option>${sejours.map(p=>`<option value="${esc(p.id)}">${esc(nom(p.id)||p.id)}</option>`).join('')}</select></label><label>Chirurgien<input name="surgeon" required maxlength="120" value="${esc(profil().profession==='chirurgien'?profil().display_name||'':'')}"></label><label>Durée (min)<input name="dureeMin" type="number" min="10" max="720" value="60" required></label><label>Disponible dès le<input name="desDe" type="date" value="${esc(today)}"></label><label>Jusqu’au<input name="jusquA" type="date"></label><label>Date actuelle de l’intervention<input name="dateActuelle" type="date"></label><label>Prévenance (h)<input name="prevenanceHeures" type="number" min="2" max="240" value="48"></label><label>Note (sans donnée médicale)<input name="note" maxlength="300"></label></div><p role="alert" class="management-error"></p><button class="primary">Inscrire sur la liste d’attente</button></form>`:'';
  return `<h3>Liste d’attente de patients</h3><p class="bp-muted">Patients prêts à être opérés plus tôt. IASELO cherche, sur 60 jours, un temps libre du même chirurgien (ou une vacation libérée) assez long, dans la fenêtre du patient et avec le délai de prévenance. Le SMS envoyé ne contient ni nom, ni date, ni motif : le patient rappelle le secrétariat, qui reprogramme dans « Programmer un séjour ».</p>${form}${table(['Patient','Chirurgien','Durée','Disponibilité','Date actuelle','État','Créneaux possibles'],rows,'Aucun patient en attente.')}`;
 }
 /* ---------- Analyse du bloc ---------- */
 function bornes(today){const m=today.slice(0,7);if(periode==='mois')return [m+'-01',today];if(periode==='precedent'){const d=new Date(m+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);const p=d.toISOString().slice(0,7);const fin=new Date(m+'-01T12:00:00Z');fin.setUTCDate(0);return [p+'-01',fin.toISOString().slice(0,10)]}const d=new Date(today+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-3);return [d.toISOString().slice(0,10),today]}
 function renderAnalyse(host,today){
  const [from,to]=bornes(today),A=B().analyse({reservations,vacations,from,to}),g=A.global;
  const tuile=(t,v,s='')=>`<article class="management-metric bp-kpi"><span>${esc(t)}</span><strong>${v}</strong>${s?`<small>${esc(s)}</small>`:''}</article>`;
  const ligne=x=>[esc(x.cle==='(vacation libre)'?x.cle:x.cle&&resources.some(r=>r.id===x.cle)?salle(x.cle):x.cle),x.vacations,x.cas,`<b>${B().pct(x.utilisation)}</b>`,x.retardsPremiere+(x.retardMoyen!==null?` <small class="bp-muted">(moy. ${x.retardMoyen} min)</small>`:''),x.rotationMediane===null?'—':x.rotationMediane+' min',x.depassements+(x.minutesDepassees?` <small class="bp-muted">(${minFr(x.minutesDepassees)})</small>`:''),x.liberees,x.annulations];
  const heads=['','Vacations','Interventions','Utilisation','1re entrée en retard','Rotation médiane','Dépassements','Libérées','Annulations'];
  host.innerHTML=`<div class="management-toolbar"><label>Période<select id="bp-periode">${[['mois','Mois en cours'],['precedent','Mois précédent'],['trimestre','3 derniers mois']].map(([k,l])=>`<option value="${k}" ${k===periode?'selected':''}>${l}</option>`).join('')}</select></label><span class="bp-muted">du ${esc(jourFr(from))} au ${esc(jourFr(to))}</span><button type="button" class="secondary" id="bp-imprimer">Imprimer</button></div>
  <div class="bp-kpis">${tuile('Utilisation des vacations',B().pct(g.utilisation),'temps patient en salle / temps de vacation')}${tuile('Interventions réalisées',g.faits,g.cas+' programmées')}${tuile('Premières entrées en retard',g.retardsPremiere,'plus de 15 min après le début de vacation')}${tuile('Rotation médiane',g.rotationMediane===null?'—':g.rotationMediane+' min','sortie → entrée suivante')}${tuile('Vacations dépassées',g.depassements,minFr(g.minutesDepassees)+' au total')}${tuile('Précision des durées',A.ecartDuree.n?(A.ecartDuree.mediane>0?'+':'')+A.ecartDuree.mediane+' min':'—',A.ecartDuree.n?'écart médian réel − prévu ('+A.ecartDuree.n+' interv.)':'pas encore de passage terminé')}</div>
  <h3>Par chirurgien</h3>${table(heads,A.parChirurgien.map(ligne))}<h3>Par salle</h3>${table(heads,A.parSalle.map(ligne))}
  <p class="bp-muted">Définitions : utilisation = somme des durées réelles en salle (entrée → sortie) / durée des vacations ; retard de première entrée au-delà de 15 min ; rotation = sortie de salle → entrée du patient suivant dans la même vacation. Seuils à valider par le conseil de bloc.</p>`;
  host.querySelector('#bp-periode').onchange=e=>{periode=e.target.value;renderAnalyse(host,today)};host.querySelector('#bp-imprimer').onclick=()=>window.print();
 }
 /* ---------- Rendu et actions ---------- */
 async function renderPrevisions(host,day){
  const today=ctx.today();host.innerHTML='<p class="j-empty">Calcul des prévisions…</p>';await charger();
  host.innerHTML=`${erreur?`<p class="notice warn">${esc(erreur)}</p>`:''}<div class="bp-root">${sectionJour(day)}${sectionCapacite(day)}${sectionLiberer(today)}${sectionBourse(today)}${sectionAttente(today)}</div>`;
  brancher(host,day);
 }
 function brancher(host,day){
  const f=host.querySelector('#bp-attente');
  if(f)f.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));v.dureeMin=Number(v.dureeMin);v.prevenanceHeures=Number(v.prevenanceHeures);const err=B().attenteError(v);if(err){f.querySelector('[role=alert]').textContent=err;return}
   try{await api({action:'attente-ajouter',...v});toast('Patient inscrit sur la liste d’attente');await charger(true);renderPrevisions(host,day)}catch(x){f.querySelector('[role=alert]').textContent=x.message}};
  host.querySelectorAll('[data-bp]').forEach(b=>b.onclick=async()=>{
   const a=b.dataset.bp,body={action:a,id:b.dataset.id,vacationId:b.dataset.vac};
   if(a==='liberer'){const m=prompt('Motif de la libération (congés, formation, activité faible…)');if(!m)return;body.motif=m}
   if(a==='attente-retirer'){const m=prompt('Motif du retrait de la liste d’attente');if(!m)return;body.motif=m}
   if(a==='proposer')body.creneau={start:b.dataset.start,resource:b.dataset.res,vacationId:b.dataset.vac};
   if(a==='reponse')body.accepte=b.dataset.ok==='1';
   if(a==='attribuer')body.demandeId=b.dataset.dem;
   b.disabled=true;
   try{const r=await api(body);
    const msg={proposer:r.sms?.envoye?'SMS envoyé au patient ('+r.sms.to+')':'Proposition notée : '+(r.sms?.raison||'appelez le patient'),liberer:'Vacation libérée : elle passe dans la bourse aux créneaux',attribuer:'Vacation attribuée',demander:'Demande envoyée au cadre de bloc','liberation-demander':'Libération proposée au chirurgien',garder:'Vacation gardée',reponse:body.accepte?'Accord noté : reprogrammez le patient dans « Programmer un séjour »':'Refus noté : le patient reste en attente','attente-retirer':'Patient retiré de la liste'}[a];
    toast(msg);await charger(true);
    if(['liberer','attribuer'].includes(a)){setTimeout(()=>location.reload(),900);return}
    renderPrevisions(host,day);
   }catch(x){b.disabled=false;toast(x.message)}
  });
 }
 return {render(host,day,onglet){if(onglet==='analyse'){renderAnalyse(host,ctx.today());return}renderPrevisions(host,day)}};
};
})(typeof self!=='undefined'?self:this);

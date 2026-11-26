/* IASELO · écran « Plannings infirmiers » (26/11/2026, demande de Romain).
   Le cadre prépare le planning du mois (postes, horaires, gardes, astreintes, repos, absences), l'enregistre et le valide.
   Les infirmier(ère)s le consultent en lecture seule (leur planning et celui de l'équipe, dernière version validée).
   Les droits sont contrôlés par le serveur (worker/plannings-infirmiers.mjs) ; règles : dist/plannings-infirmiers-regles.js. */
(function(root){
'use strict';
root.createPlanningsInfirmiers=function(ctx){
 const {$,esc,toast}=ctx,R=root.IaseloPlanningsInfirmiers;if(!R)return null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4m8-4v4M3.5 10h17"/><path d="M7.5 13.5h2m2.5 0h2m2.5 0h0M7.5 16.5h2m2.5 0h2"/></svg>';
 const JOURS=['D','L','M','M','J','V','S'];
 let service='',mois='',data=null,erreur='',outil='J',travail=null,modifie=false,envoi=false,chargement=0,historique=null,vueEquipe=false;
 const fmtDate=iso=>iso?new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})+' à '+new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
 const nomMois=m=>{const [a,n]=m.split('-').map(Number);const s=new Date(Date.UTC(a,n-1,15)).toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});return s.charAt(0).toUpperCase()+s.slice(1)};
 const moisActuel=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
 const aujourdhui=()=>{const d=new Date();return moisActuel()+'-'+String(d.getDate()).padStart(2,'0')};
 function bouton(){
  if(document.querySelector('aside .nav[data-view="planningsInfirmiers"]'))return;
  const apres=document.querySelector('aside .nav[data-view="regulation"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='planningsInfirmiers';b.innerHTML=ICON+'Plannings infirmiers';b.onclick=()=>ctx.go('planningsInfirmiers');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 async function api(q,options){const r=await fetch('/api/workspace/plannings-infirmiers'+(q||''),{cache:'no-store',...(options||{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok){const e=Error(j.error||'Service indisponible.');e.status=r.status;throw e}return j}
 const cadre=()=>!!data?.peutGerer;
 async function charger(){
  const n=++chargement;erreur='';historique=null;
  try{const j=await api('?'+new URLSearchParams({...(service?{service}:{}),mois}));if(n!==chargement)return;data=j;service=j.service;
   travail=j.planning?{personnes:j.planning.personnes.map(p=>({...p})),affectations:JSON.parse(JSON.stringify(j.planning.affectations||{}))}:{personnes:[],affectations:{}};modifie=false}
  catch(e){if(n!==chargement)return;data=null;erreur=e.message}
  draw();
 }
 function cellule(a,editable,jour,pid){
  const c=a&&R.CODES[a.code],h=a&&R.horaires(a),special=a&&(a.debut||a.fin);
  const titre=c?c.label+(h?' · '+h.debut+'–'+h.fin:'')+(a.note?' · '+a.note:''):'Non planifié';
  return `<td class="pi-c ${c?'pi-'+c.ton:''} ${R.weekEnd(jour)?'pi-we':''} ${jour===aujourdhui()?'pi-today':''}" title="${esc(titre)}" ${editable?`data-pi-cell="${esc(pid)}|${jour}" tabindex="0" role="button"`:''}>${c?esc(a.code)+(special||a.note?'<i>•</i>':''):''}</td>`;
 }
 function grille(planning,editable,monUser){
  const jours=R.joursDuMois(mois),heures=R.heuresParPersonne(planning,mois),eff=R.effectifs(planning,mois);
  const tete=`<tr><th class="pi-nom">Équipe</th>${jours.map(d=>`<th class="${R.weekEnd(d)?'pi-we':''} ${d===aujourdhui()?'pi-today':''}"><small>${JOURS[R.jourSemaine(d)]}</small>${Number(d.slice(8))}</th>`).join('')}<th class="pi-h">Heures</th></tr>`;
  const lignes=planning.personnes.map(p=>`<tr class="${monUser&&p.userId===monUser?'pi-moi':''}"><th class="pi-nom"><span>${esc(p.nom)}</span>${p.fonction?`<small>${esc(p.fonction)}</small>`:''}${editable?`<button type="button" class="pi-retirer" data-pi-retirer="${esc(p.id)}" aria-label="Retirer ${esc(p.nom)} du planning">×</button>`:''}</th>${jours.map(d=>cellule(planning.affectations[p.id]?.[d],editable,d,p.id)).join('')}<td class="pi-h">${Math.round(heures[p.id]||0)} h</td></tr>`).join('');
  const pied=`<tr class="pi-eff"><th class="pi-nom">Au travail</th>${jours.map(d=>`<td class="${R.weekEnd(d)?'pi-we':''}" title="${esc(Object.entries(eff[d]).filter(([k])=>k!=='total').map(([k,v])=>v+' '+R.CODES[k].label).join(', ')||'Personne')}">${eff[d].total||''}</td>`).join('')}<td></td></tr>`;
  return `<div class="pi-scroll"><table class="pi-grid"><thead>${tete}</thead><tbody>${lignes||`<tr><td colspan="${jours.length+2}" class="pi-vide">Aucune personne au planning.</td></tr>`}</tbody><tfoot>${pied}</tfoot></table></div>`;
 }
 function legende(){return `<div class="pi-legende">${R.ORDRE.map(k=>{const c=R.CODES[k];return `<span class="pi-tag pi-${c.ton}"><b>${esc(k)}</b> ${esc(c.label)}${c.debut?' '+esc(c.debut)+'–'+esc(c.fin):''}</span>`}).join('')}</div>`}
 function monPlanning(planning,monUser){
  const moi=planning.personnes.find(p=>p.userId===monUser);if(!moi)return '<p class="notice">Vous ne figurez pas sur ce planning. Voyez avec votre cadre.</p>';
  const jours=R.joursDuMois(mois).filter(d=>mois!==moisActuel()||d>=aujourdhui()),ligne=planning.affectations[moi.id]||{},h=R.heuresParPersonne(planning,mois)[moi.id]||0;
  return `<p class="pi-sub">${esc(moi.nom)} · ${Math.round(h)} h prévues sur le mois</p><ul class="pi-moi-liste">${jours.map(d=>{const a=ligne[d],c=a&&R.CODES[a.code],t=a&&R.horaires(a);return `<li class="${d===aujourdhui()?'pi-today':''}"><span class="pi-date">${esc(new Date(d+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}))}</span><span class="pi-tag ${c?'pi-'+c.ton:''}"><b>${c?esc(a.code):'—'}</b> ${c?esc(c.label):'Non planifié'}</span><span>${t?esc(t.debut)+'–'+esc(t.fin):''}${a?.note?' · '+esc(a.note):''}</span></li>`}).join('')}</ul>`;
 }
 function entete(){
  const pl=data?.planning,svc=data?.services||[];
  const chip=!pl?'<span class="os-chip">Pas encore de planning</span>':pl.statut==='valide'?`<span class="os-chip ok">Validé par ${esc(pl.validePar)} le ${esc(fmtDate(pl.valideLe))}</span>`:pl.statut==='modifie'?`<span class="os-chip warn">Modifié depuis la validation du ${esc(fmtDate(pl.valideLe))} : à revalider</span>`:'<span class="os-chip warn">Brouillon non validé</span>';
  return `<div class="pi-barre">${svc.length>1?`<div class="pi-services" role="tablist">${svc.map(s=>`<button type="button" role="tab" aria-selected="${s===service}" class="${s===service?'active':''}" data-pi-service="${s}">${esc(R.SERVICES[s])}</button>`).join('')}</div>`:`<strong>${esc(R.SERVICES[service]||'')}</strong>`}
   <div class="pi-mois"><button type="button" class="secondary" data-pi-mois="-1" aria-label="Mois précédent">‹</button><strong>${esc(nomMois(mois))}</strong><button type="button" class="secondary" data-pi-mois="1" aria-label="Mois suivant">›</button>${mois!==moisActuel()?'<button type="button" class="secondary" data-pi-mois="0">Ce mois-ci</button>':''}</div>${chip}
   <button type="button" class="secondary no-print" data-pi-imprimer>Imprimer</button></div>`;
 }
 function draw(){
  const host=$('#pi-body');if(!host)return;
  if(erreur){host.innerHTML=`<p class="notice warn">${esc(erreur)}</p>`;return}
  if(!data){host.innerHTML='<p class="j-empty">Chargement…</p>';return}
  const pl=data.planning;let html=entete();
  if(cadre()){
   const al=R.alertes(travail,mois),presents=new Set(travail.personnes.map(p=>p.userId).filter(Boolean)),dispo=(data.comptes||[]).filter(c=>!presents.has(c.userId)&&(service==='bloc'?c.poste!=='etage':c.poste!=='bloc'));
   html+=`<p class="pi-sub">Cliquez sur un outil puis sur les cases du planning. Les infirmier(ère)s ne voient que la dernière version <b>validée</b>.</p>
   <div class="pi-outils no-print" role="toolbar" aria-label="Codes du planning">${R.ORDRE.map(k=>`<button type="button" class="pi-tag pi-${R.CODES[k].ton} ${outil===k?'active':''}" data-pi-outil="${k}" title="${esc(R.CODES[k].label)}"><b>${esc(k)}</b> ${esc(R.CODES[k].label)}</button>`).join('')}<button type="button" class="pi-tag ${outil==='gomme'?'active':''}" data-pi-outil="gomme"><b>⌫</b> Effacer</button><button type="button" class="pi-tag ${outil==='detail'?'active':''}" data-pi-outil="detail"><b>✎</b> Horaires et remarque</button></div>
   ${grille(travail,true,null)}
   <div class="pi-ajout no-print"><label>Ajouter une personne<select id="pi-compte"><option value="">Compte infirmier(ère)…</option>${dispo.map(c=>`<option value="${esc(c.userId)}">${esc(c.nom)} · ${({cadre:'cadre de bloc','cadre-etage':'cadre d’étage',bloc:'bloc',etage:'étage'})[c.poste]||'étage'}</option>`).join('')}</select></label><label>ou sans compte (intérim, renfort)<input id="pi-libre" maxlength="80" placeholder="Nom et prénom"></label><label>Fonction<input id="pi-fonction" maxlength="60" placeholder="IDE, IBODE, IADE, AS…"></label><button type="button" class="secondary" data-pi-ajouter>Ajouter</button>${!travail.personnes.length?'<button type="button" class="secondary" data-pi-reprendre>Reprendre l’équipe du mois précédent</button>':''}</div>
   ${al.length?`<section class="notice warn pi-alertes"><strong>${al.length} alerte${al.length>1?'s':''} (repos de 11 h, 48 h par semaine, 6 jours d’affilée)</strong><ul>${al.slice(0,30).map(a=>`<li>${esc(a.message)}</li>`).join('')}</ul>${al.length>30?`<p>… et ${al.length-30} autre(s).</p>`:''}<p>Vous pouvez valider malgré tout en indiquant le motif : il est conservé dans l’historique.</p></section>`:''}
   <div class="pi-actions no-print"><label>Motif ${pl&&pl.statut!=='brouillon'||al.length?'(exigé : planning déjà validé ou alertes)':'(facultatif)'}<input id="pi-motif" maxlength="300" placeholder="Ex. : remplacement d’un arrêt, échange accepté par les deux agents"></label>
    <button type="button" class="primary" data-pi-enregistrer ${envoi||!modifie?'disabled':''}>Enregistrer${modifie?' les modifications':''}</button>
    <button type="button" class="primary" data-pi-valider ${envoi||modifie||!pl||pl.statut==='valide'?'disabled':''}>Valider le planning</button>${modifie?'<span class="pi-sub">Modifications non enregistrées.</span>':''}</div>
   ${legende()}
   <details class="pi-hist no-print" ${historique?'open':''}><summary>Historique des versions et validations</summary><div id="pi-hist">${historique?historiqueHtml():'<p class="pi-sub">Chargement…</p>'}</div></details>`;
  }else{
   html+=`<p class="notice pi-lecture">Lecture seule : ce planning est préparé et validé par un cadre. Pour un échange ou une absence, adressez-vous à votre cadre.</p>`;
   if(!pl)html+='<p class="notice">Le planning de ce mois n’est pas encore validé par le cadre.</p>';
   else{
    if(pl.miseAJourEnCours)html+='<p class="notice warn">Le cadre prépare une mise à jour de ce planning : la version ci-dessous reste celle qui s’applique jusqu’à sa validation.</p>';
    const moiPresent=pl.personnes.some(p=>p.userId===data.monId);
    if(moiPresent&&data.services.length===1)html+=`<div class="pi-services pi-vues" role="tablist"><button type="button" role="tab" aria-selected="${!vueEquipe}" class="${!vueEquipe?'active':''}" data-pi-vue="moi">Mon planning</button><button type="button" role="tab" aria-selected="${vueEquipe}" class="${vueEquipe?'active':''}" data-pi-vue="equipe">Planning de l’équipe</button></div>`;
    html+=(moiPresent&&!vueEquipe&&data.services.length===1)?monPlanning(pl,data.monId):grille(pl,false,data.monId)+legende();
   }
  }
  host.innerHTML=html;lier(host);
 }
 function historiqueHtml(){
  if(!historique.length)return '<p class="pi-sub">Aucune version enregistrée.</p>';
  const lib={creation:'Création',modification:'Modification',validation:'Validation'};
  return `<ol class="pi-versions">${historique.map(v=>`<li><b>Version ${v.version} · ${esc(lib[v.action]||v.action)}</b> par ${esc(v.par)} le ${esc(fmtDate(v.at))}${v.alertes?` · ${v.alertes} alerte(s)`:''}${v.motif?` · motif : ${esc(v.motif)}`:''}<br><small>Empreinte ${esc(v.hash.slice(0,12))}…</small>${v.changements.length?`<details><summary>${v.changements.length} changement(s)</summary><ul>${v.changements.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></details>`:''}</li>`).join('')}</ol>`;
 }
 function appliquer(pid,jour){
  const ligne=travail.affectations[pid]||(travail.affectations[pid]={});
  if(outil==='detail')return detailCase(pid,jour);
  if(outil==='gomme')delete ligne[jour];else ligne[jour]={code:outil};
  modifie=true;draw();const c=document.querySelector(`[data-pi-cell="${CSS.escape(pid+'|'+jour)}"]`);c?.focus();
 }
 function detailCase(pid,jour){
  const a=travail.affectations[pid]?.[jour],p=travail.personnes.find(x=>x.id===pid);
  let dlg=document.getElementById('pi-dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='pi-dialog';document.body.append(dlg)}
  const h=a&&R.horaires(a);
  dlg.innerHTML=`<form method="dialog" class="pi-form"><h3>${esc(p?.nom||'')} · ${esc(new Date(jour+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}))}</h3>
   <label>Code<select name="code"><option value="">— Non planifié —</option>${R.ORDRE.map(k=>`<option value="${k}" ${a?.code===k?'selected':''}>${k} · ${esc(R.CODES[k].label)}</option>`).join('')}</select></label>
   <div class="pi-2"><label>Début<input type="time" name="debut" value="${esc(h?.debut||'')}"></label><label>Fin<input type="time" name="fin" value="${esc(h?.fin||'')}"></label></div>
   <label>Remarque (salle, service, échange…)<input name="note" maxlength="120" value="${esc(a?.note||'')}"></label>
   <div class="pi-actions"><button value="annuler" class="secondary">Annuler</button><button value="ok" class="primary">Appliquer</button></div></form>`;
  const f=dlg.querySelector('form');f.code.onchange=()=>{const c=R.CODES[f.code.value];if(c?.debut){f.debut.value=c.debut;f.fin.value=c.fin}else{f.debut.value='';f.fin.value=''}};
  dlg.onclose=()=>{if(dlg.returnValue!=='ok')return;const ligne=travail.affectations[pid]||(travail.affectations[pid]={});
   if(!f.code.value)delete ligne[jour];else{const e={code:f.code.value};if(f.debut.value)e.debut=f.debut.value;if(f.fin.value)e.fin=f.fin.value;if(f.note.value.trim())e.note=f.note.value.trim();ligne[jour]=R.normaliser({personnes:[{id:'x',nom:'x'}],affectations:{x:{[jour]:e}}},mois).affectations.x?.[jour]||e}
   modifie=true;draw()};
  dlg.showModal();
 }
 function lier(host){
  host.querySelectorAll('[data-pi-service]').forEach(b=>b.onclick=()=>{if(modifie&&!quitter())return;service=b.dataset.piService;data=null;draw();charger()});
  host.querySelectorAll('[data-pi-mois]').forEach(b=>b.onclick=()=>{if(modifie&&!quitter())return;const d=Number(b.dataset.piMois);mois=d?R.moisVoisin(mois,d):moisActuel();data=null;draw();charger()});
  host.querySelectorAll('[data-pi-vue]').forEach(b=>b.onclick=()=>{vueEquipe=b.dataset.piVue==='equipe';draw()});
  host.querySelector('[data-pi-imprimer]')?.addEventListener('click',()=>{vueEquipe=true;draw();setTimeout(()=>window.print(),50)});
  if(!cadre())return;
  host.querySelectorAll('[data-pi-outil]').forEach(b=>b.onclick=()=>{outil=b.dataset.piOutil;draw()});
  host.querySelectorAll('[data-pi-cell]').forEach(c=>{const [pid,jour]=c.dataset.piCell.split('|');c.onclick=()=>appliquer(pid,jour);c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();appliquer(pid,jour)}}});
  host.querySelectorAll('[data-pi-retirer]').forEach(b=>b.onclick=()=>{const id=b.dataset.piRetirer,p=travail.personnes.find(x=>x.id===id);travail.personnes=travail.personnes.filter(x=>x.id!==id);delete travail.affectations[id];modifie=true;draw();toast?.((p?.nom||'Personne')+' retiré(e) du planning (non enregistré)')});
  host.querySelector('[data-pi-ajouter]')?.addEventListener('click',()=>{
   const sel=$('#pi-compte').value,libre=$('#pi-libre').value.trim(),fonction=$('#pi-fonction').value.trim();
   const compte=(data.comptes||[]).find(c=>c.userId===sel);if(!compte&&libre.length<3){toast?.('Choisissez un compte ou saisissez un nom.');return}
   const id='p-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
   travail.personnes.push({id,nom:compte?compte.nom:libre,fonction:fonction||(compte?(compte.poste.startsWith('cadre')?'Cadre':'IDE'):'Renfort'),userId:compte?.userId||null});modifie=true;draw()});
  host.querySelector('[data-pi-reprendre]')?.addEventListener('click',async()=>{try{const j=await api('?'+new URLSearchParams({service,mois:R.moisVoisin(mois,-1)}));if(!j.planning?.personnes?.length){toast?.('Pas de planning le mois précédent.');return}travail.personnes=j.planning.personnes.map(p=>({...p}));modifie=true;draw()}catch(e){toast?.(e.message)}});
  host.querySelector('[data-pi-enregistrer]')?.addEventListener('click',()=>envoyer('enregistrer'));
  host.querySelector('[data-pi-valider]')?.addEventListener('click',()=>envoyer('valider'));
  const det=host.querySelector('.pi-hist');det?.addEventListener('toggle',async()=>{if(!det.open||historique)return;try{historique=(await api('?'+new URLSearchParams({service,mois,historique:'1'}))).versions;$('#pi-hist').innerHTML=historiqueHtml()}catch(e){$('#pi-hist').innerHTML=`<p class="notice warn">${esc(e.message)}</p>`}});
 }
 function quitter(){toast?.('Enregistrez ou annulez d’abord les modifications du planning.');const b=document.querySelector('[data-pi-enregistrer]');b?.focus();return false}
 async function envoyer(action){
  const motif=$('#pi-motif')?.value||'';envoi=true;draw();
  try{const j=await api('',{method:'POST',body:JSON.stringify({action,service,mois,version:data.planning?.version||0,motif,...(action==='enregistrer'?{planning:travail}:{})})});
   toast?.(action==='valider'?'Planning validé : visible par les infirmier(ère)s':'Planning enregistré (version '+j.version+')'+(j.alertes?' · '+j.alertes+' alerte(s)':''));envoi=false;await charger()}
  catch(e){envoi=false;draw();toast?.(e.message);const m=document.querySelector('.pi-actions');if(m){const p=document.createElement('p');p.className='notice warn';p.role='alert';p.textContent=e.message;m.after(p)}}
 }
 function render(){
  if(!mois)mois=moisActuel();
  $('#title').textContent='Plannings infirmiers';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='planningsInfirmiers'));
  $('#workspace').innerHTML='<section class="panel pi-panel"><div class="content"><div id="pi-body"></div></div></section>';
  draw();charger();
 }
 window.addEventListener('beforeunload',e=>{if(modifie&&cadre()){e.preventDefault();e.returnValue=''}});
 return {render,modifie:()=>modifie};
};
})(window);

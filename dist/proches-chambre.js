/* IASELO · information des proches et écran en chambre, côté soignants (4e veille, lot C).
   Fenêtre « Proches et écran en chambre » (depuis la Surveillance des lits et les Sorties du jour) :
   accord du patient, proches à prévenir, envois et envoi manuel ; activation de l'écran de la chambre.
   Demandes des patients (tablette) affichées en tête de la Surveillance des lits. Règles : proches-chambre-regles.js. */
(function(root){
'use strict';
root.createProchesChambre=function(ctx){
 const {esc,toast}=ctx,P=()=>root.IaseloProches;
 const style=document.createElement('style');
 style.textContent=`.pc-dlg{max-width:680px;width:calc(100% - 32px)}.pc-dlg section{border-top:1px solid var(--border,#e3e9ec);padding-top:10px;margin-top:12px}.pc-dlg h3{font-size:1rem;margin:0 0 6px}
.pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}.pc-grid label,.pc-col label{display:grid;gap:4px;font-size:14px}.pc-col{display:grid;gap:6px}.pc-coche{display:flex!important;gap:8px;align-items:flex-start}
.pc-ex{background:#f2f5f6;border-radius:10px;padding:8px 10px;font-size:14px;color:#2c3a40}.pc-lien{word-break:break-all;font-size:13px}
.sc-dem{border:1px solid var(--border,#dfe5ea);border-radius:14px;padding:12px 14px;margin:0 0 14px;background:var(--i-s1,#fff)}.sc-dem h2{font-size:1rem;margin:0 0 6px}
@media (max-width:560px){.pc-grid{grid-template-columns:1fr}}`;
 document.head.append(style);
 const api=async(route,data)=>{const r=await fetch('/api/workspace/'+route,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Error(j.error||j.raison||'Erreur.');return j};
 const fdt=iso=>{const x=new Date(iso);return isNaN(x)?'':x.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
 const nom=s=>[String(s?.identity?.lastName||'').toUpperCase(),s?.identity?.firstName].filter(Boolean).join(' ')||s?.id;
 function tracer(stay,texte){const s=ctx.patients.find(x=>x.id===stay);if(!s)return;(s.events??=[]).unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text:texte,kind:'Proches'});document.dispatchEvent(new Event('change',{bubbles:true}))}
 let dlg=null,etat=null,edition=false,lienAffiche='';
 async function ouvrir(stay){
  if(!dlg){dlg=document.createElement('dialog');dlg.className='pc-dlg';dlg.setAttribute('aria-labelledby','pc-titre');document.body.append(dlg)}
  edition=false;lienAffiche='';etat={stay};dlg.innerHTML='<p>Chargement…</p>';if(!dlg.open)dlg.showModal();await charger();
 }
 async function charger(){
  try{const [p,c]=await Promise.all([api('proches?stay='+encodeURIComponent(etat.stay)),api('chambre?stay='+encodeURIComponent(etat.stay)).catch(()=>({lien:null,interdit:true}))]);etat={...etat,p,c};dessiner()}
  catch(x){dlg.innerHTML=`<div class="dialoghead"><h2 id="pc-titre">Proches et écran en chambre</h2><button type="button" class="icon" data-fermer aria-label="Fermer">×</button></div><p>${esc(x.message)}</p>`;dlg.querySelector('[data-fermer]').onclick=()=>dlg.close()}
 }
 function formulaire(i){
  const pr=i?.proches||[],et=i?.etapes||P().ETAPES.filter(e=>e.auto).map(e=>e.id),mode=i?.mode||'prenom';
  return `<form id="pc-form" class="pc-col">
   <label class="pc-coche"><input type="checkbox" name="accord" ${i&&!i.retireAt?'checked':''}> <span>Le patient accepte que ses proches soient prévenus par SMS des étapes de son séjour. Les SMS ne contiennent aucune information médicale : ni intervention, ni diagnostic, ni état de santé.</span></label>
   <fieldset class="pc-col" style="border:0;padding:0;margin:0"><legend>Nommer le patient dans le SMS</legend>
    <label class="pc-coche"><input type="radio" name="appellation" value="prenom" ${mode==='prenom'?'checked':''}> Par son prénom</label>
    <label class="pc-coche"><input type="radio" name="appellation" value="neutre" ${mode==='neutre'?'checked':''}> « votre proche » (plus discret)</label>
    <label class="pc-coche"><input type="radio" name="appellation" value="autre" ${mode==='autre'?'checked':''}> Autre : <input name="appellationTexte" maxlength="30" aria-label="Autre appellation" value="${mode==='autre'?esc(i.appellation):''}"></label></fieldset>
   <div class="pc-grid">${[0,1].map(k=>`<label>Proche ${k+1} : prénom${k?' (facultatif)':''}<input name="prenom${k}" maxlength="40" value="${esc(pr[k]?.prenom||'')}"></label><label>Portable<input name="tel${k}" inputmode="tel" value="${esc(pr[k]?.telephone||'')}" placeholder="06 12 34 56 78"></label>`).join('')}</div>
   <fieldset class="pc-col" style="border:0;padding:0;margin:0"><legend>Étapes envoyées automatiquement</legend>${P().ETAPES.filter(e=>e.auto).map(e=>`<label class="pc-coche"><input type="checkbox" name="etape" value="${e.id}" ${et.includes(e.id)?'checked':''}> ${esc(e.libelle)}</label>`).join('')}</fieldset>
   <p class="pc-ex">Exemple : ${esc(etat.p.exemple)}</p>
   <p class="sc-actions"><button class="primary">Enregistrer l’accord</button>${i&&!i.retireAt?'<button type="button" class="secondary" data-annuler>Annuler</button>':''}</p></form>`;
 }
 function dessiner(){
  const {p,c}=etat,i=p.info,s=ctx.patients.find(x=>x.id===etat.stay),actif=i&&!i.retireAt,ecrire=ctx.peutEcrire();
  dlg.innerHTML=`<div class="dialoghead"><h2 id="pc-titre">Proches et écran en chambre · ${esc(nom(s))}</h2><button type="button" class="icon" data-fermer aria-label="Fermer">×</button></div>
  <section aria-labelledby="pc-h1" style="border:0;margin:0"><h3 id="pc-h1">Informer les proches par SMS</h3>${p.sms?'':'<p class="sc-mut">Envoi de SMS non configuré sur ce serveur : rien ne part (simulation).</p>'}
   ${actif&&!edition?`<p>Accord recueilli par ${esc(i.accordPar)} le ${esc(fdt(i.accordAt))}. Patient nommé « ${esc(i.appellation)} ».</p>
    <ul>${i.proches.map(x=>`<li>${esc(x.prenom)} · ${esc(x.telephone)}</li>`).join('')}</ul><p class="sc-mut">Étapes automatiques : ${esc(i.etapes.map(id=>P().ETAPES.find(e=>e.id===id)?.libelle).join(', ')||'aucune')}.</p>
    ${ecrire?`<p class="sc-actions"><button type="button" class="secondary ps-small" data-modifier>Modifier</button><button type="button" class="secondary ps-small" data-retirer>Le patient retire son accord</button></p>
    <p class="sc-actions">${P().ETAPES.map(e=>`<button type="button" class="secondary ps-small" data-informer="${e.id}">Envoyer : ${esc(e.libelle.replace(' (envoi manuel)','').replace(' (heure)',''))}</button>`).join('')}</p>`:''}`
   :ecrire?formulaire(i):'<p class="sc-mut">Aucun accord enregistré.</p>'}
   ${p.envois.length?`<h3>Envois</h3><ul>${p.envois.map(e=>`<li>${esc(fdt(e.at))} · ${esc(P().ETAPES.find(x=>x.id===e.etape)?.libelle||e.etape)} · ${e.statut==='envoye'?'':'<b>'+esc(e.statut)+'</b> · '}${esc(e.detail)}</li>`).join('')}</ul>`:''}</section>
  ${c.interdit?'':`<section aria-labelledby="pc-h2"><h3 id="pc-h2">Écran en chambre</h3><p class="sc-mut">Tablette de la chambre : le patient voit sa sortie et ses consignes, et envoie des demandes non urgentes (aide, douleur, soif). Sa date de naissance est demandée.</p>
   ${lienAffiche?`<p class="pc-lien">Lien de la tablette (à ouvrir une seule fois sur la tablette, il n’est plus affiché ensuite) : <a href="${esc(lienAffiche)}" target="_blank" rel="noopener noreferrer">${esc(lienAffiche)}</a></p><p class="sc-actions"><button type="button" class="secondary ps-small" data-copier>Copier le lien</button></p>`:''}
   <p>${c.lien?`Actif depuis le ${esc(fdt(c.lien.creeLe))} (${esc(c.lien.creePar)}), jusqu’au ${esc(fdt(c.lien.expire))} au plus tard ou la sortie.`:'Non activé.'}</p>
   <p class="sc-actions"><button type="button" class="${c.lien?'secondary':'primary'} ps-small" data-lien>${c.lien?'Créer un nouveau lien (l’ancien est désactivé)':'Activer l’écran en chambre'}</button>${c.lien?'<button type="button" class="secondary ps-small" data-revoquer>Désactiver</button>':''}</p></section>`}`;
  const q=x=>dlg.querySelector(x);
  q('[data-fermer]').onclick=()=>dlg.close();
  const f=q('#pc-form');if(f)f.onsubmit=async e=>{e.preventDefault();
   const d={action:'enregistrer',stay:etat.stay,accord:f.accord.checked,appellation:f.querySelector('[name=appellation]:checked')?.value,appellationTexte:f.appellationTexte.value,
    proches:[0,1].map(k=>({prenom:f['prenom'+k].value,telephone:f['tel'+k].value})).filter(x=>x.prenom.trim()||x.telephone.trim()),etapes:[...f.querySelectorAll('[name=etape]:checked')].map(x=>x.value)};
   try{await api('proches',d);tracer(etat.stay,'Accord du patient : proches prévenus par SMS des étapes du séjour (sans information médicale)');toast('Accord enregistré.');edition=false;await charger()}catch(x){toast(x.message)}};
  q('[data-annuler]')?.addEventListener('click',()=>{edition=false;dessiner()});
  q('[data-modifier]')?.addEventListener('click',()=>{edition=true;dessiner()});
  q('[data-retirer]')?.addEventListener('click',async()=>{try{await api('proches',{action:'retirer',stay:etat.stay});tracer(etat.stay,'Le patient retire son accord : plus aucun SMS aux proches');toast('Accord retiré.');await charger()}catch(x){toast(x.message)}});
  dlg.querySelectorAll('[data-informer]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('proches',{action:'informer',stay:etat.stay,etape:b.dataset.informer});toast(r.detail||'Envoyé.')}catch(x){toast(x.message)}await charger()});
  q('[data-lien]')?.addEventListener('click',async()=>{try{const r=await api('chambre',{action:'lien',stay:etat.stay});lienAffiche=r.lien;tracer(etat.stay,'Écran en chambre activé');await charger()}catch(x){toast(x.message)}});
  q('[data-revoquer]')?.addEventListener('click',async()=>{try{await api('chambre',{action:'revoquer',stay:etat.stay});lienAffiche='';tracer(etat.stay,'Écran en chambre désactivé');await charger()}catch(x){toast(x.message)}});
  q('[data-copier]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(lienAffiche);toast('Lien copié.')}catch{toast('Copie impossible : sélectionnez le lien.')}});
 }
 /* ---------- Demandes des patients (tablettes) ---------- */
 const NIV={crit:['Urgent','sc-crit'],warn:['À voir','sc-warn'],info:['Demande','sc-info']};
 async function demandes(el){
  if(!el)return;let d;try{d=await api('chambre')}catch{el.hidden=true;return}
  const ouvertes=d.demandes.filter(x=>!x.traiteAt).sort((a,b)=>({crit:0,warn:1,info:2}[a.priorite]-{crit:0,warn:1,info:2}[b.priorite])||a.recuAt.localeCompare(b.recuAt));
  if(!ouvertes.length){el.hidden=true;el.innerHTML='';return}
  el.hidden=false;el.className='sc-dem';
  el.innerHTML=`<h2>Demandes des patients (écran en chambre) · ${ouvertes.length}</h2>${ouvertes.map(x=>{const s=ctx.patients.find(p=>p.id===x.stay);return `<div class="sc-al"><span class="sc-badge ${NIV[x.priorite][1]}">${NIV[x.priorite][0]}</span><div><strong>${esc(nom(s)||x.stay)}${s?.sortiePlus?.chambre?' · chambre '+esc(s.sortiePlus.chambre):''} : ${esc(x.libelle)}${x.valeur!=null?' '+x.valeur+'/10':''}</strong><p>${esc(x.texte||'')}${x.texte?' · ':''}reçue à ${esc(fdt(x.recuAt).slice(-5))}</p></div><button type="button" class="secondary ps-small" data-traiter="${esc(x.id)}">Traité</button></div>`}).join('')}`;
  el.querySelectorAll('[data-traiter]').forEach(b=>b.onclick=async()=>{try{await api('chambre',{action:'traiter',id:b.dataset.traiter});toast('Demande traitée.');demandes(el)}catch(x){toast(x.message)}});
 }
 root.IaseloProchesUI={ouvrir,demandes};
 return root.IaseloProchesUI;
};
})(typeof self!=='undefined'?self:this);

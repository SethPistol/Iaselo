/* IASELO · protocoles de prescription partagés (26/11/2026, demande de Romain).
   1. Gestion de la clinique › « Protocoles de prescription » (administrateur) : créer, mettre à jour (motif exigé),
      retirer ou remettre en service un protocole ; historique des versions avec les différences et les reprises.
   2. Dans le dossier, bouton « Reprendre un protocole » (médecins prescripteurs) : prescriptions préopératoires,
      prescriptions postopératoires et ordonnance de sortie. Le protocole complète le brouillon ; le médecin ajuste
      puis signe ou valide comme d'habitude. Chaque reprise est tracée (protocole, version, séjour).
   Règles : protocoles-prescription-regles.js · serveur : worker/protocoles.mjs. */
(function(root){
'use strict';
const P=()=>root.IaseloProtocoles,PP=()=>root.IaseloPrescriptionsPreop;
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const ICON={
 doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};
const ACTIONS={creation:'Création','modification':'Mise à jour',retrait:'Retrait','remise-en-service':'Remise en service'};
const CIBLES={prescriptionsPreop:'Prescriptions préopératoires',rx:'Prescriptions postopératoires',discharge:'Ordonnance de sortie'};
async function api(q,body){
 const r=await fetch('/api/workspace/protocoles'+(q?'?'+q:''),{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});
 const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok){const e=Error(j.error||'Service indisponible.');e.status=r.status;e.data=j;throw e}return j;
}
let cache=null;// {at, protocoles}
async function liste(force){if(!force&&cache&&Date.now()-cache.at<60000)return cache.protocoles;const j=await api();cache={at:Date.now(),protocoles:j.protocoles,peutGerer:j.peutGerer};return j.protocoles}
const resumeHTML=(p,max=99)=>{const l=P().resume(p.type,p.contenu);return l.length?`<ul class="pr-resume">${l.slice(0,max).map(x=>`<li>${ESC(x)}</li>`).join('')}${l.length>max?`<li class="pr-mut">+ ${l.length-max} autre(s)</li>`:''}</ul>`:'<p class="pr-mut">Vide.</p>'};

/* ---------- Fenêtre (élément <dialog>, sans alerte du navigateur) ---------- */
function fenetre(titre,contenu,{large=false}={}){
 const d=document.createElement('dialog');d.className='pr-dialog'+(large?' is-large':'');
 d.innerHTML=`<div class="dialoghead"><h2>${ESC(titre)}</h2><button type="button" class="icon" data-close aria-label="Fermer">×</button></div><div class="pr-dialog-body">${contenu}</div>`;
 document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d;
}

/* ---------- 2. Reprise par le médecin ---------- */
// type : preop | postop | sortie ; renvoie le protocole choisi (reprise tracée côté serveur) ou null.
function choisir({type,stay,specialite=''}){
 return new Promise(resolve=>{
  let fini=false;const fin=v=>{if(fini)return;fini=true;resolve(v)};
  const d=fenetre('Reprendre un protocole · '+P().TYPES[type],'<p class="pr-mut">Chargement des protocoles…</p>',{large:true});
  d.addEventListener('close',()=>fin(null));
  const body=d.querySelector('.pr-dialog-body');
  liste(true).then(all=>{
   const l=P().proposes(all,type,specialite);
   body.innerHTML=l.length?`<p class="pr-mut">Protocoles validés par l’établissement. Le contenu complète votre brouillon sans effacer ce que vous avez saisi : relisez et ajustez avant de signer.</p>
    <div class="pr-pick">${l.map(p=>`<article class="pr-pick-item"><header><div><h4>${ESC(p.nom)}</h4><p class="pr-mut">${ESC(p.specialite)} · version ${p.version} du ${ESC(frDT(p.miseAJour))}</p></div><button type="button" class="primary" data-pick="${ESC(p.id)}">Reprendre</button></header>${p.description?`<p>${ESC(p.description)}</p>`:''}${resumeHTML(p,8)}</article>`).join('')}</div>`
    :`<p class="pr-empty">Aucun protocole « ${ESC(P().TYPES[type])} » n’est en service. L’administrateur les crée dans Gestion de la clinique › Protocoles de prescription.</p>`;
   body.querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{
    const p=l.find(x=>x.id===b.dataset.pick);b.disabled=true;b.textContent='Reprise…';
    try{const r=await api('',{action:'reprendre',id:p.id,version:p.version,stay:stay.id});fin(r.protocole);d.close()}
    catch(e){b.disabled=false;b.textContent='Reprendre';body.insertAdjacentHTML('afterbegin',`<p class="notice warn">${ESC(e.message)}</p>`);if(e.status===409)cache=null}
   });
  }).catch(e=>{body.innerHTML=`<p class="notice warn">${ESC(e.status===403?e.message:'Protocoles disponibles sur le serveur de la clinique (dossier partagé connecté). '+e.message)}</p>`});
 });
}
const reference=p=>({id:p.id,version:p.version,nom:p.nom,hash:p.hash});

/* ---------- 1. Gestion par l'administrateur ---------- */
root.createProtocolesPrescription=function(ctx){
 const {$,esc,toast}=ctx;
 let etat={protocoles:null,erreur:'',filtre:'tous',edition:null};
 const admin=()=>document.body.dataset.admin==='true';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="protocoles"]'))return;
  const ancre=document.querySelector('aside .nav[data-view="billing"]')||[...document.querySelectorAll('aside .navtitle')].find(t=>/GESTION/i.test(t.textContent));if(!ancre)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='protocoles';b.innerHTML=ICON.doc+'Protocoles de prescription';b.onclick=()=>ctx.go('protocoles');
  (document.querySelector('aside .nav[data-view="droits"]')||ancre).after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 setTimeout(bouton,1500);

 async function charger(){etat.erreur='';try{const j=await api();cache={at:Date.now(),protocoles:j.protocoles};etat.protocoles=j.protocoles;etat.peutGerer=j.peutGerer}catch(e){etat.protocoles=[];etat.erreur=e.message}dessiner()}
 function render(){
  $('#title').textContent='Protocoles de prescription';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='protocoles'));
  $('#workspace').innerHTML='<section class="panel"><div class="content pr-wrap" id="pr-host"><p class="pr-mut">Chargement des protocoles…</p></div></section>';
  etat.edition=null;charger();
 }
 function dessiner(){
  const host=$('#pr-host');if(!host)return;
  if(etat.edition){host.innerHTML=editeurHTML(etat.edition);lierEditeur(etat.edition);return}
  const gerer=etat.peutGerer,l=(etat.protocoles||[]).filter(p=>etat.filtre==='tous'||p.type===etat.filtre);
  const groupes=Object.entries(P().TYPES).map(([t,lib])=>{const g=l.filter(p=>p.type===t);return g.length?`<h3 class="pr-h3">${esc(lib)} <span class="pr-count">${g.length}</span></h3><div class="pr-list">${g.map(p=>`<article class="pr-item ${p.statut==='actif'?'':'is-off'}">
    <header><div><h4>${esc(p.nom)}</h4><p class="pr-mut">${esc(p.specialite)} · version ${p.version} · mise à jour le ${esc(frDT(p.miseAJour))} par ${esc(p.par)}</p></div><span class="pr-chip ${p.statut==='actif'?'ok':''}">${esc(P().STATUTS[p.statut]||p.statut)}</span></header>
    ${p.description?`<p>${esc(p.description)}</p>`:''}${resumeHTML(p,6)}
    <div class="pr-actions">${gerer&&p.statut==='actif'?`<button type="button" class="secondary" data-edit="${esc(p.id)}">Mettre à jour</button>`:''}<button type="button" class="secondary" data-hist="${esc(p.id)}">Historique des versions</button>${gerer?`<button type="button" class="textbutton" data-statut="${esc(p.id)}">${p.statut==='actif'?'Retirer du service':'Remettre en service'}</button>`:''}</div>
   </article>`).join('')}</div>`:''}).join('');
  host.innerHTML=`<div class="pr-head"><p>Protocoles validés par l’établissement. ${gerer?'Vous les créez et les mettez à jour ; chaque version est conservée avec son auteur, sa date et le motif.':'Ils sont créés et mis à jour par l’administrateur.'} Les médecins les reprennent depuis les prescriptions du dossier (bouton « Reprendre un protocole »), puis ajustent avant de signer.</p>
   ${gerer?`<button type="button" class="primary" id="pr-new">${ICON.plus}Nouveau protocole</button>`:''}</div>
   ${etat.erreur?`<p class="notice warn">${esc(etat.erreur)}</p>`:''}
   <div class="pr-filtres" role="group" aria-label="Type de protocole">${[['tous','Tous'],...Object.entries(P().TYPES)].map(([k,v])=>`<button type="button" class="pr-filtre ${etat.filtre===k?'is-on':''}" data-filtre="${k}">${esc(v)}</button>`).join('')}</div>
   ${groupes||`<p class="pr-empty">Aucun protocole${etat.filtre!=='tous'?' de ce type':''}.${gerer?' Créez le premier avec « Nouveau protocole ».':''}</p>`}`;
  host.querySelectorAll('[data-filtre]').forEach(b=>b.onclick=()=>{etat.filtre=b.dataset.filtre;dessiner()});
  const nw=$('#pr-new');if(nw)nw.onclick=()=>{etat.edition={type:etat.filtre!=='tous'?etat.filtre:'preop',nom:'',specialite:'Toutes spécialités',description:'',contenu:P().vide(etat.filtre!=='tous'?etat.filtre:'preop')};dessiner()};
  host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const p=etat.protocoles.find(x=>x.id===b.dataset.edit);etat.edition=JSON.parse(JSON.stringify(p));dessiner()});
  host.querySelectorAll('[data-hist]').forEach(b=>b.onclick=()=>historique(b.dataset.hist));
  host.querySelectorAll('[data-statut]').forEach(b=>b.onclick=()=>changerStatut(etat.protocoles.find(x=>x.id===b.dataset.statut)));
 }
 async function historique(id){
  const d=fenetre('Historique des versions','<p class="pr-mut">Chargement…</p>',{large:true}),body=d.querySelector('.pr-dialog-body');
  try{const j=await api('id='+encodeURIComponent(id)+'&historique=1');
   body.innerHTML=`<h3 class="pr-h3">${esc(j.protocole.nom)}</h3><ol class="pr-versions">${j.versions.map((v,i)=>{const prec=j.versions[i+1],diff=prec?P().differences(prec,v):[];
    return `<li><header><b>Version ${v.version}</b> · ${esc(ACTIONS[v.action]||v.action)} · ${esc(frDT(v.at))} · ${esc(v.par)}</header>${v.motif?`<p><span class="pr-mut">Motif :</span> ${esc(v.motif)}</p>`:''}${prec?(diff.length?`<ul class="pr-diff">${diff.map(x=>`<li class="${x.startsWith('+')?'is-add':x.startsWith('−')?'is-del':''}">${esc(x)}</li>`).join('')}</ul>`:'<p class="pr-mut">Contenu inchangé.</p>'):resumeHTML(v)}<p class="pr-hash">Empreinte SHA-256 ${esc(v.hash.slice(0,16))}…</p></li>`}).join('')}</ol>
    ${j.reprises.length?`<h3 class="pr-h3">Reprises par les médecins</h3><table class="pr-table"><thead><tr><th>Version</th><th>Partie du dossier</th><th>Reprises</th><th>Dernière</th></tr></thead><tbody>${j.reprises.map(r=>`<tr><td>${r.version}</td><td>${esc(CIBLES[r.cible]||r.cible)}</td><td>${r.n}</td><td>${esc(frDT(r.dernier))}</td></tr>`).join('')}</tbody></table><p class="pr-mut">Le détail (séjour, médecin) est dans le journal des accès et dans l’historique de chaque dossier.</p>`:''}`;
  }catch(e){body.innerHTML=`<p class="notice warn">${esc(e.message)}</p>`}
 }
 function changerStatut(p){
  const retirer=p.statut==='actif';
  const d=fenetre(retirer?'Retirer le protocole du service':'Remettre le protocole en service',`<p>${retirer?'Les médecins ne pourront plus le reprendre. Les prescriptions déjà rédigées à partir de ce protocole ne changent pas.':'Les médecins pourront de nouveau le reprendre.'}</p><label class="pr-field">Motif (conservé dans l’historique)<input id="pr-motif" maxlength="300" placeholder="${retirer?'Ex. remplacé par le protocole PTH 2027':'Ex. protocole revu en CME'}"></label><p class="warn" role="alert" id="pr-motif-err"></p><div class="pr-actions"><button type="button" class="primary" id="pr-ok">${retirer?'Retirer':'Remettre en service'}</button></div>`);
  d.querySelector('#pr-ok').onclick=async()=>{const motif=d.querySelector('#pr-motif').value.trim();if(motif.length<5){d.querySelector('#pr-motif-err').textContent='Indiquez le motif (5 caractères au moins).';return}
   try{await api('',{action:retirer?'retirer':'remettre',id:p.id,version:p.version,motif});d.close();toast(retirer?'Protocole retiré du service':'Protocole remis en service');charger()}catch(e){d.querySelector('#pr-motif-err').textContent=e.message}};
 }

 /* ---------- Éditeur ---------- */
 const champ=(label,name,value,type='text',extra='')=>`<label class="pr-field">${label}<input type="${type}" name="${name}" value="${esc(value??'')}" ${extra}></label>`;
 const zone=(label,name,value,rows=2,ph='')=>`<label class="pr-field">${label}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value||'')}</textarea></label>`;
 const coche=(name,on,label)=>`<label class="pr-tick"><input type="checkbox" name="${name}" ${on?'checked':''}><span>${label}</span></label>`;
 const x=`<button type="button" class="pr-x" data-remove aria-label="Retirer cette ligne">×</button>`;
 const lignePreop=r=>`<div class="pr-row pr-row-3" data-row="premed">${champ('Médicament','premed.drug',r.drug,'text','list="pr-drugs"')}${champ('Posologie','premed.dose',r.dose)}${champ('Moment de prise','premed.moment',r.moment,'text','list="pr-moments"')}${x}</div>`;
 const lignePostop=l=>`<div class="pr-row pr-row-postop" data-row="postop">${champ('Libellé','postop.name',l.name)}<label class="pr-field">Catégorie<select name="postop.category">${P().CATEGORIES_POSTOP.map(c=>`<option ${c===l.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label>${zone('Consignes','postop.instructions',l.instructions,2)}${x}</div>`;
 const SORTIE_LIB={drug:'Médicament ou DCI · dosage et forme',dose:'Dose par prise',route:'Voie',frequency:'Fréquence / horaires',duration:'Durée ou quantité',notes:'Consignes (facultatif)'};
 const ligneSortie=l=>`<div class="pr-row pr-row-sortie" data-row="sortie">${P().SORTIE_CHAMPS.map(k=>champ(SORTIE_LIB[k],'sortie.'+k,l[k],'text',k==='drug'?'list="pr-drugs"':'')).join('')}${x}</div>`;
 function contenuHTML(type,c){
  c=P().normaliserContenu(type,c);
  if(type==='preop'){const R=PP();
   return `<section class="pr-sec"><h4>Examens biologiques</h4><div class="pr-bilans">${R.BILANS.map(b=>`<label class="pr-tick"><input type="checkbox" name="bilan" value="${b.id}" ${c.bilans.ids.includes(b.id)?'checked':''}><span>${esc(b.label)}</span></label>`).join('')}</div>
     <div class="pr-grid2">${champ('À réaliser au plus tard (jours avant l’intervention)','bilans.delaiJours',c.bilans.delaiJours??'','number','min="0" max="90" placeholder="Ex. 3"')}${zone('Précisions pour le laboratoire','bilans.notes',c.bilans.notes,1)}</div>${zone('Autres examens (ECG, imagerie, avis…)','bilans.autres',c.bilans.autres,2)}</section>
    <section class="pr-sec"><h4>Prémédication et médicaments</h4><div data-rows="premed">${c.premed.map(lignePreop).join('')}</div><button type="button" class="secondary" data-add="premed">Ajouter un médicament</button><p class="pr-mut">Au moment de la reprise, chaque médicament est contrôlé avec les allergies du patient.</p></section>
    <section class="pr-sec"><h4>Traitements habituels</h4>${zone('Consigne générale (les consignes propres à chaque traitement restent calculées depuis le dossier)','traitements.libre',c.traitements.libre,2)}</section>
    <section class="pr-sec"><h4>Douche préopératoire</h4>${coche('douche.inclure',c.douche.inclure,'Le protocole fixe la douche')}<div class="pr-sub">${coche('douche.actif',c.douche.actif,'Douche prescrite')}
     <div class="pr-opts"><label><input type="radio" name="douche.nombre" value="2" ${c.douche.nombre===2?'checked':''}> Veille au soir et matin</label><label><input type="radio" name="douche.nombre" value="1" ${c.douche.nombre===1?'checked':''}> Matin seulement</label></div>
     <div class="pr-opts"><label><input type="radio" name="douche.produit" value="doux" ${c.douche.produit==='doux'?'checked':''}> Savon doux</label><label><input type="radio" name="douche.produit" value="antiseptique" ${c.douche.produit==='antiseptique'?'checked':''}> Savon antiseptique</label></div>
     <div class="pr-opts">${coche('douche.cheveux',c.douche.cheveux,'Cheveux compris')}${coche('douche.rasage',c.douche.rasage,'Ne pas raser')}${coche('douche.retirer',c.douche.retirer,'Retirer vernis, bijoux, maquillage')}</div>${zone('Précisions','douche.libre',c.douche.libre,1)}</div></section>
    <section class="pr-sec"><h4>Jeûne</h4>${coche('jeune.inclure',c.jeune.inclure,'Le protocole fixe le jeûne')}<div class="pr-sub">${coche('jeune.actif',c.jeune.actif,'Consignes de jeûne prescrites')}
     <div class="pr-grid2">${champ('Solides (heures)','jeune.solides',c.jeune.solides,'number','min="2" max="12"')}${champ('Liquides clairs (heures)','jeune.liquides',c.jeune.liquides,'number','min="1" max="6"')}</div>${coche('jeune.tabac',c.jeune.tabac,'Pas de tabac, vapotage ni chewing-gum le jour J')}${zone('Précisions','jeune.libre',c.jeune.libre,1)}</div></section>
    <section class="pr-sec"><h4>Autres consignes</h4>${zone('Une consigne par ligne','autres',c.autres,4)}</section>`;
  }
  if(type==='postop')return `<section class="pr-sec"><h4>Lignes de prescription</h4><div data-rows="postop">${c.lignes.map(lignePostop).join('')}</div><button type="button" class="secondary" data-add="postop">Ajouter une ligne</button><p class="pr-mut">Reprises dans le brouillon du médecin, qui les ajuste puis les valide une à une.</p></section>`;
  return `<section class="pr-sec"><h4>Médicaments de l’ordonnance</h4><div data-rows="sortie">${c.lignes.map(ligneSortie).join('')}</div><button type="button" class="secondary" data-add="sortie">Ajouter un médicament</button></section>`;
 }
 function editeurHTML(e){
  const nouveau=!e.id,R=PP();
  return `<datalist id="pr-drugs">${(R?.PREMED_SUGGESTIONS||[]).map(v=>`<option value="${esc(v)}">`).join('')}</datalist><datalist id="pr-moments">${(R?.MOMENTS||[]).map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
  <form id="pr-form" class="pr-form" novalidate><div class="pr-head"><div><p class="v-kicker">${nouveau?'Nouveau protocole':'Mise à jour · version '+e.version+' → '+(e.version+1)}</p><h3>${esc(e.nom||'Protocole sans nom')}</h3></div><button type="button" class="secondary" id="pr-cancel">Retour à la liste</button></div>
   <section class="pr-sec"><div class="pr-grid2">
    <label class="pr-field">Type<select name="type" ${nouveau?'':'disabled'}>${Object.entries(P().TYPES).map(([k,v])=>`<option value="${k}" ${k===e.type?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
    ${champ('Nom du protocole','nom',e.nom,'text','maxlength="120" required placeholder="Ex. Prothèse totale de hanche"')}
    <label class="pr-field">Spécialité<select name="specialite">${P().SPECIALITES.map(s=>`<option ${s===e.specialite?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
    ${zone('Description (indication, références)','description',e.description,2,'Ex. Protocole validé en CME le…')}</div></section>
   <div id="pr-contenu">${contenuHTML(e.type,e.contenu)}</div>
   <section class="pr-sec pr-save">${nouveau?'':zone('Motif de la mise à jour (obligatoire, conservé dans l’historique)','motif',e.motif||'',2,'Ex. Recommandation SFAR 2026 sur le jeûne')}
    <div id="pr-errors" role="alert"></div><div class="pr-actions"><button type="submit" class="primary">${nouveau?'Créer le protocole':'Enregistrer la version '+(e.version+1)}</button></div>
    <p class="pr-mut">Un protocole ne contient aucune donnée patient. Les prescriptions déjà rédigées ne sont pas modifiées par une nouvelle version.</p></section></form>`;
 }
 function lire(form,e){
  const f=new FormData(form),all=n=>f.getAll(n).map(String),on=n=>!!form.querySelector(`[name="${n}"]`)?.checked,val=n=>String(f.get(n)??'');
  const type=e.id?e.type:val('type');let contenu;
  if(type==='preop'){const d=all('premed.drug'),ds=all('premed.dose'),m=all('premed.moment');
   contenu={bilans:{ids:all('bilan'),delaiJours:val('bilans.delaiJours'),notes:val('bilans.notes'),autres:val('bilans.autres')},premed:d.map((v,i)=>({drug:v,dose:ds[i],moment:m[i]})),traitements:{libre:val('traitements.libre')},
    douche:{inclure:on('douche.inclure'),actif:on('douche.actif'),nombre:Number(val('douche.nombre')),produit:val('douche.produit'),cheveux:on('douche.cheveux'),rasage:on('douche.rasage'),retirer:on('douche.retirer'),libre:val('douche.libre')},
    jeune:{inclure:on('jeune.inclure'),actif:on('jeune.actif'),solides:val('jeune.solides'),liquides:val('jeune.liquides'),tabac:on('jeune.tabac'),libre:val('jeune.libre')},autres:val('autres')}}
  else if(type==='postop'){const n=all('postop.name'),c=all('postop.category'),i=all('postop.instructions');contenu={lignes:n.map((v,k)=>({name:v,category:c[k],instructions:i[k]}))}}
  else{const cols=Object.fromEntries(P().SORTIE_CHAMPS.map(k=>[k,all('sortie.'+k)]));contenu={lignes:cols.drug.map((_,k)=>Object.fromEntries(P().SORTIE_CHAMPS.map(c=>[c,cols[c][k]])))}}
  return {...e,type,nom:val('nom'),specialite:val('specialite'),description:val('description'),contenu,motif:val('motif')};
 }
 function lierEditeur(e){
  const form=$('#pr-form');
  $('#pr-cancel').onclick=()=>{etat.edition=null;dessiner()};
  const type=form.querySelector('[name=type]');if(type&&!e.id)type.onchange=()=>{const cur=lire(form,e);etat.edition={...cur,type:type.value,contenu:P().vide(type.value)};dessiner()};
  const lier=()=>form.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>b.closest('.pr-row').remove());lier();
  form.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const k=b.dataset.add,host=form.querySelector(`[data-rows="${k}"]`);if(host.children.length>=P().MAX_LIGNES){toast(P().MAX_LIGNES+' lignes au plus');return}
   host.insertAdjacentHTML('beforeend',k==='premed'?lignePreop({}):k==='postop'?lignePostop({category:'Médicament'}):ligneSortie({}));host.lastElementChild.querySelector('input').focus();lier()});
  form.onsubmit=async ev=>{ev.preventDefault();const cur=lire(form,e),errs=$('#pr-errors');
   const v=P().valider(cur,{modification:!!e.id,motif:cur.motif});if(!v.ok){errs.innerHTML=v.errors.map(x=>`<p class="pr-err">${esc(x)}</p>`).join('');errs.scrollIntoView({block:'nearest'});return}
   const btn=form.querySelector('[type=submit]');btn.disabled=true;
   try{const r=await api('',{action:'enregistrer',id:e.id||undefined,version:e.version,protocole:v.protocole,motif:cur.motif});toast(e.id?'Version '+r.protocole.version+' enregistrée':'Protocole créé');etat.edition=null;charger()}
   catch(err){btn.disabled=false;errs.innerHTML=`<p class="pr-err">${esc(err.message)}</p>`}};
 }
 return {render};
};
root.IaseloProtocolesUI={choisir,reference,liste};
})(window);

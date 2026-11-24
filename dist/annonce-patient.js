// IASELO · annonce chirurgicale pour un patient pas encore connu (demande de Romain, 24/11/2026).
// 1. Le chirurgien crée le patient et son séjour depuis « Nouvelle annonce » : identité provisoire (à vérifier à
//    l'admission, INS), contrôle des identités approchantes, puis l'onglet Annonce s'ouvre pour la saisie.
// 2. Une fois l'annonce transmise, l'anesthésiste lance la consultation d'anesthésie depuis l'annonce, sur ce séjour.
// Les droits restent ceux du serveur (worker/professional-access.mjs) : création du séjour par anesthésiste, chirurgien
// ou secrétariat d'une équipe de soins ; annonce écrite par le chirurgien seulement ; consultation par l'anesthésiste.
(function(root){
 'use strict';
 const SPECIALTIES=['Orthopédie','Chirurgie digestive','ORL','Gynécologie','Urologie'];
 const TASK_ANNONCE='Annonce chirurgicale à transmettre',TASK_CONSULT='Consultation d’anesthésie à faire';

 // Règles pures (testées dans tests/annonce-patient.test.cjs).
 const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
 function identityErrors(v,{needTeam=false,today=new Date()}={}){
  const errors=[],last=clean(v.lastName),first=clean(v.firstName),birth=clean(v.birthDate);
  if(!last)errors.push('Nom de naissance');
  if(!first)errors.push('Prénom');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birth)||Number.isNaN(Date.parse(birth+'T00:00:00Z'))||new Date(birth+'T00:00:00Z').toISOString().slice(0,10)!==birth)errors.push('Date de naissance');
  else{const d=new Date(birth+'T00:00:00Z'),t=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());if(d.getTime()>t||d.getUTCFullYear()<1900)errors.push('Date de naissance plausible')}
  if(needTeam&&!clean(v.careTeamId))errors.push('Équipe de soins');
  return errors;
 }
 function buildStay(v,{id,at,role}){
  const stay={id,identity:{lastName:clean(v.lastName).toUpperCase(),firstName:clean(v.firstName),birthDate:clean(v.birthDate)},
   specialty:SPECIALTIES.includes(v.specialty)?v.specialty:SPECIALTIES[0],mode:v.mode==='Hospitalisation'?'Hospitalisation':'Ambulatoire',stage:'Consultation',
   origin:'annonce',task:TASK_ANNONCE,done:false,
   consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},
   events:[{at,role,text:'Patient créé depuis une annonce chirurgicale · identité provisoire, à vérifier à l’admission (pièce d’identité, INS)',kind:'Identitovigilance'}]};
  if(clean(v.careTeamId))stay.careTeamId=clean(v.careTeamId);
  return stay;
 }
 // État de la consultation d'anesthésie vu depuis l'annonce.
 function consultState(stay){
  if(stay?.consult?.validated)return {key:'validee',label:'Ouvrir la consultation validée',hint:'La consultation d’anesthésie de ce séjour est validée.'};
  return {key:'afaire',label:'Faire la consultation d’anesthésie',hint:'L’intervention, la date et le chirurgien de l’annonce sont repris dans la consultation.'};
 }
 const rules={identityErrors,buildStay,consultState,TASK_ANNONCE,TASK_CONSULT,SPECIALTIES};
 if(typeof module!=='undefined'&&module.exports){module.exports=rules;return}
 root.AnnoncePatientRegles=rules;

 root.createAnnoncePatient=function(ctx){
  const {$,esc,toast}=ctx;
  const surgeon=()=>ctx.role()==='Chirurgien'&&ctx.canCreate();
  const fr=d=>d?d.split('-').reverse().join('/'):'';

  // Bouton « Nouvelle annonce » à côté de « Nouveau séjour » (même visibilité, profil chirurgien).
  const nw=$('#new');
  if(nw&&!$('#new-annonce')){
   nw.insertAdjacentHTML('beforebegin','<button type="button" class="primary" id="new-annonce" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Nouvelle annonce · nouveau patient</button>');
   const sync=()=>{const b=$('#new-annonce');if(b)b.hidden=nw.hidden||!surgeon()};
   new MutationObserver(sync).observe(nw,{attributes:true,attributeFilter:['hidden']});sync();
   ctx.onRender(sync);
   $('#new-annonce').onclick=open;
  }

  function dialog(){
   let d=$('#annonce-patient-modal');if(d)return d;
   document.body.insertAdjacentHTML('beforeend',`<dialog id="annonce-patient-modal" class="annonce-patient-modal" aria-labelledby="annonce-patient-title"><form id="annonce-patient-form" novalidate>
    <div class="dialoghead"><h2 id="annonce-patient-title">Nouvelle annonce chirurgicale</h2><button type="button" class="icon" data-ap-close aria-label="Fermer">×</button></div>
    <p class="ap-intro">Le patient n’est pas encore connu d’IASELO : son dossier et son séjour sont créés à partir de l’annonce. L’identité reste <strong>provisoire</strong> jusqu’à sa vérification à l’admission (pièce d’identité, INS).</p>
    <fieldset class="ap-group"><legend>Patient</legend>
     <div class="ap-grid">
      <label>Nom de naissance<input name="lastName" required maxlength="80" autocomplete="off" autocapitalize="characters"></label>
      <label>Prénom<input name="firstName" required maxlength="80" autocomplete="off"></label>
      <label>Date de naissance<input name="birthDate" type="date" required autocomplete="off"></label>
     </div>
    </fieldset>
    <fieldset class="ap-group"><legend>Séjour</legend>
     <div class="ap-grid">
      <label>Spécialité<select name="specialty">${SPECIALTIES.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
      <label>Prise en charge envisagée<select name="mode"><option>Ambulatoire</option><option>Hospitalisation</option></select></label>
      <span class="ap-team"></span>
     </div>
    </fieldset>
    <p class="ap-error warn" role="alert"></p>
    <div class="ap-match"></div>
    <div class="actions"><button type="button" class="secondary" data-ap-close>Annuler</button><button class="primary" type="submit">Créer le patient et rédiger l’annonce</button></div>
   </form></dialog>`);
   d=$('#annonce-patient-modal');
   d.querySelectorAll('[data-ap-close]').forEach(b=>b.onclick=()=>d.close());
   $('#annonce-patient-form').onsubmit=submit;
   $('#annonce-patient-form').oninput=()=>{$('#annonce-patient-form .ap-match').innerHTML='';$('#annonce-patient-form .ap-error').textContent='';d.dataset.confirmed=''};
   return d;
  }
  function open(){
   if(!surgeon()){toast('La création d’une annonce est réservée au chirurgien');return}
   const d=dialog(),form=$('#annonce-patient-form');form.reset();d.dataset.confirmed='';
   form.querySelector('.ap-error').textContent='';form.querySelector('.ap-match').innerHTML='';
   const teams=ctx.teams();
   form.querySelector('.ap-team').innerHTML=teams.length?`<label>Équipe de soins<select name="careTeamId" required>${teams.map(t=>`<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></label>`:'';
   d.showModal();form.querySelector('input[name=lastName]').focus();
  }
  function submit(e){
   e.preventDefault();
   if(!surgeon())return;
   const d=$('#annonce-patient-modal'),form=e.currentTarget,v=Object.fromEntries(new FormData(form));
   const errors=identityErrors(v,{needTeam:ctx.teams().length>0});
   const err=form.querySelector('.ap-error');
   if(errors.length){err.textContent='À renseigner : '+errors.join(', ')+'.';return}
   err.textContent='';
   // Identitovigilance : identités approchantes déjà présentes dans les dossiers autorisés.
   const matches=ctx.checkIdentity({lastName:clean(v.lastName),firstName:clean(v.firstName),birthDate:v.birthDate});
   if(matches.length&&d.dataset.confirmed!=='1'){
    const box=form.querySelector('.ap-match');
    box.innerHTML=`<section class="notice warn"><h3>Ce patient est peut-être déjà connu</h3><p>Vérifiez s’il s’agit du même patient avant d’en créer un nouveau.</p><ul>${matches.map(({other,reason})=>{const id=other.identity||{};return `<li><strong>${esc([String(id.lastName||'').toUpperCase(),id.firstName].filter(Boolean).join(' ')||other.id)}</strong>${id.birthDate?' · né(e) le '+esc(fr(id.birthDate)):''} · séjour ${esc(other.id)} · ${esc(reason)} <button type="button" class="secondary" data-ap-existing="${esc(other.id)}">Faire l’annonce dans ce dossier</button></li>`}).join('')}</ul><button type="button" class="secondary" data-ap-distinct>Ce n’est pas le même patient : créer un nouveau dossier</button></section>`;
    box.querySelectorAll('[data-ap-existing]').forEach(b=>b.onclick=()=>{d.close();ctx.open(b.dataset.apExisting,'surgeryAnnouncement');toast('Dossier existant ouvert sur l’annonce chirurgicale')});
    box.querySelector('[data-ap-distinct]').onclick=()=>{d.dataset.confirmed='1';box.innerHTML='';form.requestSubmit()};
    return;
   }
   const stay=buildStay(v,{id:'DÉMO-'+crypto.randomUUID().slice(0,12),at:new Date().toLocaleString('fr-FR'),role:ctx.role()});
   if(matches.length)stay.events.unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text:'Nouveau dossier créé après alerte d’identité approchante, vérifiée par le chirurgien',kind:'Identitovigilance'});
   ctx.add(stay);
   d.close();
   ctx.open(stay.id,'surgeryAnnouncement');
   toast('Patient créé (identité provisoire) · complétez puis transmettez l’annonce');
   setTimeout(()=>document.querySelector('#surgical-form input[name="procedure"]')?.focus(),50);
  }

  // Après la transmission de l'annonce d'un patient créé par l'annonce : le séjour passe à « consultation à faire ».
  document.addEventListener('submit',e=>{
   if(e.target?.id!=='surgical-form')return;
   const stay=ctx.current();
   setTimeout(()=>{
    const pub=stay?.surgicalAnnouncement?.published;
    if(!stay||pub?.state!=='Transmise'||stay.task!==TASK_ANNONCE)return;
    stay.task=TASK_CONSULT;
    if(['Ambulatoire','Hospitalisation'].includes(pub.fields?.mode))stay.mode=pub.fields.mode;
    ctx.save();
    if(ctx.current()===stay&&ctx.tab()==='surgeryAnnouncement')decorate();
   },0);
  },true);

  // Sur l'onglet Annonce : accès direct à la consultation d'anesthésie de ce séjour.
  function decorate(){
   const content=$('#content'),stay=ctx.current();
   if(!content||!stay||ctx.tab()!=='surgeryAnnouncement')return;
   content.querySelector('.ap-next')?.remove();
   const pub=stay.surgicalAnnouncement?.published,f=pub?.fields||{},id=stay.identity||{};
   const who=[String(id.lastName||'').toUpperCase(),id.firstName].filter(Boolean).join(' ');
   const provisional=stay.origin==='annonce'?`<p class="ap-prov">Patient créé depuis l’annonce · identité provisoire, à vérifier à l’admission.</p>`:'';
   let html='';
   if(ctx.role()==='Anesthésiste'){
    if(pub?.state==='Transmise'){
     const st=consultState(stay);
     html=`<section class="ap-next ap-next-go" aria-label="Consultation d’anesthésie"><div><strong>${esc(st.key==='afaire'?'Annonce reçue : consultation d’anesthésie à faire':'Consultation d’anesthésie validée')}</strong><p>${esc(who||stay.id)} · ${esc(f.procedure||'')}${f.date?' · '+esc(fr(f.date)):''}${f.surgeon?' · '+esc(f.surgeon):''}</p><p class="muted">${esc(st.hint)}</p>${provisional}</div><button type="button" class="primary" data-ap-consult>${esc(st.label)}</button></section>`;
    }else if(pub?.state==='Annulée'){
     html=`<section class="ap-next"><div><strong>Annonce annulée par le chirurgien</strong><p class="muted">La consultation d’anesthésie reste accessible depuis l’onglet Consultation d’anesthésie si elle est encore nécessaire.</p></div></section>`;
    }else{
     html=`<section class="ap-next"><div><strong>Annonce pas encore transmise</strong><p class="muted">Le bouton pour commencer la consultation d’anesthésie apparaîtra ici dès que le chirurgien aura transmis l’annonce.</p>${provisional}</div></section>`;
    }
   }else if(ctx.role()==='Chirurgien'){
    if(pub?.state==='Transmise')html=`<section class="ap-next ap-next-done"><div><strong>Annonce transmise à l’équipe d’anesthésie</strong><p class="muted">L’anesthésiste peut maintenant faire la consultation d’anesthésie de ce patient à partir de l’annonce.</p>${provisional}</div></section>`;
    else if(stay.origin==='annonce')html=`<section class="ap-next"><div><strong>Nouveau patient · annonce à compléter</strong><p class="muted">Renseignez l’intervention puis transmettez l’annonce : l’équipe d’anesthésie pourra lancer la consultation.</p>${provisional}</div></section>`;
   }
   if(!html)return;
   const h=content.querySelector('h3');(h||content.firstChild)?h.insertAdjacentHTML('afterend',html):content.insertAdjacentHTML('afterbegin',html);
   content.querySelector('[data-ap-consult]')?.addEventListener('click',()=>{ctx.goTab('consult');toast('Consultation d’anesthésie ouverte pour '+(who||stay.id))});
  }
  function detail(){
   const host=document.getElementById('detail');
   if(host){const st=host.querySelector('.dossier-tabs > button.active')?.dataset.dossierStage||'';if(st)host.dataset.ogStage=st;else delete host.dataset.ogStage}
   decorate();
  }
  return {detail,open};
 };
})(typeof window!=='undefined'?window:globalThis);

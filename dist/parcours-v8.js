(async function(){
'use strict';
'use strict';
const stages=['Consultation','Préopératoire','Intervention','SSPI','Hospitalisation','Sortie'];
const fictitiousIdentities=[['Martin', 'Camille', '1984-04-12'], ['Lefèvre', 'Élodie', '1975-09-23'], ['Bernard', 'Noé', '1993-02-08'], ['Rousseau', 'Lina', '1988-12-15'], ['Dubois', 'Sacha', '1966-06-30'], ['Martin', 'Camille', '1991-07-04']];
const patients=[['DÉMO-001','Orthopédie','Hospitalisation','Préopératoire','Bilan à compléter'],['DÉMO-002','Chirurgie digestive','Hospitalisation','Hospitalisation','Transmission attendue','etage-1'],['DÉMO-003','ORL','Ambulatoire','Consultation','Consultation à valider'],['DÉMO-004','Gynécologie','Ambulatoire','SSPI','Surveillance en cours','sspi-chir'],['DÉMO-005','Urologie','Hospitalisation','Intervention','Dossier disponible','bloc-chir'],['DÉMO-006','Orthopédie','Hospitalisation','Sortie','Synthèse à compléter']].map((p,i)=>({id:p[0],specialty:p[1],mode:p[2],stage:p[3],task:p[4],sector:p[5]||'',identity:Object.fromEntries(['lastName','firstName','birthDate'].map((key,j)=>[key,fictitiousIdentities[i][j]])),done:false,consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},events:[{at:'Exemple initial',role:'Démonstration',text:'Séjour fictif créé',kind:'Dossier'}]}));
let selected='DÉMO-001',tab='consult',view='patients',query='',filter='Tous',role='Anesthésiste';let veilleModule=null;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const p=()=>patients.find(x=>x.id===selected);const nurseProfile=()=>role==='Infirmier';const physician=()=>!nurseProfile();
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').style.display='none',4000)}
function event(text,kind='Modification'){p().events.unshift({at:new Date().toLocaleString('fr-FR'),role,text,kind})}
function stats(){const pending=patients.filter(x=>!x.done).length;$('#stats').innerHTML=[[patients.length,'Séjours fictifs'],[patients.filter(x=>['Intervention','SSPI','Hospitalisation'].includes(x.stage)).length,'Prises en charge en cours'],[pending,'Actions en attente'],[patients.filter(x=>x.stage==='Sortie').length,'Séjours en sortie']].map((x,i)=>`<div class="stat ${i===2?'accent':''}"><span>${x[1]}</span><strong>${x[0]}</strong></div>`).join('')}
function render(){stats();$('#title').textContent={patients:'Patients & séjours',service:'Vue du service',search:'Recherche patient',tasks:'Actions à suivre',portal:'Préparer ma consultation'}[view];document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==='portal'){renderPortal();return}if(view==='service'){renderService();return}if(view==='search'){renderPatientSearch();return}if(view==='tasks'){renderTasks();return}$('#workspace').innerHTML=`<div class="layout"><section class="panel"><div class="panelhead"><h3>Liste des séjours</h3><div class="filters"><input id="search" aria-label="Rechercher un séjour fictif" placeholder="Identifiant ou spécialité" value="${esc(query)}"><select id="filter" aria-label="Filtrer le parcours">${['Tous',...stages].map(s=>`<option ${filter===s?'selected':''}>${s}</option>`).join('')}</select></div></div><div id="patientlist"></div></section><section class="panel" id="detail"></section></div>`;$('#search').oninput=e=>{query=e.target.value;list()};$('#filter').onchange=e=>{filter=e.target.value;list()};list();detail()}
function list(){const matches=patients.filter(x=>(filter==='Tous'||filter===x.stage)&&`${x.id} ${x.specialty} ${x.identity?.lastName||''} ${x.identity?.firstName||''}`.toLowerCase().includes(query.toLowerCase()));$('#patientlist').innerHTML=matches.length?matches.map(x=>`<button class="patient ${x.id===selected?'selected':''}" data-patient="${x.id}"><div class="ui-patient">${stayAvatar(x)}<span class="ui-who"><strong>${esc(stayName(x))}</strong><span>${esc(x.id)} · ${esc(x.specialty)} · ${esc(x.mode)}</span></span></div><div class="row"><span class="pill">${esc(x.stage)}</span><small>${esc(x.done?'Action réalisée':x.task)}</small></div></button>`).join(''):'<div class="empty">Aucun séjour ne correspond à ce filtre.</div>';document.querySelectorAll('[data-patient]').forEach(b=>b.onclick=()=>{if(tab==='consult')captureConsult();selected=b.dataset.patient;tab=role==='Chirurgien'?'surgeryAnnouncement':nurseProfile()?'follow':'consult';list();detail()})}
function patientIdentityFields(){
 return `<div class="patient-identity-fields">
  <label>Nom fictif<input name="lastName" maxlength="80" autocomplete="off"></label>
  <label>Prénom fictif<input name="firstName" maxlength="80" autocomplete="off"></label>
  <label>Date de naissance fictive<input type="date" name="birthDate" autocomplete="off"></label>
 </div>`;
}

function normalizePatientName(value){
 return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’'\s-]+/g,' ').trim();
}
function normalizeRecordNumber(value){
 return normalizePatientName(value).replace(/\s/g,'');
}
function patientSearchMatches(criteria){
 const lastName=normalizePatientName(criteria.lastName);
 const firstName=normalizePatientName(criteria.firstName);
 const birthDate=criteria.birthDate||'';
 const number=normalizeRecordNumber(criteria.recordNumber);
 if(!lastName&&!firstName&&!birthDate&&!number)return null;
 return patients.filter(({id,identity,identityAliases=[]})=>
  (!lastName||[identity?.lastName,identity?.birthName,identity?.usedName,...identityAliases.flatMap(a=>[a.birthName,a.usedName])].some(name=>normalizePatientName(name).includes(lastName)))
  &&(!firstName||[identity?.firstName,identity?.usedFirstName,...identityAliases.flatMap(a=>[a.firstName,a.usedFirstName])].some(name=>normalizePatientName(name).includes(firstName)))
  &&(!birthDate||identity?.birthDate===birthDate)
  &&(!number||normalizeRecordNumber(id)===number)
 );
}
let patientSearchCriteria={};

function patientSearchMarkup(){
 const value=key=>esc(patientSearchCriteria[key]||'');
 return `<section class="panel"><div class="content">
  <form id="patient-search-form" role="search" aria-label="Recherche dans les dossiers fictifs">
   <p>Renseigne un ou plusieurs critères. Les dossiers affichés sont fictifs.</p>
   <div class="formgrid patient-search-fields">
    <label>Nom<input name="lastName" value="${value('lastName')}" maxlength="80" autocomplete="off"></label>
    <label>Prénom<input name="firstName" value="${value('firstName')}" maxlength="80" autocomplete="off"></label>
    <label>Date de naissance<input type="date" name="birthDate" value="${value('birthDate')}" autocomplete="off"></label>
    <label>Numéro de dossier<input name="recordNumber" value="${value('recordNumber')}" maxlength="60" autocomplete="off"></label>
   </div>
   <div class="actions"><button type="submit" class="primary">Rechercher</button><button type="reset" class="secondary">Effacer</button></div>
  </form>
  <p id="patient-search-status" role="status"></p>
  <ul class="patient-search-results" id="patient-search-results" aria-label="Résultats de la recherche"></ul>
 </div></section>`;
}

function bindPatientSearch(open){
 const form=$('#patient-search-form');
 const status=$('#patient-search-status');
 const results=$('#patient-search-results');
 function showResults(){
  const matches=patientSearchMatches(patientSearchCriteria);
  status.textContent=matches===null?'Renseigne au moins un critère.':matches.length?
   `${matches.length} dossier${matches.length===1?'':'s'} trouvé${matches.length===1?'':'s'}`:'Aucun dossier ne correspond aux critères.';
  results.innerHTML=(matches||[]).map(stay=>{
   const {lastName,firstName,birthDate}=stay.identity||{};
   const name=[lastName,firstName].filter(Boolean).join(' ');
   const birth=birthDate?birthDate.split('-').reverse().join('/'):'Date de naissance non renseignée';
   return `<li class="patient-search-result">
    ${stayAvatar(stay)}<div><strong>${esc(name||'Identité non renseignée')}</strong><p>${esc(birth)} · Dossier ${esc(stay.id)}</p><p>${esc(stay.specialty)} · ${esc(stay.stage)}</p></div>
    ${open?`<button type="button" class="secondary" data-patient-result="${esc(stay.id)}" aria-label="Ouvrir le dossier ${esc(stay.id)}">Ouvrir le dossier</button>`:''}
   </li>`;
  }).join('');
  for(const button of results.querySelectorAll('[data-patient-result]')){
   button.onclick=()=>open(button.dataset.patientResult);
  }
 }
 form.onsubmit=e=>{
  e.preventDefault();
  patientSearchCriteria=Object.fromEntries(new FormData(form));
  showResults();
 };
 form.onreset=e=>{
  e.preventDefault();
  for(const field of form.querySelectorAll('input'))field.value='';
  patientSearchCriteria={};
  showResults();
 };
 showResults();
}

function renderPatientSearch(){
 $('#workspace').innerHTML=patientSearchMarkup();
 bindPatientSearch(id=>{
  selected=id;
  tab=role==='Chirurgien'?'surgeryAnnouncement':nurseProfile()?'follow':'consult';
  filter='Tous';
  query='';
  view='patients';
  render();
  const heading=$('#detail h2');
  heading.tabIndex=-1;
  heading.focus();
 });
}

function sectorOptions(current){
 return '<option value="">Non renseigné</option>'+Object.entries(serviceSectors).map(([id,label])=>
  `<option value="${id}" ${current===id?'selected':''}>${esc(label)}</option>`).join('');
}

function stayAvatar(stay){const n=stay.identity||{};return `<span class="ui-avatar" aria-hidden="true">${esc((((n.lastName||'')[0]||'')+((n.firstName||'')[0]||'')).toUpperCase()||'?')}</span>`}
function stayName(stay){const n=stay.identity||{};return n.lastName?`${String(n.lastName).toUpperCase()} ${n.firstName||''}`.trim():stay.id}
function staySteps(stay){const list=['Consultation','Préopératoire','Intervention','SSPI','Hospitalisation','Sortie'],i=list.indexOf(stay.stage);return `<span class="ui-steps" role="img" aria-label="Étape ${i+1} sur 6 : ${esc(stay.stage)}">${list.map((_,k)=>`<i class="${k<i?'done':k===i?'now':''}"></i>`).join('')}</span>`}
function serviceStayCard(stay,canOpen){
 const description=`${stayAvatar(stay)}<span class="ui-who"><strong>${esc(stayName(stay))}</strong><span>${esc(stay.id)} · ${esc(stay.specialty)} · ${esc(stay.stage)}</span>${staySteps(stay)}</span>`;
 return canOpen
  ? `<button type="button" class="service-stay" data-service-stay="${esc(stay.id)}">${description}</button>`
  : `<div class="service-stay">${description}</div>`;
}

function serviceBoard(canOpen=true){
 const groups=new Map([...Object.entries(serviceSectors),['','Séjours sans secteur']].map(([id,label])=>[id,{label,stays:[]}]));
 for(const stay of patients){
  (groups.get(stay.sector)||groups.get('')).stays.push(stay);
 }
 return `<div class="service-grid">${[...groups].map(([id,{label,stays}])=>`
  <section class="panel service-sector ${id?'':'service-unassigned'}" aria-labelledby="sector-${id||'unknown'}">
   <div class="service-sector-head">
    <h2 id="sector-${id||'unknown'}">${label}</h2>
    <span class="pill">${stays.length} séjour${stays.length!==1?'s':''}</span>
   </div>
   ${stays.length?'<ul>'+stays.map(stay=>`<li>${serviceStayCard(stay,canOpen)}</li>`).join('')+'</ul>':'<p class="muted">Aucun séjour</p>'}
  </section>`).join('')}</div>`;
}

function bindServiceStays(open){
 for(const button of document.querySelectorAll('[data-service-stay]')){
  button.onclick=()=>open(button.dataset.serviceStay);
 }
}

function renderService(){
 $('#workspace').innerHTML=serviceBoard();
 bindServiceStays(id=>{
  selected=id;
  const sector=p().sector;
  tab=sector?.startsWith('bloc-')?'perop':sector?'follow':role==='Chirurgien'?'surgeryAnnouncement':nurseProfile()?'follow':'consult';
  filter='Tous';
  query='';
  view='patients';
  render();
  const heading=$('#detail h2');
  heading.tabIndex=-1;
  heading.focus();
 });
}

const dossierStages=[
 {id:'annonce',label:'Annonce chirurgicale',hint:'Intervention et programmation souhaitée',defaultTab:'surgeryAnnouncement',items:[['surgeryAnnouncement','Annonce chirurgicale']]},
 {id:'consultation',label:'Consultation d’anesthésie',hint:'Évaluation et préparation',defaultTab:'consult',items:[['consult','Dossier de consultation'],['questionnaire','Questionnaire patient'],['preparation','Actions de préparation'],['overview','Synthèse du séjour'],['science','Tous les outils scientifiques'],['history','Historique du dossier']]},
 {id:'peroperatoire',label:'Peropératoire',hint:'Feuille d’anesthésie et administrations',defaultTab:'perop',items:[['perop','Feuille d’anesthésie']]},
 {id:'postoperatoire',label:'Prescription et suivi postopératoire',hint:'Prescriptions, SSPI, hospitalisation et sortie',defaultTab:'rx',items:[['rx','Prescriptions postopératoires'],['follow','Dossier infirmier & surveillance'],['operativeReport','Compte rendu opératoire'],['discharge','Synthèse et validation de sortie'],['dischargeLiaison','Lettre de liaison'],['dischargeRx','Ordonnance de sortie'],['instructions','Consignes au patient']]}
];
const surgicalFields=[
 ['procedure','Intervention prévue','text',true],
 ['indication','Indication / précision du geste','textarea'],
 ['laterality','Latéralité / site','select',true,['Droit','Gauche','Bilatéral','Médian','Non applicable']],
 ['site','Site anatomique précis','text'],
 ['surgeon','Chirurgien · nom fictif','text',true],
 ['urgency','Caractère de l’intervention','select',true,['Programmée','Urgente']],
 ['mode','Prise en charge envisagée','select',true,['Ambulatoire','Hospitalisation']],
 ['date','Date opératoire souhaitée','date'],
 ['time','Heure souhaitée','time'],
 ['duration','Durée estimée (min)','number'],
 ['equipment','Matériel / installation particulière','textarea'],
 ['notes','Informations à transmettre à l’anesthésie','textarea']
];
function surgicalField([key,label,type,required,options],data){
 const value=esc(data[key]||'');
 const attr=`name="${key}" ${required?'required':''}`;
 const input=type==='select'
  ? `<select ${attr}><option value="">Choisir</option>${options.map(option=>`<option ${option===data[key]?'selected':''}>${esc(option)}</option>`).join('')}</select>`
  : type==='textarea' ? `<textarea ${attr} maxlength="2000">${value}</textarea>`
  : `<input ${attr} type="${type}" value="${value}" ${type==='number'?'min="1" step="1"':type==='text'?'maxlength="250"':''}>`;
 return `<label class="${type==='textarea'?'wide':''}">${esc(label)}${input}</label>`;
}
function publishedSurgery(x){
 return x.surgicalAnnouncement?.published?.state==='Transmise' ? x.surgicalAnnouncement.published : undefined;
}
function surgeryBanner(x){
 const announcement=x.surgicalAnnouncement?.published;
 if(!announcement)return '';
 return `<div class="notice no-print surgery-banner">
  <div><strong>Annonce chirurgicale · ${esc(announcement.state)}</strong>
  <p>${esc(announcement.fields.procedure)}${announcement.fields.date?' · '+esc(announcement.fields.date.split('-').reverse().join('/')):''}</p></div>
  <button type="button" class="secondary" id="open-surgical-announcement">Voir l’annonce</button>
 </div>`;
}
function surgeryAnnouncement(){
 const stay=p();
 const saved=stay.surgicalAnnouncement||{};
 const published=saved.published;
 const write=role==='Chirurgien';
 const initial={mode:stay.mode,surgeon:activeDoctor==='med-c'?'Dr Dubois':''};
 const draft=saved.draft||published?.fields||initial;
 const transmitted=published?`<section class="surgery-announcement-summary">
   <div class="row"><h4>Annonce ${published.state.toLowerCase()}</h4><span class="pill ${published.state==='Transmise'?'good':'warn'}">${esc(published.state)}</span></div>
   <p class="muted">${esc(published.at)} · ${esc(published.fields.surgeon)}</p>
   ${published.reason?`<p class="preserve"><strong>Motif de l’annulation</strong> · ${esc(published.reason)}</p>`:''}
   <dl class="answers">${surgicalFields.filter(([key])=>published.fields[key]).map(([key,label])=>{
    const value=key==='date'?published.fields[key].split('-').reverse().join('/'):published.fields[key];
    return `<div class="answer"><dt>${esc(label)}</dt><dd class="preserve">${esc(value)}</dd></div>`;
   }).join('')}</dl>
  </section>`:'<p class="muted">Aucune annonce transmise pour ce séjour.</p>';
 $('#content').innerHTML=`<h3>Annonce chirurgicale</h3>
 <p class="muted">Séjour ${esc(stay.id)} · ${esc(stay.specialty)}. Les annonces transmises sont visibles par l’équipe dans le dossier de démonstration de démonstration.</p>
 ${transmitted}
 ${write?`<form id="surgical-form" class="workflow-form">
  <h4>${saved.draft?'Brouillon enregistré':published?'Préparer une nouvelle version':'Préparer l’annonce'}</h4>
  <p class="muted">Pour transmettre l’annonce, renseignez l’intervention, le chirurgien, la latéralité, l’urgence et le mode de prise en charge. La date et l’heure sont souhaitées.</p>
  <div class="formgrid">${surgicalFields.map(field=>surgicalField(field,draft)).join('')}</div>
  <p id="surgical-error" class="warn" role="alert"></p>
  <div class="actions"><button class="secondary" name="surgicalAction" value="draft" formnovalidate>Enregistrer le brouillon</button>
  <button class="primary" name="surgicalAction" value="send">${published?'Transmettre la nouvelle version':'Transmettre à l’équipe'}</button></div>
 </form>
 ${published?.state==='Transmise'?`<details class="surgery-cancel"><summary>Annuler l’annonce transmise</summary>
 <form id="cancel-surgical-form"><label>Motif de l’annulation<input name="reason" required maxlength="250"></label><button class="secondary">Confirmer l’annulation</button></form>
 </details>`:''}`:'<p class="muted">Lecture seule · la saisie de l’annonce est réservée au profil chirurgien.</p>'}`;
 if(!write)return;
 $('#surgical-form').onsubmit=e=>{
  e.preventDefault();
  if(role!=='Chirurgien'||p()!==stay)return;
  const fields=Object.fromEntries([...new FormData(e.currentTarget)].map(([key,value])=>[key,value.trim()]));
  const sending=e.submitter?.value==='send';
  const error=$('#surgical-error');
  if(sending&&surgicalFields.some(([key,,,required])=>required&&!fields[key])){
   error.textContent='Renseignez tous les champs nécessaires à la transmission.';
   return;
  }
  if(sending&&fields.time&&!fields.date){
   error.textContent='Indiquez la date opératoire souhaitée pour renseigner une heure.';
   return;
  }
  if(sending){
   const revision=(published?.revision||0)+1;
   stay.surgicalAnnouncement={published:{fields,state:'Transmise',at:new Date().toLocaleString('fr-FR'),revision}};
   event(`Annonce chirurgicale transmise (v${revision}) · ${fields.procedure} · ${fields.surgeon}`,'Annonce chirurgicale');
  }else{
   stay.surgicalAnnouncement={...saved,draft:fields};
  }
  surgeryAnnouncement();
  toast(sending?'Annonce visible par l’équipe dans le dossier de démonstration':'Brouillon chirurgical enregistré');
 };
 const cancel=$('#cancel-surgical-form');
 if(cancel)cancel.onsubmit=e=>{
  e.preventDefault();
  if(role!=='Chirurgien'||p()!==stay||stay.surgicalAnnouncement?.published!==published)return;
  const reason=new FormData(e.currentTarget).get('reason').trim();
  if(!reason){toast('Renseignez le motif de l’annulation');return}
  stay.surgicalAnnouncement.published={...published,state:'Annulée',at:new Date().toLocaleString('fr-FR'),reason};
  event('Annonce chirurgicale annulée · '+reason,'Annonce chirurgicale');
  surgeryAnnouncement();
  toast('Annulation visible par l’équipe dans le dossier de démonstration');
 };
}

// En-tête des documents imprimés : établissement, identité complète du patient (identitovigilance) et date d’impression.
function printHead(x){const id=x.identity||{},name=[String(id.lastName||'').toUpperCase(),id.firstName].filter(Boolean).join(' ')||'Patient fictif',born=id.birthDate?frDate(id.birthDate):'';return `<div class="print-head" aria-hidden="true"><img src="assets/marque/etablissement.webp" alt="" width="185" height="100"><div><strong>${esc(name)}</strong><span>${born?'Né(e) le '+esc(born)+' · ':''}Séjour ${esc(x.id)} · ${esc(x.specialty||'')}</span><span class="print-date">Imprimé le ${esc(new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))}</span></div></div>`}
window.addEventListener('beforeprint',()=>document.querySelectorAll('.print-date').forEach(e=>e.textContent='Imprimé le '+new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})));
function dossierStageFor(key){return dossierStages.find(g=>g.items.some(([k])=>k===key))||dossierStages[0]}
function detail(){
 closeCroDictation();
 if(nurseProfile()&&tab==='science')tab='consult';
 const x=p(),group=dossierStageFor(tab);if(!group.items.some(([k])=>k===tab))tab=group.defaultTab;
 $('#detail').innerHTML=`${printHead(x)}<div class="detailhead"><div class="row"><div><h2>${x.id}</h2><p>${esc(x.specialty)} · ${esc(x.mode)}</p>${x.identity?.lastName||x.identity?.firstName?`<p>${esc([x.identity.lastName,x.identity.firstName].filter(Boolean).join(' '))}</p>`:''}</div><div class="actions"><span class="identity">Patient fictif</span><button type="button" class="focus-toggle" id="focusdossier" aria-pressed="${document.body.classList.contains('dossier-focus')}">${document.body.classList.contains('dossier-focus')?'Afficher la liste':'Agrandir le dossier'}</button></div></div><div class="dossier-status"><span class="pill ${x.done?'good':'warn'}">${x.done?'Action réalisée':esc(x.task)}</span><label for="stage-status">Étape du séjour<select id="stage-status" ${!physician()?'disabled':''}>${stages.map(stage=>`<option ${stage===x.stage?'selected':''}>${esc(stage)}</option>`).join('')}</select></label><label for="sector-status">Secteur actuel<select id="sector-status" ${!physician()?'disabled':''}>${sectorOptions(x.sector)}</select></label></div></div><div class="dossier-tabs" role="tablist" aria-label="Étapes de la prise en charge">${dossierStages.map((g,i)=>`<button type="button" id="dossier-tab-${g.id}" role="tab" aria-label="${g.label}" aria-selected="${g.id===group.id}" aria-controls="dossier-panel" tabindex="${g.id===group.id?'0':'-1'}" data-dossier-stage="${g.id}" class="${g.id===group.id?'active':''}"><span class="dossier-tab-number" aria-hidden="true">0${i+1}</span><span class="dossier-tab-text"><strong>${g.label}</strong><small>${g.hint}</small></span></button>`).join('')}</div><section id="dossier-panel" role="tabpanel" aria-labelledby="dossier-tab-${group.id}">${group.items.length>1?`<div class="dossier-subnav"><label for="dossier-section">${({consultation:'Contenu de la consultation',peroperatoire:'Bloc opératoire'})[group.id]||'Prescription et suivi'}<select id="dossier-section">${group.items.filter(([key])=>!nurseProfile()||key!=='science').map(([k,n])=>`<option value="${k}" ${k===tab?'selected':''}>${n}</option>`).join('')}</select></label><span>${esc(group.items.find(([k])=>k===tab)?.[1]||'')}</span></div>`:''}<div class="content" id="content"></div></section>`;
 $('#focusdossier').onclick=()=>{const focused=document.body.classList.toggle('dossier-focus');$('#focusdossier').textContent=focused?'Afficher la liste':'Agrandir le dossier';$('#focusdossier').setAttribute('aria-pressed',String(focused))};
 $('#stage-status').onchange=e=>{if(!physician())return;x.stage=e.target.value;event('Étape : '+x.stage,'Parcours');stats();list();toast('Étape du séjour simulée mise à jour')};
 $('#sector-status').onchange=e=>{
  if(!physician())return;
  x.sector=e.target.value;
  event('Secteur : '+(serviceSectors[x.sector]||'non renseigné'),'Localisation');
  toast('Secteur du séjour mis à jour');
 };
 const navigate=key=>{if(tab==='consult')captureConsult();tab=nurseProfile()&&key==='science'?'consult':key;detail()};
 document.querySelectorAll('[data-dossier-stage]').forEach(button=>{button.onclick=()=>navigate(dossierStages.find(g=>g.id===button.dataset.dossierStage).defaultTab);button.onkeydown=e=>{const index=dossierStages.findIndex(g=>g.id===button.dataset.dossierStage),count=dossierStages.length;let target;if(e.key==='ArrowRight')target=(index+1)%count;if(e.key==='ArrowLeft')target=(index+count-1)%count;if(e.key==='Home')target=0;if(e.key==='End')target=count-1;if(target===undefined)return;e.preventDefault();navigate(dossierStages[target].defaultTab);$('#dossier-tab-'+dossierStages[target].id).focus()}});
 if($('#dossier-section'))$('#dossier-section').onchange=e=>navigate(e.target.value);
 (({surgeryAnnouncement,overview,preparation,instructions:patientInstructions,questionnaire:questionnaireReview,consult,science,perop,follow,rx:prescriptions,discharge,dischargeRx,dischargeLiaison,operativeReport,history})[tab]||(()=>veilleModule?.panel(tab)))();
 if(nurseProfile()){
  $('#content').insertAdjacentHTML('afterbegin',`<section class="notice nurse-tools no-print">
   <strong>Profil infirmier · prescriptions médicales en lecture seule, dossier de soins selon habilitation</strong>
   <div class="actions">
    <button type="button" class="secondary" data-nurse-tab="perop">Constantes peropératoires</button>
    <button type="button" class="secondary" data-nurse-tab="follow">Dossier infirmier / constantes</button>
    <button type="button" class="secondary" data-nurse-tab="rx">Exécutions des prescriptions</button>
   </div></section>`);
  document.querySelectorAll('[data-nurse-tab]').forEach(button=>button.onclick=()=>navigate(button.dataset.nurseTab));
 }
 if(tab==='perop'&&(role==='Chirurgien'||x.cro)){
  $('#content').insertAdjacentHTML('afterbegin','<div class="actions cro-shortcut no-print"><button type="button" class="secondary" id="open-cro">'+(role==='Chirurgien'?'Rédiger le compte rendu opératoire':'Voir le compte rendu opératoire')+'</button></div>');
  $('#open-cro').onclick=()=>navigate('operativeReport');
 }
 if(tab==='consult'||tab==='overview'){
  $('#content').insertAdjacentHTML('afterbegin',surgeryBanner(x));
  if(tab==='overview'){
   $('#content').insertAdjacentHTML('afterbegin','<div class="actions no-print"><button type="button" class="secondary" id="overview-liaison">Lettre de liaison à la sortie</button></div>');
   $('#overview-liaison').onclick=()=>navigate('dischargeLiaison');
  }
  const announcementLink=$('#open-surgical-announcement');
  if(announcementLink)announcementLink.onclick=()=>navigate('surgeryAnnouncement');
 }
 if(group.id==='postoperatoire'){
 const content=$('#content');content.insertAdjacentHTML('afterbegin',`<div class="postop-sections" aria-label="Rubriques postopératoires">${group.items.map(([k,n])=>`<button type="button" class="${k===tab?'current':''}" data-postop-section="${k}" aria-pressed="${k===tab}">${n}</button>`).join('')}</div>`);
 document.querySelectorAll('[data-postop-section]').forEach(b=>b.onclick=()=>navigate(b.dataset.postopSection));
 }
}

function consult(){const c=p().consult,read=!physician()||c.validated;$('#content').innerHTML=`<h3>Consultation d’anesthésie</h3>${p().questionnaire?`<div class="notice">Questionnaire patient reçu · ${p().questionnaire.reviewed?'Réponses reprises dans le brouillon':'À vérifier'}. <button class="secondary" type="button" id="seeanswers">Voir les réponses</button></div>`:''}<div class="notice">${c.validated?'Consultation validée dans la simulation. Une révision ouvre une nouvelle modification tracée.':'Saisie de démonstration. Aucun calcul de risque ni recommandation thérapeutique automatique.'}</div><form id="consultform"><fieldset ${read?'disabled':''} style="border:0;margin:0;padding:0"><div class="formgrid"><label>Classe ASA<select name="asa">${['Non renseigné','I','II','III','IV','V','VI'].map(v=>`<option ${v===c.asa?'selected':''}>${v}</option>`).join('')}</select></label><label>Allergies / statut de vérification<input name="allergies" value="${esc(c.allergies)}" placeholder="Données fictives uniquement"></label><label>Antécédents<textarea name="history">${esc(c.history)}</textarea></label><label>Traitements habituels<textarea name="treatments">${esc(c.treatments)}</textarea></label><label class="wide">Évaluation et préparation préopératoire<textarea name="plan">${esc(c.plan)}</textarea></label></div>${['Identité vérifiée dans le scénario','Allergies revues','Traitements revus','Examens et documents revus'].map(s=>`<label class="check"><input type="checkbox" name="checks" value="${s}" ${c.checks.includes(s)?'checked':''}>${s}</label>`).join('')}</fieldset><div class="actions"><button class="primary" ${read?'disabled':''} name="action" value="save">Enregistrer le brouillon</button><button class="secondary" ${read?'disabled':''} name="action" value="validate">Simuler la validation</button>${c.validated&&physician()?'<button class="secondary" type="button" id="revise">Ouvrir une révision</button>':''}</div></form><p class="muted">${read&&!c.validated?'Lecture seule dans le profil infirmier.':''}</p>`;$('#consultform').onsubmit=e=>{e.preventDefault();if(read)return;const f=new FormData(e.currentTarget);Object.assign(c,Object.fromEntries(['asa','history','allergies','treatments','plan'].map(k=>[k,f.get(k)])));c.checks=f.getAll('checks');c.validated=e.submitter.value==='validate';event(c.validated?'Consultation validée (simulation)':'Brouillon de consultation enregistré','Consultation');detail();toast('Consultation enregistrée en attente de confirmation serveur')};if($('#seeanswers'))$('#seeanswers').onclick=()=>{tab='questionnaire';detail()};if($('#revise'))$('#revise').onclick=()=>{c.validated=false;event('Révision de consultation ouverte','Consultation');detail()}}
const croFileTypes={
 pdf:['application/pdf'],
 doc:['application/msword'],
 docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 txt:['text/plain']
};
const croMaximumBytes=15*1024*1024;
let closeCroDictation=()=>{};
function validateCroFile(file){
 const types=croFileTypes[file.name.split('.').pop().toLowerCase()];
 if(!Array.isArray(types)||(file.type&&file.type!=='application/octet-stream'&&!types.includes(file.type))){
  return 'Choisissez un fichier PDF, Word (.doc ou .docx) ou texte (.txt).';
 }
 if(!file.size||file.size>croMaximumBytes)return 'Le fichier doit être non vide et ne pas dépasser 15 Mo.';
 return '';
}
function downloadCroFile(file){
 const link=document.createElement('a');
 const url=URL.createObjectURL(file);
 link.href=url;
 link.download=file.name;
 document.body.append(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function bindCroDictation(editor){
 const start=$('#cro-dictate'),stop=$('#cro-dictate-stop'),install=$('#cro-install-language'),status=$('#cro-dictate-status');
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const recognition=Recognition?new Recognition():null;
 if(!recognition||!('processLocally' in recognition)||typeof Recognition.available!=='function'){
  start.disabled=true;
  status.textContent='Dictée intégrée indisponible sur ce navigateur. Vous pouvez utiliser le micro du clavier, coller un texte ou joindre un fichier.';
  return;
 }
 const options={langs:['fr-FR'],processLocally:true};
 recognition.lang='fr-FR';
 recognition.processLocally=true;
 recognition.continuous=true;
 let listening=false,disposed=false;
 const show=message=>{if(!disposed)status.textContent=message};
 const idle=()=>{listening=false;start.disabled=false;stop.disabled=true};
 recognition.onstart=()=>{listening=true;stop.disabled=false;show('Dictée en cours…')};
 recognition.onresult=event=>{
  if(disposed||!editor.isConnected)return;
  const parts=[];
  for(let i=event.resultIndex;i<event.results.length;i++){
   if(event.results[i].isFinal)parts.push(event.results[i][0].transcript.trim());
  }
  const text=parts.filter(Boolean).join(' ');
  if(text){
   editor.value=[editor.value.trimEnd(),text].filter(Boolean).join(' ').slice(0,editor.maxLength);
   editor.dispatchEvent(new Event('input',{bubbles:true}));
  }
 };
 recognition.onend=()=>{
  const wasListening=listening;
  idle();
  if(wasListening)show('Dictée terminée. Relisez et corrigez le texte avant de l’enregistrer.');
 };
 recognition.onerror=event=>{
  idle();
  show(event.error==='not-allowed'?'Le microphone est bloqué par le navigateur. Vous pouvez saisir le texte ou joindre un fichier.':'La dictée locale a été interrompue. Le texte déjà transcrit est conservé.');
 };
 start.onclick=async()=>{
  start.disabled=true;
  install.hidden=true;
  try{
   const availability=await Recognition.available(options);
   if(disposed)return;
   if(availability==='available'){recognition.start();return}
   if(availability==='downloadable'&&typeof Recognition.install==='function'){
    install.hidden=false;
    show('Installez le module français sur cet appareil pour utiliser la dictée.');
   }else{
    show(availability==='downloading'?'Module français en cours de téléchargement. Réessayez à la fin.':'Dictée locale française indisponible. Utilisez la saisie au clavier ou joignez un fichier.');
   }
  }catch{show('Impossible de démarrer la dictée locale. Vérifiez le microphone ou joignez un fichier.')}
  idle();
 };
 install.onclick=async()=>{
  start.disabled=true;
  install.disabled=true;
  show('Installation du module de dictée français…');
  try{
   const ready=await Recognition.install(options);
   if(disposed)return;
   install.hidden=ready;
   show(ready?'Le module est prêt. Cliquez sur « Démarrer la dictée ».':'Installation incomplète. Vous pouvez joindre un fichier.');
  }catch{show('Installation indisponible dans ce navigateur. Vous pouvez joindre un fichier.')}
  finally{start.disabled=false;install.disabled=false}
 };
 stop.onclick=()=>recognition.stop();
 closeCroDictation=()=>{
  disposed=true;
  recognition.abort();
  closeCroDictation=()=>{};
 };
}
function operativeReport(){
 const stay=p(),saved=stay.cro,write=role==='Chirurgien';
 const announced=publishedSurgery(stay)?.fields;
 const defaultOperation=announced?.procedure||consultData().operation||'';
 const defaultDate=(stay.perop?.records||[]).filter(r=>r.kind==='Événement'&&!r.voided&&r.values.event==='Fin de chirurgie')
  .map(r=>r.at.slice(0,10)).sort().at(-1)||dateKey();
 const initial={operation:defaultOperation,date:defaultDate,text:'',file:null};
 const draft=stay.croDraft||saved||initial;
 const visible=saved?`<section class="cro-saved">
   <div class="row"><h4>${esc(saved.operation||'Compte rendu enregistré')}</h4><span class="pill good">Enregistré</span></div>
   <p>${esc(dischargeRxDate(saved.date))} · ${esc(saved.author)}</p>
   <p class="muted">Enregistré le ${esc(saved.savedAt)}</p>
   ${saved.text?`<p class="preserve cro-text">${esc(saved.text)}</p>`:''}
   ${saved.file?`<button type="button" class="secondary" id="cro-download">Télécharger le fichier joint</button><p class="cro-filename">${esc(saved.file.name)}</p>`:''}
 </section>`:'<p class="muted">Aucun compte rendu enregistré pour ce séjour.</p>';
 $('#content').innerHTML=`<h3>Compte rendu opératoire</h3>
 <p class="muted">${esc(stay.id)} · ${esc(stay.specialty)}. Séjour fictif, texte et fichiers conservés pendant cette session.</p>
 ${write?`<form id="cro-form" class="workflow-form">
   <div class="formgrid">
    ${periField('date','Date de l’intervention','date',draft.date,'required')}
    ${periField('operation','Intervention','text',draft.operation,'maxlength="250"')}
   </div>
   <div class="cro-dictation">
    <div class="actions"><button type="button" class="secondary" id="cro-dictate">Démarrer la dictée</button>
    <button type="button" class="secondary" id="cro-dictate-stop" disabled>Arrêter la dictée</button>
    <button type="button" class="secondary" id="cro-install-language" hidden>Installer le module français</button></div>
    <p class="muted" id="cro-dictate-status" role="status">Dictée en français sur l’appareil.</p>
   </div>
   <label>Texte du compte rendu<textarea name="text" rows="9" maxlength="30000" placeholder="Dictez, saisissez ou collez le compte rendu.">${esc(draft.text)}</textarea></label>
   <label>Joindre un fichier · PDF, Word ou texte, 15 Mo maximum<input name="attachment" type="file" accept=".pdf,.doc,.docx,.txt"></label>
   <div id="cro-selected" class="cro-filename" aria-live="polite"></div>
   <button type="button" id="cro-remove" class="textbutton" hidden>Retirer la pièce jointe</button>
   <p class="warn" id="cro-error" role="alert"></p>
   <button class="primary">Enregistrer le compte rendu</button>
 </form>`:''}
 ${visible}`;
 if(saved?.file)$('#cro-download').onclick=()=>downloadCroFile(saved.file);
 if(!write)return;
 const form=$('#cro-form'),editor=form.elements.namedItem('text'),upload=form.elements.namedItem('attachment');
 const error=$('#cro-error'),remove=$('#cro-remove');
 let attachment=draft.file;
 const values=()=>({
  date:form.elements.namedItem('date').value,
  operation:form.elements.namedItem('operation').value.trim(),
  text:editor.value,file:attachment
 });
 const keepDraft=()=>{stay.croDraft=values()};
 const fileStatus=()=>{
  $('#cro-selected').textContent=attachment?attachment.name:'';
  remove.hidden=!attachment;
 };
 form.oninput=e=>{if(e.target!==upload){error.textContent='';keepDraft()}};
 upload.onchange=()=>{
  const file=upload.files[0];
  if(!file)return;
  error.textContent=validateCroFile(file);
  if(error.textContent){upload.value='';return}
  attachment=file;
  keepDraft();
  fileStatus();
 };
 remove.onclick=()=>{
  attachment=null;
  upload.value='';
  error.textContent='';
  keepDraft();
  fileStatus();
  upload.focus();
 };
 form.onsubmit=e=>{
  e.preventDefault();
  if(role!=='Chirurgien'||p()!==stay)return;
  const data=values();
  data.text=data.text.trim();
  if(!data.date||(!data.text&&!data.file)){
   error.textContent='Indiquez la date et saisissez un texte ou joignez un fichier.';
   return;
  }
  stay.cro={...data,author:activeDoctor==='med-c'?doctorName(activeDoctor):'Chirurgien · profil simulé',savedAt:new Date().toLocaleString('fr-FR')};
  delete stay.croDraft;
  event(saved?'Compte rendu opératoire mis à jour':'Compte rendu opératoire enregistré','Chirurgie');
  detail();
  toast('Compte rendu enregistré dans le dossier de démonstration');
 };
 fileStatus();
 bindCroDictation(editor);
}
let nursingWorkspace=null;
function follow(){
 if(sharedWorkspace){legacyFollow();return}
 nursingWorkspace??=window.createNursingRecord({$,esc,toast,stay:p,access:()=>professionalWorkspace.getAccess(),canWrite:()=>professionalWorkspace.canWrite('stay/'+p().id+'/nursingRecord'),trace:message=>event(message,'Soins infirmiers'),vitals:postopVitals,bindVitals:bindPostopVitals});
 nursingWorkspace.render();
}
function legacyFollow(){const stay=p();$('#content').innerHTML=`<h3>Surveillance postopératoire · SSPI et hospitalisation</h3>${postopVitals(stay)}${nurseProfile()||sharedWorkspace?'':`<form id="noteform"><div class="formgrid"><label>Contexte<select name="context"><option>Transmission</option><option>SSPI</option><option>Visite postopératoire</option><option>Hospitalisation</option><option>Événement à signaler</option></select></label><label>Douleur — valeur saisie, /10<input name="pain" type="number" min="0" max="10" step="1" placeholder="Non renseignée"></label><label class="wide">Observation fictive<textarea name="note" required placeholder="Observation, surveillance ou tâche à transmettre"></textarea></label></div><button class="primary">Enregistrer la transmission</button></form>`}<h3 style="margin-top:26px">Dernières transmissions</h3>${p().notes.length?p().notes.map(n=>`<div class="event"><strong>${esc(n.context)} · ${esc(n.role)}</strong><p>${esc(n.note)}</p><p>${n.pain!==''?'Douleur saisie : '+esc(n.pain)+'/10':''}</p><time>${esc(n.at)}</time></div>`).join(''):'<p class="muted">Aucune transmission saisie.</p>'}`;bindPostopVitals(stay);if($('#noteform'))$('#noteform').onsubmit=e=>{e.preventDefault();if(nurseProfile()||p()!==stay)return;const f=new FormData(e.currentTarget),n={...Object.fromEntries(f),role,at:new Date().toLocaleString('fr-FR')};p().notes.unshift(n);event('Transmission ajoutée : '+n.context,'Suivi');detail();toast('Transmission enregistrée')}}
const rxExecutionStates=['Réalisée','Non réalisée'];
function recordRxExecution(rx,values,actor){
 if(!rx?.validated)return 'La prescription doit être validée par un médecin.';
 const {at,author,status,note,dose,route}=values;
 if(!rxExecutionStates.includes(status)||!at||!Number.isFinite(new Date(at).getTime())||!author?.trim()){
  return 'Renseignez la date, l’heure et l’auteur de la réalisation.';
 }
 if(status==='Non réalisée'&&!note?.trim())return 'Indiquez le motif de la non-réalisation.';
 const administered=status==='Réalisée'&&rx.category==='Médicament';
 if(administered&&(!dose?.trim()||!route?.trim()))return 'Indiquez la dose administrée avec son unité et la voie.';
 const entries=rx.executions??=[];
 if(entries.some(entry=>entry.at===at))return 'Une exécution est déjà tracée à cette date et cette heure.';
 entries.push({at,author:author.trim(),status,note:note?.trim()||'',dose:administered?dose.trim():'',route:administered?route.trim():'',role:actor,recordedAt:new Date().toISOString()});
 return '';
}
function prescriptions(){
 const stay=p(),nurse=nurseProfile();
 const rows=stay.rx.map((rx,index)=>({rx,index})).filter(({rx})=>!nurse||rx.validated);
 $('#content').innerHTML=`<h3>Prescriptions postopératoires</h3>
 <div class="notice">Simulation · ${nurse?'Prescriptions médicales en lecture seule. Tracez chaque réalisation ou non-réalisation.':'La validation médicale et la traçabilité de l’exécution sont enregistrées séparément.'}</div>
 ${physician()?`<form id="rxform" class="workflow-form"><div class="formgrid">
  <label>Libellé de démonstration<input name="name" required></label>
  <label>Catégorie<select name="category">${optionHTML(['Médicament','Examen biologique','Surveillance','Soin infirmier'],'Médicament')}</select></label>
  <label class="wide">Consignes de démonstration<textarea name="instructions" required></textarea></label>
 </div><button class="primary">Ajouter au brouillon</button></form>`:''}
 <div id="rxlist">${rows.map(({rx,index})=>`<article class="rx">
 <div class="row"><strong>${esc(rx.name)}</strong><span class="pill ${rx.validated?'good':'warn'}">${rx.validated?'Validée médicalement · simulation':'Brouillon'}</span></div>
 <p class="muted">${esc(rx.category)} · ${esc(rx.author)}${rx.validatedAt?' · Validée le '+esc(rx.validatedAt):''}</p>
 <p class="preserve">${esc(rx.instructions)}</p>
 ${!rx.validated?`<button class="secondary" data-validate="${index}">Simuler la validation médicale</button>`:`
  <h4>Exécutions tracées</h4>
  ${rx.administered?'<p>Réalisation simulée enregistrée antérieurement.</p>':''}
  ${(rx.executions||[]).map(item=>`<div class="event"><strong>${esc(item.status)} · ${esc(periTime(item.at))}</strong>
   ${item.dose?`<p>${esc(item.dose)} · ${esc(item.route)}</p>`:''}
   <p>${esc(item.author)} · ${esc(item.role)} · Saisie le ${esc(periTime(item.recordedAt))}</p>
   ${item.note?`<p class="preserve">${esc(item.note)}</p>`:''}</div>`).join('')||(!rx.administered?'<p class="muted">Aucune exécution enregistrée.</p>':'')}
  <details class="nurse-execution"><summary>Tracer une exécution</summary>
  <form data-execute="${index}"><div class="formgrid">
   ${periField('at','Date et heure de réalisation ou du constat','datetime-local',periNow(),'required')}
   ${periField('author','Soignant · nom ou initiales fictifs','text','','required maxlength="80"')}
   <label>Statut<select name="status">${optionHTML(rxExecutionStates,'Réalisée')}</select></label>
   ${rx.category==='Médicament'?`${periField('dose','Dose administrée et unité','text','','maxlength="80"')}
   ${periField('route','Voie d’administration','text','','maxlength="80"')}`:''}
   <label class="wide">Commentaire ou motif si non réalisée<textarea name="note" maxlength="1000"></textarea></label>
  </div><p role="alert" class="warn"></p><button class="primary">Enregistrer l’exécution</button></form></details>`}
 </article>`).join('')||'<p class="muted">Aucune prescription disponible pour ce séjour.</p>'}</div>`;
 const draft=$('#rxform');
 if(draft)draft.onsubmit=e=>{
  e.preventDefault();
  if(!physician()||p()!==stay)return;
  const values=Object.fromEntries(new FormData(e.currentTarget));
  values.name=values.name.trim();
  values.instructions=values.instructions.trim();
  if(!values.name||!values.instructions){toast('Renseignez le libellé et les consignes');return}
  stay.rx.push({...values,author:role,validated:false});
  event('Prescription de démonstration ajoutée au brouillon','Prescription');
  detail();
 };
 document.querySelectorAll('[data-validate]').forEach(button=>button.onclick=()=>{
  const rx=stay.rx[Number(button.dataset.validate)];
  if(!physician()||p()!==stay||!rx||rx.validated)return;
  rx.validated=true;
  rx.validatedAt=new Date().toLocaleString('fr-FR');
  event('Validation médicale simulée · '+rx.name,'Prescription');
  detail();
 });
 document.querySelectorAll('[data-execute]').forEach(form=>{
  const status=form.elements.namedItem('status');
  const dose=form.elements.namedItem('dose');
  const route=form.elements.namedItem('route');
  const note=form.elements.namedItem('note');
  const sync=()=>{
   const given=status.value==='Réalisée';
   if(dose){dose.required=given;route.required=given;dose.disabled=!given;route.disabled=!given}
   note.required=!given;
  };
  status.onchange=sync;
  sync();
  form.onsubmit=e=>{
  e.preventDefault();
  if(p()!==stay)return;
  const rx=stay.rx[Number(form.dataset.execute)];
  const values=Object.fromEntries(new FormData(form));
  const error=recordRxExecution(rx,values,role);
  if(error){form.querySelector('[role="alert"]').textContent=error;return}
  event(`Exécution de prescription · ${values.status} · ${rx.name}`,'Soins');
  detail();
  toast('Exécution enregistrée dans le dossier de démonstration');
  };
 });
}
const postopVitalKeys=['sbp','dbp','hr','rr','spo2','temp'];
let surveillanceUi=null;
const postopUi=()=>surveillanceUi??=window.createSurveillancePostop?.({esc})||null;
function postopHistory(ui,records){
 const item=record=>`<article class="event"><strong>${esc(record.values.location)} · ${esc(periTime(record.at))}</strong>
 <p>${esc(ui.decrire(record.values)||periDescription(record))}</p>${ui.alertesHtml(record.values)?`<div class="sp-hist-alerts">${ui.alertesHtml(record.values)}</div>`:''}
 <p class="muted">${esc(record.author)} · ${esc(record.role)} · Saisi le ${esc(periTime(record.created))}${record.photo?' · source photo validée':''}</p></article>`;
 if(!records.length)return '<p class="muted">Aucun relevé postopératoire enregistré.</p>';
 return records.slice(0,4).map(item).join('')+(records.length>4?`<details class="sp-older"><summary>Relevés plus anciens (${records.length-4})</summary>${records.slice(4).map(item).join('')}</details>`:'');
}
function postopVitals(stay){
 const ui=postopUi();
 const records=periSorted(stay.postopVitals||[]).reverse();
 const canWrite=nurseProfile()||role==='Anesthésiste';
 if(ui)return `<section class="workflow-form nurse-vitals sp"><h4>Surveillance postopératoire · graphe</h4>${ui.graph(stay.postopVitals||[])}
 ${canWrite?ui.form({location:stay.stage==='Hospitalisation'||stay.stage==='Sortie'?'Hospitalisation':'SSPI',at:periNow(),author:!sharedWorkspace}):''}
 <h4>Derniers relevés</h4>${postopHistory(ui,records.filter(r=>!r.voided))}</section>`;
 const fields=periVitals.filter(([key])=>postopVitalKeys.includes(key));
 return `<section class="workflow-form nurse-vitals"><h4>Relevé des constantes</h4>
 ${canWrite?`<form id="postop-vitals-form"><div class="formgrid">
 <label>Lieu de surveillance<select name="location">${optionHTML(['SSPI','Hospitalisation'],'SSPI')}</select></label>
 ${periField('at','Date et heure du relevé','datetime-local',periNow(),'required')}
 ${sharedWorkspace?'':periField('author','Soignant · nom ou initiales fictifs','text','','required maxlength="80"')}
 ${fields.map(([key,label,unit])=>periField(key,`${label} (${unit})`,'number','','min="0" step="any"'+(key==='spo2'?' max="100"':''))).join('')}
 ${periField('pain','Douleur (/10)','number','','min="0" max="10" step="1"')}
 </div><p class="warn" role="alert"></p><button class="primary">Enregistrer les constantes</button></form>`:''}
 <h4>Derniers relevés</h4>${records.map(record=>`<article class="event"><strong>${esc(record.values.location)} · ${esc(periTime(record.at))}</strong>
 <p>${esc(periDescription(record))}${record.values.pain!==''?' · Douleur '+esc(record.values.pain)+'/10':''}</p>
 <p class="muted">${esc(record.author)} · ${esc(record.role)} · Saisi le ${esc(periTime(record.created))}</p></article>`).join('')||'<p class="muted">Aucun relevé postopératoire enregistré.</p>'}</section>`;
}
function bindPostopVitals(stay){
 const ui=postopUi();
 ui?.bind(document.querySelector('.nurse-vitals.sp'),()=>stay.postopVitals||[]);
 const form=$('#postop-vitals-form');
 if(!form)return;
 form.onsubmit=e=>{
  e.preventDefault();
  if((!nurseProfile()&&role!=='Anesthésiste')||p()!==stay)return;
  const values=Object.fromEntries(new FormData(form));
  if(typeof values.note==='string')values.note=values.note.trim();
  const uiError=ui?ui.verifier(values):'';
  if(uiError){form.querySelector('[role="alert"]').textContent=uiError;return}
  if(!ui&&values.pain!==''&&(!Number.isInteger(Number(values.pain))||Number(values.pain)<0||Number(values.pain)>10)){
   form.querySelector('[role="alert"]').textContent='La douleur doit être comprise entre 0 et 10.';
   return;
  }
  if(sharedWorkspace)values.author=role;
  const hasMeasurement=ui?ui.renseigne(values):postopVitalKeys.some(key=>values[key]!==''&&values[key]!==undefined)||values.pain!=='';
  const error=hasMeasurement?periValidate('Surveillance',{...values,clinical:'Surveillance'}):'Renseignez au moins une mesure ou une cotation.';
  if(error){form.querySelector('[role="alert"]').textContent=error;return}
  if(sharedWorkspace){
   const fingerprint=JSON.stringify(values);
   if(form.dataset.vitalFingerprint!==fingerprint){
    form.dataset.vitalFingerprint=fingerprint;
    form.dataset.vitalId=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
   }
   sharedMutation(e.submitter,()=>sharedRequest(sharedStayPath(stay,'vitals'),{values,requestId:form.dataset.vitalId}),updated=>{
    Object.assign(stay,{postopVitals:updated.postopVitals,events:updated.events});
    renderSharedDetail();
    toast('Constantes enregistrées sur le serveur de démonstration');
   },message=>{form.querySelector('[role="alert"]').textContent=message});
   return;
  }
  (stay.postopVitals??=[]).push({kind:'Surveillance',at:values.at,author:values.author.trim(),created:new Date().toISOString(),role,values});
  event('Constantes postopératoires saisies · '+values.location,'Soins');
  detail();
  toast('Constantes enregistrées dans le dossier de démonstration');
 };
}
function discharge(){const d=p().discharge,read=!physician()||d.validated;$('#content').innerHTML=`<h3>Synthèse de sortie</h3><div class="actions"><button class="secondary" type="button" id="open-discharge-rx">Ordonnance de sortie</button><button class="secondary" type="button" id="open-discharge-liaison">Lettre de liaison</button></div><form id="dischargeform"><label>Synthèse du séjour<textarea name="summary" ${read?'disabled':''}>${esc(d.summary)}</textarea></label><label>Consignes et suivi prévu<textarea name="instructions" ${read?'disabled':''}>${esc(d.instructions)}</textarea></label><div class="actions"><button class="primary" ${read?'disabled':''} name="action" value="save">Enregistrer la synthèse</button><button class="secondary" ${read?'disabled':''} name="action" value="validate">Simuler la validation de sortie</button></div></form><p class="muted">${d.validated?'Sortie validée dans le scénario. Aucun document médical délivré.':'La validation simulée positionne le séjour à l’étape Sortie.'}</p>`;$('#open-discharge-rx').onclick=()=>{tab='dischargeRx';detail()};$('#open-discharge-liaison').onclick=()=>{tab='dischargeLiaison';detail()};$('#dischargeform').onsubmit=e=>{e.preventDefault();if(read)return;const f=new FormData(e.currentTarget);d.summary=f.get('summary');d.instructions=f.get('instructions');d.validated=e.submitter.value==='validate';if(d.validated)p().stage='Sortie';event(d.validated?'Sortie validée (simulation)':'Synthèse de sortie enregistrée','Sortie');stats();list();detail();toast('Synthèse enregistrée')}}
const dischargePrescriberFields=[
 ['doctor','Nom et prénoms du médecin'],
 ['specialty','Qualité / spécialité'],
 ['rpps','Numéro RPPS fictif','text','inputmode="numeric" maxlength="11" pattern="1[0-9]{10}"'],
 ['facility','Établissement ou service'],
 ['address','Adresse professionnelle (France)'],
 ['phone','Téléphone professionnel (+33)','tel'],
 ['email','E-mail professionnel','email']
];
const dischargePatientFields=[
 ['patient','Nom et prénoms du patient fictif'],
 ['sex','Sexe'],
 ['birth','Date de naissance','date'],
 ['weight','Poids (kg), si nécessaire','number','min="0.1" step="any"',false],
 ['height','Taille (cm), si nécessaire','number','min="1" step="any"',false]
];
const dischargeMedicationFields=[
 ['drug','Médicament ou DCI · dosage et forme'],
 ['dose','Dose par prise'],
 ['route','Voie d’administration'],
 ['frequency','Fréquence / horaires'],
 ['duration','Durée ou quantité à délivrer'],
 ['notes','Consignes / renouvellement','text','',false]
];
function dischargeRxField([key,label,type='text',attrs='',required=true],values,prefix=''){
 return periField(prefix+key,label,type,values[key]||'',(required?'required ':'')+attrs);
}
function dischargeRxDate(date){return date.split('-').reverse().join('/')}
function dischargeRxDoc(stayId,data){
 const d=data.header;
 const show=(label,value)=>value?`<p><strong>${label}</strong> ${esc(value)}</p>`:'';
 return `<article class="discharge-rx-document" aria-label="Aperçu de l’ordonnance">
  <p class="discharge-rx-demo">DÉMONSTRATION · PATIENT FICTIF · DOCUMENT NON DÉLIVRABLE</p>
  <div class="discharge-rx-heading"><div>
   <h3>${esc(d.doctor)}</h3>
   <p>${esc(d.specialty)} · RPPS ${esc(d.rpps)}</p>
   <p>${esc(d.facility)}</p><p>${esc(d.address)}</p>
   <p>${esc(d.phone)} · ${esc(d.email)}</p>
  </div><p>Le ${esc(dischargeRxDate(d.date))}</p></div>
  <h2>Ordonnance de sortie</h2>
  <section class="discharge-rx-patient">
   ${show('Patient',d.patient)}${show('Sexe',d.sex)}${show('Date de naissance',dischargeRxDate(d.birth))}
   ${show('Poids',d.weight&&d.weight+' kg')}${show('Taille',d.height&&d.height+' cm')}
   ${show('Séjour',stayId)}
  </section>
  <ol>${data.items.map(item=>`<li>
   <strong>${esc(item.drug)}</strong>
   <p>${esc([item.dose,item.route,item.frequency].join(' · '))}</p>
   ${show('Durée ou quantité',item.duration)}${show('Consignes',item.notes)}
  </li>`).join('')}</ol>
  <div class="discharge-rx-signature"><strong>${data.signature?'Signature du médecin · spécimen':'Signature manuscrite du médecin'}</strong>
   ${data.signature?`<img src="${esc(data.signature)}" alt="Spécimen de signature fictive">`:''}<p>${esc(d.doctor)}</p></div>
 </article>`;
}
function printDischargeDocument(html){
 const sheet=document.createElement('div');
 sheet.id='discharge-rx-print';
 sheet.innerHTML=html;
 document.body.append(sheet);
 document.body.classList.add('printing-discharge-rx');
 try{window.print()}finally{
  document.body.classList.remove('printing-discharge-rx');
  sheet.remove();
 }
}
function dischargeRx(){
 const stay=p(),saved=stay.discharge.ordinance;
 const write=physician();
 const clinicianRole=role==='Chirurgien'?'Chirurgie':'Anesthésie-réanimation';
 const profile=doctors.find(doctor=>doctor.id===activeDoctor);
 const matched=profile&&(role==='Chirurgien')===(profile.id==='med-c');
 const header=saved?.header||{doctor:matched?profile.name.split(' · ')[0]:'',specialty:clinicianRole,date:dateKey(),patient:[stay.identity?.lastName,stay.identity?.firstName].filter(Boolean).join(' '),birth:stay.identity?.birthDate||'',sex:stay.identity?.sex||''};
 let items=saved?.items.map(item=>({...item}))||[{}];
 const doc=saved?dischargeRxDoc(stay.id,saved):'<p>Aucune ordonnance de sortie préparée pour ce séjour.</p>';
 $('#content').innerHTML=`<h3>Ordonnance de sortie</h3>
 <p class="muted">Utilisez uniquement des données fictives. L’aperçu prévoit une signature manuscrite ou l’ajout d’un spécimen de signature pour la démonstration.</p>
 ${write?`<form id="discharge-rx-form" class="workflow-form">
  <h4>Prescripteur</h4>
  <div class="formgrid">${dischargePrescriberFields.map(field=>dischargeRxField(field,header)).join('')}
  ${dischargeRxField(['date','Date de l’ordonnance','date'],header)}</div>
  <h4>Patient</h4><div class="formgrid">${dischargePatientFields.map(field=>dischargeRxField(field,header)).join('')}</div>
  <h4>Médicaments à prescrire</h4>
  <div id="discharge-rx-items"></div>
  <label>Spécimen de signature fictive (facultatif, PNG ou JPEG, 1 Mo max.)<input type="file" name="signature" accept="image/png,image/jpeg"></label>
  ${saved?.signature?`<label class="check"><input type="checkbox" name="removeSignature">Retirer le spécimen enregistré</label>`:''}
  <div class="actions"><button class="secondary" type="button" id="discharge-rx-add">Ajouter un médicament</button>
  <button class="primary">Enregistrer et afficher l’aperçu</button></div>
  <p id="discharge-rx-error" class="warn" role="alert"></p>
 </form>`:''}
 <section class="discharge-rx-preview"><h4>Aperçu imprimable</h4>
  ${write&&saved?'<button class="primary" id="print-discharge-rx" type="button">Imprimer l’ordonnance</button>':''}
  ${doc}
 </section>`;
 if(!write)return;
 const form=$('#discharge-rx-form'),preview=$('.discharge-rx-preview');
 const readItems=()=>{
  const values=new FormData(form);
  return items.map((_,index)=>Object.fromEntries(dischargeMedicationFields.map(([key])=>[key,String(values.get(`rx-${index}-${key}`)||'').trim()])));
 };
 const invalidatePreview=()=>{if(saved)preview.hidden=true};
 function renderItems(){
  $('#discharge-rx-items').innerHTML=items.map((item,index)=>`<fieldset class="discharge-rx-line">
  <legend>Médicament ${index+1}</legend>
  <div class="formgrid">${dischargeMedicationFields.map(field=>dischargeRxField(field,item,`rx-${index}-`)).join('')}</div>
  ${items.length>1?`<button type="button" class="textbutton" data-remove-discharge-rx="${index}">Retirer ce médicament</button>`:''}
  </fieldset>`).join('');
  form.querySelectorAll('[data-remove-discharge-rx]').forEach(button=>button.onclick=()=>{
   items=readItems();
   const index=Number(button.dataset.removeDischargeRx);
   items.splice(index,1);
   invalidatePreview();
   renderItems();
   form.elements.namedItem(`rx-${Math.min(index,items.length-1)}-drug`).focus();
  });
 }
 renderItems();
 $('#discharge-rx-add').onclick=()=>{
  items=[...readItems(),{}];
  invalidatePreview();
  renderItems();
  form.elements.namedItem(`rx-${items.length-1}-drug`).focus();
 };
 form.oninput=invalidatePreview;
 form.onsubmit=async e=>{
  e.preventDefault();
  if(!physician()||p()!==stay)return;
  const values=new FormData(form);
  const fields=[...dischargePrescriberFields,...dischargePatientFields,['date']];
  const data={header:Object.fromEntries(fields.map(([key])=>[key,String(values.get(key)||'').trim()])),items:readItems()};
  const missing=(definitions,group)=>definitions.some(([key,,,,required=true])=>required&&!group[key]);
  const error=$('#discharge-rx-error');
  if(missing(fields,data.header)||data.items.some(item=>missing(dischargeMedicationFields,item))){
   error.textContent='Renseignez les champs obligatoires du prescripteur, du patient et de chaque médicament.';
   return;
  }
  if(!/^1[0-9]{10}$/.test(data.header.rpps)){
   error.textContent='Le RPPS doit comporter 11 chiffres et commencer par 1.';
   return;
  }
  if(stay.identityReviewRequired?.ordinance){
   const identity=stay.identity||{},expected=normalizePatientName([identity.lastName,identity.firstName].filter(Boolean).join(' '));
   if(normalizePatientName(data.header.patient)!==expected||data.header.birth!==identity.birthDate||(identity.sex&&data.header.sex!==identity.sex)){
    error.textContent='L’identité a été corrigée. Reportez le nom, le prénom, la date de naissance et le sexe actuels du dossier avant de réenregistrer.';return;
   }
  }
  const signature=values.get('signature');
  if(signature?.size&&!values.get('removeSignature')){
   if(!['image/png','image/jpeg'].includes(signature.type)||signature.size>1_048_576){
    error.textContent='Choisissez une image PNG ou JPEG de 1 Mo maximum.';
    return;
   }
   const submit=e.submitter;
   if(submit)submit.disabled=true;
   try{
    data.signature=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onload=()=>resolve(reader.result);
     reader.onerror=reject;
     reader.readAsDataURL(signature);
    });
   }catch{
    error.textContent='Le fichier de signature n’a pas pu être lu.';
    return;
   }finally{
    if(submit)submit.disabled=false;
   }
  }else if(!values.get('removeSignature')&&saved?.signature){
   data.signature=saved.signature;
  }
  if(!physician()||p()!==stay||$('#discharge-rx-form')!==form)return;
  stay.discharge.ordinance=data;
  if(stay.identityDocumentReview)stay.identityDocumentReview.ordinance=false;
  event('Ordonnance de sortie préparée · '+data.header.doctor,'Sortie');
  detail();
  $('#print-discharge-rx').focus();
 };
 const print=$('#print-discharge-rx');
 if(print)print.onclick=()=>{if(physician()&&p()===stay&&!preview.hidden)printDischargeDocument(dischargeRxDoc(stay.id,saved))};
}
// Rubriques, destinataires et envoi automatique : lettre-liaison-regles.js (partagé avec le serveur).
const LL=window.IaseloLettreLiaison,liaisonSections=LL.SECTIONS;
const liaisonFields=liaisonSections.flatMap(([,fields])=>fields);
function liaisonPrefill(stay,consult,announcement){
 const identity=stay.questionnaire?.answers||{},rx=stay.discharge.ordinance,head=rx?.header||{};
 const operation=announcement?.procedure||consult.operation;
 const acts=[stay.cro?.operation,stay.cro?.text].filter(Boolean).join('\n');
 return {
  birthname:stay.identity?.birthName||stay.identity?.lastName||identity.birthname||'',firstname:stay.identity?.birthFirstNames||stay.identity?.firstName||identity.firstname||'',dob:stay.identity?.birthDate||identity.dob||head.birth||'',
  sex:stay.identity?.sex||head.sex||(['Femme','Homme'].includes(consult.sex)?consult.sex:''),
  facility:head.facility||'Clinique du Trocadéro',unit:stay.specialty,doctor:head.doctor||'',
  contact:[head.phone,head.email,head.address].filter(Boolean).join(' · '),rpps:head.rpps||'',
  reason:[operation,announcement?.indication||consult.operationDetails].filter(Boolean).join(' · '),
  summary:stay.discharge.summary||'',procedures:acts,
  blood:(stay.perop?.records||[]).filter(r=>!r.voided&&r.kind==='Bilan hydrique'&&r.values.fluid==='Produit sanguin administré')
   .map(r=>periDescription(r)).join('\n'),
  medications:(rx?.items||[]).map(item=>[item.drug,item.dose,item.frequency,item.route,item.duration,item.notes].filter(Boolean).join(' · ')).join('\n'),
  followup:stay.discharge.instructions||'',
  patientEnvoi:LL.PATIENT_ENVOI[0]
 };
}
function liaisonMissing(values,mode,today){
 const errors=liaisonFields.filter(([key,,,required])=>required&&!values[key]).map(([,label])=>label);
 if(values.gpStatus==='Déclaré'&&(!values.gpName||!values.gpContact))errors.push('Nom et coordonnées du médecin traitant');
 if(mode==='Ambulatoire'&&!values.urgentPhone)errors.push('Téléphone à contacter en cas d’urgence');
 if(values.departure&&values.admission>values.departure)errors.push('Vérifier l’ordre des dates d’entrée et de sortie');
 if(values.departure>today)errors.push('Confirmer la date de sortie effective');
 errors.push(...LL.controlerDiffusion(values));
 return errors;
}
function liaisonDocument(stay,letter){
 const values=letter.values;
 return `<article class="discharge-rx-document liaison-document">
  <p class="discharge-rx-demo">DÉMONSTRATION · PATIENT FICTIF</p>
  <div class="discharge-rx-heading"><div><strong>${esc(values.facility)}</strong><p>${esc(values.unit)}</p></div>
  <p>Rédigée le ${esc(dischargeRxDate(letter.date))}</p></div>
  <h2>Lettre de liaison à la sortie</h2><p>${esc(stay.id)} · ${esc(stay.mode)}</p>
  ${liaisonSections.map(([title,fields])=>`<section><h3>${esc(title)}</h3>${fields.filter(([key])=>values[key]&&!LL.DIFFUSION.has(key)).map(([key,label,type])=>
   `<div><strong>${esc(label)}</strong><p class="preserve">${esc(type==='date'?dischargeRxDate(values[key]):values[key])}</p></div>`).join('')}</section>`).join('')}
  <div class="discharge-rx-signature"><strong>Signature du médecin</strong><p>${esc(values.doctor)}</p></div>
 </article>`;
}
function liaisonDelivery(letter,write=physician()){
 const trace=letter.delivery||{};
 return `<section class="liaison-delivery"><h4>Remise en main propre et autres transmissions</h4>
  <p class="muted">Les envois électroniques sont tracés automatiquement ci-dessus. Tracez ici la remise de la lettre imprimée et toute transmission par un autre canal. Ce formulaire n’envoie aucun document.</p>
  ${trace.patientStatus||trace.gpDelivery?`<p class="preserve">${esc([
   trace.patientStatus&&['Patient',trace.patientStatus,trace.patientDate&&dischargeRxDate(trace.patientDate),trace.patientReason].filter(Boolean).join(' · '),
   trace.gpDelivery&&['Destinataires',trace.gpDelivery,trace.sentDate&&dischargeRxDate(trace.sentDate),trace.gpDetail].filter(Boolean).join(' · ')
  ].filter(Boolean).join('\n'))}</p>`:''}
  ${write?`<form id="liaison-delivery" class="workflow-form"><div class="formgrid">
   ${liaisonField(['patientStatus','Remise au patient','select',false,['Remise','Refus du patient','Non remise justifiée']],trace)}
   ${liaisonField(['patientDate','Date de remise ou du constat','date'],trace)}
   ${liaisonField(['patientReason','Motif si non remise'],trace)}
   ${liaisonField(['gpDelivery','Transmission au médecin traitant et, si applicable, à l’adresseur','select',false,['Envoyée par canal sécurisé','Refus du patient','Aucun destinataire déclaré']],trace)}
   ${liaisonField(['sentDate','Date d’envoi','date'],trace)}
   ${liaisonField(['gpDetail','Destinataires, canal ou justification'],trace)}
  </div><p role="alert" class="warn liaison-error"></p><button class="secondary">Enregistrer la traçabilité</button></form>`:''}
 </section>`;
}
function liaisonField([key,label,type='text',required=false,options],values){
 const value=values[key]||'';
 if(type==='textarea')return `<label class="wide">${esc(label)}${required?' *':''}<textarea name="${key}" rows="3">${esc(value)}</textarea></label>`;
 if(type==='select')return `<label>${esc(label)}${required?' *':''}<select name="${key}"><option value="">Choisir</option>${optionHTML(options,value)}</select></label>`;
 return periField(key,label+(required?' *':''),type,value);
}
function dischargeLiaison(){
 const stay=p(),write=physician(),letter=stay.discharge.liaison;
 const prefill=liaisonPrefill(stay,consultData(),publishedSurgery(stay)?.fields);
 const source=JSON.stringify(prefill),current=letter?.document;
 const stale=current&&current.source!==source;
 const values=letter?.draft||current?.values||prefill;
 const preview=current?liaisonDocument(stay,current):'<p class="muted">Aucune lettre relue pour ce séjour.</p>';
 $('#content').innerHTML=`<h3>Lettre de liaison à la sortie</h3>
  <p class="muted">Le brouillon reprend les éléments disponibles du dossier. Vérifiez-les et complétez les rubriques marquées d’un astérisque. Pour une rubrique sans objet, indiquez-le explicitement.</p>
  ${stale?'<p class="notice warn">Le dossier a changé depuis la dernière relecture. Comparez les informations et relisez la lettre avant une nouvelle impression.</p>':''}
  ${write?`<form id="liaison-form" class="workflow-form">
   ${liaisonSections.map(([title,fields])=>`<fieldset class="liaison-fields"><legend>${esc(title)}</legend><div class="formgrid">${fields.map(field=>liaisonField(field,values)).join('')}</div></fieldset>`).join('')}
   <p class="muted">La date de rédaction est enregistrée lors de la relecture. La HAS évalue la rédaction, la remise au patient et la transmission au médecin traitant le jour de la sortie.</p>
   <p class="muted">En ambulatoire, le numéro à appeler en cas d’urgence est également attendu.</p>
   <details><summary>Consulter les éléments actuellement disponibles dans le dossier</summary><dl class="answers">${liaisonFields.filter(([key])=>prefill[key]).map(([key,label])=>`<div class="answer"><dt>${esc(label)}</dt><dd class="preserve">${esc(prefill[key])}</dd></div>`).join('')}</dl>
   <button type="button" class="secondary" id="liaison-fill">Compléter les champs encore vides</button></details>
   <div id="liaison-apercu"></div>
   <p id="liaison-error" class="warn liaison-error" role="alert"></p>
   <div class="actions"><button class="secondary" name="liaisonAction" value="draft">Enregistrer le brouillon</button>
   <button class="primary" name="liaisonAction" value="review">Valider la relecture et envoyer</button></div>
  </form>`:''}
  <section id="liaison-preview">
   ${current&&current.date!==current.values.departure?'<p class="notice warn">La lettre a été rédigée après la date de sortie renseignée.</p>':''}
   ${write&&current&&!stale&&!letter.draft?'<button class="primary no-print" type="button" id="liaison-print">Imprimer la lettre de liaison</button>':''}
   ${current?'<div id="liaison-diffusion" class="no-print"></div>':''}
   ${preview}
   ${current?liaisonDelivery(current):''}
   ${letter?.previous?.length?`<details><summary>Versions précédentes (${letter.previous.length})</summary>${letter.previous.map(document=>liaisonDocument(stay,document)+liaisonDelivery(document,false)).join('')}</details>`:''}
  </section>
  <p class="muted no-print"><a href="https://www.has-sante.fr/jcms/p_3587797/fr/iqss-2025-secteur-mco-fiche-descriptive-de-l-indicateur-qualite-de-la-lettre-de-liaison-a-la-sortie-janvier-2025" target="_blank" rel="noopener noreferrer">Critères HAS MCO</a> · <a href="https://www.has-sante.fr/jcms/p_3893099/fr/iqss-2026-ca-consignes-de-remplissage-dossier-du-patient-en-chirurgie-ambulatoire-en-mco-mars-2026" target="_blank" rel="noopener noreferrer">Critères HAS ambulatoire 2026</a></p>`;
 const ecran=window.IaseloLettreLiaisonEcran;
 if(current)ecran?.suivi($('#liaison-diffusion'),stay,{canRelaunch:write,toast});
 if(!write)return;
 const form=$('#liaison-form'),print=$('#liaison-print');
 ecran?.apercu($('#liaison-apercu'),stay,form);
 const editing=()=>{if(print)print.hidden=true};
 form.oninput=editing;
 $('#liaison-fill').onclick=()=>{
  for(const [key,value] of Object.entries(prefill)){
   const field=form.elements.namedItem(key);
   if(field&&value&&!field.value.trim())field.value=value;
  }
  editing();
 };
 form.onsubmit=e=>{
  e.preventDefault();
  if(!physician()||p()!==stay)return;
  const data=Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,value.trim()]));
  const state=stay.discharge.liaison??={};
  if(e.submitter?.value!=='review'){
   state.draft=data;
   detail();
   toast('Brouillon de liaison enregistré');
   return;
  }
  if(stay.identityReviewRequired?.liaison){
   const identity=stay.identity||{};
   if(normalizePatientName(data.birthname)!==normalizePatientName(identity.birthName||identity.lastName)||normalizePatientName(data.firstname)!==normalizePatientName(identity.birthFirstNames||identity.firstName)||data.dob!==identity.birthDate||(identity.sex&&data.sex!==identity.sex)){
    $('#liaison-error').textContent='Reportez les traits d’identité corrigés du dossier avant la nouvelle relecture de la lettre.';return;
   }
  }
  const today=dateKey(),missing=liaisonMissing(data,stay.mode,today);
  if(missing.length){$('#liaison-error').textContent='À compléter ou vérifier · '+missing.join(' · ');return}
  const revised=current&&(current.source!==source||current.date!==today||
   liaisonFields.some(([key])=>(current.values[key]||'')!==(data[key]||'')));
  if(revised)(state.previous??=[]).unshift(current);
  state.document={values:data,source,date:today,delivery:revised?undefined:current?.delivery};
  if(stay.identityDocumentReview)stay.identityDocumentReview.liaison=false;
  delete state.draft;
  event('Lettre de liaison de sortie relue et enregistrée · envoi automatique','Sortie');
  detail();
  $('#liaison-print')?.focus();
 };
 if(print)print.onclick=()=>{if(physician()&&p()===stay&&!print.hidden)printDischargeDocument(preview)};
 const delivery=$('#liaison-delivery');
 if(delivery)delivery.onsubmit=e=>{
  e.preventDefault();
  if(!physician()||p()!==stay||stay.discharge.liaison?.document!==current)return;
  const data=Object.fromEntries([...new FormData(delivery)].map(([key,value])=>[key,value.trim()]));
  const error=delivery.querySelector('[role="alert"]');
  if((data.patientStatus&&!data.patientDate)||(data.patientStatus&&data.patientStatus!=='Remise'&&!data.patientReason)){
   error.textContent='Indiquez la date et, en cas de non-remise, le motif.';
   return;
  }
  if(data.gpDelivery==='Envoyée par canal sécurisé'&&(!data.sentDate||!data.gpDetail)){
   error.textContent='Indiquez la date, les destinataires et le canal de transmission.';
   return;
  }
  if(data.gpDelivery==='Refus du patient'&&!data.gpDetail){
   error.textContent='Précisez le refus dans le champ Destinataires, canal ou justification.';
   return;
  }
  if(data.patientDate>dateKey()||data.sentDate>dateKey()){
   error.textContent='Renseignez uniquement des actions déjà réalisées ou des constats déjà faits.';
   return;
  }
  current.delivery=data;
  event('Traçabilité de remise ou d’envoi de la lettre mise à jour','Sortie');
  detail();
 };
}
function history(){$('#content').innerHTML=`<h3>Historique du scénario</h3><p class="muted">Événements métier du dossier fictif. Consultez aussi les versions serveur pour connaître les enregistrements persistants. Ce journal métier n’est pas un journal d’audit sécurisé.</p>${p().events.map(n=>`<div class="event"><strong>${esc(n.kind)} · ${esc(n.role)}</strong><p>${esc(n.text)}</p><time>${esc(n.at)}</time></div>`).join('')}`}
function renderTasks(){$('#workspace').innerHTML=`<section class="panel"><div class="panelhead"><h2>Actions par séjour</h2><p class="muted">Cochez une action pour tester le suivi de l’équipe.</p></div><div class="content">${patients.map(x=>`<div class="task"><input type="checkbox" aria-label="Action réalisée pour ${x.id}" data-done="${x.id}" ${x.done?'checked':''}><div><strong>${esc(x.task)}</strong><div class="muted">${x.id} · ${x.specialty} · ${x.stage}</div></div><button class="secondary" data-open="${x.id}">Ouvrir le séjour</button></div>`).join('')}</div></section>`;document.querySelectorAll('[data-done]').forEach(b=>b.onchange=()=>{const x=patients.find(p=>p.id===b.dataset.done);x.done=b.checked;x.events.unshift({at:new Date().toLocaleString('fr-FR'),role,text:x.done?'Action réalisée':'Action rouverte',kind:'Action'});stats();toast('Statut de l’action mis à jour')});document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.open;view='patients';tab='history';render()})}
document.querySelectorAll('.nav[data-view]').forEach(b=>b.onclick=()=>{if(view==='patients'&&tab==='consult')captureConsult();view=b.dataset.view;render()});$('#role').onchange=e=>{if(tab==='consult')captureConsult();role=e.target.value;if(role==='Chirurgien'||nurseProfile()){tab=nurseProfile()?'follow':'surgeryAnnouncement';view='patients'}render();toast('Profil simulé : '+role)};$('#new').onclick=()=>{if(!nurseProfile()){const fields=$('#new-fictitious-identity');if(fields&&!fields.children.length)fields.innerHTML=patientIdentityFields();$('#modal').showModal()}};$('#close').onclick=()=>$('#modal').close();$('#newform').onsubmit=e=>{e.preventDefault();if(nurseProfile())return;const {lastName='',firstName='',birthDate='',...fields}=Object.fromEntries(new FormData(e.currentTarget));const x={id:'DÉMO-'+crypto.randomUUID().slice(0,12),...fields,identity:{lastName:lastName.trim(),firstName:firstName.trim(),birthDate},task:'Dossier à compléter',done:false,consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},events:[{at:new Date().toLocaleString('fr-FR'),role,text:'Séjour fictif créé',kind:'Dossier'}]};patients.unshift(x);selected=x.id;filter='Tous';query='';tab=role==='Chirurgien'?'surgeryAnnouncement':'consult';view='patients';e.currentTarget.reset();$('#modal').close();render();toast('Séjour fictif créé')};
if(document.modelContext?.registerTool){const lifetime=new AbortController();const tools=[{name:'list_demo_stays',title:'Lister les séjours fictifs',description:'Retourne les séjours de démonstration de la session. Lecture seule.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return patients.map(({id,specialty,stage,done})=>({id,specialty,stage,done}))}},{name:'open_demo_stay',title:'Ouvrir un séjour fictif',description:'Affiche un séjour de démonstration existant dans le dossier de consultation.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},execute(input){if(!input||typeof input.id!=='string'||!patients.some(x=>x.id===input.id))throw new Error('Séjour fictif introuvable');selected=input.id;view='patients';tab='consult';render();return {id:selected,view,tab}}}];for(const t of tools){try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifetime.signal})).catch(()=>{})}catch{}}window.addEventListener('pagehide',()=>lifetime.abort(),{once:true})}

'use strict';
const patientStandalone=document.body?.dataset?.patientPage==='true';
let patientStep=0, patientTarget='DÉMO-001';
if(patientStandalone)view='portal';
const patientDrafts={};
const invitation=patientStandalone?new URLSearchParams(location.hash.slice(1)).get('invitation'):null;
const diseaseGroups=[
 ['cardiac','Problèmes cardiaques',['Insuffisance cardiaque','Infarctus ou stent','Trouble du rythme']],
 ['vascular','Problèmes vasculaires',['Hypertension artérielle','Phlébite ou embolie pulmonaire','Artérite']],
 ['digestive','Problèmes digestifs et urinaires',['Reflux ou hernie hiatale','Ulcère gastrique','Adénome de prostate']],
 ['respiratory','Problèmes respiratoires',['Asthme','Bronchite chronique','Apnée du sommeil']],
 ['neurological','Problèmes neurologiques',['AVC','Épilepsie','Troubles psychiques']],
 ['endocrine','Problèmes endocriniens',['Diabète','Anomalie de la thyroïde','Insuffisance rénale']],
 ['rare','Maladies rares',['Myopathie','Myasthénie','Porphyrie']]
];
const bleedingQuestions=['Maladie hémorragique dans la famille proche (hémophilie, maladie de Willebrand, autres)','Saignements prolongés (nez, gencives, autres) ayant nécessité une consultation','Hématomes de plus de 2 cm sans choc ou importants après un choc mineur','Saignement prolongé après extraction dentaire','Saignement important après une chirurgie mineure (amygdales, circoncision…)','Saignement gynécologique inhabituel ayant nécessité une consultation','Hémorragie lors d’un accouchement'];
const patientPages=['Identité et antécédents','Santé et traitements'];
const patientLabels={signedDate:'Date de confirmation',signature:'Nom saisi pour confirmation',birthname:'Nom de naissance fictif',firstname:'Prénom fictif',usename:'Nom d’usage fictif',dob:'Date de naissance fictive',weight:'Poids (kg)',height:'Taille (cm)',operation:'Intervention',date:'Date prévue',allergy:'Allergies',allergyDetails:'Produit et réaction',operations:'Opérations et dates',anesthesia:'Problème lié à une anesthésie (vous ou votre famille)',anesthesiaDetails:'Précisions sur l’anesthésie',nausea:'Nausées ou vomissements après anesthésie',travel:'Mal des transports',hospital:'Hospitalisation hors chirurgie',hospitalDetails:'Motif des hospitalisations',diseases:'Maladies déclarées',other:'Autres problèmes de santé',teeth:'Dents mobiles ou refaites',stairs:'Étages montés sans arrêt',devices:'Prothèses et dispositifs',bleeding:'Antécédents de saignement',treatments:'Traitements : nom, dosage, horaires',tobacco:'Tabac',cigarettes:'Cigarettes par jour',years:'Années de tabagisme',alcohol:'Verres d’alcool par jour',drugs:'Drogues',drugDetails:'Précisions',questions:'Questions pour l’anesthésiste'};
const medicationColumns=['Nom du médicament','Dosage','Matin','Midi','Soir'];
const medicationLimit=10;

function patientValue(key){
 return patientDrafts[patientTarget]?.[key]??'';
}
function pf(key,label,type='text',required=false){
 const bounds=type==='number'?' min="0" step="any"':'';
 return `<label>${label}<input name="${key}" type="${type}" value="${esc(patientValue(key))}"${bounds}${required&&invitation?' required':''}></label>`;
}
function pt(key,label){
 return `<label>${label}<textarea name="${key}" rows="2">${esc(patientValue(key))}</textarea></label>`;
}
function choices(key,items,groupLabel){
 return `<div class="pq-choices" role="group" aria-label="${esc(groupLabel)}">${items.map(value=>`<label><input type="radio" name="${key}" value="${esc(value)}" ${patientValue(key)===value?'checked':''}> ${esc(value)}</label>`).join('')}</div>`;
}
function yesNoPatient(key,label){
 return choices(key,['Oui','Non','Je ne sais pas'],label);
}
function checks(key,items){
 const selected=patientValue(key);
 return items.map(value=>`<label class="pq-check"><input name="${key}" type="checkbox" value="${esc(value)}" ${selected.includes(value)?'checked':''}> <span>${esc(value)}</span></label>`).join('');
}
function question(number,label,body){
 return `<fieldset class="pq-question"><legend><span class="pq-number">${number}</span>${label}</legend>${body}</fieldset>`;
}
function initialPatientPage(){
 return `<p>Avant votre intervention, vous rencontrerez un médecin anesthésiste-réanimateur. Il préparera avec vous l’anesthésie et les traitements avant et après l’intervention, vous informera et répondra à vos questions.</p>
 <div class="pq-bring"><h4>À apporter à la consultation, si vous les avez</h4><ul>
 <li>Vos courriers et examens de spécialistes (cardiologue, pneumologue…)</li>
 <li>Vos résultats de prise de sang et votre carte de groupe sanguin</li>
 <li>Vos ordonnances de médicaments</li></ul></div>
 <p class="pq-instruction">Remplissez ce questionnaire avant la consultation. Si besoin, faites-vous aider par un proche ou votre médecin traitant.</p>
 <fieldset class="pq-box pq-identity"><legend>Identité et intervention</legend>
 <div class="pq-grid">${pf('birthname','Nom de naissance fictif','text',true)}${pf('firstname','Prénom fictif','text',true)}
 ${pf('usename','Nom d’usage fictif')}${pf('dob','Date de naissance fictive','date',true)}
 ${pf('weight','Poids (kg)','number')}${pf('height','Taille (cm)','number')}${pf('operation','Intervention prévue')}${pf('date','Prévue le','date')}</div></fieldset>
 <fieldset class="pq-box pq-allergy"><legend>Allergies</legend>
 <p>Avez-vous déjà eu une réaction allergique (urticaire, œdème…) à un médicament, un antibiotique ou un aliment ?</p>
 ${yesNoPatient('allergy','Avez-vous des allergies ?')}${pt('allergyDetails','Précisez le produit et la réaction')}</fieldset>
 ${question(1,'De quoi avez-vous déjà été opéré ?',pt('operations','Indiquez les opérations et leurs dates'))}
 ${question(2,'Vous ou un membre de votre famille avez-vous déjà rencontré un problème lié à l’anesthésie ?',yesNoPatient('anesthesia','Problème lié à l’anesthésie')+pt('anesthesiaDetails','Précisez le problème'))}
 ${question(3,'Êtes-vous sujet aux problèmes suivants ?',`<div class="pq-grid"><div><p>Nausées ou vomissements après une anesthésie</p>${yesNoPatient('nausea','Nausées ou vomissements après une anesthésie')}</div><div><p>Mal des transports</p>${yesNoPatient('travel','Mal des transports')}</div></div>`)}
 ${question(4,'Avez-vous déjà été hospitalisé en dehors d’une opération ?',yesNoPatient('hospital','Hospitalisation hors chirurgie')+pt('hospitalDetails','Si oui, pour quelle raison ?'))}`;
}
function medicationRow(d,index){
 return `<tr>${medicationColumns.map((label,column)=>`<td><label><span>${label}</span><input aria-label="${label} · traitement ${index+1}" name="med-${index}-${column}" value="${esc(d.medRows?.[index]?.[column]||'')}"></label></td>`).join('')}</tr>`;
}
function medTable(d){
 const count=Math.max(3,d.medRows?.findLastIndex(row=>row.some(Boolean))+1||0);
 return `<fieldset class="pq-box pq-medications"><legend>Traitements actuels</legend>
 <p>Indiquez vos traitements dans le tableau et apportez votre ordonnance à la consultation.</p>
 <table><thead><tr>${medicationColumns.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead>
 <tbody>${Array.from({length:count},(_,index)=>medicationRow(d,index)).join('')}</tbody></table>
 <button type="button" class="secondary" id="patient-add-med" ${count>=medicationLimit?'hidden':''}>Ajouter un médicament</button></fieldset>`;
}
function finalPatientPage(d){
 const diseaseCards=diseaseGroups.map(([color,label,items])=>`<fieldset class="pq-category pq-${color}"><legend>${label}</legend>${checks('diseases',items)}</fieldset>`).join('');
 return `${question(5,'Avez-vous déjà rencontré les problèmes de santé suivants ?',`<div class="pq-diseases">${diseaseCards}</div>`+pt('other','Autres problèmes de santé à signaler'))}
 ${question(6,'Avez-vous des dents refaites, remplacées, déchaussées ou qui bougent ?',yesNoPatient('teeth','État des dents'))}
 ${question(7,'Combien d’étages pouvez-vous monter sans vous arrêter ?',choices('stairs',['Aucun','1 étage','2 étages','3 étages ou plus','Je ne sais pas'],'Étages montés sans s’arrêter'))}
 ${question(8,'Avez-vous une prothèse ou un dispositif médical ?',`<div class="pq-grid">${checks('devices',['Prothèse dentaire','Prothèse auditive','Pacemaker ou défibrillateur','Ventilation nocturne'])}</div>`)}
 ${question(9,'Consommez-vous les substances suivantes ?',`<div class="pq-habits"><div><p>Tabac</p>${yesNoPatient('tobacco','Tabac')}<div class="pq-grid">${pf('cigarettes','Cigarettes par jour','number')}${pf('years','Depuis combien d’années ?','number')}</div></div>
 <div>${pf('alcohol','Alcool (verres par jour)','number')}</div><div><p>Drogues</p>${yesNoPatient('drugs','Drogues')}${pt('drugDetails','Précisions éventuelles')}</div></div>`)}
 ${question(10,'Avez-vous déjà présenté les problèmes de saignement suivants ?',checks('bleeding',bleedingQuestions))}
 ${medTable(d)}
 ${pt('questions','Vos questions pour l’anesthésiste')}
 <fieldset class="pq-box pq-signature"><legend>Date et signature</legend>
 <div class="pq-grid">${pf('signedDate','Date','date',true)}${pf('signature','Nom et prénom pour confirmer (fictifs)','text',true)}</div>
 <label class="pq-check"><input name="confirmed" type="checkbox" ${d.confirmed==='on'?'checked':''} required> Je confirme les réponses de ce scénario fictif.</label></fieldset>`;
}

function savePatientDraft(form){
 const fields=new FormData(form);
 const draft=patientDrafts[patientTarget]||{};
 for(const [key,value] of fields){
  if(!key.startsWith('med-'))draft[key]=value;
 }
 for(const key of ['diseases','devices','bleeding']){
  if(form.querySelector(`[name="${key}"]`))draft[key]=fields.getAll(key);
 }
 if(form.querySelector('[name="confirmed"]'))draft.confirmed=fields.get('confirmed')||'';
 if(form.querySelector('[name="med-0-0"]')){
  draft.medRows=Array.from({length:medicationLimit},(_,i)=>medicationColumns.map((_,j)=>String(fields.get(`med-${i}-${j}`)||'').trim()));
  draft.treatments=draft.medRows.filter(row=>row.some(Boolean)).map(row=>['Médicament',...medicationColumns.slice(1)].map((label,j)=>row[j]?`${label} : ${row[j]}`:'').filter(Boolean).join(' · ')).join('\n');
 }
 patientDrafts[patientTarget]=draft;
}
// Dates du questionnaire affichées au format français (jj/mm/aaaa), jamais en ISO brut.
function frDate(v){const s=String(v??'');if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const [y,m,d]=s.split('-');return d+'/'+m+'/'+y}if(/^\d{4}-\d{2}-\d{2}T/.test(s)){const t=new Date(s);if(!isNaN(t))return t.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(' ',' à ')}return s}
function rawSummary(d){return Object.entries(patientLabels).filter(([k])=>d[k]&&(!Array.isArray(d[k])||d[k].length)).map(([k,label])=>`<div class="answer"><dt>${label}</dt><dd>${esc(Array.isArray(d[k])?d[k].join(', '):frDate(d[k]))}</dd></div>`).join('')}

function renderPortal(){
 $('#new').hidden=true;
 $('#stats').hidden=true;
 const draft=patientDrafts[patientTarget]||{};
 const submitted=patients.find(x=>x.id===patientTarget)?.questionnaire;
 const lastPage=patientStep===patientPages.length-1;
 $('#workspace').innerHTML=`<section class="panel pq-portal" aria-label="Questionnaire médical">
 <div class="pq-meta"><div class="pq-demo">Démonstration · données fictives uniquement</div>
 ${!patientStandalone?`<label>Séjour de démonstration<select id="patienttarget">${patients.map(x=>`<option value="${x.id}" ${x.id===patientTarget?'selected':''}>${x.id} · ${x.specialty}</option>`).join('')}</select></label>`:''}
 ${submitted?`<p>Questionnaire déjà reçu dans le dossier de démonstration · ${submitted.reviewed?'revu par l’anesthésiste':'à vérifier'}.</p>`:''}</div>
 <form id="patientform" class="pq-form">
 <div class="pq-heading"><h2 tabindex="-1" id="patient-page-title">Questionnaire médical</h2><span>Page ${patientStep+1} sur ${patientPages.length}</span></div>
 <h3 class="pq-page-label">${patientPages[patientStep]}</h3>
 ${lastPage?finalPatientPage(draft):initialPatientPage()}
 <div class="actions pq-actions">
 ${lastPage?'<button type="button" class="secondary" id="previous">Page précédente</button>':''}
 <button type="button" class="secondary" id="draft">Garder le brouillon de session</button>
 <button class="primary" type="submit">${lastPage?(invitation?'Transmettre le questionnaire fictif':'Simuler l’envoi'):'Page suivante'}</button>
 </div></form></section>`;
 const form=$('#patientform');
 const target=$('#patienttarget');
 const addMedication=$('#patient-add-med');
 if(target)target.onchange=()=>{
  savePatientDraft(form);
  patientTarget=target.value;
  openPatientPage(0);
 };
 if(addMedication)addMedication.onclick=()=>{
  const table=form.querySelector('.pq-medications tbody');
  const index=table.rows.length;
  if(index>=medicationLimit)return;
  table.insertAdjacentHTML('beforeend',medicationRow(draft,index));
  table.rows[index].querySelector('input').focus();
  addMedication.hidden=index+1===medicationLimit;
 };
 $('#draft').onclick=()=>{
  savePatientDraft(form);
  toast('Brouillon gardé en attente de confirmation serveur uniquement');
 };
 if(lastPage)$('#previous').onclick=()=>{
  savePatientDraft(form);
  openPatientPage(0);
 };
 form.onsubmit=async e=>{
  e.preventDefault();
  savePatientDraft(form);
  if(!lastPage){
   openPatientPage(patientStep+1);
   return;
  }
  await submitPatientQuestionnaire(form);
 };
}
function openPatientPage(index){
 patientStep=index;
 renderPortal();
 $('#patient-page-title').focus();
 $('#patient-page-title').scrollIntoView({block:'start'});
}
async function submitPatientQuestionnaire(form){
 const draft=patientDrafts[patientTarget];
 if(invitation){
  const {medRows,confirmed,...answers}=draft;
  const button=form.querySelector('button.primary');
  button.disabled=true;
  try{
   await qrApi('submit',{token:invitation,answers,confirmed:confirmed==='on'});
   window.history.replaceState(null,'',location.pathname);
   showPatientReceipt(true);
  }catch(err){
   toast(err.message);
   button.disabled=false;
  }
  return;
 }
 const stay=patients.find(x=>x.id===patientTarget);
 stay.questionnaire={answers:structuredClone(draft),received:new Date().toLocaleString('fr-FR'),reviewed:false};
 stay.task='Questionnaire patient à vérifier';
 stay.done=false;
 stay.events.unshift({at:stay.questionnaire.received,role:'Patient fictif',kind:'Questionnaire',text:'Réponses patient reçues (simulation)'});
 if(patientStandalone){
  showPatientReceipt(false);
  return;
 }
 selected=stay.id;
 tab='questionnaire';
 view='patients';
 render();
 toast('Questionnaire transféré au séjour fictif dans le dossier de démonstration');
}
function showPatientReceipt(transmitted){
 $('#workspace').innerHTML=`<section class="panel pq-portal"><div class="content">
 <h2 tabindex="-1" id="patient-receipt">${transmitted?'Questionnaire transmis':'Envoi simulé terminé'}</h2>
 <p>${transmitted?'Les réponses fictives sont disponibles dans le séjour de démonstration associé.':'Les réponses sont disponibles dans le dossier fictif de cette session.'}</p>
 ${transmitted?'':'<button class="secondary" id="restartpatient">Relire mes réponses</button>'}
 </div></section>`;
 $('#patient-receipt').focus();
 if(!transmitted)$('#restartpatient').onclick=()=>openPatientPage(0);
}
// Relecture du questionnaire patient : réponses brutes + reprise proposée champ par champ dans la consultation.
// Le médecin coche ce qu'il reprend ; rien n'écrase une saisie médicale (ajout en fin de texte, listes déjà remplies conservées).
let questionnaireChoices=null;
function questionnaireReview(){const x=p(),q=x.questionnaire;if(!q){$('#content').innerHTML='<h3>Questionnaire patient</h3><p>Aucun questionnaire reçu pour ce séjour.</p><button class="primary" id="tryquestionnaire">Tester le formulaire patient</button>';if(nurseProfile())$('#tryquestionnaire').hidden=true;$('#tryquestionnaire').onclick=()=>{if(nurseProfile())return;patientTarget=x.id;patientStep=0;view='portal';render()};return}
 const d=q.answers,R=window.IaseloReprise,sections=Object.fromEntries(consultSections.flatMap(s=>s.fields.map(f=>[f[0],s.title])));sections.medicationRows='Traitements';sections.history=sections.history||'Antécédents';
 const labelOf=k=>k==='medicationRows'?'Traitements structurés (une ligne par médicament)':cfLabel(k);
 const alerts=R?R.alertes(d,window.IaseloRegles?.REGLES):[];
 const lines=R&&!q.reviewed&&!consultModele?R.propositions(x,{sections}):[];
 if(questionnaireChoices?.stay!==x.id)questionnaireChoices={stay:x.id,off:new Set(lines.filter(l=>!l.checked).map(l=>l.id)),on:new Set()};
 const isOn=l=>l.mode!=='same'&&(questionnaireChoices.on.has(l.id)||(!questionnaireChoices.off.has(l.id)&&l.checked));
 const canImport=role==='Anesthésiste'&&!q.reviewed&&!x.consult.validated;
 const modeText={fill:'Champ vide : sera rempli',append:'Sera ajouté après le texte existant',same:'Déjà présent dans le dossier',keep:'Déjà renseigné : votre saisie est conservée',add:'Lignes ajoutées, conduite « À déterminer »'};
 const show=l=>l.kind==='meds'?`<ul class="qr-meds">${l.value.map(m=>`<li><strong>${esc(m.name)}</strong> ${esc([m.dose,m.frequency].filter(Boolean).join(' · '))}${m.classe?` <span class="pill warn">${esc(m.classe)}</span>`:''}</li>`).join('')}</ul>`:`<div class="qr-value">${esc(l.kind==='date'?frDate(l.value):l.value).replace(/\n/g,'<br>')}</div>${l.note?`<small class="muted">${esc(l.note)}</small>`:''}`;
 const order=[...consultSections.map(s=>s.title),'Autres'],groups=[...new Set(lines.map(l=>l.section||'Autres'))].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
 const review=consultModele?consultModele.bandeau(x)+'<div class="actions"><button class="primary" id="cpa-ouvrir">Ouvrir la consultation</button></div>':q.reviewed?`<div class="notice"><strong>Reprise effectuée</strong> le ${esc(frDate(q.reviewedAt))}${q.reviewedBy?' par '+esc(q.reviewedBy):''}${q.importedFields?.length?` · ${q.importedFields.length} rubrique${q.importedFields.length>1?'s':''} préremplie${q.importedFields.length>1?'s':''} : ${esc(q.importedFields.map(labelOf).join(', '))}`:''}. Les éléments restent à confirmer en consultation.</div>`
  :lines.length?`<section class="qr-import" aria-labelledby="qr-title"><div class="row"><div><h3 id="qr-title">Préremplir la consultation</h3><p class="muted">${lines.filter(isOn).length} élément${lines.filter(isOn).length>1?'s':''} sur ${lines.length} coché${lines.filter(isOn).length>1?'s':''}. Décochez ce que vous ne voulez pas reprendre. Chaque texte repris est marqué « Déclaré par le patient » ; aucune de vos saisies n’est effacée.</p></div><div class="actions"><button type="button" class="secondary" id="qr-all">Tout cocher</button><button type="button" class="secondary" id="qr-none">Tout décocher</button></div></div>
  ${groups.map(g=>`<fieldset class="qr-group"><legend>${esc(g)}</legend>${lines.filter(l=>(l.section||'Autres')===g).map(l=>`<label class="qr-line ${l.mode==='same'?'is-same':''}"><input type="checkbox" data-qr="${esc(l.id)}" ${isOn(l)?'checked':''} ${l.mode==='same'||!canImport?'disabled':''}><span class="qr-field"><strong>${esc(labelOf(l.field))}</strong><small class="qr-mode qr-${l.mode}">${esc(modeText[l.mode])}</small>${l.current&&l.mode==='keep'?`<small class="muted">Dans le dossier : ${esc(l.current)}</small>`:''}</span><span class="qr-proposed">${show(l)}</span></label>`).join('')}</fieldset>`).join('')}
  <div class="actions qr-actions"><button class="primary" id="importanswers" ${canImport?'':'disabled'}>Valider la relecture et préremplir la consultation</button></div>
  <p class="muted">${role!=='Anesthésiste'?'Action réservée aux anesthésistes.':x.consult.validated?'La consultation est déjà validée : ouvrez une révision avant de reprendre les réponses.':'Les scores sont pré-calculés à partir des déclarations : complétez les critères manquants à l’examen.'}</p></section>`
  :`<div class="actions"><button class="primary" id="importanswers" ${canImport?'':'disabled'}>Confirmer la relecture</button></div>`;
 $('#content').innerHTML=`<div class="qr-head"><div><p class="eyebrow">QUESTIONNAIRE PATIENT</p><h3>Réponses du patient · ${q.reviewed?'Relues et reprises':'À relire'}</h3><p class="muted">Reçues le ${esc(frDate(q.received))}${q.source?' · '+esc(q.source):''} · déclarations du patient, à confirmer en consultation.</p></div></div>
 ${alerts.length?`<div class="notice warn qr-alerts"><strong>Points à vérifier</strong><ul>${alerts.map(a=>`<li class="qr-${a.level}">${a.level==='crit'?'<strong>Prioritaire</strong> · ':''}${esc(a.text)}</li>`).join('')}</ul></div>`:''}
 ${review}
 <details class="qr-raw" ${lines.length&&!q.reviewed?'':'open'}><summary>Toutes les réponses du patient</summary><dl class="answers">${rawSummary(d)}</dl></details>`;
 document.querySelectorAll('[data-qr]').forEach(b=>b.onchange=()=>{const id=b.dataset.qr;if(b.checked){questionnaireChoices.off.delete(id);questionnaireChoices.on.add(id)}else{questionnaireChoices.on.delete(id);questionnaireChoices.off.add(id)}const n=lines.filter(isOn).length;$('#qr-title').nextElementSibling.textContent=`${n} élément${n>1?'s':''} sur ${lines.length} coché${n>1?'s':''}. Décochez ce que vous ne voulez pas reprendre. Chaque texte repris est marqué « Déclaré par le patient » ; aucune de vos saisies n’est effacée.`});
 const setAll=v=>{for(const l of lines){questionnaireChoices.off[v?'delete':'add'](l.id);questionnaireChoices.on[v?'add':'delete'](l.id)}questionnaireReview()};
 if($('#qr-all'))$('#qr-all').onclick=()=>setAll(true);if($('#qr-none'))$('#qr-none').onclick=()=>setAll(false);
 if(consultModele){if($('#cpa-voirq'))$('#cpa-voirq').hidden=true;$('#cpa-ouvrir').onclick=()=>{tab='consult';detail()};if($('#cpa-inserer'))$('#cpa-inserer').onclick=()=>{if(role!=='Anesthésiste'||x.consult.validated)return;consultModele.preparer(x);if(q.cpaInsertion?.annuleeAt)delete q.cpaInsertion;if(!q.cpaInsertion)consultModele.inserer(x);tab='consult';detail()};if($('#cpa-annuler'))$('#cpa-annuler').onclick=()=>{if(role!=='Anesthésiste')return;consultModele.annuler(x);questionnaireReview()}}
 if($('#importanswers'))$('#importanswers').onclick=()=>{if(role!=='Anesthésiste'||q.reviewed)return;if(x.consult.validated){toast('Ouvrez une révision de la consultation avant de reprendre les réponses.');return}
  const chosen=lines.map(l=>({...l,checked:isOn(l)})),done=R?R.appliquer(x,chosen,{recu:frDate(String(q.received).slice(0,10)),uuid:()=>crypto.randomUUID()}):[];
  q.reviewed=true;q.reviewedAt=new Date().toISOString();q.reviewedBy=professionalWorkspace?.getAccess?.()?.profile?.display_name||role;q.importedFields=done;
  x.task='Consultation à compléter';event(done.length?'Questionnaire patient relu ; consultation préremplie ('+done.map(labelOf).join(', ')+')':'Questionnaire patient relu, rien repris','Questionnaire');questionnaireChoices=null;
  tab='consult';detail();toast(done.length?done.length+' rubrique'+(done.length>1?'s':'')+' préremplie'+(done.length>1?'s':'')+' : complétez et validez la consultation':'Relecture enregistrée')};
}
const baseRender=render;render=function(){ $('#new').hidden=view==='portal'||nurseProfile();$('#stats').hidden=['portal','service','search'].includes(view);baseRender()};

'use strict';
let consultSection='context';
const yesNo=['Oui','Non','À préciser','Non applicable'];
const statusOptions=['Non évalué','Évalué — pas d’action retenue','Action prévue','En attente de résultat / avis','Non applicable'];
// Form fields record clinical decisions; they do not implement treatment rules.
const consultSections=[
 {id:'context',title:'Intervention',description:'Contexte, identité et organisation du séjour.',fields:[
 ['identityReviewed','Identité et séjour vérifiés','select',yesNo],['consultDate','Date de consultation','date'],['author','Anesthésiste consultant · nom fictif'],['setting','Modalité de consultation','select',['Présentiel','Téléconsultation','Consultation délocalisée']],
 ['operation','Intervention prévue','select',['Prothèse totale de hanche','Prothèse totale de genou','Arthroscopie / ligamentoplastie','Ablation de matériel','Chirurgie du pied','Chirurgie digestive','Cholécystectomie','Chirurgie colorectale','Hernie','Chirurgie bariatrique','Hystérectomie','Hystéroscopie','Chirurgie ORL','Chirurgie urologique','Chirurgie plastique','Autre intervention']],['operationDetails','Précision de l’acte et indication','textarea'],['laterality','Côté / site','select',['Droit','Gauche','Bilatéral','Médian','Non applicable']],['surgeon','Chirurgien · nom fictif'],['surgeryDate','Date opératoire prévue','date'],['urgency','Caractère de l’intervention','select',['Programmée','Urgente','Non déterminé']],['careSetting','Parcours envisagé','select',['Ambulatoire','Hospitalisation conventionnelle','Hospitalisation avec soins critiques','À déterminer']],['sex','Sexe utilisé pour les formules','select',['Femme','Homme','Autre / non renseigné']],['age','Âge (ans)','number'],['weight','Poids (kg)','number'],['height','Taille (cm)','number'],['communication','Langue, interprète, handicap et aide nécessaire','textarea'],['representative','Mineur / protection juridique : représentant et modalités','textarea']
 ]},
 {id:'history',title:'Antécédents',description:'Distinguer les déclarations du patient des éléments vérifiés.',fields:[
 ['asa','Classe ASA','select',['I','II','III','IV','V','VI']],['emergencyASA','Suffixe E retenu','select',yesNo],['history','Antécédents médicaux et chirurgicaux vérifiés','textarea'],['cardio','Cardiovasculaire : symptômes, coronaropathie, stent, insuffisance, rythme','textarea'],['respiratory','Respiratoire : asthme, BPCO, SAOS, PPC, oxygène','textarea'],['renal','Rénal, hépatique et digestif : fonction, dialyse, reflux','textarea'],['neuro','Neurologique, neuromusculaire, endocrinien et maladies rares','textarea'],['anesthesiaHistory','Anesthésies antérieures : intubation, complications, NVPO','textarea'],['familyAnesthesia','Antécédents familiaux anesthésiques','textarea'],['allergyReviewed','Statut allergologique revu','select',['Aucune allergie connue après interrogatoire','Allergie(s) documentée(s)','Réaction à explorer','Statut inconnu']],['allergies','Produits, réaction, gravité, date et bilan allergologique','textarea'],['bleedingHistory','Saignements personnels et familiaux : questionnaire revu','textarea'],['vteHistory','MTEV : épisode, date, circonstances, thrombophilie','textarea'],['transfusionHistory','Transfusions, réactions, anticorps et acceptabilité','textarea'],['devicesHistory','Pacemaker / DAI, prothèses, dispositifs : type et suivi','textarea'],['habits','Tabac, alcool, substances : quantité et dernière prise','textarea'],['pregnancy','Grossesse possible / situation obstétricale','select',yesNo]
 ]},
 {id:'medications',title:'Traitements',description:'Conciliation et consignes individuelles, à confronter aux ordonnances.',fields:[
 ['treatmentReviewed','Traitements conciliés avec une source','select',yesNo],['medicationSource','Sources : ordonnance, patient, dossier, médecin traitant','textarea'],['treatments','Traitements habituels vérifiés et compléments','textarea'],['antithromboticPlan','Anticoagulants / antiagrégants : indication, dernière prise, arrêt, reprise, relais éventuel et responsable','textarea'],['diabetesPlan','Antidiabétiques, insuline, SGLT2 et GLP-1 : conduite retenue et consignes','textarea'],['otherMedPlan','Autres adaptations : corticoïdes, psychotropes, antiparkinsoniens, antihypertenseurs…','textarea'],['medicationInstructions','Consignes finales à transmettre au patient','textarea']
 ]},
 {id:'exam',title:'Examen & voies aériennes',description:'Résultats observés et stratégie retenue par l’anesthésiste.',fields:[
 ['bp','Pression artérielle (mmHg)'],['pulse','Fréquence cardiaque (/min)','number'],['spo2','SpO₂ (%)','number'],['functional','Capacité fonctionnelle, dyspnée / douleur et autonomie','textarea'],['cardioExam','Examen cardiovasculaire','textarea'],['respExam','Examen respiratoire','textarea'],['generalExam','Autres éléments cliniques : fragilité, nutrition, neurologie','textarea'],['mallampati','Mallampati','select',['I','II','III','IV','Non évalué']],['mouthOpening','Ouverture buccale (cm)','number'],['thyromental','Distance thyromentonnière (cm)','number'],['neck','Mobilité cervicale / particularités','textarea'],['dentition','Dentition, dents mobiles, prothèses','textarea'],['maskRisk','Facteurs de difficulté de ventilation au masque','textarea'],['intubationRisk','Facteurs de difficulté d’intubation et documents antérieurs','textarea'],['aspiration','Évaluation du risque d’inhalation','textarea'],['airwayConclusion','Conclusion voies aériennes','select',['Évaluation réalisée — stratégie standard retenue','Difficulté anticipée — stratégie spécifique documentée','Évaluation incomplète']],['airwayStrategy','Stratégie voies aériennes et solutions de secours','textarea'],['regionalExam','ALR : examen, particularités, contre-indications et choix du site','textarea']
 ]},
 {id:'tests',title:'Bilans & avis',description:'Examens motivés par le terrain et l’intervention ; préciser la date et les suites.',fields:[
 ['testStatus','Bilan préopératoire','select',statusOptions],['labDate','Date du bilan biologique','date'],['hb','Hémoglobine (g/dL)','number'],['platelets','Plaquettes (G/L)','number'],['creatinine','Créatinine (µmol/L)','number'],['egfr','DFG communiqué par le laboratoire (mL/min/1,73 m²)','number'],['ferritin','Ferritine (µg/L)','number'],['tsat','Saturation de la transferrine (%)','number'],['crp','CRP (mg/L)','number'],['otherLabs','Autres résultats pertinents, unités et dates','textarea'],['ecg','ECG : indication, date et conclusion','textarea'],['specialist','Avis spécialisé : motif, date, conclusion et recommandations','textarea'],['bloodGroup','Groupe sanguin / RAI : indication, disponibilité et date','textarea'],['pendingTests','Examens / documents manquants, responsable et échéance','textarea'],['testInterpretation','Interprétation et conséquences sur la prise en charge','textarea']
 ]},
 {id:'plan',title:'Préparation périopératoire',description:'Décisions médicales explicites, distinctes des prescriptions et de leur réalisation.',fields:[
 ['technique','Technique anesthésique envisagée','select',['Anesthésie générale','ALR périphérique','Rachianesthésie','Péridurale','Sédation','Technique combinée','À déterminer']],['plan','Stratégie anesthésique et alternatives','textarea'],['monitoring','Monitorage, accès vasculaires et matériel spécifique','textarea'],['atbStatus','Antibioprophylaxie : décision','select',statusOptions],['atbPlan','Antibioprophylaxie : indication, molécule, dose, voie, moment, réinjection, référence / motif de dérogation','textarea'],['pbmStatus','Capital sanguin : décision','select',statusOptions],['hemorrhagicRisk','Risque hémorragique de l’acte et facteurs du patient','textarea'],['pbmPlan','Anémie / carence martiale : diagnostic retenu, optimisation, voie, dose, délai, contrôle et responsable','textarea'],['bloodStrategy','Stratégie d’épargne sanguine et transfusionnelle','textarea'],['vteStatus','Thromboprophylaxie : décision','select',statusOptions],['vteRisk','Risque thrombotique, hémorragique, mobilité et contraintes de l’ALR','textarea'],['vtePlan','Thromboprophylaxie : méthode, molécule, dose, début, durée, adaptations et référence','textarea'],['painPlan','Analgésie multimodale, ALR et traitement de secours','textarea'],['nvpoPlan','NVPO : facteurs de risque et prophylaxie retenue','textarea'],['postopDestination','Orientation postopératoire','select',['SSPI puis ambulatoire','SSPI puis hospitalisation','Unité de surveillance continue / soins intensifs','Réanimation','À déterminer']],['postopMonitoring','Surveillance spécifique et critères d’escalade','textarea'],['ambulatory','Ambulatoire : accompagnant, transport, domicile, accès aux soins','textarea']
 ]},
 {id:'information',title:'Information & consignes',description:'Tracer l’échange avec le patient, ses choix et les documents transmis.',fields:[
 ['infoGiven','Information anesthésique délivrée','select',yesNo],['risksDiscussed','Bénéfices, risques pertinents, alternatives et questions discutées','textarea'],['patientAgreement','Accord et préférences du patient','select',['Accord recueilli','Refus / réserve exprimé(e)','Décision différée','À recueillir']],['agreementDetails','Précisions, refus, personne présente et documents remis','textarea'],['fasting','Consignes de jeûne et adaptations individuelles','textarea'],['preparation','Préparation : traitements, PPC, examens et documents à apporter','textarea'],['patientQuestions','Questions du patient et réponses apportées','textarea'],['instructionsGiven','Consignes transmises et comprises','select',yesNo],['contact','Contact de l’équipe et conduite en cas de changement de santé','textarea']
 ]},
 {id:'conclusion',title:'Synthèse & validation',description:'Conclusion du consultant et points à reprendre lors de la visite préanesthésique.',fields:[
 ['decision','Conclusion de consultation','select',['Prise en charge envisagée selon le plan documenté','En attente d’optimisation / bilan / avis','Report proposé à discuter avec l’équipe','Autre conclusion']],['decisionReason','Motif, réserves et conditions de prise en charge','textarea'],['criticalPoints','Points majeurs à transmettre au bloc et à la SSPI','textarea'],['actions','Actions restantes : qui, quoi, pour quand','textarea'],['preanestheticVisit','À vérifier à la visite préanesthésique : évolution, jeûne, prises médicamenteuses, résultats','textarea']
 ]}
];
const requiredConsultFields=['identityReviewed','consultDate','author','operation','asa','allergyReviewed','treatmentReviewed','airwayConclusion','technique','decision','infoGiven','patientAgreement','atbStatus','pbmStatus','vteStatus','postopDestination'];
const clinicalReferences=[
 ['Structure du dossier · SFAR','https://sfar.org/dossier-anesthesique/'],
 ['Examens préinterventionnels · SFAR','https://sfar.org/examens-preinterventionnels-systematiques/'],
 ['Antibioprophylaxie · SFAR–SPILF 2024','https://sfar.org/antibioprophylaxie-en-chirurgie-et-medecine-interventionnelle/'],
 ['Thromboprophylaxie · SFAR–GIHP 2024','https://sfar.org/prevention-de-la-maladie-thromboembolique-veineuse-peri-operatoire/'],
 ['Capital sanguin · HAS 2022, outils 2026','https://www.has-sante.fr/jcms/p_3193968/fr/gestion-du-capital-sanguin-en-pre-per-et-post-operatoire-et-en-obstetrique']
];
const contextualReferences={
 context:[['SFAR','Dossier anesthésique',clinicalReferences[0][1],'Structure et traçabilité du dossier.']],
 exam:[['SFAR','Intubation difficile et extubation chez l’adulte','https://sfar.org/actualisation-de-recommandations-intubation-difficile-et-extubation-en-anesthesie-chez-ladulte/','À consulter pour documenter l’évaluation des voies aériennes et la stratégie prévue.']],
 tests:[['SFAR','Examens préinterventionnels systématiques',clinicalReferences[1][1],'Motiver les examens au regard du patient et de l’intervention.'],['HAS · 2022, fiches 2026','Gestion du capital sanguin',clinicalReferences[4][1],'Consulter les fiches préopératoires pour le bilan d’anémie et son suivi.']],
 plan:[['SFAR–SPILF','Antibioprophylaxie en chirurgie et médecine interventionnelle',clinicalReferences[2][1],'Consulter le tableau correspondant à l’acte prévu.'],['SFAR–GIHP · 2024','Prévention de la maladie thromboembolique veineuse périopératoire',clinicalReferences[3][1],'Consulter les recommandations propres à l’intervention et documenter la décision.'],['HAS · 2022, fiches 2026','Gestion du capital sanguin',clinicalReferences[4][1],'Préparer la stratégie d’épargne sanguine et son suivi.'],['HAS · 2025','Check-lists pour la sécurité du patient','https://www.has-sante.fr/jcms/p_3796705/fr/synthese-les-check-lists-pour-la-securite-des-patients','Identifier les points à transmettre à l’équipe pour la vérification au bloc.']],
 information:[['HAS','Délivrance de l’information à la personne sur son état de santé','https://www.has-sante.fr/upload/docs/application/pdf/2012-06/recommandations_-_delivrance_de_linformation_a_la_personne_sur_son_etat_de_sante.pdf','Préparer l’échange et tracer les informations délivrées.']]
};
function consultReferencePanel(section){
 const refs=contextualReferences[section];
 if(!refs)return '';
 return `<details class="references no-print"><summary>Recommandations et outils · SFAR / HAS (${refs.length})</summary><p class="muted">Textes officiels à consulter selon le contexte. Aucun choix clinique ni aucune prescription ne sont appliqués automatiquement.</p><ul>${refs.map(([source,title,url,note])=>`<li><strong>${esc(source)}</strong> · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a><p class="muted">${esc(note)}</p></li>`).join('')}</ul></details>`;
}
// Documentation fields adapted from the consultation supplied by the clinician.
function addConsultItems(section, after, ...fields){
 const list=consultSections.find(s=>s.id===section).fields;
 list.splice(list.findIndex(f=>f[0]===after)+1,0,...fields);
}
addConsultItems('context','consultDate',['consultTime','Heure de consultation','time']);
addConsultItems('context','surgeryDate',['surgeryTime','Heure d’intervention prévue','time']);
addConsultItems('context','operationDetails',['illnessHistory','Histoire de la maladie : symptômes, examens et traitements déjà réalisés','textarea']);
addConsultItems('context','communication',['occupation','Profession'],['interpreterNeeded','Interprète nécessaire','select',yesNo],['legalStatus','Statut','select',['Majeur','Mineur','Majeur protégé']]);
addConsultItems('history','cardio',['cardiologyFollowup','Suivi cardiologique : praticien, date et conclusions','textarea']);
addConsultItems('history','anesthesiaHistory',['priorOperations','Chirurgies antérieures : année, intervention et type d’anesthésie','textarea']);
addConsultItems('history','habits',['smokingStatus','Tabagisme','select',['Jamais fumé','Sevré','Actif']],['packYears','Exposition tabagique (paquets-années)','number']);
addConsultItems('history','pregnancy',['obstetricDetails','Contraception / date des dernières règles si pertinente']);
addConsultItems('exam','functional',['metsCategory','Capacité fonctionnelle estimée','select',['≥ 4 MET','< 4 MET','Non évaluable']],['frailtyAssessment','Fragilité : outil et résultat si évalués']);
addConsultItems('exam','spo2',['oxygenContext','Conditions de mesure de la SpO₂','select',['Air ambiant','Sous oxygène']],['venousAccess','Capital veineux','select',['Bon','Moyen','Difficile']]);
addConsultItems('exam','neck',['biteTest','Test de morsure','select',['Possible','Impossible','Non évalué']],['facialFindings','Anomalies faciales et cervicales : précisions','textarea'],['beard','Barbe','select',yesNo]);
addConsultItems('exam','dentition',['toothChart','Repérage dentaire : numéros, mobilité, implants, dents absentes et prothèses','textarea']);
addConsultItems('exam','regionalExam',['spineExam','Examen du rachis si ALR périmédullaire envisagée','textarea']);
addConsultItems('plan','hemorrhagicRisk',['surgicalBleedingRisk','Risque hémorragique chirurgical estimé','select',['Faible','Intermédiaire','Élevé']],['transfusionLikelihood','Probabilité de transfusion estimée','select',['Peu probable','Possible','Probable']]);
addConsultItems('plan','vteRisk',['vteRiskLevel','Risque thromboembolique estimé','select',['Faible','Modéré','Élevé']]);
addConsultItems('information','risksDiscussed',['dentalRiskDiscussed','Risque dentaire discuté','select',yesNo],['informationHandout','Document d’information remis','select',yesNo]);
consultSections.splice(consultSections.findIndex(s=>s.id==='tests'),0,{
 id:'riskReview',title:'Scores & vigilance',description:'Reporter les scores évalués et les points à transmettre. Aucun score ni aucune conduite ne sont déduits automatiquement ici.',
 fields:[['stopBangReview','STOP-BANG : score et critères relevés'],['leeReview','Lee (RCRI) : score et facteurs retenus'],['apfelReview','Apfel : score et facteurs retenus'],['hemstopDone','Questionnaire HEMSTOP réalisé','select',yesNo],['hemstopReview','HEMSTOP : score et réponses positives','textarea'],['vigilanceHandoff','Points de vigilance et actions à transmettre','textarea']]
});
consultSections.push({
 id:'pediatrics',title:'Pédiatrie',description:'À compléter lorsque le séjour concerne un enfant.',
 fields:[['pedVaccination','Vaccination à jour','select',yesNo],['pedPassiveSmoking','Tabagisme passif','select',yesNo],['pedPrematurity','Prématurité','select',yesNo],['pedWalking','Marche acquise','select',yesNo],['pedRespiratory','Pathologie respiratoire récente','select',yesNo],['pedOrl','Consignes en cas d’infection ORL données','select',yesNo],['pedCoagulation','Doute sur un trouble de la coagulation','select',yesNo],['pedAuthorization','Autorisation parentale','select',['À vérifier','Vérifiée','Non obtenue','Non applicable']],['pedDetails','Précisions et consignes pédiatriques','textarea']]
});
const allConsultFields=consultSections.flatMap(s=>s.fields);
function cfLabel(k){if(String(k).startsWith('cpa:'))return consultModele?consultModele.libelle(k.slice(4)):k.slice(4);if(k==='questionnaire')return 'Questionnaire patient : revue à confirmer';if(k==='medicationRows')return 'Traitements structurés : vérification et conduite à compléter';return allConsultFields.find(f=>f[0]===k)?.[1]||k}
function consultData(){const c=p().consult;c.ext??={};return {...c.ext,asa:c.asa==='Non renseigné'?'':c.asa,history:c.history,allergies:c.allergies==='À vérifier'?'':c.allergies,treatments:c.treatments,plan:c.plan}}
function consultGaps(){if(consultModele){const x=p(),missing=consultModele.manquants(x).map(k=>'cpa:'+k);if((x.consult.medicationRows||[]).some(m=>!m.removed&&m.verification==='À clarifier'))missing.push('medicationRows');return missing}const d=consultData();const missing=requiredConsultFields.filter(k=>!d[k]||(['identityReviewed','treatmentReviewed','infoGiven'].includes(k)&&d[k]!=='Oui')||(k==='airwayConclusion'&&d[k]==='Évaluation incomplète')||(k==='patientAgreement'&&d[k]==='À recueillir')||(k==='technique'&&d[k]==='À déterminer')||(k==='allergyReviewed'&&d[k]==='Statut inconnu')||(['atbStatus','pbmStatus','vteStatus'].includes(k)&&d[k]==='Non évalué')||(k==='postopDestination'&&d[k]==='À déterminer'));for(const [state,plan]of [['atbStatus','atbPlan'],['pbmStatus','pbmPlan'],['vteStatus','vtePlan']])if(d[state]==='Action prévue'&&!d[plan])missing.push(plan);if(d.airwayConclusion==='Difficulté anticipée — stratégie spécifique documentée'&&!d.airwayStrategy)missing.push('airwayStrategy');if(p().questionnaire&&!p().questionnaire.reviewed)missing.push('questionnaire');if((p().consult.medicationRows||[]).some(m=>!m.removed&&(m.decision==='À déterminer'||m.verification==='À clarifier')))missing.push('medicationRows');return missing}
function consultField(f,d,read){const[k,label,type='text',options]=f,v=d[k]??'',shared=`name="${k}" ${read?'disabled':''}`;let input='';if(type==='select')input=`<select ${shared}><option value="">Non renseigné</option>${options.map(o=>`<option value="${esc(o)}" ${v===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;else if(type==='textarea')input=`<textarea ${shared}>${esc(v)}</textarea>`;else input=`<input ${shared} type="${type}" value="${esc(v)}" ${type==='number'?'min="0" step="any"':''}>`;return `<label class="${type==='textarea'?'wide':''}">${esc(label)}${requiredConsultFields.includes(k)?' <span class="required" title="À renseigner avant validation">•</span>':''}${input}</label>`}
function captureConsult(){if(p().consult.validated||role!=='Anesthésiste')return;if(consultModele?.actif(p())){if(consultModele.capture(p())&&sharedWorkspace)p().sharedDirty=true;return}const form=$('#completeconsult');if(!form)return;const c=p().consult;for(const [k,v]of new FormData(form)){if(['asa','history','allergies','treatments','plan'].includes(k))c[k]=v;else c.ext[k]=v}c.lastDraftAt=new Date().toLocaleString('fr-FR');if(sharedWorkspace)p().sharedDirty=JSON.stringify(p().sharedSavedConsult,(key,value)=>key==='lastDraftAt'?undefined:value)!==JSON.stringify(c,(key,value)=>key==='lastDraftAt'?undefined:value);integratedNotifyChange()}
function bmiText(){const d=consultData(),w=Number(d.weight),h=Number(d.height);return w>0&&h>0?`IMC calculé : ${(w/(h/100)**2).toFixed(1)} kg/m²`:'IMC : renseigner poids et taille'}
function summaryHTML(){const d=consultData(),c=p().consult;return `<div class="consult-summary"><h3>Consultation · ${esc(p().id)}</h3><p class="muted">${c.validated?'Validation de scénario : '+esc(c.validation?.at||''):'Brouillon de consultation'} · ${esc(d.author||'Consultant non renseigné')} · ${esc(d.consultDate||'Date non renseignée')}</p><div class="notice">Patients fictifs uniquement. Cette synthèse de démonstration ne vaut pas document médical signé.</div>${consultSections.map(s=>`<section><h3>${s.title}</h3><dl class="answers">${s.fields.filter(f=>d[f[0]]).map(f=>`<div class="answer"><dt>${esc(f[1])}</dt><dd>${esc(d[f[0]])}</dd></div>`).join('')||'<p class="muted">Non renseigné</p>'}</dl></section>`).join('')}${medicationSummary()}<h3>Éléments à compléter avant validation</h3><p>${consultGaps().map(cfLabel).map(esc).join(' · ')||'Éléments de validation renseignés — la responsabilité de l’évaluation reste médicale.'}</p></div>`}
function vidalTreatmentPanel(){return `<section class="vidal-panel" aria-label="Recherche VIDAL"><div class="row"><div><h3>Rechercher un médicament dans VIDAL</h3><p class="muted">Consulter une spécialité, sa composition et sa monographie, puis renseigner le traitement vérifié ci-dessous.</p></div><span class="pill">Module officiel de recherche</span></div><div class="actions"><button class="secondary" type="button" id="loadvidal">Afficher la recherche VIDAL</button><a href="https://www.vidal.fr/medicaments.html" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Ouvrir VIDAL dans un nouvel onglet</a></div><div id="vidalwidget"></div><p class="muted">La sélection automatique dans le dossier et les contrôles d’interactions ne sont pas connectés. Aucun élément du dossier n’est envoyé automatiquement à VIDAL.</p></section>`}
function consultAncienneTrame(){
 const c=p().consult,d=consultData(),read=role!=='Anesthésiste'||c.validated,gaps=consultGaps(),section=consultSections.find(s=>s.id===consultSection)||consultSections[0];
 $('#content').innerHTML=`<div class="consult-heading"><div><span class="eyebrow">CONSULTATION D’ANESTHÉSIE</span><button type="button" class="textbutton" id="openscience">Ouvrir l’aide scientifique V0.22</button><h3>${c.validated?'Consultation validée dans le scénario':'Dossier de consultation'}</h3></div><span class="pill ${c.validated?'good':'warn'}">${c.validated?'Validée':gaps.length+' éléments de validation à compléter'}</span></div>${p().questionnaire?`<div class="notice">Questionnaire patient reçu · ${p().questionnaire.reviewed?'Relu et repris dans la consultation (éléments marqués « Déclaré par le patient »)':'À relire : vous pourrez préremplir cette consultation en un clic'}. <button class="secondary" id="reviewpatient">${p().questionnaire.reviewed?'Voir les réponses':'Relire et préremplir'}</button></div>`:''}<div class="consult-layout"><nav class="consult-nav" aria-label="Rubriques de consultation">${consultSections.map(s=>{const n=s.fields.filter(f=>d[f[0]]).length;return `<button data-consult-section="${s.id}" class="${consultSection===s.id?'active':''}" ${consultSection===s.id?'aria-current="step"':''}><span>${s.title}</span><small>${n} / ${s.fields.length}</small></button>`}).join('')}<button data-consult-section="summary" class="${consultSection==='summary'?'active':''}">Synthèse complète</button></nav><div class="consult-body">${consultSection==='summary'?summaryHTML():`<h3>${section.title}</h3><p class="muted">${section.description}</p>${section.id==='medications'?vidalTreatmentPanel()+'<div id="structuredmeds"></div>':''}<form id="completeconsult"><div class="formgrid">${section.fields.map(f=>consultField(f,d,read)).join('')}</div></form>${section.id==='context'?`<p id="bmi" class="muted">${bmiText()}</p>`:''}${consultReferencePanel(section.id)}${section.id==='plan'?periEvidencePanel():''}`}</div></div><div class="consult-footer"><p id="draftstatus" class="muted">${read?(c.validated?'Lecture seule. Ouvrir une révision pour modifier.':'Lecture seule pour ce profil.'): 'Les éléments marqués • sont vérifiés à la validation. Enregistrez le brouillon pour conserver les modifications.'}</p><div class="actions"><button class="primary" id="savecomplete" ${read?'disabled':''}>Enregistrer le brouillon</button><button class="secondary" id="validatecomplete" ${read?'disabled':''}>Valider la consultation · simulation</button>${c.validated&&role==='Anesthésiste'?'<button class="secondary" id="reopencomplete">Ouvrir une révision</button>':''}<button class="secondary" id="printconsult">Imprimer la synthèse</button></div><div id="consultissues" role="alert"></div></div>`;
 if(nurseProfile()||sharedWorkspace)$('#openscience').hidden=true;else $('#openscience').onclick=()=>{captureConsult();tab='science';detail()};if(section.id==='medications'&&consultSection!=='summary')structuredTreatments(read);
 document.querySelectorAll('[data-consult-section]').forEach(b=>b.onclick=()=>{captureConsult();consultSection=b.dataset.consultSection;consult()});
 if(section.id==='medications'&&consultSection!=='summary')$('#loadvidal').onclick=()=>{$('#vidalwidget').innerHTML='<iframe title="Recherche officielle VIDAL" width="250" height="300" frameborder="0" scrolling="no" src="https://www.vidal.fr/widgets/search/t:1/" referrerpolicy="no-referrer"></iframe><p class="muted">Si le module ne s’affiche pas, utilisez le lien « Ouvrir VIDAL » ci-dessus.</p>';$('#loadvidal').hidden=true};
 if($('#completeconsult')){$('#completeconsult').onsubmit=e=>e.preventDefault();$('#completeconsult').oninput=()=>{captureConsult();if($('#bmi'))$('#bmi').textContent=bmiText();$('#draftstatus').textContent='Brouillon modifié · session en cours'};$('#completeconsult').onchange=()=>captureConsult()}
 if($('#reviewpatient')&&!sharedWorkspace)$('#reviewpatient').onclick=()=>{captureConsult();tab='questionnaire';detail()};
 $('#savecomplete').onclick=()=>{if(read)return;captureConsult();if(sharedWorkspace){saveSharedConsult($('#savecomplete'),c);return}event('Brouillon de consultation détaillée enregistré','Consultation');consult();toast('Brouillon enregistré en attente de confirmation serveur')};
 $('#validatecomplete').onclick=()=>{if(read)return;captureConsult();const missing=consultGaps();if(missing.length){$('#consultissues').innerHTML=`<div class="notice warn" style="margin-top:16px"><strong>Validation non effectuée</strong><ul>${missing.map(k=>`<li>${k==='questionnaire'?'Questionnaire patient : revue à confirmer':esc(cfLabel(k))}</li>`).join('')}</ul><p>Ces contrôles sont des règles de complétude de l’outil ; ils ne remplacent pas l’évaluation clinique.</p></div>`;return}const validation={at:new Date().toLocaleString('fr-FR'),author:consultData().author,snapshot:{...structuredClone(consultData()),medicationRows:structuredClone(c.medicationRows||[])}};if(sharedWorkspace){saveSharedConsult($('#validatecomplete'),{...c,validation,validated:true});return}c.validation=validation;c.validated=true;p().task='Visite préanesthésique à réaliser';p().done=false;event('Consultation détaillée validée (simulation), version '+((c.versions?.length||0)+1),'Consultation');stats();list();consult();toast('Consultation validée dans le scénario')};
 if($('#reopencomplete'))$('#reopencomplete').onclick=()=>{if(role!=='Anesthésiste')return;if(sharedWorkspace){saveSharedConsult($('#reopencomplete'),{...c,versions:[...(c.versions||[]),structuredClone(c.validation)],validated:false});return}c.versions??=[];c.versions.push(structuredClone(c.validation));c.validated=false;event('Révision ouverte ; version précédente conservée dans le dossier de démonstration','Consultation');consult()};
 $('#printconsult').onclick=()=>{captureConsult();consultSection='summary';consult();window.print()};
}


/* Consultation d'anesthésie : modèle « Consultation pré-anesthésique simplifiée » (consultation-modele.js). */
let consultModele=null;
function consult(){
 if(!consultModele)return consultAncienneTrame();
 const x=p(),c=x.consult,read=role!=='Anesthésiste'||c.validated;
 if(!read)consultModele.preparer(x);
 const gaps=consultGaps();
 $('#content').innerHTML=`<div class="cpa-head"><h3>Consultation d’anesthésie</h3><span class="pill ${c.validated?'good':gaps.length?'warn':'good'}" id="cpa-gaps">${c.validated?'Validée'+(c.validation?.at?' le '+esc(c.validation.at):''):gaps.length?gaps.length+' champ'+(gaps.length>1?'s':'')+' à compléter':'Complète'}</span><span id="draftstatus" class="muted">${read?(c.validated?'Lecture seule : ouvrez une révision pour modifier.':'Lecture seule pour ce profil.'):''}</span><div class="actions"><button type="button" class="textbutton" id="openscience">Aide scientifique</button><button class="primary" id="savecomplete" ${read?'disabled':''}>Enregistrer</button><button class="secondary" id="validatecomplete" ${read?'disabled':''}>Valider la consultation</button>${c.validated&&role==='Anesthésiste'?'<button class="secondary" id="reopencomplete">Ouvrir une révision</button>':''}</div><div id="consultissues" role="alert"></div></div>
 ${consultModele.bandeau(x)}
 <div id="cpa-zone" class="cpa-zone"></div>${consultModele.ancienneHTML(c)}`;
 consultModele.monter($('#cpa-zone'),x,read);
 if(nurseProfile()||sharedWorkspace)$('#openscience').hidden=true;else $('#openscience').onclick=()=>{captureConsult();tab='science';detail()};
 const majGaps=()=>{if(c.validated)return;const g=consultGaps(),el=$('#cpa-gaps');if(!el)return;el.textContent=g.length?g.length+' champ'+(g.length>1?'s':'')+' à compléter':'Complète';el.className='pill '+(g.length?'warn':'good')};
 consultChangeHook=majGaps;
 if($('#cpa-inserer'))$('#cpa-inserer').onclick=()=>{if(read)return;captureConsult();const q=x.questionnaire;if(q?.cpaInsertion?.annuleeAt)delete q.cpaInsertion;const champs=consultModele.inserer(x);consult();toast(champs.length?champs.length+' champ'+(champs.length>1?'s':'')+' rempli'+(champs.length>1?'s':'')+' depuis le questionnaire':'Aucune réponse à insérer : champs déjà renseignés')};
 if($('#cpa-annuler'))$('#cpa-annuler').onclick=()=>{if(read)return;consultModele.annuler(x);consult();toast('Insertion du questionnaire annulée')};
 if($('#cpa-voirq'))$('#cpa-voirq').onclick=()=>{captureConsult();tab='questionnaire';detail()};
 $('#savecomplete').onclick=()=>{if(read)return;captureConsult();if(sharedWorkspace){saveSharedConsult($('#savecomplete'),c);return}event('Consultation d’anesthésie enregistrée','Consultation');$('#draftstatus').textContent='Enregistré le '+new Date().toLocaleString('fr-FR');toast('Consultation enregistrée')};
 $('#validatecomplete').onclick=()=>{if(read)return;captureConsult();const missing=consultGaps();if(missing.length){$('#consultissues').innerHTML=`<div class="notice warn cpa-issues" style="margin-top:12px"><strong>Validation non effectuée : ${missing.length} élément${missing.length>1?'s':''} à compléter</strong><ul class="cpa-missing">${missing.map(k=>`<li><button type="button" class="textbutton" data-cpa-go="${esc(k.startsWith('cpa:')?k.slice(4):'')}">${esc(cfLabel(k))}</button></li>`).join('')}</ul><p>Ces contrôles de complétude ne remplacent pas l’évaluation clinique.</p></div>`;document.querySelectorAll('[data-cpa-go]').forEach(b=>b.onclick=()=>consultModele.aller(b.dataset.cpaGo));return}
  const validation={at:new Date().toLocaleString('fr-FR'),author:consultData().author,snapshot:{...structuredClone(consultData()),medicationRows:structuredClone(c.medicationRows||[]),cpa:structuredClone(c.cpa||{})}};
  const q=x.questionnaire;if(q&&!q.reviewed){q.reviewed=true;q.reviewedAt=new Date().toISOString();q.reviewedBy=professionalWorkspace?.getAccess?.()?.profile?.display_name||role;q.importedFields=(q.cpaInsertion&&!q.cpaInsertion.annuleeAt?q.cpaInsertion.champs:[]).map(k=>'cpa:'+k)}
  if(sharedWorkspace){saveSharedConsult($('#validatecomplete'),{...c,validation,validated:true});return}
  c.validation=validation;c.validated=true;x.task='Visite préanesthésique à réaliser';x.done=false;event('Consultation d’anesthésie validée, version '+((c.versions?.length||0)+1),'Consultation');stats();list();consult();toast('Consultation validée')};
 if($('#reopencomplete'))$('#reopencomplete').onclick=()=>{if(role!=='Anesthésiste')return;if(sharedWorkspace){saveSharedConsult($('#reopencomplete'),{...c,versions:[...(c.versions||[]),structuredClone(c.validation)],validated:false});return}c.versions??=[];c.versions.push(structuredClone(c.validation));c.validated=false;event('Révision ouverte ; version précédente conservée dans le dossier','Consultation');consult()};
}
let consultChangeHook=null;

'use strict';
const prepStates=['À faire','En cours','En attente','Réalisée','Non retenue'];
let nextPrepId=1,prepEditing=null,medEditing=null,teamFilter='Ouvertes';
const exampleDue=new Date();exampleDue.setDate(exampleDue.getDate()+2);
prepFor(patients[0]).push({id:'ACTION-'+crypto.randomUUID(),label:'Récupérer le bilan prévu dans le scénario',category:'Bilan',owner:'Secrétariat · démo',due:dateKey(exampleDue),state:'À faire',note:'Exemple fictif pour tester le suivi de préparation.'});
prepFor(patients[2]).push({id:'ACTION-'+crypto.randomUUID(),label:'Compléter la consultation du scénario',category:'Document',owner:'Anesthésiste · démo',due:dateKey(exampleDue),state:'À faire',note:'Action de démonstration, sans donnée clinique réelle.'});
function stats(){const actions=patients.flatMap(prepFor);$('#stats').innerHTML=[[patients.length,'Séjours fictifs'],[patients.filter(x=>x.questionnaire&&!x.questionnaire.reviewed).length,'Questionnaires à revoir'],[actions.filter(isOpen).length,'Actions ouvertes'],[actions.filter(isLate).length,'Échéances dépassées']].map(([n,label],i)=>`<div class="stat ${i===2?'accent':''}"><span>${label}</span><strong>${n}</strong></div>`).join('')}
function dateKey(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function prepFor(x){return x.prepActions??=[]}
function isOpen(a){return !['Réalisée','Non retenue'].includes(a.state)}
function isLate(a){return isOpen(a)&&a.due&&a.due<dateKey()}
function traceFor(x,text,kind){x.events.unshift({at:new Date().toLocaleString('fr-FR'),role,text,kind})}
function optionHTML(values,current){return values.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('')}
function overview(){
 const x=p(),d=consultData(),actions=prepFor(x),open=actions.filter(isOpen),gaps=consultGaps(),meds=(x.consult.medicationRows||[]).filter(m=>!m.removed);
 const card=(title,value,section)=>`<article class="overview-card"><h3>${title}</h3><p>${esc(value||'Non renseigné')}</p><button class="textbutton" data-jump="${section}">Ouvrir la rubrique</button></article>`;
 $('#content').innerHTML=`<div class="overview-title"><div><p class="eyebrow">SYNTHÈSE DU SÉJOUR</p><h3>Ce que l’équipe doit retrouver</h3></div><button class="primary" data-jump="context">${x.consult.validated?'Lire la consultation':'Compléter la consultation'}</button></div><div class="readiness"><div><span>Consultation</span><strong>${x.consult.validated?'Documentée · simulation':'Brouillon'}</strong></div><div><span>Complétude de consultation</span><strong>${gaps.length} élément(s) à compléter</strong></div><div><span>Préparation</span><strong>${open.length} action(s) ouverte(s)</strong></div></div><p class="muted">La validation du dossier et la réalisation des actions sont distinctes. La décision de prise en charge reste médicale.</p><div class="overview-grid">${card('Intervention', [d.operation,d.operationDetails,d.surgeryDate].filter(Boolean).join(' · '),'context')}${card('Allergies',[d.allergyReviewed,d.allergies].filter(Boolean).join('\n'),'history')}${card('Voies aériennes',[d.airwayConclusion,d.airwayStrategy].filter(Boolean).join('\n'),'exam')}${card('Stratégie anesthésique',[d.technique,d.plan,d.postopDestination].filter(Boolean).join('\n'),'plan')}</div><section class="overview-block"><h3>Points majeurs pour le bloc et la SSPI</h3><p class="preserve">${esc(d.criticalPoints||'Aucun point majeur documenté. Cela ne signifie pas une absence de risque.')}</p><div class="actions"><button class="secondary" data-jump="conclusion">Documenter les points majeurs</button><button class="secondary" id="overviewinstructions">Consignes patient</button></div></section><section class="overview-block"><div class="row"><h3>Préparation à poursuivre</h3><button class="secondary" id="overviewprep">Organiser les actions</button></div>${open.length?open.map(a=>`<div class="compact-action"><span><strong>${esc(a.label)}</strong><small>${esc(a.owner)} · ${a.due?esc(a.due):'Échéance à définir'}</small></span><span class="pill ${isLate(a)?'warn':''}">${isLate(a)?'Échéance dépassée':esc(a.state)}</span></div>`).join(''):'<p class="muted">Aucune action ouverte enregistrée. Vérifier aussi les réserves et décisions de la consultation.</p>'}${d.actions?`<p class="preserve muted">Notes de consultation : ${esc(d.actions)}</p>`:''}</section><section class="overview-block"><h3>Traitements structurés · ${meds.length}</h3>${meds.length?meds.map(m=>`<div class="compact-action"><span><strong>${esc(m.name)}</strong><small>${esc(m.dose)} · ${esc(m.frequency)} · ${esc(m.route||'Voie non précisée')}</small><small>Dernière prise : ${esc(m.lastDose||'Non renseignée')}</small></span><span>${esc(m.decision||'Conduite à documenter')}</span></div>`).join(''):'<p class="muted">Aucune ligne structurée saisie. Les traitements en texte libre restent accessibles dans la consultation.</p>'}<button class="secondary" data-jump="medications">Revoir les traitements</button></section><section class="overview-block"><h3>Questionnaire patient</h3><p>${x.questionnaire?(x.questionnaire.reviewed?'Reçu et revu dans le scénario':'Reçu · en attente de revue'):'Non reçu pour ce séjour'}</p><button class="secondary" id="overviewquestionnaire">Ouvrir les réponses patient</button></section>`;
 document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{tab='consult';consultSection=b.dataset.jump;detail()});
 $('#overviewprep').onclick=()=>{tab='preparation';detail()};$('#overviewinstructions').onclick=()=>{tab='instructions';detail()};$('#overviewquestionnaire').onclick=()=>{tab='questionnaire';detail()};
}
function prepRow(x,a){return `<article class="prep-row"><div class="row"><div><strong>${esc(a.label)}</strong><p class="muted">${esc(a.category)} · ${esc(x.id)} · ${esc(doctorName(a.doctorId))} · priorité ${esc(a.priority||'Standard')}</p></div><span class="pill ${isLate(a)?'warn':''}">${isLate(a)?'Échéance dépassée':esc(a.state)}</span></div>${a.note?`<p class="preserve">${esc(a.note)}</p>`:''}<div class="prep-meta"><label>Responsable<input value="${esc(a.owner)}" ${nurseProfile()?'disabled':''} data-prep-owner="${a.id}" data-stay="${x.id}"></label><label>Échéance<input type="date" value="${esc(a.due)}" ${nurseProfile()?'disabled':''} data-prep-due="${a.id}" data-stay="${x.id}"></label><label>Statut<select ${nurseProfile()?'disabled':''} data-prep-state="${a.id}" data-stay="${x.id}">${optionHTML(prepStates,a.state)}</select></label></div><div class="actions">${nurseProfile()?'':`<button class="secondary" data-prep-edit="${a.id}" data-stay="${x.id}">Modifier</button>`}<button class="secondary" data-prep-open="${x.id}">Ouvrir le dossier</button></div></article>`}
function bindPrepRows(){
 for(const [selector,key]of [['[data-prep-owner]','owner'],['[data-prep-due]','due'],['[data-prep-state]','state']])document.querySelectorAll(selector).forEach(el=>el.onchange=()=>{if(nurseProfile())return;const x=patients.find(x=>x.id===el.dataset.stay),id=el.dataset['prep'+key[0].toUpperCase()+key.slice(1)],a=prepFor(x).find(a=>a.id===id);if(!a)return;const value=el.value.trim();if(key==='owner'&&!value){el.value=a.owner;toast('Indiquez un responsable');return}if(key==='state'&&!prepStates.includes(value))return;a[key]=value;traceFor(x,'Action « '+a.label+' » : '+key+' modifié','Préparation');stats();if(view==='tasks')renderTasks();else preparation();toast('Action mise à jour dans le dossier de démonstration')});
 document.querySelectorAll('[data-prep-edit]').forEach(b=>b.onclick=()=>{selected=b.dataset.stay;prepEditing=b.dataset.prepEdit;view='patients';tab='preparation';render()});
 document.querySelectorAll('[data-prep-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.prepOpen;view='patients';tab='consult';render()});
}
function preparation(){
 const x=p(),all=prepFor(x),editing=all.find(a=>a.id===prepEditing)||{};
 $('#content').innerHTML=`<h3>Préparation de l’intervention</h3><p class="muted">Attribuer chaque action et suivre son résultat. La clôture d’une action ne valide pas médicalement le patient.</p>${nurseProfile()?'':`<form id="prepform" class="workflow-form"><div class="formgrid"><label>Action<input name="label" required value="${esc(editing.label||'')}" placeholder="Ex. récupérer un compte rendu"></label><label>Catégorie<select name="category">${optionHTML(['Bilan','Avis spécialisé','Traitements','Optimisation','Document','Organisation','Autre'],editing.category||'Bilan')}</select></label><label>Responsable<input name="owner" required value="${esc(editing.owner||'')}" placeholder="Nom fictif ou rôle"></label><label>Échéance<input name="due" type="date" value="${esc(editing.due||'')}"></label><label>Médecin destinataire<select name="doctorId">${doctorOptions(editing.doctorId||'')}</select></label><label>Priorité déclarée<select name="priority">${optionHTML(['Standard','Haute','Urgente'],editing.priority||'Standard')}</select></label><label>Statut<select name="state">${optionHTML(prepStates,editing.state||'À faire')}</select></label><label class="wide">Résultat, réserve ou consigne<textarea name="note">${esc(editing.note||'')}</textarea></label></div><div class="actions"><button class="primary">${editing.id?'Enregistrer la modification':'Ajouter l’action'}</button>${editing.id?'<button type="button" class="secondary" id="cancelprep">Annuler la modification</button>':''}</div></form>`}<h3 style="margin-top:24px">${all.filter(isOpen).length} action(s) ouverte(s) · ${all.filter(a=>a.state==='Réalisée').length} réalisée(s)</h3>${all.length?all.map(a=>prepRow(x,a)).join(''):'<div class="empty">Ajoutez les actions identifiées pendant la consultation.</div>'}`;
 if($('#prepform'))$('#prepform').onsubmit=e=>{e.preventDefault();if(nurseProfile())return;const f=Object.fromEntries(new FormData(e.currentTarget));f.label=(f.label||'').trim();f.owner=(f.owner||'').trim();if(!f.label||!f.owner||!prepStates.includes(f.state)){toast('Action, responsable et statut sont nécessaires');return}if(editing.id){Object.assign(editing,f);traceFor(x,'Action modifiée : '+f.label,'Préparation')}else {all.push({...f,id:'ACTION-'+crypto.randomUUID()});traceFor(x,'Action ajoutée : '+f.label,'Préparation')}prepEditing=null;stats();preparation();toast('Action enregistrée dans le dossier de démonstration')};
 if($('#cancelprep'))$('#cancelprep').onclick=()=>{prepEditing=null;preparation()};bindPrepRows();
}
function renderTasks(){
 const all=patients.flatMap(x=>prepFor(x).map(a=>({x,a}))),shown=all.filter(({a})=>teamFilter==='Toutes'||(teamFilter==='Ouvertes'&&isOpen(a))||(teamFilter==='Échéance dépassée'&&isLate(a))||(teamFilter==='Réalisées'&&a.state==='Réalisée'));
 $('#workspace').innerHTML=`<section class="panel"><div class="panelhead"><div class="row"><div><h2>Actions de l’équipe</h2><p class="muted">${all.filter(({a})=>isOpen(a)).length} ouverte(s) · ${all.filter(({a})=>isLate(a)).length} avec échéance dépassée</p></div><label>Afficher<select id="teamfilter">${optionHTML(['Ouvertes','Échéance dépassée','Réalisées','Toutes'],teamFilter)}</select></label></div></div><div class="content">${shown.length?shown.map(({x,a})=>prepRow(x,a)).join(''):'<div class="empty">Aucune action pour ce filtre. Ouvrez un séjour pour organiser sa préparation.</div>'}<details class="legacy-tasks"><summary>Suivi général des séjours</summary>${patients.map(x=>`<div class="task"><input type="checkbox" aria-label="Action générale réalisée pour ${x.id}" data-legacy-done="${x.id}" ${nurseProfile()?'disabled':''} ${x.done?'checked':''}><div><strong>${esc(x.task)}</strong><p class="muted">${x.id}</p></div><button class="secondary" data-prep-open="${x.id}">Ouvrir</button></div>`).join('')}</details></div></section>`;
 $('#teamfilter').onchange=e=>{teamFilter=e.target.value;renderTasks()};document.querySelectorAll('[data-legacy-done]').forEach(el=>el.onchange=()=>{if(nurseProfile())return;const x=patients.find(x=>x.id===el.dataset.legacyDone);x.done=el.checked;traceFor(x,x.done?'Action générale réalisée':'Action générale rouverte','Action');stats()});bindPrepRows();
}
function structuredTreatments(read){
 const c=p().consult,rows=c.medicationRows??=[],edit=rows.find(m=>m.id===medEditing&&!m.removed)||{};
 const input=(key,label)=>`<label>${label}<input name="${key}" value="${esc(edit[key]||'')}" ${key==='name'?'required':''}></label>`;
 $('#structuredmeds').innerHTML=`<section class="medication-box"><h3>Traitements · une ligne par médicament</h3><p class="muted">Saisie manuelle après vérification. La recherche VIDAL ne remplit pas ces champs automatiquement.</p>${!read?`<form id="medrowform"><div class="formgrid">${input('name','Spécialité ou DCI')}${input('dose','Dosage et dose habituelle')}${input('frequency','Horaires / fréquence')}${input('route','Voie')}${input('indication','Indication')}${input('lastDose','Dernière prise : date et heure')}<label>Vérification<select name="verification">${optionHTML(['Déclaré par le patient','Vérifié sur une ordonnance','Vérifié dans le dossier','À clarifier'],edit.verification||'Déclaré par le patient')}</select></label>${input('source','Source et date')}<label>Conduite préopératoire<select name="decision">${optionHTML(['À déterminer','Poursuite retenue','Arrêt retenu','Adaptation retenue','Autre conduite'],edit.decision||'À déterminer')}</select></label>${input('stopPlan','Dernière prise prévue / arrêt retenu')}${input('resumePlan','Reprise retenue : conditions et moment')}${input('instructions','Précisions et responsable')}</div><div class="actions"><button class="primary">${edit.id?'Enregistrer cette ligne':'Ajouter le traitement'}</button>${edit.id?'<button class="secondary" type="button" id="cancelmed">Annuler</button>':''}</div></form>`:''}<div class="medication-list">${rows.filter(m=>!m.removed).map(m=>`<article class="medication-row"><div class="row"><strong>${esc(m.name)}</strong><span class="pill ${m.verification==='À clarifier'||m.decision==='À déterminer'?'warn':''}">${esc(m.verification)}</span></div><p>${esc([m.dose,m.frequency,m.route].filter(Boolean).join(' · '))}</p><dl class="answers">${[['Indication',m.indication],['Dernière prise',m.lastDose],['Conduite',m.decision],['Arrêt / adaptation',m.stopPlan],['Reprise',m.resumePlan],['Source',m.source],['Précisions',m.instructions]].map(([l,v])=>`<div class="answer"><dt>${l}</dt><dd>${esc(v||'Non renseigné')}</dd></div>`).join('')}</dl>${!read?`<div class="actions"><button type="button" class="secondary" data-med-edit="${m.id}">Modifier</button><button type="button" class="secondary" data-med-remove="${m.id}">Retirer de la liste active</button></div>`:''}</article>`).join('')||'<p class="muted">Aucun traitement structuré enregistré.</p>'}</div></section>`;
 if($('#medrowform'))$('#medrowform').onsubmit=e=>{e.preventDefault();if(read)return;captureConsult();const data=Object.fromEntries(new FormData(e.currentTarget));data.name=(data.name||'').trim();if(!data.name){toast('Indiquez le médicament');return}if(edit.id)Object.assign(edit,data);else rows.push({...data,id:'MED-'+crypto.randomUUID()});medEditing=null;event((edit.id?'Traitement modifié : ':'Traitement ajouté : ')+data.name,'Traitements');consult();toast('Ligne de traitement enregistrée')};
 if($('#cancelmed'))$('#cancelmed').onclick=()=>{medEditing=null;consult()};document.querySelectorAll('[data-med-edit]').forEach(b=>b.onclick=()=>{if(read)return;captureConsult();medEditing=b.dataset.medEdit;consult()});document.querySelectorAll('[data-med-remove]').forEach(b=>b.onclick=()=>{if(read)return;captureConsult();const m=rows.find(m=>m.id===b.dataset.medRemove);if(!m)return;m.removed=true;event('Traitement retiré de la liste active : '+m.name,'Traitements');medEditing=null;consult()});
}
function medicationSummary(){const rows=(p().consult.medicationRows||[]).filter(m=>!m.removed);return rows.length?`<section><h3>Traitements structurés</h3>${rows.map(m=>`<div class="answer"><dt>${esc(m.name)}<br>${esc(m.verification)}</dt><dd>${esc([m.dose,m.frequency,m.route].filter(Boolean).join(' · '))}<br>Dernière prise : ${esc(m.lastDose||'Non renseignée')}<br>Conduite : ${esc(m.decision||'À déterminer')}<br>Arrêt / adaptation : ${esc(m.stopPlan||'Non renseigné')}<br>Reprise : ${esc(m.resumePlan||'Non renseignée')}<br>${esc(m.instructions||'')}</dd></div>`).join('')}</section>`:''}
function patientInstructions(){const d=consultData(),validated=p().consult.validated;$('#content').innerHTML=`<article class="consult-summary instructions"><p class="eyebrow">CONSIGNES POUR LA CONSULTATION · SCÉNARIO FICTIF</p><h3>Préparer votre intervention</h3><p>${esc(p().id)} · ${esc(d.operation||'Intervention non renseignée')} · ${esc(d.surgeryDate||'Date à confirmer')}</p><div class="notice ${validated?'':'warn'}">${validated?'Consignes issues de la consultation validée dans le scénario. Aucun document médical signé.':'Brouillon : consignes à revoir et valider par l’anesthésiste.'}</div>${[['Vos traitements',d.medicationInstructions],['Le jeûne',d.fasting],['Votre préparation et les documents à apporter',d.preparation],['Si votre état de santé change',d.contact]].map(([title,value])=>`<section><h3>${title}</h3><p class="preserve">${esc(value||'Consignes non renseignées : à préciser avec l’équipe.')}</p></section>`).join('')}<p class="muted">Consultant : ${esc(d.author||'Non renseigné')} · consultation : ${esc(d.consultDate||'Non renseignée')}</p><div class="actions no-print"><button class="primary" id="printinstructions">Imprimer les consignes</button><button class="secondary" id="editinstructions">Revoir les consignes</button></div></article>`;$('#printinstructions').onclick=()=>window.print();$('#editinstructions').onclick=()=>{consultSection='information';tab='consult';detail()}}


// Rappels de travail individuels ; aucune estimation d'urgence clinique.
const doctors=[{id:'med-a',name:'Dr Martin · anesthésiste'},{id:'med-b',name:'Dr Bernard · anesthésiste'},{id:'med-c',name:'Dr Dubois · chirurgien'}];
let activeDoctor='med-a',priorityScope='mine',priorityFilter='open';
function doctorName(id){return doctors.find(d=>d.id===id)?.name||'Non attribué à un médecin'}
function doctorOptions(id){return '<option value="">Non attribué à un médecin</option>'+doctors.map(d=>`<option value="${d.id}" ${d.id===id?'selected':''}>${esc(d.name)}</option>`).join('')}
function priorityInfo(a,today=dateKey()){
 if(!isOpen(a))return {rank:9,label:a.state,tone:'closed',reason:'Action clôturée'};
 if(a.priority==='Urgente')return {rank:0,label:'Urgente déclarée',tone:'urgent',reason:'Priorité indiquée par l’équipe'};
 if(a.due&&a.due<today)return {rank:1,label:'En retard',tone:'urgent',reason:'Échéance dépassée'};
 if(a.due===today)return {rank:2,label:'À faire aujourd’hui',tone:'today',reason:'Échéance du jour'};
 if(a.priority==='Haute')return {rank:3,label:'Priorité haute',tone:'today',reason:'Priorité indiquée par l’équipe'};
 const tomorrow=new Date(today+'T12:00:00');tomorrow.setDate(tomorrow.getDate()+1);
 if(a.due===dateKey(tomorrow))return {rank:4,label:'Pour demain',tone:'soon',reason:'Échéance demain'};
 return {rank:5,label:a.due?'À venir':'Échéance à définir',tone:'soon',reason:a.due?'Échéance programmée':'Aucune échéance renseignée'};
}
function priorityEntries(){return patients.flatMap(x=>prepFor(x).map(a=>({x,a,info:priorityInfo(a)}))).sort((l,r)=>l.info.rank-r.info.rank||(l.a.due||'9999').localeCompare(r.a.due||'9999')||l.a.id.localeCompare(r.a.id))}
function updatePriorityBadge(){const badge=$('#prioritybadge');if(badge)badge.textContent=priorityEntries().filter(({a,info})=>a.doctorId===activeDoctor&&info.rank<=3).length||''}
function renderPriorities(){
 const all=priorityEntries(),mine=all.filter(({a})=>a.doctorId===activeDoctor&&isOpen(a)),unassigned=all.filter(({a})=>!a.doctorId&&isOpen(a));
 const scoped=all.filter(({a})=>priorityScope==='team'||(priorityScope==='unassigned'?!a.doctorId:a.doctorId===activeDoctor));
 const shown=scoped.filter(({a,info})=>priorityFilter==='all'||(priorityFilter==='open'&&isOpen(a))||(priorityFilter==='urgent'&&info.rank<=3)||(priorityFilter==='closed'&&!isOpen(a)));
 $('#title').textContent='Mes priorités';$('#new').hidden=true;$('#stats').hidden=true;document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='priorities'));
 $('#workspace').innerHTML=`<section class="panel priority-dashboard"><div class="panelhead"><p class="eyebrow">RAPPELS PERSONNALISÉS · DÉMONSTRATION</p><h2>${esc(doctorName(activeDoctor))}</h2><p class="muted">Les actions qui vous sont attribuées, classées par priorité et échéance.</p><div class="priority-metrics"><div><strong>${mine.filter(({info})=>info.rank<=3).length}</strong><span>prioritaires</span></div><div><strong>${mine.filter(({a})=>isLate(a)).length}</strong><span>en retard</span></div><div><strong>${mine.length}</strong><span>actions ouvertes</span></div><div><strong>${unassigned.length}</strong><span>sans médecin destinataire</span></div></div></div><div class="content"><div class="priority-filters"><label>Périmètre<select id="priorityscope"><option value="mine" ${priorityScope==='mine'?'selected':''}>Mes actions</option><option value="unassigned" ${priorityScope==='unassigned'?'selected':''}>Sans médecin destinataire</option><option value="team" ${priorityScope==='team'?'selected':''}>Toute l’équipe</option></select></label><label>Afficher<select id="priorityfilter"><option value="open" ${priorityFilter==='open'?'selected':''}>Actions ouvertes</option><option value="urgent" ${priorityFilter==='urgent'?'selected':''}>Prioritaires</option><option value="closed" ${priorityFilter==='closed'?'selected':''}>Clôturées</option><option value="all" ${priorityFilter==='all'?'selected':''}>Toutes</option></select></label></div><p class="muted">Ordre : urgente déclarée, retard, aujourd’hui, priorité haute, demain, puis à venir. Ce classement organise le travail ; il ne mesure pas la gravité clinique.</p>${shown.length?shown.map(({x,a,info})=>`<article class="priority-card ${info.tone}"><div class="row"><div><span class="pill priority-${info.tone}">${esc(info.label)}</span><h3>${esc(a.label)}</h3><p class="muted">${esc(x.id)} · ${esc(x.specialty)} · ${esc(x.stage)}</p></div><span class="pill">${esc(a.state)}</span></div><p class="priority-reason">${esc(info.reason)}${a.due?' · '+esc(new Date(a.due+'T12:00:00').toLocaleDateString('fr-FR')):''}</p><p class="muted">Destinataire : ${esc(doctorName(a.doctorId))}<br>Responsable de réalisation : ${esc(a.owner)}</p>${a.note?`<p class="preserve">${esc(a.note)}</p>`:''}<div class="actions"><button class="primary" data-priority-open="${x.id}" data-action="${a.id}">Ouvrir l’action</button>${isOpen(a)?`<button class="secondary" data-priority-done="${a.id}" data-stay="${x.id}">Marquer réalisée</button>`:`<button class="secondary" data-priority-reopen="${a.id}" data-stay="${x.id}">Rouvrir</button>`}</div></article>`).join(''):'<div class="empty">Aucune action pour ce filtre. Les actions sans destinataire restent accessibles dans leur périmètre.</div>'}<div class="notice">Rappels à l’ouverture de l’application et pendant cette session. Pas d’envoi par courriel ni de notification en arrière-plan. Les profils restent simulés ; les actions enregistrées sont conservées dans le dossier partagé.</div></div></section>`;
 $('#priorityscope').onchange=e=>{priorityScope=e.target.value;renderPriorities()};$('#priorityfilter').onchange=e=>{priorityFilter=e.target.value;renderPriorities()};
 document.querySelectorAll('[data-priority-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.priorityOpen;prepEditing=b.dataset.action;view='patients';tab='preparation';render()});
 for(const [key,state]of [['priorityDone','Réalisée'],['priorityReopen','À faire']])document.querySelectorAll(key==='priorityDone'?'[data-priority-done]':'[data-priority-reopen]').forEach(b=>b.onclick=()=>{const x=patients.find(x=>x.id===b.dataset.stay),a=prepFor(x).find(a=>a.id===b.dataset[key]);a.state=state;traceFor(x,'Action « '+a.label+' » : '+state+' par '+doctorName(activeDoctor),'Rappel');updatePriorityBadge();renderPriorities();toast('Action '+state.toLowerCase()+' dans le dossier de démonstration')});
}
prepFor(patients[0])[0].doctorId='med-a';prepFor(patients[0])[0].priority='Haute';prepFor(patients[0])[0].due=dateKey();
prepFor(patients[2])[0].doctorId='med-b';prepFor(patients[2])[0].priority='Standard';
const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
prepFor(patients[1]).push({id:'ACTION-'+crypto.randomUUID(),label:'Relire la transmission postopératoire du scénario',category:'Document',owner:'Dr Martin · démo',doctorId:'med-a',priority:'Standard',due:dateKey(yesterday),state:'À faire',note:'Exemple de rappel en retard, sans alerte clinique.'});
prepFor(patients[5]).push({id:'ACTION-'+crypto.randomUUID(),label:'Compléter la synthèse chirurgicale de sortie',category:'Document',owner:'Dr Dubois · démo',doctorId:'med-c',priority:'Haute',due:dateKey(),state:'À faire',note:'Exemple fictif de coordination de sortie.'});
const priorRender=render;render=function(){
 closeCroDictation();
 if(nurseProfile()&&['portal','priorities'].includes(view))view='patients';
 document.querySelectorAll('.nav[data-view="portal"],.nav[data-view="priorities"]').forEach(button=>button.hidden=nurseProfile());
 updatePriorityBadge();if(view==='priorities'){renderPriorities();return}priorRender()};
const priorStats=stats;stats=function(){priorStats();updatePriorityBadge()};
if($('#doctor')){$('#doctor').onchange=e=>{if(tab==='consult')captureConsult();activeDoctor=e.target.value;role=activeDoctor==='med-c'?'Chirurgien':'Anesthésiste';$('#role').value=role;if(role==='Chirurgien')tab='surgeryAnnouncement';view=role==='Chirurgien'?'patients':'priorities';render()};view='priorities'}
(()=>{const signEl=document.querySelector('.i-sign');const tag=()=>{const a=document.querySelector('.nav.active[data-view]');if(a)document.body.dataset.view=a.dataset.view;else delete document.body.dataset.view;if(a&&a.dataset.view!=='priorities')document.body.classList.remove('j-home');const sign=signEl,hero=document.querySelector('.j-hero'),head=document.querySelector('main > header');if(sign){if(hero&&document.body.classList.contains('j-home')){if(sign.parentElement!==hero)hero.append(sign)}else if(head&&sign.nextElementSibling!==head)head.before(sign)}};const w=document.querySelector('#workspace');if(w)new MutationObserver(tag).observe(w,{childList:true});tag();})();
setInterval(()=>{updatePriorityBadge();if(view==='priorities'&&!document.activeElement?.matches('select'))renderPriorities()},60000);
// « Ma journée » : page d'accueil du médecin (maquette Scialytique validée).
// Remplace l'ancienne vue « Mes priorités » ; l'ancienne liste reste accessible par « Toutes mes actions ».
(function () {
  'use strict';
  if (typeof renderPriorities !== 'function' || typeof patients === 'undefined') return;
  const legacyPriorities = renderPriorities;
  let showAll = false;
  const steps = ['Consultation', 'Préopératoire', 'Intervention', 'SSPI', 'Hospitalisation', 'Sortie'];
  const stepLabels = ['Consultation', 'Préparation', 'Bloc', 'SSPI', 'Hospitalisation', 'Sortie'];
  const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const who = x => [x.identity?.lastName && x.identity?.firstName ? `${x.identity.lastName} ${x.identity.firstName}` : '', x.specialty, x.mode].filter(Boolean).join(' · ');
  const fullName = x => x.identity?.lastName ? `${x.identity.firstName || ''} ${x.identity.lastName}`.trim() : x.id;
  const age = x => { const b = x.identity?.birthDate; if (!b) return ''; const d = new Date(b + 'T12:00:00'), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return Number.isFinite(a) ? a + ' ans' : ''; };
  const tone = info => info.rank <= 1 ? 'crit' : info.rank <= 3 ? 'warn' : 'info';
  const toneLabel = { crit: 'Urgent', warn: 'Aujourd’hui', info: 'À venir' };
  const when = a => { if (!a.due) return 'sans échéance'; const d = new Date(a.due + 'T12:00:00'); const t = dateKey(); return a.due === t ? 'aujourd’hui' : a.due < t ? 'en retard · ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
  const statusTone = x => /sortie/i.test(x.stage) ? 'ok' : /compléter|valider|attendu|vérifier/i.test(x.task || '') ? 'warn' : /cours|disponible/i.test(x.task || '') ? 'acc' : 'mut';
  const displayName = () => { try { const n = professionalWorkspace?.getAccess?.()?.profile?.display_name; if (n) return n; } catch (e) {} return doctorName(activeDoctor).split(' · ')[0]; };

  function bar(x) {
    const i = steps.indexOf(x.stage);
    return `<div class="j-steps" role="img" aria-label="Étape : ${esc(x.stage)} (${i + 1} sur ${steps.length})">${steps.map((s, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}" title="${esc(stepLabels[k])}"></span>`).join('')}</div>`;
  }

  function renderJournee() {
    if (showAll) { legacyPriorities(); const head = document.querySelector('.priority-dashboard .panelhead'); if (head && !document.getElementById('j-back')) head.insertAdjacentHTML('afterbegin', '<button type="button" class="secondary j-back" id="j-back">← Ma journée</button>'); const back = document.getElementById('j-back'); if (back) back.onclick = () => { showAll = false; render(); }; return; }
    const now = new Date(), all = priorityEntries(), open = all.filter(({ a }) => isOpen(a));
    const mine = open.filter(({ a }) => a.doctorId === activeDoctor), list = (mine.length ? mine : open).slice(0, 6);
    const urgent = mine.filter(({ info }) => info.rank <= 1).length;
    const bloc = patients.filter(x => x.stage === 'Intervention'), sspi = patients.filter(x => x.stage === 'SSPI');
    const toValidate = patients.filter(x => ['Consultation', 'Préopératoire'].includes(x.stage) && !x.consult?.validated);
    const late = open.filter(({ info }) => info.rank === 1).length;
    $('#title').textContent = 'Ma journée'; $('#new').hidden = false; $('#stats').hidden = true;
    document.body.classList.add('j-home');
    document.querySelectorAll('.nav[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === 'priorities'));
    const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#workspace').innerHTML = `<section class="j-hero">
      <p class="j-date">${esc(date.charAt(0).toUpperCase() + date.slice(1))} · ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
      <h2 class="j-hello">Bonjour, ${esc(displayName())}.</h2>
      <p class="j-summary">${patients.length} séjour${patients.length > 1 ? 's' : ''} suivi${patients.length > 1 ? 's' : ''}. ${urgent ? `<strong class="j-urgent">${urgent} action${urgent > 1 ? 's' : ''} urgente${urgent > 1 ? 's' : ''}</strong> à traiter` : 'Aucune action urgente'}${mine.length ? `, ${mine.length} action${mine.length > 1 ? 's' : ''} ouverte${mine.length > 1 ? 's' : ''} à votre nom` : ''}.</p>
    </section>
    <section class="j-kpis" aria-label="Indicateurs du jour">
      <button type="button" class="j-kpi" data-j-view="service"><span>Au bloc maintenant</span><strong>${bloc.length}</strong><small>${bloc.length ? esc(bloc.map(x => x.id).join(' · ')) : 'aucune intervention en cours'}</small></button>
      <button type="button" class="j-kpi" data-j-view="service"><span>En SSPI</span><strong>${sspi.length}</strong><small>${sspi.length ? esc(sspi.map(x => x.id).join(' · ')) : 'aucun patient'}</small></button>
      <button type="button" class="j-kpi" data-j-view="patients"><span>Consultations à valider</span><strong>${toValidate.length}</strong><small>avant l’intervention</small></button>
      <button type="button" class="j-kpi ${late ? 'is-crit' : ''}" data-j-view="tasks"><span>Actions en retard</span><strong>${late}</strong><small>${open.length} action${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''} dans l’équipe</small></button>
    </section>
    <div class="j-grid">
      <section class="j-card j-todo" aria-labelledby="j-todo-h">
        <div class="j-card-head"><h3 id="j-todo-h">À faire maintenant</h3><span class="j-hint">Trié par urgence, puis par échéance</span></div>
        ${list.length ? `<ol class="j-todo-list">${list.map(({ x, a, info }) => { const t = tone(info); return `<li class="j-todo-row">
          <span class="j-chip j-${t}"><i aria-hidden="true"></i>${toneLabel[t]}</span>
          <div class="j-todo-main"><strong>${esc(a.label)}</strong><span>${esc(x.id)} · ${esc(who(x))}</span></div>
          <span class="j-when">${esc(when(a))}</span>
          <div class="j-todo-actions"><button type="button" class="secondary" data-j-open="${esc(x.id)}" data-j-action="${esc(a.id)}">Ouvrir</button><button type="button" class="j-done" data-j-done="${esc(a.id)}" data-j-stay="${esc(x.id)}" aria-label="Marquer « ${esc(a.label)} » comme réalisée">${ico('<path d="m5 12.5 4.2 4.2L19 7"/>')}</button></div>
        </li>`; }).join('')}</ol>` : '<p class="j-empty">Rien d’urgent pour le moment.</p>'}
        <button type="button" class="j-link" id="j-all">Toutes mes actions et rappels</button>
      </section>
      <section class="j-card j-live" aria-labelledby="j-live-h">
        <div class="j-card-head"><h3 id="j-live-h">Bloc en direct</h3><button type="button" class="j-link" data-j-view="regulation">Planning complet</button></div>
        ${[...bloc, ...sspi].length ? [...bloc, ...sspi].map(x => `<button type="button" class="j-room" data-j-stay="${esc(x.id)}"><span class="j-room-top"><strong>${esc(x.id)}</strong><span>${esc(x.specialty)}</span><em class="j-chip ${x.stage === 'SSPI' ? 'j-info' : 'j-ok'}">${x.stage === 'SSPI' ? 'SSPI' : 'Au bloc'}</em></span>${bar(x)}<small>${esc(fullName(x))} · ${esc(x.task || '')}</small></button>`).join('') : '<p class="j-empty">Aucun patient au bloc ni en SSPI.</p>'}
        <div class="j-sspi"><strong>${sspi.length}</strong><span>patient${sspi.length > 1 ? 's' : ''} en SSPI · ${bloc.length} au bloc</span></div>
      </section>
    </div>
    <section class="j-card j-journey" aria-labelledby="j-journey-h">
      <div class="j-card-head"><h3 id="j-journey-h">Le parcours de mes patients</h3><span class="j-hint">${stepLabels.join(' · ')}</span></div>
      <div class="j-journey-list">${patients.map(x => `<button type="button" class="j-journey-row" data-j-stay="${esc(x.id)}">
        <span class="j-who"><strong>${esc(fullName(x))}</strong><small>${esc([x.id, age(x), x.consult?.asa && x.consult.asa !== 'Non renseigné' ? 'ASA ' + x.consult.asa : ''].filter(Boolean).join(' · '))}</small></span>
        <span class="j-what"><span>${esc(x.specialty)}</span><small>${esc(x.mode)}</small></span>
        ${bar(x)}
        <span class="j-status j-t-${statusTone(x)}">${esc(x.task || x.stage)}</span>
      </button>`).join('')}</div>
    </section>`;
    document.querySelectorAll('[data-j-open]').forEach(b => b.onclick = () => { selected = b.dataset.jOpen; prepEditing = b.dataset.jAction; view = 'patients'; tab = 'preparation'; render(); });
    document.querySelectorAll('[data-j-done]').forEach(b => b.onclick = () => { const x = patients.find(x => x.id === b.dataset.jStay), a = prepFor(x).find(a => a.id === b.dataset.jDone); a.state = 'Réalisée'; traceFor(x, 'Action « ' + a.label + ' » : Réalisée par ' + doctorName(activeDoctor), 'Rappel'); updatePriorityBadge(); render(); toast('Action réalisée'); });
    document.querySelectorAll('button[data-j-stay]').forEach(b => b.onclick = () => { selected = b.dataset.jStay; view = 'patients'; render(); });
    document.querySelectorAll('[data-j-view]').forEach(b => b.onclick = () => { view = b.dataset.jView; render(); });
    $('#j-all').onclick = () => { showAll = true; render(); };
  }

  renderPriorities = renderJournee;
  const before = render;
  render = function () { document.body.classList.remove('j-home'); if (view !== 'priorities') showAll = false; before(); };
})();


// Feuille peropératoire : données de simulation propres à chaque séjour.
const periVitals=[['sbp','PAS','mmHg'],['dbp','PAD','mmHg'],['map','PAM mesurée','mmHg'],['hr','FC','/min'],['spo2','SpO₂','%'],['etco2','EtCO₂','mmHg'],['temp','Température','°C'],['fio2','FiO₂','%'],['rr','FR','/min'],['vt','Volume courant','mL'],['peep','PEEP','cmH₂O'],['pip','Pression de crête','cmH₂O'],['halogenEnd','Fraction expirée de l’halogéné','%']];
function periData(){return p().perop??={context:{},records:[]}}
function periNow(){const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function periTime(t){return new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function periCanWrite(kind){return role==='Anesthésiste'||(nurseProfile()&&kind==='Surveillance')}
function periCanVoid(record){return role==='Anesthésiste'}
function periSorted(records){return [...records].sort((a,b)=>a.at.localeCompare(b.at)||a.created.localeCompare(b.created))}
function periField(key,label,type='text',value='',extra=''){return `<label>${esc(label)}<input name="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`}
const periTeamFields=[
 ['date','Date','date'],['operation','Intervention'],['room','Salle'],
 ['anesthetist','MAR'],['iade','IADE'],['surgeon','Chirurgien']
];
const periChecklist=[
 {title:'Monitorage',key:'monitoringChecks',checks:[
  'PNI','Cardioscope (ECG)','SpO₂','EtCO₂','Halogénés','Neurostimulateur (TOF)',
  'Sonde vésicale','Sonde gastrique','Réchauffeur','Sonde de température'
 ],fields:[['monitoring','Autres dispositifs']]},
 {title:'Réévaluation préopératoire',key:'reevaluationChecks',checks:['Réalisée'],
  fields:[['reevaluation','Précisions']]},
 {title:'Voie veineuse périphérique (VVP)',key:'ivChecks',checks:['VVP en place','Autre accès'],
  fields:[['ivSite','Lieu / côté'],['ivType','Type / calibre'],['ivAccess','Autres accès / précisions']]},
 {title:'Position du patient',key:'positionChecks',checks:[
  'Décubitus dorsal','Décubitus ventral','Latéral gauche','Latéral droit',
  'Déclive','Proclive','Gynécologique','Genu-pectorale','Billot'
 ],fields:[['position','Protections / précisions']]},
 {title:'Type d’anesthésie',key:'techniqueChecks',checks:[
  'AG avec intubation','AG sans intubation','Rachianesthésie','Péridurale',
  'Bloc périphérique','Péribulbaire','ALRIV','Locale'
 ],fields:[['technique','Précisions']]},
 {title:'Intubation et voies aériennes',key:'airwayChecks',checks:[
  'Orotrachéale (OT)','Nasotrachéale (NT)','Intubation difficile','Masque laryngé','Fibroscopie'
 ],fields:[['tubeSize','Sonde n° / repère'],['laryngealMaskSize','Masque laryngé n°'],['airway','Opérateur / précisions']]},
 {title:'Ventilation et oxygénothérapie',key:'ventilationChecks',checks:[
  'Spontanée','Au masque','Contrôlée','Assistée','Oxygénothérapie','Autre'
 ],fields:[
  ['oxygenFlow','O₂ (L/min)'],['ventVt','VT (mL)'],['ventRate','FR (/min)'],
  ['ventFio2','FiO₂ (%)'],['ventN2o','N₂O (%)'],['ventPeep','PEEP (cmH₂O)'],['ventilation','Mode / précisions']
 ]},
 {title:'Visa',fields:[['signedBy','Nom ou initiales']]}
];
const periPeriod=4*60,periStep=10;
const periMinute=at=>Date.parse(at.slice(0,16)+'Z')/60000;
const periClock=minute=>new Date(minute*60000).toISOString().slice(11,16);
function periContextChecklist(c,read){
 const team=periTeamFields.filter(([key])=>c[key]).map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(c[key])}</dd></div>`).join('');
 const blocks=periChecklist.map(({title,key,checks=[],fields=[]})=>{
  const selected=Array.isArray(c[key])?c[key]:[];
  return `<fieldset>
   <legend>${title}</legend>
   ${checks.length?`<div class="peri-check-options">${checks.map(choice=>`<label class="peri-check-option"><input type="checkbox" name="${key}" value="${esc(choice)}" ${selected.includes(choice)?'checked':''} ${read?'disabled':''}><span>${esc(choice)}</span></label>`).join('')}</div>`:''}
   ${fields.length?`<div class="peri-check-fields">${fields.map(([name,label])=>`<label><span>${label}</span><input type="text" name="${name}" value="${esc(c[name]||'')}" ${read?'readonly':''}><span class="peri-print-value">${esc(c[name]||'—')}</span></label>`).join('')}</div>`:''}
  </fieldset>`;
 }).join('');
 return `<form class="peri-sheet-context" id="perichecklist" aria-label="Cartouche peropératoire">
  ${team?`<dl>${team}</dl>`:''}
  <p class="peri-check-status no-print" role="status">${read?'Cartouche en lecture seule':'Enregistrement dans le dossier de démonstration'}</p>
  ${blocks}
 </form>`;
}
function bindPeriChecklist(data,read){
 const form=$('#perichecklist');
 form.onsubmit=e=>e.preventDefault();
 if(read)return;
 const save=(name,label,value)=>{
  data.context[name]=value;
  event('Cartouche peropératoire · '+label,'Peropératoire');
  $('.peri-check-status').textContent='Cartouche enregistré dans le dossier de démonstration';
 };
 form.onchange=e=>{
  const input=e.target;
  if(input.type==='checkbox'){
   const group=periChecklist.find(({key})=>key===input.name);
   save(input.name,group.title,new FormData(form).getAll(input.name));
   return;
  }
  const label=input.closest('label');
  save(input.name,label.firstElementChild.textContent,input.value);
  label.querySelector('.peri-print-value').textContent=input.value||'—';
 };

}
function periChart(rows,start){
 const width=960,height=248;
 const series=[['sbp','PAS','#21517a','down'],['dbp','PAD','#21517a','up'],['map','PAM','#54718b','square'],['hr','FC','#9b373f','dot'],['temp','Température','#24644e','diamond']];
 const values=rows.flatMap(r=>series.slice(0,4).filter(([key])=>r.values[key]!==''&&r.values[key]!==undefined).map(([key])=>Number(r.values[key])));
 const limit=Math.ceil(Math.max(200,...values)/50)*50;
 const X=at=>(periMinute(at)-start)/periPeriod*width;
 const Y=(value,temp)=>height-10-(temp?(value-30)/14:value/limit)*(height-20);
 const vertical=Array.from({length:25},(_,i)=>`<line x1="${i*40}" x2="${i*40}" y1="0" y2="${height}" class="${i%6===0?'peri-hourline':'peri-minorline'}"/>`).join('');
 const horizontal=Array.from({length:21},(_,i)=>{
  const y=Y(i*limit/20,false);
  return `<line x1="0" x2="${width}" y1="${y}" y2="${y}" class="${i%5===0?'peri-hourline':'peri-minorline'}"/>`;
 }).join('');
 const ticks=Array.from({length:5},(_,i)=>`<text x="7" y="${Y(i*limit/4,false)+4}">${i*limit/4}</text>`).join('');
 const tempTicks=[30,34,38,42,44].map(t=>`<text x="${width-5}" y="${Y(t,true)+4}" text-anchor="end" class="peri-temp-scale">${t}°</text>`).join('');
 const marks=series.map(([key,label,color,shape])=>{
  let previous;
  const points=rows.map(({at,values})=>{
   const raw=values[key],v=Number(raw),temp=key==='temp';
   if(raw===''||raw===undefined||(temp&&(v<30||v>44))){previous=undefined;return ''}
   const x=X(at),y=Y(v,temp);
   const line=previous?`<path d="M${previous.x} ${previous.y}L${x} ${y}" fill="none" stroke-width="2"/>`:'';
   previous={x,y};
   const point={down:'M-4 -3L4 -3L0 4Z',up:'M-4 3L4 3L0 -4Z',square:'M-3 -3H3V3H-3Z',diamond:'M0 -5L4 0L0 5L-4 0Z'}[shape];
   return `${line}<g transform="translate(${x} ${y})"><title>${label} ${v} · ${esc(periTime(at))}</title>${point?`<path d="${point}"/>`:'<circle r="3.6"/>'}</g>`;
  }).join('');
  return `<g fill="${color}" stroke="${color}">${points}</g>`;
 }).join('');
 return `<div class="peri-sheet-row peri-sheet-graph"><div class="peri-sheet-label"><strong>Constantes</strong><small>PA (mmHg) · FC (/min) · T° (°C)</small></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Pressions artérielles, fréquence cardiaque et température">${vertical}${horizontal}${ticks}${tempTicks}${marks}</svg></div>`;
}
function periSheet(records,c,links,read){
 const active=periSorted(records.filter(r=>!r.voided));
 const first=periMinute(active[0]?.at||(c.date?c.date+periNow().slice(10):periNow()));
 const origin=Math.floor(first/60)*60;
 const windows=new Map([[origin,[]]]);
 for(const record of active){
  const start=origin+Math.floor((periMinute(record.at)-origin)/periPeriod)*periPeriod;
  if(!windows.has(start))windows.set(start,[]);
  windows.get(start).push(record);
 }

 const timeLabel=r=>r.at.slice(11,16);
 function timelineRow(label,entries){
  const slots=Array.from({length:24},()=>[]);
  for(const {offset,text,title} of entries)slots[Math.floor(offset/periStep)].push(`<span title="${esc(title)}">${esc(text)}</span>`);
  return `<div class="peri-sheet-row"><div class="peri-sheet-label">${esc(label)}</div>${slots.map(items=>`<div class="peri-sheet-cell">${items.join('')}</div>`).join('')}</div>`;
 }
 function periodRows(rows,start){
  const measurements=rows.filter(r=>r.kind==='Surveillance');
  const entry=(r,text)=>({offset:periMinute(r.at)-start,text,title:timeLabel(r)+' · '+periDescription(r)});
  const trace=(kind,groups,format)=>{
   const selected=rows.filter(r=>r.kind===kind);
   const labels=groups?Array.from(new Set(selected.map(r=>r.values[groups]))):['Temps opératoires'];
   return (labels.length?labels:[kind]).map(label=>timelineRow(label,selected.filter(r=>!groups||r.values[groups]===label).map(r=>entry(r,`#${links.get(r.id)} ${format(r.values)}`))));
  };
  const gas=[['spo2','SpO₂ (%)'],['etco2','EtCO₂ (mmHg)'],['halogenEnd','Halogéné expiré (%)']];
  return `${trace('Événement',null,v=>v.event).join('')}${periChart(measurements,start)}${gas.map(([key,label])=>timelineRow(label,measurements.filter(r=>r.values[key]!==''&&r.values[key]!==undefined).map(r=>entry(r,r.values[key])))).join('')}
  <div class="peri-sheet-band">Médicaments administrés</div>${trace('Médicament','drug',v=>v.mode==='Arrêt de perfusion'?'Arrêt':`${v.amount} ${v.unit}`).join('')}
  <div class="peri-sheet-band">Perfusions et bilan hydrique</div>${trace('Bilan hydrique','fluid',v=>`${v.volume} mL`).join('')}`;
 }
 return `<section class="peri-sheet"><h3>Feuille de surveillance peranesthésique</h3><div class="peri-sheet-layout">${periContextChecklist(c,read)}
 <div class="peri-sheet-scroll" tabindex="0" role="region" aria-label="Grille horaire de surveillance">${Array.from(windows,([start,rows])=>`
 <section class="peri-sheet-window">
 <h4>${new Date(start*60000).toLocaleDateString('fr-FR',{timeZone:'UTC'})} · ${periClock(start)}–${periClock(start+periPeriod)}${periClock(start+periPeriod)<periClock(start)?' (J+1)':''}</h4>
 <div class="peri-sheet-row peri-sheet-times"><div class="peri-sheet-label">Heures</div>${Array.from({length:24},(_,i)=>`<div class="peri-sheet-cell">${periClock(start+i*periStep)}</div>`).join('')}</div>
 ${periodRows(rows,start)}
 </section>`).join('')}</div></div>
 <p class="peri-sheet-key"><span>▼ PAS · ▲ PAD · ■ PAM</span><span>● FC</span><span>◆ T°</span></p>
 <p class="muted peri-sheet-source">Trame d’après l’annexe 4.b du Dossier anesthésique SFAR (2002). Les colonnes regroupent les saisies par tranches de 10 min. Les horaires exacts, les détails et les valeurs hors échelle figurent dans les relevés et le journal.</p></section>`;
}
function periTable(records){const rows=periSorted(records.filter(r=>r.kind==='Surveillance'&&!r.voided));return rows.length?`<div class="peri-scroll"><table class="peri-table"><caption>Relevés de surveillance</caption><thead><tr><th>Date / heure</th><th>Halogéné</th>${periVitals.map(([,l,u])=>`<th>${l}<small>${u}</small></th>`).join('')}<th>Clinique</th><th>Source</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${esc(periTime(r.at))}</th><td>${esc(r.values.halogenAgent||'—')}</td>${periVitals.map(([k])=>`<td>${esc(r.values[k]??'—').replace(/^$/,'—')}</td>`).join('')}<td>${esc(r.values.clinical||'—')}</td><td>${esc(r.photo?'Photo · '+(r.photo.validatedBy||r.author):r.values.source||'Saisie manuelle')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Aucun relevé enregistré. Une case vide signifie « non renseigné ».</p>'}
let periPane='Surveillance';
const periDrugEvidence=[
 ['Kétamine','Analgésie IV chez l’adulte sous AG, pour chirurgie très douloureuse ou patient vulnérable à la douleur.','SFAR 2016 (R3.8) / RCP : après induction, dose initiale maximale de 0,5 mg/kg ; si perfusion retenue, 0,125 à 0,25 mg/kg/h selon le référentiel. Vérifier le RCP de la spécialité et le protocole local.','La revue Cochrane retrouve une diminution de la douleur et de la consommation d’opioïdes en postopératoire.',['RFE SFAR','https://sfar.org/reactualisation-de-la-recommandation-sur-la-douleur-postoperatoire/'],['RCP','https://base-donnees-publique.medicaments.gouv.fr/medicament/67132571/extrait'],['Cochrane 2018','https://www.cochrane.org/evidence/CD012033_ketamine-venous-injection-acute-pain-after-operation-adults']],
 ['Sulfate de magnésium','Adjuvant antalgique IV étudié chez l’adulte.','Pas de posologie antalgique de référence proposée ici. Les schémas des essais diffèrent ; ne pas transposer les doses d’autres indications.','La méta-analyse de 2026 retrouve environ 6 mg d’équivalent morphine en moins, mais avec une forte hétérogénéité (I² ≈ 96 %) : ce résultat ne définit pas un protocole.',['Méta-analyse 2026','https://pubmed.ncbi.nlm.nih.gov/42653792/'],['Dossier de preuves SFAR','https://sfar.org/wp-content/uploads/2016/08/3-Tableaux-Reactualisation-de-la-recommandation-sur-la-douleur-postoperatoire.pdf']],
 ['Lidocaïne (Xylocaïne)','Analgésie IV chez l’adulte sélectionné ; distincte de l’infiltration ou de l’ALR. Médicament à haut risque selon le consensus.','Consensus international 2021 : au plus 1,5 mg/kg de poids idéal sur 10 min, puis au plus 1,5 mg/kg/h et 120 mg/h, pour 24 h au maximum avec réévaluation. Pas chez les patients de moins de 40 kg selon ce consensus. Ne pas associer à d’autres interventions sous anesthésiques locaux ; vérifier les délais autour des blocs et le protocole local.','La revue Cochrane souligne l’incertitude sur plusieurs bénéfices et sur les effets indésirables.',['Consensus 2021','https://doi.org/10.1111/anae.15270'],['Cochrane 2018','https://www.cochrane.org/evidence/CD009642_intravenous-infusion-lidocaine-starting-time-surgery-reduction-pain-and-improvement-recovery-after']],
 ['Noradrénaline','Hypotension après rachianesthésie ou induction d’AG chez l’adulte. Exemple limité à CRONOMIR 10 µg/mL de tartrate.','RCP : débit initial de 0,04 à 0,10 µg/kg/min de tartrate (0,02 à 0,05 µg/kg/min de base). Bolus initial possible avant perfusion : 10 à 20 µg de tartrate (5 à 10 µg de base). Vérifier la spécialité, la concentration et l’expression base/sel avant administration ; titrer sous surveillance selon la cible médicale.','Ces doses proviennent du RCP de cette présentation ; elles ne se transposent pas aux autres concentrations.',['RCP CRONOMIR','https://m.base-donnees-publique.medicaments.gouv.fr/rcp-60385077-10'],['Avis HAS','https://www.has-sante.fr/jcms/p_3376978/fr/cronomir-21092022-avis-ct19820']]
];
function periEvidencePanel(){
 return `<details class="references no-print"><summary>Repères de posologie et résultats des études · adulte</summary><p class="muted">Référentiel documentaire. Les doses de référence ne remplissent jamais le journal des administrations.</p>${periDrugEvidence.map(([name,context,dose,result,...refs])=>`<details class="peri-context"><summary>${esc(name)}</summary><p>${esc(context)}</p><p><strong>Posologie et limites :</strong> ${esc(dose)}</p><p><strong>Résultat ou statut des preuves :</strong> ${esc(result)}</p><ul>${refs.map(([label,url])=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`).join('')}</ul></details>`).join('')}</details>`;
}
const periBdpmReferences={
 '66110981':[
  ['Induction de l’AG IV · adulte de moins de 55 ans','1,5 à 2,5 mg/kg chez la plupart des patients, en titrant selon la réponse. Réduire et ralentir chez le sujet âgé ou fragile. Voir les limites spécifiques en cas d’ASA IV.'],
  ['Entretien de l’AG IV · adulte','En général 6 à 12 mg/kg/h selon la profondeur recherchée. Les besoins sont habituellement réduits après 55 ans.']
 ],
 '62768665':[
  ['Analgésie peropératoire IV','Après induction, jusqu’à 0,5 mg/kg de kétamine base, ou perfusion à 0,125–0,25 mg/kg/h. Arrêt de la perfusion 30 min avant la fin du geste.'],
  ['Induction de l’AG IV','1 à 4,5 mg/kg de kétamine base, en moyenne 2 mg/kg. Injection lente sur environ 60 secondes.']
 ],
 '69278297':[
  ['Analgésie peropératoire IV','Après induction, jusqu’à 0,5 mg/kg de kétamine base, ou perfusion à 0,125–0,25 mg/kg/h. Arrêt de la perfusion 30 min avant la fin du geste.'],
  ['Induction de l’AG IV','1 à 4,5 mg/kg de kétamine base, en moyenne 2 mg/kg. Injection lente sur environ 60 secondes.']
 ],
 '60385077':[
  ['Hypotension après rachianesthésie ou induction d’AG · perfusion IV initiale','0,04–0,10 µg/kg/min de tartrate, soit 0,02–0,05 µg/kg/min de noradrénaline base. Titrer sur la cible de pression artérielle.'],
  ['Même indication · bolus IV éventuel','10–20 µg de tartrate, soit 5–10 µg de base. Cette spécialité contient 10 µg/mL de tartrate (5 µg/mL de base).']
 ],
 '60181733':[
  ['Anesthésie locale par infiltration','Le RCP fixe un plafond de 200 mg chez l’adulte pour l’infiltration locale. Consulter le tableau de la rubrique 4.2 pour la technique et le site.']
 ],
 '61106121':[
  ['Traitement curatif des torsades de pointe','2 g de sulfate de magnésium heptahydraté (8 mmol de magnésium-élément) en IV lente, puis 3 à 20 mg/min du sel selon le RCP. Ce repère concerne les torsades.']
 ],
 '60149276':[
  ['Hypotension en anesthésie · adulte','3 à 6 mg IV. Répétition selon le besoin toutes les 5 à 10 min. Si la réponse est insuffisante, réévaluer le traitement.']
 ],
 '67527248':[
  ['Intubation d’induction de routine · adulte','0,6 mg/kg IV de bromure de rocuronium.'],
  ['Intubation en séquence rapide · adulte','1 mg/kg IV de bromure de rocuronium selon ce RCP. Voir les cas particuliers, notamment l’obstétrique.']
 ],
 '69819023':[
  ['AG balancée IV · intervention de 1 à 2 heures','À l’induction, 0,1 à 2 µg/kg en association anesthésique. Le RCP décrit des réinjections de 10 à 25 µg selon les signes cliniques et la tolérance à la dose initiale.']
 ],
 '61271062':[
  ['Nausées et vomissements postopératoires · adulte','4 mg par voie IV lente sur au moins 30 secondes. Consulter les précautions liées au QT dans le RCP.']
 ],
 '64454154':[
  ['Douleur de courte durée · adulte de plus de 50 kg','1 g en perfusion IV de 15 min. Maximum total de paracétamol de 4 g/24 h sans facteur additionnel d’hépatotoxicité et 3 g/24 h en présence de tels facteurs. Intervalle usuel d’au moins 4 h. Voir le RCP pour l’adaptation rénale et les poids inférieurs.']
 ]
};
function periBdpmPanel(){
 return `<section class="bdpm-panel" data-bdpm aria-label="Catalogue des médicaments">
  <h4>Catalogue des médicaments · BDPM</h4>
  <label>Rechercher par DCI, spécialité ou code CIS<input id="peri-drug-query" type="search" autocomplete="off" placeholder="Propofol, Xylocaïne, 60385077…"></label>
  <label class="bdpm-history"><input type="checkbox">Inclure les spécialités hors sélection active et commercialisée</label>
  <p class="muted" role="status"></p>
  <div data-bdpm-results></div><div data-bdpm-details></div>
  <p class="muted bdpm-meta" data-bdpm-version></p>
  <p class="bdpm-meta">Consulter la rubrique 4.2 du RCP pour la posologie complète. La dose réellement administrée se saisit ci-dessous.</p>
  <a class="bdpm-meta" href="https://base-donnees-publique.medicaments.gouv.fr/" target="_blank" rel="noopener noreferrer">Base de données publique des médicaments</a>
 </section>`;
}
function perop(){
 const d=periData(),contextRead=role!=='Anesthésiste';
 const pane=nurseProfile()?'Surveillance':periPane;
 const read=!periCanWrite(pane);
 const consultation=consultData(),announcement=publishedSurgery(p())?.fields;
 const c={operation:consultation.operation||announcement?.procedure||'',
  date:consultation.surgeryDate||announcement?.date||'',surgeon:consultation.surgeon||announcement?.surgeon||'',...d.context};
 const linked=periSorted(d.records).filter(r=>!r.voided&&r.kind!=='Surveillance');
 const references=new Map(linked.map((r,i)=>[r.id,i+1]));
 $('#content').innerHTML=`<div class="consult-heading"><div><p class="eyebrow">FEUILLE D’ANESTHÉSIE</p><h3>Peropératoire · ${esc(p().id)}</h3></div><button class="secondary no-print" id="periprint">Imprimer la feuille</button></div><div class="notice no-print">Simulation · saisie manuelle, sans connexion au moniteur. Les administrations sont distinctes des prescriptions. Données conservées uniquement pendant cette session.</div><details class="peri-context no-print"><summary>Intervention et équipe</summary><form id="pericontext"><fieldset ${contextRead?'disabled':''}><div class="formgrid">${periTeamFields.map(([key,label,type])=>periField(key,label,type,c[key]||'')).join('')}</div><button class="primary">Enregistrer le contexte</button></fieldset></form></details>${periSheet(d.records,c,references,contextRead)}<section class="peri-entry no-print"><div class="tabs peri-tabs" aria-label="Type de saisie peropératoire">${(nurseProfile()?['Surveillance']:['Surveillance','Médicament','Événement','Bilan hydrique']).map(k=>`<button class="${pane===k?'active':''}" data-peri-pane="${k}" aria-pressed="${pane===k}">${k}</button>`).join('')}</div>${pane==='Médicament'?periEvidencePanel():''}<form id="perientry"><fieldset ${read?'disabled':''}><div class="formgrid">${periField('at','Date et heure de réalisation','datetime-local',periNow(),'required')}${periField('author','Auteur de la saisie (scénario fictif)','text','','required')}${pane==='Surveillance'?periVitals.map(([k,l,u])=>periField(k,l+' ('+u+')','number','','min="0" step="any"'+(['spo2','fio2','halogenEnd'].includes(k)?' max="100"':''))).join('')+periField('halogenAgent','Agent halogéné','text')+'<label class="wide">Surveillance clinique : ventilation, auscultation, perfusion, peau, profondeur, installation…<textarea name="clinical"></textarea></label>':pane==='Médicament'?`${periBdpmPanel()}<input name="drugCis" type="hidden">${periField('drug','Spécialité administrée ou saisie manuelle','text','','required')}<label>Administration<select name="mode"><option>Bolus</option><option>Début de perfusion</option><option>Modification de débit</option><option>Arrêt de perfusion</option></select></label>${periField('amount','Dose administrée ou débit','number','','min="0" step="any"')}<label>Unité<select name="unit"><option value="">Choisir explicitement</option>mg</option><option>µg</option><option>g</option><option>UI</option><option>mL</option><option>mg/h</option><option>µg/h</option><option>µg/min</option><option>µg/kg/h</option><option>µg/kg/min</option><option>mg/min</option><option>mmol</option><option>mmol/h</option><option>mg/kg</option><option>µg/kg</option><option>mg/kg/h</option><option>mL/h</option><option>%</option></select></label>${periField('route','Voie','text','','required')}${periField('concentration','Concentration administrée / dilution','text')}<label class="wide">Site, dispositif, motif ou précisions<textarea name="note"></textarea></label>`:pane==='Événement'?`<label>Repère<select name="event"><option>Entrée en salle</option><option>Check-list</option><option>Début d’anesthésie</option><option>Gestion des voies aériennes</option><option>ALR</option><option>Incision</option><option>Garrot</option><option>Incident / intervention clinique</option><option>Fin de chirurgie</option><option>Extubation</option><option>Transfert SSPI</option><option>Autre</option></select></label><label class="wide">Observation et conduite réalisée<textarea name="note" required></textarea></label>`:`<label>Nature<select name="fluid"><option>Soluté administré</option><option>Produit sanguin administré</option><option>Diurèse mesurée</option><option>Pertes sanguines estimées</option><option>Autre perte</option></select></label>${periField('volume','Volume (mL)','number','','required min="0" step="any"')}${periField('product','Produit / nature / référence','text')}<label class="wide">Précisions<textarea name="note"></textarea></label>`}</div><button class="primary">Ajouter : ${esc(pane.toLowerCase())}</button></fieldset></form>${read?'<p class="muted">Lecture seule pour le profil chirurgien simulé.</p>':''}</section><section class="peri-trend">${periTable(d.records)}</section><section class="peri-journal"><h3>Journal chronologique · administrations et événements</h3><p class="muted">Heure de réalisation et heure de saisie conservées. Une annulation garde la ligne et son motif.</p>${d.records.length?periSorted(d.records).map(r=>`<article class="peri-record ${r.voided?'peri-voided':''}"><div class="row"><strong>${references.has(r.id)?'#'+references.get(r.id)+' · ':''}${esc(periTime(r.at))} · ${esc(r.kind)}</strong><span class="pill">${esc(r.author)}</span></div><p>${esc(periDescription(r))}</p><small>Saisi le ${esc(periTime(r.created))} · ${esc(r.role)}</small>${r.voided?`<p>Annulé par ${esc(r.voided.by)} : ${esc(r.voided.reason)}</p>`:!periCanVoid(r)?'':`<button class="textbutton no-print" data-peri-void="${r.id}">Annuler cette saisie avec un motif</button>`}</article>`).join(''):'<div class="empty">Aucune donnée peropératoire saisie pour ce séjour.</div>'}</section>`;
 bindPeriChecklist(d,contextRead);
 $('#periprint').onclick=()=>{document.body.classList.add('print-perop');window.print();document.body.classList.remove('print-perop')};
 $('#pericontext').onsubmit=e=>{e.preventDefault();if(role!=='Anesthésiste')return;Object.assign(d.context,Object.fromEntries(new FormData(e.currentTarget)));event('Contexte peropératoire enregistré','Peropératoire');perop();toast('Contexte enregistré dans le dossier de démonstration')};
 document.querySelectorAll('[data-peri-pane]').forEach(b=>b.onclick=()=>{if($('#perientry').dataset.dirty==='true'&&!window.confirm('Changer de rubrique et abandonner la saisie non enregistrée ?'))return;periPane=b.dataset.periPane;perop()});
 const entryForm=$('#perientry');
 if(pane==='Médicament')window.ParcoursBdpm.mount(entryForm,periBdpmReferences,esc);
 entryForm.oninput=e=>{if(!e.target.closest('[data-bdpm]'))entryForm.dataset.dirty='true'};
 $('#perientry').onsubmit=e=>{e.preventDefault();if(!periCanWrite(pane))return;const v=Object.fromEntries(new FormData(e.currentTarget));const error=periValidate(pane,v);if(error){toast(error);return}const r={id:'PERI-'+crypto.randomUUID(),kind:pane,at:v.at,author:v.author.trim(),created:new Date().toISOString(),role,values:v};d.records.push(r);event('Saisie peropératoire : '+r.kind+' · '+periTime(r.at),'Peropératoire');perop();toast('Saisie ajoutée à la feuille de ce séjour')};
 document.querySelectorAll('[data-peri-void]').forEach(b=>b.onclick=()=>{const r=d.records.find(record=>record.id===b.dataset.periVoid);if(!r||!periCanVoid(r)||r.voided)return;const reason=window.prompt('Motif obligatoire de l’annulation (la ligne reste visible) :');if(!reason?.trim())return;r.voided={reason:reason.trim(),by:role,at:new Date().toISOString()};event('Saisie peropératoire annulée : '+r.kind+' · '+reason.trim(),'Peropératoire');perop()});
}
function periValidate(kind,v){if(!v.at||!Number.isFinite(new Date(v.at).getTime())||!v.author?.trim())return 'Date, heure et auteur sont obligatoires.';if(kind==='Surveillance'&&!periVitals.some(([k])=>v[k]!==''&&v[k]!==undefined)&&!v.halogenAgent?.trim()&&!v.clinical?.trim())return 'Renseignez au moins une constante ou une observation clinique.';if(kind==='Surveillance')for(const[k]of periVitals){if(v[k]!==''&&v[k]!==undefined&&(!Number.isFinite(Number(v[k]))||Number(v[k])<0||(['spo2','fio2','halogenEnd'].includes(k)&&Number(v[k])>100)))return 'Valeur ou unité à vérifier : '+k}if(kind==='Médicament'){if(!v.drug?.trim()||!v.route?.trim())return 'Médicament et voie obligatoires.';if(v.mode!=='Arrêt de perfusion'&&(!v.unit||!Number.isFinite(Number(v.amount))||Number(v.amount)<=0))return 'Précisez une dose ou un débit strictement positif et son unité.'}return ''}
function periDescription(r){const v=r.values;if(r.kind==='Surveillance')return periVitals.filter(([k])=>v[k]!==''&&v[k]!==undefined).map(([k,l,u])=>l+' '+v[k]+' '+u).concat(v.halogenAgent?['Halogéné '+v.halogenAgent]:[],v.clinical||[],r.photo?['Source : photo ('+(r.photo.type==='tendances'?'tendances imprimées':'écran du moniteur')+'), validée par '+(r.photo.validatedBy||r.author)]:[]).join(' · ');if(r.kind==='Médicament')return [v.drug,v.drugCis?'CIS '+v.drugCis:'',v.mode,v.amount!==''?[v.amount,v.unit].join(' '):'',v.route,v.concentration,v.note].filter(Boolean).join(' · ');if(r.kind==='Événement')return v.event+' · '+v.note;return [v.fluid,v.volume+' mL',v.product,v.note].filter(Boolean).join(' · ')}


const scienceModules=[['general','Parcours & conduite à tenir'],['abx','Antibioprophylaxie'],['pbm','Hémoglobine / fer'],['vte','Thromboprophylaxie'],['anticoag','Anticoagulants'],['has','HAS / SFAR'],['hem','Hémostase · HEMSTOP'],['perop','Repères peropératoires'],['iv','Médicaments IV'],['board','Actions & cohérence']];
let scienceBridge=null;
// The sandboxed scientific frame has an opaque origin, requiring '*' for delivery.
// Receivers validate the expected window, origin and per-frame token.
function scienceSend(type,extra={}){if(scienceBridge)$('#scienceframe')?.contentWindow?.postMessage({channel:'parcours-science',token:scienceBridge.token,type,...extra},'*')}
function science(){
 const x=p();x.science??={state:{},summaries:[]};const token='SCI-'+Date.now()+'-'+Math.random().toString(36).slice(2);scienceBridge={stay:x.id,token};
 $('#content').innerHTML=`<section class="science-shell"><div class="consult-heading"><div><p class="eyebrow">APPLICATION INITIALE RESTAURÉE</p><h3>Aide scientifique · V0.22</h3></div><span class="pill">${esc(x.id)}</span></div><p>Les dix modules, formulaires, algorithmes et références de l’application initiale sont réunis ici. La feuille peropératoire et le dossier clinique restent accessibles dans les autres onglets.</p><div class="notice">Règles et sources d’origine récupérées, sans revalidation clinique complète. Les résultats restent des propositions à relire. La saisie scientifique appartient à ce séjour et disparaît au rechargement, comme les autres données de démonstration.</div><div class="science-toolbar"><label>Accès direct à un module<select id="sciencemodule">${scienceModules.map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><button class="secondary" id="scienceprefill">Reprendre les données chiffrées de consultation</button><button class="secondary" id="scienceexport">Préparer une synthèse pour le dossier</button></div><p id="sciencestatus" class="muted" role="status">Chargement de l’application initiale…</p><iframe id="scienceframe" title="Application initiale Parcours Anesthésie V0.22, séjour ${esc(x.id)}" src="scientifique-v022.html#bridge=${token}&theme=${document.documentElement.dataset.theme==='dark'?'dark':'light'}" sandbox="allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe><details class="science-exports"><summary>Synthèses relues rattachées au séjour (${x.science.summaries.length})</summary>${x.science.summaries.map(s=>`<article class="rx"><strong>${esc(s.at)} · ${esc(s.author)}</strong><p class="preserve">${esc(s.text)}</p></article>`).join('')||'<p>Aucune synthèse rattachée.</p>'}</details><div id="sciencereview"></div><details><summary>Traçabilité de la récupération</summary><p>Source : Parcours_Anesthesie_V0.22_Collegues.html, version du 8 octobre 2026. Le code clinique d’origine est conservé. Aucun score ni résultat n’est enregistré comme prescription ou administration.</p><a href="scientifique-v022-original.html" target="_blank" rel="noopener">Ouvrir la version originale intégrale</a></details></section>`;
 $('#sciencemodule').onchange=e=>scienceSend('module',{module:e.target.value});
 $('#scienceprefill').onclick=()=>{const d=consultData();scienceSend('prefill',{values:{age:d.age,weight:d.weight,height:d.height,hb:d.hb,egfr:d.egfr,asa:({I:'1',II:'2',III:'3',IV:'4',V:'5'})[d.asa]}})};
 $('#scienceexport').onclick=()=>scienceSend('export');
}
window.addEventListener('message',e=>{
 const frame=$('#scienceframe'),b=scienceBridge,m=e.data;if(e.origin!=='null'||!frame||e.source!==frame.contentWindow||!b||m?.channel!=='parcours-science'||m.token!==b.token)return;
 const x=patients.find(x=>x.id===b.stay);if(!x)return;x.science??={state:{},summaries:[]};
 if(m.type==='loaded')scienceSend('init',{stay:x.id,state:x.science.state});
 if(m.type==='state'&&m.state&&typeof m.state==='object'){x.science.state=structuredClone(m.state);$('#sciencestatus').textContent='Saisie scientifique rattachée à '+x.id+' · session en cours'}
 if(m.type==='ready'){$('#sciencestatus').textContent='Outils disponibles · '+x.id;if(!b.integrated)scienceSend('module',{module:$('#sciencemodule').value})}
 if(m.type==='prefilled')$('#sciencestatus').textContent='Données chiffrées reprises. Confirmez le geste, les traitements et les autres critères dans chaque module.';
 if(m.type==='summary'&&typeof m.text==='string'){
 $('#sciencereview').innerHTML=`<section class="workflow-form"><h3>Relire avant rattachement au dossier</h3><p class="muted">Vérifiez les données saisies, les indications et les références. Modifiez ce brouillon si nécessaire.</p><label>Synthèse scientifique<textarea id="science-summary-text" rows="16">${esc(m.text)}</textarea></label><label class="check"><input type="checkbox" id="science-reviewed">J’ai relu cette synthèse pour le séjour ${esc(x.id)}.</label><button class="primary" id="scienceattach" ${role!=='Anesthésiste'?'disabled':''}>Rattacher la synthèse relue au séjour</button></section>`;
 $('#scienceattach').onclick=()=>{if(role!=='Anesthésiste')return;if(!$('#science-reviewed').checked){toast('Confirmez la relecture avant rattachement');return}const text=$('#science-summary-text').value.trim();if(!text){toast('La synthèse est vide');return}x.science.summaries.push({text,at:new Date().toLocaleString('fr-FR'),author:doctorName(activeDoctor)});traceFor(x,'Synthèse scientifique V0.22 relue et rattachée au séjour','Aide scientifique');science();toast('Synthèse relue rattachée au séjour dans le dossier de démonstration')};
 }
});

// Consultation et calculateurs : données partagées, décisions relues et invalidation.
const integratedModules={context:['general','has'],history:['hem','general'],medications:['anticoag','iv'],exam:['perop'],tests:['pbm'],plan:['abx','vte','perop','iv'],information:['has'],conclusion:['board','has']};
let integratedModule='';
function integratedShared(d){const number=k=>d[k]??'';return {age:number('age'),sex:number('sex'),weight:number('weight'),height:number('height'),hb:number('hb'),egfr:number('egfr'),pbmFerritin:number('ferritin'),pbmTsat:number('tsat'),asa:({I:'1',II:'2',III:'3',IV:'4',V:'5'})[d.asa]||'',mall:d.mallampati||''}}
function integratedFingerprint(x){
 const fields=['age','sex','weight','height','operation','operationDetails','surgeryDate','urgency','history','cardio','respiratory','renal','neuro','asa','allergyReviewed','allergies','bleedingHistory','vteHistory','treatments','hb','platelets','creatinine','egfr','ferritin','tsat','crp','mallampati','mouthOpening','neck','airwayConclusion'];
 const c=x.consult,d={...c.ext,asa:c.asa,history:c.history,allergies:c.allergies,treatments:c.treatments};
 const state=Object.entries(x.science?.state||{}).filter(([k])=>!k.startsWith('__')&&!/^(owner-|due-|status-|export|copy|abxSearch|vteSearch|acProcedureSearch|hasSearch|hasFilter)/.test(k)).sort(([a],[b])=>a.localeCompare(b));
 return JSON.stringify([fields.map(k=>[k,d[k]??'']),state]);
}
function integratedDecisionHTML(x){const entries=x.scientificDecisions||[];if(!entries.length)return '<p class="muted">Aucune décision scientifique relue pour ce séjour.</p>';return entries.map(r=>{const stale=r.fingerprint!==integratedFingerprint(x);return `<article class="integrated-decision"><div class="row"><strong>${esc(scienceModules.find(([id])=>id===r.module)?.[1]||r.module)}</strong><span class="pill ${stale?'warn':'good'}">${stale?'À réévaluer · données modifiées':'Relecture enregistrée'}</span></div><p class="preserve">${esc(r.text)}</p><details><summary>Résultat et références relus</summary><p class="preserve">${esc(r.result||'Résultat non archivé')}</p></details><small>${esc(r.at)} · ${esc(r.author)} · source V0.22</small></article>`}).join('')}
function integratedMount(section){
 const body=$('.consult-body');if(!body)return;
 if(section==='summary')return;
 const modules=integratedModules[section]||['general'];if(!modules.includes(integratedModule))integratedModule=modules[0];
 body.insertAdjacentHTML('beforeend',`<section class="integrated-science no-print"><div class="row"><div><p class="eyebrow">AIDE À LA DÉCISION · DANS LA CONSULTATION</p><h3>${section==='tests'?'Optimisation de l’hémoglobine':section==='medications'?'Stratégie médicamenteuse':section==='history'?'Évaluation du risque':section==='plan'?'Préparation guidée':'Repères scientifiques'}</h3></div><button type="button" class="secondary" id="integratedopen">Ouvrir les outils</button></div><p class="muted">Les données chiffrées viennent de la consultation. Les critères spécifiques restent à confirmer dans le module ; aucune proposition n’est une prescription.</p><div class="integrated-tabs">${modules.map(id=>`<button class="secondary ${id===integratedModule?'chosen':''}" data-integrated-module="${id}">${esc(scienceModules.find(([k])=>k===id)?.[1]||id)}</button>`).join('')}</div><div id="integratedtools" hidden><div class="integrated-shared" id="integratedshared"></div><p id="sciencestatus" class="muted" role="status"></p><div id="integratedframehost"></div><div class="actions"><button type="button" class="secondary" id="integratedrefresh">Actualiser depuis la consultation</button><button type="button" class="primary" id="integratedresult">Relire le résultat et documenter ma décision</button></div><div id="integratedreview"></div></div></section><section class="integrated-decisions"><h3>Décisions scientifiques du séjour</h3><div id="integrateddecisions">${integratedDecisionHTML(p())}</div></section>`);
 $('#integratedopen').onclick=()=>integratedOpen();
 document.querySelectorAll('[data-integrated-module]').forEach(b=>b.onclick=()=>{integratedModule=b.dataset.integratedModule;document.querySelectorAll('[data-integrated-module]').forEach(t=>t.classList.toggle('chosen',t===b));integratedOpen()});
 $('#integratedrefresh').onclick=()=>{captureConsult();scienceSend('shared',{values:integratedShared(consultData())});$('#integratedreview').innerHTML='';$('#sciencestatus').textContent='Données actualisées · recalculer puis relire le résultat.'};
 $('#integratedresult').onclick=()=>{captureConsult();scienceSend('result',{module:integratedModule})};
}
function integratedOpen(){
 captureConsult();$('#integratedtools').hidden=false;$('#integratedopen').hidden=true;
 if($('#scienceframe')){scienceSend('module',{module:integratedModule});return}
 const x=p();x.science??={state:{},summaries:[]};const token='INT-'+Date.now()+'-'+Math.random().toString(36).slice(2);scienceBridge={stay:x.id,token,integrated:true};
 $('#integratedframehost').innerHTML=`<iframe id="scienceframe" class="integrated-frame" title="Aide scientifique intégrée au séjour ${esc(x.id)}" src="scientifique-v022.html#bridge=${token}&integrated=1&theme=${document.documentElement.dataset.theme==='dark'?'dark':'light'}" sandbox="allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe>`;
 $('#sciencestatus').textContent='Chargement des outils de cette rubrique…';
 integratedSharedDisplay();
}
function integratedSharedDisplay(){const e=$('#integratedshared');if(!e)return;const d=consultData();e.textContent=['Données partagées',...['age','weight','height','hb','egfr','ferritin','tsat'].map(k=>({age:'Âge',weight:'Poids',height:'Taille',hb:'Hb',egfr:'DFG',ferritin:'Ferritine',tsat:'CST'}[k])+': '+(d[k]||'non renseigné'))].join(' · ')}
function integratedNotifyChange(){if(!scienceBridge?.integrated||!$('#scienceframe'))return;scienceSend('shared',{values:integratedShared(consultData())});integratedSharedDisplay();if($('#integratedreview'))$('#integratedreview').innerHTML='';if($('#integrateddecisions'))$('#integrateddecisions').innerHTML=integratedDecisionHTML(p());}
window.addEventListener('message',e=>{
 const b=scienceBridge,m=e.data,frame=$('#scienceframe');if(e.origin!=='null'||!b?.integrated||!frame||e.source!==frame.contentWindow||m?.channel!=='parcours-science'||m.token!==b.token)return;
 const x=patients.find(x=>x.id===b.stay);if(!x||x.id!==selected)return;
 if(m.type==='ready'){scienceSend('shared',{values:integratedShared(consultData())});scienceSend('module',{module:integratedModule});integratedSharedDisplay()}
 if(m.type==='state'&&$('#integrateddecisions'))$('#integrateddecisions').innerHTML=integratedDecisionHTML(x);
 if(m.type==='result'&&typeof m.text==='string'){
 const fingerprint=integratedFingerprint(x),module=m.module;
 $('#integratedreview').innerHTML=`<section class="workflow-form"><h3>Résultat à relire · ${esc(scienceModules.find(([id])=>id===module)?.[1]||module)}</h3><div class="notice ${['review','incomplete','scope'].includes(m.status)?'warn':''}">${['review','incomplete','scope'].includes(m.status)?'Évaluation incomplète ou avis spécifique requis. Complétez les critères avant de retenir une proposition.':'Proposition du module d’origine : vérifier les données, le périmètre et les sources.'}</div><details open><summary>Résultat et références</summary><p class="preserve">${esc(m.text)}</p></details><label>Ma décision et sa justification<textarea id="integrateddecision" placeholder="Décision retenue, réserves, consignes et éléments à compléter"></textarea></label><label class="check"><input type="checkbox" id="integratedchecked">J’ai relu les données et le résultat pour ce séjour.</label><button class="primary" id="integratedaccept" ${role!=='Anesthésiste'||x.consult.validated?'disabled':''}>Enregistrer ma décision dans la consultation</button><p class="muted">Cette action documente la consultation. Les prescriptions et administrations restent dans leurs onglets.</p></section>`;
 $('#integratedaccept').onclick=()=>{if(role!=='Anesthésiste'||x.consult.validated)return;if(integratedFingerprint(x)!==fingerprint){$('#integratedreview').innerHTML='<div class="notice warn">Les données ont changé. Recalculez le résultat avant relecture.</div>';return}const decision=$('#integrateddecision').value.trim();if(!decision||!$('#integratedchecked').checked){toast('Précisez votre décision et confirmez la relecture');return}const record={module,text:decision,result:m.text,status:m.status,fingerprint,at:new Date().toLocaleString('fr-FR'),author:doctorName(activeDoctor)};x.scientificDecisions??=[];x.scientificDecisionHistory??=[];x.scientificDecisionHistory.push(...x.scientificDecisions.filter(r=>r.module===module));x.scientificDecisions=x.scientificDecisions.filter(r=>r.module!==module);x.scientificDecisions.push(record);traceFor(x,'Décision scientifique documentée : '+module,'Consultation');$('#integrateddecisions').innerHTML=integratedDecisionHTML(x);$('#integratedreview').innerHTML='';toast('Décision rattachée à la consultation de ce séjour')};
 }
});
const integratedOriginalConsult=consult;consult=function(){integratedOriginalConsult();if(!nurseProfile()&&!sharedWorkspace)integratedMount(consultSection)};
const integratedOriginalSummary=summaryHTML;summaryHTML=function(){return integratedOriginalSummary()+`<section class="integrated-decisions"><h3>Décisions scientifiques relues</h3>${integratedDecisionHTML(p())}</section>`};


const integratedPriorGaps=consultGaps;consultGaps=function(){const gaps=integratedPriorGaps();for(const r of p().scientificDecisions||[])if(r.fingerprint!==integratedFingerprint(p()))gaps.push('science-review-'+r.module);return gaps};
const integratedPriorLabel=cfLabel;cfLabel=function(k){return k.startsWith('science-review-')?'Décision scientifique à réévaluer : '+(scienceModules.find(([id])=>id===k.slice(15))?.[1]||k.slice(15)):integratedPriorLabel(k)};
const integratedPriorOverview=overview;overview=function(){integratedPriorOverview();$('#content').insertAdjacentHTML('beforeend',`<section class="overview-block"><h3>Décisions scientifiques de consultation</h3>${integratedDecisionHTML(p())}</section>`)};
const integratedPriorPerop=perop;perop=function(){integratedPriorPerop();if(nurseProfile())return;$('#content').insertAdjacentHTML('afterbegin','<div class="actions no-print" style="margin-bottom:20px"><button class="secondary" id="perop-science">Ouvrir les repères scientifiques peropératoires</button></div>');$('#perop-science').onclick=()=>{tab='consult';consultSection='exam';integratedModule='perop';detail();integratedOpen()}};


async function qrApi(endpoint,data){const r=await fetch('/api/questionnaire/'+endpoint,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let value;try{value=await r.json()}catch{throw Error('Service QR indisponible sur ce site de démonstration.')}if(!r.ok)throw Error(value.error||'Service indisponible.');return value}
const priorQuestionnaireReview=questionnaireReview;
questionnaireReview=function(){priorQuestionnaireReview();if(nurseProfile())return;const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='Préparer une invitation depuis une photo Doctolib';button.onclick=()=>{view='questionnaireSend';render()};$('#content').prepend(button)};

const sharedWorkspace=location.pathname==='/shared';
let sharedBusy=false,sharedView='list';
async function sharedRequest(path='',payload){
 const request=payload===undefined?{}:{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
 };
 const response=await fetch('/api/stays'+path,request);
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Service indisponible.');
 return data;
}
function sharedStayPath(stay,section){
 return '/'+stay.id.slice('DÉMO-P-'.length)+'/'+section;
}
async function sharedMutation(button,request,apply,onError){
 if(sharedBusy)return;
 sharedBusy=true;
 button.disabled=true;
 const content=$('#content');
 if(content)content.inert=true;
 const refresh=$('#shared-refresh');
 if(refresh)refresh.disabled=true;
 try{apply(await request())}
 catch(error){onError(error.message)}
 finally{sharedBusy=false;button.disabled=false;if(content)content.inert=false;if(refresh)refresh.disabled=false}
}
function renderSharedWorkspace(){
 $('#title').textContent={list:'Dossier périopératoire partagé',service:'Vue du service',search:'Recherche patient'}[sharedView];
 $('#new').hidden=true;
 $('#stats').hidden=true;
 $('#workspace').innerHTML=`<section class="panel">
  <div class="content">
   <p class="notice">Démonstration autonome · patients fictifs uniquement. Compte actif : ${esc(role)}.</p>
   <div class="actions" aria-label="Navigation du dossier partagé">
    ${[['list','Séjours partagés'],['service','Vue du service'],['search','Recherche patient']].map(([key,label])=>
     `<button type="button" class="${sharedView===key?'primary':'secondary'}" data-shared-view="${key}" aria-pressed="${sharedView===key}">${label}</button>`).join('')}
    <button type="button" class="secondary" id="shared-refresh">Actualiser les séjours</button>
   </div>
   <p id="shared-error" role="alert" class="warn"></p>
   ${sharedView==='search'?patientSearchMarkup():sharedView==='service'?serviceBoard(role!=='Secrétariat'):`
   ${role==='Secrétariat'?`<form id="shared-create" class="workflow-form">
    <h3>Créer un séjour fictif</h3>${patientIdentityFields()}
    <div class="formgrid"><label>Spécialité<select name="specialty">${optionHTML(['Orthopédie','Chirurgie digestive','ORL','Gynécologie','Urologie'])}</select></label>
    <label>Mode de prise en charge<select name="mode">${optionHTML(['Hospitalisation','Ambulatoire'])}</select></label></div>
    <button class="primary">Créer le séjour</button>
   </form>`:''}
   <h3>Séjours partagés</h3>
   <div class="shared-stays">${patients.map(stay=>role==='Secrétariat'?
    `<p>${esc(stay.id)} · ${esc(stay.specialty)} · ${esc(stay.mode)} · ${esc(stay.stage)}</p>`:
    `<button type="button" class="secondary" data-shared-stay="${esc(stay.id)}" aria-pressed="${selected===stay.id}">${esc(stay.id)} · ${esc(stay.specialty)} · ${esc(stay.stage)}</button>`).join('')||'<p>Aucun séjour partagé.</p>'}</div>
   <div id="shared-detail"></div>`}
  </div>
 </section>`;
 const error=message=>{$('#shared-error').textContent=message};
 $('#shared-refresh').onclick=async()=>{
  if(sharedBusy)return;
  if(p()?.sharedDirty&&!window.confirm('Actualiser et abandonner le brouillon local non enregistré ?'))return;
  const button=$('#shared-refresh');
  button.disabled=true;
  sharedBusy=true;
  try{await loadSharedWorkspace()}
  catch(e){error(e.message)}
  finally{sharedBusy=false;button.disabled=false}
 };
 for(const button of document.querySelectorAll('[data-shared-view]')){
  button.onclick=()=>{
   const target=button.dataset.sharedView;
   if(sharedBusy||sharedView===target)return;
   sharedView=target;
   renderSharedWorkspace();
   $(`[data-shared-view="${target}"]`).focus();
  };
 }
 const create=$('#shared-create');
 if(create)create.onsubmit=e=>{
  e.preventDefault();
  sharedMutation(e.submitter,()=>sharedRequest('',Object.fromEntries(new FormData(create))),stay=>{
   patients.unshift(stay);
   renderSharedWorkspace();
   toast('Séjour partagé créé · '+stay.id);
  },error);
 };
 const openSharedStay=id=>{
  if(sharedBusy)return;
  const current=p();
  if(selected!==id&&current?.sharedDirty){
   if(!window.confirm('Quitter le brouillon de consultation non enregistré ?'))return;
   current.consult=structuredClone(current.sharedSavedConsult);
   current.sharedDirty=false;
  }
  selected=id;
  const fromBoard=sharedView!=='list';
  if(sharedView==='service'&&p().sector&&!p().sector.startsWith('bloc-'))tab='follow';
  sharedView='list';
  renderSharedWorkspace();
  if(fromBoard)$('#shared-stay-heading').focus();
 };
 if(sharedView==='search'){
  bindPatientSearch(role==='Secrétariat'?null:openSharedStay);
 }else if(role==='Secrétariat'){
  return;
 }else if(sharedView==='service'){
  bindServiceStays(openSharedStay);
 }else{
  for(const button of document.querySelectorAll('[data-shared-stay]')){
   button.onclick=()=>openSharedStay(button.dataset.sharedStay);
  }
  if(p())renderSharedDetail();
 }
}
function renderSharedDetail(){
 const stay=p();
 $('#shared-detail').innerHTML=`<div class="shared-dossier">
  <h3 id="shared-stay-heading" tabindex="-1">${esc(stay.id)} · ${esc(stay.specialty)}</h3>
  ${stay.identity?.lastName||stay.identity?.firstName?`<p>${esc([stay.identity.lastName,stay.identity.firstName].filter(Boolean).join(' '))}</p>`:''}
  <p>Étape : ${esc(stay.stage)} · Secteur : ${esc(serviceSectors[stay.sector]||'non renseigné')}</p>
  <div class="actions">
   <button class="secondary" data-shared-tab="consult">Consultation d’anesthésie</button>
   <button class="secondary" data-shared-tab="follow">Constantes postopératoires</button>
   <button class="secondary" data-shared-tab="history">Historique</button>
  </div>
  ${role==='Anesthésiste'?`<form id="shared-stage"><label>Étape du séjour<select name="stage">${optionHTML(stages,stay.stage)}</select></label><button class="secondary">Enregistrer l’étape</button></form>`:''}
  ${role==='Anesthésiste'?`<form id="shared-sector" class="service-sector-form"><label>Secteur actuel<select name="sector">${sectorOptions(stay.sector)}</select></label><button class="secondary">Enregistrer le secteur</button></form>`:''}
  <div id="content" class="content"></div>
 </div>`;
 document.querySelectorAll('[data-shared-tab]').forEach(button=>button.onclick=()=>{
  if(sharedBusy)return;
  tab=button.dataset.sharedTab;
  renderSharedDetail();
 });
 const stageForm=$('#shared-stage');
 if(stageForm)stageForm.onsubmit=e=>{
  e.preventDefault();
  sharedMutation(e.submitter,()=>sharedRequest(sharedStayPath(stay,'stage'),{stage:stageForm.elements.stage.value}),updated=>{
   Object.assign(stay,{stage:updated.stage,events:updated.events});
   renderSharedWorkspace();
  },message=>toast(message));
 };
 const sectorForm=$('#shared-sector');
 if(sectorForm)sectorForm.onsubmit=e=>{
  e.preventDefault();
  const sector=sectorForm.elements.sector.value;
  sharedMutation(e.submitter,()=>sharedRequest(sharedStayPath(stay,'sector'),{sector,previous:stay.sector||''}),updated=>{
   Object.assign(stay,{sector:updated.sector,events:updated.events});
   renderSharedWorkspace();
   toast('Secteur du séjour enregistré');
  },message=>toast(message));
 };
 ({consult,follow,history})[tab]();
}
async function loadSharedWorkspace(){
 const data=await sharedRequest();
 role=data.role;
 patients.splice(0,patients.length,...data.stays.map(stay=>({...stay,sharedSavedConsult:structuredClone(stay.consult)})));
 if(!p())selected=patients[0]?.id;
 if(!['consult','follow','history'].includes(tab))tab=nurseProfile()?'follow':'consult';
 renderSharedWorkspace();
}
function saveSharedConsult(button,prospective){
 const stay=p();
 sharedMutation(button,()=>sharedRequest(sharedStayPath(stay,'consultation'),{consult:prospective,revision:stay.revision}),updated=>{
  Object.assign(stay,updated,{sharedDirty:false,sharedSavedConsult:structuredClone(updated.consult)});
  consult();
  toast(prospective.validated?'Consultation enregistrée et validée en simulation':'Brouillon enregistré sur le serveur de démonstration');
 },message=>{$('#consultissues').textContent=message});
}

let accessJob='',careTeams=[];
const professionalWorkspace=window.createProfessionalWorkspace({esc,toast,setProfile:(profile,teams)=>{
 accessJob=profile.profession;careTeams=teams;document.body.dataset.profession=accessJob;
 role=({anesthesiste:'Anesthésiste',chirurgien:'Chirurgien',infirmier:'Infirmier'})[accessJob]||'Infirmier';
 $('#role').value=role;$('#role').disabled=true;if($('#doctor'))$('#doctor').disabled=true;
 const details=document.querySelector('.art-profile');if(details)details.hidden=true;
 const old=$('#care-team-new');if(old)old.remove();
 if(teams.length){const label=document.createElement('label');label.id='care-team-new';label.textContent='Équipe de soins du nouveau séjour';const select=document.createElement('select');select.name='careTeamId';select.required=true;for(const team of teams){const option=document.createElement('option');option.value=team.id;option.textContent=team.label;select.append(option)}label.append(select);$('#newform').insertBefore(label,$('#newform button[type=submit]'));}
}});
let durableWorkspace=null;
const questionnaireSender=window.createPatientInvitation({$,esc,toast,patients,current:p,access:()=>professionalWorkspace.getAccess(),teams:()=>careTeams,canPrepare:()=>['anesthesiste','chirurgien','secretariat'].includes(accessJob)&&careTeams.length>0,save:async()=>{if(!durableWorkspace)throw Error('Dossier partagé indisponible.');await durableWorkspace.flush()},create:(contact,team)=>{
 const stay={id:'DÉMO-'+crypto.randomUUID().slice(0,12),identity:{lastName:contact.lastName,firstName:contact.firstName,birthDate:contact.birthDate},careTeamId:team,specialty:'À renseigner',mode:'Ambulatoire',stage:'Consultation',task:'Questionnaire patient attendu',done:false,consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},events:[]};patients.unshift(stay);selected=stay.id;return stay;
}});
const identityWorkspace=window.createIdentityWorkspace({$,esc,patients,toast,role:()=>role,navigate:id=>{if(tab==='consult')captureConsult();identityWorkspace.select(id);view='identity';render()},open:id=>{selected=id;tab=nurseProfile()?'follow':'consult';view='patients';render()}});
const detailBeforeIdentity=detail;
detail=function(){detailBeforeIdentity();const stay=p();const nursingActive=view==='patients'&&tab==='follow';$('#open-nursing-record')?.classList.toggle('active',nursingActive);document.querySelector('.nav[data-view="patients"]')?.classList.toggle('active',view==='patients'&&!nursingActive);$('#detail .detailhead').insertAdjacentHTML('beforeend',identityWorkspace.panel(stay));identityWorkspace.bindOpen();const modules={consult:'consult',overview:'core',surgeryAnnouncement:'surgicalAnnouncement',perop:'perop',rx:'rx',follow:'nursingRecord',operativeReport:'cro',discharge:'discharge',dischargeLiaison:'discharge',dischargeRx:'discharge',preparation:'prepActions',questionnaire:'questionnaire',history:'events',science:'consult',instructions:'core'};professionalWorkspace.track('stay/'+stay.id+'/'+(modules[tab]||'core'),tab);
 if(stay.identityDocumentReview&&(stay.identityDocumentReview.ordinance||stay.identityDocumentReview.liaison)){
  $('#content').insertAdjacentHTML('afterbegin','<p class="notice warn">L’identité locale a été corrigée. Les documents déjà préparés sont conservés dans leur état antérieur. Vérifiez et réenregistrez l’identité sur l’ordonnance et la lettre de liaison avant leur réimpression.</p>');
  const print=tab==='dischargeRx'&&stay.identityDocumentReview.ordinance?$('#print-discharge-rx'):tab==='dischargeLiaison'&&stay.identityDocumentReview.liaison?$('#liaison-print'):null;
  if(print)print.disabled=true;
 }
};
 // Feuille d'anesthésie : tableau de bord « bloc » en tête (maquette Scialytique, format tablette).
 const detailBeforeCockpit=detail;
 detail=function(){
  detailBeforeCockpit();
  if(tab!=='perop')return;const content=$('#content'),x=p();if(!content||!x||content.querySelector('.ck'))return;
  const records=periSorted((x.perop?.records||[]).filter(r=>!r.voided)),vit=records.filter(r=>r.kind==='Surveillance'),meds=records.filter(r=>r.kind==='Médicament');
  const last=key=>{for(let i=vit.length-1;i>=0;i--){const v=vit[i].values?.[key];if(v!==''&&v!==undefined&&v!==null)return {v:Number(String(v).replace(',','.')),at:vit[i].at}}return null};
  const fmt=n=>n==null||!Number.isFinite(n.v)?null:String(n.v).replace('.',',');
  const card=(label,key,unit,range,lo,hi,extra='')=>{const m=last(key),val=fmt(m),out=m&&Number.isFinite(m.v)&&((lo!=null&&m.v<lo)||(hi!=null&&m.v>hi));return `<div class="ck-card${out?' is-out':''}"><div class="ck-card-top"><span>${label}</span><small>${range}</small></div><strong>${val??'—'}${val?`<small>${unit}</small>`:''}</strong>${extra}${m?`<em>${esc(periTime(m.at).slice(-5))}</em>`:'<em>aucune mesure</em>'}</div>`};
  const sbp=last('sbp'),dbp=last('dbp'),map=last('map');
  const pa=`<div class="ck-card ck-pa${sbp&&(sbp.v<90||sbp.v>160)?' is-out':''}"><div class="ck-card-top"><span>PA</span><small>90–160</small></div><strong>${sbp?fmt(sbp):'—'}${dbp?'/'+fmt(dbp):''}${map?`<small>PAM ${fmt(map)}</small>`:''}</strong>${sbp?`<em>${esc(periTime(sbp.at).slice(-5))}</em>`:'<em>aucune mesure</em>'}</div>`;
  const allergy=String(x.consult?.allergies||'').trim(),known=allergy&&!/^(aucune?|néant|non|à vérifier)/i.test(allergy);
  const start=records[0]?.at?new Date(records[0].at):null,mins=start?Math.max(0,Math.round((Date.now()-start)/60000)):null,dur=mins==null?'—':String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
  const name=x.identity?.lastName?`${String(x.identity.lastName).toUpperCase()} ${x.identity.firstName||''}`:x.id;
  content.insertAdjacentHTML('afterbegin',`<section class="ck" aria-label="Tableau de bord de la feuille d’anesthésie">
   <div class="ck-strip"><div class="ck-who"><strong>${esc(name)}</strong><span>${esc(x.id)} · ${esc(x.specialty)}${x.consult?.asa&&x.consult.asa!=='Non renseigné'?' · ASA '+esc(x.consult.asa):''}</span></div>${known?`<span class="ck-allergy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>${esc(allergy.slice(0,30).toUpperCase())}</span>`:''}
    <dl class="ck-clocks"><div><dt>Début</dt><dd>${start?esc(periTime(records[0].at).slice(-5)):'—'}</dd></div><div><dt>Durée</dt><dd>${dur}</dd></div><div><dt>Heure</dt><dd class="ck-now">${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</dd></div></dl></div>
   <div class="ck-grid"><div class="ck-vitals">${pa}${card('FC','hr','/min','45–110',45,110)}${card('SpO₂','spo2','%','≥ 94',94,null)}${card('EtCO₂','etco2','mmHg','30–45',30,45)}${card('Température','temp','°C','≥ 36',36,null)}${card('Halogéné expiré','halogenEnd','%','',null,null)}</div>
   <div class="ck-meds"><h4>Dernières administrations</h4>${meds.length?`<ol>${meds.slice(-5).reverse().map(r=>`<li><span class="ck-t">${esc(periTime(r.at).slice(-5))}</span><span>${esc(r.values?.drug||'Médicament')}</span><b>${esc([r.values?.amount,r.values?.unit].filter(v=>v!==''&&v!=null).join(' '))}</b></li>`).join('')}</ol>`:'<p>Aucune administration tracée.</p>'}</div></div>
  </section>`);
 };
 // Bandeau patient et parcours en étapes (maquette Scialytique « Dossier patient »).
 const detailBeforeBanner=detail;
 detail=function(){
  detailBeforeBanner();
  const x=p(),head=document.querySelector('#detail .detailhead');if(!x||!head||head.querySelector('.pb-banner'))return;
  const c=x.consult||{},ext=c.ext||{},id=x.identity||{};
  const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)&&n>0?n:null};
  const w=num(ext.weight),h=num(ext.height),bmi=w&&h?(w/((h/100)**2)).toFixed(1).replace('.',','):null;
  const birth=id.birthDate?new Date(id.birthDate+'T12:00:00'):null;
  const age=birth?Math.floor((Date.now()-birth)/31557600000):null;
  const initials=((id.lastName||'')[0]||'')+((id.firstName||'')[0]||'');
  const name=id.lastName?`<strong>${esc(String(id.lastName).toUpperCase())}</strong> ${esc(id.firstName||'')}`:`<strong>${esc(x.id)}</strong>`;
  const allergy=String(c.allergies||'').trim(),noAllergy=/^(aucune?|néant|non|ras|pas d.allergie)/i.test(allergy),unknown=!allergy||/à vérifier|non renseign/i.test(allergy);
  const anticoag=String(c.treatments||'').match(/apixaban|rivaroxaban|dabigatran|edoxaban|warfarine|fluindione|acénocoumarol|héparine|enoxaparine|tinzaparine|AVK|AOD/i);
  const vital=(label,value,unit='')=>`<div class="pb-vital"><dt>${label}</dt><dd>${value==null||value===''?'<span class="pb-na">—</span>':esc(value)+(unit?`<small> ${unit}</small>`:'')}</dd></div>`;
  const asa=c.asa&&c.asa!=='Non renseigné'?c.asa:null,group=String(ext.bloodGroup||'').match(/\b(AB|A|B|O)\s*[+-]/i)?.[0]?.replace(/\s/g,'');
  const chips=[unknown?'<span class="pb-chip pb-warn">Allergies à vérifier</span>':noAllergy?'<span class="pb-chip pb-ok">Pas d’allergie connue</span>':`<span class="pb-chip pb-crit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>Allergie : ${esc(allergy.slice(0,48))}${allergy.length>48?'…':''}</span>`,anticoag?`<span class="pb-chip pb-warn">${esc(anticoag[0][0].toUpperCase()+anticoag[0].slice(1))} · anticoagulant</span>`:''].join('');
  const i=stages.indexOf(x.stage),labels={Consultation:'Consultation',Préopératoire:'Préparation',Intervention:'Bloc',SSPI:'SSPI',Hospitalisation:'Hospitalisation',Sortie:'Sortie'};
  head.insertAdjacentHTML('afterbegin',`<div class="pb-banner"><span class="pb-avatar" aria-hidden="true">${esc(initials.toUpperCase()||'?')}</span><div class="pb-id"><h2 class="pb-name">${name}</h2><p>${birth?`Né(e) le <span class="pb-mono">${esc(birth.toLocaleDateString('fr-FR'))}</span> (${age} ans) · `:''}Séjour <span class="pb-mono">${esc(x.id)}</span></p></div><dl class="pb-vitals">${vital('Poids',w,'kg')}${vital('Taille',h,'cm')}${vital('IMC',bmi)}${vital('ASA',asa)}${vital('Groupe',group)}</dl><div class="pb-chips">${chips}</div></div>
  <section class="pb-journey" aria-label="Parcours du séjour"><div class="pb-journey-head"><strong>${esc(x.specialty)} · ${esc(x.mode)}</strong><span>${esc(x.task||'')}</span></div><ol class="pb-steps">${stages.map((s,k)=>`<li class="${k<i?'done':k===i?'now':''}"${k===i?' aria-current="step"':''}><span class="pb-bar"></span><b>${esc(labels[s]||s)}</b><small>${k<i?'terminé':k===i?'en cours':'à venir'}</small></li>`).join('')}</ol></section>`);
  const actions=head.querySelector(':scope > .row .actions');if(actions)head.querySelector('.pb-banner').append(actions);
  head.classList.add('pb-on');
 };
const newBeforeIdentity=$('#new').onclick;$('#new').onclick=()=>{$('#new-identity-warning')?.remove();newBeforeIdentity()};
const createBeforeIdentity=$('#newform').onsubmit;
$('#newform').onsubmit=e=>{
 e.preventDefault();if(nurseProfile())return;
 const form=e.currentTarget,values=Object.fromEntries(new FormData(form));
 const matches=identityWorkspace.checkNew({lastName:values.lastName,firstName:values.firstName,birthDate:values.birthDate});
 $('#new-identity-warning')?.remove();
 if(!matches.length){createBeforeIdentity(e);return}
 const identitySnapshot=JSON.stringify(values);
 const warning=document.createElement('section');warning.id='new-identity-warning';warning.className='notice warn';
 warning.innerHTML='<h3>Identité approchante détectée</h3><p>Vérifiez s’il s’agit du même patient, d’un nouveau séjour ou d’un homonyme avant de poursuivre.</p>'+matches.map(({other,reason})=>'<p>'+esc(other.id)+' · '+esc(reason)+' <button type="button" class="secondary" data-existing-identity="'+esc(other.id)+'">Vérifier le dossier existant</button></p>').join('')+'<button type="button" class="secondary" id="confirm-distinct-stay">Créer un séjour distinct après vérification</button>';
 form.append(warning);
 warning.querySelectorAll('[data-existing-identity]').forEach(button=>button.onclick=()=>{$('#modal').close();identityWorkspace.select(button.dataset.existingIdentity);view='identity';render()});
 $('#confirm-distinct-stay').onclick=()=>{if(nurseProfile())return;if(JSON.stringify(Object.fromEntries(new FormData(form)))!==identitySnapshot){toast('Les données ont changé : vérifiez à nouveau les rapprochements');return}warning.remove();createBeforeIdentity({preventDefault(){},currentTarget:form});event('Création d’un séjour distinct après alerte d’identité approchante','Identitovigilance · simulation')};
};
const searchBeforeIdentity=bindPatientSearch;
bindPatientSearch=function(open){searchBeforeIdentity(open);const f=$('#patient-search-form');const existing=f.onsubmit;f.onsubmit=e=>{existing(e);for(const li of document.querySelectorAll('.patient-search-result')){const button=li.querySelector('[data-patient-result]');const stay=patients.find(x=>x.id===button?.dataset.patientResult);if(stay){li.insertAdjacentHTML('beforeend','<p class="muted">Identité '+esc(identityWorkspace.status(stay))+' · simulation'+(identityWorkspace.candidates(stay).length?' · Identité approchante à contrôler':'')+'</p>')}}};};
const renderBeforeIdentity=render;
render=function(){if(view==='professionalAccess'){professionalWorkspace.render();return}if(!patients.length&&!patientStandalone){$('#title').textContent='Dossiers autorisés';$('#stats').hidden=true;$('#new').hidden=!['anesthesiste','chirurgien','secretariat'].includes(accessJob);$('#workspace').innerHTML='<section class="panel"><div class="content"><h2>Aucun dossier dans votre périmètre</h2><p>Créez un séjour avec le bouton Nouveau séjour, ou vérifiez vos équipes dans Accès professionnels.</p></div></section>';return}if(view==='identity'){closeCroDictation();identityWorkspace.render();return}renderBeforeIdentity()};

const clinicManagement=window.createClinicManagement({access:()=>professionalWorkspace.getAccess(),canWrite:key=>professionalWorkspace.canWrite(({regulation:'management/reservations',pharmacy:'management/lots',activity:'management/acts',pmsi:'management/pmsi',billing:'management/invoices'})[key]),$,esc,patients,sectors:serviceSectors,toast,filters:{},role:()=>role,stats:()=>stats(),open:(id,nextTab)=>{selected=id;tab=nextTab;view='patients';render()}});
const renderBeforeManagement=render;
render=function(){$('#open-nursing-record')?.classList.remove('active');if(view==='questionnaireSend'){questionnaireSender.render();return}if(view==='professionalAccess'){professionalWorkspace.render();return}if(!patients.length&&!patientStandalone){$('#title').textContent='Dossiers autorisés';$('#stats').hidden=true;$('#new').hidden=!['anesthesiste','chirurgien','secretariat'].includes(accessJob);$('#workspace').innerHTML='<section class="panel"><div class="content"><h2>Aucun dossier dans votre périmètre</h2><p>Créez un séjour avec le bouton Nouveau séjour, ou vérifiez vos équipes dans Accès professionnels.</p></div></section>';return}if(view==='identity'){closeCroDictation();identityWorkspace.render();return}if(clinicManagement.has(view)){closeCroDictation();clinicManagement.render(view);return}renderBeforeManagement()};

// Photo des constantes (dist/constantes-photo.js) : lecture locale, relecture et validation valeur par valeur, source tracée.
const constantesPhoto=window.createConstantesPhoto?.({esc,toast,canWrite:()=>periCanWrite('Surveillance'),role:()=>role,
 author:()=>{const a=professionalWorkspace.getAccess?.();return a?.profile?.display_name||a?.profile?.name||''},
 stayLabel:()=>{const x=p();return x?.identity?.lastName?String(x.identity.lastName).toUpperCase()+' '+(x.identity.firstName||''):x?.id||''},
 records:()=>p()?.perop?.records||[],
 add:(records,info)=>{const d=periData();d.records.push(...records);event('Constantes importées depuis une photo ('+(info.mode==='tendances'?'tendances imprimées':'écran du moniteur')+') : '+records.length+' mesure(s), '+info.values+' valeur(s) relues et validées'+(info.hash?' · empreinte '+info.hash.slice(0,12):''),'Peropératoire');if(tab==='perop')detail()}});
if(constantesPhoto){
 const camera='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.6"/></svg>';
 const detailBeforePhoto=detail;
 detail=function(){
  detailBeforePhoto();
  if(tab!=='perop'||!p()||!periCanWrite('Surveillance'))return;
  const strip=document.querySelector('.ck-strip');
  if(strip&&!strip.querySelector('.ck-photo')){strip.insertAdjacentHTML('beforeend',`<button type="button" class="ck-photo no-print" data-photo-constantes>${camera}Photo des constantes</button>`)}
  const entry=document.querySelector('#perientry');
  if(entry&&(nurseProfile()||periPane==='Surveillance')&&!document.querySelector('.peri-photo-entry'))entry.insertAdjacentHTML('beforebegin',`<div class="peri-photo-entry no-print"><span>Moniteur ou tendances sous les yeux ? Prenez-les en photo : les valeurs sont proposées, vous les validez une à une.</span><button type="button" class="ck-photo" data-photo-constantes>${camera}Photo des constantes</button></div>`);
  document.querySelectorAll('[data-photo-constantes]').forEach(b=>b.onclick=()=>constantesPhoto.open());
  // Repère « source : photo » sur les cartes du tableau de bord alimentées par une photo.
  const vit=periSorted((p().perop?.records||[]).filter(r=>!r.voided&&r.kind==='Surveillance'));
  const cards=[...document.querySelectorAll('.ck-vitals .ck-card')],keys=['sbp','hr','spo2','etco2','temp','halogenEnd'];
  cards.forEach((card,i)=>{const k=keys[i];let last=null;for(let j=vit.length-1;j>=0;j--){const v=vit[j].values?.[k];if(v!==''&&v!==undefined&&v!==null){last=vit[j];break}}if(last?.photo&&!card.querySelector('.ck-src'))card.insertAdjacentHTML('beforeend',`<span class="ck-src" title="Valeur lue sur photo, relue et validée par ${esc(last.photo.validatedBy||last.author)}">${camera}photo validée</span>`)});
 };
}

// Fonctionnalités issues de la veille marché (dist/veille.js, dist/veille-regles.js).
veilleModule=window.createVeille?.({$,esc,toast,patients,stages,dossierStages,current:p,role:()=>role,job:()=>accessJob,access:()=>professionalWorkspace.getAccess(),canWrite:key=>professionalWorkspace.getAccess()?professionalWorkspace.canWrite(key):true,identityStatus:stay=>identityWorkspace.status(stay),open:(id,nextTab)=>{selected=id;tab=nextTab||'consult';view='patients';render()},goTab:key=>{if(tab==='consult')captureConsult();tab=key;detail()},setView:v=>{if(view==='patients'&&tab==='consult'&&p())captureConsult();view=v;render()}})||null;
if(veilleModule){const detailBeforeVeille=detail;detail=function(){detailBeforeVeille();veilleModule.detail(tab)};const renderBeforeVeille=render;render=function(){if(veilleModule.render(view))return;renderBeforeVeille()}}

// Améliorations 1.1 (dist/ameliorations.js) : recherche Ctrl K, verrouillage, allergies, antibioprophylaxie, étiquettes, import E-med, export, relève, NEWS2.
const ameliorations=window.createAmeliorations?.({$,esc,toast,patients,current:p,role:()=>role,job:()=>accessJob,access:()=>professionalWorkspace.getAccess(),canWrite:key=>professionalWorkspace.getAccess()?professionalWorkspace.canWrite(key):true,teams:()=>careTeams,management:()=>clinicManagement.exportState(),view:()=>view,tab:()=>tab,open:(id,nextTab)=>{if(view==='patients'&&tab==='consult'&&p())captureConsult();selected=id;tab=nextTab||(nurseProfile()?'follow':'consult');view='patients';filter='Tous';query='';render()},setView:v=>{if(view==='patients'&&tab==='consult'&&p())captureConsult();view=v;render()}})||null;
if(ameliorations){const renderBeforeAmeliorations=render;render=function(){if(ameliorations.render(view))return;renderBeforeAmeliorations()}}

// Prescriptions préopératoires de la consultation (dist/prescriptions-preop.js) : bilans, prémédication, consignes, envoi au patient.
consultModele=window.IaseloCpa&&window.createConsultationModele?window.createConsultationModele({$,esc,toast,event,frDate,sejour:id=>patients.find(x=>x.id===id),role:()=>role,medecin:()=>professionalWorkspace?.getAccess?.()?.profile?.display_name||'',onChange:()=>{consultChangeHook?.();integratedNotifyChange?.()}}):null;
const prescriptionsPreop=window.createPrescriptionsPreop?.({$,esc,toast,dossierStages,current:p,role:()=>role,job:()=>accessJob,access:()=>professionalWorkspace.getAccess(),canWrite:key=>professionalWorkspace.getAccess()?professionalWorkspace.canWrite(key):true,shared:()=>!!durableWorkspace,flush:()=>durableWorkspace?.flush()})||null;
if(prescriptionsPreop&&veilleModule){const panelBeforePreop=veilleModule.panel;veilleModule.panel=t=>prescriptionsPreop.panel(t)||panelBeforePreop(t)}

// Documents transmis par le patient et consentement d'anesthésie (dist/documents-consentement.js, espace patient).
const documentsConsentement=window.createDocumentsConsentement?.({$,esc,toast,dossierStages,current:p,role:()=>role,job:()=>accessJob,access:()=>professionalWorkspace.getAccess(),tab:()=>tab,goTab:key=>{if(tab==='consult')captureConsult();tab=key;detail()},shared:()=>!!durableWorkspace,flush:()=>durableWorkspace?.flush(),refresh:()=>durableWorkspace?.refresh?.()||Promise.resolve()})||null;
if(documentsConsentement&&veilleModule){const panelBeforeDocs=veilleModule.panel;veilleModule.panel=t=>documentsConsentement.panel(t)||panelBeforeDocs(t);const detailBeforeDocs=detail;detail=function(){detailBeforeDocs();documentsConsentement.detail(tab)}}

// Visite pré-anesthésique (dist/vpa.js) : étape dédiée entre la consultation et le peropératoire.
const vpaModule=window.createVpa?.({$,esc,toast,dossierStages,current:p,role:()=>role,job:()=>accessJob,access:()=>professionalWorkspace.getAccess(),canWrite:key=>professionalWorkspace.getAccess()?professionalWorkspace.canWrite(key):true,identityStatus:stay=>identityWorkspace.status(stay),goTab:key=>{if(tab==='consult')captureConsult();tab=key;detail()},flush:()=>durableWorkspace?.flush(),refreshHeader:()=>detail()})||null;
if(vpaModule&&veilleModule){const panelBeforeVpa=veilleModule.panel;veilleModule.panel=t=>vpaModule.panel(t)||panelBeforeVpa(t);const detailBeforeVpa=detail;detail=function(){detailBeforeVpa();vpaModule.detail(tab)}}

// Accès direct au plan de soins du séjour sélectionné.
if($('#open-nursing-record'))$('#open-nursing-record').onclick=()=>{
 if(view==='patients'&&tab==='consult'&&p())captureConsult();
 if(!p())selected=patients[0]?.id;
 view='patients';tab='follow';filter='Tous';query='';
 nursingWorkspace?.showPlan();render();
 const host=$('#nursing-host');if(host){host.tabIndex=-1;host.focus();host.scrollIntoView({block:'start',behavior:'smooth'})}
};

if(sharedWorkspace){
 document.body.dataset.sharedWorkspace='true';
 tab='initial';
 document.body.dataset.appReady='true';
 $('#workspace').textContent='Chargement des séjours partagés…';
 loadSharedWorkspace().catch(error=>window.showPatientLoadError?.(error));
}else if(!patientStandalone){
 const coreKeys=new Set(['id','specialty','mode','stage','task','sector','identity','identityAliases','identityReviewRequired','done','careTeamId']);
 const emptyStay=id=>({id,specialty:'Non renseignée',mode:'Hospitalisation',stage:'Consultation',task:'Dossier partagé',done:false,consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},events:[]});
 const shared=window.createDurableWorkspace({esc,toast,setPlanningOccupancy:rows=>professionalWorkspace.setPlanningOccupancy(rows),setAccess:a=>{if(a)professionalWorkspace.setAccess(a)},canWrite:key=>professionalWorkspace.canWrite(key),readOnly:()=>{role='Infirmier';$('#role').value=role;$('#role').disabled=true;if($('#doctor'))$('#doctor').disabled=true;},capture:()=>{if(view==='patients'&&tab==='consult'&&p())captureConsult()},render:()=>{render();document.body.dataset.appReady='true'},export:()=>{
  const out={};
  for(const stay of patients){out['stay/'+stay.id+'/core']=Object.fromEntries(Object.entries(stay).filter(([key])=>coreKeys.has(key)&&(!['secretariat','facturation','administration'].includes(accessJob)||['id','specialty','mode','stage','sector','identity','careTeamId'].includes(key))));for(const [key,value]of Object.entries(stay))if(!coreKeys.has(key)&&!['sharedSavedConsult','sharedDirty'].includes(key))out['stay/'+stay.id+'/'+key]=value;}
  for(const [key,value]of Object.entries(clinicManagement.exportState()))out['management/'+key]=value;
  out['management/patientDrafts']=patientDrafts;
  for(const [key,value]of Object.entries(identityWorkspace.exportState()))out['identities/'+key]=value;
  return out;
 },import:data=>{
  const stays=new Map(),management={},identities={};
  for(const [key,value]of Object.entries(data)){const parts=key.split('/');if(parts[0]==='stay'&&value!==null){if(!stays.has(parts[1]))stays.set(parts[1],emptyStay(parts[1]));if(parts[2]==='core')Object.assign(stays.get(parts[1]),value);else stays.get(parts[1])[parts[2]]=value;}else if(parts[0]==='management')management[parts[1]]=value;else if(parts[0]==='identities')identities[parts[1]]=value;}
  patients.splice(0,patients.length,...stays.values());if(!p())selected=patients[0]?.id;
  clinicManagement.importState(management);identityWorkspace.importState(identities);
  for(const key of Object.keys(patientDrafts))delete patientDrafts[key];Object.assign(patientDrafts,management.patientDrafts||{});
 }});
 durableWorkspace=shared;
 await shared.start();
}else{
 try { render(); document.body.dataset.appReady='true'; } catch(error) { window.showPatientLoadError?.(error); }
}
})();

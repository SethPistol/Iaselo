// Portail patient autonome : questionnaire d'anesthésie ouvert par un lien d'invitation.
// Ce fichier ne charge aucun code du dossier professionnel. Les questions et le rendu des champs
// sont repris de parcours-v8.js (lignes du questionnaire patient) ; toute modification des
// questions doit être faite aux deux endroits tant que le dossier professionnel n'importe pas ce module.
(function(){
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').style.display='none',4000)}
const patientDrafts={};
const patientTarget='invitation';
let patientStep=0;
const invitation=new URLSearchParams(location.hash.slice(1)).get('invitation');
// Le jeton ne doit pas rester dans l'historique ni être copié avec l'adresse.
if(invitation)window.history.replaceState(null,'',location.pathname);
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

async function qrApi(endpoint,data){const r=await fetch('/api/questionnaire/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(data)});let value;try{value=await r.json()}catch{throw Error('Service du questionnaire indisponible. Réessayez plus tard.')}if(!r.ok)throw Error(value.error||'Service indisponible.');return value}

function message(title,text){
 $('#workspace').innerHTML=`<section class="panel pq-portal"><div class="content"><h2 tabindex="-1" id="patient-message">${esc(title)}</h2><p>${esc(text)}</p></div></section>`;
 $('#patient-message').focus();
}
function renderPortal(){
 const draft=patientDrafts[patientTarget]||{};
 const lastPage=patientStep===patientPages.length-1;
 $('#workspace').innerHTML=`<section class="panel pq-portal" aria-label="Questionnaire médical">
 <div class="pq-meta"><div class="pq-demo">Démonstration · données fictives uniquement</div></div>
 <form id="patientform" class="pq-form">
 <div class="pq-heading"><h2 tabindex="-1" id="patient-page-title">Questionnaire médical</h2><span>Page ${patientStep+1} sur ${patientPages.length}</span></div>
 <h3 class="pq-page-label">${patientPages[patientStep]}</h3>
 ${lastPage?finalPatientPage(draft):initialPatientPage()}
 <div class="actions pq-actions">
 ${lastPage?'<button type="button" class="secondary" id="previous">Page précédente</button>':''}
 <button class="primary" type="submit">${lastPage?'Transmettre le questionnaire fictif':'Page suivante'}</button>
 </div></form></section>`;
 const form=$('#patientform');
 const addMedication=$('#patient-add-med');
 if(addMedication)addMedication.onclick=()=>{
  const table=form.querySelector('.pq-medications tbody');
  const index=table.rows.length;
  if(index>=medicationLimit)return;
  table.insertAdjacentHTML('beforeend',medicationRow(draft,index));
  table.rows[index].querySelector('input').focus();
  addMedication.hidden=index+1===medicationLimit;
 };
 if(lastPage)$('#previous').onclick=()=>{savePatientDraft(form);openPatientPage(0)};
 form.onsubmit=async e=>{
  e.preventDefault();
  savePatientDraft(form);
  if(!lastPage){openPatientPage(patientStep+1);return}
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
 const {confirmed,...answers}=patientDrafts[patientTarget];
 // Traitements transmis aussi ligne par ligne pour préremplir les traitements structurés du médecin.
 if(answers.medRows)answers.medRows=answers.medRows.filter(row=>row.some(Boolean));if(!answers.medRows?.length)delete answers.medRows;
 const button=form.querySelector('button.primary');
 button.disabled=true;
 try{
  await qrApi('submit',{token:invitation,answers,confirmed:confirmed==='on'});
  for(const key of Object.keys(patientDrafts))delete patientDrafts[key];
  message('Questionnaire transmis','Merci. Vos réponses ont été transmises à l’équipe d’anesthésie, qui les relira avec vous lors de la consultation. Vous pouvez fermer cette page.');
 }catch(err){
  toast(err.message);
  button.disabled=false;
 }
}

async function start(){
 if(!invitation||!/^[a-f0-9]{64}$/.test(invitation)){
  message('Lien d’invitation nécessaire','Ouvrez cette page depuis le lien personnel qui vous a été transmis par la clinique. Si vous ne l’avez plus, contactez le secrétariat.');
  return;
 }
 try{await qrApi('resolve',{token:invitation})}
 catch(err){message('Lien indisponible',err.message+' Demandez un nouveau lien au secrétariat de la clinique.');return}
 openPatientPage(0);
}
// Démarré : l'écran de diagnostic de startup-v5.js ne doit pas s'afficher pendant la vérification du lien.
document.body.dataset.appReady='true';
start().catch(error=>window.showPatientLoadError?.(error));
})();

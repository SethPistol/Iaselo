/* IASELO · consultation d'anesthésie sur le modèle « Consultation pré-anesthésique simplifiée ».
   La trame (rubriques, scores, vigilance, PDF, ordonnances, devis) s'affiche dans un cadre de même origine
   (consultation-modele.html). Cette page parente :
   - charge et enregistre les valeurs dans le séjour (stay.consult.cpa) ;
   - reprend une fois les données de l'ancienne trame (rien n'est supprimé, une copie est archivée) ;
   - insère directement les réponses du questionnaire patient dans les champs vides, marquées « Patient »,
     sans jamais écraser une saisie ni toucher aux décisions médicales (ASA, avis, technique, consentement) ;
   - met à jour les champs de l'ancienne trame lus par les autres modules (VPA, veille, lettre de liaison…). */
window.createConsultationModele=function({$,esc,toast,event,role,medecin,onChange,frDate,sejour}){
 const R=window.IaseloCpa;
 let frame=null,frameStay=null,frameRead=false,frameReady=false;
 const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 const premierMot=s=>norm(s).split(/[\s—-]+/).filter(Boolean)[0]||'';
 const win=()=>frame?.contentWindow?.CPA?frame.contentWindow:null;

 /* Première ouverture : ancienne trame + séjour. Une copie de l'ancienne trame est archivée telle quelle. */
 function preparer(stay){
  const c=stay.consult??={};c.ext??={};
  if(!c.cpa){
   const ancien=R.depuisAncienne(c),sejour=R.depuisSejour(stay,{medecin:medecin()});
   const v={...ancien};for(const [k,x] of Object.entries(sejour))if(R.vide(v,k))v[k]=x;
   if(Object.keys(ancien).length)c.ancienneTrame??={archiveeLe:new Date().toISOString(),asa:c.asa,history:c.history,allergies:c.allergies,treatments:c.treatments,plan:c.plan,ext:structuredClone(c.ext)};
   c.cpa=v;c.cpaNouveau=true;c.cpaMarques={};deriver(stay);
  }
  c.cpaMarques??={};
  const q=stay.questionnaire;
  // Insertion directe des réponses : une seule fois, consultation non validée, par un anesthésiste.
  // Un questionnaire déjà relu avec l'ancienne trame n'est pas réinséré d'office (bouton disponible).
  if(q&&!q.cpaInsertion&&!q.reviewed&&!c.validated&&role()==='Anesthésiste')inserer(stay);
 }

 function inserer(stay){
  const c=stay.consult,q=stay.questionnaire;if(!q||!R)return [];
  const identiteConnue=!!R.depuisSejour(stay).identite;
  const prop=R.depuisQuestionnaire(q,{identiteConnue});
  const avant={};const f=R.fusionner(c.cpa,prop.valeurs);
  for(const id of f.champs)avant[id]=c.cpa[id]===undefined?null:structuredClone(c.cpa[id]);
  c.cpa=f.valeurs;
  for(const [id,m] of Object.entries(f.marques)){const old=c.cpaMarques[id];c.cpaMarques[id]=Array.isArray(m)?[...new Set([...(Array.isArray(old)?old:[]),...m])]:true}
  // Traitements structurés (prescriptions préop, VPA) : lignes « Déclaré par le patient », conduite à déterminer.
  const rows=c.medicationRows??=[],known=new Set(rows.filter(m=>!m.removed).map(m=>premierMot(m.name))),medIds=[];
  for(const m of prop.traitements){if(known.has(premierMot(m.name)))continue;const id='MED-'+crypto.randomUUID();medIds.push(id);known.add(premierMot(m.name));
   rows.push({id,name:m.name,dose:m.dose,frequency:m.frequency,route:'',indication:'',lastDose:'',verification:'Déclaré par le patient',source:'Questionnaire patient du '+prop.recu,decision:'À déterminer',stopPlan:'',resumePlan:'',instructions:'',fromQuestionnaire:true})}
  q.cpaInsertion={at:new Date().toISOString(),par:medecin()||role(),champs:f.champs,avant,medIds,question:prop.questions,dents:prop.dents};
  deriver(stay);
  event(f.champs.length?'Questionnaire patient inséré dans la consultation : '+f.champs.map(R.libelle).join(', '):'Questionnaire patient : aucune réponse à insérer (champs déjà renseignés)','Questionnaire');
  return f.champs;
 }

 function annuler(stay){
  const c=stay.consult,q=stay.questionnaire,ins=q?.cpaInsertion;if(!ins||ins.annuleeAt)return;
  capture(stay);
  for(const id of ins.champs){const a=ins.avant?.[id];if(a==null)delete c.cpa[id];else c.cpa[id]=a;delete c.cpaMarques[id]}
  for(const m of c.medicationRows||[])if(ins.medIds?.includes(m.id))m.removed=true;
  ins.annuleeAt=new Date().toISOString();
  event('Insertion du questionnaire patient annulée','Questionnaire');
 }

 function bandeau(stay){
  const q=stay.questionnaire,c=stay.consult;if(!q)return '';
  const ins=q.cpaInsertion,recu=frDate(q.received);
  const n=ins&&!ins.annuleeAt?ins.champs.length:0;
  let t;
  if(ins&&!ins.annuleeAt)t=`<strong>Questionnaire patient du ${esc(recu)}</strong> · ${n?`${n} champ${n>1?'s':''} rempli${n>1?'s':''} directement (marqués <span class="cpa-pt">Patient</span>) : à vérifier avec le patient. Rien de ce que vous aviez saisi n’a été modifié.`:'aucune réponse à insérer : les champs correspondants étaient déjà renseignés.'}`;
  else if(c.validated)t=`<strong>Questionnaire patient du ${esc(recu)}</strong> · consultation validée : ouvrez une révision pour insérer les réponses.`;
  else t=`<strong>Questionnaire patient du ${esc(recu)}</strong> · ${ins?.annuleeAt?'insertion annulée.':q.reviewed?'relu avec l’ancienne trame.':'non inséré.'}`;
  const canAct=role()==='Anesthésiste'&&!c.validated;
  const btns=[canAct&&(!ins||ins.annuleeAt)?'<button type="button" class="secondary" id="cpa-inserer">Insérer les réponses</button>':'',canAct&&ins&&!ins.annuleeAt&&n?'<button type="button" class="secondary" id="cpa-annuler">Annuler l’insertion</button>':'','<button type="button" class="textbutton" id="cpa-voirq">Voir toutes les réponses</button>'].join('');
  const qu=ins?.question||q.answers?.questions;
  return `<div class="notice cpa-qbanner"><p>${t}</p><div class="actions">${btns}</div>${qu?`<p class="cpa-question"><strong>Question du patient :</strong> ${esc(qu)}</p>`:''}${ins&&ins.dents&&!ins.annuleeAt?'<p class="muted">Le patient signale des dents refaites, déchaussées ou mobiles : à reporter sur le schéma dentaire.</p>':''}</div>`;
 }

 function ancienneHTML(c){
  const a=c.ancienneTrame;if(!a)return '';
  const rows=[['ASA',a.asa],['Antécédents',a.history],['Allergies',a.allergies],['Traitements',a.treatments],['Stratégie',a.plan],...Object.entries(a.ext||{}).map(([k,v])=>[k,v])].filter(([,v])=>v&&!['Non renseigné','À vérifier'].includes(v));
  if(!rows.length)return '';
  return `<details class="cpa-ancienne"><summary>Saisies de l’ancienne trame (archivées le ${esc(frDate(a.archiveeLe))}, reprises dans le modèle)</summary><dl class="answers">${rows.map(([k,v])=>`<div class="answer"><dt>${esc(k)}</dt><dd class="preserve">${esc(v)}</dd></div>`).join('')}</dl></details>`;
 }

 function info(stay){const q=stay.questionnaire;return q?'Déclaré par le patient · questionnaire du '+frDate(q.received):''}

 function monter(zone,stay,read){
  preparer(stay);
  frame=document.createElement('iframe');frameStay=stay.id;frameRead=read;frameReady=false;const ce=frame;
  frame.className='cpa-frame';frame.title='Consultation pré-anesthésique';frame.src='consultation-modele.html?v=4';
  frame.addEventListener('load',()=>{
   const w=win();if(!w||frame!==ce||frameStay!==stay.id)return;stay=sejour?.(stay.id)||stay;const c=stay.consult;
   w.CPA.theme(document.documentElement.dataset.theme||null);
   w.CPA.charger(c.cpa,{nouveau:!!c.cpaNouveau,marques:c.cpaMarques,info:info(stay)});
   frameReady=true;
   if(c.cpaNouveau&&!read){delete c.cpaNouveau;capture(stay)}
   w.CPA.lecture(read);
   const id=stay.id;w.CPA.surChangement(()=>{capture(sejour?.(id)||stay);onChange?.()});
   onChange?.();
  });
  zone.innerHTML='';zone.appendChild(frame);
 }

 new MutationObserver(()=>{const w=win();if(w)w.CPA.theme(document.documentElement.dataset.theme||null)}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

 /* Lecture du cadre → séjour, puis champs dérivés pour les autres modules. */
 function capture(stay){
  const w=win();if(!w||!frameReady||!stay||frameStay!==stay.id||frameRead||!document.body.contains(frame))return false;
  const c=stay.consult;c.ext??={};
  c.cpa=w.CPA.etat();
  deriver(stay);
  c.lastDraftAt=new Date().toLocaleString('fr-FR');
  return true;
 }
 function deriver(stay){
  const c=stay.consult,{top,ext}=R.versAncienne(c.cpa);
  Object.assign(c.ext,ext);for(const [k,v] of Object.entries(top))c[k]=v;
  // Traitement habituel → lignes structurées (ajout des nouveaux médicaments ; retrait de ceux que la trame a créés puis effacés).
  const rows=c.medicationRows??=[],lignes=R.lignesTraitement(c.cpa),noms=new Set(lignes.map(l=>premierMot(l.name)));
  for(const m of rows)if(m.fromModele&&!m.removed&&!noms.has(premierMot(m.name)))m.removed=true;
  const actifs=new Set(rows.filter(m=>!m.removed).map(m=>premierMot(m.name)));
  for(const l of lignes){const k=premierMot(l.name);if(!k||actifs.has(k))continue;actifs.add(k);
   rows.push({id:'MED-'+crypto.randomUUID(),name:l.name,dose:l.dose,frequency:'',route:'',indication:'',lastDose:'',verification:'Saisi en consultation',source:'Consultation d’anesthésie',decision:'À déterminer',stopPlan:'',resumePlan:'',instructions:'',fromModele:true})}
 }
 function manquants(stay){return R.manquants(stay?.consult?.cpa||{})}
 function actif(stay){return !!win()&&frameReady&&frameStay===stay?.id&&document.body.contains(frame)}
 // Amène au champ bloquant : cadre visible, rubrique ouverte, défilement, focus et mise en évidence.
 function aller(id){const w=win();if(!w)return false;frame.scrollIntoView({block:'start'});return w.CPA.aller(id)!==false}
 return {preparer,inserer,annuler,bandeau,ancienneHTML,monter,capture,deriver,manquants,actif,aller,libelle:id=>R.libelle(id)};
};

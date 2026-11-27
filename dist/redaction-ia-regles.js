/* IASELO · rédaction assistée : contexte pseudonymisé du séjour et brouillons « par règles » (moteur local).
   Partagé par le serveur (worker/redaction-ia.mjs) et les tests (tests/redaction-ia.test.cjs).
   - TYPES : documents proposés (compte rendu de consultation d'anesthésie, trame de CRO, lettre de sortie, synthèse) ;
   - contexte(dossier) : uniquement les éléments médicaux utiles, SANS nom, prénom, date de naissance ni identifiant ;
   - gabarit(type, contexte) : brouillon déterministe, rien ne sort du serveur ;
   - consignes(type) : instructions données à un modèle génératif (moteur « compatible » hébergé HDS), même contexte.
   Toute proposition est relue, modifiable, puis acceptée ou rejetée par un professionnel : la décision est tracée. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloRedaction=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const t=v=>typeof v==='string'?v.trim():v===undefined||v===null?'':String(v).trim();
const utile=v=>{const s=t(v);return s&&!/^(non renseign[ée]e?|à vérifier|a verifier|—|-)$/i.test(s)?s:''};
const frDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(t(d))?t(d).split('-').reverse().join('/'):'';
const TYPES={
 consultation:{label:'Compte rendu de consultation d’anesthésie',metiers:['anesthesiste']},
 cro:{label:'Trame de compte rendu opératoire',metiers:['chirurgien']},
 sortie:{label:'Lettre de sortie',metiers:['anesthesiste','chirurgien']},
 synthese:{label:'Synthèse du séjour',metiers:['anesthesiste','chirurgien','infirmier']}
};
function age(naissance,ref){const n=t(naissance),r=t(ref)||new Date().toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(n))return null;let a=Number(r.slice(0,4))-Number(n.slice(0,4));if(r.slice(5)<n.slice(5))a--;return a>=0&&a<130?a:null}

// Contexte pseudonymisé : aucune donnée directement identifiante.
function contexte(d={}){
 const core=d.core||{},c=d.consult||{},e=c.ext||{},f=d.surgicalAnnouncement?.published?.fields||{},id=core.identity||{};
 const date=t(e.surgeryDate||f.date),sexe=/^f/i.test(t(id.sex))?'femme':/^m/i.test(t(id.sex))?'homme':'';
 const traitements=(Array.isArray(c.medicationRows)?c.medicationRows:[]).filter(m=>m&&!m.removed&&t(m.name)).map(m=>[t(m.name),t(m.frequency),utile(m.decision)?'('+t(m.decision).toLowerCase()+')':''].filter(Boolean).join(' '));
 const vit=(Array.isArray(d.postopVitals)?d.postopVitals:[]).slice(-3).map(v=>({le:t(v.at),lieu:t(v.values?.location),...Object.fromEntries(Object.entries(v.values||{}).filter(([k,x])=>['pain','eva','spo2','sbp','dbp','hr','temp','temperature'].includes(k)&&t(x)))}));
 const reps=(Array.isArray(d.parcoursSuivi?.reponses)?d.parcoursSuivi.reponses:[]).map(r=>({etape:t(r.etape),alertes:(r.alerts||[]).map(a=>a.label),traite:r.traite?t(r.traite.action):''}));
 const j1=(Array.isArray(d.espacePatient?.suiviJ1?.reponses)?d.espacePatient.suiviJ1.reponses:[]).map(r=>({alertes:(r.alerts||[]).map(a=>a.label)}));
 return {
  patient:{age:age(id.birthDate,date)??(Number(e.age)||null),sexe},
  sejour:{specialite:t(core.specialty),mode:t(core.mode),etape:t(core.stage),dateIntervention:date},
  intervention:{libelle:t(f.procedure||e.operation),lateralite:utile(f.laterality)&&!/non applicable/i.test(f.laterality)?t(f.laterality):'',chirurgien:t(f.surgeon||e.surgeon),urgence:t(f.urgency),dureePrevueMin:Number(f.duration)||null},
  consultation:{date:t(e.consultDate),anesthesiste:t(e.author),asa:utile(c.asa),antecedents:utile(c.history),allergies:utile(c.allergies),traitements,
   techniqueProposee:utile(c.plan||e.technique),voiesAeriennes:utile(e.airwayConclusion),cardio:utile(e.cardio),respiratoire:utile(e.respiratory),renal:utile(e.renal),neuro:utile(e.neuro),
   habitudes:utile(e.habits),jeune:utile(e.fasting),antibioprophylaxie:utile(e.atbPlan),examensEnAttente:utile(e.pendingTests),informationDonnee:utile(e.infoGiven||e.risksDiscussed),accord:utile(e.patientAgreement),validee:c.validated===true},
  bloc:{debut:t(d.reservation?.actualStart||d.reservation?.start),fin:t(d.reservation?.actualEnd||d.reservation?.end),salle:t(d.reservation?.resource),ccam:t(d.reservation?.ccam)},
  sortie:{resume:utile(d.discharge?.summary),consignes:utile(d.discharge?.instructions),ordonnance:utile(d.discharge?.ordinance)},
  surveillance:vit,suiviDomicile:[...j1.map(x=>({etape:'J+1',...x})),...reps]
 };
}

const ligne=(label,v)=>t(v)?label+' : '+t(v):'';
const bloc=(titre,lignes)=>{const l=lignes.filter(Boolean);return l.length?titre+'\n'+l.map(x=>'- '+x).join('\n'):''};
const AVERT='[Brouillon proposé par IASELO à partir du dossier. À relire, compléter et valider par le praticien.]';
function entete(x){const p=x.patient;return 'Patient'+(p.sexe==='femme'?'e':'')+(p.age!=null?' de '+p.age+' ans':'')+(x.intervention.libelle?', '+x.intervention.libelle+(x.intervention.lateralite?' ('+x.intervention.lateralite.toLowerCase()+')':''):'')+(x.sejour.dateIntervention?' prévue le '+frDate(x.sejour.dateIntervention):'')+(x.sejour.mode?', en '+x.sejour.mode.toLowerCase():'')+'.'}
function gabarit(type,x){
 const c=x.consultation,i=x.intervention,s=x.sortie,manque=[];
 const besoin=(v,l)=>{if(!t(v)&&!(Array.isArray(v)&&v.length))manque.push(l);return v};
 let corps='';
 if(type==='consultation'){
  besoin(c.asa,'score ASA');besoin(c.allergies,'allergies');besoin(c.techniqueProposee,'technique anesthésique');besoin(c.voiesAeriennes,'évaluation des voies aériennes');
  corps=['COMPTE RENDU DE CONSULTATION D’ANESTHÉSIE'+(c.date?' du '+frDate(c.date):''),entete(x),
   bloc('Antécédents et terrain',[c.antecedents,ligne('Cardiovasculaire',c.cardio),ligne('Respiratoire',c.respiratoire),ligne('Rénal',c.renal),ligne('Neurologique',c.neuro),ligne('Habitudes',c.habitudes)]),
   ligne('Allergies',c.allergies||'[à compléter]'),
   bloc('Traitement habituel',c.traitements.length?c.traitements:['[à compléter]']),
   bloc('Examen et évaluation',[ligne('Classe ASA',c.asa||'[à compléter]'),ligne('Voies aériennes',c.voiesAeriennes||'[à compléter]')]),
   bloc('Proposition',[ligne('Technique',c.techniqueProposee||'[à compléter]'),ligne('Antibioprophylaxie',c.antibioprophylaxie),ligne('Jeûne',c.jeune),ligne('Examens en attente',c.examensEnAttente)]),
   bloc('Information',[c.informationDonnee?'Information délivrée : '+c.informationDonnee:'Information sur l’anesthésie et ses risques : [à confirmer]',c.accord?'Accord du patient : '+c.accord:''])].filter(Boolean).join('\n\n');
 }else if(type==='cro'){
  besoin(i.libelle,'intervention');
  corps=['COMPTE RENDU OPÉRATOIRE (trame)',entete(x),
   bloc('Intervention',[ligne('Acte',i.libelle),ligne('Côté',i.lateralite),ligne('Code CCAM',x.bloc.ccam),ligne('Opérateur',i.chirurgien),ligne('Anesthésie',c.techniqueProposee),ligne('Antibioprophylaxie',c.antibioprophylaxie),x.bloc.debut?'Horaires : '+x.bloc.debut.slice(11,16)+(x.bloc.fin?' – '+x.bloc.fin.slice(11,16):''):'']),
   'Installation :\n[à compléter]','Voie d’abord :\n[à compléter]','Constatations :\n[à compléter]','Gestes réalisés :\n[à compléter]','Fermeture, drainage, pansement :\n[à compléter]',
   'Incidents : [aucun / à préciser]','Prescriptions postopératoires et suites :\n[à compléter]'].filter(Boolean).join('\n\n');
 }else if(type==='sortie'){
  besoin(s.resume,'résumé de sortie');
  corps=['LETTRE DE SORTIE','Cher confrère, chère consœur,',entete(x).replace(/ prévue le /,' réalisée le ')+(c.techniqueProposee?' Anesthésie : '+c.techniqueProposee.toLowerCase()+'.':''),
   s.resume?'Déroulement : '+s.resume:'Déroulement : [à compléter]',
   x.suiviDomicile.some(r=>r.alertes.length)?bloc('Suivi à distance',x.suiviDomicile.filter(r=>r.alertes.length).map(r=>r.etape+' : '+r.alertes.join(', ')+(r.traite?' → '+r.traite:''))):'',
   bloc('Traitement de sortie',[s.ordonnance||'[voir ordonnance de sortie]',c.allergies?'Allergies : '+c.allergies:'']),
   bloc('Consignes',[s.consignes||'[à compléter]']),'Bien confraternellement.'].filter(Boolean).join('\n\n');
 }else if(type==='synthese'){
  corps=['SYNTHÈSE DU SÉJOUR',entete(x),
   bloc('Consultation',[c.asa?'ASA '+c.asa:'',c.allergies?'Allergies : '+c.allergies:'',c.techniqueProposee?'Technique : '+c.techniqueProposee:'',c.traitements.length?'Traitements : '+c.traitements.join(' ; '):'',c.validee?'Consultation validée':'Consultation non validée']),
   bloc('Bloc',[x.bloc.debut?'Entrée '+x.bloc.debut.slice(0,16).replace('T',' '):'',x.bloc.fin?'Sortie '+x.bloc.fin.slice(0,16).replace('T',' '):'',x.sejour.etape?'Étape actuelle : '+x.sejour.etape:'']),
   bloc('Dernières constantes',x.surveillance.map(v=>[v.lieu,Object.entries(v).filter(([k])=>!['le','lieu'].includes(k)).map(([k,val])=>k+' '+val).join(', ')].filter(Boolean).join(' · '))),
   bloc('Suivi à domicile',x.suiviDomicile.map(r=>r.etape+' : '+(r.alertes.length?r.alertes.join(', ')+(r.traite?' → traité ('+r.traite+')':' → à traiter'):'sans alerte'))),
   s.resume?'Sortie : '+s.resume:''].filter(Boolean).join('\n\n');
 }else throw Error('Type de document inconnu.');
 return {texte:AVERT+'\n\n'+corps,manquants:manque};
}
function consignes(type){
 return ['Tu es un assistant de rédaction médicale pour une clinique française (anesthésie et chirurgie).',
  'Rédige en français, au format texte simple, un brouillon de : '+TYPES[type].label+'.',
  'Utilise UNIQUEMENT les informations du contexte JSON fourni. N’invente aucune donnée (valeur, antécédent, traitement, geste).',
  'Quand une information manque, écris [à compléter]. Ne donne aucun conseil thérapeutique qui ne figure pas dans le contexte.',
  'Commence par la ligne : '+AVERT].join('\n');
}
return {TYPES,AVERT,contexte,gabarit,consignes,age};
});

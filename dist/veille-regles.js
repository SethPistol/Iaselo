/* IASELO · règles cliniques d'aide issues de la veille marché (novembre 2026).
   Fonctions pures, sans accès au DOM ni au réseau : testées dans tests/veille.test.cjs.
   Tout résultat est une PROPOSITION affichée avec sa source et ses critères ;
   rien n'est appliqué au dossier sans validation explicite d'un médecin. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloRegles=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const yes=v=>v===true||/^(oui|yes|true|1)$/i.test(String(v??'').trim());

/* ---------- Données du séjour réunies en un seul objet ---------- */
function contexte(stay){
 const c=stay?.consult||{},ext=c.ext||{},q=stay?.questionnaire?.answers||{},id=stay?.identity||{};
 const diseases=Array.isArray(q.diseases)?q.diseases:[];
 let age=num(ext.age);
 if(age==null&&id.birthDate){const b=new Date(id.birthDate+'T12:00:00');if(!isNaN(b))age=Math.floor((Date.now()-b)/31557600000)}
 const weight=num(ext.weight)??num(q.weight),height=num(ext.height)??num(q.height);
 const bmi=weight&&height?weight/((height/100)**2):null;
 const sex=ext.sex==='Homme'?'M':ext.sex==='Femme'?'F':null;
 const surgery=stay?.surgicalAnnouncement?.published?.fields||{};
 const surgeryDate=ext.surgeryDate||surgery.date||'';
 const text=norm([c.treatments,ext.treatments,ext.antithromboticPlan,ext.diabetesPlan,ext.otherMedPlan,q.treatments,...(Array.isArray(stay?.questionnaire?.medRows)?stay.questionnaire.medRows.map(r=>r.join(' ')):[])].filter(Boolean).join(' \n '));
 const history=norm([c.history,ext.history,ext.cardio,ext.respiratory,ext.renal,ext.neuro,ext.anesthesiaHistory,q.other,q.hospitalDetails,q.anesthesiaDetails].filter(Boolean).join(' \n '));
 return {stay,c,ext,q,diseases,age,weight,height,bmi,sex,surgery,surgeryDate,text,history,operation:ext.operation||surgery.procedure||'',mode:stay?.mode||''};
}
const has=(ctx,label)=>ctx.diseases.includes(label);

/* ---------- Scores ---------- */
// Chaque critère : {label, value:true|false|null, source}. null = donnée manquante (jamais comptée comme négative silencieusement).
function critere(label,value,source){return {label,value:value===undefined?null:value,source}}
function compte(criteres){return criteres.filter(x=>x.value===true).length}
function manquants(criteres){return criteres.filter(x=>x.value===null).length}

function stopBang(ctx,saisie={}){
 const cr=[
  critere('Ronflement fort',saisie.snoring??null,saisie.snoring==null?'à demander':'médecin'),
  critere('Fatigue / somnolence diurne',saisie.tired??null,saisie.tired==null?'à demander':'médecin'),
  critere('Apnées observées',saisie.observed??(has(ctx,'Apnée du sommeil')?true:null),saisie.observed!=null?'médecin':has(ctx,'Apnée du sommeil')?'déclaré patient':'à demander'),
  critere('Hypertension artérielle',has(ctx,'Hypertension artérielle')?true:/hta|hypertension/.test(ctx.history)?true:ctx.q.diseases?false:null,has(ctx,'Hypertension artérielle')?'déclaré patient':/hta|hypertension/.test(ctx.history)?'dossier':'questionnaire'),
  critere('IMC > 35 kg/m²',ctx.bmi==null?null:ctx.bmi>35,'calcul'),
  critere('Âge > 50 ans',ctx.age==null?null:ctx.age>50,'calcul'),
  critere('Tour de cou > 40 cm',saisie.neck??null,saisie.neck==null?'à mesurer':'médecin'),
  critere('Sexe masculin',ctx.sex==null?null:ctx.sex==='M','dossier')
 ];
 const v=compte(cr),missing=manquants(cr);
 const level=v>=5?'crit':v>=3?'warn':'ok';
 const text=v>=5?'Risque élevé de SAOS':v>=3?'Risque intermédiaire de SAOS':missing?'Risque faible à ce stade (critères manquants)':'Risque faible de SAOS';
 return {id:'stopbang',label:'STOP-Bang',value:v,max:8,level,text,missing,criteria:cr,ref:'Chung F. et al., Anesthesiology 2008 ; Chest 2016'};
}

function lee(ctx,saisie={}){
 const op=norm(ctx.operation);
 const highRisk=saisie.highRiskSurgery??(/(colorectal|colect|gastrect|hepat|pancrea|splenect|laparotom|digestive|bariatrique|sleeve|bypass|hysterectomie|thorac|aort|vascul)/.test(op)?true:op?false:null);
 const creat=num(ctx.ext.creatinine);
 const cr=[
  critere('Chirurgie à haut risque (intrapéritonéale, intrathoracique, vasculaire sus-inguinale)',highRisk,saisie.highRiskSurgery!=null?'médecin':'intervention'),
  critere('Cardiopathie ischémique',has(ctx,'Infarctus ou stent')||/(coronar|infarctus|stent|angor)/.test(ctx.history)?true:ctx.q.diseases?false:null,has(ctx,'Infarctus ou stent')?'déclaré patient':'dossier'),
  critere('Insuffisance cardiaque',has(ctx,'Insuffisance cardiaque')||/insuffisance cardiaque/.test(ctx.history)?true:ctx.q.diseases?false:null,has(ctx,'Insuffisance cardiaque')?'déclaré patient':'dossier'),
  critere('Antécédent d’AVC / AIT',has(ctx,'AVC')||/\b(avc|ait)\b/.test(ctx.history)?true:ctx.q.diseases?false:null,has(ctx,'AVC')?'déclaré patient':'dossier'),
  critere('Diabète traité par insuline',/insulin|lantus|novorapid|humalog|toujeo|tresiba|levemir|abasaglar/.test(ctx.text)?true:has(ctx,'Diabète')?(saisie.insulin??null):ctx.q.diseases?false:null,'traitements'),
  critere('Créatinine > 177 µmol/L (2 mg/dL)',creat==null?null:creat>177,'bilan')
 ];
 const v=compte(cr),risk=['3,9 %','6,0 %','10,1 %','15 %'][Math.min(v,3)];
 return {id:'lee',label:'Lee (RCRI)',value:v,max:6,level:v>=3?'crit':v>=1?'warn':'ok',text:`Classe ${['I','II','III','IV'][Math.min(v,3)]} · risque d’événement cardiaque majeur à 30 j ≈ ${risk}`,missing:manquants(cr),criteria:cr,ref:'Lee TH, Circulation 1999 ; risques actualisés Duceppe E, Can J Cardiol 2017'};
}

function apfel(ctx,saisie={}){
 const smoke=ctx.ext.smokingStatus||'';
 const cr=[
  critere('Sexe féminin',ctx.sex==null?null:ctx.sex==='F','dossier'),
  critere('Non-fumeur',smoke?smoke!=='Actif':(yes(ctx.q.tobacco)?false:ctx.q.tobacco?true:null),smoke?'consultation':'déclaré patient'),
  critere('Antécédent de NVPO ou mal des transports',yes(ctx.q.nausea)||yes(ctx.q.travel)?true:(ctx.q.nausea||ctx.q.travel)?false:null,'déclaré patient'),
  critere('Opioïdes postopératoires prévus',saisie.opioids??null,saisie.opioids==null?'à décider':'médecin')
 ];
 const v=compte(cr);
 return {id:'apfel',label:'Apfel (NVPO)',value:v,max:4,level:v>=3?'crit':v>=2?'warn':'ok',text:`Risque de NVPO ≈ ${['10','20','40','60','80'][v]} %`,missing:manquants(cr),criteria:cr,ref:'Apfel CC, Anesthesiology 1999 ; consensus Gan TJ, Anesth Analg 2020'};
}

function voiesAeriennes(ctx){
 const e=ctx.ext,mo=num(e.mouthOpening),dtm=num(e.thyromental);
 const cr=[
  critere('Mallampati III ou IV',e.mallampati&&e.mallampati!=='Non évalué'?['III','IV'].includes(e.mallampati):null,'examen'),
  critere('Ouverture buccale < 3,5 cm',mo==null?null:mo<3.5,'examen'),
  critere('Distance thyromentonnière < 6,5 cm',dtm==null?null:dtm<6.5,'examen'),
  critere('Test de morsure impossible',e.biteTest&&e.biteTest!=='Non évalué'?e.biteTest==='Impossible':null,'examen'),
  critere('IMC > 35 kg/m²',ctx.bmi==null?null:ctx.bmi>35,'calcul'),
  critere('SAOS connu ou suspecté',has(ctx,'Apnée du sommeil')||/saos|apnee/.test(ctx.history)?true:null,'dossier'),
  critere('Barbe',e.beard?e.beard==='Oui':null,'examen'),
  critere('Intubation difficile antérieure',/intubation difficile|difficulte d.intubation/.test(ctx.history)?true:null,'dossier')
 ];
 const v=compte(cr);
 return {id:'airway',label:'Voies aériennes',value:v,max:cr.length,level:v>=3?'crit':v>=1?'warn':'ok',text:v?`${v} critère${v>1?'s':''} de difficulté présent${v>1?'s':''}`:'Aucun critère de difficulté relevé',missing:manquants(cr),criteria:cr,ref:'SFAR, Intubation difficile et extubation en anesthésie chez l’adulte, 2017'};
}

function hemstop(ctx){
 const answers=Array.isArray(ctx.q.bleeding)?ctx.q.bleeding:null;
 const v=answers?answers.filter(x=>!/^aucun/i.test(x)).length:null;
 return {id:'hemstop',label:'HEMSTOP',value:v,max:7,level:v==null?'na':v>=1?'warn':'ok',text:v==null?'Questionnaire hémorragique non reçu':v?`${v} réponse${v>1?'s':''} positive${v>1?'s':''} : bilan d’hémostase à discuter`:'Aucune réponse positive',missing:v==null?1:0,criteria:(answers||[]).map(a=>critere(a,true,'déclaré patient')),ref:'Bonhomme F. et al., Eur J Anaesthesiol 2016 (HEMSTOP)'};
}

function scores(stay,saisie={}){
 const ctx=contexte(stay);
 return {ctx,bmi:ctx.bmi?Math.round(ctx.bmi*10)/10:null,list:[stopBang(ctx,saisie),lee(ctx,saisie),apfel(ctx,saisie),voiesAeriennes(ctx),hemstop(ctx),ariscat(ctx,saisie),caprini(ctx,saisie)]};
}
// Texte reporté dans les champs de la consultation (CPA préremplie).
function resumeScore(s){const pos=s.criteria.filter(c=>c.value===true).map(c=>c.label.toLowerCase());return `${s.label} ${s.value??'—'}/${s.max} · ${s.text}${pos.length?' · critères : '+pos.join(', '):''}${s.missing?' · '+s.missing+' critère(s) non renseigné(s)':''} (calcul IASELO, validé par le médecin)`}


/* ---------- Risque global (27/11/2026, manque n°13 de la 3e veille) ----------
   ARISCAT (complications pulmonaires) et Caprini (thrombose veineuse) complètent STOP-Bang, Lee, Apfel, voies aériennes
   et HEMSTOP. profilRisque() réunit les domaines et propose des mesures tirées des recommandations citées.
   Aide à la décision : ne remplace pas le jugement clinique. Avant tout usage clinique réel, ce calcul relève du
   marquage CE comme dispositif médical (règlement 2017/745, règle 11). */
const pts=(label,points,value,source,key)=>({label:label+' (+'+points+')',points,value:value===undefined?null:value,source,...(key?{key}:{})});
const somme=cr=>cr.reduce((n,c)=>n+(c.value===true?c.points:0),0);
function incision(op){op=norm(op);if(!op)return null;if(/(thorac|poumon|pulmon|lobectom|pneumonectom|oesophag|cardiaque|pontage coronar|valv|mediastin)/.test(op))return 'thorax';if(/(gastr|colect|colon|cholecyst|hepat|foie|pancrea|splen|rate|bariatr|sleeve|bypass|hiatal|duoden|grele|laparotom|eventration|surrenal|nephrect|rein)/.test(op))return 'abdo';return 'peripherique'}
function ariscat(ctx,saisie={}){
 const age=ctx.age,sp=num(ctx.ext.spo2),hb=num(ctx.ext.hb),dur=num(ctx.surgery.duration)??num(ctx.ext.duration),inc=saisie.incision||incision(ctx.operation);
 const urg=saisie.emergency??(ctx.surgery.urgency?/urgen/i.test(ctx.surgery.urgency)&&!/programm|non/i.test(ctx.surgery.urgency):null);
 const cr=[
  pts('Âge 51 à 80 ans',3,age==null?null:age>50&&age<=80,'calcul'),pts('Âge > 80 ans',16,age==null?null:age>80,'calcul'),
  pts('SpO₂ préopératoire 91 à 95 %',8,sp==null?null:sp>90&&sp<96,'consultation'),pts('SpO₂ préopératoire ≤ 90 %',24,sp==null?null:sp<=90,'consultation'),
  pts('Infection respiratoire dans le mois',17,saisie.respInfection??null,saisie.respInfection==null?'à demander':'médecin','respInfection'),
  pts('Anémie préopératoire (Hb ≤ 10 g/dL)',11,hb==null?null:hb<=10,'bilan'),
  pts('Incision abdominale haute',15,inc==null?null:inc==='abdo','intervention'),pts('Incision intrathoracique',24,inc==null?null:inc==='thorax','intervention'),
  pts('Durée 2 à 3 h',16,dur==null?null:dur>=120&&dur<=180,'annonce'),pts('Durée > 3 h',23,dur==null?null:dur>180,'annonce'),
  pts('Chirurgie en urgence',8,urg,saisie.emergency!=null?'médecin':'annonce','emergency')
 ];
 const v=somme(cr),missing=[age==null,sp==null,saisie.respInfection==null,hb==null,inc==null,dur==null,urg==null].filter(Boolean).length;
 const level=v>=45?'crit':v>=26?'warn':'ok';
 return {id:'ariscat',label:'ARISCAT (poumon)',value:v,max:123,level,text:(v>=45?'Risque élevé':v>=26?'Risque intermédiaire':'Risque faible')+' de complication pulmonaire postopératoire ≈ '+(v>=45?'42,1':v>=26?'13,3':'1,6')+' %',missing,criteria:cr,ref:'Canet J. et al., Anesthesiology 2010 ; validation Mazo V., Anesthesiology 2014'};
}
function caprini(ctx,saisie={}){
 const age=ctx.age,op=norm(ctx.operation),dur=num(ctx.surgery.duration)??num(ctx.ext.duration);
 const arthro=/(prothese totale|arthroplast|pth|ptg)/.test(op)&&/(hanche|genou)/.test(op);
 const majeure=op?(dur!=null?dur>45:null):null;
 const cr=[
  pts('Âge 41 à 60 ans',1,age==null?null:age>40&&age<=60,'calcul'),pts('Âge 61 à 74 ans',2,age==null?null:age>60&&age<75,'calcul'),pts('Âge ≥ 75 ans',3,age==null?null:age>=75,'calcul'),
  pts('IMC > 25 kg/m²',1,ctx.bmi==null?null:ctx.bmi>25,'calcul'),
  pts('Chirurgie mineure',1,majeure==null||arthro?(arthro?false:null):!majeure,'annonce'),pts('Chirurgie majeure > 45 min',2,arthro?false:majeure,'annonce'),
  pts('Arthroplastie de hanche ou de genou',5,op?arthro:null,'intervention'),
  pts('Antécédent personnel de thrombose ou d’embolie',3,has(ctx,'Phlébite ou embolie pulmonaire')||/(phlebite|thrombose veineuse|embolie pulmonaire|\btvp\b)/.test(ctx.history)?true:ctx.q.diseases?false:null,'dossier'),
  pts('Antécédent familial de thrombose',3,saisie.familyVte??null,saisie.familyVte==null?'à demander':'médecin','familyVte'),
  pts('Cancer actif ou récent',2,/(cancer|neoplas|tumeur maligne|chimiotherap|metasta|lymphome)/.test(ctx.history)?true:saisie.cancer??null,saisie.cancer!=null?'médecin':'dossier','cancer'),
  pts('Contraception œstroprogestative ou traitement hormonal',1,/(pilule|oestro|estro|ethinyl|contracept|traitement hormonal substitutif|\bths\b)/.test(ctx.text)?true:ctx.sex==='M'?false:null,'traitements'),
  pts('BPCO',1,has(ctx,'Bronchite chronique')||/\bbpco\b/.test(ctx.history)?true:ctx.q.diseases?false:null,'dossier'),
  pts('Insuffisance cardiaque',1,has(ctx,'Insuffisance cardiaque')?true:ctx.q.diseases?false:null,'dossier')
 ];
 const v=somme(cr),level=v>=5?'crit':v>=3?'warn':'ok';
 return {id:'caprini',label:'Caprini (thrombose)',value:v,max:30,level,text:(v>=5?'Risque élevé':v>=3?'Risque modéré':v>=1?'Risque faible':'Risque très faible')+' de thrombose veineuse ≈ '+(v>=5?'6':v>=3?'3':v>=1?'1,5':'< 0,5')+' % sans prophylaxie',missing:manquants(cr),criteria:cr,ref:'Caprini JA, Dis Mon 2005 ; Gould MK, Chest 2012 (ACCP)'};
}
function profilRisque(stay,saisie={}){
 const {ctx,list}=scores(stay,saisie),g=id=>list.find(s=>s.id===id),mesures=[];
 const lee=g('lee'),ar=g('ariscat'),sb=g('stopbang'),aw=g('airway'),ca=g('caprini'),ap=g('apfel'),hs=g('hemstop');
 const add=(domaine,texte,ref)=>mesures.push({domaine,texte,ref});
 const met4=['Aucun','1 étage'].includes(ctx.q.stairs);
 if(lee.value>=1&&(ctx.age>=65||lee.value>=2))add('Cœur','ECG, BNP ou NT-proBNP et troponine préopératoires à discuter ; troponine à J1 et J2 si haut risque.','ESC 2022');
 if(lee.value>=1&&met4)add('Cœur','Capacité fonctionnelle < 4 MET : avis cardiologique ou épreuve fonctionnelle à discuter avant une chirurgie à risque.','ESC 2022');
 if(ar.value>=26)add('Poumon','Kinésithérapie et spirométrie incitative, ventilation protectrice, analgésie épargnant les morphiniques, mobilisation précoce.','Canet 2010 ; Miskovic, Br J Anaesth 2017');
 if(sb.value>=5)add('SAOS','SpO₂ continue en postopératoire, morphiniques limités, PPC si le patient est appareillé.','SFAR 2010 ; ASA 2014');
 else if(sb.value>=3)add('SAOS','SAOS possible : surveillance SpO₂ renforcée si morphiniques.','ASA 2014');
 if(aw.value>=3)add('Voies aériennes','Intubation difficile prévisible : chariot dédié, vidéolaryngoscope, stratégie écrite.','SFAR 2017');
 if(ca.value>=5)add('Thrombose','Prophylaxie pharmacologique et mécanique à discuter, durée selon la chirurgie.','ACCP 2012 ; SFAR 2011');
 else if(ca.value>=3)add('Thrombose','Prophylaxie pharmacologique ou mécanique à discuter.','ACCP 2012');
 if(ap.value>=3)add('NVPO','Prophylaxie multimodale (au moins 2 molécules) et réduction des facteurs de risque (TIVA, morphiniques limités).','Gan 2020');
 else if(ap.value>=2)add('NVPO','Prophylaxie à 2 molécules.','Gan 2020');
 if(hs.value>=1)add('Hémorragie','Bilan d’hémostase orienté et avis spécialisé si réponses multiples.','Bonhomme, Eur J Anaesthesiol 2016');
 const domaines=[['Cœur',lee],['Poumon',ar],['SAOS',sb],['Voies aériennes',aw],['Thrombose',ca],['NVPO',ap],['Hémorragie',hs]].map(([d,s])=>({domaine:d,id:s.id,label:s.label,level:s.level,value:s.value,max:s.max,text:s.text,missing:s.missing}));
 const ordre={crit:3,warn:2,ok:1,na:0},niveau=domaines.reduce((m,d)=>ordre[d.level]>ordre[m]?d.level:m,'ok');
 const eleves=domaines.filter(d=>d.level==='crit').map(d=>d.domaine);
 return {niveau,eleves,domaines,mesures,manquants:domaines.reduce((n,d)=>n+(d.missing||0),0),
  synthese:niveau==='crit'?'Risque périopératoire élevé : '+eleves.join(', ').toLowerCase()+'.':niveau==='warn'?'Risque périopératoire intermédiaire : points de vigilance à anticiper.':'Pas de risque élevé repéré avec les données disponibles.',
  avertissement:'Aide à la décision calculée à partir du dossier : ne remplace pas le jugement clinique. Les mesures sont des propositions à adapter au patient.'};
}

/* ---------- Orientation après le questionnaire (tri) ---------- */
function orientation(stay,saisie={}){
 const {ctx,list}=scores(stay,saisie),flags=[];
 const add=(level,label)=>flags.push({level,label});
 for(const d of ['Insuffisance cardiaque','Infarctus ou stent','Trouble du rythme','Artérite','AVC','Insuffisance rénale','Myasthénie','Myopathie','Porphyrie'])if(has(ctx,d))add('crit',d);
 for(const d of ['Asthme','Bronchite chronique','Diabète','Phlébite ou embolie pulmonaire','Épilepsie','Reflux ou hernie hiatale'])if(has(ctx,d))add('warn',d);
 const sb=list.find(s=>s.id==='stopbang');if(sb.value>=5)add('crit','STOP-Bang ≥ 5');else if(sb.value>=3)add('warn','STOP-Bang 3–4');
 if(ctx.bmi>=40)add('crit','IMC ≥ 40');else if(ctx.bmi>=35)add('warn','IMC ≥ 35');
 if(yes(ctx.q.allergy))add('warn','Allergie déclarée');
 if(yes(ctx.q.anesthesia))add('warn','Problème lors d’une anesthésie antérieure');
 if(Array.isArray(ctx.q.devices)&&ctx.q.devices.includes('Pacemaker ou défibrillateur'))add('crit','Pacemaker ou défibrillateur');
 const hs=list.find(s=>s.id==='hemstop');if(hs.value>=1)add('warn','HEMSTOP positif');
 if(['Aucun','1 étage'].includes(ctx.q.stairs))add('warn','Capacité fonctionnelle < 4 MET probable');
 const meds=consignes(stay).items;if(meds.some(m=>m.classe==='Anticoagulant'||m.classe==='Antiagrégant'))add('warn','Antithrombotique au long cours');
 const crit=flags.filter(f=>f.level==='crit').length,warn=flags.filter(f=>f.level==='warn').length;
 const asa=crit?'III ou plus probable':warn?'II probable':'I–II probable';
 const proposition=crit?{level:'crit',label:'Consultation présentielle prioritaire',detail:'Terrain à évaluer avant programmation ; avis spécialisé possible.'}:warn?{level:'warn',label:'Consultation présentielle',detail:'Points de vigilance à revoir en consultation.'}:{level:'ok',label:'Téléconsultation possible',detail:'Aucun drapeau dans le questionnaire : à confirmer par l’anesthésiste.'};
 return {received:!!stay?.questionnaire,flags,asa,proposition};
}

/* ---------- Consignes d'arrêt et de poursuite des traitements ---------- */
// lastDay : jour de la DERNIÈRE PRISE par rapport au jour opératoire (J0). Références : GIHP 2015/2024
// (anticoagulants oraux directs), SFAR/GIHP (antiagrégants), SFAR-SFD 2017 et ANSM (antidiabétiques).
// Ces règles sont des valeurs par défaut : l'anesthésiste les modifie et valide avant toute transmission.
const REGLES=[
 {id:'apixaban',label:'Apixaban (Eliquis)',re:/apixaban|eliquis/,classe:'Anticoagulant',kind:'stop',lastDay:r=>r==='Élevé'?-3:-2,ref:'GIHP 2015, actualisation 2024',note:'Pas de relais par héparine. Reprise selon l’hémostase, décidée par le chirurgien et l’anesthésiste.'},
 {id:'rivaroxaban',label:'Rivaroxaban (Xarelto)',re:/rivaroxaban|xarelto/,classe:'Anticoagulant',kind:'stop',lastDay:r=>r==='Élevé'?-3:-2,ref:'GIHP 2015, actualisation 2024',note:'Pas de relais par héparine.'},
 {id:'edoxaban',label:'Édoxaban (Lixiana)',re:/edoxaban|lixiana/,classe:'Anticoagulant',kind:'stop',lastDay:r=>r==='Élevé'?-3:-2,ref:'GIHP 2015, actualisation 2024',note:'Pas de relais par héparine.'},
 {id:'dabigatran',label:'Dabigatran (Pradaxa)',re:/dabigatran|pradaxa/,classe:'Anticoagulant',kind:'stop',lastDay:(r,dfg)=>r==='Élevé'?(dfg!=null&&dfg<50?-5:-4):(dfg!=null&&dfg<50?-3:-2),ref:'GIHP 2015, actualisation 2024',note:'Délai allongé si DFG < 50 mL/min.'},
 {id:'warfarine',label:'Warfarine (Coumadine)',re:/warfarine|coumadine/,classe:'Anticoagulant',kind:'stop',lastDay:()=>-6,ref:'HAS 2008 · GIHP',note:'INR la veille de l’intervention. Relais par héparine selon le risque thrombotique : décision médicale.'},
 {id:'fluindione',label:'Fluindione (Préviscan)',re:/fluindione|previscan/,classe:'Anticoagulant',kind:'stop',lastDay:()=>-6,ref:'HAS 2008 · GIHP',note:'INR la veille. Relais selon le risque thrombotique.'},
 {id:'acenocoumarol',label:'Acénocoumarol (Sintrom, Minisintrom)',re:/acenocoumarol|sintrom/,classe:'Anticoagulant',kind:'stop',lastDay:()=>-4,ref:'HAS 2008 · GIHP',note:'INR la veille. Relais selon le risque thrombotique.'},
 {id:'clopidogrel',label:'Clopidogrel (Plavix)',re:/clopidogrel|plavix/,classe:'Antiagrégant',kind:'stop',lastDay:()=>-6,ref:'GIHP / SFAR 2018 · ESC 2017',note:'Arrêt de 5 jours. Ne jamais arrêter sans avis si stent récent (< 6 mois) : avis du cardiologue.'},
 {id:'ticagrelor',label:'Ticagrélor (Brilique)',re:/ticagrelor|brilique/,classe:'Antiagrégant',kind:'stop',lastDay:()=>-6,ref:'GIHP / SFAR 2018 · ESC 2017',note:'Arrêt de 5 jours (3 jours possibles selon le risque). Avis du cardiologue si stent récent.'},
 {id:'prasugrel',label:'Prasugrel (Efient)',re:/prasugrel|efient/,classe:'Antiagrégant',kind:'stop',lastDay:()=>-8,ref:'GIHP / SFAR 2018 · ESC 2017',note:'Arrêt de 7 jours. Avis du cardiologue si stent récent.'},
 {id:'aspirine',label:'Aspirine à faible dose (Kardégic, Resitune)',re:/aspirine|kardegic|resitune|aspegic/,classe:'Antiagrégant',kind:'continue',ref:'GIHP / SFAR 2018',note:'Poursuivie en règle générale ; arrêt discuté pour les chirurgies à très haut risque hémorragique (neurochirurgie, chirurgie prostatique endoscopique…).'},
 {id:'isglt2',label:'Gliflozine (Forxiga, Jardiance, Invokana, Xigduo, Synjardy)',re:/dapagliflozine|empagliflozine|canagliflozine|forxiga|jardiance|invokana|xigduo|synjardy/,classe:'Antidiabétique',kind:'stop',lastDay:()=>-4,ref:'ANSM / FDA 2022 · SFAR 2023',note:'Arrêt 3 jours pleins (risque d’acidocétose euglycémique). Glycémie et cétonémie à l’arrivée.'},
 {id:'ertugliflozine',label:'Ertugliflozine (Steglatro)',re:/ertugliflozine|steglatro/,classe:'Antidiabétique',kind:'stop',lastDay:()=>-5,ref:'ANSM / FDA 2022',note:'Arrêt 4 jours pleins.'},
 {id:'metformine',label:'Metformine (Glucophage, Stagid, associations)',re:/metformine|glucophage|stagid|janumet|velmetia|eucreas|xigduo|synjardy/,classe:'Antidiabétique',kind:'stop',lastDay:()=>-1,ref:'SFAR-SFD 2017',note:'Dernière prise la veille ; reprise à la reprise alimentaire si la fonction rénale est stable.'},
 {id:'sulfamide',label:'Sulfamide / glinide (gliclazide, glimépiride, répaglinide…)',re:/gliclazide|diamicron|glimepiride|amarel|glibenclamide|daonil|repaglinide|novonorm/,classe:'Antidiabétique',kind:'morning',ref:'SFAR-SFD 2017',note:'Ne pas prendre le matin de l’intervention (risque d’hypoglycémie à jeun).'},
 {id:'glp1',label:'Agoniste GLP-1 (Ozempic, Wegovy, Trulicity, Mounjaro, Victoza…)',re:/semaglutide|ozempic|wegovy|rybelsus|dulaglutide|trulicity|tirzepatide|mounjaro|liraglutide|victoza|saxenda|exenatide|byetta/,classe:'Antidiabétique',kind:'discuss',ref:'SFAR 2024 · ASA multisociétés 2024',note:'Vidange gastrique ralentie : conduite décidée en consultation (poursuite avec régime liquide la veille ou suspension). Signaler au bloc.'},
 {id:'insuline',label:'Insuline',re:/insulin|lantus|novorapid|humalog|toujeo|tresiba|levemir|abasaglar|apidra|fiasp/,classe:'Antidiabétique',kind:'discuss',ref:'SFAR-SFD 2017',note:'Adaptation des doses de la veille et du matin à définir (insuline basale souvent réduite).'},
 {id:'iec',label:'IEC ou sartan (…pril, …sartan)',re:/\b\w+pril\b|\b\w+sartan\b|coversyl|triatec|cotareg|aprovel|kenzen|micardis|olmetec|entresto/,classe:'Antihypertenseur',kind:'morning',ref:'SFAR · ESC/ESAIC 2022',note:'Ne pas prendre le matin de l’intervention (risque d’hypotension), sauf insuffisance cardiaque : avis médical.'},
 {id:'diuretique',label:'Diurétique',re:/furosemide|lasilix|hydrochlorothiazide|esidrex|indapamide|fludex|spironolactone|aldactone|bumetanide|burinex/,classe:'Antihypertenseur',kind:'morning',ref:'SFAR',note:'Ne pas prendre le matin de l’intervention.'},
 {id:'betabloquant',label:'Bêtabloquant',re:/\b\w+olol\b|bisoprolol|cardensiel|detensiel|avlocardyl|nebivolol|temerit|seloken|lopressor/,classe:'Cardiologie',kind:'continue',ref:'ESC/ESAIC 2022',note:'À poursuivre, y compris le matin de l’intervention.'},
 {id:'statine',label:'Statine',re:/\b\w+statine\b|tahor|crestor|elisor|zocor/,classe:'Cardiologie',kind:'continue',ref:'ESC/ESAIC 2022',note:'À poursuivre.'},
 {id:'levothyroxine',label:'Lévothyroxine (Levothyrox, L-Thyroxine)',re:/levothyrox|thyroxine|euthyral/,classe:'Endocrinologie',kind:'continue',ref:'Pratique courante',note:'À poursuivre le matin avec une gorgée d’eau.'},
 {id:'corticoide',label:'Corticoïde au long cours',re:/prednisone|cortancyl|prednisolone|solupred|hydrocortisone|methylprednisolone|medrol/,classe:'Endocrinologie',kind:'continue',ref:'SFAR 2021',note:'À poursuivre ; supplémentation périopératoire selon la dose et la chirurgie.'},
 {id:'oestroprogestatif',label:'Œstroprogestatif (pilule combinée, traitement hormonal)',re:/ethinylestradiol|estradiol|leeloo|optilova|minidril|jasmine|trinordiol|provames|oromone/,classe:'Hormonothérapie',kind:'discuss',ref:'HAS · SFAR',note:'Risque thromboembolique : arrêt éventuel 4 à 6 semaines avant une chirurgie à haut risque, à décider en consultation.'}
];
const DAY=86400000;
function fmtDate(d){return d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
function jour(n){return n===0?'J0':'J'+n}
function consignes(stay){
 const ctx=contexte(stay),risque=ctx.ext.surgicalBleedingRisk||'',dfg=num(ctx.ext.egfr);
 const date=ctx.surgeryDate&&!isNaN(new Date(ctx.surgeryDate+'T12:00:00'))?new Date(ctx.surgeryDate+'T12:00:00'):null;
 const items=[],seen=new Set();
 for(const r of REGLES){if(!r.re.test(ctx.text)||seen.has(r.id))continue;seen.add(r.id);
  const it={id:r.id,label:r.label,classe:r.classe,kind:r.kind,note:r.note,ref:r.ref};
  if(r.kind==='stop'){
   const d=r.lastDay(risque||'Élevé',dfg);it.lastDay=d;
   it.assumption=!risque&&/anticoag|antiagr/i.test(r.classe)?'Risque hémorragique non renseigné : délai du risque élevé appliqué par prudence.':'';
   if(date){const last=new Date(date.getTime()+d*DAY),first=new Date(last.getTime()+DAY);it.lastDate=last.toISOString().slice(0,10);it.text=`Dernière prise le ${fmtDate(last)} (${jour(d)}). Ne plus en prendre à partir du ${fmtDate(first)}.`}
   else it.text=`Dernière prise à ${jour(d)} (date opératoire à renseigner pour calculer la date).`;
  }else if(r.kind==='morning')it.text=date?`Ne pas prendre le matin de l’intervention (${fmtDate(date)}).`:'Ne pas prendre le matin de l’intervention.';
  else if(r.kind==='continue')it.text='À poursuivre normalement, y compris le matin de l’intervention avec une gorgée d’eau.';
  else it.text='Conduite à décider par l’anesthésiste lors de la consultation.';
  items.push(it);
 }
 return {surgeryDate:date?date.toISOString().slice(0,10):'',bleedingRisk:risque,items};
}

/* ---------- Complétude du dossier avant programmation ---------- */
function completude(stay,aide={},identityStatus=''){
 const ctx=contexte(stay),c=ctx.c,e=ctx.ext,surgery=ctx.surgery;
 const meds=consignes(stay).items.filter(i=>i.kind!=='continue');
 const items=[
  {id:'identite',label:'Identité vérifiée',ok:e.identityReviewed==='Oui'||/qualifi|valid/i.test(identityStatus),blocking:true,detail:identityStatus?'Statut : '+identityStatus:'Identité à vérifier en consultation'},
  {id:'annonce',label:'Annonce chirurgicale transmise',ok:!!stay?.surgicalAnnouncement?.published,blocking:true,detail:surgery.procedure||'Intervention non transmise par le chirurgien'},
  {id:'questionnaire',label:'Questionnaire patient reçu',ok:!!stay?.questionnaire,blocking:false,detail:stay?.questionnaire?'Reçu':'Non reçu : relancer le patient'},
  {id:'cpa',label:'Consultation d’anesthésie validée',ok:!!c.validated,blocking:true,detail:c.validated?'Validée':'Brouillon'},
  // Consentement d'anesthésie signé reçu (espace patient, dépôt vérifié ou papier) : écrit par le serveur dans espacePatient.
  (()=>{const cs=stay?.espacePatient?.consentement,r=cs?.recu,ok=!!r&&(r.mode!=='depot'||cs.verification?.conforme===true);return {id:'consentementSigne',label:'Consentement d’anesthésie signé reçu',ok,blocking:true,detail:ok?(r.mode==='papier'?'Reçu sur papier':r.mode==='depot'?'Document signé vérifié':'Signé en ligne'):r?.mode==='depot'?'Document déposé, à vérifier':cs?.envoi&&!cs.annule?'Envoyé le '+String(cs.envoi.at||'').slice(0,10).split('-').reverse().join('/')+', en attente':'À envoyer au patient en fin de consultation'}})(),
  {id:'consentement',label:'Accord du patient recueilli',ok:e.patientAgreement==='Accord recueilli',blocking:true,detail:e.patientAgreement||'Non renseigné'},
  {id:'bilans',label:'Bilans et avis disponibles',ok:!!e.testStatus&&!/attente|Non évalué/.test(e.testStatus)&&!String(e.pendingTests||'').trim(),blocking:true,detail:String(e.pendingTests||'').trim()?'En attente : '+e.pendingTests:e.testStatus||'Bilan non évalué'},
  {id:'traitements',label:'Consignes sur les traitements validées',ok:!meds.length||!!aide?.consignes?.validatedAt,blocking:meds.length>0,na:!meds.length,detail:meds.length?meds.length+' traitement(s) à adapter':'Aucun traitement à adapter repéré'},
  {id:'jeune',label:'Consignes de jeûne données',ok:!!String(e.fasting||'').trim(),blocking:false,detail:String(e.fasting||'').trim()?'Données':'À donner au patient'},
  // Visite pré-anesthésique (vpa.js) : sans objet avant la veille de l'intervention, bloquante ensuite ; un report décidé bloque.
  (()=>{const v=stay?.vpa,sg=v?.signed,d=/^\d{4}-\d{2}-\d{2}$/.test(ctx.surgeryDate)?new Date(ctx.surgeryDate+'T12:00:00'):null,n=new Date(),jours=d&&!isNaN(d)?Math.round((d-new Date(n.getFullYear(),n.getMonth(),n.getDate(),12))/86400000):null;
   if(sg)return {id:'vpa',label:'Visite pré-anesthésique',ok:sg.decision!=='report',blocking:true,detail:sg.decision==='report'?'Report décidé à la VPA'+(sg.motif?' : '+sg.motif:''):'Signée par '+(sg.name||'l’anesthésiste')};
   if(jours==null||jours>1)return {id:'vpa',label:'Visite pré-anesthésique',ok:false,na:true,blocking:false,detail:'À réaliser dans les heures précédant l’intervention'};
   return {id:'vpa',label:'Visite pré-anesthésique',ok:false,blocking:true,detail:v?.draft?.at?'En cours, non signée':'À faire avant l’entrée au bloc'};})(),
  {id:'ambulatoire',label:'Ambulatoire : accompagnant et retour organisés',ok:ctx.mode!=='Ambulatoire'||!!String(e.ambulatory||'').trim(),na:ctx.mode!=='Ambulatoire',blocking:ctx.mode==='Ambulatoire',detail:ctx.mode==='Ambulatoire'?(String(e.ambulatory||'').trim()?'Organisé':'Accompagnant, transport et nuit à domicile à vérifier'):'Hospitalisation'}
 ];
 const missing=items.filter(i=>!i.ok&&!i.na),blocking=missing.filter(i=>i.blocking);
 const done=items.filter(i=>i.ok&&!i.na).length,total=items.filter(i=>!i.na).length;
 return {items,missing,blocking,done,total,ready:!blocking.length,percent:total?Math.round(done/total*100):100};
}

/* ---------- Tour de contrôle du bloc ---------- */
const STATUTS=[
 {id:'attendu',label:'Attendu'},{id:'arrive',label:'Arrivé'},{id:'prepare',label:'Préparé'},{id:'salle',label:'En salle'},
 {id:'sspi',label:'SSPI'},{id:'chambre',label:'En chambre'},{id:'sorti',label:'Sorti'}
];
function statutSuivant(id){const i=STATUTS.findIndex(s=>s.id===id);return STATUTS[Math.min(i+1,STATUTS.length-1)]}

/* ---------- Check-list HAS « Sécurité du patient au bloc opératoire » (version 2018) ---------- */
const CHECKLIST_HAS=[
 {id:'induction',label:'Avant induction anesthésique',sub:'Temps de pause avant anesthésie',items:[
  ['identite','L’identité du patient est correcte (nom, prénom, date de naissance)'],
  ['intervention','L’intervention et le site opératoire sont confirmés (idéalement par le patient et dans tous les cas par le dossier)'],
  ['installation','Le mode d’installation est connu de l’équipe, cohérent avec le site et non dangereux pour le patient'],
  ['peau','La préparation cutanée de l’opéré est documentée dans la fiche de liaison service / bloc'],
  ['materiel','L’équipement et le matériel nécessaires sont vérifiés et adaptés au poids et à la taille du patient'],
  ['risques','Risque allergique, d’inhalation, de difficulté d’intubation ou de ventilation au masque, de saignement important : identifié et partagé']]},
 {id:'incision',label:'Avant intervention chirurgicale',sub:'Temps de pause avant incision (time-out)',items:[
  ['croisee','Vérification « ultime » croisée au sein de l’équipe : identité, intervention, site, installation, documents (imagerie)'],
  ['partage','Partage oral des informations essentielles : étapes critiques chirurgicales et anesthésiques'],
  ['atb','Antibioprophylaxie effectuée selon les recommandations et protocoles en vigueur']]},
 {id:'sortie',label:'Après intervention',sub:'Pause avant sortie de salle d’opération',items:[
  ['enregistree','Confirmation orale : intervention enregistrée, compte final correct (compresses, aiguilles, instruments), étiquetage des prélèvements'],
  ['evenements','Événements indésirables ou porteurs de risques médicaux : signalés et déclarés'],
  ['prescriptions','Les prescriptions et la surveillance postopératoires (seuils d’alerte) sont faites conjointement par les équipes chirurgicale et anesthésique']]}
];
// Un « Non » sur un item ⇒ décision NO GO tant qu'il n'est pas résolu.
function etatChecklist(data={}){
 return CHECKLIST_HAS.map(t=>{const d=data[t.id]||{},answers=t.items.map(([k])=>d.answers?.[k]||'');
  const no=answers.filter(a=>a==='Non').length,empty=answers.filter(a=>!a).length;
  return {id:t.id,complete:!empty,nogo:no>0,signed:!!d.signedBy,answers};});
}

/* ---------- Suivi ambulatoire J+1 ---------- */
// Seuils par défaut demandés par l'équipe médicale (23/11/2026), À RELIRE PAR L'ÉQUIPE :
// alerte si douleur > 4/10, température < 36 °C ou > 38 °C, « Oui » à une question d'alerte, « Non » à la sécurité à domicile.
const SEUILS_J1={douleur:4,temperatureBasse:36,temperatureHaute:38};
const QUESTIONS_J1=[
 ['douleur','Douleur au repos (0 à 10)','number'],
 ['nausees','Nausées ou vomissements persistants','yesno'],
 ['saignement','Saignement ou pansement imbibé','yesno'],
 ['temperature','Température (°C) si mesurée','number'],
 ['miction','Difficulté à uriner depuis le retour','yesno'],
 ['respiration','Essoufflement ou douleur thoracique','yesno'],
 ['mollet','Douleur ou gonflement d’un mollet','yesno'],
 ['moral','Le patient se sent-il en sécurité à domicile ?','yesnoInv']
];
// Mêmes questions, formulées pour le patient (questionnaire du SMS J+1).
const QUESTIONS_J1_PATIENT={douleur:'Votre douleur au repos, de 0 (aucune) à 10 (maximale)',nausees:'Avez-vous des nausées ou des vomissements qui persistent ?',saignement:'Saignez-vous, ou votre pansement est-il imbibé ?',temperature:'Votre température, si vous l’avez prise (°C)',miction:'Avez-vous du mal à uriner depuis votre retour ?',respiration:'Êtes-vous essoufflé(e), ou avez-vous une douleur dans la poitrine ?',mollet:'Avez-vous une douleur ou un gonflement d’un mollet ?',moral:'Vous sentez-vous en sécurité à la maison ?'};
// Réponses du patient : contrôle de forme (toutes les questions Oui/Non et la douleur sont obligatoires).
function validerJ1(input={}){
 const answers={},errors=[];
 for(const [k,,type] of QUESTIONS_J1){
  const v=input[k];
  if(type==='number'){if(v===undefined||v===null||String(v).trim()===''){if(k==='douleur')errors.push('Indiquez votre douleur de 0 à 10.');continue}
   const n=num(v),max=k==='temperature'?43:10,min=k==='temperature'?30:0;if(n==null||n<min||n>max){errors.push(k==='temperature'?'Température invalide (entre 30 et 43 °C).':'Douleur invalide (de 0 à 10).');continue}answers[k]=String(n)}
  else if(v==='Oui'||v==='Non')answers[k]=v;else errors.push('Répondez à chaque question.');
 }
 return {ok:!errors.length,errors:[...new Set(errors)],answers};
}
function alertesJ1(rep={}){
 const out=[],n=num(rep.douleur),t=num(rep.temperature);
 if(n!=null&&n>SEUILS_J1.douleur)out.push({level:n>=8?'crit':'warn',label:'Douleur '+n+'/10'});
 if(t!=null&&t>SEUILS_J1.temperatureHaute)out.push({level:'warn',label:'Fièvre '+String(t).replace('.',',')+' °C'});
 if(t!=null&&t<SEUILS_J1.temperatureBasse)out.push({level:'warn',label:'Température basse '+String(t).replace('.',',')+' °C'});
 for(const [k,label,crit] of [['nausees','Nausées / vomissements persistants'],['saignement','Saignement','crit'],['miction','Rétention urinaire possible'],['respiration','Essoufflement ou douleur thoracique','crit'],['mollet','Signe de phlébite possible','crit']])if(rep[k]==='Oui')out.push({level:crit?'crit':'warn',label});
 if(rep.moral==='Non')out.push({level:'warn',label:'Ne se sent pas en sécurité'});
 return out;
}

/* ---------- Interopérabilité : préconditions d'envoi ---------- */
function envoiLiaisonPossible(stay,identityStatus=''){
 const reasons=[];
 if(!stay?.discharge?.liaison?.document)reasons.push('La lettre de liaison doit être relue et enregistrée.');
 if(!/qualifi/i.test(identityStatus))reasons.push('L’identité INS doit être qualifiée pour alimenter le DMP (statut actuel : '+(identityStatus||'inconnu')+').');
 return {ok:!reasons.length,reasons};
}

return {contexte,scores,resumeScore,profilRisque,incision,orientation,consignes,REGLES,completude,STATUTS,statutSuivant,CHECKLIST_HAS,etatChecklist,SEUILS_J1,QUESTIONS_J1,QUESTIONS_J1_PATIENT,validerJ1,alertesJ1,envoiLiaisonPossible};
});

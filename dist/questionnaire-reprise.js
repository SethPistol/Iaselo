/* IASELO · reprise du questionnaire patient dans la consultation d'anesthésie.
   Fonctions pures, sans DOM ni réseau : testées dans tests/questionnaire-reprise.test.cjs.
   Chaque ligne est une PROPOSITION : rien n'est écrit dans le dossier sans que le médecin
   coche la ligne et confirme. Un champ déjà renseigné par le médecin n'est jamais écrasé :
   les zones de texte reçoivent un ajout, les listes et nombres déjà remplis sont conservés. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloReprise=api;})(typeof self!=='undefined'?self:this,function(root){
'use strict';
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const list=v=>Array.isArray(v)?v.filter(Boolean):[];
const frDay=iso=>/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):String(iso||'');

const GROUPES={
 cardio:['Insuffisance cardiaque','Infarctus ou stent','Trouble du rythme','Hypertension artérielle','Artérite'],
 vte:['Phlébite ou embolie pulmonaire'],
 respiratory:['Asthme','Bronchite chronique','Apnée du sommeil'],
 renal:['Reflux ou hernie hiatale','Ulcère gastrique','Adénome de prostate','Insuffisance rénale'],
 neuro:['AVC','Épilepsie','Troubles psychiques','Diabète','Anomalie de la thyroïde','Myopathie','Myasthénie','Porphyrie']
};
const FAMILLE=/\b(pere|mere|frere|soeur|fils|fille|famille|familial|oncle|tante|cousin|grand)/;

/* Traitements : lignes structurées si le portail les a transmises, sinon relecture du texte. */
function traitements(q){
 const rows=list(q.medRows).filter(r=>Array.isArray(r)&&String(r[0]||'').trim());
 if(rows.length)return rows.map(r=>({name:String(r[0]).trim(),dose:String(r[1]||'').trim(),frequency:[['Matin',r[2]],['Midi',r[3]],['Soir',r[4]]].filter(([,v])=>String(v||'').trim()).map(([l,v])=>l+' '+String(v).trim()).join(' · ')}));
 return String(q.treatments||'').split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{
  const parts=Object.fromEntries(line.split(' · ').map(s=>{const i=s.indexOf(' : ');return i>0?[s.slice(0,i).trim(),s.slice(i+3).trim()]:['Médicament',s.trim()]}));
  return {name:parts['Médicament']||line,dose:parts['Dosage']||'',frequency:['Matin','Midi','Soir'].filter(k=>parts[k]).map(k=>k+' '+parts[k]).join(' · ')};
 }).filter(m=>m.name);
}

/* Points de vigilance à signaler en tête de la relecture (jamais de conduite automatique). */
function alertes(q,regles){
 const a=[],txt=norm([q.anesthesiaDetails,q.other,q.allergyDetails,q.hospitalDetails].join(' ')),d=list(q.diseases),dev=list(q.devices);
 if(/hyperthermie|malign/.test(txt))a.push({level:'crit',text:'Hyperthermie maligne évoquée (personnelle ou familiale) : anesthésie sans halogénés ni succinylcholine à discuter, consultation spécialisée'});
 if(/myopath|myasthen|porphyr/.test(norm(d.join(' '))))a.push({level:'crit',text:'Maladie rare déclarée ('+d.filter(x=>/Myopathie|Myasthénie|Porphyrie/.test(x)).join(', ')+') : protocole anesthésique spécifique à vérifier'});
 if(q.allergy==='Oui')a.push({level:/amox|penicil|cefa|cephal|antibio|curare|latex|chlorhex|iode/.test(norm(q.allergyDetails))?'crit':'warn',text:'Allergie déclarée'+(q.allergyDetails?' : '+q.allergyDetails:' sans précision')+(/amox|penicil|cefa|cephal|antibio/.test(norm(q.allergyDetails))?' · antibioprophylaxie à adapter':'')});
 if(q.allergy==='Je ne sais pas')a.push({level:'warn',text:'Statut allergique incertain selon le patient'});
 if(q.anesthesia==='Oui'&&!/hyperthermie|malign/.test(txt))a.push({level:'warn',text:'Problème anesthésique personnel ou familial'+(q.anesthesiaDetails?' : '+q.anesthesiaDetails:' à préciser')});
 const hem=list(q.bleeding).filter(x=>!/^aucun/i.test(x)).length;if(hem)a.push({level:'warn',text:'HEMSTOP : '+hem+' réponse'+(hem>1?'s':'')+' positive'+(hem>1?'s':'')+' · bilan d’hémostase à discuter'});
 if(dev.some(v=>/Pacemaker/.test(v)))a.push({level:'crit',text:'Pacemaker ou défibrillateur : type, dernier contrôle et programmation à documenter'});
 if(d.includes('Apnée du sommeil'))a.push({level:'warn',text:'Apnée du sommeil déclarée'+(dev.some(v=>/Ventilation/.test(v))?' · appareillage nocturne à apporter':'')});
 if(d.includes('Phlébite ou embolie pulmonaire'))a.push({level:'warn',text:'Antécédent de phlébite ou d’embolie pulmonaire : risque thromboembolique'});
 const meds=norm(traitements(q).map(m=>m.name).join(' ')+' '+q.treatments);
 for(const r of regles||[])if(r.re.test(meds)&&r.kind!=='continue')a.push({level:/Anticoagulant|Antiagrégant/i.test(r.classe)?'crit':'warn',text:r.label+' ('+r.classe+') : dernière prise et conduite à décider'});
 if(['Aucun','1 étage'].includes(q.stairs))a.push({level:'warn',text:'Capacité fonctionnelle déclarée faible ('+q.stairs+')'});
 if(q.tobacco==='Oui')a.push({level:'info',text:'Tabagisme actif déclaré : arrêt à conseiller'});
 if(q.drugs==='Oui')a.push({level:'warn',text:'Consommation de drogues déclarée'+(q.drugDetails?' : '+q.drugDetails:'')});
 if(q.questions)a.push({level:'info',text:'Le patient a posé une question à l’anesthésiste'});
 const seen=new Set();return a.filter(x=>!seen.has(x.text)&&seen.add(x.text));
}

/* Lignes proposées : {id, section, field, label, kind:'text'|'select'|'number'|'date'|'meds', value, current, mode, checked} */
function propositions(stay,opts={}){
 const qq=stay?.questionnaire,q=qq?.answers||{},c=stay?.consult||{},ext=c.ext||{};
 const regles=opts.regles||root?.IaseloRegles?.REGLES||[],scoresFn=opts.scores||root?.IaseloRegles?.scores;
 const recu=frDay(String(qq?.received||'').slice(0,10))||'date inconnue',tag='Déclaré par le patient (questionnaire du '+recu+')';
 const out=[],sections=opts.sections||{};
 const cur=k=>['history','allergies','treatments','plan','asa'].includes(k)?c[k]:ext[k];
 const add=(field,kind,value,extra={})=>{
  if(value==null||value===''||(Array.isArray(value)&&!value.length))return;
  const current=cur(field),empty=current==null||current===''||current==='À vérifier'||current==='Non renseigné';
  let mode,checked=true;
  if(kind==='text'){const already=!empty&&norm(current).includes(norm(value));mode=empty?'fill':already?'same':'append';checked=!already}
  else if(kind==='meds'){mode='add'}
  else{mode=empty?'fill':String(current)===String(value)?'same':'keep';checked=empty}
  out.push({id:field,field,kind,value,current:empty?'':current,mode,checked,section:sections[field]||'',...extra});
 };
 const d=list(q.diseases),dev=list(q.devices),bleed=list(q.bleeding).filter(x=>!/^aucun/i.test(x));
 const pick=g=>d.filter(x=>GROUPES[g].includes(x));
 const w=num(q.weight),h=num(q.height);
 if(w&&w>1&&w<400)add('weight','number',String(w));
 if(h&&h>30&&h<250)add('height','number',String(h));
 if(q.dob&&/^\d{4}-\d{2}-\d{2}$/.test(q.dob)){const b=new Date(q.dob+'T12:00:00'),ref=opts.now?new Date(opts.now):new Date(),age=Math.floor((ref-b)/31557600000);if(age>=0&&age<130)add('age','number',String(age))}
 if(q.operation)add('operationDetails','text',tag+' : '+q.operation+(q.date?' · prévue le '+frDay(q.date):''));
 if(q.date&&/^\d{4}-\d{2}-\d{2}$/.test(q.date))add('surgeryDate','date',q.date,{note:'date indiquée par le patient'});
 const hist=[d.length&&'Maladies : '+d.join(', '),q.other&&'Autres : '+q.other,q.hospital==='Oui'&&'Hospitalisations hors chirurgie'+(q.hospitalDetails?' : '+q.hospitalDetails:'')].filter(Boolean);
 if(hist.length)add('history','text',tag+'\n'+hist.join('\n'));
 if(pick('cardio').length)add('cardio','text',tag+' : '+pick('cardio').join(', '));
 if(pick('respiratory').length||dev.some(v=>/Ventilation/.test(v)))add('respiratory','text',tag+' : '+[...pick('respiratory'),...dev.filter(v=>/Ventilation/.test(v))].join(', '));
 if(pick('renal').length)add('renal','text',tag+' : '+pick('renal').join(', '));
 if(pick('neuro').length)add('neuro','text',tag+' : '+pick('neuro').join(', '));
 if(pick('vte').length)add('vteHistory','text',tag+' : '+pick('vte').join(', '));
 if(q.operations)add('priorOperations','text',tag+' : '+q.operations);
 const anest=[q.anesthesia==='Oui'&&'Problème lié à une anesthésie (patient ou famille)'+(q.anesthesiaDetails?' : '+q.anesthesiaDetails:''),q.anesthesia==='Je ne sais pas'&&'Problème anesthésique : ne sait pas',q.nausea&&'Nausées / vomissements après anesthésie : '+q.nausea,q.travel&&'Mal des transports : '+q.travel].filter(Boolean);
 if(anest.length)add('anesthesiaHistory','text',tag+'\n'+anest.join('\n'));
 if(q.anesthesia==='Oui'&&FAMILLE.test(norm(q.anesthesiaDetails)))add('familyAnesthesia','text',tag+' : '+q.anesthesiaDetails);
 if(q.allergy==='Oui')add('allergies','text',tag+' : allergie'+(q.allergyDetails?' — '+q.allergyDetails:' sans précision'));
 else if(q.allergy==='Non')add('allergies','text',tag+' : aucune allergie connue');
 else if(q.allergy==='Je ne sais pas')add('allergies','text',tag+' : ne sait pas');
 if(bleed.length)add('bleedingHistory','text',tag+' :\n'+bleed.map(x=>'• '+x).join('\n'));
 else if(Array.isArray(q.bleeding))add('bleedingHistory','text',tag+' : aucun antécédent de saignement coché');
 if(Array.isArray(q.bleeding)){add('hemstopDone','select','Oui',{note:'auto-questionnaire du patient'});add('hemstopReview','text','HEMSTOP auto-questionnaire : '+bleed.length+'/7'+(bleed.length?' · '+bleed.join(' ; '):' · aucune réponse positive'))}
 if(dev.length)add('devicesHistory','text',tag+' : '+dev.join(', '));
 const dents=[q.teeth==='Oui'&&'dents refaites, remplacées, déchaussées ou mobiles',dev.includes('Prothèse dentaire')&&'prothèse dentaire'].filter(Boolean);
 if(dents.length)add('dentition','text',tag+' : '+dents.join(', '));
 if(q.tobacco==='Oui')add('smokingStatus','select','Actif');
 const cig=num(q.cigarettes),yrs=num(q.years);if(q.tobacco==='Oui'&&cig&&yrs)add('packYears','number',String(Math.round(cig/20*yrs*10)/10),{note:cig+' cig./j × '+yrs+' ans ÷ 20'});
 const habits=[q.tobacco&&'Tabac : '+q.tobacco+(cig?' · '+cig+' cigarettes/j':'')+(yrs?' depuis '+yrs+' ans':''),q.alcohol!==undefined&&q.alcohol!==''&&'Alcool : '+q.alcohol+' verre(s)/j',q.drugs&&'Drogues : '+q.drugs+(q.drugDetails?' — '+q.drugDetails:'')].filter(Boolean);
 if(habits.length)add('habits','text',tag+' : '+habits.join(' · '));
 if(q.stairs&&q.stairs!=='Je ne sais pas'){add('functional','text',tag+' : monte '+q.stairs.toLowerCase().replace('aucun','aucun étage')+' sans s’arrêter');add('metsCategory','select',['2 étages','3 étages ou plus'].includes(q.stairs)?'≥ 4 MET':'< 4 MET',{note:'≥ 2 étages sans arrêt ≈ 4 MET'})}
 const meds=traitements(q);
 if(meds.length){
  add('treatments','text',tag+' :\n'+meds.map(m=>'• '+[m.name,m.dose,m.frequency].filter(Boolean).join(' · ')).join('\n'));
  add('medicationSource','text','Déclaration du patient (questionnaire du '+recu+') : à confronter à l’ordonnance');
  const known=new Set(list(c.medicationRows).filter(m=>!m.removed).map(m=>norm(m.name)));
  const rows=meds.filter(m=>!known.has(norm(m.name))).map(m=>{const r=regles.find(r=>r.re.test(norm(m.name)));return {...m,classe:r?r.classe:'',rule:r?r.label:''}});
  if(rows.length)add('medicationRows','meds',rows);
 }
 if(q.questions)add('patientQuestions','text','Question du patient : '+q.questions);
 if(scoresFn){try{
  const s=scoresFn(stay).list,fmt=x=>{const yes=x.criteria.filter(k=>k.value===true).map(k=>k.label),miss=x.criteria.filter(k=>k.value===null).map(k=>k.label);return x.label+' : '+x.value+'/'+x.max+(yes.length?' ('+yes.join(', ')+')':'')+(miss.length?' · à compléter : '+miss.join(', '):'')+' · pré-calcul à partir des déclarations'};
  for(const [id,field] of [['stopbang','stopBangReview'],['lee','leeReview'],['apfel','apfelReview']]){const x=s.find(v=>v.id===id);if(x)add(field,'text',fmt(x),{checked:true})}
 }catch{}}
 const al=alertes(q,regles).filter(x=>x.level!=='info');
 if(al.length)add('vigilanceHandoff','text','Issu du questionnaire patient :\n'+al.map(x=>'• '+x.text).join('\n'));
 return out;
}

/* Applique les lignes cochées. Retourne la liste des champs modifiés (pour la traçabilité). */
function appliquer(stay,lignes,meta={}){
 const c=stay.consult??={},ext=c.ext??={},done=[];
 for(const l of lignes){
  if(!l.checked||l.mode==='same')continue;
  if(l.kind==='meds'){const rows=c.medicationRows??=[];for(const m of l.value)rows.push({id:'MED-'+(meta.uuid?meta.uuid():Math.random().toString(36).slice(2)),name:m.name,dose:m.dose,frequency:m.frequency,route:'',indication:'',lastDose:'',verification:'Déclaré par le patient',source:'Questionnaire patient du '+(meta.recu||''),decision:'À déterminer',stopPlan:'',resumePlan:'',instructions:m.rule?m.rule+' · '+m.classe+' : conduite à décider':''});done.push(l.field);continue}
  const top=['history','allergies','treatments','plan','asa'].includes(l.field),target=top?c:ext,old=target[l.field];
  if(l.kind==='text')target[l.field]=l.mode==='append'?String(old).trimEnd()+'\n\n'+l.value:l.value;
  else target[l.field]=l.value;
  done.push(l.field);
 }
 return done;
}
return {propositions,appliquer,alertes,traitements,GROUPES};
});

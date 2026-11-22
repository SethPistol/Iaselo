/* IASELO · règles complémentaires issues de la veille marché (P2/P3 et P1 restants).
   Fonctions pures testées dans tests/veille-plus.test.cjs. Toute valeur est une aide : le professionnel valide. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloReglesPlus=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const DAY=86400000;

/* ---------- Poids de référence (doses au poids) ---------- */
function poids(kg,cm,sexe){
 const w=num(kg),h=num(cm);if(!w)return null;
 const ibw=h?Math.max(0,(sexe==='F'?45.5:50)+0.91*(h-152.4)):null;            // Devine
 const bmi=h?w/((h/100)**2):null;
 const lbw=h?(sexe==='F'?9270*w/(8780+244*bmi):9270*w/(6680+216*bmi)):null;  // Janmahasatian 2005
 return {total:w,ideal:ibw&&Math.round(ibw*10)/10,maigre:lbw&&Math.round(lbw*10)/10,bmi:bmi&&Math.round(bmi*10)/10};
}
// Posologies adultes usuelles d'induction (référentiels SFAR, RCP). Poids de calcul indiqué pour chaque produit.
const PRODUITS=[
 {id:'propofol',label:'Propofol (induction)',min:2,max:2.5,unit:'mg',base:'maigre',ref:'RCP',note:'Réduire chez le sujet âgé ou fragile.'},
 {id:'sufentanil',label:'Sufentanil (induction)',min:0.2,max:0.3,unit:'µg',base:'maigre',ref:'RCP',note:''},
 {id:'rocuronium',label:'Rocuronium (intubation)',min:0.6,max:0.6,unit:'mg',base:'ideal',ref:'RCP',note:'1,2 mg/kg en séquence rapide.'},
 {id:'ketamine',label:'Kétamine (analgésie)',min:0.15,max:0.5,unit:'mg',base:'ideal',ref:'SFAR 2016 (kétamine périopératoire)',note:''},
 {id:'dexamethasone',label:'Dexaméthasone (NVPO)',fixed:'4 à 8 mg',ref:'Consensus NVPO 2020',note:'Dose fixe chez l’adulte.'},
 {id:'cefazoline',label:'Céfazoline (antibioprophylaxie)',fixedBy:p=>p.bmi>35||p.total>120?'4 g (dose doublée : IMC > 35 ou poids > 120 kg)':'2 g',ref:'SFAR 2018 · antibioprophylaxie',note:'30 à 60 min avant incision ; réinjection 1 g toutes les 4 h.'},
 {id:'acidetranexamique',label:'Acide tranexamique',min:10,max:15,unit:'mg',base:'total',cap:1000,ref:'RCP · SFAR',note:'Plafond usuel 1 g.'},
 {id:'paracetamol',label:'Paracétamol IV',fixedBy:p=>p.total<50?Math.round(15*p.total)+' mg (15 mg/kg, poids < 50 kg)':'1 g',ref:'RCP',note:''}
];
function doses(kg,cm,sexe){
 const p=poids(kg,cm,sexe);if(!p)return {poids:null,list:[]};
 return {poids:p,list:PRODUITS.map(d=>{
  if(d.fixed)return {...d,dose:d.fixed};if(d.fixedBy)return {...d,dose:d.fixedBy(p)};
  const w=p[d.base]||p.total,lo=d.min*w,hi=d.max*w,cap=x=>d.cap?Math.min(x,d.cap):x,r=x=>x>=20?Math.round(x):Math.round(x*10)/10;
  const A=r(cap(lo)),B=r(cap(hi));return {...d,poidsCalcul:w,dose:(A===B?A:A+' à '+B)+' '+d.unit};
 })};
}
const EVENEMENTS=['Entrée en salle','Début d’anesthésie','Induction','Intubation','ALR réalisée','Incision','Fin d’intervention','Extubation','Sortie de salle'];

/* ---------- Bilans préopératoires guidés (SFAR-HAS 2012 : pas d'examen systématique) ---------- */
function bilansGuides(stay){
 const c=stay?.consult||{},e=c.ext||{},q=stay?.questionnaire?.answers||{},d=Array.isArray(q.diseases)?q.diseases:[];
 const age=num(e.age),tx=norm([c.treatments,e.treatments,q.treatments].join(' ')),hist=norm([c.history,e.cardio,e.renal].join(' '));
 const bleed=e.surgicalBleedingRisk,transf=e.transfusionLikelihood,out=[];
 const add=(exam,why,level='propose')=>out.push({exam,why,level});
 if(d.some(x=>/cardiaque|Infarctus|rythme/.test(x))||/coronar|insuffisance cardiaque|arythmie|fibrillation/.test(hist))add('ECG','Cardiopathie connue ou symptômes');
 else if(age>65&&bleed&&bleed!=='Faible')add('ECG','Âge > 65 ans et chirurgie à risque intermédiaire ou élevé');
 if(bleed==='Élevé'||transf==='Probable'||transf==='Possible')add('Hémoglobine (NFS)','Chirurgie à risque hémorragique / transfusion possible');
 if(transf==='Probable'||transf==='Possible')add('Groupe sanguin et RAI','Probabilité de transfusion '+String(transf).toLowerCase());
 if(/apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|metformine|glucophage|\w+pril|\w+sartan|furosemide|lasilix/.test(tx)||d.includes('Insuffisance rénale')||d.includes('Diabète'))add('Créatinine et DFG','Traitement éliminé par le rein ou terrain rénal / diabétique');
 if(/furosemide|lasilix|\w+pril|\w+sartan|spironolactone|aldactone/.test(tx)||d.includes('Insuffisance rénale'))add('Kaliémie','Diurétique, IEC/sartan ou insuffisance rénale');
 if(d.includes('Diabète'))add('Glycémie et HbA1c','Diabète déclaré');
 const hem=Array.isArray(q.bleeding)?q.bleeding.filter(x=>!/^aucun/i.test(x)).length:0;
 if(hem>0)add('TP, TCA, plaquettes','Questionnaire hémorragique positif');
 if(/warfarine|coumadine|fluindione|previscan|acenocoumarol|sintrom/.test(tx))add('INR la veille','AVK au long cours');
 if(e.sex==='Femme'&&age!=null&&age<50)add('β-hCG si doute','Femme en âge de procréer, selon l’interrogatoire','discuter');
 return {list:out,none:!out.length,ref:'SFAR-HAS 2012 : examens préinterventionnels non systématiques, guidés par le terrain et l’intervention'};
}

/* ---------- Scores SSPI et sortie ---------- */
const ALDRETE=[
 ['activite','Activité motrice',['Aucun membre','2 membres','4 membres']],
 ['respiration','Respiration',['Apnée','Dyspnée / limitée','Respire et tousse']],
 ['circulation','Pression artérielle',['± 50 % de la valeur préop.','± 20 à 50 %','± 20 %']],
 ['conscience','Conscience',['Ne répond pas','Réveillable à l’appel','Bien réveillé']],
 ['spo2','SpO₂',['< 90 % sous O₂','> 90 % sous O₂','> 92 % en air ambiant']]
];
const CHUNG=[
 ['constantes','Constantes vitales',['> 40 % de la valeur préop.','20 à 40 %','< 20 %']],
 ['marche','Activité / marche',['Ne marche pas','Marche avec aide','Marche sans aide, sans vertige']],
 ['nvpo','Nausées, vomissements',['Sévères','Modérés','Absents ou minimes']],
 ['douleur','Douleur',['Non contrôlée','Contrôlée par antalgiques oraux, acceptable','Absente ou minime']],
 ['saignement','Saignement chirurgical',['Sévère','Modéré','Minime']]
];
function score(grille,rep={}){const vals=grille.map(([k])=>rep[k]),done=vals.every(v=>v!==undefined&&v!==''&&v!==null);const total=vals.reduce((s,v)=>s+(num(v)||0),0);return {total,max:grille.length*2,complete:done,sortie:done&&total>=9&&grille.every(([k])=>num(rep[k])>0)}}
const aldrete=rep=>({...score(ALDRETE,rep),ref:'Aldrete modifié 1995 · sortie de SSPI si ≥ 9, aucun item à 0'});
const chung=rep=>({...score(CHUNG,rep),ref:'PADSS, Chung 1995 · sortie ambulatoire si ≥ 9'});

/* ---------- Échelles infirmières ---------- */
const BRADEN=[
 ['perception','Perception sensorielle',4],['humidite','Humidité',4],['activite','Activité',4],['mobilite','Mobilité',4],['nutrition','Nutrition',4],['friction','Friction et cisaillement',3]
];
function braden(rep={}){const t=BRADEN.reduce((s,[k])=>s+(num(rep[k])||0),0),complete=BRADEN.every(([k])=>num(rep[k])!=null);return {total:t,complete,level:!complete?'na':t<=12?'crit':t<=18?'warn':'ok',text:!complete?'Incomplet':t<=12?'Risque élevé d’escarre':t<=18?'Risque modéré / faible d’escarre':'Pas de risque particulier',ref:'Braden 1987 · risque si ≤ 18'}}
const MORSE=[
 ['chute','Antécédent de chute (3 mois)',[0,25]],['diag','Diagnostic secondaire',[0,15]],['aide','Aide à la marche',[0,15,30]],['perfusion','Perfusion / voie veineuse',[0,20]],['demarche','Démarche',[0,10,20]],['mental','État mental (surestime ses capacités)',[0,15]]
];
function morse(rep={}){const t=MORSE.reduce((s,[k])=>s+(num(rep[k])||0),0);return {total:t,level:t>=45?'crit':t>=25?'warn':'ok',text:t>=45?'Risque de chute élevé':t>=25?'Risque de chute modéré':'Risque de chute faible',ref:'Morse 1989'}}

/* ---------- Conciliation médicamenteuse d'entrée ---------- */
function conciliation(stay){
 const q=stay?.questionnaire||{},rows=Array.isArray(q.medRows)?q.medRows.filter(r=>r.some(Boolean)):[],c=stay?.consult||{};
 const declared=rows.length?rows.map(r=>({nom:r[0],dosage:r[1],posologie:[r[2]&&'matin '+r[2],r[3]&&'midi '+r[3],r[4]&&'soir '+r[4]].filter(Boolean).join(', ')})):String(q.answers?.treatments||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).map(nom=>({nom,dosage:'',posologie:''}));
 const cpa=norm([c.treatments,c.ext?.treatments].join(' '));
 return declared.map(m=>{const key=norm(m.nom).split(/\s+/)[0];return {...m,source:'Questionnaire patient',retrouveCpa:!!key&&cpa.includes(key)}});
}

/* ---------- Protocoles postopératoires (à prescrire dans un outil certifié) ---------- */
const PROTOCOLES=[
 {id:'raac-pth',label:'RAAC prothèse de hanche / genou',for:/hanche|genou|pth|ptg/,lignes:['Paracétamol 1 g × 4 / 24 h','AINS 48 h en l’absence de contre-indication','Antalgique de palier supérieur si EVA > 4','Thromboprophylaxie selon le protocole de l’établissement (durée orthopédique)','Lever J0 avec kinésithérapeute','Reprise alimentaire et retrait de la perfusion J0']},
 {id:'raac-colo',label:'RAAC chirurgie colorectale',for:/colorectal|digestive|colectomie/,lignes:['Analgésie multimodale sans morphinique si possible','Prévention NVPO selon le score d’Apfel','Boisson à H+4, alimentation J1','Lever J0, chaise 2 h','Retrait sonde urinaire J1','Thromboprophylaxie selon le protocole']},
 {id:'ambu-standard',label:'Ambulatoire standard',for:/./,lignes:['Paracétamol 1 g × 4 / 24 h','AINS si autorisés','Antalgique de recours remis à la sortie','Consignes écrites, numéro d’appel 24 h/24','Appel du lendemain (J+1)']}
];
function protocolesPour(operation){const op=norm(operation);return PROTOCOLES.filter(p=>p.for.test(op))}

/* ---------- Codage PMSI : diagnostics associés (CIM-10) proposés à partir du dossier ---------- */
const CIM10=[
 [/diabete/, 'E11','Diabète sucré de type 2 (type à confirmer)'],[/hypertension|\bhta\b/,'I10','Hypertension essentielle'],[/apnee du sommeil|saos/,'G47.3','Apnée du sommeil'],
 [/fibrillation|trouble du rythme|arythmie/,'I48','Fibrillation et flutter auriculaires (à préciser)'],[/insuffisance cardiaque/,'I50','Insuffisance cardiaque'],[/insuffisance renale/,'N18','Maladie rénale chronique (stade à préciser)'],
 [/asthme/,'J45','Asthme'],[/bronchite chronique|bpco/,'J44','Autres maladies pulmonaires obstructives chroniques'],[/infarctus|stent|coronar/,'I25','Cardiopathie ischémique chronique']
];
function diagnosticsProposes(stay){
 const c=stay?.consult||{},q=stay?.questionnaire?.answers||{},txt=norm([c.history,c.ext?.cardio,c.ext?.respiratory,c.ext?.renal,...(Array.isArray(q.diseases)?q.diseases:[])].join(' \n '));
 const out=CIM10.filter(([re])=>re.test(txt)).map(([,code,label])=>({code,label,source:'Antécédents du dossier'}));
 const w=num(c.ext?.weight),h=num(c.ext?.height);if(w&&h&&w/((h/100)**2)>=30)out.push({code:'E66',label:'Obésité (IMC '+(w/((h/100)**2)).toFixed(1).replace('.',',')+')',source:'Calcul IMC'});
 return out;
}

/* ---------- Dispositifs médicaux implantables : lecture d'un code GS1 (DataMatrix / UDI) ---------- */
function lireGS1(code){
 const s=String(code||'').replace(/[\u001d]/g,'|').replace(/\s+/g,'');const out={};let i=0;const take=(n)=>{const v=s.slice(i,i+n);i+=n;return v};
 const varlen=()=>{let j=s.indexOf('|',i);const k=s.slice(i).search(/\((?:\d{2})\)/);if(j<0)j=s.length;if(k>0&&i+k<j)j=i+k;const v=s.slice(i,j);i=j+(s[j]==='|'?1:0);return v};
 while(i<s.length){if(s[i]==='('){const end=s.indexOf(')',i);const ai=s.slice(i+1,end);i=end+1;
   if(ai==='01')out.gtin=take(14);else if(ai==='17'){const v=take(6);out.peremption='20'+v.slice(0,2)+'-'+v.slice(2,4)+'-'+(v.slice(4,6)==='00'?'28':v.slice(4,6))}else if(ai==='10')out.lot=varlen();else if(ai==='21')out.serie=varlen();else if(ai==='11')take(6);else varlen();}
  else{const ai=take(2);if(ai==='01')out.gtin=take(14);else if(ai==='17'){const v=take(6);out.peremption='20'+v.slice(0,2)+'-'+v.slice(2,4)+'-'+(v.slice(4,6)==='00'?'28':v.slice(4,6))}else if(ai==='10')out.lot=varlen();else if(ai==='21')out.serie=varlen();else if(ai==='11')take(6);else break;}}
 out.valide=!!out.gtin&&/^\d{14}$/.test(out.gtin)&&gtinCle(out.gtin);
 return out;
}
function gtinCle(g){const d=g.split('').map(Number),c=d.pop();const s=d.reverse().reduce((t,x,i)=>t+x*(i%2?1:3),0);return (10-s%10)%10===c}

/* ---------- Indicateurs du bloc et de qualité ---------- */
function indicateursBloc(stays,ouvertureMin=600){
 const passages=[];
 for(const s of stays){const h=s.blocStatut?.history||[];const inn=h.find(x=>x.to==='salle'),out=h.find(x=>x.to==='sspi'||x.to==='chambre');if(inn)passages.push({id:s.id,entree:inn.at,sortie:out?.at||null});}
 const minutes=passages.filter(p=>p.sortie).reduce((t,p)=>t+Math.max(0,(new Date(p.sortie)-new Date(p.entree))/60000),0);
 const first=passages.map(p=>new Date(p.entree)).sort((a,b)=>a-b)[0];
 return {passages:passages.length,termines:passages.filter(p=>p.sortie).length,minutes:Math.round(minutes),occupation:Math.round(minutes/ouvertureMin*100),premiereEntree:first?first.toISOString():null};
}
function iqss(stays){
 const sortis=stays.filter(s=>s.stage==='Sortie'||s.blocStatut?.state==='sorti');
 const pct=(n,d)=>d?Math.round(n/d*100):null;
 const lettre=sortis.filter(s=>s.discharge?.liaison?.document).length;
 const opere=stays.filter(s=>['salle','sspi','chambre','sorti'].includes(s.blocStatut?.state)||['Intervention','SSPI','Hospitalisation','Sortie'].includes(s.stage));
 const check=opere.filter(s=>['induction','incision','sortie'].every(t=>s.checklistBloc?.[t]?.signedBy)).length;
 const douleur=opere.filter(s=>(s.soinsPlus?.echelles||[]).some(x=>x.type==='douleur')||(Array.isArray(s.postopVitals)&&s.postopVitals.some(v=>v.values?.pain!==undefined&&v.values?.pain!==''))).length;
 const cpa=opere.filter(s=>s.consult?.validated).length;
 return [
  {id:'lettre',label:'Lettre de liaison à la sortie',num:lettre,den:sortis.length,pct:pct(lettre,sortis.length),cible:90},
  {id:'checklist',label:'Check-list HAS complète (3 temps)',num:check,den:opere.length,pct:pct(check,opere.length),cible:100},
  {id:'douleur',label:'Douleur évaluée après l’intervention',num:douleur,den:opere.length,pct:pct(douleur,opere.length),cible:90},
  {id:'cpa',label:'Consultation d’anesthésie validée avant le bloc',num:cpa,den:opere.length,pct:pct(cpa,opere.length),cible:100}
 ];
}

/* ---------- Conservation du dossier (art. R1112-7 CSP) ---------- */
function conservation(birthDate,dernierSejour){
 const last=new Date(dernierSejour||Date.now());if(isNaN(last))return null;
 let fin=new Date(last.getTime());fin.setFullYear(fin.getFullYear()+20);
 const b=birthDate?new Date(birthDate+'T12:00:00'):null;let motif='20 ans après le dernier séjour';
 if(b&&!isNaN(b)){const age=(last-b)/31557600000;const vingtHuit=new Date(b.getTime());vingtHuit.setFullYear(vingtHuit.getFullYear()+28);if(age<8&&vingtHuit>fin){fin=vingtHuit;motif='jusqu’au 28e anniversaire (patient de moins de 8 ans au dernier séjour)'}}
 return {jusquau:fin.toISOString().slice(0,10),motif,ref:'Code de la santé publique, art. R1112-7'};
}
// Demandes d'exercice des droits RGPD : réponse sous un mois (art. 12 RGPD), prolongeable de deux mois.
function echeanceDroit(recuLe){const d=new Date(recuLe);if(isNaN(d))return null;const e=new Date(d.getTime());e.setMonth(e.getMonth()+1);return e.toISOString().slice(0,10)}

/* ---------- Préadmission : pièces et reste à charge ---------- */
function piecesAttendues(stay){
 const id=stay?.identity||{},b=id.birthDate?new Date(id.birthDate+'T12:00:00'):null,mineur=b&&!isNaN(b)&&(Date.now()-b)/31557600000<18;
 return [['identite','Pièce d’identité'],['vitale','Carte Vitale ou attestation de droits'],['mutuelle','Carte de mutuelle / prise en charge'],['consentementChir','Consentement chirurgical signé'],['confiance','Désignation de la personne de confiance'],...(mineur?[['parentale','Autorisation d’opérer signée par les deux parents']]:[])];
}
function resteACharge({nuits=0,prixChambre=0,priseEnChargeChambre=0,depassements=0,priseEnChargeDepassements=0,forfaitJournalier=20,ambulatoire=false}={}){
 const n=Math.max(0,num(nuits)||0),chambre=Math.max(0,(num(prixChambre)||0)-(num(priseEnChargeChambre)||0))*n;
 const forfait=ambulatoire?0:(num(forfaitJournalier)??20)*(n+1);
 const dep=Math.max(0,(num(depassements)||0)-(num(priseEnChargeDepassements)||0));
 return {chambre:Math.round(chambre*100)/100,forfait,depassements:dep,total:Math.round((chambre+forfait+dep)*100)/100,note:'Forfait journalier hospitalier : 20 € par jour (jour de sortie compris), souvent pris en charge par la mutuelle ; non dû en ambulatoire.'};
}
function relances(dateOperatoire){
 const d=dateOperatoire&&new Date(dateOperatoire+'T12:00:00');if(!d||isNaN(d))return [];
 return [7,3].map(n=>({kind:'j-'+n,date:new Date(d.getTime()-n*DAY).toISOString().slice(0,10)}));
}

/* ---------- PROMs à J30 ---------- */
const PROMS=[['satisfaction','Satisfaction globale (0 à 10)'],['douleurJ30','Douleur actuelle (0 à 10)'],['autonomie','Retour aux activités habituelles (0 à 10)'],['recommande','Recommanderiez-vous l’établissement ? (0 à 10)']];

return {poids,doses,PRODUITS,EVENEMENTS,bilansGuides,ALDRETE,CHUNG,aldrete,chung,BRADEN,braden,MORSE,morse,conciliation,PROTOCOLES,protocolesPour,diagnosticsProposes,lireGS1,gtinCle,indicateursBloc,iqss,conservation,echeanceDroit,piecesAttendues,resteACharge,relances,PROMS};
});

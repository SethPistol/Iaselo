/* IASELO · reprise des dossiers d'E-med depuis les formats d'échange publics (27/11/2026, point de la 3e veille).
   En attendant un export réel (fictif) d'E-med, IASELO lit les formats publics que ce type de logiciel sait produire :
   - HL7 v2 (un ou plusieurs messages ADT/ORU) : PID identité, PV1 venue, AL1 allergies, DG1/PRB antécédents,
     RXE/RXO/RXA traitements, OBX poids, taille, groupe sanguin, IMC ; ORU = biologie (via IaseloHl7) ;
   - HPRIM Santé 2.x (biologie) ;
   - FHIR R4 (Bundle JSON) : Patient, AllergyIntolerance, Condition, MedicationStatement/MedicationRequest, Observation ;
   - CSV d'un tableur (une ligne par patient ; allergies, antécédents et traitements séparés par « | » dans la cellule).
   Sortie commune : {format, patients:[{identite, allergies[], antecedents[], traitements[], mesures, biologie[]}], avertissements[]}.
   Rien n'est écrit sans relecture : l'écran « Reprise des dossiers » montre l'aperçu, le rapprochement avec les patients
   existants (INS, IPP, nom + date de naissance) et laisse choisir. Données marquées « reprises d'E-med, à relire ». */
(function(root,factory){const deps=typeof module==='object'&&module.exports?[require('./interop-hl7.js'),require('./ameliorations-regles.js')]:[root.IaseloHl7,root.IaseloAmeliorations];const api=factory(...deps);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloRepriseEmed=api;})(typeof self!=='undefined'?self:globalThis,function(H,A){
'use strict';
const t=v=>v===undefined||v===null?'':String(v).replace(/\s+/g,' ').trim();
const plie=s=>t(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const uniques=l=>{const vu=new Set();return l.map(t).filter(x=>x&&!vu.has(plie(x))&&vu.add(plie(x)))};
const SEXE={F:'Féminin',M:'Masculin',female:'Féminin',male:'Masculin'};
const vide=()=>({identite:{nom:'',prenom:'',nomUsage:'',naissance:'',sexe:'',ipp:'',ins:''},allergies:[],antecedents:[],traitements:[],mesures:{},biologie:[],venue:null});
function mesure(p,libelle,code,valeur,unite){
 const l=plie(libelle)+' '+plie(code),n=Number(String(valeur).replace(',','.'));
 if(/poids|weight|29463-7|3141-9/.test(l)&&n>0&&n<400)p.mesures.poids=unite&&/^g$/i.test(unite)?n/1000:n;
 else if(/taille|height|8302-2/.test(l)&&n>0)p.mesures.taille=n<3?Math.round(n*100):n;
 else if(/groupe|abo|rhesus|883-9|882-1/.test(l)&&t(valeur))p.mesures.groupeSanguin=t(valeur);
 else if(/imc|bmi|39156-5/.test(l)&&n>0)p.mesures.imc=n;
 else return false;return true;
}
const imc=p=>{const {poids,taille}=p.mesures;if(poids&&taille&&!p.mesures.imc)p.mesures.imc=Math.round(poids/((taille/100)**2)*10)/10};

/* ---------- HL7 v2 ---------- */
function messagesHl7(texte){return t(texte)?String(texte).replace(/^﻿/,'').replace(/\r\n|\n/g,'\r').split(/\r(?=MSH\|)/).map(m=>m.trim()).filter(m=>m.startsWith('MSH'))
 .map(m=>m.split('\r').filter(Boolean).join('\r')):[]}
function depuisHl7(texte){
 const parCle=new Map(),avert=[];
 for(const brut of messagesHl7(texte)){
  let m;try{m=H.lireHl7(brut)}catch(e){avert.push('Message HL7 illisible : '+e.message);continue}
  const pid=H.seg(m,'PID');if(!pid){avert.push('Message sans segment PID ignoré.');continue}
  const id=H.identite(pid),cle=id.ins||id.ipp||[id.nom,id.prenom,id.naissance].join('|');
  const p=parCle.get(cle)||vide();parCle.set(cle,p);Object.assign(p.identite,Object.fromEntries(Object.entries(id).filter(([,v])=>v)));
  const pv1=H.seg(m,'PV1');if(pv1)p.venue={classe:{I:'Hospitalisation',O:'Externe',E:'Urgences',R:'Ambulatoire'}[H.val(pv1,2)]||H.val(pv1,2),entree:H.dateHl7(H.val(pv1,44)),nda:H.val(pv1,19),service:H.val(pv1,3)};
  for(const s of H.segs(m,'AL1')){const nom=H.val(s,3,2)||H.val(s,3,1);if(nom)p.allergies.push(nom+(H.val(s,5)?' ('+H.val(s,5)+')':''))}
  for(const s of H.segs(m,'DG1')){const l=H.val(s,3,2)||H.val(s,4)||H.val(s,3,1);if(l)p.antecedents.push(l+(H.val(s,3,1)&&H.val(s,3,2)?' ['+H.val(s,3,1)+']':''))}
  for(const s of H.segs(m,'PRB')){const l=H.val(s,3,2)||H.val(s,3,1);if(l)p.antecedents.push(l)}
  for(const s of [...H.segs(m,'RXE'),...H.segs(m,'RXO')]){const l=H.val(s,s.nom==='RXE'?2:1,2)||H.val(s,s.nom==='RXE'?2:1,1);if(l)p.traitements.push(l+(s.nom==='RXE'&&H.val(s,3)?' '+H.val(s,3)+' '+H.val(s,5,1):'').replace(/\s+$/,''))}
  for(const s of H.segs(m,'RXA')){const l=H.val(s,5,2)||H.val(s,5,1);if(l)p.traitements.push(l)}
  const ent=H.entete(m);
  if(ent.type==='ORU'){try{const b=H.biologieDepuisHl7(brut);for(const c of b.comptesRendus)p.biologie.push(...c.demandes)}catch(e){avert.push('Biologie : '+e.message)}}
  else for(const s of H.segs(m,'OBX'))mesure(p,H.val(s,3,2),H.val(s,3,1),H.val(s,5),H.val(s,6))||avert.push('Observation non reprise : '+(H.val(s,3,2)||H.val(s,3,1)));
 }
 return {patients:[...parCle.values()],avertissements:avert};
}

/* ---------- HPRIM Santé (biologie) ---------- */
function depuisHprim(texte){
 const b=H.biologieDepuisHprim(texte),parCle=new Map();
 for(const c of b.comptesRendus){const cle=c.patient.ipp||[c.patient.nom,c.patient.prenom,c.patient.naissance].join('|');const p=parCle.get(cle)||vide();parCle.set(cle,p);Object.assign(p.identite,Object.fromEntries(Object.entries(c.patient).filter(([,v])=>v)));p.biologie.push(...c.demandes)}
 return {patients:[...parCle.values()],avertissements:[]};
}

/* ---------- FHIR R4 (Bundle) ---------- */
const libelleCode=c=>t(c?.text)||t(c?.coding?.find(x=>x.display)?.display)||t(c?.coding?.[0]?.code);
function depuisFhir(json){
 const d=typeof json==='string'?JSON.parse(json):json,res=d.resourceType==='Bundle'?(d.entry||[]).map(e=>e.resource).filter(Boolean):[d];
 const patients=new Map(),avert=[];
 for(const r of res.filter(r=>r.resourceType==='Patient')){
  const p=vide(),nom=(r.name||[]).find(n=>n.use==='official')||(r.name||[])[0]||{},usage=(r.name||[]).find(n=>n.use==='usual');
  const ins=(r.identifier||[]).find(i=>/1\.2\.250\.1\.213\.1\.4\.(8|9|10|11)/.test(i.system||'')),ipp=(r.identifier||[]).find(i=>i!==ins);
  p.identite={nom:t(nom.family).toUpperCase(),prenom:t((nom.given||[]).join(' ')),nomUsage:t(usage?.family).toUpperCase(),naissance:t(r.birthDate).slice(0,10),sexe:SEXE[r.gender]||'',ipp:t(ipp?.value),ins:t(ins?.value)};
  patients.set('Patient/'+r.id,p);
 }
 const cible=r=>{const ref=r.patient?.reference||r.subject?.reference||'';return patients.get(ref)||(patients.size===1?[...patients.values()][0]:null)};
 for(const r of res){
  if(r.resourceType==='Patient')continue;const p=cible(r);if(!p){avert.push(r.resourceType+' sans patient retrouvé.');continue}
  if(r.resourceType==='AllergyIntolerance'){const l=libelleCode(r.code);if(l)p.allergies.push(l+(r.reaction?.[0]?.manifestation?.[0]?' ('+libelleCode(r.reaction[0].manifestation[0])+')':''))}
  else if(r.resourceType==='Condition'){const l=libelleCode(r.code);if(l)p.antecedents.push(l)}
  else if(/^Medication(Statement|Request)$/.test(r.resourceType)){const l=libelleCode(r.medicationCodeableConcept)||t(r.medicationReference?.display);if(l)p.traitements.push(l+(r.dosage?.[0]?.text||r.dosageInstruction?.[0]?.text?' '+(r.dosage?.[0]?.text||r.dosageInstruction[0].text):''))}
  else if(r.resourceType==='Observation'){const q=r.valueQuantity;if(!mesure(p,libelleCode(r.code),r.code?.coding?.[0]?.code||'',q?q.value:libelleCode(r.valueCodeableConcept)||r.valueString,q?.unit||''))avert.push('Observation non reprise : '+libelleCode(r.code))}
  else avert.push('Ressource '+r.resourceType+' non reprise.');
 }
 return {patients:[...patients.values()],avertissements:avert};
}

/* ---------- CSV (tableur) ---------- */
const COLONNES={nom:['nom','nom de naissance','nom patient'],prenom:['prenom','prenoms'],naissance:['date de naissance','naissance','ddn','ne le','nee le'],sexe:['sexe','genre'],
 ipp:['ipp','nip','n dossier','numero de dossier','identifiant patient'],ins:['ins','matricule ins','nir'],nomUsage:['nom d usage','nom usuel','nom marital'],
 allergies:['allergies','allergie','intolerances'],antecedents:['antecedents','atcd','antecedents medicaux','antecedents chirurgicaux','pathologies'],
 traitements:['traitements','traitement','traitement habituel','traitement personnel','medicaments'],poids:['poids','poids kg'],taille:['taille','taille cm'],groupe:['groupe sanguin','groupe','abo']};
function depuisCsv(texte){
 const {rows}=A.parseCsv(texte);if(rows.length<2)throw Error('Fichier CSV vide : une ligne de titres puis une ligne par patient.');
 const h=rows[0].map(x=>plie(x).replace(/[^a-z0-9]+/g,' ').trim()),col={};
 for(const [k,syn] of Object.entries(COLONNES)){const i=h.findIndex(x=>syn.includes(x));if(i>=0)col[k]=i}
 if(col.nom===undefined||col.naissance===undefined)throw Error('Colonnes « Nom » et « Date de naissance » obligatoires.');
 const g=(r,k)=>col[k]===undefined?'':t(r[col[k]]),liste=v=>v.split(/\s*[;|]\s*|\s*\n\s*/).filter(Boolean),avert=[];
 const patients=rows.slice(1).map((r,i)=>{const p=vide();
  p.identite={nom:g(r,'nom').toUpperCase(),prenom:g(r,'prenom'),nomUsage:g(r,'nomUsage').toUpperCase(),naissance:A.dateIso(g(r,'naissance')),sexe:{F:'Féminin',M:'Masculin'}[/^(f|femme)/i.test(g(r,'sexe'))?'F':/^(m|h|homme)/i.test(g(r,'sexe'))?'M':'']||'',ipp:g(r,'ipp'),ins:g(r,'ins').replace(/\s/g,'')};
  if(!p.identite.naissance)avert.push('Ligne '+(i+2)+' : date de naissance illisible.');
  p.allergies=liste(g(r,'allergies'));p.antecedents=liste(g(r,'antecedents'));p.traitements=liste(g(r,'traitements'));
  if(g(r,'poids'))mesure(p,'poids','',g(r,'poids'),'kg');if(g(r,'taille'))mesure(p,'taille','',g(r,'taille'),'cm');if(g(r,'groupe'))p.mesures.groupeSanguin=g(r,'groupe');
  return p}).filter(p=>p.identite.nom);
 return {patients,avertissements:avert};
}

const AUCUNE=/^(aucune?|nkda|pas d.?allergie|neant|r\.?a\.?s\.?|non)$/i;
function lire(texte,nomFichier=''){
 const s=String(texte||'').replace(/^﻿/,'').trimStart();let format,r;
 if(s.startsWith('MSH|')){format='HL7 v2';r=depuisHl7(s)}
 else if(/^H\|/.test(s)){format='HPRIM Santé';r=depuisHprim(s)}
 else if(s.startsWith('{')){format='FHIR R4';try{r=depuisFhir(s)}catch(e){throw Error('JSON illisible ou non FHIR : '+e.message)}}
 else if(/\.(csv|txt|tsv)$/i.test(nomFichier)||/[;,\t]/.test(s.split(/\r?\n/)[0]||'')){format='CSV';r=depuisCsv(s)}
 else throw Error('Format non reconnu : HL7 v2 (MSH|…), HPRIM Santé (H|…), FHIR R4 (JSON) ou CSV attendu.');
 for(const p of r.patients){
  const sansAllergie=p.allergies.length&&p.allergies.every(a=>AUCUNE.test(t(a)));
  p.allergies=sansAllergie?[]:uniques(p.allergies.filter(a=>!AUCUNE.test(t(a))));p.aucuneAllergie=!!sansAllergie;
  p.antecedents=uniques(p.antecedents);p.traitements=uniques(p.traitements);imc(p);
  p.manque=[!p.identite.nom&&'nom',!p.identite.naissance&&'date de naissance'].filter(Boolean);
 }
 if(!r.patients.length)throw Error('Aucun patient trouvé dans le fichier.');
 return {format,patients:r.patients,avertissements:r.avertissements.slice(0,50)};
}
// Rapprochement avec les patients d'IASELO (mêmes règles que les flux entrants) : certain (INS, IPP), probable, possible.
const rapprocher=(p,sejours)=>H.rapprocher({...p.identite},(sejours||[]).map(s=>({id:s.id,ipp:s.identity?.ipp,identity:s.identity||{}})));
// Texte à verser dans la consultation (ancienne trame, reprise par la trame à la première ouverture) quand le champ est vide.
function versConsultation(consult,p,source){
 const c={...(consult||{})},faits=[],marque=' (repris d’E-med, à relire)';
 const vide=v=>!t(v)||['Non renseigné','À vérifier'].includes(t(v));
 if(c.cpa)return {consult:c,faits:[],note:'Consultation déjà commencée : données écrites dans l’historique du dossier, à reporter.'};
 if(p.allergies.length&&vide(c.allergies)){c.allergies=p.allergies.join(' ; ')+marque;faits.push('allergies')}
 else if(p.aucuneAllergie&&vide(c.allergies)){c.allergies='Aucune allergie connue'+marque;faits.push('allergies')}
 if(p.antecedents.length&&vide(c.history)){c.history=p.antecedents.join('\n');faits.push('antécédents')}
 if(p.traitements.length&&vide(c.treatments)){c.treatments=p.traitements.join('\n');faits.push('traitements')}
 c.ext={...(c.ext||{})};
 if(p.mesures.poids&&!c.ext.weight){c.ext.weight=String(p.mesures.poids);faits.push('poids')}
 if(p.mesures.taille&&!c.ext.height){c.ext.height=String(p.mesures.taille);faits.push('taille')}
 if(p.mesures.groupeSanguin&&!c.ext.bloodGroup){c.ext.bloodGroup=p.mesures.groupeSanguin;faits.push('groupe sanguin')}
 return {consult:c,faits,note:''};
}
const MODELE_CSV='Nom;Prénom;Date de naissance;Sexe;IPP;Allergies;Antécédents;Traitements;Poids;Taille;Groupe sanguin\nFICTIF;Alice;12/05/1960;F;E-1001;Pénicilline (urticaire);HTA | Diabète de type 2;Bisoprolol 5 mg 1 le matin | Metformine 1000 mg matin et soir;72;165;A+\n';
return {lire,depuisHl7,depuisHprim,depuisFhir,depuisCsv,rapprocher,versConsultation,MODELE_CSV,COLONNES};
});

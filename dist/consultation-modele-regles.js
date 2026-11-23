/* IASELO · consultation pré-anesthésique selon le modèle du Dr Baumgarten.
   Fonctions pures, sans DOM ni réseau (testées dans tests/consultation-modele.test.cjs) :
   - CHAMPS : rubriques et champs du modèle (types, obligatoires, options) ;
   - manquants() : champs obligatoires non renseignés ;
   - depuisSejour() : identité et intervention reprises du séjour ;
   - depuisQuestionnaire() : réponses du questionnaire patient → champs du modèle ;
   - fusionner() : insère sans jamais effacer une saisie (case ajoutée, texte complété, valeur gardée) ;
   - depuisAncienne() / versAncienne() : passage entre l'ancienne trame IASELO et le modèle,
     pour ne perdre aucune donnée et pour que les autres modules (VPA, veille, lettre…) continuent de lire le dossier.
   ASA, avis, technique, consentement et toute décision restent au médecin : le questionnaire n'y touche jamais. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCpa=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CHAMPS=[{"id":"consult","t":"Consultation et patient","f":[{"id":"date_consult","l":"Date de la consultation","ty":"date","req":1},{"id":"mar","l":"Anesthésiste","ty":"text","req":1},{"id":"rpps","l":"N° RPPS","ty":"text"},{"id":"mode_consult","l":"Modalité","ty":"radio","o":["Présentiel","Téléconsultation"]},{"id":"identite","l":"Identité","ty":"text","req":1},{"id":"nom_naiss","l":"Nom de naissance","ty":"text"},{"id":"sexe","l":"Sexe","ty":"radio","req":1,"o":["Femme","Homme"]},{"id":"age","l":"Âge","ty":"comp"},{"id":"statut","l":"Statut","ty":"radio","o":["Majeur","Mineur","Majeur protégé"]},{"id":"representant","l":"Représentant légal","ty":"text"},{"id":"poids","l":"Poids","ty":"number","req":1},{"id":"taille","l":"Taille","ty":"number","req":1},{"id":"imc","l":"IMC","ty":"comp"}]},{"id":"interv","t":"Intervention prévue","f":[{"id":"libelle","l":"Intervention","ty":"text","req":1},{"id":"chirurgien","l":"Opérateur","ty":"text","req":1},{"id":"date_interv","l":"Date prévue","ty":"date","req":1},{"id":"cote","l":"Côté","ty":"radio","o":["Sans objet","Droit","Gauche","Bilatéral"]},{"id":"urgence","l":"Programmée / urgence","ty":"radio","req":1,"o":["Programmée","Urgence"]},{"id":"hospit","l":"Hospitalisation","ty":"radio","req":1,"o":["Ambulatoire","Conventionnelle"]},{"id":"risque_hemo","l":"Risque hémorragique","ty":"radio","req":1,"o":["Faible","Intermédiaire","Élevé"]},{"id":"hdm","l":"Histoire de la maladie","ty":"area"}]},{"id":"allergies","t":"Allergies","f":[{"id":"allergie_statut","l":"Statut allergique","ty":"radio","req":1,"o":["Aucune allergie connue"]},{"id":"allergenes","l":"Agents en cause","ty":"checks","o":["Curares","Latex","Antibiotiques","Chlorhexidine","Produits iodés","AINS / aspirine","Autre"]},{"id":"allergie_detail","l":"Précisions","ty":"area"}]},{"id":"atcd","t":"Antécédents et mode de vie","f":[{"id":"atcd_none","l":"Antécédents médicaux","ty":"checks","o":["Pas d'antécédent médical"]},{"id":"cardio","l":"Cardiovasculaire","ty":"checks","o":["HTA","Coronaropathie","Insuffisance cardiaque","Valvulopathie","Trouble du rythme / FA","Pacemaker","DAI"]},{"id":"mtev","l":"Thrombotique","ty":"checks","o":["TVP","Embolie pulmonaire"]},{"id":"resp","l":"Respiratoire","ty":"checks","o":["Asthme","BPCO","SAOS appareillé","SAOS non appareillé","Infection respiratoire récente"]},{"id":"metab","l":"Endocrino / métabolique","ty":"checks","o":["Diabète de type 1","Diabète de type 2 insulino-traité","Diabète de type 2 non insulino-traité","Dysthyroïdie"]},{"id":"neuro","l":"Autres","ty":"checks","o":["AVC / AIT","Épilepsie","Maladie neurologique","Maladie musculaire / myopathie","Troubles cognitifs","Pathologie psychiatrique"]},{"id":"autres_atcd","l":"Autres","ty":"checks","o":["Insuffisance rénale chronique","Hépatopathie / cirrhose","RGO / hernie hiatale","Trouble de l'hémostase","Anémie","Cancer évolutif","Grossesse en cours"]},{"id":"atcd_detail","l":"Précisions","ty":"area"},{"id":"atcd_chir","l":"Interventions antérieures","ty":"area"},{"id":"compl","l":"Incidents anesthésiques","ty":"checks","o":["Intubation difficile","Ventilation au masque difficile","NVPO","Réaction allergique peropératoire","Réveil ou curarisation prolongés","Hyperthermie maligne"]},{"id":"famille","l":"ATCD familiaux","ty":"checks","o":["Hyperthermie maligne","Déficit en pseudocholinestérase","Myopathie"]},{"id":"tabac","l":"Tabac","ty":"radio","o":["Non-fumeur","Sevré","Fumeur actif"]},{"id":"alcool","l":"Alcool","ty":"radio","o":["Non","Occasionnel","Régulier (> 2 verres/j)"]},{"id":"tabac_pa","l":"Paquets-années","ty":"number"},{"id":"toxiques","l":"Autres substances","ty":"text"},{"id":"autonomie","l":"Dépendance et autonomie","ty":"radio","o":["Autonome","Aide partielle","Dépendant"]}]},{"id":"ttt","t":"Traitements et gestion périopératoire","f":[{"id":"ttt_habituel","l":"Traitement habituel","ty":"area","req":1},{"id":"ttt_consignes","l":"Consignes","ty":"area","req":1}]},{"id":"examen","t":"Examen clinique","f":[{"id":"fc","l":"FC","ty":"number"},{"id":"pa_art","l":"PA","ty":"text"},{"id":"spo2","l":"SpO₂ (AA)","ty":"number"},{"id":"veines","l":"Capital veineux","ty":"radio","o":["Bon","Moyen","Difficile"]},{"id":"auscult_card","l":"Auscultation cardiaque","ty":"area"},{"id":"auscult_pulm","l":"Auscultation pulmonaire","ty":"area"},{"id":"rachis","l":"Rachis (si ALR)","ty":"area"}]},{"id":"vas","t":"Voies aériennes","f":[{"id":"mallampati","l":"Mallampati","ty":"radio","req":1,"o":["I","II","III","IV"]},{"id":"ouverture","l":"Ouverture de bouche","ty":"radio","req":1,"o":["> 35 mm (3 doigts)","< 35 mm"]},{"id":"dtm","l":"Distance thyro-mentonnière","ty":"radio","o":["> 65 mm","< 65 mm"]},{"id":"mobilite","l":"Mobilité cervicale","ty":"radio","o":["Normale","Limitée"]},{"id":"anom_faciales","l":"Anomalies faciales","ty":"checks","o":["Barbe","Rétrognathie","Cicatrice rétractile","Radiothérapie faciale","Macroglossie"]},{"id":"anom_cervicales","l":"Anomalies cervicales","ty":"checks","o":["Cou court","Goitre","Tour de cou élevé (> 45 cm)"]},{"id":"dentition","l":"État dentaire","ty":"checks","o":["Dents saines","Prothèse amovible","Édentation totale"]},{"id":"schema_dentaire","l":"Schéma dentaire","ty":"teeth"},{"id":"sb","l":"STOP-BANG (interrogatoire)","ty":"checks","o":["S — Ronflement fort","T — Fatigue / somnolence diurne","O — Apnées observées"]},{"id":"sb_score","l":"Score STOP-BANG","ty":"comp"},{"id":"vmd_prevue","l":"Ventilation masque difficile prévue","ty":"radio","req":1,"o":["Non","Oui"]},{"id":"id_prevue","l":"Intubation difficile prévue","ty":"radio","req":1,"o":["Non","Oui"]},{"id":"strategie_vas","l":"Stratégie VAS","ty":"area"},{"id":"lentilles","l":"Lentilles de contact","ty":"radio","o":["Non","Oui"]}]},{"id":"risque","t":"Évaluation du risque","f":[{"id":"mets","l":"Capacité fonctionnelle","ty":"radio","req":1,"o":["≥ 4 MET (2 étages sans s'arrêter)","< 4 MET","Non évaluable"]},{"id":"sympt_cv","l":"Signes fonctionnels","ty":"checks","o":["Aucun signe","Douleur thoracique d'effort","Douleur thoracique de repos, récente ou aggravée","Dyspnée d'effort inexpliquée","Dyspnée de repos / orthopnée (NYHA III-IV)","Palpitations","Syncope ou malaise à l'effort","Claudication intermittente"]},{"id":"rcri","l":"Critères de Lee","ty":"checks","o":["Chirurgie à haut risque","Créatininémie > 177 µmol/L"]},{"id":"lee_score","l":"Score de Lee","ty":"comp"},{"id":"apfel","l":"Critères d'Apfel","ty":"checks","o":["Mal des transports","Morphiniques postopératoires"]},{"id":"apfel_score","l":"Score d'Apfel","ty":"comp"},{"id":"ep","l":"Autres facteurs","ty":"checks","o":["Non","Jeûne non respecté","Douleur aiguë / morphiniques récents","Occlusion / sténose digestive","Gastroparésie / achalasie connue"]},{"id":"ep_score","l":"Risque d'estomac plein","ty":"comp"},{"id":"diathese","l":"Diathèse hémorragique","ty":"checks","o":["Diathèse hémorragique négative"]},{"id":"hemstop","l":"Score HEMSTOP","ty":"checks","o":["H — Hématomes > 2 cm sans traumatisme ou importants après un traumatisme mineur","E — Consultation ou traitement pour saignement prolongé ou inhabituel (épistaxis, petites plaies)","M — Ménorragies ayant motivé une consultation ou un traitement (pilule, fer…)","S — Saignement excessif pendant ou après une chirurgie","T — Saignement prolongé après extraction dentaire, ayant nécessité une consultation","O — Saignement prolongé ou excessif après un accouchement","P — Maladie de la coagulation dans la famille (hémophilie, Willebrand…)"]},{"id":"hemstop_score","l":"Résultat","ty":"comp"},{"id":"risque_thrombo","l":"Risque thromboembolique","ty":"radio","o":["Faible","Modéré","Élevé"]}]},{"id":"examens","t":"Examens complémentaires","f":[{"id":"bilan_chir","l":"Bilan de l'intervenant","ty":"radio","o":["Pas de bilan","Bilan non vu","Bilan vu"]},{"id":"bilan_chir_res","l":"Résultat","ty":"radio","o":["Normal","Anormal"]},{"id":"bilan","l":"Examens prescrits par l'anesthésiste, à voir avant l'intervention","ty":"checks","o":["Aucun examen nécessaire","NFS-plaquettes","TP / TCA","Ionogramme, créatininémie (DFG)","Groupe ABO-RhD et RAI","HbA1c / glycémie","bêta-HCG","ECG"]},{"id":"resultats","l":"Résultats et avis","ty":"area"}]},{"id":"strategie","t":"Stratégie anesthésique","f":[{"id":"technique","l":"Technique","ty":"checks","req":1,"o":["Anesthésie générale","Rachianesthésie","Bloc nerveux périphérique","Anesthésie locale et sédation"]},{"id":"technique_detail","l":"Précisions","ty":"area"},{"id":"atb","l":"Antibiotique","ty":"checks","o":["Pas d'antibioprophylaxie","Amoxicilline-acide clavulanique","Amoxicilline","Céfazoline","Céfoxitine","Céfuroxime","Ceftriaxone","Clindamycine","Gentamicine","Métronidazole","Ofloxacine","Vancomycine"]},{"id":"atb_detail","l":"Dose et réinjections","ty":"area"},{"id":"transfusion","l":"Transfusion","ty":"radio","o":["Peu probable","Possible","Probable"]}]},{"id":"consignes","t":"Consignes et consentement","f":[{"id":"jeune","l":"Jeûne","ty":"checks","req":1,"o":["Solides : arrêt 6 h avant l'anesthésie","Liquides clairs autorisés jusqu'à 2 h avant"]},{"id":"autres_consignes","l":"Autres consignes","ty":"checks","o":["Douche préopératoire","Retrait bijoux, piercings, vernis","Arrêt du tabac conseillé","Retrait des lentilles de contact","Prothèse dentaire à signaler"]},{"id":"ambu","l":"Ambulatoire","ty":"checks","o":["Accompagnant pour le retour","Pas de conduite pendant 24 h","Ni alcool ni stupéfiants après l'intervention"]},{"id":"info","l":"Information délivrée","ty":"checks","req":1,"o":["Bénéfices / risques expliqués","Document d'information remis","Risque dentaire","Prise en charge de la douleur","Anesthésie possible par un autre médecin de l'équipe","Information transfusionnelle","Accord parental / accord du tuteur"]},{"id":"consentement","l":"Consentement","ty":"radio","req":1,"o":["Consentement éclairé donné"]}]},{"id":"conclusion","t":"Conclusion","f":[{"id":"asa","l":"Classe ASA","ty":"radio","req":1,"o":["ASA 1","ASA 2","ASA 3","ASA 4","ASA 5"]},{"id":"avis","l":"Avis","ty":"radio","req":1,"o":["Pas de contre-indication à l'intervention","Sous réserve des examens / avis demandés","Intervention à différer"]},{"id":"ordo_sortie","l":"Ordonnance de sortie","ty":"radio","o":["Par l'intervenant","Par l'anesthésiste"]},{"id":"synthese","l":"Synthèse","ty":"area"}]},{"id":"pedia","t":"Pédiatrie","f":[{"id":"ped_vacc","l":"Vaccination à jour","ty":"radio","o":["Oui","Non"]},{"id":"ped_tabac","l":"Tabac passif","ty":"radio","o":["Oui","Non"]},{"id":"ped_premat","l":"Prématurité","ty":"radio","o":["Oui","Non"]},{"id":"ped_marche","l":"Marche acquise","ty":"radio","o":["Oui","Non"]},{"id":"ped_resp","l":"Pathologie respiratoire récente","ty":"radio","o":["Oui","Non"]},{"id":"ped_orl","l":"Report si infection ORL expliqué","ty":"radio","o":["Oui","Non"]},{"id":"ped_coag","l":"Doute sur une coagulopathie","ty":"radio","o":["Oui","Non"]},{"id":"ped_autor","l":"Autorisation parentale","ty":"checks","o":["À vérifier"]}]}];
const TYPES={};for(const s of CHAMPS)for(const f of s.f)TYPES[f.id]={...f,sec:s.id,secT:s.t};
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const list=v=>Array.isArray(v)?v.filter(Boolean):[];
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const fr=s=>iso(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):String(s||'');
const texte=v=>String(v??'').trim();

function vide(v,id){const x=v?.[id];return Array.isArray(x)?x.length===0:!texte(x)}
function sansTraitement(v){const t=texte(v.ttt_habituel);return !t||t==='Pas de traitement'}
function manquants(v){
 v=v||{};
 return Object.values(TYPES).filter(f=>f.req&&f.ty!=='comp').filter(f=>{
  if(f.id==='ttt_consignes'&&sansTraitement(v))return false;
  if(f.id==='allergie_statut'&&list(v.allergenes).length)return false;
  return vide(v,f.id);
 }).map(f=>f.id);
}
function libelle(id){return TYPES[id]?.l||id}

/* Âge à partir du champ « Identité » (NOM Prénom, né(e) le jj/mm/aaaa), comme le modèle. */
function age(v,ref){
 const m=String(v?.identite||'').match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/);if(!m)return null;
 let y=+m[3];if(y<100){const cy=new Date().getFullYear()%100;y+=y>cy?1900:2000}
 const b=new Date(y,+m[2]-1,+m[1]),r=ref?new Date(ref):v?.date_consult?new Date(v.date_consult+'T12:00:00'):new Date();
 let a=r.getFullYear()-b.getFullYear();const d=r.getMonth()-b.getMonth();if(d<0||(d===0&&r.getDate()<b.getDate()))a--;
 return a>=0&&a<130?a:null;
}

/* ---------- Séjour → modèle (identité, intervention) ---------- */
function depuisSejour(stay,opts={}){
 const id=stay?.identity||{},ext=stay?.consult?.ext||{},pub=stay?.surgicalAnnouncement?.published?.fields||{},out={};
 const nom=[texte(id.usedName||id.lastName||id.birthName).toUpperCase(),texte(id.usedFirstName||id.firstName)].filter(Boolean).join(' ');
 if(nom)out.identite=nom+(iso(id.birthDate)?', né(e) le '+fr(id.birthDate):'');
 const nn=texte(id.birthName);if(nn&&norm(nn)!==norm(id.usedName||id.lastName))out.nom_naiss=nn.toUpperCase();
 const sx=texte(id.sex);if(/^(f|femme)$/i.test(sx))out.sexe='Femme';else if(/^(m|h|homme)$/i.test(sx))out.sexe='Homme';
 const lib=texte(pub.procedure||ext.operation);if(lib)out.libelle=lib;
 const ch=texte(pub.surgeon||ext.surgeon);if(ch)out.chirurgien=ch;
 const d=pub.date||ext.surgeryDate;if(iso(d))out.date_interv=d;
 if(stay?.mode==='Ambulatoire')out.hospit='Ambulatoire';else if(stay?.mode==='Hospitalisation')out.hospit='Conventionnelle';
 if(opts.medecin)out.mar=String(opts.medecin).replace(/^(dr|pr)\.?\s+/i,'').trim(); // le modèle ajoute « Dr » sur le PDF
 return out;
}

/* ---------- Questionnaire patient → modèle ---------- */
const MALADIES={
 'Insuffisance cardiaque':['cardio','Insuffisance cardiaque'],
 'Infarctus ou stent':['cardio','Coronaropathie'],
 'Trouble du rythme':['cardio','Trouble du rythme / FA'],
 'Hypertension artérielle':['cardio','HTA'],
 'Reflux ou hernie hiatale':['autres_atcd','RGO / hernie hiatale'],
 'Asthme':['resp','Asthme'],
 'AVC':['neuro','AVC / AIT'],
 'Épilepsie':['neuro','Épilepsie'],
 'Troubles psychiques':['neuro','Pathologie psychiatrique'],
 'Anomalie de la thyroïde':['metab','Dysthyroïdie'],
 'Insuffisance rénale':['autres_atcd','Insuffisance rénale chronique'],
 'Myopathie':['neuro','Maladie musculaire / myopathie'],
 'Myasthénie':['neuro','Maladie neurologique']
};
/* Déclarations sans case équivalente exacte : reprises en texte, le médecin coche après vérification. */
const EN_TEXTE={
 'Phlébite ou embolie pulmonaire':'phlébite ou embolie pulmonaire (TVP / EP à préciser)',
 'Artérite':'artérite',
 'Ulcère gastrique':'ulcère gastrique',
 'Adénome de prostate':'adénome de prostate',
 'Bronchite chronique':'bronchite chronique',
 'Diabète':'diabète (type et traitement à préciser)',
 'Myasthénie':'myasthénie',
 'Porphyrie':'porphyrie'
};
const HEMSTOP=[
 [/famille/i,'P'],[/nez|gencive/i,'E'],[/hematome|hématome/i,'H'],[/dentaire/i,'T'],[/chirurgie/i,'S'],[/gyneco|gynéco/i,'M'],[/accouchement/i,'O']
];
const FAMILLE=/\b(pere|mere|frere|soeur|fils|fille|famille|familial|oncle|tante|cousin|grand)/;
const ALLERGENES=[
 [/curar|rocuro|atracur|cisatra|suxam|succinyl|celocurine/,'Curares'],
 [/latex/,'Latex'],
 [/antibio|penicil|amoxi|augmentin|cef|cepha|cefa|clamoxyl|macrolid|sulfam|quinolon|vancomy|clinda/,'Antibiotiques'],
 [/chlorhex|biseptine/,'Chlorhexidine'],
 [/iode|betadine|contraste/,'Produits iodés'],
 [/ains|aspirin|ibupro|kardegic|anti-?inflam|ketopro|diclofen|naproxen/,'AINS / aspirine']
];
function optionDe(id,debut){return (TYPES[id]?.o||[]).find(o=>o.startsWith(debut))||''}

function traitementsDuQuestionnaire(q,qq){
 const rows=list(q.medRows).length?q.medRows:list(qq?.medRows);
 const out=list(rows).filter(r=>Array.isArray(r)&&texte(r[0])).map(r=>{
  const prises=[['matin',r[2]],['midi',r[3]],['soir',r[4]]].filter(([,x])=>texte(x)).map(([k,x])=>k+' '+texte(x)).join(', ');
  return {name:texte(r[0]),dose:texte(r[1]),frequency:prises};
 });
 if(out.length)return out;
 return String(q.treatments||'').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>({name:l,dose:'',frequency:''}));
}

/* Retourne {valeurs, questions, traitements} : valeurs proposées par champ du modèle. */
function depuisQuestionnaire(qq,opts={}){
 const q=qq?.answers||{},v={},txt={};
 const ajoute=(id,opt)=>{if(!opt)return;(v[id]??=[]);if(!v[id].includes(opt))v[id].push(opt)};
 const note=(id,line)=>{if(texte(line))(txt[id]??=[]).push(texte(line))};
 const w=num(q.weight),h=num(q.height);
 if(w&&w>1&&w<400)v.poids=String(w);
 if(h&&h>30&&h<250)v.taille=String(h);
 if(iso(q.dob)&&!opts.identiteConnue){const nom=[texte(q.usename||q.birthname).toUpperCase(),texte(q.firstname)].filter(Boolean).join(' ');if(nom)v.identite=nom+', né(e) le '+fr(q.dob)}
 if(texte(q.birthname)&&texte(q.usename)&&norm(q.birthname)!==norm(q.usename))v.nom_naiss=texte(q.birthname).toUpperCase();
 if(texte(q.operation))v.libelle=texte(q.operation);
 if(iso(q.date))v.date_interv=q.date;
 // Allergies
 if(q.allergy==='Non')v.allergie_statut='Aucune allergie connue';
 else if(q.allergy==='Oui'){
  const d=norm(q.allergyDetails);let n=0;for(const [re,a] of ALLERGENES)if(re.test(d)){ajoute('allergenes',a);n++}
  if(!n)ajoute('allergenes','Autre');
  note('allergie_detail',q.allergyDetails?q.allergyDetails:'Allergie déclarée sans précision');
 }else if(q.allergy==='Je ne sais pas')note('allergie_detail','Statut allergique incertain selon le patient');
 // Antécédents médicaux
 const mal=list(q.diseases),libres=[];
 for(const m of mal){if(MALADIES[m])ajoute(...MALADIES[m]);if(EN_TEXTE[m])libres.push(EN_TEXTE[m])}
 const dev=list(q.devices);
 if(mal.includes('Apnée du sommeil')){if(dev.some(x=>/Ventilation/.test(x)))ajoute('resp','SAOS appareillé');else libres.push('apnée du sommeil (appareillage non déclaré)')}
 if(dev.some(x=>/Pacemaker/.test(x)))libres.push('pacemaker ou défibrillateur (type, dernier contrôle à préciser)');
 if(dev.includes('Prothèse auditive'))libres.push('prothèse auditive');
 if(libres.length)note('atcd_detail','Déclaré par le patient : '+libres.join(' ; '));
 if(texte(q.other))note('atcd_detail','Autres problèmes de santé (patient) : '+texte(q.other));
 if(q.hospital==='Oui')note('atcd_detail','Hospitalisation hors chirurgie (patient)'+(texte(q.hospitalDetails)?' : '+texte(q.hospitalDetails):''));
 if(texte(q.operations))note('atcd_chir',texte(q.operations));
 // Anesthésies antérieures
 if(q.nausea==='Oui')ajoute('compl','NVPO');
 if(q.travel==='Oui')ajoute('apfel','Mal des transports');
 if(q.anesthesia==='Oui'){
  const d=norm(q.anesthesiaDetails),fam=FAMILLE.test(d);
  if(/hyperthermie|malign/.test(d))ajoute(fam?'famille':'compl','Hyperthermie maligne');
  if(fam&&/cholinest/.test(d))ajoute('famille','Déficit en pseudocholinestérase');
  if(!fam&&/intub/.test(d))ajoute('compl','Intubation difficile');
  if(!fam&&/allerg|choc|anaphyl/.test(d))ajoute('compl','Réaction allergique peropératoire');
  if(!fam&&/reveil|curar/.test(d))ajoute('compl','Réveil ou curarisation prolongés');
  if(!fam&&/nausee|vomi/.test(d))ajoute('compl','NVPO');
  note('atcd_detail','Problème lié à une anesthésie (patient ou famille)'+(texte(q.anesthesiaDetails)?' : '+texte(q.anesthesiaDetails):' : à préciser'));
 }else if(q.anesthesia==='Je ne sais pas')note('atcd_detail','Problème anesthésique personnel ou familial : le patient ne sait pas');
 // Mode de vie
 if(q.tobacco==='Oui')v.tabac='Fumeur actif';else if(q.tobacco==='Non')v.tabac='Non-fumeur';
 const cig=num(q.cigarettes),yrs=num(q.years);if(q.tobacco==='Oui'&&cig&&yrs)v.tabac_pa=String(Math.round(cig/20*yrs*10)/10);
 const alc=num(q.alcohol);if(alc!=null&&alc>=0)v.alcool=alc===0?'Non':alc>2?'Régulier (> 2 verres/j)':'Occasionnel';
 if(q.drugs==='Oui')v.toxiques=texte(q.drugDetails)||'Consommation déclarée, à préciser';
 // Capacité fonctionnelle
 if(['2 étages','3 étages ou plus'].includes(q.stairs))v.mets=optionDe('mets','≥ 4 MET');
 else if(['Aucun','1 étage'].includes(q.stairs))v.mets='< 4 MET';
 // Dents
 if(dev.includes('Prothèse dentaire'))ajoute('dentition','Prothèse amovible');
 // Saignements : questionnaire HEMSTOP
 if(Array.isArray(q.bleeding)){
  const pos=q.bleeding.filter(x=>!/^aucun/i.test(x));
  for(const b of pos){const hit=HEMSTOP.find(([re])=>re.test(b));if(hit)ajoute('hemstop',optionDe('hemstop',hit[1]+' '))}
  if(!pos.length)ajoute('diathese','Diathèse hémorragique négative');
 }
 // Traitements
 const meds=traitementsDuQuestionnaire(q,qq);
 if(meds.length)v.ttt_habituel=meds.map(m=>[m.name,m.dose].filter(Boolean).join(' ')+(m.frequency?' — '+m.frequency:'')).join('\n');
 for(const [id,lines] of Object.entries(txt))v[id]=lines.join('\n');
 const dents=q.teeth==='Oui';
 return {valeurs:v,questions:texte(q.questions),dents,traitements:meds,recu:fr(String(qq?.received||'').slice(0,10))};
}

/* Insère des valeurs proposées sans rien effacer.
   Retourne {valeurs, marques:{id:true|[options ajoutées]}, champs:[ids modifiés]}. */
function fusionner(actuel,propose,opts={}){
 const v={...(actuel||{})},marques={},champs=[];
 const interdits=new Set(['asa','avis','technique','consentement','vmd_prevue','id_prevue','strategie_vas','atb','info','jeune','synthese',...(opts.interdits||[])]);
 for(const [id,x] of Object.entries(propose||{})){
  const f=TYPES[id];if(!f||interdits.has(id)||f.ty==='comp')continue;
  if(f.ty==='checks'){
   const cur=list(v[id]),add=list(x).filter(o=>(f.o||[]).includes(o)&&!cur.includes(o));
   if(!add.length)continue;
   // « Pas d'antécédent médical » ou « Diathèse négative » cochés par le médecin : ne pas contredire, laisser au médecin.
   if(id!=='atcd_none'&&['cardio','mtev','resp','metab','neuro','autres_atcd'].includes(id)&&list(v.atcd_none).length)continue;
   if(id==='diathese'&&list(v.hemstop).length)continue;
   v[id]=[...cur,...add];marques[id]=add;champs.push(id);continue;
  }
  if(f.ty==='radio'&&!(f.o||[]).includes(x))continue;
  const cur=texte(v[id]),val=texte(x);if(!val)continue;
  if(!cur){v[id]=val;marques[id]=true;champs.push(id);continue}
  if(f.ty==='area'){
   if(id==='ttt_habituel'){ // une ligne par médicament : n'ajoute que les médicaments absents
    if(cur==='Pas de traitement')continue;
    const have=new Set(cur.split('\n').map(l=>norm(l.split(' — ')[0]).split(' ')[0]));
    const add=val.split('\n').filter(l=>!have.has(norm(l.split(' — ')[0]).split(' ')[0]));
    if(add.length){v[id]=cur+'\n'+add.join('\n');marques[id]=true;champs.push(id)}
    continue;
   }
   if(norm(cur).includes(norm(val)))continue;
   v[id]=cur+'\n'+val;marques[id]=true;champs.push(id);
  }
 }
 return {valeurs:v,marques,champs};
}

/* ---------- Ancienne trame IASELO ↔ modèle ---------- */
const ASA_ROM={'ASA 1':'I','ASA 2':'II','ASA 3':'III','ASA 4':'IV','ASA 5':'V'};
const ROM_ASA=Object.fromEntries(Object.entries(ASA_ROM).map(([a,b])=>[b,a]));
const TECH={'Anesthésie générale':'Anesthésie générale','Rachianesthésie':'Rachianesthésie','Bloc nerveux périphérique':'ALR périphérique','Anesthésie locale et sédation':'Sédation'};
const AVIS={"Pas de contre-indication à l'intervention":'Prise en charge envisagée selon le plan documenté','Sous réserve des examens / avis demandés':'En attente d’optimisation / bilan / avis','Intervention à différer':'Report proposé à discuter avec l’équipe'};

/* Données de l'ancienne trame reprises dans le modèle (première ouverture). Rien n'est supprimé de l'ancienne trame. */
function depuisAncienne(c){
 const e=c?.ext||{},v={},t=x=>texte(x)&&!['Non renseigné','À vérifier','Non évalué','À déterminer'].includes(texte(x))?texte(x):'';
 const lignes=(...xs)=>xs.map(([k,x])=>t(x)?(k?k+' : ':'')+t(x):'').filter(Boolean).join('\n');
 if(iso(e.consultDate))v.date_consult=e.consultDate;
 if(t(e.author))v.mar=t(e.author);
 if(['Présentiel','Téléconsultation'].includes(e.setting))v.mode_consult=e.setting;
 if(['Femme','Homme'].includes(e.sex))v.sexe=e.sex;
 if(t(e.representative))v.representant=t(e.representative);
 if(num(e.weight))v.poids=String(num(e.weight));
 if(num(e.height))v.taille=String(num(e.height));
 const lib=[t(e.operation)&&e.operation!=='Autre intervention'?e.operation:'',t(e.operationDetails)].filter(Boolean).join(' · ');if(lib)v.libelle=lib;
 if(t(e.surgeon))v.chirurgien=t(e.surgeon);
 if(iso(e.surgeryDate))v.date_interv=e.surgeryDate;
 const cote={'Droit':'Droit','Gauche':'Gauche','Bilatéral':'Bilatéral','Non applicable':'Sans objet','Médian':'Sans objet'}[e.laterality];if(cote)v.cote=cote;
 if(e.urgency==='Programmée')v.urgence='Programmée';else if(e.urgency==='Urgente')v.urgence='Urgence';
 if(e.careSetting==='Ambulatoire')v.hospit='Ambulatoire';else if(/Hospitalisation/.test(e.careSetting||''))v.hospit='Conventionnelle';
 if(ROM_ASA[c?.asa])v.asa=ROM_ASA[c.asa];
 if(/^Aucune allergie/.test(e.allergyReviewed||''))v.allergie_statut='Aucune allergie connue';
 const al=t(c?.allergies);if(al)v.allergie_detail=al;
 const atcd=lignes(['',c?.history],['Cardiovasculaire',e.cardio],['Respiratoire',e.respiratory],['Rénal, hépatique, digestif',e.renal],['Neurologique, endocrinien',e.neuro],['MTEV',e.vteHistory],['Dispositifs',e.devicesHistory],['Transfusions',e.transfusionHistory],['Anesthésies antérieures',e.anesthesiaHistory],['ATCD familiaux anesthésiques',e.familyAnesthesia],['Saignements',e.bleedingHistory]);
 if(atcd)v.atcd_detail=atcd;
 if(t(e.priorOperations))v.atcd_chir=t(e.priorOperations);
 if(e.smokingStatus==='Actif')v.tabac='Fumeur actif';else if(e.smokingStatus==='Sevré')v.tabac='Sevré';else if(e.smokingStatus==='Jamais fumé')v.tabac='Non-fumeur';
 if(num(e.packYears))v.tabac_pa=String(num(e.packYears));
 if(t(c?.treatments))v.ttt_habituel=t(c.treatments);
 const cons=lignes(['',e.medicationInstructions],['Antithrombotiques',e.antithromboticPlan],['Antidiabétiques',e.diabetesPlan],['Autres adaptations',e.otherMedPlan]);if(cons)v.ttt_consignes=cons;
 if(num(e.pulse))v.fc=String(num(e.pulse));
 if(t(e.bp))v.pa_art=t(e.bp);
 if(num(e.spo2))v.spo2=String(num(e.spo2));
 if(t(e.cardioExam))v.auscult_card=t(e.cardioExam);
 if(t(e.respExam))v.auscult_pulm=t(e.respExam);
 if(t(e.regionalExam))v.rachis=t(e.regionalExam);
 if(['I','II','III','IV'].includes(e.mallampati))v.mallampati=e.mallampati;
 if(t(e.airwayStrategy))v.strategie_vas=t(e.airwayStrategy);
 if(e.metsCategory==='≥ 4 MET')v.mets=optionDe('mets','≥ 4 MET');else if(e.metsCategory==='< 4 MET')v.mets='< 4 MET';
 if(['Faible','Intermédiaire','Élevé'].includes(e.surgicalBleedingRisk))v.risque_hemo=e.surgicalBleedingRisk;
 if(['Peu probable','Possible','Probable'].includes(e.transfusionLikelihood))v.transfusion=e.transfusionLikelihood;
 const res=lignes(['ECG',e.ecg],['Avis spécialisé',e.specialist],['Biologie',e.otherLabs],['Groupe / RAI',e.bloodGroup],['En attente',e.pendingTests],['Interprétation',e.testInterpretation]);if(res)v.resultats=res;
 const tech=Object.entries(TECH).find(([,b])=>b===e.technique);if(tech)v.technique=[tech[0]];
 const det=lignes(['',c?.plan],['Monitorage',e.monitoring],['Analgésie',e.painPlan],['NVPO',e.nvpoPlan],['Orientation',e.postopDestination],['Thromboprophylaxie',e.vtePlan]);if(det)v.technique_detail=det;
 if(t(e.atbPlan))v.atb_detail=t(e.atbPlan);
 if(e.patientAgreement==='Accord recueilli')v.consentement='Consentement éclairé donné';
 const avis=Object.entries(AVIS).find(([,b])=>b===e.decision);if(avis)v.avis=avis[0];
 const syn=lignes(['',e.decisionReason],['Points majeurs',e.criticalPoints],['Actions',e.actions],['À la VPA',e.preanestheticVisit]);if(syn)v.synthese=syn;
 return v;
}

/* Valeurs dérivées pour l'ancienne trame : lues par la VPA, la veille, la lettre de liaison, les prescriptions… */
function versAncienne(v,ref){
 v=v||{};const top={},ext={},l=x=>list(x);
 const set=(o,k,x)=>{if(x!=null&&texte(x))o[k]=texte(x)};
 set(ext,'consultDate',v.date_consult);set(ext,'author',v.mar);set(ext,'setting',v.mode_consult);
 set(ext,'operation',v.libelle);set(ext,'surgeon',v.chirurgien);set(ext,'surgeryDate',v.date_interv);
 set(ext,'laterality',{'Sans objet':'Non applicable'}[v.cote]||v.cote);
 set(ext,'urgency',{Urgence:'Urgente',Programmée:'Programmée'}[v.urgence]);
 set(ext,'careSetting',{Ambulatoire:'Ambulatoire',Conventionnelle:'Hospitalisation conventionnelle'}[v.hospit]);
 set(ext,'sex',v.sexe);const a=age(v,ref);if(a!=null)ext.age=String(a);
 set(ext,'weight',v.poids);set(ext,'height',v.taille);set(ext,'representative',v.representant);
 set(top,'asa',ASA_ROM[v.asa]);
 const ag=l(v.allergenes);
 if(ag.length){ext.allergyReviewed='Allergie(s) documentée(s)';top.allergies=ag.join(', ')+(texte(v.allergie_detail)?' — '+texte(v.allergie_detail):'')}
 else if(v.allergie_statut==='Aucune allergie connue'){ext.allergyReviewed='Aucune allergie connue après interrogatoire';top.allergies='Aucune allergie connue'+(texte(v.allergie_detail)?' — '+texte(v.allergie_detail):'')}
 const atcd=[...l(v.cardio),...l(v.mtev),...l(v.resp),...l(v.metab),...l(v.neuro),...l(v.autres_atcd)];
 const hist=[l(v.atcd_none).length?"Pas d'antécédent médical":'',atcd.join(', '),texte(v.atcd_detail)].filter(Boolean).join('\n');if(hist)top.history=hist;
 if(l(v.cardio).length)ext.cardio=l(v.cardio).join(', ');
 if(l(v.resp).length)ext.respiratory=l(v.resp).join(', ');
 const ren=l(v.autres_atcd).filter(x=>/rénale|Hépato|RGO/.test(x));if(ren.length)ext.renal=ren.join(', ');
 const neu=[...l(v.neuro),...l(v.metab)];if(neu.length)ext.neuro=neu.join(', ');
 if(l(v.mtev).length)ext.vteHistory=l(v.mtev).join(', ');
 if(l(v.compl).length)ext.anesthesiaHistory=l(v.compl).join(', ');
 if(l(v.famille).length)ext.familyAnesthesia=l(v.famille).join(', ');
 set(ext,'priorOperations',v.atcd_chir);
 if(l(v.hemstop).length)ext.bleedingHistory='HEMSTOP : '+l(v.hemstop).map(x=>x.slice(0,1)).join(', ');else if(l(v.diathese).length)ext.bleedingHistory=l(v.diathese)[0];
 set(ext,'smokingStatus',{'Fumeur actif':'Actif','Sevré':'Sevré','Non-fumeur':'Jamais fumé'}[v.tabac]);
 set(ext,'packYears',v.tabac_pa);
 const hab=[v.tabac&&'Tabac : '+v.tabac+(v.tabac_pa?' ('+v.tabac_pa+' PA)':''),v.alcool&&'Alcool : '+v.alcool,texte(v.toxiques)&&'Autres : '+texte(v.toxiques)].filter(Boolean).join(' · ');if(hab)ext.habits=hab;
 set(top,'treatments',v.ttt_habituel);set(ext,'medicationInstructions',v.ttt_consignes);
 set(ext,'pulse',v.fc);set(ext,'bp',v.pa_art);set(ext,'spo2',v.spo2);
 set(ext,'cardioExam',v.auscult_card);set(ext,'respExam',v.auscult_pulm);set(ext,'regionalExam',v.rachis);
 set(ext,'mallampati',v.mallampati);
 if(v.vmd_prevue||v.id_prevue)ext.airwayConclusion=(v.vmd_prevue==='Oui'||v.id_prevue==='Oui')?'Difficulté anticipée — stratégie spécifique documentée':'Évaluation réalisée — stratégie standard retenue';
 set(ext,'airwayStrategy',v.strategie_vas);
 if(v.mets)ext.metsCategory=v.mets.startsWith('≥')?'≥ 4 MET':v.mets==='< 4 MET'?'< 4 MET':'Non évaluable';
 set(ext,'surgicalBleedingRisk',v.risque_hemo);set(ext,'transfusionLikelihood',v.transfusion);
 set(ext,'vteRisk',v.risque_thrombo);
 const tech=l(v.technique);if(tech.length)ext.technique=tech.length>1?'Technique combinée':TECH[tech[0]]||tech[0];
 const plan=[tech.join(' + '),texte(v.technique_detail)].filter(Boolean).join('\n');if(plan)top.plan=plan;
 const atb=l(v.atb);if(atb.length){ext.atbStatus=atb.includes("Pas d'antibioprophylaxie")?'Évalué — pas d’action retenue':'Action prévue';const ap=[atb.filter(x=>x!=="Pas d'antibioprophylaxie").join(', '),texte(v.atb_detail)].filter(Boolean).join('\n');if(ap)ext.atbPlan=ap}
 const bil=l(v.bilan).filter(x=>x!=='Aucun examen nécessaire');if(bil.length)ext.pendingTests=bil.join(', ');
 set(ext,'testInterpretation',v.resultats);
 if(l(v.jeune).length)ext.fasting=l(v.jeune).join('\n');
 if(l(v.info).length){ext.infoGiven='Oui';ext.risksDiscussed=l(v.info).join(', ')}
 if(v.consentement==='Consentement éclairé donné')ext.patientAgreement='Accord recueilli';
 set(ext,'decision',AVIS[v.avis]);set(ext,'decisionReason',v.avis);
 set(ext,'criticalPoints',v.synthese);
 if(l(v.ambu).length)ext.ambulatory=l(v.ambu).join(', ');
 return {top,ext};
}

/* Médicaments du champ « Traitement habituel » (une ligne : « Nom dosage — posologie »). */
function lignesTraitement(v){
 const t=texte(v?.ttt_habituel);if(!t||t==='Pas de traitement')return [];
 return t.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf(' — ');return {name:i>0?x.slice(0,i).trim():x,dose:i>0?x.slice(i+3).trim():''}});
}

return {CHAMPS,TYPES,manquants,libelle,age,depuisSejour,depuisQuestionnaire,fusionner,depuisAncienne,versAncienne,lignesTraitement,vide};
});

/* IASELO · contrôle de sécurité du traitement en cours (26/11/2026, demande de Romain).
   Analyse chaque ligne de prescription médicamenteuse du séjour (et le traitement personnel déclaré en consultation)
   et classe les alertes par catégorie et par niveau de gravité :
     4 contre-indication · 3 association déconseillée / risque majeur · 2 précaution d'emploi · 1 à prendre en compte · 0 information.
   Catégories : interactions médicamenteuses, incompatibilités physico-chimiques, posologies, mises en garde (terrain,
   allergies), surveillances, produits dopants, conduite automobile, informations obligatoires manquantes, autres (doublons…).

   Base de règles IASELO : sélection de molécules courantes en périopératoire, niveaux inspirés du thésaurus des
   interactions médicamenteuses de l'ANSM, des RCP (BDPM) et de la liste des interdictions de l'AMA.
   Ce n'est PAS une base de données médicamenteuse agréée HAS (Vidal, BCB, Thériaque…) : les règles sont à faire relire
   par le pharmacien et l'équipe médicale, et le contrôle ne dispense pas de la lecture du RCP.
   Fonctions pures, partagées navigateur / tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloSecuriteTraitement=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';

const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[µμ]/g,'u').replace(/œ/g,'oe').replace(/[^a-z0-9.,%/+]+/g,' ').replace(/\s+/g,' ').trim();
const hasWord=(texte,mot)=>(' '+texte+' ').includes(' '+mot+' ');

const NIVEAUX=[
 {n:4,court:'4',label:'Contre-indication'},
 {n:3,court:'3',label:'Association déconseillée ou risque majeur'},
 {n:2,court:'2',label:'Précaution d’emploi'},
 {n:1,court:'1',label:'À prendre en compte'},
 {n:0,court:'i',label:'Information'}
];
const COLONNES=[
 {id:'interactions',label:'Interactions',aide:'Interactions médicamenteuses entre les lignes du traitement en cours (thésaurus ANSM).'},
 {id:'physico',label:'Physico-chimie',aide:'Incompatibilités physico-chimiques entre médicaments injectables (même voie veineuse, même poche ou seringue).'},
 {id:'posologie',label:'Posologies',aide:'Dose par prise, dose journalière (toutes lignes de la même molécule cumulées), intervalle minimal, durée maximale.'},
 {id:'misesEnGarde',label:'Mises en garde',aide:'Allergies, âge, poids, fonction rénale et hépatique, antécédents, mises en garde du RCP.'},
 {id:'surveillance',label:'Surveillances',aide:'Surveillances clinique ou biologique recommandées.'},
 {id:'dopant',label:'Produits dopants',aide:'Substances de la liste des interdictions de l’Agence mondiale antidopage.'},
 {id:'conduite',label:'Conduite',aide:'Pictogramme « médicaments et conduite » (niveaux 1, 2, 3 de l’arrêté du 8 août 2008).'},
 {id:'manquant',label:'Informations manquantes',aide:'Dose, voie, rythme ou durée absents ou illisibles dans la ligne de prescription.'},
 {id:'autres',label:'Autres',aide:'Doublons de molécule, « si besoin » sans critère, spécialité non commercialisée…'}
];

/* ---------------- Molécules ----------------
   a : noms reconnus (DCI, sels, spécialités), normalisés ; c : classes ; p : posologie adulte
   (prise / jour en mg sauf u:'UI' ; iv : intervalle minimal en heures ; jMax : durée maximale en jours) ;
   ir : seuils de DFG (mL/min) ; age ; mg : mises en garde du RCP ; s : surveillances ; d : dopant ; cond : pictogramme conduite. */
const M=[];
const mol=(id,nom,a,c,o={})=>M.push({id,nom,a:[id.replace(/-/g,' '),...a].map(norm),c,...o});
const OPIO_SURV=['Fréquence respiratoire et score de sédation avant chaque administration (arrêt si FR < 10/min ou sédation ≥ 2).','Douleur (EN/EVA), nausées, rétention urinaire, transit (constipation).','Naloxone disponible dans le service.'];
const OPIO_MG=[[1,'Dépression respiratoire dose-dépendante, majorée par les autres dépresseurs du système nerveux central.'],[0,'Constipation, nausées, rétention urinaire, prurit.']];
const OPIO_AGE=[{min:75,n:2,t:'Sujet de 75 ans ou plus : débuter à dose réduite et espacer les prises (sensibilité accrue, risque de confusion et de chute).'}];

mol('paracetamol','Paracétamol',['acetaminophene','doliprane','dafalgan','efferalgan','perfalgan','paracet'],['antalgique-palier1'],{
 p:{prise:1000,jour:4000,iv:4,ivIR:6,dfgIR:30,poidsMin:50,mgKgPrise:15,mgKgJour:60},
 ih:{n:3,t:'Insuffisance hépatique, alcoolisme chronique ou dénutrition : ne pas dépasser 3 g/j (60 mg/kg/j), contre-indiqué en cas d’insuffisance hépatocellulaire sévère.'},
 mg:[[0,'Vérifier l’absence d’autre médicament contenant du paracétamol (associations, automédication).']],
 s:['Bilan hépatique en cas de traitement prolongé à dose maximale ou de terrain à risque.']});
mol('morphine','Morphine',['morphine chlorhydrate','sulfate de morphine','skenan','actiskenan','oramorph','sevredol','moscontin'],['morphinique-agoniste','depresseur-snc','opioide'],{
 p:{priseSC:20,priseIV:10},ir:[{dfg:30,n:3,t:'DFG < 30 mL/min : accumulation des métabolites actifs (M6G), risque de surdosage retardé ; préférer l’oxycodone ou réduire nettement les doses.'},{dfg:60,n:2,t:'DFG < 60 mL/min : réduire la dose ou espacer les prises.'}],
 age:OPIO_AGE,mg:OPIO_MG,s:OPIO_SURV,d:'S7 Narcotiques (interdit en compétition).',cond:2});
mol('oxycodone','Oxycodone',['oxynorm','oxycontin','oxsynia','targinact'],['morphinique-agoniste','depresseur-snc','opioide','substrat-3a4'],{
 ir:[{dfg:30,n:2,t:'DFG < 30 mL/min : débuter à dose réduite (moitié) et titrer.'}],ih:{n:3,t:'Insuffisance hépatique : réduire la dose initiale, contre-indiquée si sévère.'},
 age:OPIO_AGE,mg:OPIO_MG,s:OPIO_SURV,d:'S7 Narcotiques (interdit en compétition).',cond:2});
mol('hydromorphone','Hydromorphone',['sophidone'],['morphinique-agoniste','depresseur-snc','opioide'],{age:OPIO_AGE,mg:OPIO_MG,s:OPIO_SURV,d:'S7 Narcotiques (interdit en compétition).',cond:2});
mol('fentanyl','Fentanyl',['durogesic','abstral','instanyl','actiq'],['morphinique-agoniste','depresseur-snc','opioide','substrat-3a4'],{age:OPIO_AGE,mg:OPIO_MG,s:OPIO_SURV,d:'S7 Narcotiques (interdit en compétition).',cond:2});
mol('sufentanil','Sufentanil',['dzuveo','zalviso'],['morphinique-agoniste','depresseur-snc','opioide'],{mg:OPIO_MG,s:OPIO_SURV,d:'S7 Narcotiques (interdit en compétition).',cond:3});
mol('tramadol','Tramadol',['topalgic','contramal','zamudol','ixprim','zaldiar','monoalgic'],['morphinique-agoniste','depresseur-snc','opioide','serotoninergique','abaisse-seuil'],{
 p:{prise:100,jour:400,iv:4,jourAge:{min:75,jour:300},jourIR:{dfg:30,jour:200,iv:12}},
 mg:[[2,'Abaisse le seuil épileptogène ; risque de syndrome sérotoninergique ; hypoglycémies rapportées.'],[1,'Métabolisme variable (CYP2D6) : métaboliseurs ultra-rapides exposés à une toxicité.']],
 age:OPIO_AGE,s:['Vigilance, fréquence respiratoire, nausées ; glycémie chez le diabétique.'],d:'S7 Narcotiques (interdit en compétition depuis 2024).',cond:2});
mol('codeine','Codéine',['codoliprane','dafalgan codeine','klipal','prontalgine'],['morphinique-agoniste','depresseur-snc','opioide'],{
 mg:[[2,'Métaboliseurs ultra-rapides (CYP2D6) : risque de dépression respiratoire ; contre-indiquée chez l’enfant de moins de 12 ans et en cas d’allaitement.']],age:OPIO_AGE,s:OPIO_SURV.slice(0,2),cond:2});
mol('nalbuphine','Nalbuphine',[],['morphinique-agoantago','depresseur-snc'],{p:{prise:20,iv:3},mg:[[1,'Effet plafond analgésique ; antagonise partiellement les morphiniques agonistes purs.']],s:['Fréquence respiratoire, sédation.'],cond:2});
mol('buprenorphine','Buprénorphine',['subutex','temgesic','orobupre'],['morphinique-agoantago','depresseur-snc'],{mg:[[1,'Agoniste partiel : diminue l’effet des morphiniques agonistes purs ; dépression respiratoire peu réversible par la naloxone.']],s:OPIO_SURV.slice(0,1),d:null,cond:2});
mol('nefopam','Néfopam',['acupan'],['antalgique-central','anticholinergique'],{
 p:{prise:20,jour:120,iv:4},age:[{min:75,n:2,t:'Sujet âgé : effets atropiniques (confusion, rétention urinaire, tachycardie) ; réduire la posologie.'}],
 mg:[[2,'Effets atropiniques : rétention urinaire, glaucome à angle fermé (contre-indications), tachycardie.'],[1,'Perfusion lente (au moins 15 minutes) : sueurs, nausées, malaise si injection rapide.']],
 ci:[{re:/epilep|convuls/,n:4,t:'Antécédent de convulsions ou d’épilepsie : néfopam contre-indiqué (abaisse le seuil épileptogène).'},{re:/glaucome/,n:4,t:'Glaucome à angle fermé : néfopam contre-indiqué.'},{re:/adenome|prostat|retention urinaire/,n:3,t:'Troubles urétro-prostatiques : risque de rétention urinaire.'}],
 s:['Fréquence cardiaque, diurèse (globe vésical).'],cond:2});
const AINS_IR=[{dfg:30,n:4,t:'DFG < 30 mL/min : AINS contre-indiqué (insuffisance rénale sévère).'},{dfg:60,n:2,t:'DFG < 60 mL/min : risque d’insuffisance rénale aiguë ; durée la plus courte, hydratation, contrôle de la créatinine.'}];
const AINS_MG=[[2,'Risque d’ulcère et d’hémorragie digestive ; prudence en cas d’antécédent ulcéreux, d’asthme induit par l’aspirine, d’insuffisance cardiaque.'],[1,'Contre-indiqué à partir du début du 6e mois de grossesse.']];
const AINS_CI=[{re:/ulcere evolutif|hemorragie digestive/,n:4,t:'Ulcère évolutif ou antécédent d’hémorragie digestive : AINS contre-indiqué.'},{re:/insuffisance cardiaque severe/,n:4,t:'Insuffisance cardiaque sévère : AINS contre-indiqué.'}];
const AINS_AGE=[{min:75,n:2,t:'Sujet de 75 ans ou plus : risque rénal et digestif majoré ; dose minimale, durée la plus courte, protection gastrique à discuter.'}];
mol('ketoprofene','Kétoprofène',['profenid','bi profenid','ketum'],['ains','hyperkaliemiant','nephrotoxique'],{p:{prise:100,jour:300,iv:8,jMax:5},ir:AINS_IR,age:AINS_AGE,mg:AINS_MG,ci:AINS_CI,ih:{n:4,t:'Insuffisance hépatique sévère : AINS contre-indiqué.'},s:['Créatinine et diurèse (surtout si âge élevé, déshydratation, IEC/ARA2, diurétiques).','Signes de saignement digestif.']});
mol('ibuprofene','Ibuprofène',['advil','nurofen','brufen','antarene','spedifen'],['ains','hyperkaliemiant','nephrotoxique'],{p:{prise:800,jour:2400,iv:6},ir:AINS_IR,age:AINS_AGE,mg:AINS_MG,ci:AINS_CI,ih:{n:4,t:'Insuffisance hépatique sévère : AINS contre-indiqué.'},s:['Créatinine et diurèse.']});
mol('diclofenac','Diclofénac',['voltarene','flector'],['ains','hyperkaliemiant','nephrotoxique'],{p:{prise:75,jour:150},ir:AINS_IR,age:AINS_AGE,mg:[...AINS_MG,[2,'Risque cardiovasculaire thrombotique : contre-indiqué en cas de cardiopathie ischémique ou d’AOMI avérée.']],ci:AINS_CI,s:['Créatinine et diurèse.']});
mol('ketorolac','Kétorolac',['acular'],['ains','hyperkaliemiant','nephrotoxique'],{p:{jour:90,jMax:2},ir:AINS_IR,age:AINS_AGE,mg:AINS_MG,ci:AINS_CI,s:['Créatinine et diurèse.']});
mol('naproxene','Naproxène',['apranax','naprosyne'],['ains','hyperkaliemiant','nephrotoxique'],{p:{jour:1100},ir:AINS_IR,age:AINS_AGE,mg:AINS_MG,ci:AINS_CI});
mol('celecoxib','Célécoxib',['celebrex'],['ains','coxib','nephrotoxique'],{p:{jour:400},ir:AINS_IR,age:AINS_AGE,mg:[[2,'Contre-indiqué en cas de cardiopathie ischémique, d’AVC ou d’insuffisance cardiaque (NYHA II-IV).']]});
mol('parecoxib','Parécoxib',['dynastat'],['ains','coxib','nephrotoxique'],{p:{prise:40,jour:80,jMax:3},ir:AINS_IR,age:[{min:65,n:2,t:'65 ans ou plus et moins de 50 kg : 20 mg par injection, 40 mg/j au maximum.'}],mg:[[3,'Contre-indiqué après pontage aortocoronarien et en cas de cardiopathie ischémique.']]});
mol('aspirine','Acide acétylsalicylique',['acide acetylsalicylique','kardegic','aspegic','aspirine protect','resitune','duoplavin'],['antiagregant','salicyle'],{mg:[[1,'Risque hémorragique per et postopératoire : vérifier la conduite à tenir décidée en consultation (poursuite habituelle en prévention secondaire).']],s:['Signes de saignement.']});
mol('clopidogrel','Clopidogrel',['plavix','duoplavin'],['antiagregant'],{mg:[[1,'Risque hémorragique : arrêt 5 jours avant une chirurgie à risque hémorragique, selon la consultation.']]});
mol('ticagrelor','Ticagrélor',['brilique'],['antiagregant','substrat-3a4'],{mg:[[1,'Risque hémorragique : arrêt 5 jours avant une chirurgie à risque hémorragique, selon la consultation.']]});
const HBPM_MG=[[1,'Héparine : risque de thrombopénie induite (TIH) ; contre-indiquée en cas d’antécédent de TIH.']];
mol('enoxaparine','Énoxaparine',['lovenox','inhixa','enoxaparine sodique'],['anticoagulant','heparine','hyperkaliemiant'],{
 hbpm:{prevUI:4000,prevUIIR:2000,dfgCI:15},ir:[{dfg:15,n:4,t:'DFG < 15 mL/min : énoxaparine non recommandée ; préférer l’héparine non fractionnée.'}],
 mg:HBPM_MG,ci:[{re:/thrombopenie induite|\btih\b/,n:4,t:'Antécédent de thrombopénie induite par l’héparine : héparines contre-indiquées.'}],
 s:['Numération plaquettaire (contexte chirurgical) : avant traitement puis 2 fois par semaine pendant 1 mois.','Anti-Xa si insuffisance rénale, poids extrême ou dose curative prolongée.']});
mol('tinzaparine','Tinzaparine',['innohep'],['anticoagulant','heparine','hyperkaliemiant'],{ir:[{dfg:20,n:3,t:'DFG < 20 mL/min : prudence, surveillance de l’activité anti-Xa.'}],mg:HBPM_MG,s:['Numération plaquettaire (contexte chirurgical).']});
mol('heparine','Héparine non fractionnée',['heparine sodique','heparine calcique','calciparine'],['anticoagulant','heparine','hyperkaliemiant'],{mg:HBPM_MG,ci:[{re:/thrombopenie induite|\btih\b/,n:4,t:'Antécédent de thrombopénie induite par l’héparine : héparines contre-indiquées.'}],s:['TCA ou anti-Xa selon le protocole, numération plaquettaire 2 fois par semaine.']});
mol('fondaparinux','Fondaparinux',['arixtra'],['anticoagulant'],{ir:[{dfg:20,n:4,t:'DFG < 20 mL/min : fondaparinux contre-indiqué.'},{dfg:50,n:2,t:'DFG 20-50 mL/min : 1,5 mg par jour en prévention.'}]});
mol('apixaban','Apixaban',['eliquis'],['anticoagulant','aod'],{ir:[{dfg:15,n:4,t:'DFG < 15 mL/min : apixaban non recommandé.'}],mg:[[1,'Anticoagulant oral direct : vérifier le délai d’arrêt avant l’intervention et la reprise prévue.']]});
mol('rivaroxaban','Rivaroxaban',['xarelto'],['anticoagulant','aod'],{ir:[{dfg:15,n:4,t:'DFG < 15 mL/min : rivaroxaban non recommandé.'}],mg:[[1,'Anticoagulant oral direct : vérifier le délai d’arrêt avant l’intervention et la reprise prévue.']]});
mol('dabigatran','Dabigatran',['pradaxa'],['anticoagulant','aod'],{ir:[{dfg:30,n:4,t:'DFG < 30 mL/min : dabigatran contre-indiqué.'}]});
mol('warfarine','Warfarine',['coumadine'],['anticoagulant','avk'],{s:['INR.']});
mol('fluindione','Fluindione',['previscan'],['anticoagulant','avk'],{s:['INR.']});
mol('acenocoumarol','Acénocoumarol',['sintrom','minisintrom'],['anticoagulant','avk'],{s:['INR.']});
mol('ondansetron','Ondansétron',['zophren','setofilm'],['setron','torsadogene'],{
 p:{prise:16,priseIV:16,priseAge:{min:75,prise:8}},ih:{n:2,t:'Insuffisance hépatique modérée à sévère : ne pas dépasser 8 mg par jour.',jour:8},
 mg:[[2,'Allongement de l’intervalle QT dose-dépendant : prudence si QT long, hypokaliémie, hypomagnésémie, bradycardie.'],[0,'Constipation, céphalées.']],
 s:['ECG si facteurs de risque d’allongement du QT ; kaliémie et magnésémie.'],cond:0});
mol('granisetron','Granisétron',['kytril'],['setron'],{mg:[[1,'Allongement de l’intervalle QT possible.']]});
mol('dexamethasone','Dexaméthasone',['dexamethasone phosphate','dectancyl','neofordex','dexamethasone mylan','dexamethasone panpharma','dexamethasone via'],['corticoide','hypokaliemiant'],{
 mg:[[2,'Hyperglycémie, y compris à dose unique antiémétique : prudence chez le diabétique.'],[1,'Infection évolutive non contrôlée : à évaluer avant corticothérapie.'],[0,'Troubles du sommeil, agitation, prurit périnéal lors d’une injection rapide (injecter lentement).']],
 ci:[{re:/diabet/,n:2,t:'Patient diabétique : glycémies capillaires rapprochées pendant 24 à 48 h, adapter l’insuline.'}],
 s:['Glycémie capillaire chez le diabétique, kaliémie si traitement prolongé, tension artérielle.'],d:'S9 Glucocorticoïdes (voies injectable, orale, rectale : interdit en compétition).'});
mol('methylprednisolone','Méthylprednisolone',['solumedrol','medrol','depo medrol'],['corticoide','hypokaliemiant'],{mg:[[2,'Hyperglycémie, rétention hydrosodée, troubles psychiques.']],s:['Glycémie, kaliémie, tension artérielle.'],d:'S9 Glucocorticoïdes (interdit en compétition par voie générale).'});
mol('prednisolone','Prednisolone',['solupred'],['corticoide','hypokaliemiant'],{mg:[[2,'Hyperglycémie, rétention hydrosodée ; supplémentation périopératoire si corticothérapie au long cours.']],s:['Glycémie, kaliémie.'],d:'S9 Glucocorticoïdes (interdit en compétition par voie générale).'});
mol('prednisone','Prednisone',['cortancyl'],['corticoide','hypokaliemiant'],{mg:[[2,'Corticothérapie au long cours : risque d’insuffisance surrénalienne périopératoire, supplémentation à discuter.']],s:['Glycémie, kaliémie.'],d:'S9 Glucocorticoïdes (interdit en compétition par voie générale).'});
mol('hydrocortisone','Hydrocortisone',['hydrocortisone upjohn','hemisuccinate d hydrocortisone'],['corticoide','hypokaliemiant'],{s:['Glycémie, kaliémie, tension artérielle.'],d:'S9 Glucocorticoïdes (interdit en compétition par voie générale).'});
mol('betamethasone','Bétaméthasone',['celestene','diprostene'],['corticoide','hypokaliemiant'],{d:'S9 Glucocorticoïdes (interdit en compétition par voie générale).'});
mol('metoclopramide','Métoclopramide',['primperan','prokinyl'],['antidopaminergique'],{
 p:{prise:10,jour:30,iv:6,jMax:5,mgKgJour:0.5},ir:[{dfg:15,n:2,t:'DFG < 15 mL/min : réduire la dose journalière de 75 %.'},{dfg:60,n:2,t:'DFG 15-60 mL/min : réduire la dose journalière de 50 %.'}],
 age:[{min:75,n:2,t:'Sujet âgé : risque majoré de dyskinésies tardives ; dose et durée minimales.'}],
 mg:[[2,'Troubles extrapyramidaux, dyskinésies tardives ; durée maximale 5 jours.'],[1,'Injection intraveineuse lente (3 minutes au moins).']],
 ci:[{re:/parkinson/,n:4,t:'Maladie de Parkinson : métoclopramide contre-indiqué.'},{re:/epilep|convuls/,n:3,t:'Épilepsie : augmentation possible de la fréquence des crises.'},{re:/pheochromocytome/,n:4,t:'Phéochromocytome : contre-indiqué.'}],
 s:['Mouvements anormaux (dystonie, akathisie).'],cond:2});
mol('droperidol','Dropéridol',['droleptan'],['antidopaminergique','neuroleptique','torsadogene','depresseur-snc'],{p:{prise:1.25,jour:2.5},mg:[[2,'Allongement du QT : contre-indiqué si QT long connu, hypokaliémie, hypomagnésémie, bradycardie < 55/min.']],ci:[{re:/parkinson/,n:4,t:'Maladie de Parkinson : dropéridol contre-indiqué.'}],s:['ECG si facteurs de risque d’allongement du QT.'],cond:3});
mol('haloperidol','Halopéridol',['haldol'],['antidopaminergique','neuroleptique','torsadogene','depresseur-snc'],{ci:[{re:/parkinson/,n:4,t:'Maladie de Parkinson : halopéridol contre-indiqué.'}],s:['ECG.'],cond:3});
mol('domperidone','Dompéridone',['motilium','peridys'],['torsadogene'],{p:{prise:10,jour:30,jMax:7},mg:[[2,'Risque d’allongement du QT et de mort subite : dose minimale, durée maximale 7 jours.']]});
mol('hydroxyzine','Hydroxyzine',['atarax'],['depresseur-snc','torsadogene','anticholinergique'],{p:{jour:100,jourAge:{min:65,jour:50}},age:[{min:65,n:2,t:'Sujet âgé : effets anticholinergiques et sédatifs, 50 mg/j au maximum ; à éviter si possible.'}],mg:[[2,'Allongement du QT.']],cond:2});
mol('midazolam','Midazolam',['hypnovel','buccolam'],['bzd','depresseur-snc','substrat-3a4'],{age:[{min:60,n:2,t:'Plus de 60 ans : réduire les doses et titrer (sensibilité accrue, dépression respiratoire).'}],mg:[[2,'Dépression respiratoire, surtout associé aux morphiniques.']],s:['Fréquence respiratoire, SpO2, sédation.'],cond:3});
mol('diazepam','Diazépam',['valium'],['bzd','depresseur-snc'],{age:[{min:65,n:2,t:'Sujet âgé : benzodiazépine à demi-vie longue, risque de chute et de confusion.'}],cond:2});
mol('lorazepam','Lorazépam',['temesta'],['bzd','depresseur-snc'],{age:[{min:75,n:1,t:'Sujet âgé : demi-dose, risque de chute.'}],cond:2});
mol('alprazolam','Alprazolam',['xanax'],['bzd','depresseur-snc'],{age:[{min:75,n:1,t:'Sujet âgé : demi-dose, risque de chute.'}],cond:2});
mol('oxazepam','Oxazépam',['seresta'],['bzd','depresseur-snc'],{cond:2});
mol('bromazepam','Bromazépam',['lexomil'],['bzd','depresseur-snc'],{cond:2});
mol('zolpidem','Zolpidem',['stilnox'],['bzd','depresseur-snc'],{age:[{min:65,n:1,t:'Sujet âgé : 5 mg au coucher, risque de chute.'}],cond:3});
mol('zopiclone','Zopiclone',['imovane'],['bzd','depresseur-snc'],{cond:3});
mol('gabapentine','Gabapentine',['neurontin'],['gabapentinoide','depresseur-snc'],{p:{jour:3600},ir:[{dfg:30,n:2,t:'DFG < 30 mL/min : adapter la posologie (RCP).'},{dfg:80,n:1,t:'DFG < 80 mL/min : adapter la posologie (RCP).'}],cond:2});
mol('pregabaline','Prégabaline',['lyrica'],['gabapentinoide','depresseur-snc'],{p:{jour:600},ir:[{dfg:30,n:2,t:'DFG < 30 mL/min : 25 à 150 mg/j.'},{dfg:60,n:1,t:'DFG 30-60 mL/min : 75 à 300 mg/j.'}],mg:[[1,'Risque d’abus et de dépression respiratoire associé aux morphiniques.']],cond:2});
mol('ketamine','Kétamine',['ketalar'],['depresseur-snc'],{mg:[[1,'Effets psychodysleptiques, hypertension, tachycardie.']],s:['Tension artérielle, état de conscience.'],cond:3});
mol('amoxicilline','Amoxicilline',['clamoxyl','amoxicilline sodique','amox'],['penicilline','betalactamine'],{p:{prise:2000,jour:12000},ir:[{dfg:30,n:2,t:'DFG < 30 mL/min : espacer les prises (toutes les 12 h, ou 24 h si DFG < 10).'}],mg:[[1,'Éruption cutanée fréquente en cas de mononucléose infectieuse ou de traitement par allopurinol.']]});
mol('amoxicilline-clavulanique','Amoxicilline + acide clavulanique',['acide clavulanique','augmentin','amox ac clav','amoxicilline acide clavulanique','amox ac.clav','ciblor'],['penicilline','betalactamine'],{
 p:{prise:2000,jour:6000,clavPrise:200,clavJour:1200},ir:[{dfg:30,n:3,t:'DFG < 30 mL/min : 1 g puis 500 mg toutes les 12 h (DFG 10-30) ; la forme 2 g/200 mg n’est pas adaptée.'}],
 ih:{n:2,t:'Insuffisance hépatique : surveillance du bilan hépatique (hépatites cholestatiques liées à l’acide clavulanique).'},
 mg:[[1,'Hépatotoxicité (acide clavulanique), surtout après 10 jours de traitement ou chez le sujet âgé.'],[1,'Éruption cutanée en cas de mononucléose ou d’allopurinol.']],
 s:['Bilan hépatique si traitement de plus de 10 jours.'],
 glucose:'Instable en solution glucosée : reconstituer et diluer dans du NaCl 0,9 % ou de l’eau pour préparations injectables.'});
mol('cefazoline','Céfazoline',['cefacidal'],['cephalosporine','betalactamine'],{p:{prise:3000,jour:12000},ir:[{dfg:35,n:2,t:'DFG < 35 mL/min : espacer les prises (RCP).'}]});
mol('ceftriaxone','Ceftriaxone',['rocephine'],['cephalosporine','betalactamine'],{p:{prise:4000,jour:4000},mg:[[1,'Ne pas mélanger ni administrer en Y avec des solutés contenant du calcium.']]});
mol('cefuroxime','Céfuroxime',['zinnat','zinacef'],['cephalosporine','betalactamine'],{p:{prise:1500,jour:6000}});
mol('piperacilline-tazobactam','Pipéracilline + tazobactam',['tazocilline','piperacilline'],['penicilline','betalactamine'],{p:{prise:4000,jour:16000},ir:[{dfg:40,n:2,t:'DFG < 40 mL/min : 4 g toutes les 8 h au maximum.'}]});
mol('clindamycine','Clindamycine',['dalacine'],['lincosamide'],{p:{prise:900,jour:2700},mg:[[1,'Diarrhée à Clostridioides difficile.']]});
mol('vancomycine','Vancomycine',[],['glycopeptide','nephrotoxique'],{mg:[[2,'Perfusion d’au moins 60 minutes (syndrome de l’homme rouge) ; néphrotoxicité et ototoxicité.']],s:['Concentrations (résiduelle ou à l’équilibre), créatinine.']});
mol('gentamicine','Gentamicine',['gentalline'],['aminoside','nephrotoxique'],{mg:[[2,'Néphrotoxicité et ototoxicité : dose unique journalière, durée courte.']],ir:[{dfg:60,n:2,t:'DFG < 60 mL/min : espacer les injections selon les concentrations résiduelles.'}],s:['Concentration au pic et résiduelle, créatinine.']});
mol('amikacine','Amikacine',[],['aminoside','nephrotoxique'],{mg:[[2,'Néphrotoxicité et ototoxicité.']],s:['Concentration au pic et résiduelle, créatinine.']});
mol('metronidazole','Métronidazole',['flagyl'],['nitroimidazole'],{p:{prise:1000,jour:1500},mg:[[1,'Effet antabuse avec l’alcool ; neuropathie si traitement prolongé.']],cond:1});
mol('levofloxacine','Lévofloxacine',['tavanic'],['fluoroquinolone','torsadogene'],{mg:[[2,'Tendinopathies (surtout après 60 ans et sous corticoïdes), allongement du QT, troubles neuropsychiques.']],cond:1});
mol('ciprofloxacine','Ciprofloxacine',['ciflox'],['fluoroquinolone'],{mg:[[2,'Tendinopathies, troubles neuropsychiques, anévrisme aortique.']],cond:1});
mol('ofloxacine','Ofloxacine',['oflocet'],['fluoroquinolone'],{mg:[[2,'Tendinopathies, troubles neuropsychiques.']],cond:1});
mol('clarithromycine','Clarithromycine',['zeclar'],['macrolide','inhibiteur-3a4','torsadogene']);
mol('erythromycine','Érythromycine',['erythrocine'],['macrolide','inhibiteur-3a4','torsadogene']);
mol('fluconazole','Fluconazole',['triflucan'],['azole','inhibiteur-3a4','torsadogene']);
mol('itraconazole','Itraconazole',['sporanox'],['azole','inhibiteur-3a4']);
mol('linezolide','Linézolide',['zyvoxid'],['imao'],{s:['Numération formule sanguine chaque semaine.']});
mol('cotrimoxazole','Sulfaméthoxazole + triméthoprime',['bactrim','sulfamethoxazole','trimethoprime'],['hyperkaliemiant'],{s:['Kaliémie, NFS.']});
mol('acide-tranexamique','Acide tranexamique',['exacyl','spotof','tranexamique'],['antifibrinolytique'],{p:{prise:1000,jour:4000},ir:[{dfg:30,n:2,t:'DFG < 30 mL/min : réduire la dose (RCP).'}],ci:[{re:/epilep|convuls/,n:3,t:'Antécédent de convulsions : risque de crise, éviter les fortes doses.'},{re:/embolie pulmonaire|thrombose|phlebite|tvp/,n:2,t:'Antécédent thromboembolique : évaluer le rapport bénéfice/risque.'}]});
mol('omeprazole','Oméprazole',['mopral','inexium'],['ipp'],{});
mol('esomeprazole','Ésoméprazole',['inexium'],['ipp'],{});
mol('pantoprazole','Pantoprazole',['eupantol','inipomp'],['ipp'],{});
mol('lansoprazole','Lansoprazole',['lanzor','ogast'],['ipp'],{});
mol('furosemide','Furosémide',['lasilix'],['diuretique','diuretique-anse','hypokaliemiant'],{s:['Kaliémie, natrémie, créatinine, diurèse, poids.'],d:'S5 Diurétiques (interdit en permanence).'});
mol('hydrochlorothiazide','Hydrochlorothiazide',['esidrex','cotareg','coaprovel','fortzaar','hct'],['diuretique','hypokaliemiant'],{s:['Kaliémie, natrémie.'],d:'S5 Diurétiques (interdit en permanence).'});
mol('indapamide','Indapamide',['fludex','preterax','bipreterax'],['diuretique','hypokaliemiant','torsadogene-faible'],{s:['Kaliémie, natrémie.'],d:'S5 Diurétiques (interdit en permanence).'});
mol('spironolactone','Spironolactone',['aldactone','aldactazine'],['diuretique','epargneur-k','hyperkaliemiant'],{s:['Kaliémie, créatinine.'],d:'S5 Diurétiques (interdit en permanence).'});
mol('eplerenone','Éplérénone',['inspra'],['epargneur-k','hyperkaliemiant'],{s:['Kaliémie, créatinine.']});
for(const [id,nom,a] of [['ramipril','Ramipril',['triatec']],['perindopril','Périndopril',['coversyl','preterax','bipreterax']],['enalapril','Énalapril',['renitec']],['lisinopril','Lisinopril',['zestril']],['captopril','Captopril',['lopril']],['losartan','Losartan',['cozaar','fortzaar']],['valsartan','Valsartan',['tareg','cotareg','entresto']],['irbesartan','Irbésartan',['aprovel','coaprovel']],['candesartan','Candésartan',['atacand','kenzen']],['olmesartan','Olmésartan',['alteis','olmetec']],['telmisartan','Telmisartan',['micardis','pritor']]])
 mol(id,nom,a,['iec-ara2','hyperkaliemiant'],{mg:[[1,'Hypotension à l’induction : conduite à tenir (arrêt la veille ou poursuite) selon la consultation.']],s:['Tension artérielle, kaliémie, créatinine.']});
for(const [id,nom,a] of [['bisoprolol','Bisoprolol',['cardensiel','detensiel','concor']],['atenolol','Aténolol',['tenormine']],['metoprolol','Métoprolol',['lopressor','seloken']],['nebivolol','Nébivolol',['temerit','nebilox']],['propranolol','Propranolol',['avlocardyl']]])
 mol(id,nom,a,['betabloquant'],{mg:[[1,'Ne pas interrompre brutalement en périopératoire (rebond ischémique).']],s:['Fréquence cardiaque, tension artérielle.'],d:'P1 Bêtabloquants (interdits dans certains sports).'});
mol('sotalol','Sotalol',['sotalex'],['betabloquant','torsadogene'],{s:['ECG (QT), kaliémie.'],d:'P1 Bêtabloquants (interdits dans certains sports).'});
mol('amiodarone','Amiodarone',['cordarone'],['torsadogene','inhibiteur-3a4'],{s:['ECG, TSH, bilan hépatique.']});
mol('citalopram','Citalopram',['seropram'],['isrs','serotoninergique','torsadogene'],{age:[{min:65,n:1,t:'Plus de 65 ans : 20 mg/j au maximum (QT).'}]});
mol('escitalopram','Escitalopram',['seroplex'],['isrs','serotoninergique','torsadogene']);
mol('sertraline','Sertraline',['zoloft'],['isrs','serotoninergique']);
mol('fluoxetine','Fluoxétine',['prozac'],['isrs','serotoninergique']);
mol('paroxetine','Paroxétine',['deroxat','divarius'],['isrs','serotoninergique']);
mol('venlafaxine','Venlafaxine',['effexor'],['isrs','serotoninergique']);
mol('duloxetine','Duloxétine',['cymbalta'],['isrs','serotoninergique']);
mol('lithium','Lithium',['teralithe'],['lithium'],{s:['Lithémie, créatinine, natrémie.']});
mol('lamotrigine','Lamotrigine',['lamictal'],['antiepileptique'],{mg:[[2,'Réactions cutanées graves (syndrome de Lyell, DRESS) surtout en début de traitement ou en association au valproate : arrêt à la moindre éruption.'],[1,'Ne pas interrompre brutalement (risque de crise) : poursuivre en périopératoire.']],s:['Éruption cutanée, fièvre.'],cond:2});
mol('valproate','Valproate de sodium',['acide valproique','depakine','depakote','depamide','micropakine'],['antiepileptique','inhibiteur-enzymatique'],{mg:[[2,'Tératogène : programme de prévention des grossesses.'],[1,'Thrombopénie et troubles de l’hémostase possibles : plaquettes avant une chirurgie hémorragique.']],s:['Plaquettes, bilan hépatique.'],cond:2});
mol('levetiracetam','Lévétiracétam',['keppra'],['antiepileptique'],{ir:[{dfg:50,n:2,t:'DFG < 50 mL/min : adapter la posologie.'}],mg:[[1,'Ne pas interrompre brutalement en périopératoire.']],cond:2});
mol('carbamazepine','Carbamazépine',['tegretol'],['antiepileptique','inducteur'],{s:['Natrémie, NFS, bilan hépatique.'],cond:2});
mol('phenytoine','Phénytoïne',['dihydan','dilantin'],['antiepileptique','inducteur'],{s:['Concentrations plasmatiques.'],glucose:'Précipite en solution glucosée : diluer uniquement dans du NaCl 0,9 %.',cond:2});
mol('phenobarbital','Phénobarbital',['gardenal'],['antiepileptique','inducteur','depresseur-snc'],{cond:3});
mol('rifampicine','Rifampicine',['rifadine','rimactan'],['inducteur'],{});
mol('levodopa','Lévodopa',['modopar','sinemet','stalevo'],['dopaminergique'],{mg:[[2,'Ne pas interrompre en périopératoire (syndrome malin) : reprise dès que possible, sonde si besoin.']]});
for(const [id,nom,a] of [['ropinirole','Ropinirole',['requip']],['pramipexole','Pramipexole',['sifrol']],['rotigotine','Rotigotine',['neupro']]])mol(id,nom,a,['dopaminergique'],{cond:2});
mol('apomorphine','Apomorphine',['apokinon'],['dopaminergique'],{});
mol('metformine','Metformine',['glucophage','stagid','janumet','velmetia','eucreas'],['metformine','antidiabetique'],{ir:[{dfg:30,n:4,t:'DFG < 30 mL/min : metformine contre-indiquée (acidose lactique).'},{dfg:45,n:2,t:'DFG 30-45 mL/min : dose maximale 1 g/j.'}],mg:[[2,'Arrêt le jour d’une chirurgie avec jeûne ou d’une injection de produit de contraste iodé ; reprise après contrôle de la fonction rénale.']],s:['Glycémie capillaire, créatinine.']});
mol('insuline','Insuline',['insuline glargine','insuline lispro','insuline asparte','lantus','novorapid','humalog','abasaglar','toujeo','levemir','tresiba','actrapid','umuline','fiasp'],['insuline','antidiabetique'],{mg:[[2,'Hypoglycémie : adapter les doses au jeûne et aux apports.']],s:['Glycémie capillaire avant chaque repas et au coucher.'],d:'S4 Insulines (interdites en permanence).'});
mol('potassium','Chlorure de potassium',['chlorure de potassium','kcl','diffu k','kaleorid'],['potassium','hyperkaliemiant'],{mg:[[3,'Voie intraveineuse : toujours dilué, jamais en injection directe, débit maximal 1 g/h (sauf protocole de réanimation).']],s:['Kaliémie, ECG si débit élevé.']});
mol('calcium','Calcium injectable',['gluconate de calcium','chlorure de calcium','ringer lactate','lactate de ringer','ringer'],['calcium'],{});
mol('bicarbonate','Bicarbonate de sodium',['bicarbonate de sodium'],['bicarbonate'],{});
mol('sugammadex','Sugammadex',['bridion'],['sugammadex'],{mg:[[1,'Interaction avec la contraception hormonale (équivaut à l’oubli d’une prise) : informer la patiente.']]});
mol('contraceptif','Contraception hormonale',['ethinylestradiol','levonorgestrel','desogestrel','etonogestrel','norgestimate','drospirenone','dienogest','optimizette','leeloo','minidril','jasmine','nexplanon'],['contraceptif-hormonal'],{mg:[[1,'Estroprogestatif : risque thromboembolique veineux, à intégrer dans la thromboprophylaxie.']]});
mol('methotrexate','Méthotrexate',['novatrex','metoject','imeth'],['methotrexate'],{s:['NFS, créatinine, bilan hépatique.']});
mol('allopurinol','Allopurinol',['zyloric'],['allopurinol'],{});
mol('atorvastatine','Atorvastatine',['tahor'],['statine','substrat-3a4'],{});
mol('simvastatine','Simvastatine',['zocor','inegy'],['statine','substrat-3a4'],{});
mol('ephedrine','Éphédrine',[],['sympathomimetique'],{d:'S6 Stimulants (interdit en compétition au-delà du seuil urinaire).'});
mol('salbutamol','Salbutamol',['ventoline','airomir'],['beta2'],{d:'S3 Bêta-2 agonistes : autorisé par inhalation dans la limite des doses du code mondial antidopage.'});
mol('naloxone','Naloxone',['narcan','nalscue','prenoxad'],['antagoniste-morphinique'],{});

const BY_ID=Object.fromEntries(M.map(m=>[m.id,m]));
// Index des noms : les plus longs d'abord (« amoxicilline acide clavulanique » avant « amoxicilline »).
// Spécialités associant plusieurs molécules.
const ASSOC={codoliprane:['paracetamol','codeine'],'dafalgan codeine':['paracetamol','codeine'],klipal:['paracetamol','codeine'],prontalgine:['paracetamol','codeine'],ixprim:['paracetamol','tramadol'],zaldiar:['paracetamol','tramadol'],duoplavin:['aspirine','clopidogrel'],preterax:['perindopril','indapamide'],bipreterax:['perindopril','indapamide'],cotareg:['valsartan','hydrochlorothiazide'],coaprovel:['irbesartan','hydrochlorothiazide'],fortzaar:['losartan','hydrochlorothiazide'],aldactazine:['spironolactone','hydrochlorothiazide'],targinact:['oxycodone','naloxone'],inegy:['simvastatine']};
const INDEX=[...new Map([...M.flatMap(m=>m.a.map(a=>[a,[m.id]])),...Object.entries(ASSOC).map(([a,ids])=>[norm(a),ids])]).entries()].sort((x,y)=>y[0].length-x[0].length);

/* Reconnaissance des molécules dans un libellé (et ses substances BDPM éventuelles). */
function molecules(libelle,substances=[]){
 let t=' '+norm([libelle,...(substances||[])].join(' ')).replace(/[.,/+]/g,' ').replace(/\s+/g,' ')+' ';
 const ids=[];
 for(const [a,liste] of INDEX){
  const k=' '+a.replace(/[.,/+]/g,' ').replace(/\s+/g,' ')+' ';
  if(t.includes(k)){for(const id of liste)if(!ids.includes(id))ids.push(id);t=t.split(k).join(' # ')}
 }
 // Amoxicilline + acide clavulanique : une seule entrée combinée.
 if(ids.includes('amoxicilline-clavulanique'))return ids.filter(i=>i!=='amoxicilline');
 return ids;
}

/* ---------------- Lecture de la ligne : dose, voie, rythme, durée ---------------- */
const UNITES={g:1000,gr:1000,gramme:1000,grammes:1000,mg:1,milligramme:1,milligrammes:1,ug:0.001,mcg:0.001,microgramme:0.001,microgrammes:0.001,gamma:0.001,ui:'UI',u:'UI',unites:'UI',unite:'UI'};
const nombre=s=>Number(String(s).replace(',','.'));
function lireDose(t){
 // « 1 g », « 1000 mg », « 4 000 UI », « 0,625 mg », « 40 mg/j » ; on ignore les concentrations « 10 mg/ml ».
 const re=/(\d+(?:[.,]\d+)?(?: \d{3})?) ?(g|gr|grammes?|mg|milligrammes?|ug|mcg|microgrammes?|gamma|ui|unites?|u)(?![a-z])(?: ?\/ ?(ml|h|kg|j|jour|24 ?h))?/g;
 let m;
 while((m=re.exec(t))){
  const per=m[3]||'';if(per==='ml')continue;
  const unite=UNITES[m[2]];const v=nombre(m[1].replace(' ',''));if(!Number.isFinite(v))continue;
  if(unite==='UI')return {valeur:v,unite:'UI',par:per,texte:m[0]};
  return {valeur:v*unite,unite:'mg',par:per,texte:m[0]};
 }
 return null;
}
const VOIES=[
 ['IV',/\b(ivd|ivl|ivse|iv|intraveineuse|intra veineuse|intraveineux|perfusion|perf|seringue electrique|pse|en ivl|bolus)\b/],
 ['SC',/\b(sc|sous cutanee|sous cutane|souscutanee)\b/],
 ['IM',/\b(im|intramusculaire|intra musculaire)\b/],
 ['PO',/\b(po|per os|orale|voie orale|bouche|cp|comprime|comprimes|gelule|gelules|sachet|sachets|buvable|lyoc|orodispersible|sirop|gouttes)\b/],
 ['SL',/\b(sublinguale|sublingual|sl)\b/],
 ['Transdermique',/\b(transdermique|patch|dispositif transdermique)\b/],
 ['Rectale',/\b(rectale|suppositoire|intrarectale)\b/],
 ['Inhalée',/\b(inhalation|inhalee|aerosol|nebulisation)\b/],
 ['Périmédullaire',/\b(peridurale|intrathecale|rachianesthesie|perinerveux|perinerveuse|kt perinerveux)\b/],
 ['Locale',/\b(cutanee|application locale|collyre|ophtalmique|nasale|pommade|creme)\b/]
];
function lireVoie(t){for(const [v,re] of VOIES)if(re.test(t))return v;return ''}
function lireRythme(t){
 if(/\b(continu|ivse|pse|seringue electrique|pca)\b/.test(t))return {continu:true,parJour:null,texte:'en continu'};
 if(/\b(dose unique|une seule fois|en une fois|1 seule fois|une fois|injection unique|prise unique)\b/.test(t)&&!/par jour|\/ ?j/.test(t))return {parJour:1,unique:true,texte:'dose unique'};
 let m=t.match(/toutes les (\d+(?:[.,]\d+)?) ?(h|heures?)\b/)||t.match(/\/ ?(\d+) ?h\b/)||t.match(/\bq(\d+)h\b/);
 if(m){const h=nombre(m[1]);if(h>0)return {parJour:24/h,intervalleH:h,texte:'toutes les '+h+' h'}}
 m=t.match(/(\d+) ?(?:fois|x|prises?|injections?) ?(?:par|\/) ?(?:jour|j|24 ?h)\b/)||t.match(/\bx ?(\d+) ?\/ ?(?:j|jour|24 ?h)\b/);
 if(m)return {parJour:nombre(m[1]),intervalleH:24/nombre(m[1]),texte:m[1]+' fois par jour'};
 const heures=[...t.matchAll(/\b(\d{1,2}) ?h(?:eures?)?(?: ?(\d{2}))?\b/g)].map(x=>Number(x[1])).filter(h=>h<24);
 if(/\ba\b|\bheures? de\b/.test(t)&&heures.length>=2){const hs=[...new Set(heures)].sort((a,b)=>a-b),ec=hs.slice(1).map((h,i)=>h-hs[i]);return {parJour:hs.length,intervalleH:Math.min(...ec,24-hs[hs.length-1]+hs[0]),texte:hs.map(h=>h+' h').join(', ')}}
 if(/matin,? midi et soir|matin midi soir|3 fois/.test(t))return {parJour:3,intervalleH:4,texte:'matin, midi et soir'};
 if(/matin et soir|2 fois/.test(t))return {parJour:2,intervalleH:8,texte:'matin et soir'};
 if(/\b(par jour|\/ ?j|\/ ?24 ?h|1 fois|le matin|le soir|au coucher|le midi|chaque jour|quotidien(ne)?)\b/.test(t))return {parJour:1,intervalleH:24,texte:'une fois par jour'};
 return null;
}
function lireDuree(t){
 let m=t.match(/pendant (\d+) ?(j|jours?|h|heures?|semaines?)\b/)||t.match(/\b(\d+) ?(jours?|semaines?)\b/);
 if(m){const n=nombre(m[1]),u=m[2];return {jours:/^h/.test(u)?n/24:/^s/.test(u)?n*7:n,texte:m[0]}}
 if(/jusqu ?a (la )?sortie|jusqu ?au|jusqu ?a nouvel|au long cours|traitement habituel|en cours|reevaluation|a reevaluer|\bj\d+\b|dose unique|une fois|ponctuel/.test(t))return {jours:null,texte:'précisée'};
 return null;
}
function lireMax(t){
 const m=t.match(/(?:max(?:imum)?|sans depasser|ne pas depasser) ?:? ?(\d+(?:[.,]\d+)?) ?(g|mg|ug|ui)? ?(?:par|\/) ?(?:jour|j|24 ?h)/);
 if(m&&m[2]){const u=UNITES[m[2]];return {jour:u==='UI'?nombre(m[1]):nombre(m[1])*u}}
 const n=t.match(/(?:max(?:imum)?|sans depasser) ?:? ?(\d+) ?(?:fois|prises?|injections?|doses?)? ?(?:par|\/) ?(?:jour|j|24 ?h)/);
 if(n)return {prises:nombre(n[1])};
 return null;
}
function lireLigne(l){
 const brut=[l?.name,l?.instructions,l?.dose,l?.route].filter(Boolean).join(' · ');
 const t=norm(brut),ins=norm([l?.instructions,l?.dose,l?.route].filter(Boolean).join(' '));
 // La dose est lue dans les consignes ; à défaut, « 1 comprimé » × le dosage du libellé.
 let dose=lireDose(ins);
 if(!dose){const n=ins.match(/(\d+(?:[.,]\d+)?) ?(cp|comprimes?|gelules?|sachets?|ampoules?|flacons?|poches?)\b/),force=lireDose(norm(l?.name||''));if(n&&force)dose={...force,valeur:force.valeur*nombre(n[1]),texte:n[0]}}
 const rythme=lireRythme(ins.replace(/\b(max(imum)?|sans depasser|ne pas depasser)\b[^,;]*/g,' '));
 const siBesoin=/\b(si besoin|si necessaire|si douleur|si nausee|si nausees|si en|si eva|en cas de)\b/.test(ins);
 return {texte:brut,dose,voie:lireVoie(t),rythme,duree:lireDuree(ins),siBesoin,max:lireMax(ins),glucose:/\b(glucose|glucosee?|g5|g10|g 5 %|g5 %)\b/.test(ins)};
}

/* ---------------- Terrain du patient ---------------- */
function ageDe(naissance,ref){const b=new Date(naissance);if(!naissance||!Number.isFinite(b.getTime()))return null;const r=ref?new Date(ref):new Date();let a=r.getFullYear()-b.getFullYear();if(r<new Date(r.getFullYear(),b.getMonth(),b.getDate()))a--;return a}
function terrain(stay,ref){
 const c=stay?.consult||{},e=c.ext||{},id=stay?.identity||{};
 const num=x=>{const v=nombre(String(x??'').replace(/[^\d.,]/g,''));return Number.isFinite(v)&&v>0?v:null};
 const age=num(e.age)??ageDe(id.birthDate,ref);
 const poids=num(e.weight);const sexe=/^f/i.test(String(e.sex||id.sex||''))?'F':/^m|^h/i.test(String(e.sex||id.sex||''))?'M':'';
 let dfg=num(e.egfr),dfgSource=dfg?'DFG du dossier':'';
 const creat=num(e.creatinine);
 if(!dfg&&creat&&age&&poids){// Cockcroft-Gault, créatinine en µmol/L
  dfg=Math.round((140-age)*poids*(sexe==='F'?1.04:1.23)/creat);dfgSource='Cockcroft-Gault ('+creat+' µmol/L)'}
 const atcd=norm([c.history,e.renal,e.neuro,e.cardio,e.respiratory,e.vteHistory,e.anesthesiaHistory].filter(Boolean).join(' '));
 const ir=dfg?dfg<60:/insuffisance renale|\bir\b|dialys/.test(atcd);
 if(!dfg&&/dialys/.test(atcd)){dfg=10;dfgSource='dialyse déclarée'}
 const ih=/insuffisance hepatique|cirrhose|hepatopathie|hepato/.test(atcd)||/alcool.*(quotidien|chronique|excessi)/.test(norm(e.habits||''));
 return {age,poids,sexe,dfg,dfgSource,ir,ih,atcd,allergies:String(c.allergies??''),ambulatoire:/ambu/i.test(String(stay?.mode||''))};
}

/* Traitement personnel déclaré en consultation : une ligne par médicament. */
function traitementPersonnel(stay){
 const t=String(stay?.consult?.treatments??'').trim();
 if(!t||/^(aucun|pas de traitement|neant|non)/i.test(norm(t)))return [];
 return t.split(/\n|;/).map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.search(/ — | - | : /);return {name:i>0?x.slice(0,i).trim():x,instructions:i>0?x.slice(i+3).trim():'',category:'Médicament',personnel:true}});
}

/* ---------------- Interactions ---------------- */
// [classe ou id A, classe ou id B, niveau, texte, conduite à tenir]
const INTERACTIONS=[
 ['morphinique-agoniste','morphinique-agoantago',3,'Diminution de l’effet antalgique par blocage compétitif des récepteurs, risque de syndrome de sevrage.','Ne pas associer : choisir un seul type de morphinique.'],
 ['morphinique-agoniste','morphinique-agoniste',1,'Risque majoré de dépression respiratoire, pouvant être fatale en cas de surdosage.','Vérifier que l’association est voulue (fond + interdoses) et la surveillance respiratoire.'],
 ['opioide','bzd',1,'Risque majoré de dépression respiratoire, pouvant être fatale en cas de surdosage.','Surveillance de la fréquence respiratoire et de la sédation.'],
 ['opioide','gabapentinoide',2,'Dépression respiratoire et sédation majorées (gabapentinoïdes + morphiniques).','Doses minimales, surveillance respiratoire.'],
 ['depresseur-snc','depresseur-snc',1,'Majoration de la dépression centrale : altération de la vigilance.','Surveiller la sédation ; prudence chez le sujet âgé.'],
 ['ains','ains',3,'Majoration du risque ulcérogène et hémorragique digestif.','Ne pas associer deux anti-inflammatoires non stéroïdiens.'],
 ['ains','avk',3,'Augmentation du risque hémorragique de l’anticoagulant oral (agression de la muqueuse gastroduodénale).','Éviter ; sinon surveillance clinique et INR rapprochés.'],
 ['ains','heparine',2,'Augmentation du risque hémorragique (association déconseillée aux doses curatives d’héparine et chez le sujet âgé).','Surveillance clinique ; doses préventives : à prendre en compte.'],
 ['ains','aod',2,'Augmentation du risque hémorragique.','Éviter l’association ; surveillance clinique.'],
 ['ains','antiagregant',1,'Augmentation du risque hémorragique, notamment gastro-intestinal.','Surveillance clinique.'],
 ['ains','iec-ara2',2,'Insuffisance rénale aiguë chez le patient à risque (âgé, déshydraté, diurétiques) ; réduction de l’effet antihypertenseur.','Hydrater, surveiller la fonction rénale en début de traitement.'],
 ['ains','diuretique',2,'Insuffisance rénale aiguë chez le patient déshydraté ; réduction de l’effet diurétique.','Hydrater, surveiller la fonction rénale.'],
 ['ains','corticoide',1,'Augmentation du risque d’ulcération et d’hémorragie gastro-intestinale.','Protection gastrique à discuter.'],
 ['ains','isrs',1,'Majoration du risque hémorragique.','Surveillance clinique.'],
 ['ains','lithium',3,'Augmentation de la lithémie pouvant atteindre des valeurs toxiques.','Éviter ; sinon lithémie rapprochée.'],
 ['ains','methotrexate',3,'Augmentation de la toxicité hématologique du méthotrexate.','Éviter ; contre-indiqué aux doses de méthotrexate supérieures à 20 mg par semaine.'],
 ['ains','nephrotoxique-autre',1,'Addition des effets néphrotoxiques.','Surveiller la fonction rénale.'],
 ['anticoagulant','anticoagulant',3,'Association de deux anticoagulants : risque hémorragique majeur.','Vérifier qu’il s’agit d’un relais organisé (chevauchement prévu) et non d’un doublon.'],
 ['anticoagulant','antiagregant',1,'Augmentation du risque hémorragique.','Surveillance clinique ; indication de l’association à confirmer.'],
 ['antiagregant','antiagregant',1,'Double antiagrégation : risque hémorragique majoré.','Vérifier l’indication (stent récent).'],
 ['clopidogrel','omeprazole',3,'Diminution de l’effet antiagrégant du clopidogrel (inhibition du CYP2C19).','Préférer le pantoprazole.'],
 ['clopidogrel','esomeprazole',3,'Diminution de l’effet antiagrégant du clopidogrel (inhibition du CYP2C19).','Préférer le pantoprazole.'],
 ['torsadogene','torsadogene',3,'Risque majoré de troubles du rythme ventriculaire, notamment de torsades de pointes.','ECG, kaliémie et magnésémie ; éviter si QT long ou bradycardie.'],
 ['torsadogene','hypokaliemiant',2,'L’hypokaliémie favorise les torsades de pointes.','Corriger la kaliémie, surveillance ECG.'],
 ['tramadol','isrs',1,'Risque de syndrome sérotoninergique et de convulsions.','Surveiller agitation, tremblements, hyperthermie.'],
 ['serotoninergique','imao',3,'Risque de syndrome sérotoninergique.','Éviter l’association ; surveillance rapprochée si indispensable.'],
 ['metoclopramide','dopaminergique',4,'Antagonisme réciproque entre le métoclopramide et les agonistes dopaminergiques.','Contre-indiqué : préférer l’ondansétron ou la dompéridone.'],
 ['neuroleptique','dopaminergique',3,'Antagonisme réciproque entre le neuroleptique et les agonistes dopaminergiques ; aggravation du syndrome parkinsonien.','Éviter ; préférer l’ondansétron.'],
 ['setron','apomorphine',4,'Hypotension sévère et perte de connaissance.','Contre-indiqué.'],
 ['corticoide','inducteur',2,'Diminution des concentrations et de l’efficacité du corticoïde par l’inducteur enzymatique.','Adapter la dose du corticoïde.'],
 ['corticoide','hypokaliemiant-non-corticoide',2,'Risque majoré d’hypokaliémie.','Surveiller et corriger la kaliémie.'],
 ['corticoide','antidiabetique',1,'Élévation de la glycémie (tolérance au glucose diminuée).','Glycémies capillaires, adapter le traitement du diabète.'],
 ['corticoide','fluoroquinolone',1,'Majoration du risque de tendinopathie, voire de rupture tendineuse.','Surveillance, surtout après 60 ans.'],
 ['lamotrigine','valproate',2,'Risque majoré de réactions cutanées graves (syndrome de Lyell) ; les concentrations de lamotrigine sont doublées.','Adapter la posologie de la lamotrigine, surveillance cutanée.'],
 ['lamotrigine','inducteur',2,'Diminution des concentrations et de l’efficacité de la lamotrigine.','Adapter la posologie.'],
 ['potassium','epargneur-k',3,'Hyperkaliémie potentiellement létale, surtout chez l’insuffisant rénal.','Éviter, sauf hypokaliémie documentée ; kaliémie rapprochée.'],
 ['potassium','iec-ara2',2,'Hyperkaliémie potentiellement létale.','Kaliémie rapprochée.'],
 ['iec-ara2','epargneur-k',2,'Hyperkaliémie, surtout chez l’insuffisant rénal.','Kaliémie et créatinine.'],
 ['hyperkaliemiant','hyperkaliemiant',1,'Addition d’effets hyperkaliémiants.','Surveiller la kaliémie, surtout en cas d’insuffisance rénale.'],
 ['aminoside','aminoside',3,'Addition de la néphrotoxicité et de l’ototoxicité.','Ne pas associer deux aminosides.'],
 ['aminoside','glycopeptide',1,'Addition des effets néphrotoxiques.','Concentrations plasmatiques et créatinine.'],
 ['aminoside','diuretique-anse',2,'Augmentation des risques néphrotoxiques et ototoxiques de l’aminoside.','Hydrater, surveiller la fonction rénale et auditive.'],
 ['substrat-3a4','inhibiteur-3a4',2,'Augmentation des concentrations (sédation prolongée, dépression respiratoire pour le midazolam et les morphiniques ; rhabdomyolyse pour les statines).','Réduire les doses, surveillance clinique.'],
 ['sugammadex','contraceptif-hormonal',1,'Diminution de l’efficacité contraceptive : une injection de sugammadex équivaut à l’oubli d’une prise.','Informer la patiente : méthode complémentaire pendant 7 jours.'],
 ['paracetamol','avk',2,'Augmentation de l’effet de l’AVK pour des doses de paracétamol de 4 g/j pendant au moins 4 jours.','Contrôle de l’INR.'],
 ['lithium','iec-ara2',3,'Augmentation de la lithémie.','Éviter ; sinon lithémie rapprochée.'],
 ['lithium','diuretique',3,'Augmentation de la lithémie.','Éviter ; sinon lithémie rapprochée.'],
 ['methotrexate','penicilline',3,'Augmentation de la toxicité du méthotrexate (diminution de son élimination rénale).','Éviter ; surveillance hématologique.'],
 ['allopurinol','amoxicilline',1,'Risque accru de réactions cutanées.','Information du patient.'],
 ['allopurinol','amoxicilline-clavulanique',1,'Risque accru de réactions cutanées.','Information du patient.'],
 ['abaisse-seuil','antiepileptique',2,'Le tramadol abaisse le seuil épileptogène chez un patient traité pour épilepsie.','Préférer un autre antalgique ; surveillance.']
];
// Incompatibilités physico-chimiques entre injectables (même voie, même poche ou même seringue).
const PHYSICO=[
 ['ceftriaxone','calcium',3,'Précipitation ceftriaxone-calcium.','Ne jamais mélanger ni administrer en Y ; rincer la ligne entre les deux, voies séparées si possible.'],
 ['ondansetron','furosemide',2,'Incompatibilité en Y rapportée (précipité).','Voies séparées ou rinçage de la ligne entre les deux.'],
 ['ondansetron','amoxicilline',2,'Incompatibilité en Y rapportée avec les aminopénicillines (pH alcalin).','Voies séparées ou rinçage de la ligne.'],
 ['ondansetron','amoxicilline-clavulanique',2,'Incompatibilité en Y rapportée avec les aminopénicillines (pH alcalin).','Voies séparées ou rinçage de la ligne.'],
 ['ondansetron','piperacilline-tazobactam',2,'Incompatibilité en Y rapportée.','Voies séparées ou rinçage de la ligne.'],
 ['ondansetron','bicarbonate',2,'Précipitation en milieu alcalin.','Voies séparées.'],
 ['midazolam','furosemide',2,'Précipitation (pH alcalin du furosémide).','Voies séparées ou rinçage de la ligne.'],
 ['aminoside','heparine',2,'Incompatibilité dans la même seringue ou tubulure.','Ne pas mélanger ; rincer la ligne.'],
 ['aminoside','betalactamine',2,'Inactivation de l’aminoside par la bêtalactamine si elles sont mélangées.','Ne pas mélanger dans la même poche ou seringue ; administrer séparément.'],
 ['bicarbonate','calcium',3,'Précipitation de carbonate de calcium.','Voies séparées.'],
 ['phenytoine','*',2,'La phénytoïne injectable précipite avec la plupart des médicaments et des solutés glucosés.','Voie dédiée, rinçage au NaCl 0,9 % avant et après.']
];
const aClasse=(m,k)=>m.id===k||m.c.includes(k)||(k==='hypokaliemiant-non-corticoide'&&m.c.includes('hypokaliemiant')&&!m.c.includes('corticoide'))||(k==='nephrotoxique-autre'&&m.c.includes('nephrotoxique')&&!m.c.includes('ains'))||k==='*';

/* ---------------- Analyse ---------------- */
const NOMS_COL=Object.fromEntries(COLONNES.map(c=>[c.id,c.label]));
function analyser(lignes,opts={}){
 const t=opts.terrain||{},allergies=opts.allergies,ref=opts.reference;
 const items=(lignes||[]).map((l,i)=>{
  const ids=molecules(l?.name||'',l?.substances||[]);
  const lect=lireLigne(l);
  return {index:i,ligne:l,ids,mols:ids.map(id=>BY_ID[id]),lecture:lect,alertes:[],securisee:ids.length>0,
   raison:ids.length?'':(l?.category&&l.category!=='Médicament'?'Ligne non médicamenteuse ('+l.category+')':'Médicament non reconnu par la base de règles IASELO')};
 });
 const add=(it,col,n,titre,texte,extra={})=>{if(it.alertes.some(a=>a.col===col&&a.titre===titre&&a.texte===texte))return;it.alertes.push({col,n,titre,texte,...extra})};
 const sec=items.filter(x=>x.securisee);
 const estIV=it=>it.lecture.voie==='IV';
 // 1. Interactions et 2. physico-chimie, entre paires de lignes
 for(let i=0;i<sec.length;i++)for(let j=i+1;j<sec.length;j++){
  const A=sec[i],B=sec[j];
  for(const ma of A.mols)for(const mb of B.mols){
   if(ma.id===mb.id)continue;
   for(const [x,y,n,texte,cat] of INTERACTIONS){
    const ok=(aClasse(ma,x)&&aClasse(mb,y))||(aClasse(ma,y)&&aClasse(mb,x));if(!ok)continue;
    add(A,'interactions',n,ma.nom+' + '+mb.nom,texte,{cat,avec:B.index});add(B,'interactions',n,mb.nom+' + '+ma.nom,texte,{cat,avec:A.index});
    break; // une seule règle (la plus spécifique, listée en premier) par paire de molécules
   }
   if(estIV(A)&&estIV(B))for(const [x,y,n,texte,cat] of PHYSICO){
    const ok=(aClasse(ma,x)&&aClasse(mb,y))||(aClasse(ma,y)&&aClasse(mb,x));if(!ok)continue;
    add(A,'physico',n,ma.nom+' / '+mb.nom,texte+' (si même voie veineuse)',{cat,avec:B.index});add(B,'physico',n,mb.nom+' / '+ma.nom,texte+' (si même voie veineuse)',{cat,avec:A.index});break;
   }
  }
 }
 // Doses journalières cumulées par molécule (lignes régulières, hors traitement personnel)
 const cumul={};
 for(const it of sec){const L=it.lecture;if(it.ligne?.personnel||it.mols.length!==1||!L.dose||L.dose.unite!=='mg')continue;const jour=doseJour(L);if(jour==null)continue;(cumul[it.ids[0]]??=[]).push({it,jour})}
 for(const it of items){
  const L=it.lecture,l=it.ligne||{};
  // 8. Informations manquantes (prescription de l'établissement uniquement)
  if(it.securisee&&!l.personnel){
   if(!L.dose)add(it,'manquant',2,'Dose absente','Aucune dose lisible (ex. « 1 g », « 4 mg ») dans les consignes.');
   if(!L.voie)add(it,'manquant',2,'Voie absente','Voie d’administration non précisée (IV, SC, PO…).');
   if(!L.rythme&&!L.siBesoin)add(it,'manquant',1,'Rythme absent','Fréquence ou horaires d’administration non précisés.');
   if(L.siBesoin&&!L.max&&!(L.rythme&&L.rythme.intervalleH))add(it,'manquant',1,'« Si besoin » sans limite','Préciser l’intervalle minimal et le nombre maximal de prises par 24 h.');
   if(!L.duree)add(it,'manquant',0,'Durée absente','Durée du traitement ou date de fin non précisée (ex. « pendant 2 jours », « jusqu’à la sortie »).');
  }
  if(!it.securisee)continue;
  for(const m of it.mols){
   // 3. Posologies
   const P=m.p||{};
   if(L.dose&&L.dose.unite==='mg'&&!l.personnel){
    const prise=L.dose.par&&/j|24/.test(L.dose.par)?null:L.dose.valeur;
    let maxPrise=L.voie==='IV'&&P.priseIV?P.priseIV:L.voie==='SC'&&P.priseSC?P.priseSC:P.prise;
    if(P.priseAge&&t.age>=P.priseAge.min)maxPrise=Math.min(maxPrise||Infinity,P.priseAge.prise);
    if(P.poidsMin&&t.poids&&t.poids<P.poidsMin&&P.mgKgPrise)maxPrise=Math.min(maxPrise||Infinity,P.mgKgPrise*t.poids);
    if(prise&&maxPrise&&prise>maxPrise*1.001)add(it,'posologie',3,'Dose par prise élevée',`${fmt(prise)} par prise : au-delà de ${fmt(maxPrise)}${P.poidsMin&&t.poids<P.poidsMin?' (poids '+t.poids+' kg)':''}${P.priseAge&&t.age>=P.priseAge.min?' (âge '+t.age+' ans)':''}.`);
    let maxJour=P.jour;
    if(P.jourAge&&t.age>=P.jourAge.min)maxJour=Math.min(maxJour||Infinity,P.jourAge.jour);
    if(P.jourIR&&t.dfg&&t.dfg<P.jourIR.dfg)maxJour=Math.min(maxJour||Infinity,P.jourIR.jour);
    if(P.poidsMin&&t.poids&&t.poids<P.poidsMin&&P.mgKgJour)maxJour=Math.min(maxJour||Infinity,P.mgKgJour*t.poids,3000);
    else if(P.mgKgJour&&t.poids&&m.id==='metoclopramide')maxJour=Math.min(maxJour||Infinity,P.mgKgJour*t.poids);
    if(m.ih?.jour&&t.ih)maxJour=Math.min(maxJour||Infinity,m.ih.jour);
    if(m.id==='paracetamol'&&t.ih)maxJour=Math.min(maxJour||Infinity,3000);
    const lignesMol=cumul[m.id]||[],total=lignesMol.reduce((s,x)=>s+x.jour,0);
    if(maxJour&&total>maxJour*1.001){
     const plusieurs=lignesMol.length>1;
     add(it,'posologie',3,'Dose journalière dépassée',`${fmt(total)} par 24 h${plusieurs?' (cumul de '+lignesMol.length+' lignes)':''} : au-delà de ${fmt(maxJour)}${t.ih&&m.id==='paracetamol'?' (insuffisance hépatique ou terrain à risque)':''}${P.jourAge&&t.age>=P.jourAge.min?' (âge '+t.age+' ans)':''}${P.jourIR&&t.dfg<P.jourIR.dfg?' (DFG '+t.dfg+' mL/min)':''}.`);
    }
    const ivMin=P.ivIR&&t.dfg&&t.dfg<P.dfgIR?P.ivIR:P.jourIR&&t.dfg&&t.dfg<P.jourIR.dfg&&P.jourIR.iv?P.jourIR.iv:P.iv;
    if(ivMin&&L.rythme?.intervalleH&&L.rythme.intervalleH<ivMin-0.01)add(it,'posologie',2,'Intervalle trop court',`Intervalle de ${fmt1(L.rythme.intervalleH)} h entre deux prises : au moins ${ivMin} h${P.ivIR&&t.dfg<P.dfgIR?' (DFG < '+P.dfgIR+' mL/min)':''}.`);
    if(P.jMax&&L.duree?.jours&&L.duree.jours>P.jMax)add(it,'posologie',2,'Durée maximale dépassée',`${L.duree.jours} jours prescrits : durée maximale recommandée ${P.jMax} jours.`);
    if(P.clavPrise&&prise){// acide clavulanique : rapport lu dans le libellé (« 1 g + … 200 mg », « 1g/200mg »)
     const nl=norm(l.name||''),forte=lireDose(nl),cm=nl.match(/clavulanique[^0-9]*(\d+) ?mg/)||nl.match(/\d+(?:[.,]\d+)? ?g ?\/ ?(\d+) ?mg/);
     if(forte&&cm&&forte.unite==='mg'){const parPrise=prise*nombre(cm[1])/forte.valeur,j=doseJour(L);
      if(parPrise>P.clavPrise*1.001)add(it,'posologie',3,'Acide clavulanique',`${fmt(parPrise)} d’acide clavulanique par injection : au-delà de ${fmt(P.clavPrise)}.`);
      if(j&&j*parPrise/prise>P.clavJour*1.001)add(it,'posologie',3,'Acide clavulanique',`${fmt(j*parPrise/prise)} d’acide clavulanique par 24 h : au-delà de ${fmt(P.clavJour)}.`)}
    }
   }
   if(m.hbpm&&L.dose&&!l.personnel){
    const ui=L.dose.unite==='UI'?L.dose.valeur:L.dose.valeur*100,parJ=L.rythme?.parJour||1,jour=ui*parJ;
    if(t.dfg&&t.dfg<30&&t.dfg>=m.hbpm.dfgCI&&jour<=m.hbpm.prevUI*1.001&&jour>m.hbpm.prevUIIR)add(it,'posologie',3,'Dose à adapter au DFG',`DFG ${t.dfg} mL/min : en prévention, ${m.hbpm.prevUIIR} UI (20 mg) une fois par jour.`);
    if(t.poids&&jour>m.hbpm.prevUI*1.001){const parKg=ui/t.poids;if(parKg>100*1.05)add(it,'posologie',3,'Dose curative élevée',`${Math.round(parKg)} UI/kg par injection : la dose curative est de 100 UI/kg toutes les 12 h.`)}
   }
   // 4. Mises en garde : allergies, terrain, mises en garde du RCP
   if(typeof allergies==='function'&&t.allergies){for(const a of allergies(t.allergies,l.name||m.nom)||[])add(it,'misesEnGarde',a.niveau==='allergie'?4:3,a.niveau==='allergie'?'Allergie':'Réactivité croisée',a.message)}
   for(const r of m.ir||[])if(t.dfg&&t.dfg<r.dfg){add(it,'misesEnGarde',r.n,'Fonction rénale',r.t+' (DFG '+t.dfg+' mL/min'+(t.dfgSource?' · '+t.dfgSource:'')+').');break}
   if(m.ir&&!t.dfg&&t.ir)add(it,'misesEnGarde',2,'Fonction rénale','Insuffisance rénale signalée sans DFG chiffré : renseigner la créatinine ou le DFG pour vérifier la posologie.');
   for(const r of m.age||[])if(t.age!=null&&t.age>=r.min){add(it,'misesEnGarde',r.n,'Âge ('+t.age+' ans)',r.t);break}
   if(m.ih&&t.ih)add(it,'misesEnGarde',m.ih.n,'Fonction hépatique',m.ih.t);
   for(const r of m.ci||[])if(r.re.test(t.atcd||''))add(it,'misesEnGarde',r.n,'Antécédent',r.t);
   for(const [n,txt] of m.mg||[])add(it,'misesEnGarde',n,'RCP',txt);
   if(m.c.includes('abaisse-seuil')&&(/epilep|convuls/.test(t.atcd||'')))add(it,'misesEnGarde',3,'Antécédent','Épilepsie ou convulsions : le tramadol abaisse le seuil épileptogène (contre-indiqué si épilepsie non contrôlée).');
   // 5. Surveillances
   for(const s of m.s||[])add(it,'surveillance',m.c.includes('opioide')||m.c.includes('aminoside')?1:0,'Surveillance',s);
   // 6. Dopants
   if(m.d)add(it,'dopant',m.d.startsWith('S3')?0:1,'Liste AMA',m.d+' Informer le patient sportif (autorisation d’usage à des fins thérapeutiques si besoin).');
   // 7. Conduite
   if(m.cond){const lib={1:'niveau 1 « Soyez prudent »',2:'niveau 2 « Soyez très prudent »',3:'niveau 3 « Attention, danger : ne pas conduire »'}[m.cond];
    add(it,'conduite',m.cond>=3?2:m.cond===2?1:0,'Pictogramme '+lib.split(' ')[1],'Médicament de '+lib+(t.ambulatoire?'. Patient en ambulatoire : ne pas conduire à la sortie, accompagnant obligatoire.':'. À rappeler dans les consignes de sortie.'))}
   // 2 bis. Physico-chimie d'une seule ligne (soluté de dilution)
   if(m.glucose&&L.glucose)add(it,'physico',3,'Soluté de dilution',m.glucose);
   if(m.id==='potassium'&&/\b(ivd|bolus|directe)\b/.test(norm(l.instructions||'')))add(it,'physico',4,'Injection directe','Le chlorure de potassium ne doit jamais être injecté en intraveineuse directe.');
  }
 }
 // 9. Autres : doublons de molécule entre lignes actives
 for(let i=0;i<sec.length;i++)for(let j=i+1;j<sec.length;j++){
  const A=sec[i],B=sec[j],commun=A.ids.filter(id=>B.ids.includes(id));
  for(const id of commun){const m=BY_ID[id],deuxSiBesoin=A.lecture.siBesoin!==B.lecture.siBesoin;
   const txt=deuxSiBesoin?'Même molécule en traitement systématique et « si besoin » : vérifier la dose totale sur 24 h.':'Même molécule prescrite sur deux lignes : doublon possible (relais, changement de voie ?).';
   add(A,'autres',deuxSiBesoin?1:3,'Doublon · '+m.nom,txt,{avec:B.index});add(B,'autres',deuxSiBesoin?1:3,'Doublon · '+m.nom,txt,{avec:A.index})}
 }
 for(const it of sec){
  if(it.ligne?.inactive)add(it,'autres',0,'Spécialité','Spécialité non commercialisée ou autorisation suspendue dans la BDPM.');
  if(it.ligne?.personnel)add(it,'autres',0,'Traitement personnel','Traitement déclaré en consultation : vérifier la conduite à tenir périopératoire (poursuite, suspension, relais).');
 }
 for(const it of items)it.alertes.sort((a,b)=>b.n-a.n);
 return {lignes:items,compteurs:compter(items),colonnes:COLONNES,terrain:t,reference:ref||null};
}
function doseJour(L){
 if(!L.dose||L.dose.unite!=='mg')return null;
 if(L.dose.par&&/j|24/.test(L.dose.par))return L.dose.valeur;
 if(L.dose.par==='h')return L.dose.valeur*24;
 if(L.siBesoin){if(L.max?.jour)return L.max.jour;if(L.max?.prises)return L.dose.valeur*L.max.prises;if(L.rythme?.parJour)return L.dose.valeur*L.rythme.parJour;return null}
 if(L.rythme?.parJour)return L.dose.valeur*L.rythme.parJour;
 return null;
}
const fmt=mg=>mg>=1000?(Math.round(mg/100)/10).toString().replace('.',',')+' g':mg>=1?(Math.round(mg*100)/100).toString().replace('.',',')+' mg':(Math.round(mg*1000)).toString()+' µg';
const fmt1=h=>(Math.round(h*10)/10).toString().replace('.',',');
function compter(items){
 const niveaux={4:0,3:0,2:0,1:0,0:0},colonnes=Object.fromEntries(COLONNES.map(c=>[c.id,0]));
 for(const it of items)for(const a of it.alertes){niveaux[a.n]++;colonnes[a.col]++}
 return {niveaux,colonnes,total:Object.values(niveaux).reduce((a,b)=>a+b,0)};
}
const niveauMax=(it,col)=>{const l=it.alertes.filter(a=>!col||a.col===col);return l.length?Math.max(...l.map(a=>a.n)):null};
// Lignes qui exigent un justificatif à la validation : alerte de niveau ≥ seuil (3 par défaut).
function bloquantes(res,seuil=3,indices){return res.lignes.filter(it=>it.securisee&&!it.ligne?.personnel&&(!indices||indices.includes(it.index))&&it.alertes.some(a=>a.n>=seuil))}
// Empreinte des alertes, pour tracer ce qui a été vu au moment de la validation.
function empreinte(it){return it.alertes.map(a=>a.col+':'+a.n+':'+a.titre).join('|')}
function justificatifValide(t){return String(t||'').trim().length>=10}

return {NIVEAUX,COLONNES,NOMS_COL,MOLECULES:M,INTERACTIONS,PHYSICO,norm,molecules,lireLigne,lireDose,lireVoie,lireRythme,lireDuree,terrain,traitementPersonnel,analyser,doseJour,compter,niveauMax,bloquantes,empreinte,justificatifValide,fmt};
});

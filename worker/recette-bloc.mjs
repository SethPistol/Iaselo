// Programme opératoire fictif de RECETTE (26/11/2026, demande de Romain) : « fais-moi un profil cadre et remplis le
// programme fictif pour tester au mieux le programme du bloc ».
//
// Uniquement en recette (IASELO_RECETTE=true, env.RECETTE). Jamais en production : la route répond 404 hors recette.
// Tout ce qui est créé porte un identifiant préfixé (demo- / DEMO-BLOC-) ; les données réelles de la recette
// (autres salles, plages, vacations, séjours) ne sont jamais modifiées. Patients aux noms explicitement fictifs,
// sans téléphone ni e-mail : aucun SMS ni e-mail ne peut partir.
//
// L'écriture passe par la route normale d'enregistrement (/api/workspace/commit) au nom du propriétaire de la recette :
// mêmes contrôles serveur que pour un enregistrement à l'écran (conflits de salle, de personnel, de SSPI, de lit…).
import planningCore from '../dist/planning-core.js';import plagesRegles from '../dist/plages-operatoires-regles.js';import serviceSectors from '../dist/service-sectors.js';import D from '../dist/deroulement-regles.js';

export const PREFIXE='DEMO-BLOC-';
const estDemo=id=>typeof id==='string'&&(id.startsWith('demo-')||id.startsWith(PREFIXE)||id.startsWith('VAC-PL-demo-')||id.startsWith('VAC-demo-'));
const C=planningCore,P=plagesRegles;
const ajouter=(d,n)=>P.ajouterJours(d,n);
// Date et heure de Paris (le bloc travaille en heure locale).
export function maintenantParis(date=new Date()){
 const f=new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),g=k=>f.find(x=>x.type===k).value;
 return {today:g('year')+'-'+g('month')+'-'+g('day'),now:g('year')+'-'+g('month')+'-'+g('day')+'T'+g('hour')+':'+g('minute')};
}
// Prochains jours ouvrés à partir d'aujourd'hui (aujourd'hui compris s'il est ouvré).
function joursOuvres(today,n){const out=[];for(let d=today;out.length<n;d=ajouter(d,1)){const j=P.jourDe(d);if(j>=1&&j<=5)out.push(d)}return out}
// Ressources par défaut de l'écran quand la recette n'a jamais enregistré de ressources (dist/gestion.js).
export function ressourcesParDefaut(){return Object.entries(serviceSectors).flatMap(([sector,label])=>Array.from({length:2},(_,i)=>({id:sector+'-'+(i+1),sector,label:label+' · '+(sector.startsWith('bloc')?'Salle':sector.startsWith('sspi')?'Poste':'Place')+' '+(i+1)})))}

const SALLES=[['demo-salle-1','Salle 1 · orthopédie (démo)','bloc-chir'],['demo-salle-2','Salle 2 · viscéral & urologie (démo)','bloc-chir'],['demo-salle-3','Salle 3 · ORL & ophtalmologie (démo)','bloc-chir'],['demo-salle-4','Salle 4 · urgences (démo)','bloc-chir'],['demo-endo-1','Endoscopie 1 (démo)','bloc-endo']];
const RESSOURCES=[
 ...SALLES.map(([id,label,sector])=>({id,kind:'room',label,sector,open:true})),
 {id:'demo-salle-5',kind:'room',label:'Salle 5 · fermée pour travaux (démo)',sector:'bloc-chir',open:false},
 ...[1,2,3,4].map(i=>({id:'demo-sspi-'+i,kind:'recovery',label:'SSPI · poste '+i+' (démo)',sector:'sspi-chir',open:true})),
 ...[1,2,3,4,5,6].map(i=>({id:'demo-ambu-'+i,kind:'bed',label:'Ambulatoire · fauteuil '+i+' (démo)',sector:'ambulatoire',open:true})),
 ...[1,2,3,4,5,6].map(i=>({id:'demo-lit-'+i,kind:'bed',label:'1er étage · lit '+i+' (démo)',sector:'etage-1',open:true})),
 ...[['A','bloc-chir'],['B','bloc-chir'],['C','bloc-chir'],['D','bloc-chir'],['E','bloc-endo']].flatMap(([l,sector],i)=>[{id:'demo-ibode-'+(i+1),kind:'staff',label:'IBODE fictive '+l,sector,open:true},{id:'demo-iade-'+(i+1),kind:'staff',label:'IADE fictif '+l,sector,open:true}]),
 {id:'demo-mar-1',kind:'staff',label:'Dr Anesthésiste fictif 1 (MAR)',sector:'bloc-chir',open:true},
 {id:'demo-amplificateur',kind:'equipment',label:'Amplificateur de brillance (démo, un seul)',sector:'bloc-chir',open:true},
 {id:'demo-colonne-coelio',kind:'equipment',label:'Colonne de cœlioscopie (démo)',sector:'bloc-chir',open:true},
 {id:'demo-laser',kind:'equipment',label:'Laser urologique (démo)',sector:'bloc-chir',open:true}
];
// Chirurgiens fictifs. « Dr Test Chirurgien (recette) » est le compte chirurgien de test : ses annonces se placent dans ses plages.
export const CHIRURGIENS={lebrun:'Dr Lebrun (fictif)',ferrand:'Dr Ferrand (fictif)',menard:'Dr Ménard (fictif)',okafor:'Dr Okafor (fictif)',vasseur:'Dr Vasseur (fictif)',aubry:'Dr Aubry (fictif)',test:'Dr Test Chirurgien (recette)'};
const EQUIPES={'demo-salle-1':['demo-ibode-1','demo-iade-1'],'demo-salle-2':['demo-ibode-2','demo-iade-2'],'demo-salle-3':['demo-ibode-3','demo-iade-3'],'demo-salle-4':['demo-ibode-4','demo-iade-4','demo-mar-1'],'demo-endo-1':['demo-ibode-5','demo-iade-5']};
// [chirurgien, jours, salle, début, durée (min), rythme, libellé]
const PLAGES=[
 ['lebrun',[1,2,4],'demo-salle-1','08:00',480,'hebdo','Orthopédie'],
 ['test',[3,5],'demo-salle-1','08:00',480,'hebdo','Chirurgie (compte de test)'],
 ['ferrand',[1,3,5],'demo-salle-2','08:00',540,'hebdo','Viscéral'],
 ['menard',[2,4],'demo-salle-2','08:00',480,'hebdo','Urologie'],
 ['okafor',[1,2,3,4,5],'demo-salle-3','08:00',240,'hebdo','ORL'],
 ['vasseur',[1,2,4,5],'demo-salle-3','13:00',240,'hebdo','Ophtalmologie'],
 ['vasseur',[3],'demo-salle-3','13:00',240,'paire','Ophtalmologie (semaines paires)'],
 ['aubry',[1,2,3,4,5],'demo-endo-1','08:00',300,'hebdo','Endoscopie digestive']
];
export function plagesDemo(today){
 const out=[];for(const [chir,jours,salle,start,duration,rhythm,label]of PLAGES)for(const j of jours)out.push({id:'demo-pl-'+chir+'-'+j+(rhythm==='hebdo'?'':'-'+rhythm),surgeon:CHIRURGIENS[chir],weekday:j,resource:salle,start,duration,staffIds:EQUIPES[salle].filter(x=>!x.startsWith('demo-mar')),from:today,until:'',rhythm,label,state:'Active',updatedAt:today+'T07:00',updatedBy:'Programme fictif de recette'});
 return out;
}
// Anesthésistes fictifs par salle et codes CCAM des actes du programme (les actes sans code certain restent « à coder »).
const ANESTH={'demo-salle-1':'Dr Perrot (fictif)','demo-salle-2':'Dr Kessler (fictif)','demo-salle-3':'Dr Nguyen (fictif)','demo-salle-4':'Dr Anesthésiste fictif 1','demo-endo-1':'Dr Kessler (fictif)'};
const CCAM=[[/hanche/i,'NEKA020'],[/prothèse totale de genou/i,'NFKA007'],[/cholécystectomie/i,'HMFC004'],[/cataracte/i,'BFGA004'],[/appendicectomie/i,'HHFA016'],[/^coloscopie totale|coloscopie de dépistage/i,'HHQE005'],[/fibroscopie œso/i,'HEQE002'],[/canal carpien/i,'AHPA009'],[/thyroïdectomie totale/i,'KCFA005'],[/gastrectomie longitudinale/i,'HFFC018']];
const ccamDe=acte=>(CCAM.find(([re])=>re.test(acte))||[,''])[1];
const PRENOMS=['Claire','Hugo','Nadia','Paul','Inès','Marc','Léa','Karim','Odile','Théo','Sophie','Yanis','Martine','Lucas','Agathe','Bruno','Chloé','Driss','Elise','Fabien','Gisèle','Henri','Iris','Jules','Kenza','Louis','Maëlle','Noé','Olga','Pierre','Rose','Simon'];
const NOMS=['LAMBERT','ROUSSEL','GARNIER','FAURE','BLANC','GIRAUD','MOREL','BARBIER','ARNAUD','LEROY','BRUN','COLIN','PERRIN','RENAUD','SCHMITT','NOEL','MEUNIER','DUMAS','LUCAS','FONTAINE','CARON','CHEVALIER','ROBIN','GAUTHIER','MASSON','DENIS','MULLER','HENRY','RIVIERE','JOLY','LEMOINE','AUBERT'];

/* Cas cliniques du programme. jour = rang du jour ouvré (0 = aujourd'hui ou le prochain jour ouvré).
   Champs : salle, chir, heure, durée, acte, mode, asa, allergies, âge, consultation validée, options. */
const CAS=[
 // Jour 0 : salle 1 orthopédie (Lebrun ou compte de test selon le jour), avec l'amplificateur partagé.
 {j:0,salle:'demo-salle-1',h:'08:00',d:120,acte:'Prothèse totale de hanche droite',spe:'Orthopédie',mode:'Hospitalisation',asa:'ASA 2',all:'Aucune allergie connue',age:68,ok:true,eq:['demo-amplificateur'],lit:true},
 {j:0,salle:'demo-salle-1',h:'10:15',d:150,acte:'Prothèse totale de genou gauche',spe:'Orthopédie',mode:'Hospitalisation',asa:'ASA 3',all:'Latex (choc anaphylactique en 2019) : salle sans latex',age:74,ok:true,lit:true,trt:'Apixaban 5 mg x2 (arrêt J-3), bisoprolol'},
 {j:0,salle:'demo-salle-1',h:'13:00',d:45,acte:'Arthroscopie du genou droit (méniscectomie)',spe:'Orthopédie',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:34,ok:true},
 // Jour 0 : salle 2 viscéral / urologie.
 {j:0,salle:'demo-salle-2',h:'08:00',d:90,acte:'Cholécystectomie sous cœlioscopie',spe:'Chirurgie digestive',mode:'Ambulatoire',asa:'ASA 2',all:'Pénicillines (urticaire) : antibioprophylaxie à adapter',age:45,ok:true,eq:['demo-colonne-coelio']},
 {j:0,salle:'demo-salle-2',h:'09:45',d:60,acte:'Cure de hernie inguinale droite',spe:'Chirurgie digestive',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:39,ok:true},
 {j:0,salle:'demo-salle-2',h:'11:00',d:180,acte:'Sigmoïdectomie sous cœlioscopie',spe:'Chirurgie digestive',mode:'Hospitalisation',asa:'ASA 3',all:'Aucune allergie connue',age:71,ok:false,lit:true,eq:['demo-colonne-coelio'],trt:'Insuffisance cardiaque, FEVG 35 %'},
 // Jour 0 : salle 3 ORL le matin, ophtalmologie l'après-midi (enfant, sujet âgé ASA 4).
 {j:0,salle:'demo-salle-3',h:'08:00',d:45,acte:'Amygdalectomie (enfant de 6 ans)',spe:'ORL',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:6,ok:true},
 {j:0,salle:'demo-salle-3',h:'09:00',d:60,acte:'Septoplastie',spe:'ORL',mode:'Ambulatoire',asa:'ASA 2',all:'Aucune allergie connue',age:29,ok:true,retard:true},
 {j:0,salle:'demo-salle-3',h:'10:15',d:90,acte:'Thyroïdectomie totale',spe:'ORL',mode:'Hospitalisation',asa:'ASA 2',all:'Iode (érythème)',age:57,ok:true,lit:true},
 {j:0,salle:'demo-salle-3',h:'13:00',d:30,acte:'Cataracte œil droit (phacoémulsification)',spe:'Ophtalmologie',mode:'Ambulatoire',asa:'ASA 4',all:'Aucune allergie connue',age:91,ok:true,trt:'Fluindione (INR à contrôler), insuffisance respiratoire sous O2'},
 {j:0,salle:'demo-salle-3',h:'13:45',d:30,acte:'Cataracte œil gauche (phacoémulsification)',spe:'Ophtalmologie',mode:'Ambulatoire',asa:'ASA 2',all:'Aucune allergie connue',age:76,ok:true},
 // Jour 0 : salle 4 urgences (vacation d'urgence sans chirurgien titulaire).
 {j:0,salle:'demo-salle-4',h:'09:00',d:60,acte:'Appendicectomie en urgence',spe:'Chirurgie digestive',mode:'Hospitalisation',asa:'ASA 1',all:'Aucune allergie connue',age:19,ok:true,urgent:true,lit:true,chir:'ferrand'},
 {j:0,salle:'demo-salle-4',h:'11:30',d:120,acte:'Fracture ouverte de jambe : parage et fixateur externe',spe:'Orthopédie',mode:'Hospitalisation',asa:'ASA 3E',all:'AINS (bronchospasme)',age:43,ok:false,urgent:true,lit:true,eq:['demo-amplificateur'],chir:'lebrun',trt:'Estomac plein (repas à 10 h)'},
 // Jour 0 : endoscopie.
 {j:0,salle:'demo-endo-1',h:'08:00',d:30,acte:'Coloscopie totale',spe:'Gastro-entérologie',mode:'Ambulatoire',asa:'ASA 2',all:'Aucune allergie connue',age:61,ok:true},
 {j:0,salle:'demo-endo-1',h:'08:45',d:20,acte:'Fibroscopie œso-gastro-duodénale',spe:'Gastro-entérologie',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:48,ok:true},
 {j:0,salle:'demo-endo-1',h:'09:30',d:45,acte:'Coloscopie avec mucosectomie',spe:'Gastro-entérologie',mode:'Ambulatoire',asa:'ASA 3',all:'Propofol ? (allergie à l’œuf déclarée, à vérifier)',age:69,ok:true},
 // Jour 1.
 {j:1,salle:'demo-salle-1',h:'08:00',d:120,acte:'Prothèse totale de hanche gauche',spe:'Orthopédie',mode:'Hospitalisation',asa:'ASA 2',all:'Aucune allergie connue',age:63,ok:true,lit:true,eq:['demo-amplificateur']},
 {j:1,salle:'demo-salle-1',h:'10:30',d:60,acte:'Libération du canal carpien droit',spe:'Orthopédie',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:55,ok:false},
 {j:1,salle:'demo-salle-1',h:'13:00',d:60,acte:'Ostéosynthèse du poignet gauche',spe:'Orthopédie',mode:'Ambulatoire',asa:'ASA 2',all:'Aucune allergie connue',age:52,ok:false,eq:['demo-amplificateur']},
 {j:1,salle:'demo-salle-2',h:'08:00',d:120,acte:'Résection transurétrale de prostate',spe:'Urologie',mode:'Hospitalisation',asa:'ASA 3',all:'Aucune allergie connue',age:78,ok:true,lit:true,eq:['demo-laser']},
 {j:1,salle:'demo-salle-2',h:'10:15',d:90,acte:'Urétéroscopie souple gauche (laser)',spe:'Urologie',mode:'Ambulatoire',asa:'ASA 2',all:'Céphalosporines (œdème de Quincke)',age:47,ok:true,eq:['demo-laser']},
 {j:1,salle:'demo-salle-3',h:'08:00',d:60,acte:'Adénoïdectomie et aérateurs transtympaniques (enfant de 3 ans)',spe:'ORL',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:3,ok:true},
 {j:1,salle:'demo-endo-1',h:'08:00',d:30,acte:'Coloscopie de dépistage',spe:'Gastro-entérologie',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:52,ok:true},
 // Jour 2.
 {j:2,salle:'demo-salle-2',h:'08:00',d:150,acte:'Gastrectomie longitudinale (sleeve), IMC 46',spe:'Chirurgie digestive',mode:'Hospitalisation',asa:'ASA 3',all:'Aucune allergie connue',age:38,ok:true,lit:true,eq:['demo-colonne-coelio'],trt:'SAOS appareillé, intubation difficile prévisible'},
 {j:2,salle:'demo-salle-3',h:'13:00',d:30,acte:'Cataracte œil droit',spe:'Ophtalmologie',mode:'Ambulatoire',asa:'ASA 2',all:'Aucune allergie connue',age:80,ok:true},
];
/* Annonces chirurgicales transmises, pas encore au programme : elles apparaissent en pointillés « Annoncé · à confirmer ».
   Elles couvrent : urgence placée en premier, heure souhaitée, concurrence sur le même créneau, dépassement de vacation,
   chirurgien sans vacation ce jour, annonce du compte chirurgien de test. */
const ANNONCES=[
 {j:0,chir:'jour0-salle1',acte:'Fracture du col du fémur droit',spe:'Orthopédie',mode:'Hospitalisation',d:90,urgent:true,lat:'Droit',age:88,asa:'ASA 3',all:'Aucune allergie connue',notes:'Patiente sous AVK, INR du jour à récupérer.'},
 {j:1,chir:'ferrand-ou-menard',acte:'Cure d’éventration sous cœlioscopie',spe:'Chirurgie digestive',mode:'Hospitalisation',d:120,time:'13:00',age:59,asa:'ASA 2',all:'Aucune allergie connue'},
 {j:1,chir:'ferrand-ou-menard',acte:'Exérèse de kyste pilonidal',spe:'Chirurgie digestive',mode:'Ambulatoire',d:45,time:'13:00',age:24,asa:'ASA 1',all:'Aucune allergie connue',notes:'Même heure souhaitée que l’annonce précédente : la seconde arrivée est décalée.'},
 {j:1,chir:'ferrand-ou-menard',acte:'Néphrectomie partielle robot-assistée',spe:'Urologie',mode:'Hospitalisation',d:240,age:66,asa:'ASA 3',all:'Iode (choc)',notes:'Durée longue : la vacation déborde, la confirmation est impossible.'},
 {j:1,chir:'hors-vacation',acte:'Exérèse d’un lipome de l’épaule',spe:'Chirurgie plastique',mode:'Ambulatoire',d:45,age:41,asa:'ASA 1',all:'Aucune allergie connue',notes:'Chirurgien sans plage ce jour : à programmer manuellement.'},
 {j:2,chir:'okafor',acte:'Tympanoplastie gauche',spe:'ORL',mode:'Ambulatoire',d:90,lat:'Gauche',age:33,asa:'ASA 1',all:'Aucune allergie connue'},
 {j:2,chir:'okafor',acte:'Panendoscopie ORL',spe:'ORL',mode:'Ambulatoire',d:45,age:62,asa:'ASA 3',all:'Aucune allergie connue',notes:'Tabagisme actif, BPCO.'},
 {j:'test',chir:'test',acte:'Cure de hernie ombilicale',spe:'Chirurgie digestive',mode:'Ambulatoire',d:60,age:50,asa:'ASA 2',all:'Aucune allergie connue',notes:'Annonce du compte chirurgien de test.'},
];

function identite(i,age,today){const y=Number(today.slice(0,4))-age,m=String(1+(i*5)%12).padStart(2,'0'),d=String(1+(i*7)%27).padStart(2,'0');return {lastName:'FICTIF-'+NOMS[i%NOMS.length],firstName:PRENOMS[i%PRENOMS.length],birthDate:y+'-'+m+'-'+d}}
function consultation(c,ok){return {asa:c.asa,history:c.trt?c.trt:'Patient fictif de recette (programme du bloc).',allergies:c.all,treatments:c.trt||'Aucun traitement au long cours',plan:c.mode==='Ambulatoire'?'Anesthésie générale, prise en charge ambulatoire.':'Anesthésie générale, hospitalisation post-opératoire.',checks:[],validated:!!ok}}

// Actes habituels par plage et biais de durée propre à chaque chirurgien (réel / prévu), pour un historique réaliste.
const ACTES_HIST={lebrun:[['Prothèse totale de hanche',120],['Prothèse totale de genou',150],['Arthroscopie du genou (méniscectomie)',45],['Libération du canal carpien',30]],
 test:[['Cure de hernie ombilicale',60],['Cure de hernie inguinale',60],['Exérèse de lipome',40]],ferrand:[['Cholécystectomie sous cœlioscopie',90],['Cure de hernie inguinale',60],['Sigmoïdectomie sous cœlioscopie',180]],
 menard:[['Résection transurétrale de prostate',120],['Urétéroscopie souple (laser)',90]],okafor:[['Amygdalectomie',45],['Septoplastie',60],['Thyroïdectomie totale',90]],
 vasseur:[['Cataracte (phacoémulsification)',30]],aubry:[['Coloscopie totale',30],['Fibroscopie œso-gastro-duodénale',20]]};
const BIAIS={lebrun:1.18,test:1.05,ferrand:1.1,menard:.95,okafor:1.02,vasseur:.9,aubry:1.15};
export function historiqueFictif(today,jours=30){
 const out={vacations:[],bookings:[],stays:{}};let n=0,graine=7;
 for(let i=1;i<=12;i++){const id=PREFIXE+'H-'+String(i).padStart(2,'0');out.stays[id]={core:{id,specialty:'Historique',mode:'Ambulatoire',stage:'Sortie',task:'Historique fictif du bloc',sector:'',identity:{lastName:'FICTIF-HISTORIQUE',firstName:'Patient '+i,birthDate:'1960-01-'+String(i).padStart(2,'0')},done:true,careTeamId:'demo-clinique'}}}const hasard=()=>{graine=(graine*1103515245+12345)%2147483648;return graine/2147483648};
 const cle=Object.fromEntries(Object.entries(CHIRURGIENS).map(([k,v])=>[k,k]));
 for(let d=ajouter(today,-1),k=0;k<jours;d=ajouter(d,-1)){const j=P.jourDe(d);if(j<1||j>5)continue;k++;
  for(const [chir,js,salle,start,duree] of PLAGES){if(!js.includes(j)||!cle[chir])continue;
   const vs=d+'T'+start,ve=C.addMinutes(vs,duree),v={id:'VAC-demo-h-'+salle+'-'+d+'-'+start.slice(0,2),resource:salle,label:'Historique fictif',start:vs,end:ve,staffIds:[...EQUIPES[salle]],surgeon:CHIRURGIENS[chir],state:'Ouverte'};
   // Une vacation sur huit est restée peu remplie ; sinon 2 à 4 interventions.
   const nb=hasard()<.125?1:2+Math.floor(hasard()*3);let cur=C.addMinutes(vs,Math.round(hasard()*hasard()*35));
   for(let i=0;i<nb;i++){const [acte,prevu]=ACTES_HIST[chir][Math.floor(hasard()*ACTES_HIST[chir].length)];
    const reel=Math.max(10,Math.round(prevu*BIAIS[chir]*(0.88+hasard()*.26)));const sortie=C.addMinutes(cur,reel);if(sortie>C.addMinutes(ve,40))break;
    const id=PREFIXE+'H-'+String(++n%12+1).padStart(2,'0'),sspi=salle==='demo-endo-1'&&prevu<45?0:Math.round(40+hasard()*45);
    out.bookings.push({id:PREFIXE+'RES-H-'+String(n).padStart(3,'0'),patient:id,resource:salle,vacationId:v.id,procedure:acte,start:cur,end:C.addMinutes(cur,prevu+15),duration:prevu,turnover:15,staffIds:[...v.staffIds],equipmentIds:[],note:'Historique fictif de recette',state:'Terminée',surgeon:v.surgeon,ccam:ccamDe(acte),
     actualStart:cur,actualEnd:sortie,etapes:{arrivee:C.addMinutes(cur,-30),entree:cur,sortie,sortieBloc:C.addMinutes(sortie,sspi||10)},...(sspi?{recovery:{resource:'demo-sspi-1',start:sortie,end:C.addMinutes(sortie,sspi)}}:{})});
    cur=C.addMinutes(sortie,12+Math.round(hasard()*20));
   }
   if(hasard()<.1)cur=v.end;out.vacations.push(v);
  }
 }
 return out;
}

/* Construit tous les documents. current = documents actuels {key:data} (management/* seulement nécessaires).
   Retourne {documents:{key:data}, resume}. Déterministe pour une date et une heure données. */
export function programmeFictif({today,now,current={}}){
 const jours=joursOuvres(today,6),res0=Array.isArray(current['management/planningResources'])&&current['management/planningResources'].length?current['management/planningResources']:ressourcesParDefaut();
 const resources=[...res0.filter(r=>!estDemo(r.id)),...RESSOURCES];
 const plagesDemoListe=plagesDemo(today),plages=[...(current['management/plages']||[]).filter(p=>!estDemo(p.id)),...plagesDemoListe];
 const autresVac=(current['management/vacations']||[]).filter(v=>!estDemo(v.id)),autresRes=(current['management/reservations']||[]).filter(r=>!estDemo(r.id));
 // Vacations des plages de démonstration (12 semaines), plus une vacation d'urgence par jour ouvré (salle 4, sans chirurgien titulaire).
 const gen=P.generer({plages:plagesDemoListe,vacations:[],reservations:[],resources,today,vacationError:C.vacationError});
 const urgences=jours.map(d=>({id:'VAC-demo-urg-'+d,resource:'demo-salle-4',label:'Vacation d’urgences',start:d+'T08:00',end:d+'T20:00',staffIds:EQUIPES['demo-salle-4'],surgeon:'',state:'Ouverte'}));
 // Un congé : la plage du Dr Vasseur annulée au 3e jour ouvré (la vacation n'est pas recréée).
 const vacDemo=[...gen.vacations,...urgences].map(v=>v.surgeon===CHIRURGIENS.vasseur&&v.start.slice(0,10)===jours[3]?{...v,state:'Annulée',note:'Congé du chirurgien (démo)'}:v);
 const vacations=[...autresVac,...vacDemo];
 const vacDu=(salle,d)=>vacDemo.find(v=>v.resource===salle&&v.start.slice(0,10)===d&&v.state!=='Annulée');
 const stays={},bookings=[],resume={sejours:0,interventions:0,annonces:0,derives:0};
 let n=0;const busy=[];
 const libre=(id,a,b)=>!busy.some(x=>x.resource===id&&a<x.end&&x.start<b);
 const prendre=(ids,a,b)=>{const id=ids.find(x=>libre(x,a,b));if(id)busy.push({resource:id,start:a,end:b});return id};
 const sejour=(c,extra={})=>{const id=PREFIXE+String(++n).padStart(2,'0'),idt=identite(n-1,c.age,today);
  stays[id]={core:{id,specialty:c.spe,mode:c.mode,stage:extra.stage||'Préopératoire',task:extra.task||'Programme du bloc',sector:'',identity:idt,done:false,careTeamId:'demo-clinique',...(extra.origin?{origin:extra.origin}:{})},consult:consultation(c,c.ok)};resume.sejours++;return id};
 for(const c of CAS){
  const d=jours[c.j],v=vacDu(c.salle,d);if(!v)continue;
  const start=d+'T'+c.h,end=C.addMinutes(start,c.d+15),opEnd=C.addMinutes(start,c.d);
  if(start<v.start||end>v.end)continue;
  const state=c.retard?'Réservée':end<=now?'Terminée':start<=now?'Occupée':'Réservée';
  const id=sejour(c,{stage:state==='Terminée'?(c.mode==='Ambulatoire'?'Sortie':'Hospitalisation'):state==='Occupée'?'Intervention':'Préopératoire',task:state==='Terminée'?'Surveillance postopératoire':'Programme du bloc'});
  const r={id:PREFIXE+'RES-'+id.slice(PREFIXE.length),planningVersion:1,patient:id,resource:c.salle,vacationId:v.id,procedure:c.acte+(c.urgent?' (URGENCE)':''),start,end,duration:c.d,turnover:15,staffIds:[...v.staffIds],equipmentIds:[],note:'Programme fictif de recette',state,surgeon:c.chir?CHIRURGIENS[c.chir]:v.surgeon||'',anesthesiste:ANESTH[c.salle]||'',ccam:ccamDe(c.acte)};
  busy.push({resource:c.salle,start,end});for(const s of r.staffIds)busy.push({resource:s,start,end});
  for(const e of c.eq||[])if(libre(e,start,end)){busy.push({resource:e,start,end});r.equipmentIds.push(e)}
  // SSPI (sauf endoscopie courte), puis lit ou fauteuil en aval selon le mode.
  if(c.salle!=='demo-endo-1'||c.d>=45){const rs=opEnd,re=C.addMinutes(opEnd,c.d>=120?90:60),poste=prendre([1,2,3,4].map(i=>'demo-sspi-'+i),rs,re);if(poste)r.recovery={resource:poste,start:rs,end:re}}
  const bs=r.recovery?.end||opEnd,be=c.mode==='Ambulatoire'?d+'T19:00':ajouter(d,3)+'T12:00';
  if(bs<be&&!(c.sansLit)){const lit=prendre(c.mode==='Ambulatoire'?[1,2,3,4,5,6].map(i=>'demo-ambu-'+i):[1,2,3,4,5,6].map(i=>'demo-lit-'+i),bs,be);if(lit)r.bed={resource:lit,start:bs,end:be}}
  r.state='Réservée';
  // Déroulement réel : étapes franchies avant l'heure de chargement (retards et avances variables, sauf le cas « en retard »).
  if(!c.retard){const ecart=[0,6,-5,18,35,2,12,-3,25,8][n%10],entree=C.addMinutes(start,ecart),sortie=C.addMinutes(entree,c.d),temps={arrivee:C.addMinutes(start,-35),entree,sortie,sortieBloc:C.addMinutes(sortie,r.recovery?(c.d>=120?85:55):10)};
   for(const k of D.CLES){if(temps[k]>now)break;const o=D.appliquer(r,k,temps[k],'');if(o.error)break;Object.assign(r,o.reservation)}}
  const stEt=D.etapeCourante(r);stays[id].core.stage=!stEt||stEt==='arrivee'?'Préopératoire':stEt==='entree'?'Intervention':stEt==='sortie'&&r.phase==='recovery'?'SSPI':c.mode==='Ambulatoire'?'Sortie':'Hospitalisation';
  bookings.push(r);resume.interventions++;
 }
 // Sécurité : deux passages ne peuvent pas occuper en même temps le même poste de SSPI ou le même lit (retards cumulés).
 const occupe=new Set();for(const r of bookings.filter(r=>r.state==='Occupée').sort((a,b)=>a.start.localeCompare(b.start))){let cur=C.currentResource(r);
  while(r.state==='Occupée'&&occupe.has(cur)){const k=D.prochaine(r);const o=k?D.appliquer(r,k,D.etapes(r)[D.CLES[D.CLES.indexOf(k)-1]]||now,''):null;if(!o||o.error){r.state='Terminée';break}Object.assign(r,o.reservation);cur=C.currentResource(r)}
  if(r.state==='Occupée')occupe.add(cur)}
 // Deux programmes confirmés depuis une annonce, puis l'annonce a bougé : points bloquants « à revoir ».
 const jourChir=k=>jours.find(d=>vacDemo.some(v=>v.surgeon===CHIRURGIENS[k]&&v.start.slice(0,10)===d&&v.state!=='Annulée'));
 const derive=(c,salle,chir,annonce)=>{const d=jours[c.j],v=vacDemo.find(v=>v.resource===salle&&v.start.slice(0,10)===d&&v.surgeon===CHIRURGIENS[chir]&&v.state!=='Annulée');if(!v)return;
  const start=d+'T'+c.h,end=C.addMinutes(start,c.d+15);if(busy.some(x=>x.resource===salle&&start<x.end&&x.start<end)||end>v.end)return;
  const id=sejour(c,{origin:'annonce'});busy.push({resource:salle,start,end});
  bookings.push({id:PREFIXE+'RES-'+id.slice(PREFIXE.length),planningVersion:1,patient:id,resource:salle,vacationId:v.id,procedure:c.acte,start,end,duration:c.d,turnover:15,staffIds:[...v.staffIds],equipmentIds:[],note:'Annonce chirurgicale v1 · '+v.surgeon,state:'Réservée',source:'annonce',annonceRevision:1,surgeon:v.surgeon,anesthesiste:ANESTH[salle]||'',ccam:''});
  stays[id].surgicalAnnouncement={published:{fields:{procedure:c.acte,surgeon:v.surgeon,urgency:'Programmée',mode:c.mode,laterality:'Non applicable',date:annonce.date||d,time:'',duration:String(c.d),notes:annonce.notes},state:annonce.state,revision:annonce.revision,sentAt:ajouter(today,-2)+'T09:00:00.000Z',at:'Programme fictif de recette',author:{name:v.surgeon,label:'chirurgien'}}};resume.derives++;
 };
 derive({j:1,h:'10:00',d:60,acte:'Rhinoseptoplastie',spe:'ORL',mode:'Ambulatoire',asa:'ASA 1',all:'Aucune allergie connue',age:27,ok:true},'demo-salle-3','okafor',{state:'Transmise',revision:2,date:jours[4],notes:'Annonce modifiée après confirmation : nouvelle date souhaitée.'});
 derive({j:1,h:'11:15',d:30,acte:'Biopsie de la cavité buccale',spe:'ORL',mode:'Ambulatoire',asa:'ASA 2',all:'Aucune allergie connue',age:70,ok:true},'demo-salle-3','okafor',{state:'Annulée',revision:1,notes:'Intervention annulée par le chirurgien après confirmation.'});
 // Annonces à confirmer.
 for(const [i,a]of ANNONCES.entries()){
  let d,chir;
  if(a.chir==='jour0-salle1'){d=jours[0];chir=vacDu('demo-salle-1',d)?.surgeon||CHIRURGIENS.lebrun}
  else if(a.chir==='ferrand-ou-menard'){d=jours[a.j];chir=vacDu('demo-salle-2',d)?.surgeon||CHIRURGIENS.ferrand}
  else if(a.chir==='hors-vacation'){d=jours[a.j];chir='Dr Sans-Plage (fictif)'}
  else if(a.chir==='test'){d=jourChir('test')||jours[1];chir=CHIRURGIENS.test}
  else {d=jours[a.j];chir=CHIRURGIENS[a.chir]}
  const id=sejour({...a,ok:false},{stage:'Consultation',task:'Consultation d’anesthésie à faire',origin:'annonce'});
  stays[id].surgicalAnnouncement={published:{fields:{procedure:a.acte,surgeon:chir,urgency:a.urgent?'Urgente':'Programmée',mode:a.mode,laterality:a.lat||'Non applicable',date:d,time:a.time||'',duration:String(a.d),notes:a.notes||''},state:'Transmise',revision:1,sentAt:ajouter(today,-1)+'T'+String(8+i).padStart(2,'0')+':00:00.000Z',at:'Programme fictif de recette',author:{name:chir,label:'chirurgien'}}};
  resume.annonces++;
 }
 // Historique fictif (27/11/2026, bloc prédictif) : 30 jours ouvrés passés de passages terminés, pour que les durées
 // estimées, la prévision SSPI et l'analyse du bloc aient une référence. 12 dossiers fictifs « historique », sortis.
 const hist=historiqueFictif(today);vacations.push(...hist.vacations);bookings.push(...hist.bookings);Object.assign(stays,hist.stays);resume.historique=hist.bookings.length;
 const documents={'management/planningResources':resources,'management/plages':plages,'management/vacations':vacations,'management/reservations':[...autresRes,...bookings]};
 for(const [id,s]of Object.entries(stays))for(const [module,data]of Object.entries(s))documents['stay/'+id+'/'+module]=data;
 resume.jours=jours.slice(0,3);resume.salles=SALLES.length;resume.plages=plagesDemoListe.length;
 return {documents,resume};
}
// Le programme est-il à jour ? (au moins une intervention de démonstration aujourd'hui ou plus tard)
export function programmeAJour(reservations,today){return (reservations||[]).some(r=>estDemo(r.id)&&r.start.slice(0,10)>=today)}

// POST /api/workspace/recette/programme-bloc  {mode:'recharger'|'si-absent'}
// Recette seulement ; administrateur ou cadre de bloc. Écrit au nom du propriétaire de la recette par la route normale.
export async function recetteProgrammeApi(request,env,acl,{json,commit}){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/recette/programme-bloc')return null;
 if(env.RECETTE!==true)return json({error:'Introuvable.'},404);
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 if(!acl.isAdmin&&!(acl.job==='infirmier'&&acl.poste==='cadre')){await acl.log('recette-programme-bloc','management/reservations','denied','Réservé à l’administrateur et au cadre de bloc');return json({error:'Réservé à l’administrateur et au cadre de bloc.'},403)}
 let mode='recharger';try{const b=await request.json();if(b?.mode==='si-absent')mode='si-absent'}catch{}
 const {today,now}=maintenantParis(env.MAINTENANT?new Date(env.MAINTENANT):new Date());
 const keys=['management/planningResources','management/plages','management/vacations','management/reservations'],rows=new Map();
 const lire=async key=>{const row=await env.DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();rows.set(key,row?{data:JSON.parse(row.data),revision:row.revision}:{data:undefined,revision:0});return rows.get(key)};
 for(const k of keys)await lire(k);
 if(mode==='si-absent'&&programmeAJour(rows.get('management/reservations').data,today))return json({deja:true,today});
 const owner=(await env.DB.prepare("SELECT user_id FROM workspace_members WHERE role='owner' ORDER BY created_at LIMIT 1").first())?.user_id;if(!owner)return json({error:'Aucun propriétaire de recette.'},409);
 const {documents,resume}=programmeFictif({today,now,current:Object.fromEntries(keys.map(k=>[k,rows.get(k).data]))});
 // Les séjours de démonstration précédents sont remplacés (mêmes identifiants), les autres séjours ne sont pas touchés.
 const reason='Programme fictif du bloc (recette) · demandé par '+(acl.profile?.display_name||'le serveur'),sejours=[],gestion=[];
 for(const [key,data]of Object.entries(documents)){const r=keys.includes(key)?rows.get(key):await lire(key);(key.startsWith('stay/')?sejours:gestion).push({key,revision:r.revision,data,operation:crypto.randomUUID(),reason})}
 // Séjours de démonstration absents du nouveau programme : on vide leur annonce pour qu'ils ne se placent plus.
 const anciens=await env.DB.prepare("SELECT key,revision FROM workspace_documents WHERE key LIKE 'stay/"+PREFIXE+"%/surgicalAnnouncement'").all();
 for(const row of anciens.results||[])if(!Object.hasOwn(documents,row.key))sejours.push({key:row.key,revision:row.revision,data:{},operation:crypto.randomUUID(),reason});
 // Deux enregistrements : les séjours d'abord (le second voit alors ces séjours dans le périmètre du propriétaire), puis le programme.
 for(const lot of [sejours,gestion]){
  const r=await commit(owner,lot);const out=await r.json().catch(()=>({}));
  if(!r.ok){await acl.log('recette-programme-bloc','management/reservations','denied',String(out.error||r.status).slice(0,300));return json({error:out.error||'Programme fictif refusé.',status:r.status},r.status===403?409:r.status)}
 }
 await acl.log('recette-programme-bloc','management/reservations','allowed','Programme fictif du bloc chargé',JSON.stringify(resume));
 return json({charge:true,today,resume});
}

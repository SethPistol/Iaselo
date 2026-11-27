/* IASELO · pilotage des sorties (27/11/2026, 4e veille, manque 2). Règles pures, sans réseau.
   Pour chaque patient qui sort aujourd'hui ou demain : ce qui est prêt et ce qui bloque (date prévue, critères cliniques,
   ordonnance, lettre de liaison, consignes, transport et accompagnant), et la sortie infirmière sur protocole :
   le médecin prescrit la sortie sous conditions, l'infirmière constate chaque critère, la sortie est alors autorisée.
   Critères par défaut inspirés des protocoles de sortie de RAAC et de chirurgie ambulatoire (HAS) ; À FAIRE VALIDER
   par les médecins de l'établissement. Données : sortiePlus (sortiePrevue, transport, protocole, chungSigne), discharge. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ameliorations-regles.js'):root.IaseloAmeliorations);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloSorties=api;})(typeof self!=='undefined'?self:globalThis,function(A){
'use strict';
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const t=v=>typeof v==='string'?v.trim():'';
const CRITERES=[
 {id:'constantes',libelle:'Constantes stables (NEWS2 ≤ 2 au dernier relevé)'},
 {id:'douleur',libelle:'Douleur ≤ 3/10 avec antalgiques par voie orale'},
 {id:'alimentation',libelle:'Alimentation et boissons reprises, sans vomissement'},
 {id:'miction',libelle:'Miction spontanée'},
 {id:'pansement',libelle:'Pansement sec, pas de saignement'},
 {id:'lever',libelle:'Lever et marche autonomes (ou aide prévue au domicile)'},
 {id:'consignes',libelle:'Consignes de sortie expliquées et comprises, numéro à appeler remis'}
];
const vitaux=s=>[...(s?.postopVitals||[])].filter(r=>r&&!r.voided&&r.at).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
// Constat automatique à partir des derniers relevés (proposé à l'infirmière, jamais coché à sa place).
function constats(s){
 const v=vitaux(s).at(-1)?.values||{},out={};
 if(A?.news2){const n=A.news2(v);if(n.mesures>=4)out.constantes=n.total<=2?'ok':'non'}
 const d=num(v.pain);if(d!=null)out.douleur=d<=3?'ok':'non';
 if(v.dressing)out.pansement=v.dressing==='Sec'||v.dressing==='Refait'?'ok':'non';
 if(v.miction)out.miction=v.miction==='Oui'?'ok':'non';
 if(v.nvpo!==undefined&&v.nvpo!=='')out.alimentation=String(v.nvpo)==='2'?'non':out.alimentation;
 return out;
}
const jourDe=d=>String(d||'').slice(0,10);
function datePrevue(s,aujourdhui){
 const sp=s.sortiePlus?.sortiePrevue;if(sp)return jourDe(sp);
 if(s.mode==='Ambulatoire'&&['Intervention','SSPI','Hospitalisation'].includes(s.stage))return aujourdhui;
 return '';
}
// Étapes de la sortie d'un séjour : {id, libelle, ok, detail}.
function etapes(s,{aujourdhui}={}){
 const sp=s.sortiePlus||{},dis=s.discharge||{},ambu=s.mode==='Ambulatoire',prot=sp.protocole,coche=sp.protocoleConstat||{};
 const criteresOk=prot?CRITERES.filter(c=>prot.criteres.includes(c.id)).every(c=>coche[c.id]?.ok):false;
 const clinique=ambu?!!sp.chungSigne||!!sp.sortieAutorisee:!!sp.sortieAutorisee||!!sp.aptitudeMedicale;
 const tr=sp.transport||{};
 return [
  {id:'date',libelle:'Date de sortie prévue',ok:!!datePrevue(s,aujourdhui),detail:datePrevue(s,aujourdhui)||'À fixer'},
  {id:'clinique',libelle:ambu?'Aptitude à la sortie (Chung signé ou protocole)':'Sortie autorisée (médecin ou protocole)',ok:clinique,detail:sp.sortieAutorisee?'Protocole validé par '+sp.sortieAutorisee.par:sp.chungSigne?'Chung signé par '+sp.chungSigne.by:sp.aptitudeMedicale?'Médecin : '+sp.aptitudeMedicale.par:prot?(criteresOk?'Critères réunis : à valider':'Protocole prescrit, critères à constater'):'À décider'},
  {id:'ordonnance',libelle:'Ordonnance de sortie',ok:!!dis.ordinance,detail:dis.ordinance?'Rédigée':'À rédiger'},
  {id:'liaison',libelle:'Lettre de liaison',ok:!!dis.liaison?.document,detail:dis.liaison?.document?'Validée':'À valider'},
  {id:'consignes',libelle:'Consignes de sortie',ok:!!t(dis.instructions)||!!dis.validated,detail:t(dis.instructions)?'Rédigées':'À rédiger'},
  {id:'transport',libelle:ambu?'Accompagnant et retour':'Transport et retour',ok:!!(tr.mode&&(tr.heure||tr.mode==='Proche')&&(!ambu||t(tr.accompagnant))),detail:tr.mode?[tr.mode,tr.heure,tr.accompagnant].filter(Boolean).join(' · '):'À organiser'}
 ];
}
function tableau(sejours,now=new Date()){
 const auj=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now),dem=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(now.getTime()+864e5));
 const lignes=[];
 for(const s of sejours||[]){
  if(!s||s.done||['Sortie','Consultation','Préopératoire'].includes(s.stage)&&!s.sortiePlus?.sortiePrevue)continue;
  if(s.stage==='Sortie')continue;
  const d=datePrevue(s,auj);if(d!==auj&&d!==dem&&!(d&&d<auj))continue;
  const e=etapes(s,{aujourdhui:auj}),manque=e.filter(x=>!x.ok);
  lignes.push({stay:s.id,nom:[String(s.identity?.lastName||'').toUpperCase(),s.identity?.firstName].filter(Boolean).join(' ')||s.id,mode:s.mode,stage:s.stage,chambre:s.sortiePlus?.chambre||s.preadmission?.chambre||'',
   jour:d<auj?'retard':d===auj?'aujourdhui':'demain',date:d,etapes:e,bloquants:manque.map(x=>x.libelle),pret:!manque.length,heure:s.sortiePlus?.transport?.heure||''});
 }
 const r={retard:0,aujourdhui:1,demain:2};
 lignes.sort((a,b)=>r[a.jour]-r[b.jour]||a.pret-b.pret||String(a.heure).localeCompare(String(b.heure))||a.nom.localeCompare(b.nom));
 return {aujourdhui:auj,demain:dem,lignes,prets:lignes.filter(l=>l.pret&&l.jour!=='demain').length,bloques:lignes.filter(l=>!l.pret&&l.jour!=='demain').length};
}
// Le médecin prescrit la sortie sur protocole (critères choisis) ; l'infirmière constate ; tout est horodaté.
function prescrire(sp,{par,criteres=CRITERES.map(c=>c.id),note=''}){
 const ids=criteres.filter(id=>CRITERES.some(c=>c.id===id));if(!ids.length)throw Error('Choisissez au moins un critère.');
 return {...sp,protocole:{par,at:new Date().toISOString(),criteres:ids,note},protocoleConstat:{},sortieAutorisee:null};
}
function constater(sp,id,ok,par){
 if(!sp?.protocole)throw Error('Aucun protocole de sortie prescrit.');if(!sp.protocole.criteres.includes(id))throw Error('Critère hors protocole.');
 return {...sp,protocoleConstat:{...(sp.protocoleConstat||{}),[id]:{ok:!!ok,par,at:new Date().toISOString()}}};
}
function autoriser(sp,par){
 if(!sp?.protocole)throw Error('Aucun protocole de sortie prescrit.');
 const manque=sp.protocole.criteres.filter(id=>!sp.protocoleConstat?.[id]?.ok);
 if(manque.length)throw Error('Critères non constatés : '+manque.map(id=>CRITERES.find(c=>c.id===id).libelle).join(' ; ')+'. Appelez le médecin.');
 return {...sp,sortieAutorisee:{par,at:new Date().toISOString(),protocole:sp.protocole.at}};
}
const MODES=['Proche','Taxi conventionné','VSL','Ambulance','Transport en commun'];
return {CRITERES,MODES,constats,etapes,tableau,prescrire,constater,autoriser,datePrevue};
});

/* IASELO · indicateurs agrégés « Activité & occupation » pour l'administration de la clinique.
   Fonctions pures, sans DOM ni réseau, utilisées par le serveur (worker/indicateurs.mjs) et testées
   dans tests/indicateurs.test.cjs. Le résultat ne contient que des nombres et des libellés de
   catégories : jamais de nom, de date de naissance, de numéro de séjour ni de motif médical. */
(function(root,factory){const api=factory(root.PlanningCore||(typeof require==='function'?require('./planning-core.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloIndicateurs=api;})(typeof self!=='undefined'?self:globalThis,function(P){
'use strict';
const ETAPES=['Consultation','Préopératoire','Intervention','SSPI','Hospitalisation','Sortie'];
const MODES=['Ambulatoire','Hospitalisation'];
// En dessous de ce seuil, une catégorie (spécialité, secteur) est regroupée dans « Autres » pour éviter
// qu'un petit effectif ne permette de reconnaître un patient.
const SEUIL=3;
const txt=v=>typeof v==='string'?v.trim().slice(0,80):'';
const pct=(a,b)=>b>0?Math.round(a*1000/b)/10:null;
function compter(list,key){const m=new Map();for(const x of list){const k=key(x);if(k)m.set(k,(m.get(k)||0)+1)}return m}
function regrouper(m,seuil=SEUIL){const out=[];let autres=0;for(const [label,n] of [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr')))if(n>=seuil)out.push({label,n});else autres+=n;if(autres)out.push({label:'Autres (effectifs < '+seuil+')',n:autres});return out}
const minutes=(a,b)=>Math.max(0,Math.round((Date.parse(b+'Z')-Date.parse(a+'Z'))/60000));
const jour=s=>typeof s==='string'?s.slice(0,10):'';
// stays : documents « core » ; reservations, resources, vacations : documents de gestion du planning.
// date : AAAA-MM-JJ ; now : AAAA-MM-JJTHH:MM (heure locale de l'établissement).
function calculer({stays=[],reservations=[],resources=[],vacations=[],date,now}){
 const sejours=stays.filter(s=>s&&typeof s==='object');
 const enCours=sejours.filter(s=>s.stage!=='Sortie');
 const parEtape=ETAPES.map(label=>({label,n:sejours.filter(s=>s.stage===label).length}));
 const autresEtapes=sejours.filter(s=>!ETAPES.includes(s.stage)).length;if(autresEtapes)parEtape.push({label:'Non renseignée',n:autresEtapes});
 const parMode=MODES.map(label=>({label,n:sejours.filter(s=>s.mode===label).length}));
 const ambu=parMode[0].n,totalMode=parMode[0].n+parMode[1].n;
 const kind=r=>P?P.kind(r):(r.kind||'bed');
 const res=(Array.isArray(resources)?resources:[]).filter(r=>r&&r.id);
 const byId=new Map(res.map(r=>[r.id,r]));
 const ouvertes=k=>res.filter(r=>kind(r)===k&&r.open!==false);
 const rows=(Array.isArray(reservations)?reservations:[]).filter(r=>r&&typeof r==='object');
 const actives=rows.filter(r=>P?P.active(r):!['Annulée','Terminée'].includes(r.state));
 // Bloc du jour : temps programmé dans les salles rapporté au temps de vacation ouvert.
 const salles=ouvertes('room');
 const vacJour=(Array.isArray(vacations)?vacations:[]).filter(v=>v&&v.state!=='Annulée'&&jour(v.start)===date&&byId.has(v.resource)&&kind(byId.get(v.resource))==='room');
 const ouvertMin=vacJour.reduce((t,v)=>t+minutes(v.start,v.end),0);
 const interventionsJour=rows.filter(r=>jour(r.start)===date&&byId.has(r.resource)&&kind(byId.get(r.resource))==='room');
 const programmees=interventionsJour.filter(r=>r.state!=='Annulée');
 const programmeMin=programmees.reduce((t,r)=>t+minutes(r.start,r.end),0);
 const terminees=programmees.filter(r=>r.state==='Terminée').length,enSalle=programmees.filter(r=>r.state==='Occupée'&&(P?P.currentResource(r):r.resource)===r.resource).length;
 // Lits et places de SSPI occupés maintenant (réservation en cours sur la ressource).
 function occupation(k){const places=ouvertes(k),ids=new Set(places.map(r=>r.id)),pris=new Set();
  for(const r of actives)for(const a of (P?P.allocations(r):[{resource:r.resource,start:r.start,end:r.end}]))if(ids.has(a.resource)&&a.start&&a.end&&a.start<=now&&now<a.end)pris.add(a.resource);
  return {places:places.length,occupees:pris.size,taux:pct(pris.size,places.length)}}
 return {
  date,genereA:now,
  sejours:{total:sejours.length,enCours:enCours.length,parEtape,parMode,tauxAmbulatoire:pct(ambu,totalMode),parSpecialite:regrouper(compter(sejours,s=>txt(s.specialty)||'Non renseignée')),parSecteur:regrouper(compter(enCours,s=>txt(s.sector)||'non-renseigne'))},
  bloc:{salles:salles.length,vacations:vacJour.length,minutesOuvertes:ouvertMin,interventions:programmees.length,minutesProgrammees:programmeMin,tauxOccupation:pct(programmeMin,ouvertMin),terminees,enSalle,annulees:interventionsJour.length-programmees.length},
  sspi:occupation('recovery'),
  lits:occupation('bed'),
  seuil:SEUIL
 };
}
return {ETAPES,MODES,SEUIL,calculer,regrouper};
});

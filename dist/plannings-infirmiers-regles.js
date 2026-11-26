/* IASELO · plannings de travail des infirmier(ère)s (26/11/2026, demande de Romain).
   Un planning = un service (bloc ou étage) et un mois. Le cadre le prépare (postes, horaires, gardes, astreintes,
   repos, absences), puis le valide. Les infirmier(ère)s le consultent en lecture seule, dans sa dernière version validée.
   Fonctions pures, utilisées par le serveur (worker/plannings-infirmiers.mjs) et l'écran (dist/plannings-infirmiers.js),
   testées dans tests/plannings-infirmiers.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloPlanningsInfirmiers=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const SERVICES={bloc:'Bloc opératoire',etage:'Étage (hospitalisation)'};
// travail : compte dans les heures et le repos ; prive : motif d'absence masqué aux collègues (RGPD).
const CODES={
 M:{label:'Matin',debut:'07:00',fin:'15:00',travail:true,ton:'jour'},
 J:{label:'Journée',debut:'08:00',fin:'18:00',travail:true,ton:'jour'},
 S:{label:'Soir',debut:'13:00',fin:'21:00',travail:true,ton:'soir'},
 N:{label:'Nuit',debut:'21:00',fin:'07:00',travail:true,ton:'nuit'},
 G:{label:'Garde 24 h',debut:'08:00',fin:'08:00',travail:true,ton:'garde'},
 A:{label:'Astreinte',debut:'18:00',fin:'08:00',travail:false,astreinte:true,ton:'astreinte'},
 F:{label:'Formation',debut:'09:00',fin:'17:00',travail:true,ton:'formation'},
 R:{label:'Repos',travail:false,ton:'repos'},
 CA:{label:'Congés annuels',travail:false,ton:'conge'},
 RTT:{label:'RTT',travail:false,ton:'conge'},
 MAL:{label:'Arrêt maladie',travail:false,prive:true,ton:'absence'},
 ABS:{label:'Absence',travail:false,ton:'absence'}
};
const ORDRE=['M','J','S','N','G','A','F','R','CA','RTT','MAL','ABS'];
const REPOS_MIN=11,HEURES_SEMAINE_MAX=48,JOURS_CONSECUTIFS_MAX=6;
const texte=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const heureOk=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes=h=>Number(h.slice(0,2))*60+Number(h.slice(3,5));
const moisOk=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
function joursDuMois(mois){const [a,m]=mois.split('-').map(Number),n=new Date(Date.UTC(a,m,0)).getUTCDate();return Array.from({length:n},(_,i)=>mois+'-'+String(i+1).padStart(2,'0'))}
const jourSemaine=d=>new Date(d+'T12:00:00Z').getUTCDay();
const weekEnd=d=>[0,6].includes(jourSemaine(d));
function moisVoisin(mois,delta){const [a,m]=mois.split('-').map(Number),d=new Date(Date.UTC(a,m-1+delta,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}
// Horaires effectifs d'une affectation (ceux saisis par le cadre, sinon ceux du code).
function horaires(a){const c=CODES[a?.code];if(!c||!c.debut)return null;const debut=heureOk(a.debut)?a.debut:c.debut,fin=heureOk(a.fin)?a.fin:c.fin;let duree=minutes(fin)-minutes(debut);if(duree<=0)duree+=1440;return {debut,fin,duree}}
const dureeHeures=a=>{const h=horaires(a);return h&&CODES[a.code].travail?h.duree/60:0};

// Nettoyage du planning reçu : personnes (au plus 80) et affectations limitées aux jours du mois et aux codes connus.
function normaliser(planning,mois){
 const jours=new Set(moisOk(mois)?joursDuMois(mois):[]),p=planning&&typeof planning==='object'?planning:{},vus=new Set();
 const personnes=(Array.isArray(p.personnes)?p.personnes:[]).slice(0,80).map(x=>({id:texte(x?.id,60),nom:texte(x?.nom,80),fonction:texte(x?.fonction,60),userId:texte(x?.userId,80)||null})).filter(x=>x.id&&x.nom&&/^[A-Za-z0-9_-]+$/.test(x.id)&&!vus.has(x.id)&&vus.add(x.id));
 const ids=new Set(personnes.map(x=>x.id)),affectations={};
 for(const [id,ligne] of Object.entries(p.affectations&&typeof p.affectations==='object'?p.affectations:{})){
  if(!ids.has(id)||!ligne||typeof ligne!=='object')continue;const out={};
  for(const [jour,a] of Object.entries(ligne)){if(!jours.has(jour)||!a||!Object.hasOwn(CODES,a.code))continue;const e={code:a.code};
   if(CODES[a.code].debut){if(heureOk(a.debut)&&a.debut!==CODES[a.code].debut)e.debut=a.debut;if(heureOk(a.fin)&&a.fin!==CODES[a.code].fin)e.fin=a.fin}
   const note=texte(a.note,120);if(note)e.note=note;out[jour]=e}
  if(Object.keys(out).length)affectations[id]=out}
 return {personnes,affectations};
}
function valider(planning,mois){
 const errors=[];if(!moisOk(mois))errors.push('Mois invalide (AAAA-MM).');
 const n=normaliser(planning,mois);if(!n.personnes.length)errors.push('Ajoutez au moins une personne au planning.');
 const comptes=new Set();for(const x of n.personnes)if(x.userId){if(comptes.has(x.userId))errors.push('« '+x.nom+' » figure deux fois au planning.');comptes.add(x.userId)}
 return {ok:!errors.length,errors,planning:n};
}
// Empreinte stable (clés triées) : sert à l'empreinte SHA-256 de chaque version et à détecter « rien n'a changé ».
function canonique(planning){const tri=v=>Array.isArray(v)?v.map(tri):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,tri(v[k])])):v;return JSON.stringify(tri(planning))}

// Contrôles du droit du travail et de la sécurité des soins (alertes non bloquantes ; une validation avec alertes exige un motif).
//  - repos quotidien d'au moins 11 h entre deux postes ; - au plus 48 h de travail par semaine civile ;
//  - au plus 6 jours travaillés consécutifs. Une garde de 24 h ou une nuit suivie d'un poste le lendemain est donc signalée.
function alertes(planning,mois){
 const n=normaliser(planning,mois),jours=moisOk(mois)?joursDuMois(mois):[],out=[];
 const fmt=d=>d.slice(8,10)+'/'+d.slice(5,7);
 for(const pers of n.personnes){
  const ligne=n.affectations[pers.id]||{},postes=[];
  for(const d of jours){const a=ligne[d],h=a&&CODES[a.code].travail&&horaires(a);if(h){const debut=Date.parse(d+'T'+h.debut+':00Z');postes.push({jour:d,code:a.code,debut,fin:debut+h.duree*60000})}}
  for(let i=1;i<postes.length;i++){const repos=(postes[i].debut-postes[i-1].fin)/3600000;
   if(repos<REPOS_MIN)out.push({personne:pers.id,nom:pers.nom,jour:postes[i].jour,type:'repos',message:pers.nom+' : '+(repos<0?'postes qui se chevauchent':'repos de '+Math.max(0,Math.round(repos*10)/10).toString().replace('.',',')+' h seulement')+' avant le poste du '+fmt(postes[i].jour)+' (11 h au moins).'})}
  const semaines={};for(const p of postes){const d=new Date(p.jour+'T12:00:00Z'),lundi=new Date(d-((d.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10);semaines[lundi]=(semaines[lundi]||0)+(p.fin-p.debut)/3600000}
  for(const [lundi,h] of Object.entries(semaines))if(h>HEURES_SEMAINE_MAX)out.push({personne:pers.id,nom:pers.nom,jour:lundi<jours[0]?jours[0]:lundi,type:'heures',message:pers.nom+' : '+Math.round(h)+' h la semaine du '+fmt(lundi)+' (48 h au plus).'});
  let suite=0;for(const d of jours){const a=ligne[d];if(a&&CODES[a.code].travail){suite++;if(suite===JOURS_CONSECUTIFS_MAX+1)out.push({personne:pers.id,nom:pers.nom,jour:d,type:'consecutifs',message:pers.nom+' : plus de 6 jours de travail d’affilée (jusqu’au '+fmt(d)+').'})}else suite=0}
 }
 return out;
}
// Effectif au travail par jour et par code (aide à la couverture du service).
function effectifs(planning,mois){const n=normaliser(planning,mois),out={};for(const d of moisOk(mois)?joursDuMois(mois):[]){const e={total:0};for(const p of n.personnes){const a=n.affectations[p.id]?.[d];if(a&&CODES[a.code].travail){e.total++;e[a.code]=(e[a.code]||0)+1}}out[d]=e}return out}
function heuresParPersonne(planning,mois){const n=normaliser(planning,mois),out={};for(const p of n.personnes)out[p.id]=Object.values(n.affectations[p.id]||{}).reduce((s,a)=>s+dureeHeures(a),0);return out}
// Vue des collègues (RGPD, minimisation) : le motif d'une absence de santé et les remarques personnelles ne sont montrés
// qu'à la personne concernée et au cadre. Les collègues voient « Absence ».
function vueCollegue(planning,userId){
 const out={personnes:planning.personnes,affectations:{}};
 for(const p of planning.personnes){const ligne=planning.affectations[p.id]||{},moi=!!userId&&p.userId===userId;
  out.affectations[p.id]=Object.fromEntries(Object.entries(ligne).map(([d,a])=>[d,moi?a:CODES[a.code]?.prive?{code:'ABS'}:(({note,...r})=>r)(a)]))}
 return out;
}
// Différences entre deux versions (historique lisible par le cadre).
function differences(avant,apres,mois){
 const a=normaliser(avant,mois),b=normaliser(apres,mois),out=[],nom=id=>(b.personnes.find(p=>p.id===id)||a.personnes.find(p=>p.id===id))?.nom||id;
 for(const p of b.personnes)if(!a.personnes.some(x=>x.id===p.id))out.push('+ '+p.nom+' ajouté(e)');
 for(const p of a.personnes)if(!b.personnes.some(x=>x.id===p.id))out.push('− '+p.nom+' retiré(e)');
 const lib=e=>e?e.code+(e.debut||e.fin?' '+(horaires(e)?.debut||'')+'-'+(horaires(e)?.fin||''):''):'vide';
 for(const id of new Set([...Object.keys(a.affectations),...Object.keys(b.affectations)])){if(!b.personnes.some(p=>p.id===id))continue;
  for(const d of joursDuMois(mois)){const x=a.affectations[id]?.[d],y=b.affectations[id]?.[d];if(canonique(x||null)!==canonique(y||null))out.push(nom(id)+' · '+d.slice(8,10)+'/'+d.slice(5,7)+' : '+lib(x)+' → '+lib(y))}}
 return out;
}
return {SERVICES,CODES,ORDRE,REPOS_MIN,HEURES_SEMAINE_MAX,moisOk,joursDuMois,jourSemaine,weekEnd,moisVoisin,horaires,dureeHeures,normaliser,valider,canonique,alertes,effectifs,heuresParPersonne,vueCollegue,differences};
});

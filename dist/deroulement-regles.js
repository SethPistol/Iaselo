/* Déroulement du programme opératoire (26/11/2026, demande de Romain, sur le modèle de l'écran du bloc de la clinique).
   Étapes du patient au bloc : arrivée au bloc → entrée en salle → sortie de salle → sortie de bloc.
   Chaque étape est horodatée dans la réservation (champ etapes) et fait avancer l'état du programme
   (Réservée → Occupée en salle → SSPI / lit → Terminée). Une étape peut être annulée (erreur de clic) :
   l'état d'avant est restauré, la trace reste dans transitions. */
(function(root){
'use strict';
const ETAPES=[['arrivee','Arrivée au bloc'],['entree','Entrée en salle'],['sortie','Sortie de salle'],['sortieBloc','Sortie de bloc']];
const CLES=ETAPES.map(([k])=>k);
const libelle=k=>(ETAPES.find(([x])=>x===k)||[,''])[1];
// Champs qu'une infirmière de bloc peut modifier dans le programme : uniquement le déroulement.
const CHAMPS_DEROULEMENT=['etapes','state','phase','actualStart','actualEnd','transitions'];
const addMinutes=(s,n)=>{const d=new Date(s+'Z');d.setUTCMinutes(d.getUTCMinutes()+Number(n));return d.toISOString().slice(0,16)};
const minutes=(a,b)=>Math.round((Date.parse(b+'Z')-Date.parse(a+'Z'))/60000);

// Étapes connues, y compris pour les passages enregistrés avant cet écran (actualStart / actualEnd / phase).
function etapes(r){
 const e={...(r&&r.etapes&&typeof r.etapes==='object'?r.etapes:{})};
 if(!r)return e;
 if(r.state==='Occupée'||r.state==='Terminée'){if(!e.entree&&r.actualStart)e.entree=r.actualStart;if(!e.arrivee&&e.entree)e.arrivee=e.entree}
 if(r.state==='Occupée'&&(r.phase||'primary')!=='primary'&&!e.sortie&&r.actualEnd)e.sortie=r.actualEnd;
 if(r.state==='Terminée'){if(!e.sortie&&r.actualEnd)e.sortie=r.actualEnd;if(!e.sortieBloc&&e.sortie)e.sortieBloc=e.sortie}
 return e;
}
function etapeCourante(r){const e=etapes(r);let k='';for(const c of CLES)if(e[c])k=c;return k}
function prochaine(r){if(!r||['Annulée'].includes(r.state))return '';const k=etapeCourante(r),i=CLES.indexOf(k);return i<CLES.length-1?CLES[i+1]:''}
// Statut affiché (couleur) : non confirmé (annonce), programmé, puis chaque étape franchie.
function statut(r){if(r&&r.proposition)return 'nonConfirme';if(r?.state==='Annulée')return 'annule';return etapeCourante(r)||'programme'}
const STATUTS={programme:'Programmé',nonConfirme:'Patient non confirmé',arrivee:'Arrivé au bloc',entree:'En salle',sortie:'Sorti de salle',sortieBloc:'Sorti du bloc',annule:'Annulé'};

/* Applique une étape (horodatée `at`) : renvoie une nouvelle réservation, ou {error}. */
function appliquer(r,etape,at,compte=''){
 if(!CLES.includes(etape))return {error:'Étape inconnue.'};
 if(prochaine(r)!==etape)return {error:'Étape attendue : '+(libelle(prochaine(r))||'aucune')+'.'};
 const e=etapes(r),avant={state:r.state,phase:r.phase,actualStart:r.actualStart,actualEnd:r.actualEnd,etapes:r.etapes};
 const prec=e[CLES[CLES.indexOf(etape)-1]];if(prec&&at<prec)return {error:'L’heure doit suivre l’étape précédente ('+prec.slice(11,16)+').'};
 const n={...r,etapes:{...e,[etape]:at}};
 if(etape==='entree'){n.state='Occupée';n.phase='primary';n.actualStart=at}
 if(etape==='sortie'){n.actualEnd=at;if(r.recovery?.resource){n.state='Occupée';n.phase='recovery'}else if(r.bed?.resource){n.state='Occupée';n.phase='bed'}else n.state='Terminée'}
 if(etape==='sortieBloc'){if(n.state==='Occupée'&&n.phase==='recovery'){if(r.bed?.resource)n.phase='bed';else n.state='Terminée'}}
 n.transitions=[...(Array.isArray(r.transitions)?r.transitions:[]),{action:'etape:'+etape,at,account:compte,avant}];
 return {reservation:n};
}
/* Annule la dernière étape franchie (erreur de saisie) : état d'avant restauré. */
function annuler(r,at,compte=''){
 const t=[...(Array.isArray(r.transitions)?r.transitions:[])].reverse().find(x=>String(x.action).startsWith('etape:')&&!x.annulee);
 if(!t||etapeCourante(r)!==t.action.slice(6))return {error:'Aucune étape à annuler.'};
 const n={...r};for(const k of ['state','phase','actualStart','actualEnd','etapes']){if(t.avant?.[k]===undefined)delete n[k];else n[k]=t.avant[k]}
 n.transitions=[...r.transitions.map(x=>x===t?{...x,annulee:at}:x),{action:'annulation:'+t.action.slice(6),at,account:compte}];
 return {reservation:n};
}
// Fin prévue de l'intervention (hors remise en état).
const finPrevue=r=>r.duration?addMinutes(r.start,r.duration):r.end;
/* Retard (minutes) : patient pas encore entré à l'heure prévue, ou intervention qui dépasse sa durée prévue. */
function retard(r,now){
 if(!now||!r||r.proposition||r.state==='Annulée')return 0;const e=etapes(r);
 if(!e.entree)return r.start<now?minutes(r.start,now):0;
 const prevue=r.duration||minutes(r.start,r.end);
 if(!e.sortie){const d=minutes(e.entree,now)-prevue;return d>0?d:0}
 return 0;
}
// Écart entre heure réelle et heure prévue d'entrée en salle (positif = en retard).
function ecartEntree(r){const e=etapes(r);return e.entree?minutes(r.start,e.entree):null}
// Intervalle réellement occupé en salle (pour la frise) ; null si pas encore entré.
function reel(r,now){const e=etapes(r);if(!e.entree)return null;const fin=e.sortie||(now&&now>e.entree?now:e.entree);return {start:e.entree,end:fin,enCours:!e.sortie}}

/* Contrôle serveur : l'infirmière de bloc ne modifie que le déroulement des passages existants de son périmètre. */
function deroulementSeulement(old,data,inScope){
 if(!Array.isArray(data))return false;const avant=new Map((Array.isArray(old)?old:[]).map(r=>[r?.id,r]));
 const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const sans=r=>Object.fromEntries(Object.entries(r||{}).filter(([k])=>!CHAMPS_DEROULEMENT.includes(k)));
 const ids=new Set();
 for(const r of data){
  const o=avant.get(r?.id);if(!o)return false;ids.add(r.id);
  if(stable(sans(o))!==stable(sans(r)))return false;
  if(r.state!==o.state&&(!['Réservée','Occupée','Terminée'].includes(r.state)||o.state==='Annulée'))return false;
  if(r.etapes!==undefined&&(typeof r.etapes!=='object'||Array.isArray(r.etapes)||Object.keys(r.etapes).some(k=>!CLES.includes(k))))return false;
 }
 for(const o of avant.values())if(inScope(o)&&!ids.has(o.id))return false;
 return true;
}
const api={ETAPES,CLES,STATUTS,CHAMPS_DEROULEMENT,libelle,etapes,etapeCourante,prochaine,statut,appliquer,annuler,retard,ecartEntree,reel,finPrevue,deroulementSeulement,minutes,addMinutes};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IaseloDeroulement=api;
})(typeof window!=='undefined'?window:globalThis);

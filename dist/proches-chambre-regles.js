/* IASELO · information des proches et écran en chambre (27/11/2026, 4e veille, lot C). Règles pures, sans réseau.
   Proches : avec l'accord du patient (recueilli et tracé), 1 ou 2 proches reçoivent un SMS à chaque étape choisie
   (entrée au bloc, salle de réveil, retour en chambre, sortie). Les SMS ne contiennent AUCUNE donnée médicale :
   ni intervention, ni diagnostic, ni état de santé, seulement l'étape et l'heure.
   Écran en chambre : ce que le patient voit sur la tablette de sa chambre (sa journée, sa sortie, ses consignes)
   et les demandes non urgentes qu'il peut faire à l'équipe (la sonnette reste le moyen d'appel urgent). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloProches=api})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const t=v=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim():'';
const ETAPES=[
 {id:'arrivee',libelle:'Arrivée à la clinique',auto:true},
 {id:'bloc',libelle:'Entrée au bloc opératoire',auto:true},
 {id:'reveil',libelle:'Arrivée en salle de réveil',auto:true},
 {id:'chambre',libelle:'Retour en chambre',auto:true},
 {id:'sortie',libelle:'Sortie prévue (heure)',auto:true},
 {id:'attente',libelle:'Étape plus longue que prévu (envoi manuel)',auto:false}
];
// Étape annoncée selon l'étape du séjour (« Intervention » = au bloc).
function etapeDepuisStage(stage){return {Intervention:'bloc',SSPI:'reveil',Hospitalisation:'chambre'}[stage]||''}
const hm=h=>{const m=/^(\d{1,2})[:h ]?(\d{2})?/.exec(String(h||''));return m?Number(m[1])+' h '+(m[2]||'00'):''};
// Texte du SMS : établissement, appellation choisie par le patient, étape, heure. Rien d'autre.
function message(etab,appellation,etape,{heure=''}={}){
 const qui=t(appellation)||'votre proche',e=etab||'La clinique',h=hm(heure);
 const corps={arrivee:'arrivée à la clinique'+(h?' à '+h:''),bloc:'entrée au bloc opératoire'+(h?' à '+h:''),reveil:'arrivée en salle de réveil'+(h?' à '+h:''),chambre:'retour en chambre'+(h?' à '+h:'')+'. Les visites sont possibles aux horaires du service',
  sortie:'la sortie est prévue aujourd’hui'+(h?' vers '+h:''),attente:'l’étape en cours prend plus de temps que prévu, un nouveau message suivra'}[etape];
 if(!corps)throw Error('Étape inconnue.');
 return e+' · Nouvelles de '+qui+' : '+corps+'. Message automatique, ne pas répondre.';
}
function normaliserPortable(v){const d=String(v||'').replace(/[\s.\-()]/g,'').replace(/^\+33/,'0').replace(/^0033/,'0');return /^0[67]\d{8}$/.test(d)?d:''}
const masquer=n=>{n=String(n||'');return n.length===10?n.slice(0,2)+' ** ** ** '+n.slice(8):'***'};
// Accord du patient et proches à prévenir.
function valider(d={},{prenomPatient=''}={}){
 const errors=[];
 if(d.accord!==true)errors.push('L’accord du patient est requis.');
 const proches=(Array.isArray(d.proches)?d.proches:[]).map(p=>({prenom:t(p?.prenom).slice(0,40),telephone:normaliserPortable(p?.telephone)})).filter(p=>p.prenom||p.telephone);
 if(!proches.length)errors.push('Indiquez au moins un proche.');if(proches.length>2)errors.push('Deux proches au plus.');
 proches.forEach((p,i)=>{if(!p.prenom)errors.push('Prénom du proche '+(i+1)+' manquant.');if(!p.telephone)errors.push('Portable du proche '+(i+1)+' invalide (06 ou 07).')});
 const appel=d.appellation==='neutre'?'votre proche':d.appellation==='autre'?t(d.appellationTexte).slice(0,30):t(prenomPatient).slice(0,30)||'votre proche';
 if(d.appellation==='autre'&&!appel)errors.push('Indiquez comment nommer le patient dans le SMS.');
 const etapes=(Array.isArray(d.etapes)?d.etapes:ETAPES.filter(e=>e.auto).map(e=>e.id)).filter(id=>ETAPES.some(e=>e.id===id&&e.auto));
 return {ok:!errors.length,errors,data:{proches,appellation:appel,mode:['neutre','autre'].includes(d.appellation)?d.appellation:'prenom',etapes}};
}
/* ---------- Écran en chambre ---------- */
const DEMANDES=[
 {id:'aide',libelle:'J’ai besoin d’aide'},
 {id:'douleur',libelle:'J’ai mal'},
 {id:'boire',libelle:'J’ai soif'},
 {id:'toilettes',libelle:'Aller aux toilettes'},
 {id:'autre',libelle:'Autre demande'}
];
function validerDemande(d={}){
 const type=DEMANDES.some(x=>x.id===d.type)?d.type:'';if(!type)return {ok:false,error:'Demande inconnue.'};
 let valeur=null;if(type==='douleur'){valeur=Number(d.valeur);if(!Number.isInteger(valeur)||valeur<0||valeur>10)return {ok:false,error:'Choisissez un chiffre de 0 à 10.'}}
 const texte=t(d.texte).slice(0,140);if(type==='autre'&&texte.length<2)return {ok:false,error:'Écrivez votre demande.'};
 return {ok:true,demande:{type,valeur,texte,libelle:DEMANDES.find(x=>x.id===type).libelle}};
}
// Priorité de la demande pour l'équipe : douleur ≥ 7 ou « besoin d'aide » en tête.
const priorite=d=>d.type==='douleur'?(d.valeur>=7?'crit':d.valeur>=4?'warn':'info'):d.type==='aide'?'warn':'info';
const ETAPES_PATIENT={date:'Date de sortie',clinique:'Accord du médecin pour la sortie',ordonnance:'Ordonnance de sortie',liaison:'Courrier pour votre médecin',consignes:'Consignes pour le retour à domicile',transport:'Retour à domicile'};
// Ce que voit le patient : sa journée, sa sortie et ce qui reste à faire (sans détail médical ni nom des soignants).
function vueChambre({core={},sortiePlus={},discharge={}}={},{etapesSortie=null,aujourdhui=''}={}){
 const id=core.identity||{},tr=sortiePlus.transport||{};
 const consignes=discharge.validated||discharge.liaison?.document?t(discharge.instructions):'';
 return {prenom:t(id.firstName),chambre:t(sortiePlus.chambre),etape:{Intervention:'Au bloc opératoire',SSPI:'En salle de réveil',Hospitalisation:'Dans votre chambre',Sortie:'Sortie'}[core.stage]||'',
  sortie:{date:t(sortiePlus.sortiePrevue)||(core.mode==='Ambulatoire'?aujourdhui:''),heure:t(tr.heure),mode:t(tr.mode),accompagnant:!!t(tr.accompagnant)},
  aFaire:(etapesSortie||[]).map(e=>({libelle:ETAPES_PATIENT[e.id]||e.libelle,ok:!!e.ok})),consignes};
}
return {ETAPES,DEMANDES,etapeDepuisStage,message,normaliserPortable,masquer,valider,validerDemande,priorite,vueChambre};
});

/* IASELO · ouverture des salles d'opération : vérifications quotidiennes avant le premier patient.
   Deux parties signées séparément : l'infirmier(ère) de bloc vérifie la salle, l'anesthésiste vérifie
   le poste d'anesthésie. Fonctions pures, utilisées par le serveur (worker/ouverture-salles.mjs) et
   l'écran (dist/ouverture-salles.js), testées dans tests/ouverture-salles.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloOuvertureSalles=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const PARTIES={
 infirmier:{label:'Partie infirmière',metier:'infirmier',items:[
  ['traitementAir','Traitement d’air'],['environnement','Environnement'],['fluides','Fluides médicaux'],['eclairage','Éclairage'],['negatoscope','Négatoscope'],['tableOperation','Table d’opération'],['bistouri','Bistouri électrique'],['equipementSpecifique','Équipement spécifique']]},
 anesthesie:{label:'Partie anesthésie',metier:'anesthesiste',items:[
  ['manometres','Pression des manomètres à gaz'],['alarmes','Alarmes'],['tuyauxPatient','Tuyaux patient'],['respirateur','Fonctionnement du respirateur'],['etancheite','Étanchéité du circuit'],['accessoires','Accessoires'],['debitmetres','Débitmètres'],['coupureN2O','Coupure automatique du N2O'],['circuitAuxiliaire','Circuit auxiliaire'],['vaporisateur','Vaporisateur'],['aspiration','Système d’aspiration'],['modules','Modules'],['intubation','Matériel d’intubation'],['tableOperation','Table d’opération']]}
};
const ETATS={conforme:'Conforme','non-conforme':'Non conforme','sans-objet':'Sans objet'};
const CONCLUSIONS={operationnelle:'Salle opérationnelle','non-operationnelle':'Salle non opérationnelle'};
const texte=v=>typeof v==='string'?v.trim():'';
// Contrôle d'une partie avant signature. Renvoie '' si valide, sinon le message à afficher.
function erreur(part,saisie){
 const p=PARTIES[part];if(!p)return 'Partie inconnue.';
 const items=saisie&&typeof saisie.items==='object'&&!Array.isArray(saisie.items)?saisie.items:{};
 const manquants=p.items.filter(([k])=>!Object.hasOwn(ETATS,items[k]));
 if(manquants.length)return 'Vérification incomplète : '+manquants.map(([,l])=>l).join(', ')+'.';
 if(Object.keys(items).some(k=>!p.items.some(([x])=>x===k)))return 'Élément de vérification inconnu.';
 if(!Object.hasOwn(CONCLUSIONS,saisie.conclusion))return 'Indiquez si la salle est opérationnelle.';
 const ko=p.items.filter(([k])=>items[k]==='non-conforme');
 const commentaire=texte(saisie.comment);
 if(commentaire.length>2000)return 'Commentaire trop long (2 000 caractères au plus).';
 if(ko.length&&commentaire.length<3)return 'Décrivez le défaut et la mesure prise dans le commentaire ('+ko.map(([,l])=>l).join(', ')+').';
 if(saisie.conclusion==='non-operationnelle'&&commentaire.length<3)return 'Précisez pourquoi la salle n’est pas opérationnelle.';
 return '';
}
// État d'une salle pour une journée, à partir des signatures (la plus récente de chaque partie compte).
function etatSalle(records,room){
 const dernier=part=>records.filter(r=>r.room===room&&r.part===part).sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0]||null;
 const inf=dernier('infirmier'),ane=dernier('anesthesie');
 const ko=[inf,ane].some(r=>r&&r.conclusion==='non-operationnelle');
 const code=ko?'non-operationnelle':inf&&ane?'ouverte':inf||ane?'partielle':'a-faire';
 return {code,label:{ouverte:'Salle ouverte','non-operationnelle':'Salle non opérationnelle',partielle:'Ouverture en cours','a-faire':'À ouvrir'}[code],infirmier:inf,anesthesie:ane};
}
function resume(records,rooms){const etats=rooms.map(r=>({room:r,...etatSalle(records,r.id)}));return {etats,ouvertes:etats.filter(e=>e.code==='ouverte').length,bloquees:etats.filter(e=>e.code==='non-operationnelle').length,total:rooms.length}}
return {PARTIES,ETATS,CONCLUSIONS,erreur,etatSalle,resume};
});

/* IASELO · messagerie patient ↔ équipe : assistant du patient (règles), réponses types, notification sans donnée de santé.
   - assistant(texte) : repère les signes d'urgence (→ 15 tout de suite) et propose les fiches de conseils du parcours
     qui correspondent à la question, en attendant la réponse de l'équipe. Ne pose aucun diagnostic. À RELIRE PAR L'ÉQUIPE.
   - REPONSES : réponses types pour l'équipe ; notification() : SMS / e-mail générique avec le lien personnel. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./parcours-suivi-regles.js'):root.IaseloParcoursSuivi);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloMessagerie=api;})(typeof self!=='undefined'?self:this,function(P){
'use strict';
const plie=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// Signes d'urgence : le patient est invité à appeler le 15 immédiatement (le message part aussi à l'équipe, signalé).
const URGENCES=[
 [/(douleur|serre|oppress)\w*.{0,20}(poitrine|thorax|thoracique)|poitrine.{0,15}(douleur|serre|mal)/,'douleur dans la poitrine','une douleur dans la poitrine'],
 [/(respir|souffle|essouffl|etouff)/,'gêne pour respirer','une gêne pour respirer'],
 [/(saign|hemorrag|sang)\w*.{0,25}(beaucoup|abondant|arrete pas|imbib|coule)|pansement.{0,20}(rempli|imbib).{0,10}sang/,'saignement important','un saignement important'],
 [/(malaise|evanoui|perte de connaissance|inconscien|convuls)/,'malaise','un malaise'],
 [/(paralys|ne sens plus|engourdi.{0,20}(visage|bras)|bouche de travers|parle mal)/,'signe neurologique','un signe neurologique (paralysie, trouble de la parole)'],
 [/(idees? noires|suicid|me tuer|en finir)/,'détresse','une détresse']
];
const THEMES=[
 [/(jeun|manger|boire|repas|cafe|chewing)/,'veille'],[/(douche|savon|bijou|vernis|maquill|raser|rasage|apporter|carte vitale)/,'veille'],
 [/(douleur|\bmal\b|antalgi|doliprane|paracetamol|calmant|glace)/,'douleur'],[/(fievre|temperature|cicatri|rouge|gonfl|ecoul|pansement|mollet)/,'alerte'],
 [/(marcher|kine|exercice|bas de contention|piqure|injection|conduire|porter)/,'reeducation'],[/(transit|selles|gaz|ventre|vomi|nause|aliment)/,'alimentation'],
 [/(preparer|tabac|fumer|alcool|accompagnant|retour a domicile)/,'preparer']
];
function assistant(texte){
 const s=plie(texte),u=URGENCES.find(([re])=>re.test(s));
 const ids=[...new Set(THEMES.filter(([re])=>re.test(s)).map(([,id])=>id))].slice(0,2);
 return {urgence:u?{signe:u[1],texte:'Votre message évoque '+u[2]+'. N’attendez pas la réponse de l’équipe : appelez le 15 (ou le 112) maintenant.'}:null,
  fiches:ids.map(id=>({id,titre:P?.FICHES?.[id]?.titre||id,resume:P?.FICHES?.[id]?.resume||'',sections:P?.FICHES?.[id]?.sections||[]})),
  accuse:'Votre message est transmis à votre équipe, qui vous répond aux heures ouvrables. Ce service n’est pas lu la nuit ni le week-end.'};
}
const REPONSES=[
 ['Bien reçu','Bonjour, nous avons bien reçu votre message. Un membre de l’équipe vous rappelle dans la journée.'],
 ['Rappel téléphonique','Bonjour, pouvez-vous nous indiquer un créneau où vous êtes joignable par téléphone ? Nous vous rappellerons.'],
 ['Venir consulter','Bonjour, au vu de votre message, nous souhaitons vous revoir. Merci d’appeler le secrétariat pour fixer un rendez-vous rapidement.'],
 ['Continuer le traitement','Bonjour, ce que vous décrivez est habituel après ce type d’intervention. Poursuivez le traitement prescrit et n’hésitez pas à nous réécrire si cela ne s’améliore pas.']
];
function notification(etablissement,lien,motif){
 const etab=etablissement||'La clinique';
 return motif==='ouverture'
  ?etab+' : votre équipe vous ouvre une messagerie sécurisée pour vos questions : '+lien+' (votre date de naissance vous sera demandée). En cas d’urgence, appelez le 15.'
  :etab+' : vous avez un nouveau message de votre équipe : '+lien+' (votre date de naissance vous sera demandée). En cas d’urgence, appelez le 15.';
}
return {assistant,REPONSES,notification,URGENCES};
});

/* IASELO · transmission du codage (25/11/2026, demande de Romain) : une fois les actes codés et confirmés dans
   l'onglet « Codage PMSI » du dossier, le médecin (ou le DIM) les transmet au service qui en a besoin : secrétariat,
   accueil, facturation, DIM ou un autre service. Le service destinataire marque la transmission comme traitée ou
   la renvoie pour correction. Fonctions pures, utilisées par le serveur (worker/codage-transmis.mjs) et l'écran
   (dist/codage-transmis.js), testées dans tests/codage-transmis.test.cjs.
   Minimisation : une transmission ne contient que l'identité du patient, les dates et les actes (codes CCAM) ;
   jamais les diagnostics, la classe ASA ni le compte rendu. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCodageTransmis=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
// Services destinataires et métiers des comptes qui les reçoivent (l'accueil est tenu par les comptes du secrétariat).
const SERVICES={
 secretariat:{label:'Secrétariat',metiers:['secretariat']},
 accueil:{label:'Accueil',metiers:['secretariat']},
 facturation:{label:'Facturation',metiers:['facturation']},
 dim:{label:'DIM',metiers:['dim']},
 autre:{label:'Autre service',metiers:['administration']}
};
const CODEURS=['anesthesiste','chirurgien','dim'];
const ETATS={transmis:'Transmis','a-corriger':'À corriger',traite:'Traité',remplace:'Remplacé'};
const ACTIVITES={'1':'Acte (chirurgien)','4':'Anesthésie'};
const texte=(v,n=1000)=>typeof v==='string'?v.trim().slice(0,n):'';
// Services ouverts au métier d'un compte.
function servicesDe(job){return Object.keys(SERVICES).filter(k=>SERVICES[k].metiers.includes(job))}
// Actes confirmés du codage du séjour (stay/<id>/codage), avec la décision du DIM s'il y en a une.
// cc : règles du codage CCAM (dist/codage-ccam-regles.js) et ix : index CCAM ; sans elles, ancien format seulement.
function actesConfirmes(codage,cc,ix){
 if(cc)return cc.lignesFacturables(codage||{},ix).filter(x=>x.confirme).map(x=>({cle:x.cle,code:x.code,libelle:texte(x.libelle,300),activite:x.activite,confirmePar:texte(x.by,160),confirmeLe:x.at||'',dim:texte(x.dim,20),modificateurs:x.modificateurs||'',association:x.association||'',montant:x.montant??null,complement:!!x.complement}));
 return actesAncien(codage);
}
function actesAncien(codage){
 const actes=codage&&typeof codage.actes==='object'?codage.actes:{},dec=codage&&typeof codage.decisions==='object'?codage.decisions:{};
 return Object.entries(actes).filter(([,x])=>x&&x.confirme&&/^[A-Z]{4}\d{3}$/.test(String(x.code||'').toUpperCase())).map(([k,x])=>({cle:k,code:String(x.code).toUpperCase(),libelle:texte(x.libelle,300),activite:k==='anes'?'4':'1',confirmePar:texte(x.by,160),confirmeLe:x.at||'',dim:texte(dec['acte:'+k]?.decision,20)}));
}
// Contrôle d'une demande de transmission. Renvoie '' si valide, sinon le message.
function erreur(demande,actes){
 const d=demande||{},dest=Array.isArray(d.destinataires)?d.destinataires:[];
 if(!dest.length)return 'Choisissez au moins un service destinataire.';
 if(dest.some(s=>!Object.hasOwn(SERVICES,s)))return 'Service destinataire inconnu.';
 if(new Set(dest).size!==dest.length)return 'Service destinataire en double.';
 if(dest.includes('autre')&&texte(d.autre,120).length<2)return 'Précisez le nom de l’autre service.';
 if(!actes||!actes.length)return 'Aucun acte confirmé : confirmez d’abord les actes dans le codage.';
 if(actes.some(a=>a.dim==='Rejeté'))return 'Un acte a été rejeté par le DIM : corrigez le codage avant de le transmettre.';
 if(texte(d.note,2000).length>1000)return 'Note trop longue (1 000 caractères au plus).';
 return '';
}
// État global d'une transmission à partir de l'état de chaque service.
function etatGlobal(services){
 const l=Object.values(services||{});if(!l.length)return 'transmis';
 if(l.some(s=>s.etat==='a-corriger'))return 'a-corriger';
 return l.every(s=>s.etat==='traite')?'traite':'transmis';
}
// Libellé d'un service, avec le nom donné pour « Autre service ».
function libelleService(k,autre){return k==='autre'&&autre?'Autre : '+autre:(SERVICES[k]?.label||k)}
return {SERVICES,CODEURS,ETATS,ACTIVITES,servicesDe,actesConfirmes,erreur,etatGlobal,libelleService};
});

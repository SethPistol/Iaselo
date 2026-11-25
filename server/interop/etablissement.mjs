// IASELO · connecteurs propres à l'établissement (ajoutés le 25/11/2026) :
//   LABO       résultats de biologie reçus (HL7 ORU^R01 ou HPRIM Santé) sur POST /api/interop/entrant/biologie ;
//   GAM        logiciel administratif (gestion administrative des malades) : mouvements ADT reçus
//              sur /api/interop/entrant/adt, actes CCAM envoyés en DFT^P03 vers INTEROP_GAM_URL ;
//   MONITEURS  passerelle des moniteurs et respirateurs (ORU^R01, codes MDC) sur /api/interop/entrant/moniteur ;
//   COURRIERS  documents reçus (passerelle MSSanté de l'établissement, scanner) sur /api/interop/entrant/courrier ;
//   EFS        commandes de produits sanguins (logiciel de l'EFS ou du dépôt de sang) vers INTEROP_EFS_URL ;
//   SESAM      feuilles de soins électroniques des praticiens libéraux, via un logiciel agréé SESAM-Vitale (INTEROP_SESAM_URL) ;
//   PMSI, FACTURATION, ADRI, ROC  transmission à l'Assurance maladie (25/11/2026, voir docs/assurance-maladie.md) ;
//   PAIEMENT   paiement en ligne (Stripe Checkout : INTEROP_PAIEMENT_STRIPE_KEY, INTEROP_PAIEMENT_WEBHOOK_SECRET).
// Mode par INTEROP_<ID>_MODE = simulation (défaut) | test | production, comme les connecteurs nationaux (modes.mjs).
// Les flux entrants exigent un jeton d'accès propre à chaque émetteur : INTEROP_<ID>_JETON (32 caractères au moins),
// transmis en « Authorization: Bearer … ». Sans jeton configuré, le flux entrant est fermé.
import {connectorMode} from './modes.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
const clean=v=>String(v??'').trim();
export const CONNECTEURS={
 labo:{label:'Laboratoires de biologie',sens:'entrant',besoin:[],doc:'Flux HL7 ORU^R01 ou HPRIM Santé de chaque laboratoire (format validé avec un fichier d’exemple).'},
 gam:{label:'Logiciel administratif (GAM, facturation, PMSI)',sens:'deux sens',besoin:['INTEROP_GAM_URL'],doc:'Mouvements ADT reçus (IHE PAM), actes envoyés en DFT^P03 ; groupage GHM et fichiers ATIH restent dans le logiciel PMSI.'},
 moniteurs:{label:'Passerelle des moniteurs et respirateurs',sens:'entrant',besoin:[],doc:'Philips IntelliBridge, Dräger Infinity Gateway, GE, Mindray : ORU^R01 avec codes MDC, salle en PV1-3.'},
 courriers:{label:'Courriers reçus (MSSanté, scanner)',sens:'entrant',besoin:[],doc:'Boîte organisationnelle MSSanté de la clinique ou dossier de numérisation, relayés vers IASELO.'},
 efs:{label:'Établissement français du sang (commandes)',sens:'sortant',besoin:['INTEROP_EFS_URL'],doc:'Commande de PSL vers le logiciel de distribution de l’EFS ou du dépôt de sang (convention de cession).'},
 sesam:{label:'Feuilles de soins SESAM-Vitale',sens:'sortant',besoin:['INTEROP_SESAM_URL'],doc:'Un logiciel agréé SESAM-Vitale (GIE) établit et télétransmet la FSE ; IASELO lui transmet les actes et honoraires.'},
 pmsi:{label:'Logiciel PMSI du DIM (groupage, fichiers ATIH)',sens:'sortant',besoin:['INTEROP_PMSI_URL'],doc:'Résumé PMSI validé par le DIM (diagnostics CIM-10, actes CCAM, modes d’entrée et de sortie) envoyé en HL7 BAR^P12 ; le logiciel PMSI groupe (GHM/GHS) et transmet RSS, VID-HOSP et FICHCOMP sur e-PMSI.'},
 facturation:{label:'Logiciel de facturation (norme B2, retours NOEMIE)',sens:'deux sens',besoin:['INTEROP_FACTURATION_URL'],doc:'Facture du séjour (GHS, forfaits, implants en sus, honoraires) envoyée au logiciel agréé qui télétransmet en B2 ; paiements et rejets NOEMIE reçus sur /api/interop/entrant/retours.'},
 adri:{label:'Droits de l’assuré en ligne (ADRi)',sens:'sortant',besoin:['INTEROP_ADRI_URL'],doc:'Interrogation des droits à l’Assurance maladie par le logiciel administratif (service ADRi, carte CPE ou certificat d’établissement).'},
 roc:{label:'Complémentaires santé (ROC)',sens:'sortant',besoin:['INTEROP_ROC_URL'],doc:'Remboursement des organismes complémentaires : identification des droits (IDB) et accord de prise en charge, via le logiciel de facturation ROC-compatible.'},
 paiement:{label:'Paiement en ligne',sens:'deux sens',besoin:['INTEROP_PAIEMENT_STRIPE_KEY','INTEROP_PAIEMENT_WEBHOOK_SECRET'],doc:'Stripe Checkout (ou prestataire de la clinique) ; aucune donnée de santé dans le libellé du paiement.'}
};
export function etatConnecteur(id,env={}){
 const c=CONNECTEURS[id];let mode;try{mode=connectorMode(id,env)}catch(e){return {id,label:c.label,mode:'erreur',etat:e.message,pret:false}}
 const jeton=clean(env['INTEROP_'+id.toUpperCase()+'_JETON']),manque=mode==='simulation'?[]:c.besoin.filter(k=>!clean(env[k]));
 const entrant=c.sens!=='sortant'?(jeton.length>=32?'ouvert (jeton configuré)':'fermé (INTEROP_'+id.toUpperCase()+'_JETON absent)'):'';
 return {id,label:c.label,sens:c.sens,mode,manque,entrant,doc:c.doc,pret:mode==='simulation'||!manque.length,etat:mode==='simulation'?'Simulation : rien ne sort du serveur':manque.length?'Configuration incomplète : '+manque.join(', '):mode==='test'?'Environnement de test':'Production'};
}
export const etatConnecteurs=(env={})=>Object.keys(CONNECTEURS).map(id=>etatConnecteur(id,env));
// Jeton d'un flux entrant, comparé en temps constant.
export function jetonValide(id,request,env={}){
 const attendu=clean(env['INTEROP_'+id.toUpperCase()+'_JETON']);if(attendu.length<32)return false;
 const recu=clean(request.headers.get('Authorization')).replace(/^Bearer\s+/i,'');const a=Buffer.from(attendu),b=Buffer.from(recu);
 return a.length===b.length&&timingSafeEqual(a,b);
}
// Envoi sortant (GAM, EFS, SESAM) : simulation locale, ou POST HTTPS vers l'URL déclarée avec le jeton sortant.
export async function envoyer(id,{corps,type='application/hl7-v2; charset=utf-8'},env={},fetchImpl=globalThis.fetch){
 const e=etatConnecteur(id,env);
 if(e.mode==='simulation')return {ok:true,simulation:true,reference:'SIM-'+id.toUpperCase()+'-'+Date.now().toString(36).toUpperCase(),detail:'Simulation : message conservé dans IASELO, non transmis.'};
 if(!e.pret)throw Error(e.etat);
 const url=clean(env['INTEROP_'+id.toUpperCase()+'_URL']);if(!/^https:\/\//.test(url))throw Error('INTEROP_'+id.toUpperCase()+'_URL doit être une adresse https.');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
 try{const r=await fetchImpl(url,{method:'POST',headers:{'Content-Type':type,...(clean(env['INTEROP_'+id.toUpperCase()+'_JETON_SORTANT'])?{Authorization:'Bearer '+clean(env['INTEROP_'+id.toUpperCase()+'_JETON_SORTANT'])}:{})},body:corps,signal:ctrl.signal});
  const txt=await r.text();if(!r.ok)throw Error(e.label+' : refus '+r.status);
  const msa=txt.match(/MSA\|(A[AER]|C[AER])/);if(msa&&!['AA','CA'].includes(msa[1]))throw Error(e.label+' : accusé de réception '+msa[1]);
  return {ok:true,simulation:false,reference:(txt.match(/MSA\|A[A-Z]\|([^|\r\n]*)/)||[])[1]||'',detail:'Transmis ('+e.etat+')'};
 }finally{clearTimeout(timer)}
}
// Stripe Checkout : session de paiement sans donnée de santé (libellé neutre, référence interne).
export async function sessionPaiement({montant,reference,libelle,retour},env={},fetchImpl=globalThis.fetch){
 const e=etatConnecteur('paiement',env);
 if(e.mode==='simulation')return {simulation:true,url:retour+'&simulation=1',id:'SIM-PAY-'+reference};
 if(!e.pret)throw Error(e.etat);
 const body=new URLSearchParams({'mode':'payment','success_url':retour+'&etat=succes','cancel_url':retour+'&etat=abandon','client_reference_id':reference,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'eur','line_items[0][price_data][unit_amount]':String(montant),'line_items[0][price_data][product_data][name]':libelle,'metadata[reference]':reference,'payment_intent_data[description]':libelle});
 const r=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+clean(env.INTEROP_PAIEMENT_STRIPE_KEY),'Content-Type':'application/x-www-form-urlencoded'},body});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Error('Paiement : '+(j.error?.message||'refus '+r.status));
 return {simulation:false,url:j.url,id:j.id};
}
// Vérification de la signature Stripe (en-tête Stripe-Signature : t=…,v1=…), tolérance 5 minutes.
export function signatureStripe(payload,entete,secret,maintenant=Date.now()){
 const p=Object.fromEntries(clean(entete).split(',').map(x=>x.split('=')).filter(x=>x.length===2));
 if(!p.t||!p.v1||!secret)return false;if(Math.abs(maintenant/1000-Number(p.t))>300)return false;
 const attendu=createHmac('sha256',secret).update(p.t+'.'+payload).digest('hex');const a=Buffer.from(attendu),b=Buffer.from(p.v1);
 return a.length===b.length&&timingSafeEqual(a,b);
}

/* IASELO · téléconsultation vidéo (5e veille, lot 7, manque 10) : de navigateur à navigateur (WebRTC), sur lien sécurisé,
   sans enregistrement. Le serveur IASELO ne fait que relayer la mise en relation (signalisation) ; l'image et le son
   passent directement entre les deux navigateurs, chiffrés (DTLS-SRTP), et ne sont jamais stockés.
   Règles pures, testées dans tests/teleconsultation.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloVisio=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const OUVERTURE_AVANT_MIN=15,DUREE_MAX_MIN=120,MAX_ECHECS=5,TAILLE_SIGNAL=20000;
// La consultation pré-anesthésique (art. D.6124-92 CSP) se fait en présentiel : elle n'est pas proposée en vidéo.
const MOTIFS={suivi:'Suivi après l’intervention',sortie:'Visite de sortie à distance',resultats:'Résultats et conduite à tenir',autre:'Autre échange avec l’équipe'};
const STATUTS={planifiee:'Planifiée','en-cours':'En cours',terminee:'Terminée',annulee:'Annulée'};
const TYPES=['pret','offer','answer','candidate','bye'];
const ms=s=>{const t=Date.parse(s);return Number.isFinite(t)?t:null};
// Heure locale de Paris « AAAA-MM-JJTHH:MM » → instant (gère l'heure d'été).
function instantParis(local){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(local||'')))return null;
 const guess=Date.parse(local+':00Z');if(!Number.isFinite(guess))return null;
 const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const p=Object.fromEntries(f.formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
 const vu=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
 return new Date(guess-(vu-guess)).toISOString();
}
// Planification : date future (au plus 90 jours), motif connu.
function verifierPlanif({debut,motif},maintenant=new Date()){
 const e=[],at=instantParis(debut);
 if(!at)e.push('Date et heure invalides.');else{const d=ms(at)-maintenant.getTime();if(d<-5*60000)e.push('La date est passée.');if(d>90*864e5)e.push('Au plus 90 jours à l’avance.')}
 if(!MOTIFS[motif])e.push('Motif inconnu.');
 return {ok:!e.length,erreurs:e,debutIso:at};
}
// Salle ouverte : de 15 min avant l'heure jusqu'à 2 h après, si elle n'est ni annulée ni terminée.
function ouverte(salle,maintenant=new Date()){
 if(!salle||['annulee','terminee'].includes(salle.statut))return {ok:false,raison:salle?.statut==='annulee'?'Ce rendez-vous a été annulé.':'Ce rendez-vous est terminé.'};
 const t=maintenant.getTime(),d=ms(salle.debut);if(d==null)return {ok:false,raison:'Rendez-vous invalide.'};
 if(t<d-OUVERTURE_AVANT_MIN*60000)return {ok:false,tot:true,raison:'La salle ouvre 15 minutes avant l’heure du rendez-vous.'};
 if(t>d+DUREE_MAX_MIN*60000)return {ok:false,raison:'Ce rendez-vous est terminé.'};
 return {ok:true};
}
// Message de signalisation : type connu, contenu borné (SDP ou candidat ICE).
function signalValide(type,data){
 if(!TYPES.includes(type))return false;
 const s=JSON.stringify(data??null);if(s.length>TAILLE_SIGNAL)return false;
 if(type==='offer'||type==='answer')return !!data&&data.type===type&&typeof data.sdp==='string'&&data.sdp.startsWith('v=0');
 if(type==='candidate')return data===null||(typeof data==='object'&&typeof (data.candidate??'')==='string');
 return true;
}
// Serveurs STUN/TURN : uniquement ceux configurés par l'établissement (VISIO_ICE_SERVERS, JSON). Aucun serveur tiers par défaut.
function iceServers(config){
 let v=config;if(typeof v==='string'){try{v=JSON.parse(v)}catch{return []}}
 return (Array.isArray(v)?v:[]).filter(s=>s&&(typeof s.urls==='string'||Array.isArray(s.urls))).map(s=>({urls:s.urls,...(s.username?{username:String(s.username)}:{}),...(s.credential?{credential:String(s.credential)}:{})})).slice(0,5);
}
// SMS sans donnée de santé : établissement, date, lien.
function sms(etablissement,debutIso,lien){
 const d=new Date(debutIso),f=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d).replace(' ',' à ');
 return (etablissement||'La clinique')+' : votre rendez-vous vidéo le '+f+'. Le jour venu, ouvrez ce lien (votre date de naissance vous sera demandée) : '+lien;
}
const duree=(a,b)=>{const x=ms(a),y=ms(b);return x!=null&&y!=null&&y>=x?Math.round((y-x)/60000):null};
return {OUVERTURE_AVANT_MIN,DUREE_MAX_MIN,MAX_ECHECS,MOTIFS,STATUTS,TYPES,instantParis,verifierPlanif,ouverte,signalValide,iceServers,sms,duree};
});

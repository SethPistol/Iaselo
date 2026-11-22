/* IASELO · espace patient : consentement d'anesthésie et documents déposés par le patient.
   Fonctions pures, partagées par le dossier (documents-consentement.js), la page patient
   (espace-patient-page.js) et le serveur (worker/espace-patient.mjs). Tests : tests/espace-patient.test.cjs.
   Le texte du consentement reprend mot pour mot le formulaire de la Clinique du Trocadéro (version du
   22 novembre 2026, CSP L. 1111-2 et L. 1111-4). Toute modification du texte doit changer FORMULAIRE.version. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloEspacePatient=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const str=(v,max=600)=>String(v??'').replace(/\r/g,'').trim().slice(0,max);
const isDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!isNaN(new Date(v+'T12:00:00'));
const escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtD=d=>isDate(d)?new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
const fmtDT=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'})};

/* ---------- Formulaire de la Clinique du Trocadéro ---------- */
const FORMULAIRE={
 version:'trocadero-2026-11-22',
 date:'22 novembre 2026',
 references:'Code de la santé publique L. 1111-2 et L. 1111-4',
 sfar:'https://sfar.org/pour-le-grand-public/information-medicale-sur-lanesthesie/',
 information:{
  titre:'Information sur l’anesthésie',
  sousTitre:'À remettre au patient adulte avant une intervention programmée',
  sections:[
   ['Les techniques d’anesthésie','L’anesthésie permet de réaliser l’intervention dans des conditions adaptées et de prévenir ou soulager la douleur. Sous anesthésie générale, des médicaments vous font perdre conscience. L’équipe peut assurer votre respiration à l’aide d’un dispositif placé dans la gorge ou la trachée. L’anesthésie locorégionale insensibilise une partie du corps. Elle peut être associée à une sédation ou à une anesthésie générale. Si elle est insuffisante, une autre technique peut être nécessaire. La sédation diminue la vigilance à un degré variable.'],
   ['La consultation et le jour de l’intervention','Le médecin anesthésiste-réanimateur vous explique les options adaptées à votre état de santé et à votre intervention. Signalez vos traitements, allergies, antécédents, problèmes dentaires et tout changement de santé. Suivez les consignes personnalisées de jeûne, de prise des médicaments et, en ambulatoire, de retour à domicile. Pendant l’intervention et au réveil, l’équipe surveille notamment votre respiration et votre circulation.'],
   ['Les effets indésirables et les risques','Après une anesthésie générale, des nausées, des vomissements, une gêne dans la gorge ou une somnolence sont possibles. Des lésions dentaires peuvent survenir. Parmi les complications graves figurent une réaction allergique sévère, l’inhalation du contenu de l’estomac et des complications respiratoires ou cardiovasculaires. Une sédation peut également ralentir la respiration. Après une anesthésie locorégionale, les effets dépendent du site et de la technique. Un mal de tête peut survenir après certaines ponctions du dos. Une atteinte nerveuse, une infection, un saignement ou une réaction toxique au médicament sont possibles. Votre médecin vous précise les risques pertinents dans votre situation.'],
   ['La douleur après l’intervention','L’équipe évalue votre douleur et adapte le traitement. Selon l’intervention, des médicaments, une anesthésie locorégionale ou un dispositif d’analgésie que vous commandez peuvent être proposés. Signalez une douleur insuffisamment soulagée.'],
   ['La transfusion et votre décision','Certaines interventions peuvent entraîner un saignement justifiant une transfusion. Si cette éventualité vous concerne, l’équipe vous explique son intérêt, ses risques et les alternatives possibles. Signalez toute restriction ou tout refus avant l’intervention. Vous pouvez poser vos questions et retirer votre consentement à tout moment.']
  ]
 },
 consentement:{
  titre:'Consentement éclairé préalable à l’anesthésie',
  sousTitre:'Patient adulte en capacité de consentir • Intervention programmée',
  consigne:'Cochez une réponse par ligne.',
  rappel:'Je peux demander des précisions ou un délai de réflexion, exprimer des réserves et retirer mon consentement à tout moment.'
 }
};
const QUESTIONS=[
 ['informe','J’estime avoir été suffisamment informé(e), lors de l’entretien et, le cas échéant, par écrit, des avantages et des risques de l’anesthésie.'],
 ['questions','J’ai pu poser au médecin anesthésiste toutes les questions que j’ai jugées utiles et j’ai compris les réponses qui m’ont été fournies.'],
 ['consignes','J’ai pris connaissance des recommandations concernant l’anesthésie et je m’engage à respecter les consignes de sécurité qui m’ont été données.'],
 ['douleur','J’ai reçu une information relative à la prise en charge de la douleur.'],
 ['honoraires','J’ai pris connaissance du complément d’honoraires de l’anesthésie, lorsqu’il est applicable.'],
 ['adaptations','Je donne mon accord aux adaptations de la procédure discutées avec l’équipe médico-chirurgicale, si elles deviennent nécessaires.'],
 ['transfusion','Je donne mon accord à une transfusion si elle est jugée nécessaire par l’équipe médico-chirurgicale.'],
 ['accord','Je donne mon accord à la procédure d’anesthésie.']
];

/* ---------- Fiche préparée par le médecin (figée à l'envoi) ---------- */
function fiche(input={}){
 const p=input.patient||{};
 return {
  formulaire:FORMULAIRE.version,
  etablissement:str(input.etablissement,120)||'Clinique du Trocadéro',
  patient:{nom:str(p.nom,80),prenom:str(p.prenom,80),naissance:isDate(p.naissance)?p.naissance:''},
  intervention:str(input.intervention,200),
  datePrevue:isDate(input.datePrevue)?input.datePrevue:'',
  consultation:{date:isDate(input.consultation?.date)?input.consultation.date:'',medecin:str(input.consultation?.medecin,120)}
 };
}
function ficheManquants(f){
 const m=[];if(!f.patient.nom||!f.patient.prenom)m.push('nom et prénom');if(!f.patient.naissance)m.push('date de naissance');
 if(!f.intervention)m.push('intervention prévue');if(!f.consultation.date)m.push('date de consultation');if(!f.consultation.medecin)m.push('médecin');return m;
}

/* ---------- Réponse du patient ---------- */
const SIGNATURE_MAX=160000;
function validerReponse(input={}){
 const errors=[],reponses={};
 for(const [id] of QUESTIONS){const v=input.reponses?.[id];if(v==='oui'||v==='non')reponses[id]=v}
 const manquantes=QUESTIONS.filter(([id])=>!reponses[id]).map(([id])=>id);
 const signataire=str(input.signataire,120),reserves=str(input.reserves,2000),lieu=str(input.lieu,120);
 if(manquantes.length)errors.push('Répondez à chaque ligne (Oui ou Non) : '+manquantes.length+' ligne'+(manquantes.length>1?'s':'')+' sans réponse.');
 if(signataire.length<3)errors.push('Indiquez vos nom et prénom pour signer.');
 if(input.certifie!==true)errors.push('Cochez la case de confirmation.');
 let signature='';
 if(input.signature){if(typeof input.signature!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.signature)||input.signature.length>SIGNATURE_MAX)errors.push('Signature dessinée illisible : effacez-la puis recommencez.');else signature=input.signature}
 return {ok:!errors.length,errors,manquantes,reponse:{reponses,reserves,lieu,signataire,signature}};
}
const nonCoches=r=>QUESTIONS.filter(([id])=>r?.reponses?.[id]==='non').map(([id,t])=>({id,texte:t}));
// Empreinte stable de ce que le patient a signé (texte du formulaire + fiche + réponses).
function canonique(f,r){
 const sorted=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):Array.isArray(v)?v.map(sorted):v;
 return JSON.stringify(sorted({formulaire:FORMULAIRE.version,questions:QUESTIONS,fiche:f,reponses:r.reponses,reserves:r.reserves||'',lieu:r.lieu||'',signataire:r.signataire||'',signature:r.signature||'',signeLe:r.signeLe||''}));
}

/* ---------- Statut, relance et alerte avant le bloc ---------- */
// c = stay.espacePatient.consentement (écrit par le serveur uniquement).
function statut(c){
 if(!c||!c.envoi)return {code:'aucun',label:'Non envoyé',recu:false,niveau:'todo'};
 if(c.annule&&!c.recu)return {code:'annule',label:'Lien désactivé',recu:false,niveau:'todo'};
 if(c.recu?.mode==='papier')return {code:'papier',label:'Reçu sur papier',recu:true,niveau:'ok'};
 if(c.recu?.mode==='depot'){
  if(c.verification?.conforme===true)return {code:'verifie',label:'Document signé vérifié',recu:true,niveau:'ok'};
  if(c.verification?.conforme===false)return {code:'non-conforme',label:'Document non conforme · à redemander',recu:false,niveau:'crit'};
  return {code:'depose',label:'Document déposé · à vérifier',recu:false,niveau:'warn'};
 }
 if(c.recu?.mode==='signature'){const non=nonCoches(c.recu).length;return non||c.recu.reserves?{code:'signe-reserves',label:'Signé avec '+(non?non+' « Non »':'des réserves')+' · à revoir',recu:true,aRevoir:true,niveau:'warn'}:{code:'signe',label:'Signé par le patient',recu:true,niveau:'ok'}}
 if(c.ouvertLe)return {code:'ouvert',label:'Ouvert par le patient, non signé',recu:false,niveau:'warn'};
 return {code:'envoye',label:'Envoyé, en attente',recu:false,niveau:'warn'};
}
const jours=(from,to)=>Math.round((new Date(to+'T12:00:00')-new Date(from+'T12:00:00'))/86400000);
const today=(now=new Date())=>new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
// Relance conseillée : 48 h sans retour, ou intervention dans 3 jours ou moins.
function relance(c,datePrevue,now=new Date()){
 const s=statut(c);if(s.recu||!c?.envoi||s.code==='annule')return {conseillee:false};
 const last=[c.envoi.at,...(c.relances||[]).map(r=>r.at)].filter(Boolean).sort().at(-1),h=(now-new Date(last))/3600000;
 const j=isDate(datePrevue)?jours(today(now),datePrevue):null;
 if(h>=48)return {conseillee:true,raison:'Aucun retour depuis '+Math.floor(h/24)+' jour'+(h>=96?'s':'')};
 if(j!==null&&j<=3&&h>=12)return {conseillee:true,raison:'Intervention dans '+Math.max(j,0)+' jour'+(j>1?'s':'')};
 return {conseillee:false};
}
// Alerte affichée dans le dossier, la feuille d'anesthésie et la tour de contrôle.
function alerteBloc(stay,now=new Date()){
 const c=stay?.espacePatient?.consentement,s=statut(c),d=datePrevueSejour(stay),j=isDate(d)?jours(today(now),d):null;
 if(s.recu)return {niveau:s.aRevoir?'warn':'ok',bloquant:false,statut:s,message:s.aRevoir?'Consentement signé avec réserves ou « Non » : à revoir avec le patient.':'Consentement d’anesthésie reçu.'};
 const quand=j===null?'':j<0?'':j===0?' · intervention aujourd’hui':j===1?' · intervention demain':' · intervention dans '+j+' jours';
 return {niveau:j!==null&&j<=2?'crit':'warn',bloquant:true,statut:s,message:(s.code==='aucun'?'Consentement d’anesthésie non envoyé':s.code==='depose'?'Consentement déposé, non vérifié':'Consentement d’anesthésie non reçu')+quand};
}
function datePrevueSejour(stay){const d=stay?.consult?.ext?.surgeryDate||stay?.surgicalAnnouncement?.published?.fields?.date||'';return isDate(d)?d:''}

/* ---------- Validité du lien ---------- */
// Jusqu'au lendemain de l'intervention ; au moins 48 h, au plus 45 jours ; 30 jours sans date.
function expiration(datePrevue,now=new Date()){
 const min=now.getTime()+48*3600000,max=now.getTime()+45*86400000;
 const t=isDate(datePrevue)?new Date(datePrevue+'T23:59:00').getTime()+86400000:now.getTime()+30*86400000;
 return new Date(Math.max(min,Math.min(max,t))).toISOString();
}

/* ---------- Documents déposés par le patient ---------- */
const CATEGORIES=[['bilan','Bilan biologique (prise de sang)'],['ordonnance','Ordonnance ou liste de traitements'],['courrier','Courrier d’un médecin'],['imagerie','Compte rendu d’examen ou d’imagerie'],['groupe','Carte de groupe sanguin'],['consultation-autre','Compte rendu de consultation ou d’hospitalisation'],['autre','Autre document']];
const CATEGORIE=Object.fromEntries(CATEGORIES);
const LIMITES={fichier:10*1024*1024,nombre:20,total:80*1024*1024,commentaire:200,nom:120};
const TYPES={'application/pdf':'PDF','image/jpeg':'Photo JPEG','image/png':'Image PNG'};
// Type réel lu dans les premiers octets : l'extension et le type annoncé par le navigateur ne suffisent pas.
function typeReel(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
 if(b.length>=5&&b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2d)return 'application/pdf';
 if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if(b.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((x,i)=>b[i]===x))return 'image/png';
 return null;
}
// PDF actifs refusés : JavaScript, lancement d'application, fichiers incorporés.
function pdfActif(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);let s='';const n=Math.min(b.length,LIMITES.fichier);
 for(let i=0;i<n;i+=65536)s+=String.fromCharCode.apply(null,b.subarray(i,Math.min(n,i+65536)));
 return /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/.test(s);
}
function nomFichier(name,type){
 let n=String(name||'').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,LIMITES.nom);
 const ext={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'}[type]||'';
 n=n.replace(/^[.\s]+/,'');if(!n)n='document';
 if(ext&&!n.toLowerCase().endsWith(ext)&&!(ext==='.jpg'&&/\.jpe?g$/i.test(n)))n=n.replace(/\.[a-z0-9]{1,5}$/i,'')+ext;
 return n;
}
// Contrôle complet d'un dépôt (serveur) : renvoie une erreur lisible ou le type réel.
function controleFichier(bytes,{deja=[],categorie}={}){
 const size=bytes?.byteLength??bytes?.length??0;
 if(!size)return {error:'Fichier vide.'};
 if(size>LIMITES.fichier)return {error:'Fichier trop lourd : 10 Mo au maximum. Prenez la photo en qualité normale ou scannez en PDF.'};
 if(deja.length>=LIMITES.nombre)return {error:'Nombre maximal de documents atteint ('+LIMITES.nombre+'). Apportez les autres le jour de la consultation.'};
 if(deja.reduce((t,d)=>t+(d.taille||0),0)+size>LIMITES.total)return {error:'Volume total maximal atteint. Apportez les autres documents le jour de la consultation.'};
 if(!CATEGORIE[categorie])return {error:'Choisissez le type de document.'};
 const type=typeReel(bytes);if(!type)return {error:'Format non accepté : PDF, photo JPEG ou PNG uniquement.'};
 if(type==='application/pdf'&&pdfActif(bytes))return {error:'Ce PDF contient des éléments actifs et ne peut pas être accepté. Imprimez-le en PDF ou prenez-le en photo.'};
 return {type};
}
const taille=n=>n>=1048576?(n/1048576).toLocaleString('fr-FR',{maximumFractionDigits:1})+' Mo':Math.max(1,Math.round(n/1024))+' ko';

/* ---------- Document imprimable (deux pages, mise en page du formulaire papier) ---------- */
function documentHTML(f,r,{medecin=null,mode='',empreinte='',verification=null}={}){
 const e=escHtml,F=FORMULAIRE,pa=f?.patient||{},rep=r?.reponses||{};
 const foot=n=>`<footer class="cs-foot"><span>${e(F.date)} • ${e(F.references)}</span><span>${n} / 2</span></footer>`;
 const kicker=`<p class="cs-kicker">${e(String(f?.etablissement||'Clinique du Trocadéro').toUpperCase())}</p>`;
 const line=(label,value,cls='')=>`<div class="cs-field ${cls}"><b>${e(label)}</b><span>${e(value||'')}</span></div>`;
 const box=v=>`<span class="cs-box${v?' is-on':''}" aria-label="${v?'coché':'non coché'}">${v?'✕':''}</span>`;
 const p1=`<article class="cs-page">${kicker}<h2 class="cs-title">${e(F.information.titre)}</h2><p class="cs-sub">${e(F.information.sousTitre)}</p>
  ${F.information.sections.map(([t,x])=>`<section class="cs-sec"><h3>${e(t)}</h3><p>${e(x)}</p></section>`).join('')}
  <p class="cs-link"><a href="${e(F.sfar)}" target="_blank" rel="noopener noreferrer">Consulter la fiche officielle intégrale de la SFAR</a></p>${foot(1)}</article>`;
 const signe=r?.signeLe?fmtDT(r.signeLe):'';
 const p2=`<article class="cs-page">${kicker}<h2 class="cs-title">${e(F.consentement.titre)}</h2><p class="cs-sub">${e(F.consentement.sousTitre)}</p>
  <div class="cs-grid">${line('Nom de naissance et prénom',[String(pa.nom||'').toUpperCase(),pa.prenom].filter(Boolean).join(' '),'cs-wide')}${line('Né(e) le',fmtD(pa.naissance))}${line('Intervention prévue',f?.intervention,'cs-wide')}${line('Date prévue',fmtD(f?.datePrevue))}</div>
  <h3 class="cs-h">Au cours de la consultation d’anesthésie</h3>
  <div class="cs-grid">${line('Du',fmtD(f?.consultation?.date))}${line('Avec le Docteur',f?.consultation?.medecin,'cs-wide')}</div>
  <table class="cs-table"><thead><tr><th>${e(F.consentement.consigne)}</th><th>Oui</th><th>Non</th></tr></thead><tbody>
  ${QUESTIONS.map(([id,t])=>`<tr class="${rep[id]==='non'?'is-non':''}"><td>${e(t)}</td><td>${box(rep[id]==='oui')}</td><td>${box(rep[id]==='non')}</td></tr>`).join('')}</tbody></table>
  <p class="cs-rappel">${e(F.consentement.rappel)}</p>
  <div class="cs-field cs-full"><b>Réserves ou précisions</b><span class="cs-pre">${e(r?.reserves||'')}</span></div>
  <div class="cs-grid">${line('Date et heure',signe)}${line('Lieu',r?.lieu||'')}</div>
  <div class="cs-signs"><div><b>Signature du patient (facultative)</b>${r?.signature?`<img src="${e(r.signature)}" alt="Signature dessinée du patient">`:''}${r?.signataire?`<small>${mode==='signature'?'Signé électroniquement par ':''}${e(r.signataire)}${signe?' le '+e(signe):''}</small>`:''}</div>
  <div><b>Signature du médecin</b>${medecin?`<small>Contresigné par ${e(medecin.nom)} le ${e(fmtDT(medecin.at))}</small>`:''}</div></div>
  ${mode==='signature'&&empreinte?`<p class="cs-proof">Signature électronique simple (règlement eIDAS, art. 25) · lien personnel, date de naissance vérifiée · empreinte SHA-256 ${e(empreinte.slice(0,16))}…</p>`:''}
  ${verification?`<p class="cs-proof">${verification.conforme?'Document signé déposé, vérifié conforme':'Document déposé jugé non conforme'} par ${e(verification.by)} le ${e(fmtDT(verification.at))}</p>`:''}
  ${foot(2)}</article>`;
 return `<div class="cs-doc">${p1}${p2}</div>`;
}

return {FORMULAIRE,QUESTIONS,fiche,ficheManquants,validerReponse,nonCoches,canonique,statut,relance,alerteBloc,datePrevueSejour,expiration,CATEGORIES,CATEGORIE,LIMITES,TYPES,typeReel,pdfActif,nomFichier,controleFichier,taille,documentHTML,isDate,fmtD,fmtDT};
});

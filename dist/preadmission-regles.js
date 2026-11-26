/* IASELO · préadmission du patient (26/11/2026, demande de Romain).
   À la fin du questionnaire d'anesthésie, le patient reçoit un lien vers sa préadmission : un parcours d'étapes
   différent pour une endoscopie ou une chirurgie (informations, formulaire administratif, pièces justificatives,
   autorisation d'opérer, devis d'honoraires, directives anticipées, préparation), avec une jauge de progression.
   Les admissions (secrétariat) consultent le compte rendu, vérifient les pièces et valident la préadmission.
   Fonctions pures partagées par le serveur (worker/preadmission.mjs), la page patient (preadmission-page.js)
   et l'écran des admissions (preadmissions.js) ; testées dans tests/preadmission.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloPreadmission=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(new Date(s+'T12:00:00Z'));
const fmtD=d=>isDate(d)?d.split('-').reverse().join('/'):'';
const fmtDT=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=(v,max=200)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';

/* ---------- Type de préadmission : endoscopie ou chirurgie ---------- */
const TYPES={endoscopie:'Endoscopie',chirurgie:'Chirurgie'};
const MOTS_ENDOSCOPIE=/endoscop|colo-?scop|gastro-?scop|fibroscop|rectosigmo|(?:oe|œ)so-?gastro|duod[ée]no-?scop|ent[ée]roscop|cholangio|\bcpre\b|[ée]cho-?endo|vid[ée]ocapsule|anuscop|polypectomie|ligature (?:de )?varices/i;
// Choix des admissions d'abord ; sinon équipe « Endoscopie » du séjour, secteur d'endoscopie, ou acte annoncé.
function typeSejour(stay={}){
 const choisi=stay.preadmissionPatient?.type;if(TYPES[choisi]&&stay.preadmissionPatient?.typeSource==='admissions')return choisi;
 const core=stay.core||stay,ann=stay.surgicalAnnouncement?.published?.fields||{},ext=stay.consult?.ext||{};
 if(core.careTeamId==='endoscopie'||/(^|[-_ ])endo/i.test(String(core.sector||'')))return 'endoscopie';
 const texte=[core.specialty,ann.procedure,ann.specialty,ann.acte,ext.operation].filter(Boolean).join(' ');
 return MOTS_ENDOSCOPIE.test(texte)?'endoscopie':'chirurgie';
}

/* ---------- Étapes du parcours ---------- */
// niveau : obligatoire (compte pour « préadmission faite »), importante, ou vide (information).
// genre : info (j'ai pris connaissance), formulaire, autorisation, rdv, devis, directives.
const ETAPES=[
 {id:'savoir',titre:'Ce que je dois savoir pour préparer mon séjour',niveau:'importante',minutes:1,genre:'info'},
 {id:'livret',titre:'Je prends connaissance du livret d’accueil',niveau:'importante',minutes:2,genre:'info'},
 {id:'preadmission',titre:'Je réalise ma préadmission',niveau:'obligatoire',minutes:15,genre:'formulaire'},
 {id:'autorisation',titre:{endoscopie:'Je signe mon autorisation pour mon endoscopie',chirurgie:'Je signe mon autorisation d’opérer pour ma chirurgie'},niveau:'obligatoire',minutes:2,genre:'autorisation'},
 {id:'anesthesie',titre:'Informations pour ma consultation avec le médecin anesthésiste',niveau:'obligatoire',minutes:3,genre:'info'},
 {id:'rdv',titre:'Je confirme mon rendez-vous de consultation d’anesthésie',niveau:'obligatoire',minutes:1,genre:'rdv'},
 {id:'devis',titre:'Je dépose le ou les devis signés de dépassements d’honoraires',niveau:'obligatoire',minutes:2,genre:'devis'},
 {id:'directives',titre:'Mes directives anticipées',niveau:'importante',minutes:2,genre:'directives'},
 {id:'preparationColique',titre:'Ma préparation colique',niveau:'importante',minutes:3,genre:'info',pour:'endoscopie'},
 {id:'consignes',titre:'Consignes à suivre pour mon séjour',niveau:'obligatoire',minutes:2,genre:'info'},
 {id:'douches',titre:'Comment faire mes douches préopératoires',niveau:'importante',minutes:3,genre:'info',pour:'chirurgie'},
 {id:'cdu',titre:'La commission des usagers',niveau:'',minutes:1,genre:'info'},
 {id:'donnees',titre:'Protection de mes données',niveau:'',minutes:1,genre:'info'}
];
function etapes(type){const t=TYPES[type]?type:'chirurgie';return ETAPES.filter(e=>!e.pour||e.pour===t).map(e=>({...e,titre:typeof e.titre==='string'?e.titre:e.titre[t]}))}
const ETAPE=Object.fromEntries(ETAPES.map(e=>[e.id,e]));

// Contenu des étapes d'information (texte de l'établissement, à faire relire par la clinique).
function informations(type,{etablissement='la clinique',telephone=''}={}){
 const endo=type==='endoscopie',acte=endo?'votre examen':'votre intervention',tel=telephone?' au '+telephone:'';
 return {
  savoir:{intro:'Quelques points simples pour que '+acte+' se passe dans de bonnes conditions.',sections:[
   ['Avant votre venue','Complétez chaque étape obligatoire de ce parcours. Vous recevrez la veille un SMS avec votre heure d’arrivée : elle est calculée selon le programme du bloc, respectez-la.'],
   ['Ce que vous apportez','Votre pièce d’identité, votre carte Vitale, votre carte de mutuelle, vos ordonnances et traitements en cours dans leur boîte, vos derniers examens (prise de sang, radiographies, ECG) et, le cas échéant, votre carte de groupe sanguin.'],
   ['Le jour J','Venez sans bijoux, sans piercing, sans maquillage ni vernis à ongles. Laissez vos objets de valeur à la maison. Respectez les consignes de jeûne données par l’anesthésiste.'],
   ['Après une anesthésie','Une personne majeure doit vous raccompagner. Vous ne devez pas conduire ni prendre de décision importante pendant 24 heures, et il est préférable de ne pas rester seul(e) la première nuit.']]},
  livret:{intro:'Le livret d’accueil de '+etablissement+' présente votre séjour.',sections:[
   ['Votre arrivée','Présentez-vous à l’accueil à l’heure indiquée par le SMS de convocation, avec vos documents. Votre identité sera vérifiée à chaque étape : c’est une règle de sécurité.'],
   ['Votre chambre','Selon les disponibilités et votre demande lors de la préadmission : chambre particulière ou double, box ambulatoire. Les suppléments sont indiqués à l’accueil et souvent pris en charge par votre mutuelle.'],
   ['Repas, visites, téléphone','Les horaires de visite, les repas et le wifi sont précisés à votre arrivée. Les visites peuvent être limitées en période d’épidémie.'],
   ['Votre sortie','Elle est décidée par le médecin. Vous recevez les documents de sortie (ordonnances, consignes, lettre de liaison) et un SMS de nouvelles le lendemain.'],
   ['Contact',etablissement+tel+' pour toute question administrative.']]},
  anesthesie:{intro:'La consultation d’anesthésie est obligatoire avant toute anesthésie programmée (sauf urgence), au moins 48 heures avant '+acte+'.',sections:[
   ['Le questionnaire','Merci d’avoir rempli votre questionnaire : le médecin anesthésiste le relira avec vous.'],
   ['À apporter','Vos ordonnances, la liste de vos traitements (y compris pilule, anticoagulants, antiagrégants, compléments), vos examens récents, vos comptes rendus d’hospitalisation et votre carnet de santé si vous en avez un.'],
   ['Ce qui sera vu','Vos antécédents, vos allergies, les traitements à arrêter ou à poursuivre, le type d’anesthésie proposé, le jeûne et les consignes du jour J. Vous pouvez poser toutes vos questions.'],
   ['La visite pré-anesthésique','Un médecin anesthésiste vous reverra peu avant '+acte+' pour vérifier que rien n’a changé.']]},
  preparationColique:{intro:'La qualité de la préparation conditionne la qualité de l’examen : une préparation incomplète peut obliger à le refaire.',sections:[
   ['Suivez votre ordonnance','Prenez la préparation prescrite par votre gastro-entérologue exactement selon l’ordonnance et la notice, souvent en deux prises (la veille au soir et le matin).'],
   ['Alimentation','Régime sans résidus les jours précédents selon la prescription : pas de fruits, légumes, céréales complètes ni graines. Buvez abondamment des liquides clairs.'],
   ['Résultat attendu','Les selles doivent être liquides et claires (jaune pâle, sans particules). Si ce n’est pas le cas, appelez la clinique.'],
   ['Traitements','Signalez les anticoagulants, antiagrégants, le fer et les traitements du diabète : leur arrêt éventuel est décidé par le médecin, ne les arrêtez pas seul(e).']]},
  consignes:{intro:'Ces consignes protègent votre sécurité. Si vous ne pouvez pas les respecter, prévenez la clinique.',sections:[
   ['Jeûne','Respectez les horaires de jeûne donnés par l’anesthésiste (aliments solides, puis liquides clairs autorisés jusqu’à l’heure indiquée). Ne fumez pas le matin de '+acte+'.'],
   ['Médicaments','Prenez ou arrêtez vos médicaments uniquement selon l’ordonnance remise en consultation.'],
   ['Le jour J','Retirez bijoux, piercings, alliance, vernis, faux ongles, maquillage et lentilles. Apportez l’étui de vos lunettes, prothèses dentaires ou auditives.'],
   ['Si vous êtes malade','Fièvre, toux, infection, plaie ou grossesse découverte : appelez la clinique avant de venir.'],
   ['Retour à domicile','Prévoyez une personne pour vous raccompagner. Pas de conduite, d’alcool ni de décision importante pendant 24 heures.']]},
  douches:{intro:'La douche préopératoire diminue le risque d’infection du site opératoire.',sections:[
   ['Quand','La veille au soir et le matin de l’intervention, sauf consigne différente du chirurgien.'],
   ['Comment','Avec le savon indiqué par votre chirurgien (doux ou antiseptique) : mouillez-vous, savonnez de la tête aux pieds en insistant sur les cheveux, le nombril, les aisselles, les plis, les parties génitales et les pieds ; rincez bien ; séchez avec une serviette propre.'],
   ['Ensuite','Mettez des vêtements propres, dormez dans des draps propres, ne mettez ni crème, ni parfum, ni déodorant. Ongles courts, propres et sans vernis.'],
   ['Pas de rasage','Ne vous rasez pas et ne vous épilez pas la zone opératoire : si nécessaire, une tonte est faite à la clinique.']]},
  cdu:{intro:'La commission des usagers veille au respect de vos droits et à la qualité de votre prise en charge (article L. 1112-3 du code de la santé publique).',sections:[
   ['Son rôle','Elle examine les plaintes et réclamations, peut vous proposer une rencontre avec un médiateur médical ou non médical et formule des recommandations à l’établissement.'],
   ['Comment la saisir','Par écrit à la direction de '+etablissement+', ou en demandant à rencontrer un représentant des usagers, bénévole indépendant de l’établissement.']]},
  donnees:{intro:etablissement+' est responsable du traitement de vos données ; IASELO est le logiciel utilisé pour votre parcours.',sections:[
   ['Pourquoi','Organiser votre séjour, vos soins et votre facturation ; respecter les obligations légales (dossier médical, identitovigilance).'],
   ['Où','Chez un hébergeur certifié pour les données de santé (HDS), en France. Les SMS et e-mails ne contiennent ni nom ni information médicale, seulement un lien personnel.'],
   ['Combien de temps','Le dossier médical est conservé 20 ans après le dernier séjour (article R. 1112-7 du code de la santé publique) ; vos pièces justificatives le temps nécessaire à la facturation.'],
   ['Vos droits','Accès, rectification, limitation et opposition dans les limites prévues par la loi : adressez-vous au délégué à la protection des données de l’établissement. Vous pouvez saisir la CNIL.']]}
 };
}

/* ---------- Formulaire de préadmission ---------- */
const REGIMES=[['general','Régime général (Sécurité sociale)'],['msa','MSA (agricole)'],['independant','Indépendants'],['special','Régime spécial (SNCF, RATP, militaires…)'],['css','Complémentaire santé solidaire'],['ame','Aide médicale de l’État'],['etranger','Assuré d’un autre pays (carte européenne…)']];
const CHAMBRES=[['particuliere','Chambre particulière (si disponible)'],['double','Chambre double'],['indifferent','Sans préférence']];
const LIENS=['Conjoint(e)','Parent','Enfant','Frère ou sœur','Ami(e)','Autre'];
function age(naissance,now=new Date()){if(!isDate(naissance))return null;const b=new Date(naissance+'T12:00:00Z');let a=now.getUTCFullYear()-b.getUTCFullYear();const m=now.getUTCMonth()-b.getUTCMonth();if(m<0||(m===0&&now.getUTCDate()<b.getUTCDate()))a--;return a}
const telOk=v=>/^(?:\+|00)?[0-9][0-9 .-]{7,18}$/.test(String(v||'').trim());
const mailOk=v=>/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(String(v||'').trim());
// Nettoyage : seuls les champs connus, du texte court.
function formulaire(input={}){
 const g=(o,k,max)=>txt(o?.[k],max),o=input||{};
 const contact=x=>({nom:g(x,'nom',80),prenom:g(x,'prenom',80),lien:g(x,'lien',40),telephone:g(x,'telephone',24)});
 return {
  nomUsage:g(o,'nomUsage',80),passeport:o.passeport===true,lieuNaissance:g(o,'lieuNaissance',80),
  adresse:g(o,'adresse',160),complement:g(o,'complement',120),codePostal:g(o,'codePostal',10),ville:g(o,'ville',80),
  coordonneesExactes:o.coordonneesExactes===true,telephoneCorrige:g(o,'telephoneCorrige',24),emailCorrige:g(o,'emailCorrige',120),
  regime:REGIMES.some(([k])=>k===o.regime)?o.regime:'',mutuelle:g(o,'mutuelle',80),adherent:g(o,'adherent',40),sansMutuelle:o.sansMutuelle===true,
  medecinTraitant:g(o,'medecinTraitant',120),
  prevenir:contact(o.prevenir),
  confiance:['oui','non','prevenir'].includes(o.confiance)?o.confiance:'',personneConfiance:contact(o.personneConfiance),
  chambre:CHAMBRES.some(([k])=>k===o.chambre)?o.chambre:'',accompagnantNuit:o.accompagnantNuit===true,
  retourAccompagne:['oui','non'].includes(o.retourAccompagne)?o.retourAccompagne:'',
  besoins:g(o,'besoins',400)
 };
}
function validerFormulaire(input,{type='chirurgie'}={}){
 const f=formulaire(input),m=[];
 if(!f.adresse)m.push(['adresse','Adresse']);if(!/^\d{5}$/.test(f.codePostal)&&!(f.codePostal&&f.ville&&/\D/.test(f.codePostal)))m.push(['codePostal','Code postal']);if(!f.ville)m.push(['ville','Ville']);
 if(!f.lieuNaissance)m.push(['lieuNaissance','Lieu de naissance']);
 if(!f.coordonneesExactes){if(f.telephoneCorrige&&!telOk(f.telephoneCorrige))m.push(['telephoneCorrige','Téléphone corrigé']);if(f.emailCorrige&&!mailOk(f.emailCorrige))m.push(['emailCorrige','E-mail corrigé']);if(!f.telephoneCorrige&&!f.emailCorrige)m.push(['coordonneesExactes','Confirmation de votre téléphone et de votre e-mail'])}
 if(!f.regime)m.push(['regime','Régime d’assurance maladie']);
 if(!f.sansMutuelle&&!f.mutuelle)m.push(['mutuelle','Mutuelle (ou « je n’ai pas de mutuelle »)']);
 if(!f.prevenir.nom||!telOk(f.prevenir.telephone))m.push(['prevenir','Personne à prévenir (nom et téléphone)']);
 if(!f.confiance)m.push(['confiance','Personne de confiance']);
 if(f.confiance==='oui'&&(!f.personneConfiance.nom||!telOk(f.personneConfiance.telephone)))m.push(['personneConfiance','Personne de confiance (nom et téléphone)']);
 if(!f.chambre)m.push(['chambre','Type de chambre souhaité']);
 if(!f.retourAccompagne)m.push(['retourAccompagne','Retour à domicile accompagné']);
 return {ok:!m.length,formulaire:f,manquants:m.map(x=>x[0]),errors:m.length?['À compléter : '+m.map(x=>x[1]).join(', ')+'.']:[],
  alertes:f.retourAccompagne==='non'?['Personne pour le retour : sans accompagnant, '+(type==='endoscopie'?'l’examen sous anesthésie':'la sortie le jour même')+' peut être reportée. L’équipe vous rappellera.']:[]};
}

/* ---------- Pièces justificatives ---------- */
const PIECES=[
 ['identiteRecto','Pièce d’identité (recto)','Pièce d’identité'],
 ['identiteVerso','Pièce d’identité (verso)','Pièce d’identité'],
 ['vitale','Carte Vitale ou attestation de droits','Carte Vitale'],
 ['mutuelle','Carte de mutuelle','Mutuelle'],
 ['domicile','Justificatif de domicile (moins de 3 mois)','Justificatif de domicile'],
 ['confiance','Désignation de la personne de confiance signée','Personne de confiance'],
 ['parentale','Autorisation d’opérer signée par les titulaires de l’autorité parentale','Autorisation parentale'],
 ['livretFamille','Livret de famille ou jugement (mineur)','Livret de famille'],
 ['devis','Devis d’honoraires signé','Devis'],
 ['directives','Directives anticipées','Directives anticipées'],
 ['autre','Autre document administratif','Autre']
];
const PIECE=Object.fromEntries(PIECES.map(([k,l,t])=>[k,{libelle:l,type:t}]));
const MULTIPLES=['devis','directives','autre'];
// Pièces attendues pour que la préadmission soit faite.
function piecesRequises({formulaire:f={},naissance='',passeport=false}={},now=new Date()){
 const out=['identiteRecto',...(passeport?[]:['identiteVerso']),'vitale','domicile'];
 if(f.mutuelle&&!f.sansMutuelle)out.push('mutuelle');
 const a=age(naissance,now);if(a!=null&&a<18)out.push('parentale','livretFamille');
 return out;
}
const piecesActives=pieces=>(pieces||[]).filter(p=>!p.remplace&&!(p.controle&&p.controle.conforme===false));

/* ---------- Autorisation ---------- */
function texteAutorisation(type,{etablissement='la clinique',intervention='',patient=''}={}){
 const endo=type==='endoscopie',acte=intervention?(endo?'l’examen suivant : ':'l’intervention suivante : ')+intervention:(endo?'l’examen endoscopique prévu':'l’intervention chirurgicale prévue');
 return 'Je soussigné(e) '+(patient||'[nom et prénom]')+' autorise les médecins de '+etablissement+' à réaliser '+acte+', ainsi que les actes complémentaires qui s’avéreraient nécessaires pendant '+(endo?'l’examen (biopsies, ablation de polypes, gestes d’hémostase…)':'l’intervention')+' dans mon intérêt. J’ai reçu de mon médecin une information claire sur les bénéfices, les risques et les alternatives, et j’ai pu poser mes questions. Je sais que je peux retirer cette autorisation à tout moment en prévenant l’équipe.';
}
function validerAutorisation(input={},{naissance=''}={},now=new Date()){
 const signataire=txt(input.signataire,120),qualite=['patient','parent','tuteur'].includes(input.qualite)?input.qualite:'',second=txt(input.secondParent,120),mineur=(age(naissance,now)??99)<18,e=[];
 if(!signataire)e.push('Indiquez vos nom et prénom.');
 if(!qualite)e.push('Indiquez en quelle qualité vous signez.');
 if(mineur&&qualite==='patient')e.push('Le patient est mineur : l’autorisation est signée par les titulaires de l’autorité parentale.');
 if(mineur&&qualite==='parent'&&!second)e.push('Patient mineur : indiquez aussi le second titulaire de l’autorité parentale (ou déposez le jugement s’il n’y en a qu’un).');
 if(input.certifie!==true)e.push('Cochez la case de certification.');
 return {ok:!e.length,errors:e,autorisation:{signataire,qualite,secondParent:second}};
}

/* ---------- État de la préadmission ---------- */
// Une étape est faite quand le patient l'a validée ; « préadmission » demande le formulaire envoyé et les pièces requises reçues.
function etapeFaite(id,d={},opts={}){
 if(id==='preadmission')return preadmissionFaite(d,opts);
 if(id==='autorisation')return !!d.autorisation?.at;
 return !!d.etapes?.[id]?.at;
}
function piecesManquantes(d={},{naissance='',now=new Date()}={}){
 const actives=piecesActives(d.pieces);
 return piecesRequises({formulaire:d.formulaire||{},naissance,passeport:d.formulaire?.passeport===true},now).filter(k=>!actives.some(p=>p.piece===k));
}
function preadmissionFaite(d={},opts={}){return !!d.formulaire?.soumisLe&&!piecesManquantes(d,opts).length}
// code : a-faire, en-cours, a-completer, faite, verifiee.
function etat(d,type,opts={}){
 d=d||{};const liste=etapes(type),faites=liste.filter(e=>etapeFaite(e.id,d,opts)),oblig=liste.filter(e=>e.niveau==='obligatoire');
 const refusees=(d.pieces||[]).filter(p=>!p.remplace&&p.controle?.conforme===false);
 const pre=preadmissionFaite(d,opts),manquantes=piecesManquantes(d,opts);
 let code=!faites.length&&!d.formulaire?.brouillonLe&&!(d.pieces||[]).length?'a-faire':'en-cours';
 if(pre)code='faite';
 const demande=d.aCompleter&&!d.aCompleter.leve&&!d.aCompleter.reponduLe;
 if(demande)code='a-completer';else if(refusees.length&&!pre)code='a-completer';
 if(d.verification?.at&&pre&&!demande)code='verifiee';
 return {code,libelle:ETATS[code],faites:faites.length,total:liste.length,pourcent:Math.round(faites.length*100/liste.length),
  obligatoiresRestantes:oblig.filter(e=>!etapeFaite(e.id,d,opts)).map(e=>e.id),preadmission:pre,piecesManquantes:manquantes,refusees:refusees.map(p=>({piece:p.piece,motif:p.controle.motif}))};
}
const ETATS={'a-faire':'Pas commencée','en-cours':'En cours','a-completer':'À compléter','faite':'Faite','verifiee':'Vérifiée'};
// Rappels avant l'intervention tant que la préadmission n'est pas faite.
const RAPPELS=[7,3,1];

/* ---------- Messages (sans donnée de santé) ---------- */
function messages(establishment,link,{rappel=false}={}){
 const etab=establishment||'Clinique du Trocadéro';
 const phrase=rappel?'Rappel : votre préadmission n’est pas terminée. Merci de la compléter avant votre venue.':'Vous pouvez dès maintenant réaliser votre préadmission en ligne (formulaire et pièces justificatives).';
 return {
  sms:etab+' : '+(rappel?'rappel, votre préadmission est à terminer avant votre venue : ':'réalisez votre préadmission en ligne avant votre venue : ')+link+' (votre date de naissance vous sera demandée).',
  subject:(rappel?'Rappel : votre préadmission est à terminer':'Votre préadmission en ligne')+' · '+etab,
  text:'Bonjour,\n\n'+phrase+'\n'+link+'\n\nVotre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas.\nNe répondez pas à ce message et n’y joignez aucun document.\nSi ce message ne vous concerne pas, ignorez-le.\n\n'+etab,
  html:'<p>Bonjour,</p><p>'+esc(phrase)+'</p><p><a href="'+esc(link)+'">Réaliser ma préadmission</a></p><p>Votre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas.</p><p>Ne répondez pas à ce message et n’y joignez aucun document. Si ce message ne vous concerne pas, ignorez-le.</p><p>'+esc(etab)+'</p>'
 };
}

/* ---------- Récapitulatif imprimable ---------- */
function recapHTML(d={},{etablissement='',patient={},type='chirurgie',datePrevue='',intervention='',contact={},now=new Date(),ecran=false}={}){
 const f=d.formulaire||{},st=etat(d,type,{naissance:patient.naissance,now}),row=(l,v)=>v?`<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`:'';
 const lib=(list,k)=>(list.find(x=>x[0]===k)||[])[1]||'';
 const pers=p=>p&&p.nom?[p.prenom,p.nom].filter(Boolean).join(' ')+(p.lien?' ('+p.lien+')':'')+(p.telephone?' · '+p.telephone:''):'';
 const pieces=(d.pieces||[]).filter(p=>!p.remplace);
 return `<article class="pa-recap"><header><h1>Récapitulatif de préadmission</h1><p>${esc([etablissement,TYPES[type],datePrevue?'prévue le '+fmtD(datePrevue):''].filter(Boolean).join(' · '))}</p><p>État : <b>${esc(st.libelle)}</b> · ${st.faites}/${st.total} étapes</p></header>
 <h2>Identité</h2><table>${row('Nom de naissance',String(patient.nom||'').toUpperCase())}${row('Nom d’usage',f.nomUsage)}${row('Prénom',patient.prenom)}${row('Date de naissance',fmtD(patient.naissance))}${row('Lieu de naissance',f.lieuNaissance)}</table>
 <h2>Coordonnées</h2><table>${row('Adresse',[f.adresse,f.complement,[f.codePostal,f.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}${row('Téléphone vérifié',contact.phone)}${row('E-mail vérifié',contact.email)}${f.coordonneesExactes?row('Coordonnées','Confirmées exactes par le patient'):row('Correction déclarée',[f.telephoneCorrige,f.emailCorrige].filter(Boolean).join(' · '))}</table>
 <h2>Couverture sociale</h2><table>${row('Régime',lib(REGIMES,f.regime))}${row('Mutuelle',f.sansMutuelle?'Aucune mutuelle déclarée':[f.mutuelle,f.adherent&&'adhérent '+f.adherent].filter(Boolean).join(' · '))}${row('Médecin traitant',f.medecinTraitant)}</table>
 <h2>Personnes</h2><table>${row('Personne à prévenir',pers(f.prevenir))}${row('Personne de confiance',f.confiance==='non'?'Non désignée':f.confiance==='prevenir'?'La personne à prévenir':pers(f.personneConfiance))}</table>
 <h2>Séjour</h2><table>${row('Intervention',intervention)}${row('Chambre souhaitée',lib(CHAMBRES,f.chambre))}${row('Accompagnant la nuit',f.accompagnantNuit?'Oui':'')}${row('Retour accompagné',f.retourAccompagne==='oui'?'Oui':f.retourAccompagne==='non'?'Non : à rappeler':'')}${row('Besoins particuliers',f.besoins)}${row('Formulaire envoyé le',f.soumisLe?fmtDT(f.soumisLe):'Non envoyé')}</table>
 ${ecran?'':`<h2>Pièces jointes</h2>${pieces.length?`<table><tr><th>Date</th><th>Libellé</th><th>Contrôle</th></tr>${pieces.map(p=>`<tr><td>${esc(fmtDT(p.recuLe))}</td><td>${esc(PIECE[p.piece]?.libelle||p.piece)} · ${esc(p.nom)}</td><td>${p.controle?(p.controle.conforme?'Conforme':'Non conforme : '+esc(p.controle.motif)):'À vérifier'}</td></tr>`).join('')}</table>`:'<p>Aucune pièce reçue.</p>'}
 ${st.piecesManquantes.length?`<p><b>Pièces manquantes :</b> ${esc(st.piecesManquantes.map(k=>PIECE[k].libelle).join(', '))}</p>`:''}
 <h2>Étapes</h2><table>${etapes(type).map(e=>`<tr><td>${etapeFaite(e.id,d,{naissance:patient.naissance,now})?'✓':'○'}</td><td>${esc(e.titre)}${e.niveau?' · '+esc(e.niveau):''}</td></tr>`).join('')}</table>
`}
 ${d.autorisation?.at?`<h2>Autorisation</h2><p>${esc(d.autorisation.texte)}</p><p>Signée en ligne par ${esc(d.autorisation.signataire)} (${esc(d.autorisation.qualite)}) le ${esc(fmtDT(d.autorisation.at))}${d.autorisation.secondParent?' · second titulaire : '+esc(d.autorisation.secondParent):''} · empreinte ${esc(String(d.autorisation.empreinte||'').slice(0,16))}</p>`:''}
 ${d.verification?.at?`<p>Préadmission vérifiée par ${esc(d.verification.by)} le ${esc(fmtDT(d.verification.at))}.</p>`:''}
 <footer>Document édité le ${esc(fmtDT(now.toISOString()))} par IASELO.</footer></article>`;
}

return {TYPES,MOTS_ENDOSCOPIE,typeSejour,ETAPES,ETAPE,etapes,informations,REGIMES,CHAMBRES,LIENS,age,formulaire,validerFormulaire,PIECES,PIECE,MULTIPLES,piecesRequises,piecesActives,piecesManquantes,texteAutorisation,validerAutorisation,etapeFaite,preadmissionFaite,etat,ETATS,RAPPELS,messages,recapHTML,isDate,fmtD,fmtDT};
});

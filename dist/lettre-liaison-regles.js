/* IASELO · lettre de liaison à la sortie : rubriques, destinataires et envoi automatique.
   Fonctions pures, partagées par l'écran du dossier (parcours-v8.js, lettre-liaison.js), la page patient
   (lettre-liaison-patient.js) et le serveur (worker/lettre-liaison.mjs). Testées dans tests/lettre-liaison.test.cjs.

   Envoi automatique dès la validation de la relecture par le médecin :
    - patient            : e-mail (ou SMS à défaut) contenant seulement un lien personnel ; la lettre s'ouvre
                           après saisie de la date de naissance (comme les prescriptions préopératoires) ;
    - médecin traitant   : messagerie sécurisée de santé MSSanté uniquement. Aucun e-mail ordinaire n'est envoyé
                           à un professionnel (données de santé) : sans adresse MSSanté, la lettre reste « à transmettre » ;
    - DMP                : dépôt dans Mon espace santé si le patient est informé et ne s'y oppose pas, INS qualifiée. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloLettreLiaison=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!isNaN(new Date(v+'T12:00:00'));
const fmtD=v=>isDate(v)?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):String(v||'');
// Domaine de confiance MSSanté : …@<domaine>.mssante.fr (professionnels, établissements, patients).
const isMssante=a=>/^[^\s@<>]+@([a-z0-9-]+\.)*mssante\.fr$/i.test(String(a||'').trim());

const PATIENT_ENVOI=['Oui, par e-mail (lien sécurisé)','Refus du patient'];
const DMP_INFO=['Informé, ne s’oppose pas','Opposition du patient','Information non faite'];

/* ---------- Rubriques de la lettre (critères HAS + destinataires) ---------- */
// [clé, libellé, type, obligatoire, options]
const SECTIONS=[
 ['Identité et destinataires',[
  ['birthname','Nom de naissance','text',true],['firstname','Prénom(s)','text',true],
  ['dob','Date de naissance','date',true],['sex','Sexe','text',true],
  ['gpStatus','Médecin traitant déclaré','select',true,['Déclaré','Aucun déclaré','Information inconnue']],
  ['gpName','Nom du médecin traitant'],['gpContact','Adresse postale ou électronique du médecin traitant'],
  ['gpMssante','Adresse MSSanté du médecin traitant','email'],
  ['referrer','Praticien adresseur et coordonnées, si applicable'],
  ['patientEnvoi','Copie au patient par e-mail','select',true,PATIENT_ENVOI],
  ['dmpInfo','Dossier médical partagé (DMP)','select',true,DMP_INFO]
 ]],
 ['Séjour et signataire',[
  ['admission','Date d’entrée','date',true],['admissionMode','Modalité d’entrée','text',true],
  ['departure','Date de sortie','date',true],['departureMode','Modalité / destination de sortie','text',true],
  ['doctor','Médecin signataire','text',true],['unit','Service','text',true],
  ['facility','Établissement','text',true],['contact','Coordonnées professionnelles','text',true],['rpps','RPPS']
 ]],
 ['Synthèse médicale',[
  ['reason','Motif d’hospitalisation','textarea',true],
  ['summary','Synthèse de la prise en charge et de l’évolution','textarea',true],
  ['condition','Situation clinique à la sortie','textarea',true],
  ['procedures','Actes techniques et examens réalisés · résultats utiles','textarea',true],
  ['incidents','Événements indésirables, si applicable','textarea'],
  ['infection','Micro-organismes multirésistants ou émergents, si applicable','textarea'],
  ['blood','Produits sanguins ou dérivés administrés, si applicable','textarea'],
  ['implant','Dispositif médical implanté, si applicable','textarea'],
  ['pending','Résultats en attente · suivi et responsable','textarea',true]
 ]],
 ['Traitements et suite des soins',[
  ['medications','Traitements de sortie · médicament, dose, rythme, voie et durée','textarea',true],
  ['changes','Traitements habituels poursuivis, modifiés ou arrêtés · préciser le motif','textarea',true],
  ['followup','Soins, rendez-vous et examens à programmer','textarea',true],
  ['surveillance','Recommandations, surveillances et conduite en cas de complication','textarea',true],
  ['urgentPhone','Téléphone à contacter en cas d’urgence','tel']
 ]]
];
// Rubriques de diffusion : utiles à l'envoi, pas imprimées dans le corps de la lettre.
const DIFFUSION=new Set(['gpMssante','patientEnvoi','dmpInfo']);
const FIELDS=SECTIONS.flatMap(([,f])=>f);
const LABEL=Object.fromEntries(FIELDS.map(([k,l])=>[k,l]));

// Contrôles propres à la diffusion (s'ajoutent aux critères HAS vérifiés par l'écran).
function controlerDiffusion(values){
 const errors=[];
 if(values.gpMssante&&!isMssante(values.gpMssante))errors.push('Adresse MSSanté du médecin traitant invalide (elle se termine par mssante.fr)');
 return errors;
}

/* ---------- Destinataires ---------- */
const CIBLES=[['patient','Patient'],['medecin','Médecin traitant'],['dmp','DMP · Mon espace santé']];
const CIBLE=Object.fromEntries(CIBLES);
// Ce qui partira à la validation, d'après la lettre et ce que le serveur sait du séjour.
// ctx : {contact:{email,phone}|null, mssanteMode, dmpMode, insQualifiee:boolean, messagerie:boolean}
function plan(values={},ctx={}){
 const out=[],c=ctx.contact||{},sim=m=>m!=='test'&&m!=='production';
 // Patient
 if(values.patientEnvoi==='Refus du patient')out.push({cible:'patient',etat:'sans-objet',texte:'Le patient a refusé l’envoi électronique : remettez-lui la lettre imprimée.'});
 else if(!ctx.messagerie)out.push({cible:'patient',etat:'a-faire',texte:'Envoi d’e-mails non configuré sur ce serveur : remettez la lettre imprimée.'});
 else if(c.email)out.push({cible:'patient',etat:'prevu',texte:'E-mail avec un lien personnel (date de naissance demandée), à l’adresse vérifiée du séjour.'});
 else if(c.phone)out.push({cible:'patient',etat:'prevu',texte:'Pas d’e-mail vérifié : SMS avec un lien personnel (date de naissance demandée).'});
 else out.push({cible:'patient',etat:'a-faire',texte:'Aucune coordonnée vérifiée (écran Questionnaire) : remettez la lettre imprimée.'});
 // Médecin traitant
 if(values.gpStatus!=='Déclaré')out.push({cible:'medecin',etat:'sans-objet',texte:'Pas de médecin traitant déclaré.'});
 else if(!values.gpMssante)out.push({cible:'medecin',etat:'a-faire',texte:'Adresse MSSanté manquante : aucun e-mail ordinaire n’est envoyé à un médecin (données de santé). Renseignez-la (annuaire santé) ou adressez la lettre imprimée.'});
 else if(!isMssante(values.gpMssante))out.push({cible:'medecin',etat:'a-completer',texte:'Adresse MSSanté invalide : elle se termine par mssante.fr.'});
 else out.push({cible:'medecin',etat:sim(ctx.mssanteMode)?'simule':'prevu',texte:'Messagerie sécurisée MSSanté'+(sim(ctx.mssanteMode)?' · simulation tant que la boîte MSSanté de l’établissement n’est pas ouverte':'')+'.'});
 // DMP
 if(values.dmpInfo==='Opposition du patient')out.push({cible:'dmp',etat:'sans-objet',texte:'Opposition du patient : pas de dépôt.'});
 else if(values.dmpInfo!=='Informé, ne s’oppose pas')out.push({cible:'dmp',etat:'a-completer',texte:'Indiquez si le patient a été informé du dépôt dans son DMP.'});
 else if(sim(ctx.dmpMode))out.push({cible:'dmp',etat:'simule',texte:'Dépôt simulé tant que la DMP-compatibilité (CNDA) n’est pas obtenue'+(ctx.insQualifiee?'':' · en réel, l’INS devra d’abord être qualifiée')+'.'});
 else if(!ctx.insQualifiee)out.push({cible:'dmp',etat:'a-faire',texte:'INS non qualifiée : le DMP refusera le dépôt (identitovigilance).'});
 else out.push({cible:'dmp',etat:'prevu',texte:'Dépôt dans le DMP du patient.'});
 return out;
}

const ETATS={
 'prevu':['Prévu','info'],'en-cours':['En cours','info'],'envoye':['Envoyé','ok'],'simule':['Simulé · rien n’est parti','sim'],
 'a-faire':['À transmettre autrement','warn'],'a-completer':['À compléter','warn'],'echec':['Échec','crit'],'sans-objet':['Sans objet','muted']
};

/* ---------- Empreinte d'une version ---------- */
// Texte canonique de la version relue : sert d'identifiant d'envoi (une version = un envoi automatique).
function canonique(doc){
 const v=doc?.values||{};
 return JSON.stringify({date:doc?.date||'',values:Object.fromEntries(Object.keys(v).sort().map(k=>[k,String(v[k]??'')]))});
}

/* ---------- Durée du lien patient ---------- */
const LIEN_JOURS=30;
const expiration=(at=new Date())=>new Date(new Date(at).getTime()+LIEN_JOURS*86400000).toISOString();

/* ---------- Messages au patient : aucun nom, motif ni donnée de santé ---------- */
function messages(establishment,link){
 const etab=establishment||'La clinique';
 return {
  sms:etab+' : vos documents de sortie sont disponibles : '+link+' (votre date de naissance vous sera demandée).',
  subject:'Vos documents de sortie · '+etab,
  text:'Bonjour,\n\n'+etab+' met à votre disposition vos documents de sortie :\n'+link+'\n\nVotre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas. Il reste valable '+LIEN_JOURS+' jours ; vous pouvez enregistrer le document en PDF.\nNe répondez pas à ce message et n’y indiquez aucune information médicale.\nSi ce message ne vous concerne pas, ignorez-le.\n\n'+etab,
  html:'<p>Bonjour,</p><p>'+escHtml(etab)+' met à votre disposition vos documents de sortie.</p><p><a href="'+escHtml(link)+'">Voir mes documents</a></p><p>Votre date de naissance vous sera demandée. Ce lien est personnel : ne le transférez pas. Il reste valable '+LIEN_JOURS+' jours ; vous pouvez enregistrer le document en PDF.</p><p>Ne répondez pas à ce message et n’y indiquez aucune information médicale. Si ce message ne vous concerne pas, ignorez-le.</p><p>'+escHtml(etab)+'</p>'
 };
}

/* ---------- Mise en page (PDF serveur, page patient) ---------- */
// Blocs : {t:'titre'|'sous-titre'|'section'|'libelle'|'texte', s}
function blocs(snap){
 const v=snap.values||{},out=[];
 out.push({t:'titre',s:'Lettre de liaison à la sortie'});
 out.push({t:'sous-titre',s:[v.facility,v.unit].filter(Boolean).join(' · ')});
 out.push({t:'sous-titre',s:'Rédigée le '+fmtD(snap.date)+(snap.sejour?' · séjour '+snap.sejour:'')});
 for(const [title,fields] of SECTIONS){
  const rows=fields.filter(([k])=>!DIFFUSION.has(k)&&String(v[k]||'').trim());if(!rows.length)continue;
  out.push({t:'section',s:title});
  for(const [k,l,type] of rows){out.push({t:'libelle',s:l});out.push({t:'texte',s:type==='date'?fmtD(v[k]):String(v[k])})}
 }
 out.push({t:'section',s:'Signature du médecin'});out.push({t:'texte',s:String(v.doctor||'')+(v.rpps?' · RPPS '+v.rpps:'')});
 if(snap.empreinte)out.push({t:'sous-titre',s:'Version '+String(snap.empreinte).slice(0,12)});
 return out;
}
function documentHTML(snap){
 return '<article class="discharge-rx-document liaison-document">'+blocs(snap).map(b=>{
  const s=escHtml(b.s);
  return b.t==='titre'?'<h2>'+s+'</h2>':b.t==='sous-titre'?'<p class="muted">'+s+'</p>':b.t==='section'?'<h3>'+s+'</h3>':b.t==='libelle'?'<strong>'+s+'</strong>':'<p class="preserve">'+s+'</p>';
 }).join('')+'</article>';
}

return {SECTIONS,FIELDS,LABEL,DIFFUSION,PATIENT_ENVOI,DMP_INFO,CIBLES,CIBLE,ETATS,LIEN_JOURS,isMssante,isDate,fmtD,controlerDiffusion,plan,canonique,expiration,messages,blocs,documentHTML};
});

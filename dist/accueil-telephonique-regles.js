/* IASELO · accueil téléphonique par IA (27/11/2026, point de la 3e veille) : règles, sans réseau.
   L'opérateur téléphonique (agent vocal) transcrit l'appel et transmet le texte ; IASELO renvoie ce que l'agent doit dire
   et range l'appel pour le secrétariat. En attendant l'opérateur, l'appel est SIMULÉ depuis l'écran « Accueil téléphonique ».
   Principes (à relire par l'équipe) :
   - urgence repérée → l'agent dit d'appeler le 15 et transfère au poste de garde, sans rien demander d'autre ;
   - l'identité de l'appelant n'est pas vérifiée au téléphone : l'agent ne donne AUCUNE information personnelle
     (date, heure, résultat, consigne propre au patient) ; il renvoie vers l'espace patient, le SMS reçu ou un rappel ;
   - toute demande non résolue crée un rappel pour le secrétariat, avec un résumé et le numéro (masqué dans les listes). */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./messagerie-regles.js'):root.IaseloMessagerie);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloTelephonie=api;})(typeof self!=='undefined'?self:this,function(M){
'use strict';
const plie=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// Ordre = priorité de détection. orientation : service qui reçoit le rappel.
const INTENTIONS=[
 {id:'annulation',libelle:'Annulation ou report d’intervention',orientation:'secretariat-bloc',priorite:2,
  re:/(annul|report|decal|repousser|plus venir|ne pourrai pas venir|empech).{0,40}(operation|intervention|chirurgie|bloc|hospitali)|(operation|intervention|chirurgie).{0,40}(annul|report|decal)/,
  reponse:'Je transmets votre demande au secrétariat du bloc, qui vous rappelle aujourd’hui pour convenir de la suite. Si vous êtes malade (fièvre, toux, infection), dites-le lors du rappel.'},
 {id:'rendez-vous',libelle:'Rendez-vous (consultation)',orientation:'secretariat',priorite:3,
  re:/(rendez|rdv|consultation|prendre un creneau|disponibilit|voir l.?anesthesiste|voir le docteur|voir le chirurgien)/,
  reponse:'Vous pouvez prendre ou déplacer votre rendez-vous avec le lien reçu par SMS. Sinon, je demande au secrétariat de vous rappeler.'},
 {id:'consignes',libelle:'Question sur la préparation',orientation:'infirmier',priorite:3,
  re:/(jeun|manger|boire|douche|bijou|vernis|medicament|traitement|arreter|anticoagul|heure d.?arrivee|a quelle heure|convocation|apporter|carte vitale)/,
  reponse:'Vos consignes personnelles et votre heure d’arrivée sont dans le SMS de convocation et dans votre espace patient. Je ne peux pas les donner au téléphone sans vérifier votre identité : une infirmière vous rappelle si besoin.'},
 {id:'apres-operation',libelle:'Question après l’opération',orientation:'infirmier',priorite:2,
  re:/(depuis l.?operation|apres l.?operation|opere|cicatri|pansement|fievre|douleur|mal\b|gonfl|nause|vomi|sortie)/,
  reponse:'Je transmets votre question à l’infirmière du service, qui vous rappelle. Vous pouvez aussi écrire à l’équipe depuis votre messagerie sécurisée.'},
 {id:'documents',libelle:'Documents, compte rendu, résultats',orientation:'secretariat',priorite:4,
  re:/(compte.?rendu|resultat|analyse|bilan|courrier|lettre|ordonnance|certificat|arret de travail|bulletin|dossier medical|copie)/,
  reponse:'Les documents sont déposés dans votre espace patient. Pour une copie ou un document manquant, le secrétariat vous rappelle.'},
 {id:'facturation',libelle:'Facture, dépassement, mutuelle',orientation:'facturation',priorite:4,
  re:/(factur|payer|paiement|devis|depassement|honorair|mutuelle|rembours|prise en charge|chambre (seule|particuliere))/,
  reponse:'Votre devis et vos factures sont accessibles par le lien reçu. Le service facturation vous rappelle pour toute question.'},
 {id:'visite',libelle:'Visites, accès, parking',orientation:'accueil',priorite:5,
  re:/(visite|horaire|parking|acces|adresse|venir|metro|bus|garer)/,
  reponse:'Je vous envoie par SMS l’adresse et les horaires de visite ? Sinon, l’accueil vous rappelle.'}
];
const AUTRE={id:'autre',libelle:'Autre demande',orientation:'secretariat',priorite:4,reponse:'Je transmets votre demande au secrétariat, qui vous rappelle dans la journée.'};
const ORIENTATIONS={garde:'Poste de garde (transfert immédiat)',secretariat:'Secrétariat médical','secretariat-bloc':'Secrétariat du bloc',infirmier:'Infirmière du service',facturation:'Facturation',accueil:'Accueil'};
// Heures d'ouverture du secrétariat (heure de Paris) : lundi-vendredi 8 h-18 h. Hors heures : message + rappel le jour ouvré suivant.
function ouvert(date=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
 const h=+p.hour+(+p.minute)/60;return !['Sat','Sun'].includes(p.weekday)&&h>=8&&h<18;
}
const masquer=n=>{const d=String(n||'').replace(/\D/g,'');return d.length<6?'***':d.slice(0,2)+' ** ** ** '+d.slice(-2)};
const normaliserNumero=n=>{let d=String(n||'').replace(/[^\d+]/g,'');if(d.startsWith('+33'))d='0'+d.slice(3);else if(d.startsWith('0033'))d='0'+d.slice(4);return /^0\d{9}$/.test(d)?d:''};
// Analyse d'un tour de parole transcrit. Renvoie ce que l'agent dit et ce que l'équipe voit. Ne pose aucun diagnostic.
function analyser(transcription,{date=new Date()}={}){
 const texte=String(transcription||'').replace(/\s+/g,' ').trim().slice(0,4000),s=plie(texte);
 const u=M?.assistant?M.assistant(texte).urgence:null;
 if(u)return {intention:'urgence',libelle:'Urgence : '+u.signe,orientation:'garde',priorite:1,transfert:true,rappel:false,
  reponse:'Ce que vous décrivez peut être grave. Raccrochez et appelez le 15 maintenant. Je vous transfère aussi au médecin de garde de la clinique.',texte};
 const i=INTENTIONS.find(x=>x.re.test(s))||AUTRE,heures=ouvert(date);
 const reponse=i.reponse+(heures?'':' Le secrétariat est fermé : vous serez rappelé le prochain jour ouvré à partir de 8 h. En cas d’urgence, appelez le 15.');
 return {intention:i.id,libelle:i.libelle,orientation:i.orientation,priorite:i.priorite,transfert:false,rappel:true,reponse,texte,horsHeures:!heures};
}
// Accueil dit par l'agent au décroché (aucune donnée personnelle).
const accueil=etab=>'Bonjour, vous êtes à '+(etab||'la clinique')+'. Je suis l’assistant vocal de l’accueil. En cas d’urgence vitale, raccrochez et appelez le 15. Dites-moi en quelques mots la raison de votre appel.';
const EXEMPLES=[
 'Bonjour, je dois être opérée jeudi, est-ce que je peux boire un café le matin ?',
 'Je voudrais décaler mon rendez-vous avec l’anesthésiste de la semaine prochaine.',
 'Mon père a été opéré hier, il a une douleur dans la poitrine et il respire mal.',
 'Je n’ai pas reçu mon compte rendu opératoire.',
 'Je ne pourrai pas venir pour mon opération lundi, je suis malade.'
];
return {INTENTIONS,AUTRE,ORIENTATIONS,analyser,ouvert,masquer,normaliserNumero,accueil,EXEMPLES};
});

/* IASELO · appel du lendemain par agent vocal (27/11/2026, 4e veille, lot D). Règles pures, sans réseau.
   Le lendemain de l'intervention, les patients qui n'ont pas répondu au questionnaire J+1 sont appelés par un
   agent vocal (opérateur à choisir ; SIMULATION en attendant). L'agent vérifie l'identité (date de naissance),
   pose les 8 questions du questionnaire J+1, comprend les réponses parlées (« sept », « trente-huit cinq », « non
   pas du tout ») et les enregistre comme le questionnaire : les alertes vont au médecin comme d'habitude.
   Un signe grave (essoufflement, douleur thoracique, saignement) → l'agent dit d'appeler le 15 immédiatement. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./veille-regles.js'):root.IaseloRegles);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloAppelJ1=api;})(typeof self!=='undefined'?self:globalThis,function(V){
'use strict';
const plie=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’]/g,' ').replace(/\s+/g,' ').trim();
const UNITES={zero:0,un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10};
const DIZAINES={trente:30,quarante:40};
// Nombre dit à voix haute : « 7 », « sept », « 38,5 », « trente-huit cinq », « trente-sept et demi », « 38 virgule 2 ».
function nombre(texte){
 const s=plie(texte).replace(/-/g,' ');
 const d=/(\d{1,2})(?:\s*(?:[.,]|virgule|degres?|point)\s*(\d))?/.exec(s);
 if(d)return Number(d[1]+(d[2]!==undefined?'.'+d[2]:''));
 const mots=s.split(' ');let i=mots.findIndex(m=>m in DIZAINES||m in UNITES);if(i<0)return null;
 let n=0;
 if(mots[i] in DIZAINES){n=DIZAINES[mots[i]];i++;if(mots[i]==='et')i++;if(mots[i] in UNITES&&UNITES[mots[i]]<10){n+=UNITES[mots[i]];i++}}
 else{n=UNITES[mots[i]];i++}
 while(['virgule','degre','degres','point'].includes(mots[i]))i++;
 if(mots[i]==='et'&&mots[i+1]==='demi')return n+0.5;
 if(n>=30&&mots[i] in UNITES&&UNITES[mots[i]]<10)return Number(n+'.'+UNITES[mots[i]]);
 return n;
}
// Oui / Non parlé ; null si la réponse n'est pas claire (l'agent repose la question une fois).
function ouiNon(texte){
 const s=plie(texte);if(!s)return null;
 if(/^(oui|ouais|si|bien sur|tout a fait|exactement|un peu|absolument)\b/.test(s))return 'Oui';
 if(/^(non|nan|pas du tout|aucun|aucune|jamais|pas vraiment|pas trop|du tout)\b/.test(s))return 'Non';
 if(/\b(pas du tout|aucun|aucune|jamais|pas de|pas d |ne .{1,20} pas|n .{1,20} pas)\b/.test(s))return 'Non';
 if(/\b(oui|un peu|beaucoup|j en ai|ca saigne|je saigne)\b/.test(s))return 'Oui';
 return null;
}
const QUESTIONS=()=>V.QUESTIONS_J1.map(([id,,type])=>({id,type:type==='number'?'number':'yesno',texte:V.QUESTIONS_J1_PATIENT[id]}));
const PARLE={douleur:'Sur une échelle de 0 à 10, quelle est votre douleur au repos ?',temperature:'Avez-vous pris votre température ? Si oui, combien ? Sinon, dites « non ».'};
// Ce que dit l'agent, dans l'ordre.
function script(etab,prenom=''){
 const e=etab||'la clinique';
 return {
  accueil:'Bonjour, ici l’assistant vocal de '+e+'. J’appelle pour prendre des nouvelles'+(prenom?' de '+prenom:'')+' après son intervention d’hier. Pour vérifier que je parle à la bonne personne, pouvez-vous me donner la date de naissance du patient ?',
  identiteKo:'Je ne peux pas poursuivre sans vérifier l’identité. Une infirmière vous rappellera. En cas d’urgence, appelez le 15. Au revoir.',
  questions:QUESTIONS().map(q=>({...q,parle:PARLE[q.id]||q.texte})),
  urgence:'Ce que vous décrivez peut être grave. Raccrochez et appelez le 15 maintenant. Je préviens aussi l’équipe médicale.',
  fin:'Merci. Vos réponses sont transmises à votre équipe. Si votre état change, appelez la clinique ; en cas d’urgence, le 15. Bonne journée.',
  repete:'Je n’ai pas bien compris. Pouvez-vous répondre par oui ou par non ?'
 };
}
const MOIS={janvier:1,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,septembre:9,octobre:10,novembre:11,decembre:12};
// Date de naissance dite : « 23 septembre 1975 », « 23/09/1975 », « le premier mars 1960 ».
function dateDite(texte){
 const s=plie(texte).replace(/\bpremier\b/,'1');
 let m=/(\d{1,2})[\/ .-](\d{1,2})[\/ .-](\d{4})/.exec(s);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 m=/(\d{1,2}) ([a-z]+) (\d{4})/.exec(s);if(m&&MOIS[m[2]])return m[3]+'-'+String(MOIS[m[2]]).padStart(2,'0')+'-'+m[1].padStart(2,'0');
 return '';
}
// Analyse d'un appel : {naissance, reponses:{id:texte}} → identité, réponses comprises, alertes, ce qu'a dit l'agent.
function analyser({naissance='',reponses={}}={},{naissanceAttendue='',etab='',prenom=''}={}){
 const sc=script(etab,prenom),dit=[sc.accueil],compris={},incomprises=[];
 if(!naissanceAttendue||dateDite(naissance)!==naissanceAttendue){dit.push(sc.identiteKo);return {identite:false,compris,incomprises,alertes:[],urgence:false,complet:false,dit,statut:'a-rappeler-ide'}}
 let urgence=false;
 for(const q of sc.questions){
  dit.push(q.parle);const brut=String(reponses[q.id]??'');
  let v=null;
  if(q.id==='temperature'){const r=ouiNon(brut),n=nombre(brut);v=n!=null&&n>=30?String(n):r==='Non'||!brut.trim()?'':null}
  else if(q.type==='number'){const n=nombre(brut);v=n!=null&&n>=0&&n<=10?String(n):null}
  else{v=ouiNon(brut);if(v===null&&brut.trim())dit.push(sc.repete)}
  if(v===null){incomprises.push(q.id);continue}
  if(v!=='')compris[q.id]=v;
  if((q.id==='respiration'||q.id==='saignement')&&v==='Oui'&&!urgence){urgence=true;dit.push(sc.urgence)}
 }
 const val=V.validerJ1(compris),alertes=V.alertesJ1(val.answers);
 if(incomprises.length)alertes.push({level:'warn',label:'Réponses non comprises par l’agent : '+incomprises.length+' (rappel infirmier)'});
 dit.push(sc.fin);
 return {identite:true,compris:val.answers,incomprises,alertes,urgence,complet:val.ok&&!incomprises.length,dit,statut:incomprises.length?'a-rappeler-ide':'joint'};
}
// Scénarios de démonstration (patients fictifs).
const SCENARIOS={
 bien:{libelle:'Tout va bien',reponses:{douleur:'deux',nausees:'non',saignement:'non pas du tout',temperature:'trente-sept deux',miction:'non',respiration:'non',mollet:'non',moral:'oui tout à fait'}},
 fievre:{libelle:'Douleur et fièvre',reponses:{douleur:'sept',nausees:'un peu oui',saignement:'non',temperature:'trente-huit cinq',miction:'non',respiration:'non',mollet:'non',moral:'oui'}},
 grave:{libelle:'Essoufflement (urgence)',reponses:{douleur:'quatre',nausees:'non',saignement:'non',temperature:'non',miction:'non',respiration:'oui depuis ce matin',mollet:'oui le mollet gauche',moral:'oui'}}
};
return {nombre,ouiNon,dateDite,script,analyser,SCENARIOS,MAX_TENTATIVES:2};
});

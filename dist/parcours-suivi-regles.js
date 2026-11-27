/* IASELO · parcours de soins à distance (RAAC, ambulatoire, endoscopie) de J-7 à J+30.
   Règles pures, sans accès réseau, testées dans tests/parcours-suivi.test.cjs :
   - PROGRAMMES : étapes datées par rapport au jour de l'intervention (fiche d'éducation, questionnaire de suivi,
     résultats rapportés par le patient (PROMs) et expérience du patient (PREMs)) ;
   - FICHES : contenus d'éducation génériques, sans donnée personnelle, à relire et adapter par l'équipe ;
   - QUESTIONNAIRES : questions, contrôle des réponses, alertes (mêmes seuils que le questionnaire J+1, À RELIRE) ;
   - proposer(), calendrier(), etatParcours(), indicateurs(), esatisCsv().
   Le questionnaire du lendemain (J+1) reste celui de worker/suivi-j1.mjs : il n'est pas répété ici. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloParcoursSuivi=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const ecart=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
const num=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

// Seuils d'alerte par défaut, alignés sur le questionnaire J+1 (veille-regles.js) : À RELIRE PAR L'ÉQUIPE MÉDICALE.
const SEUILS={douleur:4,douleurCritique:8,temperatureHaute:38,temperatureBasse:36,santeBasse:40};

/* ---------- Fiches d'éducation (contenu générique, sans donnée personnelle) ---------- */
const FICHES={
 preparer:{titre:'Préparer votre intervention',resume:'Ce qui aide à bien récupérer, dès maintenant.',sections:[
  ['Dans les jours qui viennent',['Marchez un peu chaque jour : une bonne forme avant l’intervention aide à récupérer plus vite.','Arrêtez ou réduisez le tabac et l’alcool : cela diminue les complications de cicatrisation et respiratoires.','Mangez équilibré et hydratez-vous normalement, sauf consigne contraire de votre équipe.']],
  ['À organiser pour le retour',['Prévoyez un accompagnant pour votre retour à domicile et, après une anesthésie, pour la première nuit si on vous l’a demandé.','Préparez votre domicile : passages dégagés, objets du quotidien à portée de main, tapis retirés.','Achetez à l’avance les médicaments et le matériel prescrits (ordonnances remises en consultation).']],
  ['Vos médicaments',['Suivez les consignes écrites de l’anesthésiste pour vos traitements habituels (à poursuivre, à arrêter, à quelle date).','Signalez tout nouveau médicament ou tout changement de santé (fièvre, infection, plaie) avant l’intervention.']]
 ]},
 veille:{titre:'La veille et le jour de l’intervention',resume:'Jeûne, douche, objets à apporter.',sections:[
  ['Le jeûne',['Respectez exactement les heures de jeûne qui vous ont été remises (aliments, puis boissons claires).','Ne fumez pas, ne mâchez pas de chewing-gum le matin de l’intervention.']],
  ['La douche',['Faites la douche demandée (savon simple ou antiseptique selon la consigne), cheveux compris si on vous l’a indiqué.','Retirez vernis, maquillage, bijoux et piercings. Ne rasez pas la zone opérée vous-même, sauf consigne.']],
  ['À apporter',['Pièce d’identité, carte Vitale, carte de mutuelle, documents et examens demandés.','La liste de vos médicaments, vos lunettes, appareils auditifs ou dentaires et leur boîte.']]
 ]},
 douleur:{titre:'Gérer la douleur à la maison',resume:'Prendre ses antalgiques au bon moment.',sections:[
  ['Les antalgiques',['Prenez les antalgiques prescrits aux horaires indiqués, sans attendre que la douleur soit forte.','Ne dépassez pas les doses de l’ordonnance. Le paracétamol est présent dans de nombreux médicaments : ne les cumulez pas.']],
  ['Ce qui soulage aussi',['Le froid (poche de glace protégée par un linge, 20 minutes) et la surélévation du membre opéré, si on vous l’a conseillé.','Le repos alterné avec de courtes marches.']],
  ['Quand appeler',['Si la douleur dépasse 4 sur 10 malgré le traitement, ou augmente au lieu de diminuer, appelez la clinique.']]
 ]},
 alerte:{titre:'Les signes qui doivent vous faire appeler',resume:'Fièvre, saignement, mollet, respiration.',sections:[
  ['Appelez la clinique si',['Votre température dépasse 38 °C, ou vous avez des frissons.','Votre cicatrice devient rouge, chaude, gonflée ou laisse couler du liquide.','Votre pansement est imbibé de sang.','Vous avez des nausées ou des vomissements qui empêchent de boire ou de prendre vos médicaments.']],
  ['Appelez le 15 sans attendre si',['Vous êtes essoufflé(e) ou avez une douleur dans la poitrine.','Un mollet devient douloureux, gonflé ou dur (risque de phlébite).','Vous faites un malaise.']]
 ]},
 reeducation:{titre:'Bouger pour mieux récupérer',resume:'Lever précoce et exercices.',sections:[
  ['Chaque jour',['Levez-vous et marchez plusieurs fois par jour, en augmentant progressivement la distance.','Faites les exercices montrés par le kinésithérapeute, sans forcer au-delà de la douleur.','Portez les bas de contention et faites les injections prescrites, s’il y en a, jusqu’à la date indiquée.']],
  ['À éviter',['Les longues périodes assises ou couchées sans bouger.','Le port de charges lourdes et la conduite tant que votre chirurgien ne l’a pas autorisé.']]
 ]},
 alimentation:{titre:'Manger et boire après une chirurgie digestive',resume:'Reprise alimentaire progressive.',sections:[
  ['Reprise alimentaire',['Reprenez l’alimentation dès que l’équipe l’autorise, par petites quantités, en mâchant bien.','Buvez régulièrement, par petites gorgées.','Le chewing-gum peut aider le transit à redémarrer, si on vous l’a conseillé.']],
  ['Appelez la clinique si',['Votre ventre gonfle et devient douloureux, ou vous n’avez ni gaz ni selles depuis plus de 48 heures.','Vous vomissez de façon répétée.']]
 ]}
};

/* ---------- Questionnaires ---------- */
// [id, type, question posée au patient, libellé court pour l'équipe]
// types : echelle (0 à 10), sante (0 à 100), temperature, oui-non, texte (facultatif)
const QUESTIONNAIRES={
 suivi:{titre:'Comment allez-vous ?',questions:[
  ['douleur','echelle','Votre douleur au repos, de 0 (aucune) à 10 (maximale)','Douleur'],
  ['temperature','temperature','Votre température, si vous l’avez prise (°C)','Température'],
  ['cicatrice','oui-non','Votre cicatrice est-elle rouge, chaude, gonflée, ou laisse-t-elle couler du liquide ?','Cicatrice inflammatoire'],
  ['saignement','oui-non','Saignez-vous, ou votre pansement est-il imbibé ?','Saignement'],
  ['respiration','oui-non','Êtes-vous essoufflé(e), ou avez-vous une douleur dans la poitrine ?','Essoufflement / douleur thoracique'],
  ['mollet','oui-non','Avez-vous une douleur ou un gonflement d’un mollet ?','Mollet douloureux'],
  ['marche','oui-non','Vous levez-vous et marchez-vous plusieurs fois par jour ?','Se lève et marche'],
  ['rappel','oui-non','Souhaitez-vous que l’équipe vous rappelle ?','Demande de rappel'],
  ['question','texte','Une question pour l’équipe ? (facultatif)','Question du patient']
 ]},
 'suivi-digestif':{titre:'Comment allez-vous ?',questions:[
  ['douleur','echelle','Votre douleur au repos, de 0 (aucune) à 10 (maximale)','Douleur'],
  ['temperature','temperature','Votre température, si vous l’avez prise (°C)','Température'],
  ['alimentation','oui-non','Arrivez-vous à manger et à boire ?','Mange et boit'],
  ['transit','oui-non','Avez-vous des gaz ou des selles depuis votre retour ?','Transit repris'],
  ['vomissements','oui-non','Vomissez-vous de façon répétée ?','Vomissements répétés'],
  ['cicatrice','oui-non','Votre cicatrice est-elle rouge, chaude, gonflée, ou laisse-t-elle couler du liquide ?','Cicatrice inflammatoire'],
  ['respiration','oui-non','Êtes-vous essoufflé(e), ou avez-vous une douleur dans la poitrine ?','Essoufflement / douleur thoracique'],
  ['rappel','oui-non','Souhaitez-vous que l’équipe vous rappelle ?','Demande de rappel'],
  ['question','texte','Une question pour l’équipe ? (facultatif)','Question du patient']
 ]},
 // Résultats rapportés par le patient à J+30 (PROMs), questions génériques IASELO (pas d'échelle sous licence).
 prom:{titre:'Un mois après votre intervention',questions:[
  ['douleur','echelle','Votre douleur aujourd’hui, de 0 (aucune) à 10 (maximale)','Douleur à J+30'],
  ['activites','echelle','Avez-vous repris vos activités habituelles ? De 0 (pas du tout) à 10 (complètement)','Reprise des activités'],
  ['sante','sante','Votre état de santé aujourd’hui, de 0 (le pire imaginable) à 100 (le meilleur)','État de santé (0-100)'],
  ['probleme','oui-non','Avez-vous dû consulter un médecin ou revenir à l’hôpital à cause de l’intervention ?','Recours aux soins non prévu'],
  ['ameliore','oui-non','Votre problème de santé est-il amélioré par l’intervention ?','Amélioration ressentie']
 ]},
 // Expérience du patient (PREMs) : cohérent avec les thèmes d'e-Satis, sans le remplacer.
 prem:{titre:'Votre avis sur votre séjour',questions:[
  ['information','echelle','Les informations reçues avant l’intervention étaient-elles claires ? De 0 à 10','Information avant l’intervention'],
  ['douleurPec','echelle','Votre douleur a-t-elle été bien prise en charge ? De 0 à 10','Prise en charge de la douleur'],
  ['accueil','echelle','Comment jugez-vous l’accueil et l’écoute de l’équipe ? De 0 à 10','Accueil et écoute'],
  ['sortie','echelle','Votre sortie a-t-elle été bien préparée ? De 0 à 10','Préparation de la sortie'],
  ['recommande','echelle','Recommanderiez-vous l’établissement à un proche ? De 0 (pas du tout) à 10 (certainement)','Recommandation (NPS)'],
  ['commentaire','texte','Un commentaire ? (facultatif)','Commentaire']
 ]}
};
QUESTIONNAIRES['prom-prem']={titre:'Un mois après : vos résultats et votre avis',questions:[...QUESTIONNAIRES.prom.questions,...QUESTIONNAIRES.prem.questions]};

/* ---------- Programmes ---------- */
// type : fiche (éducation) ou questionnaire. j : jour par rapport à l'intervention (J0).
const PROGRAMMES={
 'raac-ortho':{label:'RAAC orthopédie (prothèse, ligamentoplastie)',etapes:[
  {id:'j-7-preparer',j:-7,type:'fiche',fiche:'preparer'},
  {id:'j-2-veille',j:-2,type:'fiche',fiche:'veille'},
  {id:'j+2-douleur',j:2,type:'fiche',fiche:'douleur'},
  {id:'j+3-suivi',j:3,type:'questionnaire',questionnaire:'suivi'},
  {id:'j+5-reeducation',j:5,type:'fiche',fiche:'reeducation'},
  {id:'j+7-suivi',j:7,type:'questionnaire',questionnaire:'suivi'},
  {id:'j+14-suivi',j:14,type:'questionnaire',questionnaire:'suivi'},
  {id:'j+30-resultats',j:30,type:'questionnaire',questionnaire:'prom-prem'}
 ]},
 'raac-digestif':{label:'RAAC chirurgie digestive',etapes:[
  {id:'j-7-preparer',j:-7,type:'fiche',fiche:'preparer'},
  {id:'j-2-veille',j:-2,type:'fiche',fiche:'veille'},
  {id:'j+2-alimentation',j:2,type:'fiche',fiche:'alimentation'},
  {id:'j+3-suivi',j:3,type:'questionnaire',questionnaire:'suivi-digestif'},
  {id:'j+7-suivi',j:7,type:'questionnaire',questionnaire:'suivi-digestif'},
  {id:'j+14-suivi',j:14,type:'questionnaire',questionnaire:'suivi-digestif'},
  {id:'j+30-resultats',j:30,type:'questionnaire',questionnaire:'prom-prem'}
 ]},
 ambulatoire:{label:'Chirurgie ambulatoire',etapes:[
  {id:'j-7-preparer',j:-7,type:'fiche',fiche:'preparer'},
  {id:'j-2-veille',j:-2,type:'fiche',fiche:'veille'},
  {id:'j+2-alerte',j:2,type:'fiche',fiche:'alerte'},
  {id:'j+7-suivi',j:7,type:'questionnaire',questionnaire:'suivi'},
  {id:'j+30-resultats',j:30,type:'questionnaire',questionnaire:'prom-prem'}
 ]},
 endoscopie:{label:'Endoscopie',etapes:[
  {id:'j-2-veille',j:-2,type:'fiche',fiche:'veille'},
  {id:'j+7-avis',j:7,type:'questionnaire',questionnaire:'prem'}
 ]}
};
const ETAPE_LIBELLE=e=>(e.j<0?'J'+e.j:'J+'+e.j)+' · '+(e.type==='fiche'?'Fiche « '+FICHES[e.fiche].titre+' »':QUESTIONNAIRES[e.questionnaire].titre.replace(/ \?$/,'')+(e.questionnaire==='prom-prem'?' (PROMs + PREMs)':e.questionnaire==='prem'?' (PREMs)':''));
function etape(programme,id){return PROGRAMMES[programme]?.etapes.find(e=>e.id===id)||null}

// Programme proposé selon l'intervention, la spécialité et le mode (l'équipe confirme toujours).
function proposer({intervention='',specialite='',mode=''}={}){
 // L'intervention prime ; puis le mode (ambulatoire) ; la spécialité ne sert qu'en dernier recours.
 const t=norm(intervention),sp=norm(specialite);
 if(/endoscop|coloscop|gastroscop|fibroscop/.test(t))return 'endoscopie';
 if(/prothese|\bpt[ghe]\b|arthroplast|ligamentoplast|\blca\b/.test(t))return 'raac-ortho';
 if(/colect|sigmoid|gastrect|sleeve|bypass|hepatect|pancreat|rectum|colon/.test(t))return 'raac-digestif';
 if(norm(mode).includes('ambulatoire'))return 'ambulatoire';
 if(/orthop/.test(sp))return 'raac-ortho';
 if(/digest|viscer/.test(sp))return 'raac-digestif';
 return 'ambulatoire';
}

// Étapes datées (jour de l'intervention connu) ; une étape passée de plus de 2 jours sans envoi est « manquée ».
function calendrier(programme,dateIntervention,envois=[],reponses=[],jour=''){
 const p=PROGRAMMES[programme];if(!p||!isDate(dateIntervention))return [];
 return p.etapes.map(e=>{
  const date=decale(dateIntervention,e.j),envoi=[...envois].reverse().find(x=>x.etape===e.id&&x.ok)||null,echec=[...envois].reverse().find(x=>x.etape===e.id&&!x.ok)||null;
  const reponse=reponses.find(r=>r.etape===e.id)||null,lue=envois.some(x=>x.etape===e.id&&x.lue);
  let code='a-venir';
  if(reponse)code='repondu';else if(e.type==='fiche'&&lue)code='lue';else if(envoi)code=e.type==='fiche'?'envoyee':'en-attente';else if(echec)code='echec';else if(jour&&isDate(jour)&&ecart(date,jour)>2)code='manquee';else if(jour&&date<=jour)code='a-envoyer';
  return {...e,date,libelle:ETAPE_LIBELLE(e),code,envoi,echec,reponse};
 });
}
const ETATS={'a-venir':['À venir',''],'a-envoyer':['À envoyer','warn'],envoyee:['Envoyée','info'],lue:['Lue','ok'],'en-attente':['En attente de réponse','info'],repondu:['Répondu','ok'],echec:['Envoi impossible','crit'],manquee:['Non envoyée','']};

function questionsDe(id){return QUESTIONNAIRES[id]?.questions||[]}
function valider(id,input={}){
 const q=questionsDe(id),answers={},errors=[];if(!q.length)return {ok:false,errors:['Questionnaire inconnu.'],answers};
 for(const [k,type] of q){
  const v=input[k];
  if(type==='texte'){const s=String(v??'').trim().slice(0,500);if(s)answers[k]=s;continue}
  if(type==='temperature'){if(v===undefined||v===null||String(v).trim()==='')continue;const n=num(v);if(n==null||n<30||n>43)errors.push('Température invalide (entre 30 et 43 °C).');else answers[k]=n;continue}
  if(type==='echelle'||type==='sante'){const n=num(v),max=type==='sante'?100:10;if(n==null||n<0||n>max||!Number.isInteger(n))errors.push(type==='sante'?'Indiquez votre état de santé de 0 à 100.':'Répondez à chaque échelle de 0 à 10.');else answers[k]=n;continue}
  if(v==='Oui'||v==='Non')answers[k]=v;else errors.push('Répondez à chaque question.');
 }
 return {ok:!errors.length,errors:[...new Set(errors)],answers};
}
function alertes(id,rep={}){
 const out=[],q=new Set(questionsDe(id).map(x=>x[0])),n=num(rep.douleur),t=num(rep.temperature);
 const mettre=(level,label)=>out.push({level,label});
 if(q.has('douleur')&&n!=null&&n>SEUILS.douleur)mettre(n>=SEUILS.douleurCritique?'crit':'warn','Douleur '+n+'/10');
 if(t!=null&&t>SEUILS.temperatureHaute)mettre('warn','Fièvre '+String(t).replace('.',',')+' °C');
 if(t!=null&&t<SEUILS.temperatureBasse)mettre('warn','Température basse '+String(t).replace('.',',')+' °C');
 for(const [k,label,level] of [['cicatrice','Cicatrice inflammatoire','warn'],['saignement','Saignement','crit'],['respiration','Essoufflement ou douleur thoracique','crit'],['mollet','Signe de phlébite possible','crit'],['vomissements','Vomissements répétés','warn'],['probleme','Recours aux soins non prévu depuis la sortie','warn'],['rappel','Demande à être rappelé(e)','warn']])if(q.has(k)&&rep[k]==='Oui')mettre(level,label);
 for(const [k,label] of [['marche','Ne se lève pas / ne marche pas'],['alimentation','Ne mange pas / ne boit pas'],['transit','Transit non repris']])if(q.has(k)&&rep[k]==='Non')mettre('warn',label);
 if(q.has('sante')&&num(rep.sante)!=null&&num(rep.sante)<SEUILS.santeBasse)mettre('warn','État de santé ressenti bas ('+rep.sante+'/100)');
 if(String(rep.question||'').trim())mettre('info','Question du patient');
 return out;
}

// État d'un parcours (pour le tableau de bord).
function etatParcours(p,dateIntervention,jour){
 if(!p?.programme)return {code:'aucun',libelle:'Pas de parcours'};
 if(p.arret)return {code:'arrete',libelle:'Arrêté'};
 const cal=calendrier(p.programme,dateIntervention,p.envois||[],p.reponses||[],jour);
 if(!cal.length)return {code:'sans-date',libelle:'Date d’intervention inconnue',etapes:[]};
 const ouvertes=(p.reponses||[]).filter(r=>r.alerts?.some(a=>a.level!=='info')&&!r.traite).length,questions=(p.reponses||[]).filter(r=>r.alerts?.some(a=>a.level==='info')&&!r.traite).length;
 const prochaine=cal.find(e=>['a-venir','a-envoyer'].includes(e.code))||null,faites=cal.filter(e=>['repondu','lue','envoyee','en-attente'].includes(e.code)).length;
 const fini=cal.every(e=>!['a-venir','a-envoyer','en-attente'].includes(e.code));
 return {code:ouvertes?'alerte':questions?'question':fini?'termine':'en-cours',libelle:ouvertes?ouvertes+' alerte'+(ouvertes>1?'s':'')+' à traiter':questions?'Question du patient':fini?'Parcours terminé':'En cours',alertes:ouvertes,questions,prochaine,faites,total:cal.length,etapes:cal};
}

// Indicateurs qualité : taux de réponse, PROMs (douleur, activités, santé), PREMs et score de recommandation (NPS).
function indicateurs(parcours=[]){
 const reps=parcours.flatMap(p=>(p.reponses||[]).map(r=>({...r,programme:p.programme})));
 const envoisQ=parcours.flatMap(p=>(p.envois||[]).filter(e=>e.ok&&etape(p.programme,e.etape)?.type==='questionnaire').map(e=>({...e,stay:p.stay})));
 const unique=new Set(envoisQ.map(e=>e.stay+'|'+e.etape)).size||envoisQ.length;
 const val=k=>reps.map(r=>num(r.answers?.[k])).filter(v=>v!=null);
 const moy=a=>a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length*10)/10:null;
 const j30=reps.filter(r=>/^j\+30/.test(r.etape)),rec=reps.map(r=>num(r.answers?.recommande)).filter(v=>v!=null);
 const nps=rec.length?Math.round((rec.filter(v=>v>=9).length-rec.filter(v=>v<=6).length)/rec.length*100):null;
 return {
  inscrits:parcours.filter(p=>p.programme&&!p.arret).length,
  questionnairesEnvoyes:unique,reponses:reps.length,tauxReponse:unique?Math.round(Math.min(reps.length,unique)/unique*100):null,
  alertes:reps.filter(r=>r.alerts?.some(a=>a.level!=='info')).length,alertesOuvertes:reps.filter(r=>r.alerts?.some(a=>a.level!=='info')&&!r.traite).length,
  proms:{reponses:j30.length,douleur:moy(j30.map(r=>num(r.answers?.douleur)).filter(v=>v!=null)),activites:moy(j30.map(r=>num(r.answers?.activites)).filter(v=>v!=null)),sante:moy(j30.map(r=>num(r.answers?.sante)).filter(v=>v!=null)),recours:j30.filter(r=>r.answers?.probleme==='Oui').length,ameliore:j30.length?Math.round(j30.filter(r=>r.answers?.ameliore==='Oui').length/j30.length*100):null},
  prems:{reponses:rec.length,information:moy(val('information')),douleurPec:moy(val('douleurPec')),accueil:moy(val('accueil')),sortie:moy(val('sortie')),nps},
  parProgramme:Object.keys(PROGRAMMES).map(id=>({id,label:PROGRAMMES[id].label,inscrits:parcours.filter(p=>p.programme===id).length,reponses:reps.filter(r=>r.programme===id).length})).filter(x=>x.inscrits)
 };
}

/* ---------- Export e-Satis ---------- */
// Fichier des patients sortis sur la période, avec e-mail vérifié et sans opposition, pour le dépôt sur la plateforme
// e-Satis de l'ATIH. COLONNES À VÉRIFIER avec la notice e-Satis de l'année en cours avant tout dépôt.
const ESATIS_COLONNES=['finess','numero_sejour','email','date_entree','date_sortie','mode_hospitalisation'];
function esatisCsv(lignes,{finess=''}={}){
 const champ=v=>{const s=String(v??'');return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 const ok=lignes.filter(l=>l.email&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email)&&!l.opposition&&isDate(l.dateSortie));
 const corps=ok.map(l=>[finess,l.stay,l.email,l.dateEntree||l.dateSortie,l.dateSortie,/ambu/i.test(l.mode||'')?'ambulatoire':'hospitalisation'].map(champ).join(';'));
 return {csv:[ESATIS_COLONNES.join(';'),...corps].join('\r\n')+'\r\n',retenus:ok.length,exclus:lignes.length-ok.length,motifs:{sansEmail:lignes.filter(l=>!l.email).length,opposition:lignes.filter(l=>l.opposition).length}};
}

// SMS sans donnée de santé : établissement, message générique, lien personnel.
function sms(etablissement,etapeDef,lien){
 const etab=etablissement||'la clinique';
 return etapeDef?.type==='fiche'
  ?etab+' : votre équipe vous adresse des conseils pour votre séjour : '+lien+' . En cas d’urgence, appelez le 15.'
  :etab+' : votre équipe prend de vos nouvelles. Merci de répondre à quelques questions : '+lien+' (votre date de naissance vous sera demandée). En cas d’urgence, appelez le 15.';
}

return {SEUILS,FICHES,QUESTIONNAIRES,PROGRAMMES,ETATS,ESATIS_COLONNES,isDate,decale,etape,proposer,calendrier,questionsDe,valider,alertes,etatParcours,indicateurs,esatisCsv,sms,libelleEtape:ETAPE_LIBELLE};
});

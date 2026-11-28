/* IASELO · préhabilitation avant l'intervention (5e veille, lot 6, manque 9).
   Programme de J-30 à J-1 : marche, exercices, alimentation (protéines), arrêt du tabac. Le patient coche chaque jour
   sur son lien personnel ; l'équipe voit l'adhésion. Règles pures, testées dans tests/prehabilitation.test.cjs.
   CONTENU ET OBJECTIFS PAR DÉFAUT À FAIRE VALIDER PAR LES MÉDECINS (anesthésistes, chirurgiens) ET L'ÉQUIPE RAAC. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloPrehab=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const ecart=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
const DUREE=30,RATTRAPAGE=2,DECROCHAGE=3,MARCHE_DEFAUT=30;
// [id, type, question au patient, libellé court équipe]
const ITEMS={
 marche:{type:'minutes',question:'Combien de minutes avez-vous marché aujourd’hui ?',libelle:'Marche',conseil:'Marchez à un rythme qui vous essouffle un peu, en une ou plusieurs fois.'},
 exercices:{type:'oui-non',question:'Avez-vous fait vos exercices aujourd’hui ?',libelle:'Exercices',conseil:'Exercices de renforcement des jambes (se lever d’une chaise 10 fois, monter des marches) et de respiration profonde.'},
 nutrition:{type:'oui-non',question:'Avez-vous mangé des protéines à chaque repas ?',libelle:'Alimentation',conseil:'Une source de protéines à chaque repas : viande, poisson, œufs, laitages ou légumineuses. Buvez régulièrement.'},
 tabac:{type:'oui-non',question:'Avez-vous fumé aujourd’hui ?',libelle:'Sans tabac',conseil:'Chaque jour sans tabac compte, même juste avant l’intervention. Votre médecin ou le 39 89 (Tabac info service) peuvent vous aider.',inverse:true}
};
const ORDRE=['marche','exercices','nutrition','tabac'];
// Objectifs fixés par l'équipe à l'inscription.
function objectifs({items,marcheMin,fumeur}={}){
 // Le tabac n'est suivi que chez un fumeur (case cochée à l'inscription, puis conservé dans les objectifs).
 let l=(Array.isArray(items)?items:['marche','exercices','nutrition']).filter(i=>ITEMS[i]&&(i!=='tabac'||fumeur!==false));
 if(fumeur)l.push('tabac');l=ORDRE.filter(i=>l.includes(i));
 const m=Math.round(Number(marcheMin));
 return {items:l.length?l:['marche'],marcheMin:Number.isFinite(m)&&m>=5&&m<=180?m:MARCHE_DEFAUT};
}
// Fenêtre du programme : de J-30 (ou de l'inscription si plus tard) à J-1.
function fenetre(dateIntervention,dateInscription){
 if(!isDate(dateIntervention))return null;
 const debut0=decale(dateIntervention,-DUREE),debut=isDate(dateInscription)&&dateInscription>debut0?dateInscription:debut0,fin=decale(dateIntervention,-1);
 return debut>fin?null:{debut,fin,jours:ecart(debut,fin)+1};
}
const jours=(f)=>{const out=[];if(!f)return out;for(let d=f.debut;d<=f.fin;d=decale(d,1))out.push(d);return out};
// Jour que le patient peut remplir : aujourd'hui ou les 2 jours précédents, dans la fenêtre.
function saisissable(date,f,aujourdhui){return !!f&&isDate(date)&&date>=f.debut&&date<=f.fin&&date<=aujourdhui&&ecart(date,aujourdhui)<=RATTRAPAGE}
function valider(obj,valeurs={}){
 const out={},erreurs=[];
 for(const i of obj.items){const v=valeurs[i],def=ITEMS[i];
  if(def.type==='minutes'){const n=Number(v);if(v===''||v===null||v===undefined||!Number.isFinite(n)||n<0||n>600||!Number.isInteger(n))erreurs.push('Indiquez vos minutes de marche (0 à 600).');else out[i]=n}
  else if(v==='Oui'||v==='Non')out[i]=v;else erreurs.push('Répondez à chaque question.')}
 return {ok:!erreurs.length,erreurs:[...new Set(erreurs)],valeurs:out};
}
// Objectif du jour atteint, item par item.
function atteint(item,v,obj){const def=ITEMS[item];if(v===undefined||v===null)return null;if(def.type==='minutes')return Number(v)>=obj.marcheMin;return def.inverse?v==='Non':v==='Oui'}
// Adhésion : jours écoulés du programme, jours remplis, taux par item et global, série en cours, décrochage.
function adhesion(p,dateIntervention,aujourdhui){
 const obj=objectifs(p?.objectifs||{}),f=fenetre(dateIntervention,String(p?.inscrit?.at||'').slice(0,10));
 if(!f)return {code:'sans-date',libelle:'Date d’intervention inconnue ou passée',joursEcoules:0,remplis:0,taux:null,parItem:{}};
 const J=p?.journal||{},ecoules=jours(f).filter(d=>d<aujourdhui||(d===aujourdhui&&J[d]));// le jour en cours ne compte que s'il est rempli
 const remplis=ecoules.filter(d=>J[d]),parItem={};
 for(const i of obj.items){const ok=ecoules.filter(d=>atteint(i,J[d]?.[i],obj)===true).length;parItem[i]={atteints:ok,taux:ecoules.length?Math.round(ok/ecoules.length*100):null,libelle:ITEMS[i].libelle}}
 const cases=ecoules.length*obj.items.length,ok=Object.values(parItem).reduce((s,x)=>s+x.atteints,0);
 let serie=0;for(let k=ecoules.length-1;k>=0;k--){if(J[ecoules[k]])serie++;else break}
 const dernier=Object.keys(J).filter(isDate).sort().at(-1)||'';
 const sansNouvelles=ecoules.length?(dernier?ecart(dernier,ecoules.at(-1)):ecoules.length):0;
 const termine=aujourdhui>f.fin,avant=aujourdhui<f.debut;
 const code=p?.arret?'arrete':avant?'a-venir':termine?'termine':sansNouvelles>=DECROCHAGE?'decrochage':'en-cours';
 const LIB={arrete:'Arrêté','a-venir':'Commence le '+f.debut.split('-').reverse().join('/'),termine:'Programme terminé',decrochage:'Pas de saisie depuis '+sansNouvelles+' jours','en-cours':'En cours'};
 return {code,libelle:LIB[code],fenetre:f,joursEcoules:ecoules.length,remplis:remplis.length,tauxSaisie:ecoules.length?Math.round(remplis.length/ecoules.length*100):null,taux:cases?Math.round(ok/cases*100):null,parItem,serie,dernier,sansNouvelles,objectifs:obj,jRestants:termine?0:ecart(aujourdhui<f.debut?f.debut:aujourdhui,f.fin)+1};
}
// Patient à proposer : intervention entre J+7 et J+45 (le programme garde au moins une semaine).
function aProposer(dateIntervention,aujourdhui){return isDate(dateIntervention)&&ecart(aujourdhui,dateIntervention)>=7&&ecart(aujourdhui,dateIntervention)<=45}
// SMS sans donnée de santé.
function sms(etablissement,lien){return (etablissement||'La clinique')+' : votre programme de préparation à l’intervention est disponible. Cochez chaque jour vos activités : '+lien+' (votre date de naissance vous sera demandée).'}
return {DUREE,RATTRAPAGE,DECROCHAGE,MARCHE_DEFAUT,ITEMS,ORDRE,isDate,decale,ecart,objectifs,fenetre,jours,saisissable,valider,atteint,adhesion,aProposer,sms};
});

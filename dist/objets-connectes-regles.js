/* IASELO · objets connectés du télésuivi (27/11/2026, 4e veille, lot G). Règles pures, sans réseau.
   Après la sortie, le patient peut utiliser des appareils connectés prêtés par la clinique (tensiomètre, oxymètre,
   thermomètre, balance, podomètre). Les mesures arrivent par la passerelle du fournisseur (à choisir, hébergement HDS ;
   SIMULATION en attendant), sont rattachées au séjour par le numéro de série de l'appareil et contrôlées par des seuils
   d'alerte (à valider par les médecins). Une alerte apparaît dans le Télésuivi ; elle n'est pas une urgence vitale :
   le patient garde la consigne d'appeler le 15. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloObjets=api})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const APPAREILS={
 tension:{libelle:'Tensiomètre',mesures:['pas_sys','pas_dia','fc']},
 oxymetre:{libelle:'Oxymètre de pouls',mesures:['spo2','fc']},
 thermometre:{libelle:'Thermomètre',mesures:['temp']},
 balance:{libelle:'Balance',mesures:['poids']},
 podometre:{libelle:'Podomètre (activité)',mesures:['pas']}
};
const MESURES={pas_sys:{libelle:'Pression systolique',unite:'mmHg',min:50,max:260},pas_dia:{libelle:'Pression diastolique',unite:'mmHg',min:30,max:160},fc:{libelle:'Fréquence cardiaque',unite:'/min',min:25,max:220},
 spo2:{libelle:'Saturation (SpO₂)',unite:'%',min:50,max:100},temp:{libelle:'Température',unite:'°C',min:33,max:43},poids:{libelle:'Poids',unite:'kg',min:20,max:300},pas:{libelle:'Pas par jour',unite:'pas',min:0,max:60000}};
// Seuils par défaut (à valider par les médecins de l'établissement).
const SEUILS={spo2:{crit:90,warn:94},temp:{warn:38.5,crit:39.5},pas_sys:{bas:90,haut:180},fc:{haut:120,bas:45},poidsPrise:2,pasMin:500};
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
function validerMesure(m={}){
 const type=Object.hasOwn(MESURES,m.type)?m.type:'',v=num(m.valeur),at=String(m.at||'');
 if(!type)return {ok:false,error:'Type de mesure inconnu.'};
 if(v==null||v<MESURES[type].min||v>MESURES[type].max)return {ok:false,error:MESURES[type].libelle+' hors des valeurs possibles.'};
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)||Number.isNaN(Date.parse(at)))return {ok:false,error:'Date de mesure invalide.'};
 return {ok:true,mesure:{type,valeur:v,at:at.slice(0,16)}};
}
const fmt=(t,v)=>String(v).replace('.',',')+' '+MESURES[t].unite;
// Niveau d'alerte d'une mesure isolée.
function niveau(type,v){
 if(type==='spo2')return v<SEUILS.spo2.crit?'crit':v<SEUILS.spo2.warn?'warn':'';
 if(type==='temp')return v>=SEUILS.temp.crit?'crit':v>=SEUILS.temp.warn?'warn':'';
 if(type==='pas_sys')return v<SEUILS.pas_sys.bas||v>SEUILS.pas_sys.haut?'warn':'';
 if(type==='fc')return v>SEUILS.fc.haut||v<SEUILS.fc.bas?'warn':'';
 return '';
}
// Alertes d'une série (mesures triées) : seuils, prise de poids rapide (3 jours), activité très faible à partir de J+3.
function alertes(mesures=[],{sortie=''}={}){
 const out=[],tri=[...mesures].sort((a,b)=>a.at.localeCompare(b.at));
 for(const m of tri){const n=niveau(m.type,m.valeur);if(n)out.push({niveau:n,type:m.type,at:m.at,cle:m.type+'|'+m.at,titre:MESURES[m.type].libelle+' : '+fmt(m.type,m.valeur)})}
 const poids=tri.filter(m=>m.type==='poids');
 for(let i=0;i<poids.length;i++){const ref=poids.filter(p=>Date.parse(p.at)>=Date.parse(poids[i].at)-3*864e5&&Date.parse(p.at)<Date.parse(poids[i].at));if(!ref.length)continue;const d=poids[i].valeur-Math.min(...ref.map(p=>p.valeur));
  if(d>=SEUILS.poidsPrise)out.push({niveau:'warn',type:'poids',at:poids[i].at,cle:'poids|'+poids[i].at,titre:'Prise de poids de '+String(Math.round(d*10)/10).replace('.',',')+' kg en 3 jours'})}
 if(sortie){for(const m of tri.filter(x=>x.type==='pas')){const j=Math.floor((Date.parse(m.at.slice(0,10))-Date.parse(sortie))/864e5);if(j>=3&&m.valeur<SEUILS.pasMin)out.push({niveau:'info',type:'pas',at:m.at,cle:'pas|'+m.at,titre:'Activité très faible : '+m.valeur+' pas (J+'+j+')'})}}
 const ordre={crit:0,warn:1,info:2};return out.sort((a,b)=>ordre[a.niveau]-ordre[b.niveau]||b.at.localeCompare(a.at));
}
// Série de démonstration (patients fictifs) sur n jours à partir d'une date : normal, désaturation ou fièvre.
function simuler(appareils,{depuis,jours=5,scenario='normal'}={}){
 const out=[],d0=Date.parse(depuis+'T08:00:00Z');let seed=7;const alea=()=>{seed=(seed*16807)%2147483647;return (seed%1000)/1000};
 for(let j=0;j<jours;j++){const at=new Date(d0+j*864e5).toISOString().slice(0,16),dernier=j===jours-1;
  for(const a of appareils){
   if(a==='tension'){out.push({type:'pas_sys',valeur:Math.round(118+alea()*20),at},{type:'pas_dia',valeur:Math.round(70+alea()*12),at},{type:'fc',valeur:Math.round(scenario==='fievre'&&dernier?112:68+alea()*15),at})}
   if(a==='oxymetre'){out.push({type:'spo2',valeur:scenario==='desaturation'&&dernier?89:Math.round(95+alea()*3),at})}
   if(a==='thermometre'){out.push({type:'temp',valeur:scenario==='fievre'&&dernier?38.9:Math.round((36.5+alea()*0.7)*10)/10,at})}
   if(a==='balance'){out.push({type:'poids',valeur:Math.round((72+(scenario==='poids'?j*0.9:alea()*0.4))*10)/10,at})}
   if(a==='podometre'){out.push({type:'pas',valeur:Math.round(scenario==='normal'?1500+j*900+alea()*400:300+alea()*150),at})}
  }}
 return out;
}
const SCENARIOS={normal:'Récupération normale',desaturation:'Désaturation le dernier jour',fievre:'Fièvre le dernier jour',poids:'Prise de poids rapide'};
return {APPAREILS,MESURES,SEUILS,SCENARIOS,validerMesure,niveau,alertes,simuler};
});

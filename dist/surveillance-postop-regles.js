/* IASELO · surveillance postopératoire (SSPI et hospitalisation) : paramètres suivis, seuils d'alerte, séries du graphe.
   Fonctions pures testées dans tests/surveillance-postop.test.cjs.
   Les seuils sont des VALEURS PAR DÉFAUT à faire relire par l'anesthésiste référent et le CLUD de l'établissement :
   ils aident au repérage, ils ne remplacent ni le jugement clinique ni les protocoles de service. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloSurveillance=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const num=v=>{if(v===''||v===null||v===undefined)return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const has=v=>v!==''&&v!==null&&v!==undefined;

/* Paramètres chiffrés tracés en courbe ou en barres.
   normal : bande grisée « attendue » sur le graphe ; echelle : bornes de l'axe ; limites : bornes de saisie. */
const MESURES=[
 {key:'sbp',label:'PA systolique',court:'PAS',unite:'mmHg',limites:[30,300],pas:1},
 {key:'dbp',label:'PA diastolique',court:'PAD',unite:'mmHg',limites:[10,200],pas:1},
 {key:'hr',label:'Fréquence cardiaque',court:'FC',unite:'/min',limites:[20,250],pas:1,normal:[50,100],echelle:[30,160]},
 {key:'spo2',label:'Saturation',court:'SpO₂',unite:'%',limites:[50,100],pas:1,normal:[95,100],echelle:[80,100]},
 {key:'rr',label:'Fréquence respiratoire',court:'FR',unite:'/min',limites:[0,70],pas:1,normal:[12,20],echelle:[0,40]},
 {key:'temp',label:'Température',court:'T°',unite:'°C',limites:[30,43],pas:0.1,normal:[36,38],echelle:[34.5,40.5]},
 {key:'pain',label:'Douleur au repos (EN)',court:'EN repos',unite:'/10',limites:[0,10],pas:1,entier:true,normal:[0,3],echelle:[0,10]},
 {key:'painMove',label:'Douleur à la mobilisation (EN)',court:'EN mobil.',unite:'/10',limites:[0,10],pas:1,entier:true},
 {key:'o2Flow',label:'Débit d’oxygène',court:'O₂',unite:'L/min',limites:[0,15],pas:0.5},
 {key:'diuresis',label:'Diurèse depuis le relevé précédent',court:'Diurèse',unite:'mL',limites:[0,5000],pas:10},
 {key:'bladder',label:'Volume vésical (bladder scan)',court:'Bladder',unite:'mL',limites:[0,2000],pas:10},
 {key:'drain',label:'Drains · volume depuis le relevé précédent',court:'Drains',unite:'mL',limites:[0,5000],pas:5},
 {key:'glycemia',label:'Glycémie capillaire',court:'Glyc.',unite:'g/L',limites:[0.1,8],pas:0.01}
];

/* Critères cotés (une case par relevé dans la grille sous les courbes). */
const COTATIONS=[
 {key:'avpu',label:'Conscience (AVPU)',court:'Conscience',options:[['A','A · alerte'],['C','C · confusion nouvelle'],['V','V · réagit à la voix'],['P','P · réagit à la douleur'],['U','U · aucune réaction']]},
 {key:'sedation',label:'Sédation (EDS 0 à 3)',court:'Sédation',options:[['0','0 · éveillé'],['1','1 · somnolent, éveillable à la voix'],['2','2 · somnolent, éveillable à la stimulation tactile'],['3','3 · non éveillable']]},
 {key:'o2',label:'Oxygène',court:'Oxygène',options:[['Air','Air ambiant'],['Oxygène','Sous oxygène']]},
 {key:'nvpo',label:'Nausées, vomissements',court:'NVPO',options:[['0','0 · aucun'],['1','1 · nausées'],['2','2 · vomissements']]},
 {key:'dressing',label:'Pansement',court:'Pansement',options:[['Sec','Sec'],['Taché','Taché, limité'],['Saturé','Saturé ou saignement actif'],['Refait','Refait']]},
 {key:'miction',label:'Miction',court:'Miction',options:[['Oui','Spontanée'],['Non','Pas de miction'],['Sonde','Sonde urinaire'],['Sondage','Sondage évacuateur']]},
 {key:'bromage',label:'Bloc moteur (Bromage 0 à 3)',court:'Bromage',options:[['0','0 · aucun bloc'],['1','1 · flexion genou possible'],['2','2 · flexion de cheville seule'],['3','3 · bloc complet']]},
 {key:'limb',label:'Membre opéré · pouls, chaleur, sensibilité, mobilité',court:'Membre',options:[['Normal','Normal'],['Anomalie','Anomalie']]}
];
const libelleOption=(key,v)=>{const c=COTATIONS.find(x=>x.key===key);const o=c?.options.find(([val])=>String(val)===String(v));return o?o[1]:String(v??'')};

/* Seuils d'alerte par défaut. niveau 'crit' = appel médical immédiat ; 'warn' = réévaluation / protocole de service. */
const SEUILS={
 sbp:{crit:{bas:90,haut:180},warn:{bas:100,haut:160}}, dbp:{warn:{haut:110}}, hr:{crit:{bas:45,haut:130},warn:{bas:50,haut:110}},
 spo2:{crit:{bas:90},warn:{bas:94}}, rr:{crit:{bas:10,haut:30},warn:{bas:12,haut:25}}, temp:{crit:{bas:35,haut:39.5},warn:{bas:36,haut:38.5}},
 pain:{crit:{haut:7},warn:{haut:4}}, painMove:{crit:{haut:8},warn:{haut:5}}, bladder:{crit:{haut:800},warn:{haut:500}},
 drain:{crit:{haut:200},warn:{haut:100}}, glycemia:{crit:{bas:0.6,haut:3},warn:{bas:0.7,haut:2.5}}
};
/* Renvoie 'crit' | 'warn' | '' pour une valeur chiffrée : alerte si valeur < bas ou valeur ≥ haut. */
function niveau(key,value){const n=num(value),s=SEUILS[key];if(n===null||!s)return '';
 const hors=b=>!!b&&((b.bas!==undefined&&n<b.bas)||(b.haut!==undefined&&n>=b.haut));
 return hors(s.crit)?'crit':hors(s.warn)?'warn':''}
function niveauCotation(key,v){if(!has(v))return '';v=String(v);
 if(key==='avpu')return v==='A'?'':'crit';
 if(key==='sedation')return v==='3'?'crit':v==='2'?'warn':'';
 if(key==='nvpo')return v==='2'?'warn':v==='1'?'info':'';
 if(key==='dressing')return v==='Saturé'?'crit':v==='Taché'?'info':'';
 if(key==='limb')return v==='Anomalie'?'crit':'';
 if(key==='miction')return v==='Non'?'info':'';
 if(key==='bromage')return v==='3'?'info':'';
 return ''}

/* Alertes d'un relevé. prev = relevé antérieur (valeurs), pour les évolutions (bloc moteur qui s'aggrave). */
function alertes(v={},prev=null){
 const out=[],add=(n,key,message)=>{if(n==='crit'||n==='warn')out.push({niveau:n,key,message})};
 const msg={
  sbp:x=>x<100?'Hypotension (PAS '+x+' mmHg) : vérifier saignement, volémie, analgésie, prévenir l’anesthésiste.':'Hypertension (PAS '+x+' mmHg) : rechercher douleur, globe, agitation ; avis médical.',
  dbp:x=>'PAD élevée ('+x+' mmHg).',
  hr:x=>x<50?'Bradycardie ('+x+'/min).':'Tachycardie ('+x+'/min) : douleur, hypovolémie, saignement, fièvre ?',
  spo2:x=>'Désaturation (SpO₂ '+x+' %)'+(v.o2==='Oxygène'?' sous oxygène':'')+' : position, oxygène, appel médical si persistante.',
  rr:x=>x<12?'Bradypnée ('+x+'/min) : rechercher une sédation morphinique.':'Polypnée ('+x+'/min).',
  temp:x=>x<36?'Hypothermie ('+x+' °C) : réchauffement.':'Fièvre ('+x+' °C) : bilan selon protocole, prévenir le médecin.',
  pain:x=>'Douleur au repos EN '+x+'/10 : antalgie selon prescription, réévaluer dans l’heure.',
  painMove:x=>'Douleur à la mobilisation EN '+x+'/10 : adapter l’antalgie avant le lever et la kinésithérapie.',
  bladder:x=>'Globe vésical ('+x+' mL) : sondage évacuateur selon protocole.',
  drain:x=>'Drains : '+x+' mL depuis le relevé précédent, prévenir le chirurgien.',
  glycemia:x=>x<0.7?'Hypoglycémie ('+x+' g/L) : resucrage selon protocole.':'Hyperglycémie ('+x+' g/L) : protocole insuline.'
 };
 for(const k of Object.keys(msg)){const n=num(v[k]);if(n!==null)add(niveau(k,n),k,msg[k](n))}
 if(has(v.avpu)&&v.avpu!=='A')add('crit','avpu',v.avpu==='C'?'Confusion nouvelle : appel médical, glycémie, SpO₂.':'Trouble de conscience ('+libelleOption('avpu',v.avpu)+') : appel médical immédiat.');
 if(v.sedation==='3')add('crit','sedation','Patient non éveillable : arrêt des morphiniques, oxygène, appel médical, naloxone selon protocole.');
 else if(v.sedation==='2')add('warn','sedation','Sédation 2 : suspendre la titration morphinique, surveillance rapprochée.');
 if(num(v.rr)!==null&&num(v.rr)<10&&['2','3'].includes(String(v.sedation)))add('crit','morphine','Sédation ≥ 2 et FR < 10 : suspicion de surdosage morphinique, naloxone selon protocole.');
 if(v.nvpo==='2')add('warn','nvpo','Vomissements : antiémétique selon prescription.');
 if(v.dressing==='Saturé')add('crit','dressing','Pansement saturé ou saignement actif : compression, prévenir le chirurgien.');
 if(v.limb==='Anomalie')add('crit','limb','Surveillance vasculo-nerveuse anormale : prévenir le chirurgien (syndrome des loges, compression).');
 if(prev&&has(v.bromage)&&has(prev.bromage)&&Number(v.bromage)>Number(prev.bromage))add('crit','bromage','Bloc moteur qui s’aggrave (Bromage '+prev.bromage+' → '+v.bromage+') : appel de l’anesthésiste (hématome périmédullaire ?).');
 if(prev&&num(v.o2Flow)!==null&&num(prev.o2Flow)!==null&&num(v.o2Flow)>num(prev.o2Flow)&&num(v.o2Flow)>=3)add('warn','o2Flow','Besoin en oxygène croissant ('+prev.o2Flow+' → '+v.o2Flow+' L/min).');
 const ordre={crit:0,warn:1};return out.sort((a,b)=>ordre[a.niveau]-ordre[b.niveau]);
}

/* Vérification de saisie : renvoie '' ou un message. */
function verifier(v={}){
 for(const m of MESURES){if(!has(v[m.key]))continue;const n=num(v[m.key]);
  if(n===null)return m.label+' : valeur non numérique.';
  if(m.entier&&!Number.isInteger(n))return m.label+' : nombre entier attendu.';
  if(n<m.limites[0]||n>m.limites[1])return m.label+' : valeur hors limites ('+m.limites[0]+' à '+m.limites[1]+' '+m.unite+'), à vérifier.';}
 if(has(v.sbp)&&has(v.dbp)&&num(v.dbp)>=num(v.sbp))return 'La PA diastolique doit être inférieure à la systolique.';
 for(const c of COTATIONS)if(has(v[c.key])&&!c.options.some(([val])=>String(val)===String(v[c.key])))return c.label+' : cotation inconnue.';
 if(has(v.o2Flow)&&num(v.o2Flow)>0&&v.o2==='Air')return 'Débit d’oxygène renseigné alors que le patient est noté en air ambiant.';
 return '';
}
const renseigne=v=>MESURES.some(m=>has(v?.[m.key]))||COTATIONS.some(c=>has(v?.[c.key]))||has(v?.note);

/* Description texte d'un relevé (historique, relève, export). */
function decrire(v={}){
 const parts=[];
 if(has(v.sbp)||has(v.dbp))parts.push('PA '+(has(v.sbp)?v.sbp:'?')+'/'+(has(v.dbp)?v.dbp:'?')+' mmHg');
 for(const m of MESURES){if(['sbp','dbp'].includes(m.key)||!has(v[m.key]))continue;parts.push(m.court+' '+v[m.key]+(m.unite.startsWith('/')?'':' ')+m.unite)}
 for(const c of COTATIONS)if(has(v[c.key]))parts.push(c.key==='o2'?(v.o2==='Air'?'Air ambiant':'Sous O₂'):c.key==='miction'?'Miction : '+libelleOption('miction',v.miction).toLowerCase():c.court+' '+(c.key==='avpu'?v[c.key]:libelleOption(c.key,v[c.key]).replace(/^\d · /,v[c.key]+' · ')));
 if(has(v.note))parts.push(String(v.note));
 return parts.join(' · ');
}

/* Relevés valides triés, alertes calculées avec le relevé précédent du même paramètre. */
function chronologie(records=[]){
 const recs=[...records].filter(r=>r&&!r.voided&&r.at&&Number.isFinite(new Date(r.at).getTime())).sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.created||'').localeCompare(String(b.created||'')));
 const dernier={};
 return recs.map(r=>{const v=r.values||{},prev={};for(const k of ['bromage','o2Flow'])if(dernier[k]!==undefined)prev[k]=dernier[k];
  const a=alertes(v,Object.keys(prev).length?prev:null);for(const k of ['bromage','o2Flow'])if(has(v[k]))dernier[k]=v[k];
  return {record:r,t:new Date(r.at).getTime(),values:v,alertes:a}});
}
/* Fenêtre de temps affichée : les N dernières heures avant le dernier relevé (ou tout). */
function fenetre(points,heures){if(!points.length)return {points,debut:null,fin:null};const fin=points.at(-1).t;
 const debut=heures?fin-heures*3600e3:points[0].t;const pts=points.filter(p=>p.t>=debut);
 const d=heures?Math.max(debut,pts[0].t):pts[0].t;return {points:pts,debut:d===fin?fin-3600e3:d,fin}}
/* Graduations horaires « jolies » entre deux instants (pas de 1, 2, 3, 4, 6, 12 ou 24 h). */
function graduations(debut,fin,max=8){const h=3600e3,span=Math.max(fin-debut,h);const pas=[0.5,1,2,3,4,6,12,24].find(x=>span/(x*h)<=max)||48;
 const step=pas*h,first=Math.ceil(debut/step)*step,out=[];for(let t=first;t<=fin;t+=step)out.push(t);return out}

return {num,has,MESURES,COTATIONS,SEUILS,libelleOption,niveau,niveauCotation,alertes,verifier,renseigne,decrire,chronologie,fenetre,graduations};
});

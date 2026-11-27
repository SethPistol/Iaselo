/* IASELO · surveillance centralisée des patients hospitalisés (27/11/2026, 4e veille, manques 1 et 6).
   Règles pures, sans réseau. Pour chaque séjour présent (bloc, SSPI, service), calcule les alertes à partir de ce qui est
   déjà saisi : dernières constantes (NEWS2, qSOFA), douleur, retard de surveillance, Braden, Morse, IMC (dénutrition).
   Les seuils sont ceux des référentiels cités ; ils sont À FAIRE VALIDER par les médecins de l'établissement.
   - NEWS2 (Royal College of Physicians 2017) : ≥ 7 critique, 5-6 ou un paramètre à 3 : alerte ;
   - qSOFA (Sepsis-3, Singer 2016) : FR ≥ 22, PAS ≤ 100, conscience altérée ; ≥ 2 = sepsis possible, à évaluer ;
   - dénutrition (HAS 2019 adulte, 2021 ≥ 70 ans) : IMC ≤ 18,5, ou < 22 à partir de 70 ans → dépistage complet ;
   - Braden ≤ 12 (risque élevé d'escarre), Morse ≥ 45 (risque élevé de chute) ;
   - surveillance attendue : SSPI toutes les 15 min (alerte après 30 min), service toutes les 8 h (alerte après 8 h).
   extraireConstantes(texte) : lit une dictée infirmière (« tension 125 sur 80, pouls 88, saturation 96… »)
   et propose des valeurs à valider une par une. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ameliorations-regles.js'):root.IaseloAmeliorations);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloSurveillanceCentrale=api;})(typeof self!=='undefined'?self:globalThis,function(A){
'use strict';
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const PRESENTS=['Intervention','SSPI','Hospitalisation'];
const RANG={crit:0,warn:1,info:2};
const SEUILS={sspiMinutes:30,serviceHeures:8,douleur:4,douleurForte:7,braden:12,morse:45};
const vitaux=s=>[...(s?.postopVitals||[])].filter(r=>r&&!r.voided&&r.at).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
const ageAns=(naiss,now)=>{const d=new Date(naiss);if(!naiss||isNaN(d))return null;let a=now.getFullYear()-d.getFullYear();const m=now.getMonth()-d.getMonth();if(m<0||m===0&&now.getDate()<d.getDate())a--;return a};
function qsofa(v={}){
 const rr=num(v.rr),sbp=num(v.sbp),avpu=String(v.avpu||'').toUpperCase().slice(0,1),sed=num(v.sedation);
 const criteres=[rr!=null&&rr>=22&&'FR ≥ 22',sbp!=null&&sbp<=100&&'PAS ≤ 100',(avpu&&avpu!=='A'||sed!=null&&sed>=2)&&'conscience altérée'].filter(Boolean);
 return {score:criteres.length,criteres,mesurable:rr!=null||sbp!=null||!!avpu};
}
function imcDe(s){
 const c=s?.consult||{},cpa=c.cpa||{},e=c.ext||{};
 const p=num(cpa.poids??e.weight),t=num(cpa.taille??e.height);if(!p||!t)return null;const m=t>3?t/100:t;return Math.round(p/(m*m)*10)/10;
}
// Alertes d'un séjour, chacune avec une clé stable (type + horodatage de la donnée) pour la prise en charge.
function alertes(s,now=new Date()){
 if(!s||s.done||!PRESENTS.includes(s.stage))return [];
 const out=[],recs=vitaux(s),dernier=recs.at(-1),v=dernier?.values||{};
 if(dernier){
  const n=A?.news2?A.news2(v):null;
  if(n&&n.mesures){
   if(n.total>=7)out.push({type:'news2',niveau:'crit',titre:'NEWS2 '+n.total,detail:n.conduite,depuis:dernier.at});
   else if(n.total>=5||n.items.some(i=>i.points===3))out.push({type:'news2',niveau:'warn',titre:'NEWS2 '+n.total+(n.total<5?' (un paramètre à 3)':''),detail:n.conduite,depuis:dernier.at});
  }
  const q=qsofa(v),t=num(v.temp),fievre=t!=null&&(t>=38.3||t<36);
  if(q.score>=2)out.push({type:'sepsis',niveau:'crit',titre:'Sepsis possible (qSOFA '+q.score+'/3)',detail:'Critères : '+q.criteres.join(', ')+(fievre?', température '+t+' °C':'')+'. Évaluation médicale, recherche d’infection, lactates selon protocole.',depuis:dernier.at});
  else if(q.score===1&&fievre)out.push({type:'sepsis',niveau:'warn',titre:'Fièvre et qSOFA 1/3',detail:'Critère : '+q.criteres.join(', ')+', température '+t+' °C. Surveillance rapprochée.',depuis:dernier.at});
  const d=num(v.pain);
  if(d!=null&&d>=SEUILS.douleur)out.push({type:'douleur',niveau:d>=SEUILS.douleurForte?'crit':'warn',titre:'Douleur '+d+'/10',detail:'Antalgie selon protocole et réévaluation dans l’heure.',depuis:dernier.at});
 }
 // Retard de surveillance.
 const sspi=s.stage==='SSPI',limite=sspi?SEUILS.sspiMinutes*60e3:SEUILS.serviceHeures*3600e3;
 if(s.stage!=='Intervention'){
  const age=dernier?now-new Date(dernier.at):null;
  if(!dernier)out.push({type:'retard',niveau:'warn',titre:'Aucune constante relevée',detail:sspi?'Surveillance SSPI attendue toutes les 15 min.':'Premier relevé à faire.',depuis:'aucun'});
  else if(age>limite)out.push({type:'retard',niveau:sspi?'crit':'warn',titre:'Constantes non relevées depuis '+(age>=3600e3?Math.floor(age/3600e3)+' h':Math.floor(age/60e3)+' min'),detail:sspi?'Surveillance SSPI attendue toutes les 15 min.':'Relevé attendu au moins toutes les 8 h.',depuis:dernier.at+'|'+Math.floor(age/limite)});
 }
 // Échelles infirmières.
 const ech=s.soinsPlus?.echelles||[],derniere=t=>ech.filter(x=>x.type===t).sort((a,b)=>String(a.at).localeCompare(String(b.at))).at(-1);
 const br=derniere('braden'),mo=derniere('morse');
 if(br&&num(br.value)<=SEUILS.braden)out.push({type:'braden',niveau:'warn',titre:'Risque d’escarre élevé (Braden '+br.value+')',detail:'Matelas adapté, changements de position, protection des talons.',depuis:br.at});
 if(mo&&num(mo.value)>=SEUILS.morse)out.push({type:'morse',niveau:'warn',titre:'Risque de chute élevé (Morse '+mo.value+')',detail:'Lit en position basse, sonnette à portée, aide au premier lever.',depuis:mo.at});
 if(s.stage==='Hospitalisation'&&(!br||!mo))out.push({type:'echelles',niveau:'info',titre:'Évaluer '+[!br&&'Braden',!mo&&'Morse'].filter(Boolean).join(' et '),detail:'Évaluation à l’entrée dans le service.',depuis:'entree'});
 // Dénutrition (IMC de la consultation).
 const imc=imcDe(s),age=ageAns(s.identity?.birthDate,now);
 if(imc&&(imc<=18.5||age!=null&&age>=70&&imc<22))out.push({type:'denutrition',niveau:'warn',titre:'Dénutrition possible (IMC '+String(imc).replace('.',',')+')',detail:'Dépistage complet (perte de poids, apports) et avis diététique dans les 48 h.',depuis:'imc'+imc});
 return out.map(a=>({...a,cle:a.type+':'+a.depuis})).sort((a,b)=>RANG[a.niveau]-RANG[b.niveau]);
}
// Vue d'ensemble : patients présents, alertes non prises en charge d'abord.
function tableau(sejours,now=new Date()){
 const lignes=(sejours||[]).filter(s=>s&&!s.done&&PRESENTS.includes(s.stage)).map(s=>{
  const vues=s.soinsPlus?.alertesVues||{},al=alertes(s,now).map(a=>({...a,vue:vues[a.cle]||null}));
  const ouvertes=al.filter(a=>!a.vue);
  return {stay:s.id,nom:[String(s.identity?.lastName||'').toUpperCase(),s.identity?.firstName].filter(Boolean).join(' ')||s.id,stage:s.stage,secteur:s.sector||'',alertes:al,ouvertes:ouvertes.length,
   pire:ouvertes.length?ouvertes[0].niveau:al.length?'vu':'ok',dernier:vitaux(s).at(-1)?.at||''};
 });
 const r={crit:0,warn:1,info:2,vu:3,ok:4};
 lignes.sort((a,b)=>r[a.pire]-r[b.pire]||b.ouvertes-a.ouvertes||a.nom.localeCompare(b.nom));
 return {lignes,critiques:lignes.filter(l=>l.pire==='crit').length,aVoir:lignes.reduce((n,l)=>n+l.ouvertes,0)};
}
// Dictée infirmière → valeurs proposées (rien n'est enregistré sans validation).
const plie=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const N='(\\d{1,3}(?:[.,]\\d{1,2})?)';
const MOTIFS=[
 ['sbp+dbp',new RegExp('\\b(?:tension|pression|ta|pa)\\b\\s*(?:arterielle)?\\s*(?:a|de|:)?\\s*'+N+'\\s*(?:sur|/|-)\\s*'+N)],
 ['hr',new RegExp('\\b(?:pouls|frequence cardiaque|fc|cardiaque)\\b\\s*(?:a|de|:)?\\s*'+N)],
 ['spo2',new RegExp('\\b(?:saturation|sat|spo2)\\b\\s*(?:a|de|:)?\\s*'+N)],
 ['rr',new RegExp('\\b(?:frequence respiratoire|fr|respiratoire|respire a)\\b\\s*(?:a|de|:)?\\s*'+N)],
 ['temp',new RegExp('\\b(?:temperature|temp|t)\\b\\s*(?:a|de|:)?\\s*'+N+'(?:\\s*(?:degres?|°))?')],
 ['pain',new RegExp('\\b(?:douleur|eva)\\b\\s*(?:a|de|:|au repos a|au repos)?\\s*'+N+'(?:\\s*sur\\s*10)?')],
 ['glycemia',new RegExp('\\b(?:glycemie|dextro)\\b\\s*(?:a|de|:)?\\s*'+N)]
];
function extraireConstantes(texte){
 let s=plie(texte).replace(/(\d)\s*,\s*(\d)/g,'$1.$2').replace(/(\d+) virgule (\d+)/g,'$1.$2');
 const v={},vus=[];
 for(const [k,re] of MOTIFS){const m=re.exec(s);if(!m)continue;
  if(k==='sbp+dbp'){v.sbp=num(m[1]);v.dbp=num(m[2]);vus.push('sbp','dbp')}else{v[k]=num(m[1]);vus.push(k)}}
 if(v.temp!=null&&v.temp>45)delete v.temp;if(v.glycemia!=null&&v.glycemia>8)v.glycemia=Math.round(v.glycemia)/100;
 if(/\b(sous|avec) (oxygene|o2)\b|lunettes|masque a oxygene/.test(s))v.o2='Oxygène';else if(/air ambiant/.test(s))v.o2='Air';
 if(/\b(confus|confusion)\b/.test(s))v.avpu='C';else if(/\b(conscient|alerte|bien reveille|orient)/.test(s))v.avpu='A';
 if(/pansement (est )?(sec|propre)/.test(s))v.dressing='Sec';else if(/pansement (est )?(sature|saigne)/.test(s))v.dressing='Saturé';else if(/pansement (est )?tache/.test(s))v.dressing='Taché';
 if(/(nausee|nauseeux)/.test(s)&&!/(pas de|sans) nausee/.test(s))v.nvpo=/vomi/.test(s)?'2':'1';else if(/(pas de|sans) nausee/.test(s))v.nvpo='0';
 if(/a urine|miction (spontanee|ok)|urine seul/.test(s))v.miction='Oui';
 const reste=texte.replace(/\s+/g,' ').trim();
 return {valeurs:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null&&x!==undefined)),texte:reste};
}
return {SEUILS,PRESENTS,qsofa,imcDe,alertes,tableau,extraireConstantes};
});

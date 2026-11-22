/* IASELO · Lecture des constantes sur photo : règles pures (sans DOM), testées dans tests/constantes-photo.test.cjs.
 * Le texte vient de la lecture optique locale (Tesseract exécuté dans le navigateur, aucun envoi à un service tiers).
 * Ces règles proposent des valeurs ; rien n'est enregistré sans relecture et validation par le praticien. */
(function(root){
'use strict';

// Clés identiques à periVitals (parcours-v8.js) pour alimenter la feuille d'anesthésie sans conversion.
const VITALS=[
 // clé, libellé, unité, bornes plausibles (au-delà : valeur aberrante, probable erreur de lecture), cible clinique indicative
 ['sbp','PAS','mmHg',[40,260],[90,160]],
 ['dbp','PAD','mmHg',[15,160],[40,100]],
 ['map','PAM','mmHg',[25,200],[65,110]],
 ['hr','FC','/min',[20,230],[45,110]],
 ['spo2','SpO₂','%',[50,100],[94,100]],
 ['etco2','EtCO₂','mmHg',[5,90],[30,45]],
 ['temp','Température','°C',[30,43],[36,38]],
 ['fio2','FiO₂','%',[18,100],null],
 ['rr','FR','/min',[3,60],[8,25]],
 ['vt','Volume courant','mL',[30,1500],null],
 ['peep','PEEP','cmH₂O',[0,30],null],
 ['pip','Pression de crête','cmH₂O',[3,70],[0,35]],
 ['halogenEnd','Halogéné expiré','%',[0,9],null]
];
const META=Object.fromEntries(VITALS.map(([key,label,unit,plausible,target])=>[key,{key,label,unit,plausible,target}]));

// Étiquettes des moniteurs et des impressions de tendances (français et anglais, tolérant aux confusions de lecture O/0).
// L'ordre compte : les étiquettes longues (EtCO2, FiO2, SpO2) sont cherchées avant les courtes (CO2, FR).
const LABELS=[
 ['pressure',/\b(?:NI\s?BP|N\s?BP|PNI|PANI|NIPB|PA\s?NI|ABP|IBP|ART|PSI|P\s?ART)\b/i],
 ['pressure',/\bPA\b(?!\s*[MSD]\b)/i],
 ['sbp',/\b(?:PAS|SYS|SYST|Systolique)\b/i],
 ['dbp',/\b(?:PAD|DIA|DIAST|Diastolique)\b/i],
 ['map',/\b(?:PAM|MAP|MEAN|MOY|Moyenne)\b/i],
 ['etco2',/\b(?:Et\s?C[O0][2z]|EtCO₂|PetC[O0]2|PE\s?C[O0]2|Fe\s?C[O0]2)\b/i],
 ['fio2',/\b(?:Fi\s?[O0][2z]|FiO₂)\b/i],
 ['spo2',/\b(?:Sp\s?[O0][2z]|SpO₂|Sa\s?[O0]2|SAT|SaO₂)\b/i],
 ['etco2',/\b(?:C[O0]2|CO₂)\b/i],
 ['halogenEnd',/\b(?:Et\s?(?:SEV|SEVO|SÉVO|DES|ISO|AA|AGT)|Fe\s?(?:SEV|DES|ISO)|EtAA)\b/i],
 ['hr',/\b(?:FC|HR|PR|Pouls|PULS|PULSE|Fréq\.?\s?card|ECG)\b/i],
 ['temp',/(?:\bT\s?°|\bTEMP\b|\bTemp(?:érature)?\b|\bT[12]\b|\bTymp\b|\bTœso\b|\bTeso\b)/i],
 ['rr',/\b(?:FR|RR|awRR|RESP|Resp|Fréq\.?\s?resp)\b/i],
 ['vt',/\b(?:VTe?|VTi|TVe?|Vt|Vol\.?\s?courant|VC)\b/i],
 ['peep',/\b(?:PEEP|PEP|PEPe)\b/i],
 ['pip',/\b(?:Ppeak|Ppic|Pcr[êe]te|PIP|Pmax|Pcr)\b/i]
];
// Formes courtes en majuscules seulement (« des » est un mot courant), précédées ou non de Et/Fe.
const AGENTS=[['Sévoflurane',/(?:\b|Et|Fe)(?:SEV|SÉV|SEVO|Sevo)\b|S[ée]voflurane/],['Desflurane',/(?:\b|Et|Fe)DES\b|Desflurane/],['Isoflurane',/(?:\b|Et|Fe)ISO\b|Isoflurane/]];

const PRESSURE=/(\d{2,3})\s*[\/|]\s*(\d{2,3})(?:\s*\(\s*(\d{2,3})\s*\)?)?/;
const NUMBER=/\d{1,4}(?:[.,]\d{1,2})?/;
const TIME=/(?:^|\s)([01]?\d|2[0-3])\s?[:hH.]\s?([0-5]\d)(?=\s|$)/;

// Confusions fréquentes de la lecture optique dans une zone numérique : O→0, l/I/|→1, S→5, B→8.
function fixDigits(token){
 if(!/\d/.test(token))return {text:token,fixed:false};
 const text=token.replace(/[Oo]/g,'0').replace(/[lI|](?=\d)|(?<=\d)[lI|]/g,'1').replace(/(?<=\d)S|S(?=\d)/g,'5').replace(/(?<=\d)B|B(?=\d)/g,'8');
 return {text,fixed:text!==token};
}
function toNumber(text){const n=Number(String(text).replace(',','.'));return Number.isFinite(n)?n:null}
function lineOf(input){
 if(typeof input==='string')return {text:input,conf:null};
 return {text:String(input?.text||''),conf:Number.isFinite(input?.conf)?input.conf:(Number.isFinite(input?.confidence)?input.confidence:null)};
}
function normalizeLines(input){
 const rows=Array.isArray(input)?input.map(lineOf):String(input||'').split(/\r?\n/).map(t=>({text:t,conf:null}));
 return rows.map(r=>({...r,text:r.text.replace(/[‐-―]/g,'-').replace(/\s+/g,' ').trim()})).filter(r=>r.text);
}

// Repère les étiquettes d'une ligne, dans l'ordre de lecture, sans chevauchement.
function findLabels(text){
 const found=[];
 for(const [key,re] of LABELS){
  const g=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');let m;
  while((m=g.exec(text))){const start=m.index,end=start+m[0].length;if(!found.some(f=>start<f.end&&end>f.start))found.push({key,start,end,raw:m[0]});if(!m[0].length)g.lastIndex++}
 }
 return found.sort((a,b)=>a.start-b.start);
}
// Valeurs numériques d'un fragment : une pression « 120/70 (87) » compte pour une seule valeur.
function findValues(fragment){
 const out=[];
 const tokens=fragment.split(/\s+/).map(t=>fixDigits(t));const fixedText=tokens.map(t=>t.text).join(' ');const fixed=tokens.some(t=>t.fixed&&/\d/.test(t.text));
 const g=new RegExp(PRESSURE.source+'|'+NUMBER.source,'g');let m;
 while((m=g.exec(fixedText))){
  if(m[1])out.push({type:'pressure',sbp:m[1],dbp:m[2],map:m[3]||'',raw:m[0].trim(),fixed});
  else out.push({type:'number',value:m[0].replace(',','.'),raw:m[0],fixed});
 }
 return out;
}
function agentIn(text){for(const [name,re] of AGENTS)if(re.test(text))return name;return ''}

function assign(target,key,value,info){
 if(value===''||value==null)return;
 if(target[key]&&target[key].value!=='')return; // première lecture conservée, la suite est ignorée
 target[key]={value:String(value),raw:info.raw,conf:info.conf,fixed:!!info.fixed};
}
function assignValue(target,labelKey,v,info){
 if(labelKey==='pressure'||v.type==='pressure'){
  if(v.type==='pressure'){assign(target,'sbp',v.sbp,{...info,raw:v.raw,fixed:v.fixed});assign(target,'dbp',v.dbp,{...info,raw:v.raw,fixed:v.fixed});if(v.map)assign(target,'map',v.map,{...info,raw:v.raw,fixed:v.fixed});}
  return labelKey==='pressure'?v.type==='pressure':true;
 }
 assign(target,labelKey,v.value,{...info,raw:v.raw,fixed:v.fixed});return true;
}

// Écran de moniteur : une mesure instantanée. Étiquette suivie de sa valeur sur la même ligne,
// ou ligne d'étiquettes suivie d'une ligne de valeurs (disposition en grille des moniteurs).
function parseMonitor(input){
 const lines=normalizeLines(input);const values={};let clock='';let agent='';
 for(let i=0;i<lines.length;i++){
  const {text,conf}=lines[i];
  if(!clock){const t=text.match(/(?:^|\s)([01]?\d|2[0-3])\s?:\s?([0-5]\d)(?::[0-5]\d)?(?=\s|$)/);if(t&&!PRESSURE.test(text))clock=t[1].padStart(2,'0')+':'+t[2]}
  agent||=agentIn(text);
  const labels=findLabels(text);if(!labels.length)continue;
  let pending=[];
  labels.forEach((label,k)=>{
   const fragment=text.slice(label.end,labels[k+1]?.start??text.length);
   const found=findValues(fragment).filter(v=>!(label.key!=='pressure'&&label.key!=='temp'&&v.type==='number'&&/[:hH]/.test(fragment)&&TIME.test(fragment)));
   const v=label.key==='pressure'?found.find(x=>x.type==='pressure'):found[0];
   if(v)assignValue(values,label.key,v,{conf});else pending.push(label);
  });
  if(pending.length&&lines[i+1]&&!findLabels(lines[i+1].text).length){
   const next=findValues(lines[i+1].text);
   pending.forEach((label,k)=>{const v=next[k];if(v)assignValue(values,label.key,v,{conf:lines[i+1].conf})});
   if(next.length)i++;
  }
 }
 if(values.halogenEnd&&!agent)agent='';
 return {mode:'moniteur',rows:Object.keys(values).length?[{time:clock,values,agent}]:[],clock,agent};
}

// Écran de moniteur, lecture par position : chaque étiquette reçoit la valeur la plus proche située
// sous elle ou à sa droite (les moniteurs affichent le libellé en petit au-dessus ou à gauche du gros chiffre).
// words : [{text, conf, bbox:{x0,y0,x1,y1}}] fournis par la lecture optique.
function parseMonitorWords(words){
 const W=(words||[]).filter(w=>w&&w.bbox&&String(w.text||'').trim()).map(w=>({text:String(w.text).trim(),conf:w.conf??w.confidence,b:w.bbox}));
 if(!W.length)return {mode:'moniteur',rows:[],clock:'',agent:''};
 W.sort((a,b)=>a.b.y0-b.b.y0||a.b.x0-b.b.x0);
 const sameLine=(a,b)=>Math.abs((a.b.y0+a.b.y1)/2-(b.b.y0+b.b.y1)/2)<Math.max(a.b.y1-a.b.y0,b.b.y1-b.b.y0)*.5;
 // Fusion des fragments voisins d'une même ligne : « Et » + « CO2 », « 118/64 » + « (82) ».
 const merged=[];
 for(const w of W){const last=merged[merged.length-1];const h=w.b.y1-w.b.y0;
  if(last&&sameLine(last,w)&&w.b.x0>=last.b.x1-h*.2&&w.b.x0-last.b.x1<h*.6&&(/^\(?\d{2,3}\)?$/.test(w.text)&&/\d\/\d/.test(last.text)&&!/\(/.test(last.text)||/^(Et|Fe|Fi|Sp|T)$/i.test(last.text))){last.text+=(/^(Et|Fe|Fi|Sp)$/i.test(last.text)?'':' ')+w.text;last.b={x0:last.b.x0,y0:Math.min(last.b.y0,w.b.y0),x1:w.b.x1,y1:Math.max(last.b.y1,w.b.y1)};last.conf=Math.min(last.conf??100,w.conf??100);continue}
  merged.push({...w,b:{...w.b}});
 }
 let clock='',agent='';const labels=[],nums=[];
 for(const w of merged){
  const t=w.text;agent||=agentIn(t);
  const ck=t.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);if(ck){clock||=ck[1].padStart(2,'0')+':'+ck[2];continue}
  const lab=findLabels(t);
  if(lab.length&&!/\d{2,}/.test(t.replace(/[0O]2|C[O0]2|T[12]/gi,''))){labels.push({key:lab[0].key,w});continue}
  const vals=findValues(t);if(vals.length===1&&/^[\d.,/()\sOoIlSB|]+$/.test(t))nums.push({v:vals[0],w,h:w.b.y1-w.b.y0,paren:/^\(\s*\d{2,3}\s*\)?$/.test(t)});
 }
 // Appariement glouton par distance : valeur sous l'étiquette (même colonne) ou à droite (même ligne).
 const pairs=[];
 for(const l of labels){const lh=l.w.b.y1-l.w.b.y0;for(const n of nums){
  const dy=n.w.b.y0-l.w.b.y1,dx=n.w.b.x0-l.w.b.x0;
  const below=dy>-lh*.5&&dy<Math.max(n.h,lh)*2.5&&dx>-lh*2&&dx<Math.max(lh*6,(l.w.b.x1-l.w.b.x0)*3);
  const right=sameLine(l.w,n.w)&&n.w.b.x0>=l.w.b.x1-2&&n.w.b.x0-l.w.b.x1<lh*8;
  if(!below&&!right)continue;
  if(n.paren||(l.key==='pressure'&&n.v.type!=='pressure'))continue;
  pairs.push({l,n,d:right?(n.w.b.x0-l.w.b.x1)*.8:Math.max(0,dy)+Math.abs(dx)*.6});
 }}
 pairs.sort((a,b)=>a.d-b.d);const usedL=new Set(),usedN=new Set(),values={};
 for(const {l,n} of pairs){if(usedL.has(l)||usedN.has(n))continue;usedL.add(l);usedN.add(n);assignValue(values,l.key,n.v,{conf:n.w.conf});
  // PAM affichée entre parenthèses sous la pression (« (82) » sur la ligne suivante).
  if(n.v.type==='pressure'&&!n.v.map){const m=nums.filter(x=>x.paren&&!usedN.has(x)&&x.w.b.y0>=n.w.b.y0&&x.w.b.y0-n.w.b.y1<n.h*1.5&&Math.abs(x.w.b.x0-n.w.b.x0)<n.h*2).sort((a,b)=>a.w.b.y0-b.w.b.y0)[0];if(m){usedN.add(m);assign(values,'map',m.v.value,{conf:m.w.conf,raw:m.w.text,fixed:m.v.fixed})}}
 }
 // Gros chiffres restés sans libellé (libellé illisible) : proposés au praticien, qui choisit la constante.
 const lh=labels.length?labels.reduce((k,l)=>k+l.w.b.y1-l.w.b.y0,0)/labels.length:0;
 const orphans=nums.filter(n=>!usedN.has(n)&&!n.paren&&(!lh||n.h>lh*1.5)).map(n=>n.v.type==='pressure'?n.v.raw:n.v.value);
 return {mode:'moniteur',rows:Object.keys(values).length||orphans.length?[{time:clock,values,agent,orphans}]:[],clock,agent};
}

// Impression ou écran de tendances : une ligne d'en-tête (étiquettes) puis une ligne par horaire.
function parseTrend(input){
 const lines=normalizeLines(input);let header=null;const rows=[];let agent='';
 for(const {text,conf} of lines){
  agent||=agentIn(text);
  const t=text.match(TIME);const labels=findLabels(text);
  if(!t&&labels.length>=2){header=labels.map(l=>l.key);continue}
  if(!t||!header)continue;
  if(t.index>6)continue; // l'horaire doit ouvrir la ligne
  const time=t[1].padStart(2,'0')+':'+t[2];
  const rest=text.slice(t.index+t[0].length);
  const found=findValues(rest);const values={};const issues=[];
  let col=0;
  for(const v of found){
   const key=header[col];if(!key)break;
   if(key==='pressure'&&v.type!=='pressure'){ // pression non lue en bloc : PAS puis PAD séparées
    assign(values,'sbp',v.value,{conf,raw:v.raw,fixed:v.fixed});const next=found[found.indexOf(v)+1];
    if(next&&next.type==='number'){assign(values,'dbp',next.value,{conf,raw:next.raw,fixed:next.fixed});found.splice(found.indexOf(next),1)}
    col++;continue;
   }
   assignValue(values,key,v,{conf});col++;
  }
  const expected=header.length;if(found.length!==expected)issues.push('colonnes');
  if(Object.keys(values).length)rows.push({time,values,agent:'',issues});
 }
 rows.forEach(r=>r.agent=agent);
 return {mode:'tendances',rows,header,agent};
}

function parse(input,prefer,words){
 const trend=parseTrend(input);let monitor=parseMonitor(input);
 const byPos=parseMonitorWords(words);const n=r=>r.rows.reduce((k,x)=>k+Object.keys(x.values).length,0);
 if(n(byPos)>=n(monitor)&&(n(byPos)||byPos.rows.length))monitor={...byPos,agent:byPos.agent||monitor.agent,clock:byPos.clock||monitor.clock,rows:byPos.rows.map(r=>({...r,time:r.time||monitor.clock,agent:r.agent||monitor.agent}))};
 if(prefer==='tendances')return trend.rows.length?trend:{...trend,rows:[]};
 if(prefer==='moniteur')return monitor;
 return trend.rows.length>=2?trend:monitor.rows.length?monitor:trend;
}

// Contrôle d'une valeur : « aberrante » = hors bornes plausibles (erreur de lecture probable, correction ou confirmation explicite) ;
// « hors cible » = plausible mais hors repère clinique indicatif ; « incertaine » = lecture peu sûre ou caractère corrigé.
function checkValue(key,value,info={}){
 const meta=META[key];const issues=[];if(!meta)return issues;
 const n=toNumber(value);
 if(value===''||value==null)return issues;
 if(n==null){issues.push({level:'aberrant',text:'Valeur non numérique'});return issues}
 const [lo,hi]=meta.plausible;
 if(n<lo||n>hi){
  let suggestion=null;
  if(key==='temp'&&n>=300&&n<=430)suggestion=String(n/10);
  if(key==='halogenEnd'&&n>=10&&n<=90)suggestion=String(n/10);
  issues.push({level:'aberrant',text:'Valeur aberrante pour '+meta.label+' ('+lo+'–'+hi+' '+meta.unit+'), probable erreur de lecture',suggestion});
 }else if(meta.target&&(n<meta.target[0]||n>meta.target[1]))issues.push({level:'cible',text:'Hors cible indicative ('+meta.target[0]+'–'+meta.target[1]+' '+meta.unit+')'});
 if(info.fixed)issues.push({level:'incertain',text:'Caractère corrigé à la lecture ('+info.raw+')'});
 else if(Number.isFinite(info.conf)&&info.conf<70)issues.push({level:'incertain',text:'Lecture peu sûre ('+Math.round(info.conf)+' %)'});
 return issues;
}
// Cohérence entre valeurs d'une même mesure.
function checkRow(values){
 const g=k=>toNumber(values[k]?.value??values[k]);const out={};
 const sbp=g('sbp'),dbp=g('dbp'),map=g('map');
 const add=(k,text)=>{(out[k]??=[]).push({level:'aberrant',text})};
 if(sbp!=null&&dbp!=null&&dbp>=sbp){add('sbp','PAS inférieure ou égale à la PAD');add('dbp','PAD supérieure ou égale à la PAS')}
 if(map!=null&&sbp!=null&&dbp!=null&&dbp<sbp&&(map<dbp||map>sbp))add('map','PAM hors de l’intervalle PAD–PAS');
 return out;
}
function rowIssues(values){
 const cross=checkRow(values);const out={};
 for(const [key,v] of Object.entries(values))out[key]=[...checkValue(key,v.value,v),...(cross[key]||[])];
 return out;
}
const blocking=issues=>issues.some(i=>i.level==='aberrant'||i.level==='incertain');

// Horodatage d'une mesure : date du jour de la photo, veille si l'heure lue est postérieure à la photo (tendances passées minuit).
function stamp(time,capturedAt){
 const ref=new Date(capturedAt||Date.now());if(!/^\d{2}:\d{2}$/.test(time||''))return null;
 const [h,m]=time.split(':').map(Number);const d=new Date(ref);d.setHours(h,m,0,0);
 if(d-ref>10*60000)d.setDate(d.getDate()-1);
 return d;
}
function localInput(d){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,16)}
// Heure retenue pour un écran de moniteur : l'horloge de l'écran si elle est proche de la photo, sinon l'heure de la photo.
function monitorTime(clock,capturedAt){
 const ref=new Date(capturedAt||Date.now());const d=clock?stamp(clock,ref):null;
 if(d&&Math.abs(ref-d)<=3*3600000)return {at:localInput(d),from:'horloge du moniteur'};
 return {at:localInput(ref),from:'heure de la photo'};
}
// Doublon : une surveillance existe déjà à la même minute avec les mêmes valeurs.
function isDuplicate(at,values,records){
 return (records||[]).some(r=>!r.voided&&r.kind==='Surveillance'&&String(r.at).slice(0,16)===at&&Object.entries(values).every(([k,v])=>String(r.values?.[k]??'')===String(v)));
}

root.ConstantesPhoto={VITALS,META,LABELS,fixDigits,findLabels,findValues,parseMonitor,parseMonitorWords,parseTrend,parse,checkValue,checkRow,rowIssues,blocking,stamp,monitorTime,localInput,isDuplicate,toNumber};
if(typeof module!=='undefined')module.exports=root.ConstantesPhoto;
})(typeof window!=='undefined'?window:globalThis);

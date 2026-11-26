/* IASELO · codage CCAM de l'intervention, sur le modèle de l'écran de codage d'E-med (26/11/2026, demande de Romain).
   Plusieurs actes par intervention ; pour chacun, l'activité 1 (chirurgien) et l'activité 4 (anesthésie), les actes
   complémentaires de l'anesthésiste (guidage échographique, intubation par fibroscopie, récupération de sang…).
   Un panneau par praticien : modificateurs, code d'association (1 = 100 %, 2 = 50 %…), tarif et total ; chaque
   praticien valide sa partie. Le DIM valide ensuite chaque ligne. Fonctions pures, utilisées par l'écran
   (dist/codage-ccam.js), le serveur (contrôle des parts, Assurance maladie, transmission du codage) et les tests.
   Le calcul des montants est indicatif : prix unitaire de la CCAM de l'activité, modificateurs et règle d'association. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCodageCcam=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const CODE=/^[A-Z]{4}\d{3}$/;
const PANNEAUX={chirurgien:{activite:'1',label:'Chirurgien',metier:'chirurgien'},anesthesie:{activite:'4',label:'Anesthésiste',metier:'anesthesiste'}};
// Actes complémentaires proposés à l'anesthésiste sous chaque acte (libellés de la CCAM, comme dans E-med).
const COMPLEMENTS=[
 ['AHQJ021','Guidage échographique pour anesthésie locorégionale périphérique du cou, du sein, de la paroi thoracique, de la paroi abdominale ou de membre, ou pour anesthésie rachidienne des patients dont l’indice de masse corporelle est supérieur ou égal à 30 kg/m²'],
 ['GELE001','Intubation trachéale par fibroscopie ou dispositif laryngé particulier, au cours d’une anesthésie générale'],
 ['YYYY041','Supplément pour récupération peropératoire de sang']
];
// Codes d'association de la CCAM et taux appliqués ; « 0 » : acte codé mais non facturé (au-delà du 2e acte).
const ASSOCIATIONS={'1':{taux:1,label:'1 · 100 %'},'2':{taux:0.5,label:'2 · 50 %'},'3':{taux:0.75,label:'3 · 75 %'},'4':{taux:1,label:'4 · 100 %'},'5':{taux:1,label:'5 · 100 %'},'0':{taux:0,label:'0 · non facturé'}};
const TYPES_ANESTHESIE={'1':'Anesthésie générale','2':'Anesthésie locorégionale périphérique','3':'Anesthésie rachidienne','4':'Anesthésie locale','5':'Sédation','6':'Anesthésie combinée (générale et locorégionale)'};
const t=v=>typeof v==='string'?v.trim():v==null?'':String(v).trim();
const arrondi=n=>Math.round(n*100)/100;
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const mods=v=>[...new Set(t(v).toUpperCase().replace(/[^A-Z0-9]/g,'').split(''))].slice(0,4).join('');
const id=()=>'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

// Codage du séjour au nouveau format ; reprend l'ancien format ({actes:{chir,anes}}) sans le perdre.
function normaliser(codage){
 const c=codage&&typeof codage==='object'?codage:{};
 if(Array.isArray(c.lignes))return {entete:{},validations:{},decisions:{},...c,lignes:c.lignes.filter(l=>l&&CODE.test(t(l.code).toUpperCase()))};
 const a=c.actes||{},lignes=[],dec={...(c.decisions||{})},validations={};
 if(a.chir&&CODE.test(t(a.chir.code).toUpperCase())){
  const memeCode=a.anes&&t(a.anes.code).toUpperCase()===t(a.chir.code).toUpperCase();
  lignes.push({id:'chir',code:t(a.chir.code).toUpperCase(),libelle:t(a.chir.libelle),activites:{'1':{coche:true},'4':{coche:!!memeCode}},complements:{}});
  if(a.chir.confirme)validations['1']={par:t(a.chir.by),at:a.chir.at||''};
  if(dec['acte:chir'])dec['chir:1']=dec['acte:chir'];
 }
 if(a.anes&&CODE.test(t(a.anes.code).toUpperCase())){
  const l=lignes.find(x=>x.code===t(a.anes.code).toUpperCase());
  if(!l)lignes.push({id:'anes',code:t(a.anes.code).toUpperCase(),libelle:t(a.anes.libelle).replace(/ \(activité 4, anesthésie\)$/,''),activites:{'1':{coche:false},'4':{coche:true}},complements:{}});
  if(a.anes.confirme)validations['4']={par:t(a.anes.by),at:a.anes.at||''};
  if(dec['acte:anes'])dec[(l?l.id:'anes')+':4']=dec['acte:anes'];
 }
 return {entete:{...(c.entete||{})},lignes,validations,decisions:dec};
}

// Prix unitaire de base d'une activité, lu dans l'index CCAM (dist/ccam-regles.js).
function prixUnitaire(ix,code,activite){
 const a=ix?.parCode?.get(code);if(!a)return null;
 const p=a.tarifs?.[activite];if(p!=null&&p!=='')return Number(p);
 return activite==='1'&&a.tarif!=null?Number(a.tarif):null;
}
const autorises=(ix,code,activite)=>ix?.parCode?.get(code)?.modificateurs?.[activite]||'';

// Lignes d'un panneau de praticien, avec association proposée et montants.
function panneau(codage,cle,ix){
 const c=normaliser(codage),P=PANNEAUX[cle],out=[];
 for(const l of c.lignes){
  const a=l.activites?.[P.activite];
  if(a?.coche)out.push({cle:l.id+':'+P.activite,ligne:l.id,code:l.code,libelle:l.libelle,activite:P.activite,modificateurs:mods(a.modificateurs),association:t(a.association),complement:false});
  if(cle==='anesthesie')for(const [code,x] of Object.entries(l.complements||{}))if(x?.coche)out.push({cle:l.id+':c:'+code,ligne:l.id,code,libelle:(COMPLEMENTS.find(([k])=>k===code)||[])[1]||x.libelle||'',activite:'1',modificateurs:mods(x.modificateurs),association:t(x.association),complement:true});
 }
 const defs=ix?.modificateurs||{};
 for(const x of out){
  x.pu=prixUnitaire(ix,x.code,x.activite);let maj=0,forfait=0;const inconnus=[];
  for(const m of x.modificateurs.split('').filter(Boolean)){const d=defs[m];if(d?.majoration!=null)maj+=d.majoration;else if(d?.forfait!=null)forfait+=d.forfait;else inconnus.push(m)}
  x.modificateursSansTarif=inconnus.join('');x.base=x.pu==null?null:arrondi(x.pu*(1+maj));x.forfait=forfait;
 }
 // Règle d'association : le plus cher à 100 % (1), le 2e à 50 % (2), les suivants non facturés (0), sauf code saisi.
 const rang=[...out].filter(x=>!x.association).sort((a,b)=>(b.base??-1)-(a.base??-1));
 const pris=new Set(out.filter(x=>x.association).map(x=>x.association)),libres=['1','2'].filter(c=>!pris.has(c));
 for(const x of rang)x.associationAuto=libres.shift()||'0';
 for(const x of out){const code=x.association||x.associationAuto||'1';x.associationRetenue=code;const taux=ASSOCIATIONS[code]?.taux??1;x.montant=x.base==null?null:arrondi(x.base*taux+(taux?x.forfait:0))}
 const total=arrondi(out.reduce((s,x)=>s+(x.montant||0),0));
 return {cle,...P,lignes:out,total,validation:c.validations?.[P.activite]||null,incomplet:out.some(x=>x.pu==null)};
}

// Toutes les lignes facturables (pour l'Assurance maladie, la transmission et le RUM) : une par code et activité.
function lignesFacturables(codage,ix){
 const c=normaliser(codage);
 return Object.keys(PANNEAUX).flatMap(k=>{const p=panneau(c,k,ix);return p.lignes.map(x=>({cle:x.cle,code:x.code,libelle:x.libelle,activite:x.activite,modificateurs:x.modificateurs,association:x.associationRetenue,tarif:x.pu,montant:x.montant,complement:x.complement,
  confirme:!!p.validation,by:p.validation?.par||'',at:p.validation?.at||'',dim:t(c.decisions?.[x.cle]?.decision)}))});
}

// Contrôles avant la validation d'un panneau par son praticien.
function erreurValidation(codage,cle,ix){
 const p=panneau(codage,cle,ix);
 if(!p.lignes.length)return cle==='chirurgien'?'Aucun acte coché en activité 1 (chirurgien).':'Aucun acte coché en anesthésie (activité 4).';
 for(const x of p.lignes){
  const a=ix?.parCode?.get(x.code);
  if(ix?.actes?.length&&!a)return x.code+' n’existe pas (ou plus) dans la CCAM V'+ix.version+'.';
  if(a&&!x.complement&&a.activites&&!a.activites.includes(x.activite))return x.code+' n’a pas d’activité '+x.activite+' dans la CCAM.';
  const ok=autorises(ix,x.code,x.activite);if(ok&&x.modificateurs.split('').some(m=>m&&!ok.includes(m)))return x.code+' : modificateur non autorisé pour cette activité (autorisés : '+ok.split('').join(', ')+').';
  if(x.associationRetenue&&!ASSOCIATIONS[x.associationRetenue])return x.code+' : code d’association inconnu.';
 }
 if(p.lignes.filter(x=>x.associationRetenue==='1').length>1)return 'Un seul acte peut porter le code d’association 1.';
 return '';
}

// Part d'un praticien dans le codage : sert au serveur pour refuser qu'un praticien modifie la part de l'autre.
function part(codage,cle){
 const c=normaliser(codage),act=PANNEAUX[cle].activite;
 const lignes=c.lignes.map(l=>({id:l.id,code:l.code,a:l.activites?.[act]?.coche?l.activites[act]:null,c:cle==='anesthesie'?Object.fromEntries(Object.entries(l.complements||{}).filter(([,x])=>x?.coche)):{}})).filter(l=>l.a||Object.keys(l.c).length);
 return stable({lignes,validation:c.validations?.[act]||null});
}
function partInchangee(avant,apres,cle){return part(avant,cle)===part(apres,cle)}
// Décisions du DIM : un praticien peut seulement effacer celles de ses propres lignes (quand il rouvre son codage).
const ligneDuPanneau=(k,cle)=>cle==='chirurgien'?/^[^:]+:1$/.test(k):/^[^:]+:(4|c:[A-Z]{4}\d{3})$/.test(k);
function decisionsAutorisees(avant,apres,cle){
 const a=normaliser(avant).decisions||{},b=normaliser(apres).decisions||{};
 for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
  if(stable(a[k])===stable(b[k]))continue;
  if(!(k in b)&&ligneDuPanneau(k,cle))continue;
  return false;
 }
 return true;
}
// Écriture du codage par un praticien : sa part seulement ; le DIM peut tout modifier.
function ecritureAutorisee(job,avant,apres){
 if(job==='dim')return true;
 const moi=job==='chirurgien'?'chirurgien':job==='anesthesiste'?'anesthesie':null;if(!moi)return false;
 const autre=moi==='chirurgien'?'anesthesie':'chirurgien';
 return partInchangee(avant,apres,autre)&&decisionsAutorisees(avant,apres,moi);
}

return {PANNEAUX,COMPLEMENTS,ASSOCIATIONS,TYPES_ANESTHESIE,normaliser,panneau,lignesFacturables,erreurValidation,part,partInchangee,decisionsAutorisees,ecritureAutorisee,prixUnitaire,autorises,mods,id};
});

/* IASELO · lecture d'une ordonnance (photo ou PDF) en consultation d'anesthésie (27/11/2026, veille n° 3, manque n° 2).
   Inspiré du module Evolucare / POSOS : extraction des médicaments, dosages et posologies, rattachement à la base publique
   des médicaments (BDPM, ANSM), indice de confiance vert / orange / rouge, puis validation ligne par ligne par le médecin.
   Ici, la lecture optique se fait dans le navigateur (Tesseract hébergé par IASELO) : l'image n'est envoyée nulle part.
   Ce fichier : règles pures (découpage du texte, rattachement à la BDPM, confiance), testées dans
   tests/ordonnance-lecture.test.cjs. Rien n'entre dans le dossier sans validation explicite. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloOrdonnance=api})(typeof self!=='undefined'?self:this,function(){
'use strict';
const fold=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[µμ]/g,'u').replace(/[^a-z0-9,.]+/g,' ').replace(/\s+/g,' ').trim();
const mots=v=>fold(v).replace(/[,.]/g,' ').split(' ').filter(Boolean);
// Corrections OCR fréquentes dans les nombres (O→0, l→1) quand ils précèdent une unité.
function corrigerOcr(l){return String(l).replace(/(?<=[A-Za-zÉÈ])0(?=[A-Za-zÉÈ])/g,'O').replace(/\b([0-9OoIl]{1,4})(?=\s?(mg|g|ml|µg|ug|mcg|ui)\b)/gi,m=>m.replace(/[Oo]/g,'0').replace(/[Il]/g,'1'))}

const UNITE='(mg|g|µg|ug|mcg|ml|ui|u\\.?i\\.?|%|mg\\/ml|meq)';
const RE_DOSE=new RegExp('(\\d+(?:[.,]\\d+)?)\\s?'+UNITE+'(?![a-z])','i');
const FORMES=/\b(cp|cpr|comprim[eé]s?|g[eé]lules?|sachets?|ampoules?|flacons?|stylos?|patch(?:s|es)?|dispositifs? transdermiques?|suppositoires?|collyre|gouttes?|sirop|solution|suspension|inhalateur|spray|pommade|cr[eè]me|capsules?|lyoc|orodispersible|injectable|seringues?|unidoses?)\b/i;
const POSO=/^(qsp|q\.s\.p|\d+(?:[.,]\d+)?|un|une|deux|trois|quatre|1\/2|½|prendre|appliquer|inhaler|instiller|injecter|faire|matin|midi|soir|au coucher|le matin|le soir)\b|\b(fois par jour|x ?\/ ?j(?:our)?|par jour|\/ ?jour|toutes les \d+ ?h|matin|midi|soir|coucher|si besoin|pendant \d+|par semaine|\/ ?semaine)\b/i;
const DUREE=/\b(pendant|durant|qsp|q\.s\.p\.?)\s*(\d+)\s*(j(?:ours?)?|sem(?:aines?)?|mois)\b/i;
// Lignes d'en-tête ou de pied d'ordonnance, jamais des médicaments.
const ENTETE=/\b(docteur|dr\.?|pr\.?|rpps|adeli|finess|t[eé]l(?:[eé]phone)?\.?|fax|portable|e-?mail|@|rue|avenue|boulevard|bd|place|cedex|\d{5}\s+[a-z]|ordonnance|bizone|ald|affection de longue|n[ée]\(?e?\)? le|date de naissance|patient|madame|monsieur|mme|m\.\s|enfant|poids|taille|signature|cachet|m[eé]decin|g[eé]n[eé]raliste|cabinet|clinique|h[oô]pital|centre|sant[eé]|renouvel|non substituable|ns\b|le \d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}|^\s*\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\s*$|page \d)/i;

/* Découpe le texte lu en blocs « médicament + posologie ». */
function decouper(texte){
 const lignes=String(texte||'').split(/\r?\n/).map(l=>corrigerOcr(l).replace(/[|_~«»•·*]+/g,' ').replace(/^\s*[-–—]\s*/,'').replace(/^\s*\d{1,2}\s*[).]\s+/,'').replace(/\s+/g,' ').trim()).filter(l=>l.length>=3);
 const blocs=[];let cur=null;
 for(const l of lignes){
  if(ENTETE.test(l)&&!RE_DOSE.test(l))continue;
  if(cur&&/^(q\.?\s?s\.?\s?p|pendant|durant|renouveler)\b/i.test(l)){cur.posologie.push(l);continue}
  const aDose=RE_DOSE.test(l)||FORMES.test(l),estPoso=POSO.test(l)&&!/^[A-ZÉÈ]{3,}/.test(l);
  if(cur&&estPoso&&!(aDose&&/^[A-Za-zÉÈ]{4,}/.test(l)&&!/^(prendre|appliquer|inhaler|instiller|injecter|faire|matin|midi|soir|un|une|deux|trois)\b/i.test(l))){cur.posologie.push(l);continue}
  if(aDose||/^[A-ZÉÈ][A-ZÉÈ0-9 \-]{3,}/.test(l)){cur={brut:l,posologie:[]};blocs.push(cur);continue}
  if(cur&&cur.posologie.length<3&&l.length<120)cur.posologie.push(l);
 }
 return blocs;
}

/* Catalogue BDPM (dist/assets/medicaments-bdpm.json) : [{cis,name,substances,active}] → index par premier mot. */
function indexer(specialites){
 const parMot=new Map(),parSubst=new Map();
 for(const s of specialites||[]){
  const m=mots(s.name)[0];if(m&&m.length>=3){if(!parMot.has(m))parMot.set(m,[]);parMot.get(m).push(s)}
  for(const sub of s.substances||[]){const k=mots(sub)[0];if(k&&k.length>=4){if(!parSubst.has(k))parSubst.set(k,[]);parSubst.get(k).push(s)}}
 }
 return {parMot,parSubst};
}
const doseDe=t=>{const m=RE_DOSE.exec(corrigerOcr(t));return m?{valeur:Number(m[1].replace(',','.')),unite:m[2].toLowerCase().replace(/\./g,'').replace(/^u$/,'ui'),texte:m[0]}:null};
// Distance d'édition bornée (pour les marques mal lues : « D0LIPRANE », « Kardegic »).
function distance(a,b,max=2){if(Math.abs(a.length-b.length)>max)return max+1;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++){let best=99;for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));best=Math.min(best,d[i][j])}if(best>max)return max+1}return d[a.length][b.length]}

// Écritures équivalentes d'un dosage : 1 g = 1000 mg, 75 µg = 75 microgrammes, UI = U.I.
function variantes(d){
 const n=v=>String(+v.toFixed(3)).replace('.','[.,]'),out=[];
 const u=d.unite.replace(/^(ug|mcg)$/,'µg');
 if(u==='mg'){out.push([d.valeur,'mg']);if(d.valeur>=1000)out.push([d.valeur/1000,'g']);if(d.valeur<1)out.push([d.valeur*1000,'(?:µg|ug|microgrammes?)'])}
 else if(u==='g'){out.push([d.valeur,'g'],[d.valeur*1000,'mg'])}
 else if(u==='µg'){out.push([d.valeur,'(?:µg|ug|mcg|microgrammes?)'])}
 else if(u==='ui'){out.push([d.valeur,'(?:ui|u ?i)'])}
 else out.push([d.valeur,u.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')]);
 return out.map(([v,un])=>new RegExp('(^|[^0-9.,])'+n(v)+'\\s?'+un+'(?![a-z])','i'));
}
/* Rattache un bloc à la BDPM. Confiance : vert (marque ou substance + dosage retrouvés), orange (nom retrouvé, dosage
   absent ou différent, ou nom approché), rouge (non retrouvé). */
function rattacher(bloc,index){
 const w=mots(bloc.brut),dose=doseDe(bloc.brut),cands=[];let approche=false;
 for(const m of w.slice(0,3)){
  if(m.length<3||/^\d/.test(m))continue;
  let l=index.parMot.get(m)||index.parSubst.get(m);
  if(!l&&m.length>=5){for(const [k,v] of index.parMot){if(k[0]===m[0]&&distance(k,m)<=1){l=v;approche=true;break}}}
  if(l){cands.push(...l);break}
 }
 const nom=bloc.brut.replace(RE_DOSE,'').replace(FORMES,'').replace(/\s+/g,' ').trim();
 const posologie=bloc.posologie.join(' ; '),duree=(DUREE.exec(bloc.brut+' '+posologie)||[])[0]||'';
 if(!cands.length)return {lu:bloc.brut,nom,dose:dose?.texte||'',posologie,duree,cis:'',specialite:'',substances:[],confiance:'rouge',raison:'Non retrouvé dans la base publique des médicaments : vérifiez et corrigez le nom.'};
 // Meilleure spécialité : commercialisée, même dosage, même forme, nom le plus court (spécialité « simple »).
 const forme=(FORMES.exec(bloc.brut)||[])[0]||'';
 const score=s=>{const f=fold(s.name);let n=0;if(s.active)n+=4;if(dose&&variantes(dose).some(re=>re.test(f)))n+=6;if(forme&&f.includes(fold(forme).slice(0,5)))n+=2;for(const m of w)if(m.length>=3&&f.includes(m))n+=1;return n-f.length/400};
 const best=[...cands].sort((a,b)=>score(b)-score(a))[0];
 const doseOk=!!dose&&score(best)-(best.active?4:0)>=6;
 const confiance=!approche&&doseOk?'vert':'orange';
 const raison=approche?'Nom approché (lecture incertaine) : vérifiez la spécialité.':!dose?'Dosage non lu : complétez-le.':!doseOk?'Dosage lu absent de la base pour ce nom : vérifiez.':'';
 // Ligne écrite en DCI (« METFORMINE 1000 mg ») : on garde la DCI, pas le nom d'un générique particulier.
 const dci=(best.substances||[]).some(x=>mots(x).includes(w[0]));
 // Dosage lu différent de la spécialité retenue : on garde le dosage LU (jamais un autre dosage à la place).
 const marque=best.name.split(',')[0].replace(/\s+\d.*$/,'').trim();
 const nomRetenu=dci?w[0].toUpperCase()+(dose?' '+dose.texte:''):doseOk||!dose?best.name.split(',')[0].trim():marque+' '+dose.texte;
 return {lu:bloc.brut,nom:nomRetenu,dose:dose?.texte||'',posologie,duree,cis:best.cis,specialite:best.name,substances:best.substances||[],confiance,raison,actif:!!best.active};
}
function lire(texte,specialites){const index=indexer(specialites);return decouper(texte).map(b=>rattacher(b,index))}

/* Ligne de traitement habituel telle qu'elle entre dans la consultation (« Nom dose — posologie »). */
function ligneTraitement(l){const nom=[String(l.nom||'').trim(),String(l.dose||'').trim()].filter(Boolean).join(' ');const p=String(l.posologie||'').trim();return nom+(p?' — '+p:'')}
/* Ajoute les lignes validées au texte existant sans rien effacer ni doubler (même premier mot = même médicament). */
function fusionnerTexte(existant,lignes){
 const deja=new Set(String(existant||'').split('\n').map(x=>mots(x)[0]).filter(Boolean)),ajout=[];
 for(const l of lignes){const t=ligneTraitement(l),k=mots(t)[0];if(!k||deja.has(k))continue;deja.add(k);ajout.push(t)}
 const base=String(existant||'').trim().replace(/^(aucun|néant|neant)\.?$/i,'');
 return {texte:[base,...ajout].filter(Boolean).join('\n'),ajoutees:ajout.length};
}
const COULEURS={vert:'Lecture sûre',orange:'À vérifier',rouge:'Non reconnu'};
return {variantes,fold,corrigerOcr,decouper,indexer,rattacher,lire,doseDe,distance,ligneTraitement,fusionnerTexte,COULEURS};
});

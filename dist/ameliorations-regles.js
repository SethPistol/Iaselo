/* IASELO · règles des améliorations 1.1 (allergies, antibioprophylaxie, NEWS2, code-barres, import de programme).
   Fonctions pures testées dans tests/ameliorations.test.cjs. Ce sont des aides : le professionnel décide et valide. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloAmeliorations=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[’']/g,' ');
const num=v=>{if(v===''||v===null||v===undefined)return null;const n=parseFloat(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const words=s=>norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const hasWord=(text,key)=>{const t=' '+words(text).join(' ')+' ',k=' '+words(key).join(' ');return t.includes(k)};

/* ---------------- 1. Allergies ↔ médicaments ----------------
   Chaque classe : mots qui la désignent dans le texte d'allergie, et molécules / spécialités qui en font partie.
   « croisees » : classes voisines pour lesquelles une prudence est signalée (réactivité croisée possible). */
const CLASSES=[
 {id:'penicillines',label:'Pénicillines',allergie:['penicilline','penicillines','betalactamine','betalactamines','beta lactamine','beta lactamines','amoxicilline','augmentin','clamoxyl','ampicilline'],molecules:['amoxicilline','augmentin','clamoxyl','ampicilline','penicilline','benzylpenicilline','extencilline','oracilline','cloxacilline','oxacilline','piperacilline','tazocilline','ticarcilline','temocilline'],croisees:['cephalosporines','carbapenemes']},
 {id:'cephalosporines',label:'Céphalosporines',allergie:['cephalosporine','cephalosporines','cefazoline','cefuroxime','ceftriaxone','rocephine','cefoxitine','cefotaxime','ceftazidime','cefamandole','cefepime'],molecules:['cefazoline','cefuroxime','zinnat','ceftriaxone','rocephine','cefoxitine','cefotaxime','claforan','ceftazidime','fortum','cefamandole','cefepime','cefixime','cefpodoxime','orelox'],croisees:['penicillines']},
 {id:'carbapenemes',label:'Carbapénèmes',allergie:['carbapeneme','carbapenemes','imipeneme','meropeneme','ertapeneme'],molecules:['imipeneme','tienam','meropeneme','ertapeneme','invanz'],croisees:[]},
 {id:'glycopeptides',label:'Glycopeptides',allergie:['vancomycine','teicoplanine','glycopeptide','glycopeptides'],molecules:['vancomycine','teicoplanine','targocid'],croisees:[]},
 {id:'aminosides',label:'Aminosides',allergie:['aminoside','aminosides','gentamicine','amikacine','tobramycine'],molecules:['gentamicine','amikacine','tobramycine'],croisees:[]},
 {id:'lincosamides',label:'Clindamycine',allergie:['clindamycine','dalacine','lincosamide'],molecules:['clindamycine','dalacine'],croisees:[]},
 {id:'quinolones',label:'Fluoroquinolones',allergie:['quinolone','quinolones','fluoroquinolone','fluoroquinolones','ciprofloxacine','levofloxacine','ofloxacine','moxifloxacine'],molecules:['ciprofloxacine','ciflox','levofloxacine','tavanic','ofloxacine','oflocet','moxifloxacine'],croisees:[]},
 {id:'sulfamides',label:'Sulfamides antibactériens',allergie:['sulfamide','sulfamides','bactrim','cotrimoxazole','sulfamethoxazole'],molecules:['bactrim','cotrimoxazole','sulfamethoxazole'],croisees:[]},
 {id:'macrolides',label:'Macrolides',allergie:['macrolide','macrolides','erythromycine','azithromycine','clarithromycine','spiramycine'],molecules:['erythromycine','azithromycine','zithromax','clarithromycine','spiramycine','rovamycine'],croisees:[]},
 {id:'metronidazole',label:'Métronidazole',allergie:['metronidazole','flagyl'],molecules:['metronidazole','flagyl','ornidazole'],croisees:[]},
 {id:'ains',label:'AINS et aspirine',allergie:['ains','anti inflammatoire','anti inflammatoires','aspirine','kardegic','ibuprofene','ketoprofene','profenid','diclofenac','voltarene','naproxene','ketorolac','acide acetylsalicylique'],molecules:['ketoprofene','profenid','ibuprofene','advil','nurofen','diclofenac','voltarene','naproxene','ketorolac','aspirine','kardegic','acide acetylsalicylique','aspegic','flurbiprofene','indometacine','piroxicam','meloxicam'],croisees:['coxibs']},
 {id:'coxibs',label:'Coxibs',allergie:['coxib','coxibs','celecoxib','parecoxib','etoricoxib'],molecules:['celecoxib','celebrex','parecoxib','dynastat','etoricoxib'],croisees:[]},
 {id:'paracetamol',label:'Paracétamol',allergie:['paracetamol','doliprane','perfalgan','efferalgan','dafalgan'],molecules:['paracetamol','doliprane','perfalgan','efferalgan','dafalgan'],croisees:[]},
 {id:'nefopam',label:'Néfopam',allergie:['nefopam','acupan'],molecules:['nefopam','acupan'],croisees:[]},
 {id:'morphiniques',label:'Morphiniques',allergie:['morphine','morphinique','morphiniques','opiace','opiaces','opioide','opioides','codeine','oxycodone','tramadol'],molecules:['morphine','oxycodone','oxynorm','codeine','tramadol','topalgic','contramal','sufentanil','remifentanil','fentanyl','alfentanil','nalbuphine','buprenorphine','hydromorphone','tapentadol'],croisees:[]},
 {id:'curares',label:'Curares',allergie:['curare','curares','bloquant neuromusculaire','rocuronium','esmeron','atracurium','cisatracurium','nimbex','suxamethonium','succinylcholine','celocurine','vecuronium','mivacurium'],molecules:['rocuronium','esmeron','atracurium','cisatracurium','nimbex','suxamethonium','succinylcholine','celocurine','vecuronium','mivacurium','mivacron'],croisees:[]},
 {id:'sugammadex',label:'Sugammadex',allergie:['sugammadex','bridion'],molecules:['sugammadex','bridion'],croisees:[]},
 {id:'hypnotiques',label:'Hypnotiques',allergie:['propofol','diprivan','etomidate','hypnomidate','thiopental','penthotal','ketamine'],molecules:['propofol','diprivan','etomidate','hypnomidate','thiopental','penthotal','ketamine','esketamine'],croisees:[]},
 {id:'benzodiazepines',label:'Benzodiazépines',allergie:['benzodiazepine','benzodiazepines','midazolam','hypnovel','diazepam','valium'],molecules:['midazolam','hypnovel','diazepam','valium','lorazepam','temesta','alprazolam','xanax','clorazepate','tranxene'],croisees:[]},
 {id:'al-amides',label:'Anesthésiques locaux (amides)',allergie:['anesthesique local','anesthesiques locaux','lidocaine','xylocaine','ropivacaine','naropeine','bupivacaine','marcaine','levobupivacaine','chirocaine','mepivacaine','carbocaine'],molecules:['lidocaine','xylocaine','ropivacaine','naropeine','bupivacaine','marcaine','levobupivacaine','chirocaine','mepivacaine','carbocaine','prilocaine','emla'],croisees:[]},
 {id:'heparines',label:'Héparines (dont TIH)',allergie:['heparine','heparines','tih','thrombopenie induite','hbpm','enoxaparine','lovenox','tinzaparine','innohep','dalteparine','fragmine'],molecules:['heparine','calciparine','enoxaparine','lovenox','tinzaparine','innohep','dalteparine','fragmine','nadroparine','fraxiparine'],croisees:[]},
 {id:'iode',label:'Iode (antiseptiques et produits de contraste)',allergie:['iode','iodes','betadine','povidone','produit de contraste','produits de contraste','contraste iode'],molecules:['betadine','povidone iodee','povidone','iomeprol','iohexol','omnipaque','iopamidol','iobitridol','xenetix','iodixanol','visipaque','lipiodol'],croisees:[]},
 {id:'chlorhexidine',label:'Chlorhexidine',allergie:['chlorhexidine','hibitane','biseptine','hibiscrub'],molecules:['chlorhexidine','hibitane','biseptine','hibiscrub','chlorhexidine alcoolique'],croisees:[]},
 {id:'colloides',label:'Gélatines et amidons',allergie:['gelatine','gelatines','gelofusine','plasmion','hea','amidon','voluven','colloide','colloides'],molecules:['gelofusine','plasmion','gelatine fluide modifiee','voluven','hydroxyethylamidon','restorvol'],croisees:[]},
 {id:'bleu',label:'Colorants (bleu patenté, bleu de méthylène)',allergie:['bleu patente','bleu de methylene','colorant'],molecules:['bleu patente','bleu de methylene','proveblue'],croisees:[]},
 {id:'antiemetiques',label:'Sétrons',allergie:['ondansetron','zophren','granisetron','setron','setrons'],molecules:['ondansetron','zophren','granisetron','kytril'],croisees:[]},
 {id:'metoclopramide',label:'Métoclopramide',allergie:['metoclopramide','primperan'],molecules:['metoclopramide','primperan'],croisees:[]},
 {id:'droperidol',label:'Dropéridol',allergie:['droperidol','droleptan'],molecules:['droperidol','droleptan'],croisees:[]},
 {id:'corticoides',label:'Corticoïdes',allergie:['corticoide','corticoides','dexamethasone','methylprednisolone','solumedrol','hydrocortisone'],molecules:['dexamethasone','methylprednisolone','solumedrol','hydrocortisone','prednisolone','betamethasone'],croisees:[]},
 {id:'acidetranexamique',label:'Acide tranexamique',allergie:['acide tranexamique','exacyl'],molecules:['acide tranexamique','exacyl'],croisees:[]}
];
const byId=Object.fromEntries(CLASSES.map(c=>[c.id,c]));
const AUCUNE=/^(aucune?|aucune allergie|pas d allergies?( connue?s?)?|nkda|non|ras|neant|0|sans allergies?( connues?)?)\b/;
const A_VERIFIER=/^(a verifier|inconnue?s?|non renseigne(e|es|s)?|\?|)$/;
// Reconnaît « latex » à part : il ne concerne pas une molécule mais le matériel et l'ordre de passage au bloc.
function lireAllergies(texte){
 const t=norm(texte).trim();
 if(A_VERIFIER.test(t))return {statut:'a-verifier',classes:[],latex:false,libres:[]};
 if(AUCUNE.test(t)&&!/(sauf|mais|allergi[eq]ue? (a|au|aux))/.test(t.replace(AUCUNE,'')))return {statut:'aucune',classes:[],latex:false,libres:[]};
 const classes=CLASSES.filter(c=>c.allergie.some(k=>hasWord(t,k))).map(c=>c.id);
 const latex=hasWord(t,'latex');
 return {statut:'connue',classes,latex,libres:t.split(/[,;\n/+]| et /).map(s=>s.trim()).filter(Boolean)};
}
function classesDuMedicament(med){return CLASSES.filter(c=>c.molecules.some(k=>hasWord(med,k))).map(c=>c.id)}
/* Retour : liste d'alertes {niveau:'allergie'|'croisee', classe, message}. Vide si rien à signaler. */
function controleAllergies(allergies,medicament){
 const a=lireAllergies(allergies),m=String(medicament||'').trim();if(!m||a.statut!=='connue')return [];
 const med=classesDuMedicament(m),out=[];
 for(const id of med){
  if(a.classes.includes(id))out.push({niveau:'allergie',classe:byId[id].label,message:'Allergie déclarée : '+byId[id].label+'. '+m+' appartient à cette classe.'});
  else{const voisin=a.classes.find(x=>byId[x].croisees.includes(id));if(voisin)out.push({niveau:'croisee',classe:byId[id].label,message:'Allergie déclarée aux '+byId[voisin].label.toLowerCase()+' : réactivité croisée possible avec '+m+' ('+byId[id].label.toLowerCase()+'). Vérifiez la nature de la réaction.'})}
 }
 // Mention libre identique au médicament (ex. « allergie : Néfopam ») même hors classes connues.
 if(!out.length&&a.libres.some(x=>x.length>3&&(hasWord(m,x)||hasWord(x,m))))out.push({niveau:'allergie',classe:m,message:'Le médicament figure dans les allergies déclarées.'});
 return out;
}

/* ---------------- 2. Antibioprophylaxie : réinjections peropératoires ----------------
   Délai de réinjection (2 demi-vies) et dose, d'après la RFE SFAR 2024. À relire par l'équipe. */
const ANTIBIOTIQUES=[
 {id:'cefazoline',mots:['cefazoline'],label:'Céfazoline',heures:4,dose:'1 g (2 g si dose initiale de 4 g)'},
 {id:'cefuroxime',mots:['cefuroxime'],label:'Céfuroxime',heures:2,dose:'0,75 g'},
 {id:'cefamandole',mots:['cefamandole'],label:'Céfamandole',heures:2,dose:'0,75 g'},
 {id:'cefoxitine',mots:['cefoxitine'],label:'Céfoxitine',heures:2,dose:'1 g'},
 {id:'amoxclav',mots:['amoxicilline acide clavulanique','amoxicilline clavulanate','augmentin'],label:'Amoxicilline-acide clavulanique',heures:2,dose:'1 g'},
 {id:'clindamycine',mots:['clindamycine','dalacine'],label:'Clindamycine',heures:4,dose:'600 mg'},
 {id:'vancomycine',mots:['vancomycine'],label:'Vancomycine',heures:null,dose:'Pas de réinjection peropératoire habituelle'},
 {id:'gentamicine',mots:['gentamicine'],label:'Gentamicine',heures:null,dose:'Pas de réinjection'},
 {id:'metronidazole',mots:['metronidazole','flagyl'],label:'Métronidazole',heures:null,dose:'Pas de réinjection'}
];
function antibiotique(drug){const d=norm(drug);return ANTIBIOTIQUES.find(a=>a.mots.some(k=>d.includes(k)))||null}
/* records : enregistrements peropératoires {kind:'Médicament',at,values:{drug}} ; now : Date ou ISO. */
function reinjections(records,now=new Date()){
 const t=now instanceof Date?now.getTime():Date.parse(now),last=new Map();
 for(const r of records||[]){if(r.voided||r.kind!=='Médicament')continue;const a=antibiotique(r.values?.drug);if(!a)continue;const at=Date.parse(r.at);if(!Number.isFinite(at))continue;const prev=last.get(a.id);if(!prev||at>prev.at)last.set(a.id,{a,at,count:(prev?.count||0)+1});else prev.count++;}
 return [...last.values()].map(({a,at,count})=>{
  if(!a.heures)return {id:a.id,label:a.label,derniere:new Date(at).toISOString(),injections:count,statut:'sans',message:a.dose};
  const due=at+a.heures*3600000,reste=Math.round((due-t)/60000);
  const statut=reste>15?'a-venir':reste>0?'bientot':reste>=-15?'due':'depassee';
  return {id:a.id,label:a.label,derniere:new Date(at).toISOString(),injections:count,intervalle:a.heures,prochaine:new Date(due).toISOString(),resteMinutes:reste,statut,dose:a.dose};
 });
}
const duree=min=>{const m=Math.abs(min),h=Math.floor(m/60),r=m%60;return (h?h+' h '+String(r).padStart(2,'0'):r+' min')};

/* ---------------- 3. NEWS2 (Royal College of Physicians, 2017) ----------------
   v : {rr, spo2, o2 ('Air'|'Oxygène'), sbp, hr, avpu ('A'|'C'|'V'|'P'|'U'), temp}. Échelle SpO₂ n°1. */
const band=(v,rules)=>{for(const [test,pts] of rules)if(test(v))return pts;return 0};
function news2(v={}){
 const rr=num(v.rr),spo2=num(v.spo2),sbp=num(v.sbp),hr=num(v.hr),temp=num(v.temp),o2=v.o2,avpu=String(v.avpu||'').trim().toUpperCase().slice(0,1);
 const items=[
  ['rr','Fréquence respiratoire',rr,rr==null?null:band(rr,[[x=>x<=8,3],[x=>x<=11,1],[x=>x<=20,0],[x=>x<=24,2],[()=>true,3]])],
  ['spo2','SpO₂',spo2,spo2==null?null:band(spo2,[[x=>x<=91,3],[x=>x<=93,2],[x=>x<=95,1],[()=>true,0]])],
  ['o2','Oxygène',o2||null,!o2?null:o2==='Oxygène'?2:0],
  ['sbp','PAS',sbp,sbp==null?null:band(sbp,[[x=>x<=90,3],[x=>x<=100,2],[x=>x<=110,1],[x=>x<=219,0],[()=>true,3]])],
  ['hr','FC',hr,hr==null?null:band(hr,[[x=>x<=40,3],[x=>x<=50,1],[x=>x<=90,0],[x=>x<=110,1],[x=>x<=130,2],[()=>true,3]])],
  ['avpu','Conscience',avpu||null,!avpu?null:avpu==='A'?0:3],
  ['temp','Température',temp,temp==null?null:band(temp,[[x=>x<=35,3],[x=>x<=36,1],[x=>x<=38,0],[x=>x<=39,1],[()=>true,2]])]
 ].map(([key,label,value,points])=>({key,label,value,points}));
 const present=items.filter(i=>i.points!==null),total=present.reduce((s,i)=>s+i.points,0),manquants=items.filter(i=>i.points===null).map(i=>i.label);
 const rouge=present.some(i=>i.points===3);
 const niveau=total>=7?'eleve':total>=5?'moyen':rouge?'moyen-unique':total>=1?'faible':'nul';
 const conduite={eleve:'Risque élevé : appel immédiat du médecin (réanimation / anesthésiste), surveillance continue.',moyen:'Risque moyen : évaluation médicale urgente, surveillance au moins horaire.','moyen-unique':'Un paramètre à 3 : évaluation médicale rapide, surveillance au moins horaire.',faible:'Risque faible : surveillance au moins toutes les 4 à 6 heures, avis infirmier.',nul:'Surveillance habituelle (au moins toutes les 12 heures).'}[niveau];
 return {total,items,manquants,complet:manquants.length===0,niveau,conduite,mesures:present.length};
}

/* ---------------- 4. Code-barres Code 128 (jeu B) ---------------- */
const C128=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
const ascii=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7e]/g,'');
function code128(text){
 const s=ascii(text);if(!s)throw Error('Texte vide pour le code-barres.');
 const codes=[104,...[...s].map(ch=>ch.charCodeAt(0)-32)];
 const check=codes.reduce((sum,c,i)=>sum+c*(i||1),0)%103;
 return {texte:s,codes:[...codes,check,106],motif:[...codes,check,106].map(c=>C128[c]).join('')};
}
function code128Svg(text,{hauteur=48,module=1.6}={}){
 const {motif,texte}=code128(text),quiet=10;let x=quiet,bars='';
 [...motif].forEach((w,i)=>{const width=Number(w)*module;if(i%2===0)bars+=`<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="${hauteur}"/>`;x+=width});
 const total=x+quiet;return `<svg class="am-barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total.toFixed(2)} ${hauteur}" width="${total.toFixed(0)}" height="${hauteur}" role="img" aria-label="Code-barres ${texte.replace(/[<>&"]/g,'')}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
}

/* ---------------- 5. Import du programme opératoire (export CSV d'E-med ou tableur) ---------------- */
function parseCsv(text){
 const src=String(text||'').replace(/^﻿/,'');const first=src.split(/\r?\n/)[0]||'';
 const sep=[';','\t',','].map(c=>[c,first.split(c).length]).sort((a,b)=>b[1]-a[1])[0][0];
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<src.length;i++){const ch=src[i];
  if(q){if(ch==='"'){if(src[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch;continue}
  if(ch==='"'){q=true;continue}
  if(ch===sep){row.push(cell);cell='';continue}
  if(ch==='\n'||ch==='\r'){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(cell);if(row.some(c=>c.trim()))rows.push(row);row=[];cell='';continue}
  cell+=ch;
 }
 row.push(cell);if(row.some(c=>c.trim()))rows.push(row);
 return {separateur:sep,rows:rows.map(r=>r.map(c=>c.trim()))};
}
const COLONNES={
 nom:['nom','nom de naissance','nom patient','nom usuel','patient nom'],
 prenom:['prenom','prenom patient','premier prenom'],
 naissance:['date de naissance','naissance','ddn','ne le','nee le','ne e le'],
 sexe:['sexe','genre'],
 ipp:['ipp','n dossier','numero de dossier','no dossier','dossier','identifiant patient','nip'],
 date:['date intervention','date d intervention','date operation','date','jour','date programmee'],
 heure:['heure','heure debut','heure de debut','debut','heure prevue','horaire'],
 duree:['duree','duree prevue','duree min','duree minutes','temps'],
 salle:['salle','salle d operation','bloc','salle bloc'],
 intervention:['intervention','acte','libelle','libelle intervention','geste','operation','procedure'],
 chirurgien:['chirurgien','operateur','praticien','medecin'],
 anesthesiste:['anesthesiste','mar','anesthesie'],
 specialite:['specialite','discipline','service'],
 mode:['mode','type de sejour','type hospitalisation','ambulatoire','hospitalisation','mode d hospitalisation']
};
function colonnes(entete){
 const h=entete.map(x=>norm(x).replace(/[^a-z0-9]+/g,' ').trim()),map={};
 for(const [key,syn] of Object.entries(COLONNES)){let idx=h.findIndex(x=>syn.includes(x));if(idx<0)idx=h.findIndex(x=>syn.some(s=>s.length>3&&x.startsWith(s)));if(idx>=0&&!Object.values(map).includes(idx))map[key]=idx;}
 return map;
}
const vraieDate=(y,mo,d)=>{const x=new Date(Date.UTC(y,mo-1,d));return y>1900&&y<2200&&x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:''};
function dateIso(v){const s=String(v||'').trim();let m=s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);if(m){let y=Number(m[3]);if(y<100)y+=y>40?1900:2000;return vraieDate(y,Number(m[2]),Number(m[1]))}m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?vraieDate(Number(m[1]),Number(m[2]),Number(m[3])):''}
function heure(v){const m=String(v||'').trim().match(/^(\d{1,2})\s*[:hH.]\s*(\d{2})?/);if(!m)return '';const h=Number(m[1]),mi=Number(m[2]||0);return h<24&&mi<60?String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0'):''}
function dureeMin(v){const s=norm(v).trim();if(!s)return null;let m=s.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?$/);if(m)return Number(m[1])*60+Number(m[2]||0);m=s.match(/^(\d{1,4})\s*(min|mn|m)?$/);return m?Number(m[1]):null}
function sexe(v){const s=norm(v).trim();return /^(f|femme|feminin)/.test(s)?'F':/^(m|h|homme|masculin)/.test(s)?'M':''}
function mode(v){const s=norm(v);return /ambu|uca|jour|ambulatoire/.test(s)?'Ambulatoire':s?'Hospitalisation':''}
const SPECIALITES=['Orthopédie','Chirurgie digestive','ORL','Gynécologie','Urologie'];
function specialite(v,interv){const s=norm(v+' '+interv);if(/ortho|genou|hanche|epaule|lca|menisque|canal carpien|ptg|pth/.test(s))return 'Orthopédie';if(/digest|viscer|cholecyst|hernie|colon|appendic|sleeve|bypass/.test(s))return 'Chirurgie digestive';if(/orl|amygdal|thyroid|septo|sinus|tympan/.test(s))return 'ORL';if(/gyneco|hysterect|coelio|uter|ovair|sein/.test(s))return 'Gynécologie';if(/uro|prostat|vessie|rein|ureter|rtup/.test(s))return 'Urologie';return v?String(v).trim():''}
/* Retour : {colonnes, manquantes, lignes:[{n, valeurs normalisées, erreurs[]}]} */
function lireProgramme(text){
 const {rows}=parseCsv(text);if(rows.length<2)return {colonnes:{},manquantes:['fichier vide ou sans ligne de données'],lignes:[]};
 const map=colonnes(rows[0]),requis=['nom','prenom','naissance','date','heure'];
 const manquantes=requis.filter(k=>!(k in map));
 const get=(r,k)=>k in map?String(r[map[k]]??'').trim():'';
 const lignes=rows.slice(1).map((r,i)=>{
  const v={nom:get(r,'nom').toUpperCase(),prenom:get(r,'prenom'),naissance:dateIso(get(r,'naissance')),sexe:sexe(get(r,'sexe')),ipp:get(r,'ipp'),date:dateIso(get(r,'date')),heure:heure(get(r,'heure')),duree:dureeMin(get(r,'duree'))??60,salle:get(r,'salle'),intervention:get(r,'intervention'),chirurgien:get(r,'chirurgien'),anesthesiste:get(r,'anesthesiste'),mode:mode(get(r,'mode'))||'Hospitalisation'};
  v.specialite=specialite(get(r,'specialite'),v.intervention)||'À renseigner';
  const erreurs=[];if(!v.nom||!v.prenom)erreurs.push('nom ou prénom manquant');if(!v.naissance)erreurs.push('date de naissance illisible');if(!v.date)erreurs.push('date d’intervention illisible');if(!v.heure)erreurs.push('heure illisible');if(v.duree<10||v.duree>900)erreurs.push('durée hors limites');
  return {n:i+2,...v,erreurs};
 });
 return {colonnes:map,manquantes,lignes};
}
const MODELE_CSV='Nom;Prénom;Date de naissance;Sexe;IPP;Date intervention;Heure début;Durée;Salle;Intervention;Chirurgien;Anesthésiste;Spécialité;Mode\nFICTIF;Alice;01/02/1970;F;IPP-TEST-1;24/11/2026;08:00;90;Salle 1;Prothèse totale de hanche droite;Dr Test;Dr Démo;Orthopédie;Hospitalisation\nESSAI;Bruno;15/06/1985;M;IPP-TEST-2;24/11/2026;10:00;45;Salle 2;Cure de hernie inguinale;Dr Test;Dr Démo;Chirurgie digestive;Ambulatoire\n';

return {norm,CLASSES,lireAllergies,classesDuMedicament,controleAllergies,ANTIBIOTIQUES,antibiotique,reinjections,duree,news2,code128,code128Svg,C128,parseCsv,colonnes,dateIso,heure,dureeMin,lireProgramme,MODELE_CSV};
});

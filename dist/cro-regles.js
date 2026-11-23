/* IASELO · règles du compte rendu opératoire (CRO). Fonctions pures, partagées navigateur / tests.
   - Rubriques du CRO et rangement automatique d'un texte dicté ou importé (titres reconnus en début de phrase).
   - Commandes vocales de ponctuation (« à la ligne », « virgule »…) et nettoyage des transcriptions
     (boucles et phrases parasites connues des modèles de reconnaissance vocale sur les silences).
   - Découpage de l'audio aux pauses (segments de 30 s au plus pour le modèle) et rééchantillonnage à 16 kHz.
   - Lecture locale des documents : .docx et .odt (archive zip), .doc (Word 97-2003), .rtf, .txt ; le .pdf passe par pdf.js.
   Rien n'est envoyé hors du poste : ces fonctions ne font aucun appel réseau. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCro=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';

/* ---------- Rubriques ---------- */
const RUBRIQUES=[
 {id:'indication',titre:'Indication',aide:'Motif de l’intervention, contexte clinique.'},
 {id:'installation',titre:'Installation et anesthésie',aide:'Position, type d’anesthésie, antibioprophylaxie, préparation cutanée.'},
 {id:'voieAbord',titre:'Voie d’abord',aide:'Incision, trocarts, exposition.'},
 {id:'constatations',titre:'Constatations peropératoires',aide:'Exploration, lésions retrouvées.'},
 {id:'gestes',titre:'Gestes réalisés',aide:'Déroulement de l’intervention, temps opératoires.'},
 {id:'dispositifs',titre:'Dispositifs médicaux implantés',aide:'Prothèses, implants, matériel laissé en place (traçabilité).'},
 {id:'prelevements',titre:'Prélèvements',aide:'Anatomopathologie, bactériologie, examen extemporané.'},
 {id:'fermeture',titre:'Hémostase, drainage et fermeture',aide:'Hémostase, drains, fermeture, pansement.'},
 {id:'incidents',titre:'Incidents et pertes sanguines',aide:'Incidents ou complications peropératoires, saignement, transfusion.'},
 {id:'consignes',titre:'Consignes postopératoires',aide:'Surveillance, lever, alimentation, soins, rendez-vous de contrôle.'}
];
const AUTRE={id:'autre',titre:'Texte à classer',aide:'Texte reconnu sans rubrique : déplacez-le ou laissez-le tel quel.'};
const IDS=RUBRIQUES.map(r=>r.id);

/* Titres reconnus (sans accents, minuscules). « strict » : mot qui peut ouvrir une phrase ordinaire,
   il n'est pris pour un titre que s'il est suivi d'une ponctuation (« Anesthésie : … ») ou seul sur sa ligne. */
const TITRES=[
 // [rubrique, mots, strict, garder] — « garder » : le mot fait partie du contenu (« Antibioprophylaxie : céfazoline 2 g ») et reste dans le texte.
 ['indication',['indications operatoires','indication operatoire','indications','indication','motif de l intervention','rappel clinique','histoire de la maladie']],
 ['indication',['contexte','motif'],true],
 ['installation',['installation de la patiente','installation du patient','installation']],
 ['installation',['antibioprophylaxie','type d anesthesie'],false,true],
 ['installation',['anesthesie','preparation cutanee','preparation'],true,true],
 ['voieAbord',['voies d abord','voie d abord','voie d acces']],
 ['voieAbord',['abord'],true],
 ['voieAbord',['incision'],true,true],
 ['constatations',['constatations peroperatoires','constatations operatoires','constatations','constatation','bilan lesionnel']],
 ['constatations',['exploration'],false,true],
 ['constatations',['lesions'],true,true],
 ['gestes',['gestes realises','geste realise','gestes operatoires','geste operatoire','gestes','geste','deroulement de l intervention','deroulement','temps operatoires','temps operatoire','technique operatoire','intervention realisee']],
 ['gestes',['technique','procedure'],true],
 ['dispositifs',['dispositifs medicaux implantes','dispositifs implantes','dispositif implante','dispositifs medicaux']],
 ['dispositifs',['materiel implante','dmi','tracabilite'],false,true],
 ['dispositifs',['implants','implant','protheses','prothese','materiel'],true,true],
 ['prelevements',['prelevements','prelevement']],
 ['prelevements',['anatomopathologie','anapath','bacteriologie','examen extemporane'],false,true],
 ['fermeture',['hemostase drainage et fermeture','fermeture parietale','fermeture']],
 ['fermeture',['hemostase','drainage'],false,true],
 ['fermeture',['drains','drain','pansement'],true,true],
 ['incidents',['incidents peroperatoires','incidents et pertes sanguines','incidents','incident','complications peroperatoires']],
 ['incidents',['pertes sanguines','perte sanguine'],false,true],
 ['incidents',['complications','complication','saignement','transfusion'],true,true],
 ['consignes',['consignes postoperatoires','consignes post operatoires','consignes','suites operatoires','suites postoperatoires','prescriptions postoperatoires','conduite a tenir','soins postoperatoires']],
 ['consignes',['suites'],true],
 ['consignes',['suivi','surveillance'],true,true]
];
/* Lignes d'en-tête d'un document importé (« Opérateur : Dr X »). */
const ENTETES=[['operateur',['operateurs','operateur','chirurgien']],['aides',['aides operatoires','aide operatoire','aides','aide']],['operation',['intervention','acte realise','acte']]];

const sansAccents=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');
const norme=s=>sansAccents(s).toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9:.,;\-\s]/g,' ').replace(/\s+/g,' ').trim();
const TABLE=TITRES.flatMap(([id,mots,strict,garder])=>mots.map(m=>({id,mot:m,strict:!!strict,garder:!!garder}))).sort((a,b)=>b.mot.length-a.mot.length);
const TABLE_ENTETES=ENTETES.flatMap(([id,mots])=>mots.map(m=>({id,mot:m}))).sort((a,b)=>b.mot.length-a.mot.length);

/* Longueur, dans la phrase d'origine, du préfixe correspondant à `n` caractères du texte normalisé. */
function prefixeOrigine(phrase,mot){
 const cible=mot.split(' ').length;let mots=0,i=0;const re=/[A-Za-zÀ-ÿ0-9]+/g;let m;
 while((m=re.exec(phrase))){
  const w=norme(m[0]);mots+=w.split(' ').filter(Boolean).length;i=m.index+m[0].length;if(mots>=cible)break;
 }
 return i;
}

/* Reconnaît un titre au début d'une phrase. Renvoie {id, reste} ou null. */
function titre(phrase){
 let brut=String(phrase||'').trim();let force=false;
 const pref=/^(?:rubrique|chapitre|paragraphe|section)\s+/i.exec(brut);if(pref){brut=brut.slice(pref[0].length);force=true}
 const n=norme(brut).replace(/^[\-–•*\d.)\s]+/,'');
 for(const t of TABLE){
  if(!(n===t.mot||n.startsWith(t.mot+' ')||n.startsWith(t.mot+':')||n.startsWith(t.mot+'.')||n.startsWith(t.mot+',')||n.startsWith(t.mot+' :')||n.startsWith(t.mot+'-')||n.startsWith(t.mot+' -')))continue;
  const apres=n.slice(t.mot.length).trim();
  const ponctue=apres===''||/^[:.,;\-–]/.test(apres);
  if(t.strict&&!ponctue&&!force)continue;
  const debut=brut.replace(/^[\-–•*\d.)\s]+/,'');
  const fin=prefixeOrigine(debut,t.mot);
  let reste=debut.slice(fin);
  if(t.garder)reste=debut.charAt(0).toUpperCase()+debut.slice(1);
  else if(ponctue||force){reste=reste.replace(/^[\s:.,;\-–]+/,'');reste=reste.charAt(0).toUpperCase()+reste.slice(1)}else reste=debut;
  return {id:t.id,reste:reste.trim()};
 }
 return null;
}
function entete(ligne){
 const n=norme(ligne);
 for(const t of TABLE_ENTETES){
  if(!(n.startsWith(t.mot+' :')||n.startsWith(t.mot+':')))continue;
  const brut=String(ligne).trim(),i=brut.indexOf(':');const valeur=brut.slice(i+1).trim();
  if(valeur&&valeur.length<=250)return {id:t.id,valeur};
 }
 return null;
}

/* Découpe un texte en phrases en gardant les fins de ligne. */
function phrases(texte){
 const out=[];
 for(const ligne of String(texte||'').replace(/\r\n?/g,'\n').split('\n')){
  if(!ligne.trim()){out.push({texte:'',ligne:true});continue}
  const morceaux=ligne.match(/[^.!?…]+(?:[.!?…]+|$)(?:["»”)]*)/g)||[ligne];
  morceaux.forEach((m,i)=>{if(m.trim())out.push({texte:m.trim(),ligne:i===morceaux.length-1})});
 }
 return out;
}

/* Range un texte dans les rubriques. `courante` : rubrique où va le texte avant le premier titre (défaut : « autre »).
   Renvoie {sections:{id:texte}, entete:{operateur,aides,operation}, reconnues:[ids dans l'ordre]}. */
function structurer(texte,{courante='autre',entetes=true}={}){
 const sections={},reconnues=[],ent={};let cle=courante;
 const ajoute=(id,txt,nl)=>{if(!txt)return;const avant=sections[id]||'';sections[id]=avant+(avant&&!/\n$/.test(avant)?' ':'')+txt+(nl?'\n':'')};
 for(const ph of phrases(texte)){
  if(!ph.texte){if(sections[cle]&&!/\n\n$/.test(sections[cle]))sections[cle]+=/\n$/.test(sections[cle])?'\n':'\n\n';continue}
  if(entetes){const e=entete(ph.texte);if(e&&!ent[e.id]){ent[e.id]=e.valeur;continue}}
  if(/^compte[\s-]+rendu\s+op[ée]ratoire\s*:?$/i.test(ph.texte.trim()))continue;
  const t=titre(ph.texte);
  if(t){cle=t.id;if(!reconnues.includes(t.id))reconnues.push(t.id);ajoute(cle,t.reste,ph.ligne);continue}
  ajoute(cle,ph.texte,ph.ligne);
 }
 for(const k of Object.keys(sections)){sections[k]=sections[k].replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();if(!sections[k])delete sections[k]}
 return {sections,entete:ent,reconnues};
}

/* Ajoute des rubriques à celles qui existent (le nouveau texte va à la suite). */
function fusionner(existantes,ajout){
 const out={...(existantes||{})};
 for(const [k,v] of Object.entries(ajout||{})){if(!v)continue;if(out[k]&&out[k].includes(v.trim()))continue;out[k]=out[k]?out[k].trimEnd()+'\n'+v:v}
 return out;
}

/* Texte complet du CRO (copie lisible, recherche, codage). */
function composer(cro){
 const s=cro?.sections||{},l=[];
 if(cro?.operation)l.push('Intervention : '+cro.operation);
 if(cro?.date)l.push('Date : '+String(cro.date).split('-').reverse().join('/'));
 if(cro?.operateur)l.push('Opérateur : '+cro.operateur);
 if(cro?.aides)l.push('Aide(s) : '+cro.aides);
 const corps=[...RUBRIQUES,AUTRE].filter(r=>String(s[r.id]||'').trim()).map(r=>r.titre.toUpperCase()+'\n'+String(s[r.id]).trim());
 return [l.join('\n'),...corps].filter(Boolean).join('\n\n');
}
const rempli=sections=>[...IDS,'autre'].some(k=>String(sections?.[k]||'').trim());

/* Contrôles avant validation : renvoie la liste des manques (vide = validable). */
function manques(cro){
 const m=[];
 if(!cro?.date)m.push({id:'date',texte:'Date de l’intervention'});
 if(!String(cro?.operation||'').trim())m.push({id:'operation',texte:'Intervention réalisée'});
 if(!rempli(cro?.sections)&&!cro?.file)m.push({id:'gestes',texte:'Texte du compte rendu (dicté, importé ou saisi) ou document joint'});
 else if(rempli(cro?.sections)&&!String(cro?.sections?.gestes||'').trim()&&!String(cro?.sections?.autre||'').trim())m.push({id:'gestes',texte:'Rubrique « Gestes réalisés »'});
 if(!cro?.relu)m.push({id:'relu',texte:'Attestation de relecture'});
 return m;
}

/* ---------- Transcription : commandes vocales et nettoyage ---------- */
function commandesVocales(texte){
 let t=' '+String(texte||'')+' ';
 const r=(re,s)=>{t=t.replace(re,s)};
 r(/[,.]?\s*\bnouveau paragraphe\b[,.]?\s*/gi,'.\n\n');
 r(/[,.]?\s*\bpoint[,]? à la ligne\b[,.]?\s*/gi,'.\n');
 r(/[,.]?\s*\b(?:retour )?à la ligne\b[,.]?\s*/gi,'\n');
 r(/\s*\bpoint[- ]virgule\b[,.]?/gi,' ;');
 r(/\s*\bdeux[- ]points\b(?!\s+(?:de|d['’]|en|s[ée]par|cardinaux|au|à))[,.]?/gi,' :');
 r(/\s*,?\s*\bvirgule\b[,.]?/gi,',');
 r(/\s*\bouvre[zr]? (?:la )?parenth[èe]se\b[,.]?\s*/gi,' (');
 r(/[,.]?\s*\bferme[zr]? (?:la )?parenth[èe]se\b/gi,')');
 r(/\s*\bpoint (?:final|final\.)\b[,.]?/gi,'.');
 t=t.replace(/\.{2,}/g,'.').replace(/\.\s*,/g,'.').replace(/ +([,.;)])/g,'$1').replace(/\( +/g,'(').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/^\s*[.,]\s*/,'');
 // Majuscule en début de ligne ou de phrase après une commande.
 t=t.trim().replace(/(^|\n|[.!?]\s+)([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase());
 return t;
}
/* Phrases produites par les modèles sur un silence ou un bruit (sous-titres de vidéos d'entraînement). */
const PARASITES=[
 /sous-titr(?:age|es|é)[^.!?\n]*(?:[.!?]|$)/gi,
 /merci d['’]avoir regard[ée][^.!?\n]*[.!?]?/gi,
 /(?:abonnez-vous|n['’]oubliez pas de vous abonner)[^.!?\n]*[.!?]?/gi,
 /amara\.org[^.!?\n]*[.!?]?/gi,
 /\bst['’] ?\d{2,4}\b[.!?]?/gi,
 /\[(?:musique|music|silence|bruit|applaudissements|rires)\]/gi,
 /♪+/g
];
function nettoyer(texte){
 let t=String(texte||'');let douteux=false;
 for(const re of PARASITES){const avant=t;t=t.replace(re,' ');if(t!==avant)douteux=true}
 // Boucles : même groupe de mots répété au moins 4 fois de suite.
 const boucle=/(\b[^\s].{2,80}?)(?:[\s,.;]+\1\b){3,}/gi;
 if(boucle.test(t)){douteux=true;t=t.replace(boucle,'$1')}
 t=t.replace(/\s+/g,' ').replace(/ +([,.;:)])/g,'$1').trim();
 if(/^[.,;:!?\s]*$/.test(t))t='';
 return {texte:t,douteux};
}

/* ---------- Audio ---------- */
/* Rééchantillonnage vers `vers` Hz, voie unique : filtre passe-bas (sinus cardinal fenêtré) puis interpolation.
   Sert quand le navigateur ne fournit pas directement du 16 kHz (micro sous Firefox, certains fichiers). */
function reechantillonner(samples,de,vers=16000){
 if(de===vers)return Float32Array.from(samples);
 const ratio=de/vers,n=Math.floor(samples.length/ratio),out=new Float32Array(n);
 const fc=Math.min(1,1/ratio)*0.92,demi=ratio>1?Math.ceil(8*ratio):8,noyau=new Float32Array(2*demi+1);
 let somme=0;for(let k=-demi;k<=demi;k++){const x=k*fc,sinc=x===0?1:Math.sin(Math.PI*x)/(Math.PI*x),w=0.42+0.5*Math.cos(Math.PI*k/(demi+1))+0.08*Math.cos(2*Math.PI*k/(demi+1));noyau[k+demi]=sinc*w;somme+=sinc*w}
 for(let k=0;k<noyau.length;k++)noyau[k]/=somme;
 for(let i=0;i<n;i++){
  const c=Math.round(i*ratio);let s=0;
  for(let k=-demi;k<=demi;k++){const j=c+k;if(j>=0&&j<samples.length)s+=samples[j]*noyau[k+demi]}
  out[i]=s;
 }
 return out;
}
const TRAME=0.03;
function energies(samples,taux){
 const pas=Math.max(1,Math.round(taux*TRAME)),n=Math.ceil(samples.length/pas),e=new Float32Array(n);
 for(let i=0;i<n;i++){let s=0;const a=i*pas,b=Math.min(samples.length,a+pas);for(let j=a;j<b;j++)s+=samples[j]*samples[j];e[i]=Math.sqrt(s/Math.max(1,b-a))}
 return {e,pas};
}
function seuilVoix(e){
 const tri=Float32Array.from(e).sort();const bruit=tri[Math.floor(tri.length*.1)]||0,fort=tri[Math.floor(tri.length*.95)]||0;
 return Math.max(0.006,Math.min(bruit*2.5,fort*0.3));
}
/* Durée de voix (secondes) d'un extrait : sert à écarter les silences, source de phrases inventées. */
function dureeVoix(samples,taux=16000){
 const {e}=energies(samples,taux),seuil=seuilVoix(e);let n=0;for(const x of e)if(x>seuil)n++;
 return n*TRAME;
}
/* Coupe un enregistrement complet en extraits de `max` secondes au plus, aux endroits les plus calmes. */
function decouper(samples,taux=16000,{min=12,max=28}={}){
 const {e,pas}=energies(samples,taux),out=[];let debut=0;
 const lisse=i=>{let s=0,c=0;for(let k=i-5;k<=i+5;k++)if(k>=0&&k<e.length){s+=e[k];c++}return s/c};
 while(debut<samples.length){
  if(samples.length-debut<=max*taux){out.push([debut,samples.length]);break}
  const a=Math.floor((debut+min*taux)/pas),b=Math.floor((debut+max*taux)/pas);
  let best=b,val=Infinity;for(let i=a;i<=b;i++){const v=lisse(i);if(v<val){val=v;best=i}}
  const fin=Math.min(samples.length,best*pas);out.push([debut,fin]);debut=fin;
 }
 return out;
}
/* Dictée en direct : position de coupe dans le tampon (-1 si on attend encore).
   On coupe sur une pause d'au moins `pause` s après `min` s de parole, ou de force à `max` s au point le plus calme. */
function coupeDirect(samples,taux=16000,{min=10,max=25,pause=0.6}={}){
 if(samples.length<min*taux)return -1;
 const {e,pas}=energies(samples,taux),seuil=seuilVoix(e),besoin=Math.ceil(pause/TRAME);
 let calme=0,coupe=-1;
 for(let i=Math.floor(min*taux/pas);i<e.length;i++){
  if(e[i]<=seuil){calme++;if(calme>=besoin)coupe=(i-Math.floor(calme/2))*pas}else calme=0;
 }
 if(coupe>0)return coupe;
 if(samples.length>=max*taux)return decouper(samples,taux,{min,max})[0][1];
 return -1;
}

/* ---------- Documents ---------- */
const FORMATS={
 pdf:{libelle:'PDF',types:['application/pdf']},
 docx:{libelle:'Word',types:['application/vnd.openxmlformats-officedocument.wordprocessingml.document']},
 doc:{libelle:'Word 97-2003',types:['application/msword']},
 odt:{libelle:'OpenDocument',types:['application/vnd.oasis.opendocument.text']},
 rtf:{libelle:'RTF',types:['application/rtf','text/rtf']},
 txt:{libelle:'Texte',types:['text/plain']}
};
const AUDIO=['m4a','mp3','wav','webm','ogg','oga','opus','aac','mp4','3gp','amr','caf','flac'];
function extension(nom){const m=/\.([a-z0-9]+)$/i.exec(String(nom||''));return m?m[1].toLowerCase():''}
function natureFichier(nom,type=''){
 const ext=extension(nom);
 if(FORMATS[ext])return {nature:'document',format:ext};
 if(AUDIO.includes(ext)||/^audio\//.test(type))return {nature:'audio',format:ext||'audio'};
 return {nature:null,format:ext};
}
const LIMITE_DOCUMENT=15*1024*1024,LIMITE_AUDIO=200*1024*1024;
function controleFichier(f){
 const {nature}=natureFichier(f?.name,f?.type);
 if(!nature)return 'Format non reconnu. Documents : PDF, Word (.doc, .docx), OpenDocument, RTF ou texte. Audio : m4a, mp3, wav, webm, ogg…';
 if(!f.size)return 'Le fichier est vide.';
 if(nature==='document'&&f.size>LIMITE_DOCUMENT)return 'Document limité à 15 Mo.';
 if(nature==='audio'&&f.size>LIMITE_AUDIO)return 'Enregistrement limité à 200 Mo.';
 return '';
}

const ENTITES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const entites=s=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,c)=>c[0]==='#'?String.fromCodePoint(c[1].toLowerCase()==='x'?parseInt(c.slice(2),16):parseInt(c.slice(1),10)):(ENTITES[c]??m));
const propre=t=>t.replace(/ /g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();

/* Archive zip (docx, odt) : liste des fichiers ; `inflate(bytes)` décompresse (DecompressionStream ou zlib). */
function lireZip(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 let fin=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){fin=i;break}
 if(fin<0)throw Error('Archive illisible.');
 const total=v.getUint16(fin+10,true);let p=v.getUint32(fin+16,true);const fichiers={};
 for(let k=0;k<total;k++){
  if(v.getUint32(p,true)!==0x02014b50)throw Error('Archive illisible.');
  const methode=v.getUint16(p+10,true),taille=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  const nom=new TextDecoder().decode(b.subarray(p+46,p+46+nl));
  const debut=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
  fichiers[nom]={methode,donnees:b.subarray(debut,debut+taille)};
  p+=46+nl+el+cl;
 }
 return fichiers;
}
async function fichierZip(fichiers,nom,inflate){
 const f=fichiers[nom];if(!f)return null;
 const brut=f.methode===0?f.donnees:f.methode===8?await inflate(f.donnees):null;
 if(!brut)throw Error('Compression non prise en charge.');
 return new TextDecoder().decode(brut);
}
function texteDocx(xml){
 const corps=String(xml).replace(/<w:(?:instrText|delText)[^>]*>[\s\S]*?<\/w:(?:instrText|delText)>/g,'');
 const out=[];
 for(const p of corps.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)||[]){
  let l='';
  for(const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)){
   if(m[1]!==undefined)l+=entites(m[1]);else if(m[0].startsWith('<w:tab'))l+='\t';else l+='\n';
  }
  out.push(l);
 }
 return propre(out.join('\n'));
}
function texteOdt(xml){
 const corps=String(xml).replace(/^[\s\S]*?<office:text[^>]*>/,'').replace(/<\/office:text>[\s\S]*$/,'');
 const out=[];
 for(const p of corps.match(/<text:(p|h)[ >][\s\S]*?<\/text:\1>|<text:(?:p|h)[^>]*\/>/g)||[]){
  const l=p.replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g,(m,n)=>' '.repeat(+n||1)).replace(/<text:tab\s*\/>/g,'\t').replace(/<text:line-break\s*\/>/g,'\n').replace(/<[^>]+>/g,'');
  out.push(entites(l));
 }
 return propre(out.join('\n'));
}
async function texteZip(bytes,format,inflate){
 const z=lireZip(bytes);
 if(format==='docx'){const x=await fichierZip(z,'word/document.xml',inflate);if(x==null)throw Error('Document Word illisible.');return texteDocx(x)}
 const x=await fichierZip(z,'content.xml',inflate);if(x==null)throw Error('Document OpenDocument illisible.');return texteOdt(x);
}

const cp1252=b=>new TextDecoder('windows-1252').decode(b);
function texteRtf(source){
 const s=typeof source==='string'?source:cp1252(source);
 let out='',i=0,ignore=[],profondeur=0,sauter=0,uc=1;
 const IGNORES=/^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|listtable|listoverridetable|rsidtbl|themedata|colorschememapping|datastore|latentstyles|generator|xmlnstbl|mmathPr|pgdsctbl|fldinst|bkmkstart|bkmkend)$/;
 const ignorer=()=>ignore.length&&ignore[ignore.length-1]>=0&&profondeur>=ignore[ignore.length-1];
 while(i<s.length){
  const c=s[i];
  if(c==='{'){profondeur++;i++;continue}
  if(c==='}'){if(ignore.length&&profondeur===ignore[ignore.length-1])ignore.pop();profondeur--;i++;continue}
  if(c==='\\'){
   const n=s[i+1];
   if(n==='\''){if(sauter>0)sauter--;else if(!ignorer())out+=cp1252(new Uint8Array([parseInt(s.substr(i+2,2),16)]));i+=4;continue}
   if(n==='*'){ignore.push(profondeur);i+=2;continue}
   if(n==='\\'||n==='{'||n==='}'){if(!ignorer())out+=n;i+=2;continue}
   if(n==='~'){if(!ignorer())out+=' ';i+=2;continue}
   if(n==='\n'||n==='\r'){if(!ignorer())out+='\n';i+=2;continue}
   const m=/^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i,i+40));
   if(!m){i+=2;continue}
   const mot=m[1],val=m[2]!==undefined?+m[2]:null;i+=m[0].length;
   if(IGNORES.test(mot)){ignore.push(profondeur);continue}
   if(ignorer())continue;
   if(mot==='uc'){uc=val??1;continue}
   if(mot==='u'){out+=String.fromCharCode(val<0?val+65536:val);sauter=uc;continue}
   if(mot==='par'||mot==='line'||mot==='row'||mot==='sect'||mot==='page')out+='\n';
   else if(mot==='tab'||mot==='cell')out+='\t';
   else if(mot==='emdash')out+='—';else if(mot==='endash')out+='–';
   else if(mot==='lquote'||mot==='rquote')out+='’';else if(mot==='ldblquote')out+='«';else if(mot==='rdblquote')out+='»';
   continue;
  }
  if(c==='\r'||c==='\n'){i++;continue}
  if(sauter>0){sauter--;i++;continue}
  if(!ignorer())out+=c;i++;
 }
 return propre(out);
}

/* Word 97-2003 (.doc) : fichier composite (CFB) → flux WordDocument + table → pièces de texte (MS-DOC). */
function lireCfb(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(v.getUint32(0,true)!==0xE011CFD0||v.getUint32(4,true)!==0xE11AB1A1)throw Error('Ce fichier .doc n’est pas un document Word 97-2003.');
 const taille=1<<v.getUint16(30,true),mini=1<<v.getUint16(32,true),nFat=v.getUint32(44,true),dir0=v.getUint32(48,true),coupure=v.getUint32(56,true),mini0=v.getUint32(60,true),nMini=v.getUint32(64,true);
 let difat=v.getUint32(68,true),nDifat=v.getUint32(72,true);
 const secteur=n=>512+n*taille;
 const listeFat=[];for(let i=0;i<109&&listeFat.length<nFat;i++)listeFat.push(v.getUint32(76+i*4,true));
 while(nDifat-->0&&difat<0xFFFFFFFA&&listeFat.length<nFat){const o=secteur(difat);for(let i=0;i<taille/4-1&&listeFat.length<nFat;i++)listeFat.push(v.getUint32(o+i*4,true));difat=v.getUint32(o+taille-4,true)}
 const fat=[];for(const s of listeFat){const o=secteur(s);for(let i=0;i<taille/4;i++)fat.push(v.getUint32(o+i*4,true))}
 const chaine=(debut,table,lim=1e6)=>{const out=[];let s=debut;while(s<0xFFFFFFFA&&out.length<lim){out.push(s);s=table[s]}return out};
 const lire=(debut,n)=>{const out=new Uint8Array(chaine(debut,fat).length*taille);let k=0;for(const s of chaine(debut,fat)){out.set(b.subarray(secteur(s),secteur(s)+taille),k);k+=taille}return out.subarray(0,n??out.length)};
 const dir=lire(dir0),dv=new DataView(dir.buffer,dir.byteOffset,dir.byteLength),entrees=[];
 for(let o=0;o+128<=dir.length;o+=128){const nl=dv.getUint16(o+64,true);if(!nl)continue;entrees.push({nom:new TextDecoder('utf-16le').decode(dir.subarray(o,o+Math.max(0,nl-2))),type:dir[o+66],debut:dv.getUint32(o+116,true),taille:dv.getUint32(o+120,true)})}
 const racine=entrees.find(e=>e.type===5);
 let miniFat=[],miniFlux=null;
 if(nMini&&mini0<0xFFFFFFFA){const m=lire(mini0),mv=new DataView(m.buffer,m.byteOffset,m.byteLength);for(let i=0;i<m.length/4;i++)miniFat.push(mv.getUint32(i*4,true));miniFlux=lire(racine.debut,racine.taille)}
 return nom=>{
  const e=entrees.find(x=>x.nom===nom&&x.type===2);if(!e)return null;
  if(e.taille<coupure&&miniFlux){const out=new Uint8Array(e.taille);let k=0;for(const s of chaine(e.debut,miniFat)){out.set(miniFlux.subarray(s*mini,s*mini+mini).subarray(0,Math.min(mini,e.taille-k)),k);k+=mini;if(k>=e.taille)break}return out}
  return lire(e.debut,e.taille);
 };
}
function texteDoc(bytes){
 const flux=lireCfb(bytes),wd=flux('WordDocument');if(!wd)throw Error('Document Word illisible.');
 const v=new DataView(wd.buffer,wd.byteOffset,wd.byteLength);
 if(v.getUint16(0,true)!==0xA5EC)throw Error('Document Word illisible.');
 if(v.getUint16(0x0A,true)&0x0100)throw Error('Document Word protégé par mot de passe : ouvrez-le et enregistrez-le sans mot de passe.');
 const table=flux(v.getUint16(0x0A,true)&0x0200?'1Table':'0Table');if(!table)throw Error('Document Word illisible.');
 let o=32;const csw=v.getUint16(o,true);o+=2+csw*2;const cslw=v.getUint16(o,true);const lw=o+2;o+=2+cslw*4;o+=2;
 const ccpText=v.getUint32(lw+12,true),fcClx=v.getUint32(o+33*8,true),lcbClx=v.getUint32(o+33*8+4,true);
 const t=new DataView(table.buffer,table.byteOffset,table.byteLength);let p=fcClx;const fin=fcClx+lcbClx;
 while(p<fin&&table[p]===1)p+=3+t.getInt16(p+1,true);
 if(table[p]!==2)throw Error('Document Word illisible.');
 const lcb=t.getUint32(p+1,true),plc=p+5,n=(lcb-4)/12;let texte='';
 for(let i=0;i<n&&texte.length<ccpText;i++){
  const cp0=t.getUint32(plc+i*4,true),cp1=t.getUint32(plc+(i+1)*4,true),pcd=plc+(n+1)*4+i*8,fc=t.getUint32(pcd+2,true);
  const compresse=!!(fc&0x40000000),pos=compresse?(fc&0x3FFFFFFF)/2:fc,lon=cp1-cp0;
  texte+=compresse?cp1252(wd.subarray(pos,pos+lon)):new TextDecoder('utf-16le').decode(wd.subarray(pos,pos+lon*2));
 }
 texte=texte.slice(0,ccpText);
 // Champs : on garde le résultat affiché, pas le code du champ.
 let out='',pile=[];
 for(const ch of texte){
  const c=ch.charCodeAt(0);
  if(c===0x13){pile.push(true);continue}if(c===0x14){if(pile.length)pile[pile.length-1]=false;continue}if(c===0x15){pile.pop();continue}
  if(pile.some(Boolean))continue;
  if(c===13||c===11||c===12)out+='\n';else if(c===7)out+='\t';else if(c===9||c>=32)out+=ch;
 }
 return propre(out.replace(/\t\n/g,'\n'));
}

/* Texte d'un PDF à partir des éléments de pdf.js ({str, hasEOL}) ; une liste par page. */
function textePdf(pages){
 return propre(pages.map(items=>items.map(i=>(i.str||'')+(i.hasEOL?'\n':'')).join('')).join('\n\n'));
}
/* Un PDF sans texte (scan) doit passer par la lecture optique. */
const pdfScanne=(texte,pages)=>String(texte||'').replace(/\s/g,'').length<40*Math.max(1,pages);

/* Extraction d'un document : `outils` = {inflate} (zip). Le PDF est traité côté navigateur (pdf.js). */
async function texteDocument(bytes,format,outils={}){
 if(format==='txt'){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let t=new TextDecoder('utf-8',{fatal:false}).decode(b);if(t.includes('�'))t=cp1252(b);return propre(t.replace(/^﻿/,''))}
 if(format==='rtf')return texteRtf(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));
 if(format==='doc'){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(b[0]===0x50&&b[1]===0x4b)return texteZip(b,'docx',outils.inflate); // .docx renommé en .doc
  if(b[0]===0x7b&&b[1]===0x5c)return texteRtf(b); // RTF enregistré en .doc
  return texteDoc(b);
 }
 if(format==='docx'||format==='odt')return texteZip(bytes,format,outils.inflate);
 throw Error('Format non pris en charge ici.');
}

return {RUBRIQUES,AUTRE,IDS,titre,entete,structurer,fusionner,composer,rempli,manques,commandesVocales,nettoyer,
 reechantillonner,dureeVoix,decouper,coupeDirect,natureFichier,controleFichier,extension,FORMATS,AUDIO,LIMITE_DOCUMENT,LIMITE_AUDIO,
 lireZip,texteDocx,texteOdt,texteRtf,texteDoc,textePdf,pdfScanne,texteDocument,norme};
});

(function(root){
'use strict';
const clean=s=>String(s||'').normalize('NFC').replace(/[\u200b-\u200f]/g,'').trim();
const normalized=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function phone(value){let v=clean(value).replace(/[^\d+]/g,'');if(v.startsWith('0033'))v='+'+v.slice(2);if(v.startsWith('+330'))v='+33'+v.slice(4);if(/^0\d{9}$/.test(v))v='+33'+v.slice(1);return /^\+\d{8,15}$/.test(v)?v:''}
const MONTHS=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
function birthDate(value){const text=clean(value);let m=text.match(/\b(\d{1,2})\s?[/.\-]\s?(\d{1,2})\s?[/.\-]\s?(\d{4})\b/);if(!m){const w=fold(text).match(/\b(\d{1,2})(?:er)?\s+([a-z]{3,9})\.?\s+(\d{4})\b/);const month=w?MONTHS.findIndex(x=>x.startsWith(w[2])&&w[2].length>=3):-1;if(month>=0)m=[w[0],w[1],String(month+1),w[3]]}if(!m)return '';const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'),d=new Date(iso+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso&&Number(m[3])>=1900&&iso<=new Date().toISOString().slice(0,10)?iso:''}
// Repli sans accents qui conserve la longueur, pour retrouver les positions dans la ligne d'origine.
function fold(s){return [...String(s||'')].map(c=>{const b=c.normalize('NFD')[0];const l=b.toLowerCase();return l.length===b.length?l:b}).join('').replace(/[’`´]/g,"'")}
// Libellés des fiches Doctolib (praticien et patient). Les « autres » servent seulement à découper les colonnes.
const LABEL=new RegExp('(?<![a-z0-9])(?:'+[
 '(?<usedFirst>pr[e6]?nom\\s*(?:usuel|utilise|d\\W?\\s?usage))',
 '(?<first>(?:1er|premier)\\s+pr[e6]?nom(?:\\s+de\\s+naissance)?)',
 '(?<firstList>pr[e6]?nom(?:\\s*\\(\\s*s\\s*\\)|s)?(?:\\s+(?:de\\s+naissance|a\\s+l.etat\\s+civil))|pr[e6]?nom(?:\\s*\\(\\s*s\\s*\\)|s))',
 '(?<plainFirst>pr[e6]?nom)',
 '(?<birth>nom\\s+(?:de\\s+naissance|de\\s+famille|de\\s+jeune\\s+fille|patronymique))',
 '(?<used>nom\\s*(?:d\\W?\\s?usage|utilise|marital|d\\W?\\s?epouse))',
 '(?<date>date\\s+de\\s+na[il1|!]?s{1,2}ance|ne\\s*\\(?\\s*e\\s*\\)?\\s+le|nee?\\s+le)',
 '(?<other>lieu\\s+de\\s+naissance|civilite|sexe|genre|t[eé]l[eé]phone(?:\\s+(?:portable|mobile|fixe))?|portable|mobile|e\\W?mail|courriel|adresse(?:\\s+(?:e\\W?mail|electronique|postale))?|code\\s+postal|ville|pays|medecin\\s+traitant|n(?:umero|°)?\\s+de\\s+securite\\s+sociale|nir|ins|profession|notes?|identifiant)',
 '(?<name>nom)'].join('|')+')(?![a-z])','g');
function labelsOf(line){const f=fold(line),out=[];for(const m of f.matchAll(LABEL)){const before=f.slice(0,m.index);
 // Un libellé ouvre la ligne ou une colonne (deux espaces, barre, puce) ; sinon c'est une valeur.
 if(before.trim()&&!/(?:\s{2,}|[|•·*]\s*)$/.test(before))continue;const kind=Object.keys(m.groups).find(k=>m.groups[k]!==undefined);out.push({kind,start:m.index,end:m.index+m[0].length})}return out}
const stripValue=v=>clean(v).replace(/^[\s*:;|>»\-–—.]+/,'').replace(/[\s*|]+$/,'').trim();
function chunks(line){const out=[];const re=/\S+(?:\s\S+)*/g;let m;while((m=re.exec(line)))out.push({text:m[0],start:m.index});return out}
// Nom propre : lettres, espaces, traits d'union et apostrophes ; arrêt au premier chiffre ou séparateur.
function cleanName(v){let s=clean(v).replace(/[’`´]/g,"'").split(/[\d(\[{|•·:;,/]|\s[-–—]\s/)[0];s=s.replace(/[^\p{L}\p{M}' \-]/gu,' ').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').replace(/^[\s'\-]+|[\s'\-]+$/g,'');return s.split(' ').slice(0,6).join(' ').slice(0,100)}
const isCaps=t=>/\p{Lu}{2,}|^\p{Lu}'?$/u.test(t)&&t===t.toLocaleUpperCase('fr-FR');
const upperName=s=>s.toLocaleUpperCase('fr-FR');
// « Mme Camille MARTIN », « M. DUPONT Jean-Pierre », « Camille MARTIN » : prénom en casse mixte, nom en capitales.
function splitHeader(text){let tokens=cleanName(text).split(' ').filter(Boolean);if(tokens.length>2&&tokens[0].length<=3&&tokens[0].toLowerCase()===tokens.slice(1,1+tokens[0].length).map(t=>t[0]).join('').toLowerCase())tokens=tokens.slice(1);if(tokens.length<2)return null;
 const caps=tokens.map(isCaps);if(caps.some(Boolean)&&!caps.every(Boolean)){const first=caps.indexOf(false),last=caps.lastIndexOf(false);const firstTokens=tokens.slice(first,last+1),lastTokens=tokens.filter((t,i)=>caps[i]&&(i<first||i>last));if(firstTokens.every(t=>!isCaps(t))&&lastTokens.length)return {firstName:firstTokens.join(' '),lastName:lastTokens.join(' ')}}
 return {firstName:tokens[0],lastName:tokens.slice(1).join(' ')}}
function parseProfile(text){
 const lines=String(text||'').split(/\r?\n/).map(s=>String(s||'').normalize('NFC').replace(/[\u200b-\u200f]/g,'').replace(/\s+$/,'')).filter(s=>s.trim());
 const found={},usedLines=new Set();const put=(kind,value)=>{value=stripValue(value);if(value&&!found[kind])found[kind]=value};
 for(let i=0;i<lines.length;i++){const labels=labelsOf(lines[i]);if(!labels.length)continue;const pending=[];
  labels.forEach((l,k)=>{const value=stripValue(lines[i].slice(l.end,labels[k+1]?.start??lines[i].length));if(value)put(l.kind,value);else pending.push(l)});
  if(!pending.length)continue;
  // Valeurs sous les libellés (formulaires en colonnes) : ligne suivante non libellée, colonne la plus proche.
  const j=i+1;if(j>=lines.length||labelsOf(lines[j]).length)continue;const parts=chunks(lines[j]).filter(c=>stripValue(c.text));if(!parts.length)continue;usedLines.add(j);
  if(labels.length===1){put(labels[0].kind,lines[j]);continue}
  if(parts.length===labels.length){labels.forEach((l,k)=>pending.includes(l)&&put(l.kind,parts[k].text));continue}
  for(const l of pending){const near=parts.reduce((a,c)=>Math.abs(c.start-l.start)<Math.abs(a.start-l.start)?c:a);put(l.kind,near.text)}
 }
 // Premier prénom de naissance (INS) : premier élément d'une liste de prénoms.
 let firstName=cleanName(found.first||'')||cleanName((found.firstList||'').split(/[;,]|\s+/)[0])||cleanName(found.plainFirst||'')||cleanName(found.usedFirst||'');
 let lastName=cleanName(found.birth||''),usedName=cleanName(found.used||'');const plainName=cleanName(found.name||'');
 if(!lastName)lastName=plainName;else if(!usedName&&plainName&&fold(plainName)!==fold(lastName))usedName=plainName;
 let dob=birthDate(found.date||'');
 // En-tête de fiche : civilité, « née DUPONT », âge.
 let header=null,bornName='';
 for(let i=0;i<lines.length&&!header;i++){if(usedLines.has(i)||labelsOf(lines[i]).length)continue;const f=fold(lines[i]),m=f.match(/(?:^|[^a-z])(m\.|mme\.?|mlle\.?|monsieur|madame|mademoiselle)\s+/);if(!m||/^\s*(?:dr|docteur|pr|professeur)\b/.test(f.slice(m.index+m[0].length)))continue;header=splitHeader(lines[i].slice(m.index+m[0].length).split(/\s+[Nn][ée]e?\s|\s\(|\s\d/)[0]);if(header)header.line=i}
 const bornLine=lines.findIndex(l=>/(?:^|[\s·•|])[Nn][ée6]e?(?:\s*\(\s*e\s*\))?\s+(?:le\s+)?(?:\p{Lu}|\d)/u.test(l)||/\(\s*\d{1,3}\s*ans\s*\)/.test(l));
 if(bornLine>=0){const m=lines[bornLine].match(/(?:^|[\s·•|])[Nn][ée6]e?\s+(?!le\b)(\p{Lu}[\p{Lu}'’\-]*(?:\s+\p{Lu}[\p{Lu}'’\-]*)*)(?![\p{Ll}])/u);if(m)bornName=cleanName(m[1]);if(!dob)dob=birthDate(lines[bornLine]);
  if(!header){for(const k of [bornLine,bornLine-1]){if(k<0||labelsOf(lines[k]).length)continue;const candidate=k===bornLine?lines[k].split(/(?:^|\s)[Nn][ée6]e?[\s(]|\(|\d/)[0]:lines[k];const h=cleanName(candidate).split(' ').length<=6&&splitHeader(candidate);if(h&&h.firstName&&isCaps(h.lastName.split(' ')[0])&&!isCaps(h.firstName)){header=h;break}}}}
 if(header){firstName||=header.firstName;const shown=cleanName(header.lastName);
  // Doctolib affiche le nom d'usage en tête et le nom de naissance après « née ».
  if(bornName){lastName||=bornName;if(!usedName&&fold(shown)!==fold(bornName))usedName=shown}else lastName||=shown}
 else if(bornName)lastName||=bornName;
 const emailCandidates=[...new Set((String(text||'').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi)||[]).map(clean))];
 const phoneMatches=String(text||'').match(/(?:\+33\s*(?:\(0\))?|0033\s*|0)[1-9](?:[ .\-]?\d{2}){4}/g)||[];
 const phoneCandidates=[...new Set(phoneMatches.map(phone).filter(Boolean))];
 lastName=upperName(lastName);usedName=upperName(usedName);if(usedName===lastName)usedName='';
 return {firstName:clean(firstName).slice(0,100),lastName:clean(lastName).slice(0,100),usedName:clean(usedName).slice(0,100),birthDate:dob,email:emailCandidates[0]||'',phone:phoneCandidates[0]||'',emailCandidates,phoneCandidates};
}
// Lecture locale : les espaces multiples conservent les colonnes des formulaires.
const OCR_PARAMS={tessedit_pageseg_mode:'3',preserve_interword_spaces:'1'};
// Captures d'écran : petits caractères agrandis (Tesseract lit mal sous ~20 px), niveaux de gris contrastés.
function prepareCanvas(bitmap,doc){const longest=Math.max(bitmap.width,bitmap.height);const scale=longest<1600?Math.min(2.5,2400/longest):Math.min(1,2400/longest);const canvas=doc.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const g=canvas.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(bitmap,0,0,canvas.width,canvas.height);
 const img=g.getImageData(0,0,canvas.width,canvas.height),d=img.data;let sum=0;for(let i=0;i<d.length;i+=4){const y=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];d[i]=d[i+1]=d[i+2]=y;sum+=y}
 // Fond sombre (mode nuit, bandeau coloré dominant) : inversion pour retrouver du texte foncé sur fond clair.
 if(sum/(d.length/4)<110)for(let i=0;i<d.length;i+=4)d[i]=d[i+1]=d[i+2]=255-d[i];g.putImageData(img,0,0);return canvas}
function contactError(v){if(!v||typeof v!=='object'||Object.values(v).some(x=>typeof x!=='string'||x.length>180))return 'Coordonnées invalides.';if(!clean(v.firstName)||!clean(v.lastName)||!/^\d{4}-\d\d-\d\d$/.test(v.birthDate)||!birthDate(v.birthDate.slice(8)+'/'+v.birthDate.slice(5,7)+'/'+v.birthDate.slice(0,4)))return 'Vérifiez le nom, le prénom et la date de naissance.';if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))return 'Adresse e-mail invalide.';if(v.phone&&!phone(v.phone))return 'Numéro de téléphone invalide.';if(!v.email&&!phone(v.phone))return 'Un e-mail ou un téléphone est nécessaire.';return ''}
function contact(v){return {firstName:clean(v.firstName),lastName:clean(v.lastName),birthDate:clean(v.birthDate),email:clean(v.email),phone:phone(v.phone)}}
function matchesIdentity(a,b){return normalized(a.firstName)===normalized(b.firstName)&&normalized(a.lastName)===normalized(b.lastName)&&a.birthDate===b.birthDate}
root.InvitationCore={parseProfile,prepareCanvas,OCR_PARAMS,phone,birthDate,contactError,contact,matchesIdentity,normalized};if(typeof module!=='undefined')module.exports=root.InvitationCore;
})(typeof window!=='undefined'?window:globalThis);

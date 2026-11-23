(function(root){
'use strict';
const clean=s=>String(s||'').normalize('NFC').replace(/[\u200b-\u200f]/g,'').trim();
const normalized=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function phone(value){let v=clean(value).replace(/[^\d+]/g,'');if(v.startsWith('0033'))v='+'+v.slice(2);if(v.startsWith('+330'))v='+33'+v.slice(4);if(/^0\d{9}$/.test(v))v='+33'+v.slice(1);return /^\+\d{8,15}$/.test(v)?v:''}
const MONTHS=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
function birthDate(value){const text=clean(value);let m=text.match(/\b(\d{1,2})\s?[/.\-]\s?(\d{1,2})\s?[/.\-]\s?(\d{4})\b/);if(!m){const w=fold(text).match(/\b(\d{1,2})(?:er)?\s+([a-z]{3,9})\.?\s+(\d{4})\b/);const month=w?MONTHS.findIndex(x=>x.startsWith(w[2])&&w[2].length>=3):-1;if(month>=0)m=[w[0],w[1],String(month+1),w[3]]}if(!m)return '';const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'),d=new Date(iso+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso&&Number(m[3])>=new Date().getFullYear()-120&&iso<=new Date().toISOString().slice(0,10)?iso:''}
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
// Libellé abîmé par l'OCR (« Nom de naissar », « Prénom(s) de nalssance ») : la fin du libellé n'est pas une valeur.
function garbled(kind,value){const f=fold(value);let m;
 if(kind==='name'&&(m=f.match(/^(?:de\s*)?n[a-z1|!]{3,}(?:\s*[*:]|\s|$)\s*/))&&/^(?:de\s*)?na/.test(f))return {kind:'birth',value:stripValue(value.slice(m[0].length))};
 if(kind==='name'&&(m=f.match(/^d\W?\s?u[a-z]{2,}(?:\s*[*:]|\s|$)\s*/)))return {kind:'used',value:stripValue(value.slice(m[0].length))};
 if(['plainFirst','firstList','first'].includes(kind)&&(m=f.match(/^(?:\(?\s*s\s*\)?\s*)?(?:de\s+)?n[a-z1|!]{4,}(?:\s*[*:]|\s|$)\s*/)))return {kind:kind==='plainFirst'?'firstList':kind,value:stripValue(value.slice(m[0].length))};
 return {kind,value}}
function parseProfile(text){
 const lines=String(text||'').split(/\r?\n/).map(s=>String(s||'').normalize('NFC').replace(/[\u200b-\u200f]/g,'').replace(/\s+$/,'')).filter(s=>s.trim());
 const found={},usedLines=new Set();const put=(kind,value)=>{value=stripValue(value);if(value&&!found[kind])found[kind]=value};
 for(let i=0;i<lines.length;i++){const labels=labelsOf(lines[i]);if(!labels.length)continue;const pending=[];
  labels.forEach((l,k)=>{const g=garbled(l.kind,stripValue(lines[i].slice(l.end,labels[k+1]?.start??lines[i].length)));l.kind=g.kind;if(g.value)put(g.kind,g.value);else pending.push(l)});
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
 let lastNameSource=lastName?'naissance':plainName?'libelle':'';
 if(!lastName)lastName=plainName;else if(!usedName&&plainName&&fold(plainName)!==fold(lastName))usedName=plainName;
 let dob=birthDate(found.date||'');
 // En-tête de fiche : civilité, « née DUPONT », âge.
 let header=null,bornName='';
 for(let i=0;i<lines.length&&!header;i++){if(usedLines.has(i)||labelsOf(lines[i]).length)continue;const f=fold(lines[i]),m=f.match(/(?:^|[^a-z])(m\.|mme\.?|mlle\.?|monsieur|madame|mademoiselle)\s+/);if(!m||/^\s*(?:dr|docteur|pr|professeur)\b/.test(f.slice(m.index+m[0].length)))continue;header=splitHeader(lines[i].slice(m.index+m[0].length).split(/\s+[Nn][ée]e?\s|\s\(|\s\d/)[0]);if(header)header.line=i}
 const bornLine=lines.findIndex(l=>/(?:^|[\s·•|])[Nn][ée6]e?(?:\s*\(\s*e\s*\))?\s+(?:le\s+)?(?:\p{Lu}|\d)/u.test(l)||/\(\s*\d{1,3}\s*ans\s*\)/.test(l));
 if(bornLine>=0){const m=lines[bornLine].match(/(?:^|[\s·•|])[Nn][ée6]e?\s+(?!le\b)(\p{Lu}[\p{Lu}'’\-]*(?:\s+\p{Lu}[\p{Lu}'’\-]*)*)(?![\p{Ll}])/u);if(m)bornName=cleanName(m[1]);if(!dob)dob=birthDate(lines[bornLine]);
  if(!header){for(const k of [bornLine,bornLine-1]){if(k<0||labelsOf(lines[k]).length)continue;const candidate=k===bornLine?lines[k].split(/(?:^|\s)[Nn][ée6]e?[\s(]|\(|\d/)[0]:lines[k];const h=cleanName(candidate).split(' ').length<=6&&splitHeader(candidate);if(h&&h.firstName&&isCaps(h.lastName.split(' ')[0])&&!isCaps(h.firstName)){header=h;break}}}}
 // Libellé illisible (reflet, gris clair) : une seule date de naissance plausible hors rendez-vous.
 if(!dob){const dates=new Set(lines.filter(l=>!/rdv|rendez|consult|prochain|\d{1,2}\s?[:h]\s?\d{2}\b|\b(?:lun|mar|mer|jeu|ven|sam|dim)\.?\s+\d/i.test(fold(l))).map(birthDate).filter(Boolean));if(dates.size===1)dob=[...dates][0]}
 // Ni civilité ni « né(e) » lisibles : première ligne de la forme « Prénom NOM » (hors libellés et médecins).
 if(!header&&!(firstName&&lastName))for(let i=0;i<Math.min(lines.length,12)&&!header;i++){if(usedLines.has(i)||labelsOf(lines[i]).length||/(?:^|\s)(?:dr|docteur|pr|professeur)\.?\s/i.test(fold(lines[i])))continue;const cand=cleanName(lines[i]),tokens=cand.split(' ');if(cand!==clean(lines[i]).replace(/[’`´]/g,"'").replace(/\s+/g,' ').replace(/\s*-\s*/g,'-')||tokens.length<2||tokens.length>5)continue;const h=splitHeader(cand);if(h&&!isCaps(h.firstName)&&/^\p{Lu}/u.test(h.firstName)&&h.lastName.split(' ').every(isCaps))header=h}
 if(header){firstName||=header.firstName;const shown=cleanName(header.lastName);
  // Doctolib affiche le nom d'usage en tête et le nom de naissance après « née ».
  if(bornName){if(!lastName){lastName=bornName;lastNameSource='naissance'}if(!usedName&&fold(shown)!==fold(bornName))usedName=shown}else if(!lastName){lastName=shown;lastNameSource='entete'}}
 else if(bornName&&!lastName){lastName=bornName;lastNameSource='naissance'}
 const emailCandidates=[...new Set((String(text||'').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi)||[]).map(clean))];
 const phoneMatches=String(text||'').match(/(?:\+33\s*(?:\(0\))?|0033\s*|0)[1-9](?:[ .\-]?\d{2}){4}/g)||[];
 const phoneCandidates=[...new Set(phoneMatches.map(phone).filter(Boolean))];
 // Mots de libellé pris pour des valeurs (« NAISSANCE », « PRÉNOM ») : retirés.
 const LABEL_WORDS=/^(?:nom|noms|prenom|prenoms|naissance|usage|d'usage|utilise|civilite|madame|monsieur|date|sexe|telephone|email|e-mail|adresse|patient|modifier)$/;const dropLabels=v=>v.split(' ').filter(t=>!LABEL_WORDS.test(fold(t))).join(' ');lastName=dropLabels(lastName);firstName=dropLabels(firstName);usedName=dropLabels(usedName);
 if(fold(lastName).replace(/[^a-z]/g,'').length<2)lastName='';if(fold(firstName).replace(/[^a-z]/g,'').length<2)firstName='';lastName=upperName(lastName);usedName=upperName(usedName);if(usedName===lastName)usedName='';
 return {firstName:clean(firstName).slice(0,100),lastName:clean(lastName).slice(0,100),usedName:clean(usedName).slice(0,100),lastNameSource:lastName?lastNameSource:'',birthDate:dob,email:emailCandidates[0]||'',phone:phoneCandidates[0]||'',emailCandidates,phoneCandidates};
}
// Lecture locale : les espaces multiples conservent les colonnes des formulaires.
const OCR_PARAMS={tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',thresholding_method:'2'};
// Captures d'écran : petits caractères agrandis (Tesseract lit mal sous ~20 px), niveaux de gris contrastés.
function otsu(values){const h=new Array(256).fill(0);for(const v of values)h[v|0]++;let sum=0;for(let i=0;i<256;i++)sum+=i*h[i];let sB=0,wB=0,best=0,t=128;for(let i=0;i<256;i++){wB+=h[i];if(!wB)continue;const wF=values.length-wB;if(!wF)break;sB+=i*h[i];const mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)**2;if(v>best){best=v;t=i}}return t}
// Repère l'écran photographié (zone claire ou sombre homogène entourée d'un cadre) pour recadrer avant agrandissement.
function screenBox(bitmap,doc){const k=Math.min(1,600/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*k)),h=Math.max(1,Math.round(bitmap.height*k)),c=doc.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(bitmap,0,0,w,h);const d=g.getImageData(0,0,w,h).data,y=new Uint8Array(w*h);for(let i=0,j=0;i<d.length;i+=4,j++)y[j]=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
 const t=otsu(y),rows=new Array(h).fill(0),cols=new Array(w).fill(0);for(let r=0;r<h;r++)for(let q=0;q<w;q++)if(y[r*w+q]>t){rows[r]++;cols[q]++}
 const span=(a,n)=>{let lo=a.findIndex(v=>v>n*0.3),hi=a.length-1-[...a].reverse().findIndex(v=>v>n*0.3);return lo<0?null:[lo,hi]},R=span(rows,w),Q=span(cols,h);if(!R||!Q)return null;
 const bw=Q[1]-Q[0]+1,bh=R[1]-R[0]+1;if(bw*bh<0.2*w*h||bw*bh>0.95*w*h)return null;const m=0.02;return {x:Math.max(0,(Q[0]/k)-m*bitmap.width),y:Math.max(0,(R[0]/k)-m*bitmap.height),w:Math.min(bitmap.width,(bw/k)+2*m*bitmap.width),h:Math.min(bitmap.height,(bh/k)+2*m*bitmap.height)}}
function prepareCanvas(bitmap,doc){const box=screenBox(bitmap,doc)||{x:0,y:0,w:bitmap.width,h:bitmap.height};box.w=Math.min(box.w,bitmap.width-box.x);box.h=Math.min(box.h,bitmap.height-box.y);const longest=Math.max(box.w,box.h);const scale=longest<1600?Math.min(2.5,2400/longest):Math.min(1,2400/longest);const canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.round(box.w*scale));canvas.height=Math.max(1,Math.round(box.h*scale));const g=canvas.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(bitmap,box.x,box.y,box.w,box.h,0,0,canvas.width,canvas.height);
 const img=g.getImageData(0,0,canvas.width,canvas.height),d=img.data,n=d.length/4,hist=new Uint32Array(256);for(let i=0;i<d.length;i+=4){const y=Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);d[i]=d[i+1]=d[i+2]=y;hist[y]++}
 const pct=p=>{let a=0;for(let i=0;i<256;i++){a+=hist[i];if(a>=p*n)return i}return 255};const median=pct(0.5),lo=pct(0.01),hi=pct(0.99),invert=median<110,range=Math.max(30,hi-lo);
 // Fond sombre (mode nuit) : inversion ; puis étirement du contraste pour les libellés gris clair.
 for(let i=0;i<d.length;i+=4){let v=(d[i]-lo)*255/range;v=Math.max(0,Math.min(255,v));if(invert)v=255-v;d[i]=d[i+1]=d[i+2]=v}g.putImageData(img,0,0);return canvas}
// --- Photos réelles (téléphone, reflets, inclinaison) : redressement, contraste local, plusieurs lectures ---
function grayData(canvas){const g=canvas.getContext('2d',{willReadFrequently:true}),img=g.getImageData(0,0,canvas.width,canvas.height),d=img.data,out=new Float32Array(canvas.width*canvas.height);for(let i=0,j=0;i<d.length;i+=4,j++)out[j]=d[i];return out}
// Seuil local de Sauvola sur image intégrale : résiste aux reflets et à l'éclairage inégal.
function binarize(canvas,doc,k=0.18){const w=canvas.width,h=canvas.height,src=grayData(canvas),W=w+1,I=new Float64Array(W*(h+1)),I2=new Float64Array(W*(h+1));
 for(let y=1;y<=h;y++){let r=0,r2=0;for(let x=1;x<=w;x++){const v=src[(y-1)*w+x-1];r+=v;r2+=v*v;I[y*W+x]=I[(y-1)*W+x]+r;I2[y*W+x]=I2[(y-1)*W+x]+r2}}
 const half=Math.max(8,Math.round(Math.min(w,h)/40)),sm=Math.max(1,Math.round(Math.max(w,h)/1600)),out=doc.createElement('canvas');out.width=w;out.height=h;const g=out.getContext('2d'),img=g.createImageData(w,h),d=img.data;
 for(let y=0;y<h;y++){const y0=Math.max(0,y-half),y1=Math.min(h,y+half+1);for(let x=0;x<w;x++){const x0=Math.max(0,x-half),x1=Math.min(w,x+half+1),n=(y1-y0)*(x1-x0),s=I[y1*W+x1]-I[y0*W+x1]-I[y1*W+x0]+I[y0*W+x0],s2=I2[y1*W+x1]-I2[y0*W+x1]-I2[y1*W+x0]+I2[y0*W+x0],m=s/n,sd=Math.sqrt(Math.max(0,s2/n-m*m)),t=m*(1+k*(sd/128-1)),bx0=Math.max(0,x-sm),bx1=Math.min(w,x+sm+1),by0=Math.max(0,y-sm),by1=Math.min(h,y+sm+1),local=(I[by1*W+bx1]-I[by0*W+bx1]-I[by1*W+bx0]+I[by0*W+bx0])/((by1-by0)*(bx1-bx0)),v=local>t||sd<10?255:0,o=(y*w+x)*4;d[o]=d[o+1]=d[o+2]=v;d[o+3]=255}}
 g.putImageData(img,0,0);return out}
// Angle d'inclinaison par profil de projection des lignes de texte (−15° à +15°).
function skewAngle(canvas,doc){const scale=Math.min(1,700/canvas.width),c=doc.createElement('canvas');c.width=Math.max(1,Math.round(canvas.width*scale));c.height=Math.max(1,Math.round(canvas.height*scale));c.getContext('2d').drawImage(canvas,0,0,c.width,c.height);const b=binarize(c,doc,0.25),d=grayData(b),pts=[];
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[y*c.width+x]<128&&((x+y)&1))pts.push(x,y);if(pts.length<200)return 0;
 const score=a=>{const r=a*Math.PI/180,s=Math.sin(r),co=Math.cos(r),bins=new Map();for(let i=0;i<pts.length;i+=2){const k=Math.round(pts[i+1]*co-pts[i]*s);bins.set(k,(bins.get(k)||0)+1)}let t=0;for(const v of bins.values())t+=v*v;return t};
 let best=0,bs=score(0);for(let a=-15;a<=15;a+=1){const v=score(a);if(v>bs){bs=v;best=a}}for(let a=best-0.8;a<=best+0.8;a+=0.2){const v=score(a);if(v>bs){bs=v;best=a}}return Math.abs(best)<0.3?0:best}
function rotate(canvas,angle,doc){if(!angle)return canvas;const r=angle*Math.PI/180,w=canvas.width,h=canvas.height,W=Math.ceil(Math.abs(w*Math.cos(r))+Math.abs(h*Math.sin(r))),H=Math.ceil(Math.abs(w*Math.sin(r))+Math.abs(h*Math.cos(r))),out=doc.createElement('canvas');out.width=W;out.height=H;const g=out.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);g.translate(W/2,H/2);g.rotate(-r);g.drawImage(canvas,-w/2,-h/2);return out}
const FIELDS=['lastName','firstName','birthDate'];
const complete=p=>FIELDS.every(k=>p[k])&&p.lastNameSource!=='entete';
// Fusion des lectures : la valeur lue le plus souvent l'emporte, à égalité la première passe.
function mergeProfiles(list){const out={};for(const k of ['firstName','lastName','usedName','birthDate','email','phone']){const votes=new Map();list.forEach((p,i)=>{const v=p[k];if(v){const e=votes.get(v)||{n:0,i};e.n+=k==='lastName'&&p.lastNameSource==='naissance'?2:1;votes.set(v,e)}});const best=[...votes.entries()].sort((a,b)=>b[1].n-a[1].n||a[1].i-b[1].i)[0];out[k]=best?best[0]:''}
 // Nom pris seulement dans l'en-tête (souvent le nom d'usage) : signalé à la relecture.
 out.lastNameSource=out.lastName?(list.some(p=>p.lastName===out.lastName&&p.lastNameSource==='naissance')?'naissance':list.some(p=>p.lastName===out.lastName&&p.lastNameSource==='libelle')?'libelle':'entete'):'';out.emailCandidates=[...new Set(list.flatMap(p=>p.emailCandidates||[]))];out.phoneCandidates=[...new Set(list.flatMap(p=>p.phoneCandidates||[]))];if(!out.email)out.email=out.emailCandidates[0]||'';if(!out.phone)out.phone=out.phoneCandidates[0]||'';return out}
// Lecture complète d'une image avec un worker Tesseract déjà créé. Passes supplémentaires seulement si nom, prénom ou naissance manquent.
// Gamma > 1 : fonce les gris (libellés et lignes secondaires gris clair, texte délavé par un reflet).
function darken(canvas,doc,gamma=2){const out=doc.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const g=out.getContext('2d',{willReadFrequently:true});g.drawImage(canvas,0,0);const img=g.getImageData(0,0,out.width,out.height),d=img.data,lut=new Uint8Array(256);for(let i=0;i<256;i++)lut[i]=Math.round(255*Math.pow(i/255,gamma));for(let i=0;i<d.length;i+=4)d[i]=d[i+1]=d[i+2]=lut[d[i]];g.putImageData(img,0,0);return out}
// Accentuation (masque flou) : rattrape les photos légèrement floues ou bougées.
function sharpen(canvas,doc,amount=1.5){const w=canvas.width,h=canvas.height,a=grayData(canvas),W=w+1,r=Math.max(2,Math.round(Math.max(w,h)/800));const blur=src=>{const I=new Float64Array(W*(h+1));for(let y=1;y<=h;y++){let s=0;for(let x=1;x<=w;x++){s+=src[(y-1)*w+x-1];I[y*W+x]=I[(y-1)*W+x]+s}}const o=new Float32Array(w*h);for(let y=0;y<h;y++){const y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);for(let x=0;x<w;x++){const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1);o[y*w+x]=(I[y1*W+x1]-I[y0*W+x1]-I[y1*W+x0]+I[y0*W+x0])/((y1-y0)*(x1-x0))}}return o};const b=blur(blur(a));
 const out=doc.createElement('canvas');out.width=w;out.height=h;const g=out.getContext('2d'),img=g.createImageData(w,h),d=img.data;for(let j=0,o=0;j<a.length;j++,o+=4){const v=Math.max(0,Math.min(255,a[j]+amount*(a[j]-b[j])));d[o]=d[o+1]=d[o+2]=v;d[o+3]=255}g.putImageData(img,0,0);return out}
// Lecture complète d'une image avec un worker Tesseract déjà créé : seuil adaptatif de Sauvola (reflets, éclairage inégal),
// au moins deux lectures puis d'autres tant que nom, prénom ou naissance manquent ; les valeurs sont fusionnées par vote.
async function readProfile(worker,bitmap,doc,progress=()=>{}){const base=prepareCanvas(bitmap,doc),angle=skewAngle(base,doc),straight=rotate(base,angle,doc);const cache={};const v=(k,f)=>()=>cache[k]||(cache[k]=f());
 const sharp=v('s',()=>darken(sharpen(straight,doc),doc)),dark=v('d',()=>darken(straight,doc));
 const passes=[['Lecture accentuée',sharp,'3'],['Lecture contrastée',dark,'3'],['Lecture des zones isolées',sharp,'11'],['Lecture de l’image redressée',()=>straight,'3']];const results=[],texts=[];
 for(let i=0;i<passes.length;i++){const [label,make,psm]=passes[i];progress(label,i,passes.length);await worker.setParameters({...OCR_PARAMS,tessedit_pageseg_mode:psm});const r=await worker.recognize(make());const text=r.data.text||'';texts.push(text);results.push(parseProfile(text));if(i>=1&&complete(mergeProfiles(results)))break}
 const merged=mergeProfiles(results);merged.passes=results.length;merged.angle=Math.round(angle*10)/10;merged.lines=[...new Set(texts.join('\n').split(/\r?\n/).map(s=>clean(s).replace(/\s{2,}/g,'  ')).filter(s=>s.length>=2&&/\p{L}{2}|\d/u.test(s)))].slice(0,120);return {profile:merged,text:texts[0]||'',texts}}
// Repli manuel : valeur d'un champ à partir d'une ligne lue que l'utilisateur a touchée.
function fieldFromLine(kind,line){const v=stripValue(String(line||'').replace(/^\s*\S.*?(?:\s{2,}|\s*[:*]\s+)(?=\S)/,m=>labelsOf(m).length?'':m));if(kind==='birthDate')return birthDate(line);if(kind==='lastName')return upperName(cleanName(v));if(kind==='firstName')return cleanName(v);return ''}
function contactError(v){if(!v||typeof v!=='object'||Object.values(v).some(x=>typeof x!=='string'||x.length>180))return 'Coordonnées invalides.';if(!clean(v.firstName)||!clean(v.lastName)||!/^\d{4}-\d\d-\d\d$/.test(v.birthDate)||!birthDate(v.birthDate.slice(8)+'/'+v.birthDate.slice(5,7)+'/'+v.birthDate.slice(0,4)))return 'Vérifiez le nom, le prénom et la date de naissance.';if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))return 'Adresse e-mail invalide.';if(v.phone&&!phone(v.phone))return 'Numéro de téléphone invalide.';if(!v.email&&!phone(v.phone))return 'Un e-mail ou un téléphone est nécessaire.';return ''}
function contact(v){return {firstName:clean(v.firstName),lastName:clean(v.lastName),birthDate:clean(v.birthDate),email:clean(v.email),phone:phone(v.phone)}}
function matchesIdentity(a,b){return normalized(a.firstName)===normalized(b.firstName)&&normalized(a.lastName)===normalized(b.lastName)&&a.birthDate===b.birthDate}
root.InvitationCore={parseProfile,prepareCanvas,OCR_PARAMS,readProfile,mergeProfiles,binarize,skewAngle,sharpen,darken,fieldFromLine,phone,birthDate,contactError,contact,matchesIdentity,normalized};if(typeof module!=='undefined')module.exports=root.InvitationCore;
})(typeof window!=='undefined'?window:globalThis);

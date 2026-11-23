/* IASELO · compte rendu opératoire (CRO).
   Le chirurgien alimente le CRO de trois façons, combinables :
   - dictée au micro : transcription locale (Whisper small dans le navigateur, cro-transcription-worker.js), au fil de l'eau ;
   - enregistrement audio importé (mémo vocal du téléphone, dictaphone) : même transcription locale ;
   - document importé (.pdf, .docx, .doc, .odt, .rtf, .txt) : texte extrait sur le poste, document d'origine joint au dossier.
   Le texte est rangé dans les rubriques du CRO (titres dictés ou écrits : « Indication », « Voie d'abord »…), marqué « à relire »,
   puis le chirurgien relit, corrige, atteste la relecture et signe. Une modification ouvre une nouvelle version tracée.
   Aucun audio ni document n'est envoyé à un service externe ; l'audio n'est jamais conservé (seule l'empreinte d'un fichier importé l'est).
   Données : rubriques de séjour `croDraft` (brouillon) et `cro` (version validée + historique). Règles : cro-regles.js. */
(function(){
'use strict';
window.createCro=function(ctx){
 const R=window.IaseloCro;if(!R)return null;
 const {$,esc,toast}=ctx;
 const cur=()=>ctx.current(),job=()=>ctx.job()||'';
 const isSurgeon=()=>job()==='chirurgien'||(!job()&&ctx.role()==='Chirurgien');
 const writable=()=>ctx.canWrite?ctx.canWrite('stay/'+(cur()?.id||'x')+'/croDraft')&&ctx.canWrite('stay/'+(cur()?.id||'x')+'/cro'):true;
 const canEdit=()=>isSurgeon()&&writable();
 const who=()=>ctx.access?.()?.profile?.display_name||ctx.authorName?.()||'Chirurgien';
 const RUBS=[...R.RUBRIQUES,R.AUTRE];
 const frDate=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'';
 const frDateHeure=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):String(iso||'')};
 const duree=s=>{s=Math.round(s||0);const m=Math.floor(s/60);return m?m+' min '+String(s%60).padStart(2,'0')+' s':s+' s'};
 const taille=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' Mo':Math.max(1,Math.round(n/1024))+' ko';
 async function sha256(data){const b=typeof data==='string'?new TextEncoder().encode(data):data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('')}

 /* ---------- Données ---------- */
 const legacy=c=>c&&!c.v;
 function depuis(c){
  if(!c)return null;
  if(!legacy(c))return {v:2,date:c.date||'',operation:c.operation||'',operateur:c.operateur||'',aides:c.aides||'',sections:{...(c.sections||{})},aRelire:[],sources:[...(c.sources||[])],file:c.file||null,relu:false};
  const s=R.structurer(c.text||'',{courante:'autre'});
  return {v:2,date:c.date||'',operation:c.operation||'',operateur:s.entete.operateur||'',aides:s.entete.aides||'',sections:s.sections,aRelire:[],sources:[],file:c.file||null,relu:false};
 }
 function initial(stay){
  const d=ctx.defaults?.(stay)||{};
  return {v:2,date:d.date||'',operation:d.operation||'',operateur:who(),aides:'',sections:{},aRelire:[],sources:[],file:null,relu:false};
 }
 function brouillon(stay){
  const d=stay.croDraft;
  if(d&&d.v===2)return d;
  if(d)return depuis(d)||initial(stay); // ancien brouillon (texte libre)
  return null;
 }

 /* ---------- Moteur de transcription (un worker partagé) ---------- */
 const moteur={worker:null,pret:false,erreur:'',charge:0,total:0,suivant:1,attentes:new Map(),abonnes:new Set()};
 const signal=()=>moteur.abonnes.forEach(f=>{try{f()}catch{}});
 function demarrerMoteur(){
  if(moteur.worker)return moteur.worker;
  moteur.erreur='';
  let w;
  try{w=new Worker('/cro-transcription-worker.js',{type:'module'})}catch{moteur.erreur='Transcription impossible sur ce navigateur. Utilisez un navigateur récent (Chrome, Edge, Firefox, Safari 16+).';signal();return null}
  w.onmessage=({data})=>{
   if(data.type==='progression'){moteur.charge=data.charge;moteur.total=data.total;signal()}
   else if(data.type==='pret'){moteur.pret=true;signal()}
   else if(data.type==='erreur'){moteur.erreur=data.message;for(const [,a] of moteur.attentes)a.reject(Error(data.message));moteur.attentes.clear();w.terminate();moteur.worker=null;signal()}
   else if(data.type==='texte'||data.type==='echec'){const a=moteur.attentes.get(data.id);if(!a)return;moteur.attentes.delete(data.id);data.type==='texte'?a.resolve(data.texte):a.reject(Error('Extrait non transcrit.'))}
  };
  w.onerror=()=>{moteur.erreur='Le module de transcription s’est arrêté. Rechargez la page et réessayez.';for(const [,a] of moteur.attentes)a.reject(Error(moteur.erreur));moteur.attentes.clear();moteur.worker=null;signal()};
  w.postMessage({type:'charger'});
  moteur.worker=w;return w;
 }
 function transcrire(audio,session){
  const w=demarrerMoteur();if(!w)return Promise.reject(Error(moteur.erreur));
  const id=moteur.suivant++;
  return new Promise((resolve,reject)=>{moteur.attentes.set(id,{resolve,reject});w.postMessage({type:'transcrire',id,session,audio},[audio.buffer])});
 }

 /* ---------- Session de dictée / transcription en cours ---------- */
 let sess=null; // {stayId,type,nom,empreinte,debut,duree,extraits:[{p,texte,ok}],arret,fin,flux,audioCtx,proc,tampon,niveau,minuteur}
 function etatSession(){
  if(!sess)return null;
  const faits=sess.extraits.filter(x=>x.fini).length;
  return {faits,total:sess.extraits.length};
 }
 function ajouterExtrait(audio){
  if(R.dureeVoix(audio,16000)<0.4)return;
  const x={fini:false,texte:'',douteux:false,ok:true};
  x.p=transcrire(audio,sess.id).then(t=>{const n=R.nettoyer(t);x.texte=n.texte;x.douteux=n.douteux}).catch(()=>{x.ok=false}).finally(()=>{x.fini=true;signal()});
  sess.extraits.push(x);signal();
 }
 async function terminerSession(){
  const s=sess;if(!s||s.fin)return;s.fin=true;signal();
  await Promise.all(s.extraits.map(x=>x.p));
  if(sess!==s)return;
  const echecs=s.extraits.filter(x=>!x.ok).length,douteux=s.extraits.some(x=>x.douteux);
  const brut=s.extraits.filter(x=>x.ok&&x.texte).map(x=>x.texte).join(' ');
  sess=null;signal();
  const stay=cur();
  if(!stay||stay.id!==s.stayId){toast('Dictée terminée : rouvrez le dossier concerné pour la retrouver.');return}
  if(!brut){message(echecs?'La transcription a échoué. Réessayez ou importez un document.':'Aucune parole reconnue dans l’enregistrement.',true);return}
  const texte=R.commandesVocales(brut);
  inserer(stay,texte,{type:s.type,nom:s.nom||'',empreinte:s.empreinte||'',dureeS:Math.round(s.duree||0),moteur:'Whisper small · transcription locale (navigateur)',at:new Date().toISOString(),douteux,echecs},
   (echecs?echecs+' extrait(s) non transcrit(s) : vérifiez la fin du texte. ':'')+(douteux?'Des passages répétés ou parasites ont été retirés : relisez attentivement. ':''));
 }
 function arreterMicro(s){
  try{s.proc&&(s.proc.onaudioprocess=null);s.proc?.disconnect();s.source?.disconnect()}catch{}
  s.flux?.getTracks().forEach(t=>t.stop());
  try{s.audioCtx?.close()}catch{}
  clearInterval(s.minuteur);
 }
 function viderTampon(s,tout){
  if(!s.tampon.length)return;
  let n=0;for(const t of s.tampon)n+=t.length;
  const buf=new Float32Array(n);let k=0;for(const t of s.tampon){buf.set(t,k);k+=t.length}
  s.tampon=[];
  if(tout){ajouterExtrait(buf);return}
  const coupe=R.coupeDirect(buf,16000);
  if(coupe>0){ajouterExtrait(buf.slice(0,coupe));const reste=buf.slice(coupe);if(reste.length)s.tampon.push(reste)}
  else s.tampon.push(buf);
 }
 async function demarrerDictee(stay){
  if(sess)return;
  if(!navigator.mediaDevices?.getUserMedia){message('Micro indisponible sur ce navigateur. Importez un enregistrement audio ou un document.',true);return}
  demarrerMoteur();
  let flux;
  try{flux=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}
  catch(e){message(e?.name==='NotAllowedError'?'Le micro est bloqué : autorisez-le dans le navigateur (icône du cadenas), ou importez un enregistrement.':'Aucun micro utilisable sur ce poste. Importez un enregistrement audio ou un document.',true);return}
  // Contexte audio à 16 kHz si possible (Chrome, Safari) ; sinon fréquence du micro et rééchantillonnage filtré (Firefox).
  const AC=window.AudioContext||window.webkitAudioContext;let audioCtx,source;
  try{audioCtx=new AC({sampleRate:16000});source=audioCtx.createMediaStreamSource(flux)}catch{try{audioCtx?.close()}catch{}audioCtx=new AC();source=audioCtx.createMediaStreamSource(flux)}
  const proc=audioCtx.createScriptProcessor(4096,1,1);
  sess={id:crypto.randomUUID(),stayId:stay.id,type:'dictée',debut:Date.now(),duree:0,extraits:[],tampon:[],niveau:0,flux,audioCtx,source,proc,fin:false,enregistre:true};
  const s=sess;
  proc.onaudioprocess=e=>{
   const x=e.inputBuffer.getChannelData(0);let m=0;for(let i=0;i<x.length;i+=8)m=Math.max(m,Math.abs(x[i]));s.niveau=m;
   s.tampon.push(R.reechantillonner(x,audioCtx.sampleRate,16000));
  };
  source.connect(proc);proc.connect(audioCtx.destination);
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  s.minuteur=setInterval(()=>{s.duree=(Date.now()-s.debut)/1000;viderTampon(s,false);if(s.duree>=30*60){arreterDictee();message('Dictée arrêtée après 30 minutes.')}else majLive()},500);
  signal();
 }
 function arreterDictee(){
  const s=sess;if(!s||!s.enregistre)return;
  s.enregistre=false;s.duree=(Date.now()-s.debut)/1000;arreterMicro(s);viderTampon(s,true);
  terminerSession();
 }
 function annulerSession(){
  const s=sess;if(!s)return;arreterMicro(s);sess=null;signal();
 }
 async function importerAudio(stay,file){
  if(sess)return;
  demarrerMoteur();
  sess={id:crypto.randomUUID(),stayId:stay.id,type:'enregistrement importé',nom:file.name,debut:Date.now(),duree:0,extraits:[],tampon:[],fin:false,enregistre:false,decodage:true};
  const s=sess;signal();
  try{
   const bytes=await file.arrayBuffer();s.empreinte=await sha256(bytes);
   // Décodage directement à 16 kHz quand le navigateur le permet (rééchantillonnage natif, meilleur pour la reconnaissance).
   const AC=window.AudioContext||window.webkitAudioContext;let ac;try{ac=new AC({sampleRate:16000})}catch{ac=new AC()}
   let audio;try{audio=await new Promise((res,rej)=>{const p=ac.decodeAudioData(bytes.slice(0),res,rej);if(p&&p.then)p.then(res,rej)})}finally{try{ac.close()}catch{}}
   const n=audio.length,mono=new Float32Array(n);
   for(let c=0;c<audio.numberOfChannels;c++){const d=audio.getChannelData(c);for(let i=0;i<n;i++)mono[i]+=d[i]/audio.numberOfChannels}
   const x=R.reechantillonner(mono,audio.sampleRate,16000);s.duree=x.length/16000;s.decodage=false;
   if(sess!==s)return;
   for(const [a,b] of R.decouper(x,16000))ajouterExtrait(x.slice(a,b));
   if(!s.extraits.length){sess=null;signal();message('Aucune parole détectée dans cet enregistrement.',true);return}
   terminerSession();
  }catch{
   if(sess===s){sess=null;signal()}
   message('Enregistrement illisible par ce navigateur. Essayez un fichier m4a, mp3 ou wav.',true);
  }
 }

 /* ---------- Documents ---------- */
 const inflate=async b=>new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
 let pdfjs=null,ocr=null;
 async function lirePdf(bytes,progres){
  if(!pdfjs){pdfjs=await import('/vendor/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs'}
  const doc=await pdfjs.getDocument({data:bytes,isEvalSupported:false,wasmUrl:'/vendor/pdfjs/wasm/',useWorkerFetch:true,enableXfa:false}).promise;
  const pages=[];for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);pages.push((await pg.getTextContent()).items)}
  let texte=R.textePdf(pages),ocrUtilise=false;
  if(R.pdfScanne(texte,doc.numPages)){
   ocrUtilise=true;const morceaux=[];const max=Math.min(doc.numPages,12);
   for(let i=1;i<=max;i++){
    progres?.('Lecture optique de la page '+i+' sur '+max+'…');
    const pg=await doc.getPage(i),vp=pg.getViewport({scale:2.2}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;
    await pg.render({canvasContext:cv.getContext('2d'),viewport:vp,canvas:cv}).promise;
    morceaux.push(await lireImage(cv));
   }
   texte=morceaux.join('\n\n').trim();
  }
  try{doc.destroy()}catch{}
  return {texte,ocr:ocrUtilise};
 }
 async function lireImage(canvas){
  if(!ocr){
   if(!window.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Lecture optique indisponible.'));document.head.append(s)});
   ocr=await window.Tesseract.createWorker('fra',1,{workerPath:location.origin+'/ocr/worker.min.js',corePath:location.origin+'/ocr/tesseract-core-lstm.wasm.js',langPath:location.origin+'/ocr',workerBlobURL:false,cacheMethod:'none'});
  }
  const r=await ocr.recognize(canvas);return String(r.data.text||'').trim();
 }
 async function importerDocument(stay,file,format){
  if(sess)return;
  sess={stayId:stay.id,type:'document',nom:file.name,extraits:[],tampon:[],fin:false,lecture:'Lecture du document…'};signal();
  const s=sess;
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());const empreinte=await sha256(bytes);
   let texte,ocrUtilise=false;
   if(format==='pdf'){const r=await lirePdf(bytes,m=>{s.lecture=m;signal()});texte=r.texte;ocrUtilise=r.ocr}
   else texte=await R.texteDocument(bytes,format,{inflate});
   if(sess!==s)return;sess=null;signal();
   const d=assurerBrouillon(stay),remplace=d.file&&d.file.name!==file.name?d.file.name:'';
   d.file=file;
   if(!texte.trim()){enregistrerBrouillon(stay);majTout();message('Document joint, mais aucun texte n’a pu en être extrait : saisissez ou dictez le compte rendu, ou laissez le document seul.',true);return}
   inserer(stay,texte,{type:'document importé',nom:file.name,empreinte,taille:file.size,format,ocr:ocrUtilise,at:new Date().toISOString()},
    (ocrUtilise?'Texte obtenu par lecture optique (document scanné) : relisez attentivement. ':'')+(remplace?'Le document « '+remplace+' » a été remplacé comme pièce jointe. ':''));
  }catch(e){
   if(sess===s){sess=null;signal()}
   message((e&&e.message&&!/^[A-Z][a-z]+Error/.test(e.message)?e.message+' ':'')+'Texte non extrait. Vous pouvez joindre le fichier tel quel en le réimportant après conversion en PDF ou .docx.',true);
  }
 }

 /* ---------- Brouillon : insertion, annulation ---------- */
 let derniereRubrique='autre',annulation=null,dernierMessage={texte:'',erreur:false};
 function assurerBrouillon(stay){if(!brouillon(stay)||!stay.croDraft||stay.croDraft.v!==2)stay.croDraft=brouillon(stay)||(stay.cro?depuis(stay.cro):initial(stay));return stay.croDraft}
 function enregistrerBrouillon(stay){stay.croDraft=assurerBrouillon(stay)}
 function inserer(stay,texte,source,remarque=''){
  const d=assurerBrouillon(stay);
  annulation={stayId:stay.id,etat:{sections:{...d.sections},aRelire:[...d.aRelire],sources:[...d.sources],operation:d.operation,operateur:d.operateur,aides:d.aides,file:d.file}};
  const auto=$('#cro-auto')?$('#cro-auto').checked:true;
  let ajout,ent={};
  if(auto){const s=R.structurer(texte,{courante:'autre'});ajout=s.sections;ent=s.entete}
  else ajout={[derniereRubrique||'autre']:texte.trim()};
  if(ent.operation&&!d.operation.trim())d.operation=ent.operation;
  if(ent.operateur&&(!d.operateur.trim()||d.operateur===who()))d.operateur=ent.operateur;
  if(ent.aides&&!d.aides.trim())d.aides=ent.aides;
  d.sections=R.fusionner(d.sections,ajout);
  for(const k of Object.keys(ajout))if(!d.aRelire.includes(k))d.aRelire.push(k);
  d.sources.push(source);d.relu=false;
  stay.croDraft=d;
  ctx.event?.((source.type==='document importé'?'Document importé dans le compte rendu opératoire : '+source.nom:'Dictée transcrite dans le compte rendu opératoire'+(source.dureeS?' ('+duree(source.dureeS)+')':'')),'Chirurgie');
  const noms=RUBS.filter(r=>ajout[r.id]).map(r=>r.titre);
  majTout();
  message((noms.length?'Texte ajouté : '+noms.join(', ')+'. ':'')+remarque+'Relisez chaque rubrique marquée « à relire » avant de valider.');
  const first=RUBS.find(r=>ajout[r.id]);if(first)document.querySelector('[data-sec="'+first.id+'"]')?.scrollIntoView({block:'center',behavior:'smooth'});
 }
 function annuler(){
  const stay=cur(),d=brouillon(stay);if(!annulation||!d||annulation.stayId!==stay.id)return;
  Object.assign(d,annulation.etat);stay.croDraft=d;annulation=null;majTout();message('Dernier ajout annulé.');
 }

 /* ---------- Affichage ---------- */
 let hote=null;
 function message(t,erreur=false){dernierMessage={texte:t,erreur};const m=$('#cro-msg');if(m){m.textContent=t;m.classList.toggle('is-err',!!erreur)}}
 function etatPill(stay){
  const d=stay.croDraft,c=stay.cro;
  if(d&&c)return '<span class="pill warn">Nouvelle version en cours</span>';
  if(d)return '<span class="pill warn">Brouillon</span>';
  if(c&&legacy(c))return '<span class="pill good">Enregistré</span>';
  if(c)return '<span class="pill good">Validé et signé</span>';
  return '<span class="pill">À rédiger</span>';
 }
 function vueValidee(c,editable){
  if(!c)return '<p class="muted">Aucun compte rendu validé pour ce séjour.</p>';
  const meta=[['Intervention',c.operation],['Date',frDate(c.date)],['Opérateur',c.operateur||(legacy(c)?c.author:'')],['Aide(s)',c.aides]].filter(([,v])=>v);
  const corps=legacy(c)?(c.text?`<p class="cro-p">${esc(c.text)}</p>`:''):RUBS.filter(r=>String(c.sections?.[r.id]||'').trim()).map(r=>`<section class="cro-doc-sec"><h4>${esc(r.titre)}</h4><p class="cro-p">${esc(c.sections[r.id])}</p></section>`).join('');
  const sources=(c.sources||[]).map(s=>s.type==='document importé'?'document importé « '+s.nom+' »'+(s.ocr?' (lecture optique)':''):s.type==='enregistrement importé'?'enregistrement importé « '+s.nom+' » transcrit sur le poste ('+duree(s.dureeS)+')':'dictée transcrite sur le poste ('+duree(s.dureeS)+')');
  const signe=legacy(c)?`Enregistré par ${esc(c.author||'')} le ${esc(c.savedAt||'')}`:`Validé et signé par <b>${esc(c.validatedBy)}</b> le ${esc(frDateHeure(c.validatedAt))} · version ${esc(c.version||1)}${c.empreinte?` · empreinte <code title="${esc(c.empreinte)}">${esc(c.empreinte.slice(0,12))}…</code>`:''}`;
  const hist=(c.history||[]).slice().reverse();
  return `<article class="cro-doc">
   <dl class="cro-meta">${meta.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
   ${corps||'<p class="muted">Compte rendu constitué du document joint.</p>'}
   ${c.file?`<div class="cro-attach"><span>Document d’origine joint : <b>${esc(c.file.name)}</b>${c.file.size?' · '+taille(c.file.size):''}</span><button type="button" class="secondary" id="cro-dl-valide">Télécharger</button></div>`:''}
   <footer class="cro-sign">${signe}${sources.length?`<br><span class="muted">Rédigé à partir de : ${esc(sources.join(' ; '))}. Relu et corrigé par le chirurgien avant signature.</span>`:''}</footer>
   ${hist.length?`<details class="cro-hist"><summary>Versions précédentes (${hist.length})</summary>${hist.map(h=>`<div class="cro-hist-item"><p class="muted">Version ${esc(h.version)} · ${esc(h.validatedBy||'')} · ${esc(frDateHeure(h.validatedAt))}</p><p class="cro-p">${esc(h.text||'')}</p></div>`).join('')}</details>`:''}
   <div class="actions no-print">${editable?'<button type="button" class="primary" id="cro-modifier">Modifier (nouvelle version)</button>':''}<button type="button" class="secondary" id="cro-print">Imprimer</button></div>
  </article>`;
 }
 const lignes=t=>Math.min(18,Math.max(2,String(t||'').split('\n').reduce((n,l)=>n+1+Math.floor(l.length/95),0)));
 function sectionsHtml(d){
  return RUBS.filter(r=>r.id!=='autre'||String(d.sections.autre||'').trim()).map(r=>{
   const v=d.sections[r.id]||'',rel=d.aRelire.includes(r.id);
   return `<div class="cro-sec${rel?' is-relire':''}${r.id==='autre'?' is-autre':''}" data-sec="${r.id}">
    <label for="cro-s-${r.id}"><span class="cro-sec-t">${esc(r.titre)}</span>${rel?'<span class="cro-badge">à relire</span>':''}</label>
    <textarea id="cro-s-${r.id}" data-rub="${r.id}" rows="${lignes(v)}" maxlength="20000" placeholder="${esc(r.aide)}">${esc(v)}</textarea>
    ${rel?`<button type="button" class="textbutton cro-lu" data-lu="${r.id}">Marquer comme relu</button>`:''}
   </div>`}).join('');
 }
 function liveHtml(){
  const st=etatSession();
  if(!sess&&!moteur.erreur)return '';
  if(!sess)return `<div class="cro-live is-err" role="alert">${esc(moteur.erreur)}</div>`;
  const chargement=!moteur.pret&&!moteur.erreur&&(sess.type!=='document');
  const pct=moteur.total?Math.round(moteur.charge*100/moteur.total):0;
  const apercu=sess.extraits.filter(x=>x.fini&&x.texte).map(x=>x.texte).join(' ');
  let etat='';
  if(sess.type==='document')etat=esc(sess.lecture||'Lecture du document…');
  else if(sess.enregistre)etat=`<span class="cro-rec-dot" aria-hidden="true"></span>Dictée en cours · <b id="cro-chrono">${esc(duree(sess.duree))}</b>`;
  else if(sess.decodage)etat='Lecture de l’enregistrement « '+esc(sess.nom)+' »…';
  else etat='Transcription en cours…';
  return `<div class="cro-live" aria-live="polite">
   <div class="cro-live-row"><p class="cro-live-etat">${etat}</p>
    ${sess.enregistre?`<span class="cro-meter" aria-hidden="true"><span id="cro-niveau"></span></span><button type="button" class="primary" id="cro-stop">Arrêter la dictée</button>`:''}
    ${!sess.enregistre&&sess.type!=='document'?'<button type="button" class="secondary" id="cro-abandon">Abandonner</button>':''}</div>
   ${chargement?`<p class="muted">Préparation du module de transcription${pct?' · '+pct+' %':''}${moteur.total>50e6&&pct<100?' (première utilisation sur ce poste : environ 250 Mo, ensuite immédiat)':''}.${sess.enregistre?' Vous pouvez dicter dès maintenant.':''}</p><div class="cro-bar"><span style="width:${pct}%"></span></div>`:''}
   ${st&&st.total&&sess.type!=='document'?`<p class="muted">Extraits transcrits : ${st.faits} sur ${st.total}${sess.enregistre?' (la transcription suit la dictée)':''}.</p>`:''}
   ${apercu?`<p class="cro-apercu">${esc(apercu)}</p>`:''}
  </div>`;
 }
 function majLive(){
  const z=$('#cro-live-zone');if(!z)return;
  const chrono=$('#cro-chrono');
  if(chrono&&sess?.enregistre&&z.dataset.extraits===String(sess.extraits.length)+'/'+(etatSession()?.faits)+'/'+moteur.pret+'/'+Math.round(moteur.total?moteur.charge*100/moteur.total:0)){chrono.textContent=duree(sess.duree);const n=$('#cro-niveau');if(n)n.style.width=Math.min(100,Math.round((sess.niveau||0)*160))+'%';return}
  z.innerHTML=liveHtml();
  z.dataset.extraits=sess?String(sess.extraits.length)+'/'+(etatSession()?.faits)+'/'+moteur.pret+'/'+Math.round(moteur.total?moteur.charge*100/moteur.total:0):'';
  const n=$('#cro-niveau');if(n&&sess)n.style.width=Math.min(100,Math.round((sess.niveau||0)*160))+'%';
  $('#cro-stop')?.addEventListener('click',arreterDictee);
  $('#cro-abandon')?.addEventListener('click',()=>{annulerSession();message('Transcription abandonnée : rien n’a été ajouté.')});
  const occupe=!!sess;
  const rec=$('#cro-rec'),imp=$('#cro-import-btn');if(rec)rec.disabled=occupe;if(imp)imp.classList.toggle('is-disabled',occupe);const fi=$('#cro-file');if(fi)fi.disabled=occupe;
 }
 moteur.abonnes.add(()=>{if(hote&&hote.isConnected)majLive()});

 function majTout(){if(hote&&hote.isConnected)render()}

 function render(){
  const stay=cur();if(!stay)return;
  const host=$('#content');hote=host;
  const peut=canEdit(),c=stay.cro,d=peut?(brouillon(stay)||(!c?initial(stay):null)):null;
  const tete=`<div class="cro-head"><h3>Compte rendu opératoire</h3>${etatPill(stay)}</div>`;
  if(!d){
   host.innerHTML=`<div class="cro-wrap">${tete}${!peut&&stay.croDraft&&!c?'<p class="notice">Compte rendu en cours de rédaction par le chirurgien : il apparaîtra ici une fois validé et signé.</p>':''}${vueValidee(c,peut)}</div>`;
   bindVue(stay);return;
  }
  host.innerHTML=`<div class="cro-wrap">${tete}
  ${c?`<p class="notice">Vous modifiez le compte rendu validé (version ${esc(c.version||1)}). La version actuelle reste en vigueur jusqu’à la nouvelle signature.</p>`:''}
  <form id="cro-form" class="cro-form" novalidate>
   <div class="cro-grid">
    <label>Date de l’intervention<input name="date" type="date" value="${esc(d.date)}" required></label>
    <label class="is-wide">Intervention réalisée<input name="operation" type="text" maxlength="250" value="${esc(d.operation)}"></label>
    <label>Opérateur<input name="operateur" type="text" maxlength="160" value="${esc(d.operateur)}"></label>
    <label>Aide(s) opératoire(s)<input name="aides" type="text" maxlength="250" value="${esc(d.aides)}"></label>
   </div>
   <section class="cro-sources" aria-label="Dicter ou importer">
    <div class="cro-source-actions">
     <button type="button" class="primary cro-rec" id="cro-rec"><span class="cro-mic" aria-hidden="true"></span>Dicter le compte rendu</button>
     <label class="secondary cro-import" id="cro-import-btn">Importer un document ou un enregistrement<input type="file" id="cro-file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.m4a,.mp3,.wav,.webm,.ogg,.oga,.opus,.aac,.mp4,.3gp,.caf,.flac,audio/*"></label>
     <label class="check cro-auto"><input type="checkbox" id="cro-auto" checked>Ranger dans les rubriques</label>
    </div>
    <p class="muted cro-aide">Dictez en annonçant les rubriques (« Indication… Voie d’abord… Gestes réalisés… Fermeture… Consignes… ») ; « à la ligne », « nouveau paragraphe », « virgule » sont compris. Documents : PDF, Word (.docx, .doc), OpenDocument, RTF, texte. Audio : mémo vocal m4a, mp3, wav…</p>
    <p class="muted cro-rgpd">La transcription et la lecture des documents se font sur ce poste : rien n’est envoyé hors d’IASELO et l’audio n’est pas conservé.</p>
    <div id="cro-live-zone"></div>
    <p id="cro-msg" role="status" class="cro-msg"></p>
    <button type="button" class="textbutton" id="cro-undo" ${annulation&&annulation.stayId===stay.id?'':'hidden'}>Annuler le dernier ajout</button>
   </section>
   <div class="cro-sections">${sectionsHtml(d)}</div>
   ${d.file?`<div class="cro-attach"><span>Document d’origine joint : <b>${esc(d.file.name)}</b>${d.file.size?' · '+taille(d.file.size):''}</span><button type="button" class="secondary" id="cro-dl">Télécharger</button><button type="button" class="textbutton" id="cro-unattach">Retirer</button></div>`:''}
   <div class="cro-validate">
    <label class="check"><input type="checkbox" name="relu" ${d.relu?'checked':''}>J’ai relu et corrigé l’ensemble du compte rendu ; le texte transcrit ou extrait automatiquement est conforme à l’intervention.</label>
    <div id="cro-err" class="cro-err" role="alert"></div>
    <div class="actions"><button class="primary" type="submit">Valider et signer</button>${c?'<button type="button" class="secondary" id="cro-renoncer">Abandonner la modification</button>':''}</div>
   </div>
  </form>
  ${c?`<details class="cro-current"><summary>Version en vigueur</summary>${vueValidee(c,false)}</details>`:''}
  </div>`;
  if(dernierMessage.texte)message(dernierMessage.texte,dernierMessage.erreur);
  bindEditeur(stay);bindVue(stay);majLive();
 }
 function bindVue(stay){
  $('#cro-dl-valide')?.addEventListener('click',()=>ctx.download(stay.cro.file));
  $('#cro-print')?.addEventListener('click',()=>window.print());
  $('#cro-modifier')?.addEventListener('click',()=>{stay.croDraft=depuis(stay.cro);dernierMessage={texte:'',erreur:false};render()});
 }
 function bindEditeur(stay){
  const form=$('#cro-form');if(!form)return;
  const d=()=>assurerBrouillon(stay);
  form.addEventListener('input',e=>{
   const t=e.target;
   if(t.id==='cro-file'||t.id==='cro-auto')return;
   const b=d();
   if(t.dataset.rub){b.sections[t.dataset.rub]=t.value;if(!t.value.trim())delete b.sections[t.dataset.rub];const i=b.aRelire.indexOf(t.dataset.rub);if(i>=0){b.aRelire.splice(i,1);const box=t.closest('.cro-sec');box?.classList.remove('is-relire');box?.querySelector('.cro-badge')?.remove();box?.querySelector('.cro-lu')?.remove()}t.rows=lignes(t.value)}
   else if(t.name==='relu')b.relu=t.checked;
   else if(['date','operation','operateur','aides'].includes(t.name))b[t.name]=t.value;
   stay.croDraft=b;$('#cro-err').innerHTML='';
  });
  form.addEventListener('focusin',e=>{if(e.target.dataset?.rub)derniereRubrique=e.target.dataset.rub});
  form.addEventListener('click',e=>{const id=e.target.dataset?.lu;if(!id)return;const b=d();b.aRelire=b.aRelire.filter(x=>x!==id);stay.croDraft=b;const box=e.target.closest('.cro-sec');box.classList.remove('is-relire');box.querySelector('.cro-badge')?.remove();e.target.remove()});
  $('#cro-rec').onclick=()=>{dernierMessage={texte:'',erreur:false};message('');demarrerDictee(stay)};
  $('#cro-file').onchange=e=>{
   const f=e.target.files[0];e.target.value='';if(!f)return;
   const err=R.controleFichier(f);if(err){message(err,true);return}
   const {nature,format}=R.natureFichier(f.name,f.type);message('');
   if(nature==='audio')importerAudio(stay,f);else importerDocument(stay,f,format);
  };
  $('#cro-undo').onclick=annuler;
  $('#cro-dl')?.addEventListener('click',()=>ctx.download(d().file));
  $('#cro-unattach')?.addEventListener('click',()=>{const b=d();b.file=null;stay.croDraft=b;render();message('Document retiré du compte rendu.')});
  $('#cro-renoncer')?.addEventListener('click',()=>{if(sess)annulerSession();delete stay.croDraft;annulation=null;dernierMessage={texte:'',erreur:false};render();toast('Modification abandonnée : la version validée reste en vigueur.')});
  form.onsubmit=async e=>{
   e.preventDefault();
   if(!canEdit()||cur()!==stay)return;
   if(sess){$('#cro-err').textContent='Attendez la fin de la dictée ou de la transcription.';return}
   const b=d();b.relu=form.elements.namedItem('relu').checked;
   for(const k of Object.keys(b.sections))if(!String(b.sections[k]).trim())delete b.sections[k];
   const m=R.manques(b);
   if(m.length){$('#cro-err').innerHTML='<p>Avant de signer :</p><ul>'+m.map(x=>`<li><button type="button" class="textbutton" data-aller="${esc(x.id)}">${esc(x.texte)}</button></li>`).join('')+'</ul>'+(b.aRelire.length?'':'');
    $('#cro-err').querySelectorAll('[data-aller]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.aller,el=id==='relu'?form.elements.namedItem('relu'):id==='date'||id==='operation'?form.elements.namedItem(id):$('#cro-s-'+id)||$('#cro-rec');el?.scrollIntoView({block:'center'});el?.focus()});return}
   const prev=stay.cro,version=prev?(prev.version||1)+1:1;
   const base={v:2,date:b.date,operation:b.operation.trim(),operateur:b.operateur.trim(),aides:b.aides.trim(),sections:{...b.sections},sources:b.sources,file:b.file||null};
   const text=R.composer(base),empreinte=await sha256(text+(b.file?'\n'+b.file.name+'\n'+b.file.size:''));
   const history=prev?[...(prev.history||[]),{version:prev.version||1,validatedBy:prev.validatedBy||prev.author||'',validatedAt:prev.validatedAt||'',empreinte:prev.empreinte||'',text:prev.text||''}]:[];
   const nonRelues=b.aRelire.length;
   stay.cro={...base,text,empreinte,version,status:'validé',validatedBy:who(),validatedAt:new Date().toISOString(),author:who(),savedAt:new Date().toLocaleString('fr-FR'),relu:true,history};
   delete stay.croDraft;annulation=null;dernierMessage={texte:'',erreur:false};
   ctx.event?.(version>1?'Compte rendu opératoire modifié, validé et signé (version '+version+')':'Compte rendu opératoire validé et signé','Chirurgie');
   try{await ctx.flush?.()}catch{}
   ctx.refresh?.();
   toast('Compte rendu opératoire validé et signé'+(nonRelues?' ('+nonRelues+' rubrique(s) non marquée(s) relue(s), relecture attestée)':''));
  };
 }
 /* Appelé à chaque affichage du dossier : la dictée s'arrête si l'on quitte le CRO ou le séjour. */
 function detail(tab){
  if(sess&&sess.enregistre&&(tab!=='operativeReport'||cur()?.id!==sess.stayId)){arreterDictee();toast('Dictée arrêtée : la transcription se termine en arrière-plan.')}
 }
 return {render,detail,_test:{moteur,etat:()=>sess}};
};
})();

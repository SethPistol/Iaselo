/* IASELO · Photo des constantes au bloc.
 * Photo de l'écran du moniteur ou d'une impression de tendances → lecture optique locale (Tesseract hébergé par IASELO,
 * exécuté dans le navigateur) → relecture et validation valeur par valeur → saisies « Surveillance » de la feuille d'anesthésie.
 * La photo ne quitte pas l'appareil et n'est pas conservée : seule son empreinte SHA-256 est tracée avec les valeurs. */
(function(root){
'use strict';
const R=root.ConstantesPhoto;
root.createConstantesPhoto=function(ctx){
 const {esc,toast}=ctx;
 let st=null,worker=null,host=null;
 const icon={
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.6"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
 };
 const MODES=[['auto','Détection automatique'],['moniteur','Écran du moniteur'],['tendances','Tendances imprimées']];
 const SOURCE={moniteur:'Photo de l’écran du moniteur',tendances:'Photo des tendances imprimées'};
 const fmt=v=>String(v??'').replace('.',',');

 function open(){
  if(!ctx.canWrite()){toast('Saisie de surveillance non autorisée pour ce profil.');return}
  st={step:'capture',mode:'auto',photoUrl:'',file:null,capturedAt:null,hash:'',rows:[],parsed:null,progress:0,author:ctx.author()||'',error:'',zoom:false};
  host=document.createElement('div');host.className='cp';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-labelledby','cp-title');
  document.body.append(host);document.body.classList.add('cp-open');
  host.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
  draw();host.querySelector('button')?.focus();
 }
 function close(force){
  if(!st)return;
  if(!force&&st.step==='review'&&validatedCount()>0&&!confirm('Fermer sans enregistrer les valeurs validées ?'))return;
  if(st.photoUrl)URL.revokeObjectURL(st.photoUrl);st=null;host?.remove();host=null;document.body.classList.remove('cp-open');
  worker?.terminate().catch(()=>{});worker=null;
 }
 function validatedCount(){return st.rows.filter(r=>r.include).reduce((n,r)=>n+Object.values(r.cells).filter(c=>c.ok&&c.value!=='').length,0)}
 function pendingCount(){return st.rows.filter(r=>r.include).reduce((n,r)=>n+Object.values(r.cells).filter(c=>!c.ok&&c.value!=='').length,0)}

 // ---------- Rendu ----------
 function draw(){
  if(!host||!st)return;
  const head=`<header class="cp-head"><div><p class="cp-eyebrow">FEUILLE D’ANESTHÉSIE · ${esc(ctx.stayLabel())}</p><h2 id="cp-title">Photo des constantes</h2></div><button type="button" class="cp-x" data-cp="close" aria-label="Fermer">×</button></header>`;
  const privacy=`<p class="cp-privacy">${icon.lock}<span>Lecture sur cette tablette : la photo n’est ni envoyée à un service extérieur ni conservée. Seule son empreinte est tracée avec les valeurs que vous validez.</span></p>`;
  let body='';
  if(st.step==='capture')body=`<div class="cp-capture"><div class="cp-modes" role="radiogroup" aria-label="Type de photo">${MODES.map(([k,l])=>`<button type="button" role="radio" aria-checked="${st.mode===k}" class="${st.mode===k?'is-on':''}" data-cp-mode="${k}">${l}</button>`).join('')}</div>
   <div class="cp-shots"><label class="cp-shot cp-shot-main">${icon.camera}<strong>Prendre une photo</strong><span>Cadrez l’écran du moniteur ou la feuille de tendances, sans reflet</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-cp-file></label>
   <label class="cp-shot">${icon.image}<strong>Choisir une image</strong><span>Photo ou capture déjà prise</span><input type="file" accept="image/jpeg,image/png,image/webp" data-cp-file></label></div>
   ${st.error?`<p class="cp-error" role="alert">${icon.warn}${esc(st.error)}</p>`:''}${privacy}</div>`;
  else if(st.step==='reading')body=`<div class="cp-reading"><img src="${esc(st.photoUrl)}" alt="Photo en cours de lecture"><div class="cp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.progress}"><span style="width:${st.progress}%"></span></div><p role="status">Lecture locale de la photo · ${st.progress} %</p></div>`;
  else body=review();
  host.innerHTML=`<div class="cp-sheet">${head}${body}</div>`;
  bind();
 }
 function review(){
  const n=validatedCount(),pending=pendingCount();
  const rows=st.rows.map((row,i)=>rowHTML(row,i)).join('');
  const missing=!st.rows.length?`<div class="cp-empty">${icon.warn}<div><strong>Aucune constante reconnue sur cette photo.</strong><p>Reprenez la photo de plus près, bien de face, ou saisissez les valeurs en regardant la photo.</p></div></div>`:'';
  return `<div class="cp-review"><figure class="cp-photo${st.zoom?' is-zoom':''}"><button type="button" data-cp="zoom" aria-label="${st.zoom?'Réduire':'Agrandir'} la photo"><img src="${esc(st.photoUrl)}" alt="Photo lue, à comparer aux valeurs proposées"></button><figcaption>${esc(SOURCE[st.parsed.mode])} · ${esc(new Date(st.capturedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))} · ${st.zoom?'toucher pour réduire':'toucher pour agrandir'}</figcaption></figure>
   <div class="cp-values"><div class="cp-rule"><strong>Relisez chaque valeur avec la photo.</strong> Touchez ${icon.check} pour valider, ou corrigez le chiffre. Les valeurs non validées ne sont pas enregistrées.</div>${missing}${rows}
    <div class="cp-addrow"><button type="button" class="cp-ghost" data-cp="addrow">+ Ajouter une mesure</button></div><details class="cp-raw"><summary>Texte lu sur la photo</summary><pre>${esc((Array.isArray(st.lines)?st.lines.map(l=>l.text):[String(st.lines||'')]).join('\n').trim()||'Aucun texte')}</pre></details></div></div>
   <footer class="cp-foot"><label class="cp-author">Validé par<input data-cp-author value="${esc(st.author)}" required maxlength="120" placeholder="Nom du praticien"></label>
    <p class="cp-count" role="status"><strong>${n}</strong> valeur${n>1?'s':''} validée${n>1?'s':''}${pending?` · <span class="cp-due">${pending} à relire</span>`:''}</p>
    <div class="cp-actions"><button type="button" class="cp-ghost" data-cp="retake">${icon.camera}Reprendre une photo</button><button type="button" class="cp-primary" data-cp="save" ${n&&st.author.trim()?'':'disabled'}>Enregistrer ${n||''} dans la feuille</button></div></footer>`;
 }
 function rowHTML(row,i){
  const keys=R.VITALS.map(v=>v[0]).filter(k=>row.cells[k]);
  const free=R.VITALS.filter(([k])=>!row.cells[k]);
  const okAll=keys.length&&keys.every(k=>row.cells[k].ok||row.cells[k].value==='');
  return `<section class="cp-row${row.include?'':' is-off'}" data-row="${i}"><div class="cp-row-head">
   <label class="cp-when">Heure de la mesure<input type="datetime-local" data-cp-at="${i}" value="${esc(row.at)}" required></label><span class="cp-from">${esc(row.from)}</span>
   ${row.duplicate?`<span class="cp-chip cp-chip-warn">${icon.warn}Déjà dans la feuille</span>`:''}
   <label class="cp-include"><input type="checkbox" data-cp-include="${i}" ${row.include?'checked':''}> Inclure</label>
   <button type="button" class="cp-ghost cp-okrow" data-cp-okrow="${i}" ${okAll||!row.include?'disabled':''}>${icon.check}Valider les valeurs sans alerte</button></div>
   <div class="cp-grid">${keys.map(k=>cellHTML(row,i,k)).join('')}</div>
   ${row.agent!==undefined&&(row.cells.halogenEnd)?`<label class="cp-agent">Agent halogéné<input data-cp-agent="${i}" value="${esc(row.agent||'')}" maxlength="40" placeholder="à préciser"></label>`:''}
   ${(row.orphans||[]).length?`<div class="cp-orphans"><strong>Lu sans libellé :</strong>${row.orphans.map((o,j)=>`<label class="cp-orphan"><b>${esc(fmt(o))}</b><select data-cp-orphan="${i}:${j}" aria-label="Constante correspondant à ${esc(fmt(o))}"><option value="">C’est…</option>${free.map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></label>`).join('')}<span>ou ignorez-les.</span></div>`:''}
   ${free.length?`<label class="cp-more">Ajouter une constante<select data-cp-add="${i}"><option value="">Choisir…</option>${free.map(([k,l,u])=>`<option value="${k}">${esc(l)} (${esc(u)})</option>`).join('')}</select></label>`:''}
  </section>`;
 }
 function cellHTML(row,i,k){
  const c=row.cells[k],m=R.META[k];
  const level=c.issues.some(x=>x.level==='aberrant')?'aberrant':c.issues.some(x=>x.level==='incertain')?'incertain':c.issues.some(x=>x.level==='cible')?'cible':'';
  const state=c.ok?'is-ok':level==='aberrant'?'is-bad':level==='incertain'?'is-doubt':'';
  const sug=c.issues.find(x=>x.suggestion);
  return `<div class="cp-cell ${state}"><div class="cp-cell-top"><span>${esc(m.label)}</span><small>${esc(m.unit)}</small></div>
   <div class="cp-cell-mid"><input inputmode="decimal" aria-label="${esc(m.label)} (${esc(m.unit)})" data-cp-v="${i}:${k}" value="${esc(fmt(c.value))}"><button type="button" class="cp-ok" data-cp-ok="${i}:${k}" aria-pressed="${c.ok}" aria-label="${c.ok?'Annuler la validation':'Valider'} ${esc(m.label)}" ${c.value===''?'disabled':''}>${icon.check}</button></div>
   <div class="cp-cell-foot">${c.ok?`<em class="cp-tag-ok">${c.corrected?'Corrigée':'Validée'}</em>`:c.value===''?'<em>Vide, non enregistrée</em>':`<em>${c.read!==''&&!c.corrected?'Lu : '+esc(fmt(c.read)):'Saisie manuelle'}</em>`}
   ${c.issues.map(x=>`<span class="cp-issue cp-issue-${x.level}">${x.level==='cible'?'':icon.warn}${esc(x.text)}</span>`).join('')}
   ${sug&&!c.ok?`<button type="button" class="cp-sug" data-cp-sug="${i}:${k}">Corriger en ${esc(fmt(sug.suggestion))} ?</button>`:''}</div></div>`;
 }

 // ---------- Interactions ----------
 function bind(){
  host.querySelectorAll('[data-cp=close]').forEach(b=>b.onclick=()=>close());
  host.querySelectorAll('[data-cp-mode]').forEach(b=>b.onclick=()=>{st.mode=b.dataset.cpMode;draw()});
  host.querySelectorAll('[data-cp-file]').forEach(input=>input.onchange=e=>{const f=e.target.files?.[0];if(f)load(f)});
  const q=s=>host.querySelector(s);
  if(q('[data-cp=zoom]'))q('[data-cp=zoom]').onclick=()=>{st.zoom=!st.zoom;draw()};
  if(q('[data-cp=retake]'))q('[data-cp=retake]').onclick=()=>{if(validatedCount()&&!confirm('Abandonner les valeurs relues et reprendre une photo ?'))return;reset()};
  if(q('[data-cp=addrow]'))q('[data-cp=addrow]').onclick=()=>{const t=R.localInput(new Date());st.rows.push({at:t,from:'saisie manuelle',include:true,duplicate:false,agent:'',cells:{}});draw()};
  if(q('[data-cp-author]'))q('[data-cp-author]').oninput=e=>{st.author=e.target.value;const b=q('[data-cp=save]');if(b)b.disabled=!(validatedCount()&&st.author.trim())};
  if(q('[data-cp=save]'))q('[data-cp=save]').onclick=save;
  host.querySelectorAll('[data-cp-at]').forEach(el=>el.onchange=()=>{const r=st.rows[+el.dataset.cpAt];r.at=el.value;r.from='heure corrigée';dup(r);draw()});
  host.querySelectorAll('[data-cp-include]').forEach(el=>el.onchange=()=>{st.rows[+el.dataset.cpInclude].include=el.checked;draw()});
  host.querySelectorAll('[data-cp-agent]').forEach(el=>el.oninput=()=>{st.rows[+el.dataset.cpAgent].agent=el.value});
  host.querySelectorAll('[data-cp-okrow]').forEach(b=>b.onclick=()=>{const r=st.rows[+b.dataset.cpOkrow];for(const c of Object.values(r.cells))if(c.value!==''&&!R.blocking(c.issues))c.ok=true;draw();const left=Object.values(r.cells).filter(c=>!c.ok&&c.value!=='').length;if(left)toast(left+' valeur'+(left>1?'s':'')+' avec alerte : à valider une par une ou à corriger.')});
  host.querySelectorAll('[data-cp-ok]').forEach(b=>b.onclick=()=>{const [i,k]=b.dataset.cpOk.split(':');const c=st.rows[+i].cells[k];if(c.value==='')return;c.ok=!c.ok;draw();focusCell(i,k,'ok')});
  host.querySelectorAll('[data-cp-sug]').forEach(b=>b.onclick=()=>{const [i,k]=b.dataset.cpSug.split(':');const c=st.rows[+i].cells[k];const s=c.issues.find(x=>x.suggestion);if(s)edit(+i,k,s.suggestion);draw();focusCell(i,k,'v')});
  host.querySelectorAll('[data-cp-orphan]').forEach(sel=>sel.onchange=()=>{const [i,j]=sel.dataset.cpOrphan.split(':').map(Number),k=sel.value;if(!k)return;const row=st.rows[i],raw=row.orphans[j];const pr=String(raw).match(/(\d{2,3})\s*\/\s*(\d{2,3})(?:\s*\(\s*(\d{2,3}))?/);
   const put=(key,v)=>{if(!row.cells[key])row.cells[key]={value:v,read:v,raw,conf:null,fixed:false,ok:false,corrected:false,issues:[]}};
   if(pr&&['sbp','dbp','map'].includes(k)){put('sbp',pr[1]);put('dbp',pr[2]);if(pr[3])put('map',pr[3])}else put(k,String(raw).replace(',','.'));
   row.orphans.splice(j,1);recheck(row);dup(row);draw();focusCell(i,k,'ok')});
  host.querySelectorAll('[data-cp-add]').forEach(sel=>sel.onchange=()=>{const i=+sel.dataset.cpAdd,k=sel.value;if(!k)return;st.rows[i].cells[k]={value:'',read:'',conf:null,fixed:false,ok:false,corrected:true,issues:[]};draw();focusCell(i,k,'v')});
  host.querySelectorAll('[data-cp-v]').forEach(el=>{el.onchange=()=>{const [i,k]=el.dataset.cpV.split(':');edit(+i,k,el.value.trim().replace(',','.'));draw();focusCell(i,k,'ok')}});
 }
 function focusCell(i,k,what){host?.querySelector(what==='ok'?`[data-cp-ok="${i}:${k}"]`:`[data-cp-v="${i}:${k}"]`)?.focus()}
 // Une valeur corrigée à la main est validée par le praticien, sauf si elle reste aberrante : il faut alors la confirmer explicitement.
 function edit(i,k,value){
  const row=st.rows[i],c=row.cells[k];
  c.value=value;c.corrected=value!==c.read;c.fixed=false;c.conf=null;
  recheck(row);c.ok=value!==''&&!c.issues.some(x=>x.level==='aberrant');
  dup(row);
 }
 function recheck(row){
  const iss=R.rowIssues(Object.fromEntries(Object.entries(row.cells).map(([k,c])=>[k,{value:c.value,raw:c.raw,conf:c.corrected?null:c.conf,fixed:c.corrected?false:c.fixed}])));
  for(const [k,c] of Object.entries(row.cells))c.issues=iss[k]||[];
 }
 function dup(row){const vals=Object.fromEntries(Object.entries(row.cells).filter(([,c])=>c.value!=='').map(([k,c])=>[k,c.value]));row.duplicate=R.isDuplicate(row.at,vals,ctx.records());if(row.duplicate)row.include=false}
 function reset(){if(st.photoUrl)URL.revokeObjectURL(st.photoUrl);Object.assign(st,{step:'capture',photoUrl:'',file:null,rows:[],parsed:null,progress:0,error:'',zoom:false});draw()}

 // ---------- Lecture ----------
 async function load(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){st.error='Choisissez une image JPEG, PNG ou WebP de moins de 15 Mo.';draw();return}
  st.file=file;st.photoUrl=URL.createObjectURL(file);st.error='';
  // Heure de la photo : celle du fichier si elle est récente (appareil photo), sinon maintenant.
  const lm=file.lastModified;st.capturedAt=lm&&Math.abs(Date.now()-lm)<12*3600000?lm:Date.now();
  st.step='reading';st.progress=0;draw();
  try{
   const buf=await file.arrayBuffer();
   st.hash=crypto.subtle?[...new Uint8Array(await crypto.subtle.digest('SHA-256',buf))].map(b=>b.toString(16).padStart(2,'0')).join(''):'';
   const canvas=await prepare(file);
   let lines=await recognize(canvas,st.mode==='moniteur'?'11':'6');
   let parsed=R.parse(lines,st.mode==='auto'?undefined:st.mode,lines.words);
   const count=p=>p.rows.reduce((n,r)=>n+Object.keys(r.values).length,0);
   if(count(parsed)<3){const again=await recognize(canvas,st.mode==='moniteur'?'6':'11');const alt=R.parse(again,st.mode==='auto'?undefined:st.mode,again.words);if(count(alt)>count(parsed)){parsed=alt;lines=again}}
   if(!st)return;
   st.lines=lines;st.parsed=parsed;st.rows=toRows(parsed);st.step='review';
  }catch(e){if(!st)return;st.step='capture';st.error=(e&&e.message)||'Lecture impossible. Réessayez ou saisissez les constantes à la main.';if(st.photoUrl)URL.revokeObjectURL(st.photoUrl);st.photoUrl=''}
  draw();
 }
 function toRows(parsed){
  return parsed.rows.map(r=>{
   let at,from;
   if(parsed.mode==='tendances'){const d=R.stamp(r.time,st.capturedAt);at=d?R.localInput(d):R.localInput(st.capturedAt);from=d?'heure imprimée':'heure de la photo'}
   else ({at,from}=R.monitorTime(r.time,st.capturedAt));
   const cells={};for(const [k,v] of Object.entries(r.values))cells[k]={value:v.value,read:v.value,raw:v.raw,conf:v.conf,fixed:v.fixed,ok:false,corrected:false,issues:[]};
   const row={at,from,include:true,duplicate:false,agent:r.agent||'',cells,issues:r.issues||[],orphans:[...(r.orphans||[])]};recheck(row);dup(row);return row;
  });
 }
 // Prétraitement : niveaux de gris, inversion des écrans sombres (chiffres clairs sur fond noir), étirement du contraste.
 async function prepare(file){
  const bmp=await createImageBitmap(file);const scale=Math.min(2,2400/Math.max(bmp.width,bmp.height));
  const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*scale);cv.height=Math.round(bmp.height*scale);
  const g=cv.getContext('2d',{willReadFrequently:true});g.drawImage(bmp,0,0,cv.width,cv.height);bmp.close?.();
  const img=g.getImageData(0,0,cv.width,cv.height),d=img.data;let sum=0;const lum=new Float32Array(d.length/4);
  for(let i=0,j=0;i<d.length;i+=4,j++){const y=Math.max(d[i],d[i+1],d[i+2])*.6+(.299*d[i]+.587*d[i+1]+.114*d[i+2])*.4;lum[j]=y;sum+=y}
  const dark=sum/lum.length<110;const hist=new Uint32Array(256);for(const y of lum)hist[Math.min(255,y|0)]++;
  const pct=p=>{let acc=0;const target=lum.length*p;for(let i=0;i<256;i++){acc+=hist[i];if(acc>=target)return i}return 255};
  const lo=pct(.02),hi=Math.max(lo+1,pct(.98));
  for(let i=0,j=0;i<d.length;i+=4,j++){let y=(lum[j]-lo)*255/(hi-lo);y=Math.max(0,Math.min(255,y));if(dark)y=255-y;d[i]=d[i+1]=d[i+2]=y}
  g.putImageData(img,0,0);return cv;
 }
 async function engine(){
  if(worker)return worker;
  if(!root.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Moteur de lecture indisponible sur ce poste.'));document.head.append(s)});
  worker=await root.Tesseract.createWorker('fra',1,{workerPath:location.origin+'/ocr/worker.min.js',corePath:location.origin+'/ocr/tesseract-core-lstm.wasm.js',langPath:location.origin+'/ocr',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(!st||m.status!=='recognizing text')return;st.progress=Math.round((m.progress||0)*100);const bar=host?.querySelector('.cp-bar span'),txt=host?.querySelector('.cp-reading [role=status]');if(bar)bar.style.width=st.progress+'%';if(txt)txt.textContent='Lecture locale de la photo · '+st.progress+' %'}});
  return worker;
 }
 async function recognize(canvas,psm){
  const w=await engine();await w.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1'});
  const res=await w.recognize(canvas,{},{text:true,blocks:true});
  const lines=[],words=[];for(const b of res.data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[]){lines.push({text:l.text,conf:l.confidence});for(const w of l.words||[])words.push({text:w.text,conf:w.confidence,bbox:w.bbox})}
  const out=lines.length?lines:String(res.data.text||'').split(/\r?\n/).map(t=>({text:t,conf:null}));out.words=words;return out;
 }

 // ---------- Enregistrement ----------
 function save(){
  const author=st.author.trim();if(!author){toast('Indiquez qui valide les valeurs.');return}
  const created=new Date().toISOString(),records=[];let values=0;
  for(const row of st.rows){
   if(!row.include)continue;
   const ok=Object.entries(row.cells).filter(([,c])=>c.ok&&c.value!=='');
   if(!ok.length)continue;
   if(!row.at||!Number.isFinite(new Date(row.at).getTime())){toast('Heure de mesure à vérifier.');return}
   const v=Object.fromEntries(ok.map(([k,c])=>[k,String(c.value)]));
   if(row.cells.halogenEnd?.ok&&row.agent?.trim())v.halogenAgent=row.agent.trim();
   v.source=SOURCE[st.parsed.mode]+' · relue et validée';
   records.push({id:'PERI-'+crypto.randomUUID(),kind:'Surveillance',at:row.at,author,created,role:ctx.role(),values:v,
    photo:{source:'photo',type:st.parsed.mode,sha256:st.hash,capturedAt:new Date(st.capturedAt).toISOString(),engine:'Lecture optique locale (navigateur)',stored:false,validatedBy:author,validatedAt:created,
     timeFrom:row.from,items:ok.map(([k,c])=>({key:k,read:c.read,value:String(c.value),status:c.corrected?(c.read===''?'saisie':'corrigée'):'validée',alerts:c.issues.map(x=>x.text)})),
     discarded:Object.entries(row.cells).filter(([,c])=>!c.ok&&c.value!=='').map(([k,c])=>({key:k,read:c.read}))}});
   values+=ok.length;
  }
  if(!records.length){toast('Aucune valeur validée à enregistrer.');return}
  ctx.add(records,{values,mode:st.parsed.mode,hash:st.hash});
  close(true);
  toast(values+' valeur'+(values>1?'s':'')+' ajoutée'+(values>1?'s':'')+' à la feuille · source : photo');
 }
 return {open,close,_state:()=>st};
};
})(typeof window!=='undefined'?window:globalThis);

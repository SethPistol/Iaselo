/* IASELO · « Lire une ordonnance » dans la consultation d'anesthésie (27/11/2026, veille n° 3, manque n° 2).
   Photo (appareil de la tablette), image ou PDF de l'ordonnance, ou texte collé : lecture optique dans le navigateur
   (Tesseract hébergé par IASELO, PDF texte lu directement), rattachement à la BDPM, puis relecture ligne par ligne.
   L'image n'est ni envoyée ni conservée. Seules les lignes cochées par l'anesthésiste entrent dans le traitement
   habituel (sans rien effacer), avec une trace (qui, quand, nombre de lignes, confiance) ; le contrôle de sécurité du
   traitement (interactions, posologies, terrain) s'applique ensuite comme pour une saisie manuelle.
   Règles : dist/ordonnance-lecture-regles.js. */
(function(root){
'use strict';
const O=()=>root.IaseloOrdonnance;
root.createOrdonnanceLecture=function(ctx){
 const {esc,toast}=ctx;
 let ocr=null,pdfjs=null,catalogue=null,dlg=null,etat=null;
 async function specialites(){
  if(catalogue)return catalogue;
  const r=await fetch('assets/medicaments-bdpm.json',{cache:'no-cache'});if(!r.ok)throw Error('Base des médicaments indisponible.');
  const d=await r.json();catalogue=d.specialties.map(([cis,name,form,routes,a,m,substances])=>({cis,name,substances,active:a==='Autorisation active'&&m==='Commercialisée'}));return catalogue;
 }
 async function lireImage(source){
  if(!ocr){
   if(!root.Tesseract)await new Promise((ok,ko)=>{const s=document.createElement('script');s.src='/ocr/tesseract.min.js';s.onload=ok;s.onerror=()=>ko(Error('Lecture optique indisponible sur ce poste.'));document.head.append(s)});
   ocr=await root.Tesseract.createWorker('fra',1,{workerPath:location.origin+'/ocr/worker.min.js',corePath:location.origin+'/ocr/tesseract-core-lstm.wasm.js',langPath:location.origin+'/ocr',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(m.status==='recognizing text')statut('Lecture locale de l’ordonnance · '+Math.round((m.progress||0)*100)+' %')}});
  }
  return String((await ocr.recognize(source)).data.text||'');
 }
 // Image → canevas en niveaux de gris contrasté (meilleure lecture des ordonnances photographiées).
 async function canevas(file){
  const img=await createImageBitmap(file),k=Math.min(1,2400/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);
  const g=cv.getContext('2d');g.drawImage(img,0,0,cv.width,cv.height);const im=g.getImageData(0,0,cv.width,cv.height),d=im.data;
  for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>170?255:y<90?0:(y-90)*255/80;d[i]=d[i+1]=d[i+2]=v}
  g.putImageData(im,0,0);return cv;
 }
 async function lirePdf(file){
  if(!pdfjs){pdfjs=await import('/vendor/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs'}
  const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,wasmUrl:'/vendor/pdfjs/wasm/',enableXfa:false}).promise,out=[];
  for(let i=1;i<=Math.min(doc.numPages,4);i++){
   const pg=await doc.getPage(i),items=(await pg.getTextContent()).items;
   // Regroupe les fragments par ligne (même ordonnée).
   const lignes=new Map();for(const it of items){const y=Math.round(it.transform[5]);lignes.set(y,(lignes.get(y)||'')+it.str+(it.hasEOL?'':' '))}
   let t=[...lignes.entries()].sort((a,b)=>b[0]-a[0]).map(([,x])=>x.trim()).join('\n');
   if(t.replace(/\s/g,'').length<40){statut('PDF scanné : lecture optique de la page '+i+'…');const vp=pg.getViewport({scale:2.2}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp,canvas:cv}).promise;t=await lireImage(cv)}
   out.push(t);
  }
  return out.join('\n');
 }
 function statut(t){const s=dlg?.querySelector('[role=status]');if(s)s.textContent=t}
 function ouvrir(stay){
  etat={stay,lignes:[],apercu:'',texte:''};
  dlg?.remove();dlg=document.createElement('dialog');dlg.className='ol-dialog';document.body.append(dlg);
  dlg.innerHTML=`<div class="dialoghead"><h2>Lire une ordonnance</h2><button type="button" class="icon" data-ol="fermer" aria-label="Fermer">×</button></div>
  <p class="muted">Photo, image ou PDF de l’ordonnance du patient. La lecture se fait sur ce poste : l’image n’est ni envoyée ni conservée. Vous validez chaque ligne avant qu’elle entre dans le traitement habituel.</p>
  <div class="ol-sources"><label class="primary ol-file">Prendre une photo<input type="file" accept="image/*" capture="environment" data-ol-file hidden></label><label class="secondary ol-file">Image ou PDF<input type="file" accept="image/*,application/pdf" data-ol-file hidden></label><button type="button" class="textbutton" data-ol="coller">Coller le texte</button></div>
  <div data-ol-coller hidden><textarea rows="6" placeholder="Collez ici le texte de l’ordonnance (ordonnance numérique, courrier)…"></textarea><button type="button" class="secondary" data-ol="analyser">Analyser le texte</button></div>
  <p role="status" class="muted" aria-live="polite"></p><div data-ol-resultat></div>`;
  dlg.querySelector('[data-ol="fermer"]').onclick=()=>dlg.close();
  dlg.querySelector('[data-ol="coller"]').onclick=()=>{dlg.querySelector('[data-ol-coller]').hidden=false};
  dlg.querySelector('[data-ol="analyser"]').onclick=()=>analyser(dlg.querySelector('[data-ol-coller] textarea').value,'Texte collé');
  dlg.querySelectorAll('[data-ol-file]').forEach(i=>i.onchange=async()=>{const f=i.files?.[0];if(!f)return;i.value='';
   try{statut('Lecture en cours…');let texte;
    if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){texte=await lirePdf(f);etat.apercu=''}
    else{const cv=await canevas(f);etat.apercu=URL.createObjectURL(f);texte=await lireImage(cv)}
    analyser(texte,f.type==='application/pdf'?'PDF':'Photo');
   }catch(e){statut('Lecture impossible : '+e.message)}});
  dlg.showModal();
 }
 async function analyser(texte,source){
  statut('Rattachement à la base publique des médicaments…');
  try{etat.lignes=O().lire(texte,await specialites()).map(l=>({...l,ok:l.confiance==='vert'}));etat.texte=texte;etat.source=source}catch(e){statut(e.message);return}
  statut(etat.lignes.length?etat.lignes.length+' ligne(s) détectée(s). Vert : lecture sûre, cochée ; orange et rouge : à vérifier puis cocher.':'Aucun médicament détecté : reprenez une photo plus nette, à plat et bien éclairée, ou collez le texte.');
  dessiner();
 }
 function securite(l){const S=root.IaseloSecuriteTraitement;if(!S)return '';const ids=S.molecules(l.nom+' '+(l.substances||[]).join(' '),l.substances||[]);return ids.length?'<span class="ol-sec ok">pris en compte par le contrôle de sécurité</span>':'<span class="ol-sec">hors base de règles du contrôle</span>'}
 function dessiner(){
  const host=dlg.querySelector('[data-ol-resultat]');if(!etat.lignes.length){host.innerHTML='';return}
  host.innerHTML=`<div class="ol-grille">${etat.apercu?`<figure class="ol-apercu"><img src="${esc(etat.apercu)}" alt="Ordonnance photographiée"><figcaption>Photo (non conservée)</figcaption></figure>`:`<details class="ol-apercu"><summary>Texte lu</summary><pre>${esc(etat.texte)}</pre></details>`}
  <div class="ol-lignes">${etat.lignes.map((l,i)=>`<fieldset class="ol-ligne ${l.confiance}" data-i="${i}"><legend><label><input type="checkbox" data-k="ok" ${l.ok?'checked':''}> <span class="ol-pastille ${l.confiance}">${esc(O().COULEURS[l.confiance])}</span></label> <small class="muted">lu : « ${esc(l.lu)} »</small></legend>
   <div class="formgrid"><label>Médicament<input data-k="nom" data-medicament value="${esc(l.nom)}"></label><label>Dosage<input data-k="dose" value="${esc(l.dose)}"></label><label class="wide">Posologie<input data-k="posologie" value="${esc(l.posologie)}"></label></div>
   ${l.raison?`<p class="ol-raison">${esc(l.raison)}</p>`:''}${l.specialite?`<p class="muted ol-bdpm">BDPM : ${esc(l.specialite)} (CIS ${esc(l.cis)}) · ${securite(l)}</p>`:''}</fieldset>`).join('')}</div></div>
  <div class="actions"><button type="button" class="primary" data-ol="ajouter">Ajouter les lignes cochées au traitement habituel</button><button type="button" class="secondary" data-ol="fermer2">Annuler</button></div>`;
  host.querySelectorAll('.ol-ligne').forEach(f=>{const l=etat.lignes[f.dataset.i];f.querySelectorAll('[data-k]').forEach(inp=>inp.oninput=inp.onchange=()=>{if(inp.dataset.k==='ok')l.ok=inp.checked;else{l[inp.dataset.k]=inp.value;l.modifiee=true}})});
  host.querySelector('[data-ol="fermer2"]').onclick=()=>dlg.close();
  host.querySelector('[data-ol="ajouter"]').onclick=()=>ajouter();
 }
 function ajouter(){
  const stay=etat.stay,c=stay.consult,choisies=etat.lignes.filter(l=>l.ok&&String(l.nom).trim());
  if(!choisies.length){toast('Cochez au moins une ligne vérifiée.');return}
  if(c.validated){toast('Consultation validée : ouvrez une révision avant d’ajouter des traitements.');return}
  c.cpa??={};const f=O().fusionnerTexte(c.cpa.ttt_habituel,choisies);c.cpa.ttt_habituel=f.texte;
  const quand=new Date().toLocaleDateString('fr-FR'),par=ctx.medecin()||'Anesthésiste';
  const rows=c.medicationRows??=[],noms=new Set(rows.filter(m=>!m.removed).map(m=>O().fold(m.name).split(' ')[0]));
  for(const l of choisies){const k=O().fold(l.nom).split(' ')[0];if(noms.has(k))continue;noms.add(k);
   rows.push({id:'MED-'+crypto.randomUUID(),name:[l.nom,l.dose&&!O().fold(l.nom).includes(O().fold(l.dose))?l.dose:''].filter(Boolean).join(' '),dose:l.dose,frequency:l.posologie,route:'',indication:'',lastDose:'',verification:'Lu sur ordonnance, vérifié par '+par,source:'Ordonnance ('+(etat.source||'photo').toLowerCase()+') lue le '+quand,decision:'À déterminer',stopPlan:'',resumePlan:'',instructions:'',cis:l.cis||'',fromOrdonnance:true})}
  (c.ordonnancesLues??=[]).push({at:new Date().toISOString(),par,source:etat.source,lignes:choisies.map(l=>({nom:l.nom,dose:l.dose,posologie:l.posologie,cis:l.cis,confiance:l.confiance,modifiee:!!l.modifiee})),ecartees:etat.lignes.length-choisies.length});
  ctx.deriver?.(stay);
  ctx.event('Ordonnance lue ('+(etat.source||'photo')+') : '+choisies.length+' médicament(s) vérifié(s), '+f.ajoutees+' ajouté(s) au traitement habituel','Consultation');
  dlg.close();toast(f.ajoutees+' médicament(s) ajouté(s) au traitement habituel · contrôle de sécurité à jour');ctx.rerender();
 }
 return {
  bouton(container,stay,read){if(!container||read||container.querySelector('[data-ol-ouvrir]'))return;const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.olOuvrir='1';b.textContent='Lire une ordonnance';b.onclick=()=>ouvrir(stay);container.prepend(b)},
  ouvrir
 };
};
})(typeof self!=='undefined'?self:this);

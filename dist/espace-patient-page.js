// Espace patient (lien personnel reçu par SMS ou e-mail) : consentement d'anesthésie à signer et dépôt de documents.
// Aucun code du dossier professionnel n'est chargé. La date de naissance est demandée avant tout affichage,
// puis renvoyée à chaque action (elle n'est conservée qu'en mémoire, jamais dans le navigateur).
(function(){
'use strict';
const R=window.IaseloEspacePatient,$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
// Le lien ne doit rester ni dans l'historique ni dans l'adresse copiée.
if(token)history.replaceState(null,'',location.pathname);
const host=$('#workspace');let birthDate='',state=null;
const toast=t=>{const el=$('#toast');if(!el)return;el.textContent=t;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>{el.style.display='none'},4200)};
const fmt=iso=>iso?new Date(iso).toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'}):'';
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
async function call(path,data){const r=await fetch('/api/espace-patient/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,birthDate,...data})});const j=await r.json().catch(()=>({error:'Service indisponible. Réessayez plus tard.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Service indisponible.'),{status:r.status,data:j});return j}
function closed(message){panel(`<h2>Lien indisponible</h2><p>${esc(message)}</p><p>Si vous avez besoin d’aide, appelez la clinique.</p>`)}
function ask(etab,purpose,error){
 panel(`<h2>Vérification de votre identité</h2><p>${esc(etab||'La clinique')} ${purpose==='consentement'?'vous a transmis un document à lire et à signer avant votre intervention':'vous propose de transmettre vos documents avant votre consultation'}. Pour continuer, indiquez votre date de naissance.</p>
 <form id="dc-dob" class="pp-dob"><label>Date de naissance<input type="date" name="dob" required autocomplete="bday"></label>${error?`<p class="pp-err" role="alert">${esc(error)}</p>`:''}<button class="primary">Continuer</button></form>
 <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#dc-dob').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;birthDate=e.target.dob.value;
  try{state=await call('view',{});render()}
  catch(err){if(err.status===410)closed(err.message);else ask(etab,purpose,err.message)}};
 $('#dc-dob [name=dob]').focus();
}

/* ---------- Consentement ---------- */
function consentHTML(c){
 const F=R.FORMULAIRE,f=c.fiche,pa=f.patient;
 if(c.recu)return `<section class="dc-pt-card is-done" id="dc-consent"><h2>Consentement d’anesthésie</h2>
  <p class="dc-pt-ok">✓ ${c.recu.mode==='depot'?'Document signé reçu le '+esc(fmt(c.recu.at))+'. L’équipe d’anesthésie va le vérifier.':'Signé le '+esc(fmt(c.recu.at))+'. Merci, votre réponse a bien été transmise à l’équipe d’anesthésie.'}</p>
  <p class="sessionnote">Pour modifier une réponse ou retirer votre consentement, appelez la clinique : c’est possible à tout moment.</p>
  ${c.recu.mode==='signature'?`<div class="v-actions"><button type="button" class="secondary" id="dc-print-copy">Imprimer ou enregistrer ma copie</button></div>`:''}</section>`;
 return `<section class="dc-pt-card" id="dc-consent"><p class="dc-pt-kicker">À faire avant votre intervention</p><h2>Consentement d’anesthésie</h2>
  ${c.refus?`<p class="pp-err" role="alert">Le document que vous avez envoyé n’a pas pu être accepté : ${esc(c.refus.note)}. Vous pouvez signer ci-dessous ou déposer un autre document.</p>`:''}
  <p>Lisez l’information ci-dessous, puis répondez à chaque ligne. Vous pouvez demander des précisions ou un délai de réflexion à votre anesthésiste.</p>
  <details class="dc-pt-info" open><summary>${esc(F.information.titre)} <small>${esc(F.information.sousTitre)}</small></summary>
   ${F.information.sections.map(([t,x])=>`<h3>${esc(t)}</h3><p>${esc(x)}</p>`).join('')}
   <p><a href="${esc(F.sfar)}" target="_blank" rel="noopener noreferrer">Consulter la fiche officielle intégrale de la SFAR</a></p></details>
  <form id="dc-sign" novalidate>
   <h3 class="dc-pt-h">${esc(F.consentement.titre)}</h3><p class="dc-pt-sub">${esc(F.consentement.sousTitre)}</p>
   <dl class="dc-pt-fiche"><div><dt>Nom de naissance et prénom</dt><dd>${esc([String(pa.nom).toUpperCase(),pa.prenom].join(' '))}</dd></div><div><dt>Né(e) le</dt><dd>${esc(R.fmtD(pa.naissance))}</dd></div><div><dt>Intervention prévue</dt><dd>${esc(f.intervention)}</dd></div><div><dt>Date prévue</dt><dd>${esc(R.fmtD(f.datePrevue)||'À confirmer')}</dd></div><div><dt>Consultation d’anesthésie du</dt><dd>${esc(R.fmtD(f.consultation.date))}</dd></div><div><dt>Avec le Docteur</dt><dd>${esc(f.consultation.medecin)}</dd></div></dl>
   <p class="dc-pt-consigne">${esc(F.consentement.consigne)}</p>
   <ol class="dc-pt-q">${R.QUESTIONS.map(([id,t],i)=>`<li id="q-${id}"><p>${esc(t)}</p><div class="dc-pt-yn" role="radiogroup" aria-label="Ligne ${i+1}"><label><input type="radio" name="${id}" value="oui"> Oui</label><label><input type="radio" name="${id}" value="non"> Non</label></div></li>`).join('')}</ol>
   <p class="dc-pt-rappel">${esc(F.consentement.rappel)}</p>
   <label class="dc-pt-l">Réserves ou précisions <small>(facultatif)</small><textarea name="reserves" rows="3" maxlength="2000"></textarea></label>
   <div class="dc-pt-2"><label class="dc-pt-l">Lieu<input name="lieu" maxlength="120" placeholder="Ex. Paris" autocomplete="address-level2"></label><label class="dc-pt-l">Vos nom et prénom<input name="signataire" maxlength="120" required autocomplete="name" value="${esc([pa.prenom,String(pa.nom).toUpperCase()].join(' '))}"></label></div>
   <div class="dc-pt-l">Signature <small>(facultative, avec le doigt ou la souris)</small><canvas id="dc-pad" width="600" height="180" aria-label="Zone de signature"></canvas><button type="button" class="dc-link" id="dc-pad-clear">Effacer la signature</button></div>
   <label class="dc-pt-cert"><input type="checkbox" name="certifie"> <span>Je certifie être la personne nommée ci-dessus, avoir lu l’information sur l’anesthésie et donner les réponses ci-dessus. La date et l’heure seront ajoutées automatiquement.</span></label>
   <p class="pp-err" id="dc-sign-err" role="alert" hidden></p>
   <button class="primary dc-pt-big" type="submit">Signer et envoyer</button>
  </form>
  <details class="dc-pt-alt"><summary>Vous préférez signer sur papier ?</summary>
   <p>Imprimez le formulaire, cochez vos réponses, signez-le, puis prenez les deux pages en photo (ou scannez-les en PDF) et déposez-les ici. Vous pouvez aussi l’apporter le jour de l’intervention, mais l’équipe doit l’avoir reçu avant votre passage au bloc.</p>
   <div class="v-actions"><button type="button" class="secondary" id="dc-print-blank">Imprimer le formulaire</button></div>
   <form id="dc-depot-cons" class="dc-pt-up"><label class="dc-pt-l">Formulaire signé (PDF ou photo)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required></label><button class="secondary" type="submit">Déposer le formulaire signé</button></form>
  </details></section>`;
}
function pad(){
 const cv=$('#dc-pad');if(!cv)return ()=>'';
 const g=cv.getContext('2d');g.lineWidth=2.6;g.lineCap='round';g.lineJoin='round';g.strokeStyle='#14213d';let drawing=false,used=false;
 const pt=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
 cv.addEventListener('pointerdown',e=>{drawing=true;used=true;try{cv.setPointerCapture(e.pointerId)}catch{}const [x,y]=pt(e);g.beginPath();g.moveTo(x,y)});
 cv.addEventListener('pointermove',e=>{if(!drawing)return;const [x,y]=pt(e);g.lineTo(x,y);g.stroke()});
 const stop=()=>{drawing=false};cv.addEventListener('pointerup',stop);cv.addEventListener('pointercancel',stop);
 $('#dc-pad-clear').onclick=()=>{g.clearRect(0,0,cv.width,cv.height);used=false};
 return ()=>used?cv.toDataURL('image/png'):'';
}
function printDoc(c,r){
 const box=document.createElement('div');box.id='dc-print';box.innerHTML=R.documentHTML(c.fiche,r,{mode:r?'signature':'',empreinte:r?.empreinte||''});
 document.body.append(box);document.body.classList.add('dc-printing');
 const done=()=>{document.body.classList.remove('dc-printing');box.remove();window.removeEventListener('afterprint',done)};
 window.addEventListener('afterprint',done);setTimeout(()=>{try{window.print()}finally{setTimeout(done,500)}},50);
}

/* ---------- Documents ---------- */
function docsHTML(d){
 const L=d.limites||R.LIMITES,list=d.documents||[];
 return `<section class="dc-pt-card" id="dc-docs"><p class="dc-pt-kicker">Jusqu’au lendemain de votre intervention</p><h2>Mes documents</h2>
  ${d.ouvert?`<p>Transmettez ici vos documents utiles : prise de sang, ordonnances, courriers de vos médecins, comptes rendus, carte de groupe sanguin. Ils sont rangés directement dans votre dossier à la clinique.</p>
  <form id="dc-up" class="dc-pt-up" novalidate>
   <label class="dc-pt-l">Type de document<select name="categorie" required><option value="">Choisir</option>${R.CATEGORIES.map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
   <label class="dc-pt-l">Fichier <small>(PDF, photo JPEG ou PNG · 10 Mo maximum)</small><input type="file" name="file" accept="application/pdf,image/jpeg,image/png" multiple required></label>
   <label class="dc-pt-l">Commentaire pour l’équipe <small>(facultatif)</small><input name="commentaire" maxlength="${L.commentaire}" placeholder="Ex. bilan du 18 novembre"></label>
   <p class="pp-err" id="dc-up-err" role="alert" hidden></p>
   <button class="primary dc-pt-big" type="submit">Envoyer</button></form>
  <p class="sessionnote">Photographiez chaque page à plat, bien éclairée et lisible. ${L.nombre} documents au maximum. N’envoyez pas de pièce d’identité ou de carte Vitale ici : présentez-les à l’accueil.</p>`
  :`<p>Le dépôt en ligne est fermé depuis le lendemain de votre intervention. Pour transmettre un document, contactez la clinique.</p>`}
  ${list.length?`<h3 class="dc-pt-h3">Déjà transmis (${list.length})</h3><ul class="dc-pt-list">${list.map(x=>`<li><b>${esc(x.nom)}</b><span>${esc(R.CATEGORIE[x.categorie]||'Document')} · ${esc(R.taille(x.taille))} · le ${esc(fmt(x.recuLe))}</span></li>`).join('')}</ul>`:''}
 </section>`;
}
async function sendFile(file,{kind,categorie='',commentaire=''}){
 const head=new Uint8Array(await file.slice(0,8).arrayBuffer()),type=R.typeReel(head);
 if(!type)throw new Error('« '+file.name+' » : format non accepté (PDF, JPEG ou PNG).');
 if(file.size>R.LIMITES.fichier)throw new Error('« '+file.name+' » : fichier trop lourd (10 Mo au maximum).');
 const r=await fetch('/api/espace-patient/upload?kind='+kind+(categorie?'&categorie='+encodeURIComponent(categorie):''),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/octet-stream','X-Acces':token,'X-Naissance':birthDate,'X-Nom':encodeURIComponent(file.name),'X-Commentaire':encodeURIComponent(commentaire)},body:file});
 const j=await r.json().catch(()=>({error:'Service indisponible. Réessayez plus tard.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Envoi impossible.'),{status:r.status});return j;
}

function render(){
 const s=state;document.title='Mon espace patient · '+(s.etablissement||'');
 const consent=s.consentement?consentHTML(s.consentement):'',docs=docsHTML(s.depot);
 host.innerHTML=`<section class="panel dc-pt"><div class="content"><p class="dc-pt-intro">${esc(s.etablissement)} · lien valable jusqu’au ${esc(new Date(s.expiresAt).toLocaleDateString('fr-FR'))}</p>${s.purpose==='consentement'?consent+docs:docs+consent}</div></section>`;
 const fail=(err)=>{if(err.status===410)closed(err.message);else toast(err.message)};
 const sign=$('#dc-sign');
 if(sign){const signature=pad();
  sign.onsubmit=async e=>{e.preventDefault();const f=sign,err=$('#dc-sign-err');err.hidden=true;
   const reponses=Object.fromEntries(R.QUESTIONS.map(([id])=>[id,f.querySelector(`[name=${id}]:checked`)?.value||'']));
   const data={reponses,reserves:f.reserves.value,lieu:f.lieu.value,signataire:f.signataire.value,certifie:f.certifie.checked,signature:signature()};
   const v=R.validerReponse(data);
   f.querySelectorAll('.dc-pt-q li').forEach(li=>li.classList.toggle('is-missing',v.manquantes.includes(li.id.slice(2))));
   if(!v.ok){err.textContent=v.errors.join(' ');err.hidden=false;(f.querySelector('.is-missing')||err).scrollIntoView({behavior:'smooth',block:'center'});return}
   const non=R.nonCoches(v.reponse).length;
   if(non&&!confirm('Vous avez répondu « Non » à '+non+' ligne'+(non>1?'s':'')+'. L’équipe d’anesthésie vous recontactera avant l’intervention. Envoyer quand même ?'))return;
   const b=f.querySelector('[type=submit]');b.disabled=true;b.textContent='Envoi en cours…';
   try{state=await call('consentement',data);render();toast('Consentement envoyé. Merci.');$('#dc-consent')?.scrollIntoView({block:'start'})}catch(x){b.disabled=false;b.textContent='Signer et envoyer';if(x.status===410)return closed(x.message);err.textContent=x.message;err.hidden=false}};
 }
 const pb=$('#dc-print-blank');if(pb)pb.onclick=()=>printDoc(s.consentement,null);
 const pc=$('#dc-print-copy');if(pc)pc.onclick=()=>printDoc(s.consentement,s.consentement.recu);
 const dc=$('#dc-depot-cons');if(dc)dc.onsubmit=async e=>{e.preventDefault();const file=dc.file.files[0];if(!file){toast('Choisissez le fichier.');return}const b=dc.querySelector('button');b.disabled=true;b.textContent='Envoi en cours…';
  try{state=await sendFile(file,{kind:'consentement'});render();toast('Formulaire signé reçu. Merci.')}catch(x){b.disabled=false;b.textContent='Déposer le formulaire signé';fail(x)}};
 const up=$('#dc-up');if(up)up.onsubmit=async e=>{e.preventDefault();const err=$('#dc-up-err');err.hidden=true;const files=[...up.file.files],categorie=up.categorie.value;
  if(!categorie||!files.length){err.textContent=!categorie?'Choisissez le type de document.':'Choisissez au moins un fichier.';err.hidden=false;return}
  const b=up.querySelector('[type=submit]');b.disabled=true;let ok=0;const errors=[];
  for(const [i,file] of files.entries()){b.textContent='Envoi '+(i+1)+' / '+files.length+'…';try{state=await sendFile(file,{kind:'document',categorie,commentaire:up.commentaire.value});ok++}catch(x){if(x.status===410)return closed(x.message);errors.push(x.message)}}
  render();if(ok)toast(ok+' document'+(ok>1?'s':'')+' transmis. Merci.');
  if(errors.length){const e2=$('#dc-up-err');if(e2){e2.textContent=errors.join(' ');e2.hidden=false}}};
}
if(!R)return panel('<p>Service indisponible.</p>');
if(!/^[a-f0-9]{64}$/.test(token))return closed('Ce lien est incomplet. Ouvrez à nouveau le lien reçu par SMS ou par e-mail.');
call('open',{}).then(r=>ask(r.etablissement,r.purpose)).catch(e=>closed(e.message));
})();

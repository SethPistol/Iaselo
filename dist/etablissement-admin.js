/* IASELO · écran « Établissement » (administrateur) : identité de l'établissement de cette installation
   (une installation par établissement) : nom, adresse, téléphone, FINESS, logos clair et sombre.
   Ces valeurs remplacent celles d'origine dans toutes les pages, documents et SMS. Serveur : server/etablissement.mjs. */
(function(root){
'use strict';
root.createEtablissementAdmin=function(ctx){
 const {esc,toast}=ctx;let data=null,erreur='',envoi=false;const logos={};
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01"/></svg>';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="etablissement"]'))return;
  const apres=document.querySelector('aside .nav[data-view="fhir"]')||document.querySelector('aside .nav[data-view="droits"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='etablissement';b.innerHTML=ICON+'Établissement';b.onclick=()=>ctx.go('etablissement');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,300));else setTimeout(bouton,300);
 async function api(body){const r=await fetch('/api/admin/etablissement',{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Object.assign(Error(j.error||'Service indisponible.'),{champs:j.champs});return j}
 async function charger(){erreur='';try{data=await api()}catch(e){data=null;erreur=e.message}draw()}
 const style=document.createElement('style');
 style.textContent=`.et-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}.et-card{border:1px solid var(--border,#e0e4e9);border-radius:14px;padding:16px;background:var(--i-s1,#fff);min-width:0}
.et-card h3{margin:0 0 10px;font-size:.95rem;text-transform:uppercase;letter-spacing:.04em}.et-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.et-form label{display:flex;flex-direction:column;gap:4px;font-weight:600}.et-form .full{grid-column:1/-1}
.et-form label.err input{border-color:#B21F2A}.et-logo{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.et-logo figure{margin:0;padding:10px;border-radius:10px;border:1px dashed var(--border,#d6dde2);min-width:200px;text-align:center}
.et-logo figure.sombre{background:#0f1a1f;color:#e8eef1}.et-logo img{max-width:220px;max-height:90px;display:block;margin:0 auto 6px}.et-mut{color:var(--i-mut,#5b6b73);font-size:14px}.et-apercu{background:#f2f5f6;border-radius:10px;padding:10px 12px;font-size:14px}
@media (max-width:640px){.et-form{grid-template-columns:1fr}}`;
 document.head.append(style);
 const champ=(k,l,extra='',cls='')=>`<label class="${cls} ${data?.erreurs?.includes(k)?'err':''}">${l}<input name="${k}" value="${esc(data?.[k]||'')}" ${extra}></label>`;
 function draw(){
  const c=document.querySelector('#workspace');if(!c)return;
  if(erreur){c.innerHTML=`<section class="panel"><div class="content"><p class="et-mut">${esc(erreur)}</p></div></section>`;return}
  if(!data){c.innerHTML='<section class="panel"><div class="content"><p>Chargement…</p></div></section>';return}
  const t=Date.now(),src=n=>logos[n]===null?'':logos[n]||`assets/marque/etablissement${n==='sombre'?'-sombre':''}.webp?t=${t}`;
  c.innerHTML=`<section class="panel"><div class="content">
  <p class="et-mut">Cette installation d’IASELO sert un seul établissement : ses données restent dans sa propre base. Le nom, les coordonnées et les logos réglés ici apparaissent dans toutes les pages, les documents et les SMS envoyés aux patients.${data.majLe?` Dernière modification le ${esc(new Date(data.majLe).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}))} par ${esc(data.majPar)}.`:''}</p>
  <form id="et-form"><div class="et-grid">
   <section class="et-card"><h3>Identité</h3><div class="et-form">
    ${champ('nom','Nom de l’établissement','required minlength="2" maxlength="120"','full')}
    ${champ('adresse','Adresse','maxlength="160"','full')}${champ('cp','Code postal','inputmode="numeric" maxlength="5" pattern="\\d{5}"')}${champ('ville','Ville','maxlength="80"')}
    ${champ('tel','Téléphone','maxlength="30"')}${champ('finess','N° FINESS','inputmode="numeric" maxlength="9" pattern="\\d{9}"')}</div>
    <p class="et-apercu" id="et-apercu"></p></section>
   <section class="et-card"><h3>Logos</h3><div class="et-logo">
    ${['clair','sombre'].map(n=>`<figure class="${n}">${src(n)?`<img src="${esc(src(n))}" alt="Logo ${n}">`:'<p>Logo d’origine rétabli à l’enregistrement</p>'}<figcaption>Fond ${n}</figcaption>
     <p><label class="secondary ps-small" style="cursor:pointer">Choisir…<input type="file" accept="image/png,image/webp,image/jpeg" data-logo="${n}" hidden></label> ${data.logos?.[n]||logos[n]?`<button type="button" class="secondary ps-small" data-reset="${n}">Logo d’origine</button>`:''}</p></figure>`).join('')}</div>
    <p class="et-mut">PNG, WebP ou JPEG, 2 Mo au plus. Fond transparent conseillé ; largeur d’environ 600 px.</p></section>
  </div><p><button class="primary" ${envoi?'disabled':''}>Enregistrer</button></p></form></div></section>`;
  const f=c.querySelector('#et-form'),ap=c.querySelector('#et-apercu');
  const apercu=()=>{const v=Object.fromEntries(new FormData(f));ap.textContent='Exemple de SMS : '+(v.nom||'…')+' : vous avez un nouveau message de votre équipe : https://… En cas d’urgence, appelez le 15.'};apercu();f.oninput=apercu;
  c.querySelectorAll('[data-logo]').forEach(i=>i.onchange=()=>{const fichier=i.files[0];if(!fichier)return;if(fichier.size>2*1024*1024){toast('Logo de 2 Mo au plus.');return}const r=new FileReader();r.onload=()=>{logos[i.dataset.logo]=r.result;const v=Object.fromEntries(new FormData(f));Object.assign(data,v);draw()};r.readAsDataURL(fichier)});
  c.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{logos[b.dataset.reset]=null;const v=Object.fromEntries(new FormData(f));Object.assign(data,v);draw()});
  f.onsubmit=async e=>{e.preventDefault();envoi=true;const valeurs=Object.fromEntries(new FormData(f));
   try{data=await api({valeurs,logos:{...logos}});for(const k of Object.keys(logos))delete logos[k];toast('Établissement enregistré. Rechargez la page pour voir le nouveau nom partout.')}catch(err){Object.assign(data,valeurs,{erreurs:err.champs||[]});toast(err.message)}finally{envoi=false;draw()}};
 }
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Établissement';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='etablissement'));
  draw();charger();
 }
 return {render};
};
})(typeof self!=='undefined'?self:this);

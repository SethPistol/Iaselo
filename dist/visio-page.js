// Page patient du rendez-vous vidéo (lien personnel reçu par SMS ou e-mail) : date de naissance vérifiée par le serveur,
// test de la caméra et du micro, puis appel de navigateur à navigateur avec le soignant. Rien n'est enregistré.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
let naissance='',info=null;
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
const urgence='<p class="pp-banner is-crit" role="note"><span><b>En cas d’urgence, appelez le 15.</b> Ce service n’est pas lu en continu, la nuit et le week-end.</span></p>';
async function call(path,data){const r=await fetch('/api/visio/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,naissance,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status,naissance:j.naissance});return j}
function ferme(m){panel(`<h2>Lien indisponible</h2><p>${esc(m)}</p>${urgence}`)}
const quand=iso=>new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
function identite(err=''){
 panel(`<h2>Vérification de votre identité</h2><form id="vi-id"><label class="sj-q"><span>Date de naissance</span><input type="date" name="dob" required autocomplete="bday"></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Continuer</button></div></form><p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#vi-id').onsubmit=async e=>{e.preventDefault();naissance=e.target.dob.value;e.target.querySelector('button').disabled=true;
  try{info=await call('open');salle()}catch(x){naissance='';if(x.naissance)identite(x.message);else ferme(x.message)}};
}
function salle(msg=''){
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>Votre rendez-vous vidéo</h2><p class="ph-intro">${esc(quand(info.debut))}</p>
  ${msg?`<p class="ph-ok" role="status">${esc(msg)}</p>`:''}
  ${info.ouverte?'<p>Installez-vous au calme, avec une bonne connexion. Votre navigateur va vous demander l’accès à la caméra et au micro : acceptez.</p><div class="v-actions"><button type="button" class="primary" id="vi-go">Entrer dans la salle</button></div>':`<p>${esc(info.raison||'La salle n’est pas ouverte.')}</p>${info.tot?'<div class="v-actions"><button type="button" class="secondary" id="vi-maj">Actualiser</button></div>':''}`}
  <p class="ps-note">L’appel est chiffré et va directement de votre appareil à celui de votre soignant. Rien n’est enregistré.</p>${urgence}`);
 const go=$('#vi-go');if(go)go.onclick=entrer;
 const maj=$('#vi-maj');if(maj)maj.onclick=async()=>{try{info=await call('open');salle()}catch(x){ferme(x.message)}};
}
async function entrer(){
 await window.IaseloAppel.ouvrir({role:'patient',titre:'Rendez-vous vidéo · '+info.etablissement,iceServers:info.iceServers||[],
  envoyer:(type,data)=>call('signal',{type,data}),
  relever:async apres=>{try{return await call('poll',{apres})}catch(e){if(e.status===409)return {messages:[],statut:'terminee'};throw e}},
  fin:()=>salle('L’appel est terminé. Merci.')});
}
if(!/^[a-f0-9]{64}$/.test(token))ferme('Ce lien est incomplet. Utilisez le lien reçu par SMS ou par e-mail.');else identite();
})();

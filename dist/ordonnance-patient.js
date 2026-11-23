// Espace patient : ordonnances et consignes préopératoires ouvertes par le lien reçu par SMS ou e-mail.
// Aucun code du dossier professionnel n'est chargé. La date de naissance est demandée avant tout affichage.
(function(){
'use strict';
const R=window.IaseloPrescriptionsPreop,$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
// Le lien ne doit rester ni dans l'historique ni dans l'adresse copiée.
if(token)history.replaceState(null,'',location.pathname);
const host=$('#workspace');
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
async function call(path,data){const r=await fetch('/api/prescriptions/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});const j=await r.json().catch(()=>({error:'Service indisponible. Réessayez plus tard.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Service indisponible.'),{status:r.status});return j}
function closed(message){panel(`<h2>Lien indisponible</h2><p>${esc(message)}</p><p>Si vous avez besoin de vos consignes, appelez la clinique.</p>`)}
function ask(etab,error){
 panel(`<h2>Vérification de votre identité</h2><p>${esc(etab||'La clinique')} a préparé vos ordonnances et vos consignes avant l’intervention. Pour les afficher, indiquez votre date de naissance.</p>
 <form id="pp-dob" class="pp-dob"><label>Date de naissance<input type="date" name="dob" required autocomplete="bday"></label>${error?`<p class="pp-err" role="alert">${esc(error)}</p>`:''}<button class="primary">Afficher mes documents</button></form>
 <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#pp-dob').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
  try{const {prescription,expiresAt}=await call('view',{birthDate:e.target.dob.value});show(prescription,expiresAt)}
  catch(err){if(err.status===410)closed(err.message);else ask(etab,err.message)}};
 $('#pp-dob [name=dob]').focus();
}
function show(snap,expiresAt){
 document.title='Mes documents · '+(snap.etablissement||'');
 host.innerHTML=`<section class="panel pp-patient-doc"><div class="content"><div class="no-print pp-patient-intro"><p>Voici les documents remis lors de votre consultation d’anesthésie. Gardez-les à portée de main jusqu’à l’intervention.</p><div class="v-actions"><button class="primary" id="pp-patient-print">Imprimer ou enregistrer en PDF</button></div><p class="sessionnote">Disponible jusqu’au ${esc(new Date(expiresAt).toLocaleDateString('fr-FR'))}. Pour les examens, présentez au laboratoire l’ordonnance signée remise en consultation, ou ce document imprimé si le laboratoire l’accepte.</p></div>${R.documentHTML(snap)}</div></section>`;
 $('#pp-patient-print').onclick=()=>window.print();
}
if(!R)return panel('<p>Service indisponible.</p>');
if(!/^[a-f0-9]{64}$/.test(token))return closed('Ce lien est incomplet. Ouvrez à nouveau le lien reçu par SMS ou par e-mail.');
call('open',{}).then(r=>ask(r.etablissement)).catch(e=>closed(e.message));
})();

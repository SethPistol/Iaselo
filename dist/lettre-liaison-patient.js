// Espace patient : lettre de liaison de sortie ouverte par le lien reçu par e-mail (ou SMS).
// Aucun code du dossier professionnel n'est chargé. La date de naissance est demandée avant tout affichage.
(function(){
'use strict';
const L=window.IaseloLettreLiaison,$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
// Le lien ne doit rester ni dans l'historique ni dans l'adresse copiée.
if(token)history.replaceState(null,'',location.pathname);
const host=$('#workspace');
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
async function call(path,data){const r=await fetch('/api/lettre-liaison/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});const j=await r.json().catch(()=>({error:'Service indisponible. Réessayez plus tard.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Service indisponible.'),{status:r.status});return j}
function closed(message){panel(`<h2>Lien indisponible</h2><p>${esc(message)}</p><p>Si vous avez besoin de votre lettre de sortie, appelez la clinique.</p>`)}
function ask(etab,error){
 panel(`<h2>Vérification de votre identité</h2><p>${esc(etab||'La clinique')} met à votre disposition votre lettre de liaison de sortie. Pour l’afficher, indiquez votre date de naissance.</p>
 <form id="pp-dob" class="pp-dob"><label>Date de naissance<input type="date" name="dob" required autocomplete="bday"></label>${error?`<p class="pp-err" role="alert">${esc(error)}</p>`:''}<button class="primary">Afficher ma lettre</button></form>
 <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#pp-dob').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
  try{const r=await call('view',{birthDate:e.target.dob.value});show(r)}
  catch(err){if(err.status===410)closed(err.message);else ask(etab,err.message)}};
 $('#pp-dob [name=dob]').focus();
}
function show({lettre,pdf,expiresAt}){
 document.title='Ma lettre de sortie · '+(lettre.etablissement||'');
 const blob=new Blob([Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))],{type:'application/pdf'}),url=URL.createObjectURL(blob);
 host.innerHTML=`<section class="panel pp-patient-doc"><div class="content"><div class="no-print pp-patient-intro"><p>Voici la lettre remise à votre sortie. Elle résume votre séjour, vos traitements et la suite des soins. Montrez-la à votre médecin traitant et à tout professionnel qui vous suit.</p>
  <div class="v-actions"><a class="primary button" id="ll-pdf" href="${url}" download="lettre-de-liaison.pdf">Télécharger le PDF</a><button class="secondary" id="ll-print">Imprimer</button></div>
  <p class="sessionnote">Lien disponible jusqu’au ${esc(new Date(expiresAt).toLocaleDateString('fr-FR'))}. Enregistrez le PDF pour le conserver. En cas d’urgence, appelez le 15.</p></div>
  ${L.documentHTML(lettre)}</div></section>`;
 $('#ll-print').onclick=()=>window.print();
}
if(!L)return panel('<p>Service indisponible.</p>');
if(!/^[a-f0-9]{64}$/.test(token))return closed('Ce lien est incomplet. Ouvrez à nouveau le lien reçu par e-mail ou par SMS.');
call('open',{}).then(r=>ask(r.etablissement)).catch(e=>closed(e.message));
})();

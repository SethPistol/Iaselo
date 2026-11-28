// Arrivée du patient le jour J (5e veille, lot 3) : le patient flashe le QR code affiché à l'entrée de la clinique,
// indique son nom et sa date de naissance ; l'accueil, l'étage et le bloc sont prévenus. Aucune information n'est affichée
// en retour (la réponse est la même si le patient n'est pas reconnu) : l'accueil vérifie ensuite l'identité.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
function formulaire(err=''){
 panel(`<h2>Bienvenue</h2><p class="ar-intro">Signalez votre arrivée : l’équipe qui vous attend est prévenue.</p>
 <form id="ar-form"><label class="sj-q"><span>Votre nom de famille</span><input name="nom" autocomplete="family-name" required maxlength="80"></label><label class="sj-q"><span>Votre date de naissance</span><input type="date" name="naissance" required></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Je suis arrivé(e)</button></div></form>
 <p class="ar-note">Vos informations servent uniquement à prévenir l’équipe de votre arrivée.</p>`);
 $('#ar-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;
  try{const r=await fetch('/api/arrivee',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({nom:f.nom.value,naissance:f.naissance.value})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw new Error(j.error||'Serveur indisponible.');
   panel(`<h2>Merci</h2><p class="ar-ok" role="status">${esc(j.message)}</p><p class="ar-note">Si vous avez besoin d’aide, adressez-vous à l’accueil.</p>`)}
  catch(x){formulaire(x.message)}};
}
formulaire();
})();

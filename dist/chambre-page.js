// Écran en chambre (tablette du patient, 4e veille lot C) : sa journée, sa sortie, ses consignes, et des demandes non
// urgentes à l'équipe (aide, douleur 0-10, soif, toilettes). La sonnette reste le moyen d'appel urgent.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
let dob='',info=null,vue=null,minuteur=null,douleur=null,autre=false;
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500)};
const heure=iso=>new Date(iso).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const jour=d=>{const x=new Date(d+'T12:00:00');return isNaN(x)?d:x.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})};
async function call(path,data){const r=await fetch('/api/chambre/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status});return j}
const sonnette='<p class="ch-sonnette" role="note">En cas d’urgence, appuyez sur la sonnette de votre lit.</p>';
function ferme(m){clearInterval(minuteur);panel(`<h2>Écran indisponible</h2><p>${esc(m)}</p>${sonnette}`)}
function identite(err=''){
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>Bienvenue</h2><p>Pour afficher vos informations, indiquez votre date de naissance.</p>${sonnette}
 <form id="ch-id"><label class="sj-q"><span>Votre date de naissance</span><input type="date" name="dob" required></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Continuer</button></div></form>`);
 $('#ch-id').onsubmit=async e=>{e.preventDefault();dob=e.target.dob.value;try{vue=await call('vue',{birthDate:dob});afficher();clearInterval(minuteur);minuteur=setInterval(rafraichir,120000)}catch(x){x.status===410?ferme(x.message):identite(x.message)}};
}
async function rafraichir(){if(document.activeElement?.closest?.('form'))return;try{vue=await call('vue',{birthDate:dob});afficher()}catch(x){if(x.status===410)ferme(x.message)}}
function afficher(){
 const s=vue.sortie||{},reste=(vue.aFaire||[]).filter(x=>!x.ok);
 panel(`<p class="dc-pt-kicker">${esc(vue.etablissement)}${vue.chambre?' · chambre '+esc(vue.chambre):''}</p><h2>Bonjour${vue.prenom?' '+esc(vue.prenom):''}</h2>${sonnette}
 <div class="ch-grille">
  <section class="ch-carte" aria-labelledby="ch-sortie"><h3 id="ch-sortie">Votre sortie</h3>
   <p>${s.date?'Prévue '+esc(jour(s.date))+(s.heure?' vers '+esc(s.heure.replace(':',' h ')):''):'La date sera fixée par l’équipe.'}</p>
   ${s.mode?`<p class="ch-mut">Retour : ${esc(s.mode)}${s.accompagnant?' · accompagnant prévu':''}</p>`:''}
   ${vue.aFaire?.length?`<ul class="ch-liste">${vue.aFaire.map(x=>`<li><span class="${x.ok?'ch-ok':'ch-att'}" aria-hidden="true">${x.ok?'✓':'…'}</span><span>${esc(x.libelle)} <span class="visually-hidden">${x.ok?'prêt':'en cours'}</span></span></li>`).join('')}</ul>`:''}
   ${reste.length?'<p class="ch-mut">L’équipe prépare ce qui reste avant votre départ.</p>':''}</section>
  <section class="ch-carte" aria-labelledby="ch-dem-t"><h3 id="ch-dem-t">Demander à l’équipe</h3><p class="ch-mut">Demande non urgente : l’équipe la voit sur son écran et passe dès que possible.</p>
   <div class="ch-dem">${info.demandes.map(d=>`<button type="button" data-dem="${d.id}" aria-expanded="${d.id==='douleur'?douleur!==null:d.id==='autre'?autre:''}">${esc(d.libelle)}</button>`).join('').replace(/ aria-expanded=""/g,'')}</div>
   ${douleur!==null?`<form id="ch-douleur"><fieldset style="border:0;padding:0;margin:12px 0 0"><legend>Ma douleur, de 0 (aucune) à 10 (la pire imaginable)</legend><div class="ch-ech">${Array.from({length:11},(_,i)=>`<button type="button" data-v="${i}" aria-pressed="${douleur===i}">${i}</button>`).join('')}</div></fieldset><button class="primary" ${douleur<0?'disabled':''}>Envoyer</button></form>`:''}
   ${autre?`<form id="ch-autre"><label class="sj-q"><span>Votre demande</span><input name="texte" maxlength="140" required></label><button class="primary">Envoyer</button></form>`:''}
   ${vue.demandes?.length?`<h3 style="margin-top:14px">Vos demandes</h3><ul class="ch-liste">${vue.demandes.map(d=>`<li><span>${esc(heure(d.recuAt))}</span><span>${esc(d.libelle)}${d.valeur!=null?' ('+d.valeur+'/10)':''} · ${d.vue?'<span class="ch-ok">vue par l’équipe</span>':'envoyée'}</span></li>`).join('')}</ul>`:''}</section>
  ${vue.consignes?`<section class="ch-carte" aria-labelledby="ch-cons"><h3 id="ch-cons">Vos consignes pour le retour à domicile</h3><p style="white-space:pre-line">${esc(vue.consignes)}</p></section>`:''}
 </div>`);
 host.querySelectorAll('[data-dem]').forEach(b=>b.onclick=()=>{const id=b.dataset.dem;if(id==='douleur'){douleur=douleur===null?-1:null;autre=false;afficher();return}if(id==='autre'){autre=!autre;douleur=null;afficher();return}envoyer({type:id})});
 host.querySelectorAll('#ch-douleur [data-v]').forEach(b=>b.onclick=()=>{douleur=Number(b.dataset.v);afficher();host.querySelector(`#ch-douleur [data-v="${douleur}"]`)?.focus()});
 const fd=$('#ch-douleur');if(fd)fd.onsubmit=e=>{e.preventDefault();if(douleur>=0)envoyer({type:'douleur',valeur:douleur})};
 const fa=$('#ch-autre');if(fa)fa.onsubmit=e=>{e.preventDefault();envoyer({type:'autre',texte:fa.texte.value})};
}
async function envoyer(d){try{const r=await call('demande',{birthDate:dob,...d});vue.demandes=r.demandes;douleur=null;autre=false;afficher();toast('Demande envoyée à l’équipe.')}catch(x){x.status===410?ferme(x.message):toast(x.message)}}
(async()=>{if(!token)return ferme('Lien incomplet. Demandez à l’équipe d’activer l’écran.');try{info=await call('open',{});identite()}catch(x){ferme(x.message)}})();
})();

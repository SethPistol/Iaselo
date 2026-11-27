// Page patient de la messagerie sécurisée : date de naissance demandée, fil des messages, envoi d'un message.
// L'assistant repère les signes d'urgence (→ 15) et propose des conseils en attendant la réponse de l'équipe.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
let dob='',info=null,aide=null;
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
const fmt=iso=>new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
async function call(path,data){const r=await fetch('/api/messagerie/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status});return j}
const urgence='<p class="pp-banner is-crit" role="note"><span><b>En cas d’urgence, appelez le 15.</b> Cette messagerie n’est pas lue la nuit ni le week-end.</span></p>';
function closed(m){panel(`<h2>Messagerie indisponible</h2><p>${esc(m)}</p>${urgence}`)}
function identite(err=''){
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>Messagerie avec votre équipe</h2><p>Pour protéger vos échanges, indiquez votre date de naissance.</p>${urgence}
 <form id="mg-id"><label class="sj-q"><span>Votre date de naissance</span><input type="date" name="dob" required autocomplete="bday"></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Continuer</button></div></form>`);
 $('#mg-id').onsubmit=async e=>{e.preventDefault();dob=e.target.dob.value;try{const r=await call('fil',{birthDate:dob});fil(r.messages)}catch(x){if(x.status===410)closed(x.message);else identite(x.message)}};
}
function fil(messages,err=''){
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>Vos échanges avec l’équipe</h2>${urgence}
 ${aide?.urgence?`<p class="pp-banner is-crit" role="alert"><span><b>${esc(aide.urgence.texte)}</b></span></p>`:''}
 <ol class="mg-fil" aria-live="polite">${messages.length?messages.map(m=>`<li class="mg-msg ${m.de==='patient'?'moi':'eux'}"><div class="mg-bulle">${esc(m.texte).replace(/\n/g,'<br>')}</div><small>${m.de==='patient'?'Vous':esc(m.par||'Votre équipe')} · ${esc(fmt(m.at))}</small></li>`).join(''):'<li class="mg-vide">Écrivez votre question ci-dessous. L’équipe vous répond aux heures ouvrables.</li>'}</ol>
 ${aide?`<section class="mg-aide"><p>${esc(aide.accuse)}</p>${aide.fiches.length?`<p><b>En attendant, ces conseils peuvent vous aider :</b></p>${aide.fiches.map(f=>`<details class="ps-fiche"><summary>${esc(f.titre)}</summary>${f.sections.map(([t,l])=>`<h3>${esc(t)}</h3><ul>${l.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</details>`).join('')}`:''}</section>`:''}
 <form id="mg-form"><label class="sj-q"><span>Votre message</span><textarea name="texte" rows="4" maxlength="1000" required></textarea></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}
 <div class="v-actions"><button class="primary">Envoyer</button><button type="button" class="secondary" id="mg-maj">Actualiser</button></div></form>
 <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 const liste=$('.mg-fil');liste.lastElementChild?.scrollIntoView?.({block:'nearest'});
 $('#mg-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const r=await call('envoyer',{birthDate:dob,texte:e.target.texte.value});aide=r.assistant;fil(r.messages)}catch(x){if(x.status===410)closed(x.message);else fil(messages,x.message)}};
 $('#mg-maj').onclick=async()=>{try{const r=await call('fil',{birthDate:dob});fil(r.messages)}catch(x){closed(x.message)}};
}
(async()=>{
 if(!/^[a-f0-9]{64}$/.test(token)){closed('Lien incomplet. Ouvrez le dernier lien reçu par SMS ou par e-mail.');return}
 try{info=await call('open',{});identite()}catch(err){closed(err.message)}
})();
})();

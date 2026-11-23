// Questionnaire du lendemain (lien du SMS J+1) : 8 questions, date de naissance vérifiée par le serveur.
// Les réponses vont au dossier ; une réponse inquiétante alerte le médecin dans IASELO.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
async function call(path,data){const r=await fetch('/api/suivi-j1/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status});return j}
const urgence='<p class="pp-banner is-crit" role="note"><span><b>En cas d’urgence, appelez le 15.</b> Ce questionnaire n’est pas lu en continu, la nuit et le week-end.</span></p>';
function closed(m){panel(`<h2>Lien indisponible</h2><p>${esc(m)}</p>${urgence}`)}
function form(info,error,values={}){
 const q=info.questions.map(x=>x.type==='number'
  ?`<label class="sj-q"><span>${esc(x.texte)}${x.obligatoire?'':' <small>(facultatif)</small>'}</span><input name="${x.id}" type="number" inputmode="decimal" ${x.id==='temperature'?'step="0.1" min="30" max="43" placeholder="ex. 37,2"':'step="1" min="0" max="10" placeholder="0 à 10"'} value="${esc(values[x.id]||'')}" ${x.obligatoire?'required':''}></label>`
  :`<fieldset class="sj-q"><legend>${esc(x.texte)}</legend><span class="v-seg">${['Oui','Non'].map(o=>`<label><input type="radio" name="${x.id}" value="${o}" ${values[x.id]===o?'checked':''} required><span>${o}</span></label>`).join('')}</span></fieldset>`).join('');
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>Comment allez-vous depuis votre retour ?</h2>
  <p>Vos réponses sont transmises à votre médecin. Si l’une d’elles l’inquiète, l’équipe vous rappelle.</p>${urgence}
  <form id="sj-form" novalidate><label class="sj-q"><span>Votre date de naissance</span><input type="date" name="dob" required autocomplete="bday" value="${esc(values.dob||'')}"></label>${q}
  ${error?`<p class="pp-err" role="alert">${esc(error)}</p>`:''}<div class="v-actions"><button class="primary">Envoyer mes réponses</button></div></form>
  <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#sj-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),answers={},vals={dob:f.get('dob')};
  for(const x of info.questions){const v=f.get(x.id);if(v!==null&&v!=='')answers[x.id]=String(v).replace(',','.');vals[x.id]=v||''}
  const b=e.target.querySelector('button');b.disabled=true;
  try{const r=await call('submit',{birthDate:vals.dob,answers});done(info,r.alerte)}
  catch(err){if(err.status===410)closed(err.message);else form(info,err.message,vals)}};
}
function done(info,alerte){
 panel(`<h2>Merci, vos réponses ont été transmises.</h2>${alerte?'<p class="pp-banner is-warn"><span><b>Votre médecin est prévenu et l’équipe va vous rappeler.</b> Si vous vous sentez mal ou si cela s’aggrave, appelez la clinique, ou le 15 en cas d’urgence.</span></p>':'<p>Votre médecin est informé. Bon rétablissement.</p>'}${urgence}`);
}
(async()=>{
 if(!/^[a-f0-9]{64}$/.test(token)){closed('Lien incomplet. Ouvrez le lien reçu par SMS.');return}
 try{const info=await call('open',{});if(info.reponses>0)done(info,false);else form(info,'')}
 catch(err){closed(err.message)}
})();
})();

// Page patient du parcours de soins à distance (lien reçu par SMS ou e-mail) :
// fiche d'éducation (lecture), ou questionnaire de suivi / PROMs / PREMs (date de naissance vérifiée par le serveur).
// Une réponse inquiétante alerte l'équipe dans IASELO ; le patient est toujours renvoyé vers le 15 en cas d'urgence.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
async function call(path,data){const r=await fetch('/api/parcours/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status});return j}
const urgence='<p class="pp-banner is-crit" role="note"><span><b>En cas d’urgence, appelez le 15.</b> Ce service n’est pas lu en continu, la nuit et le week-end.</span></p>';
function closed(m){panel(`<h2>Lien indisponible</h2><p>${esc(m)}</p>${urgence}`)}
function fiche(info){
 const f=info.fiche;$('#title').textContent=f.titre;
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>${esc(f.titre)}</h2><p>${esc(f.resume)}</p>
  ${f.sections.map(([t,l])=>`<section class="ps-fiche"><h3>${esc(t)}</h3><ul>${l.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}
  <p class="ps-note">Ces conseils sont généraux. Les consignes écrites remises par votre équipe priment toujours. En cas de doute, appelez la clinique.</p>${urgence}
  <div class="v-actions no-print"><button type="button" class="secondary" id="ps-print">Imprimer</button></div>`);
 $('#ps-print').onclick=()=>print();
}
function champ(x,values){
 const v=values[x.id]??'',opt=x.obligatoire?'':' <small>(facultatif)</small>';
 if(x.type==='oui-non')return `<fieldset class="sj-q"><legend>${esc(x.texte)}</legend><span class="v-seg">${['Oui','Non'].map(o=>`<label><input type="radio" name="${x.id}" value="${o}" ${v===o?'checked':''} required><span>${o}</span></label>`).join('')}</span></fieldset>`;
 if(x.type==='echelle')return `<fieldset class="sj-q ps-echelle"><legend>${esc(x.texte)}</legend><span class="ps-scale">${Array.from({length:11},(_,i)=>`<label><input type="radio" name="${x.id}" value="${i}" ${String(v)===String(i)?'checked':''} required><span>${i}</span></label>`).join('')}</span></fieldset>`;
 if(x.type==='sante')return `<label class="sj-q"><span>${esc(x.texte)}</span><input name="${x.id}" type="number" inputmode="numeric" min="0" max="100" step="1" placeholder="0 à 100" value="${esc(v)}" required></label>`;
 if(x.type==='temperature')return `<label class="sj-q"><span>${esc(x.texte)}${opt}</span><input name="${x.id}" type="number" inputmode="decimal" step="0.1" min="30" max="43" placeholder="ex. 37,2" value="${esc(v)}"></label>`;
 return `<label class="sj-q"><span>${esc(x.texte)}</span><textarea name="${x.id}" maxlength="500" rows="3">${esc(v)}</textarea></label>`;
}
function form(info,error,values={}){
 $('#title').textContent=info.titre;
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>${esc(info.titre)}</h2>
  <p>Vos réponses sont transmises à votre équipe. Si l’une d’elles l’inquiète, l’équipe vous rappelle.</p>${urgence}
  <form id="ps-form" novalidate><label class="sj-q"><span>Votre date de naissance</span><input type="date" name="dob" required autocomplete="bday" value="${esc(values.dob||'')}"></label>
  ${info.questions.map(x=>champ(x,values)).join('')}
  ${error?`<p class="pp-err" role="alert">${esc(error)}</p>`:''}<div class="v-actions"><button class="primary">Envoyer mes réponses</button></div></form>
  <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#ps-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),answers={},vals={dob:f.get('dob')};
  for(const x of info.questions){const v=f.get(x.id);if(v!==null&&v!=='')answers[x.id]=String(v).replace(',','.');vals[x.id]=v||''}
  const b=e.target.querySelector('button');b.disabled=true;
  try{const r=await call('submit',{birthDate:vals.dob,answers});done(r)}
  catch(err){if(err.status===410)closed(err.message);else form(info,err.message,vals)}};
}
function done(r={}){
 panel(`<h2>Merci, vos réponses ont été transmises.</h2>${r.alerte?`<p class="pp-banner ${r.crit?'is-crit':'is-warn'}"><span><b>Votre équipe est prévenue et va vous rappeler.</b> ${r.crit?'Si vous êtes essoufflé(e), avez une douleur dans la poitrine ou si vous saignez, appelez le 15 sans attendre.':'Si cela s’aggrave, appelez la clinique, ou le 15 en cas d’urgence.'}</span></p>`:'<p>Votre équipe est informée. Bon rétablissement.</p>'}${urgence}`);
}
(async()=>{
 if(!/^[a-f0-9]{64}$/.test(token)){closed('Lien incomplet. Ouvrez le lien reçu par SMS ou par e-mail.');return}
 try{const info=await call('open',{});if(info.type==='fiche')fiche(info);else if(info.reponses>0)done();else form(info,'')}
 catch(err){closed(err.message)}
})();
})();

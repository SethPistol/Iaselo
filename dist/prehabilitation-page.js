// Page patient de la préhabilitation (lien personnel reçu par SMS ou e-mail, ou QR code remis en consultation) :
// le patient coche chaque jour ses activités jusqu'à la veille de l'intervention (date de naissance vérifiée par le serveur).
// L'équipe voit son adhésion dans IASELO. En cas d'urgence, le patient est toujours renvoyé vers le 15.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
let naissance='',info=null,jourChoisi='';
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
const urgence='<p class="pp-banner is-crit" role="note"><span><b>En cas d’urgence, appelez le 15.</b> Ce service n’est pas lu en continu, la nuit et le week-end.</span></p>';
async function call(path,data){const r=await fetch('/api/prehab/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,naissance,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status,naissance:j.naissance});return j}
const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const libJour=d=>d===info.aujourdhui?'Aujourd’hui':d===decale(info.aujourdhui,-1)?'Hier':d===decale(info.aujourdhui,-2)?'Avant-hier':d;
function ferme(m){panel(`<h2>Lien indisponible</h2><p>${esc(m)}</p>${urgence}`)}
function identite(err=''){
 panel(`<h2>Vérification de votre identité</h2><form id="ph-id"><label class="sj-q"><span>Date de naissance</span><input type="date" name="dob" required autocomplete="bday"></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Continuer</button></div></form><p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#ph-id').onsubmit=async e=>{e.preventDefault();naissance=e.target.dob.value;const b=e.target.querySelector('button');b.disabled=true;
  try{info=await call('open');jourChoisi=info.aujourdhui;programme()}catch(x){naissance='';if(x.naissance)identite(x.message);else ferme(x.message)}};
}
function champ(it,v){
 if(it.type==='minutes')return `<label class="sj-q"><span>${esc(it.question)}</span><input type="number" name="${it.id}" inputmode="numeric" min="0" max="600" step="1" required value="${esc(v??'')}"><small class="ph-conseil">Votre objectif : ${info.objectifs.marcheMin} minutes par jour. ${esc(it.conseil)}</small></label>`;
 return `<fieldset class="sj-q"><legend>${esc(it.question)}</legend><span class="v-seg">${['Oui','Non'].map(o=>`<label><input type="radio" name="${it.id}" value="${o}" ${v===o?'checked':''} required><span>${o}</span></label>`).join('')}</span><small class="ph-conseil">${esc(it.conseil)}</small></fieldset>`;
}
function calendrier(){
 const f=info.fenetre;if(!f)return '';const jours=[];for(let d=f.debut;d<=f.fin;d=decale(d,1))jours.push(d);
 return `<div class="ph-cal" aria-hidden="true">${jours.map(d=>{const e=info.journal[d];const n=e?info.items.filter(it=>it.type==='minutes'?Number(e[it.id])>=info.objectifs.marcheMin:it.id==='tabac'?e[it.id]==='Non':e[it.id]==='Oui').length:0;return `<span class="${e?(n===info.items.length?'ok':'part'):''} ${d===info.aujourdhui?'ajd':''}" title="${d}">${Number(d.slice(8))}</span>`}).join('')}</div>`;
}
function programme(msg='',err=''){
 const f=info.fenetre,a=info.adhesion;
 if(!f){ferme('Le programme est terminé. Merci et à bientôt.');return}
 const avant=info.aujourdhui<f.debut,fini=info.aujourdhui>f.fin;
 const choix=[0,1,2].map(n=>decale(info.aujourdhui,-n)).filter(d=>d>=f.debut&&d<=f.fin);
 const e=info.journal[jourChoisi]||{};
 panel(`<p class="dc-pt-kicker">${esc(info.etablissement)}</p><h2>${info.prenom?'Bonjour '+esc(info.prenom):'Bonjour'}</h2>
  <p class="ph-intro">Chaque jour jusqu’à la veille de votre intervention, cochez vos activités. Une bonne préparation aide à mieux récupérer.</p>
  ${msg?`<p class="ph-ok" role="status">${esc(msg)}</p>`:''}
  ${a?.joursEcoules?`<p class="ph-stat">Jours remplis : <b>${a.remplis} sur ${a.joursEcoules}</b>${a.serie>1?` · série en cours : <b>${a.serie} jours</b>`:''}</p>`:''}
  ${calendrier()}
  ${avant?`<p>Votre programme commence le ${esc(f.debut.split('-').reverse().join('/'))}.</p>`:fini?'<p>Votre programme est terminé. Merci !</p>':`<form id="ph-form" novalidate>
   <div class="ph-jours" role="group" aria-label="Jour">${choix.map(d=>`<button type="button" class="${d===jourChoisi?'primary':'secondary'}" data-jour="${d}" aria-pressed="${d===jourChoisi}">${esc(libJour(d))}</button>`).join('')}</div>
   <p class="ph-jour">${esc(JOURS[new Date(jourChoisi+'T12:00:00').getDay()])} ${esc(jourChoisi.split('-').reverse().join('/'))}${info.journal[jourChoisi]?' · déjà rempli, vous pouvez corriger':''}</p>
   ${info.items.map(it=>champ(it,e[it.id])).join('')}
   ${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Enregistrer ma journée</button></div></form>`}
  <p class="ps-note">Ces conseils sont généraux. Les consignes de votre équipe priment toujours. Arrêtez un exercice qui provoque une douleur dans la poitrine, un essoufflement inhabituel ou un malaise, et appelez la clinique.</p>${urgence}`);
 host.querySelectorAll('[data-jour]').forEach(b=>b.onclick=()=>{jourChoisi=b.dataset.jour;programme()});
 const form=$('#ph-form');if(form)form.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(form),valeurs={};for(const it of info.items){const v=fd.get(it.id);if(v!==null&&v!=='')valeurs[it.id]=it.type==='minutes'?Number(v):v}
  const b=form.querySelector('.v-actions button');b.disabled=true;
  try{const r=await call('jour',{date:jourChoisi,valeurs});info.journal=r.journal;info.adhesion=r.adhesion;programme('Merci, votre journée est enregistrée.')}catch(x){if(x.status===410)ferme(x.message);else programme('',x.message)}};
}
if(!/^[a-f0-9]{64}$/.test(token))ferme('Ce lien est incomplet. Utilisez le lien reçu par SMS ou le QR code remis par la clinique.');else identite();
})();

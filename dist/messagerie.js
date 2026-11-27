/* IASELO · « Messages des patients » (onglet de l'écran Télésuivi) : conversations sécurisées patient ↔ équipe.
   Liste (non lus, urgences repérées par l'assistant), fil, réponses types, ouverture / fermeture de la messagerie.
   Le patient est prévenu par SMS ou e-mail sans contenu (lien personnel). Serveur : worker/messagerie.mjs. */
(function(root){
'use strict';
root.createMessagerieEquipe=function({esc,toast}){
 let liste=null,fil=null,ouvert=null,erreur='',hote=null,surChange=()=>{};
 const fmt=iso=>iso?new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 const nom=p=>[String(p?.nom||'').toUpperCase(),p?.prenom].filter(Boolean).join(' ')||'Patient';
 async function api(q,body){const r=await fetch('/api/workspace/messagerie'+(q||''),{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(){try{liste=(await api()).conversations;erreur=''}catch(e){erreur=e.message;liste=[]}surChange();draw()}
 async function ouvrir(stay){ouvert=stay;fil=null;draw();try{fil=await api('?stay='+encodeURIComponent(stay));await charger()}catch(e){toast(e.message);ouvert=null;draw()}}
 const nonLus=()=>(liste||[]).reduce((s,c)=>s+c.nonLus,0);
 function vueFil(){
  if(!fil)return '<p>Chargement…</p>';
  return `<header class="ps-cardhead"><h3>${esc(nom(fil.patient))}</h3><span>${fil.ouverte?'<span class="ps-chip ok">Messagerie ouverte</span> <button class="secondary ps-small" data-mg="fermer">Fermer</button>':'<span class="ps-chip">Fermée</span> <button class="primary ps-small" data-mg="ouvrir">'+(fil.messages.length?'Rouvrir et prévenir le patient':'Ouvrir la messagerie au patient')+'</button>'}</span></header>
  ${fil.contact?'':'<p class="ps-err">Coordonnées non vérifiées : le patient ne peut pas être prévenu.</p>'}
  <ol class="mg-fil">${fil.messages.length?fil.messages.map(m=>`<li class="mg-msg ${m.de==='equipe'?'moi':'eux'} ${m.urgence?'urgent':''}"><div class="mg-bulle">${esc(m.texte).replace(/\n/g,'<br>')}</div><small>${m.de==='equipe'?esc(m.par):'Patient'} · ${esc(fmt(m.at))}${m.urgence?' · <b class="ps-err">urgence repérée : '+esc(m.urgence.signe)+' (patient invité à appeler le 15)</b>':''}${m.de==='patient'&&m.lu?' · lu par '+esc(m.lu.par):''}</small></li>`).join(''):'<li class="mg-vide">Aucun message.</li>'}</ol>
  ${fil.ouverte?`<div class="mg-modeles">${fil.modeles.map(([l,x])=>`<button type="button" class="secondary ps-small" data-modele="${esc(x)}">${esc(l)}</button>`).join('')}</div>
  <form id="mg-rep" class="ps-form"><textarea name="texte" rows="3" maxlength="2000" required placeholder="Votre réponse au patient"></textarea><div class="ri-actions"><button class="primary">Envoyer et prévenir le patient</button></div></form>`:''}
  ${(fil.notifications||[]).length?`<p class="ps-mut">Dernière notification : ${esc(fmt(fil.notifications.at(-1).at))} · ${esc(fil.notifications.at(-1).ok?fil.notifications.at(-1).detail:'non envoyée : '+fil.notifications.at(-1).raison)}</p>`:''}`;
 }
 function draw(){
  if(!hote||!hote.isConnected)return;
  if(erreur){hote.innerHTML=`<p class="ps-err">${esc(erreur)}</p>`;return}
  if(!liste){hote.innerHTML='<p>Chargement des messages…</p>';return}
  hote.innerHTML=`<div class="mg-cols"><section class="ps-card"><h3>Conversations</h3>${liste.length?`<ul class="mg-liste">${liste.map(c=>`<li><button type="button" class="${ouvert===c.stay?'on':''}" data-conv="${esc(c.stay)}"><b>${esc(nom(c.patient))}</b> ${c.urgent?'<span class="ps-chip crit">Urgence</span>':''}${c.nonLus?` <span class="ps-chip warn">${c.nonLus} non lu${c.nonLus>1?'s':''}</span>`:''}${c.ouverte?'':' <span class="ps-chip">Fermée</span>'}<small>${c.dernier?esc((c.dernier.de==='patient'?'Patient : ':'Équipe : ')+c.dernier.extrait):'Aucun message'}</small></button></li>`).join('')}</ul>`:'<p class="ps-mut">Aucune conversation. Ouvrez la messagerie depuis le dossier de télésuivi d’un patient.</p>'}</section>
   <section class="ps-card">${ouvert?vueFil():'<p class="ps-mut">Choisissez une conversation.</p>'}</section></div>`;
  hote.querySelectorAll('[data-conv]').forEach(b=>b.onclick=()=>ouvrir(b.dataset.conv));
  hote.querySelectorAll('[data-modele]').forEach(b=>b.onclick=()=>{const tx=hote.querySelector('#mg-rep textarea');tx.value=b.dataset.modele;tx.focus()});
  hote.querySelectorAll('[data-mg]').forEach(b=>b.onclick=()=>action(b.dataset.mg==='ouvrir'?{action:'ouvrir'}:{action:'fermer'}));
  const f=hote.querySelector('#mg-rep');if(f)f.onsubmit=e=>{e.preventDefault();action({action:'repondre',texte:f.texte.value})};
 }
 async function action(body){try{const r=await api('',{stay:ouvert,...body});if(r.notification)toast(r.notification.ok?'Message enregistré · '+r.notification.detail:'Message enregistré, patient non prévenu : '+r.notification.raison);else toast('Enregistré.');await ouvrir(ouvert)}catch(e){toast(e.message)}}
 return {
  monter(el,{stay,change}={}){hote=el;if(change)surChange=change;if(stay){ouvrir(stay);return}ouvert=null;fil=null;draw();charger()},
  rafraichir:charger,nonLus,
  async ouvrirPour(stay){try{const r=await api('',{stay,action:'ouvrir'});toast(r.notification.ok?'Messagerie ouverte · '+r.notification.detail:'Messagerie ouverte, patient non prévenu : '+r.notification.raison);return true}catch(e){toast(e.message);return false}}
 };
};
})(typeof self!=='undefined'?self:this);

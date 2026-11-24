/* IASELO · écran « Ouverture des salles » : vérifications quotidiennes du bloc avant le premier patient.
   Partie infirmière (salle) et partie anesthésie (poste d'anesthésie), signées séparément et tracées par le
   serveur (GET/POST /api/workspace/ouverture-salles). Règles : dist/ouverture-salles-regles.js. */
(function(root){
'use strict';
root.createOuvertureSalles=function(ctx){
 const {$,esc,toast}=ctx,R=root.IaseloOuvertureSalles;if(!R)return null;
 let date='',data=null,erreur='',salle='',envoi=false,chargement=0,resumeCache=null,resumeAt=0;
 const brouillons={};
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="m9 13 2 2 4-4"/></svg>';
 const aujourdhui=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const heure=iso=>new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
 const ton={ouverte:'ok','non-operationnelle':'crit',partielle:'warn','a-faire':'mut'};
 const style=document.createElement('style');
 style.textContent='.os-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px;margin:0 0 16px}.os-head p{margin:0;color:var(--i-mut,#5b6b73);max-width:680px}.os-head label{display:flex;flex-direction:column;gap:4px;font-size:13px}.os-rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:0 0 20px}.os-room{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:14px 16px;border-radius:var(--i-r-m,12px);border:1px solid var(--i-line,#d8e0e2);background:var(--i-s1,#fff);cursor:pointer;font:inherit;color:inherit}.os-room.active{border-color:var(--i-acc,#1f6b78);box-shadow:0 0 0 2px var(--i-acc-soft,#d9eef1)}.os-room strong{font-size:16px}.os-room small{color:var(--i-mut,#5b6b73);font-size:12px}.os-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--i-s2,#eef2f3)}.os-chip.ok{background:var(--i-ok-soft,#dff3e6);color:var(--i-ok,#1e7a45)}.os-chip.crit{background:var(--i-crit-soft,#fbe3e1);color:var(--i-crit,#b42318)}.os-chip.warn{background:var(--i-warn-soft,#fdf0d5);color:var(--i-warn,#9a6200)}.os-parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}.os-part{border:1px solid var(--i-line,#d8e0e2);border-radius:var(--i-r-m,12px);padding:16px 18px;background:var(--i-s1,#fff)}.os-part h3{margin:0 0 4px}.os-part .os-sub{margin:0 0 12px;font-size:13px;color:var(--i-mut,#5b6b73)}.os-item{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px 12px;padding:8px 0;border-top:1px solid var(--i-line,#e5eaeb)}.os-item:first-of-type{border-top:0}.os-seg{display:inline-flex;border:1px solid var(--i-line,#d8e0e2);border-radius:999px;overflow:hidden}.os-seg label{position:relative;cursor:pointer;display:flex!important;flex-direction:row!important;align-items:center;margin:0!important;padding:0!important;min-height:0!important;gap:0!important;font-weight:500}.os-seg label+label{border-left:1px solid var(--i-line,#d8e0e2)}.os-seg input{position:absolute;opacity:0;pointer-events:none}.os-seg span{display:block;padding:6px 12px;font-size:13px;line-height:1.2;white-space:nowrap}.os-seg input:checked+span{background:var(--i-acc,#1f6b78);color:#fff}.os-seg input[value="non-conforme"]:checked+span,.os-seg input[value="non-operationnelle"]:checked+span{background:var(--i-crit,#b42318)}.os-seg input:focus-visible+span{outline:2px solid var(--i-acc,#1f6b78);outline-offset:-2px}.os-conclusion{margin-top:12px;padding-top:12px;border-top:2px solid var(--i-line,#d8e0e2)}.os-part textarea{width:100%;min-height:70px;margin-top:6px}.os-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}.os-signed dl{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:0;font-size:14px}.os-signed dd{margin:0;font-weight:600}.os-signed dd.ko{color:var(--i-crit,#b42318)}.os-hist{margin-top:22px}.os-hist li{font-size:13px;margin:4px 0}.os-perop{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:0 0 14px}';
 document.head.append(style);
 function bouton(){
  if(document.querySelector('aside .nav[data-view="ouvertureSalles"]'))return;
  const apres=document.querySelector('aside .nav[data-view="regulation"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='ouvertureSalles';b.innerHTML=ICON+'Ouverture des salles';b.onclick=()=>ctx.go('ouvertureSalles');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 async function api(options){const r=await fetch('/api/workspace/ouverture-salles'+(options?'':'?date='+encodeURIComponent(date)),{cache:'no-store',...(options||{}),headers:{'Content-Type':'application/json'}});const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok)throw Error(j.error||'Service indisponible.');return j}
 async function charger(){const n=++chargement;erreur='';try{const j=await api();if(n!==chargement)return;data=j;if(!data.rooms.some(r=>r.id===salle))salle=data.rooms[0]?.id||''}catch(e){if(n!==chargement)return;data=null;erreur=e.message}draw()}
 function partieSignee(part,rec){
  const p=R.PARTIES[part];
  return `<div class="os-signed"><p class="os-sub">Signée par <b>${esc(rec.author)}</b> à ${esc(heure(rec.at))} · <span class="os-chip ${rec.conclusion==='operationnelle'?'ok':'crit'}">${esc(R.CONCLUSIONS[rec.conclusion])}</span></p><dl>${p.items.map(([k,l])=>`<dt>${esc(l)}</dt><dd class="${rec.items[k]==='non-conforme'?'ko':''}">${esc(R.ETATS[rec.items[k]]||'—')}</dd>`).join('')}</dl>${rec.comment?`<p><b>${part==='anesthesie'?'Remarques':'Commentaire'} :</b> ${esc(rec.comment)}</p>`:''}</div>`;
 }
 function formulaire(part){
  const p=R.PARTIES[part],cle=salle+'|'+part,b=brouillons[cle]||(brouillons[cle]={items:{},conclusion:'',comment:''});
  const seg=(name,valeurs,courant)=>`<span class="os-seg" role="radiogroup">${Object.entries(valeurs).map(([v,l])=>`<label><input type="radio" name="${esc(name)}" value="${esc(v)}" ${courant===v?'checked':''}><span>${esc(l)}</span></label>`).join('')}</span>`;
  return `<form class="os-form" data-part="${part}">${p.items.map(([k,l])=>`<div class="os-item"><span>${esc(l)}</span>${seg('item-'+k,R.ETATS,b.items[k])}</div>`).join('')}
   <div class="os-item os-conclusion"><strong>Salle opérationnelle</strong>${seg('conclusion',{operationnelle:'Oui','non-operationnelle':'Non'},b.conclusion)}</div>
   <label>${part==='anesthesie'?'Remarques':'Commentaire'}<textarea name="comment" maxlength="2000" placeholder="Défaut constaté, mesure prise, matériel remplacé…">${esc(b.comment)}</textarea></label>
   <div class="os-actions"><button type="button" class="secondary os-all">Tout conforme</button><button type="submit" class="primary" ${envoi?'disabled':''}>Signer la ${part==='anesthesie'?'partie anesthésie':'partie infirmière'}</button></div><p class="os-error notice warn" role="alert" hidden></p></form>`;
 }
 function draw(){
  const host=$('#os-body');if(!host)return;
  if(erreur){host.innerHTML=`<p class="notice warn">${esc(erreur)}</p>`;return}
  if(!data){host.innerHTML='<p class="j-empty">Chargement…</p>';return}
  if(!data.rooms.length){host.innerHTML='<p class="notice">Aucune salle d’opération ouverte n’est déclarée. Ajoutez les salles dans Bloc & lits › Ressources.</p>';return}
  const parts=Array.isArray(data.parts)?data.parts:['infirmier','anesthesie'],seuleInf=!parts.includes('anesthesie');
  const res=R.resume(data.records,data.rooms,parts),etat=res.etats.find(e=>e.room.id===salle)||res.etats[0],jourMeme=data.date===data.today;
  host.innerHTML=`<p class="os-sub">${seuleInf?`Partie infirmière signée pour ${res.ouvertes} salle${res.ouvertes>1?'s':''} sur ${res.total}`:`${res.ouvertes} salle${res.ouvertes>1?'s':''} ouverte${res.ouvertes>1?'s':''} sur ${res.total}`}${res.bloquees?` · <b>${res.bloquees} non opérationnelle${res.bloquees>1?'s':''}</b>`:''}</p>
  <div class="os-rooms">${res.etats.map(e=>`<button type="button" class="os-room ${e.room.id===salle?'active':''}" data-os-room="${esc(e.room.id)}"><strong>${esc(e.room.label)}</strong><span class="os-chip ${ton[e.code]}">${esc(e.label)}</span><small>Infirmière : ${e.infirmier?esc(heure(e.infirmier.at))+(e.infirmier.conclusion==='operationnelle'?' ✓':' ✕'):'à faire'}${seuleInf?'':` · Anesthésie : ${e.anesthesie?esc(heure(e.anesthesie.at))+(e.anesthesie.conclusion==='operationnelle'?' ✓':' ✕'):'à faire'}`}</small></button>`).join('')}</div>
  <div class="os-parts">${parts.map(part=>{const p=R.PARTIES[part],rec=etat[part],peut=jourMeme&&data.canSign[part],lecture=!peut&&rec&&data.canSign.anesthesie&&part==='infirmier';
   return `<section class="os-part"><h3>${esc(p.label)} · ${esc(etat.room.label)}</h3>${lecture?'<p class="os-sub">Lecture seule : cette partie est signée par l’infirmier(ère) du bloc.</p>':''}${rec?partieSignee(part,rec):''}${peut?(rec?'<details><summary>Refaire la vérification</summary>'+formulaire(part)+'</details>':formulaire(part)):rec?'':`<p class="os-sub">${jourMeme?(part==='anesthesie'?'À signer par l’anesthésiste.':'À signer par l’infirmier(ère) du bloc.'):'Non signée ce jour-là.'}</p>`}</section>`}).join('')}</div>
  ${data.records.length?`<section class="os-hist"><h3>Signatures du ${esc(data.date.split('-').reverse().join('/'))}</h3><ul>${data.records.map(r=>`<li>${esc(heure(r.at))} · ${esc(r.roomLabel)} · ${esc(R.PARTIES[r.part]?.label||r.part)} · ${esc(R.CONCLUSIONS[r.conclusion])} · ${esc(r.author)}</li>`).join('')}</ul></section>`:''}`;
  host.querySelectorAll('[data-os-room]').forEach(b=>b.onclick=()=>{salle=b.dataset.osRoom;draw()});
  host.querySelectorAll('.os-form').forEach(form=>{
   const part=form.dataset.part,b=brouillons[salle+'|'+part];
   form.onchange=form.oninput=()=>{const f=new FormData(form);for(const [k] of R.PARTIES[part].items){const v=f.get('item-'+k);if(v)b.items[k]=v}b.conclusion=f.get('conclusion')||'';b.comment=f.get('comment')||''};
   form.querySelector('.os-all').onclick=()=>{for(const [k] of R.PARTIES[part].items)b.items[k]='conforme';if(!b.conclusion)b.conclusion='operationnelle';draw()};
   form.onsubmit=async e=>{e.preventDefault();form.onchange();const msg=form.querySelector('.os-error'),err=R.erreur(part,b);if(err){msg.textContent=err;msg.hidden=false;return}
    envoi=true;try{await api({method:'POST',body:JSON.stringify({date:data.date,room:salle,part,...b})});delete brouillons[salle+'|'+part];resumeCache=null;toast?.('Ouverture signée');await charger()}catch(x){msg.textContent=x.message;msg.hidden=false}finally{envoi=false;const s=form.querySelector('[type=submit]');if(s)s.disabled=false}};
  });
 }
 function render(){
  if(!date)date=aujourdhui();
  $('#title').textContent='Ouverture des salles';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='ouvertureSalles'));
  $('#workspace').innerHTML=`<section class="panel"><div class="content"><div class="os-head"><p>${document.body.dataset.profession==='infirmier'&&document.body.dataset.admin!=='true'?'Vérifications de chaque salle avant le premier patient. La partie infirmière contrôle la salle ; elle est signée par l’infirmier(ère) du bloc et conservée.':'Vérifications de chaque salle avant le premier patient. La partie infirmière contrôle la salle, la partie anesthésie contrôle le poste d’anesthésie ; chacune est signée par son professionnel et conservée.'}</p><label>Journée<input type="date" id="os-date" value="${esc(date)}"></label></div><div id="os-body"></div></div></section>`;
  $('#os-date').onchange=e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){date=e.target.value;data=null;draw();charger()}};
  draw();charger();
 }
 // Rappel en tête de la feuille d'anesthésie : état d'ouverture des salles du jour.
 async function bandeauPerop(host){
  if(!host||host.querySelector('.os-perop'))return;
  const el=document.createElement('section');el.className='notice os-perop no-print';el.innerHTML='<span>Ouverture des salles du jour…</span>';host.prepend(el);
  try{if(!resumeCache||Date.now()-resumeAt>60000){const r=await fetch('/api/workspace/ouverture-salles',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'');resumeCache=R.resume(j.records,j.rooms,j.parts);resumeCache.seuleInf=Array.isArray(j.parts)&&!j.parts.includes('anesthesie');resumeAt=Date.now()}
   const s=resumeCache;el.innerHTML=`<strong>Ouverture des salles du jour</strong><span>${s.total?`${s.seuleInf?'Partie infirmière signée':'Salles ouvertes'} : ${s.ouvertes} / ${s.total}`:'aucune salle déclarée'}</span>${s.etats.filter(e=>e.code!=='ouverte').map(e=>`<span class="os-chip ${ton[e.code]}">${esc(e.room.label)} · ${esc(e.label)}</span>`).join('')}<button type="button" class="secondary">Ouvrir les salles</button>`;
   el.querySelector('button').onclick=()=>ctx.go('ouvertureSalles');
  }catch{el.remove()}
 }
 return {render,bandeauPerop};
};
})(window);

/* IASELO · appel du lendemain par agent vocal (4e veille, lot D), en tête du Télésuivi des patients.
   Patients opérés la veille : questionnaire J+1 rempli, appel à passer, ou rappel infirmier. En SIMULATION, le soignant
   joue le rôle du patient (scénarios prêts) ; avec l'opérateur vocal branché, les appels partent seuls.
   Règles : appel-j1-regles.js ; serveur : worker/appel-j1.mjs. */
(function(root){
'use strict';
root.createAppelJ1=function(ctx){
 const {esc,toast}=ctx;let etat=null,date='',charge=false;
 const style=document.createElement('style');
 style.textContent=`.aj-bloc{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:14px 16px;margin:0 0 16px}.aj-bloc h2{font-size:1.05rem;margin:0}
.aj-tete{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.aj-l{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center;padding:8px 0;border-top:1px solid var(--border,#e9eef1)}.aj-l p{margin:2px 0 0;font-size:14px;color:#46555c}
.aj-dlg{max-width:720px;width:calc(100% - 32px)}.aj-q{display:grid;gap:4px;margin:8px 0}.aj-q span{font-size:14px;color:#2c3a40}.aj-dit{list-style:none;padding:0;margin:8px 0;display:grid;gap:6px}.aj-dit li{padding:8px 10px;border-radius:10px;background:#eef4f6;font-size:14px}.aj-dit li.pt{background:#fff6e3;margin-left:24px}
:where(:root[data-theme=dark]) .aj-l p,:where(:root[data-theme=dark]) .aj-q span{color:#c9d5da}:where(:root[data-theme=dark]) .aj-dit li{background:#203038}:where(:root[data-theme=dark]) .aj-dit li.pt{background:#3a3222}`;
 document.head.append(style);
 const api=async(q,d)=>{const r=await fetch('/api/workspace/appel-j1'+(q||''),d?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}:{cache:'no-store'});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Error(j.error||'Erreur.');return j};
 const nom=id=>{const s=ctx.patients.find(x=>x.id===id);return [String(s?.identity?.lastName||'').toUpperCase(),s?.identity?.firstName].filter(Boolean).join(' ')||id};
 const fdt=iso=>{const x=new Date(iso);return isNaN(x)?'':x.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})};
 const LIB={douleur:'Douleur /10',nausees:'Nausées',saignement:'Saignement',temperature:'Température °C',miction:'Difficulté à uriner',respiration:'Essoufflement',mollet:'Mollet',moral:'En sécurité à domicile'};
 const STATUT={joint:'Patient joint','sans-reponse':'Pas de réponse','a-rappeler-ide':'Rappel infirmier nécessaire'};
 async function charger(){charge=true;try{etat=await api(date?'?date='+date:'');date=etat.date}catch(x){etat={erreur:x.message}}charge=false;dessiner()}
 function ligne(p){
  const der=p.appels.at(-1),al=p.appels.flatMap(a=>a.alertes);
  const etatTxt=p.repondu==='questionnaire'?'Questionnaire J+1 rempli par le patient':p.repondu==='appel'?'Joint par l’appel'+(al.length?' · '+al.map(a=>a.label).join(', '):' · sans alerte'):p.rappelInfirmier?(p.telephone?'À rappeler par une infirmière':'Pas de portable vérifié : à appeler par une infirmière'):'À appeler'+(p.tentatives?' (tentative '+(p.tentatives+1)+')':'');
  return `<div class="aj-l"><div><strong>${esc(nom(p.stay))}</strong>${der?` <span class="sc-badge ${der.urgence?'sc-crit':der.statut==='joint'?'sc-ok':'sc-warn'}">${esc(STATUT[der.statut])} ${esc(fdt(der.at))}</span>`:''}<p>${esc(etatTxt)}${p.telephone?' · '+esc(p.telephone):''}</p></div>
   <span class="sc-actions" style="margin:0">${p.repondu?'':`<button type="button" class="secondary ps-small" data-sim="${esc(p.stay)}">${etat.mode==='simulation'?'Simuler l’appel':'Voir'}</button>`}${p.appels.length?`<button type="button" class="secondary ps-small" data-voir="${esc(p.stay)}">Transcription</button>`:''}</span></div>`;
 }
 function dessiner(){
  if(ctx.view()!=='telesuivi')return;const c=document.querySelector('#workspace');if(!c)return;
  let el=c.querySelector('.aj-bloc');if(!el){el=document.createElement('section');el.className='aj-bloc';el.setAttribute('aria-labelledby','aj-t');c.prepend(el)}
  if(!etat){el.innerHTML='<p>Chargement des appels du lendemain…</p>';if(!charge)charger();return}
  if(etat.erreur){el.innerHTML=`<p class="sc-mut">${esc(etat.erreur)}</p>`;return}
  const n=etat.patients.filter(p=>p.aAppeler).length,ide=etat.patients.filter(p=>p.rappelInfirmier).length;
  el.innerHTML=`<div class="aj-tete"><h2 id="aj-t">Appels du lendemain (agent vocal)</h2><label class="sc-mut">Opérés le <input type="date" value="${esc(etat.date)}" data-date></label></div>
   <p class="sc-mut">${etat.mode==='simulation'?'<b>Simulation</b> : aucun appel ne part tant que l’opérateur vocal n’est pas branché. ':''}Les patients qui n’ont pas rempli le questionnaire du lendemain sont appelés (2 tentatives). Les réponses arrivent dans le questionnaire J+1, avec les mêmes alertes au médecin. ${n} à appeler · ${ide} à rappeler par une infirmière.</p>
   ${etat.patients.length?etat.patients.map(ligne).join(''):'<p class="sc-mut">Aucun patient opéré ce jour-là.</p>'}`;
  el.querySelector('[data-date]').onchange=e=>{date=e.target.value;etat=null;dessiner()};
  el.querySelectorAll('[data-sim]').forEach(b=>b.onclick=()=>simuler(b.dataset.sim));
  el.querySelectorAll('[data-voir]').forEach(b=>b.onclick=()=>voir(etat.patients.find(p=>p.stay===b.dataset.voir).appels.at(-1)));
 }
 let dlg=null;
 const dialogue=()=>{if(!dlg){dlg=document.createElement('dialog');dlg.className='aj-dlg';dlg.setAttribute('aria-labelledby','aj-dt');document.body.append(dlg)}return dlg};
 function simuler(stay){
  const d=dialogue(),sc=etat.script;
  d.innerHTML=`<form method="dialog"><div class="dialoghead"><h2 id="aj-dt">Simuler l’appel · ${esc(nom(stay))}</h2><button type="button" class="icon" data-fermer aria-label="Fermer">×</button></div>
   <p class="sc-mut">Vous jouez le patient : tapez ce qu’il répondrait au téléphone. L’agent comprend les réponses parlées (« sept », « trente-huit cinq », « non pas du tout »).</p>
   <p class="sc-actions">${Object.entries(etat.scenarios).map(([k,s])=>`<button type="button" class="secondary ps-small" data-scen="${k}">${esc(s.libelle)}</button>`).join('')}</p>
   <ul class="aj-dit"><li>${esc(sc.accueil)}</li></ul><label class="aj-q"><span>Date de naissance dite par le patient</span><input name="naissance" placeholder="ex. 23 septembre 1975"></label>
   ${sc.questions.map(q=>`<label class="aj-q"><span>${esc(q.parle)}</span><input name="q_${q.id}"></label>`).join('')}
   <p class="sc-actions"><button type="button" class="primary" data-lancer>Lancer l’appel simulé</button><button type="button" class="secondary" data-absent>Le patient ne répond pas</button></p></form>`;
  const f=d.querySelector('form'),s=ctx.patients.find(x=>x.id===stay);
  d.querySelector('[data-fermer]').onclick=()=>d.close();
  d.querySelectorAll('[data-scen]').forEach(b=>b.onclick=()=>{const r=etat.scenarios[b.dataset.scen].reponses;for(const [k,v] of Object.entries(r))f['q_'+k].value=v;
   const n=s?.identity?.birthDate;if(n&&!f.naissance.value){const [y,m,j]=n.split('-');f.naissance.value=Number(j)+' '+['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][Number(m)-1]+' '+y}});
  const envoyer=async action=>{try{const reponses={};sc.questions.forEach(q=>reponses[q.id]=f['q_'+q.id].value);
   const r=await api('',{action,stay,date:etat.date,naissance:f.naissance.value,reponses});
   if(action==='simuler'){voir({...r.appel,at:new Date().toISOString(),statut:r.appel.statut},reponses)}else d.close();
   toast(STATUT[r.appel.statut]+'.');etat=null;dessiner()}catch(x){toast(x.message)}};
  d.querySelector('[data-lancer]').onclick=()=>envoyer('simuler');d.querySelector('[data-absent]').onclick=()=>envoyer('sans-reponse');
  if(!d.open)d.showModal();
 }
 function voir(a,reponses){
  const d=dialogue();
  d.innerHTML=`<div class="dialoghead"><h2 id="aj-dt">Appel du lendemain · ${esc(STATUT[a.statut]||a.statut)}</h2><button type="button" class="icon" data-fermer aria-label="Fermer">×</button></div>
   ${a.urgence?'<p class="sc-badge sc-crit">Signe grave : l’agent a dit d’appeler le 15 et l’équipe est prévenue.</p>':''}
   ${a.alertes?.length?`<p><b>Alertes au médecin :</b> ${esc(a.alertes.map(x=>x.label).join(', '))}</p>`:a.statut==='joint'?'<p>Aucune alerte.</p>':''}
   <ol class="aj-dit">${(a.dit||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
   ${Object.keys(a.reponses||{}).length?`<p class="sc-mut">Réponses comprises : ${esc(Object.entries(a.reponses).map(([k,v])=>(LIB[k]||k)+' : '+String(v).replace('.',',')).join(' · '))}</p>`:''}
   <p class="sc-actions"><button type="button" class="secondary" data-fermer2>Fermer</button></p>`;
  d.querySelector('[data-fermer]').onclick=d.querySelector('[data-fermer2]').onclick=()=>d.close();if(!d.open)d.showModal();
 }
 new MutationObserver(()=>{if(ctx.view()==='telesuivi'&&!document.querySelector('#workspace .aj-bloc'))dessiner()}).observe(document.documentElement,{childList:true,subtree:true});
 return {dessiner};
};
})(typeof self!=='undefined'?self:this);

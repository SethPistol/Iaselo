/* IASELO · alertes du bloc en temps réel + accueil du patient le jour J (5e veille, lot 3).
   1. Centre d'alertes (bouton « Bloc » en bas à droite) : le fil calculé par le serveur à partir du programme (patient arrivé,
      installé, fin, sorti du bloc, patient suivant à préparer, retard, arrivée à la clinique). Mise à jour toutes les 20 s.
      Notification du téléphone ou de l'ordinateur si l'utilisateur l'a activée : SANS nom de patient (écran verrouillé).
   2. Écran « Arrivées du jour » (accueil, soignants) : patients attendus, arrivée par QR code ou notée à l'accueil,
      identité vérifiée ; affiche du QR code de l'entrée à imprimer.
   Règles : alertes-bloc-regles.js ; serveur : worker/accueil-bloc.mjs. */
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const hm=s=>{const m=/T(\d{2}):(\d{2})/.exec(String(s||''));return m?Number(m[1])+' h '+m[2]:''};
const lire=(k,v)=>{try{const x=localStorage.getItem('iaselo.alertesBloc.'+k);return x===null?v:JSON.parse(x)}catch{return v}};
const ecrire=(k,v)=>{try{localStorage.setItem('iaselo.alertesBloc.'+k,JSON.stringify(v))}catch{}};
const ICON_BLOC='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const style=document.createElement('style');
style.textContent=`.ab-cloche{position:fixed;right:18px;bottom:18px;z-index:40;display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;border:1px solid var(--i-line,#d5dee3);background:var(--i-s1,#fff);color:var(--i-ink,#14232b);font:inherit;font-weight:600;box-shadow:0 8px 24px rgba(10,30,40,.18);cursor:pointer}
.ab-cloche b{min-width:22px;height:22px;border-radius:11px;background:#b42318;color:#fff;font-size:12px;display:inline-grid;place-items:center;padding:0 6px}.ab-cloche b[hidden]{display:none}
.ab-panel{position:fixed;right:18px;bottom:72px;z-index:41;width:min(420px,calc(100vw - 24px));max-height:min(70vh,640px);display:flex;flex-direction:column;border-radius:16px;background:var(--i-s1,#fff);color:var(--i-ink,#14232b);box-shadow:0 24px 60px rgba(10,30,40,.28);border:1px solid var(--i-line,#d5dee3)}
.ab-panel[hidden]{display:none}.ab-panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--i-line,#d5dee3)}.ab-panel h2{font-size:17px;margin:0}
.ab-liste{list-style:none;margin:0;padding:8px;overflow:auto;display:grid;gap:6px}.ab-liste li{padding:9px 11px;border-radius:10px;background:var(--i-s2,#f3f6f8);border-left:4px solid #8aa0aa}
.ab-liste li.nouveau{background:#eef6ff}.ab-liste li.action{border-left-color:#c98a12}.ab-liste li.alerte{border-left-color:#b42318}.ab-liste p{margin:2px 0 0;font-size:14px}.ab-liste small{color:var(--i-mut,#4d5f68)}
.ab-pied{display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px;border-top:1px solid var(--i-line,#d5dee3)}.ab-vide{padding:16px;color:var(--i-mut,#4d5f68)}
.ab-pile{position:fixed;right:18px;bottom:72px;z-index:42;display:grid;gap:8px;width:min(380px,calc(100vw - 24px))}
.ab-toast{padding:12px 14px;border-radius:12px;background:#14232b;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.25);display:grid;gap:4px}.ab-toast b{font-size:15px}.ab-toast button{justify-self:end;background:none;border:1px solid #fff6;color:#fff;border-radius:8px;padding:3px 10px;font:inherit;font-size:13px;cursor:pointer}
.ar-table{width:100%;border-collapse:collapse}.ar-table th,.ar-table td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--i-line,#d5dee3);vertical-align:top}.ar-table td small{display:block;color:var(--i-mut,#4d5f68)}
.ar-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12.5px;font-weight:600}.ar-badge.ok{background:#e8f5ec;color:#14532d}.ar-badge.att{background:#fff4dc;color:#7a4a00}.ar-badge.non{background:#f2f5f7;color:#4d5f68}
.ar-actions{display:flex;gap:6px;flex-wrap:wrap}
@media print{.ab-cloche,.ab-panel,.ab-pile{display:none!important}}`;
document.head.appendChild(style);

/* ---------- 1. Centre d'alertes ---------- */
let alertes=[],vues=new Set(lire('vues',[])),actif=true,bouton=null,panneau=null,pile=null,premier=true;
const nonVues=()=>alertes.filter(a=>!vues.has(a.id));
function memoriser(){ecrire('vues',[...vues].slice(-400))}
function construire(){
 bouton=document.createElement('button');bouton.type='button';bouton.className='ab-cloche';bouton.setAttribute('aria-haspopup','dialog');bouton.innerHTML=ICON_BLOC+'<span>Bloc</span><b hidden></b>';
 panneau=document.createElement('section');panneau.className='ab-panel';panneau.hidden=true;panneau.setAttribute('role','dialog');panneau.setAttribute('aria-label','Alertes du bloc');
 pile=document.createElement('div');pile.className='ab-pile';pile.setAttribute('aria-live','polite');
 document.body.append(bouton,panneau,pile);
 bouton.onclick=()=>{panneau.hidden=!panneau.hidden;if(!panneau.hidden){pile.innerHTML='';dessiner();panneau.querySelector('button')?.focus()}};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panneau.hidden){panneau.hidden=true;bouton.focus()}});
}
function dessiner(){
 const n=nonVues().length,b=bouton.querySelector('b');b.hidden=!n;b.textContent=n;bouton.setAttribute('aria-label','Alertes du bloc'+(n?', '+n+' nouvelle(s)':''));
 if(panneau.hidden)return;
 const perm=typeof Notification==='undefined'?'indisponible':Notification.permission;
 panneau.innerHTML=`<header><h2>Alertes du bloc · aujourd’hui</h2><button type="button" class="icon" data-ab-fermer aria-label="Fermer">×</button></header>
 ${alertes.length?`<ul class="ab-liste">${alertes.map(a=>`<li class="${esc(a.niveau)} ${vues.has(a.id)?'':'nouveau'}"><small>${esc(hm(a.at))}${a.salle?' · '+esc(a.salle):''}</small><p><b>${esc(a.titre)}</b>${a.patient?' · '+esc(a.patient):''}</p><p>${esc(a.texte)}</p></li>`).join('')}</ul>`:'<p class="ab-vide">Aucune alerte pour vous aujourd’hui.</p>'}
 <div class="ab-pied"><button type="button" class="secondary" data-ab-vu>Tout marquer comme vu</button>${perm==='default'?'<button type="button" class="secondary" data-ab-notif>Recevoir les notifications sur cet appareil</button>':perm==='granted'?'<span class="ab-vide" style="padding:6px 0">Notifications activées sur cet appareil</span>':''}<button type="button" class="secondary" data-ab-arrivees>Arrivées du jour</button></div>`;
 panneau.querySelector('[data-ab-fermer]').onclick=()=>{panneau.hidden=true;bouton.focus()};
 panneau.querySelector('[data-ab-vu]').onclick=()=>{alertes.forEach(a=>vues.add(a.id));memoriser();dessiner()};
 panneau.querySelector('[data-ab-notif]')?.addEventListener('click',async()=>{try{await Notification.requestPermission()}catch{}dessiner()});
 panneau.querySelector('[data-ab-arrivees]').onclick=()=>{panneau.hidden=true;root.IaseloArrivees?.ouvrir?.()};
}
function annoncer(a){
 const el=document.createElement('div');el.className='ab-toast';el.innerHTML=`<b>${esc(a.titre)}</b><span>${esc(a.texte)}${a.patient?' · '+esc(a.patient):''}</span><button type="button">Vu</button>`;
 el.querySelector('button').onclick=()=>{vues.add(a.id);memoriser();el.remove();dessiner()};pile.prepend(el);setTimeout(()=>el.remove(),12000);
 while(pile.children.length>3)pile.lastChild.remove();
 if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.hidden){const n=a.notification||{titre:'IASELO',corps:a.titre};
  navigator.serviceWorker?.getRegistration?.().then(r=>r?r.showNotification(n.titre,{body:n.corps,tag:a.id,icon:'assets/app/icone-192.png'}):new Notification(n.titre,{body:n.corps,tag:a.id})).catch(()=>{try{new Notification(n.titre,{body:n.corps,tag:a.id})}catch{}})}
}
async function relever(){
 if(!actif)return;
 try{const r=await fetch('/api/workspace/alertes-bloc',{cache:'no-store',credentials:'same-origin'});if(r.status===401||r.status===403){actif=false;return}if(!r.ok)return;
  const j=await r.json();const avant=new Set(alertes.map(a=>a.id));alertes=j.alertes||[];
  if(!bouton&&(alertes.length||document.querySelector('aside .nav')))construire();if(!bouton)return;
  const maintenant=Date.parse(String(j.maintenant||'')+':00')||Date.now();
  for(const a of alertes)if(!avant.has(a.id)&&!vues.has(a.id)&&(!premier||maintenant-Date.parse(a.at+':00')<10*60000))annoncer(a);
  premier=false;dessiner();
 }catch{}
}
function demarrer(){
 if(document.body?.dataset.patientPage==='true'||!document.querySelector('#workspace'))return;
 setTimeout(relever,2500);setInterval(()=>{if(!document.hidden||Date.now()%60000<20000)relever()},20000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',demarrer);else demarrer();

/* ---------- 2. Écran « Arrivées du jour » ---------- */
root.createArrivees=function(ctx){
 let donnees=null,erreur='',minuteur=null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V5l7-2v18"/><path d="M12 7h6v14"/><path d="M9 12h.01"/></svg>';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="arrivees"]'))return;
  const apres=document.querySelector('aside .nav[data-view="sorties"]')||document.querySelector('aside .nav[data-view="controle"]');if(!apres)return;
  const job=ctx.job?.();if(job&&!['secretariat'].includes(job)&&!ctx.isAdmin?.())return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='arrivees';b.innerHTML=ICON+'Arrivées du jour';b.onclick=()=>ctx.go('arrivees');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,600));else setTimeout(bouton,600);
 async function charger(){try{const r=await fetch('/api/workspace/arrivees',{cache:'no-store',credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Service indisponible.');donnees=j;erreur=''}catch(e){erreur=e.message}if(ctx.view()==='arrivees')dessinerVue()}
 async function agir(action,stay){try{const r=await fetch('/api/workspace/arrivees',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,stay})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Action impossible.');ctx.toast(action==='arrive'?'Arrivée notée'+(j.proches?' · '+j.proches:''):action==='confirmer'?'Identité vérifiée':'Arrivée annulée')}catch(e){ctx.toast(e.message)}await charger();relever()}
 function affiche(){
  const url=location.origin+'/arrivee.html',w=window.open('','_blank','noopener=no');if(!w){ctx.toast('Autorisez l’ouverture d’une fenêtre pour imprimer l’affiche');return}
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affiche · arrivée des patients</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#14232b}h1{font-size:42px;margin:0 0 10px}p{font-size:22px;margin:8px 0}.en{color:#4d5f68;font-size:18px}svg{margin:26px auto;display:block}small{color:#4d5f68}</style></head><body><h1>Bienvenue</h1><p>Flashez ce code avec votre téléphone pour signaler votre arrivée.</p><p class="en">Scan this code with your phone to let us know you have arrived.</p>${root.IaseloQR?root.IaseloQR.svg(url,{taille:420,titre:'QR code : signaler son arrivée'}):''}<p>Puis présentez-vous à l’accueil des admissions avec votre pièce d’identité.</p><small>${esc(url)}</small></body></html>`);w.document.close();setTimeout(()=>w.print(),400);
 }
 function dessinerVue(){
  const host=document.querySelector('#workspace');if(!host)return;
  const L=donnees?.patients||[],arrives=L.filter(p=>p.arrivee).length;
  host.innerHTML=`<div class="v-wrap"><header class="v-head"><div><p class="v-kicker">${ICON} Accueil · jour de l’intervention</p><h3>Arrivées du jour</h3><p class="v-sub">Patients attendus au bloc aujourd’hui. Le patient signale son arrivée en flashant le QR code de l’entrée (nom et date de naissance) ; l’accueil vérifie ensuite son identité. L’étage et le bloc sont prévenus, et les proches si le patient l’a accepté.</p></div><div class="ar-actions"><button type="button" class="secondary" data-ar-affiche>Imprimer l’affiche du QR code</button><button type="button" class="secondary" data-ar-maj>Actualiser</button></div></header>
  <div class="v-kpis"><div class="v-kpi"><span>Attendus</span><strong>${L.length}</strong></div><div class="v-kpi"><span>Arrivés</span><strong>${arrives}</strong></div><div class="v-kpi"><span>Identité vérifiée</span><strong>${L.filter(p=>p.arrivee?.confirmePar).length}</strong></div><div class="v-kpi"><span>Pas encore arrivés</span><strong>${L.length-arrives}</strong></div></div>
  ${erreur?`<p class="nursing-error" role="alert">${esc(erreur)}</p>`:''}
  <section class="v-card"><div class="am-scroll"><table class="ar-table"><caption class="dq-sr">Patients attendus aujourd’hui</caption><thead><tr><th scope="col">Passage</th><th scope="col">Patient</th><th scope="col">Salle · chirurgien</th><th scope="col">Arrivée</th><th scope="col">Actions</th></tr></thead><tbody>
  ${L.map(p=>`<tr><td>${esc(hm(p.passage))}</td><td><b>${esc(p.nom||p.stay)}</b><small>${esc(p.stay)}${p.chambre?' · chambre '+esc(p.chambre):''}</small></td><td>${esc(p.salle)}<small>${esc(p.chirurgien||'')}</small></td>
   <td>${p.arrivee?`<span class="ar-badge ${p.arrivee.confirmePar?'ok':'att'}">${p.arrivee.confirmePar?'Identité vérifiée':'Arrivé, identité à vérifier'}</span><small>${esc(new Date(p.arrivee.at).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}))} · ${p.arrivee.source==='qr'?'QR code de l’entrée':'noté par '+esc(p.arrivee.par)}</small>`:'<span class="ar-badge non">Pas encore arrivé</span>'}</td>
   <td><div class="ar-actions">${!p.arrivee?`<button type="button" class="primary" data-ar="arrive" data-stay="${esc(p.stay)}">Arrivé</button>`:''}${p.arrivee&&!p.arrivee.confirmePar?`<button type="button" class="primary" data-ar="confirmer" data-stay="${esc(p.stay)}">Identité vérifiée</button>`:''}${p.arrivee?`<button type="button" class="secondary" data-ar="annuler" data-stay="${esc(p.stay)}">Annuler</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="5">Aucun patient attendu au bloc aujourd’hui.</td></tr>'}
  </tbody></table></div></section></div>`;
  host.querySelectorAll('[data-ar]').forEach(b=>b.onclick=()=>agir(b.dataset.ar,b.dataset.stay));
  host.querySelector('[data-ar-maj]').onclick=charger;host.querySelector('[data-ar-affiche]').onclick=affiche;
 }
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Arrivées du jour';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='arrivees'));
  dessinerVue();charger();clearInterval(minuteur);minuteur=setInterval(()=>{if(ctx.view()==='arrivees')charger();else clearInterval(minuteur)},30000);
 }
 root.IaseloArrivees={ouvrir:()=>ctx.go('arrivees')};
 return {render};
};
})(window);

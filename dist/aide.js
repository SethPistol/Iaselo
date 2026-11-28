/* IASELO · aide intégrée (5e veille, lot 4) : bouton « Aide » (F1) en bas du menu, « Comment faire… », nouveautés,
   visite guidée par métier à la première connexion (rejouable). Contenu : aide-regles.js. Rien n'est envoyé au serveur ;
   la visite faite et les nouveautés vues sont mémorisées sur cet appareil. */
(function(root){
'use strict';
const H=()=>root.IaseloAide;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const lire=(k,v)=>{try{const x=localStorage.getItem('iaselo.aide.'+k);return x===null?v:JSON.parse(x)}catch{return v}};
const ecrire=(k,v)=>{try{localStorage.setItem('iaselo.aide.'+k,JSON.stringify(v))}catch{}};
const ICON='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.7.3-1.2 1-1.2 1.7v.6"/><path d="M12 17.2h.01"/></svg>';
const style=document.createElement('style');
style.textContent=`.aide-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:0 0 8px}.aide-btn b{min-width:20px;height:20px;border-radius:10px;background:#b42318;color:#fff;font-size:12px;display:inline-grid;place-items:center;padding:0 5px}.aide-btn b[hidden]{display:none}
.aide{width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 32px);border:0;border-radius:18px;padding:0;background:var(--i-s1,#fff);color:var(--i-ink,#14232b);box-shadow:0 24px 60px rgba(10,30,40,.25)}.aide::backdrop{background:rgba(10,30,40,.45)}
.aide-in{padding:18px 20px;display:grid;gap:12px}.aide header{display:flex;justify-content:space-between;align-items:center}.aide h2{margin:0;font-size:20px;display:flex;gap:8px;align-items:center}
.aide-onglets{display:flex;gap:6px;flex-wrap:wrap}.aide-onglets button[aria-selected=true]{background:var(--i-acc,#134f5c);color:#fff;border-color:var(--i-acc,#134f5c)}
.aide-q{display:flex;gap:8px}.aide-q input{flex:1;min-width:0;font:inherit;padding:10px 12px;border:1px solid var(--i-line-strong,#9fb0b8);border-radius:10px}
.aide-fiches{display:grid;gap:8px;max-height:56vh;overflow:auto;margin:0;padding:0;list-style:none}.aide-fiche{border:1px solid var(--i-line,#d5dee3);border-radius:12px;padding:10px 12px}
.aide-fiche h3{font-size:16px;margin:0 0 6px}.aide-fiche ol{margin:0 0 8px;padding-left:20px;display:grid;gap:3px;font-size:14.5px}.aide-fiche .aide-pour{font-size:12.5px;color:var(--i-mut,#4d5f68)}
.aide-nv{border-left:4px solid var(--i-acc,#134f5c);padding:8px 12px;background:var(--i-s2,#f3f6f8);border-radius:10px}.aide-nv.nouveau{border-left-color:#b42318}.aide-nv h3{margin:0 0 4px;font-size:15.5px}.aide-nv p{margin:0;font-size:14.5px}.aide-nv small{color:var(--i-mut,#4d5f68)}
.aide-voile{position:fixed;inset:0;z-index:60;pointer-events:auto}.aide-trou{position:fixed;z-index:61;border-radius:12px;box-shadow:0 0 0 9999px rgba(10,30,40,.55),0 0 0 3px #fff;transition:all .2s;pointer-events:none}
.aide-bulle{position:fixed;z-index:62;width:min(340px,calc(100vw - 24px));background:var(--i-s1,#fff);color:var(--i-ink,#14232b);border-radius:14px;padding:14px 16px;box-shadow:0 18px 40px rgba(0,0,0,.3);display:grid;gap:8px}
.aide-bulle h3{margin:0;font-size:17px}.aide-bulle p{margin:0;font-size:15px}.aide-bulle footer{display:flex;justify-content:space-between;align-items:center;gap:8px}.aide-bulle small{color:var(--i-mut,#4d5f68)}
@media (max-width:560px){.aide-q{flex-direction:column}}@media print{.aide-btn{display:none}}`;
document.head.appendChild(style);

root.createAide=function(ctx){
 let dlg=null,onglet='faire',bouton=null;
 const metier=()=>ctx.job?.()||'';
 const vues=()=>lire('nouveautesVues',[]);
 function badge(){if(!bouton||!H())return;const n=H().nonVues(metier(),vues()).length,b=bouton.querySelector('b');b.hidden=!n;b.textContent=n;bouton.setAttribute('aria-label','Aide'+(n?', '+n+' nouveauté(s)':''))}
 function installer(){
  if(bouton&&document.contains(bouton))return;const bas=document.querySelector('aside .asidebottom');if(!bas)return;
  bouton=document.createElement('button');bouton.type='button';bouton.className='secondary aide-btn';bouton.dataset.aideOuvrir='';bouton.title='Aide (F1)';bouton.innerHTML=ICON+'<span>Aide</span><b hidden></b>';
  bouton.onclick=()=>ouvrir();bas.prepend(bouton);badge();
 }
 function fiche(f){return `<li class="aide-fiche"><h3>${esc(f.titre)}</h3><ol>${f.etapes.map(e=>`<li>${esc(e)}</li>`).join('')}</ol>${f.vue?`<button type="button" class="secondary" data-aide-aller="${esc(f.vue)}">Y aller</button>`:''}</li>`}
 function dessiner(q=''){
  const A=H(),m=metier();
  const contenu=onglet==='faire'?`<div class="aide-q"><label for="aide-q" class="dq-sr">Comment faire…</label><input id="aide-q" placeholder="Comment faire… (ex. : donner une dose, faire la relève, accueillir un patient)" value="${esc(q)}" autocomplete="off"><button type="button" class="primary" data-aide-chercher>Chercher</button></div><ul class="aide-fiches" aria-live="polite">${(()=>{const r=A.chercher(q,m);return r.length?r.slice(0,q?6:40).map(fiche).join(''):'<li>Aucune fiche ne correspond. Essayez d’autres mots, ou demandez à votre cadre.</li>'})()}</ul>`
  :onglet==='nouveautes'?`<ul class="aide-fiches">${A.NOUVEAUTES.filter(n=>!m||n.metiers.includes(m)).map(n=>`<li class="aide-nv ${vues().includes(n.id)?'':'nouveau'}"><small>${esc(n.date.split('-').reverse().join('/'))}</small><h3>${esc(n.titre)}</h3><p>${esc(n.texte)}</p>${n.fiche?`<button type="button" class="secondary" data-aide-fiche="${esc(n.fiche)}" style="margin-top:6px">Comment faire</button>`:''}</li>`).join('')}</ul>`
  :`<p>La visite montre en quelques étapes les écrans utiles à votre métier.</p><button type="button" class="primary" data-aide-visite>Lancer la visite guidée</button>`;
  const nv=A.nonVues(m,vues()).length;
  dlg.innerHTML=`<div class="aide-in"><header><h2 id="aide-titre">${ICON}Aide</h2><button type="button" class="icon" data-aide-fermer aria-label="Fermer">×</button></header>
  <div class="aide-onglets" role="tablist" aria-label="Rubriques de l’aide">${[['faire','Comment faire…'],['nouveautes','Nouveautés'+(nv?' ('+nv+')':'')],['visite','Visite guidée']].map(([k,l])=>`<button type="button" role="tab" class="secondary" aria-selected="${k===onglet}" data-aide-onglet="${k}">${esc(l)}</button>`).join('')}</div>
  <div role="tabpanel">${contenu}</div></div>`;
  dlg.querySelector('[data-aide-fermer]').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-aide-onglet]').forEach(b=>b.onclick=()=>{onglet=b.dataset.aideOnglet;dessiner();if(onglet==='nouveautes'){ecrire('nouveautesVues',[...new Set([...vues(),...A.NOUVEAUTES.map(n=>n.id)])]);badge()}});
  const inp=dlg.querySelector('#aide-q');if(inp){const go=()=>{dessiner(inp.value);const i=dlg.querySelector('#aide-q');i.focus();i.setSelectionRange(i.value.length,i.value.length)};dlg.querySelector('[data-aide-chercher]').onclick=go;inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}}}
  dlg.querySelectorAll('[data-aide-aller]').forEach(b=>b.onclick=()=>{dlg.close();ctx.go(b.dataset.aideAller)});
  dlg.querySelectorAll('[data-aide-fiche]').forEach(b=>b.onclick=()=>{onglet='faire';const f=A.FICHES.find(x=>x.id===b.dataset.aideFiche);dessiner(f?f.titre:'')});
  dlg.querySelector('[data-aide-visite]')?.addEventListener('click',()=>{dlg.close();visite(true)});
 }
 function ouvrir(o){if(!H())return;if(!dlg){dlg=document.createElement('dialog');dlg.className='aide';dlg.setAttribute('aria-labelledby','aide-titre');document.body.appendChild(dlg)}if(o)onglet=o;dessiner();if(!dlg.open)dlg.showModal();(dlg.querySelector('#aide-q')||dlg.querySelector('[data-aide-onglet]'))?.focus()}
 // Visite guidée : met en lumière un élément du menu à la fois.
 function visite(forcee=false){
  const A=H(),m=metier();if(!A)return;const cle='visite.'+(m||'tous');if(!forcee&&lire(cle,false))return;
  const etapes=A.visite(m).filter(e=>{const el=document.querySelector(e.cible);return el&&el.offsetParent!==null});if(!etapes.length)return;
  let i=0;const voile=document.createElement('div'),trou=document.createElement('div'),bulle=document.createElement('section');
  voile.className='aide-voile';trou.className='aide-trou';bulle.className='aide-bulle';bulle.setAttribute('role','dialog');bulle.setAttribute('aria-modal','true');bulle.setAttribute('aria-labelledby','aide-v-titre');
  document.body.append(voile,trou,bulle);
  const fin=()=>{ecrire(cle,true);voile.remove();trou.remove();bulle.remove();document.removeEventListener('keydown',clavier,true);bouton?.focus()};
  const clavier=e=>{if(e.key==='Escape'){e.preventDefault();fin()}else if(e.key==='ArrowRight'){e.preventDefault();aller(1)}else if(e.key==='ArrowLeft'){e.preventDefault();aller(-1)}};
  function placer(){
   const e=etapes[i],el=document.querySelector(e.cible);el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),pad=6;
   Object.assign(trou.style,{left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+2*pad+'px',height:r.height+2*pad+'px'});
   bulle.innerHTML=`<h3 id="aide-v-titre">${esc(e.titre)}</h3><p>${esc(e.texte)}</p><footer><small>${i+1} / ${etapes.length}</small><span style="display:flex;gap:6px">${i?'<button type="button" class="secondary" data-v="-1">Précédent</button>':'<button type="button" class="secondary" data-v="passer">Passer</button>'}<button type="button" class="primary" data-v="1">${i===etapes.length-1?'Terminer':'Suivant'}</button></span></footer>`;
   const bw=Math.min(340,innerWidth-24),bh=bulle.offsetHeight||170;let x=r.right+16,y=r.top;
   if(x+bw>innerWidth-12){x=Math.max(12,Math.min(innerWidth-bw-12,r.left));y=r.top-bh-16;if(y<12)y=r.bottom+16}
   y=Math.max(12,Math.min(y,innerHeight-bh-12));Object.assign(bulle.style,{left:x+'px',top:y+'px'});
   bulle.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>b.dataset.v==='passer'?fin():aller(Number(b.dataset.v)));
   bulle.querySelector('.primary').focus();
  }
  function aller(d){i+=d;if(i>=etapes.length)return fin();if(i<0)i=0;placer()}
  voile.onclick=()=>{};document.addEventListener('keydown',clavier,true);placer();
 }
 document.addEventListener('keydown',e=>{if(e.key==='F1'){e.preventDefault();ouvrir()}});
 // Installation après le chargement de l'application et des droits ; visite à la première connexion.
 let essais=0;const t=setInterval(()=>{essais++;installer();if(document.body.dataset.appReady==='true'&&bouton&&(metier()||essais>20)){clearInterval(t);setTimeout(()=>{if(!document.querySelector('dialog[open]'))visite(false)},1200)}if(essais>60)clearInterval(t)},500);
 return {ouvrir,visite:()=>visite(true),installer};
};
})(window);

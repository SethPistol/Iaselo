// IASELO · accessibilité commune (RGAA 4.1, 27/11/2026). Chargé par l'application et les pages patient.
//  - lien d'évitement « Aller au contenu » (critère 12.7) vers <main id="contenu">,
//  - titre de la page = titre de la vue affichée (8.6), titre de niveau 1 toujours présent (9.1),
//  - niveaux de titres sans saut (9.1) : un h3 qui suit un h1 est restitué comme niveau 2 (aria-level), sans toucher à l'aspect.
(()=>{
 const d=document;if(window.IaseloA11y)return;
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0||e.classList.contains('a11y-masque')};
 function evitement(){
  const main=d.querySelector('main');if(!main||d.querySelector('.a11y-evitement'))return;
  if(!main.id)main.id='contenu';main.setAttribute('tabindex','-1');
  const a=d.createElement('a');a.className='a11y-evitement';a.href='#'+main.id;a.textContent=(d.documentElement.lang||'fr').startsWith('en')?'Skip to content':'Aller au contenu';
  a.addEventListener('click',ev=>{ev.preventDefault();main.focus();main.scrollIntoView()});
  d.body.prepend(a);
 }
 const base=d.title;
 function titre(){
  const h=d.getElementById('title');if(!h)return;
  let cache=d.getElementById('a11y-h1');
  const h1Visible=[...d.querySelectorAll('h1')].some(x=>x!==cache&&visible(x));
  if(!h1Visible){if(!cache){cache=d.createElement('h1');cache.id='a11y-h1';cache.className='a11y-masque';(d.getElementById('workspace')||d.querySelector('main')).prepend(cache)}if(cache.textContent!==h.textContent)cache.textContent=h.textContent}
  else if(cache)cache.remove();
  const t=h.textContent.trim();const voulu=t?t+' · '+base:base;if(d.title!==voulu)d.title=voulu;
 }
 function niveaux(){
  const zone=d.querySelector('main');if(!zone)return;let prec=0;
  for(const h of zone.querySelectorAll('h1,h2,h3,h4,h5,h6,[data-a11y-niveau]')){
   if(!/^H\d$/.test(h.tagName)&&!h.dataset.a11yNiveau)continue;
   if(!visible(h))continue;
   const natif=+h.tagName[1];
   let n=natif;if(prec&&n>prec+1)n=prec+1;
   if(n!==natif){if(h.getAttribute('aria-level')!==String(n)){h.setAttribute('role','heading');h.setAttribute('aria-level',String(n));h.dataset.a11yNiveau='1'}}
   else if(h.dataset.a11yNiveau){h.removeAttribute('role');h.removeAttribute('aria-level');delete h.dataset.a11yNiveau}
   prec=n;
  }
 }
 let attente=0;const passe=()=>{attente=0;titre();niveaux()};
 const planifier=()=>{if(!attente)attente=requestAnimationFrame(passe)};
 function demarrer(){evitement();passe();new MutationObserver(planifier).observe(d.body,{childList:true,subtree:true,characterData:true})}
 window.IaseloA11y={passe,niveaux,titre};
 d.readyState==='loading'?d.addEventListener('DOMContentLoaded',demarrer):demarrer();
})();

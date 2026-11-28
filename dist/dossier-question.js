/* IASELO · « Interroger le dossier » : question en langage courant, réponse citée et sourcée (moteur local).
   decorer(stay, ctx) ajoute le bouton dans l'en-tête du dossier ; ctx = {esc, aller(onglet), news2?, nursing?(stay)}.
   La question n'est ni envoyée ni conservée. */
(function(){
'use strict';
const Q=()=>window.IaseloDossierQuestion;
let dlg=null,courant=null,ctxCourant=null;
const style=document.createElement('style');style.textContent=`.dq-open{display:inline-flex;align-items:center;gap:6px}
.dq{width:min(720px,calc(100vw - 24px));max-height:calc(100vh - 32px);border:0;border-radius:18px;padding:0;background:var(--i-s1,#fff);color:var(--i-ink,#14232b);box-shadow:0 24px 60px rgba(10,30,40,.25)}
.dq::backdrop{background:rgba(10,30,40,.45)}.dq-form{padding:18px 20px;display:grid;gap:12px}
.dq header{display:flex;justify-content:space-between;align-items:center;gap:12px}.dq h2{display:flex;align-items:center;gap:8px;margin:0;font-size:20px}
.dq-aide,.dq-note{margin:0;color:var(--i-mut,#4d5f68);font-size:14px}.dq-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.dq-saisie{display:flex;gap:8px}.dq-saisie input{flex:1;min-width:0;font:inherit;padding:10px 12px;border:1px solid var(--i-line-strong,#9fb0b8);border-radius:10px}
.dq-sugg{display:flex;flex-wrap:wrap;gap:6px}.dq-chip{font:inherit;font-size:13px;padding:5px 10px;border-radius:999px;border:1px solid var(--i-line,#d5dee3);background:var(--i-s2,#f3f6f8);color:var(--i-ink,#14232b);cursor:pointer}
.dq-chip:hover,.dq-chip:focus-visible{border-color:var(--i-acc,#134f5c)}
.dq-rep:empty{display:none}.dq-rep{border-top:1px solid var(--i-line,#d5dee3);padding-top:12px}.dq-rep h3{margin:0 0 4px;font-size:16px}.dq-texte{margin:0 0 10px;font-size:16px;font-weight:600}
.dq-el{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:6px;max-height:42vh;overflow:auto}.dq-el li{padding:8px 10px;border-radius:10px;background:var(--i-s2,#f3f6f8)}
.dq-el li div{display:flex;flex-wrap:wrap;gap:4px 8px}.dq-el b{font-size:14px}.dq-el span{font-size:14px}.dq-src{margin:2px 0 0;font-size:12.5px;color:var(--i-mut,#4d5f68)}
.dq-lien{font:inherit;font-size:12.5px;background:none;border:0;padding:0 2px;color:var(--i-acc,#134f5c);text-decoration:underline;cursor:pointer}
.rl-auto{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--i-s2,#f3f6f8);font-size:14px}.rl-auto summary{cursor:pointer;font-weight:600}
.rl-auto ol{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px}.rl-auto li b{display:inline-block;min-width:1.4em;color:var(--i-acc,#134f5c)}
.rl-alertes{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 0}.rl-alertes span{font-size:12px;padding:2px 8px;border-radius:999px;background:#fdeaea;color:#8a1c1c}
.rl-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
@media (max-width:560px){.dq-saisie{flex-direction:column}}
@media print{.rl-auto{background:none;padding:0}.rl-actions{display:none}}`;document.head.appendChild(style);
const ICON='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/><path d="M9.2 9.3a2 2 0 1 1 2.6 1.9c-.5.2-.8.6-.8 1.1v.4"/><path d="M11 14.6h.01"/></svg>';
function esc(s){return (ctxCourant?.esc||(x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])))(s)}
function construire(){
 dlg=document.createElement('dialog');dlg.id='dq-dialog';dlg.className='dq';dlg.setAttribute('aria-labelledby','dq-titre');
 dlg.innerHTML=`<form class="dq-form" data-dq-form><header><h2 id="dq-titre">${ICON}Interroger le dossier</h2><button type="button" class="icon" data-dq-close aria-label="Fermer">×</button></header>
 <p class="dq-aide">Posez une question en langage courant. La réponse est construite uniquement à partir du dossier, avec la source de chaque élément. Rien n’est envoyé hors d’IASELO.</p>
 <div class="dq-saisie"><label for="dq-q" class="dq-sr">Votre question</label><input id="dq-q" name="q" autocomplete="off" maxlength="200" placeholder="Ex. : dernière dose de paracétamol, allergies, douleur sur 24 h…"><button class="primary" type="submit">Demander</button></div>
 <div class="dq-sugg" role="group" aria-label="Questions fréquentes"></div>
 <section class="dq-rep" aria-live="polite"></section></form>`;
 document.body.appendChild(dlg);
 dlg.querySelector('[data-dq-close]').onclick=()=>dlg.close();
 dlg.querySelector('[data-dq-form]').onsubmit=e=>{e.preventDefault();repondre(dlg.querySelector('#dq-q').value)};
}
function repondre(question){
 const r=Q().repondre(question,courant,{maintenant:new Date()}),zone=dlg.querySelector('.dq-rep');
 zone.innerHTML=`<h3>${esc(r.titre)}</h3><p class="dq-texte">${esc(r.reponse)}</p>${r.elements.length?`<ul class="dq-el">${r.elements.map(f=>`<li><div><b>${esc(f.libelle)}</b><span>${esc(f.valeur)}</span></div><p class="dq-src">${esc(f.sourceLib)}${f.at?' · '+esc(Q().quand(f.at)):''}${f.onglet?` <button type="button" class="dq-lien" data-dq-ouvrir="${esc(f.onglet)}">Ouvrir</button>`:''}</p></li>`).join('')}</ul>`:''}<p class="dq-note">Réponse extraite du dossier, sans interprétation : vérifiez à la source avant toute décision.</p>`;
 zone.querySelectorAll('[data-dq-ouvrir]').forEach(b=>b.onclick=()=>{dlg.close();ctxCourant?.aller?.(b.dataset.dqOuvrir)});
}
function ouvrir(stay,ctx){
 if(!Q())return;courant=stay;ctxCourant=ctx;if(!dlg)construire();
 dlg.querySelector('.dq-sugg').innerHTML=Q().SUGGESTIONS.map(s=>`<button type="button" class="dq-chip" data-dq-s="${esc(s)}">${esc(s)}</button>`).join('');
 dlg.querySelectorAll('[data-dq-s]').forEach(b=>b.onclick=()=>{dlg.querySelector('#dq-q').value=b.dataset.dqS;repondre(b.dataset.dqS)});
 dlg.querySelector('.dq-rep').innerHTML='';dlg.querySelector('#dq-q').value='';
 dlg.showModal();dlg.querySelector('#dq-q').focus();
}
function decorer(stay,ctx){
 const actions=document.querySelector('#detail .detailhead .actions');if(!actions||!stay||actions.querySelector('[data-dq-open]'))return;
 const b=document.createElement('button');b.type='button';b.className='secondary dq-open';b.dataset.dqOpen='';b.innerHTML=ICON+'Interroger le dossier';b.title='Poser une question au dossier (raccourci : Alt + Q)';
 b.onclick=()=>ouvrir(stay,ctx);actions.prepend(b);courant=stay;ctxCourant=ctx;
}
document.addEventListener('keydown',e=>{if(e.altKey&&!e.ctrlKey&&(e.key==='q'||e.key==='Q'||e.code==='KeyQ')){const b=document.querySelector('[data-dq-open]');if(b){e.preventDefault();b.click()}}});
window.IaseloDossierQuestionUI={decorer,ouvrir};
})();

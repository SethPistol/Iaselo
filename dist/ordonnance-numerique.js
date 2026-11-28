/* IASELO · ordonnance numérique de sortie EN SIMULATION (5e veille, lot 5) : sous l'ordonnance de sortie,
   dépôt (identifiant unique + QR code), impression avec le QR code, suivi de la délivrance (simulée), annulation.
   Règles : ordonnance-numerique-regles.js ; serveur : worker/ordonnance-numerique.mjs. */
(function(root){
'use strict';
const O=()=>root.IaseloOrdoNum;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const quand=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'})};
const style=document.createElement('style');
style.textContent=`.on{border:1px solid var(--i-line,#d5dee3);border-radius:14px;background:var(--i-s1,#fff);padding:14px 16px;margin:18px 0}
.on-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}.on h4{margin:0}.on-sim{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#fff4dc;color:#7a4a00}
.on-corps{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start;margin-top:10px}.on-qr svg{display:block;border:1px solid var(--i-line,#d5dee3);border-radius:8px}
.on-id{font-family:ui-monospace,Menlo,monospace;font-size:17px;font-weight:700;letter-spacing:.03em}.on-statut{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;background:#e8eef6;color:#1d3d6b}
.on-statut.delivree{background:#e8f5ec;color:#14532d}.on-statut.annulee{background:#f2f5f7;color:#4d5f68}.on-statut.delivree-partielle{background:#fff4dc;color:#7a4a00}
.on-ev{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px;font-size:14px}.on-ev li::before{content:'•';margin-right:6px;color:var(--i-acc,#134f5c)}
.on-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.on-avert{background:#fff4dc;border-radius:10px;padding:8px 10px;font-size:14px}
.on-dlg{width:min(520px,calc(100vw - 24px));border:0;border-radius:16px;padding:18px 20px}.on-dlg::backdrop{background:rgba(10,30,40,.45)}.on-dlg form{display:grid;gap:10px}.on-dlg label{display:flex;gap:8px;align-items:flex-start}
.on-print{display:flex;gap:14px;align-items:center;border-top:1px dashed #999;margin-top:14px;padding-top:10px;font-size:13px}
@media (max-width:560px){.on-corps{grid-template-columns:1fr}}`;
document.head.appendChild(style);
async function api(method,q,data){const r=await fetch('/api/workspace/ordonnance-numerique'+(q||''),{method,cache:'no-store',credentials:'same-origin',...(data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const j=await r.json().catch(()=>({error:'Service indisponible.'}));if(!r.ok)throw new Error(j.error||'Service indisponible.');return j}
function evenement(e,o){if(e.type==='depot')return 'Déposée le '+quand(e.at)+' par '+e.par+' ('+e.lignes+' ligne'+(e.lignes>1?'s':'')+')';if(e.type==='delivrance')return 'Délivrance simulée le '+quand(e.at)+' · '+e.officine+' · '+e.lignes.map(i=>o.lignes[i]?.drug||'').join(', ');if(e.type==='annulation')return 'Annulée le '+quand(e.at)+' par '+e.par+' · '+e.motif;return ''}
function monter(conteneur,stay,ctx){
 if(!conteneur||!O())return;const saved=stay.discharge?.ordinance;const sec=document.createElement('section');sec.className='on';sec.setAttribute('aria-labelledby','on-titre');conteneur.appendChild(sec);
 let liste=[],erreur='';
 const items=()=>(saved?.items||[]);
 const prescripteur=()=>({nom:saved?.header?.doctor||'',rpps:saved?.header?.rpps||'',specialite:saved?.header?.specialty||''});
 function dessiner(){
  const active=liste.find(o=>o.statut!=='annulee'),change=active&&O().canonique(items())!==JSON.stringify(active.lignes);
  sec.innerHTML=`<div class="on-head"><div><h4 id="on-titre">Ordonnance numérique</h4><p class="muted" style="margin:4px 0 0">Identifiant unique et QR code imprimés sur l’ordonnance ; la pharmacie retrouve l’ordonnance et signale la délivrance.</p></div><span class="on-sim">SIMULATION · rien n’est transmis à l’Assurance maladie</span></div>
  ${erreur?`<p class="nursing-error" role="alert">${esc(erreur)}</p>`:''}
  ${!saved?'<p>Enregistrez d’abord l’ordonnance de sortie ci-dessus.</p>':active?`<div class="on-corps"><div class="on-qr">${root.IaseloQR?root.IaseloQR.svg(active.id,{taille:132,titre:'QR code de l’ordonnance '+active.id}):''}</div><div><p class="on-id">${esc(active.id)}</p><p><span class="on-statut ${esc(active.statut)}">${esc(active.libelle)}</span></p><ul class="on-ev">${active.evenements.map(e=>`<li>${esc(evenement(e,active))}</li>`).join('')}</ul>${change?'<p class="on-avert">L’ordonnance de sortie a été modifiée depuis le dépôt : déposez la nouvelle version (l’ancienne sera annulée).</p>':''}</div></div>`:'<p>Pas encore déposée.</p>'}
  ${liste.filter(o=>o!==active).length?`<details><summary>Versions précédentes (${liste.filter(o=>o!==active).length})</summary><ul class="on-ev">${liste.filter(o=>o!==active).map(o=>`<li>${esc(o.id)} · ${esc(o.libelle)}</li>`).join('')}</ul></details>`:''}
  <div class="on-actions">${saved&&ctx.physician&&(!active||change)?`<button type="button" class="primary" data-on="deposer">${active?'Déposer la nouvelle version':'Déposer l’ordonnance numérique'}</button>`:''}
  ${active&&!change?`<button type="button" class="secondary" data-on="imprimer">Imprimer avec le QR code</button>`:''}
  ${active&&['deposee','delivree-partielle'].includes(active.statut)&&(ctx.physician||ctx.job==='pharmacien')?`<button type="button" class="secondary" data-on="delivrer">Simuler la délivrance en officine</button>`:''}
  ${active&&ctx.physician&&active.statut!=='delivree'?`<button type="button" class="secondary" data-on="annuler">Annuler</button>`:''}</div>`;
  sec.querySelectorAll('[data-on]').forEach(b=>b.onclick=()=>({deposer,imprimer:()=>imprimer(active),delivrer:()=>delivrer(active),annuler:()=>annuler(active)})[b.dataset.on]());
 }
 async function charger(){try{liste=(await api('GET','?stay='+encodeURIComponent(stay.id))).ordonnances;erreur=''}catch(e){erreur=e.message}dessiner()}
 async function deposer(){try{const r=await api('POST','',{action:'deposer',stay:stay.id,items:items(),prescripteur:prescripteur()});ctx.toast?.('Ordonnance numérique déposée (simulation) · '+r.ordonnance.id);ctx.event?.('Ordonnance numérique déposée (simulation) · '+r.ordonnance.id,'Sortie')}catch(e){erreur=e.message}await charger()}
 function imprimer(o){const qr=root.IaseloQR?root.IaseloQR.svg(o.id,{taille:110,titre:'QR code'}):'';ctx.print?.((ctx.docHtml?.()||'')+`<div class="on-print">${qr}<div><strong>Ordonnance numérique · SIMULATION</strong><br>Identifiant : ${esc(o.id)}<br>Présentez ce code à votre pharmacie.</div></div>`)}
 function dialogue(html,ok){const d=document.createElement('dialog');d.className='on-dlg';d.innerHTML=html;document.body.appendChild(d);d.querySelector('[data-f]').onclick=()=>{d.close();d.remove()};d.querySelector('form').onsubmit=async e=>{e.preventDefault();const err=await ok(new FormData(e.target));if(err){d.querySelector('[role=alert]').textContent=err;return}d.close();d.remove()};d.showModal();d.querySelector('input,textarea')?.focus()}
 function delivrer(o){dialogue(`<form><h3 style="margin:0">Délivrance en officine (simulation)</h3><p class="muted" style="margin:0">Cochez les médicaments délivrés : c’est ce que signalera la pharmacie quand le service sera ouvert.</p>${o.lignes.map((l,i)=>{const deja=o.evenements.some(e=>e.type==='delivrance'&&e.lignes.includes(i));return `<label><input type="checkbox" name="l" value="${i}" ${deja?'checked disabled':'checked'}> ${esc(l.drug)}${deja?' (déjà délivré)':''}</label>`}).join('')}<label style="display:grid">Officine<input name="officine" value="Pharmacie de démonstration"></label><p role="alert" class="nursing-error"></p><div class="on-actions"><button type="button" class="secondary" data-f>Fermer</button><button class="primary">Enregistrer la délivrance</button></div></form>`,
  async f=>{try{await api('POST','',{action:'delivrer',id:o.id,lignes:f.getAll('l').map(Number),officine:f.get('officine')});ctx.toast?.('Délivrance simulée enregistrée');await charger()}catch(e){return e.message}})}
 function annuler(o){dialogue(`<form><h3 style="margin:0">Annuler l’ordonnance ${esc(o.id)}</h3><label style="display:grid">Motif<textarea name="motif" required minlength="3" maxlength="200"></textarea></label><p role="alert" class="nursing-error"></p><div class="on-actions"><button type="button" class="secondary" data-f>Fermer</button><button class="primary">Annuler l’ordonnance</button></div></form>`,
  async f=>{try{await api('POST','',{action:'annuler',id:o.id,motif:f.get('motif')});ctx.toast?.('Ordonnance numérique annulée');ctx.event?.('Ordonnance numérique annulée · '+o.id,'Sortie');await charger()}catch(e){return e.message}})}
 dessiner();if(saved)charger();
}
root.IaseloOrdoNumUI={monter};
})(window);

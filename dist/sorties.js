/* IASELO · écran « Sorties du jour » (4e veille, lot B) : pour chaque patient qui sort aujourd'hui, demain ou en retard,
   ce qui est prêt et ce qui bloque ; sortie infirmière sur protocole (le médecin prescrit les critères, l'infirmière
   les constate, la sortie est autorisée et tracée) ; transport et accompagnant. Règles : sorties-regles.js. */
(function(root){
'use strict';
root.createSorties=function(ctx){
 const {esc,toast}=ctx,R=()=>root.IaseloSorties;let jour='aujourdhui',ouvert=null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/></svg>';
 const medecin=()=>ctx.job()?['anesthesiste','chirurgien'].includes(ctx.job()):ctx.role()!=='Infirmier';
 const ecrit=()=>!ctx.job()||['anesthesiste','chirurgien','infirmier'].includes(ctx.job());
 const qui=()=>ctx.who?.()||ctx.role();
 function bouton(){
  if(document.querySelector('aside .nav[data-view="sorties"]'))return;
  const apres=document.querySelector('aside .nav[data-view="surveillance"]')||document.querySelector('aside .nav[data-view="controle"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='sorties';b.innerHTML=ICON+'Sorties du jour';b.onclick=()=>ctx.go('sorties');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,400));else setTimeout(bouton,400);
 const style=document.createElement('style');
 style.textContent=`.so-pat{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:14px 16px;border-left:5px solid #c98a12}.so-pat.pret{border-left-color:#2f7a45}.so-pat.retard{border-left-color:#b21f2a}
.so-etapes{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px;padding:0;list-style:none}.so-etapes li{display:inline-flex}.so-et{border:0;border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;font-weight:600;background:#fff1d6;color:#6d4a00;cursor:pointer;text-align:left}.so-et.ok{background:#e3f1e7;color:#1f5a32;cursor:default}.so-et small{font-weight:400;margin-left:4px}
.so-bloc{border-top:1px solid var(--border,#e9eef1);margin-top:10px;padding-top:10px}.so-bloc h3{font-size:.95rem;margin:0 0 6px}.so-crit{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border,#e6ecef)}.so-crit p{margin:0}.so-crit small{display:block;color:#55636a}
.so-form{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.so-form label{display:grid;gap:4px;font-size:14px}.so-form input,.so-form select{min-width:150px}.so-coches{display:grid;gap:4px;margin:6px 0}.so-coches label{display:flex;gap:8px;align-items:center;font-size:14px}
:where(:root[data-theme=dark]) .so-crit small{color:#c9d5da}`;
 document.head.append(style);
 const sejour=id=>ctx.patients.find(x=>x.id===id);
 function tracer(s,texte){(s.events??=[]).unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text:texte,kind:'Sortie'});document.dispatchEvent(new Event('change',{bubbles:true}))}
 const fdate=d=>{const x=new Date(d+'T12:00:00');return isNaN(x)?d:x.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})};
 const fdt=iso=>{const x=new Date(iso);return isNaN(x)?'':x.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
 const ONGLET={ordonnance:'dischargeRx',liaison:'dischargeLiaison',consignes:'instructions'};
 function cliniqueHtml(s,l){
  const sp=s.sortiePlus||{},prot=sp.protocole,c=R().constats(s),e=l.etapes.find(x=>x.id==='clinique');
  if(e.ok)return `<div class="so-bloc"><h3>Aptitude à la sortie</h3><p class="sc-mut">${esc(e.detail)}${sp.sortieAutorisee?' · '+esc(fdt(sp.sortieAutorisee.at)):''}</p></div>`;
  if(!prot){
   if(!medecin())return `<div class="so-bloc"><h3>Aptitude à la sortie</h3><p class="sc-mut">Aucun protocole de sortie prescrit : la décision revient au médecin.</p></div>`;
   return `<div class="so-bloc"><h3>Aptitude à la sortie</h3><form class="so-presc" data-stay="${esc(s.id)}"><p class="sc-mut">Prescrire la sortie sur protocole : l’infirmière constatera chaque critère et autorisera la sortie ; si un critère manque, elle vous appelle.</p>
    <div class="so-coches">${R().CRITERES.map(k=>`<label><input type="checkbox" name="c" value="${k.id}" ${k.id==='miction'&&s.mode!=='Ambulatoire'?'':'checked'}> ${esc(k.libelle)}</label>`).join('')}</div>
    <div class="so-form"><label>Consigne au médecin (facultatif)<input name="note" maxlength="200" placeholder="ex. NFS à contrôler avant"></label><button class="primary ps-small">Prescrire la sortie sur protocole</button>${s.mode==='Ambulatoire'?'':`<button type="button" class="secondary ps-small" data-apte="${esc(s.id)}">Je valide la sortie moi-même</button>`}</div></form></div>`;
  }
  const coche=sp.protocoleConstat||{},tous=prot.criteres.every(id=>coche[id]?.ok);
  return `<div class="so-bloc"><h3>Sortie sur protocole · prescrite par ${esc(prot.par)} le ${esc(fdt(prot.at))}</h3>${prot.note?`<p class="sc-mut">Consigne : ${esc(prot.note)}</p>`:''}
   ${prot.criteres.map(id=>{const k=R().CRITERES.find(x=>x.id===id),v=coche[id],prop=c[id];
    return `<div class="so-crit"><p>${esc(k.libelle)}<small>${v?(v.ok?'Constaté':'Non rempli')+' par '+esc(v.par)+' · '+esc(fdt(v.at)):prop?'Dernier relevé : '+(prop==='ok'?'semble rempli':'semble non rempli')+' (à vérifier)':'À constater'}</small></p>
     ${ecrit()?`<span class="sc-actions" style="margin:0"><button type="button" class="${v?.ok?'primary':'secondary'} ps-small" data-constat="${esc(s.id)}" data-id="${id}" data-ok="1" aria-pressed="${!!v?.ok}">Rempli</button><button type="button" class="secondary ps-small" data-constat="${esc(s.id)}" data-id="${id}" data-ok="0" aria-pressed="${v&&!v.ok?'true':'false'}">Non</button></span>`:''}</div>`}).join('')}
   ${ecrit()?`<p class="sc-actions"><button type="button" class="primary" data-autoriser="${esc(s.id)}" ${tous?'':'aria-disabled="true"'}>Autoriser la sortie</button>${tous?'':'<span class="sc-mut">Tous les critères doivent être remplis ; sinon, appelez le médecin.</span>'}</p>`:''}</div>`;
 }
 function transportHtml(s,l){
  const tr=s.sortiePlus?.transport||{},dis=!ecrit()?'disabled':'';
  return `<div class="so-bloc"><h3>${s.mode==='Ambulatoire'?'Retour et accompagnant (obligatoire la nuit suivante)':'Transport et retour'}</h3><form class="so-form so-tr" data-stay="${esc(s.id)}">
   <label>Date de sortie<input type="date" name="date" value="${esc(s.sortiePlus?.sortiePrevue||l.date||'')}" ${dis}></label>
   <label>Mode<select name="mode" ${dis}><option value="">À choisir</option>${R().MODES.map(m=>`<option ${tr.mode===m?'selected':''}>${esc(m)}</option>`).join('')}</select></label>
   <label>Heure<input type="time" name="heure" value="${esc(tr.heure||'')}" ${dis}></label>
   <label>Accompagnant<input name="accompagnant" value="${esc(tr.accompagnant||'')}" maxlength="80" placeholder="ex. épouse" ${dis}></label>
   ${ecrit()?'<button class="secondary ps-small">Enregistrer</button>':''}</form></div>`;
 }
 function ligneHtml(l){
  const s=sejour(l.stay),plein=ouvert===l.stay;
  return `<article class="so-pat ${l.pret?'pret':l.jour==='retard'?'retard':''}" aria-labelledby="so-${esc(l.stay)}"><div class="sc-tete"><h2 id="so-${esc(l.stay)}">${esc(l.nom)}</h2><span class="sc-mut">${esc(l.mode||'')} · ${esc(l.stage)}${l.chambre?' · chambre '+esc(l.chambre):''}${l.heure?' · départ '+esc(l.heure):''}${l.jour==='retard'?' · prévue le '+esc(fdate(l.date)):''}</span></div>
   <ul class="so-etapes" aria-label="Étapes de la sortie">${l.etapes.map(e=>`<li><button type="button" class="so-et ${e.ok?'ok':''}" ${e.ok?'aria-disabled="true"':`data-etape="${e.id}" data-stay="${esc(l.stay)}"`}>${e.ok?'✓':'•'} ${esc(e.libelle)}<small>${esc(e.id==='date'&&e.ok?fdate(e.detail):e.detail)}</small></button></li>`).join('')}</ul>
   <p class="sc-mut">${l.pret?'Tout est prêt.':'Bloque : '+esc(l.bloquants.join(', '))}</p>
   <div class="sc-actions"><button type="button" class="secondary ps-small" data-plier="${esc(l.stay)}" aria-expanded="${plein}">${plein?'Replier':'Organiser la sortie'}</button><button type="button" class="secondary ps-small" data-ouvrir="${esc(l.stay)}">Ouvrir le dossier</button></div>
   ${plein&&s?cliniqueHtml(s,l)+transportHtml(s,l):''}</article>`;
 }
 function draw(){
  const c=document.querySelector('#workspace');if(!c||ctx.view()!=='sorties')return;
  const t=R().tableau(ctx.patients),lignes=t.lignes.filter(l=>jour==='demain'?l.jour==='demain':l.jour!=='demain'),nDem=t.lignes.filter(l=>l.jour==='demain').length;
  c.innerHTML=`<div class="sc-bandeau"><span class="sc-badge ${t.prets?'sc-ok':''}">${t.prets} sortie(s) prête(s)</span><span class="sc-badge ${t.bloques?'sc-warn':'sc-ok'}">${t.bloques} sortie(s) bloquée(s)</span>
   <div class="sc-filtres" role="group" aria-label="Jour">${[['aujourdhui','Aujourd’hui ('+fdate(t.aujourdhui)+')'],['demain','Demain ('+nDem+')']].map(([k,x])=>`<button type="button" data-jour="${k}" aria-pressed="${jour===k}">${esc(x)}</button>`).join('')}</div></div>
   <div class="sc-liste">${lignes.length?lignes.map(ligneHtml).join(''):`<p class="sc-mut">Aucune sortie prévue ${jour==='demain'?'demain':'aujourd’hui'}. Fixez la date de sortie dans le dossier (rubrique Sortie prévue et lit).</p>`}</div>
   <p class="sc-mut">Critères de sortie sur protocole inspirés des recommandations HAS (RAAC, chirurgie ambulatoire) : à faire valider par les médecins de l’établissement.</p>`;
  c.querySelectorAll('[data-jour]').forEach(b=>b.onclick=()=>{jour=b.dataset.jour;draw()});
  c.querySelectorAll('[data-plier]').forEach(b=>b.onclick=()=>{ouvert=ouvert===b.dataset.plier?null:b.dataset.plier;draw()});
  c.querySelectorAll('[data-ouvrir]').forEach(b=>b.onclick=()=>ctx.open(b.dataset.ouvrir));
  c.querySelectorAll('[data-etape]').forEach(b=>b.onclick=()=>{const tab=ONGLET[b.dataset.etape];if(tab)ctx.open(b.dataset.stay,tab);else{ouvert=b.dataset.stay;draw();c.querySelector('.so-bloc')?.scrollIntoView({block:'center'})}});
  c.querySelectorAll('form.so-presc').forEach(f=>f.onsubmit=e=>{e.preventDefault();const s=sejour(f.dataset.stay);if(!s)return;
   try{s.sortiePlus=R().prescrire(s.sortiePlus||{},{par:qui(),criteres:[...f.querySelectorAll('[name=c]:checked')].map(x=>x.value),note:f.note.value.trim()})}catch(x){toast(x.message);return}
   tracer(s,'Sortie prescrite sur protocole ('+s.sortiePlus.protocole.criteres.length+' critères)');toast('Protocole de sortie prescrit.');draw()});
  c.querySelectorAll('[data-apte]').forEach(b=>b.onclick=()=>{const s=sejour(b.dataset.apte);if(!s)return;(s.sortiePlus??={}).aptitudeMedicale={par:qui(),at:new Date().toISOString()};tracer(s,'Sortie autorisée par le médecin');toast('Sortie autorisée.');draw()});
  c.querySelectorAll('[data-constat]').forEach(b=>b.onclick=()=>{const s=sejour(b.dataset.constat);if(!s)return;const ok=b.dataset.ok==='1',k=R().CRITERES.find(x=>x.id===b.dataset.id);
   try{s.sortiePlus=R().constater(s.sortiePlus,b.dataset.id,ok,qui())}catch(x){toast(x.message);return}
   tracer(s,'Critère de sortie '+(ok?'constaté':'non rempli')+' : '+k.libelle);if(!ok)toast('Critère non rempli : appelez le médecin.');draw()});
  c.querySelectorAll('[data-autoriser]').forEach(b=>b.onclick=()=>{const s=sejour(b.dataset.autoriser);if(!s)return;
   try{s.sortiePlus=R().autoriser(s.sortiePlus,qui())}catch(x){toast(x.message);return}
   tracer(s,'Sortie autorisée sur protocole (tous les critères constatés)');toast('Sortie autorisée sur protocole.');draw()});
  c.querySelectorAll('form.so-tr').forEach(f=>f.onsubmit=e=>{e.preventDefault();const s=sejour(f.dataset.stay);if(!s)return;const sp=(s.sortiePlus??={});
   if(f.date.value)sp.sortiePrevue=f.date.value;sp.transport={mode:f.mode.value,heure:f.heure.value,accompagnant:f.accompagnant.value.trim()};
   tracer(s,'Sortie organisée : '+[f.date.value,sp.transport.mode,sp.transport.heure,sp.transport.accompagnant&&'accompagnant renseigné'].filter(Boolean).join(' · '));toast('Enregistré.');draw()});
 }
 // Rappel dans la Tour de contrôle (l'anesthésiste n'a plus de place dans son menu).
 function bandeauControle(){
  if(ctx.view()!=='controle')return;const c=document.querySelector('#workspace');if(!c||c.querySelector('.so-lien'))return;
  const t=R().tableau(ctx.patients);if(!t.prets&&!t.bloques)return;
  const p=document.createElement('p');p.className='so-lien sc-bandeau';p.innerHTML=`<span class="sc-badge ${t.bloques?'sc-warn':'sc-ok'}">Sorties du jour : ${t.prets} prête(s) · ${t.bloques} bloquée(s)</span><button type="button" class="secondary ps-small">Ouvrir les sorties du jour</button>`;
  p.querySelector('button').onclick=()=>ctx.go('sorties');const sc=c.querySelector('.sc-lien');sc?sc.after(p):c.prepend(p);
 }
 new MutationObserver(()=>bandeauControle()).observe(document.documentElement,{childList:true,subtree:true});
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Sorties du jour';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='sorties'));
  draw();
 }
 return {render};
};
})(typeof self!=='undefined'?self:this);

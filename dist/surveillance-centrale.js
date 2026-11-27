/* IASELO · écran « Surveillance des lits » (4e veille, lot A) : une file d'alertes pour tous les patients présents
   (bloc, SSPI, service), classées par gravité, prise en charge tracée ; saisie vocale des constantes (transcription
   sur le poste, valeurs à valider). Règles : surveillance-centrale-regles.js. Rafraîchi chaque minute. */
(function(root){
'use strict';
root.createSurveillanceCentrale=function(ctx){
 const {esc,toast}=ctx,R=()=>root.IaseloSurveillanceCentrale;let filtre='ouvertes',minuteur=null,dictee=null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>';
 const NIV={crit:['Critique','sc-crit'],warn:['À voir','sc-warn'],info:['À faire','sc-info']};
 function bouton(){
  if(document.querySelector('aside .nav[data-view="surveillance"]'))return;
  const apres=document.querySelector('aside .nav[data-view="controle"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='surveillance';b.innerHTML=ICON+'Surveillance des lits';b.onclick=()=>ctx.go('surveillance');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,350));else setTimeout(bouton,350);
 const style=document.createElement('style');
 style.textContent=`.sc-bandeau{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px}.sc-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:600;background:#eef2f3;color:#33434a}
.sc-crit{background:#fbe4e4;color:#8a1c1c}.sc-warn{background:#fff1d6;color:#6d4a00}.sc-info{background:#e6eef8;color:#1d4a7a}.sc-ok{background:#e3f1e7;color:#1f5a32}
.sc-filtres{display:flex;gap:6px;flex-wrap:wrap}.sc-filtres button{border:1px solid var(--border,#d6dde2);background:transparent;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}.sc-filtres button[aria-pressed=true]{background:#134f5c;color:#fff;border-color:#134f5c}
.sc-liste{display:grid;gap:12px}.sc-pat{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:14px 16px;border-left:5px solid #c9d3d9}.sc-pat.p-crit{border-left-color:#b21f2a}.sc-pat.p-warn{border-left-color:#c98a12}.sc-pat.p-info{border-left-color:#3a6ea5}.sc-pat.p-ok,.sc-pat.p-vu{border-left-color:#2f7a45}
.sc-tete{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;justify-content:space-between}.sc-tete h2{font-size:1.05rem;margin:0}.sc-mut{color:#55636a;font-size:14px}
.sc-al{display:grid;grid-template-columns:auto 1fr auto;gap:8px 12px;align-items:start;padding:8px 0;border-top:1px solid var(--border,#e9eef1)}.sc-al p{margin:2px 0 0;font-size:14px;color:#3f4d54}.sc-al.vu{opacity:.65}
.sc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.sc-dlg{max-width:620px}.sc-dlg textarea{min-height:110px}.sc-prop{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;margin:10px 0}.sc-prop label{display:contents}
@media (max-width:640px){.sc-al{grid-template-columns:1fr}}
:where(:root[data-theme=dark]) .sc-al p{color:#c9d5da}`;
 document.head.append(style);
 const qui=()=>ctx.who?.()||ctx.role();
 const heure=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'})};
 function prendre(stayId,cle,note){
  const s=ctx.patients.find(x=>x.id===stayId);if(!s)return;const sp=(s.soinsPlus??={});(sp.alertesVues??={})[cle]={at:new Date().toISOString(),par:qui(),note:note||''};
  const a=R().alertes(s).find(x=>x.cle===cle);
  (s.events??=[]).unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text:'Alerte prise en charge : '+(a?.titre||cle)+(note?' · '+note:''),kind:'Surveillance'});
  document.dispatchEvent(new Event('change',{bubbles:true}));draw();toast('Prise en charge tracée.');
 }
 function patientHtml(l){
  const liste=filtre==='toutes'?l.alertes:l.alertes.filter(a=>!a.vue);
  return `<article class="sc-pat p-${l.pire}" aria-labelledby="sc-${esc(l.stay)}"><div class="sc-tete"><h2 id="sc-${esc(l.stay)}">${esc(l.nom)}</h2><span class="sc-mut">${esc(l.stage)}${l.secteur?' · '+esc(l.secteur):''} · dernier relevé : ${l.dernier?esc(heure(l.dernier)):'aucun'}</span></div>
   ${liste.length?liste.map(a=>`<div class="sc-al ${a.vue?'vu':''}"><span class="sc-badge ${NIV[a.niveau][1]}">${NIV[a.niveau][0]}</span><div><strong>${esc(a.titre)}</strong><p>${esc(a.detail)}</p>${a.vue?`<p>Pris en charge par ${esc(a.vue.par)} ${esc(heure(a.vue.at))}${a.vue.note?' : '+esc(a.vue.note):''}</p>`:''}</div>${a.vue?'':`<button type="button" class="secondary ps-small" data-prendre="${esc(l.stay)}" data-cle="${esc(a.cle)}">Pris en charge</button>`}</div>`).join('')
    :`<p class="sc-mut">${l.alertes.length?'Alertes déjà prises en charge.':'Aucune alerte.'}</p>`}
   <div class="sc-actions"><button type="button" class="secondary ps-small" data-ouvrir="${esc(l.stay)}">Ouvrir le dossier</button>${ctx.peutSaisir?.()?`<button type="button" class="secondary ps-small" data-dicter="${esc(l.stay)}">Dicter les constantes</button>`:''}</div></article>`;
 }
 function draw(){
  const c=document.querySelector('#workspace');if(!c||ctx.view()!=='surveillance')return;
  const t=R().tableau(ctx.patients);
  const lignes=t.lignes.filter(l=>filtre==='toutes'||l.ouvertes);
  c.innerHTML=`<div class="sc-bandeau"><span class="sc-badge ${t.critiques?'sc-crit':'sc-ok'}">${t.critiques} patient(s) en alerte critique</span><span class="sc-badge">${t.aVoir} alerte(s) à prendre en charge</span><span class="sc-badge">${t.lignes.length} patient(s) présents</span>
   <div class="sc-filtres" role="group" aria-label="Filtrer">${[['ouvertes','Alertes à voir'],['toutes','Tous les patients présents']].map(([k,l])=>`<button type="button" data-filtre="${k}" aria-pressed="${filtre===k}">${l}</button>`).join('')}</div></div>
  <div class="sc-liste" aria-live="polite">${lignes.length?lignes.map(patientHtml).join(''):'<p class="sc-mut">Aucune alerte à prendre en charge parmi les patients présents.</p>'}</div>
  <p class="sc-mut">Seuils : NEWS2, qSOFA (Sepsis-3), Braden, Morse, IMC (HAS), surveillance SSPI 15 min et service 8 h. À faire valider par les médecins de l’établissement. Mis à jour chaque minute.</p>`;
  c.querySelectorAll('[data-filtre]').forEach(b=>b.onclick=()=>{filtre=b.dataset.filtre;draw()});
  c.querySelectorAll('[data-prendre]').forEach(b=>b.onclick=()=>{const note=prompteNote(b);if(note!==null)prendre(b.dataset.prendre,b.dataset.cle,note)});
  c.querySelectorAll('[data-ouvrir]').forEach(b=>b.onclick=()=>ctx.open(b.dataset.ouvrir,'follow'));
  c.querySelectorAll('[data-dicter]').forEach(b=>b.onclick=()=>ouvrirDictee(b.dataset.dicter));
 }
 // Note courte facultative, sans boîte de dialogue bloquante : champ inséré sous l'alerte.
 function prompteNote(b){
  const box=b.parentElement;let f=box.querySelector('form.sc-note');if(f){return f.querySelector('input').value.trim()}
  f=document.createElement('form');f.className='sc-note sc-actions';f.innerHTML='<input aria-label="Note de prise en charge" maxlength="200" placeholder="Note (ex. médecin prévenu, antalgique donné)" style="flex:1;min-width:180px"><button class="primary ps-small">Valider</button>';
  f.onsubmit=e=>{e.preventDefault();prendre(b.dataset.prendre,b.dataset.cle,f.querySelector('input').value.trim())};box.querySelector('div').append(f);f.querySelector('input').focus();return null;
 }
 /* ---------- Saisie vocale des constantes ---------- */
 const LIB={sbp:'PAS (mmHg)',dbp:'PAD (mmHg)',hr:'FC (/min)',spo2:'SpO₂ (%)',rr:'FR (/min)',temp:'Température (°C)',pain:'Douleur (EN /10)',glycemia:'Glycémie (g/L)',o2:'Oxygène',avpu:'Conscience (AVPU)',dressing:'Pansement',nvpo:'NVPO',miction:'Miction'};
 let moteur=null;const attentes=new Map();let suivant=1;
 function moteurDictee(){if(moteur)return moteur;const w=new Worker('/cro-transcription-worker.js',{type:'module'});
  w.onmessage=({data})=>{if(data.type==='progression')etat('Chargement du module de transcription : '+Math.round(100*data.charge/Math.max(1,data.total))+' %');else if(data.type==='pret')etat('');else if(data.type==='erreur'){etat(data.message);for(const [,a] of attentes)a.reject(Error(data.message));attentes.clear();w.terminate();moteur=null}else if(data.type==='texte'||data.type==='echec'){const a=attentes.get(data.id);if(a){attentes.delete(data.id);data.type==='texte'?a.resolve(data.texte||''):a.reject(Error(data.message||'Transcription impossible'))}}};
  w.postMessage({type:'charger'});return moteur=w}
 const transcrire=audio=>new Promise((resolve,reject)=>{const id=suivant++;attentes.set(id,{resolve,reject});moteurDictee().postMessage({type:'transcrire',id,session:'soins',audio},[audio.buffer])});
 const etat=m=>{const e=document.querySelector('#sc-etat');if(e)e.textContent=m};
 function ouvrirDictee(stayId){
  const s=ctx.patients.find(x=>x.id===stayId);if(!s)return;
  let d=document.querySelector('#sc-dlg');if(!d){d=document.createElement('dialog');d.id='sc-dlg';d.className='sc-dlg';document.body.append(d)}
  dictee={stay:stayId,enreg:null,prop:null};
  d.innerHTML=`<form method="dialog"><div class="dialoghead"><h2>Constantes de ${esc([String(s.identity?.lastName||'').toUpperCase(),s.identity?.firstName].join(' '))}</h2><button type="button" class="icon" data-fermer aria-label="Fermer">×</button></div>
   <p class="sc-mut">Dictez (« tension 125 sur 80, pouls 88, saturation 96, température 37,8, douleur 3 ») ou tapez le texte. L’audio est transcrit sur ce poste et n’est pas conservé. Chaque valeur est à vérifier avant l’enregistrement.</p>
   <p><button type="button" class="secondary" data-micro>Démarrer la dictée</button> <span id="sc-etat" class="sc-mut" role="status"></span></p>
   <label>Texte<textarea name="texte"></textarea></label><button type="button" class="secondary" data-lire>Lire le texte</button>
   <div id="sc-prop"></div><p class="sc-actions"><button type="button" class="primary" data-enreg disabled>Enregistrer les constantes cochées</button></p></form>`;
  const ta=d.querySelector('textarea'),prop=d.querySelector('#sc-prop'),enr=d.querySelector('[data-enreg]');
  const lire=()=>{dictee.prop=R().extraireConstantes(ta.value);const v=dictee.prop.valeurs,k=Object.keys(v);
   prop.innerHTML=k.length?`<div class="sc-prop">${k.map(x=>`<label><input type="checkbox" checked data-k="${x}"><span>${esc(LIB[x]||x)} : <input data-v="${x}" value="${esc(String(v[x]).replace('.',','))}" style="width:7em"></span></label>`).join('')}</div>`:'<p class="sc-mut">Aucune constante reconnue dans ce texte.</p>';enr.disabled=!k.length};
  d.querySelector('[data-lire]').onclick=lire;
  d.querySelector('[data-fermer]').onclick=()=>{arreter(true);d.close()};
  const micro=d.querySelector('[data-micro]');
  micro.onclick=async()=>{if(dictee.enreg){micro.textContent='Démarrer la dictée';await arreter();lire();return}
   if(!navigator.mediaDevices?.getUserMedia){toast('Micro indisponible : tapez le texte.');return}
   moteurDictee();let flux;try{flux=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})}catch{toast('Micro bloqué : autorisez-le ou tapez le texte.');return}
   let ac;try{ac=new AudioContext({sampleRate:16000})}catch{ac=new AudioContext()}
   const src=ac.createMediaStreamSource(flux),proc=ac.createScriptProcessor(4096,1,1),morceaux=[];proc.onaudioprocess=e=>morceaux.push(new Float32Array(e.inputBuffer.getChannelData(0)));src.connect(proc);proc.connect(ac.destination);
   dictee.enreg={flux,ac,src,proc,morceaux,taux:ac.sampleRate};micro.textContent='Arrêter et transcrire';etat('Enregistrement… parlez normalement.')};
  async function arreter(annuler){const e=dictee?.enreg;if(!e)return;dictee.enreg=null;try{e.proc.disconnect();e.src.disconnect();e.flux.getTracks().forEach(t=>t.stop());await e.ac.close()}catch{}
   if(annuler)return;let n=0;for(const m of e.morceaux)n+=m.length;let buf=new Float32Array(n),k=0;for(const m of e.morceaux){buf.set(m,k);k+=m.length}
   if(e.taux!==16000){const r=e.taux/16000,out=new Float32Array(Math.floor(buf.length/r));for(let i=0;i<out.length;i++)out[i]=buf[Math.floor(i*r)];buf=out}
   etat('Transcription sur ce poste…');try{const textes=[];for(let i=0;i<buf.length;i+=25*16000)textes.push(await transcrire(buf.slice(i,i+25*16000)));ta.value=(ta.value?ta.value+' ':'')+textes.join(' ').trim();etat('')}catch(x){etat('Transcription impossible : '+x.message+' Tapez le texte.')}}
  enr.onclick=()=>{
   const values={};d.querySelectorAll('[data-k]').forEach(c=>{if(!c.checked)return;const k=c.dataset.k,raw=d.querySelector(`[data-v="${k}"]`).value.trim();values[k]=/^[\d.,]+$/.test(raw)?raw.replace(',','.'):raw});
   if(!Object.keys(values).length){toast('Aucune valeur cochée.');return}
   const now=new Date(),loc=new Date(now-now.getTimezoneOffset()*60e3).toISOString().slice(0,16);
   const st=ctx.patients.find(x=>x.id===stayId);if(!st)return;
   const v={...values,at:loc,author:qui(),location:st.stage==='SSPI'?'SSPI':'Service',note:'Saisie vocale'+(ta.value?' : '+ta.value.slice(0,300):'')};
   (st.postopVitals??=[]).push({kind:'Surveillance',at:loc,author:qui(),created:now.toISOString(),role:ctx.role(),values:v,source:'dictee'});
   (st.events??=[]).unshift({at:now.toLocaleString('fr-FR'),role:ctx.role(),text:'Constantes saisies par dictée (validées) · '+Object.keys(values).map(k=>(LIB[k]||k).split(' (')[0]+' '+values[k]).join(', '),kind:'Soins'});
   document.dispatchEvent(new Event('change',{bubbles:true}));d.close();toast('Constantes enregistrées.');draw();
  };
  d.showModal();ta.focus();
 }
 // Bandeau dans la Tour de contrôle (tous les profils qui la voient, dont l'anesthésiste).
 function bandeauControle(){
  if(ctx.view()!=='controle')return;const c=document.querySelector('#workspace');if(!c||c.querySelector('.sc-lien'))return;
  const t=R().tableau(ctx.patients);if(!t.lignes.length)return;
  const p=document.createElement('p');p.className='sc-lien sc-bandeau';p.innerHTML=`<span class="sc-badge ${t.critiques?'sc-crit':t.aVoir?'sc-warn':'sc-ok'}">${t.critiques} critique(s) · ${t.aVoir} alerte(s) à voir</span><button type="button" class="secondary ps-small">Ouvrir la surveillance des lits</button>`;
  p.querySelector('button').onclick=()=>ctx.go('surveillance');c.prepend(p);
 }
 new MutationObserver(()=>bandeauControle()).observe(document.documentElement,{childList:true,subtree:true});
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Surveillance des lits';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='surveillance'));
  draw();clearInterval(minuteur);minuteur=setInterval(()=>{if(ctx.view()==='surveillance'&&!document.querySelector('#sc-dlg[open]')&&!document.querySelector('form.sc-note'))draw();else if(ctx.view()!=='surveillance')clearInterval(minuteur)},60000);
 }
 root.IaseloSurveillanceUI={draw,ouvrirDictee};
 return {render};
};
})(typeof self!=='undefined'?self:this);

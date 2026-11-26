/* IASELO · écrans des modules issus de la comparaison au marché (25 novembre 2026).
   Une entrée « Outils » en bas du menu ouvre une page de tuiles, filtrée selon le métier ; la messagerie a son entrée.
   Ce fichier : socle commun, page Outils, messagerie, biologie et courriers, transfusion, interfaces, moniteur au bloc,
   assistant de consultation. Les autres outils (qualité, agenda, honoraires, logistique) sont dans marche-gestion.js.
   Le serveur contrôle tous les droits (worker/marche.mjs) ; l'écran ne fait que masquer ce qui ne sert pas. */
(function(root){
'use strict';
const OUTILS=root.IaseloOutils=root.IaseloOutils||{};
const M=()=>root.IaseloMarche,H=()=>root.IaseloHl7;
const ICONES={
 outils:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.8-.8-.8-2.8z"/>',
 messagerie:'<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'
};
const svg=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONES[k]+'</svg>';
// Tuiles de la page Outils : métier(s) concerné(s) ; le serveur refuse de toute façon hors habilitation.
const TUILES=[
 {id:'biologie',titre:'Biologie & courriers reçus',texte:'Résultats des laboratoires (HL7, HPRIM), valeurs critiques, courriers MSSanté rattachés au bon patient.',jobs:['anesthesiste','chirurgien','infirmier','pharmacien','secretariat']},
 {id:'transfusion',titre:'Transfusion',texte:'Groupage, RAI, commande à l’EFS, contrôle ultime au lit, surveillance, effets indésirables, traçabilité.',jobs:['anesthesiste','chirurgien','infirmier']},
 {id:'agenda',titre:'Agenda des consultations',texte:'Plages des anesthésistes, rendez-vous, lien de prise de rendez-vous envoyé au patient.',jobs:['anesthesiste','chirurgien','secretariat']},
 {id:'honoraires',titre:'Honoraires & paiements',texte:'Devis signé par le patient, feuille de soins SESAM-Vitale, paiement en ligne de la chambre ou des compléments.',jobs:['anesthesiste','chirurgien','secretariat','facturation']},
 // Demandes à la pharmacie (26/11/2026) : écran Commandes pharmacie, vue « service ».
 {id:'pharmacie',vue:'commandesPharmacie',titre:'Demandes à la pharmacie',texte:'Demander des produits du livret pour le service, suivre la délivrance par la pharmacie, accuser réception.',jobs:['anesthesiste','infirmier']},
 {id:'logistique',titre:'Logistique du bloc',texte:'Brancardage, stérilisation des boîtes d’instruments, planning des équipes et des gardes.',jobs:['anesthesiste','chirurgien','infirmier','pharmacien','secretariat']},
 {id:'qualite',titre:'Qualité & sécurité',texte:'Déclarer un événement indésirable, suivi par la qualité, RMM, mode dégradé et classeur de secours.',jobs:['anesthesiste','chirurgien','infirmier','pharmacien','secretariat','dim','facturation','administration']},
 {id:'assurance',titre:'Assurance maladie',texte:'Droits du patient (ADRi, ROC), résumé PMSI validé par le DIM, facture du séjour, retours de paiement et rejets.',jobs:['secretariat','facturation','dim','anesthesiste','chirurgien']},
 {id:'codage',titre:'Codage transmis',texte:'Actes codés par les médecins ou le DIM, transmis au secrétariat, à l’accueil, à la facturation ou à un autre service.',jobs:['secretariat','facturation','dim','administration','anesthesiste','chirurgien']},
 {id:'interfaces',titre:'Interfaces & connecteurs',texte:'Mouvements du logiciel administratif, envoi des actes, état des connexions (labos, moniteurs, EFS, paiement).',jobs:['anesthesiste','secretariat','dim','facturation']}
];
root.createMarche=function(ctx){
 const {$,esc,toast}=ctx;
 let outil='',vue='',chargement=0,badgeMessages=0;
 const etat={};// par outil : onglet, séjour choisi, données
 const job=()=>ctx.job()||'';const admin=()=>document.body.dataset.admin==='true';
 const peut=jobs=>admin()||jobs.includes(job());
 const style=document.createElement('link');style.rel='stylesheet';style.href='marche.css?v=3';document.head.append(style);

 /* ---------- Socle ---------- */
 async function api(module,{q='',body,sous=''}={}){
  const r=await fetch('/api/workspace/marche/'+module+(sous?'/'+sous:'')+(q?'?'+q:''),{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});
  const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok){const e=Error(j.error||'Service indisponible.');e.data=j;throw e}return j;
 }
 const patients=()=>(ctx.patients()||[]).filter(s=>s&&s.id);
 const nomPatient=s=>{if(!s)return '';const i=s.identity||{};return [String(i.lastName||'').toUpperCase(),i.firstName||''].filter(Boolean).join(' ')||s.id};
 const parId=id=>patients().find(s=>s.id===id);
 const naissance=s=>{const d=s?.identity?.birthDate||'';return d?d.split('-').reverse().join('/'):''};
 const fr=iso=>{if(!iso)return '';const d=new Date(iso.length<=10?iso+'T12:00':iso);return Number.isNaN(d.getTime())?iso:iso.length<=10?d.toLocaleDateString('fr-FR'):d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
 const heure=iso=>iso?new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'';
 const chip=(txt,ton='')=>`<span class="mk-chip ${ton}">${esc(txt)}</span>`;
 const jourISO=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 function choixPatient(id,nomChamp='stay',vide='Choisir un patient…'){return `<select name="${nomChamp}" class="mk-patient"><option value="">${esc(vide)}</option>${patients().map(s=>`<option value="${esc(s.id)}" ${s.id===id?'selected':''}>${esc(nomPatient(s))}${naissance(s)?' · '+esc(naissance(s)):''}</option>`).join('')}</select>`}
 function sejourCourant(cle){const e=etat[cle]??={};if(e.stay===undefined)e.stay=ctx.current()?.id||'';if(e.stay&&!parId(e.stay))e.stay='';return e.stay}
 function onglets(cle,liste){const e=etat[cle]??={};if(!e.onglet||!liste.some(([k])=>k===e.onglet))e.onglet=liste[0][0];return `<div class="mk-tabs" role="tablist">${liste.map(([k,l,n])=>`<button type="button" role="tab" class="${e.onglet===k?'active':''}" data-mk-onglet="${cle}|${k}">${esc(l)}${n?` <b class="mk-count">${n}</b>`:''}</button>`).join('')}</div>`}
 function form(el){const f=new FormData(el),o={};for(const [k,v] of f.entries()){if(k in o){o[k]=[].concat(o[k],v)}else o[k]=v}return o}
 function erreur(host,e){const p=host.querySelector('.mk-err')||host.appendChild(Object.assign(document.createElement('p'),{className:'mk-err notice warn',role:'alert'}));p.textContent=e.message+(e.data?.erreurs?' '+e.data.erreurs.join(' · '):'')+(e.data?.alertes&&!e.data?.erreurs?' '+e.data.alertes.join(' · '):'');p.hidden=false;p.scrollIntoView({block:'nearest'})}
 // Envoi d'un formulaire : action serveur, message, rechargement de l'outil.
 function brancher(host,module,fabrique,apres){host.querySelectorAll('form[data-mk-action]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');if(b)b.disabled=true;
  try{const corps={action:f.dataset.mkAction,...(fabrique?fabrique(f,form(f)):form(f))};if(corps===null)return;const j=await api(f.dataset.mkModule||module,{body:corps});if(apres)apres(j,f);else{toast?.(f.dataset.mkOk||'Enregistré');dessiner()}}
  catch(x){erreur(f,x)}finally{if(b)b.disabled=false}});
  host.querySelectorAll('[data-mk-btn]').forEach(b=>b.onclick=async()=>{const [action,...rest]=b.dataset.mkBtn.split('|');const corps={action,...JSON.parse(b.dataset.mkData||'{}')};if(b.dataset.mkConfirm&&!confirm(b.dataset.mkConfirm))return;b.disabled=true;
   try{const j=await api(b.dataset.mkModule||module,{body:corps});if(apres&&b.dataset.mkApres)apres(j,b);else{toast?.(b.dataset.mkOk||'Enregistré');dessiner()}}catch(x){erreur(b.closest('section,form,div')||host,x);b.disabled=false}})}
 const K={api,esc,toast,patients,nomPatient,parId,naissance,fr,heure,chip,jourISO,choixPatient,sejourCourant,onglets,form,erreur,brancher,etat,peut,job,admin,ctx,dessiner:()=>dessiner(),ouvrir:o=>ouvrir(o)};
 root.IaseloMarcheUI=K;

 /* ---------- Entrées du menu ---------- */
 function boutons(){
  const bas=document.querySelector('aside .asidebottom');if(!bas||bas.querySelector('[data-view="outils"]'))return;
  const mk=(v,label)=>{const b=document.createElement('button');b.type='button';b.className='nav mk-nav';b.dataset.view=v;b.innerHTML=svg(v)+'<span>'+label+'</span>'+(v==='messagerie'?'<b class="mk-badge" hidden></b>':'');b.onclick=()=>{outil=v==='messagerie'?'messagerie':'';ctx.go(v)};return b};
  bas.prepend(mk('outils','Outils'),mk('messagerie','Messagerie'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boutons);else boutons();
 // Messages non lus : pastille dans le menu, rafraîchie toutes les 60 s.
 async function compterMessages(){if(document.hidden||!job()||job()==='unassigned')return;try{const j=await api('messagerie');badgeMessages=j.fils.reduce((s,f)=>s+f.nonLus,0);const b=document.querySelector('.mk-nav[data-view="messagerie"] .mk-badge');if(b){b.hidden=!badgeMessages;b.textContent=badgeMessages>99?'99+':String(badgeMessages)}}catch{}}
 setTimeout(compterMessages,4000);setInterval(compterMessages,60000);

 /* ---------- Rendu ---------- */
 function ouvrir(o){outil=o;ctx.go(o==='messagerie'?'messagerie':'outils')}
 function render(view){
  vue=view;if(view==='messagerie')outil='messagerie';else if(outil==='messagerie')outil='';
  const t=outil?(outil==='messagerie'?{titre:'Messagerie'}:TUILES.find(x=>x.id===outil)):null;
  $('#title').textContent=t?t.titre:'Outils';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('#workspace').innerHTML=`<section class="panel mk"><div class="content">${outil&&outil!=='messagerie'?'<button type="button" class="secondary mk-retour">← Tous les outils</button>':''}<div id="mk-body"><p class="j-empty">Chargement…</p></div></div></section>`;
  const r=$('#workspace .mk-retour');if(r)r.onclick=()=>{outil='';render('outils')};
  dessiner();
 }
 async function dessiner(){
  const host=$('#mk-body');if(!host)return;const n=++chargement;
  try{
   if(!outil){host.innerHTML=hub();host.querySelectorAll('[data-mk-outil]').forEach(b=>b.onclick=()=>{const t=TUILES.find(x=>x.id===b.dataset.mkOutil);if(t?.vue){ctx.go(t.vue);return}outil=b.dataset.mkOutil;render('outils')});compterHub(host);return}
   const fn=OUTILS[outil];if(!fn){host.innerHTML='<p class="notice warn">Outil indisponible.</p>';return}
   const html=await fn.html(K);if(n!==chargement||!$('#mk-body'))return;host.innerHTML=html;
   host.querySelectorAll('[data-mk-onglet]').forEach(b=>b.onclick=()=>{const [c,k]=b.dataset.mkOnglet.split('|');etat[c].onglet=k;dessiner()});
   host.querySelectorAll('select.mk-patient[data-mk-choix]').forEach(s=>s.onchange=()=>{etat[s.dataset.mkChoix].stay=s.value;dessiner()});
   fn.brancher?.(host,K);
  }catch(e){if(n!==chargement)return;host.innerHTML=`<p class="notice warn">${esc(e.message)}</p>`}
 }
 function hub(){
  const vis=TUILES.filter(t=>peut(t.jobs));
  return `<p class="mk-intro">Outils complémentaires du dossier, ouverts selon votre métier. Les connexions aux logiciels extérieurs (laboratoires, logiciel administratif, moniteurs, EFS, SESAM-Vitale, paiement) fonctionnent en <b>simulation</b> tant que la clinique n’a pas fourni ses accès.</p>
  <div class="mk-tiles">${vis.map(t=>`<button type="button" class="mk-tile" data-mk-outil="${t.id}"><strong>${esc(t.titre)}</strong><span>${esc(t.texte)}</span><b class="mk-tile-n" data-mk-n="${t.id}" hidden></b></button>`).join('')}</div>`;
 }
 async function compterHub(host){
  const pose=(id,n,ton='')=>{const b=host.querySelector(`[data-mk-n="${id}"]`);if(b&&n){b.hidden=false;b.textContent=n;b.className='mk-tile-n '+ton}};
  if(peut(['anesthesiste','chirurgien','infirmier']))api('biologie').then(j=>pose('biologie',j.aRattacher.length+j.resultats.filter(r=>r.status==='nouveau').length,j.resultats.some(r=>r.status==='nouveau'&&r.data.critiques)?'crit':'')).catch(()=>{});
  if(peut(['anesthesiste','chirurgien','infirmier']))api('transfusion').then(j=>pose('transfusion',j.tracabilite.filter(p=>p.retard).length,'warn')).catch(()=>{});
  if(peut(['secretariat','facturation','dim','anesthesiste','chirurgien']))api('assurance').then(j=>pose('assurance',j.liste.filter(x=>x.etape.cle==='rejete').length||j.liste.filter(x=>x.etape.cle==='pret').length,j.liste.some(x=>x.etape.cle==='rejete')?'crit':'')).catch(()=>{});
  if(peut(['secretariat','facturation','dim','administration','anesthesiste','chirurgien']))api('codage').then(j=>pose('codage',j.recues.filter(x=>j.services.some(s=>x.data.destinataires.includes(s)&&(x.data.services?.[s]?.etat||'transmis')==='transmis')).length+j.envoyees.filter(x=>x.status==='a-corriger').length,j.envoyees.some(x=>x.status==='a-corriger')?'crit':'')).catch(()=>{});
  api('evenements').then(j=>pose('qualite',j.gestion?j.ei.filter(e=>e.status!=='clos').length:0)).catch(()=>{});
 }
 /* ---------- Bandeau dans le dossier du patient ---------- */
 async function bandeauDossier(stay){
  const host=$('#content');if(!host||!stay||host.querySelector('.mk-bandeau'))return;
  if(!peut(['anesthesiste','chirurgien','infirmier']))return;
  const el=document.createElement('section');el.className='mk-bandeau no-print';el.hidden=true;host.prepend(el);
  try{const [b,c]=await Promise.all([api('biologie',{q:'stay='+encodeURIComponent(stay.id)}),api('courriers',{q:'stay='+encodeURIComponent(stay.id)}).catch(()=>({courriers:[]}))]);
   const nouveaux=b.resultats.filter(r=>r.status==='nouveau'),crit=nouveaux.filter(r=>r.data.critiques).length,cour=c.courriers.filter(x=>x.status==='nouveau').length;
   if(!nouveaux.length&&!cour)return el.remove();
   el.innerHTML=`${crit?chip('Valeur critique','crit'):''}<span>${nouveaux.length?`<b>${nouveaux.length}</b> résultat${nouveaux.length>1?'s':''} de biologie non vu${nouveaux.length>1?'s':''}`:''}${nouveaux.length&&cour?' · ':''}${cour?`<b>${cour}</b> courrier${cour>1?'s':''} reçu${cour>1?'s':''}`:''}</span><button type="button" class="secondary">Ouvrir</button>`;el.hidden=false;
   el.querySelector('button').onclick=()=>{(etat.biologie??={}).stay=stay.id;etat.biologie.onglet=nouveaux.length?'resultats':'courriers';ouvrir('biologie')};
  }catch{el.remove()}
 }

 /* ---------- Moniteur de la salle, sur la feuille d'anesthésie ---------- */
 const LIB={hr:'FC',sbp:'PAS',dbp:'PAD',map:'PAM',spo2:'SpO₂',etco2:'EtCO₂',temp:'T°',rr:'FR',fio2:'FiO₂',vt:'VT',peep:'PEEP',pip:'Pcrête',halogenEnd:'Halogéné'};
 const moni={salle:'',depuis:'',mesures:null,salles:null,mode:'',choix:new Set(),pas:5};
 async function panneauMoniteur(stay){
  const host=$('#content');if(!host||!stay||host.querySelector('.mk-moniteur'))return;
  if(!ctx.peutPerop?.())return;
  const el=document.createElement('section');el.className='mk-moniteur panel no-print';const ancre=host.querySelector('.os-perop');ancre?ancre.after(el):host.prepend(el);
  if(!moni.salles){try{const j=await api('moniteurs');moni.salles=j.salles;moni.mode=j.mode}catch(e){el.remove();return}}
  if(!moni.depuis){const d=new Date(Date.now()-2*3600000);moni.depuis=jourISO(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
  const dessin=()=>{
   const lignes=echantillon();
   el.innerHTML=`<div class="content"><h3>Constantes reçues du moniteur</h3><p class="mk-sub">Les mesures arrivent de la passerelle des moniteurs de la salle ${moni.mode==='simulation'?'(<b>simulation</b> : données fictives)':''}. Rien n’est ajouté à la feuille sans votre relecture.</p>
   <div class="mk-row"><label>Salle<select name="salle"><option value="">Choisir…</option>${moni.salles.map(s=>`<option value="${esc(s.id)}" ${s.id===moni.salle?'selected':''}>${esc(s.label)}</option>`).join('')}</select></label><label>Depuis<input type="datetime-local" name="depuis" value="${esc(moni.depuis)}"></label><label>Une mesure toutes les<select name="pas">${[1,5,10,15].map(p=>`<option value="${p}" ${p===moni.pas?'selected':''}>${p} min</option>`).join('')}</select></label>
   <button type="button" class="secondary" data-m="charger">Afficher</button>${moni.mode==='simulation'&&moni.salle?'<button type="button" class="secondary" data-m="simuler">Simuler 1 h de moniteur</button>':''}</div>
   ${moni.mesures===null?'':lignes.length?`<div class="mk-scroll"><table class="mk-table"><thead><tr><th><input type="checkbox" data-m="tout" ${lignes.every(l=>moni.choix.has(l.at))?'checked':''} aria-label="Tout cocher"></th><th>Heure</th>${cles(lignes).map(k=>`<th>${esc(LIB[k]||k)}</th>`).join('')}</tr></thead><tbody>${lignes.map(l=>`<tr><td><input type="checkbox" data-at="${esc(l.at)}" ${moni.choix.has(l.at)?'checked':''}></td><td>${esc(l.at.slice(11,16))}</td>${cles(lignes).map(k=>`<td>${l.v[k]??''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
   <div class="mk-row"><button type="button" class="primary" data-m="ajouter" ${moni.choix.size?'':'disabled'}>Valider ${moni.choix.size} mesure${moni.choix.size>1?'s':''} dans la feuille</button></div>`:'<p class="notice">Aucune mesure reçue pour cette salle sur la période.</p>'}</div>`;
   el.querySelector('[name=salle]').onchange=e=>{moni.salle=e.target.value;moni.mesures=null;moni.choix.clear();dessin()};
   el.querySelector('[name=depuis]').onchange=e=>{moni.depuis=e.target.value};el.querySelector('[name=pas]').onchange=e=>{moni.pas=Number(e.target.value);moni.choix.clear();dessin()};
   el.querySelector('[data-m=charger]').onclick=charger;
   el.querySelector('[data-m=simuler]')?.addEventListener('click',async()=>{try{await api('moniteurs',{body:{action:'simuler',salle:moni.salle,minutes:60}});await charger()}catch(e){toast?.(e.message)}});
   el.querySelectorAll('[data-at]').forEach(c=>c.onchange=()=>{c.checked?moni.choix.add(c.dataset.at):moni.choix.delete(c.dataset.at);dessin()});
   el.querySelector('[data-m=tout]')?.addEventListener('change',e=>{for(const l of echantillon())e.target.checked?moni.choix.add(l.at):moni.choix.delete(l.at);dessin()});
   el.querySelector('[data-m=ajouter]')?.addEventListener('click',()=>{const choisis=echantillon().filter(l=>moni.choix.has(l.at));if(!choisis.length)return;
    const n=ctx.addPerop(choisis.map(l=>({at:l.at.slice(0,16),values:Object.fromEntries(Object.entries(l.v).map(([k,v])=>[k,String(v)]))})),moni.salles.find(s=>s.id===moni.salle)?.label||moni.salle);
    if(n){moni.choix.clear();toast?.(n+' mesure'+(n>1?'s':'')+' ajoutée'+(n>1?'s':'')+' à la feuille · source : moniteur')}});
  };
  const cles=l=>Object.keys(LIB).filter(k=>l.some(x=>x.v[k]!==undefined));
  function echantillon(){if(!moni.mesures)return [];const par=new Map();for(const m of moni.mesures){const d=new Date(m.at),slot=Math.floor(d.getTime()/(moni.pas*60000))*moni.pas*60000,cle=String(slot);const l=par.get(cle)||{at:'',v:{}};const loc=new Date(slot);l.at=jourISO(loc)+'T'+String(loc.getHours()).padStart(2,'0')+':'+String(loc.getMinutes()).padStart(2,'0');if(l.v[m.cle]===undefined)l.v[m.cle]=m.valeur;par.set(cle,l)}return [...par.values()].sort((a,b)=>a.at.localeCompare(b.at))}
  async function charger(){if(!moni.salle){toast?.('Choisissez la salle.');return}try{const depuis=new Date(moni.depuis).toISOString();const j=await api('moniteurs',{q:'salle='+encodeURIComponent(moni.salle)+'&depuis='+encodeURIComponent(depuis)});moni.mesures=j.mesures;moni.choix.clear();dessin()}catch(e){toast?.(e.message)}}
  dessin();
 }

 /* ---------- Assistant de consultation (dictée ou texte) ---------- */
 const dic={texte:'',props:null,choix:new Set(),enreg:null,etat:'',moteur:null,attentes:new Map(),suivant:1};
 function moteurDictee(){if(dic.moteur)return dic.moteur;const w=new Worker('/cro-transcription-worker.js',{type:'module'});
  w.onmessage=({data})=>{if(data.type==='progression'){dic.etat='Chargement du module de transcription : '+Math.round(100*data.charge/Math.max(1,data.total))+' %';majDictee()}else if(data.type==='pret'){dic.etat='';majDictee()}else if(data.type==='erreur'){dic.etat=data.message;for(const [,a] of dic.attentes)a.reject(Error(data.message));dic.attentes.clear();w.terminate();dic.moteur=null;majDictee()}else if(data.type==='texte'||data.type==='echec'){const a=dic.attentes.get(data.id);if(a){dic.attentes.delete(data.id);data.type==='texte'?a.resolve(data.texte):a.reject(Error('Extrait non transcrit.'))}}};
  w.postMessage({type:'charger'});return dic.moteur=w}
 const transcrire=audio=>new Promise((resolve,reject)=>{const id=dic.suivant++;dic.attentes.set(id,{resolve,reject});moteurDictee().postMessage({type:'transcrire',id,session:'cpa',audio},[audio.buffer])});
 async function demarrerEnregistrement(){
  if(!navigator.mediaDevices?.getUserMedia){toast?.('Micro indisponible sur ce navigateur : collez le texte.');return}
  moteurDictee();let flux;try{flux=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})}catch{toast?.('Micro bloqué : autorisez-le dans le navigateur, ou collez le texte.');return}
  let ac;try{ac=new AudioContext({sampleRate:16000})}catch{ac=new AudioContext()}
  const src=ac.createMediaStreamSource(flux),proc=ac.createScriptProcessor(4096,1,1),morceaux=[];proc.onaudioprocess=e=>morceaux.push(new Float32Array(e.inputBuffer.getChannelData(0)));src.connect(proc);proc.connect(ac.destination);
  dic.enreg={flux,ac,src,proc,morceaux,debut:Date.now(),taux:ac.sampleRate};dic.etat='Enregistrement en cours… parlez normalement ; l’audio reste sur ce poste.';majDictee();
 }
 async function arreterEnregistrement(){
  const e=dic.enreg;if(!e)return;dic.enreg=null;try{e.proc.disconnect();e.src.disconnect();e.flux.getTracks().forEach(t=>t.stop());await e.ac.close()}catch{}
  let n=0;for(const m of e.morceaux)n+=m.length;let buf=new Float32Array(n),k=0;for(const m of e.morceaux){buf.set(m,k);k+=m.length}
  if(e.taux!==16000){const r=e.taux/16000,out=new Float32Array(Math.floor(buf.length/r));for(let i=0;i<out.length;i++)out[i]=buf[Math.floor(i*r)];buf=out}
  dic.etat='Transcription locale en cours…';majDictee();const pas=25*16000,textes=[];
  try{for(let i=0;i<buf.length;i+=pas)textes.push(await transcrire(buf.slice(i,i+pas)));dic.texte=(dic.texte?dic.texte+' ':'')+textes.join(' ').trim();dic.etat='';analyser()}catch(x){dic.etat='Transcription impossible : '+x.message+' Collez le texte à la place.'}majDictee();
 }
 function analyser(){dic.props=M().extraireConsultation(dic.texte);dic.choix=new Set(dic.props.map((_,i)=>i));majDictee()}
 let dicHost=null,dicStay=null;
 function majDictee(){if(!dicHost||!dicHost.isConnected)return;const L=ctx.libelle||(x=>x);
  dicHost.innerHTML=`<details ${dic.props||dic.enreg||dic.texte?'open':''}><summary><b>Assistant de consultation</b> · dictée ou échange transcrits sur ce poste, propositions à valider champ par champ</summary>
  <div class="mk-dictee"><div class="mk-row">${dic.enreg?'<button type="button" class="primary" data-d="stop">■ Arrêter et transcrire</button>':'<button type="button" class="primary" data-d="rec">● Dicter / enregistrer l’échange</button>'}<button type="button" class="secondary" data-d="analyser">Analyser le texte</button>${dic.texte?'<button type="button" class="secondary" data-d="vider">Effacer</button>':''}</div>
  ${dic.etat?`<p class="mk-sub" role="status">${esc(dic.etat)}</p>`:''}<label>Texte transcrit (modifiable, ou collez vos notes)<textarea rows="4" data-d="texte" placeholder="Ex. : pèse 84 kg, mesure 1 m 78, tension 135 sur 80, allergie à la pénicilline, Mallampati 2, ASA 2…">${esc(dic.texte)}</textarea></label>
  ${dic.props?dic.props.length?`<table class="mk-table"><thead><tr><th></th><th>Champ</th><th>Proposition</th><th>Entendu</th></tr></thead><tbody>${dic.props.map((p,i)=>`<tr><td><input type="checkbox" data-i="${i}" ${dic.choix.has(i)?'checked':''}></td><td>${esc(L(p.champ))}</td><td><b>${esc(Array.isArray(p.valeur)?p.valeur.join(', '):String(p.valeur))}</b>${p.mode==='ajouter'?' <small>(ajout)</small>':''}</td><td><small>« ${esc(p.source)} »</small></td></tr>`).join('')}</tbody></table>
   <div class="mk-row"><button type="button" class="primary" data-d="reporter" ${dic.choix.size?'':'disabled'}>Reporter ${dic.choix.size} élément${dic.choix.size>1?'s':''} dans la consultation</button><small>Un champ déjà rempli n’est jamais écrasé ; les éléments reportés sont marqués « Dictée ».</small></div>`:'<p class="notice">Aucun élément reconnu : complétez la consultation à la main.</p>':''}</div></details>`;
  const q=s=>dicHost.querySelector(s);
  q('[data-d=texte]').oninput=e=>{dic.texte=e.target.value};
  q('[data-d=rec]')?.addEventListener('click',demarrerEnregistrement);q('[data-d=stop]')?.addEventListener('click',arreterEnregistrement);
  q('[data-d=analyser]').onclick=()=>{dic.texte=q('[data-d=texte]').value;analyser()};q('[data-d=vider]')?.addEventListener('click',()=>{dic.texte='';dic.props=null;majDictee()});
  dicHost.querySelectorAll('[data-i]').forEach(c=>c.onchange=()=>{c.checked?dic.choix.add(+c.dataset.i):dic.choix.delete(+c.dataset.i);majDictee()});
  q('[data-d=reporter]')?.addEventListener('click',()=>{const props=dic.props.filter((_,i)=>dic.choix.has(i));let ok=0,conflits=[];
   const fait=ctx.applyConsult(c=>{c.cpa??={};c.cpaMarques??={};for(const p of props){const r=M().appliquerProposition(c.cpa,p);if(r.applique){c.cpa=r.valeurs;c.cpaMarques[p.champ]=Array.isArray(p.valeur)?[...new Set([...(Array.isArray(c.cpaMarques[p.champ])?c.cpaMarques[p.champ]:[]),...p.valeur])]:true;ok++}else if(r.conflit)conflits.push(L(p.champ))}
    c.dictees=[...(c.dictees||[]),{at:new Date().toISOString(),champs:props.map(p=>p.champ),texte:dic.texte.slice(0,4000)}].slice(-20)},'Assistant de consultation : '+props.length+' proposition(s) relue(s)');
   if(!fait){toast?.('Report impossible : consultation validée ou profil non anesthésiste.');return}
   toast?.(ok+' champ'+(ok>1?'s':'')+' rempli'+(ok>1?'s':'')+(conflits.length?' · déjà renseignés, non modifiés : '+conflits.join(', '):''));dic.props=null;dic.texte='';majDictee()});
 }
 function panneauDictee(stay){const zone=$('#cpa-zone');if(!zone||!stay||document.querySelector('.mk-dictee-host'))return;if(!ctx.peutConsult?.())return;
  if(dicStay!==stay.id){dic.texte='';dic.props=null;dicStay=stay.id}
  dicHost=document.createElement('section');dicHost.className='mk-dictee-host no-print';zone.before(dicHost);majDictee()}

 return {render,dessiner,bandeauDossier,panneauMoniteur,panneauDictee,ouvrir,vues:['outils','messagerie']};
};

/* =====================================================================
   Messagerie entre soignants
   ===================================================================== */
OUTILS.messagerie={
 async html(K){const e=K.etat.messagerie??={fil:''};const j=await K.api('messagerie');e.fils=j.fils;e.equipes=j.equipes;
  if(!e.fil)e.fil=j.fils[0]?.fil||(j.equipes[0]?'equipe:'+j.equipes[0].id:'');
  const nomFil=f=>f.startsWith('equipe:')?(e.equipes.find(x=>'equipe:'+x.id===f)?.label||f):'Patient · '+(K.nomPatient(K.parId(f.slice(7)))||f.slice(7));
  const fils=[...e.equipes.map(x=>({fil:'equipe:'+x.id})),...j.fils.filter(f=>f.fil.startsWith('sejour:'))].map(f=>({...f,...(j.fils.find(x=>x.fil===f.fil)||{})}));
  let msgs=[];if(e.fil){try{msgs=(await K.api('messagerie',{q:'fil='+encodeURIComponent(e.fil)})).messages;if(msgs.some(m=>!m.moi))K.api('messagerie',{body:{action:'lu',fil:e.fil}}).catch(()=>{})}catch(x){msgs=[]}}
  return `<div class="mk-msg"><div class="mk-fils"><label>Nouvelle discussion sur un patient${K.choixPatient('','stay','Choisir…')}</label><ul>${fils.map(f=>`<li><button type="button" class="${f.fil===e.fil?'active':''}" data-fil="${K.esc(f.fil)}"><span>${K.esc(nomFil(f.fil))}</span>${f.nonLus?`<b class="mk-count ${f.urgent?'crit':''}">${f.nonLus}</b>`:''}${f.apercu?`<small>${K.esc(f.auteur)} : ${K.esc(f.apercu)}</small>`:''}</button></li>`).join('')}</ul></div>
  <div class="mk-fil">${e.fil?`<h3>${K.esc(nomFil(e.fil))}</h3><div class="mk-messages">${msgs.length?msgs.map(m=>`<article class="${m.moi?'moi':''} ${m.urgent?'urgent':''}"><header><b>${K.esc(m.auteur)}</b> · ${K.esc(K.fr(m.at))}${m.urgent?' '+K.chip('Urgent','crit'):''}</header><p>${K.esc(m.texte).replace(/\n/g,'<br>')}</p></article>`).join(''):'<p class="mk-sub">Aucun message pour l’instant.</p>'}</div>
   <form data-mk-action="envoyer" class="mk-envoi"><input type="hidden" name="fil" value="${K.esc(e.fil)}"><textarea name="texte" rows="2" maxlength="4000" required placeholder="Message (pas de copie d’écran ni de donnée inutile)"></textarea><label class="mk-check"><input type="checkbox" name="urgent" value="1"> Urgent</label><button type="submit" class="primary">Envoyer</button></form>`:'<p class="mk-sub">Choisissez une discussion.</p>'}</div></div>
  <p class="mk-sub">Messagerie interne de la clinique, réservée aux équipes habilitées ; chaque lecture est tracée. Pour un correspondant extérieur, utilisez MSSanté.</p>`},
 brancher(host,K){const e=K.etat.messagerie;
  host.querySelectorAll('[data-fil]').forEach(b=>b.onclick=()=>{e.fil=b.dataset.fil;K.dessiner()});
  const s=host.querySelector('select.mk-patient');if(s)s.onchange=()=>{if(s.value){e.fil='sejour:'+s.value;K.dessiner()}};
  K.brancher(host,'messagerie',(f,o)=>({fil:o.fil,texte:o.texte,urgent:!!o.urgent}),()=>{K.dessiner()});
  const m=host.querySelector('.mk-messages');if(m)m.scrollTop=m.scrollHeight;
 }
};

/* =====================================================================
   1. Biologie et courriers reçus
   ===================================================================== */
const INTERP={haut:['↑','warn'],bas:['↓','warn'],anormal:['!','warn'],'critique-haut':['↑↑','crit'],'critique-bas':['↓↓','crit'],critique:['!!','crit'],normal:['','']};
OUTILS.biologie={
 async html(K){
  const e=K.etat.biologie??={};const stay=K.sejourCourant('biologie'),clin=K.peut(['anesthesiste','chirurgien','infirmier','pharmacien']);
  const liste=clin?await K.api('biologie'):{resultats:[],aRattacher:[]},cour=await K.api('courriers').catch(()=>({courriers:[],aRattacher:[]}));
  const aRatt=[...liste.aRattacher.map(r=>({...r,type:'resultat'})),...cour.aRattacher.map(r=>({...r,type:'courrier'}))];
  const tabs=[...(clin?[['resultats','Résultats']]:[]),['courriers','Courriers reçus'],['rattacher','À rattacher',aRatt.length],...(clin?[['importer','Importer']]:[])];
  let corps='';const o=K.onglets('biologie',tabs);
  if(e.onglet==='resultats'){const res=stay?(await K.api('biologie',{q:'stay='+encodeURIComponent(stay)})).resultats:[];corps=choix(K,stay)+(stay?resultats(K,res):'')}
  else if(e.onglet==='courriers'){const cs=stay?(await K.api('courriers',{q:'stay='+encodeURIComponent(stay)})).courriers:[];corps=choix(K,stay)+(stay?courriers(K,cs,stay):'')}
  else if(e.onglet==='rattacher')corps=rattacher(K,aRatt);
  else corps=importer(K,stay);
  return o+corps;
 },
 brancher(host,K){
  K.brancher(host,'biologie');
  host.querySelectorAll('form[data-mk-depot]').forEach(f=>f.onsubmit=async ev=>{ev.preventDefault();const o=K.form(f),fic=f.querySelector('[type=file]').files[0];if(!fic){K.erreur(f,Error('Choisissez un fichier.'));return}
   if(fic.size>15*1024*1024){K.erreur(f,Error('15 Mo au plus.'));return}const b64=await lireB64(fic),texte=fic.type==='text/plain'?await fic.text():'';
   try{await K.api('courriers',{body:{action:'deposer',stay:o.stay,nom:fic.name,type:fic.type||'application/pdf',base64:b64,texte:texte||o.texte||'',objet:o.objet,expediteur:o.expediteur}});K.toast?.('Courrier déposé');K.dessiner()}catch(x){K.erreur(f,x)}});
  host.querySelectorAll('[data-fichier-hl7]').forEach(i=>i.onchange=async()=>{const f=i.files[0];if(f){const ta=i.closest('form').querySelector('textarea');ta.value=await f.text()}});
  host.querySelectorAll('form[data-mk-ratt]').forEach(f=>f.onsubmit=async ev=>{ev.preventDefault();const o=K.form(f);try{await K.api(f.dataset.mkRatt,{body:{action:'rattacher',id:o.id,stay:o.stay,motif:o.motif,typeDocument:o.typeDocument}});K.toast?.('Rattaché au dossier');K.dessiner()}catch(x){K.erreur(f,x)}});
 }
};
function lireB64(f){return new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=ko;r.readAsDataURL(f)})}
function choix(K,stay){return `<div class="mk-row"><label>Patient${K.choixPatient(stay).replace('<select','<select data-mk-choix="biologie"')}</label></div>`}
function resultats(K,res){
 if(!res.length)return `<p class="notice">Aucun résultat reçu pour ce patient.${K.peut(['anesthesiste','chirurgien','infirmier'])?' <button type="button" class="secondary" data-mk-btn="simuler" data-mk-data=\''+K.esc(JSON.stringify({stay:K.etat.biologie.stay}))+'\' data-mk-ok="Résultat fictif reçu. Sans IPP connu pour ce patient, il attend dans « À rattacher ».">Simuler un résultat du laboratoire</button>':''}</p>`;
 // Tableau cumulatif : une ligne par analyse, une colonne par prélèvement.
 const dates=[...new Set(res.flatMap(r=>r.data.resultats.map(x=>x.prelevement||r.day)))].sort().reverse().slice(0,6),lignes=new Map();
 for(const r of res)for(const x of r.data.resultats){const k=(x.code||x.libelle)+'|'+x.unite;const l=lignes.get(k)||{libelle:x.libelle,unite:x.unite,intervalle:x.intervalle,v:{}};l.v[x.prelevement||r.day]??=x;lignes.set(k,l)}
 const nouveaux=res.filter(r=>r.status==='nouveau'),medecin=K.peut(['anesthesiste','chirurgien']);
 return `${nouveaux.some(r=>r.data.critiques)?'<p class="notice warn mk-alerte"><b>Valeur critique</b> : à prendre en compte sans délai et à tracer.</p>':''}
 <div class="mk-scroll"><table class="mk-table mk-cumul"><thead><tr><th>Analyse</th><th>Normales</th>${dates.map(d=>`<th>${K.esc(K.fr(d))}</th>`).join('')}</tr></thead><tbody>${[...lignes.values()].map(l=>`<tr><th scope="row">${K.esc(l.libelle)} <small>${K.esc(l.unite)}</small></th><td><small>${K.esc(l.intervalle)}</small></td>${dates.map(d=>{const x=l.v[d];if(!x)return '<td></td>';const [s,ton]=INTERP[x.interpretation]||['',''];return `<td class="${ton}" title="${K.esc(x.statut+(x.commentaire?' · '+x.commentaire:''))}">${K.esc(x.valeur)} ${s?`<b>${s}</b>`:''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>
 <h3>Comptes rendus reçus</h3><ul class="mk-list">${res.map(r=>`<li><div><b>${K.esc(r.data.demandes.map(d=>d.libelle).join(', ')||'Biologie')}</b> · ${K.esc(r.data.emetteur||'Laboratoire')} · prélevé le ${K.esc(K.fr(r.data.demandes[0]?.prelevement||r.day))}${r.data.critiques?' '+K.chip(r.data.critiques+' critique'+(r.data.critiques>1?'s':''),'crit'):''}
  <small>Reçu ${K.esc(K.fr(r.at))} (${K.esc(r.data.source)}, ${K.esc(r.data.format)}) · rattachement ${K.esc(r.data.rattachement?.mode||'')} : ${K.esc(r.data.rattachement?.motif||'')}</small></div>
  <div>${r.status==='vu'?K.chip('Vu par '+r.data.vu.par+' · '+K.fr(r.data.vu.at),'ok'):medecin?`<button type="button" class="secondary" data-mk-btn="vu" data-mk-data='${K.esc(JSON.stringify({id:r.id}))}' data-mk-ok="Résultat marqué comme vu">Marquer comme vu</button>`:K.chip('Non vu par un médecin','warn')}</div></li>`).join('')}</ul>`;
}
function courriers(K,cs,stay){
 const T=root.IaseloMarche.TYPES_COURRIER;
 return `<ul class="mk-list">${cs.length?cs.map(c=>`<li><div><b>${K.esc(T[c.data.typeDocument]?.label||'Autre document')}</b> · ${K.esc(c.data.objet||c.data.nom)}<small>${K.esc(c.data.expediteur||'')} · reçu ${K.esc(K.fr(c.at))} par ${K.esc(c.data.canal==='mssante'?'MSSanté':'dépôt')}</small></div><div>${c.data.hash?`<a class="secondary mk-a" href="/api/workspace/marche/courriers/fichier?id=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Ouvrir</a>`:''}${c.status==='vu'?K.chip('Lu','ok'):K.peut(['anesthesiste','chirurgien','infirmier'])?`<button type="button" class="secondary" data-mk-module="courriers" data-mk-btn="vu" data-mk-data='${K.esc(JSON.stringify({id:c.id}))}'>Marquer comme lu</button>`:''}</div></li>`).join(''):'<li><span class="mk-sub">Aucun courrier pour ce patient.</span></li>'}</ul>
 <form data-mk-depot class="mk-card"><h3>Déposer un document reçu (PDF, scan, texte)</h3><input type="hidden" name="stay" value="${K.esc(stay)}"><div class="mk-grid"><label>Fichier<input type="file" accept="application/pdf,text/plain,image/jpeg,image/png" required></label><label>Objet<input name="objet" maxlength="300" placeholder="Ex. compte rendu de cardiologie"></label><label>Expéditeur<input name="expediteur" maxlength="300"></label></div><button type="submit" class="primary">Déposer dans le dossier</button></form>`;
}
function rattacher(K,items){
 if(!items.length)return '<p class="notice">Rien à rattacher : tous les documents reçus ont trouvé leur patient.</p>';
 const T=root.IaseloMarche.TYPES_COURRIER;
 return `<p class="mk-sub">Ces documents sont arrivés sans identifiant connu (INS ou IPP). Vérifiez l’identité avant de les rattacher : un rattachement à un autre patient que ceux proposés exige un motif (identitovigilance).</p><ul class="mk-list">${items.map(r=>{const p=r.data.patient||{};return `<li class="mk-ratt"><div><b>${r.type==='resultat'?'Biologie':K.esc(T[r.data.typeDocument]?.label||'Courrier')}</b> · reçu ${K.esc(K.fr(r.at))}${r.data.critiques?' '+K.chip('Valeur critique','crit'):''}
  <small>Identité lue : <b>${K.esc([p.nom,p.prenom].filter(Boolean).join(' ')||'—')}</b>${p.naissance?' · né(e) le '+K.esc(K.fr(p.naissance)):''}${p.ipp?' · IPP '+K.esc(p.ipp):''}${p.ins?' · INS '+K.esc(p.ins):''}</small>
  ${r.data.candidats?.length?`<small>Proposé : ${r.data.candidats.map(c=>`${K.esc(K.nomPatient(K.parId(c.stay))||c.stay)} (${K.esc(c.motif)})`).join(' ; ')}</small>`:'<small>Aucun patient correspondant.</small>'}</div>
  <form data-mk-ratt="${r.type==='resultat'?'biologie':'courriers'}" class="mk-row"><input type="hidden" name="id" value="${K.esc(r.id)}"><label>Patient${K.choixPatient(r.data.candidats?.[0]?.stay||'')}</label><label>Motif si différent<input name="motif" maxlength="300"></label>${r.type==='courrier'?`<label>Type<select name="typeDocument">${Object.entries(T).map(([k,v])=>`<option value="${k}" ${k===r.data.typeDocument?'selected':''}>${K.esc(v.label)}</option>`).join('')}</select></label>`:''}<button type="submit" class="primary">Rattacher</button></form></li>`}).join('')}</ul>`;
}
function importer(K,stay){
 return `<form data-mk-action="importer" class="mk-card"><h3>Importer un compte rendu de laboratoire</h3><p class="mk-sub">Fichier HL7 v2 (ORU^R01) ou HPRIM Santé reçu par le laboratoire. Une fois le flux du laboratoire branché, les résultats arrivent seuls.</p>
 <label>Fichier<input type="file" data-fichier-hl7 accept=".hl7,.hpr,.hprim,.txt,text/plain"></label><label>Contenu<textarea name="contenu" rows="8" required placeholder="MSH|^~\\&|… ou H|~^\\&|…"></textarea></label><button type="submit" class="primary">Importer</button></form>
 ${stay?`<p><button type="button" class="secondary" data-mk-btn="simuler" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Résultat fictif reçu. Sans IPP connu pour ce patient, il attend dans « À rattacher ».">Simuler un bilan du laboratoire pour ${K.esc(K.nomPatient(K.parId(stay)))}</button></p>`:''}`;
}

/* =====================================================================
   5. Transfusion
   ===================================================================== */
OUTILS.transfusion={
 async html(K){
  const e=K.etat.transfusion??={};const stay=K.sejourCourant('transfusion'),M_=root.IaseloMarche;
  const g=await K.api('transfusion');const o=K.onglets('transfusion',[['dossier','Dossier du patient'],['tracabilite','Traçabilité',g.tracabilite.filter(p=>p.retard).length]]);
  if(e.onglet==='tracabilite')return o+`<p class="mk-sub">Le devenir de chaque produit sanguin (transfusé, détruit, rendu) doit être connu et retourné à l’EFS. En retard au-delà de 48 h après la réception.</p><table class="mk-table"><thead><tr><th>Poche</th><th>Patient</th><th>Reçue</th><th>Devenir</th></tr></thead><tbody>${g.tracabilite.map(p=>`<tr><td>${K.esc(p.type)} ${K.esc(p.numero)} · ${K.esc(p.groupe)}</td><td>${K.esc(K.nomPatient(K.parId(p.stay))||p.stay)}</td><td>${K.esc(K.fr(p.reception))}</td><td>${p.devenir?K.chip(p.devenir,'ok'):K.chip(p.retard?'En retard ('+p.delaiH+' h)':'À renseigner',p.retard?'crit':'warn')}</td></tr>`).join('')||'<tr><td colspan="4">Aucune poche.</td></tr>'}</tbody></table>`;
  const tete=`<div class="mk-row"><label>Patient${K.choixPatient(stay).replace('<select','<select data-mk-choix="transfusion"')}</label>${g.mode==='simulation'?K.chip('EFS : simulation','warn'):''}</div>`;
  if(!stay)return o+tete;
  const el=(await K.api('transfusion',{q:'stay='+encodeURIComponent(stay)})).elements,now=new Date().toISOString();
  const dets=el.filter(x=>x.kind==='determination'),gv=M_.groupeValide(dets.map(x=>x.data)),raiR=el.find(x=>x.kind==='rai'),rv=raiR?M_.raiValide(raiR.data,now,{antecedentsRecents:raiR.data.antecedentsRecents!==false}):{valide:false,motif:'Pas de RAI.'};
  const cmds=el.filter(x=>x.kind==='commande'),poches=el.filter(x=>x.kind==='poche'),med=K.peut(['anesthesiste','chirurgien']);
  const d=JSON.stringify({stay});const h16=()=>{const x=new Date();return K.jourISO(x)+'T'+String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')};
  return o+tete+`<div class="mk-cols">
  <section class="mk-card"><h3>Groupe sanguin ${gv.valide?K.chip(gv.groupe+' · valide','ok'):K.chip(gv.discordance?'Discordance':'Non valide',gv.discordance?'crit':'warn')}</h3><p class="mk-sub">${K.esc(gv.valide?'Deux déterminations concordantes sur deux prélèvements distincts.':gv.motif)}</p>
   <ul class="mk-mini">${dets.map(x=>`<li>${K.esc(x.data.groupe)} · prélevé ${K.esc(K.fr(x.data.prelevement))} · n° ${K.esc(x.data.numeroPrelevement||'—')} ${x.data.laboratoire?'· '+K.esc(x.data.laboratoire):''}</li>`).join('')}</ul>
   <form data-mk-action="determination" data-mk-ok="Détermination enregistrée"><input type="hidden" name="stay" value="${K.esc(stay)}"><div class="mk-grid"><label>Groupe<select name="groupe">${['O+','O-','A+','A-','B+','B-','AB+','AB-'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Prélèvement<input type="datetime-local" name="prelevement" value="${h16()}" required></label><label>N° de prélèvement<input name="numeroPrelevement" required></label><label>Laboratoire<input name="laboratoire"></label></div><button class="secondary" type="submit">Ajouter une détermination</button></form></section>
  <section class="mk-card"><h3>RAI ${rv.valide?K.chip(rv.positive?'Positive':'Valide',rv.positive?'warn':'ok'):K.chip('À faire','warn')}</h3><p class="mk-sub">${K.esc(rv.motif)}</p>
   <form data-mk-action="rai" data-mk-ok="RAI enregistrée"><input type="hidden" name="stay" value="${K.esc(stay)}"><div class="mk-grid"><label>Prélèvement<input type="datetime-local" name="prelevement" value="${h16()}" required></label><label>Résultat<select name="resultat"><option value="negative">Négative</option><option value="positive">Positive</option></select></label><label>Spécificité<input name="specificite"></label></div><label class="mk-check"><input type="checkbox" name="sans" value="1"> Ni transfusion, ni grossesse, ni greffe dans les 6 derniers mois (validité 21 jours)</label><button class="secondary" type="submit">Enregistrer la RAI</button></form></section></div>
  ${med?`<form class="mk-card" data-mk-action="commande" data-mk-ok="Commande transmise"><h3>Prescrire et commander des PSL</h3><input type="hidden" name="stay" value="${K.esc(stay)}"><div class="mk-grid">${Object.entries(M_.PSL).map(([k,v])=>`<label>${K.esc(v.label)}<input type="number" min="0" max="20" name="q_${k}" value="0"></label>`).join('')}<label>Urgence<select name="urgence"><option value="programmee">Programmée</option><option value="relative">Urgence relative (< 3 h)</option><option value="vitale">Urgence vitale (< 30 min)</option><option value="vitale-immediate">Urgence vitale immédiate (sans délai)</option></select></label></div><label>Indication<input name="indication" required placeholder="Ex. Hb 6,8 g/dL, saignement actif"></label><button type="submit" class="primary">Envoyer la commande à l’EFS</button></form>`:''}
  ${cmds.map(c=>`<section class="mk-card"><h3>Commande du ${K.esc(K.fr(c.at))} ${K.chip({envoyee:'Envoyée',recue:'Reçue',echec:'Échec d’envoi'}[c.status]||c.status,c.status==='echec'?'crit':c.status==='recue'?'ok':'warn')}</h3><p class="mk-sub">${c.data.produits.map(p=>p.quantite+' '+p.type).join(', ')} · ${K.esc(c.data.urgence)} · ${K.esc(c.data.indication)} · ${K.esc(c.data.prescripteur)} ${c.data.envoi?.reference?'· réf. '+K.esc(c.data.envoi.reference):''}</p>
   ${c.status==='envoyee'?`<form data-mk-action="reception" data-mk-ok="Poche(s) reçue(s)" data-recep><input type="hidden" name="stay" value="${K.esc(stay)}"><input type="hidden" name="commande" value="${K.esc(c.id)}">${c.data.produits.flatMap(p=>Array.from({length:p.quantite},(_,i)=>`<div class="mk-grid"><label>N° de poche<input name="numero" required></label><label>Type<select name="type"><option ${p.type==='CGR'?'selected':''}>CGR</option><option ${p.type==='PFC'?'selected':''}>PFC</option><option ${p.type==='CPA'?'selected':''}>CPA</option><option ${p.type==='MCP'?'selected':''}>MCP</option></select></label><label>Groupe<select name="groupe">${['O+','O-','A+','A-','B+','B-','AB+','AB-'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Péremption<input type="date" name="peremption" required></label></div>`)).join('')}<button class="secondary" type="submit">Enregistrer la réception</button></form>`:''}</section>`).join('')}
  ${poches.map(p=>poche(K,p,stay,gv)).join('')}`;
 },
 brancher(host,K){
  K.brancher(host,'transfusion',(f,o)=>{
   if(f.dataset.mkAction==='commande')return {stay:o.stay,urgence:o.urgence,indication:o.indication,produits:Object.keys(root.IaseloMarche.PSL).map(k=>({type:k,quantite:Number(o['q_'+k])||0})).filter(p=>p.quantite>0),forcer:o.urgence==='vitale-immediate'};
   if(f.dataset.mkAction==='rai')return {stay:o.stay,prelevement:o.prelevement,resultat:o.resultat,specificite:o.specificite,antecedentsRecents:!o.sans};
   if(f.dataset.mkAction==='reception'){const arr=k=>[].concat(o[k]||[]);return {stay:o.stay,commande:o.commande,poches:arr('numero').map((n,i)=>({numero:n,type:arr('type')[i],groupe:arr('groupe')[i],peremption:arr('peremption')[i]}))}}
   if(f.dataset.mkAction==='pose'){const items=Object.fromEntries(root.IaseloMarche.CUPT.map(([k])=>[k,o[k]?'oui':'']));return {stay:o.stay,poche:o.poche,items,carte:{patient:o.cartePatient,poche:o.cartePoche},surveillanceAvant:{sbp:o.sbp,hr:o.hr,temp:o.temp,spo2:o.spo2},groupeConnu:o.groupeConnu,urgenceVitale:!!o.urgenceVitale}}
   if(f.dataset.mkAction==='surveillance')return {stay:o.stay,poche:o.poche,moment:o.moment,mesures:{sbp:o.sbp,hr:o.hr,temp:o.temp,spo2:o.spo2,signes:[].concat(o.signes||[])}};
   if(f.dataset.mkAction==='eir')return {stay:o.stay,poche:o.poche,grade:o.grade,description:o.description,signes:[].concat(o.signes||[])};
   return o},(j,f)=>{if(j.alertes?.length)K.toast?.('Alerte : '+j.alertes.join(' · '));else K.toast?.(f.dataset?.mkOk||'Enregistré');K.dessiner()});
 }
};
function poche(K,p,stay,gv){const M_=root.IaseloMarche,d=p.data,st={recue:['Reçue','warn'],posee:['En cours','warn'],terminee:['Terminée','ok'],arretee:['Arrêtée : alerte','crit']}[p.status]||[p.status,''];
 const id=`<input type="hidden" name="stay" value="${K.esc(stay)}"><input type="hidden" name="poche" value="${K.esc(p.id)}">`;
 const consts=`<label>PAS<input type="number" name="sbp" min="30" max="260" required></label><label>FC<input type="number" name="hr" min="20" max="250" required></label><label>T °C<input type="number" step="0.1" name="temp" min="30" max="43" required></label><label>SpO₂<input type="number" name="spo2" min="50" max="100"></label>`;
 return `<section class="mk-card mk-poche"><h3>${K.esc(d.type)} n° ${K.esc(d.numero)} · ${K.esc(d.groupe)} ${K.chip(st[0],st[1])}</h3><p class="mk-sub">Reçue ${K.esc(K.fr(d.reception))} par ${K.esc(d.recuPar)} · péremption ${K.esc(K.fr(d.peremption))}${d.pose?.debut?' · posée '+K.esc(K.heure(d.pose.debut))+' par '+K.esc(d.pose.par):''}${d.pose?.fin?' · fin '+K.esc(K.heure(d.pose.fin)):''}</p>
 ${d.alerte?`<p class="notice warn"><b>Transfusion arrêtée</b> : ${K.esc(d.alerte.signes.join(', '))}. Garder la poche et la tubulure, prévenir le médecin et l’EFS, déclarer l’effet indésirable.</p>`:''}
 ${d.surveillance?.length?`<ul class="mk-mini">${d.surveillance.map(s=>`<li>${K.esc({avant:'Avant',['15min']:'15 min',pendant:'Pendant',fin:'Fin'}[s.moment]||s.moment)} · ${K.esc(K.heure(s.at))} · PA ${K.esc(s.sbp||'—')} · FC ${K.esc(s.hr||'—')} · T ${K.esc(s.temp||'—')}${s.signes?.length?' · '+K.esc(s.signes.join(', ')):''}</li>`).join('')}</ul>`:''}
 ${p.status==='recue'?`<form data-mk-action="pose" data-mk-ok="Contrôle ultime conforme : transfusion débutée">${id}<h4>Contrôle ultime prétransfusionnel au lit du patient</h4><div class="mk-checks">${M_.CUPT.map(([k,l])=>`<label class="mk-check"><input type="checkbox" name="${k}" value="1"> ${K.esc(l)}</label>`).join('')}</div>
  ${d.type==='CGR'?`<div class="mk-grid"><label>Carte : groupe du patient<select name="cartePatient"><option value="">—</option>${['O','A','B','AB'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Carte : groupe de la poche<select name="cartePoche"><option value="">—</option>${['O','A','B','AB'].map(x=>`<option>${x}</option>`).join('')}</select></label></div>`:''}
  ${gv.valide?'':`<div class="mk-grid"><label>Groupe connu du patient<input name="groupeConnu" placeholder="Ex. A+"></label><label class="mk-check"><input type="checkbox" name="urgenceVitale" value="1"> Urgence vitale (groupage incomplet)</label></div>`}
  <h4>Constantes avant la pose</h4><div class="mk-grid">${consts}</div><button class="primary" type="submit">Contrôle conforme : débuter</button></form>`:''}
 ${p.status==='posee'?`<form data-mk-action="surveillance" data-mk-ok="Surveillance enregistrée">${id}<h4>Surveillance</h4><div class="mk-grid"><label>Moment<select name="moment"><option value="15min">15 premières minutes</option><option value="pendant">Pendant</option><option value="fin">Fin de transfusion</option></select></label>${consts}</div><div class="mk-checks">${M_.SIGNES_EIR.map(s=>`<label class="mk-check"><input type="checkbox" name="signes" value="${K.esc(s)}"> ${K.esc(s)}</label>`).join('')}</div><button class="secondary" type="submit">Enregistrer</button></form>`:''}
 ${['terminee','arretee','posee'].includes(p.status)&&!d.eir?`<details><summary>Déclarer un effet indésirable receveur</summary><form data-mk-action="eir" data-mk-ok="Effet indésirable déclaré (qualité et hémovigilance)">${id}<div class="mk-grid"><label>Gravité<select name="grade">${Object.entries(M_.GRAVITE_EIR).map(([k,v])=>`<option value="${k}">${K.esc(v)}</option>`).join('')}</select></label></div><div class="mk-checks">${M_.SIGNES_EIR.map(s=>`<label class="mk-check"><input type="checkbox" name="signes" value="${K.esc(s)}"> ${K.esc(s)}</label>`).join('')}</div><label>Description<textarea name="description" rows="2" required></textarea></label><button class="secondary" type="submit">Déclarer</button></form></details>`:''}
 ${d.eir?`<p class="mk-sub">${K.chip('EIR grade '+d.eir.grade,'crit')} déclaré par ${K.esc(d.eir.par)} · suivi dans Qualité & sécurité.</p>`:''}
${!d.devenir?`<div class="mk-row"><span class="mk-sub">Devenir :</span>${['transfusee','partielle','detruite','rendue'].map(v=>`<button type="button" class="secondary" data-mk-btn="devenir" data-mk-data='${K.esc(JSON.stringify({stay,poche:p.id,devenir:v}))}'>${{transfusee:'Transfusée',partielle:'Partiellement transfusée',detruite:'Détruite',rendue:'Rendue au dépôt'}[v]}</button>`).join('')}</div>`:`<p class="mk-sub">Devenir : ${K.chip(d.devenir,'ok')} (${K.esc(d.devenirPar)}, ${K.esc(K.fr(d.devenirLe))})</p>`}</section>`}

/* =====================================================================
   2. Interfaces avec le logiciel administratif et état des connecteurs
   ===================================================================== */
OUTILS.interfaces={
 async html(K){
  const e=K.etat.interfaces??={};const j=await K.api('interfaces'),aR=j.adt.filter(a=>a.status==='a-rattacher');const ecrit=K.peut(['secretariat','dim','facturation']);
  const o=K.onglets('interfaces',[['connecteurs','Connexions'],['adt','Mouvements reçus',aR.length],['sortants','Envois'],...(ecrit?[['outils','Envoyer / importer']]:[])]);
  if(e.onglet==='connecteurs')return o+`<table class="mk-table"><thead><tr><th>Connexion</th><th>Sens</th><th>Mode</th><th>État</th></tr></thead><tbody>${j.connecteurs.map(c=>`<tr><td><b>${K.esc(c.label)}</b><small>${K.esc(c.doc)}</small></td><td>${K.esc(c.sens)}</td><td>${K.chip(c.mode,c.mode==='production'?'ok':c.mode==='test'?'warn':'')}</td><td>${K.esc(c.etat)}${c.entrant?'<small>Flux entrant : '+K.esc(c.entrant)+'</small>':''}</td></tr>`).join('')}</tbody></table>
   <p class="mk-sub">Chaque connexion se règle dans les variables Clever Cloud (INTEROP_&lt;NOM&gt;_MODE, _URL, _JETON). Le passage en test ou en production se fait avec l’éditeur du logiciel concerné et un fichier d’exemple réel.</p>`;
  if(e.onglet==='adt')return o+`<ul class="mk-list">${j.adt.map(a=>`<li><div><b>${K.esc(a.data.evenement)} · ${K.esc(a.data.libelle)}</b> ${a.status==='a-rattacher'?K.chip('À rattacher','warn'):K.chip('Intégré','ok')}<small>${a.data.patient?K.esc([a.data.patient.nom,a.data.patient.prenom].join(' '))+' · né(e) le '+K.esc(K.fr(a.data.patient.naissance))+' · IPP '+K.esc(a.data.patient.ipp||'—'):''}${a.data.nda?' · NDA '+K.esc(a.data.nda):''}${a.data.chambre?' · chambre '+K.esc(a.data.chambre)+(a.data.lit?' lit '+K.esc(a.data.lit):''):''} · ${K.esc(K.fr(a.at))}</small></div>
   ${a.status==='a-rattacher'&&ecrit?`<form data-mk-action="rattacher-adt" class="mk-row"><input type="hidden" name="id" value="${K.esc(a.id)}"><label>Séjour${K.choixPatient(a.data.candidats?.[0]?.stay||'')}</label><button type="submit" class="primary">Rattacher</button></form>`:''}</li>`).join('')||'<li class="mk-sub">Aucun mouvement reçu.</li>'}</ul>`;
  if(e.onglet==='sortants')return o+`<ul class="mk-list">${j.sortants.map(s=>`<li><div><b>${K.esc(s.data.type)}</b> vers ${K.esc(s.data.destinataire)} · ${K.esc(K.nomPatient(K.parId(s.stay))||s.stay)} · ${s.data.actes} acte(s) ${K.chip(s.status==='envoye'?(s.data.simulation?'Simulation':'Transmis'):'Échec',s.status==='envoye'?'ok':'crit')}<small>${K.esc(K.fr(s.at))} · ${K.esc(s.data.detail||'')} ${s.data.reference?'· réf. '+K.esc(s.data.reference):''}</small></div><details><summary>Message</summary><pre class="mk-pre">${K.esc(s.data.message.replace(/\r/g,'\n'))}</pre></details></li>`).join('')||'<li class="mk-sub">Aucun envoi.</li>'}</ul>`;
  return o+`<form class="mk-card" data-mk-action="envoyer-actes" data-mk-ok="Actes envoyés"><h3>Envoyer les actes d’un séjour au logiciel administratif</h3><p class="mk-sub">Les actes saisis dans Activité partent en HL7 DFT^P03 ; le groupage GHM et les fichiers ATIH restent faits par le logiciel PMSI de la clinique.</p><label>Séjour${K.choixPatient('')}</label><button class="primary" type="submit">Envoyer</button></form>
   <form class="mk-card" data-mk-action="importer-adt" data-mk-ok="Mouvement importé"><h3>Importer un mouvement (HL7 ADT)</h3><textarea name="contenu" rows="5" required placeholder="MSH|^~\\&|GAM|…|ADT^A01|…"></textarea><button class="secondary" type="submit">Importer</button></form>
   <form class="mk-card" data-mk-action="simuler-adt" data-mk-ok="Admission fictive reçue"><h3>Simuler une admission du logiciel administratif</h3><label>Séjour${K.choixPatient('')}</label><button class="secondary" type="submit">Simuler</button></form>`;
 },
 brancher(host,K){K.brancher(host,'interfaces')}
};
})(window);

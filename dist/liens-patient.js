// IASELO · pages patient ouvertes par un lien personnel : prise de rendez-vous de consultation d'anesthésie,
// devis d'honoraires à signer, paiement en ligne. Le jeton est dans l'ancre (#acces=…), jamais envoyé dans l'adresse ;
// la date de naissance est vérifiée par le serveur (5 essais). Aucune donnée de santé n'est affichée avant cette vérification.
(function(){
'use strict';
const $=s=>document.querySelector(s),host=$('#workspace'),page=document.body.dataset.lien;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h=new URLSearchParams(location.hash.slice(1)),token=h.get('acces')||'',etatRetour=h.get('etat')||'';
if(token)history.replaceState(null,'',location.pathname);
let naissance='';
const euros=c=>(Number(c||0)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const fr=d=>{const x=new Date(String(d).length<=10?d+'T12:00':d);return isNaN(x)?String(d||''):x.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})};
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content lp">${html}</div></section>`};
async function call(route,data={}){const r=await fetch('/api/'+page+'/'+route,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,naissance,...data})});const j=await r.json().catch(()=>({error:'Serveur indisponible.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Serveur indisponible.'),{status:r.status});return j}
const TITRES={rdv:'Prendre rendez-vous avec l’anesthésiste',devis:'Votre devis d’honoraires',paiement:'Régler en ligne'};
function ferme(m){panel(`<h2>Lien indisponible</h2><p>${esc(m)}</p><p>Contactez le secrétariat de la clinique.</p>`)}
function identite(err){
 panel(`<h2>${esc(TITRES[page])}</h2><p>Pour protéger vos informations, indiquez votre date de naissance.</p>
 <form id="lp-id"><label class="sj-q"><span>Votre date de naissance</span><input type="date" name="dob" required autocomplete="bday" value="${esc(naissance)}"></label>${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary">Continuer</button></div></form><p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#lp-id').onsubmit=async e=>{e.preventDefault();naissance=new FormData(e.target).get('dob');e.target.querySelector('button').disabled=true;
  try{const j=await call('ouvrir');({rdv,devis,paiement})[page](j)}catch(x){if(x.status===410)ferme(x.message);else identite(x.message)}};
}
/* ---------- Rendez-vous ---------- */
function rdv(j,msg){
 const parJour={};for(const c of j.creneaux)(parJour[c.date]??=[]).push(c);
 const jours=Object.keys(parJour).sort();
 panel(`<p class="dc-pt-kicker">${esc(j.etablissement)}</p><h2>${TITRES.rdv}</h2>
 ${j.actuel?`<p class="pp-banner is-ok"><span>Votre rendez-vous : <b>${esc(fr(j.actuel.date))} à ${esc(j.actuel.heure)}</b> avec ${esc(j.actuel.medecin)} · ${esc(j.actuel.mode==='teleconsultation'?'téléconsultation':j.actuel.lieu)}. Vous pouvez en choisir un autre ci-dessous : l’ancien sera libéré.</span></p>`:''}
 ${msg?`<p class="pp-banner is-ok" role="status"><span>${msg}</span></p>`:''}
 <p>La consultation doit avoir lieu au plus tard le <b>${esc(fr(j.limite))}</b> (au moins 48 heures avant l’intervention). Choisissez un horaire :</p>
 ${jours.length?jours.map(d=>`<fieldset class="lp-jour"><legend>${esc(fr(d))}</legend><div class="lp-creneaux">${parJour[d].map(c=>`<button type="button" class="secondary" data-p="${esc(c.plage)}" data-h="${esc(c.heure)}" title="${esc(c.medecin)} · ${esc(c.mode==='teleconsultation'?'téléconsultation':c.lieu)}">${esc(c.heure)}<small>${esc(c.medecin)}</small></button>`).join('')}</div></fieldset>`).join(''):'<p class="pp-banner is-warn"><span>Aucun créneau en ligne avant la date limite. Appelez le secrétariat pour fixer votre rendez-vous.</span></p>'}`);
 host.querySelectorAll('[data-p]').forEach(b=>b.onclick=async()=>{host.querySelectorAll('[data-p]').forEach(x=>x.disabled=true);
  try{const r=await call('reserver',{plage:b.dataset.p,heure:b.dataset.h});const j2=await call('ouvrir');rdv(j2,`Rendez-vous confirmé le <b>${esc(fr(r.rdv.date))} à ${esc(r.rdv.heure)}</b> avec ${esc(r.rdv.medecin)}. Vous recevrez un rappel.`)}
  catch(x){if(x.status===410)return ferme(x.message);const j2=await call('ouvrir').catch(()=>j);rdv(j2,'');const p=document.createElement('p');p.className='pp-err';p.role='alert';p.textContent=x.message;host.querySelector('.content').prepend(p)}});
}
/* ---------- Devis ---------- */
function devis(j,err){
 const fini=j.statut!=='envoye';
 panel(`<p class="dc-pt-kicker">${esc(j.etablissement)}</p><h2>${TITRES.devis}</h2>
 <p>Praticien : <b>${esc(j.praticien)}</b> · secteur ${esc(j.secteur)}${j.optam?' (OPTAM)':''}${j.dateIntervention?' · intervention prévue le '+esc(fr(j.dateIntervention)):''}</p>
 <div class="mk-scroll"><table class="lp-table"><thead><tr><th>Acte</th><th>Base de remboursement</th><th>Honoraires demandés</th><th>Dépassement</th></tr></thead><tbody>${j.lignes.map(l=>`<tr><td>${esc(l.libelle||l.code)}${l.code?` <small>${esc(l.code)}</small>`:''}</td><td>${euros(l.base)}</td><td>${euros(l.demande)}</td><td>${euros(l.depassement)}</td></tr>`).join('')}</tbody>
 <tfoot><tr><th>Total</th><th>${euros(j.base)}</th><th>${euros(j.total)}</th><th>${euros(j.depassement)}</th></tr></tfoot></table></div>
 <p class="sessionnote">La base de remboursement est prise en charge par l’Assurance maladie selon votre situation. Le dépassement peut être remboursé, en tout ou partie, par votre complémentaire santé : transmettez-lui ce devis.</p>
 ${fini?`<p class="pp-banner ${j.statut==='signe'?'is-ok':'is-warn'}"><span>${j.statut==='signe'?'Vous avez accepté ce devis':'Vous avez refusé ce devis'}${j.signature?.at?' le '+esc(new Date(j.signature.at).toLocaleString('fr-FR')):''}.</span></p>`:
 `<form id="lp-devis"><label class="sj-q"><span>Vos nom et prénom (valent signature)</span><input name="nom" required minlength="3" maxlength="120" autocomplete="name"></label>
  <label class="lp-check"><input type="checkbox" name="lu" required> J’ai pris connaissance de ce devis et de son montant.</label>
  ${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}
  <div class="v-actions"><button class="primary" value="oui">J’accepte et je signe</button><button class="secondary" value="non" formnovalidate>Je refuse</button></div></form>`}`);
 const f=$('#lp-devis');if(f)f.onsubmit=async e=>{e.preventDefault();const accepte=e.submitter?.value==='oui',nom=new FormData(f).get('nom');if(!accepte&&String(nom).trim().length<3)return devis(j,'Saisissez vos nom et prénom, même pour refuser.');
  f.querySelectorAll('button').forEach(b=>b.disabled=true);try{await call('signer',{accepte,nom});devis(await call('ouvrir'))}catch(x){if(x.status===410)ferme(x.message);else devis(j,x.message)}};
}
/* ---------- Paiement ---------- */
function paiement(j,err){
 const paye=j.statut==='paye';
 panel(`<p class="dc-pt-kicker">${esc(j.etablissement)}</p><h2>${TITRES.paiement}</h2>
 <p>${esc(j.objet)} · <span>référence</span> <b>${esc(j.reference)}</b></p><p class="lp-montant">${euros(j.montant)}</p>
 ${paye?'<p class="pp-banner is-ok"><span><b>Paiement reçu.</b> Merci. Un reçu vous sera remis par la clinique.</span></p>':
  `${etatRetour==='abandon'?'<p class="pp-banner is-warn"><span>Paiement abandonné. Vous pouvez réessayer.</span></p>':''}${etatRetour==='succes'?'<p class="pp-banner is-ok"><span>Paiement en cours de confirmation par la banque. Actualisez la page dans un instant.</span></p>':''}
  ${j.simulation?'<p class="pp-banner is-warn"><span><b>Démonstration :</b> le paiement en ligne de la clinique n’est pas encore ouvert. Le bouton ci-dessous simule le règlement, aucune carte n’est débitée.</span></p>':'<p>Vous allez être redirigé vers la page sécurisée de notre prestataire de paiement. IASELO ne voit jamais votre numéro de carte.</p>'}
  ${err?`<p class="pp-err" role="alert">${esc(err)}</p>`:''}<div class="v-actions"><button class="primary" id="lp-payer">${j.simulation?'Simuler le paiement':'Payer '+euros(j.montant)}</button></div>`}`);
 const b=$('#lp-payer');if(b)b.onclick=async()=>{b.disabled=true;try{const r=await call('payer',{confirmerSimulation:j.simulation===true});if(r.statut==='paye')return paiement({...j,statut:'paye'});if(r.url&&/^https:\/\//.test(r.url))location.href=r.url;else paiement(await call('ouvrir'))}catch(x){if(x.status===410)ferme(x.message);else paiement(j,x.message)}};
}
if(!TITRES[page])return;
document.title=TITRES[page];if($('#title'))$('#title').textContent=TITRES[page];
if(!/^[a-f0-9]{64}$/.test(token))ferme('Ce lien est incomplet. Ouvrez-le directement depuis le message reçu.');else identite('');
})();

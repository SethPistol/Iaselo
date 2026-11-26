/* IASELO · commandes de la pharmacie aux fournisseurs (26/11/2026, demande de Romain).
   Écran « Commandes pharmacie » (menu du pharmacien et du préparateur en pharmacie ; lecture pour l'administrateur) :
    - À traiter : commandes à valider, à transmettre, livraisons attendues, propositions de réapprovisionnement
      (stock sous le seuil minimum, commandes en cours déduites), réceptions pas encore entrées en stock ;
    - Commandes : toutes les commandes, détail, étapes, bon de commande imprimable ;
    - Livret des produits : produits commandables, fournisseur, prix, seuils, stupéfiant, froid, MDS (pharmacien).
   Les lots reçus conformes entrent dans le stock de Circuit du médicament › Stocks (dispensation).
   Règles : commandes-pharmacie-regles.js · serveur : worker/commandes-pharmacie.mjs. */
(function(root){
'use strict';
const R=()=>root.IaseloCommandesPharmacie;
const frDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const frD=iso=>iso?new Date(iso+(iso.length===10?'T12:00:00':'')).toLocaleDateString('fr-FR'):'';
const ACTIONS={creation:'Création',modification:'Modification',soumission:'Soumise au pharmacien',validation:'Validée par le pharmacien',renvoi:'Renvoyée au préparateur',reouverture:'Rouverte',transmission:'Transmise au fournisseur',reception:'Réception',solde:'Reliquat soldé',annulation:'Annulée'};
const TON={brouillon:'',a_valider:'warn',validee:'acc',envoyee:'acc',partielle:'warn',recue:'ok',soldee:'ok',annulee:'crit'};
async function api(body){
 const r=await fetch('/api/workspace/pharmacie',{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});
 const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok){const e=Error(j.error||'Service indisponible.');e.status=r.status;e.data=j;throw e}return j;
}
root.createCommandesPharmacie=function(ctx){
 const {$,esc,toast}=ctx;
 let s={onglet:'atraiter',donnees:null,erreur:'',detail:null,edition:null,article:null,filtre:'en-cours',message:''};
 const P=()=>s.donnees?.profil,pharma=()=>P()==='pharmacien',ecrit=()=>['pharmacien','preparateur'].includes(P());
 const refus=(a,c)=>R().refus(a,P(),c,s.donnees?.moi);
 const lots=()=>ctx.lots?.()||[];
 const auj=()=>s.donnees?.aujourdhui||new Date().toISOString().slice(0,10);
 const chip=c=>`<span class="cp-chip ${TON[c.statut]||''}">${esc(R().STATUTS[c.statut]||c.statut)}</span>`;
 const flags=a=>[a.stupefiant?'<span class="cp-flag stup" title="Stupéfiant : bon dédié, réception par le pharmacien">Stupéfiant</span>':'',a.froid?'<span class="cp-flag froid" title="Chaîne du froid 2 à 8 °C">Froid</span>':'',a.mds?'<span class="cp-flag mds" title="Médicament dérivé du sang : traçabilité nominative">MDS</span>':''].join('');
 const table=(h,rows,cls='')=>rows.length?`<div class="management-scroll"><table class="management-table cp-table ${cls}"><thead><tr>${h.map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="cp-empty">Rien à afficher.</p>';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="commandesPharmacie"]'))return;
  const ancre=document.querySelector('aside .nav[data-view="pharmacy"]');if(!ancre)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='commandesPharmacie';
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>Commandes pharmacie';
  b.onclick=()=>ctx.go('commandesPharmacie');ancre.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bouton);else bouton();
 setTimeout(bouton,1500);

 async function charger(){s.erreur='';try{s.donnees=await api();if(s.detail)s.detail=s.donnees.commandes.find(c=>c.id===s.detail.id)||s.detail}catch(e){s.erreur=e.message;if(!s.donnees)s.donnees=null}dessiner()}
 function render(){
  $('#title').textContent='Commandes pharmacie';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='commandesPharmacie'));
  $('#workspace').innerHTML='<section class="panel"><div class="content cp-wrap" id="cp-host"><p class="cp-mut">Chargement des commandes…</p></div></section>';
  s.onglet='atraiter';s.detail=null;s.edition=null;s.article=null;charger();
 }
 function dessiner(){
  const host=$('#cp-host');if(!host)return;
  if(!s.donnees){host.innerHTML=`<p class="notice warn">${esc(s.erreur||'Commandes disponibles sur le serveur de la clinique.')}</p>`;return}
  const onglets=[['atraiter','À traiter'],['commandes','Commandes'],['livret','Livret des produits']];
  const tete=`<div class="cp-head"><div><p class="cp-mut">${esc(R().PROFILS[P()]||'Lecture seule (administrateur)')} · ${P()==='preparateur'?'vous préparez, soumettez, transmettez et réceptionnez ; le pharmacien valide.':P()==='pharmacien'?'vous validez les commandes et tenez le livret ; le préparateur prépare et réceptionne.':'les commandes sont passées par la pharmacie.'}</p></div>${ecrit()?'<button type="button" class="primary" id="cp-nouvelle">Nouvelle commande</button>':''}</div>
   <div class="tabs cp-tabs" role="tablist">${onglets.map(([k,l])=>`<button type="button" data-cp-onglet="${k}" class="${s.onglet===k&&!s.detail&&!s.edition?'active':''}" aria-pressed="${s.onglet===k}">${l}</button>`).join('')}</div>
   ${s.erreur?`<p class="notice warn">${esc(s.erreur)}</p>`:''}${s.message?`<p class="notice cp-ok">${esc(s.message)}</p>`:''}<div id="cp-body"></div>`;
  host.innerHTML=tete;s.message='';
  host.querySelectorAll('[data-cp-onglet]').forEach(b=>b.onclick=()=>{s.onglet=b.dataset.cpOnglet;s.detail=null;s.edition=null;s.article=null;dessiner()});
  $('#cp-nouvelle')?.addEventListener('click',()=>{s.edition={fournisseur:'',lignes:[],note:'',urgent:false};s.detail=null;dessiner()});
  const body=$('#cp-body');
  if(s.edition)return edition(body);
  if(s.detail)return detail(body,s.detail);
  ({atraiter,commandes,livret})[s.onglet](body);
 }

 /* ---------- À traiter ---------- */
 function ligneCmd(c){return [`<button type="button" class="textbutton cp-num" data-cp-ouvrir="${esc(c.id)}">${esc(c.numero)}</button>${c.urgent?' <span class="cp-flag crit">Urgent</span>':''}`,esc(c.fournisseur),chip(c),String(c.lignes.length),R().euros(c.total),esc(frDT(c.miseAJour))]}
 function atraiter(body){
  const C=s.donnees.commandes,par=st=>C.filter(c=>c.statut===st);
  const props=R().propositions(s.donnees.articles,lots(),C,auj()),groupes=R().groupesProposition(props);
  const hors=R().receptionsHorsStock(C,lots());
  const bloc=(titre,liste,aide)=>liste.length?`<h3 class="cp-h3">${titre} <span class="cp-count">${liste.length}</span></h3>${aide?`<p class="cp-mut">${aide}</p>`:''}${table(['Commande','Fournisseur','État','Lignes','Total HT','Mise à jour'],liste.map(ligneCmd))}`:'';
  body.innerHTML=`<div class="cp-metrics">${[[par('a_valider').length,'à valider par le pharmacien'],[par('validee').length,'à transmettre au fournisseur'],[par('envoyee').length+par('partielle').length,'livraisons attendues'],[props.length,'produits sous le seuil']].map(([n,l])=>`<article class="management-metric"><strong>${n}</strong><span>${l}</span></article>`).join('')}</div>
   ${hors.length?`<p class="notice warn">${hors.length} lot(s) reçu(s) conforme(s) pas encore entré(s) dans le stock de la pharmacie. ${ctx.canWriteLots?.()?'<button type="button" class="primary" id="cp-integrer">Les entrer en stock</button>':'Un compte de la pharmacie rattaché à une équipe doit les entrer en stock.'}</p>`:''}
   ${bloc('À valider par le pharmacien',par('a_valider'),pharma()?'Relisez les lignes et validez : la commande engage la pharmacie.':'')}
   ${bloc('Validées, à transmettre',par('validee'))}
   ${bloc('Livraisons attendues',[...par('envoyee'),...par('partielle')],'Ouvrez la commande à l’arrivée du colis pour enregistrer la réception (lots, péremptions, conformité).')}
   ${bloc('Brouillons',par('brouillon'))}
   <h3 class="cp-h3">Propositions de réapprovisionnement <span class="cp-count">${props.length}</span></h3>
   <p class="cp-mut">Produits du livret dont le stock (lots non bloqués et non périmés) plus les quantités déjà commandées atteint le seuil minimum. Quantité proposée : jusqu’au stock maximum.</p>
   ${groupes.length?groupes.map((g,i)=>`<article class="cp-prop"><header><h4>${esc(g.fournisseur)}${g.stupefiants?' <span class="cp-flag stup">Bon stupéfiants</span>':''}</h4>${ecrit()?`<button type="button" class="secondary" data-cp-prop="${i}">Préparer cette commande</button>`:''}</header>${table(['Produit','Stock','Commandé en cours','Seuils min / max','Proposé'],g.lignes.map(p=>[esc(p.article.nom)+' '+flags(p.article),String(p.stock),String(p.enCours),p.article.stockMin+' / '+p.article.stockMax,'<strong>'+p.proposee+'</strong> × '+esc(p.article.unite)]))}</article>`).join(''):'<p class="cp-empty">Aucun produit sous le seuil minimum.</p>'}`;
  liens(body);
  body.querySelectorAll('[data-cp-prop]').forEach(b=>b.onclick=()=>{const g=groupes[Number(b.dataset.cpProp)];s.edition={fournisseur:g.fournisseur,lignes:g.lignes.map(p=>({articleId:p.article.id,quantite:p.proposee})),note:'Réapprovisionnement sur seuil minimum',urgent:false};dessiner()});
  $('#cp-integrer')?.addEventListener('click',()=>integrer(hors));
 }
 function integrer(hors){
  const L=lots();let n=0;
  for(const {commande:c,reception:r} of hors){const a=s.donnees.articles.find(x=>x.id===c.lignes[r.ligne].articleId);R().integrerAuStock(L,R().lotPourStock(c,r,a),'LOT-'+(crypto.randomUUID?.()||Date.now().toString(36)+n));n++}
  ctx.saveLots?.();toast(n+' lot(s) entré(s) dans le stock · enregistrement en cours');dessiner();
 }
 function liens(body){body.querySelectorAll('[data-cp-ouvrir]').forEach(b=>b.onclick=()=>{s.detail=s.donnees.commandes.find(c=>c.id===b.dataset.cpOuvrir);dessiner()})}

 /* ---------- Liste des commandes ---------- */
 function commandes(body){
  const f=s.filtre,C=s.donnees.commandes.filter(c=>f==='toutes'||(f==='en-cours'?R().EN_COURS.includes(c.statut):!R().EN_COURS.includes(c.statut)));
  body.innerHTML=`<div class="pr-filtres">${[['en-cours','En cours'],['closes','Reçues, soldées, annulées'],['toutes','Toutes']].map(([k,l])=>`<button type="button" class="pr-filtre ${f===k?'is-on':''}" data-cp-filtre="${k}">${l}</button>`).join('')}</div>
   ${table(['Commande','Fournisseur','État','Lignes','Total HT','Mise à jour'],C.map(ligneCmd))}<p class="cp-mut">Commandes en cours et commandes closes des 120 derniers jours.</p>`;
  body.querySelectorAll('[data-cp-filtre]').forEach(b=>b.onclick=()=>{s.filtre=b.dataset.cpFiltre;dessiner()});liens(body);
 }

 /* ---------- Préparation / modification d'une commande ---------- */
 function edition(body){
  const e=s.edition,A=s.donnees.articles.filter(a=>a.actif),fournisseurs=[...new Set(A.map(a=>a.fournisseur))].sort((a,b)=>a.localeCompare(b,'fr'));
  const art=id=>s.donnees.articles.find(a=>a.id===id);
  const lignes=e.lignes.map((l,i)=>{const a=art(l.articleId)||{};return [esc(a.nom||'?')+' '+flags(a),esc(a.code||''),`<input type="number" min="1" step="1" value="${esc(l.quantite)}" data-cp-q="${i}" aria-label="Quantité" class="cp-qte"> ${esc(a.unite||'')}`,R().euros(a.prixCentimes),R().euros((a.prixCentimes||0)*(Number(l.quantite)||0)),`<button type="button" class="textbutton" data-cp-suppr="${i}">Retirer</button>`]});
  const tot=e.lignes.reduce((n,l)=>n+(art(l.articleId)?.prixCentimes||0)*(Number(l.quantite)||0),0);
  const proposables=A.filter(a=>!e.fournisseur||a.fournisseur===e.fournisseur);
  body.innerHTML=`<h3 class="cp-h3">${e.id?'Modifier la commande '+esc(e.numero):'Nouvelle commande'}</h3>
   ${!A.length?'<p class="notice warn">Le livret des produits est vide : le pharmacien y ajoute d’abord les produits commandables (onglet Livret des produits).</p>':''}
   <div class="formgrid cp-form"><label>Fournisseur<input list="cp-fournisseurs" id="cp-fournisseur" value="${esc(e.fournisseur)}" maxlength="120" required></label><datalist id="cp-fournisseurs">${fournisseurs.map(f=>`<option value="${esc(f)}">`).join('')}</datalist>
   <label class="cp-check"><input type="checkbox" id="cp-urgent" ${e.urgent?'checked':''}> Commande urgente</label>
   <label class="wide">Note pour le pharmacien ou le fournisseur<textarea id="cp-note" maxlength="600">${esc(e.note)}</textarea></label></div>
   <h4>Lignes</h4>${table(['Produit','Code','Quantité','Prix unitaire HT','Montant HT',''],lignes)}
   <div class="cp-ajout"><label>Ajouter un produit du livret${e.fournisseur?' ('+esc(e.fournisseur)+')':''}<select id="cp-article"><option value="">Choisir…</option>${proposables.map(a=>`<option value="${esc(a.id)}">${esc(a.nom)}${a.stupefiant?' · stupéfiant':''}${e.fournisseur?'':' · '+esc(a.fournisseur)}</option>`).join('')}</select></label><label>Quantité<input type="number" id="cp-article-q" min="1" step="1" value="1" class="cp-qte"></label><button type="button" class="secondary" id="cp-ajouter">Ajouter</button></div>
   <p class="cp-total">Total HT : <strong>${R().euros(tot)}</strong></p>
   <p role="alert" class="management-error" id="cp-err"></p>
   <div class="cp-actions"><button type="button" class="primary" id="cp-enregistrer">${e.id?'Enregistrer les modifications':'Enregistrer le brouillon'}</button><button type="button" class="secondary" id="cp-annuler-ed">Abandonner</button></div>`;
  const lire=()=>{e.fournisseur=$('#cp-fournisseur').value.trim();e.urgent=$('#cp-urgent').checked;e.note=$('#cp-note').value;body.querySelectorAll('[data-cp-q]').forEach(i=>{e.lignes[Number(i.dataset.cpQ)].quantite=Number(i.value)})};
  $('#cp-fournisseur').onchange=()=>{lire();dessiner()};
  body.querySelectorAll('[data-cp-q]').forEach(i=>i.onchange=()=>{lire();dessiner()});
  body.querySelectorAll('[data-cp-suppr]').forEach(b=>b.onclick=()=>{lire();e.lignes.splice(Number(b.dataset.cpSuppr),1);dessiner()});
  $('#cp-ajouter').onclick=()=>{lire();const id=$('#cp-article').value,q=Number($('#cp-article-q').value);if(!id||!(q>0)){$('#cp-err').textContent='Choisissez un produit et une quantité.';return}const a=art(id);if(!e.fournisseur)e.fournisseur=a.fournisseur;const d=e.lignes.find(l=>l.articleId===id);if(d)d.quantite=Number(d.quantite)+q;else e.lignes.push({articleId:id,quantite:q});dessiner()};
  $('#cp-annuler-ed').onclick=()=>{s.edition=null;dessiner()};
  $('#cp-enregistrer').onclick=async ev=>{lire();ev.target.disabled=true;try{const r=await api(e.id?{action:'modifier',id:e.id,version:e.version,fournisseur:e.fournisseur,lignes:e.lignes,note:e.note,urgent:e.urgent}:{action:'creer',fournisseur:e.fournisseur,lignes:e.lignes,note:e.note,urgent:e.urgent});s.edition=null;s.detail={id:r.commande.id};await charger();s.detail=s.donnees.commandes.find(c=>c.id===r.commande.id)||r.commande;s.message='Commande '+r.commande.numero+' enregistrée en brouillon.';dessiner()}catch(err){$('#cp-err').textContent=err.message;ev.target.disabled=false}};
 }

 /* ---------- Détail d'une commande ---------- */
 function detail(body,c){
  const peut=a=>!refus(a,c),art=id=>s.donnees.articles.find(a=>a.id===id);
  const stup=c.lignes.some(l=>l.stupefiant);
  const lignes=c.lignes.map((l,i)=>[esc(l.nom)+' '+flags(l),esc(l.code),l.quantite+' × '+esc(l.unite),R().euros(l.prixCentimes),R().euros(l.prixCentimes*l.quantite),String(R().recuConforme(c,i)),String(['envoyee','partielle'].includes(c.statut)?R().reliquat(c,i):c.statut==='soldee'?'abandonné ('+R().reliquat(c,i)+')':'—')]);
  const rec=c.receptions.map(r=>[esc(frDT(r.at)),esc(r.nom||c.lignes[r.ligne]?.nom),esc(r.bonLivraison||''),String(r.quantite),String(r.conforme)+(r.litige?` <span class="cp-flag crit">litige ${r.litige}</span>`:''),esc(r.lot||'—'),esc(frD(r.peremption)||'—')+(r.peremptionCourte?' <span class="cp-flag warn">courte</span>':''),esc(r.motif||''),esc(r.par)+' · '+esc(R().PROFILS[r.profil]||r.profil)]);
  const ev=(c.evenements||[]).slice().reverse().map(e=>`<li><span class="cp-ev-date">${esc(frDT(e.at))}</span><strong>${esc(ACTIONS[e.action]||e.action)}</strong> par ${esc(e.par)} (${esc(R().PROFILS[e.profil]||e.profil)})${e.motif?' · '+esc(e.motif):''}<span class="cp-mut cp-hash" title="Empreinte SHA-256 du contenu à cette étape">${esc(e.hash.slice(0,12))}</span></li>`).join('');
  const act=[];
  if(peut('modifier'))act.push('<button type="button" class="secondary" data-cp-act="modifier">Modifier</button>');
  if(peut('soumettre')&&!pharma())act.push('<button type="button" class="primary" data-cp-act="soumettre">Soumettre au pharmacien</button>');
  if(peut('valider'))act.push('<button type="button" class="primary" data-cp-act="valider">Valider la commande</button>');
  if(peut('renvoyer'))act.push('<button type="button" class="secondary" data-cp-act="renvoyer">Renvoyer au préparateur</button>');
  if(peut('rouvrir'))act.push('<button type="button" class="secondary" data-cp-act="rouvrir">Rouvrir pour correction</button>');
  if(peut('envoyer'))act.push('<button type="button" class="primary" data-cp-act="envoyer">Transmettre au fournisseur</button>');
  if(peut('receptionner'))act.push('<button type="button" class="primary" data-cp-act="receptionner">Enregistrer une réception</button>');
  if(peut('solder'))act.push('<button type="button" class="secondary" data-cp-act="solder">Solder le reliquat</button>');
  if(peut('annuler'))act.push('<button type="button" class="textbutton cp-danger" data-cp-act="annuler">Annuler la commande</button>');
  const info=c.statut==='a_valider'&&!pharma()?'En attente de la validation du pharmacien.':['envoyee','partielle'].includes(c.statut)&&stup&&!pharma()?'Stupéfiants : la réception est enregistrée par le pharmacien.':'';
  body.innerHTML=`<p><button type="button" class="textbutton" id="cp-retour">← Retour</button></p>
   <div class="cp-dhead"><div><h3>${esc(c.numero)} ${chip(c)}${c.urgent?' <span class="cp-flag crit">Urgent</span>':''}${stup?' <span class="cp-flag stup">Bon stupéfiants'+(c.bonStupefiants?' n° '+esc(c.bonStupefiants):'')+'</span>':''}</h3>
   <p class="cp-mut">${esc(c.fournisseur)} · préparée par ${esc(c.creeParNom)} le ${esc(frDT(c.creeLe))}${c.validation?' · validée par '+esc(c.validation.par)+' le '+esc(frDT(c.validation.at)):''}${c.envoi?' · transmise ('+esc(R().MODES_ENVOI[c.envoi.mode]||c.envoi.mode)+(c.envoi.reference?', réf. '+esc(c.envoi.reference):'')+') le '+esc(frDT(c.envoi.at)):''}</p>
   ${c.note?`<p class="cp-note">${esc(c.note)}</p>`:''}${c.renvoi&&c.statut==='brouillon'?`<p class="notice warn">Renvoyée par le pharmacien : ${esc(c.renvoi.motif)}</p>`:''}</div>
   <button type="button" class="secondary" id="cp-imprimer">Imprimer le bon de commande</button></div>
   ${table(['Produit','Code','Commandé','Prix unitaire HT','Montant HT','Reçu conforme','Reste à livrer'],lignes)}
   <p class="cp-total">Total HT : <strong>${R().euros(c.total)}</strong></p>
   ${info?`<p class="notice">${esc(info)}</p>`:''}
   <div class="cp-actions">${act.join('')}</div><div id="cp-action"></div>
   ${rec.length?`<h4>Réceptions</h4>${table(['Date','Produit','Bon de livraison','Livré','Conforme','Lot','Péremption','Motif','Réceptionné par'],rec)}`:''}
   <h4>Étapes de la commande</h4><ol class="cp-ev">${ev||'<li>—</li>'}</ol>`;
  $('#cp-retour').onclick=()=>{s.detail=null;dessiner()};
  $('#cp-imprimer').onclick=()=>imprimer(c);
  body.querySelectorAll('[data-cp-act]').forEach(b=>b.onclick=()=>action(b.dataset.cpAct,c));
 }
 async function envoyer(corps,okMsg){
  const err=$('#cp-act-err');
  try{const r=await api(corps);let msg=okMsg(r);if(r.receptions?.length)await apresReception(r);s.detail={id:corps.id};await charger();s.detail=s.donnees.commandes.find(x=>x.id===corps.id)||r.commande;if(r.avertissements?.length)msg+=' '+r.avertissements.join(' ');s.message=msg;dessiner()}
  catch(e){if(err)err.textContent=e.message;else toast(e.message);if(e.status===409){await charger()}}
 }
 async function apresReception(r){
  const c=r.commande,L=lots();let n=0;
  if(!ctx.canWriteLots?.())return;
  for(const rec of c.receptions.filter(x=>r.receptions.includes(x.id)&&x.conforme>0)){const a=s.donnees.articles.find(x=>x.id===c.lignes[rec.ligne].articleId);R().integrerAuStock(L,R().lotPourStock(c,rec,a),'LOT-'+(crypto.randomUUID?.()||Date.now().toString(36)+n));n++}
  if(n)ctx.saveLots?.();
 }
 function action(a,c){
  const zone=$('#cp-action'),base={action:a,id:c.id,version:c.version};
  const motifForm=(titre,bouton,aide='')=>{zone.innerHTML=`<div class="cp-panel"><h4>${titre}</h4>${aide?`<p class="cp-mut">${aide}</p>`:''}<label>Motif (conservé dans l’historique)<textarea id="cp-motif" maxlength="400" required></textarea></label><p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">${bouton}</button></div>`;$('#cp-go').onclick=()=>envoyer({...base,motif:$('#cp-motif').value},()=>titre+' : fait.')};
  if(a==='modifier'){s.edition={id:c.id,numero:c.numero,version:c.version,fournisseur:c.fournisseur,lignes:c.lignes.map(l=>({articleId:l.articleId,quantite:l.quantite})),note:c.note||'',urgent:!!c.urgent};s.detail=null;dessiner();return}
  if(a==='soumettre')return envoyer(base,()=>'Commande '+c.numero+' soumise au pharmacien.');
  if(a==='valider'){
   const stup=c.lignes.some(l=>l.stupefiant);
   zone.innerHTML=`<div class="cp-panel"><h4>Valider la commande ${esc(c.numero)}</h4><p class="cp-mut">Vous engagez la pharmacie pour ${R().euros(c.total)} HT auprès de ${esc(c.fournisseur)}. Les lignes ne seront plus modifiables.</p>${stup?'<label>Numéro du bon de commande de stupéfiants signé<input id="cp-bon" maxlength="60" required></label>':''}<p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Je valide la commande</button></div>`;
   $('#cp-go').onclick=()=>envoyer({...base,bonStupefiants:$('#cp-bon')?.value||''},()=>'Commande '+c.numero+' validée.');return}
  if(a==='renvoyer')return motifForm('Renvoyer au préparateur','Renvoyer','Précisez la correction attendue.');
  if(a==='rouvrir')return motifForm('Rouvrir pour correction','Rouvrir','La commande repasse en brouillon et devra être validée à nouveau.');
  if(a==='solder')return motifForm('Solder le reliquat','Solder','Le reste à livrer est abandonné (rupture, produit remplacé…). La commande est close.');
  if(a==='annuler')return motifForm('Annuler la commande','Annuler la commande',['validee','envoyee'].includes(c.statut)?'Prévenez le fournisseur si la commande lui a déjà été transmise.':'');
  if(a==='envoyer'){
   zone.innerHTML=`<div class="cp-panel"><h4>Transmettre au fournisseur</h4><p class="cp-mut">Simulation : aucune transmission réelle tant que le raccordement au fournisseur (EDI, portail) n’est pas configuré. Imprimez le bon si vous l’envoyez vous-même.</p><div class="formgrid"><label>Mode<select id="cp-mode">${Object.entries(R().MODES_ENVOI).map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label>Référence (n° d’accusé, interlocuteur)<input id="cp-ref" maxlength="80"></label></div><p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Marquer comme transmise</button></div>`;
   $('#cp-go').onclick=()=>envoyer({...base,mode:$('#cp-mode').value,reference:$('#cp-ref').value},()=>'Commande '+c.numero+' transmise.');return}
  if(a==='receptionner'){
   const proches=R().ajouterJours(auj(),R().PEREMPTION_COURTE);
   const rows=c.lignes.map((l,i)=>({l,i,reste:R().reliquat(c,i)})).filter(x=>x.reste>0);
   zone.innerHTML=`<div class="cp-panel"><h4>Réception · ${esc(c.numero)}</h4><p class="cp-mut">Contrôlez le colis avec le bon de livraison : produit, quantité, lot, péremption, état, chaîne du froid. Les unités non conformes restent en litige et n’entrent pas en stock. Péremption avant le ${esc(frD(proches))} : acceptation motivée.</p>
    <label class="cp-bl">Numéro du bon de livraison<input id="cp-bl" maxlength="60" required></label>
    <div class="cp-rec">${rows.map(({l,i,reste})=>`<fieldset class="cp-rec-l" data-ligne="${i}"><legend>${esc(l.nom)} ${flags(l)} <span class="cp-mut">· reste ${reste} × ${esc(l.unite)}</span></legend>
     <label>Livré<input type="number" min="0" max="${reste}" step="1" value="${reste}" name="quantite" class="cp-qte"></label>
     <label>Dont conformes<input type="number" min="0" max="${reste}" step="1" value="${reste}" name="conforme" class="cp-qte"></label>
     <label>N° de lot<input name="lot" maxlength="40"></label><label>Péremption<input type="date" name="peremption" min="${esc(auj())}"></label>
     ${l.froid?'<label class="cp-check"><input type="checkbox" name="froidOk"> Chaîne du froid respectée (2 à 8 °C, indicateur conforme)</label>':''}
     <label class="cp-check"><input type="checkbox" name="peremptionCourteAcceptee"> Péremption courte acceptée</label>
     <label class="wide">Motif (litige ou péremption courte)<input name="motif" maxlength="300"></label></fieldset>`).join('')}</div>
    <p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Enregistrer la réception</button></div>`;
   $('#cp-go').onclick=()=>{const lignes=[...zone.querySelectorAll('.cp-rec-l')].map(f=>{const v=n=>f.querySelector(`[name="${n}"]`);return {ligne:Number(f.dataset.ligne),quantite:Number(v('quantite').value),conforme:Number(v('conforme').value),lot:v('lot').value,peremption:v('peremption').value,froidOk:!!v('froidOk')?.checked,peremptionCourteAcceptee:!!v('peremptionCourteAcceptee').checked,motif:v('motif').value}});
    envoyer({...base,bonLivraison:$('#cp-bl').value,lignes},r=>'Réception enregistrée : '+R().STATUTS[r.commande.statut].toLowerCase()+'.'+(ctx.canWriteLots?.()?' Les lots conformes sont entrés dans le stock.':''))};
   return}
 }
 function imprimer(c){
  const w=window.open('','_blank');if(!w){toast('Autorisez l’ouverture de la fenêtre d’impression');return}w.opener=null;
  const lignes=c.lignes.map(l=>`<tr><td>${esc(l.nom)}${l.stupefiant?' (stupéfiant)':''}${l.froid?' (2-8 °C)':''}</td><td>${esc(l.code)}</td><td>${esc(l.conditionnement)}</td><td>${l.quantite} ${esc(l.unite)}</td><td>${R().euros(l.prixCentimes)}</td><td>${R().euros(l.prixCentimes*l.quantite)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Bon de commande ${esc(c.numero)}</title><style>body{font:14px system-ui;margin:36px;color:#12404c}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #9aa;padding:8px;text-align:left}h1{font-size:20px}.s{margin-top:40px;display:flex;gap:60px}</style>
   <h1>Pharmacie à usage intérieur · Bon de commande ${esc(c.numero)}</h1><p>Clinique du Trocadéro · ${c.urgent?'<b>URGENT</b> · ':''}${esc(R().STATUTS[c.statut])}</p><p><b>Fournisseur :</b> ${esc(c.fournisseur)}${c.bonStupefiants?'<br><b>Bon de commande de stupéfiants n° :</b> '+esc(c.bonStupefiants):''}</p>
   <table><thead><tr><th>Produit</th><th>Code</th><th>Conditionnement</th><th>Quantité</th><th>Prix unitaire HT</th><th>Montant HT</th></tr></thead><tbody>${lignes}</tbody></table><p><b>Total HT : ${R().euros(c.total)}</b></p>${c.note?'<p>'+esc(c.note)+'</p>':''}
   <div class="s"><p>Préparée par ${esc(c.creeParNom)}<br>le ${esc(frDT(c.creeLe))}</p><p>${c.validation?'Validée par le pharmacien '+esc(c.validation.par)+'<br>le '+esc(frDT(c.validation.at)):'<b>Non validée par le pharmacien : ne pas transmettre.</b>'}</p></div></html>`);
  w.document.close();w.print();
 }

 /* ---------- Livret des produits ---------- */
 function livret(body){
  const A=s.donnees.articles,peut=!refus('articles');
  const rows=A.map(a=>[esc(a.nom)+' '+flags(a)+(a.actif?'':' <span class="cp-flag">retiré</span>'),esc(a.code),esc(a.fournisseur),esc([a.conditionnement,a.unite].filter(Boolean).join(' · ')),R().euros(a.prixCentimes),String(R().stockArticle(a,lots(),auj())),a.stockMin+' / '+a.stockMax,peut?`<button type="button" class="textbutton" data-cp-art="${esc(a.id)}">Modifier</button>`:'']);
  body.innerHTML=`<p class="cp-mut">Produits que la pharmacie commande, avec leur fournisseur habituel, leur prix et les seuils qui déclenchent les propositions de réapprovisionnement. ${peut?'Chaque modification est conservée avec son motif.':'Le livret est tenu par le pharmacien.'}</p>
   ${peut?'<button type="button" class="primary" id="cp-art-new">Ajouter un produit</button>':''}<div id="cp-art-form"></div>
   ${table(['Produit','Code','Fournisseur','Conditionnement','Prix HT','Stock','Min / max',''],rows)}`;
  $('#cp-art-new')?.addEventListener('click',()=>formArticle(null));
  body.querySelectorAll('[data-cp-art]').forEach(b=>b.onclick=()=>formArticle(A.find(a=>a.id===b.dataset.cpArt)));
  if(s.article!==null&&s.article!==undefined)formArticle(s.article||null);
 }
 function formArticle(a){
  const z=$('#cp-art-form'),v=a||{unite:'boîte',stockMin:2,stockMax:10,actif:true};
  const f=(n,l,t='text',val='',attrs='')=>`<label>${l}<input name="${n}" type="${t}" value="${esc(val??'')}" ${attrs}></label>`;
  z.innerHTML=`<form class="cp-panel" id="cp-art"><h4>${a?'Modifier '+esc(a.nom):'Nouveau produit'}</h4><div class="formgrid">
   ${f('nom','Désignation (spécialité, dosage, forme)','text',v.nom,'required maxlength="160" data-medicament autocomplete="off"')}${f('code','Code CIP 13, UCD ou CIS','text',v.code,'maxlength="20" inputmode="numeric"')}
   ${f('fournisseur','Fournisseur habituel','text',v.fournisseur,'required maxlength="120"')}${f('conditionnement','Conditionnement','text',v.conditionnement,'maxlength="80" placeholder="Boîte de 10 ampoules"')}
   ${f('unite','Unité de commande','text',v.unite,'maxlength="30"')}${f('prix','Prix unitaire HT (€)','text',a?String((v.prixCentimes||0)/100).replace('.',','):'','required inputmode="decimal"')}
   ${f('stockMin','Stock minimum (seuil de commande)','number',v.stockMin,'min="0" step="1" required')}${f('stockMax','Stock maximum','number',v.stockMax,'min="1" step="1" required')}
   <label class="cp-check"><input type="checkbox" name="stupefiant" ${v.stupefiant?'checked':''}> Stupéfiant</label><label class="cp-check"><input type="checkbox" name="froid" ${v.froid?'checked':''}> Thermosensible (2 à 8 °C)</label>
   <label class="cp-check"><input type="checkbox" name="mds" ${v.mds?'checked':''}> Médicament dérivé du sang</label><label class="cp-check"><input type="checkbox" name="actif" ${v.actif!==false?'checked':''}> Commandable</label>
   ${a?'<label class="wide">Motif de la modification<input name="motif" required maxlength="400"></label>':''}</div>
   <p role="alert" class="management-error" id="cp-art-err"></p><div class="cp-actions"><button class="primary">Enregistrer</button><button type="button" class="secondary" id="cp-art-close">Fermer</button></div></form>`;
  s.article=a||'';$('#cp-art-close').onclick=()=>{s.article=null;z.innerHTML=''};
  $('#cp-art').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),o=Object.fromEntries(fd);for(const k of ['stupefiant','froid','mds','actif'])o[k]=fd.has(k);
   try{await api({action:'article',id:a?.id,version:a?.version,article:o,motif:o.motif||''});s.article=null;await charger();s.message='Produit « '+o.nom+' » enregistré dans le livret.';dessiner()}catch(err){$('#cp-art-err').textContent=err.message}};
  z.scrollIntoView({block:'nearest'});
 }
 return {render};
};
})(typeof window!=='undefined'?window:globalThis);

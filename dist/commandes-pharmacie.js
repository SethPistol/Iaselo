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
const ACTIONS={creation:'Création',modification:'Modification',soumission:'Soumise au pharmacien',validation:'Validée par le pharmacien',renvoi:'Renvoyée au préparateur',reouverture:'Rouverte',transmission:'Transmise au fournisseur',reception:'Réception',solde:'Reliquat soldé',annulation:'Annulée',liquidation:'Facture liquidée'};
const TON={brouillon:'',a_valider:'warn',validee:'acc',envoyee:'acc',partielle:'warn',recue:'ok',soldee:'ok',annulee:'crit'};
async function api(body,query){
 const r=await fetch('/api/workspace/pharmacie'+(query&&!body?'?'+query:''),{cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json'}});
 const j=await r.json().catch(()=>({error:'Réponse du serveur illisible.'}));if(!r.ok){const e=Error(j.error||'Service indisponible.');e.status=r.status;e.data=j;throw e}return j;
}
root.createCommandesPharmacie=function(ctx){
 const {$,esc,toast}=ctx;
 let s={onglet:'suivi',donnees:null,erreur:'',detail:null,edition:null,article:null,filtre:'en-cours',message:'',demande:null,nouvelleDemande:null};
 const P=()=>s.donnees?.profil,pharma=()=>P()==='pharmacien',ecrit=()=>['pharmacien','preparateur','bloc'].includes(P()),bloc=()=>P()==='bloc',demandeur=()=>R().estService(P());
 const refus=(a,c)=>R().refus(a,P(),c,s.donnees?.moi);
 const service=()=>P()==='service',refusD=(a,d)=>R().refusDemande(a,P(),d,s.donnees?.moi);
 const TON_D={demandee:'warn',en_preparation:'acc',delivree:'acc',recue:'ok',refusee:'crit',annulee:'crit'};
 const chipD=d=>`<span class="cp-chip ${TON_D[d.statut]||''}">${esc(R().STATUTS_DEMANDE[d.statut]||d.statut)}</span>`;
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

 async function charger(){s.erreur='';try{const premier=!s.donnees;s.donnees=await api();if(premier&&service())s.onglet='demandes';if(s.detail)s.detail=s.donnees.commandes.find(c=>c.id===s.detail.id)||s.detail;if(s.demande)s.demande=s.donnees.demandes.find(d=>d.id===s.demande.id)||s.demande}catch(e){s.erreur=e.message;if(!s.donnees)s.donnees=null}dessiner()}
 function render(){
  $('#title').textContent='Commandes pharmacie';$('#stats').hidden=true;$('#new').hidden=true;document.body.classList.remove('j-home');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='commandesPharmacie'));
  $('#workspace').innerHTML='<section class="panel"><div class="content cp-wrap" id="cp-host"><p class="cp-mut">Chargement des commandes…</p></div></section>';
  s.onglet=service()?'demandes':'suivi';s.detail=null;s.edition=null;s.article=null;s.demande=null;s.nouvelleDemande=null;charger();
 }
 /* Menu de gauche, sur le modèle de l'écran « Gestion des commandes » du bloc (Dedalus). */
 const SECTIONS=()=>{
  const cmd=!service()||s.donnees.voitCommandes,hors=bloc()?['preparation','liquidation','inventaire','parametrage']:[];
  const L=[
   ['Demande interne',[['demandes','Demandes des services']]],
   ...(cmd?[['Commande et réception',[['nouvelles','Nouvelles commandes'],['preparation','Préparation de commande'],['suivi','Suivi des commandes'],['envois','Suivi des envois de commandes'],['parArticle','Suivi par article'],['cadencier','Cadencier'],['analyse','Analyse'],['achats','Analyse des achats']]],
    ['Liquidation',[['liquidation','Liquidation des factures']]],['Stock',[['stock','Stock']]],['Inventaire',[['inventaire','Inventaire']]],
    ['Configurateur',[['livret','Livret des produits']]],['Paramétrage',[['parametrage','UF, adresses, fournisseurs']]],['Exploitation',[['exploitation','Exports']]]]:[])];
  return L.map(([x,it])=>[x,it.filter(([k])=>!hors.includes(k))]).filter(([,it])=>it.length);
 };
 function dessiner(){
  const host=$('#cp-host');if(!host)return;
  if(!s.donnees){host.innerHTML=`<p class="notice warn">${esc(s.erreur||'Commandes disponibles sur le serveur de la clinique.')}</p>`;return}
  $('#title').textContent=demandeur()&&!s.donnees.voitCommandes?'Demandes à la pharmacie':'Gestion des commandes';
  const sections=SECTIONS(),actif=!s.detail&&!s.edition&&!s.demande&&!s.nouvelleDemande?s.onglet:(s.edition?'nouvelles':s.demande||s.nouvelleDemande?'demandes':'suivi');
  const tete=bloc()?`<div class="cp-head"><div><p class="cp-mut">Cadre de bloc · vous commandez le matériel des UF du bloc (${R().UF_BLOC.join(', ')}) : vous préparez, soumettez au pharmacien qui valide, transmettez et réceptionnez. Vous faites aussi les demandes du service à la pharmacie.</p></div><button type="button" class="primary" id="cp-nouvelle-demande">Nouvelle demande à la pharmacie</button></div>`:`<div class="cp-head"><div><p class="cp-mut">${service()?'Demandez à la pharmacie les produits du livret pour votre service ; elle les délivre par lot, vous accusez réception.'+(s.donnees.medecin?' Les stupéfiants sont demandés par un médecin.':''):esc(R().PROFILS[P()]||'Lecture seule (administrateur)')+' · '}${service()?'':P()==='preparateur'?'vous préparez, soumettez, transmettez et réceptionnez ; le pharmacien valide.':P()==='pharmacien'?'vous validez les commandes et tenez le livret ; le préparateur prépare et réceptionne.':'les commandes sont passées par la pharmacie.'}</p></div>${service()?'<button type="button" class="primary" id="cp-nouvelle-demande">Nouvelle demande</button>':''}</div>`;
  host.innerHTML=`${tete}<div class="cp-shell"><nav class="cp-nav" aria-label="Gestion des commandes">${sections.map(([t,items])=>`<div class="cp-nav-sec"><p class="cp-nav-t">${esc(t)}</p>${items.map(([k,l])=>`<button type="button" data-cp-onglet="${k}" class="${actif===k?'is-on':''}" aria-current="${actif===k?'page':'false'}">${esc(l)}</button>`).join('')}</div>`).join('')}</nav>
   <div class="cp-main">${s.erreur?`<p class="notice warn">${esc(s.erreur)}</p>`:''}${s.message?`<p class="notice cp-ok">${esc(s.message)}</p>`:''}<div id="cp-body"></div></div></div>`;
  s.message='';
  host.querySelectorAll('[data-cp-onglet]').forEach(b=>b.onclick=()=>{const k=b.dataset.cpOnglet;s.detail=null;s.edition=null;s.article=null;s.demande=null;s.nouvelleDemande=null;s.selection=new Set();
   if(k==='nouvelles'&&ecrit()){s.onglet='suivi';s.edition={fournisseur:'',lignes:[],note:'',urgent:false,...R().entete({},P())};dessiner();return}s.onglet=k;dessiner();charger()});
  $('#cp-nouvelle-demande')?.addEventListener('click',()=>{s.nouvelleDemande={service:s.donnees.serviceParDefaut||'bloc',lignes:[],note:'',urgent:false};s.demande=null;dessiner()});
  const body=$('#cp-body');
  if(s.nouvelleDemande)return formDemande(body);
  if(s.demande)return detailDemande(body,s.demande);
  if(s.edition)return edition(body);
  if(s.detail)return detail(body,s.detail);
  const vues={demandes,preparation,suivi,nouvelles:suivi,envois,parArticle,cadencier:cadencierV,analyse:analyseV,achats,liquidation,stock:stockV,inventaire,livret,parametrage,exploitation};
  (vues[s.onglet]||suivi)(body);
 }

 /* ---------- Suivi des commandes : filtres, barre d'outils, liste ---------- */
 const F0=()=>({du:'',au:'',valideDu:'',valideAu:'',type:'',fournisseur:'',numero:'',adresse:'',ufCommande:'',ufGestion:'',etat:'C, V, E, P',supprimees:false});
 s.filtres=F0();s.tri={cle:'du',sens:-1};s.selection=new Set();
 function suivi(body){
  const f=s.filtres,U=R().UF,opt=(o,v)=>'<option value="">—</option>'+Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(k===l?l:k+' · '+l)}</option>`).join('');
  const four=[...new Set([...s.donnees.articles.map(a=>a.fournisseur),...s.donnees.commandes.map(c=>c.fournisseur)])].sort((a,b)=>a.localeCompare(b,'fr'));
  const liste=R().trier(R().filtrer(s.donnees.commandes,f),s.tri.cle,s.tri.sens);
  const hors=R().receptionsHorsStock(s.donnees.commandes,lots()),sm=R().sortiesHorsStock(s.donnees.demandes||[],lots());
  const col=(k,l)=>`<th scope="col"><button type="button" class="cp-tri ${s.tri.cle===k?'is-on':''}" data-cp-tri="${k}">${s.tri.cle===k?(s.tri.sens>0?'▲':'▼'):'◆'} ${l}</button></th>`;
  const outil=(id,l,icone,actif=true)=>`<button type="button" class="cp-outil" data-cp-outil="${id}" title="${esc(l)}" aria-label="${esc(l)}" ${actif?'':'disabled'}>${icone}<span>${esc(l)}</span></button>`;
  const ic=p=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  body.innerHTML=`${hors.length?`<p class="notice warn">${hors.length} lot(s) reçu(s) pas encore entré(s) en stock. ${ctx.canWriteLots?.()?'<button type="button" class="primary" id="cp-integrer">Les entrer en stock</button>':''}</p>`:''}${sm.length?`<p class="notice warn">${sm.length} délivrance(s) pas encore déduite(s) du stock. ${ctx.canWriteLots?.()?'<button type="button" class="primary" id="cp-sorties">Les déduire du stock</button>':''}</p>`:''}
   <form class="cp-filtres" id="cp-filtres">
    <label>Commande du<input type="date" name="du" value="${esc(f.du)}"></label><label>au<input type="date" name="au" value="${esc(f.au)}"></label>
    <label>Adresse de livraison<select name="adresse">${opt(R().ADRESSES,f.adresse)}</select></label>
    <label>Validée entre le<input type="date" name="valideDu" value="${esc(f.valideDu)}"></label><label>et le<input type="date" name="valideAu" value="${esc(f.valideAu)}"></label>
    <label>UF de commande<select name="ufCommande">${opt(U,f.ufCommande)}</select></label>
    <label>Type de commande<select name="type">${opt(R().TYPES,f.type)}</select></label>
    <label>Fournisseur<input name="fournisseur" list="cp-four" value="${esc(f.fournisseur)}" placeholder="Nom ou code"></label><datalist id="cp-four">${four.map(x=>`<option value="${esc(x)}">${esc(R().codeFournisseur(x))}</option>`).join('')}</datalist>
    <label>UF de gestion<select name="ufGestion">${opt(U,f.ufGestion)}</select></label>
    <label>N° commande<input name="numero" value="${esc(f.numero)}"></label>
    <label>État<input name="etat" value="${esc(f.etat)}" title="C en cours de saisie · V validée · E envoyée · P reçue en partie · R reçue · S supprimée"></label>
    <label class="cp-check"><input type="checkbox" name="supprimees" ${f.supprimees?'checked':''}> Afficher les commandes supprimées</label>
    <div class="cp-filtres-b"><button class="primary" type="submit">Rechercher</button><button class="secondary" type="button" id="cp-raz">Effacer</button></div>
    <p class="cp-mut cp-legende">État : C en cours de saisie · V validée · E envoyée · P reçue en partie · R reçue · S supprimée</p>
   </form>
   <div class="cp-barre"><div class="cp-outils">${outil('nouveau','Nouveau',ic('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>'),ecrit())}${outil('ouvrir','Ouvrir',ic('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'))}${outil('supprimer','Supprimer',ic('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),ecrit())}${outil('valider','Valider',ic('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),pharma())}
    ${outil('soumettre','Soumettre au pharmacien',ic('<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7"/>'),ecrit())}${outil('renvoyer','Renvoyer au préparateur',ic('<path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2l2-7a2 2 0 0 1 2-1h10"/>'),pharma())}${outil('envoyer','Envoyer au fournisseur',ic('<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>'),ecrit())}
    ${outil('receptionner','Réception',ic('<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'),ecrit())}${outil('imprimer','Imprimer',ic('<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>'))}${outil('apercu','Aperçu',ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'))}${outil('actualiser','Actualiser',ic('<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>'))}</div>
    <p class="cp-barre-t">Liste des commandes <span class="cp-count">${liste.length}</span></p></div>
   <div class="management-scroll cp-liste"><table class="management-table cp-table cp-grille"><thead><tr class="cp-groupes"><th colspan="5"></th><th colspan="2" scope="colgroup">Fournisseur</th><th colspan="3" scope="colgroup">Dates</th><th></th></tr><tr><th scope="col"><input type="checkbox" id="cp-tout" aria-label="Tout sélectionner"></th>${col('ufGestion','UFg')}${col('numero','N°')}${col('type','T')}${col('etat','État')}${col('code','Code')}${col('fournisseur','Nom fournisseur')}${col('du','Du')}${col('validee','Validée le')}${col('prevue','Prévue')}${col('objet','Objet')}</tr></thead>
   <tbody>${liste.map(c=>`<tr class="${s.selection.has(c.id)?'is-sel':''} ${c.statut==='annulee'?'is-off':''}" data-cp-ligne="${esc(c.id)}"><td><input type="checkbox" data-cp-sel="${esc(c.id)}" ${s.selection.has(c.id)?'checked':''} aria-label="Sélectionner ${esc(c.numero)}"></td><td>${esc(c.ufGestion||'PHARMA')}</td><td><button type="button" class="textbutton cp-num" data-cp-ouvrir="${esc(c.id)}">${esc(c.numero)}</button></td><td title="${esc(R().TYPES[c.type||'N'])}">${esc(c.type||'N')}</td><td>${chip(c)}</td><td>${esc(R().codeFournisseur(c.fournisseur))}</td><td>${esc(c.fournisseur)}</td><td>${esc(frD(String(c.creeLe).slice(0,10)))}</td><td>${esc(c.validation?frD(c.validation.at.slice(0,10)):'')}</td><td>${esc(frD(c.datePrevue||''))}</td><td>${esc(c.objet||c.note||'')}</td></tr>`).join('')||'<tr><td colspan="11" class="cp-mut">Aucune commande ne correspond aux critères.</td></tr>'}</tbody></table></div>`;
  const form=$('#cp-filtres');
  form.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form));s.filtres={...F0(),...v,supprimees:form.supprimees.checked};
   if(s.filtres.du&&s.filtres.du<new Date(Date.now()-120*864e5).toISOString().slice(0,10)){try{s.donnees=await api(null,'du='+s.filtres.du)}catch(err){s.erreur=err.message}}dessiner()};
  $('#cp-raz').onclick=()=>{s.filtres=F0();dessiner()};
  body.querySelectorAll('[data-cp-tri]').forEach(b=>b.onclick=()=>{const k=b.dataset.cpTri;s.tri=s.tri.cle===k?{cle:k,sens:-s.tri.sens}:{cle:k,sens:1};dessiner()});
  body.querySelectorAll('[data-cp-sel]').forEach(i=>i.onchange=()=>{i.checked?s.selection.add(i.dataset.cpSel):s.selection.delete(i.dataset.cpSel);i.closest('tr').classList.toggle('is-sel',i.checked)});
  $('#cp-tout').onchange=e=>{liste.forEach(c=>e.target.checked?s.selection.add(c.id):s.selection.delete(c.id));dessiner()};
  body.querySelectorAll('[data-cp-ligne]').forEach(tr=>tr.ondblclick=()=>{s.detail=s.donnees.commandes.find(c=>c.id===tr.dataset.cpLigne);dessiner()});
  liens(body);
  $('#cp-integrer')?.addEventListener('click',()=>integrer(hors));
  $('#cp-sorties')?.addEventListener('click',()=>{const L=lots();let n=0;for(const d of sm)n+=R().appliquerSorties(L,d.delivrance.id,d.delivrance.lignes);ctx.saveLots?.();toast(n+' sortie(s) de stock enregistrée(s)');dessiner()});
  body.querySelectorAll('[data-cp-outil]').forEach(b=>b.onclick=()=>outilListe(b.dataset.cpOutil));
 }
 function outilListe(o){
  const sel=s.donnees.commandes.filter(c=>s.selection.has(c.id));
  if(o==='nouveau'){s.edition={fournisseur:'',lignes:[],note:'',urgent:false,...R().entete({ufGestion:s.filtres.ufGestion},P())};dessiner();return}
  if(o==='actualiser'){charger();return}
  if(o==='imprimer'||o==='apercu'){if(!sel.length){toast('Cochez une ou plusieurs commandes');return}if(o==='apercu'&&sel.length===1){s.detail=sel[0];dessiner();return}imprimer(sel);return}
  if(sel.length!==1){toast('Cochez une seule commande');return}
  const c=sel[0],act={ouvrir:null,supprimer:'annuler',valider:'valider',soumettre:'soumettre',renvoyer:'renvoyer',envoyer:'envoyer',receptionner:'receptionner'}[o];
  if(act){const r=refus(act,c);if(r){toast(r);return}}
  s.detail=c;dessiner();if(act)action(act,c);
 }

 /* ---------- Préparation de commande (propositions de réapprovisionnement) ---------- */
 function preparation(body){
  const C=s.donnees.commandes,par=st=>C.filter(c=>c.statut===st);
  const props=R().propositions(s.donnees.articles,lots(),C,auj()),groupes=R().groupesProposition(props);
  const D=s.donnees.demandes||[],dAtraiter=D.filter(d=>['demandee','en_preparation'].includes(d.statut));
  body.innerHTML=`<div class="cp-metrics">${[[dAtraiter.length,'demandes internes à délivrer'],[par('a_valider').length,'à valider par le pharmacien'],[par('validee').length,'validées, à envoyer'],[par('envoyee').length+par('partielle').length,'livraisons attendues'],[props.length,'produits sous le seuil']].map(([n,l])=>`<article class="management-metric"><strong>${n}</strong><span>${l}</span></article>`).join('')}</div>
   <h3 class="cp-h3">Propositions de réapprovisionnement <span class="cp-count">${props.length}</span></h3>
   <p class="cp-mut">Produits du livret dont le stock (lots non bloqués et non périmés) plus les quantités déjà commandées atteint le seuil minimum. Quantité proposée : jusqu’au stock maximum. Une commande est préparée par fournisseur.</p>
   ${groupes.length?groupes.map((g,i)=>`<article class="cp-prop"><header><h4>${esc(g.fournisseur)} <span class="cp-mut">${esc(R().codeFournisseur(g.fournisseur))}</span>${g.stupefiants?' <span class="cp-flag stup">Bon stupéfiants</span>':''}</h4>${ecrit()?`<button type="button" class="secondary" data-cp-prop="${i}">Préparer cette commande</button>`:''}</header>${table(['Produit','Stock','Commandé en cours','Seuils min / max','Proposé'],g.lignes.map(p=>[esc(p.article.nom)+' '+flags(p.article),String(p.stock),String(p.enCours),p.article.stockMin+' / '+p.article.stockMax,'<strong>'+p.proposee+'</strong> × '+esc(p.article.unite)]))}</article>`).join(''):'<p class="cp-empty">Aucun produit sous le seuil minimum.</p>'}`;
  body.querySelectorAll('[data-cp-prop]').forEach(b=>b.onclick=()=>{const g=groupes[Number(b.dataset.cpProp)];s.edition={fournisseur:g.fournisseur,lignes:g.lignes.map(p=>({articleId:p.article.id,quantite:p.proposee})),note:'',urgent:false,...R().entete({}),objet:'Réapprovisionnement sur seuil minimum'};dessiner()});
 }
 /* ---------- Suivi des envois ---------- */
 function envois(body){
  const C=s.donnees.commandes.filter(c=>c.envoi).sort((a,b)=>String(b.envoi.at).localeCompare(String(a.envoi.at)));
  body.innerHTML=`<p class="cp-mut">Commandes envoyées aux fournisseurs : mode, référence (accusé), date, et délai jusqu’à la première livraison. Simulation : aucun envoi réel tant que le raccordement EDI n’est pas configuré.</p>${table(['N°','Fournisseur','Envoyée le','Par','Mode','Référence','État','Première livraison'],C.map(c=>[`<button type="button" class="textbutton cp-num" data-cp-ouvrir="${esc(c.id)}">${esc(c.numero)}</button>`,esc(c.fournisseur),esc(frDT(c.envoi.at)),esc(c.envoi.par),esc(R().MODES_ENVOI[c.envoi.mode]||c.envoi.mode),esc(c.envoi.reference||''),chip(c),c.receptions[0]?esc(frDT(c.receptions[0].at))+' ('+Math.max(0,Math.round((Date.parse(c.receptions[0].at)-Date.parse(c.envoi.at))/864e5))+' j)':'<span class="cp-flag warn">en attente</span>']))}`;
  liens(body);
 }
 /* ---------- Suivi par article ---------- */
 function parArticle(body){
  const A=s.donnees.articles;s.articleSuivi??=A[0]?.id;const a=A.find(x=>x.id===s.articleSuivi);
  const rows=a?R().suiviArticle(a.id,s.donnees.commandes):[];
  body.innerHTML=`<label class="cp-bl">Article<select id="cp-art-suivi">${A.map(x=>`<option value="${esc(x.id)}" ${x.id===s.articleSuivi?'selected':''}>${esc(x.nom)}</option>`).join('')}</select></label>
   ${a?`<div class="cp-metrics">${[[R().stockArticle(a,lots(),auj()),'en stock'],[R().enCoursArticle(a,s.donnees.commandes),'commandé non livré'],[a.stockMin+' / '+a.stockMax,'seuils min / max'],[R().euros(a.prixCentimes),'prix unitaire HT']].map(([n,l])=>`<article class="management-metric"><strong>${esc(n)}</strong><span>${l}</span></article>`).join('')}</div>
   ${table(['N°','Du','Fournisseur','État','Commandé','Reçu conforme','Reliquat','Prix HT'],rows.map(r=>[`<button type="button" class="textbutton cp-num" data-cp-ouvrir="${esc(r.commande.id)}">${esc(r.commande.numero)}</button>`,esc(frD(String(r.commande.creeLe).slice(0,10))),esc(r.commande.fournisseur),chip(r.commande),String(r.quantite),String(r.recu),String(r.reliquat),R().euros(r.prix)]))}`:'<p class="cp-empty">Livret vide.</p>'}`;
  $('#cp-art-suivi')?.addEventListener('change',e=>{s.articleSuivi=e.target.value;dessiner()});liens(body);
 }
 /* ---------- Cadencier ---------- */
 function cadencierV(body){
  const k=R().cadencier(s.donnees.articles,s.donnees.commandes,auj()),m=x=>new Date(x+'-15').toLocaleDateString('fr-FR',{month:'short',year:'2-digit'});
  body.innerHTML=`<p class="cp-mut">Quantités commandées par article et par mois sur les 12 derniers mois (commandes supprimées exclues). Utile pour ajuster les seuils et les quantités.</p>${table(['Article',...k.mois.map(m),'Total','Moyenne / mois'],k.lignes.map(l=>[esc(l.article.nom),...k.mois.map(x=>l.parMois[x]?'<strong>'+l.parMois[x]+'</strong>':'<span class="cp-mut">·</span>'),String(l.total),String(l.moyenne)]),'cp-cad')}`;
 }
 /* ---------- Analyse ---------- */
 function analyseV(body){
  const a=R().analyse(s.donnees.commandes),t=(titre,rows)=>`<h3 class="cp-h3">${titre}</h3>${table(['','Commandes','Montant commandé HT','Montant reçu HT'],rows.map(([k,v])=>[esc(k),String(v.n),R().euros(v.montant),R().euros(v.recu)]))}`;
  body.innerHTML=`<div class="cp-metrics">${[[s.donnees.commandes.filter(c=>c.statut!=='annulee').length,'commandes'],[a.delaiMoyenJours===null?'—':a.delaiMoyenJours+' j','délai moyen envoi → livraison'],[a.litiges,'lignes en litige à la réception']].map(([n,l])=>`<article class="management-metric"><strong>${esc(n)}</strong><span>${l}</span></article>`).join('')}</div>${t('Par état',a.parEtat)}${t('Par UF de gestion',a.parUf)}`;
 }
 function achats(body){
  const a=R().analyse(s.donnees.commandes),t=(titre,rows)=>`<h3 class="cp-h3">${titre}</h3>${table(['','Commandes','Montant commandé HT','Montant reçu HT'],rows.map(([k,v])=>[esc(k),String(v.n),R().euros(v.montant),R().euros(v.recu)]))}`;
  body.innerHTML=`<p class="cp-mut">Montants hors taxes, commandes supprimées exclues, sur la période affichée (120 jours, ou depuis la date « Commande du » recherchée).</p>${t('Par fournisseur',a.parFournisseur)}${t('Par mois',a.parMois)}`;
 }
 /* ---------- Liquidation ---------- */
 function liquidation(body){
  const C=s.donnees.commandes.filter(c=>['partielle','recue','soldee'].includes(c.statut));
  body.innerHTML=`<p class="cp-mut">Rapprochement de la facture du fournisseur avec les quantités reçues conformes. Un écart exige un motif ; la liquidation est faite par le pharmacien.</p>${table(['N°','Fournisseur','État','Reçu conforme HT','Facture','Montant facturé','Écart',''],C.map(c=>{const l=c.liquidation;return [`<button type="button" class="textbutton cp-num" data-cp-ouvrir="${esc(c.id)}">${esc(c.numero)}</button>`,esc(c.fournisseur),chip(c),R().euros(R().montantRecu(c)),l?esc(l.facture)+' du '+esc(frD(l.dateFacture)):'<span class="cp-flag warn">à liquider</span>',l?R().euros(l.montantCentimes):'',l?(l.ecartCentimes?'<span class="cp-flag crit">'+R().euros(l.ecartCentimes)+'</span>':'0'):'',!l&&!refus('liquider',c)?`<button type="button" class="secondary" data-cp-liq="${esc(c.id)}">Liquider</button>`:'']}))}`;
  liens(body);body.querySelectorAll('[data-cp-liq]').forEach(b=>b.onclick=()=>{const c=s.donnees.commandes.find(x=>x.id===b.dataset.cpLiq);s.detail=c;dessiner();action('liquider',c)});
 }
 /* ---------- Stock et inventaire ---------- */
 function stockV(body){
  const L=lots().filter(l=>(Number(l.quantity)||0)>0).sort((a,b)=>String(a.drug).localeCompare(String(b.drug),'fr')||String(a.expiry).localeCompare(String(b.expiry)));
  const prix=l=>s.donnees.articles.find(a=>a.id===l.articleId||R().fold(a.nom)===R().fold(l.drug))?.prixCentimes||0;
  body.innerHTML=`<div class="cp-metrics">${[[L.length,'lots en stock'],[L.filter(l=>l.expiry&&l.expiry<R().ajouterJours(auj(),90)).length,'lots périmant sous 90 jours'],[R().euros(L.reduce((n,l)=>n+prix(l)*(Number(l.quantity)||0),0)),'valeur du stock HT']].map(([n,l])=>`<article class="management-metric"><strong>${esc(n)}</strong><span>${l}</span></article>`).join('')}</div>
   ${table(['Produit','Lot','Péremption','Quantité','Valeur HT','État'],L.map(l=>[esc(l.drug),esc(l.batch),esc(frD(l.expiry))+(l.expiry&&l.expiry<R().ajouterJours(auj(),90)?' <span class="cp-flag warn">bientôt</span>':''),esc(l.quantity)+' '+esc(l.unit||''),R().euros(prix(l)*(Number(l.quantity)||0)),l.blocked?'<span class="cp-flag crit">bloqué</span>':l.expiry<auj()?'<span class="cp-flag crit">périmé</span>':'disponible']))}
   <p class="cp-mut">Réceptions et blocages de lots : Circuit du médicament › Stocks.</p>`;
 }
 function inventaire(body){
  const L=lots().slice().sort((a,b)=>String(a.drug).localeCompare(String(b.drug),'fr')),peut=ctx.canWriteLots?.()&&ecrit();
  body.innerHTML=`<p class="cp-mut">Saisissez la quantité comptée pour chaque lot. Un écart exige un motif ; le stock est corrigé et l’écart est conservé sur le lot (date, auteur, motif).</p>
   ${table(['Produit','Lot','Péremption','En stock','Compté','Motif de l’écart'],L.map(l=>[esc(l.drug),esc(l.batch),esc(frD(l.expiry)),esc(l.quantity),peut?`<input type="number" min="0" step="1" class="cp-qte" data-inv="${esc(l.id)}" value="${esc(l.quantity)}">`:'',peut?`<input data-inv-motif="${esc(l.id)}" maxlength="300">`:'']))}
   <p role="alert" class="management-error" id="cp-inv-err"></p><div class="cp-actions">${peut?'<button type="button" class="primary" id="cp-inv">Enregistrer l’inventaire</button>':''}<button type="button" class="secondary" id="cp-inv-print">Imprimer la feuille de comptage</button></div>`;
  $('#cp-inv')?.addEventListener('click',()=>{const L2=lots(),par=s.donnees.moiNom||R().PROFILS[P()],at=new Date().toISOString(),err=[];let n=0;
   body.querySelectorAll('[data-inv]').forEach(i=>{const lot=L2.find(x=>x.id===i.dataset.inv);if(!lot||Number(i.value)===Number(lot.quantity))return;const e=R().ajusterInventaire(L2,lot.id,i.value,{at,par,motif:body.querySelector(`[data-inv-motif="${lot.id}"]`).value});if(e)err.push(lot.drug+' '+lot.batch+' : '+e);else n++});
   if(err.length){$('#cp-inv-err').textContent=err.join(' ');if(!n)return}if(n){ctx.saveLots?.();toast(n+' écart(s) d’inventaire enregistré(s)')}if(!err.length)dessiner()});
  $('#cp-inv-print').onclick=()=>{const w=window.open('','_blank');if(!w){toast('Autorisez l’ouverture de la fenêtre d’impression');return}w.opener=null;w.document.write(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Feuille de comptage</title><style>body{font:13px system-ui;margin:30px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left}</style><h1>Inventaire · feuille de comptage du ${esc(frD(auj()))}</h1><table><tr><th>Produit</th><th>Lot</th><th>Péremption</th><th>En stock</th><th>Compté</th><th>Visa</th></tr>${L.map(l=>`<tr><td>${esc(l.drug)}</td><td>${esc(l.batch)}</td><td>${esc(frD(l.expiry))}</td><td>${esc(l.quantity)}</td><td></td><td></td></tr>`).join('')}</table></html>`);w.document.close();w.print()};
 }
 /* ---------- Paramétrage et exploitation ---------- */
 function parametrage(body){
  const four=[...new Set(s.donnees.articles.map(a=>a.fournisseur))].sort((a,b)=>a.localeCompare(b,'fr'));
  body.innerHTML=`<h3 class="cp-h3">Unités fonctionnelles (UF de gestion et de commande)</h3>${table(['Code','Libellé'],Object.entries(R().UF).map(([k,l])=>[esc(k),esc(l)]))}
   <h3 class="cp-h3">Adresses de livraison</h3>${table(['Code','Libellé'],Object.entries(R().ADRESSES).map(([k,l])=>[esc(k),esc(l)]))}
   <h3 class="cp-h3">Types de commande</h3>${table(['T','Libellé'],Object.entries(R().TYPES).map(([k,l])=>[esc(k),esc(l)]))}
   <h3 class="cp-h3">Fournisseurs du livret</h3>${table(['Code','Nom','Produits'],four.map(f=>[esc(R().codeFournisseur(f)),esc(f),String(s.donnees.articles.filter(a=>a.fournisseur===f).length)]))}
   <p class="cp-mut">Les listes d’UF et d’adresses sont celles de la Clinique du Trocadéro ; dites-moi s’il faut en ajouter.</p>`;
 }
 function exploitation(body){
  body.innerHTML=`<p class="cp-mut">Exports au format tableur (CSV, séparateur point-virgule) des données affichées.</p><div class="cp-actions"><button type="button" class="secondary" data-cp-csv="commandes">Commandes</button><button type="button" class="secondary" data-cp-csv="lignes">Lignes de commande</button><button type="button" class="secondary" data-cp-csv="receptions">Réceptions</button><button type="button" class="secondary" data-cp-csv="stock">Stock</button></div>`;
  const csv=(nom,entetes,rows)=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',txt='﻿'+[entetes,...rows].map(r=>r.map(q).join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download=nom+'-'+auj()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  const C=s.donnees.commandes,e=x=>(Number(x)||0)/100;
  body.querySelectorAll('[data-cp-csv]').forEach(b=>b.onclick=()=>({
   commandes:()=>csv('commandes',['UFg','UF commande','N°','T','État','Code fournisseur','Fournisseur','Du','Validée le','Prévue','Objet','Total HT'],C.map(c=>[c.ufGestion,c.ufCommande,c.numero,c.type,R().libelleEtat(c),R().codeFournisseur(c.fournisseur),c.fournisseur,String(c.creeLe).slice(0,10),c.validation?.at?.slice(0,10)||'',c.datePrevue||'',c.objet||'',e(c.total)])),
   lignes:()=>csv('lignes-commande',['N°','Produit','Code','Quantité','Prix HT','Reçu conforme'],C.flatMap(c=>c.lignes.map((l,i)=>[c.numero,l.nom,l.code,l.quantite,e(l.prixCentimes),R().recuConforme(c,i)]))),
   receptions:()=>csv('receptions',['N°','Date','Produit','BL','Livré','Conforme','Lot','Péremption','Par'],C.flatMap(c=>c.receptions.map(r=>[c.numero,r.at,r.nom,r.bonLivraison,r.quantite,r.conforme,r.lot,r.peremption,r.par]))),
   stock:()=>csv('stock',['Produit','Lot','Péremption','Quantité','Unité','Bloqué'],lots().map(l=>[l.drug,l.batch,l.expiry,l.quantity,l.unit,l.blocked?'oui':'non']))
  })[b.dataset.cpCsv]());
 }
 function integrer(hors){
  const L=lots();let n=0;
  for(const {commande:c,reception:r} of hors){const a=s.donnees.articles.find(x=>x.id===c.lignes[r.ligne].articleId);R().integrerAuStock(L,R().lotPourStock(c,r,a),'LOT-'+(crypto.randomUUID?.()||Date.now().toString(36)+n));n++}
  ctx.saveLots?.();toast(n+' lot(s) entré(s) dans le stock · enregistrement en cours');dessiner();
 }
 function liens(body){body.querySelectorAll('[data-cp-ouvrir]').forEach(b=>b.onclick=()=>{s.detail=s.donnees.commandes.find(c=>c.id===b.dataset.cpOuvrir);dessiner()})}

 /* ---------- Préparation / modification d'une commande ---------- */
 function edition(body){
  const e=s.edition,A=s.donnees.articles.filter(a=>a.actif),fournisseurs=[...new Set(A.map(a=>a.fournisseur))].sort((a,b)=>a.localeCompare(b,'fr'));
  const art=id=>s.donnees.articles.find(a=>a.id===id);
  const lignes=e.lignes.map((l,i)=>{const a=art(l.articleId)||{};return [esc(a.nom||'?')+' '+flags(a),esc(a.code||''),`<input type="number" min="1" step="1" value="${esc(l.quantite)}" data-cp-q="${i}" aria-label="Quantité" class="cp-qte"> ${esc(a.unite||'')}`,R().euros(a.prixCentimes),R().euros((a.prixCentimes||0)*(Number(l.quantite)||0)),`<button type="button" class="textbutton" data-cp-suppr="${i}">Retirer</button>`]});
  const tot=e.lignes.reduce((n,l)=>n+(art(l.articleId)?.prixCentimes||0)*(Number(l.quantite)||0),0);
  const proposables=A.filter(a=>!e.fournisseur||a.fournisseur===e.fournisseur),sel=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(k===l?l:k+' · '+l)}</option>`).join('');
  body.innerHTML=`<h3 class="cp-h3">${e.id?'Modifier la commande '+esc(e.numero):'Nouvelle commande'}</h3>
   ${!A.length?'<p class="notice warn">Le livret des produits est vide : le pharmacien y ajoute d’abord les produits commandables (onglet Livret des produits).</p>':''}
   <div class="formgrid cp-form"><label>Fournisseur<input list="cp-fournisseurs" id="cp-fournisseur" value="${esc(e.fournisseur)}" maxlength="120" required></label><datalist id="cp-fournisseurs">${fournisseurs.map(f=>`<option value="${esc(f)}">`).join('')}</datalist>
   <label>Code fournisseur<input value="${esc(e.fournisseur?R().codeFournisseur(e.fournisseur):'')}" readonly tabindex="-1"></label>
   <label>UF de gestion<select id="cp-ufg">${sel(bloc()?Object.fromEntries(R().UF_BLOC.map(k=>[k,R().UF[k]])):R().UF,e.ufGestion)}</select></label><label>UF de commande<select id="cp-ufc">${sel(R().UF,e.ufCommande)}</select></label>
   <label>Adresse de livraison<select id="cp-adr">${sel(R().ADRESSES,e.adresse)}</select></label><label>Type de commande<select id="cp-type">${sel(R().TYPES,e.type)}</select></label>
   <label>Livraison prévue le<input type="date" id="cp-prevue" value="${esc(e.datePrevue||'')}"></label><label>Objet<input id="cp-objet" maxlength="160" value="${esc(e.objet||'')}" placeholder="Ex. réassort hebdomadaire bloc"></label>
   <label class="wide">Note pour le pharmacien ou le fournisseur<textarea id="cp-note" maxlength="600">${esc(e.note)}</textarea></label></div>
   <h4>Lignes</h4>${table(['Produit','Code','Quantité','Prix unitaire HT','Montant HT',''],lignes)}
   <div class="cp-ajout"><label>Ajouter un produit du livret${e.fournisseur?' ('+esc(e.fournisseur)+')':''}<select id="cp-article"><option value="">Choisir…</option>${proposables.map(a=>`<option value="${esc(a.id)}">${esc(a.nom)}${a.stupefiant?' · stupéfiant':''}${e.fournisseur?'':' · '+esc(a.fournisseur)}</option>`).join('')}</select></label><label>Quantité<input type="number" id="cp-article-q" min="1" step="1" value="1" class="cp-qte"></label><button type="button" class="secondary" id="cp-ajouter">Ajouter</button></div>
   <p class="cp-total">Total HT : <strong>${R().euros(tot)}</strong></p>
   <p role="alert" class="management-error" id="cp-err"></p>
   <div class="cp-actions"><button type="button" class="primary" id="cp-enregistrer">${e.id?'Enregistrer les modifications':'Enregistrer le brouillon'}</button><button type="button" class="secondary" id="cp-annuler-ed">Abandonner</button></div>`;
  const lire=()=>{e.fournisseur=$('#cp-fournisseur').value.trim();e.ufGestion=$('#cp-ufg').value;e.ufCommande=$('#cp-ufc').value;e.adresse=$('#cp-adr').value;e.type=$('#cp-type').value;e.urgent=e.type==='U';e.datePrevue=$('#cp-prevue').value;e.objet=$('#cp-objet').value;e.note=$('#cp-note').value;body.querySelectorAll('[data-cp-q]').forEach(i=>{e.lignes[Number(i.dataset.cpQ)].quantite=Number(i.value)})};
  $('#cp-fournisseur').onchange=()=>{lire();dessiner()};
  $('#cp-ufg').onchange=()=>{lire();e.ufCommande=e.ufGestion;e.adresse=['BCHIR','BENDO'].includes(e.ufGestion)?'MAG-BLOC':'PUI';dessiner()};
  body.querySelectorAll('[data-cp-q]').forEach(i=>i.onchange=()=>{lire();dessiner()});
  body.querySelectorAll('[data-cp-suppr]').forEach(b=>b.onclick=()=>{lire();e.lignes.splice(Number(b.dataset.cpSuppr),1);dessiner()});
  $('#cp-ajouter').onclick=()=>{lire();const id=$('#cp-article').value,q=Number($('#cp-article-q').value);if(!id||!(q>0)){$('#cp-err').textContent='Choisissez un produit et une quantité.';return}const a=art(id);if(!e.fournisseur)e.fournisseur=a.fournisseur;const d=e.lignes.find(l=>l.articleId===id);if(d)d.quantite=Number(d.quantite)+q;else e.lignes.push({articleId:id,quantite:q});dessiner()};
  $('#cp-annuler-ed').onclick=()=>{s.edition=null;dessiner()};
  $('#cp-enregistrer').onclick=async ev=>{lire();ev.target.disabled=true;try{const ent={ufGestion:e.ufGestion,ufCommande:e.ufCommande,adresse:e.adresse,type:e.type,datePrevue:e.datePrevue,objet:e.objet,urgent:e.urgent},r=await api(e.id?{action:'modifier',id:e.id,version:e.version,fournisseur:e.fournisseur,lignes:e.lignes,note:e.note,...ent}:{action:'creer',fournisseur:e.fournisseur,lignes:e.lignes,note:e.note,...ent});s.edition=null;s.detail={id:r.commande.id};await charger();s.detail=s.donnees.commandes.find(c=>c.id===r.commande.id)||r.commande;s.message='Commande '+r.commande.numero+' enregistrée en brouillon.';dessiner()}catch(err){$('#cp-err').textContent=err.message;ev.target.disabled=false}};
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
  if(peut('liquider'))act.push('<button type="button" class="secondary" data-cp-act="liquider">Liquider la facture</button>');
  if(peut('annuler'))act.push('<button type="button" class="textbutton cp-danger" data-cp-act="annuler">Annuler la commande</button>');
  const info=c.statut==='a_valider'&&!pharma()?'En attente de la validation du pharmacien.':['envoyee','partielle'].includes(c.statut)&&stup&&!pharma()?'Stupéfiants : la réception est enregistrée par le pharmacien.':'';
  body.innerHTML=`<p><button type="button" class="textbutton" id="cp-retour">← Retour</button></p>
   <div class="cp-dhead"><div><h3>${esc(c.numero)} ${chip(c)}${c.urgent?' <span class="cp-flag crit">Urgent</span>':''}${stup?' <span class="cp-flag stup">Bon stupéfiants'+(c.bonStupefiants?' n° '+esc(c.bonStupefiants):'')+'</span>':''}</h3>
   <p class="cp-mut">${esc(c.fournisseur)} · préparée par ${esc(c.creeParNom)} le ${esc(frDT(c.creeLe))}${c.validation?' · validée par '+esc(c.validation.par)+' le '+esc(frDT(c.validation.at)):''}${c.envoi?' · transmise ('+esc(R().MODES_ENVOI[c.envoi.mode]||c.envoi.mode)+(c.envoi.reference?', réf. '+esc(c.envoi.reference):'')+') le '+esc(frDT(c.envoi.at)):''}</p>
   <dl class="cp-entete">${[['UF de gestion',(c.ufGestion||'PHARMA')+' · '+(R().UF[c.ufGestion||'PHARMA']||'')],['UF de commande',(c.ufCommande||c.ufGestion||'PHARMA')],['Type',R().TYPES[c.type||'N']],['État',R().libelleEtat(c)],['Code fournisseur',R().codeFournisseur(c.fournisseur)],['Adresse de livraison',R().ADRESSES[c.adresse||'PUI']||c.adresse],['Livraison prévue',frD(c.datePrevue||'')||'—'],['Objet',c.objet||'—']].map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
   ${c.liquidation?`<p class="notice ${c.liquidation.ecartCentimes?'warn':'cp-ok'}">Facture ${esc(c.liquidation.facture)} du ${esc(frD(c.liquidation.dateFacture))} liquidée par ${esc(c.liquidation.par)} : ${R().euros(c.liquidation.montantCentimes)} HT pour ${R().euros(c.liquidation.recuCentimes)} reçus conformes${c.liquidation.ecartCentimes?' · écart '+R().euros(c.liquidation.ecartCentimes)+' ('+esc(c.liquidation.motif)+')':''}.</p>`:''}
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
  if(a==='modifier'){s.edition={id:c.id,numero:c.numero,version:c.version,fournisseur:c.fournisseur,lignes:c.lignes.map(l=>({articleId:l.articleId,quantite:l.quantite})),note:c.note||'',urgent:!!c.urgent,...R().entete(c)};s.detail=null;dessiner();return}
  if(a==='soumettre')return envoyer(base,()=>'Commande '+c.numero+' soumise au pharmacien.');
  if(a==='valider'){
   const stup=c.lignes.some(l=>l.stupefiant);
   zone.innerHTML=`<div class="cp-panel"><h4>Valider la commande ${esc(c.numero)}</h4><p class="cp-mut">Vous engagez la pharmacie pour ${R().euros(c.total)} HT auprès de ${esc(c.fournisseur)}. Les lignes ne seront plus modifiables.</p>${stup?'<label>Numéro du bon de commande de stupéfiants signé<input id="cp-bon" maxlength="60" required></label>':''}<p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Je valide la commande</button></div>`;
   $('#cp-go').onclick=()=>envoyer({...base,bonStupefiants:$('#cp-bon')?.value||''},()=>'Commande '+c.numero+' validée.');return}
  if(a==='liquider'){
   zone.innerHTML=`<div class="cp-panel"><h4>Liquider la facture · ${esc(c.numero)}</h4><p class="cp-mut">Reçu conforme : <strong>${R().euros(R().montantRecu(c))} HT</strong>. Saisissez la facture du fournisseur ; un écart exige un motif.</p><div class="formgrid"><label>N° de facture<input id="cp-fac" maxlength="40" required></label><label>Date de la facture<input type="date" id="cp-facd" value="${esc(auj())}" required></label><label>Montant HT (€)<input id="cp-facm" inputmode="decimal" required></label><label class="wide">Motif de l’écart<input id="cp-motif" maxlength="300"></label></div><p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Liquider</button></div>`;
   $('#cp-go').onclick=()=>envoyer({...base,facture:$('#cp-fac').value,dateFacture:$('#cp-facd').value,montant:$('#cp-facm').value,motif:$('#cp-motif').value},()=>'Facture liquidée pour la commande '+c.numero+'.');return}
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
 function imprimer(liste){
  liste=Array.isArray(liste)?liste:[liste];
  const w=window.open('','_blank');if(!w){toast('Autorisez l’ouverture de la fenêtre d’impression');return}w.opener=null;
  const bon=c=>{const lignes=c.lignes.map(l=>`<tr><td>${esc(l.nom)}${l.stupefiant?' (stupéfiant)':''}${l.froid?' (2-8 °C)':''}</td><td>${esc(l.code)}</td><td>${esc(l.conditionnement)}</td><td>${l.quantite} ${esc(l.unite)}</td><td>${R().euros(l.prixCentimes)}</td><td>${R().euros(l.prixCentimes*l.quantite)}</td></tr>`).join('');
   return `<section class="b"><h1>Bon de commande ${esc(c.numero)}</h1><p>Clinique du Trocadéro · UF ${esc(c.ufGestion||'PHARMA')} · type ${esc(R().TYPES[c.type||'N'])}${c.urgent?' · <b>URGENT</b>':''} · ${esc(R().libelleEtat(c))}</p>
   <p><b>Fournisseur :</b> ${esc(R().codeFournisseur(c.fournisseur))} · ${esc(c.fournisseur)}<br><b>Livraison :</b> ${esc(R().ADRESSES[c.adresse||'PUI']||c.adresse)}${c.datePrevue?' · prévue le '+esc(frD(c.datePrevue)):''}${c.objet?'<br><b>Objet :</b> '+esc(c.objet):''}${c.bonStupefiants?'<br><b>Bon de commande de stupéfiants n° :</b> '+esc(c.bonStupefiants):''}</p>
   <table><thead><tr><th>Produit</th><th>Code</th><th>Conditionnement</th><th>Quantité</th><th>Prix unitaire HT</th><th>Montant HT</th></tr></thead><tbody>${lignes}</tbody></table><p><b>Total HT : ${R().euros(c.total)}</b></p>${c.note?'<p>'+esc(c.note)+'</p>':''}
   <div class="s"><p>Préparée par ${esc(c.creeParNom)}<br>le ${esc(frDT(c.creeLe))}</p><p>${c.validation?'Validée par le pharmacien '+esc(c.validation.par)+'<br>le '+esc(frDT(c.validation.at)):'<b>Non validée par le pharmacien : ne pas transmettre.</b>'}</p></div></section>`};
  w.document.write(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>${liste.length>1?liste.length+' bons de commande':'Bon de commande '+esc(liste[0].numero)}</title><style>body{font:14px system-ui;margin:36px;color:#12404c}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #9aa;padding:8px;text-align:left}h1{font-size:20px}.s{margin-top:40px;display:flex;gap:60px}.b+.b{page-break-before:always;margin-top:40px}</style>${liste.map(bon).join('')}</html>`);
  w.document.close();w.print();
 }

 /* ---------- Demandes des services ---------- */
 function tableDemandes(liste){return table(['Demande','Service','État','Produits','Demandée par','Mise à jour'],liste.map(d=>[`<button type="button" class="textbutton cp-num" data-cp-demande="${esc(d.id)}">${esc(d.numero)}</button>${d.urgent?' <span class="cp-flag crit">Urgent</span>':''}${R().demandeSensible(d)?' <span class="cp-flag stup">Pharmacien</span>':''}`,esc(s.donnees.services[d.service]||d.service),chipD(d),esc(d.lignes.map(l=>l.quantite+' × '+l.nom).join(', ')),esc(d.creeParNom),esc(frDT(d.miseAJour))]))}
 function lienDemandes(body){body.querySelectorAll('[data-cp-demande]').forEach(b=>b.onclick=()=>{s.demande=s.donnees.demandes.find(d=>d.id===b.dataset.cpDemande);dessiner()})}
 function demandes(body){
  const f=s.filtre,D=(s.donnees.demandes||[]).filter(d=>f==='toutes'||(f==='en-cours'?R().DEMANDES_EN_COURS.includes(d.statut):!R().DEMANDES_EN_COURS.includes(d.statut)));
  body.innerHTML=`<div class="pr-filtres">${[['en-cours','En cours'],['closes','Reçues, refusées, annulées'],['toutes','Toutes']].map(([k,l])=>`<button type="button" class="pr-filtre ${f===k?'is-on':''}" data-cp-filtre="${k}">${l}</button>`).join('')}</div>
   ${tableDemandes(D)}<p class="cp-mut">Demandes en cours et demandes closes des 45 derniers jours, tous services.</p>`;
  body.querySelectorAll('[data-cp-filtre]').forEach(b=>b.onclick=()=>{s.filtre=b.dataset.cpFiltre;dessiner()});lienDemandes(body);
 }
 function formDemande(body){
  const e=s.nouvelleDemande,A=s.donnees.articles.filter(a=>a.actif&&(!a.stupefiant||s.donnees.medecin)),art=id=>s.donnees.articles.find(a=>a.id===id);
  const rows=e.lignes.map((l,i)=>[l.horsLivret?esc(l.nom)+' <span class="cp-flag warn">hors livret</span><br><span class="cp-mut">'+esc(l.justification)+'</span>':esc(art(l.articleId)?.nom||'?')+' '+flags(art(l.articleId)||{}),`<input type="number" min="1" step="1" value="${esc(l.quantite)}" data-cp-dq="${i}" class="cp-qte" aria-label="Quantité"> ${esc(l.horsLivret?l.unite||'unité':art(l.articleId)?.unite||'')}`,`<button type="button" class="textbutton" data-cp-dsuppr="${i}">Retirer</button>`]);
  body.innerHTML=`<h3 class="cp-h3">Nouvelle demande à la pharmacie</h3>
   <div class="formgrid cp-form"><label>Service<select id="cp-service">${Object.entries(s.donnees.services).map(([k,l])=>`<option value="${k}" ${k===e.service?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
   <label class="cp-check"><input type="checkbox" id="cp-durgent" ${e.urgent?'checked':''}> Demande urgente</label>
   <label class="wide">Note pour la pharmacie<textarea id="cp-dnote" maxlength="600">${esc(e.note)}</textarea></label></div>
   <h4>Produits demandés</h4>${table(['Produit','Quantité',''],rows)}
   <div class="cp-ajout"><label>Produit du livret<select id="cp-darticle"><option value="">Choisir…</option>${A.map(a=>`<option value="${esc(a.id)}">${esc(a.nom)}${a.stupefiant?' · stupéfiant':''}</option>`).join('')}</select></label><label>Quantité<input type="number" id="cp-dq" min="1" step="1" value="1" class="cp-qte"></label><button type="button" class="secondary" id="cp-dajouter">Ajouter</button></div>
   <details class="cp-hors"><summary>Produit hors livret</summary><div class="cp-ajout"><label>Désignation<input id="cp-hnom" maxlength="160" data-medicament autocomplete="off"></label><label>Quantité<input type="number" id="cp-hq" min="1" step="1" value="1" class="cp-qte"></label><label>Justification (indication, patient)<input id="cp-hj" maxlength="300"></label><button type="button" class="secondary" id="cp-hajouter">Ajouter</button></div><p class="cp-mut">Un produit hors livret est délivré par le pharmacien, qui peut refuser ou proposer un équivalent.</p></details>
   ${s.donnees.medecin?'':'<p class="cp-mut">Les stupéfiants sont demandés par un médecin (anesthésiste).</p>'}
   <p role="alert" class="management-error" id="cp-derr"></p>
   <div class="cp-actions"><button type="button" class="primary" id="cp-denvoyer">Envoyer à la pharmacie</button><button type="button" class="secondary" id="cp-dabandon">Abandonner</button></div>`;
  const lire=()=>{e.service=$('#cp-service').value;e.urgent=$('#cp-durgent').checked;e.note=$('#cp-dnote').value;body.querySelectorAll('[data-cp-dq]').forEach(i=>{e.lignes[Number(i.dataset.cpDq)].quantite=Number(i.value)})};
  body.querySelectorAll('[data-cp-dsuppr]').forEach(b=>b.onclick=()=>{lire();e.lignes.splice(Number(b.dataset.cpDsuppr),1);dessiner()});
  $('#cp-dajouter').onclick=()=>{lire();const id=$('#cp-darticle').value,q=Number($('#cp-dq').value);if(!id||!(q>0)){$('#cp-derr').textContent='Choisissez un produit et une quantité.';return}const d=e.lignes.find(l=>l.articleId===id);if(d)d.quantite=Number(d.quantite)+q;else e.lignes.push({articleId:id,quantite:q});dessiner()};
  $('#cp-hajouter').onclick=()=>{lire();const nom=$('#cp-hnom').value.trim(),q=Number($('#cp-hq').value),j=$('#cp-hj').value.trim();if(nom.length<3||!(q>0)||j.length<5){$('#cp-derr').textContent='Produit hors livret : désignation, quantité et justification requises.';return}e.lignes.push({horsLivret:true,nom,quantite:q,justification:j});dessiner()};
  $('#cp-dabandon').onclick=()=>{s.nouvelleDemande=null;dessiner()};
  $('#cp-denvoyer').onclick=async ev=>{lire();ev.target.disabled=true;try{const r=await api({action:'demander',...e});s.nouvelleDemande=null;s.demande={id:r.demande.id};await charger();s.demande=s.donnees.demandes.find(d=>d.id===r.demande.id)||r.demande;s.message='Demande '+r.demande.numero+' envoyée à la pharmacie.';dessiner()}catch(err){$('#cp-derr').textContent=err.message;ev.target.disabled=false}};
 }
 function detailDemande(body,d){
  const peut=a=>!refusD(a,d),del=d.delivrance;
  const lignes=d.lignes.map((l,i)=>{const x=del?.lignes?.find(y=>y.ligne===i);return [esc(l.nom)+' '+flags(l)+(l.horsLivret?' <span class="cp-flag warn">hors livret</span><br><span class="cp-mut">'+esc(l.justification)+'</span>':''),l.quantite+' × '+esc(l.unite||''),x?String(x.delivre)+(x.delivre<l.quantite?' <span class="cp-flag warn">partiel</span>':''):'—',x?esc(x.sorties.map(so=>so.quantite+' du lot '+so.lot+' (pér. '+frD(so.peremption)+')').join(', ')||'—'):'—',x?esc(x.motif||''):'']});
  const ev=(d.evenements||[]).slice().reverse().map(e=>`<li><span class="cp-ev-date">${esc(frDT(e.at))}</span><strong>${esc(ACTIONS_D[e.action]||e.action)}</strong> par ${esc(e.par)} (${esc(e.profil==='service'?'service':R().PROFILS[e.profil]||e.profil)})${e.motif?' · '+esc(e.motif):''}<span class="cp-mut cp-hash">${esc(e.hash.slice(0,12))}</span></li>`).join('');
  const act=[];
  if(peut('prendre'))act.push('<button type="button" class="secondary" data-cp-dact="prendre">Prendre en charge</button>');
  if(peut('delivrer'))act.push('<button type="button" class="primary" data-cp-dact="delivrer">Préparer la délivrance</button>');
  if(peut('refuser'))act.push('<button type="button" class="textbutton cp-danger" data-cp-dact="refuser">Refuser la demande</button>');
  if(peut('accuser'))act.push('<button type="button" class="primary" data-cp-dact="accuser">Accuser réception</button>');
  if(peut('annuler'))act.push('<button type="button" class="textbutton cp-danger" data-cp-dact="annuler">Annuler la demande</button>');
  const info=['demandee','en_preparation'].includes(d.statut)&&P()==='preparateur'&&R().demandeSensible(d)?'Stupéfiant ou produit hors livret : la délivrance revient au pharmacien.':'';
  body.innerHTML=`<p><button type="button" class="textbutton" id="cp-retour">← Retour</button></p>
   <div class="cp-dhead"><div><h3>${esc(d.numero)} ${chipD(d)}${d.urgent?' <span class="cp-flag crit">Urgent</span>':''}</h3>
   <p class="cp-mut">${esc(s.donnees.services[d.service]||d.service)} · demandée par ${esc(d.creeParNom)} le ${esc(frDT(d.creeLe))}${del?' · délivrée par '+esc(del.par)+' le '+esc(frDT(del.at)):''}${d.reception?' · reçue par '+esc(d.reception.par)+' le '+esc(frDT(d.reception.at)):''}</p>
   ${d.note?`<p class="cp-note">${esc(d.note)}</p>`:''}${d.refus?`<p class="notice warn">Refusée par ${esc(d.refus.par)} : ${esc(d.refus.motif)}</p>`:''}${d.reception?.ecart?`<p class="notice warn">Écart signalé à la réception : ${esc(d.reception.motif)}</p>`:''}</div></div>
   ${table(['Produit','Demandé','Délivré','Lots','Motif'],lignes)}
   ${info?`<p class="notice">${esc(info)}</p>`:''}${del?.avertissements?.length?`<p class="notice warn">${esc(del.avertissements.join(' '))}</p>`:''}
   <div class="cp-actions">${act.join('')}</div><div id="cp-action"></div>
   <h4>Étapes de la demande</h4><ol class="cp-ev">${ev||'<li>—</li>'}</ol>`;
  $('#cp-retour').onclick=()=>{s.demande=null;dessiner()};
  body.querySelectorAll('[data-cp-dact]').forEach(b=>b.onclick=()=>actionDemande(b.dataset.cpDact,d));
 }
 const ACTIONS_D={demande:'Demande envoyée','prise-en-charge':'Prise en charge par la pharmacie',delivrance:'Délivrée',refus:'Refusée',annulation:'Annulée',reception:'Reçue par le service'};
 async function envoyerD(corps,okMsg){
  const err=$('#cp-act-err');
  try{const r=await api(corps);let msg=okMsg(r);
   if(corps.action==='demande-delivrer'&&ctx.canWriteLots?.()){const n=R().appliquerSorties(lots(),r.demande.delivrance.id,r.demande.delivrance.lignes);if(n){ctx.saveLots?.();msg+=' Le stock est mis à jour.'}}
   if(r.avertissements?.length)msg+=' '+r.avertissements.join(' ');
   await charger();s.demande=s.donnees.demandes.find(x=>x.id===corps.id)||r.demande;s.message=msg;dessiner()}
  catch(e){if(err)err.textContent=e.message;else toast(e.message);if(e.status===409)await charger()}
 }
 function actionDemande(a,d){
  const zone=$('#cp-action'),base={action:'demande-'+a,id:d.id,version:d.version};
  const motifForm=(titre,bouton,aide='')=>{zone.innerHTML=`<div class="cp-panel"><h4>${titre}</h4>${aide?`<p class="cp-mut">${aide}</p>`:''}<label>Motif (conservé dans l’historique)<textarea id="cp-motif" maxlength="400" required></textarea></label><p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">${bouton}</button></div>`;$('#cp-go').onclick=()=>envoyerD({...base,motif:$('#cp-motif').value},()=>titre+' : fait.')};
  if(a==='prendre')return envoyerD(base,()=>'Demande '+d.numero+' prise en charge.');
  if(a==='refuser')return motifForm('Refuser la demande','Refuser','Le service voit le motif (produit disponible ailleurs, équivalent proposé…).');
  if(a==='annuler')return motifForm('Annuler la demande','Annuler la demande');
  if(a==='accuser'){
   zone.innerHTML=`<div class="cp-panel"><h4>Accuser réception · ${esc(d.numero)}</h4><p class="cp-mut">Vérifiez les produits et les quantités livrés au service.</p><label class="cp-check"><input type="checkbox" id="cp-ecart"> Écart constaté (produit manquant, abîmé, erreur)</label><label>Motif de l’écart<textarea id="cp-motif" maxlength="400"></textarea></label><p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Confirmer la réception</button></div>`;
   $('#cp-go').onclick=()=>envoyerD({...base,ecart:$('#cp-ecart').checked,motif:$('#cp-motif').value},()=>'Réception confirmée.');return}
  if(a==='delivrer'){
   const rows=d.lignes.map((l,i)=>{let reste=l.quantite;const dispo=R().lotsDisponibles(l,lots(),auj(),s.donnees.articles);
    const champs=dispo.map(lot=>{const q=Math.min(reste,Number(lot.quantity)||0);reste-=q;return `<label class="cp-lot">Lot ${esc(lot.batch)} · pér. ${esc(frD(lot.expiry))} · ${esc(lot.quantity)} en stock<input type="number" min="0" max="${esc(lot.quantity)}" step="1" value="${q}" data-lot="${esc(lot.id)}" class="cp-qte"></label>`}).join('');
    return `<fieldset class="cp-rec-l" data-ligne="${i}"><legend>${esc(l.nom)} ${flags(l)} <span class="cp-mut">· demandé ${l.quantite} × ${esc(l.unite||'')}</span></legend>${champs||'<p class="cp-mut wide">Aucun lot disponible en stock pour ce produit.</p>'}<label class="wide">Motif si quantité non délivrée (rupture, commande en cours…)<input name="motif" maxlength="300" value="${dispo.reduce((n,x)=>n+(Number(x.quantity)||0),0)<l.quantite?'Stock insuffisant':''}"></label></fieldset>`}).join('');
   zone.innerHTML=`<div class="cp-panel"><h4>Délivrance · ${esc(d.numero)}</h4><p class="cp-mut">Lots proposés du premier au dernier périmé. Les quantités délivrées sortent du stock de la pharmacie.</p><div class="cp-rec">${rows}</div><p role="alert" class="management-error" id="cp-act-err"></p><button type="button" class="primary" id="cp-go">Enregistrer la délivrance</button></div>`;
   $('#cp-go').onclick=()=>{const lignes=[...zone.querySelectorAll('.cp-rec-l')].map(f=>({ligne:Number(f.dataset.ligne),motif:f.querySelector('[name=motif]').value,sorties:[...f.querySelectorAll('[data-lot]')].map(i=>({lotId:i.dataset.lot,quantite:Number(i.value)})).filter(x=>x.quantite>0)}));
    envoyerD({...base,lignes},()=>'Délivrance enregistrée.')};
  }
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

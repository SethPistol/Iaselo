/* IASELO · commandes de la pharmacie (PUI) aux fournisseurs (26/11/2026, demande de Romain).
   Circuit habituel des logiciels de pharmacie hospitalière :
    1. le préparateur (ou le pharmacien) prépare la commande, à partir des propositions de réapprovisionnement
       (stock sous le seuil minimum, en tenant compte des commandes déjà en cours) ou à la main ;
    2. le préparateur la soumet ; seul le pharmacien la valide (il engage la pharmacie), la renvoie avec un motif,
       ou l'annule ; un pharmacien peut valider directement une commande qu'il a préparée ;
    3. la commande validée est transmise au fournisseur (EDI, portail, e-mail, téléphone) ; elle n'est plus modifiable ;
    4. réception ligne par ligne : quantité, numéro de lot, péremption, conformité, chaîne du froid ; livraison
       partielle = reliquat suivi ; non-conformité = litige, rien n'entre en stock ; seul le pharmacien solde un reliquat.
   Règles particulières :
    - stupéfiants : bon de commande dédié (pas de mélange avec d'autres produits), numéro du bon exigé à la validation,
      réception enregistrée par le pharmacien uniquement (registre des stupéfiants) ;
    - produits thermosensibles : réception refusée en stock sans confirmation de la chaîne du froid (2 à 8 °C) ;
    - péremption courte (moins de 90 jours) : acceptation explicite et motivée ;
    - médicaments dérivés du sang : lot obligatoire, traçabilité nominative assurée ensuite à la dispensation.
   Demandes des services à la pharmacie (dotations, 26/11/2026) :
    - l'infirmier(ère) (bloc, étage, cadre) ou l'anesthésiste demande des produits du livret pour son service ;
      un produit hors livret est demandé avec une justification ; un stupéfiant n'est demandé que par un médecin ;
    - la pharmacie prend en charge et délivre par lot (premier périmé, premier sorti), sans dépasser le stock ;
      une quantité non délivrée est motivée (rupture, commande en cours) ; stupéfiant ou hors livret : pharmacien ;
    - le service accuse réception (écart signalé avec un motif) ; le pharmacien peut refuser une demande, motivée.
   Fonctions pures partagées par l'écran (commandes-pharmacie.js) et le serveur (worker/commandes-pharmacie.mjs).
   Testées dans tests/commandes-pharmacie.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCommandesPharmacie=api})(typeof self!=='undefined'?self:this,function(){
'use strict';
const str=(v,max=300)=>String(v??'').replace(/[\r\u0000-\u0008]/g,'').trim().slice(0,max);
const entier=(v,min=0,max=1e6)=>{const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:null};
const fold=s=>String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

const STATUTS={brouillon:'Brouillon',a_valider:'À valider par le pharmacien',validee:'Validée',envoyee:'Transmise au fournisseur',partielle:'Reçue en partie',recue:'Reçue',soldee:'Soldée (reliquat abandonné)',annulee:'Annulée'};
const EN_COURS=['brouillon','a_valider','validee','envoyee','partielle'];
const MODES_ENVOI={edi:'EDI (échange informatisé)',portail:'Portail du fournisseur',email:'E-mail',telephone:'Téléphone',fax:'Télécopie'};
const PROFILS={pharmacien:'Pharmacien',preparateur:'Préparateur en pharmacie'};
const MAX_LIGNES=80,PEREMPTION_COURTE=90;

// Profil d'un compte pour ce module : pharmacien (titulaire, adjoint), préparateur, lecteur (administrateur) ou aucun.
const METIERS_SERVICE=['infirmier','anesthesiste'];
function profil(c){
 if(!c)return null;
 if(c.job==='pharmacien')return c.poste==='preparateur'?'preparateur':'pharmacien';
 if(METIERS_SERVICE.includes(c.job))return 'service';
 if(c.isAdmin)return 'lecteur';
 return null;
}
// Les commandes aux fournisseurs restent visibles par la pharmacie et, en lecture, par l'administrateur.
const voitCommandes=c=>!!c&&(c.job==='pharmacien'||!!c.isAdmin);

/* ---------- Livret des articles commandables ---------- */
function normaliserArticle(a){
 a=a&&typeof a==='object'?a:{};
 return {nom:str(a.nom,160),code:str(a.code,20).replace(/\s+/g,''),forme:str(a.forme,80),conditionnement:str(a.conditionnement,80),unite:str(a.unite,30)||'boîte',
  fournisseur:str(a.fournisseur,120),prix:String(a.prix??'').trim()===''?null:entier(Math.round(Number(String(a.prix).replace(',','.'))*100),0,1e9),
  stockMin:entier(a.stockMin,0,100000),stockMax:entier(a.stockMax,0,100000),
  stupefiant:!!a.stupefiant,froid:!!a.froid,mds:!!a.mds,actif:a.actif!==false};
}
// prix : en euros dans le formulaire, en centimes une fois normalisé (prixCentimes).
function validerArticle(brut){
 const a=normaliserArticle(brut),errors=[];
 if(a.nom.length<3)errors.push('Désignation du produit requise (3 caractères au moins).');
 if(a.code&&!/^(\d{7}|\d{8}|\d{13})$/.test(a.code))errors.push('Code : CIP 7 ou 13 chiffres, UCD 7 ou 13 chiffres, CIS 8 chiffres, ou laisser vide.');
 if(!a.fournisseur)errors.push('Fournisseur habituel requis (laboratoire ou grossiste-répartiteur).');
 if(a.prix===null)errors.push('Prix unitaire hors taxes requis (0 accepté pour un produit gratuit ou en dépôt).');
 if(a.stockMin===null||a.stockMax===null)errors.push('Seuils de stock minimum et maximum requis (nombres entiers).');
 else if(a.stockMax<a.stockMin||a.stockMax===0)errors.push('Le stock maximum doit être supérieur ou égal au minimum et non nul.');
 const out={...a,prixCentimes:a.prix};delete out.prix;
 return {ok:!errors.length,errors,article:out};
}

/* ---------- Lignes et commande ---------- */
// Une ligne reprend l'article tel qu'il est au moment de la commande (désignation, prix, drapeaux) : le bon reste juste
// même si le livret change ensuite.
function ligneDepuisArticle(article,quantite){
 return {articleId:article.id,nom:article.nom,code:article.code||'',conditionnement:article.conditionnement||'',unite:article.unite||'boîte',
  prixCentimes:Number(article.prixCentimes)||0,stupefiant:!!article.stupefiant,froid:!!article.froid,mds:!!article.mds,quantite:entier(quantite,1,100000)??0};
}
function normaliserLignes(lignes,articles){
 const parId=new Map((articles||[]).map(a=>[a.id,a])),out=[],errors=[];
 for(const l of Array.isArray(lignes)?lignes:[]){
  const a=parId.get(l?.articleId);if(!a){errors.push('Article inconnu du livret : '+str(l?.nom||l?.articleId,80)+'.');continue}
  if(!a.actif){errors.push(a.nom+' : article retiré du livret.');continue}
  const q=entier(l.quantite,1,100000);if(q===null){errors.push(a.nom+' : quantité entière positive requise.');continue}
  const deja=out.find(x=>x.articleId===a.id);if(deja){deja.quantite+=q;continue}
  out.push(ligneDepuisArticle(a,q));
 }
 if(out.length>MAX_LIGNES)errors.push('Une commande compte au plus '+MAX_LIGNES+' lignes.');
 return {lignes:out,errors};
}
const total=lignes=>(lignes||[]).reduce((n,l)=>n+(Number(l.prixCentimes)||0)*(Number(l.quantite)||0),0);
const euros=c=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format((Number(c)||0)/100);

// Contrôles avant soumission ou validation.
function controlerCommande(cmd,{validation=false}={}){
 const errors=[],l=cmd?.lignes||[];
 if(!str(cmd?.fournisseur))errors.push('Fournisseur requis.');
 if(!l.length)errors.push('Ajoutez au moins une ligne.');
 const stup=l.filter(x=>x.stupefiant);
 if(stup.length&&stup.length<l.length)errors.push('Stupéfiants : bon de commande dédié, sans autre produit. Retirez les autres lignes ou les stupéfiants.');
 if(validation&&stup.length&&!str(cmd?.bonStupefiants))errors.push('Stupéfiants : indiquez le numéro du bon de commande signé.');
 return {ok:!errors.length,errors,stupefiants:stup.length>0};
}

/* ---------- Droits par profil et par état ---------- */
// Renvoie '' si l'action est permise, sinon la raison du refus (affichée telle quelle).
function refus(action,p,cmd,acteurId){
 const etat=cmd?.statut||'';
 if(!p)return 'Commandes de la pharmacie : réservées au pharmacien et au préparateur en pharmacie.';
 if(p==='lecteur'||p==='service')return action==='lire'&&p==='lecteur'?'':'Commandes aux fournisseurs : passées par la pharmacie (lecture seule pour l’administrateur).';
 const pharma=p==='pharmacien';
 switch(action){
  case 'lire':return '';
  case 'creer':return '';
  case 'articles':return pharma?'':'Le livret des produits est tenu par le pharmacien.';
  case 'modifier':return etat==='brouillon'?'':'Seule une commande en brouillon se modifie.';
  case 'soumettre':return etat==='brouillon'?'':'Seule une commande en brouillon se soumet au pharmacien.';
  case 'valider':return !pharma?'Seul le pharmacien valide une commande : elle engage la pharmacie.':['brouillon','a_valider'].includes(etat)?'':'Commande déjà validée ou close.';
  case 'renvoyer':return !pharma?'Seul le pharmacien renvoie une commande au préparateur.':etat==='a_valider'?'':'Seule une commande à valider peut être renvoyée.';
  case 'rouvrir':return !pharma?'Seul le pharmacien rouvre une commande validée.':etat==='validee'?'':'Une commande transmise au fournisseur ne se rouvre plus : annulez-la ou attendez la livraison.';
  case 'envoyer':return etat==='validee'?'':'Seule une commande validée par le pharmacien est transmise.';
  case 'receptionner':
   if(!['envoyee','partielle'].includes(etat))return 'Réception possible après transmission au fournisseur.';
   if((cmd.lignes||[]).some(x=>x.stupefiant)&&!pharma)return 'Stupéfiants : la réception est enregistrée par le pharmacien (registre des stupéfiants).';
   return '';
  case 'liquider':return !pharma?'La liquidation de la facture fournisseur revient au pharmacien.':['partielle','recue','soldee'].includes(etat)?(cmd.liquidation?'Commande déjà liquidée.':''):'Liquidation après réception.';
  case 'solder':return !pharma?'Seul le pharmacien solde un reliquat.':etat==='partielle'?'':'Seule une commande reçue en partie se solde.';
  case 'annuler':
   if(['brouillon','a_valider'].includes(etat))return pharma||cmd.creePar===acteurId?'':'Le préparateur n’annule que ses propres commandes avant validation.';
   if(['validee','envoyee'].includes(etat))return pharma?'':'Après validation, seul le pharmacien annule une commande.';
   return 'Commande déjà reçue en partie ou close : soldez le reliquat.';
 }
 return 'Action inconnue.';
}

/* ---------- Stock, propositions de réapprovisionnement ---------- */
// lots : stock de la pharmacie (Circuit du médicament › Stocks). Un lot bloqué ou périmé ne compte pas.
function lotDeLArticle(lot,a){return lot&&(lot.articleId?lot.articleId===a.id:fold(lot.drug)===fold(a.nom))}
function stockArticle(a,lots,aujourdhui){return (lots||[]).filter(l=>lotDeLArticle(l,a)&&!l.blocked&&!(l.expiry&&l.expiry<aujourdhui)).reduce((n,l)=>n+(Number(l.quantity)||0),0)}
// Quantité restant à livrer d'une ligne (non conforme = à relivrer).
function recuConforme(cmd,i){return (cmd.receptions||[]).filter(r=>r.ligne===i).reduce((n,r)=>n+(Number(r.conforme)||0),0)}
function reliquat(cmd,i){return Math.max(0,(Number(cmd.lignes?.[i]?.quantite)||0)-recuConforme(cmd,i))}
function enCoursArticle(a,commandes){
 return (commandes||[]).filter(c=>EN_COURS.includes(c.statut)).reduce((n,c)=>n+(c.lignes||[]).reduce((m,l,i)=>m+(l.articleId===a.id?reliquat(c,i):0),0),0);
}
function propositions(articles,lots,commandes,aujourdhui){
 return (articles||[]).filter(a=>a.actif).map(a=>{
  const stock=stockArticle(a,lots,aujourdhui),enCours=enCoursArticle(a,commandes);
  const proposee=stock+enCours<=a.stockMin?Math.max(0,a.stockMax-stock-enCours):0;
  return {article:a,stock,enCours,proposee,sousSeuil:stock<=a.stockMin};
 }).filter(x=>x.proposee>0).sort((x,y)=>String(x.article.fournisseur).localeCompare(String(y.article.fournisseur),'fr')||String(x.article.nom).localeCompare(String(y.article.nom),'fr'));
}
// Regroupe les propositions par fournisseur ; les stupéfiants partent sur un bon à part.
function groupesProposition(props){
 const g=new Map();
 for(const p of props){const k=p.article.fournisseur+(p.article.stupefiant?' · stupéfiants':'');if(!g.has(k))g.set(k,{fournisseur:p.article.fournisseur,stupefiants:!!p.article.stupefiant,lignes:[]});g.get(k).lignes.push(p)}
 return [...g.values()];
}

/* ---------- Réception ---------- */
const ajouterJours=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
// saisies : [{ligne, quantite, conforme (nombre conforme), lot, peremption, froidOk, motif, peremptionCourteAcceptee}]
function controlerReception(cmd,saisies,aujourdhui){
 const errors=[],avertissements=[],lignes=[];
 for(const s of Array.isArray(saisies)?saisies:[]){
  const i=entier(s?.ligne,0,MAX_LIGNES),l=i===null?null:cmd.lignes?.[i];if(!l){errors.push('Ligne de commande inconnue.');continue}
  const q=entier(s.quantite,0,100000);if(q===null){errors.push(l.nom+' : quantité livrée entière requise.');continue}
  if(q===0)continue;
  const reste=reliquat(cmd,i);
  if(q>reste){errors.push(l.nom+' : '+q+' livré(s) pour '+reste+' attendu(s). Refusez l’excédent au livreur ou ouvrez un litige.');continue}
  let conf=entier(s.conforme??q,0,q);if(conf===null){errors.push(l.nom+' : nombre d’unités conformes incorrect.');continue}
  const lot=str(s.lot,40),per=str(s.peremption,10),motif=str(s.motif,300);
  if(l.froid&&!s.froidOk){if(conf>0)avertissements.push(l.nom+' : chaîne du froid non confirmée, la livraison est mise en litige (quarantaine).');conf=0}
  if(conf>0){
   if(!lot)errors.push(l.nom+' : numéro de lot requis.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(per))errors.push(l.nom+' : date de péremption requise.');
   else if(per<=aujourdhui)errors.push(l.nom+' : produit périmé, réception en stock refusée.');
   else if(per<ajouterJours(aujourdhui,PEREMPTION_COURTE)&&!s.peremptionCourteAcceptee)errors.push(l.nom+' : péremption à moins de '+PEREMPTION_COURTE+' jours, acceptation motivée du pharmacien requise.');
   else if(per<ajouterJours(aujourdhui,PEREMPTION_COURTE)&&motif.length<5)errors.push(l.nom+' : motif de l’acceptation d’une péremption courte requis.');
  }
  if(conf<q&&motif.length<5)errors.push(l.nom+' : motif du litige requis (casse, erreur de produit, chaîne du froid…).');
  lignes.push({ligne:i,nom:l.nom,quantite:q,conforme:conf,litige:q-conf,lot,peremption:per,froidOk:l.froid?!!s.froidOk:null,motif,peremptionCourte:conf>0&&per<ajouterJours(aujourdhui,PEREMPTION_COURTE)});
 }
 if(!errors.length&&!lignes.length)errors.push('Aucune quantité livrée saisie.');
 return {ok:!errors.length,errors,avertissements,lignes};
}
// État après une réception (les réceptions ont été ajoutées à cmd.receptions).
function statutApresReception(cmd){return (cmd.lignes||[]).every((l,i)=>reliquat(cmd,i)===0)?'recue':'partielle'}

// Lot à ajouter au stock (Circuit du médicament › Stocks) pour une ligne reçue conforme.
function lotPourStock(cmd,r,article){
 const l=cmd.lignes[r.ligne];
 return {drug:l.nom,batch:r.lot,expiry:r.peremption,quantity:r.conforme,unit:l.unite,threshold:article?.stockMin??0,articleId:l.articleId,commande:cmd.numero,receptions:[r.id],stupefiant:!!l.stupefiant,froid:!!l.froid,mds:!!l.mds};
}
// Fusionne le lot reçu dans le stock (même produit et même lot : quantités additionnées). Idempotent par réception.
function integrerAuStock(lots,lot,id){
 const meme=lots.find(x=>(x.articleId===lot.articleId||fold(x.drug)===fold(lot.drug))&&x.batch===lot.batch);
 if(meme){if((meme.receptions||[]).includes(lot.receptions[0]))return lots;meme.quantity=(Number(meme.quantity)||0)+lot.quantity;meme.receptions=[...(meme.receptions||[]),...lot.receptions];if(lot.expiry<meme.expiry)meme.expiry=lot.expiry;return lots}
 lots.push({...lot,id});return lots;
}
// Réceptions conformes pas encore présentes dans le stock (poste fermé avant l'enregistrement du stock, par exemple).
function receptionsHorsStock(commandes,lots){
 const vues=new Set((lots||[]).flatMap(l=>l.receptions||[]));
 return (commandes||[]).flatMap(c=>(c.receptions||[]).filter(r=>r.conforme>0&&!vues.has(r.id)).map(r=>({commande:c,reception:r})));
}

/* ---------- Demandes des services à la pharmacie ---------- */
const SERVICES={bloc:'Bloc opératoire',sspi:'SSPI',hospitalisation:'Hospitalisation',ambulatoire:'Ambulatoire',consultation:'Consultation d’anesthésie'};
const STATUTS_DEMANDE={demandee:'Transmise à la pharmacie',en_preparation:'En préparation',delivree:'Délivrée',recue:'Reçue par le service',refusee:'Refusée',annulee:'Annulée'};
const DEMANDES_EN_COURS=['demandee','en_preparation','delivree'];
function serviceParDefaut(c){return c?.job==='infirmier'?(c.poste==='etage'||!c.poste?'hospitalisation':'bloc'):c?.job==='anesthesiste'?'bloc':''}
// lignes : [{articleId, quantite}] ou [{horsLivret:true, nom, quantite, justification}]
function controlerDemande(d,articles,{medecin=false}={}){
 const errors=[],parId=new Map((articles||[]).map(a=>[a.id,a])),lignes=[];
 const service=str(d?.service,30);if(!Object.hasOwn(SERVICES,service))errors.push('Service demandeur requis.');
 for(const l of Array.isArray(d?.lignes)?d.lignes:[]){
  const q=entier(l?.quantite,1,10000);
  if(l?.horsLivret){const nom=str(l.nom,160),j=str(l.justification,300);
   if(nom.length<3){errors.push('Produit hors livret : désignation requise.');continue}
   if(q===null){errors.push(nom+' : quantité entière positive requise.');continue}
   if(j.length<5){errors.push(nom+' : justification requise pour un produit hors livret (patient, indication).');continue}
   lignes.push({horsLivret:true,articleId:'',nom,quantite:q,justification:j,unite:str(l.unite,30)||'unité',stupefiant:false,froid:false,mds:false});continue}
  const a=parId.get(l?.articleId);if(!a||!a.actif){errors.push('Produit inconnu ou retiré du livret.');continue}
  if(q===null){errors.push(a.nom+' : quantité entière positive requise.');continue}
  if(a.stupefiant&&!medecin){errors.push(a.nom+' : un stupéfiant est demandé par un médecin (anesthésiste).');continue}
  const deja=lignes.find(x=>x.articleId===a.id);if(deja){deja.quantite+=q;continue}
  lignes.push({articleId:a.id,nom:a.nom,quantite:q,unite:a.unite||'boîte',stupefiant:!!a.stupefiant,froid:!!a.froid,mds:!!a.mds});
 }
 if(!lignes.length&&!errors.length)errors.push('Ajoutez au moins un produit.');
 if(lignes.length>MAX_LIGNES)errors.push('Une demande compte au plus '+MAX_LIGNES+' lignes.');
 return {ok:!errors.length,errors,demande:{service,lignes,note:str(d?.note,600),urgent:!!d?.urgent}};
}
const demandeSensible=d=>(d?.lignes||[]).some(l=>l.stupefiant||l.horsLivret);
function refusDemande(action,p,d,moi){
 const etat=d?.statut||'',pharmacie=['pharmacien','preparateur'].includes(p);
 if(!p)return 'Demandes à la pharmacie : réservées aux soignants des services et à la pharmacie.';
 switch(action){
  case 'lire':return '';
  case 'demander':return p==='service'?'':'La demande est faite par le service (infirmier(ère) ou anesthésiste).';
  case 'annuler':return p!=='service'?'La pharmacie refuse une demande, elle ne l’annule pas.':etat==='demandee'?'':'Demande déjà prise en charge par la pharmacie : appelez-la.';
  case 'prendre':return !pharmacie?'Prise en charge par la pharmacie.':etat==='demandee'?'':'Demande déjà prise en charge ou close.';
  case 'delivrer':
   if(!pharmacie)return 'Délivrance par la pharmacie.';
   if(!['demandee','en_preparation'].includes(etat))return 'Demande déjà délivrée ou close.';
   if(demandeSensible(d)&&p!=='pharmacien')return 'Stupéfiant ou produit hors livret : délivrance par le pharmacien.';
   return '';
  case 'refuser':return p!=='pharmacien'?'Seul le pharmacien refuse une demande.':['demandee','en_preparation'].includes(etat)?'':'Demande déjà délivrée ou close.';
  case 'accuser':return p!=='service'?'L’accusé de réception est fait par le service.':etat==='delivree'?'':'Rien à réceptionner pour cette demande.';
 }
 return 'Action inconnue.';
}
// Lots disponibles pour une ligne, premier périmé en premier (FEFO).
function lotsDisponibles(ligne,lots,aujourdhui,articles){
 const a=ligne.articleId?(articles||[]).find(x=>x.id===ligne.articleId)||{id:ligne.articleId,nom:ligne.nom}:null;
 return (lots||[]).filter(l=>!l.blocked&&!(l.expiry&&l.expiry<aujourdhui)&&(Number(l.quantity)||0)>0&&(a?lotDeLArticle(l,a):fold(l.drug)===fold(ligne.nom)))
  .sort((x,y)=>String(x.expiry).localeCompare(String(y.expiry)));
}
// saisies : [{ligne, sorties:[{lotId, quantite}], motif}]
function controlerDelivrance(d,saisies,lots,aujourdhui,articles){
 const errors=[],avertissements=[],lignes=[],pris=new Map();
 const parLigne=new Map((Array.isArray(saisies)?saisies:[]).map(x=>[Number(x?.ligne),x]));
 (d.lignes||[]).forEach((l,i)=>{
  const s=parLigne.get(i)||{},dispo=lotsDisponibles(l,lots,aujourdhui,articles),sorties=[];let total=0;
  for(const so of Array.isArray(s.sorties)?s.sorties:[]){
   const q=entier(so?.quantite,0,10000);if(!q)continue;
   const lot=dispo.find(x=>x.id===so.lotId);if(!lot){errors.push(l.nom+' : lot introuvable, bloqué, périmé ou d’un autre produit.');continue}
   const deja=pris.get(lot.id)||0;if(deja+q>Number(lot.quantity)){errors.push(l.nom+' : lot '+lot.batch+' : '+(Number(lot.quantity)-deja)+' en stock seulement.');continue}
   pris.set(lot.id,deja+q);total+=q;sorties.push({lotId:lot.id,lot:lot.batch,peremption:lot.expiry,quantite:q});
  }
  if(total>l.quantite)errors.push(l.nom+' : '+total+' délivré(s) pour '+l.quantite+' demandé(s).');
  const motif=str(s.motif,300);
  if(total<l.quantite&&motif.length<5)errors.push(l.nom+' : motif requis pour la quantité non délivrée (rupture, commande en cours…).');
  const premier=dispo[0];if(premier&&sorties.length&&!sorties.some(x=>x.lotId===premier.id))avertissements.push(l.nom+' : le lot '+premier.batch+' périme en premier (premier périmé, premier sorti).');
  lignes.push({ligne:i,delivre:total,sorties,motif});
 });
 if(!errors.length&&lignes.every(x=>!x.delivre)&&!lignes.every(x=>x.motif))errors.push('Rien à délivrer : indiquez les quantités ou refusez la demande.');
 return {ok:!errors.length,errors,avertissements,lignes};
}
// Sortie du stock (Circuit du médicament › Stocks), idempotente par délivrance.
function appliquerSorties(lots,delivranceId,lignes){
 let n=0;
 for(const l of lignes||[])for(const so of l.sorties||[]){const lot=lots.find(x=>x.id===so.lotId);if(!lot)continue;const cle=delivranceId+':'+so.lotId+':'+l.ligne;if((lot.sorties||[]).includes(cle))continue;lot.quantity=Math.max(0,(Number(lot.quantity)||0)-so.quantite);lot.sorties=[...(lot.sorties||[]),cle];n++}
 return n;
}
function sortiesHorsStock(demandes,lots){
 const vues=new Set((lots||[]).flatMap(l=>l.sorties||[]));
 return (demandes||[]).filter(d=>d.delivrance&&(d.delivrance.lignes||[]).some(l=>(l.sorties||[]).some(so=>(lots||[]).some(x=>x.id===so.lotId)&&!vues.has(d.delivrance.id+':'+so.lotId+':'+l.ligne))));
}
const numeroDemande=(annee,n)=>'DEM-'+annee+'-'+String(n).padStart(4,'0');

/* ---------- Gestion des commandes sur le modèle de l'écran du bloc (Dedalus, photos de Romain du 26/11) ---------- */
// UF de gestion / de commande, adresses de livraison, types de commande, lettres d'état.
const UF={BCHIR:'Bloc chirurgical',BENDO:'Bloc endoscopie',SSPI:'SSPI',HOSPI:'Hospitalisation',AMBU:'Ambulatoire',PHARMA:'Pharmacie (PUI)'};
const ADRESSES={'MAG-BLOC':'Magasin du bloc opératoire','PUI':'Pharmacie à usage intérieur','QUAI':'Quai de livraison de la clinique'};
const TYPES={N:'Normale',U:'Urgente',D:'Dépôt (réassort de dépôt)'};
const ETATS={brouillon:'C',a_valider:'C',validee:'V',envoyee:'E',partielle:'P',recue:'R',soldee:'R',annulee:'S'};
const ETATS_LIBELLES={C:'En cours de saisie',V:'Validée',E:'Envoyée',P:'Reçue en partie',R:'Reçue',S:'Supprimée'};
const libelleEtat=c=>c.statut==='a_valider'?'En cours de saisie · à valider':c.statut==='soldee'?'Soldée':ETATS_LIBELLES[ETATS[c.statut]]||c.statut;
// Code fournisseur : F + premières lettres du nom (ex. COMEPA INDUSTRIE → FCOMEPAIN).
const codeFournisseur=nom=>'F'+fold(nom).replace(/[^a-z0-9]/g,'').toUpperCase().slice(0,8);
function entete(e){
 e=e&&typeof e==='object'?e:{};
 const ufG=Object.hasOwn(UF,e.ufGestion)?e.ufGestion:'PHARMA',ufC=Object.hasOwn(UF,e.ufCommande)?e.ufCommande:ufG;
 return {ufGestion:ufG,ufCommande:ufC,adresse:Object.hasOwn(ADRESSES,e.adresse)?e.adresse:(['BCHIR','BENDO'].includes(ufG)?'MAG-BLOC':'PUI'),
  type:Object.hasOwn(TYPES,e.type)?e.type:(e.urgent?'U':'N'),datePrevue:/^\d{4}-\d{2}-\d{2}$/.test(String(e.datePrevue||''))?e.datePrevue:'',objet:str(e.objet,160)};
}
// Filtres de la liste (comme l'écran du bloc). etat : « C, V » ; dates au format AAAA-MM-JJ.
function lettresEtat(txt){return [...new Set(String(txt||'').toUpperCase().split(/[^A-Z]+/).filter(x=>Object.hasOwn(ETATS_LIBELLES,x)))]}
function filtrer(commandes,f={}){
 const et=lettresEtat(f.etat),txt=v=>fold(v||'');
 return (commandes||[]).filter(c=>{
  const l=ETATS[c.statut];
  if(l==='S'&&!f.supprimees)return false;
  if(et.length&&!et.includes(l)&&!(l==='S'&&f.supprimees))return false;
  const du=String(c.creeLe||'').slice(0,10),val=String(c.validation?.at||'').slice(0,10);
  if(f.du&&du<f.du)return false;if(f.au&&du>f.au)return false;
  if((f.valideDu||f.valideAu)&&!val)return false;if(f.valideDu&&val<f.valideDu)return false;if(f.valideAu&&val>f.valideAu)return false;
  if(f.type&&c.type!==f.type)return false;
  if(f.fournisseur&&!txt(c.fournisseur).includes(txt(f.fournisseur))&&!txt(codeFournisseur(c.fournisseur)).includes(txt(f.fournisseur)))return false;
  if(f.numero&&!txt(c.numero).includes(txt(f.numero)))return false;
  if(f.adresse&&c.adresse!==f.adresse)return false;if(f.ufCommande&&c.ufCommande!==f.ufCommande)return false;if(f.ufGestion&&c.ufGestion!==f.ufGestion)return false;
  return true;
 });
}
function trier(liste,cle,sens=1){
 const v=c=>({ufGestion:c.ufGestion,numero:c.numero,type:c.type,etat:libelleEtat(c),code:codeFournisseur(c.fournisseur),fournisseur:c.fournisseur,du:c.creeLe,validee:c.validation?.at||'',prevue:c.datePrevue||'',objet:c.objet||''})[cle]??'';
 return [...liste].sort((a,b)=>String(v(a)).localeCompare(String(v(b)),'fr',{numeric:true})*sens);
}
// Montant reçu conforme (base de la liquidation de la facture fournisseur).
function montantRecu(cmd){return (cmd.receptions||[]).reduce((n,r)=>n+(Number(r.conforme)||0)*(Number(cmd.lignes?.[r.ligne]?.prixCentimes)||0),0)}
function controlerLiquidation(cmd,f){
 const errors=[],facture=str(f?.facture,40),date=str(f?.dateFacture,10),m=String(f?.montant??'').trim(),montant=m===''?null:entier(Math.round(Number(m.replace(',','.'))*100),0,1e10);
 if(!['partielle','recue','soldee'].includes(cmd?.statut))errors.push('Liquidation après réception.');
 if(cmd?.liquidation)errors.push('Commande déjà liquidée.');
 if(!facture)errors.push('Numéro de facture du fournisseur requis.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))errors.push('Date de la facture requise.');
 if(montant===null)errors.push('Montant HT de la facture requis.');
 const recu=montantRecu(cmd||{}),ecart=montant===null?0:montant-recu;
 if(!errors.length&&ecart!==0&&str(f?.motif,300).length<5)errors.push('Écart de '+euros(ecart)+' entre la facture et les quantités reçues : motif requis.');
 return {ok:!errors.length,errors,liquidation:{facture,dateFacture:date,montantCentimes:montant,recuCentimes:recu,ecartCentimes:ecart,motif:str(f?.motif,300)}};
}
// Suivi par article et cadencier (quantités commandées par mois sur 12 mois).
function suiviArticle(articleId,commandes){
 return (commandes||[]).filter(c=>c.statut!=='annulee').flatMap(c=>(c.lignes||[]).map((l,i)=>({c,l,i})).filter(x=>x.l.articleId===articleId)).map(({c,l,i})=>({commande:c,quantite:l.quantite,recu:recuConforme(c,i),reliquat:R0(c,i),prix:l.prixCentimes}));
}
const R0=(c,i)=>['envoyee','partielle','validee','a_valider','brouillon'].includes(c.statut)?reliquat(c,i):0;
function mois12(aujourdhui){const [y,m]=aujourdhui.split('-').map(Number),out=[];for(let k=11;k>=0;k--){const d=new Date(Date.UTC(y,m-1-k,1));out.push(d.toISOString().slice(0,7))}return out}
function cadencier(articles,commandes,aujourdhui){
 const mois=mois12(aujourdhui),lignes=(articles||[]).map(a=>{const q=Object.fromEntries(mois.map(x=>[x,0]));for(const c of commandes||[]){if(c.statut==='annulee')continue;const k=String(c.creeLe||'').slice(0,7);if(!(k in q))continue;for(const l of c.lignes||[])if(l.articleId===a.id)q[k]+=Number(l.quantite)||0}const tot=Object.values(q).reduce((n,x)=>n+x,0);return {article:a,parMois:q,total:tot,moyenne:Math.round(tot/12*10)/10}}).filter(x=>x.total>0);
 return {mois,lignes};
}
function analyse(commandes){
 const C=(commandes||[]).filter(c=>c.statut!=='annulee'),par=(k)=>{const m=new Map();for(const c of C){const key=k(c);const v=m.get(key)||{n:0,montant:0,recu:0};v.n++;v.montant+=Number(c.total)||0;v.recu+=montantRecu(c);m.set(key,v)}return [...m.entries()].sort((a,b)=>b[1].montant-a[1].montant)};
 const delais=C.filter(c=>c.envoi?.at&&c.receptions?.length).map(c=>(Date.parse(c.receptions[0].at)-Date.parse(c.envoi.at))/864e5);
 return {parEtat:par(c=>libelleEtat(c)),parFournisseur:par(c=>c.fournisseur),parUf:par(c=>c.ufGestion||'PHARMA'),parMois:par(c=>String(c.creeLe||'').slice(0,7)).sort((a,b)=>a[0].localeCompare(b[0])),
  delaiMoyenJours:delais.length?Math.round(delais.reduce((n,x)=>n+x,0)/delais.length*10)/10:null,litiges:C.reduce((n,c)=>n+(c.receptions||[]).filter(r=>r.litige>0).length,0)};
}
// Inventaire : écart entre la quantité comptée et la quantité en stock d'un lot.
function ajusterInventaire(lots,lotId,compte,{at,par,motif}){
 const lot=(lots||[]).find(x=>x.id===lotId),q=entier(compte,0,1000000);
 if(!lot)return 'Lot introuvable.';if(q===null)return 'Quantité comptée entière requise.';
 const ecart=q-(Number(lot.quantity)||0);if(!ecart)return '';
 if(str(motif,300).length<5)return 'Motif de l’écart d’inventaire requis (casse, péremption, erreur de saisie…).';
 lot.quantity=q;lot.inventaires=[...(lot.inventaires||[]),{at,par,ecart,motif:str(motif,300)}];return '';
}

/* ---------- Numérotation ---------- */
const numero=(annee,n)=>'CMD-'+annee+'-'+String(n).padStart(4,'0');

return {UF,ADRESSES,TYPES,ETATS,ETATS_LIBELLES,libelleEtat,codeFournisseur,entete,lettresEtat,filtrer,trier,montantRecu,controlerLiquidation,suiviArticle,cadencier,mois12,analyse,ajusterInventaire,METIERS_SERVICE,voitCommandes,SERVICES,STATUTS_DEMANDE,DEMANDES_EN_COURS,serviceParDefaut,controlerDemande,demandeSensible,refusDemande,lotsDisponibles,controlerDelivrance,appliquerSorties,sortiesHorsStock,numeroDemande,STATUTS,EN_COURS,MODES_ENVOI,PROFILS,MAX_LIGNES,PEREMPTION_COURTE,fold,profil,normaliserArticle,validerArticle,ligneDepuisArticle,normaliserLignes,total,euros,controlerCommande,refus,stockArticle,recuConforme,reliquat,enCoursArticle,propositions,groupesProposition,controlerReception,statutApresReception,lotPourStock,integrerAuStock,receptionsHorsStock,numero,ajouterJours};
});

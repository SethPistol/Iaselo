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
function profil(c){
 if(!c)return null;
 if(c.job==='pharmacien')return c.poste==='preparateur'?'preparateur':'pharmacien';
 if(c.isAdmin)return 'lecteur';
 return null;
}

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
 if(p==='lecteur')return action==='lire'?'':'Lecture seule : les commandes sont passées par la pharmacie.';
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

/* ---------- Numérotation ---------- */
const numero=(annee,n)=>'CMD-'+annee+'-'+String(n).padStart(4,'0');

return {STATUTS,EN_COURS,MODES_ENVOI,PROFILS,MAX_LIGNES,PEREMPTION_COURTE,fold,profil,normaliserArticle,validerArticle,ligneDepuisArticle,normaliserLignes,total,euros,controlerCommande,refus,stockArticle,recuConforme,reliquat,enCoursArticle,propositions,groupesProposition,controlerReception,statutApresReception,lotPourStock,integrerAuStock,receptionsHorsStock,numero,ajouterJours};
});

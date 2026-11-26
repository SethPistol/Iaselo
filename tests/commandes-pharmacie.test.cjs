'use strict';
// Commandes de la pharmacie : droits par profil et par état, stupéfiants, propositions, réception, entrée en stock.
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../dist/commandes-pharmacie-regles.js');
const A=[{id:'a1',nom:'Paracétamol 10 mg/ml perfusion',fournisseur:'Labo A',prixCentimes:120,stockMin:5,stockMax:20,unite:'flacon',actif:true},
 {id:'a2',nom:'Morphine 10 mg/ml ampoule',fournisseur:'Labo B',prixCentimes:80,stockMin:2,stockMax:10,unite:'ampoule',stupefiant:true,actif:true},
 {id:'a3',nom:'Insuline rapide',fournisseur:'Labo A',prixCentimes:900,stockMin:1,stockMax:4,unite:'stylo',froid:true,actif:true},
 {id:'a4',nom:'Ancien produit',fournisseur:'Labo A',prixCentimes:100,stockMin:1,stockMax:2,actif:false}];

test('profils : pharmacien, préparateur, lecture pour l’administrateur, refus pour les autres',()=>{
 assert.equal(R.profil({job:'pharmacien',poste:'pharmacien'}),'pharmacien');
 assert.equal(R.profil({job:'pharmacien',poste:''}),'pharmacien');
 assert.equal(R.profil({job:'pharmacien',poste:'preparateur'}),'preparateur');
 assert.equal(R.profil({job:'dim',isAdmin:true}),'lecteur');
 assert.equal(R.profil({job:'anesthesiste',isAdmin:true}),'service');assert.ok(R.voitCommandes({job:'anesthesiste',isAdmin:true}));
 assert.equal(R.profil({job:'infirmier',poste:'cadre'}),'service');assert.equal(R.voitCommandes({job:'infirmier'}),false);
 assert.equal(R.profil({job:'secretariat'}),null);
 assert.match(R.refus('creer','service'),/passées par la pharmacie/);
 assert.match(R.refus('lire',null),/pharmacien et au préparateur/);
 assert.equal(R.refus('lire','lecteur'),'');assert.match(R.refus('creer','lecteur'),/lecture seule/);
});

test('circuit : le préparateur prépare et soumet, seul le pharmacien valide, renvoie, rouvre, solde',()=>{
 const c=st=>({statut:st,lignes:[],creePar:'u-prep'});
 assert.equal(R.refus('creer','preparateur'),'');
 assert.equal(R.refus('soumettre','preparateur',c('brouillon')),'');
 assert.match(R.refus('valider','preparateur',c('a_valider')),/Seul le pharmacien/);
 assert.equal(R.refus('valider','pharmacien',c('a_valider')),'');
 assert.equal(R.refus('valider','pharmacien',c('brouillon')),'','le pharmacien valide directement sa commande');
 assert.match(R.refus('valider','pharmacien',c('envoyee')),/déjà validée/);
 assert.match(R.refus('modifier','preparateur',c('validee')),/brouillon/);
 assert.match(R.refus('renvoyer','preparateur',c('a_valider')),/Seul le pharmacien/);
 assert.equal(R.refus('envoyer','preparateur',c('validee')),'');assert.match(R.refus('envoyer','preparateur',c('a_valider')),/validée par le pharmacien/);
 assert.match(R.refus('rouvrir','pharmacien',c('envoyee')),/ne se rouvre plus/);
 assert.equal(R.refus('annuler','preparateur',c('brouillon'),'u-prep'),'');
 assert.match(R.refus('annuler','preparateur',c('brouillon'),'u-autre'),/ses propres commandes/);
 assert.match(R.refus('annuler','preparateur',c('validee'),'u-prep'),/seul le pharmacien/);
 assert.match(R.refus('annuler','pharmacien',c('partielle')),/soldez/);
 assert.match(R.refus('solder','preparateur',c('partielle')),/Seul le pharmacien/);
 assert.match(R.refus('articles','preparateur'),/tenu par le pharmacien/);
});

test('stupéfiants : bon dédié, numéro exigé à la validation, réception par le pharmacien',()=>{
 const l=R.normaliserLignes([{articleId:'a1',quantite:3},{articleId:'a2',quantite:2},{articleId:'a1',quantite:1}],A);
 assert.deepEqual(l.errors,[]);assert.equal(l.lignes.length,2);assert.equal(l.lignes[0].quantite,4,'doublon fusionné');
 assert.match(R.controlerCommande({fournisseur:'Labo',lignes:l.lignes}).errors.join(' '),/bon de commande dédié/);
 const stup={fournisseur:'Labo B',lignes:R.normaliserLignes([{articleId:'a2',quantite:5}],A).lignes};
 assert.ok(R.controlerCommande(stup).ok);
 assert.match(R.controlerCommande(stup,{validation:true}).errors.join(' '),/numéro du bon/);
 assert.ok(R.controlerCommande({...stup,bonStupefiants:'ST-2026-41'},{validation:true}).ok);
 assert.match(R.refus('receptionner','preparateur',{...stup,statut:'envoyee'}),/registre des stupéfiants/);
 assert.equal(R.refus('receptionner','pharmacien',{...stup,statut:'envoyee'}),'');
 assert.match(R.normaliserLignes([{articleId:'a4',quantite:1}],A).errors[0],/retiré du livret/);
 assert.match(R.normaliserLignes([{articleId:'a1',quantite:0}],A).errors[0],/quantité entière positive/);
 assert.equal(R.total(l.lignes),4*120+2*80);
});

test('livret : validation d’un produit',()=>{
 assert.ok(R.validerArticle({nom:'Céfazoline 2 g',fournisseur:'Labo C',prix:'3,45',stockMin:5,stockMax:30,code:'3400930000000'}).ok);
 assert.equal(R.validerArticle({nom:'Céfazoline 2 g',fournisseur:'Labo C',prix:'3,45',stockMin:5,stockMax:30}).article.prixCentimes,345);
 const v=R.validerArticle({nom:'X',fournisseur:'',prix:'',stockMin:5,stockMax:2,code:'12'});
 assert.equal(v.ok,false);assert.equal(v.errors.length,5);
});

test('propositions : stock sous le seuil, commandes en cours déduites, lots bloqués ou périmés exclus',()=>{
 const lots=[{articleId:'a1',quantity:3,expiry:'2027-06-01'},{drug:'paracetamol 10 mg/ml perfusion',quantity:50,expiry:'2026-01-01'},{articleId:'a1',quantity:40,blocked:true,expiry:'2027-06-01'},{articleId:'a3',quantity:4,expiry:'2027-01-01'}];
 assert.equal(R.stockArticle(A[0],lots,'2026-11-26'),3);
 let p=R.propositions(A,lots,[],'2026-11-26');
 assert.deepEqual(p.map(x=>[x.article.id,x.proposee]),[['a1',17],['a2',10]]);
 const enCours=[{statut:'envoyee',lignes:[{articleId:'a1',quantite:10}],receptions:[{ligne:0,conforme:4}]}];
 assert.equal(R.enCoursArticle(A[0],enCours),6);
 p=R.propositions(A,lots,enCours,'2026-11-26');assert.equal(p.find(x=>x.article.id==='a1')?.proposee,undefined,'3 + 6 en cours > seuil 5 : pas de proposition');
 const g=R.groupesProposition(R.propositions(A,[],[],'2026-11-26'));
 assert.deepEqual(g.map(x=>[x.fournisseur,x.stupefiants,x.lignes.length]),[['Labo A',false,2],['Labo B',true,1]]);
});

test('réception : quantités, lot, péremption, chaîne du froid, litige, reliquat',()=>{
 const cmd={statut:'envoyee',lignes:R.normaliserLignes([{articleId:'a1',quantite:10},{articleId:'a3',quantite:2}],A).lignes,receptions:[]};
 const j='2026-11-26';
 assert.match(R.controlerReception(cmd,[{ligne:0,quantite:12,lot:'L1',peremption:'2027-12-01'}],j).errors[0],/12 livré/);
 assert.match(R.controlerReception(cmd,[{ligne:0,quantite:5}],j).errors.join(' '),/lot requis.*péremption requise/);
 assert.match(R.controlerReception(cmd,[{ligne:0,quantite:5,lot:'L1',peremption:'2026-11-20'}],j).errors[0],/périmé/);
 assert.match(R.controlerReception(cmd,[{ligne:0,quantite:5,lot:'L1',peremption:'2027-01-15'}],j).errors[0],/moins de 90 jours/);
 assert.ok(R.controlerReception(cmd,[{ligne:0,quantite:5,lot:'L1',peremption:'2027-01-15',peremptionCourteAcceptee:true,motif:'Rupture nationale, usage rapide'}],j).ok);
 assert.match(R.controlerReception(cmd,[{ligne:0,quantite:5,conforme:4,lot:'L1',peremption:'2027-12-01'}],j).errors[0],/motif du litige/);
 // Froid non confirmé : rien en stock, litige motivé.
 let r=R.controlerReception(cmd,[{ligne:1,quantite:2,lot:'I9',peremption:'2027-12-01',motif:'Indicateur de température viré'}],j);
 assert.ok(r.ok);assert.equal(r.lignes[0].conforme,0);assert.equal(r.lignes[0].litige,2);assert.match(r.avertissements[0],/chaîne du froid/);
 // Réception partielle puis complète.
 r=R.controlerReception(cmd,[{ligne:0,quantite:6,lot:'L1',peremption:'2027-12-01'},{ligne:1,quantite:2,froidOk:true,lot:'I9',peremption:'2027-12-01'}],j);assert.ok(r.ok,r.errors.join(' '));
 cmd.receptions.push(...r.lignes.map((x,i)=>({...x,id:'r'+i})));
 assert.equal(R.statutApresReception(cmd),'partielle');assert.equal(R.reliquat(cmd,0),4);
 cmd.receptions.push({ligne:0,quantite:4,conforme:4,id:'r9',lot:'L2',peremption:'2028-01-01'});
 assert.equal(R.statutApresReception(cmd),'recue');
 assert.match(R.controlerReception(cmd,[{ligne:0,quantite:0}],j).errors[0],/Aucune quantité/);
});

test('entrée en stock : lot créé, même lot fusionné, réception jamais comptée deux fois',()=>{
 const cmd={numero:'CMD-2026-0001',lignes:R.normaliserLignes([{articleId:'a1',quantite:10}],A).lignes};
 const lots=[];
 R.integrerAuStock(lots,R.lotPourStock(cmd,{id:'r1',ligne:0,lot:'L1',peremption:'2027-12-01',conforme:6},A[0]),'LOT-1');
 assert.deepEqual([lots.length,lots[0].quantity,lots[0].threshold,lots[0].commande],[1,6,5,'CMD-2026-0001']);
 R.integrerAuStock(lots,R.lotPourStock(cmd,{id:'r2',ligne:0,lot:'L1',peremption:'2027-12-01',conforme:4},A[0]),'LOT-2');
 assert.equal(lots.length,1);assert.equal(lots[0].quantity,10);
 R.integrerAuStock(lots,R.lotPourStock(cmd,{id:'r2',ligne:0,lot:'L1',peremption:'2027-12-01',conforme:4},A[0]),'LOT-3');
 assert.equal(lots[0].quantity,10,'idempotent');
 const c={...cmd,receptions:[{id:'r1',conforme:6},{id:'r2',conforme:4},{id:'r3',conforme:2},{id:'r4',conforme:0}]};
 assert.deepEqual(R.receptionsHorsStock([c],lots).map(x=>x.reception.id),['r3']);
 assert.equal(R.numero('2026',7),'CMD-2026-0007');
});

test('demandes des services : droits, stupéfiant par un médecin, hors livret justifié',()=>{
 let v=R.controlerDemande({service:'bloc',lignes:[{articleId:'a1',quantite:2},{articleId:'a1',quantite:1},{articleId:'a2',quantite:1}]},A);
 assert.match(v.errors.join(' '),/stupéfiant est demandé par un médecin/);
 v=R.controlerDemande({service:'bloc',lignes:[{articleId:'a1',quantite:2},{articleId:'a1',quantite:1},{articleId:'a2',quantite:1}]},A,{medecin:true});
 assert.ok(v.ok);assert.equal(v.demande.lignes[0].quantite,3);
 assert.match(R.controlerDemande({service:'x',lignes:[]},A).errors.join(' '),/Service demandeur/);
 assert.match(R.controlerDemande({service:'sspi',lignes:[{horsLivret:true,nom:'Dantrolène',quantite:1}]},A).errors[0],/justification/);
 assert.ok(R.controlerDemande({service:'sspi',lignes:[{horsLivret:true,nom:'Dantrolène',quantite:1,justification:'Chariot hyperthermie maligne'}]},A).ok);
 assert.equal(R.serviceParDefaut({job:'infirmier',poste:'etage'}),'hospitalisation');assert.equal(R.serviceParDefaut({job:'infirmier',poste:'bloc'}),'bloc');
 const d={statut:'demandee',lignes:[{articleId:'a1'}]},ds={statut:'demandee',lignes:[{articleId:'a2',stupefiant:true}]};
 assert.equal(R.refusDemande('demander','service'),'');assert.match(R.refusDemande('demander','preparateur'),/service/);
 assert.equal(R.refusDemande('annuler','service',d),'');assert.match(R.refusDemande('annuler','service',{...d,statut:'en_preparation'}),/prise en charge/);
 assert.equal(R.refusDemande('delivrer','preparateur',d),'');assert.match(R.refusDemande('delivrer','preparateur',ds),/pharmacien/);
 assert.equal(R.refusDemande('delivrer','pharmacien',ds),'');
 assert.match(R.refusDemande('refuser','preparateur',d),/Seul le pharmacien/);
 assert.equal(R.refusDemande('accuser','service',{statut:'delivree'}),'');assert.match(R.refusDemande('accuser','pharmacien',{statut:'delivree'}),/service/);
 assert.match(R.refusDemande('lire',null),/réservées/);
});

test('délivrance : lots du produit, stock suffisant, premier périmé, motif si partielle, sortie idempotente',()=>{
 const lots=[{id:'L1',articleId:'a1',batch:'B1',expiry:'2027-01-01',quantity:2},{id:'L2',articleId:'a1',batch:'B2',expiry:'2028-01-01',quantity:10},{id:'L3',articleId:'a1',batch:'B3',expiry:'2026-01-01',quantity:5},{id:'L4',articleId:'a3',batch:'I',expiry:'2028-01-01',quantity:5}];
 const d={lignes:[{articleId:'a1',nom:A[0].nom,quantite:5}]},j='2026-11-26';
 assert.deepEqual(R.lotsDisponibles(d.lignes[0],lots,j,A).map(x=>x.id),['L1','L2'],'périmé exclu, FEFO');
 assert.match(R.controlerDelivrance(d,[{ligne:0,sorties:[{lotId:'L4',quantite:1}]}],lots,j,A).errors[0],/autre produit/);
 assert.match(R.controlerDelivrance(d,[{ligne:0,sorties:[{lotId:'L1',quantite:3}]}],lots,j,A).errors[0],/2 en stock/);
 assert.match(R.controlerDelivrance(d,[{ligne:0,sorties:[{lotId:'L2',quantite:3}]}],lots,j,A).errors[0],/motif requis/);
 let r=R.controlerDelivrance(d,[{ligne:0,sorties:[{lotId:'L2',quantite:3}],motif:'Rupture, commande en cours'}],lots,j,A);
 assert.ok(r.ok);assert.match(r.avertissements[0],/B1 périme en premier/);
 r=R.controlerDelivrance(d,[{ligne:0,sorties:[{lotId:'L1',quantite:2},{lotId:'L2',quantite:3}]}],lots,j,A);assert.ok(r.ok);assert.equal(r.avertissements.length,0);
 assert.equal(R.appliquerSorties(lots,'D1',r.lignes),2);assert.equal(lots[0].quantity,0);assert.equal(lots[1].quantity,7);
 assert.equal(R.appliquerSorties(lots,'D1',r.lignes),0,'idempotent');assert.equal(lots[1].quantity,7);
 const dem=[{delivrance:{id:'D1',lignes:r.lignes}},{delivrance:{id:'D2',lignes:[{ligne:0,sorties:[{lotId:'L2',quantite:1}]}]}}];
 assert.equal(R.sortiesHorsStock(dem,lots).length,1);
 assert.match(R.controlerDelivrance(d,[],lots,j,A).errors[0],/motif requis/);
});

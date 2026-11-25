// Suite autonome : tarifs GHS, répartition entre débiteurs, factures, balance âgée, relances, export comptable,
// contrôles du DIM et fichier RSS (RUM) au format ATIH.
const {test}=require('node:test');const assert=require('node:assert/strict');
const G=require('../dist/gestion-financiere-regles.js');

test('tarifs GHS : import et journées au-delà de la borne haute',()=>{
 const r=G.lireTarifs('GHS;Tarif;BB;BH;EXH\n821;4 100,00;2;12;210,50\n0822\t5000\t\t\t\nabc;1\n');
 assert.equal(r.nombre,2);assert.equal(r.erreurs.length,1);assert.deepEqual(r.tarifs['0821'],{tarif:4100,bb:2,bh:12,exh:210.5});
 assert.deepEqual(G.tarifSejour(r.tarifs,'821',15),{tarif:4100,exhJours:3,exhTarif:210.5,bb:2,bh:12,basse:false});
 assert.equal(G.tarifSejour(r.tarifs,'0821',1).basse,true);assert.equal(G.tarifSejour(r.tarifs,'9999',3),null);
});

test('répartition AMO / complémentaire / patient',()=>{
 const pf={amo:5016,participation:24,forfaitJournalier:80,chambre:270,depassements:150};
 const sans=G.repartition(pf,{amc:'non'},{});assert.deepEqual([sans.amo,sans.amc,sans.patient],[5016,0,374]);
 const roc=G.repartition(pf,{amc:'oui',roc:{reference:'R1'}},{chambreNuits:'3',amcChambreParNuit:'60'});
 assert.deepEqual([roc.amc,roc.patient,roc.depassementsPraticiens],[284,90,150]);
});

test('factures : numérotation, solde, état, balance âgée, relances, export',()=>{
 assert.equal(G.numero('facture',2026,12),'F2026-000012');assert.equal(G.numero('avoir',2026,1),'A2026-000001');
 const now=new Date('2026-12-31T12:00:00Z');
 const f1={numero:'F2026-000001',debiteur:'patient',montant:100,emise:'2026-11-20T10:00:00Z',reglements:[{montant:40,mode:'carte',le:'2026-11-21T10:00:00Z'}]};
 const f2={numero:'F2026-000002',debiteur:'amo',montant:500,emise:'2026-09-01T10:00:00Z',reglements:[]};
 assert.equal(G.solde(f1),60);assert.equal(G.etatFacture(f1),'partielle');assert.equal(G.etatFacture({...f2,rejet:{}}),'rejetee');
 const b=G.balanceAgee([f1,f2],now);assert.equal(b.tranches['31-60'],60);assert.equal(b.tranches['plus de 90'],500);assert.equal(b.total,560);
 assert.equal(G.relanceDue(f1,now).libelle,'Première relance');assert.equal(G.relanceDue({...f1,relances:[{},{},{}]},now),null);assert.equal(G.relanceDue(f2,now),null,'pas de relance pour l’Assurance maladie');
 const csv=G.exportComptable([f1,{...f2,type:'avoir',numero:'A2026-000001'}]);
 assert.match(csv,/^journal;date;piece;compte;libelle;debit;credit/);assert.match(csv,/VT;2026-11-20;F2026-000001;4113;.*;100,00;/);assert.match(csv,/BQ;2026-11-21;F2026-000001;512;.*;40,00;/);assert.match(csv,/VT;2026-09-01;A2026-000001;706;.*;500,00;/);
});

test('DIM : cohérence âge, sexe, diagnostic et tableau du mois',()=>{
 assert.equal(G.coherenceDiagnostics(['O80','C61'],{sexe:'Masculin',naissance:'1950-01-01',entree:'2026-11-20'}).length,2,'O80 : sexe et âge ; C61 cohérent');
 assert.equal(G.coherenceDiagnostics(['N40'],{sexe:'Féminin'}).length,1);
 assert.equal(G.coherenceDiagnostics(['O80'],{sexe:'Féminin',naissance:'1950-01-01',entree:'2026-11-20'}).length,1,'grossesse à 76 ans');
 assert.equal(G.coherenceDiagnostics(['M16.1'],{sexe:'Féminin',naissance:'1950-01-01',entree:'2026-11-20'}).length,0);
 const tb=G.tableauDim([{sortie:'2026-11-10',valide:true,valideLe:'2026-11-14T10:00:00Z',envoye:true},{sortie:'2026-11-20',valide:false},{sortie:'2026-10-02',valide:true}],'2026-11');
 assert.deepEqual(tb,{sortis:2,valides:1,envoyes:1,aCoder:1,exhaustivite:50,delaiMoyen:4});
});

test('RSS : RUM au format ATIH, relu champ par champ',()=>{
 const l=G.rum({finess:'750000000',numeroRss:'7',numeroAdministratif:'NDA1',identite:{birthDate:'1985-02-14',sex:'Féminin'},pmsi:{entree:'2026-11-20',sortie:'2026-11-23',modeEntree:'8',modeSortie:'7',destination:'2',dp:'M16.1',dr:'',das:['I10','E66.0']},
  actes:[{code:'NEKA020',activite:'1',phase:'0',date:'2026-11-20'},{code:'NEKA020',activite:'4',phase:'0',extension:'2',date:'2026-11-20',modificateurs:'J'}],codePostal:'75016'});
 const r=G.lireRum(l);
 assert.equal(r.longueur,r.attendue);assert.equal(r.longueur,177+16+58);
 assert.deepEqual([r.finess,r.format,r.rss,r.administratif,r.naissance,r.sexe,r.entree,r.modeEntree,r.sortie,r.modeSortie,r.destination,r.codePostal,r.dp],['750000000','018','7','NDA1','14021985','2','20112026','8','23112026','7','2','75016','M161']);
 assert.deepEqual(r.da,['I10','E660']);assert.deepEqual(r.actes.map(a=>[a.code,a.activite,a.extension,a.modificateurs,a.realisations]),[['NEKA020','1','','',1],['NEKA020','4','2','J',1]]);
 assert.throws(()=>G.rum({finess:'750000000',identite:{birthDate:'1985-02-14',sex:'Féminin'},pmsi:{entree:'2026-11-20',sortie:'2026-11-23',dp:'M16.1'}}),/code postal/);
});

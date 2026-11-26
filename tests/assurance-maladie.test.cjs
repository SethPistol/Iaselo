// Règles de la transmission à l'Assurance maladie : NIR, contrôles de complétude, association CCAM, pré-facture.
const {test}=require('node:test');const assert=require('node:assert/strict');
const A=require('../dist/assurance-maladie-regles.js');
const H=require('../dist/interop-hl7.js');

test('NIR : format, clé, Corse, cohérence avec le patient',()=>{
 assert.equal(A.nir('2 85 02 75 123 456 72').ok,true);
 assert.equal(A.nir('285027512345673').ok,false,'clé fausse');
 assert.equal(A.nir('185022A12345682').ok,true,'Corse 2A');
 assert.equal(A.nir('12345').ok,false);
 assert.equal(A.nir('').vide,true);
 const r=A.nir('285027512345672',{sexe:'Masculin',naissance:'1990-01-01'});
 assert.equal(r.ok,true);assert.equal(r.alertes.length,2,'sexe et naissance différents : alertes (ayant droit possible)');
 assert.equal(A.nir('285027512345672',{sexe:'Féminin',naissance:'1985-02-14'}).alertes.length,0);
});

test('CIM-10 et LPP',()=>{
 assert.ok(A.cim10('M16.1'));assert.ok(A.cim10('E11'));assert.ok(A.cim10('m161'));assert.ok(!A.cim10('16.1'));
 assert.equal(A.normCim('m161'),'M16.1');assert.equal(A.normCim('I10'),'I10');
 assert.ok(A.lpp('3101234'));assert.ok(!A.lpp('31012'));
});

const droitsOk={nir:'285027512345672',qualite:'assure',regime:'general',caisse:'751',nature:'10',exoneration:'aucune',acquisition:'carte'};
const pmsiOk={entree:'2026-11-20',sortie:'2026-11-23',modeEntree:'8',modeSortie:'8',dp:'M16.1',das:['I10']};
const ctxOk={identite:{sex:'Féminin',birthDate:'1985-02-14'},insQualifiee:true,mode:'Hospitalisation',
 actes:[{code:'NEKA020',activite:'1',date:'2026-11-20',dim:true,tarif:470.0},{code:'NEKA020',activite:'4',date:'2026-11-20',dim:true,tarif:470.0,extension:'2'}],dmi:[],devis:[]};

test('contrôles : un dossier complet est prêt à facturer',()=>{
 const c=A.controler({droits:droitsOk,pmsi:pmsiOk,facture:{ghs:'1234',ghsTarif:'4200'}},ctxOk,new Date('2026-11-25'));
 assert.deepEqual(c.constats.filter(x=>x.niveau==='bloquant'),[]);
 assert.deepEqual(c.pret,{droits:true,pmsi:true,facture:true});
 assert.equal(A.etape({},c).cle,'pret');
});

test('contrôles : points bloquants attendus',()=>{
 const c=A.controler({droits:{...droitsOk,nature:'41',acquisition:'aucune'},pmsi:{...pmsiOk,modeSortie:'7',dp:''},facture:{}},
  {...ctxOk,actes:[{code:'NEKA020',activite:'4',date:'2026-12-01',dim:false,tarif:100}],dmi:[{gtin:'0'.repeat(14),enSus:true}],devis:[{depassement:150,statut:'envoye'}]},new Date('2026-11-25'));
 const m=c.constats.filter(x=>x.niveau==='bloquant').map(x=>x.message).join('\n');
 for(const attendu of [/date de l’accident/,/Droits non vérifiés/,/destination/,/Diagnostic principal/,/validation du médecin DIM/,/hors du séjour/,/extension documentaire/,/code LPP/,/lot ou numéro de série/,/GHS/,/devis signé/])assert.match(m,attendu);
 assert.equal(c.pret.droits,false);assert.equal(A.etape({},c).cle,'droits');
 const c2=A.controler({droits:{...droitsOk,exoneration:'c2s'},pmsi:pmsiOk,facture:{ghs:'1',ghsTarif:'10'}},{...ctxOk,devis:[{depassement:30,statut:'signe'}]});
 assert.match(c2.constats.map(x=>x.message).join(),/dépassements d’honoraires interdits/);
});

test('contrôles : délai de facturation d’un an',()=>{
 const c=A.controler({droits:droitsOk,pmsi:{...pmsiOk,entree:'2025-01-02',sortie:'2025-01-05'},facture:{ghs:'1',ghsTarif:'100'}},{...ctxOk,actes:ctxOk.actes.map(a=>({...a,date:'2025-01-02'}))},new Date('2026-11-25'));
 assert.match(c.constats.map(x=>x.message).join(),/prescrite/);
 assert.equal(A.delaiFacturation('2026-11-20',new Date('2026-11-25')).limite,'2027-11-20');
});

test('association CCAM : 100 %, 50 %, un seul acte d’anesthésie',()=>{
 const r=A.associer([{code:'AAAA001',activite:'1',tarif:100},{code:'BBBB001',activite:'1',tarif:300},{code:'CCCC001',activite:'1',tarif:50},{code:'BBBB001',activite:'4',tarif:200},{code:'AAAA001',activite:'4',tarif:80}]);
 const chir=r.filter(x=>x.activite==='1');assert.deepEqual(chir.map(x=>[x.code,x.association,x.montant]),[['BBBB001','1',300],['AAAA001','2',50],['CCCC001','',0]]);
 const anes=r.filter(x=>x.activite==='4');assert.deepEqual(anes.map(x=>x.montant),[200,0]);
});

test('pré-facture : PF 24 €, forfait journalier, ambulatoire, exonérations',()=>{
 const base={droits:droitsOk,pmsi:pmsiOk,facture:{ghs:'1234',ghsTarif:'4200',chambreNuits:'3',chambrePrix:'90'}};
 const p=A.preFacture(base,ctxOk);
 assert.equal(p.participation,24,'acte ≥ 120 € : participation forfaitaire');assert.equal(p.forfaitJournalier,80,'20 € × 4 jours');
 assert.equal(p.baseHonoraires,940);assert.equal(p.amo,4200+940-24);assert.equal(p.chambre,270);
 const amb=A.preFacture({...base,pmsi:{...pmsiOk,sortie:'2026-11-20'}},{...ctxOk,mode:'Ambulatoire'});assert.equal(amb.forfaitJournalier,0);
 const at=A.preFacture({...base,droits:{...droitsOk,nature:'41',exoneration:'atmp'}},ctxOk);assert.equal(at.participation,0);assert.equal(at.forfaitJournalier,0);
 const ald=A.preFacture({...base,droits:{...droitsOk,exoneration:'ald'}},ctxOk);assert.equal(ald.participation,0);assert.equal(ald.forfaitJournalier,80,'ALD : forfait journalier dû');
 // Acte < 120 € : ticket modérateur de 20 %, le forfait journalier s'impute dessus.
 const petit=A.preFacture({...base,facture:{ghs:'1',ghsTarif:'1000'}},{...ctxOk,actes:[{code:'AAAA001',activite:'1',date:'2026-11-20',dim:true,tarif:100}]});
 assert.equal(petit.participation,220);assert.equal(petit.forfaitJournalier,0);assert.match(petit.noteForfait,/imputé/);
 const lpp=A.preFacture(base,{...ctxOk,dmi:[{gtin:'1',enSus:true,lpp:'3101234',prix:'1500',lot:'L1'}]});assert.equal(lpp.baseSejour,5700);
});

test('HL7 BAR^P12 : diagnostics en DG1, actes en PR1 avec extension documentaire',()=>{
 const m=H.barPmsi({patient:{ipp:'IPP1',nom:'DUPONT',prenom:'Marie',naissance:'1985-02-14',sexe:'Féminin'},nda:'NDA1',entree:'2026-11-20',sortie:'2026-11-23',modeEntree:'8',modeSortie:'8',
  diagnostics:[{code:'M16.1',type:'DP'},{code:'I10',type:'DAS'}],actes:[{code:'NEKA020',activite:'4',phase:'0',extension:'2',date:'2026-11-20T08:30:00'}]});
 const seg=m.split('\r');assert.match(seg[0],/BAR\^P12/);assert.ok(seg.some(s=>/^DG1\|1\|\|M16\.1\^\^CIM10\|\|\|\|DP$/.test(s)));
 assert.ok(seg.some(s=>/^PR1\|1\|\|NEKA020\^\^CCAM\|4\^0\^\^2\|20261120/.test(s)),seg.join('\n'));
 assert.ok(seg.some(s=>s.startsWith('ZFM|8|8')));
});

test('facture : valeur de chaque acte et dépassements saisis sur les actes',()=>{
 const actes=[{cle:'a:1',code:'NEKA020',activite:'1',date:'2026-11-20',dim:true,tarif:470,association:'1',montantCodage:470,depassement:300},{cle:'a:4',code:'NEKA020',activite:'4',date:'2026-11-20',dim:true,tarif:200,association:'1',depassement:50,extension:'2'}];
 const ctx={...ctxOk,actes};
 const p=A.preFacture({droits:droitsOk,pmsi:pmsiOk,facture:{ghs:'1',ghsTarif:'100'}},ctx);
 assert.deepEqual(p.honoraires.map(h=>[h.code,h.montant,h.depassement,h.total]),[['NEKA020',470,300,770],['NEKA020',200,50,250]]);
 assert.equal(p.depassements,350);assert.equal(p.sourceDepassements,'actes');assert.equal(p.totalHonoraires,1020);
 // Devis non signé : 300 € (chirurgien) bloque ; 50 € (anesthésiste) n'atteint pas le seuil.
 let c=A.controler({droits:droitsOk,pmsi:pmsiOk,facture:{ghs:'1',ghsTarif:'100'}},ctx,new Date('2026-11-25'));
 assert.ok(c.constats.some(x=>/300 € \(chirurgien\) sans devis signé/.test(x.message)));assert.ok(!c.constats.some(x=>/anesthésiste\) sans devis/.test(x.message)));
 c=A.controler({droits:droitsOk,pmsi:pmsiOk,facture:{ghs:'1',ghsTarif:'100'}},{...ctx,devis:[{depassement:300,statut:'signe'}]},new Date('2026-11-25'));
 assert.ok(!c.constats.some(x=>/sans devis signé/.test(x.message)));
 c=A.controler({droits:{...droitsOk,exoneration:'c2s'},pmsi:pmsiOk,facture:{ghs:'1',ghsTarif:'100'}},{...ctx,devis:[{statut:'signe'}]},new Date('2026-11-25'));
 assert.ok(c.constats.some(x=>/C2S : dépassements d’honoraires interdits sur les actes/.test(x.message)));
 // Sans dépassement sur les actes : ceux des devis comptent.
 assert.equal(A.preFacture({droits:droitsOk,pmsi:pmsiOk,facture:{}},{...ctxOk,devis:[{depassement:80,statut:'signe'}]}).sourceDepassements,'devis');
});

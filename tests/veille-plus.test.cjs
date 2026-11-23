'use strict';
// Règles complémentaires de la veille : doses, bilans guidés, scores SSPI/sortie, échelles, CIM-10, GS1, indicateurs, RGPD.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/veille-plus-regles.js');

test('Poids de référence et doses au poids',()=>{
 const p=P.poids(104,176,'M');assert.equal(p.ideal,71.5);assert.ok(p.maigre>65&&p.maigre<75);
 const d=P.doses(104,176,'M').list,get=id=>d.find(x=>x.id===id);
 assert.equal(get('rocuronium').dose,'43 mg');assert.match(get('propofol').dose,/^1\d\d à 1\d\d mg$/);
 assert.equal(get('acidetranexamique').dose,'1000 mg');assert.equal(get('cefazoline').dose,'2 g');
 assert.match(P.doses(140,170,'F').list.find(x=>x.id==='cefazoline').dose,/^4 g/);
 assert.match(P.doses(45,155,'F').list.find(x=>x.id==='paracetamol').dose,/675 mg/);
 assert.deepEqual(P.doses('',170,'F').list,[]);
});

test('Bilans guidés : rien de systématique, examens motivés',()=>{
 assert.equal(P.bilansGuides({consult:{ext:{age:'30'}}}).none,true);
 const b=P.bilansGuides({consult:{treatments:'Eliquis, Lasilix',ext:{age:'70',surgicalBleedingRisk:'Élevé',transfusionLikelihood:'Possible'}},questionnaire:{answers:{diseases:['Diabète']}}}).list.map(x=>x.exam);
 for(const e of ['ECG','Hémoglobine (NFS)','Groupe sanguin et RAI','Créatinine et DFG','Kaliémie','Glycémie et HbA1c'])assert.ok(b.includes(e),e);
});

test('Aldrete et Chung : sortie si ≥ 9 sans item à 0',()=>{
 assert.equal(P.aldrete({activite:2,respiration:2,circulation:2,conscience:2,spo2:1}).sortie,true);
 assert.equal(P.aldrete({activite:2,respiration:2,circulation:2,conscience:2,spo2:0}).sortie,false);
 assert.equal(P.chung({constantes:2,marche:2,nvpo:2,douleur:2}).complete,false);
 assert.equal(P.chung({constantes:2,marche:2,nvpo:2,douleur:2,saignement:2}).total,10);
});

test('Braden et Morse',()=>{
 assert.equal(P.braden({perception:2,humidite:2,activite:2,mobilite:2,nutrition:2,friction:1}).level,'crit');
 assert.equal(P.braden({perception:4,humidite:4,activite:4,mobilite:4,nutrition:4,friction:3}).total,23);
 assert.equal(P.morse({chute:25,aide:30}).level,'crit');assert.equal(P.morse({}).level,'ok');
});

test('Diagnostics CIM-10 proposés et conciliation',()=>{
 const stay={consult:{history:'HTA, fibrillation auriculaire',ext:{weight:'104',height:'176'},treatments:'Eliquis'},questionnaire:{answers:{diseases:['Diabète','Apnée du sommeil'],treatments:'Eliquis, Doliprane'}}};
 assert.deepEqual(P.diagnosticsProposes(stay).map(x=>x.code).sort(),['E11','E66','G47.3','I10','I48']);
 const c=P.conciliation(stay);assert.equal(c.length,2);assert.equal(c[0].retrouveCpa,true);assert.equal(c[1].retrouveCpa,false);
});

test('Lecture GS1 des implants (clé GTIN vérifiée)',()=>{
 const g=P.lireGS1('(01)03760123456784(17)280630(10)LOT4521(21)SN0098');
 assert.deepEqual([g.gtin,g.peremption,g.lot,g.serie,g.valide],['03760123456784','2028-06-30','LOT4521','SN0098',true]);
 assert.equal(P.lireGS1('(01)03760123456782(10)X').valide,false);
 const brut=P.lireGS1('0103760123456784172806301012AB\u001d21SN1');assert.equal(brut.lot,'12AB');assert.equal(brut.serie,'SN1');
});

test('Indicateurs bloc et IQSS',()=>{
 const t=h=>new Date(Date.UTC(2026,10,22,h)).toISOString();
 const stays=[{id:'A',stage:'Sortie',blocStatut:{state:'sorti',history:[{to:'salle',at:t(8)},{to:'sspi',at:t(10)}]},discharge:{liaison:{document:{}}},consult:{validated:true},checklistBloc:{induction:{signedBy:'x'},incision:{signedBy:'x'},sortie:{signedBy:'x'}}},{id:'B',stage:'Consultation'}];
 const i=P.indicateursBloc(stays);assert.equal(i.minutes,120);assert.equal(i.occupation,20);
 const q=P.iqss(stays);assert.equal(q.find(x=>x.id==='lettre').pct,100);assert.equal(q.find(x=>x.id==='checklist').pct,100);assert.equal(q.find(x=>x.id==='douleur').pct,0);
});

test('Conservation, droits RGPD, pièces, reste à charge, relances',()=>{
 assert.equal(P.conservation('1980-01-01','2026-11-22').jusquau,'2046-11-22');
 assert.equal(P.conservation('2023-01-01','2026-11-22').jusquau,'2051-01-01');
 assert.equal(P.echeanceDroit('2026-11-22'),'2026-12-22');
 assert.equal(P.piecesAttendues({identity:{birthDate:'2015-01-01'}}).some(([k])=>k==='parentale'),true);
 assert.equal(P.resteACharge({nuits:3,prixChambre:120,priseEnChargeChambre:70,depassements:400,priseEnChargeDepassements:150}).total,480);
 assert.equal(P.resteACharge({nuits:0,ambulatoire:true}).total,0);
 assert.deepEqual(P.relances('2026-11-30').map(r=>r.date),['2026-11-23','2026-11-27']);
});

// Lecture d'ordonnance : découpage, rattachement à la BDPM, confiance, fusion sans écrasement.
const test=require('node:test');const assert=require('node:assert/strict');
const O=require('../dist/ordonnance-lecture-regles.js');
const BDPM=[
 {cis:'1',name:'KARDEGIC 75 mg, poudre pour solution buvable en sachet-dose',substances:['ACÉTYLSALICYLATE DE DL-LYSINE'],active:true},
 {cis:'2',name:'ELIQUIS 5 mg, comprimé pelliculé',substances:['APIXABAN'],active:true},
 {cis:'3',name:'ELIQUIS 2,5 mg, comprimé pelliculé',substances:['APIXABAN'],active:true},
 {cis:'4',name:'METFORMINE TEVA 1000 mg, comprimé pelliculé',substances:['CHLORHYDRATE DE METFORMINE'],active:true},
 {cis:'5',name:'DOLIPRANE 1000 mg, comprimé',substances:['PARACÉTAMOL'],active:true},
 {cis:'6',name:'DOLIPRANE 500 mg, gélule',substances:['PARACÉTAMOL'],active:true},
 {cis:'7',name:'LEVOTHYROX 75 microgrammes, comprimé sécable',substances:['LÉVOTHYROXINE SODIQUE'],active:true},
 {cis:'8',name:'LEVOTHYROX 25 microgrammes, comprimé sécable',substances:['LÉVOTHYROXINE SODIQUE'],active:true}
];
const ORDO=`Docteur Jean DUPONT
Médecine générale - RPPS 10101010101
12 rue de la Paix 75002 Paris
Tél. 01 23 45 67 89
Le 12/11/2026
Madame FICTIF Claire
KARDEGIC 75 mg, poudre en sachet
1 sachet le midi
ELIQUIS 5 mg cp
1 comprimé matin et soir
METF0RMINE 1000 mg comprimé
1 cp matin et soir
QSP 3 mois
D0LIPRANE 1 g
1 comprimé toutes les 6 h si besoin
LEVOTHYROX 75 ug
1 cp le matin à jeun
LEVOTHYROX 100 ug
XYZABRAND 10 mg`;

test('ordonnance : en-tête ignoré, médicaments et posologies regroupés, corrections OCR',()=>{
 const r=O.lire(ORDO,BDPM);
 assert.deepEqual(r.map(l=>l.nom),['KARDEGIC 75 mg','ELIQUIS 5 mg','METFORMINE 1000 mg','DOLIPRANE 1000 mg','LEVOTHYROX 75 microgrammes','LEVOTHYROX 100 ug','XYZABRAND']);
 assert.equal(r[0].posologie,'1 sachet le midi');assert.equal(r[2].posologie,'1 cp matin et soir ; QSP 3 mois');assert.match(r[2].duree,/QSP 3 mois/i);
 assert.equal(r[1].cis,'2','5 mg et pas 2,5 mg');
});
test('ordonnance : confiance vert (nom + dosage), orange (dosage absent de la base), rouge (inconnu) ; 1 g = 1000 mg, 75 µg = 75 microgrammes',()=>{
 const r=O.lire(ORDO,BDPM),c=Object.fromEntries(r.map(l=>[l.lu,l.confiance]));
 assert.equal(c['KARDEGIC 75 mg, poudre en sachet'],'vert');assert.equal(c['D0LIPRANE 1 g'.replace('0','O')],'vert');assert.equal(c['LEVOTHYROX 75 ug'],'vert');
 assert.equal(c['LEVOTHYROX 100 ug'],'orange');assert.equal(c['XYZABRAND 10 mg'],'rouge');
 assert.match(r.find(l=>l.lu==='LEVOTHYROX 100 ug').raison,/Dosage/);assert.equal(r.find(l=>l.lu==='LEVOTHYROX 100 ug').nom,'LEVOTHYROX 100 ug','le dosage lu est conservé');
});
test('ordonnance : nom mal lu rattaché par proximité, en orange',()=>{
 const r=O.lire('ELIQIS 5 mg\n1 cp matin et soir',BDPM);
 assert.equal(r[0].cis,'2');assert.equal(r[0].confiance,'orange');assert.match(r[0].raison,/approché/);
});
test('ordonnance : ajout au traitement habituel sans écraser ni doubler',()=>{
 const f=O.fusionnerTexte('ELIQUIS 5 mg — 1 matin et soir\nBisoprolol 5 mg',[{nom:'ELIQUIS 5 mg',dose:'5 mg',posologie:'x2'},{nom:'KARDEGIC 75 mg',dose:'75 mg',posologie:'1 sachet le midi'}]);
 assert.equal(f.ajoutees,1);assert.equal(f.texte,'ELIQUIS 5 mg — 1 matin et soir\nBisoprolol 5 mg\nKARDEGIC 75 mg 75 mg — 1 sachet le midi'.replace('KARDEGIC 75 mg 75 mg','KARDEGIC 75 mg 75 mg'));
 assert.equal(O.fusionnerTexte('Aucun',[{nom:'DOLIPRANE',dose:'1 g',posologie:''}]).texte,'DOLIPRANE 1 g');
});

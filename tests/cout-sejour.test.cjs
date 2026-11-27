// Coût par séjour (4e veille, lot F) : coûts unitaires, durées réelles ou programmées, recette du GHS. Données fictives.
const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../dist/cout-sejour-regles.js');
test('coût : bloc réel (déroulement), SSPI, nuits, consommables',()=>{
 const res=[{kind:'room',start:'2026-11-26T08:00',end:'2026-11-26T09:00',etapes:{entree:'2026-11-26T08:10',sortie:'2026-11-26T09:40'}},{kind:'recovery',start:'2026-11-26T09:45',end:'2026-11-26T10:45'},{kind:'bed',start:'2026-11-26T07:00',end:'2026-11-29T11:00'},{kind:'room',state:'Annulée',start:'2026-11-27T08:00',end:'2026-11-27T12:00'}];
 const c=C.cout({core:{mode:'Hospitalisation'},reservations:res});
 assert.equal(c.minutesBloc,90);assert.equal(c.minutesSspi,60);assert.equal(c.nuits,3);
 assert.deepEqual(c.postes,{bloc:1080,sspi:150,hebergement:1140,consommables:150});assert.equal(c.total,2520);assert.deepEqual(c.estimes,[]);
});
test('réservation du programme : SSPI et lit rattachés à l’intervention',()=>{
 const r={id:'X',patient:'S',resource:'demo-salle-1',vacationId:'VAC-1',start:'2026-11-27T08:00',end:'2026-11-27T10:15',recovery:{start:'2026-11-27T10:00',end:'2026-11-27T11:30'},bed:{start:'2026-11-27T11:30',end:'2026-11-30T12:00'},etapes:{entree:'2026-11-27T08:06',sortie:'2026-11-27T10:06',sortieBloc:'2026-11-27T11:31'}};
 const c=C.cout({core:{mode:'Hospitalisation'},reservations:[r]});assert.equal(c.minutesBloc,120);assert.equal(c.minutesSspi,85);assert.equal(c.nuits,3);assert.deepEqual(c.estimes,[]);
 const prevu=C.cout({core:{mode:'Hospitalisation'},reservations:[{...r,etapes:{}}]});assert.equal(prevu.minutesSspi,90);assert.ok(prevu.estimes.includes('SSPI : durée prévue'));
});
test('ambulatoire, durée programmée et SSPI par défaut signalées comme estimations',()=>{
 const c=C.cout({core:{mode:'Ambulatoire'},reservations:[{sector:'bloc-1',start:'2026-11-26T08:00',end:'2026-11-26T08:45'}]},{minuteBloc:10});
 assert.equal(c.postes.bloc,450);assert.equal(c.postes.hebergement,220);assert.equal(c.minutesSspi,60);assert.equal(c.estimes.length,2);
});
test('recette du GHS, résultat, synthèse et réglages bornés',()=>{
 const l=C.ligne({core:{mode:'Ambulatoire'},reservations:[{kind:'room',start:'2026-11-26T08:00',end:'2026-11-26T09:00'}],dossier:{facture:{ghs:'1234',ghsTarif:'1500'},pmsi:{entree:'2026-11-26',sortie:'2026-11-26'}}});
 assert.ok(l.recette>=1500);assert.equal(l.resultat,Math.round((l.recette-l.total)*100)/100);
 const sans=C.ligne({core:{},reservations:[]});assert.equal(sans.recette,null);assert.match(sans.recetteSource,/GHS à saisir/);
 const s=C.synthese([l,sans]);assert.equal(s.sejours,2);assert.equal(s.sansRecette,1);
 assert.ok(!C.validerReglages({minuteBloc:500}).ok);assert.equal(C.validerReglages({minuteBloc:'14,5'}).reglages.minuteBloc,14.5);
});

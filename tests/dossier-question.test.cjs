// Interroger le dossier + relève automatique (5e veille, lot 2) : réponses sourcées, SBAR daté, aucune donnée inventée.
process.env.TZ='Europe/Paris';
const test=require('node:test');const assert=require('node:assert/strict');
const Q=require('../dist/dossier-question-regles.js'),R=require('../dist/releve-auto-regles.js');
const stay=()=>({id:'DÉMO-002',specialty:'Chirurgie digestive',stage:'Hospitalisation',identity:{lastName:'Lefèvre',firstName:'Élodie',birthDate:'1975-09-23'},
 consult:{asa:'2',history:'HTA, SAOS appareillé',allergies:'Pénicilline (urticaire)',treatments:'Ramipril 5 mg',cpa:{libelle:'Cholécystectomie cœlioscopique',poids:'82',taille:'170',atb:['Céfazoline 2 g']}},
 perop:{records:[{kind:'Médicament',at:'2026-11-27T09:10',values:{drug:'Céfazoline',amount:'2',unit:'g'}}]},
 postopVitals:[{at:'2026-11-28T02:00',values:{sbp:'130',dbp:'80',hr:'88',temp:'37.9',pain:'5',spo2:'95',rr:'18'}},{at:'2026-11-28T06:00',values:{sbp:'125',dbp:'78',hr:'92',temp:'38.6',pain:'3',spo2:'94',rr:'20'}},{at:'2026-11-28T07:00',voided:true,values:{temp:'41'}}],
 rx:[{name:'DOLIPRANE 1000 mg',validated:true,instructions:'DOLIPRANE 1 g 4x/j',posologie:{medicament:'DOLIPRANE 1000 mg, comprimé',dose:1,unite:'g',voie:'Orale',frequence:'4x',horaires:[],debut:'2026-11-28T05:00'},executions:[{at:'2026-11-28T06:05',status:'Réalisée',author:'IDE nuit',dose:'1 g',route:'Orale'}]}],
 nursingRecord:[{kind:'transmission',occurredAt:'2026-11-28T03:00',authorLabel:'IDE nuit',format:'Libre',observations:'Nausées, ondansétron donné.'}],sortiePlus:{chambre:'112',sortiePrevue:'2026-11-29T11:00'}});
const now=new Date('2026-11-28T08:00');
const rep=q=>Q.repondre(q,stay(),{maintenant:now});
test('intentions et réponses sourcées',()=>{
 assert.equal(rep('Allergies ?').reponse,'Pénicilline (urticaire)');
 const d=rep('Dernière dose de paracétamol');assert.equal(d.intention,'derniereDose');assert.match(d.reponse,/6 h 05 par IDE nuit/);assert.equal(d.elements[0].sourceLib,'Prescriptions');assert.equal(d.elements[0].onglet,'rx');
 const t=rep('température');assert.match(t.reponse,/38\.6 °C/);assert.doesNotMatch(t.reponse,/41/,'relevé annulé ignoré');assert.match(t.reponse,/maximum 38\.6/);
 assert.match(rep('Douleur sur 24 h').reponse,/minimum 3\/10, maximum 5\/10/);
 assert.match(rep('Antibioprophylaxie').reponse,/Céfazoline 2 g \(27\/11 9 h 10\)/);
 assert.match(rep('poids').reponse,/IMC : 28\.4/);
 assert.match(rep('Sortie prévue').reponse,/29\/11 11 h 00/);
 assert.match(rep('Transmissions de la nuit').reponse,/1 transmission/);
 const r=rep('ondansétron');assert.equal(r.intention,'recherche');assert.equal(r.elements[0].source,'nursingRecord');
 assert.match(rep('xylophone').reponse,/Aucun élément/);
});
test('allergies non vérifiées et dossier vide',()=>{
 const s=stay();s.consult.allergies='À vérifier';assert.match(Q.repondre('allergie',s,{maintenant:now}).reponse,/non vérifiées/);
 assert.match(Q.repondre('dernière dose de morphine',{id:'X'},{maintenant:now}).reponse,/Aucune administration/);
 assert.match(Q.repondre('température',{id:'X'},{maintenant:now}).reponse,/Aucune valeur/);
});
test('relève SBAR sur le poste',()=>{
 const r=R.sbar(stay(),{maintenant:now,heures:12});
 assert.match(r.S,/^LEFÈVRE Élodie, 51 ans, chambre 112, Cholécystectomie cœlioscopique · J1/);
 assert.match(r.B.join(' '),/Pénicilline/);assert.match(r.B.join(' '),/Ramipril/);
 const a=r.A.join(' ');assert.match(a,/Température en hausse sur le poste \(37\.9 → 38\.6 °C\)/);assert.match(a,/DOLIPRANE 1000 mg, comprimé \(6 h 05\)/);assert.match(a,/ondansétron donné\./);
 assert.match(r.R.join(' '),/Prochaines doses : 12 h 00 DOLIPRANE/);assert.match(r.R.join(' '),/Sortie prévue le 29\/11 11 h 00/);
 assert.ok(r.alertes.includes('Fièvre à 38.6 °C'));assert.ok(!r.alertes.some(x=>/retard/.test(x)),'la dose de 6 h est rattachée à la saisie de 6 h 05');
 assert.match(r.texte,/^S · .*\nB · .*\nA · .*\nR · /);
 const v=R.sbar({id:'Y',consult:{allergies:'À vérifier'}},{maintenant:now});assert.ok(v.alertes.includes('Allergies non vérifiées'));assert.ok(v.alertes.includes('Aucune constante'));
});
test('relève : NEWS2 et éléments du journal infirmier',()=>{
 const nursing={tasks:new Map([['t',{title:'Pansement',due:'2026-11-28T07:00',status:'À faire'}]]),alerts:new Map([['a',{title:'Saignement redon',status:'Ouverte'}]]),devices:new Map([['d',{deviceType:'Redon',site:'flanc droit',status:'En place'}]])};
 const r=R.sbar(stay(),{maintenant:now,news2:()=>({total:6,complet:true}),nursing});
 assert.match(r.A.join(' '),/NEWS2 6\./);assert.match(r.A.join(' '),/Saignement redon/);assert.match(r.A.join(' '),/Redon \(flanc droit\)/);
 assert.match(r.R.join(' '),/7 h 00 Pansement \(en retard\)/);assert.ok(r.alertes.includes('NEWS2 à 6'));
});

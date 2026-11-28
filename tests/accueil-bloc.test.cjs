// Alertes du bloc (fil calculé, destinataires, notifications sans nom) et générateur de QR code (5e veille, lot 3).
const test=require('node:test');const assert=require('node:assert/strict');
const AB=require('../dist/alertes-bloc-regles.js'),QR=require('../dist/qr-code.js');
const J='2026-11-28',resources=[{id:'s1',label:'Salle 1 (démo)',kind:'room'},{id:'s2',label:'Salle 2',sector:'bloc-chir'},{id:'lit',label:'Lit 3',sector:'etage-1'}];
const reservations=[
 {id:'A',resource:'s1',patient:'P1',start:J+'T08:00',state:'Occupée',surgeon:'Dr Martin',etapes:{arrivee:J+'T07:50',entree:J+'T08:02'}},
 {id:'B',resource:'s1',patient:'P2',start:J+'T10:00',state:'Réservée',surgeon:'Dr Martin'},
 {id:'C',resource:'s2',patient:'P3',start:J+'T08:30',state:'Réservée',surgeon:'Dr Durand'},
 {id:'D',resource:'s2',patient:'P4',start:J+'T09:00',state:'Annulée',surgeon:'Dr Durand'},
 {id:'E',resource:'lit',patient:'P1',start:J+'T09:00',state:'Réservée'}];
const sejours={P1:{nom:'FICTIF Lina',chambre:'112'},P2:{nom:'EXEMPLE Marc',chambre:'204'},P3:{nom:'TEST Léa'}};
test('fil du bloc : étapes, patient suivant, retard, arrivées',()=>{
 const f=AB.fil({reservations,resources,sejours,arrivees:[{stay:'P2',jour:J,at:J+'T07:40',source:'qr'}],jour:J,maintenant:J+'T08:50'});
 const ids=f.map(a=>a.id);
 assert.ok(ids.includes('A:arrivee')&&ids.includes('A:entree'));
 const prep=f.find(a=>a.id==='B:preparer');assert.match(prep.texte,/chambre 204 et l’envoyer vers Salle 1 \(passage prévu à 10 h 00\)/);assert.deepEqual(prep.pour,['etage','bloc']);
 const ret=f.find(a=>a.id==='C:retard');assert.equal(ret.niveau,'alerte');assert.ok(ret.pour.includes('chirurgien:Dr Durand'));
 assert.ok(!ids.some(i=>i.startsWith('D:')),'intervention annulée ignorée');assert.ok(!ids.some(i=>i.startsWith('E:')),'lit ignoré');
 assert.ok(f.find(a=>a.type==='arriveeClinique').texte.includes('QR code'));
 assert.equal(f[0].at>=f.at(-1).at,true,'plus récentes d’abord');
 assert.ok(!AB.fil({reservations,resources,sejours,jour:J,maintenant:J+'T08:40'}).some(a=>a.id==='C:retard'),'pas de retard avant 15 min');
});
test('destinataires et notification sans nom',()=>{
 const f=AB.fil({reservations,resources,sejours,jour:J,maintenant:J+'T08:50'}),a=f.find(x=>x.id==='A:entree'),p=f.find(x=>x.id==='B:preparer');
 assert.ok(AB.pourMoi(a,{job:'chirurgien',nom:'Paul Martin'}));assert.ok(!AB.pourMoi(a,{job:'chirurgien',nom:'Anne Durand'}));
 assert.ok(AB.pourMoi(a,{job:'anesthesiste'}));assert.ok(AB.pourMoi(a,{job:'infirmier',poste:'bloc'}));assert.ok(!AB.pourMoi(a,{job:'infirmier',poste:'etage'}));
 assert.ok(AB.pourMoi(p,{job:'infirmier',poste:'etage'}));assert.ok(AB.pourMoi(p,{job:'infirmier',poste:'cadre-etage'}));assert.ok(!AB.pourMoi(p,{job:'secretariat'}));
 assert.ok(!AB.pourMoi(a,{job:'facturation'}));assert.ok(AB.pourMoi(a,{job:'facturation',isAdmin:true}));
 for(const x of f){const n=AB.notification(x);assert.doesNotMatch(n.titre+n.corps,/FICTIF|EXEMPLE|TEST/)}
});
test('QR code : taille par version, motifs de repérage, limite',()=>{
 for(const [txt,v] of [['A',1],['x'.repeat(40),3],['y'.repeat(120),7],['z'.repeat(213),10]]){const m=QR.matrice(txt);assert.equal(m.length,17+4*v,txt.length+' octets');
  for(const [r,c] of [[0,0],[0,m.length-7],[m.length-7,0]]){assert.equal(m[r][c],true);assert.equal(m[r+1][c+1],false);assert.equal(m[r+3][c+3],true)}
  assert.equal(m[m.length-8][8],true,'module sombre')}
 assert.throws(()=>QR.matrice('w'.repeat(214)),/trop long/);
 assert.deepEqual(QR.matrice('IASELO'),QR.matrice('IASELO'));
 const s=QR.svg('https://exemple.fr/arrivee.html',{taille:300,titre:'Arrivée <test>'});assert.match(s,/^<svg [^>]*width="300"/);assert.match(s,/aria-label="Arrivée &lt;test&gt;"/);
});

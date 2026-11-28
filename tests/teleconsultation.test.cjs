// Téléconsultation vidéo (5e veille, lot 7) : règles pures.
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../dist/teleconsultation-regles.js');
test('heure de Paris, planification, ouverture de la salle',()=>{
 assert.equal(V.instantParis('2026-12-10T10:30'),'2026-12-10T09:30:00.000Z','hiver : UTC+1');
 assert.equal(V.instantParis('2026-07-10T10:30'),'2026-07-10T08:30:00.000Z','été : UTC+2');
 assert.equal(V.instantParis('10/12/2026'),null);
 const now=new Date('2026-11-28T09:00:00Z');
 assert.ok(V.verifierPlanif({debut:'2026-11-29T10:00',motif:'suivi'},now).ok);
 assert.match(V.verifierPlanif({debut:'2026-11-27T10:00',motif:'suivi'},now).erreurs.join(),/passée/);
 assert.match(V.verifierPlanif({debut:'2027-06-01T10:00',motif:'suivi'},now).erreurs.join(),/90 jours/);
 assert.match(V.verifierPlanif({debut:'2026-11-29T10:00',motif:'cpa'},now).erreurs.join(),/Motif/);
 assert.ok(!('cpa' in V.MOTIFS),'pas de consultation pré-anesthésique en vidéo');
 const s={debut:'2026-11-28T10:00:00.000Z',statut:'planifiee'};
 assert.equal(V.ouverte(s,new Date('2026-11-28T09:40:00Z')).tot,true);
 assert.ok(V.ouverte(s,new Date('2026-11-28T09:50:00Z')).ok);
 assert.ok(!V.ouverte(s,new Date('2026-11-28T12:30:00Z')).ok);
 assert.ok(!V.ouverte({...s,statut:'annulee'},new Date('2026-11-28T10:00:00Z')).ok);
});
test('messages de signalisation, serveurs relais, SMS sans donnée de santé',()=>{
 assert.ok(V.signalValide('offer',{type:'offer',sdp:'v=0\r\no=- 1 2 IN IP4 127.0.0.1'}));
 assert.ok(!V.signalValide('offer',{type:'answer',sdp:'v=0'}));
 assert.ok(!V.signalValide('offer',{type:'offer',sdp:'<script>'}));
 assert.ok(V.signalValide('candidate',{candidate:'candidate:1 1 udp 1 1.2.3.4 5 typ host',sdpMid:'0'}));
 assert.ok(V.signalValide('candidate',null));assert.ok(V.signalValide('pret',null));assert.ok(!V.signalValide('video',{}));
 assert.ok(!V.signalValide('candidate',{candidate:'x'.repeat(30000)}));
 assert.deepEqual(V.iceServers(''),[]);assert.deepEqual(V.iceServers('nope'),[]);
 assert.deepEqual(V.iceServers('[{"urls":"turn:relais.example.fr:3478","username":"u","credential":"c"},{"x":1}]'),[{urls:'turn:relais.example.fr:3478',username:'u',credential:'c'}]);
 const t=V.sms('Clinique Démo','2026-12-10T09:30:00.000Z','https://x/visio.html#acces=a');assert.match(t,/10\/12 à 10:30/);assert.doesNotMatch(t,/suivi|sortie|résultat/i);
});

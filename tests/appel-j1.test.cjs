// Appel du lendemain par agent vocal (4e veille, lot D) : compréhension des réponses parlées, identité, urgence. Patients FICTIFS.
const {test}=require('node:test');const assert=require('node:assert/strict');
const A=require('../dist/appel-j1-regles.js');
test('nombres et oui/non parlés',()=>{
 assert.equal(A.nombre('sept'),7);assert.equal(A.nombre('à peu près 6'),6);assert.equal(A.nombre('trente-huit cinq'),38.5);assert.equal(A.nombre('38,2 degrés'),38.2);assert.equal(A.nombre('trente-sept et demi'),37.5);assert.equal(A.nombre('quarante'),40);assert.equal(A.nombre('je ne sais pas'),null);
 assert.equal(A.ouiNon('Non pas du tout'),'Non');assert.equal(A.ouiNon('oui un peu'),'Oui');assert.equal(A.ouiNon('je n’ai pas de nausées'),'Non');assert.equal(A.ouiNon('euh'),null);
 assert.equal(A.dateDite('le 23 septembre 1975'),'1975-09-23');assert.equal(A.dateDite('1er mars 1960'.replace('1er','premier')),'1960-03-01');assert.equal(A.dateDite('23/09/1975'),'1975-09-23');
});
test('identité vérifiée avant toute question',()=>{
 const r=A.analyser({naissance:'12 mai 1980',reponses:A.SCENARIOS.bien.reponses},{naissanceAttendue:'1975-09-23'});
 assert.equal(r.identite,false);assert.equal(r.statut,'a-rappeler-ide');assert.equal(r.dit.length,2);assert.deepEqual(r.compris,{});
});
test('scénarios : tout va bien, fièvre, urgence → 15',()=>{
 const o={naissanceAttendue:'1975-09-23',etab:'Clinique Test',prenom:'Lina'};
 const b=A.analyser({naissance:'23 septembre 1975',reponses:A.SCENARIOS.bien.reponses},o);
 assert.ok(b.identite&&b.complet);assert.equal(b.alertes.length,0);assert.equal(b.compris.temperature,'37.2');assert.equal(b.statut,'joint');assert.match(b.dit[0],/Clinique Test/);
 const f=A.analyser({naissance:'23/09/1975',reponses:A.SCENARIOS.fievre.reponses},o);
 assert.ok(f.alertes.some(a=>/Douleur 7/.test(a.label))&&f.alertes.some(a=>/Fièvre/.test(a.label)));assert.ok(!f.urgence);
 const g=A.analyser({naissance:'23/09/1975',reponses:A.SCENARIOS.grave.reponses},o);
 assert.ok(g.urgence);assert.ok(g.dit.some(x=>/appelez le 15 maintenant/.test(x)));assert.ok(g.alertes.some(a=>a.level==='crit'));assert.equal(g.compris.temperature,undefined);
 const i=A.analyser({naissance:'23/09/1975',reponses:{...A.SCENARIOS.bien.reponses,mollet:'euh'}},o);
 assert.equal(i.statut,'a-rappeler-ide');assert.deepEqual(i.incomprises,['mollet']);assert.ok(i.alertes.some(a=>/non comprises/.test(a.label)));
});

import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// Le portail patient est public (lien d'invitation) : il ne doit charger aucun code du dossier professionnel.
test('la page patient ne charge que le portail autonome',()=>{
 const html=fs.readFileSync(new URL('../dist/patient.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m=>m[1]);
 assert.deepEqual(scripts,['startup-v5.js','patient-portal.js','traduction-patient.js']);
 assert.doesNotMatch(html,/<aside|<dialog|Nouveau séjour|acces-professionnels|parcours-v8\.js/);
});
test('le portail patient n’appelle que l’API du questionnaire',()=>{
 const js=fs.readFileSync(new URL('../dist/patient-portal.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/\/api\/workspace|\/auth\//);
 assert.match(js,/\/api\/questionnaire\//);
 assert.match(js,/history\.replaceState/);
});
// Version anglaise des pages patient : dictionnaire local, aucun appel réseau, présente sur chaque page publique.
test('la traduction des pages patient est locale et chargée partout',()=>{
 const js=fs.readFileSync(new URL('../dist/traduction-patient.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|https?:\/\//);
 for(const page of ['patient','espace-patient','suivi-j1','lettre-liaison','ordonnance','rendez-vous','devis','paiement'])assert.match(fs.readFileSync(new URL('../dist/'+page+'.html',import.meta.url),'utf8'),/traduction-patient\.js/,page);
 const EN=JSON.parse(js.match(/const EN=(\{[\s\S]*?\});\nconst JOURS/)[1]);
 assert.equal(EN['Date de naissance'],'Date of birth');assert.ok(Object.keys(EN).length>250);
});

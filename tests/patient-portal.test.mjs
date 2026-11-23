import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// Le portail patient est public (lien d'invitation) : il ne doit charger aucun code du dossier professionnel.
test('la page patient ne charge que le portail autonome',()=>{
 const html=fs.readFileSync(new URL('../dist/patient.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m=>m[1]);
 assert.deepEqual(scripts,['startup-v5.js','patient-portal.js']);
 assert.doesNotMatch(html,/<aside|<dialog|Nouveau séjour|acces-professionnels|parcours-v8\.js/);
});
test('le portail patient n’appelle que l’API du questionnaire',()=>{
 const js=fs.readFileSync(new URL('../dist/patient-portal.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/\/api\/workspace|\/auth\//);
 assert.match(js,/\/api\/questionnaire\//);
 assert.match(js,/history\.replaceState/);
});

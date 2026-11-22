import {test} from 'node:test';import assert from 'node:assert/strict';import {sameOrigin} from '../../server/auth.mjs';
const cfg={baseUrl:'https://clinique.example'};
const req=headers=>new Request('https://clinique.example/auth/login',{method:'POST',headers});
// Chromium et Firefox envoient « Origin: null » pour un formulaire posté depuis une page en Referrer-Policy: no-referrer.
test('connexion par formulaire : même origine acceptée, origines étrangères refusées',()=>{
 assert.equal(sameOrigin(req({Origin:'https://clinique.example'}),cfg),true);
 assert.equal(sameOrigin(req({Origin:'null','Sec-Fetch-Site':'same-origin'}),cfg),true);
 assert.equal(sameOrigin(req({Origin:'null','Sec-Fetch-Site':'cross-site'}),cfg),false);
 assert.equal(sameOrigin(req({Origin:'null'}),cfg),false);
 assert.equal(sameOrigin(req({Origin:'https://attaquant.example','Sec-Fetch-Site':'same-origin'}),cfg),false);
 assert.equal(sameOrigin(req({}),cfg),false);
});

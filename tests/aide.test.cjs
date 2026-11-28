// Aide intégrée (5e veille, lot 4) : « Comment faire… », visites par métier, nouveautés.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const A=require('../dist/aide-regles.js');
test('recherche « Comment faire… » : la bonne fiche en tête, synonymes, métier',()=>{
 assert.equal(A.chercher('comment donner une dose','infirmier')[0].id,'administrer');
 assert.equal(A.chercher('scanner la boîte','infirmier')[0].id,'administrer');
 assert.equal(A.chercher('faire la passation','infirmier')[0].id,'releve');
 assert.equal(A.chercher('prescrire un médicament','anesthesiste')[0].id,'prescrire');
 assert.equal(A.chercher('QR code de l’ordonnance pour la pharmacie','anesthesiste')[0].id,'ordonnance-numerique');
 assert.equal(A.chercher('accueil des patients QR','secretariat')[0].id,'arrivees');
 assert.equal(A.chercher('verrouiller mon écran','chirurgien')[0].id,'verrou');
 assert.equal(A.chercher('xyzzy','infirmier').length,0);
 const tout=A.chercher('','secretariat');assert.ok(tout.length>3&&tout.every(f=>f.metiers.includes('secretariat')),'sans question : les fiches du métier');
});
test('fiches complètes et vues existantes',()=>{
 const ids=new Set();const v8=fs.readFileSync(path.join(__dirname,'..','dist','parcours-v8.js'),'utf8')+fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
 for(const f of A.FICHES){assert.ok(!ids.has(f.id),f.id);ids.add(f.id);assert.ok(f.titre&&f.etapes.length>=2&&f.metiers.length,f.id);if(f.vue)assert.ok(v8.includes("'"+f.vue+"'")||v8.includes('"'+f.vue+'"')||fs.readdirSync(path.join(__dirname,'..','dist')).some(n=>n.endsWith('.js')&&fs.readFileSync(path.join(__dirname,'..','dist',n),'utf8').includes("dataset.view='"+f.vue+"'")),'vue '+f.vue)}
 for(const n of A.NOUVEAUTES)if(n.fiche)assert.ok(ids.has(n.fiche),n.id);
});
test('visite par métier et nouveautés non vues',()=>{
 for(const m of ['anesthesiste','chirurgien','infirmier','secretariat','pharmacien','administration','dim']){const v=A.visite(m);assert.ok(v.length>=3,m);assert.ok(v.every(e=>e.cible&&e.titre&&e.texte),m)}
 assert.equal(A.visite('infirmier')[2].titre,'Surveillance des lits');
 const toutes=A.nonVues('infirmier',[]);assert.ok(toutes.length>=5);assert.equal(A.nonVues('infirmier',toutes.map(n=>n.id)).length,0);
 assert.ok(A.nonVues('facturation',[]).every(n=>n.metiers.includes('facturation')));
 assert.deepEqual([...A.NOUVEAUTES].sort((a,b)=>b.date.localeCompare(a.date)).map(n=>n.id),A.NOUVEAUTES.map(n=>n.id),'plus récentes d’abord');
});

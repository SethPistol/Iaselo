// Ordonnance numérique de sortie en simulation (5e veille, lot 5) : identifiant, contrôle, statut.
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../dist/ordonnance-numerique-regles.js'),QR=require('../dist/qr-code.js');
test('identifiant unique avec caractère de contrôle',()=>{
 const id=O.identifiant(Array.from({length:15},(_,i)=>i*17));
 assert.match(id,/^SIM-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{6}$/);assert.ok(O.valide(id));
 const faux=id.slice(0,-1)+(id.at(-1)==='2'?'3':'2');assert.equal(O.valide(faux),false);
 assert.equal(O.valide('SIM-00000-00000-000000'),false);assert.throws(()=>O.identifiant([1,2]));
 assert.ok(QR.svg(id).startsWith('<svg'),'le QR code se dessine');
});
test('vérification et contenu canonique',()=>{
 assert.equal(O.verifier({items:[{drug:''}],prescripteur:{nom:'Dr Démo'}}).ok,false);
 assert.equal(O.verifier({items:[{drug:'Paracétamol'}],prescripteur:{nom:''}}).ok,false);
 assert.equal(O.verifier({items:[{drug:'Paracétamol'}],prescripteur:{nom:'Dr Démo',rpps:'123'}}).ok,false);
 const v=O.verifier({items:[{drug:' Paracétamol ',dose:'1 g',extra:'x'},{}],prescripteur:{nom:'Dr Démo',rpps:'10000000001'}});
 assert.ok(v.ok);assert.deepEqual(v.lignes,[{drug:'Paracétamol',dose:'1 g',route:'',frequency:'',duration:'',notes:''}]);
 assert.equal(O.canonique([{drug:'Paracétamol',dose:'1 g'}]),O.canonique([{dose:'1 g',drug:'Paracétamol '}]));
});
test('statut suivant les événements',()=>{
 assert.equal(O.statut([]),'brouillon');
 const d={type:'depot',lignes:2};
 assert.equal(O.statut([d]),'deposee');
 assert.equal(O.statut([d,{type:'delivrance',lignes:[0]}]),'delivree-partielle');
 assert.equal(O.statut([d,{type:'delivrance',lignes:[0]},{type:'delivrance',lignes:[1]}]),'delivree');
 assert.equal(O.statut([d,{type:'annulation'}]),'annulee');
 assert.equal(O.statut([d,{type:'annulation'},{type:'delivrance',lignes:[0,1]}]),'annulee');
});

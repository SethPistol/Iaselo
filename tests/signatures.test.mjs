import {test} from 'node:test';import assert from 'node:assert/strict';import {stampSignatures} from '../worker/signatures.mjs';
const moi={userId:'u-moi',name:'Dr Moi',rpps:'10000000001'};
test('signature nouvelle : signataire posé par le serveur',()=>{
 const out=stampSignatures(null,{draft:{a:1},signed:{at:'t',name:'Dr Autre',userId:'u-autre',rpps:'1',hash:'h'}},moi);
 assert.deepEqual(out.signed,{at:'t',name:'Dr Moi',userId:'u-moi',rpps:'10000000001',hash:'h'});
});
test('signature inchangée : l’auteur d’origine est conservé',()=>{
 const old={draft:{a:1},signed:{at:'t',name:'Dr Autre',userId:'u-autre',hash:'h'}};
 assert.deepEqual(stampSignatures(old,{...old,draft:{a:1}},moi),old);
});
test('signedBy / validatedBy imbriqués, historiques intacts',()=>{
 const old={sign:{signedBy:'Dr Autre',signedAt:'t1',history:[]}};
 const next={sign:{signedBy:'Dr Faux',signedAt:'t2',decision:'GO',history:[{signedBy:'Dr Autre',signedAt:'t1',reopenedBy:'Dr Moi'}]},list:[{validatedBy:'X',validatedAt:'t'}]};
 const out=stampSignatures(old,next,moi);
 assert.equal(out.sign.signedBy,'Dr Moi');assert.equal(out.sign.history[0].signedBy,'Dr Autre');assert.equal(out.list[0].validatedBy,'Dr Moi');
});

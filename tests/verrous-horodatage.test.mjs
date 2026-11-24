import {test} from 'node:test';import assert from 'node:assert/strict';import {lockCheck} from '../worker/verrous.mjs';import {heal,stamp} from '../worker/horodatage.mjs';
test('consultation validée figée ; révision explicite autorisée et signalée',()=>{
 const v={validated:true,asa:'2',validation:{at:'t'}};
 assert.match(lockCheck('consult',v,{...v,asa:'3'}).error,/révision/);
 assert.deepEqual(lockCheck('consult',v,{...v}),{});
 assert.ok(lockCheck('consult',v,{...v,validated:false,versions:[v.validation]}).revision);
 assert.deepEqual(lockCheck('consult',{validated:false,asa:'2'},{validated:false,asa:'3'}),{});
});
test('CRO validé, VPA et prescriptions signées',()=>{
 const cro={status:'validé',version:1,text:'a'};
 assert.ok(lockCheck('cro',cro,{...cro,text:'b'}).error);assert.deepEqual(lockCheck('cro',cro,{...cro,text:'b',version:2}),{});
 const p={draft:{a:1},signed:{hash:'h'}};assert.ok(lockCheck('prescriptionsPreop',p,{...p,draft:{a:2}}).error);
 assert.deepEqual(lockCheck('prescriptionsPreop',p,{draft:{a:2},signed:{hash:'h2'}}),{});assert.ok(lockCheck('vpa',p,{draft:{a:2},signed:null}).revision);
});
test('feuille d’anesthésie : stupéfiants et implants intouchables, événements annulés et non effacés',()=>{
 const old={evenements:[{label:'Induction',at:'t1'}],stupefiants:[{produit:'Sufentanil',dose:'10'}],dmi:[]};
 assert.ok(lockCheck('peropRapide',old,{...old,stupefiants:[]}).error);
 assert.ok(lockCheck('peropRapide',old,{...old,stupefiants:[{produit:'Sufentanil',dose:'5'}]}).error);
 assert.ok(lockCheck('peropRapide',old,{...old,evenements:[]}).error);
 assert.deepEqual(lockCheck('peropRapide',old,{...old,evenements:[{label:'Induction',at:'t1',annule:{at:'t2',by:'X'}}]}),{});
 assert.ok(lockCheck('peropRapide',old,{...old,evenements:[{label:'Induction',at:'t0'}]}).error,'heure clinique non modifiable');
 assert.deepEqual(lockCheck('peropRapide',old,{...old,stupefiants:[...old.stupefiants,{produit:'Kétamine',dose:'20'}]}),{});
});
test('heure serveur : posée sur les nouvelles entrées, conservée et impossible à inventer',()=>{
 const rx=[{name:'Paracétamol',executions:[{status:'Réalisée',at:'2026-11-24T08:00:00.000Z',author:'IDE'}]}];
 const s=stamp('rx',rx,{at:'2026-11-24T10:00:00.000Z',user:'u1'});assert.equal(s[0].executions[0].serverAt,'2026-11-24T10:00:00.000Z');assert.equal(s[0].executions[0].serverBy,'u1');
 // Le poste renvoie la liste sans l'horodatage serveur : il est retrouvé.
 const healed=heal('rx',s,[{name:'Paracétamol',executions:[{status:'Réalisée',at:'2026-11-24T08:00:00.000Z',author:'IDE'},{status:'Réalisée',at:'2026-11-24T12:00:00.000Z',author:'IDE',serverAt:'2020-01-01T00:00:00.000Z'}]}]);
 assert.equal(healed[0].executions[0].serverAt,'2026-11-24T10:00:00.000Z');assert.equal(healed[0].executions[1].serverAt,undefined,'horodatage inventé par le poste retiré');
 assert.equal(stamp('rx',healed,{at:'2026-11-24T12:01:00.000Z',user:'u2'})[0].executions[1].serverBy,'u2');
 assert.equal(stamp('postopVitals',[{kind:'Surveillance'}],{at:'x',user:'u'})[0].serverAt,'x');
});

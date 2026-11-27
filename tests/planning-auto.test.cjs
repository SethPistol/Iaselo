// Planning infirmier proposé automatiquement (4e veille, lot E) : règles du travail respectées, saisies conservées. Données fictives.
const {test}=require('node:test');const assert=require('node:assert/strict');
const A=require('../dist/planning-auto-regles.js'),R=require('../dist/plannings-infirmiers-regles.js');
const equipe=n=>Array.from({length:n},(_,i)=>({id:'ide'+(i+1),nom:'IDE fictif '+(i+1),fonction:'IDE'}));
test('étage : couverture M/S/N, aucune alerte, équité des heures, congés conservés',()=>{
 const pl={personnes:equipe(14),affectations:{ide1:{'2026-12-01':{code:'CA'},'2026-12-02':{code:'CA'}},ide2:{'2026-12-05':{code:'J',note:'Échange accepté'}}}};
 const r=A.proposer(pl,'2026-12',{service:'etage'});
 assert.equal(r.manques.length,0,JSON.stringify(r.manques.slice(0,5)));assert.equal(r.alertes.length,0,JSON.stringify(r.alertes.slice(0,3)));
 assert.equal(r.planning.affectations.ide1['2026-12-01'].code,'CA');assert.equal(r.planning.affectations.ide2['2026-12-05'].note,'Échange accepté');
 const eff=R.effectifs(r.planning,'2026-12');for(const d of R.joursDuMois('2026-12')){assert.ok((eff[d].M||0)>=2&&(eff[d].S||0)>=2&&(eff[d].N||0)>=1,d)}
 assert.ok(r.ecartHeures<=24,'écart '+r.ecartHeures);assert.ok(Object.values(r.heures).every(h=>h<=A.HEURES_CIBLE+8));
});
test('bloc : besoin du programme (J, S si fin tardive), rien les jours sans salle, manques signalés',()=>{
 const besoins={'2026-12-01':{besoin:4,soir:true},'2026-12-02':{besoin:2,soir:false}};
 const r=A.proposer({personnes:equipe(3),affectations:{}},'2026-12',{service:'bloc',besoins});
 const eff=R.effectifs(r.planning,'2026-12');assert.equal(eff['2026-12-01'].total,3);assert.equal(eff['2026-12-01'].S,1);assert.equal(eff['2026-12-02'].J,2);assert.equal(eff['2026-12-03'].total,0);
 assert.deepEqual(r.manques,[{jour:'2026-12-01',code:'J'}]);
});
test('contraintes : pas de poste de jour après une nuit, 3 nuits d’affilée au plus, 5 jours d’affilée au plus',()=>{
 const r=A.proposer({personnes:equipe(2),affectations:{}},'2026-12',{service:'etage',etage:{M:0,S:0,N:1},reposLibres:false});
 assert.equal(r.alertes.length,0);
 for(const p of r.planning.personnes){let n=0,w=0;for(const d of R.joursDuMois('2026-12')){const a=r.planning.affectations[p.id]?.[d];n=a?.code==='N'?n+1:0;w=a&&R.CODES[a.code].travail?w+1:0;assert.ok(n<=3&&w<=5)}}
 assert.ok(r.manques.length>0);// 2 personnes ne couvrent pas 31 nuits sous ces règles : le manque est dit, pas masqué
});

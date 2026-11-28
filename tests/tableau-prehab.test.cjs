// Tableau de bord du praticien et préhabilitation (5e veille, lot 6) : règles pures.
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../dist/tableau-praticien-regles.js'),H=require('../dist/prehabilitation-regles.js');
const rec=(kind,at,values)=>({kind,at,values});
test('indicateurs d’un séjour : antibioprophylaxie, NVPO, douleur, retard',()=>{
 const base={id:'S1',core:{},perop:{records:[rec('Médicament','2026-11-20T08:10:00Z',{drug:'Céfazoline 2 g'}),rec('Événement','2026-11-20T08:45:00Z',{event:'Incision'})]},postopVitals:[{values:{pain:'2',nvpo:'1'}},{values:{pain:'5'}}]};
 let x=T.sejour(base,[{start:'2026-11-20T08:00',etapes:{entree:'2026-11-20T08:25'}}]);
 assert.equal(x.antibio,'conforme');assert.equal(x.ecartAntibioMin,35);assert.equal(x.nvpo,true);assert.equal(x.douleur,true);assert.equal(x.retardMin,25);assert.equal(x.croManquant,true);assert.equal(x.date,'2026-11-20');
 x=T.sejour({...base,perop:{records:[rec('Médicament','2026-11-20T07:00:00Z',{drug:'Céfazoline'}),rec('Événement','2026-11-20T08:45:00Z',{event:'Incision'})]}});assert.equal(x.antibio,'hors-delai');
 x=T.sejour({...base,perop:{records:[rec('Événement','2026-11-20T08:45:00Z',{event:'Incision'}),rec('Médicament','2026-11-20T09:00:00Z',{drug:'Céfazoline'})]}});assert.equal(x.antibio,'hors-delai','après l’incision');
 x=T.sejour({...base,perop:{records:[rec('Événement','2026-11-20T08:45:00Z',{event:'Incision'})]},cro:{text:'CRO'}});assert.equal(x.antibio,'non-tracee');assert.equal(x.croManquant,false);
 x=T.sejour({id:'S2',core:{}});assert.equal(x.antibio,null);assert.equal(x.nvpo,null);assert.equal(x.opere,false);
});
test('agrégation, petits effectifs et comparaison',()=>{
 const L=[{antibio:'conforme',nvpo:false,douleur:false,retardMin:0,opere:true},{antibio:'hors-delai',nvpo:true,douleur:true,retardMin:30,opere:true},{antibio:'non-tracee',nvpo:null,douleur:null,retardMin:null,opere:true}];
 const a=T.agreger(L);assert.equal(a.antibio.taux,50);assert.equal(a.antibio.nonTracees,1);assert.equal(a.nvpo.taux,50);assert.equal(a.retards.n,1);assert.equal(a.retards.moyenneMin,15);
 assert.equal(T.anonyme(a),null,'moins de 5 séjours : masqué');assert.ok(T.anonyme(T.agreger([...L,...L])));
 assert.equal(T.comparer(90,70,'haut').code,'mieux');assert.equal(T.comparer(30,10,'bas').code,'moins');assert.equal(T.comparer(50,52,'bas').code,'egal');assert.equal(T.comparer(null,50,'bas').code,'na');
 assert.ok(T.memeNom('Dr Démo (recette)','Dr Démo'));assert.ok(!T.memeNom('Dr Dubois','Dr Martin'));
 const p=T.periode(90,'2026-11-28');assert.equal(p.debut,'2026-08-31');assert.equal(T.periode(7,'2026-11-28').jours,30);
});
test('préhabilitation : fenêtre, saisie, adhésion, décrochage',()=>{
 const o=H.objectifs({items:['marche','exercices','tabac'],marcheMin:20,fumeur:true});assert.deepEqual(o,{items:['marche','exercices','tabac'],marcheMin:20});
 assert.deepEqual(H.objectifs({}).items,['marche','exercices','nutrition']);assert.equal(H.objectifs({marcheMin:2}).marcheMin,30);
 const f=H.fenetre('2026-12-20','2026-11-10');assert.deepEqual(f,{debut:'2026-11-20',fin:'2026-12-19',jours:30});
 assert.equal(H.fenetre('2026-12-20','2026-12-01').debut,'2026-12-01','inscription tardive');
 assert.ok(H.saisissable('2026-11-27',f,'2026-11-28'));assert.ok(!H.saisissable('2026-11-25',f,'2026-11-28'),'plus de 2 jours');assert.ok(!H.saisissable('2026-11-29',f,'2026-11-28'),'futur');
 assert.equal(H.valider(o,{marche:30,exercices:'Oui'}).ok,false);assert.equal(H.valider(o,{marche:-1,exercices:'Oui',tabac:'Non'}).ok,false);
 const v=H.valider(o,{marche:'25',exercices:'Oui',tabac:'Non',nutrition:'Oui'});assert.ok(v.ok);assert.deepEqual(v.valeurs,{marche:25,exercices:'Oui',tabac:'Non'});
 assert.equal(H.atteint('tabac','Non',o),true);assert.equal(H.atteint('marche',10,o),false);
 const p={inscrit:{at:'2026-11-20T09:00:00Z'},objectifs:o,journal:{'2026-11-20':{marche:30,exercices:'Oui',tabac:'Non'},'2026-11-21':{marche:10,exercices:'Non',tabac:'Oui'}}};
 let a=H.adhesion(p,'2026-12-20','2026-11-22');assert.equal(a.joursEcoules,2);assert.equal(a.remplis,2);assert.equal(a.taux,50);assert.equal(a.code,'en-cours');assert.equal(a.serie,2);
 a=H.adhesion(p,'2026-12-20','2026-11-26');assert.equal(a.code,'decrochage');assert.equal(a.sansNouvelles,4);
 assert.equal(H.adhesion({...p,arret:{motif:'x'}},'2026-12-20','2026-11-26').code,'arrete');
 assert.equal(H.adhesion(p,'','2026-11-26').code,'sans-date');
 assert.ok(H.aProposer('2026-12-20','2026-11-28'));assert.ok(!H.aProposer('2026-12-01','2026-11-28'));
 assert.doesNotMatch(H.sms('Clinique','https://x/prehabilitation.html#acces=a'),/tabac|marche|poids|chirurg/i,'SMS sans donnée de santé');
});

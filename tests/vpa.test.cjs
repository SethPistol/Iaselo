const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/vpa-regles.js'),V=require('../dist/veille-regles.js');
const base=()=>R.normaliser({at:'2026-12-03T07:00',identite:{verifiee:true},questions:{infection:'Non',cardioResp:'Non',traitement:'Non',evenement:'Non'},
 jeune:{solides:'2026-12-02T22:00',liquides:'2026-12-03T06:00'},consentement:'Oui',conclusion:{decision:'apte'}});
const ctx={intervention:new Date('2026-12-03T09:00'),maintenant:new Date('2026-12-03T07:00'),consentementSigne:true,consultDate:'2026-11-20'};

test('VPA : normalisation, champs inconnus ignorés, empreinte stable',()=>{
 const d=R.normaliser({at:'x',lieu:'Cuisine',questions:{infection:'Peut-être'},examen:{pas:'135',temp:'37,8'},pirate:'<script>',conclusion:{decision:'opérer'}});
 assert.equal(d.at,'');assert.equal(d.lieu,'');assert.equal(d.questions.infection,'');assert.equal(d.examen.pas,135);assert.equal(d.examen.temp,37.8);assert.equal(d.pirate,undefined);assert.equal(d.conclusion.decision,'');
 assert.equal(R.canonique(base()),R.canonique(JSON.parse(JSON.stringify(base()))));
});
test('VPA : jeûne calculé à l’heure prévue de l’intervention (6 h / 2 h)',()=>{
 let j=R.jeune({solides:'2026-12-03T04:00',liquides:'2026-12-03T07:30'},ctx);
 assert.equal(j.niveau,'crit');assert.equal(j.lignes[0].niveau,'crit');assert.equal(j.lignes[1].niveau,'crit');
 assert.equal(j.conformeA.getHours(),10);
 j=R.jeune({solides:'2026-12-02T22:00',liquides:'2026-12-03T06:00'},ctx);assert.equal(j.niveau,'ok');assert.match(j.lignes[0].texte,/11 h à l’heure prévue/);
 assert.equal(R.jeune({solides:'2026-12-02T22:00'},ctx).niveau,'warn');
 assert.match(R.jeune({},{...ctx,age:6}).pediatrie,/lait maternel 4 h/);
});
test('VPA : constantes du jour, RAI et délais réglementaires',()=>{
 const a=R.constantes({temp:38.4,spo2:91,pas:185,pad:95,fc:130,glycemie:0.6});
 assert.deepEqual(a.map(x=>x.id),['fievre','spo2','hta','fc','hypo']);
 assert.deepEqual(R.constantes({temp:37,spo2:98,pas:130,pad:80,fc:70,glycemie:1.1}),[]);
 assert.equal(R.rai({date:'2026-11-30'},ctx.intervention).valide,false);
 assert.equal(R.rai({date:'2026-11-30',etendue:true},ctx.intervention).valide,true);
 assert.deepEqual(R.delais({vpaAt:'2026-12-01T18:00',intervention:ctx.intervention}).map(x=>x.id),['vpaTot']);
 assert.deepEqual(R.delais({vpaAt:'2026-12-03T07:00',intervention:ctx.intervention,consultDate:'2026-12-02'}).map(x=>x.id),['cpaTard']);
 assert.deepEqual(R.delais({consultDate:'2026-12-02',intervention:ctx.intervention,urgence:true}),[]);
});
test('VPA : signature possible si complète ; alerte critique à prendre en compte ou report motivé',()=>{
 assert.equal(R.controler(base(),ctx).ok,true);
 const d=base();d.examen.temp=38.6;let r=R.controler(d,ctx);assert.equal(r.ok,false);assert.ok(r.errors.some(e=>/critique/.test(e)));
 d.acquittees=['fievre'];d.motifAlertes='Avis infectiologue : foyer dentaire traité, apyrétique sous paracétamol ? non, à revoir';assert.equal(R.controler(d,ctx).ok,true);
 const rep=base();rep.examen.temp=38.6;rep.conclusion={decision:'report',motif:''};assert.ok(R.controler(rep,ctx).errors.some(e=>/Motif du report/.test(e)));
 rep.conclusion.motif='Fièvre à 38,6 °C, foyer pulmonaire';assert.equal(R.controler(rep,ctx).ok,true);
 const inc=R.normaliser({});const e=R.controler(inc,ctx).errors.join(' ');assert.match(e,/Heure de la visite/);assert.match(e,/Identité/);assert.match(e,/jeûne|dernière prise/i);assert.match(e,/Conclusion/);
 const t=base();t.traitements=[{id:'apixaban',label:'Apixaban',consigne:'Dernière prise J-3',kind:'stop',statut:'Non respecté'}];assert.ok(R.alertes(t,ctx).some(a=>a.id==='trt-apixaban'&&a.niveau==='crit'));
 assert.ok(R.alertes(base(),{...ctx,consentementSigne:false}).some(a=>a.id==='consentementSigne'&&a.niveau==='warn'));
});
test('VPA : état pour le bandeau et complétude (sans objet avant la veille, bloquante ensuite)',()=>{
 const now=new Date('2026-12-02T15:00');
 assert.equal(R.etat(null,'2026-12-10',now).na,true);
 assert.equal(R.etat(null,'2026-12-03',now).code,'afaire');
 assert.equal(R.etat({draft:{at:'2026-12-03T07:00'}},'2026-12-03',now).code,'encours');
 assert.equal(R.etat({signed:{name:'Dr A',decision:'apte',at:'2026-12-03T07:10:00Z'}},'2026-12-03',now).ok,true);
 assert.equal(R.etat({signed:{name:'Dr A',decision:'report',motif:'Fièvre'}},'2026-12-03',now).code,'report');
 const today=new Date(),iso=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
 const stay={consult:{ext:{surgeryDate:iso}}};
 let it=V.completude(stay).items.find(i=>i.id==='vpa');assert.equal(it.na,undefined);assert.equal(it.blocking,true);assert.equal(it.ok,false);
 stay.vpa={signed:{name:'Dr A',decision:'apte'}};it=V.completude(stay).items.find(i=>i.id==='vpa');assert.equal(it.ok,true);
 stay.vpa={signed:{name:'Dr A',decision:'report',motif:'Fièvre'}};it=V.completude(stay).items.find(i=>i.id==='vpa');assert.equal(it.ok,false);assert.match(it.detail,/Report/);
 it=V.completude({consult:{ext:{surgeryDate:'2099-01-01'}}}).items.find(i=>i.id==='vpa');assert.equal(it.na,true);
});

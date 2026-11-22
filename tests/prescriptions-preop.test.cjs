const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/prescriptions-preop-regles.js'),A=require('../dist/ameliorations-regles.js'),V=require('../dist/veille-regles.js');
test('prescriptions préop : normalisation stable et champs inconnus ignorés',()=>{
 const d=R.normaliser({bilans:{ids:['nfs','inconnu','nfs','iono'],avant:'2026-12-01'},premed:[{drug:' Hydroxyzine 25 mg ',dose:'1 cp',moment:'La veille au soir',pirate:1},{}],douche:{nombre:'1',produit:'x'},jeune:{solides:40,heure:'25:00'},script:'<x>'});
 assert.deepEqual(d.bilans.ids,['nfs','iono']);assert.equal(d.premed.length,1);assert.equal(d.premed[0].drug,'Hydroxyzine 25 mg');assert.equal(d.premed[0].pirate,undefined);
 assert.equal(d.douche.nombre,1);assert.equal(d.douche.produit,'doux');assert.equal(d.jeune.solides,6);assert.equal(d.jeune.heure,'');assert.equal(d.script,undefined);
 assert.equal(R.canonique(d),R.canonique(JSON.parse(JSON.stringify(d))));
});
test('prescriptions préop : jeûne calculé depuis l’heure d’intervention, douche SF2H',()=>{
 const j=R.texteJeune({date:'2026-12-03',heure:'08:00',solides:6,liquides:2});
 assert.match(j[0],/ 2 h 00 le jour/);assert.match(j[1],/ 6 h 00/);
 assert.match(R.texteJeune({date:'2026-12-03',heure:'05:00'})[0],/23 h 00 la veille/);
 assert.match(R.texteJeune({})[0],/6 heures/);assert.deepEqual(R.texteJeune({actif:false}),[]);
 const dc=R.texteDouche({nombre:1,produit:'antiseptique'});assert.match(dc[0],/matin/);assert.match(dc[0],/antiseptique/);assert.match(dc[1],/Ne rasez pas/);
});
test('prescriptions préop : allergie bloquante sans motif, avertissement avec motif',()=>{
 const doc={premed:[{drug:'Amoxicilline 1 g',dose:'1 g',moment:'La veille au soir'}]};
 let r=R.controler(doc,{allergies:'Pénicilline : urticaire',A});assert.equal(r.ok,false);assert.match(r.errors[0],/allergie/);
 doc.premed[0].motif='Test allergologique négatif du 02/10';r=R.controler(doc,{allergies:'Pénicilline : urticaire',A});assert.equal(r.ok,true);assert.ok(r.warnings.some(w=>/Motif/.test(w)));
 assert.equal(R.controler({premed:[{drug:'Paracétamol 1 g'}]},{A}).ok,false);
 assert.equal(R.controler({douche:{actif:false},jeune:{actif:false}},{}).ok,false);
 assert.equal(R.controler({bilans:{ids:['nfs'],avant:'2026-12-10'}},{surgeryDate:'2026-12-03'}).ok,false);
});
test('prescriptions préop : propositions issues du dossier et consignes datées reprises',()=>{
 const stay={mode:'Ambulatoire',identity:{birthDate:'1950-01-01'},consult:{allergies:'Aucune',treatments:'Apixaban 5 mg matin et soir',ext:{surgeryDate:'2026-12-03',sex:'Homme',surgicalBleedingRisk:'Élevé'}}};
 const s=R.suggestions(stay,V);assert.ok(s.iono&&s.nfs&&s.bnp&&s.groupe&&s.martial);assert.equal(s.bhcg,undefined);
 const t=R.traitementsProposes(stay,V);assert.ok(t.some(x=>/apixaban/i.test(x.label)));assert.match(t[0].text,/Dernière prise/);
 stay.aideCpa={consignes:{validatedAt:'2026-11-22T10:00:00Z',items:[{id:'x',label:'Apixaban',text:'Texte relu'}]}};
 assert.equal(R.traitementsProposes(stay,V)[0].text,'Texte relu');
});
test('prescriptions préop : document échappé, ordonnance et consignes séparées, expiration bornée',()=>{
 const html=R.documentHTML({contenu:{bilans:{ids:['nfs']},premed:[{drug:'<script>',dose:'1',moment:'m'}]},patient:{nom:'Fictif',prenom:'Test'},prescripteur:{nom:'Dr Démo'},signeLe:'2026-11-22T10:00:00Z',etablissement:'Clinique test'});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Ordonnance/);assert.match(html,/Consignes pour préparer/);assert.match(html,/FICTIF Test/);
 const now=new Date('2026-11-22T12:00:00Z');
 assert.equal(R.expiration('2026-12-03',now).slice(0,10),'2026-12-10');
 assert.equal(R.expiration('',now).slice(0,10),'2026-12-22');
 assert.equal(R.expiration('2026-11-01',now),new Date(now.getTime()+48*3600000).toISOString());
});

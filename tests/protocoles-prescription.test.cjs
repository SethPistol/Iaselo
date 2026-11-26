'use strict';
// Protocoles de prescription partagés : normalisation, validation, différences entre versions et reprise par le médecin.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/protocoles-prescription-regles.js'),PP=require('../dist/prescriptions-preop-regles.js');

const preop={nom:'Prothèse totale de hanche',type:'preop',specialite:'Orthopédie',description:'Validé en CME',contenu:{
 bilans:{ids:['nfs','groupe','rai','inconnu'],delaiJours:3,notes:'À jeun'},premed:[{drug:'Paracétamol 1 g',dose:'1 comprimé',moment:'Le matin de l’intervention, avec une gorgée d’eau'}],
 douche:{inclure:true,nombre:2,produit:'antiseptique'},jeune:{inclure:true,solides:8,liquides:2},autres:'Ne pas conduire pendant 24 heures après l’anesthésie.\nApporter vos ordonnances.'}};

test('protocole : normalisation et validation',()=>{
 const n=P.normaliser(preop);assert.deepEqual(n.contenu.bilans.ids,['nfs','groupe','rai'],'examen inconnu retiré');assert.equal(n.contenu.bilans.delaiJours,3);
 assert.ok(P.valider(preop).ok);
 assert.match(P.valider({...preop,nom:'x'}).errors.join(),/nom/);
 assert.match(P.valider({...preop,type:'autre'}).errors.join(),/type/);
 assert.match(P.valider({nom:'Vide',type:'postop',contenu:{lignes:[]}}).errors.join(),/aucune prescription/);
 assert.match(P.valider(preop,{modification:true,motif:''}).errors.join(),/motif/,'motif exigé pour une mise à jour');
 assert.ok(P.valider(preop,{modification:true,motif:'Recommandation 2026'}).ok);
 assert.match(P.valider({nom:'Sortie PTH',type:'sortie',contenu:{lignes:[{drug:'Paracétamol 1 g'}]}}).errors.join(),/dose, voie/);
 assert.equal(P.canonique(preop),P.canonique(JSON.parse(JSON.stringify(preop))),'empreinte stable');
});
test('protocole : différences entre deux versions',()=>{
 const v2=JSON.parse(JSON.stringify(preop));v2.contenu.jeune.solides=6;v2.nom='PTH';
 const d=P.differences(preop,v2);assert.ok(d.some(x=>/Nom/.test(x)));assert.ok(d.some(x=>x.startsWith('+ Jeûne : solides 6 h')));assert.ok(d.some(x=>x.startsWith('− Jeûne : solides 8 h')));
});
test('reprise préop : complète le brouillon sans effacer la saisie du médecin',()=>{
 const draft=PP.normaliser({version:2,bilans:{ids:['iono']},premed:[{drug:'paracétamol 1 g',dose:'2 cp',moment:'la veille'}],autres:'Apporter vos ordonnances.',jeune:{date:'2026-12-10',heure:'08:30'}});
 const {draft:d,ajouts}=P.appliquerPreop(draft,preop.contenu,{surgeryDate:'2026-12-10'});
 assert.deepEqual(d.bilans.ids,['nfs','iono','groupe','rai']);assert.equal(d.bilans.avant,'2026-12-07','J-3');
 assert.equal(d.premed.length,1,'pas de doublon de médicament');assert.equal(d.premed[0].dose,'2 cp','saisie du médecin gardée');
 assert.equal(d.douche.produit,'antiseptique');assert.equal(d.jeune.solides,8);assert.equal(d.jeune.date,'2026-12-10');assert.equal(d.jeune.heure,'08:30');
 assert.equal(d.autres.split('\n').length,2,'consigne déjà présente non répétée');assert.equal(d.version,2);
 assert.ok(ajouts.includes('douche')&&ajouts.includes('jeûne'));
 // Le contrôle habituel s'applique toujours avant la signature (allergies, champs requis).
 assert.ok(PP.controler(d).ok);
});
test('reprise postop et sortie',()=>{
 const l=P.lignesPostop({lignes:[{name:'Enoxaparine 4000 UI',category:'Médicament',instructions:'1 injection SC/j à 20 h'},{name:'',instructions:'x'}]},{auteur:'Chirurgien',protocole:{id:'p1',version:3,nom:'PTH'}});
 assert.equal(l.length,1);assert.equal(l[0].validated,false,'jamais validée automatiquement');assert.equal(l[0].protocole.version,3);
 const s=P.lignesSortie([{},{drug:'Paracétamol 1 g',dose:'1 cp'}],{lignes:[{drug:'paracétamol 1 g',dose:'1',route:'orale',frequency:'4/j',duration:'5 j'},{drug:'Kétoprofène 100 mg',dose:'1',route:'orale',frequency:'2/j',duration:'3 j'}]});
 assert.equal(s.items.length,2,'ligne vide remplacée, doublon évité');assert.equal(s.ajoutes,1);assert.equal(s.items[0].dose,'1 cp');
});
test('protocoles proposés : en service, du bon type, spécialité du séjour d’abord',()=>{
 const l=[{id:'a',nom:'B',type:'preop',statut:'actif',specialite:'Toutes spécialités'},{id:'b',nom:'A',type:'preop',statut:'actif',specialite:'Orthopédie'},{id:'c',type:'preop',statut:'archive',specialite:'Orthopédie'},{id:'d',type:'postop',statut:'actif',specialite:'Orthopédie'},{id:'e',nom:'C',type:'preop',statut:'actif',specialite:'ORL'}];
 assert.deepEqual(P.proposes(l,'preop','Orthopédie').map(x=>x.id),['b','a','e']);
});

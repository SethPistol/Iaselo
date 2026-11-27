'use strict';
// Rédaction assistée : contexte pseudonymisé, brouillons par règles, consignes du modèle génératif.
const test=require('node:test'),assert=require('node:assert/strict'),X=require('../dist/redaction-ia-regles.js');
const dossier={core:{specialty:'Orthopédie',mode:'Hospitalisation',stage:'Hospitalisation',identity:{lastName:'NOMFICTIF',firstName:'Prénomfictif',birthDate:'1960-06-15',sex:'Féminin'}},
 consult:{asa:'2',allergies:'Pénicilline',history:'HTA',plan:'Rachianesthésie',validated:true,medicationRows:[{name:'BISOPROLOL 5 mg',frequency:'1 le matin',decision:'Poursuivre'},{name:'Retiré',removed:true}],ext:{surgeryDate:'2026-12-10',consultDate:'2026-11-20',airwayConclusion:'Mallampati 1',author:'Dr Anesth'}},
 surgicalAnnouncement:{published:{fields:{procedure:'Prothèse totale de genou',laterality:'Droite',surgeon:'Dr Chir'}}},
 discharge:{summary:'Suites simples.',instructions:'Marche avec cannes.'},parcoursSuivi:{reponses:[{etape:'j+3-suivi',alerts:[{label:'Douleur 6/10'}],traite:{action:'Rappelée'}}]}};
test('rédaction : contexte sans donnée directement identifiante',()=>{
 const c=X.contexte(dossier),s=JSON.stringify(c);
 assert.doesNotMatch(s,/NOMFICTIF|Prénomfictif|1960-06-15/);assert.equal(c.patient.age,66);assert.equal(c.patient.sexe,'femme');
 assert.deepEqual(c.consultation.traitements,['BISOPROLOL 5 mg 1 le matin (poursuivre)']);assert.equal(c.suiviDomicile[0].traite,'Rappelée');
});
test('rédaction : brouillons par règles, avertissement, champs manquants signalés',()=>{
 const c=X.contexte(dossier);
 for(const type of Object.keys(X.TYPES)){const r=X.gabarit(type,c);assert.ok(r.texte.startsWith(X.AVERT),type);assert.doesNotMatch(r.texte,/NOMFICTIF|Prénomfictif/)}
 const cons=X.gabarit('consultation',c).texte;assert.match(cons,/Patiente de 66 ans, Prothèse totale de genou \(droite\) prévue le 10\/12\/2026/);assert.match(cons,/Classe ASA : 2/);assert.match(cons,/Allergies : Pénicilline/);
 const vide=X.gabarit('consultation',X.contexte({core:{}}));assert.deepEqual(vide.manquants,['score ASA','allergies','technique anesthésique','évaluation des voies aériennes']);assert.match(vide.texte,/\[à compléter\]/);
 assert.match(X.gabarit('sortie',c).texte,/réalisée le 10\/12\/2026[\s\S]*Suites simples[\s\S]*Douleur 6\/10 → Rappelée/);
 assert.throws(()=>X.gabarit('inconnu',c));
});
test('rédaction : consignes du modèle (pas d’invention, [à compléter])',()=>{
 const k=X.consignes('cro');assert.match(k,/UNIQUEMENT/);assert.match(k,/\[à compléter\]/);assert.match(k,/compte rendu opératoire/i);
});

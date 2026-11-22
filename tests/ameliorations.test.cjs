'use strict';
// Règles des améliorations 1.1 : allergies, réinjection d'antibioprophylaxie, NEWS2, code-barres, import de programme.
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../dist/ameliorations-regles.js');

test('Allergies : classe, réactivité croisée, mentions libres, absence d’allergie',()=>{
 assert.equal(A.lireAllergies('À vérifier').statut,'a-verifier');
 assert.equal(A.lireAllergies('Aucune allergie connue').statut,'aucune');
 assert.equal(A.lireAllergies('Pas d’allergie connue').statut,'aucune');
 const pen=A.controleAllergies('Pénicilline (urticaire en 2010)','Amoxicilline 1 g');assert.equal(pen.length,1);assert.equal(pen[0].niveau,'allergie');
 const croise=A.controleAllergies('pénicillines','Céfazoline 2 g IV');assert.equal(croise[0].niveau,'croisee');assert.match(croise[0].message,/croisée/);
 assert.deepEqual(A.controleAllergies('Pénicilline','Paracétamol 1 g'),[]);
 assert.equal(A.controleAllergies('AINS, latex','Kétoprofène 100 mg')[0].niveau,'allergie');
 assert.equal(A.controleAllergies('Curares (choc au rocuronium)','Atracurium')[0].classe,'Curares');
 assert.equal(A.controleAllergies('Néfopam','Acupan 20 mg')[0].niveau,'allergie');
 assert.equal(A.controleAllergies('Pristinamycine','Pristinamycine 1 g')[0].niveau,'allergie','mention libre hors classes');
 assert.deepEqual(A.controleAllergies('Aucune','Amoxicilline'),[]);
 assert.deepEqual(A.controleAllergies('À vérifier','Amoxicilline'),[]);
 assert.equal(A.lireAllergies('Latex').latex,true);
 assert.deepEqual(A.controleAllergies('Iode','Bétadine scrub'),[{niveau:'allergie',classe:'Iode (antiseptiques et produits de contraste)',message:'Allergie déclarée : Iode (antiseptiques et produits de contraste). Bétadine scrub appartient à cette classe.'}]);
});

test('Antibioprophylaxie : délai de réinjection depuis la dernière injection, statuts',()=>{
 const rec=(drug,at)=>({kind:'Médicament',at,values:{drug}});
 const r=A.reinjections([rec('Céfazoline 2 g','2026-11-22T08:00:00Z'),rec('Sufentanil','2026-11-22T08:01:00Z')],new Date('2026-11-22T10:00:00Z'));
 assert.equal(r.length,1);assert.equal(r[0].statut,'a-venir');assert.equal(r[0].resteMinutes,120);assert.equal(r[0].prochaine,'2026-11-22T12:00:00.000Z');
 assert.equal(A.reinjections([rec('Céfazoline','2026-11-22T08:00:00Z')],new Date('2026-11-22T11:50:00Z'))[0].statut,'bientot');
 assert.equal(A.reinjections([rec('Céfazoline','2026-11-22T08:00:00Z')],new Date('2026-11-22T12:05:00Z'))[0].statut,'due');
 assert.equal(A.reinjections([rec('Céfazoline','2026-11-22T08:00:00Z')],new Date('2026-11-22T12:40:00Z'))[0].statut,'depassee');
 const two=A.reinjections([rec('Céfazoline','2026-11-22T08:00:00Z'),rec('Céfazoline 1 g','2026-11-22T12:00:00Z')],new Date('2026-11-22T12:30:00Z'))[0];
 assert.equal(two.injections,2);assert.equal(two.prochaine,'2026-11-22T16:00:00.000Z');
 assert.equal(A.reinjections([rec('Céfuroxime','2026-11-22T08:00:00Z')],new Date('2026-11-22T09:00:00Z'))[0].intervalle,2);
 assert.equal(A.reinjections([rec('Vancomycine','2026-11-22T08:00:00Z')])[0].statut,'sans');
 assert.deepEqual(A.reinjections([{...rec('Céfazoline','2026-11-22T08:00:00Z'),voided:true}]),[]);
 assert.equal(A.duree(125),'2 h 05');assert.equal(A.duree(-8),'8 min');
});

test('NEWS2 : barème du Royal College of Physicians et niveaux de risque',()=>{
 const ok=A.news2({rr:16,spo2:98,o2:'Air',sbp:125,hr:72,avpu:'A',temp:36.8});assert.equal(ok.total,0);assert.equal(ok.complet,true);assert.equal(ok.niveau,'nul');
 const bad=A.news2({rr:26,spo2:91,o2:'Oxygène',sbp:88,hr:135,avpu:'V',temp:39.5});assert.equal(bad.total,3+3+2+3+3+3+2);assert.equal(bad.niveau,'eleve');
 assert.equal(A.news2({rr:22,spo2:95,o2:'Air',sbp:105,hr:95,avpu:'A',temp:38.2}).total,2+1+0+1+1+0+1);
 const one=A.news2({rr:8,spo2:97,o2:'Air',sbp:130,hr:70,avpu:'A',temp:37});assert.equal(one.total,3);assert.equal(one.niveau,'moyen-unique');
 const part=A.news2({sbp:120,hr:80});assert.equal(part.complet,false);assert.ok(part.manquants.includes('SpO₂'));
 // Bornes
 assert.equal(A.news2({hr:40}).total,3);assert.equal(A.news2({hr:41}).total,1);assert.equal(A.news2({hr:91}).total,1);assert.equal(A.news2({hr:131}).total,3);
 assert.equal(A.news2({temp:35}).total,3);assert.equal(A.news2({temp:36.1}).total,0);assert.equal(A.news2({temp:39.1}).total,2);
 assert.equal(A.news2({sbp:220}).total,3);assert.equal(A.news2({sbp:110}).total,1);
});

test('Code 128 : motifs de 11 modules, clé de contrôle, caractères accentués',()=>{
 assert.equal(A.C128.length,107);assert.ok(A.C128.slice(0,106).every(p=>[...p].reduce((s,x)=>s+Number(x),0)===11));
 const c=A.code128('PJJ123C');assert.equal(c.codes[0],104);assert.equal(c.codes.at(-1),106);
 assert.equal(c.codes.at(-2),(104+48*1+42*2+42*3+17*4+18*5+19*6+35*7)%103);
 assert.equal(A.code128('DÉMO-001').texte,'DEMO-001');
 assert.match(A.code128Svg('DEMO-001'),/^<svg class="am-barcode"/);
 assert.throws(()=>A.code128(''),/vide/);
});

test('Import du programme : CSV point-virgule, colonnes reconnues, dates et heures françaises, erreurs par ligne',()=>{
 const p=A.lireProgramme(A.MODELE_CSV);
 assert.deepEqual(p.manquantes,[]);assert.equal(p.lignes.length,2);
 const l=p.lignes[0];assert.equal(l.nom,'FICTIF');assert.equal(l.naissance,'1970-02-01');assert.equal(l.date,'2026-11-24');assert.equal(l.heure,'08:00');assert.equal(l.duree,90);assert.equal(l.specialite,'Orthopédie');assert.equal(l.sexe,'F');assert.deepEqual(l.erreurs,[]);
 assert.equal(p.lignes[1].mode,'Ambulatoire');
 const q=A.lireProgramme('"Nom","Prénom","DDN","Date","Heure","Durée","Acte"\n"TEST","Zoé","1990-03-04","25/11/2026","14h30","1h15","Amygdalectomie, adulte"\n"","X","bad","","25",""," "');
 assert.equal(q.lignes[0].heure,'14:30');assert.equal(q.lignes[0].duree,75);assert.equal(q.lignes[0].intervention,'Amygdalectomie, adulte');assert.equal(q.lignes[0].specialite,'ORL');
 assert.ok(q.lignes[1].erreurs.length>=3);
 assert.deepEqual(A.lireProgramme('Nom;Prénom\nA;B').manquantes,['naissance','date','heure']);
 assert.equal(A.parseCsv('a\tb\n1\t2').separateur,'\t');
 assert.equal(A.dateIso('30/02/1990'),'');assert.equal(A.dateIso('29/02/2024'),'2024-02-29');assert.equal(A.dateIso('2026-13-01'),'');
});

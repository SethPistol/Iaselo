// Contrôle de sécurité du traitement en cours (26/11/2026, demande de Romain). Patients fictifs uniquement.
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../dist/securite-traitement-regles.js'),A=require('../dist/ameliorations-regles.js');
const rx=(name,instructions,extra={})=>({name,instructions,category:'Médicament',...extra});
const terrainFictif=(o={})=>({age:50,poids:70,sexe:'F',dfg:90,ir:false,ih:false,atcd:'',allergies:'',ambulatoire:false,...o});
const alertes=(res,i,col)=>res.lignes[i].alertes.filter(a=>!col||a.col===col);

test('lecture de la ligne : dose, voie, rythme, durée, si besoin',()=>{
 let L=S.lireLigne(rx('Dexaméthasone 4 mg/ml','8 mg à 6h, 14h, 22h IV lente pendant 2 jours'));
 assert.equal(L.dose.valeur,8);assert.equal(L.voie,'IV');assert.equal(L.rythme.parJour,3);assert.equal(L.duree.jours,2);assert.equal(L.siBesoin,false);
 L=S.lireLigne(rx('Doliprane 1 g','1 cp per os si douleur, max 4/j'));
 assert.equal(L.dose.valeur,1000,'1 comprimé × dosage du libellé');assert.equal(L.voie,'PO');assert.equal(L.siBesoin,true);assert.equal(L.max.prises,4);assert.equal(S.doseJour(L),4000);
 L=S.lireLigne(rx('Paracétamol','1 g x 4/j IV jusqu’à la sortie'));assert.equal(S.doseJour(L),4000);assert.ok(L.duree);
 L=S.lireLigne(rx('Morphine','2 mg/h IVSE'));assert.equal(L.rythme.continu,true);assert.equal(S.doseJour(L),48);
 L=S.lireLigne(rx('Lovenox','4000 UI SC le soir pendant 10 jours'));assert.equal(L.dose.unite,'UI');assert.equal(L.rythme.parJour,1);
 assert.equal(S.lireLigne(rx('Morphine 10 mg/ml','')).dose,null,'la concentration n’est pas une dose');
});

test('reconnaissance des molécules : DCI, spécialités, associations, BDPM',()=>{
 assert.deepEqual(S.molecules('AMOX/AC.CLAV PAN 1G/200MG FL'),['amoxicilline-clavulanique']);
 assert.deepEqual(S.molecules('Codoliprane 500 mg/30 mg').sort(),['codeine','paracetamol']);
 assert.deepEqual(S.molecules('Zophren 4 mg'),['ondansetron']);
 assert.deepEqual(S.molecules('Spécialité X',['CHLORHYDRATE DE MORPHINE TRIHYDRATÉ']),['morphine']);
 assert.deepEqual(S.molecules('Chlorure de sodium 0,9 %'),[]);
});

test('interactions : niveaux du thésaurus, une alerte de chaque côté',()=>{
 const res=S.analyser([rx('Morphine','5 mg SC toutes les 6 h'),rx('Nalbuphine','10 mg IV toutes les 4 h'),rx('Kétoprofène','100 mg IV x2/j pendant 2 jours'),rx('Ibuprofène 400 mg','1 cp x3/j PO pendant 3 jours')],{terrain:terrainFictif()});
 const i0=alertes(res,0,'interactions').find(a=>/Nalbuphine/.test(a.titre));assert.equal(i0.n,3);
 assert.ok(alertes(res,1,'interactions').some(a=>/Morphine/.test(a.titre)&&a.n===3));
 assert.equal(alertes(res,2,'interactions').find(a=>/Ibuprofène/.test(a.titre)).n,3,'deux AINS : déconseillé');
 const ci=S.analyser([rx('Primpéran 10 mg','10 mg IV x3/j'),rx('Modopar 125','1 gélule x3/j PO')],{terrain:terrainFictif()});
 assert.equal(alertes(ci,0,'interactions')[0].n,4,'métoclopramide + lévodopa : contre-indication');
});

test('physico-chimie : seulement entre deux lignes intraveineuses',()=>{
 const iv=S.analyser([rx('Rocéphine 2 g','2 g IV 1 fois par jour'),rx('Gluconate de calcium 10 %','1 g IV dose unique')],{terrain:terrainFictif()});
 assert.equal(alertes(iv,0,'physico')[0].n,3);
 const po=S.analyser([rx('Rocéphine 2 g','2 g IV 1 fois par jour'),rx('Gluconate de calcium','1 g per os')],{terrain:terrainFictif()});
 assert.equal(alertes(po,0,'physico').length,0);
 const glu=S.analyser([rx('Augmentin 1 g/200 mg','1 g IV toutes les 8 h dans 100 ml de G5 %')],{terrain:terrainFictif()});
 assert.ok(alertes(glu,0,'physico').some(a=>/glucosée/.test(a.texte)));
});

test('posologies : cumul des lignes, poids, âge, fonction rénale, durée',()=>{
 let res=S.analyser([rx('Perfalgan 10 mg/ml','1 g IV toutes les 6 h'),rx('Doliprane 1 g','1 cp PO si douleur max 4/j')],{terrain:terrainFictif()});
 const p=alertes(res,0,'posologie').find(a=>a.titre==='Dose journalière dépassée');assert.equal(p.n,3);assert.match(p.texte,/8 g.*cumul de 2 lignes/);
 assert.ok(alertes(res,0,'autres').some(a=>/Doublon/.test(a.titre)));
 res=S.analyser([rx('Paracétamol','1 g IV toutes les 6 h')],{terrain:terrainFictif({poids:42})});
 assert.ok(alertes(res,0,'posologie').some(a=>/par prise/.test(a.titre)),'15 mg/kg sous 50 kg');
 res=S.analyser([rx('Paracétamol','1 g IV toutes les 4 h')],{terrain:terrainFictif({dfg:20})});
 assert.ok(alertes(res,0,'posologie').some(a=>a.titre==='Intervalle trop court'),'6 h si DFG < 30');
 res=S.analyser([rx('Tramadol 50 mg','100 mg PO toutes les 6 h')],{terrain:terrainFictif({age:80})});
 assert.ok(alertes(res,0,'posologie').some(a=>/300 mg/.test(a.texte)),'300 mg/j après 75 ans');
 res=S.analyser([rx('Primpéran','10 mg IV x3/j pendant 7 jours')],{terrain:terrainFictif()});
 assert.ok(alertes(res,0,'posologie').some(a=>/Durée maximale/.test(a.titre)));
 res=S.analyser([rx('Augmentin 2 g/200 mg','2 g IV toutes les 8 h')],{terrain:terrainFictif()});
 assert.equal(alertes(res,0,'posologie').length,0,'2 g/200 mg : 200 mg de clavulanate par injection, 600 mg/j');
 res=S.analyser([rx('Augmentin 1 g/200 mg','2 g IV toutes les 8 h')],{terrain:terrainFictif()});
 assert.ok(alertes(res,0,'posologie').some(a=>/clavulanique/.test(a.titre)),'2 g de la forme 1 g/200 mg : 400 mg de clavulanate');
 res=S.analyser([rx('Lovenox 4000 UI','4000 UI SC 1 fois par jour')],{terrain:terrainFictif({dfg:22})});
 assert.ok(alertes(res,0,'posologie').some(a=>/2000 UI/.test(a.texte)));
});

test('mises en garde : allergie, rein, âge, antécédents',()=>{
 const res=S.analyser([rx('Augmentin 1 g','1 g IV x3/j'),rx('Kétoprofène','100 mg IV x2/j'),rx('Acupan 20 mg','20 mg IV toutes les 6 h')],
  {terrain:terrainFictif({allergies:'Pénicilline',dfg:25,age:78,atcd:'epilepsie'}),allergies:A.controleAllergies});
 assert.equal(alertes(res,0,'misesEnGarde')[0].n,4);assert.equal(alertes(res,0,'misesEnGarde')[0].titre,'Allergie');
 assert.ok(alertes(res,1,'misesEnGarde').some(a=>a.n===4&&/DFG < 30/.test(a.texte)),'AINS contre-indiqué');
 assert.ok(alertes(res,2,'misesEnGarde').some(a=>a.n===4&&/convulsions/.test(a.texte)),'néfopam et épilepsie');
 assert.ok(alertes(res,1,'misesEnGarde').some(a=>/75 ans/.test(a.texte)));
});

test('terrain : âge, DFG de Cockcroft-Gault, traitement personnel',()=>{
 const stay={mode:'Ambulatoire',identity:{lastName:'FICTIF-TEST',birthDate:'1956-05-01'},consult:{allergies:'Aucune',history:'HTA',treatments:'Lamictal 100 mg — 1 cp le matin\nRamipril 5 mg — 1 cp',ext:{weight:'70',creatinine:'100',sex:'M'}}};
 const t=S.terrain(stay,'2026-11-26');assert.equal(t.age,70);assert.equal(t.dfg,Math.round(70*70*1.23/100));assert.equal(t.ambulatoire,true);
 const p=S.traitementPersonnel(stay);assert.equal(p.length,2);assert.equal(p[0].personnel,true);assert.equal(p[0].instructions,'1 cp le matin');
 const res=S.analyser([rx('Kétoprofène','100 mg IV x2/j pendant 2 jours'),...p],{terrain:t});
 assert.ok(alertes(res,0,'interactions').some(a=>/Ramipril/.test(a.titre)&&a.n===2));
 assert.equal(alertes(res,1,'manquant').length,0,'pas d’informations manquantes exigées pour le traitement personnel');
 assert.ok(alertes(res,1,'conduite').length===1&&/ambulatoire/.test(alertes(res,1,'conduite')[0].texte));
});

test('dopants, conduite, informations manquantes, lignes non sécurisées',()=>{
 const res=S.analyser([rx('Solumédrol 40 mg','40 mg IV'),rx('Morphine',''),rx('Produit inconnu','1 cp'),{name:'NFS',category:'Examen biologique',instructions:'J1'}],{terrain:terrainFictif()});
 assert.ok(alertes(res,0,'dopant').length===1);
 assert.ok(alertes(res,0,'manquant').some(a=>a.titre==='Rythme absent'));
 const m=alertes(res,1,'manquant').map(a=>a.titre);assert.ok(m.includes('Dose absente')&&m.includes('Voie absente'));
 assert.ok(alertes(res,1,'conduite').length===1);
 assert.equal(res.lignes[2].securisee,false);assert.match(res.lignes[2].raison,/non reconnu/);
 assert.equal(res.lignes[3].securisee,false);assert.match(res.lignes[3].raison,/non médicamenteuse/);
 const c=res.compteurs;assert.equal(c.total,Object.values(c.colonnes).reduce((a,b)=>a+b,0));
});

test('validation : justificatif exigé pour une alerte de niveau 3 ou 4',()=>{
 const res=S.analyser([rx('Kétoprofène','100 mg IV x2/j pendant 2 jours'),rx('Ibuprofène','400 mg PO x3/j pendant 2 jours'),rx('Paracétamol','1 g IV toutes les 6 h pendant 2 jours')],{terrain:terrainFictif()});
 assert.deepEqual(S.bloquantes(res,3).map(it=>it.index),[0,1]);
 assert.deepEqual(S.bloquantes(res,3,[2]).map(it=>it.index),[]);
 assert.equal(S.justificatifValide('ok'),false);assert.equal(S.justificatifValide('Relais prévu, un seul AINS à J1'),true);
 assert.ok(S.MOLECULES.every(m=>m.nom&&m.a.length&&Array.isArray(m.c)),'base de règles bien formée');
 assert.ok(S.INTERACTIONS.every(([,, n])=>[1,2,3,4].includes(n)));
});

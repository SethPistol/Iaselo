'use strict';
// Parcours de soins à distance : programmes, calendrier, contrôle des réponses, alertes, indicateurs, e-Satis, SMS.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/parcours-suivi-regles.js');

test('parcours : programme proposé selon l’intervention, puis le mode, puis la spécialité',()=>{
 assert.equal(P.proposer({intervention:'Prothèse totale de hanche gauche'}),'raac-ortho');
 assert.equal(P.proposer({intervention:'Colectomie gauche'}),'raac-digestif');
 assert.equal(P.proposer({intervention:'Coloscopie'}),'endoscopie');
 assert.equal(P.proposer({intervention:'Arthroscopie du genou',specialite:'Orthopédie',mode:'Ambulatoire'}),'ambulatoire');
 assert.equal(P.proposer({intervention:'Ostéosynthèse',specialite:'Orthopédie',mode:'Hospitalisation'}),'raac-ortho');
});
test('parcours : chaque étape renvoie à une fiche ou un questionnaire existant, sans doublon',()=>{
 for(const [id,p] of Object.entries(P.PROGRAMMES)){
  assert.equal(new Set(p.etapes.map(e=>e.id)).size,p.etapes.length,id);
  for(const e of p.etapes){assert.ok(e.j>=-7&&e.j<=30,e.id);assert.ok(e.type==='fiche'?P.FICHES[e.fiche]:P.QUESTIONNAIRES[e.questionnaire],e.id);assert.notEqual(e.j,1,'J+1 déjà couvert par le questionnaire du lendemain')}
 }
});
test('parcours : calendrier et états des étapes',()=>{
 const envois=[{etape:'j+5-reeducation',ok:true,lue:'x'},{etape:'j+7-suivi',ok:true},{etape:'j+14-suivi',ok:false,raison:'Pas de numéro'}];
 const c=Object.fromEntries(P.calendrier('raac-ortho','2026-11-01',envois,[],'2026-11-15').map(e=>[e.id,[e.date,e.code]]));
 assert.deepEqual(c['j-7-preparer'],['2026-10-25','manquee']);assert.deepEqual(c['j+5-reeducation'],['2026-11-06','lue']);
 assert.deepEqual(c['j+7-suivi'],['2026-11-08','en-attente']);assert.deepEqual(c['j+14-suivi'],['2026-11-15','echec']);assert.deepEqual(c['j+30-resultats'],['2026-12-01','a-venir']);
 assert.deepEqual(P.calendrier('raac-ortho','',[],[]),[]);
});
test('parcours : réponses contrôlées et alertes (seuils du J+1)',()=>{
 assert.equal(P.valider('suivi',{douleur:'11'}).ok,false);
 const v=P.valider('suivi',{douleur:'3',temperature:'38,6',cicatrice:'Oui',saignement:'Non',respiration:'Non',mollet:'Non',marche:'Non',rappel:'Oui',question:'  '});
 assert.ok(v.ok,v.errors.join());assert.equal(v.answers.temperature,38.6);assert.equal(v.answers.question,undefined);
 assert.deepEqual(P.alertes('suivi',v.answers).map(a=>a.label),['Fièvre 38,6 °C','Cicatrice inflammatoire','Demande à être rappelé(e)','Ne se lève pas / ne marche pas']);
 assert.deepEqual(P.alertes('suivi',{...v.answers,temperature:37,cicatrice:'Non',rappel:'Non',marche:'Oui'}),[]);
 const prom=P.valider('prom-prem',{douleur:'1',activites:'9',sante:'85',probleme:'Non',ameliore:'Oui',information:'9',douleurPec:'8',accueil:'10',sortie:'9',recommande:'10'});
 assert.ok(prom.ok,prom.errors.join());assert.equal(P.valider('prom',{douleur:'1',activites:'9',sante:'101',probleme:'Non',ameliore:'Oui'}).ok,false);
 assert.deepEqual(P.alertes('prom',{douleur:2,activites:3,sante:30,probleme:'Oui',ameliore:'Non'}).map(a=>a.label),['Recours aux soins non prévu depuis la sortie','État de santé ressenti bas (30/100)']);
});
test('parcours : indicateurs PROMs/PREMs et score de recommandation',()=>{
 const rep=(etape,answers,alerts=[])=>({etape,answers,alerts,traite:null});
 const I=P.indicateurs([
  {stay:'A',programme:'raac-ortho',envois:[{etape:'j+7-suivi',ok:true},{etape:'j+30-resultats',ok:true}],reponses:[rep('j+7-suivi',{douleur:6},[{level:'warn'}]),rep('j+30-resultats',{douleur:2,activites:8,sante:80,ameliore:'Oui',recommande:10,information:9})]},
  {stay:'B',programme:'ambulatoire',envois:[{etape:'j+30-resultats',ok:true}],reponses:[rep('j+30-resultats',{douleur:0,activites:10,sante:90,ameliore:'Oui',recommande:5,information:7})]}
 ]);
 assert.equal(I.inscrits,2);assert.equal(I.questionnairesEnvoyes,3);assert.equal(I.tauxReponse,100);assert.equal(I.alertesOuvertes,1);
 assert.equal(I.proms.douleur,1);assert.equal(I.proms.ameliore,100);assert.equal(I.prems.nps,0);assert.equal(I.prems.information,8);
});
test('parcours : fichier e-Satis (e-mail, opposition, date de sortie) et SMS sans donnée de santé',()=>{
 const r=P.esatisCsv([{stay:'S1',email:'a@b.fr',dateEntree:'2026-11-02',dateSortie:'2026-11-04',mode:'Hospitalisation'},{stay:'S2',email:'',dateSortie:'2026-11-03'},{stay:'S3',email:'c@d.fr',dateSortie:'2026-11-05',opposition:true},{stay:'S;4',email:'e@f.fr',dateSortie:'2026-11-06',mode:'Ambulatoire'}],{finess:'750000000'});
 assert.equal(r.retenus,2);assert.equal(r.exclus,2);
 assert.equal(r.csv,'finess;numero_sejour;email;date_entree;date_sortie;mode_hospitalisation\r\n750000000;S1;a@b.fr;2026-11-02;2026-11-04;hospitalisation\r\n750000000;"S;4";e@f.fr;2026-11-06;2026-11-06;ambulatoire\r\n');
 for(const e of P.PROGRAMMES['raac-ortho'].etapes){const t=P.sms('Clinique X',e,'https://x/parcours.html#acces=abc');assert.match(t,/^Clinique X : /);assert.match(t,/15\.$/);assert.doesNotMatch(t,/douleur|prothèse|genou|RAAC|cicatrice/i);assert.ok(t.length<=320,t.length)}
});

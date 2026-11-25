'use strict';
// Règles des modules issus de la comparaison au marché : HL7/HPRIM, transfusion, EI, agenda, honoraires, stérilisation, planning, dictée.
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../dist/interop-hl7.js'),M=require('../dist/marche-regles.js');

const ORU=['MSH|^~\\&|LABO|BIOGROUP|IASELO|CLINIQUE|20261125083000||ORU^R01^ORU_R01|MSG0001|P|2.5',
 'PID|1||123456^^^LABO^PI~1850275123456^^^ASIP-SANTE-INS-NIR&1.2.250.1.213.1.4.8&ISO^INS||DUPONT^Marie^^^^^L~MARTIN^Marie^^^^^D||19850214|F',
 'PV1|1|O|||||||||||||||||NDA778',
 'OBR|1||P-998|BIO^Bilan préopératoire|||20261124073000',
 'OBX|1|NM|2823-3^Potassium^LN||6,8|mmol/L|3.5-5.0|HH|||F|||20261124090000',
 'OBX|2|NM|718-7^Hémoglobine^LN||13.1|g/dL|12-16||||F',
 'OBX|3|NM|777-3^Plaquettes^LN||140|G/L|150-400||||F',
 'NTE|1||Hémolyse légère'].join('\r');

test('HL7 : lecture, échappements, accusé de réception',()=>{
 const m=H.lireHl7('MSH|^~\\&|A|B|C|D|20261125||ADT^A01|X1|P|2.5\rPID|1||42^^^X^PI||O\\S\\BRIEN^Ann');
 assert.equal(H.val(H.seg(m,'MSH'),9,2),'A01');assert.equal(H.val(H.seg(m,'MSH'),10),'X1');
 assert.equal(H.val(H.seg(m,'PID'),5,1),'O^BRIEN','\\S\\ restitue ^');
 assert.match(H.ack('MSH|^~\\&|A|B|C|D|20261125||ADT^A01|X1|P|2.5','AA'),/MSA\|AA\|X1/);
 assert.throws(()=>H.lireHl7('PID|1'),/MSH/);
 assert.equal(H.dateHl7('20261124073000'),'2026-11-24T07:30:00');assert.equal(H.dateHl7('19850214'),'1985-02-14');
});
test('biologie HL7 ORU : patient, INS, résultats, valeurs critiques, commentaires',()=>{
 const b=H.lireBiologie(ORU);assert.equal(b.format,'HL7 v2 ORU^R01');
 const cr=b.comptesRendus[0];assert.equal(cr.patient.ins,'1850275123456');assert.equal(cr.patient.ipp,'123456');assert.equal(cr.patient.nom,'DUPONT');assert.equal(cr.patient.nomUsage,'MARTIN');assert.equal(cr.patient.naissance,'1985-02-14');assert.equal(cr.nda,'NDA778');
 const r=cr.demandes[0].resultats;assert.equal(r.length,3);
 assert.equal(r[0].critique,true);assert.equal(r[0].interpretation,'critique-haut');assert.equal(r[0].commentaire,'');
 assert.equal(r[1].interpretation,'normal');assert.equal(r[2].interpretation,'bas','calculé depuis l’intervalle');assert.equal(r[2].commentaire,'Hémolyse légère');
});
test('biologie HPRIM Santé',()=>{
 const hprim=['H|~^\\&|LABO01.HPR||BIOGROUP|||ORU|||||H2.2^C|20261124','P|1|IPP42||NDA9|DURAND^Paul||19600101|M','OBR|1||98|NFS^Numération','OBX|1|NM|HB^Hémoglobine^L||6,4|g/dL|13-17|L|||F','OBX|2|NM|K^Potassium^L||4.1|mmol/L|3.5-5||||F','L|1'].join('\n');
 const b=H.lireBiologie(hprim);assert.equal(b.format,'HPRIM Santé');const cr=b.comptesRendus[0];
 assert.equal(cr.patient.ipp,'IPP42');assert.equal(cr.patient.nom,'DURAND');assert.equal(cr.patient.naissance,'1960-01-01');assert.equal(cr.patient.sexe,'Masculin');
 assert.equal(cr.demandes[0].resultats[0].critique,true,'Hb 6,4 g/dL critique');assert.equal(cr.demandes[0].resultats[1].interpretation,'normal');
 assert.throws(()=>H.lireBiologie('bonjour'),/Format non reconnu/);
});
test('rapprochement d’identité : automatique seulement sur INS ou IPP',()=>{
 const sejours=[{id:'S1',identity:{lastName:'DUPONT',firstName:'Marie',birthDate:'1985-02-14',ins:'1850275123456'}},{id:'S2',identity:{lastName:'Dupont',firstName:'Marie Claire',birthDate:'1985-02-14'}},{id:'S3',identity:{lastName:'DUPONT',firstName:'Anne',birthDate:'1985-02-14'}}];
 const r=H.rapprocher({ins:'1850275123456',nom:'DUPONT',prenom:'Marie',naissance:'1985-02-14'},sejours);assert.equal(r.auto,'S1');
 const r2=H.rapprocher({nom:'DUPONT',prenom:'Marie',naissance:'1985-02-14'},sejours.slice(1));assert.equal(r2.auto,null,'nom + naissance : proposition seulement');
 assert.deepEqual(r2.candidats.map(c=>c.niveau),['probable','possible']);
});
test('ADT entrant et DFT sortant',()=>{
 const pv1=Array(46).fill('');pv1[0]='PV1';pv1[1]='1';pv1[2]='I';pv1[3]='CHIR^204^B';pv1[19]='NDA55';pv1[44]='20261124080000';
 const a=H.lireAdt('MSH|^~\\&|GAM|CLIN|IASELO|CLIN|20261125070000||ADT^A02|M2|P|2.5\rPID|1||777^^^GAM^PI||LEROY^Jean^^^^^L||19500505|M\r'+pv1.join('|'));
 assert.equal(a.evenement,'A02');assert.equal(a.libelle,'Mutation');assert.equal(a.chambre,'204');assert.equal(a.lit,'B');assert.equal(a.nda,'NDA55');assert.equal(a.patient.ipp,'777');assert.equal(a.entree,'2026-11-24T08:00:00');
 assert.throws(()=>H.lireAdt('MSH|^~\\&|GAM|CLIN|IASELO|CLIN|20261125||ADT^A99|M3|P|2.5'),/non pris en charge/);
 const dft=H.dftActes({patient:{ipp:'777',ins:'1500575123456',nom:'LEROY',prenom:'Jean',naissance:'1950-05-05',sexe:'Masculin'},nda:'NDA55',actes:[{code:'NFKA008',libelle:'Prothèse totale de hanche',date:'2026-11-24T09:00',activite:'4',rpps:'10001',executant:'Dr A'}]});
 const m=H.lireHl7(dft);assert.equal(H.val(H.seg(m,'MSH'),9,1),'DFT');assert.equal(H.val(H.seg(m,'FT1'),7,1),'NFKA008');assert.equal(H.val(H.seg(m,'FT1'),26,2),'4');
 assert.equal(H.identite(H.seg(m,'PID')).ins,'1500575123456','OID INS conservé (sous-composants)');assert.equal(H.val(H.seg(m,'PV1'),19),'NDA55');
});
test('moniteur : codes MDC et libellés',()=>{
 const m=H.lireMoniteur('MSH|^~\\&|GATEWAY|BLOC|IASELO|CLIN|20261125101500||ORU^R01|G1|P|2.5\rPV1|1|I|BLOC^S1\rOBR|1|||MON\rOBX|1|NM|150456^MDC_PULS_OXIM_SAT_O2^MDC||97|262688^%|||||F|||20261125101500\rOBX|2|NM|147842^MDC_ECG_HEART_RATE^MDC||72|264864^bpm\rOBX|3|NM|^NBP SYS||118|mmHg\rOBX|4|NM|999^Inconnu||5');
 assert.equal(m.salle,'S1');assert.deepEqual(m.mesures.map(x=>x.cle),['spo2','hr','sbp']);assert.equal(m.mesures[0].valeur,97);
});
test('transfusion : groupage, RAI, compatibilité, contrôle ultime',()=>{
 assert.equal(M.groupeValide([{groupe:'A+',prelevement:'2026-11-20T08:00',numeroPrelevement:'1'}]).valide,false);
 assert.equal(M.groupeValide([{groupe:'A+',prelevement:'2026-11-20T08:00',numeroPrelevement:'1'},{groupe:'A+',prelevement:'2026-11-20T08:00',numeroPrelevement:'1'}]).valide,false,'même prélèvement');
 assert.equal(M.groupeValide([{groupe:'A+',prelevement:'2026-11-20T08:00',numeroPrelevement:'1'},{groupe:'B+',prelevement:'2026-11-21T08:00',numeroPrelevement:'2'}]).discordance,true);
 const g=M.groupeValide([{groupe:'O-',prelevement:'2026-11-20T08:00',numeroPrelevement:'1'},{groupe:'O neg',prelevement:'2026-11-21T08:00',numeroPrelevement:'2'}]);assert.equal(g.valide,true);assert.equal(g.groupe,'O-');
 assert.equal(M.raiValide({prelevement:'2026-11-20T08:00',resultat:'negative'},'2026-11-23T09:00').valide,false,'> 72 h');
 assert.equal(M.raiValide({prelevement:'2026-11-20T08:00',resultat:'negative'},'2026-11-23T09:00',{antecedentsRecents:false}).valide,true,'21 jours sans antécédent');
 assert.equal(M.compatible('CGR','A+','B+').bloquant,true);assert.equal(M.compatible('CGR','AB+','O-').ok,true);
 assert.equal(M.compatible('PFC','O+','AB+').ok,true);assert.equal(M.compatible('PFC','AB+','O+').ok,false);
 assert.equal(M.compatible('CGR','O-','O+').alertes.length,1,'RhD');
 const items=Object.fromEntries(M.CUPT.map(([k])=>[k,'oui']));const poche={type:'CGR',groupe:'O-',peremption:'2026-12-20',reception:'2026-11-25T08:00'};
 assert.equal(M.controleUltime({poche,receveur:'A+',maintenant:'2026-11-25T09:00',carte:{patient:'A',poche:'O'},items}).ok,true);
 assert.match(M.controleUltime({poche,receveur:'A+',maintenant:'2026-11-25T09:00',carte:{patient:'B',poche:'O'},items}).erreurs.join(),/erreur d’identité/);
 assert.match(M.controleUltime({poche,receveur:'A+',maintenant:'2026-11-25T15:00',carte:{patient:'A',poche:'O'},items}).erreurs.join(),/6 h/);
 assert.match(M.controleUltime({poche,receveur:'A+',maintenant:'2026-11-25T09:00',carte:{patient:'A',poche:'O'},items:{...items,aspect:''}}).erreurs.join(),/Aspect/);
 assert.deepEqual(M.alertesSurveillance({temp:37,sbp:130},{temp:38.2,sbp:95,hr:125}),['Hausse de la température ≥ 1 °C','Baisse de la PAS ≥ 30 mmHg','FC ≥ 120/min']);
 assert.equal(M.tracabilite([{reception:'2026-11-22T08:00'}],'2026-11-25T08:00')[0].retard,true);
});
test('événements indésirables : EIGS, échéances, transitions',()=>{
 const ei={categorie:'transfusion',gravite:4,date:'2026-11-24',description:'Frissons et hypotension pendant la transfusion',consequence:'pronostic'};
 assert.equal(M.erreurEi(ei),'');assert.equal(M.eigs(ei),true);
 assert.deepEqual(M.echeancesEi(ei).map(e=>e.cle),['ars1','ars2','hemo']);
 assert.match(M.transitionEi('analyse','clos',ei),/EIGS/);assert.equal(M.transitionEi('analyse','clos',{...ei,arsVolet1:true,arsVolet2:true}),'');
 assert.match(M.transitionEi('declare','actions',ei),/impossible/);
 assert.match(M.transitionEi('actions','clos',{consequence:'aucune',actions:[{fait:false}]}),/actions/);
 assert.match(M.erreurEi({...ei,description:'court'}),/Décrivez/);
});
test('agenda : créneaux, chevauchements, délai avant intervention',()=>{
 const p={id:'P1',date:'2026-12-01',debut:'09:00',fin:'10:00',duree:20,medecin:'u1'};
 assert.deepEqual(M.creneaux(p).map(c=>c.heure),['09:00','09:20','09:40']);
 assert.deepEqual(M.libres([p],[{plage:'P1',heure:'09:20',statut:'reserve'},{plage:'P1',heure:'09:40',statut:'annule'}]).map(c=>c.heure),['09:00','09:40']);
 assert.match(M.erreurPlage({...p,id:'P2',debut:'09:30',fin:'11:00'},[p]),/Chevauchement/);assert.equal(M.erreurPlage({...p,id:'P2',debut:'10:00',fin:'11:00'},[p]),'');
 assert.match(M.alerteDelai('2026-12-01','2026-12-02'),/moins de 2 jours/);assert.equal(M.alerteDelai('2026-12-01','2026-12-08'),'');
});
test('honoraires : devis dès 70 € de dépassement, participation forfaitaire',()=>{
 const h=M.calculHonoraires([{code:'ZZLP025',libelle:'Anesthésie',base:'150,00',demande:'250'}]);
 assert.equal(h.base,15000);assert.equal(h.depassement,10000);assert.equal(h.devisObligatoire,true);assert.equal(h.pav,2400);
 assert.equal(M.calculHonoraires([{base:50,demande:100}]).devisObligatoire,false);
 assert.equal(M.calculHonoraires([{base:50,demande:100}],{secteur:'1'}).alertes.length,1);
 assert.ok(M.calculHonoraires([{base:'x'}]).erreur);
});
test('stérilisation, brancardage, planning, messagerie',()=>{
 assert.equal(M.liberationCycle({programme:'134 °C 18 min',bowieDick:'conforme',indicateur:'conforme',enregistrement:'conforme',siccite:'conforme'}).length,0);
 assert.equal(M.liberationCycle({programme:'134',bowieDick:'non-conforme',indicateur:'conforme',enregistrement:'conforme',siccite:'conforme'}).length,1);
 assert.equal(M.etatBoite({etat:'sterile',peremption:'2026-01-01'},'2026-11-25').utilisable,false);
 assert.equal(M.peremption('conteneur','2026-11-25'),'2027-05-24');assert.equal(M.risqueAtnc({cjd:true}),true);
 assert.equal(M.retardTransport({etat:'demande',priorite:'urgent',at:'2026-11-25T10:00:00Z'},'2026-11-25T10:25:00Z'),15);
 const aff=[{id:'a',personne:'Dr X',date:'2026-12-01',debut:'08:00',fin:'14:00',fonction:'anesthesiste',salle:'S1'},{id:'b',personne:'dr x',date:'2026-12-01',debut:'13:00',fin:'18:00',fonction:'anesthesiste',salle:'S2'}];
 assert.equal(M.chevauchements(aff).length,1);
 assert.deepEqual(M.couverture('2026-12-01',[{id:'S1',label:'Salle 1'}],aff),['Salle 1 : pas d’infirmier(ère) de bloc ni d’IADE','SSPI : aucun IDE affecté','Nuit : pas de garde ni d’astreinte d’anesthésie']);
 assert.equal(M.erreurMessage({texte:'ok',fil:'sejour:S1'}),'');assert.match(M.erreurMessage({texte:'ok',fil:'autre'}),/Fil/);
 assert.equal(M.nonLus([{auteurId:'a',lus:[]},{auteurId:'b',lus:['b']},{auteurId:'b',lus:['a']}],'a'),0+1);
});
test('assistant de consultation : propositions extraites et application sans écrasement',()=>{
 const p=M.extraireConsultation('Patient de 62 ans, pèse 84 kg, mesure 1 m 78. Tension 135 sur 80, fréquence cardiaque à 68, saturation 97 %. Allergie à la pénicilline. Antécédents : HTA, diabète. Traitement habituel : amlodipine 5 mg le matin. Mallampati 2. ASA 2. Il ronfle. Il monte deux étages sans difficulté. Rachianesthésie proposée.');
 const v=Object.fromEntries(p.map(x=>[x.champ,x.valeur]));
 assert.equal(v.poids,84);assert.equal(v.taille,178);assert.equal(v.pa_art,'135/80');assert.equal(v.fc,68);assert.equal(v.spo2,97);assert.equal(v.mallampati,'II');assert.equal(v.asa,'ASA 2');
 assert.match(v.allergie_detail,/pénicilline/);assert.match(v.ttt_habituel,/amlodipine 5 mg/);assert.match(v.atcd_detail,/HTA/);assert.deepEqual(v.sb,['S — Ronflement fort']);assert.deepEqual(v.technique,['Rachianesthésie']);
 assert.equal(M.extraireConsultation('Pas d’allergie connue.').find(x=>x.champ==='allergie_statut').valeur,'Aucune allergie connue');
 assert.equal(M.appliquerProposition({poids:80},{champ:'poids',valeur:84}).conflit,true,'saisie existante jamais écrasée');
 assert.equal(M.appliquerProposition({atcd_detail:'Asthme'},{champ:'atcd_detail',valeur:'HTA',mode:'ajouter'}).valeurs.atcd_detail,'Asthme\nHTA');
 assert.deepEqual(M.appliquerProposition({technique:['Anesthésie générale']},{champ:'technique',valeur:['Rachianesthésie']}).valeurs.technique,['Anesthésie générale','Rachianesthésie']);
});
test('courriers et secours',()=>{
 assert.equal(M.classerCourrier({objet:'CR opératoire',texte:'Compte rendu opératoire : arthroscopie'}).type,'compte-rendu-operatoire');
 assert.equal(M.classerCourrier({texte:'Échographie cardiaque transthoracique : FEVG 60 %'}).type,'cardiologie');
 const id=M.identiteCourrier('Objet : DUPONT Marie, née le 14/02/1985');assert.equal(id.nom,'DUPONT');assert.equal(id.naissance,'1985-02-14');
 const f=M.ficheSecours({id:'S1',identity:{lastName:'Dupont',firstName:'Marie',birthDate:'1985-02-14'},consult:{cpa:{allergenes:['Latex'],asa:'ASA 2',libelle:'PTH'}},rx:[{drug:'Paracétamol',dose:'1 g',status:'Active'},{drug:'X',status:'Arrêtée'}]});
 assert.equal(f.nom,'DUPONT');assert.equal(f.allergies,'Latex');assert.equal(f.prescriptions.length,1);
 assert.match(M.erreurSecret('court'),/12/);assert.equal(M.erreurSecret('Phrase de secours 2026'),'');
});
test('dictée : poids, taille et traitement dits sans mot-clé, sans confondre une dose en mg/kg',()=>{
 const p=t=>Object.fromEntries(M.extraireConsultation(t).map(x=>[x.champ,x.valeur]));
 const a=p('Patiente de 41 ans, 68 kg pour 1,65 m. Allergie à la pénicilline. Traitement : lévothyrox 75 µg. ASA 2.');
 assert.equal(a.poids,68);assert.equal(a.taille,165);assert.equal(a.allergie_detail,'pénicilline');assert.equal(a.ttt_habituel,'lévothyrox 75 µg');assert.equal(a.asa,'ASA 2');
 const b=p('morphine 0,1 mg/kg, taille 172 cm');assert.equal(b.poids,undefined);assert.equal(b.taille,172);
});

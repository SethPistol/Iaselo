const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/espace-patient-regles.js'),V=require('../dist/veille-regles.js');
const oui=Object.fromEntries(R.QUESTIONS.map(([id])=>[id,'oui']));
test('consentement : texte fidèle au formulaire de la Clinique du Trocadéro',()=>{
 assert.equal(R.QUESTIONS.length,8);assert.equal(R.FORMULAIRE.information.sections.length,5);
 assert.match(R.QUESTIONS[6][1],/^Je donne mon accord à une transfusion/);assert.match(R.QUESTIONS[7][1],/^Je donne mon accord à la procédure d’anesthésie\.$/);
 assert.match(R.FORMULAIRE.references,/L\. 1111-2 et L\. 1111-4/);
 const html=R.documentHTML(R.fiche({patient:{nom:'Fictif',prenom:'Test',naissance:'1980-01-01'},intervention:'PTH',datePrevue:'2026-12-03',consultation:{date:'2026-11-22',medecin:'Dr Démo'}}),{reponses:{...oui,transfusion:'non'},signataire:'Test FICTIF',signeLe:'2026-11-22T10:00:00Z'},{mode:'signature',empreinte:'a'.repeat(64)});
 assert.match(html,/FICTIF Test/);assert.match(html,/01\/01\/1980/);assert.match(html,/Signature du patient \(facultative\)/);assert.match(html,/Signature du médecin/);assert.match(html,/1 \/ 2/);assert.match(html,/2 \/ 2/);
 assert.equal((html.match(/cs-box is-on/g)||[]).length,8);assert.match(html,/class="is-non"/);
 assert.doesNotMatch(R.documentHTML(R.fiche({intervention:'<script>x</script>'}),null),/<script>x/);
});
test('consentement : réponse complète obligatoire, signature dessinée facultative et contrôlée',()=>{
 let v=R.validerReponse({reponses:{informe:'oui'},signataire:'AB',certifie:false});assert.equal(v.ok,false);assert.equal(v.manquantes.length,7);assert.equal(v.errors.length,3);
 v=R.validerReponse({reponses:{...oui,accord:'peut-être'},signataire:'Test FICTIF',certifie:true});assert.deepEqual(v.manquantes,['accord']);
 v=R.validerReponse({reponses:oui,signataire:'Test FICTIF',certifie:true});assert.equal(v.ok,true);assert.equal(v.reponse.signature,'');
 assert.equal(R.validerReponse({reponses:oui,signataire:'Test FICTIF',certifie:true,signature:'data:image/svg+xml;base64,AAAA'}).ok,false);
 assert.equal(R.validerReponse({reponses:oui,signataire:'Test FICTIF',certifie:true,signature:'data:image/png;base64,iVBORw0KGgo='}).ok,true);
 const f=R.fiche({patient:{nom:'A',prenom:'B',naissance:'1980-01-01'}});assert.deepEqual(R.ficheManquants(f),['intervention prévue','date de consultation','médecin']);
 const r1={reponses:oui,signataire:'X Y',signeLe:'2026-11-22T10:00:00Z'};assert.equal(R.canonique(f,r1),R.canonique(JSON.parse(JSON.stringify(f)),{...r1}));assert.notEqual(R.canonique(f,r1),R.canonique(f,{...r1,reponses:{...oui,accord:'non'}}));
});
test('consentement : statut, relance et alerte avant le bloc',()=>{
 const now=new Date('2026-11-30T09:00:00Z'),envoi={at:'2026-11-27T09:00:00Z',by:'Dr Démo',channels:['sms'],fiche:{}};
 assert.equal(R.statut(null).code,'aucun');assert.equal(R.statut({envoi}).code,'envoye');assert.equal(R.statut({envoi,ouvertLe:'x'}).code,'ouvert');
 assert.equal(R.statut({envoi,recu:{mode:'depot'}}).recu,false);assert.equal(R.statut({envoi,recu:{mode:'depot'},verification:{conforme:true}}).recu,true);
 assert.equal(R.statut({envoi,recu:{mode:'signature',reponses:{...oui,transfusion:'non'}}}).aRevoir,true);
 assert.equal(R.relance({envoi},'2026-12-10',now).conseillee,true);
 assert.equal(R.relance({envoi:{...envoi,at:'2026-11-30T08:00:00Z'}},'2026-12-10',now).conseillee,false);
 assert.equal(R.relance({envoi:{...envoi,at:'2026-11-29T18:00:00Z'}},'2026-12-02',now).conseillee,true);
 const stay={consult:{ext:{surgeryDate:'2026-12-01'}},espacePatient:{consentement:{envoi}}};
 const a=R.alerteBloc(stay,now);assert.equal(a.bloquant,true);assert.equal(a.niveau,'crit');assert.match(a.message,/demain/);
 assert.equal(R.alerteBloc({...stay,espacePatient:{consentement:{envoi,recu:{mode:'papier'}}}},now).bloquant,false);
 // Tour de contrôle et blocage de programmation (veille) : élément bloquant.
 const c=V.completude(stay).items.find(i=>i.id==='consentementSigne');assert.equal(c.ok,false);assert.equal(c.blocking,true);
 assert.equal(V.completude({...stay,espacePatient:{consentement:{envoi,recu:{mode:'signature',reponses:oui}}}}).items.find(i=>i.id==='consentementSigne').ok,true);
 assert.equal(V.completude({...stay,espacePatient:{consentement:{envoi,recu:{mode:'depot'}}}}).items.find(i=>i.id==='consentementSigne').ok,false);
 const exp=new Date(R.expiration('2026-12-01',now));assert.equal(exp.toISOString().slice(0,10),'2026-12-02');
 assert.ok(new Date(R.expiration('2026-11-30',now))-now>=48*3600000-1);
});
test('documents : type réel, PDF actifs refusés, tailles et nombre limités, noms nettoyés',()=>{
 const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF'),png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0]),jpg=new Uint8Array([0xff,0xd8,0xff,0xe0,0,0]);
 assert.equal(R.typeReel(pdf),'application/pdf');assert.equal(R.typeReel(png),'image/png');assert.equal(R.typeReel(jpg),'image/jpeg');
 assert.equal(R.typeReel(new TextEncoder().encode('<html><script>')),null);assert.equal(R.typeReel(new TextEncoder().encode('MZ\x90\x00')),null);
 assert.match(R.controleFichier(new TextEncoder().encode('%PDF-1.4 /OpenAction << /S /JavaScript /JS (app.alert(1)) >>'),{categorie:'bilan'}).error,/éléments actifs/);
 assert.equal(R.controleFichier(pdf,{categorie:'bilan'}).type,'application/pdf');
 assert.match(R.controleFichier(pdf,{categorie:'pirate'}).error,/type de document/);
 assert.match(R.controleFichier(new Uint8Array(R.LIMITES.fichier+1),{categorie:'bilan'}).error,/trop lourd/);
 assert.match(R.controleFichier(pdf,{categorie:'bilan',deja:Array(20).fill({taille:1})}).error,/Nombre maximal/);
 assert.match(R.controleFichier(new Uint8Array(0),{categorie:'bilan'}).error,/vide/);
 assert.equal(R.nomFichier('../../etc/passwd','application/pdf'),'etc passwd.pdf');
 assert.equal(R.nomFichier('photo.HEIC','image/jpeg'),'photo.jpg');assert.equal(R.nomFichier('bilan.jpeg','image/jpeg'),'bilan.jpeg');assert.equal(R.nomFichier('','application/pdf'),'document.pdf');
});
test('documents : dépôt ouvert jusqu’au lendemain de l’intervention inclus (heure de Paris)',()=>{
 assert.equal(R.depotOuvert('2026-12-03',new Date('2026-12-02T10:00:00Z')),true);
 assert.equal(R.depotOuvert('2026-12-03',new Date('2026-12-03T10:00:00Z')),true);
 assert.equal(R.depotOuvert('2026-12-03',new Date('2026-12-04T22:30:00Z')),true);   // 23 h 30 à Paris, le lendemain
 assert.equal(R.depotOuvert('2026-12-03',new Date('2026-12-04T23:30:00Z')),false);  // 0 h 30 à Paris, surlendemain
 assert.equal(R.depotOuvert('',new Date()),true);
 assert.ok(new Date(R.expiration('2026-12-03',new Date('2026-11-23T08:00:00Z')))>=new Date('2026-12-04T22:59:00Z'));
});

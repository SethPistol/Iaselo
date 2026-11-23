const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const R=require('../dist/cro-regles.js');
const FX=path.join(__dirname,'fixtures','cro');
const inflate=async b=>zlib.inflateRawSync(b);
const ATTENDU=['indication','installation','voieAbord','constatations','gestes','prelevements','fermeture','incidents','consignes'];

test('CRO : extraction locale des documents .txt, .docx, .doc (Word 97-2003), .odt, .rtf',async()=>{
 for(const f of ['txt','docx','doc','odt','rtf']){
  const t=await R.texteDocument(fs.readFileSync(path.join(FX,'cro-exemple.'+f)),f,{inflate});
  assert.match(t,/Cholécystectomie rétrograde/,f);assert.match(t,/Dissection du triangle de Calot/,f);assert.match(t,/cœlioscopie/i,f);
  const s=R.structurer(t);
  assert.deepEqual(s.reconnues,ATTENDU,f);
  assert.equal(s.entete.operation,'Cholécystectomie par cœlioscopie',f);
  assert.equal(s.entete.operateur,'Dr Martin (fictif)',f);
  assert.match(s.sections.gestes,/^Cholécystectomie rétrograde\. Dissection/,f);
  assert.match(s.sections.installation,/Antibioprophylaxie : céfazoline 2 g\./,f);
  assert.equal(s.sections.fermeture,'Fermeture aponévrotique ombilicale au fil résorbable, surjet intradermique. Pas de drainage.',f);
  assert.equal(s.sections.autre,undefined,f);
 }
});
test('CRO : un .docx renommé en .doc et un RTF enregistré en .doc sont lus quand même',async()=>{
 assert.match(await R.texteDocument(fs.readFileSync(path.join(FX,'cro-exemple.docx')),'doc',{inflate}),/Calot/);
 assert.match(await R.texteDocument(fs.readFileSync(path.join(FX,'cro-exemple.rtf')),'doc',{inflate}),/Calot/);
 await assert.rejects(R.texteDocument(Buffer.from('pas un document'),'doc',{inflate}),/Word 97-2003/);
});
test('CRO : texte d’un PDF à partir des éléments pdf.js, détection des scans',()=>{
 const t=R.textePdf([[{str:'INDICATION :',hasEOL:true},{str:'Cholécystite.',hasEOL:true}],[{str:'FERMETURE : surjet.',hasEOL:false}]]);
 assert.equal(t,'INDICATION :\nCholécystite.\n\nFERMETURE : surjet.');
 assert.equal(R.pdfScanne('',3),true);assert.equal(R.pdfScanne('x'.repeat(200),2),false);
});
test('CRO : dictée rangée dans les rubriques, commandes vocales comprises',()=>{
 const brut='Indication. Patiente de cinquante-deux ans présentant une cholécystite. Installation, décubitus dorsal sous anesthésie générale virgule antibioprophylaxie par céfazoline point à la ligne Voie d\'abord : cœlioscopie. Gestes réalisés. Cholécystectomie rétrograde nouveau paragraphe Fermeture. Surjet intradermique. Pas de drainage. Pertes sanguines minimes. Consignes postopératoires. Lever précoce. Anesthésie locale complémentaire.';
 const t=R.commandesVocales(brut);
 assert.match(t,/anesthésie générale, antibioprophylaxie par céfazoline\.\nVoie d'abord/);
 const s=R.structurer(t).sections;
 assert.equal(s.installation,'Décubitus dorsal sous anesthésie générale, antibioprophylaxie par céfazoline.');
 assert.equal(s.voieAbord,'Cœlioscopie.');
 assert.equal(s.gestes,'Cholécystectomie rétrograde.');
 assert.equal(s.fermeture,'Surjet intradermique. Pas de drainage.');
 assert.equal(s.incidents,'Pertes sanguines minimes.');
 // « Anesthésie » au milieu des consignes n'ouvre pas la rubrique (titre « strict » sans ponctuation).
 assert.equal(s.consignes,'Lever précoce. Anesthésie locale complémentaire.');
 // Titres dictés précédés de « rubrique » ; texte sans titre → « à classer ».
 const r=R.structurer('Le patient va bien. Rubrique consignes contrôle à un mois. Antibioprophylaxie : céfazoline 2 g.').sections;
 assert.equal(r.autre,'Le patient va bien.');assert.equal(r.consignes,'Contrôle à un mois.');
 // Mot-clé qui fait partie du contenu : rubrique « Installation », texte conservé tel quel.
 assert.equal(r.installation,'Antibioprophylaxie : céfazoline 2 g.');
 assert.equal(R.commandesVocales('deux points de suture'),'Deux points de suture');
 assert.equal(R.commandesVocales('drainage deux points lame de Delbet'),'Drainage : lame de Delbet');
});
test('CRO : nettoyage des transcriptions (boucles, sous-titres parasites)',()=>{
 const n=R.nettoyer('Fermeture cutanée de la paroi de la paroi de la paroi de la paroi de la paroi. Sous-titrage ST\' 501');
 assert.equal(n.douteux,true);assert.equal(n.texte,'Fermeture cutanée de la paroi.');
 assert.deepEqual(R.nettoyer(' Merci d\'avoir regardé cette vidéo !'),{texte:'',douteux:true});
 assert.deepEqual(R.nettoyer('Pas de drainage.'),{texte:'Pas de drainage.',douteux:false});
});
test('CRO : fusion, texte composé, contrôles avant signature',()=>{
 const sections=R.fusionner({gestes:'Cholécystectomie.'},{gestes:'Clips.',fermeture:'Surjet.'});
 assert.deepEqual(sections,{gestes:'Cholécystectomie.\nClips.',fermeture:'Surjet.'});
 // Réimporter le même document n'ajoute pas de doublon.
 assert.deepEqual(R.fusionner(sections,{gestes:'Clips.'}),sections);
 const cro={date:'2026-11-23',operation:'Cholécystectomie',operateur:'Dr A',sections,relu:true};
 assert.equal(R.composer(cro),'Intervention : Cholécystectomie\nDate : 23/11/2026\nOpérateur : Dr A\n\nGESTES RÉALISÉS\nCholécystectomie.\nClips.\n\nHÉMOSTASE, DRAINAGE ET FERMETURE\nSurjet.');
 assert.deepEqual(R.manques(cro),[]);
 assert.deepEqual(R.manques({...cro,relu:false}).map(x=>x.id),['relu']);
 assert.deepEqual(R.manques({date:'',operation:'',sections:{},relu:false}).map(x=>x.id),['date','operation','gestes','relu']);
 assert.deepEqual(R.manques({...cro,sections:{fermeture:'Surjet.'}}).map(x=>x.id),['gestes']);
 // Un document joint seul suffit (CRO rédigé ailleurs, déposé en PDF).
 assert.deepEqual(R.manques({...cro,sections:{},file:{name:'cro.pdf'}}),[]);
});
test('CRO : audio rééchantillonné à 16 kHz, découpé aux pauses, silences écartés',()=>{
 const taux=16000,voix=s=>Float32Array.from({length:s*taux},(_, i)=>0.3*Math.sin(i/7)),blanc=s=>new Float32Array(s*taux);
 const join=(...a)=>{const n=a.reduce((x,y)=>x+y.length,0),o=new Float32Array(n);let k=0;for(const x of a){o.set(x,k);k+=x.length}return o};
 const audio=join(voix(20),blanc(1),voix(15),blanc(1),voix(10));
 const coupes=R.decouper(audio,taux);
 assert.ok(coupes.every(([a,b])=>b-a<=28*taux));assert.equal(coupes.at(-1)[1],audio.length);
 assert.ok(Math.abs(coupes[0][1]-20.5*taux)<0.6*taux,'coupe dans la pause');
 assert.ok(R.dureeVoix(blanc(5))<0.1);assert.ok(R.dureeVoix(voix(3))>2.5);
 assert.equal(R.coupeDirect(voix(5),taux),-1);
 const c=R.coupeDirect(join(voix(12),blanc(1),voix(2)),taux);assert.ok(c>12*taux&&c<13*taux);
 assert.equal(R.reechantillonner(new Float32Array(48000),48000).length,16000);
 assert.equal(R.reechantillonner(new Float32Array(44100),44100).length,16000);
});
test('CRO : formats acceptés et limites',()=>{
 assert.deepEqual(R.natureFichier('cro.DOCX'),{nature:'document',format:'docx'});
 assert.deepEqual(R.natureFichier('Mémo vocal.m4a'),{nature:'audio',format:'m4a'});
 assert.deepEqual(R.natureFichier('enregistrement','audio/webm'),{nature:'audio',format:'audio'});
 assert.match(R.controleFichier({name:'photo.jpg',size:10}),/Format non reconnu/);
 assert.match(R.controleFichier({name:'cro.pdf',size:16*1024*1024}),/15 Mo/);
 assert.equal(R.controleFichier({name:'dictee.m4a',size:50*1024*1024}),'');
});

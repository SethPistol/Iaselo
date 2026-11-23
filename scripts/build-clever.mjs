import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
for(const file of ['dist/index.html','dist/patient.html','dist/ocr/tesseract.min.js','dist/ocr/worker.min.js','dist/ocr/fra.traineddata.gz','dist/cro-regles.js','dist/cro.js','dist/cro-transcription-worker.js','dist/vendor/transformers/transformers.min.js','dist/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm','dist/vendor/pdfjs/pdf.min.mjs','dist/vendor/pdfjs/pdf.worker.min.mjs','.env.example','migrations/postgres/001_initial.sql'])if(!fs.existsSync(file))throw Error('Fichier requis manquant : '+file);
// Fichiers périmés retirés en phase 0 : leur retour réintroduirait du code mort ou un build qui écrase parcours-v8.js.
for(const file of ['dist/parcours-v5.js','dist/parcours-v6.js','dist/parcours-v7.js','dist/app.js','dist/patient.js','dist/consultation.js','dist/workflow.js','scripts/build-static.mjs'])if(fs.existsSync(file))throw Error('Fichier retiré réapparu : '+file);
for(const dir of ['server','worker'])for(const file of fs.readdirSync(dir))if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',path.join(dir,file)],{stdio:'inherit'});
// Module de transcription du compte rendu opératoire : source officielle Hugging Face vérifiée par empreintes, repli sur la copie npm.
{const {installerModele}=await import('./modele-whisper.mjs');const source=await installerModele();
 if(source==='npm'&&!fs.existsSync('node_modules/sts-whisper-small/models/Xenova/whisper-small/onnx/encoder_model_quantized.onnx')&&!process.env.IASELO_MODELES_DIR)console.warn('Attention : module de transcription vocale absent. La dictée du compte rendu opératoire sera indisponible.');}
// Référentiels publics (BDPM, CCAM) : téléchargés depuis les sites officiels, jamais bloquants (voir scripts/referentiels.mjs).
if(process.env.IASELO_REFERENTIELS!=='off'){try{const {majReferentiels}=await import('./referentiels.mjs');await majReferentiels()}catch(e){console.warn('Référentiels publics non mis à jour : '+e.message)}}
console.log('Sources autonomes, ressources et migrations vérifiées. Démarrage : npm start (port 8080).');

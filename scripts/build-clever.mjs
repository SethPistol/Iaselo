import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
for(const file of ['dist/index.html','dist/patient.html','dist/ocr/tesseract.min.js','dist/ocr/worker.min.js','dist/ocr/fra.traineddata.gz','.env.example','migrations/postgres/001_initial.sql'])if(!fs.existsSync(file))throw Error('Fichier requis manquant : '+file);
for(const dir of ['server','worker'])for(const file of fs.readdirSync(dir))if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',path.join(dir,file)],{stdio:'inherit'});
console.log('Sources autonomes, ressources et migrations vérifiées. Démarrage : npm start (port 8080).');

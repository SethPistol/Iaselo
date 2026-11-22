import {readFileSync,writeFileSync} from 'node:fs';
const parts=['app.js','patient.js','consultation.js','workflow.js'].map(name=>readFileSync(`dist/${name}`,'utf8'));
const js="(function(){\n'use strict';\n"+parts.join('\n')+"\ntry { render(); document.body.dataset.appReady='true'; } catch(error) { window.showPatientLoadError?.(error); }\n})();\n";
writeFileSync('dist/parcours-v8.js',js);
writeFileSync('dist/parcours-v8.css',readFileSync('dist/app.css','utf8'));
for(const name of ['index.html','patient.html']){
 const html=readFileSync(`dist/${name}`,'utf8').replace(/parcours-v\d+\.js/g,'parcours-v8.js').replace(/parcours-v\d+\.css/g,'parcours-v8.css');
 writeFileSync(`dist/${name}`,html);
}

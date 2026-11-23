import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {installerModele,conforme,DOSSIER,DEPOT} from '../scripts/modele-whisper.mjs';
const NPM='node_modules/sts-whisper-small/models/Xenova/whisper-small';
const present=fs.existsSync(NPM+'/onnx/encoder_model_quantized.onnx');
// Faux Hugging Face : sert les fichiers de la copie npm (mêmes empreintes), éventuellement altérés.
const faux=(alterer)=>async url=>{const f=url.split('/resolve/main/')[1];let b=fs.readFileSync(path.join(NPM,f));if(alterer?.(f))b=Buffer.concat([b,Buffer.from(' ')]);return new Response(b)};
test('modèle de transcription : téléchargement officiel accepté seulement si toutes les empreintes concordent',{skip:!present&&'copie npm absente'},async()=>{
 const racine=fs.mkdtempSync(path.join(os.tmpdir(),'iaselo-modele-')),logs=[],log=m=>logs.push(m);
 try{
  assert.equal(await installerModele({env:{},racine,fetchImpl:faux(f=>f==='config.json'),log}),'npm');
  assert.equal(fs.existsSync(path.join(racine,DOSSIER,DEPOT)),false,'rien d’installé si un fichier diffère');
  assert.match(logs.at(-1),/config\.json : empreinte non conforme/);
  assert.equal(await installerModele({env:{},racine,fetchImpl:async()=>new Response('',{status:404}),log}),'npm');
  assert.equal(await installerModele({env:{},racine,fetchImpl:faux(),log}),'officiel');
  assert.equal(await conforme(path.join(racine,DOSSIER,DEPOT)),true);
  assert.equal(await installerModele({env:{},racine,fetchImpl:()=>{throw Error('ne doit pas être appelé')},log}),'officiel','déjà présent : pas de nouveau téléchargement');
  assert.equal(await installerModele({env:{IASELO_MODELE_SOURCE:'npm'},racine,log}),'npm');
 }finally{fs.rmSync(racine,{recursive:true,force:true})}
});

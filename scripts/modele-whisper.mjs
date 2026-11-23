/* IASELO · module de transcription du compte rendu opératoire (Whisper small, ONNX quantifié q8).
   Source officielle : dépôt Hugging Face Xenova/whisper-small, téléchargé à la construction (npm install → build)
   et vérifié fichier par fichier contre les empreintes SHA-256 figées ci-dessous. Un fichier non conforme est rejeté.
   Repli : si Hugging Face est injoignable ou non conforme, la copie npm sts-whisper-small@1.0.0 (mêmes empreintes,
   intégrité figée dans package-lock.json) est utilisée. Rien n'est téléchargé au moment de l'usage : le navigateur
   reçoit le modèle depuis IASELO (/modeles/).
   Variables : IASELO_MODELE_SOURCE=npm pour ne pas contacter Hugging Face ; IASELO_MODELE_URL pour une autre base (tests). */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';
export const DEPOT='Xenova/whisper-small';
export const EMPREINTES={
  "onnx/encoder_model_quantized.onnx": [
   "969f5ac12974340386bf7a02ea6626003e5e2dee396ffc6ab0eec282bf55ba06",
   92324809
  ],
  "onnx/decoder_model_merged_quantized.onnx": [
   "fcfc6100dc7339e7507e10f8b274350be7c4f8d8b575f0293f94cc0e156d6d24",
   156780950
  ],
  "added_tokens.json": [
   "ce949fe720c14311cb6c446e69cfe340dc669d7b006077a6feed6ae571dd7e88",
   2082
  ],
  "config.json": [
   "5a6429d21d7a3379dd0861b74510f9f7076f32b563bffc9fcb072482d55ab3be",
   2232
  ],
  "generation_config.json": [
   "0b7407a4e53a677f826e03c75d409e6f830663932bf43dda3b08c5efa2223279",
   3837
  ],
  "merges.txt": [
   "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6",
   493869
  ],
  "normalizer.json": [
   "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd",
   52666
  ],
  "preprocessor_config.json": [
   "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d",
   339
  ],
  "quant_config.json": [
   "757dc2d96699ce44e209c63c79ee4d41758a4baff39de9c5bc59ad90de454e81",
   2840
  ],
  "quantize_config.json": [
   "8d753d43dd1af715b29f7b471008e5161aca34deaadfa347d109b60a1d474d84",
   2840
  ],
  "special_tokens_map.json": [
   "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691",
   2194
  ],
  "tokenizer.json": [
   "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566",
   2480466
  ],
  "tokenizer_config.json": [
   "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce",
   282683
  ],
  "vocab.json": [
   "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a",
   1036584
  ]
};
export const DOSSIER='modeles';
const sha=f=>new Promise((res,rej)=>{const h=crypto.createHash('sha256');fs.createReadStream(f).on('error',rej).on('data',d=>h.update(d)).on('end',()=>res(h.digest('hex')))});
export async function conforme(dir){
 for(const [f,[h,n]] of Object.entries(EMPREINTES)){const p=path.join(dir,f);if(!fs.existsSync(p)||fs.statSync(p).size!==n||await sha(p)!==h)return false}
 return true;
}
export async function installerModele({env=process.env,racine=process.cwd(),fetchImpl=fetch,log=console.log}={}){
 const cible=path.join(racine,DOSSIER,DEPOT);
 if(env.IASELO_MODELE_SOURCE==='npm'){log('Transcription : copie npm utilisée (IASELO_MODELE_SOURCE=npm).');return 'npm'}
 if(await conforme(cible).catch(()=>false)){log('Transcription : modèle officiel déjà présent et conforme.');return 'officiel'}
 const base=(env.IASELO_MODELE_URL||'https://huggingface.co/'+DEPOT+'/resolve/main').replace(/\/$/,'');
 const tmp=cible+'.telechargement';fs.rmSync(tmp,{recursive:true,force:true});
 try{
  for(const [f,[h,n]] of Object.entries(EMPREINTES)){
   const r=await fetchImpl(base+'/'+f,{redirect:'follow',signal:AbortSignal.timeout(10*60*1000)});
   if(!r.ok||!r.body)throw Error(f+' : HTTP '+r.status);
   const p=path.join(tmp,f);fs.mkdirSync(path.dirname(p),{recursive:true});
   await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(p));
   const recu=await sha(p);if(recu!==h||fs.statSync(p).size!==n)throw Error(f+' : empreinte non conforme');
  }
  fs.rmSync(cible,{recursive:true,force:true});fs.mkdirSync(path.dirname(cible),{recursive:true});fs.renameSync(tmp,cible);
  log('Transcription : modèle officiel Hugging Face téléchargé et vérifié (SHA-256).');return 'officiel';
 }catch(e){
  fs.rmSync(tmp,{recursive:true,force:true});
  log('Transcription : source officielle indisponible ou non conforme ('+String(e?.message||e).slice(0,160)+'). Repli sur la copie npm vérifiée.');return 'npm';
 }
}

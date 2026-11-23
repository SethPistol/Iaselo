/* IASELO · transcription locale de la dictée du compte rendu opératoire.
   Whisper « small » (ONNX quantifié) exécuté dans ce worker du navigateur : l'audio ne quitte jamais le poste.
   Le modèle et le moteur sont servis par IASELO (/modeles/, /vendor/transformers/) ; aucun CDN, aucun service externe.
   Après le premier chargement (≈ 250 Mo), le modèle reste dans le cache du navigateur.
   Chaque extrait est précédé d'une invite de vocabulaire (titres du CRO, termes chirurgicaux) et de la fin de l'extrait
   précédent, comme le fait Whisper (« prompt ») : l'orthographe des termes médicaux et la continuité s'en trouvent améliorées. */
import {AutoProcessor,AutoTokenizer,WhisperForConditionalGeneration,Tensor,env} from './vendor/transformers/transformers.min.js';
env.allowRemoteModels=false;
env.allowLocalModels=true;
env.localModelPath='/modeles/';
env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths='/vendor/transformers/';
env.backends.onnx.wasm.proxy=false;
const MODELE='Xenova/whisper-small';
const T={precedent:50361,debut:50258,fr:50265,transcrire:50359,sansHorodatage:50363};
const VOCABULAIRE='Compte rendu opératoire. Indication. Installation. Voie d’abord. Constatations. Gestes réalisés. Fermeture. Drainage. Incidents. Consignes postopératoires. Cœlioscopie, laparotomie, trocarts, anastomose, aponévrose, hémostase, surjet intradermique, anatomopathologie, antibioprophylaxie.';
let outils=null,chargement=null;
const fichiers=new Map();
const progression=p=>{
 if(p.status==='progress'&&p.file&&p.total){fichiers.set(p.file,[p.loaded||0,p.total]);let a=0,b=0;for(const [l,t] of fichiers.values()){a+=l;b+=t}postMessage({type:'progression',charge:a,total:b})}
};
function charger(){
 if(!chargement)chargement=Promise.all([
  AutoProcessor.from_pretrained(MODELE,{progress_callback:progression}),
  AutoTokenizer.from_pretrained(MODELE,{progress_callback:progression}),
  WhisperForConditionalGeneration.from_pretrained(MODELE,{dtype:{encoder_model:'q8',decoder_model_merged:'q8'},device:'wasm',progress_callback:progression})
 ]).then(([processor,tokenizer,model])=>{outils={processor,tokenizer,model};postMessage({type:'pret'});return outils})
  .catch(e=>{chargement=null;postMessage({type:'erreur',message:/404|not found|introuvable|could not locate/i.test(String(e?.message))?'Module de transcription non installé sur le serveur IASELO.':'Chargement du module de transcription impossible sur ce poste.'});throw e});
 return chargement;
}
async function transcrire(audio,contexte){
 const {processor,tokenizer,model}=await charger();
 const entrees=await processor(audio);
 let invite=tokenizer.encode(' '+VOCABULAIRE+(contexte?' '+contexte:''),{add_special_tokens:false});
 if(invite.length>200)invite=invite.slice(-200);
 const ids=[T.precedent,...invite,T.debut,T.fr,T.transcrire,T.sansHorodatage];
 const sortie=await model.generate({...entrees,decoder_input_ids:new Tensor('int64',BigInt64Array.from(ids.map(BigInt)),[1,ids.length]),max_new_tokens:440-ids.length});
 const jetons=sortie.tolist()[0].map(Number).slice(ids.length);
 return tokenizer.decode(jetons,{skip_special_tokens:true}).trim();
}
let file=Promise.resolve();const derniers=new Map();
onmessage=({data})=>{
 if(data.type==='charger'){charger().catch(()=>{});return}
 if(data.type==='transcrire'){
  // Un extrait après l'autre : la fin du précédent (même dictée) sert de contexte au suivant.
  file=file.then(()=>transcrire(data.audio,(derniers.get(data.session)||'').slice(-160))).then(texte=>{derniers.set(data.session,texte);postMessage({type:'texte',id:data.id,texte})},()=>postMessage({type:'echec',id:data.id}));
 }
};

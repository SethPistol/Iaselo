// IASELO · nomenclature CCAM côté serveur (dist/assets/ccam.json, construit au build depuis ameli.fr) :
// index léger par code, au même format que l'index de l'écran (dist/ccam-regles.js), pour le codage et la facturation.
import fs from 'node:fs';
let cache;
export function ccamIndex(){
 if(cache!==undefined)return cache;
 try{const ref=JSON.parse(fs.readFileSync(new URL('../dist/assets/ccam.json',import.meta.url),'utf8'));
  cache={version:ref.version||'',modificateurs:ref.modificateurs||{},actes:ref.actes||[],parCode:new Map((ref.actes||[]).map(([code,libelle,activites,tarif,,tarifs,modificateurs])=>[code,{code,libelle,activites:String(activites||''),tarif,tarifs:tarifs||{},modificateurs:modificateurs||{}}]))}}
 catch{cache=null}
 return cache;
}
/** À appeler quand dist/assets/ccam.json a été remplacé (nouvelle version chargée par le serveur). */
export function rechargerCcamIndex(){cache=undefined}
// Tests : index fourni directement ({code:{libelle,tarif,tarifs,modificateurs,activites}}, modificateurs).
export function _testCcamIndex(actes,modificateurs={}){
 if(actes===null){cache=null;return}
 const parCode=new Map([...(actes instanceof Map?actes:Object.entries(actes))].map(([code,a])=>[code,{code,activites:'14',tarifs:{},modificateurs:{},...a}]));
 cache={version:'test',modificateurs,actes:[...parCode.keys()],parCode};
}

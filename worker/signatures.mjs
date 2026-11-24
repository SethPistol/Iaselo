// Signatures posées par le serveur : le signataire d'une signature nouvelle ou modifiée est toujours
// la personne connectée, jamais l'identité envoyée par le navigateur (audit du 24/11/2026, point 2).
// Sont concernés : les objets « signed » (prescriptions, VPA…) et les objets portant signedBy ou validatedBy
// (CRO, check-list HAS, bilans…). Une signature inchangée garde son auteur d'origine ; les historiques
// (history, historique) ne sont pas réécrits.
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const HISTORIQUES=new Set(['history','historique']);
const estSignature=(cle,v)=>cle==='signed'||typeof v.signedBy==='string'||typeof v.validatedBy==='string';
export function stampSignatures(old,next,{userId,name,rpps}={}){
 const nom=String(name||'').trim();
 function poser(v){
  const out={...v};
  if(Object.hasOwn(out,'userId'))out.userId=userId;
  if(Object.hasOwn(out,'name')&&nom)out.name=nom;
  if(Object.hasOwn(out,'rpps'))out.rpps=rpps||'';
  if(typeof out.signedBy==='string'&&nom)out.signedBy=nom;
  if(typeof out.validatedBy==='string'&&nom)out.validatedBy=nom;
  return out;
 }
 function walk(cle,avant,apres){
  if(Array.isArray(apres))return HISTORIQUES.has(cle)?apres:apres.map((x,i)=>walk(cle,Array.isArray(avant)?avant[i]:undefined,x));
  if(!apres||typeof apres!=='object')return apres;
  const base=avant&&typeof avant==='object'&&!Array.isArray(avant)?avant:{};
  let out=Object.fromEntries(Object.entries(apres).map(([k,x])=>[k,HISTORIQUES.has(k)?x:walk(k,base[k],x)]));
  if(estSignature(cle,apres)&&stable(avant)!==stable(apres)){const pose=poser(out);if(stable(pose)!==stable(out))out=pose}
  return out;
 }
 return walk('',old,next);
}

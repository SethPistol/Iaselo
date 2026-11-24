// Documents validés ou signés figés côté serveur (audit du 24/11/2026, point 5).
// Un document validé ne peut plus être modifié en restant « validé » : il faut d'abord ouvrir une révision
// (dévalidation tracée), puis valider la nouvelle version. Les historiques restent dans workspace_versions.
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>stable(a)===stable(b);
const strip=e=>{if(!e||typeof e!=='object'||Array.isArray(e))return e;const {serverAt,serverBy,...rest}=e;return rest};
const sameEntry=(a,b)=>same(strip(a),strip(b));
const list=v=>Array.isArray(v)?v:[];
// Renvoie {error} si l'écriture modifie un document figé, {revision:true} si elle ouvre une révision, sinon {}.
export function lockCheck(module,old,data){
 if(!old||typeof old!=='object')return {};
 if(module==='consult'&&old.validated===true){
  if(data?.validated===true)return same(old,data)?{}:{error:'Consultation validée : ouvrez une révision avant de la modifier.'};
  return {revision:'Révision de la consultation validée'};
 }
 if(module==='cro'&&old.status==='validé'){
  if(data?.status==='validé'&&data.version===old.version&&!same(old,data))return {error:'Compte rendu opératoire validé : créez une nouvelle version pour le modifier.'};
  if(data?.status!=='validé')return {revision:'Compte rendu opératoire dévalidé'};
  return {};
 }
 if((module==='vpa'||module==='prescriptionsPreop')&&old.signed){
  if(data?.signed&&same(old.signed,data.signed)&&!same(old.draft,data.draft))return {error:(module==='vpa'?'Visite pré-anesthésique':'Prescriptions')+' signées : la modification exige une nouvelle signature.'};
  if(!data?.signed)return {revision:(module==='vpa'?'Signature de la visite pré-anesthésique retirée':'Signature des prescriptions retirée')};
  return {};
 }
 if(module==='peropRapide'){
  // Implants et registre des stupéfiants : traçabilité réglementaire, aucune ligne effacée ni modifiée.
  for(const k of ['dmi','stupefiants']){const a=list(old[k]),b=list(data?.[k]);if(b.length<a.length||a.some((e,i)=>!sameEntry(e,b[i])))return {error:(k==='dmi'?'Traçabilité des implants':'Registre des stupéfiants')+' : une ligne enregistrée ne peut être ni modifiée ni supprimée.'}}
  // Événements horodatés : on peut les annuler (mention « annulé », auteur, heure), pas les effacer.
  const a=list(old.evenements),b=list(data?.evenements);
  if(b.length<a.length||a.some((e,i)=>{const n=b[i];if(sameEntry(e,n))return false;const {annule,...rest}=strip(n)||{};return !(annule&&!e.annule&&same(strip(e),rest))}))return {error:'Feuille d’anesthésie : un événement horodaté ne peut pas être effacé, seulement annulé.'};
 }
 return {};
}

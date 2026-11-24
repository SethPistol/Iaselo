// Heure serveur des soins (audit du 24/11/2026, point 6).
// L'heure clinique (`at`) reste celle choisie par le soignant (une saisie peut être faite après coup),
// mais chaque nouvelle entrée de soin reçoit en plus l'heure et l'auteur constatés par le serveur
// (`serverAt`, `serverBy`), que le navigateur ne peut ni fixer ni modifier. Un écart important est affiché.
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const strip=e=>{if(!e||typeof e!=='object'||Array.isArray(e))return e;const {serverAt,serverBy,...rest}=e;return rest};
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
// Rubrique → fonction qui applique `fn` à chaque liste d'entrées de soins et renvoie la rubrique transformée.
const MAP={
 rx:(d,fn)=>Array.isArray(d)?d.map(r=>isObj(r)&&Array.isArray(r.executions)?{...r,executions:fn(r.executions)}:r):d,
 perop:(d,fn)=>isObj(d)&&Array.isArray(d.records)?{...d,records:fn(d.records)}:d,
 peropRapide:(d,fn)=>{if(!isObj(d))return d;const out={...d};for(const k of ['evenements','dmi','stupefiants'])if(Array.isArray(d[k]))out[k]=fn(d[k]);return out},
 postopVitals:(d,fn)=>Array.isArray(d)?fn(d):d,
 medicationCircuit:(d,fn)=>Array.isArray(d)?fn(d):d,
 nursingRecord:(d,fn)=>Array.isArray(d)?fn(d):d,
};
export const timedModule=module=>Object.hasOwn(MAP,module);
// 1) Avant le contrôle des droits : les entrées déjà connues retrouvent leur horodatage serveur, même si le
//    poste renvoie une copie qui ne l'a pas ; une entrée ne peut pas recevoir un horodatage inventé.
export function heal(module,old,data){
 if(!timedModule(module))return data;
 const known=new Map();if(old)MAP[module](old,list=>{for(const e of list)if(isObj(e)&&e.serverAt){const key=stable(strip(e));if(!known.has(key))known.set(key,[]);known.get(key).push({serverAt:e.serverAt,serverBy:e.serverBy})}return list});
 return MAP[module](data,list=>list.map(e=>{if(!isObj(e))return e;const s=known.get(stable(strip(e)))?.shift();return s?{...strip(e),...s}:strip(e)}));
}
// 2) Après le contrôle : les nouvelles entrées reçoivent l'heure et l'auteur serveur.
export function stamp(module,data,{at,user}){
 if(!timedModule(module))return data;
 return MAP[module](data,list=>list.map(e=>isObj(e)&&!e.serverAt?{...e,serverAt:at,serverBy:user}:e));
}

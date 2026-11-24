// Listes partagées découpées en éléments (audit du 24/11/2026, point 4).
//
// Les identités, réservations, actes, mouvements, PMSI, factures et brouillons de séjour de TOUS les patients
// tiennent chacun dans un seul document. Avant : chaque ajout recopiait la liste entière dans l'historique
// (croissance quadratique) et deux secrétaires travaillant sur deux patients différents se bloquaient
// (« Cette rubrique a changé sur un autre poste »).
//
// Désormais, pour ces documents :
//  - l'historique est tenu élément par élément (workspace_item_versions) : seul l'élément modifié est copié ;
//    la version du document ne garde qu'un repère ({"$items":1}) ;
//  - l'enregistrement fusionne élément par élément (fusion à trois voies avec la version que le poste avait lue) :
//    seules deux modifications du MÊME élément depuis cette version sont un conflit.
export const ITEM_MARKER='{"$items":1}';
const TUPLES=new Set(['identities/records','identities/reviews','management/pmsi','management/invoices']);
const ROWS=new Set(['management/reservations','management/acts','management/movements']);
const OBJECTS=new Set(['management/patientDrafts']);
export const isItemKey=key=>TUPLES.has(key)||ROWS.has(key)||OBJECTS.has(key);
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>stable(a)===stable(b);
async function sha(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24)}

// Liste → [[identifiant, élément]] (identifiants uniques : un doublon exact reçoit un suffixe #n).
export async function entries(key,data){
 if(OBJECTS.has(key))return Object.entries(data&&typeof data==='object'&&!Array.isArray(data)?data:{});
 if(!Array.isArray(data))return [];
 const seen=new Map(),out=[];
 for(const row of data){
  let id=TUPLES.has(key)?(Array.isArray(row)?String(row[0]):'#'+await sha(stable(row))):(row&&typeof row==='object'&&typeof row.id==='string'&&row.id?row.id:'#'+await sha(stable(row)));
  const n=seen.get(id)||0;seen.set(id,n+1);if(n)id+='#'+n;out.push([id,row]);
 }
 return out;
}
const rebuild=(key,list)=>OBJECTS.has(key)?Object.fromEntries(list):list.map(([,v])=>v);

// État d'un élément à la révision `revision` du document : historique par élément, sinon dernière copie complète.
async function itemAt(DB,key,id,revision){
 const v=await DB.prepare('SELECT data FROM workspace_item_versions WHERE key=? AND item=? AND revision<=? ORDER BY revision DESC, sequence DESC LIMIT 1').bind(key,id,revision).first();
 if(v)return v.data===null||v.data===undefined?undefined:JSON.parse(v.data);
 const full=await DB.prepare('SELECT data FROM workspace_versions WHERE key=? AND revision<=? AND data<>? ORDER BY revision DESC LIMIT 1').bind(key,revision,ITEM_MARKER).first();
 if(!full)return undefined;
 return new Map(await entries(key,JSON.parse(full.data))).get(id);
}
// Document complet à une révision donnée (écran « Comparer les versions »).
export async function documentAt(DB,key,revision){
 const ids=new Set((await DB.prepare('SELECT DISTINCT item FROM workspace_item_versions WHERE key=? AND revision<=?').bind(key,revision).all()).results.map(r=>r.item));
 const full=await DB.prepare('SELECT data FROM workspace_versions WHERE key=? AND revision<=? AND data<>? ORDER BY revision DESC LIMIT 1').bind(key,revision,ITEM_MARKER).first();
 const list=full?await entries(key,JSON.parse(full.data)):[];for(const [id]of list)ids.add(id);
 const out=[];for(const id of ids){const v=await itemAt(DB,key,id,revision);if(v!==undefined)out.push([id,v])}
 const order=new Map(list.map(([id],i)=>[id,i]));out.sort((a,b)=>(order.get(a[0])??1e9)-(order.get(b[0])??1e9));
 return rebuild(key,out);
}

// Fusion à trois voies. `inScope` dit si un élément appartient au périmètre du professionnel ;
// `client` est la liste complète déjà fusionnée par les droits (hors périmètre conservé + liste du poste).
// Renvoie {data, revision, changes:[[id, valeur|undefined]], conflict}.
export async function mergeItems(DB,key,baseRevision,client,inScope){
 const row=await DB.prepare('SELECT data,revision FROM workspace_documents WHERE key=?').bind(key).first();
 const current=row?JSON.parse(row.data):(OBJECTS.has(key)?{}:[]),revision=row?row.revision:0;
 const cur=await entries(key,current),mine=(await entries(key,client)).filter(([id,v])=>inScope(v,key,id));
 const curMap=new Map(cur),mineMap=new Map(mine),changes=[];let conflict=false;
 const resolved=new Map();
 for(const id of new Set([...mineMap.keys(),...cur.filter(([id,v])=>inScope(v,key,id)).map(([id])=>id)])){
  const c=mineMap.get(id),d=curMap.get(id);
  if(same(c,d)){resolved.set(id,d);continue}
  const b=baseRevision>=revision?d:await itemAt(DB,key,id,baseRevision);
  if(same(c,b)){resolved.set(id,d);continue}           // le poste n'y a pas touché : on garde l'état le plus récent
  if(same(d,b)){resolved.set(id,c);changes.push([id,c]);continue} // seul ce poste l'a modifié
  conflict=true;resolved.set(id,d);
 }
 // Ordre : hors périmètre à leur place, puis liste du poste, puis éléments ajoutés ailleurs entre-temps.
 const out=[];
 for(const [id,v]of cur)if(!inScope(v,key,id))out.push([id,v]);
 for(const [id]of mine){const v=resolved.get(id);if(v!==undefined)out.push([id,v])}
 for(const [id,v]of cur)if(inScope(v,key,id)&&!mineMap.has(id)&&resolved.get(id)!==undefined)out.push([id,resolved.get(id)]);
 return {data:rebuild(key,out),revision,changes,conflict};
}
export function itemVersionStatements(DB,key,changes,revision,{actor,at,operation,reason}){
 return changes.map(([id,v])=>DB.prepare('INSERT INTO workspace_item_versions(key,item,revision,data,actor,updated_at,operation,reason) VALUES(?,?,?,?,?,?,?,?)').bind(key,id,revision,v===undefined?null:JSON.stringify(v),actor,at,operation,reason));
}

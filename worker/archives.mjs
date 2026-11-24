// Chargement à la demande (audit du 24/11/2026, point 4).
// À l'ouverture, IASELO ne charge plus tous les séjours depuis l'origine : un séjour SORTI, sans aucune
// écriture depuis ARCHIVE_JOURS jours et sans réservation de bloc récente ou à venir, reste sur le serveur.
// On le retrouve par la recherche « Séjours archivés » (nom, prénom, naissance, numéro), qui le recharge.
// Les listes partagées (identités, réservations…) restent chargées en entier : elles sont légères et
// leur enregistrement repose sur une copie complète du périmètre (voir worker/items.mjs).
export const ARCHIVE_JOURS=60;
const CHUNK=400;
const stayOf=key=>key.startsWith('stay/')?key.split('/')[1]:null;

export async function archivedStays(DB,now=Date.now()){
 const cutoff=new Date(now-ARCHIVE_JOURS*86400000).toISOString();
 const meta=(await DB.prepare("SELECT key,updated_at FROM workspace_documents WHERE key LIKE 'stay/%'").all()).results||[];
 const last=new Map();for(const r of meta){const id=stayOf(r.key);if(!last.has(id)||r.updated_at>last.get(id))last.set(id,r.updated_at)}
 const candidates=[...last].filter(([,at])=>at<cutoff).map(([id])=>id);if(!candidates.length)return {archived:new Set(),meta};
 const resa=await DB.prepare("SELECT data FROM workspace_documents WHERE key='management/reservations'").first();
 const busy=new Set();for(const r of resa?JSON.parse(resa.data):[])if(r&&r.patient&&String(r.end||r.start||'9999')>=cutoff)busy.add(r.patient);
 const archived=new Set();
 for(let i=0;i<candidates.length;i+=CHUNK){const part=candidates.slice(i,i+CHUNK).filter(id=>!busy.has(id));if(!part.length)continue;
  const rows=(await DB.prepare('SELECT key,data FROM workspace_documents WHERE key IN ('+part.map(()=>'?').join(',')+')').bind(...part.map(id=>'stay/'+id+'/core')).all()).results||[];
  for(const r of rows){try{if(JSON.parse(r.data)?.stage==='Sortie')archived.add(stayOf(r.key))}catch{}}}
 return {archived,meta,last};
}
async function rowsFor(DB,keys){const out=[];for(let i=0;i<keys.length;i+=CHUNK){const part=keys.slice(i,i+CHUNK);out.push(...((await DB.prepare('SELECT key,data,revision,actor,updated_at FROM workspace_documents WHERE key IN ('+part.map(()=>'?').join(',')+')').bind(...part).all()).results||[]))}return out.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)}

// Documents à l'ouverture : tout sauf les séjours archivés.
export async function openingRows(DB){
 const {archived}=await archivedStays(DB);
 if(!archived.size)return (await DB.prepare('SELECT key,data,revision,actor,updated_at FROM workspace_documents ORDER BY key').all()).results;
 const others=(await DB.prepare("SELECT key,data,revision,actor,updated_at FROM workspace_documents WHERE key NOT LIKE 'stay/%'").all()).results||[];
 const keys=((await DB.prepare("SELECT key FROM workspace_documents WHERE key LIKE 'stay/%'").all()).results||[]).map(r=>r.key).filter(k=>!archived.has(stayOf(k)));
 return [...others,...await rowsFor(DB,keys)].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
}
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
// Recherche dans les séjours archivés du périmètre du professionnel.
export async function searchArchives(DB,acl,q){
 const {archived,last}=await archivedStays(DB),terms=norm(q).split(/\s+/).filter(Boolean),ids=[...archived].filter(id=>acl.canRead('stay/'+id+'/core'));
 const out=[];
 for(let i=0;i<ids.length&&out.length<30;i+=CHUNK){const part=ids.slice(i,i+CHUNK);
  for(const r of (await DB.prepare('SELECT key,data FROM workspace_documents WHERE key IN ('+part.map(()=>'?').join(',')+')').bind(...part.map(id=>'stay/'+id+'/core')).all()).results||[]){
   const c=JSON.parse(r.data)||{},id=stayOf(r.key),hay=norm([id,c.identity?.lastName,c.identity?.firstName,c.identity?.birthName,c.identity?.birthDate,c.identity?.birthDate?.split('-').reverse().join('/'),c.specialty].join(' '));
   if(terms.every(t=>hay.includes(t)))out.push({id,identity:{lastName:c.identity?.lastName||'',firstName:c.identity?.firstName||'',birthDate:c.identity?.birthDate||''},specialty:c.specialty||'',lastActivity:last?.get(id)||''});
   if(out.length>=30)break;}}
 return out.sort((a,b)=>b.lastActivity.localeCompare(a.lastActivity));
}
export async function stayRows(DB,id){return ((await DB.prepare("SELECT key,data,revision,actor,updated_at FROM workspace_documents WHERE key LIKE ? ESCAPE '\\' ORDER BY key").bind('stay/'+id.replace(/[\\%_]/g,'\\$&')+'/%').all()).results||[]).filter(r=>stayOf(r.key)===id)}

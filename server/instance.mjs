// IASELO · état de l'installation pour la console des installations (une installation par établissement).
//  GET /api/instance/etat   en-tête « Authorization: Bearer <INSTANCE_CONSOLE_TOKEN> » (32 caractères au moins).
// Réponse technique seulement : établissement, version, commit, migrations, base, stockage, démarrage.
// Aucune donnée de santé ni nombre de patients. Sans INSTANCE_CONSOLE_TOKEN, la route répond 404.
import {timingSafeEqual,createHash} from 'node:crypto';import fs from 'node:fs';
const version=(()=>{try{return JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version}catch{return ''}})();
const demarrage=new Date().toISOString();
const egal=(a,b)=>{const x=createHash('sha256').update(String(a)).digest(),y=createHash('sha256').update(String(b)).digest();return timingSafeEqual(x,y)};
export function instanceApi({pool,bucket,etab,env=process.env,cfg}){
 const jeton=String(env.INSTANCE_CONSOLE_TOKEN||'');
 return async function(request){
  if(new URL(request.url).pathname!=='/api/instance/etat')return null;
  const non=()=>new Response('Introuvable',{status:404});
  if(jeton.length<32||request.method!=='GET')return non();
  const m=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'');if(!m||!egal(m[1],jeton))return new Response(JSON.stringify({error:'Jeton refusé.'}),{status:401,headers:{'Content-Type':'application/json'}});
  let base='ok',migrations=[],stockage='ok';
  try{migrations=(await pool.query('SELECT name FROM app_migrations ORDER BY name')).rows.map(r=>r.name)}catch{base='ko'}
  try{await bucket.check?.()}catch{stockage='ko'}
  const e=await etab.actuel().catch(()=>({}));
  return new Response(JSON.stringify({etablissement:{nom:e.nom,ville:e.ville,finess:e.finess},version,commit:String(env.COMMIT_ID||env.CC_COMMIT_ID||'').slice(0,12),
   derniereMigration:migrations.at(-1)||'',migrations:migrations.length,base,stockage,demarrage,recette:cfg?.recette===true,baseUrl:cfg?.baseUrl||''}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 };
}

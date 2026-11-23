import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {workspaceApi} from '../worker/workspace.mjs';import {config} from './config.mjs';import {createPool,migrate,postgresBinding} from './database.mjs';import {cellarBinding} from './storage.mjs';import {bootstrap,createAuth,loginPage} from './auth.mjs';import {brevoMessaging} from './brevo.mjs';import {createPsc} from './interop/psc.mjs';import {createConnectors} from './interop/index.mjs';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/gzip'};
export async function makeApp({pool,bucket,cfg,messaging=brevoMessaging(),interopEnv={},connectors=createConnectors(interopEnv),psc=createPsc({env:interopEnv,baseUrl:cfg.baseUrl,secret:cfg.sessionSecret})}){
 const auth=await createAuth(pool,cfg,{psc}),DB=postgresBinding(pool);
 return async function handle(request){const url=new URL(request.url),pathname=url.pathname;
  if(pathname==='/healthz'){try{await pool.query('SELECT 1');return Response.json({status:'ok'})}catch{return Response.json({status:'unavailable'},{status:503})}}
  if(pathname==='/auth/psc/start'&&request.method==='GET')return auth.pscStart();
  if(pathname==='/auth/psc/callback'&&request.method==='GET')return auth.pscCallback(request);
  if(pathname==='/login'&&request.method==='GET')return new Response(loginPage('',undefined,auth.pscEnabled()),{headers:{'Content-Type':mime['.html']}});
  if(pathname==='/auth/login'&&request.method==='POST')return auth.login(request);
  if(pathname==='/auth/logout'&&request.method==='POST')return auth.logout(request);
  if(pathname==='/auth/lock'&&request.method==='POST')return auth.lock(request);
  if(pathname==='/auth/unlock'&&request.method==='POST')return auth.unlock(request);
  if(pathname==='/api/questionnaire/submit'||pathname==='/api/questionnaire/resolve'||pathname==='/api/prescriptions/open'||pathname==='/api/prescriptions/view')return workspaceApi(request,{DB,BUCKET:bucket,ENABLE_DEMO_SEED:cfg.enableDemoSeed});
  // Espace patient (lien personnel) : seul le nom de l'établissement de la messagerie est transmis, aucun envoi possible.
  // Lettre de liaison (lien personnel du patient) : lecture seule, aucun envoi possible.
  if(pathname.startsWith('/api/lettre-liaison/'))return workspaceApi(request,{DB});
  if(pathname.startsWith('/api/espace-patient/'))return workspaceApi(request,{DB,BUCKET:bucket,ESTABLISHMENT:messaging?.establishment||''});
  const staff=await auth.user(request);
  if(pathname.startsWith('/api/workspace')){
   if(!staff)return Response.json({error:'Connexion professionnelle requise.'},{status:401});
   const headers=new Headers(request.headers);for(const k of [...headers.keys()])if(k.startsWith('oai-')||k==='cookie')headers.delete(k);
   headers.set('oai-authenticated-user-id',staff.id);headers.set('oai-authenticated-user-email',staff.email);headers.set('oai-authenticated-user-full-name',encodeURIComponent(staff.display_name));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
   return workspaceApi(new Request(request,{headers}),{DB,BUCKET:bucket,ENABLE_DEMO_SEED:cfg.enableDemoSeed,MESSAGING:messaging,INTEROP:connectors,INTEROP_ENV:interopEnv});
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Méthode refusée',{status:405});
  if(['/', '/index.html','/consultation-modele.html'].includes(pathname)&&!staff)return new Response(null,{status:303,headers:{Location:'/login'}});
  let name;try{name=decodeURIComponent(pathname)}catch{return new Response('Chemin invalide',{status:400})}if(name==='/')name='/index.html';
  if(name.split('/').some(x=>x.startsWith('.'))||name.startsWith('/server/'))return new Response('Introuvable',{status:404});
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return new Response('Introuvable',{status:404});
  try{const stat=await fs.stat(file);if(!stat.isFile())throw Error();return new Response(request.method==='HEAD'?null:await fs.readFile(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}})}catch{return new Response('Introuvable',{status:404})}
 };
}
export function httpServer(handle,cfg){return http.createServer(async(req,res)=>{
 try{
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined&&!key.toLowerCase().startsWith('oai-'))headers.set(key,Array.isArray(value)?value.join(', '):value);
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024){res.writeHead(413);res.end('Requête trop volumineuse');return}chunks.push(chunk)}
  const target=new URL(req.url,cfg.baseUrl);if(!req.url.startsWith('/')||req.url.startsWith('//')||target.origin!==cfg.baseUrl){res.writeHead(400);res.end('Chemin invalide');return}
  const request=new Request(target,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await handle(request);const output=new Headers(response.headers);
  output.set('X-Content-Type-Options','nosniff');
  // Polices publiques : lisibles par l’aide scientifique, cadre isolé d’origine « null ».
  if(req.url.startsWith('/assets/fonts/'))output.set('Access-Control-Allow-Origin','*');output.set('Referrer-Policy','no-referrer');output.set('X-Frame-Options','DENY');output.set('Cache-Control','no-store');
  output.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' blob:; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");if(cfg.secure)output.set('Strict-Transport-Security','max-age=31536000');
  // Les cadres scientifiques internes sont nécessaires au dossier ; eux seuls peuvent être embarqués.
  if(req.url.startsWith('/scientifique-')){output.set('X-Frame-Options','SAMEORIGIN');output.set('Content-Security-Policy',"default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; object-src 'none'")}
  // Trame de consultation d’anesthésie : affichée dans le dossier (même origine) uniquement.
  if(req.url.startsWith('/consultation-modele.html')){output.set('X-Frame-Options','SAMEORIGIN');output.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")}
  res.writeHead(response.status,Object.fromEntries(output));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error('request_failed',error.code||error.name||'Error');if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Service indisponible. Réessayez.');}
 })}
export async function start(env=process.env){const cfg=config(env),pool=createPool(env);try{await migrate(pool);await bootstrap(pool,env);const bucket=cellarBinding(env);await bucket.check();const handle=await makeApp({pool,bucket,cfg,messaging:brevoMessaging(env),interopEnv:env}),server=httpServer(handle,cfg);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(cfg.port,'0.0.0.0',resolve)});console.log('Parcours Anesthésie écoute sur 0.0.0.0:'+cfg.port);const stop=()=>server.close(async()=>{bucket.close();await pool.end();process.exit(0)});process.once('SIGTERM',stop);process.once('SIGINT',stop);return server;}catch(e){await pool.end();throw e}}
if(process.argv[1]===fileURLToPath(import.meta.url))start().catch(e=>{console.error('Démarrage impossible : '+(e.code||e.message));process.exit(1)});

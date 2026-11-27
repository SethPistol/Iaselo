import http from 'node:http';import fs from 'node:fs/promises';import {createReadStream,existsSync} from 'node:fs';import {Readable} from 'node:stream';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {workspaceApi} from '../worker/workspace.mjs';import {createEtablissement} from './etablissement.mjs';import {instanceApi} from './instance.mjs';import {fhirApi} from '../worker/fhir.mjs';import {interopEntrantApi,patientMarcheApi} from '../worker/marche.mjs';import {operateurTelephonieApi} from '../worker/telephonie.mjs';import {config} from './config.mjs';import {createPool,migrate,postgresBinding} from './database.mjs';import {cellarBinding} from './storage.mjs';import {bootstrap,createAuth,loginPage} from './auth.mjs';import {brevoMessaging} from './brevo.mjs';import {createPsc} from './interop/psc.mjs';import {createConnectors} from './interop/index.mjs';import {tourneeRappels} from '../worker/rappels-auto.mjs';import {rechargerCcamIndex} from '../worker/ccam-ref.mjs';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/gzip','.mjs':'application/javascript; charset=utf-8','.onnx':'application/octet-stream','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
// Module de transcription vocale du compte rendu opératoire (Whisper small, ONNX), voir scripts/modele-whisper.mjs,
// servi par IASELO aux seuls professionnels connectés ; la transcription se fait dans le navigateur, rien n'est envoyé ailleurs.
// Ordre : dossier imposé, copie officielle Hugging Face vérifiée à la construction (modeles/), sinon copie npm.
const modeleOfficiel=fileURLToPath(new URL('../modeles/',import.meta.url));
const modelesRoot=path.resolve(process.env.IASELO_MODELES_DIR||(existsSync(path.join(modeleOfficiel,'Xenova/whisper-small/onnx/encoder_model_quantized.onnx'))?modeleOfficiel:fileURLToPath(new URL('../node_modules/sts-whisper-small/models/',import.meta.url))));
const modeleAutorise=/^\/modeles\/Xenova\/whisper-small\/(?:onnx\/(?:encoder_model_quantized|decoder_model_merged_quantized)\.onnx|[a-z_]+\.(?:json|txt))$/;
export async function makeApp({pool,bucket,cfg,messaging=brevoMessaging(),interopEnv={},connectors=createConnectors(interopEnv),psc=createPsc({env:interopEnv,baseUrl:cfg.baseUrl,secret:cfg.sessionSecret})}){
 const auth=await createAuth(pool,cfg,{psc}),DB=postgresBinding(pool);
 // Identité de l'établissement de cette installation (nom, coordonnées, logos) : réglée par l'administrateur.
 const etab=createEtablissement({pool,bucket});const appliquerEtab=async()=>{try{const e=await etab.lire();if(e.majLe&&messaging&&typeof messaging==='object')messaging.establishment=e.nom}catch(err){console.error('etablissement',err?.code||err?.message)}};await appliquerEtab();const etatInstance=instanceApi({pool,bucket,etab,cfg});
 // Rappels SMS automatiques (consentement J-2/J-1, suivi J+1) : lancés par start() toutes les 10 minutes.
 const rappels=opts=>tourneeRappels({DB,MESSAGING:messaging},{origin:cfg.baseUrl,...opts});
 const handle=async function handle(request){const url=new URL(request.url),pathname=url.pathname;
  if(pathname==='/healthz'){try{await pool.query('SELECT 1');return Response.json({status:'ok'})}catch{return Response.json({status:'unavailable'},{status:503})}}
  if(pathname==='/auth/psc/start'&&request.method==='GET')return auth.pscStart();
  if(pathname==='/auth/psc/callback'&&request.method==='GET')return auth.pscCallback(request);
  if(pathname==='/login'&&request.method==='GET')return new Response(await etab.substituer(loginPage('',undefined,auth.pscEnabled())),{headers:{'Content-Type':mime['.html']}});
  if(pathname==='/api/etablissement')return etab.api(request,null,cfg.baseUrl);
  if(pathname==='/api/instance/etat')return etatInstance(request);
  if(pathname==='/auth/login'&&request.method==='POST')return auth.login(request);
  if(pathname==='/auth/logout'&&request.method==='POST')return auth.logout(request);
  if(pathname==='/auth/lock'&&request.method==='POST')return auth.lock(request);
  if(pathname==='/auth/unlock'&&request.method==='POST')return auth.unlock(request);
  if(pathname==='/mot-de-passe'&&request.method==='GET')return auth.passwordPage(request);
  if(pathname==='/double-authentification'&&request.method==='GET')return auth.mfaStart(request);
  if(pathname==='/auth/mfa'&&request.method==='POST')return auth.mfaVerify(request);
  if(pathname==='/api/admin/accounts/mfa-reset'&&request.method==='POST')return auth.resetMfaFromAdmin(request);
  if(pathname==='/auth/password'&&request.method==='POST')return auth.changePassword(request);
  if(pathname==='/api/admin/accounts'&&request.method==='POST')return auth.createAccountFromAdmin(request);
  // Fin du questionnaire : le lien de préadmission part par SMS et e-mail (messagerie transmise pour ce seul envoi).
  if(pathname==='/api/questionnaire/submit')return workspaceApi(request,{DB,BUCKET:bucket,ENABLE_DEMO_SEED:cfg.enableDemoSeed,MESSAGING:messaging});
  if(pathname==='/api/questionnaire/resolve'||pathname==='/api/prescriptions/open'||pathname==='/api/prescriptions/view')return workspaceApi(request,{DB,BUCKET:bucket,ENABLE_DEMO_SEED:cfg.enableDemoSeed});
  // Préadmission (lien personnel) : formulaire, pièces, étapes ; aucun envoi possible.
  if(pathname.startsWith('/api/preadmission/'))return workspaceApi(request,{DB,BUCKET:bucket,ESTABLISHMENT:messaging?.establishment||'',TELEPHONE_ADMISSIONS:process.env.TELEPHONE_ADMISSIONS||''});
  // Espace patient (lien personnel) : seul le nom de l'établissement de la messagerie est transmis, aucun envoi possible.
  // Lettre de liaison (lien personnel du patient) : lecture seule, aucun envoi possible.
  if(pathname.startsWith('/api/lettre-liaison/'))return workspaceApi(request,{DB});
  if(pathname.startsWith('/api/espace-patient/'))return workspaceApi(request,{DB,BUCKET:bucket,ESTABLISHMENT:messaging?.establishment||''});
  // Questionnaire du lendemain (lien du SMS J+1) : réponses du patient, aucun envoi possible.
  if(pathname.startsWith('/api/suivi-j1/'))return workspaceApi(request,{DB,ESTABLISHMENT:messaging?.establishment||''});
  // API FHIR R4 des logiciels partenaires : jeton OAuth 2.0 (client credentials), lecture seule, journal d'accès.
  if(pathname.startsWith('/fhir/'))return fhirApi(request,{DB},cfg.baseUrl);
  // Parcours de soins à distance (lien personnel) : fiche d'éducation ou questionnaire, aucun envoi possible.
  if(pathname.startsWith('/api/parcours/'))return workspaceApi(request,{DB,ESTABLISHMENT:messaging?.establishment||''});
  // Messagerie du patient (lien personnel) : lecture et envoi de ses messages, aucun envoi SMS possible.
  if(pathname.startsWith('/api/messagerie/'))return workspaceApi(request,{DB,ESTABLISHMENT:messaging?.establishment||''});
  // Flux entrants des logiciels de la clinique (biologie, mouvements, moniteurs, courriers) : jeton propre à chaque émetteur.
  // Accueil téléphonique : agent vocal de l'opérateur (signature HMAC, TELEPHONIE_SECRET) ; absent = simulation.
  if(pathname==='/api/telephonie/appel')return operateurTelephonieApi(request,{DB,TELEPHONIE_SECRET:interopEnv.TELEPHONIE_SECRET,ESTABLISHMENT:messaging?.establishment||''});
  if(pathname.startsWith('/api/interop/entrant/'))return interopEntrantApi(request,{DB,BUCKET:bucket,INTEROP_ENV:interopEnv});
  // Liens personnels du patient : prise de rendez-vous, devis d'honoraires, paiement (date de naissance demandée) ; webhook du paiement.
  if(/^\/api\/(rdv|devis|paiement)\//.test(pathname))return patientMarcheApi(request,{DB,INTEROP_ENV:interopEnv,ESTABLISHMENT:messaging?.establishment||''});
  const staff=await auth.user(request);
  if(pathname==='/api/admin/etablissement'){const r=await etab.api(request,staff,cfg.baseUrl);if(request.method==='POST'&&r.ok)await appliquerEtab();return r}
  if(pathname.startsWith('/api/workspace')){
   if(!staff)return Response.json({error:'Connexion professionnelle requise.'},{status:401});
   const headers=new Headers(request.headers);for(const k of [...headers.keys()])if(k.startsWith('oai-')||k==='cookie')headers.delete(k);
   headers.set('oai-authenticated-user-id',staff.id);headers.set('oai-authenticated-user-email',staff.email);headers.set('oai-authenticated-user-full-name',encodeURIComponent(staff.display_name));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
   return workspaceApi(new Request(request,{headers}),{DB,BUCKET:bucket,ENABLE_DEMO_SEED:cfg.enableDemoSeed,RECETTE:cfg.recette===true,MESSAGING:messaging,INTEROP:connectors,INTEROP_ENV:interopEnv});
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Méthode refusée',{status:405});
  if(pathname.startsWith('/modeles/')){
   if(!staff||!modeleAutorise.test(pathname))return new Response('Introuvable',{status:404});
   const file=path.join(modelesRoot,pathname.slice('/modeles/'.length));
   try{const stat=await fs.stat(file);return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file)),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':String(stat.size),'Cache-Control':'private, max-age=2592000, immutable'}})}catch{return new Response('Module de transcription non installé',{status:404})}
  }
  if(['/', '/index.html','/consultation-modele.html'].includes(pathname)&&!staff)return new Response(null,{status:303,headers:{Location:await auth.nextStep(request)}});
  let name;try{name=decodeURIComponent(pathname)}catch{return new Response('Chemin invalide',{status:400})}if(name==='/')name='/index.html';
  if(name.split('/').some(x=>x.startsWith('.'))||name.startsWith('/server/'))return new Response('Introuvable',{status:404});
  if(name==='/assets/marque/etablissement.webp'||name==='/assets/marque/etablissement-sombre.webp'){const r=await etab.logo(name.includes('sombre')?'sombre':'clair');if(r)return r}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return new Response('Introuvable',{status:404});
  try{const stat=await fs.stat(file);if(!stat.isFile())throw Error();const ext=path.extname(file);return new Response(request.method==='HEAD'?null:(ext==='.html'||ext==='.js')?await etab.substituer(await fs.readFile(file,'utf8')):await fs.readFile(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}})}catch{return new Response('Introuvable',{status:404})}
 };
 handle.rappels=rappels;
 // Recette seulement : programme fictif du bloc chargé au démarrage s'il n'y a plus d'intervention de démonstration à venir.
 handle.programmeRecette=async(mode='si-absent')=>{if(!cfg.recette)return null;const owner=(await pool.query("SELECT user_id FROM workspace_members WHERE role='owner' ORDER BY created_at LIMIT 1")).rows[0]?.user_id;if(!owner)return null;
  const r=await workspaceApi(new Request(cfg.baseUrl+'/api/workspace/recette/programme-bloc',{method:'POST',headers:{'oai-authenticated-user-id':owner,Origin:cfg.baseUrl,'Content-Type':'application/json'},body:JSON.stringify({mode})}),{DB,BUCKET:bucket,ENABLE_DEMO_SEED:cfg.enableDemoSeed,RECETTE:true,MESSAGING:messaging,INTEROP:connectors,INTEROP_ENV:interopEnv});return r.json()};
 return handle;
}
export function httpServer(handle,cfg){return http.createServer(async(req,res)=>{
 try{
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined&&!key.toLowerCase().startsWith('oai-'))headers.set(key,Array.isArray(value)?value.join(', '):value);
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024){res.writeHead(413);res.end('Requête trop volumineuse');return}chunks.push(chunk)}
  const target=new URL(req.url,cfg.baseUrl);if(!req.url.startsWith('/')||req.url.startsWith('//')||target.origin!==cfg.baseUrl){res.writeHead(400);res.end('Chemin invalide');return}
  const request=new Request(target,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await handle(request);const output=new Headers(response.headers);
  output.set('X-Content-Type-Options','nosniff');
  // Polices publiques : lisibles par l’aide scientifique, cadre isolé d’origine « null ».
  if(req.url.startsWith('/assets/fonts/'))output.set('Access-Control-Allow-Origin','*');output.set('Referrer-Policy','no-referrer');output.set('X-Frame-Options','DENY');if(!(req.url.startsWith('/modeles/')&&response.ok))output.set('Cache-Control','no-store');
  output.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' blob:; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");if(cfg.secure)output.set('Strict-Transport-Security','max-age=31536000');
  // Les cadres scientifiques internes sont nécessaires au dossier ; eux seuls peuvent être embarqués.
  if(req.url.startsWith('/scientifique-')){output.set('X-Frame-Options','SAMEORIGIN');output.set('Content-Security-Policy',"default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; object-src 'none'")}
  // Trame de consultation d’anesthésie : affichée dans le dossier (même origine) uniquement.
  if(req.url.startsWith('/consultation-modele.html')){output.set('X-Frame-Options','SAMEORIGIN');output.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")}
  res.writeHead(response.status,Object.fromEntries(output));
  // Gros fichiers (module de transcription) : envoyés par morceaux, sans tout charger en mémoire.
  if(response.body&&response.headers.get('Content-Length')&&+response.headers.get('Content-Length')>4*1024*1024){await new Promise((resolve,reject)=>{const flux=Readable.fromWeb(response.body);flux.on('error',reject);res.on('close',resolve);flux.pipe(res)});return}
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error('request_failed',error.code||error.name||'Error');if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Service indisponible. Réessayez.');}
 })}
export async function start(env=process.env){const cfg=config(env),pool=createPool(env);try{await migrate(pool);await bootstrap(pool,env);const bucket=cellarBinding(env);await bucket.check();const handle=await makeApp({pool,bucket,cfg,messaging:brevoMessaging(env),interopEnv:env}),server=httpServer(handle,cfg);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(cfg.port,'0.0.0.0',resolve)});console.log('Parcours Anesthésie écoute sur 0.0.0.0:'+cfg.port);if(cfg.recette)handle.programmeRecette().then(r=>{if(r?.charge)console.log('Recette : programme fictif du bloc chargé ('+r.resume.interventions+' interventions, '+r.resume.annonces+' annonces)');else if(r?.error)console.error('Recette : programme fictif du bloc non chargé : '+r.error)}).catch(e=>console.error('programme_recette',e?.message||e));const tour=()=>handle.rappels().then(r=>{const n=(r.resultats||[]).filter(x=>x.ok!==undefined||x.alerte).length;if(n)console.log('Rappels automatiques : '+n+' traité(s)')}).catch(e=>console.error('rappels_auto',e?.message||e));const rappelsTimer=setInterval(tour,10*60*1000);rappelsTimer.unref?.();setTimeout(tour,30000).unref?.();if(env.IASELO_REFERENTIELS!=='off')import('../scripts/referentiels.mjs').then(({surveillerCcam})=>surveillerCcam({apresMaj:e=>{rechargerCcamIndex();console.log('CCAM V'+e.version+' chargée'+(e.copie?' (copie du dépôt)':'')+' : '+e.actes+' actes.')}})).catch(e=>console.error('surveillance_ccam',e?.message||e));const stop=()=>server.close(async()=>{bucket.close();await pool.end();process.exit(0)});process.once('SIGTERM',stop);process.once('SIGINT',stop);return server;}catch(e){await pool.end();throw e}}
if(process.argv[1]===fileURLToPath(import.meta.url))start().catch(e=>{console.error('Démarrage impossible : '+(e.code||e.message));process.exit(1)});

// Mise à jour des référentiels publics à la construction (Clever Cloud) :
//  - base médicamenteuse : BDPM officielle (ANSM) → dist/assets/medicaments-bdpm.json (remplacé seulement si valide) ;
//  - actes : CCAM officielle (ameli.fr) → dist/assets/ccam.json.
// Un échec n'empêche jamais le démarrage : la copie BDPM du dépôt reste en place, le codage indique « CCAM indisponible ».
// L'état est écrit dans dist/assets/referentiels.json et affiché dans l'application.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {gunzipSync} from 'node:zlib';
import {construireBdpm,FICHIERS_BDPM,urlsBdpm} from '../server/referentiels/bdpm.mjs';
import {construireCcam,archivesSurPage,PAGE_CCAM} from '../server/referentiels/ccam.mjs';

const racine=fileURLToPath(new URL('../dist/assets/',import.meta.url));
// Copie de la CCAM gardée dans le dépôt (construite depuis les archives officielles par scripts/ccam-depot.mjs) :
// utilisée quand ameli.fr ne répond pas (maintenance, erreur 520…) et qu'aucune CCAM n'a encore été chargée.
export const CCAM_DEPOT=fileURLToPath(new URL('../server/referentiels/ccam-depot.json.gz',import.meta.url));
// Dernière version connue des archives (repli si la page ameli ne répond pas). ameli a déjà publié une même version
// avec et sans le zéro initial (CCAM08400 / CCAM8400) : les deux orthographes sont essayées.
export const CCAM_CONNUE={version:'08400',urls:[1,2,3].map(n=>['08400','8400'].map(v=>'https://www.ameli.fr/fileadmin/user_upload/documents/CCAM'+v+'_DBF_PART'+n+'.zip'))};
const entetes={'User-Agent':'Mozilla/5.0 (compatible; IASELO-referentiels/1.1)','Accept':'*/*'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));

async function telecharger(url,{texte=false,accepterErreur=false,essais=3,attente=4000}={}){
 let derniere;
 for(let i=0;i<essais;i++){
  if(i)await pause(attente*i);
  try{
   const r=await fetch(url,{headers:entetes,redirect:'follow',signal:AbortSignal.timeout(180000)});
   if(!r.ok&&!accepterErreur){derniere=Error('HTTP '+r.status+' pour '+url);if(r.status<500&&r.status!==429)break;continue}
   return texte?r.text():Buffer.from(await r.arrayBuffer());
  }catch(e){derniere=e}
 }
 throw derniere;
}
async function premier(urls,o){let derniere;for(const u of [urls].flat()){try{return await telecharger(u,o)}catch(e){derniere=e}}throw derniere}

/** Version CCAM publiée sur ameli aujourd'hui ({version, urls}), ou null si la page ne répond pas. */
export async function ccamPubliee(o){try{return archivesSurPage(await telecharger(PAGE_CCAM,{texte:true,...o}))}catch{return null}}
const lireJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return null}};

export async function majBdpm({dossier=racine,journal=console.log}={}){
 const [spe,compo]=await Promise.all([premier(urlsBdpm(FICHIERS_BDPM.specialites)),premier(urlsBdpm(FICHIERS_BDPM.compositions))]);
 const base=construireBdpm(spe,compo);
 fs.writeFileSync(path.join(dossier,'medicaments-bdpm.json'),JSON.stringify(base)+'\n');
 journal('Base médicamenteuse BDPM : '+base.specialties.length+' spécialités ('+base.specialtiesDate+').');
 return {etat:'ok',specialites:base.specialties.length,date:base.specialtiesDate};
}

export async function majCcam({dossier=racine,journal=console.log,depot=CCAM_DEPOT,essais}={}){
 const o=essais?{essais,attente:0}:{};
 let cible=await ccamPubliee(o),erreur;
 if(!cible)journal('Page CCAM ameli injoignable, version connue V'+CCAM_CONNUE.version+' essayée.');
 cible??=CCAM_CONNUE;
 let ccam=null;
 try{const zips=[];for(const u of cible.urls)zips.push(await premier(u,o));ccam=await construireCcam(zips,{version:cible.version})}
 catch(e){erreur=e}
 let copie;
 if(!ccam){
  // ameli indisponible : on garde la CCAM déjà chargée si elle est au moins aussi récente, sinon la copie du dépôt.
  const actuelle=lireJson(path.join(dossier,'ccam.json'));
  let duDepot=null;try{duDepot=JSON.parse(gunzipSync(fs.readFileSync(depot)).toString('utf8'))}catch{}
  if(actuelle?.actes?.length&&!(duDepot&&duDepot.version>actuelle.version))throw erreur;
  if(!duDepot?.actes?.length)throw erreur;
  ccam=duDepot;copie='dépôt';
  journal('ameli injoignable ('+String(erreur?.message||erreur).slice(0,120)+') : copie CCAM V'+ccam.version+' du dépôt utilisée.');
 }
 fs.writeFileSync(path.join(dossier,'ccam.json'),JSON.stringify(ccam)+'\n');
 const nMod=Object.keys(ccam.modificateurs||{}).length,nAut=ccam.actes.filter(a=>Object.keys(a[6]||{}).length).length;
 journal('CCAM V'+ccam.version+' : '+ccam.actes.length+' actes en vigueur, '+nMod+' modificateurs décrits, '+nAut+' actes avec modificateurs autorisés.');
 return {etat:'ok',version:ccam.version,actes:ccam.actes.length,date:ccam.miseAJour,modificateurs:nMod,actesAvecModificateurs:nAut,tablesModificateurs:ccam.tablesModificateurs,...(copie?{copie,erreurAmeli:String(erreur?.message||erreur).slice(0,200)}:{})};
}

export async function majReferentiels({dossier=racine,journal=console.log}={}){
 const etatPrecedent=(()=>{try{return JSON.parse(fs.readFileSync(path.join(dossier,'referentiels.json'),'utf8'))}catch{return {}}})();
 const etat={verifieLe:new Date().toISOString()};
 for(const [cle,maj] of [['medicaments',majBdpm],['ccam',majCcam]]){
  try{etat[cle]=await maj({dossier,journal})}
  catch(e){const erreur=String(e.message||e).slice(0,200);journal('Référentiel '+cle+' non mis à jour : '+erreur);etat[cle]={...(etatPrecedent[cle]?.etat==='ok'?etatPrecedent[cle]:{}),etat:'echec',erreur}}
 }
 if(etat.medicaments.etat!=='ok'){try{const b=JSON.parse(fs.readFileSync(path.join(dossier,'medicaments-bdpm.json'),'utf8'));Object.assign(etat.medicaments,{specialites:b.specialties.length,date:b.specialtiesDate,copie:'dépôt'})}catch{}}
 if(etat.ccam.etat!=='ok'&&!fs.existsSync(path.join(dossier,'ccam.json')))etat.ccam.absent=true;
 fs.writeFileSync(path.join(dossier,'referentiels.json'),JSON.stringify(etat,null,1)+'\n');
 return etat;
}

/** Nouvel essai de la CCAM seule (serveur en marche) : met à jour ccam.json et la partie « ccam » de referentiels.json. */
export async function rafraichirCcam({dossier=racine,journal=console.log,forcer=false,essais,depot}={}){
 const f=path.join(dossier,'referentiels.json'),etat=lireJson(f)||{},avant=etat.ccam||{};
 if(!forcer&&avant.etat==='ok'&&!avant.copie){
  // CCAM officielle déjà chargée : on ne télécharge que si ameli publie une version plus récente.
  const pub=await ccamPubliee({essais:1});if(!pub||!(pub.version>String(avant.version||'')))return {change:false,etat:avant};
 }
 try{
  const nouveau=await majCcam({dossier,journal,essais,...(depot?{depot}:{})});
  const change=nouveau.version!==avant.version||nouveau.copie!==avant.copie||avant.etat!=='ok';
  if(nouveau.copie&&avant.copie&&nouveau.version===avant.version)return {change:false,etat:avant};
  etat.ccam=nouveau;etat.ccamVerifieLe=new Date().toISOString();fs.writeFileSync(f,JSON.stringify(etat,null,1)+'\n');
  return {change,etat:nouveau};
 }catch(e){
  etat.ccamVerifieLe=new Date().toISOString();etat.ccam={...avant,etat:avant.etat==='ok'?avant.etat:'echec',erreur:String(e.message||e).slice(0,200)};
  if(!fs.existsSync(path.join(dossier,'ccam.json')))etat.ccam.absent=true;
  fs.writeFileSync(f,JSON.stringify(etat,null,1)+'\n');return {change:false,etat:etat.ccam};
 }
}

/** Planifie les nouveaux essais : toutes les 3 h tant que la CCAM officielle n'est pas chargée, puis une fois par jour
 * pour repérer une nouvelle version publiée par ameli. `apresMaj` est appelé quand la nomenclature a changé. */
export function surveillerCcam({apresMaj=()=>{},journal=console.log,premierDelai=2*60*1000}={}){
 let minuteur;
 const planifier=ms=>{minuteur=setTimeout(tour,ms);minuteur.unref?.()};
 const tour=async()=>{
  let r;try{r=await rafraichirCcam({journal})}catch(e){journal('CCAM : nouvel essai impossible ('+(e?.message||e)+').')}
  if(r?.change)try{apresMaj(r.etat)}catch{}
  const officielle=r?.etat?.etat==='ok'&&!r.etat.copie;
  planifier(officielle?24*3600*1000:3*3600*1000);
 };
 planifier(premierDelai);
 return {arreter:()=>clearTimeout(minuteur)};
}

if(process.argv[1]===fileURLToPath(import.meta.url))await majReferentiels();

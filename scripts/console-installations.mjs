#!/usr/bin/env node
// IASELO · console des installations (une installation par établissement, décision du 27/11/2026).
// Chaque établissement a sa propre application Clever Cloud, sa base PostgreSQL et son stockage Cellar : aucune donnée
// n'est partagée entre établissements. Cette console aide l'exploitant (l'éditeur) à les créer, les suivre et les mettre à jour.
//
//   node scripts/console-installations.mjs etat [fichier]
//       Interroge GET /api/instance/etat de chaque installation listée (par défaut installations.json, jamais versionné)
//       et affiche version, commit, migrations, base, stockage. Code de sortie 1 si une installation ne répond pas bien.
//   node scripts/console-installations.mjs nouvelle --code lilas --nom "Clinique des Lilas" --url https://lilas.iaselo.fr \
//        --admin-email admin@lilas.fr [--finess 690000000] [--ville Lyon] [--org orga_xxx] [--plan-pg <offre HDS>] [--fichier installations.json]
//       Écrit un script shell (installation-<code>.sh) avec les commandes Clever Cloud à lancer, et ajoute
//       l'installation au fichier. Les secrets (session, jeton de console) sont générés ici et ne sont jamais affichés.
//   node scripts/console-installations.mjs mettre-a-jour [fichier]
//       Affiche, pour chaque installation, la commande de déploiement de la version courante puis la vérification d'état.
//
// installations.json : [{"code":"trocadero","nom":"Clinique du Trocadéro","url":"https://…","alias":"iaselo-trocadero","jetonVariable":"IASELO_CONSOLE_TROCADERO"}]
// Le jeton de chaque installation (INSTANCE_CONSOLE_TOKEN côté application) est lu dans la variable d'environnement nommée
// par « jetonVariable », sur le poste de l'exploitant : il n'est jamais écrit dans le fichier.
import fs from 'node:fs';import {randomBytes} from 'node:crypto';import {execSync} from 'node:child_process';

const args=process.argv.slice(2),cmd=args[0]||'aide';
const opt=(nom,defaut='')=>{const i=args.indexOf('--'+nom);return i>0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:defaut};
const fichierParDefaut=()=>opt('fichier',args[1]&&!args[1].startsWith('--')?args[1]:'installations.json');
export function lire(fichier){if(!fs.existsSync(fichier))return [];const l=JSON.parse(fs.readFileSync(fichier,'utf8'));if(!Array.isArray(l))throw Error(fichier+' doit contenir une liste.');return l}
const shq=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
export const codeValide=c=>/^[a-z][a-z0-9-]{1,30}$/.test(c);

export async function etat(installations,{fetcher=globalThis.fetch,env=process.env,delai=10000}={}){
 return Promise.all(installations.map(async i=>{
  const jeton=env[i.jetonVariable||''];if(!jeton)return {...i,ok:false,erreur:'Jeton absent : variable '+(i.jetonVariable||'?')+' non définie sur ce poste.'};
  try{const r=await fetcher(new URL('/api/instance/etat',i.url),{headers:{Authorization:'Bearer '+jeton},signal:AbortSignal.timeout(delai)});
   if(!r.ok)return {...i,ok:false,erreur:'HTTP '+r.status};const e=await r.json();
   return {...i,ok:e.base==='ok'&&e.stockage==='ok',etat:e,erreur:e.base!=='ok'?'Base injoignable':e.stockage!=='ok'?'Stockage injoignable':''}}
  catch(err){return {...i,ok:false,erreur:err.name==='TimeoutError'?'Pas de réponse en '+delai/1000+' s':'Injoignable ('+(err.cause?.code||err.message)+')'}}
 }));
}
export function tableau(res){
 const lignes=[['Établissement','Adresse','Version','Commit','Migrations','État']].concat(res.map(r=>[r.etat?.etablissement?.nom||r.nom,r.url,r.etat?.version||'—',r.etat?.commit||'—',r.etat?String(r.etat.migrations)+' ('+r.etat.derniereMigration+')':'—',r.ok?'OK':'À VOIR : '+r.erreur]));
 const l=lignes[0].map((_,c)=>Math.max(...lignes.map(x=>String(x[c]).length)));
 const versions=new Set(res.filter(r=>r.etat).map(r=>r.etat.version+'/'+r.etat.derniereMigration));
 return lignes.map(x=>x.map((v,c)=>String(v).padEnd(l[c])).join('  ')).join('\n')+(versions.size>1?'\n\nAttention : toutes les installations ne sont pas à la même version.':'');
}
// Script de création d'une installation sur Clever Cloud (à relire puis lancer par l'exploitant, CLI « clever » connectée).
export function scriptNouvelle(o,{secret=()=>randomBytes(48).toString('hex'),jeton=()=>randomBytes(32).toString('hex')}={}){
 const alias='iaselo-'+o.code,org=o.org?' --org '+shq(o.org):'',env={NODE_ENV:'production',BASE_URL:o.url,SESSION_SECRET:secret(),SESSION_HOURS:'8',BOOTSTRAP_ADMIN_EMAIL:o.adminEmail,BOOTSTRAP_ADMIN_NAME:'Administrateur '+o.nom,
  S3_BUCKET:alias+'-documents',S3_REGION:'default',PGSSL:'verify-full',CC_NODE_VERSION:'24',CC_NODE_BUILD_TOOL:'npm-ci',CC_RUN_COMMAND:'npm start',CC_HEALTH_CHECK_PATH:'/healthz',ENABLE_DEMO_SEED:'false',
  ETABLISSEMENT_NOM:o.nom,...(o.ville?{ETABLISSEMENT_VILLE:o.ville}:{}),...(o.finess?{ETABLISSEMENT_FINESS:o.finess}:{}),INSTANCE_CONSOLE_TOKEN:jeton()};
 const jetonVariable='IASELO_CONSOLE_'+o.code.toUpperCase().replace(/-/g,'_');
 const sh=`#!/bin/sh
# IASELO · nouvelle installation « ${o.nom} » (${o.url}). Généré par scripts/console-installations.mjs le ${new Date().toISOString().slice(0,10)}.
# À relire avant de lancer. Contient des secrets : à supprimer après usage (ne pas versionner, ne pas envoyer par e-mail).
# Prérequis : CLI Clever Cloud connectée (clever login), offre HDS souscrite pour cette organisation.
# Vérifiez la syntaxe avec « clever --help » : la CLI évolue.
set -eu
clever create --type node ${shq(alias)} --region par${org} --alias ${shq(alias)}
clever addon create postgresql-addon ${shq(alias+'-pg')} --plan ${shq(o.planPg||'À_CHOISIR_OFFRE_HDS')} --region par${org} --link ${shq(alias)}
clever addon create cellar-addon ${shq(alias+'-cellar')} --plan S --region par${org} --link ${shq(alias)}
# Créez dans Cellar le bucket privé ${env.S3_BUCKET} (console Clever Cloud > Cellar), sans accès public.
${Object.entries(env).map(([k,v])=>`clever env set --alias ${shq(alias)} ${k} ${shq(v)}`).join('\n')}
# Mot de passe du premier administrateur : « npm run password:hash » puis
# clever env set --alias ${shq(alias)} BOOTSTRAP_ADMIN_PASSWORD_HASH 'scrypt$…'
# Envoi SMS / e-mail : clever env set --alias ${shq(alias)} BREVO_API_KEY '…' (compte Brevo de l'établissement)
clever domain add ${shq(new URL(o.url).host)} --alias ${shq(alias)}
clever deploy --alias ${shq(alias)}
# Sur le poste de l'exploitant, pour la console : export ${jetonVariable}='${env.INSTANCE_CONSOLE_TOKEN}'
`;
 return {alias,jetonVariable,sh,entree:{code:o.code,nom:o.nom,url:o.url,alias,jetonVariable}};
}
function aide(){console.log(fs.readFileSync(new URL(import.meta.url),'utf8').split('\n').slice(1,20).map(l=>l.replace(/^\/\/ ?/,'')).join('\n'))}

async function main(){
 if(cmd==='etat'){const l=lire(fichierParDefaut());if(!l.length){console.log('Aucune installation dans '+fichierParDefaut()+'.');return}const r=await etat(l);console.log(tableau(r));process.exitCode=r.every(x=>x.ok)?0:1;return}
 if(cmd==='nouvelle'){
  const o={code:opt('code'),nom:opt('nom'),url:opt('url'),adminEmail:opt('admin-email'),finess:opt('finess'),ville:opt('ville'),org:opt('org'),planPg:opt('plan-pg')};
  if(!codeValide(o.code))throw Error('--code : lettres minuscules, chiffres et tirets (ex. lilas).');
  if(!o.nom||!/^https:\/\/[^/]+$/.test(o.url)||!/@/.test(o.adminEmail))throw Error('--nom, --url (https://domaine, sans chemin) et --admin-email sont requis.');
  if(o.finess&&!/^\d{9}$/.test(o.finess))throw Error('--finess : 9 chiffres.');
  const fichier=opt('fichier','installations.json'),l=lire(fichier);if(l.some(x=>x.code===o.code))throw Error('Code déjà utilisé : '+o.code);
  const r=scriptNouvelle(o),sortie='installation-'+o.code+'.sh';
  fs.writeFileSync(sortie,r.sh,{mode:0o700});fs.writeFileSync(fichier,JSON.stringify([...l,r.entree],null,1)+'\n');
  console.log(`Script écrit : ${sortie} (contient des secrets, à supprimer après usage).\nInstallation ajoutée à ${fichier}.\nAprès le déploiement : export ${r.jetonVariable}=… (ligne en fin de script) puis « node scripts/console-installations.mjs etat ».`);return;
 }
 if(cmd==='mettre-a-jour'){
  const l=lire(fichierParDefaut());let commit='';try{commit=execSync('git rev-parse --short HEAD',{stdio:['ignore','pipe','ignore']}).toString().trim()}catch{}
  console.log(`# Déploiement de la version ${commit||'courante'} sur ${l.length} installation(s), une par une (les migrations s'appliquent au démarrage).`);
  for(const i of l)console.log(`clever deploy --alias ${shq(i.alias)} && node scripts/console-installations.mjs etat  # ${i.nom}`);
  return;
 }
 aide();
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop()))main().catch(e=>{console.error('Erreur : '+e.message);process.exit(2)});

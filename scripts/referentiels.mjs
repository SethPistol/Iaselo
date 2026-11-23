// Mise à jour des référentiels publics à la construction (Clever Cloud) :
//  - base médicamenteuse : BDPM officielle (ANSM) → dist/assets/medicaments-bdpm.json (remplacé seulement si valide) ;
//  - actes : CCAM officielle (ameli.fr) → dist/assets/ccam.json.
// Un échec n'empêche jamais le démarrage : la copie BDPM du dépôt reste en place, le codage indique « CCAM indisponible ».
// L'état est écrit dans dist/assets/referentiels.json et affiché dans l'application.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {construireBdpm,FICHIERS_BDPM,urlsBdpm} from '../server/referentiels/bdpm.mjs';
import {construireCcam,archivesSurPage,PAGE_CCAM} from '../server/referentiels/ccam.mjs';

const racine=fileURLToPath(new URL('../dist/assets/',import.meta.url));
// Dernière version connue des archives (repli si la page ameli ne répond pas).
const CCAM_CONNUE={version:'08400',urls:['https://www.ameli.fr/fileadmin/user_upload/documents/CCAM08400_DBF_PART1.zip','https://www.ameli.fr/fileadmin/user_upload/documents/CCAM8400_DBF_PART2.zip','https://www.ameli.fr/fileadmin/user_upload/documents/CCAM08400_DBF_PART3.zip']};
const entetes={'User-Agent':'IASELO-referentiels/1.0','Accept':'*/*'};

async function telecharger(url,{texte=false,accepterErreur=false}={}){
 const r=await fetch(url,{headers:entetes,redirect:'follow',signal:AbortSignal.timeout(180000)});
 if(!r.ok&&!accepterErreur)throw Error('HTTP '+r.status+' pour '+url);
 return texte?r.text():Buffer.from(await r.arrayBuffer());
}
async function premier(urls){let derniere;for(const u of urls){try{return await telecharger(u)}catch(e){derniere=e}}throw derniere}

export async function majBdpm({dossier=racine,journal=console.log}={}){
 const [spe,compo]=await Promise.all([premier(urlsBdpm(FICHIERS_BDPM.specialites)),premier(urlsBdpm(FICHIERS_BDPM.compositions))]);
 const base=construireBdpm(spe,compo);
 fs.writeFileSync(path.join(dossier,'medicaments-bdpm.json'),JSON.stringify(base)+'\n');
 journal('Base médicamenteuse BDPM : '+base.specialties.length+' spécialités ('+base.specialtiesDate+').');
 return {etat:'ok',specialites:base.specialties.length,date:base.specialtiesDate};
}

export async function majCcam({dossier=racine,journal=console.log}={}){
 let cible=null;
 try{cible=archivesSurPage(await telecharger(PAGE_CCAM,{texte:true,accepterErreur:true}))}catch(e){journal('Page CCAM ameli injoignable ('+e.message+'), version connue utilisée.')}
 cible??=CCAM_CONNUE;
 const zips=[];for(const u of cible.urls)zips.push(await telecharger(u));
 const ccam=await construireCcam(zips,{version:cible.version});
 fs.writeFileSync(path.join(dossier,'ccam.json'),JSON.stringify(ccam)+'\n');
 journal('CCAM V'+cible.version+' : '+ccam.actes.length+' actes en vigueur.');
 return {etat:'ok',version:cible.version,actes:ccam.actes.length,date:ccam.miseAJour};
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

if(process.argv[1]===fileURLToPath(import.meta.url))await majReferentiels();

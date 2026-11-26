// CCAM (classification commune des actes médicaux), publiée par l'Assurance Maladie sur ameli.fr
// (« Fichiers informatiques nouvelle structure » : base dBase en trois archives ZIP).
// On ne retient, pour chaque acte, que la version en vigueur aujourd'hui (tables historisées par date de modification)
// et seulement ce dont le codage à la source a besoin : code, libellé, activités (1 chirurgien… 4 anesthésie),
// prix unitaire de base de l'activité 1 phase 0, chapitre, prix unitaire de chaque activité (phase 0), modificateurs
// autorisés par activité et, quand les tables les fournissent, libellé et coefficient de chaque modificateur.
// Les actes dont la date de fin est passée sont écartés.
// Les tables des modificateurs sont repérées par leurs colonnes (un code de modificateur et un code acte-activité,
// ou un code de modificateur et un coefficient) : leurs noms exacts varient selon les versions de la base.
import {entreesZip,lireDbf,colonnesDbf} from './archives.mjs';

export const PAGE_CCAM='https://www.ameli.fr/accueil-de-la-ccam/telechargement/fichiers-informatiques-nouvelle-structure/index.php';
const BASE='https://www.ameli.fr';

/** Liens des archives DBF de la version courante, repérés sur la page ameli. */
export function archivesSurPage(html){
 const liens=[...String(html).matchAll(/href="([^"]*CCAM0?(\d{4,5})_DBF_PART(\d)\.zip)"/gi)].map(m=>({url:m[1].startsWith('http')?m[1]:BASE+(m[1].startsWith('/')?'':'/')+m[1],version:m[2].padStart(5,'0'),partie:+m[3]}));
 if(!liens.length)return null;
 const version=liens.map(l=>l.version).sort().at(-1);
 return {version,urls:[...new Map(liens.filter(l=>l.version===version).sort((a,b)=>a.partie-b.partie).map(l=>[l.partie,l.url])).values()]};
}

const jour=d=>String(d||'').replace(/\D/g,'').slice(0,8);
function retenir(map,cle,ligne,ref){const d=jour(ligne.DT_MODIF);if(ref&&d&&d>ref)return;const c=map.get(cle);if(!c||d>=jour(c.DT_MODIF))map.set(cle,ligne)}

/** Construit le référentiel à partir des archives (Buffers). `aujourdhui` = AAAAMMJJ. */
export async function construireCcam(zips,{version='',aujourdhui=new Date().toISOString().slice(0,10).replace(/-/g,'')}={}){
 const tables=new Map();
 for(const z of zips)for(const e of entreesZip(z)){const n=e.nom.split(/[\\/]/).pop().toUpperCase();if(n.endsWith('.DBF'))tables.set(n.slice(0,-4),e)}
 for(const t of ['R_ACTE','R_ACTE_IVITE'])if(!tables.has(t))throw Error('Table CCAM '+t+' absente des archives.');
 const lire=(t,o)=>tables.has(t)?lireDbf(tables.get(t).donnees(),o):(async function*(){})();
 const menus=new Map();for await(const m of lire('R_MENU',{champs:['COD_MENU','COD_PERE','RANG','LIBELLE']}))menus.set(m.COD_MENU,m);
 const activites=new Map();for await(const a of lire('R_ACTE_IVITE',{champs:['COD_AA','ACTE_COD','ACTIV_COD','DT_MODIF']}))retenir(activites,a.COD_AA,a,aujourdhui);
 const phases=new Map();for await(const p of lire('R_ACTE_IVITE_PHASE',{champs:['COD_AAP','PU_BASE','DT_MODIF']}))retenir(phases,p.COD_AAP,p,aujourdhui);
 const actes=new Map();
 for await(const a of lire('R_ACTE',{brut:n=>n.startsWith('NOM_LONG')})){
  if(!/^[A-Z]{4}\d{3}$/.test(a.COD_ACTE))continue;
  retenir(actes,a.COD_ACTE,{COD_ACTE:a.COD_ACTE,DT_MODIF:a.DT_MODIF,DT_FIN:a.DT_FIN,MENU_COD:a.MENU_COD,NOM_COURT:a.NOM_COURT,
   libelle:Object.keys(a).filter(k=>k.startsWith('NOM_LONG')).map(k=>a[k]).join('').replace(/\s+/g,' ').trim()},aujourdhui);
 }
 // Prix unitaire de base par activité (phase 0) : COD_AAP = code acte + activité + phase.
 const prixActivite=(code,act)=>{const pu=phases.get(code+act+'0')?.PU_BASE;const n=pu===undefined||pu===''?NaN:Number(pu);return Number.isFinite(n)?n:null};
 // Modificateurs : tables repérées par leurs colonnes.
 const diagnostic=[],autorises=new Map(),definitions=new Map();
 for(const [nom,e] of tables){
  const cols=await colonnesDbf(e.donnees());const cMod=cols.find(c=>/^(COD_)?MODI|MODIF.*COD|MODIFI/.test(c));if(!cMod)continue;
  const cAA=cols.find(c=>c==='COD_AA'||c==='AA_COD'),cActe=cols.find(c=>c==='ACTE_COD'||c==='COD_ACTE'),cAct=cols.find(c=>c==='ACTIV_COD'||c==='COD_ACTIV');
  const cCoef=cols.find(c=>/COEF/.test(c)),cForf=cols.find(c=>/FORF/.test(c)),cLib=cols.find(c=>/^LIB|LIBELLE/.test(c)),cDate=cols.find(c=>/^DT_(MODIF|DEBUT|EFFET)/.test(c));
  diagnostic.push({table:nom,colonnes:cols});
  if(cAA||(cActe&&cAct)){for await(const l of lireDbf(e.donnees(),{champs:[cMod,cAA,cActe,cAct].filter(Boolean)})){
    const aa=cAA?l[cAA]:l[cActe]+l[cAct],m=String(l[cMod]||'').trim().toUpperCase();if(!/^[A-Z]{4}\d{3}\d$/.test(aa)||!/^[A-Z0-9]$/.test(m))continue;
    if(!autorises.has(aa))autorises.set(aa,new Set());autorises.get(aa).add(m)}}
  else if(cCoef||cForf||cLib){for await(const l of lireDbf(e.donnees(),{champs:[cMod,cCoef,cForf,cLib,cDate].filter(Boolean)})){
    const m=String(l[cMod]||'').trim().toUpperCase();if(!/^[A-Z0-9]$/.test(m))continue;const d=jour(l[cDate]);if(d&&d>aujourdhui)continue;
    const prec=definitions.get(m);if(prec&&jour(prec.date)>d)continue;
    definitions.set(m,{date:d,libelle:cLib?String(l[cLib]||'').replace(/\s+/g,' ').trim():(prec?.libelle||''),coef:cCoef?Number(String(l[cCoef]).replace(',','.')):null,forfait:cForf?Number(String(l[cForf]).replace(',','.')):null})}}
 }
 // Coefficient : 1,20 (multiplicateur), 120 (multiplicateur × 100) ou 20 (pourcentage) selon la table.
 const majoration=c=>!Number.isFinite(c)||c<=0?null:c<=3?c-1:c>50?c/100-1:c/100;
 const modificateurs=Object.fromEntries([...definitions].sort().map(([m,d])=>[m,{libelle:d.libelle,majoration:majoration(d.coef),forfait:Number.isFinite(d.forfait)&&d.forfait>0?d.forfait:null}]));
 const parActe=new Map();for(const a of activites.values()){if(!parActe.has(a.ACTE_COD))parActe.set(a.ACTE_COD,[]);parActe.get(a.ACTE_COD).push(String(a.ACTIV_COD))}
 const chapitre=code=>{const m=menus.get(code);if(!m)return '';const p=menus.get(m.COD_PERE);return [p&&p.COD_PERE&&menus.has(p.COD_PERE)?p.LIBELLE:'',m.LIBELLE].filter(Boolean).join(' › ')};
 const liste=[];
 for(const a of [...actes.values()].sort((x,y)=>x.COD_ACTE.localeCompare(y.COD_ACTE))){
  const fin=jour(a.DT_FIN);if(fin&&fin<aujourdhui)continue;
  const acts=[...new Set(parActe.get(a.COD_ACTE)||[])].sort().join('');
  const pu=phases.get(a.COD_ACTE+'10')?.PU_BASE,tarif=pu===undefined||pu===''?null:Number(pu);
  const prix={},mods={};for(const x of acts){const p=prixActivite(a.COD_ACTE,x);if(p!==null)prix[x]=p;const m=autorises.get(a.COD_ACTE+x);if(m)mods[x]=[...m].sort().join('')}
  liste.push([a.COD_ACTE,a.libelle||a.NOM_COURT||'',acts,Number.isFinite(tarif)?tarif:null,chapitre(a.MENU_COD),prix,mods]);
 }
 if(!liste.length)throw Error('Aucun acte CCAM en vigueur lu dans les archives.');
 return {version,source:'CCAM, Assurance Maladie (ameli.fr)',miseAJour:new Date().toISOString().slice(0,10),colonnes:['code','libelle','activites','tarifBase','chapitre','tarifsParActivite','modificateursParActivite'],actes:liste,modificateurs,tablesModificateurs:diagnostic};
}

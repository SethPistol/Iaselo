// Base de données publique des médicaments (ANSM, HAS, UNCAM ; Licence Ouverte).
// Même format que dist/assets/medicaments-bdpm.json (scripts/import-bdpm.py), complété par les dosages
// des substances actives : [cis, dénomination, forme, voies, statut AMM, commercialisation, substances[], dosages[]].
import {lignesTabulees} from './archives.mjs';

export const BASE_BDPM='https://base-donnees-publique.medicaments.gouv.fr';
export const FICHIERS_BDPM={specialites:'CIS_bdpm.txt',compositions:'CIS_COMPO_bdpm.txt',presentations:'CIS_CIP_bdpm.txt'};
export const urlsBdpm=fichier=>[BASE_BDPM+'/download/file/'+fichier,BASE_BDPM+'/telechargement.php?fichier='+fichier];

export function construireBdpm(specialites,compositions,{date=new Date().toISOString().slice(0,10)}={}){
 const subst=new Map();
 for(const c of lignesTabulees(compositions)){
  const [cis,,,nom,dosage,,nature]=c;if(nature!=='SA'||!nom)continue;
  if(!subst.has(cis))subst.set(cis,new Map());const m=subst.get(cis);if(!m.has(nom))m.set(nom,dosage||'');
 }
 const vus=new Set(),liste=[];
 for(const r of lignesTabulees(specialites)){
  const [cis,nom,forme,voies,autorisation,,commercialisation]=r;
  if(!/^\d{8}$/.test(cis||'')||vus.has(cis))throw Error('Code CIS invalide ou en double : '+String(cis).slice(0,20));
  vus.add(cis);const s=subst.get(cis)||new Map();
  liste.push([cis,nom||'',forme||'',voies||'',autorisation||'',commercialisation||'',[...s.keys()],[...s.values()]]);
 }
 if(liste.length<10000)throw Error('Fichier des spécialités incomplet ('+liste.length+' lignes).');
 return {specialtiesDate:date,compositionDate:date,source:'Base de données publique des médicaments (ANSM, HAS, UNCAM), téléchargée le '+date,specialties:liste};
}

// Présentations (boîtes) : code CIP13 → code CIS. Sert au contrôle « bon médicament » quand l'infirmière scanne
// le DataMatrix de la boîte (GTIN 0 + CIP13). Colonnes : CIS, CIP7, libellé, statut, commercialisation, date, CIP13…
export function construirePresentations(presentations,{date=new Date().toISOString().slice(0,10)}={}){
 const cip={};
 for(const r of lignesTabulees(presentations)){const [cis,,,,,,cip13]=r;if(/^\d{8}$/.test(cis||'')&&/^\d{13}$/.test(cip13||''))cip[cip13]=cis}
 const n=Object.keys(cip).length;if(n<10000)throw Error('Fichier des présentations incomplet ('+n+' lignes).');
 return {date,source:'Base de données publique des médicaments (ANSM, HAS, UNCAM), présentations, téléchargée le '+date,cip};
}

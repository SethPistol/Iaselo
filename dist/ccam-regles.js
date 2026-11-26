/* Codage CCAM à la source : recherche dans la nomenclature officielle et propositions d'actes
   à partir de l'intervention prévue et du compte rendu opératoire.
   Ce ne sont que des propositions : le praticien confirme l'acte, le médecin DIM valide avant toute transmission. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCcam=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const plier=v=>String(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[œ]/g,'oe').replace(/[^a-z0-9]+/g,' ').trim();
// Mots vides et mots trop génériques dans les libellés CCAM (« par », « avec »…) ou dans un compte rendu.
const VIDES=new Set('a au aux avec ce ces chez dans de des du en et ou la le les l d un une par pour sur sous sans selon son sa ses leur leurs plus moins entre vers apres avant lors cas type niveau fois patient patiente mise place realise realisee effectue intervention operation geste temps bien puis ensuite fin debut droit droite gauche cote bilateral bilaterale unilateral unilaterale'.split(' '));
const racine=m=>{let r=m.replace(/(s|x)$/,'');return r.length>6?r.slice(0,6):r};
const mots=t=>plier(t).split(' ').filter(m=>m.length>2&&!VIDES.has(m)&&!/^\d+$/.test(m)).map(racine);
const ACTIVITES={'1':'acte principal (chirurgien ou médecin)','2':'2e opérateur','3':'3e opérateur','4':'anesthésie','5':'circulation extracorporelle'};
const CODE=/^[A-Z]{4}\d{3}$/;

/** Prépare l'index (une fois par chargement). `ref` = contenu de assets/ccam.json. */
function indexer(ref){
 const actes=(ref?.actes||[]).map(([code,libelle,activites,tarif,chapitre,tarifs,modificateurs])=>({code,libelle,activites:String(activites||''),tarif,chapitre:chapitre||'',tarifs:tarifs||{},modificateurs:modificateurs||{},plie:plier(code+' '+libelle),racines:[...new Set(mots(libelle))]}));
 const df=new Map();for(const a of actes)for(const r of a.racines)df.set(r,(df.get(r)||0)+1);
 const n=actes.length||1,idf=new Map([...df].map(([r,k])=>[r,Math.log(1+n/k)]));
 return {version:ref?.version||'',miseAJour:ref?.miseAJour||'',modificateurs:ref?.modificateurs||{},actes,idf,parCode:new Map(actes.map(a=>[a.code,a]))};
}

/** Recherche libre : code exact ou tous les mots présents dans le libellé. */
function rechercher(ix,q,max=20){
 const p=plier(q);if(!p)return [];
 const code=p.toUpperCase().replace(/\s/g,'');if(ix.parCode.has(code))return [ix.parCode.get(code)];
 const m=p.split(' ');
 return ix.actes.filter(a=>m.every(x=>a.plie.includes(x))).sort((a,b)=>a.libelle.length-b.libelle.length).slice(0,max);
}

/** Propositions à partir d'un texte (intervention, CRO) : pondération par la rareté des mots dans la CCAM. */
function proposer(ix,texte,max=8){
 const r=new Set(mots(texte));if(!r.size)return [];
 const out=[];
 for(const a of ix.actes){
  let s=0;const communs=[];for(const x of a.racines)if(r.has(x)){s+=ix.idf.get(x)||0;communs.push(x)}
  if(communs.length<2&&!(communs.length===1&&a.racines.length<=2))continue;
  out.push({...a,score:s/Math.sqrt(a.racines.length+1),communs});
 }
 return out.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).slice(0,max);
}

/** Contrôle d'un code avant confirmation : existence dans la version chargée et activité autorisée. */
function verifier(ix,code,activite){
 const c=String(code||'').toUpperCase().trim();
 if(!CODE.test(c))return {ok:false,message:'Code CCAM attendu : 4 lettres et 3 chiffres.'};
 if(!ix||!ix.actes.length)return {ok:true,avertissement:'Nomenclature CCAM non chargée : code non vérifié.'};
 const a=ix.parCode.get(c);if(!a)return {ok:false,message:c+' n’existe pas (ou plus) dans la CCAM V'+ix.version+'.'};
 if(activite&&a.activites&&!a.activites.includes(String(activite)))return {ok:false,message:c+' n’a pas d’activité '+activite+' ('+(ACTIVITES[activite]||'')+') dans la CCAM.'};
 return {ok:true,acte:a};
}

const tarif=v=>v==null||v===''?'':Number(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
return {plier,mots,indexer,rechercher,proposer,verifier,ACTIVITES,tarif};
});

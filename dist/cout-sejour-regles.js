/* IASELO · coût par séjour (27/11/2026, 4e veille, lot F). Règles pures, sans réseau.
   Coût complet estimé de chaque séjour, par méthode des coûts unitaires (façon ENC) : minutes de bloc, minutes de SSPI,
   nuits (ou place d'ambulatoire), consommables par intervention ; comparé à la recette de l'établissement (GHS,
   journées au-delà de la borne haute, implants en sus, forfait journalier, chambre particulière) estimée à partir du
   dossier de facturation. Coûts unitaires = réglages de l'établissement (valeurs par défaut indicatives, à remplacer
   par sa comptabilité analytique). Les honoraires des praticiens libéraux ne sont pas des recettes de la clinique. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./assurance-maladie-regles.js'):root.IaseloAssurance);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloCoutSejour=api;})(typeof self!=='undefined'?self:globalThis,function(A){
'use strict';
const REGLAGES_DEFAUT={minuteBloc:12,minuteSspi:2.5,nuit:380,ambulatoire:220,consommables:150,sspiDefautMin:60};
const BORNES={minuteBloc:[0,100],minuteSspi:[0,50],nuit:[0,3000],ambulatoire:[0,3000],consommables:[0,20000],sspiDefautMin:[0,600]};
const arrondi=n=>Math.round(n*100)/100;
function validerReglages(d={}){
 const out={},errors=[];
 for(const [k,[min,max]] of Object.entries(BORNES)){const n=Number(String(d[k]??REGLAGES_DEFAUT[k]).replace(',','.'));if(!Number.isFinite(n)||n<min||n>max)errors.push(k+' : entre '+min+' et '+max+'.');else out[k]=n}
 return {ok:!errors.length,errors,reglages:out};
}
const DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const minutes=(a,b)=>DATE.test(a||'')&&DATE.test(b||'')?Math.max(0,Math.round((Date.parse(b.slice(0,16)+'Z')-Date.parse(a.slice(0,16)+'Z'))/60000)):null;
const actif=r=>r&&!['Annulée','Annulee'].includes(r.state);
const genre=r=>r.kind||(r.vacationId||String(r.sector||'').startsWith('bloc')||/salle|bloc/i.test(String(r.resource||''))?'room':String(r.sector||'').startsWith('sspi')||/sspi/i.test(String(r.resource||''))?'recovery':'bed');
// Durée réelle en salle (déroulement : entrée → sortie de salle), sinon heures réelles, sinon programmées (estimation).
function dureeSalle(r){
 const e=r.etapes||{};let m=minutes(e.entree,e.sortie);if(m!=null)return {min:m,source:'reel'};
 m=minutes(r.actualStart,r.actualEnd);if(m!=null)return {min:m,source:'reel'};
 m=minutes(r.start,r.end);return {min:m||0,source:'programme'};
}
function nuits(r){const a=String(r.start||'').slice(0,10),b=String(r.end||'').slice(0,10);if(!a||!b)return 0;return Math.max(0,Math.round((Date.parse(b)-Date.parse(a))/864e5))}
// Coût d'un séjour : {core, reservations du patient, dossier de facturation (data), contexte de pré-facture}.
function cout({core={},reservations=[]}={},reglages=REGLAGES_DEFAUT){
 const R={...REGLAGES_DEFAUT,...reglages},estimes=[];
 const res=reservations.filter(actif),salles=res.filter(r=>genre(r)==='room'),sspi=res.filter(r=>genre(r)==='recovery'),lits=res.filter(r=>genre(r)==='bed');
 let minBloc=0;for(const r of salles){const d=dureeSalle(r);minBloc+=d.min;if(d.source==='programme')estimes.push('durée de bloc programmée (pas encore réalisée)')}
 // SSPI : réservation propre, ou passage rattaché à l'intervention (sortie de salle → sortie de bloc, sinon horaires prévus).
 let minSspi=sspi.reduce((s,r)=>s+(dureeSalle(r).min||0),0);
 for(const r of salles){const e=r.etapes||{},m=minutes(e.sortie,e.sortieBloc);if(m!=null){minSspi+=m;continue}const p=r.recovery&&minutes(r.recovery.start,r.recovery.end);if(p!=null){minSspi+=p;estimes.push('SSPI : durée prévue')}}
 if(!minSspi&&salles.length){minSspi=R.sspiDefautMin*salles.length;estimes.push('SSPI : durée par défaut')}
 const ambu=core.mode==='Ambulatoire',n=lits.reduce((s,r)=>s+nuits(r),0)+salles.reduce((s,r)=>s+(r.bed?nuits(r.bed):0),0),avecLit=lits.length||salles.some(r=>r.bed);
 if(!ambu&&!avecLit)estimes.push('nuits non renseignées (planning des lits)');
 const postes={bloc:arrondi(minBloc*R.minuteBloc),sspi:arrondi(minSspi*R.minuteSspi),hebergement:arrondi(ambu?R.ambulatoire:n*R.nuit),consommables:arrondi(salles.length*R.consommables)};
 const date=(salles[0]||sspi[0]||lits[0])?.start?.slice(0,10)||'';
 return {postes,total:arrondi(Object.values(postes).reduce((s,x)=>s+x,0)),minutesBloc:minBloc,minutesSspi:minSspi,nuits:ambu?0:n,interventions:salles.length,date,estimes:[...new Set(estimes)]};
}
// Recette de l'établissement à partir du dossier de facturation (estimation de contrôle de la pré-facture).
function recette(dossier,contexte={}){
 if(!dossier?.facture?.ghs)return {montant:null,source:'GHS à saisir (facturation)'};
 const pf=A.preFacture(dossier,contexte);
 return {montant:arrondi((pf.baseSejour||0)+(pf.forfaitJournalier||0)+(pf.chambre||0)),source:'GHS '+dossier.facture.ghs,detail:{sejour:pf.baseSejour||0,forfaitJournalier:pf.forfaitJournalier||0,chambre:pf.chambre||0}};
}
function ligne(entree,reglages){const c=cout(entree,reglages),r=recette(entree.dossier,{mode:entree.core?.mode,dmi:entree.dmi||[]});return {...c,recette:r.montant,recetteSource:r.source,resultat:r.montant==null?null:arrondi(r.montant-c.total)}}
function synthese(lignes){
 const avec=lignes.filter(l=>l.recette!=null),somme=(a,k)=>arrondi(a.reduce((s,l)=>s+(l[k]||0),0));
 const postes={};for(const l of lignes)for(const [k,v] of Object.entries(l.postes))postes[k]=arrondi((postes[k]||0)+v);
 return {sejours:lignes.length,cout:somme(lignes,'total'),postes,recette:somme(avec,'recette'),resultat:somme(avec,'resultat'),sansRecette:lignes.length-avec.length,deficitaires:avec.filter(l=>l.resultat<0).length,
  coutMoyen:lignes.length?arrondi(somme(lignes,'total')/lignes.length):0};
}
// Regroupement (spécialité, mode) pour la direction.
function parGroupe(lignes,cle){const g={};for(const l of lignes){const k=l[cle]||'Non renseigné';(g[k]??=[]).push(l)}return Object.entries(g).map(([k,ls])=>({groupe:k,...synthese(ls)})).sort((a,b)=>b.cout-a.cout)}
return {REGLAGES_DEFAUT,validerReglages,dureeSalle,cout,recette,ligne,synthese,parGroupe};
});

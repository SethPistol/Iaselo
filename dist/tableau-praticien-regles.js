/* IASELO · tableau de bord personnel du praticien (5e veille, lot 6, manque 7).
   Règles pures : indicateurs d'un séjour, agrégation, comparaison à la moyenne anonyme de l'établissement.
   Indicateurs (définitions IASELO, À FAIRE VALIDER par les médecins avant tout usage qualité officiel) :
   - antibioprophylaxie dans les délais : antibiotique tracé sur la feuille d'anesthésie 0 à 60 min avant l'incision ;
   - nausées ou vomissements postopératoires (NVPO) : au moins une cotation NVPO ≥ 1 dans la surveillance ;
   - douleur postopératoire : au moins une douleur au repos ≥ 4/10 dans la surveillance ;
   - retard d'entrée en salle : entrée plus de 15 min après l'heure prévue au programme.
   La moyenne de l'établissement n'est affichée qu'à partir de 5 séjours (petits effectifs masqués). */
(function(root,factory){const api=factory(root.IaseloAmeliorations);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloTableauPraticien=api;})(typeof self!=='undefined'?self:this,function(AMinit){
'use strict';
let AM=AMinit;if(!AM&&typeof require==='function'){try{AM=require('./ameliorations-regles.js')}catch{}}
const ms=s=>{const t=Date.parse(s);return Number.isFinite(t)?t:null};
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\bdr\.?\s+/g,'').replace(/\(.*?\)/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const SEUIL={antibioMin:60,douleur:4,retardMin:15,petitEffectif:5};
const estAntibio=drug=>AM?.antibiotique?!!AM.antibiotique(drug):/cefazol|cefuroxim|clindamy|vancomy|amoxi|augmentin|gentami|metronid|cefoxit/.test(norm(drug));
// Même praticien : nom affiché « Dr Démo (recette) » ↔ « Dr Démo » ; on compare les mots significatifs.
function memeNom(a,b){const x=norm(a),y=norm(b);if(!x||!y)return false;if(x===y)return true;const mx=x.split(' ').filter(w=>w.length>2),my=y.split(' ').filter(w=>w.length>2);return !!mx.length&&!!my.length&&(mx.every(w=>my.includes(w))||my.every(w=>mx.includes(w)))}

// Indicateurs d'un séjour. stay : {id, core, consult, perop, postopVitals, cro}, reservations : réservations du séjour.
function sejour(stay,reservations=[]){
 const recs=(stay?.perop?.records||[]).filter(r=>r&&!r.voided);
 const ev=nom=>recs.filter(r=>r.kind==='Événement'&&r.values?.event===nom).map(r=>r.at).filter(ms).sort()[0]||null;
 const incision=ev('Incision'),fin=ev('Fin de chirurgie');
 const res=(reservations||[]).filter(r=>r&&r.state!=='Annulée'&&!r.proposition).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
 const date=String(incision||fin||res[0]?.start||stay?.consult?.date||stay?.core?.createdAt||stay?.maj||'').slice(0,10);
 const out={stay:stay?.id||'',date,opere:!!(incision||fin),consultation:!!stay?.consult?.validated,antibio:null,ecartAntibioMin:null,nvpo:null,douleur:null,retardMin:null,croManquant:false};
 if(incision){
  const atb=recs.filter(r=>r.kind==='Médicament'&&estAntibio(r.values?.drug)).map(r=>r.at).filter(ms).sort();
  const avant=atb.filter(a=>ms(a)<=ms(incision)).at(-1);
  if(!atb.length)out.antibio='non-tracee';
  else if(!avant)out.antibio='hors-delai';
  else{out.ecartAntibioMin=Math.round((ms(incision)-ms(avant))/60000);out.antibio=out.ecartAntibioMin<=SEUIL.antibioMin?'conforme':'hors-delai'}
 }
 const vit=(Array.isArray(stay?.postopVitals)?stay.postopVitals:[]).filter(r=>r&&!r.voided&&r.values);
 if(vit.length){
  out.nvpo=vit.some(r=>['1','2',1,2].includes(r.values.nvpo));
  const p=vit.map(r=>Number(r.values.pain)).filter(Number.isFinite);out.douleur=p.length?Math.max(...p)>=SEUIL.douleur:null;
 }
 const r0=res.find(r=>r.etapes?.entree);
 if(r0&&ms(r0.start)!=null&&ms(r0.etapes.entree)!=null)out.retardMin=Math.max(0,Math.round((ms(r0.etapes.entree)-ms(r0.start))/60000));
 out.croManquant=out.opere&&!(stay?.cro&&(stay.cro.text||stay.cro.file||stay.cro.signed));
 return out;
}
const taux=(n,d)=>d?Math.round(n/d*100):null;
// Agrégation d'une liste d'indicateurs de séjours.
function agreger(liste){
 const L=liste||[],atb=L.filter(x=>x.antibio==='conforme'||x.antibio==='hors-delai'),nv=L.filter(x=>x.nvpo!==null),dl=L.filter(x=>x.douleur!==null&&x.douleur!==undefined),rt=L.filter(x=>x.retardMin!==null);
 return {sejours:L.length,interventions:L.filter(x=>x.opere).length,consultations:L.filter(x=>x.consultation).length,
  antibio:{conformes:atb.filter(x=>x.antibio==='conforme').length,total:atb.length,nonTracees:L.filter(x=>x.antibio==='non-tracee').length,taux:taux(atb.filter(x=>x.antibio==='conforme').length,atb.length)},
  nvpo:{n:nv.filter(x=>x.nvpo).length,total:nv.length,taux:taux(nv.filter(x=>x.nvpo).length,nv.length)},
  douleur:{n:dl.filter(x=>x.douleur).length,total:dl.length,taux:taux(dl.filter(x=>x.douleur).length,dl.length)},
  retards:{n:rt.filter(x=>x.retardMin>SEUIL.retardMin).length,total:rt.length,taux:taux(rt.filter(x=>x.retardMin>SEUIL.retardMin).length,rt.length),moyenneMin:rt.length?Math.round(rt.reduce((s,x)=>s+x.retardMin,0)/rt.length):null}};
}
// Moyenne de l'établissement : null sous le seuil des petits effectifs.
function anonyme(agr){return agr&&agr.sejours>=SEUIL.petitEffectif?agr:null}
// Lecture d'un indicateur face à l'établissement (sens : 'haut' = plus c'est haut mieux c'est).
function comparer(moi,etab,sens){
 if(moi===null||moi===undefined||etab===null||etab===undefined)return {code:'na',texte:''};
 const d=moi-etab;if(Math.abs(d)<5)return {code:'egal',texte:'dans la moyenne'};
 const mieux=sens==='haut'?d>0:d<0;return {code:mieux?'mieux':'moins',texte:(d>0?'+':'')+d+' points'};
}
const INDICATEURS=[
 {id:'antibio',titre:'Antibioprophylaxie dans les délais',aide:'Antibiotique tracé 0 à 60 min avant l’incision, parmi les interventions où il est tracé.',sens:'haut'},
 {id:'nvpo',titre:'Nausées ou vomissements postopératoires',aide:'Au moins une cotation NVPO ≥ 1 dans la surveillance.',sens:'bas'},
 {id:'douleur',titre:'Douleur postopératoire ≥ 4/10',aide:'Au moins une douleur au repos ≥ 4 dans la surveillance.',sens:'bas'},
 {id:'retards',titre:'Entrées en salle en retard',aide:'Entrée plus de 15 min après l’heure prévue au programme.',sens:'bas'}
];
function periode(jours,aujourdhui){const j=[30,90,365].includes(Number(jours))?Number(jours):30;const fin=aujourdhui;const d=new Date(fin+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-j+1);return {jours:j,debut:d.toISOString().slice(0,10),fin}}
const dansPeriode=(x,p)=>!!x.date&&x.date>=p.debut&&x.date<=p.fin;
function avecAntibiotiques(am){if(am?.antibiotique)AM=am}
return {avecAntibiotiques,SEUIL,INDICATEURS,norm,memeNom,sejour,agreger,anonyme,comparer,periode,dansPeriode};
});

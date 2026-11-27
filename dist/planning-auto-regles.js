/* IASELO · planning infirmier proposé automatiquement (27/11/2026, 4e veille, lot E). Règles pures.
   Le cadre garde la main : la proposition ne remplit QUE les cases vides (absences, congés, formations et postes déjà
   saisis sont conservés), respecte le repos de 11 h, 48 h par semaine, 5 jours d'affilée au plus (6 au maximum légal),
   3 nuits d'affilée au plus, et répartit équitablement heures, nuits et week-ends. Elle n'est enregistrée et validée
   que par le cadre. Besoin du bloc : programme opératoire (effectifs-regles.js) ; étage : postes par jour (réglables). */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./plannings-infirmiers-regles.js'):root.IaseloPlanningsInfirmiers);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloPlanningAuto=api;})(typeof self!=='undefined'?self:globalThis,function(R){
'use strict';
const ETAGE_DEFAUT={M:2,S:2,N:1};
const HEURES_CIBLE=151,MARGE=8,SUITE_MAX=5,NUITS_MAX=3;
const H=3600000;
const bornes=(jour,a)=>{const h=R.horaires(a);if(!h||!R.CODES[a.code].travail)return null;const debut=Date.parse(jour+'T'+h.debut+':00Z');return {debut,fin:debut+h.duree*60000,duree:h.duree/60}};
const lundiDe=d=>{const x=new Date(d+'T12:00:00Z');return new Date(x-((x.getUTCDay()+6)%7)*864e5).toISOString().slice(0,10)};
const decale=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
// Postes demandés pour un jour : bloc → J (et un S si le programme finit tard) ; étage → M, S, N.
function demande(service,jour,{besoins={},etage=ETAGE_DEFAUT}={}){
 if(service==='bloc'){const b=besoins[jour];if(!b||!b.besoin)return [];const n=b.besoin;return b.soir?['S',...Array(Math.max(0,n-1)).fill('J')]:Array(n).fill('J')}
 return [...Array(Math.max(0,etage.N|0)).fill('N'),...Array(Math.max(0,etage.M|0)).fill('M'),...Array(Math.max(0,etage.S|0)).fill('S')];
}
function proposer(planning,mois,{service='etage',besoins={},etage=ETAGE_DEFAUT,heuresCible=HEURES_CIBLE,reposLibres=true}={}){
 const n=R.normaliser(planning,mois),jours=R.joursDuMois(mois),aff=JSON.parse(JSON.stringify(n.affectations)),pers=n.personnes,ajouts=[],manques=[];
 for(const p of pers)aff[p.id]??={};
 const travaille=(id,d)=>{const a=aff[id]?.[d];return !!(a&&R.CODES[a.code].travail)};
 const heures=id=>Object.entries(aff[id]).reduce((s,[d,a])=>s+(bornes(d,a)?.duree||0),0);
 const semaine=(id,d)=>{const l=lundiDe(d);return Object.entries(aff[id]).filter(([j])=>lundiDe(j)===l).reduce((s,[j,a])=>s+(bornes(j,a)?.duree||0),0)};
 const compte=(id,f)=>Object.entries(aff[id]).filter(([d,a])=>f(d,a)).length;
 function possible(id,d,code){
  if(aff[id][d])return false;
  const b=bornes(d,{code});if(!b)return false;
  // Repos de 11 h avec la veille et le lendemain (postes déjà placés ou saisis).
  for(const [j,sens] of [[decale(d,-1),-1],[decale(d,1),1]]){const a=aff[id][j],x=a&&bornes(j,a);if(!x)continue;if(sens<0&&(b.debut-x.fin)/H<R.REPOS_MIN)return false;if(sens>0&&(x.debut-b.fin)/H<R.REPOS_MIN)return false}
  // Jours travaillés d'affilée (avant et après), nuits d'affilée.
  let avant=0;for(let j=decale(d,-1);travaille(id,j);j=decale(j,-1))avant++;let apres=0;for(let j=decale(d,1);travaille(id,j);j=decale(j,1))apres++;
  if(avant+1+apres>SUITE_MAX)return false;
  if(code==='N'){let nuits=0;for(let j=decale(d,-1);aff[id][j]?.code==='N';j=decale(j,-1))nuits++;if(nuits>=NUITS_MAX)return false}
  // Après une série de nuits : pas de poste de jour le lendemain matin (déjà couvert par le repos de 11 h).
  if(semaine(id,d)+b.duree>R.HEURES_SEMAINE_MAX)return false;
  if(heures(id)+b.duree>heuresCible+MARGE)return false;
  return true;
 }
 // Score : moins d'heures d'abord ; puis moins de nuits (pour N) ; puis moins de week-ends ; continuité des nuits.
 const score=(id,d,code)=>{const we=R.weekEnd(d)?compte(id,j=>R.weekEnd(j)&&travaille(id,j))*6:0,nuits=code==='N'?compte(id,(j,a)=>a.code==='N')*4:0,suite=code==='N'&&aff[id][decale(d,-1)]?.code==='N'?-10:0;return heures(id)+we+nuits+suite};
 for(const d of jours){
  const deja={};for(const p of pers){const a=aff[p.id][d];if(a&&R.CODES[a.code].travail)deja[a.code]=(deja[a.code]||0)+1}
  for(const code of demande(service,d,{besoins,etage})){
   if(deja[code]>0){deja[code]--;continue}
   // Au bloc, une journée (J) déjà saisie couvre aussi un besoin de soir non pourvu par S.
   const cands=pers.filter(p=>possible(p.id,d,code)).sort((a,b)=>score(a.id,d,code)-score(b.id,d,code)||a.id.localeCompare(b.id));
   if(!cands.length){manques.push({jour:d,code});continue}
   aff[cands[0].id][d]={code};ajouts.push({personne:cands[0].id,jour:d,code});
  }
 }
 if(reposLibres)for(const p of pers)for(const d of jours)if(!aff[p.id][d]){aff[p.id][d]={code:'R'};}
 for(const p of pers)if(!Object.keys(aff[p.id]).length)delete aff[p.id];
 const resultat={personnes:pers,affectations:aff};
 const h=R.heuresParPersonne(resultat,mois),valeurs=Object.values(h);
 return {planning:resultat,ajouts,manques,heures:h,ecartHeures:valeurs.length?Math.round(Math.max(...valeurs)-Math.min(...valeurs)):0,alertes:R.alertes(resultat,mois)};
}
return {ETAGE_DEFAUT,HEURES_CIBLE,demande,proposer};
});

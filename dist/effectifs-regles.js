/* IASELO · effectifs infirmiers liés au programme du bloc (27/11/2026, manque n°15 de la 3e veille).
   À partir des vacations ouvertes et des interventions programmées, calcule pour chaque jour le besoin en
   infirmier(ère)s de bloc (salles ouvertes × effectif par salle) et de SSPI (pic de patients présents), puis le compare
   au planning du service bloc. Le cadre voit les jours en déficit avant de valider son planning.
   Repère réglementaire SSPI : art. D.6124-101 du code de la santé publique (au moins un(e) infirmier(ère) formé(e) ;
   au moins deux agents dont un(e) infirmier(ère) au-delà de 6 postes occupés). Les autres valeurs sont des réglages de
   l'établissement, à confirmer par le cadre. Fonctions pures, testées dans tests/effectifs.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloEffectifs=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const REGLAGES={parSalle:2,sspiDureeMin:60,sspiSeuilDeuxAgents:6,finSoir:'18:00'};
const DATE=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;
const min=h=>Number(h.slice(0,2))*60+Number(h.slice(3,5));
const hm=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const actif=r=>r&&!['Annulée','Fermée','Annulee'].includes(r.state)&&!r.liberee;
// Besoin par jour : salles ouvertes (vacations ou interventions), amplitude, pic SSPI.
function besoins(vacations=[],reservations=[],jours=[],reglages={}){
 const R={...REGLAGES,...reglages},out={};
 for(const j of jours)out[j]={salles:new Set(),debut:null,fin:null,interventions:0,sorties:[]};
 const etendre=(o,a,b)=>{if(o.debut==null||a<o.debut)o.debut=a;if(o.fin==null||b>o.fin)o.fin=b};
 for(const v of vacations){if(!actif(v))continue;const a=DATE.exec(String(v.start||'')),b=DATE.exec(String(v.end||''));if(!a||!out[a[1]]||!v.resource)continue;const o=out[a[1]];o.salles.add(v.resource);etendre(o,min(a[2]),b&&b[1]===a[1]?min(b[2]):min(a[2]))}
 for(const r of reservations){if(!actif(r))continue;const a=DATE.exec(String(r.start||'')),b=DATE.exec(String(r.end||''));if(!a||!out[a[1]])continue;const o=out[a[1]];if(r.resource&&/salle/i.test(r.resource))o.salles.add(r.resource);o.interventions++;const fin=b&&b[1]===a[1]?min(b[2]):min(a[2])+60;etendre(o,min(a[2]),fin);o.sorties.push(fin)}
 const res={};
 for(const [j,o] of Object.entries(out)){
  // Pic SSPI : patients présents en même temps, chacun y restant sspiDureeMin après sa fin d'intervention.
  const ev=o.sorties.flatMap(f=>[[f,1],[f+R.sspiDureeMin,-1]]).sort((x,y)=>x[0]-y[0]||x[1]-y[1]);let n=0,pic=0;for(const [,d] of ev){n+=d;pic=Math.max(pic,n)}
  const salles=o.salles.size,bloc=salles*R.parSalle,sspi=pic===0?0:pic>=R.sspiSeuilDeuxAgents?2:1;
  res[j]={salles,interventions:o.interventions,debut:o.debut==null?'':hm(o.debut),fin:o.fin==null?'':hm(o.fin),picSspi:pic,besoinBloc:bloc,besoinSspi:sspi,besoin:bloc+sspi,soir:o.fin!=null&&o.fin>min(R.finSoir)};
 }
 return res;
}
// Comparaison au planning : effectifs = R.effectifs() des plannings infirmiers ({total, M:…, S:…}).
function comparer(bes={},effectifs={}){
 const out={};
 for(const [j,b] of Object.entries(bes)){
  const e=effectifs[j]||{total:0},prevu=e.total||0,soirPrevu=(e.S||0)+(e.N||0)+(e.G||0),ecart=prevu-b.besoin;
  const alertes=[];
  if(b.besoin&&ecart<0)alertes.push(`Il manque ${-ecart} infirmier(ère)${-ecart>1?'s':''} (${b.salles} salle${b.salles>1?'s':''} ouverte${b.salles>1?'s':''}${b.besoinSspi?', SSPI':''}).`);
  if(b.soir&&!soirPrevu)alertes.push(`Programme jusqu’à ${b.fin} : aucun poste du soir ou de garde prévu.`);
  if(!b.besoin&&prevu)alertes.push('Aucune salle ouverte : personnel disponible pour une autre activité.');
  out[j]={...b,prevu,ecart,niveau:b.besoin&&ecart<0?'crit':alertes.length?'warn':'ok',alertes};
 }
 return out;
}
function synthese(cmp={}){const j=Object.entries(cmp);return {joursDeficit:j.filter(([,x])=>x.niveau==='crit').map(([d])=>d),joursVigilance:j.filter(([,x])=>x.niveau==='warn').map(([d])=>d),manqueTotal:j.reduce((s,[,x])=>s+(x.ecart<0?-x.ecart:0),0)}}
return {REGLAGES,besoins,comparer,synthese};
});

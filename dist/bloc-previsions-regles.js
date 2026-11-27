/* IASELO · bloc prédictif et analyse du bloc (27/11/2026, demande de Romain : « ce qui manque des concurrents »).
   Inspiré d'Epic OR Capacity, Opmed.ai et Calmedica MemoSwap, calculé uniquement à partir de l'historique de la clinique :
   - durée estimée d'une intervention (médiane des passages réels du même chirurgien pour le même acte, sinon de l'acte,
     sinon du chirurgien, sinon durée prévue), avec indice de confiance et fourchette (25e-75e centile) ;
   - débordement prévisible de chaque vacation du jour ;
   - vacations peu remplies à J+7..J+21 (à libérer), créneaux libres, bourse aux créneaux ;
   - liste d'attente de patients et correspondance avec les créneaux libres ;
   - prévision d'occupation de la SSPI et des lits heure par heure ;
   - analyse : taux d'utilisation des vacations, retards de première entrée, rotations, dépassements, par chirurgien et par salle.
   Règles pures, sans réseau ni horloge cachée, testées dans tests/bloc-previsions.test.cjs.
   Aucune décision automatique : tout est proposé, un humain décide (pas de déprogrammation sans action). */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloBlocPrevisions=api})(typeof self!=='undefined'?self:this,function(root){
'use strict';
const PC=()=>(typeof require==='function'&&!root?.PlanningCore?require('./planning-core.js'):root.PlanningCore);
const normName=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(dr|docteur|pr|professeur)\b\.?/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const sameSurgeon=(a,b)=>{const x=normName(a),y=normName(b);if(!x||!y)return false;if(x===y)return true;const xs=x.split(' '),ys=y.split(' ');return xs.length===1&&ys.includes(xs[0])||ys.length===1&&xs.includes(ys[0])};
const minutes=(a,b)=>Math.round((Date.parse(b+'Z')-Date.parse(a+'Z'))/60000);
const addMinutes=(s,n)=>{const d=new Date(s+'Z');d.setUTCMinutes(d.getUTCMinutes()+Number(n));return d.toISOString().slice(0,16)};
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const valid=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s)&&Number.isFinite(Date.parse(s.slice(0,16)+'Z'));
const t16=s=>String(s||'').slice(0,16);
// Clé d'acte : code CCAM si connu, sinon libellé sans latéralité ni mention d'urgence.
const cleActe=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\((urgence|enfant[^)]*)\)/g,' ').replace(/\b(droite?|gauche|bilaterale?|oeil|en urgence)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const actif=r=>r&&!['Annulée'].includes(r.state);

// Valeurs par défaut, à faire relire par la clinique.
const REGLAGES={rotation:15,minHistorique:3,historiqueMax:20,ecartAlerte:15,retardPremiere:15,sspiDefaut:60,
 liberation:{deJour:7,aJour:21,seuil:0.5},creneauMin:30,prevenanceHeures:48};

/* Durée réelle en salle (entrée → sortie de salle), en minutes ; null si incomplète ou aberrante. */
function dureeReelle(r){
 const e=r?.etapes||{},a=t16(e.entree||r?.actualStart),b=t16(e.sortie||r?.actualEnd);
 if(!valid(a)||!valid(b))return null;const m=minutes(a,b);return m>=5&&m<=16*60?m:null;
}
/* Durée réelle en SSPI (sortie de salle → sortie du bloc). */
function dureeSspi(r){const e=r?.etapes||{};if(!r?.recovery?.resource||!valid(t16(e.sortie))||!valid(t16(e.sortieBloc)))return null;const m=minutes(t16(e.sortie),t16(e.sortieBloc));return m>=5&&m<=12*60?m:null}
const dureePrevue=r=>{const d=Number(r?.duration);if(Number.isFinite(d)&&d>0)return d;return valid(t16(r?.start))&&valid(t16(r?.end))?Math.max(0,minutes(t16(r.start),t16(r.end))-(Number(r.turnover)||0)):null};
const acteDe=r=>cleActe(r?.ccam||r?.procedure||r?.motif||'');

function quantile(sorted,q){if(!sorted.length)return null;const i=(sorted.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return Math.round(sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo))}
/* Historique : passages terminés (durée réelle connue), du plus récent au plus ancien. */
function historique(reservations,avant=''){
 return (reservations||[]).filter(r=>actif(r)&&dureeReelle(r)!==null&&(!avant||t16(r.start)<avant))
  .map(r=>({id:r.id,surgeon:r.surgeon||'',acte:acteDe(r),duree:dureeReelle(r),prevue:dureePrevue(r),sspi:dureeSspi(r),start:t16(r.start)}))
  .sort((a,b)=>b.start.localeCompare(a.start));
}
/* Estimation pour une intervention à venir. */
function estimer(hist,{surgeon='',acte='',prevue=null}={},opts={}){
 const o={...REGLAGES,...opts},a=cleActe(acte);
 const niveaux=[['chirurgien-acte','même chirurgien, même acte',h=>a&&h.acte===a&&sameSurgeon(h.surgeon,surgeon)],['acte','même acte, tous chirurgiens',h=>a&&h.acte===a],['chirurgien','même chirurgien, tous actes',h=>sameSurgeon(h.surgeon,surgeon)]];
 for(const [base,libelle,f] of niveaux){
  const rows=(hist||[]).filter(f).slice(0,o.historiqueMax);
  if(rows.length<o.minHistorique)continue;
  // Pour le niveau « chirurgien, tous actes », on corrige la durée prévue par son ratio habituel réel / prévu.
  let valeurs=rows.map(h=>h.duree);
  if(base==='chirurgien'){if(!(prevue>0))continue;const ratios=rows.filter(h=>h.prevue>0).map(h=>h.duree/h.prevue);if(ratios.length<o.minHistorique)continue;valeurs=ratios.map(x=>x*prevue)}
  const s=[...valeurs].sort((x,y)=>x-y),med=quantile(s,.5),p25=quantile(s,.25),p75=quantile(s,.75);
  const dispersion=med?(p75-p25)/med:1;
  const confiance=base==='chirurgien-acte'&&rows.length>=8&&dispersion<=.25?'elevee':base!=='chirurgien'&&rows.length>=o.minHistorique&&dispersion<=.4?'moyenne':'faible';
  return {minutes:med,p25,p75,n:rows.length,base,libelle,confiance,prevue,ecart:prevue>0?med-prevue:null};
 }
 return {minutes:prevue>0?prevue:null,p25:null,p75:null,n:0,base:'prevue',libelle:'pas assez d’historique : durée prévue',confiance:'aucune',prevue,ecart:0};
}
const CONFIANCE={elevee:'Élevée',moyenne:'Moyenne',faible:'Faible',aucune:'—'};

/* Programme du jour : estimation de chaque intervention et débordement prévisible de chaque vacation. */
function previsionJour({reservations=[],vacations=[],day,maintenant=''},opts={}){
 const o={...REGLAGES,...opts},hist=historique(reservations,day+'T00:00');
 const cas=reservations.filter(r=>actif(r)&&t16(r.start).slice(0,10)===day&&r.resource).sort((a,b)=>t16(a.start).localeCompare(t16(b.start)));
 const lignes=cas.map(r=>{const prevue=dureePrevue(r),est=estimer(hist,{surgeon:r.surgeon,acte:acteDe(r),prevue},o),reel=dureeReelle(r);
  return {id:r.id,patient:r.patient,resource:r.resource,vacationId:r.vacationId||'',surgeon:r.surgeon||'',procedure:r.procedure||r.ccam||'',start:t16(r.start),prevue,estimation:est,reelle:reel,alerte:est.ecart!==null&&Math.abs(est.ecart)>=o.ecartAlerte&&est.confiance!=='aucune'}});
 // Enchaînement par salle : chaque cas commence au plus tôt à son heure prévue, après le précédent (+ rotation).
 const parSalle={};for(const l of lignes)(parSalle[l.resource]||=[]).push(l);
 for(const rows of Object.values(parSalle)){let fin='';for(const l of rows){const r=cas.find(c=>c.id===l.id),e=r.etapes||{};
  const debut=valid(t16(e.entree))?t16(e.entree):(fin&&fin>l.start?fin:l.start);
  const duree=l.reelle??l.estimation.minutes??l.prevue??0;l.debutEstime=debut;l.finEstimee=valid(t16(e.sortie))?t16(e.sortie):addMinutes(debut,duree);fin=addMinutes(l.finEstimee,Number(r.turnover)||o.rotation)}}
 const vac=vacations.filter(v=>v.state!=='Annulée'&&t16(v.start).slice(0,10)===day).map(v=>{
  const rows=lignes.filter(l=>l.vacationId===v.id||(!l.vacationId&&l.resource===v.resource&&l.start>=t16(v.start)&&l.start<t16(v.end)));
  const derniere=rows.map(l=>l.finEstimee).sort().at(-1)||'';
  const prevueFin=rows.map(l=>addMinutes(l.start,l.prevue||0)).sort().at(-1)||'';
  return {id:v.id,surgeon:v.surgeon||'',resource:v.resource,start:t16(v.start),end:t16(v.end),cas:rows.length,finPrevue:prevueFin,finEstimee:derniere,debordement:derniere?Math.max(0,minutes(t16(v.end),derniere)):0};
 });
 return {lignes,vacations:vac,historique:hist.length};
}

/* Remplissage d'une vacation : minutes réservées (intervention + rotation) / minutes de vacation. */
function remplissage(v,reservations,opts={}){
 const o={...REGLAGES,...opts},total=Math.max(0,minutes(t16(v.start),t16(v.end)));
 const rows=(reservations||[]).filter(r=>actif(r)&&(r.vacationId===v.id||(!r.vacationId&&r.resource===v.resource&&t16(r.start)>=t16(v.start)&&t16(r.start)<t16(v.end))));
 const occupe=rows.reduce((n,r)=>n+(dureePrevue(r)||0)+(Number(r.turnover)||o.rotation),0);
 return {total,occupe,cas:rows.length,taux:total?Math.min(1.5,occupe/total):0,libre:Math.max(0,total-occupe)};
}
/* Vacations de J+7 à J+21 dont le remplissage est sous le seuil : à proposer à la libération. */
function aLiberer({vacations=[],reservations=[],today},opts={}){
 const o={...REGLAGES,...opts},l={...REGLAGES.liberation,...(opts.liberation||{})},de=addDays(today,l.deJour),a=addDays(today,l.aJour);
 return vacations.filter(v=>v.state!=='Annulée'&&v.surgeon&&!v.liberee&&t16(v.start).slice(0,10)>=de&&t16(v.start).slice(0,10)<=a)
  .map(v=>({vacation:v,...remplissage(v,reservations,o),jours:Math.round((Date.parse(t16(v.start).slice(0,10)+'T12:00Z')-Date.parse(today+'T12:00Z'))/864e5)}))
  .filter(x=>x.taux<l.seuil).sort((x,y)=>x.taux-y.taux||t16(x.vacation.start).localeCompare(t16(y.vacation.start)));
}
/* Créneaux libres dans les vacations (≥ creneauMin), y compris les vacations libérées (entièrement libres pour la bourse). */
function creneauxLibres({vacations=[],reservations=[],from,to},opts={}){
 const o={...REGLAGES,...opts},out=[];
 for(const v of vacations){
  if(v.state==='Annulée')continue;const d=t16(v.start).slice(0,10);if(d<from||d>to)continue;
  const occ=(reservations||[]).filter(r=>actif(r)&&r.resource===v.resource&&t16(r.start)<t16(v.end)&&t16(r.end)>t16(v.start)).map(r=>[t16(r.start)<t16(v.start)?t16(v.start):t16(r.start),t16(r.end)]).sort((a,b)=>a[0].localeCompare(b[0]));
  let cur=t16(v.start);
  for(const [s,e] of occ){if(minutes(cur,s)>=o.creneauMin)out.push({vacationId:v.id,resource:v.resource,surgeon:v.surgeon||'',liberee:!!v.liberee,start:cur,end:s,minutes:minutes(cur,s)});if(e>cur)cur=e}
  if(minutes(cur,t16(v.end))>=o.creneauMin)out.push({vacationId:v.id,resource:v.resource,surgeon:v.surgeon||'',liberee:!!v.liberee,start:cur,end:t16(v.end),minutes:minutes(cur,t16(v.end))});
 }
 return out.sort((a,b)=>a.start.localeCompare(b.start));
}
/* Liste d'attente ↔ créneaux : même chirurgien (ou vacation libérée), durée qui tient, dans la fenêtre du patient,
   plus tôt que sa date actuelle, et avec le délai de prévenance. */
function correspondances(attente,creneaux,{maintenant},opts={}){
 const o={...REGLAGES,...opts};
 return (attente||[]).filter(a=>a.status==='attente').map(a=>{
  const d=a.data||a,duree=(Number(d.dureeMin)||0)+o.rotation,prev=Number(d.prevenanceHeures??o.prevenanceHeures);
  const ok=creneaux.filter(c=>c.minutes>=duree&&(c.liberee||sameSurgeon(c.surgeon,d.surgeon))&&(!d.desDe||c.start.slice(0,10)>=d.desDe)&&(!d.jusquA||c.start.slice(0,10)<=d.jusquA)&&(!d.dateActuelle||c.start.slice(0,10)<d.dateActuelle)&&minutes(t16(maintenant),c.start)>=prev*60);
  return {attente:a,creneaux:ok.slice(0,5)};
 }).filter(x=>x.creneaux.length);
}
/* Occupation prévue de la SSPI et des lits, heure par heure, à partir des fins estimées. */
function previsionCapacite({reservations=[],vacations=[],resources=[],day},opts={}){
 const o={...REGLAGES,...opts},kind=r=>{try{return PC().kind(r)}catch{return r.type||''}};
 const sspiCap=resources.filter(r=>kind(r)==='recovery'&&r.open!==false).length,litsCap=resources.filter(r=>kind(r)==='bed'&&r.open!==false).length;
 const hist=historique(reservations,day+'T00:00'),sspiHist=hist.map(h=>h.sspi).filter(x=>x!==null).sort((a,b)=>a-b),sspiMed=quantile(sspiHist,.5)||o.sspiDefaut;
 const jour=previsionJour({reservations,vacations,day},o),heures=[];
 for(let h=7;h<=21;h++){const at=day+'T'+String(h).padStart(2,'0')+':30';
  const sspi=jour.lignes.filter(l=>{const r=reservations.find(x=>x.id===l.id);if(!r?.recovery?.resource)return false;const fin=addMinutes(l.finEstimee,sspiMed);return l.finEstimee<=at&&at<fin}).length;
  const lits=reservations.filter(r=>actif(r)&&r.bed?.resource&&t16(r.bed.start)<=at&&at<t16(r.bed.end)).length;
  heures.push({heure:h,sspi,lits,sspiCap,litsCap,sspiSature:sspiCap>0&&sspi>sspiCap,litsSature:litsCap>0&&lits>litsCap});
 }
 return {heures,sspiCap,litsCap,sspiMediane:sspiMed,pic:{sspi:Math.max(0,...heures.map(h=>h.sspi)),lits:Math.max(0,...heures.map(h=>h.lits))}};
}

/* Analyse du bloc sur une période [from, to] (jours inclus). */
function analyse({reservations=[],vacations=[],from,to},opts={}){
 const o={...REGLAGES,...opts},inPer=s=>{const d=t16(s).slice(0,10);return d>=from&&d<=to};
 const vacs=vacations.filter(v=>v.state!=='Annulée'&&inPer(v.start)),res=reservations.filter(r=>inPer(r.start));
 const parVac=vacs.map(v=>{
  const rows=res.filter(r=>r.state!=='Annulée'&&(r.vacationId===v.id||(!r.vacationId&&r.resource===v.resource&&t16(r.start)>=t16(v.start)&&t16(r.start)<t16(v.end)))).sort((a,b)=>t16(a.start).localeCompare(t16(b.start)));
  const faits=rows.filter(r=>dureeReelle(r)!==null),total=Math.max(1,minutes(t16(v.start),t16(v.end)));
  const enSalle=faits.reduce((n,r)=>n+dureeReelle(r),0);
  const premier=faits[0],retard=premier?Math.max(0,minutes(t16(v.start),t16(premier.etapes?.entree||premier.actualStart))):null;
  const rotations=[];for(let i=1;i<faits.length;i++){const a=t16(faits[i-1].etapes?.sortie||faits[i-1].actualEnd),b=t16(faits[i].etapes?.entree||faits[i].actualStart);const m=minutes(a,b);if(m>=0&&m<=240)rotations.push(m)}
  const derniere=faits.map(r=>t16(r.etapes?.sortie||r.actualEnd)).sort().at(-1),depasse=derniere?Math.max(0,minutes(t16(v.end),derniere)):0;
  return {v,surgeon:v.surgeon||v.titulaireInitial||'(vacation libre)',resource:v.resource,total,enSalle,cas:rows.length,faits:faits.length,retard,rotations,depasse,liberee:!!v.liberee,annulees:res.filter(r=>r.state==='Annulée'&&r.vacationId===v.id).length};
 });
 const agreger=rows=>{const total=rows.reduce((n,x)=>n+x.total,0),enSalle=rows.reduce((n,x)=>n+x.enSalle,0),ret=rows.filter(x=>x.retard!==null),rot=rows.flatMap(x=>x.rotations).sort((a,b)=>a-b);
  return {vacations:rows.length,cas:rows.reduce((n,x)=>n+x.cas,0),faits:rows.reduce((n,x)=>n+x.faits,0),utilisation:total?enSalle/total:0,
   retardsPremiere:ret.filter(x=>x.retard>o.retardPremiere).length,retardMoyen:ret.length?Math.round(ret.reduce((n,x)=>n+x.retard,0)/ret.length):null,
   rotationMediane:quantile(rot,.5),depassements:rows.filter(x=>x.depasse>0).length,minutesDepassees:rows.reduce((n,x)=>n+x.depasse,0),liberees:rows.filter(x=>x.liberee).length,annulations:rows.reduce((n,x)=>n+x.annulees,0)}};
 const grouper=k=>{const m=new Map();for(const x of parVac){const key=k(x);if(!m.has(key))m.set(key,[]);m.get(key).push(x)}return [...m.entries()].map(([cle,rows])=>({cle,...agreger(rows)})).sort((a,b)=>b.vacations-a.vacations||String(a.cle).localeCompare(String(b.cle),'fr'))};
 // Précision des durées : écart entre durée prévue et réelle (minutes), pour suivre la qualité de la programmation.
 const ecarts=res.filter(r=>dureeReelle(r)!==null&&dureePrevue(r)>0).map(r=>dureeReelle(r)-dureePrevue(r)).sort((a,b)=>a-b);
 return {global:agreger(parVac),parChirurgien:grouper(x=>x.surgeon),parSalle:grouper(x=>x.resource),ecartDuree:{n:ecarts.length,mediane:quantile(ecarts,.5),p25:quantile(ecarts,.25),p75:quantile(ecarts,.75)},vacations:parVac};
}

/* Validation d'une entrée de liste d'attente (serveur et écran). */
function attenteError(d){
 if(!d||typeof d!=='object')return 'Entrée illisible.';
 if(!/^[^/]{1,80}$/.test(String(d.stay||'')))return 'Choisissez le séjour du patient.';
 if(String(d.surgeon||'').trim().length<2)return 'Indiquez le chirurgien.';
 const m=Number(d.dureeMin);if(!Number.isInteger(m)||m<10||m>720)return 'Durée de l’intervention : 10 à 720 minutes.';
 for(const k of ['desDe','jusquA','dateActuelle'])if(d[k]&&!/^\d{4}-\d\d-\d\d$/.test(d[k]))return 'Date invalide.';
 if(d.desDe&&d.jusquA&&d.jusquA<d.desDe)return 'La fin de disponibilité doit suivre le début.';
 const p=Number(d.prevenanceHeures??48);if(!Number.isInteger(p)||p<2||p>240)return 'Délai de prévenance : 2 à 240 heures.';
 if(String(d.note||'').length>300)return 'Note : 300 caractères au plus.';
 return '';
}
const pct=x=>Math.round((x||0)*100)+' %';
return {REGLAGES,CONFIANCE,normName,sameSurgeon,minutes,addMinutes,addDays,dureeReelle,dureeSspi,dureePrevue,acteDe,historique,estimer,previsionJour,remplissage,aLiberer,creneauxLibres,correspondances,previsionCapacite,analyse,attenteError,pct};
});

/* IASELO · relève infirmière automatique (5e veille, lot 2).
   Rédige, à partir du seul dossier, une relève au format SBAR (Situation, Antécédents, Évaluation, Recommandations)
   sur la période du poste (12 h par défaut). Moteur local et déterministe : l'infirmière relit, corrige et signe ;
   rien n'est enregistré sans elle. Aucune interprétation médicale ajoutée : uniquement des faits datés.
   sbar(stay, {maintenant, heures, news2, nursing, plan}) → {periode, S, B, A, R, texte, alertes}. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?{Q:require('./dossier-question-regles.js'),ADM:(()=>{try{return require('./administration-regles.js')}catch{return null}})()}:null);if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloReleveAuto=api;})(typeof self!=='undefined'?self:this,function(deps){
'use strict';
const g=typeof self!=='undefined'?self:globalThis;
const Q=()=>deps?.Q||g.IaseloDossierQuestion,ADM=()=>deps?.ADM||g.IaseloAdministration;
const t=v=>v===undefined||v===null?'':String(v).trim();
const vide=v=>{const s=t(v);return !s||/^(non renseign[ée]e?|—|-)$/i.test(s)};
const pad=n=>String(n).padStart(2,'0');
const hm=ms=>{const d=new Date(ms);return d.getHours()+' h '+pad(d.getMinutes())};

function age(naissance,now){const b=Date.parse(t(naissance));if(!Number.isFinite(b))return '';const d=new Date(now),n=new Date(b);let a=d.getFullYear()-n.getFullYear();if(d.getMonth()<n.getMonth()||(d.getMonth()===n.getMonth()&&d.getDate()<n.getDate()))a--;return a>=0?a+' ans':''}
function jourPostop(stay,now){const at=(stay?.perop?.records||[]).map(r=>Date.parse(r.at)).filter(Number.isFinite).sort((a,b)=>a-b)[0];if(!at)return null;const j=Math.floor((new Date(now).setHours(0,0,0,0)-new Date(at).setHours(0,0,0,0))/864e5);return j>=0?j:null}
function tendance(serie){if(serie.length<2)return '';const a=serie[0],b=serie.at(-1);if(b>a)return 'en hausse';if(b<a)return 'en baisse';return 'stable'}

function sbar(stay,{maintenant=new Date(),heures=12,news2=null,nursing=null,plan=null}={}){
 const q=Q();const now=maintenant instanceof Date?maintenant.getTime():Date.parse(maintenant),depuis=now-heures*3600e3,ts=q.ts;
 const dans=at=>{const n=ts(at);return Number.isFinite(n)&&n>=depuis&&n<=now+60e3};
 const c=stay?.consult||{},cpa=c.cpa||{},id=stay?.identity||{};
 const alertes=[];
 // S · Situation
 const j=jourPostop(stay,now);
 const S=[[t(id.lastName).toUpperCase(),t(id.firstName)].filter(Boolean).join(' ')||t(stay?.id),age(id.birthDate,now),stay?.sortiePlus?.chambre?'chambre '+stay.sortiePlus.chambre:'',
  [vide(cpa.libelle)?t(stay?.specialty):t(cpa.libelle)+(vide(cpa.cote)?'':' ('+t(cpa.cote)+')'),j!=null?'J'+j:''].filter(Boolean).join(' · '),t(stay?.stage)].filter(Boolean).join(', ')+'.';
 // B · Antécédents (Background)
 const B=[];
 const al=t(c.allergies);if(vide(al)||/v[ée]rifier/i.test(al)){B.push('Allergies à vérifier.');alertes.push('Allergies non vérifiées')}else B.push('Allergies : '+al+'.');
 const atcd=[t(c.history),t(cpa.atcd_detail)].filter(x=>!vide(x)).join(' ; ');if(atcd)B.push('Antécédents : '+atcd+'.');
 if(!vide(c.asa)&&!/non/i.test(c.asa))B.push('ASA '+t(c.asa).replace(/^ASA\s*/i,'')+'.');
 const ttt=[t(c.treatments),t(cpa.ttt_habituel)].filter(x=>!vide(x)).join(' ; ');if(ttt)B.push('Traitement habituel : '+ttt+'.');
 // A · Évaluation (sur la période)
 const A=[];const vit=q.vitals(stay),recents=vit.filter(r=>dans(r.at)),der=vit.at(-1);
 if(der){const v=der.values,u=q.UNITE,parts=[];
  if(!vide(v.sbp))parts.push('PA '+v.sbp+(vide(v.dbp)?'':'/'+v.dbp));for(const k of ['hr','rr','spo2','temp','pain'])if(!vide(v[k]))parts.push(({hr:'FC',rr:'FR',spo2:'SpO₂',temp:'T°',pain:'EVA'})[k]+' '+v[k]+(u[k]||''));
  A.push('Dernières constantes ('+hm(ts(der.at))+') : '+parts.join(', ')+'.');
  if(news2){const n=news2(v);if(n&&Number.isFinite(n.total)){A.push('NEWS2 '+n.total+(n.complet===false?' (partiel)':'')+'.');if(n.total>=5)alertes.push('NEWS2 à '+n.total)}}
  for(const [k,l] of [['temp','Température'],['pain','Douleur']]){const sv=recents.filter(r=>!vide(r.values[k])).map(r=>Number(String(r.values[k]).replace(',','.')));if(sv.length>1)A.push(l+' '+tendance(sv)+' sur le poste ('+sv.join(' → ')+(k==='pain'?'/10':' °C')+').')}
  const max=k=>Math.max(...recents.map(r=>Number(String(r.values[k]??'').replace(',','.'))).filter(Number.isFinite));
  if(recents.length&&max('temp')>=38.5)alertes.push('Fièvre à '+max('temp')+' °C');if(recents.length&&max('pain')>=7)alertes.push('Douleur à '+max('pain')+'/10');
 }else{A.push('Aucune constante relevée.');alertes.push('Aucune constante')}
 if(!recents.length&&der)A.push('Pas de nouveau relevé depuis '+heures+' h.');
 const adm=q.administrations(stay).filter(x=>dans(x.at));
 if(adm.length){const parNom=new Map();for(const {rx,e} of adm){const k=t(rx.posologie?.medicament||rx.name);const l=parNom.get(k)||[];l.push((e.status==='Réalisée'?'':e.status.toLowerCase()+' ')+hm(ts(e.at)));parNom.set(k,l)}
  A.push('Administré sur le poste : '+[...parNom].map(([k,l])=>k+' ('+l.join(', ')+')').join(' ; ')+'.')}
 const refus=adm.filter(x=>['Non réalisée','Refusée'].includes(x.e.status));if(refus.length)alertes.push(refus.length+' dose(s) non données');
 const trs=q.transmissions(stay).filter(x=>dans(x.at));if(trs.length)A.push('Transmissions du poste : '+trs.map(x=>hm(ts(x.at))+' '+t(x.texte).replace(/[.\s]+$/,'')).join(' | ')+'.');
 const nr=nursing||{tasks:new Map(),alerts:new Map(),devices:new Map()};
 const ouvertes=[...(nr.alerts?.values?.()||[])].filter(a=>a.status==='Ouverte'||a.status==='Prise en charge');
 if(ouvertes.length){A.push('Alertes ouvertes : '+ouvertes.map(a=>t(a.title)).join(', ')+'.');alertes.push(ouvertes.length+' alerte(s) ouverte(s)')}
 const disp=[...(nr.devices?.values?.()||[])].filter(d=>d.status==='En place');if(disp.length)A.push('Dispositifs en place : '+disp.map(d=>t(d.deviceType)+(d.site?' ('+t(d.site)+')':'')).join(', ')+'.');
 // R · Recommandations : ce qui reste à faire pour l'équipe suivante.
 const R=[];
 const p=plan||(ADM()?ADM().plan(stay?.rx||[],new Date(now),{avantH:heures,apresH:6}):null);
 if(p){if(p.retard)R.push(p.retard+' dose(s) en retard à régulariser.');if(p.retard)alertes.push(p.retard+' dose(s) en retard');
  const prochaines=[];for(const l of p.lignes||[])for(const d of l.doses||l.creneaux||[]){const at=Date.parse(d.at||d.prevu||d.creneau);if(Number.isFinite(at)&&at>now&&at<=now+6*3600e3&&['a-venir','a-donner'].includes(d.etat))prochaines.push(hm(at)+' '+t(l.rx?.posologie?.medicament||l.medicament||l.rx?.name))}
  if(prochaines.length)R.push('Prochaines doses : '+prochaines.join(', ')+'.');
 }
 const taches=[...(nr.tasks?.values?.()||[])].filter(x=>!['Réalisée','Non réalisée'].includes(x.status)).sort((a,b)=>String(a.due).localeCompare(String(b.due)));
 if(taches.length)R.push('Tâches : '+taches.slice(0,6).map(x=>(x.due?String(x.due).slice(11,16).replace(':',' h ')+' ':'')+t(x.title)+(Date.parse(x.due)<now?' (en retard)':'')).join(', ')+'.');
 const sp=stay?.sortiePlus||{};if(!vide(sp.sortiePrevue))R.push('Sortie prévue le '+q.quand(sp.sortiePrevue)+'.');
 if(!R.length)R.push('Rien de programmé sur les 6 prochaines heures.');
 const de=new Date(depuis),a=new Date(now);
 const periode='du '+pad(de.getDate())+'/'+pad(de.getMonth()+1)+' '+hm(depuis)+' au '+pad(a.getDate())+'/'+pad(a.getMonth()+1)+' '+hm(now);
 const texte='S · '+S+'\nB · '+B.join(' ')+'\nA · '+A.join(' ')+'\nR · '+R.join(' ');
 return {periode,S,B,A,R,texte,alertes:[...new Set(alertes)]};
}
return {sbar,age,jourPostop};
});

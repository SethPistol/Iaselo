/* IASELO · alertes du bloc en temps réel (5e veille, lot 3).
   Le fil est CALCULÉ à partir du programme partagé (étapes horodatées de chaque réservation) et des arrivées à la clinique :
   aucune saisie en plus pour les équipes. Chaque alerte vise des destinataires :
   - « chirurgien:<nom> » : le chirurgien de l'intervention ; « anesthesiste » ; « bloc » (infirmiers de bloc, cadre) ;
   - « etage » (infirmiers d'étage, cadre d'étage) ; « accueil » (secrétariat).
   fil({reservations, resources, sejours, arrivees, jour, maintenant, retardMin}) → alertes (récentes d'abord)
   pourMoi(alerte, {job, poste, nom, isAdmin}) → booléen
   notification(alerte) → {titre, corps} SANS nom du patient (écran verrouillé du téléphone). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloAlertesBloc=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const t=v=>v===undefined||v===null?'':String(v).trim();
const norm=s=>t(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const hm=s=>{const m=/T(\d{2}):(\d{2})/.exec(t(s));return m?Number(m[1])+' h '+m[2]:''};
const ajouter=(s,min)=>{const d=new Date(t(s).slice(0,16)+':00Z');d.setUTCMinutes(d.getUTCMinutes()+min);return d.toISOString().slice(0,16)};
const sans=l=>t(l).replace(/\s*\(démo[^)]*\)/i,'').trim();
const ETAPES={
 arrivee:{titre:'Patient arrivé au bloc',pour:['chirurgien','anesthesiste','bloc'],niveau:'info'},
 entree:{titre:'Patient installé en salle',pour:['chirurgien','anesthesiste','bloc'],niveau:'info'},
 sortie:{titre:'Fin d’intervention : sortie de salle',pour:['chirurgien','anesthesiste','bloc'],niveau:'info'},
 sortieBloc:{titre:'Patient sorti du bloc',pour:['anesthesiste','etage','bloc'],niveau:'info'}
};
function etapesDe(r){const e=r&&typeof r.etapes==='object'&&r.etapes?{...r.etapes}:{};if(!e.entree&&['Occupée','Terminée'].includes(r?.state)&&r.actualStart)e.entree=r.actualStart;if(!e.sortie&&r?.state==='Terminée'&&r.actualEnd)e.sortie=r.actualEnd;return e}
function fil({reservations=[],resources=[],sejours={},arrivees=[],jour,maintenant,retardMin=15}={}){
 const salle=id=>sans(resources.find(x=>x.id===id)?.label)||t(id),kind=id=>{const x=resources.find(y=>y.id===id)||{};return x.kind||(t(x.sector).startsWith('bloc')?'room':t(x.sector).startsWith('sspi')?'recovery':'bed')};
 const qui=id=>sejours[id]?.nom||'',ch=id=>sejours[id]?.chambre||'';
 const duJour=reservations.filter(r=>r&&t(r.start).slice(0,10)===jour&&r.state!=='Annulée'&&r.patient&&!r.proposition&&kind(r.resource)==='room').sort((a,b)=>t(a.start).localeCompare(t(b.start)));
 const out=[],add=a=>out.push({...a,patient:qui(a.stay)||'',pour:a.pour});
 for(const r of duJour){
  const e=etapesDe(r),chir=t(r.surgeon),s=salle(r.resource),cible=k=>ETAPES[k].pour.map(p=>p==='chirurgien'?(chir?'chirurgien:'+chir:''):p).filter(Boolean);
  for(const k of Object.keys(ETAPES))if(e[k])add({id:r.id+':'+k,at:t(e[k]).slice(0,16),type:k,stay:r.patient,salle:s,chirurgien:chir,titre:ETAPES[k].titre,texte:s+' · '+ETAPES[k].titre.toLowerCase()+' à '+hm(e[k]),pour:cible(k),niveau:ETAPES[k].niveau});
  // Patient suivant de la même salle : l'étage le prépare dès que le patient en cours entre en salle.
  if(e.entree){const suivant=duJour.find(x=>x.resource===r.resource&&t(x.start)>t(r.start)&&!etapesDe(x).arrivee);
   if(suivant&&!out.some(a=>a.id===suivant.id+':preparer'))add({id:suivant.id+':preparer',at:t(e.entree).slice(0,16),type:'preparer',stay:suivant.patient,salle:s,chirurgien:t(suivant.surgeon),titre:'Préparer le patient suivant',texte:'Préparer le patient'+(ch(suivant.patient)?' de la chambre '+ch(suivant.patient):'')+' et l’envoyer vers '+s+' (passage prévu à '+hm(suivant.start)+')',pour:['etage','bloc'],niveau:'action'})}
  // Retard : passage prévu dépassé sans arrivée au bloc.
  if(!e.arrivee&&!e.entree&&maintenant&&ajouter(r.start,retardMin)<=t(maintenant).slice(0,16))add({id:r.id+':retard',at:ajouter(r.start,retardMin),type:'retard',stay:r.patient,salle:s,chirurgien:chir,titre:'Patient pas encore arrivé au bloc',texte:s+' · passage prévu à '+hm(r.start)+', patient pas encore arrivé',pour:['bloc',...(chir?['chirurgien:'+chir]:[]),'etage'],niveau:'alerte'});
 }
 for(const a of arrivees){if(t(a.jour)!==jour)continue;const r=duJour.find(x=>x.patient===a.stay);
  add({id:'arrivee-clinique:'+a.stay+':'+a.jour,at:t(a.at).slice(0,16),type:'arriveeClinique',stay:a.stay,salle:r?salle(r.resource):'',chirurgien:t(r?.surgeon),titre:'Patient arrivé à la clinique',texte:'Arrivé à '+hm(a.at)+(a.source==='qr'?' (QR code de l’accueil)':'')+(r?' · passage prévu '+salle(r.resource)+' à '+hm(r.start):''),pour:['accueil','etage','bloc'],niveau:'info'})}
 return out.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}
function nomCle(s){return norm(s).replace(/^(dr|docteur|pr|professeur) /,'').split(' ').filter(w=>w.length>1)}
function pourMoi(a,{job='',poste='',nom='',isAdmin=false}={}){
 const p=a.pour||[];
 if(isAdmin)return true;
 if(job==='anesthesiste')return p.includes('anesthesiste')||p.includes('bloc');
 if(job==='chirurgien'){const moi=nomCle(nom);return p.some(x=>x.startsWith('chirurgien:')&&nomCle(x.slice(11)).some(w=>moi.includes(w)))}
 if(job==='infirmier'){if(['bloc','cadre'].includes(poste))return p.includes('bloc');return p.includes('etage')}
 if(job==='secretariat')return p.includes('accueil');
 return false;
}
function notification(a){return {titre:'IASELO · '+(a.salle||'Bloc'),corps:a.type==='preparer'?'Préparer le patient suivant ('+a.salle+')':a.type==='arriveeClinique'?'Un patient est arrivé à la clinique':a.titre+(a.salle?' · '+a.salle:'')}}
return {ETAPES,fil,pourMoi,notification,norm};
});

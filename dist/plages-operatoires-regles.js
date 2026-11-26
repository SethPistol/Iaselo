/* Plages opératoires des chirurgiens (26/11/2026, demande de Romain) :
   l'administrateur ou le cadre de bloc fixe, pour chaque chirurgien, son jour opératoire,
   la salle, l'heure de début et la durée de la plage. Les vacations datées du bloc sont
   ensuite générées à partir de ces plages (les annonces s'y placent automatiquement). */
(function(root){
'use strict';
const JOURS=[[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi'],[6,'Samedi'],[0,'Dimanche']];
const RYTHMES=[['hebdo','Toutes les semaines'],['paire','Semaines paires'],['impaire','Semaines impaires']];
const HORIZON=12; // semaines de vacations générées à l'avance
const DUREE_MIN=30,DUREE_MAX=12*60;
const jourDe=d=>{const [y,m,j]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,j)).getUTCDay()};
const ajouterJours=(d,n)=>{const [y,m,j]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,j+n)).toISOString().slice(0,10)};
const dateOk=d=>typeof d==='string'&&/^\d{4}-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00Z'));
const heureOk=h=>typeof h==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(h);
// Numéro de semaine ISO, pour les plages une semaine sur deux.
function semaineIso(d){const [y,m,j]=d.split('-').map(Number),t=new Date(Date.UTC(y,m-1,j)),n=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-n+3);const premier=new Date(Date.UTC(t.getUTCFullYear(),0,4));return 1+Math.round(((t-premier)/864e5-3+((premier.getUTCDay()+6)%7))/7)}
const libelleJour=n=>(JOURS.find(([k])=>k===Number(n))||[,''])[1];
const libelleRythme=r=>(RYTHMES.find(([k])=>k===r)||RYTHMES[0])[1];
const fin=p=>{const [h,m]=p.start.split(':').map(Number),t=h*60+m+Number(p.duration);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')};
const dureeTexte=n=>{n=Number(n)||0;const h=Math.floor(n/60),m=n%60;return h?h+' h'+(m?' '+String(m).padStart(2,'0'):''):m+' min'};
const kind=r=>r?.kind||(String(r?.sector||'').startsWith('bloc')?'room':String(r?.sector||'').startsWith('sspi')?'recovery':'bed');
const CHAMPS=['id','surgeon','weekday','resource','start','duration','staffIds','from','until','rhythm','label','state','updatedAt','updatedBy'];

function plageError(p,plages=[],resources=[]){
 if(!p||typeof p!=='object'||Array.isArray(p)||!p.id)return 'Plage invalide.';
 if(Object.keys(p).some(k=>!CHAMPS.includes(k)))return 'Champ de plage inconnu.';
 if(!String(p.surgeon||'').trim()||String(p.surgeon).length>120)return 'Indiquez le chirurgien titulaire de la plage.';
 if(!JOURS.some(([k])=>k===p.weekday))return 'Choisissez le jour opératoire.';
 const salle=resources.find(r=>r.id===p.resource);if(!salle||kind(salle)!=='room')return 'Choisissez une salle de bloc.';
 if(!heureOk(p.start))return 'Heure de début invalide.';
 if(!Number.isInteger(p.duration)||p.duration<DUREE_MIN||p.duration>DUREE_MAX||p.duration%15)return 'La durée de la plage va de 30 min à 12 h, par quarts d’heure.';
 const [h,m]=p.start.split(':').map(Number);if(h*60+m+p.duration>24*60)return 'La plage doit se terminer le même jour.';
 if(!Array.isArray(p.staffIds)||!p.staffIds.length||p.staffIds.some(id=>!resources.some(r=>r.id===id&&kind(r)==='staff')))return 'Affectez au moins un personnel à la plage.';
 if(!dateOk(p.from))return 'Indiquez la date de début de validité.';
 if(p.until&&(!dateOk(p.until)||p.until<p.from))return 'La fin de validité doit suivre le début.';
 if(p.rhythm&&!RYTHMES.some(([k])=>k===p.rhythm))return 'Rythme invalide.';
 if(!['Active','Suspendue'].includes(p.state||'Active'))return 'État invalide.';
 if(p.label&&String(p.label).length>160)return 'Libellé trop long.';
 if((p.state||'Active')==='Active'){
  const conflit=plages.find(x=>x.id!==p.id&&(x.state||'Active')==='Active'&&x.weekday===p.weekday&&seCroisent(x,p)&&(x.resource===p.resource||(x.staffIds||[]).some(id=>p.staffIds.includes(id)))&&memeSemaine(x,p)&&x.start<fin(p)&&p.start<fin(x));
  if(conflit)return 'Chevauchement avec la plage de '+conflit.surgeon+' ('+libelleJour(conflit.weekday)+' '+conflit.start+'–'+fin(conflit)+') : même salle ou même personnel.';
 }
 return '';
}
const seCroisent=(a,b)=>(!a.until||a.until>=b.from)&&(!b.until||b.until>=a.from);
const memeSemaine=(a,b)=>{const x=a.rhythm||'hebdo',y=b.rhythm||'hebdo';return x==='hebdo'||y==='hebdo'||x===y};
function listeError(plages,resources){
 if(!Array.isArray(plages))return 'Plages invalides.';
 if(new Set(plages.map(p=>p?.id)).size!==plages.length)return 'Identifiants de plage en double.';
 for(const p of plages){const e=plageError(p,plages,resources);if(e)return e}
 return '';
}
// Dates de la plage entre deux jours inclus.
function dates(p,debut,finJour){
 const out=[];if((p.state||'Active')!=='Active')return out;
 let d=debut<p.from?p.from:debut;const dernier=p.until&&p.until<finJour?p.until:finJour;
 d=ajouterJours(d,(p.weekday-jourDe(d)+7)%7);
 for(;d<=dernier;d=ajouterJours(d,7)){const s=semaineIso(d);if(p.rhythm==='paire'&&s%2)continue;if(p.rhythm==='impaire'&&!(s%2))continue;out.push(d)}
 return out;
}
const vacationDe=(p,d)=>({id:'VAC-PL-'+p.id+'-'+d,resource:p.resource,label:p.label?.trim()||'Plage de '+p.surgeon,start:d+'T'+p.start,end:d+'T'+fin(p),staffIds:[...p.staffIds],surgeon:p.surgeon,state:'Ouverte',plageId:p.id});
const actif=r=>!['Annulée','Terminée'].includes(r.state);

/* Recalcule les vacations issues des plages, d'aujourd'hui à HORIZON semaines.
   - Les vacations saisies à la main et les vacations passées ne bougent pas.
   - Une vacation de plage sans patient programmé est recréée selon la plage (ou retirée).
   - Une vacation déjà occupée est ajustée si tous ses patients tiennent dans le nouvel horaire ;
     sinon elle est conservée et signalée. */
function generer({plages=[],vacations=[],reservations=[],resources=[],today,semaines=HORIZON,vacationError}){
 const finJour=ajouterJours(today,semaines*7),signalements=[];
 const futur=v=>v.plageId&&v.start.slice(0,10)>=today&&v.state!=='Annulée';
 const occupees=v=>reservations.filter(r=>r.vacationId===v.id&&actif(r));
 const garder=vacations.filter(v=>!futur(v)||occupees(v).length);
 const voulues=new Map();
 for(const p of plages)for(const d of dates(p,today,finJour)){const v=vacationDe(p,d);voulues.set(v.id,v)}
 // Une occurrence annulée à la main (congé, fermeture de salle…) n'est pas recréée.
 for(const v of vacations)if(v.state==='Annulée')voulues.delete(v.id);
 const out=[];
 for(const v of garder){
  if(!futur(v)){out.push(v);continue}
  const cible=voulues.get(v.id);voulues.delete(v.id);
  if(!cible){out.push(v);signalements.push(v.start.slice(0,10)+' · '+v.surgeon+' : plage retirée mais des patients sont programmés, vacation conservée.');continue}
  const tient=occupees(v).every(r=>r.start>=cible.start&&r.end<=cible.end&&r.resource===cible.resource);
  if(tient)out.push({...v,...cible});
  else{out.push(v);signalements.push(v.start.slice(0,10)+' · '+v.surgeon+' : des patients programmés ne tiennent plus dans le nouvel horaire, vacation conservée.')}
 }
 for(const v of voulues.values()){
  const e=vacationError?vacationError(v,out,resources):'';
  if(e){signalements.push(v.start.slice(0,10)+' · '+v.surgeon+' : '+e);continue}
  out.push(v);
 }
 // Ordre d'origine conservé (pas d'enregistrement inutile), nouvelles vacations à la suite.
 const rang=new Map(vacations.map((v,i)=>[v.id,i]));out.sort((a,b)=>(rang.get(a.id)??1e9)-(rang.get(b.id)??1e9));
 const avant=new Map(vacations.map(v=>[v.id,v])),apres=new Set(out.map(v=>v.id)),cle=v=>JSON.stringify([v.resource,v.label,v.start,v.end,v.surgeon,v.staffIds,v.state]);
 const ajoutees=out.filter(v=>v.plageId&&!avant.has(v.id)),ajustees=out.filter(v=>v.plageId&&avant.has(v.id)&&cle(avant.get(v.id))!==cle(v)),retirees=vacations.filter(v=>futur(v)&&!apres.has(v.id));
 return {vacations:out,ajoutees,retirees,ajustees,signalements};
}
const peutGerer=profil=>!!profil&&profil.active!==false&&(profil.isAdmin===true||(profil.profession==='infirmier'&&profil.poste==='cadre'));
// Semaine type : pour chaque jour, les plages actives triées par heure.
function semaineType(plages){return JOURS.map(([n,l])=>({jour:n,libelle:l,plages:plages.filter(p=>p.weekday===n&&(p.state||'Active')==='Active').sort((a,b)=>a.start.localeCompare(b.start))})).filter(j=>j.jour!==0||j.plages.length)}
const api={JOURS,RYTHMES,HORIZON,DUREE_MIN,DUREE_MAX,plageError,listeError,dates,generer,vacationDe,fin,dureeTexte,libelleJour,libelleRythme,semaineIso,jourDe,ajouterJours,peutGerer,semaineType};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IaseloPlages=api;
})(typeof window!=='undefined'?window:globalThis);

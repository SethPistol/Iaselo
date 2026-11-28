/* IASELO · circuit du médicament au lit (28/11/2026, 5e veille, lot 1). Règles pures, sans réseau.
   Prescription structurée (médicament BDPM, dose, voie, horaires ou « si besoin »), plan d'administration horaire
   (doses à venir, à donner, en retard, données, non données) et contrôle des « 5 B » avant chaque administration :
   bon patient (bracelet), bon médicament (DataMatrix de la boîte), bonne dose, bonne voie, bon moment.
   Valeurs par défaut (horaires, tolérance de 60 min) À FAIRE VALIDER par la pharmacie et les médecins.
   Les heures sont des heures locales « AAAA-MM-JJTHH:MM » (comme les exécutions déjà tracées). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloAdministration=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const FREQUENCES={
 '1x':{libelle:'1 fois par jour',horaires:['08:00']},
 '2x':{libelle:'Matin et soir',horaires:['08:00','20:00']},
 '3x':{libelle:'3 fois par jour',horaires:['08:00','14:00','20:00']},
 '4x':{libelle:'4 fois par jour',horaires:['06:00','12:00','18:00','00:00']},
 'h8':{libelle:'Toutes les 8 heures',horaires:['06:00','14:00','22:00']},
 'soir':{libelle:'Le soir',horaires:['20:00']},
 'perso':{libelle:'Horaires choisis',horaires:[]},
 'unique':{libelle:'Dose unique',horaires:[]},
 'sb':{libelle:'Si besoin',horaires:[],siBesoin:true}
};
const VOIES=['Orale','Intraveineuse','Sous-cutanée','Intramusculaire','Rectale','Cutanée','Inhalée','Sublinguale','Autre'];
const UNITES=['mg','g','µg','UI','mL','goutte(s)','comprimé(s)','gélule(s)','sachet(s)','bouffée(s)','application(s)'];
const TOLERANCE_MIN=60;
const STATUTS=['Réalisée','Non réalisée','Reportée','Refusée'];
const t=v=>typeof v==='string'?v.trim():'';
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const heureOk=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const localOk=s=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(s||''));
const ms=s=>new Date(s).getTime();
const pad=n=>String(n).padStart(2,'0');
const versLocal=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
const fmtDose=n=>String(n).replace('.',',');
const hh=h=>h.slice(0,2).replace(/^0(?=\d)/,'')+' h'+(h.slice(3)==='00'?'':' '+h.slice(3));

// Horaires effectifs d'une posologie (fréquence prédéfinie ou horaires choisis), triés.
function horaires(p){const f=FREQUENCES[p?.frequence];if(!f)return [];const h=p.frequence==='perso'?(p.horaires||[]):f.horaires;return [...new Set(h.filter(heureOk))].sort()}
// Contrôle de la saisie du médecin. Renvoie la posologie nettoyée ou des erreurs.
function valider(p){
 const e=[],o={cis:/^\d{8}$/.test(t(p?.cis))?t(p.cis):'',medicament:t(p?.medicament),dose:num(p?.dose),unite:t(p?.unite),voie:t(p?.voie),frequence:t(p?.frequence),
  horaires:Array.isArray(p?.horaires)?p.horaires.map(t).filter(heureOk):[],debut:t(p?.debut),fin:t(p?.fin),intervalleH:num(p?.intervalleH),max24h:num(p?.max24h),consignes:t(p?.consignes).slice(0,500)};
 if(!o.medicament)e.push('Choisissez le médicament.');
 if(!(o.dose>0))e.push('Indiquez une dose supérieure à zéro.');
 if(!UNITES.includes(o.unite))e.push('Choisissez l’unité.');
 if(!VOIES.includes(o.voie))e.push('Choisissez la voie.');
 if(!FREQUENCES[o.frequence])e.push('Choisissez la fréquence.');
 if(o.frequence==='perso'&&!o.horaires.length)e.push('Indiquez au moins un horaire.');
 if(!localOk(o.debut))e.push('Indiquez le début.');
 if(o.fin&&!localOk(o.fin))e.push('Fin invalide.');
 if(o.fin&&localOk(o.debut)&&ms(o.fin)<=ms(o.debut))e.push('La fin doit suivre le début.');
 if(o.frequence==='sb'){if(!(o.intervalleH>0))e.push('Si besoin : indiquez l’intervalle minimal entre deux doses (heures).');if(!(o.max24h>0))e.push('Si besoin : indiquez le nombre maximal de doses par 24 h.')}
 else{o.intervalleH=null;o.max24h=null}
 if(o.frequence!=='perso')o.horaires=[];
 return e.length?{ok:false,erreurs:e}:{ok:true,posologie:o};
}
function libelle(p){
 const f=FREQUENCES[p.frequence],h=horaires(p);
 const quand=p.frequence==='sb'?'si besoin, '+fmtDose(p.intervalleH)+' h minimum entre deux doses, '+fmtDose(p.max24h)+' dose(s) au plus par 24 h':p.frequence==='unique'?'dose unique':(f?.libelle||'')+(h.length?' ('+h.map(hh).join(', ')+')':'');
 const periode=p.debut?' · à partir du '+p.debut.slice(8,10)+'/'+p.debut.slice(5,7)+' '+hh(p.debut.slice(11,16))+(p.fin?' jusqu’au '+p.fin.slice(8,10)+'/'+p.fin.slice(5,7)+' '+hh(p.fin.slice(11,16)):''):'';
 return p.medicament+' · '+fmtDose(p.dose)+' '+p.unite+' · '+p.voie+' · '+quand+periode;
}
// Doses prévues dans la fenêtre [de, a] (heures locales).
function creneaux(p,de,a){
 if(!p||p.frequence==='sb'||!localOk(p.debut))return [];
 if(p.frequence==='unique'){const x=p.debut;return ms(x)>=ms(de)&&ms(x)<=ms(a)?[x]:[]}
 const h=horaires(p),out=[],j=new Date(ms(de));j.setHours(0,0,0,0);const finJ=new Date(ms(a));
 for(;j<=finJ;j.setDate(j.getDate()+1)){
  for(const x of h){const s=versLocal(j).slice(0,11)+x;const m=ms(s);if(m<ms(de)||m>ms(a)||m<ms(p.debut)||(p.fin&&m>ms(p.fin)))continue;out.push(s)}
 }
 return out.sort();
}
// État d'une dose prévue : donnee | non-donnee | reportee | refusee | a-venir | a-donner | retard.
function etatCreneau(rx,creneau,maintenant,tol=TOLERANCE_MIN){
 // Exécution rattachée au créneau, ou, à défaut, tracée sans créneau (saisie manuelle) dans la tolérance.
 const ex=(rx.executions||[]).filter(e=>e.prevu===creneau).at(-1)||(rx.executions||[]).filter(e=>!e.prevu&&Math.abs(ms(e.at)-ms(creneau))<=tol*60000).at(-1);
 if(ex)return {etat:{'Réalisée':'donnee','Non réalisée':'non-donnee','Reportée':'reportee','Refusée':'refusee'}[ex.status]||'donnee',execution:ex};
 const d=(ms(maintenant)-ms(creneau))/60000;
 return {etat:d< -tol?'a-venir':d<=tol?'a-donner':'retard'};
}
const LIB_ETAT={'a-venir':'À venir','a-donner':'À donner','retard':'En retard','donnee':'Donnée','non-donnee':'Non donnée','reportee':'Reportée','refusee':'Refusée'};
// Dose « si besoin » : possible maintenant ? (intervalle minimal et maximum sur 24 h glissantes)
function siBesoin(rx,maintenant){
 const p=rx.posologie||{},donnees=(rx.executions||[]).filter(e=>e.status==='Réalisée'&&localOk(e.at)).map(e=>e.at).sort();
 const sur24=donnees.filter(x=>ms(maintenant)-ms(x)<24*3600e3&&ms(x)<=ms(maintenant)),derniere=donnees.at(-1)||'';
 const prochaine=derniere&&p.intervalleH?versLocal(new Date(ms(derniere)+p.intervalleH*3600e3)):'';
 if(p.fin&&ms(maintenant)>ms(p.fin))return {possible:false,raison:'Prescription terminée.',derniere,sur24:sur24.length,max:p.max24h};
 if(p.max24h&&sur24.length>=p.max24h)return {possible:false,raison:'Maximum de '+fmtDose(p.max24h)+' dose(s) sur 24 h atteint.',derniere,sur24:sur24.length,max:p.max24h};
 if(prochaine&&ms(maintenant)<ms(prochaine))return {possible:false,raison:'Prochaine dose possible à '+hh(prochaine.slice(11,16))+'.',derniere,prochaine,sur24:sur24.length,max:p.max24h};
 return {possible:true,derniere,prochaine,sur24:sur24.length,max:p.max24h};
}
// Plan d'administration d'un séjour : lignes validées et structurées, doses de la fenêtre, compteurs.
function plan(rxs,maintenant,{avantH=12,apresH=12}={}){
 const de=versLocal(new Date(ms(maintenant)-avantH*3600e3)),a=versLocal(new Date(ms(maintenant)+apresH*3600e3)),lignes=[];let aDonner=0,retard=0,sb=0;
 (rxs||[]).forEach((rx,index)=>{
  if(!rx?.validated||!rx.posologie)return;
  const p=rx.posologie;
  if(p.frequence==='sb'){const s=siBesoin(rx,maintenant);sb++;lignes.push({index,rx,libelle:libelle(p),siBesoin:s,creneaux:[]});return}
  // On garde aussi les doses en retard plus anciennes que la fenêtre (jusqu'à 24 h).
  const cs=creneaux(p,versLocal(new Date(ms(maintenant)-24*3600e3)),a).map(c=>({at:c,...etatCreneau(rx,c,maintenant)})).filter(c=>ms(c.at)>=ms(de)||c.etat==='retard');
  aDonner+=cs.filter(c=>c.etat==='a-donner').length;retard+=cs.filter(c=>c.etat==='retard').length;
  lignes.push({index,rx,libelle:libelle(p),creneaux:cs});
 });
 return {de,a,lignes,aDonner,retard,siBesoin:sb};
}
// Compteurs pour la surveillance des lits.
function compteurs(rxs,maintenant){const p=plan(rxs,maintenant,{avantH:24,apresH:0});return {aDonner:p.aDonner,retard:p.retard}}

// GS1 : GTIN-14 « 0340… » → code CIP13 « 340… » (médicaments français).
function cipDepuisGtin(gtin){const g=String(gtin||'');return /^03400\d{9}$/.test(g)?g.slice(1):''}
const plie=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
// Contrôle des 5 B. Chaque point : {id, libelle, niveau: ok | attention | bloquant, message}.
// boite = {gtin, peremption, lot, cis} (cis retrouvé par le CIP13 si la table est disponible).
function controle5B({rx,stayId,bracelet,boite,dose,voie,at,creneau,aujourdhui}){
 const p=rx?.posologie||{},out=[];
 const add=(id,libelle,niveau,message)=>out.push({id,libelle,niveau,message});
 const lu=t(bracelet);
 if(!lu)add('patient','Bon patient','attention','Bracelet non scanné : vérifiez l’identité avec le patient (nom, prénom, date de naissance).');
 else if(lu===stayId)add('patient','Bon patient','ok','Bracelet du patient reconnu.');
 else add('patient','Bon patient','bloquant','Ce bracelet n’est pas celui de ce patient. N’administrez pas.');
 if(!boite?.gtin)add('medicament','Bon médicament','attention','Boîte non scannée : vérifiez le nom, le dosage et la forme.');
 else if(!boite.valide)add('medicament','Bon médicament','bloquant','Code de la boîte illisible ou invalide. Scannez de nouveau.');
 else if(boite.peremption&&aujourdhui&&boite.peremption<aujourdhui)add('medicament','Bon médicament','bloquant','Médicament périmé ('+boite.peremption.split('-').reverse().join('/')+').');
 else if(boite.cis&&p.cis&&boite.cis!==p.cis)add('medicament','Bon médicament','bloquant','La boîte scannée ne correspond pas au médicament prescrit'+(boite.nom?' ('+boite.nom+')':'')+'.');
 else if(boite.cis&&p.cis)add('medicament','Bon médicament','ok','Boîte conforme à la prescription'+(boite.lot?' · lot '+boite.lot:'')+'.');
 else add('medicament','Bon médicament','attention','Boîte lue mais non rapprochée de la base : vérifiez le nom et le dosage.');
 const d=t(dose),attendue=fmtDose(p.dose)+' '+p.unite;
 if(!d)add('dose','Bonne dose','bloquant','Indiquez la dose administrée.');
 else if(plie(d)===plie(attendue)||num(d)===p.dose&&plie(d).endsWith(plie(p.unite)))add('dose','Bonne dose','ok','Dose prescrite : '+attendue+'.');
 else add('dose','Bonne dose','attention','Dose différente de la prescription ('+attendue+') : indiquez le motif.');
 if(!t(voie))add('voie','Bonne voie','bloquant','Indiquez la voie.');
 else if(plie(voie)===plie(p.voie))add('voie','Bonne voie','ok','Voie prescrite : '+p.voie+'.');
 else add('voie','Bonne voie','bloquant','Voie différente de la prescription ('+p.voie+') : appelez le médecin.');
 if(creneau&&localOk(at)){const e=Math.abs(ms(at)-ms(creneau))/60000;add('moment','Bon moment',e<=TOLERANCE_MIN?'ok':'attention',e<=TOLERANCE_MIN?'Dans le créneau prévu ('+hh(creneau.slice(11,16))+').':'Hors du créneau prévu ('+hh(creneau.slice(11,16))+') : indiquez le motif.')}
 else if(p.frequence==='sb'){add('moment','Bon moment','ok','Dose si besoin : intervalle et maximum contrôlés.')}
 else add('moment','Bon moment','attention','Heure à vérifier.');
 return {points:out,bloquant:out.some(x=>x.niveau==='bloquant'),aJustifier:out.some(x=>x.niveau==='attention')};
}
// Exécution à ajouter au séjour (même forme que les exécutions déjà tracées, plus prevu et controle5B).
function execution({rx,statut,at,auteur,role,dose,voie,note,creneau,controle}){
 if(!rx?.validated)return {erreur:'La prescription doit être validée par un médecin.'};
 if(!STATUTS.includes(statut))return {erreur:'Statut inconnu.'};
 if(!localOk(at)||!t(auteur))return {erreur:'Renseignez l’heure et l’auteur.'};
 const donne=statut==='Réalisée';
 if(!donne&&!t(note))return {erreur:'Indiquez le motif.'};
 if(donne&&controle?.bloquant)return {erreur:'Un contrôle bloque l’administration : '+controle.points.filter(x=>x.niveau==='bloquant').map(x=>x.message).join(' ')};
 if(donne&&controle?.aJustifier&&!t(note))return {erreur:'Un point est à vérifier : indiquez ce que vous avez contrôlé dans le commentaire.'};
 if((rx.executions||[]).some(e=>e.at===at))return {erreur:'Une exécution est déjà tracée à cette heure.'};
 if(creneau&&(rx.executions||[]).some(e=>e.prevu===creneau&&e.status==='Réalisée'))return {erreur:'Cette dose est déjà donnée.'};
 return {execution:{at,author:t(auteur),status:statut,note:t(note),dose:donne?t(dose):'',route:donne?t(voie):'',role:role||'',recordedAt:new Date().toISOString(),
  ...(creneau?{prevu:creneau}:{}),...(controle&&donne?{controle5B:controle.points.map(x=>({id:x.id,niveau:x.niveau}))}:{})}};
}
return {FREQUENCES,VOIES,UNITES,STATUTS,TOLERANCE_MIN,LIB_ETAT,horaires,valider,libelle,creneaux,etatCreneau,siBesoin,plan,compteurs,cipDepuisGtin,controle5B,execution,versLocal};
});

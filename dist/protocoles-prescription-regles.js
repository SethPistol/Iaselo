/* IASELO · protocoles de prescription partagés (26/11/2026, demande de Romain).
   L'administrateur crée et met à jour des protocoles ; les médecins prescripteurs les reprennent dans leurs
   prescriptions puis les ajustent : rien n'est prescrit sans relecture ni signature du médecin.
   Trois types de protocoles, un par partie « prescription » du dossier :
    - preop  : prescriptions préopératoires de la consultation (examens, prémédication, douche, jeûne, consignes) ;
    - postop : prescriptions postopératoires (lignes ajoutées au brouillon, validées ensuite par le médecin) ;
    - sortie : ordonnance de sortie (médicaments ajoutés au formulaire).
   Fonctions pures partagées par l'écran (protocoles-prescription.js), le dossier et le serveur (worker/protocoles.mjs).
   Testées dans tests/protocoles-prescription.test.cjs. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./prescriptions-preop-regles.js'):root.IaseloPrescriptionsPreop);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloProtocoles=api;
})(typeof self!=='undefined'?self:this,function(PP){
'use strict';
const str=(v,max=600)=>String(v??'').replace(/\r/g,'').trim().slice(0,max);
const int=(v,min,max,def)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>=min&&n<=max?n:def};
const TYPES={preop:'Prescriptions préopératoires',postop:'Prescriptions postopératoires',sortie:'Ordonnance de sortie'};
const CATEGORIES_POSTOP=['Médicament','Examen biologique','Surveillance','Soin infirmier'];
const SPECIALITES=['Toutes spécialités','Orthopédie','Chirurgie digestive','ORL','Gynécologie','Urologie','Ophtalmologie','Chirurgie plastique','Endoscopie','Autre'];
const STATUTS={actif:'En service',archive:'Retiré'};
const MAX_LIGNES=30;

/* ---------- Contenu normalisé par type ---------- */
function contenuPreop(c){
 c=c&&typeof c==='object'?c:{};
 const b=c.bilans||{},dc=c.douche||{},j=c.jeune||{},ids=Array.isArray(b.ids)?b.ids:[];
 const known=PP?PP.BILANS.map(x=>x.id):ids;
 return {
  bilans:{ids:known.filter(id=>ids.includes(id)),delaiJours:b.delaiJours===''||b.delaiJours==null?null:int(b.delaiJours,0,90,null),notes:str(b.notes,600),autres:str(b.autres,1200)},
  premed:(Array.isArray(c.premed)?c.premed:[]).slice(0,12).map(r=>({drug:str(r?.drug,160),dose:str(r?.dose,200),moment:str(r?.moment,200)})).filter(r=>r.drug),
  traitements:{libre:str(c.traitements?.libre,1500)},
  douche:{inclure:dc.inclure===true,actif:dc.actif!==false,nombre:dc.nombre==1?1:2,produit:dc.produit==='antiseptique'?'antiseptique':'doux',cheveux:dc.cheveux!==false,rasage:dc.rasage!==false,retirer:dc.retirer!==false,libre:str(dc.libre,600)},
  jeune:{inclure:j.inclure===true,actif:j.actif!==false,solides:int(j.solides,2,12,6),liquides:int(j.liquides,1,6,2),tabac:j.tabac!==false,libre:str(j.libre,600)},
  autres:str(c.autres,2000)
 };
}
function contenuPostop(c){
 return {lignes:(Array.isArray(c?.lignes)?c.lignes:[]).slice(0,MAX_LIGNES).map(l=>({name:str(l?.name,160),category:CATEGORIES_POSTOP.includes(l?.category)?l.category:'Médicament',instructions:str(l?.instructions,1000)})).filter(l=>l.name)};
}
const SORTIE_CHAMPS=['drug','dose','route','frequency','duration','notes'];
function contenuSortie(c){
 return {lignes:(Array.isArray(c?.lignes)?c.lignes:[]).slice(0,MAX_LIGNES).map(l=>Object.fromEntries(SORTIE_CHAMPS.map(k=>[k,str(l?.[k],k==='notes'?400:200)]))).filter(l=>l.drug)};
}
function normaliserContenu(type,c){return type==='preop'?contenuPreop(c):type==='postop'?contenuPostop(c):type==='sortie'?contenuSortie(c):{}}
function normaliser(p){
 p=p&&typeof p==='object'?p:{};const type=Object.hasOwn(TYPES,p.type)?p.type:'';
 return {nom:str(p.nom,120),type,specialite:SPECIALITES.includes(p.specialite)?p.specialite:'Toutes spécialités',description:str(p.description,600),contenu:normaliserContenu(type,p.contenu)};
}
// Ce qui fait foi pour une version : le protocole normalisé, clés triées.
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const canonique=p=>stable(normaliser(p));

function vide(type){return normaliserContenu(type,{})}
function estVide(type,c){
 c=normaliserContenu(type,c);
 if(type==='preop')return !c.bilans.ids.length&&!c.bilans.autres&&!c.premed.length&&!c.traitements.libre&&!c.douche.inclure&&!c.jeune.inclure&&!c.autres;
 return !c.lignes.length;
}
function valider(p,{modification=false,motif=''}={}){
 const n=normaliser(p),errors=[];
 if(!n.type)errors.push('Choisissez le type de protocole.');
 if(n.nom.length<3)errors.push('Donnez un nom au protocole (3 caractères au moins).');
 if(n.type&&estVide(n.type,n.contenu))errors.push('Le protocole ne contient aucune prescription.');
 if(n.type==='preop')n.contenu.premed.forEach((r,i)=>{if(!r.dose||!r.moment)errors.push(`Médicament ${i+1} (${r.drug}) : posologie et moment de prise requis.`)});
 if(n.type==='sortie')n.contenu.lignes.forEach((l,i)=>{if(!l.dose||!l.route||!l.frequency||!l.duration)errors.push(`Médicament ${i+1} (${l.drug}) : dose, voie, fréquence et durée requises.`)});
 if(n.type==='postop')n.contenu.lignes.forEach((l,i)=>{if(!l.instructions)errors.push(`Ligne ${i+1} (${l.name}) : consignes requises.`)});
 if(modification&&str(motif,300).length<5)errors.push('Indiquez le motif de la mise à jour (5 caractères au moins) : il est conservé dans l’historique.');
 return {ok:!errors.length,errors,protocole:n};
}

/* ---------- Résumé lisible (liste, historique, choix du médecin) ---------- */
function resume(type,c){
 c=normaliserContenu(type,c);const out=[];
 if(type==='preop'){
  const BIL=PP?PP.BILAN:{};
  if(c.bilans.ids.length)out.push('Examens : '+c.bilans.ids.map(id=>BIL[id]?.label||id).join(' · ')+(c.bilans.delaiJours!=null?` (au plus tard J-${c.bilans.delaiJours})`:''));
  if(c.bilans.autres)out.push('Autres examens : '+c.bilans.autres);
  if(c.premed.length)out.push('Médicaments : '+c.premed.map(r=>`${r.drug} ${r.dose} (${r.moment})`).join(' · '));
  if(c.traitements.libre)out.push('Traitements habituels : '+c.traitements.libre);
  if(c.douche.inclure)out.push(c.douche.actif?'Douche : '+(c.douche.nombre===2?'veille au soir et matin':'matin')+', savon '+(c.douche.produit==='antiseptique'?'antiseptique':'doux'):'Douche : non incluse');
  if(c.jeune.inclure)out.push(c.jeune.actif?`Jeûne : solides ${c.jeune.solides} h, liquides clairs ${c.jeune.liquides} h`:'Jeûne : non inclus');
  if(c.autres)out.push('Consignes : '+c.autres);
 }else if(type==='postop')for(const l of c.lignes)out.push(`${l.name} (${l.category}) : ${l.instructions}`);
 else if(type==='sortie')for(const l of c.lignes)out.push([l.drug,l.dose,l.route,l.frequency,l.duration].filter(Boolean).join(' · ')+(l.notes?' · '+l.notes:''));
 return out;
}
// Différences entre deux versions, pour l'historique.
function differences(avant,apres){
 const a=normaliser(avant),b=normaliser(apres),out=[];
 if(a.nom!==b.nom)out.push(`Nom : « ${a.nom} » → « ${b.nom} »`);
 if(a.specialite!==b.specialite)out.push(`Spécialité : ${a.specialite} → ${b.specialite}`);
 if(a.description!==b.description)out.push('Description modifiée');
 const ra=resume(a.type,a.contenu),rb=resume(b.type,b.contenu);
 for(const l of rb)if(!ra.includes(l))out.push('+ '+l);
 for(const l of ra)if(!rb.includes(l))out.push('− '+l);
 return out;
}

/* ---------- Reprise par le médecin ---------- */
const joindre=(texte,ajout)=>{texte=String(texte||'').trim();ajout=String(ajout||'').trim();if(!ajout)return texte;if(!texte)return ajout;return texte.split('\n').some(l=>l.trim()===ajout)||texte.includes(ajout)?texte:texte+'\n'+ajout};
const memeMedicament=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
function dateMoins(iso,jours){if(!PP?.isDate(iso)||jours==null)return '';const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()-jours);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// Prescriptions préopératoires : le protocole complète le brouillon sans effacer ce que le médecin a déjà saisi.
// Examens et médicaments ajoutés (sans doublon) ; douche et jeûne remplacés seulement si le protocole les définit ;
// date et heure d'intervention gardées. Retourne {draft, ajouts:[...]} pour informer le médecin.
function appliquerPreop(draft,contenu,{surgeryDate=''}={}){
 const d=PP.normaliser(draft),c=contenuPreop(contenu),ajouts=[];
 const nouveaux=c.bilans.ids.filter(id=>!d.bilans.ids.includes(id));
 if(nouveaux.length){d.bilans.ids=PP.BILANS.map(x=>x.id).filter(id=>d.bilans.ids.includes(id)||c.bilans.ids.includes(id));ajouts.push(nouveaux.length+' examen'+(nouveaux.length>1?'s':''))}
 if(c.bilans.delaiJours!=null&&!d.bilans.avant){const a=dateMoins(surgeryDate,c.bilans.delaiJours);if(a)d.bilans.avant=a}
 d.bilans.notes=joindre(d.bilans.notes,c.bilans.notes);d.bilans.autres=joindre(d.bilans.autres,c.bilans.autres);
 let med=0;for(const r of c.premed)if(d.premed.length<12&&!d.premed.some(x=>memeMedicament(x.drug,r.drug))){d.premed.push({drug:r.drug,dose:r.dose,moment:r.moment,motif:''});med++}
 if(med)ajouts.push(med+' médicament'+(med>1?'s':''));
 d.traitements.libre=joindre(d.traitements.libre,c.traitements.libre);
 if(c.douche.inclure){const {inclure,...dc}=c.douche;d.douche={...dc};ajouts.push('douche')}
 if(c.jeune.inclure){d.jeune={...d.jeune,actif:c.jeune.actif,solides:c.jeune.solides,liquides:c.jeune.liquides,tabac:c.jeune.tabac,libre:joindre(d.jeune.libre,c.jeune.libre)};ajouts.push('jeûne')}
 const avantAutres=d.autres;for(const l of c.autres.split('\n'))d.autres=joindre(d.autres,l);if(d.autres!==avantAutres)ajouts.push('consignes');
 return {draft:PP.normaliser(d),ajouts};
}
// Prescriptions postopératoires : lignes ajoutées au brouillon (jamais validées automatiquement).
function lignesPostop(contenu,{auteur='',protocole=null}={}){
 return contenuPostop(contenu).lignes.map(l=>({name:l.name,category:l.category,instructions:l.instructions,author:auteur,validated:false,...(protocole?{protocole}:{})}));
}
// Ordonnance de sortie : les lignes vides du formulaire sont remplacées, les autres gardées ; pas de doublon.
function lignesSortie(items,contenu){
 const garde=(Array.isArray(items)?items:[]).filter(i=>SORTIE_CHAMPS.some(k=>String(i?.[k]||'').trim()));
 const ajout=contenuSortie(contenu).lignes.filter(l=>!garde.some(i=>memeMedicament(i.drug,l.drug)));
 return {items:[...garde,...ajout.map(l=>({...l}))],ajoutes:ajout.length};
}
// Protocoles proposés au médecin : en service, du bon type ; ceux de sa spécialité d'abord.
function proposes(liste,type,specialite=''){
 return (Array.isArray(liste)?liste:[]).filter(p=>p&&p.statut==='actif'&&p.type===type)
  .sort((a,b)=>{const sa=a.specialite===specialite?0:a.specialite==='Toutes spécialités'?1:2,sb=b.specialite===specialite?0:b.specialite==='Toutes spécialités'?1:2;return sa-sb||String(a.nom).localeCompare(String(b.nom),'fr')});
}
return {TYPES,CATEGORIES_POSTOP,SPECIALITES,STATUTS,SORTIE_CHAMPS,MAX_LIGNES,normaliser,normaliserContenu,canonique,vide,estVide,valider,resume,differences,appliquerPreop,lignesPostop,lignesSortie,proposes,dateMoins};
});

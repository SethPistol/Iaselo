/* IASELO · prescriptions préopératoires rédigées pendant la consultation d'anesthésie.
   Fonctions pures, partagées par l'écran du dossier (prescriptions-preop.js), la page patient
   (ordonnance-patient.js) et le serveur (worker/prescriptions.mjs). Testées dans tests/prescriptions-preop.test.cjs.
   Les listes et délais ci-dessous sont des valeurs par défaut à faire relire par l'équipe d'anesthésie :
   le médecin choisit, modifie et signe ; rien n'est prescrit automatiquement. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloPrescriptionsPreop=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const str=(v,max=600)=>String(v??'').replace(/\r/g,'').trim().slice(0,max);
const int=(v,min,max,def)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>=min&&n<=max?n:def};
const isDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!isNaN(new Date(v+'T12:00:00'));
const isTime=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''));
const escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Examens biologiques proposés ---------- */
// Pas de bilan systématique chez le patient ASA 1-2 (SFAR 2012) : chaque examen se coche selon l'indication.
const BILANS=[
 {id:'nfs',label:'NFS, plaquettes',hint:'Chirurgie hémorragique, anémie suspectée, antithrombotique'},
 {id:'hemostase',label:'TP, TCA',hint:'HEMSTOP positif, hépatopathie, anticoagulant'},
 {id:'fibrinogene',label:'Fibrinogène',hint:'Chirurgie hémorragique, anomalie de l’hémostase'},
 {id:'inr',label:'INR',hint:'Patient sous AVK : contrôle la veille ou le matin'},
 {id:'iono',label:'Ionogramme sanguin, créatininémie avec DFG (CKD-EPI)',hint:'Âge, diurétique, IEC/ARA2, AOD, insuffisance rénale'},
 {id:'glycemie',label:'Glycémie à jeun',hint:'Diabète, corticothérapie'},
 {id:'hba1c',label:'HbA1c',hint:'Diabète'},
 {id:'hepatique',label:'Bilan hépatique (ASAT, ALAT, GGT, PAL, bilirubine)',hint:'Hépatopathie, alcool'},
 {id:'martial',label:'Ferritine, coefficient de saturation de la transferrine',hint:'Gestion du capital sanguin (PBM)'},
 {id:'groupe',label:'Groupe sanguin ABO-RhD, phénotype RH-KEL1 (2 déterminations si pas de carte valide)',hint:'Chirurgie à risque transfusionnel'},
 {id:'rai',label:'Recherche d’anticorps irréguliers (RAI)',hint:'Délai de validité de l’établissement : 72 h, ou 21 jours sans transfusion, grossesse ni greffe dans les 6 mois'},
 {id:'bhcg',label:'β-hCG plasmatiques',hint:'Femme en âge de procréer, selon le protocole de l’établissement'},
 {id:'bnp',label:'NT-proBNP (ou BNP)',hint:'≥ 65 ans ou facteur de risque cardiovasculaire, chirurgie à risque intermédiaire ou élevé (ESC 2022)'},
 {id:'albumine',label:'Albuminémie',hint:'Dénutrition suspectée'},
 {id:'ecbu',label:'ECBU',hint:'Chirurgie urologique'}
];
const BILAN=Object.fromEntries(BILANS.map(b=>[b.id,b]));

const MOMENTS=['La veille au soir','Le matin de l’intervention, avec une gorgée d’eau','La veille au soir et le matin de l’intervention','À l’arrivée à la clinique (donné par l’infirmière)','Selon le schéma précisé'];
const PREMED_SUGGESTIONS=['Hydroxyzine 25 mg','Alprazolam 0,25 mg','Paracétamol 1 g','Ésoméprazole 20 mg','Mupirocine pommade nasale','Chlorhexidine solution pour bain de bouche'];

/* ---------- Document vide puis normalisé (même résultat côté navigateur et serveur) ---------- */
function vide(){return normaliser({})}
function normaliser(d){
 d=d&&typeof d==='object'?d:{};
 const b=d.bilans||{},tr=d.traitements||{},dc=d.douche||{},j=d.jeune||{};
 const ids=Array.isArray(b.ids)?[...new Set(b.ids.filter(id=>BILAN[id]))]:[];
 return {
  version:int(d.version,1,999,1),
  bilans:{ids:BILANS.map(x=>x.id).filter(id=>ids.includes(id)),avant:isDate(b.avant)?b.avant:'',autres:str(b.autres,1200),notes:str(b.notes,600)},
  premed:(Array.isArray(d.premed)?d.premed:[]).slice(0,12).map(r=>({drug:str(r?.drug,160),dose:str(r?.dose,200),moment:str(r?.moment,200),motif:str(r?.motif,200)})).filter(r=>r.drug||r.dose||r.moment),
  traitements:{items:(Array.isArray(tr.items)?tr.items:[]).slice(0,30).map(x=>({id:str(x?.id,40),label:str(x?.label,200),text:str(x?.text,600),include:x?.include!==false})).filter(x=>x.label||x.text),libre:str(tr.libre,1500)},
  douche:{actif:dc.actif!==false,nombre:dc.nombre==1?1:2,produit:dc.produit==='antiseptique'?'antiseptique':'doux',cheveux:dc.cheveux!==false,rasage:dc.rasage!==false,retirer:dc.retirer!==false,libre:str(dc.libre,600)},
  jeune:{actif:j.actif!==false,solides:int(j.solides,2,12,6),liquides:int(j.liquides,1,6,2),date:isDate(j.date)?j.date:'',heure:isTime(j.heure)?j.heure:'',tabac:j.tabac!==false,libre:str(j.libre,600)},
  autres:str(d.autres,2000)
 };
}
// Ce qui est signé : le contenu normalisé, sans la signature elle-même.
const canonique=d=>JSON.stringify(normaliser(d));

/* ---------- Textes générés ---------- */
const fmtD=iso=>isDate(iso)?new Date(iso+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'';
const fmtShort=iso=>isDate(iso)?iso.split('-').reverse().join('/'):'';
function heureMoins(date,heure,h){
 if(!isDate(date)||!isTime(heure))return null;
 const t=new Date(date+'T'+heure+':00');t.setTime(t.getTime()-h*3600000);
 return {heure:String(t.getHours())+' h '+String(t.getMinutes()).padStart(2,'0'),veille:t.getDate()!==new Date(date+'T12:00:00').getDate()};
}
function texteJeune(j){
 j=normaliser({jeune:j}).jeune;if(!j.actif)return [];
 const s=heureMoins(j.date,j.heure,j.solides),l=heureMoins(j.date,j.heure,j.liquides),out=[];
 out.push(s?`Dernier repas léger (sans alcool) au plus tard à ${s.heure}${s.veille?' la veille':' le jour de l’intervention'} : ensuite, ne plus manger, ni lait, ni bonbon.`:`Ne plus manger (ni lait, ni bonbon) dans les ${j.solides} heures qui précèdent l’intervention.`);
 out.push(l?`Vous pouvez boire de l’eau, du thé ou du café sans lait, ou un jus sans pulpe, jusqu’à ${l.heure}. Ensuite, plus rien à boire.`:`Vous pouvez boire de l’eau, du thé ou du café sans lait, ou un jus sans pulpe, jusqu’à ${j.liquides} heures avant l’intervention.`);
 if(j.tabac)out.push('Ne fumez pas et ne vapotez pas le jour de l’intervention ; pas de chewing-gum.');
 if(s||l)out.push('Ces horaires sont calculés pour une intervention prévue à '+j.heure.replace(':',' h ')+' : si l’horaire change, la clinique vous le dira.');
 if(j.libre)out.push(j.libre);
 return out;
}
function texteDouche(dc){
 dc=normaliser({douche:dc}).douche;if(!dc.actif)return [];
 const out=[];
 out.push((dc.nombre===2?'Prenez deux douches : la veille au soir et le matin de l’intervention':'Prenez une douche le matin de l’intervention')+(dc.produit==='antiseptique'?', avec le savon antiseptique prescrit':', avec un savon doux habituel')+(dc.cheveux?', en lavant aussi les cheveux':'')+'. Séchez-vous avec une serviette propre et mettez des vêtements propres.');
 if(dc.rasage)out.push('Ne rasez pas la zone à opérer : si une dépilation est nécessaire, elle sera faite à la clinique.');
 if(dc.retirer)out.push('Retirez vernis à ongles, maquillage, bijoux et piercings ; ne mettez ni crème ni parfum.');
 if(dc.libre)out.push(dc.libre);
 return out;
}

/* ---------- Propositions à partir du dossier (jamais cochées automatiquement) ---------- */
// regles = window.IaseloRegles (veille-regles.js) ; stay = séjour du dossier.
function suggestions(stay,regles){
 const out={},add=(id,why)=>{(out[id]=out[id]||[]).push(why)};
 if(!regles?.contexte)return out;
 const ctx=regles.contexte(stay),cons=regles.consignes?regles.consignes(stay).items:[],ext=ctx.ext||{};
 if(ctx.age!=null&&ctx.age>=65){add('iono','65 ans ou plus');add('bnp','65 ans ou plus')}
 if(ctx.sex==='F'&&ctx.age!=null&&ctx.age>=12&&ctx.age<=55)add('bhcg','Femme en âge de procréer');
 if(cons.some(c=>c.classe==='Anticoagulant')){add('nfs','Anticoagulant au long cours');add('iono','Anticoagulant : DFG pour le délai d’arrêt')}
 if(cons.some(c=>/avk|warfarine|fluindione|acenocoumarol/i.test(c.id+' '+c.label)))add('inr','Traitement par AVK');
 if(cons.some(c=>c.classe==='Antiagrégant'))add('nfs','Antiagrégant plaquettaire');
 if((ctx.diseases||[]).includes('Diabète')||cons.some(c=>c.classe==='Antidiabétique')){add('glycemie','Diabète');add('hba1c','Diabète');add('iono','Diabète')}
 if((ctx.diseases||[]).includes('Insuffisance rénale'))add('iono','Insuffisance rénale');
 if(/eleve|élevé/i.test(ext.surgicalBleedingRisk||'')){add('nfs','Risque hémorragique élevé');add('martial','Risque hémorragique élevé (PBM)');add('groupe','Risque hémorragique élevé');add('rai','Risque hémorragique élevé')}
 try{const h=(regles.scores(stay,{})||[]).find(s=>s.id==='hemstop');if(h&&h.value>0){add('hemostase','HEMSTOP positif');add('fibrinogene','HEMSTOP positif')}}catch{}
 return out;
}
// Consignes sur les traitements : celles validées dans « Scores, tri & consignes », sinon les règles datées.
function traitementsProposes(stay,regles){
 const v=stay?.aideCpa?.consignes;
 const items=v?.validatedAt&&Array.isArray(v.items)?v.items:(regles?.consignes?regles.consignes(stay).items:[]);
 return items.map(it=>({id:String(it.id||''),label:String(it.label||''),text:String(it.text||''),include:true}));
}

/* ---------- Contrôles avant signature ---------- */
// allergies : texte du dossier ; A = window.IaseloAmeliorations (contrôle allergies ↔ médicaments).
function alertesAllergies(d,allergies,A){
 if(!A?.controleAllergies)return [];
 return normaliser(d).premed.map((r,i)=>({i,drug:r.drug,motif:r.motif,alerts:r.drug?A.controleAllergies(allergies,r.drug):[]})).filter(x=>x.alerts.length);
}
function controler(d,{allergies='',A=null,surgeryDate=''}={}){
 const n=normaliser(d),errors=[],warnings=[];
 const vide=!n.bilans.ids.length&&!n.bilans.autres&&!n.premed.length&&!n.traitements.items.some(x=>x.include)&&!n.traitements.libre&&!n.douche.actif&&!n.jeune.actif&&!n.autres;
 if(vide)errors.push('Aucune prescription ni consigne à signer.');
 n.premed.forEach((r,i)=>{if(!r.drug||!r.dose||!r.moment)errors.push(`Prémédication ${i+1} : médicament, posologie et moment de prise sont requis.`)});
 for(const a of alertesAllergies(n,allergies,A)){
  if(a.alerts.some(x=>x.niveau==='allergie')&&a.motif.length<5)errors.push(`${a.drug} : allergie déclarée dans le dossier. Corrigez ou indiquez le motif pour poursuivre.`);
  else warnings.push(`${a.drug} : ${a.alerts.map(x=>x.message).join(' ')}${a.motif?' Motif : '+a.motif:''}`);
 }
 if((n.bilans.ids.length||n.bilans.autres)&&!n.bilans.avant)warnings.push('Date limite des examens non précisée.');
 if(n.bilans.avant&&isDate(surgeryDate)&&n.bilans.avant>surgeryDate)errors.push('La date limite des examens est après la date d’intervention.');
 if(n.jeune.actif&&!n.jeune.heure)warnings.push('Heure d’intervention non renseignée : le jeûne est exprimé en heures, sans horaire précis.');
 if(!String(allergies).trim()||/^(à|a) vérifier$/i.test(String(allergies).trim()))warnings.push('Allergies non vérifiées dans le dossier.');
 return {ok:!errors.length,errors,warnings,doc:n};
}

/* ---------- Document affiché (dossier, impression, page patient) ---------- */
// snap = {contenu, patient:{nom,prenom,naissance}, prescripteur:{nom,rpps,specialite}, etablissement, signeLe, version, intervention}
function documentHTML(snap,{logo='assets/marque/etablissement.webp',brouillon=false}={}){
 const e=escHtml,c=normaliser(snap.contenu),pa=snap.patient||{},pr=snap.prescripteur||{};
 const date=snap.signeLe?new Date(snap.signeLe).toLocaleDateString('fr-FR'):new Date().toLocaleDateString('fr-FR');
 const head=title=>`<header class="pp-doc-head"><img src="${e(logo)}" alt="${e(snap.etablissement||'Établissement')}" width="185" height="100"><div class="pp-doc-who"><strong>${e(pr.nom||'Médecin prescripteur')}</strong><span>${e(pr.specialite||'Anesthésie-réanimation')}</span>${pr.rpps?`<span>RPPS ${e(pr.rpps)}</span>`:''}<span>${e(snap.etablissement||'')}</span></div><div class="pp-doc-date">Le ${e(date)}</div></header>
  <h2 class="pp-doc-title">${title}</h2>
  <p class="pp-doc-patient"><strong>${e([String(pa.nom||'').toUpperCase(),pa.prenom].filter(Boolean).join(' ')||'Patient')}</strong>${pa.naissance?` · né(e) le ${e(fmtShort(pa.naissance))}`:''}${snap.intervention?` · intervention prévue le ${e(fmtShort(snap.intervention))}`:''}</p>`;
 const sign=`<footer class="pp-doc-sign">${brouillon?'<p class="pp-doc-draft">Brouillon non signé</p>':`<p>Validée électroniquement par ${e(pr.nom||'le médecin')} le ${e(new Date(snap.signeLe).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))} · version ${e(snap.version||c.version)}</p>`}<div class="pp-doc-sign-box"><span>Signature</span></div></footer>`;
 const bio=c.bilans.ids.length||c.bilans.autres?`<section class="pp-doc-sec"><h3>Examens à réaliser${c.bilans.avant?` avant le ${e(fmtD(c.bilans.avant))}`:''}</h3><ul>${c.bilans.ids.map(id=>`<li>${e(BILAN[id].label)}</li>`).join('')}${c.bilans.autres?`<li class="pp-pre">${e(c.bilans.autres)}</li>`:''}</ul>${c.bilans.notes?`<p class="pp-pre">${e(c.bilans.notes)}</p>`:''}<p class="pp-doc-note">Résultats à apporter le jour de l’intervention s’ils ne sont pas transmis directement par le laboratoire.</p></section>`:'';
 const med=c.premed.length?`<section class="pp-doc-sec"><h3>Médicaments</h3><ol>${c.premed.map(r=>`<li><strong>${e(r.drug)}</strong><span>${e(r.dose)}</span><em>${e(r.moment)}</em></li>`).join('')}</ol></section>`:'';
 const tr=c.traitements.items.filter(x=>x.include);
 const sec=(t,lines)=>lines.length?`<section class="pp-doc-sec"><h3>${t}</h3><ul>${lines.map(l=>`<li class="pp-pre">${l}</li>`).join('')}</ul></section>`:'';
 const consignes=[
  sec('Vos traitements habituels',[...tr.map(x=>`<strong>${e(x.label)}</strong> : ${e(x.text)}`),...(c.traitements.libre?[e(c.traitements.libre)]:[])]),
  sec('Douche avant l’intervention',texteDouche(c.douche).map(e)),
  sec('Jeûne',texteJeune(c.jeune).map(e)),
  sec('Autres consignes',c.autres?[e(c.autres)]:[])
 ].join('');
 const ordo=bio||med?`<article class="pp-doc pp-doc-ordo">${head('Ordonnance')}${bio}${med}${sign}</article>`:'';
 const cons=consignes?`<article class="pp-doc pp-doc-consignes">${head('Consignes pour préparer votre intervention')}${consignes}<p class="pp-doc-note">En cas de fièvre, de problème de santé ou de question avant l’intervention, appelez la clinique. En cas d’urgence, appelez le 15.</p>${sign}</article>`:'';
 return ordo+cons||'<p>Aucune prescription.</p>';
}

/* ---------- Validité du lien patient ---------- */
// Jusqu'à 7 jours après l'intervention, au moins 48 h, au plus 30 jours.
function expiration(surgeryDate,now=new Date()){
 const max=now.getTime()+30*86400000,min=now.getTime()+48*3600000;
 let t=isDate(surgeryDate)?new Date(surgeryDate+'T23:59:00').getTime()+7*86400000:max;
 return new Date(Math.max(min,Math.min(max,t))).toISOString();
}

return {BILANS,BILAN,MOMENTS,PREMED_SUGGESTIONS,vide,normaliser,canonique,texteJeune,texteDouche,suggestions,traitementsProposes,alertesAllergies,controler,documentHTML,expiration,isDate,isTime,fmtD};
});

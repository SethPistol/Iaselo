/* IASELO · règles de la visite pré-anesthésique (VPA). Fonctions pures, partagées navigateur / tests.
   Cadre : art. D.6124-91 et D.6124-92 du code de la santé publique (décret 94-1050) : la consultation pré-anesthésique
   a lieu plusieurs jours avant une intervention programmée et ne remplace pas la VPA, réalisée par un médecin
   anesthésiste-réanimateur dans les heures précédant le moment prévu pour l'intervention.
   Seuils (jeûne, constantes, RAI, glycémie) : valeurs par défaut à faire relire par l'équipe d'anesthésie. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloVpa=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const H=3600000;
const SEUILS={
 jeuneSolidesH:6,jeuneLiquidesH:2,jeuneLaitMaternelH:4,
 vpaMaxAvantH:24,          // au-delà : la visite n'est plus « dans les heures précédant » l'intervention
 cpaMinAvantH:48,          // consultation programmée : « plusieurs jours avant »
 temperature:38, spo2:94, pasMax:180, padMax:110, fcMax:120, fcMin:45,
 glycemieMin:0.7, glycemieMax:2.5, // g/L
 raiH:72, raiEtendueJ:21    // RAI : 72 h, ou 21 jours sans transfusion, grossesse ni greffe dans les 6 mois
};
const QUESTIONS=[
 ['infection','Fièvre ou infection récente (ORL, bronchique, urinaire, cutanée)'],
 ['cardioResp','Nouveau symptôme cardiorespiratoire (douleur thoracique, dyspnée, palpitations, malaise)'],
 ['traitement','Nouveau traitement ou traitement modifié depuis la consultation'],
 ['evenement','Hospitalisation, chute ou autre événement intercurrent'],
 ['grossesse','Grossesse possible']
];
const PREPARATION=[
 ['douche','Douche préopératoire réalisée selon la prescription'],
 ['depilation','Pas de rasage ; dépilation conforme si nécessaire'],
 ['bijoux','Bijoux, piercings, vernis et maquillage retirés'],
 ['protheses','Prothèses dentaires, auditives, lunettes ou lentilles retirées ou signalées'],
 ['marquage','Marquage du site opératoire vérifié (côté / niveau)'],
 ['premed','Prémédication administrée selon la prescription'],
 ['accompagnant','Ambulatoire : accompagnant et nuit suivante confirmés']
];
const CONCLUSIONS=[
 ['apte','Apte, plan d’anesthésie inchangé'],
 ['modifie','Apte, plan d’anesthésie modifié'],
 ['report','Report ou annulation de l’intervention']
];
const LIEUX=['Chambre','Unité ambulatoire','Salle de pré-anesthésie','Bloc opératoire'];
const STATUTS_TRT=['Respecté','Non respecté','Non vérifié'];
const STATUTS_RES=['Reçu, normal','Reçu, anormal','Non reçu'];

const str=(v,n=600)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n):'';
const isDT=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)&&!isNaN(new Date(v));
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(new Date(v+'T12:00:00'));
const isTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const num=v=>{if(v===''||v==null)return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const pick=(v,list)=>list.includes(v)?v:'';
const yn=v=>pick(v,['Oui','Non']);
const fmtH=h=>{const t=Math.max(0,Math.round(h*60)),hh=Math.floor(t/60),mm=t%60;return hh+' h'+(mm?' '+String(mm).padStart(2,'0'):'')};

function normaliser(d){
 d=d&&typeof d==='object'?d:{};const q=d.questions||{},j=d.jeune||{},e=d.examen||{},p=d.preparation||{},c=d.conclusion||{},r=d.rai||{};
 const t=Array.isArray(d.traitements)?d.traitements:[],res=Array.isArray(d.resultats)?d.resultats:[];
 return {
  version:Math.max(1,Math.floor(num(d.version)||1)),
  at:isDT(d.at)?d.at:'',lieu:pick(d.lieu,LIEUX),
  identite:{verifiee:d.identite?.verifiee===true,bracelet:d.identite?.bracelet===true},
  questions:Object.fromEntries(QUESTIONS.map(([k])=>[k,yn(q[k])])),evolution:str(d.evolution,1200),
  jeune:{solides:isDT(j.solides)?j.solides:'',liquides:isDT(j.liquides)?j.liquides:'',tabac:isDT(j.tabac)?j.tabac:'',note:str(j.note,300)},
  traitements:t.slice(0,30).map(x=>({id:str(x?.id,60),label:str(x?.label,160),consigne:str(x?.consigne,400),statut:pick(x?.statut,STATUTS_TRT),kind:str(x?.kind,20)})).filter(x=>x.id),
  traitementsMatin:yn(d.traitementsMatin),
  examen:{pas:num(e.pas),pad:num(e.pad),fc:num(e.fc),spo2:num(e.spo2),temp:num(e.temp),poids:num(e.poids),glycemie:num(e.glycemie),
   voies:pick(e.voies,['Inchangées','Modifiées']),voiesNote:str(e.voiesNote,400),clinique:str(e.clinique,800)},
  resultats:res.slice(0,30).map(x=>({id:str(x?.id,60),label:str(x?.label,160),statut:pick(x?.statut,STATUTS_RES),note:str(x?.note,300)})).filter(x=>x.id),
  rai:{date:isDate(r.date)?r.date:'',etendue:r.etendue===true},
  bhcg:pick(d.bhcg,['Négatif','Positif','Sans objet','Non fait']),
  preparation:Object.fromEntries(PREPARATION.map(([k])=>[k,pick(p[k],['Fait','Non fait','Sans objet'])])),
  consentement:yn(d.consentement),
  conclusion:{decision:pick(c.decision,CONCLUSIONS.map(x=>x[0])),modifications:str(c.modifications,1200),bloc:str(c.bloc,1200),motif:str(c.motif,600)},
  acquittees:Array.isArray(d.acquittees)?[...new Set(d.acquittees.map(x=>str(x,60)).filter(Boolean))].slice(0,40):[],
  motifAlertes:str(d.motifAlertes,600)
 };
}
// Ordre de clés stable pour l'empreinte SHA-256 de la version signée.
function canonique(v){if(Array.isArray(v))return '['+v.map(canonique).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonique(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v)}

// Heure prévue de l'intervention (date + heure locales), ou null.
function heureIntervention(date,heure){if(!isDate(date))return null;return new Date(date+'T'+(isTime(heure)?heure:'08:00'))}
const heures=(a,b)=>a&&b?(b-a)/H:null;

/* ---------- Jeûne ---------- */
function jeune(j,{intervention=null,maintenant=new Date(),age=null}={}){
 const ref=intervention&&intervention>maintenant?intervention:maintenant,lignes=[];let niveau='ok';
 const one=(t,seuil,label)=>{if(!isDT(t)){lignes.push({label,niveau:'warn',texte:'Heure non renseignée'});if(niveau==='ok')niveau='warn';return}
  const h=heures(new Date(t),ref),ok=h>=seuil;lignes.push({label,niveau:ok?'ok':'crit',heures:h,texte:`${fmtH(h)} ${intervention&&intervention>maintenant?'à l’heure prévue':'à cet instant'} (repère : ${seuil} h)`});if(!ok)niveau='crit'};
 one(j.solides,SEUILS.jeuneSolidesH,'Solides, lait, boisson non claire');
 one(j.liquides,SEUILS.jeuneLiquidesH,'Liquides clairs');
 if(isDT(j.tabac))lignes.push({label:'Tabac / vapotage',niveau:'info',texte:'Dernière prise il y a '+fmtH(heures(new Date(j.tabac),maintenant))+' : pas un motif de report à lui seul'});
 // Heure à partir de laquelle le jeûne sera conforme, quand il ne l'est pas encore.
 let conformeA=null;if(niveau==='crit'){const s=isDT(j.solides)?new Date(j.solides).getTime()+SEUILS.jeuneSolidesH*H:0,l=isDT(j.liquides)?new Date(j.liquides).getTime()+SEUILS.jeuneLiquidesH*H:0;conformeA=new Date(Math.max(s,l))}
 return {niveau,lignes,conformeA,pediatrie:age!=null&&age<18?'Enfant : lait maternel 4 h, lait infantile 6 h, liquides clairs jusqu’à 1 h selon le protocole local.':''};
}

/* ---------- Constantes du jour ---------- */
function constantes(e){
 const a=[];
 if(e.temp!=null&&e.temp>=SEUILS.temperature)a.push({id:'fievre',niveau:'crit',texte:`Température ${e.temp} °C : rechercher un foyer infectieux avant l’intervention.`});
 if(e.spo2!=null&&e.spo2<SEUILS.spo2)a.push({id:'spo2',niveau:'crit',texte:`SpO₂ ${e.spo2} % en air ambiant : à confronter à la valeur habituelle.`});
 if((e.pas!=null&&e.pas>=SEUILS.pasMax)||(e.pad!=null&&e.pad>=SEUILS.padMax))a.push({id:'hta',niveau:'crit',texte:`PA ${e.pas??'?'}/${e.pad??'?'} mmHg : HTA sévère (≥ ${SEUILS.pasMax}/${SEUILS.padMax}), report à discuter.`});
 if(e.fc!=null&&(e.fc>SEUILS.fcMax||e.fc<SEUILS.fcMin))a.push({id:'fc',niveau:'crit',texte:`FC ${e.fc} /min : hors des bornes ${SEUILS.fcMin}–${SEUILS.fcMax}, ECG à faire.`});
 if(e.glycemie!=null&&e.glycemie<SEUILS.glycemieMin)a.push({id:'hypo',niveau:'crit',texte:`Glycémie ${e.glycemie} g/L : hypoglycémie à corriger (resucrage par liquide clair sucré).`});
 if(e.glycemie!=null&&e.glycemie>SEUILS.glycemieMax)a.push({id:'hyper',niveau:'warn',texte:`Glycémie ${e.glycemie} g/L : rechercher une cétose, correction selon le protocole.`});
 return a;
}

/* ---------- RAI ---------- */
function rai(r,intervention){
 if(!isDate(r.date))return null;
 const debut=new Date(r.date+'T00:00:00'),fin=new Date(debut.getTime()+(r.etendue?SEUILS.raiEtendueJ*24*H:SEUILS.raiH*H)),ref=intervention||new Date();
 return {fin,valide:ref<=fin,texte:`Valide jusqu’au ${fin.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})} ${fin.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} (${r.etendue?'21 jours : ni transfusion, ni grossesse, ni greffe dans les 6 mois':'72 h'})`};
}

/* ---------- Délais réglementaires ---------- */
function delais({vpaAt='',intervention=null,consultDate='',urgence=false}={}){
 const out=[];
 if(isDT(vpaAt)&&intervention){const h=heures(new Date(vpaAt),intervention);
  if(h<0)out.push({id:'vpaApres',niveau:'crit',texte:'Heure de VPA postérieure à l’heure prévue de l’intervention.'});
  else if(h>SEUILS.vpaMaxAvantH)out.push({id:'vpaTot',niveau:'warn',texte:`VPA ${fmtH(h)} avant l’intervention : le CSP la prévoit « dans les heures précédant » l’intervention (art. D.6124-92). À refaire le jour J si possible.`});}
 if(!urgence&&isDate(consultDate)&&intervention){const h=heures(new Date(consultDate+'T12:00:00'),intervention);
  if(h!=null&&h<SEUILS.cpaMinAvantH)out.push({id:'cpaTard',niveau:'warn',texte:'Consultation moins de 48 h avant une intervention programmée : le CSP prévoit « plusieurs jours avant ». Motif à tracer.'});}
 return out;
}

/* ---------- Synthèse : alertes et contrôle avant signature ---------- */
function alertes(d,ctx={}){
 const a=[],j=jeune(d.jeune,ctx);
 if(j.niveau==='crit')a.push({id:'jeune',niveau:'crit',texte:'Jeûne non conforme'+(j.conformeA?` : conforme à partir de ${j.conformeA.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`:'')+'.'});
 for(const [k,l] of QUESTIONS)if(d.questions[k]==='Oui')a.push({id:'q-'+k,niveau:k==='traitement'?'warn':'crit',texte:l+' : signalé.'});
 for(const t of d.traitements)if(t.statut==='Non respecté')a.push({id:'trt-'+t.id,niveau:/anticoag|antiagr|AOD|AVK|héparine/i.test(t.kind+' '+t.label)||t.kind==='stop'?'crit':'warn',texte:`${t.label} : consigne non respectée (${(t.consigne||'voir consignes').replace(/\.\s*$/,'')}).`});
 if(d.traitementsMatin==='Non')a.push({id:'matin',niveau:'warn',texte:'Traitements du matin non conformes aux consignes.'});
 a.push(...constantes(d.examen));
 if(d.examen.voies==='Modifiées')a.push({id:'voies',niveau:'warn',texte:'Voies aériennes modifiées depuis la consultation'+(d.examen.voiesNote?' : '+d.examen.voiesNote:'.')});
 for(const r of d.resultats){if(r.statut==='Non reçu')a.push({id:'res-'+r.id,niveau:'warn',texte:`${r.label} : résultat non reçu.`});if(r.statut==='Reçu, anormal')a.push({id:'res-'+r.id,niveau:'crit',texte:`${r.label} : résultat anormal${r.note?' ('+r.note+')':''}.`})}
 const ra=rai(d.rai,ctx.intervention);if(ra&&!ra.valide)a.push({id:'rai',niveau:'crit',texte:'RAI périmée à l’heure prévue de l’intervention : nouveau prélèvement.'});
 if(d.bhcg==='Positif')a.push({id:'bhcg',niveau:'crit',texte:'βHCG positif.'});
 if(ctx.ambulatoire&&d.preparation.accompagnant==='Non fait')a.push({id:'accomp',niveau:'crit',texte:'Ambulatoire sans accompagnant confirmé.'});
 if(d.preparation.marquage==='Non fait')a.push({id:'marquage',niveau:'warn',texte:'Marquage du site non vérifié : à faire par le chirurgien.'});
 if(d.consentement==='Non')a.push({id:'consentement',niveau:'crit',texte:'Le patient ne confirme pas son accord.'});
 if(!ctx.consentementSigne)a.push({id:'consentementSigne',niveau:'warn',texte:'Consentement d’anesthésie signé non reçu.'});
 a.push(...delais({vpaAt:d.at,intervention:ctx.intervention,consultDate:ctx.consultDate,urgence:ctx.urgence}));
 return a;
}
// Conditions de signature : champs minimaux, et chaque alerte critique acquittée (ou décision de report).
function controler(d,ctx={}){
 const errors=[],warnings=[],al=alertes(d,ctx);
 if(!isDT(d.at))errors.push('Heure de la visite manquante.');
 if(!d.identite.verifiee)errors.push('Identité non vérifiée avec le patient.');
 if(!isDT(d.jeune.solides)||!isDT(d.jeune.liquides))errors.push('Heures de dernière prise solide et liquide manquantes.');
 if(QUESTIONS.some(([k])=>k!=='grossesse'&&!d.questions[k]))errors.push('Interrogatoire incomplet (évolution depuis la consultation).');
 if(d.traitements.some(t=>!t.statut))warnings.push('Consignes sur les traitements non toutes vérifiées.');
 if(!d.consentement)errors.push('Confirmation de l’accord du patient manquante.');
 if(!d.conclusion.decision)errors.push('Conclusion de la visite manquante.');
 if(d.conclusion.decision==='report'&&d.conclusion.motif.length<5)errors.push('Motif du report obligatoire.');
 if(d.conclusion.decision==='modifie'&&d.conclusion.modifications.length<5)errors.push('Préciser la modification du plan d’anesthésie.');
 const crit=al.filter(x=>x.niveau==='crit'),nonAcq=crit.filter(x=>!d.acquittees.includes(x.id));
 if(d.conclusion.decision!=='report'&&nonAcq.length)errors.push(`${nonAcq.length} alerte${nonAcq.length>1?'s':''} critique${nonAcq.length>1?'s':''} à prendre en compte (cocher « pris en compte ») ou décider un report.`);
 if(d.conclusion.decision!=='report'&&crit.length&&d.motifAlertes.length<5)errors.push('Motif de poursuite malgré les alertes critiques obligatoire.');
 warnings.push(...al.filter(x=>x.niveau==='warn').map(x=>x.texte));
 return {ok:!errors.length,errors,warnings,alertes:al};
}

/* ---------- État de la VPA pour la complétude et le bandeau ---------- */
// x = rubrique de séjour `vpa` = {draft, signed, history}. dateIntervention = 'AAAA-MM-JJ'.
function etat(x,dateIntervention,maintenant=new Date()){
 const s=x?.signed;
 if(s){const report=s.decision==='report';return {code:report?'report':'signee',ok:!report,label:report?'Report décidé à la VPA':'VPA signée',detail:(report?'Report : ':'Signée par ')+(report?(s.motif||''):s.name||'')+(s.at?' · '+new Date(s.at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'')}}
 if(!isDate(dateIntervention))return {code:'na',ok:false,na:true,label:'VPA',detail:'Date d’intervention non renseignée'};
 const jours=Math.round((new Date(dateIntervention+'T12:00:00')-new Date(maintenant.getFullYear(),maintenant.getMonth(),maintenant.getDate(),12))/(24*H));
 if(jours>1)return {code:'na',ok:false,na:true,label:'VPA',detail:'À réaliser dans les heures précédant l’intervention'};
 return {code:x?.draft?.at?'encours':'afaire',ok:false,label:x?.draft?.at?'VPA en cours':'VPA à faire',detail:jours<0?'Intervention passée sans VPA signée':jours===0?'Intervention aujourd’hui':'Intervention demain'};
}

return {SEUILS,QUESTIONS,PREPARATION,CONCLUSIONS,LIEUX,STATUTS_TRT,STATUTS_RES,normaliser,canonique,heureIntervention,jeune,constantes,rai,delais,alertes,controler,etat,isDate,isDT,isTime,fmtH};
});

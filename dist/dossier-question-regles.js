/* IASELO · interroger le dossier (5e veille, lot 2).
   Moteur local, sans modèle génératif : la question est rapprochée d'une intention (allergies, constantes, dernière dose…)
   puis la réponse est construite UNIQUEMENT à partir des éléments du dossier, chacun avec sa source (rubrique + date).
   Rien ne sort du navigateur. Aucune interprétation médicale : on cite, on ne conclut pas.
   - faits(stay, {maintenant}) : éléments indexés du séjour ;
   - repondre(question, stay, {maintenant}) : {intention, titre, reponse, elements[], suggestions[]} ;
   - SUGGESTIONS : questions proposées. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloDossierQuestion=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const t=v=>v===undefined||v===null?'':String(v).trim();
const vide=v=>{const s=t(v);return !s||/^(non renseign[ée]e?|—|-|aucun\(e\)?)$/i.test(s)};
const norm=s=>t(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,' ');
const liste=v=>Array.isArray(v)?v.map(t).filter(Boolean):vide(v)?[]:[t(v)];
const ts=at=>{const s=t(at);if(!s)return NaN;if(/^\d{2}\/\d{2}\/\d{4}/.test(s)){const [d,m,y]=s.slice(0,10).split('/');return Date.parse(y+'-'+m+'-'+d+'T'+(s.slice(11,16)||'00:00'))}return Date.parse(s.length===10?s+'T00:00':s)};
const pad=n=>String(n).padStart(2,'0');
function quand(at){const n=ts(at);if(!Number.isFinite(n))return t(at);const d=new Date(n);return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+d.getHours()+' h '+pad(d.getMinutes())}
const SOURCES={consult:'Consultation d’anesthésie',postopVitals:'Surveillance postopératoire',rx:'Prescriptions',perop:'Feuille d’anesthésie',nursingRecord:'Dossier infirmier',notes:'Transmissions',events:'Historique du dossier',sortiePlus:'Sortie',discharge:'Sortie',cro:'Compte rendu opératoire',core:'Séjour',soinsPlus:'Soins',questionnaire:'Questionnaire du patient'};
// Onglet du dossier à ouvrir pour chaque source.
const ONGLETS={consult:'consult',postopVitals:'follow',rx:'rx',perop:'perop',nursingRecord:'follow',notes:'follow',events:'history',sortiePlus:'discharge',discharge:'discharge',cro:'operativeReport',core:'consult',soinsPlus:'follow',questionnaire:'consult'};
const PARAMS={sbp:'PA systolique',dbp:'PA diastolique',hr:'Fréquence cardiaque',rr:'Fréquence respiratoire',spo2:'SpO₂',temp:'Température',pain:'Douleur (EVA)',o2:'Oxygène',avpu:'Conscience',diurese:'Diurèse',glycemie:'Glycémie'};
const UNITE={hr:'/min',rr:'/min',spo2:' %',temp:' °C',pain:'/10',sbp:' mmHg',dbp:' mmHg',diurese:' mL',glycemie:' g/L'};

function vitals(stay){return (stay?.postopVitals||[]).filter(r=>r&&!r.voided&&r.values).slice().sort((a,b)=>ts(a.at)-ts(b.at))}
function administrations(stay){const out=[];for(const rx of stay?.rx||[])for(const e of rx.executions||[])out.push({rx,e,at:e.at});return out.sort((a,b)=>ts(a.at)-ts(b.at))}
function transmissions(stay){const out=[];
 for(const e of stay?.nursingRecord||[])if(e.kind==='transmission')out.push({at:e.occurredAt,auteur:e.authorLabel,texte:e.format==='DAR'?(e.target+' · D : '+e.observations+(e.actions?' · A : '+e.actions:'')+(e.results?' · R : '+e.results:'')):e.observations,source:'nursingRecord'});
 for(const n of stay?.notes||[])out.push({at:n.at,auteur:n.role,texte:(n.context?n.context+' · ':'')+n.note,source:'notes'});
 return out.sort((a,b)=>ts(a.at)-ts(b.at))}

function faits(stay,{maintenant=new Date()}={}){
 const F=[],add=(theme,libelle,valeur,source,at)=>{if(!vide(valeur))F.push({theme,libelle,valeur:t(valeur),source,sourceLib:SOURCES[source]||source,onglet:ONGLETS[source]||'',at:at||''})};
 const c=stay?.consult||{},cpa=c.cpa||{};
 add('intervention','Intervention',[cpa.libelle,cpa.cote].filter(x=>!vide(x)).join(' · ')||'', 'consult');
 add('intervention','Spécialité',stay?.specialty,'core');add('intervention','Étape du séjour',stay?.stage,'core');add('intervention','Chirurgien',cpa.chirurgien,'consult');add('intervention','Date prévue',cpa.date_interv,'consult');
 const allergenes=liste(cpa.allergenes);
 add('allergies','Allergies',c.allergies,'consult');add('allergies','Statut allergique',cpa.allergie_statut,'consult');
 if(allergenes.length)add('allergies','Allergènes',allergenes.join(', '),'consult');add('allergies','Détail des allergies',cpa.allergie_detail,'consult');
 add('antecedents','Antécédents',c.history,'consult');
 for(const [k,l] of [['cardio','Cardiovasculaires'],['resp','Respiratoires'],['metab','Métaboliques'],['neuro','Neurologiques'],['mtev','Thromboemboliques'],['autres_atcd','Autres']])if(liste(cpa[k]).length)add('antecedents','Antécédents '+l.toLowerCase(),liste(cpa[k]).join(', '),'consult');
 add('antecedents','Détail des antécédents',cpa.atcd_detail,'consult');add('antecedents','Antécédents chirurgicaux',cpa.atcd_chir,'consult');add('antecedents','Tabac',cpa.tabac,'consult');
 add('traitements','Traitements habituels',c.treatments,'consult');add('traitements','Traitement habituel (consultation)',cpa.ttt_habituel,'consult');add('traitements','Consignes sur le traitement',cpa.ttt_consignes,'consult');
 add('anesthesie','Score ASA',c.asa||cpa.asa,'consult');add('anesthesie','Mallampati',cpa.mallampati,'consult');add('anesthesie','Stratégie voies aériennes',cpa.strategie_vas,'consult');
 if(liste(cpa.technique).length||!vide(cpa.technique_detail))add('anesthesie','Technique prévue',[...liste(cpa.technique),t(cpa.technique_detail)].filter(Boolean).join(' · '),'consult');
 add('anesthesie','Plan d’anesthésie',c.plan,'consult');
 add('mesures','Poids',cpa.poids&&cpa.poids+' kg','consult');add('mesures','Taille',cpa.taille&&cpa.taille+' cm','consult');
 if(Number(cpa.poids)>0&&Number(cpa.taille)>0)add('mesures','IMC',(Number(cpa.poids)/((Number(cpa.taille)/100)**2)).toFixed(1)+' kg/m²','consult');
 if(liste(cpa.atb).length||!vide(cpa.atb_detail))add('antibiotiques','Antibioprophylaxie prévue',[...liste(cpa.atb),t(cpa.atb_detail)].filter(Boolean).join(' · '),'consult');
 for(const r of stay?.perop?.records||[])if(!r.voided&&r.kind==='Médicament'&&r.values?.drug)add('perop','Injecté au bloc',[r.values.drug,t(r.values.amount)&&(r.values.amount+' '+t(r.values.unit))].filter(Boolean).join(' '),'perop',r.at);
 for(const r of vitals(stay)){const v=r.values;const parts=Object.keys(PARAMS).filter(k=>!vide(v[k])).map(k=>(k==='sbp'&&!vide(v.dbp)?'PA '+v.sbp+'/'+v.dbp:k==='dbp'&&!vide(v.sbp)?'':PARAMS[k]+' '+v[k]+(UNITE[k]||''))).filter(Boolean);if(parts.length)add('constantes','Constantes',parts.join(' · '),'postopVitals',r.at)}
 for(const rx of stay?.rx||[])add('prescriptions',rx.validated?'Prescription validée':'Prescription en brouillon',rx.instructions||rx.name,'rx',rx.validatedAt||'');
 for(const {rx,e} of administrations(stay))add('administrations','Administration · '+t(e.status),[rx.posologie?.medicament||rx.name,e.dose,e.route].filter(x=>!vide(x)).join(' · ')+(e.author?' · par '+e.author:'')+(e.note?' · '+e.note:''),'rx',e.at);
 for(const x of transmissions(stay))add('transmissions','Transmission'+(x.auteur?' · '+x.auteur:''),x.texte,x.source,x.at);
 const sp=stay?.sortiePlus||{};add('sortie','Sortie prévue',vide(sp.sortiePrevue)?'':quand(sp.sortiePrevue),'sortiePlus');add('sortie','Chambre',sp.chambre||stay?.preadmission?.chambre,'sortiePlus');add('sortie','Synthèse de sortie',stay?.discharge?.summary,'discharge');add('sortie','Consignes de sortie',stay?.discharge?.instructions,'discharge');
 add('cro','Compte rendu opératoire',typeof stay?.cro==='string'?stay.cro:stay?.cro?.texte||stay?.cro?.text,'cro');
 for(const e of stay?.events||[])add('historique',t(e.kind)||'Historique',e.text,'events',e.at);
 return F;
}

const INTENTIONS=[
 ['allergies',/allerg|intoler|latex/,'Allergies'],
 ['antibiotiques',/antibio|cefazol|cefuroxim|clindamy|vancomy|augmentin|amoxicil|reinjection/,'Antibiotiques'],
 ['derniereDose',/derniere dose|a quelle heure.*(recu|donne|pris)|quand.*(recu|donne|pris|administre)|a-t-(il|elle) (recu|eu|pris)|deja (recu|eu|pris)|administr/,'Administrations'],
 ['constantes',/constante|tension|pression|\bpa\b|frequence|pouls|\bfc\b|\bfr\b|spo2|saturation|temperature|fievre|febrile|douleur|\beva\b|diurese|glycemie|conscience|news/,'Constantes'],
 ['traitements',/traitement(s)? (habituel|personnel|a domicile|du domicile)|domicile|anticoag|antiagreg|ttt habituel|ordonnance habituelle/,'Traitements habituels'],
 ['prescriptions',/prescri|traitement en cours|ordonnance|protocole|si besoin|antalg/,'Prescriptions en cours'],
 ['antecedents',/antecedent|\batcd\b|histoire|maladie|diabet|hypertens|\bhta\b|asthme|apnee|tabac|cardiopath/,'Antécédents'],
 ['anesthesie',/\basa\b|mallampati|intubation|voies aeriennes|anesthesie prevue|technique|rachi|ALR|plan d anesth/i,'Anesthésie'],
 ['mesures',/poids|taille|\bimc\b|corpulence/,'Poids et taille'],
 ['transmissions',/transmis|releve|nuit|s est passe|evenement|dernieres? nouvelles|observation/,'Transmissions'],
 ['sortie',/sortie|sortir|chambre|rentrer|domicile prevu/,'Sortie'],
 ['intervention',/interven|operation|opere|chirurg|cote|bloc|date/,'Intervention'],
 ['perop',/peroperatoire|pendant l intervention|au bloc|feuille d anesth/,'Bloc'],
];
const PARAM_Q=[['temp',/temperature|fievre|febrile|\bt\b/],['pain',/douleur|\beva\b|mal/],['spo2',/spo2|saturation|oxyg/],['hr',/pouls|\bfc\b|frequence cardiaque|cardiaque/],['rr',/\bfr\b|frequence respiratoire|respir/],['sbp',/tension|pression|\bpa\b/],['diurese',/diurese|urine/],['glycemie',/glycemie|sucre/],['avpu',/conscience|vigilance/]];

const SUGGESTIONS=['Allergies ?','Dernières constantes','Douleur sur 24 h','Dernière dose de paracétamol','Traitements habituels','Prescriptions en cours','Antécédents','Antibioprophylaxie','Transmissions de la nuit','Sortie prévue'];
const MOTS_VIDES=new Set('le la les de des du un une et ou a au aux en est il elle t quel quelle quels quelles quoi qui que quand comment a-t-il a-t-elle son sa ses pour sur dans avec patient patiente dossier y on ce cette derniere dernier dernieres derniers il elle eu recu'.split(' '));
function mots(q){return norm(q).split(/[^a-z0-9]+/).filter(w=>w.length>2&&!MOTS_VIDES.has(w))}

function serieParam(stay,k,depuis){return vitals(stay).filter(r=>!vide(r.values[k])&&(!depuis||ts(r.at)>=depuis)).map(r=>({at:r.at,v:r.values[k],dbp:r.values.dbp}))}

const resume=el=>el.slice(0,3).map(f=>f.libelle+' : '+f.valeur.replace(/[.\s]+$/,'')+(f.at?' ('+quand(f.at)+')':'')).join(' · ')+'.';
function repondre(question,stay,{maintenant=new Date()}={}){
 const q=norm(question),now=maintenant instanceof Date?maintenant.getTime():Date.parse(maintenant),F=faits(stay,{maintenant});
 const res=(intention,titre,reponse,elements)=>({intention,titre,reponse,elements:elements.slice(0,12),suggestions:SUGGESTIONS});
 if(!q)return res('vide','Posez une question','Exemples : « allergies ? », « dernière dose de paracétamol », « douleur sur 24 h ».',[]);
 const hit=INTENTIONS.find(([,re])=>re.test(q));const intention=hit?.[0]||'recherche';
 const du=th=>F.filter(f=>f.theme===th);
 if(intention==='derniereDose'||(intention==='prescriptions'&&/derniere|recu|donne/.test(q))){
  const m=mots(q).filter(w=>!/dose|heure|donne|administr|prise|pris/.test(w));
  const adm=administrations(stay).filter(({rx})=>!m.length||m.some(w=>norm(rx.posologie?.medicament||rx.name).includes(w)||(w==='paracetamol'&&/doliprane|dafalgan|efferalgan|perfalgan|paracetamol/.test(norm(rx.name)))));
  const el=du('administrations').filter(f=>adm.some(a=>a.e.at===f.at&&f.valeur.startsWith(t(a.rx.posologie?.medicament||a.rx.name))));
  const faites=adm.filter(a=>a.e.status==='Réalisée');
  if(!adm.length)return res(intention,'Administrations',m.length?'Aucune administration tracée pour « '+m.join(' ')+' » dans ce séjour.':'Aucune administration tracée dans ce séjour.',du('prescriptions'));
  const d=faites.at(-1);
  return res(intention,'Administrations',d?'Dernière dose donnée : '+t(d.rx.posologie?.medicament||d.rx.name)+(d.e.dose?' '+d.e.dose:'')+' le '+quand(d.e.at)+(d.e.author?' par '+d.e.author:'')+'. '+faites.length+' dose(s) donnée(s) au total.':'Aucune dose réalisée : '+adm.length+' administration(s) tracée(s) avec un autre statut.',el.reverse());
 }
 if(intention==='constantes'){
  const p=PARAM_Q.find(([,re])=>re.test(q))?.[0];const sur24=/24|journee|depuis|evolution|courbe|tendance|nuit/.test(q);
  if(p){const depuis=sur24?now-24*3600e3:0,s=serieParam(stay,p,depuis);
   if(!s.length)return res(intention,PARAMS[p],'Aucune valeur de '+PARAMS[p].toLowerCase()+' relevée'+(sur24?' sur les dernières 24 h.':' dans ce séjour.'),[]);
   const last=s.at(-1),num=s.map(x=>Number(String(x.v).replace(',','.'))).filter(Number.isFinite);
   const val=x=>p==='sbp'&&!vide(x.dbp)?x.v+'/'+x.dbp+(UNITE.sbp):x.v+(UNITE[p]||'');
   let txt='Dernière valeur : '+val(last)+' le '+quand(last.at)+'.';
   if(num.length>1)txt+=' Sur '+(sur24?'24 h':'le séjour')+' : '+num.length+' relevés, minimum '+Math.min(...num)+(UNITE[p]||'')+', maximum '+Math.max(...num)+(UNITE[p]||'')+'.';
   return res(intention,PARAMS[p],txt,s.slice().reverse().map(x=>({theme:'constantes',libelle:PARAMS[p],valeur:val(x),source:'postopVitals',sourceLib:SOURCES.postopVitals,onglet:'follow',at:x.at})));
  }
  const el=du('constantes').reverse();
  return res(intention,'Constantes',el.length?'Dernier relevé ('+quand(el[0].at)+') : '+el[0].valeur+'.':'Aucune constante relevée dans ce séjour.',el);
 }
 if(intention==='antibiotiques'){const el=[...du('antibiotiques'),...du('perop').filter(f=>/cef|cefa|cefu|clinda|vanco|amox|augment|genta|metroni|cefox/.test(norm(f.valeur))),...du('prescriptions').filter(f=>/cef|clinda|vanco|amox|augment|genta|metroni|cefox/.test(norm(f.valeur)))];
  return res(intention,'Antibiotiques',el.length?resume(el):'Aucun antibiotique prévu, injecté ou prescrit n’est tracé.',el)}
 if(intention!=='recherche'){
  const el=intention==='transmissions'?[...du('transmissions')].reverse():intention==='perop'?du('perop'):du(intention);
  const titre=hit[2];
  if(intention==='allergies'){const s=norm(stay?.consult?.allergies);const txt=!el.length||/a verifier/.test(s)?'Allergies non vérifiées : à demander au patient.':/aucun|pas d/.test(s)&&el.length===1?'Aucune allergie connue.':el.map(f=>f.valeur).join(' · ');return res(intention,titre,txt,el)}
  if(intention==='transmissions'&&/nuit/.test(q)){const nuit=el.filter(f=>{const d=new Date(ts(f.at));return now-ts(f.at)<24*3600e3&&(d.getHours()>=20||d.getHours()<8)});return res(intention,'Transmissions de la nuit',nuit.length?nuit.length+' transmission(s) entre 20 h et 8 h.':'Aucune transmission saisie la nuit dernière.',nuit.length?nuit:el.slice(0,3))}
  if(intention==='prescriptions'){const v=el.filter(f=>f.libelle==='Prescription validée');return res(intention,titre,el.length?v.length+' prescription(s) validée(s), '+(el.length-v.length)+' en brouillon.':'Aucune prescription dans ce séjour.',el)}
  return res(intention,titre,el.length?el.map(f=>f.libelle+' : '+f.valeur).slice(0,3).join(' · '):'Rien de renseigné dans le dossier pour « '+titre.toLowerCase()+' ».',el);
 }
 // Recherche libre : rapprochement par mots.
 const m=mots(q);if(!m.length)return res('recherche','Recherche dans le dossier','Précisez votre question (un médicament, une constante, un antécédent…).',[]);
 const sc=F.map(f=>{const txt=norm(f.libelle+' '+f.valeur);return {f,n:m.filter(w=>txt.includes(w)).length}}).filter(x=>x.n).sort((a,b)=>b.n-a.n||(ts(b.f.at)||0)-(ts(a.f.at)||0));
 return res('recherche','Recherche dans le dossier',sc.length?sc.length+' élément(s) mentionnent « '+m.join(' ')+' ». '+resume(sc.map(x=>x.f).slice(0,2)):'Aucun élément du dossier ne mentionne « '+m.join(' ')+' ».',sc.map(x=>x.f));
}

return {faits,repondre,SUGGESTIONS,SOURCES,norm,quand,vitals,administrations,transmissions,PARAMS,UNITE,ts};
});

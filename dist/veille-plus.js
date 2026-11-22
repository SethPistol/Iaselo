/* IASELO · suite des fonctionnalités de la veille marché (P1 restants, P2, P3).
   Branché par veille.js (window.createVeillePlus). Rubriques du séjour : preadmission, periopPlus, peropRapide,
   soinsPlus, sortiePlus, codage, iaTrace. Tout ce qui dépend d'un raccordement externe est étiqueté SIMULATION. */
(function(){
'use strict';
const P=window.IaseloReglesPlus,R=window.IaseloRegles;
const I={
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
 alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/></svg>',
 dot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>',
 wifi:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/></svg>',
 send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
 shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6Z"/></svg>',
 chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>',
 spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>'
};
const fmtDT=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
const fmtD=iso=>{const d=new Date(String(iso).length===10?iso+'T12:00:00':iso);return isNaN(d)?'':d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})};
const localNow=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
const head=(kicker,title,sub,right='')=>`<header class="v-head"><div><p class="v-kicker">${kicker}</p><h3>${title}</h3>${sub?`<p class="v-sub">${sub}</p>`:''}</div>${right}</header>`;
const card=(title,sub,body,right='',cls='')=>`<section class="v-card ${cls}"><header class="v-card-head"><div><h4>${title}</h4>${sub?`<p>${sub}</p>`:''}</div>${right}</header>${body}</section>`;
const sim=t=>`<span class="v-sim">Simulation · ${t}</span>`;

window.createVeillePlus=function(ctx,util){
 const {$,esc,toast,patients,current}=ctx,{who,can,trace,job,identity,goTab}=util;
 const obj=(stay,key)=>{if(!stay[key]||typeof stay[key]!=='object'||Array.isArray(stay[key]))stay[key]={};return stay[key]};
 const arr=(o,k)=>{if(!Array.isArray(o[k]))o[k]=[];return o[k]};
 const ext=stay=>stay.consult?.ext||{};
 const surgeryDate=stay=>ext(stay).surgeryDate||stay.surgicalAnnouncement?.published?.fields?.date||'';
 const operation=stay=>ext(stay).operation||stay.surgicalAnnouncement?.published?.fields?.procedure||stay.specialty||'';
 const seg=(name,options,value,dis)=>`<span class="v-seg" role="radiogroup">${options.map(([v,l])=>`<button type="button" role="radio" aria-checked="${String(value)===String(v)}" class="${String(value)===String(v)?'on yes':''}" data-seg="${esc(name)}" data-v="${esc(v)}" ${dis?'disabled':''}>${esc(l)}</button>`).join('')}</span>`;
 const bindSeg=(root,onPick)=>root.querySelectorAll('[data-seg]').forEach(b=>b.onclick=()=>onPick(b.dataset.seg,b.dataset.v));

 const TABS={
  preadmission:['consultation','Préadmission & pièces',0],
  bilansVpa:['consultation','Bilans guidés & VPA',3],
  blocRapide:['peroperatoire','Saisie rapide, doses & DMI',1],
  sspi:['peroperatoire','SSPI · score d’Aldrete',3],
  soinsPlus:['postoperatoire','Conciliation, protocoles & échelles',2],
  sortiePlus:['postoperatoire','Sortie : Chung, orientation, PROMs',6],
  codage:['postoperatoire','Codage PMSI proposé',9],
  synthese:['consultation','Synthèse assistée (traçable)',7]
 };

 /* ---------------- Préadmission ---------------- */
 function panelPreadmission(){
  const stay=current(),d=obj(stay,'preadmission'),pieces=obj(d,'pieces'),edit=can('preadmission');
  const list=P.piecesAttendues(stay),recues=list.filter(([k])=>pieces[k]?.recu).length;
  const rel=P.relances(surgeryDate(stay)),cost=P.resteACharge({...d.cout,ambulatoire:stay.mode==='Ambulatoire'});
  $('#content').innerHTML=`<div class="v-wrap">${head('Pré-admission · inspiré des espaces patients du marché','Pièces, relances, chambre et reste à charge','Le secrétariat voit d’un coup d’œil ce qui manque ; les relances partent à J-7 et J-3 ; le patient connaît son reste à charge avant l’admission.',`<span class="v-go ${recues===list.length?'v-ok':'v-warn'}">${recues===list.length?I.check:I.alert}${recues} / ${list.length} pièces</span>`)}
  <div class="v-two">
  ${card('Pièces du dossier administratif','Cocher à réception ; la date et la personne sont tracées.',`<ul class="v-checklist v-one">${list.map(([k,l])=>{const p=pieces[k];return `<li class="${p?.recu?'is-ok':'is-todo'}"><span class="v-ic">${p?.recu?I.check:I.alert}</span><span><b>${esc(l)}</b><small>${p?.recu?'Reçue le '+esc(fmtDT(p.at))+' · '+esc(p.by):'Manquante'}</small></span>${edit?`<button type="button" class="secondary" data-piece="${k}">${p?.recu?'Annuler':'Reçue'}</button>`:''}</li>`}).join('')}</ul>`)}
  ${card('Relances automatiques','SMS générique via Brevo : « pensez à compléter votre dossier d’admission ». Aucune donnée de santé.',rel.length?`<ul class="v-log v-big">${rel.map(r=>{const s=(d.relances||[]).find(x=>x.kind===r.kind);return `<li class="${s?.sent?'is-ok':'is-na'}">${s?.sent?I.check:I.dot}<span><b>${r.kind.toUpperCase()}</b> · ${esc(fmtD(r.date))}${s?' · '+esc(s.detail):''}</span>${edit&&recues<list.length?`<button type="button" class="secondary" data-relance="${r.kind}">${I.send}Envoyer maintenant</button>`:''}</li>`}).join('')}</ul>`:'<p class="v-empty">Renseignez la date opératoire pour planifier les relances.</p>')}
  </div>
  <div class="v-two">
  ${card('Chambre demandée','Reprise dans la gestion des lits.',`<div class="v-form v-form-1"><label><span>Type de chambre</span><select data-f="chambre" ${edit?'':'disabled'}>${['','Chambre particulière','Chambre double','Box ambulatoire','Soins continus'].map(o=>`<option ${d.chambre===o?'selected':''}>${o}</option>`).join('')}</select></label><label><span>Demandes particulières</span><input data-f="demande" value="${esc(d.demande||'')}" ${edit?'':'disabled'} placeholder="Régime, accompagnant, accessibilité…"></label></div>`)}
  ${card('Estimation du reste à charge','Avant l’admission, après saisie de la prise en charge mutuelle.',`<div class="v-form">${[['nuits','Nuits prévues'],['prixChambre','Prix chambre particulière / nuit (€)'],['priseEnChargeChambre','Prise en charge mutuelle / nuit (€)'],['depassements','Dépassements d’honoraires (€)'],['priseEnChargeDepassements','Prise en charge des dépassements (€)']].map(([k,l])=>`<label><span>${l}</span><input type="number" min="0" step="1" data-cout="${k}" value="${esc(d.cout?.[k]??'')}" ${edit?'':'disabled'}></label>`).join('')}</div>
   <dl class="v-total"><div><dt>Chambre</dt><dd>${cost.chambre.toLocaleString('fr-FR')} €</dd></div><div><dt>Forfait journalier</dt><dd>${cost.forfait.toLocaleString('fr-FR')} €</dd></div><div><dt>Dépassements</dt><dd>${cost.depassements.toLocaleString('fr-FR')} €</dd></div><div class="v-total-main"><dt>Reste à charge estimé</dt><dd>${cost.total.toLocaleString('fr-FR')} €</dd></div></dl><p class="v-foot">${esc(cost.note)}</p>`)}
  </div>
  ${card('Rendez-vous Doctolib','Doctolib garde la prise de rendez-vous ; IASELO reprend le parcours.',`<div class="v-form v-form-1"><label><span>Coller le rendez-vous (texte de la confirmation)</span><textarea data-doctolib rows="2" ${edit?'':'disabled'} placeholder="Ex. : Consultation d’anesthésie le 24/11/2026 à 14:30">${esc(d.doctolibTexte||'')}</textarea></label></div>${d.doctolib?`<p class="v-ok-t">${I.check} Rendez-vous repris : ${esc(d.doctolib.motif)} le ${esc(fmtD(d.doctolib.date))} à ${esc(d.doctolib.heure)}</p>`:''}${edit?'<div class="v-actions"><button type="button" class="secondary" id="vp-doctolib">Reprendre le rendez-vous</button></div>':''}`,sim('connecteur Doctolib non contractualisé'))}
  </div>`;
  if(!edit)return;const c=$('#content');
  c.querySelectorAll('[data-piece]').forEach(b=>b.onclick=()=>{const k=b.dataset.piece;pieces[k]=pieces[k]?.recu?{recu:false}:{recu:true,at:new Date().toISOString(),by:who()};trace(stay,'Préadmission : '+list.find(x=>x[0]===k)[1]+(pieces[k].recu?' reçue':' annulée'),'Préadmission');panelPreadmission()});
  c.querySelectorAll('[data-f]').forEach(i=>i.onchange=()=>{d[i.dataset.f]=i.value});
  c.querySelectorAll('[data-cout]').forEach(i=>i.onchange=()=>{d.cout={...(d.cout||{}),[i.dataset.cout]:i.value};setTimeout(panelPreadmission)});
  c.querySelectorAll('[data-relance]').forEach(b=>b.onclick=async()=>{b.disabled=true;const kind=b.dataset.relance;let detail;try{const r=await fetch('/api/workspace/suivi/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stay:stay.id,kind})});const x=await r.json();detail=x.sent?'SMS envoyé à '+x.to:(x.error||'non envoyé');arr(d,'relances').push({kind,sent:!!x.sent,at:new Date().toISOString(),detail})}catch{detail='serveur injoignable'}toast('Relance '+kind.toUpperCase()+' : '+detail);panelPreadmission()});
  $('#vp-doctolib').onclick=()=>{const t=c.querySelector('[data-doctolib]').value;d.doctolibTexte=t;const m=t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})[h:](\d{2})/);if(!m){toast('Date et heure non reconnues (format JJ/MM/AAAA à HH:MM).');return}
   d.doctolib={date:`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`,heure:`${m[4].padStart(2,'0')}:${m[5]}`,motif:(t.split(/ le /i)[0]||'Rendez-vous').trim().slice(0,80),importe:new Date().toISOString(),by:who(),source:'simulation'};trace(stay,'Rendez-vous Doctolib repris (simulation)','Préadmission');panelPreadmission()};
 }

 /* ---------------- Bilans guidés & VPA ---------------- */
 function panelBilans(){
  const stay=current(),d=obj(stay,'periopPlus'),vpa=obj(d,'vpa'),edit=can('periopPlus')&&job()!=='infirmier';
  const b=P.bilansGuides(stay),ori=R.orientation(stay,stay.aideCpa?.inputs||{});
  const since=(stay.events||[]).filter(e=>stay.consult?.validation?.at?true:true).slice(0,5);
  const teleOk=ori.proposition.level==='ok';
  $('#content').innerHTML=`<div class="v-wrap">${head('Consultation et visite préanesthésique','Bilans guidés par règles et VPA en un écran','Pas d’examen systématique : seuls les examens justifiés par le terrain ou l’intervention sont proposés, avec leur motif.')}
  ${card('Examens proposés',esc(b.ref),b.none?'<p class="v-ok-t">'+I.check+' Aucun examen préopératoire justifié par les données actuelles.</p>':`<table class="v-table"><thead><tr><th>Examen</th><th>Motif</th><th>Décision</th></tr></thead><tbody>${b.list.map(x=>{const dec=(d.bilans||{})[x.exam];return `<tr><td><b>${esc(x.exam)}</b></td><td>${esc(x.why)}</td><td>${edit?seg('bilan:'+x.exam,[['Prescrit','Prescrire'],['Non retenu','Non retenu']],dec):esc(dec||'À décider')}</td></tr>`}).join('')}</tbody></table>`)}
  <div class="v-two">
  ${card('Téléconsultation d’anesthésie',teleOk?'Éligible d’après le questionnaire (ASA 1–2 probable, aucun drapeau).':'Non proposée : '+esc(ori.proposition.label.toLowerCase())+'.',`<p class="v-foot">Réservée aux patients à faible risque, si la clinique l’autorise. L’examen des voies aériennes reste à faire en présentiel (VPA).</p>`,`<span class="v-level ${teleOk?'v-ok':'v-warn'}">${teleOk?I.check+'Éligible':I.alert+'Présentiel'}</span>`)}
  ${card('Visite préanesthésique (VPA)','Ce qui a changé depuis la consultation, jeûne, consentement, résultats.',`<div class="v-form">
   <fieldset><legend>Changement depuis la consultation</legend>${seg('vpa:changement',[['Non','Aucun'],['Oui','Oui']],vpa.changement,!edit)}</fieldset>
   <fieldset><legend>Consentement / accord confirmé</legend>${seg('vpa:consentement',[['Oui','Oui'],['Non','Non']],vpa.consentement,!edit)}</fieldset>
   <label><span>Dernière prise solide</span><input type="datetime-local" data-vpa="solides" value="${esc(vpa.solides||'')}" ${edit?'':'disabled'}></label>
   <label><span>Dernière prise liquide clair</span><input type="datetime-local" data-vpa="liquides" value="${esc(vpa.liquides||'')}" ${edit?'':'disabled'}></label>
   <fieldset><legend>Traitements du matin conformes aux consignes</legend>${seg('vpa:traitements',[['Oui','Oui'],['Non','Non']],vpa.traitements,!edit)}</fieldset>
   <fieldset><legend>Résultats attendus reçus</legend>${seg('vpa:resultats',[['Oui','Oui'],['Non','Non'],['Sans objet','Sans objet']],vpa.resultats,!edit)}</fieldset>
   <label class="v-wide"><span>Commentaire</span><textarea data-vpa="note" rows="2" ${edit?'':'disabled'}>${esc(vpa.note||'')}</textarea></label></div>
   ${vpaJeune(vpa)}${vpa.signedBy?`<p class="v-ok-t">${I.check} VPA signée par ${esc(vpa.signedBy)} · ${esc(fmtDT(vpa.signedAt))}</p>`:edit?'<div class="v-actions"><button type="button" class="primary" id="vp-vpa">Signer la VPA</button></div>':''}`)}
  </div>
  ${card('Derniers événements du dossier','Pour repérer ce qui a changé depuis la consultation.',`<ul class="v-log">${since.map(e=>`<li class="is-na">${I.dot}<span>${esc(e.at)} · ${esc(e.text)}</span></li>`).join('')||'<li class="is-na">Aucun événement.</li>'}</ul>`)}</div>`;
  if(!edit)return;const c=$('#content');
  bindSeg(c,(name,v)=>{const [g,k]=name.split(':');if(g==='bilan'){d.bilans={...(d.bilans||{}),[k]:d.bilans?.[k]===v?'':v}}else{vpa[k]=vpa[k]===v?'':v}panelBilans()});
  c.querySelectorAll('[data-vpa]').forEach(i=>i.onchange=()=>{vpa[i.dataset.vpa]=i.value;setTimeout(panelBilans)});
  const s=$('#vp-vpa');if(s)s.onclick=()=>{if(!vpa.consentement||!vpa.solides||!vpa.liquides){toast('Renseignez le jeûne et le consentement avant de signer.');return}Object.assign(vpa,{signedBy:who(),signedAt:new Date().toISOString()});trace(stay,'Visite préanesthésique signée','VPA');panelBilans()};
 }
 function vpaJeune(v){if(!v.solides&&!v.liquides)return '';const h=t=>t?(Date.now()-new Date(t))/3600000:null,s=h(v.solides),l=h(v.liquides);
  const ok=(s==null||s>=6)&&(l==null||l>=2);return `<p class="${ok?'v-ok-t':'v-crit-t'}">${ok?I.check:I.alert} Jeûne : ${s!=null?Math.floor(s)+' h depuis les solides':'solides non renseignés'} · ${l!=null?Math.floor(l)+' h depuis les liquides clairs':'liquides non renseignés'} (repères SFAR : 6 h et 2 h)</p>`}

 /* ---------------- Saisie rapide, doses, moniteur, DMI, stupéfiants, hors ligne ---------------- */
 const LS='iaselo-hors-ligne-';
 function backup(stay){try{localStorage.setItem(LS+stay.id,JSON.stringify({at:new Date().toISOString(),peropRapide:stay.peropRapide}))}catch{}}
 function panelBloc(){
  const stay=current(),d=obj(stay,'peropRapide'),edit=can('peropRapide'),e=ext(stay);
  const sex=e.sex==='Femme'?'F':e.sex==='Homme'?'M':null,ds=P.doses(e.weight,e.height,sex),ev=arr(d,'evenements'),dmi=arr(d,'dmi'),stup=arr(d,'stupefiants');
  const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
  let local=null;try{local=JSON.parse(localStorage.getItem(LS+stay.id)||'null')}catch{}
  const restore=local&&JSON.stringify(local.peropRapide)!==JSON.stringify(stay.peropRapide)&&(local.peropRapide?.evenements?.length||0)>ev.length;
  $('#content').innerHTML=`<div class="v-wrap">${offline?`<p class="v-offline">${I.wifi}<b>Hors ligne.</b> Les saisies sont conservées sur cette tablette et seront envoyées au retour du réseau.</p>`:''}${restore?`<p class="v-offline">${I.wifi}<b>${local.peropRapide.evenements.length-ev.length} saisie(s) hors ligne</b> retrouvée(s) sur cette tablette (${esc(fmtDT(local.at))}). <button type="button" class="secondary" id="vp-restore">Restaurer</button></p>`:''}
  ${head('Feuille d’anesthésie · saisie rapide','Un toucher par événement, doses au poids, traçabilité des implants','Inspiré des PDMS du marché (Diane, Innovian) : l’anesthésiste ne saisit que les événements et les médicaments.')}
  ${card('Événements','Horodatés à la seconde, auteur tracé.',`<div class="v-events">${P.EVENEMENTS.map(x=>{const done=ev.find(y=>y.label===x);return `<button type="button" class="v-event ${done?'is-done':''}" data-ev="${esc(x)}" ${edit?'':'disabled'}><b>${esc(x)}</b><small>${done?esc(fmtDT(done.at).slice(-5)):'—'}</small></button>`}).join('')}</div>`)}
  <div class="v-two">
  ${card('Doses au poids',ds.poids?`Poids ${ds.poids.total} kg · idéal ${ds.poids.ideal??'—'} kg · maigre ${ds.poids.maigre??'—'} kg · IMC ${String(ds.poids.bmi??'—').replace('.',',')}`:'Poids et taille à renseigner dans la consultation.',ds.list.length?`<table class="v-table"><thead><tr><th>Produit</th><th>Dose calculée</th><th>Base</th></tr></thead><tbody>${ds.list.map(x=>`<tr><td><b>${esc(x.label)}</b>${x.note?`<small>${esc(x.note)}</small>`:''}</td><td class="v-mono v-dose">${esc(x.dose)}</td><td><small>${x.poidsCalcul?esc(({total:'poids total',ideal:'poids idéal',maigre:'poids maigre'})[x.base])+' · ':''}${esc(x.ref)}</small></td></tr>`).join('')}</tbody></table><p class="v-foot">Aide au calcul : la dose administrée reste la décision de l’anesthésiste. Contrôle des interactions par base agréée (Vidal / BCB) : à contracter.</p>`:'')}
  ${card('Passerelle moniteurs','Acquisition automatique des constantes (HL7 / protocole constructeur).',`<p class="v-foot">La clinique doit lister ses moniteurs et respirateurs pour le raccordement. En attendant, une acquisition simulée ajoute des constantes fictives dans la feuille d’anesthésie.</p>${edit?'<div class="v-actions"><button type="button" class="secondary" id="vp-monitor">Simuler 15 min d’acquisition</button></div>':''}`,sim('aucun moniteur raccordé'))}
  </div>
  <div class="v-two">
  ${card('Dispositifs médicaux implantables','Scanner le code DataMatrix (GS1) : GTIN, lot, série, péremption.',`${edit?`<div class="v-form v-form-1"><label><span>Code scanné ou saisi</span><input id="vp-gs1" placeholder="(01)…(17)…(10)…(21)…" autocomplete="off"></label></div><div class="v-actions"><button type="button" class="secondary" id="vp-dmi">Enregistrer l’implant</button></div>`:''}<ul class="v-log">${dmi.map(x=>`<li class="${x.valide?'is-ok':'is-ko'}">${x.valide?I.check:I.alert}<span class="v-mono">GTIN ${esc(x.gtin||'?')} · lot ${esc(x.lot||'—')} · série ${esc(x.serie||'—')} · exp. ${esc(x.peremption||'—')}</span><small>${esc(fmtDT(x.at))} · ${esc(x.by)}</small></li>`).join('')||'<li class="is-na">Aucun implant.</li>'}</ul>`)}
  ${card('Registre des stupéfiants','Administration, reliquat et destruction devant témoin.',`${edit?`<div class="v-form"><label><span>Produit</span><select id="vp-stup-p">${['Sufentanil','Rémifentanil','Morphine','Oxycodone','Kétamine'].map(o=>`<option>${o}</option>`).join('')}</select></label><label><span>Lot</span><input id="vp-stup-l"></label><label><span>Administré</span><input id="vp-stup-a" placeholder="ex. 20 µg"></label><label><span>Reliquat détruit</span><input id="vp-stup-r" placeholder="ex. 30 µg"></label><label class="v-wide"><span>Témoin de la destruction</span><input id="vp-stup-t" placeholder="Nom du témoin"></label></div><div class="v-actions"><button type="button" class="secondary" id="vp-stup">Tracer</button></div>`:''}<ul class="v-log">${stup.map(x=>`<li class="is-ok">${I.check}<span>${esc(x.produit)} · lot ${esc(x.lot||'—')} · ${esc(x.administre)} administré · ${esc(x.reliquat||'0')} détruit (témoin ${esc(x.temoin||'—')})</span><small>${esc(fmtDT(x.at))} · ${esc(x.by)}</small></li>`).join('')||'<li class="is-na">Aucune ligne.</li>'}</ul>`)}
  </div></div>`;
  if(!edit)return;const c=$('#content');
  const save=()=>{backup(stay);panelBloc()};
  c.querySelectorAll('[data-ev]').forEach(b=>b.onclick=()=>{const label=b.dataset.ev,i=ev.findIndex(y=>y.label===label);if(i>=0){if(!confirm('Annuler l’horodatage « '+label+' » ?'))return;ev.splice(i,1)}else ev.push({label,at:new Date().toISOString(),by:who()});trace(stay,'Bloc : '+label,'Peropératoire');save()});
  const m=$('#vp-monitor');if(m)m.onclick=()=>{const pe=stay.perop??={context:{},records:[]};pe.records??=[];const now=Date.now();for(let k=15;k>=0;k-=5){const d0=new Date(now-k*60000);d0.setMinutes(d0.getMinutes()-d0.getTimezoneOffset());const sbp=105+Math.round(Math.random()*20),dbp=58+Math.round(Math.random()*10);pe.records.push({id:'PERI-'+crypto.randomUUID(),kind:'Surveillance',at:d0.toISOString().slice(0,16),author:'Passerelle moniteur (simulation)',created:new Date().toISOString(),role:'Simulation',values:{sbp:String(sbp),dbp:String(dbp),map:String(Math.round((sbp+2*dbp)/3)),hr:String(62+Math.round(Math.random()*12)),spo2:String(97+Math.round(Math.random()*2)),etco2:String(34+Math.round(Math.random()*4)),temp:'36.4',source:'Simulation passerelle'}})}trace(stay,'Acquisition moniteur simulée (4 mesures)','Peropératoire');toast('4 mesures fictives ajoutées à la feuille d’anesthésie');save()};
  $('#vp-dmi').onclick=()=>{const g=P.lireGS1($('#vp-gs1').value);if(!g.gtin){toast('Code GS1 non reconnu.');return}dmi.push({...g,at:new Date().toISOString(),by:who()});trace(stay,'Implant tracé · GTIN '+g.gtin+(g.lot?' · lot '+g.lot:''),'DMI');if(!g.valide)toast('Clé de contrôle du GTIN invalide : vérifiez le code.');save()};
  $('#vp-stup').onclick=()=>{const v=id=>$('#'+id).value.trim();if(!v('vp-stup-a')){toast('Indiquez la quantité administrée.');return}if(v('vp-stup-r')&&!v('vp-stup-t')){toast('Un témoin est requis pour la destruction.');return}stup.push({produit:v('vp-stup-p'),lot:v('vp-stup-l'),administre:v('vp-stup-a'),reliquat:v('vp-stup-r'),temoin:v('vp-stup-t'),at:new Date().toISOString(),by:who()});trace(stay,'Stupéfiant tracé : '+v('vp-stup-p'),'Stupéfiants');save()};
  const r=$('#vp-restore');if(r)r.onclick=()=>{stay.peropRapide=local.peropRapide;trace(stay,'Saisies hors ligne restaurées','Peropératoire');toast('Saisies restaurées · envoi au serveur en cours');panelBloc()};
 }
 if(typeof window!=='undefined'){window.addEventListener('offline',()=>{if(document.querySelector('.v-events'))panelBloc();toast('Réseau perdu : les saisies du bloc sont conservées sur cette tablette.')});window.addEventListener('online',()=>{toast('Réseau rétabli : synchronisation des saisies.');if(document.querySelector('.v-events'))panelBloc()})}

 /* ---------------- SSPI ---------------- */
 function grille(name,g,rep,dis){return `<ol class="v-has-items">${g.map(([k,l,opts])=>`<li><span>${esc(l)}</span>${seg(name+':'+k,opts.map((o,i)=>[i,i+' · '+o]),rep[k],dis)}</li>`).join('')}</ol>`}
 function panelSspi(){
  const stay=current(),d=obj(stay,'periopPlus'),s=obj(d,'sspi'),rep=obj(s,'aldrete'),edit=can('periopPlus'),sc=P.aldrete(rep);
  $('#content').innerHTML=`<div class="v-wrap">${head('Salle de surveillance post-interventionnelle','Score d’Aldrete, douleur, NVPO et sortie signée',esc(sc.ref),`<span class="v-go ${sc.sortie?'v-ok':sc.complete?'v-crit':'v-warn'}">${sc.sortie?I.check+'Critères de sortie atteints':I.alert+'Aldrete '+sc.total+' / '+sc.max}</span>`)}
  ${card('Score d’Aldrete modifié','',grille('ald',P.ALDRETE,rep,!edit))}
  <div class="v-two">${card('Douleur et NVPO','',`<div class="v-form"><label><span>EVA / EN (0 à 10)</span><input type="number" min="0" max="10" data-s="eva" value="${esc(s.eva??'')}" ${edit?'':'disabled'}></label><fieldset><legend>NVPO</legend>${seg('s:nvpo',[['Non','Non'],['Oui','Oui']],s.nvpo,!edit)}</fieldset></div>${s.eva>=4?`<p class="v-warn-t">${I.alert} EVA ≥ 4 : antalgie à adapter avant la sortie.</p>`:''}`)}
  ${card('Sortie de SSPI','Autorisée par un médecin anesthésiste.',s.signedBy?`<p class="v-ok-t">${I.check} Sortie autorisée par ${esc(s.signedBy)} · ${esc(fmtDT(s.signedAt))} · destination ${esc(s.destination)}</p>`:edit&&job()!=='infirmier'?`<div class="v-form v-form-1"><label><span>Destination</span><select id="vp-dest">${['Chambre','Ambulatoire (salon de sortie)','Soins continus','Réanimation'].map(o=>`<option>${o}</option>`).join('')}</select></label></div><div class="v-actions"><button type="button" class="primary" id="vp-sspi" ${sc.sortie?'':'disabled'}>Signer la sortie</button>${sc.sortie?'':'<small>Aldrete ≥ 9 sans item à 0 requis.</small>'}</div>`:'<p class="v-foot">Signature réservée au médecin anesthésiste.</p>')}</div></div>`;
  if(!edit)return;const c=$('#content');
  bindSeg(c,(name,v)=>{const [g,k]=name.split(':');if(g==='ald')rep[k]=String(rep[k])===v?'':Number(v);else s[k]=s[k]===v?'':v;panelSspi()});
  c.querySelectorAll('[data-s]').forEach(i=>i.onchange=()=>{s[i.dataset.s]=i.value===''?'':Number(i.value);setTimeout(panelSspi)});
  const b=$('#vp-sspi');if(b)b.onclick=()=>{Object.assign(s,{signedBy:who(),signedAt:new Date().toISOString(),destination:$('#vp-dest').value,score:sc.total});trace(stay,'Sortie de SSPI signée (Aldrete '+sc.total+')','SSPI');panelSspi()};
 }

 /* ---------------- Conciliation, protocoles, échelles ---------------- */
 function spark(points,max){if(points.length<2)return '';const w=220,h=46,x=i=>Math.round(i*(w-8)/(points.length-1))+4,y=v=>Math.round(h-4-(v/max)*(h-8));return `<svg class="v-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Évolution"><polyline points="${points.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>${points.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="2.6"/>`).join('')}</svg>`}
 function panelSoins(){
  const stay=current(),d=obj(stay,'soinsPlus'),edit=can('soinsPlus'),med=['anesthesiste','chirurgien'].includes(job())||!job();
  const conc=P.conciliation(stay),cv=obj(d,'conciliation'),prot=P.protocolesPour(operation(stay)),ech=arr(d,'echelles');
  const series=t=>ech.filter(x=>x.type===t);const last=t=>series(t).at(-1);
  const br=obj(d,'bradenSaisie'),mo=obj(d,'morseSaisie');
  $('#content').innerHTML=`<div class="v-wrap">${head('Soins et circuit du médicament','Conciliation d’entrée, protocoles postopératoires et échelles infirmières','La prescription reste dans un logiciel d’aide à la prescription certifié HAS : IASELO prépare et trace, il ne prescrit pas.')}
  ${card('Conciliation médicamenteuse d’entrée','Traitement déclaré par le patient, confronté à la consultation.',conc.length?`<table class="v-table"><thead><tr><th>Médicament déclaré</th><th>Retrouvé en consultation</th><th>Conduite à l’entrée</th></tr></thead><tbody>${conc.map((m,i)=>`<tr><td><b>${esc(m.nom)}</b><small>${esc([m.dosage,m.posologie,m.source].filter(Boolean).join(' · '))}</small></td><td>${m.retrouveCpa?`<span class="v-level v-ok">${I.check}Oui</span>`:`<span class="v-level v-warn">${I.alert}Écart</span>`}</td><td>${med&&edit?seg('conc:'+i,[['Poursuivi','Poursuivi'],['Suspendu','Suspendu'],['Modifié','Modifié']],cv[i]?.conduite,false):esc(cv[i]?.conduite||'À décider')}</td></tr>`).join('')}</tbody></table>`:'<p class="v-empty">Aucun traitement déclaré dans le questionnaire.</p>')}
  ${card('Protocoles postopératoires','Appliqués en un clic comme proposition, puis prescrits dans l’outil certifié.',prot.map(p=>{const used=(d.protocoles||[]).find(x=>x.id===p.id);return `<div class="v-proto"><div><b>${esc(p.label)}</b><ul>${p.lignes.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>${used?`<span class="v-level v-ok">${I.check}Appliqué · ${esc(used.by)}</span>`:med&&edit?`<button type="button" class="secondary" data-proto="${p.id}">Appliquer</button>`:''}</div>`}).join(''),sim('base médicamenteuse agréée à contracter'))}
  <div class="v-scales">
   ${scaleCard('Douleur (EN 0–10)','douleur',series('douleur'),10,edit,`<label><span>EN</span><input type="number" min="0" max="10" id="vp-en"></label>`,v=>v>=4?'warn':'ok')}
   ${scaleCard('Sédation (POSS 1–4)','sedation',series('sedation'),4,edit,`<label><span>Niveau</span><select id="vp-poss">${[['1','1 · éveillé'],['2','2 · légèrement somnolent'],['3','3 · somnolent, s’endort en parlant'],['4','4 · difficilement réveillable']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`,v=>v>=3?'crit':'ok')}
   ${card('Braden (escarres)',last('braden')?esc(last('braden').text)+' · '+last('braden').value+'/23':'Non évalué',`<div class="v-form">${P.BRADEN.map(([k,l,mx])=>`<label><span>${esc(l)} (1–${mx})</span><input type="number" min="1" max="${mx}" data-br="${k}" value="${esc(br[k]??'')}" ${edit?'':'disabled'}></label>`).join('')}</div>${spark(series('braden').map(x=>x.value),23)}${edit?'<div class="v-actions"><button type="button" class="secondary" id="vp-braden">Enregistrer</button></div>':''}`)}
   ${card('Morse (chutes)',last('morse')?esc(last('morse').text)+' · '+last('morse').value:'Non évalué',`<div class="v-form">${P.MORSE.map(([k,l,opts])=>`<label><span>${esc(l)}</span><select data-mo="${k}" ${edit?'':'disabled'}>${opts.map(o=>`<option ${String(mo[k])===String(o)?'selected':''}>${o}</option>`).join('')}</select></label>`).join('')}</div>${edit?'<div class="v-actions"><button type="button" class="secondary" id="vp-morse">Enregistrer</button></div>':''}`)}
  </div></div>`;
  if(!edit)return;const c=$('#content');
  bindSeg(c,(name,v)=>{const i=name.split(':')[1];cv[i]={conduite:cv[i]?.conduite===v?'':v,by:who(),at:new Date().toISOString(),nom:conc[i].nom};panelSoins()});
  c.querySelectorAll('[data-proto]').forEach(b=>b.onclick=()=>{const p=P.PROTOCOLES.find(x=>x.id===b.dataset.proto);arr(d,'protocoles').push({id:p.id,label:p.label,lignes:p.lignes,by:who(),at:new Date().toISOString(),statut:'Proposé, à prescrire dans l’outil certifié'});trace(stay,'Protocole proposé : '+p.label,'Protocole');panelSoins()});
  const addScale=(type,value,text)=>{ech.push({type,value,text,at:new Date().toISOString(),by:who()});trace(stay,'Échelle '+type+' : '+value,'Soins');panelSoins()};
  c.querySelector('[data-add="douleur"]')?.addEventListener('click',()=>{const v=Number($('#vp-en').value);if(!(v>=0&&v<=10)||$('#vp-en').value===''){toast('EN entre 0 et 10.');return}addScale('douleur',v)});
  c.querySelector('[data-add="sedation"]')?.addEventListener('click',()=>addScale('sedation',Number($('#vp-poss').value)));
  c.querySelectorAll('[data-br]').forEach(i=>i.onchange=()=>{br[i.dataset.br]=i.value});
  c.querySelectorAll('[data-mo]').forEach(i=>i.onchange=()=>{mo[i.dataset.mo]=i.value});
  $('#vp-braden').onclick=()=>{const r=P.braden(br);if(!r.complete){toast('Complétez les 6 items.');return}addScale('braden',r.total,r.text)};
  $('#vp-morse').onclick=()=>{const r=P.morse(mo);addScale('morse',r.total,r.text)};
 }
 function scaleCard(title,type,series,max,edit,input,lvl){const l=series.at(-1);return card(title,l?`Dernière : ${l.value} · ${esc(fmtDT(l.at))}`:'Aucune mesure',`${spark(series.map(x=>x.value),max)}${series.length?`<p class="v-scale-last v-${lvl(l.value)}">${l.value}<small>/${max}</small></p>`:''}${edit?`<div class="v-form v-form-inline">${input}<button type="button" class="secondary" data-add="${type}">Ajouter</button></div>`:''}`)}

 /* ---------------- Sortie : Chung, orientation, PROMs ---------------- */
 function panelSortie(){
  const stay=current(),d=obj(stay,'sortiePlus'),rep=obj(d,'chung'),edit=can('sortiePlus'),sc=P.chung(rep),proms=obj(d,'proms');
  $('#content').innerHTML=`<div class="v-wrap">${head('Sortie et suivi à distance','Score de Chung, sortie prévue, orientation SMR et PROMs à J30',esc(sc.ref),`<span class="v-go ${sc.sortie?'v-ok':'v-warn'}">${sc.sortie?I.check+'Apte à la sortie ambulatoire':I.alert+'Chung '+sc.total+' / '+sc.max}</span>`)}
  ${card('Score de sortie ambulatoire (PADSS, Chung)','Signé par le médecin ; accompagnant obligatoire la nuit suivante.',grille('chung',P.CHUNG,rep,!edit)+(d.chungSigne?`<p class="v-ok-t">${I.check} Sortie signée par ${esc(d.chungSigne.by)} · ${esc(fmtDT(d.chungSigne.at))}</p>`:edit&&job()!=='infirmier'?`<div class="v-actions"><button type="button" class="primary" id="vp-chung" ${sc.sortie?'':'disabled'}>Signer l’aptitude à la sortie</button></div>`:''))}
  <div class="v-two">
  ${card('Sortie prévue et lit','Repris dans la gestion des lits.',`<div class="v-form"><label><span>Date de sortie prévue</span><input type="date" data-d="sortiePrevue" value="${esc(d.sortiePrevue||'')}" ${edit?'':'disabled'}></label><label><span>Chambre</span><input data-d="chambre" value="${esc(d.chambre||'')}" placeholder="ex. 214" ${edit?'':'disabled'}></label></div>`)}
  ${card('Orientation SMR (ViaTrajectoire)','Transfert de contexte pour une demande de soins médicaux et de réadaptation.',d.viatrajectoire?`<p class="v-ok-t">${I.check} Demande ${esc(d.viatrajectoire.ref)} créée le ${esc(fmtDT(d.viatrajectoire.at))}</p>`:edit?`<div class="v-actions"><button type="button" class="secondary" id="vp-via">Créer la demande</button></div>`:'',sim('raccordement ViaTrajectoire à demander au GRADeS'))}
  </div>
  ${card('Résultats rapportés par le patient (PROMs) à J30','Indicateur qualité de la clinique ; recueil par appel ou questionnaire.',`<div class="v-form">${P.PROMS.map(([k,l])=>`<label><span>${esc(l)}</span><input type="number" min="0" max="10" data-p="${k}" value="${esc(proms[k]??'')}" ${edit?'':'disabled'}></label>`).join('')}</div>${proms.at?`<p class="v-foot">Recueilli le ${esc(fmtDT(proms.at))} par ${esc(proms.by)}</p>`:''}`)}</div>`;
  if(!edit)return;const c=$('#content');
  bindSeg(c,(name,v)=>{const k=name.split(':')[1];rep[k]=String(rep[k])===v?'':Number(v);panelSortie()});
  c.querySelectorAll('[data-d]').forEach(i=>i.onchange=()=>{d[i.dataset.d]=i.value});
  c.querySelectorAll('[data-p]').forEach(i=>i.onchange=()=>{proms[i.dataset.p]=i.value===''?'':Number(i.value);proms.at=new Date().toISOString();proms.by=who()});
  const b=$('#vp-chung');if(b)b.onclick=()=>{d.chungSigne={by:who(),at:new Date().toISOString(),score:sc.total};trace(stay,'Aptitude à la sortie ambulatoire signée (Chung '+sc.total+')','Sortie');panelSortie()};
  const v=$('#vp-via');if(v)v.onclick=()=>{d.viatrajectoire={ref:'SIM-VT-'+crypto.randomUUID().slice(0,6).toUpperCase(),at:new Date().toISOString(),by:who()};trace(stay,'Demande ViaTrajectoire créée (simulation)','Sortie');panelSortie()};
 }

 /* ---------------- Codage PMSI ---------------- */
 function panelCodage(){
  const stay=current(),d=obj(stay,'codage'),edit=can('codage'),dim=job()==='dim'||!job(),diag=P.diagnosticsProposes(stay),dec=obj(d,'decisions');
  const ev=stay.peropRapide?.evenements||[],acte=operation(stay);
  $('#content').innerHTML=`<div class="v-wrap">${head('PMSI · codage à la source','Actes confirmés en fin d’intervention, diagnostics associés validés par le DIM','Les propositions viennent du dossier ; aucun code n’est transmis sans validation humaine tracée (obligatoire pour l’ATIH).')}
  ${card('Actes','Confirmés par le praticien en fin d’intervention.',`<table class="v-table"><thead><tr><th>Acte</th><th>Activité</th><th>Code CCAM</th><th>Confirmation</th></tr></thead><tbody>${[['chir','Chirurgie : '+acte,'1 · chirurgien'],['anes','Anesthésie de cet acte','4 · anesthésiste']].map(([k,l,a])=>{const x=(d.actes||{})[k]||{};return `<tr><td><b>${esc(l)}</b>${ev.length?`<small>Durée bloc : ${dureeBloc(ev)}</small>`:''}</td><td>${esc(a)}</td><td>${edit?`<input class="v-mono" data-ccam="${k}" value="${esc(x.code||'')}" placeholder="à sélectionner" maxlength="7">`:esc(x.code||'—')}</td><td>${x.confirme?`<span class="v-level v-ok">${I.check}${esc(x.by)}</span>`:edit?`<button type="button" class="secondary" data-acte="${k}">Confirmer</button>`:'—'}</td></tr>`}).join('')}</tbody></table><p class="v-foot">Nomenclature CCAM officielle non intégrée : le code est saisi par le praticien (référentiel ATIH à brancher).</p>`)}
  ${card('Diagnostics associés proposés (CIM-10)','Repérés dans les antécédents du dossier ; validation du médecin DIM requise.',diag.length?`<table class="v-table"><thead><tr><th>Code</th><th>Libellé</th><th>Source</th><th>Décision DIM</th></tr></thead><tbody>${diag.map(x=>`<tr><td class="v-mono"><b>${esc(x.code)}</b></td><td>${esc(x.label)}</td><td><small>${esc(x.source)}</small></td><td>${dim&&edit?seg('dg:'+x.code,[['Retenu','Retenir'],['Rejeté','Rejeter']],dec[x.code]?.decision):esc(dec[x.code]?.decision||'En attente du DIM')}${dec[x.code]?.by?`<small>${esc(dec[x.code].by)} · ${esc(fmtDT(dec[x.code].at))}</small>`:''}</td></tr>`).join('')}</tbody></table>`:'<p class="v-empty">Aucun diagnostic associé repéré.</p>')}
  ${card('Export RSS / RUM','Format ATIH, contrôles de cohérence avant envoi.',`<div class="v-actions"><button type="button" class="secondary" id="vp-rss">Générer le RUM (fichier de contrôle)</button></div>`,sim('format ATIH à valider par le DIM'))}</div>`;
  if(!edit)return;const c=$('#content');
  bindSeg(c,(name,v)=>{const k=name.split(':')[1];dec[k]={decision:dec[k]?.decision===v?'':v,by:who(),at:new Date().toISOString()};trace(stay,'DIM : '+k+' '+v.toLowerCase(),'PMSI');panelCodage()});
  c.querySelectorAll('[data-ccam]').forEach(i=>i.onchange=()=>{d.actes={...(d.actes||{}),[i.dataset.ccam]:{...(d.actes?.[i.dataset.ccam]||{}),code:i.value.toUpperCase().trim(),confirme:false}}});
  c.querySelectorAll('[data-acte]').forEach(b=>b.onclick=()=>{const k=b.dataset.acte,x=d.actes?.[k]||{};if(!/^[A-Z]{4}\d{3}$/.test(x.code||'')){toast('Code CCAM attendu : 4 lettres et 3 chiffres.');return}d.actes[k]={...x,confirme:true,by:who(),at:new Date().toISOString()};trace(stay,'Acte '+x.code+' confirmé','PMSI');panelCodage()});
  $('#vp-rss').onclick=()=>{const retenus=diag.filter(x=>dec[x.code]?.decision==='Retenu');const actes=Object.values(d.actes||{}).filter(x=>x.confirme);const errs=[];if(!actes.length)errs.push('aucun acte confirmé');
   const lignes=['# RUM de contrôle · SIMULATION · ne pas transmettre','sejour='+stay.id,'mode='+stay.mode,'diagnostics_associes='+retenus.map(x=>x.code).join(','),'actes='+actes.map(x=>x.code).join(','),'controle='+(errs.length?'ERREURS : '+errs.join(', '):'OK')];
   const blob=new Blob([lignes.join('\n')],{type:'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rum-'+stay.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast(errs.length?'Fichier généré avec erreurs : '+errs.join(', '):'Fichier de contrôle généré')};
 }
 function dureeBloc(ev){const a=ev.find(x=>x.label==='Entrée en salle'),b=ev.find(x=>x.label==='Sortie de salle');if(!a||!b)return 'en cours';const m=Math.round((new Date(b.at)-new Date(a.at))/60000);return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')}

 /* ---------------- Synthèse assistée, traçable ---------------- */
 function panelSynthese(){
  const stay=current(),t=arr(stay,'iaTrace'),edit=can('iaTrace');
  const sc=R.scores(stay,stay.aideCpa?.inputs||{}),cons=stay.aideCpa?.consignes?.items||R.consignes(stay).items,c=stay.consult||{},e=ext(stay);
  const texte=[`${stay.identity?.firstName||''} ${String(stay.identity?.lastName||'').toUpperCase()}${e.age?', '+e.age+' ans':''}, ${operation(stay)} (${stay.mode}).`,
   c.asa&&c.asa!=='Non renseigné'?'ASA '+c.asa+'.':'ASA non renseignée.',
   sc.list.filter(s=>s.level==='crit'||s.level==='warn').map(s=>s.label+' '+s.value+'/'+s.max+' ('+s.text.toLowerCase()+')').join(' ; ')||'Aucun score à risque.',
   cons.filter(x=>x.kind!=='continue').map(x=>x.label+' : '+x.text).join(' ')||'Pas de traitement à adapter.',
   'Allergies : '+(c.allergies||'à vérifier')+'.'].join('\n');
  $('#content').innerHTML=`<div class="v-wrap">${head(I.spark+' Synthèse assistée','Résumé du dossier proposé, jamais appliqué sans validation','Chaque proposition est tracée (qui, quand, accepté ou rejeté). Génération par règles à partir du dossier ; une IA générative éventuelle relèvera de l’AI Act et du statut de dispositif médical.')}
  ${card('Proposition','',`<pre class="v-pre">${esc(texte)}</pre>${edit?'<div class="v-actions"><button type="button" class="primary" id="vp-ia-ok">Accepter et copier dans les notes de la consultation</button><button type="button" class="secondary" id="vp-ia-no">Rejeter</button></div>':''}`,'<span class="v-sim">Générée par règles · à relire</span>')}
  ${card('Traçabilité','',`<ul class="v-log">${t.slice().reverse().map(x=>`<li class="${x.decision==='Acceptée'?'is-ok':'is-ko'}">${x.decision==='Acceptée'?I.check:I.alert}<span>${esc(x.decision)} · ${esc(x.by)} · ${esc(fmtDT(x.at))}</span></li>`).join('')||'<li class="is-na">Aucune décision.</li>'}</ul>`)}</div>`;
  if(!edit)return;
  const decide=ok=>{t.push({decision:ok?'Acceptée':'Rejetée',by:who(),at:new Date().toISOString(),texte,source:'règles'});if(ok){c.ext??={};c.ext.vigilanceHandoff=[c.ext.vigilanceHandoff,'Synthèse : '+texte.replace(/\n/g,' ')].filter(Boolean).join('\n')}trace(stay,'Synthèse assistée '+(ok?'acceptée':'rejetée'),'Aide traçable');panelSynthese()};
  $('#vp-ia-ok').onclick=()=>decide(true);$('#vp-ia-no').onclick=()=>decide(false);
 }

 /* ---------------- Vue Pilotage : bloc, lits, qualité ---------------- */
 function renderPilotage(){
  util.viewHeader('Pilotage & qualité','pilotage');
  const ind=P.indicateursBloc(patients),q=P.iqss(patients);
  const lits=patients.filter(s=>['Hospitalisation','SSPI','Intervention','Préopératoire'].includes(s.stage)||['chambre','sspi','salle'].includes(s.blocStatut?.state));
  const nett=Object.fromEntries(patients.map(s=>[s.id,s.bionettoyage?.etat==='fait'?s.bionettoyage:null]));
  $('#workspace').innerHTML=`<div class="v-wrap">${head(I.chart+' Pilotage du bloc et qualité','Occupation, horodatages et indicateurs HAS','Calculés à partir des horodatages de la tour de contrôle et des dossiers ; indicateurs ANAP (occupation, débordements) et IQSS (certification).')}
  <div class="v-kpis">${[['Passages au bloc',ind.passages,''],['Interventions terminées',ind.termines,''],['Temps de salle',ind.minutes,'min'],['Occupation (vacation 10 h)',ind.occupation,'%'],['Première entrée en salle',ind.premiereEntree?fmtDT(ind.premiereEntree).slice(-5):'—','']].map(([l,v,u])=>`<div class="v-kpi"><span>${l}</span><strong>${esc(v)}<small>${u}</small></strong></div>`).join('')}</div>
  ${card('Indicateurs qualité (IQSS)','Cibles de l’établissement à ajuster.',`<div class="v-iqss">${q.map(x=>`<div class="v-iq"><div class="v-iq-top"><b>${esc(x.label)}</b><span class="v-level ${x.pct==null?'v-na':x.pct>=x.cible?'v-ok':'v-warn'}">${x.pct==null?'Sans objet':x.pct>=x.cible?I.check+'Atteint':I.alert+'Sous la cible'}</span></div><div class="v-bar"><i style="width:${x.pct??0}%"></i><em style="left:${x.cible}%"></em></div><small>${x.pct==null?'Aucun séjour concerné':x.pct+' % · '+x.num+' / '+x.den+' · cible '+x.cible+' %'}</small></div>`).join('')}</div>`)}
  ${card('Lits et sorties','Chambre demandée en préadmission, sortie prévue, bionettoyage.',`<table class="v-table"><thead><tr><th>Patient</th><th>Chambre</th><th>Sortie prévue</th><th>Bionettoyage</th></tr></thead><tbody>${lits.map(s=>{const ch=s.sortiePlus?.chambre||'',n=nett[s.id];return `<tr><td><b>${esc(util.name(s))}</b><small>${esc(s.stage)}</small></td><td>${esc(ch||s.preadmission?.chambre||'À attribuer')}<small>${esc(ch?s.preadmission?.chambre||'':'')}</small></td><td>${s.sortiePlus?.sortiePrevue?esc(fmtD(s.sortiePlus.sortiePrevue)):'—'}</td><td><button type="button" class="secondary" data-nett="${esc(s.id)}">${n?'Fait '+esc(fmtDT(n.at).slice(-5))+(n.by?' · '+esc(n.by):''):'À faire'}</button></td></tr>`}).join('')||'<tr><td colspan="4">Aucun patient hospitalisé.</td></tr>'}</tbody></table><p class="v-foot">Bionettoyage partagé entre tous les postes : chaque changement est enregistré dans le dossier et tracé.</p>`)}</div>`;
  document.querySelectorAll('[data-nett]').forEach(b=>b.onclick=()=>{const s=patients.find(x=>x.id===b.dataset.nett);if(!s)return;if(ctx.canWrite&&!ctx.canWrite('stay/'+s.id+'/bionettoyage')){toast('Bionettoyage : modification réservée aux soignants de l’équipe');return}const fait=s.bionettoyage?.etat!=='fait';s.bionettoyage={etat:fait?'fait':'a-faire',at:new Date().toISOString(),by:who()};trace(s,'Bionettoyage de la chambre '+(fait?'réalisé':'remis à faire'),'Hôtellerie');renderPilotage()});
 }

 /* ---------------- Vue Droits & traçabilité ---------------- */
 async function renderDroits(){
  util.viewHeader('Droits & traçabilité','droits');
  const stay=current();const cons=stay?P.conservation(stay.identity?.birthDate,stay.discharge?.validated?Date.now():Date.now()):null;
  $('#workspace').innerHTML=`<div class="v-wrap">${head(I.shield+' RGPD et sécurité','Qui a ouvert le dossier, accès d’urgence, droits des patients','Journal consultable par le DPO et remis au patient sur demande ; bris de glace motivé et revu ; durées de conservation affichées.')}
  <div class="v-two">
  ${card('Journal d’accès du dossier',stay?'Séjour '+esc(stay.id)+' · '+esc(util.name(stay)):'Aucun séjour sélectionné',`<div id="vp-journal" class="v-journal"><p class="v-empty">Chargement…</p></div><div class="v-actions"><button type="button" class="secondary" id="vp-journal-print">Relevé pour le patient</button></div>`)}
  ${card('Accès d’urgence (bris de glace)','Pour un patient hors de vos équipes : accès de 4 heures, motif obligatoire, revu par le DPO.',`<form id="vp-bdg" class="v-form v-form-1"><label><span>Identifiant du séjour</span><input name="stay" required placeholder="ex. DÉMO-005"></label><label><span>Motif</span><textarea name="motif" required minlength="10" rows="2" placeholder="Urgence vitale, appel de garde…"></textarea></label><div class="v-actions"><button class="primary">Ouvrir l’accès d’urgence</button></div></form><div id="vp-bdg-list"></div>`)}
  </div>
  <div class="v-two">
  ${card('Conservation du dossier',cons?esc(cons.ref):'',cons?`<p class="v-big-t">Jusqu’au <b>${esc(fmtD(cons.jusquau))}</b></p><p class="v-foot">${esc(cons.motif)} (calcul à partir de la date du jour pour un séjour en cours). Purge automatique à prévoir à l’échéance.</p>`:'<p class="v-empty">Sélectionnez un séjour.</p>')}
  ${card('Demandes d’exercice des droits','Accès, rectification, opposition, effacement, portabilité : réponse sous un mois.',`<form id="vp-droit" class="v-form"><label><span>Séjour</span><input name="patient" value="${esc(stay?.id||'')}" required></label><label><span>Type</span><select name="type">${['Accès','Rectification','Opposition','Limitation','Portabilité','Effacement'].map(o=>`<option>${o}</option>`).join('')}</select></label><label><span>Reçue le</span><input name="recu" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label><span>Canal</span><select name="canal"><option>Courrier</option><option>E-mail au DPO</option><option>Sur place</option></select></label><div class="v-actions v-wide"><button class="secondary">Enregistrer la demande</button></div></form><div id="vp-droits-list"></div>`)}
  </div></div>`;
  loadJournal(stay);loadBdg();renderDroitsList();
  $('#vp-bdg').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{const r=await fetch('/api/workspace/bris-de-glace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});const x=await r.json();if(!r.ok)throw Error(x.error||'Refusé');toast('Accès d’urgence ouvert jusqu’à '+fmtDT(x.until).slice(-5)+' · rechargez le dossier');loadBdg()}catch(err){toast(err.message)}};
  $('#vp-droit').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const target=patients.find(x=>x.id===f.patient.trim());if(!target){toast('Séjour introuvable dans votre périmètre.');return}arr(target,'droitsRgpd').push({type:f.type,recu:f.recu,canal:f.canal,echeance:P.echeanceDroit(f.recu),statut:'Ouverte',by:who(),at:new Date().toISOString()});trace(target,'Demande de droit RGPD enregistrée : '+f.type,'RGPD');renderDroitsList();toast('Demande enregistrée · échéance '+fmtD(P.echeanceDroit(f.recu)))};
  $('#vp-journal-print').onclick=()=>{const rows=[...document.querySelectorAll('#vp-journal tr')].map(r=>r.outerHTML).join('');const w=window.open('','_blank');if(w)w.opener=null;if(!w){toast('Autorisez les fenêtres pour imprimer.');return}w.document.write(`<!doctype html><meta charset="utf-8"><title>Relevé des accès</title><style>body{font:14px system-ui;margin:32px}td,th{border:1px solid #ccc;padding:6px}table{border-collapse:collapse}</style><h1>Relevé des accès à votre dossier</h1><p>Séjour ${esc(stay?.id||'')}</p><table>${rows}</table>`);w.document.close();w.print()};
 }
 async function loadJournal(stay){const box=$('#vp-journal');if(!box||!stay)return;try{const r=await fetch('/api/workspace/journal?stay='+encodeURIComponent(stay.id));const x=await r.json();if(!r.ok)throw Error(x.error);box.innerHTML=x.rows.length?`<table class="v-table"><thead><tr><th>Date</th><th>Professionnel</th><th>Action</th><th>Rubrique</th></tr></thead><tbody>${x.rows.map(l=>`<tr class="${l.result==='denied'?'is-alert':''}"><td class="v-mono">${esc(fmtDT(l.at))}</td><td>${esc(l.name)}</td><td>${esc(l.action)}${l.result==='denied'?' (refusé)':''}</td><td><small>${esc(l.target.split('/').slice(2).join('/')||l.target)}</small></td></tr>`).join('')}</tbody></table>`:'<p class="v-empty">Aucun accès journalisé.</p>'}catch(e){box.innerHTML='<p class="v-warn-t">'+esc(e.message||'Journal indisponible')+'</p>'}}
 async function loadBdg(){const box=$('#vp-bdg-list');if(!box)return;try{const r=await fetch('/api/workspace/bris-de-glace');const x=await r.json();box.innerHTML=x.rows?.length?`<ul class="v-log">${x.rows.map(l=>`<li class="is-ko">${I.alert}<span>${esc(fmtDT(l.at))} · ${esc(l.name)} · ${esc(l.target)} · « ${esc(l.reason)} »</span></li>`).join('')}</ul>`:'<p class="v-foot">Aucun accès d’urgence.</p>'}catch{}}
 function renderDroitsList(){const box=$('#vp-droits-list');if(!box)return;const list=patients.flatMap(st=>(Array.isArray(st.droitsRgpd)?st.droitsRgpd:[]).map(x=>Object.assign(x,{patient:st.id})));box.innerHTML=list.length?`<table class="v-table"><thead><tr><th>Séjour</th><th>Type</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${list.map((x,i)=>{const late=x.statut!=='Clôturée'&&new Date(x.echeance)<new Date();return `<tr><td class="v-mono">${esc(x.patient)}</td><td>${esc(x.type)}<small>${esc(x.canal)} · reçue ${esc(fmtD(x.recu))}</small></td><td>${late?`<span class="v-level v-crit">${I.alert}${esc(fmtD(x.echeance))}</span>`:esc(fmtD(x.echeance))}</td><td><button type="button" class="secondary" data-droit="${i}">${esc(x.statut)}</button></td></tr>`}).join('')}</tbody></table>`:'<p class="v-foot">Aucune demande.</p>';box.querySelectorAll('[data-droit]').forEach(b=>b.onclick=()=>{const x=list[Number(b.dataset.droit)];x.statut=x.statut==='Ouverte'?'Clôturée':'Ouverte';x.closedBy=who();x.closedAt=new Date().toISOString();renderDroitsList()})}

 /* ---------------- Vue des salles dans la tour de contrôle ---------------- */
 function sallesHTML(){
  const inRoom=patients.filter(s=>(s.blocStatut?.state||({Intervention:'salle',SSPI:'sspi'})[s.stage])==='salle'||(s.blocStatut?.state||({SSPI:'sspi'})[s.stage])==='sspi');
  if(!inRoom.length)return '';
  const last=(s,k)=>{const r=(s.perop?.records||[]).filter(x=>x.kind==='Surveillance'&&!x.voided&&x.values?.[k]!==undefined&&x.values[k]!=='').sort((a,b)=>a.at.localeCompare(b.at)).at(-1);return r?r.values[k]:null};
  return card('Vue à distance des salles','Pour l’anesthésiste superviseur : dernières constantes de chaque patient au bloc et en SSPI.',`<div class="v-rooms">${inRoom.map(s=>{const sbp=last(s,'sbp'),hr=last(s,'hr'),sp=last(s,'spo2'),et=last(s,'etco2');const out=(sbp&&(sbp<90||sbp>160))||(sp&&sp<94);return `<button type="button" class="v-room ${out?'is-out':''}" data-open-room="${esc(s.id)}"><span class="v-room-top"><b>${esc(util.name(s))}</b><em>${(s.blocStatut?.state||'')==='sspi'||s.stage==='SSPI'?'SSPI':'Salle'}</em></span><span class="v-room-vit"><i>PA<b>${sbp??'—'}</b></i><i>FC<b>${hr??'—'}</b></i><i>SpO₂<b>${sp??'—'}</b></i><i>EtCO₂<b>${et??'—'}</b></i></span></button>`}).join('')}</div>`);
 }

 return {TABS,panels:{preadmission:panelPreadmission,bilansVpa:panelBilans,blocRapide:panelBloc,sspi:panelSspi,soinsPlus:panelSoins,sortiePlus:panelSortie,codage:panelCodage,synthese:panelSynthese},views:{pilotage:renderPilotage,droits:renderDroits},sallesHTML};
};
})();

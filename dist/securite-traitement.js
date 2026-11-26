/* IASELO · contrôle de sécurité du traitement en cours (26/11/2026, demande de Romain).
   Dans « Prescriptions postopératoires » : bandeau de synthèse, pastille de contrôle sur chaque ligne et écran complet
   « Contrôle de sécurité du traitement en cours » (tableau ligne × catégorie d'alerte, niveaux 4/3/2/1/i avec compteurs,
   niveau minimum, Toutes / Avec alertes, Détail, prescriptions non envoyées à la sécurisation, justificatif de la validation).
   La validation d'une ligne qui porte une alerte de niveau 3 ou 4 exige un justificatif, tracé dans le dossier et sur la ligne.
   Règles : securite-traitement-regles.js (base IASELO, ne remplace pas une base médicamenteuse agréée). */
(function(root){
'use strict';
const R=()=>root.IaseloSecuriteTraitement;
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SEUIL_JUSTIFICATIF=3;
const LIB_N={4:'4',3:'3',2:'2',1:'1',0:'i'};
const NOM_N={4:'Contre-indication',3:'Déconseillé / risque majeur',2:'Précaution d’emploi',1:'À prendre en compte',0:'Information'};
const ICON={
 tri:n=>`<svg class="st-tri st-n${n}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 1.6 20.6c-.4.7.1 1.6.9 1.6h19c.8 0 1.3-.9.9-1.6L12 2.8Z"/><path class="st-tri-mark" d="M12 9v5.2M12 17.4v.1" fill="none" stroke-width="2.2" stroke-linecap="round"/></svg>`,
 info:'<svg class="st-tri st-n0" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path class="st-tri-mark" d="M12 11v6M12 7.3v.1" fill="none" stroke-width="2.2" stroke-linecap="round"/></svg>',
 shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/></svg>',
 chevron:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
};
const icone=n=>n===0?ICON.info:ICON.tri(n);

/* Réglages mémorisés sur ce poste (niveau minimum, Toutes / Avec alertes). */
const REG='iaselo-securite-traitement';
function reglages(){try{const r=JSON.parse(localStorage.getItem(REG)||'{}');return {min:[0,1,2,3,4].includes(r.min)?r.min:1,avec:r.avec===true,detail:r.detail===true}}catch{return {min:1,avec:false,detail:false}}}
function memoriser(r){try{localStorage.setItem(REG,JSON.stringify(r))}catch{}}

/* Base publique des médicaments : substances de la spécialité (chargée à l'ouverture du contrôle). */
let bdpm=null;
const fold=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function chargerBdpm(){
 if(bdpm)return bdpm;
 try{const d=await root.ParcoursBdpm?.charger?.();if(!d)return null;const parNom=new Map();for(const s of d.specialties){const k=fold(s.name.split(',')[0]);if(!parNom.has(k))parNom.set(k,s);parNom.set(fold(s.name),s)}bdpm={parNom};return bdpm}catch{return null}
}
function enrichir(l){
 if(!bdpm)return l;const s=bdpm.parNom.get(fold(l.name))||bdpm.parNom.get(fold(String(l.name||'').split(',')[0]));
 return s?{...l,substances:s.substances,inactive:!s.active}:l;
}

/* Lignes contrôlées : prescriptions médicamenteuses du séjour + traitement personnel déclaré en consultation. */
// doc : document contrôlé à la place des prescriptions postopératoires (prémédication, ordonnance de sortie).
function lignes(stay,doc){
 const rx=doc?(doc.lignes||[]).map((l,i)=>({category:'Médicament',...enrichir(l),_src:'doc',_i:i})):(stay?.rx||[]).map((l,i)=>({...enrichir(l),_src:'rx',_i:i}));
 const perso=R().traitementPersonnel(stay).map((l,i)=>({...enrichir(l),_src:'perso',_i:i}));
 return [...rx,...perso];
}
const allergiesFn=()=>root.IaseloAmeliorations?.controleAllergies||null;
function analyser(stay,doc){
 const S=R();const t=S.terrain(stay);
 return S.analyser(lignes(stay,doc),{terrain:t,allergies:allergiesFn()});
}
function itemRx(res,index){return res.lignes.find(it=>it.ligne._src==='rx'&&it.ligne._i===index)}
const visibles=(it,min)=>it.alertes.filter(a=>a.n>=min);

/* ---------- Bandeau de synthèse et pastilles dans l'écran des prescriptions ---------- */
function compteursHTML(c,min=0){
 return `<span class="st-levels" role="group" aria-label="Alertes par niveau">${[4,3,2,1,0].map(n=>`<span class="st-level st-n${n}${n<min?' is-off':''}" title="${ESC(NOM_N[n])}"><b>${LIB_N[n]}</b><small>${c.niveaux[n]}</small></span>`).join('')}</span>`;
}
function bandeau(stay,doc){
 if(!R())return '';
 const res=analyser(stay,doc),med=res.lignes.filter(it=>it.securisee);
 if(!res.lignes.length)return '';
 const c=res.compteurs,max=[4,3,2,1,0].find(n=>c.niveaux[n]>0);
 const non=res.lignes.filter(it=>!it.securisee&&it.ligne.category==='Médicament').length;
 return `<section class="st-band${max>=3?' is-alert':''}" data-st-band>
  <div class="st-band-main">${ICON.shield}<div><b>Contrôle de sécurité du traitement en cours</b>
  <small>${med.length} ligne(s) analysée(s)${res.lignes.some(it=>it.ligne._src==='perso')?' dont le traitement personnel':''}${non?' · '+non+' médicament(s) non reconnu(s)':''}${max!=null?' · niveau le plus élevé : '+ESC(NOM_N[max].toLowerCase()):' · aucune alerte'}</small></div></div>
  ${compteursHTML(c)}
  <button type="button" class="secondary st-open" data-st-open>Ouvrir le contrôle</button></section>`;
}
function pastille(it){
 if(!it)return '';
 if(!it.securisee)return `<span class="st-pill is-none" title="${ESC(it.raison)}">Non envoyée à la sécurisation</span>`;
 const max=it.alertes.length?Math.max(...it.alertes.map(a=>a.n)):null;
 if(max==null)return '<span class="st-pill is-ok">Contrôle : aucune alerte</span>';
 const n=it.alertes.filter(a=>a.n>=2).length;
 return `<button type="button" class="st-pill st-n${max}" data-st-open data-st-focus="${it.ligne._i}">${icone(max)}Contrôle : niveau ${LIB_N[max]}${n?' · '+n+' alerte(s) de niveau 2 ou plus':''}</button>`;
}
function securiteHTML(s){
 if(!s)return '';
 return `<p class="st-trace">${ICON.shield}Contrôlée à la validation${s.niveauMax!=null?' · niveau le plus élevé '+ESC(LIB_N[s.niveauMax]):' · aucune alerte'}${s.justificatif?' · justificatif : « '+ESC(s.justificatif)+' »':''}</p>`;
}
// Ajoute bandeau et pastilles à l'écran rendu par parcours-v8.js (articles portant data-rx-index).
function decorer(container,stay,opts={}){
 if(!R()||!container)return;
 const res=analyser(stay);
 container.querySelector('[data-st-band]')?.remove();
 const html=bandeau(stay);if(html){const notice=container.querySelector('.notice');(notice||container.firstElementChild)?.insertAdjacentHTML('afterend',html)}
 container.querySelectorAll('article.rx[data-rx-index]').forEach(a=>{
  a.querySelector('.st-line')?.remove();
  const i=Number(a.dataset.rxIndex),it=itemRx(res,i),rx=stay.rx[i];
  const d=document.createElement('div');d.className='st-line';d.innerHTML=(rx?.validated?securiteHTML(rx.securite):'')+pastille(it);
  const p=a.querySelector('p.preserve');(p||a.firstElementChild).after(d);
 });
 container.querySelectorAll('[data-st-open]').forEach(b=>b.onclick=()=>ouvrir(stay,{...opts,focus:b.dataset.stFocus!=null?Number(b.dataset.stFocus):null}));
}

/* ---------- Écran du contrôle ---------- */
function resumeLigne(it){
 const L=it.lecture,parts=[];
 if(L.dose)parts.push(L.dose.texte);
 if(L.rythme)parts.push(L.rythme.texte);
 if(L.voie)parts.push({IV:'voie intraveineuse',SC:'voie sous-cutanée',IM:'voie intramusculaire',PO:'voie orale',SL:'voie sublinguale'}[L.voie]||'voie '+L.voie.toLowerCase());
 if(L.siBesoin)parts.push('si besoin');
 if(L.duree&&L.duree.jours)parts.push('pendant '+L.duree.jours+' jour(s)');
 return parts.join(' · ');
}
let etiquetteDoc='Document';
function statutLigne(l){return l._src==='doc'?`<span class="st-tag is-draft">${ESC(etiquetteDoc)}</span>`:l._src==='perso'?'<span class="st-tag is-perso">Traitement personnel</span>':l.validated?'<span class="st-tag is-ok">Validée</span>':'<span class="st-tag is-draft">Brouillon</span>'}
function tableHTML(res,reg,focus,src='rx'){
 const S=R(),cols=S.COLONNES,sec=res.lignes.filter(it=>it.securisee);
 const lignesVis=sec.filter(it=>!reg.avec||visibles(it,reg.min).length);
 const parCol=Object.fromEntries(cols.map(c=>[c.id,sec.reduce((s,it)=>s+it.alertes.filter(a=>a.col===c.id&&a.n>=reg.min).length,0)]));
 const cellule=(it,c)=>{const l=it.alertes.filter(a=>a.col===c.id&&a.n>=reg.min);if(!l.length)return `<td class="st-cell is-empty"><span class="st-sr">Aucune alerte</span></td>`;
  const max=Math.max(...l.map(a=>a.n));
  return `<td class="st-cell"><button type="button" class="st-cellbtn" data-st-cell="${it.index}" data-st-col="${c.id}" aria-label="${ESC(c.label)} : ${l.length} alerte(s), niveau maximal ${LIB_N[max]}">${icone(max)}<span class="st-count">${l.length}</span></button></td>`};
 const detail=(it,col)=>{const l=it.alertes.filter(a=>a.n>=reg.min&&(!col||a.col===col));if(!l.length)return '<p class="st-mut">Aucune alerte au niveau choisi.</p>';
  return `<ul class="st-alerts">${l.map(a=>`<li class="st-n${a.n}">${icone(a.n)}<div><b>${ESC(S.NOMS_COL[a.col])} · ${ESC(a.titre)}</b><span class="st-lvl">Niveau ${LIB_N[a.n]} · ${ESC(NOM_N[a.n])}</span><p>${ESC(a.texte)}</p>${a.cat?`<p class="st-cat">Conduite à tenir : ${ESC(a.cat)}</p>`:''}${a.avec!=null?`<p class="st-mut">Avec : ${ESC(res.lignes[a.avec]?.ligne?.name||'')}</p>`:''}</div></li>`).join('')}</ul>`};
 return `<div class="st-scroll"><table class="st-table">
  <thead><tr><th scope="col" class="st-rxcol">Prescription</th>${cols.map(c=>`<th scope="col" title="${ESC(c.aide)}"><span>${ESC(c.label)}</span><small>(${parCol[c.id]})</small></th>`).join('')}</tr></thead>
  <tbody>${lignesVis.map(it=>`<tr class="st-row${it.ligne._src===src&&it.ligne._i===focus?' is-focus':''}${it.ligne._src==='perso'?' is-perso':''}" data-st-row="${it.index}">
   <th scope="row" class="st-rxcol"><div class="st-rxname">${ESC(it.ligne.name)} ${statutLigne(it.ligne)}</div>
    ${resumeLigne(it)?`<div class="st-rxposo">${ESC(resumeLigne(it))}</div>`:''}
    ${it.ligne.instructions?`<div class="st-rxins">${ESC(it.ligne.instructions)}</div>`:''}
    ${it.ligne.substances?.length?`<div class="st-mut">BDPM : ${ESC(it.ligne.substances.join(' + '))}</div>`:''}</th>
   ${cols.map(c=>cellule(it,c)).join('')}</tr>
   <tr class="st-detailrow" data-st-detail="${it.index}" ${reg.detail?'':'hidden'}><td colspan="${cols.length+1}">${detail(it)}</td></tr>`).join('')||`<tr><td colspan="${cols.length+1}" class="st-mut st-none">${sec.length?'Aucune ligne n’a d’alerte au niveau choisi.':'Aucune ligne médicamenteuse reconnue.'}</td></tr>`}</tbody></table></div>`;
}
function terrainHTML(t){
 const x=[t.age!=null?t.age+' ans':'âge non renseigné',t.poids?t.poids+' kg':'poids non renseigné',t.dfg?'DFG '+t.dfg+' mL/min'+(t.dfgSource?' ('+t.dfgSource+')':''):t.ir?'insuffisance rénale (DFG non chiffré)':'fonction rénale non renseignée',t.ih?'insuffisance hépatique':'',t.allergies?'allergies : '+t.allergies:'allergies non renseignées',t.ambulatoire?'ambulatoire':''].filter(Boolean);
 return `<p class="st-terrain"><b>Terrain pris en compte</b> ${x.map(ESC).join(' · ')}</p>`;
}

function ouvrir(stay,opts={}){
 if(!R())return;
 const doc=opts.doc||null;etiquetteDoc=doc?.etiquette||'Document';
 const reg=reglages();let res=analyser(stay,doc),focus=opts.focus??null;
 const indicesValidation=opts.indices||null;// lignes à valider (null : consultation)
 const peutValider=doc?typeof doc.valider==='function'&&opts.signature===true:!!opts.physician&&typeof opts.valider==='function';
 const SRC=doc?'doc':'rx';
 const d=document.createElement('dialog');d.className='st-dialog';d.setAttribute('aria-labelledby','st-title');
 document.body.append(d);
 const brouillons=()=>(stay.rx||[]).map((r,i)=>({r,i})).filter(x=>!x.r.validated&&x.r.category==='Médicament').map(x=>x.i);
 const cibles=()=>doc?(doc.lignes||[]).map((_,i)=>i):indicesValidation||brouillons();
 function rendre(){
  const c=res.compteurs,non=res.lignes.filter(it=>!it.securisee);
  const cib=cibles(),bloq=res.lignes.filter(it=>it.ligne._src===SRC&&cib.includes(it.ligne._i)&&it.securisee&&it.alertes.some(a=>a.n>=SEUIL_JUSTIFICATIF)).map(it=>it.ligne._i);
  d.innerHTML=`<div class="st-head"><h2 id="st-title">Alertes du contrôle de sécurité ${doc?'· '+ESC(doc.titre):'du traitement en cours'}</h2><button type="button" class="icon" data-st-close aria-label="Fermer">×</button></div>
  ${terrainHTML(res.terrain)}
  <div class="st-toolbar">
   <label class="st-min">Niveau minimum<select data-st-min>${[4,3,2,1,0].map(n=>`<option value="${n}" ${reg.min===n?'selected':''}>${LIB_N[n]} · ${ESC(NOM_N[n])}</option>`).join('')}</select></label>
   <button type="button" class="st-reset" data-st-reset title="Revenir au niveau 1" aria-label="Revenir au niveau 1">×</button>
   ${compteursHTML(c,reg.min)}
   <button type="button" class="secondary st-detail-btn${reg.detail?' is-on':''}" data-st-detailall aria-pressed="${reg.detail}">Détail</button>
   <div class="st-seg" role="group" aria-label="Prescriptions affichées"><span>Prescriptions</span><button type="button" class="${reg.avec?'':'is-on'}" data-st-avec="0" aria-pressed="${!reg.avec}">Toutes</button><button type="button" class="${reg.avec?'is-on':''}" data-st-avec="1" aria-pressed="${reg.avec}">Avec alertes</button></div>
  </div>
  ${tableHTML(res,reg,focus,SRC)}
  <div class="st-cellpop" hidden></div>
  <details class="st-non" ${non.length?'':'hidden'}><summary>${ICON.chevron}Les prescriptions non envoyées à la sécurisation (${non.length})</summary>
   <ul>${non.map(it=>`<li><b>${ESC(it.ligne.name)}</b> ${statutLigne(it.ligne)}<span class="st-mut"> · ${ESC(it.raison)}</span></li>`).join('')}</ul>
   <p class="st-mut">Ces lignes ne sont pas analysées : vérifiez-les avec le RCP (bouton BDPM) ou le pharmacien.</p></details>
  ${peutValider&&cib.length?`<form class="st-valid" data-st-form>
   <label>Justificatif de la validation${bloq.length?' <span class="st-req">obligatoire : '+bloq.length+' ligne(s) avec une alerte de niveau 3 ou 4</span>':' <span class="st-mut">(facultatif)</span>'}
   <textarea name="justificatif" maxlength="1000" ${bloq.length?'required minlength="10"':''} placeholder="Ex. : association maintenue après avis, ECG et kaliémie prévus ; dose vérifiée pour le poids…"></textarea></label>
   <p class="st-err" role="alert"></p>
   <div class="st-foot"><p class="st-mut">${doc?ESC(doc.titre)+' : '+cib.length+' médicament(s)':cib.length+' ligne(s) à valider : '+cib.map(i=>ESC(stay.rx[i]?.name||'')).join(', ')}</p><div class="actions"><button type="button" class="secondary" data-st-close>Annuler</button><button class="primary">${doc?ESC(doc.action||'Valider'):cib.length>1?'Valider les '+cib.length+' lignes':'Valider la ligne'}</button></div></div>
  </form>`:`<div class="st-foot"><p class="st-mut">${doc?(doc.note||''):peutValider?'Aucune ligne médicamenteuse au brouillon.':'Lecture seule : la validation est réservée au médecin prescripteur.'}</p><div class="actions"><button type="button" class="secondary" data-st-close>Fermer</button></div></div>`}
  <p class="st-source">Base de règles IASELO (molécules courantes en périopératoire ; thésaurus des interactions de l’ANSM, RCP de la BDPM, liste de l’AMA). Elle ne remplace pas une base de données médicamenteuse agréée ni la lecture du RCP. Règles à faire relire par la pharmacie.</p>`;
  brancher(bloq);
 }
 function brancher(bloq){
  d.querySelectorAll('[data-st-close]').forEach(b=>b.onclick=()=>d.close());
  d.querySelector('[data-st-min]').onchange=e=>{reg.min=Number(e.target.value);memoriser(reg);rendre()};
  d.querySelector('[data-st-reset]').onclick=()=>{reg.min=1;memoriser(reg);rendre()};
  d.querySelector('[data-st-detailall]').onclick=()=>{reg.detail=!reg.detail;memoriser(reg);rendre()};
  d.querySelectorAll('[data-st-avec]').forEach(b=>b.onclick=()=>{reg.avec=b.dataset.stAvec==='1';memoriser(reg);rendre()});
  const pop=d.querySelector('.st-cellpop');
  d.querySelectorAll('[data-st-cell]').forEach(b=>b.onclick=()=>{
   const it=res.lignes[Number(b.dataset.stCell)],col=b.dataset.stCol,S=R();
   const l=it.alertes.filter(a=>a.col===col&&a.n>=reg.min);
   const was=b.classList.contains('is-open');d.querySelectorAll('.st-cellbtn.is-open').forEach(x=>x.classList.remove('is-open'));
   if(was){pop.hidden=true;return}
   b.classList.add('is-open');
   pop.innerHTML=`<div class="st-pophead"><b>${ESC(it.ligne.name)}</b><span>${ESC(S.NOMS_COL[col])}</span><button type="button" class="icon" data-st-popclose aria-label="Fermer le détail">×</button></div><ul class="st-alerts">${l.map(a=>`<li class="st-n${a.n}">${icone(a.n)}<div><b>${ESC(a.titre)}</b><span class="st-lvl">Niveau ${LIB_N[a.n]} · ${ESC(NOM_N[a.n])}</span><p>${ESC(a.texte)}</p>${a.cat?`<p class="st-cat">Conduite à tenir : ${ESC(a.cat)}</p>`:''}</div></li>`).join('')}</ul>`;
   const row=b.closest('tr'),detailRow=d.querySelector(`[data-st-detail="${it.index}"]`);
   pop.hidden=false;
   // Le détail s'affiche sous le tableau, à côté de la ligne concernée (insertion dans un <tr> dédié).
   let tr=d.querySelector('tr.st-poprow');if(!tr){tr=document.createElement('tr');tr.className='st-poprow';tr.innerHTML=`<td colspan="${S.COLONNES.length+1}"></td>`}
   tr.firstElementChild.replaceChildren(pop);(detailRow&&!detailRow.hidden?detailRow:row).after(tr);
   pop.querySelector('[data-st-popclose]').onclick=()=>{b.classList.remove('is-open');tr.remove()};
  });
  const f=d.querySelector('[data-st-form]');
  if(f)f.onsubmit=e=>{
   e.preventDefault();
   const just=String(f.justificatif.value||'').trim(),err=f.querySelector('.st-err');
   if(bloq.length&&!R().justificatifValide(just)){err.textContent='Indiquez le justificatif de la validation (10 caractères au moins) : il est tracé dans le dossier.';f.justificatif.focus();return}
   const cib=cibles();
   if(doc){d.close();doc.valider(ficheDoc(res,just),just);return}
   const fiches=cib.map(i=>fiche(res,i,just));
   d.close();opts.valider(cib,fiches,just);
  };
  if(focus!=null)d.querySelector('tr.is-focus')?.scrollIntoView({block:'center'});
  if(indicesValidation)d.querySelector('[data-st-form] textarea')?.focus();
 }
 d.addEventListener('close',()=>d.remove());
 rendre();d.showModal();
 // Substances de la BDPM : relance l'analyse quand le catalogue est disponible (médicaments saisis par nom commercial).
 if(!bdpm)chargerBdpm().then(b=>{if(b&&d.open){res=analyser(stay,doc);rendre()}});
}
// Trace enregistrée sur la ligne validée.
function fiche(res,index,justificatif){
 const it=itemRx(res,index);const al=it?.alertes||[];
 const max=al.length?Math.max(...al.map(a=>a.n)):null;
 const c={4:0,3:0,2:0,1:0,0:0};al.forEach(a=>c[a.n]++);
 return {at:new Date().toISOString(),securisee:!!it?.securisee,niveauMax:max,compteurs:c,
  alertes:al.filter(a=>a.n>=2).slice(0,12).map(a=>({col:a.col,n:a.n,titre:a.titre})),
  justificatif:max!=null&&max>=SEUIL_JUSTIFICATIF?justificatif:(justificatif||'')};
}
// Trace d'un document signé (toutes ses lignes).
function ficheDoc(res,justificatif){
 const its=res.lignes.filter(it=>it.ligne._src==='doc'),al=its.flatMap(it=>it.alertes.map(a=>({...a,ligne:it.ligne.name})));
 const max=al.length?Math.max(...al.map(a=>a.n)):null,c={4:0,3:0,2:0,1:0,0:0};al.forEach(a=>c[a.n]++);
 return {at:new Date().toISOString(),lignes:its.length,nonSecurisees:its.filter(it=>!it.securisee).map(it=>it.ligne.name).slice(0,12),niveauMax:max,compteurs:c,
  alertes:al.filter(a=>a.n>=2).slice(0,15).map(a=>({ligne:a.ligne,col:a.col,n:a.n,titre:a.titre})),justificatif:justificatif||''};
}
/* Document (prémédication, ordonnance de sortie) : signature directe sans alerte de niveau 3 ou 4, sinon écran du
   contrôle avec justificatif obligatoire. doc = {titre, etiquette, action, lignes:[{name,instructions,ponctuel}], valider(fiche, justificatif)}. */
function controlerDocument(stay,doc){
 if(!R()){doc.valider(null,'');return}
 const res=analyser(stay,doc);
 if(!res.lignes.some(it=>it.ligne._src==='doc'&&it.alertes.some(a=>a.n>=SEUIL_JUSTIFICATIF))){doc.valider(ficheDoc(res,''),'');return}
 ouvrir(stay,{doc,signature:true});
}
// Bandeau de synthèse placé avant l'élément ancre ; le bouton ouvre le contrôle en consultation.
function decorerDocument(ancre,stay,doc){
 if(!R()||!ancre)return;
 ancre.parentElement?.querySelector(':scope>[data-st-band]')?.remove();
 if(!(doc.lignes||[]).length)return;
 const html=bandeau(stay,doc);if(!html)return;
 ancre.insertAdjacentHTML('beforebegin',html);
 const band=ancre.previousElementSibling;band.querySelector('b').textContent='Contrôle de sécurité · '+doc.titre;
 band.querySelector('[data-st-open]').onclick=()=>ouvrir(stay,{doc:{...doc,note:doc.note||'Le contrôle est refait à la signature.'}});
}
const ligneSignee=s=>s?`<p class="st-trace">${ICON.shield}Contrôle de sécurité du traitement effectué${s.niveauMax!=null?' · niveau le plus élevé '+ESC(LIB_N[s.niveauMax]):' · aucune alerte'}${s.justificatif?' · justificatif : « '+ESC(s.justificatif)+' »':''}</p>`:'';
/* Validation d'une ou plusieurs lignes : directe s'il n'y a pas d'alerte de niveau 3 ou 4, sinon écran du contrôle
   avec justificatif obligatoire. valider(indices, fiches, justificatif) applique la validation. */
function avantValidation(stay,indices,opts){
 if(!R()){opts.valider(indices,indices.map(()=>null),'');return}
 const res=analyser(stay);
 if(!R().bloquantes(res,SEUIL_JUSTIFICATIF,null).some(it=>it.ligne._src==='rx'&&indices.includes(it.ligne._i))){opts.valider(indices,indices.map(i=>fiche(res,i,'')),'');return}
 ouvrir(stay,{...opts,indices,focus:indices[0]});
}

root.IaseloSecuriteUI={bandeau,decorer,ouvrir,avantValidation,analyser,controlerDocument,decorerDocument,ligneSignee,SEUIL_JUSTIFICATIF};
})(window);

/* IASELO · surveillance postopératoire en graphe (SSPI et hospitalisation).
   Courbes alignées sur un même axe horaire (PA, FC, SpO₂, FR, température, douleur…), grille des critères cotés
   (conscience, sédation, NVPO, pansement, miction, bloc moteur, membre), NEWS2, alertes et vue tableau.
   Règles dans surveillance-postop-regles.js. Aucune donnée ne quitte le dossier : tout est calculé dans le navigateur. */
(function(){
'use strict';
window.createSurveillancePostop=function(ctx){
 const S=window.IaseloSurveillance,N=window.IaseloAmeliorations;
 const esc=ctx.esc;
 const heure=t=>new Date(t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
 const jour=t=>new Date(t).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
 const quand=t=>jour(t)+' '+heure(t);
 const M=Object.fromEntries(S.MESURES.map(m=>[m.key,m])),C=Object.fromEntries(S.COTATIONS.map(c=>[c.key,c]));
 const FEN=[[6,'6 h'],[12,'12 h'],[24,'24 h'],[48,'48 h'],[0,'Tout']];
 let heures=24,vue='graphe',dernier=null;
 const ICON={crit:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="currentColor"/><path d="M8 6v3.6M8 11.6v.4" stroke="var(--i-s1)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  warn:'<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M8 4.6v4M8 11v.4" stroke="var(--i-s1)" stroke-width="1.6" stroke-linecap="round"/></svg>'};

 /* ---------- Formulaire de saisie ---------- */
 const field=(m,extra='')=>`<label>${esc(m.label)} <small>${esc(m.unite)}</small><input name="${m.key}" type="number" inputmode="decimal" min="${m.limites[0]}" max="${m.limites[1]}" step="${m.pas}" ${extra}></label>`;
 const choice=c=>`<label>${esc(c.label)}<select name="${c.key}"><option value="">Non évalué</option>${c.options.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
 const groupe=(titre,html)=>`<fieldset class="sp-group"><legend>${esc(titre)}</legend><div class="formgrid">${html}</div></fieldset>`;
 function form({location='SSPI',at='',author=false}={}){
  return `<details class="sp-form-wrap" open><summary>Nouveau relevé</summary><form id="postop-vitals-form" class="sp-form" novalidate>
  ${groupe('Relevé',`<label>Lieu de surveillance<select name="location">${['SSPI','Hospitalisation'].map(x=>`<option ${x===location?'selected':''}>${x}</option>`).join('')}</select></label><label>Date et heure du relevé<input name="at" type="datetime-local" value="${esc(at)}" required></label>${author?'<label>Soignant · nom ou initiales<input name="author" type="text" required maxlength="80"></label>':''}`)}
  ${groupe('Hémodynamique',field(M.sbp)+field(M.dbp)+field(M.hr))}
  ${groupe('Respiration',field(M.rr)+field(M.spo2)+choice(C.o2)+field(M.o2Flow))}
  ${groupe('Neurologique',choice(C.avpu)+choice(C.sedation))}
  ${groupe('Douleur, confort, température',field(M.pain)+field(M.painMove)+choice(C.nvpo)+field(M.temp))}
  ${groupe('Élimination',choice(C.miction)+field(M.diuresis)+field(M.bladder))}
  ${groupe('Site opératoire et membre',choice(C.dressing)+field(M.drain)+choice(C.bromage)+choice(C.limb))}
  ${groupe('Autres',field(M.glycemia)+'<label class="wide">Observation<textarea name="note" maxlength="600" rows="2" placeholder="Élément clinique à transmettre"></textarea></label>')}
  <div class="sp-preview" aria-live="polite"></div>
  <p class="warn" role="alert"></p><button class="primary">Enregistrer le relevé</button></form></details>`;
 }
 function previewHtml(v){const a=S.alertes(v,dernier);if(!a.length)return '';
  return `<p class="sp-preview-title">Ce relevé déclenchera ${a.length>1?a.length+' alertes':'une alerte'} :</p>${alertList(a)}`}
 const alertList=a=>`<ul class="sp-alerts">${a.map(x=>`<li class="sp-${x.niveau}">${ICON[x.niveau]}<span><b>${x.niveau==='crit'?'Appel médical':'À surveiller'}</b> ${esc(x.message)}</span></li>`).join('')}</ul>`;

 /* ---------- Graphe ---------- */
 const W=980,L=196,R=18,PAD=16,TOP=30;
 const COURBES=[
  {id:'pa',titre:'Pression artérielle',unite:'mmHg',h:118,echelle:[40,200],normal:[90,140],ticks:[60,100,140,180],type:'pa'},
  {id:'hr',key:'hr',h:86,ticks:[50,100,140]},
  {id:'spo2',key:'spo2',titre:'Saturation (SpO₂)',h:70,ticks:[90,95]},
  {id:'rr',key:'rr',h:70,ticks:[10,20,30]},
  {id:'temp',key:'temp',h:76,ticks:[36,38,40]},
  {id:'pain',key:'pain',titre:'Douleur (EN)',unite:'/10',h:86,echelle:[0,10],normal:[0,3],ticks:[0,4,7,10],type:'douleur',seuil:4},
  {id:'diuresis',key:'diuresis',titre:'Diurèse',h:58,type:'barres',option:true},
  {id:'drain',key:'drain',titre:'Drains',h:58,type:'barres',option:true},
  {id:'bladder',key:'bladder',titre:'Bladder scan',h:58,type:'barres',option:true,seuil:500},
  {id:'glycemia',key:'glycemia',titre:'Glycémie',h:64,echelle:[0.4,3.2],normal:[0.7,1.8],ticks:[0.7,1.8,2.5],option:true}
 ];
 const LIGNES=[['avpu'],['sedation'],['o2'],['nvpo'],['dressing'],['miction'],['bromage',true],['limb',true]];
 const fmt=(v,m)=>{const n=S.num(v);if(n===null)return '—';return m&&m.pas<1?String(Math.round(n*100)/100).replace('.',','):String(n)};
 const ABR={Sec:'S',Taché:'T',Saturé:'Sat',Refait:'R',Anomalie:'!',Sonde:'Sd',Sondage:'SE',Non:'N',Oui:'O',Air:'Air'};
 const court=(key,v)=>{if(!S.has(v))return '';if(key==='dressing')return {Sec:'Sec',Taché:'Taché',Saturé:'Saturé',Refait:'Refait'}[v]||v;if(key==='limb')return v==='Normal'?'N':'Anomalie';if(key==='miction')return v;return String(v)};

 function chrono(records){const pts=S.chronologie(records);if(!N?.news2)return pts;
  for(const p of pts){const n=N.news2(p.values);if(!n.mesures)continue;if(n.total>=7)p.alertes.unshift({niveau:'crit',key:'news2',message:'NEWS2 '+n.total+' : '+n.conduite});else if(n.total>=5)p.alertes.push({niveau:'warn',key:'news2',message:'NEWS2 '+n.total+' : '+n.conduite})}
  return pts}
 function graphSvg(win){
  const pts=win.points,x0=L+PAD,x1=W-R-PAD,sx=t=>win.fin===win.debut?(x0+x1)/2:x0+(t-win.debut)/(win.fin-win.debut)*(x1-x0);
  const panels=COURBES.filter(c=>!c.option||pts.some(p=>S.has(p.values[c.key])));
  const lignes=LIGNES.filter(([k,opt])=>!opt||pts.some(p=>S.has(p.values[k])));
  const newsRow=!!N?.news2;
  let y=TOP,body='';
  const ticks=S.graduations(win.debut,win.fin);
  const totalH=TOP+panels.reduce((s,c)=>s+c.h+10,0)+(lignes.length+(newsRow?1:0))*26+16;
  // axe horaire en haut et grille verticale
  body+=ticks.map(t=>`<line class="sp-vgrid" x1="${sx(t)}" x2="${sx(t)}" y1="${TOP-6}" y2="${totalH-8}"/><text class="sp-tick" x="${sx(t)}" y="${TOP-12}" text-anchor="middle">${heure(t)}</text>`).join('');
  const jours=[...new Set(ticks.map(jour))];
  body+=`<text class="sp-tick sp-day" x="${L-8}" y="${TOP-12}" text-anchor="end">${esc(jours.join(' → '))}</text>`;
  for(const c of panels){
   const m=c.key?M[c.key]:null,titre=c.titre||m.label,unite=c.unite||m.unite,h=c.h;
   const vals=pts.map(p=>S.num(p.values[c.key||'sbp'])).filter(v=>v!==null);
   let [lo,hi]=c.echelle||m.echelle||[0,Math.max(10,...vals)*1.15];
   if(c.type==='barres'){lo=0;hi=Math.max(c.seuil?c.seuil*1.2:0,...pts.map(p=>S.num(p.values[c.key])||0))*1.15||100}
   else if(vals.length&&c.type!=='douleur'){lo=Math.min(lo,Math.floor(Math.min(...vals)));hi=Math.max(hi,Math.ceil(Math.max(...vals)))}
   if(c.type==='pa'){const d=pts.map(p=>S.num(p.values.dbp)).filter(v=>v!==null);if(d.length)lo=Math.min(lo,Math.floor(Math.min(...d)/10)*10)}
   const top=y+6,bot=y+h-6,sy=v=>bot-(v-lo)/(hi-lo||1)*(bot-top);
   body+=`<g class="sp-panel" data-panel="${c.id}"><rect class="sp-plot" x="${L}" y="${y}" width="${W-L-R}" height="${h}" rx="8"/>`;
   const nb=c.normal||m?.normal;if(nb)body+=`<rect class="sp-band" x="${L}" y="${sy(Math.min(nb[1],hi))}" width="${W-L-R}" height="${Math.max(0,sy(Math.max(nb[0],lo))-sy(Math.min(nb[1],hi)))}"/>`;
   for(const t of (c.ticks||[]))if(t>lo&&t<hi)body+=`<line class="sp-hgrid" x1="${L}" x2="${W-R}" y1="${sy(t)}" y2="${sy(t)}"/><text class="sp-ytick" x="${L-6}" y="${sy(t)+4}" text-anchor="end">${String(t).replace('.',',')}</text>`;
   if(c.seuil)body+=`<line class="sp-seuil" x1="${L}" x2="${W-R}" y1="${sy(c.seuil)}" y2="${sy(c.seuil)}"/>`;
   // libellé et dernière valeur
   const lastP=[...pts].reverse().find(p=>S.has(p.values[c.key||'sbp'])||(c.type==='pa'&&S.has(p.values.dbp)));
   let last='—',lastLvl='';
   if(lastP){if(c.type==='pa'){last=fmt(lastP.values.sbp)+'/'+fmt(lastP.values.dbp);lastLvl=S.niveau('sbp',lastP.values.sbp)||S.niveau('dbp',lastP.values.dbp)}
    else{last=fmt(lastP.values[c.key],m);lastLvl=S.niveau(c.key,lastP.values[c.key])}}
   body+=h<70?`<text class="sp-name" x="12" y="${y+20}">${esc(titre)} <tspan class="sp-unit">${esc(unite)}</tspan></text><text class="sp-last ${lastLvl?'sp-t-'+lastLvl:''}" x="12" y="${y+44}">${esc(last)}</text>`
    :`<text class="sp-name" x="12" y="${y+20}">${esc(titre)}</text><text class="sp-unit" x="12" y="${y+36}">${esc(unite)}</text><text class="sp-last ${lastLvl?'sp-t-'+lastLvl:''}" x="12" y="${Math.min(y+h-10,y+62)}">${esc(last)}</text>`;
   // marques
   if(c.type==='pa'){
    for(const p of pts){const s=S.num(p.values.sbp),d=S.num(p.values.dbp),X=sx(p.t);if(s===null&&d===null)continue;
     const lvl=S.niveau('sbp',s)||S.niveau('dbp',d),cls=lvl?' sp-m-'+lvl:'';
     if(s!==null&&d!==null)body+=`<line class="sp-pa${cls}" x1="${X}" x2="${X}" y1="${sy(s)}" y2="${sy(d)}"/>`;
     if(s!==null)body+=`<path class="sp-chev${cls}" d="M${X-6} ${sy(s)-6}L${X} ${sy(s)}L${X+6} ${sy(s)-6}"/>`;
     if(d!==null)body+=`<path class="sp-chev${cls}" d="M${X-6} ${sy(d)+6}L${X} ${sy(d)}L${X+6} ${sy(d)+6}"/>`}
   }else if(c.type==='barres'){
    const bw=Math.max(6,Math.min(16,(x1-x0)/Math.max(pts.length,1)*0.5));
    for(const p of pts){const v=S.num(p.values[c.key]);if(v===null)continue;const X=sx(p.t),lvl=S.niveau(c.key,v);
     body+=`<path class="sp-bar${lvl?' sp-m-'+lvl:''}" d="M${X-bw/2} ${bot}V${Math.min(bot-2,sy(v))+4}q0 -4 4 -4h${bw-8}q4 0 4 4V${bot}z"/>`}
   }else if(c.type==='douleur'){
    const bw=Math.max(6,Math.min(14,(x1-x0)/Math.max(pts.length,1)*0.45));
    for(const p of pts){const v=S.num(p.values.pain),X=sx(p.t);if(v!==null){const lvl=S.niveau('pain',v);
      body+=v===0?`<line class="sp-zero" x1="${X-bw/2}" x2="${X+bw/2}" y1="${bot}" y2="${bot}"/>`:`<path class="sp-bar${lvl?' sp-m-'+lvl:''}" d="M${X-bw/2} ${bot}V${sy(v)+4}q0 -4 4 -4h${bw-8}q4 0 4 4V${bot}z"/>`}
     const mv=S.num(p.values.painMove);if(mv!==null){const lvl=S.niveau('painMove',mv);body+=`<circle class="sp-hollow${lvl?' sp-m-'+lvl:''}" cx="${X}" cy="${sy(mv)}" r="4.5"/>`}}
    body+=`<text class="sp-legend" x="12" y="${y+h-8}"><tspan class="sp-key-bar">▮</tspan> repos  <tspan class="sp-key-ring">○</tspan> mobilisation</text>`;
   }else{
    const serie=pts.map(p=>({p,v:S.num(p.values[c.key])})).filter(o=>o.v!==null);
    if(serie.length>1)body+=`<polyline class="sp-line" points="${serie.map(o=>sx(o.p.t)+','+sy(Math.max(lo,Math.min(hi,o.v)))).join(' ')}"/>`;
    for(const o of serie){const lvl=S.niveau(c.key,o.v);body+=`<circle class="sp-dot${lvl?' sp-m-'+lvl:''}" cx="${sx(o.p.t)}" cy="${sy(Math.max(lo,Math.min(hi,o.v)))}" r="${lvl?5:4}"/>`}
   }
   body+='</g>';y+=h+10;
  }
  // grille des critères cotés (abréviations quand les relevés sont rapprochés)
  const place=pts.map((p,i)=>Math.min(i?sx(p.t)-sx(pts[i-1].t):999,i<pts.length-1?sx(pts[i+1].t)-sx(p.t):999)-3);let abrege=false;
  const rows=[...lignes.map(([k])=>({key:k,titre:C[k].court})),...(newsRow?[{key:'news2',titre:'NEWS2'}]:[])];
  for(const [i,r] of rows.entries()){
   body+=`<g class="sp-row"><rect class="${i%2?'sp-row-alt':'sp-row-bg'}" x="${L}" y="${y}" width="${W-L-R}" height="24" rx="4"/><text class="sp-rowname" x="12" y="${y+16}">${esc(r.titre)}</text>`;
   for(const [pi,p] of pts.entries()){let txt='',lvl='';
    if(r.key==='news2'){const n=N.news2(p.values);if(!n.mesures)continue;txt=String(n.total)+(n.complet?'':'*');lvl=n.total>=7?'crit':n.total>=5||n.items.some(it=>it.points===3)?'warn':''}
    else if(r.key==='o2'){if(!S.has(p.values.o2)&&!S.has(p.values.o2Flow))continue;txt=p.values.o2==='Air'?'Air':(S.has(p.values.o2Flow)?fmt(p.values.o2Flow)+' L':'O₂')}
    else{const v=p.values[r.key];if(!S.has(v))continue;txt=court(r.key,v);lvl=S.niveauCotation(r.key,v);if(r.key==='bromage'&&p.alertes.some(a=>a.key==='bromage'))lvl='crit'}
    const X=sx(p.t);let wd=Math.max(20,txt.length*7+10);if(wd>place[pi]){const a=ABR[txt]||txt.replace(' ','');if(a!==txt){txt=a;abrege=true}wd=Math.max(20,Math.min(wd,txt.length*7+10))}
    body+=`<rect class="sp-chip${lvl?' sp-c-'+lvl:''}" x="${X-wd/2}" y="${y+3}" width="${wd}" height="18" rx="9"/><text class="sp-chiptxt${lvl?' sp-ct-'+lvl:''}" x="${X}" y="${y+16}" text-anchor="middle">${esc(txt)}</text>`}
   body+='</g>';y+=26;
  }
  // repères d'alerte au-dessus de l'axe et zones de survol
  const gap=pts.length>1?Math.min(...pts.slice(1).map((p,i)=>sx(p.t)-sx(pts[i].t)).filter(d=>d>0),60):60;
  body+=pts.map((p,i)=>{const X=sx(p.t),lvl=p.alertes.some(a=>a.niveau==='crit')?'crit':p.alertes.length?'warn':'';
   return (lvl?`<g class="sp-flag sp-t-${lvl}" transform="translate(${X-6} ${TOP-4})"><path d="M6 0 12 10H0z"/></g>`:'')+
   `<rect class="sp-hit" data-sp-i="${i}" x="${X-Math.max(gap,14)/2}" y="${TOP-8}" width="${Math.max(gap,14)}" height="${y-TOP+8}"/>`}).join('');
  body+=`<line class="sp-cross" x1="0" x2="0" y1="${TOP-6}" y2="${y}" visibility="hidden"/>`;
  graphSvg.abrege=abrege;
  return `<svg class="sp-svg" viewBox="0 0 ${W} ${y+6}" role="img" aria-label="Graphe de surveillance postopératoire : ${pts.length} relevés du ${esc(quand(win.debut))} au ${esc(quand(win.fin))}. La vue tableau donne les mêmes valeurs.">${body}</svg>`;
 }

 function tableHtml(win){
  const pts=win.points;if(!pts.length)return '';
  const rows=[['PA (mmHg)',p=>S.has(p.values.sbp)||S.has(p.values.dbp)?[fmt(p.values.sbp)+'/'+fmt(p.values.dbp),S.niveau('sbp',p.values.sbp)||S.niveau('dbp',p.values.dbp)]:null],
   ...S.MESURES.filter(m=>!['sbp','dbp'].includes(m.key)).map(m=>[m.court+' ('+m.unite+')',p=>S.has(p.values[m.key])?[fmt(p.values[m.key],m),S.niveau(m.key,p.values[m.key])]:null]),
   ...S.COTATIONS.map(c=>[['avpu','sedation','nvpo','bromage'].includes(c.key)?c.label:c.court,p=>S.has(p.values[c.key])?[['avpu','sedation','nvpo','bromage'].includes(c.key)?String(p.values[c.key]):S.libelleOption(c.key,p.values[c.key]),S.niveauCotation(c.key,p.values[c.key])]:null]),
   ...(N?.news2?[['NEWS2',p=>{const n=N.news2(p.values);return n.mesures?[n.total+(n.complet?'':' (partiel)'),n.total>=7?'crit':n.total>=5?'warn':'']:null}]]:[]),
   ['Lieu',p=>[p.values.location||'','']]].filter(([,f])=>pts.some(p=>f(p)));
  return `<div class="sp-tablewrap"><table class="sp-table"><caption class="sp-sr">Relevés de surveillance postopératoire, du plus ancien au plus récent</caption><thead><tr><th scope="col">Paramètre</th>${pts.map(p=>`<th scope="col">${esc(jour(p.t))}<br>${esc(heure(p.t))}</th>`).join('')}</tr></thead><tbody>${rows.map(([lab,f])=>`<tr><th scope="row">${esc(lab)}</th>${pts.map(p=>{const r=f(p);return `<td class="${r&&r[1]&&r[1]!=='info'?'sp-td-'+r[1]:''}">${r?esc(r[0]):''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
 }

 function graphBody(records){
  const all=chrono(records);dernier=all.length?{bromage:[...all].reverse().find(p=>S.has(p.values.bromage))?.values.bromage,o2Flow:[...all].reverse().find(p=>S.has(p.values.o2Flow))?.values.o2Flow}:null;
  if(dernier&&!S.has(dernier.bromage)&&!S.has(dernier.o2Flow))dernier=null;
  if(!all.length)return `<div class="sp-empty"><b>Aucun relevé pour l’instant.</b><span>Le graphe se construit dès le premier relevé : PA, FC, SpO₂, FR, température, douleur, conscience, sédation, NVPO, pansement, diurèse, drains…</span></div>`;
  const win=S.fenetre(all,heures),last=all.at(-1);
  const periode=win.points.flatMap(p=>p.alertes),crit=periode.filter(a=>a.niveau==='crit').length;
  return `<div class="sp-head"><div class="sp-last-alerts"><p class="sp-kicker">Dernier relevé · ${esc(quand(last.t))} · ${esc(last.values.location||'')}</p>${last.alertes.length?alertList(last.alertes):'<p class="sp-ok">Aucune alerte sur le dernier relevé.</p>'}${periode.length>last.alertes.length?`<p class="sp-muted">${periode.length} alertes sur la période affichée, dont ${crit} d’appel médical. Survolez ou touchez les repères ▲ du graphe pour le détail.</p>`:''}</div>
   <div class="sp-tools no-print"><div class="sp-seg" role="group" aria-label="Période affichée">${FEN.map(([h,l])=>`<button type="button" data-sp-h="${h}" aria-pressed="${h===heures}">${l}</button>`).join('')}</div><div class="sp-seg" role="group" aria-label="Présentation">${[['graphe','Graphe'],['tableau','Tableau']].map(([v,l])=>`<button type="button" data-sp-v="${v}" aria-pressed="${v===vue}">${l}</button>`).join('')}</div></div></div>
   ${vue==='graphe'?`<div class="sp-scroll"><div class="sp-chart">${graphSvg(win)}<div class="sp-tip" role="status" hidden></div></div></div><p class="sp-foot">Bandes grisées : valeurs attendues. Points colorés : seuil d’alerte franchi (rouge = appel médical, orange = à surveiller). NEWS2* = score partiel.${graphSvg.abrege?' Relevés rapprochés abrégés : S sec, T taché, Sat saturé, R refait ; N/O miction non/oui.':''} Seuils par défaut à valider par l’équipe d’anesthésie.</p>`:tableHtml(win)}`;
 }
 function graph(records){return `<div class="sp-graph" data-sp-graph>${graphBody(records)}</div>`}

 function tipHtml(p){const v=p.values,out=[];
  if(S.has(v.sbp)||S.has(v.dbp))out.push(['PA',fmt(v.sbp)+'/'+fmt(v.dbp)+' mmHg',S.niveau('sbp',v.sbp)||S.niveau('dbp',v.dbp)]);
  for(const m of S.MESURES)if(!['sbp','dbp'].includes(m.key)&&S.has(v[m.key]))out.push([m.court,fmt(v[m.key],m)+' '+m.unite,S.niveau(m.key,v[m.key])]);
  for(const c of S.COTATIONS)if(S.has(v[c.key]))out.push([c.court,S.libelleOption(c.key,v[c.key]),S.niveauCotation(c.key,v[c.key])]);
  if(N?.news2){const n=N.news2(v);if(n.mesures)out.push(['NEWS2',n.total+(n.complet?'':' (partiel)'),n.total>=7?'crit':n.total>=5?'warn':''])}
  return `<p class="sp-tip-h"><b>${esc(quand(p.t))}</b> · ${esc(v.location||'')}</p><dl>${out.map(([k,val,l])=>`<dt>${esc(k)}</dt><dd class="${l&&l!=='info'?'sp-t-'+l:''}">${esc(val)}</dd>`).join('')}</dl>${S.has(v.note)?`<p class="sp-tip-note">${esc(v.note)}</p>`:''}${p.alertes.length?alertList(p.alertes):''}<p class="sp-tip-by">${esc(p.record.author||'')}${p.record.photo?' · source photo validée':''}</p>`}

 function bind(root,records){
  const host=root?.querySelector('[data-sp-graph]');
  if(host){
   host.onclick=e=>{const h=e.target.closest('[data-sp-h]'),v=e.target.closest('[data-sp-v]');if(h)heures=Number(h.dataset.spH);if(v)vue=v.dataset.spV;if(h||v){host.innerHTML=graphBody(records());bindChart(host,records)}};
   bindChart(host,records);
  }
  const f=root?.querySelector('#postop-vitals-form');
  if(f){const box=f.querySelector('.sp-preview');f.addEventListener('input',()=>{box.innerHTML=previewHtml(Object.fromEntries(new FormData(f)))});
   f.querySelector('[name=o2]')?.addEventListener('change',e=>{if(e.target.value==='Air'){const fl=f.querySelector('[name=o2Flow]');if(fl)fl.value=''}})}
 }
 function bindChart(host,records){
  const svg=host.querySelector('.sp-svg'),tip=host.querySelector('.sp-tip');if(!svg||!tip)return;
  const win=S.fenetre(chrono(records()),heures),cross=svg.querySelector('.sp-cross');
  const show=el=>{const p=win.points[Number(el.dataset.spI)];if(!p)return;const box=svg.getBoundingClientRect(),hb=el.getBoundingClientRect(),X=Number(el.getAttribute('x'))+Number(el.getAttribute('width'))/2;
   cross.setAttribute('x1',X);cross.setAttribute('x2',X);cross.setAttribute('visibility','visible');
   tip.innerHTML=tipHtml(p);tip.hidden=false;const cx=hb.left+hb.width/2-box.left,right=cx>box.width*0.6;
   tip.style.left=right?'':(cx+14)+'px';tip.style.right=right?(box.width-cx+14)+'px':'';tip.style.top='34px'};
  svg.querySelectorAll('.sp-hit').forEach(el=>{el.addEventListener('pointerenter',()=>show(el));el.addEventListener('click',()=>show(el))});
  svg.addEventListener('pointerleave',()=>{tip.hidden=true;cross.setAttribute('visibility','hidden')});
 }
 function alertesHtml(values){const a=S.alertes(values);return a.length?alertList(a):''}
 return {form,graph,bind,decrire:S.decrire,verifier:S.verifier,renseigne:S.renseigne,alertesHtml};
};
})();

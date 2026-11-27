/* IASELO · écran de codage CCAM de l'intervention (onglet « Codage PMSI » du dossier), sur le modèle d'E-med :
   en-tête de l'intervention, actes (activité 1 chirurgien, activité 4 anesthésie, actes complémentaires de
   l'anesthésiste) et un panneau par praticien avec modificateurs, code d'association, tarif et total.
   Chaque praticien coche et valide sa partie ; le DIM valide chaque ligne. Règles : dist/codage-ccam-regles.js.
   Le serveur refuse qu'un praticien modifie la part de l'autre (worker/professional-access.mjs). */
(function(root){
'use strict';
const R=()=>root.IaseloCodageCcam;
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euros=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const frDT=iso=>iso?new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const style=document.createElement('style');
style.textContent=`.cc-entete{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px 16px}.cc-entete label{display:grid;gap:3px;font-size:13px}.cc-entete input,.cc-entete select{width:100%}
.cc-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,470px);gap:16px;align-items:start}@media(max-width:1100px){.cc-cols{grid-template-columns:1fr}}
.cc-acte{border:1px solid var(--border,#d8e0e2);border-radius:12px;overflow:hidden;margin:0 0 12px;background:var(--i-s1,#fff)}
.cc-acte>header{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--i-acc,#1f6b78);color:#fff}.cc-acte>header b{font-size:15px}.cc-acte>header button{background:transparent;border:1px solid rgba(255,255,255,.6);color:#fff;border-radius:8px;padding:2px 10px;cursor:pointer}
.cc-acte .cc-corps{padding:8px 12px;display:grid;gap:4px}.cc-acte label{display:flex!important;flex-direction:row!important;gap:8px;align-items:flex-start;font-size:13px;font-weight:500;margin:0!important}.cc-acte label input{margin-top:2px}.cc-acte .cc-compl{padding-left:22px;color:var(--muted,#5b6b73)}.cc-acte .cc-prat{color:var(--muted,#5b6b73)}
.cc-panneau{border:1px solid var(--border,#d8e0e2);border-radius:12px;overflow:hidden;margin:0 0 12px;background:var(--i-s1,#fff)}.cc-panneau>header{padding:8px 12px;background:var(--i-acc,#1f6b78);color:#fff;font-weight:600;text-align:center}
.cc-panneau table{width:100%;border-collapse:collapse;font-size:13px}.cc-panneau td,.cc-panneau th{padding:5px 6px;border-top:1px solid var(--border,#e5eaeb);text-align:left;vertical-align:middle}.cc-panneau td.num,.cc-panneau th.num{text-align:right;white-space:nowrap}
.cc-panneau tfoot td{font-weight:700}.cc-panneau .cc-pied{padding:8px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.cc-mods{display:inline-flex;flex-wrap:wrap;gap:3px}.cc-mod{min-width:24px;padding:1px 6px;border-radius:6px;border:1px solid var(--border,#c9d3d6);background:transparent;font:600 12px/1.5 inherit;cursor:pointer;color:inherit}.cc-mod.on{background:var(--i-acc,#1f6b78);border-color:var(--i-acc,#1f6b78);color:#fff}.cc-mod:disabled{cursor:default;opacity:.85}
.cc-panneau select{padding:2px 4px;font-size:12px;min-height:0}.cc-panneau input.cc-modtxt{width:56px;padding:2px 4px;font-size:12px;min-height:0}.cc-ok{color:var(--i-ok,#1e7a45);font-weight:600}.cc-ajout{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.cc-ajout input{width:130px}
.cc-panneau input.cc-euro{width:70px;padding:2px 4px;font-size:12px;min-height:0;text-align:right}.cc-panneau tfoot tr.cc-tot-g td{border-top:2px solid var(--border,#c9d3d6)}.cc-manuel{display:block;font-size:11px;color:var(--muted,#5b6b73);font-weight:400}
.cc-note{font-size:12px;color:var(--muted,#5b6b73);margin:4px 12px 8px}`;
document.head.append(style);

function defauts(stay){
 const f=stay.surgicalAnnouncement?.published?.fields||{},ev=(stay.peropRapide?.evenements||[]).find(x=>!x.annule&&x.label==='Entrée en salle');
 const d=ev?new Date(ev.at):null,pad=n=>String(n).padStart(2,'0');
 return {date:d?d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()):String(f.date||stay.ext?.surgeryDate||'').slice(0,10),heure:d?pad(d.getHours())+':'+pad(d.getMinutes()):String(f.time||''),
  chirurgien:f.surgeon||'',anesthesiste:'',typeAnesthesie:'',lieu:'Bloc chirurgical',salle:'',usDemandeuse:stay.mode||'',prescripteur:f.surgeon||''};
}
// Droits à l'écran (le serveur refait le contrôle) : chacun sa partie, le DIM tout.
const peut=(o,cle)=>o.edit&&(o.job==='dim'||!o.job||R().PANNEAUX[cle].metier===o.job);

function html(stay,o){
 const C=R(),c=C.normaliser(stay.codage),e={...defauts(stay),...c.entete},ix=o.ix,coder=o.edit;
 const val={chirurgien:c.validations?.['1'],anesthesie:c.validations?.['4']};
 const verrou=cle=>!peut(o,cle)||!!val[cle];
 const champ=(k,l,type='text',opts)=>`<label>${ESC(l)}${opts?`<select data-cc-entete="${k}" ${coder?'':'disabled'}><option value=""></option>${Object.entries(opts).map(([v,x])=>`<option value="${ESC(v)}" ${String(e[k])===v?'selected':''}>${ESC(v+' · '+x)}</option>`).join('')}</select>`:`<input type="${type}" data-cc-entete="${k}" value="${ESC(e[k])}" ${coder?'':'disabled'}>`}</label>`;
 const entete=`<section class="v-card"><header class="v-card-head"><div><h4>Intervention</h4><p>Repris de l’annonce chirurgicale et de la feuille d’anesthésie ; modifiable.</p></div></header><div class="cc-entete">
  ${champ('date','Date','date')}${champ('heure','Heure','time')}${champ('chirurgien','Intervenant (chirurgien)')}${champ('anesthesiste','Anesthésiste')}${champ('typeAnesthesie','Anesthésie',null,C.TYPES_ANESTHESIE)}
  ${champ('lieu','Lieu d’exécution')}${champ('salle','Salle')}${champ('usDemandeuse','Unité demandeuse')}${champ('prescripteur','Prescripteur')}</div></section>`;
 const actes=c.lignes.map(l=>{const a1=l.activites?.['1']||{},a4=l.activites?.['4']||{},ref=ix?.parCode?.get(l.code),acts=ref?.activites||'14';
  const autres=o.job==='chirurgien'?a4.coche||Object.values(l.complements||{}).some(x=>x?.coche)||!!val.chirurgien:o.job==='anesthesiste'?a1.coche||!!val.anesthesie:false;
  const supprimable=o.edit&&(o.job==='dim'||!o.job||['chirurgien','anesthesiste'].includes(o.job)&&!autres);
  return `<article class="cc-acte"><header><span><b>${ESC(l.code)}</b> · ${ESC(l.libelle||ref?.libelle||'')}</span>${supprimable?`<button type="button" data-cc-suppr="${ESC(l.id)}" title="Retirer cet acte">Retirer</button>`:''}</header><div class="cc-corps">
   ${acts.includes('1')?`<label><input type="checkbox" data-cc-act="${ESC(l.id)}|1" ${a1.coche?'checked':''} ${verrou('chirurgien')?'disabled':''}><span><b>Activité 1</b> (chirurgien) <span class="cc-prat">${ESC(e.chirurgien||'')}</span></span></label>`:''}
   ${acts.includes('4')?`<label><input type="checkbox" data-cc-act="${ESC(l.id)}|4" ${a4.coche?'checked':''} ${verrou('anesthesie')?'disabled':''}><span><b>Anesthésie</b> (activité 4) <span class="cc-prat">${ESC(e.anesthesiste||'')}</span></span></label>`:''}
   ${C.COMPLEMENTS.map(([k,lib])=>`<label class="cc-compl"><input type="checkbox" data-cc-compl="${ESC(l.id)}|${k}" ${l.complements?.[k]?.coche?'checked':''} ${verrou('anesthesie')?'disabled':''}><span><b>${k}</b> · ${ESC(lib)}</span></label>`).join('')}
  </div></article>`}).join('');
 const ajout=coder?`<div class="cc-ajout"><input id="cc-code" maxlength="7" placeholder="Code CCAM" autocomplete="off"><button type="button" class="secondary" id="cc-ajouter">Ajouter l’acte</button><small>ou « Retenir » dans les propositions et la recherche ci-dessus.</small></div>`:'';
 const panneaux=Object.keys(C.PANNEAUX).map(cle=>{const p=C.panneau(c,cle,ix),lock=verrou(cle),nom=cle==='chirurgien'?e.chirurgien:e.anesthesiste,dim=o.job==='dim'&&o.edit;
  const ligne=x=>{const ok=C.autorises(ix,x.code,x.activite),defs=ix?.modificateurs||{};
   const modsHtml=ok?`<span class="cc-mods">${ok.split('').map(m=>`<button type="button" class="cc-mod ${x.modificateurs.includes(m)?'on':''}" data-cc-mod="${ESC(x.cle)}|${m}" title="${ESC(defs[m]?.libelle||'Modificateur '+m)}" ${lock?'disabled':''}>${m}</button>`).join('')}</span>`:`<input class="cc-modtxt" data-cc-modtxt="${ESC(x.cle)}" value="${ESC(x.modificateurs)}" maxlength="4" placeholder="—" title="Modificateurs (liste de la CCAM indisponible)" ${lock?'disabled':''}>`;
   const asso=`<select data-cc-asso="${ESC(x.cle)}" ${lock?'disabled':''}><option value="">auto (${ESC(x.associationAuto||x.associationRetenue)})</option>${Object.entries(C.ASSOCIATIONS).map(([k,v])=>`<option value="${k}" ${x.association===k?'selected':''}>${ESC(v.label)}</option>`).join('')}</select>`;
   const d=c.decisions?.[x.cle];
   return `<tr><td><b>${ESC(x.code)}</b></td><td>${x.activite}</td><td>${modsHtml}</td><td>${asso}</td><td class="num">${x.pu==null||x.tarifManuel?(lock?euros(x.montant):`<input class="cc-euro" data-cc-tarif="${ESC(x.cle)}" value="${x.tarifSaisi>0?ESC(String(x.tarifSaisi).replace('.',',')):''}" inputmode="decimal" placeholder="tarif" title="Tarif de l’acte (absent de la CCAM chargée)">`)+(x.tarifManuel?'<span class="cc-manuel">'+(lock?'tarif saisi':euros(x.montant))+'</span>':''):euros(x.montant)}</td><td class="num">${lock?(x.depassement>0?euros(x.depassement):'—'):`<input class="cc-euro" data-cc-dep="${ESC(x.cle)}" value="${x.depassement>0?ESC(String(x.depassement).replace('.',',')):Number.isNaN(x.depassement)?'?':''}" inputmode="decimal" placeholder="0" title="Dépassement d’honoraires (€)">`}</td>${dim||d?`<td>${dim&&p.validation?`<select data-cc-dim="${ESC(x.cle)}"><option value="">DIM…</option>${['Validé','Rejeté'].map(v=>`<option ${d?.decision===v?'selected':''}>${v}</option>`).join('')}</select>`:d?ESC('DIM : '+d.decision):''}</td>`:''}</tr>`};
  return `<section class="cc-panneau"><header>${ESC(p.label)}${nom?' · '+ESC(nom):''}</header>
   ${p.lignes.length?`<table><thead><tr><th>Acte</th><th>Act.</th><th>Modif.</th><th>Assoc.</th><th class="num">Valeur €</th><th class="num">Dépass. €</th>${dim||p.lignes.some(x=>c.decisions?.[x.cle])?'<th></th>':''}</tr></thead><tbody>${p.lignes.map(ligne).join('')}</tbody><tfoot><tr><td colspan="4">Base Assurance maladie</td><td class="num">${euros(p.total)}</td><td></td></tr><tr><td colspan="4">Dépassements d’honoraires</td><td></td><td class="num">${euros(p.depassements)}</td></tr><tr class="cc-tot-g"><td colspan="4">Total des honoraires</td><td class="num" colspan="2">${euros(p.totalGeneral)}</td></tr></tfoot></table>`:'<p class="cc-note">Aucun acte coché.</p>'}
   ${p.incomplet?'<p class="cc-note">Tarif inconnu pour un acte (nomenclature CCAM non chargée ou acte sans prix) : saisissez sa valeur dans la colonne « Valeur ».</p>':''}${p.lignes.some(x=>x.modificateursSansTarif)?'<p class="cc-note">Montant hors modificateur(s) sans coefficient connu.</p>':''}
   ${(()=>{const al=C.alertesVersion(c,cle,ix);return al.length?`<div class="cc-note notice warn cc-version"><b>À revoir avec la nomenclature CCAM :</b><ul>${al.map(t=>`<li>${ESC(t)}</li>`).join('')}</ul></div>`:''})()}
   <div class="cc-pied">${p.validation?`<span class="cc-ok">Validé par ${ESC(p.validation.par)} · ${ESC(frDT(p.validation.at))}</span>${peut(o,cle)?`<button type="button" class="secondary" data-cc-rouvrir="${cle}">Modifier</button>`:''}`:peut(o,cle)?`<button type="button" class="primary" data-cc-valider="${cle}" ${p.lignes.length?'':'disabled'}>Valider mon codage</button>`:`<span class="cc-note">En attente du ${cle==='chirurgien'?'chirurgien':'médecin anesthésiste'}.</span>`}</div><p class="cc-err notice warn" data-cc-err="${cle}" hidden></p></section>`}).join('');
 return entete+`<section class="v-card"><header class="v-card-head"><div><h4>Actes CCAM de l’intervention</h4><p>Cochez l’activité de chaque praticien ; les modificateurs, le code d’association et le tarif se règlent dans le panneau de droite. Montants indicatifs (prix CCAM de l’activité, modificateurs, règle d’association).</p></div></header>
  <div class="cc-cols"><div>${ajout}${actes||'<p class="v-empty">Aucun acte : retenez un acte proposé, cherchez-le dans la CCAM ou saisissez son code.</p>'}</div><div>${panneaux}</div></div></section>`;
}

function brancher(host,stay,o){
 const C=R();if(!o.edit)return;
 const lire=()=>C.normaliser(stay.codage);
 const ecrire=(c,trace)=>{const {actes,...reste}=c;stay.codage={...reste,version:2};if(trace)o.trace?.(trace);o.sauver?.();o.redessiner()};
 const ligneDe=(c,id)=>c.lignes.find(l=>l.id===id);
 const cible=(c,cle)=>{const [id,a,b]=cle.split(':'),l=ligneDe(c,id);if(!l)return null;if(a==='c'){l.complements??={};return l.complements[b]??={coche:true}}l.activites??={};return l.activites[a]??={coche:true}};
 host.querySelectorAll('[data-cc-entete]').forEach(i=>i.onchange=()=>{const c=lire();c.entete={...defauts(stay),...c.entete,[i.dataset.ccEntete]:i.value};ecrire(c)});
 host.querySelectorAll('[data-cc-act]').forEach(i=>i.onchange=()=>{const [id,a]=i.dataset.ccAct.split('|'),c=lire(),l=ligneDe(c,id);if(!l)return;l.activites??={};l.activites[a]={...(l.activites[a]||{}),coche:i.checked};ecrire(c,'Codage : '+l.code+' activité '+a+(i.checked?' cochée':' décochée'))});
 host.querySelectorAll('[data-cc-compl]').forEach(i=>i.onchange=()=>{const [id,k]=i.dataset.ccCompl.split('|'),c=lire(),l=ligneDe(c,id);if(!l)return;l.complements??={};l.complements[k]={...(l.complements[k]||{}),coche:i.checked};ecrire(c,'Codage : '+k+(i.checked?' ajouté':' retiré')+' (anesthésie, '+l.code+')')});
 host.querySelectorAll('[data-cc-mod]').forEach(b=>b.onclick=()=>{const [cle,m]=b.dataset.ccMod.split('|'),c=lire(),x=cible(c,cle);if(!x)return;const cur=C.mods(x.modificateurs);x.modificateurs=cur.includes(m)?cur.replace(m,''):C.mods(cur+m);ecrire(c)});
 host.querySelectorAll('[data-cc-modtxt]').forEach(i=>i.onchange=()=>{const c=lire(),x=cible(c,i.dataset.ccModtxt);if(!x)return;x.modificateurs=C.mods(i.value);ecrire(c)});
 const montant=(i,champ,lib)=>{const v=C.euro(i.value);if(Number.isNaN(v)||v<0||(champ==='depassement'&&v>C.DEPASSEMENT_MAX)){i.setCustomValidity('Montant en euros');i.reportValidity();return}const c=lire(),x=cible(c,i.dataset[champ==='depassement'?'ccDep':'ccTarif']);if(!x)return;if(v)x[champ]=v;else delete x[champ];const k=(i.dataset.ccDep||i.dataset.ccTarif).split(':'),code=k[1]==='c'?k[2]:(ligneDe(c,k[0])?.code||'')+' activité '+k[1];ecrire(c,lib+' '+code+' : '+(v?v.toLocaleString('fr-FR',{minimumFractionDigits:2})+' €':'retiré'))};
 host.querySelectorAll('[data-cc-dep]').forEach(i=>i.onchange=()=>setTimeout(()=>montant(i,'depassement','Codage : dépassement d’honoraires')));
 host.querySelectorAll('[data-cc-tarif]').forEach(i=>i.onchange=()=>setTimeout(()=>montant(i,'tarifSaisi','Codage : tarif saisi')));
 host.querySelectorAll('[data-cc-asso]').forEach(s=>s.onchange=()=>{const c=lire(),x=cible(c,s.dataset.ccAsso);if(!x)return;x.association=s.value;ecrire(c)});
 host.querySelectorAll('[data-cc-dim]').forEach(s=>s.onchange=()=>{const c=lire();c.decisions={...(c.decisions||{}),[s.dataset.ccDim]:{decision:s.value,by:o.who(),at:new Date().toISOString()}};if(!s.value)delete c.decisions[s.dataset.ccDim];ecrire(c,'DIM : '+s.dataset.ccDim.split(':')[0]+' '+(s.value||'décision retirée').toLowerCase())});
 host.querySelectorAll('[data-cc-suppr]').forEach(b=>b.onclick=()=>{const c=lire(),l=ligneDe(c,b.dataset.ccSuppr);if(!l)return;c.lignes=c.lignes.filter(x=>x!==l);for(const k of Object.keys(c.decisions||{}))if(k.startsWith(l.id+':'))delete c.decisions[k];ecrire(c,'Codage : acte '+l.code+' retiré')});
 host.querySelectorAll('[data-cc-valider]').forEach(b=>b.onclick=()=>{const cle=b.dataset.ccValider,c=lire(),err=C.erreurValidation(c,cle,o.ix),p=host.querySelector(`[data-cc-err="${cle}"]`);if(err){p.textContent=err;p.hidden=false;return}
  const act=C.PANNEAUX[cle].activite;c.validations={...(c.validations||{}),[act]:{par:o.who(),at:new Date().toISOString(),...(o.ix?.version?{ccam:o.ix.version}:{})}};
  if(!c.entete?.[cle==='chirurgien'?'chirurgien':'anesthesiste'])c.entete={...defauts(stay),...c.entete,[cle==='chirurgien'?'chirurgien':'anesthesiste']:o.who()};
  ecrire(c,'Codage '+(cle==='chirurgien'?'du chirurgien':'de l’anesthésie')+' validé ('+C.panneau(c,cle,o.ix).lignes.map(x=>x.code+(x.modificateurs?' '+x.modificateurs:'')).join(', ')+')');o.toast?.('Codage validé')});
 host.querySelectorAll('[data-cc-rouvrir]').forEach(b=>b.onclick=()=>{const cle=b.dataset.ccRouvrir,c=lire(),act=C.PANNEAUX[cle].activite;delete c.validations[act];for(const x of C.panneau(c,cle,o.ix).lignes)delete c.decisions?.[x.cle];ecrire(c,'Codage '+(cle==='chirurgien'?'du chirurgien':'de l’anesthésie')+' rouvert pour modification')});
 const ajouter=code=>{code=String(code||'').toUpperCase().trim();const C2=root.IaseloCcam,v=C2?C2.verifier(o.ix,code):{ok:/^[A-Z]{4}\d{3}$/.test(code)};if(!v.ok){o.toast?.(v.message);return}
  const c=lire();if(c.lignes.some(l=>l.code===code)){o.toast?.(code+' est déjà codé.');return}
  const a=o.ix?.parCode?.get(code),acts=a?.activites||'14',moi=o.job==='chirurgien'?'1':o.job==='anesthesiste'?'4':'';
  c.lignes.push({id:C.id(),code,libelle:a?.libelle||'',activites:{'1':{coche:moi==='1'&&acts.includes('1')},'4':{coche:moi==='4'&&acts.includes('4')}},complements:{}});ecrire(c,'Codage : acte '+code+' ajouté');if(v.avertissement)o.toast?.(v.avertissement)};
 const bt=host.querySelector('#cc-ajouter');if(bt){bt.onclick=()=>ajouter(host.querySelector('#cc-code').value);host.querySelector('#cc-code').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ajouter(e.target.value)}}}
 return {ajouter};
}
root.IaseloCodageEcran={html,brancher};
})(window);

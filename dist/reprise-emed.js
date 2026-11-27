/* IASELO · écran « Reprise des dossiers » (administrateur) : import des dossiers d'E-med depuis HL7 v2, HPRIM Santé,
   FHIR R4 ou CSV. Aperçu, rapprochement avec les patients existants, choix ligne par ligne, puis écriture tracée.
   Règles : reprise-emed-regles.js. Les données reprises vont dans la consultation non commencée (champs vides seulement)
   et le détail repris est écrit dans l'historique du dossier (events), à relire. */
(function(root){
'use strict';
root.createRepriseEmed=function(ctx){
 const {esc,toast}=ctx,R=()=>root.IaseloRepriseEmed;let lu=null,source='',choix={},erreur='',bilan=null;
 const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6M8 14h8M8 17h5"/><path d="m11 9-3 3 3 3"/></svg>';
 function bouton(){
  if(document.querySelector('aside .nav[data-view="repriseEmed"]'))return;
  const apres=document.querySelector('aside .nav[data-view="etablissement"]')||document.querySelector('aside .nav[data-view="fhir"]');if(!apres)return;
  const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.view='repriseEmed';b.innerHTML=ICON+'Reprise des dossiers';b.onclick=()=>ctx.go('repriseEmed');apres.after(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bouton,400));else setTimeout(bouton,400);
 const style=document.createElement('style');
 style.textContent=`.re-card{border:1px solid var(--border,#dfe5ea);border-radius:14px;background:var(--i-s1,#fff);padding:16px;margin:0 0 14px}.re-card h2{font-size:1.05rem;margin:0 0 8px}
.re-mut{color:#55636a;font-size:14px}.re-formats{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.re-formats span{border:1px solid var(--border,#d6dde2);border-radius:999px;padding:3px 10px;font-size:13px}
.re-table{width:100%;border-collapse:collapse;font-size:14px}.re-table th,.re-table td{border-top:1px solid var(--border,#e3e8ec);padding:8px 6px;text-align:left;vertical-align:top}.re-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#55636a}
.re-table select{min-width:220px;padding:6px}.re-al{color:#8a1c1c;font-weight:600}.re-warn{background:#fff6e4;border-left:3px solid #c98a12;padding:8px 10px;border-radius:6px;font-size:14px}
.re-ok{background:#e3f1e7;border-left:3px solid #2f7a45;padding:8px 10px;border-radius:6px}.re-wrap{overflow-x:auto}
:where(:root[data-theme=dark]) .re-warn{background:#2b2414}:where(:root[data-theme=dark]) .re-ok{background:#16281c}`;
 document.head.append(style);
 const sejours=()=>ctx.patients.filter(s=>s&&s.id&&s.identity);
 const nomS=s=>[String(s.identity?.lastName||'').toUpperCase(),s.identity?.firstName].filter(Boolean).join(' ')+' · '+(s.identity?.birthDate||'')+' · '+s.id;
 const frDate=d=>d?d.split('-').reverse().join('/'):'—';
 function analyser(texte,nom,fichiers){
  erreur='';bilan=null;choix={};
  try{lu=fichiers?R().lirePlusieurs(fichiers):R().lire(texte,nom);source=fichiers?fichiers.map(f=>f.nom).join(', '):nom;
   lu.patients.forEach((p,i)=>{p.rapp=R().rapprocher(p,sejours());choix[i]=p.manque.length?'ignorer':p.rapp.auto||(p.rapp.candidats.length?'ignorer':'nouveau')})}
  catch(e){lu=null;erreur=e.message}
  draw();
 }
 function appliquer(){
  const team=document.querySelector('#re-team')?.value||ctx.teams?.()[0]?.id||'demo-clinique';let crees=0,completes=0;const notes=[];
  lu.patients.forEach((p,i)=>{
   const c=choix[i];if(!c||c==='ignorer')return;let s;
   if(c==='nouveau'){const id=p.identite;s={id:'DÉMO-'+crypto.randomUUID().slice(0,12),identity:{lastName:id.nom,firstName:id.prenom,birthDate:id.naissance,...(id.nomUsage?{usageName:id.nomUsage}:{}),...(id.sexe?{sex:id.sexe}:{}),...(id.ipp?{ipp:id.ipp}:{}),...(id.ins?{ins:id.ins}:{})},careTeamId:team,specialty:'Non renseignée',mode:p.venue?.classe==='Ambulatoire'?'Ambulatoire':'Hospitalisation',stage:'Consultation',task:'Dossier repris d’E-med : à relire',done:false,consult:{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},events:[]};ctx.patients.push(s);crees++}
   else s=ctx.patients.find(x=>x.id===c);
   if(!s)return;
   const v=R().versConsultation(s.consult,p);s.consult=v.consult;if(v.note)notes.push(nomS(s));
   const detail=[p.allergies.length?'Allergies : '+p.allergies.join(' ; '):p.aucuneAllergie?'Aucune allergie connue':'',p.antecedents.length?'Antécédents : '+p.antecedents.join(' ; '):'',p.traitements.length?'Traitements : '+p.traitements.join(' ; '):'',
    [p.mesures.poids&&p.mesures.poids+' kg',p.mesures.taille&&p.mesures.taille+' cm',p.mesures.groupeSanguin&&'groupe '+p.mesures.groupeSanguin].filter(Boolean).join(', '),p.biologie.length?p.biologie.reduce((n,d)=>n+d.resultats.length,0)+' résultat(s) de biologie':''].filter(Boolean).join(' · ');
   (s.events??=[]).unshift({at:new Date().toLocaleString('fr-FR'),role:ctx.role(),text:'Dossier repris d’E-med ('+lu.format+', '+source+') : '+(v.faits.length?v.faits.join(', ')+' versés dans la consultation, à relire':'consultation déjà commencée, à reporter')+'. '+detail,kind:'Reprise E-med'});
   if(c!=='nouveau')completes++;
  });
  document.dispatchEvent(new Event('change',{bubbles:true}));
  bilan={crees,completes,notes};lu=null;draw();toast(crees+' dossier(s) créé(s), '+completes+' complété(s)');
 }
 function draw(){
  const c=document.querySelector('#workspace');if(!c)return;
  const teams=ctx.teams?.()||[];
  c.innerHTML=`<section class="re-card" aria-labelledby="re-h1"><h2 id="re-h1">Importer un export d’E-med</h2>
   <p class="re-mut">IASELO lit les formats d’échange publics. Rien n’est enregistré avant votre validation ; les données reprises sont marquées « à relire » et la consultation déjà commencée n’est jamais modifiée.</p>
   <div class="re-formats"><span>HL7 v2 (ADT, ORU)</span><span>HPRIM Santé</span><span>FHIR R4 (JSON)</span><span>CDA R2 (XML, documents du DMP)</span><span>CSV (tableur)</span></div>
   <p><label class="secondary" style="display:inline-block;cursor:pointer;padding:8px 14px;border-radius:8px">Choisir un ou plusieurs fichiers…<input type="file" id="re-file" multiple accept=".hl7,.hpr,.hprim,.txt,.json,.xml,.csv,.tsv" hidden></label>
   <button type="button" class="secondary" id="re-modele">Télécharger le modèle CSV</button></p>
   ${erreur?`<p class="re-warn" role="alert">${esc(erreur)}</p>`:''}
   ${bilan?`<p class="re-ok" role="status">${bilan.crees} dossier(s) créé(s), ${bilan.completes} complété(s). Chaque dossier porte la mention « repris d’E-med, à relire » dans son historique.${bilan.notes.length?' Consultation déjà commencée, données à reporter depuis l’historique du dossier : '+esc(bilan.notes.join(' ; '))+'.':''}</p>`:''}
  </section>
  ${lu?`<section class="re-card" aria-labelledby="re-h2"><h2 id="re-h2">${lu.patients.length} patient(s) · ${esc(lu.format)} · ${esc(source)}</h2>
   ${lu.avertissements.length?`<details class="re-warn"><summary>${lu.avertissements.length} élément(s) non repris</summary><ul>${lu.avertissements.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></details>`:''}
   <div class="re-wrap"><table class="re-table"><caption class="a11y-masque">Patients lus dans le fichier et dossier IASELO choisi</caption><thead><tr><th scope="col">Patient</th><th scope="col">Allergies</th><th scope="col">Antécédents · traitements</th><th scope="col">Mesures</th><th scope="col">Dossier IASELO</th></tr></thead><tbody>
   ${lu.patients.map((p,i)=>{const id=p.identite;return `<tr><td><strong>${esc(id.nom)} ${esc(id.prenom)}</strong>${id.nomUsage?'<br><span class="re-mut">usage : '+esc(id.nomUsage)+'</span>':''}<br><span class="re-mut">${esc(frDate(id.naissance))}${id.sexe?' · '+esc(id.sexe):''}${id.ipp?' · IPP '+esc(id.ipp):''}${id.ins?' · INS':''}</span>${p.manque.length?`<br><span class="re-al">Manque : ${esc(p.manque.join(', '))}</span>`:''}</td>
    <td>${p.allergies.length?`<span class="re-al">${esc(p.allergies.join(' ; '))}</span>`:p.aucuneAllergie?'Aucune allergie connue':'—'}</td>
    <td>${esc(p.antecedents.join(' ; ')||'—')}<br><span class="re-mut">${esc(p.traitements.join(' ; ')||'Aucun traitement')}</span>${p.biologie.length?`<br><span class="re-mut">${p.biologie.reduce((n,d)=>n+d.resultats.length,0)} résultat(s) de biologie</span>`:''}</td>
    <td>${[p.mesures.poids&&p.mesures.poids+' kg',p.mesures.taille&&p.mesures.taille+' cm',p.mesures.imc&&'IMC '+p.mesures.imc,p.mesures.groupeSanguin&&'Groupe '+p.mesures.groupeSanguin].filter(Boolean).map(esc).join('<br>')||'—'}</td>
    <td><select data-choix="${i}" aria-label="Dossier IASELO pour ${esc(id.nom)} ${esc(id.prenom)}">
     <option value="ignorer" ${choix[i]==='ignorer'?'selected':''}>Ne pas reprendre</option>${p.manque.length?'':`<option value="nouveau" ${choix[i]==='nouveau'?'selected':''}>Créer un nouveau dossier</option>`}
     ${p.rapp.candidats.map(x=>{const s=ctx.patients.find(y=>y.id===x.stay);return s?`<option value="${esc(s.id)}" ${choix[i]===s.id?'selected':''}>${esc(x.niveau)} : ${esc(nomS(s))} (${esc(x.motif)})</option>`:''}).join('')}
    </select></td></tr>`}).join('')}
   </tbody></table></div>
   <p style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">${teams.length>1?`<label style="margin:0">Équipe des nouveaux dossiers <select id="re-team">${teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name||t.id)}</option>`).join('')}</select></label>`:''}
   <button type="button" class="primary" id="re-go">Reprendre ${Object.values(choix).filter(v=>v!=='ignorer').length} dossier(s)</button></p></section>`:''}`;
  c.querySelector('#re-file').onchange=async e=>{const fs=[...e.target.files];if(!fs.length)return;if(fs.length>200||fs.some(f=>f.size>5e6)){toast('200 fichiers de 5 Mo au plus');return}
   const lus=await Promise.all(fs.map(async f=>{const buf=await f.arrayBuffer();let txt=new TextDecoder('utf-8').decode(buf);if(txt.includes('\uFFFD'))txt=new TextDecoder('windows-1252').decode(buf);return {nom:f.name,texte:txt}}));
   lus.length===1?analyser(lus[0].texte,lus[0].nom):analyser('','',lus)};
  c.querySelector('#re-modele').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+R().MODELE_CSV],{type:'text/csv'}));a.download='modele-reprise-emed.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  c.querySelectorAll('[data-choix]').forEach(s=>s.onchange=()=>{choix[s.dataset.choix]=s.value;const b=c.querySelector('#re-go');if(b)b.textContent='Reprendre '+Object.values(choix).filter(v=>v!=='ignorer').length+' dossier(s)'});
  const go=c.querySelector('#re-go');if(go)go.onclick=()=>{if(!Object.values(choix).some(v=>v!=='ignorer')){toast('Aucun dossier choisi.');return}appliquer()};
 }
 function render(){
  const t=document.querySelector('#title');if(t)t.textContent='Reprise des dossiers';document.body.classList.remove('j-home');
  const nw=document.querySelector('#new');if(nw)nw.hidden=true;const st=document.querySelector('#stats');if(st)st.hidden=true;
  document.querySelectorAll('aside .nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='repriseEmed'));
  draw();
 }
 // Exposé pour les tests de bout en bout (analyse d'un texte sans passer par le sélecteur de fichier).
 root.IaseloRepriseEmedUI={analyser:(txt,nom)=>analyser(txt,nom),plusieurs:fichiers=>analyser('','',fichiers)};
 return {render};
};
})(typeof self!=='undefined'?self:this);

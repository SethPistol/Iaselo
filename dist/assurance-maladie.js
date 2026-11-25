/* IASELO · outil « Assurance maladie » (page Outils) : droits du patient, résumé PMSI, facture du séjour, retours.
   Veille du 25/11/2026 : ce qu'une clinique privée doit transmettre à l'Assurance maladie pour être payée.
   Règles : dist/assurance-maladie-regles.js · serveur : worker/assurance-maladie.mjs (qui refait les contrôles et les droits). */
(function(root){
'use strict';
const OUTILS=root.IaseloOutils=root.IaseloOutils||{};
const A=()=>root.IaseloAssurance;
const opts=(obj,sel,vide)=>(vide!==undefined?`<option value="">${vide}</option>`:'')+Object.entries(obj).map(([k,v])=>`<option value="${k}" ${String(k)===String(sel??'')?'selected':''}>${String(typeof v==='object'?v.label:v).replace(/</g,'&lt;')}</option>`).join('');
const euros=v=>(Number(v)||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const TON={paye:'ok',pret:'ok',transmise:'',rejete:'crit',facture:'warn',pmsi:'warn',droits:'warn'};

function constats(K,liste,section){
 const l=liste.filter(c=>!section||c.section===section);
 if(!l.length)return `<p class="mk-ok">${section?'Rien ne bloque cette partie.':'Dossier complet.'}</p>`;
 return `<ul class="mk-mini am-constats">${l.map(c=>`<li class="${c.niveau==='bloquant'?'am-bloquant':'am-alerte'}">${K.chip(c.niveau==='bloquant'?'Bloquant':'À vérifier',c.niveau==='bloquant'?'crit':'warn')} ${K.esc(c.message)}</li>`).join('')}</ul>`;
}
function entete(K,j){
 const d=j.dossier,i=d.contexte.identite,b=d.constats.filter(c=>c.niveau==='bloquant').length;
 return `<div class="mk-card am-entete"><div><b>${K.esc([String(i.lastName||'').toUpperCase(),i.firstName].filter(Boolean).join(' '))}</b> ${i.birthDate?'· né(e) le '+K.esc(K.fr(i.birthDate)):''} · ${K.esc(d.contexte.mode||'mode à préciser')}
  <small>INS ${d.contexte.insQualifiee?'qualifiée':'non qualifiée'}${d.facture.reference?' · facture '+K.esc(d.facture.reference):''}</small></div>
  <div>${K.chip(d.etape.label,TON[d.etape.cle]||'')} ${b?K.chip(b+' bloquant'+(b>1?'s':''),'crit'):''}</div></div>`;
}

OUTILS.assurance={
 async html(K){
  const e=K.etat.assurance??={};const stay=K.sejourCourant('assurance');
  if(!stay&&!e.onglet)e.onglet='suivi';
  const choix=`<div class="mk-row"><label>Séjour<select class="mk-patient" data-mk-choix="assurance"><option value="">Tous les séjours (suivi)</option>${K.patients().map(s=>`<option value="${K.esc(s.id)}" ${s.id===stay?'selected':''}>${K.esc(K.nomPatient(s))}${K.naissance(s)?' · '+K.esc(K.naissance(s)):''}</option>`).join('')}</select></label></div>`;
  if(!stay){
   const j=await K.api('assurance');e.onglet='suivi';
   const compte=k=>j.liste.filter(x=>x.etape.cle===k).length;
   return `<p class="mk-intro">Ce que la clinique doit transmettre à l’Assurance maladie pour chaque séjour : <b>droits du patient</b>, <b>résumé PMSI</b> validé par le DIM, <b>facture</b> (GHS, forfaits, implants, honoraires) et suivi des <b>retours</b> (paiements, rejets). Les liaisons avec les logiciels agréés (PMSI, facturation B2, ADRi, ROC) fonctionnent en <b>simulation</b> tant que la clinique n’a pas fourni ses accès.</p>${choix}
    <div class="am-compteurs">${[['droits','Droits à vérifier'],['pmsi','PMSI à compléter'],['facture','Facture à compléter'],['pret','Prêts à facturer'],['transmise','En attente de retour'],['rejete','Rejetés'],['paye','Payés']].map(([k,l])=>`<div class="mk-card"><b>${compte(k)}</b><span>${l}</span></div>`).join('')}</div>
    <table class="mk-table"><thead><tr><th>Patient</th><th>Étape</th><th>Points bloquants</th><th>Sortie</th><th></th></tr></thead><tbody>${j.liste.map(x=>`<tr><td><b>${K.esc(x.nom||x.stay)}</b><small>${x.naissance?'né(e) le '+K.esc(K.fr(x.naissance)):''} · ${K.esc(x.stage||'')}</small></td><td>${K.chip(x.etape.label,TON[x.etape.cle]||'')}</td><td>${x.bloquants?K.chip(String(x.bloquants),'crit'):'—'}${x.alertes?' '+K.chip(x.alertes+' à vérifier','warn'):''}</td><td>${x.sortie?K.esc(K.fr(x.sortie)):'—'}${x.delai&&x.delai.reste<60?`<small>${x.delai.reste<0?'délai d’un an dépassé':'reste '+x.delai.reste+' j pour facturer'}</small>`:''}</td><td><button type="button" class="secondary" data-am-ouvrir="${K.esc(x.stay)}">Ouvrir</button></td></tr>`).join('')||'<tr><td colspan="5">Aucun séjour dans votre périmètre.</td></tr>'}</tbody></table>`;
  }
  const j=await K.api('assurance',{q:'stay='+encodeURIComponent(stay)}),d=j.dossier,peut=j.peut,R=A();e.j=j;
  if(!e.onglet||e.onglet==='suivi')e.onglet=peut.pmsi&&!peut.droits?'pmsi':peut.facture?'facture':'droits';
  const nb=s=>d.constats.filter(c=>c.section===s&&c.niveau==='bloquant').length||'';
  const o=K.onglets('assurance',[['droits','Droits du patient',nb('droits')],['pmsi','Résumé PMSI',nb('pmsi')],...(d.preFacture?[['facture','Facture',nb('facture')]]:[]),['retours','Envois & retours',j.retours.filter(r=>r.status==='rejet').length||'']]);
  const verrou=['transmise','paye'].includes(d.statut),dis=v=>v&&!verrou?'':'disabled';
  let corps='';
  if(e.onglet==='droits'){const x=d.droits,ed=dis(peut.droits);
   corps=`<form class="mk-card" data-mk-action="droits" data-am-section="droits" data-mk-ok="Droits enregistrés"><h3>Couverture sociale</h3><p class="mk-sub">À reprendre de la carte Vitale, de l’appli carte Vitale ou de l’attestation de droits. Le NIR est celui de l’assuré qui ouvre les droits (parent pour un enfant).</p>
    <div class="mk-grid"><label>NIR de l’assuré (15 caractères)<input name="nir" value="${K.esc(x.nir||'')}" maxlength="21" autocomplete="off" inputmode="text" ${ed}></label><label>Qualité du patient<select name="qualite" ${ed}>${opts(R.QUALITES,x.qualite,'Choisir…')}</select></label>
    <label>Régime<select name="regime" ${ed}>${opts(R.REGIMES,x.regime,'Choisir…')}</select></label><label>Précision du régime<input name="regimeDetail" value="${K.esc(x.regimeDetail||'')}" placeholder="ex. SNCF, ENIM, CEAM Belgique" ${ed}></label>
    <label>Caisse (3 chiffres)<input name="caisse" value="${K.esc(x.caisse||'')}" maxlength="3" inputmode="numeric" ${ed}></label><label>Centre de gestion<input name="centre" value="${K.esc(x.centre||'')}" maxlength="4" ${ed}></label>
    <label>Nature d’assurance<select name="nature" ${ed}>${opts(R.NATURES_ASSURANCE,x.nature,'Choisir…')}</select></label><label>Date de l’accident du travail<input type="date" name="dateAccident" value="${K.esc(x.dateAccident||'')}" ${ed}></label>
    <label>Exonération du ticket modérateur<select name="exoneration" ${ed}>${opts(R.EXONERATIONS,x.exoneration,'Choisir…')}</select></label><label>ALD : protocole de soins (référence, échéance)<input name="aldProtocole" value="${K.esc(x.aldProtocole||'')}" ${ed}></label>
    <label>Vérification des droits<select name="acquisition" ${ed}>${opts(R.ACQUISITIONS,x.acquisition||'aucune')}</select></label><label>Fin des droits<input type="date" name="finDroits" value="${K.esc(x.finDroits||'')}" ${ed}></label></div>
    <h3>Complémentaire santé</h3><div class="mk-grid"><label>Complémentaire<select name="amc" ${ed}>${opts({oui:'Oui',non:'Non'},x.amc,'À préciser')}</select></label><label>Numéro de l’organisme (AMC)<input name="amcNumero" value="${K.esc(x.amcNumero||'')}" maxlength="10" inputmode="numeric" ${ed}></label>
    <label>Nom de la mutuelle<input name="amcNom" value="${K.esc(x.amcNom||'')}" ${ed}></label><label>N° d’adhérent<input name="amcAdherent" value="${K.esc(x.amcAdherent||'')}" ${ed}></label><label>Tiers payant complémentaire<select name="tiersPayantAmc" ${ed}>${opts({1:'Oui',0:'Non'},x.tiersPayantAmc?1:0)}</select></label></div>
    ${peut.droits&&!verrou?'<button class="primary" type="submit">Enregistrer</button>':''}</form>
    <div class="mk-card"><h3>Vérifications en ligne</h3>
     <p>${x.adri?K.chip(x.adri.ouverts?'Droits ouverts':'Droits fermés',x.adri.ouverts?'ok':'crit')+' '+K.esc(K.fr(x.adri.date))+' · réf. '+K.esc(x.adri.reference)+(x.adri.simulation?' · simulation':''):'<span class="mk-sub">Droits AMO pas encore interrogés.</span>'}</p>
     <p>${x.roc?K.chip('Accord complémentaire','ok')+' '+K.esc(x.roc.detail)+' · réf. '+K.esc(x.roc.reference):'<span class="mk-sub">Pas d’accord de la complémentaire (ROC).</span>'}</p>
     ${peut.droits&&!verrou?`<div class="mk-row"><button type="button" class="secondary" data-mk-btn="adri" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Droits interrogés">Interroger les droits (ADRi)</button><button type="button" class="secondary" data-mk-btn="roc" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Accord demandé">Demander l’accord de la complémentaire (ROC)</button></div>`:''}
     <p class="mk-sub">ADRi : ${K.esc(j.connecteurs.adri.etat)} · ROC : ${K.esc(j.connecteurs.roc.etat)}</p></div>
    <div class="mk-card"><h3>Contrôles</h3>${constats(K,d.constats,'droits')}</div>`}
  if(e.onglet==='pmsi'){const p=d.pmsi||{},c=d.contexte,ed=dis(peut.pmsi);
   if(!d.clinique)corps=`<div class="mk-card"><p>Le résumé PMSI (diagnostics, actes) est réservé aux médecins et au DIM.</p><p>${p.valide?K.chip('Validé par le DIM','ok')+' '+K.esc(K.fr(p.valide.le)):K.chip('Pas encore validé','warn')}${p.envoi?' · '+K.chip('Envoyé au logiciel PMSI','ok'):''}</p>${constats(K,d.constats,'pmsi')}</div>`;
   else corps=`<form class="mk-card" data-mk-action="pmsi" data-am-section="pmsi" data-mk-ok="Résumé PMSI enregistré"><h3>Séjour</h3>
    <div class="mk-grid"><label>Entrée<input type="date" name="entree" value="${K.esc(p.entree||'')}" ${ed}></label><label>Sortie<input type="date" name="sortie" value="${K.esc(p.sortie||'')}" ${ed}></label>
    <label>Mode d’entrée<select name="modeEntree" ${ed}>${opts(R.MODES_ENTREE,p.modeEntree,'Choisir…')}</select></label><label>Provenance<select name="provenance" ${ed}>${opts(R.PROVENANCES,p.provenance)}</select></label>
    <label>Mode de sortie<select name="modeSortie" ${ed}>${opts(R.MODES_SORTIE,p.modeSortie,'Choisir…')}</select></label><label>Destination<select name="destination" ${ed}>${opts(R.DESTINATIONS,p.destination)}</select></label></div>
    <h3>Diagnostics (CIM-10)</h3><div class="mk-grid"><label>Diagnostic principal<input name="dp" value="${K.esc(p.dp||'')}" placeholder="ex. M16.1" maxlength="8" ${ed}></label><label>Diagnostic relié (si DP en Z)<input name="dr" value="${K.esc(p.dr||'')}" maxlength="8" ${ed}></label>
    <label class="am-large">Diagnostics associés significatifs (séparés par des virgules)<input name="das" value="${K.esc((p.das||c.diagnostics||[]).join(', '))}" ${ed}></label></div>
    ${!p.das&&c.diagnostics?.length?`<p class="mk-sub">Préremplis avec les diagnostics retenus par le DIM dans l’onglet Codage PMSI du dossier.</p>`:''}
    <h3>Actes CCAM</h3><p class="mk-sub">Repris de l’onglet Codage PMSI du dossier (confirmés par le praticien, validés par le DIM). Activité 4 : la classe ASA de la consultation est l’extension documentaire obligatoire.</p>
    <table class="mk-table"><thead><tr><th>Code</th><th>Activité</th><th>Date</th><th>Ext. doc.</th><th>DIM</th></tr></thead><tbody>${c.actes.map(a=>`<tr><td><b>${K.esc(a.code)}</b><small>${K.esc(a.libelle||'')}</small></td><td>${K.esc(a.activite)}</td><td>${a.date?K.esc(K.fr(a.date)):'—'}</td><td>${a.activite==='4'?K.esc(a.extension||'—'):''}</td><td>${a.dim?K.chip('Validé','ok'):a.rejeteDim?K.chip('Rejeté','crit'):K.chip('En attente','warn')}</td></tr>`).join('')||'<tr><td colspan="5">Aucun acte confirmé : onglet Codage PMSI du dossier.</td></tr>'}</tbody></table>
    <div class="mk-grid"><label>Date de réalisation des actes (si différente)<input type="date" name="dateActes" value="${K.esc(p.dateActes||'')}" ${ed}></label><label>Classe ASA (extension documentaire)<select name="extensionAsa" ${ed}>${opts({1:'ASA 1',2:'ASA 2',3:'ASA 3',4:'ASA 4',5:'ASA 5'},p.extensionAsa,c.asa?'Consultation : ASA '+c.asa:'À préciser')}</select></label></div>
    <h3>Implants (dispositifs médicaux implantables)</h3>${c.dmi.length?`<table class="mk-table"><thead><tr><th>Implant tracé au bloc</th><th>En sus du GHS</th><th>Code LPP</th><th>Libellé</th><th>Prix LPP (€)</th></tr></thead><tbody>${c.dmi.map(x=>`<tr><td><b>GTIN ${K.esc(x.gtin)}</b><small>lot ${K.esc(x.lot||'—')} · série ${K.esc(x.serie||'—')}</small></td><td><select name="dmi.${K.esc(x.gtin)}.enSus" ${ed}>${opts({'':'À préciser',oui:'Oui (liste en sus)',non:'Non (inclus dans le GHS)'},x.enSus===undefined?'':x.enSus?'oui':'non')}</select></td><td><input name="dmi.${K.esc(x.gtin)}.lpp" value="${K.esc(x.lpp)}" maxlength="7" inputmode="numeric" ${ed}></td><td><input name="dmi.${K.esc(x.gtin)}.libelle" value="${K.esc(x.libelle)}" ${ed}></td><td><input name="dmi.${K.esc(x.gtin)}.prix" value="${K.esc(x.prix)}" inputmode="decimal" ${ed}></td></tr>`).join('')}</tbody></table>`:'<p class="mk-sub">Aucun implant tracé au bloc.</p>'}
    ${peut.pmsi&&!verrou?'<button class="primary" type="submit">Enregistrer</button>':''}</form>
    <div class="mk-card"><h3>Validation du DIM et envoi</h3><p>${p.valide?K.chip('Validé par le DIM','ok')+' '+K.esc(p.valide.par)+' · '+K.esc(K.fr(p.valide.le)):K.chip('Pas encore validé','warn')} ${p.envoi?K.chip(p.envoi.simulation?'Envoyé (simulation)':'Envoyé au logiciel PMSI','ok')+' réf. '+K.esc(p.envoi.reference):''}</p>
     ${constats(K,d.constats,'pmsi')}
     ${peut.validerPmsi&&!verrou?`<div class="mk-row">${!p.valide?`<button type="button" class="primary" data-mk-btn="valider-pmsi" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Résumé validé">Valider le résumé (DIM)</button>`:`<button type="button" class="primary" data-mk-btn="envoyer-pmsi" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Résumé envoyé">Envoyer au logiciel PMSI (HL7 BAR^P12)</button>`}</div>`:'<p class="mk-sub">La validation et l’envoi reviennent au médecin DIM.</p>'}
     <p class="mk-sub">Le logiciel PMSI groupe le séjour (GHM, GHS) et transmet chaque mois les fichiers à l’ATIH (RSS, VID-HOSP, FICHCOMP) sur e-PMSI. Liaison : ${K.esc(j.connecteurs.pmsi.etat)}.</p></div>`}
  if(e.onglet==='facture'&&d.preFacture){const f=d.facture,pf=d.preFacture,ed=dis(peut.facture);
   corps=`<form class="mk-card" data-mk-action="facture" data-am-section="facture" data-mk-ok="Facture enregistrée"><h3>Part de la clinique</h3><p class="mk-sub">GHM et GHS : à reprendre du groupage du logiciel PMSI. Tarif : arrêté tarifaire de l’année (secteur ex-OQN).</p>
    <div class="mk-grid"><label>GHM<input name="ghm" value="${K.esc(f.ghm||'')}" maxlength="6" placeholder="ex. 08C48" ${ed}></label><label>GHS<input name="ghs" value="${K.esc(f.ghs||'')}" maxlength="4" inputmode="numeric" ${ed}></label><label>Tarif du GHS (€)<input name="ghsTarif" value="${K.esc(f.ghsTarif||'')}" inputmode="decimal" ${ed}></label>
    <label>Journées au-delà de la borne haute<input name="exhJours" value="${K.esc(f.exhJours||'')}" inputmode="numeric" ${ed}></label><label>Tarif d’une journée EXH (€)<input name="exhTarif" value="${K.esc(f.exhTarif||'')}" inputmode="decimal" ${ed}></label>
    <label>Chambre particulière : nuits<input name="chambreNuits" value="${K.esc(f.chambreNuits||'')}" inputmode="numeric" ${ed}></label><label>Prix d’une nuit (€)<input name="chambrePrix" value="${K.esc(f.chambrePrix||'')}" inputmode="decimal" ${ed}></label></div>
    <h3>Honoraires des praticiens</h3><table class="mk-table"><thead><tr><th>Acte</th><th>Activité</th><th>Association</th><th>Modificateurs</th><th>Tarif</th><th>Facturé</th></tr></thead><tbody>${pf.honoraires.map(h=>`<tr><td><b>${K.esc(h.code)}</b><small>${K.esc(h.libelle||'')}</small></td><td>${K.esc(h.activite)}</td><td>${K.esc(h.association||'—')}${h.note?'<small>'+K.esc(h.note)+'</small>':''}</td><td><input name="modificateurs.${h.activite==='4'?'anes':'chir'}" value="${K.esc(h.modificateurs||'')}" maxlength="4" placeholder="ex. J" ${ed}></td><td>${h.tarif?euros(h.tarif):'<small>tarif inconnu (CCAM non chargée)</small>'}</td><td>${euros(h.montant)}</td></tr>`).join('')||'<tr><td colspan="6">Aucun acte validé par le DIM.</td></tr>'}</tbody></table>
    <p class="mk-sub">Modificateurs possibles : ${Object.entries(R.MODIFICATEURS).map(([k,v])=>K.esc(k+' = '+v)).join(' · ')}. Ils sont valorisés par le logiciel SESAM-Vitale du praticien.</p>
    ${peut.facture&&!verrou?'<button class="primary" type="submit">Enregistrer</button>':''}</form>
    <div class="mk-card"><h3>Estimation de la facture</h3><table class="mk-table"><tbody>${pf.lignes.map(l=>`<tr><td>${K.esc(l.code)}</td><td>${K.esc(l.libelle)}</td><td>${l.quantite}</td><td>${euros(l.montant)}</td></tr>`).join('')}
     <tr><td colspan="3"><b>Base Assurance maladie du séjour</b></td><td>${euros(pf.baseSejour)}</td></tr><tr><td colspan="3"><b>Honoraires (base)</b></td><td>${euros(pf.baseHonoraires)}</td></tr>
     <tr><td colspan="3">${K.esc(pf.motifParticipation)}</td><td>${euros(pf.participation)}</td></tr><tr><td colspan="3">Forfait journalier · ${K.esc(pf.noteForfait)}</td><td>${euros(pf.forfaitJournalier)}</td></tr>
     <tr><td colspan="3">Chambre particulière (patient ou mutuelle)</td><td>${euros(pf.chambre)}</td></tr><tr><td colspan="3">Dépassements d’honoraires (devis)</td><td>${euros(pf.depassements)}</td></tr>
     <tr><td colspan="3"><b>Part Assurance maladie obligatoire</b></td><td><b>${euros(pf.amo)}</b></td></tr><tr><td colspan="3"><b>Reste avant complémentaire</b></td><td><b>${euros(pf.resteAvantMutuelle)}</b></td></tr></tbody></table>
     <p class="mk-sub">${K.esc(pf.note)}</p>${constats(K,d.constats,'facture')}${d.constats.some(c=>c.section!=='facture'&&c.niveau==='bloquant')?constats(K,d.constats.filter(c=>c.section!=='facture'&&c.niveau==='bloquant')):''}
     ${peut.facture&&!verrou?`<button type="button" class="primary" data-mk-btn="transmettre" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Facture transmise" ${d.pret.facture&&d.pmsi?.valide?'':'disabled'}>Transmettre au logiciel de facturation (B2)</button>`:''}
     ${verrou?`<p>${K.chip(d.statut==='paye'?'Payée':'Transmise','ok')} ${K.esc(f.reference||'')} · ${K.esc(K.fr(f.transmiseLe))}${f.simulation?' · simulation':''}</p>`:''}
     <p class="mk-sub">Liaison : ${K.esc(j.connecteurs.facturation.etat)}.</p></div>`}
  if(e.onglet==='retours'){const R2=R.MOTIFS_REJET;
   corps=`<div class="mk-card"><h3>Retours de l’Assurance maladie</h3>${j.retours.length?`<ul class="mk-list">${j.retours.map(r=>`<li><div>${K.chip(r.status==='paye'?'Payé':'Rejeté',r.status==='paye'?'ok':'crit')} <b>${r.status==='paye'?euros(r.data.montant):K.esc(R2[r.data.motif]?.label||'Rejet')}</b> · ${K.esc(r.ref||'')}<small>${K.esc(K.fr(r.at))} · ${K.esc(r.data.source)}${r.data.libelle?' · '+K.esc(r.data.libelle):''}</small>${r.status==='rejet'&&R2[r.data.motif]?`<small>À faire : ${K.esc(R2[r.data.motif].conseil)}</small>`:''}</div></li>`).join('')}</ul>`:'<p class="mk-sub">Aucun retour.</p>'}
    ${peut.facture&&d.statut==='transmise'?`<form data-mk-action="retour" data-mk-ok="Retour enregistré" class="mk-grid"><input type="hidden" name="stay" value="${K.esc(stay)}"><label>Retour<select name="statut"><option value="paye">Paiement</option><option value="rejet">Rejet</option></select></label><label>Montant payé (€)<input name="montant" inputmode="decimal"></label><label>Motif du rejet<select name="motif">${opts(R2,'','—')}</select></label><label>Libellé du retour<input name="libelle"></label><button class="primary" type="submit">Enregistrer le retour</button></form>
     ${j.connecteurs.facturation.mode==='simulation'?`<div class="mk-row"><button type="button" class="secondary" data-mk-btn="simuler-retour" data-mk-data='${K.esc(JSON.stringify({stay,issue:'paye'}))}'>Simuler un paiement</button><button type="button" class="secondary" data-mk-btn="simuler-retour" data-mk-data='${K.esc(JSON.stringify({stay,issue:'rejet'}))}'>Simuler un rejet</button></div>`:''}`:''}
    ${peut.facture&&d.statut==='rejete'?`<button type="button" class="primary" data-mk-btn="rouvrir" data-mk-data='${K.esc(JSON.stringify({stay}))}' data-mk-ok="Facture rouverte">Rouvrir pour correction</button>`:''}</div>
    <div class="mk-card"><h3>Envois</h3><ul class="mk-list">${j.envois.map(s=>`<li><div><b>${K.esc(s.data.type)}</b> vers ${K.esc(s.data.destinataire)} ${K.chip(s.status==='envoye'?(s.data.simulation?'Simulation':'Transmis'):'Échec',s.status==='envoye'?'ok':'crit')}<small>${K.esc(K.fr(s.at))} · ${K.esc(s.data.detail||'')}${s.data.reference?' · réf. '+K.esc(s.data.reference):''}</small></div>${s.data.message?`<details><summary>Message</summary><pre class="mk-pre">${K.esc(s.data.message.replace(/\r/g,'\n'))}</pre></details>`:''}</li>`).join('')||'<li class="mk-sub">Aucun envoi.</li>'}</ul></div>`}
  return choix+entete(K,j)+o+corps;
 },
 brancher(host,K){
  host.querySelectorAll('[data-am-ouvrir]').forEach(b=>b.onclick=()=>{const e=K.etat.assurance??={};e.stay=b.dataset.amOuvrir;e.onglet='';K.dessiner()});
  const stay=K.etat.assurance?.stay;
  K.brancher(host,'assurance',(f,o)=>{const sec=f.dataset.amSection;if(!sec)return {...o,stay};
   const v={};for(const [k,val] of Object.entries(o)){if(k.includes('.')){const [a,b,c]=k.split('.');if(c){v[a]??={};v[a][b]??={};v[a][b][c]=val}else{v[a]??={};v[a][b]=val}}else v[k]=val}
   if(sec==='pmsi'&&v.dmi)for(const m of Object.values(v.dmi))m.enSus=m.enSus===''?undefined:m.enSus==='oui';
   return {stay,[sec]:v}});
  host.querySelectorAll('[data-mk-btn]').forEach(b=>{const d=JSON.parse(b.dataset.mkData||'{}');if(!d.stay&&stay)b.dataset.mkData=JSON.stringify({...d,stay})});
 }
};
})(window);

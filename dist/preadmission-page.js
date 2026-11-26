// Préadmission du patient (lien personnel reçu à la fin du questionnaire d'anesthésie, puis par les rappels).
// Parcours d'étapes endoscopie ou chirurgie, formulaire, pièces justificatives, autorisation, récapitulatif.
// Aucun code du dossier professionnel n'est chargé. La date de naissance est demandée avant tout affichage,
// puis renvoyée à chaque action (elle reste en mémoire, jamais dans le navigateur).
(function(){
'use strict';
const P=window.IaseloPreadmission,E=window.IaseloEspacePatient,$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=new URLSearchParams(location.hash.slice(1)).get('acces')||'';
if(token)history.replaceState(null,'',location.pathname);
const host=$('#workspace');let birthDate='',state=null,vue='parcours',filtre='afaire',draft=null;
const toast=t=>{const el=$('#toast');if(!el)return;el.textContent=t;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>{el.style.display='none'},4200)};
const fmt=iso=>iso?new Date(iso).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'long',timeStyle:'short'}):'';
const panel=html=>{host.innerHTML=`<section class="panel"><div class="content">${html}</div></section>`};
async function call(path,data){const r=await fetch('/api/preadmission/'+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,birthDate,...data})});const j=await r.json().catch(()=>({error:'Service indisponible. Réessayez plus tard.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Action impossible.'),{status:r.status,data:j});return j}
function closed(message){panel(`<h2>Lien indisponible</h2><p>${esc(message)}</p><p>Si vous avez besoin d’aide, appelez la clinique.</p>`)}
function ask(etab,error){
 panel(`<h2>Vérification de votre identité</h2><p>${esc(etab||'La clinique')} vous invite à réaliser votre préadmission en ligne. Pour continuer, indiquez votre date de naissance.</p>
 <form id="pa-dob" class="pp-dob"><label>Date de naissance<input type="date" name="dob" required autocomplete="bday"></label>${error?`<p class="pp-err" role="alert">${esc(error)}</p>`:''}<button class="primary">Continuer</button></form>
 <p class="sessionnote">Ce lien est personnel. Ne le transférez pas.</p>`);
 $('#pa-dob').onsubmit=async e=>{e.preventDefault();e.target.querySelector('button').disabled=true;birthDate=e.target.dob.value;
  try{state=await call('view',{});render()}catch(err){if(err.status===410)closed(err.message);else ask(etab,err.message)}};
 $('#pa-dob [name=dob]').focus();
}
const fail=err=>{if(err.status===410)return closed(err.message);toast(err.message)};
const opts={get naissance(){return state.patient.naissance}};
const fait=id=>P.etapeFaite(id,state.data,{naissance:state.patient.naissance});
const ICON={check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
 back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'};

/* ---------- Parcours ---------- */
function jauge(p){const r=26,c=2*Math.PI*r;return `<svg class="pa-ring" viewBox="0 0 64 64" role="img" aria-label="Parcours complet à ${p} %"><circle cx="32" cy="32" r="${r}" class="pa-ring-bg"/><circle cx="32" cy="32" r="${r}" class="pa-ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p/100)}"/><text x="32" y="37" text-anchor="middle">${p}%</text></svg>`}
function parcours(){
 const s=state,liste=P.etapes(s.type),et=s.etat,aFaire=liste.filter(e=>!fait(e.id)),faites=liste.filter(e=>fait(e.id));
 const montre=filtre==='faites'?faites:aFaire;
 const tag=e=>`${e.niveau?`<span class="pa-tag ${e.niveau}">${e.niveau==='obligatoire'?'Obligatoire':'Importante'}</span>`:''}<span class="pa-tag dur">${ICON.clock}${e.minutes} min</span>`;
 const msg=et.code==='verifiee'?'<p class="pa-ok">Votre préadmission a été vérifiée par la clinique. Merci !</p>':et.preadmission?'<p class="pa-ok">Votre préadmission est complète : la clinique va la vérifier.</p>':'';
 return `<section class="pa-hero"><div class="pa-hero-txt"><p class="pa-kicker">Je prépare mon séjour · ${esc(s.typeLibelle)}</p><h2>${esc(s.patient.prenom)}, voici votre parcours</h2>
  <p>${s.datePrevue?'Votre venue est prévue le <b>'+esc(new Date(s.datePrevue+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}))+'</b>. ':''}Réalisez les étapes ci-dessous ; les étapes obligatoires doivent être faites avant votre venue.</p>${msg}</div>
  <div class="pa-hero-g">${jauge(et.pourcent)}<span>${et.faites} / ${et.total} étapes</span></div></section>
  ${s.data.aCompleter&&!s.data.aCompleter.reponduLe?`<p class="pa-alert" role="alert"><b>La clinique vous demande un complément :</b> ${esc(s.data.aCompleter.motif)}</p>`:''}
  ${et.refusees.length?`<p class="pa-alert" role="alert"><b>À renvoyer :</b> ${et.refusees.map(r=>esc(P.PIECE[r.piece].libelle)+' ('+esc(r.motif)+')').join(' · ')}</p>`:''}
  <div class="pa-filtres" role="tablist"><button type="button" role="tab" aria-selected="${filtre!=='faites'}" data-filtre="afaire">${aFaire.length} étape${aFaire.length>1?'s':''} à réaliser</button><button type="button" role="tab" aria-selected="${filtre==='faites'}" data-filtre="faites">${faites.length} étape${faites.length>1?'s':''} faite${faites.length>1?'s':''}</button></div>
  <ol class="pa-steps">${montre.map(e=>`<li class="pa-step ${e.niveau||'info'} ${fait(e.id)?'is-done':''}"><div><p class="pa-step-t">${esc(e.titre)}</p><p class="pa-tags">${tag(e)}</p></div><button type="button" class="${fait(e.id)?'secondary':'primary'}" data-etape="${e.id}">${fait(e.id)?ICON.check+'Revoir':'J’y vais'}</button></li>`).join('')||`<li class="pa-empty">${filtre==='faites'?'Aucune étape faite pour le moment.':'Bravo, toutes les étapes sont faites.'}</li>`}</ol>
  <div class="v-actions"><button type="button" class="secondary" id="pa-print">Imprimer mon récapitulatif</button></div>`;
}

/* ---------- Étapes ---------- */
function infoHTML(id){
 const info=P.informations(state.type,{etablissement:state.etablissement,telephone:state.telephone})[id];
 return `<p class="pa-intro">${esc(info.intro)}</p>${info.sections.map(([t,x])=>`<h3>${esc(t)}</h3><p>${esc(x)}</p>`).join('')}
 ${id==='donnees'?'<p><a href="confidentialite.html" target="_blank" rel="noopener noreferrer">Lire la politique de confidentialité</a></p>':''}
 ${fait(id)?`<p class="pa-ok">${ICON.check} Lu le ${esc(fmt(state.data.etapes[id].at))}</p>`:`<div class="v-actions"><button type="button" class="primary pa-big" data-lu="${id}">J’ai pris connaissance de ces informations</button></div>`}`;
}
function piecesHTML(keys,{titre='Pièces justificatives',note=''}={}){
 const actives=state.data.pieces;
 return `<div class="pa-pieces"><h3>${esc(titre)}</h3>${note?`<p class="pa-note">${esc(note)}</p>`:''}<ul>${keys.map(([k,requis])=>{const list=actives.filter(p=>p.piece===k),last=list.at(-1),ko=last?.controle&&last.controle.conforme===false;
  return `<li class="${last&&!ko?'is-ok':ko?'is-ko':''}"><div><b>${esc(P.PIECE[k].libelle)}</b>${requis?' <span class="pa-tag obligatoire">Obligatoire</span>':''}
   <small>${list.length?list.map(p=>`${esc(p.nom)} · reçu le ${esc(fmt(p.recuLe))}${p.controle?(p.controle.conforme?' · vérifié':' · <b>non conforme : '+esc(p.controle.motif)+'</b>'):''}`).join('<br>'):'À déposer'}</small></div>
   <label class="pa-file secondary"><input type="file" accept="application/pdf,image/jpeg,image/png" data-piece="${k}" ${P.MULTIPLES.includes(k)?'multiple':''}>${list.length&&!P.MULTIPLES.includes(k)?'Remplacer':'Déposer'}</label></li>`}).join('')}</ul>
  <p class="pa-note">PDF, photo JPEG ou PNG, 10 Mo au maximum. Photographiez à plat, bien éclairé, document entier et lisible.</p></div>`;
}
function v(name){return draft?.[name]??''}
function formHTML(){
 const s=state,f=draft,pa=s.patient,mineur=(P.age(pa.naissance)??99)<18,requis=new Set(P.piecesRequises({formulaire:f,naissance:pa.naissance,passeport:f.passeport}));
 const radio=(name,val,label,cur)=>`<label class="pa-radio"><input type="radio" name="${name}" value="${val}" ${cur===val?'checked':''}> <span>${esc(label)}</span></label>`;
 const contact=(pre,o={})=>`<div class="pa-grid"><label>Nom<input name="${pre}.nom" value="${esc(o.nom||'')}" maxlength="80" autocomplete="off"></label><label>Prénom<input name="${pre}.prenom" value="${esc(o.prenom||'')}" maxlength="80" autocomplete="off"></label><label>Lien avec vous<select name="${pre}.lien"><option value="">Choisir</option>${P.LIENS.map(l=>`<option ${o.lien===l?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label>Téléphone<input name="${pre}.telephone" type="tel" value="${esc(o.telephone||'')}" maxlength="24" autocomplete="off"></label></div>`;
 const piecesListe=[['identiteRecto',true],['identiteVerso',requis.has('identiteVerso')],['vitale',true],['mutuelle',requis.has('mutuelle')],['domicile',true],...(f.confiance==='oui'||f.confiance==='prevenir'?[['confiance',false]]:[]),...(mineur?[['parentale',true],['livretFamille',true]]:[]),['autre',false]];
 return `<form id="pa-form" novalidate>
 <fieldset><legend>Mon identité</legend><dl class="pa-id"><div><dt>Nom de naissance</dt><dd>${esc(String(pa.nom).toUpperCase())}</dd></div><div><dt>Prénom</dt><dd>${esc(pa.prenom)}</dd></div><div><dt>Date de naissance</dt><dd>${esc(P.fmtD(pa.naissance))}</dd></div></dl>
  <p class="pa-note">Une erreur dans votre nom, prénom ou date de naissance ? Signalez-la à l’accueil : votre identité est vérifiée sur votre pièce d’identité.</p>
  <div class="pa-grid"><label>Nom d’usage <small>(facultatif)</small><input name="nomUsage" value="${esc(v('nomUsage'))}" maxlength="80"></label><label>Lieu de naissance <small>(commune, ou pays si né(e) à l’étranger)</small><input name="lieuNaissance" value="${esc(v('lieuNaissance'))}" maxlength="80" data-req></label></div></fieldset>
 <fieldset><legend>Mes coordonnées</legend><div class="pa-grid"><label class="pa-wide">Adresse<input name="adresse" value="${esc(v('adresse'))}" maxlength="160" autocomplete="street-address" data-req></label><label>Complément <small>(bâtiment, étage, code)</small><input name="complement" value="${esc(v('complement'))}" maxlength="120"></label><label>Code postal<input name="codePostal" value="${esc(v('codePostal'))}" maxlength="10" inputmode="numeric" autocomplete="postal-code" data-req></label><label>Ville<input name="ville" value="${esc(v('ville'))}" maxlength="80" autocomplete="address-level2" data-req></label></div>
  <div class="pa-verif"><p>Coordonnées enregistrées par la clinique :</p><ul>${s.contact.telephone?`<li>${ICON.check} ${esc(s.contact.telephone)}</li>`:''}${s.contact.email?`<li>${ICON.check} ${esc(s.contact.email)}</li>`:''}</ul>
   ${radio('coordonnees','exactes','Elles sont exactes',f.coordonneesExactes?'exactes':f.telephoneCorrige||f.emailCorrige?'corriger':'')}${radio('coordonnees','corriger','Je dois les corriger',f.coordonneesExactes?'exactes':f.telephoneCorrige||f.emailCorrige?'corriger':'')}
   <div class="pa-grid" ${f.coordonneesExactes?'hidden':''} data-corriger><label>Bon téléphone portable<input name="telephoneCorrige" type="tel" value="${esc(v('telephoneCorrige'))}" maxlength="24"></label><label>Bon e-mail<input name="emailCorrige" type="email" value="${esc(v('emailCorrige'))}" maxlength="120"></label></div></div></fieldset>
 <fieldset><legend>Ma couverture sociale</legend><div class="pa-grid"><label>Régime d’assurance maladie<select name="regime" data-req><option value="">Choisir</option>${P.REGIMES.map(([k,l])=>`<option value="${k}" ${f.regime===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
  <label>Mutuelle (complémentaire santé)<input name="mutuelle" value="${esc(v('mutuelle'))}" maxlength="80" ${f.sansMutuelle?'disabled':''}></label><label>N° d’adhérent <small>(facultatif)</small><input name="adherent" value="${esc(v('adherent'))}" maxlength="40" ${f.sansMutuelle?'disabled':''}></label></div>
  <label class="pa-check"><input type="checkbox" name="sansMutuelle" ${f.sansMutuelle?'checked':''}> Je n’ai pas de mutuelle</label>
  <div class="pa-grid"><label class="pa-wide">Médecin traitant <small>(nom et ville, facultatif)</small><input name="medecinTraitant" value="${esc(v('medecinTraitant'))}" maxlength="120"></label></div></fieldset>
 <fieldset><legend>Personne à prévenir</legend><p class="pa-note">Elle sera appelée en cas de besoin pendant votre séjour.</p>${contact('prevenir',f.prevenir)}</fieldset>
 <fieldset><legend>Personne de confiance</legend><p class="pa-note">Vous pouvez désigner une personne de confiance (parent, proche, médecin traitant) qui vous accompagne dans vos démarches et peut être consultée si vous ne pouvez pas exprimer votre volonté (article L. 1111-6 du code de la santé publique). Elle peut être différente de la personne à prévenir.</p>
  ${radio('confiance','prevenir','Je désigne la personne à prévenir',f.confiance)}${radio('confiance','oui','Je désigne une autre personne',f.confiance)}${radio('confiance','non','Je ne souhaite pas en désigner',f.confiance)}
  <div ${f.confiance==='oui'?'':'hidden'} data-confiance>${contact('personneConfiance',f.personneConfiance)}</div>
  ${f.confiance==='oui'||f.confiance==='prevenir'?'<p class="pa-note">La désignation doit être écrite et cosignée par la personne désignée : déposez le formulaire signé ci-dessous ou apportez-le le jour de votre venue.</p>':''}</fieldset>
 <fieldset><legend>Mon séjour</legend><div class="pa-grid"><label>Chambre souhaitée<select name="chambre" data-req><option value="">Choisir</option>${P.CHAMBRES.map(([k,l])=>`<option value="${k}" ${f.chambre===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label></div>
  ${s.type==='chirurgie'?`<label class="pa-check"><input type="checkbox" name="accompagnantNuit" ${f.accompagnantNuit?'checked':''}> Je souhaite qu’un accompagnant reste la nuit (si possible)</label>`:''}
  <p class="pa-q">Une personne majeure viendra-t-elle me chercher et pourra rester avec moi la première nuit ?</p>${radio('retourAccompagne','oui','Oui',f.retourAccompagne)}${radio('retourAccompagne','non','Non, pas encore',f.retourAccompagne)}
  <label class="pa-wide">Besoins particuliers <small>(régime alimentaire, mobilité réduite, interprète… facultatif)</small><textarea name="besoins" rows="2" maxlength="400">${esc(v('besoins'))}</textarea></label></fieldset>
 <fieldset><legend>Mes pièces justificatives</legend><label class="pa-check"><input type="checkbox" name="passeport" ${f.passeport?'checked':''}> Ma pièce d’identité est un passeport (une seule page à déposer)</label>
  ${piecesHTML(piecesListe,{titre:''})}</fieldset>
 <p class="pp-err" id="pa-form-err" role="alert" hidden></p>
 <div class="v-actions pa-form-actions"><button type="button" class="secondary" id="pa-save">Enregistrer et finir plus tard</button><button type="submit" class="primary pa-big">${s.data.formulaire?.soumisLe?'Mettre à jour ma préadmission':'Envoyer ma préadmission'}</button></div></form>`;
}
function lireForm(form){
 const fd=new FormData(form),o={...draft};
 for(const k of ['nomUsage','lieuNaissance','adresse','complement','codePostal','ville','telephoneCorrige','emailCorrige','regime','mutuelle','adherent','medecinTraitant','chambre','besoins'])if(fd.has(k))o[k]=String(fd.get(k)||'');
 o.coordonneesExactes=fd.get('coordonnees')==='exactes';if(o.coordonneesExactes){o.telephoneCorrige='';o.emailCorrige=''}
 o.sansMutuelle=fd.get('sansMutuelle')==='on';o.passeport=fd.get('passeport')==='on';o.accompagnantNuit=fd.get('accompagnantNuit')==='on';
 o.confiance=String(fd.get('confiance')||'');o.retourAccompagne=String(fd.get('retourAccompagne')||'');
 for(const pre of ['prevenir','personneConfiance'])o[pre]=Object.fromEntries(['nom','prenom','lien','telephone'].map(k=>[k,String(fd.get(pre+'.'+k)||'')]));
 if(o.confiance==='prevenir')o.personneConfiance={...o.prevenir};
 return o;
}
function autorisationHTML(){
 const a=state.data.autorisation,mineur=(P.age(state.patient.naissance)??99)<18;
 if(a)return `<p class="pa-intro">${esc(state.texteAutorisation)}</p><p class="pa-ok">${ICON.check} Signée en ligne par ${esc(a.signataire)} le ${esc(fmt(a.at))}.</p><p class="pa-note">Pour retirer votre autorisation, appelez la clinique : c’est possible à tout moment.</p>`;
 return `<form id="pa-auto" novalidate><div class="pa-texte">${esc(state.texteAutorisation)}</div>
  ${mineur?'<p class="pa-note">Le patient est mineur : l’autorisation est donnée par les titulaires de l’autorité parentale (les deux parents le cas échéant).</p>':''}
  <p class="pa-q">Je signe en tant que</p><label class="pa-radio"><input type="radio" name="qualite" value="patient" ${mineur?'disabled':''}> <span>Patient(e)</span></label><label class="pa-radio"><input type="radio" name="qualite" value="parent"> <span>Parent (titulaire de l’autorité parentale)</span></label><label class="pa-radio"><input type="radio" name="qualite" value="tuteur"> <span>Tuteur ou représentant légal</span></label>
  <div class="pa-grid"><label>Nom et prénom du signataire<input name="signataire" maxlength="120" autocomplete="name" value="${mineur?'':esc([state.patient.prenom,String(state.patient.nom).toUpperCase()].join(' '))}"></label>${mineur?'<label>Second titulaire de l’autorité parentale<input name="secondParent" maxlength="120"></label>':''}</div>
  <label class="pa-check"><input type="checkbox" name="certifie"> Je certifie l’exactitude de ces informations et donne mon autorisation. La date et l’heure seront ajoutées automatiquement.</label>
  <p class="pp-err" id="pa-auto-err" role="alert" hidden></p><button class="primary pa-big" type="submit">Signer et envoyer</button></form>`;
}
function choixHTML(id,choix,cur,{intro='',pieces=null}={}){
 return `${intro}${pieces?piecesHTML(pieces):''}<form class="pa-choix" data-choix="${id}"><p class="pa-q">Ma réponse</p>${choix.map(([k,l])=>`<label class="pa-radio"><input type="radio" name="choix" value="${k}" ${cur===k?'checked':''}> <span>${esc(l)}</span></label>`).join('')}
  ${id==='rdv'?`<label class="pa-date" ${cur==='rdv'?'':'hidden'}>Date du rendez-vous<input type="date" name="date" value="${esc(state.data.rdv?.date||'')}"></label>`:''}
  <p class="pp-err" role="alert" hidden></p><button class="primary pa-big" type="submit">${fait(id)?'Mettre à jour':'Valider'}</button></form>`;
}
function etapeHTML(id){
 const e=P.etapes(state.type).find(x=>x.id===id);if(!e)return parcours();
 let corps='';
 if(e.genre==='info')corps=infoHTML(id);
 else if(e.genre==='formulaire')corps=`<p class="pa-intro">Environ 15 minutes. Préparez votre pièce d’identité, votre carte Vitale, votre carte de mutuelle et un justificatif de domicile de moins de 3 mois : vous pouvez les photographier avec votre téléphone. Vous pouvez enregistrer et terminer plus tard.</p>${state.etat.preadmission?`<p class="pa-ok">${ICON.check} Préadmission complète${state.data.formulaire?.soumisLe?' · envoyée le '+esc(fmt(state.data.formulaire.soumisLe)):''}.</p>`:state.data.formulaire?.soumisLe&&state.etat.piecesManquantes.length?`<p class="pa-alert">Formulaire reçu. Pièces encore attendues : ${esc(state.etat.piecesManquantes.map(k=>P.PIECE[k].libelle).join(', '))}.</p>`:''}${formHTML()}`;
 else if(e.genre==='autorisation')corps=autorisationHTML();
 else if(e.genre==='rdv')corps=choixHTML('rdv',[['rdv','J’ai pris rendez-vous'],['faite','Ma consultation d’anesthésie a déjà eu lieu'],['pas-encore','Je n’ai pas encore de rendez-vous']],state.data.rdv?.choix,{intro:`<p class="pa-intro">La consultation d’anesthésie a lieu au moins 48 heures avant ${state.type==='endoscopie'?'l’examen':'l’intervention'}. Si vous n’avez pas encore de rendez-vous, prenez-le dès maintenant auprès de la clinique${state.telephone?' au '+esc(state.telephone):''} ou par le lien qui vous a été transmis.</p>`});
 else if(e.genre==='devis')corps=choixHTML('devis',[['depose','J’ai déposé mon ou mes devis signés'],['aucun','Aucun devis ne m’a été remis (pas de dépassement d’honoraires annoncé)']],state.data.devis?.choix,{intro:'<p class="pa-intro">Si un médecin (chirurgien, gastro-entérologue, anesthésiste) pratique des dépassements d’honoraires, il doit vous remettre un devis au-delà de 70 € (article L. 1111-3 du code de la santé publique). Déposez chaque devis daté et signé.</p>',pieces:[['devis',false]]});
 else if(e.genre==='directives')corps=choixHTML('directives',[['deposees','J’ai rédigé des directives anticipées et je les dépose'],['apporterai','J’en ai rédigé : je les apporterai'],['aucune','Je n’ai pas rédigé de directives anticipées']],state.data.directives?.choix,{intro:'<p class="pa-intro">Les directives anticipées expriment vos volontés sur la fin de vie, au cas où vous ne pourriez plus les exprimer (article L. 1111-11 du code de la santé publique). Elles sont facultatives, modifiables et révocables à tout moment. Si vous en avez rédigé, transmettez-les pour qu’elles figurent dans votre dossier.</p>',pieces:[['directives',false]]});
 return `<button type="button" class="pa-back" data-retour>${ICON.back} Mon parcours</button><section class="pa-card"><p class="pa-tags">${e.niveau?`<span class="pa-tag ${e.niveau}">${e.niveau==='obligatoire'?'Obligatoire':'Importante'}</span>`:''}<span class="pa-tag dur">${ICON.clock}${e.minutes} min</span></p><h2>${esc(e.titre)}</h2>${corps}</section>`;
}

/* ---------- Envoi de fichiers ---------- */
async function sendFile(file,piece){
 const head=new Uint8Array(await file.slice(0,8).arrayBuffer());
 if(!E.typeReel(head))throw new Error('« '+file.name+' » : format non accepté (PDF, JPEG ou PNG).');
 if(file.size>E.LIMITES.fichier)throw new Error('« '+file.name+' » : fichier trop lourd (10 Mo au maximum).');
 const r=await fetch('/api/preadmission/upload?piece='+encodeURIComponent(piece),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/octet-stream','X-Acces':token,'X-Naissance':birthDate,'X-Nom':encodeURIComponent(file.name)},body:file});
 const j=await r.json().catch(()=>({error:'Service indisponible. Réessayez plus tard.'}));if(!r.ok)throw Object.assign(new Error(j.error||'Envoi impossible.'),{status:r.status});return j;
}

function printRecap(){
 const box=document.createElement('div');box.id='pa-print';
 box.innerHTML=P.recapHTML({...state.data,pieces:state.data.pieces,autorisation:state.data.autorisation?{...state.data.autorisation,texte:state.texteAutorisation}:null},{etablissement:state.etablissement,patient:state.patient,type:state.type,datePrevue:state.datePrevue,intervention:state.intervention,contact:{phone:state.contact.telephone,email:state.contact.email}});
 document.body.append(box);document.body.classList.add('pa-printing');
 const done=()=>{document.body.classList.remove('pa-printing');box.remove();window.removeEventListener('afterprint',done)};
 window.addEventListener('afterprint',done);setTimeout(()=>{try{window.print()}finally{setTimeout(done,500)}},50);
}

function render(){
 const s=state;document.title='Ma préadmission · '+(s.etablissement||'');
 if(!draft)draft=P.formulaire(s.data.formulaire||{});
 const t=$('#title');if(t)t.textContent='Ma préadmission';
 host.innerHTML=`<section class="panel pa"><div class="content">${vue==='parcours'?parcours():etapeHTML(vue)}</div></section>`;
 host.querySelectorAll('[data-filtre]').forEach(b=>b.onclick=()=>{filtre=b.dataset.filtre;render()});
 host.querySelectorAll('[data-etape]').forEach(b=>b.onclick=()=>{vue=b.dataset.etape;render();window.scrollTo({top:0})});
 host.querySelectorAll('[data-retour]').forEach(b=>b.onclick=()=>{const f=$('#pa-form');if(f)draft=lireForm(f);vue='parcours';render();window.scrollTo({top:0})});
 const pr=$('#pa-print');if(pr)pr.onclick=printRecap;
 host.querySelectorAll('[data-lu]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{state=await call('etape',{id:b.dataset.lu});vue='parcours';render();window.scrollTo({top:0});toast('Étape faite. Merci.')}catch(x){b.disabled=false;fail(x)}});
 host.querySelectorAll('input[type=file][data-piece]').forEach(inp=>inp.onchange=async()=>{
  const files=[...inp.files];if(!files.length)return;const f=$('#pa-form');if(f)draft=lireForm(f);
  const lab=inp.closest('label');lab.classList.add('is-busy');let ok=0;const errors=[];
  for(const file of files){try{state=await sendFile(file,inp.dataset.piece);ok++}catch(x){if(x.status===410)return closed(x.message);errors.push(x.message)}}
  render();if(ok)toast(ok>1?ok+' fichiers reçus. Merci.':'Pièce reçue. Merci.');if(errors.length)toast(errors.join(' '))});
 const form=$('#pa-form');
 if(form){
  form.addEventListener('change',e=>{draft=lireForm(form);const n=e.target.name;if(['coordonnees','confiance','sansMutuelle','passeport'].includes(n))render()});
  const envoyer=async soumettre=>{draft=lireForm(form);const err=$('#pa-form-err');err.hidden=true;form.querySelectorAll('.is-missing').forEach(x=>x.classList.remove('is-missing'));
   if(soumettre){const v=P.validerFormulaire(draft,{type:s.type});if(!v.ok){err.textContent=v.errors.join(' ');err.hidden=false;marquer(form,v.manquants);return}}
   const b=form.querySelector(soumettre?'[type=submit]':'#pa-save');b.disabled=true;
   try{const r=await call('formulaire',{formulaire:draft,soumettre});state=r;draft=P.formulaire(r.data.formulaire||{});
    if(soumettre){vue=state.etat.preadmission?'parcours':'preadmission';render();window.scrollTo({top:0});toast(state.etat.preadmission?'Préadmission envoyée. Merci !':'Formulaire envoyé. Il reste des pièces à déposer.');if(r.alertes?.length)setTimeout(()=>toast(r.alertes[0]),4300)}
    else{render();toast('Enregistré. Vous pourrez terminer plus tard avec le même lien.')}}
   catch(x){b.disabled=false;if(x.status===410)return closed(x.message);err.textContent=x.message;err.hidden=false;if(x.data?.manquants)marquer(form,x.data.manquants)}};
  form.onsubmit=e=>{e.preventDefault();envoyer(true)};$('#pa-save').onclick=()=>envoyer(false);
 }
 const auto=$('#pa-auto');
 if(auto)auto.onsubmit=async e=>{e.preventDefault();const err=$('#pa-auto-err');err.hidden=true;
  const data={qualite:auto.querySelector('[name=qualite]:checked')?.value||'',signataire:auto.signataire.value,secondParent:auto.secondParent?.value||'',certifie:auto.certifie.checked};
  const v=P.validerAutorisation(data,{naissance:s.patient.naissance});if(!v.ok){err.textContent=v.errors.join(' ');err.hidden=false;return}
  const b=auto.querySelector('[type=submit]');b.disabled=true;
  try{state=await call('autorisation',data);vue='parcours';render();window.scrollTo({top:0});toast('Autorisation signée. Merci.')}catch(x){b.disabled=false;if(x.status===410)return closed(x.message);err.textContent=x.message;err.hidden=false}};
 host.querySelectorAll('form.pa-choix').forEach(fc=>{
  fc.onchange=()=>{const d=fc.querySelector('.pa-date');if(d)d.hidden=fc.querySelector('[name=choix]:checked')?.value!=='rdv'};
  fc.onsubmit=async e=>{e.preventDefault();const err=fc.querySelector('.pp-err');err.hidden=true;const choix=fc.querySelector('[name=choix]:checked')?.value||'';
   if(!choix){err.textContent='Choisissez une réponse.';err.hidden=false;return}
   const b=fc.querySelector('[type=submit]');b.disabled=true;
   try{state=await call('etape',{id:fc.dataset.choix,valeur:{choix,date:fc.date?.value||''}});vue='parcours';render();window.scrollTo({top:0});toast(fait(fc.dataset.choix)?'Étape faite. Merci.':'Réponse enregistrée.')}
   catch(x){b.disabled=false;if(x.status===410)return closed(x.message);err.textContent=x.message;err.hidden=false}};
 });
}
function marquer(form,manquants){
 const cible={coordonneesExactes:'[name=coordonnees]',prevenir:'[name="prevenir.nom"]',personneConfiance:'[name="personneConfiance.nom"]',confiance:'[name=confiance]',retourAccompagne:'[name=retourAccompagne]'};
 let first=null;for(const k of manquants){const el=form.querySelector(cible[k]||'[name='+k+']');if(!el)continue;const box=el.closest('label,fieldset');box?.classList.add('is-missing');first=first||box}
 first?.scrollIntoView({behavior:'smooth',block:'center'});
}
if(!P||!E)return panel('<p>Service indisponible.</p>');
if(!/^[a-f0-9]{64}$/.test(token))return closed('Ce lien est incomplet. Ouvrez à nouveau le lien reçu par SMS ou par e-mail.');
call('open',{}).then(r=>ask(r.etablissement)).catch(e=>closed(e.message));
})();

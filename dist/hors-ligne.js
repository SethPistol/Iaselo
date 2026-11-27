/* IASELO · application installable et continuité hors connexion (27/11/2026, manque n°8 de la 3e veille).
   - Enregistre le service worker (sw.js) : fichiers de l'application en cache, aucun dossier patient sur le poste.
   - Bouton « Installer IASELO » (menu Options) quand le navigateur le propose.
   - Coupure réseau : bandeau d'alerte, saisies gardées dans l'onglet et envoyées au retour du réseau, fermeture de
     l'onglet déconseillée tant que la connexion n'est pas revenue.
   - Fiche de continuité (menu Options) : à imprimer pour la procédure dégradée. Serveur : worker/continuite.mjs. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=s=>{const t=$('#toast');if(!t)return;t.textContent=s;t.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.style.display='none',4000)};
const heure=d=>d.toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const jour=iso=>iso?new Date(iso.slice(0,10)+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'}):'';
let invite=null,coupure=null;

if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))
 addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}));
addEventListener('beforeinstallprompt',e=>{e.preventDefault();invite=e;menu()});
addEventListener('appinstalled',()=>{invite=null;menu();toast('IASELO est installé sur ce poste.')});

/* ---------- Coupure réseau ---------- */
function bandeau(){
 let b=$('#hl-bandeau');
 if(navigator.onLine){b?.remove();return}
 if(!b){b=document.createElement('p');b.id='hl-bandeau';b.setAttribute('role','alert');(document.querySelector('main')||document.body).prepend(b)}
 b.innerHTML=`<b>Hors connexion depuis ${esc(heure(coupure||new Date()))}.</b> Vos saisies restent dans cet onglet et partiront automatiquement au retour du réseau : ne fermez pas l’onglet et ne rechargez pas la page. Si la panne dure, passez en procédure dégradée (fiche de continuité imprimée).`;
}
addEventListener('offline',()=>{coupure=new Date();bandeau()});
addEventListener('online',()=>{coupure=null;bandeau();toast('Connexion rétablie : enregistrement de vos saisies…');setTimeout(()=>$('#shared-save-now')?.click(),800)});
addEventListener('beforeunload',e=>{if(!navigator.onLine){e.preventDefault();e.returnValue=''}});

/* ---------- Menu Options ---------- */
function menu(){
 const actions=$('#shared-save .shared-menu-panel .actions');if(!actions)return false;
 if(!$('#hl-continuite')){const b=document.createElement('button');b.type='button';b.className='secondary';b.id='hl-continuite';b.textContent='Fiche de continuité';b.onclick=continuite;actions.append(b)}
 let i=$('#hl-installer');
 if(invite&&!i){i=document.createElement('button');i.type='button';i.className='secondary';i.id='hl-installer';i.textContent='Installer IASELO sur ce poste';i.onclick=async()=>{const e=invite;invite=null;i.remove();e.prompt();await e.userChoice.catch(()=>null)};actions.append(i)}
 if(!invite&&i)i.remove();
 return true;
}
const attente=setInterval(()=>{if(menu())clearInterval(attente)},500);setTimeout(()=>clearInterval(attente),60000);

/* ---------- Fiche de continuité ---------- */
async function continuite(){
 if(!navigator.onLine){toast('Hors connexion : la fiche s’imprime quand le réseau fonctionne.');return}
 let f;try{const r=await fetch('/api/workspace/continuite',{cache:'no-store'});f=await r.json();if(!r.ok)throw Error(f.error||'Service indisponible.')}catch(e){toast(e.message||'Service indisponible.');return}
 let d=$('#hl-fiche');if(!d){d=document.createElement('dialog');d.id='hl-fiche';d.setAttribute('aria-labelledby','hl-fiche-titre');document.body.append(d)}
 const cell=(v,cls='')=>`<td${cls?` class="${cls}"`:''}>${v||'<span class="hl-vide">—</span>'}</td>`;
 d.innerHTML=`<div class="hl-tete"><div><h2 id="hl-fiche-titre">Fiche de continuité · procédure dégradée</h2>
  <p>Éditée le ${esc(new Date(f.editee).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}))} par ${esc(f.par)} · patients présents et opérés du ${esc(jour(f.periode.debut))} au ${esc(jour(f.periode.fin))} · ${f.patients.length} patient${f.patients.length>1?'s':''}</p></div>
  <div class="hl-boutons"><button type="button" class="primary" id="hl-imprimer">Imprimer</button><button type="button" class="secondary" id="hl-fermer">Fermer</button></div></div>
  <p class="hl-conf">Document confidentiel (secret médical). À utiliser seulement pendant une panne d’IASELO, puis à détruire. Les informations datent de l’heure d’édition : vérifiez-les auprès du patient.</p>
  ${f.patients.length?`<table class="hl-table"><thead><tr><th>Patient</th><th>Intervention</th><th>Bloc</th><th>Anesthésie</th><th>Allergies</th><th>Traitements (décision)</th><th>Antibioprophylaxie</th></tr></thead><tbody>
  ${f.patients.map(p=>`<tr>${cell(`<b>${esc(p.nom)} ${esc(p.prenom)}</b><br>né${p.sexe==='femme'?'e':''} le ${esc(p.naissance?p.naissance.split('-').reverse().join('/'):'?')}<br><small>${esc(p.stay)}</small>`)}
   ${cell(`${esc(p.intervention)}${p.lateralite?' · <b>'+esc(p.lateralite)+'</b>':''}<br><small>${esc([p.chirurgien,p.specialite,p.mode].filter(Boolean).join(' · '))}</small>`)}
   ${cell(`${esc(jour(p.date))}${p.debut?' · '+esc(p.debut.slice(11,16)):''}${p.salle?'<br>'+esc(p.salle):''}`)}
   ${cell([p.asa?'ASA '+esc(p.asa):'',p.technique?esc(p.technique):'',p.voiesAeriennes?'VAS : '+esc(p.voiesAeriennes):'',p.consultationValidee?'':'<b>Consultation non validée</b>'].filter(Boolean).join('<br>'))}
   ${cell(p.allergies?'<b>'+esc(p.allergies)+'</b>':'',p.allergies?'hl-allergie':'')}
   ${cell(p.traitements.length?'<ul>'+p.traitements.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'')}
   ${cell(esc(p.antibioprophylaxie))}</tr>`).join('')}</tbody></table>`:'<p>Aucun patient présent, opéré depuis 3 jours ou prévu aujourd’hui et demain dans votre périmètre.</p>'}
`;
 d.querySelector('#hl-fermer').onclick=()=>d.close();
 d.querySelector('#hl-imprimer').onclick=()=>{document.documentElement.classList.add('hl-impression');window.print()};
 addEventListener('afterprint',()=>document.documentElement.classList.remove('hl-impression'));
 $('#shared-save .shared-menu')?.removeAttribute('open');
 d.showModal();
}
})();

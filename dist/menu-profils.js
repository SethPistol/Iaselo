/* IASELO · menu par profil.
   Chaque métier ne voit que les entrées utiles à son travail (6 à 9), sans doublons :
   - « Recherche patient » est remplacée par Ctrl K (bouton Rechercher en haut du menu) ;
   - « Dossier infirmier » ouvrait Patients & séjours ; « Vue du service » est couverte par la Tour de contrôle et la Transmission ;
   - « Espace patient · démo » et « Ouvrir la page patient » ne sont pas des outils de soignants.
   Les droits restent contrôlés par le serveur : ce module ne fait que masquer ce qui ne sert pas.
   Règles pures (menuPourProfil) testées dans tests/menu-profils.test.cjs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.IaseloMenu=api;api.installer(root.document)}})(typeof self!=='undefined'?self:this,function(){
'use strict';
const MENUS={
 anesthesiste:['priorities','controle','patients','releve','regulation','pharmacy','questionnaireSend','tasks','droits'],
 chirurgien:['priorities','controle','patients','regulation','pmsi','questionnaireSend','tasks','droits'],
 infirmier:['priorities','controle','patients','releve','identity','regulation','pharmacy','tasks'],
 secretariat:['priorities','controle','patients','identity','questionnaireSend','regulation','tasks'],
 pharmacien:['controle','patients','pharmacy','tasks'],
 dim:['patients','pmsi','activity','tasks'],
 facturation:['patients','activity','billing'],
 administration:['indicateurs','professionalAccess','droits'],
 unassigned:['professionalAccess']
};
// Administrateur des habilitations : gestion de la clinique en plus de son métier.
const ADMIN=['indicateurs','professionalAccess','pilotage','droits','activity','billing'];
// Entrées retirées pour tous (doublons ou démonstration).
const RETIREES=['search','service','open-nursing-record','portal','patientlink'];
function menuPourProfil(profession,isAdmin){
 const base=MENUS[profession]||MENUS.unassigned;
 const vues=isAdmin?[...base,...ADMIN.filter(v=>!base.includes(v))]:[...base];
 return vues;
}
function cle(el){if(el.dataset?.view)return el.dataset.view;if(el.id==='open-nursing-record')return 'open-nursing-record';if(el.classList?.contains('patientlink'))return 'patientlink';return null}
function installer(doc){
 if(!doc||doc.body?.dataset?.patientPage==='true')return;
 const style=doc.createElement('style');
 style.textContent='aside .menu-masque{display:none!important}.admin-dossier{padding:4px 0}.admin-dossier h3{margin:18px 0 10px}.admin-dossier-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px 24px;margin:0}.admin-dossier-grid dt{font-size:.78rem;color:var(--muted,#5b6b73);text-transform:uppercase;letter-spacing:.04em}.admin-dossier-grid dd{margin:2px 0 0;font-weight:600}.admin-dossier-actions{display:flex;flex-wrap:wrap;gap:10px}.mes-habilitations{width:100%}';
 doc.head.append(style);
 let enCours=false,redirige='';
 function appliquer(){
  if(enCours)return;const aside=doc.querySelector('aside');const job=doc.body.dataset.profession;if(!aside||!job)return;enCours=true;
  try{
   const visibles=new Set(menuPourProfil(job,doc.body.dataset.admin==='true'));
   aside.querySelectorAll('.nav, a.patientlink').forEach(el=>{const k=cle(el);if(!k||el.closest('.asidebottom'))return;el.classList.toggle('menu-masque',RETIREES.includes(k)||!visibles.has(k))});
   // Titres de section sans entrée visible.
   aside.querySelectorAll('.navtitle').forEach(t=>{let n=t.nextElementSibling,vu=false;while(n&&!n.classList.contains('navtitle')){if(n.matches('.nav, a.patientlink')&&!n.classList.contains('menu-masque')&&!n.hidden)vu=true;n=n.nextElementSibling}t.classList.toggle('menu-masque',!vu)});
   // Accès à ses propres habilitations quand l'écran n'est pas dans le menu.
   const bas=aside.querySelector('.asidebottom'),lien=aside.querySelector('.mes-habilitations');
   if(bas&&!visibles.has('professionalAccess')&&!lien){const b=doc.createElement('button');b.type='button';b.className='secondary mes-habilitations';b.textContent='Mes habilitations';b.onclick=()=>aside.querySelector('.nav[data-view="professionalAccess"]')?.click();bas.prepend(b)}
   if(lien&&visibles.has('professionalAccess'))lien.remove();
   // Écran courant retiré du menu : ouvrir la première entrée du profil (une seule fois par profil).
   const actif=aside.querySelector('.nav.active');
   if(redirige!==job){redirige=job;if(!actif||actif.classList.contains('menu-masque')){const premier=[...visibles].map(v=>aside.querySelector('.nav[data-view="'+v+'"]')).find(b=>b&&!b.classList.contains('menu-masque')&&!b.hidden);if(premier)setTimeout(()=>premier.click(),0)}}
  }finally{enCours=false}
 }
 const go=()=>{const aside=doc.querySelector('aside');if(!aside)return;new MutationObserver(appliquer).observe(aside,{childList:true,subtree:true});new MutationObserver(appliquer).observe(doc.body,{attributes:true,attributeFilter:['data-profession','data-admin']});appliquer()};
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',go);else go();
}
return {MENUS,ADMIN,RETIREES,menuPourProfil,installer};
});

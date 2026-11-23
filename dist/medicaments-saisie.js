/* Saisie des médicaments assistée par la base publique des médicaments (BDPM, ANSM) :
   suggestions de spécialités commercialisées pendant la frappe, dans la prémédication des prescriptions préopératoires
   et dans les traitements habituels du dossier. Le texte reste libre : la suggestion n'est qu'une aide. */
(function(){
'use strict';
const CHAMPS='input[name="premed.drug"],input[name^="med-"][name$="-0"],input[data-medicament]';
let liste,minuteur,demande=0;
function datalist(){if(!liste){liste=document.createElement('datalist');liste.id='bdpm-saisie';document.body.append(liste)}return liste}
document.addEventListener('input',e=>{
 const champ=e.target;if(!(champ instanceof HTMLInputElement)||!champ.matches(CHAMPS)||!window.ParcoursBdpm?.rechercher)return;
 const terme=champ.value.trim();
 if(terme.length<3){if(champ.dataset.listeOrigine!==undefined)champ.setAttribute('list',champ.dataset.listeOrigine);return}
 if(champ.dataset.listeOrigine===undefined)champ.dataset.listeOrigine=champ.getAttribute('list')||'';
 clearTimeout(minuteur);const n=++demande;
 minuteur=setTimeout(async()=>{
  try{const res=await window.ParcoursBdpm.rechercher(terme,12);if(n!==demande)return;
   datalist().replaceChildren(...res.map(m=>{const o=document.createElement('option');o.value=m.name;o.label=(m.substances||[]).join(' + ')+' · CIS '+m.cis;return o}));
   champ.setAttribute('list','bdpm-saisie');
  }catch{/* base indisponible : saisie libre */}
 },180);
},true);
})();

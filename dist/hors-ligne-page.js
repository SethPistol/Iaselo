/* IASELO · page hors connexion : « Réessayer » et retour automatique quand le réseau revient.
   Script séparé (pas de script dans la page) : la politique de sécurité interdit tout script en ligne. */
'use strict';
document.getElementById('hl-reessayer')?.addEventListener('click',()=>{location.href='/'});
addEventListener('online',()=>{location.href='/'});

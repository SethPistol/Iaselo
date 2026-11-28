/* IASELO · service worker (application installable, 27/11/2026).
   - Ne met en cache QUE les fichiers statiques de l'application (scripts, styles, images, polices) : jamais une réponse
     d'API (/api/, /fhir/), jamais un dossier patient. Le service worker ne conserve donc rien de médical sur le poste.
   - Réseau d'abord : en ligne, IASELO se comporte comme avant (toujours la dernière version). Hors ligne, les fichiers
     déjà chargés servent depuis le cache et toute page demandée affiche hors-ligne.html (procédure dégradée). */
'use strict';
const VERSION='iaselo-statique-3',HORS_LIGNE='/hors-ligne.html';
const PRECACHE=[HORS_LIGNE,'/manifest.webmanifest','/assets/app/icone-192.png','/assets/marque/iaselo.webp','/assets/marque/favicon.png','/accessibilite.css?v=1','/accessibilite.js?v=1','/accessibilite.js?v=2','/hors-ligne-page.js?v=1'];
const STATIQUE=/\.(?:js|css|webp|png|jpg|svg|woff2?|ttf|webmanifest)$/;
const JAMAIS=/^\/(?:api|fhir|__dev|auth|login|logout|modeles)\b/;
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==VERSION).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==location.origin||JAMAIS.test(u.pathname))return;
 if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match(HORS_LIGNE)));return}
 if(!STATIQUE.test(u.pathname))return;
 e.respondWith(fetch(r).then(res=>{if(res.ok&&res.type==='basic'){const copie=res.clone();caches.open(VERSION).then(c=>c.put(r,copie))}return res})
  .catch(()=>caches.match(r).then(x=>x||caches.match(r,{ignoreSearch:true})).then(x=>x||Response.error())));
});

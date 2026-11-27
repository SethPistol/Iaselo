import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// RGAA (27/11/2026) : le module commun est chargé partout, ne fait aucun appel réseau, et les corrections ponctuelles restent en place.
const lire=f=>fs.readFileSync(new URL('../dist/'+f,import.meta.url),'utf8');
test('module d’accessibilité chargé par l’application et chaque page patient',()=>{
 for(const f of ['index.html','patient.html','parcours.html','messagerie.html','preadmission.html','suivi-j1.html','espace-patient.html','ordonnance.html','lettre-liaison.html','devis.html','paiement.html','rendez-vous.html','chambre.html','hors-ligne.html']){
  const h=lire(f);assert.match(h,/accessibilite\.js\?v=\d/,f);assert.match(h,/accessibilite\.css\?v=\d/,f);assert.match(h,/<html lang="(fr|en)"/,f)}
});
test('lien d’évitement, titre de page et niveaux de titres, sans réseau',()=>{
 const js=lire('accessibilite.js');
 assert.match(js,/Aller au contenu/);assert.match(js,/document|d\.title/);assert.match(js,/aria-level/);
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|localStorage/);
});
test('corrections ponctuelles de l’audit',()=>{
 assert.match(lire('veille.js'),/class="v-dots" role="img" aria-label=/);
 assert.match(lire('parcours-suivi.js'),/type="month" name="mois" aria-label=/);
 assert.match(lire('consultation-modele.html'),/<dt class="empty">Récapitulatif<\/dt><dd class="empty">/);
 assert.match(lire('hors-ligne.html'),/button:focus-visible/);
 assert.match(fs.readFileSync(new URL('../server/auth.mjs',import.meta.url),'utf8'),/class="evite" href="#connexion"/);
});

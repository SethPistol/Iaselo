// Pages patient en 7 langues (4e veille, lot H) : chaque paquet couvre toutes les phrases, se charge sans réseau
// extérieur, et le moteur traduit phrases, dates et phrases composées.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const DIST=path.join(__dirname,'..','dist');
const moteur=fs.readFileSync(path.join(DIST,'traduction-patient.js'),'utf8');
const EN=JSON.parse(moteur.match(/const EN=(\{[\s\S]*?\});\n/)[1]);
const CODES=['es','pt','ar','it','de'];
function charger(code){
 const win={};const ctx={window:win};vm.createContext(ctx);
 win.IaseloLangue={enregistrer:p=>{ctx.paquet=p}};
 vm.runInContext(fs.readFileSync(path.join(DIST,'langues',code+'.js'),'utf8'),ctx);return ctx.paquet;
}
test('chaque paquet traduit toutes les phrases du dictionnaire, sans phrase vide',()=>{
 for(const code of CODES){const P=charger(code);
  assert.equal(P.code,code);assert.ok(P.avis.length>40,code);
  assert.deepEqual(Object.keys(P.phrases).sort(),Object.keys(EN).sort(),code+' : mêmes clés que l’anglais');
  for(const [k,v] of Object.entries(P.phrases))assert.ok(v.trim()&&!/\{|\}/.test(v),code+' : '+k);
  assert.equal(P.jours.length,7);assert.equal(P.mois.length,12);
  for(const k of ['rdv','a','avec','rappel','reference','interv','secteur','payer','le','urgence','prevue','prevueVers','bonjour','retour','accompagnant','chambre'])assert.ok(P.t[k],code+' : t.'+k);
  for(const k of Object.keys(P.urg))assert.ok(P.urg[k]);
  assert.equal(Object.keys(P.urg).length,6);
 }
 assert.equal(charger('ar').dir,'rtl');
});
test('le moteur reste local et propose les 7 langues',()=>{
 assert.doesNotMatch(moteur,/fetch\(|XMLHttpRequest|https?:\/\//);
 for(const code of CODES){assert.match(moteur,new RegExp("\\['"+code+"','"));const js=fs.readFileSync(path.join(DIST,'langues',code+'.js'),'utf8');assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|https?:\/\/|import\(/)}
 // L'urgence garde le 15 dans chaque langue.
 for(const code of CODES){const P=charger(code);assert.match(P.phrases['En cas d’urgence, appelez le 15.'],/15/);assert.match(P.t.urgence,/15/)}
});
test('traduction des phrases composées (dates, écran en chambre)',()=>{
 // Exécute le moteur dans un faux document minimal pour tester traduire().
 const noeud=()=>({setAttribute(){},append(){},prepend(){},querySelector:()=>null,querySelectorAll:()=>[],classList:{contains:()=>false},onclick:null});
 const doc={readyState:'loading',addEventListener(){},title:'Ma chambre',documentElement:{dataset:{}},currentScript:{src:'http://x/traduction-patient.js'},head:noeud(),body:noeud(),createElement:noeud,querySelector:()=>null,querySelectorAll:()=>[]};
 const win={};const ctx={window:win,document:doc,localStorage:{getItem:()=>'es',setItem(){}},navigator:{language:'fr-FR'},location:{href:'http://x/'},MutationObserver:class{observe(){}disconnect(){}}};
 vm.createContext(ctx);vm.runInContext(moteur,ctx);
 const L=win.IaseloLangue;L.enregistrer(charger('es'));
 // Pas encore démarré : la langue mémorisée est 'es'.
 assert.equal(L.langue(),'es');
 assert.equal(L.traduire('Date de naissance'),'Fecha de nacimiento');
 assert.equal(L.traduire('lundi 30 novembre'),'lunes 30 de noviembre');
 assert.equal(L.traduire('Prévue lundi 30 novembre vers 14 h 00'),'Prevista el lunes 30 de noviembre hacia las 14:00');
 assert.equal(L.traduire('Bonjour Élodie'),'Hola, Élodie');
 assert.equal(L.traduire('Retour : Taxi conventionné · accompagnant prévu'),'Regreso: Taxi concertado · acompañante previsto');
 assert.equal(L.traduire('J’ai mal (4/10) · envoyée'),'Tengo dolor (4/10) · enviada');
 assert.equal(L.traduire('Clinique du Trocadéro · chambre 12'),'Clinique du Trocadéro · habitación 12');
 assert.equal(L.traduire('Date de naissance :'),'Fecha de nacimiento :');
 assert.equal(L.traduire('Texte inconnu'),'Texte inconnu');
});

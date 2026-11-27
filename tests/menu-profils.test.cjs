'use strict';
// Menu par profil : chaque métier ne voit que ses entrées utiles, sans doublons.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),M=require('../dist/menu-profils.js');

test('menu : 6 à 12 entrées pour les métiers de soins et le secrétariat',()=>{
 // 11 pour l'anesthésiste depuis l'écran Préadmissions (26/11/2026), 12 avec le Télésuivi (27/11/2026).
 for(const job of ['anesthesiste','chirurgien','infirmier','secretariat']){const n=M.menuPourProfil(job,false).length;assert.ok(n>=6&&n<=12,job+' : '+n+' entrées')}
});
test('menu : doublons retirés pour tous les profils',()=>{
 for(const job of Object.keys(M.MENUS))for(const admin of [false,true]){const v=M.menuPourProfil(job,admin);for(const r of M.RETIREES)assert.ok(!v.includes(r),job+' voit '+r);assert.equal(new Set(v).size,v.length,job+' : entrée en double')}
});
test('menu : écrans hors métier masqués',()=>{
 const inf=M.menuPourProfil('infirmier',false),sec=M.menuPourProfil('secretariat',false);
 for(const v of ['pmsi','billing','activity','pilotage','professionalAccess'])assert.ok(!inf.includes(v),'infirmier voit '+v);
 for(const v of ['pmsi','billing','pharmacy','releve'])assert.ok(!sec.includes(v),'secrétariat voit '+v);
 assert.ok(sec.includes('priorities')&&inf.includes('priorities')&&sec.includes('patients')&&sec.includes('regulation')&&sec.includes('questionnaireSend'));
 assert.deepEqual(M.menuPourProfil('administration',false),['indicateurs','telephonie','professionalAccess','droits']);
 assert.deepEqual(M.menuPourProfil('inconnu',false),['professionalAccess']);
});
test('menu : l’administrateur des habilitations garde la gestion de la clinique',()=>{
 const v=M.menuPourProfil('anesthesiste',true);for(const x of ['professionalAccess','pilotage','droits','activity','billing'])assert.ok(v.includes(x),x);
 assert.ok(!M.menuPourProfil('anesthesiste',false).includes('pilotage'));
});
test('menu : chaque entrée correspond à un écran existant',()=>{
 const dist=path.join(__dirname,'..','dist'),src=fs.readdirSync(dist).filter(f=>/\.(js|html)$/.test(f)).map(f=>fs.readFileSync(path.join(dist,f),'utf8')).join('\n');
 for(const v of new Set(Object.values(M.MENUS).flat().concat(M.ADMIN)))assert.ok(src.includes(`data-view="${v}"`)||src.includes(`['${v}',`),'écran introuvable : '+v);
 assert.match(fs.readFileSync(path.join(dist,'index.html'),'utf8'),/menu-profils\.js/);
});
test('dossier : profils administratifs sans volets médicaux, création de séjour pour le secrétariat',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','dist','parcours-v8.js'),'utf8');
 assert.match(s,/const adminJob=\(\)=>\['secretariat','facturation','administration','unassigned'\]/);
 assert.match(s,/if\(adminJob\(\)&&!\(tab==='surgeryAnnouncement'&&jobNow\(\)==='secretariat'\)\)tab='adminDossier'/);
 assert.match(s,/\(adminJob\(\)\?\[ADMIN_STAGE,\.\.\.\(jobNow\(\)==='secretariat'\?dossierStages\.filter\(g=>g\.id==='annonce'\):\[\]\)\]:dossierStages\)\.map/);
 assert.match(s,/canCreateStay=\(\)=>jobNow\(\)\?\['anesthesiste','chirurgien','secretariat'\]/);
 assert.doesNotMatch(s,/newform'\)\.onsubmit=e=>\{\s*e\.preventDefault\(\);if\(nurseProfile\(\)\)return;/,'création bloquée pour le secrétariat');
 assert.equal((s.match(/newform'\)\.onsubmit=e=>\{\s*e\.preventDefault\(\);if\(!canCreateStay\(\)\)return;/g)||[]).length,2);
 assert.match(s,/function captureConsult\(\)\{const cx=p\(\);if\(!cx\?\.consult/,'plantage sans dossier');
});
test('barre « Dossier partagé » : indicateur compact, options repliées, export réservé à l’administrateur',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','dist','dossier-partage.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','dist','iaselo.css'),'utf8');
 assert.match(s,/<details class="shared-menu"><summary>Options<\/summary>/);
 assert.match(s,/bar\.dataset\.state=alerte\?'alert':occupe\?'busy':'ok'/);
 for(const id of ['shared-save-now','shared-refresh','shared-history','shared-backup'])assert.ok(s.includes('id="'+id+'"'),id+' conservé');
 assert.match(css,/body:not\(\[data-admin="true"\]\) #shared-backup \{ display: none; \}/);
});
test('Ma journée : indicateurs adaptés au métier, saisie peropératoire masquée sans droit',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','dist','parcours-v8.js'),'utf8');
 for(const label of ['Patients à surveiller','Dossiers en préparation','Comptes rendus à rédiger','Consultations à valider'])assert.ok(s.includes(label),label);
 assert.match(s,/\['Surveillance','Médicament','Événement','Bilan hydrique'\]\.filter\(periCanWrite\)/);
 assert.match(s,/peri-readonly/);
 assert.doesNotMatch(s,/if\(nurseProfile\(\)&&\['portal','priorities'\]\.includes\(view\)\)view='patients'/);
});
test('menu : l’infirmier(ère) d’étage n’a pas l’ouverture des salles, celle de bloc l’a',()=>{
 assert.ok(M.menuPourProfil('infirmier',false,'bloc').includes('ouvertureSalles'));
 assert.ok(M.menuPourProfil('infirmier',false,'cadre').includes('commandesPharmacie'),'cadre de bloc : commandes de matériel');
 assert.ok(!M.menuPourProfil('infirmier',false,'bloc').includes('commandesPharmacie'));
 for(const poste of ['etage','',undefined])assert.ok(!M.menuPourProfil('infirmier',false,poste).includes('ouvertureSalles'),'étage : '+poste);
 assert.ok(M.menuPourProfil('anesthesiste',false,'').includes('ouvertureSalles'));
 const s=fs.readFileSync(path.join(__dirname,'..','dist','parcours-v8.js'),'utf8');
 assert.match(s,/const blocInterdit=key=>infirmierEtage\(\)&&key==='checklistHas'/);
});

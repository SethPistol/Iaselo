'use strict';
// Menu par profil : chaque métier ne voit que ses entrées utiles, sans doublons.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),M=require('../dist/menu-profils.js');

test('menu : 6 à 9 entrées pour les métiers de soins et le secrétariat',()=>{
 for(const job of ['anesthesiste','chirurgien','infirmier','secretariat']){const n=M.menuPourProfil(job,false).length;assert.ok(n>=6&&n<=9,job+' : '+n+' entrées')}
});
test('menu : doublons retirés pour tous les profils',()=>{
 for(const job of Object.keys(M.MENUS))for(const admin of [false,true]){const v=M.menuPourProfil(job,admin);for(const r of M.RETIREES)assert.ok(!v.includes(r),job+' voit '+r);assert.equal(new Set(v).size,v.length,job+' : entrée en double')}
});
test('menu : écrans hors métier masqués',()=>{
 const inf=M.menuPourProfil('infirmier',false),sec=M.menuPourProfil('secretariat',false);
 for(const v of ['pmsi','billing','activity','pilotage','professionalAccess'])assert.ok(!inf.includes(v),'infirmier voit '+v);
 for(const v of ['pmsi','billing','pharmacy','releve','priorities'])assert.ok(!sec.includes(v),'secrétariat voit '+v);
 assert.ok(sec.includes('patients')&&sec.includes('regulation')&&sec.includes('questionnaireSend'));
 assert.deepEqual(M.menuPourProfil('administration',false),['professionalAccess','droits']);
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
 assert.match(s,/if\(adminJob\(\)\)tab='adminDossier'/);
 assert.match(s,/\(adminJob\(\)\?\[ADMIN_STAGE\]:dossierStages\)\.map/);
 assert.match(s,/canCreateStay=\(\)=>jobNow\(\)\?\['anesthesiste','chirurgien','secretariat'\]/);
 assert.doesNotMatch(s,/newform'\)\.onsubmit=e=>\{\s*e\.preventDefault\(\);if\(nurseProfile\(\)\)return;/,'création bloquée pour le secrétariat');
 assert.equal((s.match(/newform'\)\.onsubmit=e=>\{\s*e\.preventDefault\(\);if\(!canCreateStay\(\)\)return;/g)||[]).length,2);
 assert.match(s,/function captureConsult\(\)\{const cx=p\(\);if\(!cx\?\.consult/,'plantage sans dossier');
});

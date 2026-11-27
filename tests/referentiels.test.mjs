// Référentiels publics : lecture des archives ZIP et tables DBF de la CCAM (ameli), fichiers BDPM, propositions d'actes.
import test from 'node:test';import assert from 'node:assert/strict';import {deflateRawSync} from 'node:zlib';import {createRequire} from 'node:module';
import {construireCcam,archivesSurPage} from '../server/referentiels/ccam.mjs';
import {construireBdpm} from '../server/referentiels/bdpm.mjs';
import {cp850,entreesZip} from '../server/referentiels/archives.mjs';
const C=createRequire(import.meta.url)('../dist/ccam-regles.js');

// Encodeur CP850 inverse (tests uniquement) et écrivain DBF minimal au format dBase III.
const HAUT=[...Array(128)].map((_,i)=>cp850(Buffer.from([128+i])));
const enCp850=s=>Buffer.from([...s].map(c=>c.charCodeAt(0)<128?c.charCodeAt(0):128+HAUT.indexOf(c)));
function dbf(champs,lignes){
 const lgEnr=1+champs.reduce((a,c)=>a+c[1],0),lgEnt=32+32*champs.length+1,b=Buffer.alloc(lgEnt+lgEnr*lignes.length+1,0x20);
 b[0]=3;b.writeUInt32LE(lignes.length,4);b.writeUInt16LE(lgEnt,8);b.writeUInt16LE(lgEnr,10);b.fill(0,12,32);
 champs.forEach(([nom,lg],i)=>{const p=32+32*i;b.fill(0,p,p+32);b.write(nom,p,'latin1');b[p+11]=67;b[p+16]=lg});b[lgEnt-1]=0x0d;
 lignes.forEach((l,j)=>{let p=lgEnt+lgEnr*j;b[p++]=l.supprime?0x2a:0x20;champs.forEach(([nom,lg])=>{enCp850(String(l[nom]??'').padEnd(lg).slice(0,lg)).copy(b,p);p+=lg})});
 b[b.length-1]=0x1a;return b;
}
function zip(fichiers){
 const locaux=[],centraux=[];let decalage=0;
 for(const [nom,donnees] of fichiers){
  const c=deflateRawSync(donnees),n=Buffer.from(nom),l=Buffer.alloc(30);
  l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(8,8);l.writeUInt32LE(c.length,18);l.writeUInt32LE(donnees.length,22);l.writeUInt16LE(n.length,26);
  const e=Buffer.alloc(46);e.writeUInt32LE(0x02014b50,0);e.writeUInt16LE(8,10);e.writeUInt32LE(c.length,20);e.writeUInt32LE(donnees.length,24);e.writeUInt16LE(n.length,28);e.writeUInt32LE(decalage,42);
  locaux.push(l,n,c);centraux.push(e,n);decalage+=30+n.length+c.length;
 }
 const rep=Buffer.concat(centraux),fin=Buffer.alloc(22);fin.writeUInt32LE(0x06054b50,0);fin.writeUInt16LE(fichiers.length,8);fin.writeUInt16LE(fichiers.length,10);fin.writeUInt32LE(rep.length,12);fin.writeUInt32LE(decalage,16);
 return Buffer.concat([...locaux,rep,fin]);
}
const long='Méniscectomie latérale ou médiale du genou, par arthroscopie'.padEnd(300,' ');
const archives=[
 zip([['R_ACTE.dbf',dbf([['COD_ACTE',13],['NOM_COURT',70],['NOM_LONG0',254],['NOM_LONG1',254],['DT_MODIF',8],['DT_FIN',8],['MENU_COD',6]],[
  {COD_ACTE:'NFFC004',NOM_COURT:'Méniscectomie genou arthro',NOM_LONG0:long.slice(0,254),NOM_LONG1:long.slice(254),DT_MODIF:'20200101',MENU_COD:'12'},
  {COD_ACTE:'NFFC004',NOM_COURT:'ancienne',NOM_LONG0:'Ancien libellé',DT_MODIF:'20100101',MENU_COD:'12'},
  {COD_ACTE:'NFFC004',NOM_COURT:'future',NOM_LONG0:'Version future',DT_MODIF:'29990101',MENU_COD:'12'},
  {COD_ACTE:'NEKA020',NOM_COURT:'PTH',NOM_LONG0:'Remplacement de l’articulation coxofémorale par prothèse totale',DT_MODIF:'20210101',MENU_COD:'12'},
  {COD_ACTE:'ZZZZ999',NOM_COURT:'fini',NOM_LONG0:'Acte supprimé',DT_MODIF:'20000101',DT_FIN:'20150101',MENU_COD:'12'},
  {COD_ACTE:'AAAA001',NOM_COURT:'effacé',NOM_LONG0:'Enregistrement supprimé',DT_MODIF:'20000101',MENU_COD:'12',supprime:true}])]]),
 zip([['R_ACTE_IVITE.dbf',dbf([['COD_AA',14],['ACTE_COD',13],['ACTIV_COD',1],['DT_MODIF',8]],[
  {COD_AA:'NFFC0041',ACTE_COD:'NFFC004',ACTIV_COD:'1',DT_MODIF:'20200101'},{COD_AA:'NFFC0044',ACTE_COD:'NFFC004',ACTIV_COD:'4',DT_MODIF:'20200101'},
  {COD_AA:'NEKA0201',ACTE_COD:'NEKA020',ACTIV_COD:'1',DT_MODIF:'20200101'},{COD_AA:'NEKA0204',ACTE_COD:'NEKA020',ACTIV_COD:'4',DT_MODIF:'20200101'}])],
  ['R_ACTE_IVITE_PHASE.dbf',dbf([['COD_AAP',15],['PU_BASE',12],['DT_MODIF',8]],[{COD_AAP:'NFFC00410',PU_BASE:'172.80',DT_MODIF:'20200101'},{COD_AAP:'NFFC00410',PU_BASE:'150.00',DT_MODIF:'20150101'},{COD_AAP:'NFFC00440',PU_BASE:'60.00',DT_MODIF:'20200101'}])],
  ['R_ACTE_IVITE_MODIF.dbf',dbf([['COD_AA',14],['MODIFI_COD',1],['DT_MODIF',8]],[{COD_AA:'NFFC0041',MODIFI_COD:'K'},{COD_AA:'NFFC0041',MODIFI_COD:'J'},{COD_AA:'NFFC0044',MODIFI_COD:'7'},{COD_AA:'NFFC0044',MODIFI_COD:'A'}])],
  ['R_TB_MODIF.dbf',dbf([['COD_MODIF',1],['LIBELLE',80],['COEF',8],['FORFAIT',8],['DT_DEBUT',8]],[{COD_MODIF:'K',LIBELLE:'Majoration K (test)',COEF:'1.20',DT_DEBUT:'20200101'},{COD_MODIF:'K',LIBELLE:'Ancienne',COEF:'1.10',DT_DEBUT:'20100101'},{COD_MODIF:'F',LIBELLE:'Forfait F (test)',COEF:'',FORFAIT:'19.06',DT_DEBUT:'20200101'},{COD_MODIF:'7',LIBELLE:'Majoration 7 (test)',COEF:'104',DT_DEBUT:'20200101'}])],
  ['R_MENU.dbf',dbf([['COD_MENU',6],['COD_PERE',6],['RANG',3],['LIBELLE',100]],[{COD_MENU:'1',COD_PERE:'',RANG:'0',LIBELLE:'ARBORESCENCE'},{COD_MENU:'12',COD_PERE:'1',RANG:'14',LIBELLE:'Système ostéoarticulaire du membre inférieur'}])]])
];

test('CCAM : archives ameli, version en vigueur, libellé long recollé, actes clos écartés',async()=>{
 assert.equal(entreesZip(archives[1]).length,5);
 const r=await construireCcam(archives,{version:'08400',aujourdhui:'20261123'});
 assert.equal(r.version,'08400');assert.deepEqual(r.actes.map(a=>a[0]),['NEKA020','NFFC004']);
 const m=r.actes.find(a=>a[0]==='NFFC004');
 assert.equal(m[1],'Méniscectomie latérale ou médiale du genou, par arthroscopie');assert.equal(m[2],'14');assert.equal(m[3],172.8);assert.equal(m[4],'Système ostéoarticulaire du membre inférieur');
 assert.deepEqual(m[5],{'1':172.8,'4':60},'tarif par activité');assert.deepEqual(m[6],{'1':'JK','4':'7A'},'modificateurs autorisés par activité');
 assert.equal(r.modificateurs.K.libelle,'Majoration K (test)');assert.ok(Math.abs(r.modificateurs.K.majoration-0.2)<1e-9);assert.ok(Math.abs(r.modificateurs['7'].majoration-0.04)<1e-9);assert.equal(r.modificateurs.F.forfait,19.06);
 await assert.rejects(construireCcam([archives[1]]),/R_ACTE absente/);
});

test('CCAM : liens des archives repérés sur la page ameli',()=>{
 const html='<a href="/fileadmin/user_upload/documents/CCAM08500_DBF_PART1.zip">1</a><a href="https://www.ameli.fr/fileadmin/user_upload/documents/CCAM8500_DBF_PART2.zip">2</a><a href="/fileadmin/x/CCAM08400_DBF_PART1.zip">ancienne</a>';
 assert.deepEqual(archivesSurPage(html),{version:'08500',urls:['https://www.ameli.fr/fileadmin/user_upload/documents/CCAM08500_DBF_PART1.zip','https://www.ameli.fr/fileadmin/user_upload/documents/CCAM8500_DBF_PART2.zip']});
 assert.equal(archivesSurPage('<html>maintenance</html>'),null);
});

test('Codage : propositions depuis le compte rendu, recherche, contrôle du code et de l’activité',async()=>{
 const ix=C.indexer(await construireCcam(archives,{version:'08400',aujourdhui:'20261123'}));
 const p=C.proposer(ix,'Intervention : arthroscopie du genou droit\nMéniscectomie médiale partielle sous arthroscopie.');
 assert.equal(p[0].code,'NFFC004');assert.ok(p[0].communs.includes('arthro'));
 assert.equal(C.proposer(ix,'Prothèse totale de hanche, articulation coxofémorale')[0].code,'NEKA020');
 assert.deepEqual(C.proposer(ix,'le patient va bien'),[]);
 assert.equal(C.rechercher(ix,'nffc004')[0].code,'NFFC004');assert.equal(C.rechercher(ix,'prothese totale')[0].code,'NEKA020');
 assert.equal(C.verifier(ix,'NFFC004','4').ok,true);assert.match(C.verifier(ix,'ZZZZ999','1').message,/n’existe pas/);
 assert.match(C.verifier(ix,'nffc04','1').message,/4 lettres/);assert.equal(C.verifier(null,'NFFC004','1').avertissement.length>0,true);
});

test('BDPM : spécialités et substances actives avec dosage, encodage Windows-1252 accepté',()=>{
 const n=10001,spe=[...Array(n)].map((_,i)=>[String(60000000+i),'PRODUIT '+i+', comprimé','comprimé','orale','Autorisation active','Procédure nationale','Commercialisée'].join('\t'));
 spe[0]=['60000000','PARACÉTAMOL EXEMPLE 500 mg, gélule','gélule','orale','Autorisation active','Procédure nationale','Commercialisée'].join('\t');
 const compo=['60000000\tgélule\t2202\tPARACÉTAMOL\t500 mg\tune gélule\tSA\t1','60000000\tgélule\t9999\tEXCIPIENT\t\t\tFT\t2'].join('\r\n');
 const b=construireBdpm(new TextEncoder().encode(spe.join('\n')),Buffer.from(compo,'latin1'),{date:'2026-11-23'});
 assert.equal(b.specialties.length,n);assert.deepEqual(b.specialties[0],['60000000','PARACÉTAMOL EXEMPLE 500 mg, gélule','gélule','orale','Autorisation active','Commercialisée',['PARACÉTAMOL'],['500 mg']]);
 assert.throws(()=>construireBdpm(Buffer.from(spe.slice(0,10).join('\n')),Buffer.from('')),/incomplet/);
 assert.throws(()=>construireBdpm(Buffer.from([spe[0],spe[0]].join('\n')),Buffer.from('')),/double/);
});

test('CCAM : ameli en maintenance (520) → nouvelles tentatives puis copie du dépôt, la CCAM déjà chargée est gardée',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{gzipSync}=await import('node:zlib');
 const {majCcam,rafraichirCcam,CCAM_CONNUE}=await import('../scripts/referentiels.mjs');
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ccam-')),depot=path.join(dossier,'depot.json.gz');
 const ref=await construireCcam(archives,{version:'08400',aujourdhui:'20261123'});fs.writeFileSync(depot,gzipSync(JSON.stringify(ref)));
 const appels=[],fetchOrig=globalThis.fetch;
 globalThis.fetch=async u=>{appels.push(String(u));return new Response('Maintenance',{status:520})};
 try{
  assert.deepEqual(CCAM_CONNUE.urls[1],['https://www.ameli.fr/fileadmin/user_upload/documents/CCAM08400_DBF_PART2.zip','https://www.ameli.fr/fileadmin/user_upload/documents/CCAM8400_DBF_PART2.zip']);
  const journal=[];const r=await majCcam({dossier,depot,essais:2,journal:m=>journal.push(m)});
  assert.equal(r.etat,'ok');assert.equal(r.copie,'dépôt');assert.equal(r.version,'08400');assert.match(r.erreurAmeli,/HTTP 520/);
  assert.ok(appels.filter(u=>u.endsWith('CCAM08400_DBF_PART1.zip')).length===2,'deux essais par adresse');
  assert.ok(appels.some(u=>u.endsWith('CCAM8400_DBF_PART1.zip')),'orthographe sans zéro essayée');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dossier,'ccam.json'),'utf8')).actes.length,2);
  // Une CCAM aussi récente est déjà en place : on la garde (échec signalé, pas d'écrasement).
  await assert.rejects(majCcam({dossier,depot,essais:1,journal:()=>{}}),/HTTP 520/);
  // Sans copie du dépôt ni CCAM chargée : échec et « absent » dans l'état.
  const vide=fs.mkdtempSync(path.join(os.tmpdir(),'ccam-'));
  const e=await rafraichirCcam({dossier:vide,journal:()=>{},forcer:true,essais:1,depot:path.join(vide,'aucun.gz')});
  assert.equal(e.change,false);const etat=JSON.parse(fs.readFileSync(path.join(vide,'referentiels.json'),'utf8'));assert.equal(etat.ccam.etat,'echec');assert.equal(etat.ccam.absent,true);
 }finally{globalThis.fetch=fetchOrig}
});

test('CCAM : le serveur reprend la version officielle dès qu’ameli répond à nouveau',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {rafraichirCcam}=await import('../scripts/referentiels.mjs');
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ccam-'));
 fs.writeFileSync(path.join(dossier,'referentiels.json'),JSON.stringify({ccam:{etat:'ok',version:'08400',copie:'dépôt',actes:1}}));
 const page='<a href="/fileadmin/user_upload/documents/CCAM08400_DBF_PART1.zip">1</a><a href="/fileadmin/user_upload/documents/CCAM08400_DBF_PART2.zip">2</a>';
 const fetchOrig=globalThis.fetch;
 globalThis.fetch=async u=>String(u).endsWith('.php')?new Response(page):new Response(String(u).includes('PART1')?archives[0]:archives[1]);
 try{
  const r=await rafraichirCcam({dossier,journal:()=>{}});
  assert.equal(r.change,true);assert.equal(r.etat.copie,undefined);assert.equal(r.etat.actes,2);
  // Version officielle déjà chargée et rien de plus récent publié : aucun téléchargement.
  let telechargements=0;globalThis.fetch=async u=>{if(!String(u).endsWith('.php'))telechargements++;return new Response(page)};
  assert.equal((await rafraichirCcam({dossier,journal:()=>{}})).change,false);assert.equal(telechargements,0);
 }finally{globalThis.fetch=fetchOrig}
});

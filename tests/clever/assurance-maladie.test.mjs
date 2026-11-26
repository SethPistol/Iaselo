// Transmission à l'Assurance maladie : droits, minimisation par métier, résumé PMSI validé par le DIM,
// envoi BAR^P12, facture transmise, retour NOEMIE (flux entrant) puis rejet et correction (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {_testCcam} from '../../worker/assurance-maladie.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const JETON='jeton-de-test-facturation-0123456789abcdef';

test('Assurance maladie : droits, PMSI, facture, retours',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);_testCcam(new Map([['NEKA020',{libelle:'Remplacement de l’articulation coxofémorale par prothèse totale',tarif:470.49}]]));
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),interopEnv:{INTEROP_FACTURATION_JETON:JETON,INTEROP_FINESS:'750000000',IASELO_RECETTE:'true'}});
  const call=async(method,route,data,cookie,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(cookie,method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const job of ['secretariat','facturation','dim','anesthesiste','infirmier','chirurgien']){
   const id=await createAccount(pool,{email:job+'@example.test',name:'Nom '+job,passwordHash:await hashPassword(password)});await pool.query('UPDATE professional_profiles SET profession=$2,updated_at=$3 WHERE user_id=$1',[id,job,at]);
   await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[job]=await login(job+'@example.test',password)}
  const doc=(key,data)=>pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES($1,$2,1,'test',$3,$4,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data",[key,JSON.stringify(data),at,crypto.randomUUID()]);
  await doc('stay/AM1/core',{id:'AM1',careTeamId:'demo-clinique',mode:'Hospitalisation',stage:'Sortie',identity:{lastName:'DUPONT',firstName:'Marie',birthDate:'1985-02-14',sex:'Féminin'}});
  await pool.query("INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES('AM1','demo-clinique',$1) ON CONFLICT DO NOTHING",[at]);
  await doc('stay/AM1/consult',{asa:'II',ext:{surgeryDate:'2026-11-20'}});
  await doc('stay/AM1/codage',{actes:{chir:{code:'NEKA020',confirme:true},anes:{code:'NEKA020',confirme:true}},decisions:{'acte:chir':{decision:'Validé'},'acte:anes':{decision:'Validé'},I10:{decision:'Retenu'}}});
  await doc('stay/AM1/peropRapide',{evenements:[{label:'Entrée en salle',at:'2026-11-20T08:00:00.000Z'}],dmi:[{gtin:'03401234567893',lot:'L42',serie:'S1'}]});
  const {secretariat:sec,facturation:fac,dim,anesthesiste:mar,infirmier:ide}=c;

  assert.equal((await api(ide,'GET','/marche/assurance')).status,403,'infirmier : pas d’accès');
  let l=(await api(sec,'GET','/marche/assurance')).data;assert.equal(l.liste.find(x=>x.stay==='AM1').etape.cle,'droits');
  // Droits : NIR contrôlé côté serveur.
  assert.equal((await api(sec,'POST','/marche/assurance',{action:'droits',stay:'AM1',droits:{nir:'285027512345673'}})).status,400,'clé du NIR fausse');
  assert.equal((await api(dim,'POST','/marche/assurance',{action:'droits',stay:'AM1',droits:{nir:'285027512345672'}})).status,403,'DIM : pas la saisie des droits');
  let r=await api(sec,'POST','/marche/assurance',{action:'droits',stay:'AM1',droits:{nir:'2 85 02 75 123 456 72',qualite:'assure',regime:'general',caisse:'751',nature:'10',exoneration:'aucune',amc:'oui',amcNumero:'12345678',codePostal:'75016'}});assert.equal(r.status,200);
  r=await api(sec,'POST','/marche/assurance',{action:'adri',stay:'AM1'});assert.equal(r.data.dossier.droits.adri.ouverts,true);assert.equal(r.data.dossier.droits.acquisition,'adri');
  r=await api(sec,'POST','/marche/assurance',{action:'roc',stay:'AM1'});assert.match(r.data.dossier.droits.roc.reference,/^SIM-ROC-/);
  // Minimisation : le secrétariat ne reçoit ni diagnostics, ni ASA, ni pré-facture.
  let vs=(await api(sec,'GET','/marche/assurance?stay=AM1')).data.dossier;assert.equal(vs.contexte.diagnostics,undefined);assert.equal(vs.contexte.asa,undefined);assert.equal(vs.preFacture,null);assert.equal(vs.pmsi.dp,undefined);
  // PMSI : saisi par l'anesthésiste, validé par le DIM seulement.
  r=await api(mar,'POST','/marche/assurance',{action:'pmsi',stay:'AM1',pmsi:{entree:'2026-11-20',sortie:'2026-11-23',modeEntree:'8',modeSortie:'8',dp:'m161',das:'I10',dmi:{'03401234567893':{enSus:'oui',lpp:'3101234',prix:'1500'}}}});assert.equal(r.status,200);
  const d1=r.data.dossier;assert.equal(d1.pmsi.dp,'M16.1');assert.equal(d1.contexte.actes.find(a=>a.activite==='4').extension,'2','ASA II de la consultation');assert.equal(d1.contexte.actes[0].date,'2026-11-20');
  assert.equal((await api(mar,'POST','/marche/assurance',{action:'valider-pmsi',stay:'AM1'})).status,403,'validation réservée au DIM');
  assert.equal((await api(dim,'POST','/marche/assurance',{action:'envoyer-pmsi',stay:'AM1'})).status,400,'envoi avant validation refusé');
  r=await api(dim,'POST','/marche/assurance',{action:'valider-pmsi',stay:'AM1'});assert.equal(r.status,200,JSON.stringify(r.data));
  r=await api(dim,'POST','/marche/assurance',{action:'envoyer-pmsi',stay:'AM1'});assert.equal(r.status,200);assert.equal(r.data.dossier.pmsi.envoi.simulation,true);
  const envois=(await api(dim,'GET','/marche/assurance?stay=AM1')).data.envois;assert.match(envois[0].data.message,/BAR\^P12[\s\S]*DG1\|1\|\|M16\.1/);
  // Facture : bloquée sans GHS, puis transmise ; pas de diagnostic dans la facture.
  let t1=await api(fac,'POST','/marche/assurance',{action:'transmettre',stay:'AM1'});assert.equal(t1.status,400);assert.ok(t1.data.erreurs.some(e=>/GHS/.test(e)));
  // Tarifs de l'arrêté importés : le tarif du GHS se remplit seul.
  assert.equal((await api(sec,'POST','/marche/assurance',{action:'tarifs',texte:'821;4100'})).status,403,'tarifs : facturation seulement');
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'tarifs',annee:'2026',texte:'GHS;tarif;bb;bh;exh\n821;4100,00;2;12;210\n'})).data.nombre,1);
  r=await api(fac,'POST','/marche/assurance',{action:'facture',stay:'AM1',facture:{ghm:'08C48',ghs:'821',chambreNuits:'3',chambrePrix:'90',amcChambreParNuit:'60'}});assert.equal(r.status,200);
  assert.equal(r.data.dossier.facture.tarifAuto.tarif,4100);assert.deepEqual([r.data.dossier.repartition.amo,r.data.dossier.repartition.amc,r.data.dossier.repartition.patient],[r.data.dossier.preFacture.amo,284,90]);
  const pf=r.data.dossier.preFacture;assert.equal(pf.participation,24);assert.equal(pf.forfaitJournalier,80);assert.equal(pf.baseSejour,5600,'GHS + implant en sus');
  assert.equal(r.data.dossier.contexte.diagnostics,undefined,'facturation : pas de diagnostic');
  // Valeur de chaque acte et dépassements d'honoraires saisis par la facturation (26/11/2026).
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'facture',stay:'AM1',facture:{depassements:{'chir:1':'abc'}}})).status,400);
  r=await api(fac,'POST','/marche/assurance',{action:'facture',stay:'AM1',facture:{tarifs:{'chir:4':'150,5'},depassements:{'chir:1':'100'}}});assert.equal(r.status,200);
  let hono=r.data.dossier.preFacture.honoraires;assert.deepEqual(hono.map(h=>[h.cle,h.montant,h.depassement,h.total,h.tarifSource]),[['chir:1',470.49,100,570.49,'ccam'],['chir:4',150.5,0,150.5,'facturation']]);
  assert.ok(r.data.dossier.constats.some(c=>/100 € \(chirurgien\) sans devis signé/.test(c.message)),'devis obligatoire dès 70 €');
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'transmettre',stay:'AM1'})).status,400,'dépassement sans devis : bloqué');
  r=await api(fac,'POST','/marche/assurance',{action:'facture',stay:'AM1',facture:{depassements:{'chir:1':'0'}}});assert.equal(r.data.dossier.preFacture.depassementsActes,0);
  t1=await api(fac,'POST','/marche/assurance',{action:'transmettre',stay:'AM1'});assert.equal(t1.status,200,JSON.stringify(t1.data));
  const ref=t1.data.dossier.facture.reference;assert.match(ref,/^FAC-/);assert.equal(t1.data.dossier.statut,'transmise');
  const fEnvoi=(await api(fac,'GET','/marche/assurance?stay=AM1')).data.envois.find(e=>e.data.type==='Facture B2');assert.doesNotMatch(fEnvoi.data.message,/M16/);assert.match(fEnvoi.data.message,/285027512345672/);
  assert.equal((await api(mar,'POST','/marche/assurance',{action:'pmsi',stay:'AM1',pmsi:{dp:'M16.0'}})).status,409,'verrouillé après transmission');
  // Retour par le flux entrant (logiciel de facturation) : rejet, puis correction et paiement.
  assert.equal((await call('POST','/api/interop/entrant/retours',JSON.stringify({reference:ref,statut:'rejet'}),null,{Authorization:'Bearer mauvais'})).status,403);
  const fl=await call('POST','/api/interop/entrant/retours',JSON.stringify({reference:ref,statut:'rejet',motif:'droits',libelle:'Droits fermés'}),null,{Authorization:'Bearer '+JETON});assert.equal(fl.status,200);
  let v=(await api(fac,'GET','/marche/assurance?stay=AM1')).data;assert.equal(v.dossier.statut,'rejete');assert.equal(v.retours[0].data.motif,'droits');
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'rouvrir',stay:'AM1'})).status,200);
  t1=await api(fac,'POST','/marche/assurance',{action:'transmettre',stay:'AM1'});assert.equal(t1.status,200);
  r=await api(fac,'POST','/marche/assurance',{action:'simuler-retour',stay:'AM1',issue:'paye'});assert.equal(r.data.dossier.statut,'paye');
  l=(await api(fac,'GET','/marche/assurance')).data;assert.equal(l.liste.find(x=>x.stay==='AM1').etape.cle,'paye');
  // Factures numérotées : 1re émission annulée par avoirs après le rejet, 2e émission lettrée par le paiement NOEMIE.
  let fv=(await api(fac,'GET','/marche/assurance?vue=factures')).data;
  assert.deepEqual(fv.factures.map(f=>f.data.numero).sort(),['A2026-000001','A2026-000002','A2026-000003','F2026-000001','F2026-000002','F2026-000003','F2026-000004','F2026-000005','F2026-000006']);
  const amo2=fv.factures.find(f=>f.data.numero==='F2026-000004'),pat=fv.factures.find(f=>f.data.numero==='F2026-000006');
  assert.equal(amo2.data.debiteur,'amo');assert.equal(amo2.data.etat,'soldee');assert.equal(pat.data.debiteur,'patient');assert.equal(pat.data.montant,90);
  assert.equal(fv.factures.find(f=>f.data.numero==='F2026-000001').data.etat,'annulee');
  assert.equal((await api(sec,'GET','/marche/assurance?vue=factures')).status,403);
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'encaissement',id:pat.id,montant:'100',mode:'carte'})).status,400,'au-delà du solde');
  r=await api(fac,'POST','/marche/assurance',{action:'encaissement',id:pat.id,montant:'90',mode:'carte'});assert.equal(r.data.facture.status,'soldee');
  const amc=fv.factures.find(f=>f.data.numero==='F2026-000005');
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'avoir',id:amc.id,motif:'non'})).status,400,'motif trop court');
  r=await api(fac,'POST','/marche/assurance',{action:'avoir',id:amc.id,motif:'Erreur de complémentaire'});assert.equal(r.data.avoir.data.numero,'A2026-000004');
  assert.equal((await api(fac,'POST','/marche/assurance',{action:'lot-b2'})).status,400,'aucune facture AMO en attente');
  const csv=(await api(fac,'GET','/marche/assurance?vue=export')).data.csv;assert.match(csv,/F2026-000006;4113/);assert.match(csv,/BQ;.*F2026-000006;512/);
  // Espace DIM : tableau du mois de sortie et fichier RSS.
  assert.equal((await api(fac,'GET','/marche/assurance?vue=dim')).status,403);
  const dv=(await api(dim,'GET','/marche/assurance?vue=dim&mois=2026-11')).data;assert.equal(dv.tableau.sortis,1);assert.equal(dv.tableau.valides,1);
  const lot=await api(dim,'POST','/marche/assurance',{action:'lot-pmsi',mois:'2026-11'});assert.equal(lot.status,200,JSON.stringify(lot.data));
  assert.equal(lot.data.lot.data.nombre,1);const rum=lot.data.fichier.split('\r\n')[0];assert.equal(rum.slice(0,12),'750000000018');assert.match(rum,/M161/);assert.equal(rum.slice(97,102),'75016');
  // Journal d'accès.
  const log=(await pool.query("SELECT count(*) AS n FROM professional_access_log WHERE target LIKE 'marche/assurance%'")).rows[0];assert.ok(Number(log.n)>5);
 }finally{await pool.end()}
});

// Accueil téléphonique par IA : règles (urgence, intentions, aucune donnée personnelle), simulation tracée,
// route de l'opérateur absente sans secret puis signée HMAC (horodatage, rejeu), données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {createRequire} from 'node:module';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {signer} from '../../worker/telephonie.mjs';
const T=createRequire(import.meta.url)('../../dist/accueil-telephonique-regles.js');
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const SECRET='secret-operateur-telephonie-de-test-0123456789';

test('règles : urgence → 15 et transfert, intentions reconnues, pas d’information personnelle',()=>{
 const lundi10h=new Date('2026-11-30T09:00:00Z'),samedi=new Date('2026-11-28T10:00:00Z');
 const u=T.analyser('Mon père a été opéré hier, il a une douleur dans la poitrine et il respire mal.',{date:lundi10h});
 assert.equal(u.intention,'urgence');assert.ok(u.transfert);assert.match(u.reponse,/15/);assert.equal(u.orientation,'garde');
 const cas={'Je voudrais décaler mon rendez-vous avec l’anesthésiste.':'rendez-vous','Est-ce que je peux boire un café le matin de l’opération ?':'consignes',
  'Je ne pourrai pas venir pour mon opération lundi, je suis malade.':'annulation','Je n’ai pas reçu mon compte rendu opératoire.':'documents',
  'Combien vais-je payer pour le dépassement d’honoraires ?':'facturation','Où se garer pour la visite ?':'visite','Bonjour, je voudrais parler à quelqu’un.':'autre'};
 for(const [texte,attendu] of Object.entries(cas)){const r=T.analyser(texte,{date:lundi10h});assert.equal(r.intention,attendu,texte);assert.ok(r.rappel);assert.ok(!r.transfert)}
 assert.match(T.analyser('À quelle heure dois-je arriver ?',{date:lundi10h}).reponse,/ne peux pas les donner au téléphone/);
 assert.ok(T.analyser('rendez-vous',{date:samedi}).horsHeures);assert.match(T.analyser('rendez-vous',{date:samedi}).reponse,/fermé/);
 assert.equal(T.ouvert(lundi10h),true);assert.equal(T.ouvert(samedi),false);
 assert.equal(T.masquer('0612345678'),'06 ** ** ** 78');assert.equal(T.normaliserNumero('+33 6 12 34 56 78'),'0612345678');assert.equal(T.normaliserNumero('123'),'');
 assert.doesNotMatch(T.accueil('Clinique Test'),/\d{2} \d{2}/);
});

test('simulation par le secrétariat, numéro masqué, rappel traité, route opérateur signée',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const mk=interopEnv=>makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv});
  let app=await mk({});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace/telephonie'+route,data,{Cookie:cookie});return {status:r.status,data:await r.json()}};
  assert.equal((await call('GET','/api/workspace/telephonie')).status,401);
  let r=await api('GET','');assert.equal(r.status,200);assert.equal(r.data.mode,'simulation');assert.equal(r.data.appels.length,0);
  assert.equal((await api('POST','',{action:'simuler',numero:'12',texte:'rendez-vous'})).status,400);
  r=await api('POST','',{action:'simuler',numero:'06 12 34 56 78',texte:'Je voudrais décaler mon rendez-vous.'});assert.equal(r.status,200);assert.equal(r.data.appel.intention,'rendez-vous');assert.equal(r.data.appel.numero,'06 ** ** ** 78');
  const id=r.data.appel.id;
  await api('POST','',{action:'simuler',numero:'0600000000',texte:'Il respire mal depuis ce matin'});
  r=await api('GET','');assert.equal(r.data.appels.length,2);assert.equal(r.data.appels[0].intention,'urgence');assert.equal(r.data.urgences,1);assert.equal(r.data.aRappeler,1);
  assert.ok(r.data.appels.every(a=>!/\d{10}/.test(a.numero)));
  r=await api('GET','?appel='+id);assert.equal(r.data.numeroComplet,'0612345678');
  assert.equal((await api('POST','',{action:'traiter',id,note:'Rappelée, RDV déplacé'})).status,200);
  assert.equal((await api('POST','',{action:'traiter',id})).status,409);
  const log=(await pool.query("SELECT reason FROM professional_access_log WHERE action IN ('write','read') AND target LIKE 'telephonie/%'")).rows.map(x=>x.reason);
  assert.ok(log.includes('Appel simulé')&&log.includes('Appel traité')&&log.includes('Numéro affiché pour rappel'),JSON.stringify(log));
  // Opérateur : route absente sans secret.
  assert.equal((await call('POST','/api/telephonie/appel',{transcription:'x'})).status,404);
  app=await mk({TELEPHONIE_SECRET:SECRET});
  const corps=JSON.stringify({appel:'op-1',numero:'+33611223344',transcription:'Je n’ai pas reçu mon compte rendu.'}),ts=String(Math.floor(Date.now()/1000));
  assert.equal((await call('POST','/api/telephonie/appel',corps,{'X-Iaselo-Horodatage':ts,'X-Iaselo-Signature':'00'})).status,401);
  const vieux=String(Math.floor(Date.now()/1000)-900);
  assert.equal((await call('POST','/api/telephonie/appel',corps,{'X-Iaselo-Horodatage':vieux,'X-Iaselo-Signature':await signer(SECRET,vieux,corps)})).status,401);
  const ok=await call('POST','/api/telephonie/appel',corps,{'X-Iaselo-Horodatage':ts,'X-Iaselo-Signature':await signer(SECRET,ts,corps)});assert.equal(ok.status,200);
  const j=await ok.json();assert.equal(j.orientation,'secretariat');assert.match(j.dire,/espace patient/);assert.equal(j.transfert,false);
  const encore=await (await call('POST','/api/telephonie/appel',corps,{'X-Iaselo-Horodatage':ts,'X-Iaselo-Signature':await signer(SECRET,ts,corps)})).json();assert.equal(encore.id,j.id);
  r=await api('GET','');assert.equal(r.data.mode,'operateur');assert.equal(r.data.appels.filter(a=>a.canal==='operateur').length,1);
 }finally{await db.close()}
});

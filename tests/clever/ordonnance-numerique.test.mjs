// Ordonnance numérique de sortie en simulation (5e veille, lot 5). Données fictives.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_INFIRMIERES} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows??r.rows.length}};return {query,async connect(){return {query,release(){}}},async end(){await db.close()}}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('ordonnance numérique : dépôt, version, délivrance simulée, annulation, droits',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv:{}});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(email,password)=>(await call('POST','/auth/login',{email,password})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const as=c=>async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:c});return {status:r.status,data:await r.json()}};
  const api=as(cookie);
  const put=async(key,data)=>{const cur=(await api('GET','')).data.documents.find(d=>d.key===key);const r=await api('PUT','/document',{key,data,revision:cur?.revision||0,operation:crypto.randomUUID(),reason:'Test ordonnance numérique'});assert.equal(r.status,200,key+' '+JSON.stringify(r.data))};
  const s='DÉMO-ON1';
  await put('stay/'+s+'/core',{id:s,careTeamId:'demo-clinique',stage:'Sortie',mode:'Ambulatoire',identity:{lastName:'Fictif',firstName:'Lina',birthDate:'1975-09-23'}});
  const items=[{drug:'Paracétamol 1 g',dose:'1 comprimé',frequency:'4 fois par jour'},{drug:'Kétoprofène 100 mg',dose:'1 comprimé',frequency:'2 fois par jour',duration:'3 jours'}];
  const prescripteur={nom:'Dr Démo',rpps:'10000000001',specialite:'Anesthésie-réanimation'};
  const R='/ordonnance-numerique';
  let r=await api('POST',R,{action:'deposer',stay:s,items:[],prescripteur});assert.equal(r.status,400);
  r=await api('POST',R,{action:'deposer',stay:s,items,prescripteur});assert.equal(r.status,200,JSON.stringify(r.data));
  const v1=r.data.ordonnance;assert.match(v1.id,/^SIM-/);assert.equal(v1.statut,'deposee');assert.equal(v1.lignes.length,2);
  r=await api('POST',R,{action:'deposer',stay:s,items,prescripteur});assert.equal(r.data.ordonnance.id,v1.id,'même contenu : pas de doublon');assert.equal(r.data.deja,true);
  // Nouvelle version : l'ancienne est annulée.
  const items2=[...items,{drug:'Oméprazole 20 mg',dose:'1 gélule',frequency:'le soir'}];
  r=await api('POST',R,{action:'deposer',stay:s,items:items2,prescripteur});const v2=r.data.ordonnance;assert.notEqual(v2.id,v1.id);
  r=await api('GET',R+'?stay='+encodeURIComponent(s));assert.equal(r.data.ordonnances.length,2);assert.equal(r.data.ordonnances.find(o=>o.id===v1.id).statut,'annulee');
  // Lecture par identifiant (QR code) ; identifiant invalide refusé.
  r=await api('GET',R+'?id='+v2.id);assert.equal(r.status,200);assert.equal(r.data.ordonnance.lignes.length,3);
  assert.equal((await api('GET',R+'?id=SIM-AAAAA-AAAAA-AAAAAA')).status,400);
  // Délivrance partielle puis totale.
  r=await api('POST',R,{action:'delivrer',id:v2.id,lignes:[],officine:'Pharmacie démo'});assert.equal(r.status,400);
  r=await api('POST',R,{action:'delivrer',id:v2.id,lignes:[0,1],officine:'Pharmacie démo'});assert.equal(r.data.ordonnance.statut,'delivree-partielle');
  r=await api('POST',R,{action:'annuler',id:v1.id,motif:'Erreur'});assert.equal(r.status,409,'déjà annulée');
  r=await api('POST',R,{action:'delivrer',id:v2.id,lignes:[2]});assert.equal(r.data.ordonnance.statut,'delivree');
  r=await api('POST',R,{action:'delivrer',id:v2.id,lignes:[0]});assert.equal(r.status,409);
  r=await api('POST',R,{action:'annuler',id:v2.id,motif:'Erreur de saisie'});assert.equal(r.status,409,'délivrée : annulation impossible');
  // Annulation d'une version non délivrée.
  r=await api('POST',R,{action:'deposer',stay:s,items:[{drug:'Tramadol 50 mg'}],prescripteur});const v3=r.data.ordonnance;
  r=await api('POST',R,{action:'annuler',id:v3.id,motif:'x'});assert.equal(r.status,400);
  r=await api('POST',R,{action:'annuler',id:v3.id,motif:'Changement de traitement'});assert.equal(r.data.ordonnance.statut,'annulee');
  // Droits : une infirmière lit mais ne dépose pas.
  const inf=RECETTE_INFIRMIERES.find(i=>i.poste==='etage'),ic=as(await login(inf.email,inf.password));
  r=await ic('GET',R+'?stay='+encodeURIComponent(s));assert.equal(r.status,200);
  r=await ic('POST',R,{action:'deposer',stay:s,items,prescripteur});assert.equal(r.status,403);
  r=await ic('POST',R,{action:'annuler',id:v3.id,motif:'Essai infirmier'});assert.equal(r.status,403);
 }finally{await db.close()}
});

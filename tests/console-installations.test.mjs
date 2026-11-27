// Console des installations : état de chaque installation, script de création, jeton requis.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../server/database.mjs';import {bootstrap} from '../server/auth.mjs';import {config} from '../server/config.mjs';import {makeApp} from '../server/index.mjs';
import {etat,tableau,scriptNouvelle,codeValide} from '../scripts/console-installations.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('état de l’installation : jeton exigé, aucune donnée de santé, lu par la console',async()=>{
 const db=new PGlite(),pool=pgPool(db),JETON='j'.repeat(40);process.env.INSTANCE_CONSOLE_TOKEN=JETON;
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null},async check(){}},cfg:config(env),messaging:null});
  const get=(h={})=>app(new Request(origin+'/api/instance/etat',{headers:h}));
  assert.equal((await get()).status,401);assert.equal((await get({Authorization:'Bearer mauvais'})).status,401);
  const r=await get({Authorization:'Bearer '+JETON});assert.equal(r.status,200);const e=await r.json();
  assert.equal(e.base,'ok');assert.equal(e.stockage,'ok');assert.match(e.derniereMigration,/026_etablissement/);assert.equal(e.etablissement.nom,'Clinique du Trocadéro');
  assert.deepEqual(Object.keys(e).sort(),['base','baseUrl','commit','demarrage','derniereMigration','etablissement','migrations','recette','stockage','version']);
  const fetcher=(u,o)=>app(new Request(String(u),o));
  const res=await etat([{nom:'Trocadéro',url:origin,jetonVariable:'J1'},{nom:'Lilas',url:origin,jetonVariable:'J2'}],{fetcher,env:{J1:JETON}});
  assert.equal(res[0].ok,true);assert.equal(res[1].ok,false);assert.match(res[1].erreur,/J2/);
  assert.match(tableau(res),/OK/);assert.match(tableau(res),/À VOIR/);
  delete process.env.INSTANCE_CONSOLE_TOKEN;
  const app2=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null});
  assert.equal((await app2(new Request(origin+'/api/instance/etat',{headers:{Authorization:'Bearer '+JETON}}))).status,404,'sans jeton configuré : route absente');
 }finally{delete process.env.INSTANCE_CONSOLE_TOKEN;await pool.end()}
});

test('script de création : application, base, stockage, variables, secrets générés',()=>{
 const r=scriptNouvelle({code:'lilas',nom:'Clinique des Lilas',url:'https://lilas.example.test',adminEmail:'admin@example.test',finess:'690000000'},{secret:()=>'S'.repeat(96),jeton:()=>'T'.repeat(64)});
 assert.equal(r.alias,'iaselo-lilas');assert.equal(r.jetonVariable,'IASELO_CONSOLE_LILAS');
 for(const x of ['clever create --type node','postgresql-addon','cellar-addon','ETABLISSEMENT_NOM \'Clinique des Lilas\'','ETABLISSEMENT_FINESS','SESSION_SECRET \''+'S'.repeat(96),'INSTANCE_CONSOLE_TOKEN','clever deploy','BASE_URL \'https://lilas.example.test\''])assert.ok(r.sh.includes(x),x);
 assert.deepEqual(r.entree,{code:'lilas',nom:'Clinique des Lilas',url:'https://lilas.example.test',alias:'iaselo-lilas',jetonVariable:'IASELO_CONSOLE_LILAS'});
 assert.ok(!JSON.stringify(r.entree).includes('T'.repeat(64)),'jeton jamais écrit dans la liste');
 assert.ok(codeValide('lilas'));assert.ok(!codeValide('Lilas!'));
 assert.match(scriptNouvelle({code:'x1',nom:"L'Hôpital",url:'https://x.test',adminEmail:'a@b'}).sh,/'L'\\''Hôpital'/,'apostrophes protégées');
});

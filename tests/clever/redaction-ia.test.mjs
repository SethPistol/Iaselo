// Rédaction assistée côté serveur : moteur par règles par défaut, modèle « compatible » activé seulement avec
// une attestation HDS, contexte pseudonymisé envoyé au modèle, repli en cas d'échec, décision tracée, droits par métier.
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import http from 'node:http';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {moteurCompatible} from '../../worker/redaction-ia.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test rédaction'});

test('rédaction : configuration du moteur compatible (https, clé, modèle, attestation HDS)',()=>{
 assert.equal(moteurCompatible({}).moteur,undefined);
 assert.match(moteurCompatible({IA_MOTEUR:'compatible',IA_URL:'http://exemple.test/v1',IA_CLE:'k',IA_MODELE:'m',IA_HDS:'oui'}).erreur,/https/);
 assert.match(moteurCompatible({IA_MOTEUR:'compatible',IA_URL:'https://exemple.test/v1',IA_CLE:'k',IA_MODELE:'m'}).erreur,/HDS/);
 assert.equal(moteurCompatible({IA_MOTEUR:'compatible',IA_URL:'https://exemple.test/v1',IA_CLE:'k',IA_MODELE:'m',IA_HDS:'oui'}).moteur.id,'compatible');
});

async function monter(interopEnv){
 const db=new PGlite(),pool=pgPool(db);await migrate(pool);await bootstrap(pool,env);
 const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null,interopEnv});
 const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
 const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
 const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
 const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:c});return {status:r.status,data:await r.json()}};
 await api('PUT','/document',edit('stay/R1/core',{id:'R1',careTeamId:'demo-clinique',specialty:'Orthopédie',mode:'Hospitalisation',identity:{lastName:'NOMFICTIF',firstName:'Prénomfictif',birthDate:'1960-06-15',sex:'Féminin'}}));
 await api('PUT','/document',edit('stay/R1/consult',{asa:'2',allergies:'Pénicilline',plan:'Rachianesthésie',ext:{operation:'Prothèse totale de genou',surgeryDate:'2026-12-10'}}));
 return {pool,app,call,login,api};
}

test('rédaction : moteur par règles, décision tracée, droits par métier',async()=>{
 const {pool,login,api}=await monter({});
 try{
  let g=await api('GET','/redaction?stay=R1');assert.equal(g.status,200);assert.equal(g.data.moteur.id,'gabarit');assert.equal(g.data.moteur.local,true);
  assert.equal((await api('POST','/redaction',{action:'generer',stay:'R1',type:'inconnu'})).status,400);
  const p=await api('POST','/redaction',{action:'generer',stay:'R1',type:'consultation'});assert.equal(p.status,200);
  const prop=p.data.proposition;assert.equal(prop.moteur,'gabarit');assert.match(prop.texte,/Classe ASA : 2/);assert.doesNotMatch(prop.texte,/NOMFICTIF/);
  assert.equal((await api('PUT','/document',edit('stay/R1/redactionIa',{propositions:[]}))).status,403,'rubrique écrite par le serveur');
  assert.equal((await api('POST','/redaction',{action:'decider',stay:'R1',id:prop.id,decision:'acceptee',texte:''})).status,400);
  const d=await api('POST','/redaction',{action:'decider',stay:'R1',id:prop.id,decision:'acceptee',texte:prop.texte+'\nRelu.'});
  assert.equal(d.status,200);assert.equal(d.data.proposition.statut,'acceptee');assert.equal(d.data.proposition.modifie,true);
  assert.equal((await api('POST','/redaction',{action:'decider',stay:'R1',id:prop.id,decision:'rejetee'})).status,409);
  // Le chirurgien ne rédige pas la consultation d'anesthésie ; le secrétariat n'accède pas à l'outil.
  const at=new Date().toISOString(),password='Mot de passe de test 2026',c={};
  for(const [k,job] of [['chir','chirurgien'],['secr','secretariat']]){const id=await createAccount(pool,{email:k+'@example.test',name:k,passwordHash:await hashPassword(password)});
   await pool.query('UPDATE professional_profiles SET profession=$2,display_name=$3,updated_at=$4 WHERE user_id=$1',[id,job,k,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
   await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);c[k]=await login(k+'@example.test',password)}
  assert.equal((await api('POST','/redaction',{action:'generer',stay:'R1',type:'consultation'},c.chir)).status,403);
  assert.equal((await api('POST','/redaction',{action:'generer',stay:'R1',type:'cro'},c.chir)).status,200);
  assert.equal((await api('GET','/redaction?stay=R1',undefined,c.secr)).status,403);
  const log=(await pool.query("SELECT action FROM professional_access_log WHERE action LIKE 'redaction-ia-%'")).rows.map(r=>r.action);
  assert.ok(log.includes('redaction-ia-proposition')&&log.includes('redaction-ia-decision'));
 }finally{await pool.end()}
});

test('rédaction : modèle compatible avec contexte pseudonymisé, repli par règles en cas d’échec',async()=>{
 const recus=[];let panne=false;
 const srv=http.createServer((req,res)=>{let b='';req.on('data',x=>b+=x);req.on('end',()=>{recus.push({auth:req.headers.authorization,body:JSON.parse(b)});if(panne){res.writeHead(503);res.end();return}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'COMPTE RENDU (modèle)\nASA 2.'}}]}))})});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const {pool,api}=await monter({IA_MOTEUR:'compatible',IA_URL:`http://127.0.0.1:${srv.address().port}/v1/chat/completions`,IA_CLE:'cle-test',IA_MODELE:'modele-test',IA_HDS:'oui'});
 try{
  assert.equal((await api('GET','/redaction?stay=R1')).data.moteur.id,'compatible');
  let p=await api('POST','/redaction',{action:'generer',stay:'R1',type:'consultation'});assert.equal(p.status,200);
  assert.equal(p.data.proposition.moteur,'compatible');assert.match(p.data.proposition.texte,/^\[Brouillon proposé par IASELO[\s\S]*COMPTE RENDU \(modèle\)/);
  assert.equal(recus[0].auth,'Bearer cle-test');assert.equal(recus[0].body.model,'modele-test');
  const envoye=JSON.stringify(recus[0].body);assert.doesNotMatch(envoye,/NOMFICTIF|Prénomfictif|1960-06-15|R1/);assert.match(envoye,/Pénicilline/);
  panne=true;p=await api('POST','/redaction',{action:'generer',stay:'R1',type:'consultation'});
  assert.equal(p.data.proposition.moteur,'gabarit');assert.match(p.data.proposition.echecModele,/503/);assert.match(p.data.avertissement,/brouillon par règles/);
 }finally{srv.close();await pool.end()}
});

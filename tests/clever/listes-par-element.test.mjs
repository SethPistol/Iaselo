import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';import {ITEM_MARKER} from '../../worker/items.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080';
const id=(n,extra={})=>[n,{lastName:'FICTIF',firstName:n,birthDate:'1980-01-01',...extra}];
test('audit 24/11 point 4 : listes partagées fusionnées élément par élément, historique par élément',async()=>{
 const db=new PGlite(),pool=pgPool(db),env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const a=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const cores=['P1','P2','P3'].map(n=>({key:'stay/'+n+'/core',data:{id:n,careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:n}}}));
  assert.equal((await call('POST','/api/workspace/seed',{documents:[...cores,{key:'identities/records',data:[id('P1'),id('P2')]}]},a)).status,200);
  const put=(data,revision,cookie=a)=>call('PUT','/api/workspace/document',{key:'identities/records',revision,data,operation:crypto.randomUUID(),reason:'test listes'},cookie);
  // Poste 1 et poste 2 partent de la révision 1 ; chacun modifie un patient différent.
  let r=await put([id('P1',{phone:'0601'}),id('P2')],1);assert.equal(r.status,200);assert.equal((await r.json()).document.revision,2);
  r=await put([id('P1'),id('P2',{phone:'0602'})],1);assert.equal(r.status,200,'pas de conflit pour un autre patient');
  let doc=(await r.json()).document;assert.equal(doc.revision,3);
  assert.deepEqual(doc.data.map(([k,v])=>[k,v.phone]),[['P1','0601'],['P2','0602']],'les deux modifications sont gardées');
  // Ajout depuis un poste resté en révision 1 : les modifications des autres ne sont pas écrasées.
  r=await put([id('P1'),id('P2'),id('P3')],1);assert.equal(r.status,200);doc=(await r.json()).document;
  assert.deepEqual(doc.data.map(([k,v])=>[k,v.phone||'']),[['P1','0601'],['P2','0602'],['P3','']]);
  // Même patient modifié des deux côtés : vrai conflit, rien n'est écrit.
  const base=doc.revision;r=await put([id('P1',{phone:'0611'}),id('P2',{phone:'0602'}),id('P3')],base);assert.equal(r.status,200);doc=(await r.json()).document;
  r=await put([id('P1',{phone:'0699'}),id('P2',{phone:'0602'}),id('P3')],base);assert.equal(r.status,409);const c=await r.json();assert.equal(c.conflicts[0].key,'identities/records');
  assert.equal((await pool.query("SELECT data FROM workspace_documents WHERE key='identities/records'")).rows[0].data.includes('0699'),false);
  // Suppression depuis une version à jour.
  r=await put([id('P1',{phone:'0611'}),id('P2',{phone:'0602'})],doc.revision);assert.equal(r.status,200);doc=(await r.json()).document;assert.deepEqual(doc.data.map(([k])=>k),['P1','P2']);
  // Historique : repère seulement dans les versions du document, détail par élément, version reconstituée.
  const versions=(await pool.query("SELECT data FROM workspace_versions WHERE key='identities/records'")).rows;assert.ok(versions.every(v=>v.data===ITEM_MARKER));
  const items=(await pool.query("SELECT item,revision,data FROM workspace_item_versions WHERE key='identities/records' ORDER BY sequence")).rows;
  assert.deepEqual(items.map(x=>x.item+'@'+x.revision+(x.data===null?'-':'')),['P1@1','P2@1','P1@2','P2@3','P3@4','P1@5','P3@6-']);
  const v3=await (await call('GET','/api/workspace/version?key=identities/records&revision=3',undefined,a)).json();
  assert.deepEqual(v3.document.data.map(([k,v])=>[k,v.phone]),[['P1','0601'],['P2','0602']]);
  const v1=await (await call('GET','/api/workspace/version?key=identities/records&revision=1',undefined,a)).json();assert.deepEqual(v1.document.data.map(([k,v])=>[k,v.phone]),[['P1',undefined],['P2',undefined]]);
  // Rejeu de la même opération (réseau coupé après l'envoi) : réponse identique, pas de doublon.
  const op=crypto.randomUUID(),body={key:'identities/records',revision:doc.revision,data:[id('P1',{phone:'0611'}),id('P2',{phone:'0603'})],operation:op,reason:'rejeu'};
  const first=await call('PUT','/api/workspace/document',body,a),second=await call('PUT','/api/workspace/document',body,a);assert.equal(first.status,200);assert.equal(second.status,200);assert.equal((await second.json()).replayed,true);
  // Lecture du dossier : la liste complète, filtrée par équipe, comme avant.
  const w=await (await call('GET','/api/workspace',undefined,a)).json();assert.deepEqual(w.documents.find(d=>d.key==='identities/records').data.map(([k,v])=>[k,v.phone]),[['P1','0611'],['P2','0603']]);
 }finally{await db.close()}
});
test('audit 24/11 point 4 : réservations de deux professionnels sur des patients différents, sans conflit',async()=>{
 const db=new PGlite(),pool=pgPool(db),env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const a=await login(RECETTE_EMAIL,RECETTE_PASSWORD),c=await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD);
  const cores=['R1','R2'].map(n=>({key:'stay/'+n+'/core',data:{id:n,careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:n}}}));
  assert.equal((await call('POST','/api/workspace/seed',{documents:[...cores,{key:'management/reservations',data:[]}]},a)).status,200);
  const row=(p,i)=>({id:'RES-'+p,patient:p,label:'Intervention '+i});
  const put=(data,revision,cookie)=>call('PUT','/api/workspace/document',{key:'management/reservations',revision,data,operation:crypto.randomUUID(),reason:'test réservations'},cookie);
  let r=await put([row('R1',1)],1,a);assert.equal(r.status,200,await r.clone().text());
  r=await put([row('R2',2)],1,c);assert.equal(r.status,200,'le chirurgien, resté en révision 1, ne bloque pas');
  assert.deepEqual((await r.json()).document.data.map(x=>x.id).sort(),['RES-R1','RES-R2']);
 }finally{await db.close()}
});

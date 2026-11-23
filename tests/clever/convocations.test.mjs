// SMS de convocation calculé à partir du programme de bloc (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test convocations'});

test('convocation : la veille à partir de 16 h, bloc − 1 h, rectificatif si l’heure change, réglages, alerte sans numéro',async()=>{
 const db=new PGlite(),pool=pgPool(db);
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const messaging={channels:{sms:true,email:true},establishment:'Clinique test',sms:async m=>{sent.push(m);return 'S1'},email:async()=>'E1'};
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const me=(await api('GET','')).data.user;
  for(const [stay,phone] of [['V1','+33611223301'],['V2',''],['V3','+33611223303'],['V4','+33611223304']]){
   await api('PUT','/document',edit('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',identity:{lastName:'FICTIF',firstName:'Test',birthDate:'1980-01-01'}}));
   if(phone)await api('PUT','/document',edit('stay/'+stay+'/invitationContact',{contact:{firstName:'Test',lastName:'FICTIF',birthDate:'1980-01-01',phone},confirmed:true,verifiedBy:me,verifiedAt:new Date().toISOString(),source:'Test'}));
  }
  // Programme de bloc (écrit directement : le contrôle des vacations est testé ailleurs).
  const setProgramme=async rows=>{const at=new Date().toISOString();await pool.query("INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES('management/reservations',$1,1,'test',$2,$3,'test') ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data,operation=EXCLUDED.operation,revision=workspace_documents.revision+1",[JSON.stringify(rows),at,crypto.randomUUID()])};
  const prog=[
   {id:'R1',patient:'V1',resource:'salle-1',vacationId:'VAC-1',procedure:'Geste fictif',start:'2026-11-24T08:30',end:'2026-11-24T09:30',state:'Réservée'},
   {id:'R1b',patient:'V1',resource:'etage-1-2',procedure:'Lit',start:'2026-11-24T06:00',end:'2026-11-24T23:00',state:'Réservée'},
   {id:'R2',patient:'V2',resource:'salle-1',vacationId:'VAC-1',procedure:'Geste fictif',start:'2026-11-24T10:00',end:'2026-11-24T11:00',state:'Réservée'},
   {id:'R3',patient:'V3',resource:'salle-1',vacationId:'VAC-1',procedure:'Geste fictif',start:'2026-11-24T11:00',end:'2026-11-24T12:00',state:'Annulée'}];
  await setProgramme(prog);
  const at=iso=>app.rappels({now:new Date(iso)});

  // Avant 16 h la veille : rien.
  await at('2026-11-23T14:00:00Z');assert.equal(sent.length,0);
  // 16 h 10 : convocation à 7 h 30 pour un passage à 8 h 30 ; lit et réservation annulée ignorés.
  await at('2026-11-23T15:10:00Z');
  assert.equal(sent.length,1);assert.equal(sent[0].to,'+33611223301');assert.equal(sent[0].tag,'iaselo-convocation');
  assert.equal(sent[0].content,'Clinique test : vous êtes attendu(e) le mardi 24 novembre à 07 h 30 à l’accueil des admissions de la clinique. Restez à jeun selon les consignes remises en consultation. En cas d’empêchement, appelez la clinique.');
  assert.doesNotMatch(sent[0].content,/FICTIF|Geste|1980/);
  let s=(await api('GET','/espace-patient/status?stay=V1')).data.espacePatient;assert.equal(s.rappelsAuto[0].kind,'convocation');assert.equal(s.rappelsAuto[0].heure,'2026-11-24T07:30');
  s=(await api('GET','/espace-patient/status?stay=V2')).data.espacePatient;assert.equal(s.rappelsAuto[0].ok,false);assert.match(s.rappelsAuto[0].raison,/numéro de portable/);
  // Passage suivant : pas de doublon.
  await at('2026-11-23T15:20:00Z');assert.equal(sent.length,1);

  // L'heure de bloc change : SMS rectificatif.
  prog[0]={...prog[0],start:'2026-11-24T09:15'};await setProgramme(prog);
  await at('2026-11-23T16:00:00Z');assert.equal(sent.length,2);assert.match(sent[1].content,/^Clinique test : MODIFICATION de votre convocation\. vous êtes attendu\(e\) le mardi 24 novembre à 08 h 15/);

  // Réglages dans l'application : décalage 90 min → nouvelle heure 7 h 45, rectificatif.
  assert.equal((await api('POST','/convocations',{decalageMinutes:5,heureEnvoi:16,lieu:'Accueil'})).status,400);
  let g=await api('POST','/convocations',{decalageMinutes:90,heureEnvoi:16,lieu:'l’accueil du rez-de-chaussée'});assert.equal(g.status,200);assert.equal(g.data.reglages.decalageMinutes,90);
  g=await api('GET','/convocations?date=2026-11-24');assert.deepEqual(g.data.convocations.map(c=>[c.stay,c.convocation]),[['V1','2026-11-24T07:45'],['V2','2026-11-24T08:30']]);
  assert.equal(g.data.convocations[0].envoi.ok,true);
  await at('2026-11-23T16:10:00Z');assert.equal(sent.length,3);assert.match(sent[2].content,/07 h 45 à l’accueil du rez-de-chaussée/);

  // Programmé tard (après 21 h) : envoyé le jour même dès 6 h si l'arrivée est encore à venir.
  prog.push({id:'R4',patient:'V4',resource:'salle-1',vacationId:'VAC-1',procedure:'Geste fictif',start:'2026-11-24T14:00',end:'2026-11-24T15:00',state:'Réservée'});await setProgramme(prog);
  await at('2026-11-23T20:30:00Z');assert.equal(sent.length,3);
  await at('2026-11-24T05:10:00Z');assert.equal(sent.length,4);assert.equal(sent[3].to,'+33611223304');assert.match(sent[3].content,/12 h 30/);
  const {rows}=await pool.query("SELECT result FROM professional_access_log WHERE action='convocation'");assert.ok(rows.some(x=>x.result==='allowed'));assert.ok(rows.some(x=>x.result==='denied'));
 }finally{await db.close()}
});

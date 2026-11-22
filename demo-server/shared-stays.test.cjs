const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomBytes}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

const port='18109',base='http://127.0.0.1:'+port;
const accounts={demo:'test-demo-password-only',secretariat:'test-secretariat-password',anesthesie:'test-anesthesie-password',ide:'test-ide-password-only'};
let server;
async function start(database){
 server=spawn(process.execPath,[require.resolve('./server.cjs')],{env:{...process.env,
  PORT:port,DEMO_HOST:'127.0.0.1',DEMO_BASE_URL:base,DEMO_DB:database,
  DEMO_PASSWORD:accounts.demo,DEMO_SECRETARIAT_PASSWORD:accounts.secretariat,
  DEMO_ANESTHESIE_PASSWORD:accounts.anesthesie,DEMO_IDE_PASSWORD:accounts.ide
 },stdio:['ignore','pipe','inherit']});
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Serveur arrêté')})]);
}
async function stop(){
 if(!server||server.exitCode!==null)return;
 const exited=once(server,'exit');
 server.kill();
 await exited;
}
const headers=user=>user?{Authorization:'Basic '+Buffer.from(user+':'+accounts[user]).toString('base64')}:{};
const call=(path,user,body,origin=base)=>fetch(base+path,{
 method:body===undefined?'GET':'POST',headers:{...headers(user),...(body===undefined?{}:{origin,'Content-Type':'application/json'})},
 body:body===undefined?undefined:JSON.stringify(body)
});

(async()=>{
 const folder=await mkdtemp(join(tmpdir(),'parcours-demo-'));
 try{
  const database=join(folder,'stays.sqlite');
  await start(database);
  assert.equal((await call('/shared')).status,401);
  assert.match(await (await call('/shared','secretariat')).text(),/src="parcours-v8\.js(?:\?[^"]*)?"/);
  assert.equal((await call('/api/stays','demo')).status,403);
  const identity={lastName:'Lefèvre',firstName:'Élodie',birthDate:'1992-12-17'};
  const newStay={specialty:'ORL',mode:'Ambulatoire',...identity};
  assert.equal((await call('/api/stays','secretariat',{...newStay,birthDate:'1992-02-30'})).status,400);
  assert.equal((await call('/api/stays','secretariat',newStay,'http://untrusted.example')).status,403);
  assert.equal((await call('/api/stays','ide',newStay)).status,403);
  const created=await call('/api/stays','secretariat',newStay);
  assert.equal(created.status,201);
  const {id}=await created.json(),route='/api/stays/'+id.slice('DÉMO-P-'.length);
  const list=async account=>(await (await call('/api/stays',account)).json()).stays[0];
  const {consult,revision}=await list('anesthesie');
  consult.ext={author:'Médecin fictif'};
  assert.equal((await call(route+'/consultation','ide',{consult,revision})).status,403);
  assert.equal((await call(route+'/consultation','anesthesie',{consult,revision})).status,200);
  consult.validated=true;
  consult.validation={author:'Médecin fictif'};
  assert.equal((await call(route+'/consultation','anesthesie',{consult,revision})).status,409);
  assert.equal((await call(route+'/consultation','anesthesie',{consult,revision:revision+1})).status,200);
  assert.equal((await call(route+'/stage','anesthesie',{stage:'SSPI'})).status,200);
  assert.equal((await list('anesthesie')).sector,'');
  const transfer={sector:'sspi-endo',previous:''};
  assert.equal((await call(route+'/sector','ide',transfer)).status,403);
  assert.equal((await call(route+'/sector','anesthesie',{...transfer,sector:'inconnu'})).status,400);
  assert.equal((await call(route+'/sector','anesthesie',transfer)).status,200);
  assert.equal((await call(route+'/sector','anesthesie',transfer)).status,200);
  assert.equal((await call(route+'/sector','anesthesie',{sector:'etage-2',previous:''})).status,409);
  assert.equal((await list('secretariat')).sector,'sspi-endo');
  const values={location:'SSPI',at:'2026-11-17T10:00',spo2:'98'};
  const requestId=randomBytes(16).toString('hex');
  assert.equal((await call(route+'/vitals','ide',{values:{...values,spo2:'101'},requestId})).status,400);
  assert.equal((await call(route+'/vitals','ide',{values,requestId})).status,200);
  assert.equal((await call(route+'/vitals','ide',{values,requestId})).status,200);
  await stop();
  const inspection=new DatabaseSync(database,{readOnly:true});
  try{
   const reads=inspection.prepare('SELECT at,actor,stay,action FROM shared_access ORDER BY sequence').all();
   assert.ok(reads.some(read=>read.actor==='anesthesie'&&read.stay===Number(route.split('/').at(-1))));
   assert.ok(reads.some(read=>read.actor==='secretariat'&&read.action==='lecture administrative'));
   assert.ok(reads.every(read=>Number.isFinite(Date.parse(read.at))));
   assert.ok(reads.every(read=>!Object.hasOwn(read,'consult')));
  }finally{inspection.close()}
  await start(database);
  const stay=await list('ide');
  assert.equal(stay.id,id);
  assert.deepEqual(stay.identity,identity);
  assert.deepEqual((await list('secretariat')).identity,identity);
  assert.equal(stay.stage,'SSPI');
  assert.equal(stay.sector,'sspi-endo');
  assert.equal(stay.consult.validated,true);
  assert.equal(stay.postopVitals.length,1);
  assert.equal(stay.postopVitals[0].values.spo2,'98');
  assert.equal(stay.postopVitals[0].author,'ide');
  assert.equal(stay.events.length,6);
  assert.equal((await list('secretariat')).consult,undefined);
  console.log('Séjour partagé : trois comptes, contrôle des droits, conflit de version, saisie unique et persistance après redémarrage vérifiés.');
 }finally{
  await stop();
  await rm(folder,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});

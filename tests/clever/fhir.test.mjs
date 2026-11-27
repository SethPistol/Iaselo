// API FHIR R4 : clients autorisés par l'administrateur, jeton OAuth 2.0, portées, ressources FR Core, recherche,
// webhook signé sans donnée de santé, révocation, journal d'accès (données fictives).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import http from 'node:http';import {createHmac} from 'node:crypto';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
import {idFhir,sejourDe} from '../../worker/fhir.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
const edit=(key,data,revision=0)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test FHIR'});

test('FHIR : identifiants de séjour convertis en identifiants FHIR valides, réversibles',()=>{
 for(const s of ['DEMO-1','DÉMO-001','a b/c','x-1'])assert.equal(sejourDe(idFhir(s)),s);
 assert.equal(idFhir('DEMO-1'),'DEMO-1');assert.match(idFhir('DÉMO-001'),/^x-[0-9a-f]+$/);
});

test('FHIR : clients, jeton, portées, ressources, recherche, webhook signé et révocation',async()=>{
 const db=new PGlite(),pool=pgPool(db),recus=[];
 const hook=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{recus.push({headers:req.headers,body:b});res.writeHead(204);res.end()})});
 await new Promise(r=>hook.listen(0,'127.0.0.1',r));const port=hook.address().port;
 try{
  await migrate(pool);await bootstrap(pool,env);
  const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env),messaging:null});
  const call=async(method,route,data,headers={})=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}));
  const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
  const cookie=await login(RECETTE_EMAIL,RECETTE_PASSWORD);
  const api=async(method,route,data,c=cookie)=>{const r=await call(method,'/api/workspace'+route,data,{Cookie:c});return {status:r.status,data:await r.json()}};
  const stay='DÉMO-F1',fid=idFhir(stay);
  await api('PUT','/document',edit('stay/'+stay+'/core',{id:stay,careTeamId:'demo-clinique',specialty:'Orthopédie',mode:'Hospitalisation',stage:'Consultation',identity:{lastName:'USAGE',birthName:'NAISSANCE',firstName:'Test',sex:'Féminin',birthDate:'1970-02-03'}}));
  await api('PUT','/document',edit('stay/'+stay+'/surgicalAnnouncement',{published:{fields:{procedure:'Prothèse totale de genou',surgeon:'Dr Exemple',laterality:'Droite',date:'2026-12-10'}}}));
  const consult={ext:{operation:'Prothèse totale de genou',surgeryDate:'2026-12-10',consultDate:'2026-11-20'},allergies:'Pénicilline (urticaire)',medicationRows:[{name:'BISOPROLOL 5 mg',dose:'5 mg',frequency:'1 le matin',decision:'Poursuivre',cis:'61234567'},{name:'Ancien traitement',decision:'Arrêt',removed:true}]};
  assert.equal((await api('PUT','/document',edit('stay/'+stay+'/consult',consult))).status,200);

  // Administration : réservée à l'administrateur, contrôles des portées et du webhook.
  assert.equal((await api('POST','/fhir',{action:'creer',nom:'Agenda',portees:['system/Patient.write']})).status,400);
  assert.equal((await api('POST','/fhir',{action:'creer',nom:'Agenda',portees:['system/Patient.read'],webhook:'http://exemple.test/hook'})).status,400);
  const c1=await api('POST','/fhir',{action:'creer',nom:'Agenda partenaire',portees:['system/Patient.read','system/Encounter.read'],webhook:`http://127.0.0.1:${port}/hook`});
  assert.equal(c1.status,201,JSON.stringify(c1.data));assert.match(c1.data.client.id,/^fhir-[a-f0-9]{16}$/);assert.ok(c1.data.client_secret&&c1.data.webhook_secret);
  const liste=await api('GET','/fhir');assert.equal(liste.data.clients.length,1);assert.doesNotMatch(JSON.stringify(liste.data),new RegExp(c1.data.client_secret));

  // Jeton OAuth 2.0.
  const form=o=>new URLSearchParams(o).toString(),tokenReq=(o,h={})=>call('POST','/fhir/oauth/token',form(o),{'Content-Type':'application/x-www-form-urlencoded',...h});
  assert.equal((await tokenReq({grant_type:'password',client_id:c1.data.client.id,client_secret:c1.data.client_secret})).status,400);
  assert.equal((await tokenReq({grant_type:'client_credentials',client_id:c1.data.client.id,client_secret:'faux'})).status,401);
  assert.equal((await tokenReq({grant_type:'client_credentials',client_id:c1.data.client.id,client_secret:c1.data.client_secret,scope:'system/Procedure.read'})).status,400);
  const basic='Basic '+Buffer.from(c1.data.client.id+':'+c1.data.client_secret).toString('base64');
  let r=await tokenReq({grant_type:'client_credentials'},{Authorization:basic});assert.equal(r.status,200);const t1=(await r.json());assert.equal(t1.token_type,'Bearer');assert.equal(t1.scope,'system/Patient.read system/Encounter.read');
  const get=async(route,token=t1.access_token)=>{const x=await call('GET','/fhir/r4/'+route,undefined,token?{Authorization:'Bearer '+token}:{});return {status:x.status,type:x.headers.get('Content-Type'),data:await x.json()}};

  // Métadonnées publiques ; lecture et recherche protégées.
  let m=await get('metadata',null);assert.equal(m.status,200);assert.equal(m.data.fhirVersion,'4.0.1');assert.match(m.type,/application\/fhir\+json/);
  assert.equal((await get('Patient',null)).status,401);
  let p=await get('Patient?family=naiss');assert.equal(p.status,200);assert.equal(p.data.resourceType,'Bundle');assert.equal(p.data.total,1);
  const pat=p.data.entry[0].resource;assert.equal(pat.id,fid);assert.equal(pat.gender,'female');assert.equal(pat.birthDate,'1970-02-03');
  assert.deepEqual(pat.name.map(n=>[n.use,n.family]),[['official','NAISSANCE'],['usual','USAGE']]);assert.equal(pat.identifier[0].value,stay);assert.match(pat.meta.profile[0],/fr-core-patient/);
  assert.equal((await get('Patient?family=autre')).data.total,0);
  assert.equal((await get('Patient?identifier=urn:iaselo:sejour|'+encodeURIComponent(stay))).data.total,1);
  assert.equal((await get('Patient/'+fid)).data.id,fid);assert.equal((await get('Patient/inconnu')).status,404);
  assert.equal((await get('Patient?nom=x')).status,400);
  const enc=(await get('Encounter?patient=Patient/'+fid)).data.entry[0].resource;assert.equal(enc.status,'planned');assert.equal(enc.class.code,'IMP');assert.equal(enc.period.start,'2026-12-10');
  assert.equal((await get('Encounter?date=ge2026-12-01')).data.total,1);assert.equal((await get('Encounter?date=lt2026-12-01')).data.total,0);
  assert.equal((await get('Procedure?patient='+fid)).status,403,'portée absente');

  // Second client, toutes ressources, sans webhook.
  const c2=(await api('POST','/fhir',{action:'creer',nom:'Entrepôt de données',portees:['system/*.read']})).data;
  const t2=(await (await tokenReq({grant_type:'client_credentials',client_id:c2.client.id,client_secret:c2.client_secret})).json()).access_token;
  assert.equal((await get('MedicationStatement',t2)).status,400,'patient obligatoire');
  const meds=(await get('MedicationStatement?patient='+fid,t2)).data.entry.map(e=>e.resource);
  assert.deepEqual(meds.map(x=>x.status),['active','entered-in-error']);assert.equal(meds[0].medicationCodeableConcept.coding[0].code,'61234567');assert.equal(meds[0].dosage[0].text,'5 mg · 1 le matin');
  assert.equal((await get('MedicationStatement/'+meds[0].id,t2)).status,200);
  const all=(await get('AllergyIntolerance?patient='+fid,t2)).data.entry[0].resource;assert.equal(all.code.text,'Pénicilline (urticaire)');assert.equal(all.verificationStatus.coding[0].code,'confirmed');
  const proc=(await get('Procedure?patient='+fid,t2)).data.entry[0].resource;assert.equal(proc.code.text,'Prothèse totale de genou');assert.equal(proc.status,'preparation');assert.equal(proc.performer[0].actor.display,'Dr Exemple');

  // Webhook : une modification du séjour prévient le client abonné, sans donnée de santé, avec signature vérifiable.
  recus.length=0;
  await api('PUT','/document',edit('stay/'+stay+'/consult',{...consult,allergies:'Aucune allergie connue'},1));
  for(let i=0;i<50&&!recus.length;i++)await new Promise(x=>setTimeout(x,50));
  assert.equal(recus.length,1);const w=recus[0],corps=JSON.parse(w.body);
  assert.equal(w.headers['x-iaselo-signature'],'sha256='+createHmac('sha256',c1.data.webhook_secret).update(w.headers['x-iaselo-timestamp']+'.'+w.body).digest('hex'));
  assert.deepEqual(corps.evenements.map(e=>e.ressource),['Encounter/'+fid],'seules les ressources autorisées');
  assert.doesNotMatch(w.body,/NAISSANCE|USAGE|Pénicilline|allerg|genou|1970/i);
  assert.equal((await get('AllergyIntolerance?patient='+fid,t2)).data.entry[0].resource.verificationStatus.coding[0].code,'refuted');
  const test=await api('POST','/fhir',{action:'tester',id:c1.data.client.id});assert.equal(test.data.ok,true);

  // Révocation : jetons et nouveaux jetons refusés.
  assert.equal((await api('POST','/fhir',{action:'revoquer',id:c1.data.client.id})).status,200);
  assert.equal((await get('Patient')).status,401);
  assert.equal((await tokenReq({grant_type:'client_credentials'},{Authorization:basic})).status,401);
  assert.equal((await api('POST','/fhir',{action:'revoquer',id:c1.data.client.id})).status,409);

  // Un non-administrateur n'accède pas à l'administration.
  const at=new Date().toISOString(),password='Mot de passe de test 2026',id=await createAccount(pool,{email:'chir@example.test',name:'Chir',passwordHash:await hashPassword(password)});
  await pool.query("UPDATE professional_profiles SET profession='chirurgien',display_name='Chir',updated_at=$2 WHERE user_id=$1",[id,at]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
  await pool.query('UPDATE auth_users SET must_change_password=0 WHERE id=$1',[id]);
  assert.equal((await api('GET','/fhir',undefined,await login('chir@example.test',password))).status,403);

  const actions=new Set((await pool.query("SELECT action FROM professional_access_log WHERE actor LIKE 'fhir:%'")).rows.map(x=>x.action));
  for(const a of ['fhir-token','fhir-read','fhir-search','fhir-webhook'])assert.ok(actions.has(a),a);
 }finally{hook.close();await pool.end()}
});

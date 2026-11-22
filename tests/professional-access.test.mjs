import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {workspaceApi} from '../worker/workspace.mjs';import {sqliteBinding} from '../worker/sqlite-adapter.mjs';
const origin='https://prototype.test',now='2020-01-01T00:00:00.000Z';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parcours-acl-')),DB=sqliteBinding(path.join(dir,'db.sqlite'));for(const file of ['0000_workspace.sql','0001_atomic_commits.sql','0002_professional_access.sql','0003_questionnaire_invitations.sql'])DB.raw.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 for(const [id,job,team]of [['owner','anesthesiste','A'],['nurse','infirmier','A'],['surgeon','chirurgien','A'],['secretary','secretariat','A'],['other','anesthesiste','B']]){DB.raw.prepare('INSERT INTO workspace_members VALUES(?,?,?)').run(id,id==='owner'?'owner':'reader',now);DB.raw.prepare('INSERT INTO professional_profiles(user_id,display_name,profession,updated_at,updated_by) VALUES(?,?,?,?,?)').run(id,id,job,now,'owner');DB.raw.prepare('INSERT OR IGNORE INTO care_teams(id,label) VALUES(?,?)').run(team,'Équipe '+team);DB.raw.prepare('INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES(?,?,?)').run(id,team,now)}
 const put=(key,data)=>DB.raw.prepare('INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?,?)'.replace('1,?,?,?,?,?','1,?,?,?,?')).run(key,JSON.stringify(data),'owner',now,crypto.randomUUID(),'Initialisation test');
 for(const id of ['A','B']){DB.raw.prepare('INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES(?,?,?)').run(id,id,now);put('stay/'+id+'/core',{id,specialty:'Test',mode:'Hospitalisation',stage:'SSPI',identity:{lastName:'Patient '+id},task:'Information clinique '+id});put('stay/'+id+'/consult',{plan:'SECRET-'+id});put('stay/'+id+'/rx',[{name:'Exemple',validated:true,category:'Médicament',instructions:'Consigne médicale',executions:[]}]);put('stay/'+id+'/postopVitals',[]);put('stay/'+id+'/perop',{context:{technique:'AG'},records:[]});put('stay/'+id+'/events',[])}
 put('management/reservations',[{id:'R-A',patient:'A',resource:'S1'},{id:'R-B',patient:'B',resource:'S2'}]);put('identities/records',[['A',{history:[]}],['B',{history:[]}]]);put('identities/reviews',[['A|B',{reason:'SECRET-DOUBLON-B'}]]);
 const bucket=new Map(),BUCKET={async put(key,bytes,metadata){bucket.set(key,{body:bytes,...metadata})},async get(key){return bucket.get(key)||null}};
 async function call(user,method,route,data,extra={}){const response=await workspaceApi(new Request(origin+'/api/workspace'+route,{method,headers:{'oai-authenticated-user-id':user,Origin:origin,'Content-Type':'application/json',...extra},...(data===undefined?{}:{body:JSON.stringify(data)})}),{DB,BUCKET,ENABLE_DEMO_SEED:true});const type=response.headers.get('Content-Type')||'';return {status:response.status,data:type.includes('application/json')?await response.json():await response.text()};}
 return {DB,BUCKET,put,call,close(){DB.close();fs.rmSync(dir,{recursive:true,force:true})}};
}
const change=(key,data,revision=1)=>({key,data,revision,operation:crypto.randomUUID(),reason:'Test de modification'});
test('le métier et l’équipe filtrent les données, versions, rapprochements et réponses de conflit',async()=>{const f=fixture();try{const r=await f.call('nurse','GET','');assert.equal(r.status,200);assert.ok(r.data.documents.some(d=>d.key==='stay/A/consult'));assert.ok(!JSON.stringify(r.data).includes('SECRET-B'));assert.ok(!r.data.documents.some(d=>d.key.startsWith('stay/B/')));assert.deepEqual(r.data.documents.find(d=>d.key==='management/reservations').data.map(x=>x.patient),['A']);assert.deepEqual(r.data.documents.find(d=>d.key==='identities/reviews').data,[]);assert.equal((await f.call('nurse','GET','/version?key=stay/B/consult&revision=1')).status,403);assert.equal((await f.call('nurse','GET','/history?key=stay/B/consult')).status,403)}finally{f.close()}});
test('un infirmier ajoute des constantes et réalisations sans pouvoir modifier la prescription',async()=>{const f=fixture();try{assert.equal((await f.call('nurse','PUT','/document',change('stay/A/consult',{plan:'altéré'}),{'x-role':'owner'})).status,403);const rx=[{name:'Exemple',validated:true,category:'Médicament',instructions:'Consigne médicale',executions:[{at:'2026-11-19T10:00',author:'Soignant fictif',status:'Réalisée',dose:'test',route:'IV'}]}];assert.equal((await f.call('nurse','PUT','/document',change('stay/A/rx',rx))).status,200);rx[0].instructions='Nouvelle prescription';assert.equal((await f.call('nurse','PUT','/document',change('stay/A/rx',rx,2))).status,403);assert.equal((await f.call('nurse','PUT','/document',change('stay/A/postopVitals',[{kind:'Surveillance',values:{location:'SSPI',hr:'70'}}]))).status,200);assert.equal((await f.call('nurse','PUT','/document',change('stay/A/perop',{context:{technique:'AG'},records:[{kind:'Médicament'}]}))).status,403)}finally{f.close()}});
test('les chirurgiens ont leur périmètre et le secrétariat ne reçoit pas le dossier clinique',async()=>{const f=fixture();try{assert.equal((await f.call('surgeon','PUT','/document',change('stay/A/consult',{plan:'modification'}))).status,403);assert.equal((await f.call('surgeon','PUT','/document',change('stay/A/surgicalAnnouncement',{draft:{procedure:'Geste fictif'}},0))).status,200);const r=await f.call('secretary','GET','');assert.ok(!r.data.documents.some(d=>d.key==='stay/A/consult'));const core=r.data.documents.find(d=>d.key==='stay/A/core');assert.ok(!('task' in core.data));assert.equal((await f.call('secretary','PUT','/document',change(core.key,{...core.data,task:'Champ clinique'}))).status,403)}finally{f.close()}});
test('une rubrique globale modifiée préserve les données des autres équipes sans les renvoyer',async()=>{const f=fixture();try{const r=await f.call('surgeon','PUT','/document',change('management/reservations',[{id:'R-A',patient:'A',resource:'S3'}]));assert.equal(r.status,200);assert.deepEqual(r.data.document.data.map(x=>x.patient),['A']);const stored=JSON.parse(f.DB.raw.prepare("SELECT data FROM workspace_documents WHERE key='management/reservations'").get().data);assert.equal(stored.find(x=>x.patient==='B').resource,'S2');assert.equal((await f.call('surgeon','PUT','/document',change('management/reservations',[{patient:'B',resource:'S4'}],2))).status,403)}finally{f.close()}});
test('désactivation et expiration d’habilitation prennent effet sans reconnexion et sont tracées',async()=>{const f=fixture();try{const r=await f.call('owner','POST','/access/account',{userId:'nurse',profession:'infirmier',active:false,reason:'Fin de présence test'});assert.equal(r.status,200);assert.equal((await f.call('nurse','GET','')).status,403);f.DB.raw.exec("UPDATE professional_teams SET valid_until='2021-01-01T00:00:00.000Z' WHERE user_id='surgeon'");const data=await f.call('surgeon','GET','');assert.equal(data.data.documents.length,0);assert.equal((await f.call('surgeon','PUT','/document',change('stay/A/notes',[]))).status,403);const logs=await f.call('owner','GET','/access/log?actor=nurse');assert.ok(logs.data.entries.some(e=>e.result==='denied'));assert.throws(()=>f.DB.raw.exec('DELETE FROM professional_access_log'))}finally{f.close()}});
test('un utilisateur non attribué ne peut ni s’habiliter ni lire un dossier ; les vues sont journalisées',async()=>{const f=fixture();try{const fresh=await f.call('new-user','GET','');assert.equal(fresh.data.documents.length,0);assert.equal(fresh.data.access.profile.profession,'unassigned');assert.equal((await f.call('nurse','POST','/access/account',{userId:'nurse',profession:'anesthesiste',active:true,reason:'Auto attribution interdite'})).status,403);assert.equal((await f.call('nurse','POST','/access/view',{key:'stay/A/rx',section:'Prescriptions'})).status,200);assert.equal((await f.call('nurse','POST','/access/view',{key:'stay/B/rx',section:'Prescriptions'})).status,403);const logs=await f.call('owner','GET','/access/log?actor=nurse');assert.ok(logs.data.entries.some(e=>e.action==='view'&&e.target==='stay/A/rx'&&e.result==='allowed'))}finally{f.close()}});
test('les pièces jointes exigent un rattachement au bon dossier même avec une empreinte connue',async()=>{const f=fixture();try{const bytes=new TextEncoder().encode('CRO fictif'),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');f.DB.raw.prepare('INSERT INTO file_scopes(hash,document_key) VALUES(?,?)').run(hash,'stay/B/cro');const denied=await f.call('surgeon','GET','/files/'+hash+'?key=stay/B/cro');assert.equal(denied.status,403);const fake=await f.call('surgeon','PUT','/document',change('stay/A/cro',{file:{$file:hash,name:'cro.txt'}},0));assert.equal(fake.status,403);const upload=await workspaceApi(new Request(origin+'/api/workspace/files/'+hash+'?key=stay/A/cro',{method:'PUT',headers:{'oai-authenticated-user-id':'surgeon',Origin:origin,'Content-Type':'text/plain','x-file-name':'cro.txt'},body:bytes}),{DB:f.DB,BUCKET:f.BUCKET,ENABLE_DEMO_SEED:true});assert.equal(upload.status,200);assert.equal((await f.call('surgeon','PUT','/document',change('stay/A/cro',{file:{$file:hash,name:'cro.txt'}},0))).status,200);assert.equal((await f.call('surgeon','GET','/files/'+hash+'?key=stay/A/cro')).status,200)}finally{f.close()}});
test('circuit médicament : conciliation médicale, validation réservée au pharmacien et historique immuable',async()=>{
 const f=fixture();try{
  const entry={kind:'reconciliation',author:'Médecin fictif',note:'Sources confrontées, traitement retenu',at:'2026-11-19T10:00:00Z',status:'À clarifier'};
  assert.equal((await f.call('surgeon','PUT','/document',change('stay/A/medicationCircuit',[entry],0))).status,200);
  const decision={kind:'validation',author:'Pharmacien fictif',note:'Revue documentée',at:'2026-11-19T11:00:00Z',status:'Validée en simulation',rx:0};
  assert.equal((await f.call('owner','PUT','/document',change('stay/A/medicationCircuit',[entry,decision]))).status,403);
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/medicationCircuit',[entry,decision]))).status,403);
  f.DB.raw.prepare('INSERT INTO workspace_members VALUES(?,?,?)').run('pharma','reader',now);
  f.DB.raw.prepare('INSERT INTO professional_profiles(user_id,display_name,profession,updated_at,updated_by) VALUES(?,?,?,?,?)').run('pharma','Pharmacien fictif','pharmacien',now,'owner');
  f.DB.raw.prepare('INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES(?,?,?)').run('pharma','A',now);
  assert.equal((await f.call('pharma','PUT','/document',change('stay/A/medicationCircuit',[entry,decision]))).status,200);
  assert.equal((await f.call('pharma','PUT','/document',change('stay/A/medicationCircuit',[decision],2))).status,403);
  assert.equal((await f.call('pharma','PUT','/document',change('stay/B/medicationCircuit',[decision],0))).status,403);
  assert.equal((await f.call('pharma','PUT','/document',change('stay/A/rx',[]))).status,403);
 }finally{f.close()}
});
test('planning : les ressources sont paramétrées par le propriétaire et les conflits hors équipe sont bloqués sans divulgation',async()=>{
 const f=fixture();try{
  const resources=[{id:'ROOM',kind:'room',label:'Salle fictive'},{id:'STAFF',kind:'staff',label:'Personnel fictif'}];
  f.put('management/planningResources',resources);
  f.put('management/vacations',[{id:'VAC',resource:'ROOM',label:'Vacation fictive',start:'2026-11-20T08:00',end:'2026-11-20T17:00',staffIds:['STAFF']}]);
  assert.equal((await f.call('surgeon','PUT','/document',change('management/planningResources',[]))).status,403);
  const hidden={id:'RES-SECRET-B',patient:'B',planningVersion:1,resource:'ROOM',vacationId:'VAC',start:'2026-11-20T08:00',end:'2026-11-20T09:15',duration:60,turnover:15,staffIds:['STAFF'],equipmentIds:[],state:'Réservée'};
  f.DB.raw.prepare("UPDATE workspace_documents SET data=?,revision=revision+1,operation=? WHERE key='management/reservations'").run(JSON.stringify([hidden]),crypto.randomUUID());
  const candidate={...hidden,id:'RES-A',patient:'A'};
  const denied=await f.call('surgeon','PUT','/document',change('management/reservations',[candidate],2));assert.equal(denied.status,403);assert.match(denied.data.error,/Conflit de planning/);assert.ok(!JSON.stringify(denied.data).includes('SECRET-B'));
  const good={...candidate,start:'2026-11-20T10:00',end:'2026-11-20T11:15'};
  assert.equal((await f.call('surgeon','PUT','/document',change('management/reservations',[good],2))).status,200);
  const stored=JSON.parse(f.DB.raw.prepare("SELECT data FROM workspace_documents WHERE key='management/reservations'").get().data);assert.equal(stored.length,2);
  const data=await f.call('nurse','GET','');assert.ok(data.data.access.planningOccupancy.some(x=>x.resource==='ROOM'));assert.ok(data.data.access.planningOccupancy.every(x=>!('patient' in x)&&!('id' in x)));assert.equal(data.data.documents.find(d=>d.key==='management/planningResources').data.length,2);assert.equal(data.data.documents.find(d=>d.key==='management/vacations').data.length,1);assert.equal(data.data.documents.find(d=>d.key==='management/reservations').data.length,1);
  assert.equal((await f.call('owner','PUT','/document',change('management/planningResources',resources.map(r=>({...r,open:false}))))).status,403);
 }finally{f.close()}
});
test('dossier infirmier : équipe du séjour, auteur connecté, responsable actif et journal immuable',async()=>{
 const f=fixture();try{
  const team=await f.call('nurse','GET','/access/care-team?stay=A');assert.equal(team.status,200);assert.deepEqual(team.data.people.map(p=>p.user_id).sort(),['nurse','owner','surgeon']);assert.ok(team.data.people.every(p=>!('email' in p)));
  assert.equal((await f.call('nurse','GET','/access/care-team?stay=B')).status,403);
  const e={id:'N-PLAN',kind:'plan',title:'Plan fictif',objective:'Objectif fictif',occurredAt:'2026-11-19T10:00',recordedAt:'2026-11-19T09:00:00Z',authorId:'nurse',authorLabel:'nurse',ownerId:'owner',ownerLabel:'owner'};
  const task={...e,id:'N-TASK',kind:'task',planId:e.id,title:'Soin fictif',due:'2026-11-19T11:00'};
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[e,task],0))).status,200);
  const update={...e,id:'N-DONE',kind:'task-update',taskId:task.id,status:'Réalisée',ownerId:'nurse',ownerLabel:'nurse',note:'Résultat fictif'};
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[e,task,update]))).status,200);
  const read=await f.call('nurse','GET','');assert.equal(read.data.documents.find(d=>d.key==='stay/A/nursingRecord').data.length,3);
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[e,{...task,title:'Altéré'},update],2))).status,403);
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[e,task,update,{...update,id:'N-FAKE',authorId:'owner',authorLabel:'owner'}],2))).status,403);
  assert.equal((await f.call('nurse','PUT','/document',change('stay/B/nursingRecord',[e],0))).status,403);
  f.DB.raw.prepare('UPDATE professional_profiles SET active=0 WHERE user_id=?').run('owner');
  const badOwner={...update,id:'N-STALE',ownerId:'owner',ownerLabel:'owner'};
  const refused=await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[e,task,update,badOwner],2));assert.equal(refused.status,403);assert.match(refused.data.error,/responsable actif/);
 }finally{f.close()}
});
test('dossier infirmier : anomalie et alerte liée sont enregistrées dans le même lot',async()=>{
 const f=fixture();try{
  const common={occurredAt:'2026-11-19T10:00',recordedAt:'2026-11-19T09:00:00Z',authorId:'nurse',authorLabel:'nurse',ownerId:'nurse',ownerLabel:'nurse'};
  const device={...common,id:'D1',kind:'device',deviceType:'Dispositif fictif',site:'Site fictif',placementUnknown:true,placedAt:'',nextDue:'2026-11-19T12:00'};
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[device],0))).status,200);
  const check={...common,id:'C1',kind:'device-check',deviceId:'D1',status:'Anomalie constatée',findings:'Constat fictif',nextDue:'2026-11-19T13:00'};
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[device,check]))).status,403);
  const alert={...common,id:'AL1',kind:'alert',sourceId:'C1',title:'Alerte fictive',note:'Action attendue',level:'À traiter'};
  assert.equal((await f.call('nurse','POST','/commit',{documents:[change('stay/A/nursingRecord',[device,check,alert])]})).status,200);
  const logs=await f.call('owner','GET','/access/log?actor=nurse');assert.ok(logs.data.entries.some(e=>e.action==='nursing-write'&&e.result==='denied'));
 }finally{f.close()}
});
test('transmission libre infirmière : texte, auteur, responsable et horaires persistent entre deux lectures',async()=>{
 const f=fixture();try{
  const note={id:'TRANSMISSION-LIBRE',kind:'transmission',format:'Libre',context:'Relève',target:'Transmission libre',observations:'Texte libre fictif de relève,\navec une seconde ligne.',actions:'',results:'',occurredAt:'2026-11-19T10:00',recordedAt:'2026-11-19T09:02:00Z',authorId:'nurse',authorLabel:'nurse',ownerId:'nurse',ownerLabel:'nurse'};
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/nursingRecord',[note],0))).status,200);
  const data=await f.call('surgeon','GET','');const saved=data.data.documents.find(d=>d.key==='stay/A/nursingRecord').data[0];assert.deepEqual(saved,note);
  assert.ok(!(await f.call('other','GET','')).data.documents.some(d=>d.key==='stay/A/nursingRecord'));
 }finally{f.close()}
});
test('invitation questionnaire : coordonnées confirmées, périmètre, usage unique et retour au bon séjour',async()=>{
 const f=fixture();try{
  const contact={firstName:'Camille',lastName:'MARTIN',birthDate:'1985-06-14',email:'camille@example.test',phone:'+33612345678'},doc={contact,confirmed:true,verifiedBy:'owner',verifiedAt:new Date().toISOString(),source:'Photo Doctolib relue'};
  assert.equal((await f.call('owner','PUT','/document',change('stay/A/invitationContact',doc,0))).status,200);
  assert.equal((await f.call('nurse','PUT','/document',change('stay/A/invitationContact',{...doc,verifiedBy:'nurse'}))).status,403);
  assert.equal((await f.call('other','POST','/questionnaire/invite',{stay:'A',contact,confirmed:true})).status,403);
  assert.equal((await f.call('owner','POST','/questionnaire/invite',{stay:'A',contact:{...contact,email:'wrong@example.test'},confirmed:true})).status,409);
  const invite=await f.call('owner','POST','/questionnaire/invite',{stay:'A',contact,confirmed:true});assert.equal(invite.status,201);assert.equal(invite.data.delivery,'not-sent');
  const token=new URLSearchParams(new URL(invite.data.link).hash.slice(1)).get('invitation');assert.match(token,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(f.DB.raw.prepare('SELECT * FROM questionnaire_invitations').all()).includes(token));
  async function submit(answers){const r=await workspaceApi(new Request(origin+'/api/questionnaire/submit',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token,answers,confirmed:true})}),{DB:f.DB,BUCKET:f.BUCKET,ENABLE_DEMO_SEED:true});return {status:r.status,data:await r.json()}}
  const answers={birthname:'MARTIN',firstname:'Camille',dob:'1985-06-14',signature:'Camille Martin',signedDate:'2026-11-19',allergy:'Non'};
  assert.equal((await submit({...answers,$file:'bad'})).status,400);
  assert.equal((await submit({...answers,firstname:'Autre personne'})).status,400);
  assert.equal((await submit(answers)).status,201);assert.equal((await submit(answers)).status,410);
  const read=await f.call('surgeon','GET','');assert.equal(read.data.documents.find(d=>d.key==='stay/A/questionnaire').data.answers.firstname,'Camille');assert.ok(!read.data.documents.some(d=>d.key==='stay/B/questionnaire'));
 }finally{f.close()}
});
test('une invitation remplacée ou expirée est refusée, sans divulguer le dossier',async()=>{
 const f=fixture();try{
  const contact={firstName:'A',lastName:'B',birthDate:'1985-06-14',email:'a@example.test',phone:''};f.put('stay/A/invitationContact',{contact});
  const first=await f.call('owner','POST','/questionnaire/invite',{stay:'A',contact,confirmed:true}),second=await f.call('owner','POST','/questionnaire/invite',{stay:'A',contact,confirmed:true});
  const token=link=>new URLSearchParams(new URL(link).hash.slice(1)).get('invitation');
  const resolve=async value=>workspaceApi(new Request(origin+'/api/questionnaire/resolve',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:value})}),{DB:f.DB,BUCKET:f.BUCKET,ENABLE_DEMO_SEED:true});
  assert.equal((await resolve(token(first.data.link))).status,410);const ok=await resolve(token(second.data.link));assert.equal(ok.status,200);assert.ok(!JSON.stringify(await ok.json()).includes('stay/A'));
  f.DB.raw.exec("UPDATE questionnaire_invitations SET expires_at='2000-01-01T00:00:00Z'");assert.equal((await resolve(token(second.data.link))).status,410);
 }finally{f.close()}
});

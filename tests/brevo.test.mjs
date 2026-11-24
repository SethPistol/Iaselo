import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {workspaceApi} from '../worker/workspace.mjs';import {sqliteBinding} from '../worker/sqlite-adapter.mjs';import {brevoMessaging,normalizeRecipient,brevoError} from '../server/brevo.mjs';import {invitationMessages} from '../worker/questionnaire.mjs';
const origin='https://prototype.test',now='2020-01-01T00:00:00.000Z';
function fake(){const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,headers:init.headers,body:JSON.parse(init.body)});return new Response(JSON.stringify({messageId:'m-'+calls.length}),{status:201})}}}
test('Brevo : clé lue dans l’environnement, bons points d’accès, SMS transactionnel sans +',async()=>{
 const f=fake(),m=brevoMessaging({BREVO_API_KEY:'cle-test',BREVO_SENDER_EMAIL:'no-reply@clinique.test',BREVO_SMS_SENDER:'Trocadéro!',ETABLISSEMENT_NOM:'Clinique X'},f.fetch);
 assert.deepEqual(m.channels,{email:true,sms:true});
 await m.sms({to:'+33612345678',content:'Bonjour'});await m.email({to:'a@b.test',subject:'S',text:'T',html:'<p>T</p>'});
 assert.equal(f.calls[0].url,'https://api.brevo.com/v3/transactionalSMS/send');assert.equal(f.calls[0].headers['api-key'],'cle-test');
 assert.deepEqual({...f.calls[0].body,tag:undefined},{sender:'Trocadro',recipient:'33612345678',content:'Bonjour',type:'transactional',tag:undefined});
 assert.equal(f.calls[1].url,'https://api.brevo.com/v3/smtp/email');assert.equal(f.calls[1].body.sender.email,'no-reply@clinique.test');
 assert.deepEqual(brevoMessaging({},f.fetch).channels,{email:false,sms:false});
});
test('Brevo : une seule variable (la clé) ; expéditeur e-mail trouvé dans Brevo ; recette marquée [TEST]',async()=>{
 const calls=[],fetch=async(url,init)=>{calls.push({url,method:init.method,body:init.body&&JSON.parse(init.body)});if(url.endsWith('/senders'))return new Response(JSON.stringify({senders:[{email:'inactif@c.test',active:false},{email:'valide@c.test',active:true}]}),{status:200});if(url.endsWith('/account'))return new Response(JSON.stringify({plan:[{type:'payAsYouGo',credits:300},{type:'sms',credits:42}]}),{status:200});return new Response('{"messageId":"1"}',{status:201})};
 const m=brevoMessaging({BREVO_API_KEY:'k',IASELO_RECETTE:'true'},fetch);
 assert.deepEqual(m.channels,{email:true,sms:true});
 await m.email({to:'patient@exemple.test',subject:'Sujet',text:'t',html:'h'});await m.sms({to:'+33600000042',content:'Bonjour'});
 const mail=calls.find(c=>c.url.endsWith('/smtp/email')).body,sms=calls.find(c=>c.url.endsWith('/transactionalSMS/send')).body;
 assert.equal(mail.sender.email,'valide@c.test');assert.equal(mail.subject,'[TEST] Sujet');assert.equal(sms.content,'[TEST] Bonjour');assert.equal(sms.sender,'TROCADERO');
 const st=await m.status();assert.equal(st.ready,true);assert.equal(st.sms.credits,42);assert.equal(st.email.from,'valide@c.test');assert.ok(!JSON.stringify(st).includes('"k"'));
 assert.equal((await brevoMessaging({}).status()).ready,false);
 const noSender=brevoMessaging({BREVO_API_KEY:'k'},async url=>new Response(JSON.stringify(url.endsWith('/senders')?{senders:[]}:{plan:[]}),{status:200}));
 const s2=await noSender.status();assert.equal(s2.ready,false);assert.match(s2.email.error,/Expéditeurs/);assert.match(s2.sms.error,/crédit/);
});
test('Brevo : erreurs traduites en consignes (IP bloquée, crédits, expéditeur)',()=>{
 assert.match(brevoError(401,{message:'We have detected you are using an unrecognised IP address 1.2.3.4'}),/adresses IP/);
 assert.match(brevoError(400,{code:'not_enough_credits'}),/crédits/);assert.match(brevoError(400,{message:'sender is invalid'}),/Expéditeur/);
});
test('Brevo : erreur de clé traduite sans divulguer la clé',async()=>{
 const m=brevoMessaging({BREVO_API_KEY:'secret-cle',BREVO_SMS_SENDER:'IASELO'},async()=>new Response(JSON.stringify({code:'unauthorized'}),{status:401}));
 await assert.rejects(m.sms({to:'+33600000001',content:'x'}),e=>/BREVO_API_KEY/.test(e.message)&&!e.message.includes('secret-cle'));
});
test('message patient minimal : ni nom, ni motif, seulement le lien',()=>{
 const t=invitationMessages('Clinique X','https://x.test/patient.html#invitation=abc');
 for(const v of Object.values(t))assert.ok(!/anesth|opération|chirurg/i.test(v));assert.ok(t.sms.includes('https://x.test/patient.html#invitation=abc'));
});
function fixture(messaging){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brevo-')),DB=sqliteBinding(path.join(dir,'db.sqlite'));for(const file of ['0000_workspace.sql','0001_atomic_commits.sql','0002_professional_access.sql','0003_questionnaire_invitations.sql','0004_workspace_items.sql'])DB.raw.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 for(const [id,job,team]of [['owner','anesthesiste','A'],['other','anesthesiste','B']]){DB.raw.prepare('INSERT INTO workspace_members VALUES(?,?,?)').run(id,id==='owner'?'owner':'reader',now);DB.raw.prepare('INSERT INTO professional_profiles(user_id,display_name,profession,updated_at,updated_by) VALUES(?,?,?,?,?)').run(id,id,job,now,'owner');DB.raw.prepare('INSERT OR IGNORE INTO care_teams(id,label) VALUES(?,?)').run(team,'Équipe '+team);DB.raw.prepare('INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES(?,?,?)').run(id,team,now)}
 for(const id of ['A','B']){DB.raw.prepare('INSERT INTO stay_teams(stay_id,team_id,valid_from) VALUES(?,?,?)').run(id,id,now);DB.raw.prepare('INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').run('stay/'+id+'/core',JSON.stringify({id}),'owner',now,crypto.randomUUID(),'test')}
 async function call(user,route,data){const r=await workspaceApi(new Request(origin+'/api/workspace'+route,{method:'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)}),{DB,ENABLE_DEMO_SEED:true,MESSAGING:messaging});return {status:r.status,data:await r.json()}}
 return {DB,call,close(){DB.close();fs.rmSync(dir,{recursive:true,force:true})}};
}
test('envoi du lien : destinataire vérifié côté serveur, lien actif requis, périmètre et traçabilité',async()=>{
 const f0=fake(),messaging=brevoMessaging({BREVO_API_KEY:'k',BREVO_SENDER_EMAIL:'no-reply@c.test',BREVO_SMS_SENDER:'IASELO'},f0.fetch),f=fixture(messaging);try{
  const contact={firstName:'Camille',lastName:'MARTIN',birthDate:'1985-06-14',email:'camille@example.test',phone:'+33612345678'};
  f.DB.raw.prepare('INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?)').run('stay/A/invitationContact',JSON.stringify({contact,confirmed:true}),'owner',now,crypto.randomUUID(),'test');
  const invite=await f.call('owner','/questionnaire/invite',{stay:'A',contact,confirmed:true});assert.equal(invite.status,201);assert.deepEqual(invite.data.messaging,{email:true,sms:true});
  const token=new URLSearchParams(new URL(invite.data.link).hash.slice(1)).get('invitation');
  assert.equal((await f.call('other','/questionnaire/send',{stay:'A',token,channels:['sms']})).status,403);
  assert.equal((await f.call('owner','/questionnaire/send',{stay:'A',token:'0'.repeat(64),channels:['sms']})).status,410);
  assert.equal((await f.call('owner','/questionnaire/send',{stay:'A',token,channels:['fax']})).status,400);
  const sent=await f.call('owner','/questionnaire/send',{stay:'A',token,channels:['sms','email'],to:'pirate@evil.test'});
  assert.equal(sent.status,200);assert.ok(sent.data.results.every(r=>r.sent));
  assert.equal(f0.calls[0].body.recipient,'33612345678');assert.equal(f0.calls[1].body.to[0].email,'camille@example.test');assert.ok(f0.calls[0].body.content.includes(token));
  const auto=await f.call('owner','/questionnaire/send',{stay:'A',token});assert.deepEqual(auto.data.results.map(r=>r.channel),['sms','email']);
  const logs=f.DB.raw.prepare("SELECT * FROM professional_access_log WHERE action='questionnaire-envoi'").all();assert.equal(logs.length,4);
  assert.ok(!JSON.stringify(logs).includes('612345678')&&!JSON.stringify(logs).includes('camille@'),'coordonnées masquées dans le journal');assert.ok(!JSON.stringify(logs).includes(token));
 }finally{f.close()}
});
test('envoi refusé proprement si Brevo n’est pas configuré',async()=>{const f=fixture(undefined);try{assert.equal((await f.call('owner','/questionnaire/send',{stay:'A',token:'0'.repeat(64),channels:['sms']})).status,503)}finally{f.close()}});
test('ancienne liste MESSAGING_ALLOWED_RECIPIENTS ignorée ; e-mails avec points, 06/0033/+33, espaces, guillemets et points-virgules',async()=>{
 const f=fake(),m=brevoMessaging({BREVO_API_KEY:'k',BREVO_SENDER_EMAIL:'a@b.test',BREVO_SMS_SENDER:'IASELO',IASELO_RECETTE:'true',MESSAGING_ALLOWED_RECIPIENTS:' "06 00 00 00 42" ; Prenom.Nom@Example.COM '},f.fetch);
 await m.sms({to:'+33600000042',content:'x'});await m.email({to:'prenom.nom@example.com',subject:'s',text:'t',html:'h'});assert.equal(f.calls.length,2);
 for(const v of ['0600000042','0033 6 00 00 00 42','+33 (0)6 00 00 00 42','33600000042','+33.6.00.00.00.42'])assert.equal(normalizeRecipient(v),'+33600000042',v);
 await m.email({to:'nouveau.patient@example.com',subject:'s',text:'t',html:'h'});assert.equal(f.calls.length,3);assert.match(f.calls[2].body.subject,/^\[TEST\] /);
});
import {smsRecipientError,deliveryState} from '../server/brevo.mjs';
test('SMS : mobiles uniquement, numéros normalisés avant envoi',async()=>{
 assert.equal(smsRecipientError('06 00 00 00 42'),'');assert.equal(smsRecipientError('+44 7700 900123'),'');
 assert.match(smsRecipientError('01 45 00 00 00'),/pas un mobile/);assert.match(smsRecipientError('12'),/invalide/);
 const f=fake(),m=brevoMessaging({BREVO_API_KEY:'k'},f.fetch);await m.sms({to:'06.00.00.00.42',content:'x'});assert.equal(f.calls[0].body.recipient,'33600000042');
 await assert.rejects(m.sms({to:'+33145000000',content:'x'}),/pas un mobile/);assert.equal(f.calls.length,1);
});
test('Brevo : un nouvel essai si saturé, pas de doublon après délai dépassé',async()=>{
 let n=0;const m=brevoMessaging({BREVO_API_KEY:'k'},async()=>++n===1?new Response('{}',{status:503}):new Response('{"messageId":7}',{status:201}));
 assert.equal(await m.sms({to:'+33600000042',content:'x'}),'7');assert.equal(n,2);
 let k=0;const m2=brevoMessaging({BREVO_API_KEY:'k'},async()=>{k++;return new Response('{"code":"invalid_parameter","message":"bad"}',{status:400})});
 await assert.rejects(m2.sms({to:'+33600000042',content:'x'}));assert.equal(k,1);
});
test('statut de délivrance : livré, échec expliqué, en attente',async()=>{
 assert.equal(deliveryState('sms',[{event:'sent'},{event:'delivered'}]).state,'delivered');
 const bad=deliveryState('sms',[{event:'sent'},{event:'hardBounces',reason:'Unknown subscriber'}]);assert.equal(bad.state,'failed');assert.match(bad.reason,/inexistant/);
 assert.equal(deliveryState('email',[{event:'requests'}]).state,'pending');
 const calls=[],m=brevoMessaging({BREVO_API_KEY:'k'},async url=>{calls.push(url);return new Response(JSON.stringify({events:[{messageId:'99',event:'delivered'},{messageId:'12',event:'hardBounces'}]}),{status:200})});
 assert.equal((await m.delivery({channel:'sms',ref:'99',to:'06 00 00 00 42'})).state,'delivered');assert.match(calls[0],/phoneNumber=33600000042/);
 assert.equal((await m.delivery({channel:'sms',ref:'12',to:'+33600000042'})).state,'failed');
});

test('clé restreinte sans portée Compte : consigne claire, SMS non bloqué',async()=>{
 const {brevoMessaging,SCOPE_MESSAGE}=await import('../server/brevo.mjs');
 const m=brevoMessaging({BREVO_API_KEY:'k'},async url=>url.endsWith('/account')||url.endsWith('/senders')?new Response('{"code":"permission_denied","message":"Key not authorized"}',{status:403}):new Response('{"messageId":"1"}',{status:201}));
 const st=await m.status();
 assert.equal(st.warning,SCOPE_MESSAGE);assert.equal(st.sms.ok,true);assert.equal(st.sms.credits,null);
 assert.equal(st.email.ok,false);assert.match(st.email.error,/Compte/);assert.ok(!/activé/.test(JSON.stringify(st)));
 assert.equal(await m.sms({to:'0612345678',content:'x'}),'1');
});

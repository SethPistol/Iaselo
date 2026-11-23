import {test} from 'node:test';import assert from 'node:assert/strict';import net from 'node:net';import {generateKeyPairSync,createSign} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {connectorMode,connectorConfig} from '../../server/interop/modes.mjs';
import {createPsc,verifyJwt,rppsFrom} from '../../server/interop/psc.mjs';
import {buildInsiRequest,parseInsiResponse,createInsi,insiConfig} from '../../server/interop/insi.mjs';
import {createDmp,checkDmpPreconditions,buildDmpSubmission,dmpConfig} from '../../server/interop/dmp.mjs';
import {smtpSend,createMssante,patientAddress,isMssanteAddress} from '../../server/interop/mssante.mjs';
import {interopStatus} from '../../server/interop/index.mjs';
import {migrate} from '../../server/database.mjs';import {bootstrap,createAccount,hashPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}

test('modes : simulation par défaut, production interdite en recette et sans autorisation déclarée',()=>{
 assert.equal(connectorMode('insi',{}),'simulation');
 assert.throws(()=>connectorMode('insi',{INTEROP_INSI_MODE:'production',IASELO_RECETTE:'true'}),/interdit sur le serveur de recette/);
 assert.throws(()=>connectorMode('dmp',{INTEROP_DMP_MODE:'reel'}),/simulation, test ou production/);
 const c=connectorConfig('psc',['PSC_CLIENT_ID'],{INTEROP_PSC_MODE:'production',PSC_CLIENT_ID:'x'});assert.deepEqual(c.missing,['INTEROP_PSC_AUTORISATION']);assert.equal(c.ready,false);
 const st=interopStatus({});assert.deepEqual(st.map(s=>s.id),['insi','psc','dmp','mssante']);assert.ok(st.every(s=>s.mode==='simulation'));
 const t=interopStatus({INTEROP_MSSANTE_MODE:'test'}).find(s=>s.id==='mssante');assert.match(t.etat,/incomplète/);assert.ok(t.missing.includes('MSSANTE_ALLOWED_RECIPIENTS'));
 // Jamais d'« homologué » affiché : seulement la référence déclarée, à vérifier.
 assert.doesNotMatch(JSON.stringify(interopStatus({})),/homologu[ée]/i);
});

// Fournisseur PSC factice : découverte, JWKS, jeton et userinfo signés.
function fakePsc({rpps='10101010101',nonceOverride}={}){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'k1',use:'sig',alg:'RS256'};
 const issuer='https://auth.bas.psc.example/realms/esante-wallet',seen={};
 const jwt=claims=>{const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'k1'})).toString('base64url'),p=Buffer.from(JSON.stringify(claims)).toString('base64url'),s=createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey).toString('base64url');return h+'.'+p+'.'+s};
 const res=(body,type='application/json')=>new Response(typeof body==='string'?body:JSON.stringify(body),{headers:{'content-type':type}});
 const fetchImpl=async(url,init={})=>{url=String(url);
  if(url.endsWith('wallet-openid-configuration'))return res({issuer,authorization_endpoint:'https://wallet.bas.psc.example/auth',token_endpoint:issuer+'/token',userinfo_endpoint:issuer+'/userinfo',jwks_uri:issuer+'/certs',end_session_endpoint:issuer+'/logout'});
  if(url.endsWith('/certs'))return res({keys:[jwk]});
  if(url.endsWith('/token')){seen.token=Object.fromEntries(new URLSearchParams(String(init.body)));seen.auth=init.headers.Authorization;const now=Math.floor(Date.now()/1000);return res({access_token:'AT',id_token:jwt({iss:issuer,aud:'client-test',sub:'uuid-1',exp:now+60,iat:now,nonce:nonceOverride||seen.nonce,acr:'eidas1'})})}
  if(url.endsWith('/userinfo'))return res(jwt({iss:issuer,aud:'client-test',sub:'uuid-1',SubjectNameID:'8'+rpps,given_name:'Test',family_name:'FICTIF'}),'application/jwt');
  throw Error('URL inattendue '+url);
 };
 return {fetchImpl,seen,jwt,jwk,issuer};
}
const pscEnv={INTEROP_PSC_MODE:'test',PSC_CLIENT_ID:'client-test',PSC_CLIENT_SECRET:'secret-test',PSC_DISCOVERY_URL:'https://auth.bas.psc.example/realms/esante-wallet/.well-known/wallet-openid-configuration'};

test('Pro Santé Connect : code flow complet, eidas1, PKCE, vérification de signature et du nonce',async()=>{
 const f=fakePsc(),psc=createPsc({env:pscEnv,baseUrl:'https://iaselo.example',secret:'s'.repeat(40),fetchImpl:f.fetchImpl});
 const {location,cookie}=await psc.start(),u=new URL(location);
 assert.equal(u.searchParams.get('acr_values'),'eidas1');assert.equal(u.searchParams.get('scope'),'openid scope_all');assert.equal(u.searchParams.get('redirect_uri'),'https://iaselo.example/auth/psc/callback');assert.ok(u.searchParams.get('code_challenge'));
 f.seen.nonce=u.searchParams.get('nonce');
 const r=await psc.callback(new URLSearchParams({code:'C',state:u.searchParams.get('state')}),cookie);
 assert.equal(r.rpps,'10101010101');assert.ok(f.seen.token.code_verifier);assert.match(f.seen.auth,/^Basic /);assert.ok(!('client_secret' in f.seen.token));
 await assert.rejects(psc.callback(new URLSearchParams({code:'C',state:'autre'}),cookie),/expirée/);
 await assert.rejects(psc.callback(new URLSearchParams({code:'C',state:u.searchParams.get('state')}),cookie.replace(/.$/,c=>c==='A'?'B':'A')),/expirée/);
 const bad=fakePsc({nonceOverride:'rejeu'}),psc2=createPsc({env:pscEnv,baseUrl:'https://iaselo.example',secret:'s'.repeat(40),fetchImpl:bad.fetchImpl});
 const s2=await psc2.start();await assert.rejects(psc2.callback(new URLSearchParams({code:'C',state:new URL(s2.location).searchParams.get('state')}),s2.cookie),/Nonce/);
 assert.throws(()=>verifyJwt(f.jwt({iss:'x'}).replace(/\.[^.]+$/,'.AAAA'),{keys:[f.jwk]}),/Signature/);
 assert.equal(rppsFrom({SubjectNameID:'0123456789'}),'');assert.equal(rppsFrom({otherIds:[{origine:'RPPS',identifiant:'10000000001'}]}),'10000000001');
 assert.match(await psc.logoutUrl('IDT'),/id_token_hint=IDT/);
});

test('Pro Santé Connect : connexion d’un compte par son RPPS, refus sans RPPS associé',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{
  await migrate(pool);await bootstrap(pool,env);const cfg=config(env);
  const id=await createAccount(pool,{email:'anesth@example.test',name:'Dr Test FICTIF',passwordHash:await hashPassword('Mot de passe test 2026')});
  await pool.query("UPDATE professional_profiles SET rpps='10101010101' WHERE user_id=$1",[id]);
  const f=fakePsc(),psc=createPsc({env:pscEnv,baseUrl:origin,secret:cfg.sessionSecret,fetchImpl:f.fetchImpl});
  const app=await makeApp({pool,bucket:{},cfg,psc,messaging:{channels:{}}});
  assert.match(await (await app(new Request(origin+'/login'))).text(),/Pro Santé Connect/);
  const start=await app(new Request(origin+'/auth/psc/start'));assert.equal(start.status,303);const loc=new URL(start.headers.get('Location'));f.seen.nonce=loc.searchParams.get('nonce');
  const state=start.headers.get('Set-Cookie').split(';')[0];
  const cb=await app(new Request(origin+'/auth/psc/callback?code=C&state='+loc.searchParams.get('state'),{headers:{Cookie:state}}));assert.equal(cb.status,303,await cb.clone().text());
  const session=cb.headers.get('Set-Cookie').split(';')[0];const me=await app(new Request(origin+'/api/workspace',{headers:{Cookie:session}}));assert.equal(me.status,200);
  const {rows}=await pool.query("SELECT method,id_token FROM auth_sessions WHERE user_id=$1",[id]);assert.equal(rows[0].method,'psc');assert.ok(rows[0].id_token);
  const out=await app(new Request(origin+'/auth/logout',{method:'POST',headers:{Cookie:session,Origin:origin}}));assert.match(out.headers.get('Location'),/logout\?id_token_hint=/);
  // RPPS inconnu : refus explicite, aucun compte créé.
  const g=fakePsc({rpps:'19999999999'}),psc2=createPsc({env:pscEnv,baseUrl:origin,secret:cfg.sessionSecret,fetchImpl:g.fetchImpl}),app2=await makeApp({pool,bucket:{},cfg,psc:psc2,messaging:{channels:{}}});
  const s2=await app2(new Request(origin+'/auth/psc/start')),l2=new URL(s2.headers.get('Location'));g.seen.nonce=l2.searchParams.get('nonce');
  const cb2=await app2(new Request(origin+'/auth/psc/callback?code=C&state='+l2.searchParams.get('state'),{headers:{Cookie:s2.headers.get('Set-Cookie').split(';')[0]}}));assert.equal(cb2.status,403);assert.match(await cb2.text(),/Aucun compte actif/);
  // PSC non configuré : bouton absent, routes fermées.
  const app3=await makeApp({pool,bucket:{},cfg,messaging:{channels:{}}});assert.doesNotMatch(await (await app3(new Request(origin+'/login'))).text(),/psc\/start/);assert.equal((await app3(new Request(origin+'/auth/psc/start'))).status,404);
 }finally{await db.close()}
});

const insiEnv={INTEROP_INSI_MODE:'test',INSI_ENDPOINT:'https://insi.test.example/ws',INSI_LPS_NOM:'IASELO',INSI_LPS_VERSION:'1.0',INSI_IDAM:'IDAM-TEST',INSI_FINESS:'750000000',INSI_CERT_PEM:'-----BEGIN CERTIFICATE-----\\nX\\n-----END CERTIFICATE-----',INSI_KEY_PEM:'-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----'};
const found=(oid='1.2.250.1.213.1.4.10')=>`<S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body><ns2:RESULTAT xmlns:ns2="x"><ns2:CR><ns2:CodeCR>00</ns2:CodeCR><ns2:LibelleCR>OK</ns2:LibelleCR></ns2:CR><ns2:INDIVIDU><ns2:INSACTIF><ns2:IdIndividu><ns2:NumIdentifiant>2800175123456</ns2:NumIdentifiant><ns2:Cle>78</ns2:Cle></ns2:IdIndividu><ns2:OID>${oid}</ns2:OID></ns2:INSACTIF><ns2:TIQ><ns2:NomNaissance>TESTFICTIF</ns2:NomNaissance><ns2:Prenom>ALICE</ns2:Prenom><ns2:ListePrenom>ALICE MARIE</ns2:ListePrenom><ns2:Sexe>F</ns2:Sexe><ns2:DateNaissance>1980-01-01</ns2:DateNaissance><ns2:LieuNaissance>75056</ns2:LieuNaissance></ns2:TIQ></ns2:INDIVIDU></ns2:RESULTAT></S:Body></S:Envelope>`;

test('INSi : requête avec contexte LPS, lecture du résultat, garde-fous test/production',async()=>{
 const cfg=insiConfig(insiEnv);assert.equal(cfg.ready,true,cfg.missing.join());
 const xml=buildInsiRequest({nomNaissance:'TEST<&>',prenom:'ALICE',sexe:'F',dateNaissance:'1980-01-01',lieuNaissance:''},cfg);
 assert.match(xml,/IDAM-TEST/);assert.match(xml,/TEST&lt;&amp;&gt;/);assert.match(xml,/750000000/);
 const r=parseInsiResponse(found());assert.equal(r.outcome,'found');assert.equal(r.ins.matricule,'280017512345678');assert.equal(r.ins.test,true);
 assert.equal(parseInsiResponse('<CR><CodeCR>01</CodeCR></CR>').outcome,'notfound');assert.equal(parseInsiResponse('<CR><CodeCR>02</CodeCR></CR>').outcome,'multiple');
 assert.throws(()=>parseInsiResponse('<soap:Fault><soap:Text>Certificat refusé</soap:Text></soap:Fault>'),/Certificat refusé/);
 const calls=[],insi=createInsi({env:insiEnv,post:async(url,o)=>{calls.push({url,o});return {status:200,text:found()}}});
 const res=await insi.search({birthName:'Testfictif',firstName:'Alice',sex:'F',birthDate:'1980-01-01',birthPlace:'75056'});
 assert.equal(res.comparison.concordant,true);assert.equal(calls[0].url,insiEnv.INSI_ENDPOINT);assert.ok(calls[0].o.certificate.cert);
 const diff=await insi.search({birthName:'Autre',firstName:'Alice',sex:'F',birthDate:'1980-01-01'});assert.deepEqual(diff.comparison.diffs,['birthName']);
 const real=createInsi({env:insiEnv,post:async()=>({status:200,text:found('1.2.250.1.213.1.4.8')})});await assert.rejects(real.search({birthName:'A',firstName:'B',sex:'F',birthDate:'1980-01-01'}),/INS réelle reçue/);
 await assert.rejects(createInsi({env:{}}).search({}),/simulation/);
 await assert.rejects(insi.search({birthName:'A'}),/Traits insuffisants/);
});

test('DMP : préconditions (INS qualifiée, information, RPPS), CDA et refus sans signature VIHF',async()=>{
 assert.equal(checkDmpPreconditions({identity:{status:'Provisoire'},consent:{},author:{}}).length,3);
 assert.match(checkDmpPreconditions({identity:{status:'Qualifiée',ins:{matricule:'1'}},consent:{informed:true,opposition:true},author:{rpps:'10101010101'}})[0],/Opposition/);
 const env={INTEROP_DMP_MODE:'test',DMP_ENDPOINT:'https://dmp.test.example',DMP_LPS_NOM:'IASELO',DMP_LPS_VERSION:'1.0',DMP_NIL:'NIL-1',ETABLISSEMENT_FINESS:'750000000',DMP_CERT_PEM:'A',DMP_KEY_PEM:'B'};
 // DMP_SIGN_* : préfixe DMP_SIGN pour le certificat de cachet.
 env.DMP_SIGN_CERT_PEM='C';env.DMP_SIGN_KEY_PEM='D';const cfg=dmpConfig(env);assert.equal(cfg.ready,true,cfg.missing.join());
 const input={identity:{status:'Qualifiée',ins:{matricule:'280017512345678',oid:'1.2.250.1.213.1.4.10'}},consent:{informed:true},author:{rpps:'10101010101',firstName:'Test',lastName:'FICTIF'},patient:{birthName:'TESTFICTIF',firstName:'ALICE',sex:'F',birthDate:'1980-01-01'},ins:{matricule:'280017512345678',oid:'1.2.250.1.213.1.4.10'},pdfBase64:'JVBERi0x'};
 const sub=buildDmpSubmission({...input,cfg,establishment:{finess:'750000000',name:'Clinique test'}});
 assert.match(sub.cda,/extension="280017512345678"/);assert.match(sub.cda,/extension="810101010101"/);assert.equal(sub.vihf.LPS_Nom,'IASELO');assert.ok(!('LPS_Autorisation' in sub.vihf));
 await assert.rejects(createDmp({env}).send(input),/signature VIHF/);
 let sent;const dmp=createDmp({env,signer:{envelope:async s=>'<env>'+s.metadata.documentEntry.uniqueId+'</env>'},post:async(u,o)=>{sent=o;return {status:200,text:'status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success"'}}});
 const r=await dmp.send(input);assert.ok(r.documentId);assert.ok(sent.certificate);
});

test('MSSanté : adresses de l’espace de confiance, liste de test, dialogue SMTP complet',async()=>{
 assert.equal(isMssanteAddress('dr.test@clinique.mssante.fr'),true);assert.equal(isMssanteAddress('dr@gmail.com'),false);
 assert.equal(patientAddress({matricule:'280017512345678'}),'280017512345678@patient.mssante.fr');assert.throws(()=>patientAddress({}),/INS qualifiée/);
 // Serveur SMTP factice.
 const log=[];const server=net.createServer(s=>{s.write('220 test\r\n');let buf='',data=false;s.on('data',c=>{buf+=c;let i;while((i=buf.indexOf('\r\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+2);if(data){if(l==='.'){data=false;s.write('250 ok\r\n')}else log.push(l);continue}log.push(l);if(l.startsWith('EHLO'))s.write('250-test\r\n250 AUTH PLAIN\r\n');else if(l.startsWith('AUTH'))s.write('235 ok\r\n');else if(l==='DATA'){data=true;s.write('354 go\r\n')}else if(l==='QUIT'){s.write('221 bye\r\n');s.end()}else s.write('250 ok\r\n')}})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 try{
  const env={INTEROP_MSSANTE_MODE:'test',MSSANTE_SMTP_HOST:'127.0.0.1',MSSANTE_SMTP_PORT:'465',MSSANTE_BAL:'sortie@clinique.mssante.fr',MSSANTE_SMTP_USER:'u',MSSANTE_SMTP_PASSWORD:'p',MSSANTE_ALLOWED_RECIPIENTS:'medecin.test@test.mssante.fr'};
  const m=createMssante({env,transport:o=>smtpSend({...o,connect:()=>net.connect(port,'127.0.0.1')})});
  await assert.rejects(m.send({to:['dr@gmail.com'],subject:'s',text:'t'}),/hors espace de confiance/);
  await assert.rejects(m.send({to:['autre@test.mssante.fr'],subject:'s',text:'t'}),/non autorisé/);
  const r=await m.send({to:['medecin.test@test.mssante.fr'],subject:'Lettre de liaison',text:'Bonjour',attachments:[{filename:'l.pdf',contentType:'application/pdf',base64:'JVBERi0x'}]});
  assert.deepEqual(r.to,['medecin.test@test.mssante.fr']);assert.ok(log.includes('MAIL FROM:<sortie@clinique.mssante.fr>'));assert.ok(log.includes('RCPT TO:<medecin.test@test.mssante.fr>'));assert.ok(log.some(l=>l.startsWith('AUTH PLAIN')));assert.ok(log.some(l=>/filename="l.pdf"/.test(l)));
 }finally{server.close()}
});

test('Lettre de liaison : envoi réel MSSanté en mode test via la route, PDF exigé, DMP refusé sans INS qualifiée',async()=>{
 const db=new PGlite(),pool=pgPool(db),origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};
 try{
  await migrate(pool);await bootstrap(pool,env);const sent=[];
  const interopEnv={INTEROP_MSSANTE_MODE:'test',INTEROP_DMP_MODE:'test',MSSANTE_SMTP_HOST:'h',MSSANTE_BAL:'sortie@clinique.mssante.fr',MSSANTE_SMTP_USER:'u',MSSANTE_ALLOWED_RECIPIENTS:'mt@test.mssante.fr'};
  const connectors={mssante:createMssante({env:interopEnv,transport:async o=>{sent.push(o);return {}}}),dmp:createDmp({env:interopEnv}),insi:createInsi({env:{}})};
  const app=await makeApp({pool,bucket:{},cfg:config(env),messaging:{channels:{}},interopEnv,connectors});
  const call=async(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
  const cookie=(await call('POST','/auth/login',{email:RECETTE_EMAIL,password:RECETTE_PASSWORD})).headers.get('Set-Cookie').split(';')[0];
  const api=async(method,route,data)=>{const r=await call(method,'/api/workspace'+route,data,cookie);return {status:r.status,data:await r.json()}};
  const edit=(key,data)=>({key,data,revision:0,operation:crypto.randomUUID(),reason:'Test interop'});
  await api('PUT','/document',edit('stay/V1/core',{id:'V1',careTeamId:'demo-clinique'}));
  await api('PUT','/document',edit('stay/V1/discharge',{summary:'',instructions:'',validated:false,liaison:{document:{values:{}},medecinTraitantMssante:'mt@test.mssante.fr'}}));
  let r=await api('POST','/interop/liaison',{stay:'V1',targets:['mssante-mt']});assert.equal(r.status,409);assert.match(r.data.error,/PDF/);
  const pdf=Buffer.alloc(120,1).toString('base64');
  r=await api('POST','/interop/liaison',{stay:'V1',targets:['mssante-mt','dmp'],pdfBase64:pdf});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.results.find(x=>x.target==='mssante-mt').mode,'test');assert.match(r.data.results.find(x=>x.target==='dmp').error,/incomplet/);
  assert.deepEqual(sent[0].to,['mt@test.mssante.fr']);
  r=await api('GET','/interop/status');assert.equal(r.data.connecteurs.find(c=>c.id==='mssante').etat,'environnement de test officiel');
  r=await api('POST','/interop/insi',{stay:'V1'});assert.equal(r.status,409);
 }finally{await db.close()}
});

// Recette : compte cadre de bloc et programme fictif du bloc (26/11/2026, demande de Romain).
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,verifyPassword,hashPassword} from '../../server/auth.mjs';
import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CADRE_EMAIL,RECETTE_CADRE_PASSWORD,RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD} from '../../server/config.mjs';
import {makeApp} from '../../server/index.mjs';import {programmeFictif,maintenantParis} from '../../worker/recette-bloc.mjs';
import C from '../../dist/planning-core.js';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows,rowCount:r.affectedRows||0}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',base={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters'};
async function setup(env){const db=new PGlite(),pool=pgPool(db);await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
 const call=(method,route,data,cookie)=>app(new Request(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})}));
 const login=async(e,p)=>(await call('POST','/auth/login',{email:e,password:p})).headers.get('Set-Cookie').split(';')[0];
 const docs=async cookie=>Object.fromEntries((await (await call('GET','/api/workspace',undefined,cookie)).json()).documents.map(d=>[d.key,d.data]));
 return {db,pool,app,call,login,docs};}

test('recette : compte cadre de bloc créé une seule fois, jamais hors recette',async()=>{
 const db=new PGlite(),pool=pgPool(db);try{await migrate(pool);
  await bootstrap(pool,{BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_PASSWORD_HASH:await hashPassword('mot de passe administrateur')});
  assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1',[RECETTE_CADRE_EMAIL])).rows.length,0,'jamais hors recette');
  await bootstrap(pool,{IASELO_RECETTE:'true'});await bootstrap(pool,{IASELO_RECETTE:'true'});
  const {rows}=await pool.query('SELECT u.id,u.password_hash,p.profession,p.poste,m.role FROM auth_users u JOIN professional_profiles p ON p.user_id=u.id JOIN workspace_members m ON m.user_id=u.id WHERE u.email=$1',[RECETTE_CADRE_EMAIL]);
  assert.equal(rows.length,1);assert.equal(rows[0].profession,'infirmier');assert.equal(rows[0].poste,'cadre');assert.equal(rows[0].role,'reader');assert.equal(await verifyPassword(RECETTE_CADRE_PASSWORD,rows[0].password_hash),true);
  assert.deepEqual((await pool.query('SELECT team_id FROM professional_teams WHERE user_id=$1',[rows[0].id])).rows.map(r=>r.team_id),['demo-clinique']);
  await pool.query('UPDATE professional_profiles SET active=0 WHERE user_id=$1',[rows[0].id]);await bootstrap(pool,{IASELO_RECETTE:'true'});
  assert.equal((await pool.query('SELECT active FROM professional_profiles WHERE user_id=$1',[rows[0].id])).rows[0].active,0,'jamais réactivé');
 }finally{await db.close()}
});

test('programme fictif : cohérent avec les règles du bloc (aucun conflit), cas variés',()=>{
 const {documents:d,resume}=programmeFictif({today:'2026-11-26',now:'2026-11-26T10:30'});
 const res=d['management/planningResources'],vac=d['management/vacations'],book=d['management/reservations'];
 for(const v of vac.filter(v=>v.state!=='Annulée'))assert.equal(C.vacationError(v,vac,res),'',v.id);
 for(const r of book)assert.equal(C.bookingError(r,book,res,vac),'',r.id);
 assert.ok(resume.interventions>=20&&resume.annonces>=8&&resume.derives===2,JSON.stringify(resume));
 assert.ok(book.some(r=>r.state==='Terminée')&&book.some(r=>r.state==='Occupée')&&book.some(r=>r.state==='Réservée'));
 const stays=Object.entries(d).filter(([k])=>k.endsWith('/core')).map(([,v])=>v);
 assert.ok(stays.every(s=>s.identity.lastName.startsWith('FICTIF-')),'patients explicitement fictifs');
 assert.ok(!Object.keys(d).some(k=>/invitationContact|preadmission/.test(k)),'aucune coordonnée : aucun SMS possible');
 assert.ok(stays.some(s=>s.mode==='Ambulatoire')&&stays.some(s=>s.mode==='Hospitalisation'));
 const consult=Object.entries(d).filter(([k])=>k.endsWith('/consult')).map(([,v])=>v);
 assert.ok(consult.some(c=>/ASA [34]/.test(c.asa))&&consult.some(c=>/Latex/.test(c.allergies))&&consult.some(c=>!c.validated));
 assert.ok(book.some(r=>/URGENCE/.test(r.procedure)));
 // Annonces : urgence, concurrence d'heure, dépassement, chirurgien sans vacation, dérives après confirmation.
 const patients=Object.entries(d).filter(([k])=>k.endsWith('/core')).map(([k,v])=>({...v,surgicalAnnouncement:d[k.replace('/core','/surgicalAnnouncement')]}));
 const ann=patients.map(C.announcementOf).filter(Boolean);
 const days=[...new Set(ann.map(a=>a.date))];let placed=[],unplaced=[];
 for(const day of days){const p=C.placeAnnouncements(day,ann,vac,book);placed.push(...p.placed);unplaced.push(...p.unplaced)}
 assert.ok(placed.some(p=>p.urgency==='Urgente'),'urgence placée');
 assert.ok(placed.every(p=>!book.some(r=>r.state!=='Annulée'&&r.resource===p.resource&&r.start<p.end&&p.start<r.end)),'une annonce ne se place jamais sur un passage terminé ou en cours');assert.ok(placed.some(p=>p.overflow>0),'dépassement de vacation');
 assert.ok(unplaced.some(p=>/Aucune vacation/.test(p.reason)),'chirurgien sans vacation');assert.ok(placed.some(p=>/Test Chirurgien/.test(p.surgeon)),'annonce du compte de test');
 const drifts=book.filter(r=>r.source==='annonce').map(r=>C.announcementDrift(r,ann.find(a=>a.stay===r.patient)));
 assert.ok(drifts.some(x=>/annulée/.test(x))&&drifts.some(x=>/modifiée/.test(x)),drifts.join('|'));
 // Les données réelles ne sont pas touchées.
 const mine={id:'MA-SALLE',kind:'room',label:'Salle réelle',sector:'bloc-chir'},{documents:d2}=programmeFictif({today:'2026-11-26',now:'2026-11-26T10:30',current:{'management/planningResources':[mine],'management/reservations':[{id:'RES-REEL',patient:'X'}],'management/vacations':[{id:'VAC-REEL'}],'management/plages':[{id:'PL-REEL'}]}});
 assert.ok(d2['management/planningResources'].some(r=>r.id==='MA-SALLE')&&d2['management/reservations'].some(r=>r.id==='RES-REEL')&&d2['management/vacations'].some(v=>v.id==='VAC-REEL')&&d2['management/plages'].some(p=>p.id==='PL-REEL'));
});

test('recette : programme fictif chargé par le serveur, visible et régulé par le cadre, rechargeable',async()=>{
 const env={...base,IASELO_RECETTE:'true'},{db,call,login,docs,app}=await setup(env);
 try{
  const admin=await login(RECETTE_EMAIL,RECETTE_PASSWORD),cadre=await login(RECETTE_CADRE_EMAIL,RECETTE_CADRE_PASSWORD),chir=await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD);
  // Une donnée réelle existe déjà dans la recette.
  assert.equal((await call('POST','/api/workspace/commit',{documents:[{key:'stay/REEL1/core',revision:0,data:{id:'REEL1',careTeamId:'demo-clinique',identity:{lastName:'REEL',firstName:'Test'}},operation:crypto.randomUUID(),reason:'donnée réelle'}]},admin)).status,200);
  const first=await app.programmeRecette();assert.equal(first.charge,true,JSON.stringify(first));
  assert.equal((await app.programmeRecette()).deja,true,'au démarrage suivant, rien n’est rechargé si le programme est à jour');
  const ws=await (await call('GET','/api/workspace',undefined,cadre)).json();assert.equal(ws.access.recette,true);assert.equal(ws.access.profile.poste,'cadre');
  const d=Object.fromEntries(ws.documents.map(x=>[x.key,x.data]));
  assert.ok(d['management/reservations'].filter(r=>r.id.startsWith('DEMO-BLOC-')).length>=20,'le cadre voit le programme');
  assert.ok(Object.keys(d).some(k=>/^stay\/DEMO-BLOC-\d+\/consult$/.test(k)),'et les dossiers (allergies, ASA)');
  assert.ok(d['stay/REEL1/core'],'séjour réel conservé');
  // Le chirurgien de test voit ses annonces.
  const dc=await docs(chir);assert.ok(Object.entries(dc).some(([k,v])=>k.endsWith('/surgicalAnnouncement')&&/Test Chirurgien/.test(v?.published?.fields?.surgeon||'')));
  // Le cadre confirme une annonce (réservation) : refus en cas de conflit de salle, accepté sinon.
  const ann=Object.entries(d).filter(([k,v])=>k.endsWith('/core')).map(([k,v])=>({...v,surgicalAnnouncement:d[k.replace('/core','/surgicalAnnouncement')]})).map(C.announcementOf).filter(a=>a&&a.state==='Transmise');
  const rev=(await (await call('GET','/api/workspace',undefined,cadre)).json()).documents.find(x=>x.key==='management/reservations').revision;
  let ok=null;for(const day of [...new Set(ann.map(a=>a.date))]){const p=C.placeAnnouncements(day,ann,d['management/vacations'],d['management/reservations']).placed.find(p=>!p.overflow);if(p){ok=p;break}}
  assert.ok(ok);const booking=C.bookingFromAnnouncement(ok);
  const clash={...booking,id:'RES-CONFLIT',start:d['management/reservations'].find(r=>r.resource===booking.resource&&r.state==='Réservée'&&r.start.slice(0,10)===booking.start.slice(0,10))?.start};
  if(clash.start){clash.end=C.addMinutes(clash.start,clash.duration+clash.turnover);const r=await call('POST','/api/workspace/commit',{documents:[{key:'management/reservations',revision:rev,data:[...d['management/reservations'],clash],operation:crypto.randomUUID(),reason:'test conflit'}]},cadre);assert.equal(r.status,403);assert.match((await r.json()).error,/Conflit/)}
  const r=await call('POST','/api/workspace/commit',{documents:[{key:'management/reservations',revision:rev,data:[...d['management/reservations'],booking],operation:crypto.randomUUID(),reason:'Confirmation par le cadre'}]},cadre);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
  // Rechargement par le cadre : programme remis à zéro (la confirmation de démonstration disparaît, pas de doublon).
  const re=await call('POST','/api/workspace/recette/programme-bloc',{mode:'recharger'},cadre);assert.equal(re.status,200,JSON.stringify(await re.clone().json()));
  const after=await docs(admin),ids=after['management/reservations'].map(r=>r.id);assert.equal(new Set(ids).size,ids.length);assert.ok(after['stay/REEL1/core']);
  // Le chirurgien ne peut pas recharger.
  assert.equal((await call('POST','/api/workspace/recette/programme-bloc',{},chir)).status,403);
 }finally{await db.close()}
});

test('hors recette : route inexistante, aucun programme fictif ni compte cadre',async()=>{
 const env={...base,BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_PASSWORD_HASH:await hashPassword('mot de passe administrateur 2026')},{db,call,login,app,pool}=await setup(env);
 try{assert.equal(await app.programmeRecette(),null);
  const admin=await login('admin@example.test','mot de passe administrateur 2026');
  // Hors recette, la double authentification est exigée : la session n'est pas encore complète, on vérifie la route directement.
  const {workspaceApi}=await import('../../worker/workspace.mjs');const {postgresBinding}=await import('../../server/database.mjs');
  const owner=(await pool.query("SELECT user_id FROM workspace_members WHERE role='owner'")).rows[0].user_id;
  const r=await workspaceApi(new Request(origin+'/api/workspace/recette/programme-bloc',{method:'POST',headers:{'oai-authenticated-user-id':owner,Origin:origin,'Content-Type':'application/json'},body:'{}'}),{DB:postgresBinding(pool),RECETTE:false});
  assert.equal(r.status,404);assert.ok(admin!==undefined);
 }finally{await db.close()}
});

test('heure de Paris',()=>{assert.deepEqual(maintenantParis(new Date('2026-11-26T23:30:00Z')),{today:'2026-11-27',now:'2026-11-27T00:30'})});

import D from '../../dist/deroulement-regles.js';import {createAccount} from '../../server/auth.mjs';
test('déroulement : l’infirmière de bloc saisit les étapes du patient, sans pouvoir programmer ni déplacer',async()=>{
 const env={...base,IASELO_RECETTE:'true'},{db,pool,call,login,app}=await setup(env);
 try{await app.programmeRecette();
  const id=await createAccount(pool,{email:'ibode@iaselo.test',name:'IBODE test',passwordHash:await hashPassword('Infirmiere bloc 2026 test')}),at=new Date().toISOString();
  await pool.query("UPDATE professional_profiles SET profession='infirmier',poste='bloc' WHERE user_id=$1",[id]);await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);
  const ibode=await login('ibode@iaselo.test','Infirmiere bloc 2026 test');
  const doc=(await (await call('GET','/api/workspace',undefined,ibode)).json()).documents.find(d=>d.key==='management/reservations');
  assert.ok(doc.data.some(r=>D.etapeCourante(r)),'le programme fictif a déjà des étapes franchies');
  const r=doc.data.find(r=>r.state==='Réservée'&&!D.etapeCourante(r)&&!r.source);const step=D.appliquer(r,'arrivee',r.start.slice(0,11)+'07:00','').reservation;
  const put=(data,rev)=>call('POST','/api/workspace/commit',{documents:[{key:'management/reservations',revision:rev,data,operation:crypto.randomUUID(),reason:'déroulement'}]},ibode);
  const moved=await put(doc.data.map(x=>x.id===r.id?{...step,start:r.start.slice(0,11)+'07:00'}:x),doc.revision);assert.equal(moved.status,403,'déplacer : refusé');
  const ok=await put(doc.data.map(x=>x.id===r.id?step:x),doc.revision);assert.equal(ok.status,200,JSON.stringify(await ok.clone().json()));
  const saved=(await ok.json()).documents[0].data.find(x=>x.id===r.id);assert.ok(saved.etapes.arrivee);
 }finally{await db.close()}
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../server/database.mjs';import {bootstrap,provisionalPassword} from '../../server/auth.mjs';import {config,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD} from '../../server/config.mjs';import {makeApp} from '../../server/index.mjs';
function pgPool(db){const query=async(sql,values)=>{if(!values?.length&&/;\s*\S/.test(sql)){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,values);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows||0,command:/^\s*SELECT/i.test(sql)?'SELECT':'UPDATE'}};return {query,connect:async()=>({query,release(){}}),end:()=>db.close()}}
const origin='http://localhost:8080',env={NODE_ENV:'test',BASE_URL:origin,SESSION_SECRET:'test-only-secret-with-at-least-32-characters',IASELO_RECETTE:'true'};

test('mot de passe provisoire : lisible, sans caractère ambigu, différent à chaque fois',()=>{
 const a=provisionalPassword(),b=provisionalPassword();assert.match(a,/^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);assert.doesNotMatch(a,/[01ilo]/);assert.notEqual(a,b);assert.ok(a.length>=14);
});
test('créer un compte : administrateur seulement, mot de passe provisoire à changer à la première connexion',async()=>{
 const db=new PGlite(),pool=pgPool(db);try{await migrate(pool);await bootstrap(pool,env);const app=await makeApp({pool,bucket:{async put(){},async get(){return null}},cfg:config(env)});
  const call=(method,route,data,cookie,{o=origin,form=false}={})=>app(new Request(origin+route,{method,redirect:'manual',headers:{Origin:o,'Content-Type':form?'application/x-www-form-urlencoded':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:form?new URLSearchParams(data).toString():JSON.stringify(data)}:{})}));
  const login=async(email,password)=>{const r=await call('POST','/auth/login',{email,password});return {r,cookie:r.headers.get('Set-Cookie')?.split(';')[0]}};
  const admin=(await login(RECETTE_EMAIL,RECETTE_PASSWORD)).cookie,chir=(await login(RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD)).cookie;
  const nouveau={name:'Dr Jeanne Fictive',email:'Jeanne.Fictive@example.test',profession:'infirmier',poste:'bloc',teamId:'demo-clinique',reason:'Arrivée dans le service'};
  // Refus : sans connexion, non administrateur, autre origine, données invalides.
  assert.equal((await call('POST','/api/admin/accounts',nouveau)).status,401);
  assert.equal((await call('POST','/api/admin/accounts',nouveau,chir)).status,403);
  assert.equal((await call('POST','/api/admin/accounts',nouveau,admin,{o:'https://pirate.example'})).status,403);
  assert.equal((await call('POST','/api/admin/accounts',{...nouveau,profession:'owner'},admin)).status,400);
  assert.equal((await call('POST','/api/admin/accounts',{...nouveau,poste:'reanimation'},admin)).status,400,'poste infirmier inconnu');
  assert.equal((await call('POST','/api/admin/accounts',{...nouveau,teamId:'inconnue'},admin)).status,400);
  assert.equal((await pool.query("SELECT COUNT(*) AS n FROM professional_access_log WHERE action='account-create' AND result='denied'")).rows[0].n,1);
  // Création.
  let r=await call('POST','/api/admin/accounts',nouveau,admin);const x=await r.json();assert.equal(r.status,200,JSON.stringify(x));assert.equal(x.email,'jeanne.fictive@example.test');assert.match(x.temporaryPassword,/^[a-z2-9-]{23}$/);
  const {rows:[u]}=await pool.query("SELECT u.must_change_password,u.password_hash,p.profession,p.poste,m.role FROM auth_users u JOIN professional_profiles p ON p.user_id=u.id JOIN workspace_members m ON m.user_id=u.id WHERE u.email='jeanne.fictive@example.test'");
  assert.equal(u.must_change_password,1);assert.equal(u.profession,'infirmier');assert.equal(u.poste,'bloc');assert.equal(u.role,'reader');assert.doesNotMatch(u.password_hash,new RegExp(x.temporaryPassword));
  assert.equal((await call('POST','/api/admin/accounts',nouveau,admin)).status,409,'adresse déjà utilisée');
  // Sans équipe choisie : rattaché à toutes les équipes actives.
  const sans=await (await call('POST','/api/admin/accounts',{name:'Dr Sans Équipe',email:'sans.equipe@example.test',profession:'chirurgien'},admin)).json();
  assert.deepEqual((await pool.query('SELECT team_id FROM professional_teams WHERE user_id=$1 ORDER BY team_id',[sans.userId])).rows.map(r=>r.team_id),['demo-clinique','endoscopie','sejour-medical']);
  // Première connexion : redirigé vers le changement de mot de passe, aucun dossier servi avant.
  const first=await login('jeanne.fictive@example.test',x.temporaryPassword);assert.equal(first.r.headers.get('Location'),'/mot-de-passe');
  assert.equal((await call('GET','/api/workspace',undefined,first.cookie)).status,401);
  assert.equal((await call('GET','/',undefined,first.cookie)).headers.get('Location'),'/mot-de-passe');
  assert.match(await (await call('GET','/mot-de-passe',undefined,first.cookie)).text(),/mot de passe provisoire/);
  assert.equal((await call('POST','/auth/password',{current:'faux mot de passe',password:'Nouveau mot de passe 2026',confirm:'Nouveau mot de passe 2026'},first.cookie,{form:true})).status,400);
  assert.equal((await call('POST','/auth/password',{current:x.temporaryPassword,password:'trop court',confirm:'trop court'},first.cookie,{form:true})).status,400);
  assert.equal((await call('POST','/auth/password',{current:x.temporaryPassword,password:'Nouveau mot de passe 2026',confirm:'Autre mot de passe 2026'},first.cookie,{form:true})).status,400);
  r=await call('POST','/auth/password',{current:x.temporaryPassword,password:'Nouveau mot de passe 2026',confirm:'Nouveau mot de passe 2026'},first.cookie,{form:true});assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/');
  const ws=await (await call('GET','/api/workspace',undefined,first.cookie)).json();assert.equal(ws.access.profile.profession,'infirmier');assert.equal(ws.access.profile.poste,'bloc');
  assert.equal((await login('jeanne.fictive@example.test',x.temporaryPassword)).r.status,401,'ancien mot de passe provisoire refusé');
  assert.equal((await login('jeanne.fictive@example.test','Nouveau mot de passe 2026')).r.headers.get('Location'),'/');
  const {rows:[trace]}=await pool.query("SELECT reason,detail FROM professional_access_log WHERE action='account-create' AND result='allowed'");assert.equal(trace.reason,'Arrivée dans le service');assert.equal((await pool.query("SELECT reason FROM professional_access_log WHERE action='account-create' AND target=$1",[sans.userId])).rows[0].reason,'Création du compte par l’administrateur');assert.doesNotMatch(trace.detail,new RegExp(x.temporaryPassword));
 }finally{await db.close()}
});

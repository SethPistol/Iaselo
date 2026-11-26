import {randomBytes,randomUUID,scrypt as scryptCb,timingSafeEqual,createHmac} from 'node:crypto';import {promisify} from 'node:util';import {newSecret,verify as verifyTotp,mfaPage} from './mfa.mjs';import {recette,RECETTE_EMAIL,RECETTE_PASSWORD,RECETTE_CHIRURGIEN_EMAIL,RECETTE_CHIRURGIEN_PASSWORD} from './config.mjs';
const scrypt=promisify(scryptCb);
export async function hashPassword(password){if(typeof password!=='string'||password.length<14||password.length>1024)throw Error('Mot de passe : entre 14 et 1024 caractères.');const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64,{N:16384,maxmem:64*1024*1024});return 'scrypt$16384$'+salt+'$'+key.toString('hex')}
export async function verifyPassword(password,hash){if(typeof password!=='string'||password.length>1024||!/^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash||''))return false;const [,,salt,expected]=hash.split('$'),actual=await scrypt(password,salt,64,{N:16384,maxmem:64*1024*1024});return timingSafeEqual(actual,Buffer.from(expected,'hex'))}
export const PROFESSIONS=['anesthesiste','chirurgien','infirmier','secretariat','pharmacien','dim','facturation','administration','unassigned'];
// Mot de passe provisoire lisible (sans caractères ambigus), environ 100 bits d'entropie.
export function provisionalPassword(){const a='abcdefghjkmnpqrstuvwxyz23456789',b=randomBytes(20);const c=[...b].map(x=>a[x%a.length]).join('');return c.slice(0,5)+'-'+c.slice(5,10)+'-'+c.slice(10,15)+'-'+c.slice(15,20)}
export async function createAccount(pool,{email,name,passwordHash,admin=false}){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||!name?.trim()||name.length>160||!/^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash||''))throw Error('E-mail, nom et empreinte scrypt valides requis.');
 const client=await pool.connect(),id=randomUUID(),at=new Date().toISOString();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73621591)');
 if(admin&&(await client.query('SELECT id FROM auth_users LIMIT 1')).rows.length)throw Error('Le premier administrateur existe déjà.');
 await client.query('INSERT INTO auth_users(id,email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4,$5)',[id,email.toLowerCase(),name.trim(),passwordHash,at]);
 await client.query('INSERT INTO workspace_members VALUES($1,$2,$3)',[id,admin?'owner':'reader',at]);
 await client.query('INSERT INTO professional_profiles(user_id,display_name,email,profession,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$1)',[id,name.trim(),email.toLowerCase(),admin?'anesthesiste':'unassigned',at]);
 if(admin){await client.query("INSERT INTO care_teams(id,label) VALUES('endoscopie','Endoscopie'),('demo-clinique','Chirurgie'),('sejour-medical','Séjour médical') ON CONFLICT DO NOTHING");for(const team of ['endoscopie','demo-clinique','sejour-medical'])await client.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,$2,$3)",[id,team,at]);}
 await client.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,id,admin?'bootstrap-admin':'account-created']);await client.query('COMMIT');return id;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
// Recette uniquement : compte « Dr Test Chirurgien », profil chirurgien, équipe Chirurgie (celle des dossiers fictifs).
// Créé une seule fois : s'il a été désactivé ou supprimé par l'administrateur, il n'est jamais réactivé ni recréé
// tant que son adresse existe. Jamais appelé hors IASELO_RECETTE=true.
export async function ensureRecetteSurgeon(pool,env=process.env){
 if(!recette(env))return null;try{if((await pool.query('SELECT id FROM auth_users WHERE email=$1',[RECETTE_CHIRURGIEN_EMAIL])).rows.length)return null;
 const id=await createAccount(pool,{email:RECETTE_CHIRURGIEN_EMAIL,name:'Dr Test Chirurgien (recette)',passwordHash:await hashPassword(RECETTE_CHIRURGIEN_PASSWORD)}),at=new Date().toISOString();
 await pool.query("UPDATE professional_profiles SET profession='chirurgien',updated_at=$2 WHERE user_id=$1",[id,at]);
 await pool.query("INSERT INTO care_teams(id,label) VALUES('demo-clinique','Chirurgie') ON CONFLICT DO NOTHING");
 await pool.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);return id;
 }catch(e){console.error('compte chirurgien de recette non créé',e?.message||e);return null}
}
export async function bootstrap(pool,env=process.env){if((await pool.query('SELECT id FROM auth_users LIMIT 1')).rows.length){await ensureRecetteSurgeon(pool,env);return}if(recette(env)){await createAccount(pool,{email:RECETTE_EMAIL,name:'Dr Démo (recette)',passwordHash:await hashPassword(RECETTE_PASSWORD),admin:true});await ensureRecetteSurgeon(pool,env);return}await createAccount(pool,{email:env.BOOTSTRAP_ADMIN_EMAIL,name:env.BOOTSTRAP_ADMIN_NAME||'Administrateur',passwordHash:env.BOOTSTRAP_ADMIN_PASSWORD_HASH,admin:true})}
// Formulaires HTML : avec Referrer-Policy: no-referrer, les navigateurs envoient « Origin: null » pour un POST
// de formulaire, même vers la même origine. Sec-Fetch-Site, fixé par le navigateur et non modifiable par une page,
// confirme alors que la requête vient bien de cette origine. Toute autre origine reste refusée.
export function sameOrigin(request,cfg){const origin=request.headers.get('Origin');if(origin===cfg.baseUrl)return true;return origin==='null'&&request.headers.get('Sec-Fetch-Site')==='same-origin'}
export async function createAuth(pool,cfg,{psc=null}={}){
 const fingerprint=v=>createHmac('sha256',cfg.sessionSecret).update(v).digest('hex'),cookieName=cfg.secure?'__Host-parcours_session':'parcours_session',dummy=await hashPassword(randomBytes(32).toString('hex'));
 const sessionCookie=(token,age)=>cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(cfg.secure?'; Secure':'');
 function getToken(request){const value=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null}
 async function user(request){const token=getToken(request);if(!token)return null;return (await pool.query('SELECT u.id,u.email,u.display_name FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id JOIN professional_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND s.locked_at IS NULL AND s.mfa_ok=1 AND u.enabled=1 AND p.active=1 AND u.must_change_password=0',[fingerprint(token),new Date().toISOString()])).rows[0]||null}
 async function login(request){
  if(!sameOrigin(request,cfg))return new Response('Origine refusée',{status:403});
  const bytes=await request.arrayBuffer();if(bytes.byteLength>8192)return new Response('Requête trop volumineuse',{status:413});let d;try{const raw=new TextDecoder().decode(bytes);d=request.headers.get('Content-Type')?.includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw))}catch{return new Response('Requête invalide',{status:400})}
  const email=String(d.email||'').trim().toLowerCase().slice(0,240),identity=fingerprint(email),at=new Date().toISOString(),since=new Date(Date.now()-15*60000).toISOString();
  if(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_attempts WHERE identity_hash=$1 AND at>$2 AND success=0',[identity,since])).rows[0].n)>=10)return new Response('Trop de tentatives. Réessayez dans 15 minutes.',{status:429});
  const account=(await pool.query('SELECT u.*,p.active FROM auth_users u JOIN professional_profiles p ON p.user_id=u.id WHERE u.email=$1',[email])).rows[0];
  const passwordOK=await verifyPassword(d.password,account?.password_hash||dummy),ok=passwordOK&&account?.enabled===1&&account?.active===1;
  await pool.query('INSERT INTO auth_attempts(identity_hash,at,success) VALUES($1,$2,$3)',[identity,at,ok?1:0]);
  if(!ok)return new Response(loginPage('Identifiants invalides ou compte désactivé.'),{status:401,headers:{'Content-Type':'text/html; charset=utf-8'}});
  const mfa=mfaRequired(account.email);return openSession(account.id,'password',null,account.must_change_password?'/mot-de-passe':mfa?'/double-authentification':'/',mfa);
 }
 async function openSession(userId,method,idToken=null,location='/',mfaPending=false){
  const token=randomBytes(32).toString('hex'),at=new Date().toISOString();await pool.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at,method,id_token,mfa_ok) VALUES($1,$2,$3,$4,$5,$6,$7)',[fingerprint(token),userId,new Date(Date.now()+(mfaPending?Math.min(cfg.sessionHours,0.25):cfg.sessionHours)*3600000).toISOString(),at,method,idToken,mfaPending?0:1]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,userId,method==='psc'?'login-psc':'login']);
  return new Response(null,{status:303,headers:{Location:location,'Set-Cookie':sessionCookie(token,Math.floor(cfg.sessionHours*3600))}});
 }
 // Pro Santé Connect : le professionnel est reconnu par son RPPS, renseigné au préalable sur son compte
 // par un administrateur (écran Accès professionnels). Aucun compte n'est créé automatiquement.
 const stateCookie=(v,age)=>'iaselo_psc='+v+'; Path=/auth/psc; HttpOnly; SameSite=Lax; Max-Age='+age+(cfg.secure?'; Secure':'');
 async function pscStart(){if(!psc?.enabled())return new Response('Pro Santé Connect non configuré.',{status:404});try{const {location,cookie}=await psc.start();return new Response(null,{status:303,headers:{Location:location,'Set-Cookie':stateCookie(cookie,600)}})}catch(e){return new Response(loginPage('Pro Santé Connect indisponible. Réessayez ou utilisez votre mot de passe.',undefined,true),{status:502,headers:{'Content-Type':'text/html; charset=utf-8'}})}}
 async function pscCallback(request){
  if(!psc?.enabled())return new Response('Pro Santé Connect non configuré.',{status:404});
  const raw=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('iaselo_psc='))?.slice(11);
  const page=(m,status)=>new Response(loginPage(m,undefined,true),{status,headers:{'Content-Type':'text/html; charset=utf-8','Set-Cookie':stateCookie('',0)}});
  let r;try{r=await psc.callback(new URL(request.url).searchParams,raw)}catch(e){return page(String(e.message).slice(0,200),401)}
  if(!r.rpps)return page('Pro Santé Connect n’a pas transmis de RPPS pour ce professionnel.',403);
  const account=(await pool.query('SELECT u.id FROM auth_users u JOIN professional_profiles p ON p.user_id=u.id WHERE p.rpps=$1 AND u.enabled=1 AND p.active=1',[r.rpps])).rows[0];
  if(!account){await pool.query('INSERT INTO auth_attempts(identity_hash,at,success) VALUES($1,$2,0)',[fingerprint('psc:'+r.rpps),new Date().toISOString()]);return page('Aucun compte actif n’est associé à ce RPPS. Demandez à l’administrateur de le renseigner sur votre compte.',403)}
  const res=await openSession(account.id,'psc',r.idToken),headers=new Headers(res.headers);headers.append('Set-Cookie',stateCookie('',0));return new Response(null,{status:303,headers});
 }
 async function logout(request){if(!sameOrigin(request,cfg))return new Response('Origine refusée',{status:403});const token=getToken(request);let location='/login';if(token){const row=(await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1 RETURNING id_token',[fingerprint(token)])).rows?.[0];if(row?.id_token&&psc)try{location=await psc.logoutUrl(row.id_token)||location}catch{}}return new Response(null,{status:303,headers:{Location:location,'Set-Cookie':sessionCookie('',0)}})}
 // Verrouillage du poste (inactivité ou bouton « Verrouiller ») : la session est suspendue côté serveur,
 // aucune donnée n'est servie tant que le même professionnel n'a pas ressaisi son mot de passe.
 // 5 échecs en 15 minutes ferment la session.
 async function sessionRow(request){const token=getToken(request);if(!token)return null;return (await pool.query('SELECT s.token_hash,s.user_id,s.method,s.locked_at,u.password_hash,u.display_name FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id JOIN professional_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.enabled=1 AND p.active=1',[fingerprint(token),new Date().toISOString()])).rows[0]||null}
 async function lock(request){if(!sameOrigin(request,cfg))return Response.json({error:'Origine refusée'},{status:403});const s=await sessionRow(request);if(!s)return Response.json({error:'Session expirée.'},{status:401});const at=new Date().toISOString();if(!s.locked_at){await pool.query('UPDATE auth_sessions SET locked_at=$1 WHERE token_hash=$2',[at,s.token_hash]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,s.user_id,'lock'])}return Response.json({locked:true,name:s.display_name,method:s.method})}
 async function unlock(request){
  if(!sameOrigin(request,cfg))return Response.json({error:'Origine refusée'},{status:403});
  const bytes=await request.arrayBuffer();if(bytes.byteLength>4096)return Response.json({error:'Requête trop volumineuse'},{status:413});let d;try{d=JSON.parse(new TextDecoder().decode(bytes))}catch{return Response.json({error:'Requête invalide'},{status:400})}
  const s=await sessionRow(request);if(!s)return Response.json({error:'Session expirée : reconnectez-vous.',logout:true},{status:401});
  const identity=fingerprint('unlock:'+s.user_id),at=new Date().toISOString(),since=new Date(Date.now()-15*60000).toISOString();
  const ok=await verifyPassword(String(d.password||''),s.password_hash||dummy);
  await pool.query('INSERT INTO auth_attempts(identity_hash,at,success) VALUES($1,$2,$3)',[identity,at,ok?1:0]);
  if(!ok){const lastOk=(await pool.query('SELECT MAX(at) AS at FROM auth_attempts WHERE identity_hash=$1 AND success=1',[identity])).rows[0]?.at,from=lastOk&&lastOk>since?lastOk:since;const n=Number((await pool.query('SELECT COUNT(*) AS n FROM auth_attempts WHERE identity_hash=$1 AND at>$2 AND success=0',[identity,from])).rows[0].n);if(n>=5){await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[s.token_hash]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,s.user_id,'unlock-refused-logout']);return Response.json({error:'Trop d’essais : la session est fermée. Reconnectez-vous.',logout:true},{status:401,headers:{'Set-Cookie':sessionCookie('',0)}})}return Response.json({error:'Mot de passe incorrect ('+(5-n)+' essai'+(5-n>1?'s':'')+' restant'+(5-n>1?'s':'')+').'},{status:401})}
  await pool.query('UPDATE auth_sessions SET locked_at=NULL WHERE token_hash=$1',[s.token_hash]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,s.user_id,'unlock']);
  return Response.json({unlocked:true});
 }
 // Changement de mot de passe (obligatoire à la première connexion d'un compte créé par l'administrateur).
 async function pendingSession(request){const token=getToken(request);if(!token)return null;return (await pool.query('SELECT s.token_hash,s.user_id,s.mfa_ok,u.email,u.password_hash,u.display_name,u.must_change_password,u.totp_secret,u.totp_active,u.totp_last_step FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id JOIN professional_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND s.locked_at IS NULL AND u.enabled=1 AND p.active=1',[fingerprint(token),new Date().toISOString()])).rows[0]||null}
 async function passwordPage(request){const s=await pendingSession(request);if(!s)return new Response(null,{status:303,headers:{Location:'/login'}});return html(changePasswordPage('',s.display_name,!!s.must_change_password))}
 const html=(body,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8'}});
 async function changePassword(request){
  if(!sameOrigin(request,cfg))return new Response('Origine refusée',{status:403});
  const s=await pendingSession(request);if(!s)return new Response(null,{status:303,headers:{Location:'/login'}});
  const bytes=await request.arrayBuffer();if(bytes.byteLength>8192)return new Response('Requête trop volumineuse',{status:413});let d;try{d=Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes)))}catch{return new Response('Requête invalide',{status:400})}
  const fail=m=>html(changePasswordPage(m,s.display_name,!!s.must_change_password),400),identity=fingerprint('password:'+s.user_id),at=new Date().toISOString(),since=new Date(Date.now()-15*60000).toISOString();
  if(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_attempts WHERE identity_hash=$1 AND at>$2 AND success=0',[identity,since])).rows[0].n)>=5)return html(changePasswordPage('Trop de tentatives. Réessayez dans 15 minutes.',s.display_name,!!s.must_change_password),429);
  const ok=await verifyPassword(String(d.current||''),s.password_hash);await pool.query('INSERT INTO auth_attempts(identity_hash,at,success) VALUES($1,$2,$3)',[identity,at,ok?1:0]);
  if(!ok)return fail('Mot de passe actuel incorrect.');
  const next=String(d.password||'');if(next.length<14||next.length>1024)return fail('Le nouveau mot de passe doit contenir au moins 14 caractères.');if(next!==String(d.confirm||''))return fail('Les deux saisies du nouveau mot de passe sont différentes.');if(next===String(d.current))return fail('Choisissez un mot de passe différent du mot de passe provisoire.');
  await pool.query('UPDATE auth_users SET password_hash=$1,must_change_password=0 WHERE id=$2',[await hashPassword(next),s.user_id]);
  // Les autres sessions de ce compte sont fermées ; celle-ci reste ouverte.
  await pool.query('DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2',[s.user_id,s.token_hash]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,s.user_id,'password-changed']);
  return new Response(null,{status:303,headers:{Location:'/'}});
 }
 // Création d'un compte depuis Accès professionnels : réservée au propriétaire (administrateur) actif, contrôlée ici côté serveur.
 // Le mot de passe provisoire est tiré par le serveur, affiché une seule fois à l'administrateur, jamais stocké en clair.
 async function createAccountFromAdmin(request){
  if(!sameOrigin(request,cfg))return Response.json({error:'Origine refusée'},{status:403});
  const staff=await user(request);if(!staff)return Response.json({error:'Connexion professionnelle requise.'},{status:401});
  const at=new Date().toISOString(),log=(result,target,reason='',detail='')=>pool.query('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[at,staff.id,'account-create',target,result,reason,detail]);
  const admin=(await pool.query("SELECT 1 FROM workspace_members m JOIN professional_profiles p ON p.user_id=m.user_id WHERE m.user_id=$1 AND m.role='owner' AND p.active=1",[staff.id])).rows.length>0;
  if(!admin){await log('denied','auth_users','Création de compte hors administration');return Response.json({error:'Création de compte réservée à l’administrateur.'},{status:403})}
  const bytes=await request.arrayBuffer();if(bytes.byteLength>8192)return Response.json({error:'Requête trop volumineuse'},{status:413});let d;try{d=JSON.parse(new TextDecoder().decode(bytes))}catch{return Response.json({error:'Requête invalide'},{status:400})}
  const email=String(d.email||'').trim().toLowerCase(),name=String(d.name||'').trim(),profession=String(d.profession||''),teamId=String(d.teamId||''),reason=String(d.reason||'').trim().slice(0,500),rpps=String(d.rpps||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>240)return Response.json({error:'Adresse e-mail invalide.'},{status:400});
  if(!name||name.length>160)return Response.json({error:'Nom et prénom requis.'},{status:400});
  if(!PROFESSIONS.includes(profession))return Response.json({error:'Métier inconnu.'},{status:400});
  // Infirmier(ère) : poste de bloc (check-list HAS, ouverture des salles) ou d'étage. Par défaut : étage.
  // Pharmacie : pharmacien (par défaut) ou préparateur en pharmacie.
  const poste=profession==='infirmier'?String(d.poste||'etage'):profession==='pharmacien'?String(d.poste||'pharmacien'):'';if(poste&&!(profession==='infirmier'?['bloc','etage','cadre']:['pharmacien','preparateur']).includes(poste))return Response.json({error:'Poste inconnu : bloc, étage ou cadre de bloc (infirmier), pharmacien ou préparateur (pharmacie).'},{status:400});
  if(rpps&&!/^\d{11}$/.test(rpps))return Response.json({error:'Le RPPS comporte 11 chiffres.'},{status:400});
  // Le motif n'est plus demandé dans le formulaire : la trace garde un libellé par défaut.
  const motif=reason||'Création du compte par l’administrateur';
  if(teamId&&!(await pool.query('SELECT 1 FROM care_teams WHERE id=$1 AND active=1',[teamId])).rows.length)return Response.json({error:'Équipe de soins inconnue.'},{status:400});
  if((await pool.query('SELECT 1 FROM auth_users WHERE email=$1',[email])).rows.length)return Response.json({error:'Un compte existe déjà avec cette adresse.'},{status:409});
  const temporary=provisionalPassword();let id;try{id=await createAccount(pool,{email,name,passwordHash:await hashPassword(temporary)})}catch(e){return Response.json({error:/unique|duplicate/i.test(e.message)?'Un compte existe déjà avec cette adresse.':'Création impossible.'},{status:409})}
  await pool.query('UPDATE auth_users SET must_change_password=1 WHERE id=$1',[id]);
  await pool.query('UPDATE professional_profiles SET profession=$2,rpps=$3,updated_at=$4,updated_by=$5,poste=$6 WHERE user_id=$1',[id,profession,rpps,at,staff.id,poste]);
  // Sans équipe choisie (cas du formulaire), le compte est rattaché à toutes les équipes de soins actives
  // pour voir les séjours dès sa première connexion ; l'administrateur peut ensuite révoquer un rattachement.
  const teams=teamId?[teamId]:(await pool.query('SELECT id FROM care_teams WHERE active=1 ORDER BY id')).rows.map(r=>r.id);
  for(const t of teams)await pool.query('INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,$2,$3)',[id,t,at]);
  await log('allowed',id,motif,JSON.stringify({profession,poste,teams,rppsDeclared:!!rpps}));
  return Response.json({created:true,userId:id,email,temporaryPassword:temporary});
 }
 async function mustChangePassword(request){return !!(await pendingSession(request))?.must_change_password}
 // Étape suivante d'une connexion inachevée : mot de passe provisoire à changer, puis code à usage unique.
 async function nextStep(request){const s=await pendingSession(request);return s?.must_change_password?'/mot-de-passe':s&&!s.mfa_ok?'/double-authentification':'/login'}
 function mfaRequired(email){return !!cfg.mfa&&!(cfg.recette&&[RECETTE_EMAIL,RECETTE_CHIRURGIEN_EMAIL].includes(email))}
 async function mfaStart(request){const s=await pendingSession(request);
  if(!s)return new Response(null,{status:303,headers:{Location:'/login'}});if(s.must_change_password)return new Response(null,{status:303,headers:{Location:'/mot-de-passe'}});if(s.mfa_ok)return new Response(null,{status:303,headers:{Location:'/'}});
  let secret=s.totp_secret;if(!s.totp_active&&!secret){secret=newSecret();await pool.query("UPDATE auth_users SET totp_secret=$1 WHERE id=$2 AND totp_active=0 AND totp_secret=''",[secret,s.user_id]);secret=(await pool.query('SELECT totp_secret FROM auth_users WHERE id=$1',[s.user_id])).rows[0].totp_secret}
  return html(mfaPage({name:s.display_name,enroll:!s.totp_active,secret:s.totp_active?'':secret,email:s.email}))}
 async function mfaVerify(request){
  if(!sameOrigin(request,cfg))return new Response('Origine refusée',{status:403});
  const s=await pendingSession(request);if(!s||s.must_change_password)return new Response(null,{status:303,headers:{Location:'/login'}});if(s.mfa_ok)return new Response(null,{status:303,headers:{Location:'/'}});
  const bytes=await request.arrayBuffer();if(bytes.byteLength>2048)return new Response('Requête trop volumineuse',{status:413});
  let d;try{d=Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes)))}catch{return new Response('Requête invalide',{status:400})}
  const identity=fingerprint('mfa:'+s.user_id),at=new Date().toISOString(),since=new Date(Date.now()-15*60000).toISOString(),page=(m,status)=>html(mfaPage({message:m,name:s.display_name,enroll:!s.totp_active,secret:s.totp_active?'':s.totp_secret,email:s.email}),status);
  const step=verifyTotp(s.totp_secret,d.code,s.totp_last_step);
  await pool.query('INSERT INTO auth_attempts(identity_hash,at,success) VALUES($1,$2,$3)',[identity,at,step?1:0]);
  if(!step){const n=Number((await pool.query('SELECT COUNT(*) AS n FROM auth_attempts WHERE identity_hash=$1 AND at>$2 AND success=0',[identity,since])).rows[0].n);
   if(n>=5){await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[s.token_hash]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,s.user_id,'mfa-refused-logout']);return new Response(loginPage('Trop de codes erronés : reconnectez-vous.'),{status:401,headers:{'Content-Type':'text/html; charset=utf-8','Set-Cookie':sessionCookie('',0)}})}
   return page('Code incorrect ou expiré ('+(5-n)+' essai'+(5-n>1?'s':'')+' restant'+(5-n>1?'s':'')+').',401)}
  // Pas déjà consommé par une autre requête simultanée : refusé (rejeu).
  const upd=await pool.query('UPDATE auth_users SET totp_active=1,totp_last_step=$1 WHERE id=$2 AND totp_last_step<$1',[step,s.user_id]);if(!upd.rowCount)return page('Code déjà utilisé : attendez le suivant.',401);
  await pool.query('UPDATE auth_sessions SET mfa_ok=1,expires_at=$1 WHERE token_hash=$2',[new Date(Date.now()+cfg.sessionHours*3600000).toISOString(),s.token_hash]);
  await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,s.user_id,s.totp_active?'login-mfa':'mfa-enrolled']);
  return new Response(null,{status:303,headers:{Location:'/','Set-Cookie':sessionCookie(getToken(request),Math.floor(cfg.sessionHours*3600))}})}
 // Réinitialisation par l'administrateur (téléphone perdu) : nouvelle inscription à la prochaine connexion, sessions fermées.
 async function resetMfaFromAdmin(request){
  if(!sameOrigin(request,cfg))return Response.json({error:'Origine refusée'},{status:403});
  const staff=await user(request);if(!staff)return Response.json({error:'Connexion professionnelle requise.'},{status:401});
  const at=new Date().toISOString(),admin=(await pool.query("SELECT 1 FROM workspace_members m JOIN professional_profiles p ON p.user_id=m.user_id WHERE m.user_id=$1 AND m.role='owner' AND p.active=1",[staff.id])).rows.length>0;
  let d;try{d=await request.json()}catch{return Response.json({error:'Requête invalide'},{status:400})}
  const target=String(d?.userId||''),reason=String(d?.reason||'').trim().slice(0,500);
  const log=(result,why)=>pool.query('INSERT INTO professional_access_log(at,actor,action,target,result,reason) VALUES($1,$2,$3,$4,$5,$6)',[at,staff.id,'mfa-reset',target,result,why]);
  if(!admin){await log('denied','Réinitialisation hors administration');return Response.json({error:'Réinitialisation réservée à l’administrateur.'},{status:403})}
  if(reason.length<5)return Response.json({error:'Indiquez un motif de cinq caractères au minimum.'},{status:400});
  const r=await pool.query("UPDATE auth_users SET totp_secret='',totp_active=0,totp_last_step=0 WHERE id=$1",[target]);if(!r.rowCount)return Response.json({error:'Compte introuvable.'},{status:404});
  await pool.query('DELETE FROM auth_sessions WHERE user_id=$1',[target]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,target,'mfa-reset']);await log('allowed',reason);
  return Response.json({reset:true})}
 return {user,login,logout,lock,unlock,pscStart,pscCallback,passwordPage,mustChangePassword,nextStep,mfaStart,mfaVerify,resetMfaFromAdmin,changePassword,createAccountFromAdmin,pscEnabled:()=>!!psc?.enabled()};
}
export function changePasswordPage(message='',name='',required=true){const e=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mot de passe · IASELO</title><link rel="icon" type="image/png" href="/assets/marque/favicon.png"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;color:#0C1A25;background:#F3F5F8}
main{width:100%;max-width:440px;background:#fff;border:1px solid #DCE3E9;border-radius:18px;padding:28px;display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-size:26px;letter-spacing:-.02em}p{margin:0;color:#4C5D6C}form{display:flex;flex-direction:column;gap:14px}
label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:550}input{font:inherit;min-height:48px;padding:0 14px;border:1px solid #C3CDD6;border-radius:12px}
input:focus{outline:none;border-color:#0F4D5C;box-shadow:0 0 0 4px #E1EFF1}button{font:600 16px system-ui,sans-serif;min-height:50px;border:0;border-radius:12px;background:#0F4D5C;color:#fff;cursor:pointer}
.error{padding:12px 14px;border-radius:12px;background:#FDEBEC;color:#B21F2A;font-weight:550}.error:empty{display:none}
@media (prefers-color-scheme:dark){body{background:#0B1419;color:#E6EEF2}main{background:#111D24;border-color:#24343E}p{color:#A9BAC5}input{background:#0B1419;color:#E6EEF2;border-color:#33464F}}
</style></head><body><main><h1>${required?'Choisissez votre mot de passe':'Changer de mot de passe'}</h1><p>${e(name)}${required?' : votre compte a été créé avec un mot de passe provisoire. Choisissez un mot de passe personnel pour accéder aux dossiers.':''}</p><p class="error" role="alert">${e(message)}</p><form method="post" action="/auth/password"><label>Mot de passe ${required?'provisoire':'actuel'}<input type="password" name="current" autocomplete="current-password" required maxlength="1024"></label><label>Nouveau mot de passe (14 caractères minimum)<input type="password" name="password" autocomplete="new-password" minlength="14" maxlength="1024" required></label><label>Confirmer le nouveau mot de passe<input type="password" name="confirm" autocomplete="new-password" minlength="14" maxlength="1024" required></label><button>Enregistrer et continuer</button></form></main></body></html>`}
export function loginPage(message='',test=recette(),psc=false){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion · IASELO</title><link rel="icon" type="image/png" href="/assets/marque/favicon.png"><style>
@font-face{font-family:Geist;font-weight:100 900;font-display:swap;src:url(/assets/fonts/geist-latin-wght-normal.woff2) format('woff2-variations')}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{font:16px/1.55 Geist,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0C1A25;background:#F3F5F8;-webkit-font-smoothing:antialiased;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(380px,1fr);min-height:100vh}
.marque{position:relative;overflow:hidden;color:#EAF5F7;background:radial-gradient(120% 140% at 100% 0%,#1C6B7D 0%,#0F4D5C 42%,#0A3843 100%);padding:48px clamp(28px,5vw,72px);display:flex;flex-direction:column;justify-content:space-between;gap:40px}
.marque svg.halo{position:absolute;right:-220px;top:-220px;width:760px;height:760px;opacity:.5;pointer-events:none}
.marque img{height:72px;width:auto;position:relative;align-self:flex-start}
.marque h1{position:relative;margin:0;font-size:clamp(34px,4vw,56px);line-height:1.04;letter-spacing:-.035em;font-weight:640;max-width:14ch;color:#fff}
.marque p{position:relative;margin:18px 0 0;font-size:18px;color:#BFE0E6;max-width:44ch}
.etapes{position:relative;display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;padding:0;list-style:none}
.etapes li{font-size:13px;font-weight:550;padding:7px 12px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#E2F2F5}
.pied{position:relative;font-size:13px;color:#A9D3DB}
.acces{display:flex;align-items:center;justify-content:center;padding:40px 24px}
main{width:100%;max-width:420px;display:flex;flex-direction:column;gap:22px}
.etab{height:112px;width:auto;align-self:flex-start}
h2{margin:6px 0 0;font-size:30px;font-weight:640;letter-spacing:-.03em;line-height:1.1}
.sous{margin:0;color:#4C5D6C}
.recette{margin:0;padding:12px 14px;border-radius:12px;background:#FFF4E5;border:1px solid #E8B36A;color:#5C3300;font-size:14px}.recette code{font:600 13px/1.4 ui-monospace,monospace}
form{display:flex;flex-direction:column;gap:16px;margin-top:4px}
label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:550}
input{font:inherit;min-height:50px;padding:0 15px;border:1px solid #C3CDD6;border-radius:13px;background:#fff;color:#0C1A25;transition:border-color .15s,box-shadow .15s}
input:hover{border-color:#4C5D6C}input:focus{outline:none;border-color:#0F4D5C;box-shadow:0 0 0 4px #E1EFF1}
button{font:600 16px Geist,system-ui,sans-serif;min-height:52px;margin-top:6px;border:0;border-radius:13px;background:#0F4D5C;color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(12,26,37,.15),0 8px 20px rgba(15,77,92,.18);transition:background .15s}
button:hover{background:#0B3D49}button:focus-visible{outline:3px solid #0F4D5C;outline-offset:3px}
.error{margin:0;padding:12px 14px;border-radius:12px;background:#FDEBEC;color:#B21F2A;font-weight:550}.error:empty{display:none}
.psc{display:flex;align-items:center;justify-content:center;min-height:52px;border:1px solid #0F4D5C;border-radius:13px;color:#0F4D5C;font-weight:600;text-decoration:none}.psc:hover{background:#E1EFF1}
.note{margin:0;font-size:13.5px;color:#4C5D6C;border-top:1px solid #DAE1E8;padding-top:18px}
@media (max-width:860px){body{grid-template-columns:1fr}.marque{padding:28px 24px;gap:24px}.marque svg.halo{width:480px;height:480px;right:-180px;top:-200px}.marque h1{font-size:32px}
.marque img{height:56px}
.etab{height:84px}.etapes,.pied{display:none}.acces{padding:28px 20px 40px}}
</style></head><body>
<section class="marque" aria-label="IASELO"><svg class="halo" viewBox="0 0 760 760" fill="none" aria-hidden="true"><g stroke="#fff"><circle cx="380" cy="380" r="370" stroke-opacity=".10"/><circle cx="380" cy="380" r="300" stroke-opacity=".13"/><circle cx="380" cy="380" r="230" stroke-opacity=".17"/><circle cx="380" cy="380" r="160" stroke-opacity=".22"/><circle cx="380" cy="380" r="90" stroke-opacity=".3"/></g><circle cx="380" cy="380" r="40" fill="#fff" fill-opacity=".12"/></svg>
<img src="/assets/marque/iaselo-sombre.webp" alt="iaselo" width="495" height="160">
<div><h1>Le parcours de chaque patient, d’un seul regard.</h1><p>De l’annonce chirurgicale au suivi, toute l’équipe travaille dans le même dossier : consultation, bloc, réveil, hospitalisation et sortie.</p>
<ul class="etapes"><li>Annonce</li><li>Consultation</li><li>Préparation</li><li>Bloc</li><li>SSPI</li><li>Hospitalisation</li><li>Sortie</li><li>Suivi</li></ul></div>
<p class="pied">Données de santé hébergées en France chez un hébergeur certifié HDS.</p></section>
<div class="acces"><main><img class="etab" src="/assets/marque/etablissement.webp" alt="Clinique du Trocadéro" width="369" height="200"><div><h2>Connexion</h2><p class="sous">Espace des professionnels de l’établissement.</p></div><p class="error" role="alert">${message}</p>${test?`<p class="recette"><strong>Serveur de recette · patients fictifs uniquement.</strong> Les identifiants de test sont communiqués par l’équipe IASELO.</p>`:''}<form method="post" action="/auth/login"><label>E-mail professionnel<input type="email" name="email" autocomplete="username" required></label><label>Mot de passe<input type="password" name="password" autocomplete="current-password" minlength="14" maxlength="1024" required></label><button>Se connecter</button></form>${psc?`<a class="psc" href="/auth/psc/start">Se connecter avec Pro Santé Connect</a><p class="note">Carte CPS ou application e-CPS. Votre RPPS doit être renseigné sur votre compte.</p>`:''}<p class="note">Patients : utilisez le lien personnel qui vous a été remis. Prototype réservé aux données fictives jusqu’à sa validation clinique et organisationnelle.</p></main></div></body></html>`}

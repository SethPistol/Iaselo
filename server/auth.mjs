import {randomBytes,randomUUID,scrypt as scryptCb,timingSafeEqual,createHmac} from 'node:crypto';import {promisify} from 'node:util';
const scrypt=promisify(scryptCb);
export async function hashPassword(password){if(typeof password!=='string'||password.length<14||password.length>1024)throw Error('Mot de passe : entre 14 et 1024 caractères.');const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64,{N:16384,maxmem:64*1024*1024});return 'scrypt$16384$'+salt+'$'+key.toString('hex')}
export async function verifyPassword(password,hash){if(typeof password!=='string'||password.length>1024||!/^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash||''))return false;const [,,salt,expected]=hash.split('$'),actual=await scrypt(password,salt,64,{N:16384,maxmem:64*1024*1024});return timingSafeEqual(actual,Buffer.from(expected,'hex'))}
export async function createAccount(pool,{email,name,passwordHash,admin=false}){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||!name?.trim()||name.length>160||!/^scrypt\$16384\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash||''))throw Error('E-mail, nom et empreinte scrypt valides requis.');
 const client=await pool.connect(),id=randomUUID(),at=new Date().toISOString();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73621591)');
 if(admin&&(await client.query('SELECT id FROM auth_users LIMIT 1')).rows.length)throw Error('Le premier administrateur existe déjà.');
 await client.query('INSERT INTO auth_users(id,email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4,$5)',[id,email.toLowerCase(),name.trim(),passwordHash,at]);
 await client.query('INSERT INTO workspace_members VALUES($1,$2,$3)',[id,admin?'owner':'reader',at]);
 await client.query('INSERT INTO professional_profiles(user_id,display_name,email,profession,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$1)',[id,name.trim(),email.toLowerCase(),admin?'anesthesiste':'unassigned',at]);
 if(admin){await client.query("INSERT INTO care_teams(id,label) VALUES('demo-clinique','Équipe clinique') ON CONFLICT DO NOTHING");await client.query("INSERT INTO professional_teams(user_id,team_id,valid_from) VALUES($1,'demo-clinique',$2)",[id,at]);}
 await client.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,id,admin?'bootstrap-admin':'account-created']);await client.query('COMMIT');return id;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function bootstrap(pool,env=process.env){if((await pool.query('SELECT id FROM auth_users LIMIT 1')).rows.length)return;await createAccount(pool,{email:env.BOOTSTRAP_ADMIN_EMAIL,name:env.BOOTSTRAP_ADMIN_NAME||'Administrateur',passwordHash:env.BOOTSTRAP_ADMIN_PASSWORD_HASH,admin:true})}
// Formulaires HTML : avec Referrer-Policy: no-referrer, les navigateurs envoient « Origin: null » pour un POST
// de formulaire, même vers la même origine. Sec-Fetch-Site, fixé par le navigateur et non modifiable par une page,
// confirme alors que la requête vient bien de cette origine. Toute autre origine reste refusée.
export function sameOrigin(request,cfg){const origin=request.headers.get('Origin');if(origin===cfg.baseUrl)return true;return origin==='null'&&request.headers.get('Sec-Fetch-Site')==='same-origin'}
export async function createAuth(pool,cfg){
 const fingerprint=v=>createHmac('sha256',cfg.sessionSecret).update(v).digest('hex'),cookieName=cfg.secure?'__Host-parcours_session':'parcours_session',dummy=await hashPassword(randomBytes(32).toString('hex'));
 const sessionCookie=(token,age)=>cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(cfg.secure?'; Secure':'');
 function getToken(request){const value=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null}
 async function user(request){const token=getToken(request);if(!token)return null;return (await pool.query('SELECT u.id,u.email,u.display_name FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id JOIN professional_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.enabled=1 AND p.active=1',[fingerprint(token),new Date().toISOString()])).rows[0]||null}
 async function login(request){
  if(!sameOrigin(request,cfg))return new Response('Origine refusée',{status:403});
  const bytes=await request.arrayBuffer();if(bytes.byteLength>8192)return new Response('Requête trop volumineuse',{status:413});let d;try{const raw=new TextDecoder().decode(bytes);d=request.headers.get('Content-Type')?.includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw))}catch{return new Response('Requête invalide',{status:400})}
  const email=String(d.email||'').trim().toLowerCase().slice(0,240),identity=fingerprint(email),at=new Date().toISOString(),since=new Date(Date.now()-15*60000).toISOString();
  if(Number((await pool.query('SELECT COUNT(*) AS n FROM auth_attempts WHERE identity_hash=$1 AND at>$2 AND success=0',[identity,since])).rows[0].n)>=10)return new Response('Trop de tentatives. Réessayez dans 15 minutes.',{status:429});
  const account=(await pool.query('SELECT u.*,p.active FROM auth_users u JOIN professional_profiles p ON p.user_id=u.id WHERE u.email=$1',[email])).rows[0];
  const passwordOK=await verifyPassword(d.password,account?.password_hash||dummy),ok=passwordOK&&account?.enabled===1&&account?.active===1;
  await pool.query('INSERT INTO auth_attempts(identity_hash,at,success) VALUES($1,$2,$3)',[identity,at,ok?1:0]);
  if(!ok)return new Response(loginPage('Identifiants invalides ou compte désactivé.'),{status:401,headers:{'Content-Type':'text/html; charset=utf-8'}});
  const token=randomBytes(32).toString('hex');await pool.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)',[fingerprint(token),account.id,new Date(Date.now()+cfg.sessionHours*3600000).toISOString(),at]);await pool.query('INSERT INTO auth_audit(at,user_id,action) VALUES($1,$2,$3)',[at,account.id,'login']);
  return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':sessionCookie(token,Math.floor(cfg.sessionHours*3600))}});
 }
 async function logout(request){if(!sameOrigin(request,cfg))return new Response('Origine refusée',{status:403});const token=getToken(request);if(token)await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[fingerprint(token)]);return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':sessionCookie('',0)}})}
 return {user,login,logout};
}
export function loginPage(message=''){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion · IASELO</title><link rel="icon" type="image/png" href="/assets/marque/favicon.png"><style>
@font-face{font-family:Geist;font-weight:100 900;font-display:swap;src:url(/assets/fonts/geist-latin-wght-normal.woff2) format('woff2-variations')}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{font:16px/1.55 Geist,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0C1A25;background:#F3F5F8;-webkit-font-smoothing:antialiased;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(380px,1fr);min-height:100vh}
.marque{position:relative;overflow:hidden;color:#EAF5F7;background:radial-gradient(120% 140% at 100% 0%,#1C6B7D 0%,#0F4D5C 42%,#0A3843 100%);padding:48px clamp(28px,5vw,72px);display:flex;flex-direction:column;justify-content:space-between;gap:40px}
.marque svg.halo{position:absolute;right:-220px;top:-220px;width:760px;height:760px;opacity:.5;pointer-events:none}
.marque img{height:46px;width:auto;position:relative;align-self:flex-start}
.marque h1{position:relative;margin:0;font-size:clamp(34px,4vw,56px);line-height:1.04;letter-spacing:-.035em;font-weight:640;max-width:14ch;color:#fff}
.marque p{position:relative;margin:18px 0 0;font-size:18px;color:#BFE0E6;max-width:44ch}
.etapes{position:relative;display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;padding:0;list-style:none}
.etapes li{font-size:13px;font-weight:550;padding:7px 12px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#E2F2F5}
.pied{position:relative;font-size:13px;color:#A9D3DB}
.acces{display:flex;align-items:center;justify-content:center;padding:40px 24px}
main{width:100%;max-width:420px;display:flex;flex-direction:column;gap:22px}
.etab{height:68px;width:auto;align-self:flex-start}
h2{margin:6px 0 0;font-size:30px;font-weight:640;letter-spacing:-.03em;line-height:1.1}
.sous{margin:0;color:#4C5D6C}
form{display:flex;flex-direction:column;gap:16px;margin-top:4px}
label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:550}
input{font:inherit;min-height:50px;padding:0 15px;border:1px solid #C3CDD6;border-radius:13px;background:#fff;color:#0C1A25;transition:border-color .15s,box-shadow .15s}
input:hover{border-color:#4C5D6C}input:focus{outline:none;border-color:#0F4D5C;box-shadow:0 0 0 4px #E1EFF1}
button{font:600 16px Geist,system-ui,sans-serif;min-height:52px;margin-top:6px;border:0;border-radius:13px;background:#0F4D5C;color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(12,26,37,.15),0 8px 20px rgba(15,77,92,.18);transition:background .15s}
button:hover{background:#0B3D49}button:focus-visible{outline:3px solid #0F4D5C;outline-offset:3px}
.error{margin:0;padding:12px 14px;border-radius:12px;background:#FDEBEC;color:#B21F2A;font-weight:550}.error:empty{display:none}
.note{margin:0;font-size:13.5px;color:#4C5D6C;border-top:1px solid #DAE1E8;padding-top:18px}
@media (max-width:860px){body{grid-template-columns:1fr}.marque{padding:28px 24px;gap:24px}.marque svg.halo{width:480px;height:480px;right:-180px;top:-200px}.marque h1{font-size:32px}.etapes,.pied{display:none}.acces{padding:28px 20px 40px}}
</style></head><body>
<section class="marque" aria-label="IASELO"><svg class="halo" viewBox="0 0 760 760" fill="none" aria-hidden="true"><g stroke="#fff"><circle cx="380" cy="380" r="370" stroke-opacity=".10"/><circle cx="380" cy="380" r="300" stroke-opacity=".13"/><circle cx="380" cy="380" r="230" stroke-opacity=".17"/><circle cx="380" cy="380" r="160" stroke-opacity=".22"/><circle cx="380" cy="380" r="90" stroke-opacity=".3"/></g><circle cx="380" cy="380" r="40" fill="#fff" fill-opacity=".12"/></svg>
<img src="/assets/marque/iaselo-sombre.webp" alt="iaselo" width="495" height="160">
<div><h1>Le parcours de chaque patient, d’un seul regard.</h1><p>De l’annonce chirurgicale au suivi, toute l’équipe travaille dans le même dossier : consultation, bloc, réveil, hospitalisation et sortie.</p>
<ul class="etapes"><li>Annonce</li><li>Consultation</li><li>Préparation</li><li>Bloc</li><li>SSPI</li><li>Hospitalisation</li><li>Sortie</li><li>Suivi</li></ul></div>
<p class="pied">Données de santé hébergées en France chez un hébergeur certifié HDS.</p></section>
<div class="acces"><main><img class="etab" src="/assets/marque/etablissement.webp" alt="Clinique du Trocadéro" width="369" height="200"><div><h2>Connexion</h2><p class="sous">Espace des professionnels de l’établissement.</p></div><p class="error" role="alert">${message}</p><form method="post" action="/auth/login"><label>E-mail professionnel<input type="email" name="email" autocomplete="username" required></label><label>Mot de passe<input type="password" name="password" autocomplete="current-password" minlength="14" maxlength="1024" required></label><button>Se connecter</button></form><p class="note">Patients : utilisez le lien personnel qui vous a été remis. Prototype réservé aux données fictives jusqu’à sa validation clinique et organisationnelle.</p></main></div></body></html>`}

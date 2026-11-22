// Pro Santé Connect (ANS) : connexion des professionnels par e-CPS ou carte CPS, protocole OpenID Connect
// (« Code Flow »). Service gratuit ; raccordement déclaré par l'éditeur sur le Portail Industriels de l'ANS.
//
// Variables (Clever Cloud) :
//   INTEROP_PSC_MODE           simulation | test (bac à sable « BAS ») | production
//   PSC_CLIENT_ID              identifiant client remis par l'ANS (un par environnement)
//   PSC_CLIENT_SECRET          secret client (jamais côté navigateur)
//   PSC_DISCOVERY_URL          facultatif : document de découverte ; valeurs par défaut ci-dessous
//   INTEROP_PSC_AUTORISATION   production : référence de la demande de raccordement validée par l'ANS
// L'adresse de retour à déclarer à l'ANS est  <BASE_URL>/auth/psc/callback
// et l'adresse après déconnexion              <BASE_URL>/login
//
// Exigences reprises du référentiel PSC (à revérifier sur la version en vigueur) : scope « openid scope_all »,
// acr_values « eidas1 », secret côté serveur seulement, vérification de l'ID Token (signature, iss, aud, exp,
// nonce), identification du professionnel par SubjectNameID (« 8 » + RPPS), déconnexion avec id_token_hint.
import {createHmac,createPublicKey,createVerify,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {connectorConfig,requireReady} from './modes.mjs';

// URLs publiées (bac à sable puis production) : à confirmer dans la documentation technique ANS au raccordement.
export const PSC_DISCOVERY={
 test:'https://auth.bas.psc.esante.gouv.fr/auth/realms/esante-wallet/.well-known/wallet-openid-configuration',
 production:'https://auth.esw.esante.gouv.fr/auth/realms/esante-wallet/.well-known/wallet-openid-configuration'
};
export function pscConfig(env=process.env){
 const cfg=connectorConfig('psc',['PSC_CLIENT_ID','PSC_CLIENT_SECRET'],env);
 cfg.discoveryUrl=String(env.PSC_DISCOVERY_URL||PSC_DISCOVERY[cfg.mode]||'').trim();
 return cfg;
}
const b64url=b=>Buffer.from(b).toString('base64url');
const fromB64url=s=>Buffer.from(String(s),'base64url');

// Vérifie un JWT signé (RS256/PS256/ES256) avec les clés publiques JWKS du fournisseur.
export function verifyJwt(token,jwks,{issuer,audience,nonce,now=Date.now(),leeway=60}={}){
 const parts=String(token||'').split('.');if(parts.length!==3)throw Error('Jeton PSC mal formé.');
 const header=JSON.parse(fromB64url(parts[0])),claims=JSON.parse(fromB64url(parts[1]));
 const algs={RS256:['RSA-SHA256',{}],PS256:['RSA-SHA256',{padding:6,saltLength:32}],ES256:['SHA256',{dsaEncoding:'ieee-p1363'}]};
 if(!algs[header.alg])throw Error('Algorithme de signature refusé : '+header.alg);
 const jwk=(jwks?.keys||[]).find(k=>(!header.kid||k.kid===header.kid)&&(!k.use||k.use==='sig'));if(!jwk)throw Error('Clé de signature PSC inconnue.');
 const [alg,opts]=algs[header.alg],verifier=createVerify(alg);verifier.update(parts[0]+'.'+parts[1]);
 if(!verifier.verify({key:createPublicKey({key:jwk,format:'jwk'}),...opts},fromB64url(parts[2])))throw Error('Signature du jeton PSC invalide.');
 const t=Math.floor(now/1000);
 if(issuer&&claims.iss!==issuer)throw Error('Émetteur du jeton PSC inattendu.');
 if(audience&&!(Array.isArray(claims.aud)?claims.aud.includes(audience):claims.aud===audience))throw Error('Jeton PSC destiné à un autre service.');
 if(typeof claims.exp==='number'&&claims.exp+leeway<t)throw Error('Jeton PSC expiré.');
 if(typeof claims.nbf==='number'&&claims.nbf-leeway>t)throw Error('Jeton PSC pas encore valide.');
 if(nonce!==undefined&&claims.nonce!==nonce)throw Error('Nonce PSC invalide (rejeu possible).');
 return claims;
}

// RPPS à partir des informations PSC : SubjectNameID « 8 » + 11 chiffres, sinon otherIds d'origine RPPS.
export function rppsFrom(userinfo){
 const id=String(userinfo?.SubjectNameID||'');if(/^81\d{10}$/.test(id))return id.slice(1);
 const other=(userinfo?.otherIds||[]).find(o=>/rpps/i.test(String(o?.origine||o?.origin||''))&&/^1\d{10}$/.test(String(o?.identifiant||o?.id||'')));
 return other?String(other.identifiant||other.id):'';
}

export function createPsc({env=process.env,baseUrl,secret,fetchImpl=globalThis.fetch,now=()=>Date.now()}){
 const cfg=pscConfig(env);let discovery=null,jwks=null,loadedAt=0;
 const enabled=()=>cfg.mode!=='simulation'&&cfg.ready;
 async function getJson(url,init){const r=await fetchImpl(url,{...init,signal:AbortSignal.timeout(15000)});const type=r.headers.get('content-type')||'',text=await r.text();if(!r.ok)throw Error('Pro Santé Connect a répondu '+r.status+'.');return type.includes('jwt')?{jwt:text.trim()}:JSON.parse(text)}
 async function meta(){
  if(discovery&&now()-loadedAt<3600000)return discovery;
  discovery=await getJson(cfg.discoveryUrl);jwks=await getJson(discovery.jwks_uri);loadedAt=now();return discovery;
 }
 // État signé (cookie court) : state, nonce et vérificateur PKCE, liés par HMAC au secret de session.
 const sign=v=>createHmac('sha256',secret).update('psc:'+v).digest('base64url');
 function packState(o){const v=b64url(JSON.stringify(o));return v+'.'+sign(v)}
 function unpackState(raw){const [v,s]=String(raw||'').split('.');if(!v||!s)return null;const a=Buffer.from(sign(v)),b=Buffer.from(s);if(a.length!==b.length||!timingSafeEqual(a,b))return null;const o=JSON.parse(fromB64url(v));return o.exp>now()?o:null}
 const redirectUri=baseUrl+'/auth/psc/callback';

 async function start(){
  requireReady(cfg);const m=await meta(),state=b64url(randomBytes(24)),nonce=b64url(randomBytes(24)),verifier=b64url(randomBytes(32));
  const url=new URL(m.authorization_endpoint);
  for(const [k,v] of Object.entries({response_type:'code',client_id:cfg.values.PSC_CLIENT_ID,redirect_uri:redirectUri,scope:'openid scope_all',acr_values:'eidas1',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return {location:url.toString(),cookie:packState({state,nonce,verifier,exp:now()+10*60000})};
 }
 // Retour de PSC : échange du code, vérification de l'ID Token, lecture du userinfo, extraction du RPPS.
 async function callback(params,stateCookie){
  requireReady(cfg);const saved=unpackState(stateCookie);
  if(params.get('error'))throw Error('Connexion Pro Santé Connect interrompue ('+String(params.get('error')).slice(0,60)+').');
  if(!saved||params.get('state')!==saved.state)throw Error('Session de connexion expirée. Recommencez.');
  const m=await meta(),code=params.get('code');if(!code)throw Error('Code d’autorisation absent.');
  const basic='Basic '+Buffer.from(encodeURIComponent(cfg.values.PSC_CLIENT_ID)+':'+encodeURIComponent(cfg.values.PSC_CLIENT_SECRET)).toString('base64');
  const tokens=await getJson(m.token_endpoint,{method:'POST',headers:{Authorization:basic,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:saved.verifier})});
  const idClaims=verifyJwt(tokens.id_token,jwks,{issuer:m.issuer,audience:cfg.values.PSC_CLIENT_ID,nonce:saved.nonce,now:now()});
  let info=await getJson(m.userinfo_endpoint,{headers:{Authorization:'Bearer '+tokens.access_token,Accept:'application/json, application/jwt'}});
  if(info.jwt)info=verifyJwt(info.jwt,jwks,{issuer:m.issuer,audience:cfg.values.PSC_CLIENT_ID,now:now()});
  if(info.sub&&idClaims.sub&&info.sub!==idClaims.sub)throw Error('Identité PSC incohérente entre ID Token et userinfo.');
  return {rpps:rppsFrom(info),idToken:tokens.id_token,authLevel:String(info.auth_level||idClaims.acr||''),name:[info.given_name,info.family_name].filter(Boolean).join(' ')};
 }
 async function logoutUrl(idToken){
  if(!enabled()||!idToken)return null;const m=await meta();if(!m.end_session_endpoint)return null;
  const url=new URL(m.end_session_endpoint);url.searchParams.set('id_token_hint',idToken);url.searchParams.set('post_logout_redirect_uri',baseUrl+'/login');return url.toString();
 }
 return {cfg,enabled,start,callback,logoutUrl,unpackState};
}

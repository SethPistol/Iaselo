// Double authentification par code à usage unique (TOTP, RFC 6238 : 6 chiffres, 30 secondes, HMAC-SHA1),
// compatible avec toute application d'authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…).
// Exigée pour toute connexion par mot de passe en production ; Pro Santé Connect en est dispensé (déjà forte).
import {createHmac,randomBytes} from 'node:crypto';import {createRequire} from 'node:module';
const qrcode=createRequire(import.meta.url)('./vendor/qrcode.cjs');
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret(){const bytes=randomBytes(20);let bits='',out='';for(const b of bytes)bits+=b.toString(2).padStart(8,'0');for(let i=0;i+5<=bits.length;i+=5)out+=B32[parseInt(bits.slice(i,i+5),2)];return out}
function decode(secret){let bits='';for(const c of secret.replace(/[\s=]/g,'').toUpperCase()){const v=B32.indexOf(c);if(v<0)throw Error('Secret invalide');bits+=v.toString(2).padStart(5,'0')}const out=[];for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out)}
export function codeAt(secret,step){const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',decode(secret)).update(msg).digest(),o=h[h.length-1]&15;return String(((h.readUInt32BE(o)&0x7fffffff)%1e6)).padStart(6,'0')}
export const stepNow=(now=Date.now())=>Math.floor(now/30000);
// Renvoie le pas accepté (fenêtre ±1, soit ±30 s de décalage d'horloge) ou 0. Un pas déjà utilisé est refusé (rejeu).
export function verify(secret,code,lastStep=0,now=Date.now()){
 const c=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(c)||!secret)return 0;const s=stepNow(now);
 for(const step of [s-1,s,s+1])if(step>Number(lastStep||0)&&codeAt(secret,step)===c)return step;return 0;
}
export function otpauthUri(secret,email,issuer='IASELO'){return 'otpauth://totp/'+encodeURIComponent(issuer+':'+email)+'?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30'}
export function qrSvg(text){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:5,margin:4,scalable:true})}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mfaPage({message='',name='',enroll=false,secret='',email=''}={}){
 const groupes=secret.match(/.{1,4}/g)?.join(' ')||'';
 return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Double authentification · IASELO</title><link rel="icon" type="image/png" href="/assets/marque/favicon.png"><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F7F8;color:#0F2A33;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(440px,calc(100% - 32px));background:#fff;border:1px solid #D8E2E5;border-radius:16px;padding:28px;box-shadow:0 8px 30px rgba(15,42,51,.08)}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 14px;color:#33505A}.qr{display:block;width:200px;height:200px;margin:8px auto 12px}.qr svg{width:100%;height:100%}
code{display:block;text-align:center;font:600 15px/1.6 ui-monospace,monospace;background:#EEF4F5;border-radius:8px;padding:8px;letter-spacing:.06em;word-break:break-all}
label{display:block;font-weight:600;margin:16px 0 6px}input{box-sizing:border-box;width:100%;font:600 24px/1 ui-monospace,monospace;letter-spacing:.3em;text-align:center;padding:12px;border:1px solid #9FB6BD;border-radius:10px}
button{margin-top:16px;width:100%;padding:13px;border:0;border-radius:10px;background:#0F4D5C;color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer}.link{background:none;color:#0F4D5C;text-decoration:underline;padding:8px;margin-top:6px}
.error{padding:12px 14px;border-radius:12px;background:#FDECEC;color:#8A1C1C;margin-bottom:14px}
@media (prefers-color-scheme:dark){body{background:#0B1B20;color:#E6EEF0}main{background:#11262D;border-color:#24414A}p{color:#B5C7CC}code{background:#183039;color:#E6EEF0}input{background:#0B1B20;color:#E6EEF0;border-color:#3B5B65}.error{background:#3A1717;color:#F6C9C9}.link{color:#8FD0DE}}
</style></head><body><main>
<h1>Double authentification</h1>
${message?`<p class="error" role="alert">${esc(message)}</p>`:''}
${enroll?`<p>${esc(name)}, pour protéger les dossiers patients, chaque connexion par mot de passe demande désormais un code à usage unique.</p>
<p><b>1.</b> Installez une application d'authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator ou FreeOTP).</p>
<p><b>2.</b> Scannez ce code, ou saisissez la clé ci-dessous :</p>
<div class="qr" aria-hidden="true">${qrSvg(otpauthUri(secret,email))}</div><code aria-label="Clé à saisir dans l'application">${esc(groupes)}</code>
<p style="margin-top:14px"><b>3.</b> Saisissez le code à 6 chiffres affiché par l'application.</p>`:`<p>${esc(name)}, saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>`}
<form method="post" action="/auth/mfa"><label for="code">Code à 6 chiffres</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus><button>${enroll?'Activer et continuer':'Valider'}</button></form>
<form method="post" action="/auth/logout"><button class="link">Annuler et se déconnecter</button></form>
<p style="margin-top:14px;font-size:14px">Téléphone perdu ou changé ? Demandez à l'administrateur de réinitialiser votre double authentification.</p>
</main></body></html>`;
}

// MSSanté : envoi de la lettre de liaison depuis la boîte organisationnelle (ou applicative) de l'établissement,
// ouverte chez un opérateur MSSanté référencé par l'ANS. IASELO agit comme « client de messagerie »
// (référentiel #2 Clients de messageries MSSanté) : il dépose le message chez l'opérateur en SMTP sécurisé ;
// c'est l'opérateur qui l'achemine dans l'espace de confiance.
//
// Variables (Clever Cloud) :
//   INTEROP_MSSANTE_MODE     simulation | test (boîtes de test de l'opérateur) | production
//   MSSANTE_SMTP_HOST, MSSANTE_SMTP_PORT (465 TLS implicite ; 587 STARTTLS)
//   MSSANTE_BAL              adresse de la boîte de l'établissement (…@<domaine>.mssante.fr)
//   MSSANTE_CERT_P12_BASE64 + MSSANTE_CERT_PASSWORD  si l'opérateur authentifie par certificat (BAL applicative)
//   ou MSSANTE_SMTP_USER + MSSANTE_SMTP_PASSWORD     si l'opérateur fournit un compte
//   MSSANTE_ALLOWED_RECIPIENTS  obligatoire en test : seules adresses de test autorisées
//   INTEROP_MSSANTE_AUTORISATION  production : référence du contrat avec l'opérateur
// Les modalités exactes (port, authentification, API LPS éventuelle) dépendent de l'opérateur choisi.
import net from 'node:net';import tls from 'node:tls';import {randomUUID} from 'node:crypto';
import {connectorConfig,requireReady} from './modes.mjs';
import {clientCertificate} from './transport.mjs';

export const isMssanteAddress=a=>/^[^\s@<>]+@([a-z0-9-]+\.)*mssante\.fr$/i.test(String(a||''));
// Messagerie citoyenne : adresse du patient dans Mon espace santé, construite à partir de l'INS qualifiée.
export const patientAddress=ins=>{if(!/^\d{15}$/.test(ins?.matricule||''))throw Error('INS qualifiée requise pour écrire au patient via Mon espace santé.');return ins.matricule+'@patient.mssante.fr'};

export function mssanteConfig(env=process.env){
 const cfg=connectorConfig('mssante',['MSSANTE_SMTP_HOST','MSSANTE_BAL'],env);
 cfg.certificate=clientCertificate('MSSANTE',env);cfg.port=Number(env.MSSANTE_SMTP_PORT||465);
 cfg.auth=env.MSSANTE_SMTP_USER?{user:env.MSSANTE_SMTP_USER,pass:env.MSSANTE_SMTP_PASSWORD||''}:null;
 cfg.allowed=String(env.MSSANTE_ALLOWED_RECIPIENTS||'').split(/[,;\s]+/).map(s=>s.toLowerCase()).filter(Boolean);
 if(cfg.mode!=='simulation'){
  if(!cfg.certificate&&!cfg.auth)cfg.missing.push('MSSANTE_CERT_P12_BASE64 ou MSSANTE_SMTP_USER');
  if(cfg.values.MSSANTE_BAL&&!isMssanteAddress(cfg.values.MSSANTE_BAL))cfg.missing.push('MSSANTE_BAL (adresse …mssante.fr)');
  if(cfg.mode==='test'&&!cfg.allowed.length)cfg.missing.push('MSSANTE_ALLOWED_RECIPIENTS');
 }
 cfg.ready=cfg.mode==='simulation'||!cfg.missing.length;return cfg;
}

const enc=s=>/^[\x20-\x7e]*$/.test(s)?s:'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=';
const wrap=b64=>b64.replace(/.{1,76}/g,'$&\r\n');
export function buildMime({from,to,subject,text,attachments=[],messageId='<'+randomUUID()+'@iaselo>',date=new Date()}){
 const boundary='iaselo-'+randomUUID();
 const head=['From: '+from,'To: '+to.join(', '),'Subject: '+enc(subject),'Date: '+date.toUTCString(),'Message-ID: '+messageId,'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"'];
 const parts=['--'+boundary,'Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',wrap(Buffer.from(text).toString('base64'))];
 for(const a of attachments)parts.push('--'+boundary,'Content-Type: '+a.contentType+'; name="'+a.filename+'"','Content-Transfer-Encoding: base64','Content-Disposition: attachment; filename="'+a.filename+'"','',wrap(a.base64));
 parts.push('--'+boundary+'--','');
 return head.join('\r\n')+'\r\n\r\n'+parts.join('\r\n');
}

// Client SMTP minimal (RFC 5321) : TLS implicite ou STARTTLS, AUTH PLAIN facultatif, certificat client facultatif.
export function smtpSend({host,port,certificate,auth,from,to,data,timeoutMs=30000,connect}){
 return new Promise((resolve,reject)=>{
  const tlsOpts={servername:host,minVersion:'TLSv1.2',rejectUnauthorized:true,...(certificate||{})};
  let socket=connect?connect():port===465?tls.connect({host,port,...tlsOpts}):net.connect({host,port});
  let buffer='',step=0,secured=port===465;const fail=e=>{try{socket.destroy()}catch{}reject(e)};
  const timer=setTimeout(()=>fail(Error('Opérateur MSSanté injoignable (délai dépassé).')),timeoutMs);
  const send=l=>socket.write(l+'\r\n');
  const script=()=>[
   [220,()=>send('EHLO iaselo')],
   ...(secured?[]:[[250,()=>send('STARTTLS')],[220,()=>{socket.removeAllListeners('data');socket=tls.connect({socket,...tlsOpts},()=>send('EHLO iaselo'));socket.on('data',onData);socket.on('error',fail)}]]),
   ...(auth?[[250,()=>send('AUTH PLAIN '+Buffer.from('\0'+auth.user+'\0'+auth.pass).toString('base64'))],[235,()=>send('MAIL FROM:<'+from+'>')]]:[[250,()=>send('MAIL FROM:<'+from+'>')]]),
   ...to.map((r,i)=>[250,()=>send('RCPT TO:<'+r+'>')]),
   [250,()=>send('DATA')],[354,()=>{socket.write(data.replace(/\r\n\./g,'\r\n..')+'\r\n.\r\n')}],
   [250,()=>{send('QUIT');clearTimeout(timer);resolve({accepted:to})}]
  ];
  let steps=script();
  function onData(chunk){buffer+=chunk.toString('utf8');let i;while((i=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+2);if(/^\d{3}-/.test(line))continue;const code=Number(line.slice(0,3));if(step>=steps.length)return;const [want,act]=steps[step];if(code!==want){clearTimeout(timer);return fail(Error('Opérateur MSSanté : réponse '+line.slice(0,120)))}step++;act()}}
  socket.on('data',onData);socket.on('error',e=>{clearTimeout(timer);fail(Error('Opérateur MSSanté : '+(e.code||e.message)))});
 });
}

export function createMssante({env=process.env,transport=smtpSend}={}){
 const cfg=mssanteConfig(env);
 async function send({to,subject,text,attachments}){
  requireReady(cfg);const list=[...new Set(to.map(a=>String(a).trim().toLowerCase()))];
  const bad=list.filter(a=>!isMssanteAddress(a));if(bad.length)throw Error('Destinataire hors espace de confiance MSSanté : '+bad.join(', '));
  if(cfg.mode==='test'){const off=list.filter(a=>!cfg.allowed.includes(a));if(off.length)throw Error('Mode test : destinataire non autorisé ('+off.length+').')}
  const data=buildMime({from:cfg.values.MSSANTE_BAL,to:list,subject,text,attachments});
  await transport({host:cfg.values.MSSANTE_SMTP_HOST,port:cfg.port,certificate:cfg.certificate,auth:cfg.auth,from:cfg.values.MSSANTE_BAL,to:list,data});
  return {mode:cfg.mode,to:list};
 }
 return {cfg,send};
}

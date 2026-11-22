// Transport HTTPS avec authentification mutuelle (TLS client) par certificat IGC-Santé.
// Les téléservices INSi et DMP authentifient le logiciel par un certificat logiciel de personne morale
// (offre « ORG », usage AUTH_CLI) délivré par l'ANS à l'établissement.
//
// Le certificat est fourni par variables d'environnement, jamais dans le dépôt :
//   <PREFIX>_CERT_P12_BASE64 + <PREFIX>_CERT_PASSWORD   (fichier .p12 encodé en base64)
//   ou <PREFIX>_CERT_PEM + <PREFIX>_KEY_PEM              (PEM, « \n » acceptés)
//   <PREFIX>_CA_PEM (facultatif) : chaîne de confiance IGC-Santé si elle n'est pas dans le magasin système.
import https from 'node:https';
const pem=v=>String(v||'').replace(/\\n/g,'\n');
export function clientCertificate(prefix,env=process.env){
 const p12=env[prefix+'_CERT_P12_BASE64'],cert=env[prefix+'_CERT_PEM'],key=env[prefix+'_KEY_PEM'],ca=env[prefix+'_CA_PEM'];
 const out=ca?{ca:pem(ca)}:{};
 if(p12)return {...out,pfx:Buffer.from(p12,'base64'),passphrase:env[prefix+'_CERT_PASSWORD']||''};
 if(cert&&key)return {...out,cert:pem(cert),key:pem(key)};
 return null;
}
export function hasCertificate(prefix,env=process.env){return !!clientCertificate(prefix,env)}

// POST avec délai maximal, TLS ≥ 1.2, vérification du certificat serveur toujours active.
export function postMutualTls(url,{body,headers={},certificate,timeoutMs=20000,request=https.request}){
 const target=new URL(url);if(target.protocol!=='https:')return Promise.reject(Error('HTTPS obligatoire : '+target.origin));
 if(!certificate)return Promise.reject(Error('Certificat client IGC-Santé manquant.'));
 return new Promise((resolve,reject)=>{
  const req=request(target,{method:'POST',headers:{'Content-Length':Buffer.byteLength(body),...headers},minVersion:'TLSv1.2',rejectUnauthorized:true,...certificate,timeout:timeoutMs},res=>{
   const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>8*1024*1024){req.destroy(Error('Réponse trop volumineuse.'));return}chunks.push(c)});
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('timeout',()=>req.destroy(Error('Le service national ne répond pas (délai dépassé).')));
  req.on('error',reject);req.end(body);
 });
}

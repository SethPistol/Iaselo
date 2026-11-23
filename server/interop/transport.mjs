// Transport HTTPS avec authentification mutuelle (TLS client) par certificat IGC-Santé.
// Les téléservices INSi et DMP authentifient le logiciel par un certificat logiciel de personne morale
// (offre « ORG », usage AUTH_CLI) délivré par l'ANS à l'établissement.
//
// Le certificat est fourni par variables d'environnement, jamais dans le dépôt :
//   <PREFIX>_CERT_P12_BASE64 + <PREFIX>_CERT_PASSWORD   (fichier .p12 encodé en base64)
//   ou <PREFIX>_CERT_PEM + <PREFIX>_KEY_PEM              (PEM, « \n » acceptés)
//   <PREFIX>_CA_PEM (facultatif) : chaîne de confiance IGC-Santé si elle n'est pas dans le magasin système.
import https from 'node:https';import tls from 'node:tls';
const pem=v=>String(v||'').replace(/\\n/g,'\n');
export function clientCertificate(prefix,env=process.env){
 const p12=env[prefix+'_CERT_P12_BASE64'],cert=env[prefix+'_CERT_PEM'],key=env[prefix+'_KEY_PEM'],ca=env[prefix+'_CA_PEM'];
 const out=ca?{ca:pem(ca)}:{};
 if(p12)return {...out,pfx:Buffer.from(p12,'base64'),passphrase:env[prefix+'_CERT_PASSWORD']||''};
 if(cert&&key)return {...out,cert:pem(cert),key:pem(key)};
 return null;
}
export function hasCertificate(prefix,env=process.env){return !!clientCertificate(prefix,env)}
// Diagnostic d'un certificat fourni : lisible (mot de passe correct), titulaire, émetteur, date d'expiration.
// Rien du certificat ni de la clé n'est renvoyé, seulement ces informations publiques.
export function diagnosticCertificat(prefix,env=process.env,now=Date.now()){
 const c=clientCertificate(prefix,env);if(!c)return {prefix,present:false};
 try{
  const ctx=tls.createSecureContext(c),sock=new tls.TLSSocket(null,{secureContext:ctx}),x=sock.getCertificate();sock.destroy();
  if(!x||!x.valid_to)return {prefix,present:true,lisible:false,erreur:'Aucun certificat dans le fichier.'};
  const fin=new Date(x.valid_to),jours=Math.floor((fin-now)/86400000);
  return {prefix,present:true,lisible:true,titulaire:String(x.subject?.CN||'').slice(0,120),organisation:String(x.subject?.O||'').slice(0,120),emetteur:String(x.issuer?.CN||x.issuer?.O||'').slice(0,120),expireLe:fin.toISOString().slice(0,10),joursRestants:jours,expire:jours<0,igcSante:/IGC-?SANTE|ASIP|ANS\b/i.test(JSON.stringify(x.issuer||{}))};
 }catch(e){return {prefix,present:true,lisible:false,erreur:/mac verify|bad decrypt/i.test(e.message)?'Mot de passe du certificat incorrect.':'Certificat illisible : '+String(e.message).slice(0,120)}}
}

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

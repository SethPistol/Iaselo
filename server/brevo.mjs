// Envoi d’e-mails et de SMS transactionnels via Brevo (https://developers.brevo.com).
// La clé d’API est lue dans les variables d’environnement (BREVO_API_KEY) : elle ne doit
// jamais figurer dans le code, le dépôt ni les journaux.
//
// Variables :
//   BREVO_API_KEY             clé d’API Brevo (obligatoire pour envoyer)
//   BREVO_SENDER_EMAIL        adresse d’expédition validée dans Brevo (e-mail)
//   BREVO_SENDER_NAME         nom affiché de l’expéditeur (défaut : ETABLISSEMENT_NOM)
//   BREVO_SMS_SENDER          nom d’expéditeur SMS, 3 à 11 lettres/chiffres (SMS)
//   ETABLISSEMENT_NOM         nom de l’établissement cité dans les messages
//   MESSAGING_ALLOWED_RECIPIENTS  liste (virgules) des seuls destinataires autorisés.
//                             Obligatoire en recette : on n’écrit jamais à un numéro fictif
//                             qui pourrait appartenir à une vraie personne.
const API='https://api.brevo.com/v3';
const clean=s=>String(s||'').trim();
// Comparaison tolérante : guillemets, espaces, casse, 06… / 0033… / +33…
export function normalizeRecipient(value){
 const v=clean(value).replace(/^["'«\s]+|["'»\s]+$/g,'').toLowerCase();if(!v)return '';
 if(v.includes('@'))return v.replace(/\s/g,'');
 let n=v.replace(/[^\d+]/g,'');if(n.startsWith('00'))n='+'+n.slice(2);if(/^0\d{9}$/.test(n))n='+33'+n.slice(1);if(n.startsWith('+330'))n='+33'+n.slice(4);if(/^33\d{9}$/.test(n))n='+'+n;return n;
}
export function brevoMessaging(env=process.env,fetchImpl=globalThis.fetch){
 const key=clean(env.BREVO_API_KEY),senderEmail=clean(env.BREVO_SENDER_EMAIL),establishment=clean(env.ETABLISSEMENT_NOM)||'Clinique du Trocadéro';
 const senderName=clean(env.BREVO_SENDER_NAME)||establishment,smsSender=clean(env.BREVO_SMS_SENDER).replace(/[^A-Za-z0-9]/g,'').slice(0,11);
 const recette=env.IASELO_RECETTE==='true',allowList=clean(env.MESSAGING_ALLOWED_RECIPIENTS).split(/[,;\n]+/).map(normalizeRecipient).filter(Boolean);
 const channels={email:!!(key&&senderEmail),sms:!!(key&&smsSender.length>=3)};
 function refusal(to){
  if(recette&&!allowList.length)return 'Serveur de recette : aucun destinataire de test autorisé (MESSAGING_ALLOWED_RECIPIENTS).';
  if(allowList.length&&!allowList.includes(normalizeRecipient(to)))return 'Destinataire hors de la liste de test autorisée ('+allowList.length+' destinataire'+(allowList.length>1?'s':'')+' dans MESSAGING_ALLOWED_RECIPIENTS).';
  return '';
 }
 async function call(path,payload){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetchImpl(API+path,{method:'POST',headers:{'api-key':key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   let data={};try{data=await r.json()}catch{}
   if(!r.ok){const error=Error(r.status===401?'Clé Brevo refusée : vérifiez BREVO_API_KEY.':/credit/i.test(String(data.code||data.message))?'Crédits SMS Brevo insuffisants.':'Brevo a refusé l’envoi ('+r.status+(data.code?' · '+String(data.code).slice(0,60):'')+').');error.provider=true;throw error}
   return String(data.messageId||data.messageIds?.[0]||'');
  }catch(e){if(e.provider)throw e;const error=Error(e.name==='AbortError'?'Brevo ne répond pas. Réessayez.':'Brevo injoignable. Réessayez.');error.provider=true;throw error}
  finally{clearTimeout(timer)}
 }
 return {
  channels,establishment,
  refusal,
  async email({to,name,subject,text,html}){
   if(!channels.email)throw Error('Envoi d’e-mail non configuré (BREVO_API_KEY, BREVO_SENDER_EMAIL).');const no=refusal(to);if(no)throw Error(no);
   return call('/smtp/email',{sender:{name:senderName,email:senderEmail},to:[{email:to,...(name?{name}:{})}],subject,textContent:text,htmlContent:html,tags:['iaselo-questionnaire']});
  },
  async sms({to,content}){
   if(!channels.sms)throw Error('Envoi de SMS non configuré (BREVO_API_KEY, BREVO_SMS_SENDER).');const no=refusal(to);if(no)throw Error(no);
   return call('/transactionalSMS/send',{sender:smsSender,recipient:String(to).replace(/^\+/,''),content,type:'transactional',tag:'iaselo-questionnaire'});
  }
 };
}

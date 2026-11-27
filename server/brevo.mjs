// Envoi d’e-mails et de SMS transactionnels via Brevo (https://developers.brevo.com).
// Une seule variable est nécessaire, réglée une fois pour toutes dans Clever Cloud :
//   BREVO_API_KEY             clé d’API Brevo. Jamais dans le code, le dépôt ni les journaux.
// Tout le reste est déduit automatiquement :
//   - adresse d’expédition : la première adresse validée dans le compte Brevo
//     (BREVO_SENDER_EMAIL, facultatif, pour en imposer une) ;
//   - nom d’expéditeur SMS : déduit du nom de l’établissement (BREVO_SMS_SENDER, facultatif) ;
//   - ETABLISSEMENT_NOM, BREVO_SENDER_NAME : facultatifs.
// MESSAGING_ALLOWED_RECIPIENTS n’est plus lue : tout patient peut recevoir (recette : messages « [TEST] »).
// Serveur de recette : les messages sont préfixés « [TEST] ».
const API='https://api.brevo.com/v3';
// Clé « restreinte » sans la portée Compte : Brevo refuse /account et /senders (403).
export const SCOPE_MESSAGE='La clé Brevo n’a pas le droit de lire le compte. Dans Brevo › Paramètres › SMTP et API › clé « Iaselo » : ligne « Compte », choisir « Lues », puis enregistrer.';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const clean=s=>String(s||'').trim();
// Comparaison tolérante : guillemets, espaces, casse, 06… / 0033… / +33…
export function normalizeRecipient(value){
 const v=clean(value).replace(/^["'«\s]+|["'»\s]+$/g,'').toLowerCase();if(!v)return '';
 if(v.includes('@'))return v.replace(/\s/g,'');
 let n=v.replace(/[^\d+]/g,'');if(n.startsWith('00'))n='+'+n.slice(2);if(/^0\d{9}$/.test(n))n='+33'+n.slice(1);if(n.startsWith('+330'))n='+33'+n.slice(4);if(/^33\d{9}$/.test(n))n='+'+n;return n;
}
// Un SMS ne peut partir que vers un mobile : en France, +336 ou +337 suivi de 8 chiffres.
export function smsRecipientError(to){
 const n=normalizeRecipient(to);
 if(!/^\+\d{8,15}$/.test(n))return 'Numéro de téléphone invalide.';
 if(n.startsWith('+33')&&!/^\+33[67]\d{8}$/.test(n))return 'Ce numéro n’est pas un mobile (06 ou 07) : un SMS ne peut pas y être envoyé.';
 return '';
}
const smsFailed={hardBounces:'numéro inexistant ou hors service',softBounces:'téléphone injoignable (éteint, hors réseau ou saturé)',bounces:'non délivré par l’opérateur',blocked:'numéro bloqué par Brevo (désinscrit ou liste noire)',rejected:'refusé par l’opérateur',skipped:'non envoyé par Brevo',unsubscription:'le destinataire a demandé à ne plus recevoir de SMS'};
const mailFailed={hardBounces:'adresse inexistante',softBounces:'boîte pleine ou serveur indisponible',bounces:'non délivré',invalid:'adresse invalide',blocked:'adresse bloquée par Brevo',error:'erreur d’envoi chez Brevo'};
export function deliveryState(channel,events=[]){
 const failed=channel==='sms'?smsFailed:mailFailed,names=events.map(e=>e.event);
 const bad=events.find(e=>failed[e.event]);
 if(names.some(n=>n==='delivered'||n==='opened'||n==='clicks'||n==='loadedByProxy'))return {state:'delivered'};
 if(bad)return {state:'failed',reason:failed[bad.event]+(bad.reason?' ('+String(bad.reason).slice(0,80)+')':'')};
 return {state:'pending'};
}
export function smsSenderFrom(name){
 const words=clean(name).normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^A-Za-z0-9]+/).filter(Boolean);
 const last=(words.filter(w=>!/^(clinique|centre|hopital|du|de|la|le|les|des|d|l)$/i.test(w)).pop()||'IASELO').toUpperCase().slice(0,11);
 return last.length>=3?last:'IASELO';
}
// Traduit une réponse d’erreur Brevo en consigne compréhensible.
export function brevoError(status,data={}){
 const text=String(data.message||'')+' '+String(data.code||'');
 if(/\bip\b|ip address|adresse ip/i.test(text))return 'Brevo bloque l’adresse du serveur. Dans Brevo : Paramètres › Sécurité › Adresses IP autorisées, désactivez le blocage des adresses IP inconnues.';
 if(status===401||/unauthori[sz]ed|api-key|authentication/i.test(text))return 'Clé Brevo refusée. Créez une nouvelle clé API dans Brevo et remplacez BREVO_API_KEY dans Clever Cloud.';
 if(/credit/i.test(text))return 'Plus de crédits SMS dans Brevo. Rechargez des crédits SMS.';
 if(/sender/i.test(text))return 'Expéditeur refusé par Brevo. Pour les e-mails, validez une adresse dans Brevo › Expéditeurs et domaines.';
 if(/recipient|mobile|phone|number/i.test(text))return 'Numéro ou adresse refusé par Brevo. Vérifiez les coordonnées du patient.';
 if(status===403)return 'Compte Brevo pas encore activé pour cet envoi (validation du compte en cours chez Brevo).';
 return 'Brevo a refusé l’envoi'+(data.message?' : '+String(data.message).slice(0,120):' (erreur '+status+')')+'.';
}
export function brevoMessaging(env=process.env,fetchImpl=globalThis.fetch){
 const key=clean(env.BREVO_API_KEY),establishment=clean(env.ETABLISSEMENT_NOM)||'Clinique du Trocadéro';
 const senderName=clean(env.BREVO_SENDER_NAME)||establishment,smsSender=clean(env.BREVO_SMS_SENDER).replace(/[^A-Za-z0-9]/g,'').slice(0,11)||smsSenderFrom(establishment);
 const recette=env.IASELO_RECETTE==='true';
 const channels={email:!!key,sms:!!key&&smsSender.length>=3};
 let senderEmail=clean(env.BREVO_SENDER_EMAIL),statusCache=null;
 // Audit du 27/11 : plafonds d'envoi, contre l'envoi en masse depuis un compte volé (harcèlement d'un numéro,
 // crédits SMS épuisés). Par destinataire : MESSAGING_MAX_PAR_DESTINATAIRE par heure (10 par défaut). Pour tout le
 // serveur : MESSAGING_MAX_PAR_HEURE (400 par défaut, 100 en recette). Les envois normaux restent très en dessous.
 const parDest=Math.max(1,Number(env.MESSAGING_MAX_PAR_DESTINATAIRE)||10),parHeure=Math.max(1,Number(env.MESSAGING_MAX_PAR_HEURE)||(recette?100:400)),envois=[];
 function refusal(to){
  const now=Date.now(),dest=normalizeRecipient(to);while(envois.length&&now-envois[0].at>3600000)envois.shift();
  if(envois.length>=parHeure)return 'Plafond d’envois atteint pour cette heure ('+parHeure+'). Réessayez plus tard ou prévenez l’administrateur.';
  if(dest&&envois.filter(e=>e.dest===dest).length>=parDest)return 'Trop de messages envoyés à ce destinataire dans l’heure. Réessayez plus tard.';
  envois.push({at:now,dest});return '';
 }
 // Un nouvel essai si Brevo est saturé ou momentanément injoignable (jamais après un délai
 // dépassé : le message a pu partir, on évite le doublon).
 async function call(method,path,payload,attempt=1){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetchImpl(API+path,{method,headers:{'api-key':key,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:controller.signal});
   let data={};try{data=await r.json()}catch{}
   if(!r.ok){if(attempt===1&&[429,502,503,504].includes(r.status)){clearTimeout(timer);await pause(1500);return call(method,path,payload,2)}const error=Error(brevoError(r.status,data));error.provider=true;error.status=r.status;throw error}
   return data;
  }catch(e){if(e.provider)throw e;if(attempt===1&&e.name!=='AbortError'){clearTimeout(timer);await pause(1500);return call(method,path,payload,2)}const error=Error(e.name==='AbortError'?'Brevo ne répond pas. Réessayez dans un instant.':'Brevo injoignable depuis le serveur. Réessayez dans un instant.');error.provider=true;throw error}
  finally{clearTimeout(timer)}
 }
 async function activeSenders(){let data;try{data=await call('GET','/senders')}catch(e){if(e.status===401||e.status===403)throw Error(SCOPE_MESSAGE);throw e}return (data.senders||[]).filter(s=>s.active!==false&&s.email)}
 async function sender(){
  if(senderEmail)return senderEmail;
  const first=(await activeSenders())[0];if(!first)throw Error('Aucune adresse d’expédition validée dans Brevo. Ajoutez-en une dans Brevo › Expéditeurs et domaines.');
  return senderEmail=first.email;
 }
 const tagged=s=>recette?'[TEST] '+s:s;
 return {
  channels,establishment,recette,
  refusal,
  async email({to,name,subject,text,html,tag='iaselo-questionnaire'}){
   if(!key)throw Error('Envoi non configuré : clé Brevo absente (BREVO_API_KEY).');const no=refusal(to);if(no)throw Error(no);
   const data=await call('POST','/smtp/email',{sender:{name:senderName,email:await sender()},to:[{email:to,...(name?{name}:{})}],subject:tagged(subject),textContent:text,htmlContent:html,tags:[tag]});
   return String(data.messageId||data.messageIds?.[0]||'');
  },
  async sms({to,content,tag='iaselo-questionnaire'}){
   if(!channels.sms)throw Error('Envoi non configuré : clé Brevo absente (BREVO_API_KEY).');const no=refusal(to)||smsRecipientError(to);if(no)throw Error(no);to=normalizeRecipient(to);
   const data=await call('POST','/transactionalSMS/send',{sender:smsSender,recipient:String(to).replace(/^\+/,''),content:tagged(content),type:'transactional',tag});
   return String(data.messageId||'');
  },
  // Statut de délivrance d’un message déjà envoyé (référence Brevo).
  async delivery({channel,ref,to}){
   if(!key||!ref)return {state:'unknown'};
   const ev=channel==='sms'
    ?(await call('GET','/transactionalSMS/statistics/events?days=2&limit=100&sort=desc&phoneNumber='+encodeURIComponent(normalizeRecipient(to).replace(/^\+/,'')))).events||[]
    :(await call('GET','/smtp/statistics/events?days=2&limit=50&messageId='+encodeURIComponent(ref))).events||[];
   return deliveryState(channel,ev.filter(e=>String(e.messageId)===String(ref)));
  },
  // État lisible de la configuration, affiché dans l’application (aucun secret renvoyé).
  async status(){
   if(!key)return {ready:false,recette,message:'Clé Brevo absente. Ajoutez une fois la variable BREVO_API_KEY dans Clever Cloud, puis redémarrez.'};
   if(statusCache&&Date.now()-statusCache.at<60000)return statusCache.value;
   let value;
   try{
    let account=null,scopeError='';try{account=await call('GET','/account')}catch(e){if(e.status===401||e.status===403)scopeError=SCOPE_MESSAGE;else throw e}
    const plans=Array.isArray(account?.plan)?account.plan:[],smsPlan=plans.find(p=>p.type==='sms'),credits=account?(smsPlan?Number(smsPlan.credits)||0:0):null;
    let from=clean(env.BREVO_SENDER_EMAIL),emailError='';
    if(!from){try{from=(await activeSenders())[0]?.email||'';if(from)senderEmail=from;else emailError='Aucune adresse d’expédition validée dans Brevo (Brevo › Expéditeurs et domaines).'}catch(e){emailError=e.message}}
    const smsError=credits===null?'':credits>0?'':'Aucun crédit SMS dans Brevo.';
    value={ready:!emailError||!smsError,recette,...(scopeError?{warning:scopeError}:{}),email:{ok:!emailError,from,error:emailError},sms:{ok:!smsError,sender:smsSender,credits,error:smsError}};
   }catch(e){value={ready:false,recette,message:e.message}}
   statusCache={at:Date.now(),value};return value;
  }
 };
}

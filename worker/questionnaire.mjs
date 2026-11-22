const invitationJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const invitationHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
async function invitationBody(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>120000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
export async function patientQuestionnaireApi(request,env){
 try{
 const url=new URL(request.url);if(request.method!=='POST'||!['/api/questionnaire/submit','/api/questionnaire/resolve'].includes(url.pathname))return invitationJson({error:'Service inconnu.'},404);
 if(request.headers.get('Origin')!==url.origin)return invitationJson({error:'Origine refusée.'},403);
 const d=await invitationBody(request);if(typeof d.token!=='string'||!/^[a-f0-9]{64}$/.test(d.token))return invitationJson({error:'Invitation invalide.'},410);
 const hash=await invitationHash(d.token),at=new Date().toISOString(),row=await env.DB.prepare('SELECT * FROM questionnaire_invitations WHERE token_hash=? AND revoked=0 AND used_at IS NULL AND expires_at>?').bind(hash,at).first();
 if(!row)return invitationJson({error:'Invitation expirée, remplacée ou déjà utilisée.'},410);
 if(url.pathname.endsWith('/resolve'))return invitationJson({available:true,expiresAt:row.expires_at});
 if(d.confirmed!==true||!d.answers||typeof d.answers!=='object'||Array.isArray(d.answers)||Object.keys(d.answers).length>250)return invitationJson({error:'Réponses et confirmation requises.'},400);
 const keys=new Set('birthname firstname usename dob weight height operation date allergy allergyDetails operations anesthesia anesthesiaDetails nausea travel hospital hospitalDetails diseases other teeth stairs devices bleeding treatments tobacco cigarettes years alcohol drugs drugDetails questions signedDate signature'.split(' ')),answers=Object.create(null);
 for(const [key,value] of Object.entries(d.answers)){
  if(!keys.has(key))return invitationJson({error:'Champ de questionnaire inconnu.'},400);
  if(['diseases','devices','bleeding'].includes(key)){if(!Array.isArray(value)||value.length>40||value.some(x=>typeof x!=='string'||x.length>240))return invitationJson({error:'Réponse invalide.'},400);answers[key]=value;}
  else {if(typeof value!=='string'||value.length>8000)return invitationJson({error:'Réponse invalide.'},400);answers[key]=value.trim();}
 }
 if(!answers.birthname||!answers.firstname||!answers.dob||!answers.signature||!answers.signedDate)return invitationJson({error:'Complétez l’identité et la confirmation du questionnaire.'},400);
 const contactRow=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind('stay/'+row.stay_id+'/invitationContact').first(),contact=contactRow?JSON.parse(contactRow.data).contact:null;
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!contact||answers.dob!==contact.birthDate||norm(answers.firstname)!==norm(contact.firstName)||![answers.birthname,answers.usename].some(x=>norm(x)===norm(contact.lastName)))return invitationJson({error:'L’identité saisie ne correspond pas à cette invitation. Vérifiez-la avec la clinique.'},400);
 const key='stay/'+row.stay_id+'/questionnaire',old=await env.DB.prepare('SELECT revision FROM workspace_documents WHERE key=?').bind(key).first();if(old)return invitationJson({error:'Un questionnaire a déjà été reçu pour ce séjour.'},409);
 const op=crypto.randomUUID(),payload=JSON.stringify({answers,received:at,reviewed:false,source:'Invitation patient'});
 try{await env.DB.batch([
  env.DB.prepare('INSERT INTO workspace_write_checks(operation,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM questionnaire_invitations WHERE token_hash=? AND revoked=0 AND used_at IS NULL AND expires_at>?) THEN 1 ELSE 0 END)').bind(op,hash,at),
  env.DB.prepare('INSERT INTO workspace_documents(key,data,revision,actor,updated_at,operation,reason) VALUES(?,?,1,?,?,?,?,?)'.replace('1,?,?,?,?,?','1,?,?,?,?')).bind(key,payload,'patient-invitation',at,op,'Questionnaire reçu via une invitation à usage unique'),
  env.DB.prepare('UPDATE questionnaire_invitations SET used_at=? WHERE token_hash=?').bind(at,hash),
  env.DB.prepare('DELETE FROM workspace_write_checks WHERE operation=?').bind(op)
 ])}catch{return invitationJson({error:'Invitation déjà utilisée ou questionnaire reçu. Aucun nouvel envoi enregistré.'},409)}
 return invitationJson({received:true},201);
 }catch{return invitationJson({error:'Service questionnaire indisponible.'},503)}
}
export async function staffQuestionnaireApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/questionnaire/invite')return null;
 if(request.method!=='POST')return invitationJson({error:'Méthode refusée.'},405);
 const d=await invitationBody(request),key='stay/'+String(d.stay||'')+'/invitationContact';
 if(!acl.canRead(key)||!acl.keyWrite(key,null,{}))return invitationJson({error:'Invitation hors habilitation.'},403);
 if(d.confirmed!==true)return invitationJson({error:'Vérifiez l’identité et les coordonnées du destinataire.'},400);
 const saved=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();
 if(!saved||JSON.stringify(JSON.parse(saved.data).contact)!==JSON.stringify(d.contact))return invitationJson({error:'Enregistrez et confirmez les coordonnées avant de préparer le lien.'},409);
 if(await env.DB.prepare('SELECT key FROM workspace_documents WHERE key=?').bind('stay/'+d.stay+'/questionnaire').first())return invitationJson({error:'Un questionnaire a déjà été reçu pour ce séjour.'},409);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await invitationHash(token),at=new Date().toISOString(),expiresAt=new Date(Date.now()+48*3600000).toISOString();
 await env.DB.batch([env.DB.prepare('UPDATE questionnaire_invitations SET revoked=1 WHERE stay_id=? AND used_at IS NULL').bind(d.stay),env.DB.prepare('INSERT INTO questionnaire_invitations(token_hash,stay_id,created_by,created_at,expires_at) VALUES(?,?,?,?,?)').bind(hash,d.stay,acl.profile.user_id,at,expiresAt)]);
 await acl.log('questionnaire-invitation',key,'allowed','Lien préparé ; aucun message envoyé');
 return invitationJson({link:url.origin+'/patient.html#invitation='+token,expiresAt,delivery:'not-sent',access:'owner-private-prototype'},201);
}

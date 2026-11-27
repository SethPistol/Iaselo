// IASELO · identité de l'établissement de CETTE installation (27/11/2026, décision de Romain :
// une installation par établissement, base et adresse propres, cloisonnement total).
// L'administrateur règle le nom, les coordonnées, le FINESS et les logos dans « Établissement ».
// - Les textes de l'interface (pages, documents, SMS) reprennent ces valeurs : les valeurs d'origine (Clinique du Trocadéro)
//   sont remplacées à l'envoi des fichiers de dist/, sans toucher au code.
// - Les logos remplacent assets/marque/etablissement.webp et etablissement-sombre.webp (stockage objet).
// - GET /api/etablissement : nom et coordonnées publiques (aucune donnée de santé).
// - GET|POST /api/admin/etablissement : lecture et modification par l'administrateur, tracées.
// Variables d'environnement facultatives pour une nouvelle installation (valeurs initiales avant tout réglage) :
// ETABLISSEMENT_NOM, ETABLISSEMENT_ADRESSE, ETABLISSEMENT_CP, ETABLISSEMENT_VILLE, ETABLISSEMENT_TEL, ETABLISSEMENT_FINESS.
export const DEFAUT=Object.freeze({nom:'Clinique du Trocadéro',adresse:'62 rue de la Tour',cp:'75016',ville:'Paris',tel:'01 40 72 41 10',finess:'750300881'});
const CHAMPS={nom:[2,120],adresse:[0,160],cp:[0,10],ville:[0,80],tel:[0,30],finess:[0,9]};
import {createHash} from 'node:crypto';
const TYPES={'image/png':1,'image/webp':1,'image/jpeg':1};
const t=v=>typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim():'';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

export function valider(d={}){
 const out={},erreurs=[];
 for(const [k,[mini,maxi]] of Object.entries(CHAMPS)){const v=t(d[k]);if(v.length<mini||v.length>maxi)erreurs.push(k);out[k]=v}
 if(out.finess&&!/^\d{9}$/.test(out.finess))erreurs.push('finess');
 if(out.cp&&!/^\d{5}$/.test(out.cp))erreurs.push('cp');
 return {valeurs:out,erreurs};
}
// Remplace les valeurs d'origine par celles de l'installation dans un texte servi (HTML, JS, SMS).
export function substituer(texte,e){
 if(!e||typeof texte!=='string')return texte;
 let s=texte;
 const paires=[
  [DEFAUT.adresse+', '+DEFAUT.cp+' '+DEFAUT.ville,[e.adresse,[e.cp,e.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
  [DEFAUT.nom.toUpperCase(),e.nom.toUpperCase()],[DEFAUT.nom,e.nom],[DEFAUT.finess,e.finess],[DEFAUT.tel,e.tel]
 ];
 for(const [a,b] of paires)if(b&&a!==b)s=s.split(a).join(b);
 return s;
}
export const estDefaut=e=>!e||Object.keys(DEFAUT).every(k=>e[k]===DEFAUT[k])&&!e.logos?.clair&&!e.logos?.sombre;

export function createEtablissement({pool,bucket,env=process.env}){
 let cache=null;
 const initial=()=>({nom:t(env.ETABLISSEMENT_NOM)||DEFAUT.nom,adresse:t(env.ETABLISSEMENT_ADRESSE)||(env.ETABLISSEMENT_NOM?'':DEFAUT.adresse),cp:t(env.ETABLISSEMENT_CP)||(env.ETABLISSEMENT_NOM?'':DEFAUT.cp),
  ville:t(env.ETABLISSEMENT_VILLE)||(env.ETABLISSEMENT_NOM?'':DEFAUT.ville),tel:t(env.ETABLISSEMENT_TEL)||(env.ETABLISSEMENT_NOM?'':DEFAUT.tel),finess:t(env.ETABLISSEMENT_FINESS)||(env.ETABLISSEMENT_NOM?'':DEFAUT.finess),logos:{}});
 async function lire(){
  const r=(await pool.query('SELECT data,updated_at,updated_by FROM establishment_settings WHERE id=1')).rows[0];
  cache=r?{...initial(),...JSON.parse(r.data),majLe:r.updated_at,majPar:r.updated_by}:initial();
  return cache;
 }
 const actuel=async()=>cache||lire();
 async function estAdmin(userId){return (await pool.query("SELECT 1 FROM workspace_members m JOIN professional_profiles p ON p.user_id=m.user_id WHERE m.user_id=$1 AND m.role='owner' AND p.active=1",[userId])).rows.length>0}
 const journal=(actor,result,reason,detail='')=>pool.query('INSERT INTO professional_access_log(at,actor,action,target,result,reason,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',[new Date().toISOString(),actor,'etablissement','establishment_settings',result,reason,detail]);
 async function logo(nom){
  const e=await actuel(),l=e.logos?.[nom];if(!l)return null;
  const o=await bucket.get(l.hash).catch(()=>null);if(!o?.body)return null;
  return new Response(o.body,{headers:{'Content-Type':l.type,'Cache-Control':'no-store'}});
 }
 async function api(request,staff,baseUrl){
  const url=new URL(request.url);
  if(url.pathname==='/api/etablissement'&&request.method==='GET'){const e=await actuel();return json({nom:e.nom,adresse:e.adresse,cp:e.cp,ville:e.ville,tel:e.tel})}
  if(url.pathname!=='/api/admin/etablissement')return null;
  if(!staff)return json({error:'Connexion professionnelle requise.'},401);
  if(!await estAdmin(staff.id)){await journal(staff.id,'denied','Réglage réservé à l’administrateur');return json({error:'Réglage réservé à l’administrateur.'},403)}
  if(request.method==='GET'){const e=await actuel();return json({...e,defaut:DEFAUT})}
  if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
  if(request.headers.get('Origin')!==baseUrl)return json({error:'Origine refusée.'},403);
  const brut=await request.arrayBuffer();if(brut.byteLength>3*1024*1024)return json({error:'Fichier trop volumineux (2 Mo au plus par logo).'},413);
  let d;try{d=JSON.parse(new TextDecoder().decode(brut))}catch{return json({error:'Requête invalide.'},400)}
  const avant=await actuel();
  const {valeurs,erreurs}=valider({...avant,...(d.valeurs||{})});
  if(erreurs.length)return json({error:'Champs à corriger : '+erreurs.join(', ')+'.',champs:erreurs},400);
  const logos={...(avant.logos||{})};
  for(const nom of ['clair','sombre']){
   const x=d.logos?.[nom];if(x===undefined)continue;
   if(x===null){delete logos[nom];continue}
   const m=/^data:(image\/(?:png|webp|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(x));
   if(!m||!TYPES[m[1]])return json({error:'Logo : PNG, WebP ou JPEG seulement.'},400);
   const octets=Buffer.from(m[2],'base64');if(octets.length>2*1024*1024)return json({error:'Logo de 2 Mo au plus.'},413);
   const hash=createHash('sha256').update(octets).digest('hex');await bucket.put(hash,new Uint8Array(octets),{httpMetadata:{contentType:m[1]},customMetadata:{name:'logo-'+nom}});logos[nom]={type:m[1],taille:octets.length,hash,at:new Date().toISOString()};
  }
  const data={...valeurs,logos},at=new Date().toISOString();
  await pool.query('INSERT INTO establishment_settings(id,data,updated_at,updated_by) VALUES(1,$1,$2,$3) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by',[JSON.stringify(data),at,staff.display_name||staff.email||staff.id]);
  const change=Object.keys(CHAMPS).filter(k=>avant[k]!==valeurs[k]).concat(['clair','sombre'].filter(n=>JSON.stringify(avant.logos?.[n])!==JSON.stringify(logos[n])).map(n=>'logo '+n));
  await journal(staff.id,'allowed','Identité de l’établissement modifiée',change.join(', '));
  cache=null;return json({...await lire(),defaut:DEFAUT});
 }
 return {actuel,lire,logo,api,substituer:async s=>{const e=await actuel();return estDefaut(e)?s:substituer(s,e)}};
}

// IASELO · commandes de la pharmacie aux fournisseurs (26/11/2026, demande de Romain).
//  GET  /api/workspace/pharmacie                     livret, commandes récentes et en cours (réceptions, étapes)
//  POST /api/workspace/pharmacie {action:'article', id?, version?, article, motif}                 pharmacien
//  POST /api/workspace/pharmacie {action:'creer', fournisseur, lignes, note, urgent}               pharmacie
//  POST /api/workspace/pharmacie {action:'modifier'|'soumettre'|'valider'|'renvoyer'|'rouvrir'|'envoyer'|
//                                 'receptionner'|'solder'|'annuler', id, version, ...}
// Règles (profils, états, stupéfiants, chaîne du froid, péremption) : dist/commandes-pharmacie-regles.js.
// Traçabilité : chaque étape est copiée dans pharmacy_order_events (auteur, profil, motif, empreinte SHA-256 du
// contenu), chaque produit reçu dans pharmacy_receptions ; ces tables ne se modifient pas. Une action exige la
// version lue de la commande (pas d'écrasement silencieux entre deux postes). Aucune donnée patient.
import R from '../dist/commandes-pharmacie-regles.js';
import {randomUUID,createHash} from 'node:crypto';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function body(request){const bytes=await request.arrayBuffer();if(bytes.byteLength>200000)throw Error('size');return JSON.parse(new TextDecoder().decode(bytes))}
const sha=text=>createHash('sha256').update(text).digest('hex');
const jour=()=>new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const article=r=>({id:r.id,version:Number(r.version),actif:!!Number(r.actif),miseAJour:r.updated_at,par:r.updated_by_name,...JSON.parse(r.data),nom:r.nom,fournisseur:r.fournisseur});

export async function staffCommandesPharmacieApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/pharmacie')return null;
 const DB=env.DB,p=acl.active?R.profil({job:acl.job,poste:acl.poste,isAdmin:acl.isAdmin}):null,moi=acl.profile.user_id;
 if(!p){await acl.log('read','pharmacie','denied','Commandes réservées à la pharmacie');return json({error:R.refus('lire',null)},403)}
 const nomActeur=async()=>(await DB.prepare('SELECT display_name FROM professional_profiles WHERE user_id=?').bind(moi).first())?.display_name||moi;
 const articles=async()=>(await DB.prepare('SELECT * FROM pharmacy_articles ORDER BY nom').all()).results.map(article);
 async function commande(row,{evenements=true}={}){
  if(!row)return null;const d=JSON.parse(row.data);
  const receptions=(await DB.prepare('SELECT * FROM pharmacy_receptions WHERE order_id=? ORDER BY at,id').bind(row.id).all()).results.map(r=>({id:r.id,ligne:Number(r.ligne),articleId:r.article_id,quantite:Number(r.quantite),conforme:Number(r.conforme),lot:r.lot,peremption:r.peremption,par:r.actor_name,profil:r.actor_profil,at:r.at,...JSON.parse(r.data)}));
  const ev=evenements?(await DB.prepare('SELECT version,action,statut,motif,actor_name,actor_profil,at,hash FROM pharmacy_order_events WHERE order_id=? ORDER BY id').bind(row.id).all()).results.map(e=>({version:Number(e.version),action:e.action,statut:e.statut,motif:e.motif,par:e.actor_name,profil:e.actor_profil,at:e.at,hash:e.hash})):[];
  return {id:row.id,numero:row.numero,fournisseur:row.fournisseur,statut:row.statut,version:Number(row.version),total:Number(row.total_centimes),creeLe:row.created_at,creePar:row.created_by,creeParNom:row.created_by_name,miseAJour:row.updated_at,...d,receptions,evenements:ev};
 }
 if(request.method==='GET'){
  const rows=(await DB.prepare("SELECT * FROM pharmacy_orders WHERE statut IN ('brouillon','a_valider','validee','envoyee','partielle') OR updated_at>=? ORDER BY updated_at DESC LIMIT 300").bind(new Date(Date.now()-120*864e5).toISOString()).all()).results;
  const commandes=[];for(const r of rows)commandes.push(await commande(r));
  await acl.log('read','pharmacie','allowed','Commandes de la pharmacie');
  return json({profil:p,moi,aujourdhui:jour(),articles:await articles(),commandes,statuts:R.STATUTS,modes:R.MODES_ENVOI});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await body(request)}catch{return json({error:'Requête illisible.'},400)}
 const action=String(d.action||''),at=new Date().toISOString(),motif=String(d.motif||'').trim().slice(0,400);
 const refuse=async(message,cible='pharmacie',status=403)=>{await acl.log('write',cible,'denied',message);return json({error:message},status)};

 // Livret des produits : création et mise à jour par le pharmacien, versions conservées.
 if(action==='article'){
  const r=R.refus('articles',p);if(r)return refuse(r);
  const row=d.id?await DB.prepare('SELECT * FROM pharmacy_articles WHERE id=?').bind(String(d.id)).first():null;
  if(d.id&&!row)return refuse('Produit introuvable.','pharmacie',404);
  if(row&&Number(d.version)!==Number(row.version))return json({error:'Ce produit a été modifié sur un autre poste : rechargez avant d’enregistrer.'},409);
  const v=R.validerArticle(d.article);if(!v.ok)return json({error:v.errors.join(' '),errors:v.errors},400);
  if(row&&motif.length<5)return json({error:'Indiquez le motif de la modification (5 caractères au moins).'},400);
  const a=v.article,id=row?.id||randomUUID(),version=row?Number(row.version)+1:1,nom=await nomActeur();
  const data=JSON.stringify({code:a.code,forme:a.forme,conditionnement:a.conditionnement,unite:a.unite,prixCentimes:a.prixCentimes,stockMin:a.stockMin,stockMax:a.stockMax,stupefiant:a.stupefiant,froid:a.froid,mds:a.mds});
  const st=[row?DB.prepare('UPDATE pharmacy_articles SET nom=?,fournisseur=?,actif=?,version=?,data=?,updated_at=?,updated_by=?,updated_by_name=? WHERE id=? AND version=?').bind(a.nom,a.fournisseur,a.actif?1:0,version,data,at,moi,nom,id,row.version)
   :DB.prepare('INSERT INTO pharmacy_articles(id,nom,fournisseur,actif,version,data,updated_at,updated_by,updated_by_name) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,a.nom,a.fournisseur,a.actif?1:0,version,data,at,moi,nom),
   DB.prepare('INSERT INTO pharmacy_article_versions(article_id,version,data,motif,actor,actor_name,at) VALUES(?,?,?,?,?,?,?)').bind(id,version,JSON.stringify(a),motif||'Création',moi,nom,at)];
  let out;try{out=await DB.batch(st)}catch{return json({error:'Ce produit a été modifié sur un autre poste : rechargez.'},409)}
  if(row&&!out[0].meta.changes)return json({error:'Ce produit a été modifié sur un autre poste : rechargez.'},409);
  await acl.log('pharmacie-article','pharmacie/article/'+id,'allowed',a.nom+' · version '+version,motif);
  return json({ok:true,article:article(await DB.prepare('SELECT * FROM pharmacy_articles WHERE id=?').bind(id).first())});
 }

 const livret=await articles();
 // Enregistre une étape : nouvelle version de la commande + copie immuable de l'étape.
 async function etape(row,act,statut,data,{extra=[],motifEtape=motif,fournisseur=row?.fournisseur}={}){
  const nom=await nomActeur(),version=row?Number(row.version)+1:1,id=row?.id||randomUUID(),texte=JSON.stringify(data),tot=R.total(data.lignes);
  for(let essai=0;essai<3;essai++){
   let num=row?.numero;
   if(!row){const an=at.slice(0,4),n=Number((await DB.prepare("SELECT COUNT(*) AS n FROM pharmacy_orders WHERE numero LIKE ?").bind('CMD-'+an+'-%').first()).n)+1+essai;num=R.numero(an,n)}
   const st=[row?DB.prepare('UPDATE pharmacy_orders SET fournisseur=?,statut=?,version=?,data=?,total_centimes=?,updated_at=? WHERE id=? AND version=?').bind(fournisseur,statut,version,texte,tot,at,id,row.version)
    :DB.prepare('INSERT INTO pharmacy_orders(id,numero,fournisseur,statut,version,data,total_centimes,created_at,created_by,created_by_name,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,num,fournisseur,statut,version,texte,tot,at,moi,nom,at),
    DB.prepare('INSERT INTO pharmacy_order_events(order_id,version,action,statut,motif,data,hash,actor,actor_name,actor_profil,at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,version,act,statut,motifEtape,texte,sha(texte),moi,nom,p,at),
    ...extra.map(f=>f(id,nom))];
   let out;try{out=await DB.batch(st)}catch(e){if(!row&&/unique|duplicate/i.test(e.message))continue;return json({error:'La commande a été modifiée sur un autre poste : rechargez-la.'},409)}
   if(row&&!out[0].meta.changes)return json({error:'La commande a été modifiée sur un autre poste : rechargez-la.'},409);
   await acl.log('pharmacie-'+act,'pharmacie/commande/'+(num||id),'allowed',R.STATUTS[statut],motifEtape);
   return json({ok:true,commande:await commande(await DB.prepare('SELECT * FROM pharmacy_orders WHERE id=?').bind(id).first())});
  }
  return json({error:'Numérotation de la commande impossible : réessayez.'},409);
 }
 const contenu=src=>({note:String(src.note||'').trim().slice(0,600),urgent:!!src.urgent});

 if(action==='creer'){
  const r=R.refus('creer',p);if(r)return refuse(r);
  const fournisseur=String(d.fournisseur||'').trim().slice(0,120);if(!fournisseur)return json({error:'Fournisseur requis.'},400);
  const n=R.normaliserLignes(d.lignes,livret);if(n.errors.length)return json({error:n.errors.join(' ')},400);
  return etape(null,'creation','brouillon',{lignes:n.lignes,...contenu(d)},{fournisseur,motifEtape:'Création'});
 }

 const row=await DB.prepare('SELECT * FROM pharmacy_orders WHERE id=?').bind(String(d.id||'')).first();
 if(!row)return refuse('Commande introuvable.','pharmacie',404);
 const cmd=await commande(row,{evenements:false});
 if(Number(d.version)!==cmd.version)return json({error:'La commande a été modifiée sur un autre poste : rechargez-la avant de continuer.',commande:await commande(row)},409);
 const r=R.refus(action,p,cmd,moi);if(r)return refuse(r,'pharmacie/commande/'+cmd.numero);
 const {id:_i,numero:_n,fournisseur:_f,statut:_s,version:_v,total:_t,creeLe:_c,creePar:_cp,creeParNom:_cn,miseAJour:_m,receptions:_r,evenements:_e,...data}=cmd;
 const exiger=async()=>motif.length<5?json({error:'Indiquez le motif (5 caractères au moins) : il est conservé dans l’historique de la commande.'},400):null;

 if(action==='modifier'){
  const fournisseur=String(d.fournisseur||cmd.fournisseur).trim().slice(0,120);if(!fournisseur)return json({error:'Fournisseur requis.'},400);
  const n=R.normaliserLignes(d.lignes,livret);if(n.errors.length)return json({error:n.errors.join(' ')},400);
  return etape(row,'modification','brouillon',{...data,lignes:n.lignes,...contenu(d)},{fournisseur,motifEtape:''});
 }
 if(action==='soumettre'){
  const c=R.controlerCommande(cmd);if(!c.ok)return json({error:c.errors.join(' ')},400);
  return etape(row,'soumission','a_valider',{...data,soumission:{at,par:await nomActeur()}},{motifEtape:''});
 }
 if(action==='valider'){
  const bon=String(d.bonStupefiants||data.bonStupefiants||'').trim().slice(0,60);
  const c=R.controlerCommande({...cmd,bonStupefiants:bon},{validation:true});if(!c.ok)return json({error:c.errors.join(' ')},400);
  // Contrôle du livret à la validation : un produit retiré entre-temps n'est pas commandé.
  const retires=cmd.lignes.filter(l=>!livret.find(a=>a.id===l.articleId)?.actif);if(retires.length)return json({error:'Produit retiré du livret : '+retires.map(l=>l.nom).join(', ')+'. Renvoyez la commande pour la corriger.'},400);
  return etape(row,'validation','validee',{...data,bonStupefiants:bon,validation:{at,par:await nomActeur()}},{motifEtape:c.stupefiants?'Bon stupéfiants n° '+bon:''});
 }
 if(action==='renvoyer'){const e=await exiger();if(e)return e;return etape(row,'renvoi','brouillon',{...data,renvoi:{at,motif}})}
 if(action==='rouvrir'){const e=await exiger();if(e)return e;return etape(row,'reouverture','brouillon',{...data,validation:null})}
 if(action==='envoyer'){
  const mode=String(d.mode||'');if(!Object.hasOwn(R.MODES_ENVOI,mode))return json({error:'Mode de transmission inconnu.'},400);
  const reference=String(d.reference||'').trim().slice(0,80);
  // Simulation : aucune transmission réelle au fournisseur tant que le raccordement (EDI, portail) n'est pas configuré.
  return etape(row,'transmission','envoyee',{...data,envoi:{mode,reference,at,par:await nomActeur(),simulation:true}},{motifEtape:R.MODES_ENVOI[mode]+(reference?' · '+reference:'')});
 }
 if(action==='receptionner'){
  const c=R.controlerReception(cmd,d.lignes,jour());if(!c.ok)return json({error:c.errors.join(' '),errors:c.errors},400);
  const bl=String(d.bonLivraison||'').trim().slice(0,60);if(!bl)return json({error:'Numéro du bon de livraison requis.'},400);
  const recues=c.lignes.map(l=>({...l,id:randomUUID(),articleId:cmd.lignes[l.ligne].articleId,bonLivraison:bl}));
  const apres={...cmd,receptions:[...cmd.receptions,...recues]},statut=R.statutApresReception(apres);
  const extra=recues.map(x=>(id,nom)=>DB.prepare('INSERT INTO pharmacy_receptions(id,order_id,ligne,article_id,quantite,conforme,lot,peremption,data,actor,actor_name,actor_profil,at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(x.id,id,x.ligne,x.articleId,x.quantite,x.conforme,x.lot,x.peremption,JSON.stringify({nom:x.nom,litige:x.litige,motif:x.motif,froidOk:x.froidOk,peremptionCourte:x.peremptionCourte,bonLivraison:bl}),moi,nom,p,at));
  const litiges=recues.filter(x=>x.litige>0).length;
  const res=await etape(row,'reception',statut,data,{extra,motifEtape:'BL '+bl+' · '+recues.length+' ligne(s)'+(litiges?' · '+litiges+' litige(s)':'')});
  if(res.status!==200)return res;const out=await res.json();return json({...out,receptions:recues.map(x=>x.id),avertissements:c.avertissements});
 }
 if(action==='solder'){const e=await exiger();if(e)return e;return etape(row,'solde','soldee',data)}
 if(action==='annuler'){const e=await exiger();if(e)return e;return etape(row,'annulation','annulee',data)}
 return json({error:'Action inconnue.'},400);
}

// IASELO · transmission du codage aux services (25/11/2026). Module « codage » de /api/workspace/marche/codage.
//  GET  ?stay=<id> : transmissions du séjour (médecins et DIM du séjour) ; sans paramètre : transmissions reçues
//       par le service du compte (secrétariat, accueil, facturation, DIM, autre) ou envoyées pour les séjours suivis.
//  POST {action:'transmettre',stay,destinataires,autre,note,codes} : médecin ou DIM ; les actes sont relus côté serveur
//       dans le codage enregistré du séjour (stay/<id>/codage), jamais repris du navigateur.
//  POST {action:'traiter'|'corriger',id,service,commentaire|motif} : le service destinataire.
// Minimisation : identité, dates et actes CCAM seulement (ni diagnostics, ni ASA, ni compte rendu). Tout est tracé.
import C from '../dist/codage-transmis-regles.js';

export function creerModuleCodage(o){
 const {json,t,court,lire,un,creer,modifier,docData,est,cliniqueSejour,aujourdhui,maintenant}=o;
 const mesServices=acl=>acl.isAdmin?Object.keys(C.SERVICES):C.servicesDe(acl.job);
 const codeur=acl=>est(acl,C.CODEURS);
 const pourMoi=(acl,r)=>r.data.destinataires.some(s=>mesServices(acl).includes(s));
 const sortie=r=>({id:r.id,stay:r.stay,status:r.status,at:r.at,par:r.par,maj:r.maj,data:r.data});
 async function dateActe(env,stay){
  const [perop,annonce,consult]=await Promise.all(['peropRapide','surgicalAnnouncement','consult'].map(k=>docData(env,'stay/'+stay+'/'+k)));
  const entree=(perop?.evenements||[]).find(x=>!x.annule&&x.label==='Entrée en salle')?.at;
  return t(entree).slice(0,10)||t(consult?.ext?.surgeryDate).slice(0,10)||t(annonce?.published?.fields?.date).slice(0,10)||'';
 }
 return {
  async get({env,acl,q}){
   const stay=q('stay');
   if(stay){if(!codeur(acl)||!cliniqueSejour(acl,stay))return json({error:'Séjour hors habilitation.'},403);
    const l=await lire(env,'codage',{kind:'transmission',stay,limit:100});await acl.log('read','marche/codage','allowed','Transmissions du codage',stay);
    return json({transmissions:l.map(sortie),peutTransmettre:true})}
   const services=mesServices(acl);
   if(!services.length&&!codeur(acl))return json({error:'Transmissions du codage : médecins, DIM, secrétariat, accueil, facturation ou service administratif.'},403);
   const tous=(await lire(env,'codage',{kind:'transmission',limit:1000})).filter(r=>r.status!=='remplace');
   const recues=tous.filter(r=>pourMoi(acl,r)),envoyees=codeur(acl)&&!acl.isAdmin?tous.filter(r=>cliniqueSejour(acl,r.stay)&&!pourMoi(acl,r)):[];
   await acl.log('read','marche/codage','allowed','Transmissions du codage (liste)');
   return json({recues:recues.map(sortie),envoyees:envoyees.map(sortie),services,peutTransmettre:codeur(acl)});
  },
  async post({env,acl,acteur,refuse},d,action){
   if(action==='transmettre'){
    const stay=t(d.stay);if(!codeur(acl))return refuse('La transmission du codage revient au médecin ou au DIM.','codage');
    if(!stay||!cliniqueSejour(acl,stay))return refuse('Séjour hors habilitation.','codage');
    const [codage,core]=await Promise.all([docData(env,'stay/'+stay+'/codage'),docData(env,'stay/'+stay+'/core')]);
    const actes=C.actesConfirmes(codage||{});
    // Le navigateur annonce les codes qu'il voit : s'ils diffèrent du codage enregistré, l'enregistrement n'est pas encore arrivé.
    if(Array.isArray(d.codes)&&d.codes.map(String).sort().join()!==actes.map(a=>a.code).sort().join())return json({error:'Le codage n’est pas encore enregistré sur le serveur : réessayez dans quelques secondes.'},409);
    const demande={destinataires:Array.isArray(d.destinataires)?d.destinataires.map(String):[],autre:court(d.autre,120),note:court(d.note,2000)};
    const err=C.erreur(demande,actes);if(err)return json({error:err},400);
    const i=core?.identity||{},at=maintenant();
    const data={patient:{nom:court(i.lastName,120).toUpperCase(),prenom:court(i.firstName,120),naissance:t(i.birthDate).slice(0,10),sexe:court(i.sex,20)},
     sejour:{mode:court(core?.mode,60),specialite:court(core?.specialty,80),dateActe:await dateActe(env,stay)},
     actes,destinataires:demande.destinataires,autre:demande.destinataires.includes('autre')?demande.autre:'',note:demande.note,
     services:Object.fromEntries(demande.destinataires.map(s=>[s,{etat:'transmis'}]))};
    // Une nouvelle transmission remplace les précédentes non traitées du même séjour.
    const precedentes=(await lire(env,'codage',{kind:'transmission',stay,limit:100})).filter(r=>['transmis','a-corriger'].includes(r.status));
    const rec=await creer(env,acteur,'codage','transmission',{stay,status:'transmis',day:aujourdhui(),data},'transmission');
    for(const p of precedentes)await modifier(env,acteur,p,{status:'remplace',data:{...p.data,remplacePar:rec.id,remplaceLe:at}},'remplacement');
    await acl.log('write','marche/codage','allowed','Codage transmis à '+demande.destinataires.map(s=>C.libelleService(s,data.autre)).join(', ')+' ('+actes.map(a=>a.code).join(', ')+')',stay);
    return json({transmission:sortie(rec),remplacees:precedentes.length});
   }
   if(action==='traiter'||action==='corriger'){
    const rec=await un(env,'codage',d.id),service=t(d.service);
    if(!rec||rec.kind!=='transmission')return json({error:'Transmission introuvable.'},404);
    if(!rec.data.destinataires.includes(service)||!mesServices(acl).includes(service))return refuse('Cette transmission n’est pas adressée à votre service.','codage');
    if(rec.status==='remplace')return json({error:'Transmission remplacée par une plus récente.'},409);
    const commentaire=court(action==='corriger'?d.motif:d.commentaire,1000);
    if(action==='corriger'&&commentaire.length<3)return json({error:'Indiquez ce qui doit être corrigé.'},400);
    const services={...rec.data.services,[service]:{etat:action==='traiter'?'traite':'a-corriger',par:acteur.nom,at:maintenant(),commentaire}};
    const r=await modifier(env,acteur,rec,{status:C.etatGlobal(services),data:{...rec.data,services}},action==='traiter'?'traitement':'demande-correction');
    await acl.log('write','marche/codage','allowed',(action==='traiter'?'Codage traité':'Correction demandée')+' · '+C.libelleService(service,rec.data.autre),rec.stay);
    return json({transmission:sortie(r)});
   }
   return json({error:'Action inconnue.'},400);
  }
 };
}

// IASELO · transmission à l'Assurance maladie (veille du 25/11/2026). Module « assurance » de /api/workspace/marche/assurance.
//
// Un dossier par séjour (marche_records, module 'assurance', kind 'dossier') en trois parties :
//   droits   (secrétariat, facturation) : NIR, qualité, régime, caisse, nature d'assurance, exonération, complémentaire,
//            vérification des droits (carte Vitale, appli, ADRi), accord de la complémentaire (ROC) ;
//   pmsi     (médecins, DIM) : dates, modes d'entrée et de sortie, DP / DR / DAS, implants en sus (LPP) ;
//            validation par le médecin DIM, puis envoi au logiciel PMSI en HL7 BAR^P12 ;
//   facture  (facturation) : GHS issu du groupage, suppléments, chambre ; transmission au logiciel de facturation
//            (norme B2), retours de l'Assurance maladie (paiements et rejets NOEMIE).
// Les actes viennent de l'onglet « Codage PMSI » du dossier (confirmés par le praticien, validés par le DIM),
// la classe ASA de la consultation, les implants de la saisie rapide au bloc, les dépassements des devis.
// Minimisation : le secrétariat et la facturation ne reçoivent ni les diagnostics ni la classe ASA.
// Règles : dist/assurance-maladie-regles.js (les mêmes contrôles qu'à l'écran, refaits ici).
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import A from '../dist/assurance-maladie-regles.js';
import H from '../dist/interop-hl7.js';
import {identityRecord} from './veille.mjs';

let ccamCache;
function ccamTarifs(){
 if(ccamCache!==undefined)return ccamCache;
 try{const ref=JSON.parse(fs.readFileSync(new URL('../dist/assets/ccam.json',import.meta.url),'utf8'));ccamCache=new Map((ref.actes||[]).map(([code,libelle,,tarif])=>[code,{libelle,tarif}]))}catch{ccamCache=null}
 return ccamCache;
}
export const _testCcam=m=>{ccamCache=m};

export function creerModuleAssurance(o){
 const {json,t,court,lire,un,creer,modifier,docData,est,voitSejour,cliniqueSejour,maintenant,aujourdhui,etatConnecteur,envoyer,sejours}=o;
 const LECTEURS=['secretariat','facturation','dim','anesthesiste','chirurgien'],DROITS=['secretariat','facturation'],PMSI=['dim','anesthesiste','chirurgien'],FACT=['facturation'];
 const etats=ienv=>Object.fromEntries(['pmsi','facturation','adri','roc'].map(id=>[id,etatConnecteur(id,ienv)]));

 async function dossierDe(env,stay){return (await lire(env,'assurance',{kind:'dossier',stay}))[0]||null}
 async function assurer(env,acteur,stay){return await dossierDe(env,stay)||await creer(env,acteur,'assurance','dossier',{stay,status:'',data:{droits:{},pmsi:{},facture:{}}})}

 // Contexte clinique et administratif d'un séjour, lu côté serveur.
 async function contexte(env,stay,dossier){
  const [core,codage,consult,perop,annonce]=await Promise.all(['core','codage','consult','peropRapide','surgicalAnnouncement'].map(k=>docData(env,'stay/'+stay+'/'+k)));
  const identite=core?.identity||{},ins=await identityRecord(env,stay).catch(()=>null),p=dossier?.data?.pmsi||{},f=dossier?.data?.facture||{};
  const ev=(perop?.evenements||[]).filter(x=>!x.annule),entreeSalle=ev.find(x=>x.label==='Entrée en salle')?.at||'';
  const dateActe=A.jourIso(p.dateActes)||A.jourIso(entreeSalle)||A.jourIso(consult?.ext?.surgeryDate)||A.jourIso(annonce?.published?.fields?.date);
  const dec=codage?.decisions||{},tarifs=ccamTarifs(),asa=A.ASA[String(consult?.asa||'').replace(/E$/,'')]||'';
  const actes=Object.entries(codage?.actes||{}).filter(([,x])=>x&&x.confirme).map(([k,x])=>{const code=t(x.code).toUpperCase(),activite=k==='anes'?'4':'1';
   return {cle:k,code,libelle:x.libelle||tarifs?.get(code)?.libelle||'',activite,phase:'0',date:dateActe,dim:dec['acte:'+k]?.decision==='Validé',rejeteDim:dec['acte:'+k]?.decision==='Rejeté',
    extension:activite==='4'?(t(p.extensionAsa)||asa):'',tarif:tarifs?.get(code)?.tarif??null,modificateurs:t(f.modificateurs?.[k]||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)}});
  const dmiSaisis=p.dmi||{};
  const dmi=(perop?.dmi||[]).map(x=>{const m=dmiSaisis[x.gtin]||{};return {gtin:x.gtin||'',lot:x.lot||'',serie:x.serie||'',peremption:x.peremption||'',lpp:m.lpp||'',enSus:m.enSus===undefined?undefined:!!m.enSus,prix:m.prix||'',libelle:m.libelle||''}});
  const diagnostics=Object.entries(dec).filter(([k,v])=>A.cim10(k)&&v?.decision==='Retenu').map(([k])=>A.normCim(k));
  const devis=(await lire(env,'honoraires',{kind:'devis',stay})).filter(r=>r.status!=='annule').map(r=>({depassement:r.data.depassement,statut:r.status,praticien:r.data.praticien}));
  return {identite,insQualifiee:ins?.status==='Qualifiée',ins:ins?.ins||null,mode:core?.mode||'',actes,dmi,diagnostics,devis,asa,dateActe,specialite:core?.specialty||''};
 }
 // Vue adaptée au métier : diagnostics, ASA et détail PMSI réservés aux médecins et au DIM.
 function vue(acl,stay,rec,ctx){
  const clin=cliniqueSejour(acl,stay),data=rec?.data||{droits:{},pmsi:{},facture:{}},ctl=A.controler(data,ctx);
  const constats=clin?ctl.constats:ctl.constats.filter(c=>c.section!=='pmsi').concat(ctl.constats.some(c=>c.section==='pmsi'&&c.niveau==='bloquant')?[{section:'pmsi',niveau:'bloquant',message:ctl.constats.filter(c=>c.section==='pmsi'&&c.niveau==='bloquant').length+' point(s) du résumé PMSI à régler par le médecin ou le DIM.'}]:[]);
  const pmsi=clin?data.pmsi:{entree:data.pmsi?.entree,sortie:data.pmsi?.sortie,valide:data.pmsi?.valide||null,envoi:data.pmsi?.envoi||null};
  const pf=est(acl,['facturation','dim','anesthesiste','chirurgien'])?A.preFacture(data,ctx):null;
  return {id:rec?.id||'',version:rec?.version||0,statut:rec?.status||'',etape:A.etape({statut:rec?.status},ctl),droits:data.droits||{},pmsi,facture:data.facture||{},
   constats,pret:ctl.pret,preFacture:pf,clinique:clin,
   contexte:{identite:{lastName:ctx.identite.lastName||'',firstName:ctx.identite.firstName||'',birthDate:ctx.identite.birthDate||'',sex:ctx.identite.sex||''},insQualifiee:ctx.insQualifiee,mode:ctx.mode,dateActe:ctx.dateActe,
    actes:ctx.actes.map(a=>clin?a:{code:a.code,libelle:a.libelle,activite:a.activite,date:a.date,dim:a.dim,tarif:a.tarif,modificateurs:a.modificateurs,cle:a.cle}),dmi:ctx.dmi,devis:ctx.devis,...(clin?{diagnostics:ctx.diagnostics,asa:ctx.asa}:{})}};
 }
 const verrouille=rec=>['transmise','paye'].includes(rec?.status);
 const nettoie=(obj,cles,n=200)=>Object.fromEntries(cles.filter(k=>obj[k]!==undefined).map(k=>[k,typeof obj[k]==='boolean'?obj[k]:court(obj[k],n)]));

 return {
  async get({env,acl,q,ienv}){
   if(!est(acl,LECTEURS))return json({error:'Transmission à l’Assurance maladie réservée au secrétariat, à la facturation, au DIM et aux médecins.'},403);
   const stay=q('stay');
   if(stay){if(!voitSejour(acl,stay))return json({error:'Séjour hors habilitation.'},403);
    const rec=await dossierDe(env,stay),ctx=await contexte(env,stay,rec),retours=await lire(env,'assurance',{kind:'retour',stay}),envois=await lire(env,'assurance',{kind:'envoi',stay});
    await acl.log('read','marche/assurance','allowed','Dossier Assurance maladie',stay);
    return json({dossier:vue(acl,stay,rec,ctx),retours,envois:envois.map(e=>cliniqueSejour(acl,stay)||e.data.type!=='BAR^P12'?e:{...e,data:{...e.data,message:''}}),connecteurs:etats(ienv),
     peut:{droits:est(acl,DROITS),pmsi:est(acl,PMSI),validerPmsi:acl.job==='dim',facture:est(acl,FACT)}})}
   // Liste de suivi : un séjour par ligne, étape et nombre de points bloquants.
   const dossiers=new Map((await lire(env,'assurance',{kind:'dossier',limit:2000})).map(r=>[r.stay,r]));
   const liste=[];
   for(const s of (await sejours(env)).filter(x=>voitSejour(acl,x.id)).slice(0,300)){const rec=dossiers.get(s.id),ctx=await contexte(env,s.id,rec),ctl=A.controler(rec?.data||{},ctx),p=rec?.data?.pmsi||{};
    liste.push({stay:s.id,nom:[t(s.identity.lastName).toUpperCase(),t(s.identity.firstName)].filter(Boolean).join(' '),naissance:s.identity.birthDate||'',stage:s.stage,etape:A.etape({statut:rec?.status},ctl),bloquants:ctl.bloquants,alertes:ctl.alertes,sortie:p.sortie||'',delai:A.delaiFacturation(p.sortie)})}
   await acl.log('read','marche/assurance','allowed','Suivi Assurance maladie');
   return json({liste,connecteurs:etats(ienv),peut:{droits:est(acl,DROITS),pmsi:est(acl,PMSI),facture:est(acl,FACT)}});
  },
  async post({env,acl,acteur,ienv,refuse},d,action){
   const stay=t(d.stay);if(!stay||!voitSejour(acl,stay))return refuse('Séjour hors habilitation.','assurance');
   let rec=await assurer(env,acteur,stay);const data={droits:{},pmsi:{},facture:{},...rec.data};
   const enregistre=async(next,status,quoi,ref)=>{rec=await modifier(env,acteur,rec,{data:next,...(status!==undefined?{status}:{}),...(ref!==undefined?{ref}:{})},quoi);await acl.log('write','marche/assurance','allowed',quoi,stay);const ctx=await contexte(env,stay,rec);return json({dossier:vue(acl,stay,rec,ctx)})};
   if(['droits','pmsi','facture'].includes(action)&&verrouille(rec))return json({error:'Facture transmise : attendre le retour de l’Assurance maladie (ou un rejet) avant de modifier.'},409);

   if(action==='droits'){if(!est(acl,DROITS))return refuse('Droits du patient : secrétariat ou facturation.','assurance');
    const v=nettoie(d.droits||{},['nir','qualite','regime','regimeDetail','caisse','centre','nature','dateAccident','exoneration','aldProtocole','acquisition','finDroits','amc','amcNumero','amcNom','amcAdherent','tiersPayantAmc']);
    if(v.nir)v.nir=v.nir.toUpperCase().replace(/[\s.-]/g,'');
    const n=A.nir(v.nir);if(v.nir&&!n.ok)return json({error:n.message},400);
    if(v.tiersPayantAmc!==undefined)v.tiersPayantAmc=v.tiersPayantAmc===true||v.tiersPayantAmc==='1';
    return enregistre({...data,droits:{...data.droits,...v,maj:maintenant(),par:acteur.nom}},undefined,'Droits du patient enregistrés')}

   if(action==='adri'){if(!est(acl,DROITS))return refuse('Droits du patient : secrétariat ou facturation.','assurance');
    const n=A.nir(data.droits.nir);if(!n.ok)return json({error:'Saisir d’abord un NIR valide.'},400);
    const c=etatConnecteur('adri',ienv);if(c.mode!=='simulation')return json({error:'ADRi passe par le logiciel administratif agréé de la clinique : branchement à finaliser avec son éditeur ('+c.etat+').'},501);
    const fin=new Date(Date.now()+365*86400000).toISOString().slice(0,10),r={ouverts:true,date:maintenant(),reference:'SIM-ADRI-'+randomBytes(3).toString('hex').toUpperCase(),finDroits:fin,simulation:true};
    return enregistre({...data,droits:{...data.droits,adri:r,acquisition:'adri',finDroits:data.droits.finDroits||fin}},undefined,'Droits interrogés (ADRi, simulation)')}

   if(action==='roc'){if(!est(acl,DROITS))return refuse('Droits du patient : secrétariat ou facturation.','assurance');
    if(data.droits.amc!=='oui'||!/^\d{8,10}$/.test(t(data.droits.amcNumero)))return json({error:'Renseigner d’abord la complémentaire et son numéro d’organisme.'},400);
    const c=etatConnecteur('roc',ienv);if(c.mode!=='simulation')return json({error:'ROC passe par le logiciel de facturation ROC-compatible de la clinique ('+c.etat+').'},501);
    const r={reference:'SIM-ROC-'+randomBytes(3).toString('hex').toUpperCase(),date:maintenant(),garantie:true,detail:'Accord de prise en charge simulé : ticket modérateur et forfait journalier.',simulation:true};
    return enregistre({...data,droits:{...data.droits,roc:r}},undefined,'Accord de la complémentaire (ROC, simulation)')}

   if(action==='pmsi'){if(!est(acl,PMSI))return refuse('Résumé PMSI : médecins et DIM.','assurance');
    const x=d.pmsi||{},v=nettoie(x,['entree','sortie','modeEntree','provenance','modeSortie','destination','dp','dr','extensionAsa','dateActes'],40);
    for(const k of ['dp','dr'])if(v[k])v[k]=A.normCim(v[k]);
    if(x.das!==undefined)v.das=(Array.isArray(x.das)?x.das:String(x.das).split(/[\s,;]+/)).map(A.normCim).filter(Boolean).slice(0,40);
    if(x.dmi&&typeof x.dmi==='object')v.dmi=Object.fromEntries(Object.entries(x.dmi).slice(0,50).map(([g,m])=>[court(g,20),{lpp:court(m?.lpp,7),enSus:m?.enSus===undefined||m?.enSus===null||m?.enSus===''?undefined:(m.enSus===true||m.enSus==='1'||m.enSus==='oui'),prix:court(m?.prix,12),libelle:court(m?.libelle,120)}]));
    for(const k of ['dp','dr'])if(v[k]&&!A.cim10(v[k]))return json({error:(k==='dp'?'Diagnostic principal':'Diagnostic relié')+' : code CIM-10 attendu (ex. M16.1).'},400);
    // Toute modification annule la validation du DIM.
    return enregistre({...data,pmsi:{...data.pmsi,...v,valide:null,maj:maintenant(),par:acteur.nom}},undefined,'Résumé PMSI enregistré')}

   if(action==='valider-pmsi'){if(acl.job!=='dim')return refuse('La validation du résumé PMSI revient au médecin DIM.','assurance');
    const ctx=await contexte(env,stay,rec),ctl=A.controler(data,ctx),bl=ctl.constats.filter(c=>['droits','pmsi'].includes(c.section)&&c.niveau==='bloquant');
    if(bl.length)return json({error:'Résumé incomplet.',erreurs:bl.map(c=>c.message)},400);
    return enregistre({...data,pmsi:{...data.pmsi,valide:{par:acteur.nom,le:maintenant()}}},undefined,'Résumé PMSI validé par le DIM')}

   if(action==='envoyer-pmsi'){if(acl.job!=='dim')return refuse('L’envoi du résumé PMSI revient au médecin DIM.','assurance');
    if(!data.pmsi.valide)return json({error:'Valider d’abord le résumé PMSI.'},400);
    const ctx=await contexte(env,stay,rec),lien=(await lire(env,'interfaces',{kind:'lien',stay}))[0]?.data||{},p=data.pmsi,i=ctx.identite;
    const msg=H.barPmsi({patient:{ipp:lien.ipp,ins:ctx.ins,nom:i.lastName,prenom:i.firstName,naissance:i.birthDate,sexe:i.sex},nda:lien.nda,entree:p.entree,sortie:p.sortie,modeEntree:p.modeEntree,provenance:p.provenance,modeSortie:p.modeSortie,destination:p.destination,
     diagnostics:[{code:p.dp,type:'DP'},...(p.dr?[{code:p.dr,type:'DR'}]:[]),...(p.das||[]).map(c=>({code:c,type:'DAS'}))],actes:ctx.actes.filter(a=>a.dim).map(a=>({code:a.code,libelle:a.libelle,activite:a.activite,phase:a.phase,date:a.date,extension:a.extension,modificateurs:a.modificateurs}))});
    let envoi;try{envoi=await envoyer('pmsi',{corps:msg},ienv)}catch(e){envoi={ok:false,detail:court(e.message,200)}}
    await creer(env,acteur,'assurance','envoi',{stay,status:envoi.ok?'envoye':'echec',day:aujourdhui(),data:{type:'BAR^P12',destinataire:'Logiciel PMSI',message:msg,...envoi}});
    if(!envoi.ok)return json({error:'Envoi refusé : '+envoi.detail},502);
    return enregistre({...data,pmsi:{...data.pmsi,envoi:{le:maintenant(),reference:envoi.reference,simulation:!!envoi.simulation}}},undefined,'Résumé PMSI envoyé au logiciel PMSI')}

   if(action==='facture'){if(!est(acl,FACT))return refuse('Facture : service facturation.','assurance');
    const x=d.facture||{},v=nettoie(x,['ghm','ghs','ghsTarif','exhJours','exhTarif','chambreNuits','chambrePrix','observation'],120);
    if(x.modificateurs&&typeof x.modificateurs==='object')v.modificateurs=Object.fromEntries(['chir','anes'].map(k=>[k,court(x.modificateurs[k],4).toUpperCase().replace(/[^A-Z0-9]/g,'')]));
    for(const k of ['ghsTarif','exhTarif','chambrePrix'])if(v[k]&&!(Number(String(v[k]).replace(',','.'))>=0))return json({error:'Montant invalide.'},400);
    return enregistre({...data,facture:{...data.facture,...v,maj:maintenant(),par:acteur.nom}},undefined,'Facture du séjour enregistrée')}

   if(action==='transmettre'){if(!est(acl,FACT))return refuse('Facture : service facturation.','assurance');
    if(verrouille(rec))return json({error:'Facture déjà transmise.'},409);
    const ctx=await contexte(env,stay,rec),ctl=A.controler(data,ctx);
    if(!ctl.pret.facture)return json({error:'Facture incomplète.',erreurs:ctl.constats.filter(c=>c.niveau==='bloquant').map(c=>c.section==='pmsi'?'PMSI : '+(cliniqueSejour(acl,stay)?c.message:'point à régler par le DIM'):c.message)},400);
    if(!data.pmsi.valide)return json({error:'Le résumé PMSI doit être validé par le DIM avant la facture.'},400);
    const pf=A.preFacture(data,ctx),reference='FAC-'+aujourdhui().replace(/-/g,'')+'-'+randomBytes(3).toString('hex').toUpperCase(),lien=(await lire(env,'interfaces',{kind:'lien',stay}))[0]?.data||{},dr=data.droits,i=ctx.identite;
    // Facture minimisée : pas de diagnostic ; le logiciel de facturation établit le B2 et le transmet.
    const corps=JSON.stringify({format:'IASELO-FACTURE-1',reference,emise:maintenant(),finess:ienv.INTEROP_FINESS||'',
     patient:{nom:i.lastName,prenom:i.firstName,naissance:i.birthDate,sexe:i.sex,ins:ctx.ins,ipp:lien.ipp||''},
     assure:{nir:dr.nir,qualite:dr.qualite,regime:dr.regime,caisse:dr.caisse,centre:dr.centre||'',nature:dr.nature,dateAccident:dr.dateAccident||'',exoneration:dr.exoneration,complementaire:dr.amc==='oui'?{numero:dr.amcNumero,nom:dr.amcNom||'',adherent:dr.amcAdherent||'',roc:dr.roc?.reference||''}:null},
     sejour:{nda:lien.nda||'',entree:data.pmsi.entree,sortie:data.pmsi.sortie,modeEntree:data.pmsi.modeEntree,modeSortie:data.pmsi.modeSortie,ambulatoire:ctx.mode==='Ambulatoire'},
     ghs:{numero:data.facture.ghs,ghm:data.facture.ghm||'',tarif:data.facture.ghsTarif},lignes:pf.lignes,honoraires:pf.honoraires,participation:{montant:pf.participation,motif:pf.motifParticipation},forfaitJournalier:pf.forfaitJournalier,
     implants:ctx.dmi.filter(x=>x.enSus).map(x=>({lpp:x.lpp,gtin:x.gtin,lot:x.lot,serie:x.serie,prix:x.prix}))});
    let envoi;try{envoi=await envoyer('facturation',{corps,type:'application/json'},ienv)}catch(e){envoi={ok:false,detail:court(e.message,200)}}
    await creer(env,acteur,'assurance','envoi',{stay,status:envoi.ok?'envoye':'echec',ref:reference,day:aujourdhui(),data:{type:'Facture B2',destinataire:'Logiciel de facturation',reference,montantAmo:pf.amo,message:corps,...envoi}});
    if(!envoi.ok)return json({error:'Envoi refusé : '+envoi.detail},502);
    return enregistre({...data,facture:{...data.facture,reference,transmiseLe:maintenant(),transmisePar:acteur.nom,montantAmo:pf.amo,simulation:!!envoi.simulation}},'transmise','Facture transmise ('+reference+')',reference)}

   if(action==='retour'){if(!est(acl,FACT))return refuse('Retours : service facturation.','assurance');
    if(rec.status!=='transmise')return json({error:'Aucune facture en attente de retour pour ce séjour.'},400);
    const r=await enregistrerRetour(env,acteur,rec,{statut:d.statut,montant:d.montant,motif:d.motif,libelle:d.libelle},'saisie');await acl.log('write','marche/assurance','allowed','Retour enregistré : '+r.status,stay);
    rec=await un(env,'assurance',rec.id);return json({dossier:vue(acl,stay,rec,await contexte(env,stay,rec)),retour:r})}

   if(action==='simuler-retour'){if(!est(acl,FACT))return refuse('Retours : service facturation.','assurance');
    if(etatConnecteur('facturation',ienv).mode!=='simulation')return json({error:'Simulation possible seulement en mode simulation.'},400);
    if(rec.status!=='transmise')return json({error:'Aucune facture en attente de retour pour ce séjour.'},400);
    const rejet=d.issue==='rejet';const r=await enregistrerRetour(env,{id:'flux:facturation',nom:'Assurance maladie (simulation)'},rec,rejet?{statut:'rejet',motif:'droits',libelle:'Simulation : droits non retrouvés à la date des soins'}:{statut:'paye',montant:rec.data.facture.montantAmo},'simulation');
    rec=await un(env,'assurance',rec.id);return json({dossier:vue(acl,stay,rec,await contexte(env,stay,rec)),retour:r})}

   if(action==='rouvrir'){if(!est(acl,FACT))return refuse('Facture : service facturation.','assurance');
    if(rec.status!=='rejete')return json({error:'Seule une facture rejetée se rouvre pour correction.'},400);
    return enregistre({...data,facture:{...data.facture,reference:'',transmiseLe:''}},'','Facture rouverte après rejet')}
   return json({error:'Action inconnue.'},400);
  },
  enregistrerRetour
 };

 // Retour de l'Assurance maladie (paiement ou rejet), saisi, simulé ou reçu du logiciel de facturation.
 async function enregistrerRetour(env,acteur,rec,{statut,montant,motif,libelle,reference},source){
  const s=t(statut)==='rejet'?'rejet':t(statut)==='paye'?'paye':'';if(!s)throw Object.assign(Error('Statut attendu : paye ou rejet.'),{status:400});
  const m=A.MOTIFS_REJET[t(motif)]?t(motif):s==='rejet'?'autre':'';
  const r=await creer(env,acteur,'assurance','retour',{stay:rec.stay,status:s,ref:rec.ref||t(reference),day:aujourdhui(),data:{montant:Number(String(montant??'').replace(',','.'))||0,motif:m,libelle:court(libelle,300),source,reference:rec.ref||t(reference)}});
  await modifier(env,acteur,rec,{status:s==='paye'?'paye':'rejete',data:{...rec.data,dernierRetour:{statut:s,motif:m,le:maintenant()}}},'Retour '+s);
  return r;
 }
}

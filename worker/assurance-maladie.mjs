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
import G from '../dist/gestion-financiere-regles.js';
import H from '../dist/interop-hl7.js';
import {identityRecord} from './veille.mjs';

import {ccamIndex,_testCcamIndex} from './ccam-ref.mjs';
import CC from '../dist/codage-ccam-regles.js';
// Compatibilité des tests : Map code → {libelle, tarif}.
export const _testCcam=m=>_testCcamIndex(m);

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
  const dec=codage?.decisions||{},ix=ccamIndex(),asa=A.ASA[String(consult?.asa||'').replace(/E$/,'')]||'';
  // Codage de l'intervention (dist/codage-ccam-regles.js) : lignes validées par leur praticien, avec modificateurs et association.
  const actes=CC.lignesFacturables(codage||{},ix).filter(x=>x.confirme).map(x=>({cle:x.cle,code:x.code,libelle:x.libelle||ix?.parCode.get(x.code)?.libelle||'',activite:x.activite,phase:'0',date:dateActe,dim:x.dim==='Validé',rejeteDim:x.dim==='Rejeté',
    extension:x.activite==='4'?(t(p.extensionAsa)||asa):'',association:x.association,
    // Valeur de l'acte : tarif corrigé par la facturation, sinon celui du codage (CCAM, ou saisi par le praticien si absent de la CCAM).
    ...(()=>{const corr=CC.euro(f.tarifs?.[x.cle]),dep=CC.euro(f.depassements?.[x.cle]);return {tarif:corr>0?corr:x.tarif,tarifSource:corr>0?'facturation':x.tarifManuel?'praticien':x.tarif!=null?'ccam':'',montantCodage:corr>0?null:x.montant,depassement:dep!=null&&!Number.isNaN(dep)?dep:x.depassement,depassementSource:dep!=null&&!Number.isNaN(dep)?'facturation':x.depassement?'praticien':''}})(),
    modificateurs:(t(f.modificateurs?.[x.cle]||'')||x.modificateurs).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)}));
  const dmiSaisis=p.dmi||{};
  const dmi=(perop?.dmi||[]).map(x=>{const m=dmiSaisis[x.gtin]||{};return {gtin:x.gtin||'',lot:x.lot||'',serie:x.serie||'',peremption:x.peremption||'',lpp:m.lpp||'',enSus:m.enSus===undefined?undefined:!!m.enSus,prix:m.prix||'',libelle:m.libelle||''}});
  const diagnostics=Object.entries(dec).filter(([k,v])=>A.cim10(k)&&v?.decision==='Retenu').map(([k])=>A.normCim(k));
  const devis=(await lire(env,'honoraires',{kind:'devis',stay})).filter(r=>r.status!=='annule').map(r=>({depassement:r.data.depassement,statut:r.status,praticien:r.data.praticien}));
  return {identite,insQualifiee:ins?.status==='Qualifiée',ins:ins?.ins||null,mode:core?.mode||'',actes,dmi,diagnostics,devis,asa,dateActe,specialite:core?.specialty||''};
 }
 // Vue adaptée au métier : diagnostics, ASA et détail PMSI réservés aux médecins et au DIM.
 async function tableTarifs(env){return (await lire(env,'assurance',{kind:'tarifs',limit:1}))[0]||null}
 // Tarif du GHS et journées au-delà de la borne haute repris de l'arrêté tarifaire importé, sauf saisie manuelle.
 function avecTarifs(data,table){const f=data?.facture||{};if(!table||!f.ghs)return data;const ts=G.tarifSejour(table.data.tarifs,f.ghs,A.duree(data.pmsi?.entree,data.pmsi?.sortie));if(!ts)return data;
  return {...data,facture:{...f,ghsTarif:t(f.ghsTarif)||String(ts.tarif),exhJours:t(f.exhJours)||(ts.exhJours?String(ts.exhJours):''),exhTarif:t(f.exhTarif)||(ts.exhTarif?String(ts.exhTarif):''),tarifAuto:{annee:table.data.annee,tarif:ts.tarif,exhJours:ts.exhJours,bb:ts.bb,bh:ts.bh,basse:ts.basse}}}}
 function vue(acl,stay,rec,ctx,table){
  const clin=cliniqueSejour(acl,stay),data=avecTarifs(rec?.data||{droits:{},pmsi:{},facture:{}},table),ctl=A.controler(data,ctx);
  const constats=clin?ctl.constats:ctl.constats.filter(c=>c.section!=='pmsi').concat(ctl.constats.some(c=>c.section==='pmsi'&&c.niveau==='bloquant')?[{section:'pmsi',niveau:'bloquant',message:ctl.constats.filter(c=>c.section==='pmsi'&&c.niveau==='bloquant').length+' point(s) du résumé PMSI à régler par le médecin ou le DIM.'}]:[]);
  const pmsi=clin?data.pmsi:{entree:data.pmsi?.entree,sortie:data.pmsi?.sortie,valide:data.pmsi?.valide||null,envoi:data.pmsi?.envoi||null};
  const pf=est(acl,['facturation','dim','anesthesiste','chirurgien'])?A.preFacture(data,ctx):null,rep=pf&&est(acl,['facturation'])?G.repartition(pf,data.droits,data.facture):null;
  return {id:rec?.id||'',version:rec?.version||0,statut:rec?.status||'',etape:A.etape({statut:rec?.status},ctl),droits:data.droits||{},pmsi,facture:data.facture||{},
   constats,pret:ctl.pret,preFacture:pf,repartition:rep,clinique:clin,
   contexte:{identite:{lastName:ctx.identite.lastName||'',firstName:ctx.identite.firstName||'',birthDate:ctx.identite.birthDate||'',sex:ctx.identite.sex||''},insQualifiee:ctx.insQualifiee,mode:ctx.mode,dateActe:ctx.dateActe,
    actes:ctx.actes.map(a=>clin?a:{code:a.code,libelle:a.libelle,activite:a.activite,date:a.date,dim:a.dim,tarif:a.tarif,tarifSource:a.tarifSource,depassement:a.depassement,modificateurs:a.modificateurs,cle:a.cle}),dmi:ctx.dmi,devis:ctx.devis,...(clin?{diagnostics:ctx.diagnostics,asa:ctx.asa}:{})}};
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
    const factures=est(acl,['facturation'])?(await lire(env,'assurance',{kind:'facture',stay})).map(f=>({...f,data:{...f.data,solde:G.solde(f.data)}})):[];
    return json({dossier:vue(acl,stay,rec,ctx,await tableTarifs(env)),factures,retours,envois:envois.map(e=>cliniqueSejour(acl,stay)||e.data.type!=='BAR^P12'?e:{...e,data:{...e.data,message:''}}),connecteurs:etats(ienv),
     peut:{droits:est(acl,DROITS),pmsi:est(acl,PMSI),validerPmsi:acl.job==='dim',facture:est(acl,FACT)}})}
   // Liste de suivi : un séjour par ligne, étape et nombre de points bloquants.
   const vueQ=q('vue');if(vueQ)return await vuesGestion({env,acl,q,ienv},vueQ);
   const dossiers=new Map((await lire(env,'assurance',{kind:'dossier',limit:2000})).map(r=>[r.stay,r])),table=await tableTarifs(env);
   const liste=[];
   for(const s of (await sejours(env)).filter(x=>voitSejour(acl,x.id)).slice(0,300)){const rec=dossiers.get(s.id),ctx=await contexte(env,s.id,rec),ctl=A.controler(avecTarifs(rec?.data||{},table),ctx),p=rec?.data?.pmsi||{};
    liste.push({stay:s.id,nom:[t(s.identity.lastName).toUpperCase(),t(s.identity.firstName)].filter(Boolean).join(' '),naissance:s.identity.birthDate||'',stage:s.stage,etape:A.etape({statut:rec?.status},ctl),bloquants:ctl.bloquants,alertes:ctl.alertes,sortie:p.sortie||'',delai:A.delaiFacturation(p.sortie)})}
   await acl.log('read','marche/assurance','allowed','Suivi Assurance maladie');
   return json({liste,connecteurs:etats(ienv),peut:{droits:est(acl,DROITS),pmsi:est(acl,PMSI),facture:est(acl,FACT),dim:acl.job==='dim'||!!acl.isAdmin}});
  },
  async post({env,acl,acteur,ienv,refuse},d,action){
   if(['tarifs','encaissement','relance','avoir','lot-b2','lot-pmsi'].includes(action))return await actionsGestion({env,acl,acteur,ienv,refuse},d,action);
   const stay=t(d.stay);if(!stay||!voitSejour(acl,stay))return refuse('Séjour hors habilitation.','assurance');
   let rec=await assurer(env,acteur,stay);const data={droits:{},pmsi:{},facture:{},...rec.data};
   const enregistre=async(next,status,quoi,ref)=>{rec=await modifier(env,acteur,rec,{data:next,...(status!==undefined?{status}:{}),...(ref!==undefined?{ref}:{})},quoi);await acl.log('write','marche/assurance','allowed',quoi,stay);const ctx=await contexte(env,stay,rec);return json({dossier:vue(acl,stay,rec,ctx,await tableTarifs(env))})};
   if(['droits','pmsi','facture'].includes(action)&&verrouille(rec))return json({error:'Facture transmise : attendre le retour de l’Assurance maladie (ou un rejet) avant de modifier.'},409);

   if(action==='droits'){if(!est(acl,DROITS))return refuse('Droits du patient : secrétariat ou facturation.','assurance');
    const v=nettoie(d.droits||{},['nir','qualite','regime','regimeDetail','caisse','centre','nature','dateAccident','exoneration','aldProtocole','acquisition','finDroits','amc','amcNumero','amcNom','amcAdherent','tiersPayantAmc','codePostal']);
    if(v.nir)v.nir=v.nir.toUpperCase().replace(/[\s.-]/g,'');
    if(v.codePostal&&!/^\d{5}$/.test(v.codePostal))return json({error:'Code postal de résidence : 5 chiffres (99 + code du pays pour l’étranger).'},400);
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
    const x=d.facture||{},v=nettoie(x,['ghm','ghs','ghsTarif','exhJours','exhTarif','chambreNuits','chambrePrix','amcChambreParNuit','observation'],120);
    // Valeur de chaque acte et dépassements d'honoraires, par ligne de codage (clé ligne:activité).
    const cleOk=k=>/^[A-Za-z0-9_-]{1,40}(:c)?:[A-Z0-9]{1,7}$/.test(k);
    for(const champ of ['tarifs','depassements'])if(x[champ]&&typeof x[champ]==='object'){const o={};for(const [k,m] of Object.entries(x[champ]).slice(0,60)){if(!cleOk(k))continue;const n=CC.euro(m);if(n===null)continue;if(Number.isNaN(n)||n<0||(champ==='depassements'&&n>CC.DEPASSEMENT_MAX))return json({error:(champ==='tarifs'?'Valeur d’acte':'Dépassement d’honoraires')+' invalide : montant en euros.'},400);o[k]=n}v[champ]=o}
    if(x.modificateurs&&typeof x.modificateurs==='object')v.modificateurs=Object.fromEntries(Object.entries(x.modificateurs).filter(([k])=>/^[A-Za-z0-9_-]{1,40}(:c)?:[A-Z0-9]{1,7}$|^(chir|anes)$/.test(k)).slice(0,40).map(([k,m])=>[k,court(m,4).toUpperCase().replace(/[^A-Z0-9]/g,'')]));
    for(const k of ['ghsTarif','exhTarif','chambrePrix'])if(v[k]&&!(Number(String(v[k]).replace(',','.'))>=0))return json({error:'Montant invalide.'},400);
    return enregistre({...data,facture:{...data.facture,...v,maj:maintenant(),par:acteur.nom}},undefined,'Facture du séjour enregistrée')}

   if(action==='transmettre'){if(!est(acl,FACT))return refuse('Facture : service facturation.','assurance');
    if(verrouille(rec))return json({error:'Facture déjà transmise.'},409);
    const table=await tableTarifs(env),dataT=avecTarifs(data,table);Object.assign(data,{facture:dataT.facture});
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
    // Factures numérotées par débiteur (Assurance maladie, complémentaire, patient).
    const repart=G.repartition(pf,dr,data.facture),emises=await emettre(env,acteur,stay,reference,repart,[t(i.lastName).toUpperCase(),t(i.firstName)].filter(Boolean).join(' '));
    return enregistre({...data,facture:{...data.facture,reference,transmiseLe:maintenant(),transmisePar:acteur.nom,montantAmo:pf.amo,simulation:!!envoi.simulation,numeros:emises.map(f=>f.data.numero)}},'transmise','Facture transmise ('+reference+')',reference)}

   if(action==='retour'){if(!est(acl,FACT))return refuse('Retours : service facturation.','assurance');
    if(rec.status!=='transmise')return json({error:'Aucune facture en attente de retour pour ce séjour.'},400);
    const r=await enregistrerRetour(env,acteur,rec,{statut:d.statut,montant:d.montant,motif:d.motif,libelle:d.libelle},'saisie');await acl.log('write','marche/assurance','allowed','Retour enregistré : '+r.status,stay);
    rec=await un(env,'assurance',rec.id);return json({dossier:vue(acl,stay,rec,await contexte(env,stay,rec),await tableTarifs(env)),retour:r})}

   if(action==='simuler-retour'){if(!est(acl,FACT))return refuse('Retours : service facturation.','assurance');
    if(etatConnecteur('facturation',ienv).mode!=='simulation')return json({error:'Simulation possible seulement en mode simulation.'},400);
    if(rec.status!=='transmise')return json({error:'Aucune facture en attente de retour pour ce séjour.'},400);
    const rejet=d.issue==='rejet';const r=await enregistrerRetour(env,{id:'flux:facturation',nom:'Assurance maladie (simulation)'},rec,rejet?{statut:'rejet',motif:'droits',libelle:'Simulation : droits non retrouvés à la date des soins'}:{statut:'paye',montant:rec.data.facture.montantAmo},'simulation');
    rec=await un(env,'assurance',rec.id);return json({dossier:vue(acl,stay,rec,await contexte(env,stay,rec),await tableTarifs(env)),retour:r})}

   if(action==='rouvrir'){if(!est(acl,FACT))return refuse('Facture : service facturation.','assurance');
    if(rec.status!=='rejete')return json({error:'Seule une facture rejetée se rouvre pour correction.'},400);
    // Les factures émises ne se modifient pas : chacune est annulée par un avoir numéroté avant la nouvelle émission.
    for(const f of (await lire(env,'assurance',{kind:'facture',stay})).filter(f=>f.data.reference===rec.ref&&!f.data.annulee&&!f.data.reglements?.length))await annuler(env,acteur,f,'Rejet de l’Assurance maladie : correction et nouvelle facture');
    return enregistre({...data,facture:{...data.facture,reference:'',transmiseLe:''}},'','Facture rouverte après rejet')}
   return json({error:'Action inconnue.'},400);
  },
  enregistrerRetour
 };

 /* ---------- Gestion financière autonome : factures, avoirs, encaissements, lots, tarifs, DIM ---------- */
 async function prochainNumero(env,acteur,prefixe){
  for(let i=0;i<8;i++){let c=(await lire(env,'assurance',{kind:'compteur',ref:prefixe}))[0];
   if(!c)c=await creer(env,acteur,'assurance','compteur',{ref:prefixe,data:{n:0}});
   try{const n=c.data.n+1;await modifier(env,acteur,c,{data:{n}},'numero');return n}catch(e){if(e.status!==409)throw e}}
  throw Object.assign(Error('Numérotation occupée : réessayez.'),{status:409});
 }
 async function emettre(env,acteur,stay,reference,rep,patient){const annee=aujourdhui().slice(0,4),out=[];
  for(const debiteur of ['amo','amc','patient']){const montant=rep[debiteur];if(!(montant>0))continue;const numero=G.numero('facture',annee,await prochainNumero(env,acteur,'F'+annee));
   out.push(await creer(env,acteur,'assurance','facture',{stay,status:'emise',ref:numero,day:aujourdhui(),data:{type:'facture',numero,debiteur,montant,reference,patient,emise:maintenant(),reglements:[],relances:[]}}))}
  return out;
 }
 async function annuler(env,acteur,f,motif){const annee=aujourdhui().slice(0,4),numero=G.numero('avoir',annee,await prochainNumero(env,acteur,'A'+annee));
  const avoir=await creer(env,acteur,'assurance','facture',{stay:f.stay,status:'avoir',ref:numero,day:aujourdhui(),data:{type:'avoir',numero,debiteur:f.data.debiteur,montant:f.data.montant,reference:f.data.reference,patient:f.data.patient,emise:maintenant(),annule:f.data.numero,motif:court(motif,200)}});
  await modifier(env,acteur,f,{data:{...f.data,annulee:{par:numero,le:maintenant(),motif:court(motif,200)}},status:'annulee'},'Annulation par avoir '+numero);
  return avoir;
 }
 async function vuesGestion({env,acl,q,ienv},vueQ){
  if(vueQ==='factures'||vueQ==='export'){if(!est(acl,FACT))return json({error:'Factures et encaissements : service facturation.'},403);
   const toutes=(await lire(env,'assurance',{kind:'facture',limit:2000})).filter(f=>voitSejour(acl,f.stay)).map(f=>({...f,data:{...f.data,solde:f.data.type==='avoir'?0:G.solde(f.data),etat:f.data.type==='avoir'?'avoir':G.etatFacture(f.data),relanceDue:G.relanceDue(f.data)}}));
   if(vueQ==='export'){await acl.log('read','marche/assurance','allowed','Export comptable');return json({csv:G.exportComptable(toutes.map(f=>f.data).sort((a,b)=>a.numero.localeCompare(b.numero)))})}
   const lots=await lire(env,'assurance',{kind:'lot',limit:200}),table=await tableTarifs(env);
   await acl.log('read','marche/assurance','allowed','Factures et encaissements');
   return json({factures:toutes,balance:G.balanceAgee(toutes.map(f=>f.data)),lots,tarifs:table?{annee:table.data.annee,nombre:table.data.nombre,importeLe:table.data.importeLe,par:table.data.par}:null,connecteurs:etats(ienv)})}
  if(vueQ==='dim'){if(!(acl.job==='dim'||acl.isAdmin))return json({error:'Espace réservé au médecin DIM.'},403);
   const mois=/^\d{4}-\d{2}$/.test(q('mois'))?q('mois'):aujourdhui().slice(0,7),dossiers=new Map((await lire(env,'assurance',{kind:'dossier',limit:2000})).map(r=>[r.stay,r])),liste=[];
   for(const s of (await sejours(env)).filter(x=>voitSejour(acl,x.id)).slice(0,500)){const rec=dossiers.get(s.id),p=rec?.data?.pmsi||{},ctx=await contexte(env,s.id,rec),ctl=A.controler(rec?.data||{},ctx);
    const codes=[p.dp,p.dr,...(p.das||[])].filter(Boolean),coherence=G.coherenceDiagnostics(codes,{sexe:ctx.identite.sex,naissance:ctx.identite.birthDate,entree:p.entree});
    liste.push({stay:s.id,nom:[t(s.identity.lastName).toUpperCase(),t(s.identity.firstName)].filter(Boolean).join(' '),sortie:p.sortie||'',entree:p.entree||'',dp:p.dp||'',valide:!!p.valide,valideLe:p.valide?.le||'',envoye:!!p.envoi,
     constats:ctl.constats.filter(c=>c.section==='pmsi'),coherence,ghs:rec?.data?.facture?.ghs||''})}
   const lots=await lire(env,'assurance',{kind:'lot-pmsi',limit:100});await acl.log('read','marche/assurance','allowed','Espace DIM '+mois);
   return json({mois,tableau:G.tableauDim(liste,mois),liste,lots:lots.map(l=>({...l,data:{...l.data,fichier:undefined}})),finess:t(ienv.INTEROP_FINESS)})}
  return json({error:'Vue inconnue.'},400);
 }
 async function actionsGestion({env,acl,acteur,ienv,refuse},d,action){
  if(action==='lot-pmsi'){if(!(acl.job==='dim'||acl.isAdmin))return refuse('Le lot PMSI est préparé par le médecin DIM.','assurance');
   const mois=t(d.mois);if(!/^\d{4}-\d{2}$/.test(mois))return json({error:'Mois attendu (AAAA-MM).'},400);
   const finess=t(ienv.INTEROP_FINESS);if(!/^\d{9}$/.test(finess))return json({error:'N° FINESS de la clinique à déclarer (variable INTEROP_FINESS, 9 chiffres) avant de produire le fichier.'},400);
   const debut=mois.slice(0,4)+'-01-01',fin=mois+'-31',dossiers=(await lire(env,'assurance',{kind:'dossier',limit:2000})).filter(r=>r.data?.pmsi?.valide&&t(r.data.pmsi.sortie)>=debut&&t(r.data.pmsi.sortie).slice(0,10)<=fin&&voitSejour(acl,r.stay));
   const lignes=[],erreurs=[];let n=0;
   for(const rec of dossiers){const ctx=await contexte(env,rec.stay,rec),lien=(await lire(env,'interfaces',{kind:'lien',stay:rec.stay}))[0]?.data||{};
    try{lignes.push(G.rum({finess,numeroRss:String(++n),numeroAdministratif:lien.nda||rec.stay,numeroRum:'1',identite:ctx.identite,pmsi:rec.data.pmsi,actes:ctx.actes.filter(a=>a.dim),uniteMedicale:t(ienv.INTEROP_UM)||'0001',codePostal:t(rec.data.droits?.codePostal)}))}catch(e){erreurs.push(rec.stay+' : '+e.message)}}
   const fichier=lignes.join('\r\n')+(lignes.length?'\r\n':'');
   const lot=await creer(env,acteur,'assurance','lot-pmsi',{status:erreurs.length?'avec-erreurs':'pret',ref:mois,day:aujourdhui(),data:{mois,periode:debut.slice(0,7)+' à '+mois,nombre:lignes.length,erreurs,format:G.FORMAT_RUM,fichier}});
   await acl.log('write','marche/assurance','allowed','Lot PMSI '+mois+' ('+lignes.length+' RSS)');
   return json({lot:{...lot,data:{...lot.data,fichier:undefined}},fichier,nom:finess+'.'+mois.slice(0,4)+'.'+mois.slice(5)+'.rss.txt'})}
  if(!est(acl,FACT))return refuse('Gestion des factures : service facturation.','assurance');
  if(action==='tarifs'){const r=G.lireTarifs(court(d.texte,3*1024*1024));if(!r.nombre)return json({error:'Aucune ligne de tarif reconnue.',erreurs:r.erreurs.slice(0,10)},400);
   const annee=/^\d{4}$/.test(t(d.annee))?t(d.annee):aujourdhui().slice(0,4),data={annee,tarifs:r.tarifs,nombre:r.nombre,importeLe:maintenant(),par:acteur.nom,erreurs:r.erreurs.slice(0,20)};
   const ex=(await lire(env,'assurance',{kind:'tarifs',limit:1}))[0];if(ex)await modifier(env,acteur,ex,{data},'Tarifs GHS '+annee);else await creer(env,acteur,'assurance','tarifs',{ref:'ghs',data});
   await acl.log('write','marche/assurance','allowed','Tarifs GHS importés ('+r.nombre+')');return json({nombre:r.nombre,erreurs:r.erreurs.slice(0,20)})}
  if(action==='lot-b2'){const ouvertes=(await lire(env,'assurance',{kind:'facture',limit:2000})).filter(f=>f.data.debiteur==='amo'&&f.data.type==='facture'&&!f.data.annulee&&!f.data.lot&&G.etatFacture(f.data)==='emise');
   if(!ouvertes.length)return json({error:'Aucune facture de l’Assurance maladie en attente de lot.'},400);
   const numero='LOT-'+aujourdhui().replace(/-/g,'')+'-'+randomBytes(2).toString('hex').toUpperCase(),montant=Math.round(ouvertes.reduce((s,f)=>s+f.data.montant,0)*100)/100;
   let envoi;try{envoi=await envoyer('facturation',{corps:JSON.stringify({format:'IASELO-LOT-1',numero,factures:ouvertes.map(f=>({numero:f.data.numero,reference:f.data.reference,montant:f.data.montant}))}),type:'application/json'},ienv)}catch(e){envoi={ok:false,detail:court(e.message,200)}}
   const lot=await creer(env,acteur,'assurance','lot',{status:envoi.ok?'transmis':'echec',ref:numero,day:aujourdhui(),data:{numero,type:'B2',nombre:ouvertes.length,montant,factures:ouvertes.map(f=>f.data.numero),...envoi}});
   if(envoi.ok)for(const f of ouvertes)await modifier(env,acteur,f,{data:{...f.data,lot:numero}},'Lot '+numero);
   await acl.log('write','marche/assurance',envoi.ok?'allowed':'denied','Lot B2 '+numero);return json({lot},envoi.ok?200:502)}
  const f=await un(env,'assurance',d.id);if(!f||f.kind!=='facture'||!voitSejour(acl,f.stay))return json({error:'Facture introuvable.'},404);
  if(action==='encaissement'){if(f.data.type!=='facture'||f.data.annulee)return json({error:'Facture annulée ou avoir.'},400);
   const montant=Math.round((Number(String(d.montant??'').replace(',','.'))||0)*100)/100,solde=G.solde(f.data);
   if(!(montant>0)||montant>solde+0.001)return json({error:'Montant attendu entre 0 et le solde ('+solde.toFixed(2)+' €).'},400);if(!G.MODES_REGLEMENT[d.mode])return json({error:'Mode de règlement inconnu.'},400);
   const nd={...f.data,reglements:[...(f.data.reglements||[]),{montant,mode:d.mode,le:maintenant(),par:acteur.nom,piece:court(d.piece,60)}]};
   const r=await modifier(env,acteur,f,{data:nd,status:G.etatFacture(nd)},'Encaissement');await acl.log('write','marche/assurance','allowed','Encaissement '+f.data.numero,f.stay);return json({facture:r})}
  if(action==='relance'){const due=G.relanceDue(f.data);if(!due)return json({error:'Pas de relance due pour cette facture.'},400);
   const nd={...f.data,relances:[...(f.data.relances||[]),{rang:due.rang,libelle:due.libelle,le:maintenant(),par:acteur.nom}]};
   const r=await modifier(env,acteur,f,{data:nd},due.libelle);await acl.log('write','marche/assurance','allowed',due.libelle+' '+f.data.numero,f.stay);return json({facture:r,relance:due})}
  if(action==='avoir'){if(f.data.type!=='facture'||f.data.annulee)return json({error:'Facture déjà annulée.'},400);if(f.data.reglements?.length)return json({error:'Facture déjà réglée en partie : rembourser d’abord le règlement.'},400);
   const motif=t(d.motif);if(motif.length<5)return json({error:'Motif de l’avoir à préciser.'},400);
   const a=await annuler(env,acteur,f,motif);await acl.log('write','marche/assurance','allowed','Avoir '+a.data.numero,f.stay);return json({avoir:a})}
  return json({error:'Action inconnue.'},400);
 }

 // Retour de l'Assurance maladie (paiement ou rejet), saisi, simulé ou reçu du logiciel de facturation.
 async function enregistrerRetour(env,acteur,rec,{statut,montant,motif,libelle,reference},source){
  const s=t(statut)==='rejet'?'rejet':t(statut)==='paye'?'paye':'';if(!s)throw Object.assign(Error('Statut attendu : paye ou rejet.'),{status:400});
  const m=A.MOTIFS_REJET[t(motif)]?t(motif):s==='rejet'?'autre':'';
  const r=await creer(env,acteur,'assurance','retour',{stay:rec.stay,status:s,ref:rec.ref||t(reference),day:aujourdhui(),data:{montant:Number(String(montant??'').replace(',','.'))||0,motif:m,libelle:court(libelle,300),source,reference:rec.ref||t(reference)}});
  await modifier(env,acteur,rec,{status:s==='paye'?'paye':'rejete',data:{...rec.data,dernierRetour:{statut:s,motif:m,le:maintenant()}}},'Retour '+s);
  // Lettrage : le paiement NOEMIE solde la facture de l'Assurance maladie ; un rejet la marque.
  const amo=(await lire(env,'assurance',{kind:'facture',stay:rec.stay})).find(f=>f.data.debiteur==='amo'&&f.data.reference===rec.ref&&!f.data.annulee);
  if(amo){const reglements=s==='paye'?[...(amo.data.reglements||[]),{montant:Number(r.data.montant)||amo.data.montant,mode:'noemie',le:maintenant(),par:acteur.nom}]:amo.data.reglements||[];const nd={...amo.data,reglements,rejet:s==='rejet'?{motif:m,le:maintenant()}:null};await modifier(env,acteur,amo,{data:nd,status:G.etatFacture(nd)},'Lettrage '+s)}
  return r;
 }
}

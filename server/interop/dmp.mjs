// DMP (Mon espace santé) : alimentation par l'établissement.
// Accès réservé aux logiciels « DMP-compatibles » autorisés par le CNDA (numéro d'autorisation à placer dans
// le contexte LPS de chaque requête). Transactions IHE XDS.b (ITI-41 pour l'alimentation) en SOAP,
// TLS mutuel avec le certificat ORG_AUTH_CLI de l'établissement, et jeton VIHF (assertion SAML) signé
// par le certificat de cachet ORG_SIGN.
//
// Variables (Clever Cloud) :
//   INTEROP_DMP_MODE        simulation | test (environnement CNDA « DV1 ») | production
//   DMP_ENDPOINT            URL du service d'alimentation (package DMP du GIE SESAM-Vitale)
//   DMP_CERT_P12_BASE64 + DMP_CERT_PASSWORD   certificat d'authentification ORG_AUTH_CLI
//   DMP_SIGN_CERT_P12_BASE64 + DMP_SIGN_CERT_PASSWORD   certificat de cachet ORG_SIGN (signature du VIHF)
//   DMP_LPS_NOM, DMP_LPS_VERSION              nom et version déclarés au CNDA (VIHF : LPS_Nom, LPS_Version)
//   DMP_NIL                  numéro d'identifiant logiciel (NIL) attribué par le CNDA
//   ETABLISSEMENT_FINESS     FINESS de l'établissement ; ETABLISSEMENT_NOM
//   INTEROP_DMP_AUTORISATION production : numéro d'autorisation CNDA
//
// Règles métier appliquées avant tout envoi (DSR / référentiel DMP) : INS qualifiée obligatoire,
// patient informé et non opposé, auteur identifié (RPPS via Pro Santé Connect), lettre relue.
//
// Ce module construit la soumission complète (CDA + métadonnées XDS + attributs VIHF). La signature XML
// du VIHF et l'enveloppe SOAP exacte sont décrites dans le package DMP du CNDA : elles se branchent via
// `signer` (voir docs/homologations.md). Sans elles, l'envoi réel est refusé explicitement.
import {randomUUID} from 'node:crypto';
import {connectorConfig,requireReady} from './modes.mjs';
import {clientCertificate,postMutualTls} from './transport.mjs';
import {lettreLiaisonCda} from './cda.mjs';

export function dmpConfig(env=process.env){
 const cfg=connectorConfig('dmp',['DMP_ENDPOINT','DMP_LPS_NOM','DMP_LPS_VERSION','DMP_NIL','ETABLISSEMENT_FINESS'],env);
 cfg.certificate=clientCertificate('DMP',env);cfg.signing=clientCertificate('DMP_SIGN',env);
 if(cfg.mode!=='simulation'){if(!cfg.certificate)cfg.missing.push('DMP_CERT_P12_BASE64 (ORG_AUTH_CLI)');if(!cfg.signing)cfg.missing.push('DMP_SIGN_CERT_P12_BASE64 (ORG_SIGN)')}
 cfg.ready=cfg.mode==='simulation'||!cfg.missing.length;return cfg;
}

export function checkDmpPreconditions({identity,consent,author}){
 const errors=[];
 if(identity?.status!=='Qualifiée'||!identity?.ins?.matricule)errors.push('INS qualifiée requise (identitovigilance).');
 if(!consent?.informed)errors.push('Patient non informé de l’alimentation de son DMP.');
 if(consent?.opposition)errors.push('Opposition du patient à l’alimentation du DMP.');
 if(!/^1\d{10}$/.test(author?.rpps||''))errors.push('Auteur sans RPPS : connexion Pro Santé Connect requise.');
 return errors;
}

// Attributs du jeton VIHF (référentiel DMP) ; la signature est faite par `signer`.
export function vihfAttributes({author,cfg,mode,role='10'}){
 return {Identifiant_Structure:'1'+cfg.values.ETABLISSEMENT_FINESS,Secteur_Activite:'SA01^1.2.250.1.213.1.1.4.9',Subject_Role:role+'^1.2.250.1.213.1.1.5.5',Subject_ID:'8'+author.rpps,
  Authentification_Mode:'INDIRECTE',Ressource_URN:'urn:dmp',LPS_Nom:cfg.values.DMP_LPS_NOM,LPS_Version:cfg.values.DMP_LPS_VERSION,LPS_ID:cfg.values.DMP_NIL,
  ...(mode==='production'?{LPS_Autorisation:cfg.autorisation}:{})};
}

export function buildDmpSubmission({patient,ins,author,establishment,pdfBase64,cfg,at=new Date()}){
 const documentId=randomUUID(),cda=lettreLiaisonCda({patient,ins,author,establishment,pdfBase64,at,id:documentId});
 return {cda,metadata:{
  submissionSet:{uniqueId:'1.2.250.1.213.1.1.9.'+Date.now(),sourceId:'1.2.250.1.71.4.2.2',patientId:ins.matricule+'^^^&'+ins.oid+'&ISO',submissionTime:at.toISOString(),contentTypeCode:'04^Hospitalisation de jour^1.2.250.1.213.1.1.4.12'},
  documentEntry:{uniqueId:documentId,classCode:'11490-0^Note de sortie^2.16.840.1.113883.6.1',typeCode:'34133-9^Synthèse d’épisode de soins^2.16.840.1.113883.6.1',formatCode:'urn:ihe:iti:xds-sd:pdf:2008^PDF^1.3.6.1.4.1.19376.1.2.3',mimeType:'text/xml',
   confidentialityCode:'N^Normal^2.16.840.1.113883.5.25',healthcareFacilityTypeCode:'SA01^Établissement public ou privé^1.2.250.1.71.4.2.4',practiceSettingCode:'ETABLISSEMENT^Établissement de santé^1.2.250.1.213.1.1.4.9',
   patientId:ins.matricule+'^^^&'+ins.oid+'&ISO',author:'8'+author.rpps,languageCode:'fr-FR'}
 },vihf:vihfAttributes({author,cfg,mode:cfg.mode})};
}

export function createDmp({env=process.env,post=postMutualTls,signer=null}={}){
 const cfg=dmpConfig(env);
 async function send(input){
  requireReady(cfg);const errors=checkDmpPreconditions(input);if(errors.length)throw Error(errors.join(' '));
  if(!signer)throw Error('DMP : signature VIHF et enveloppe ITI-41 à brancher avec le package DMP du CNDA (voir docs/homologations.md). Aucun envoi effectué.');
  const submission=buildDmpSubmission({...input,cfg,establishment:{finess:cfg.values.ETABLISSEMENT_FINESS,name:env.ETABLISSEMENT_NOM||''}});
  const body=await signer.envelope(submission,cfg);
  const r=await post(cfg.values.DMP_ENDPOINT,{body,certificate:cfg.certificate,headers:{'Content-Type':'application/soap+xml; charset=utf-8'}});
  const status=/ResponseStatusType:Success/.test(r.text)?'success':/ResponseStatusType:Failure/.test(r.text)?'failure':'unknown';
  if(status!=='success')throw Error('DMP : soumission refusée ('+(r.text.match(/codeContext="([^"]{0,200})"/)?.[1]||r.status)+').');
  return {mode:cfg.mode,documentId:submission.metadata.documentEntry.uniqueId};
 }
 return {cfg,send};
}

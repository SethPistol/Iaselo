// Téléservice INSi (Assurance Maladie) : recherche et vérification de l'Identité Nationale de Santé.
// Accès réservé aux logiciels autorisés par le CNDA ; authentification du logiciel par TLS mutuel avec un
// certificat IGC-Santé de l'établissement (personne morale, usage AUTH_CLI) ou une carte CPx nominative.
// Chaque requête porte le « contexte LPS » avec le numéro d'autorisation CNDA du logiciel.
//
// Variables (Clever Cloud) :
//   INTEROP_INSI_MODE            simulation | test (plateforme CNDA) | production
//   INSI_ENDPOINT                URL du service, fournie dans le package INSi / par le CNDA
//   INSI_CERT_P12_BASE64 + INSI_CERT_PASSWORD (ou INSI_CERT_PEM + INSI_KEY_PEM, INSI_CA_PEM)
//   INSI_LPS_NOM, INSI_LPS_VERSION      nom et version du logiciel déclarés au CNDA
//   INSI_IDAM                    identifiant d'autorisation du logiciel (fourni par le CNDA)
//   INSI_FINESS                  FINESS juridique ou géographique de l'établissement appelant
//   INTEROP_INSI_AUTORISATION    production : n° d'autorisation CNDA
//
// IMPORTANT : la forme exacte des messages (espaces de noms, en-têtes « ContexteLAM », WS-Addressing)
// est définie par le WSDL et le guide d'intégration du package INSi (SEL-MP-043) du GIE SESAM-Vitale,
// téléchargeables seulement après inscription. Les constantes ci-dessous sont le point unique à aligner
// sur ces documents ; les tests de la plateforme CNDA valideront le résultat.
import {randomUUID} from 'node:crypto';
import {connectorConfig,requireReady} from './modes.mjs';
import {clientCertificate,postMutualTls} from './transport.mjs';

export const INSI_SPEC={
 soapAction:'urn:ServiceIdentiteCertifiee:1.0.0:rechercherInsAvecTraitsIdentite',
 nsService:'http://www.cnamts.fr/webservice',
 nsContexte:'urn:siram:lps',
 nsAddressing:'http://www.w3.org/2005/08/addressing',
 action:'urn:ServiceIdentiteCertifiee:1.0.0:rechercherInsAvecTraitsIdentite'
};
// OID des matricules INS (référentiel INS, ANS) : production et identités de test.
export const INS_OID={'1.2.250.1.213.1.4.8':'NIR','1.2.250.1.213.1.4.9':'NIA','1.2.250.1.213.1.4.10':'NIR de test','1.2.250.1.213.1.4.11':'NIA de test'};

export function insiConfig(env=process.env){
 const cfg=connectorConfig('insi',['INSI_ENDPOINT','INSI_LPS_NOM','INSI_LPS_VERSION','INSI_IDAM','INSI_FINESS'],env);
 cfg.certificate=clientCertificate('INSI',env);if(cfg.mode!=='simulation'&&!cfg.certificate)cfg.missing.push('INSI_CERT_P12_BASE64 ou INSI_CERT_PEM');
 cfg.ready=cfg.mode==='simulation'||!cfg.missing.length;return cfg;
}
const x=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));

// Traits stricts attendus par l'INSi (RNIV) : nom de naissance, prénom(s), sexe, date de naissance, lieu.
export function insiTraits(identity={}){
 const sex={F:'F',M:'M'}[identity.sex];
 const out={nomNaissance:String(identity.birthName||'').trim().toUpperCase(),prenom:String(identity.firstName||'').trim().toUpperCase(),sexe:sex||'',dateNaissance:String(identity.birthDate||'').trim(),lieuNaissance:String(identity.birthPlace||'').trim()};
 const missing=[!out.nomNaissance&&'nom de naissance',!out.prenom&&'prénom',!out.sexe&&'sexe (F ou M)',!/^\d{4}-\d{2}-\d{2}$/.test(out.dateNaissance)&&'date de naissance'].filter(Boolean);
 if(missing.length)throw Error('Traits insuffisants pour l’INSi : '+missing.join(', ')+'.');
 return out;
}

export function buildInsiRequest(traits,cfg,{messageId='uuid:'+randomUUID(),at=new Date()}={}){
 const v=cfg.values;
 return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="${INSI_SPEC.nsAddressing}" xmlns:ctx="${INSI_SPEC.nsContexte}" xmlns:ins="${INSI_SPEC.nsService}">
 <soap:Header>
  <wsa:Action>${INSI_SPEC.action}</wsa:Action>
  <wsa:MessageID>${x(messageId)}</wsa:MessageID>
  <ctx:ContexteLAM Version="01_02">
   <ctx:Id>${x(messageId)}</ctx:Id>
   <ctx:Temps>${at.toISOString()}</ctx:Temps>
   <ctx:Emetteur>${x(v.INSI_FINESS)}</ctx:Emetteur>
   <ctx:COUVERTURE/>
   <ctx:LPS>
    <ctx:IDAM R="4">${x(v.INSI_IDAM)}</ctx:IDAM>
    <ctx:Version>${x(v.INSI_LPS_VERSION)}</ctx:Version>
    <ctx:Instance>${x(cfg.instance||randomUUID())}</ctx:Instance>
    <ctx:Nom>${x(v.INSI_LPS_NOM)}</ctx:Nom>
   </ctx:LPS>
  </ctx:ContexteLAM>
 </soap:Header>
 <soap:Body>
  <ins:RECSANSVITALE>
   <ins:NomNaissance>${x(traits.nomNaissance)}</ins:NomNaissance>
   <ins:Prenom>${x(traits.prenom)}</ins:Prenom>
   <ins:Sexe>${x(traits.sexe)}</ins:Sexe>
   <ins:DateNaissance>${x(traits.dateNaissance)}</ins:DateNaissance>${traits.lieuNaissance?`
   <ins:LieuNaissance>${x(traits.lieuNaissance)}</ins:LieuNaissance>`:''}
  </ins:RECSANSVITALE>
 </soap:Body>
</soap:Envelope>`;
}

// Lecture tolérante aux préfixes d'espace de noms.
const tag=(xml,name)=>{const m=new RegExp('<(?:[\\w-]+:)?'+name+'\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?'+name+'>').exec(xml);return m?m[1].trim():''};
const unx=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export function parseInsiResponse(xml){
 const fault=tag(xml,'Fault');if(fault)throw Error('INSi : erreur '+(unx(tag(fault,'Text')||tag(fault,'faultstring'))||'SOAP').slice(0,200));
 const code=tag(tag(xml,'CR'),'CodeCR')||tag(xml,'CodeCR'),label=unx(tag(tag(xml,'CR'),'LibelleCR'));
 // 00 : une identité trouvée ; 01 : aucune ; 02 : plusieurs identités (guide d'intégration INSi).
 if(code==='01')return {outcome:'notfound',code,label};
 if(code==='02')return {outcome:'multiple',code,label};
 if(code!=='00')throw Error('INSi : code retour inattendu '+(code||'absent')+(label?' · '+label:''));
 const actif=tag(xml,'INSACTIF')||tag(xml,'INDIVIDU'),idBlock=tag(actif,'IdIndividu'),tiq=tag(xml,'TIQ');
 const oid=tag(actif,'OID')||tag(idBlock,'OID');
 return {outcome:'found',code,label,
  ins:{matricule:tag(idBlock,'NumIdentifiant')+tag(idBlock,'Cle'),oid,type:INS_OID[oid]||'inconnu',test:/\.1[01]$/.test(oid)},
  traits:{birthName:unx(tag(tiq,'NomNaissance')),firstName:unx(tag(tiq,'Prenom')),birthFirstNames:unx(tag(tiq,'ListePrenom')),sex:tag(tiq,'Sexe'),birthDate:tag(tiq,'DateNaissance'),birthPlace:tag(tiq,'LieuNaissance')}};
}

// Comparaison des traits renvoyés avec l'identité locale : la qualification reste une décision humaine
// (justificatif à haut niveau de confiance contrôlé + concordance), conformément au RNIV.
export function compareTraits(local,remote){
 const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
 const keys=['birthName','firstName','birthDate','sex'].concat(local.birthPlace&&remote.birthPlace?['birthPlace']:[]);
 const diffs=keys.filter(k=>norm(local[k])!==norm(remote[k]));return {concordant:!diffs.length,diffs};
}

export function createInsi({env=process.env,post=postMutualTls}={}){
 const cfg=insiConfig(env);
 async function search(identity){
  requireReady(cfg);const traits=insiTraits(identity),body=buildInsiRequest(traits,cfg);
  const r=await post(cfg.values.INSI_ENDPOINT,{body,certificate:cfg.certificate,headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+INSI_SPEC.soapAction+'"'}});
  if(r.status>=500&&!/Fault/.test(r.text))throw Error('INSi indisponible ('+r.status+').');
  const result=parseInsiResponse(r.text);
  if(result.outcome==='found'){
   if(cfg.mode==='production'&&result.ins.test)throw Error('INSi a renvoyé une INS de test en production : appel bloqué.');
   if(cfg.mode==='test'&&!result.ins.test)throw Error('Environnement de test : INS réelle reçue, résultat écarté.');
   result.comparison=compareTraits(identity,result.traits);
  }
  return {mode:cfg.mode,...result};
 }
 return {cfg,search};
}

// Lettre de liaison de sortie au format CDA R2 (CI-SIS, ANS), pour le DMP et la MSSanté.
// Niveau 1 : corps non structuré (PDF de la lettre relue) + en-tête structuré (patient INS, auteur RPPS,
// établissement FINESS). Les identifiants de modèle (templateId) et la nomenclature sont à valider avec
// le validateur / les schématrons du CI-SIS (volet « Lettre de liaison à la sortie d'un établissement »).
import {randomUUID} from 'node:crypto';
const x=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export const OID={rpps:'1.2.250.1.71.4.2.1',structure:'1.2.250.1.71.4.2.2',uuidRoot:'1.2.250.1.213.1.1.9'};
export const CDA_SPEC={
 templateIds:['2.16.840.1.113883.2.8.2.1','1.2.250.1.213.1.1.1.1','1.2.250.1.213.1.1.1.29'],
 code:{code:'34133-9',system:'2.16.840.1.113883.6.1',display:'Synthèse d’épisode de soins'},
 confidentiality:'N'
};
const ts=d=>new Date(d).toISOString().replace(/[-:T]/g,'').slice(0,14)+'+0000';
export function lettreLiaisonCda({patient,ins,author,establishment,pdfBase64,title='Lettre de liaison de sortie',at=new Date(),id=randomUUID()}){
 if(!ins?.matricule||!ins?.oid)throw Error('INS qualifiée requise pour produire un document destiné au DMP.');
 if(!/^1\d{10}$/.test(author?.rpps||''))throw Error('RPPS de l’auteur requis (connexion Pro Santé Connect).');
 if(!/^\d{9}$/.test(establishment?.finess||''))throw Error('FINESS de l’établissement requis.');
 if(!pdfBase64)throw Error('Document PDF de la lettre relue requis.');
 return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <realmCode code="FR"/>
 <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
${CDA_SPEC.templateIds.map(t=>` <templateId root="${t}"/>`).join('\n')}
 <id root="${OID.uuidRoot}" extension="${x(id)}"/>
 <code code="${CDA_SPEC.code.code}" codeSystem="${CDA_SPEC.code.system}" displayName="${x(CDA_SPEC.code.display)}"/>
 <title>${x(title)}</title>
 <effectiveTime value="${ts(at)}"/>
 <confidentialityCode code="${CDA_SPEC.confidentiality}" codeSystem="2.16.840.1.113883.5.25"/>
 <languageCode code="fr-FR"/>
 <setId root="${OID.uuidRoot}" extension="${x(id)}"/>
 <versionNumber value="1"/>
 <recordTarget><patientRole>
  <id root="${x(ins.oid)}" extension="${x(ins.matricule)}"/>
  <patient>
   <name><family qualifier="BR">${x(patient.birthName)}</family><given>${x(patient.firstName)}</given></name>
   <administrativeGenderCode code="${x(patient.sex)}" codeSystem="2.16.840.1.113883.5.1"/>
   <birthTime value="${x(String(patient.birthDate||'').replace(/-/g,''))}"/>
  </patient>
 </patientRole></recordTarget>
 <author><time value="${ts(at)}"/><assignedAuthor>
  <id root="${OID.rpps}" extension="8${x(author.rpps)}"/>
  <assignedPerson><name><family>${x(author.lastName||'')}</family><given>${x(author.firstName||'')}</given></name></assignedPerson>
  <representedOrganization><id root="${OID.structure}" extension="1${x(establishment.finess)}"/><name>${x(establishment.name)}</name></representedOrganization>
 </assignedAuthor></author>
 <custodian><assignedCustodian><representedCustodianOrganization>
  <id root="${OID.structure}" extension="1${x(establishment.finess)}"/><name>${x(establishment.name)}</name>
 </representedCustodianOrganization></assignedCustodian></custodian>
 <component><nonXMLBody><text mediaType="application/pdf" representation="B64">${pdfBase64}</text></nonXMLBody></component>
</ClinicalDocument>`;
}

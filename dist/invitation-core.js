(function(root){
'use strict';
const clean=s=>String(s||'').normalize('NFC').replace(/[\u200b-\u200f]/g,'').trim();
const normalized=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function phone(value){let v=clean(value).replace(/[^\d+]/g,'');if(v.startsWith('0033'))v='+'+v.slice(2);if(v.startsWith('+330'))v='+33'+v.slice(4);if(/^0\d{9}$/.test(v))v='+33'+v.slice(1);return /^\+\d{8,15}$/.test(v)?v:''}
function birthDate(value){const m=clean(value).match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);if(!m)return '';const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'),d=new Date(iso+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso&&Number(m[3])>=1900&&iso<=new Date().toISOString().slice(0,10)?iso:''}
function parseProfile(text){
 const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);let firstName='',lastName='',dob='';
 const get=(pattern)=>{const i=lines.findIndex(x=>pattern.test(x));if(i<0)return '';const value=lines[i].replace(pattern,'').replace(/^\s*[:\-]\s*/,'').trim();return value||lines[i+1]||''};
 firstName=get(/^pr[eé]nom(?:\(s\))?\s*[:\-]?\s*/i);lastName=get(/^nom (?:de naissance|utilis[eé])\s*[:\-]?\s*/i)||get(/^nom\s*[:\-]\s*/i);
 const labeledDate=get(/^(?:date de naissance|n[eé](?:e)? le|naissance)\s*[:\-]?\s*/i);dob=birthDate(labeledDate);
 const emailCandidates=[...new Set((String(text||'').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi)||[]).map(clean))];
 const phoneMatches=String(text||'').match(/(?:\+33\s*(?:\(0\))?|0033\s*|0)[1-9](?:[ .\-]?\d{2}){4}/g)||[];
 const phoneCandidates=[...new Set(phoneMatches.map(phone).filter(Boolean))];
 if(!firstName||!lastName){const header=lines.find(x=>/^(?:M\.|Mme|Mlle|Monsieur|Madame)\s+/i.test(x));if(header){const name=header.replace(/^(?:M\.|Mme|Mlle|Monsieur|Madame)\s+/i,'').replace(/\s*\d.*$/,'').trim().split(/\s+/);if(name.length>=2){firstName||=name[0];lastName||=name.slice(1).join(' ')}}}
 return {firstName:clean(firstName).slice(0,100),lastName:clean(lastName).slice(0,100),birthDate:dob,email:emailCandidates[0]||'',phone:phoneCandidates[0]||'',emailCandidates,phoneCandidates};
}
function contactError(v){if(!v||typeof v!=='object'||Object.values(v).some(x=>typeof x!=='string'||x.length>180))return 'Coordonnées invalides.';if(!clean(v.firstName)||!clean(v.lastName)||!/^\d{4}-\d\d-\d\d$/.test(v.birthDate)||!birthDate(v.birthDate.slice(8)+'/'+v.birthDate.slice(5,7)+'/'+v.birthDate.slice(0,4)))return 'Vérifiez le nom, le prénom et la date de naissance.';if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))return 'Adresse e-mail invalide.';if(v.phone&&!phone(v.phone))return 'Numéro de téléphone invalide.';if(!v.email&&!phone(v.phone))return 'Un e-mail ou un téléphone est nécessaire.';return ''}
function contact(v){return {firstName:clean(v.firstName),lastName:clean(v.lastName),birthDate:clean(v.birthDate),email:clean(v.email),phone:phone(v.phone)}}
function matchesIdentity(a,b){return normalized(a.firstName)===normalized(b.firstName)&&normalized(a.lastName)===normalized(b.lastName)&&a.birthDate===b.birthDate}
root.InvitationCore={parseProfile,phone,birthDate,contactError,contact,matchesIdentity,normalized};if(typeof module!=='undefined')module.exports=root.InvitationCore;
})(typeof window!=='undefined'?window:globalThis);

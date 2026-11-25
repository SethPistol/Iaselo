/* IASELO · formats d'échange hospitaliers : HL7 v2 (IHE PAM / ORU) et HPRIM Santé.
   Fonctions pures, partagées par le serveur (worker/marche.mjs) et les écrans, testées dans tests/interop-hl7.test.cjs.
   - lecture et écriture HL7 v2.5 (séparateurs |^~\&, échappements \F\ \S\ \T\ \R\ \E\) ;
   - résultats de biologie : ORU^R01 (HL7) et HPRIM Santé 2.x (enregistrements H, P, OBR, OBX, L) ;
   - mouvements administratifs : ADT^A01/A02/A03/A04/A08/A11/A12/A13 (IHE PAM France) ;
   - envoi des actes au logiciel administratif : DFT^P03 (CCAM) ;
   - constantes des moniteurs : ORU^R01 avec codes MDC (IEEE 11073) ou libellés constructeur.
   Les formats exacts de chaque laboratoire, du logiciel administratif et de la passerelle des moniteurs se valident
   à l'installation (fichiers d'exemple fournis par chaque éditeur). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloHl7=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const OID_INS_NIR='1.2.250.1.213.1.4.8',OID_INS_NIA='1.2.250.1.213.1.4.9',OID_INS_TEST='1.2.250.1.213.1.4.10',OID_INS_DEMO='1.2.250.1.213.1.4.11';
const texte=v=>v===undefined||v===null?'':String(v);
const lignes=msg=>texte(msg).replace(/^﻿/,'').split(/\r\n|\r|\n/).map(l=>l.trimEnd()).filter(Boolean);

/* ---------- HL7 v2 ---------- */
function separateurs(msh){const f=msh.charAt(3)||'|',enc=msh.slice(4,8);return {champ:f,comp:enc[0]||'^',rep:enc[1]||'~',esc:enc[2]||'\\',sous:enc[3]||'&'}}
function desechapper(v,s){if(!v.includes(s.esc))return v;const e=s.esc.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&');return v.replace(new RegExp(e+'(F|S|T|R|E|X[0-9A-Fa-f]+|\\.br)'+e,'g'),(m,c)=>c==='F'?s.champ:c==='S'?s.comp:c==='T'?s.sous:c==='R'?s.rep:c==='E'?s.esc:c==='.br'?'\n':c[0]==='X'?String.fromCharCode(...c.slice(1).match(/../g).map(h=>parseInt(h,16))):m)}
function echapper(v,s=SEP){return texte(v).replace(/\\/g,'\\E\\').replace(/\|/g,'\\F\\').replace(/\^/g,'\\S\\').replace(/&/g,'\\T\\').replace(/~/g,'\\R\\').replace(/\r?\n/g,'\\.br\\')}
const SEP={champ:'|',comp:'^',rep:'~',esc:'\\',sous:'&'};
// Lit un message HL7 v2 : segments → champs → répétitions → composants. MSH-1 est le séparateur lui-même.
function lireHl7(msg){
 const ls=lignes(msg);if(!ls.length||!ls[0].startsWith('MSH'))throw Error('Message HL7 : segment MSH absent en tête.');
 const s=separateurs(ls[0]);
 const segments=ls.map(l=>{const brut=l.split(s.champ),nom=brut[0];let champs=brut.slice(1);if(nom==='MSH')champs=[s.champ,...champs];
  return {nom,champs:champs.map((c,i)=>nom==='MSH'&&i<2?[[c]]:c.split(s.rep).map(r=>r.split(s.comp).map(x=>desechapper(x,s))))}});
 return {sep:s,segments};
}
// Valeur d'un champ : seg = segment lu, n = numéro HL7 (MSH-9 → 9), comp = numéro de composant (1 par défaut), rep = répétition.
function val(seg,n,comp=1,rep=0){if(!seg)return '';const c=seg.champs[n-1];if(!c)return '';const r=c[rep];if(!r)return '';return texte(r[comp-1]).trim()}
function reps(seg,n){return seg?.champs[n-1]||[]}
const segs=(m,nom)=>m.segments.filter(x=>x.nom===nom);
const seg=(m,nom)=>m.segments.find(x=>x.nom===nom)||null;
function dateHl7(v){const m=texte(v).match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?/);if(!m)return '';return m[4]?`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}`:`${m[1]}-${m[2]}-${m[3]}`}
function versDateHl7(iso){const d=texte(iso).replace(/[-:T]/g,'').replace(/\..*$/,'').replace(/Z$/,'');return d.slice(0,14)}
// Identité du patient (PID) : INS (OID INS-NIR / NIA), IPP, nom de naissance, prénom, naissance, sexe.
function identite(pid){
 const ids=reps(pid,3).map(r=>({id:texte(r[0]).trim(),autorite:texte(r[3]).split('&').filter(Boolean),type:texte(r[4]).trim()}));
 const ins=ids.find(x=>x.type==='INS'||x.autorite.some(a=>[OID_INS_NIR,OID_INS_NIA,OID_INS_TEST,OID_INS_DEMO].includes(a)));
 const ipp=ids.find(x=>x!==ins&&(x.type==='PI'||!x.type))||null;
 const noms=reps(pid,5).map(r=>({nom:texte(r[0]).trim(),prenom:texte(r[1]).trim(),type:texte(r[6]).trim()}));
 const naiss=noms.find(n=>n.type==='L')||noms[0]||{nom:'',prenom:''},usage=noms.find(n=>n.type==='D');
 const sexe={F:'Féminin',M:'Masculin'}[val(pid,8)]||'';
 return {ins:ins?.id||'',ipp:ipp?.id||'',nom:naiss.nom.toUpperCase(),prenom:naiss.prenom,nomUsage:usage?.nom?.toUpperCase()||'',naissance:dateHl7(val(pid,7)).slice(0,10),sexe};
}
function entete(m){const h=seg(m,'MSH');return {type:val(h,9,1),evenement:val(h,9,2),structure:val(h,9,3),id:val(h,10),emetteur:[val(h,3),val(h,4)].filter(Boolean).join(' · '),date:dateHl7(val(h,7)),version:val(h,12)}}
// Accusé de réception (ACK) : AA accepté, AE erreur, AR rejet.
function ack(msg,code='AA',texteErreur=''){
 let m=null;try{m=lireHl7(msg)}catch{}
 const h=m?seg(m,'MSH'):null,now=versDateHl7(new Date().toISOString());
 return ['MSH|^~\\&|IASELO|CLINIQUE|'+echapper(h?val(h,3):'')+'|'+echapper(h?val(h,4):'')+'|'+now+'||ACK^'+echapper(h?val(h,9,2):'')+'^ACK|ACK'+now+'|P|2.5','MSA|'+code+'|'+echapper(h?val(h,10):'')+(texteErreur?'|'+echapper(texteErreur.slice(0,80)):'')].join('\r');
}
function construire(segments){return segments.map(s=>s.map((c,i)=>i===0||s[0]==='MSH'&&i===1?c:Array.isArray(c)?c.map(x=>Array.isArray(x)?x.map(y=>Array.isArray(y)?y.map(z=>echapper(z)).join('&'):echapper(y)).join('^'):echapper(x)).join('~'):echapper(c)).join('|')).join('\r')}

/* ---------- Biologie ---------- */
const DRAPEAUX={H:'haut',HH:'critique-haut',L:'bas',LL:'critique-bas',A:'anormal',AA:'critique',N:'normal','>':'haut','<':'bas',HI:'haut',LO:'bas'};
function num(v){const m=texte(v).replace(',','.').match(/^\s*[<>≤≥]?\s*(-?\d+(?:\.\d+)?)\s*$/);return m?Number(m[1]):null}
// Interprétation d'une valeur selon l'intervalle de référence quand le laboratoire n'a pas mis d'indicateur.
function interpreter(valeur,intervalle,drapeau){
 const d=DRAPEAUX[texte(drapeau).toUpperCase()];if(d)return d;
 const x=num(valeur);if(x===null)return '';
 const r=texte(intervalle).replace(/,/g,'.').trim();let m;
 if((m=r.match(/^(-?\d+(?:\.\d+)?)\s*[-–à]\s*(-?\d+(?:\.\d+)?)/)))return x<Number(m[1])?'bas':x>Number(m[2])?'haut':'normal';
 if((m=r.match(/^[<≤]\s*(-?\d+(?:\.\d+)?)/)))return x>Number(m[1])?'haut':'normal';
 if((m=r.match(/^[>≥]\s*(-?\d+(?:\.\d+)?)/)))return x<Number(m[1])?'bas':'normal';
 return '';
}
// Valeurs critiques à signaler sans délai (repères usuels des laboratoires ; à faire valider par la biologie de la clinique).
const CRITIQUES=[
 {cle:'potassium',re:/\b(potassium|kali[eé]mie|^k\+?$)\b/i,unites:/mmol/i,bas:2.8,haut:6.2},
 {cle:'sodium',re:/\b(sodium|natr[eé]mie|^na\+?$)\b/i,unites:/mmol/i,bas:120,haut:160},
 {cle:'hemoglobine',re:/\b(h[eé]moglobine|^hb$|^hgb$)\b/i,unites:/g\/dl/i,bas:7,haut:20},
 {cle:'hemoglobine',re:/\b(h[eé]moglobine|^hb$|^hgb$)\b/i,unites:/g\/l/i,bas:70,haut:200},
 {cle:'plaquettes',re:/\b(plaquettes|^plt$|thrombocytes)\b/i,unites:/(g\/l|10\^?9|giga)/i,bas:50,haut:1000},
 {cle:'glycemie',re:/\b(glyc[eé]mie|glucose|^glu$)\b/i,unites:/mmol/i,bas:2.8,haut:25},
 {cle:'glycemie',re:/\b(glyc[eé]mie|glucose|^glu$)\b/i,unites:/g\/l/i,bas:0.5,haut:4.5},
 {cle:'inr',re:/\b(inr)\b/i,unites:/.*/,bas:null,haut:5},
 {cle:'calcium',re:/\b(calc[eé]mie|calcium)\b(?!.*ionis)/i,unites:/mmol/i,bas:1.75,haut:3.5},
 {cle:'leucocytes',re:/\b(leucocytes|globules blancs|^gb$|^wbc$)\b/i,unites:/(g\/l|10\^?9|giga)/i,bas:1,haut:50},
 {cle:'creatinine',re:/\b(cr[eé]atinin[eé]mie|cr[eé]atinine)\b/i,unites:/[µu]mol/i,bas:null,haut:600}
];
function critique(libelle,valeur,unite){const x=num(valeur);if(x===null)return null;const l=texte(libelle).trim();
 for(const c of CRITIQUES)if(c.re.test(l)&&c.unites.test(texte(unite))){if(c.bas!==null&&x<c.bas)return {cle:c.cle,sens:'bas',seuil:c.bas};if(c.haut!==null&&x>c.haut)return {cle:c.cle,sens:'haut',seuil:c.haut}}
 return null}
function resultat(o){const statut=o.statut||'F',interpretation=interpreter(o.valeur,o.intervalle,o.drapeau),crit=critique(o.libelle,o.valeur,o.unite);
 return {code:o.code||'',libelle:o.libelle||o.code||'',systeme:o.systeme||'',valeur:texte(o.valeur),unite:o.unite||'',intervalle:o.intervalle||'',interpretation:crit?'critique-'+crit.sens:interpretation,critique:!!crit||/critique/.test(interpretation),statut:{F:'final',C:'corrigé',P:'partiel',R:'non validé',I:'en attente',X:'annulé',D:'supprimé'}[statut]||statut,date:o.date||'',commentaire:o.commentaire||''}}
// ORU^R01 : un compte rendu de biologie (un ou plusieurs patients, un ou plusieurs examens).
function biologieDepuisHl7(msg){
 const m=lireHl7(msg),h=entete(m);if(h.type!=='ORU')throw Error('Message HL7 '+h.type+'^'+h.evenement+' : un résultat de biologie est un ORU^R01.');
 const out=[];let cur=null,obr=null;
 for(const s of m.segments){
  if(s.nom==='PID'){cur={patient:identite(s),demandes:[]};out.push(cur);obr=null}
  else if(s.nom==='PV1'&&cur)cur.nda=val(s,19)||cur.nda||'';
  else if(s.nom==='OBR'&&cur){obr={code:val(s,4,1),libelle:val(s,4,2)||val(s,4,1),prelevement:dateHl7(val(s,7)),numero:val(s,3)||val(s,2),prescripteur:[val(s,16,2),val(s,16,3)].filter(Boolean).join(' '),resultats:[]};cur.demandes.push(obr)}
  else if(s.nom==='OBX'&&cur){if(!obr){obr={code:'',libelle:'Résultats',prelevement:'',numero:'',prescripteur:'',resultats:[]};cur.demandes.push(obr)}
   if(val(s,2)==='ED'||val(s,2)==='RP'){obr.document={type:val(s,5,2)||'PDF',encodage:val(s,5,4),donnees:val(s,5,5)};continue}
   obr.resultats.push(resultat({code:val(s,3,1),libelle:val(s,3,2),systeme:val(s,3,3),valeur:reps(s,5).map(r=>texte(r[0])).join(' ').trim(),unite:val(s,6,1),intervalle:val(s,7),drapeau:val(s,8),statut:val(s,11),date:dateHl7(val(s,14))}))}
  else if(s.nom==='NTE'&&obr&&obr.resultats.length){const r=obr.resultats.at(-1);r.commentaire=(r.commentaire?r.commentaire+' ':'')+val(s,3)}
 }
 if(!out.length)throw Error('Message HL7 sans segment PID (patient).');
 return {format:'HL7 v2 ORU^R01',emetteur:h.emetteur,idMessage:h.id,date:h.date,comptesRendus:out};
}
// HPRIM Santé 2.x (biologie) : enregistrements séparés par |, composants par ^ ; H en tête, L en fin.
// P|rang|IPP|n° labo|n° dossier|NOM^Prénom^^^titre|nom de naissance|naissance AAAAMMJJ|sexe|…
// OBX|rang|type|code^libellé^système|sous-id|valeur|unité|normales|drapeau|||statut|…
function biologieDepuisHprim(msg){
 const ls=lignes(msg).filter(l=>!/^A\|/.test(l));if(!ls.length||!/^H\|/.test(ls[0]))throw Error('Fichier HPRIM : enregistrement H absent en tête.');
 const h=ls[0].split('|'),out=[];let cur=null,obr=null;
 const c=(v,i)=>texte(texte(v).split('^')[i]).trim();
 for(const l of ls.slice(1)){const f=l.split('|');
  if(f[0]==='P'){const naiss=texte(f[7]).trim(),nom=c(f[5],0),prenom=c(f[5],1);cur={patient:{ins:'',ipp:texte(f[2]).trim(),nom:(texte(f[6]).trim()||nom).toUpperCase(),nomUsage:nom.toUpperCase(),prenom,naissance:dateHl7(naiss).slice(0,10),sexe:{F:'Féminin',M:'Masculin'}[texte(f[8]).trim()]||''},nda:texte(f[4]).trim(),demandes:[]};out.push(cur);obr=null}
  else if(f[0]==='OBR'&&cur){obr={code:c(f[4],0),libelle:c(f[4],1)||c(f[4],0),prelevement:dateHl7(f[7]),numero:texte(f[3]||f[2]).trim(),prescripteur:'',resultats:[]};cur.demandes.push(obr)}
  else if(f[0]==='OBX'&&cur){if(!obr){obr={code:'',libelle:'Résultats',prelevement:'',numero:'',prescripteur:'',resultats:[]};cur.demandes.push(obr)}
   obr.resultats.push(resultat({code:c(f[3],0),libelle:c(f[3],1),systeme:c(f[3],2),valeur:texte(f[5]).trim(),unite:texte(f[6]).trim(),intervalle:texte(f[7]).trim(),drapeau:texte(f[8]).trim(),statut:texte(f[11]).trim()||'F',date:dateHl7(f[14])}))}
  else if(f[0]==='C'&&obr&&obr.resultats.length){const r=obr.resultats.at(-1);r.commentaire=(r.commentaire?r.commentaire+' ':'')+texte(f.at(-1)).trim()}
 }
 if(!out.length)throw Error('Fichier HPRIM sans enregistrement P (patient).');
 return {format:'HPRIM Santé',emetteur:texte(h[4]||h[3]).split('^')[0].trim(),idMessage:texte(h[2]).trim(),date:dateHl7(h[13]||h[12]||''),comptesRendus:out};
}
function lireBiologie(msg){const t=texte(msg).replace(/^﻿/,'').trimStart();if(t.startsWith('MSH'))return biologieDepuisHl7(t);if(/^H\|/.test(t))return biologieDepuisHprim(t);throw Error('Format non reconnu : HL7 v2 (MSH…) ou HPRIM Santé (H|…) attendu.')}

/* ---------- Rapprochement d'identité (identitovigilance) ---------- */
const norm=s=>texte(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
// Rattachement automatique seulement sur INS ou IPP identiques ; nom + prénom + naissance identiques = proposition à confirmer.
function rapprocher(patient,sejours){
 const out=[];
 for(const s of sejours||[]){const i=s.identity||{};let niveau='',motif='';
  if(patient.ins&&i.ins&&patient.ins===String(i.ins).replace(/\s/g,'')){niveau='certain';motif='INS identique'}
  else if(patient.ipp&&s.ipp&&patient.ipp===String(s.ipp)){niveau='certain';motif='IPP identique'}
  else if(norm(patient.nom)&&norm(patient.naissance)&&norm(i.birthDate)===norm(patient.naissance)&&(norm(i.lastName)===norm(patient.nom)||norm(i.lastName)===norm(patient.nomUsage))&&norm(i.firstName).split(' ')[0]===norm(patient.prenom).split(' ')[0]){niveau='probable';motif='Nom, premier prénom et date de naissance identiques'}
  else if(norm(i.birthDate)===norm(patient.naissance)&&norm(i.lastName)&&(norm(i.lastName)===norm(patient.nom)||norm(i.lastName)===norm(patient.nomUsage))){niveau='possible';motif='Nom et date de naissance identiques, prénom différent'}
  if(niveau)out.push({stay:s.id,niveau,motif});
 }
 const rang={certain:0,probable:1,possible:2};out.sort((a,b)=>rang[a.niveau]-rang[b.niveau]);
 const certains=out.filter(x=>x.niveau==='certain');
 return {candidats:out,auto:certains.length===1?certains[0].stay:null};
}

/* ---------- Mouvements administratifs (IHE PAM) ---------- */
const EVENEMENTS_ADT={A01:'Admission (hospitalisation)',A04:'Admission (externe, ambulatoire)',A05:'Préadmission',A02:'Mutation',A03:'Sortie',A06:'Externe → hospitalisé',A07:'Hospitalisé → externe',A08:'Mise à jour des informations',A11:'Annulation de l’admission',A12:'Annulation de la mutation',A13:'Annulation de la sortie',A21:'Absence temporaire',A22:'Retour d’absence',A38:'Annulation de la préadmission',A40:'Fusion de patients'};
function lireAdt(msg){
 const m=lireHl7(msg),h=entete(m);if(h.type!=='ADT')throw Error('Message '+h.type+'^'+h.evenement+' : un mouvement est un ADT.');
 if(!EVENEMENTS_ADT[h.evenement])throw Error('Événement ADT '+h.evenement+' non pris en charge.');
 const pid=seg(m,'PID'),pv1=seg(m,'PV1'),zbe=seg(m,'ZBE');
 return {format:'HL7 v2 ADT',evenement:h.evenement,libelle:EVENEMENTS_ADT[h.evenement],idMessage:h.id,emetteur:h.emetteur,date:h.date,patient:pid?identite(pid):null,
  nda:val(pv1,19),classe:{I:'Hospitalisation',O:'Externe',E:'Urgences',R:'Hospitalisation',P:'Préadmission'}[val(pv1,2)]||val(pv1,2),
  uf:val(pv1,3,1),chambre:val(pv1,3,2),lit:val(pv1,3,3),medecin:[val(pv1,7,2),val(pv1,7,3)].filter(Boolean).join(' '),
  entree:dateHl7(val(pv1,44)),sortie:dateHl7(val(pv1,45)),mouvement:zbe?{id:val(zbe,1),date:dateHl7(val(zbe,2)),action:val(zbe,4)}:null};
}
// DFT^P03 : actes CCAM réalisés pendant le séjour, transmis au logiciel administratif / PMSI de la clinique.
function dftActes({patient={},nda='',actes=[],emetteur='IASELO',destinataire='GAM',id=''}){
 const now=versDateHl7(new Date().toISOString()),mid=id||'IAS'+now+Math.floor(Math.random()*1000);
 const segsOut=[['MSH','^~\\&',emetteur,'CLINIQUE',destinataire,'CLINIQUE',now,'',[['DFT','P03','DFT_P03']],mid,'P','2.5','','','','','FRA','UNICODE UTF-8'],
  ['EVN','',now],
  ['PID','1','',[[patient.ipp||'','','','IASELO','PI'],...(patient.ins?[[patient.ins,'','',['ASIP-SANTE-INS-NIR',OID_INS_NIR,'ISO'],'INS']]:[])],'',[[patient.nom||'',patient.prenom||'','','','','','L']],'',versDateHl7(patient.naissance||'').slice(0,8),{Féminin:'F',Masculin:'M'}[patient.sexe]||'U'],
  ['PV1','1','I','','','','','','','','','','','','','','','','',nda]];
 actes.forEach((a,i)=>segsOut.push(['FT1',String(i+1),'','',versDateHl7(a.date||'').slice(0,12),'','CG',[[a.code||'',a.libelle||'','CCAM']],'','',String(a.quantite||1),'','','','','','','','','',[[a.rpps||'',a.executant||'']],'','','','',[[a.code||'',a.libelle||'','CCAM']],'']));
 // ZFA-like : activité, phase, modificateurs dans FT1-26 (code^activité^phase) quand ils sont connus.
 actes.forEach((a,i)=>{const s=segsOut[4+i];s[26]=[[a.code||'',a.activite||'1',a.phase||'0',...(a.modificateurs?[a.modificateurs]:[])]]});
 return construire(segsOut);
}

/* ---------- Moniteurs (constantes) ---------- */
// Codes MDC (IEEE 11073-10101) les plus utilisés par les passerelles Philips, Dräger, GE, Mindray.
const MDC={'147842':'hr','149530':'hr','150456':'spo2','150037':'sbp','150038':'dbp','150039':'map','150301':'sbp','150302':'dbp','150303':'map','151708':'etco2','151716':'etco2','150344':'temp','150364':'temp','150392':'temp','151562':'rr','151594':'rr','152196':'fio2','151980':'vt','151976':'peep','151973':'pip','152212':'halogenEnd','152216':'halogenEnd'};
const LIBELLES_MONITEUR=[['sbp',/(NBP|ABP|ART|IBP|PNI).*(SYS|S\b)|\bSYS/i],['dbp',/(NBP|ABP|ART|IBP|PNI).*(DIA|D\b)|\bDIA/i],['map',/(NBP|ABP|ART|IBP|PNI).*(MEAN|M\b)|\bMEAN|\bPAM/i],['hr',/\b(HR|FC|PULSE|PR)\b/i],['spo2',/SP\s?O2/i],['etco2',/ET\s?CO2/i],['temp',/\bT(EMP)?\b|TEMP/i],['rr',/\b(RR|RESP|AWRR|FR)\b/i],['fio2',/FI\s?O2/i],['vt',/\bVT/i],['peep',/PEEP|PEP/i],['pip',/PPEAK|PPIC|PIP/i]];
function cleMoniteur(code,libelle){if(MDC[code])return MDC[code];for(const [k,re] of LIBELLES_MONITEUR)if(re.test(libelle||''))return k;return ''}
function lireMoniteur(msg){
 const m=lireHl7(msg),h=entete(m);if(h.type!=='ORU')throw Error('Message '+h.type+'^'+h.evenement+' : les constantes sont un ORU^R01.');
 const pv1=seg(m,'PV1'),obr=seg(m,'OBR'),mesures=[];
 const salle=val(pv1,3,2)||val(pv1,3,1)||val(seg(m,'MSH'),4),appareil=val(obr,10)||val(seg(m,'MSH'),3);
 for(const s of segs(m,'OBX')){const cle=cleMoniteur(val(s,3,1),val(s,3,2)),x=num(val(s,5));if(!cle||x===null)continue;
  const at=dateHl7(val(s,14))||dateHl7(val(obr,7))||h.date;mesures.push({cle,valeur:x,unite:val(s,6,2)||val(s,6,1),at,appareil:val(s,18)||appareil})}
 return {format:'HL7 v2 ORU^R01 (moniteur)',salle,appareil,date:h.date,mesures};
}
return {OID_INS_NIR,OID_INS_NIA,OID_INS_TEST,lireHl7,val,reps,segs,seg,dateHl7,versDateHl7,identite,entete,ack,construire,echapper,
 interpreter,critique,CRITIQUES,biologieDepuisHl7,biologieDepuisHprim,lireBiologie,rapprocher,norm,EVENEMENTS_ADT,lireAdt,dftActes,MDC,cleMoniteur,lireMoniteur};
});

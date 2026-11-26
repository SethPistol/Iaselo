/* IASELO · transmission à l'Assurance maladie (veille du 25/11/2026) : règles pures, sans réseau, testées
   dans tests/assurance-maladie.test.cjs. Utilisées par l'écran (dist/assurance-maladie.js) et par le serveur
   (worker/assurance-maladie.mjs), qui refait tous les contrôles.

   Ce que la clinique privée (ex-OQN) doit produire pour chaque séjour :
   - droits du patient : NIR de l'assuré, régime, nature d'assurance, exonération du ticket modérateur, complémentaire ;
   - résumé PMSI (RUM/RSS) : dates, modes d'entrée et de sortie, DP / DR / DAS en CIM-10, actes CCAM datés avec
     activité, phase et extension documentaire (classe ASA pour l'activité 4), dispositifs implantables en sus (LPP) ;
   - facture à l'Assurance maladie (norme B2, via le logiciel de facturation) : GHS issu du groupage, forfait
     journalier, participation forfaitaire de 24 €, DMI en sus ; honoraires des praticiens libéraux (CCAM, association) ;
   - suivi des retours (NOEMIE : paiements et rejets).
   Les montants calculés ici sont des estimations de contrôle : la facture opposable est établie par le logiciel
   de facturation agréé de la clinique, la FSE par le logiciel SESAM-Vitale du praticien. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloAssurance=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const t=v=>v===undefined||v===null?'':String(v).trim();
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
const arrondi=v=>Math.round(v*100)/100;
const JOUR=86400000;

/* ---------- Référentiels ---------- */
const NATURES_ASSURANCE={'10':'Maladie','13':'Maternité','41':'Accident du travail / maladie professionnelle'};
const QUALITES={assure:'Assuré(e) lui-même',conjoint:'Conjoint(e)',enfant:'Enfant',autre:'Autre ayant droit'};
const REGIMES={general:'Régime général (CPAM)',agricole:'Régime agricole (MSA)',special:'Régime spécial (à préciser)',etranger:'Assuré d’un autre pays (CEAM, convention)'};
const ACQUISITIONS={carte:'Carte Vitale lue',appli:'Appli carte Vitale',adri:'Droits interrogés en ligne (ADRi)',attestation:'Attestation papier',aucune:'Pas encore vérifiés'};
// Motifs d'exonération du ticket modérateur et leurs effets (Code de la sécurité sociale, L160-14 et L174-4).
const EXONERATIONS={
 aucune:{label:'Aucune exonération',tm:true,fj:true,pf24:true},
 ald:{label:'ALD exonérante, séjour en rapport avec l’affection',tm:false,fj:true,pf24:false},
 maternite:{label:'Maternité (à partir du 6e mois, accouchement)',tm:false,fj:false,pf24:false},
 atmp:{label:'Accident du travail / maladie professionnelle',tm:false,fj:false,pf24:false},
 invalidite:{label:'Pension d’invalidité',tm:false,fj:true,pf24:false},
 c2s:{label:'Complémentaire santé solidaire (C2S)',tm:false,fj:false,pf24:false,depassementInterdit:true},
 ame:{label:'Aide médicale de l’État (AME)',tm:false,fj:false,pf24:false,depassementInterdit:true},
 nouveaune:{label:'Nouveau-né hospitalisé dans ses 30 premiers jours',tm:false,fj:false,pf24:false},
 au30j:{label:'Hospitalisation au-delà du 30e jour',tm:false,fj:true,pf24:false}
};
// Modes d'entrée et de sortie du PMSI MCO, avec provenance et destination.
const MODES_ENTREE={'8':'Domicile','7':'Transfert depuis un autre établissement','6':'Mutation depuis une autre unité de la clinique','0':'Retour après transfert provisoire'};
const PROVENANCES={'':'Sans objet','1':'MCO','2':'Soins médicaux et de réadaptation','3':'Soins de longue durée','4':'Psychiatrie','5':'Passage par les urgences','6':'Hospitalisation à domicile','7':'Structure d’hébergement médico-sociale'};
const MODES_SORTIE={'8':'Domicile','7':'Transfert vers un autre établissement','6':'Mutation vers une autre unité de la clinique','9':'Décès','0':'Transfert provisoire'};
const DESTINATIONS={'':'Sans objet','1':'MCO','2':'Soins médicaux et de réadaptation','3':'Soins de longue durée','4':'Psychiatrie','6':'Hospitalisation à domicile','7':'Structure d’hébergement médico-sociale'};
const ASA={I:'1',II:'2',III:'3',IV:'4',V:'5'};
// Modificateurs CCAM transmis tels quels : leur valorisation est faite par le logiciel SESAM-Vitale ou de facturation.
const MODIFICATEURS={F:'Urgence un dimanche ou un jour férié',P:'Urgence de nuit (20 h – 0 h, 6 h – 8 h)',S:'Urgence de nuit profonde (0 h – 6 h)',U:'Urgence (critères CCAM)',J:'Anesthésie ou chirurgie en secteur 1 ou OPTAM (majoration)',K:'Majoration secteur 1 ou OPTAM',7:'Anesthésie générale ou locorégionale par un anesthésiste'};
// Retours de l'Assurance maladie : grandes familles de rejet, pour orienter la correction.
const MOTIFS_REJET={
 droits:{label:'Droits fermés ou inconnus',corrige:'droits',conseil:'Interroger les droits (ADRi), demander l’attestation, vérifier la caisse et la période.'},
 identification:{label:'NIR, rang ou date de naissance incohérents',corrige:'droits',conseil:'Comparer le NIR, la date de naissance et le rang avec la carte Vitale.'},
 exoneration:{label:'Exonération non justifiée',corrige:'droits',conseil:'Vérifier l’ALD (protocole), la maternité ou la déclaration d’accident du travail.'},
 tarification:{label:'Tarif, GHS ou supplément refusé',corrige:'facture',conseil:'Contrôler le GHS avec le DIM et l’arrêté tarifaire de l’année.'},
 codage:{label:'Acte ou diagnostic incohérent',corrige:'pmsi',conseil:'Renvoyer au DIM : acte, activité, date ou diagnostic à revoir.'},
 dmi:{label:'Dispositif implantable non remboursable ou non tracé',corrige:'pmsi',conseil:'Vérifier le code LPP, l’inscription en sus et la traçabilité (lot, série).'},
 doublon:{label:'Facture déjà payée (doublon)',corrige:'facture',conseil:'Rechercher la facture d’origine avant tout renvoi.'},
 delai:{label:'Délai de facturation dépassé',corrige:'facture',conseil:'Au-delà d’un an, la créance est prescrite : signaler à la direction.'},
 autre:{label:'Autre motif',corrige:'facture',conseil:'Lire le libellé du retour NOEMIE dans le logiciel de facturation.'}
};
const FORFAIT_JOURNALIER=20,PF24=24,SEUIL_PF24=120,TAUX_TM=0.2,SEUIL_DEVIS=70,DELAI_FACTURATION_JOURS=365;

/* ---------- Identification ---------- */
// NIR : 13 caractères (Corse : 2A ou 2B aux positions 6-7) + clé = 97 − (NIR mod 97).
function nir(valeur,{sexe,naissance}={}){
 const brut=t(valeur).toUpperCase().replace(/[\s.-]/g,'');
 if(!brut)return {ok:false,vide:true,message:'NIR de l’assuré à saisir (carte Vitale ou attestation).'};
 if(!/^[1-478]\d{4}(\d{2}|2A|2B)\d{6}\d{2}$/.test(brut))return {ok:false,message:'Le NIR compte 15 caractères : 13 chiffres (2A ou 2B pour la Corse) et une clé de 2 chiffres.'};
 const corps=brut.slice(0,13),cle=Number(brut.slice(13)),n=BigInt(corps.replace('2A','19').replace('2B','18'));
 if(97-Number(n%97n)!==cle)return {ok:false,message:'Clé du NIR incorrecte : vérifier la saisie.'};
 const alertes=[],provisoire=/^[78]/.test(brut);
 const s=t(sexe).toLowerCase(),premier=brut[0];
 if(!provisoire&&s&&((/^(f|féminin|femme)/.test(s)&&premier!=='2')||(/^(m|masculin|homme)/.test(s)&&premier!=='1')))alertes.push('Le 1er chiffre du NIR ne correspond pas au sexe du patient : normal seulement si le NIR est celui de l’assuré ouvrant droit.');
 const m=/^(\d{4})-(\d{2})/.exec(t(naissance));if(m&&!provisoire){const yy=brut.slice(1,3),mm=Number(brut.slice(3,5));if(yy!==m[1].slice(2)||(mm>=1&&mm<=12&&mm!==Number(m[2])))alertes.push('Année ou mois de naissance du NIR différents de la date de naissance du patient : normal seulement pour un ayant droit.')}
 return {ok:true,valeur:brut,provisoire,alertes};
}
const cim10=c=>/^[A-Z]\d{2}(\.?[0-9+]{1,3})?$/.test(t(c).toUpperCase());
const normCim=c=>{const v=t(c).toUpperCase().replace(/\s/g,'');return /^[A-Z]\d{3}/.test(v)&&!v.includes('.')?v.slice(0,3)+'.'+v.slice(3):v};
const lpp=c=>/^\d{7}$/.test(t(c));
const ccam=c=>/^[A-Z]{4}\d{3}$/.test(t(c).toUpperCase());

/* ---------- Dates du séjour ---------- */
const jourIso=v=>{const s=t(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''};
function duree(entree,sortie){const a=jourIso(entree),b=jourIso(sortie);if(!a||!b)return null;return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/JOUR)}
function delaiFacturation(sortie,maintenant=new Date()){const s=jourIso(sortie);if(!s)return null;const limite=new Date(Date.parse(s+'T12:00:00Z')+DELAI_FACTURATION_JOURS*JOUR);return {limite:limite.toISOString().slice(0,10),reste:Math.ceil((limite-maintenant)/JOUR)}}

/* ---------- Honoraires des praticiens : règle d'association CCAM ----------
   Plusieurs actes au cours de la même intervention : le plus cher à 100 % (code 1), le 2e à 50 % (code 2),
   les suivants ne sont pas facturables sauf dérogation (à traiter par le praticien). Un seul acte d'anesthésie
   (activité 4) par intervention : celui de l'acte le mieux tarifé. */
const TAUX_ASSOCIATION={'1':1,'2':0.5,'3':0.75,'4':1,'5':1,'0':0};
function associer(actes){
 const out=[];
 // Codes d'association posés par les praticiens dans l'écran de codage : ils font foi.
 if(actes.length&&actes.every(a=>Object.hasOwn(TAUX_ASSOCIATION,String(a.association??'')))){
  for(const a of actes){const tarif=num(a.tarif)??0,taux=TAUX_ASSOCIATION[String(a.association)],codage=a.montantCodage==null||a.montantCodage===''?null:num(a.montantCodage);out.push({...a,tarif,taux,montant:codage!=null&&codage>=0?codage:arrondi(tarif*taux),note:taux?'':'Codé sans facturation (code d’association 0)'})}
  return out;
 }
 for(const activite of ['1','4']){
  const l=actes.filter(a=>String(a.activite||'1')===activite).map(a=>({...a,tarif:num(a.tarif)??0})).sort((a,b)=>b.tarif-a.tarif);
  l.forEach((a,i)=>{const taux=activite==='4'?(i===0?1:0):(i===0?1:i===1?0.5:0);out.push({...a,association:taux===1?'1':taux===0.5?'2':'',taux,montant:arrondi(a.tarif*taux),note:taux?'':activite==='4'?'Un seul acte d’anesthésie par intervention':'3e acte et suivants : non facturables sauf dérogation'})});
 }
 return out;
}

/* ---------- Contrôles de complétude ---------- */
// dossier = {droits, pmsi, facture} saisis ; contexte = {identite, insQualifiee, mode, actes:[{code,activite,date,confirme,dim,asa}], dmi:[{gtin,lot,serie,lpp,enSus}], devis:[{depassement,statut}], diagnostics:[]}
function controler(dossier={},contexte={},maintenant=new Date()){
 const d=dossier.droits||{},p=dossier.pmsi||{},f=dossier.facture||{},id=contexte.identite||{},ex=EXONERATIONS[d.exoneration]||null;
 const out=[];const pose=(section,niveau,message,champ='')=>out.push({section,niveau,message,champ});
 // Droits
 const n=nir(d.nir,{sexe:id.sex,naissance:id.birthDate});
 if(!n.ok)pose('droits','bloquant',n.message,'nir');else n.alertes.forEach(a=>pose('droits','alerte',a,'nir'));
 if(!QUALITES[d.qualite])pose('droits','bloquant','Qualité du bénéficiaire (assuré, conjoint, enfant…) à préciser.','qualite');
 if(!REGIMES[d.regime])pose('droits','bloquant','Régime d’assurance maladie à préciser.','regime');
 if(d.regime&&d.regime!=='etranger'&&!/^\d{3}$/.test(t(d.caisse)))pose('droits','bloquant','Code de la caisse d’affiliation (3 chiffres, sur l’attestation de droits) à saisir.','caisse');
 if(!NATURES_ASSURANCE[d.nature])pose('droits','bloquant','Nature d’assurance (maladie, maternité, accident du travail) à préciser.','nature');
 if(!ex)pose('droits','bloquant','Exonération du ticket modérateur : choisir « Aucune exonération » ou le motif.','exoneration');
 if(d.nature==='41'&&!t(d.dateAccident))pose('droits','bloquant','Accident du travail : date de l’accident à saisir (déclaration de l’employeur).','dateAccident');
 if(d.nature==='41'&&d.exoneration!=='atmp')pose('droits','alerte','Nature « accident du travail » : l’exonération attendue est « accident du travail / maladie professionnelle ».','exoneration');
 if(d.nature==='13'&&d.exoneration!=='maternite')pose('droits','alerte','Nature « maternité » : l’exonération attendue est « maternité ».','exoneration');
 if(d.exoneration==='ald'&&!t(d.aldProtocole))pose('droits','alerte','ALD : vérifier que le protocole de soins couvre bien l’intervention.','aldProtocole');
 if(!ACQUISITIONS[d.acquisition]||d.acquisition==='aucune')pose('droits','bloquant','Droits non vérifiés : lire la carte Vitale, l’appli carte Vitale ou interroger les droits en ligne (ADRi).','acquisition');
 if(d.adri&&d.adri.ouverts===false)pose('droits','bloquant','Droits fermés à la date du séjour selon l’Assurance maladie.','acquisition');
 if(d.finDroits&&jourIso(p.entree)&&jourIso(d.finDroits)<jourIso(p.entree))pose('droits','bloquant','Les droits se terminent avant la date d’entrée.','finDroits');
 if(!contexte.insQualifiee)pose('droits','alerte','INS non qualifiée : l’identité doit être qualifiée (INSi) avant tout échange de données de santé.','');
 if(d.amc==='oui'&&!/^\d{8,10}$/.test(t(d.amcNumero)))pose('droits','alerte','Complémentaire : numéro de l’organisme (8 à 10 chiffres, sur la carte de tiers payant) à saisir pour la prise en charge.','amcNumero');
 if(d.amc==='oui'&&d.tiersPayantAmc&&!d.roc?.reference)pose('droits','alerte','Tiers payant complémentaire : demander l’accord de prise en charge (ROC, service IDB) avant la sortie.','');
 // PMSI
 const sejourAmbulatoire=contexte.mode==='Ambulatoire';
 if(!jourIso(p.entree))pose('pmsi','bloquant','Date d’entrée à saisir.','entree');
 if(!jourIso(p.sortie))pose('pmsi','bloquant','Date de sortie à saisir (le séjour doit être terminé pour être codé).','sortie');
 const dj=duree(p.entree,p.sortie);if(dj!==null&&dj<0)pose('pmsi','bloquant','La sortie précède l’entrée.','sortie');
 if(dj!==null&&sejourAmbulatoire&&dj>0)pose('pmsi','alerte','Séjour déclaré ambulatoire mais sortie un autre jour que l’entrée.','sortie');
 if(!MODES_ENTREE[p.modeEntree])pose('pmsi','bloquant','Mode d’entrée à préciser.','modeEntree');
 if(['6','7'].includes(p.modeEntree)&&!['1','2','3','4','6'].includes(t(p.provenance)))pose('pmsi','bloquant','Transfert ou mutation : provenance à préciser.','provenance');
 if(!MODES_SORTIE[p.modeSortie])pose('pmsi','bloquant','Mode de sortie à préciser.','modeSortie');
 if(['6','7'].includes(p.modeSortie)&&!['1','2','3','4','6'].includes(t(p.destination)))pose('pmsi','bloquant','Transfert ou mutation : destination à préciser.','destination');
 if(!t(p.dp))pose('pmsi','bloquant','Diagnostic principal (CIM-10) à coder par le médecin.','dp');
 else if(!cim10(p.dp))pose('pmsi','bloquant','Diagnostic principal : code CIM-10 attendu (ex. M16.1).','dp');
 else if(/^R/i.test(t(p.dp)))pose('pmsi','alerte','Diagnostic principal en « R » (symptôme) : à réserver aux cas sans diagnostic établi.','dp');
 if(t(p.dr)&&!cim10(p.dr))pose('pmsi','bloquant','Diagnostic relié : code CIM-10 attendu.','dr');
 if(t(p.dr)&&t(p.dp)&&!/^Z/i.test(t(p.dp)))pose('pmsi','alerte','Diagnostic relié : il ne se code que lorsque le diagnostic principal est en « Z ».','dr');
 const das=(Array.isArray(p.das)?p.das:[]).map(normCim);
 das.forEach(c=>{if(!cim10(c))pose('pmsi','bloquant','Diagnostic associé '+c+' : code CIM-10 invalide.','das')});
 if(t(p.dp)&&das.includes(normCim(p.dp)))pose('pmsi','alerte','Un diagnostic associé reprend le diagnostic principal.','das');
 const actes=contexte.actes||[];
 if(!actes.length)pose('pmsi','bloquant','Aucun acte CCAM confirmé pour ce séjour (onglet Codage PMSI du dossier).','actes');
 actes.forEach(a=>{
  if(!ccam(a.code))pose('pmsi','bloquant','Acte '+(a.code||'?')+' : code CCAM invalide.','actes');
  if(!a.dim)pose('pmsi','bloquant','Acte '+a.code+' (activité '+a.activite+') : validation du médecin DIM attendue.','actes');
  if(!jourIso(a.date))pose('pmsi','bloquant','Acte '+a.code+' : date de réalisation inconnue.','actes');
  else if(jourIso(p.entree)&&jourIso(p.sortie)&&(jourIso(a.date)<jourIso(p.entree)||jourIso(a.date)>jourIso(p.sortie)))pose('pmsi','bloquant','Acte '+a.code+' daté hors du séjour.','actes');
  if(String(a.activite)==='4'&&!/^[1-5]$/.test(t(a.extension)))pose('pmsi','bloquant','Acte d’anesthésie '+a.code+' : extension documentaire (classe ASA 1 à 5) obligatoire.','actes');
 });
 (contexte.dmi||[]).forEach(x=>{
  if(x.enSus&&!lpp(x.lpp))pose('pmsi','bloquant','Implant GTIN '+(x.gtin||'?')+' facturé en sus : code LPP (7 chiffres) à saisir.','dmi');
  if(x.enSus&&!(t(x.lot)||t(x.serie)))pose('pmsi','bloquant','Implant GTIN '+(x.gtin||'?')+' : lot ou numéro de série obligatoire (traçabilité).','dmi');
  if(x.enSus===undefined)pose('pmsi','alerte','Implant GTIN '+(x.gtin||'?')+' : préciser s’il est inscrit sur la liste en sus (facturé à part) ou inclus dans le GHS.','dmi');
 });
 // Facture
 const sansTarif=actes.filter(a=>a.tarif===null||a.tarif===undefined||a.tarif==='');if(sansTarif.length)pose('facture','alerte','Tarif CCAM inconnu pour '+[...new Set(sansTarif.map(a=>a.code))].join(', ')+' (nomenclature non chargée sur le serveur) : honoraires et participation de l’assuré estimés sans ces actes.','');
 if(!/^\d{1,4}$/.test(t(f.ghs)))pose('facture','bloquant','GHS à reprendre du groupage du logiciel PMSI (numéro de 1 à 4 chiffres).','ghs');
 if(t(f.ghs)&&!(num(f.ghsTarif)>0))pose('facture','bloquant','Tarif du GHS (arrêté tarifaire de l’année, secteur ex-OQN) à saisir.','ghsTarif');
 for(const v of contexte.devis||[])if(num(v.depassement)>=SEUIL_DEVIS&&v.statut!=='signe')pose('facture','bloquant','Dépassement d’honoraires de '+v.depassement+' € sans devis signé par le patient (obligatoire dès 70 €).','devis');
 // Dépassements saisis sur les actes : devis signé obligatoire dès 70 € par praticien.
 const depPrat={};for(const a of actes){const dep=num(a.depassement)||0;if(dep>0){const k=String(a.activite)==='4'||/:c:/.test(a.cle||'')?'anesthésiste':'chirurgien';depPrat[k]=(depPrat[k]||0)+dep}}
 const devisSigne=(contexte.devis||[]).some(v=>v.statut==='signe');
 for(const [k,m] of Object.entries(depPrat))if(m>=SEUIL_DEVIS&&!devisSigne)pose('facture','bloquant','Dépassement d’honoraires de '+arrondi(m)+' € ('+k+') sans devis signé par le patient (obligatoire dès 70 €).','devis');
 if(ex?.depassementInterdit&&Object.keys(depPrat).length)pose('facture','bloquant','Patient '+(d.exoneration==='c2s'?'C2S':'AME')+' : dépassements d’honoraires interdits sur les actes (sauf exigence particulière du patient).','devis');
 if(ex?.depassementInterdit&&(contexte.devis||[]).some(v=>num(v.depassement)>0))pose('facture','bloquant','Patient '+(d.exoneration==='c2s'?'C2S':'AME')+' : dépassements d’honoraires interdits (sauf exigence particulière du patient).','devis');
 const dl=delaiFacturation(p.sortie,maintenant);if(dl&&dl.reste<0)pose('facture','bloquant','Délai de facturation d’un an dépassé depuis le '+dl.limite+' : créance prescrite.','');else if(dl&&dl.reste<60)pose('facture','alerte','Plus que '+dl.reste+' jours pour facturer (limite '+dl.limite+').','');
 const compte=s=>out.filter(x=>x.section===s&&x.niveau==='bloquant').length;
 return {constats:out,pret:{droits:!compte('droits'),pmsi:!compte('droits')&&!compte('pmsi'),facture:!compte('droits')&&!compte('pmsi')&&!compte('facture')},bloquants:out.filter(x=>x.niveau==='bloquant').length,alertes:out.filter(x=>x.niveau==='alerte').length};
}

/* ---------- Pré-facture (estimation de contrôle) ---------- */
function preFacture(dossier={},contexte={}){
 const d=dossier.droits||{},p=dossier.pmsi||{},f=dossier.facture||{},ex=EXONERATIONS[d.exoneration]||EXONERATIONS.aucune;
 const ambulatoire=contexte.mode==='Ambulatoire'||duree(p.entree,p.sortie)===0,jours=Math.max(0,duree(p.entree,p.sortie)??0);
 const lignes=[],honoraires=[];
 const ghs=num(f.ghsTarif)||0;if(t(f.ghs))lignes.push({code:'GHS',libelle:'GHS '+t(f.ghs)+(f.ghm?' (GHM '+t(f.ghm)+')':''),quantite:1,pu:ghs,montant:ghs,base:true});
 const exh=Math.max(0,Math.floor(num(f.exhJours)||0)),exhTarif=num(f.exhTarif)||0;if(exh&&exhTarif)lignes.push({code:'EXH',libelle:'Journées au-delà de la borne haute',quantite:exh,pu:exhTarif,montant:arrondi(exh*exhTarif),base:true});
 for(const x of contexte.dmi||[])if(x.enSus&&lpp(x.lpp)&&num(x.prix)>0)lignes.push({code:'LPP '+x.lpp,libelle:'Implant en sus'+(x.libelle?' · '+x.libelle:''),quantite:1,pu:num(x.prix),montant:num(x.prix),base:true,dmi:true});
 const baseSejour=arrondi(lignes.filter(l=>l.base).reduce((s,l)=>s+l.montant,0));
 // Honoraires
 const asso=associer((contexte.actes||[]).filter(a=>a.dim));
 for(const a of asso){const dep=Math.max(0,num(a.depassement)||0);honoraires.push({cle:a.cle,code:a.code,activite:a.activite,association:a.association,modificateurs:a.modificateurs||'',libelle:a.libelle||'',tarif:a.tarif,tarifSource:a.tarifSource||'',montant:a.montant,depassement:dep,depassementSource:a.depassementSource||'',total:arrondi(a.montant+dep),note:a.note})}
 const baseHonoraires=arrondi(honoraires.reduce((s,h)=>s+h.montant,0)),depassementsActes=arrondi(honoraires.reduce((s,h)=>s+h.depassement,0)),depassementsDevis=arrondi((contexte.devis||[]).reduce((s,v)=>s+(num(v.depassement)||0),0));
 // Dépassements saisis sur les actes (codage ou facturation) ; à défaut, ceux des devis.
 const depassements=depassementsActes>0?depassementsActes:depassementsDevis,sourceDepassements=depassementsActes>0?'actes':depassementsDevis>0?'devis':'';
 // Participation de l'assuré : PF 24 € si un acte ≥ 120 €, sinon ticket modérateur de 20 % ; exonérations.
 const acteLourd=(contexte.actes||[]).some(a=>(num(a.tarif)||0)>=SEUIL_PF24);
 let participation=0,motif='';
 if(!ex.tm){motif='Exonéré du ticket modérateur ('+ex.label+')'}
 else if(acteLourd&&ex.pf24){participation=PF24;motif='Participation forfaitaire de 24 € (acte d’au moins 120 €), une fois par séjour'}
 else{participation=arrondi((baseSejour+baseHonoraires)*TAUX_TM);motif='Ticket modérateur de 20 %'}
 let fj=0,fjNote='';
 if(!ambulatoire&&ex.fj){fj=FORFAIT_JOURNALIER*(jours+1);fjNote=FORFAIT_JOURNALIER+' € × '+(jours+1)+' jours (jour de sortie compris)';
  if(participation>0&&motif.startsWith('Ticket')){if(participation>=fj){fjNote+=' : imputé sur le ticket modérateur, non ajouté';fj=0}else{fjNote+=' : ticket modérateur imputé sur le forfait';participation=0}}}
 else fjNote=ambulatoire?'Non dû en ambulatoire':'Non dû ('+ex.label+')';
 const chambre=Math.max(0,(num(f.chambreNuits)||0)*(num(f.chambrePrix)||0));
 const amo=arrondi(baseSejour+baseHonoraires-participation),complementaireOuPatient=arrondi(participation+fj+chambre+depassements);
 return {lignes,honoraires,baseSejour,baseHonoraires,participation,motifParticipation:motif,forfaitJournalier:fj,noteForfait:fjNote,chambre:arrondi(chambre),depassements,depassementsActes,depassementsDevis,sourceDepassements,totalHonoraires:arrondi(baseHonoraires+depassementsActes),amo,resteAvantMutuelle:complementaireOuPatient,
  note:'Estimation de contrôle : la facture B2 et les FSE sont établies par les logiciels agréés de la clinique et des praticiens.'};
}

/* ---------- Synthèse d'un séjour pour la liste de suivi ---------- */
function etape(dossier={},controle){
 const s=dossier.statut||'';
 if(s==='paye')return {cle:'paye',label:'Payé'};
 if(s==='rejete')return {cle:'rejete',label:'Rejeté : à corriger'};
 if(s==='transmise')return {cle:'transmise',label:'Transmis, en attente du retour'};
 if(controle?.pret.facture)return {cle:'pret',label:'Prêt à facturer'};
 if(controle?.pret.pmsi)return {cle:'facture',label:'Facture à compléter'};
 if(controle?.pret.droits)return {cle:'pmsi',label:'PMSI à compléter'};
 return {cle:'droits',label:'Droits à vérifier'};
}

return {NATURES_ASSURANCE,QUALITES,REGIMES,ACQUISITIONS,EXONERATIONS,MODES_ENTREE,PROVENANCES,MODES_SORTIE,DESTINATIONS,ASA,MODIFICATEURS,MOTIFS_REJET,
 FORFAIT_JOURNALIER,PF24,SEUIL_PF24,TAUX_TM,SEUIL_DEVIS,DELAI_FACTURATION_JOURS,nir,cim10,normCim,lpp,ccam,jourIso,duree,delaiFacturation,associer,controler,preFacture,etape};
});

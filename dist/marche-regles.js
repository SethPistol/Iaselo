/* IASELO · règles des modules ajoutés après la comparaison au marché (25 novembre 2026).
   Fonctions pures, partagées par le serveur (worker/marche.mjs) et les écrans (dist/marche.js),
   testées dans tests/marche-regles.test.cjs. Les seuils et repères réglementaires sont des valeurs par défaut,
   à faire relire par l'établissement (hémovigilance, qualité, stérilisation, direction des affaires financières). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloMarche=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const t=v=>typeof v==='string'?v.trim():v===undefined||v===null?'':String(v).trim();
const norm=s=>t(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const heures=(a,b)=>(Date.parse(b)-Date.parse(a))/3600000;
const jour=iso=>t(iso).slice(0,10);

/* =====================================================================
   1. Courriers reçus (MSSanté, dépôt, scan) : classement proposé, toujours confirmé par un humain.
   ===================================================================== */
const TYPES_COURRIER={
 'compte-rendu-operatoire':{label:'Compte rendu opératoire',re:/compte[- ]rendu op[eé]ratoire|\bcro\b|protocole op[eé]ratoire/},
 'lettre-liaison':{label:'Lettre de liaison / sortie',re:/lettre de liaison|lettre de sortie|compte[- ]rendu d.hospitalisation/},
 'biologie':{label:'Biologie',re:/biolog|laboratoire|h[eé]mogramme|nfs|ionogramme|bilan sanguin|kali[eé]mie|cr[eé]atinin/},
 'imagerie':{label:'Imagerie',re:/radiolog|scanner|tomodensitom|\birm\b|[eé]chograph|radiographie|scintigraph/},
 'cardiologie':{label:'Avis cardiologique',re:/cardiolog|[eé]chocardiograph|cardiaque|fevg|transthoracique|holter|[eé]preuve d.effort|\becg\b/},
 'consultation':{label:'Courrier de consultation',re:/cher confr[eè]re|ch[eè]re consoeur|ch[eè]re cons[oœ]ur|je vois en consultation|j.ai vu en consultation/},
 'ordonnance':{label:'Ordonnance',re:/ordonnance|prescription m[eé]dicale/},
 'anatomopathologie':{label:'Anatomopathologie',re:/anatomo|anapath|histolog|cytolog/},
 'administratif':{label:'Administratif',re:/attestation|mutuelle|prise en charge|carte vitale|facture/}
};
function classerCourrier({objet='',texte:contenu='',nomFichier=''}){
 const s=norm(objet+' '+nomFichier+' '+contenu.slice(0,6000)),scores=[];
 for(const [k,v] of Object.entries(TYPES_COURRIER)){const m=s.match(new RegExp(v.re.source,'g'));if(m)scores.push([k,m.length+(v.re.test(norm(objet+' '+nomFichier))?3:0)])}
 scores.sort((a,b)=>b[1]-a[1]);return scores.length?{type:scores[0][0],label:TYPES_COURRIER[scores[0][0]].label,confiance:scores[0][1]>=3?'forte':'faible'}:{type:'autre',label:'Autre document',confiance:'faible'};
}
// Identité trouvée dans un courrier (« Patient : NOM Prénom, né(e) le JJ/MM/AAAA ») : proposition de rattachement.
function identiteCourrier(contenu){
 const s=t(contenu).slice(0,8000);let naissance='';
 const d=s.match(/n[ée]e?\s+le\s+(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/i)||s.match(/date de naissance\s*:?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/i);
 if(d)naissance=`${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;
 const n=s.match(/(?:[Pp]atiente?|[Cc]oncerne|[Oo]bjet|M\.|Mme|Madame|Monsieur)\s*:?\s*([A-ZÀ-Ý][A-ZÀ-Ý'\- ]{1,40})\s+([A-ZÀ-Ý][a-zà-ÿ'\-]+)/);
 const ins=(s.match(/\bINS\s*:?\s*([12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2})\b/i)||[])[1]?.replace(/\s/g,'')||'';
 return {nom:n?n[1].trim().toUpperCase():'',prenom:n?n[2]:'',naissance,ins};
}

/* =====================================================================
   5. Transfusion : groupage, RAI, compatibilité, contrôle ultime, surveillance, effets indésirables.
   Repères : HAS/ANSM 2018 « Transfusion de globules rouges homologues », arrêté du 15 mai 2018 (analyses
   d'immuno-hématologie), circulaire DGS/DHOS/AFSSAPS 2003-582 (acte transfusionnel), art. R1221-17 CSP.
   ===================================================================== */
const GROUPES=['O','A','B','AB'];
const PSL={CGR:{label:'Concentré de globules rouges',abo:'globules'},PFC:{label:'Plasma frais congelé',abo:'plasma'},CPA:{label:'Concentré plaquettaire d’aphérèse',abo:'plaquettes'},MCP:{label:'Mélange de concentrés plaquettaires',abo:'plaquettes'}};
// Compatibilité ABO : globules (receveur ← donneur) et plasma (règle inverse).
const ABO_GLOBULES={O:['O'],A:['A','O'],B:['B','O'],AB:['AB','A','B','O']};
const ABO_PLASMA={O:['O','A','B','AB'],A:['A','AB'],B:['B','AB'],AB:['AB']};
function parseGroupe(v){const m=t(v).toUpperCase().replace(/\s/g,'').match(/^(AB|A|B|O)(RH)?([+-]|POS|NEG|D\+|D-)?$/);if(!m)return null;return {abo:m[1],rhd:m[3]?/[+]|POS/.test(m[3])?'+':'-':''}}
// Groupe sanguin valide : deux déterminations concordantes sur deux prélèvements distincts.
function groupeValide(determinations){
 const ds=(determinations||[]).filter(d=>parseGroupe(d.groupe)&&d.prelevement);
 if(ds.length<2)return {valide:false,motif:ds.length?'Une seule détermination : un second prélèvement distinct est nécessaire.':'Aucune détermination de groupe.'};
 const g=ds.map(d=>parseGroupe(d.groupe)),premier=g[0];
 if(g.some(x=>x.abo!==premier.abo||x.rhd!==premier.rhd))return {valide:false,discordance:true,motif:'Déterminations discordantes : ne pas transfuser sans avis de l’EFS (risque d’erreur d’identité).'};
 const ids=new Set(ds.map(d=>t(d.numeroPrelevement)||t(d.prelevement)));
 if(ids.size<2)return {valide:false,motif:'Les deux déterminations proviennent du même prélèvement.'};
 return {valide:true,groupe:premier.abo+(premier.rhd||''),abo:premier.abo,rhd:premier.rhd};
}
// RAI : 72 h, ou 21 jours sans transfusion, grossesse ni greffe dans les 6 mois (sur prescription explicite).
function raiValide(rai,maintenant,{antecedentsRecents=true}={}){
 if(!rai||!rai.prelevement)return {valide:false,motif:'Pas de RAI.'};
 if(rai.resultat==='positive')return {valide:true,positive:true,motif:'RAI positive'+(t(rai.specificite)?' ('+t(rai.specificite)+')':'')+' : PSL compatibilisés (épreuve directe) obligatoires.',expire:new Date(Date.parse(rai.prelevement)+72*3600000).toISOString()};
 const duree=antecedentsRecents?72:21*24,ecoule=heures(rai.prelevement,maintenant);
 const expire=new Date(Date.parse(rai.prelevement)+duree*3600000).toISOString();
 return ecoule<=duree?{valide:true,expire,motif:'RAI négative valable jusqu’au '+expire.slice(0,16).replace('T',' à ')}:{valide:false,expire,motif:'RAI périmée ('+(antecedentsRecents?'72 h':'21 jours')+') : nouveau prélèvement nécessaire.'};
}
function compatible(type,receveur,donneur){
 const r=parseGroupe(receveur),d=parseGroupe(donneur);if(!r||!d)return {ok:false,bloquant:true,motif:'Groupe illisible.'};
 const p=PSL[type];if(!p)return {ok:false,bloquant:true,motif:'Type de PSL inconnu.'};
 const alertes=[];
 if(p.abo==='globules'){if(!ABO_GLOBULES[r.abo].includes(d.abo))return {ok:false,bloquant:true,motif:'Incompatibilité ABO : receveur '+r.abo+', CGR '+d.abo+'. NE PAS TRANSFUSER.'};
  if(r.rhd==='-'&&d.rhd==='+')alertes.push('Receveur RhD négatif, CGR RhD positif : uniquement en urgence vitale, sur décision médicale tracée (prévention de l’allo-immunisation anti-D).')}
 else if(p.abo==='plasma'){if(!ABO_PLASMA[r.abo].includes(d.abo))return {ok:false,bloquant:true,motif:'Plasma incompatible : receveur '+r.abo+', plasma '+d.abo+'.'}}
 else {if(!ABO_GLOBULES[r.abo].includes(d.abo)&&!ABO_PLASMA[r.abo].includes(d.abo))alertes.push('Plaquettes ABO non identiques : acceptables si le stock l’impose (avis EFS).');if(r.rhd==='-'&&d.rhd==='+')alertes.push('Receveur RhD négatif, plaquettes RhD positives : prévention par immunoglobulines anti-D à discuter (femme en âge de procréer).')}
 return {ok:true,bloquant:false,alertes};
}
// Contrôle ultime prétransfusionnel, au lit du patient, pour chaque poche.
const CUPT=[['identitePatient','Identité du patient vérifiée (question ouverte, bracelet)'],['concordancePrescription','Concordance identité / prescription / fiche de délivrance'],['concordancePoche','Concordance n° de poche, type de PSL et groupe avec la fiche de délivrance'],['peremption','Date de péremption de la poche'],['aspect','Aspect de la poche (intégrité, couleur, absence de caillots)'],['documentsGroupe','Document de groupage valide (deux déterminations) et RAI valide'],['epreuveCompat','Épreuve de compatibilité si RAI positive']];
function controleUltime({poche,receveur,maintenant,carte={},items={},raiPositive=false}){
 const erreurs=[],alertes=[];
 for(const [k,l] of CUPT){if(k==='epreuveCompat'&&!raiPositive)continue;if(items[k]!=='oui')erreurs.push(l)}
 if(!poche)return {ok:false,erreurs:['Poche non identifiée.'],alertes};
 if(poche.peremption&&Date.parse(poche.peremption)<Date.parse(maintenant))erreurs.push('Poche périmée.');
 if(poche.reception&&heures(poche.reception,maintenant)>6)erreurs.push('Plus de 6 h depuis la réception dans le service : poche à retourner au dépôt / à l’EFS.');
 const c=compatible(poche.type,receveur,poche.groupe);if(!c.ok)erreurs.push(c.motif);else alertes.push(...c.alertes);
 if(poche.type==='CGR'){const p=parseGroupe(carte.patient),q=parseGroupe(carte.poche);
  if(!p||!q)erreurs.push('Carte de contrôle ultime (CGR) : groupe ABO du patient et de la poche à lire sur la carte.');
  else{if(p.abo!==parseGroupe(receveur)?.abo)erreurs.push('Carte : le groupe lu chez le patient ('+p.abo+') diffère du groupe connu ('+parseGroupe(receveur)?.abo+'). Arrêt : erreur d’identité possible.');
   if(!ABO_GLOBULES[p.abo].includes(q.abo))erreurs.push('Carte : poche '+q.abo+' incompatible avec le patient '+p.abo+'.')}}
 return {ok:!erreurs.length,erreurs,alertes};
}
// Surveillance : avant, 15 premières minutes, fin ; signes d'alerte → arrêt immédiat et déclaration.
function alertesSurveillance(avant,mesure){
 const out=[];if(!mesure)return out;const n=k=>Number(mesure[k]),a=k=>Number(avant?.[k]);
 if(Number.isFinite(n('temp'))&&Number.isFinite(a('temp'))&&n('temp')-a('temp')>=1)out.push('Hausse de la température ≥ 1 °C');
 if(Number.isFinite(n('temp'))&&n('temp')>=39)out.push('Température ≥ 39 °C');
 if(Number.isFinite(n('sbp'))&&Number.isFinite(a('sbp'))&&a('sbp')-n('sbp')>=30)out.push('Baisse de la PAS ≥ 30 mmHg');
 if(Number.isFinite(n('sbp'))&&n('sbp')<90)out.push('PAS < 90 mmHg');
 if(Number.isFinite(n('hr'))&&n('hr')>=120)out.push('FC ≥ 120/min');
 if(Number.isFinite(n('spo2'))&&n('spo2')<92)out.push('SpO₂ < 92 %');
 for(const s of mesure.signes||[])out.push(s);
 return out;
}
const SIGNES_EIR=['Frissons','Urticaire / prurit','Dyspnée','Douleur lombaire ou thoracique','Malaise','Urines foncées'];
const GRAVITE_EIR={1:'Grade 1 : non sévère',2:'Grade 2 : sévère',3:'Grade 3 : menace vitale immédiate',4:'Grade 4 : décès'};
// Traçabilité : devenir de chaque PSL connu et retourné à l'EFS (déclaration de destination) au plus tard 48 h après la délivrance.
function tracabilite(poches,maintenant){return (poches||[]).map(p=>{const fait=!!p.devenir;const delai=p.reception?heures(p.reception,maintenant):0;return {...p,devenirConnu:fait,retard:!fait&&delai>48,delaiH:Math.round(delai)}})}

/* =====================================================================
   6. Événements indésirables (EI) et revues de morbi-mortalité (RMM).
   Repères : décret 2016-1606 (EIGS), art. R1413-67 et suivants CSP, HAS (RMM, méthode ALARM).
   ===================================================================== */
const CATEGORIES_EI={identito:'Identitovigilance',medicament:'Médicament (erreur, effet indésirable)',chute:'Chute',infection:'Infection associée aux soins',bloc:'Bloc opératoire / anesthésie',materiel:'Matériel, dispositif médical (matériovigilance)',transfusion:'Transfusion (hémovigilance)',organisation:'Organisation, communication',escarre:'Escarre',agression:'Violence, agression',autre:'Autre'};
const GRAVITE_EI={1:'Mineure',2:'Significative',3:'Majeure',4:'Critique',5:'Catastrophique'};
const STATUTS_EI={declare:'Déclaré',analyse:'En analyse',actions:'Actions en cours',clos:'Clos'};
const CAUSES_ALARM={patient:'Patient (état de santé, antécédents)',taches:'Tâches (protocoles, résultats d’examens)',individu:'Individu (connaissances, compétences)',equipe:'Équipe (communication, supervision)',environnement:'Environnement (charge, locaux, matériel)',organisation:'Organisation et management',contexte:'Contexte institutionnel'};
// EIGS : décès, mise en jeu du pronostic vital, déficit fonctionnel permanent probable → ARS sans délai (volet 1), analyse sous 3 mois (volet 2).
function eigs(ei){return ['deces','pronostic','deficit'].includes(ei?.consequence)}
function echeancesEi(ei){const out=[];if(!ei?.date)return out;
 if(eigs(ei)){out.push({cle:'ars1',label:'Déclaration de l’EIGS à l’ARS (volet 1, sans délai)',echeance:ei.declareLe||ei.date,fait:!!ei.arsVolet1});out.push({cle:'ars2',label:'Analyse approfondie transmise à l’ARS (volet 2)',echeance:new Date(Date.parse(ei.date)+90*86400000).toISOString(),fait:!!ei.arsVolet2})}
 if(ei.categorie==='transfusion')out.push({cle:'hemo',label:'Déclaration au correspondant d’hémovigilance (e-FIT) sous 48 h',echeance:new Date(Date.parse(ei.date)+48*3600000).toISOString(),fait:!!ei.efit});
 if(ei.categorie==='materiel')out.push({cle:'ansm',label:'Signalement de matériovigilance (ANSM) si incident grave',echeance:ei.date,fait:!!ei.ansm});
 if(ei.categorie==='medicament')out.push({cle:'crpv',label:'Déclaration de pharmacovigilance (CRPV) si effet grave ou inattendu',echeance:ei.date,fait:!!ei.crpv});
 return out}
function erreurEi(d){
 if(!CATEGORIES_EI[d.categorie])return 'Choisissez une catégorie.';
 if(!GRAVITE_EI[d.gravite])return 'Indiquez la gravité.';
 if(!/^\d{4}-\d{2}-\d{2}/.test(t(d.date)))return 'Indiquez la date de l’événement.';
 if(t(d.description).length<10)return 'Décrivez ce qui s’est passé (10 caractères au moins).';
 if(t(d.description).length>6000)return 'Description trop longue.';
 if(!['aucune','temporaire','prolongation','deficit','pronostic','deces'].includes(d.consequence))return 'Indiquez la conséquence pour le patient.';
 return '';
}
const SUIVANT_EI={declare:['analyse','clos'],analyse:['actions','clos'],actions:['clos'],clos:['analyse']};
function transitionEi(de,vers,ei){if(!(SUIVANT_EI[de]||[]).includes(vers))return 'Passage de « '+(STATUTS_EI[de]||de)+' » à « '+(STATUTS_EI[vers]||vers)+' » impossible.';
 if(vers==='clos'&&eigs(ei)&&(!ei.arsVolet1||!ei.arsVolet2))return 'EIGS : les deux volets de la déclaration à l’ARS doivent être faits avant la clôture.';
 if(vers==='clos'&&(ei.actions||[]).some(a=>!a.fait))return 'Des actions correctives restent ouvertes.';
 return ''}

/* =====================================================================
   7. Agenda de consultation d'anesthésie.
   Repère : art. D6124-92 CSP (consultation plusieurs jours avant l'intervention, sauf urgence ; visite pré-anesthésique
   dans les heures qui précèdent).
   ===================================================================== */
const DELAI_MIN_CPA_JOURS=2;
function creneaux(plage){
 const out=[],d=Number(plage.duree)||20;if(!/^\d{2}:\d{2}$/.test(plage.debut||'')||!/^\d{2}:\d{2}$/.test(plage.fin||'')||d<5)return out;
 const m=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
 for(let x=m(plage.debut);x+d<=m(plage.fin);x+=d)out.push({plage:plage.id,date:plage.date,heure:String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0'),duree:d,medecin:plage.medecin,medecinNom:plage.medecinNom,lieu:plage.lieu||'',mode:plage.mode||'presentiel'});
 return out;
}
function libres(plages,rdvs){const pris=new Set((rdvs||[]).filter(r=>r.statut!=='annule').map(r=>r.plage+'|'+r.heure));return (plages||[]).filter(p=>p.statut!=='fermee').flatMap(creneaux).filter(c=>!pris.has(c.plage+'|'+c.heure))}
function erreurPlage(p,existantes){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))return 'Date invalide.';
 if(!/^\d{2}:\d{2}$/.test(p.debut||'')||!/^\d{2}:\d{2}$/.test(p.fin||'')||p.fin<=p.debut)return 'Horaires invalides.';
 if(![10,15,20,30,45,60].includes(Number(p.duree)))return 'Durée de créneau : 10, 15, 20, 30, 45 ou 60 minutes.';
 const conflit=(existantes||[]).find(x=>x.id!==p.id&&x.statut!=='fermee'&&x.medecin===p.medecin&&x.date===p.date&&x.debut<p.fin&&p.debut<x.fin);
 if(conflit)return 'Chevauchement avec une plage du même médecin ('+conflit.debut+'–'+conflit.fin+').';
 return '';
}
function alerteDelai(dateRdv,dateIntervention){if(!dateRdv||!dateIntervention)return '';const j=(Date.parse(jour(dateIntervention))-Date.parse(jour(dateRdv)))/86400000;
 if(j<0)return 'Rendez-vous après la date d’intervention.';if(j<DELAI_MIN_CPA_JOURS)return 'Consultation à moins de '+DELAI_MIN_CPA_JOURS+' jours de l’intervention : la consultation se fait plusieurs jours avant (art. D6124-92 CSP), sauf urgence.';return ''}

/* =====================================================================
   9. Honoraires des praticiens libéraux et paiements.
   Repères : art. L1111-3 CSP et arrêté du 30 mai 2018 (information écrite préalable dès 70 € de dépassement),
   participation forfaitaire de 24 € pour les actes ≥ 120 € (art. R160-16 CSS, montant à vérifier chaque année).
   ===================================================================== */
const SEUIL_DEVIS=70,SEUIL_PAV=120,MONTANT_PAV=24;
const centimes=v=>{const n=Math.round(Number(String(v).replace(',','.'))*100);return Number.isFinite(n)?n:NaN};
const euros=c=>(c/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
function calculHonoraires(lignes,{secteur='2',optam=false}={}){
 const out=(lignes||[]).map(l=>{const base=centimes(l.base),demande=centimes(l.demande??l.base);return {code:t(l.code),libelle:t(l.libelle),base,demande,depassement:Math.max(0,demande-base)}});
 if(out.some(l=>!Number.isFinite(l.base)||!Number.isFinite(l.demande)||l.base<0||l.demande<0))return {erreur:'Montant invalide.'};
 const base=out.reduce((s,l)=>s+l.base,0),total=out.reduce((s,l)=>s+l.demande,0),depassement=out.reduce((s,l)=>s+l.depassement,0);
 const alertes=[];if(secteur==='1'&&depassement>0)alertes.push('Secteur 1 : dépassement possible seulement en cas d’exigence particulière du patient (DE), à justifier.');
 if(optam&&base>0&&depassement>base)alertes.push('OPTAM : dépassement supérieur à 100 % de la base de remboursement, au-delà de l’engagement habituel.');
 const pav=out.some(l=>l.base>=SEUIL_PAV*100)?MONTANT_PAV*100:0;
 return {lignes:out,base,total,depassement,devisObligatoire:depassement>=SEUIL_DEVIS*100,pav,alertes};
}
const STATUTS_DEVIS={brouillon:'Brouillon',envoye:'Envoyé au patient',signe:'Signé par le patient',refuse:'Refusé',annule:'Annulé'};
const STATUTS_PAIEMENT={'a-payer':'À payer',lien:'Lien envoyé',paye:'Payé',rembourse:'Remboursé',annule:'Annulé',echec:'Échec'};

/* =====================================================================
   10a. Stérilisation des dispositifs médicaux réutilisables (boîtes d'instruments).
   Repères : BPPH 2023 (bonnes pratiques de pharmacie hospitalière, chap. stérilisation), instruction DGS/RI3 2011-449 (ATNC).
   ===================================================================== */
const ETATS_BOITE={sale:'Sale (retour du bloc)',lavage:'En lavage',conditionnee:'Conditionnée',sterile:'Stérile (libérée)',utilisee:'Utilisée',quarantaine:'Quarantaine (risque ATNC)',reforme:'Réformée'};
const PEREMPTION_JOURS={conteneur:180,double_sachet:90,feuille:30};
function liberationCycle(c){const e=[];if(c.programme&&!/134/.test(c.programme)&&!c.programmeValide)e.push('Programme non standard : 134 °C 18 min attendu pour les instruments (sauf DM thermosensibles).');
 if(c.bowieDick!=='conforme')e.push('Test de Bowie-Dick du jour non conforme ou non fait.');if(c.indicateur!=='conforme')e.push('Indicateur de passage / intégrateur non conforme.');if(c.enregistrement!=='conforme')e.push('Enregistrement des paramètres (température, pression, durée) non conforme.');if(c.siccite!=='conforme')e.push('Charge humide : non libérable.');return e}
function etatBoite(b,maintenant){
 if(b.etat==='sterile'&&b.peremption&&Date.parse(b.peremption)<Date.parse(maintenant))return {code:'perimee',label:'Stérilité périmée',utilisable:false};
 return {code:b.etat,label:ETATS_BOITE[b.etat]||b.etat,utilisable:b.etat==='sterile'};
}
function peremption(conditionnement,dateCycle){const j=PEREMPTION_JOURS[conditionnement];return j&&dateCycle?new Date(Date.parse(dateCycle)+j*86400000).toISOString().slice(0,10):''}
// Patient à risque ATNC (Creutzfeldt-Jakob) : instruments en quarantaine, procédure spécifique (inactivation, séquestration).
function risqueAtnc(f){return !!(f&&(f.cjd||f.hormoneCroissance||f.greffeDureMere||f.familialCJD))}

/* =====================================================================
   10b. Brancardage (transports internes).
   ===================================================================== */
const ETATS_TRANSPORT={demande:'Demandé',pris:'Pris en charge',parti:'En route',arrive:'Arrivé',annule:'Annulé'};
const SUIVANT_TRANSPORT={demande:['pris','annule'],pris:['parti','annule','demande'],parti:['arrive'],arrive:[],annule:[]};
const PRIORITES={urgent:'Urgent (< 10 min)',programme:'Programmé',normal:'Dans l’heure'};
function retardTransport(d,maintenant){if(['arrive','annule'].includes(d.etat))return 0;const ref=d.heureSouhaitee||d.at;const lim={urgent:10,normal:60,programme:15}[d.priorite]||60;const min=(Date.parse(maintenant)-Date.parse(ref))/60000;return min>lim?Math.round(min-lim):0}

/* =====================================================================
   10c. Planning des équipes (bloc, SSPI, gardes et astreintes).
   Repères : art. D6124-97 et suivants CSP (SSPI), décret 94-1050 (anesthésie).
   ===================================================================== */
const FONCTIONS={anesthesiste:'Anesthésiste',iade:'IADE',ibode:'IBODE',ide_bloc:'IDE de bloc',ide_sspi:'IDE de SSPI',aide_soignant:'Aide-soignant(e)',brancardier:'Brancardier',chirurgien:'Chirurgien',garde_anesth:'Garde d’anesthésie',astreinte_anesth:'Astreinte d’anesthésie',astreinte_chir:'Astreinte de chirurgie',ide_etage:'IDE d’étage'};
function chevauchements(affectations){const out=[];const a=(affectations||[]).filter(x=>x.personne&&x.debut&&x.fin);
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i],y=a[j];if(t(x.personne).toLowerCase()!==t(y.personne).toLowerCase()||x.date!==y.date)continue;
  if(['garde_anesth','astreinte_anesth','astreinte_chir'].includes(x.fonction)||['garde_anesth','astreinte_anesth','astreinte_chir'].includes(y.fonction))continue;
  if(x.debut<y.fin&&y.debut<x.fin)out.push({personne:x.personne,a:x.id,b:y.id,motif:x.personne+' affecté(e) deux fois ('+x.debut+'–'+x.fin+' et '+y.debut+'–'+y.fin+').'})}
 return out}
// Couverture d'une journée : chaque salle ouverte a un anesthésiste et un(e) infirmier(ère) ; la SSPI a au moins un IDE ;
// une garde ou une astreinte d'anesthésie assure la continuité la nuit.
function couverture(date,salles,affectations){
 const jourA=(affectations||[]).filter(a=>a.date===date),manques=[];
 for(const s of salles||[]){const ici=jourA.filter(a=>a.salle===s.id);
  if(!ici.some(a=>a.fonction==='anesthesiste'))manques.push(s.label+' : pas d’anesthésiste affecté');
  if(!ici.some(a=>['iade','ibode','ide_bloc'].includes(a.fonction)))manques.push(s.label+' : pas d’infirmier(ère) de bloc ni d’IADE');}
 if((salles||[]).length&&!jourA.some(a=>a.fonction==='ide_sspi'))manques.push('SSPI : aucun IDE affecté');
 if(!jourA.some(a=>['garde_anesth','astreinte_anesth'].includes(a.fonction)))manques.push('Nuit : pas de garde ni d’astreinte d’anesthésie');
 const parAnesth={};for(const a of jourA.filter(a=>a.fonction==='anesthesiste'&&a.salle))(parAnesth[t(a.personne).toLowerCase()]??=new Set()).add(a.salle);
 for(const [p,set] of Object.entries(parAnesth))if(set.size>2)manques.push('Un anesthésiste couvre '+set.size+' salles en même temps ('+p+') : au-delà de deux, organisation à justifier.');
 return manques;
}

/* =====================================================================
   10d. Messagerie entre soignants.
   ===================================================================== */
function erreurMessage(m){if(t(m.texte).length<1)return 'Message vide.';if(t(m.texte).length>4000)return 'Message trop long (4 000 caractères au plus).';if(!/^(sejour:[^/]{1,80}|equipe:(bloc|etage|anesthesie|tous))$/.test(t(m.fil)))return 'Fil de discussion invalide.';return ''}
function nonLus(messages,userId){return (messages||[]).filter(m=>m.auteurId!==userId&&!(m.lus||[]).includes(userId)).length}
function mentions(texteMsg,personnes){const s=norm(texteMsg);return (personnes||[]).filter(p=>p.nom&&s.includes('@'+norm(p.nom).split(' ').pop())).map(p=>p.id)}

/* =====================================================================
   8. Assistant de consultation : extraction de propositions depuis la transcription d'une dictée ou d'un échange.
   Rien n'est reporté sans validation, champ par champ, par l'anesthésiste.
   ===================================================================== */
const MOTS_NOMBRES={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10};
function nombre(s){const x=t(s).replace(',','.');return MOTS_NOMBRES[norm(x)]??(Number.isFinite(Number(x))?Number(x):null)}
function extraireConsultation(transcription){
 const s=' '+t(transcription).replace(/\s+/g,' ')+' ',n=norm(s),out=[];
 const push=(champ,valeur,source,mode='remplacer')=>{if(valeur!==''&&valeur!==null&&valeur!==undefined&&!out.some(o=>o.champ===champ))out.push({champ,valeur,source:t(source).slice(0,160),mode})};
 let m;
 if((m=s.match(/(?:p[eè]se|poids\s*(?:de|:|est de)?)\s*(\d{2,3}(?:[,.]\d)?)\s*(?:kg|kilos?)/i)))push('poids',Number(m[1].replace(',','.')),m[0])
 else if((m=s.match(/(?<![\d/])(\d{2,3}(?:[,.]\d)?)\s*(?:kg|kilos?)\b(?!\s*\/)/i))&&Number(m[1].replace(',','.'))>=20)push('poids',Number(m[1].replace(',','.')),m[0]);
 if((m=s.match(/(?:mesure|taille\s*(?:de|:)?)\s*(1)\s*(?:m(?:[eè]tre)?s?)\s*(\d{2})/i)))push('taille',Number(m[1])*100+Number(m[2]),m[0]);
 else if((m=s.match(/taille\s*(?:de|:)?\s*(\d{3})\s*(?:cm|centim)/i)))push('taille',Number(m[1]),m[0]);
 else if((m=s.match(/(?<![\d,.])(1)[,.](\d{2})\s*m\b/i)))push('taille',100+Number(m[2]),m[0]);
 else if((m=s.match(/(?<![\d,.])(1\d{2})\s*cm\b/i)))push('taille',Number(m[1]),m[0]);
 if((m=s.match(/(?:fr[eé]quence cardiaque|fc|pouls)\s*(?:[aà]|de|:)?\s*(\d{2,3})/i)))push('fc',Number(m[1]),m[0]);
 if((m=s.match(/(?:tension|pression art[eé]rielle|ta|pa)\s*(?:[aà]|de|:)?\s*(\d{2,3})\s*(?:\/|sur)\s*(\d{2,3})/i)))push('pa_art',m[1]+'/'+m[2],m[0]);
 if((m=s.match(/(?:saturation|spo2|sat)\s*(?:[aà]|de|:)?\s*(\d{2,3})\s*(?:%|pour ?cent)?/i))&&Number(m[1])<=100)push('spo2',Number(m[1]),m[0]);
 if((m=n.match(/mallampati\s*(?:de|:|classe)?\s*(1|2|3|4|i{1,3}|iv|un|deux|trois|quatre)\b/))){const v={1:'I',2:'II',3:'III',4:'IV',i:'I',ii:'II',iii:'III',iv:'IV',un:'I',deux:'II',trois:'III',quatre:'IV'}[m[1]];push('mallampati',v,m[0])}
 if((m=n.match(/\basa\s*(?:de|:|classe)?\s*(1|2|3|4|5|un|deux|trois|quatre|cinq)\b/))){const v=nombre(m[1]);if(v)push('asa','ASA '+v,m[0])}
 if(/pas d.allergie|aucune allergie|sans allergie|allergie\s*:?\s*aucune/.test(n))push('allergie_statut','Aucune allergie connue','aucune allergie');
 else if((m=s.match(/allergi(?:e|que)s?\s*(?:[aà]|au|aux|:)\s*([^.;]{3,120})/i)))push('allergie_detail',m[1].trim().replace(/^(?:la|le|les)\s+|^l['’]\s*/i,''),m[0],'ajouter');
 if((m=s.match(/(?:traitement habituel|traitements?|sous|prend)\s*:?\s*((?:\p{L}[\p{L}\d-]+\s+\d+(?:[,.]\d+)?\s*(?:mg|µg|ui|g)(?![\p{L}])[^.;]*?)(?:[.;]|$))/iu)))push('ttt_habituel',m[1].trim().replace(/[.;]$/,''),m[0],'ajouter');
 if((m=s.match(/ant[eé]c[eé]dents?\s*(?:m[eé]dicaux)?\s*:?\s*([^.;]{3,200})/i))&&!/chirurg/i.test(m[0]))push('atcd_detail',m[1].trim(),m[0],'ajouter');
 if((m=s.match(/ant[eé]c[eé]dents? chirurgicaux\s*:?\s*([^.;]{3,200})/i)))push('atcd_chir',m[1].trim(),m[0],'ajouter');
 if((m=s.match(/(?:op[eé]r[eé]e? pour|intervention pr[eé]vue\s*:?|vient pour)\s*([^.;]{3,120})/i)))push('libelle',m[1].trim(),m[0]);
 if(/ronfle/.test(n))push('sb',['S — Ronflement fort'],'ronflement','ajouter');
 if(/apn[eé]es? (?:observ|du sommeil)/.test(n)&&!/pas d.apn/.test(n))push('sb',['O — Apnées observées'],'apnées','ajouter');
 if(/(?:fumeur|tabagisme actif|fume)\b/.test(n)&&!/(?:non fumeur|ne fume pas|ancien fumeur|sevr)/.test(n))push('autres_consignes',['Arrêt du tabac conseillé'],'tabac','ajouter');
 if(/mal des transports/.test(n))push('apfel',['Mal des transports'],'mal des transports','ajouter');
 if(/(?:moins de|<) ?4 ?met|ne monte pas deux [eé]tages|essouffl[eé] (?:au|d[eè]s le) premier [eé]tage/.test(n))push('mets','< 4 MET','capacité fonctionnelle');
 else if(/(?:monte|plus de) (?:deux|2) [eé]tages|4 met|sport r[eé]gulier/.test(n))push('mets','≥ 4 MET (2 étages sans s\'arrêter)','capacité fonctionnelle');
 if(/rachianesth/.test(n))push('technique',['Rachianesthésie'],'rachianesthésie','ajouter');
 if(/anesth[eé]sie g[eé]n[eé]rale/.test(n))push('technique',['Anesthésie générale'],'anesthésie générale','ajouter');
 if(/bloc (?:nerveux|interscal|f[eé]moral|axillaire|sciatique|p[eé]riph)/.test(n))push('technique',['Bloc nerveux périphérique'],'bloc','ajouter');
 if(/intubation difficile/.test(n)&&!/pas d.intubation difficile/.test(n))push('compl',['Intubation difficile'],'intubation difficile','ajouter');
 if(/nausees? (?:et|ou) vomissements? postop|nvpo/.test(n))push('compl',['NVPO'],'NVPO','ajouter');
 return out;
}
// Fusion d'une proposition acceptée dans les valeurs de la consultation (jamais d'écrasement d'une saisie existante non vide pour les champs uniques).
function appliquerProposition(valeurs,prop){
 const v={...valeurs},cur=v[prop.champ];
 if(Array.isArray(prop.valeur)){const set=new Set(Array.isArray(cur)?cur:cur?[cur]:[]);prop.valeur.forEach(x=>set.add(x));v[prop.champ]=[...set];return {valeurs:v,applique:true}}
 if(prop.mode==='ajouter'&&typeof cur==='string'&&cur.trim()){if(norm(cur).includes(norm(prop.valeur)))return {valeurs:v,applique:false};v[prop.champ]=cur.trim()+'\n'+prop.valeur;return {valeurs:v,applique:true}}
 if(cur!==undefined&&cur!==null&&String(cur).trim()!==''&&!(Array.isArray(cur)&&!cur.length))return {valeurs:v,applique:false,conflit:true};
 v[prop.champ]=prop.valeur;return {valeurs:v,applique:true};
}

/* =====================================================================
   4. Mode dégradé : contenu du classeur de secours.
   ===================================================================== */
function ficheSecours(stay){
 const i=stay.identity||{},c=stay.consult||{},cpa=c.cpa||{};
 const allergies=cpa.allergie_statut==='Aucune allergie connue'?'Aucune allergie connue':[...(cpa.allergenes||[]),cpa.allergie_detail].filter(Boolean).join(', ')||t(c.allergies)||'À vérifier';
 return {id:stay.id,nom:t(i.lastName).toUpperCase(),prenom:t(i.firstName),naissance:t(i.birthDate),sexe:t(i.sex),ins:t(i.ins),etape:t(stay.stage),mode:t(stay.mode),specialite:t(stay.specialty),
  intervention:t(cpa.libelle||stay.surgicalAnnouncement?.published?.fields?.procedure||''),dateIntervention:t(cpa.date_interv||stay.surgicalAnnouncement?.published?.fields?.date||''),cote:t(cpa.cote||''),
  asa:t(cpa.asa||c.asa||''),allergies,traitements:t(cpa.ttt_habituel||c.treatments||''),consignes:t(cpa.ttt_consignes||''),vas:[cpa.mallampati?'Mallampati '+cpa.mallampati:'',cpa.id_prevue==='Oui'?'Intubation difficile prévue':'',cpa.strategie_vas||''].filter(Boolean).join(' · '),
  technique:[...(cpa.technique||[])].join(', '),atb:[...(cpa.atb||[])].join(', '),transfusion:t(cpa.transfusion||''),
  prescriptions:(stay.rx||[]).filter(r=>r&&r.status!=='Arrêtée'&&r.status!=='Annulée').slice(0,30).map(r=>[r.drug||r.name||r.label,r.dose,r.route,r.frequency].filter(Boolean).join(' · '))};
}
function erreurSecret(s){s=String(s||'');if(s.length<12)return 'Phrase de secours : 12 caractères au moins.';if(!/[a-zA-Z]/.test(s)||!/[0-9\W]/.test(s))return 'Mélangez lettres et chiffres ou symboles.';return ''}

return {norm,TYPES_COURRIER,classerCourrier,identiteCourrier,
 GROUPES,PSL,ABO_GLOBULES,ABO_PLASMA,parseGroupe,groupeValide,raiValide,compatible,CUPT,controleUltime,alertesSurveillance,SIGNES_EIR,GRAVITE_EIR,tracabilite,
 CATEGORIES_EI,GRAVITE_EI,STATUTS_EI,CAUSES_ALARM,eigs,echeancesEi,erreurEi,transitionEi,
 DELAI_MIN_CPA_JOURS,creneaux,libres,erreurPlage,alerteDelai,
 SEUIL_DEVIS,SEUIL_PAV,MONTANT_PAV,centimes,euros,calculHonoraires,STATUTS_DEVIS,STATUTS_PAIEMENT,
 ETATS_BOITE,PEREMPTION_JOURS,liberationCycle,etatBoite,peremption,risqueAtnc,
 ETATS_TRANSPORT,SUIVANT_TRANSPORT,PRIORITES,retardTransport,
 FONCTIONS,chevauchements,couverture,
 erreurMessage,nonLus,mentions,
 extraireConsultation,appliquerProposition,
 ficheSecours,erreurSecret};
});

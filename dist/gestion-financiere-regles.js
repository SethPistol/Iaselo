/* IASELO · suite autonome de gestion médico-économique (25/11/2026) : règles pures, sans réseau,
   testées dans tests/gestion-financiere.test.cjs, utilisées par l'écran et par le serveur.
   - Tarifs GHS de l'année (arrêté tarifaire ex-OQN) importés depuis un tableau : tarif, bornes, journée EXH ;
   - répartition d'un séjour entre débiteurs : Assurance maladie obligatoire (AMO), complémentaire (AMC), patient ;
   - numérotation continue des factures et des avoirs, balance âgée des créances, export comptable ;
   - contrôles qualité du DIM sur le mois (cohérence âge / sexe / diagnostic, exhaustivité, délais) ;
   - fichier RSS (RUM) au format ATIH pour le logiciel de groupage gratuit de l'ATIH (GENRSA) puis e-PMSI.
   Rien ici ne remplace un agrément : la télétransmission B2 et le tiers payant ROC exigent un logiciel autorisé. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloGestionFin=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const t=v=>v===undefined||v===null?'':String(v).trim();
const num=v=>{if(v===undefined||v===null||v==='')return null;const n=Number(String(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:null};
const arrondi=v=>Math.round((v+Number.EPSILON)*100)/100;
const JOUR=86400000;

/* ---------- Tarifs GHS ---------- */
// Tableau collé (CSV ; , ou tabulation) : GHS, tarif, borne basse, borne haute, tarif d'une journée EXH. En-tête facultatif.
function lireTarifs(texte){
 const lignes=String(texte||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean),out={},erreurs=[];
 for(const [i,l] of lignes.entries()){
  const c=(/[;\t]/.test(l)?l.split(/[;\t]/):l.split(',')).map(x=>x.replace(/^"|"$/g,'').trim());
  if(!/^\d{1,4}$/.test(c[0])){if(i===0)continue;erreurs.push('Ligne '+(i+1)+' : numéro de GHS attendu.');continue}
  const tarif=num(c[1]);if(!(tarif>0)){erreurs.push('Ligne '+(i+1)+' : tarif invalide.');continue}
  out[String(Number(c[0])).padStart(4,'0')]={tarif:arrondi(tarif),bb:num(c[2]),bh:num(c[3]),exh:num(c[4])};
 }
 return {tarifs:out,nombre:Object.keys(out).length,erreurs};
}
const cleGhs=g=>/^\d{1,4}$/.test(t(g))?String(Number(t(g))).padStart(4,'0'):'';
// Tarif applicable : GHS + journées au-delà de la borne haute (durée − borne haute).
function tarifSejour(table,ghs,duree){
 const l=table?.[cleGhs(ghs)];if(!l)return null;
 const exhJours=l.bh!==null&&l.bh!==undefined&&duree!==null&&duree>l.bh?duree-l.bh:0;
 return {tarif:l.tarif,exhJours,exhTarif:l.exh||0,bb:l.bb,bh:l.bh,basse:l.bb!==null&&l.bb!==undefined&&duree!==null&&duree<l.bb};
}

/* ---------- Répartition entre débiteurs ---------- */
// pf = preFacture (dist/assurance-maladie-regles.js), droits = partie droits du dossier, facture = partie facture.
function repartition(pf,droits={},facture={}){
 const assure=arrondi((pf.participation||0)+(pf.forfaitJournalier||0)+(pf.chambre||0));
 const amcActive=droits.amc==='oui'&&(!!droits.roc?.reference||droits.tiersPayantAmc===true);
 let amc=0;const detail=[];
 if(amcActive){
  const base=arrondi((pf.participation||0)+(pf.forfaitJournalier||0));amc+=base;if(base)detail.push('Participation et forfait journalier : '+base.toFixed(2)+' €');
  const plafond=num(facture.amcChambreParNuit),nuits=num(facture.chambreNuits)||0;
  if(pf.chambre&&plafond!==null){const ch=Math.min(pf.chambre,arrondi(plafond*nuits));amc+=ch;if(ch)detail.push('Chambre particulière : '+ch.toFixed(2)+' €')}
 }
 amc=arrondi(amc);
 return {amo:arrondi(pf.amo||0),amc,patient:arrondi(Math.max(0,assure-amc)),assure,amcActive,detail,
  depassementsPraticiens:arrondi(pf.depassements||0),
  note:amcActive?'Tiers payant complémentaire : la mutuelle règle sa part à la clinique.':'Sans tiers payant complémentaire : le patient règle sa part et se fait rembourser par sa mutuelle.'};
}

/* ---------- Factures ---------- */
const DEBITEURS={amo:'Assurance maladie obligatoire',amc:'Complémentaire santé',patient:'Patient'};
const MODES_REGLEMENT={noemie:'Virement Assurance maladie (NOEMIE)',roc:'Virement complémentaire (ROC)',carte:'Carte bancaire',enligne:'Paiement en ligne',cheque:'Chèque',especes:'Espèces',virement:'Virement'};
// Numérotation continue et chronologique, sans trou, par année : F2026-000001 (facture), A2026-000001 (avoir).
const numero=(type,annee,n)=>(type==='avoir'?'A':'F')+annee+'-'+String(n).padStart(6,'0');
function solde(f){const payes=(f.reglements||[]).reduce((s,r)=>s+(num(r.montant)||0),0);return arrondi((f.montant||0)-payes)}
function etatFacture(f){if(f.annulee)return 'annulee';if(f.rejet&&!f.reglements?.length)return 'rejetee';const s=solde(f);return s<=0?'soldee':s<(f.montant||0)?'partielle':'emise'}
function balanceAgee(factures,maintenant=new Date()){
 const tr={'0-30':0,'31-60':0,'61-90':0,'plus de 90':0},parDebiteur={amo:0,amc:0,patient:0};
 for(const f of factures){if(f.annulee||f.type==='avoir')continue;const s=solde(f);if(s<=0)continue;const j=Math.floor((maintenant-new Date(f.emise))/JOUR);
  tr[j<=30?'0-30':j<=60?'31-60':j<=90?'61-90':'plus de 90']+=s;parDebiteur[f.debiteur]=(parDebiteur[f.debiteur]||0)+s}
 for(const k in tr)tr[k]=arrondi(tr[k]);for(const k in parDebiteur)parDebiteur[k]=arrondi(parDebiteur[k]);
 return {tranches:tr,parDebiteur,total:arrondi(Object.values(tr).reduce((a,b)=>a+b,0))};
}
// Relance patient : 1re à 30 jours, 2e à 45 jours, mise en demeure à 60 jours (à adapter par la clinique).
function relanceDue(f,maintenant=new Date()){if(f.debiteur!=='patient'||etatFacture(f)==='soldee'||f.annulee)return null;const j=Math.floor((maintenant-new Date(f.emise))/JOUR),n=(f.relances||[]).length;
 const paliers=[30,45,60];if(n>=paliers.length||j<paliers[n])return null;return {rang:n+1,libelle:['Première relance','Deuxième relance','Mise en demeure'][n]}}
// Export comptable (journal des ventes et des encaissements), CSV ; séparateur point-virgule, montants en virgule.
const COMPTES={amo:'4111',amc:'4112',patient:'4113',produits:'706',banque:'512'};
function exportComptable(factures){
 const l=['journal;date;piece;compte;libelle;debit;credit'],m=v=>arrondi(v).toFixed(2).replace('.',',');
 const esc=s=>'"'+String(s).replace(/"/g,'""')+'"';
 for(const f of factures){const d=String(f.emise).slice(0,10),lib=esc((f.type==='avoir'?'Avoir ':'Facture ')+f.numero+' · '+DEBITEURS[f.debiteur]);
  if(f.type==='avoir'){l.push(['VT',d,f.numero,COMPTES.produits,lib,m(f.montant),''].join(';'));l.push(['VT',d,f.numero,COMPTES[f.debiteur],lib,'',m(f.montant)].join(';'))}
  else{l.push(['VT',d,f.numero,COMPTES[f.debiteur],lib,m(f.montant),''].join(';'));l.push(['VT',d,f.numero,COMPTES.produits,lib,'',m(f.montant)].join(';'))}
  for(const r of f.reglements||[]){const dr=String(r.le).slice(0,10),lr=esc('Règlement '+f.numero+' · '+(MODES_REGLEMENT[r.mode]||r.mode));l.push(['BQ',dr,f.numero,COMPTES.banque,lr,m(r.montant),''].join(';'));l.push(['BQ',dr,f.numero,COMPTES[f.debiteur],lr,'',m(r.montant)].join(';'))}}
 return l.join('\r\n')+'\r\n';
}

/* ---------- Contrôles qualité du DIM ---------- */
function age(naissance,date){const b=new Date(t(naissance)+'T12:00:00Z'),d=new Date(t(date).slice(0,10)+'T12:00:00Z');if(isNaN(b)||isNaN(d))return null;let a=d.getUTCFullYear()-b.getUTCFullYear();if(d.getUTCMonth()<b.getUTCMonth()||d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate())a--;return a}
const feminin=s=>/^(f|féminin|femme)/i.test(t(s)),masculin=s=>/^(m|masculin|homme)/i.test(t(s));
// Diagnostics incompatibles avec le sexe ou l'âge (sélection des règles les plus fréquentes, à compléter par le DIM).
function coherenceDiagnostics(codes,{sexe,naissance,entree}={}){
 const out=[],a=age(naissance,entree);
 for(const c of codes.map(x=>t(x).toUpperCase()).filter(Boolean)){
  if(masculin(sexe)&&(/^O/.test(c)||/^N7[0-7]|^N8|^N9[0-8]|^C5[1-8]|^D06|^D25|^D26|^D27/.test(c)))out.push(c+' : diagnostic féminin chez un patient de sexe masculin.');
  if(feminin(sexe)&&/^N4[0-2]|^N4[4-9]|^N5[01]|^C6[0-3]|^D29|^D40/.test(c))out.push(c+' : diagnostic masculin chez une patiente.');
  if(a!==null&&/^O/.test(c)&&(a<10||a>60))out.push(c+' : grossesse peu plausible à '+a+' ans.');
  if(a!==null&&/^P/.test(c)&&a>1)out.push(c+' : affection périnatale (chapitre P) après 1 an.');
 }
 return out;
}
// Tableau de bord du mois : séjours sortis, résumés validés, envoyés, délai moyen de validation.
function tableauDim(sejours,mois){
 const sortis=sejours.filter(s=>t(s.sortie).startsWith(mois)),valides=sortis.filter(s=>s.valide),envoyes=sortis.filter(s=>s.envoye);
 const delais=valides.map(s=>Math.round((new Date(s.valideLe)-new Date(t(s.sortie)+'T12:00:00Z'))/JOUR)).filter(n=>Number.isFinite(n)&&n>=0);
 return {sortis:sortis.length,valides:valides.length,envoyes:envoyes.length,aCoder:sortis.length-valides.length,exhaustivite:sortis.length?Math.round(valides.length/sortis.length*100):null,
  delaiMoyen:delais.length?Math.round(delais.reduce((a,b)=>a+b,0)/delais.length*10)/10:null};
}

/* ---------- RSS non groupé (RUM) au format ATIH ----------
   Disposition du format RUM 018 (notice ATIH « formats MCO applicables au 1er mars 2018 ») : partie fixe de
   177 caractères, puis les DA et DAD (8 caractères chacun), puis les zones d'actes (29 caractères chacune).
   Le numéro de format est réglable : avant le premier dépôt, le DIM vérifie la disposition de l'année en cours
   dans la notice ATIH ; le logiciel de groupage gratuit de l'ATIH (GENRSA) refuse un fichier mal formé. */
const FORMAT_RUM='018';
const gauche=(v,n)=>String(v??'').slice(0,n).padEnd(n,' ');
const droite=(v,n)=>String(v??'').slice(-n).padStart(n,'0');
const jjmmaaaa=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(t(iso));return m?m[3]+m[2]+m[1]:''};
const cimFichier=c=>t(c).toUpperCase().replace(/[^A-Z0-9+]/g,'');
function rum({finess,format=FORMAT_RUM,numeroRss,numeroAdministratif,numeroRum='1',identite={},pmsi={},actes=[],uniteMedicale='0001',codePostal=''}){
 if(!/^\d{9}$/.test(t(finess)))throw Error('FINESS invalide');
 const naissance=jjmmaaaa(identite.birthDate),entree=jjmmaaaa(pmsi.entree),sortie=jjmmaaaa(pmsi.sortie);
 if(!naissance||!entree||!sortie)throw Error('dates de naissance, d’entrée et de sortie obligatoires');
 const sexe=masculin(identite.sex)?'1':feminin(identite.sex)?'2':'';if(!sexe)throw Error('sexe du patient inconnu');
 if(!/^\d{5}$/.test(t(codePostal)))throw Error('code postal de résidence du patient manquant (5 chiffres, 99 + code pays à l’étranger)');
 if(!t(pmsi.dp))throw Error('diagnostic principal manquant');
 const das=(pmsi.das||[]).map(cimFichier).filter(Boolean).slice(0,99),za=actes.filter(a=>/^[A-Z]{4}\d{3}$/.test(t(a.code)));
 let l=gauche(finess,9)+droite(format,3)+gauche(numeroRss,20)+gauche(numeroAdministratif,20)+gauche(numeroRum,10)+naissance+sexe+gauche(uniteMedicale,4)+'  '
  +entree+t(pmsi.modeEntree).slice(0,1).padEnd(1,' ')+(t(pmsi.provenance).slice(0,1)||' ')+sortie+t(pmsi.modeSortie).slice(0,1).padEnd(1,' ')+(t(pmsi.destination).slice(0,1)||' ')
  +droite(codePostal,5)+'    '+'  '+'        '+'  '+droite(das.length,2)+'00'+droite(za.length,3)+gauche(cimFichier(pmsi.dp),8)+gauche(cimFichier(pmsi.dr),8)+'   '+' '+' '+' '+gauche('',15)+gauche('',12)+gauche('',3);
 if(l.length!==177)throw Error('partie fixe de '+l.length+' caractères au lieu de 177');
 for(const c of das)l+=gauche(c,8);
 for(const a of za)l+=(jjmmaaaa(a.date)||'        ')+gauche(t(a.code).toUpperCase(),7)+gauche(a.extensionPmsi||'',3)+String(a.phase??'0').slice(0,1)+String(a.activite||'1').slice(0,1)+(t(a.extension).slice(0,1)||' ')+gauche(t(a.modificateurs),4)+' '+' '+droite(a.realisations||1,2);
 return l;
}
// Relecture d'une ligne RUM (contrôle avant dépôt et tests).
function lireRum(l){const c=(a,b)=>l.slice(a-1,b);const nDA=Number(c(119,120)),nDAD=Number(c(121,122)),nZA=Number(c(123,125));let p=177;
 const da=[];for(let i=0;i<nDA;i++){da.push(l.slice(p,p+8).trim());p+=8}p+=8*nDAD;const actes=[];for(let i=0;i<nZA;i++){const z=l.slice(p,p+29);actes.push({date:z.slice(0,8),code:z.slice(8,15),phase:z[18],activite:z[19],extension:z[20].trim(),modificateurs:z.slice(21,25).trim(),realisations:Number(z.slice(27,29))});p+=29}
 return {finess:c(1,9),format:c(10,12),rss:c(13,32).trim(),administratif:c(33,52).trim(),naissance:c(63,70),sexe:c(71,71),um:c(72,75).trim(),entree:c(78,85),modeEntree:c(86,86),provenance:c(87,87).trim(),sortie:c(88,95),modeSortie:c(96,96),destination:c(97,97).trim(),codePostal:c(98,102),dp:c(126,133).trim(),dr:c(134,141).trim(),da,actes,longueur:l.length,attendue:177+8*(nDA+nDAD)+29*nZA}}

return {FORMAT_RUM,rum,lireRum,lireTarifs,cleGhs,tarifSejour,repartition,DEBITEURS,MODES_REGLEMENT,numero,solde,etatFacture,balanceAgee,relanceDue,COMPTES,exportComptable,age,coherenceDiagnostics,tableauDim};
});

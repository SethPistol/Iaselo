// IASELO · fiche de continuité (mode dégradé) — 27/11/2026, manque n°8 de la 3e veille (application hors ligne).
//  GET /api/workspace/continuite    séjours visibles du professionnel, opérés depuis 3 jours, prévus aujourd'hui et demain,
//                                   ou encore présents (bloc, SSPI, hospitalisation) :
//                                   identité, intervention, salle, ASA, allergies, traitements et décisions, antibioprophylaxie.
// La fiche est imprimée tant que le réseau fonctionne, pour continuer à soigner si IASELO devient indisponible
// (procédure dégradée). Rien n'est stocké sur le poste : seul le papier sert pendant la panne. Chaque impression est tracée.
import R from '../dist/espace-patient-regles.js';
import X from '../dist/redaction-ia-regles.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const PRESENTS=['Intervention','SSPI','Hospitalisation'];
const MODULES=['core','consult','surgicalAnnouncement','reservation','discharge'];
const jourParis=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now);
const decale=(jour,n)=>{const d=new Date(jour+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
async function lireTous(env,module){return new Map(((await env.DB.prepare('SELECT key,data FROM workspace_documents WHERE key LIKE ?').bind('stay/%/'+module).all()).results||[]).map(r=>{try{return [r.key.split('/')[1],JSON.parse(r.data)]}catch{return [r.key.split('/')[1],null]}}))}

export async function ficheContinuite(env,acl,now=new Date()){
 const tous=await Promise.all(MODULES.map(m=>lireTous(env,m))),par=Object.fromEntries(MODULES.map((m,i)=>[m,tous[i]]));
 const jour=jourParis(now),debut=decale(jour,-3),fin=decale(jour,1),patients=[];
 for(const [stay,core] of par.core){
  if(!core||!acl.canRead('stay/'+stay+'/core'))continue;
  const d=Object.fromEntries(MODULES.map(m=>[m,acl.canRead('stay/'+stay+'/'+m)?par[m].get(stay):null]));
  const date=R.datePrevueSejour({consult:d.consult,surgicalAnnouncement:d.surgicalAnnouncement})||String(d.reservation?.start||'').slice(0,10);
  // Patients du jour (opérés depuis 3 jours, prévus aujourd'hui ou demain) et patients encore présents (bloc, SSPI, service).
  const present=PRESENTS.includes(core.stage)&&(!date||date>=decale(jour,-30));
  if(!present&&(!date||date<debut||date>fin))continue;
  const x=X.contexte(d),id=core.identity||{};
  patients.push({stay,nom:String(id.birthName||id.lastName||'').toUpperCase(),prenom:id.firstName||'',naissance:id.birthDate||'',sexe:x.patient.sexe,
   date,mode:x.sejour.mode,specialite:x.sejour.specialite,etape:x.sejour.etape,intervention:x.intervention.libelle,lateralite:x.intervention.lateralite,chirurgien:x.intervention.chirurgien,
   salle:x.bloc.salle,debut:x.bloc.debut,asa:x.consultation.asa,allergies:x.consultation.allergies,traitements:x.consultation.traitements,antibioprophylaxie:x.consultation.antibioprophylaxie,
   technique:x.consultation.techniqueProposee,voiesAeriennes:x.consultation.voiesAeriennes,consultationValidee:x.consultation.validee,sortie:x.sortie.consignes});
 }
 patients.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.debut).localeCompare(String(b.debut))||a.nom.localeCompare(b.nom));
 return {editee:now.toISOString(),par:acl.profile?.display_name||'Professionnel',periode:{debut,fin},patients};
}

export async function staffContinuiteApi(request,env,acl){
 const url=new URL(request.url);
 if(url.pathname!=='/api/workspace/continuite')return null;
 if(request.method!=='GET')return json({error:'Méthode non prise en charge.'},405);
 if(!acl.isAdmin&&['unassigned','administration'].includes(acl.job))return json({error:'Fiche réservée aux soignants.'},403);
 const fiche=await ficheContinuite(env,acl);
 await acl.log('read','continuite','allowed','Fiche de continuité (mode dégradé)',JSON.stringify(fiche.patients.map(p=>p.stay)));
 return json(fiche);
}
